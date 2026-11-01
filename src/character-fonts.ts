import { CHARACTER_LANGUAGES } from "./character-metrics.ts";

/**
 * Resolve seven independent native font names without merging language tables.
 *
 * Missing metadata inherits the ordinary font family. Existing arrays must
 * contain one literal font name per native language; names remain text rather
 * than CSS source and are quoted separately by the renderer.
 * @param {unknown} value - Optional native font-name array.
 * @param {string} [fallback=""] - Ordinary family used without an explicit array.
 * @returns {string[]} Fresh language-ordered font names.
 * @throws {RangeError} If an explicit array has invalid entries or length.
 * @example
 * characterFonts(null, 'Arial'); // Seven Arial entries.
 */
export function characterFonts(value: unknown, fallback = ""): string[] {
  if (value == null)
    return Array<string>(CHARACTER_LANGUAGES.length).fill(fallback);
  if (!Array.isArray(value) || value.length !== CHARACTER_LANGUAGES.length)
    throw new RangeError(
      "Native character fonts require seven language names.",
    );
  /** Validated names are copied to prevent edits from mutating imported arrays. */
  const result: string[] = [];
  for (
    /** Literal face name from one native language font table. */
  const face of value) {
    if (typeof face !== "string" || /[\u0000-\u001f]/.test(face))
      throw new RangeError("Native character font name is invalid.");
    result.push(face);
  }
  return result;
}

/**
 * Detect language-specific font choices that need retained metadata.
 *
 * Uniform tables can be represented by an ordinary family alone. Empty names
 * preserve missing native references and use the caller's normal fallback.
 * @param {string[]} fonts - Validated native font table.
 * @returns {boolean} Whether any language differs from the Hangul font.
 * @example
 * hasCharacterFonts(['A','B','A','A','A','A','A']); // true
 */
export function hasCharacterFonts(fonts: string[]): boolean {
  for (
    /** Face compared with the first native language. */
  const face of fonts)
    if (face !== fonts[0]) return true;
  return false;
}

/**
 * Quote one native face name as an inert CSS family token.
 *
 * Backslashes and double quotes are escaped before style assignment. Native
 * names are never treated as CSS declarations or comma-separated fallback lists.
 * @param {string} face - Literal font name from a native language table.
 * @returns {string} Quoted CSS font-family token.
 * @example
 * characterFontCss('Times New Roman'); // '"Times New Roman"'
 */
export function characterFontCss(face: string): string {
  return `"${face.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
