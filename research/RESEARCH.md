# Housing maintenance triage in remote NT: background research

Research for the HMW: *How might we help a housing maintenance coordinator prioritise urgent repairs across remote NT communities without "efficiency" quietly pushing remote tenants to the back of the queue?*

Compiled 6 October 2026. Every figure below has a source in the list at the end, and documents we read in full are linked in `research/sources/README.md`. Where we could not verify something, we say so.

---

## 1. The problem in numbers

| Fact | Figure | Source |
|---|---|---|
| Remote public housing in the NT | 5,058 dwellings; 73 leased remote communities | DHLGCD [S1] |
| Remote communities in the NIAA review table | 70 parsed; ~4,480 houses (our estimate, from overcrowded count ÷ overcrowded %) | NIAA/PwC-IC review 2023, App. B [S2] |
| Remote houses overcrowded | 58.1% (Sep 2017) → 55.0% (Dec 2022) | [S2] |
| First Nations people in appropriately sized housing, NT | 43% in 2021 vs the 88% CtG Target 9a for 2031 | AIHW / PC CtG dashboard [S3] |
| First Nations households with major structural problems | 54% very remote, 25% major cities (2022–23) | AIHW HPF 2.02 [S4] |
| NT households lacking working facilities (2022–23) | food preparation 20%, washing clothes 13%, washing people 6%, sewerage 6% | [S4] |
| Official NT response times | Immediate 4 h (everywhere). Urgent 2 business days, **remote 5**. Routine 10 business days, **remote 25** | DHLGCD Fact sheet FS17 (10/25) [S5] |
| Cost of remoteness | Emergency repairs cost **8.5×** more in very remote than remote communities; planned work only 1.3× | Nous Group for PM&C 2017 [S6] |
| Travel share of cost | Travel up to **96%** of the per-unit cost of an emergency repair, vs 11–37% for planned work | [S6], Grealy et al. 2022 [S7] |
| Batching works | APY Lands: ~10 maintenance work orders per travel work order; P1–P5 priorities; most P5 jobs done within 2 weeks because trades work 2-week rotations | Grealy et al. 2022 [S7] |
| Job mix (APY, 371 houses, 2017–20, 38,492 jobs) | plumbing 29.5%, general 18.2%, electrical 15.4%, travel 12.7%, air-con 12.3%, pest 8.2%, waste 1.8%, building 1.5% | [S7] Table 3 |
| Cause of faults found by Housing for Health | 74% lack of routine maintenance, 19% faulty construction, 7% damage or misuse | Healthabitat [S8] |
| Preventive inspections actually done | Condition Assessment Tool inspections reached only **23.9%** of remote houses (Jul 2021 – Feb 2023) | Menzies Healthy Homes evaluation [S9] |
| Data the evaluators could not get | breakdown of immediate/urgent/routine jobs by community; expenditure by contract; trade-type breakdown | [S9] |
| Tenant information gap | Community housing organisations lack IT access, so they cannot answer tenants' questions about the status of repair requests | ANAO Report 18 2021–22 [S10] |
| Legal floor | Tenants are owed housing that is "at least safe" (Santa Teresa, NTCAT 2018; NTCA 2022); the High Court (Nov 2023) allowed compensation for distress over unrepaired homes | Grata Fund, ABC [S11] |

**What this means for the design.** "It's cheaper to fix the town first" is measurably true: one emergency call-out to a very remote community can cost several times as much as the same job in town, and most of that is travel [S6]. The official service standard already builds in a remote allowance (5 vs 2 business days for urgent work; 25 vs 10 for routine work) [S5]. A cost-minimising scheduler will push remote jobs back further than that, and nobody will have decided it. Our product's job is to make that decision visible and make a person own it.

## 2. How triage works today (what exists)

**NT Government (DHLGCD):**
- Tenants report by phone (1800 104 076), to a local Community Housing Officer, or to a Housing Maintenance Officer [S5].
- The Department classifies each job as immediate, urgent or routine and orders a contractor. In remote areas Housing Maintenance Officers "assess and make safe" when no contractor is available [S5].
- Healthy Homes (from July 2021): 31 maintenance contracts went to 22 companies, 25 of them to 17 Aboriginal Business Enterprises, covering 49 communities [S9]. Contracts are short (15–22 months), and non-urgent works over $500 need a DIPL superintendent's approval [S9].
- Systems in use: ASNEX (Assets Systems Nexus), AIS (Asset Information System), TMS (Tenancy Management System), with reporting through CBIS [S9]. The Condition Assessment Tool rates each component 0–5 (fail-immediate, fail-urgent, poor, fair, good, new), but it is paper-based and hard to turn into work orders [S9].

**Elsewhere in Australia:**
- *Housing SA, APY Lands*: programmed visits by licensed trades on two-week rotations, P1–P5 responsive priority codes, and trades who report other-trade faults they notice on site. Batching lowered travel costs [S7].
- *Housing for Health (Healthabitat)*: survey-and-fix of about 250 items per house in a fixed order: **Safety first, then the 9 Healthy Living Practices** (1 washing people, 2 washing clothes and bedding, 3 removing waste water, 4 food storage and cooking, 5 crowding impacts, 6 animals, insects and vermin, 7 dust, 8 temperature, 9 trauma hazards) [S8]. This is the most defensible public severity order for remote Aboriginal housing.
- *Elective surgery urgency categories*: Category 1 within 30 days, Category 2 within 90, Category 3 within 365, with "overdue" counted and published per category [S12]. The clock depends on need, not on where you live. We copy that pattern.

**Overseas:**
- *Awaab's Law (England, from 27 Oct 2025)*: social landlords must investigate and make safe emergency hazards within 24 h, and investigate significant hazards within 10 working days, then **give the tenant a written summary within 3 working days** [S13]. That is a legal right to an explanation.
- *HHSRS (England)*: hazard score = Σ over harm classes of class weight (10,000 / 1,000 / 300 / 10) ÷ likelihood × spread of harms [S14]. A transparent severity × likelihood method we adapt.
- *AI repairs triage in UK housing associations*: chatbots, photo diagnosis and automatic schedule-of-rates coding. One case study claims a 33% faster first response (Stonewater) [S15]. These tools optimise speed. None we found reports whether the gains are shared fairly across places or tenants.

**Gap.** No tool we found shows a coordinator the equity cost of an efficient schedule, records who accepted it, or answers a tenant's "why am I still waiting?" with the actual reason. In the NT the ANAO found that the people tenants ask cannot even see job status [S10].

## 3. Law, ethics and governance that bind the design

- **Residential Tenancies Act 1999 (NT) s 63**: the Tribunal can order *emergency repairs*: burst water service; failure of gas, electricity or water supply; failure of an essential service or appliance for water or cooking; a fault that makes premises unsafe or insecure; a fault likely to injure, damage property or unduly inconvenience; serious faults affecting access [S16]. Our "Immediate/Urgent" rules map to this list, and the tenant explanation tells people about this right.
- **Automated decision-making**: the Robodebt Royal Commission (Rec 17.1) calls for plain-language public information on how automated decisions work, a review path, and business rules open to scrutiny [S17]. The Commonwealth Ombudsman/OAIC/AGD *ADM Better Practice Guide* (Mar 2025) [S17]. Privacy Act ADM transparency duties start **10 Dec 2026** for APP entities, which may include contractors; NT agencies are covered by the NT *Information Act 2002* IPPs [S18].
- **Indigenous data governance**: CARE principles, Maiam nayri Wingara, the NIAA Framework for Governance of Indigenous Data (avoid "BADDR" data: blaming, aggregate, decontextualised, deficit-based, restricted access), and Closing the Gap Priority Reform 4: communities should see the same data government uses to decide [S19].
- **Language**: more than 80% of Aboriginal people speak Kriol or Aboriginal English. The NT Aboriginal Interpreter Service covers 39 languages [S20]. A free-text classifier trained on standard English will miss people. It needs a human fallback and co-designed vocabularies, not machine translation into Aboriginal languages.

## 4. Data we can use (all public)

| Dataset | Use in our model | Licence | Link |
|---|---|---|---|
| NIAA/PwC-IC Review of the NPRH NT (2023), App. B | the 70 remote communities, overcrowding, houses (estimated) | Commonwealth, public report | [S2] |
| NTG remote communities list 2021 (via Underlink `places.csv`) | coordinates, distance to sealed road, land council | CC BY 4.0 | data.nt.gov.au |
| ABS 2021 Census Indigenous Profile, ILOC (I13 tenure, I16 housing suitability, I05 language) | town public housing counts; language context | CC BY 4.0 | abs.gov.au |
| NT Annual Traffic Report 2023, road restriction register (via RoadState) | 499 restrictions, 87 road closures with months and days, e.g. Lajamanu Road closed 161 days Nov–Apr | CC BY 4.0 | data.nt.gov.au |
| Road Report NT live API (`/api/Obstruction/GetAll`) | today's closures with coordinates, used to block road trips | NTG | roadreport.nt.gov.au |
| OurAirports | NT airstrips (291 small airports) for fly-in options | Public domain | ourairports.com |
| APY Lands trade mix (Grealy 2022, Table 3) | job mix for synthetic requests | academic | [S7] |
| Nous 2017 cost ratios | travel and emergency cost multipliers | Commonwealth | [S6] |

**Not public, and what a pilot would need:** work-order histories from TMS/ASNEX (job type, raised and closed dates, trade, cost, travel order), contractor crew rosters, and tenant contact channels. Our job-level data is therefore **synthetic and labelled so everywhere**. Geography, access, portfolio sizes and cost ratios are real.

## 5. Methods and tools considered

| Need | Options reviewed | Choice and why |
|---|---|---|
| Read free-text fault reports | keyword rules; TF-IDF + logistic regression; sentence-transformers; LLM zero-shot | **Rules from a published hazard list + TF-IDF/logistic regression**, combined. Offline, auditable, explainable phrase by phrase. Low confidence sends the report to a person. An LLM is a later option for paraphrasing only, never for the decision. |
| Severity | HHSRS score; Housing for Health order; NT Immediate/Urgent/Routine | **NT categories as the clock, HfH order and HHSRS-style harm × likelihood within a category.** |
| Logistics | OR-Tools VRP; CP-SAT; PyVRP; greedy batching | **OR-Tools CP-SAT** to choose fortnightly trips under crew-day limits, with travel from great-circle distance × circuity, sealed/unsealed speeds, wet-season closures from the register, and air charter for islands. |
| Fairness | max–min; Gini; price of fairness (Bertsimas et al. 2011); service-level guarantees | **Need-based guarantees (same clock everywhere) + a visible efficiency–equity frontier.** Report the "price of fairness" in dollars and the "remote penalty" in days. |
| Explanations | SHAP; counterfactuals (Wachter et al. 2017); reason codes | **Additive score with exact points + reason codes + one counterfactual.** Additive scoring needs no SHAP. Every number in a sentence comes from the ledger. |
| Prototype | Streamlit; Panel; static HTML/JS | **Static HTML/JS that works offline**, fed by JSON from the Python engine. Runs on a laptop with no internet on the day. |

## 6. What we propose: ReachNT

1. **Read**: turn each free-text report into hazards, trade, Healthy Living Practice, vulnerable occupants and a confidence. Below the threshold, it goes to a person.
2. **Rank by need only**: the urgency score never sees distance or cost. Category (Immediate/Urgent/Routine) sets the response clock. Points within a category come from harm class, HLP rank, household exposure and days waited.
3. **Plan logistics separately**: a trip planner batches jobs into fortnightly trips per trade under crew limits and road access (wet season, live closures, islands by air).
4. **Make the trade-off visible**: run the same year of requests under several policies, from "cheapest jobs first" to "same clock everywhere", and plot cost per job against the remote–town wait gap. The coordinator picks a point and writes down why. That decision goes in a ledger.
5. **Answer the tenant**: every job has a plain-English "why" that states what we understood, its category and due date, where it sits, the real reason it hasn't been done (trip date, road closure, no electrician until…, a policy choice signed by a named role), what would change it, and how to escalate (s 63 emergency repair order, NT Ombudsman).

## Sources

- [S1] DHLGCD, *Delivery and success of the remote housing program* / Remote housing pages: https://dhlgcd.nt.gov.au/news/2024/the-delivery-and-success-of-the-remote-housing-program ; https://dhlgcd.nt.gov.au/housing-projects-and-programs/housing-initiatives-and-strategies/remote-housing-maintenance-contracts
- [S2] PwC's Indigenous Consulting for NIAA (2023), *Review of the National Partnership for Remote Housing Northern Territory*, Appendix B: https://federalfinancialrelations.gov.au/sites/federalfinancialrelations.gov.au/files/2023-06/review-nat-partnership-remote-housing-nt.pdf
- [S3] AIHW, *Closing the Gap targets: key findings*, Ch 9 Housing: https://www.aihw.gov.au/getmedia/01e92e96-044c-4800-8f51-300350966168/aihw-ihw-294-ch9-housing.pdf ; PC CtG dashboard: https://www.pc.gov.au/closing-the-gap-data/dashboard/outcome-area/housing/
- [S4] AIHW Indigenous HPF 2.02 *Access to functional housing with utilities*: https://www.indigenoushpf.gov.au/measures/2-02-access-to-functional-housing-with-utilities
- [S5] DHLGCD Fact sheet FS17 *Repairs and maintenance* (10/25): https://dhlgcd.nt.gov.au/media/documents/fact-sheets/repairs-and-maintenance-fs17.pdf
- [S6] Nous Group (2017) for PM&C, *Efficient system costs of remote Indigenous housing*: https://www.niaa.gov.au/sites/default/files/documents/publications/Nous-Group-Final-Report-Efficient-system-costs-of-remote-Indigenous-housing.pdf
- [S7] Grealy L. et al. (2022) *Sustaining housing through planned maintenance in remote central Australia*, Housing Studies (accepted manuscript): https://www.hfhincubator.org/wp-content/uploads/2025/12/Grealy-et-al.-2022.-Sustaining-Housing-through-Planned-Maintenance-in-Remote-Central-Australia.pdf
- [S8] Healthabitat, *Safety and the 9 Healthy Living Practices*: https://www.healthabitat.com/what-we-do/safety-and-the-9-healthy-living-practices/ ; *Housing for Health*: https://www.healthabitat.com/what-we-do/housing-for-health/
- [S9] Grealy L., Su J-Y., Thomas D. (2023) *Healthy Homes Monitoring and Evaluation Project: Final Report*, Menzies: https://www.menzies.edu.au/content/Document/Healthy%20Homes%20Monitoring%20and%20Evaluation%20Project%20-%20Final%20Report.pdf
- [S10] ANAO Auditor-General Report No. 18 2021–22, *Remote Housing in the Northern Territory*: https://www.anao.gov.au/work/performance-audit/remote-housing-the-northern-territory
- [S11] Grata Fund, *Santa Teresa housing*: https://www.gratafund.org.au/santa_teresa_housing ; High Court win: https://www.gratafund.org.au/santa_highcourt_win ; ABC 15 Aug 2024: https://www.abc.net.au/news/2024-08-15/nt-court-of-appeal-remote-public-housing-santa-teresa/104227546
- [S12] AIHW, *Elective surgery waiting times: by urgency category*: https://www.aihw.gov.au/getmedia/4b7b0346-84b4-435c-bc91-a9beb65413f8/myhospitals-elective-surgery-data.pdf.aspx
- [S13] UK Parliament written statement HCWS739 (25 Jun 2025), Awaab's Law: https://questions-statements.parliament.uk/written-statements/detail/2025-06-25/hcws739 ; summary: https://www.kennedyslaw.com/en/thought-leadership/article/2025/awaab-s-law-phase-1-to-come-into-force-in-october-2025/
- [S14] MHCLG, *HHSRS Operating Guidance*: https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/15810/142631.pdf
- [S15] Housing Digital, *AI with empathy: transforming repairs in social housing*: https://housingdigital.co.uk/ai-with-empathy-transforming-repairs-in-social-housing/ ; case study: https://aiimplementation.uk/case-studies/housing-association-tenant-support-ai
- [S16] *Residential Tenancies Act 1999* (NT) s 63: https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/nt/consol_act/rta1999207/s63.html
- [S17] Royal Commission into the Robodebt Scheme, Report (2023), Rec 17.1: https://www.monash.edu/__data/assets/pdf_file/0007/3365503/report_of-the-royal-commission-into-the-robodebt-scheme.pdf ; Commonwealth Ombudsman ADM Better Practice Guide: https://apo.org.au/node/306481
- [S18] Gilbert + Tobin, *ADM transparency under the Privacy Act*: https://www.gtlaw.com.au/insights/automated-decision-making-transparency-under-the-privacy-act ; NT *Information Act 2002*
- [S19] GIDA CARE principles: https://doi.org/10.5334/dsj-2020-043 (Carroll et al. 2020, Data Science Journal) ; NIAA Framework for Governance of Indigenous Data (2024): https://www.niaa.gov.au/resource-centre/framework-governance-indigenous-data ; National Agreement on CtG, Priority Reform 4.
- [S20] ABC (2022) *More than 80pc of Aboriginal people speak Kriol or Aboriginal English*: https://www.abc.net.au/news/2022-05-05/kriol-aboriginal-english-tranlsation-interpreting/101005782 ; NT AIS: https://nt.gov.au/community/interpreting-and-translating-services/aboriginal-interpreter-service/aboriginal-languages-in-nt
- [S21] Bertsimas D., Farias V., Trichakis N. (2011) *The price of fairness*, Operations Research 59(1). Matl P., Hartl R., Vidal T. (2018) *Workload equity in vehicle routing problems*, Transportation Science.
- [S22] Wachter S., Mittelstadt B., Russell C. (2017) *Counterfactual explanations without opening the black box*, Harvard JOLT 31(2).
- Tools: Google OR-Tools (CP-SAT) https://developers.google.com/optimization ; scikit-learn https://scikit-learn.org ; RapidFuzz https://github.com/rapidfuzz/RapidFuzz ; pandas; Jupyter.

## 7. H3, hosting and imagery (added 6 October 2026)

**H3.** Uber released H3 in 2018 to analyse marketplace data on a grid with comparable cells across cities; it drives surge pricing, dispatch neighbourhood queries and k-ring smoothing [S23]. The grid covers the earth with hexagons at 16 resolutions; each finer level is about a seventh of the area (aperture 7), built on an icosahedron with 122 base cells and 12 pentagons [S24]. Hexagons have one class of neighbour, which simplifies convolutions and smoothing; S2's squares have edge and corner neighbours, while S2 gives exact parent-child containment and H3 does not [S25]. Average areas: resolution 4 is 1,770 km² (26 km edge), 5 is 253 km², 6 is 36 km², 7 is 5.2 km², 10 is 0.015 km² [S26]. Bindings exist for Python (h3-py), JavaScript (h3-js), PostgreSQL (h3-pg), DuckDB (h3-duckdb) and others [S27].

ReachNT uses H3 for run zones (resolution 4, within 2 rings: 68 community pairs), "while you're out there" suggestions (resolution 5, 3 rings), house locations (resolution 10) and publishing (resolution 6, suppressed below 5). In the simulation, run zones lowered the default setting's cost from $843 to $775 a job and harm-days from 75,800 to 61,700.

**Hosting.** Neon supports `h3`, `h3_postgis`, `postgis`, `pgcrypto` and `pg_session_jwt` [S28], has an AWS Sydney region (`aws-ap-southeast-2`) [S29], and its free plan has 1 GB of storage and 100 compute-hours per project; the paid plan is usage-based [S30]. Supabase's published extension pages did not confirm h3 when we checked. The same open-source stack can run on NT Government servers.

**Imagery.** Esri World Imagery is used live. For offline and published use we bundle Digital Earth Australia's Landsat 8/9 annual geomedian (2024), served by Geoscience Australia under CC BY 4.0 [S31]. EOX's Sentinel-2 cloudless now uses a restricted commercial licence, so we did not bundle it [S32].

**Aboriginal art.** We did not use Aboriginal art from galleries in the interface. Indigenous Cultural and Intellectual Property is not fully protected by Australian law, and the Creative Australia protocols ask for free, prior and informed consent, attribution and benefit sharing [S33][S34]. A visual identity drawing on art would be commissioned and licensed through an Aboriginal art centre.

- [S23] Brodsky, I. (2018). H3: Uber's Hexagonal Hierarchical Spatial Index. https://www.uber.com/au/en/blog/h3/
- [S24] H3 documentation, introduction. https://h3geo.org/docs/
- [S25] H3 vs S2. https://h3geo.org/docs/comparisons/s2
- [S26] H3 cell statistics. https://h3geo.org/docs/core-library/restable
- [S27] H3 community bindings. https://h3geo.org/docs/community/bindings ; https://github.com/uber/h3 ; https://github.com/zachasme/h3-pg
- [S28] Neon Postgres extensions. https://neon.com/docs/extensions/pg-extensions
- [S29] Neon regions. https://neon.com/docs/introduction/regions
- [S30] Neon pricing. https://neon.com/pricing
- [S31] Digital Earth Australia OWS (layer ga_ls8cls9c_gm_cyear_3). https://ows.dea.ga.gov.au
- [S32] EOxCloudless licence. https://cloudless.eox.at/documentation/license
- [S33] Arts Law Centre, Indigenous Cultural and Intellectual Property. https://www.artslaw.com.au/information-sheet/indigenous-cultural-intellectual-property-icip-aitb/
- [S34] Creative Australia, Protocols for using First Nations Cultural and Intellectual Property in the Arts. https://creative.gov.au/first-nations-arts/protocols-for-using-first-nations-cultural-and-intellectual-property-in-the-arts
