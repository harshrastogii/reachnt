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
// A Community Housing Officer can send review, confirm and escalate for a tenant who doesn't use the app: the update
// carries via: "cho", so the tenant's timeline says who recorded it.
// Prototype: it validates and acknowledges them. In production this writes to the ops tables in docs/schema.sql
// using a server-side DATABASE_URL, never a key in the browser, and only for the signed-in person's own jobs.
import { verify, allowed } from "./_auth.js";

const VISIT = new Set(["done", "No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work"]);
const NO_ACCESS = new Set(["No one home", "Can't get in"]);
const STEPS = new Set(["Left a card", "Phoned the tenant", "Spoke to family or a neighbour", "Took a photo of the door"]);
const MAX_BYTES = 64 * 1024;       // a day's updates from one phone are a few kilobytes
const MAX_UPDATES = 200;
const ID = /^[A-Z0-9-]{3,32}$/;    // job ids look like J07567 (N0001 for a report logged in the portal)
const HAZARD = /^[a-z_]{3,40}$/;   // a fault id from config/taxonomy.yaml
const CATS = new Set(["immediate", "urgent", "routine"]);
const RANK = { immediate: 0, urgent: 1, routine: 2 };
const CHANNELS = new Set(["line", "cho", "rhmo", "trade", "app", "counter"]);
const INTERPRETERS = new Set(["none", "ais", "tis", "nrs", "family"]);
const QUESTIONS = new Set(["danger_now", "young_child", "elder", "health", "people", "before"]);
const SOURCES = new Set(["called_in", "phoned", "cho", "rhmo", "trade", "photo", "review"]);
const SAW_OR_SPOKE = new Set(["called_in", "phoned", "cho", "rhmo", "trade"]);   // the only sources that may lower a dangerous repair
const ASSIGN = new Set(["next", "crew", "open"]);
const TRADES = new Set(["plumber", "electrician", "carpenter", "aircon", "pest", "general"]);
const VIA = new Set([undefined, "tenant", "cho", "line"]);   // who recorded a tenant's update: themselves, their housing officer, the repairs line
const EVENTS = new Set(["flood", "cyclone", "fire", "storm"]);
const CID = /^C\d{2,3}$/;
const text = (v, max) => v === undefined || (typeof v === "string" && v.length <= max);
const when = (v) => v === undefined || (typeof v === "string" && !Number.isNaN(Date.parse(v)));

function valid(u) {
  if (!u || typeof u !== "object" || typeof u.id !== "string" || !ID.test(u.id) || !when(u.at)) return false;
  const kind = u.kind || "visit";
  if (kind === "visit") {
    if (!VISIT.has(u.status) || !text(u.note, 500)) return false;
    // Housing Ombudsman (2025): jobs were closed on unevidenced "no access" claims. A no-access visit needs
    // the time of the knock and at least one thing the tradesperson did to reach the tenant.
    if (NO_ACCESS.has(u.status)) return when(u.knocked_at) && !!u.knocked_at && Array.isArray(u.actions) && u.actions.length > 0 && u.actions.every((a) => STEPS.has(a));
    return true;
  }
  if (kind === "review") return VIA.has(u.via) && u.status === "review" && typeof u.note === "string" && u.note.trim().length > 0 && u.note.length <= 1000;
  if (kind === "confirm") return VIA.has(u.via) && (u.status === "fixed" || u.status === "still broken") && text(u.note, 500);
  if (kind === "intake") {
    // How a report arrived (channel, language, interpreter) is recorded to book interpreters and audit fairness; it is never scored.
    const a = u.answers;
    if (u.status !== "new" || !CHANNELS.has(u.channel) || !INTERPRETERS.has(u.interpreter) || !text(u.language, 60)) return false;
    if (typeof u.words !== "string" || !u.words.trim() || u.words.length > 1000 || !HAZARD.test(String(u.hazard))) return false;
    if (!Number.isInteger(u.first_contact_day) || (u.joined_to !== undefined && !ID.test(String(u.joined_to)))) return false;
    if (!a || typeof a !== "object" || Array.isArray(a)) return false;
    return Object.entries(a).every(([q, v]) => QUESTIONS.has(q) && (q === "people" ? v === null || (Number.isInteger(v) && v >= 1 && v <= 40) : ["yes", "no", "unknown"].includes(v)));
  }
  if (kind === "urgency") {
    if (!["confirmed", "changed"].includes(u.status) || !HAZARD.test(String(u.from_hazard)) || !HAZARD.test(String(u.to_hazard))) return false;
    if (!CATS.has(u.from_category) || !CATS.has(u.to_category) || !SOURCES.has(u.source)) return false;
    if (typeof u.reason !== "string" || !u.reason.trim() || u.reason.length > 300) return false;
    if ((u.status === "confirmed") !== (u.from_hazard === u.to_hazard)) return false;
    // never downgrade danger without a person who spoke to the tenant or saw the fault (and never on the reader's word)
    if (u.from_category === "immediate" && RANK[u.to_category] > RANK.immediate && !SAW_OR_SPOKE.has(u.source)) return false;
    return true;
  }
  if (kind === "assign") return ASSIGN.has(u.status) && TRADES.has(u.trade) && (u.status === "crew" ? typeof u.crew === "string" && u.crew.length > 0 && u.crew.length <= 80 : u.crew === undefined);
  if (kind === "accept") return u.status === "accepted" && typeof u.crew === "string" && u.crew.length > 0 && u.crew.length <= 80;
  if (kind === "escalate") return u.status === "worse" && ["tenant", "tradesperson", "cho"].includes(u.from) && text(u.note, 500);
  if (kind === "event") {
    return u.status === "declared" && EVENTS.has(u.event) && Array.isArray(u.communities) && u.communities.length > 0 && u.communities.length <= 40
      && u.communities.every((c) => CID.test(c)) && Number.isInteger(u.start_day) && text(u.note, 500);
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > MAX_BYTES) return res.status(413).json({ error: "Too many updates in one go" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; }
  catch { return res.status(400).json({ error: "Not JSON" }); }
  if (!Array.isArray(body.updates)) return res.status(400).json({ error: "Expected { updates: [...] }" });
  if (body.updates.length > MAX_UPDATES) return res.status(413).json({ error: "Too many updates in one go" });
  // Sign-in: with REQUIRE_SIGN_IN=1, every request needs a valid token and a person can only touch their own jobs.
  const demo = process.env.REQUIRE_SIGN_IN !== "1";
  let claims = null;
  if (!demo) {
    claims = verify(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), process.env.AUTH_SECRET);
    if (!claims) return res.status(401).json({ error: "Sign in again" });
  }
  const accepted = [], rejected = [];
  for (const u of body.updates) {
    const key = `${String(u && u.id).slice(0, 32)}:${(u && u.kind) || "visit"}`;
    (valid(u) && (demo || allowed(claims, u)) ? accepted : rejected).push(key);
  }
  // rejected keys ("J07567:visit") go back to the phone, which keeps those updates and says what went wrong
  res.status(200).json({ received: accepted.length, rejected, mode: demo ? "demo" : "signed-in", at: new Date().toISOString() });
}
