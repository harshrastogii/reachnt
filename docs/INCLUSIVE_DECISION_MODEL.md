# ReachNT's inclusive decision-making model

ReachNT decides the order in which repairs are done. In a regional or remote community, the easy way to do that is unfair without anyone meaning it to be. A tenant who rings early, fills in every field, writes good English and uses the app gets ahead of a tenant who tells the Community Housing Officer in Kriol that the toilet is broken.

ReachNT's rule is that **the place in line follows need only**. Need means the fault, who lives in the house (in three tiers), and how long the household has waited.

The rule is written into the code, tested on every change and measured. It applies to Aboriginal and Torres Strait Islander tenants, to migrants and refugees, and to anyone else who finds forms, English, phones or apps hard.

## 1. What decides a repair's place, and what never does

| Counts | Never counts |
|---|---|
| The fault and how dangerous it is (FS17 category, harm, Healthy Living Practice) | Where the house is: distance, travel cost, community, region |
| Who lives there, in three tiers (below), and a crowded house | How the report arrived: phone, Community Housing Officer, maintenance officer, tradesperson, app |
| A repeat of a fault that wasn't fixed | When in the day or week the tenant got in touch, and who got in first |
| How long the household has waited, counted from the day they first told anyone | How much the tenant said, how well they spelled it, or their English |
| | Their language, or whether they needed an interpreter |
| | Whether they own a phone or use the app |

`urgency.score` reads only the fault, the household modifiers and days waited. `tests/test_core.py::test_urgency_signature_has_no_place_or_cost_inputs` fails if the function mentions any of these: distance, cost, community, remote, band, channel, language, English, interpreter, submitted, form, app, phone or logged.

### Who lives there: three tiers

| Tier | Who | What it adds |
|---|---|---|
| 1. Life-preservation | Someone who needs power, cooling or medical supplies to stay well (dialysis, insulin, oxygen, medicine kept in the fridge); a baby under 12 months; a frail elder | 40 points. Losing power, water or cooling (`lifeline_faults`) becomes **Immediate**: made safe the same day |
| 2. High systemic risk | Young children; someone pregnant, sick, or finding it hard to get around | 25 points |
| 3. Everyone else | | No extra points |

One tier counts per household, the highest. The points are assumptions in `config/params.yaml` (`tier1_points`, `vulnerable_points`), to be set with the community.

What the tiers deliberately leave out:
- **Aboriginality.** Age is asked as "an elder old enough for aged care", so nobody has to state it and the score never needs it.
- **Who heads the household**, income or employment. These are not need for a repair, and using them would treat similar houses differently.
- **Isolation or flood risk of the community.** That is about where the house is. It belongs in trip planning (charters, wet-season pre-positioning), not in anyone's place in line.

## 2. The five ways the old way was unfair, and what ReachNT does

### Saying less (form completeness, English proficiency)
Before this change, the household part of the score came only from the tenant's words. "Toilet blocked, my nana lives here, 9 of us, third time I rang" earned 45 points that "toilet blocked pls come" did not, for the same household.

Now three sources fill it in, and any "yes" counts:
1. **The same short questions, asked every time, on every channel.** Staff or an interpreter read them out (`config/taxonomy.yaml` → `intake_questions`):
   - Is anyone in danger right now?
   - Does anyone need power, cooling or medical supplies to stay well? (Tier 1)
   - Is there a baby under 12 months, or a frail elder? (Tier 1)
   - Are there young children, or is anyone pregnant, sick, or finding it hard to get around? (Tier 2)
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
- The line is ordered by need, not first come first served. Waiting time adds points only after half the clock has passed (+3 a day), so nothing waits forever. A minor fault would need many months of waiting to outrank a dangerous one, and the guarantee puts urgent and dangerous jobs on the next trip as their clock runs out.
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

## 3a. Tenants who don't use the app, and fixes that don't hold

- **The Community Housing Officer has their own view.** They log reports with the same questions, and record what a tenant tells them: it's fixed, it's still broken, it got worse, or they want a review. The server accepts these only for tenants in the officer's own communities, and each is marked "recorded by your housing officer", so the tenant's timeline says who did it.
- **A fix that didn't hold moves up.** "Still broken" reopens the job with 50 rework points (an assumption, in `config/params.yaml`). It keeps the day it was first reported, so its clock has usually run out and the deadline boost puts it on the next trip. The coordinator can send a different crew.

## 3b. Floods, cyclones and fires

When a disaster hits whole communities, need still sets the order, and the coordinator declares an event:
- make every house safe within 48 hours;
- send one team trip with the trades needed, sharing the vehicle or plane;
- ask the contractor panel for surge crews, local Aboriginal Business Enterprises first, as a signed decision;
- tell every household about the hotline, the housing officer and free interpreters.

The point for fairness is the rest of the region. In the modelled flood, without surge crews the other Katherine-hub communities' urgent repairs slipped from 3 to 10 days (9 in 10). With surge crews they stayed at 3. A disaster should not quietly take other communities' trades.

## 3c. Roads and weather now: prompts, not decisions

The Trips tab reads the **NT Road Report** (closures and flooding) and **Bureau of Meteorology** station observations (rain since 9 am, temperature) through `web/api/warnings.js`, cached for 10 minutes. If either feed can't be reached, a saved snapshot is shown and labelled with its date.

It turns them into prompts for the coordinator:
- a road closed on a community's access road, or within 30 km: how many repairs wait there, and whether an airstrip lets a charter still go;
- more than 50 mm of rain since 9 am within 80 km: "Declare a flood?", with the communities ticked;
- heat that feels like 38°C or more within 80 km: the Tier 1 households there waiting on power, water or cooling.

Nothing here changes anyone's place in line. The coordinator decides, and a declared event is a signed decision like any other.

## 4. Measured, not just claimed

**Saying less** (`evaluate.inclusion()`, 3,000 synthetic households, each described twice: once in full, once in a few words):

| | Words only (before) | With the standard questions (now) |
|---|---|---|
| Points lost by the short telling (households with something to tell) | 50 on average (median 20) | 5 on average (median 0) |
| Short telling ranked lower than the full one | 95% | 6% |
| Places lost in a shared queue | 14% of the queue | 1.2% |
| Tier 1 or Tier 2 households recognised from a short telling | 13% | 89% |

What's left comes from questions left unanswered (we assume 1 in 10). The average is higher than before tiers because a Tier 1 household that is never asked can also miss being raised to Immediate when it loses power, water or cooling. That is why every unanswered question triggers a call-back, the same day for a lifeline fault.

**Missed visits** (`experiments.missed_visits()`, one synthetic year, 1 in 10 booked visits missing; each plan is compared with itself without misses):

| | Cheapest first | ReachNT |
|---|---|---|
| 9 in 10 urgent remote repairs fixed within | 62 → 72 days | 3 → 9 days |
| 9 in 10 *missed* urgent remote repairs fixed within | 126 days | 17 days |
| Cost per repair | $561 → $611 | $821 → $879 |

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
| Tier points, lifeline faults, crowding threshold, assumed answer rate | `config/params.yaml` (`triage`) |
| Tier and the Immediate rule for Tier 1 | `src/reachnt/urgency.py` (`tier`, `category`) |
| Roads and weather now | `web/api/warnings.js`, `scripts/warnings_snapshot.py`, `web/data/warnings_snapshot.json` |
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
