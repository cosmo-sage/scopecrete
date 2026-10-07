import test from "node:test";
import assert from "node:assert/strict";
import { seeableMime, SEE_MAX_BYTES } from "../src/lib/dusty/see.ts";

test("photos the model takes are sent as images", () => {
  assert.equal(seeableMime("image/png", "Screenshot.png", 300_000), "image/png");
  assert.equal(seeableMime(null, "IMG_1.JPG", 10), "image/jpeg");
  assert.equal(seeableMime("image/jpeg; charset=binary", "x", 10), "image/jpeg");
});
test("other files and big photos wait for the reader", () => {
  assert.equal(seeableMime("image/heic", "IMG_2.HEIC", 10), null);
  assert.equal(seeableMime("application/pdf", "plans.pdf", 10), null);
  assert.equal(seeableMime("image/png", "big.png", SEE_MAX_BYTES + 1), null);
});

import { isPdf, pdfTextNow, READ_PDF_MAX_BYTES } from "../src/lib/dusty/see.ts";

// A one-page PDF with one line of text, built by hand (offsets worked out below).
function tinyPdf(line) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 72 700 Td (${line}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

test("a PDF attached in the chat is read on the spot", async () => {
  assert.equal(isPdf("application/pdf", "icon-budget.pdf", 31_406), true);
  assert.equal(isPdf(null, "Budget.PDF", 10), true);
  assert.equal(isPdf("application/pdf", "spec.pdf", READ_PDF_MAX_BYTES + 1), false);
  assert.equal(isPdf("image/png", "x.png", 10), false);
  const got = await pdfTextNow(tinyPdf("PROPOSED PRICE 624,380 for the Fort Polk RUBA Phase 1 slabs"));
  assert.ok(got);
  assert.equal(got.pages, 1);
  assert.match(got.text, /PROPOSED PRICE 624,380/);
});
test("a PDF with no text (a scan) waits for the reader", async () => {
  assert.equal(await pdfTextNow(tinyPdf("")), null);
  assert.equal(await pdfTextNow(new TextEncoder().encode("not a pdf")), null);
});
