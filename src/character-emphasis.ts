/** Installed-Hangul HWPX names in binary order; TILDE and CARON render oppositely in that application. */
export const NATIVE_EMPHASIS_TYPES = [
  "NONE",
  "DOT_ABOVE",
  "RING_ABOVE",
  "TILDE",
  "CARON",
  "SIDE",
  "COLON",
  "GRAVE_ACCENT",
  "ACUTE_ACCENT",
  "CIRCUMFLEX",
  "MACRON",
  "HOOK_ABOVE",
  "DOT_BELOW",
] as const;

/** Accessible descriptions follow observed visual shapes rather than misleading native XML names. */
export const NATIVE_EMPHASIS_LABELS = [
  "강조점 없음",
  "위쪽 점",
  "위쪽 원",
  "위쪽 반대 곡절",
  "위쪽 물결",
  "왼쪽 점",
  "왼쪽 두 점",
  "위쪽 억음",
  "위쪽 양음",
  "위쪽 곡절",
  "위쪽 가로선",
  "위쪽 갈고리",
  "아래쪽 점",
] as const;

/**
 * Validate a literal native emphasis code without coercing unrelated values.
 *
 * Binary codes thirteen through fifteen are retained as legacy source values.
 * They have no invented visual style and follow native HWPX omission on export.
 * @param {unknown} value - Native numeric code, form string or absent default.
 * @returns {number} Exact four-bit source code.
 * @throws {RangeError} If an explicit value is not an integer between zero and fifteen.
 * @example
 * characterEmphasis('5'); // Left-side dot, independent of underline or outline.
 */
export function characterEmphasis(value: unknown): number {
  if (value == null) return 0;
  /** Form strings are accepted without converting booleans or objects. */
  const code =
    typeof value === "string" && value.trim() ? Number(value) : value;
  if (
    typeof code !== "number" ||
    !Number.isInteger(code) ||
    code < 0 ||
    code > 15
  )
    throw new RangeError("Unsupported native character emphasis.");
  return code;
}

/**
 * Preserve emphasis metadata without changing source glyphs or line height.
 *
 * Measured paragraph drawing later adds all supported marks, including native
 * horizontal side dots that CSS text-emphasis cannot place beside a glyph.
 * @param {Record<string,unknown>} attrs - Authored text-style attributes.
 * @returns {Record<string,string>} Literal source metadata or no preference.
 * @throws {RangeError} If explicit source metadata is invalid.
 * @example
 * renderCharacterEmphasis({nativeEmphasisType:12}); // Retains the below-dot code.
 */
export function renderCharacterEmphasis(
  attrs: Record<string, unknown>,
): Record<string, string> {
  return attrs.nativeEmphasisType == null
    ? {}
    : {
        "data-forhan-emphasis": String(
          characterEmphasis(attrs.nativeEmphasisType),
        ),
      };
}

/**
 * Produce original normalized geometry for an observed native emphasis shape.
 *
 * Coordinates use one font em around the mark center. Native code three draws
 * a caron and code four a tilde despite their reversed HWPX attribute names.
 * @param {number} value - Exact retained native emphasis code.
 * @returns {string} Fixed local SVG geometry without any source text or markup.
 * @throws {RangeError} If the native code is invalid.
 * @example
 * emphasisShape(6); // Two side dots rather than an above colon.
 */
export function emphasisShape(value: number): string {
  /** Shape data derives only from the validated local code domain. */
  const code = characterEmphasis(value);
  if (code === 1 || code === 12) return '<circle r=".0375"/>';
  if (code === 2)
    return '<circle r=".075" fill="none" stroke="currentColor" stroke-width=".025"/>';
  if (code === 5) return '<circle r=".055"/>';
  if (code === 6)
    return '<circle cy="-.11" r=".05"/><circle cy=".11" r=".05"/>';
  /** Open accent paths use the same observed stroke weight without font-dependent fallback glyphs. */
  const path =
    code === 3
      ? "M-.14 -.04L0 .04L.14 -.04"
      : code === 4
        ? "M-.14 .02Q-.07 -.08 0 0T.14 -.02"
        : code === 7
          ? "M-.08 -.07L.08 .07"
          : code === 8
            ? "M-.08 .07L.08 -.07"
            : code === 9
              ? "M-.14 .04L0 -.04L.14 .04"
              : code === 10
                ? "M-.125 0H.125"
                : code === 11
                  ? "M-.055 -.075C.105 -.13 .12 .055 -.005 .055L-.005 .09"
                  : "";
  return path
    ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width=".025"/>`
    : "";
}

/**
 * Draw an original compact sample for the native graphic selector.
 *
 * A dotted reference circle indicates the source glyph. Its neighboring mark
 * retains native side, above and below placement without proprietary artwork.
 * @param {number} value - Literal native emphasis code.
 * @param {number} [width=66] - Actual graphic selector sample width.
 * @returns {string} Standalone fixed-geometry SVG.
 * @throws {RangeError} If the native emphasis code is invalid.
 * @example
 * nativeEmphasisSvg(12); // A dot below the reference circle.
 */
export function nativeEmphasisSvg(value: number, width = 66): string {
  /** Small native samples are centered independently of their enclosing selector. */
  const code = characterEmphasis(value),
    center = width / 2;
  if (!code || code > 12)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 14" aria-hidden="true"><rect x="${center - 6}" y=".5" width="12" height="13" fill="none" stroke="#8d8d8d"/><path d="M${center - 5.5} 12.5L${center + 5.5} 1.5" stroke="#ed1919"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 14" aria-hidden="true"><circle cx="${center}" cy="8" r="3" fill="none" stroke="#333" stroke-dasharray="1 1"/><g transform="translate(${center + (code === 5 || code === 6 ? -6 : 0)} ${code === 12 ? 13 : code === 5 || code === 6 ? 8 : 1.5}) scale(14)" fill="#333" color="#333">${emphasisShape(code)}</g></svg>`;
}
