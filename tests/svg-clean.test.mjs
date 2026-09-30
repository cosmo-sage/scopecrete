// Uploaded SVG logos are cleaned before they are stored (migration 056) — `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSvg } from "../src/lib/svg-clean.ts";

const wrap = (inner) => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

test("a plain logo passes through", () => {
  const svg = wrap(`<path d="M0 0h10v10z" fill="#B85A3C"/><use href="#a"/>`);
  assert.equal(cleanSvg(svg), svg);
});

test("scripts, foreignObject and animation are removed", () => {
  const out = cleanSvg(wrap(`<script>alert(1)</script><script src="x.js"/><foreignObject><div>hi</div></foreignObject><set attributeName="href" to="javascript:alert(1)"/><rect/>`));
  assert.ok(out);
  assert.doesNotMatch(out, /script|foreignObject|<set|alert/i);
  assert.match(out, /<rect\/>/);
});

test("event handlers and outside references are removed", () => {
  const out = cleanSvg(wrap(`<rect onload="alert(1)" ONCLICK='x' onmouseover=y width="1"/><a href="javascript:alert(1)"><text>x</text></a><image xlink:href="https://evil.example/t.png"/><image href="data:image/png;base64,AAAA"/>`));
  assert.doesNotMatch(out, /on(load|click|mouseover)|javascript|evil\.example/i);
  assert.match(out, /width="1"/);
  assert.match(out, /data:image\/png;base64,AAAA/);
});

test("url() to the outside and @import are neutralised", () => {
  const out = cleanSvg(wrap(`<style>@import url(https://x.example/a.css); .a{fill:url(#g)} .b{background:url('https://x.example/t')}</style>`));
  assert.doesNotMatch(out, /x\.example|@import/);
  assert.match(out, /url\(#g\)/);
});

test("entities are removed and non-SVG is refused", () => {
  const out = cleanSvg(`<!DOCTYPE svg [<!ENTITY a "aaaa">]>` + wrap(`<text>&a;</text>`));
  assert.doesNotMatch(out, /ENTITY|DOCTYPE/);
  assert.equal(cleanSvg("<html><body>no</body></html>"), null);
  assert.equal(cleanSvg("not xml"), null);
});
