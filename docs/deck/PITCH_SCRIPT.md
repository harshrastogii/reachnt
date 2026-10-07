# ReachNT pitch script

10-minute pitch, then 5 minutes of questions, face to face with industry judges. CDU IT Code Fair 2026, Artificial Intelligence Challenge, Team AIC015 Top Enders.

Slides: `DataChallenge_Team AIC015_Slides.pptx` (or `.pdf`). The same script is in each slide's speaker notes. Every number comes from `outputs/numbers.json`; if the pipeline is re-run, rebuild the deck (`node docs/deck/build_deck.js`) and re-read the numbers below.

**Who speaks:** Aashish opens with the problem, presents H3 (his idea) and trust, and gives the recommendations. Harsh presents the solution, the AI, planning, results, the demo and the close. Swap freely; the notes don't depend on who says them.

**Timing:** about 9 minutes 40 seconds spoken, which leaves 20 seconds of slack. If you're running late, cut the live demo on slide 9 and talk over the screenshots.

**If you only have 5 minutes:** use slides 1, 3, 4, 6, 8, 9 and 13, and shorten each one to its first two sentences.

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
*AASHISH, about 30 seconds]
Good morning. I'm Aashish, this is Harsh, and we're Team Top Enders.
Imagine a family in a remote community in the Northern Territory. The water to their house stops. They ring the repairs line. In town, a plumber would be there in a couple of days. For them, it can take weeks.
Our project, ReachNT, is about why that happens, and what AI can do about it.*



### 2. The problem in four numbers  
*AASHISH, about 50 seconds]
Here's the problem in four numbers.
There are 70 remote communities in our model, with about 4,500 public houses.
Repairs there cost far more. Government research found emergency repairs in very remote communities cost eight and a half times as much, and travel can be almost the whole bill.
Katherine's tradespeople, for example, drive up to six hours to reach some communities.
So here is the kind of message a tenant gets from our simulation: no water to the house, waited 57 days, held up by travel cost. Notice the last line: nobody signed off on that. It just happened.*



### 3. Why it happens  
*AASHISH, about 50 seconds]
Why does this happen? Because the obvious way to plan repairs is to fix the most jobs for your money.
We simulated a whole year of repairs across the Territory. When you plan for the cheapest jobs, town tenants get urgent repairs in 3 days. Remote tenants wait up to 62. That's the orange bars.
The important part is on the right. No one decided this. Nobody wrote a rule saying remote families wait. It's a side effect of chasing efficiency, and nobody is accountable for it.
That's the gap we set out to close.*



### 4. What ReachNT does  
*HARSH, about 50 seconds]
Thanks Aashish. ReachNT does four things.
One: it reads the repair report the way the tenant said it, and works out the fault and how urgent it is. If it isn't sure, a person calls back.
Two: it ranks repairs by need alone. Danger, health, who lives in the house, how long they've waited. Where you live is never part of your score.
Three: every week it plans the trips. And when two communities are close, one tradesperson visits both on one trip. That's where H3 comes in, which I'll come back to.
Four: cost still matters, but a named person has to sign how much it counts. And every tenant can see why their repair is where it is.*



### 5. AI that knows when to ask  
*HARSH, about 60 seconds]
Now the AI. Tenants don't fill in forms. They say things like "no sparks now but the switch is black and the kids touch it".
ReachNT reads that with two methods: word rules for phrases we know, and a learning model for wording the rules miss.
The key design choice is that it knows when to ask. If it's unsure, or anything sounds dangerous, a person checks the same day. And it never downgrades danger on its own. In that example, "no sparks" doesn't make it safe.
We tested it on wording it had never seen. The model alone is decent, a ROC-AUC of 0.84. With the person in the loop, the system caught 99.3 percent of dangerous reports.
And we're honest about its limits: its confidence isn't reliable, so we never show tenants a percentage.*



### 6. Why H3 hexagons  
*AASHISH, about 60 seconds]
This was my favourite decision. Early on I suggested Uber's H3, an open-source map grid made of hexagons, and Harsh built the whole system around it.
Why hexagons? Look at the squares on the left: the middle square has neighbours at two different distances, the sides and the corners. A hexagon's six neighbours are all exactly the same distance away.
That matters for fairness. When we say two communities are "within two hexagons" of each other, that means the same distance in every direction, so the rule for sharing a trip treats every community the same.
And one grid does four jobs: it finds shared trips, it stores a house as a hexagon instead of an address for privacy, it lets us publish waiting times for areas without exposing any household, and it powers the maps and the "nearby jobs" list for tradespeople.*



### 7. Planning the trips  
*HARSH, about 50 seconds]
Every week an optimiser, Google's OR-Tools, plans the trips: which communities get a visit, which jobs get done, within each tradesperson's hours, road closures in the wet, and airstrips.
Here's the shared trip. Instead of driving out to community A and back, then out to community B and back, one tradesperson does one loop. The H3 grid tells us which pairs are close enough.
That saves about $73 on every repair, and because the savings buy more visits, households spend 18% fewer days living with faults.
And it's fast: the solver proved 99.4 percent of over 25 thousand weekly plans to be the best possible plan.*



### 8. Results  
*HARSH, about 60 seconds]
So what does it buy? We ran one year of synthetic repair requests over the real Territory: real communities, roads, wet-season closures and costs, and 37,508 made-up requests.
Planning for the cheapest jobs costs $559 a repair. ReachNT costs $803. About 44% more.
For that, nine in ten urgent remote repairs are fixed within 3 days instead of 62, and households live with faults for 73% fewer days. That's the chart.
We didn't trust one lucky year, so we ran five. The result held every time.
We're not saying cost doesn't matter. We're saying the trade-off should be visible, priced, and signed by a person.*



### 9. The product (live demo)  
*HARSH, about 90 seconds, including a short live demo if there's time]
This is the working prototype, live at reachnt dot vercel dot app.
On the left is the coordinator's week: each hexagon is a community, the number is repairs waiting, green means a tradesperson goes this week, and the blue lines are shared trips.
[Live demo, keep it short: tap a community; open Compare and show the four plans; switch to Tenant and show the timeline.]
On the right, the same app on a phone. The tradesperson gets a numbered run sheet that works out bush with no signal, and the tenant sees their repair, every week it waited, and the real reason.*



### 10. People stay in charge  
*AASHISH, about 50 seconds]
Because this affects people's homes, we built it so people stay in charge.
A named coordinator signs how much cost is allowed to count, and that signature is kept.
Tenants can ask for a review, and a person answers within ten working days.
Every week a person re-reads a sample of what the AI read on its own, to catch mistakes early.
A tradesperson can't close a job just by saying no one was home. They record when they came and what they tried, and the tenant is told.
And personal details sit in an encrypted vault. Everywhere else, a house is just a hexagon on the map.*



### 11. What we tested, and what we can't claim yet  
*HARSH, about 50 seconds]
We want to be straight about what we've proven and what we haven't.
On the left: we have eighty automated checks that run on every change, we tested five random years, we checked every community's location against satellite photos, and the site passes accessibility checks.
On the right: the repair requests are synthetic, because no public repair data exists. The reader is tested in English only, and many tenants speak Kriol or Aboriginal English. And no community has reviewed this yet.
That's why our first recommendation is about people, not code.*



### 12. What we recommend  
*AASHISH, about 40 seconds]
Three recommendations.
One: make the trade-off a signed decision. Publish the rules, and record who decides how much cost counts.
Two: pilot it in one region, the Katherine hub's sixteen communities, and design it with tenants, Aboriginal Housing NT, land councils and interpreters.
Three: test the AI on real words before it reads anything on its own.*



### 13. Close  
*HARSH, about 20 seconds]
To finish: where someone lives shouldn't decide how long they wait for water, power or a safe home.
ReachNT fixes urgent remote repairs in days instead of months, for a cost we can see and name, and it makes someone own that choice.
Thank you. We're happy to take questions.*



---

## Likely questions, and short answers

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
