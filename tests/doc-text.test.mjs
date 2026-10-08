// Word and text files — `npm test`. What the Files preview shows and Dusty reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { docKind, docxBlocks, blocksText, docxFromBytes, docText } from "../src/lib/doc-text.ts";

const XML = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Scope of work</w:t></w:r></w:p>
<w:p w:rsidR="00A1"/>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Pour</w:t></w:r><w:r><w:t xml:space="preserve"> a 4" slab &amp; </w:t></w:r><w:r><w:rPr><w:i w:val="1"/></w:rPr><w:t>broom</w:t></w:r><w:r><w:t>finish.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Demo 1,200 SF</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Price</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Concrete</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>$9,650</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>Thanks</w:t></w:r></w:p>
</w:body></w:document>`;

test("which files are Word or text", () => {
  assert.equal(docKind(null, "MSA redline.DOCX"), "docx");
  assert.equal(docKind("text/markdown", "x"), "markdown");
  assert.equal(docKind("", "notes.md"), "markdown");
  assert.equal(docKind("", "bid.csv"), "text");
  assert.equal(docKind("", "old.doc"), null);
  assert.equal(docKind("application/pdf", "a.pdf"), null);
});

test("a Word document's paragraphs, headings, lists, bold and tables", () => {
  const b = docxBlocks(XML);
  assert.equal(b.length, 5);
  assert.deepEqual(b[0], { t: "p", style: "h1", runs: [{ v: "Scope of work" }] });
  assert.deepEqual(b[1].runs, [{ v: "Pour", b: true }, { v: ' a 4" slab & ' }, { v: "broom", i: true }, { v: "finish." }]);
  assert.equal(b[2].style, "li");
  assert.deepEqual(b[3], { t: "table", rows: [["Item", "Price"], ["Concrete", "$9,650"]] });
  assert.deepEqual(b[4].runs, [{ v: "Thanks" }]);
  assert.equal(blocksText(b), '# Scope of work\n\nPour a 4" slab & broomfinish.\n\n- Demo 1,200 SF\n\nItem | Price\nConcrete | $9,650\n\nThanks');
});

test("a .docx opened from its zip; anything else is null", () => {
  const zip = zipSync({ "[Content_Types].xml": strToU8("<x/>"), "word/document.xml": strToU8(XML) });
  assert.equal(docxFromBytes(zip).length, 5);
  assert.match(docText("docx", zip), /Concrete \| \$9,650/);
  assert.equal(docxFromBytes(strToU8("not a zip")), null);
  assert.equal(docText("text", strToU8("﻿# Hi\n")), "# Hi\n");
  assert.equal(docText("text", strToU8("  \n")), null);
});

test("read-files carries the same reader", () => {
  assert.equal(readFileSync("supabase/functions/read-files/doc-text.ts", "utf8"), readFileSync("src/lib/doc-text.ts", "utf8"));
});
