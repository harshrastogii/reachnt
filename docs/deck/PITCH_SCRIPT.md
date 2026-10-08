# ReachNT pitch script

10-minute pitch, then 5 minutes of questions, face to face with industry judges. CDU IT Code Fair 2026, Artificial Intelligence Challenge, Team AIC015 Top Enders.

Slides: `DataChallenge_Team AIC015_Slides.pptx` (or `.pdf`). The same script is in each slide's speaker notes. Every number comes from `outputs/numbers.json`; if the pipeline is re-run, rebuild the deck (`node docs/deck/build_deck.js`) and re-read the numbers below.

**Who speaks:** Harsh opens (slide 1). Aashish presents the problem, the inclusive model (slide 6), H3 (his idea), floods (slide 10) and trust, and gives the recommendations. Harsh presents the solution, the AI, planning, results, the demo and the close. Swap freely; the notes don't depend on who says them.

**Timing:** about 8 minutes spoken plus a 40-second demo; the per-slide times add up to 9 minutes 10 seconds, which leaves 50 seconds of slack. If you're running late, cut the live demo on slide 11 and talk over the screenshots.

**If you only have 5 minutes:** use slides 1, 3, 4, 6, 9, 11 and 15, and shorten each one to its first two sentences.

**Before you start:**
- Open https://reachnt.vercel.app in a browser tab and wait for the map to load.
- Close the tip boxes.
- Leave it on Coordinator, "Early Feb · wet".

**Tips for sounding natural:**
- Don't read the slide; it's there for the judges. Say the one idea in your own words.
- Pause after the big numbers (62 days, 74%). Let them land.
- Say "we found", not "our analysis demonstrates".

---

### 1. Title  
*HARSH, about 30 seconds*

Good morning. I'm Harsh, this is Aashish, and we're Team Top Enders.
Imagine a family in a remote community in the Northern Territory. The water to their house stops. They ring the repairs line. In town, a plumber would be there in a couple of days. For them, it can take weeks.
Our project, ReachNT, is about why that happens, and what AI can do about it. Aashish will start with the problem.

### 2. The problem in four numbers  
*AASHISH, about 35 seconds*

Here's the problem in four numbers.
There are 70 remote communities in our model, with about 4,500 public houses.
Emergency repairs in very remote communities cost eight and a half times as much, and travel can be almost the whole bill. Katherine's tradespeople drive up to six hours.
And this is the kind of message a tenant gets in our simulation. Notice the last line: nobody signed off on that wait. It just happened.

### 3. Why it happens  
*AASHISH, about 35 seconds*

Why? Because the obvious way to plan repairs is to fix the most jobs for your money.
We simulated a whole year across the Territory. Planning for the cheapest jobs, town tenants get urgent repairs in 3 days. Remote tenants wait up to 62.
Nobody wrote a rule saying remote families wait. It's a side effect of chasing efficiency, and nobody is accountable for it. That's the gap we set out to close.

### 4. What ReachNT does  
*HARSH, about 35 seconds*

Thanks Aashish. ReachNT does four things.
One: it reads the report the way the tenant said it. If it isn't sure, a person calls back.
Two: it ranks repairs by need alone. Where you live is never part of your score.
Three: every week it plans the trips, and close communities share one trip.
Four: a named person signs how much cost counts, and every tenant can see why their repair is where it is.

### 5. AI that knows when to ask  
*HARSH, about 40 seconds*

Now the AI. Tenants say things like "no sparks now but the switch is black and the kids touch it".
ReachNT reads that with word rules and a learning model for wording the rules miss. If it's unsure, or anything sounds dangerous, a person checks the same day. It never downgrades danger on its own.
On wording the model never saw, it scored a ROC-AUC of 0.84. With the person in the loop, the system caught 99.3 percent of dangerous reports. Its confidence isn't reliable, so tenants never see a percentage.

### 6. Fair to people who say less  
*AASHISH, about 40 seconds*

There's a quieter unfairness too. If points come only from what tenants say, "my nana lives here, nine of us, third time I rang" beats "toilet blocked, please come". Same house, same need.
So whoever the tenant tells asks the same six questions, with a free interpreter. Tier one, like someone on dialysis or a newborn, gets more points, and losing power or water becomes an emergency for them.
Across three thousand made-up households, saying less cost 50 points from words alone. With the questions, about 5.

### 7. Why H3 hexagons  
*AASHISH, about 35 seconds*

This was my favourite decision. I suggested Uber's H3, an open-source grid of hexagons, and Harsh built the system around it.
A square's neighbours sit at two distances, sides and corners. A hexagon's six neighbours are all the same distance away. So "within two hexagons" is fair in every direction, and the rule for sharing a trip treats every community the same.
One grid does four jobs: shared trips, privacy, public numbers by area, and the maps.

### 8. Planning the trips  
*HARSH, about 35 seconds*

Every week Google's OR-Tools plans the trips around crew hours, road closures and airstrips. A job running out of time gets a boost onto the next trip.
One tradesperson does one loop instead of two trips, and H3 tells us which pairs are close enough. That saves about $76 on every repair, and households spend 17% fewer days living with faults.
The solver proved 99.5 percent of twenty-six thousand weekly plans to be the best possible.

### 9. Results  
*HARSH, about 45 seconds*

So what does it buy? A year of 37,508 made-up requests over the real Territory.
Planning for the cheapest jobs costs $561 a repair. ReachNT costs $821, about 47% more.
For that, nine in ten urgent remote repairs are fixed within 3 days instead of 62, and households live with faults for 74% fewer days. Against a cheaper plan that also guarantees urgent jobs, ReachNT costs 5% more for 29% fewer fault-days.
We ran five random years. The result held every time. The trade-off should be visible, priced, and signed by a person.

### 10. Floods and cyclones  
*AASHISH, about 35 seconds*

Floods hit whole communities at once. The coordinator declares an event: every house made safe within 48 hours, one team trip, and surge crews from the contractor panel.
In a flood like January 2023 at Kalkarindji, the usual crews took 14 days, and the rest of the region slipped from 3 to 10. With surge crews, both stayed at 3.
The portal reads the NT Road Report and the Bureau of Meteorology, so heavy rain prompts the coordinator. It prompts; a person decides.

### 11. The product (live demo)  
*HARSH, about 60 seconds, including a 40-second live demo*

This is the working prototype, live at reachnt dot vercel dot app. Each hexagon is a community, the number is repairs waiting, and the blue lines are shared trips.
[Live demo, 40 seconds, practised beforehand: Tradesperson, tap Done on the first card. Housing officer, Ngukurr, the same house: "Still broken", Record. Coordinator, Checks, "Choose a crew", Send. Tenant: it opens on that repair, showing the reopened timeline.]
Tradespeople get a run sheet that works with no signal, and tenants see every week their repair waited, and why.

### 12. People stay in charge  
*AASHISH, about 35 seconds*

Because this affects people's homes, people stay in charge.
A named coordinator signs how much cost counts. A person can change urgency any time, on a call, on site or from a photo, and lowering a dangerous repair needs someone who spoke to the tenant or saw it.
A missed visit is never closed: it goes to the next trip or another crew, keeping its waiting time. And no app is needed: the housing officer can record anything for a tenant.

### 13. What we tested, and what we can't claim yet  
*HARSH, about 40 seconds*

We want to be straight about what we've proven and what we haven't.
We have 148 automated checks on every change, five random years, every community's location checked against satellite photos, and an independent audit whose findings we fixed.
But the requests are synthetic, because no public repair data exists. The reader is tested in English only. And no community has reviewed this yet. That's why our first recommendation is about people, not code.

### 14. What we recommend  
*AASHISH, about 30 seconds*

Three recommendations.
One: make the trade-off a signed decision. Publish the rules, ask every tenant the same questions, and record who decides how much cost counts.
Two: pilot it in the Katherine hub's sixteen communities, designed with tenants, Aboriginal Housing NT, land councils and interpreters.
Three: test the AI on real words before it reads anything on its own.

### 15. Close  
*HARSH, about 20 seconds*

To finish: where someone lives shouldn't decide how long they wait for water, power or a safe home.
ReachNT fixes urgent remote repairs in days instead of months, for a cost we can see and name, and it makes someone own that choice.
Thank you. We're happy to take questions.

## Likely questions, and short answers

**Who updates the portal for a tenant who has no app?**
Their Community Housing Officer, in the Housing officer view. They log reports with the same questions, and record "it's fixed", "still broken", "it got worse" or a review request for the tenant. With sign-in switched on, the server accepts these only for the officer's own communities, and the tenant's timeline says "recorded by your housing officer".

**What if the tradesperson's fix didn't work?**
The tenant, or their housing officer, says "still broken". The job reopens with 50 extra points and keeps the day it was first reported, so its deadline has passed and it goes on the next trip. The coordinator can send a different crew.

**Can different trades go together?**
Yes. A plumber and an electrician booked to the same community that week share one ute or one charter. In our year that saved a further $105 per repair. Different trades going to neighbouring communities are suggested to share one loop.

**What happens in a flood or cyclone?**
The coordinator declares an event over the communities hit. Every house is made safe within 48 hours, one team trip carries all the trades, and surge crews come from the contractor panel. In our model of a January 2023-style flood at Kalkarindji, the usual crews took 14 days and the rest of the region slipped from 3 to 10 days; with surge crews both stayed at 3.

**How do repair requests get into ReachNT? Does the coordinator type them in?**
No. The tenant tells someone: the repairs line, their Community Housing Officer, the maintenance officer, a tradesperson, the front counter, or the app. That person logs the tenant's words in "New report" and asks the same six questions. The coordinator looks after the line, the trips and the checks. In our demo, the year of requests is synthetic; reports logged in the portal are validated by the server, and in production they go into the database.

**What if a tradesperson can't do the job?**
They record why: no one home, can't get in, need parts, needs another trade, or unsafe. "No one home" needs the time and what they tried. The job is never closed. The coordinator sends it to the next trip, a named crew, or offers it to any tradesperson of that trade on the panel; the first to accept gets it. It keeps its waiting time, and as its deadline nears it gets a boost onto the next trip. With 1 in 10 visits missing, ReachNT still fixed 9 in 10 missed urgent remote repairs within 17 days; cheapest-first took 126.

**An urgency can change. Who updates it?**
Any person, any time: when the tenant rings, when the housing officer or a tradesperson sees it, from a photo, or after a review. Raising it takes effect at once, and "dangerous" sends the maintenance officer that day. Lowering a dangerous repair needs someone who spoke to the tenant or saw it, and a reason the tenant can read. The computer can never lower it. Tenants and tradespeople can also press "it got worse", and a person calls back the same day.

**Why tiers? Why not ask whether someone is Aboriginal, or who heads the household?**
The tiers ask only what changes the harm from a fault. Tier 1 is life-preservation: someone who needs power, cooling or medical supplies, like dialysis, insulin or oxygen, a baby under 12 months, or a frail elder. They get 40 points, and losing power, water or cooling becomes Immediate. Tier 2 is young children, pregnancy, illness or trouble getting around: 25 points. We ask about an elder "old enough for aged care", so nobody has to state their Aboriginality. Who heads the household, income and how isolated the community is aren't need for a repair, so they're not in the score. Isolation belongs in trip planning.

**Where do the road and weather warnings come from? Do they change the order?**
The NT Road Report's public feed for closures and flooding, and Bureau of Meteorology station observations for rain since 9 am and temperature, read every 10 minutes. If a feed is down, the portal shows a saved copy and says so. They only prompt the coordinator: a road closed near a community, heavy rain ("Declare a flood?"), or heat for Tier 1 homes without power or cooling. Nothing changes anyone's place unless a person decides.

**Doesn't ranking by need still favour people who explain well?**
That's what we fixed. Points for who lives there (Tier 1 or Tier 2) or a crowded house used to come only from the tenant's words. Now everyone is asked the same questions, the tenancy record fills in household size, and the repair history fills in repeats. Saying less used to cost 50 points on average; now it costs about 5, and an unanswered question gets a call-back. When or how you report, your language and whether you use the app are never in the score, and a test fails if they ever are.

**Is this real data?**
The communities, house counts, roads, wet-season closures, airstrips, deadlines and costs are real or come from published sources. The repair requests are made up, because no public NT repair data exists. That's why we compare plans against each other rather than claim exact dollar figures.

**Where is the AI?**
Two places. A learning model, working with word rules, reads free-text reports and decides the fault and how urgent it is. An optimiser, Google OR-Tools, plans each week's trips. The portal's New report tab uses the published word rules; the learning model runs in the engine. We kept the AI where it helps and put people where judgement matters.

**Why not use ChatGPT or another large language model to read the reports?**
We need to explain and test every decision. A small model plus published word rules is explainable, cheap, and runs without internet. And the safety net matters more than the model: anything doubtful goes to a person.

**How accurate is it?**
On wording it had never seen, the whole system caught 99.3% of dangerous reports, by sending doubtful ones to a person. That's about 40% of unfamiliar reports. The model alone scores a ROC-AUC of 0.84. We haven't tested it on Kriol or Aboriginal English yet, and that's our first recommendation.

**Why H3 and not just distance in kilometres?**
- Hexagons have six equal neighbours, so "two hexagons away" means the same thing in every direction. That keeps the sharing rule fair.
- The same grid stores a house without its address, publishes waits without exposing a household, and makes database lookups fast.
- It's open source from Uber, and Postgres supports it.

**Doesn't ReachNT just cost more?**
About 47% more per repair than planning for the cheapest jobs. For that, urgent remote repairs are fixed in 3 days instead of 62, and families live with faults for 74% fewer days. Shared trips win back $76 of that on every repair. The point is that someone chooses that trade-off openly and signs it.

**What stops a tradesperson saying "no one home" to skip a hard job?**
They can't close the job that way. They record the time and at least one thing they tried, the tenant is told, and the job stays open for the next trip. The server rejects a "no one home" without that evidence.

**What about privacy?**
- Names, phone numbers and addresses sit in an encrypted vault that only intake staff can open, and every look is logged.
- Everywhere else a house is a small hexagon.
- Public numbers are shown only for areas with at least 5 repairs.
- The server functions run in Sydney; for a pilot, the database would be hosted in Australia too.

**Who owns the decision if something goes wrong?**
A named person signs how much cost is allowed to count, and that record can't be quietly changed. Tenants can ask for a review, and a person answers within 10 working days. The AI never has the last word on danger.

**What would you do with more time or funding?**
Co-design with tenants, Aboriginal Housing NT, land councils and the Interpreter Service. Test the reader on real reports in Kriol and Aboriginal English. Then pilot it with the Katherine hub's 16 communities.

**How long did it take, and what did you use?**
Python (pandas, scikit-learn, OR-Tools, h3), a web app on MapLibre with Esri satellite imagery, hosted on Vercel, and tests that run on every change. We used Claude as a coding and writing assistant, declared in the report's appendix.
