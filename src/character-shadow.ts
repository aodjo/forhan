import { normalizeColor } from "./colors.ts";
import { storedFontSizePoints } from "./formatting.ts";

/** Native shadow codes observed in both binary character shapes and saved HWPX. */
export const NATIVE_SHADOW_TYPES = ["NONE", "DROP", "CONTINUOUS"] as const;

/** Independent shadow preferences remain available even when the effect is disabled. */
export interface CharacterShadow {
  type: (typeof NATIVE_SHADOW_TYPES)[number];
  x: number;
  y: number;
  color: string;
}

/**
 * Validate native character-shadow fields without flattening inactive preferences.
 *
 * Signed offsets use the binary format's percentage-byte domain. Missing fields
 * receive the installed application's NONE, ten-percent, gray defaults. Invalid
 * input is rejected before it can become wrapped bytes or executable CSS.
 * @param {Record<string,unknown>} [attrs={}] - Independent source text-style attributes.
 * @returns {CharacterShadow} A fresh validated native shadow definition.
 * @throws {RangeError} If the kind, offset or solid color is not representable.
 * @example
 * characterShadow({nativeShadowType:'DROP',nativeShadowOffsetX:-20}).x; // -20
 */
export function characterShadow(
  attrs: Record<string, unknown> = {},
): CharacterShadow {
  /** The native code is preserved independently from both offsets and its color. */
  const type = attrs.nativeShadowType ?? "NONE",
    x =
      attrs.nativeShadowOffsetX == null
        ? 10
        : Number(attrs.nativeShadowOffsetX),
    y =
      attrs.nativeShadowOffsetY == null
        ? 10
        : Number(attrs.nativeShadowOffsetY),
    color = normalizeColor(attrs.nativeShadowColor ?? "#c0c0c0");
  for (/** Explicit offsets cannot silently coerce booleans, objects or empty drafts into byte values. */ const value of [
    attrs.nativeShadowOffsetX,
    attrs.nativeShadowOffsetY,
  ])
    if (
      value != null &&
      ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && !value.trim()))
    )
      throw new RangeError("Invalid native character shadow offset.");
  if (
    !NATIVE_SHADOW_TYPES.includes(type as CharacterShadow["type"]) ||
    !Number.isInteger(x) ||
    x < -128 ||
    x > 127 ||
    !Number.isInteger(y) ||
    y < -128 ||
    y > 127 ||
    !color
  )
    throw new RangeError("Invalid native character shadow.");
  return { type: type as CharacterShadow["type"], x, y, color };
}

/**
 * Draw a native discrete or continuous shadow behind the original editable text.
 *
 * Offsets follow the physical base size when available. Continuous extrusion
 * uses at most 512 zero-blur samples; very large fonts retain exact source data
 * while their screen raster remains an approximation of native glyph drawing.
 * Coordinates use six significant digits so CSSOM serialization preserves the
 * same values in editable, standalone HTML and script-free print documents.
 * @param {Record<string,unknown>} attrs - Native shadow fields and optional physical font size.
 * @param {number} [horizontalScale=1] - Glyph-only x scaling whose independent physical shadow offset is retained.
 * @returns {string} Safe CSS text-shadow value, including explicit none when disabled.
 * @throws {RangeError} If the source shadow definition cannot be represented.
 * @example
 * characterShadowCss({fontSize:'10pt',nativeShadowType:'DROP'}); // 1pt 1pt 0 #c0c0c0
 */
export function characterShadowCss(attrs: Record<string, unknown>,horizontalScale=1): string {
  if(!Number.isFinite(horizontalScale)||horizontalScale<=0)throw new RangeError('Invalid horizontal shadow scale.');
  /** Percent offsets remain relative to the original source size rather than the dialog sample font. */
  const shadow = characterShadow(attrs),
    base = storedFontSizePoints(attrs.fontSize, Number.NaN),
    size = Number.isFinite(base) ? base : 1,
    unit = Number.isFinite(base) ? "pt" : "em",
    x = (size * shadow.x) / 100,
    y = (size * shadow.y) / 100,
    steps =
      shadow.type === "CONTINUOUS"
        ? Math.max(
            1,
            Math.min(
              512,
              Math.ceil(
                Math.max(Math.abs(x), Math.abs(y)) *
                  (unit === "pt" ? 4 / 3 : 16),
              ),
            ),
          )
        : 1;
  if (shadow.type === "NONE") return "none";
  let css = "";
  for (let index = steps; index >= 1; index--) {
    if (css) css += ",";
    css += `${Number(((x * index) / steps / horizontalScale).toPrecision(6))}${unit} ${Number(((y * index) / steps).toPrecision(6))}${unit} 0 ${shadow.color}`;
  }
  return css;
}

/**
 * Serialize validated native fields alongside the actual editable shadow CSS.
 *
 * The metadata retains disabled offsets and continuous mode across HTML copy,
 * export and reimport without trying to infer those fields from a raster.
 * @param {Record<string,unknown>} attrs - Original native text-style fields.
 * @returns {Record<string,string>} Safe source metadata and matching visible CSS.
 * @throws {RangeError} If a source field is malformed or outside the binary domain.
 * @example
 * renderCharacterShadow({nativeShadowType:'NONE'}).style; // text-shadow:none
 */
export function renderCharacterShadow(
  attrs: Record<string, unknown>,
): Record<string, string> {
  if (
    [
      attrs.nativeShadowType,
      attrs.nativeShadowOffsetX,
      attrs.nativeShadowOffsetY,
      attrs.nativeShadowColor,
    ].every(
      /**
       * Detect a plain external span without introducing a native effect override.
       *
       * Missing metadata leaves inheritance available to ordinary document styles.
       * @param {unknown} value - One optional source shadow field.
       * @returns {boolean} Whether this field is absent.
       * @example
       * // A newly authored span with no shadow settings needs no extra metadata.
       */
      (value) => value == null,
    )
  )
    return {};
  return {
    "data-forhan-shadow": JSON.stringify(characterShadow(attrs)),
    style: `text-shadow:${characterShadowCss(attrs)}`,
  };
}

/**
 * Restore only explicit native shadow metadata from an imported HTML span.
 *
 * Ancestor metadata can surround nested emphasis. Every retained field is
 * validated before it reaches the source model; unrelated external CSS remains
 * outside this native serialization contract.
 * @param {HTMLElement} element - Actual parsed document span.
 * @returns {CharacterShadow|null} Retained source definition, or no native override.
 * @throws {SyntaxError|RangeError} If explicit metadata is malformed or unrepresentable.
 * @example
 * readCharacterShadow(span)?.type; // DROP for exported native discrete shadow.
 */
export function readCharacterShadow(
  element: HTMLElement,
): CharacterShadow | null {
  /** Metadata is read literally and never interpreted as HTML or CSS. */
  const value = element
    .closest("[data-forhan-shadow]")
    ?.getAttribute("data-forhan-shadow");
  if (value == null) return null;
  /** The same validator guards browser import and both native writers. */
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RangeError("Invalid native shadow metadata.");
  return characterShadow({
    nativeShadowType: parsed.type,
    nativeShadowOffsetX: parsed.x,
    nativeShadowOffsetY: parsed.y,
    nativeShadowColor: parsed.color,
  });
}
