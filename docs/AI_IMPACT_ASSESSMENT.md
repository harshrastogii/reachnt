# AI impact assessment: ReachNT (draft for a pilot)

This draft follows the sections of the Australian Government's AI impact assessment tool, which agencies use under the *Policy for the responsible use of AI in government* (v2.0, December 2025). It also follows the six practices in the National AI Centre's *Guidance for AI Adoption* (October 2025). It is written for a pilot, not for the code fair. A department running ReachNT completes it, names the accountable official, signs it, and reviews it at least every 12 months.

Figures come from `outputs/numbers.json` (run of 8 October 2026). Every repair request behind them is synthetic.

## 1. The use case

| | |
|---|---|
| Name | ReachNT: repair triage for remote NT public housing |
| Owner | Department of Housing, Local Government and Community Development (DHLGCD), remote housing maintenance *(to confirm)* |
| Accountable official | *To be named before use* |
| Use-case owner | Regional maintenance coordinator for each hub |
| What the AI does | Reads free-text repair reports and suggests the fault and urgency group: word rules, plus a logistic regression model trained on example reports. No generative AI or large language model. |
| What the rest does | Scores each repair by need with fixed, published rules. Plans weekly trips with an optimisation solver (Google OR-Tools CP-SAT) under a cost weight a named person signs. Explains each wait to the tenant. |
| People affected | Tenants of remote public housing in 70 NT communities, mostly Aboriginal households; tradespeople; coordinators |
| Stage | Prototype on synthetic data |

## 2. Purpose and expected benefits

The problem: a schedule built to clear the most jobs per dollar keeps choosing town jobs, and nobody decides that remote tenants wait. In the simulated year:
- cheapest-first left 9 in 10 urgent remote repairs waiting up to 62 days, against 3 in town;
- ReachNT fixed them within 3 days for $803 per repair against $559, 44% more;
- households lived with faults for 73% fewer days;
- shared trips saved $73 per repair against the same plan without them.

The benefit is that the trade-off becomes visible, priced and signed, rather than a side effect.

## 3. Risk threshold

**High risk.** The system affects how long a person lives with a fault, including dangerous ones. The people affected are a group already disadvantaged by distance, and the reports come in many languages. Treat it as high risk, with the controls below.

## 4. Fairness

| Risk | Control | Evidence |
|---|---|---|
| Distance or cost pushes remote tenants back | The need score never uses location or cost (a unit test fails if they appear). Cost can only change *which week a trip goes*, under a cost weight a named person signs, and the tenant is told when it does. | Report sections 2.3 and 3.2; `tests/test_core.py` |
| The reader understands some groups' words worse | Doubtful reports go to a person. Per-language testing on real reports is required before use, and a weekly audit continues after it. | `docs/REAL_LANGUAGE_TEST_PROTOCOL.md`; Checks tab |
| Some communities wait longer | Waits are reported by remoteness band, and per community over the whole year. | Report Figure 3; the portal's year view |
| Tenants who say less, speak little English, use an interpreter or don't use the app get fewer points or a later place | The household part of the score comes from the same standard questions on every channel, the tenancy record and the job history, not only the tenant's words; an unanswered question never removes points. The clock starts at first contact with anyone. Channel, language and timing are never inputs (a unit test fails if they appear). | `docs/INCLUSIVE_DECISION_MODEL.md`; `evaluate.inclusion()`: points lost by a short telling fell from 19 to 1.8 |
| Household tiers are used to rank people unfairly, or need sensitive facts | Tiers ask only what changes the harm from a fault: power, cooling or medical supplies; a baby or frail elder; children, pregnancy, illness or mobility. Age is asked as "old enough for aged care", so Aboriginality is never needed. Who heads the household, income and the community's isolation are not used. The points are published assumptions to set with the community. | `docs/INCLUSIVE_DECISION_MODEL.md`; `tests/test_core.py` (tier tests) |
| Live road and weather feeds move people in the line | They only prompt the coordinator (closures, heavy rain, heat); nothing changes the line unless a person decides, and a declared event is logged. A feed that is down is replaced by a labelled saved snapshot. | `web/api/warnings.js`; `tests/test_api.mjs` |
| A missed visit drops a job to the back | The job keeps its waiting time and gets the deadline boost; the coordinator sends it to the next trip, a named crew or any contractor of that trade | `experiments.missed_visits()`: missed urgent remote repairs fixed within 20 days (9 in 10) under ReachNT, 126 under cheapest-first |

## 5. Reliability and safety

| Measure (synthetic data) | Result |
|---|---|
| Dangerous reports caught by the whole system, unfamiliar wording | 99.3% (labelled Immediate, or sent to a person) |
| Model alone, spotting danger on unfamiliar wording | ROC-AUC 0.84, PR-AUC 0.72 (guessing scores 0.22) |
| Reports sent to a person, unfamiliar wording | 40% |
| Weekly plans proved optimal by the solver | 99.4% of 25,996 |
| Results across five random years | ReachNT cut fault-days 73–75% against cheapest-first in every year |

Safety controls:
- A person confirms every Immediate report by phone the same day, and a maintenance officer makes it safe; "made safe" is recorded separately from "fixed".
- The reader never downgrades danger on its own. "No sparks" keeps a report Immediate and sends it to a person.

**Limitation:** none of this is tested on real reports yet. That is the condition for a pilot (section 10).

## 6. Privacy and security

- **Personal details:** names, phone numbers and addresses sit in an encrypted vault. Only intake staff can read it, and every read is logged.
- **Rest of the system:** works with a house number and an H3 hexagon.
- **Public views:** show areas with at least 5 repairs, never a single house.
- **Hosting:** in Australia.
- **Website protections:** a strict content security policy, libraries served from our own site, and input validation on the server.
- **Sign-in:** the server-side role rules are built (signed tokens; each person can only touch their own jobs). The sign-in service is not built yet.
- **NT Government use:** the Information Act 2002 privacy principles apply.
- **Others covered by the Privacy Act:** from 10 December 2026, a privacy policy must describe the automated decisions. The notice in `web/privacy.html` is written to do that.

## 7. Transparency and explainability

Every tenant can see:
- what we heard and how we read it;
- the score's parts;
- each week their repair waited and the logged reason;
- who signed the cost setting in force.

The rules are public (`config/taxonomy.yaml`, `config/params.yaml`). The plain-language notice and the AI transparency statement are in `web/privacy.html`. No confidence percentage is shown to tenants, because on unfamiliar wording the model's confidence runs ahead of its accuracy (report Appendix G).

## 8. Contestability

- **Ask for a review:** any tenant can, in the app or by phone. A person answers within 10 working days, recorded in `ops.review_request`.
- **Other routes stay open:** an interpreter on request, NTCAT emergency repair orders, the NT Ombudsman and the Information Commissioner.
- **Repairs that didn't work:** a tenant can say so, which reopens the job as a repeat.
- **It got worse:** a tenant or tradesperson can say so by phone, through the housing officer or in the app; a person calls back the same day and records an urgency check (`ops.escalation`, `ops.urgency_check`).

## 9. Human oversight and accountability

- **The cost setting:** a named role signs it, and the signature is kept in an append-only, hash-chained ledger.
- **Readings people check:**
  - every report that might be dangerous;
  - every report the reader can't read with confidence;
  - 1 in 20 of the rest, each week (`ops.reader_audit`).
- **Closing jobs:** a "no one home" visit never closes a job; it needs evidence, and the tenant is told.
- **Urgency checks:** a person can raise or confirm urgency at any time from a call, a visit, a photo or a review; lowering a dangerous repair needs someone who spoke to the tenant or saw it, plus a reason the tenant can read. The reader can never lower danger. Enforced in the portal, the server and a database CHECK constraint (`ops.urgency_check`).
- **Who goes after a missed visit:** the coordinator decides (next trip, a named crew, or open to any contractor of that trade, first to accept), recorded in `ops.job_offer`.
- **Turning it off:** the coordinator can stop using the plan at any time and plan by hand. The tenant answers still work from the logged reasons.

## 10. Conditions before a pilot

1. Ethics approval (HREC), land council research permits, and agreement from community organisations.
2. Testing on real reports, by language, with the Aboriginal Interpreter Service, meeting the pass marks in the protocol: every dangerous report caught, in every language.
3. The department confirms the fault categories and deadlines (including damp and mould, which is Urgent here as an assumption).
4. Sign-in built on a real identity provider, with `REQUIRE_SIGN_IN=1`.
5. The accountable official named, and the transparency statement published.

## 11. Monitoring and review

Signals to watch:
- **Weekly:** the share of reports sent to a person, by language; audit misses; reviews requested and answered on time.
- **Monthly:** remote against town waits; repairs that came back within 90 days.

When to act:
- Any missed dangerous report triggers a review of the rules.
- The whole assessment is reviewed at least every 12 months, and whenever the rules, the model or the cost setting change.

## 12. Indigenous data

- **Principles:** data about Aboriginal communities is governed under the CARE principles (Carroll et al. 2020) and the NIAA Framework for Governance of Indigenous Data (2024).
- **Community access:** communities can see the same waits and reasons the department sees, aggregated so that no household is identifiable.
- **Publishing results:** community-level results are not published without the community's agreement.
