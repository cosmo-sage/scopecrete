import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design references and mockups (docs/design/*.jsx, design/dusty) — not app code.
    "docs/**",
    "design/**",
    // Library files copied in at dev/build by scripts/copy-static-assets.mjs — not ours, not committed.
    "public/pdfjs/**",
    "public/tesseract/**",
  ]),
  // Edge functions are Deno and must match what is deployed byte for byte
  // (DECISIONS §2: read the deployed source back before changing one), so an
  // `any` there is a warning, not a reason to edit a deployed function.
  {
    files: ["supabase/functions/**"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
]);

export default eslintConfig;
