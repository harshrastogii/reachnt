# ReachNT's inclusive decision-making model

ReachNT decides the order in which repairs are done. In a regional or remote community, the easy way to do that is unfair without anyone meaning it to be. A tenant who rings early, fills in every field, writes good English and uses the app gets ahead of a tenant who tells the Community Housing Officer in Kriol that the toilet is broken.

ReachNT's rule is that **the place in line follows need only**. Need means the fault, who lives in the house, and how long the household has waited.

The rule is written into the code, tested on every change and measured. It applies to Aboriginal and Torres Strait Islander tenants, to migrants and refugees, and to anyone else who finds forms, English, phones or apps hard.

## 1. What decides a repair's place, and what never does

| Counts | Never counts |
|---|---|
| The fault and how dangerous it is (FS17 category, harm, Healthy Living Practice) | Where the house is: distance, travel cost, community, region |
| Who lives there: a baby or young child, an elder, someone sick, pregnant or living with a disability, a crowded house | How the report arrived: phone, Community Housing Officer, maintenance officer, tradesperson, app |
| A repeat of a fault that wasn't fixed | When in the day or week the tenant got in touch, and who got in first |
| How long the household has waited, counted from the day they first told anyone | How much the tenant said, how well they spelled it, or their English |
| | Their language, or whether they needed an interpreter |
| | Whether they own a phone or use the app |

`urgency.score` reads only the fault, the household modifiers and days waited. `tests/test_core.py::test_urgency_signature_has_no_place_or_cost_inputs` fails if the function mentions any of these: distance, cost, community, remote, band, channel, language, English, interpreter, submitted, form, app, phone or logged.

## 2. The five ways the old way was unfair, and what ReachNT does

### Saying less (form completeness, English proficiency)
Before this change, the household part of the score came only from the tenant's words. "Toilet blocked, my nana lives here, 9 of us, third time I rang" earned 45 points that "toilet blocked pls come" did not, for the same household.

Now three sources fill it in, and any "yes" counts:
1. **The same short questions, asked every time, on every channel.** Staff or an interpreter read them out (`config/taxonomy.yaml` → `intake_questions`):
   - Is anyone in danger right now?
   - Does a baby or young child live there?
   - Does an elder or older person live there?
   - Is anyone there sick, pregnant, or living with a disability?
   - How many people are living there now?
   - Have you told anyone about this fault before?
2. **The tenancy record** fills in household size and bedrooms. More than 2 people per bedroom counts as crowded.
3. **The house's repair history** shows a fault that was reported before or came back within 90 days.

An unanswered question ("Not asked") never takes points away; it asks for a call-back. A "yes" to "anyone in danger right now?" sends the report to a person the same day, who checks whether it is Immediate. `intake.household()` implements this in Python and the portal uses the same logic.

### Language
- The tenant's words are kept as they said them, or as the interpreter gave them.
- Interpreters are free and offered on every channel:
  - **Aboriginal Interpreter Service** for Aboriginal languages and Kriol
  - **TIS National** for migrants and anyone speaking another language
  - **National Relay Service** for people who are Deaf or find it hard to hear or speak
- The tenant's language is recorded only to book an interpreter next time. It is never scored.
- The reader is tested on English only so far, so a report it can't read with confidence goes to a person; it is never guessed. Testing on real reports by language is the first job of a pilot (`docs/REAL_LANGUAGE_TEST_PROTOCOL.md`).

### Digital literacy and channel
All six ways in create the same record with the same questions:
- the repairs line (1800 104 076)
- the Community Housing Officer
- the Remote Housing Maintenance Officer
- a tradesperson on site
- the app
- the front counter

The channel is stored only to check fairness by channel. Everything a tenant can do in the app can also be done by phone or through the housing officer: track a repair, say it got worse, ask for a review, say whether it worked.

### Submission timing
- The clock starts at **first contact with anyone**. The intake form asks when the tenant first told someone, so a report a housing officer heard on Tuesday and typed in on Thursday has been waiting since Tuesday.
- The line is ordered by need, not first come first served. Waiting time adds points only after half the clock has passed (+3 a day), so nothing waits forever, and an early caller with a minor fault never jumps a later caller with a dangerous one.
- A missed visit never restarts the clock.

### Unchecked machine decisions
- **A person can check and change urgency at any time:** when the tenant rings, when the housing officer, maintenance officer or a tradesperson sees it, from a photo, or after a review.
- Raising urgency takes effect at once. Raising it to Immediate calls the maintenance officer to make the fault safe that day.
- Lowering a dangerous repair needs someone who spoke to the tenant or saw the fault, plus a written reason the tenant can read. A photo or a review alone is not enough.
- The reader (rules + model) can never lower danger.
- These rules are enforced in the portal, the server (`web/api/sync.js`) and the database (`ops.urgency_check` CHECK constraint).

## 3. When time runs short, and when a visit misses

- **Priority rises as time runs out.**
  - The planner values each job by its need points.
  - When its clock ends within 7 days, it gets +400.
  - Under ReachNT, an urgent or dangerous job about to run out of time gets +6,000 more, which puts it on the next trip.
  - The coordinator sees "2 days left", "Due today" or "Overdue" on every waiting repair, and the arithmetic on the job screen.
- **A tradesperson who couldn't do a job** ("No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work") records why. "No one home" also needs the time and what they tried. The job is never closed.
- **The coordinator decides who goes next:**
  - the next trip (any crew)
  - a named crew
  - or an open offer to any contractor of that trade on the panel, including local Aboriginal Business Enterprises, where the first to accept gets it
  - "Needs another trade" lets the coordinator change the trade.
- The job keeps its waiting time throughout, so it moves up the line by itself.

## 4. Measured, not just claimed

**Saying less** (`evaluate.inclusion()`, 3,000 synthetic households, each described twice: once in full, once in a few words):

| | Words only (before) | With the standard questions (now) |
|---|---|---|
| Points lost by the short telling (households with something to tell) | 19 on average, up to 45 | 1.8 on average |
| Short telling ranked lower than the full one | 97% | 11% |
| Places lost in a shared queue | 14% of the queue | 1.2% |
| Vulnerable households recognised from a short telling | 4% | 92% |

What's left comes from questions left unanswered (we assume 1 in 10). Each one triggers a call-back.

**Missed visits** (`experiments.missed_visits()`, one synthetic year, 1 in 10 booked visits missing; each plan is compared with itself without misses):

| | Cheapest first | ReachNT |
|---|---|---|
| 9 in 10 urgent remote repairs fixed within | 63 → 77 days | 3 → 9 days |
| 9 in 10 *missed* urgent remote repairs fixed within | 126 days | 20 days |
| Cost per repair | $559 → $608 | $804 → $862 |

Under ReachNT a missed urgent job keeps its waiting time and gets the deadline boost, so it goes on the next trip out. Under cheapest-first it waits for a cheap trip.

Both measures use synthetic data. They show that the mechanism works, not how real tenants will answer. A pilot needs both repeated on real reports.

## 5. Who does what

| Person | Role in the model |
|---|---|
| Repairs-line staff, Community Housing Officer, maintenance officer, tradesperson | Log the tenant's words and ask the standard questions, with an interpreter when needed |
| Regional coordinator | Checks urgency any time, decides who goes after a missed visit, answers "it got worse" the same day, signs how much cost may count |
| Tradesperson | Records every visit, including missed ones with evidence; says "worse than reported"; can take open jobs |
| Tenant | Can see their place and the reasons, say it got worse, ask for a review (answered within 10 working days), and confirm the fix, by phone, through the housing officer or in the app |
| Community (before any use) | Co-designs the questions, the wording of answers and the fault vocabulary in local languages with Aboriginal Housing NT, land councils and the Aboriginal Interpreter Service |

## 6. Where it lives in the code

| Piece | File |
|---|---|
| Standard questions | `config/taxonomy.yaml` (`intake_questions`) |
| Crowding threshold, assumed answer rate | `config/params.yaml` (`triage`) |
| Household modifiers from answers, record, history and words | `src/reachnt/intake.py` (`household`) |
| Need score | `src/reachnt/urgency.py` |
| Deadline boost | `src/reachnt/simulate.py` (`job_value`) |
| Missed visits re-planned with their clock | `src/reachnt/simulate.py` (`run(..., miss_share=)`) |
| Fairness measure | `src/reachnt/evaluate.py` (`inclusion`) |
| Missed-visit experiment | `src/reachnt/experiments.py` (`missed_visits`), `python run_all.py --extras` |
| Portal: New report, Check the urgency, Who goes, open jobs, "it got worse" | `web/app.js` |
| Server rules | `web/api/sync.js`, `web/api/_auth.js` |
| Database rules | `docs/schema.sql` (`ops.intake_answer`, `ops.urgency_check`, `ops.job_offer`, `ops.escalation`) |
| Tests | `tests/test_core.py`, `tests/test_api.mjs` |
