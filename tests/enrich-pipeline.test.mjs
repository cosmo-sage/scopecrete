// The background enricher's per-contact pipeline, against a fake database and
// a fake model. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLearning, readContact, seedNextSteps } from "../supabase/functions/enrich-contacts/pipeline.ts";

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

function world({ texts = [], calls = null, contact = { name: null, name_source: "legacy", phone: PHONE, classification_confirmed_at: null, status_summary_at: "2026-09-27" }, pending = null, undone = [], taskKeys = [] }) {
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
      case "contact_tasks":
        if (q.op === "insert") return { data: null };
        return { data: taskKeys.map((k) => ({ title_key: k })) };
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

test("spam with evidence, from someone Coy never answered, is filed — marked auto", async () => {
  const db = world({ texts: [["THEM", "602153 is your Handoff One Time Password."]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ classification: "spam" })), "hermes:test");
  assert.equal(r.outcome, "filed");
  const [upd] = writes(db, "contacts", "update");
  assert.equal(upd.payload.contact_type, "spam");
  assert.equal(upd.payload.classification_source, "machine");
  assert.ok(upd.payload.auto_classified_at);
  assert.equal(upd.payload.auto_classified_reason, "602153 is your Handoff One Time Password.");
  for (const col of ["classification_confirmed_at", "auto_classify_blocked_at", "auto_classified_at"]) {
    assert.ok(upd.filters.some((f) => f[0] === "is" && f[1] === col && f[2] === null), `must require ${col} is null`);
  }
});

test("never files someone Coy has written back to", async () => {
  const db = world({ texts: [["THEM", "602153 is your Handoff One Time Password."], ["US", "who is this?"]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ classification: "spam" })), "hermes:test");
  assert.equal(r.outcome, "proposed");
  assert.equal(writes(db, "contacts", "update").length, 0);
});

test("the model saying spam is not enough without evidence", async () => {
  const db = world({ texts: [["THEM", "Hi, are you the concrete guy? Call me back"]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ classification: "spam" })), "hermes:test");
  assert.equal(r.outcome, "proposed");
  assert.equal(writes(db, "contacts", "update").length, 0);
});

const learned = (streaks) => ({ corrections: [], streaks });

test("a bucket Dusty has earned (20 in a row) is filed — auto, never confirmed, never the lead guard", async () => {
  const db = world({ texts: [["THEM", "How much for a 20x30 driveway? Can you start next week"]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ classification: "customer" })), "hermes:test", learned({ customer: 20 }));
  assert.equal(r.outcome, "filed");
  const [upd] = writes(db, "contacts", "update");
  assert.equal(upd.payload.contact_type, "customer");
  assert.equal(upd.payload.classification_source, "machine");
  assert.ok(upd.payload.auto_classified_at);
  assert.equal(upd.payload.classification_confirmed_at, undefined, "auto is never a confirmation");
  for (const col of ["classification_confirmed_at", "auto_classify_blocked_at", "auto_classified_at"]) {
    assert.ok(upd.filters.some((f) => f[0] === "is" && f[1] === col && f[2] === null), `must require ${col} is null`);
  }
  assert.equal(writes(db, "customers", "update").length + writes(db, "customers", "insert").length, 0);
});

test("19 in a row is not enough, and one bucket's streak does not unlock another", async () => {
  for (const [cls, streaks] of [["customer", { customer: 19 }], ["vendor", { customer: 40 }]]) {
    const db = world({ texts: [["THEM", "could you send the $1300 for Monday"]] });
    const r = await readContact(db, ORG, CONTACT, model(proposal({ classification: cls })), "hermes:test", learned(streaks));
    assert.equal(r.outcome, "proposed");
    assert.equal(writes(db, "contacts", "update").length, 0);
  }
});

test("a sub is filed under vendor as a subcontractor", async () => {
  const db = world({ texts: [["THEM", "if you have anything for Monday for us we are free"]] });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ classification: "sub" })), "hermes:test", learned({ vendor: 25 }));
  assert.equal(r.outcome, "filed");
  const [upd] = writes(db, "contacts", "update");
  assert.deepEqual([upd.payload.contact_type, upd.payload.contact_subtype], ["vendor", "subcontractor"]);
});

test("corrections are the confirmed contacts Dusty guessed differently, by his guess before Coy decided", async () => {
  const db = fakeDb((q) => {
    assert.equal(eq(q, "org_id"), ORG, `${q.table} read without the org filter`);
    if (q.table === "sc_bucket_agreement") return { data: [{ bucket: "customer", streak: 3 }] };
    if (q.table === "contacts") return { data: [
      { id: "a", contact_type: "vendor", contact_subtype: "lead_gen", classification_confirmed_at: "2026-09-27T10:00:00Z" },
      { id: "b", contact_type: "customer", contact_subtype: null, classification_confirmed_at: "2026-09-27T09:00:00Z" },
    ] };
    if (q.table === "contact_proposals") return { data: [
      { contact_id: "a", classification: "vendor", evidence_quote: "later guess", created_at: "2026-09-27T11:00:00Z" },
      { contact_id: "a", classification: "customer", evidence_quote: "New Lead From Baton Rouge Concreters", created_at: "2026-09-27T08:00:00Z" },
      { contact_id: "b", classification: "customer", evidence_quote: "how much for a slab", created_at: "2026-09-27T08:00:00Z" },
    ] };
  });
  const l = await loadLearning(db, ORG);
  assert.deepEqual(l.streaks, { customer: 3 });
  assert.deepEqual(l.corrections, [{ guess: "customer", answer: "vendor", subtype: "lead_gen", quote: "New Lead From Baton Rouge Concreters" }]);
});

test("someone named and sorted gets only a status line: no proposal, no question", async () => {
  const db = world({ texts: [["THEM", "Can you come look at the cracks Tuesday?"]],
    contact: { name: "Amber", name_source: "human", phone: PHONE, classification_confirmed_at: "2026-09-27", auto_classified_at: null, status_summary_at: null } });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ status_summary: "Wants the cracks looked at Tuesday.", job_type: "public" })), "hermes:test");
  assert.equal(r.outcome, "summarized");
  assert.equal(writes(db, "contact_proposals", "insert").length, 0);
  const [upd] = writes(db, "contacts", "update");
  assert.equal(upd.payload.status_summary, "Wants the cracks looked at Tuesday.");
  assert.equal(upd.payload.job_type_hint, "public");
  assert.equal(upd.payload.name, undefined, "a status write never touches the name");
  assert.equal(upd.payload.contact_type, undefined, "or the bucket");
});

test("a named contact is never asked about a name, and the status line never carries a number", async () => {
  const db = world({ texts: [["THEM", "this is Maegan, call me at 225-555-0199"]],
    contact: { name: "Meg", name_source: "legacy", phone: PHONE, classification_confirmed_at: null } });
  const r = await readContact(db, ORG, CONTACT, model(proposal({ proposed_name: "Maegan", status_summary: "Asked to be called at 225-555-0199." })), "hermes:test");
  assert.equal(r.outcome, "proposed");
  assert.equal(writes(db, "contact_proposals", "insert")[0].payload.proposed_name, null);
  assert.equal(writes(db, "contacts", "update")[0].payload.status_summary, "Asked to be called at their number.");
});

test("no status line yet: the unchanged shortcut does not skip the read that writes it", async () => {
  const texts = [["THEM", "Hey it's Tommy, any update on the truck?"]];
  const first = world({ texts });
  await readContact(first, ORG, CONTACT, model(proposal()), "hermes:test");
  const fp = writes(first, "contact_proposals", "insert")[0].payload.source_fingerprint;
  const db = world({ texts, pending: { id: "p-old", source_fingerprint: fp, proposed_name: null, proposed_company: null, confidence: 70 },
    contact: { name: null, name_source: "legacy", phone: PHONE, classification_confirmed_at: null, status_summary_at: null } });
  const ask = model(proposal({ status_summary: "Asking about the truck." }));
  await readContact(db, ORG, CONTACT, ask, "hermes:test");
  assert.equal(ask.calls.length, 1);
});

test("Dusty's next steps go into the checklist once — never one Coy already has or dismissed", async () => {
  const db = world({ texts: [["THEM", "Can I get a price before the board meets?"]],
    taskKeys: ["callamberback"] });
  await readContact(db, ORG, CONTACT, model(proposal({ status_summary: "Wants a price.", next_steps: [
    { title: "Send the walkway repair price", due_on: "2026-10-14", quote: "Can I get a price before the board meets?" },
    { title: "Call Amber back!", due_on: "Tuesday", quote: null },
    { title: "send the walkway REPAIR price", due_on: null, quote: null },
    { title: "Four", due_on: null, quote: null }, { title: "Five", due_on: null, quote: null },
  ] })), "hermes:test");
  const [ins] = writes(db, "contact_tasks", "insert");
  assert.deepEqual(ins.payload.map((t) => [t.title, t.due_on, t.source]), [
    ["Send the walkway repair price", "2026-10-14", "dusty"],
    ["Four", null, "dusty"],
  ]);
  assert.equal(ins.payload[0].evidence_quote, "Can I get a price before the board meets?");
});

test("no checklist is seeded for someone filed personal", async () => {
  const db = fakeDb(() => ({ data: [] }));
  const n = await seedNextSteps(db, ORG, CONTACT, { next_steps: [{ title: "Pick up the kids", due_on: null, quote: null }] }, "personal");
  assert.equal(n, 0);
  assert.equal(db.log.length, 0);
});
