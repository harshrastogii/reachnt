// Build the ReachNT pitch deck from outputs/numbers.json (same numbers as the report and the portal).
//   NODE_PATH=~/.cache/cq-deck/node_modules PPTX_SKILL=<pptx skill dir> node docs/deck/build_deck.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const ROOT = path.resolve(__dirname, "..", "..");
const N = JSON.parse(fs.readFileSync(path.join(ROOT, "outputs", "numbers.json"), "utf8"));
const FM = fs.readFileSync(path.join(ROOT, "docs", "report", "reachnt_report.md"), "utf8");
const TEAM = (FM.match(/^team:\s*(.+)$/m) || [, "Team XX"])[1].trim();
const TEAM_NAME = (FM.match(/^team_name:\s*(.+)$/m) || [, ""])[1].trim();
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, "outputs", "deck_example.json"), "utf8"));
const SHOT = (n) => path.join(ROOT, "docs", "deck", "shots", n + ".png");
const P = N.policies;
const C0 = P["cheapest_1"], G = P["guarantee_0.2"], R = P["guarantee_0.2_h3"], F = P["floor_1"], RT = P["guarantee_0.5_h3"];
const money = (x) => "$" + Math.round(x).toLocaleString("en-AU");
const pct = (x) => Math.round(x * 100) + "%";
const band = (pol, b) => Math.round((pol.bands.find((x) => x.band === b) || {}).urgent_p90 || 0);

const THEME = {
  name: "ReachNT", headFontFace: "Arial", bodyFontFace: "Calibri",
  colors: { dk1: "14181D", lt1: "FFFFFF", dk2: "4A525C", lt2: "F1F3F5", accent1: "0E8FB8", accent2: "D97706", accent3: "1F9D4C",
            accent4: "0A7AFF", accent5: "6E56CF", accent6: "E5352B", hlink: "0A7AFF", folHlink: "6E56CF" },
};
const HEX = { ink: "14181D", ink2: "4A525C", muted: "7B8490", line: "DDE1E6", soft: "F1F3F5", blue: "0A7AFF",
              hex: "0E8FB8", hexSoft: "DFF2F8", cost: "D97706", costSoft: "FBEEDD", good: "1F9D4C",
              violet: "6E56CF", white: "FFFFFF", night: "0D1418" };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.title = "ReachNT"; pres.author = `${TEAM} ${TEAM_NAME}`;
pres.subject = "CDU IT Code Fair 2026, AI Challenge: housing maintenance triage";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const foot = `ReachNT · ${TEAM} ${TEAM_NAME} · synthetic requests, real geography`;
const darkFoot = `CDU IT Code Fair 2026 · AI Challenge · ${TEAM} ${TEAM_NAME}`;

pres.defineSlideMaster({ title: "Dark", background: { color: HEX.night }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.0, w: 11.7, h: 1.5, fontSize: 54, bold: true, color: C.background1, fontFace: "Arial", valign: "bottom", align: "left" }, text: "" } },
  { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.65, w: 11.0, h: 1.6, fontSize: 22, color: "C9CFD6", valign: "top", align: "left" }, text: "" } },
  { text: { text: darkFoot, options: { x: 0.8, y: 6.7, w: 11.7, h: 0.4, fontSize: 12, color: "9AA3AD" } } },
] });
pres.defineSlideMaster({ title: "DarkList", background: { color: HEX.night }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 0.7, w: 11.7, h: 1.2, fontSize: 38, bold: true, color: C.background1, fontFace: "Arial", valign: "top", align: "left" }, text: "" } },
  { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 2.1, w: 11.7, h: 4.3, fontSize: 19, color: "E3E7EB", valign: "top", align: "left" }, text: "" } },
  { text: { text: darkFoot, options: { x: 0.8, y: 6.7, w: 11.7, h: 0.4, fontSize: 12, color: "9AA3AD" } } },
] });
pres.defineSlideMaster({ title: "Content", background: { color: HEX.white }, margin: [0.5, 0.6, 0.6, 0.6], objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.95, fontSize: 32, bold: true, color: C.text1, fontFace: "Arial", valign: "top", align: "left" }, text: "" } },
  { text: { text: foot, options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: HEX.muted } } },
], slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: HEX.muted } });
pres.defineSlideMaster({ title: "Shot", background: { color: HEX.night }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontSize: 30, bold: true, color: C.background1, fontFace: "Arial", valign: "top", align: "left" }, text: "" } },
  { text: { text: foot, options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: "9AA3AD" } } },
], slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: "9AA3AD" } });

const card = (s, x, y, w, h, fill, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.08, objectName: name });
const text = (s, t, o) => s.addText(t, { margin: 0, isTextBox: true, valign: "top", ...o });
function stat(s, x, y, w, big, label, color, name) {
  text(s, big, { x, y, w, h: 0.95, fontSize: 46, bold: true, fontFace: "Arial", color, objectName: name + "-n" });
  text(s, label, { x, y: y + 1.0, w, h: 1.3, fontSize: 16, color: HEX.ink2, objectName: name + "-l" });
}

// 1 ----------------------------------------------------------------------------
pres.addSection({ title: "Opening" });
let s = pres.addSlide({ masterName: "Dark", sectionTitle: "Opening" });
s.addText("ReachNT", { placeholder: "title" });
s.addText([{ text: "Remote repair triage that ranks by need, shares trips with H3 hexagons, and makes someone sign for who waits", options: { breakLine: true } },
           { text: "Harsh Rastogi · Aashish", options: { fontSize: 16, color: "9AA3AD" } }], { placeholder: "body" });
s.addNotes("Remote NT housing repairs: too few trades, huge distances. Any schedule built for efficiency quietly sends remote tenants to the back. ReachNT ranks by need, uses Uber's H3 hexagons to share trips, prices the equity trade-off, makes a named person sign it, and tells every tenant why they waited.");

// 2 ----------------------------------------------------------------------------
pres.addSection({ title: "Problem" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
s.addText("Town jobs always look cheaper, so remote tenants wait", { placeholder: "title" });
[["5,058", "remote public housing dwellings in 73 NT communities (DHLGCD)", HEX.ink],
 ["5 vs 2", "business days for an urgent repair, remote vs town, in the official NT standard (FS17)", HEX.cost],
 ["8.5×", "what an emergency repair costs in a very remote community vs a remote one (Nous 2017)", HEX.cost],
 ["96%", "of an emergency job's cost can be travel; batched planned work 11–37% (Nous 2017)", HEX.blue]].forEach(([n, l, col], i) => {
  const x = 0.6 + i * 3.08; card(s, x, 1.75, 2.85, 3.3, HEX.soft, `prob-${i}`); stat(s, x + 0.25, 2.0, 2.4, n, l, col, `prob-${i}`);
});
text(s, "Santa Teresa tenants listed 600+ repairs in 2015. The courts held public housing must be at least safe, and the High Court allowed compensation for the distress of unrepaired homes (2023).",
  { x: 0.6, y: 5.35, w: 12.1, h: 0.9, fontSize: 16, color: HEX.ink2, italic: true, objectName: "st" });
s.addNotes("The official clock already gives remote houses 2.5 times longer. Costs explain why. Left alone, a cost-optimised schedule pushes remote work back further, and nobody signs off on it.");

// 3 ----------------------------------------------------------------------------
s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
s.addText("Left to “cheapest jobs first”, nobody decides who waits", { placeholder: "title" });
card(s, 0.6, 1.7, 5.9, 2.7, HEX.costSoft, "trap-r");
stat(s, 0.95, 2.0, 5.3, `${Math.round(C0.urgent_p90_remote)} days`, `Urgent repairs in remote communities: 90% done within this. Cut off in the wet: ${band(C0, "Remote, cut in the wet")} days.`, HEX.cost, "trap-r");
card(s, 6.8, 1.7, 5.9, 2.7, HEX.soft, "trap-t");
stat(s, 7.15, 2.0, 5.3, `${Math.round(C0.urgent_p90_town)} days`, "Urgent repairs in the five hub towns. Same schedule, same crews.", HEX.ink, "trap-t");
text(s, `One synthetic year on real NT geography: 70 communities, ${(N.remote_houses + N.town_houses).toLocaleString()} houses, ${N.requests.toLocaleString()} requests, ${N.crews_total} tradespeople. Cheapest-first costs ${money(C0.cost_per_job)} a job, the lowest of any setting, which is why it looks reasonable on a cost report. ${pct(C0.overdue_official_remote)} of remote urgent repairs pass even the official 5-day remote clock.`,
  { x: 0.6, y: 4.7, w: 12.1, h: 1.3, fontSize: 17, color: HEX.ink2, objectName: "trap-note" });

// 4 ----------------------------------------------------------------------------
pres.addSection({ title: "Solution" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
s.addText("Rank by need. Share trips with hexagons. Price the gap", { placeholder: "title" });
[["Read", "Phrase rules + a text model turn a free-text report into a fault, trade and health practice. Unsure or dangerous: a person.", HEX.blue],
 ["Most urgent first", "Danger, health, who lives there and time waited set the order. Where someone lives never does.", HEX.blue],
 ["Share trips", "Nearby communities get one visit instead of two. The plan works around trades, wet-season roads and airstrips.", HEX.hex],
 ["Show the cost of fairness", "Each way of planning, side by side: dollars per repair against who waits.", HEX.cost],
 ["Sign and explain", "A named role signs a setting. Each week a job waits, the reason is logged and the tenant can see it.", HEX.good]].forEach(([t, b, col], i) => {
  const x = 0.6 + i * 2.46;
  card(s, x, 1.75, 2.3, 4.0, HEX.soft, `step-${i}`);
  s.addShape(pres.shapes.HEXAGON, { x: x + 0.2, y: 1.95, w: 0.6, h: 0.52, fill: { color: col }, line: { color: col }, objectName: `step-h-${i}` });
  text(s, String(i + 1), { x: x + 0.2, y: 1.95, w: 0.6, h: 0.52, fontSize: 18, bold: true, color: HEX.white, align: "center", valign: "middle", objectName: `step-n-${i}` });
  text(s, t, { x: x + 0.2, y: 2.65, w: 1.95, h: 0.75, fontSize: 18, bold: true, fontFace: "Arial", color: HEX.ink, objectName: `step-t-${i}` });
  text(s, b, { x: x + 0.2, y: 3.45, w: 1.95, h: 2.2, fontSize: 14, color: HEX.ink2, objectName: `step-b-${i}` });
});
s.addNotes("Urgency and logistics are separate steps. A single priority score that mixes them is how distance gets in without anyone choosing it. A unit test fails if location appears in the urgency function.");

// 5 H3 ----------------------------------------------------------------------------
s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
s.addText("H3: Uber's hexagon grid, used for remote repairs", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "outputs", "figures", "fig1_map.png"), x: 0.3, y: 1.35, w: 7.0, h: 7.0 * (1100 / 1410), objectName: "h3map" });
[["Shared trips", "Two communities whose hexagons are no more than 2 apart (about 90 km) get one visit: Katherine → A → B → home. 68 pairs, e.g. Ngukurr + Rittarangu."],
 ["Why hexagons", "Six neighbours, all the same distance away, so “within k rings” is a fair circle. Square grids such as S2 have neighbours at two distances."],
 ["While you're out there", "A tradesperson's phone lists open jobs within 3 resolution-5 rings of their run."],
 ["A house is a hexagon", "Records hold a 76 m resolution-10 cell, never an address. Public views use 36 km² cells, hidden below 5 jobs."]].forEach(([t, b], i) => {
  const y = 1.45 + i * 1.32;
  s.addShape(pres.shapes.HEXAGON, { x: 7.5, y: y + 0.05, w: 0.42, h: 0.36, fill: { color: HEX.hex }, line: { color: HEX.hex }, objectName: `h3-dot-${i}` });
  text(s, t, { x: 8.1, y, w: 4.7, h: 0.42, fontSize: 18, bold: true, fontFace: "Arial", color: HEX.ink, objectName: `h3-t-${i}` });
  text(s, b, { x: 8.1, y: y + 0.42, w: 4.7, h: 0.85, fontSize: 14, color: HEX.ink2, objectName: `h3-b-${i}` });
});
s.addNotes("H3 is free and open source, with bindings for Python, JavaScript and Postgres. In a place with few people and huge distances, the win is grouping work fairly in every direction. H3 does not know roads; we pair it with the road-closure register.");

// 6 price --------------------------------------------------------------------------
pres.addSection({ title: "Findings" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Findings" });
s.addText("Fairness costs a little more, and shared trips cut the cost", { placeholder: "title" });
s.addImage({ path: path.join(ROOT, "outputs", "figures", "fig2_frontier.png"), x: 0.4, y: 1.4, w: 8.3, h: 8.3 * (3.3 / 7.2), objectName: "frontier" });
card(s, 9.0, 1.45, 3.75, 5.3, HEX.hexSoft, "price");
s.addText([
  { text: "ReachNT vs cheapest-first", options: { bold: true, fontSize: 15, color: HEX.ink, breakLine: true } },
  { text: `+${money(R.cost_per_job - C0.cost_per_job)} per repair (+${pct(R.cost_per_job / C0.cost_per_job - 1)})`, options: { fontSize: 22, bold: true, color: HEX.cost, breakLine: true } },
  { text: `−${pct(1 - R.harm_days_total / C0.harm_days_total)} days living with faults`, options: { fontSize: 22, bold: true, color: HEX.good, breakLine: true } },
  { text: `9 in 10 urgent remote repairs fixed within ${Math.round(C0.urgent_p90_remote)} → ${Math.round(R.urgent_p90_remote)} days`, options: { fontSize: 14, color: HEX.ink2, breakLine: true } },
  { text: " ", options: { fontSize: 8, breakLine: true } },
  { text: "What shared trips added", options: { bold: true, fontSize: 15, color: HEX.ink, breakLine: true } },
  { text: `${money(G.cost_per_job)} → ${money(R.cost_per_job)} per repair`, options: { fontSize: 20, bold: true, color: HEX.hex, breakLine: true } },
  { text: `days living with faults ${Math.round(G.harm_days_total / 1000)}k → ${Math.round(R.harm_days_total / 1000)}k`, options: { fontSize: 14, color: HEX.ink2, breakLine: true } },
  { text: `Tighter budget: ${money(RT.cost_per_job)} per repair, cheaper than cheapest-first with a deadline (${money(F.cost_per_job)}).`, options: { fontSize: 13, color: HEX.ink2 } },
], { x: 9.2, y: 1.65, w: 3.4, h: 5.0, valign: "top", margin: 0, isTextBox: true, objectName: "price-t" });
s.addNotes("Every point is one setting run over the same synthetic year. Days living with faults add up every day a household lived with an unfixed fault; dangerous faults count more. The coordinator chooses a point; ReachNT sits at the knee.");

// 7 bands --------------------------------------------------------------------------
s = pres.addSlide({ masterName: "Content", sectionTitle: "Findings" });
s.addText("Where the wait lands, by how hard the place is to reach", { placeholder: "title" });
const order = ["Town", "Near town (road)", "Remote (road)", "Very remote (road)", "Remote, cut in the wet", "Island (fly-in)"];
s.addChart(pres.charts.BAR, [
  { name: "Cheapest jobs first", labels: order, values: order.map((b) => band(C0, b)) },
  { name: "Urgent first, one community per trip", labels: order, values: order.map((b) => band(G, b)) },
  { name: "ReachNT: urgent first, shared trips", labels: order, values: order.map((b) => band(R, b)) },
], { x: 0.6, y: 1.5, w: 12.1, h: 5.2, barDir: "bar", barGrouping: "clustered", chartColors: [HEX.cost, HEX.blue, HEX.hex],
  catAxisOrientation: "maxMin", catAxisLabelColor: HEX.ink2, valAxisLabelColor: HEX.ink2, catAxisLabelFontSize: 13, valAxisLabelFontSize: 11,
  catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", valGridLine: { color: HEX.line, size: 0.75 }, catGridLine: { style: "none" },
  showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 10, dataLabelColor: HEX.ink2, dataLabelFontFace: "+mn-lt",
  showLegend: true, legendPos: "b", legendFontSize: 12, legendFontFace: "+mn-lt", legendColor: HEX.ink2,
  showTitle: true, title: "Days until 9 in 10 urgent repairs are fixed", titleFontSize: 14, titleColor: HEX.ink, titleFontFace: "+mn-lt", objectName: "bands" });
s.addNotes("Shared trips help most where communities have a neighbour within two rings: cut-in-the-wet communities go from 7 to 3 days. Small very remote road communities stay hardest; that points to local trades.");

// 8 portal --------------------------------------------------------------------------
pres.addSection({ title: "Product" });
s = pres.addSlide({ masterName: "Shot", sectionTitle: "Product" });
s.addText("The coordinator sees the week on the real map", { placeholder: "title" });
s.addImage({ path: SHOT("coord"), x: 0.6, y: 1.2, w: 9.2, h: 9.2 * (900 / 1440), objectName: "shot-coord" });
text(s, [{ text: "3D hexagon columns", options: { bold: true, color: HEX.white, breakLine: true } },
         { text: "Height is open repairs; colour is booked, waiting or cut off.", options: { color: "C9CFD6", breakLine: true } },
         { text: " ", options: { breakLine: true, fontSize: 8 } },
         { text: "Shared trips", options: { bold: true, color: HEX.white, breakLine: true } },
         { text: "Blue lines join communities sharing a trip this week.", options: { color: "C9CFD6", breakLine: true } },
         { text: " ", options: { breakLine: true, fontSize: 8 } },
         { text: "Satellite imagery", options: { bold: true, color: HEX.white, breakLine: true } },
         { text: "Esri online; Digital Earth Australia tiles bundled for offline use.", options: { color: "C9CFD6" } }],
  { x: 10.1, y: 1.3, w: 2.7, h: 5.4, fontSize: 14, objectName: "shot-coord-t" });

// 9 phones --------------------------------------------------------------------------
s = pres.addSlide({ masterName: "Shot", sectionTitle: "Product" });
s.addText("On the phone: a run sheet for trades, a tracker for tenants", { placeholder: "title" });
s.addImage({ path: SHOT("field_phone"), x: 0.7, y: 1.2, w: 2.6, h: 2.6 * (844 / 390), objectName: "shot-field" });
s.addImage({ path: SHOT("tenant_phone"), x: 3.6, y: 1.2, w: 2.6, h: 2.6 * (844 / 390), objectName: "shot-tenant" });
text(s, [{ text: "Tradesperson", options: { bold: true, color: HEX.white, fontSize: 18, breakLine: true } },
         { text: "Only their own stops on the map, numbered in order. Each job shows what the tenant said, with Done or Couldn't do it. Save the run sheet as a PDF; updates made with no signal are sent later.", options: { color: "C9CFD6", breakLine: true } },
         { text: " ", options: { breakLine: true, fontSize: 10 } },
         { text: "Tenant", options: { bold: true, color: HEX.white, fontSize: 18, breakLine: true } },
         { text: "A text message and a timeline built from the weekly reason log:", options: { color: "C9CFD6", breakLine: true } },
         { text: `“${EX.why}”`, options: { color: HEX.white, italic: true } }],
  { x: 6.7, y: 1.3, w: 6.1, h: 5.5, fontSize: 15, objectName: "shot-phones-t" });
s.addNotes("Demo: switch to Tradesperson, then Tenant. Change the setting at the top and the tenant's answer changes, because the reason changes. Sign a setting in Trade-off and the answer names you.");

// 10 data -------------------------------------------------------------------------
pres.addSection({ title: "Trust" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Trust" });
s.addText("Names, phones and addresses stay locked away, on free tools", { placeholder: "title" });
[["Vault (pii)", "Name, phone, address, language. Encrypted with pgcrypto. Read only by intake staff through a function that logs every read.", HEX.violet],
 ["Work (ops)", "Jobs, trips, reasons, the signed ledger. A house is an ID + a 76 m H3 hexagon. Trades see their run; tenants see their own jobs.", HEX.hex],
 ["Public", "Waits by 36 km² hexagon and access band. Cells under 5 jobs hidden.", HEX.good]].forEach(([t, b, col], i) => {
  const x = 0.6 + i * 4.1;
  card(s, x, 1.6, 3.85, 2.9, HEX.soft, `zone-${i}`);
  text(s, t, { x: x + 0.25, y: 1.8, w: 3.4, h: 0.5, fontSize: 20, bold: true, fontFace: "Arial", color: col, objectName: `zone-t-${i}` });
  text(s, b, { x: x + 0.25, y: 2.35, w: 3.4, h: 2.0, fontSize: 15, color: HEX.ink2, objectName: `zone-b-${i}` });
});
text(s, [{ text: "Stack: ", options: { bold: true, color: HEX.ink } },
         { text: "PostgreSQL + PostGIS + h3-pg + pgcrypto, all free and open source. Run it on NT Government servers for $0 in licences, or pilot on Neon's Sydney region (supports all four; free tier 1 GB). A year of data is under 1 GB. Analytics in DuckDB with its H3 extension; the field app keeps data on the phone when there's no signal.", options: { color: HEX.ink2 } }],
  { x: 0.6, y: 4.8, w: 12.1, h: 1.6, fontSize: 16, objectName: "stack" });
s.addNotes("Every piece is open source, hosted in Australia, and sized for a territory with few people. Paid platforms would add a licence for every coordinator, contractor and housing officer.");

// 11 limits -------------------------------------------------------------------------
s = pres.addSlide({ masterName: "Content", sectionTitle: "Trust" });
s.addText("What it cannot do yet", { placeholder: "title" });
const Rd = N.reader;
const Qh = N.quality.reader.heldout;
[["AUC " + Qh.danger.roc_auc.toFixed(2), `for spotting a dangerous fault in wording the model never saw (${N.quality.reader.seen.danger.roc_auc.toFixed(2)} on familiar wording). A person checks ${pct(Rd.heldout.combined.to_person)} of those reports, so ${pct(Qh.danger.net_recall)} of dangerous ones are still caught.`, HEX.cost],
 ["Synthetic", "repair requests: no public NT work-order data exists. Geography, roads, clocks and costs are real; comparisons are the finding, not the absolute numbers.", HEX.violet],
 ["No co-design", "yet. Real reports come in Kriol, Aboriginal English and other languages. Tenants, Aboriginal Housing NT, land councils and the AIS shape the words first.", HEX.blue]].forEach(([n, l, col], i) => {
  const x = 0.6 + i * 4.1;
  card(s, x, 1.7, 3.85, 3.7, HEX.soft, `lim-${i}`);
  text(s, n, { x: x + 0.25, y: 1.95, w: 3.4, h: 0.9, fontSize: 32, bold: true, fontFace: "Arial", color: col, objectName: `lim-n-${i}` });
  text(s, l, { x: x + 0.25, y: 2.95, w: 3.4, h: 2.3, fontSize: 16, color: HEX.ink2, objectName: `lim-l-${i}` });
});
text(s, "We used satellite imagery of Country, not Aboriginal art. Any artwork would be commissioned and licensed through an Aboriginal art centre.", { x: 0.6, y: 5.7, w: 12.1, h: 0.6, fontSize: 14, color: HEX.muted, italic: true, objectName: "art" });

// 12 close ---------------------------------------------------------------------------
pres.addSection({ title: "Close" });
s = pres.addSlide({ masterName: "DarkList", sectionTitle: "Close" });
s.addText("Make the remote allowance a signed decision", { placeholder: "title" });
s.addText([
  { text: "DHLGCD: publish the triage rules; keep need and logistics separate; plan shared trips with H3; report urgent waits by access band; review the remote allowance each quarter with its cost.", options: { bullet: true, breakLine: true } },
  { text: "Contractors: log why each job waits; price charters, batching and shared trips into contracts; train local trades where waits are longest.", options: { bullet: true, breakLine: true } },
  { text: "Communities: co-design the tenant answer and fault words; hold the ledger to account.", options: { bullet: true } },
], { placeholder: "body", paraSpaceAfter: 14 });
s.addNotes("ReachNT does not pick. It shows the trade-off, makes someone own it, and lets every tenant ask why.");

(async () => {
  const out = path.join(__dirname, `DataChallenge_${TEAM}_Slides.pptx`);
  await pres.writeFile({ fileName: out });
  if (process.env.PPTX_SKILL) {
    const { applyTheme } = require(path.join(process.env.PPTX_SKILL, "scripts", "apply_theme.js"));
    await applyTheme(out, THEME);
  }
  console.log("wrote", out);
})();
