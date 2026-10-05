// Browser-side readers' files, copied from node_modules into public/ so the app
// loads them from our own origin (no CDN). Runs before `next dev` and `next build`;
// the copies are not committed.
//   public/pdfjs      pdf.js's image decoders (JBIG2 / CCITT / JPEG 2000 — how scanned
//                     plan sets are stored), standard fonts, CMaps, ICC profiles. Without
//                     them a scanned drawing renders as a white page (Burgess Ave, 2026-10-02).
//   public/tesseract  tesseract.js's worker, its LSTM cores and the English data, for
//                     reading scanned sheets in the Plan Room (migration 064).
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pub = join(process.cwd(), "public");
const dir = (pkg) => dirname(require.resolve(`${pkg}/package.json`));

const pdfjs = dir("pdfjs-dist");
mkdirSync(join(pub, "pdfjs"), { recursive: true });
for (const d of ["wasm", "standard_fonts", "cmaps", "iccs"]) {
  if (existsSync(join(pdfjs, d))) cpSync(join(pdfjs, d), join(pub, "pdfjs", d), { recursive: true });
}

const tess = join(pub, "tesseract");
mkdirSync(join(tess, "core"), { recursive: true });
mkdirSync(join(tess, "lang"), { recursive: true });
cpSync(join(dir("tesseract.js"), "dist", "worker.min.js"), join(tess, "worker.min.js"));
const core = dir("tesseract.js-core");
for (const f of readdirSync(core)) if (/lstm\.(wasm|wasm\.js|js)$/.test(f)) cpSync(join(core, f), join(tess, "core", f));
// best_int: the accurate model, integer-quantised — small text on drawings needs the accuracy.
cpSync(join(dir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), join(tess, "lang", "eng.traineddata.gz"));

console.log(`static readers → ${pub}/pdfjs, ${pub}/tesseract`);
