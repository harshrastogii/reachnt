// GET /api/warnings: roads and weather now, for the coordinator's prompts ("Roads and weather now" in Trips).
// Live from the NT Road Report (closures and flooding) and the Bureau of Meteorology (station observations: rain since
// 9 am, temperature). If a feed can't be reached in time, that part comes from the saved snapshot
// (web/data/warnings_snapshot.json, built by scripts/warnings_snapshot.py) and says so. Nothing is decided here: the
// portal turns these into prompts, and the coordinator decides. Cached at the edge for 10 minutes when both feeds
// answered, so the feeds see at most a handful of requests an hour however many people open the portal; for 1 minute
// when any part is the saved copy, so the live feeds come back soon after an outage ends.
import SNAPSHOT from "./_warnings_snapshot.js";   // bundled with the function (a JSON file outside api/ is not)

const ROADS = "https://roadreport.nt.gov.au/api/Obstruction/GetAll";
const BOM = (wmo) => `http://www.bom.gov.au/fwo/IDD60801/IDD60801.${wmo}.json`;
// BoM refused requests whose User-Agent carried a filled-in contact string; an empty one is accepted
// (TerraIQ collector, tested 10 Jul 2026).
const UA = "ReachNT/1.0 (data collection; contact: )";
const TIMEOUT_MS = 6000;

async function getJSON(url, fetcher = fetch, timeoutMs = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetcher(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Closures and flooding only: what changes whether a trip can go. A reply without a `response` list is not "no
// closures": the feed has changed shape, so this throws and the labelled snapshot is used instead.
export function roadsFrom(payload) {
  if (!payload || !Array.isArray(payload.response)) throw new Error("Road Report reply has no response list");
  return payload.response.filter((x) => x && x.status === "CURRENT").map((x) => ({
    road: x.roadName, restriction: x.restrictionType, type: x.obstructionType, where: x.locationComment,
    comment: String(x.comment || "").slice(0, 240), start: x.startPoint, end: x.endPoint, updated: x.dateLastUpdated,
  })).filter((x) => /closed|impassable|flood/i.test(`${x.restriction} ${x.type}`));
}

// The newest observation from one station. A reading the station didn't send stays null (shown as "–"), never 0.
export function weatherFrom(station, payload) {
  const d = payload.observations.data[0];
  const num = (v) => (v === null || v === undefined || v === "-" || String(v).trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return { ...station, time: d.local_date_time_full, air_temp: num(d.air_temp), apparent_t: num(d.apparent_t), rain_since_9am: num(d.rain_trace) };
}

export async function build(fetcher = fetch, timeoutMs = TIMEOUT_MS) {
  const out = { fetched_at: new Date().toISOString(), stations: SNAPSHOT.stations, roads_note: SNAPSHOT.roads_note, weather_note: SNAPSHOT.weather_note };
  // roads and every station at once, so the slowest feed sets the time (at most TIMEOUT_MS)
  const [rd, ...obs] = await Promise.allSettled([getJSON(ROADS, fetcher, timeoutMs).then(roadsFrom),
    ...SNAPSHOT.stations.map((s) => getJSON(BOM(s.wmo), fetcher, timeoutMs).then((p) => weatherFrom(s, p)))]);
  if (rd.status === "fulfilled") { out.roads = rd.value; out.roads_source = "live"; }
  else { out.roads = SNAPSHOT.roads; out.roads_source = "snapshot"; out.roads_saved = SNAPSHOT.roads_saved; }
  const live = obs.filter((o) => o.status === "fulfilled").map((o) => o.value);
  if (live.length) {
    const have = new Set(live.map((w) => w.wmo));   // a station that failed keeps its saved reading, marked as such
    out.weather = live.concat(SNAPSHOT.weather.filter((w) => !have.has(w.wmo)).map((w) => ({ ...w, saved: true })));
    out.weather_source = "live";
  } else {
    out.weather = SNAPSHOT.weather; out.weather_source = "snapshot"; out.weather_saved = SNAPSHOT.weather_saved;
  }
  return out;
}

// Ten minutes at the edge when everything is live; one minute when any part is the saved copy.
export function cacheControl(body) {
  const saved = body.roads_source !== "live" || body.weather_source !== "live" || (body.weather || []).some((w) => w.saved);
  return saved ? "public, s-maxage=60, stale-while-revalidate=60" : "public, s-maxage=600, stale-while-revalidate=1800";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const body = await build();
  if (res.setHeader) res.setHeader("Cache-Control", cacheControl(body));
  res.status(200).json(body);
}
