/**
 * Clean an uploaded SVG logo (migration 056). The logo is shown through an
 * <img>, where an SVG's scripts never run — this is the second lock, for
 * anyone who opens the file's link directly.
 *
 * Removes: DOCTYPE / ENTITY declarations, <script>, <foreignObject>, embedded
 * frames and media, animation elements (they can rewrite an href), every on…
 * event attribute, and any href / xlink:href / url(…) that is not a local
 * "#id" or an inline raster image. Returns null if what is left is not an SVG.
 */

const ELEMENTS = ["script", "foreignObject", "iframe", "embed", "object", "audio", "video", "set", "animate", "animateMotion", "animateTransform", "handler", "listener"];

const SAFE_REF = /^\s*(#[\w.-]*|data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*)\s*$/i;

export function cleanSvg(input: string): string | null {
  let s = input.replace(/^﻿/, "");
  s = s.replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, "");
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, "");
  s = s.replace(/<\?(?!xml\s)[\s\S]*?\?>/gi, ""); // processing instructions other than the xml declaration
  for (const el of ELEMENTS) {
    s = s.replace(new RegExp(`<${el}\\b[\\s\\S]*?<\\/${el}\\s*>`, "gi"), "");
    s = s.replace(new RegExp(`<${el}\\b[^>]*\\/?>`, "gi"), "");
  }
  // Event handlers: on…="…", on…='…', on…=bare
  s = s.replace(/\s+on[a-z0-9_-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // References that leave the file.
  s = s.replace(/\s+((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, _a, _q, d, sq, bare) => {
    const v = (d ?? sq ?? bare ?? "") as string;
    return SAFE_REF.test(v) ? m : "";
  });
  s = s.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (m, _q, v: string) => (SAFE_REF.test(v) ? m : "none"));
  s = s.replace(/@import[^;]*;?/gi, "");
  s = s.replace(/javascript\s*:/gi, "");
  const body = s.replace(/^\s*(<\?xml[\s\S]*?\?>)?\s*(<!--[\s\S]*?-->\s*)*/i, "");
  if (!/^<svg[\s>]/i.test(body) || !/<\/svg\s*>\s*$/i.test(s.trim())) return null;
  return s.trim();
}
