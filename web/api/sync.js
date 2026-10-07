// Receives field updates queued on a phone while it had no signal ("done", "couldn't do it: no one home").
// Prototype: it validates and acknowledges them. In production this writes to ops.wait_reason / ops.job
// in Postgres (docs/schema.sql) using a server-side DATABASE_URL, never a key in the browser, and only for a
// signed-in tradesperson's own jobs.
const STATUSES = new Set(["done", "No one home", "Can't get in", "Need parts", "Needs another trade", "Unsafe to work"]);   // the run sheet buttons
const MAX_BYTES = 64 * 1024;       // a day's updates from one phone are a few kilobytes
const MAX_UPDATES = 200;
const ID = /^[A-Z0-9-]{3,32}$/;    // job ids look like J07567

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > MAX_BYTES) return res.status(413).json({ error: "Too many updates in one go" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; }
  catch { return res.status(400).json({ error: "Not JSON" }); }
  if (!Array.isArray(body.updates)) return res.status(400).json({ error: "Expected { updates: [...] }" });
  if (body.updates.length > MAX_UPDATES) return res.status(413).json({ error: "Too many updates in one go" });
  const accepted = [], rejected = [];
  for (const u of body.updates) {
    const ok = u && typeof u === "object" && typeof u.id === "string" && ID.test(u.id) && STATUSES.has(u.status)
      && (u.note === undefined || (typeof u.note === "string" && u.note.length <= 500))
      && (u.at === undefined || !Number.isNaN(Date.parse(u.at)));
    (ok ? accepted : rejected).push(ok ? u.id : String(u && u.id).slice(0, 32));
  }
  // rejected ids go back to the phone so it can keep them and say what went wrong, rather than losing them
  res.status(200).json({ received: accepted.length, rejected, at: new Date().toISOString() });
}
