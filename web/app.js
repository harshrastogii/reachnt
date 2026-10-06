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
  const REASON = { travel_cost: "No trip this week", crew_full: "Trades fully booked", cut: "Road cut", lower_priority: "More urgent jobs first", booked: "Booked this week" };
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
  const rows = () => RN.demo[state.policy].weeks[state.week] || [];
  const fieldData = () => (RN.demo[state.policy].field || {})[state.week] || {};
  const codeOf = (r) => (r.done ? "booked" : r.now || (r.site === "TOWN" ? "lower_priority" : r.reachable ? "travel_cost" : "cut"));
  const label = (k) => RN.labels[k] || k;

  // ---------------------------------------------------------------- per-viewer storage
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
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
  function recordUpdate(job, status) {
    const box = outbox().filter((u) => u.id !== job.id);
    box.push({ id: job.id, status, trade: job.trade, place: job.place, at: new Date().toISOString(), sent: false });
    store("rn-outbox", box); sync(); renderNet();
  }
  async function sync() {
    const box = outbox(); const pending = box.filter((u) => !u.sent);
    if (!pending.length || !navigator.onLine) return renderNet();
    try {
      const r = await fetch("api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: pending }) });
      if (!r.ok) throw new Error(r.status);
      box.forEach((u) => (u.sent = true)); store("rn-outbox", box);
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

  // ================================================================ PDF (job sheets to keep without signal)
  async function getPDF() {
    if (!window.jspdf) {
      await new Promise((res) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
      if (!window.jspdf) await new Promise((res) => { const s = document.createElement("script"); s.src = "vendor/jspdf.umd.min.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
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
        g.fillStyle = el.classList.contains("s-near") ? "rgba(16,20,26,.7)" : col; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = "#fff"; g.stroke();
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
    if (r.vulnerable) P.t("Someone vulnerable lives here (a baby, an elder or someone unwell).", 9.5, "normal", [74, 82, 92]);
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
    P.gap(); P.t("Repairs hotline 1800 104 076 · Ask for an Aboriginal interpreter at any time.", 9.5, "bold");
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
  }
  const home = () => map && map.flyTo({ center: [133.0, -15.3], zoom: phone() ? 5.5 : 6.3, pitch: 35, bearing: -8, duration: reduce ? 0 : 2400, essential: true });
  function padMap() {
    if (!map) return;
    if (phone()) map.setPadding({ top: 150, bottom: Math.round(innerHeight * 0.55), left: 0, right: 0 });
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
  function clearMarkers() { markers.forEach((m) => m.remove()); markers = []; }
  function badge(lngLat, { n, cls, name, sub, onClick, size }) {
    const el = document.createElement("button");
    el.className = `hexb ${cls || ""} ${size || ""}`; el.type = "button";
    el.setAttribute("aria-label", `${name || ""} ${sub || ""}`.trim());
    el.innerHTML = `<span class="hx"><b>${n ?? ""}</b></span>${name ? `<span class="nm">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>` : ""}`;
    if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map));
    el.setAttribute("aria-label", `${name || ""}${n != null && n !== "" ? `, ${n}` : ""} ${sub || ""}`.trim());   // MapLibre replaces it with "Map marker"
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
    if (state.role === "tenant") { map.getSource("routes").setData(fc([])); return; }
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
        badge(ll(c), { n: r.length, cls: "s-" + st + (state.filter === c.cid ? " sel" : ""), name: c.name, onClick: () => focusCommunity(c.cid) });
      });
      if (state.layer === "week") shared.forEach(([a, b, p]) => p && savingTag(a, b, p, !!focus));
      map.getSource("foot").setData(fc([]));
    }
    if (state.layer === "reach" && !refreshMap.reach) {
      const lons = hubComs.map((c) => c.lon), lats = hubComs.map((c) => c.lat);
      const poly = [[Math.min(...lats) - 0.6, Math.min(...lons) - 0.6], [Math.min(...lats) - 0.6, Math.max(...lons) + 0.6], [Math.max(...lats) + 0.6, Math.max(...lons) + 0.6], [Math.max(...lats) + 0.6, Math.min(...lons) - 0.6]];
      refreshMap.reach = fc(h3.polygonToCells(poly, 5).map((cell) => { const [la, lo] = h3.cellToLatLng(cell); return F(hexGeom(cell), { h: (h3.greatCircleDistance([la, lo], [hub.lat, hub.lon], "km") * 1.2) / 70 }); }));
    }
    if (refreshMap.reach) map.getSource("reach").setData(refreshMap.reach);
    hubBadge();
    legend();
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
    if (state.policy === "cheapest_1") return `<div class="decision unsigned"><span class="eyebrow">Nobody signed this</span><b>Cheapest jobs first</b><p>Town jobs need no travel, so they always look cheaper and remote repairs wait. Nobody agreed to that. Open “Compare settings” to choose one and sign it.</p></div>`;
    return `<div class="decision"><span class="eyebrow">How this week was planned · example sign-off</span><b>${esc(label(state.policy))}</b><p>${esc(d.role)}, ${esc(d.date)}. ${esc(d.rationale.replace(/H3 cells/g, "hexagons"))}</p></div>`;
  }
  function renderCoord() {
    $$("#coord .tabs button[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    const body = $("#coord-body");
    if (state.tab === "queue") body.innerHTML = queueHTML();
    if (state.tab === "trips") body.innerHTML = tripsHTML();
    if (state.tab === "reader") { body.innerHTML = readerHTML(); bindReader(); return; }
    bindGuides(body);
    $$(".row[data-id]", body).forEach((b, i) => { b.style.animationDelay = reduce ? "0ms" : Math.min(i, 14) * 22 + "ms"; b.addEventListener("click", () => openJob(b.dataset.id)); });
    $$(".filters [data-f]", body).forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.f; renderCoord(); refreshMap(); }));
    $$(".filters [data-tr]", body).forEach((b) => b.addEventListener("click", () => { state.trade = b.dataset.tr; renderCoord(); refreshMap(); }));
    $$("[data-cid]", body).forEach((b) => b.addEventListener("click", () => focusCommunity(b.dataset.cid)));
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
      + decisionHTML()
      + `<div class="stats">${stats.map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div>`
      + `<div class="filters" style="padding:0 6px 6px">${tb("all", "All trades")}${Object.keys(TRADE).map((k) => tb(k, TRADE_SHORT[k])).join("")}</div>`
      + `<div class="filters" style="padding:0 6px 8px">${fb("remote", "Remote")}${fb("urgent", "Urgent")}${fb("town", "Town")}${fb("all", "All")}${comById[f] ? `<button data-f="all" aria-pressed="true" aria-label="Stop showing only ${esc(comById[f].name)}">${esc(comById[f].name)} ✕</button>` : ""}</div>`
      + `<p class="note" style="padding:0 8px 6px">Most urgent first. Where someone lives never changes their place in line; it only changes how the trip is planned.</p>`
      + list.slice(0, 120).map((r) => `<button class="row" data-id="${r.id}" aria-current="${state.job === r.id}"><span class="dot ${r.category}"></span>
          <span class="t">${esc(H[r.hazard].label)}</span><span class="chip ${codeOf(r)}">${REASON[codeOf(r)]}</span>
          <span class="s">${esc(r.place)} · ${TRADE_SHORT[r.trade]} · waiting ${days(r.wait)}</span></button>`).join("")
      + (list.length > 120 ? `<p class="note" style="padding:8px">Showing 120 of ${list.length}.</p>` : "");
  }
  function tripsHTML() {
    const all = rows(); const F2 = fieldData();
    let h = guide("trips", `<b>Shared trips.</b> When two communities are close, one tradesperson can visit both on the same trip instead of two separate trips. ReachNT finds the pairs with a hexagon map grid (Uber's H3): if their hexagons are no more than two apart, about 90 km, they can share. Tap a trip to see it on the map.`) + costsHTML();
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
      ["Who lives there", s.exposure, "var(--good)"], ["Reported before", s.repeat, "var(--violet)"], ["Time waited", s.ageing, "var(--warn)"]];
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
  function openJob(id) {
    const r = rows().find((x) => x.id === id); if (!r) return; state.job = id;
    $$("#coord .row").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === id)));
    const d = $("#detail");
    d.innerHTML = `<button class="iconbtn closebtn" aria-label="Close">✕</button><div class="detail">
      <div><span class="eyebrow">${esc(r.place)} · ${TRADE[r.trade]}</span><h2 style="margin-top:4px">${esc(H[r.hazard].label)}</h2></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${r.category}">${CAT[r.category]}</span><span class="chip ${codeOf(r)}">${REASON[codeOf(r)]}</span>
        ${r.needs_human ? '<span class="chip person">A person checked the report</span>' : ""}${r.run ? '<span class="chip hex">On a shared trip</span>' : ""}</div>
      <p class="quote">“${esc(r.text)}”</p>
      <div><b>Priority ${r.score.total} points</b><p class="note" style="margin:2px 0 6px">Worked out only from what was reported and how long it has waited. Distance and cost are never part of it.</p>${scoreBars(r.score)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn ghost" id="fly">Show the house</button><button class="btn ghost" id="pdf">Save as PDF</button></div>
      <div class="say"><span class="eyebrow">What the tenant is told</span>${sections(r, false)}</div></div>`;
    d.classList.remove("hide");
    $(".closebtn", d).addEventListener("click", () => { d.classList.add("hide"); state.job = null; showHouses([]); });
    $("#fly", d).addEventListener("click", () => flyToJob(r));
    $("#pdf", d).addEventListener("click", () => pdfJob(r, false));
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
    const ks = Object.keys(hits).sort((a, b) => RANK[H[a].category] - RANK[H[b].category] || H[b].harm - H[a].harm);
    return { primary: ks[0] || null, all: ks, hits, mods };
  }
  const SAMPLES = ["water coming through the ceiling onto the power point, sparks when it rains. nana and the kids sleep there",
    "sewage coming up in the yard, 12 people living here", "no hot water for the baby, rang last week and nobody came",
    "smells like gas inside the house", "front door kicked in won't lock", "cockroaches everywhere in the kitchen", "pls come"];
  function readerHTML() {
    return guide("reader", `<b>Try it.</b> Type what a tenant might say on the phone. ReachNT picks out the fault, how urgent it is and which trade it needs. If it isn't sure, or the words sound dangerous, a person calls back.`)
      + `<div style="padding:0 6px" class="say"><label class="field-label" for="rtext">What the tenant said</label><textarea id="rtext">${esc(SAMPLES[0])}</textarea>
      <div class="filters" style="margin-top:8px">${SAMPLES.map((s, i) => `<button data-s="${i}">${esc(s.length > 26 ? s.slice(0, 24) + "…" : s)}</button>`).join("")}</div>
      <div id="rout" style="margin-top:14px"></div></div>`;
  }
  function bindReader() {
    bindGuides($("#coord-body"));
    const go = () => {
      const r = readReport($("#rtext").value); const T = RN.triage; const out = $("#rout");
      if (!r.primary) { out.innerHTML = `<div class="card"><b>Not sure what this is</b><p class="note" style="margin-top:4px">A person calls the tenant back to ask.</p></div>`; return; }
      const h = H[r.primary];
      const exp = (r.mods.vulnerable ? T.vulnerable_points : 0) + (r.mods.crowded ? T.crowded_points : 0);
      const rep = r.mods.repeat ? T.repeat_points : 0; const base = { immediate: 1000, urgent: 500, routine: 100 }[h.category]; const hlp = (10 - h.hlp) * 4;
      const clock = h.category === "immediate" ? "Made safe within 4 hours by the local maintenance officer, then fixed within 2 working days"
        : h.category === "urgent" ? "Within 2 working days, in town or out bush (the official remote rule allows 5)" : "Within 10 working days, in town or out bush (the official remote rule allows 25)";
      out.innerHTML = `<div class="card" style="display:grid;gap:10px">
        <div style="display:flex;gap:10px;align-items:center"><div class="avatar">${icon(h.trade, 22)}</div><div><b style="font-size:17px">${esc(h.label)}</b><div><span class="chip ${h.category}">${CAT[h.category]}</span></div></div></div>
        <div class="note">Words it picked up: ${r.all.map((k) => `“<b style="color:var(--ink)">${esc(r.hits[k])}</b>” (${esc(H[k].label.toLowerCase())})`).join(", ")}</div>
        <div><b>When it should be fixed</b><p class="note">${clock}</p></div>
        <div><b>Who fixes it</b><p class="note">${TRADE[h.trade]}, about ${h.hours} hours on site.${h.rta_s63 ? " The law treats this as an emergency repair." : ""}</p></div>
        <div><b>Priority ${base + h.harm + hlp + exp + rep} points</b><p class="note">${r.mods.vulnerable ? `Extra points because “${esc(r.mods.vulnerable)}” lives there. ` : ""}${rep ? "Extra points because it was reported before. " : ""}Where the house is doesn't change this.</p></div>
        ${h.category === "immediate" || r.mods.danger_words ? `<span class="chip person" style="justify-self:start">A person calls today to check it's safe</span>` : ""}</div>`;
    };
    $("#rtext").addEventListener("input", go);
    $$("[data-s]").forEach((b) => b.addEventListener("click", () => { $("#rtext").value = SAMPLES[b.dataset.s]; go(); }));
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
        <div class="card"><p class="note">${esc(RN.notice)} Imagery now: ${esc(imagery.name)}.</p></div>
      </div>`;
  }

  // ================================================================ TRADESPERSON (phone)
  function myRun() {
    const t = state.ftrade; const all = rows();
    const mine = all.filter((r) => r.trade === t && r.done && r.site !== "TOWN");
    const groups = {}; mine.forEach((r) => (groups[r.run || r.site] = groups[r.run || r.site] || []).push(r));
    const order = Object.keys(groups).sort((a, b) => comById[a.split("+")[0]].hours - comById[b.split("+")[0]].hours);
    const stops = []; order.forEach((k) => k.split("+").forEach((c) => stops.push({ cid: c, key: k, jobs: groups[k].filter((r) => r.site === c) })));
    return { groups, order, stops, town: all.filter((r) => r.trade === t && r.done && r.site === "TOWN") };
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
    Object.entries(near).forEach(([cid, js]) => badge(ll(comById[cid]), { n: js.length, cls: "s-near small", name: comById[cid].name, sub: "nearby, not booked", onClick: () => focusCommunity(cid) }));
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
    const status = Object.fromEntries(outbox().map((u) => [u.id, u]));
    const stopNo = Object.fromEntries(stops.map((s, i) => [s.cid, i + 1]));
    const card = (r, nearby) => {
      const st = status[r.id];
      return `<div class="job ${st ? "done" : ""}" data-id="${r.id}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h4>${stopNo[r.site] ? `<span class="stopno" title="Stop ${stopNo[r.site]} on the map">${stopNo[r.site]}</span>` : ""}${esc(H[r.hazard].label)}</h4><span class="chip ${r.category}">${CAT[r.category]}</span></div>
        <p class="quote" style="font-size:14px">“${esc(r.text)}”</p>
        <div class="meta"><span>${esc(r.place)}</span><span>·</span><span>waiting ${days(r.wait)}</span><span>·</span><span>about ${H[r.hazard].hours} h</span>${r.vulnerable ? '<span class="chip person">vulnerable person lives here</span>' : ""}${nearby ? `<span class="chip hex">${nearby} hexagon${nearby > 1 ? "s" : ""} from your run</span>` : ""}</div>
        ${r.category === "immediate" ? `<p class="note" style="color:var(--bad)">Dangerous. Check the maintenance officer made it safe before you start.</p>` : ""}
        ${st ? `<p class="note"><b style="color:var(--ink)">${st.status === "done" ? "Marked done" : "Not done: " + esc(st.status)}</b> · ${st.sent ? "sent" : "saved on this phone, sends when there's signal"}</p>` :
          `<div class="acts"><button class="btn good" data-act="done">Done</button><button class="btn ghost" data-act="no">Couldn't do it</button><button class="btn ghost" data-act="map" aria-label="Show this house on the map">Map</button></div>
           <div class="reasons" hidden>${["No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work"].map((x) => `<button data-why="${x}">${x}</button>`).join("")}</div>`}
      </div>`;
    };
    const runCards = order.map((k) => {
      const names = k.split("+").map((c) => comById[c].name); const g = groups[k]; const p = pairOf(k); const c0 = comById[k.split("+")[0]];
      return `<div class="trip-card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(names.join(" → "))}</h3><span class="chip ${p ? "hex" : g[0].mode.startsWith("air") ? "cut" : "booked"}">${p ? "Shared trip" : g[0].mode.startsWith("air") ? "Charter flight" : "Drive"}</span></div>
        <span class="note">${g.length} job${g.length > 1 ? "s" : ""} · ${g[0].mode.startsWith("air") ? "flight" : c0.hours + " h drive"} from ${esc(RN.hub)}${p ? `, then ${Math.round(p.km)} km to ${esc(names[1])}. One trip instead of two saves about ${money(p.saving)}.` : ""}</span></div>`
        + g.sort((a, b) => b.score.total - a.score.total).map((r) => card(r)).join("");
    }).join("");
    const near = (d.nearby || []).map((x) => ({ r: all.find((y) => y.id === x.id), k: x.rings })).filter((x) => x.r);
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
      }));
      $$("[data-why]", j).forEach((b) => b.addEventListener("click", () => { recordUpdate(r, b.dataset.why); toast("Reason saved: " + b.dataset.why); renderField(); }));
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
    const steps = [
      { cls: "ok", t: `Reported ${dateOf(r.day)}`, p: `You said: “${esc(r.text)}”` },
      { cls: "ok", t: `We read it as ${esc(H[r.hazard].label.toLowerCase())}`, p: `${CAT[r.category]} repair.${r.needs_human ? " A person checked it." : ""}` },
      ...runs.map((x) => ({ cls: "wait", t: `${x.n} week${x.n > 1 ? "s" : ""}, ${x.n > 1 ? `${dateOf(x.from * 7)} to ${dateOf(x.to * 7 + 6)}` : `week of ${dateOf(x.from * 7)}`}`, p: say[x.code] ? say[x.code](x) : esc(x.code) })),
      r.done ? { cls: "now", t: "Booked this week", p: `${an(trade, true)} is coming to ${esc(r.place)}.` } : { cls: "now", t: `Waiting ${days(r.wait)}`, p: `You are number ${r.rank} of ${r.of} waiting for ${an(trade)} from ${esc(RN.hub)}.` },
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
        <div class="sms">${esc(r.short)}</div>
        <div class="track" style="margin-top:16px">${steps.map((s, i) => `<div class="step ${s.cls}" style="animation-delay:${reduce ? 0 : i * 60}ms"><span class="node">${s.cls === "ok" ? "✓" : ""}</span><div><b>${s.t}</b><p>${s.p}</p></div></div>`).join("")}</div>
        <div class="card big say" style="margin-top:6px">${sections({ ...r, sections: secs }, true)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
          <button class="btn primary" id="interp">Ask for an interpreter</button><button class="btn ghost" id="worse">It got worse</button>
          <button class="btn ghost" id="tpdf" style="grid-column:span 2">Save this as a PDF</button></div>
      </div>`;
    bindGuides(el);
    $("#tplace", el).addEventListener("change", (e) => { state.place = e.target.value; state.tjob = null; renderTenant(); tenantMap(); });
    $("#tjob", el).addEventListener("change", (e) => { state.tjob = e.target.value; renderTenant(); tenantMap(); });
    $("#interp", el).addEventListener("click", () => toast("Noted. A Community Housing Officer will call back with an interpreter."));
    $("#worse", el).addEventListener("click", () => toast("Call 1800 104 076 now. If it's dangerous it is made safe today."));
    $("#tpdf", el).addEventListener("click", () => pdfJob(r, true));
  }
  function tenantMap() { const r = rows().find((x) => x.id === state.tjob); if (r && r.cell) { clearMarkers(); hubBadge(); flyToJob(r); } }

  // ================================================================ wiring
  function setPolicy(k) { state.policy = k; $("#policy").value = k; renderAll(); }
  function setRole(role) {
    state.role = role; seg($("#role"), "role", role);
    $("#coord").classList.toggle("hide", role !== "coord");
    $("#field").classList.toggle("hide", role !== "field");
    $("#tenant").classList.toggle("hide", role !== "tenant");
    $("#detail").classList.add("hide");
    $("#layers").style.display = role === "coord" ? "" : "none";
    $("#legend").style.display = role === "coord" ? "" : "none";
    showHouses([]); padMap();
    if (role === "field") { renderField(); fieldMap(); }
    if (role === "tenant") { renderTenant(); refreshMap(); tenantMap(); }
    if (role === "coord") { refreshMap(); home(); }
  }
  function renderAll() {
    renderCoord();
    if (state.role === "field") renderField();
    if (state.role === "tenant") renderTenant();
    refreshMap();
    if (state.job) { const r = rows().find((x) => x.id === state.job); if (r) openJob(r.id); else $("#detail").classList.add("hide"); }
  }
  window.ReachNT = { get map() { return map; }, state };
  function init() {
    $("#policy").innerHTML = Object.keys(RN.demo).map((k) => `<option value="${k}">${esc(label(k))}</option>`).join("");
    $("#policy").value = state.policy;
    $("#policy").addEventListener("change", (e) => setPolicy(e.target.value));
    $$("#role button").forEach((b) => b.addEventListener("click", () => setRole(b.dataset.role)));
    $$("#week button").forEach((b) => b.addEventListener("click", () => { state.week = b.dataset.week; seg($("#week"), "week", state.week); renderAll(); }));
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
    requestAnimationFrame(() => { seg($("#role"), "role", state.role); seg($("#week"), "week", state.week); });
    addEventListener("resize", () => { seg($("#role"), "role", state.role); seg($("#week"), "week", state.week); padMap(); });
    renderCoord(); renderNet(); sync();
    const sp = $("#splash"); if (sp) { sp.classList.add("gone"); setTimeout(() => sp.remove(), 700); }
    initMap();
    if (["field", "tenant"].includes(h)) setTimeout(() => setRole(h), 50);
    if (h === "tradeoff") setTimeout(() => openSheet("tradeoff"), 50);
  }
  init();
})();
