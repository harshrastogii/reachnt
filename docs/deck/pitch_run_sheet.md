# ReachNT pitch run sheet: 10 minutes + 5 minutes Q&A

The deck carries the 5-minute version; the live demo fills the rest. Start the portal before you begin (`python -m http.server 8731 --directory web`, open http://localhost:8731). Without Wi-Fi it switches to the bundled satellite tiles.

| Time | Slide or screen | Say (one line) |
|---|---|---|
| 0:00 | 1 Title | Remote repairs: too few trades, huge distances. Efficiency quietly decides who waits; we make that decision visible and owned. |
| 0:40 | 2 Problem | The official clock already gives remote houses 2.5× longer. A lone emergency call-out to a very remote community is mostly travel. |
| 1:40 | 3 The trap | Same crews, cheapest-first schedule: remote urgent repairs wait 62 days at the 90th percentile, town 3. Nobody signed off on that. |
| 2:30 | 4 How it works | Two separate steps: need decides the order, logistics decides the trips. Distance can't sneak into the score; a test enforces it. |
| 3:00 | 5 H3 | Uber's hexagon grid: neighbours within two rings share a trip. 68 run zones across the NT. |
| 3:30 | **Demo: Read a report** | Paste "water through the ceiling onto the power point, sparks". It reads Immediate and quotes the phrase. Then "pls come": a person calls back. |
| 4:30 | **Demo: This week** | Wet-season week, Katherine hub. 3D hexagons: green trips, orange waiting. Blue lines are run zones. Switch the setting to "Cheapest jobs first" and the remote trips vanish. |
| 5:30 | **Demo: Trade-off** | The curve. Click the default. Sign it with a role and a reason. |
| 6:15 | **Demo: Ask why** | Pick a remote job. The answer names the cost decision and now the signature you just made. Switch the setting and the answer changes because the reason changes. |
| 7:15 | 6 Trade-off priced | ReachNT: +$218 a job buys −71% harm-days and 62 → 3 days. H3 run zones alone save $68 a job. |
| 7:45 | Demo: Tradesperson, then Tenant | The plumber's run sheet on a phone; the tenant's timeline built from the reason log. |
| 8:20 | 7 and 10 | Where the wait lands; personal data in an encrypted vault on free tools. |
| 8:50 | 11 Limits | Reader drops from 90% to 79% on new wording; 40% go to a person. Synthetic requests. No co-design yet. We say so. |
| 9:20 | 12 Recommendations | Make the remote allowance a signed, quarterly, published decision. |

## Likely questions

- **Isn't this just a priority score?** No. The score is need-only. The trade-off sits in the planner's cost weight and the guarantee, and a person signs it. The point is to keep those two apart.
- **Why synthetic data?** No public NT work-order data exists; the Menzies Healthy Homes evaluators couldn't get it either. Geography, roads, clocks, job mix and cost ratios are real. The comparisons between settings are the finding, not the absolute numbers.
- **How do you know the costs are realistic?** One job sent alone to Kintore comes out 92% travel; Nous (2017) found "up to 96%". Ten jobs on one trip: 57%.
- **Does the answer change if your assumptions are wrong?** The sweep changes crew capacity, wet-season cuts, charter price and the random year. The default beats cheapest-first on harm and remote waits in every variant; the size of the gap moves.
- **Couldn't tenants game it by writing "sparks"?** Immediate jobs are confirmed by phone and made safe by the local Housing Maintenance Officer before any trade is sent.
- **What about Kriol and Aboriginal languages?** That's the biggest gap. The reader is an assistant for intake staff, not a replacement. The vocabulary has to be co-designed with the Aboriginal Interpreter Service and tenants. We don't machine-translate.
- **Why not an LLM?** Every sentence a tenant reads must be true. Our answers are assembled from logged facts, so they can't invent a reason. An LLM could help paraphrase later, under the same constraint.
- **Who would use this?** Regional maintenance coordinators at DHLGCD and the Aboriginal Business Enterprises holding Healthy Homes contracts. The tenant answer goes through Community Housing Officers.
- **Why H3 and not squares?** Hexagons have six neighbours at one distance, so "within two rings" is fair in every direction. S2 squares have edge and corner neighbours at two distances. H3 doesn't know roads, so we pair it with the road-closure register.
- **Where does personal data live, and what does it cost?** One encrypted vault (pgcrypto) in Postgres; everything else uses a house ID and a 76 m hexagon. Postgres, PostGIS and h3-pg are free; Neon's Sydney region supports them for a pilot, or NTG hosts it.
- **Why no Aboriginal art in the design?** Using art without the artist's and community's consent breaches cultural protocols. A visual identity would be commissioned through an Aboriginal art centre.
