-- ReachNT database schema. PostgreSQL 16 + PostGIS + h3-pg + pgcrypto.
-- Personal information lives only in schema `pii`, encrypted. Operations run on house_id + H3 cells.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS pii;
CREATE SCHEMA IF NOT EXISTS ops;

-- ------------------------------------------------------------------ roles
CREATE ROLE vault_reader NOLOGIN;      -- intake staff; can decrypt
CREATE ROLE coordinator NOLOGIN;       -- regional coordinator; signs decisions
CREATE ROLE tradesperson NOLOGIN;      -- contractor staff in the field
CREATE ROLE housing_officer NOLOGIN;   -- Community Housing Officer
CREATE ROLE analyst NOLOGIN;           -- ops + public, never pii
CREATE ROLE tenant NOLOGIN;            -- a tenant through a one-time code
CREATE ROLE intake_staff NOLOGIN;      -- repairs-line staff and Community Housing Officers who log reports

-- ------------------------------------------------------------------ places
CREATE TABLE ops.hub (
  hub_id      text PRIMARY KEY,                       -- 'Katherine'
  cell_r7     h3index NOT NULL,
  geom        geometry(Point, 4326) NOT NULL
);

CREATE TABLE ops.community (
  community_id   text PRIMARY KEY,                    -- 'C43'
  name           text NOT NULL,
  hub_id         text NOT NULL REFERENCES ops.hub,
  cell_r7        h3index NOT NULL,                    -- footprint
  cell_r4        h3index GENERATED ALWAYS AS (h3_cell_to_parent(cell_r7, 4)) STORED,   -- run zones
  access_band    text NOT NULL,
  closure_road   text,
  closure_months int[],                               -- from the NT road-restriction register
  has_airstrip   boolean NOT NULL DEFAULT false
);
CREATE INDEX ON ops.community (cell_r4);

CREATE TABLE ops.house (
  house_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  text REFERENCES ops.community,        -- null for hub-town houses
  hub_id        text NOT NULL REFERENCES ops.hub,
  cell_r10      h3index NOT NULL,                     -- the house, as a 76 m hexagon
  bedrooms      smallint,
  asnex_asset   text UNIQUE                           -- link to the Department's asset system
);
CREATE INDEX ON ops.house (cell_r10);

-- ------------------------------------------------------------------ the vault
CREATE TABLE pii.tenant (
  tenant_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id        uuid NOT NULL REFERENCES ops.house,
  name_enc        bytea NOT NULL,                     -- pgp_sym_encrypt(name, key)
  phone_enc       bytea,
  address_enc     bytea NOT NULL,
  language        text,                               -- for interpreter booking
  interpreter     boolean DEFAULT false,
  tenancy_end     date,
  created_at      timestamptz DEFAULT now()
);
CREATE TABLE pii.access_log (
  at         timestamptz DEFAULT now(),
  who        text DEFAULT current_user,
  tenant_id  uuid,
  purpose    text NOT NULL
);
REVOKE ALL ON SCHEMA pii FROM PUBLIC;
GRANT USAGE ON SCHEMA pii TO vault_reader;
GRANT SELECT, INSERT, UPDATE ON pii.tenant TO vault_reader;
GRANT INSERT ON pii.access_log TO vault_reader;

-- Decrypt one tenant's contact details for a stated purpose; every call is logged.
CREATE FUNCTION pii.contact(p_tenant uuid, p_purpose text, p_key text)
RETURNS TABLE(name text, phone text, address text)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO pii.access_log(tenant_id, purpose) VALUES (p_tenant, p_purpose);
  RETURN QUERY SELECT pgp_sym_decrypt(name_enc, p_key), pgp_sym_decrypt(phone_enc, p_key), pgp_sym_decrypt(address_enc, p_key)
               FROM pii.tenant WHERE tenant_id = p_tenant;
END $$;
REVOKE ALL ON FUNCTION pii.contact FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.contact TO vault_reader;

-- ------------------------------------------------------------------ work
CREATE TABLE ops.crew_member (
  crew_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  db_user     text UNIQUE NOT NULL,                   -- maps a login to a row
  hub_id      text NOT NULL REFERENCES ops.hub,
  trade       text NOT NULL,                          -- plumber, electrician, carpenter, aircon, pest, general
  employer    text NOT NULL                           -- contractor / Aboriginal Business Enterprise
);

CREATE TABLE ops.job (
  job_id        bigserial PRIMARY KEY,
  house_id      uuid NOT NULL REFERENCES ops.house,
  reported_at   timestamptz NOT NULL DEFAULT now(),
  -- How the report arrived. Recorded to book interpreters and to check fairness by channel; never an input to the score.
  channel       text NOT NULL CHECK (channel IN ('line','cho','rhmo','trade','app','counter')),
  logged_by     text NOT NULL DEFAULT current_user,
  first_contact_at timestamptz NOT NULL,              -- when the tenant first told anyone: the clock starts here, not at reported_at
  language      text,                                 -- for booking an interpreter next time
  interpreter   text CHECK (interpreter IN ('none','ais','tis','nrs','family')),   -- AIS, TIS National, National Relay Service
  report_text   text NOT NULL,                        -- what the tenant said (no names: intake strips them)
  hazard        text NOT NULL,                        -- from config/taxonomy.yaml
  category      text NOT NULL CHECK (category IN ('immediate','urgent','routine')),
  trade         text NOT NULL,
  read_by       text NOT NULL,                        -- rules, model, rules+model, person
  checked_by_person boolean NOT NULL DEFAULT false,
  vulnerable    boolean NOT NULL DEFAULT false,
  crowded       boolean NOT NULL DEFAULT false,
  repeat_report boolean NOT NULL DEFAULT false,
  made_safe_at  timestamptz,                         -- first clock: an Immediate fault made safe (4 h in FS17)
  done_at       timestamptz,                         -- second clock: properly fixed
  done_by       uuid REFERENCES ops.crew_member,
  duplicate_of  bigint REFERENCES ops.job,           -- same house and fault reported while that job was open: fixed on its visit
  repeat_of     bigint REFERENCES ops.job            -- same house and fault fixed within 90 days before: the fix may not have held
);
CREATE INDEX ON ops.job (category, done_at);

-- Need score parts are stored, so every tenant answer can show the arithmetic.
CREATE TABLE ops.job_score (
  job_id    bigint PRIMARY KEY REFERENCES ops.job,
  base int, harm int, hlp int, exposure int, repeat_pts int, ageing int,
  total int GENERATED ALWAYS AS (base + harm + hlp + exposure + repeat_pts + ageing) STORED,
  scored_at timestamptz DEFAULT now()
);

CREATE TABLE ops.trip (
  trip_id       bigserial PRIMARY KEY,
  week_start    date NOT NULL,
  crew_id       uuid NOT NULL REFERENCES ops.crew_member,
  communities   text[] NOT NULL,                      -- one community, or an H3 run zone of two
  mode          text NOT NULL CHECK (mode IN ('road','air','road-run','air-run')),
  travel_hours  numeric NOT NULL,
  travel_cost   numeric NOT NULL
);
CREATE TABLE ops.trip_job (trip_id bigint REFERENCES ops.trip, job_id bigint REFERENCES ops.job, PRIMARY KEY (trip_id, job_id));

-- One row per job per week it waited. This is what tenants are told.
CREATE TABLE ops.wait_reason (
  job_id      bigint REFERENCES ops.job,
  week_start  date,
  reason      text NOT NULL CHECK (reason IN ('cut','travel_cost','crew_full','lower_priority','no_access','parts','needs_other_trade','unsafe')),
  trip_cost   numeric,
  decision_id bigint,                                   -- the signed setting in force that week
  PRIMARY KEY (job_id, week_start)
);

-- ------------------------------------------------------------------ the ledger (append-only, hash-chained)
CREATE TABLE ops.decision (
  decision_id  bigserial PRIMARY KEY,
  hub_id       text NOT NULL REFERENCES ops.hub,
  setting      text NOT NULL,                         -- e.g. 'guarantee_0.2_h3'
  lambda       numeric NOT NULL,
  signed_role  text NOT NULL,
  signed_by    text NOT NULL DEFAULT current_user,
  reason       text NOT NULL,
  expected     jsonb NOT NULL,                        -- cost per job, waits by band, harm-days at signing
  signed_at    timestamptz NOT NULL DEFAULT now(),
  prev_hash    text,
  row_hash     text
);
CREATE FUNCTION ops.decision_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT row_hash INTO NEW.prev_hash FROM ops.decision WHERE hub_id = NEW.hub_id ORDER BY decision_id DESC LIMIT 1;
  NEW.row_hash := encode(digest(coalesce(NEW.prev_hash,'') || NEW.setting || NEW.lambda || NEW.signed_role || NEW.signed_by
                                || NEW.reason || NEW.expected::text || NEW.signed_at::text, 'sha256'), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER decision_chain BEFORE INSERT ON ops.decision FOR EACH ROW EXECUTE FUNCTION ops.decision_chain();
REVOKE UPDATE, DELETE ON ops.decision FROM PUBLIC;
GRANT INSERT, SELECT ON ops.decision TO coordinator;

-- ------------------------------------------------------------------ row-level security
-- Every visit, including the ones that missed. A job is never closed because no one was home
-- (Housing Ombudsman 2025): a no-access visit records when, and at least one thing the tradesperson tried.
CREATE TABLE ops.visit_attempt (
  visit_id    bigserial PRIMARY KEY,
  job_id      bigint NOT NULL REFERENCES ops.job,
  crew_id     uuid NOT NULL REFERENCES ops.crew_member,
  at          timestamptz NOT NULL,
  outcome     text NOT NULL CHECK (outcome IN ('done','no_one_home','cant_get_in','need_parts','needs_another_trade','unsafe')),
  actions     text[] NOT NULL DEFAULT '{}',          -- left a card, phoned the tenant, spoke to family, photo of the door
  note        text,
  photo_ref   text,                                  -- object-store key, never in the database
  tenant_told_at timestamptz,
  CHECK (outcome NOT IN ('no_one_home','cant_get_in') OR cardinality(actions) > 0)
);

-- A tenant asks a person to review how their repair was ranked (Robodebt Royal Commission rec. 17.1).
CREATE TABLE ops.review_request (
  review_id    bigserial PRIMARY KEY,
  job_id       bigint NOT NULL REFERENCES ops.job,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reason       text NOT NULL,
  due_at       timestamptz NOT NULL,                 -- 10 working days
  answered_at  timestamptz,
  answered_by  text,                                 -- role, as in the decision ledger
  outcome      text CHECK (outcome IN ('unchanged','rescored','escalated')),
  answer_text  text,                                 -- what the tenant is told, in plain words
  via          text NOT NULL DEFAULT 'tenant' CHECK (via IN ('tenant','cho','line')),   -- who recorded it for the tenant
  recorded_by  text NOT NULL DEFAULT current_user
);

-- The weekly audit: a person re-reads 1 in 20 reports the program read on its own.
CREATE TABLE ops.reader_audit (
  job_id      bigint PRIMARY KEY REFERENCES ops.job,
  week        date NOT NULL,
  checked_by  text NOT NULL,
  correct     boolean NOT NULL,
  correct_hazard text,                               -- what it should have been, when wrong
  checked_at  timestamptz NOT NULL DEFAULT now()
);

-- The standard questions, asked the same way on every channel, so a household's points do not depend on how much the
-- tenant said, in what language, or how. 'unknown' never removes points; it asks for a call-back (config/taxonomy.yaml).
CREATE TABLE ops.intake_answer (
  job_id      bigint NOT NULL REFERENCES ops.job,
  question    text NOT NULL CHECK (question IN ('danger_now','young_child','elder','health','people','before')),
  answer      text NOT NULL CHECK (answer IN ('yes','no','unknown') OR answer ~ '^[0-9]{1,2}$'),
  source      text NOT NULL CHECK (source IN ('asked','tenancy_record','job_history')),
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, question, at)
);

-- A person checked how urgent a repair is: on a call, on site, from a photo or a review. Append-only, like the ledger.
-- Raising urgency takes effect at once. Lowering a dangerous repair needs someone who spoke to the tenant or saw the
-- fault, and a reason the tenant can read. The reader (rules + model) is never a source: it cannot lower danger.
CREATE TABLE ops.urgency_check (
  check_id      bigserial PRIMARY KEY,
  job_id        bigint NOT NULL REFERENCES ops.job,
  at            timestamptz NOT NULL DEFAULT now(),
  checked_by    text NOT NULL DEFAULT current_user,
  source        text NOT NULL CHECK (source IN ('called_in','phoned','cho','rhmo','trade','photo','review')),
  from_hazard   text NOT NULL,
  to_hazard     text NOT NULL,
  from_category text NOT NULL CHECK (from_category IN ('immediate','urgent','routine')),
  to_category   text NOT NULL CHECK (to_category IN ('immediate','urgent','routine')),
  reason        text NOT NULL CHECK (length(trim(reason)) > 0),   -- shown to the tenant
  review_id     bigint REFERENCES ops.review_request,             -- when it answers a tenant's review
  CHECK (NOT (from_category = 'immediate' AND to_category <> 'immediate')
         OR source IN ('called_in','phoned','cho','rhmo','trade'))
);
REVOKE UPDATE, DELETE ON ops.urgency_check FROM PUBLIC;

-- Who goes after a visit misses (or any time): the next trip, a named crew, or open to any contractor of that trade
-- on the panel, first to accept. The job keeps its first-contact clock whatever happens here.
CREATE TABLE ops.job_offer (
  offer_id     bigserial PRIMARY KEY,
  job_id       bigint NOT NULL REFERENCES ops.job,
  at           timestamptz NOT NULL DEFAULT now(),
  decided_by   text NOT NULL DEFAULT current_user,
  mode         text NOT NULL CHECK (mode IN ('next','crew','open')),
  trade        text NOT NULL,                                     -- may differ from the job's trade ("needs another trade")
  crew_id      uuid REFERENCES ops.crew_member,                   -- for mode 'crew'
  accepted_by  uuid REFERENCES ops.crew_member,                   -- for mode 'open': the first to accept
  accepted_at  timestamptz,
  CHECK ((mode = 'crew') = (crew_id IS NOT NULL)),
  CHECK (accepted_by IS NULL OR mode = 'open')
);
-- One open offer per job at a time. Accepting is UPDATE ... SET accepted_by = me WHERE offer_id = $1 AND accepted_by IS NULL,
-- so the first tradesperson to accept gets it and the second sees 0 rows updated.
CREATE UNIQUE INDEX one_open_offer ON ops.job_offer (job_id) WHERE mode = 'open' AND accepted_by IS NULL;

-- A tenant or tradesperson says it got worse. A person calls back the same day and records an urgency_check.
CREATE TABLE ops.escalation (
  job_id      bigint NOT NULL REFERENCES ops.job,
  at          timestamptz NOT NULL DEFAULT now(),
  raised_by   text NOT NULL CHECK (raised_by IN ('tenant','tradesperson','cho')),
  note        text,
  answered_by bigint REFERENCES ops.urgency_check,
  PRIMARY KEY (job_id, at)
);

-- The tenant says whether the repair worked, themselves or through their housing officer or the repairs line.
-- "still broken" reopens the job as rework: rework points in ops.job_score, and it keeps reported_at, so its clock has
-- usually run out and the planner's deadline boost sends it on the next trip. The coordinator picks who goes back.
CREATE TABLE ops.tenant_confirmation (
  job_id      bigint NOT NULL REFERENCES ops.job,
  at          timestamptz NOT NULL DEFAULT now(),
  fixed       boolean NOT NULL,
  note        text,
  via         text NOT NULL DEFAULT 'tenant' CHECK (via IN ('tenant','cho','line')),
  recorded_by text NOT NULL DEFAULT current_user,
  PRIMARY KEY (job_id, at)
);
ALTER TABLE ops.job ADD COLUMN reopened_at timestamptz;   -- set when a confirmation says "still broken"
ALTER TABLE ops.job_score ADD COLUMN rework int NOT NULL DEFAULT 0;

-- A housing officer looks after named communities.
CREATE TABLE ops.officer_community (
  db_user      text NOT NULL,
  community_id text NOT NULL REFERENCES ops.community,
  PRIMARY KEY (db_user, community_id)
);

-- A flood, cyclone or fire declared by the coordinator over some communities. Jobs reported there are tagged; the
-- response (make-safe sweep, one team trip, surge crews from the panel) is a signed decision like the cost setting.
CREATE TABLE ops.event (
  event_id     bigserial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('flood','cyclone','fire','storm')),
  communities  text[] NOT NULL CHECK (cardinality(communities) > 0),
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  declared_by  text NOT NULL DEFAULT current_user,
  surge_crews  jsonb,                                  -- {"plumber": 2, "electrician": 2, ...} asked of the panel, and for how long
  note         text
);
ALTER TABLE ops.job ADD COLUMN event_id bigint REFERENCES ops.event;

-- Trades booked to the same community (or shared trip) in the same week travel together: one vehicle or charter.
CREATE TABLE ops.trip_share (
  share_id    bigserial PRIMARY KEY,
  week_start  date NOT NULL,
  mode        text NOT NULL,
  trip_ids    bigint[] NOT NULL CHECK (cardinality(trip_ids) >= 2),   -- one ops.trip per trade
  vehicle_cost numeric NOT NULL                                        -- paid once
);

ALTER TABLE ops.job ENABLE ROW LEVEL SECURITY;

-- A tradesperson sees jobs on their trips, and open jobs within 3 res-5 rings of a community they visit this week.
CREATE POLICY job_tradesperson ON ops.job FOR SELECT TO tradesperson USING (
  EXISTS (SELECT 1 FROM ops.trip_job tj JOIN ops.trip t USING (trip_id) JOIN ops.crew_member c USING (crew_id)
          WHERE tj.job_id = ops.job.job_id AND c.db_user = current_user)
  OR (done_at IS NULL AND EXISTS (
          SELECT 1 FROM ops.trip t JOIN ops.crew_member c USING (crew_id) JOIN ops.house h ON h.house_id = ops.job.house_id
          CROSS JOIN LATERAL unnest(t.communities) AS cm(community_id)
          JOIN ops.community k ON k.community_id = cm.community_id
          WHERE c.db_user = current_user AND t.week_start = date_trunc('week', now())::date
            AND h3_grid_distance(h3_cell_to_parent(h.cell_r10, 5), h3_cell_to_parent(k.cell_r7, 5)) <= 3))
);
CREATE POLICY job_coordinator ON ops.job FOR ALL TO coordinator USING (true);
-- A housing officer sees, and logs, jobs in their own communities only.
CREATE POLICY job_officer ON ops.job FOR ALL TO housing_officer USING (EXISTS (
  SELECT 1 FROM ops.house h JOIN ops.officer_community oc ON oc.community_id = h.community_id
  WHERE h.house_id = ops.job.house_id AND oc.db_user = current_user));
CREATE POLICY job_intake ON ops.job FOR INSERT TO intake_staff WITH CHECK (true);

-- A tradesperson also sees jobs opened to any contractor of their trade in their hub, so they can accept one.
ALTER TABLE ops.job_offer ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_open_to_trade ON ops.job_offer FOR SELECT TO tradesperson USING (
  mode = 'open' AND accepted_by IS NULL AND EXISTS (
    SELECT 1 FROM ops.crew_member c JOIN ops.job j ON j.job_id = ops.job_offer.job_id JOIN ops.house h USING (house_id)
    WHERE c.db_user = current_user AND c.trade = ops.job_offer.trade AND c.hub_id = h.hub_id));
CREATE POLICY offer_coordinator ON ops.job_offer FOR ALL TO coordinator USING (true);
CREATE POLICY job_analyst ON ops.job FOR SELECT TO analyst USING (true);

-- ------------------------------------------------------------------ public views (res 6, suppressed below 5)
CREATE VIEW public.urgent_waits_by_cell AS
SELECT h3_cell_to_parent(h.cell_r10, 6) AS cell_r6,
       count(*)                          AS urgent_jobs,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (coalesce(j.done_at, now()) - j.reported_at)) / 86400) AS p90_days
FROM ops.job j JOIN ops.house h USING (house_id)
WHERE j.category IN ('immediate','urgent')
GROUP BY 1
HAVING count(*) >= 5;

-- ------------------------------------------------------------------ useful queries
-- Run zones: community pairs in the same hub within 2 rings at res 4.
-- SELECT a.community_id, b.community_id, h3_grid_distance(a.cell_r4, b.cell_r4) AS rings
-- FROM ops.community a JOIN ops.community b ON a.hub_id = b.hub_id AND a.community_id < b.community_id
-- WHERE h3_grid_distance(a.cell_r4, b.cell_r4) <= 2;

-- "While you're there": open jobs near the community a plumber is in this week.
-- SELECT j.job_id, j.hazard, j.category FROM ops.job j JOIN ops.house h USING (house_id)
-- WHERE j.done_at IS NULL AND j.trade = 'plumber'
--   AND h3_cell_to_parent(h.cell_r10, 5) = ANY (h3_grid_disk(h3_cell_to_parent('87...'::h3index, 5), 3));
