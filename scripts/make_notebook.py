"""Write notebooks/01_walkthrough.ipynb (then execute it with nbconvert)."""
from pathlib import Path

import nbformat as nbf

nb = nbf.v4.new_notebook()
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
nb.cells = [
    md("""# ReachNT: walkthrough

**HMW:** help a housing maintenance coordinator prioritise urgent repairs across remote NT communities without "efficiency" quietly pushing remote tenants to the back of the queue.

This notebook walks the method step by step. It reads the files `run_all.py` writes; run that first (about 10 minutes).

> **Synthetic data.** The individual repair requests are synthetic. The communities, house counts, hubs, road closures, airstrips, job mix, response clocks and cost ratios are real or sourced (see `research/RESEARCH.md`)."""),
    code("""import sys, json
sys.path.insert(0, '../src')
import pandas as pd, numpy as np
from reachnt import geo, intake, synth, urgency, planner, explain, simulate
from reachnt.config import OUTPUTS, params, taxonomy
pd.set_option('display.width', 160)
N = json.loads((OUTPUTS / 'numbers.json').read_text())"""),
    md("""## 1. Where the houses are

70 remote communities from the 2023 NIAA review of the NT remote housing partnership (house counts estimated from its overcrowding table), matched to NTG coordinates, assigned to the nearest of five crew hubs. Access bands use the Nous (2017) travel thresholds, the NT road-restriction register and an airstrip check."""),
    code("""com = geo.load_communities()
com.groupby(['hub', 'band']).agg(communities=('community', 'count'), houses=('houses_est', 'sum'))"""),
    md("""## 1b. H3 run zones

Each community gets H3 cells (Uber's hexagonal grid, h3geo.org). Two communities served from the same hub share a trip when their resolution-4 cells (about 1,770 km²) are within two rings."""),
    code("""import h3
pairs = geo.run_pairs(com)
print(len(pairs), 'run-zone pairs')
names = com.set_index('cid').community
pairs.assign(a=pairs.a.map(names), b=pairs.b.map(names)).sort_values('km').head(10).round(1)"""),
    code("""ng = com.set_index('community').loc['NGUKURR']
print('Ngukurr res-7 cell', ng.h3_r7, '| res-4 cell', ng.h3_r4)
print('a synthetic house cell (res 10):', geo.house_cell(ng.cid, 12, (ng.lat, ng.lon), False))
print('res-5 cells within 3 rings:', len(h3.grid_disk(ng.h3_r5, 3)))"""),
    md("""## 2. Reading a fault report

Phrase rules (from `config/taxonomy.yaml`, shared with the web prototype) plus a TF-IDF / logistic regression model. If either is unsure, or the text contains a danger word, a person checks."""),
    code("""tr = synth.labelled_corpus(60, 'train', 1)
clf = intake.Classifier().fit(tr.text, tr.hazard)
for t in ['power point is sparking and the baby sleeps there',
          'nothing comes out of the taps',
          'black marks and melting on the power point',
          'cockroaches everywhere',
          'pls come']:
    r = intake.read(t, clf)
    print(f'{t!r:55} -> {r.hazard:18} person={r.needs_human}  {r.reasons[:1]}')"""),
    md("""### How well does it read wording it has never seen?

The test set uses phrasings kept out of training. Accuracy drops on new wording, so the safety net (send to a person) matters more than the model."""),
    code("""pd.DataFrame({(s, k): v for s in ['seen', 'heldout'] for k, v in N['reader'][s].items() if k != 'n'}).T.round(3)"""),
    md("""## 3. Need-only urgency

The score's inputs are the fault, what the report says about who lives there, and days waited. Distance, cost, community and region are not inputs (a test enforces this)."""),
    code("""for hz, mods in [('electrical_danger', {}), ('hot_water', {'vulnerable': 1}), ('toilet_blocked', {}), ('pests', {})]:
    print(hz, urgency.score(hz, mods).parts())
print('Clocks (calendar days): equal urgent', urgency.clock_days('urgent', True, 'equal'),
      '| official remote urgent', urgency.clock_days('urgent', True, 'official'),
      '| official town urgent', urgency.clock_days('urgent', False, 'official'))"""),
    md("""## 4. Why town always looks cheaper

One job sent alone to a very remote community is almost all travel, matching Nous (2017): "up to 96 per cent". Batch ten jobs and the share falls."""),
    code("""pd.DataFrame(N['calibration']).T.round(2)"""),
    md("""## 5. One year under each setting

The weekly planner (OR-Tools CP-SAT) chooses trips per hub and trade. Settings differ only in how each job is valued and how much travel cost counts (λ, points per dollar)."""),
    code("""P = pd.DataFrame([{k: v for k, v in s.items() if k != 'bands'} for s in N['policies'].values()])
P[['key', 'label', 'cost_per_job', 'total_cost', 'urgent_p90_town', 'urgent_p90_remote', 'overdue_equal_remote', 'harm_days_total', 'air_trips']].round(2)"""),
    code("""from IPython.display import Image
Image(filename=str(OUTPUTS / 'figures' / 'fig2_frontier.png'))"""),
    code("""B = pd.read_csv(OUTPUTS / 'bands.csv')
B[B.key.isin(['cheapest_1', 'guarantee_0.2', 'guarantee_0.2_h3'])].pivot(index='band', columns='key', values='urgent_p90').round(0)"""),
    md("""## 6. Does the answer survive the assumptions?

Crew capacity, the wet-season cut share, the charter rate and a second random year, changed one at a time."""),
    code("""S = pd.DataFrame(N['sensitivity'])
S.pivot_table(index=['param', 'value'], columns='policy', values=['cost_per_job', 'urgent_p90_remote']).round(0) if len(S) else 'run python run_all.py (without --quick) for the sweep'"""),
    md("""## 7. What a tenant is told

Built from the job's weekly reason log and the signed decision record."""),
    code("""jobs = pd.read_parquet(OUTPUTS / 'jobs_cheapest_1.parquet').merge(pd.read_parquet(OUTPUTS / 'reasons_cheapest_1.parquet'), on='job_id')
j = jobs[(~jobs.town) & (jobs.category == 'urgent')].sort_values('wait_days').iloc[-50].to_dict()
j['reason_log'] = json.loads(j['reason_log'])
place = com.set_index('cid').loc[j['site'], 'community'].title()
ex = explain.tenant_explanation(j, place, dict(policy='cheapest', role='coordinator', date='(no decision recorded)'),
                                com.set_index('cid').loc[j['site']].to_dict())
print(ex['short'], '\\n')
for t, b in ex['sections']:
    print(t.upper()); print(b, '\\n')"""),
]
nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3"}
Path(__file__).resolve().parents[1].joinpath("notebooks", "01_walkthrough.ipynb").write_text(nbf.writes(nb))
print("wrote notebooks/01_walkthrough.ipynb")
