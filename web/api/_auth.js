// Who may send what. Files starting with "_" are not routes on Vercel; this is imported by sync.js.
//
// A sign-in service (for example a tenant one-time code by SMS, or a tradesperson login) issues a short-lived
// token signed with AUTH_SECRET (HS256 JWT) carrying: role, the job ids that person may touch, and for a
// tradesperson the open offers in their trade they may accept.
//   tenant        -> their own jobs; may send "review", "confirm" and "escalate" (it got worse)
//   tradesperson  -> the jobs on their run this week; may send "visit" and "escalate"; may "accept" jobs in `offers`
//   coordinator   -> jobs in their hub (row-level security in docs/schema.sql scopes the hub); may send "urgency" and "assign",
//                    and log a new report ("intake")
//   intake        -> repairs-line staff and Community Housing Officers; may log a new report ("intake") and record an
//                    urgency check after speaking to the tenant
// With REQUIRE_SIGN_IN=1 set in Vercel, sync.js refuses anything without a valid token. Without it the portal runs
// in demo mode (made-up data, no accounts). The sign-in service itself is not part of the prototype.
import crypto from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export const ROLE_KINDS = {
  tenant: new Set(["review", "confirm", "escalate"]),
  tradesperson: new Set(["visit", "escalate", "accept"]),
  coordinator: new Set(["urgency", "assign", "intake"]),
  intake: new Set(["intake", "urgency"]),
};

export function sign(claims, secret, ttlSeconds = 8 * 3600) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

// Returns the claims, or null if the token is missing, forged, the wrong algorithm, or expired.
export function verify(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let head;
  try { head = JSON.parse(fromB64url(parts[0]).toString()); } catch { return null; }
  if (head.alg !== "HS256") return null;                       // never accept "none" or a different algorithm
  const want = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  const got = fromB64url(parts[2]);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let claims;
  try { claims = JSON.parse(fromB64url(parts[1]).toString()); } catch { return null; }
  if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
  if (!ROLE_KINDS[claims.role] || !Array.isArray(claims.jobs)) return null;
  return claims;
}

// May this signed-in person send this update?
export function allowed(claims, update) {
  const kind = update.kind || "visit";
  if (!ROLE_KINDS[claims.role].has(kind)) return false;
  if (kind === "intake") return true;                                   // a new report has no job yet
  if (claims.role === "coordinator" || claims.role === "intake") return true;   // hub scope: enforced by the database
  if (kind === "accept") return Array.isArray(claims.offers) && claims.offers.includes(update.id);
  if (kind === "escalate" && update.from !== claims.role) return false; // a tenant can't speak as the tradesperson
  return claims.jobs.includes(update.id);
}
