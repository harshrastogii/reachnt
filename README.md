# ReachNT

Repair triage for remote NT public housing. ReachNT ranks repairs by need, uses Uber's H3 hexagon grid to let one tradesperson serve neighbouring communities on one trip, prices the equity trade-off, asks a named person to sign it, and tells each tenant why their repair waited.

Team Top Enders (AIC015): Harsh Rastogi (386401), Aashish (385593). CDU IT Code Fair 2026, Artificial Intelligence Challenge: housing maintenance triage.

**Live portal:** https://reachnt.vercel.app (all repair requests are synthetic demo data).

> **HMW:** How might we help a housing maintenance coordinator prioritise urgent repairs across remote NT communities without "efficiency" quietly pushing remote tenants to the back of the queue?

**Synthetic data.** The repair requests are synthetic; no public NT work-order data exists. The 70 communities, house counts, crew hubs, road closures, airstrips, job mix, response clocks and cost structure are real or sourced (see `research/RESEARCH.md`).

## Results (one synthetic year, whole NT)

| Plan | Average cost per repair (incl. travel) | 9 in 10 urgent remote repairs fixed within | Days households lived with a fault |
|---|---|---|---|
| Cheapest jobs first | $558 | 62 days (town: 3) | 216,000 |
| Most urgent first, one community per trip | $843 | 3 days | 75,800 |
| **ReachNT**: most urgent first, with shared trips | **$775** | **3 days** | **61,700** |

- **Average cost per repair** is the year's labour, parts and travel divided by the number of repairs done.
- **9 in 10 fixed within** is the wait that 90% of urgent remote repairs beat. The slowest 1 in 10 waited longer.
- **Days households lived with a fault** adds one for every day a household waited. Dangerous faults count more.
- **A shared trip** is one crew visiting two neighbouring communities on the same run, so the drive or flight is paid once. H3 hexagons decide which communities are close enough to pair.

## How good is the AI? (report Appendix G, `src/reachnt/evaluate.py`)

| Check | Familiar wording | New wording |
|---|---|---|
| Spotting a dangerous fault, ROC-AUC (0.5 = guessing) | 1.00 | 0.78 (0.73–0.82) |
| Spotting a dangerous fault, PR-AUC (guessing = 0.23) | 0.99 | 0.60 (0.53–0.68) |
| Dangerous reports caught by the whole system (model, rules, person) | 100% | 99% |
| Urgency category correct (macro-F1) | 0.90 | 0.79 |
| Queue order vs true order (Kendall's τ, after a person checks) | 0.91 | 0.86 |

- **Model on its own:** weak on wording it never saw. Its confidence is also too high at the top end: when it says 84% it is right 65% of the time, so tenants never see a confidence percentage.
- **Whole system:** still catches 99% of dangerous reports, because it sends 40% of those reports to a person.
- **Trip planner:** CP-SAT proved 99.5% of 26,028 weekly plans optimal. The median plan takes 4 ms.
- **Five random years:** ReachNT cut fault-days by 69–74% against cheapest-first, for 38–40% more per repair. Shared trips saved $68–78 per repair in every year.

## Deliverables

| Deliverable | Where |
|---|---|
| Report (PDF, A4, 8 body pages) | `docs/report/DataChallenge_Team AIC015_Report.pdf` (source `reachnt_report.md`, build `build_pdf.py`) |
| Slide deck | `docs/deck/DataChallenge_Team AIC015_Slides.pptx` and `.pdf` (build `build_deck.js`); run sheet `pitch_run_sheet.md` |
| Portal (interactive prototype) | `web/` (deploy to Vercel, see `web/DEPLOY.md`). It has coordinator, tradesperson and tenant views, works offline, saves PDFs and syncs updates when signal returns |
| Python solution | `src/reachnt/`, `run_all.py`, `notebooks/01_walkthrough.ipynb`, `tests/` |
| Database design | `docs/DATABASE.md`, `docs/schema.sql` |
| Background research | `research/RESEARCH.md`; links to the documents we read in full in `research/sources/README.md` |

## Run it

```bash
pip install -r requirements.txt
python run_all.py                     # every number, figure and the portal data (~15 min on 8 cores)
pytest -q tests                       # 24 checks, all passing
python run_all.py --quality           # only the quality measures (ROC/PR-AUC, calibration, solver gap, 5 random years)
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
2. **Rank by need only** (`urgency.py`): the NT category sets the clock; points for harm, Healthy Living Practice, vulnerable or crowded household, repeat report and waiting. A test fails if distance or cost appear.
3. **H3** (`geo.py`): communities get H3 cells at resolutions 3–7; houses are resolution-10 cells; communities whose resolution-4 cells are within 2 rings form run zones (68 pairs).
4. **Plan trips** (`planner.py`): weekly, per hub and trade, OR-Tools CP-SAT chooses single trips and run zones under crew hours, road closures and airstrips.
5. **Show the trade-off** (`simulate.py`, `experiments.py`): one year under 14 settings plus a sensitivity sweep.
6. **Sign and explain** (`explain.py`, portal ledger): every week a job waits, the reason is logged; the tenant's answer is built from that log and the signed decision.
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
| NIAA/PwC-IC Review of the NPRH NT (2023), Appendix B | Commonwealth report, figures quoted |

## Ethics

No personal data. No community has reviewed ReachNT. Community-level results from synthetic requests are illustrations, not findings about any community. The portal uses satellite imagery of Country and no Aboriginal art; any artwork would be commissioned and licensed through an Aboriginal art centre. Before real use: co-design with tenants, Aboriginal Housing NT, land councils and the Aboriginal Interpreter Service, HREC approval, and land council research permits.
