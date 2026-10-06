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
| Tenant (one-time code by SMS or read out by a Community Housing Officer) | their own jobs and the reasons logged against them |
| Tradesperson / contractor | jobs on their assigned trips, plus open jobs within 3 res-5 rings of where they are this week ("while you're there") |
| Community Housing Officer | jobs in their communities |
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

## Retention and rights

- Personal fields are deleted 2 years after a tenancy ends (to be confirmed against the NT Information Act and records schedules). Job history stays, keyed only by `house_id` and H3 cell.
- A tenant can see every row about them and ask for a correction.
- The decision ledger is kept permanently.
- No personal data leaves Australia; backups are encrypted.

## What a pilot needs that a prototype cannot give

An extract from the Department's Tenancy Management System and ASNEX: houses, tenancies and three years of work orders with raised and closed dates, trade, cost and travel orders. A privacy impact assessment under the NT Information Act. Contractor agreement to log a reason for every week a job waits.
