-- ReachNT database schema. PostgreSQL 16 + PostGIS + h3-pg + pgcrypto.
-- Personal information lives only in schema `pii`, encrypted. Operations run on house_id + H3 cells.
--
-- Who is who. Every person has their own database login, made a member of one of the roles below, for example
--   CREATE ROLE "kim.n" LOGIN IN ROLE coordinator;  INSERT INTO ops.coordinator_hub VALUES ('kim.n', 'Katherine');
-- The API opens its connection as that person's login, never as the owner of the tables. Every "who" column
-- (logged_by, checked_by, recorded_by, decided_by, declared_by, signed_by, and the vault's access log) is set by a
-- trigger to session_user, the login that connected, whatever the caller sends. Row-level security is enabled and
-- FORCED on every table that holds jobs or what was done to them, so the owning role sees no rows either; only a
-- superuser or a role with BYPASSRLS (the administrator who loads this file) is exempt.
-- Append-only tables refuse UPDATE, DELETE and TRUNCATE with a trigger. A superuser can still drop a trigger: the hash
-- chain on ops.decision shows an edit afterwards, and the database's own logs show the DDL.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS pii;
CREATE SCHEMA IF NOT EXISTS ops;
REVOKE ALL ON SCHEMA pii FROM PUBLIC;
REVOKE ALL ON SCHEMA ops FROM PUBLIC;

-- ------------------------------------------------------------------ roles
CREATE ROLE vault_reader NOLOGIN;      -- intake staff who may decrypt contact details, only through pii.contact()
CREATE ROLE coordinator NOLOGIN;       -- regional coordinator: their own hub (ops.coordinator_hub); signs decisions
CREATE ROLE tradesperson NOLOGIN;      -- contractor staff in the field (ops.crew_member.db_user)
CREATE ROLE housing_officer NOLOGIN;   -- Community Housing Officer: their own communities (ops.officer_community)
CREATE ROLE analyst NOLOGIN;           -- ops + public, never pii
CREATE ROLE tenant NOLOGIN;            -- a tenant through a one-time code: their own house (ops.tenant_house)
CREATE ROLE intake_staff NOLOGIN;      -- repairs-line staff who log reports and check urgency on a call
CREATE ROLE planner NOLOGIN;           -- the weekly planning run: writes scores, wait reasons and trips
CREATE ROLE reporting NOLOGIN;         -- owns the public views (aggregated, small cells suppressed)

-- ------------------------------------------------------------------ append-only and fill-once guards
-- A log row is never edited or deleted.
CREATE FUNCTION ops.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is append-only: % refused', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
-- A row whose answer is filled in later (a review's answer, who answered an escalation, who accepted an offer): only the
-- named columns may change, only while they are all still empty, and the row is never deleted.
CREATE FUNCTION ops.fill_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION '%.%: % refused', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION '%.%: only % may be filled in', TG_TABLE_SCHEMA, TG_TABLE_NAME, array_to_string(TG_ARGV, ', ') USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_strip_nulls(to_jsonb(OLD)) ?| TG_ARGV THEN
    RAISE EXCEPTION '%.%: already answered', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
-- Records who did it as the login that connected, whatever the caller sent. TG_ARGV[0] names the column.
CREATE FUNCTION ops.stamp_who() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0], session_user));
  RETURN NEW;
END $$;

-- ------------------------------------------------------------------ places
CREATE TABLE ops.hub (
  hub_id      text PRIMARY KEY,                       -- 'Katherine'
  cell_r7     h3index NOT NULL,
  geom        geometry(Point, 4326) NOT NULL
);

CREATE TABLE ops.community (
  community_id   text PRIMARY KEY CHECK (community_id ~ '^C[0-9]{2,3}$'),   -- 'C43'
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

-- Who covers what. These map a person's login to the jobs row-level security lets them see.
CREATE TABLE ops.coordinator_hub (
  db_user  text NOT NULL,
  hub_id   text NOT NULL REFERENCES ops.hub,
  PRIMARY KEY (db_user, hub_id)
);
CREATE TABLE ops.officer_community (                  -- a housing officer looks after named communities
  db_user      text NOT NULL,
  community_id text NOT NULL REFERENCES ops.community,
  PRIMARY KEY (db_user, community_id)
);
CREATE TABLE ops.tenant_house (                       -- a tenant's login (one-time code) and their house
  db_user   text NOT NULL,
  house_id  uuid NOT NULL REFERENCES ops.house,
  PRIMARY KEY (db_user, house_id)
);

-- ------------------------------------------------------------------ the fault list (config/taxonomy.yaml)
CREATE TABLE ops.hazard (
  hazard_id  text PRIMARY KEY,
  category   text NOT NULL CHECK (category IN ('immediate','urgent','routine')),
  trade      text NOT NULL CHECK (trade IN ('plumber','electrician','carpenter','aircon','pest','general')),
  lifeline   boolean NOT NULL DEFAULT false            -- params.yaml triage.lifeline_faults: Immediate for a Tier 1 household
);
-- BEGIN hazards: written by scripts/api_taxonomy.py from config/taxonomy.yaml and config/params.yaml
INSERT INTO ops.hazard (hazard_id, category, trade, lifeline) VALUES
  ('electrical_danger', 'immediate', 'electrician', false),
  ('gas_leak', 'immediate', 'plumber', false),
  ('structural_danger', 'immediate', 'carpenter', false),
  ('sewage_overflow', 'immediate', 'plumber', false),
  ('burst_pipe', 'immediate', 'plumber', false),
  ('no_water', 'urgent', 'plumber', true),
  ('no_power', 'urgent', 'electrician', true),
  ('hot_water', 'urgent', 'plumber', false),
  ('toilet_blocked', 'urgent', 'plumber', false),
  ('shower_broken', 'urgent', 'plumber', false),
  ('smoke_alarm', 'urgent', 'electrician', false),
  ('security', 'urgent', 'carpenter', false),
  ('broken_glass', 'urgent', 'carpenter', false),
  ('roof_leak', 'urgent', 'carpenter', false),
  ('damp_mould', 'urgent', 'general', false),
  ('stove_broken', 'urgent', 'electrician', false),
  ('aircon_fan', 'routine', 'aircon', true),
  ('laundry', 'routine', 'plumber', false),
  ('kitchen', 'routine', 'carpenter', false),
  ('power_point', 'routine', 'electrician', false),
  ('pests', 'routine', 'pest', false),
  ('screens_dust', 'routine', 'carpenter', false),
  ('general', 'routine', 'general', false);
-- END hazards
-- The category a fault has for a household of this tier: the same rule as catOf() in web/api/sync.js and web/app.js.
CREATE FUNCTION ops.cat_of(p_hazard text, p_tier int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_tier = 1 AND lifeline THEN 'immediate' ELSE category END FROM ops.hazard WHERE hazard_id = p_hazard
$$;

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
  at         timestamptz NOT NULL DEFAULT now(),
  who        text NOT NULL DEFAULT session_user,      -- the login that asked, not the function's owner
  tenant_id  uuid,
  purpose    text NOT NULL CHECK (length(trim(purpose)) > 0)
);
CREATE TRIGGER access_log_append_only BEFORE UPDATE OR DELETE ON pii.access_log FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();
CREATE TRIGGER access_log_no_truncate BEFORE TRUNCATE ON pii.access_log FOR EACH STATEMENT EXECUTE FUNCTION ops.refuse_change();
GRANT USAGE ON SCHEMA pii TO vault_reader;
-- A vault reader can add a tenant and correct their details, but cannot read the encrypted columns (so cannot call
-- pgp_sym_decrypt on them, even inside an UPDATE): the only way to see a name, phone or address is pii.contact(),
-- which writes the log row first. Nobody but the owner can write to or read the log directly.
GRANT SELECT (tenant_id, house_id, language, interpreter, tenancy_end, created_at) ON pii.tenant TO vault_reader;
GRANT INSERT ON pii.tenant TO vault_reader;
GRANT UPDATE (name_enc, phone_enc, address_enc, language, interpreter, tenancy_end) ON pii.tenant TO vault_reader;

-- Decrypt one tenant's contact details for a stated purpose; every call is logged with the login that made it.
-- SECURITY DEFINER runs as the owner, so current_user inside it is the owner: the log takes session_user instead.
CREATE FUNCTION pii.contact(p_tenant uuid, p_purpose text, p_key text)
RETURNS TABLE(name text, phone text, address text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pii, public, pg_temp AS $$
BEGIN
  INSERT INTO pii.access_log(who, tenant_id, purpose) VALUES (session_user, p_tenant, p_purpose);
  RETURN QUERY SELECT pgp_sym_decrypt(t.name_enc, p_key), pgp_sym_decrypt(t.phone_enc, p_key), pgp_sym_decrypt(t.address_enc, p_key)
               FROM pii.tenant t WHERE t.tenant_id = p_tenant;
END $$;
REVOKE ALL ON FUNCTION pii.contact FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pii.contact TO vault_reader;

-- ------------------------------------------------------------------ work
CREATE TABLE ops.crew_member (
  crew_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  db_user     text UNIQUE NOT NULL,                   -- maps a login to a row
  hub_id      text NOT NULL REFERENCES ops.hub,
  trade       text NOT NULL CHECK (trade IN ('plumber','electrician','carpenter','aircon','pest','general')),
  employer    text NOT NULL                           -- contractor / Aboriginal Business Enterprise
);

-- A declared flood, cyclone or fire (below) can tag jobs, so it comes first.
CREATE TABLE ops.event (
  event_id     bigserial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('flood','cyclone','fire','storm')),
  communities  text[] NOT NULL CHECK (cardinality(communities) BETWEEN 1 AND 40
                                      AND array_to_string(communities, ',') ~ '^C[0-9]{2,3}(,C[0-9]{2,3})*$'),
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  declared_by  text NOT NULL DEFAULT session_user,
  surge_crews  jsonb,                                  -- {"plumber": 2, "electrician": 2, ...} asked of the panel, and for how long
  note         text CHECK (note IS NULL OR length(note) <= 500)
);

CREATE TABLE ops.job (
  job_id        bigserial PRIMARY KEY,
  house_id      uuid NOT NULL REFERENCES ops.house,
  reported_at   timestamptz NOT NULL DEFAULT now(),
  -- How the report arrived. Recorded to book interpreters and to check fairness by channel; never an input to the score.
  channel       text NOT NULL CHECK (channel IN ('line','cho','rhmo','trade','app','counter')),
  logged_by     text NOT NULL DEFAULT session_user,
  first_contact_at timestamptz NOT NULL,              -- when the tenant first told anyone: the clock starts here, not at reported_at
  language      text CHECK (language IS NULL OR length(language) <= 60),   -- for booking an interpreter next time
  interpreter   text CHECK (interpreter IN ('none','ais','tis','nrs','family')),   -- AIS, TIS National, National Relay Service
  report_text   text NOT NULL CHECK (length(trim(report_text)) > 0 AND length(report_text) <= 1000),   -- the tenant's words (no names)
  hazard        text NOT NULL REFERENCES ops.hazard,  -- from config/taxonomy.yaml
  category      text NOT NULL CHECK (category IN ('immediate','urgent','routine')),   -- always ops.cat_of(hazard, tier)
  trade         text NOT NULL CHECK (trade IN ('plumber','electrician','carpenter','aircon','pest','general')),
  read_by       text NOT NULL,                        -- rules, model, rules+model, person
  checked_by_person boolean NOT NULL DEFAULT false,
  vulnerable    boolean NOT NULL DEFAULT false,         -- Tier 1 or Tier 2 (kept for simple filters)
  tier          smallint NOT NULL DEFAULT 3 CHECK (tier IN (1,2,3)),   -- 1 life-preservation, 2 high systemic risk, 3 none
  crowded       boolean NOT NULL DEFAULT false,
  repeat_report boolean NOT NULL DEFAULT false,
  made_safe_at  timestamptz,                         -- first clock: an Immediate fault made safe (4 h in FS17)
  done_at       timestamptz,                         -- second clock: properly fixed
  done_by       uuid REFERENCES ops.crew_member,
  duplicate_of  bigint REFERENCES ops.job,           -- same house and fault reported while that job was open: fixed on its visit
  repeat_of     bigint REFERENCES ops.job,           -- same house and fault fixed within 90 days before: the fix may not have held
  reopened_at   timestamptz,                         -- set when a confirmation says "still broken"
  event_id      bigint REFERENCES ops.event,
  -- first contact can't be after the report, nor further back than the planner's 800-day window
  CHECK (first_contact_at <= reported_at AND first_contact_at >= reported_at - interval '800 days')
);
CREATE INDEX ON ops.job (category, done_at);

-- Need score parts are stored, so every tenant answer can show the arithmetic.
CREATE TABLE ops.job_score (
  job_id    bigint PRIMARY KEY REFERENCES ops.job,
  base int, harm int, hlp int, exposure int, repeat_pts int, ageing int,
  rework    int NOT NULL DEFAULT 0,               -- a fix the tenant says didn't hold
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

-- Trades booked to the same community (or shared trip) in the same week travel together: one vehicle or charter.
CREATE TABLE ops.trip_share (
  share_id    bigserial PRIMARY KEY,
  week_start  date NOT NULL,
  mode        text NOT NULL,
  trip_ids    bigint[] NOT NULL CHECK (cardinality(trip_ids) >= 2),   -- one ops.trip per trade
  vehicle_cost numeric NOT NULL                                        -- paid once
);

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
  signed_by    text NOT NULL DEFAULT session_user,    -- forced to the signer's login by the trigger
  reason       text NOT NULL CHECK (length(trim(reason)) > 0),
  expected     jsonb NOT NULL,                        -- cost per job, waits by band, harm-days at signing
  signed_at    timestamptz NOT NULL DEFAULT now(),    -- forced to now() by the trigger: no backdating
  prev_hash    text,
  row_hash     text
);
CREATE FUNCTION ops.decision_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.signed_by := session_user;      -- the person who signs is the person signed in, never a name typed in
  NEW.signed_at := now();
  SELECT row_hash INTO NEW.prev_hash FROM ops.decision WHERE hub_id = NEW.hub_id ORDER BY decision_id DESC LIMIT 1;
  NEW.row_hash := encode(digest(coalesce(NEW.prev_hash,'') || NEW.setting || NEW.lambda || NEW.signed_role || NEW.signed_by
                                || NEW.reason || NEW.expected::text || NEW.signed_at::text, 'sha256'), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER decision_chain BEFORE INSERT ON ops.decision FOR EACH ROW EXECUTE FUNCTION ops.decision_chain();
CREATE TRIGGER decision_append_only BEFORE UPDATE OR DELETE ON ops.decision FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();
CREATE TRIGGER decision_no_truncate BEFORE TRUNCATE ON ops.decision FOR EACH STATEMENT EXECUTE FUNCTION ops.refuse_change();

-- ------------------------------------------------------------------ what was done to a job
-- Every visit, including the ones that missed. A job is never closed because no one was home
-- (Housing Ombudsman 2025): a no-access visit records when, and at least one thing the tradesperson tried.
-- Actions are the portal's four steps: 'Left a card', 'Phoned the tenant', 'Spoke to family or a neighbour',
-- 'Took a photo of the door' (stored as left_card, phoned_tenant, spoke_family, photo_of_door).
CREATE TABLE ops.visit_attempt (
  visit_id    bigserial PRIMARY KEY,
  job_id      bigint NOT NULL REFERENCES ops.job,
  crew_id     uuid NOT NULL REFERENCES ops.crew_member,
  at          timestamptz NOT NULL,                  -- when they knocked; not in the future (trigger)
  outcome     text NOT NULL CHECK (outcome IN ('done','no_one_home','cant_get_in','need_parts','needs_another_trade','unsafe')),
  actions     text[] NOT NULL DEFAULT '{}' CHECK (actions <@ ARRAY['left_card','phoned_tenant','spoke_family','photo_of_door']),
  note        text CHECK (note IS NULL OR length(note) <= 500),
  photo_ref   text,                                  -- object-store key, never in the database
  tenant_told_at timestamptz,
  CHECK (outcome NOT IN ('no_one_home','cant_get_in') OR cardinality(actions) > 0)
);
CREATE FUNCTION ops.visit_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.at > now() + interval '5 minutes' THEN       -- a phone's clock may run a few minutes fast, no more
    RAISE EXCEPTION 'a visit can''t be recorded in the future (%)', NEW.at USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_rules BEFORE INSERT ON ops.visit_attempt FOR EACH ROW EXECUTE FUNCTION ops.visit_rules();
CREATE TRIGGER visit_append_only BEFORE UPDATE OR DELETE ON ops.visit_attempt FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();

-- A tenant asks a person to review how their repair was ranked (Robodebt Royal Commission rec. 17.1).
CREATE TABLE ops.review_request (
  review_id    bigserial PRIMARY KEY,
  job_id       bigint NOT NULL REFERENCES ops.job,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reason       text NOT NULL CHECK (length(trim(reason)) > 0 AND length(reason) <= 1000),
  due_at       timestamptz NOT NULL,                 -- 10 working days
  answered_at  timestamptz,
  answered_by  text,                                 -- role, as in the decision ledger
  outcome      text CHECK (outcome IN ('unchanged','rescored','escalated')),
  answer_text  text,                                 -- what the tenant is told, in plain words
  via          text NOT NULL DEFAULT 'tenant' CHECK (via IN ('tenant','cho','line')),   -- who recorded it for the tenant
  recorded_by  text NOT NULL DEFAULT session_user
);
CREATE TRIGGER review_who BEFORE INSERT ON ops.review_request FOR EACH ROW EXECUTE FUNCTION ops.stamp_who('recorded_by');
CREATE TRIGGER review_answer_once BEFORE UPDATE OR DELETE ON ops.review_request FOR EACH ROW
  EXECUTE FUNCTION ops.fill_once('answered_at', 'answered_by', 'outcome', 'answer_text');

-- The weekly audit: a person re-reads 1 in 20 reports the program read on its own.
CREATE TABLE ops.reader_audit (
  job_id      bigint PRIMARY KEY REFERENCES ops.job,
  week        date NOT NULL,
  checked_by  text NOT NULL DEFAULT session_user,
  correct     boolean NOT NULL,
  correct_hazard text REFERENCES ops.hazard,         -- what it should have been, when wrong
  checked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER reader_audit_who BEFORE INSERT ON ops.reader_audit FOR EACH ROW EXECUTE FUNCTION ops.stamp_who('checked_by');
CREATE TRIGGER reader_audit_append_only BEFORE UPDATE OR DELETE ON ops.reader_audit FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();

-- The standard questions, asked the same way on every channel, so a household's points do not depend on how much the
-- tenant said, in what language, or how. 'unknown' never removes points; it asks for a call-back (config/taxonomy.yaml).
-- The answers allowed are the server's: yes / no / unknown, and for 'people' a count from 1 to 40 (or unknown).
CREATE TABLE ops.intake_answer (
  job_id      bigint NOT NULL REFERENCES ops.job,
  question    text NOT NULL CHECK (question IN ('danger_now','life_support','baby_elder','child_mobility','people','before')),
  answer      text NOT NULL,
  source      text NOT NULL CHECK (source IN ('asked','tenancy_record','job_history')),
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, question, at),
  CHECK (CASE WHEN question = 'people'
              THEN CASE WHEN answer ~ '^[0-9]{1,2}$' THEN answer::int BETWEEN 1 AND 40 ELSE answer = 'unknown' END
              ELSE answer IN ('yes','no','unknown') END)
);
CREATE TRIGGER intake_answer_append_only BEFORE UPDATE OR DELETE ON ops.intake_answer FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();

-- A person checked how urgent a repair is: on a call, on site, from a photo or a review. Append-only, like the ledger.
-- Raising urgency takes effect at once. Lowering a dangerous repair needs someone who spoke to the tenant or saw the
-- fault, and a reason the tenant can read. The reader (rules + model) is never a source: it cannot lower danger.
-- The check starts from the job as it is now (its fault, category and tier), never from what the caller says it was,
-- and the new category must be the new fault's category for that tier: a Tier 1 household losing power, water or
-- cooling stays Immediate, so lowering it from a photo is refused.
CREATE TABLE ops.urgency_check (
  check_id      bigserial PRIMARY KEY,
  job_id        bigint NOT NULL REFERENCES ops.job,
  at            timestamptz NOT NULL DEFAULT now(),
  checked_by    text NOT NULL DEFAULT session_user,
  source        text NOT NULL CHECK (source IN ('called_in','phoned','cho','rhmo','trade','photo','review')),
  tier          smallint NOT NULL CHECK (tier IN (1,2,3)),          -- the household's tier after the check (default: the job's)
  from_hazard   text NOT NULL REFERENCES ops.hazard,
  to_hazard     text NOT NULL REFERENCES ops.hazard,
  from_category text NOT NULL CHECK (from_category IN ('immediate','urgent','routine')),
  to_category   text NOT NULL CHECK (to_category IN ('immediate','urgent','routine')),
  reason        text NOT NULL CHECK (length(trim(reason)) > 0 AND length(reason) <= 300),   -- shown to the tenant
  review_id     bigint REFERENCES ops.review_request,             -- when it answers a tenant's review
  txid          xid8 NOT NULL DEFAULT pg_current_xact_id(),       -- lets ops.job see the check was made in its transaction
  CHECK (NOT (from_category = 'immediate' AND to_category <> 'immediate')
         OR source IN ('called_in','phoned','cho','rhmo','trade'))
);
CREATE FUNCTION ops.urgency_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j record;
BEGIN
  SELECT hazard, category, tier INTO j FROM ops.job WHERE job_id = NEW.job_id;   -- under the caller's row-level security
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job % not found, or not one of yours', NEW.job_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.from_hazard IS NOT NULL AND NEW.from_hazard <> j.hazard OR NEW.from_category IS NOT NULL AND NEW.from_category <> j.category THEN
    RAISE EXCEPTION 'the job is % (%) now, not % (%)', j.hazard, j.category, NEW.from_hazard, NEW.from_category USING ERRCODE = 'check_violation';
  END IF;
  NEW.from_hazard := j.hazard;
  NEW.from_category := j.category;
  NEW.tier := coalesce(NEW.tier, j.tier);
  IF ops.cat_of(NEW.to_hazard, NEW.tier) IS NULL THEN
    RAISE EXCEPTION 'unknown fault %: not in config/taxonomy.yaml', NEW.to_hazard USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.to_category IS NULL THEN NEW.to_category := ops.cat_of(NEW.to_hazard, NEW.tier); END IF;
  IF NEW.to_category IS DISTINCT FROM ops.cat_of(NEW.to_hazard, NEW.tier) THEN
    RAISE EXCEPTION '% is % for a Tier % household, not %', NEW.to_hazard, ops.cat_of(NEW.to_hazard, NEW.tier), NEW.tier, NEW.to_category
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.checked_by := session_user;
  NEW.txid := pg_current_xact_id();
  RETURN NEW;
END $$;
CREATE TRIGGER urgency_rules BEFORE INSERT ON ops.urgency_check FOR EACH ROW EXECUTE FUNCTION ops.urgency_rules();
CREATE TRIGGER urgency_append_only BEFORE UPDATE OR DELETE ON ops.urgency_check FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();
CREATE TRIGGER urgency_no_truncate BEFORE TRUNCATE ON ops.urgency_check FOR EACH STATEMENT EXECUTE FUNCTION ops.refuse_change();

-- A job's category is always its fault's category for its tier. Its fault or category changes only together with an
-- ops.urgency_check row written in the same transaction (same job, from and to), so nobody lowers a job by editing it.
-- The one exception: a higher tier for the same fault (for example a dialysis patient moves in) raises it at once.
CREATE FUNCTION ops.job_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN NEW.logged_by := session_user; END IF;
  IF ops.cat_of(NEW.hazard, NEW.tier) IS NULL THEN
    RAISE EXCEPTION 'unknown fault %: not in config/taxonomy.yaml', NEW.hazard USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.category IS DISTINCT FROM ops.cat_of(NEW.hazard, NEW.tier) THEN
    RAISE EXCEPTION '% is % for a Tier % household, not %', NEW.hazard, ops.cat_of(NEW.hazard, NEW.tier), NEW.tier, NEW.category
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.hazard, NEW.category) IS DISTINCT FROM (OLD.hazard, OLD.category)
     AND NOT (NEW.hazard = OLD.hazard AND NEW.tier < OLD.tier)
     AND NOT EXISTS (SELECT 1 FROM ops.urgency_check c
                     WHERE c.job_id = NEW.job_id AND c.txid = pg_current_xact_id()
                       AND c.from_hazard = OLD.hazard AND c.from_category = OLD.category
                       AND c.to_hazard = NEW.hazard AND c.to_category = NEW.category AND c.tier = NEW.tier) THEN
    RAISE EXCEPTION 'job %: changing % (%) to % (%) needs an ops.urgency_check row in the same transaction',
      NEW.job_id, OLD.hazard, OLD.category, NEW.hazard, NEW.category USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER job_rules BEFORE INSERT OR UPDATE ON ops.job FOR EACH ROW EXECUTE FUNCTION ops.job_rules();

-- Who goes after a visit misses (or any time): the next trip, a named crew, or open to any contractor of that trade
-- on the panel, first to accept. The job keeps its first-contact clock whatever happens here.
CREATE TABLE ops.job_offer (
  offer_id     bigserial PRIMARY KEY,
  job_id       bigint NOT NULL REFERENCES ops.job,
  hub_id       text NOT NULL REFERENCES ops.hub,                  -- the job's hub, filled in by the trigger
  at           timestamptz NOT NULL DEFAULT now(),
  decided_by   text NOT NULL DEFAULT session_user,
  mode         text NOT NULL CHECK (mode IN ('next','crew','open')),
  trade        text NOT NULL CHECK (trade IN ('plumber','electrician','carpenter','aircon','pest','general')),   -- may differ from the job's
  crew_id      uuid REFERENCES ops.crew_member,                   -- for mode 'crew'
  accepted_by  uuid REFERENCES ops.crew_member,                   -- for mode 'open': the first to accept
  accepted_at  timestamptz,
  CHECK ((mode = 'crew') = (crew_id IS NOT NULL)),
  CHECK (accepted_by IS NULL OR mode = 'open')
);
CREATE FUNCTION ops.offer_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT h.hub_id INTO NEW.hub_id FROM ops.job j JOIN ops.house h USING (house_id) WHERE j.job_id = NEW.job_id;
  IF NEW.hub_id IS NULL THEN
    RAISE EXCEPTION 'job % not found, or not one of yours', NEW.job_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.decided_by := session_user;
  RETURN NEW;
END $$;
CREATE TRIGGER offer_rules BEFORE INSERT ON ops.job_offer FOR EACH ROW EXECUTE FUNCTION ops.offer_rules();
-- Accepting is UPDATE ... SET accepted_by = my crew, accepted_at = now() WHERE offer_id = $1 AND accepted_by IS NULL:
-- the first tradesperson to accept gets it, the second sees 0 rows updated, and nobody can change it afterwards.
CREATE TRIGGER offer_accept_once BEFORE UPDATE OR DELETE ON ops.job_offer FOR EACH ROW
  EXECUTE FUNCTION ops.fill_once('accepted_by', 'accepted_at');
CREATE UNIQUE INDEX one_open_offer ON ops.job_offer (job_id) WHERE mode = 'open' AND accepted_by IS NULL;

-- A tenant or tradesperson says it got worse. A person calls back the same day and records an urgency_check.
CREATE TABLE ops.escalation (
  job_id      bigint NOT NULL REFERENCES ops.job,
  at          timestamptz NOT NULL DEFAULT now(),
  raised_by   text NOT NULL CHECK (raised_by IN ('tenant','tradesperson','cho')),
  note        text CHECK (note IS NULL OR length(note) <= 500),
  answered_by bigint REFERENCES ops.urgency_check,
  PRIMARY KEY (job_id, at)
);
CREATE TRIGGER escalation_answer_once BEFORE UPDATE OR DELETE ON ops.escalation FOR EACH ROW EXECUTE FUNCTION ops.fill_once('answered_by');

-- The tenant says whether the repair worked, themselves or through their housing officer or the repairs line.
-- "still broken" reopens the job as rework: rework points in ops.job_score, and it keeps reported_at, so its clock has
-- usually run out and the planner's deadline boost sends it on the next trip. The coordinator picks who goes back.
CREATE TABLE ops.tenant_confirmation (
  job_id      bigint NOT NULL REFERENCES ops.job,
  at          timestamptz NOT NULL DEFAULT now(),
  fixed       boolean NOT NULL,
  note        text CHECK (note IS NULL OR length(note) <= 500),
  via         text NOT NULL DEFAULT 'tenant' CHECK (via IN ('tenant','cho','line')),
  recorded_by text NOT NULL DEFAULT session_user,
  PRIMARY KEY (job_id, at)
);
CREATE TRIGGER confirmation_who BEFORE INSERT ON ops.tenant_confirmation FOR EACH ROW EXECUTE FUNCTION ops.stamp_who('recorded_by');
CREATE TRIGGER confirmation_append_only BEFORE UPDATE OR DELETE ON ops.tenant_confirmation FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();

-- A request for a call-back with an interpreter (the "interpreter" update): from the tenant, their housing officer,
-- the repairs line or the coordinator. The language is kept only to book the interpreter; it is never scored.
CREATE TABLE ops.interpreter_request (
  request_id     bigserial PRIMARY KEY,
  job_id         bigint NOT NULL REFERENCES ops.job,
  at             timestamptz NOT NULL DEFAULT now(),
  language       text NOT NULL CHECK (length(trim(language)) > 0 AND length(language) <= 60),
  interpreter    text NOT NULL CHECK (interpreter IN ('none','ais','tis','nrs','family')),
  note           text CHECK (note IS NULL OR length(note) <= 500),
  via            text NOT NULL DEFAULT 'tenant' CHECK (via IN ('tenant','cho','line')),
  recorded_by    text NOT NULL DEFAULT session_user,
  called_back_at timestamptz,
  called_back_by text
);
CREATE TRIGGER interpreter_who BEFORE INSERT ON ops.interpreter_request FOR EACH ROW EXECUTE FUNCTION ops.stamp_who('recorded_by');
CREATE TRIGGER interpreter_called_back_once BEFORE UPDATE OR DELETE ON ops.interpreter_request FOR EACH ROW
  EXECUTE FUNCTION ops.fill_once('called_back_at', 'called_back_by');

-- An event's communities must be real ones (the CHECK above only checks their form).
CREATE FUNCTION ops.event_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.communities) AS c(id) WHERE NOT EXISTS (SELECT 1 FROM ops.community k WHERE k.community_id = c.id)) THEN
    RAISE EXCEPTION 'unknown community in %', NEW.communities USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.declared_by := session_user;
  RETURN NEW;
END $$;
CREATE TRIGGER event_rules BEFORE INSERT ON ops.event FOR EACH ROW EXECUTE FUNCTION ops.event_rules();
CREATE TRIGGER event_no_delete BEFORE DELETE ON ops.event FOR EACH ROW EXECUTE FUNCTION ops.refuse_change();

-- ------------------------------------------------------------------ grants
GRANT USAGE ON SCHEMA ops TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff, planner, reporting;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ops TO coordinator, tradesperson, housing_officer, tenant, intake_staff, planner;
-- reference data (no personal information)
GRANT SELECT ON ops.hazard TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff, planner, reporting;
GRANT SELECT ON ops.hub, ops.community TO coordinator, tradesperson, housing_officer, analyst, intake_staff, planner, reporting;
GRANT SELECT ON ops.house TO coordinator, tradesperson, housing_officer, analyst, intake_staff, planner, reporting;
GRANT SELECT ON ops.crew_member, ops.trip, ops.trip_job, ops.trip_share TO coordinator, tradesperson, analyst, planner;
GRANT INSERT, UPDATE, DELETE ON ops.trip, ops.trip_job, ops.trip_share TO planner;
GRANT SELECT ON ops.coordinator_hub TO coordinator, analyst;
GRANT SELECT ON ops.officer_community TO housing_officer, coordinator, analyst;
GRANT SELECT ON ops.tenant_house TO tenant;
-- jobs
GRANT SELECT ON ops.job TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff, planner, reporting;
GRANT INSERT ON ops.job TO coordinator, housing_officer, intake_staff;
GRANT UPDATE ON ops.job TO coordinator;
GRANT UPDATE (hazard, category, tier, vulnerable, checked_by_person, duplicate_of) ON ops.job TO housing_officer, intake_staff;
GRANT UPDATE (made_safe_at, done_at, done_by) ON ops.job TO tradesperson;
GRANT SELECT ON ops.job_score, ops.wait_reason TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff, planner;
GRANT INSERT, UPDATE ON ops.job_score, ops.wait_reason TO planner;
-- the ledger
GRANT SELECT, INSERT ON ops.decision TO coordinator;
GRANT SELECT ON ops.decision TO analyst, planner;
-- what was done
GRANT SELECT ON ops.visit_attempt TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff;
GRANT INSERT ON ops.visit_attempt TO tradesperson;
GRANT SELECT ON ops.review_request TO coordinator, housing_officer, analyst, tenant, intake_staff;
GRANT INSERT ON ops.review_request TO tenant, housing_officer, intake_staff;
GRANT UPDATE (answered_at, answered_by, outcome, answer_text) ON ops.review_request TO coordinator;
GRANT SELECT ON ops.reader_audit TO coordinator, analyst, intake_staff;
GRANT INSERT ON ops.reader_audit TO coordinator, intake_staff;
GRANT SELECT ON ops.intake_answer TO coordinator, housing_officer, analyst, tenant, intake_staff, planner;
GRANT INSERT ON ops.intake_answer TO coordinator, housing_officer, intake_staff;
GRANT SELECT ON ops.urgency_check TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff;
GRANT INSERT ON ops.urgency_check TO coordinator, housing_officer, intake_staff;
GRANT SELECT ON ops.job_offer TO coordinator, tradesperson, analyst;
GRANT INSERT ON ops.job_offer TO coordinator;
GRANT UPDATE (accepted_by, accepted_at) ON ops.job_offer TO tradesperson;
GRANT SELECT ON ops.escalation TO coordinator, tradesperson, housing_officer, analyst, tenant, intake_staff;
GRANT INSERT ON ops.escalation TO tenant, tradesperson, housing_officer;
GRANT UPDATE (answered_by) ON ops.escalation TO coordinator, housing_officer, intake_staff;
GRANT SELECT ON ops.tenant_confirmation TO coordinator, housing_officer, analyst, tenant, intake_staff;
GRANT INSERT ON ops.tenant_confirmation TO tenant, housing_officer, intake_staff;
GRANT SELECT ON ops.event TO coordinator, tradesperson, housing_officer, analyst, intake_staff, planner;
GRANT INSERT ON ops.event TO coordinator;
GRANT SELECT ON ops.interpreter_request TO coordinator, housing_officer, analyst, tenant, intake_staff;
GRANT INSERT ON ops.interpreter_request TO coordinator, housing_officer, tenant, intake_staff;
GRANT UPDATE (called_back_at, called_back_by) ON ops.interpreter_request TO coordinator, housing_officer, intake_staff;

-- ------------------------------------------------------------------ row-level security
-- FORCE: the owning role is held to the policies too, so an API that connected as the owner would see nothing.
ALTER TABLE ops.job ENABLE ROW LEVEL SECURITY;                ALTER TABLE ops.job FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.job_score ENABLE ROW LEVEL SECURITY;          ALTER TABLE ops.job_score FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.wait_reason ENABLE ROW LEVEL SECURITY;        ALTER TABLE ops.wait_reason FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.decision ENABLE ROW LEVEL SECURITY;           ALTER TABLE ops.decision FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.visit_attempt ENABLE ROW LEVEL SECURITY;      ALTER TABLE ops.visit_attempt FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.review_request ENABLE ROW LEVEL SECURITY;     ALTER TABLE ops.review_request FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.reader_audit ENABLE ROW LEVEL SECURITY;       ALTER TABLE ops.reader_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.intake_answer ENABLE ROW LEVEL SECURITY;      ALTER TABLE ops.intake_answer FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.urgency_check ENABLE ROW LEVEL SECURITY;      ALTER TABLE ops.urgency_check FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.job_offer ENABLE ROW LEVEL SECURITY;          ALTER TABLE ops.job_offer FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.escalation ENABLE ROW LEVEL SECURITY;         ALTER TABLE ops.escalation FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.tenant_confirmation ENABLE ROW LEVEL SECURITY; ALTER TABLE ops.tenant_confirmation FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.event ENABLE ROW LEVEL SECURITY;              ALTER TABLE ops.event FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.interpreter_request ENABLE ROW LEVEL SECURITY; ALTER TABLE ops.interpreter_request FORCE ROW LEVEL SECURITY;
ALTER TABLE ops.tenant_house ENABLE ROW LEVEL SECURITY;       ALTER TABLE ops.tenant_house FORCE ROW LEVEL SECURITY;

-- Jobs. Everything else about a job is visible exactly when the job is (the policies below ask ops.job, under the
-- reader's own policies).
CREATE POLICY job_coordinator ON ops.job FOR ALL TO coordinator   -- their own hub only
  USING (EXISTS (SELECT 1 FROM ops.house h JOIN ops.coordinator_hub ch ON ch.hub_id = h.hub_id
                 WHERE h.house_id = ops.job.house_id AND ch.db_user = current_user))
  WITH CHECK (EXISTS (SELECT 1 FROM ops.house h JOIN ops.coordinator_hub ch ON ch.hub_id = h.hub_id
                      WHERE h.house_id = ops.job.house_id AND ch.db_user = current_user));
CREATE POLICY job_officer ON ops.job FOR ALL TO housing_officer   -- jobs in their own communities only
  USING (EXISTS (SELECT 1 FROM ops.house h JOIN ops.officer_community oc ON oc.community_id = h.community_id
                 WHERE h.house_id = ops.job.house_id AND oc.db_user = current_user))
  WITH CHECK (EXISTS (SELECT 1 FROM ops.house h JOIN ops.officer_community oc ON oc.community_id = h.community_id
                      WHERE h.house_id = ops.job.house_id AND oc.db_user = current_user));
-- The repairs line takes calls about any job in the Territory.
CREATE POLICY job_intake_read ON ops.job FOR SELECT TO intake_staff USING (true);
CREATE POLICY job_intake_insert ON ops.job FOR INSERT TO intake_staff WITH CHECK (true);
CREATE POLICY job_intake_update ON ops.job FOR UPDATE TO intake_staff USING (true) WITH CHECK (true);
CREATE POLICY job_tenant ON ops.job FOR SELECT TO tenant
  USING (house_id IN (SELECT th.house_id FROM ops.tenant_house th WHERE th.db_user = current_user));
CREATE POLICY job_read_all ON ops.job FOR SELECT TO analyst, planner, reporting USING (true);
-- A tradesperson sees jobs on their trips, open jobs within 3 res-5 rings of a community they visit this week, and
-- jobs with an offer they can see (open to their trade in their hub, or one they accepted). They update only the jobs
-- on their own trips, and only the made-safe and done columns (column grants above).
CREATE POLICY job_tradesperson ON ops.job FOR SELECT TO tradesperson USING (
  EXISTS (SELECT 1 FROM ops.trip_job tj JOIN ops.trip t USING (trip_id) JOIN ops.crew_member c USING (crew_id)
          WHERE tj.job_id = ops.job.job_id AND c.db_user = current_user)
  OR (done_at IS NULL AND EXISTS (
          SELECT 1 FROM ops.trip t JOIN ops.crew_member c USING (crew_id) JOIN ops.house h ON h.house_id = ops.job.house_id
          CROSS JOIN LATERAL unnest(t.communities) AS cm(community_id)
          JOIN ops.community k ON k.community_id = cm.community_id
          WHERE c.db_user = current_user AND t.week_start = date_trunc('week', now())::date
            AND h3_grid_distance(h3_cell_to_parent(h.cell_r10, 5), h3_cell_to_parent(k.cell_r7, 5)) <= 3))
  OR EXISTS (SELECT 1 FROM ops.job_offer o WHERE o.job_id = ops.job.job_id)
);
CREATE POLICY job_tradesperson_update ON ops.job FOR UPDATE TO tradesperson USING (
  EXISTS (SELECT 1 FROM ops.trip_job tj JOIN ops.trip t USING (trip_id) JOIN ops.crew_member c USING (crew_id)
          WHERE tj.job_id = ops.job.job_id AND c.db_user = current_user));

-- Tables keyed by job: anyone granted SELECT sees the rows of the jobs they can see.
CREATE POLICY score_see ON ops.job_score FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.job_score.job_id));
CREATE POLICY score_planner ON ops.job_score FOR ALL TO planner USING (true) WITH CHECK (true);
CREATE POLICY wait_see ON ops.wait_reason FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.wait_reason.job_id));
CREATE POLICY wait_planner ON ops.wait_reason FOR ALL TO planner USING (true) WITH CHECK (true);
CREATE POLICY visit_see ON ops.visit_attempt FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.visit_attempt.job_id));
CREATE POLICY visit_tradesperson ON ops.visit_attempt FOR INSERT TO tradesperson WITH CHECK (
  crew_id IN (SELECT c.crew_id FROM ops.crew_member c WHERE c.db_user = current_user)
  AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.visit_attempt.job_id));
CREATE POLICY review_see ON ops.review_request FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.review_request.job_id));
CREATE POLICY review_tenant ON ops.review_request FOR INSERT TO tenant
  WITH CHECK (via = 'tenant' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.review_request.job_id));
CREATE POLICY review_officer ON ops.review_request FOR INSERT TO housing_officer
  WITH CHECK (via = 'cho' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.review_request.job_id));
CREATE POLICY review_line ON ops.review_request FOR INSERT TO intake_staff
  WITH CHECK (via = 'line' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.review_request.job_id));
CREATE POLICY review_answer ON ops.review_request FOR UPDATE TO coordinator
  USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.review_request.job_id));
CREATE POLICY audit_see ON ops.reader_audit FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.reader_audit.job_id));
CREATE POLICY audit_insert ON ops.reader_audit FOR INSERT TO coordinator, intake_staff
  WITH CHECK (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.reader_audit.job_id));
CREATE POLICY answer_see ON ops.intake_answer FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.intake_answer.job_id));
CREATE POLICY answer_insert ON ops.intake_answer FOR INSERT TO coordinator, housing_officer, intake_staff
  WITH CHECK (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.intake_answer.job_id));
-- Urgency checks: who may say how it was checked. A housing officer saw it; repairs-line staff spoke to the tenant;
-- the coordinator records any source (the same rule as URGENCY_SOURCES in web/api/_auth.js).
CREATE POLICY urgency_see ON ops.urgency_check FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.urgency_check.job_id));
CREATE POLICY urgency_coordinator ON ops.urgency_check FOR INSERT TO coordinator
  WITH CHECK (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.urgency_check.job_id));
CREATE POLICY urgency_officer ON ops.urgency_check FOR INSERT TO housing_officer
  WITH CHECK (source = 'cho' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.urgency_check.job_id));
CREATE POLICY urgency_line ON ops.urgency_check FOR INSERT TO intake_staff
  WITH CHECK (source IN ('called_in','phoned') AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.urgency_check.job_id));
-- Offers: the coordinator's hub; a tradesperson sees the open ones in their trade and hub, and the ones they accepted.
CREATE POLICY offer_coordinator ON ops.job_offer FOR ALL TO coordinator
  USING (hub_id IN (SELECT ch.hub_id FROM ops.coordinator_hub ch WHERE ch.db_user = current_user))
  WITH CHECK (hub_id IN (SELECT ch.hub_id FROM ops.coordinator_hub ch WHERE ch.db_user = current_user));
CREATE POLICY offer_open_to_trade ON ops.job_offer FOR SELECT TO tradesperson USING (
  (mode = 'open' AND accepted_by IS NULL AND EXISTS (SELECT 1 FROM ops.crew_member c
     WHERE c.db_user = current_user AND c.trade = ops.job_offer.trade AND c.hub_id = ops.job_offer.hub_id))
  OR accepted_by IN (SELECT c.crew_id FROM ops.crew_member c WHERE c.db_user = current_user));
CREATE POLICY offer_accept ON ops.job_offer FOR UPDATE TO tradesperson
  USING (mode = 'open' AND accepted_by IS NULL AND EXISTS (SELECT 1 FROM ops.crew_member c
     WHERE c.db_user = current_user AND c.trade = ops.job_offer.trade AND c.hub_id = ops.job_offer.hub_id))
  WITH CHECK (accepted_by IN (SELECT c.crew_id FROM ops.crew_member c WHERE c.db_user = current_user));
CREATE POLICY offer_analyst ON ops.job_offer FOR SELECT TO analyst USING (true);
CREATE POLICY escalation_see ON ops.escalation FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.escalation.job_id));
CREATE POLICY escalation_tenant ON ops.escalation FOR INSERT TO tenant
  WITH CHECK (raised_by = 'tenant' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.escalation.job_id));
CREATE POLICY escalation_tradesperson ON ops.escalation FOR INSERT TO tradesperson
  WITH CHECK (raised_by = 'tradesperson' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.escalation.job_id));
CREATE POLICY escalation_officer ON ops.escalation FOR INSERT TO housing_officer
  WITH CHECK (raised_by = 'cho' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.escalation.job_id));
CREATE POLICY escalation_answer ON ops.escalation FOR UPDATE TO coordinator, housing_officer, intake_staff
  USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.escalation.job_id));
CREATE POLICY confirmation_see ON ops.tenant_confirmation FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.tenant_confirmation.job_id));
CREATE POLICY confirmation_tenant ON ops.tenant_confirmation FOR INSERT TO tenant
  WITH CHECK (via = 'tenant' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.tenant_confirmation.job_id));
CREATE POLICY confirmation_officer ON ops.tenant_confirmation FOR INSERT TO housing_officer
  WITH CHECK (via = 'cho' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.tenant_confirmation.job_id));
CREATE POLICY confirmation_line ON ops.tenant_confirmation FOR INSERT TO intake_staff
  WITH CHECK (via = 'line' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.tenant_confirmation.job_id));
CREATE POLICY interpreter_see ON ops.interpreter_request FOR SELECT USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.interpreter_request.job_id));
CREATE POLICY interpreter_tenant ON ops.interpreter_request FOR INSERT TO tenant
  WITH CHECK (via = 'tenant' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.interpreter_request.job_id));
CREATE POLICY interpreter_officer ON ops.interpreter_request FOR INSERT TO housing_officer
  WITH CHECK (via = 'cho' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.interpreter_request.job_id));
CREATE POLICY interpreter_staff ON ops.interpreter_request FOR INSERT TO intake_staff, coordinator
  WITH CHECK (via = 'line' AND EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.interpreter_request.job_id));
CREATE POLICY interpreter_called_back ON ops.interpreter_request FOR UPDATE TO coordinator, housing_officer, intake_staff
  USING (EXISTS (SELECT 1 FROM ops.job j WHERE j.job_id = ops.interpreter_request.job_id));
-- The ledger: a coordinator signs and reads their own hub's chain.
CREATE POLICY decision_coordinator ON ops.decision FOR ALL TO coordinator
  USING (hub_id IN (SELECT ch.hub_id FROM ops.coordinator_hub ch WHERE ch.db_user = current_user))
  WITH CHECK (hub_id IN (SELECT ch.hub_id FROM ops.coordinator_hub ch WHERE ch.db_user = current_user));
CREATE POLICY decision_read_all ON ops.decision FOR SELECT TO analyst, planner USING (true);
-- Events: every staff role sees them; a coordinator declares one only over communities in their own hub.
CREATE POLICY event_see ON ops.event FOR SELECT USING (true);
CREATE POLICY event_coordinator ON ops.event FOR INSERT TO coordinator WITH CHECK (NOT EXISTS (
  SELECT 1 FROM unnest(communities) AS c(id) WHERE c.id NOT IN (
    SELECT k.community_id FROM ops.community k JOIN ops.coordinator_hub ch ON ch.hub_id = k.hub_id WHERE ch.db_user = current_user)));
CREATE POLICY tenant_house_own ON ops.tenant_house FOR SELECT TO tenant USING (db_user = current_user);

-- ------------------------------------------------------------------ public views (res 6, suppressed below 5)
-- Owned by `reporting`, which may read every job, so the view counts all of them; anyone may read the view.
CREATE VIEW public.urgent_waits_by_cell AS
SELECT h3_cell_to_parent(h.cell_r10, 6) AS cell_r6,
       count(*)                          AS urgent_jobs,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (coalesce(j.done_at, now()) - j.reported_at)) / 86400) AS p90_days
FROM ops.job j JOIN ops.house h USING (house_id)
WHERE j.category IN ('immediate','urgent')
GROUP BY 1
HAVING count(*) >= 5;
GRANT reporting TO CURRENT_USER;                 -- needed to hand the view over (PostgreSQL 16)
GRANT CREATE ON SCHEMA public TO reporting;
ALTER VIEW public.urgent_waits_by_cell OWNER TO reporting;
REVOKE CREATE ON SCHEMA public FROM reporting;
GRANT SELECT ON public.urgent_waits_by_cell TO PUBLIC;

-- ------------------------------------------------------------------ useful queries
-- Run zones: community pairs in the same hub within 2 rings at res 4.
-- SELECT a.community_id, b.community_id, h3_grid_distance(a.cell_r4, b.cell_r4) AS rings
-- FROM ops.community a JOIN ops.community b ON a.hub_id = b.hub_id AND a.community_id < b.community_id
-- WHERE h3_grid_distance(a.cell_r4, b.cell_r4) <= 2;

-- "While you're there": open jobs near the community a plumber is in this week.
-- SELECT j.job_id, j.hazard, j.category FROM ops.job j JOIN ops.house h USING (house_id)
-- WHERE j.done_at IS NULL AND j.trade = 'plumber'
--   AND h3_cell_to_parent(h.cell_r10, 5) = ANY (h3_grid_disk(h3_cell_to_parent('87...'::h3index, 5), 3));

-- Lowering a job's urgency, as the API would do it for a person signed in as themselves (one transaction):
-- BEGIN;
-- INSERT INTO ops.urgency_check (job_id, source, to_hazard, reason) VALUES (42, 'cho', 'power_point', 'Saw it: plug dead, no sparks');
-- UPDATE ops.job SET hazard = 'power_point', category = ops.cat_of('power_point', tier) WHERE job_id = 42;
-- COMMIT;
