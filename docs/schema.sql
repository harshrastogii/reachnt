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
  channel       text NOT NULL,                        -- phone, housing officer, maintenance officer, app
  report_text   text NOT NULL,                        -- what the tenant said (no names: intake strips them)
  hazard        text NOT NULL,                        -- from config/taxonomy.yaml
  category      text NOT NULL CHECK (category IN ('immediate','urgent','routine')),
  trade         text NOT NULL,
  read_by       text NOT NULL,                        -- rules, model, rules+model, person
  checked_by_person boolean NOT NULL DEFAULT false,
  vulnerable    boolean NOT NULL DEFAULT false,
  crowded       boolean NOT NULL DEFAULT false,
  repeat_report boolean NOT NULL DEFAULT false,
  made_safe_at  timestamptz,
  done_at       timestamptz,
  done_by       uuid REFERENCES ops.crew_member
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
  reason      text NOT NULL CHECK (reason IN ('cut','travel_cost','crew_full','lower_priority','no_access','parts','needs_other_trade')),
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
ALTER TABLE ops.job ENABLE ROW LEVEL SECURITY;

-- A tradesperson sees jobs on their trips, and open jobs within 3 res-5 rings of a community they visit this week.
CREATE POLICY job_tradesperson ON ops.job FOR SELECT TO tradesperson USING (
  EXISTS (SELECT 1 FROM ops.trip_job tj JOIN ops.trip t USING (trip_id) JOIN ops.crew_member c USING (crew_id)
          WHERE tj.job_id = ops.job.job_id AND c.db_user = current_user)
  OR (done_at IS NULL AND EXISTS (
          SELECT 1 FROM ops.trip t JOIN ops.crew_member c USING (crew_id) JOIN ops.house h ON h.house_id = ops.job.house_id
          CROSS JOIN LATERAL unnest(t.communities) AS cm(community_id)
          JOIN ops.community k USING (community_id)
          WHERE c.db_user = current_user AND t.week_start = date_trunc('week', now())::date
            AND h3_grid_distance(h3_cell_to_parent(h.cell_r10, 5), h3_cell_to_parent(k.cell_r7, 5)) <= 3))
);
CREATE POLICY job_coordinator ON ops.job FOR ALL TO coordinator USING (true);
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
