// Email in Threads (src/lib/email-client.ts) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupConversations, inTab, tabCounts, matchesMail, cleanSubject, replySubject, forwardSubject, snippetOf,
  replyTargets, parseAddresses, fillTemplate, TEMPLATES, signatureOf, forwardBody, writerOf, vendorFromEmail,
} from "../src/lib/email-client.ts";

const INBOX = "intake-concrete@agentmail.to", COY = "admin@saccobuilt.com";
const row = (o = {}) => ({
  id: "e1", conversation: "t1", direction: "in", subject: "Fw: MSA Redlines", text_body: "Hi Coy,\nSee the redlines.\n\nOn Tue, Sep 29, 2026 John wrote:\n> old",
  created_at: "2026-10-08T15:00:00Z", sent_at: null, from_address: COY, from_name: "Coy Sacco",
  original_from_address: "John.Freeling@iconbuild.com", original_from_name: "John Freeling",
  to_addresses: [INBOX], cc_addresses: ["luis@iconbuild.com"], customer_id: "c1", contact_id: "p1", job_id: null, status: "filed", files: 2, ...o,
});

test("subjects lose their Re:/Fwd: chains", () => {
  assert.equal(cleanSubject("Fw: Re: RE: Sacco MSA"), "Sacco MSA");
  assert.equal(replySubject("Fw: Re: Sacco MSA"), "Re: Sacco MSA");
  assert.equal(forwardSubject("Re: Sacco MSA"), "Fwd: Sacco MSA");
  assert.equal(replySubject(""), "Re: (no subject)");
});

test("a snippet is what they wrote, not the quoted chain", () => {
  assert.equal(snippetOf("Hi Coy,\nSee the redlines.\n\nOn Tue, Sep 29, 2026 John wrote:\n> old"), "Hi Coy, See the redlines.");
  assert.equal(snippetOf("> only quoted"), "");
  assert.equal(snippetOf("x".repeat(300), 20).length, 20);
});

test("a forward's writer is the original sender; ours is our inbox", () => {
  assert.deepEqual(writerOf(row()), { name: "John Freeling", address: "john.freeling@iconbuild.com" });
  assert.equal(writerOf(row({ direction: "out", from_address: INBOX, from_name: "Coy Sacco" })).address, INBOX);
});

test("rows group by conversation, newest first, with the last word deciding Needs reply", () => {
  const rows = [
    row(),
    row({ id: "e2", direction: "out", from_address: INBOX, created_at: "2026-10-09T15:00:00Z", text_body: "We'll send it tomorrow.", to_addresses: ["john.freeling@iconbuild.com"], cc_addresses: [], files: 0 }),
    row({ id: "e3", conversation: "t2", subject: "Bid invite", created_at: "2026-10-07T12:00:00Z", status: "unfiled", customer_id: null, contact_id: null, files: 0 }),
  ];
  const c = groupConversations(rows, [], [INBOX, COY]);
  assert.deepEqual(c.map((x) => x.key), ["t1", "t2"]);
  const [msa, bid] = c;
  assert.equal(msa.count, 2);
  assert.equal(msa.files, 2);
  assert.equal(msa.last_direction, "out");
  assert.equal(msa.needs_reply, false);
  assert.equal(msa.snippet, "You: We'll send it tomorrow.");
  assert.deepEqual(msa.people.sort(), ["john.freeling@iconbuild.com", "luis@iconbuild.com"]);
  assert.equal(msa.subject, "Fw: MSA Redlines");
  assert.equal(bid.needs_reply, true);
  assert.equal(bid.unread, true);
  assert.ok(inTab(bid, "unfiled") && !inTab(msa, "unfiled"));
  assert.ok(inTab(msa, "sent") && !inTab(bid, "sent"));
  assert.deepEqual(tabCounts(c, 3), { inbox: 2, reply: 1, sent: 1, unfiled: 1, drafts: 3 });
});

test("archived stays archived until something new comes in; FYI never needs a reply", () => {
  const r = [row({ status: "unfiled" })];
  const arch = groupConversations(r, [{ conversation: "t1", triage: null, archived_at: "2026-10-09T00:00:00Z", last_read_at: null }])[0];
  assert.equal(arch.archived, true);
  assert.ok(!inTab(arch, "inbox") && !inTab(arch, "reply") && !inTab(arch, "unfiled"));
  const back = groupConversations(r, [{ conversation: "t1", triage: null, archived_at: "2026-10-01T00:00:00Z", last_read_at: null }])[0];
  assert.equal(back.archived, false);
  const fyi = groupConversations(r, [{ conversation: "t1", triage: "fyi", archived_at: null, last_read_at: "2026-10-09T00:00:00Z" }])[0];
  assert.equal(fyi.needs_reply, false);
  assert.equal(fyi.unread, false);
});

test("a quarantined conversation waits in Unfiled, not Needs reply", () => {
  const q = groupConversations([row({ status: "quarantined", customer_id: null })])[0];
  assert.equal(q.quarantined, true);
  assert.equal(q.needs_reply, false);
  assert.ok(inTab(q, "unfiled"));
});

test("search matches subject, writer, people and names given", () => {
  const c = groupConversations([row()], [], [INBOX])[0];
  assert.ok(matchesMail(c, "msa john"));
  assert.ok(matchesMail(c, "icon", ["Icon Technologies"]));
  assert.ok(!matchesMail(c, "walker"));
});

test("Reply goes to the forward's writer, never our own forwarder; Reply all adds the cc", () => {
  const msgs = [row({ to_addresses: [INBOX, "tim@sacco.com"] })];
  assert.deepEqual(replyTargets(msgs, "reply", [INBOX, COY]), { to: ["john.freeling@iconbuild.com"], cc: [] });
  assert.deepEqual(replyTargets(msgs, "reply_all", [INBOX, COY]), { to: ["john.freeling@iconbuild.com"], cc: ["tim@sacco.com", "luis@iconbuild.com"] });
  assert.deepEqual(replyTargets(msgs, "forward", [INBOX]), { to: [], cc: [] });
});

test("replying after our own last word goes to whoever we wrote to", () => {
  const msgs = [row({ direction: "out", from_address: INBOX, to_addresses: ["john@x.com"] })];
  assert.deepEqual(replyTargets(msgs, "reply", [INBOX]).to, ["john@x.com"]);
});

test("addresses are read from anything pasted; the rest is named", () => {
  assert.deepEqual(parseAddresses("John <John@Icon.com>, luis@icon.com; luis@icon.com"), { ok: ["john@icon.com", "luis@icon.com"], bad: [] });
  assert.deepEqual(parseAddresses("not an email").bad, ["not an email"]);
});

test("templates fill {first} {job} {date}, and say so when they can't", () => {
  const t = TEMPLATES.find((x) => x.k === "schedule-pour");
  assert.match(fillTemplate(t.body, { first: "John", job: "Fort Polk RUBA", date: "Oct 14" }), /Hi John,[\s\S]*Oct 14 to pour Fort Polk RUBA/);
  assert.match(fillTemplate(t.body, {}), /Hi there,[\s\S]*\[date\] to pour the job/);
});

test("the signature is whatever is known", () => {
  assert.equal(signatureOf({ name: "Coy Sacco", org: "Sacco Enterprises", phone: "(225) 555-0114" }), "— \nCoy Sacco · Sacco Enterprises · (225) 555-0114");
  assert.equal(signatureOf({}), "");
});

test("a forward carries the message under it", () => {
  const b = forwardBody(row());
  assert.match(b, /---------- Forwarded message ----------/);
  assert.match(b, /From: John Freeling <john.freeling@iconbuild.com>/);
  assert.match(b, /See the redlines\./);
});

test("a new vendor from an email starts from what it shows", () => {
  const ours = [INBOX, COY];
  // Coy writes the inbox himself: the subject names them, the text gives their address and phone.
  const self = row({ subject: "Ace Hardware", original_from_address: null, original_from_name: null,
    text_body: "New vendor\nsales@acehardware.com\nCall (225) 555-0142", customer_id: null, contact_id: null, status: "unfiled" });
  assert.deepEqual(vendorFromEmail([self], ours), { name: "Ace Hardware", email: "sales@acehardware.com", phone: "(225) 555-0142" });
  assert.equal(vendorFromEmail([row({ subject: "Fwd: New vendor: Angelle Materials", original_from_address: null, text_body: "" })], ours).name, "Angelle Materials");
  // A forward from a supplier: the writer is theirs.
  const fwd = row({ original_from_address: "Kim@angellematerials.com", original_from_name: "Kim Angelle", text_body: "Quote attached. 225.555.0199" });
  assert.deepEqual(vendorFromEmail([fwd], ours), { name: "Kim Angelle", email: "kim@angellematerials.com", phone: "(225) 555-0199" });
  // No name anywhere: the domain.
  assert.equal(vendorFromEmail([row({ subject: "", original_from_address: "orders@syncor.com", original_from_name: null, text_body: "" })], ours).name, "Syncor");
  assert.deepEqual(vendorFromEmail([], ours), { name: "", email: "", phone: "" });
});
