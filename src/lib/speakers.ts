/**
 * Dusty's background reader is shown call transcripts with the two sides
 * labelled US and THEM, and his summaries and quotes sometimes keep those
 * words. Coy (2026-10-04): "'US' is confusing. It should say 'We'" and
 * "'Them' is confusing. it should be replaced by 'Customer'". Applied wherever
 * those texts are shown or handed to Dusty. Pure — tests/speakers.test.mjs.
 *
 * Only the capitalised labels change (US / THEM, with or without a colon) —
 * "us", "them" in a sentence and "en-US" are left alone. The other side is
 * "Vendor" for someone filed vendor, else "Customer".
 */
export function plainSpeakers<T extends string | null | undefined>(text: T, bucket?: string | null): T {
  if (!text) return text;
  const them = bucket === "vendor" ? "Vendor" : "Customer";
  return text
    .replace(/(^|[^A-Za-z-])US(?=\b)(?![-.]?[A-Za-z])/g, "$1We")
    .replace(/(^|[^A-Za-z-])THEM\b/g, `$1${them}`) as T;
}
