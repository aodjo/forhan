/** Installed-native character outline order, independent of underline pattern indices. */
export const NATIVE_OUTLINE_TYPES = [
  "NONE",
  "SOLID",
  "DOT",
  "THICK",
  "DASH",
  "DASH_DOT",
  "DASH_DOT_DOT",
] as const;

/** Accessible names accompany independently drawn native outline samples. */
export const NATIVE_OUTLINE_LABELS = [
  "외곽선 없음",
  "실선 외곽선",
  "점선 외곽선",
  "굵은 외곽선",
  "파선 외곽선",
  "일점쇄선 외곽선",
  "이점쇄선 외곽선",
] as const;

/** Dash geometry is applied to real font contours rather than a rectangular text border. */
export const OUTLINE_DASHES = [
  "",
  "",
  "1 1",
  "",
  "4 2",
  "4 2 1 2",
  "4 2 1 2 1 2",
] as const;

/**
 * Validate a supported native character-outline code without byte wrapping.
 *
 * The native selector offers NONE plus six contour styles. Legacy code seven
 * is retained for binary/Forhan/HTML storage; installed Hangul emits no type
 * for it in HWPX, so it is not invented as a seventh visual contour style.
 * @param {unknown} value - Original native numeric code or absent default.
 * @returns {number} Observed code, including the separately retained legacy value seven.
 * @throws {RangeError} If an explicit code is not a supported native outline.
 * @example
 * characterOutline(2); // DOT, distinct from underline's numeric pattern mapping.
 */
export function characterOutline(value: unknown): number {
  if (value == null) return 0;
  /** Strings from literal form controls are accepted without coercing booleans or objects. */
  const code =
    typeof value === "string" && value.trim() ? Number(value) : value;
  if (
    typeof code !== "number" ||
    !Number.isInteger(code) ||
    code < 0 ||
    code > 7
  )
    throw new RangeError("Unsupported native character outline.");
  return code;
}

/**
 * Render a safe source outline marker with a visible CSS-only contour fallback.
 *
 * Native pattern drawing later follows actual wrapped text geometry. The fallback
 * keeps copied source text visible where a host cannot render the SVG contour
 * layer; exact original numeric metadata survives native and HTML serialization.
 * @param {Record<string,unknown>} attrs - Original editable text-style attributes.
 * @returns {Record<string,string>} Source metadata and a neutral or hollow contour style.
 * @throws {RangeError} If the retained source code is unsupported.
 * @example
 * renderCharacterOutline({nativeOutlineType:3}); // A thick hollow contour, not bold filled text.
 */
export function renderCharacterOutline(
  attrs: Record<string, unknown>,
): Record<string, string> {
  if (attrs.nativeOutlineType == null) return {};
  /** Rendering never changes the independent foreground, shading or native shadow fields. */
  const code = characterOutline(attrs.nativeOutlineType);
  return {
    "data-forhan-outline": String(code),
    style:
      code && code !== 7
        ? `-webkit-text-stroke:${code === 3 ? 2 : 1}px currentColor;-webkit-text-fill-color:transparent`
        : "-webkit-text-stroke-width:0;-webkit-text-fill-color:currentColor",
  };
}

/**
 * Draw an original contour sample for the measured native graphic selector.
 *
 * The no-outline sample is the native-style red diagonal; supported shapes
 * retain distinct contour dash geometry without embedding proprietary artwork.
 * @param {number} value - Supported native outline code.
 * @param {number} [width=66] - Closed-control or popup sample width in CSS pixels.
 * @returns {string} Original standalone SVG sample from fixed geometry.
 * @throws {RangeError} If the source code is unsupported.
 * @example
 * nativeOutlineSvg(2,58); // A dotted contour rather than a dotted underline.
 */
export function nativeOutlineSvg(value: number, width = 66): string {
  /** Samples use literal coordinates and fixed local stroke definitions only. */
  const code = characterOutline(value);
  if (code > 0 && code < 7) {
    /** Native menu samples have their own measured pen phases, separate from glyph contour drawing. */
    const segments: [number, number][] = [],
      y = code === 3 ? 7 : 7.5;
    if (code === 1 || code === 3) segments.push([0, width]);
    else if (code === 2)
      for (let x = 0; x < width; x += 6)
        segments.push([x, Math.min(width, x + 3)]);
    else if (code === 4) {
      segments.push([0, Math.min(width, 14)]);
      for (let x = 20; x < width; x += 22)
        segments.push([x, Math.min(width, x + 16)]);
    } else if (code === 5) {
      segments.push([0, Math.min(width, 10)]);
      for (let x = 16; x < width; x += 24) {
        segments.push([x, Math.min(width, x + 3)]);
        if (x + 9 < width) segments.push([x + 9, Math.min(width, x + 18)]);
      }
    } else {
      segments.push([1, Math.min(width - 1, 12)]);
      for (let x = 15; x < width - 1; x += 24) {
        segments.push([x, Math.min(width - 1, x + 3)]);
        if (x + 6 < width - 1)
          segments.push([x + 6, Math.min(width - 1, x + 9)]);
        if (x + 12 < width - 1)
          segments.push([x + 12, Math.min(width - 1, x + 21)]);
      }
    }
    let path = "";
    for (/** Each visible interval follows the preserved original native menu pixels. */ const [
      from,
      to,
    ] of segments)
      path += `M${from} ${y}H${to}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 14" aria-hidden="true"><path d="${path}" fill="none" stroke="#333" stroke-width="${code === 3 ? 2 : 1}"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 14" aria-hidden="true"><rect x=".5" y="1.5" width="${width - 1}" height="11" fill="none" stroke="#8d8d8d"/><path d="M1 11L${width - 2} 2" stroke="#ed1919"/></svg>`;
}
