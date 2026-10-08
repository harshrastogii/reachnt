// ReachNT pitch deck: 10-minute pitch + 5-minute Q&A, CDU IT Code Fair 2026, Artificial Intelligence Challenge.
// Every number comes from outputs/numbers.json, the same file the report and the portal read.
//   NODE_PATH=~/.cache/cq-deck/node_modules PPTX_SKILL=<pptx skill dir> node docs/deck/build_deck.js
//   python docs/deck/compress_media.py "docs/deck/DataChallenge_Team AIC015_Slides.pptx"   (shrinks the screenshots)
// Speaker notes carry the script; docs/deck/PITCH_SCRIPT.md has the same script with timings and Q&A prep.
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..", "..");
const N = JSON.parse(fs.readFileSync(path.join(ROOT, "outputs", "numbers.json"), "utf8"));
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, "outputs", "deck_example.json"), "utf8"));
const SHOT = (n) => path.join(ROOT, "docs", "deck", "shots", n + ".png");
const P = N.policies, Q = N.quality, IN = N.inclusion;
const C0 = P["cheapest_1"], G = P["guarantee_0.2"], R = P["guarantee_0.2_h3"];
const money = (x) => "$" + Math.round(x).toLocaleString("en-AU");
const pct = (x) => Math.round(x * 100) + "%";
const k = (x) => Math.round(x / 1000) + "k";
const band = (pol, b) => Math.round((pol.bands.find((x) => x.band === b) || {}).urgent_p90 || 0);
const H = Q.reader.heldout, PL = Q.simulation.planner, PR = Q.simulation.paired;
const TEAM = "Team AIC015 Top Enders";

const THEME = {
  name: "ReachNT", headFontFace: "Arial", bodyFontFace: "Calibri",
  colors: { dk1: "14181D", lt1: "FFFFFF", dk2: "4A525C", lt2: "F1F3F5", accent1: "0E8FB8", accent2: "D97706", accent3: "1F9D4C",
            accent4: "0A7AFF", accent5: "6E56CF", accent6: "E5352B", hlink: "0A7AFF", folHlink: "6E56CF" },
};
const HEX = { ink: "14181D", ink2: "4A525C", muted: "6B7480", line: "DDE1E6", soft: "F1F3F5", blue: "0A7AFF",
              hex: "0E8FB8", hexSoft: "DFF2F8", cost: "D97706", costSoft: "FBEEDD", good: "1F9D4C", goodSoft: "E3F4E8",
              violet: "6E56CF", violetSoft: "ECE8FA", bad: "E5352B", white: "FFFFFF", night: "0D1418", nightCard: "1A242B" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";   // 13.33 x 7.5 in
pres.title = "ReachNT"; pres.author = TEAM;
pres.subject = "CDU IT Code Fair 2026, Artificial Intelligence Challenge: housing maintenance triage";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const foot = `ReachNT · ${TEAM} · repair requests are synthetic; communities, roads and costs are real`;
const darkFoot = `CDU IT Code Fair 2026 · Artificial Intelligence Challenge · ${TEAM}`;

// ---------------------------------------------------------------- layouts
pres.defineSlideMaster({ title: "Dark", background: { color: HEX.night }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.6, w: 7.4, h: 1.4, fontSize: 60, bold: true, color: C.background1, fontFace: "Arial", valign: "bottom", align: "left" }, text: "" } },
  { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.15, w: 6.6, h: 1.8, fontSize: 22, color: "C9CFD6", valign: "top", align: "left" }, text: "" } },
  { text: { text: darkFoot, options: { x: 0.8, y: 6.75, w: 11.7, h: 0.35, fontSize: 12, color: "9AA3AD" } } },
] });
pres.defineSlideMaster({ title: "Content", background: { color: HEX.white }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.95, fontSize: 28, bold: true, color: C.text1, fontFace: "Arial", valign: "top", align: "left" }, text: "" } },
  { text: { text: foot, options: { x: 0.6, y: 7.02, w: 10, h: 0.3, fontSize: 10, color: HEX.muted } } },
], slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.muted } });
pres.defineSlideMaster({ title: "Shot", background: { color: HEX.night }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.background1, fontFace: "Arial", valign: "top", align: "left" }, text: "" } },
  { text: { text: foot, options: { x: 0.6, y: 7.02, w: 10, h: 0.3, fontSize: 10, color: "9AA3AD" } } },
], slideNumber: { x: 12.2, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: "9AA3AD" } });

// ---------------------------------------------------------------- helpers
const text = (s, t, o) => s.addText(t, { margin: 0, isTextBox: true, valign: "top", fontFace: "Calibri", ...o });
const card = (s, x, y, w, h, fill, name, line) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: line || fill }, rectRadius: 0.1, objectName: name });
// the deck's motif: a hexagon, as in the product and in Uber's H3 grid
function hexIcon(s, x, y, d, fill, label, name, fontSize = 18, fontColor = HEX.white) {
  s.addShape(pres.shapes.HEXAGON, { x, y, w: d, h: d * 0.88, fill: { color: fill }, line: { color: fill }, objectName: name });
  if (label !== undefined) text(s, String(label), { x, y, w: d, h: d * 0.88, align: "center", valign: "middle", fontSize, bold: true, color: fontColor, fontFace: "Arial", objectName: name + "-t" });
}
function stat(s, x, y, w, big, label, color, name, size = 48) {
  text(s, big, { x, y, w, h: 0.95, fontSize: size, bold: true, fontFace: "Arial", color, objectName: name + "-n" });
  text(s, label, { x, y: y + 1.0, w, h: 1.1, fontSize: 15, color: HEX.ink2, objectName: name + "-l" });
}
const shot = (s, n, x, y, w, h, name, extra = {}) => s.addImage({ path: SHOT(n), x, y, w, h, objectName: name, altText: name, ...extra });

// ================================================================ 1 title
pres.addSection({ title: "Opening" });
let s = pres.addSlide({ masterName: "Dark", sectionTitle: "Opening" });
shot(s, "coord", 6.6, 0, 6.73, 7.5, "map-backdrop", { transparency: 35, sizing: { type: "cover", w: 6.73, h: 7.5 } });
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 7.2, h: 7.5, fill: { color: HEX.night }, line: { color: HEX.night }, objectName: "title-veil" });
s.addText("ReachNT", { placeholder: "title" });
s.addText("Urgent repairs fixed on time out bush, without letting cost quietly decide who waits", { placeholder: "body" });
text(s, "Harsh Rastogi · Aashish", { x: 0.8, y: 5.25, w: 6.4, h: 0.4, fontSize: 16, color: "9AA3AD", objectName: "names" });
text(s, "reachnt.vercel.app", { x: 0.8, y: 5.7, w: 6.4, h: 0.4, fontSize: 16, color: "64D2FF", bold: true, objectName: "url" });
s.addNotes(`[HARSH, about 30 seconds]
Good morning. I'm Harsh, this is Aashish, and we're Team Top Enders.
Imagine a family in a remote community in the Northern Territory. The water to their house stops. They ring the repairs line. In town, a plumber would be there in a couple of days. For them, it can take weeks.
Our project, ReachNT, is about why that happens, and what AI can do about it. Aashish will start with the problem.`);

// ================================================================ 2 the problem
pres.addSection({ title: "Problem" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
s.addText("Remote repairs cost more, so they quietly fall to the back", { placeholder: "title" });
stat(s, 0.6, 1.75, 2.8, String(N.communities), "remote communities in our model, with " + N.remote_houses.toLocaleString() + " public houses", HEX.hex, "s-com");
stat(s, 3.6, 1.75, 2.8, "8.5×", "what an emergency repair costs in a very remote community, against a remote one (Nous Group, 2017)", HEX.cost, "s-cost");
stat(s, 6.6, 1.75, 2.8, "96%", "of an emergency job's cost can be travel alone (Nous Group, 2017)", HEX.cost, "s-travel");
stat(s, 9.6, 1.75, 3.1, "6 h", "drive from Katherine to Kalkarindji, one of the 16 communities its tradespeople serve", HEX.violet, "s-drive");
card(s, 0.6, 4.55, 12.1, 2.1, HEX.soft, "story-card");
hexIcon(s, 0.95, 4.95, 0.9, HEX.cost, "!", "story-hex", 26);
text(s, "A real kind of message, from our simulated year", { x: 2.15, y: 4.8, w: 10.2, h: 0.35, fontSize: 13, color: HEX.muted, bold: true, objectName: "story-label" });
text(s, `“${EX.short.split("\n")[0]}”`, { x: 2.15, y: 5.15, w: 10.2, h: 0.5, fontSize: 18, bold: true, color: HEX.ink, objectName: "story-sms" });
text(s, EX.why, { x: 2.15, y: 5.65, w: 10.2, h: 0.85, fontSize: 15, color: HEX.ink2, objectName: "story-why" });
s.addNotes(`[AASHISH, about 50 seconds]
Here's the problem in four numbers.
There are ${N.communities} remote communities in our model, with about ${(Math.round(N.remote_houses / 100) * 100).toLocaleString()} public houses.
Repairs there cost far more. Government research found emergency repairs in very remote communities cost eight and a half times as much, and travel can be almost the whole bill.
Katherine's tradespeople, for example, drive up to six hours to reach some communities.
So here is the kind of message a tenant gets from our simulation: no water to the house, waited ${EX.short.match(/Waiting (\\d+) days/) ? EX.short.match(/Waiting (\\d+) days/)[1] : "57"} days, held up by travel cost. Notice the last line: nobody signed off on that. It just happened.`);

// ================================================================ 3 why it happens
s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
s.addText("Plan for the cheapest jobs, and remote tenants wait weeks", { placeholder: "title" });
s.addChart(pres.charts.BAR, [{ name: "Days until 9 in 10 urgent repairs are fixed", labels: ["Town", "Near town", "Remote (road)", "Very remote", "Cut off in the wet", "Islands"],
  values: ["Town", "Near town (road)", "Remote (road)", "Very remote (road)", "Remote, cut in the wet", "Island (fly-in)"].map((b) => band(C0, b)) }], {
  x: 0.6, y: 1.5, w: 7.4, h: 5.2, barDir: "bar", chartColors: [HEX.cost], showValue: true, dataLabelPosition: "outEnd", dataLabelColor: HEX.ink,
  dataLabelFontSize: 14, dataLabelFontFace: "+mn-lt", catAxisLabelColor: HEX.ink2, catAxisLabelFontSize: 14, catAxisLabelFontFace: "+mn-lt",
  valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, catAxisOrientation: "maxMin",
  showTitle: true, title: "Cheapest jobs first: days until 9 in 10 urgent repairs are fixed", titleFontSize: 14, titleColor: HEX.ink, titleFontFace: "+mn-lt", objectName: "wait-chart" });
card(s, 8.4, 1.6, 4.3, 2.35, HEX.costSoft, "trap-card");
text(s, `${Math.round(C0.urgent_p90_remote)} days`, { x: 8.7, y: 1.8, w: 3.8, h: 0.8, fontSize: 44, bold: true, fontFace: "Arial", color: HEX.cost, objectName: "trap-n" });
text(s, `for 9 in 10 urgent remote repairs, against ${Math.round(C0.urgent_p90_town)} days in town`, { x: 8.7, y: 2.65, w: 3.8, h: 1.0, fontSize: 16, color: HEX.ink, objectName: "trap-l" });
card(s, 8.4, 4.2, 4.3, 2.45, HEX.soft, "why-card");
text(s, [{ text: "Why: ", options: { bold: true, color: HEX.ink } },
         { text: "a schedule built to fix the most jobs for the money always picks town first. It's efficient on paper, and no one ever decides that remote families should wait.", options: { color: HEX.ink2 } }],
  { x: 8.7, y: 4.45, w: 3.8, h: 2.0, fontSize: 16, objectName: "why-text" });
s.addNotes(`[AASHISH, about 50 seconds]
Why does this happen? Because the obvious way to plan repairs is to fix the most jobs for your money.
We simulated a whole year of repairs across the Territory. When you plan for the cheapest jobs, town tenants get urgent repairs in ${Math.round(C0.urgent_p90_town)} days. Remote tenants wait up to ${Math.round(C0.urgent_p90_remote)}. That's the orange bars.
The important part is on the right. No one decided this. Nobody wrote a rule saying remote families wait. It's a side effect of chasing efficiency, and nobody is accountable for it.
That's the gap we set out to close.`);

// ================================================================ 4 solution
pres.addSection({ title: "Solution" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
s.addText("ReachNT: rank by need, share trips, and put a name on the trade-off", { placeholder: "title" });
const steps = [
  ["1", "Read", "Reads what the tenant said, in their words, and picks the fault and how urgent it is. Unsure? A person calls back.", HEX.hex],
  ["2", "Rank by need", "Danger, health, who lives there and time waited set the order. Distance and cost are never in the score.", HEX.good],
  ["3", "Plan shared trips", "Each week it plans who goes where. Neighbouring communities share one trip, found with Uber's H3 hexagons.", HEX.violet],
  ["4", "Explain and sign", "A named coordinator signs how much cost may count. Every tenant can see why their repair waited.", HEX.cost],
];
steps.forEach(([n, h, b, col], i) => {
  const x = 0.6 + i * 3.08;
  card(s, x, 1.75, 2.88, 4.3, HEX.soft, `step-${n}`);
  hexIcon(s, x + 0.3, 2.05, 0.95, col, n, `step-hex-${n}`, 24);
  text(s, h, { x: x + 0.3, y: 3.1, w: 2.4, h: 0.5, fontSize: 21, bold: true, fontFace: "Arial", color: HEX.ink, objectName: `step-h-${n}` });
  text(s, b, { x: x + 0.3, y: 3.65, w: 2.35, h: 2.3, fontSize: 15, color: HEX.ink2, objectName: `step-b-${n}` });
});
text(s, "One tool, three views: the coordinator plans, the tradesperson gets a run sheet that works without signal, and the tenant gets a straight answer.",
  { x: 0.6, y: 6.3, w: 12.1, h: 0.5, fontSize: 16, italic: true, color: HEX.ink2, objectName: "views" });
s.addNotes(`[HARSH, about 50 seconds]
Thanks Aashish. ReachNT does four things.
One: it reads the repair report the way the tenant said it, and works out the fault and how urgent it is. If it isn't sure, a person calls back.
Two: it ranks repairs by need alone. Danger, health, who lives in the house, how long they've waited. Where you live is never part of your score.
Three: every week it plans the trips. And when two communities are close, one tradesperson visits both on one trip. That's where H3 comes in, which I'll come back to.
Four: cost still matters, but a named person has to sign how much it counts. And every tenant can see why their repair is where it is.`);

// ================================================================ 5 the AI that knows when to ask
pres.addSection({ title: "Technology" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("AI that reads tenants' words, and knows when to ask a person", { placeholder: "title" });
const flow = [["What the tenant said", "“no sparks now but the switch is black and kids touch it”", HEX.soft, HEX.ink],
              ["Word rules + a learning model", "Rules catch known phrases; a logistic regression model catches wording the rules miss", HEX.hexSoft, HEX.ink],
              ["Sure, and not dangerous?", "Ranked straight away", HEX.goodSoft, HEX.ink],
              ["Unsure or risky?", "A person checks today. It never downgrades danger on its own", HEX.costSoft, HEX.ink]];
[[0.6, 1.7], [0.6, 3.25], [0.6, 4.8], [3.85, 4.8]].forEach(([x, y], i) => {
  const w = i < 2 ? 6.4 : 3.15;
  card(s, x, y, w, 1.3, flow[i][2], `flow-${i}`);
  text(s, flow[i][0], { x: x + 0.25, y: y + 0.15, w: w - 0.5, h: 0.4, fontSize: 16, bold: true, color: HEX.ink, objectName: `flow-h-${i}` });
  text(s, flow[i][1], { x: x + 0.25, y: y + 0.55, w: w - 0.5, h: 0.7, fontSize: 14, color: HEX.ink2, italic: i === 0, objectName: `flow-b-${i}` });
});
s.addShape(pres.shapes.LINE, { x: 3.8, y: 3.0, w: 0, h: 0.25, line: { color: HEX.muted, width: 1.5, endArrowType: "triangle" }, objectName: "arrow-1" });
s.addShape(pres.shapes.LINE, { x: 3.8, y: 4.55, w: 0, h: 0.25, line: { color: HEX.muted, width: 1.5, endArrowType: "triangle" }, objectName: "arrow-2" });
stat(s, 7.5, 1.7, 5.2, (H.danger.net_recall * 100).toFixed(1) + "%", "of dangerous reports caught, on wording the AI had never seen, because doubtful ones go to a person", HEX.good, "s-caught", 50);
stat(s, 7.5, 3.65, 2.5, H.danger.roc_auc.toFixed(2), "ROC-AUC for the model alone on new wording (1.00 on familiar)", HEX.hex, "s-auc", 40);
stat(s, 10.2, 3.65, 2.5, pct(N.reader.heldout.combined.to_person), "of unfamiliar reports sent to a person", HEX.cost, "s-person", 40);
text(s, "We never show tenants a confidence percentage: when the model said it was 90% sure, it was right about half the time. Being honest about that is part of the design.",
  { x: 7.5, y: 5.6, w: 5.2, h: 1.1, fontSize: 14, italic: true, color: HEX.ink2, objectName: "honest" });
s.addNotes(`[HARSH, about 60 seconds]
Now the AI. Tenants don't fill in forms. They say things like "no sparks now but the switch is black and the kids touch it".
ReachNT reads that with two methods: word rules for phrases we know, and a learning model for wording the rules miss.
The key design choice is that it knows when to ask. If it's unsure, or anything sounds dangerous, a person checks the same day. And it never downgrades danger on its own. In that example, "no sparks" doesn't make it safe.
We tested it on wording it had never seen. The model alone is decent, a ROC-AUC of ${H.danger.roc_auc.toFixed(2)}. With the person in the loop, the system caught ${(H.danger.net_recall * 100).toFixed(1)} percent of dangerous reports.
And we're honest about its limits: its confidence isn't reliable, so we never show tenants a percentage.`);

// ================================================================ 6 fair to people who say less (the inclusive decision-making model)
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("Fair to people who say less, or say it differently", { placeholder: "title" });
shot(s, "intake", 0.6, 1.5, 2.65, 5.05, "shot-intake");
const tell = [["Told in full", "“toilet blocked, my nana lives here, 9 of us, third time I rang”", HEX.soft],
              ["Told in a few words, in Kriol, to the housing officer", "“toilet blocked pls come”. Same house, same need. From the words alone: up to 45 points less", HEX.costSoft]];
tell.forEach(([h, b, fill], i) => {
  const y = 1.5 + i * 1.55;
  card(s, 3.55, y, 4.75, 1.4, fill, `tell-${i}`);
  text(s, h, { x: 3.8, y: y + 0.12, w: 4.3, h: 0.35, fontSize: 13.5, bold: true, color: HEX.ink, fit: "shrink", objectName: `tell-h-${i}` });
  text(s, b, { x: 3.8, y: y + 0.5, w: 4.3, h: 0.85, fontSize: 13, color: HEX.ink2, italic: i === 0, objectName: `tell-b-${i}` });
});
card(s, 3.55, 4.6, 4.75, 1.95, HEX.goodSoft, "ask-card");
text(s, "So everyone is asked the same six questions", { x: 3.8, y: 4.72, w: 4.3, h: 0.35, fontSize: 14, bold: true, color: HEX.ink, objectName: "ask-h" });
text(s, "Anyone in danger now? A baby or young child? An elder? Someone sick, pregnant or with a disability? How many people live there? Told anyone before? The tenancy record and repair history fill in the rest. \"Not asked\" never takes points away.",
  { x: 3.8, y: 5.1, w: 4.3, h: 1.4, fontSize: 12.5, color: HEX.ink2, objectName: "ask-b" });
const fair = [[`${Math.round(IN.words.gap_mean)} → ${Math.round(IN.intake.gap_mean)}`, "points a household lost for saying less (average)", HEX.good],
              [`${pct(IN.words.short_ranked_lower)} → ${pct(IN.intake.short_ranked_lower)}`, "of short reports ranked below the same household told in full", HEX.hex],
              [`${pct(IN.words.vulnerable_recognised_short)} → ${pct(IN.intake.vulnerable_recognised_short)}`, "of vulnerable households recognised from a few words", HEX.violet]];
fair.forEach(([n, l, col], i) => {
  const y = 1.5 + i * 1.62;
  text(s, n, { x: 8.7, y, w: 4.0, h: 0.65, fontSize: 36, bold: true, fontFace: "Arial", color: col, objectName: `fair-n-${i}` });
  text(s, l, { x: 8.7, y: y + 0.68, w: 4.0, h: 0.8, fontSize: 14, color: HEX.ink2, objectName: `fair-l-${i}` });
});
text(s, "Clock starts at first contact · free interpreters (AIS, TIS National, NRS) · how, when and in what language you report is never scored",
  { x: 0.6, y: 6.6, w: 12.1, h: 0.4, fontSize: 12.5, italic: true, color: HEX.ink2, objectName: "fair-foot" });
s.addNotes(`[AASHISH, about 35 seconds]
Thanks Harsh. There's a quieter unfairness too.
If points come only from what tenants say, "my nana lives here, nine of us, third time I rang" beats "toilet blocked, please come". Same house, same need.
So whoever the tenant tells asks the same six questions, with a free interpreter, and the tenancy record fills in the rest.
On three thousand made-up households, saying less cost ${Math.round(IN.words.gap_mean)} points from words alone. With the questions, about ${Math.round(IN.intake.gap_mean)}.
And the clock starts when the tenant first told anyone.`);

// ================================================================ 7 H3
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("Why we built it on Uber's H3 hexagon grid", { placeholder: "title" });
// left: squares vs hexagons, drawn
text(s, "Squares", { x: 0.6, y: 1.55, w: 2.6, h: 0.35, fontSize: 15, bold: true, color: HEX.ink, objectName: "sq-label" });
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  const centre = r === 1 && c === 1, edge = (r === 1) !== (c === 1);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.6 + c * 0.78, y: 1.95 + r * 0.78, w: 0.72, h: 0.72, fill: { color: centre ? HEX.ink : edge ? HEX.hexSoft : HEX.costSoft }, line: { color: HEX.white }, objectName: `sq-${r}-${c}` });
}
text(s, "8 neighbours at 2 different distances", { x: 0.6, y: 4.35, w: 2.6, h: 0.6, fontSize: 13, color: HEX.ink2, objectName: "sq-note" });
text(s, "Hexagons", { x: 3.6, y: 1.55, w: 2.8, h: 0.35, fontSize: 15, bold: true, color: HEX.ink, objectName: "hx-label" });
const hx = 0.78, hy = hx * 0.88;
[[1, 0], [2, 0], [0.5, 1], [1.5, 1], [2.5, 1], [1, 2], [2, 2]].forEach(([c, r], i) => {
  const centre = c === 1.5 && r === 1;
  s.addShape(pres.shapes.HEXAGON, { x: 3.45 + c * hx, y: 1.95 + r * hy * 1.02, w: hx, h: hy, rotate: 90, fill: { color: centre ? HEX.ink : HEX.hexSoft }, line: { color: HEX.white, width: 1.5 }, objectName: `hx-${i}` });
});
text(s, "6 neighbours, all the same distance away", { x: 3.6, y: 4.35, w: 2.8, h: 0.6, fontSize: 13, color: HEX.ink2, objectName: "hx-note" });
card(s, 0.6, 5.15, 5.8, 1.55, HEX.soft, "fair-card");
text(s, [{ text: "Why it matters: ", options: { bold: true, color: HEX.ink } },
         { text: "“two hexagons away” is the same distance in every direction, so deciding which communities can share a trip is fair to all of them.", options: { color: HEX.ink2 } }],
  { x: 0.85, y: 5.35, w: 5.3, h: 1.2, fontSize: 15, objectName: "fair-text" });
// right: four jobs H3 does
const uses = [["Shared trips", `Communities within 2 hexagons (about 90 km) can share a trip, saving $${PR.cost_saved_by_sharing.min.toFixed(0)}–$${PR.cost_saved_by_sharing.max.toFixed(0)} per repair`, HEX.violet],
              ["Privacy", "A house is stored as a small hexagon, not a street address", HEX.good],
              ["Public numbers", "Waits are published per larger hexagon, only where there are at least 5 repairs", HEX.hex],
              ["Field and maps", "\"Nearby jobs\" for tradespeople, the driving-time map, and fast database lookups", HEX.cost]];
uses.forEach(([h, b, col], i) => {
  const y = 1.6 + i * 1.3;
  hexIcon(s, 6.9, y + 0.1, 0.72, col, undefined, `use-hex-${i}`);
  text(s, h, { x: 7.85, y, w: 4.85, h: 0.4, fontSize: 17, bold: true, color: HEX.ink, objectName: `use-h-${i}` });
  text(s, b, { x: 7.85, y: y + 0.42, w: 4.85, h: 0.8, fontSize: 14, color: HEX.ink2, objectName: `use-b-${i}` });
});
s.addNotes(`[AASHISH, about 50 seconds]
This was my favourite decision. Early on I suggested Uber's H3, an open-source map grid made of hexagons, and Harsh built the whole system around it.
Why hexagons? The middle square has neighbours at two different distances, the sides and the corners. A hexagon's six neighbours are all the same distance away.
So "within two hexagons" means the same distance in every direction, and the rule for sharing a trip treats every community the same.
And one grid does four jobs: shared trips, a house stored as a hexagon instead of an address, waiting times published by area without exposing any household, and the maps and "nearby jobs" list for tradespeople.`);

// ================================================================ 8 planning + shared trips
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("Every week, an optimiser plans the trips", { placeholder: "title" });
// diagram: hub with two separate return trips vs one shared loop
const D = (x, y, label, col, name) => { hexIcon(s, x, y, 0.75, col, undefined, name); text(s, label, { x: x - 0.4, y: y + 0.72, w: 1.55, h: 0.35, fontSize: 13, align: "center", color: HEX.ink2, objectName: name + "-l" }); };
text(s, "Two separate trips", { x: 0.6, y: 1.55, w: 3.0, h: 0.35, fontSize: 15, bold: true, color: HEX.ink, objectName: "sep-label" });
D(0.8, 3.6, "Hub", HEX.ink, "sep-hub"); D(2.6, 2.1, "Community A", HEX.violet, "sep-a"); D(3.2, 4.4, "Community B", HEX.violet, "sep-b");
s.addShape(pres.shapes.LINE, { x: 1.55, y: 2.6, w: 1.05, h: 1.25, flipV: true, line: { color: HEX.cost, width: 2.5 }, objectName: "sep-l1" });
s.addShape(pres.shapes.LINE, { x: 1.55, y: 4.1, w: 1.65, h: 0.6, line: { color: HEX.cost, width: 2.5 }, objectName: "sep-l2" });
text(s, "Two drives there and back", { x: 0.6, y: 5.3, w: 3.4, h: 0.35, fontSize: 13, color: HEX.cost, bold: true, objectName: "sep-note" });
text(s, "One shared trip", { x: 4.4, y: 1.55, w: 3.0, h: 0.35, fontSize: 15, bold: true, color: HEX.ink, objectName: "run-label" });
D(4.6, 3.6, "Hub", HEX.ink, "run-hub"); D(6.4, 2.1, "Community A", HEX.violet, "run-a"); D(7.0, 4.4, "Community B", HEX.violet, "run-b");
s.addShape(pres.shapes.LINE, { x: 5.35, y: 2.6, w: 1.05, h: 1.25, flipV: true, line: { color: HEX.hex, width: 2.5 }, objectName: "run-l1" });
s.addShape(pres.shapes.LINE, { x: 6.9, y: 2.95, w: 0.45, h: 1.45, line: { color: HEX.hex, width: 2.5 }, objectName: "run-l2" });
s.addShape(pres.shapes.LINE, { x: 5.35, y: 4.1, w: 1.65, h: 0.6, line: { color: HEX.hex, width: 2.5 }, objectName: "run-l3" });
text(s, "One loop: hub → A → B → hub", { x: 4.4, y: 5.3, w: 3.6, h: 0.35, fontSize: 13, color: HEX.hex, bold: true, objectName: "run-note" });
text(s, "Google OR-Tools (CP-SAT) chooses which communities get a visit and which jobs are done, within each tradesperson's 40 hours, road closures and airstrips.",
  { x: 0.6, y: 5.85, w: 7.4, h: 0.85, fontSize: 14, color: HEX.ink2, objectName: "ortools" });
stat(s, 8.7, 1.65, 4.0, money(G.cost_per_job - R.cost_per_job), "saved per repair by shared trips, against the same plan without them", HEX.hex, "s-saved");
stat(s, 8.7, 3.4, 4.0, pct(1 - R.harm_days_total / G.harm_days_total), "fewer days households live with a fault, because the saving buys more visits", HEX.good, "s-share-harm");
stat(s, 8.7, 5.15, 4.0, (PL.optimal_share * 100).toFixed(1) + "%", `of ${PL.plans.toLocaleString()} weekly plans proved the best possible, in milliseconds`, HEX.violet, "s-optimal", 40);
s.addNotes(`[HARSH, about 35 seconds]
Every week Google's OR-Tools plans the trips around crew hours, road closures and airstrips. A job running out of time gets a boost onto the next trip.
Instead of two trips out and back, one tradesperson does one loop, and H3 tells us which pairs are close enough.
That saves about ${money(G.cost_per_job - R.cost_per_job)} on every repair, and because the savings buy more visits, households spend ${pct(1 - R.harm_days_total / G.harm_days_total)} fewer days living with faults.
And it's fast: the solver proved ${(PL.optimal_share * 100).toFixed(1)} percent of over ${Math.floor(PL.plans / 1000)} thousand weekly plans to be the best possible plan.`);

// ================================================================ 9 results
pres.addSection({ title: "Results" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Results" });
s.addText("Fairness costs a little more, and saves months of waiting", { placeholder: "title" });
const plans = [["Cheapest first", C0, HEX.cost], ["Urgent first, no sharing", G, HEX.blue], ["ReachNT", R, HEX.hex]];
s.addChart(pres.charts.BAR, [{ name: "Days households lived with a fault (thousands)", labels: plans.map((p) => p[0]), values: plans.map((p) => Math.round(p[1].harm_days_total / 1000)) }], {
  x: 0.6, y: 1.5, w: 6.3, h: 4.6, barDir: "col", chartColors: plans.map((p) => p[2]), showValue: true, dataLabelPosition: "outEnd", dataLabelColor: HEX.ink,
  dataLabelFontSize: 16, dataLabelFontFace: "+mn-lt", dataLabelFormatCode: '0"k"', catAxisLabelColor: HEX.ink2, catAxisLabelFontSize: 14, catAxisLabelFontFace: "+mn-lt",
  valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, barGapWidthPct: 60,
  showTitle: true, title: "Days households lived with a fault in a year (thousands)", titleFontSize: 14, titleColor: HEX.ink, titleFontFace: "+mn-lt", objectName: "harm-chart" });
const rows = [["", "Cheapest first", "ReachNT"],
              ["Average cost per repair", money(C0.cost_per_job), money(R.cost_per_job)],
              ["9 in 10 urgent remote repairs fixed within", Math.round(C0.urgent_p90_remote) + " days", Math.round(R.urgent_p90_remote) + " days"],
              ["Days living with a fault", k(C0.harm_days_total), k(R.harm_days_total)]];
s.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, color: j === 2 && i > 0 ? HEX.hex : HEX.ink, fill: { color: i === 0 ? HEX.soft : HEX.white } } }))), {
  x: 7.3, y: 1.6, w: 5.4, colW: [2.6, 1.4, 1.4], fontSize: 15, fontFace: "Calibri", border: { type: "solid", color: HEX.line, pt: 1 }, rowH: 0.55, valign: "middle", objectName: "result-table" });
card(s, 7.3, 4.25, 5.4, 1.85, HEX.hexSoft, "verdict-card");
text(s, `+${pct(R.cost_per_job / C0.cost_per_job - 1)} cost, ${pct(1 - R.harm_days_total / C0.harm_days_total)} fewer days with a fault`, { x: 7.55, y: 4.45, w: 5.0, h: 0.5, fontSize: 20, bold: true, color: HEX.ink, objectName: "verdict" });
text(s, `It held in all five random years we tested: ${pct(PR.fault_days_cut_vs_cheapest.min)}–${pct(PR.fault_days_cut_vs_cheapest.max)} fewer fault-days, for ${pct(PR.cost_rise_vs_cheapest.min)}–${pct(PR.cost_rise_vs_cheapest.max)} more per repair.`,
  { x: 7.55, y: 5.0, w: 5.0, h: 0.95, fontSize: 15, color: HEX.ink2, objectName: "years" });
text(s, `One simulated year on real NT geography: ${N.requests.toLocaleString()} synthetic repair requests, ${N.communities} communities, 5 trade hubs.`, { x: 0.6, y: 6.3, w: 12.1, h: 0.4, fontSize: 13, color: HEX.muted, objectName: "basis" });
s.addNotes(`[HARSH, about 50 seconds]
So what does it buy? We ran a year of ${N.requests.toLocaleString()} made-up requests over the real Territory: real communities, roads, closures and costs.
Planning for the cheapest jobs costs ${money(C0.cost_per_job)} a repair. ReachNT costs ${money(R.cost_per_job)}. About ${pct(R.cost_per_job / C0.cost_per_job - 1)} more.
For that, nine in ten urgent remote repairs are fixed within ${Math.round(R.urgent_p90_remote)} days instead of ${Math.round(C0.urgent_p90_remote)}, and households live with faults for ${pct(1 - R.harm_days_total / C0.harm_days_total)} fewer days. That's the chart.
We didn't trust one lucky year, so we ran five. The result held every time.
We're not saying cost doesn't matter. We're saying the trade-off should be visible, priced, and signed by a person.`);

// ================================================================ 10 product
pres.addSection({ title: "Product" });
s = pres.addSlide({ masterName: "Shot", sectionTitle: "Product" });
s.addText("Live now, on a real satellite map, and on any phone", { placeholder: "title" });
shot(s, "coord", 0.6, 1.4, 7.6, 4.75, "shot-coord");
const phones = [["coord_phone", "Coordinator"], ["field_phone", "Tradesperson"], ["tenant_phone", "Tenant"]];
phones.forEach(([n, l], i) => {
  const x = 8.55 + i * 1.42;
  shot(s, n, x, 1.4, 1.3, 2.81, `shot-${n}`);
  text(s, l, { x: x - 0.1, y: 4.3, w: 1.5, h: 0.3, fontSize: 12, align: "center", color: "C9CFD6", objectName: `shot-l-${i}` });
});
const feats = ["Anyone the tenant tells can log a report, with the same questions",
               "Works without signal: updates are saved on the phone and sent later",
               "Plain words, WCAG 2.2 AA checked, PDFs, no confidence percentages"];
feats.forEach((f, i) => text(s, f, { x: 8.55, y: 4.85 + i * 0.62, w: 4.2, h: 0.6, fontSize: 13, color: "E3E7EB", bullet: true, objectName: `feat-${i}` }));
text(s, "reachnt.vercel.app", { x: 0.6, y: 6.3, w: 7.6, h: 0.4, fontSize: 16, bold: true, color: "64D2FF", objectName: "shot-url" });
s.addNotes(`[HARSH, about 75 seconds, including a short live demo if there's time]
This is the working prototype, live at reachnt dot vercel dot app.
On the left is the coordinator's week: each hexagon is a community, the number is repairs waiting, green means a tradesperson goes this week, and the blue lines are shared trips.
[Live demo, keep it short: New report, log "toilet blocked pls come" from the housing officer and answer the questions; on the job, show the time left and Check the urgency; switch to Tenant and show the timeline.]
On the phone, the tradesperson gets a run sheet that works with no signal and can take open jobs, and the tenant sees every week their repair waited, and why.`);

// ================================================================ 11 trust
pres.addSection({ title: "Trust" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Trust" });
s.addText("People stay in charge, and tenants can push back", { placeholder: "title" });
shot(s, "tenant_phone", 0.6, 1.45, 2.4, 5.2, "trust-phone");
const trust = [["A named person signs the trade-off", "How much cost may count is a signed decision, kept in a tamper-evident record", HEX.cost],
               ["A person can change urgency at any time", "From a call, a visit, a photo or a review. Lowering danger needs someone who spoke to the tenant or saw it", HEX.bad],
               ["A missed visit is never closed, and keeps its place", "Time and what was tried are recorded; then the next trip, another crew, or anyone who can go sooner", HEX.good],
               ["Tenants can ask for a review, or say it got worse", "A person answers a review within 10 working days, and calls back the same day if it got worse", HEX.violet],
               ["People check the AI every week", "1 in 20 reports the computer read alone is re-read by a person", HEX.hex],
               ["Personal details locked away", "Names, phones and addresses in an encrypted vault; the house is just a hexagon", HEX.ink]];
trust.forEach(([h, b, col], i) => {
  const y = 1.4 + i * 0.89;
  hexIcon(s, 3.4, y + 0.06, 0.56, col, undefined, `trust-hex-${i}`);
  text(s, h, { x: 4.2, y, w: 8.5, h: 0.38, fontSize: 17, bold: true, color: HEX.ink, objectName: `trust-h-${i}` });
  text(s, b, { x: 4.2, y: y + 0.39, w: 8.5, h: 0.45, fontSize: 14, color: HEX.ink2, objectName: `trust-b-${i}` });
});
s.addNotes(`[AASHISH, about 45 seconds]
Because this affects people's homes, people stay in charge.
A named coordinator signs how much cost counts.
Urgency can change any time, so a person can change it: on a call, on site, from a photo. The computer never makes danger less urgent.
If a tradesperson couldn't do a job, it's never closed. The coordinator sends it to the next trip, another crew, or anyone who can go sooner, and it keeps its waiting time.
Tenants can ask for a review or say it got worse, and personal details stay in an encrypted vault.`);

// ================================================================ 12 honest limits
s = pres.addSlide({ masterName: "Content", sectionTitle: "Trust" });
s.addText("What we tested, and what we can't claim yet", { placeholder: "title" });
card(s, 0.6, 1.55, 5.85, 5.1, HEX.goodSoft, "tested-card");
text(s, "Tested", { x: 0.9, y: 1.8, w: 5.3, h: 0.5, fontSize: 22, bold: true, fontFace: "Arial", color: HEX.good, objectName: "tested-h" });
const tested = ["92 automated checks on every code change: data, the reader, fair intake, the planner, the server",
                "Five random years of requests; the result held in all five",
                "Every community's position checked against satellite photos",
                "Accessibility: 0 WCAG 2.2 AA issues in every view",
                "Security: locked-down site, validated inputs, sign-in rules ready"];
tested.forEach((t, i) => text(s, t, { x: 0.9, y: 2.45 + i * 0.82, w: 5.3, h: 0.75, fontSize: 15, color: HEX.ink, bullet: true, objectName: `tested-${i}` }));
card(s, 6.85, 1.55, 5.85, 5.1, HEX.costSoft, "limits-card");
text(s, "Not yet", { x: 7.15, y: 1.8, w: 5.3, h: 0.5, fontSize: 22, bold: true, fontFace: "Arial", color: HEX.cost, objectName: "limits-h" });
const limits = ["The repair requests and households are synthetic: no public NT repair data exists",
                "The reader is tested in English only. Tenants speak Kriol, Aboriginal English and many languages",
                "No community has reviewed it yet. That comes first, not last",
                "Our test kit is ready the day real reports arrive, labelled with the Aboriginal Interpreter Service"];
limits.forEach((t, i) => text(s, t, { x: 7.15, y: 2.45 + i * 1.0, w: 5.3, h: 0.95, fontSize: 15, color: HEX.ink, bullet: true, objectName: `limit-${i}` }));
s.addNotes(`[HARSH, about 50 seconds]
We want to be straight about what we've proven and what we haven't.
On the left: we have ninety-two automated checks that run on every change, we tested five random years, we checked every community's location against satellite photos, and the site passes accessibility checks.
On the right: the repair requests are synthetic, because no public repair data exists. The reader is tested in English only, and many tenants speak Kriol or Aboriginal English. And no community has reviewed this yet.
That's why our first recommendation is about people, not code.`);

// ================================================================ 13 recommendations
pres.addSection({ title: "Close" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Close" });
s.addText("What we recommend", { placeholder: "title" });
const recs = [["1", "Make the trade-off a signed decision", "Publish the triage rules, ask every tenant the same questions however they report, and record who decides how much cost may count.", HEX.cost],
              ["2", "Pilot in one region, with communities", "Start with the Katherine hub's 16 communities, co-designed with tenants, Aboriginal Housing NT, land councils and the Interpreter Service.", HEX.hex],
              ["3", "Test the AI on real words first", "Score the reader on real reports in Kriol and Aboriginal English before it reads a single one on its own.", HEX.violet]];
recs.forEach(([n, h, b, col], i) => {
  const y = 1.6 + i * 1.7;
  card(s, 0.6, y, 12.1, 1.5, HEX.soft, `rec-${n}`);
  hexIcon(s, 0.95, y + 0.3, 0.95, col, n, `rec-hex-${n}`, 24);
  text(s, h, { x: 2.25, y: y + 0.22, w: 10.2, h: 0.45, fontSize: 21, bold: true, fontFace: "Arial", color: HEX.ink, objectName: `rec-h-${n}` });
  text(s, b, { x: 2.25, y: y + 0.72, w: 10.2, h: 0.7, fontSize: 16, color: HEX.ink2, objectName: `rec-b-${n}` });
});
s.addNotes(`[AASHISH, about 40 seconds]
Three recommendations.
One: make the trade-off a signed decision. Publish the rules, ask every tenant the same questions, and record who decides how much cost counts.
Two: pilot it in one region, the Katherine hub's sixteen communities, and design it with tenants, Aboriginal Housing NT, land councils and interpreters.
Three: test the AI on real words before it reads anything on its own.`);

// ================================================================ 14 close
s = pres.addSlide({ masterName: "Dark", sectionTitle: "Close" });
shot(s, "tenant_desk", 6.6, 0, 6.73, 7.5, "close-backdrop", { transparency: 30, sizing: { type: "cover", w: 6.73, h: 7.5 } });
s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 7.2, h: 7.5, fill: { color: HEX.night }, line: { color: HEX.night }, objectName: "close-veil" });
text(s, "Where someone lives shouldn't decide how long they wait", { x: 0.8, y: 0.75, w: 6.0, h: 2.3, fontSize: 36, bold: true, fontFace: "Arial", color: HEX.white, valign: "bottom", objectName: "close-title" });
s.addText(`ReachNT fixes 9 in 10 urgent remote repairs within ${Math.round(R.urgent_p90_remote)} days instead of ${Math.round(C0.urgent_p90_remote)}, for ${pct(R.cost_per_job / C0.cost_per_job - 1)} more, and makes someone own that choice.`, { placeholder: "body" });
text(s, "reachnt.vercel.app  ·  github.com/harshrastogii/reachnt", { x: 0.8, y: 5.55, w: 6.4, h: 0.4, fontSize: 16, color: "64D2FF", bold: true, objectName: "close-links" });
text(s, "Thank you. Questions welcome.", { x: 0.8, y: 6.0, w: 6.4, h: 0.4, fontSize: 18, color: "FFFFFF", objectName: "thanks" });
s.addNotes(`[HARSH, about 20 seconds]
To finish: where someone lives shouldn't decide how long they wait for water, power or a safe home.
ReachNT fixes urgent remote repairs in days instead of months, for a cost we can see and name, and it makes someone own that choice.
Thank you. We're happy to take questions.`);

(async () => {
  const out = path.join(ROOT, "docs", "deck", "DataChallenge_Team AIC015_Slides.pptx");
  await pres.writeFile({ fileName: out });
  const skill = process.env.PPTX_SKILL;
  if (skill) { const { applyTheme } = require(path.join(skill, "scripts", "apply_theme.js")); await applyTheme(out, THEME); }
  console.log("wrote", out);
})();
