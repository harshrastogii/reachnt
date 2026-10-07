// Receives updates queued on a phone while it had no signal:
//   visit   - a tradesperson's result: "done", or why not ("No one home" needs the time and what was tried)
//   review  - a tenant asks a person to review how their repair was ranked (answered within 10 working days)
//   confirm - a tenant says whether the repair worked; "still broken" reopens it as a repeat
// Prototype: it validates and acknowledges them. In production this writes to the ops tables in docs/schema.sql
// using a server-side DATABASE_URL, never a key in the browser, and only for the signed-in person's own jobs.
import { verify, allowed } from "./_auth.js";

const VISIT = new Set(["done", "No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work"]);
const NO_ACCESS = new Set(["No one home", "Can't get in"]);
const STEPS = new Set(["Left a card", "Phoned the tenant", "Spoke to family or a neighbour", "Took a photo of the door"]);
const MAX_BYTES = 64 * 1024;       // a day's updates from one phone are a few kilobytes
const MAX_UPDATES = 200;
const ID = /^[A-Z0-9-]{3,32}$/;    // job ids look like J07567
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
  if (kind === "review") return u.status === "review" && typeof u.note === "string" && u.note.trim().length > 0 && u.note.length <= 1000;
  if (kind === "confirm") return (u.status === "fixed" || u.status === "still broken") && text(u.note, 500);
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
