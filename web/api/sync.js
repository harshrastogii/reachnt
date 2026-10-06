// Receives field updates queued on a phone while it had no signal ("done", "couldn't do it: no one home").
// Prototype: it validates and acknowledges them. In production this writes to ops.wait_reason / ops.job
// in Postgres (docs/schema.sql) using a server-side DATABASE_URL, never a key in the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const updates = Array.isArray(body.updates) ? body.updates.slice(0, 500) : [];
  const ok = updates.filter((u) => u && typeof u.id === "string" && typeof u.status === "string");
  res.status(200).json({ received: ok.length, at: new Date().toISOString() });
}
