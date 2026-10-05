// The email mirror's rules — `npm test`. Made-up names and addresses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifySvix, svixSign, readMessage, parseAddress, originalSender, fullName, matchableDomain, attachmentSkip, htmlToText,
  fileKind, categoryGuess, safeName, bodyFrom, mimeParts,
} from "../supabase/functions/email-intake/rules.ts";
import * as files from "../src/lib/files.ts";

const SECRET = "whsec_" + Buffer.from("a test secret of thirty-two bytes!").toString("base64");

test("a signed delivery passes; a changed body, a wrong key, an old timestamp or no signature don't", async () => {
  const now = 1_790_000_000, body = '{"event_type":"message.received"}', id = "msg_1";
  const sig = await svixSign(SECRET, id, String(now), body);
  const h = { id, timestamp: String(now), signature: `v1,${sig}` };
  assert.equal((await verifySvix(SECRET, h, body, now)).ok, true);
  assert.equal((await verifySvix(SECRET, { ...h, signature: `v1,nope v1,${sig}` }, body, now)).ok, true, "any of several signatures");
  assert.equal((await verifySvix(SECRET, h, body + " ", now)).ok, false);
  assert.equal((await verifySvix("whsec_" + Buffer.from("another key").toString("base64"), h, body, now)).ok, false);
  assert.equal((await verifySvix(SECRET, h, body, now + 301)).why, "timestamp too old or new");
  assert.equal((await verifySvix(SECRET, { id, timestamp: null, signature: null }, body, now)).why, "unsigned");
  assert.equal((await verifySvix("", h, body, now)).ok, false);
});

test("addresses in every shape", () => {
  assert.deepEqual(parseAddress('"Ben Ortiz" <Ben@Example-Builders.com>'), { name: "Ben Ortiz", address: "ben@example-builders.com" });
  assert.deepEqual(parseAddress("<pat@example.org>"), { name: null, address: "pat@example.org" });
  assert.deepEqual(parseAddress("pat@example.org"), { name: null, address: "pat@example.org" });
  assert.deepEqual(parseAddress({ name: "Pat", email: "pat@example.org" }), { name: "Pat", address: "pat@example.org" });
  assert.deepEqual(parseAddress(["Kim <kim@example.net>"]), { name: "Kim", address: "kim@example.net" });
  assert.equal(parseAddress("no address here"), null);
});

test("a delivery read whatever its shape", () => {
  const m = readMessage({
    event_type: "message.received", event_id: "evt_9",
    message: { inbox_id: "Intake@Example.to", message_id: "<m1@x>", from: "Owner <owner@example-co.com>", to: ["intake@example.to"],
      subject: "Fwd: Bid — Plant 3", text: "hi", timestamp: "2026-10-01T10:00:00Z",
      attachments: [{ attachment_id: "a1", filename: "C-101 Plans.pdf", content_type: "application/pdf", size: 2048000 }] },
  });
  assert.equal(m.eventId, "evt_9"); assert.equal(m.messageId, "<m1@x>"); assert.equal(m.inbox, "intake@example.to");
  assert.equal(m.from.address, "owner@example-co.com"); assert.equal(m.attachments[0].name, "C-101 Plans.pdf");
  const flat = readMessage({ type: "message.received", data: { id: "m2", from: { name: "A", address: "a@b.co" }, files: [{ id: "f", name: "x.pdf" }] } });
  assert.equal(flat.messageId, "m2"); assert.equal(flat.from.address, "a@b.co"); assert.equal(flat.attachments[0].id, "f");
});

test("the original sender, from Gmail, Outlook and Apple forwards", () => {
  const gmail = "FYI\n\n---------- Forwarded message ---------\nFrom: Ben Ortiz <ben@example-builders.com>\nDate: Tue, Sep 30, 2026\nSubject: ITB Plant 3\nTo: Owner <owner@example-co.com>\n\nPlease bid.";
  assert.deepEqual(originalSender(gmail), { name: "Ben Ortiz", address: "ben@example-builders.com" });
  const outlook = "See below\n________________________________\nFrom: Kim Lee <kim@example-gc.com>\nSent: Monday, September 29, 2026 9:14 AM\nTo: Owner\nSubject: Plans";
  assert.equal(originalSender(outlook).address, "kim@example-gc.com");
  const apple = "Begin forwarded message:\n\n> From: \"Pat Doe\" <pat@example.org>\n> Subject: Specs";
  assert.deepEqual(originalSender(apple), { name: "Pat Doe", address: "pat@example.org" });
  const bold = "---------- Forwarded message ---------\n*From:* Ann <ann@example.net>";
  assert.equal(originalSender(bold).address, "ann@example.net");
  assert.equal(originalSender("Just a note from me, no forward.\nFrom: nobody in particular"), null);
  assert.equal(originalSender(null), null);
});

test("a BlueMail forward has no marker — its header block still names the writer (Coy's MSA, 2026-10-05)", () => {
  const blue = "Get BlueMail for Mobile\n\nSubject: Site Project - MSA Redlines\nDate: Tue September 29, 2026 17:17\nFrom: \"Pat Example\" <pat@example-gc.com>\nTo: owner@example-co.com\nCc: \"Lee Two\" <lee@example-gc.com>\n\nAttached are our responses.";
  assert.deepEqual(originalSender(blue), { name: "Pat Example", address: "pat@example-gc.com" });
  assert.equal(originalSender("Thanks!\nFrom: the crew\n\nSee you Monday."), null, "a From: with no header beside it is no forward");
});

test("a whole name to match a contact on — two words or more, nothing else", () => {
  assert.equal(fullName("Pat Example"), "Pat Example");
  assert.equal(fullName(" \"Mary-Jo  O'Neil\" "), "Mary-Jo O'Neil");
  assert.equal(fullName("Pat"), null);
  assert.equal(fullName("pat@example.com"), null);
  assert.equal(fullName("Estimating Dept 2"), null);
  assert.equal(fullName(null), null);
});

test("company domains match; free mail and our own never do", () => {
  assert.equal(matchableDomain("ben@example-builders.com"), "example-builders.com");
  assert.equal(matchableDomain("someone@gmail.com"), null);
  assert.equal(matchableDomain("x@Yahoo.com"), null);
  assert.equal(matchableDomain("admin@saccobuilt.com", ["admin@saccobuilt.com"]), null);
});

test("signature logos are skipped, plans are not", () => {
  assert.match(attachmentSkip({ id: "1", name: "image001.png", mime: "image/png", size: 4000, inline: true }), /signature/);
  assert.equal(attachmentSkip({ id: "2", name: "site.jpg", mime: "image/jpeg", size: 900000, inline: true }), null);
  assert.equal(attachmentSkip({ id: "3", name: "plans.pdf", mime: "application/pdf", size: 9e6, inline: false }), null);
  assert.match(attachmentSkip({ id: "4", name: "big.pdf", mime: "application/pdf", size: 2e8, inline: false }), /100 MB/);
});

test("the function's file rules match the app's (src/lib/files.ts)", () => {
  for (const [mime, name] of [["application/pdf", "C-101 Paving Plans.pdf"], ["image/jpeg", "site.JPG"], [null, "bid form.docx"], [null, "takeoff.xlsx"], ["video/mp4", "walk.mp4"], [null, "Receipt 44.pdf"], [null, "ITB.pdf"], [null, "Spec 03 30 00.pdf"]]) {
    const k = fileKind(mime, name);
    assert.equal(k, files.kindOf(mime, name), name);
    assert.equal(categoryGuess(k, name), files.categoryGuess(k, name), name);
    assert.equal(safeName(name), files.safeName(name), name);
  }
});

test("HTML-only email becomes text", () => {
  assert.equal(htmlToText("<p>Hi&nbsp;Coy</p><p>Plans attached &amp; specs.</p><style>x{}</style>"), "Hi Coy\nPlans attached & specs.");
});

test("a big email's body: a link instead of text, read from JSON, HTML or raw MIME", () => {
  const m = readMessage({ event_type: "message.received", message: { inbox_id: "i@x.to", message_id: "<m@x>", subject: "Fw: Re: Fields", body_url: "https://example.test/body?sig=1" } });
  assert.equal(m.text, null);
  assert.equal(m.bodyUrl, "https://example.test/body?sig=1");
  assert.deepEqual(bodyFrom('{"text":"hello","html":null}', "application/json"), { text: "hello", html: null });
  assert.deepEqual(bodyFrom('{"message":{"extracted_text":"hi"}}', null), { text: "hi", html: null });
  assert.equal(bodyFrom("<div>Hi <b>Coy</b></div>", "text/html").html, "<div>Hi <b>Coy</b></div>");
  const eml = [
    "From: Coy <admin@example.com>", "Subject: Fw: Re: Fields", 'Content-Type: multipart/mixed; boundary="OUT"', "", "--OUT",
    'Content-Type: multipart/alternative; boundary="ALT"', "", "--ALT", "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable", "", "Bid due Oct 14 =E2=80=94 see the =", "link", "--ALT",
    "Content-Type: text/html", "Content-Transfer-Encoding: base64", "", Buffer.from("<p>Bid due</p>").toString("base64"), "--ALT--",
    "--OUT", "Content-Type: application/pdf", "Content-Disposition: attachment; filename=a.pdf", "", "JVBERi0=", "--OUT--",
  ].join("\r\n");
  assert.deepEqual(mimeParts(eml), { text: "Bid due Oct 14 — see the link", html: "<p>Bid due</p>" });
  assert.equal(bodyFrom(eml, "message/rfc822").text, "Bid due Oct 14 — see the link");
});
