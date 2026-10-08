// Checks for the portal's server functions: web/api/sync.js (input validation, no-access evidence, urgency categories
// worked out from the fault and tier, sign-in rules per role) and web/api/warnings.js (roads and weather, and when the
// saved snapshot is used).
//   node tests/test_api.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
// the repository keeps the portal in web/; the submission zip keeps it in 3_Interactive_Prototype/web/
const API = ["../web/api/", "../../3_Interactive_Prototype/web/api/"].map((p) => new URL(p, import.meta.url)).find((u) => fs.existsSync(u));
const { default: handler } = await import(new URL("sync.js", API));
const { sign } = await import(new URL("_auth.js", API));
const warnings = await import(new URL("warnings.js", API));
const { CATEGORY, LIFELINE } = await import(new URL("_taxonomy.js", API));

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
  interpreter: "ais", hazard: "toilet_blocked", first_contact_day: 208, answers: { child_mobility: "yes", baby_elder: "unknown", people: 9, before: "no" }, ...extra });
await check("a new report needs the tenant's words, a known channel and only the standard questions", async () => {
  const r = await call({ updates: [intake(), intake({ id: "N0002", words: " " }), intake({ id: "N0003", channel: "fax" }),
    intake({ id: "N0004", answers: { english_level: "low" } }), intake({ id: "N0005", answers: { people: 99 } })] });
  assert.deepEqual(r.rejected, ["N0002:intake", "N0003:intake", "N0004:intake", "N0005:intake"]);
});
const urg = (extra = {}) => ({ id: "J07600", kind: "urgency", status: "changed", tier: 3, from_hazard: "electrical_danger", to_hazard: "power_point",
  from_category: "immediate", to_category: "routine", source: "rhmo", reason: "Officer checked: no sparks, plug dead", ...extra });
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

// ---- urgency categories come from the fault and the household's tier, never from what the phone says (checks-and-balances-1, -7)
const t1 = (extra = {}) => urg({ id: "J21674", tier: 1, from_hazard: "aircon_fan", from_category: "immediate", to_hazard: "general", to_category: "routine",
  source: "photo", reason: "Photo shows the fan spinning", ...extra });
await check("a Tier 1 household's lifeline fault is Immediate: lowering it from a photo or a review is rejected", async () => {
  const r = await call({ updates: [t1(), t1({ id: "J21675", source: "review" }),
    t1({ id: "N0001", from_hazard: "no_power", to_hazard: "power_point", reason: "Review of the report" }),
    t1({ id: "J21676", from_hazard: "no_water", to_hazard: "laundry" })] });
  assert.deepEqual(r.rejected, ["J21674:urgency", "J21675:urgency", "N0001:urgency", "J21676:urgency"]);
});
await check("the same Tier 1 lowering by a person who spoke to the tenant or saw it, with a reason, is accepted", async () => {
  const r = await call({ updates: [t1({ source: "phoned", reason: "Rang the tenant: the fan works, one speed is broken" }),
    t1({ id: "N0001", from_hazard: "no_power", to_hazard: "power_point", source: "cho", reason: "Saw it: one dead plug, the rest of the house has power" }),
    t1({ id: "J21677", source: "phoned", reason: " " })] });
  assert.deepEqual(r.rejected, ["J21677:urgency"]);
  assert.equal(r.received, 2);
});
await check("categories that don't match the fault and tier are rejected (the old portal sent the fault's own category)", async () => {
  const r = await call({ updates: [
    t1({ from_category: "routine" }),                                                          // Tier 1 aircon_fan is Immediate, not routine
    t1({ id: "N0001", from_hazard: "no_power", from_category: "urgent", to_hazard: "power_point" }),   // the audit's N0001 case
    urg({ id: "J07620", tier: 3, from_hazard: "no_power", from_category: "immediate", to_hazard: "power_point", source: "photo" }),   // Tier 3 no_power is urgent
    urg({ id: "J07621", to_category: "urgent" }),                                              // power_point is routine
    urg({ id: "J07622", from_hazard: "electrical_danger", from_category: "urgent", to_hazard: "power_point", source: "photo" }),
    urg({ id: "J07623", status: "confirmed", tier: 1, from_hazard: "no_water", to_hazard: "no_water", from_category: "immediate", to_category: "urgent", source: "phoned" }),
    urg({ id: "J07624", tier: undefined }), urg({ id: "J07625", tier: 4 }), urg({ id: "J07626", tier: "1" }),
    urg({ id: "J07627", tier: 2, from_hazard: "no_power", from_category: "urgent", to_hazard: "power_point", source: "photo" }),       // Tier 2: urgent -> routine on a photo is allowed
    urg({ id: "J07628", status: "confirmed", tier: 1, from_hazard: "no_water", to_hazard: "no_water", from_category: "immediate", to_category: "immediate", source: "photo" })] });
  assert.deepEqual(r.rejected, ["J21674:urgency", "N0001:urgency", "J07620:urgency", "J07621:urgency", "J07622:urgency", "J07623:urgency",
    "J07624:urgency", "J07625:urgency", "J07626:urgency"]);
});
await check("fault ids must be in the taxonomy, for urgency checks and new reports", async () => {
  const r = await call({ updates: [
    urg({ from_hazard: "made_up_fault", to_hazard: "another_fake", status: "changed" }),
    urg({ id: "J07630", to_hazard: "dripping_tap" }), urg({ id: "J07631", to_hazard: "constructor" }), urg({ id: "J07632", to_hazard: "__proto__" }),
    intake({ id: "N0010", hazard: "zzz_not_a_fault" }), intake({ id: "N0011", hazard: "toString" }), intake({ id: "N0012", hazard: undefined })] });
  assert.deepEqual(r.rejected, ["J07600:urgency", "J07630:urgency", "J07631:urgency", "J07632:urgency", "N0010:intake", "N0011:intake", "N0012:intake"]);
});
await check("the taxonomy bundled with the API matches config/taxonomy.yaml and params.yaml", async () => {
  assert.ok(Object.keys(CATEGORY).length >= 20 && LIFELINE.length > 0 && LIFELINE.every((h) => CATEGORY[h]));
  const cfg = ["../config/", "../../config/"].map((p) => new URL(p, import.meta.url)).find((u) => fs.existsSync(new URL("taxonomy.yaml", u)));
  if (!cfg) return;                                                                       // the submission zip may not carry config/
  const yaml = fs.readFileSync(new URL("taxonomy.yaml", cfg), "utf8").split(/\n(?=\S)/).find((b) => b.startsWith("hazards:"));
  const want = Object.fromEntries([...yaml.matchAll(/^  ([a-z_]+):\n(?:    .*\n)*?    category: (\w+)/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(CATEGORY, want, "run python scripts/api_taxonomy.py");
  const life = fs.readFileSync(new URL("params.yaml", cfg), "utf8").match(/lifeline_faults:\s*\[([^\]]*)\]/)[1].split(",").map((x) => x.trim());
  assert.deepEqual(LIFELINE, life, "run python scripts/api_taxonomy.py");
});
await check("first contact must be a whole day index from 0 to 800", async () => {
  const r = await call({ updates: [intake({ first_contact_day: 0 }), intake({ id: "N0021", first_contact_day: 800 }), intake({ id: "N0022", first_contact_day: -1 }),
    intake({ id: "N0023", first_contact_day: 801 }), intake({ id: "N0024", first_contact_day: -99999 }), intake({ id: "N0025", first_contact_day: 1e9 }),
    intake({ id: "N0026", first_contact_day: 2.5 }), intake({ id: "N0027", first_contact_day: "3" })] });
  assert.deepEqual(r.rejected, ["N0022:intake", "N0023:intake", "N0024:intake", "N0025:intake", "N0026:intake", "N0027:intake"]);
});
await check("a body that isn't { updates: [...] } gets 400 and never crashes the function", async () => {
  for (const body of ["null", null, "[]", [], '"x"', "42", 42, "true", Buffer.from("null"), "{\"updates\":null}", undefined]) {
    const r = await call(body);
    assert.equal(r.code, 400, `body ${JSON.stringify(body)}`);
  }
  const ok = await call(Buffer.from(JSON.stringify({ updates: [{ id: "J07567", status: "done" }] })));
  assert.equal(ok.received, 1);
  const r = await call({ updates: [null, "J07567", 7, [], { id: 5 }, { id: "J07567", kind: { a: 1 } }] });
  assert.equal(r.code, 200); assert.equal(r.received, 0); assert.equal(r.rejected.length, 6);
});
await check("times must be ISO 8601, and a knock can't be in the future (a few minutes of clock skew allowed)", async () => {
  const soon = new Date(Date.now() + 2 * 60e3).toISOString(), later = new Date(Date.now() + 10 * 60e3).toISOString();
  const na = (id, knocked_at, extra = {}) => ({ id, status: "No one home", knocked_at, actions: ["Left a card"], ...extra });
  const r = await call({ updates: [na("J07640", now), na("J07641", soon), na("J07642", later), na("J07643", "2099-01-01T00:00:00Z"), na("J07644", "0"),
    na("J07645", "2026-10-08"), na("J07646", now, { at: "1" }), { id: "J07647", status: "done", at: now }, { id: "J07648", status: "done", at: "yesterday" },
    na("J07649", now, { actions: ["Left a card", "Left a card"] }), { id: "---", status: "done" }] });
  assert.deepEqual(r.rejected, ["J07642:visit", "J07643:visit", "J07644:visit", "J07645:visit", "J07646:visit", "J07648:visit", "J07649:visit", "---:visit"]);
});
await check("too many updates or too many bytes: 413 says the limits so the phone can send in smaller batches", async () => {
  const many = await call({ updates: Array(201).fill({ id: "J00001", status: "done" }) });
  assert.equal(many.code, 413); assert.equal(many.limit, "updates"); assert.equal(many.max_updates, 200); assert.equal(many.max_bytes, 65536);
  assert.equal(many.updates, 201); assert.match(many.error, /at most 200 updates and 64 KB/);
  const big = await call({ updates: [{ id: "J00001", status: "done", note: "x".repeat(70000) }] });
  assert.equal(big.code, 413); assert.equal(big.limit, "bytes"); assert.ok(big.bytes > 65536);
  const edge = await call({ updates: Array(200).fill({ id: "J00001", status: "done" }) });
  assert.equal(edge.code, 200); assert.equal(edge.received, 200);
});
await check("each update may carry the phone's cid; rejected_cids names the refused ones, and old updates without a cid still work", async () => {
  const r = await call({ updates: [{ cid: "c1abcdef", id: "J07567", status: "done" }, { cid: "c2abcdef", id: "J07568", status: "No one home" },
    { id: "J07569", status: "No one home" }, { cid: "bad cid!", id: "J07570", status: "done" }, { cid: "c3", id: "J07571", status: "done" }, { id: "J07572", status: "done" }] });
  assert.equal(r.received, 2);
  assert.deepEqual(r.rejected, ["J07568:visit", "J07569:visit", "J07570:visit", "J07571:visit"]);
  assert.deepEqual(r.rejected_cids, ["c2abcdef"]);
  assert.equal(r.reasons.length, 4); assert.equal(r.reasons[0].cid, "c2abcdef"); assert.match(r.reasons[0].why, /no access/);
  const old = await call({ updates: [{ id: "J07567", status: "done" }] });
  assert.deepEqual(old.rejected_cids, []); assert.equal(old.received, 1);
});
const interp = (extra = {}) => ({ id: "J07568", kind: "interpreter", status: "requested", language: "Kriol", interpreter: "ais", ...extra });
await check("an interpreter call-back needs the language (60 characters at most), a known service and a short note", async () => {
  const r = await call({ updates: [interp(), interp({ id: "J07650", note: "Afternoons are best" }), interp({ id: "J07651", language: "" }),
    interp({ id: "J07652", language: "x".repeat(61) }), interp({ id: "J07653", interpreter: "google" }), interp({ id: "J07654", note: "x".repeat(501) }),
    interp({ id: "J07655", status: "done" }), interp({ id: "J07656", interpreter: "tis", language: "Vietnamese", via: "cho" })] });
  assert.deepEqual(r.rejected, ["J07651:interpreter", "J07652:interpreter", "J07653:interpreter", "J07654:interpreter", "J07655:interpreter"]);
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
  for (const role of ["constructor", "__proto__", "toString", "admin"]) assert.equal((await call(U, bearer(sign({ role, jobs: [] }, S)))).code, 401, role);
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
  const c = await call({ updates: [ev(), ev({ id: "EV-0002", event: "alien invasion" }), ev({ id: "EV-0003", communities: ["Kalkarindji"] }),
    ev({ id: "EV-0004", start_day: -5 }), ev({ id: "EV-0005", communities: ["C48", "C48"] })] },
    bearer(sign({ role: "coordinator", jobs: [] }, S)));
  assert.deepEqual(c.rejected, ["EV-0002:event", "EV-0003:event", "EV-0004:event", "EV-0005:event"]);
  const t = await call({ updates: [ev()] }, bearer(sign({ role: "tradesperson", jobs: [] }, S)));
  assert.deepEqual(t.rejected, ["EV-0001:event"]);
});
await check("a housing officer can record an urgency check only on their own communities' jobs, and only as having seen it", async () => {
  const cho = bearer(sign({ role: "housing_officer", jobs: ["J07700"] }, S));
  const mine = (extra = {}) => urg({ id: "J07700", source: "cho", reason: "I saw it", ...extra });
  const r = await call({ updates: [mine(), mine({ id: "J09999" }), mine({ source: "phoned" }), mine({ source: "rhmo" }), mine({ source: "photo", to_hazard: "electrical_danger",
    to_category: "immediate", status: "confirmed" })] }, cho);
  assert.deepEqual(r.rejected, ["J09999:urgency", "J07700:urgency", "J07700:urgency", "J07700:urgency"]);
  assert.equal(r.received, 1);
});
await check("urgency sources follow the role: repairs line called_in or phoned, coordinator any, tenant and tradesperson none", async () => {
  const line = await call({ updates: [urg({ source: "called_in" }), urg({ id: "J07601", source: "phoned" }), urg({ id: "J07602", source: "trade" }),
    urg({ id: "J07603", source: "cho" }), urg({ id: "J07604", source: "rhmo" })] }, bearer(sign({ role: "intake", jobs: [] }, S)));
  assert.deepEqual(line.rejected, ["J07602:urgency", "J07603:urgency", "J07604:urgency"]);
  const raise = { from_hazard: "hot_water", from_category: "urgent", to_hazard: "electrical_danger", to_category: "immediate" };
  const coord = await call({ updates: ["called_in", "phoned", "cho", "rhmo", "trade"].map((source, i) => urg({ id: `J0761${i}`, source }))
    .concat([urg({ id: "J07618", source: "photo", ...raise }), urg({ id: "J07619", source: "review", ...raise })]) }, bearer(sign({ role: "coordinator", jobs: [] }, S)));
  assert.equal(coord.received, 7);
  for (const role of ["tenant", "tradesperson"]) {
    const t = await call({ updates: [urg({ source: "trade" })] }, bearer(sign({ role, jobs: ["J07600"] }, S)));
    assert.deepEqual(t.rejected, ["J07600:urgency"], role);
  }
});
await check("an interpreter call-back: a tenant for their own job, a housing officer for their communities, the repairs line and coordinator for any", async () => {
  const ten = await call({ updates: [interp(), interp({ id: "J07599" }), interp({ id: "J07568", via: "cho" })] }, bearer(sign({ role: "tenant", jobs: ["J07568"] }, S)));
  assert.deepEqual(ten.rejected, ["J07599:interpreter", "J07568:interpreter"]);
  const cho = await call({ updates: [interp({ id: "J07700", via: "cho" }), interp({ id: "J07700" }), interp({ id: "J07799" })] }, bearer(sign({ role: "housing_officer", jobs: ["J07700"] }, S)));
  assert.deepEqual(cho.rejected, ["J07799:interpreter"]);
  for (const role of ["intake", "coordinator"]) assert.equal((await call({ updates: [interp({ id: "J07599", via: "line" })] }, bearer(sign({ role, jobs: [] }, S)))).received, 1, role);
  const tr = await call({ updates: [interp({ id: "J07567" })] }, bearer(sign({ role: "tradesperson", jobs: ["J07567"] }, S)));
  assert.deepEqual(tr.rejected, ["J07567:interpreter"]);
});
await check("a tradesperson's \"I'll take it\" is one accept update, with no assign", async () => {
  const t = bearer(sign({ role: "tradesperson", jobs: [], offers: ["J07614"] }, S));
  const r = await call({ updates: [{ cid: "take-J07614", id: "J07614", kind: "accept", status: "accepted", crew: "Katherine plumber crew A", at: now }] }, t);
  assert.equal(r.received, 1); assert.deepEqual(r.rejected_cids, []); assert.equal(r.mode, "signed-in");
  const a = await call({ updates: [{ cid: "assign-J07614", id: "J07614", kind: "assign", status: "open", trade: "plumber" }] }, t);
  assert.deepEqual(a.rejected_cids, ["assign-J07614"]);                                 // assigning is the coordinator's
});
await check("signed-in mode keeps the content rules: a coordinator still can't lower a Tier 1 lifeline fault from a photo", async () => {
  const r = await call({ updates: [t1()] }, bearer(sign({ role: "coordinator", jobs: [] }, S)));
  assert.deepEqual(r.rejected, ["J21674:urgency"]);
});
await check("roads and weather: live feeds are read, and only closures and flooding are kept", async () => {
  const fake = async (url) => ({ ok: true, json: async () => url.includes("roadreport")
    ? { response: [{ status: "CURRENT", roadName: "Buntine Highway", restrictionType: "Road Closed", obstructionType: "Flooding", startPoint: [-17.4, 130.8] },
                   { status: "CURRENT", roadName: "Stuart Highway", restrictionType: "With Caution", obstructionType: "Roadworks" }] }
    : { observations: { data: [{ local_date_time_full: "20270105090000", air_temp: 31, apparent_t: 38.5, rain_trace: "152.4" }] } } });
  const w = await warnings.build(fake);
  assert.equal(w.roads_source, "live"); assert.equal(w.weather_source, "live");
  assert.deepEqual(w.roads.map((r) => r.road), ["Buntine Highway"]);
  assert.ok(w.weather.length > 0 && w.weather.every((x) => x.rain_since_9am === 152.4));
});
await check("roads and weather: when the feeds are down, the saved snapshot is used and labelled", async () => {
  const down = async () => { throw new Error("no route"); };
  const w = await warnings.build(down);
  assert.equal(w.roads_source, "snapshot"); assert.equal(w.weather_source, "snapshot");
  assert.ok(Array.isArray(w.roads) && w.weather.length > 0 && w.roads_saved);
});
const fakeFeeds = ({ roads = { response: [] }, rain = "1.2", fail = () => false } = {}) => async (url) => {
  if (fail(url)) throw new Error("no route");
  return { ok: true, json: async () => (url.includes("roadreport") ? roads
    : { observations: { data: [{ local_date_time_full: "20270105090000", air_temp: 31, apparent_t: 38.5, rain_trace: rain }] } }) };
};
await check("roads: a reply without a response list is not \"no closures\": the labelled snapshot is used", async () => {
  assert.throws(() => warnings.roadsFrom({}));
  assert.throws(() => warnings.roadsFrom({ response: "x" }));
  assert.throws(() => warnings.roadsFrom(null));
  assert.deepEqual(warnings.roadsFrom({ response: [] }), []);
  for (const roads of [{}, { data: [] }, { response: null }, []]) {
    const w = await warnings.build(fakeFeeds({ roads }));
    assert.equal(w.roads_source, "snapshot", JSON.stringify(roads)); assert.ok(w.roads_saved); assert.equal(w.weather_source, "live");
  }
});
await check("weather: rain a station didn't report stays empty, not 0 mm", async () => {
  for (const rain of [null, "-", "", "n/a"]) {
    const w = await warnings.build(fakeFeeds({ rain }));
    assert.ok(w.weather.every((x) => x.rain_since_9am === null), String(rain));
  }
  assert.ok((await warnings.build(fakeFeeds({ rain: "0.0" }))).weather.every((x) => x.rain_since_9am === 0));
});
await check("weather: a station that fails keeps its saved reading, marked saved; the others are live", async () => {
  const first = (await warnings.build(fakeFeeds())).weather[0].wmo;
  const w = await warnings.build(fakeFeeds({ fail: (u) => u.includes(`.${first}.json`) }));
  assert.equal(w.weather_source, "live");
  assert.deepEqual(w.weather.filter((x) => x.saved).map((x) => x.wmo), [first]);
  assert.ok(w.weather.filter((x) => !x.saved).every((x) => x.rain_since_9am === 1.2));
});
await check("a feed that doesn't answer in time falls back to the snapshot", async () => {
  const hang = async (url, { signal }) => new Promise((_, no) => signal.addEventListener("abort", () => no(new Error("timeout"))));
  const t0 = Date.now();
  const w = await warnings.build(hang, 50);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(w.roads_source, "snapshot"); assert.equal(w.weather_source, "snapshot");
});
await check("the edge keeps live data 10 minutes, but anything from the snapshot only 1 minute", async () => {
  const head = async (fetcher) => {
    const real = globalThis.fetch; globalThis.fetch = fetcher;
    try {
      return await new Promise((done) => {
        const h = {}; const res = { setHeader(k, v) { h[k] = v; }, status() { return this; }, json(j) { done({ h, j }); } };
        warnings.default({ method: "GET" }, res);
      });
    } finally { globalThis.fetch = real; }
  };
  assert.match((await head(fakeFeeds())).h["Cache-Control"], /s-maxage=600\b/);
  assert.match((await head(fakeFeeds({ roads: {} }))).h["Cache-Control"], /s-maxage=60\b/);
  assert.match((await head(fakeFeeds({ fail: (u) => u.includes("bom.gov.au") }))).h["Cache-Control"], /s-maxage=60\b/);
  const first = (await warnings.build(fakeFeeds())).weather[0].wmo;
  assert.match((await head(fakeFeeds({ fail: (u) => u.includes(`.${first}.json`) }))).h["Cache-Control"], /s-maxage=60\b/);
});
await check("the server functions run in Sydney (web/vercel.json regions: syd1)", async () => {
  const f = new URL("../vercel.json", API);
  if (!fs.existsSync(f)) return;
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.deepEqual(v.regions, ["syd1"]); assert.equal(v.cleanUrls, true); assert.ok(Array.isArray(v.headers) && v.headers.length >= 5);
});
console.log(`${n} API checks passed`);
