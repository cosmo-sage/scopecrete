import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-auth";
import { modelJson } from "@/lib/draft/model-server";
import { CARD_PROMPT, readCard } from "@/lib/business-card";

/**
 * Read a business card's photo (Coy, 2026-10-09). POST multipart `image`
 * (JPEG, PNG or WebP, 5 MB at most) → { card } for the New contact form.
 * Signed-in members only; nothing is stored — the photo goes to the model
 * API in this request and is dropped, and Coy saves the contact himself.
 */

export const dynamic = "force-dynamic";
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const result = await getApiSession(req);
  if (!result.ok) return result.response;
  const { applyCookies } = result.session;
  const bad = (m: string, s = 400) => applyCookies(NextResponse.json({ error: m }, { status: s }));
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof Blob)) return bad("Take a photo of the card.");
  if (!TYPES.has(file.type)) return bad("That photo isn't a JPEG, PNG or WebP.");
  if (file.size > 5 * 1024 * 1024) return bad("That photo is over 5 MB.");
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const r = await modelJson(CARD_PROMPT, "Read this business card.", 800, 30_000, [{ mime: file.type, b64 }]);
  if (!r.ok) return bad(r.error === "not configured" ? "Card reading needs ANTHROPIC_API_KEY in Vercel." : `Couldn't read the card: ${r.error}.`, 502);
  return applyCookies(NextResponse.json({ card: readCard(r.json) }));
}
