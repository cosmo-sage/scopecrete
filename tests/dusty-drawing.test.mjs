// Dusty's drawings: a ```drawing block read into a tree of safe shapes — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDrawing, drawingSvg, drawingFileName } from "../src/lib/dusty/drawing.ts";
import { parseMarkdown } from "../src/lib/markdown.ts";
import { shareText } from "../src/lib/dusty/share.ts";

const SLAB = `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
  <title>Wilson driveway &amp; apron</title>
  <rect x="100" y="80" width="600" height="300" fill="#9AA0A6" stroke="black" stroke-width="2"/>
  <line x1="400" y1="80" x2="400" y2="380" stroke="black" stroke-dasharray="8 6"/>
  <text x="400" y="440" text-anchor="middle" font-size="18">30'-0" × 40'-0" · 4" slab</text>
  <polygon points="100,60 110,55 110,65" fill="black"/>
</svg>`;

test("a slab sketch keeps its shapes, sizes and title", () => {
  const d = parseDrawing(SLAB);
  assert.ok(d);
  assert.equal(d.title, "Wilson driveway & apron");
  assert.equal(d.root.attrs.viewBox, "0 0 800 500");
  assert.deepEqual(d.root.kids.map((k) => k.tag), ["rect", "line", "text", "polygon"]);
  assert.equal(d.root.kids[2].kids[0], `30'-0" × 40'-0" · 4" slab`);
  assert.equal(d.root.kids[1].attrs["stroke-dasharray"], "8 6");
  assert.equal(d.dropped, 0);
});

test("scripts, handlers, links, styles, images and url() never survive", () => {
  const bad = `<svg viewBox="0 0 10 10" onload="alert(1)">
    <script>alert(1)</script><style>*{}</style>
    <a href="javascript:alert(1)"><rect width="5" height="5"/></a>
    <image href="https://evil.example/x.png" width="5" height="5"/>
    <foreignObject><div>hi</div></foreignObject>
    <rect x="1" y="1" width="2" height="2" fill="url(#g)" style="fill:red" onclick="x()" class="c"/>
    <text x="1" y="9">&lt;script&gt;</text>
  </svg>`;
  const d = parseDrawing(bad);
  assert.ok(d);
  const out = drawingSvg(d);
  for (const w of ["script>", "onload", "onclick", "href", "image", "foreignObject", "url(", "style", "class", "javascript"]) assert.ok(!out.includes(w), w);
  assert.deepEqual(d.root.kids.map((k) => k.tag), ["rect", "text"]);
  assert.deepEqual(d.root.kids[0].attrs, { x: "1", y: "1", width: "2", height: "2" });
  assert.equal(d.root.kids[1].kids[0], "<script>");
  assert.ok(out.includes("&lt;script&gt;"));
  assert.ok(d.dropped > 0);
});

test("no whole <svg> yet, or no size, is no drawing", () => {
  assert.equal(parseDrawing("<svg viewBox='0 0 10 10'><rect width='2'"), null);
  assert.equal(parseDrawing("<svg><rect width='2' height='2'/></svg>"), null);
  assert.equal(parseDrawing("just words"), null);
  const sized = parseDrawing("<svg width='200' height='100'><circle cx='5' cy='5' r='3'/></svg>");
  assert.equal(sized.root.attrs.viewBox, "0 0 200 100");
  assert.equal(sized.title, "Drawing");
});

test("odd values are dropped, good ones kept", () => {
  const d = parseDrawing(`<svg viewBox="0 0 10 10"><g transform="translate(2,3) rotate(45)"><path d="M0 0 L5 5 Z" fill="expression(x)" stroke="steelblue"/></g></svg>`);
  const g = d.root.kids[0];
  assert.equal(g.attrs.transform, "translate(2,3) rotate(45)");
  assert.deepEqual(g.kids[0].attrs, { d: "M0 0 L5 5 Z", stroke: "steelblue" });
});

test("the file is the cleaned drawing, named from its title", () => {
  const d = parseDrawing(SLAB);
  const svg = drawingSvg(d, { background: "#ffffff" });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(svg.includes("<title>Wilson driveway &amp; apron</title>"));
  assert.equal(drawingFileName(d, "png"), "wilson-driveway-apron.png");
});

test("Markdown reads a ```drawing block as a drawing, open while it streams", () => {
  const b = parseMarkdown("Here it is:\n\n```drawing\n" + SLAB + "\n```\n\nCheck the apron.");
  assert.deepEqual(b.map((x) => x.k), ["p", "drawing", "p"]);
  assert.equal(b[1].open, false);
  assert.ok(parseDrawing(b[1].v));
  const streaming = parseMarkdown("```drawing\n<svg viewBox='0 0 1 1'>");
  assert.equal(streaming[0].k, "drawing");
  assert.equal(streaming[0].open, true);
  assert.equal(parseMarkdown("```js\nx\n```")[0].k, "code");
});

test("sharing leaves the drawing's code out", () => {
  const t = shareText([{ role: "assistant", content: "Layout:\n\n```drawing\n" + SLAB + "\n```" }], "last");
  assert.ok(!t.includes("<svg"));
  assert.ok(t.includes("Dusty made a drawing"));
});
