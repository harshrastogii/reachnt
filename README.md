# ReachNT

Repair triage for remote NT public housing. ReachNT ranks repairs by need, uses Uber's H3 hexagon grid to let one tradesperson serve neighbouring communities on one trip, prices the equity trade-off, asks a named person to sign it, and tells each tenant why their repair waited. Its inclusive decision-making model keeps a tenant's place in line independent of when or how they reported, how much they said, their English, or whether they use an app (`docs/INCLUSIVE_DECISION_MODEL.md`).

Team Top Enders (AIC015): Harsh Rastogi (386401), Aashish (385593). CDU IT Code Fair 2026, Artificial Intelligence Challenge: housing maintenance triage.

**Live portal:** https://reachnt.vercel.app (all repair requests are synthetic demo data).

> **HMW:** How might we help a housing maintenance coordinator prioritise urgent repairs across remote NT communities without "efficiency" quietly pushing remote tenants to the back of the queue?

**Synthetic data.** The repair requests are synthetic; no public NT work-order data exists. The 70 communities, house counts, crew hubs, road closures, airstrips, job mix, response clocks and cost structure are real or sourced (see `research/RESEARCH.md`).

## Results (one synthetic year, whole NT)

| Plan | Average cost per repair (incl. travel) | 9 in 10 urgent remote repairs fixed within | Days households lived with a fault |
|---|---|---|---|
| Cheapest jobs first | $559 | 62 days (town: 3) | 225,800 |
| Most urgent first, one community per trip | $876 | 3 days | 74,300 |
| **ReachNT**: most urgent first, with shared trips | **$803** | **3 days** | **61,000** |

- **Average cost per repair** is the year's labour, parts and travel divided by the number of repairs done.
- **9 in 10 fixed within** is the wait that 90% of urgent remote repairs beat. The slowest 1 in 10 waited longer.
- **Days households lived with a fault** adds one for every day a household waited. Dangerous faults count more.
- **A shared trip** is one crew visiting two neighbouring communities on the same run, so the drive or flight is paid once. H3 hexagons decide which communities are close enough to pair.

## How good is the AI? (report Appendix G, `src/reachnt/evaluate.py`)

| Check | Familiar wording | New wording |
|---|---|---|
| Spotting a dangerous fault, ROC-AUC (0.5 = guessing) | 1.00 | 0.84 (0.80–0.88) |
| Spotting a dangerous fault, PR-AUC (guessing = 0.22) | 0.99 | 0.72 (0.65–0.78) |
| Dangerous reports caught by the whole system (model, rules, person) | 100% | 99.3% |
| Urgency category correct (macro-F1) | 0.89 | 0.80 |
| Queue order vs true order (Kendall's τ, after a person checks) | 0.89 | 0.85 |

- **Model on its own:** moderate on wording it never saw (ROC-AUC 0.84). Its confidence doesn't match its accuracy: when it said it was 90% sure or more, it was right 56% of the time, so tenants never see a confidence percentage.
- **Whole system:** still catches 99% of dangerous reports, because it sends 40% of those reports to a person.
- **Trip planner:** CP-SAT proved 99.4% of 25,996 weekly plans optimal. The median plan takes 7 ms.
- **Five random years:** ReachNT cut fault-days by 73%–75% against cheapest-first, for 42%–46% more per repair. Shared trips saved $66–73 per repair in every year.

## Saying less costs no points; a missed visit keeps its clock (`docs/INCLUSIVE_DECISION_MODEL.md`)

| Check (synthetic) | Before | Now |
|---|---|---|
| Same household told in a few words instead of in full: points lost | 19 on average (words only) | 1.8 (standard questions + tenancy record + job history) |
| ...and ranked lower in the line | 97% | 11% |
| Vulnerable households recognised from a few words | 4% | 92% |

With 1 in 10 booked visits missing, ReachNT still fixed 9 in 10 of the *missed* urgent remote repairs within 20 days (cheapest-first: 126), because a missed job keeps its waiting time and gets the deadline boost.

## Fixes that didn't hold, trades travelling together, floods and cyclones

- **Rework.** If the tenant (or their housing officer) says a repair is still broken, the job reopens with 50 extra points and keeps the day it was first reported, so its clock has run out and the deadline boost puts it on the next trip. The coordinator can send a different crew.
- **Trades travelling together.** Different trades booked to the same community (or the same shared trip) in the same week share one ute (3 seats) or one charter (5 seats). Counted after planning, so it is a floor: it saves ReachNT a further $130 per repair (1,482 of 8,199 trips shared) and cheapest-first $45. Different trades going to neighbouring communities are suggested to share one loop.
- **Floods, cyclones and fires.** The coordinator declares an event over the communities hit. The portal plans the response (make safe within 48 hours, one team trip, surge crews from the contractor panel, a message to every household) and tags every job from the area. In a modelled flood of Kalkarindji, Daguragu and Pigeon Hole (94 repairs, roads cut for 4 weeks), the usual crews fixed 9 in 10 urgent flood repairs within 15 days and the rest of the Katherine hub slipped from 3 to 10 days; with surge crews (double for 8 weeks) both stayed at 3 days.

## How a repair request gets into ReachNT

The tenant tells someone, and that person logs it: in the **New report** tab, or in the **Housing officer** view. The coordinator doesn't upload requests; they look after the line, the trips and the checks. The housing officer also records, for tenants who don't use the app, whether a repair worked, that it got worse, or that they want a review; each update is marked as recorded for the tenant.

1. **Who logs it.** Whoever the tenant told:
   - repairs-line staff (1800 104 076)
   - the Community Housing Officer
   - the maintenance officer
   - a tradesperson on site
   - the front counter
   - the tenant themselves, in the app
2. **What they record.**
   - the tenant's words (or the interpreter's)
   - the day the tenant *first* told anyone, which is when the clock starts
   - the language and interpreter, only to book one next time
   - the same standard questions every time
3. **What fills itself in.** The tenancy record (household size and bedrooms) and the house's repair history (reported before, came back).
4. **What the reader does.** It suggests the fault and category. A person checks anything unsure or possibly dangerous, and anyone can pick the fault themselves.
5. **What happens next.** The report joins the line and next week's plan. A dangerous one is made safe the same day. A second report of a fault already open at that house joins the existing job.

In this prototype, the year of requests behind the demo is synthetic (`synth.py` → `intake.py` → `simulate.py` → `export_web.py`). Reports logged in the portal are kept in the browser and sent to `/api/sync`, which validates them. In production they are rows in `ops.job` and `ops.intake_answer` (`docs/schema.sql`).

## Deliverables

| Deliverable | Where |
|---|---|
| Report (PDF, A4, 8 body pages) | `docs/report/DataChallenge_Team AIC015_Report.pdf` (source `reachnt_report.md`, build `build_pdf.py`) |
| Slide deck | `docs/deck/DataChallenge_Team AIC015_Slides.pptx` and `.pdf` (build `build_deck.js`); script with timings and Q&A prep `PITCH_SCRIPT.md` |
| Portal (interactive prototype) | `web/` (deploy to Vercel, see `web/DEPLOY.md`). It has coordinator, tradesperson, tenant and housing officer views, works offline, saves PDFs and syncs updates when signal returns. Coordinators log new reports with the standard questions, check and change urgency at any time, and send a missed job to the next trip, a named crew or any contractor of that trade; tradespeople can take open jobs and say "worse than reported"; tenants can say "it got worse" |
| Python solution | `src/reachnt/`, `run_all.py`, `notebooks/01_walkthrough.ipynb`, `tests/` |
| Inclusive decision-making model | `docs/INCLUSIVE_DECISION_MODEL.md` |
| Database design | `docs/DATABASE.md`, `docs/schema.sql` |
| Validation checks and gaps | `docs/VALIDATION.md` (security, accessibility, map accuracy, reader stress tests, data and simulation integrity, each gap's status) |
| Accountability for a pilot | `docs/AI_IMPACT_ASSESSMENT.md`, `web/privacy.html` (automated-decision notice and AI transparency statement), `docs/REAL_LANGUAGE_TEST_PROTOCOL.md` with `scripts/evaluate_real_reports.py` |
| Background research | `research/RESEARCH.md`; links to the documents we read in full in `research/sources/README.md` |

## Run it

```bash
pip install -r requirements.txt
python run_all.py                     # every number, figure and the portal data (~15 min on 8 cores)
pytest -q tests                       # 78 checks; node tests/test_api.mjs adds 20 for the server (both run by GitHub Actions on every push)
python run_all.py --quality           # only the quality measures (ROC/PR-AUC, calibration, solver gap, 5 random years)
python run_all.py --extras            # only the inclusion, missed-visit, trades-together and flood experiments
python -m http.server 8731 --directory web   # then open http://localhost:8731
python docs/report/build_pdf.py
```

Imagery is chosen in this order:
1. `SAT_TILE_URL`;
2. MapTiler (`MAPTILER_KEY`);
3. Esri World Imagery;
4. the bundled Digital Earth Australia tiles (`web/tiles/`, built by `scripts/build_tiles.py`).

The bundled tiles stop at zoom 11.5 so they never turn to blur. Add `?offline` to the URL to force them. MapLibre, h3-js and jsPDF load from a CDN, with copies in `web/vendor/`.

**Deploy:** the Vercel project `reachnt` builds from this repository's `web/` folder on every push to `main`. No keys are needed. Optional keys are listed in `web/DEPLOY.md`.

**Offline:** the portal installs as an app (PWA). "Done" and "Couldn't do it" are kept on the phone and sent to `/api/sync` when signal returns. "Save run sheet (PDF)" for trades and "Save as PDF" on any repair give a printable copy with the map.

**Google Earth Engine (optional):** `scripts/gee_satellite.py` exports a Sentinel-2 dry-season basemap for `SAT_TILE_URL` and measures how much land near each community was flooded each wet-season month (Sentinel-1).

The planner is single-threaded with a fixed seed, so every run gives the same numbers. The report, deck and portal all read `outputs/numbers.json`.

## How it works

1. **Read** (`intake.py`): phrase rules from `config/taxonomy.yaml` plus a TF-IDF / logistic regression model. Unsure, conflicting or possibly dangerous readings go to a person.
2. **Rank by need only** (`urgency.py`, `intake.household`): the NT category sets the clock; points for harm, Healthy Living Practice, vulnerable or crowded household, repeat report and waiting. Household points come from the standard questions, the tenancy record and the job history as well as the words, so saying less costs nothing. A test fails if distance, cost, channel, language or the like appear.
3. **H3** (`geo.py`): communities get H3 cells at resolutions 3–7; houses are resolution-10 cells; communities whose resolution-4 cells are within 2 rings form run zones (68 pairs).
4. **Plan trips** (`planner.py`): weekly, per hub and trade, OR-Tools CP-SAT chooses single trips and run zones under crew hours, road closures and airstrips.
5. **Show the trade-off** (`simulate.py`, `experiments.py`): one year under 14 settings plus a sensitivity sweep.
6. **Sign and explain** (`explain.py`, portal ledger): every week a job waits, the reason is logged; the tenant's answer is built from that log and the signed decision. A person can check and change urgency at any time (never lowering danger without having spoken to the tenant or seen it), and a missed visit is reassigned without restarting its clock.
7. **Check quality** (`evaluate.py`): ROC-AUC and PR-AUC for spotting danger, calibration, cross-validation, ranking agreement (Kendall's τ), CP-SAT optimality gaps, and the headline plans in five random years. Report Appendix G.

## Data and licences

| Data | Licence |
|---|---|
| NTG remote communities list 2021 | CC BY 4.0 |
| ABS 2021 Census Indigenous Profile (ILOC); ASGS 2021 coastline | CC BY 4.0 |
| NT Annual Traffic Report 2023 restriction register | CC BY 4.0 |
| Digital Earth Australia Landsat 8/9 geomedian 2024 (bundled tiles) | CC BY 4.0, Geoscience Australia |
| Esri World Imagery (live tiles only, not stored) | Esri terms, attribution shown |
| Road Report NT live feed | NTG, read only |
| OurAirports | Public domain |
| OpenStreetMap settlement points and buildings (map positions only, `scripts/osm_settlements.py`) | ODbL 1.0, © OpenStreetMap contributors |
| NIAA/PwC-IC Review of the NPRH NT (2023), Appendix B | Commonwealth report, figures quoted |

## Ethics

No personal data. No community has reviewed ReachNT. Community-level results from synthetic requests are illustrations, not findings about any community. The portal uses satellite imagery of Country and no Aboriginal art; any artwork would be commissioned and licensed through an Aboriginal art centre. Before real use: co-design with tenants, Aboriginal Housing NT, land councils and the Aboriginal Interpreter Service, HREC approval, and land council research permits.
