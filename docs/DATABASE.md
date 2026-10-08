# ReachNT data design

ReachNT holds tenants' names, phone numbers and addresses. The design keeps that personal information in one locked place and runs everything else (triage, trip planning, the equity reports) on H3 cells and pseudonymous IDs. The schema is `docs/schema.sql`.

## Choice: PostgreSQL + PostGIS + h3-pg

| Need | What we use | Cost |
|---|---|---|
| One database for jobs, crews, trips, decisions | PostgreSQL 16 | free, open source |
| Spatial queries (roads, closures, airstrips) | PostGIS | free |
| Hexagon indexing, rings, run zones, aggregation | h3-pg (`h3`, `h3_postgis`) | free |
| Encrypting personal fields | pgcrypto (`pgp_sym_encrypt`) | free |
| Who can see what | Postgres row-level security (RLS) | free |
| Analytics and the equity reports | DuckDB + its H3 extension, reading nightly Parquet exports | free |
| Field app working with no signal | SQLite in the browser (IndexedDB), synced when back in range | free |

Two ways to host it, both inside Australia:
1. **On NT Government infrastructure.** Postgres, PostGIS and h3-pg are all open source, so the licence cost is $0 and data never leaves NTG systems. This is the option we recommend for production.
2. **Neon, AWS Sydney region (`aws-ap-southeast-2`).** Neon supports `h3`, `h3_postgis`, `postgis` and `pgcrypto`. The free plan has 1 GB of storage and 100 compute-hours a project; the paid plan is usage-based with no monthly minimum ($0.106 per compute-hour, $0.35 per GB-month). Good for a pilot.

The portal's server functions (`web/api/`) are pinned to Vercel's Sydney region (`"regions": ["syd1"]` in `web/vercel.json`), so the updates phones send are received and checked in Australia. The portal's static files (the page, scripts, made-up demo data and map tiles) are served from Vercel's worldwide edge cache, which holds no personal information. The prototype's functions do not connect to a database yet; this document is the design they would write to.

### How big does it get?

About 8,300 houses (4,481 remote, 3,864 in the five hub towns), about 37,000 requests a year, and a weekly reason row for every waiting job. That is under 1 GB a year including the reason log, so the database fits in a free tier for a pilot and costs a few dollars a month on paid usage. Paid-for platforms (Salesforce, Dynamics, ServiceNow) would add per-user licences for every coordinator, contractor and Community Housing Officer; nothing in this design needs one.

## Three zones of data

**1. `pii` schema (the vault).** Tenant name, phone, postal address, preferred language and interpreter need. Every personal field is encrypted with pgcrypto; the key is held outside the database (NTG key management, or the host's secret store) and given only to intake staff who hold the `vault_reader` role. The only way to read a name, phone or address is the function `pii.contact(tenant, purpose, key)`: it writes a row to `pii.access_log` (the reader's login, taken from `session_user`, the tenant and the purpose) and then decrypts. `vault_reader` can add a tenant and correct their details, but has no SELECT on the encrypted columns, so it cannot call `pgp_sym_decrypt` on them directly, not even inside an UPDATE. Nobody but the owner can read or write the log, and the log refuses UPDATE, DELETE and TRUNCATE. The function is `SECURITY DEFINER` with a fixed `search_path`. A tenant reading their own details through a one-time code is not in the schema yet; it would go through the same kind of logged function.

**2. `ops` schema (the work).** Houses, jobs, trips, crews, the weekly reason log. A house is a pseudonymous `house_id` plus its H3 cell at resolution 10 (about 0.015 km², a 76 m hexagon). No names, phones or street addresses. A tradesperson's phone shows the hexagon and a navigation pin; the street address is meant to be fetched from the vault for that job only on the day of the visit (through the logged `pii.contact`, by a service that holds `vault_reader`), and not kept on the phone afterwards. The schema logs every such read but does not yet limit it to the day of the visit.

**3. `public` schema (what anyone may see).** Views only: waits, overdue rates and harm-days by H3 resolution 6 (about 36 km²) and by access band, with any cell under 5 jobs suppressed. The schema has the first of these (`public.urgent_waits_by_cell`); it is owned by the `reporting` role, which may count every job, and anyone may read it. Communities see their own numbers first (Closing the Gap Priority Reform 4).

The decision ledger (`ops.decision`) is append-only: a trigger refuses UPDATE, DELETE and TRUNCATE, and each row stores the hash of the row before it in the same hub, so an edit made by someone who first drops the trigger still breaks the chain and shows up. The trigger also sets `signed_by` to the login that signs (`session_user`) and `signed_at` to the time of signing, whatever the caller sends, and the reason may not be empty.

## Who sees what (row-level security)

Every person has their own database login, made a member of one role (for example `CREATE ROLE "kim.n" LOGIN IN ROLE coordinator`), and a mapping row says what they cover. The API connects as that person's login, never as the owner of the tables. Row-level security is enabled and **forced** on every table that holds jobs or what was done to them (15 tables), so the owning role sees nothing either; only a superuser or a role with `BYPASSRLS` (the administrator who loads the schema) is exempt. The tables that record what was done to a job (visits, urgency checks, reviews, confirmations, escalations, standard answers, interpreter requests, scores, wait reasons) are visible exactly when the job is: their policies ask `ops.job`, under the reader's own policies. Offers, decisions and events are scoped by hub. Every "who" column (`logged_by`, `checked_by`, `recorded_by`, `decided_by`, `declared_by`, `signed_by`, the vault log) is set by a trigger to the login that connected, whatever the caller sends.

| Role | Sees | May write | Scoped by |
|---|---|---|---|
| Repairs-line staff (`intake_staff`, plus `vault_reader` to decrypt) | every job (the line takes calls from anywhere) | new reports and the standard questions; urgency checks as the person who spoke to the tenant (`called_in`, `phoned`); review, confirmation and interpreter requests recorded `via = 'line'`; the vault only through the logged function | none: Territory-wide |
| Tenant (one-time code by SMS or read out by a Community Housing Officer) | their own house's jobs and everything logged against them | review, "fixed" / "still broken", "it got worse", interpreter call-back, all as `via = 'tenant'` | `ops.tenant_house` |
| Tradesperson / contractor | jobs on their trips, open jobs within 3 res-5 rings of where they are this week ("while you're there"), and jobs opened to any contractor of their trade in their hub | visits (as their own crew; a no-access visit needs the steps tried), "it got worse", accepting an open offer (first to accept; nobody can change it afterwards), and on their own trips only the made-safe and done times | `ops.crew_member`, `ops.trip` |
| Community Housing Officer (`housing_officer`) | jobs in their communities | reports there; urgency checks there with source `cho` only; review, confirmation, got-worse and interpreter requests for tenants there, recorded `via = 'cho'` | `ops.officer_community` |
| Regional coordinator | everything in their hub | urgency checks (any source), offers, events over communities in their hub, answers to reviews; signs decisions for their hub | `ops.coordinator_hub` |
| Department analyst | the `ops` schema without the vault; `public` views | nothing | none |
| Planning run (`planner`) | every job | scores, wait reasons, trips | none |
| Anyone | `public` views only (owned by `reporting`, aggregated to res 6, cells under 5 jobs suppressed) | nothing | |

### Where each rule is enforced

The rules live in two places, and the server only applies its role rules when sign-in is switched on:

| Rule | Server (`web/api/sync.js`, `_auth.js`) | Database (`docs/schema.sql`) |
|---|---|---|
| Fault ids exist in `config/taxonomy.yaml` | always (`web/api/_taxonomy.js`, written by `scripts/api_taxonomy.py`) | `ops.hazard` (same script), referenced by jobs and checks |
| An urgency check's categories are the fault's category for the household's tier (Tier 1 losing power, water or cooling is Immediate) | always: the update carries `tier`, and stated categories that don't match are rejected | always: the check starts from the job's own fault, category and tier; the caller's "from" is refused if it differs |
| Lowering an Immediate repair needs a person who spoke to the tenant or saw it, and a reason | always | always (CHECK) |
| A job's fault or category changes only with an urgency check in the same transaction | the server holds no jobs | always (trigger on `ops.job`) |
| Who may give which urgency source (housing officer `cho`; repairs line `called_in`/`phoned`; coordinator any) | only with sign-in on (`REQUIRE_SIGN_IN=1`) | always (row-level security) |
| A housing officer acts only for their own communities | only with sign-in on, from the token's job list | always (`ops.officer_community`) |
| A coordinator acts only in their own hub | not checked (the token carries no hub job list) | always (`ops.coordinator_hub`) |
| A tenant acts only on their own jobs and only as the tenant | only with sign-in on | always (`ops.tenant_house`) |
| No-access visits need the time and at least one of the four steps, not in the future | always (ISO time, at most 5 minutes ahead) | always (CHECK and trigger) |
| Standard questions only, answers yes / no / unknown, people 1 to 40 | always | always (per-question CHECK) |
| First contact within the planning window | always (day index 0 to 800) | always (`first_contact_at` not after the report, at most 800 days before) |
| Logs are append-only | the server keeps no log | always (triggers on UPDATE, DELETE, TRUNCATE) |

Without `REQUIRE_SIGN_IN=1` (the default: the prototype has no sign-in service, no accounts and made-up data) only the "always" server rules apply: anyone can send any kind of update, but its content is checked the same way.

## Why H3 in the database

H3 is Uber's open-source hexagonal grid (h3geo.org). Every point on earth sits in one hexagon at each of 16 resolutions; each finer level is about one seventh of the area. ReachNT uses four of them:

| Resolution | Average area | Use |
|---|---|---|
| 10 | 0.015 km² | a house (instead of an address) |
| 7 | 5.2 km² | a community's footprint |
| 5 | 253 km² | "while you're there" search rings around a tradesperson |
| 4 | 1,770 km² | run zones: two communities within 2 rings share one trip |
| 6 | 36 km² | the smallest unit anything is published at |

Hexagons have one kind of neighbour, all the same distance from the centre, so "everything within k rings" is a fair circle in every direction. Squares (S2, geohash) have edge and corner neighbours at two distances. A cell ID is a 64-bit integer, so joins between jobs, houses, crews, closures and airstrips are integer joins with an index, which is cheap on small hardware.

H3 does not know where the roads are. ReachNT pairs H3 with the NT road-restriction register and live Road Report closures for travel time; H3 decides who is near whom, and the road data decides whether you can get there this week.

## Records that keep the system honest

Added after checking ReachNT against UK and Australian repair and automated-decision rules (`docs/VALIDATION.md`). In `docs/schema.sql` each rule is a constraint, trigger or row-level security policy, not left to the app.

| Table or column | What it records | Rule it enforces |
|---|---|---|
| `ops.job.made_safe_at`, `done_at` | Two clocks for a dangerous fault: made safe, then fixed | Awaab's Law; NT FS17 (4-hour response) |
| `ops.job.duplicate_of` | A second report of the same fault at the same house, while the first is open | Fixed on the same visit; must point at a real job |
| `ops.job.repeat_of` | The same fault, fixed within the 90 days before | Flags fixes that didn't hold |
| `ops.visit_attempt` | Every visit, including missed ones: when, outcome, what was tried | A "no one home" or "can't get in" row is refused unless at least one of the four steps is recorded (left a card, phoned the tenant, spoke to family or a neighbour, photo of the door), and none other; not in the future; append-only (Housing Ombudsman 2025) |
| `ops.review_request` | A tenant's request for a person to review their ranking, the due date and the answer | Robodebt Royal Commission rec. 17.1; the reason can't be empty; the answer is filled in once and never changed |
| `ops.reader_audit` | The weekly re-reading of 1 in 20 automatically read reports | Ongoing quality assurance (Ombudsman ADM guide) |
| `ops.tenant_confirmation` | Whether the tenant says the repair worked | "Still broken" reopens the job |
| `ops.job.channel`, `first_contact_at`, `language`, `interpreter` | How the report arrived and when the tenant first told anyone | The clock starts at first contact (not after the report, at most 800 days before); channel and language are kept only to book interpreters and check fairness, never scored (`docs/INCLUSIVE_DECISION_MODEL.md`) |
| `ops.job.hazard`, `category`, `ops.hazard` | The fault, from `config/taxonomy.yaml`, and its category | The fault must be in the taxonomy; the category is always the fault's category for the household's tier; the tenant's words can't be blank; the trade is one of six |
| `ops.job.tier` | Who lives there: 1 life-preservation (power, cooling or medical supplies; baby under 12 months; frail elder), 2 high systemic risk, 3 none | Tier 1 losing power, water or cooling (`ops.hazard.lifeline`) is Immediate; a higher tier raises the job at once, a lower one needs an urgency check; never Aboriginality, income or who heads the household |
| `ops.intake_answer` | The standard questions (danger now, life support, baby or elder, children or mobility, people, told before), asked the same way on every channel, with the source (asked, tenancy record, job history) | Saying less costs no points; "unknown" never removes any; answers are yes / no / unknown, and people a count from 1 to 40; append-only |
| `ops.urgency_check` | Every time a person checks or changes urgency: who, how (call, on site, photo, review), the household's tier, from what to what, and why | Starts from the job as it is (the caller can't state a lower "from"); the "to" category must be the new fault's category for the tier, so a Tier 1 household's lost power, water or cooling stays Immediate; a CHECK refuses lowering an Immediate repair unless the source spoke to the tenant or saw the fault; the source must fit the role; a job's fault or category changes only with a check in the same transaction; append-only |
| `ops.job_offer` | Who goes after a missed visit: next trip, a named crew, or open to any contractor of that trade | One open offer per job; the first to accept gets it, and the acceptance can't be changed |
| `ops.escalation` | A tenant or tradesperson says it got worse | Answered by an urgency check the same day (the link to that check is filled in once; the same-day timing is a process rule the coordinator's screen shows, not a constraint); who raised it must match the role |
| `ops.interpreter_request` | A tenant, their housing officer, the repairs line or the coordinator asks for a call-back with an interpreter: language, service (AIS, TIS National, National Relay Service, family) and a note | The language is used only to book the interpreter; the call-back is recorded once; never deleted |
| `ops.tenant_confirmation.via`, `ops.review_request.via` | Whether the tenant recorded it, or their housing officer or the repairs line did for them | `via` must match the role (tenant, `cho`, `line`); housing officers can act only for their own communities (`ops.officer_community`, row-level security; on the server only with sign-in on) |
| `ops.job.reopened_at`, `ops.job_score.rework` | A fix the tenant says didn't hold | Reopened with rework points; keeps `reported_at` |
| `ops.event`, `ops.job.event_id` | A declared flood, cyclone or fire, its communities and the surge crews asked for | Communities must exist and be in the declaring coordinator's hub; jobs from the area are tagged; the response is a signed decision |
| `ops.trip_share` | Trades travelling together in one vehicle or charter | The vehicle cost is paid once |

The schema was loaded into PostgreSQL 16 (8 October 2026) and probed with 97 checks, each actor connecting with their own login. Among them: the vault log records the reader's own login; a vault reader's direct `pgp_sym_decrypt` on the table is refused; a Tier 1 household's lost power or cooling can't be lowered from a photo or a review, nor by stating a lower "from" category; the same lowering by phone with a reason is accepted, and only then can the job itself change; a coordinator sees only their hub and a housing officer only their communities; a housing officer can't claim a phone call and the repairs line can't claim a tradesperson saw it; UPDATE, DELETE and TRUNCATE on the logs are refused even for the superuser; and an ordinary owner of a forced table sees none of its rows. PostGIS and h3-pg were replaced by simple stand-ins for that check; on Neon or NT Government servers the real extensions are used. Not tested there: the real H3 ring distances in the tradesperson policy, and a pooled connection that switches role per request (the design assumes each person connects as their own login, so `session_user` is that person).

## Retention and rights

- Personal fields are deleted 2 years after a tenancy ends (to be confirmed against the NT Information Act and records schedules). Job history stays, keyed only by `house_id` and H3 cell.
- A tenant can see every row about them and ask for a correction.
- The decision ledger is kept permanently.
- No personal data leaves Australia; backups are encrypted.

## What a pilot needs that a prototype cannot give

An extract from the Department's Tenancy Management System and ASNEX: houses, tenancies and three years of work orders with raised and closed dates, trade, cost and travel orders. A privacy impact assessment under the NT Information Act. Contractor agreement to log a reason for every week a job waits.
