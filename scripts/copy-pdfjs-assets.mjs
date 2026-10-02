// pdf.js's image decoders (JBIG2 / JPEG 2000 — how scanned plan sets are stored),
// standard fonts, CMaps and ICC profiles, copied from the installed pdfjs-dist into
// public/pdfjs so the Plan Room loads them from our own origin (no CDN). Without
// them a scanned drawing renders as a white page (Burgess Ave, 2026-10-02).
// Runs before `next dev` and `next build`; the copy is not committed.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const out = join(process.cwd(), "public", "pdfjs");
mkdirSync(out, { recursive: true });
for (const dir of ["wasm", "standard_fonts", "cmaps", "iccs"]) {
  const from = join(root, dir);
  if (existsSync(from)) cpSync(from, join(out, dir), { recursive: true });
}
console.log(`pdf.js assets → ${out}`);
