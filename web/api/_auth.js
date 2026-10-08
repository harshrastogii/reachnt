// Who may send what. Files starting with "_" are not routes on Vercel; this is imported by sync.js.
//
// A sign-in service (for example a tenant one-time code by SMS, or a tradesperson login) issues a short-lived
// token signed with AUTH_SECRET (HS256 JWT) carrying: role, the job ids that person may touch, and for a
// tradesperson the open offers in their trade they may accept.
//   tenant        -> their own jobs; may send "review", "confirm", "escalate" (it got worse) and "interpreter"
//   tradesperson  -> the jobs on their run this week; may send "visit" and "escalate"; may "accept" jobs in `offers`
//                    (an accept on its own: no "assign" is needed)
//   coordinator   -> may send "urgency" (any source), "assign", "intake", "event" and "interpreter". The token carries
//                    no job list, so the server cannot scope a coordinator to a hub: the database does
//                    (ops.coordinator_hub and the row-level security in docs/schema.sql).
//   intake        -> repairs-line staff; may log a new report ("intake"), ask for an interpreter call-back, and record
//                    an urgency check only as the person who spoke to the tenant (source "called_in" or "phoned")
//   housing_officer -> a Community Housing Officer; may log reports, and for tenants in their own communities (`jobs`)
//                    record urgency checks (source "cho" only), ask for an interpreter, and send review, confirm and
//                    escalate on the tenant's behalf (via: "cho")
// With REQUIRE_SIGN_IN=1 set in Vercel, sync.js refuses anything without a valid token and applies these rules. Without
// it the portal runs in demo mode (made-up data, no accounts) and only the content rules in sync.js apply. The sign-in
// service itself is not part of the prototype.
import crypto from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export const ROLE_KINDS = {
  tenant: new Set(["review", "confirm", "escalate", "interpreter"]),
  tradesperson: new Set(["visit", "escalate", "accept"]),
  coordinator: new Set(["urgency", "assign", "intake", "event", "interpreter"]),
  intake: new Set(["intake", "urgency", "interpreter"]),
  housing_officer: new Set(["intake", "urgency", "review", "confirm", "escalate", "interpreter"]),
};

// Who may say how an urgency check was done. A housing officer saw it ("cho"); repairs-line staff spoke to the tenant
// ("called_in" when the tenant rang, "phoned" when staff rang them); the coordinator records any of them, including
// what a maintenance officer or tradesperson reported. Tenants and tradespeople don't record checks.
export const URGENCY_SOURCES = {
  housing_officer: new Set(["cho"]),
  intake: new Set(["called_in", "phoned"]),
  coordinator: new Set(["called_in", "phoned", "cho", "rhmo", "trade", "photo", "review"]),
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
  if (typeof claims.role !== "string" || !Object.prototype.hasOwnProperty.call(ROLE_KINDS, claims.role)) return null;   // not "constructor"
  if (!Array.isArray(claims.jobs)) return null;
  return claims;
}

// May this signed-in person send this update? (sync.js has already checked its content.)
export function allowed(claims, update) {
  const kind = update.kind || "visit";
  if (!ROLE_KINDS[claims.role].has(kind)) return false;
  if (kind === "urgency" && !(Object.prototype.hasOwnProperty.call(URGENCY_SOURCES, claims.role) && URGENCY_SOURCES[claims.role].has(update.source))) return false;
  if (kind === "intake" || kind === "event") return true;               // a new report has no job yet; an event covers an area
  if (claims.role === "housing_officer") {                              // only for tenants in their own communities
    const own = claims.jobs.includes(update.id);
    if (kind === "urgency") return own;
    if (kind === "escalate") return own && update.from === "cho";
    if (kind === "interpreter") return own && (update.via === undefined || update.via === "cho");
    return own && update.via === "cho";                                 // review and confirm, recorded for the tenant
  }
  if (claims.role === "coordinator" || claims.role === "intake") return true;   // hub scope: enforced by the database
  if (kind === "accept") return Array.isArray(claims.offers) && claims.offers.includes(update.id);
  if (kind === "escalate" && update.from !== claims.role) return false; // a tenant can't speak as the tradesperson
  if (["review", "confirm", "interpreter"].includes(kind) && update.via && update.via !== "tenant") return false;   // nor as the housing officer
  return claims.jobs.includes(update.id);
}
