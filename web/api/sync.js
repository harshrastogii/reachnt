// Receives updates queued on a phone while it had no signal:
//   visit   - a tradesperson's result: "done", or why not ("No one home" needs the time and what was tried)
//   review  - a tenant asks a person to review how their repair was ranked (answered within 10 working days)
//   confirm - a tenant says whether the repair worked; "still broken" reopens it as a repeat
//   intake  - a new report, logged by whoever the tenant told (repairs line, housing officer, maintenance officer,
//             tradesperson, the app) with the tenant's words and the same standard questions every time
//   urgency - a person checked how urgent a repair is (by phone, on site, from a photo or a review) and kept or changed it;
//             lowering a dangerous repair needs someone who spoke to the tenant or saw it, and a reason the tenant can read
//   assign  - the coordinator decides who goes after a missed visit: the next trip, a named crew, or open to any trade
//   accept  - a tradesperson takes a job that was opened to any trade
//   escalate - a tenant or tradesperson says it got worse; a person calls back the same day
//   event   - the coordinator declares a flood, cyclone or fire over some communities: a make-safe sweep, joint
//             trips and surge crews follow, and every report from there is tagged
//   interpreter - a tenant (or their housing officer, the repairs line or the coordinator) asks for a call-back with
//             an interpreter
// A Community Housing Officer can send review, confirm and escalate for a tenant who doesn't use the app: the update
// carries via: "cho", so the tenant's timeline says who recorded it.
//
// Request:  POST { updates: [ { cid?, id, kind?, status, at?, ...fields of that kind } ] }   at most 200 updates, 64 KB
//   cid: the phone's own id for the update (/^[A-Za-z0-9_-]{6,40}$/), so it can tell which one was refused.
// Reply 200: { received, rejected: ["J07567:visit", ...], rejected_cids: [cid, ...], reasons: [{ key, cid?, why }],
//              mode: "demo" | "signed-in", at }
// Reply 413: { error, limit: "updates" | "bytes", max_updates: 200, max_bytes: 65536, updates?, bytes }
//   the phone splits its outbox into smaller requests and sends again.
// Reply 400: { error } for a body that isn't JSON or isn't { updates: [...] }; 401 when sign-in is on and the token is bad.
//
// Categories are never taken on trust: an urgency check names the household's tier, and the categories it states must be
// the taxonomy's category for each fault, raised to Immediate for a Tier 1 household losing power, water or cooling
// (config/params.yaml triage.lifeline_faults). Fault ids must be in config/taxonomy.yaml (bundled as _taxonomy.js).
// Prototype: it validates and acknowledges them. In production this writes to the ops tables in docs/schema.sql
// using a server-side DATABASE_URL, never a key in the browser, and only for the signed-in person's own jobs.
import { verify, allowed } from "./_auth.js";
import { CATEGORY, LIFELINE } from "./_taxonomy.js";   // written by scripts/api_taxonomy.py

const VISIT = new Set(["done", "No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work"]);
const NO_ACCESS = new Set(["No one home", "Can't get in"]);
const STEPS = new Set(["Left a card", "Phoned the tenant", "Spoke to family or a neighbour", "Took a photo of the door"]);
export const MAX_BYTES = 64 * 1024;       // a day's updates from one phone are a few kilobytes
export const MAX_UPDATES = 200;
const ID = /^[A-Z0-9][A-Z0-9-]{2,31}$/;   // job ids look like J07567 (N0001 for a report logged in the portal, EV-0001 for an event)
const CID = /^[A-Za-z0-9_-]{6,40}$/;   // the phone's id for one update
const RANK = { immediate: 0, urgent: 1, routine: 2 };
const CHANNELS = new Set(["line", "cho", "rhmo", "trade", "app", "counter"]);
const INTERPRETERS = new Set(["none", "ais", "tis", "nrs", "family"]);
const QUESTIONS = new Set(["danger_now", "life_support", "baby_elder", "child_mobility", "people", "before"]);
export const SOURCES = new Set(["called_in", "phoned", "cho", "rhmo", "trade", "photo", "review"]);
const SAW_OR_SPOKE = new Set(["called_in", "phoned", "cho", "rhmo", "trade"]);   // the only sources that may lower a dangerous repair
const ASSIGN = new Set(["next", "crew", "open"]);
const TRADES = new Set(["plumber", "electrician", "carpenter", "aircon", "pest", "general"]);
const VIA = new Set([undefined, "tenant", "cho", "line"]);   // who recorded a tenant's update: themselves, their housing officer, the repairs line
const EVENTS = new Set(["flood", "cyclone", "fire", "storm"]);
const COMMUNITY = /^C\d{2,3}$/;
const FIRST_DAY = [0, 800];        // the simulation's day index (first contact, an event's start): not before day 0 or far past the run
const SKEW_MS = 5 * 60 * 1000;     // a phone's clock may run a few minutes fast
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

const LIFE = new Set(LIFELINE);
export const isHazard = (h) => typeof h === "string" && Object.prototype.hasOwnProperty.call(CATEGORY, h);
// The category a fault has for a household of this tier (the same rule as catOf in web/app.js and src/reachnt/urgency.py).
export const catOf = (hz, tier) => (tier === 1 && LIFE.has(hz) ? "immediate" : CATEGORY[hz]);
const text = (v, max) => v === undefined || (typeof v === "string" && v.length <= max);
const words = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const iso = (v) => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const when = (v) => v === undefined || iso(v);
const notFuture = (v) => Date.parse(v) <= Date.now() + SKEW_MS;

// Why an update can't be accepted, or null when it is valid. The reason goes back to the phone.
export function problem(u) {
  if (!u || typeof u !== "object" || Array.isArray(u)) return "not an update";
  if (typeof u.id !== "string" || !ID.test(u.id)) return "bad job id";
  if (u.cid !== undefined && !(typeof u.cid === "string" && CID.test(u.cid))) return "bad cid";
  if (!when(u.at)) return "at must be an ISO 8601 time";
  const kind = u.kind || "visit";
  if (kind === "visit") {
    if (!VISIT.has(u.status)) return "unknown visit result";
    if (!text(u.note, 500)) return "note too long";
    if (!when(u.knocked_at)) return "knocked_at must be an ISO 8601 time";
    // Housing Ombudsman (2025): jobs were closed on unevidenced "no access" claims. A no-access visit needs
    // the time of the knock (not in the future) and at least one thing the tradesperson did to reach the tenant.
    if (NO_ACCESS.has(u.status)) {
      if (!u.knocked_at) return "no access needs the time of the knock";
      if (!notFuture(u.knocked_at)) return "knocked_at is in the future";
      if (!Array.isArray(u.actions) || !u.actions.length || new Set(u.actions).size !== u.actions.length || !u.actions.every((a) => STEPS.has(a))) return "no access needs what was tried";
    }
    return null;
  }
  if (kind === "review") return VIA.has(u.via) && u.status === "review" && words(u.note, 1000) ? null : "a review needs a reason";
  if (kind === "confirm") return VIA.has(u.via) && (u.status === "fixed" || u.status === "still broken") && text(u.note, 500) ? null : "fixed or still broken";
  if (kind === "intake") {
    // How a report arrived (channel, language, interpreter) is recorded to book interpreters and audit fairness; it is never scored.
    const a = u.answers;
    if (u.status !== "new" || !CHANNELS.has(u.channel) || !INTERPRETERS.has(u.interpreter) || !text(u.language, 60)) return "unknown channel or interpreter";
    if (!words(u.words, 1000)) return "a report needs the tenant's words";
    if (!isHazard(u.hazard)) return "unknown fault";
    if (!Number.isInteger(u.first_contact_day) || u.first_contact_day < FIRST_DAY[0] || u.first_contact_day > FIRST_DAY[1]) return "first_contact_day out of range";
    if (u.joined_to !== undefined && !(typeof u.joined_to === "string" && ID.test(u.joined_to))) return "bad joined_to";
    if (!a || typeof a !== "object" || Array.isArray(a)) return "answers must be an object";
    const ok = Object.entries(a).every(([q, v]) => QUESTIONS.has(q)
      && (q === "people" ? v === null || (Number.isInteger(v) && v >= 1 && v <= 40) : ["yes", "no", "unknown"].includes(v)));
    return ok ? null : "only the standard questions";
  }
  if (kind === "urgency") {
    if (!["confirmed", "changed"].includes(u.status)) return "confirmed or changed";
    if (!isHazard(u.from_hazard) || !isHazard(u.to_hazard)) return "unknown fault";
    if (![1, 2, 3].includes(u.tier)) return "tier must be 1, 2 or 3";
    // never trust the categories the phone states: they must be what the fault and the household's tier make them
    if (u.from_category !== catOf(u.from_hazard, u.tier) || u.to_category !== catOf(u.to_hazard, u.tier)) return "category doesn't match the fault and tier";
    if (!SOURCES.has(u.source)) return "unknown source";
    if (!words(u.reason, 300)) return "a check needs a reason the tenant can read";
    if ((u.status === "confirmed") !== (u.from_hazard === u.to_hazard)) return "a kept fault is confirmed, a new one is changed";
    if (u.status === "confirmed" && u.from_category !== u.to_category) return "confirmed can't change the category";
    // never downgrade danger without a person who spoke to the tenant or saw the fault (and never on the reader's word)
    if (u.from_category === "immediate" && RANK[u.to_category] > RANK.immediate && !SAW_OR_SPOKE.has(u.source)) return "lowering a dangerous repair needs someone who spoke to the tenant or saw it";
    return null;
  }
  if (kind === "assign") {
    return ASSIGN.has(u.status) && TRADES.has(u.trade) && (u.status === "crew" ? typeof u.crew === "string" && u.crew.length > 0 && u.crew.length <= 80 : u.crew === undefined)
      ? null : "next, a named crew, or open to a known trade";
  }
  if (kind === "accept") return u.status === "accepted" && typeof u.crew === "string" && u.crew.length > 0 && u.crew.length <= 80 ? null : "accept needs the crew";
  if (kind === "escalate") return u.status === "worse" && ["tenant", "tradesperson", "cho"].includes(u.from) && text(u.note, 500) ? null : "who says it got worse";
  if (kind === "event") {
    return u.status === "declared" && EVENTS.has(u.event) && Array.isArray(u.communities) && u.communities.length > 0 && u.communities.length <= 40
      && u.communities.every((c) => typeof c === "string" && COMMUNITY.test(c)) && new Set(u.communities).size === u.communities.length
      && Number.isInteger(u.start_day) && u.start_day >= FIRST_DAY[0] && u.start_day <= FIRST_DAY[1] && text(u.note, 500) ? null : "a known event over real communities";
  }
  if (kind === "interpreter") {
    return u.status === "requested" && VIA.has(u.via) && words(u.language, 60) && INTERPRETERS.has(u.interpreter) && text(u.note, 500)
      ? null : "an interpreter call-back needs the language and the service";
  }
  return "unknown kind";
}
export const valid = (u) => problem(u) === null;

const tooBig = (res, limit, extra) => res.status(413).json({
  error: `Too many updates in one go: send at most ${MAX_UPDATES} updates and ${MAX_BYTES / 1024} KB in one request, and the rest in further requests.`,
  limit, max_updates: MAX_UPDATES, max_bytes: MAX_BYTES, ...extra });

async function handle(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  let raw = req.body;
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
  const sent = typeof raw === "string" ? raw : JSON.stringify(raw === undefined ? {} : raw);
  const bytes = Buffer.byteLength(sent || "");
  if (bytes > MAX_BYTES) return tooBig(res, "bytes", { bytes });
  let body;
  if (typeof raw === "string") {
    try { body = JSON.parse(raw || "{}"); } catch { return res.status(400).json({ error: "Not JSON" }); }
  } else body = raw === undefined ? {} : raw;
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.updates)) return res.status(400).json({ error: "Expected { updates: [...] }" });
  if (body.updates.length > MAX_UPDATES) return tooBig(res, "updates", { updates: body.updates.length, bytes });
  // Sign-in: with REQUIRE_SIGN_IN=1, every request needs a valid token and a person can only touch their own jobs.
  const demo = process.env.REQUIRE_SIGN_IN !== "1";
  let claims = null;
  if (!demo) {
    claims = verify(String((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, ""), process.env.AUTH_SECRET);
    if (!claims) return res.status(401).json({ error: "Sign in again" });
  }
  let received = 0;
  const rejected = [], rejectedCids = [], reasons = [];
  for (const u of body.updates) {
    const why = problem(u) || (demo || allowed(claims, u) ? null : "not allowed for this sign-in");
    if (!why) { received++; continue; }
    const ok = u && typeof u === "object";
    const key = `${String(ok ? u.id : u).slice(0, 32)}:${(ok && u.kind) || "visit"}`;
    const cid = ok && typeof u.cid === "string" && CID.test(u.cid) ? u.cid : undefined;
    rejected.push(key);
    if (cid) rejectedCids.push(cid);
    reasons.push(cid ? { key, cid, why } : { key, why });
  }
  // rejected keys ("J07567:visit") and cids go back to the phone, which keeps those updates and says what went wrong
  res.status(200).json({ received, rejected, rejected_cids: rejectedCids, reasons, mode: demo ? "demo" : "signed-in", at: new Date().toISOString() });
}

export default async function handler(req, res) {
  try { return await handle(req, res); }
  catch { return res.status(400).json({ error: "Could not read the updates" }); }   // never crash on a strange body
}
