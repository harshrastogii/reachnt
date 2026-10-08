---
title: ReachNT
subtitle: Remote repair triage that ranks by need, shares trips with H3 hexagons, and makes someone sign for who waits
kind: Data analysis report
event: "CDU IT Code Fair 2026, Artificial Intelligence Challenge: Housing maintenance triage"
team: Team AIC015
team_name: Top Enders
members:
  - "Harsh Rastogi (386401): research (including the deep dive into H3), data pipeline, trip-planning engine, ReachNT portal, report"
  - "Aashish (385593): research; proposed Uber's H3 hexagon grid, which became ReachNT's shared-trip method"
date: 8 October 2026
acknowledgement: We acknowledge the Larrakia people, Traditional Owners of the land on which Charles Darwin University's Darwin campuses stand, and the Traditional Owners of all the Country this report discusses. This report contains no images, names or voices of people. All repair requests in it are synthetic.
---

# Summary

Remote NT public housing has too few trades and very long distances; an emergency job in a very remote community can cost several times the same job in town, mostly in travel [6]. A schedule built to clear the most jobs per dollar keeps choosing town, and nobody decides that remote tenants wait.

ReachNT ranks fault reports by need alone: never by distance, cost, when or how a tenant reported, how much they said, or their English. Whoever the tenant tells asks the same short questions. ReachNT plans weekly trips around crew hours, road closures and airstrips, using Uber's H3 hexagonal grid to let one tradesperson serve neighbouring communities on one trip. It shows what each setting costs and who waits, and a named person signs one. A person can change urgency any time; a missed visit is reassigned without losing its place.

On real NT geography with synthetic requests ({{N['communities']}} communities, {{N['remote_houses'] + N['town_houses']:,}} houses, {{N['requests']:,}} requests), planning for the cheapest jobs cost {{money(C0['cost_per_job'])}} per repair, but 9 in 10 urgent remote repairs took up to {{d(C0['urgent_p90_remote'])}} days, against {{d(C0['urgent_p90_town'])}} in town. ReachNT cost {{money(R['cost_per_job'])}} ({{pct(R['cost_per_job'] / C0['cost_per_job'] - 1)}} more), fixed 9 in 10 urgent remote repairs within {{d(R['urgent_p90_remote'])}} days, and cut the days households lived with faults by {{pct(1 - R['harm_days_total'] / C0['harm_days_total'])}}. Shared trips saved {{money(G['cost_per_job'] - R['cost_per_job'])}} per repair. The standard questions cut the points lost for saying little from {{d(IN['words']['gap_mean'])}} to {{IN['intake']['gap_mean']:.0f}}. We recommend DHLGCD publish its triage rules, ask every tenant the same questions, record who accepts each trade-off, and co-design with communities first.

# 1 Introduction

## 1.1 The problem

The NT Government manages 5,058 remote public housing dwellings in 73 communities [1]. In December 2022, 55% of remote houses were overcrowded [2]. In 2022–23, 54% of First Nations households in very remote areas had major structural problems, against 25% in major cities [4]. Tenants report faults by phone (1800 104 076) or to a local Community Housing Officer, and the Department sorts each job into one of three categories with a response time [5]:

TABLE: Table 1. NT response times for public housing repairs (DHLGCD Fact sheet FS17, version 10/25).
| Category | Town | Remote |
|---|---|---|
| Immediate (dangerous) | 4 hours | 4 hours; a Remote Housing Maintenance Officer makes it safe if no contractor is available |
| Urgent | 2 business days | 5 business days |
| Routine | 10 business days | 25 business days |

The published standard already gives remote houses two and a half times as long. Costs explain why: emergency repairs cost 8.5 times more in very remote communities than in remote ones, and travel can be 96% of an emergency job's cost, against 11–37% for planned work [6]. On the APY Lands, Housing SA batched about ten work orders per travel order [7].

In 2015, tenants at Santa Teresa listed more than 600 repairs. The Tribunal (2018) and the Court of Appeal (2022) held that public housing must be at least safe, and in 2023 the High Court allowed compensation for the distress of living in unrepaired homes [11]. The ANAO found that community housing organisations could not tell tenants where their repairs were up to, because they had no access to the IT systems [10].

## 1.2 Purpose and scope

The brief asks for a tool that reads free-text fault reports, ranks jobs by urgency, safety and logistics, explains each job's place, makes the equity trade-off visible and leaves the decision with a person. We add one rule: urgency and logistics are separate steps. Urgency is about the tenant's need; logistics is about getting a tradesperson there. A single priority score that mixes them is how distance gets into "priority" without anyone choosing it.

The scope is responsive repairs in the 70 remote communities listed in the 2023 review of the NT remote housing partnership [2] and in the five towns their trades work from. Planned maintenance, homelands and town camps are out of scope.

## 1.3 Who it is for

The ReachNT portal has three views of the same record: the regional coordinator (queue, trips, checks, the trade-off and sign-off), the tradesperson (a run sheet that works without signal), and the tenant (a repair tracker and a text message a Community Housing Officer or interpreter can read out). Reports come in through whoever the tenant tells: repairs-line staff, the Community Housing Officer, the maintenance officer, a tradesperson, or the tenant in the app. The coordinator does not enter them; they check urgency and decide who goes when a visit misses.

# 2 Methodology

## 2.1 Data

No public dataset of NT repair requests exists; the Menzies evaluation of Healthy Homes could not obtain job-level data either [9]. We built a real setting and filled it with synthetic requests. The 70 communities and their 4,481 houses come from the 2023 NPRH review [2], coordinates from the NTG communities list, the 3,864 hub-town houses from the 2021 Census, wet-season closures from the NT road-restriction register, airstrips from OurAirports, response clocks from FS17 [5] and s 63 [16], health order from Healthabitat [8], and the job mix and cost structure from Grealy et al. [7] and Nous [6] (Table C1). Every output carries a "synthetic" label.

Each community belongs to the nearest of five crew bases (Darwin, Katherine, Tennant Creek, Alice Springs, Nhulunbuy) by travel time. Access bands follow Nous: more than 2 hours is remote, more than 6 very remote. Ten island communities are fly-in only; 23 are cut by road in some wet-season weeks (Figure 1).

## 2.2 Reading a fault report

Phrase rules, written from the FS17 examples and the s 63 emergency list, match 23 fault types (including damp and mould, which England's 2025 Awaab's Law singles out) and four modifiers (vulnerable occupant, crowded house, repeat report, negation). A TF-IDF and logistic regression model (scikit-learn) catches wording the rules miss. A person reads the report when no rule matches and the model is under 55% sure, when the two disagree on category, when the model gives 25% or more to a dangerous fault, or when a danger word (smoke, melting, sparks, sewage) appears in a reading that is not Immediate. A negated danger ("no sparks now") stays Immediate and goes to a person: the reader never downgrades danger on its own. Both the Python engine and the portal use the same rules file.

## 2.3 Need-only urgency

Category sets the clock. Inside a category, points order the line:

**points = category (1000/500/100) + harm (0–100) + Healthy Living Practice (Safety 40 down to HLP 9 at 4) + who lives there (vulnerable +25, crowded +10) + repeat report (+10) + waiting (+3 a day past half the clock)**

Harm values adapt the HHSRS severity weighting [14]. The waiting term means no job waits forever. The only inputs are the fault, what the report says and days waited; a unit test fails if distance, cost, region or community appear in the function.

FIGURE: outputs/figures/fig1_map.png | 11.5 | Figure 1. The 70 communities by access band, each community's H3 resolution-4 hexagon, and the 68 possible shared trips (pairs of communities within two hexagon rings that can share a trip).

## 2.4 H3 hexagons

H3 is Uber's open-source hierarchical grid of hexagons [21]. Every point sits in one cell at each of 16 resolutions, and each finer level is about a seventh of the area. A hexagon has six neighbours, all the same distance from its centre, so "every cell within k rings" is a fair circle in every direction; square grids such as S2 have edge and corner neighbours at two distances [21]. ReachNT uses H3 four ways:
1. **Shared trips.** Two communities served from the same hub share one trip when their resolution-4 cells (about 1,770 km²) are within two rings, about 90 km. That gives 68 pairs, such as Ngukurr and Rittarangu, and the three Tiwi communities.
2. **While you're out there.** A tradesperson's phone lists open jobs in their trade within three resolution-5 rings of the communities on their run.
3. **A house is a hexagon.** Operational records hold a house ID and its resolution-10 cell (a 76 m hexagon), never an address.
4. **Publishing.** Anything shown outside the Department is grouped into resolution-6 cells (36 km²) and hidden below five jobs.

H3 does not know where roads are, so ReachNT pairs it with the road-restriction register and live closures for travel.

## 2.5 Planning trips

Each week, for each hub and trade, a constraint solver (Google OR-Tools CP-SAT) chooses which communities get a visit, alone or on a shared trip, and which jobs are done. It maximises job value minus λ × cost, where λ is the weight on money, within each tradesperson's 40 hours, travel included. A road trip costs vehicle running plus driving time, a fly-in costs a charter for both legs, and a run zone costs hub → A → B → hub. A community with a cut road and no airstrip cannot be reached. With these costs, one job sent alone to Kintore is 92% travel, inside Nous's "up to 96%"; ten jobs on the trip bring it to 57% (Appendix D).

Settings differ in how each job is valued, in λ, and in whether shared trips are allowed:
1. **Cheapest jobs first**: every job is worth the same; λ = 1.
2. **Cheapest first + urgent guarantee**: as 1, plus a large bonus for an urgent job about to pass the equal clock (2 business days everywhere).
3. **Need first, official allowance**: need points, deadline bonus against FS17's remote clocks; λ = 0.2.
4. **Need first + urgent guarantee**: need points and the guarantee against the equal clock; λ = 0.2 or 0.5.
5. **ReachNT**: setting 4 with H3 shared trips. Setting 1 is also run with shared trips.
6. **Need first without a guarantee**: λ from 0 to 0.8, to trace the whole curve.

## 2.6 Simulation, explanation and the ledger

Requests arrive at 4 per house per year, 25% more in the wet season, with faults drawn from the APY job mix; 30% use wording the reader was not trained on. One year (52 weeks plus 8 to clear the backlog) runs under each setting, with {{N['crews_total']}} tradespeople sized at 1.3 times expected job hours. A second report of the same fault at the same house, while the first is open, joins that job and is fixed on the same visit; an Immediate fault is made safe the day it is reported, and fixing it is a second clock. The solver is single-threaded with a fixed seed, so every run gives the same numbers.

**How to read our numbers.** *Cost per repair* is everything spent in the year (labour, travel, charters, overnight stays) divided by the repairs done. *9 in 10 fixed within* is the number of days by which 9 out of 10 urgent repairs were done (the 90th percentile). *Fault-days* add up every day a household lived with an unfixed fault; a dangerous fault counts more than a small one.

Each week a job is not done, the planner logs the reason: road cut, no trip because of cost, crew fully booked, or the trip came but did higher-scoring jobs first. The tenant's answer is assembled from that log, the score parts and the signed decision record, so it can only state reasons that happened. A test checks each section reads at Flesch 50 or above.

## 2.7 Personal information and the database

ReachNT will hold names, phone numbers and addresses, so the design keeps them in one place (Appendix F). A `pii` schema holds them encrypted with pgcrypto, readable only by intake staff through a function that logs every read. The `ops` schema holds work keyed by house ID and H3 cell. Row-level security limits a tradesperson to their trips and nearby open jobs, a tenant to their own jobs, and the public to resolution-6 summaries. The decision ledger is append-only, each row hashing the one before it. Everything runs on PostgreSQL, PostGIS and h3-pg, all free and open source: on NT Government servers for $0 in licences, or for a pilot on Neon's Sydney region, which supports all three; its free tier has 1 GB and 100 compute-hours a project [22]. A year of data is under 1 GB.

## 2.8 Inclusive intake and decisions

Household points (a baby, an elder, a crowded house, a repeat) used to come only from the tenant's words, so a household could lose up to 45 points by saying less. Now whoever the tenant tells asks the same six questions, with a free interpreter where needed (Aboriginal Interpreter Service, TIS National, National Relay Service); the tenancy record gives household size and the job history gives repeats. Any "yes" counts; an unanswered question never removes points. The clock starts when the tenant first told anyone. Channel, language and timing are never scored (a unit test checks). A person can raise urgency at any time; lowering a dangerous repair needs someone who spoke to the tenant or saw it. A missed visit goes to the next trip, a named crew or any contractor of that trade, keeping its wait and deadline boost (Appendix I).

# 3 Findings

## 3.1 Left alone, efficiency pushes remote repairs to the back

Under cheapest-jobs-first, town tenants got 90% of urgent repairs within {{d(C0['urgent_p90_town'])}} days. Remote tenants waited up to {{d(C0['urgent_p90_remote'])}} days, and {{pct(C0['overdue_equal_remote'])}} of their urgent repairs passed the 2-day equal clock ({{pct(C0['overdue_official_remote'])}} passed even the official 5-day remote clock). Fault-days, the danger of each fault times the days it stayed unfixed, totalled {{round(C0['harm_days_total'], -3):,.0f}}, and {{C0['open_at_end']}} jobs were still open after the extra eight weeks. No setting cost less per job, which is why it looks reasonable on a cost report.

## 3.2 The trade-off, priced

Figure 2 places every setting on two charts. ReachNT cost {{money(R['cost_per_job'])}} per repair against {{money(C0['cost_per_job'])}}, an extra {{money(R['cost_per_job'] - C0['cost_per_job'])}} per repair or {{m(R['total_cost'] - C0['total_cost'])}} a year across the five hubs. For that, fault-days fell {{pct(1 - R['harm_days_total'] / C0['harm_days_total'])}} ({{round(C0['harm_days_total'], -3):,.0f}} to {{round(R['harm_days_total'], -2):,.0f}}) and the time to fix 9 in 10 urgent remote repairs fell from {{d(C0['urgent_p90_remote'])}} days to {{d(R['urgent_p90_remote'])}}. The guarantee protects urgent jobs: need ranking without it (λ = 0.4) cost {{money(L4['cost_per_job'])}} per repair and left urgent remote repairs at {{d(L4['urgent_p90_remote'])}} days. Ignoring cost altogether cost {{money(N0['cost_per_job'])}} per repair for {{pct(1 - N0['harm_days_total'] / R['harm_days_total'])}} fewer fault-days than ReachNT.

## 3.3 What shared trips changed

Against the same setting without them, shared trips cut cost per repair from {{money(G['cost_per_job'])}} to {{money(R['cost_per_job'])}} and fault-days from {{round(G['harm_days_total'], -2):,.0f}} to {{round(R['harm_days_total'], -2):,.0f}}. Communities cut in the wet went from {{d(band(G, 'Remote, cut in the wet'))}} to {{d(band(R, 'Remote, cut in the wet'))}} days at the 90th percentile for urgent repairs. With a tighter budget (λ = 0.5), ReachNT cost {{money(RT['cost_per_job'])}} per repair, less than cheapest-first with a guarantee ({{money(F['cost_per_job'])}}), with fewer fault-days ({{round(RT['harm_days_total'], -3):,.0f}} against {{round(F['harm_days_total'], -3):,.0f}}). Even cheapest-first gains from shared trips ({{round(C0['harm_days_total'], -3):,.0f}} to {{round(CH['harm_days_total'], -3):,.0f}} fault-days).

FIGURE: outputs/figures/fig2_frontier.png | 16.0 | Figure 2. Average cost per repair against total fault-days (left) and against the remote urgent wait (right): days until 9 in 10 urgent remote repairs are fixed. One synthetic year, whole NT. Hexagon markers use shared trips.

## 3.4 Where the wait lands

Under cheapest-first, communities cut in the wet waited up to {{d(band(C0, 'Remote, cut in the wet'))}} days for 9 in 10 urgent repairs, and islands {{d(band(C0, 'Island (fly-in)'))}} (Figure 3). ReachNT brought these to {{d(band(R, 'Remote, cut in the wet'))}} and {{d(band(R, 'Island (fly-in)'))}}. The hardest to serve are small, very remote road communities, where 90% of urgent repairs still took up to {{d(band(R, 'Very remote (road)'))}} days: few jobs share the cost of a long drive, and few have a neighbour within two rings.

FIGURE: outputs/figures/fig3_band_waits.png | 15.0 | Figure 3. Days until 9 in 10 urgent repairs are fixed, by how hard the place is to reach.

## 3.5 Why jobs waited

The reason log (Figure 4) separates causes that look the same to a tenant. Under cheapest-first, most remote waiting was a cost decision. Under ReachNT, most of it was a fully booked crew, which calls for more trades or local trades, and a different answer to the tenant.

FIGURE: outputs/figures/fig4_reasons.png | 15.0 | Figure 4. Job-weeks remote jobs spent waiting, by the reason the planner logged.

## 3.6 Reading free text is the weak link

TABLE: Table 2. Reader accuracy on synthetic reports. "New wording" uses phrasings kept out of training.
| Measure | Familiar wording ({{N['reader']['seen']['n']}}) | New wording ({{N['reader']['heldout']['n']}}) |
|---|---|---|
| Spotting a dangerous fault, model ROC-AUC (0.5 = guessing) | {{Qr['seen']['danger']['roc_auc']:.2f}} | {{Qr['heldout']['danger']['roc_auc']:.2f}} |
| Spotting a dangerous fault, model PR-AUC (guessing = {{Qr['heldout']['danger']['pr_auc_baseline']:.2f}}) | {{Qr['seen']['danger']['pr_auc']:.2f}} | {{Qr['heldout']['danger']['pr_auc']:.2f}} |
| Category correct, rules only | {{pct(N['reader']['seen']['rules']['category_acc'])}} | {{pct(N['reader']['heldout']['rules']['category_acc'])}} |
| Category correct, model only | {{pct(N['reader']['seen']['model']['category_acc'])}} | {{pct(N['reader']['heldout']['model']['category_acc'])}} |
| Category correct, combined | {{pct(N['reader']['seen']['combined']['category_acc'])}} | {{pct(N['reader']['heldout']['combined']['category_acc'])}} |
| Under-triaged and not sent to a person | {{N['reader']['seen']['combined']['under_triaged_unflagged']*100:.1f}}% | {{N['reader']['heldout']['combined']['under_triaged_unflagged']*100:.1f}}% |
| Dangerous fault missed and not sent to a person | {{N['reader']['seen']['combined']['danger_missed']*100:.1f}}% | {{N['reader']['heldout']['combined']['danger_missed']*100:.1f}}% |
| Sent to a person | {{pct(N['reader']['seen']['combined']['to_person'])}} | {{pct(N['reader']['heldout']['combined']['to_person'])}} |

On new wording the model alone is only moderately good at spotting danger, and its confidence is not honest. The safety net works only because it sends four in ten reports to a person. Appendix G has the full measures: calibration, cross-validation, ranking agreement, solver gaps, and the results in four more random years. Real reports will come in Aboriginal English, Kriol and other languages [20], which synthetic English cannot test.

## 3.7 Sensitivity

SENSITIVITY_SENTENCE

## 3.8 Saying less, and missed visits

We described 3,000 synthetic households in full and in a few words. From the words alone, the short telling lost {{IN['words']['gap_mean']:.0f}} points on average, ranked lower {{pct(IN['words']['short_ranked_lower'])}} of the time, and only {{pct(IN['words']['vulnerable_recognised_short'])}} of vulnerable households were recognised. With the standard questions it lost {{IN['intake']['gap_mean']:.1f}} and ranked lower {{pct(IN['intake']['short_ranked_lower'])}} of the time (unanswered questions, assumed 1 in 10); {{pct(IN['intake']['vulnerable_recognised_short'])}} were recognised. When 1 in 10 booked visits missed, ReachNT still fixed 9 in 10 of the missed urgent remote repairs within {{d(MV['guarantee_0.2_h3'][1]['urgent_remote_missed_p90'])}} days, against {{d(MV['cheapest_1'][1]['urgent_remote_missed_p90'])}} under cheapest-first, because a missed job keeps its clock and gets the deadline boost. Misses cost ReachNT {{money(MV['guarantee_0.2_h3'][1]['cost_per_job'] - MV['guarantee_0.2_h3'][0]['cost_per_job'])}} per repair and moved its remote urgent 90th percentile from {{d(MV['guarantee_0.2_h3'][0]['urgent_p90_remote'])}} to {{d(MV['guarantee_0.2_h3'][1]['urgent_p90_remote'])}} days.

# 4 Discussion

## 4.1 Ethical impacts

The brief names the risk: efficiency quietly decides who waits. ReachNT answers it three ways. The urgency score cannot see place. The equity cost is shown in dollars and days before anyone chooses. The choice is signed, so a tenant told "this was a cost decision" can see who made it and when. This follows the Robodebt Royal Commission's call for plain-language information about automated decisions and a path to review, and the Ombudsman's better practice guide [17]. ReachNT recommends and a person decides. Immediate jobs are always confirmed by phone and made safe by a local officer.

The score uses what is known about the household (a baby, an elder, a crowded house). Taken from the tenant's words alone, that rewarded people who say more; ReachNT takes it from the same questions on every channel, the tenancy record and the job history (§2.8, §3.8), and no one gains a place by reporting earlier, online or in better English. Privacy Act transparency rules for automated decisions start on 10 December 2026 for organisations they cover, which may include contractors [18].

## 4.2 Cultural and community impacts

Most remote tenants are Aboriginal, and many speak Kriol, Aboriginal English or another Aboriginal language first [20]. A reader trained on standard English will under-read them, as Table 2 shows on unfamiliar wording. ReachNT is an assistant to intake staff, never machine-translates into Aboriginal languages, and writes answers to be read out with a Community Housing Officer or interpreter.

Community-level results are sensitive: a map of long waits can read as a judgement on the community rather than the service. Under the CARE principles and Closing the Gap Priority Reform 4, communities should see the data the Department uses, first [19]. The portal uses satellite imagery of Country rather than Aboriginal art; any artwork would be commissioned and licensed through an Aboriginal art centre under the Creative Australia protocols [23]. No community has seen ReachNT. Co-design with tenants, Aboriginal Housing NT, land councils and the Aboriginal Business Enterprises that hold maintenance contracts [9] must come before any use.

## 4.3 Limitations

The requests are synthetic, so absolute numbers are illustrations and the comparisons between settings are the finding. Travel uses straight-line distance at a blended road speed, and wet-season cuts outside the register are an assumption. Weekly planning means even town jobs can miss a 2-business-day clock by a few days. Shared trips pair two communities; longer chains would save more. A pilot needs work-order history from the Department's TMS and ASNEX systems [9].

# 5 Recommendations

**For DHLGCD:**
1. Keep urgency and logistics as separate, published steps; ask every tenant the same short questions on every channel, start the clock at first contact, and test that location, channel and language are not inputs to urgency.
2. Make the remote allowance in FS17 an explicit, signed decision, reviewed each quarter with its cost and its effect on remote waits, and report urgent waits by access band.
3. Plan trips on H3 shared trips, and give Community Housing Officers and tenants read access to each job's status and logged reasons, which closes the gap the ANAO found [10].
4. Build on PostgreSQL, PostGIS and h3-pg, hosted in Australia, with personal details in an encrypted vault and public outputs at resolution 6.

**For contractors and industry:**
5. Log a reason for every week a job waits and evidence for every missed visit, so cost decisions can be told apart from capacity shortfalls and a missed job is reassigned without losing its place.
6. Price charters, batching and shared trips into contracts, and train local tradespeople in the communities that wait longest.

**For communities and their organisations:**
7. Co-design the tenant answer, the intake questions and the fault vocabulary in local languages with tenants, Aboriginal Housing NT and the Aboriginal Interpreter Service, under ethics approval and land council research permits.
8. Hold the decision ledger to account through local authorities and tenant groups, and give every tenant a way to ask a person to review their ranking, answered within 10 working days.

# References

1. Department of Housing, Local Government and Community Development (DHLGCD) (2024). The delivery and success of the remote housing program. https://dhlgcd.nt.gov.au/news/2024/the-delivery-and-success-of-the-remote-housing-program
2. PwC's Indigenous Consulting for NIAA (2023). Review of the National Partnership for Remote Housing Northern Territory. https://federalfinancialrelations.gov.au/sites/federalfinancialrelations.gov.au/files/2023-06/review-nat-partnership-remote-housing-nt.pdf
3. Productivity Commission. Closing the Gap dashboard, Outcome area 9. https://www.pc.gov.au/closing-the-gap-data/dashboard/outcome-area/housing/
4. AIHW. Indigenous Health Performance Framework, measure 2.02 Access to functional housing with utilities. https://www.indigenoushpf.gov.au/measures/2-02-access-to-functional-housing-with-utilities
5. DHLGCD (2025). Fact sheet FS17, Repairs and maintenance (version 10/25). https://dhlgcd.nt.gov.au/media/documents/fact-sheets/repairs-and-maintenance-fs17.pdf
6. Nous Group (2017). Efficient system costs of remote Indigenous housing, report to PM&C. https://www.niaa.gov.au/sites/default/files/documents/publications/Nous-Group-Final-Report-Efficient-system-costs-of-remote-Indigenous-housing.pdf
7. Grealy, L. et al. (2022). Sustaining housing through planned maintenance in remote central Australia. Housing Studies (accepted manuscript). https://www.hfhincubator.org/wp-content/uploads/2025/12/Grealy-et-al.-2022.-Sustaining-Housing-through-Planned-Maintenance-in-Remote-Central-Australia.pdf
8. Healthabitat. Safety and the 9 Healthy Living Practices. https://www.healthabitat.com/what-we-do/safety-and-the-9-healthy-living-practices/
9. Grealy, L., Su, J-Y. and Thomas, D. (2023). Healthy Homes Monitoring and Evaluation Project: Final Report. Menzies School of Health Research. https://www.menzies.edu.au/content/Document/Healthy%20Homes%20Monitoring%20and%20Evaluation%20Project%20-%20Final%20Report.pdf
10. Australian National Audit Office (2022). Remote Housing in the Northern Territory, Auditor-General Report No. 18 2021–22. https://www.anao.gov.au/work/performance-audit/remote-housing-the-northern-territory
11. Grata Fund. The Ltyentye Apurte (Santa Teresa) community's fight for housing rights; High Court ruling. https://www.gratafund.org.au/santa_teresa_housing and https://www.gratafund.org.au/santa_highcourt_win
12. AIHW. Elective surgery waiting times by urgency category. https://www.aihw.gov.au/getmedia/4b7b0346-84b4-435c-bc91-a9beb65413f8/myhospitals-elective-surgery-data.pdf.aspx
13. UK Parliament (2025). Written statement HCWS739, Awaab's Law. https://questions-statements.parliament.uk/written-statements/detail/2025-06-25/hcws739
14. Office of the Deputy Prime Minister (2006). Housing Health and Safety Rating System Operating Guidance. https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/15810/142631.pdf
15. Bertsimas, D., Farias, V. and Trichakis, N. (2011). The price of fairness. Operations Research 59(1), 17–31.
16. Residential Tenancies Act 1999 (NT) s 63. https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/nt/consol_act/rta1999207/s63.html
17. Royal Commission into the Robodebt Scheme (2023). Report, Recommendation 17.1; Commonwealth Ombudsman (2025). Automated decision-making better practice guide. https://apo.org.au/node/306481
18. Gilbert + Tobin (2026). Automated decision-making transparency under the Privacy Act. https://www.gtlaw.com.au/insights/automated-decision-making-transparency-under-the-privacy-act
19. Global Indigenous Data Alliance. CARE Principles for Indigenous Data Governance. Carroll, S.R. et al. (2020), Data Science Journal 19(1):43, https://doi.org/10.5334/dsj-2020-043 ; NIAA (2024) Framework for Governance of Indigenous Data.
20. ABC News (2022). More than 80pc of Aboriginal people speak Kriol or Aboriginal English. https://www.abc.net.au/news/2022-05-05/kriol-aboriginal-english-tranlsation-interpreting/101005782
21. Brodsky, I. (2018). H3: Uber's Hexagonal Hierarchical Spatial Index. https://www.uber.com/au/en/blog/h3/ ; H3 documentation and S2 comparison. https://h3geo.org/docs/ ; https://github.com/uber/h3
22. Neon. Postgres extensions; regions; pricing. https://neon.com/docs/extensions/pg-extensions ; https://neon.com/docs/introduction/regions ; https://neon.com/pricing ; h3-pg: https://github.com/zachasme/h3-pg
23. Creative Australia. Protocols for using First Nations Cultural and Intellectual Property in the Arts. https://creative.gov.au/first-nations-arts/protocols-for-using-first-nations-cultural-and-intellectual-property-in-the-arts
24. Google OR-Tools (CP-SAT). https://developers.google.com/optimization ; scikit-learn. https://scikit-learn.org ; MapLibre GL JS. https://maplibre.org

# Appendix A: AI usage declaration

We used Claude (Anthropic) as a coding and writing assistant: to search for and summarise public sources, draft and review Python and JavaScript, and draft and edit report text. The NT sources behind the figures we quote (DHLGCD FS17, the NIAA review, Nous 2017, Grealy et al. 2022, the Menzies Healthy Homes evaluation, the ANAO audit) were read in full and the figures checked against them (links in research/sources/README.md). Other references, mainly overseas methods and legal context, were checked through their published summaries. All numbers in this report come from run_all.py through outputs/numbers.json. The team reviewed, tested and is responsible for all content. ReachNT itself uses no large language model: the reader is phrase rules plus a logistic regression, and tenant answers are assembled from logged facts.

# Appendix B: Code, portal and how to run

CODE:
pip install -r requirements.txt
python run_all.py                      rebuilds every number, figure and the portal data (about 15 minutes on 8 cores)
python run_all.py --quality           quality measures only (Appendix G)
python run_all.py --extras            the inclusion measure and the missed-visit experiment (section 3.8)
pytest -q tests                        75 checks: need-only urgency, inclusive intake, reader safety net, planner limits, missed visits, data integrity
node tests/test_api.mjs                 17 checks on the server: validation, no-access evidence, urgency changes, reassignment, sign-in rules
https://reachnt.vercel.app             the ReachNT portal, desktop and phone (or serve web/ locally); works offline
https://github.com/harshrastogii/reachnt   all code, data links and documents
notebooks/01_walkthrough.ipynb         the method step by step

Code: src/reachnt/ geo.py (communities, access, H3 cells and shared trips), synth.py, intake.py (reader), urgency.py (need score), planner.py (CP-SAT trips and shared trips), simulate.py, explain.py (tenant answers), experiments.py, evaluate.py (quality measures), figures.py, export_web.py. Parameters, each tagged as sourced or assumed: config/params.yaml. Fault taxonomy and the standard intake questions: config/taxonomy.yaml. Database: docs/schema.sql and docs/DATABASE.md. Inclusive decision model: docs/INCLUSIVE_DECISION_MODEL.md.

# Appendix C: Data sources and dataset links

TABLE: Table C1. Data sources. Job-level requests are synthetic; everything else is public.
| Source | What we take from it |
|---|---|
| NIAA/PwC's Indigenous Consulting (2023), Review of the NPRH NT, App. B [2] | 70 communities; houses estimated as overcrowded houses ÷ overcrowded share (4,481) |
| NTG remote communities list 2021 (CC BY) | Coordinates and land council for each community |
| ABS 2021 Census, Indigenous Profile I13 (CC BY 4.0) | Households renting from the housing authority in the five hub towns (3,864) |
| NT Annual Traffic Report 2023 restriction register (CC BY) | Wet-season closures for 14 communities, e.g. Lajamanu Road closed Nov–Apr |
| Road Report NT live feed; OurAirports | Current closures; airstrips within 8 km |
| DHLGCD FS17 [5]; RTA 1999 (NT) s 63 [16]; Healthabitat [8] | Response clocks; emergency repairs in law; order of health impact |
| Grealy et al. 2022, Table 3 [7]; Nous 2017 [6] | Job mix by trade (38,492 APY jobs); cost structure for calibration |
| Digital Earth Australia Landsat geomedian 2024; Esri World Imagery | Satellite basemap in the portal (offline and online) |

NTG remote communities list: https://data.nt.gov.au/dataset/remote-communities-with-mobile-coverage
ABS 2021 Census DataPacks (Indigenous Profile, ILOC): https://www.abs.gov.au/census/find-census-data/datapacks
NT Annual Traffic Report 2023: https://data.nt.gov.au/dataset/annual-traffic-report-2023
Road Report NT: https://roadreport.nt.gov.au
OurAirports: https://ourairports.com/data/
Digital Earth Australia Landsat geomedian: https://www.dea.ga.gov.au
ABS ASGS 2021 boundaries (coastline): https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3

# Appendix D: Assumptions and calibration

CALIBRATION_TABLE

# Appendix E: A tenant's answer (synthetic)

TENANT_EXAMPLE

# Appendix F: Who sees what

TABLE: Table F1. Data zones and access in the ReachNT database (docs/schema.sql).
| Zone | Holds | Who can read it |
|---|---|---|
| pii (vault) | Name, phone, address, language, interpreter need; all personal fields encrypted | Intake staff through a logged function; the tenant through a one-time code |
| ops (work) | Houses as ID + H3 res-10 cell, jobs, scores, trips, weekly reasons, decision ledger | Coordinator (own hub); tradesperson (own trips + open jobs within 3 res-5 rings); housing officer (own communities); analyst (no vault) |
| public (views) | Waits and fault-days by H3 res-6 cell and access band, cells under 5 jobs hidden | Anyone |

# Appendix G: How good are the algorithms?

QUALITY_APPENDIX

# Appendix H: Validation and accountability for a pilot

We checked ReachNT against the standards similar services now have to meet. The full list, with sources, is in docs/VALIDATION.md. The live portal has a strict content security policy, serves its libraries from its own site, and checks every update it receives. It shows zero WCAG 2.2 AA issues in every view, on desktop and phone. All 70 community positions were checked against satellite imagery.

ReachNT now follows the rules that would apply to a pilot. A plain-language notice of its automated decisions, with an AI transparency statement, meets the Privacy Act's transparency duty from 10 December 2026 (web/privacy.html). An AI impact assessment follows the format of the Commonwealth AI policy v2.0 (docs/AI_IMPACT_ASSESSMENT.md). Tenants can ask a person to review their ranking, and a person re-reads a weekly sample of the reader's work, as the Robodebt Royal Commission and the Commonwealth Ombudsman's guide recommend. "Made safe" and "fixed" are separate clocks, as in England's Awaab's Law. No job closes on an unevidenced "no one home", a failure the UK Housing Ombudsman found in 2025.

A person can check and change urgency at any time, a missed job is reassigned without losing its clock, and household points come from the same questions on every channel (Appendix I). Before real use, the reader must be tested on real reports, by language, with the Aboriginal Interpreter Service, following docs/REAL_LANGUAGE_TEST_PROTOCOL.md.

# Appendix I: The inclusive decision-making model

ReachNT's rule is that a repair's place in line follows need only: the fault, who lives in the house, and how long the household has waited. The model is written up in full in docs/INCLUSIVE_DECISION_MODEL.md.

TABLE: Table I1. What used to disadvantage a tenant, and what ReachNT does instead.
| Disadvantage | What ReachNT does |
|---|---|
| Saying less, limited English, a relayed message | The same six questions on every channel, read out by staff or an interpreter: anyone in danger now; a baby or young child; an elder; someone sick, pregnant or with a disability; how many people live there; told anyone before. The tenancy record gives household size (more than 2 people per bedroom is crowded) and the job history gives repeats. Any "yes" counts; "not asked" never removes points and triggers a call-back. |
| Language | Words kept as said. Free Aboriginal Interpreter Service, TIS National and National Relay Service. Language recorded only to book an interpreter, never scored. |
| Digital literacy, channel | Repairs line, Community Housing Officer, maintenance officer, tradesperson, front counter and app create the same record. Everything in the app can also be done by phone or through the housing officer. |
| Submission timing | The clock starts at first contact with anyone. The line is ordered by need; waiting adds 3 points a day only after half the clock, so no job waits forever and an early caller with a minor fault never jumps a dangerous one. |
| Unchecked machine decisions | A person can raise or confirm urgency at any time, from a call, a visit, a photo or a review. Lowering a dangerous repair needs someone who spoke to the tenant or saw the fault, and a reason the tenant reads. The reader can never lower danger. Enforced in the portal, the server and a database constraint. |

**When time runs short.** The planner values a job by its need points, adds 400 when its clock ends within 7 days and, under ReachNT, 6,000 more for an urgent or dangerous job, which puts it on the next trip. The coordinator sees the time left and this arithmetic on every waiting repair.

**When a visit misses.** The tradesperson records why ("No one home" and "Can't get in" need the time and what was tried). The job never closes. The coordinator sends it to the next trip, a named crew, or opens it to any contractor of that trade on the panel, including local Aboriginal Business Enterprises, where the first to accept gets it; "Needs another trade" changes the trade. A tenant or tradesperson can say it got worse, by phone, through the housing officer or in the app; a person calls back that day and records an urgency check. The tenant's timeline shows each check and each reassignment.
