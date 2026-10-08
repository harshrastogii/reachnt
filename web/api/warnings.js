// GET /api/warnings: roads and weather now, for the coordinator's prompts ("Roads and weather now" in Trips).
// Live from the NT Road Report (closures and flooding) and the Bureau of Meteorology (station observations: rain since
// 9 am, temperature). If a feed can't be reached in time, that part comes from the saved snapshot
// (web/data/warnings_snapshot.json, built by scripts/warnings_snapshot.py) and says so. Nothing is decided here: the
// portal turns these into prompts, and the coordinator decides. Cached at the edge for 10 minutes, so the feeds see
// at most a handful of requests an hour however many people open the portal.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SNAPSHOT = require("../data/warnings_snapshot.json");

const ROADS = "https://roadreport.nt.gov.au/api/Obstruction/GetAll";
const BOM = (wmo) => `http://www.bom.gov.au/fwo/IDD60801/IDD60801.${wmo}.json`;
// BoM refused requests whose User-Agent carried a filled-in contact string; an empty one is accepted
// (TerraIQ collector, tested 10 Jul 2026).
const UA = "ReachNT/1.0 (data collection; contact: )";
const TIMEOUT_MS = 6000;

async function getJSON(url, fetcher = fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetcher(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Closures and flooding only: what changes whether a trip can go.
export function roadsFrom(payload) {
  return (payload && payload.response || []).filter((x) => x && x.status === "CURRENT").map((x) => ({
    road: x.roadName, restriction: x.restrictionType, type: x.obstructionType, where: x.locationComment,
    comment: String(x.comment || "").slice(0, 240), start: x.startPoint, end: x.endPoint, updated: x.dateLastUpdated,
  })).filter((x) => /closed|impassable|flood/i.test(`${x.restriction} ${x.type}`));
}

// The newest observation from one station.
export function weatherFrom(station, payload) {
  const d = payload.observations.data[0];
  const num = (v) => (v === null || v === undefined || v === "-" || Number.isNaN(Number(v)) ? null : Number(v));
  return { ...station, time: d.local_date_time_full, air_temp: num(d.air_temp), apparent_t: num(d.apparent_t), rain_since_9am: num(d.rain_trace) || 0 };
}

export async function build(fetcher = fetch) {
  const out = { fetched_at: new Date().toISOString(), stations: SNAPSHOT.stations, roads_note: SNAPSHOT.roads_note, weather_note: SNAPSHOT.weather_note };
  try {
    out.roads = roadsFrom(await getJSON(ROADS, fetcher)); out.roads_source = "live";
  } catch (e) {
    out.roads = SNAPSHOT.roads; out.roads_source = "snapshot"; out.roads_saved = SNAPSHOT.roads_saved;
  }
  const obs = await Promise.allSettled(SNAPSHOT.stations.map((s) => getJSON(BOM(s.wmo), fetcher).then((p) => weatherFrom(s, p))));
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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const body = await build();
  if (res.setHeader) res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
  res.status(200).json(body);
}
