# Validation: what we checked, what we fixed, what is still missing

Checked 7 October 2026 against the live portal (https://reachnt.vercel.app), the Python engine and the standards that similar services now have to meet. Every check that can be automated runs in `tests/`, which GitHub Actions runs on every push.

## 1. Checks we ran

| Area | Check | Result |
|---|---|---|
| Security | HTTPS only, HSTS | Pass (308 redirect, HSTS with preload) |
| Security | Content-Security-Policy, clickjacking, Permissions-Policy | **Was missing. Fixed:** strict CSP (`script-src 'self'`), `X-Frame-Options: DENY`, Permissions-Policy, COOP. The map, the PDF export and the sync all work under it, with no CSP errors in the console. |
| Security | Third-party code | **Fixed:** MapLibre and h3-js now load from this site, not public CDNs. With no integrity check, a changed CDN file would have run inside the app. |
| Security | Known vulnerabilities in libraries | **Fixed:** jsPDF 2.5.1 → 4.2.1 (CVE-2025-29907, CVE-2025-57810, CVE-2025-68428). Dependabot alerts and security updates switched on for the repository. |
| Security | Text typed by a tenant cannot inject code | Pass. Every value is escaped before display; tested with `<script>` and `<img onerror>`. |
| API | `/api/sync` input validation | **Was weak. Fixed:** it accepted a 3 MB junk body. It now enforces allowed status values, a job-id format, a 64 KB / 200-update limit and 400/413 errors, and returns the ids it rejected. |
| Offline | Updates made without signal | **Bug fixed:** the phone marked every queued update as sent when the server answered, even rejected ones. Rejected updates now stay on the phone. |
| Accessibility | axe-core, WCAG 2.2 AA, every view (coordinator, trips, report reader, tradesperson, tenant, comparison) | **One failure, fixed:** overlapping community buttons were too small to tap (2.5.8), and this is how a tap on Barunga opened Jilkminggan. Badges that would overlap now merge into one "N places" badge that zooms in. Map buttons kept the name "Map marker" for screen readers; they now read e.g. "Binjari, 8". Re-run: 0 violations. |
| Map accuracy | Each community's position and the example houses, against satellite imagery for all 70 | **Was wrong for several. Fixed:** the government list gives positions to ~1 km, so some badges sat in bush (Barunga) or on an airstrip (Milyakburra), and houses were scattered at random. Positions now come from OpenStreetMap (one, Jilkminggan, from its buildings), and example houses sit on cells that contain mapped buildings. |
| Reader | Shouting, typos, Aboriginal English, Kriol-style wording, markup, 5,000 characters, blank, emoji, phone numbers | Pass: danger is caught or sent to a person; nothing crashes; unreadable input goes to a person. |
| Reader | Negation ("no sparks, the power point just doesn't work") | **Was wrong. Fixed:** it stayed Immediate with no check. A negated danger now stays Immediate and goes to a person, who decides; the reader never downgrades danger on its own. "No smoke detector" is not treated as a negation. |
| Reader | ROC-AUC, PR-AUC, calibration, cross-validation | See report Appendix G. The model's confidence runs ahead of its accuracy on new wording, so no percentage is shown to tenants. |
| Data | 70 communities, inside the NT, houses > 0, every community has a hub, unique ids, valid hazards, request days within the year | Pass |
| Simulation | In all 14 plans: done + open = all jobs, no negative waits, nothing fixed before it was reported, same requests in every plan | Pass (66 of 66) |
| Simulation | Results hold in other random years; solver close to optimal | Pass (Appendix G: five years; 99.5% of 26,028 weekly plans proved optimal) |
| Build | A fresh install can run the code | **Was broken:** `requirements.txt` did not list `h3`, `scipy` or `requests`. Fixed, and CI now installs from scratch on every push. |
| Links | 45 links in the report and research notes | 36 load; 7 are government sites that refuse automated requests (they open in a browser); **2 were dead and are fixed in our notes** (the NIAA review needs `.pdf`; the CARE principles page moved, so we cite Carroll et al. 2020, https://doi.org/10.5334/dsj-2020-043). |
| Page weight | Brotli on the wire | Page 2 KB, app 28 KB, data 195 KB, map library 217 KB. Bundled offline tiles load only when needed. |

## 2. What comparable services and current rules expect that ReachNT does not yet do

Ordered by what would matter first in a real pilot.

### Rules that would apply

1. **Privacy Act, automated decisions (from 10 December 2026).** An organisation covered by the Privacy Act that uses a computer program to make, or substantially help make, decisions that significantly affect people must say so in its privacy policy: what personal information is used, what decisions, and how, in plain language. This covers rule-based scoring, not only AI. A community housing provider or contractor running ReachNT would need this. NT Government agencies follow the Information Act 2002 privacy principles instead (data quality, security, access and correction). *Missing: a privacy notice and an "access or correct my information" path.*
2. **Commonwealth AI policy v2.0 (from 15 December 2025) and the National AI Centre's Guidance for AI Adoption (October 2025).** The policy asks for an AI impact assessment, a named accountable owner, an internal register of AI uses, a public AI transparency statement updated every year, and a review of high-risk uses at least every 12 months. The Guidance's six practices are: decide who is accountable, understand impacts, measure and manage risks, share essential information, test and monitor, maintain human control. *We have the named sign-off, testing and human control. Missing: a completed impact assessment and a transparency statement.*
3. **Robodebt Royal Commission, recommendation 17.1, and the Commonwealth Ombudsman's ADM guide (March 2025).** Automated decisions need a clear path to review, a plain-language explanation of how the process works, and business rules open to independent scrutiny. The guide adds quality assurance to keep decisions accurate after launch. *We publish the rules (the repository is public) and explain each wait. Missing: a formal "ask for a review of this decision" step with a response time, and a routine audit sample (for example, a person re-reads 5% of automatically read reports each week).*

### What housing regulators found goes wrong with repairs

4. **"Made safe" and "fixed" are two different clocks.** England's Awaab's Law (in force since 27 October 2025) requires emergency hazards to be investigated and made safe within 24 hours. Significant damp and mould must be investigated within 10 working days, with a written summary to the tenant within 3 working days. The NT fact sheet also separates a 4-hour response from the repair. *ReachNT's simulation assumes dangerous jobs are made safe on day one and does not record it. Missing: a separate "made safe at" time for Immediate jobs.*
5. **Damp and mould.** It is the hazard Awaab's Law was written for, and the Top End wet season makes it common. *ReachNT has roof leaks but no damp-and-mould category.* Adding one changes the fault list and the simulated year, so it should be agreed with the department first.
6. **"No one home" must not close a job.** The Housing Ombudsman's 2025 report *Repairing Trust* found landlords closing cases on unevidenced claims that the tenant denied access. It also found missing property records, missed health needs, and temporary fixes that came back. *Missing:*
   - "No one home" needs a time, a note and a tenant notification, and books the next visit automatically.
   - A repair history per house.
   - A flag when the same fault returns within 90 days.
   - A step where the tenant confirms the repair worked.
7. **Duplicate reports.** The same fault reported twice for one house should merge, not queue twice. *Missing.*
8. **Published performance in a standard form.** English social landlords publish TSM RP02: the share of emergency and non-emergency repairs completed within their own target times. *ReachNT computes the equivalent; it could publish it per hub on the public, H3-aggregated view.*

### Model and data

9. **Test on real reports.** Every reader measure uses synthetic English. A pilot needs real reports, including Kriol and Aboriginal English, reviewed with the Aboriginal Interpreter Service, and an external validation reported to a standard such as TRIPOD+AI.
10. **Monitor after launch.** Track the share of reports sent to a person each week, remote against town waits, and misreads found by the audit sample. A rising "sent to a person" share is the first sign of language the reader does not know.
11. **Confirm two fault categories with the department.** A dripping tap is currently Urgent (with "shower or taps not working") and a missing smoke detector is Urgent. Our sources do not settle either.

### Running it for real

12. **Sign-in and roles.** Tenant one-time codes and tradesperson accounts are designed (row-level security in `docs/schema.sql`) but not built; the prototype has no login.
13. **Rate limits and abuse protection** on the sync endpoint (Vercel Firewall), backups, and an incident plan.
14. **Two phones, one job.** When two people update the same job offline, the server needs a rule for which update wins (latest timestamp, with both kept in the history).
15. **Accessibility beyond the checker.** Automated checks pass; a screen-reader walkthrough and testing with tenants, in language, are still needed.

## Sources

- Awaab's Law: [GOV.UK press release](https://www.gov.uk/government/news/awaabs-law-to-force-landlords-to-fix-dangerous-homes); [Shelter](https://england.shelter.org.uk/professional_resources/news_and_updates/how_awaabs_law_changes_the_rules_on_hazards_in_social_housing)
- Housing Ombudsman, *Repairing Trust* (2025): [press release](https://www.housing-ombudsman.org.uk/2025/05/29/call-for-national-tenant-body-and-funding-review/)
- Tenant Satisfaction Measures RP02: [Camden TSM results 2024–25](https://www.camden.gov.uk/en/tenant-satisfaction-measures-2024-to-2025)
- Privacy Act ADM transparency from 10 December 2026: [Maddocks](https://www.maddocks.com.au/insights/automated-decision-making-privacy-obligations); [MinterEllison](https://www.minterellison.com/articles/privacy-and-other-legislation-amendment-act-2024-now-in-effect)
- NT Information Act privacy principles: [Information Commissioner NT](https://infocomm.nt.gov.au/privacy/information-privacy-principles)
- Policy for the responsible use of AI in government v2.0: [DTA](https://www.digital.gov.au/ai/ai-in-government-policy)
- Guidance for AI Adoption (NAIC, October 2025): [industry.gov.au](https://www.industry.gov.au/publications/guidance-ai-adoption)
- Commonwealth Ombudsman, *Automated Decision-Making Better Practice Guide* (March 2025): [PDF](https://www.ombudsman.gov.au/__data/assets/pdf_file/0025/317437/Automated-Decision-Making-Better-Practice-Guide-March-2025.pdf)
- Robodebt Royal Commission recommendations 17.1–17.2: [Parliamentary Library](https://www.aph.gov.au/About_Parliament/Parliamentary_departments/Parliamentary_Library/FlagPost/2023/July/Robodebt-RC-legislative-recommendations)
- TRIPOD+AI (BMJ 2024): [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11025451/)
- jsPDF advisories: [CVE-2025-68428](https://osv.dev/vulnerability/CVE-2025-68428), [CVE-2025-29907](https://mend.io/vulnerability-database/CVE-2025-29907), [CVE-2025-57810](https://mend.io/vulnerability-database/CVE-2025-57810)
