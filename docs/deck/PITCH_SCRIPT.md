# ReachNT pitch script

10-minute pitch, then 5 minutes of questions, face to face with industry judges. CDU IT Code Fair 2026, Artificial Intelligence Challenge, Team AIC015 Top Enders.

Slides: `DataChallenge_Team AIC015_Slides.pptx` (or `.pdf`). The same script is in each slide's speaker notes. Every number comes from `outputs/numbers.json`; if the pipeline is re-run, rebuild the deck (`node docs/deck/build_deck.js`) and re-read the numbers below.

**Who speaks:** Harsh opens (slide 1). Aashish presents the problem, the inclusive model (slide 6), H3 (his idea), floods (slide 10) and trust, and gives the recommendations. Harsh presents the solution, the AI, planning, results, the demo and the close. Swap freely; the notes don't depend on who says them.

**Timing:** about 9 minutes 40 seconds spoken, which leaves 20 seconds of slack. If you're running late, cut the live demo on slide 11 and talk over the screenshots.

**If you only have 5 minutes:** use slides 1, 3, 4, 6, 9, 11 and 15, and shorten each one to its first two sentences.

**Before you start:**
- Open https://reachnt.vercel.app in a browser tab and wait for the map to load.
- Close the tip boxes.
- Leave it on Coordinator, "Early Feb · wet".

**Tips for sounding natural:**
- Don't read the slide; it's there for the judges. Say the one idea in your own words.
- Pause after the big numbers (62 days, 73%). Let them land.
- Say "we found", not "our analysis demonstrates".

---

### 1. Title  
*HARSH, about 30 seconds*

Good morning. I'm Harsh, this is Aashish, and we're Team Top Enders.
Imagine a family in a remote community in the Northern Territory. The water to their house stops. They ring the repairs line. In town, a plumber would be there in a couple of days. For them, it can take weeks.
Our project, ReachNT, is about why that happens, and what AI can do about it. Aashish will start with the problem.

### 2. The problem in four numbers  
*AASHISH, about 40 seconds*

Here's the problem in four numbers.
There are 70 remote communities in our model, with about 4,500 public houses.
Emergency repairs in very remote communities cost eight and a half times as much, and travel can be almost the whole bill. Katherine's tradespeople drive up to six hours.
So here is the kind of message a tenant gets from our simulation: no water to the house, waited 57 days, held up by travel cost. Notice the last line: nobody signed off on that. It just happened.

### 3. Why it happens  
*AASHISH, about 50 seconds*

Why does this happen? Because the obvious way to plan repairs is to fix the most jobs for your money.
We simulated a whole year of repairs across the Territory. When you plan for the cheapest jobs, town tenants get urgent repairs in 3 days. Remote tenants wait up to 62. That's the orange bars.
The important part is on the right. No one decided this. Nobody wrote a rule saying remote families wait. It's a side effect of chasing efficiency, and nobody is accountable for it.
That's the gap we set out to close.

### 4. What ReachNT does  
*HARSH, about 40 seconds*

Thanks Aashish. ReachNT does four things.
One: it reads the report the way the tenant said it. If it isn't sure, a person calls back.
Two: it ranks repairs by need alone. Where you live is never part of your score.
Three: every week it plans the trips, and close communities share one trip.
Four: a named person signs how much cost counts, and every tenant can see why their repair is where it is.

### 5. AI that knows when to ask  
*HARSH, about 50 seconds*

Now the AI. Tenants don't fill in forms. They say things like "no sparks now but the switch is black and the kids touch it".
ReachNT reads that with word rules and a learning model for wording the rules miss.
The key design choice: if it's unsure, or anything sounds dangerous, a person checks the same day, and it never downgrades danger on its own.
We tested it on wording it had never seen. The model alone is decent, a ROC-AUC of 0.84. With the person in the loop, the system caught 99.3 percent of dangerous reports.
And we're honest about its limits: its confidence isn't reliable, so we never show tenants a percentage.

### 6. Fair to people who say less  
*AASHISH, about 35 seconds*

Thanks Harsh. There's a quieter unfairness too.
If points come only from what tenants say, "my nana lives here, nine of us, third time I rang" beats "toilet blocked, please come". Same house, same need.
So whoever the tenant tells asks the same six questions, with a free interpreter, and the tenancy record fills in the rest.
On three thousand made-up households, saying less cost 19 points from words alone. With the questions, about 2.
And the clock starts when the tenant first told anyone.

### 7. Why H3 hexagons  
*AASHISH, about 40 seconds*

This was my favourite decision. Early on I suggested Uber's H3, an open-source map grid made of hexagons, and Harsh built the whole system around it.
Why hexagons? The middle square has neighbours at two different distances, the sides and the corners. A hexagon's six neighbours are all the same distance away.
So "within two hexagons" means the same distance in every direction, and the rule for sharing a trip treats every community the same.
And one grid does four jobs: shared trips, privacy, public numbers by area, and the maps.

### 8. Planning the trips  
*HARSH, about 35 seconds*

Every week Google's OR-Tools plans the trips around crew hours, road closures and airstrips. A job running out of time gets a boost onto the next trip.
Instead of two trips out and back, one tradesperson does one loop, and H3 tells us which pairs are close enough. And a plumber and an electrician going to the same place share the ute or the plane.
That saves about $73 on every repair, and because the savings buy more visits, households spend 18% fewer days living with faults.
And it's fast: the solver proved 99.4 percent of over 25 thousand weekly plans to be the best possible plan.

### 9. Results  
*HARSH, about 50 seconds*

So what does it buy? A year of 37,508 made-up requests over the real Territory.
Planning for the cheapest jobs costs $559 a repair. ReachNT costs $803. About 44% more.
For that, nine in ten urgent remote repairs are fixed within 3 days instead of 62, and households live with faults for 73% fewer days. That's the chart.
We didn't trust one lucky year, so we ran five. The result held every time.
We're not saying cost doesn't matter. We're saying the trade-off should be visible, priced, and signed by a person.

### 10. Floods and cyclones  
*AASHISH, about 35 seconds*

Floods and cyclones hit whole communities at once. The coordinator declares an event: every house made safe within 48 hours, one team trip with all the trades, and surge crews from the contractor panel.
We modelled a flood like January 2023 at Kalkarindji. With the usual crews, flood repairs took 15 days, and everyone else in the region slipped from 3 to 10.
With surge crews, both stayed at 3 days. A disaster shouldn't quietly take other communities' trades.

### 11. The product (live demo)  
*HARSH, about 65 seconds, including a short live demo if there's time*

This is the working prototype, live at reachnt dot vercel dot app.
On the left is the coordinator's week: each hexagon is a community, the number is repairs waiting, green means a tradesperson goes this week, and the blue lines are shared trips.
[Live demo, keep it short: Housing officer view, record "still broken" for a tenant; Coordinator, Checks, send it to another crew; Tenant timeline.]
On the phone, tradespeople get a run sheet that works with no signal, and tenants see every week their repair waited, and why.

### 12. People stay in charge  
*AASHISH, about 45 seconds*

Because this affects people's homes, people stay in charge.
A named coordinator signs how much cost counts.
Urgency can change any time, so a person can change it: on a call, on site, from a photo. The computer never makes danger less urgent.
If a tradesperson couldn't do a job, it's never closed. The coordinator sends it to the next trip, another crew, or anyone who can go sooner, and it keeps its waiting time.
No app is needed: the housing officer can record anything for a tenant, and a fix that didn't hold moves up the line.

### 13. What we tested, and what we can't claim yet  
*HARSH, about 50 seconds*

We want to be straight about what we've proven and what we haven't.
On the left: we have ninety-eight automated checks that run on every change, we tested five random years, we checked every community's location against satellite photos, and the site passes accessibility checks.
On the right: the repair requests are synthetic, because no public repair data exists. The reader is tested in English only, and many tenants speak Kriol or Aboriginal English. And no community has reviewed this yet.
That's why our first recommendation is about people, not code.

### 14. What we recommend  
*AASHISH, about 40 seconds*

Three recommendations.
One: make the trade-off a signed decision. Publish the rules, ask every tenant the same questions, and record who decides how much cost counts.
Two: pilot it in one region, the Katherine hub's sixteen communities, and design it with tenants, Aboriginal Housing NT, land councils and interpreters.
Three: test the AI on real words before it reads anything on its own.

### 15. Close  
*HARSH, about 20 seconds*

To finish: where someone lives shouldn't decide how long they wait for water, power or a safe home.
ReachNT fixes urgent remote repairs in days instead of months, for a cost we can see and name, and it makes someone own that choice.
Thank you. We're happy to take questions.

---

## Likely questions, and short answers

**Who updates the portal for a tenant who has no app?**
Their Community Housing Officer, in the Housing officer view. They log reports with the same questions, and record "it's fixed", "still broken", "it got worse" or a review request for the tenant. The server accepts these only for the officer's own communities, and the tenant's timeline says "recorded by your housing officer".

**What if the tradesperson's fix didn't work?**
The tenant, or their housing officer, says "still broken". The job reopens with 50 extra points and keeps the day it was first reported, so its deadline has passed and it goes on the next trip. The coordinator can send a different crew.

**Can different trades go together?**
Yes. A plumber and an electrician booked to the same community that week share one ute or one charter. In our year that saved a further $130 per repair. Different trades going to neighbouring communities are suggested to share one loop.

**What happens in a flood or cyclone?**
The coordinator declares an event over the communities hit. Every house is made safe within 48 hours, one team trip carries all the trades, and surge crews come from the contractor panel. In our model of a January 2023-style flood at Kalkarindji, the usual crews took 15 days and the rest of the region slipped from 3 to 10 days; with surge crews both stayed at 3.

**How do repair requests get into ReachNT? Does the coordinator type them in?**
No. The tenant tells someone: the repairs line, their Community Housing Officer, the maintenance officer, a tradesperson, the front counter, or the app. That person logs the tenant's words in "New report" and asks the same six questions. The coordinator looks after the line, the trips and the checks. In our demo, the year of requests is synthetic; reports logged in the portal are validated by the server, and in production they go into the database.

**What if a tradesperson can't do the job?**
They record why: no one home, can't get in, need parts, needs another trade, or unsafe. "No one home" needs the time and what they tried. The job is never closed. The coordinator sends it to the next trip, a named crew, or offers it to any tradesperson of that trade on the panel; the first to accept gets it. It keeps its waiting time, and as its deadline nears it gets a boost onto the next trip. With 1 in 10 visits missing, ReachNT still fixed 9 in 10 missed urgent remote repairs within 20 days; cheapest-first took 126.

**An urgency can change. Who updates it?**
Any person, any time: when the tenant rings, when the housing officer or a tradesperson sees it, from a photo, or after a review. Raising it takes effect at once, and "dangerous" sends the maintenance officer that day. Lowering a dangerous repair needs someone who spoke to the tenant or saw it, and a reason the tenant can read. The computer can never lower it. Tenants and tradespeople can also press "it got worse", and a person calls back the same day.

**Doesn't ranking by need still favour people who explain well?**
That's what we fixed. Points for a baby, an elder or a crowded house used to come only from the tenant's words. Now everyone is asked the same questions, the tenancy record fills in household size, and the repair history fills in repeats. Saying less used to cost 19 points on average; now it costs about 2. When or how you report, your language and whether you use the app are never in the score, and a test fails if they ever are.

**Is this real data?**
The communities, house counts, roads, wet-season closures, airstrips, deadlines and costs are real or come from published sources. The repair requests are made up, because no public NT repair data exists. That's why we compare plans against each other rather than claim exact dollar figures.

**Where is the AI?**
Two places. A learning model, working with word rules, reads free-text reports and decides the fault and how urgent it is. An optimiser, Google OR-Tools, plans each week's trips. We kept the AI where it helps and put people where judgement matters.

**Why not use ChatGPT or another large language model to read the reports?**
We need to explain and test every decision. A small model plus published word rules is explainable, cheap, and runs without internet. And the safety net matters more than the model: anything doubtful goes to a person.

**How accurate is it?**
On wording it had never seen, the whole system caught 99.3% of dangerous reports, by sending doubtful ones to a person. That's about 40% of unfamiliar reports. The model alone scores a ROC-AUC of 0.84. We haven't tested it on Kriol or Aboriginal English yet, and that's our first recommendation.

**Why H3 and not just distance in kilometres?**
- Hexagons have six equal neighbours, so "two hexagons away" means the same thing in every direction. That keeps the sharing rule fair.
- The same grid stores a house without its address, publishes waits without exposing a household, and makes database lookups fast.
- It's open source from Uber, and Postgres supports it.

**Doesn't ReachNT just cost more?**
About 44% more per repair than planning for the cheapest jobs. For that, urgent remote repairs are fixed in 3 days instead of 62, and families live with faults for 73% fewer days. Shared trips win back $73 of that on every repair. The point is that someone chooses that trade-off openly and signs it.

**What stops a tradesperson saying "no one home" to skip a hard job?**
They can't close the job that way. They record the time and at least one thing they tried, the tenant is told, and the job stays open for the next trip. The server rejects a "no one home" without that evidence.

**What about privacy?**
- Names, phone numbers and addresses sit in an encrypted vault that only intake staff can open, and every look is logged.
- Everywhere else a house is a small hexagon.
- Public numbers are shown only for areas with at least 5 repairs.
- It's hosted in Australia.

**Who owns the decision if something goes wrong?**
A named person signs how much cost is allowed to count, and that record can't be quietly changed. Tenants can ask for a review, and a person answers within 10 working days. The AI never has the last word on danger.

**What would you do with more time or funding?**
Co-design with tenants, Aboriginal Housing NT, land councils and the Interpreter Service. Test the reader on real reports in Kriol and Aboriginal English. Then pilot it with the Katherine hub's 16 communities.

**How long did it take, and what did you use?**
Python (pandas, scikit-learn, OR-Tools, h3), a web app on MapLibre with Esri satellite imagery, hosted on Vercel, and tests that run on every change. We used Claude as a coding and writing assistant, declared in the report's appendix.
