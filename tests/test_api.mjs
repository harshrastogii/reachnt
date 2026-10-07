// Checks for the portal's server function (web/api/sync.js): input validation, no-access evidence, and sign-in rules.
//   node tests/test_api.mjs
import assert from "node:assert/strict";
import handler from "../web/api/sync.js";
import { sign } from "../web/api/_auth.js";

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
console.log(`${n} API checks passed`);
