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

### How big does it get?

About 8,300 houses (4,481 remote, 3,864 in the five hub towns), about 37,000 requests a year, and a weekly reason row for every waiting job. That is under 1 GB a year including the reason log, so the database fits in a free tier for a pilot and costs a few dollars a month on paid usage. Paid-for platforms (Salesforce, Dynamics, ServiceNow) would add per-user licences for every coordinator, contractor and Community Housing Officer; nothing in this design needs one.

## Three zones of data

**1. `pii` schema (the vault).** Tenant name, phone, postal address, preferred language and interpreter need. Every personal field is encrypted with pgcrypto; the key is held outside the database (NTG key management, or the host's secret store) and given only to the `vault_reader` role. Only intake staff and the tenant themselves (through a one-time code) can decrypt. Every read is written to an audit table by a trigger.

**2. `ops` schema (the work).** Houses, jobs, trips, crews, the weekly reason log. A house is a pseudonymous `house_id` plus its H3 cell at resolution 10 (about 0.015 km², a 76 m hexagon). No names, phones or street addresses. A tradesperson's phone shows the hexagon and a navigation pin; the street address is fetched from the vault for that job only on the day of the visit, and is not kept on the phone afterwards.

**3. `public` schema (what anyone may see).** Views only: waits, overdue rates and harm-days by H3 resolution 6 (about 36 km²) and by access band, with any cell under 5 jobs suppressed. Communities see their own numbers first (Closing the Gap Priority Reform 4).

The decision ledger (`ops.decision`) is append-only: each row stores the hash of the row before it, so an edit after the fact breaks the chain and shows up.

## Who sees what (row-level security)

| Role | Sees |
|---|---|
| Intake staff (repairs line, Community Housing Officers) | log new reports and the standard questions; the vault only through the logged function |
| Tenant (one-time code by SMS or read out by a Community Housing Officer) | their own jobs and the reasons logged against them |
| Tradesperson / contractor | jobs on their assigned trips, plus open jobs within 3 res-5 rings of where they are this week ("while you're there"), plus jobs the coordinator opened to any contractor of their trade in their hub |
| Community Housing Officer | jobs in their communities; logs reports and records fixes, still-broken, got-worse and review requests for tenants there |
| Regional coordinator | everything in their hub; signs decisions |
| Department analyst | the `ops` schema without the vault; `public` views |
| Anyone | `public` views only |

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

Added after checking ReachNT against UK and Australian repair and automated-decision rules (`docs/VALIDATION.md`). Each rule is enforced by the database, not left to the app.

| Table or column | What it records | Rule it enforces |
|---|---|---|
| `ops.job.made_safe_at`, `done_at` | Two clocks for a dangerous fault: made safe, then fixed | Awaab's Law; NT FS17 (4-hour response) |
| `ops.job.duplicate_of` | A second report of the same fault at the same house, while the first is open | Fixed on the same visit; must point at a real job |
| `ops.job.repeat_of` | The same fault, fixed within the 90 days before | Flags fixes that didn't hold |
| `ops.visit_attempt` | Every visit, including missed ones: when, outcome, what was tried | A "no one home" or "can't get in" row is refused unless at least one action is recorded (Housing Ombudsman 2025) |
| `ops.review_request` | A tenant's request for a person to review their ranking, the due date and the answer | Robodebt Royal Commission rec. 17.1 |
| `ops.reader_audit` | The weekly re-reading of 1 in 20 automatically read reports | Ongoing quality assurance (Ombudsman ADM guide) |
| `ops.tenant_confirmation` | Whether the tenant says the repair worked | "Still broken" reopens the job |
| `ops.job.channel`, `first_contact_at`, `language`, `interpreter` | How the report arrived and when the tenant first told anyone | The clock starts at first contact; channel and language are kept only to book interpreters and check fairness, never scored (`docs/INCLUSIVE_DECISION_MODEL.md`) |
| `ops.job.tier` | Who lives there: 1 life-preservation (power, cooling or medical supplies; baby under 12 months; frail elder), 2 high systemic risk, 3 none | Tier 1 losing power, water or cooling is Immediate; never Aboriginality, income or who heads the household |
| `ops.intake_answer` | The standard questions, asked the same way on every channel, with the source (asked, tenancy record, job history) | Saying less costs no points; "unknown" never removes any |
| `ops.urgency_check` | Every time a person checks or changes urgency: who, how (call, on site, photo, review), from what to what, and why | Append-only; a CHECK refuses lowering a dangerous repair unless the source spoke to the tenant or saw the fault |
| `ops.job_offer` | Who goes after a missed visit: next trip, a named crew, or open to any contractor of that trade | One open offer per job; the first to accept gets it |
| `ops.escalation` | A tenant or tradesperson says it got worse | Answered by an urgency check the same day |
| `ops.tenant_confirmation.via`, `ops.review_request.via` | Whether the tenant recorded it, or their housing officer or the repairs line did for them | Housing officers can act only for their own communities (`ops.officer_community`, row-level security) |
| `ops.job.reopened_at`, `ops.job_score.rework` | A fix the tenant says didn't hold | Reopened with rework points; keeps `reported_at` |
| `ops.event`, `ops.job.event_id` | A declared flood, cyclone or fire, its communities and the surge crews asked for | Jobs from the area are tagged; the response is a signed decision |
| `ops.trip_share` | Trades travelling together in one vehicle or charter | The vehicle cost is paid once |

The schema was loaded into PostgreSQL 16 to check it: all tables and the row-level security policies are created, a no-access visit without evidence is refused, and a duplicate pointing at a job that doesn't exist is refused. (PostGIS and h3-pg were replaced by simple stand-ins for that check; on Neon or NT Government servers the real extensions are used.)

## Retention and rights

- Personal fields are deleted 2 years after a tenancy ends (to be confirmed against the NT Information Act and records schedules). Job history stays, keyed only by `house_id` and H3 cell.
- A tenant can see every row about them and ask for a correction.
- The decision ledger is kept permanently.
- No personal data leaves Australia; backups are encrypted.

## What a pilot needs that a prototype cannot give

An extract from the Department's Tenancy Management System and ASNEX: houses, tenancies and three years of work orders with raised and closed dates, trade, cost and travel orders. A privacy impact assessment under the NT Information Act. Contractor agreement to log a reason for every week a job waits.
