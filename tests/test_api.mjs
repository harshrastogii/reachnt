// Checks for the portal's server function (web/api/sync.js): input validation, no-access evidence, and sign-in rules.
//   node tests/test_api.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
// the repository keeps the portal in web/; the submission zip keeps it in 3_Interactive_Prototype/web/
const API = ["../web/api/", "../../3_Interactive_Prototype/web/api/"].map((p) => new URL(p, import.meta.url)).find((u) => fs.existsSync(u));
const { default: handler } = await import(new URL("sync.js", API));
const { sign } = await import(new URL("_auth.js", API));

const call = (body, headers = {}, method = "POST") => new Promise((done) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { done({ code: this.code, ...j }); } };
  handler({ method, body, headers }, res);
});
const now = new Date().toISOString();
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log("ok", name); };

delete process.env.REQUIRE_SIGN_IN;
await check("GET is refused", async () => assert.equal((await call({}, {}, "GET")).code, 405));
await check("broken JSON is refused", async () => assert.equal((await call("{bad")).code, 400));
await check("a missing updates list is refused", async () => assert.equal((await call({ updates: "x" })).code, 400));
await check("too many updates are refused", async () => assert.equal((await call({ updates: Array(201).fill({ id: "J00001", status: "done" }) })).code, 413));
await check("an oversized body is refused", async () => assert.equal((await call(JSON.stringify({ updates: ["a".repeat(70000)] }))).code, 413));
await check("no one home without evidence is rejected; with it, accepted", async () => {
  const r = await call({ updates: [
    { id: "J07568", status: "No one home" },
    { id: "J07569", status: "No one home", knocked_at: now, actions: ["Left a card"] },
    { id: "J07570", status: "No one home", knocked_at: now, actions: ["Kicked the door"] }] });
  assert.deepEqual(r.rejected, ["J07568:visit", "J07570:visit"]);
  assert.equal(r.received, 1);
});
await check("a review needs a reason; a confirmation needs fixed or still broken", async () => {
  const r = await call({ updates: [
    { id: "J07571", kind: "review", status: "review", note: "" },
    { id: "J07572", kind: "review", status: "review", note: "my nana has asthma" },
    { id: "J07573", kind: "confirm", status: "still broken" },
    { id: "J07574", kind: "confirm", status: "maybe" },
    { id: "<script>", status: "done" }] });
  assert.deepEqual(r.rejected, ["J07571:review", "J07574:confirm", "<script>:visit"]);
});

const intake = (extra = {}) => ({ id: "N0001", kind: "intake", status: "new", channel: "cho", words: "toilet broke pls come", language: "Kriol",
  interpreter: "ais", hazard: "toilet_blocked", first_contact_day: 208, answers: { young_child: "yes", elder: "unknown", people: 9, before: "no" }, ...extra });
await check("a new report needs the tenant's words, a known channel and only the standard questions", async () => {
  const r = await call({ updates: [intake(), intake({ id: "N0002", words: " " }), intake({ id: "N0003", channel: "fax" }),
    intake({ id: "N0004", answers: { english_level: "low" } }), intake({ id: "N0005", answers: { people: 99 } })] });
  assert.deepEqual(r.rejected, ["N0002:intake", "N0003:intake", "N0004:intake", "N0005:intake"]);
});
const urg = (extra = {}) => ({ id: "J07600", kind: "urgency", status: "changed", from_hazard: "electrical_danger", to_hazard: "power_point",
  from_category: "immediate", to_category: "urgent", source: "rhmo", reason: "Officer checked: no sparks, plug dead", ...extra });
await check("lowering a dangerous repair needs someone who spoke to the tenant or saw it, and a reason", async () => {
  const r = await call({ updates: [urg(), urg({ id: "J07601", source: "photo" }), urg({ id: "J07602", source: "review" }), urg({ id: "J07603", reason: "" }),
    urg({ id: "J07604", from_hazard: "hot_water", from_category: "urgent", to_hazard: "electrical_danger", to_category: "immediate", source: "photo" })] });
  assert.deepEqual(r.rejected, ["J07601:urgency", "J07602:urgency", "J07603:urgency"]);   // raising it on a photo is fine
});
await check("a check that keeps the fault must say confirmed, and a change must say changed", async () => {
  const r = await call({ updates: [urg({ status: "confirmed" }), urg({ id: "J07605", status: "confirmed", to_hazard: "electrical_danger", to_category: "immediate" })] });
  assert.deepEqual(r.rejected, ["J07600:urgency"]);
});
await check("who goes: the next trip, a named crew, or open to any trade; accept and it-got-worse are checked", async () => {
  const r = await call({ updates: [
    { id: "J07610", kind: "assign", status: "open", trade: "plumber" }, { id: "J07611", kind: "assign", status: "crew", trade: "plumber" },
    { id: "J07612", kind: "assign", status: "crew", trade: "plumber", crew: "Katherine plumber crew B" }, { id: "J07613", kind: "assign", status: "open", trade: "astronaut" },
    { id: "J07614", kind: "accept", status: "accepted", crew: "Katherine plumber crew A" }, { id: "J07615", kind: "escalate", status: "worse", from: "tenant" },
    { id: "J07616", kind: "escalate", status: "worse", from: "neighbour" }] });
  assert.deepEqual(r.rejected, ["J07611:assign", "J07613:assign", "J07616:escalate"]);
});

process.env.REQUIRE_SIGN_IN = "1";
process.env.AUTH_SECRET = "test-secret-only-for-this-check";
const S = process.env.AUTH_SECRET;
const U = { updates: [{ id: "J07567", status: "done" }, { id: "J07568", kind: "review", status: "review", note: "why?" }] };
const bearer = (t) => ({ authorization: `Bearer ${t}` });
await check("signed-in mode refuses no token, a forged token, alg none and an expired token", async () => {
  assert.equal((await call(U)).code, 401);
  assert.equal((await call(U, bearer(sign({ role: "tenant", jobs: ["J07568"] }, "wrong-secret")))).code, 401);
  assert.equal((await call(U, bearer("eyJhbGciOiJub25lIn0.eyJyb2xlIjoidGVuYW50Iiwiam9icyI6WyJKMDc1NjgiXSwiZXhwIjo5OTk5OTk5OTk5fQ."))).code, 401);
  assert.equal((await call(U, bearer(sign({ role: "tenant", jobs: ["J07568"] }, S, -10)))).code, 401);
});
await check("a tenant can ask for a review of their own job but cannot mark a job done", async () => {
  const r = await call(U, bearer(sign({ role: "tenant", jobs: ["J07568"] }, S)));
  assert.deepEqual(r.rejected, ["J07567:visit"]);
});
await check("a tradesperson can update jobs on their run only", async () => {
  const r = await call({ updates: [{ id: "J07567", status: "done" }, { id: "J09999", status: "done" }] }, bearer(sign({ role: "tradesperson", jobs: ["J07567"] }, S)));
  assert.deepEqual(r.rejected, ["J09999:visit"]);
});
await check("a coordinator can check urgency and reassign but cannot mark a job done", async () => {
  const r = await call({ updates: [urg(), { id: "J07610", kind: "assign", status: "next", trade: "plumber" }, { id: "J07567", status: "done" }] },
    bearer(sign({ role: "coordinator", jobs: [], hub: "Katherine" }, S)));
  assert.deepEqual(r.rejected, ["J07567:visit"]);
});
await check("a tradesperson can accept only jobs offered to them, and a tenant can say it got worse only as the tenant", async () => {
  const t = await call({ updates: [{ id: "J07614", kind: "accept", status: "accepted", crew: "A" }, { id: "J07699", kind: "accept", status: "accepted", crew: "A" }] },
    bearer(sign({ role: "tradesperson", jobs: [], offers: ["J07614"] }, S)));
  assert.deepEqual(t.rejected, ["J07699:accept"]);
  const ten = await call({ updates: [{ id: "J07568", kind: "escalate", status: "worse", from: "tenant" }, { id: "J07568", kind: "escalate", status: "worse", from: "tradesperson" }] },
    bearer(sign({ role: "tenant", jobs: ["J07568"] }, S)));
  assert.equal(ten.received, 1);
});
await check("repairs-line staff can log a report but cannot reassign a job", async () => {
  const r = await call({ updates: [intake(), { id: "J07610", kind: "assign", status: "next", trade: "plumber" }] }, bearer(sign({ role: "intake", jobs: [] }, S)));
  assert.deepEqual(r.rejected, ["J07610:assign"]);
});
await check("a housing officer can record a fix, a still-broken or a review for tenants in their communities only", async () => {
  const cho = bearer(sign({ role: "housing_officer", jobs: ["J07700", "J07701"] }, S));
  const r = await call({ updates: [
    { id: "J07700", kind: "confirm", status: "still broken", via: "cho", note: "Told me at the shop: blocked again" },
    { id: "J07701", kind: "review", status: "review", via: "cho", note: "Nana uses a wheelchair; the ramp is broken" },
    { id: "J07701", kind: "escalate", status: "worse", from: "cho" },
    { id: "J07799", kind: "confirm", status: "fixed", via: "cho" },                  // not their community
    { id: "J07700", kind: "confirm", status: "fixed" },                              // must say it was recorded for the tenant
    { id: "J07700", kind: "visit", status: "done" }] }, cho);                        // and can't mark a job done
  assert.deepEqual(r.rejected, ["J07799:confirm", "J07700:confirm", "J07700:visit"]);
});
await check("a tenant can't send an update as if the housing officer recorded it", async () => {
  const r = await call({ updates: [{ id: "J07568", kind: "confirm", status: "fixed", via: "cho" }] }, bearer(sign({ role: "tenant", jobs: ["J07568"] }, S)));
  assert.deepEqual(r.rejected, ["J07568:confirm"]);
});
await check("only a coordinator can declare a flood or cyclone, over real communities", async () => {
  const ev = (extra = {}) => ({ id: "EV-0001", kind: "event", status: "declared", event: "flood", communities: ["C48", "C47"], start_day: 189, ...extra });
  const c = await call({ updates: [ev(), ev({ id: "EV-0002", event: "alien invasion" }), ev({ id: "EV-0003", communities: ["Kalkarindji"] })] },
    bearer(sign({ role: "coordinator", jobs: [] }, S)));
  assert.deepEqual(c.rejected, ["EV-0002:event", "EV-0003:event"]);
  const t = await call({ updates: [ev()] }, bearer(sign({ role: "tradesperson", jobs: [] }, S)));
  assert.deepEqual(t.rejected, ["EV-0001:event"]);
});
console.log(`${n} API checks passed`);
