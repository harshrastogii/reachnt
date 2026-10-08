/* ReachNT portal. Data: window.RN (data/app.js, written by the Python engine). Map: MapLibre GL + h3-js.
   Imagery, best first: your own tile URL, MapTiler, Esri (with or without a key), then the bundled DEA tiles. */
(() => {
  "use strict";
  const RN = window.RN;
  const H = RN.taxonomy.hazards;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (x) => "$" + Math.round(x).toLocaleString("en-AU");
  const days = (d) => { d = Math.round(d); return d === 1 ? "1 day" : `${d} days`; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = () => innerWidth <= 860;
  const START = new Date(2026, 6, 1); // the simulated year starts 1 July
  const dateOf = (day) => new Date(START.getTime() + day * 864e5).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const an = (w, cap) => { const a = /^[aeiou]/i.test(w) ? "an " : "a "; return (cap ? a[0].toUpperCase() + a.slice(1) : a) + w; };

  const TRADE = { plumber: "Plumber", electrician: "Electrician", carpenter: "Carpenter", aircon: "Air-con technician", pest: "Pest controller", general: "Maintenance worker" };
  const TRADE_SHORT = { plumber: "Plumber", electrician: "Electrician", carpenter: "Carpenter", aircon: "Air-con", pest: "Pest", general: "Maintenance" };
  const REASON = { travel_cost: "No trip this week", crew_full: "Trades fully booked", cut: "Road cut", lower_priority: "More urgent jobs first", booked: "Booked this week",
                   no_access: "Visit missed", parts: "Waiting for parts", needs_other_trade: "Needs another trade", unsafe: "Unsafe to work",
                   new: "New: planned next week", offered: "Offered to any trade", assigned: "Given to a crew", next_trip: "Next trip",
                   rework: "Fix didn't hold" };
  const MISSED = { "No one home": "no_access", "Can't get in": "no_access", "Need parts": "parts", "Needs another trade": "needs_other_trade", "Unsafe to work": "unsafe" };
  const CAT = { immediate: "Dangerous", urgent: "Urgent", routine: "Routine" };
  const ICON = {
    plumber: '<path d="M10 3c3 4 5 6.6 5 9a5 5 0 0 1-10 0c0-2.4 2-5 5-9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    electrician: '<path d="M11 2 4.5 11h5L8.5 18 15.5 8.5h-5L11 2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    carpenter: '<path d="M4 16 11 9M9.5 4.5l6 6M8 6l4-3 5 5-3 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    aircon: '<circle cx="10" cy="10" r="1.6" fill="currentColor"/><path d="M10 8.4C9 5 10.5 3 13 3.5M11.6 10c3.4-1 5.4.5 4.9 3M10 11.6c1 3.4-.5 5.4-3 4.9M8.4 10C5 11 3 9.5 3.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    pest: '<ellipse cx="10" cy="11" rx="3.6" ry="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6V3M6.5 9 3.5 7.5M13.5 9l3-1.5M6.4 13l-3 1.5M13.6 13l3 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    general: '<path d="M13.5 3.5a3.5 3.5 0 0 0-3.3 4.7L3.8 14.6a1.4 1.4 0 0 0 2 2l6.4-6.4a3.5 3.5 0 0 0 4.4-4.6l-2 2-2-.4-.4-2 2-2a3.5 3.5 0 0 0-.7-.1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  };
  const icon = (t, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true">${ICON[t] || ICON.general}</svg>`;

  const comById = Object.fromEntries(RN.communities.map((c) => [c.cid, c]));
  const hub = RN.hubs.find((h) => h.name === RN.hub);
  const pairOf = (k) => RN.pairs.find((p) => p.a + "+" + p.b === k || p.b + "+" + p.a === k);
  const state = { role: "coord", policy: "guarantee_0.2_h3", week: "30", tab: "queue", filter: "remote", trade: "all", job: null,
                  ftrade: "plumber", place: null, tjob: null, metric: "harm_days_total", layer: "week" };
  const baseRows = () => RN.demo[state.policy].weeks[state.week] || [];
  const rows = () => withLocal(baseRows());   // the planned week, plus what people changed in this browser (see LOCAL CHANGES)
  const fieldData = () => (RN.demo[state.policy].field || {})[state.week] || {};
  const codeOf = (r) => {
    if (r.fresh) return "new";
    if (r.rework && !(r.assign && r.assign.at > r.rework.at)) return "rework";
    const v = r.visit;
    if (v && v.status !== "done" && !(r.assign && r.assign.at > v.at)) return MISSED[v.status] || "no_access";
    if (r.assign && (!r.done || r.visit)) return r.assign.mode === "open" && !r.assign.accepted_by ? "offered" : r.assign.mode === "next" ? "next_trip" : "assigned";
    return r.done ? "booked" : r.now || (r.site === "TOWN" ? "lower_priority" : r.reachable ? "travel_cost" : "cut");
  };
  const label = (k) => RN.labels[k] || k;

  // ---------------------------------------------------------------- per-viewer storage
  let storeV = 0;   // bumped on every write, so rows() knows when to rebuild what people changed
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); storeV++; localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const ledger = () => store("rn-ledger") || [];
  const signedFor = (k) => ledger().filter((x) => x.policy === k).slice(-1)[0] || null;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800); }
  function seg(el, attr, value) {
    $$("button", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value)));
    const on = $$("button", el).find((b) => b.dataset[attr] === value); const th = $(".thumb", el);
    if (on && th) { th.style.left = on.offsetLeft + "px"; th.style.width = on.offsetWidth + "px"; }
  }
  const guide = (key, html) => store("rn-guide-" + key) ? "" :
    `<div class="guide" data-guide="${key}"><div>${html}</div><button class="iconbtn" aria-label="Hide this tip" data-hide-guide="${key}">✕</button></div>`;
  function bindGuides(root) { $$("[data-hide-guide]", root).forEach((b) => b.addEventListener("click", () => { store("rn-guide-" + b.dataset.hideGuide, 1); b.closest(".guide").remove(); })); }

  // ================================================================ OFFLINE: worker, outbox, sync
  const canSW = "serviceWorker" in navigator && /^https?:$/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.host);
  if (canSW) navigator.serviceWorker.register("sw.js").catch(() => {});
  const outbox = () => store("rn-outbox") || [];
  // kind: "visit" (tradesperson: done or couldn't do it), "review" (tenant asks a person to review), "confirm" (tenant: is it fixed?)
  function recordUpdate(job, status, extra = {}, kind = "visit") {
    const box = outbox().filter((u) => !(u.id === job.id && (u.kind || "visit") === kind));
    box.push({ id: job.id, kind, status, trade: job.trade, place: job.place, at: new Date().toISOString(), sent: false, ...extra });
    store("rn-outbox", box); sync(); renderNet();
  }
  const updateOf = (id, kind = "visit") => outbox().find((u) => u.id === id && (u.kind || "visit") === kind);
  const NO_ACCESS = ["No one home", "Can't get in"];
  const ACCESS_STEPS = ["Left a card", "Phoned the tenant", "Spoke to family or a neighbour", "Took a photo of the door"];
  const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  async function sync() {
    const box = outbox(); const pending = box.filter((u) => !u.sent);
    if (!pending.length || !navigator.onLine) return renderNet();
    try {
      const r = await fetch("api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: pending }) });
      if (!r.ok) throw new Error(r.status);
      const ack = await r.json().catch(() => ({})); const bad = new Set(ack.rejected || []);
      const key = (u) => `${u.id}:${u.kind || "visit"}`;
      box.forEach((u) => { if (bad.has(key(u))) u.rejected = true; else if (!u.sent) u.sent = true; });   // rejected ones stay on the phone
      store("rn-outbox", box);
    } catch (e) { /* stays queued; tried again when the signal comes back */ }
    renderNet();
  }
  addEventListener("online", sync); addEventListener("offline", () => renderNet());
  function netHTML() {
    const pending = outbox().filter((u) => !u.sent).length;
    if (!navigator.onLine) return `<span class="net off"><i></i>No signal · ${pending ? `${pending} update${pending > 1 ? "s" : ""} saved on this phone` : "working offline"}</span>`;
    if (pending) return `<span class="net wait"><i></i>${pending} update${pending > 1 ? "s" : ""} waiting to send</span>`;
    return `<span class="net on"><i></i>Online · all updates sent</span>`;
  }
  function renderNet() { $$(".net-slot").forEach((el) => (el.innerHTML = netHTML())); }

  // ================================================================ LOCAL CHANGES: new reports, urgency checks, who goes
  // The planned week comes from the Python engine. What people do in the portal (log a new report, check or change a
  // repair's urgency, send a missed job to another crew or offer it to anyone) is kept in this browser and sent to
  // /api/sync like the run-sheet updates. rows() lays those changes over the plan. In production they are rows in
  // ops.job, ops.intake_answer, ops.urgency_check and ops.job_offer (docs/schema.sql), and next week's plan uses them.
  const PL = RN.planning || { due_soon_days: 7, deadline_bonus: 400, floor_bonus: 6000, ageing_points_per_day: 3 };
  const BASE = { immediate: 1000, urgent: 500, routine: 100 };
  const today = () => +state.week * 7 + 3;     // the day the demo week is seen from (as in the tenant answers)
  const dayEnd = () => +state.week * 7 + 7;    // the day the planner values jobs at
  const clockOf = (cat) => { const C = RN.clocks.equal; return (cat === "routine" ? C.routine_business_days.town : C.urgent_business_days.town) * 7 / 5; };
  // urgency.score, line for line: need only. Nothing about place, cost, channel, language or how much was said.
  const REWORK = RN.triage.rework_points || 50;
  // Tiers of who lives there: 1 life-preservation (power, cooling or medical supplies; a baby under 12 months; a frail
  // elder), 2 high systemic risk (young children, pregnancy, illness, limited mobility), 3 everyone else.
  const tierOf = (mods) => (mods.tier1 ? 1 : mods.vulnerable ? 2 : 3);
  const tierPts = (t) => (t === 1 ? RN.triage.tier1_points ?? 40 : t === 2 ? RN.triage.vulnerable_points : 0);
  const LIFELINE = new Set(RN.triage.lifeline_faults || []);
  // urgency.category: losing power, water or cooling is Immediate for a Tier 1 household
  const catOf = (hz, tier) => (tier === 1 && LIFELINE.has(hz) ? "immediate" : H[hz].category);
  const tierChip = (r) => (r.tier && r.tier < 3 ? `<span class="chip person" title="${TIER_CHIP[r.tier]}">Tier ${r.tier}</span>` : "");
  const TIER_CHIP = { 1: "Tier 1: needs power, cooling or medicine, or a baby or frail elder", 2: "Tier 2: young children, pregnancy, illness or mobility" };
  function needScore(hz, exposure, repeat, waited, rework = 0, cat = H[hz].category) {
    const h = H[hz], clock = clockOf(cat);
    const ageing = Math.round(PL.ageing_points_per_day * Math.max(0, waited - clock / 2));
    const p = { category: cat, base: BASE[cat], harm: h.harm, hlp: (10 - h.hlp) * 4, exposure, repeat, ageing, rework };
    p.total = p.base + p.harm + p.hlp + p.exposure + p.repeat + p.ageing + p.rework; return p;
  }
  // simulate.job_value: the planner's value for a job. Need points, plus a boost as the job's clock runs out.
  function planValue(cat, needTotal, day) {
    const pol = state.policy.split("_")[0];
    const due = day + clockOf(cat) - dayEnd() <= PL.due_soon_days;
    if (pol === "cheapest" || pol === "floor") return 1000 + (pol === "floor" && cat !== "routine" && due ? PL.floor_bonus : 0);
    return needTotal + (due ? PL.deadline_bonus : 0) + (pol === "guarantee" && due && cat !== "routine" ? PL.floor_bonus : 0);
  }
  const planNeed = (r) => needScore(r.hazard, r.score.exposure, r.score.repeat, dayEnd() - r.day, r.score.rework || 0, r.category).total;
  const timeLeft = (r) => clockOf(r.category) - r.wait;   // days left on the same-everywhere clock
  function dueChip(r) {
    if (r.done) return "";
    const t = timeLeft(r);
    if (t < -0.5) return `<span class="chip due late">Overdue ${days(-t)}</span>`;
    if (t < 1) return `<span class="chip due late">Due today</span>`;
    return t <= 3 ? `<span class="chip due">${days(t)} left</span>` : "";
  }
  const TRADE_WORD = { plumber: "plumber", electrician: "electrician", carpenter: "carpenter", aircon: "air-con technician", pest: "pest controller", general: "maintenance worker" };
  function howText(x) {   // explain.py "How urgent it is", for a repair whose fault a person changed or that was just logged
    const h = H[x.hazard], tw = TRADE_WORD[x.trade] || "tradesperson", bd = x.category === "routine" ? 10 : 2;
    return `This is ${an(CAT_WORD[x.category])} repair. ` + (x.category === "immediate" ? `The local Housing Maintenance Officer makes it safe the same day. Then ${an(tw)} does the full fix. ` : "")
      + `Our rule is the same in town and out bush: ${an(tw)} within ${bd} business days.` + (h.rta_s63 ? " The law calls this kind of fault an emergency repair." : "");
  }
  const CAT_WORD = { immediate: "immediate", urgent: "urgent", routine: "routine" };
  const scoreText = (u) => `Score ${u.total}: ${u.base} for the ${u.category} category, ${u.harm} for harm, ${u.hlp} for the health practice it affects, ${u.exposure} for who lives there, ${u.repeat} for a repeat report, ${u.ageing} for waiting${u.rework ? `, ${u.rework} because the last fix didn't hold` : ""}. Distance and cost are never part of this score.`;
  // a fix the tenant says didn't work: reopened with extra points, keeping the day it was first reported
  function reopen(x, c) {
    x.rework = c; x.done = false; x.trip = false; x.now = "rework";
    x.score = needScore(x.hazard, x.score.exposure, x.score.repeat, x.wait, REWORK, x.category);
    x.value = planValue(x.category, planNeed(x), x.day);
    x.score_text = scoreText(x.score);
  }
  // a declared flood, cyclone or fire: its communities are tagged until the coordinator ends it
  const eventNow = () => { const e = store("rn-event"); return e && e.week === state.week && !e.ended ? e : null; };

  // ---------------------------------------------------------------- checking urgency: any time, by any person, never by the computer alone
  const CHECK_SOURCES = { called_in: "The tenant rang the repairs line", phoned: "We phoned the tenant", cho: "The Community Housing Officer saw it",
                          rhmo: "The maintenance officer saw it", trade: "A tradesperson saw it on site", photo: "The tenant sent a photo", review: "The tenant asked for a review" };
  const SAW_OR_SPOKE = ["called_in", "phoned", "cho", "rhmo", "trade"];   // only these can lower a dangerous repair
  const checksAll = () => store("rn-urgency") || {};
  const assignsAll = () => store("rn-assign") || {};
  function rehazard(x, hz, day) {
    const h = H[hz]; const wasTrade = x.trade;
    x.hazard = hz; x.category = catOf(hz, x.tier || 3);
    if (!(x.assign && x.assign.trade)) x.trade = h.trade;
    x.score = needScore(hz, x.score.exposure, x.score.repeat, x.wait, x.score.rework || 0, x.category);
    x.value = planValue(x.category, planNeed(x), x.day);
    if (x.category === "immediate" && x.made_safe == null) x.made_safe = day;
    if (x.trade !== wasTrade && x.done) { x.done = false; x.trip = false; x.now = "needs_other_trade"; }
    x.sections = x.sections.map(([t, b]) => (t === "How urgent it is" ? [t, howText(x)] : [t, b]));
    x.short = x.short.replace(/^Your .*? repair is \w+\. /, `Your ${h.label.toLowerCase()} repair is ${x.category}. `);
    x.score_text = scoreText(x.score);
  }
  function freshRow(j, base) {   // a report logged in the portal this week: not planned yet, its clock running from first contact
    const c = comById[j.site]; const same = base.find((r) => r.site === j.site);
    const h = H[j.hazard]; const wait = Math.max(0, today() - j.day); const tier = tierOf(j.mods); const cat = catOf(j.hazard, tier);
    const x = { id: j.id, fresh: true, intake: j, site: j.site, place: j.place, band: c ? c.band : "Town", trade: h.trade, hazard: j.hazard,
      category: cat, tier, text: j.text, house: j.house, cell: j.cell, day: j.day, done: false, trip: false, run: "",
      mode: same ? same.mode : "road", reachable: same ? same.reachable : true, trip_cost: c ? c.trip_cost : 0, wait,
      needs_human: j.needs_human, vulnerable: tier < 3, reasons: [], now: "new", made_safe: cat === "immediate" ? today() : null,
      merged_into: "", came_back: null, history: j.history || [], rank: 0, of: 0 };
    x.score = needScore(j.hazard, j.exposure, j.repeat, wait, 0, cat);
    x.value = planValue(x.category, planNeed(x), x.day);
    const keep = (t) => ((base[0] && base[0].sections.find(([k]) => k === t)) || [t, ""]);
    x.sections = [["What we heard", `You told us: "${j.text}". We read this as: ${h.label.toLowerCase()}.${j.needs_human ? " A person checks your report before it goes in the line." : ""}`],
      ["How urgent it is", howText(x)],
      ["Where it is up to", `New report. Your clock started on ${dateOf(j.day)}, the day you first told us. It goes into next week's plan.`
        + (x.category === "immediate" ? " A maintenance officer makes it safe today. Fixing it properly is a second step, with its own date." : "")],
      ["Why it is not fixed yet", "It came in after this week's trips were planned. Nothing has held it up so far."], keep("What would change it"), keep("Your rights")];
    x.short = `Your ${h.label.toLowerCase()} repair is ${x.category}. New report. Ask why: 1800 104 076`;
    x.score_text = scoreText(x.score);
    return x;
  }
  let memo = { key: null };
  function withLocal(base) {
    const key = `${state.policy}|${state.week}|${storeV}`;
    if (memo.key === key && memo.base === base) return memo.out;
    const U = checksAll(), A = assignsAll();
    const visits = Object.fromEntries(outbox().filter((u) => (u.kind || "visit") === "visit").map((u) => [u.id, u]));
    const confirms = Object.fromEntries(outbox().filter((u) => u.kind === "confirm" && u.status === "still broken").map((u) => [u.id, u]));
    const ev = eventNow(); const inEvent = new Set(ev ? ev.communities : []);
    const fresh = (store("rn-intake") || []).filter((j) => j.week === state.week && !j.joined_to).map((j) => freshRow(j, base));
    let changed = fresh.length > 0;
    const out = base.map((r) => {
      const ch = U[r.id], as = A[r.id], v = visits[r.id], cf = confirms[r.id], evt = inEvent.has(r.site);
      if (!ch && !as && !v && !cf && !evt) return r;
      const x = { ...r, checks: ch || [], assign: as || null, visit: v || null, event: evt ? ev : null };
      if (cf && (x.done || x.visit)) { reopen(x, cf); changed = true; }
      const last = (ch || []).slice(-1)[0];
      if (last && last.to !== x.hazard) { rehazard(x, last.to, last.day); changed = true; }
      if (as && as.trade && as.trade !== x.trade) { x.trade = as.trade; changed = true; }
      return x;
    }).concat(fresh.map((x) => { const ch = U[x.id], as = A[x.id], v = visits[x.id];
      Object.assign(x, { checks: ch || [], assign: as || null, visit: v || null, event: inEvent.has(x.site) ? ev : null });
      const last = (ch || []).slice(-1)[0]; if (last && last.to !== x.hazard) rehazard(x, last.to, last.day);
      if (as && as.trade) x.trade = as.trade; return x; }));
    if (changed) {   // place in line, per trade, as the planner ranks them (value, then the order it had)
      const byTrade = {};
      out.forEach((r, i) => (byTrade[r.trade] = byTrade[r.trade] || []).push([r, i]));
      Object.values(byTrade).forEach((g) => g.sort((a, b) => b[0].value - a[0].value || a[1] - b[1]).forEach(([r, i], k) => {
        if (r.rank !== k + 1 || r.of !== g.length) out[i] = { ...r, rank: k + 1, of: g.length };
      }));
    }
    memo = { key, base, out };
    return out;
  }
  // The portal's copy of the planner's arithmetic must match the engine's. ReachNT.selfCheck() counts disagreements (should be 0).
  const selfCheck = () => baseRows().filter((r) => planValue(r.category, planNeed(r), r.day) !== r.value).length;

  // ================================================================ PDF (job sheets to keep without signal)
  async function getPDF() {
    if (!window.jspdf) {
      await new Promise((res) => { const s = document.createElement("script"); s.src = "vendor/jspdf.umd.min.js?v=4.2.1"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    }
    if (!window.jspdf) { toast("Couldn't load the PDF maker. Try again with signal."); return null; }
    return new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  }
  function pdfWriter(doc) {
    const W = 210, M = 16; let y = M;
    const need = (h) => { if (y + h > 285) { doc.addPage(); y = M; } };
    const t = (txt, size = 10, style = "normal", color = [20, 24, 29]) => {
      doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(txt), W - 2 * M); need(lines.length * size * 0.42 + 1.5);
      doc.text(lines, M, y + size * 0.35); y += lines.length * size * 0.42 + 1.5;
    };
    const gap = (h = 3) => (y += h);
    const rule = () => { need(4); doc.setDrawColor(210, 214, 219); doc.line(M, y, W - M, y); y += 4; };
    const box = (label) => { need(8); doc.setDrawColor(150); doc.rect(M, y, 4, 4); doc.setFontSize(10); doc.setTextColor(20, 24, 29); doc.text(label, M + 6, y + 3.4); y += 7; };
    const image = (data, h) => { need(h + 2); try { doc.addImage(data, "JPEG", M, y, W - 2 * M, h); } catch (e) { /* map snapshot unavailable */ } y += h + 3; };
    return { t, gap, rule, box, image, M, W };
  }
  // Map picture for PDFs, with the hexagon badges painted in (they are HTML on screen, not part of the map canvas).
  function mapSnapshot() {
    try {
      const src = map.getCanvas(); const dpr = src.width / src.clientWidth;
      const c = document.createElement("canvas"); c.width = src.width; c.height = src.height; const g = c.getContext("2d");
      g.drawImage(src, 0, 0);
      markers.forEach((mk) => {
        const el = mk.getElement(); if (!el.classList.contains("hexb")) return;
        const p = map.project(mk.getLngLat()); const x = p.x * dpr, y = p.y * dpr; const r = 17 * dpr;
        const col = getComputedStyle(el).getPropertyValue("--c").trim() || "#0a84ff";
        g.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; g[i ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath();
        g.fillStyle = col; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = "#fff"; g.stroke();
        g.fillStyle = "#fff"; g.font = `700 ${14 * dpr}px -apple-system, Helvetica, Arial`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText($(".hx b", el).textContent, x, y + 0.5 * dpr);
        const nm = $(".nm", el); if (nm && (el.classList.contains("s-stop") || document.body.classList.contains("zoomed"))) {
          g.font = `600 ${11 * dpr}px -apple-system, Helvetica, Arial`; const t = nm.firstChild ? nm.firstChild.textContent : nm.textContent;
          const w = g.measureText(t).width + 12 * dpr; g.fillStyle = "rgba(16,20,26,.75)"; g.fillRect(x - w / 2, y + r + 3 * dpr, w, 16 * dpr);
          g.fillStyle = "#fff"; g.fillText(t, x, y + r + 11 * dpr);
        }
      });
      return c.toDataURL("image/jpeg", 0.85);
    } catch (e) { return null; }
  }
  const hexCentre = (cell) => { const [la, lo] = h3.cellToLatLng(cell); return `${la.toFixed(5)}, ${lo.toFixed(5)}`; };
  function jobBlock(P, r, n) {
    P.t(`${n ? n + ". " : ""}${H[r.hazard].label}  ·  ${CAT[r.category]}  ·  priority ${r.score.total}`, 11, "bold");
    P.t(`${r.place} · house hexagon ${r.cell} (centre ${hexCentre(r.cell)}) · about ${H[r.hazard].hours} h on site`, 9, "normal", [74, 82, 92]);
    P.t(`Tenant said: “${r.text}”`, 10);
    if (r.category === "immediate") P.t("Dangerous: check the Housing Maintenance Officer made it safe before starting.", 9.5, "bold", [180, 38, 30]);
    if (r.tier === 1) P.t("Tier 1: someone here needs power, cooling or medical supplies, or there is a baby or a frail elder.", 9.5, "bold", [74, 82, 92]);
    else if (r.vulnerable) P.t("Tier 2: young children, someone pregnant, sick or finding it hard to get around.", 9.5, "normal", [74, 82, 92]);
    P.box("Done"); P.box("Not done. Reason: ______________________________________");
    P.gap(1); P.rule();
  }
  async function pdfRun() {
    const doc = await getPDF(); if (!doc) return; const P = pdfWriter(doc);
    const t = state.ftrade; const all = rows(); const mine = all.filter((r) => r.trade === t && r.done);
    P.t("ReachNT run sheet", 18, "bold"); P.t(`${TRADE[t]} · ${RN.hub} hub · week of ${dateOf(+state.week * 7)}`, 11, "normal", [74, 82, 92]);
    P.t("Synthetic demonstration data. Take this sheet with you; mark each job and enter it in the app when you have signal.", 9, "italic", [110, 86, 207]); P.gap();
    const snap = mapSnapshot(); if (snap) P.image(snap, 92);
    const groups = {}; mine.forEach((r) => (groups[r.run || r.site] = groups[r.run || r.site] || []).push(r));
    let n = 0;
    Object.entries(groups).forEach(([k, g]) => {
      const names = k === "TOWN" ? `${RN.hub} town` : k.split("+").map((c) => comById[c].name).join(" then ");
      P.t(names, 14, "bold"); const p = pairOf(k);
      if (p) P.t(`Shared trip: about ${money(p.together)} in travel instead of ${money(p.separate)} for two separate trips.`, 9.5, "normal", [14, 143, 184]);
      P.gap(1);
      g.sort((a, b) => b.score.total - a.score.total).forEach((r) => jobBlock(P, r, ++n));
    });
    doc.save(`ReachNT_run_${TRADE_SHORT[t]}_${dateOf(+state.week * 7).replace(" ", "")}.pdf`);
    toast("Run sheet saved as a PDF");
  }
  async function pdfJob(r, forTenant) {
    const doc = await getPDF(); if (!doc) return; const P = pdfWriter(doc);
    P.t(forTenant ? "Your repair" : "ReachNT job sheet", 18, "bold");
    P.t(`${r.place} · ${r.id} · as at ${dateOf(+state.week * 7)}`, 10, "normal", [74, 82, 92]);
    P.t("Synthetic demonstration data.", 9, "italic", [110, 86, 207]); P.gap();
    if (forTenant) P.t(r.short, 11, "bold", [31, 157, 76]);
    const snap = mapSnapshot(); if (snap) P.image(snap, 80);
    if (!forTenant) jobBlock(P, r);
    r.sections.forEach(([h, b]) => { P.t(h, 11, "bold"); P.t(b, 10); P.gap(1); });
    P.t(r.score_text, 9, "normal", [74, 82, 92]);
    P.gap(); P.t("Repairs hotline 1800 104 076 · Free interpreters: Aboriginal Interpreter Service, or TIS National for other languages.", 9.5, "bold");
    doc.save(`ReachNT_${forTenant ? "my_repair" : "job"}_${r.id}.pdf`); toast("Saved as a PDF");
  }

  // ================================================================ MAP
  let map, imagery = { name: "", crisp: false };
  const loaded = {};
  const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const SEA = "#0e1e2c";
  async function tileBytes(z, x, y) {
    if (z <= 8) await loadScript("tiles/dea_z5_8.js").catch(() => {});
    if (z === 9) await loadScript("tiles/dea_z9.js").catch(() => {});
    if (z === 10) await loadScript("tiles/dea_z10.js").catch(() => {});
    const T = window.DEA_TILES || {};
    if (T[z] && T[z][`${x}/${y}`]) return b64(T[z][`${x}/${y}`]);
    if (z <= 5) return null;
    const parent = await tileBytes(z - 1, x >> 1, y >> 1); if (!parent) return null;
    const bmp = await createImageBitmap(new Blob([parent], { type: "image/jpeg" }));
    const c = new OffscreenCanvas(256, 256); const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(bmp, (x & 1) * 128, (y & 1) * 128, 128, 128, 0, 0, 256, 256);
    return new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality: 0.85 })).arrayBuffer());
  }
  async function seaTile() { const c = new OffscreenCanvas(256, 256); const g = c.getContext("2d"); g.fillStyle = SEA; g.fillRect(0, 0, 256, 256); return (await c.convertToBlob({ type: "image/jpeg" })).arrayBuffer(); }
  function probe(url, ms = 2500) {
    return new Promise((res) => { const img = new Image(); const t = setTimeout(() => res(false), ms); img.onload = () => { clearTimeout(t); res(true); }; img.onerror = () => { clearTimeout(t); res(false); }; img.src = url; });
  }
  async function config() {
    try { const ctl = new AbortController(); setTimeout(() => ctl.abort(), 1500); const r = await fetch("api/config", { signal: ctl.signal }); if (r.ok) return await r.json(); } catch (e) { /* no server config */ }
    return {};
  }
  async function pickImagery() {
    if (/offline/.test(location.search)) return null;
    const cfg = await config();
    if (cfg.satTileUrl) return { name: "Your satellite tiles", crisp: true, src: { tiles: [cfg.satTileUrl], maxzoom: 16, attribution: "Imagery: own tile set" } };
    if (cfg.maptilerKey) return { name: "MapTiler satellite", crisp: true, src: { tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${cfg.maptilerKey}`], maxzoom: 20, attribution: "© MapTiler © OpenStreetMap contributors" } };
    // Esri's photos of NT communities stop at level 17 (checked for all 70). Asking for 18+ returns a grey "Map data not
    // yet available" tile, so we stop at 17 and let the map enlarge it. blankTile=false turns any other gap into a 404,
    // and MapLibre then keeps showing the coarser tile instead of the grey one.
    // with a key, use Esri's keyed basemap service (usage counted on the account, as Esri's terms ask); without one, the public service
    const esri = (cfg.esriKey ? "https://ibasemaps-api.arcgis.com/arcgis" : "https://server.arcgisonline.com/ArcGIS")
      + "/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false" + (cfg.esriKey ? `&token=${cfg.esriKey}` : "");
    if (await probe(esri.replace("{z}", 6).replace("{y}", 34).replace("{x}", 55))) return { name: "Esri World Imagery", crisp: true, src: { tiles: [esri], maxzoom: 17, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" } };
    return null;
  }

  const hexGeom = (cell) => ({ type: "Polygon", coordinates: [h3.cellToBoundary(cell, true)] });
  const fc = (features) => ({ type: "FeatureCollection", features });
  const F = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
  const ll = (c) => [c.lon, c.lat];
  const HUBLL = () => [hub.lon, hub.lat];
  // a gentle arc between two points, so routes read as journeys rather than ruler lines
  function arc(a, b, bend = 0.18) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    const cx = mx - dy * bend, cy = my + dx * bend; const pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1]]); }
    return pts;
  }

  const DEA = { name: "Digital Earth Australia (stored offline)", crisp: false,
    src: { tiles: ["dea://{z}/{x}/{y}"], minzoom: 4, maxzoom: 10, attribution: "Imagery: Digital Earth Australia, Landsat 8/9 geomedian 2024, Geoscience Australia (CC BY 4.0)" } };
  const SAT_PAINT = { "raster-saturation": -0.08, "raster-contrast": 0.06, "raster-fade-duration": 250 };
  function useImagery(pick) {
    imagery = pick;
    const before = map.getLayer("mask") ? "mask" : undefined;
    if (map.getLayer("sat")) map.removeLayer("sat");
    if (map.getSource("sat")) map.removeSource("sat");
    map.addSource("sat", { type: "raster", tileSize: 256, ...pick.src });
    map.addLayer({ id: "sat", type: "raster", source: "sat", paint: SAT_PAINT }, before);
    map.setMaxZoom(pick.crisp ? Math.min(pick.src.maxzoom + 1, 19) : 11.5);   // one level of enlargement past the real photos, no further
    if (map.getSource("routes")) legend();
  }
  async function initMap() {
    maplibregl.addProtocol("dea", async (params) => {
      const m = params.url.match(/dea:\/\/(\d+)\/(\d+)\/(\d+)/);
      const bytes = await tileBytes(+m[1], +m[2], +m[3]).catch(() => null);
      return { data: bytes ? bytes.buffer : await seaTile() };
    });
    imagery = DEA;
    map = new maplibregl.Map({
      container: "map", attributionControl: { compact: true, customAttribution: "Community and house positions © OpenStreetMap contributors" }, preserveDrawingBuffer: true,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": SEA } }] },
      center: [133.4, -19.4], zoom: phone() ? 3.9 : 4.7, maxZoom: 11.5, maxBounds: [[118, -32], [148, -6]],
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    const sharper = pickImagery();              // keys and Esri are checked while the map starts
    let ready = false;
    const onReady = async () => {
      if (ready) return; ready = true;
      const online = await Promise.race([sharper, new Promise((r) => setTimeout(() => r("later"), 400))]);
      useImagery(online && online !== "later" ? online : DEA);
      padMap(); addLayers(); refreshMap();
      if (online === "later") sharper.then((p) => p && useImagery(p));
      if (state.role === "field") return fieldMap();
      if (state.role === "tenant") return tenantMap();
      home();
    };
    map.once("style.load", onReady); map.once("load", onReady);
    const poll = setInterval(() => { if (ready) return clearInterval(poll); if (map.isStyleLoaded()) { clearInterval(poll); onReady(); } }, 80);
    map.on("zoom", () => { const z = map.getZoom(); document.body.classList.toggle("zoomed", z > 8.6); document.body.classList.toggle("z8", z > 8); });
    map.on("zoomend", () => declutter());
  }
  const home = () => {
    if (!map) return;
    if (!phone()) return map.flyTo({ center: [133.0, -15.3], zoom: 6.3, pitch: 35, bearing: -8, duration: reduce ? 0 : 2400, essential: true });
    // on a phone the visible gap between the top bar and the sheet is small: fit the hub's communities into it
    const pts = RN.communities.filter((c) => c.hub === RN.hub).map(ll).concat([HUBLL()]);
    padMap();
    map.fitBounds(pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])), { padding: 24, pitch: 0, bearing: 0, duration: reduce ? 0 : 1600, essential: true });
  };
  function padMap() {
    if (!map) return;
    if (phone()) map.setPadding({ top: topH() + 50, bottom: Math.min(sheetHeight(), innerHeight - topH() - 120), left: 0, right: 0 });
    else map.setPadding({ top: 90, bottom: 60, left: state.role === "coord" ? 450 : 20, right: state.role === "coord" ? 20 : 430 });
  }
  function addLayers() {
    const empty = fc([]);
    const holes = RN.coast.map((poly) => (Array.isArray(poly[0][0]) ? poly[0] : poly)).filter((r) => r.length > 20);
    map.addSource("mask", { type: "geojson", data: F({ type: "Polygon", coordinates: [[[100, -45], [160, -45], [160, 5], [100, 5], [100, -45]], ...holes.map((r) => r.slice().reverse())] }) });
    map.addLayer({ id: "mask", type: "fill", source: "mask", maxzoom: 8, paint: { "fill-color": SEA, "fill-opacity": 0.5 } });
    ["reach", "routes", "foot", "houses"].forEach((id) => map.addSource(id, { type: "geojson", data: empty }));
    map.addLayer({ id: "reach", type: "fill", source: "reach", layout: { visibility: "none" },
      paint: { "fill-color": ["step", ["get", "h"], "#64d2ff", 3, "#7e9cff", 6, "#b28cff", 9, "#ff7aa8"], "fill-opacity": 0.22 } });
    map.addLayer({ id: "reach-line", type: "line", source: "reach", layout: { visibility: "none" }, paint: { "line-color": "rgba(255,255,255,0.12)", "line-width": 0.5 } });
    map.addLayer({ id: "route-glow", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "kind"], "shared"], 9, 6], "line-opacity": 0.18, "line-blur": 3 } });
    map.addLayer({ id: "route", type: "line", source: "routes", filter: ["!=", ["get", "kind"], "air"], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "kind"], "shared"], 3.2, 2.2], "line-opacity": 0.95 } });
    map.addLayer({ id: "route-air", type: "line", source: "routes", filter: ["==", ["get", "kind"], "air"],
      paint: { "line-color": ["get", "color"], "line-width": 2.2, "line-dasharray": [1.2, 1.6], "line-opacity": 0.95 } });
    map.addLayer({ id: "foot", type: "line", source: "foot", minzoom: 8.5, paint: { "line-color": "rgba(255,255,255,0.75)", "line-width": 1.4, "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "houses", type: "fill", source: "houses", minzoom: 11, paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 } });
    map.addLayer({ id: "houses-line", type: "line", source: "houses", minzoom: 11, paint: { "line-color": "#ffffff", "line-width": 2 } });
  }

  // ---- markers: hexagon badges (clean, readable at any zoom)
  let markers = [];
  function clearMarkers() { markers.forEach((m) => m.remove()); markers = []; groupMarkers.forEach((m) => m.remove()); groupMarkers = []; }
  function badge(lngLat, { n, cls, name, sub, onClick, size }) {
    const el = document.createElement("button");
    el.className = `hexb ${cls || ""} ${size || ""}`; el.type = "button";
    el.setAttribute("aria-label", `${name || ""} ${sub || ""}`.trim());
    el.innerHTML = `<span class="hx"><b>${n ?? ""}</b></span>${name ? `<span class="nm">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>` : ""}`;
    if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map));
    el._ll = lngLat; el._n = Number(n) || 0; el._name = name || "";
    el.setAttribute("aria-label", `${name || ""}${n != null && n !== "" ? `, ${n}` : ""} ${sub || ""}`.trim());   // MapLibre replaces it with "Map marker"
  }
  // Badges closer than a fingertip merge into one "N places" badge; tapping it zooms in until they separate.
  // Keeps every target at least 24 px (WCAG 2.2, 2.5.8) and stops taps landing on the wrong community.
  let groupMarkers = [];
  function declutter() {
    groupMarkers.forEach((m) => m.remove()); groupMarkers = [];
    if (!map || state.role !== "coord") return;
    const items = markers.map((m) => m.getElement()).filter((el) => el.classList && el.classList.contains("hexb") && el._ll);
    items.forEach((el) => (el.style.visibility = ""));
    const placed = [];
    items.sort((a, b) => b._n - a._n).forEach((el) => {
      const p = map.project(el._ll);
      const g = placed.find((q) => Math.hypot(q.p.x - p.x, q.p.y - p.y) < 34);
      if (g) g.members.push(el); else placed.push({ p, members: [el] });
    });
    placed.filter((g) => g.members.length > 1).forEach((g) => {
      g.members.forEach((el) => (el.style.visibility = "hidden"));
      const n = g.members.reduce((t, el) => t + el._n, 0);
      const names = g.members.map((el) => el._name).filter(Boolean);
      const el = document.createElement("button"); el.type = "button"; el.className = "hexb s-group";
      el.innerHTML = `<span class="hx"><b>${n}</b></span><span class="nm">${g.members.length} places<small>tap to zoom in</small></span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = g.members.reduce((bb, m) => bb.extend(m._ll), new maplibregl.LngLatBounds(g.members[0]._ll, g.members[0]._ll));
        map.fitBounds(b, { padding: 140, maxZoom: Math.max(map.getZoom() + 2, 8), duration: reduce ? 0 : 900 });
      });
      const ll = map.unproject(g.p);
      const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(ll).addTo(map);
      el.setAttribute("aria-label", `${g.members.length} places: ${names.join(", ")}. ${n} repairs. Zoom in`);
      groupMarkers.push(mk);
    });
  }
  function hubBadge() {
    const el = document.createElement("div"); el.className = "hubb"; el.title = "Trades start their trips here";
    el.innerHTML = `<i></i><span>${esc(RN.hub)}</span>`;
    markers.push(new maplibregl.Marker({ element: el, anchor: "right", offset: [6, 0] }).setLngLat(HUBLL()).addTo(map));
  }
  function savingTag(a, b, p, always) {
    if (p.saving < 200) return;
    const el = document.createElement("div"); el.className = "savetag" + (always ? " always" : "");
    el.innerHTML = `<b>Shared trip</b> saves about ${money(p.saving)}`;
    markers.push(new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -14] }).setLngLat([(a.lon + b.lon) / 2, (a.lat + b.lat) / 2]).addTo(map));
  }

  const COL = { booked: "#30d158", waiting: "#ff9f0a", cut: "#ffd60a", none: "#8e8e93", shared: "#64d2ff", air: "#ffd60a" };
  function tripRoutes(list) {
    // list: rows that have a trip. Returns route features and shared pairs.
    const feats = [], shared = [], seen = new Set();
    list.filter((r) => r.trip && r.site !== "TOWN").forEach((r) => {
      const key = r.run || r.site; if (seen.has(key)) return; seen.add(key);
      const air = r.mode.startsWith("air");
      if (r.run) {
        const [a, b] = r.run.split("+").map((k) => comById[k]);
        const path = [...arc(HUBLL(), ll(a)), ...arc(ll(a), ll(b), 0.1).slice(1), ...arc(ll(b), HUBLL()).slice(1)];
        feats.push(F({ type: "LineString", coordinates: path }, { kind: air ? "air" : "shared", color: COL.shared, sites: [a.cid, b.cid] }));
        shared.push([a, b, pairOf(r.run)]);
      } else {
        const c = comById[r.site];
        feats.push(F({ type: "LineString", coordinates: arc(HUBLL(), ll(c)) }, { kind: air ? "air" : "road", color: air ? COL.air : COL.booked, sites: [c.cid] }));
      }
    });
    return { feats, shared };
  }

  function refreshMap() {
    if (!map || !map.getSource("routes")) return;
    clearMarkers();
    map.setLayoutProperty("reach", "visibility", state.layer === "reach" && state.role === "coord" ? "visible" : "none");
    map.setLayoutProperty("reach-line", "visibility", state.layer === "reach" && state.role === "coord" ? "visible" : "none");
    if (state.role === "field") return drawField();
    if (state.role === "tenant" || state.role === "officer") { map.getSource("routes").setData(fc([])); return; }
    const all = rows().filter((r) => state.trade === "all" || r.trade === state.trade);
    const hubComs = RN.communities.filter((c) => c.hub === RN.hub);
    if (state.layer === "year") {
      map.getSource("routes").setData(fc([]));
      const Y = RN.year[state.policy] || {};
      RN.communities.filter((c) => Y[c.cid]).forEach((c) => {
        const p = Y[c.cid].p90; const cls = p <= 5 ? "s-booked" : p <= 15 ? "s-cut" : "s-waiting";
        badge(ll(c), { n: Math.round(p), cls: cls + " small", name: map.getZoom() > 6.2 ? c.name : "", sub: "days", onClick: () => toast(`${c.name}: 9 in 10 urgent repairs fixed within ${Math.round(p)} days over the year`) });
      });
    } else {
      let { feats, shared } = tripRoutes(all);
      const focus = comById[state.filter] ? state.filter : null;
      if (focus) {   // one community picked: show only the trip that reaches it, so other routes don't seem to pass through it
        feats = feats.filter((f) => f.properties.sites.includes(focus));
        shared = shared.filter(([a, b]) => a.cid === focus || b.cid === focus);
      }
      map.getSource("routes").setData(fc(state.layer === "week" ? feats : []));
      hubComs.forEach((c) => {
        const r = all.filter((x) => x.site === c.cid); if (!r.length) return;
        const st = r.some((x) => x.trip) ? "booked" : r.some((x) => !x.reachable) ? "cut" : "waiting";
        badge(ll(c), { n: r.length, cls: "s-" + st + (state.filter === c.cid ? " sel" : "") + (eventNow() && eventNow().communities.includes(c.cid) ? " evt" : ""), name: c.name, onClick: () => focusCommunity(c.cid) });
      });
      if (state.layer === "week") shared.forEach(([a, b, p]) => p && savingTag(a, b, p, !!focus));
      map.getSource("foot").setData(fc([]));
    }
    if (state.layer === "reach" && !refreshMap.reach) {
      const lons = hubComs.map((c) => c.lon), lats = hubComs.map((c) => c.lat);
      // a circle around the hub that reaches just past its farthest community, on land only
      const reachKm = Math.max(...hubComs.map((c) => h3.greatCircleDistance([c.lat, c.lon], [hub.lat, hub.lon], "km"))) + 60;
      const pad = reachKm / 100;
      const poly = [[hub.lat - pad, hub.lon - pad], [hub.lat - pad, hub.lon + pad], [hub.lat + pad, hub.lon + pad], [hub.lat + pad, hub.lon - pad]];
      // only hexagons on NT land: the sea has no driving time
      refreshMap.reach = fc(h3.polygonToCells(poly, 5).map((cell) => [cell, h3.cellToLatLng(cell)]).filter(([, [la, lo]]) => onLand(lo, la) && h3.greatCircleDistance([la, lo], [hub.lat, hub.lon], "km") <= reachKm)
        .map(([cell, [la, lo]]) => F(hexGeom(cell), { h: (h3.greatCircleDistance([la, lo], [hub.lat, hub.lon], "km") * 1.2) / 70 })));
    }
    if (refreshMap.reach) map.getSource("reach").setData(refreshMap.reach);
    hubBadge();
    legend();
    declutter();
  }
  // point-in-polygon against the NT coastline rings (mainland and islands) shipped in the data
  const LAND = (RN.coast || []).map((poly) => (Array.isArray(poly[0][0]) ? poly[0] : poly));
  function onLand(lon, lat) {
    return LAND.some((ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    });
  }
  function legend() {
    const L = $("#legend");
    L.innerHTML = state.layer === "year"
      ? `<b>The whole year</b><span>Number in each hexagon: days until 9 in 10 urgent repairs were fixed</span>
         <span><i class="lg s-booked"></i>5 days or less</span><span><i class="lg s-cut"></i>6 to 15 days</span><span><i class="lg s-waiting"></i>more than 15 days</span>`
      : state.layer === "reach"
      ? `<b>Driving time from ${esc(RN.hub)}</b><span>Small hexagons, about 250 km² each</span>
         <span><i class="lg" style="background:#64d2ff"></i>under 3 hours</span><span><i class="lg" style="background:#b28cff"></i>6 to 9 hours</span><span><i class="lg" style="background:#ff7aa8"></i>9 hours or more</span>`
      : `<b>This week</b><span>Each hexagon is a community. The number is repairs waiting.</span>
         <span><i class="lg s-booked"></i>a tradesperson goes this week</span><span><i class="lg s-waiting"></i>no trip this week</span>
         <span><i class="lg s-cut"></i>road cut, no airstrip</span><span><i class="ln"></i>shared trip: one person, two places</span>
         <span class="src">Lines show who goes where, not the road they drive.</span>`;
    L.innerHTML += `<span class="src">${esc(imagery.name)}${imagery.crisp ? "" : " · zoom limited offline"}</span>`;
  }
  function focusCommunity(cid) {
    const c = comById[cid]; if (!c || !map) return;
    map.flyTo({ center: ll(c), zoom: Math.min(imagery.crisp ? 13 : 10.5, map.getMaxZoom()), pitch: 40, bearing: -10, duration: reduce ? 0 : 1600, essential: true });
    if (state.role === "coord") { state.filter = cid; state.tab = "queue"; renderCoord(); refreshMap(); }
  }
  function showHouses(list) {
    if (!map || !map.getSource("houses")) return;
    map.getSource("houses").setData(fc(list.filter((r) => r.cell).map((r) => F(hexGeom(r.cell), { color: r.done ? "#30d158" : r.category === "routine" ? "#0a84ff" : r.category === "urgent" ? "#ff9f0a" : "#ff453a" }))));
  }
  function flyToJob(r) {
    if (!map) return; showHouses([r]);
    const [la, lo] = h3.cellToLatLng(r.cell);
    map.flyTo({ center: [lo, la], zoom: Math.min(imagery.crisp ? 15.5 : 11.5, map.getMaxZoom()), pitch: 35, bearing: -10, duration: reduce ? 0 : 1800, essential: true });
    if (!imagery.crisp) toast("Offline map: zoom is limited. Online imagery shows the house clearly.");
  }

  // ================================================================ COORDINATOR
  function decisionHTML() {
    const mine = signedFor(state.policy); const d = RN.demo[state.policy].ledger;
    if (mine) return `<div class="decision"><span class="eyebrow">Signed in this browser</span><b>${esc(label(state.policy))}</b><p>${esc(mine.role)}, ${esc(mine.date)}. ${esc(mine.why)}</p></div>`;
    if (state.policy === "cheapest_1") return `<div class="decision unsigned"><span class="eyebrow">Nobody signed this</span><b>Cheapest jobs first</b><p>Town jobs need no travel, so they always look cheaper and remote repairs wait. Nobody agreed to that. Open “Compare” to choose a setting and sign it.</p></div>`;
    return `<div class="decision"><span class="eyebrow">How this week was planned · example sign-off</span><b>${esc(label(state.policy))}</b><p>${esc(d.role)}, ${esc(d.date)}. ${esc(d.rationale.replace(/H3 cells/g, "hexagons"))}</p></div>`;
  }
  function renderCoord() {
    $$("#coord .tabs button[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    const body = $("#coord-body");
    if (state.tab === "queue") body.innerHTML = queueHTML();
    if (state.tab === "trips") { body.innerHTML = tripsHTML(); bindEvent(body); bindWarn(body); }
    if (state.tab === "checks") { body.innerHTML = checksHTML(); bindChecks(body); }
    if (state.tab === "reader") { body.innerHTML = readerHTML(); bindReader(); return; }
    bindGuides(body);
    $$(".row[data-id]", body).forEach((b, i) => { b.style.animationDelay = reduce ? "0ms" : Math.min(i, 14) * 22 + "ms"; b.addEventListener("click", () => openJob(b.dataset.id)); });
    $$(".filters [data-f]", body).forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.f; renderCoord(); refreshMap(); }));
    $$(".filters [data-tr]", body).forEach((b) => b.addEventListener("click", () => { state.trade = b.dataset.tr; renderCoord(); refreshMap(); }));
    $$("[data-cid]", body).forEach((b) => b.addEventListener("click", () => focusCommunity(b.dataset.cid)));
    $$("[data-gotab]", body).forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.gotab; renderAll(); }));
    $$("[data-trip]", body).forEach((b) => b.addEventListener("click", () => {
      const ks = b.dataset.trip.split("+").map((k) => comById[k]); const pts = ks.map(ll).concat([HUBLL()]);
      map.fitBounds(pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])), { padding: 80, maxZoom: 9, duration: reduce ? 0 : 1400 });
    }));
  }
  function queueHTML() {
    const all = rows().filter((r) => state.trade === "all" || r.trade === state.trade);
    const remote = all.filter((r) => r.site !== "TOWN");
    const visited = new Set(all.filter((r) => r.trip && r.site !== "TOWN").map((r) => r.site));
    const runs = new Set(all.filter((r) => r.run).map((r) => r.run));
    const noVisit = new Set(remote.filter((r) => !visited.has(r.site)).map((r) => r.site));
    const stats = [[all.length, "repairs waiting around " + RN.hub], [all.filter((r) => r.done).length, "booked for this week"], [visited.size, "communities getting a visit"],
      [runs.size, "shared trips"], [remote.filter((r) => !r.done && r.category !== "routine").length, "urgent remote repairs still waiting"], [noVisit.size, "communities with no visit"]];
    let list = all.slice(); const f = state.filter;
    if (f === "remote") list = list.filter((r) => r.site !== "TOWN"); else if (f === "town") list = list.filter((r) => r.site === "TOWN");
    else if (f === "urgent") list = list.filter((r) => r.category !== "routine"); else if (comById[f]) list = list.filter((r) => r.site === f);
    list.sort((a, b) => b.value - a.value);
    const fb = (k, l) => `<button data-f="${k}" aria-pressed="${f === k}">${l}</button>`;
    const tb = (k, l) => `<button data-tr="${k}" aria-pressed="${state.trade === k}">${l}</button>`;
    return guide("coord", `<b>What you're looking at.</b> Each hexagon on the map is a community; the number is how many repairs are waiting. Green means a tradesperson goes this week, orange means no trip yet. A blue line is a shared trip: one person visits two nearby places on one trip. Tap a repair below to see why it sits where it does.`)
      + decisionHTML() + warnBanner()
      + (eventNow() ? `<div class="decision" style="border-color:var(--bad)"><span class="eyebrow" style="color:var(--bad)">${esc(EVENT_WORD[eventNow().type])} declared ${dateOf(eventNow().day)}</span><b>${esc(eventNow().communities.map((c) => comById[c].name).join(", "))}</b><p>Make safe within 48 hours, one team trip, surge crews from the panel. The plan is in Trips.</p></div>` : "")
      + `<div class="stats">${stats.map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div>`
      + `<div class="filters" style="padding:0 6px 6px">${tb("all", "All trades")}${Object.keys(TRADE).map((k) => tb(k, TRADE_SHORT[k])).join("")}</div>`
      + `<div class="filters" style="padding:0 6px 8px">${fb("remote", "Remote")}${fb("urgent", "Urgent")}${fb("town", "Town")}${fb("all", "All")}${comById[f] ? `<button data-f="all" aria-pressed="true" aria-label="Stop showing only ${esc(comById[f].name)}">${esc(comById[f].name)} ✕</button>` : ""}</div>`
      + `<p class="note" style="padding:0 8px 6px">Most urgent first. Where someone lives, how they told us and how much they said never change their place in line. A repair moves up as its time runs out.</p>`
      + list.slice(0, 120).map((r) => `<button class="row" data-id="${r.id}" aria-current="${state.job === r.id}"><span class="dot ${r.category}"></span>
          <span class="t">${esc(H[r.hazard].label)}</span><span class="chips"><span class="chip ${codeOf(r)}">${REASON[codeOf(r)]}</span>${dueChip(r)}${tierChip(r)}${r.event ? `<span class="chip immediate">${esc(EVENT_WORD[r.event.type])}</span>` : ""}</span>
          <span class="s">${esc(r.place)} · ${TRADE_SHORT[r.trade]} · waiting ${days(r.wait)}${r.checks && r.checks.length ? " · checked by a person" : ""}</span></button>`).join("")
      + (list.length > 120 ? `<p class="note" style="padding:8px">Showing 120 of ${list.length}.</p>` : "");
  }
  // ---------------------------------------------------------------- checks: the human side of the system
  const audit = () => store("rn-audit") || {};
  const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  function auditSample() {   // 1 in 20 reports the computer read on its own, the same sample for everyone this week
    const auto = rows().filter((r) => !r.needs_human);
    const pick = auto.filter((r) => hash(r.id + state.week) % 20 === 0);
    return pick.length >= 5 ? pick : auto.slice().sort((a, b) => hash(a.id) - hash(b.id)).slice(0, 5);
  }
  function checksHTML() {
    const A = audit(); const sample = auditSample(); const checked = sample.filter((r) => A[r.id] !== undefined);
    const wrong = checked.filter((r) => A[r.id] === false).length;
    const box = outbox(); const all = rows();
    const reviews = box.filter((u) => u.kind === "review"), missed = box.filter((u) => (u.kind || "visit") === "visit" && NO_ACCESS.includes(u.status));
    const broken = box.filter((u) => u.kind === "confirm" && u.status === "still broken");
    const back = all.filter((r) => r.came_back != null), twice = all.filter((r) => r.merged_into);
    const due = (iso) => { const d = new Date(iso); let n = 0; while (n < 10) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n++; } return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }); };
    const job = (id) => all.find((r) => r.id === id);
    const line = (r, extra) => r ? `<button class="row" data-id="${r.id}"><span class="dot ${r.category}"></span><span class="t">${esc(H[r.hazard].label)}</span>${extra}<span class="s">${esc(r.place)} · house ${r.house}</span></button>` : "";
    // needs a decision today: someone said it got worse; a visit missed and nobody has decided who goes; an offer nobody took
    const worse = box.filter((u) => u.kind === "escalate").map((u) => [u, job(u.id)]).filter(([u, r]) => r && !(r.checks || []).some((c) => c.at > u.at));
    const undecided = all.filter((r) => r.visit && r.visit.status !== "done" && !(r.assign && r.assign.at > r.visit.at));
    const untaken = all.filter((r) => r.assign && r.assign.mode === "open" && !r.assign.accepted_by);
    const quick = (r) => `<div class="acts" style="display:flex;gap:6px;flex-wrap:wrap;padding:0 8px 8px"><button class="btn small ghost" data-q="next" data-id="${r.id}">Next trip</button>
      <button class="btn small ghost" data-q="open" data-id="${r.id}">Offer to any ${esc(TRADE_WORD[r.trade])}</button><button class="btn small ghost" data-open="assignsec" data-id="${r.id}">Choose a crew</button></div>`;
    const today3 = worse.length + undecided.length + untaken.length;
    return guide("checks", `<b>Checks.</b> The computer reads reports and ranks repairs; people check it. Act on anything that needs a decision today, re-read this week's sample, answer tenants who asked for a review, and follow up visits that missed.`)
      + `<div class="section-title"><h3>Needs a decision today</h3><span class="note">${today3}</span></div>`
      + (today3 ? "" : `<p class="note" style="padding:0 6px 6px">Nothing right now. When a tenant or tradesperson says a repair got worse, or a visit misses, it shows here.</p>`)
      + worse.map(([u, r]) => line(r, `<span class="chip immediate">${u.from === "tradesperson" ? "Tradesperson" : "Tenant"}: it got worse</span>`)
          + `<div class="acts" style="padding:0 8px 8px"><p class="note">Call ${u.from === "tradesperson" ? "the tradesperson or the tenant" : "the tenant"} back today and check the urgency.</p><button class="btn small primary" data-open="checksec" data-id="${r.id}">Check the urgency</button></div>`).join("")
      + undecided.map((r) => line(r, `<span class="chip ${MISSED[r.visit.status] || "no_access"}">${esc(r.visit.status)}</span>`) + quick(r)).join("")
      + untaken.map((r) => line(r, `<span class="chip offered">Offered ${dateOf(r.assign.day)}, not taken yet</span>`)).join("")
      + `<div class="section-title"><h3>Check the reader</h3><span class="note">${checked.length} of ${sample.length} checked${checked.length ? ` · ${checked.length - wrong} right` : ""}</span></div>
        <p class="note" style="padding:0 6px 6px">One in 20 reports the computer read without a person. Is the reading right? If more than 1 in 10 are wrong, tell the team that looks after the reader: tenants are using words it doesn't know.</p>`
      + sample.map((r) => `<div class="job audit" data-a="${r.id}"><p class="quote" style="font-size:14px">“${esc(r.text)}”</p>
          <div class="meta"><span>Read as <b>${esc(H[r.hazard].label)}</b></span><span class="chip ${r.category}">${CAT[r.category]}</span></div>
          ${A[r.id] === undefined ? `<div class="acts"><button class="btn good" data-ok="1">Right</button><button class="btn ghost" data-ok="0">Wrong</button></div>`
            : A[r.id] ? `<p class="note">Checked: right</p>` : `<p class="note">Checked: wrong. <button class="btn small ghost" data-open="checksec" data-id="${r.id}">Correct it</button></p>`}</div>`).join("")
      + `<div class="section-title"><h3>Reviews tenants asked for</h3><span class="note">${reviews.length}</span></div>`
      + (reviews.length ? reviews.map((u) => line(job(u.id), `<span class="chip person">answer by ${due(u.at)}</span>`) + `<p class="note" style="padding:0 8px 8px">“${esc(u.note)}”</p>`).join("")
          : `<p class="note" style="padding:0 6px 6px">None yet. Tenants ask from the Tenant view.</p>`)
      + `<div class="section-title"><h3>Visits that missed</h3><span class="note">${missed.length}</span></div>`
      + (missed.length ? missed.map((u) => line(job(u.id), `<span class="chip travel_cost">${esc(u.status)}</span>`)).join("") + `<p class="note" style="padding:0 6px 6px">These stay open and go on the next trip. The tenant has been told when we came and what we tried.</p>`
          : `<p class="note" style="padding:0 6px 6px">None. Tradespeople record them from the run sheet.</p>`)
      + `<div class="section-title"><h3>Tenant says it's still broken</h3><span class="note">${broken.length}</span></div>`
      + (broken.length ? `<p class="note" style="padding:0 6px 6px">Reopened with ${REWORK} extra points; each keeps the day it was first reported, so it goes on the next trip. Send a different crew if the last fix didn't hold.</p>`
          + broken.map((u) => { const r = job(u.id); return r ? line(r, `<span class="chip rework">${u.via === "cho" ? "via housing officer" : "tenant"}: still broken</span>`) + (r.rework && !(r.assign && r.assign.at > r.rework.at) ? quick(r) : "") : ""; }).join("") : `<p class="note" style="padding:0 6px 6px">None.</p>`)
      + `<div class="section-title"><h3>Came back within 90 days of a fix</h3><span class="note">${back.length}</span></div>`
      + back.slice(0, 8).map((r) => line(r, `<span class="chip cut">${days(r.came_back)} after</span>`)).join("")
      + `<div class="section-title"><h3>Reported twice, joined into one job</h3><span class="note">${twice.length}</span></div>`
      + (twice.length ? twice.slice(0, 8).map((r) => line(r, `<span class="chip hex">with ${esc(r.merged_into)}</span>`)).join("") : `<p class="note" style="padding:0 6px 6px">None this week.</p>`);
  }
  function bindChecks(body) {
    $$(".audit [data-ok]", body).forEach((b) => b.addEventListener("click", () => {
      const id = b.closest(".audit").dataset.a; const A = audit(); A[id] = b.dataset.ok === "1"; store("rn-audit", A); renderCoord();
      if (!A[id]) { openJob(id, "checksec"); toast("Pick the right fault, say how you checked, and save. The tenant sees the change."); }
    }));
    $$("[data-open]", body).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openJob(b.dataset.id, b.dataset.open); }));
    $$("[data-q]", body).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation(); const r = rows().find((x) => x.id === b.dataset.id); if (!r) return;
      saveAssign(r, b.dataset.q, r.trade);
      toast(b.dataset.q === "open" ? `Offered to any ${TRADE_WORD[r.trade]}. The first to accept gets it.` : "Back in line for the next trip. It keeps its waiting time.");
      renderAll();
    }));
  }
  // ---------------------------------------------------------------- trades travelling together
  // Trades booked to the same community (or the same shared trip) this week can go in one vehicle or one charter.
  const SEATS = { road: 3, "road-run": 3, air: 5, "air-run": 5 };   // as simulate.SEATS
  function togetherGroups(all = rows()) {
    const g = {};
    all.filter((r) => r.trip && r.site !== "TOWN" && !r.rework).forEach((r) => {
      const k = r.run || r.site; const x = (g[k] = g[k] || { k, mode: r.mode, cost: {} });
      x.cost[r.trade] = Math.max(x.cost[r.trade] || 0, r.trip_cost || 0);
    });
    return Object.values(g).filter((x) => Object.keys(x.cost).length >= 2).map((x) => {
      const seats = SEATS[x.mode] || 3; const costs = Object.values(x.cost).sort((a, b) => b - a);
      const separate = costs.reduce((a, b) => a + b, 0); let together = 0; for (let i = 0; i < costs.length; i += seats) together += costs[i];
      return { ...x, trades: Object.keys(x.cost), separate, together, saving: separate - together, vehicles: Math.ceil(costs.length / seats) };
    }).sort((a, b) => b.saving - a.saving);
  }
  function nearbyPairs(all = rows()) {   // different trades going to neighbouring communities (within 2 hexagons) could share one loop
    const at = {}; all.filter((r) => r.trip && r.site !== "TOWN" && !r.run).forEach((r) => ((at[r.site] = at[r.site] || new Set()).add(r.trade)));
    return RN.pairs.filter((p) => p.hub === RN.hub && at[p.a] && at[p.b]).map((p) => {
      const a = [...at[p.a]].filter((t) => !at[p.b].has(t)), b = [...at[p.b]].filter((t) => !at[p.a].has(t));
      return a.length && b.length ? { p, a, b } : null;
    }).filter(Boolean).slice(0, 4);
  }
  const tradeList = (ts) => ts.map((t) => TRADE_WORD[t]).join(" + ");
  function togetherHTML() {
    const G = togetherGroups(), N2 = nearbyPairs();
    if (!G.length && !N2.length) return "";
    return `<div class="section-title"><h3>Trades travelling together</h3><span class="note">${G.length}</span></div>
      <p class="note" style="padding:0 6px 6px">Different trades booked to the same place this week go in one vehicle or one charter (a ute takes 3, a light plane 5).</p>`
      + G.map((g) => `<button class="trip-card" data-trip="${g.k}"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(g.k.split("+").map((c) => comById[c].name).join(" + "))}</h3><span class="chip hex">${g.mode.startsWith("air") ? "One charter" : g.vehicles > 1 ? `${g.vehicles} vehicles` : "One vehicle"}</span></div>
          <span class="note">${esc(tradeList(g.trades))} · about ${money(g.together)} in ${g.mode.startsWith("air") ? "flights" : "fuel and vehicle"} instead of ${money(g.separate)}, saving about ${money(g.saving)}</span></button>`).join("")
      + N2.map(({ p, a, b }) => `<button class="trip-card" data-trip="${p.a}+${p.b}"><h3>${esc(comById[p.a].name)} and ${esc(comById[p.b].name)}, ${Math.round(p.km)} km apart</h3>
          <span class="note">The ${esc(tradeList(a))} (${esc(comById[p.a].name)}) and the ${esc(tradeList(b))} (${esc(comById[p.b].name)}) could share one loop: hub → ${esc(comById[p.a].name)} → ${esc(comById[p.b].name)} → hub.</span></button>`).join("");
  }

  // ---------------------------------------------------------------- floods, cyclones and fires
  const EVENT_WORD = { flood: "Flood", cyclone: "Cyclone", fire: "Bushfire", storm: "Storm" };
  const DZ = RN.disaster_params || { damaged_share: 0.4, faults_per_house: [1, 3], fault_mix: { damp_mould: 0.2, no_power: 0.15, sewage_overflow: 0.12, electrical_danger: 0.1, no_water: 0.1, stove_broken: 0.08, kitchen: 0.08, aircon_fan: 0.07, structural_danger: 0.05, security: 0.05 }, communities: [] };
  function eventPlan(e) {
    const cs = e.communities.map((cid) => comById[cid]).filter(Boolean);
    const houses = cs.reduce((a, c) => a + c.houses, 0), damaged = Math.round(houses * DZ.damaged_share);
    const faults = Math.round(damaged * (DZ.faults_per_house[0] + DZ.faults_per_house[1]) / 2);
    const wsum = Object.values(DZ.fault_mix).reduce((a, b) => a + b, 0); const hrs = {};
    Object.entries(DZ.fault_mix).forEach(([hz, w]) => { const h = H[hz]; if (h) hrs[h.trade] = (hrs[h.trade] || 0) + faults * (w / wsum) * h.hours; });
    const trades = Object.entries(hrs).sort((a, b) => b[1] - a[1]).map(([t, h]) => ({ t, h, crews: ((RN.crews || {})[t] || [1]).length, extra: Math.max(1, Math.ceil(h / (2 * 40))) }));
    return { cs, houses, damaged, faults, trades, air: cs.every((c) => c.airstrip) };
  }
  function eventHTML() {
    const e = eventNow();
    const coms = RN.communities.filter((c) => c.hub === RN.hub).sort((a, b) => a.name.localeCompare(b.name));
    if (!e) return `<details class="card" id="evbox" style="margin:0 6px 10px"><summary style="cursor:pointer"><b>Flood, cyclone or fire?</b> Declare an event</summary>
      <form class="form" id="evf" style="margin-top:10px"><label class="field-label">What happened<select name="type">${Object.entries(EVENT_WORD).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <fieldset><legend class="field-label">Communities hit</legend>${coms.map((c) => `<label class="tick"><input type="checkbox" name="c" value="${c.cid}"${(WARN.prefill ? WARN.prefill.communities : DZ.communities || []).includes(c.cid) ? " checked" : ""}> ${esc(c.name)}</label>`).join("")}</fieldset>
        <label class="field-label">Note (optional)<input type="text" name="note" maxlength="300" placeholder="e.g. Victoria River over the Buntine Highway" value="${esc(WARN.prefill ? WARN.prefill.note : "")}"></label>
        <button class="btn primary" type="submit">Declare and plan the response</button></form></details>`;
    const P = eventPlan(e); const Z = RN.disaster || [];
    const zr = (l) => Z.find((x) => x.label === l) || {};
    const no = zr("No flood"), usual = zr("Flood, usual crews"), surge = zr("Flood, surge crews");
    return `<div class="card" style="margin:0 6px 10px;border:1px solid var(--bad);display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b>${esc(EVENT_WORD[e.type])} declared ${dateOf(e.day)}: ${esc(P.cs.map((c) => c.name).join(", "))}</b><button class="btn small ghost" id="evend">End event</button></div>
      <p class="note">About ${P.houses} houses. If ${Math.round(DZ.damaged_share * 100)}% are damaged, expect about ${P.faults} repairs from ${P.damaged} houses in the next two weeks. Need still sets the order; dangerous faults are made safe first.</p>
      <ol class="note" style="margin:0;padding-left:18px;display:grid;gap:4px">
        <li><b style="color:var(--ink)">Make safe within 48 hours.</b> Maintenance and housing officers check every house; anything dangerous is made safe the same day.</li>
        <li><b style="color:var(--ink)">One team, one ${P.air ? "charter" : "trip"}.</b> ${esc(tradeList(P.trades.map((x) => x.t)))} go in together${P.air ? " while roads are cut" : ""}, sharing the ${P.air ? "plane" : "vehicles"}.</li>
        <li><b style="color:var(--ink)">Ask the contractor panel for surge crews</b> for 2 weeks: ${P.trades.map((x) => `${x.extra} ${esc(TRADE_WORD[x.t])}${x.extra > 1 ? "s" : ""}`).join(", ")}. Local Aboriginal Business Enterprises first. A named person signs the request.</li>
        <li><b style="color:var(--ink)">Tell every household.</b> The hotline, the housing officer, free interpreters. Reports from the area are tagged to the event and asked the same questions.</li>
        <li><b style="color:var(--ink)">Everyone else keeps their clock.</b> Surge crews take the event work so other communities' trips go ahead.</li></ol>
      ${usual.label ? `<p class="note">In our modelled flood (${esc((RN.disaster_params || {}).name || "Victoria River, January 2023 pattern")}), with the usual crews 9 in 10 urgent flood repairs were fixed within ${Math.round(usual.event_urgent_p90)} days and the rest of the hub's urgent repairs within ${Math.round(usual.other_urgent_p90)} (${Math.round(no.other_urgent_p90)} with no flood). With surge crews: ${Math.round(surge.event_urgent_p90)} and ${Math.round(surge.other_urgent_p90)} days.</p>` : ""}
    </div>`;
  }
  function bindEvent(body) {
    const f = $("#evf", body);
    if (f) f.addEventListener("submit", (e) => {
      e.preventDefault(); const cs = $$("input[name=c]:checked", f).map((x) => x.value);
      if (!cs.length) return toast("Tick the communities that were hit.");
      const ev = { type: f.type.value, communities: cs, day: today(), week: state.week, at: new Date().toISOString(), note: f.note.value.trim() || undefined };
      store("rn-event", ev);
      recordUpdate({ id: "EV-" + String(Date.now() % 1e6).padStart(6, "0"), trade: "general", place: cs.join(",") }, "declared", { event: ev.type, communities: cs, start_day: ev.day, note: ev.note }, "event");
      WARN.prefill = null;
      toast(`${EVENT_WORD[ev.type]} declared. Jobs in those communities are tagged, and the response plan is below.`); renderAll();
    });
    const end = $("#evend", body);
    if (end) end.addEventListener("click", () => { const ev = store("rn-event"); if (ev) { ev.ended = new Date().toISOString(); store("rn-event", ev); } toast("Event ended."); renderAll(); });
  }

  // ---------------------------------------------------------------- roads and weather now: prompts for the coordinator, never a change to the line
  // api/warnings reads the NT Road Report (closures, flooding) and Bureau of Meteorology station observations (rain since
  // 9 am, temperature), cached for 10 minutes. Offline or without the server, the saved snapshot is used and labelled.
  const WARN = { data: null, loading: false, example: false };
  const kmTo = (a, b, lat, lon) => { const R = 6371, r = Math.PI / 180, dl = (lat - a) * r, dn = (lon - b) * r;
    const q = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
  async function loadWarnings() {
    if (WARN.data || WARN.loading) return; WARN.loading = true;
    try { const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000); const r = await fetch("api/warnings", { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); WARN.data = await r.json(); }
    catch (e) {
      try { const s = await (await fetch("data/warnings_snapshot.json")).json();
        WARN.data = { ...s, roads_source: "snapshot", weather_source: "snapshot", offline: true }; } catch (e2) { WARN.data = { failed: true }; }
    }
    WARN.loading = false;
    if (state.role === "coord" && (state.tab === "trips" || state.tab === "queue")) renderCoord();
  }
  // a made-up day, clearly labelled: the January 2023 Victoria River flood pattern, plus a hot day at Ngukurr
  function warnExample() {
    const st = (w) => (WARN.data && WARN.data.stations || []).find((s) => s.wmo === w) || { wmo: w, station: "Station " + w, lat: 0, lon: 0 };
    const vrd = st(94232), ng = st(94106);
    return { example: true, roads: [{ road: "Buntine Highway", restriction: "Road Closed", type: "Flooding", where: "Victoria River crossing to Kalkaringi", comment: "Water over the road. Example only.", start: [-17.1, 130.8], end: [-17.5, 130.8], updated: "example" }],
      weather: [{ ...vrd, time: "example", air_temp: 27, apparent_t: 31, rain_since_9am: 186 }, { ...ng, time: "example", air_temp: 39, apparent_t: 43, rain_since_9am: 0 }] };
  }
  const obsTime = (t) => (/^\d{12}/.test(String(t)) ? `${+String(t).slice(6, 8)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+String(t).slice(4, 6) - 1]}, ${String(t).slice(8, 10)}:${String(t).slice(10, 12)}` : String(t || ""));
  const RAIN_MM = 50, HEAT_C = 38, ROAD_KM = 30, WX_KM = 80;
  function warnPrompts(D) {
    const coms = RN.communities.filter((c) => c.hub === RN.hub); const open = rows().filter((r) => !r.done);
    const out = [];
    (D.roads || []).forEach((x) => {
      const near = coms.filter((c) => (c.closure && x.road && c.closure.toLowerCase().includes(x.road.toLowerCase().replace(/\s+(4wd|road|highway|hwy|track)$/i, "").trim()) && x.road.length > 3)
        || [x.start, x.end].some((p) => Array.isArray(p) && kmTo(c.lat, c.lon, p[0], p[1]) <= ROAD_KM));
      if (!near.length) return;
      const n = open.filter((r) => near.some((c) => c.cid === r.site)).length; const flood = /flood/i.test(`${x.type} ${x.restriction}`);
      const air = near.filter((c) => c.airstrip), road = near.filter((c) => !c.airstrip);
      out.push({ kind: "road", cs: near, flood, t: `${x.road}: ${x.restriction.toLowerCase()}${x.type ? ` (${x.type.toLowerCase()})` : ""} near ${near.map((c) => c.name).join(", ")}.`,
        p: `${n} repair${n === 1 ? "" : "s"} waiting there. ${air.length ? `${air.map((c) => c.name).join(", ")} ${air.length > 1 ? "have airstrips" : "has an airstrip"}: a charter can still go. ` : ""}${road.length ? `${road.map((c) => c.name).join(", ")}: no airstrip, so road trips wait until it opens. ` : ""}${flood ? "If houses are flooding, declare a flood." : ""}`.trim() });
    });
    (D.weather || []).forEach((w) => {
      const near = coms.filter((c) => kmTo(c.lat, c.lon, w.lat, w.lon) <= WX_KM);
      if (w.rain_since_9am >= RAIN_MM && near.length) out.push({ kind: "rain", cs: near, flood: true, t: `${w.rain_since_9am} mm of rain since 9 am at ${w.station}.`, p: `Near ${near.map((c) => c.name).join(", ")}. Roads may cut and houses may flood. Declare a flood?` });
      const hot = Math.max(w.apparent_t ?? -99, w.air_temp ?? -99);
      if (hot >= HEAT_C && near.length) {
        const t1 = open.filter((r) => near.some((c) => c.cid === r.site) && r.tier === 1 && LIFELINE.has(r.hazard));
        out.push({ kind: "heat", cs: near, jobs: t1, t: `Feels like ${hot}°C at ${w.station}.`, p: t1.length ? `Tier 1 households near there without power, water or cooling: ${t1.length}. They are already Immediate; check they are made safe today.` : `No Tier 1 household near there is waiting on power, water or cooling.` });
      }
    });
    return out;
  }
  function warnHTML() {
    if (!WARN.data) { loadWarnings(); return `<div class="card" style="margin:0 6px 10px"><b>Roads and weather now</b><p class="note">Checking the NT Road Report and the Bureau of Meteorology…</p></div>`; }
    if (WARN.data.failed) return `<div class="card" style="margin:0 6px 10px"><b>Roads and weather now</b><p class="note">Couldn't reach the road report or the weather, and no saved copy is here. Check roadreport.nt.gov.au and bom.gov.au.</p></div>`;
    const D = WARN.example ? warnExample() : WARN.data; const P = warnPrompts(D);
    const src = WARN.example ? `<span class="chip immediate">Example, not live</span>`
      : `<span class="note">Roads: ${D.roads_source === "live" ? "live" : `saved ${esc(String(D.roads_saved || "").slice(0, 16))}`} · Weather: ${D.weather_source === "live" ? "live" : `saved ${esc(obsTime(D.weather_saved))}`}</span>`;
    const coms = RN.communities.filter((c) => c.hub === RN.hub);
    const wx = (D.weather || []).map((w) => { const near = coms.filter((c) => kmTo(c.lat, c.lon, w.lat, w.lon) <= WX_KM).map((c) => c.name);
      return `<tr><td>${esc(w.station)}${w.saved ? " (saved)" : ""}<div class="note">${esc(near.slice(0, 3).join(", ") || "no community within 80 km")}</div></td><td>${w.rain_since_9am ?? "–"} mm</td><td>${w.air_temp ?? "–"}°C${w.apparent_t != null ? `, feels ${w.apparent_t}°C` : ""}</td><td class="note">${esc(obsTime(w.time))}</td></tr>`; }).join("");
    return `<div class="card" id="warnbox" style="margin:0 6px 10px;display:grid;gap:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap"><b>Roads and weather now</b>${src}</div>
      ${P.length ? P.map((x, i) => `<div class="decision"${x.kind !== "heat" ? ' style="border-color:var(--warn, #ff9f0a)"' : ' style="border-color:var(--bad)"'}><span class="eyebrow">${x.kind === "road" ? "Road" : x.kind === "rain" ? "Heavy rain" : "Heat"}</span><b>${esc(x.t)}</b><p>${esc(x.p)}</p>
          ${(x.jobs || []).slice(0, 6).map((r) => `<button class="btn small ghost" data-wjob="${r.id}">${esc(r.place)} · house ${r.house}: ${esc(H[r.hazard].label)}</button>`).join(" ")}
          ${x.flood && !eventNow() ? `<button class="btn small" data-wflood="${i}">Declare a flood…</button>` : ""}</div>`).join("")
        : `<p class="note">Nothing near your communities needs a decision: no closures within ${ROAD_KM} km or on their access roads, no rain over ${RAIN_MM} mm, no heat over ${HEAT_C}°C.</p>`}
      <details><summary class="note" style="cursor:pointer">Stations (${(D.weather || []).length}) and closures across the NT (${(D.roads || []).length})</summary>
        <table class="note" style="width:100%;margin-top:6px;border-collapse:collapse"><tr><th align="left">Station</th><th align="left">Rain since 9 am</th><th align="left">Temperature</th><th align="left">Read</th></tr>${wx}</table>
        <ul class="note" style="padding-left:18px;margin:6px 0 0">${(D.roads || []).slice(0, 20).map((x) => `<li>${esc(x.road)}: ${esc(x.restriction)} (${esc(x.type)}), ${esc(x.where)}</li>`).join("")}</ul></details>
      <p class="note">Prompts only: nothing here changes anyone's place in the line. You decide. Sources: NT Road Report (Northern Territory Government) and Bureau of Meteorology observations.
        <button class="btn small ghost" id="wex">${WARN.example ? "Back to now" : "Show an example"}</button></p>
    </div>`;
  }
  function bindWarn(body) {
    const ex = $("#wex", body); if (ex) ex.addEventListener("click", () => { WARN.example = !WARN.example; renderCoord(); });
    $$("[data-wjob]", body).forEach((b) => b.addEventListener("click", () => openJob(b.dataset.wjob)));
    $$("[data-wflood]", body).forEach((b) => b.addEventListener("click", () => {
      const D = WARN.example ? warnExample() : WARN.data; const x = warnPrompts(D)[+b.dataset.wflood];
      WARN.prefill = { communities: x.cs.map((c) => c.cid), note: x.t };
      renderCoord(); const box = $("#evbox"); if (box) { box.open = true; box.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); }
    }));
  }
  function warnBanner() {
    if (!WARN.data || WARN.data.failed || WARN.example) { if (!WARN.data) loadWarnings(); return ""; }
    const n = warnPrompts(WARN.data).length, D = WARN.data;
    if (n) return `<div class="decision" style="margin:0 6px 10px"><span class="eyebrow">Roads and weather</span><b>${n} thing${n > 1 ? "s" : ""} to check before trips go</b><p>A road closure, heavy rain or heat near your communities. Nothing changes the line unless you decide. <button class="btn small ghost" data-gotab="trips">Open Trips</button></p></div>`;
    const how = D.roads_source === "live" && D.weather_source === "live" ? "live" : "saved copy";
    return `<div class="card" style="margin:0 6px 10px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span class="note"><b style="color:var(--ink)">Roads and weather</b> (NT Road Report, Bureau of Meteorology, ${how}): nothing near your communities right now.</span><button class="btn small ghost" data-gotab="trips">See in Trips</button></div>`;
  }

  function tripsHTML() {
    const all = rows(); const F2 = fieldData();
    let h = guide("trips", `<b>Shared trips.</b> When two communities are close, one tradesperson can visit both on the same trip instead of two separate trips. ReachNT finds the pairs with a hexagon map grid (Uber's H3): if their hexagons are no more than two apart, about 90 km, they can share. Tap a trip to see it on the map.`) + warnHTML() + eventHTML() + costsHTML() + togetherHTML();
    Object.keys(TRADE).forEach((t) => {
      if (!F2[t]) return;
      const tj = all.filter((r) => r.trade === t); const groups = {};
      tj.filter((r) => r.trip && r.site !== "TOWN").forEach((r) => (groups[r.run || r.site] = groups[r.run || r.site] || []).push(r));
      const town = tj.filter((r) => r.done && r.site === "TOWN").length;
      h += `<div class="section-title"><h3>${icon(t, 16)} ${TRADE[t]}</h3><span class="note">${tj.filter((r) => r.done).length} of ${tj.length} booked</span></div>`;
      Object.entries(groups).forEach(([k, g]) => {
        const names = k.split("+").map((c) => comById[c].name).join(" + "); const p = pairOf(k);
        const travel = p ? p.together : comById[k].trip_cost;
        h += `<button class="trip-card" data-trip="${k}"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(names)}</h3><span class="chip ${p ? "hex" : g[0].mode.startsWith("air") ? "cut" : "booked"}">${p ? "Shared trip" : g[0].mode.startsWith("air") ? "Charter flight" : "Drive"}</span></div>
          <span class="note">${g.filter((r) => r.done).length} of ${g.length} repairs booked · travel about ${money(travel)}${p ? ` · two separate trips would cost about ${money(p.separate)}` : ""}</span></button>`;
      });
      if (town) h += `<div class="trip-card"><h3>${esc(RN.hub)} town</h3><span class="note">${town} repairs, no long drive</span></div>`;
    });
    const waiting = {};
    all.filter((r) => r.site !== "TOWN" && !r.done && !r.trip).forEach((r) => (waiting[r.site] = waiting[r.site] || []).push(r));
    h += `<div class="section-title"><h3>No visit this week</h3></div>`;
    h += Object.entries(waiting).sort((a, b) => b[1].length - a[1].length).map(([cid, g]) => {
      const c = comById[cid]; const cut = g.some((r) => !r.reachable);
      return `<button class="row" data-cid="${cid}"><span class="dot" style="background:${cut ? "var(--cut)" : "var(--warn)"}"></span><span class="t">${esc(c.name)}</span>
        <span class="chip ${cut ? "cut" : "travel_cost"}">${g.length} waiting</span><span class="s">${cut ? "Road cut and no airstrip" : `${c.hours} h drive · a trip costs about ${money(c.trip_cost)}`}</span></button>`;
    }).join("");
    return h;
  }
  function scoreBars(s) {
    const parts = [["Kind of fault", s.base, "var(--ink-3)"], ["How harmful", s.harm, "var(--bad)"], ["Health need", s.hlp, "var(--accent)"],
      ["Who lives there", s.exposure, "var(--good)"], ["Reported before", s.repeat, "var(--violet)"], ["Time waited", s.ageing, "var(--warn)"],
      ...(s.rework ? [["Fix didn't hold", s.rework, "var(--cut)"]] : [])];
    const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
    return `<div class="bars">${parts.filter((p) => p[1] > 0).map((p) => `<span title="${p[0]}: ${p[1]}" style="width:${(100 * p[1]) / tot}%;background:${p[2]}"></span>`).join("")}</div>
      <div class="legend">${parts.map((p) => `<span><i style="background:${p[2]}"></i>${p[0]} ${p[1]}</span>`).join("")}</div>`;
  }
  function sections(r, big) {
    const mine = signedFor(state.policy);
    return r.sections.map(([t, b]) => {
      let body = b;
      if (mine) body = body.replace(/It follows the setting the .*? approved on [^.]+\./, `It follows the setting the ${mine.role} signed on ${mine.date}.`).replace("Nobody signed off on it.", `It follows the setting the ${mine.role} signed on ${mine.date}.`);
      return big ? `<h3>${esc(t)}</h3><p>${esc(body)}</p>` : `<p><b>${esc(t)}.</b> ${esc(body)}</p>`;
    }).join("");
  }
  function priorityHTML(r) {
    const pol = state.policy.split("_")[0]; const t = timeLeft(r); const clock = Math.round(clockOf(r.category) * 5 / 7);
    const left = r.done ? "Booked this week." : t < -0.5 ? `Overdue by ${days(-t)}.` : t < 1 ? "Due today." : `${days(t)} left.`;
    const rule = `${CAT[r.category]} repairs: ${clock} business days, in town and out bush. ${left}`;
    if (pol === "cheapest" || pol === "floor") return `<p class="note">${rule} This plan gives every job the same value${pol === "floor" ? ", plus a large boost for an urgent job about to run out of time" : ""}: it doesn't use the priority to choose.</p>`;
    const need = planNeed(r), boost = r.value - need;
    return `<p class="note">${rule} <b style="color:var(--ink)">Planning priority ${r.value}</b> = need ${need} at the end of the week${boost ? ` + ${boost} because time is running out` : ""}. `
      + `With 7 days or less left a job gets +${PL.deadline_bonus}; an urgent or dangerous one also gets +${PL.floor_bonus.toLocaleString("en-AU")}, so it goes on the next trip. A missed visit never restarts the clock.</p>`;
  }
  function checkHTML(r) {
    const ch = r.checks || [];
    const opts = ["immediate", "urgent", "routine"].map((c) => `<optgroup label="${CAT[c]}">${Object.entries(H).filter(([, h]) => h.category === c)
      .map(([k, h]) => `<option value="${k}"${k === r.hazard ? " selected" : ""}>${esc(h.label)}</option>`).join("")}</optgroup>`).join("");
    return `<div class="panel-sec" id="checksec"><b>Check the urgency</b>
      <p class="note">Any time: when the tenant rings, when the housing officer or a tradesperson sees it, or after a review. Raising it takes effect now. Lowering a dangerous repair needs someone who spoke to the tenant or saw it. The computer never lowers it.</p>
      ${ch.length ? `<ul class="hist-list">${ch.map((c) => `<li><b>${dateOf(c.day)}</b> · ${esc(CHECK_SOURCES[c.source])}: ${c.to === c.from ? `still ${esc(CAT[c.to_cat].toLowerCase())}` : `${esc(H[c.from].label.toLowerCase())} (${esc(CAT[c.from_cat].toLowerCase())}) → ${esc(H[c.to].label.toLowerCase())} (${esc(CAT[c.to_cat].toLowerCase())})`}. “${esc(c.note)}”</li>`).join("")}</ul>` : ""}
      <form class="form" id="checkf">
        <div class="two"><label class="field-label">The fault is<select name="hz">${opts}</select></label>
          <label class="field-label">How did you check?<select name="src">${Object.entries(CHECK_SOURCES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label></div>
        <label class="field-label">What did you find out? (the tenant sees this)<input type="text" name="note" maxlength="300" required placeholder="e.g. Rang the tenant: water now near the power board"></label>
        <button class="btn primary" type="submit">Save the check</button></form></div>`;
  }
  function assignHTML(r) {
    const missed = r.visit && r.visit.status !== "done";
    if (r.done && !missed) return "";
    const as = r.assign; const crews = (RN.crews || {})[r.trade] || [];
    const now = as ? (as.mode === "next" ? "Back in line for the next trip" : as.mode === "crew" ? `Given to ${esc(as.crew)}` : as.accepted_by ? `${esc(as.accepted_by)} took it` : `Offered to any ${esc(TRADE_WORD[as.trade || r.trade])} on the panel`) + ` (${dateOf(as.day)})` : "";
    return `<div class="panel-sec" id="assignsec"><b>Who goes</b>
      ${missed ? `<p class="note"><span class="chip ${MISSED[r.visit.status] || "no_access"}">${esc(r.visit.status)}</span> ${r.visit.knocked_at ? `They came at ${timeOf(r.visit.knocked_at)} and ${esc((r.visit.actions || []).join(", ").toLowerCase())}.` : ""} The job stays open and keeps its waiting time.</p>` : ""}
      ${as ? `<p class="note"><b style="color:var(--ink)">${now}.</b></p>` : `<p class="note">Next week's plan sends whichever crew goes there. You can choose instead.</p>`}
      <form class="form" id="assignf">
        <fieldset><legend class="field-label">Send it to</legend>
          <label class="tick"><input type="radio" name="who" value="next" checked> The next trip there (any crew)</label>
          ${crews.map((c) => `<label class="tick"><input type="radio" name="who" value="crew:${esc(c)}"> ${esc(c)}</label>`).join("")}
          <label class="tick"><input type="radio" name="who" value="open"> Any ${esc(TRADE_WORD[r.trade])} on the panel who can go sooner (first to accept)</label></fieldset>
        <label class="field-label">Trade needed<select name="trade">${Object.keys(TRADE).map((t) => `<option value="${t}"${t === r.trade ? " selected" : ""}>${TRADE[t]}</option>`).join("")}</select></label>
        <button class="btn ghost" type="submit">Send</button></form></div>`;
  }
  function saveCheck(r, hz, src, note) {
    const from = r.hazard, fc = H[from].category, tc = H[hz].category;
    if (!note) return toast("Say what you found out, in a few words. The tenant sees it."), false;
    if (fc === "immediate" && tc !== "immediate" && !SAW_OR_SPOKE.includes(src))
      return toast("To lower a dangerous repair, someone must have spoken to the tenant or seen it. Phone them, or ask the housing officer to look."), false;
    const U = checksAll(); (U[r.id] = U[r.id] || []).push({ at: new Date().toISOString(), day: today(), from, to: hz, from_cat: fc, to_cat: tc, source: src, note });
    store("rn-urgency", U);
    recordUpdate(r, from === hz ? "confirmed" : "changed", { from_hazard: from, to_hazard: hz, from_category: fc, to_category: tc, source: src, reason: note }, "urgency");
    toast(from === hz ? "Checked: no change." : tc === "immediate" && fc !== "immediate" ? "Now dangerous: the maintenance officer is called to make it safe today." : `Changed to ${CAT[tc].toLowerCase()}. The tenant sees why.`);
    return true;
  }
  function saveAssign(r, who, trade, accepted_by) {
    const A = assignsAll();
    const mode = who.startsWith("crew:") ? "crew" : who;
    A[r.id] = { mode, crew: mode === "crew" ? who.slice(5) : undefined, trade, at: new Date().toISOString(), day: today(), accepted_by };
    store("rn-assign", A);
    recordUpdate(r, mode, { crew: A[r.id].crew, trade }, "assign");
  }
  function openJob(id, focus) {
    const r = rows().find((x) => x.id === id); if (!r) return; state.job = id;
    $$("#coord .row").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === id)));
    const d = $("#detail"); const j = r.intake;
    d.innerHTML = `<button class="iconbtn closebtn" aria-label="Close">✕</button><div class="detail">
      <div><span class="eyebrow">${esc(r.place)} · ${TRADE[r.trade]}</span><h2 style="margin-top:4px">${esc(H[r.hazard].label)}</h2></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${r.category}">${CAT[r.category]}</span><span class="chip ${codeOf(r)}">${REASON[codeOf(r)]}</span>${dueChip(r)}${tierChip(r)}
        ${r.needs_human ? '<span class="chip person">A person checked the report</span>' : ""}${r.run ? '<span class="chip hex">On a shared trip</span>' : ""}
        ${r.made_safe != null ? `<span class="chip booked">Made safe ${dateOf(r.made_safe)}</span>` : ""}${r.came_back != null ? `<span class="chip cut">Came back ${days(r.came_back)} after a fix</span>` : ""}
        ${r.merged_into ? `<span class="chip hex">Reported twice: joined to ${esc(r.merged_into)}</span>` : ""}</div>
        ${j ? `<p class="note">Logged by ${esc(INTAKE_WHO[j.who])} · first told us ${dateOf(j.day)}${j.language && j.language !== "English" ? ` · speaks ${esc(j.language)}` : ""}${j.interpreter && j.interpreter !== "none" ? ` · ${esc(INTERP[j.interpreter])}` : ""}.</p>` : ""}
        ${(r.history || []).length ? `<p class="note">House ${r.house} this year: ${r.history.map(([dd, hz, fx]) => `${esc(H[hz].label.toLowerCase())} (${dateOf(dd)}, ${fx != null ? "fixed" : "open"})`).join("; ")}.</p>` : ""}
      <p class="quote">“${esc(r.text)}”</p>
      <div><b>Need ${r.score.total} points</b><p class="note" style="margin:2px 0 6px">Worked out only from the fault, who lives there and how long it has waited. Distance, cost, how the tenant reported it and how much they said are never part of it.</p>${scoreBars(r.score)}</div>
      ${priorityHTML(r)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ghost" id="fly">Show the house</button><button class="btn ghost" id="pdf">Save as PDF</button></div>
      ${checkHTML(r)}
      ${assignHTML(r)}
      <div class="say"><span class="eyebrow">What the tenant is told</span>${sections(r, false)}</div></div>`;
    d.classList.remove("hide");
    $(".closebtn", d).addEventListener("click", () => { d.classList.add("hide"); state.job = null; showHouses([]); });
    $("#fly", d).addEventListener("click", () => flyToJob(r));
    $("#pdf", d).addEventListener("click", () => pdfJob(r, false));
    const cf = $("#checkf", d);
    cf.addEventListener("submit", (e) => { e.preventDefault(); if (saveCheck(r, cf.hz.value, cf.src.value, cf.note.value.trim())) { renderAll(); openJob(id); } });
    const af = $("#assignf", d);
    if (af) af.addEventListener("submit", (e) => {
      e.preventDefault(); const who = $("input[name=who]:checked", af).value; saveAssign(r, who, af.trade.value);
      toast(who === "open" ? `Offered to any ${TRADE_WORD[af.trade.value]}. The first to accept gets it; you'll see who.` : who === "next" ? "Back in line for the next trip. It keeps its waiting time." : `Given to ${who.slice(5)}.`);
      renderAll(); openJob(id);
    });
    if (focus) { const el = $("#" + focus, d); if (el) { el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); const f = $("select, input", el); if (f) f.focus({ preventScroll: true }); } }
  }

  // ---------------------------------------------------------------- reader (JS port of the phrase rules)
  const RX = Object.fromEntries(Object.entries(H).map(([k, v]) => [k, v.patterns.map((p) => new RegExp(p))]));
  const MX = Object.fromEntries(Object.entries(RN.taxonomy.modifiers).map(([k, v]) => [k, v.patterns.map((p) => new RegExp(p))]));
  const RANK = { immediate: 0, urgent: 1, routine: 2 };
  const norm = (t) => t.toLowerCase().replace(/[’`]/g, "'").replace(/\bpls\b|\bplz\b/g, "please").replace(/\s+/g, " ").trim();
  function readReport(text) {
    const t = norm(text), hits = {}, mods = {};
    for (const [k, ps] of Object.entries(RX)) for (const p of ps) { const m = t.match(p); if (m) { hits[k] = m[0]; break; } }
    for (const [k, ps] of Object.entries(MX)) for (const p of ps) { const m = t.match(p); if (m) { mods[k] = m[0]; break; } }
    if (mods.tier1) delete mods.vulnerable;
    const ks = Object.keys(hits).sort((a, b) => RANK[H[a].category] - RANK[H[b].category] || H[b].harm - H[a].harm);
    return { primary: ks[0] || null, all: ks, hits, mods };
  }
  const SAMPLES = ["water coming through the ceiling onto the power point, sparks when it rains. nana and the kids sleep there",
    "toilet blocked pls come", "sewage coming up in the yard, 12 people living here", "no hot water for the baby, rang last week and nobody came",
    "smells like gas inside the house", "front door kicked in won't lock", "cockroaches everywhere in the kitchen", "pls come"];

  // ---------------------------------------------------------------- NEW REPORT: whoever the tenant told logs it, with the same questions every time
  const INTAKE_WHO = { line: "the repairs line (1800 104 076)", cho: "the Community Housing Officer", rhmo: "the maintenance officer",
                       trade: "a tradesperson on site", app: "the tenant, in the app", counter: "the front counter" };
  const LANGS = ["English", "Kriol", "Aboriginal English", "Yolŋu Matha", "Warlpiri", "Arrernte", "Murrinh-Patha", "Tiwi", "Another Aboriginal language",
                 "Yumplatok (Torres Strait Creole)", "Another language", "Auslan"];
  const INTERP = { none: "No interpreter needed", ais: "Aboriginal Interpreter Service", tis: "TIS National (other languages)", nrs: "National Relay Service", family: "Family or a friend helped" };
  const INTERP_WITH = { ais: "an Aboriginal Interpreter Service interpreter", tis: "a TIS National interpreter", nrs: "the National Relay Service", family: "help from family or a friend" };
  const Q = RN.taxonomy.intake_questions || [];
  const TIER1_Q = ["life_support", "baby_elder"], TIER2_Q = ["child_mobility"];
  const hashN = (t) => [...String(t)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  function recordOf(site, house) {   // a made-up tenancy record: household size and bedrooms (production: the Tenancy Management System)
    const h = hashN(site + "#" + house); const bedrooms = 2 + (h % 3); const c = comById[site];
    const crowded = (h >>> 3) % 100 < (c ? c.overcrowded_pct : 10);
    return { bedrooms, people: crowded ? bedrooms * 2 + 1 + ((h >>> 9) % 4) : bedrooms + ((h >>> 9) % (bedrooms + 1)) };
  }
  function houseFacts(site, house, hz) {
    const mine = baseRows().filter((r) => r.site === site && r.house === house);
    const open = hz && mine.find((r) => r.hazard === hz && !r.done);
    const hist = mine.flatMap((r) => r.history || []);
    const recent = hz && hist.some(([d, h2, fx]) => h2 === hz && fx != null && today() - fx <= 90);
    return { open, recent: !!recent, history: mine.length ? mine[0].history || [] : [], cell: mine.length ? mine[0].cell : null };
  }
  function household(words, answers, record, recent) {   // intake.household(), line for line
    const src = { tier1: [], vulnerable: [], crowded: [], repeat: [] };
    if (TIER1_Q.some((q) => answers[q] === "yes")) src.tier1.push("answer");
    if (TIER2_Q.some((q) => answers[q] === "yes")) src.vulnerable.push("answer");
    const ppl = Number(answers.people) || record.people;
    if (ppl && record.bedrooms && ppl / record.bedrooms > RN.triage.crowded_people_per_bedroom) src.crowded.push(Number(answers.people) ? "answer" : "record");
    if (recent) src.repeat.push("history");
    if (answers.before === "yes") src.repeat.push("answer");
    Object.keys(src).forEach((k) => { if (words[k]) src[k].push("words"); });
    const unanswered = Q.map((q) => q.id).filter((q) => q !== "people" && (!answers[q] || answers[q] === "unknown"));
    const mods = Object.fromEntries(Object.entries(src).filter(([, v]) => v.length).map(([k]) => [k, 1]));
    if (mods.tier1) { delete mods.vulnerable; delete src.vulnerable; }   // one tier per household: the highest counts
    return { mods, src, unanswered };
  }
  const SRC_WORD = { answer: "an answer to the questions", record: "the tenancy record", history: "the house's job history", words: "the tenant's words" };
  function readerHTML(opts = {}) {
    const coms = RN.communities.filter((c) => c.hub === RN.hub).sort((a, b) => a.name.localeCompare(b.name));
    const yn = (id) => `<span class="yn" role="radiogroup" aria-label="${esc(id)}">${[["yes", "Yes"], ["no", "No"], ["unknown", "Not asked"]].map(([v, l]) =>
      `<label><input type="radio" name="q_${id}" value="${v}"${v === "unknown" ? " checked" : ""}><span>${l}</span></label>`).join("")}</span>`;
    return (opts.officer ? "" : guide("intake", `<b>Log a report.</b> Whoever the tenant told logs it here: the repairs line, the Community Housing Officer, the maintenance officer, a tradesperson on site, or the tenant in the app. Everyone is asked the same short questions, so nobody gets fewer points for saying less, for their English, or for how they got in touch.`))
      + `<form class="form" id="intakef" style="padding:0 6px">
        <div class="two"><label class="field-label">Who is logging it<select name="who">${Object.entries(INTAKE_WHO).map(([k, v]) => `<option value="${k}"${k === (opts.who || "line") ? " selected" : ""}>${esc(v[0].toUpperCase() + v.slice(1))}</option>`).join("")}</select></label>
          <label class="field-label">When did they first tell anyone?<select name="back">${["Today", "Yesterday", "2 days ago", "3 days ago", "4 days ago", "5 days ago", "6 days ago", "A week ago"].map((l, i) => `<option value="${i}">${l}</option>`).join("")}</select></label></div>
        <p class="note" style="margin-top:-4px">The clock starts when the tenant first told anyone, not when it is typed in.</p>
        <div class="two"><label class="field-label">Community<select name="site">${coms.map((c) => `<option value="${c.cid}"${c.cid === (opts.site || (coms.find((x) => x.name === "Ngukurr") || coms[0]).cid) ? " selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="TOWN">${esc(RN.hub)} (town)</option></select></label>
          <label class="field-label">House number<input type="number" name="house" min="1" max="999" value="12"></label></div>
        <div class="two"><label class="field-label">Language they speak<select name="lang">${LANGS.map((l) => `<option>${esc(l)}</option>`).join("")}</select></label>
          <label class="field-label">Interpreter<select name="interp">${Object.entries(INTERP).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label></div>
        <p class="note" style="margin-top:-4px">Language and interpreter are only used to book an interpreter next time. They are never part of the score.</p>
        <label class="field-label" for="rtext">What the tenant said, in their words (or the interpreter's)</label><textarea id="rtext" name="text" maxlength="1000">${esc(SAMPLES[1])}</textarea>
        <div class="filters">${SAMPLES.map((t, i) => `<button type="button" data-s="${i}">${esc(t.length > 26 ? t.slice(0, 24) + "…" : t)}</button>`).join("")}</div>
        <fieldset><legend class="field-label">Ask every time, the same way</legend>
          ${Q.map((q) => `<div class="qa"><span>${esc(q.ask)}</span>${q.id === "people" ? `<input type="number" name="q_people" min="1" max="40" style="width:76px" aria-label="How many people">` : yn(q.id)}</div>`).join("")}
          <p class="note" id="recnote"></p></fieldset>
        <div id="rout"></div>
        <label class="field-label">The fault<select name="hz"><option value="">Pick it if the reading is wrong or missing</option>${["immediate", "urgent", "routine"].map((c) => `<optgroup label="${CAT[c]}">${Object.entries(H).filter(([, h]) => h.category === c).map(([k, h]) => `<option value="${k}">${esc(h.label)}</option>`).join("")}</optgroup>`).join("")}</select></label>
        <button class="btn primary" type="submit" id="iadd">Add to the line</button>
      </form>`;
  }
  function intakeState(f) {
    const answers = Object.fromEntries(Q.map((q) => [q.id, q.id === "people" ? (f.q_people.value ? Number(f.q_people.value) : null) : (($("input[name=q_" + q.id + "]:checked", f) || {}).value || "unknown")]));
    const r = readReport(f.text.value); const picked = f.hz.value; const hz = picked || r.primary;
    const site = f.site.value, house = Math.max(1, Math.min(999, Number(f.house.value) || 1));
    const record = recordOf(site, house); const facts = houseFacts(site, house, hz);
    const hh = household(r.mods, answers, record, facts.recent);
    const tier = tierOf(hh.mods), cat = hz ? catOf(hz, tier) : null;
    const reasons = [];
    if (!hz) reasons.push("We couldn't read the fault. Pick it above, or a person calls the tenant back to ask.");
    if (picked && picked !== r.primary) reasons.push("A person picked the fault, so it counts as checked by a person.");
    if (hz && cat === "immediate" && H[hz].category !== "immediate") reasons.push("Someone there needs power, cooling or medical supplies, or there is a baby or a frail elder, so losing this is treated as dangerous. A person calls today.");
    if (hz && cat !== "immediate" && (r.mods.danger_words || answers.danger_now === "yes")) reasons.push(answers.danger_now === "yes" ? "They said someone is in danger now. A person calls today to check if it's dangerous." : `They said “${r.mods.danger_words}”. A person calls today to check it's safe.`);
    if (hz && cat === "immediate" && r.mods.negation) reasons.push(`They also said “${r.mods.negation}”. It stays dangerous until a person has checked.`);
    if (hz && cat === "immediate") reasons.push("Dangerous: confirmed by phone and made safe today by the maintenance officer.");
    const needs_human = !r.primary || (picked && picked !== r.primary) || reasons.some((x) => /calls today|stays dangerous/.test(x));
    return { answers, r, hz, site, house, record, facts, hh, tier, cat, reasons, needs_human, back: Number(f.back.value) };
  }
  function bindReader(root = $("#coord-body"), opts = {}) {
    bindGuides(root);
    const f = $("#intakef", root); const out = $("#rout", root); const add = $("#iadd", root);
    const go = () => {
      const S = intakeState(f); const { r, hz, hh, record, facts } = S;
      $("#recnote", root).textContent = `Tenancy record for house ${S.house}: ${record.people} people, ${record.bedrooms} bedrooms. Change the number above if it has changed.`;
      f.q_people.placeholder = record.people;
      if (!hz) { out.innerHTML = `<div class="card"><b>Not sure what this is</b><p class="note" style="margin-top:4px">Pick the fault below, or log it and a person calls the tenant back to ask.</p></div>`; add.disabled = true; return; }
      add.disabled = false;
      const h = H[hz], cat = S.cat; const wt = tierOf(r.mods);
      const sc = needScore(hz, tierPts(S.tier) + (hh.mods.crowded ? RN.triage.crowded_points : 0), hh.mods.repeat ? RN.triage.repeat_points : 0, S.back, 0, cat);
      const wordsOnly = needScore(hz, tierPts(wt) + (r.mods.crowded ? RN.triage.crowded_points : 0), r.mods.repeat ? RN.triage.repeat_points : 0, S.back, 0, catOf(hz, wt));
      const clock = cat === "immediate" ? "Made safe today by the maintenance officer, then fixed within 2 business days" : cat === "urgent" ? "Within 2 business days, in town or out bush (the official remote rule allows 5)" : "Within 10 business days, in town or out bush (the official remote rule allows 25)";
      const who = { tier1: `Tier 1, life-preservation (+${tierPts(1)})`, vulnerable: `Tier 2, young children, pregnancy, illness or mobility (+${RN.triage.vulnerable_points})`, crowded: "The house is crowded", repeat: "Reported before" };
      out.innerHTML = `<div class="card" style="display:grid;gap:10px">
        <div style="display:flex;gap:10px;align-items:center"><div class="avatar">${icon(h.trade, 22)}</div><div><b style="font-size:17px">${esc(h.label)}</b><div><span class="chip ${cat}">${CAT[cat]}</span>${S.tier < 3 ? ` <span class="chip person">Tier ${S.tier}</span>` : ""}</div></div></div>
        ${r.all.length ? `<div class="note">Words it picked up: ${r.all.map((k) => `“<b style="color:var(--ink)">${esc(r.hits[k])}</b>” (${esc(H[k].label.toLowerCase())})`).join(", ")}</div>` : ""}
        <div><b>When it should be fixed</b><p class="note">${clock}. The clock started ${S.back ? dateOf(today() - S.back) : "today"}.</p></div>
        <div><b>Need ${sc.total} points</b><p class="note">${Object.keys(hh.mods).length ? Object.keys(hh.mods).map((k) => `${who[k]}: from ${hh.src[k].map((x) => SRC_WORD[x]).join(" and ")}.`).join(" ") : "Nothing about the household adds points yet."}
          ${sc.total > wordsOnly.total ? ` From their words alone it would be ${wordsOnly.total}: the questions stop them losing ${sc.total - wordsOnly.total} points for saying less.` : ""}</p></div>
        ${hh.unanswered.length ? `<p class="note"><span class="chip person">Call back</span> Not asked yet: ${hh.unanswered.map((q) => esc((Q.find((x) => x.id === q) || {}).ask || q).replace(/\s*\(.*\)$/, "").toLowerCase()).join("; ")}. Unanswered questions never take points away.</p>` : ""}
        ${facts.open ? `<p class="note"><span class="chip hex">Already open</span> This fault is already open for house ${S.house} as job ${esc(facts.open.id)}. Adding it joins the two: one visit fixes both.</p>` : ""}
        ${S.reasons.map((x) => `<p class="note"><span class="chip person">A person</span> ${esc(x)}</p>`).join("")}</div>`;
      add.textContent = facts.open ? `Join it to job ${facts.open.id}` : "Add to the line";
    };
    f.addEventListener("input", go); f.addEventListener("change", go);
    $$("[data-s]", f).forEach((b) => b.addEventListener("click", () => { f.text.value = SAMPLES[b.dataset.s]; go(); }));
    f.addEventListener("submit", (e) => {
      e.preventDefault(); const S = intakeState(f); if (!S.hz) return toast("Pick the fault first, or ask a person to call back.");
      if (!f.text.value.trim()) return toast("Write down what the tenant said, in their words.");
      const list = store("rn-intake") || []; const id = "N" + String(list.length + 1).padStart(4, "0");
      const c = comById[S.site]; const lat = c ? c.lat : hub.lat, lon = c ? c.lon : hub.lon;
      const ring = h3.gridDisk(h3.latLngToCell(lat, lon, 10), 2);
      const ex = tierPts(S.tier) + (S.hh.mods.crowded ? RN.triage.crowded_points : 0);
      const j = { id, week: state.week, who: f.who.value, day: today() - S.back, site: S.site, place: c ? c.name : `${RN.hub} (town)`, house: S.house,
        cell: S.facts.cell || ring[S.house % ring.length], language: f.lang.value, interpreter: f.interp.value, text: f.text.value.trim(), hazard: S.hz,
        answers: S.answers, mods: S.hh.mods, sources: S.hh.src, exposure: ex, repeat: S.hh.mods.repeat ? RN.triage.repeat_points : 0,
        needs_human: S.needs_human, unanswered: S.hh.unanswered, history: S.facts.history, at: new Date().toISOString(),
        joined_to: S.facts.open ? S.facts.open.id : undefined };
      list.push(j); store("rn-intake", list);
      recordUpdate({ id, trade: H[S.hz].trade, place: j.place }, "new", { channel: j.who, words: j.text, language: j.language, interpreter: j.interpreter,
        answers: j.answers, hazard: j.hazard, first_contact_day: j.day, joined_to: j.joined_to }, "intake");
      if (j.joined_to) { toast(`Joined to job ${j.joined_to}: one visit fixes both.`); if (opts.onDone) return opts.onDone(j); state.tab = "queue"; state.filter = "all"; renderAll(); openJob(j.joined_to); return; }
      toast(S.cat === "immediate" ? "Added. Dangerous: the maintenance officer is called to make it safe today." : "Added. It goes into next week's plan, with its clock already running.");
      if (opts.onDone) return opts.onDone(j);
      state.tab = "queue"; state.filter = S.site === "TOWN" ? "town" : S.site; renderAll(); openJob(id);
    });
    go();
  }

  // ================================================================ COMPARE SETTINGS (trade-off sheet)
  function openSheet(id) { $("#" + id).classList.add("open"); $("#" + id).setAttribute("aria-hidden", "false"); $("#scrim").classList.add("open"); if (id === "tradeoff") renderTradeoff(); if (id === "about") renderAbout(); }
  function closeSheets() { $$(".sheet").forEach((s) => { s.classList.remove("open"); s.setAttribute("aria-hidden", "true"); }); $("#scrim").classList.remove("open"); }
  const METRIC = {
    harm_days_total: { name: "Days living with a fault", fmt: (v) => Math.round(v / 1000) + "k", help: "Every day a household lives with an unfixed fault adds up. Dangerous faults count more than small ones." },
    urgent_p90_remote: { name: "Days until 9 in 10 urgent remote repairs are fixed", fmt: (v) => Math.round(v) + " d", help: "Out of every 10 urgent repairs in remote communities, 9 are fixed within this many days." },
    overdue_equal_remote: { name: "Urgent remote repairs fixed late", fmt: (v) => Math.round(v * 100) + "%", help: "Share of urgent remote repairs not fixed within 2 working days, the same deadline as town." },
  };
  // The four plans in the Plan menu are named on the chart; every other setting we tested is a grey dot (hover for its name).
  const NAMED = { "guarantee_0.2_h3": ["ReachNT", "var(--hex)"], "guarantee_0.2": ["Urgent first, no sharing", "var(--accent)"],
                  floor_1: ["Cheapest, urgent on time", "var(--good)"], cheapest_1: ["Cheapest first", "var(--warn)"] };
  function chartSVG() {
    const P = Object.values(RN.policies); const m = state.metric; const MM = METRIC[m];
    const W = 640, Hh = 330, M = { l: 56, r: 24, t: 18, b: 46 };
    const xs = P.map((p) => p.cost_per_job), ys = P.map((p) => p[m]);
    const x0 = Math.floor(Math.min(...xs) / 100) * 100 - 40, x1 = Math.ceil(Math.max(...xs) / 100) * 100 + 40, y1 = Math.max(...ys) * 1.12;
    const X = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r), Y = (v) => Hh - M.b - (v / y1) * (Hh - M.t - M.b);
    let g = "";
    for (let i = 0; i <= 4; i++) { const v = (y1 / 4) * i; g += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${M.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11">${MM.fmt(v)}</text>`; }
    for (let v = Math.ceil(x0 / 100) * 100; v <= x1; v += 100) g += `<text x="${X(v)}" y="${Hh - M.b + 18}" text-anchor="middle" font-size="11">$${v}</text>`;
    g += `<text x="${(W + M.l) / 2}" y="${Hh - 6}" text-anchor="middle" font-size="12">Average cost per repair, including travel →</text>`;
    const name = (p) => (RN.plain && RN.plain[p.key]) || label(p.key) || p.label;
    P.filter((p) => !NAMED[p.key]).forEach((p) => {
      g += `<circle cx="${X(p.cost_per_job)}" cy="${Y(p[m])}" r="4" fill="var(--ink-3)" opacity=".55"><title>${esc(name(p))}: ${money(p.cost_per_job)} per repair</title></circle>`;
    });
    const named = P.filter((p) => NAMED[p.key]);
    const taken = named.map((p) => ({ x: X(p.cost_per_job) - 9, y: Y(p[m]) - 9, w: 18, h: 18 }));   // markers are off limits for labels
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    named.forEach((p) => {
      const [nm, col] = NAMED[p.key]; const cx = X(p.cost_per_job), cy = Y(p[m]); const sel = p.key === state.policy; const rr = sel ? 9 : 6.5;
      g += p.key.endsWith("_h3")
        ? `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => { const a = Math.PI / 3 * i; return (cx + rr * 1.15 * Math.cos(a)).toFixed(1) + "," + (cy + rr * 1.15 * Math.sin(a)).toFixed(1); }).join(" ")}"`
        : `<circle cx="${cx}" cy="${cy}" r="${rr}"`;
      g += ` fill="${col}" stroke="var(--glass-strong)" stroke-width="2" data-k="${p.key}" style="cursor:pointer"><title>${esc(name(p))}: ${money(p.cost_per_job)} per repair</title>${p.key.endsWith("_h3") ? "</polygon>" : "</circle>"}`;
      // first label spot that overlaps nothing: right, left, above, below, then further out
      const w = nm.length * 6.7 + 6, h = 16;
      const spots = [[12, -8], [-12 - w, -8], [-w / 2, -26], [-w / 2, 10], [12, -26], [12, 10], [-12 - w, -26], [-12 - w, 10]];
      let box = null;
      for (const [dx, dy] of spots) {
        const c = { x: cx + dx, y: cy + dy, w, h };
        if (c.x >= M.l && c.x + w <= W - M.r && c.y >= 0 && c.y + h <= Hh - M.b && !taken.some((t) => hit(c, t))) { box = c; break; }
      }
      box = box || { x: cx + 12, y: cy - 8, w, h };
      taken.push(box);
      g += `<text x="${box.x + 3}" y="${box.y + 12}" font-size="12" font-weight="${sel ? 700 : 600}" style="fill:var(--ink${sel ? "" : "-2"})">${nm}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Average cost per repair against ${esc(MM.name)} for each way of planning" style="width:100%;height:auto">${g}</svg>`;
  }
  function costsHTML() {
    const C = RN.costs; if (!C) return "";
    return `<details class="costs"><summary>How are costs worked out?</summary>
      <p>Nobody types in a price. ReachNT costs each trip from where the community is:</p>
      <ul><li><b>Distance:</b> the straight line from the trades hub (${esc(RN.hub)} in this demo), plus 20% for bends in the road, driven at about 70 km/h.</li>
      <li><b>The tradesperson's time</b>, driving included: ${money(C.labour_per_hour)} an hour.</li>
      <li><b>The vehicle:</b> $${C.vehicle_per_km.toFixed(2)} a km, there and back.</li>
      <li><b>Nights away:</b> ${money(C.overnight_per_night)} a night for communities more than 2 hours' drive out.</li>
      <li><b>A charter plane</b> when the road is cut and there is an airstrip: ${money(C.charter_per_hour)} an hour, for the flights in and out to drop off and collect the tradesperson.</li>
      <li><b>A job in town:</b> ${money(C.town_travel_per_job)} of local driving.</li></ul>
      <p>A shared trip is priced as one loop, hub → first community → second → back, instead of two return trips. The difference is the saving shown on the map.
      "Cost per repair" is the whole year's cost divided by the number of repairs done.</p>
      <p>These rates are estimates checked against a 2017 study of remote housing costs (Nous Group). A housing department would put its own contract rates in config/params.yaml.</p></details>`;
  }
  function renderTradeoff() {
    const P = RN.policies; const cur = P[state.policy]; const MM = METRIC[state.metric];
    const cards = Object.keys(RN.demo).map((k) => {
      const p = P[k];
      return `<button class="pol" data-k="${k}" aria-pressed="${k === state.policy}"><span class="eyebrow">${esc(label(k))}</span>
        <span class="n num">${money(p.cost_per_job)} <span class="m">per repair</span></span>
        <span class="m">9 in 10 urgent remote repairs fixed within <b style="color:var(--ink)">${Math.round(p.urgent_p90_remote)} days</b> (town: ${Math.round(p.urgent_p90_town)}).</span>
        <span class="m">${Math.round(p.harm_days_total / 1000)}k days living with a fault · ${money(p.total_cost / 1e6)}m a year</span></button>`;
    }).join("");
    const L = ledger();
    $("#tradeoff-body").innerHTML = `
      <div style="display:grid;gap:14px;min-width:0">
        <div class="card">
          <div class="seg" id="metric" style="margin-bottom:8px"><span class="thumb"></span>
            <button data-m="harm_days_total">Days living with a fault</button><button data-m="urgent_p90_remote">Remote wait</button><button data-m="overdue_equal_remote">Fixed late</button></div>
          <p class="note" style="margin-bottom:6px"><b style="color:var(--ink)">How to read this.</b> Each dot is one way of planning a whole year of repairs. Further right costs more per repair. Higher means ${esc(MM.name.toLowerCase())} goes up. ${esc(MM.help)} The best plans sit low and to the left.</p>
          ${chartSVG()}
          <p class="note" style="margin-top:4px">Named dots are the four plans in the Plan menu. Grey dots are ${Object.keys(RN.policies).length - 4} other settings we tested; hover over one to see its name.</p>
          ${costsHTML()}
        </div>
        <div class="card"><b>${esc(label(state.policy))}: urgent repairs by how hard the place is to reach</b>
          <div style="overflow-x:auto;margin-top:8px"><table class="tbl">
          <tr><th>Where</th><th>Repairs</th><th>Usually fixed within</th><th>9 in 10 fixed within</th><th>Fixed late</th></tr>
          ${cur.bands.map((b) => `<tr><td>${esc(b.band)}</td><td class="num">${b.jobs.toLocaleString()}</td><td class="num">${days(b.urgent_median)}</td><td class="num">${days(b.urgent_p90)}</td><td class="num">${Math.round(b.overdue_equal * 100)}%</td></tr>`).join("")}
          </table></div></div>
      </div>
      <div style="display:grid;gap:12px;align-content:start;min-width:0">
        <p class="note">ReachNT doesn't choose. The coordinator picks one of these and writes down why. When cost holds a repair back, the tenant is told about that decision.</p>
        <div class="pols">${cards}</div>
        <div><label class="field-label" for="lrole">Signed by (role)</label><input type="text" id="lrole" value="Regional maintenance coordinator, Big Rivers"></div>
        <div><label class="field-label" for="lwhy">Why, in plain words</label><textarea id="lwhy">Budget is fixed this quarter. Urgent repairs get the same deadline in town and out bush, and nearby communities share trips.</textarea></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="lsign">Sign this setting</button><button class="btn ghost" id="lcopy">Copy the record</button></div>
        <div><span class="eyebrow">Signed in this browser</span>${L.length ? L.slice().reverse().map((x) => `<p class="note" style="margin-top:6px"><b style="color:var(--ink)">${esc(label(x.policy))}</b> · ${esc(x.role)}, ${esc(x.date)}<br>${esc(x.why)}</p>`).join("") : `<p class="note" style="margin-top:4px">Nothing signed yet.</p>`}</div>
      </div>`;
    const ms = $("#metric"); seg(ms, "m", state.metric);
    $$("button", ms).forEach((b) => b.addEventListener("click", () => { state.metric = b.dataset.m; renderTradeoff(); }));
    $$(".pol, [data-k]", $("#tradeoff-body")).forEach((b) => b.addEventListener("click", () => { setPolicy(b.dataset.k); renderTradeoff(); }));
    $("#lsign").addEventListener("click", () => {
      const L2 = ledger(); const date = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
      L2.push({ policy: state.policy, role: $("#lrole").value.trim() || "Coordinator", why: $("#lwhy").value.trim(), date });
      store("rn-ledger", L2); toast("Signed. Tenants affected by cost decisions will now see your name and reason."); renderTradeoff(); renderAll();
    });
    $("#lcopy").addEventListener("click", () => {
      const p = P[state.policy];
      const txt = `ReachNT decision record\nSetting: ${label(state.policy)}\nSigned by: ${$("#lrole").value}\nReason: ${$("#lwhy").value}\nExpected (synthetic year, whole NT): ${money(p.cost_per_job)} per repair; 9 in 10 urgent remote repairs fixed within ${Math.round(p.urgent_p90_remote)} days (town ${Math.round(p.urgent_p90_town)}).`;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Record copied"), () => toast("Copy blocked here. Select the text instead."));
    });
    if (!reduce) $$("#tradeoff-body path.draw").forEach((p) => { const L3 = p.getTotalLength(); p.style.strokeDasharray = p.getAttribute("stroke-dasharray") ? "" : L3; if (!p.getAttribute("stroke-dasharray")) { p.style.strokeDashoffset = L3; p.getBoundingClientRect(); p.style.transition = "stroke-dashoffset 1.2s cubic-bezier(.32,.72,0,1)"; p.style.strokeDashoffset = 0; } });
  }

  function renderAbout() {
    const P = RN.policies; const c = P.cheapest_1, g = P["guarantee_0.2"], r = P["guarantee_0.2_h3"];
    const hexes = [[0, 0], [1, 0], [-1, 0], [0.5, 0.866], [-0.5, 0.866], [0.5, -0.866], [-0.5, -0.866]];
    $("#about-body").innerHTML = `
      <div style="display:grid;gap:14px;min-width:0">
        <div class="card big"><h3>The problem</h3><p>Sending a tradesperson to a remote community for one job costs far more than the same job in town, mostly in travel. A plan that fixes the most jobs for the money keeps choosing town. In our test year, that left 9 in 10 urgent remote repairs waiting up to ${Math.round(c.urgent_p90_remote)} days, against ${Math.round(c.urgent_p90_town)} in town. Nobody decided that on purpose.</p></div>
        <div class="card big"><h3>What ReachNT does</h3>
          <p><b>Reads the report.</b> It picks out the fault and the trade from what the tenant said. If it isn't sure, a person calls back.</p>
          <p><b>Puts the most urgent first.</b> Where someone lives never changes their place in line.</p>
          <p><b>Plans the trips.</b> Each week it works out who goes where, around road closures, airstrips and how many trades there are.</p>
          <p><b>Shares trips.</b> Two nearby communities get one visit instead of two.</p>
          <p><b>Shows the choice and asks someone to sign it.</b> Every week a repair waits, ReachNT writes down why, and the tenant can read it.</p></div>
        <div class="card big"><h3>Fair however you tell us</h3><p>Your place in line depends on the fault, who lives in the house and how long you have waited. Never on where you live, when or how you got in touch, how much you said, your English, or whether you use the app. Whoever you tell (the repairs line, your Community Housing Officer, the maintenance officer, a tradesperson, or the app) asks the same short questions, and the tenancy record and your house's repair history fill in the rest. Your clock starts the day you first told anyone. A person can check and change how urgent a repair is at any time; the computer never lowers it.</p></div>
        <div class="card big"><h3>What sharing trips changed</h3><p>With shared trips, putting urgent repairs first cost ${money(r.cost_per_job)} per repair instead of ${money(g.cost_per_job)}, and families spent fewer days living with faults (${Math.round(r.harm_days_total / 1000)}k instead of ${Math.round(g.harm_days_total / 1000)}k). The cheapest plan costs ${money(c.cost_per_job)} but leaves ${Math.round(c.harm_days_total / 1000)}k.</p></div>
      </div>
      <div style="display:grid;gap:14px;min-width:0;align-content:start">
        <div class="card big"><h3>Why hexagons</h3>
          <svg viewBox="0 0 260 120" style="width:100%;height:auto" aria-label="A hexagon has six neighbours at one distance; a square has eight at two distances">
            ${hexes.map(([dx, dy], i) => { const cx = 70 + dx * 34, cy = 60 + dy * 34; return `<polygon points="${[0, 1, 2, 3, 4, 5].map((j) => { const a = Math.PI / 3 * j + Math.PI / 6; return (cx + 19 * Math.cos(a)).toFixed(1) + "," + (cy + 19 * Math.sin(a)).toFixed(1); }).join(" ")}" fill="${i ? "var(--hex-bg)" : "var(--hex)"}" stroke="var(--hex)" stroke-width="1.5"/>`; }).join("")}
            ${[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy], i) => `<rect x="${190 + dx * 26 - 11}" y="${60 + dy * 26 - 11}" width="22" height="22" fill="${i ? (dx && dy ? "var(--warn-bg)" : "var(--accent-bg)") : "var(--accent)"}" stroke="var(--accent)"/>`).join("")}
            <text x="70" y="116" text-anchor="middle" font-size="11">6 neighbours, all the same distance</text><text x="190" y="116" text-anchor="middle" font-size="11">corners are further away</text></svg>
          <p>ReachNT uses Uber's free hexagon map grid, H3. Every hexagon's neighbours are the same distance away, so "within two hexagons" means the same distance in every direction. That keeps sharing fair between communities. It's also how a house is stored: as a small hexagon, not a street address.</p></div>
        <div class="card big"><h3>Keeping people's details safe</h3><p>Names, phone numbers and addresses are locked in one encrypted store that only intake staff can open, and every look is recorded. Everything else uses a house number and its hexagon. Tradespeople only see their own jobs.</p></div>
        <div class="card big"><h3>Works without signal</h3><p>Install ReachNT on a phone and the run sheet, map and job details stay on it. Updates are saved on the phone and sent when signal returns. Every run and repair can also be saved as a PDF.</p></div>
        <div class="card big"><h3>People check the computer</h3><p>A person checks every report that might be dangerous and every report the computer can't read with confidence, re-reads 1 in 20 of the rest each week (the Checks tab), and answers any tenant who asks for a review within 10 working days. <a href="privacy" target="_blank" rel="noopener">How ReachNT decides, what it uses, and your rights</a>.</p></div>
        <div class="card"><p class="note">${esc(RN.notice)} Imagery now: ${esc(imagery.name)}.</p></div>
      </div>`;
  }

  // ================================================================ TRADESPERSON (phone)
  function myRun() {
    const t = state.ftrade; const all = rows();
    const moved = (r) => r.assign && r.visit && r.assign.at > r.visit.at;   // missed, then sent elsewhere by the coordinator
    const mine = all.filter((r) => r.trade === t && r.done && r.site !== "TOWN" && !moved(r));
    const groups = {}; mine.forEach((r) => (groups[r.run || r.site] = groups[r.run || r.site] || []).push(r));
    const order = Object.keys(groups).sort((a, b) => comById[a.split("+")[0]].hours - comById[b.split("+")[0]].hours);
    const stops = []; order.forEach((k) => k.split("+").forEach((c) => stops.push({ cid: c, key: k, jobs: groups[k].filter((r) => r.site === c) })));
    return { groups, order, stops, town: all.filter((r) => r.trade === t && r.done && r.site === "TOWN" && !moved(r)) };
  }
  function drawField() {
    const { order, stops } = myRun(); const F2 = fieldData()[state.ftrade] || { nearby: [] }; const all = rows();
    const feats = [];
    order.forEach((k) => {
      const cs = k.split("+").map((c) => comById[c]); const air = all.find((r) => (r.run || r.site) === k && r.mode.startsWith("air"));
      let path = arc(HUBLL(), ll(cs[0])); if (cs[1]) path = path.concat(arc(ll(cs[0]), ll(cs[1]), 0.1).slice(1));
      path = path.concat(arc(ll(cs[cs.length - 1]), HUBLL()).slice(1));
      feats.push(F({ type: "LineString", coordinates: path }, { kind: air ? "air" : cs[1] ? "shared" : "road", color: cs[1] ? COL.shared : air ? COL.air : COL.booked }));
    });
    map.getSource("routes").setData(fc(feats));
    map.getSource("foot").setData(fc([]));
    stops.forEach((s, i) => badge(ll(comById[s.cid]), { n: i + 1, cls: "s-stop", name: comById[s.cid].name, sub: `${s.jobs.length} job${s.jobs.length > 1 ? "s" : ""}`, onClick: () => focusCommunity(s.cid) }));
    order.filter((k) => k.includes("+")).forEach((k) => { const [a, b] = k.split("+").map((c) => comById[c]); const p = pairOf(k); if (p) savingTag(a, b, p, true); });
    const near = {}; (F2.nearby || []).forEach((n) => { const r = all.find((x) => x.id === n.id); if (r) (near[r.site] = near[r.site] || []).push(r); });
    Object.entries(near).forEach(([cid, js]) => badge(ll(comById[cid]), { n: js.length, cls: "s-near", name: comById[cid].name, sub: "nearby, not booked", onClick: () => focusCommunity(cid) }));
    showHouses(stops.flatMap((s) => s.jobs));
    hubBadge();
  }
  function fieldMap() {
    if (!map) return; refreshMap();
    const { stops } = myRun();
    const pts = stops.map((s) => ll(comById[s.cid])).concat([HUBLL()]);
    if (pts.length < 2) { home(); return; }
    map.fitBounds(pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0])), { padding: 70, maxZoom: 9, pitch: 30, duration: reduce ? 0 : 1500 });
  }
  function renderField() {
    const el = $("#field"); const F2 = fieldData(); const all = rows();
    const trades = Object.keys(TRADE).filter((t) => F2[t]);
    if (!trades.includes(state.ftrade)) state.ftrade = trades[0];
    const t = state.ftrade; const d = F2[t] || { nearby: [] };
    const { groups, order, stops, town } = myRun();
    const status = Object.fromEntries(outbox().filter((u) => (u.kind || "visit") === "visit").map((u) => [u.id, u]));
    const stopNo = Object.fromEntries(stops.map((s, i) => [s.cid, i + 1]));
    const card = (r, nearby, offer) => {
      const st0 = status[r.id]; const st = st0 && !(r.assign && r.assign.at > st0.at) ? st0 : null;   // a reassigned job starts fresh
      const esc8 = updateOf(r.id, "escalate");
      return `<div class="job ${st ? "done" : ""}" data-id="${r.id}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h4>${stopNo[r.site] ? `<span class="stopno" title="Stop ${stopNo[r.site]} on the map">${stopNo[r.site]}</span>` : ""}${esc(H[r.hazard].label)}</h4><span class="chip ${r.category}">${CAT[r.category]}</span></div>
        <p class="quote" style="font-size:14px">“${esc(r.text)}”</p>
        <div class="meta"><span>${esc(r.place)}</span><span>·</span><span>waiting ${days(r.wait)}</span><span>·</span><span>about ${H[r.hazard].hours} h</span>${r.tier === 1 ? '<span class="chip person">Tier 1: needs power, cooling or medicine, a baby or frail elder</span>' : r.vulnerable ? '<span class="chip person">Tier 2: children, pregnancy, illness or mobility</span>' : ""}${nearby ? `<span class="chip hex">${nearby} hexagon${nearby > 1 ? "s" : ""} from your run</span>` : ""}</div>
        ${r.category === "immediate" ? `<p class="note" style="color:var(--bad)">Dangerous. ${r.made_safe != null ? `Made safe on ${dateOf(r.made_safe)} by the maintenance officer; check it is still safe before you start.` : "Check the maintenance officer made it safe before you start."}</p>` : ""}
        ${r.came_back != null ? `<p class="note"><span class="chip cut">Came back</span> The same fault was fixed here ${days(r.came_back)} before this report. Find out why the last fix didn't hold.</p>` : ""}
        ${r.merged_into ? `<p class="note"><span class="chip hex">Reported twice</span> Joined to job ${esc(r.merged_into)}: one visit fixes both.</p>` : ""}
        ${r.assign && r.assign.mode === "crew" ? `<p class="note"><span class="chip assigned">Given to ${esc(r.assign.crew)}</span> by the coordinator, ${dateOf(r.assign.day)}.</p>` : ""}
        ${r.checks && r.checks.length ? `<p class="note"><span class="chip person">Checked by a person</span> ${esc(r.checks[r.checks.length - 1].note)}</p>` : ""}
        ${offer ? `<div class="acts" style="grid-template-columns:1fr auto"><button class="btn primary" data-act="take">I'll take it</button><button class="btn ghost" data-act="map" aria-label="Show this house on the map">Map</button></div>` :
          st ? `<p class="note"><b style="color:var(--ink)">${st.status === "done" ? "Marked done" : "Not done: " + esc(st.status)}</b>${st.knocked_at ? ` at ${timeOf(st.knocked_at)} · ${esc((st.actions || []).join(", ").toLowerCase())}. The job stays open and the tenant is told` : ""} · ${st.rejected ? "not accepted, check and send again" : st.sent ? "sent" : "saved on this phone, sends when there's signal"}</p>
          ${st.status !== "done" ? `<p class="note">Your coordinator decides who goes next: the next trip, another crew, or any ${esc(TRADE_WORD[r.trade])} who can go sooner. The tenant's waiting time keeps counting.</p>` : ""}` :
          `<div class="acts"><button class="btn good" data-act="done">Done</button><button class="btn ghost" data-act="no">Couldn't do it</button><button class="btn ghost" data-act="map" aria-label="Show this house on the map">Map</button></div>
           ${esc8 ? `<p class="note"><span class="chip immediate">You said it's worse</span> The coordinator calls you back to check the urgency.</p>` : `<button class="btn ghost small worse" data-act="worse">Worse than it was reported</button>`}
           <div class="reasons" hidden>${["No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work"].map((x) => `<button data-why="${x}">${x}</button>`).join("")}</div>
           <form class="noaccess" hidden>
             <p class="note">A job is never closed because no one was home. Say when you knocked and what you tried; the tenant gets a message and the job stays in line.</p>
             <label class="field-label">Time you knocked <input type="time" name="t" required></label>
             <fieldset><legend class="field-label">What you tried (at least one)</legend>${ACCESS_STEPS.map((a) => `<label class="tick"><input type="checkbox" name="a" value="${a}"> ${a}</label>`).join("")}</fieldset>
             <label class="field-label">Note (optional) <input type="text" name="n" maxlength="300" placeholder="e.g. dogs in the yard, called twice"></label>
             <button class="btn primary" type="submit">Save visit</button>
           </form>`}
      </div>`;
    };
    const together = togetherGroups(all);
    const runCards = order.map((k) => {
      const names = k.split("+").map((c) => comById[c].name); const g = groups[k]; const p = pairOf(k); const c0 = comById[k.split("+")[0]];
      return `<div class="trip-card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(names.join(" → "))}</h3><span class="chip ${p ? "hex" : g[0].mode.startsWith("air") ? "cut" : "booked"}">${p ? "Shared trip" : g[0].mode.startsWith("air") ? "Charter flight" : "Drive"}</span></div>
        <span class="note">${g.length} job${g.length > 1 ? "s" : ""} · ${g[0].mode.startsWith("air") ? "flight" : c0.hours + " h drive"} from ${esc(RN.hub)}${p ? `, then ${Math.round(p.km)} km to ${esc(names[1])}. One trip instead of two saves about ${money(p.saving)}.` : ""}</span>
        ${(() => { const tg = together.find((x) => x.k === k); if (!tg) return ""; const others = tg.trades.filter((x) => x !== t);
          return `<p class="note" style="margin-top:6px"><span class="chip hex">Travelling together</span> with the ${esc(others.map((x) => TRADE_WORD[x]).join(" and "))} (${esc(others.map((x) => ((RN.crews || {})[x] || [""])[0]).join(", "))}). ${tg.mode.startsWith("air") ? "One charter" : "One ute"} instead of ${tg.trades.length} saves about ${money(tg.saving)}.</p>`; })()}</div>`
        + g.sort((a, b) => b.score.total - a.score.total).map((r) => card(r)).join("");
    }).join("");
    const near = (d.nearby || []).map((x) => ({ r: all.find((y) => y.id === x.id), k: x.rings })).filter((x) => x.r && !x.r.assign);
    const given = all.filter((r) => r.trade === t && r.assign && (!r.done || r.visit) && (r.assign.mode === "crew" || r.assign.accepted_by));
    const offers = all.filter((r) => r.trade === t && r.assign && r.assign.mode === "open" && !r.assign.accepted_by);
    el.innerHTML = `<div class="grabber"></div><div class="app-head">
        <div class="who"><div class="avatar">${icon(t, 24)}</div><div><h2>${TRADE[t]}</h2><p>${esc(RN.hub)} · week of ${dateOf(+state.week * 7)}</p></div></div>
        <div class="net-slot">${netHTML()}</div>
        <div class="filters">${trades.map((x) => `<button data-t="${x}" aria-pressed="${x === t}">${TRADE_SHORT[x]}</button>`).join("")}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ghost" id="fpdf">Save run sheet (PDF)</button><button class="btn ghost" id="foff">Keep map on phone</button></div>
      </div>
      <div class="panel-body">
        ${guide("field", `<b>Your week.</b> The map shows only your stops, numbered in order. A blue line means a shared trip: you visit two communities on one trip. Tap Done or Couldn't do it on each job. With no signal it's saved on your phone and sent later.`)}
        ${order.length ? `<div class="section-title"><h3>This week's trip</h3><span class="note">${stops.reduce((a, s) => a + s.jobs.length, 0)} jobs in ${stops.length} place${stops.length > 1 ? "s" : ""}</span></div>${runCards}` :
          `<div class="trip-card"><h3>No community trip this week</h3><span class="note">You're on ${esc(RN.hub)} town jobs.</span></div>`}
        ${town.length ? `<div class="section-title"><h3>${esc(RN.hub)} town</h3><span class="note">${town.length} jobs</span></div>${town.slice(0, 6).map((r) => card(r)).join("")}${town.length > 6 ? `<p class="note" style="padding:4px">and ${town.length - 6} more</p>` : ""}` : ""}
        ${given.length ? `<div class="section-title"><h3>Given to your crew</h3><span class="note">${given.length}</span></div><p class="note" style="padding:0 4px 8px">The coordinator sent these to you, or you took them. Each keeps its waiting time.</p>${given.map((x) => card(x)).join("")}` : ""}
        ${offers.length ? `<div class="section-title"><h3>Open jobs you can take</h3><span class="note">${offers.length}</span></div><p class="note" style="padding:0 4px 8px">Missed visits the coordinator opened to any ${esc(TRADE_WORD[t])} on the panel. The first to accept gets it.</p>${offers.map((x) => card(x, 0, true)).join("")}` : ""}
        ${near.length ? `<div class="section-title"><h3>Nearby, if you have time</h3></div><p class="note" style="padding:0 4px 8px">Open ${TRADE_SHORT[t].toLowerCase()} jobs close to your trip. Call the coordinator before you go; they stay in the line until someone does.</p>${near.map((x) => card(x.r, x.k)).join("")}` : ""}
      </div>`;
    bindGuides(el);
    $$(".filters button", el).forEach((b) => b.addEventListener("click", () => { state.ftrade = b.dataset.t; renderField(); fieldMap(); }));
    $("#fpdf", el).addEventListener("click", pdfRun);
    $("#foff", el).addEventListener("click", keepMapOffline);
    $$(".job", el).forEach((j, i) => {
      j.style.animationDelay = reduce ? "0ms" : Math.min(i, 10) * 30 + "ms";
      const id = j.dataset.id; const r = all.find((x) => x.id === id);
      $$("[data-act]", j).forEach((b) => b.addEventListener("click", () => {
        if (b.dataset.act === "done") { recordUpdate(r, "done"); toast(navigator.onLine ? "Marked done" : "Marked done. Saved on your phone until there's signal."); renderField(); }
        if (b.dataset.act === "no") $(".reasons", j).hidden = !$(".reasons", j).hidden;
        if (b.dataset.act === "map") flyToJob(r);
        if (b.dataset.act === "worse") { recordUpdate(r, "worse", { from: "tradesperson" }, "escalate"); toast("Coordinator told. If it is dangerous now, make it safe or leave, and call 1800 104 076."); renderField(); }
        if (b.dataset.act === "take") {
          const me = ((RN.crews || {})[r.trade] || [TRADE[r.trade]])[0];
          const A = assignsAll(); if (A[r.id] && A[r.id].accepted_by) { toast(`${A[r.id].accepted_by} already took it.`); return renderField(); }
          saveAssign(r, "open", r.trade, me); recordUpdate(r, "accepted", { crew: me }, "accept");
          toast("It's yours. The coordinator and the tenant are told."); renderAll();
        }
      }));
      $$("[data-why]", j).forEach((b) => b.addEventListener("click", () => {
        if (NO_ACCESS.includes(b.dataset.why)) {   // evidence first, then save
          const f = $(".noaccess", j); f.hidden = false; f.dataset.why = b.dataset.why;
          const now = new Date(); f.t.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; f.t.focus(); return;
        }
        recordUpdate(r, b.dataset.why); toast("Reason saved: " + b.dataset.why); renderField();
      }));
      const f = $(".noaccess", j);
      if (f) f.addEventListener("submit", (e) => {
        e.preventDefault();
        const actions = $$("input[name=a]:checked", f).map((x) => x.value);
        if (!actions.length) return toast("Tick at least one thing you tried, so the tenant knows we came.");
        const [hh, mm] = f.t.value.split(":").map(Number); const k = new Date(); k.setHours(hh, mm, 0, 0);
        recordUpdate(r, f.dataset.why, { knocked_at: k.toISOString(), actions, note: f.n.value.trim() || undefined });
        toast("Visit saved. The job stays open for your next trip, and the tenant gets a message."); renderField();
      });
    });
  }
  function lon2x(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
  function lat2y(lat, z) { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); }
  function keepMapOffline() {
    if (!imagery.crisp) return toast("This map is already stored on your phone.");
    if (!canSW || !navigator.serviceWorker.controller) return toast("Open ReachNT from its web address and install it to keep maps offline.");
    const tpl = imagery.src.tiles[0]; const urls = new Set();
    const { stops } = myRun();
    stops.forEach((s) => { const c = comById[s.cid];
      for (let z = 8; z <= 16; z++) { const r = z <= 12 ? 1 : 2; const x0 = lon2x(c.lon - 0.02 * r, z), x1 = lon2x(c.lon + 0.02 * r, z), y0 = lat2y(c.lat + 0.02 * r, z), y1 = lat2y(c.lat - 0.02 * r, z);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.add(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y)); } });
    navigator.serviceWorker.controller.postMessage({ type: "cache-tiles", urls: [...urls] });
    toast(`Saving ${urls.size} map pieces for your stops. You can close this.`);
  }

  // ================================================================ TENANT (phone)
  function renderTenant() {
    const el = $("#tenant"); const all = rows();
    const places = [...new Set(all.filter((r) => r.site !== "TOWN").map((r) => r.place))].sort();
    if (!state.place || !places.includes(state.place)) state.place = places.includes("Ngukurr") ? "Ngukurr" : places[0];
    const jobs = all.filter((r) => r.place === state.place).sort((a, b) => b.wait - a.wait);
    const r = jobs.find((x) => x.id === state.tjob) || jobs[0]; state.tjob = r ? r.id : null;
    if (!r) { el.innerHTML = ""; return; }
    const runs = [];
    (r.reasons || []).forEach(([w, code, cost, mode]) => {
      let g = runs.find((x) => x.code === code); if (!g) runs.push((g = { code, from: w, to: w, n: 0, cost: 0, mode }));
      g.n += 1; g.to = Math.max(g.to, w); g.from = Math.min(g.from, w); g.cost = Math.max(g.cost, cost || 0); g.mode = mode || g.mode;
    });
    runs.sort((a, b) => a.from - b.from);
    const trade = TRADE[r.trade].toLowerCase();
    const say = { travel_cost: (x) => `No ${trade} was sent to ${esc(r.place)}. A trip costs about ${money(x.cost)} by ${x.mode && x.mode.startsWith("air") ? "plane" : "road"}. That was a cost decision.`,
                  crew_full: () => `Every ${trade} was busy with repairs more urgent than yours.`, cut: () => `The road was cut and there was no way to fly someone in.`,
                  lower_priority: () => `${an(trade, true)} was nearby but did more urgent repairs first.` };
    const visit = updateOf(r.id, "visit"), review = updateOf(r.id, "review"), confirm = updateOf(r.id, "confirm"), worse = updateOf(r.id, "escalate");
    const missed = !!(visit && visit.status !== "done");
    const as = r.assign && (!visit || r.assign.at > visit.at) ? r.assign : null;
    const tw = TRADE_WORD[r.trade];
    const checkSteps = (r.checks || []).map((c) => ({ cls: "ok", t: `A person checked it, ${dateOf(c.day)}`,
      p: `${esc(CHECK_SOURCES[c.source])}. ${c.from === c.to ? `It is still ${esc(CAT_WORD[c.to_cat])}.` : `Changed from ${esc(H[c.from].label.toLowerCase())} (${esc(CAT_WORD[c.from_cat])}) to ${esc(H[c.to].label.toLowerCase())} (${esc(CAT_WORD[c.to_cat])}).`} “${esc(c.note)}”` }));
    const asStep = as ? [{ cls: "ok", t: as.mode === "next" ? "Back in line for the next trip" : as.mode === "crew" ? `Given to another ${esc(tw)}` : as.accepted_by ? `${an(tw, true)} took it` : `Offered to any ${esc(tw)} who can come sooner`,
      p: `${dateOf(as.day)}. Your repair keeps its place and its waiting time.${as.mode === "open" && !as.accepted_by ? " We'll tell you who is coming." : ""}` }] : [];
    const viaCho = (u) => (u && u.via === "cho" ? " Your housing officer recorded this for you." : "");
    const worseStep = worse && !(r.checks || []).some((c) => c.at > worse.at) ? [{ cls: "wait", t: worse.from === "cho" ? "Your housing officer told us it got worse" : "You told us it got worse", p: "A person calls you back today and checks how urgent it is. If anyone is in danger now, call 000." }] : [];
    const confirmStep = confirm ? [{ cls: confirm.status === "fixed" ? "ok" : "wait", t: confirm.status === "fixed" ? "You told us it's fixed" : "You told us it's still broken",
      p: (confirm.status === "fixed" ? "Thank you." : `It's back in line with ${REWORK} extra points, and it keeps the day you first reported it, so it goes on the next trip.`) + viaCho(confirm) }] : [];
    const reviewStep = review ? [{ cls: "wait", t: "You asked for a review", p: `A person answers within 10 working days.${viaCho(review)}` }] : [];
    const how = r.intake ? ` Through ${esc(INTAKE_WHO[r.intake.who])}${INTERP_WITH[r.intake.interpreter] ? `, with ${INTERP_WITH[r.intake.interpreter]}` : ""}.` : "";
    const steps = [
      { cls: "ok", t: `Reported ${dateOf(r.day)}`, p: `You said: “${esc(r.text)}”${how}` },
      { cls: "ok", t: `We read it as ${esc(H[r.hazard].label.toLowerCase())}`, p: `${CAT[r.category]} repair.${r.needs_human ? " A person checked it." : ""}` },
      ...(r.made_safe != null ? [{ cls: "ok", t: `Made safe ${dateOf(r.made_safe)}`, p: "The maintenance officer made it safe the day you reported it. Fixing it properly is the next step." }] : []),
      ...(r.merged_into ? [{ cls: "ok", t: "Joined to your earlier report", p: "This fault was already reported for your house. One visit fixes both." }] : []),
      ...runs.map((x) => ({ cls: "wait", t: `${x.n} week${x.n > 1 ? "s" : ""}, ${x.n > 1 ? `${dateOf(x.from * 7)} to ${dateOf(x.to * 7 + 6)}` : `week of ${dateOf(x.from * 7)}`}`, p: say[x.code] ? say[x.code](x) : esc(x.code) })),
      ...(visit && NO_ACCESS.includes(visit.status) ? [{ cls: "wait", t: `${an(trade, true)} came at ${timeOf(visit.knocked_at)}`, p: `${esc(visit.status)}. They ${esc(visit.actions.join(", ").toLowerCase())}. Your repair stays in line.` }]
        : missed ? [{ cls: "wait", t: `${an(trade, true)} came but couldn't finish`, p: `${esc(visit.status)}. Your repair stays in line.` }] : []),
      ...confirmStep, ...asStep, ...checkSteps, ...worseStep, ...reviewStep,
      (missed || r.rework) ? { cls: "now", t: as && (as.mode === "crew" || as.accepted_by) ? `Booked with another ${esc(tw)}` : "Booked for the next trip", p: `We'll tell you the day. Your waiting time keeps counting. If it gets worse before then, call 1800 104 076.` }
        : r.done ? { cls: "now", t: "Booked this week", p: `${an(trade, true)} is coming to ${esc(r.place)}.` } : { cls: "now", t: `Waiting ${days(r.wait)}`, p: `You are number ${r.rank} of ${r.of} waiting for ${an(trade)} from ${esc(RN.hub)}.` },
    ];
    const secs = r.sections.filter(([t]) => t !== "What we heard" && t !== "Where it is up to");
    el.innerHTML = `<div class="grabber"></div><div class="app-head">
        <div class="who"><div class="avatar" style="background:var(--good-bg);color:var(--good)">${icon(r.trade, 24)}</div><div><h2>Your repair</h2><p>${esc(state.place)} · example household, house ${r.house}</p></div></div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:8px">
          <label class="field-label" for="tplace" style="margin:0">Community</label><label class="field-label" for="tjob" style="margin:0">Household and repair</label>
          <select id="tplace" class="pill" style="min-width:0;width:100%">${places.map((p) => `<option${p === state.place ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>
          <select id="tjob" class="pill" style="min-width:0;width:100%">${jobs.map((x) => `<option value="${x.id}"${x === r ? " selected" : ""}>House ${x.house}: ${esc(H[x.hazard].label)}</option>`).join("")}</select>
        </div>
        <p class="note" style="margin-top:6px">Each repair in the list belongs to a different made-up household, so the map moves to that house.</p>
      </div>
      <div class="panel-body">
        ${guide("tenant", `<b>What a tenant sees.</b> The green bubble is the text message. Below is every week the repair waited and the real reason. The map shows the house as a small hexagon, not an address.`)}
        <div class="sms">${esc(missed ? r.short.replace("Booked this week. ", as && (as.mode === "crew" || as.accepted_by) ? `The visit missed. Booked with another ${tw}. ` : "The visit missed. Booked for the next trip. ") : r.short)}</div>
        <div class="track" style="margin-top:16px">${steps.map((s, i) => `<div class="step ${s.cls}" style="animation-delay:${reduce ? 0 : i * 60}ms"><span class="node">${s.cls === "ok" ? "✓" : ""}</span><div><b>${s.t}</b><p>${s.p}</p></div></div>`).join("")}</div>
        ${r.came_back != null ? `<div class="card" style="margin-top:6px"><b>This fault came back</b><p class="note">It was fixed ${days(r.came_back)} before you reported it again. The tradesperson is asked to find out why the last fix didn't hold.</p></div>` : ""}
        <div class="card big say" style="margin-top:6px">${sections({ ...r, sections: secs }, true)}</div>
        ${(r.history || []).length ? `<div class="card" style="margin-top:6px"><b>Your house's other repairs this year</b>
          <ul class="hist">${r.history.slice().reverse().map(([d, hz, fixed]) => `<li><span>${esc(H[hz].label)}</span><span class="note">reported ${dateOf(d)} · ${fixed != null ? `fixed ${dateOf(fixed)}` : "still open"}</span></li>`).join("")}</ul></div>` : ""}
        ${r.done && !missed ? `<div class="card" style="margin-top:6px"><b>After the visit: did the repair work?</b>
          ${confirm ? `<p class="note">You said: ${confirm.status === "fixed" ? "it's fixed. Thank you." : "it's still broken. It is back in line as a repeat, with extra points."}</p>`
            : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button class="btn good" id="fixedyes">Yes, it's fixed</button><button class="btn ghost" id="fixedno">No, still broken</button></div>`}</div>` : ""}
        <div class="card" style="margin-top:6px"><b>Think your repair was ranked wrongly?</b>
          ${review ? `<p class="note">You asked for a review on ${new Date(review.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}. A person answers within 10 working days.</p>`
            : `<p class="note">A person, not the computer, looks again at how your repair was ranked and answers within 10 working days.</p>
               <form id="reviewf" style="display:grid;gap:8px;margin-top:8px"><label class="field-label" for="rwhy">What should we know?</label>
               <textarea id="rwhy" maxlength="1000" required placeholder="e.g. my grandson has asthma and the mould is in his room"></textarea>
               <button class="btn ghost" type="submit">Ask for a review</button></form>`}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          <button class="btn primary" id="interp">Ask for an interpreter</button><button class="btn ghost" id="worse">It got worse</button>
          <button class="btn ghost" id="tpdf">Save this as a PDF</button><a class="btn ghost" href="privacy" target="_blank" rel="noopener">How ReachNT decides</a></div>
        <p class="note" style="margin-top:10px">No phone, no app, or rather talk to someone? You can do everything here by calling 1800 104 076 or telling your Community Housing Officer. Interpreters are free: the Aboriginal Interpreter Service, or TIS National for other languages. How you tell us never changes your place in line.</p>
      </div>`;
    bindGuides(el);
    $("#tplace", el).addEventListener("change", (e) => { state.place = e.target.value; state.tjob = null; renderTenant(); tenantMap(); });
    $("#tjob", el).addEventListener("change", (e) => { state.tjob = e.target.value; renderTenant(); tenantMap(); });
    $("#interp", el).addEventListener("click", () => toast("Noted. A Community Housing Officer will call back with an interpreter."));
    $("#worse", el).addEventListener("click", () => {
      recordUpdate(r, "worse", { from: "tenant" }, "escalate");
      toast("A person will call you back today to check. If anyone is in danger now, call 000."); renderTenant();
    });
    $("#tpdf", el).addEventListener("click", () => pdfJob(r, true));
    const rf = $("#reviewf", el);
    if (rf) rf.addEventListener("submit", (e) => {
      e.preventDefault(); const note = $("#rwhy", el).value.trim();
      if (!note) return toast("Tell us a little about why, so the person reviewing knows what to check.");
      recordUpdate(r, "review", { note }, "review"); toast("Review asked for. A person answers within 10 working days."); renderTenant();
    });
    const fy = $("#fixedyes", el), fn = $("#fixedno", el);
    if (fy) fy.addEventListener("click", () => { recordUpdate(r, "fixed", {}, "confirm"); toast("Thanks. Marked as fixed."); renderTenant(); });
    if (fn) fn.addEventListener("click", () => { recordUpdate(r, "still broken", {}, "confirm"); toast("Reopened as a repeat repair. It moves up the line."); renderTenant(); });
  }
  // ================================================================ COMMUNITY HOUSING OFFICER
  // The person in the community tenants talk to. Logs reports (same questions as everyone), and records what a tenant
  // says when they don't use the app: it's fixed, it's still broken, it got worse, or they want a review. Each update
  // goes to the server marked via: "cho", and the tenant's timeline says who recorded it.
  function renderOfficer() {
    const el = $("#officer"); const all = rows();
    const coms = RN.communities.filter((c) => c.hub === RN.hub).sort((a, b) => a.name.localeCompare(b.name));
    if (!state.ocom || !comById[state.ocom]) state.ocom = (coms.find((c) => c.name === "Ngukurr") || coms[0]).cid;
    const c = comById[state.ocom];
    const here = all.filter((r) => r.site === state.ocom);
    const fixedNow = here.filter((r) => r.done && !r.rework).sort((a, b) => b.value - a.value);
    const waiting = here.filter((r) => !r.done).sort((a, b) => b.value - a.value);
    const by = (r, kind) => updateOf(r.id, kind);
    const card = (r, kind) => {
      const cf = by(r, "confirm"), rv = by(r, "review"), wo = by(r, "escalate");
      return `<div class="job" data-id="${r.id}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h4>House ${r.house}: ${esc(H[r.hazard].label)}</h4><span class="chip ${r.category}">${CAT[r.category]}</span></div>
        <div class="meta"><span class="chip ${codeOf(r)}">${REASON[codeOf(r)]}</span>${dueChip(r)}${tierChip(r)}<span>waiting ${days(r.wait)}</span>${r.event ? `<span class="chip immediate">${esc(EVENT_WORD[r.event.type])} area</span>` : ""}</div>
        ${kind === "fixed" ? (cf ? `<p class="note">You recorded: <b style="color:var(--ink)">${esc(cf.status === "fixed" ? "the tenant says it's fixed" : "the tenant says it's still broken")}</b>${cf.status !== "fixed" ? `. Reopened with ${REWORK} extra points; the coordinator decides who goes back.` : "."}</p>`
            : `<p class="note">Booked this week. After the visit, ask the tenant: did it work?</p>
               <div class="acts" style="grid-template-columns:1fr 1fr"><button class="btn good" data-o="fixed">Tenant says fixed</button><button class="btn ghost" data-o="broken">Still broken</button></div>`) : ""}
        ${wo ? `<p class="note"><span class="chip immediate">It got worse</span> recorded ${dateOf(today())}. The coordinator calls back today.</p>` : ""}
        ${rv ? `<p class="note"><span class="chip person">Review asked</span> “${esc(rv.note)}”. A person answers within 10 working days.</p>` : ""}
        <div style="display:flex;gap:6px;flex-wrap:wrap">${wo ? "" : `<button class="btn small ghost" data-o="worse">It got worse</button>`}<button class="btn small ghost" data-o="saw">I saw it</button>${rv ? "" : `<button class="btn small ghost" data-o="review">Ask for a review</button>`}</div>
        <form class="form osaw" hidden><label class="field-label">The fault is<select name="hz">${["immediate", "urgent", "routine"].map((k) => `<optgroup label="${CAT[k]}">${Object.entries(H).filter(([, h]) => h.category === k).map(([id, h]) => `<option value="${id}"${id === r.hazard ? " selected" : ""}>${esc(h.label)}</option>`).join("")}</optgroup>`).join("")}</select></label>
          <label class="field-label">What you saw (the tenant reads this)<input type="text" name="note" maxlength="300" required placeholder="e.g. Water under the switchboard, family moved out of that room"></label><button class="btn primary" type="submit">Save what I saw</button></form>
        <form class="form oreview" hidden><label class="field-label">What should the reviewer know? (the tenant's words)<textarea name="note" maxlength="1000" required></textarea></label><button class="btn primary" type="submit">Ask for a review for the tenant</button></form>
        <form class="form obroken" hidden><label class="field-label">What did the tenant say? (optional)<input type="text" name="note" maxlength="300" placeholder="e.g. Blocked again two days after the plumber left"></label><button class="btn primary" type="submit">Record: still broken</button></form>
      </div>`;
    };
    el.innerHTML = `<div class="grabber"></div><div class="app-head">
        <div class="who"><div class="avatar" style="background:var(--accent-bg);color:var(--accent)"><svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 17c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
          <div><h2>Housing officer</h2><p>Community Housing Officer · example</p></div></div>
        <div class="net-slot">${netHTML()}</div>
        <label class="field-label" for="ocom" style="margin:0">Your community</label>
        <select id="ocom" class="pill" style="width:100%">${coms.map((x) => `<option value="${x.cid}"${x.cid === state.ocom ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
      </div>
      <div class="panel-body">
        ${guide("officer", `<b>For tenants who don't use the app.</b> Log their reports with the same questions as everyone, and record what they tell you: it's fixed, it's still broken, it got worse, or they want a review. Each update says you recorded it for them.`)}
        <button class="btn primary" id="olog" style="width:100%">${state.olog ? "Close the report form" : "Log a report for a tenant"}</button>
        <div id="ointake" style="margin-top:10px"${state.olog ? "" : " hidden"}></div>
        ${eventNow() && eventNow().communities.includes(state.ocom) ? `<div class="card" style="margin-top:10px;border:1px solid var(--bad)"><b>${esc(EVENT_WORD[eventNow().type])} declared ${dateOf(eventNow().day)}</b><p class="note">Check every house with the maintenance officer in the next 48 hours, and log each fault with the same questions. Tell tenants about free interpreters and the hotline.</p></div>` : ""}
        <div class="section-title"><h3>Booked this week: did it work?</h3><span class="note">${fixedNow.length}</span></div>
        ${fixedNow.length ? fixedNow.map((r) => card(r, "fixed")).join("") : `<p class="note" style="padding:0 4px 8px">No repairs booked here this week.</p>`}
        <div class="section-title"><h3>Waiting in ${esc(c.name)}</h3><span class="note">${waiting.length}</span></div>
        ${waiting.slice(0, 30).map((r) => card(r, "waiting")).join("")}${waiting.length > 30 ? `<p class="note">and ${waiting.length - 30} more</p>` : ""}
      </div>`;
    bindGuides(el);
    $("#ocom", el).addEventListener("change", (e) => { state.ocom = e.target.value; renderOfficer(); officerMap(); });
    $("#olog", el).addEventListener("click", () => { state.olog = !state.olog; renderOfficer(); });
    if (state.olog) {
      const box = $("#ointake", el); box.innerHTML = readerHTML({ officer: true, who: "cho", site: state.ocom });
      bindReader(box, { onDone: () => { state.olog = false; renderOfficer(); officerMap(); } });
    }
    $$(".job", el).forEach((j) => {
      const r = all.find((x) => x.id === j.dataset.id); if (!r) return;
      const show = (cls) => $$("form", j).forEach((f) => (f.hidden = !f.classList.contains(cls) || !f.hidden));
      $$("[data-o]", j).forEach((b) => b.addEventListener("click", () => {
        const o = b.dataset.o;
        if (o === "fixed") { recordUpdate(r, "fixed", { via: "cho" }, "confirm"); toast("Recorded for the tenant: fixed."); renderOfficer(); }
        if (o === "broken") show("obroken");
        if (o === "worse") { recordUpdate(r, "worse", { from: "cho" }, "escalate"); toast("The coordinator is told and calls back today."); renderOfficer(); }
        if (o === "saw") show("osaw");
        if (o === "review") show("oreview");
      }));
      const fb = $(".obroken", j), fs = $(".osaw", j), fr = $(".oreview", j);
      fb.addEventListener("submit", (e) => { e.preventDefault(); recordUpdate(r, "still broken", { via: "cho", note: fb.note.value.trim() || undefined }, "confirm");
        toast(`Reopened with ${REWORK} extra points. It keeps the day it was first reported.`); renderAll(); });
      fs.addEventListener("submit", (e) => { e.preventDefault(); if (saveCheck(r, fs.hz.value, "cho", fs.note.value.trim())) renderAll(); });
      fr.addEventListener("submit", (e) => { e.preventDefault(); const note = fr.note.value.trim(); if (!note) return toast("Write down why, in the tenant's words.");
        recordUpdate(r, "review", { note, via: "cho" }, "review"); toast("Review asked for the tenant. A person answers within 10 working days."); renderOfficer(); });
    });
  }
  function officerMap() { if (!map) return; clearMarkers(); map.getSource("routes").setData(fc([])); hubBadge(); const c = comById[state.ocom]; if (c) { showHouses(rows().filter((r) => r.site === c.cid)); map.flyTo({ center: ll(c), zoom: Math.min(imagery.crisp ? 14 : 10.5, map.getMaxZoom()), pitch: 30, duration: reduce ? 0 : 1400 }); } }

  function tenantMap() { const r = rows().find((x) => x.id === state.tjob); if (r && r.cell) { clearMarkers(); hubBadge(); flyToJob(r); } }

  // ================================================================ wiring
  function setPolicy(k) { state.policy = k; $("#policy").value = k; contextText(); renderAll(); }
  function setRole(role) {
    state.role = role; seg($("#role"), "role", role);
    $("#coord").classList.toggle("hide", role !== "coord");
    $("#field").classList.toggle("hide", role !== "field");
    $("#tenant").classList.toggle("hide", role !== "tenant");
    $("#officer").classList.toggle("hide", role !== "officer");
    $("#detail").classList.add("hide");
    $("#layers").style.display = role === "coord" ? "" : "none";
    $("#legend").style.display = role === "coord" ? "" : "none";
    showHouses([]); padMap();
    if (role === "field") { renderField(); fieldMap(); }
    if (role === "tenant") { renderTenant(); refreshMap(); tenantMap(); }
    if (role === "officer") { renderOfficer(); refreshMap(); officerMap(); }
    if (role === "coord") { refreshMap(); home(); }
  }
  function renderAll() {
    renderCoord();
    if (state.role === "field") renderField();
    if (state.role === "tenant") renderTenant();
    if (state.role === "officer") renderOfficer();
    refreshMap();
    if (state.job) { const r = rows().find((x) => x.id === state.job); if (r) openJob(r.id); else $("#detail").classList.add("hide"); }
  }
  window.ReachNT = { get map() { return map; }, state, selfCheck, rows };
  // ---------------------------------------------------------------- plan menu (our own, so Windows doesn't crop it)
  const PLAN_NOTE = { "guarantee_0.2_h3": "Urgent repairs on time everywhere; neighbours share trips", "guarantee_0.2": "Urgent repairs on time everywhere; one place per trip",
                      floor_1: "Saves money on routine work; urgent jobs keep their deadline", cheapest_1: "Fixes the most jobs per dollar; remote tenants wait" };
  function planMenu() {
    const btn = $("#planbtn"), list = $("#planlist"), keys = Object.keys(RN.demo);
    list.innerHTML = keys.map((k, i) => `<li role="option" id="plan-${i}" data-k="${k}" aria-selected="${k === state.policy}">${esc(label(k))}${PLAN_NOTE[k] ? `<small>${esc(PLAN_NOTE[k])}</small>` : ""}</li>`).join("");
    $("#planname").textContent = label(state.policy);
    const inSheet = () => !!list.closest("#ctx-host");
    const close = (focusBtn) => { if (inSheet()) return; list.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); list.removeAttribute("aria-activedescendant"); if (focusBtn) btn.focus(); };
    const open = () => {
      list.classList.add("open"); btn.setAttribute("aria-expanded", "true");
      const i = Math.max(0, keys.indexOf(state.policy)); move(i); list.focus();
    };
    let cur = 0;
    const move = (i) => { cur = (i + keys.length) % keys.length; $$("li", list).forEach((li, j) => li.classList.toggle("active", j === cur)); list.setAttribute("aria-activedescendant", `plan-${cur}`); };
    const pick = (k) => { setPolicy(k); $$("li", list).forEach((li) => li.setAttribute("aria-selected", String(li.dataset.k === k))); if (inSheet()) closeSheets(); else close(true); };
    btn.onclick = () => (list.classList.contains("open") ? close(false) : open());
    btn.onkeydown = (e) => { if (["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); open(); } };
    list.onkeydown = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(cur + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(cur - 1); }
      else if (e.key === "Home") { e.preventDefault(); move(0); }
      else if (e.key === "End") { e.preventDefault(); move(keys.length - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(keys[cur]); }
      else if (e.key === "Escape" || e.key === "Tab") { e.stopPropagation(); close(e.key === "Escape"); }
    };
    $$("li", list).forEach((li, i) => { li.onclick = () => pick(li.dataset.k); li.onmousemove = () => move(i); });
    document.addEventListener("click", (e) => { if (!e.target.closest("#planpick")) close(false); });
  }
  function contextText() {
    const wk = state.week === "12" ? "Sept · dry" : "Feb · wet";
    $("#ctxtext").textContent = `${wk} · ${(RN.short && RN.short[state.policy]) || label(state.policy)}`;
    $("#planname").textContent = label(state.policy);
  }

  // ---------------------------------------------------------------- phones: controls move into a sheet; panels are bottom sheets
  const SNAP = () => ({ peek: 150, half: Math.round(innerHeight * 0.5), full: Math.max(300, innerHeight - topH() - 12) });
  const topH = () => { const t = $(".topbar"); return t ? Math.round(t.getBoundingClientRect().bottom) : 112; };
  let sheet = "half", sheetPx = null;
  function setSheet(name, px) {
    if (!phone()) { document.documentElement.style.removeProperty("--sheet-h"); return; }
    if (name) { sheet = name; sheetPx = SNAP()[name]; } else sheetPx = px;
    document.documentElement.style.setProperty("--sheet-h", sheetPx + "px");
    document.body.dataset.sheet = name || "drag";
    padMap();
    clearTimeout(setSheet.t);
    if (name && map) setSheet.t = setTimeout(() => { if (state.role === "coord" && !comById[state.filter]) home(); }, 360);   // the role may have changed meanwhile
  }
  const sheetHeight = () => (phone() ? sheetPx || SNAP()[sheet] : 0);
  function layoutPhone() {
    document.documentElement.style.setProperty("--top-h", topH() + "px");
    const host = phone() ? $("#ctx-host") : $("#ctl-home").parentNode;
    const anchor = phone() ? null : $("#ctl-home");
    const order = phone() ? [$("#week"), $("#planpick")] : [$("#planpick"), $("#week")];   // on a phone the week comes first
    order.forEach((el) => host.insertBefore(el, anchor));
    if (!phone()) $("#context").classList.remove("open");
    setSheet(phone() ? sheet : null);
    seg($("#week"), "week", state.week);
  }
  function bindSheetDrag() {
    let y0 = 0, h0 = 0, moved = false, active = false;
    const panels = () => $$(".panel.left:not(.hide), .panel.phone:not(.hide)");
    document.addEventListener("pointerdown", (e) => {
      const g = e.target.closest(".panel .grabber"); if (!g || !phone()) return;
      active = true; moved = false; y0 = e.clientY; h0 = sheetHeight(); g.setPointerCapture && g.setPointerCapture(e.pointerId);
      document.body.classList.add("sheet-dragging");
    });
    document.addEventListener("pointermove", (e) => {
      if (!active) return; const dy = e.clientY - y0; if (Math.abs(dy) > 6) moved = true;
      const S = SNAP(); setSheet(null, Math.min(S.full, Math.max(110, h0 - dy)));
    });
    document.addEventListener("pointerup", () => {
      if (!active) return; active = false; document.body.classList.remove("sheet-dragging");
      const S = SNAP();
      if (!moved) return setSheet(sheet === "full" ? "half" : sheet === "half" ? "full" : "half");   // a tap opens it up or brings it back
      const near = Object.entries(S).sort((a, b) => Math.abs(a[1] - sheetPx) - Math.abs(b[1] - sheetPx))[0][0];
      setSheet(near);
    });
    document.addEventListener("keydown", (e) => {   // keyboard: Enter or Space on the grabber does what a tap does
      if (!e.target.closest || !e.target.closest(".panel .grabber") || !["Enter", " "].includes(e.key)) return;
      e.preventDefault(); setSheet(sheet === "full" ? "half" : "full");
    });
    panels();
  }

  function init() {
    $("#policy").innerHTML = Object.keys(RN.demo).map((k) => `<option value="${k}">${esc(label(k))}</option>`).join("");
    $("#policy").value = state.policy;
    planMenu(); contextText();
    $("#ctxbtn").addEventListener("click", () => openSheet("context"));
    $("#keybtn").addEventListener("click", () => { const on = document.body.classList.toggle("key-open"); $("#keybtn").setAttribute("aria-expanded", String(on)); });
    bindSheetDrag();
    $$("#role button").forEach((b) => b.addEventListener("click", () => setRole(b.dataset.role)));
    $$("#week button").forEach((b) => b.addEventListener("click", () => { state.week = b.dataset.week; seg($("#week"), "week", state.week); contextText(); renderAll(); }));
    $$("#coord .tabs button[data-tab]").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; renderCoord(); }));
    $("#tradeoff-open").addEventListener("click", () => openSheet("tradeoff"));
    $("#about-open").addEventListener("click", () => openSheet("about"));
    $$("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));
    $("#scrim").addEventListener("click", closeSheets);
    addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheets(); });
    $$("#layers button").forEach((b) => b.addEventListener("click", () => {
      state.layer = b.dataset.layer; $$("#layers button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.layer === state.layer)));
      refreshMap();
      if (!map) return;
      if (state.layer === "year") map.flyTo({ center: [133.4, -18.8], zoom: phone() ? 4.2 : 5, pitch: 0, bearing: 0, duration: reduce ? 0 : 1500 });
      else map.flyTo({ center: [133.0, -15.3], zoom: phone() ? 5.5 : 6.3, pitch: state.layer === "reach" ? 0 : 35, bearing: state.layer === "reach" ? 0 : -8, duration: reduce ? 0 : 1300 });
    }));
    const h = location.hash.replace("#", "");
    requestAnimationFrame(() => { seg($("#role"), "role", state.role); layoutPhone(); });
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { seg($("#role"), "role", state.role); layoutPhone(); padMap(); }, 80); });
    renderCoord(); renderNet(); sync();
    const sp = $("#splash"); if (sp) { sp.classList.add("gone"); setTimeout(() => sp.remove(), 700); }
    initMap();
    if (["field", "tenant", "officer"].includes(h)) setTimeout(() => setRole(h), 50);
    if (h === "tradeoff") setTimeout(() => openSheet("tradeoff"), 50);
  }
  init();
})();
