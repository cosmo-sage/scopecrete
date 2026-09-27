// The background enricher's per-contact pipeline, against a fake database and
// a fake model. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readContact } from "../supabase/functions/enrich-contacts/pipeline.ts";

const ORG = "org-1", CONTACT = "c-1", PHONE = "+12255550101";

/**
 * A stand-in for the supabase-js query builder: every chained call is
 * recorded, and awaiting the chain (or .single()/.maybeSingle()) asks
 * `answer(q)` for the result. Writes land in `log`.
 */
function fakeDb(answer) {
  const log = [];
  return {
    log,
    from(table) {
      const q = { table, op: "select", cols: null, filters: [], payload: null, single: false };
      const run = () => {
        if (q.op !== "select") log.push(q);
        return Promise.resolve(answer(q) ?? { data: null, error: null });
      };
      const b = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return (ok, bad) => run().then(ok, bad);
          if (prop === "single" || prop === "maybeSingle") return () => { q.single = true; return run(); };
          return (...args) => {
            if (["insert", "update", "upsert", "delete"].includes(prop)) { q.op = prop; q.payload = args[0]; }
            else if (prop === "select") { if (q.op === "select") q.cols = args[0]; }
            else q.filters.push([prop, ...args]);
            return b;
          };
        },
      });
      return b;
    },
  };
}

const eq = (q, col) => q.filters.find((f) => f[0] === "eq" && f[1] === col)?.[2];

function world({ texts = [], calls = null, contact = { name: null, name_source: "legacy", phone: PHONE }, pending = null, undone = [] }) {
  return fakeDb((q) => {
    if (q.table !== "contacts" && q.table !== "contact_phones" && q.op === "select") {
      assert.equal(eq(q, "org_id"), ORG, `${q.table} read without the org filter`);
    }
    switch (q.table) {
      case "messages":
        return { data: [
          ...texts.map((t, i) => ({ id: `m${i}`, channel: "sms", direction: t[0] === "US" ? "outbound" : "inbound", body_text: t[1], summary: null, occurred_at: `2026-09-0${i + 1}` })),
          ...(calls ?? []).map((_, i) => ({ id: `k${i}`, channel: "call", direction: "outbound", body_text: null, summary: null, occurred_at: `2026-09-2${i}` })),
        ] };
      case "call_artifacts":
        return { data: (calls ?? []).map((c, i) => ({ message_id: `k${i}`, kind: "transcript", content: c })) };
      case "message_media": case "contact_phones":
        return { data: [] };
      case "contact_proposals":
        if (q.op === "insert") return { data: { id: "p-new" } };
        if (q.op === "update") return { data: null };
        return { data: pending ? [pending] : [] };
      case "contacts":
        if (q.op === "update") return { data: [{ name: q.payload.name ?? null }] };
        return { data: contact };
      case "contact_name_claims":
        if (q.op === "insert") return { data: { id: "k-new" } };
        if (q.op === "update") return { data: null };
        return { data: undone.map((n) => ({ claimed_name: n })) };
    }
  });
}

const proposal = (o = {}) => ({ classification: "customer", direction_of_ask: "x", confidence: 80,
  proposed_name: null, proposed_company: null, proposed_role: null, project_type: null, scope_summary: null,
  start_timing: null, length_ft: null, width_ft: null, sqft_stated: null, site_hint: null, has_media: false,
  evidence_turn: 1, evidence_message_id: null, evidence_quote: "x", name_reasoning: "", ...o });
const model = (p) => { const calls = []; const ask = async (c) => { calls.push(c); return { ok: true, proposal: p }; }; ask.calls = calls; return ask; };
const writes = (db, table, op) => db.log.filter((q) => q.table === table && q.op === op);

test("someone who introduced themselves is named, with a claim holding their line", async () => {
  const db = world({ texts: [["THEM", "Hi Coy, this is Maegan. We tried to run the payment for the website"]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ proposed_name: "Maegan" })), "hermes:test");
  assert.equal(r.outcome, "named");
  assert.equal(r.claim_id, "k-new");
  const [claim] = writes(db, "contact_name_claims", "insert");
  assert.equal(claim.payload.claim_type, "self_identification");
  assert.equal(claim.payload.evidence_quote, "Hi Coy, this is Maegan. We tried to run the payment for the website");
  const [upd] = writes(db, "contacts", "update");
  assert.deepEqual({ name: upd.payload.name, source: upd.payload.name_source }, { name: "Maegan", source: "machine" });
  assert.ok(upd.filters.some((f) => f[0] === "neq" && f[1] === "name_source" && f[2] === "human"), "must never touch a human name");
  assert.equal(writes(db, "contact_proposals", "insert").length, 1, "the suggestion is still recorded");
});

test("a name they never introduced themselves by stays a suggestion", async () => {
  const db = world({ texts: [["US", "Thanks Amber"], ["THEM", "Amber said you could pour Tuesday, how much for a slab"]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ proposed_name: "Amber" })), "hermes:test");
  assert.equal(r.outcome, "proposed");
  assert.equal(writes(db, "contacts", "update").length, 0);
  assert.equal(writes(db, "contact_name_claims", "insert").length, 0);
});

test("a contact that already has a name is never renamed", async () => {
  const db = world({ texts: [["THEM", "this is Maegan from billing"]], contact: { name: "Meg (office)", name_source: "legacy", phone: PHONE } });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ proposed_name: "Maegan" })), "hermes:test");
  assert.equal(r.outcome, "proposed");
  assert.equal(writes(db, "contacts", "update").length, 0);
});

test("a name Coy undid is not applied again", async () => {
  const db = world({ texts: [["THEM", "this is Maegan from billing"]], undone: ["maegan"] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ proposed_name: "Maegan" })), "hermes:test");
  assert.equal(r.outcome, "proposed");
  assert.equal(writes(db, "contacts", "update").length, 0);
});

test("nothing new said: no model call, and a standing suggestion can still name them", async () => {
  const texts = [["THEM", "Hey it's Tommy, any update on the truck?"]];
  // First read, to learn the fingerprint the pipeline computes.
  const first = world({ texts });
  await readContact(first, ORG, CONTACT, model(proposal()), "hermes:test");
  const fp = writes(first, "contact_proposals", "insert")[0].payload.source_fingerprint;

  const db = world({ texts, pending: { id: "p-old", source_fingerprint: fp, proposed_name: "Tommy", proposed_company: null, confidence: 70 } });
  const ask = model(proposal({ proposed_name: "Somebody Else" }));
  const r = await readContact(db, ORG, CONTACT, ask, "hermes:test");
  assert.equal(ask.calls.length, 0, "the model must not be asked again");
  assert.equal(r.outcome, "named");
  assert.equal(writes(db, "contacts", "update")[0].payload.name, "Tommy");
});

test("nothing said by them: no model call", async () => {
  const db = world({ texts: [["US", "Hey are you still interested in the driveway?"]] });
  const ask = model(proposal());
  const r = await readContact(db, ORG, CONTACT, ask, "hermes:test");
  assert.equal(r.outcome, "no_words");
  assert.equal(ask.calls.length, 0);
});

test("a model failure writes nothing", async () => {
  const db = world({ texts: [["THEM", "this is Maegan from billing, please call"]] });
  const r = await readContact(db, ORG, CONTACT, async () => ({ ok: false, error: "Hermes rejected the key (HTTP 401)" }), "hermes:test");
  assert.equal(r.outcome, "model_error");
  assert.equal(r.note, "Hermes rejected the key (HTTP 401)");
  assert.equal(db.log.length, 0);
});

test("the model is never shown a uuid or a phone number header, only ordinals", async () => {
  const db = world({ texts: [["THEM", "how much for a 20x30 slab"]] });
  const ask = model(proposal());
  await readContact(db, ORG, CONTACT, ask, "hermes:test");
  assert.match(ask.calls[0], /^#1 THEM 2026-09-01\nhow much for a 20x30 slab$/);
});

test("a call transcript reaches the model as US/THEM, never phone numbers, and still names the caller", async () => {
  const t = `+12253782458: Hello, Coy speaking.\n${PHONE}: Hey, this is Gustavo with Roof Squad.`;
  const db = world({ calls: [t] });
  const ask = model(proposal({ proposed_name: "Gustavo" }));
  const r = await readContact(db, ORG, CONTACT, ask, "hermes:test");
  assert.match(ask.calls[0], /US: Hello, Coy speaking\.\nTHEM: Hey, this is Gustavo with Roof Squad\./);
  assert.doesNotMatch(ask.calls[0], /\d{10}/);
  assert.equal(r.outcome, "named", "a call Coy placed still names the person who answered");
  assert.equal(writes(db, "contact_name_claims", "insert")[0].payload.channel, "call");
});
