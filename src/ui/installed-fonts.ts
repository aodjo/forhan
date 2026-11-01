import { readLocalFontMetadata } from "../font-metadata.ts";

/** Literal locally available font family, with localized search aliases and sampled script support. */
export interface InstalledFont {
  family: string;
  label: string;
  aliases: string[];
  scripts: boolean[] | null;
  decorative: boolean | null;
}
/** Browser-local font descriptor; the application never receives a filesystem path. */
export interface LocalFontFace {
  family: string;
  style: string;
  /**
   * Obtain a browser-owned SFNT wrapper for metadata slicing.
   *
   * The returned blob is used only in memory for name/cmap tables. Outline bytes
   * are never exported, persisted or included in a document or application build.
   * @async
   * @returns {Promise<Blob>} Local font container accessible to this renderer.
   * @throws {DOMException} If local font access is unavailable or revoked.
   * @example
   * const container = await face.blob();
   */
  blob(): Promise<Blob>;
}
/** Feature-detected local-font capability, kept separate from file access or application IPC. */
export interface LocalFontWindow {
  /**
   * Enumerate installed faces through the browser's local-font permission.
   *
   * Unsupported browsers omit this capability, and denial must preserve existing
   * document font names without claiming that a fallback list was enumerated.
   * @async
   * @returns {Promise<LocalFontFace[]>} Browser-owned metadata descriptors.
   * @throws {DOMException} If the local-font request is denied or unavailable.
   * @example
   * const faces = await window.queryLocalFonts();
   */
  queryLocalFonts?: () => Promise<LocalFontFace[]>;
}
/** Korean native ordering keeps localized Hangul families before Latin family names. */
const FONT_COLLATOR = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});
/** Regular faces represent each family while bold/italic selection remains ordinary character formatting. */
const REGULAR_FACE = /^(?:regular|normal|roman|book|보통)$/i;

/**
 * Enumerate local family choices and read bounded localized metadata.
 *
 * The request is shared across all font controls in the current application
 * window. Four concurrent metadata readers avoid retaining full CJK font files.
 * A malformed or unreadable name table keeps the browser's canonical family
 * with unknown script support instead of hiding an installed font.
 * @async
 * @param {LocalFontWindow} capability - Feature-detected browser capability.
 * @returns {Promise<InstalledFont[]>} Deduplicated localized family choices.
 * @throws {DOMException} If enumeration is denied before any family list is returned.
 * @example
 * const fonts = await enumerateInstalledFonts(window);
 */
export async function enumerateInstalledFonts(
  capability: LocalFontWindow,
): Promise<InstalledFont[]> {
  if (!capability.queryLocalFonts) return [];
  /** The native browser returns face descriptors, not arbitrary renderer-supplied file paths. */
  const faces = await capability.queryLocalFonts();
  /** One representative descriptor per canonical family avoids duplicate weight/style menu rows. */
  const families = new Map<string, LocalFontFace>();
  for (/** Browser-owned font face inspected before accepting its family name. */
  const face of faces) {
    if (
      typeof face.family !== "string" ||
      !face.family.trim() ||
      /[\u0000-\u001f]/.test(face.family)
    )
      continue;
    /** Case-insensitive canonical identity retains the original display and CSS spelling. */
    const key = face.family.normalize("NFC").toLowerCase();
    if (!families.has(key) || REGULAR_FACE.test(face.style || ""))
      families.set(key, face);
  }
  /** Stable descriptor order lets asynchronous metadata work complete without changing sorting. */
  const descriptors = [...families.values()];
  /** Result slots avoid race-dependent insertion order. */
  const result: InstalledFont[] = Array(descriptors.length);
  let next = 0;
  /**
   * Read pending font names and cmap tables through one bounded worker.
   *
   * Each blob is discarded after its metadata is decoded. Individual unreadable
   * fonts keep canonical names and remain available as unclassified choices.
   * @async
   * @returns {Promise<void>} Resolves when this worker has no remaining descriptors.
   * @example
   * await worker(); // One of four shared metadata readers.
   */
  async function worker(): Promise<void> {
    while (next < descriptors.length) {
      /** Unique pending descriptor reserved synchronously before awaiting font data. */
      const index = next++,
        face = descriptors[index];
      /** Canonical local choice remains valid even if optional localized metadata fails. */
      const item: InstalledFont = {
        family: face.family,
        label: face.family,
        aliases: [face.family],
        scripts: null,
        decorative: null,
      };
      try {
        /** Browser-owned font wrapper is never copied into document or application assets. */
        const blob = await face.blob();
        /** Parsed name/cmap metadata contains no glyph outlines or file bytes. */
        const metadata = await readLocalFontMetadata(
          {
            size: blob.size,
            /**
             * Read only the requested local SFNT metadata slice.
             *
             * Blob slicing keeps large outline tables out of application memory.
             * @async
             * @param {number} offset - Selected font metadata offset.
             * @param {number} length - Requested table byte count.
             * @returns {Promise<Uint8Array>} Exact selected font metadata bytes.
             * @throws {DOMException} If local access is revoked or the slice cannot be read.
             * @example
             * // The cmap table can be read without reading glyf outlines.
             */
            async read(offset: number, length: number): Promise<Uint8Array> {
              return new Uint8Array(
                await blob.slice(offset, offset + length).arrayBuffer(),
              );
            },
          },
          face.family,
        );
        Object.assign(item, metadata);
      } catch {
        item.scripts = null;
      }
      result[index] = item;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  result.sort(
    /**
     * Sort localized native labels without altering canonical document font names.
     *
     * Canonical names break equal-label ties so independent families never merge.
     * @param {InstalledFont} first - First local family.
     * @param {InstalledFont} second - Second local family.
     * @returns {number} Native Korean label order with a deterministic family tie-breaker.
     * @example
     * // 굴림 appears before 함초롬바탕; distinct equal labels remain separate choices.
     */
    (first, second) =>
      FONT_COLLATOR.compare(first.label, second.label) ||
      FONT_COLLATOR.compare(first.family, second.family),
  );
  return result;
}

/**
 * Match a literal font family or localized alias for selection and typeahead.
 *
 * Canonical identifiers are never replaced by labels in document marks. Matching
 * ignores Unicode normalization/case differences but keeps punctuation literal.
 * @param {InstalledFont} font - One installed family choice.
 * @param {string} query - Typed or imported family name.
 * @param {boolean} [prefix=false] - Whether a typeahead prefix is accepted.
 * @returns {boolean} Whether this family matches a canonical name or actual alias.
 * @example
 * matchesInstalledFont(font, '함초롬'); // Exact matching only unless prefix is true.
 */
export function matchesInstalledFont(
  font: InstalledFont,
  query: string,
  prefix = false,
): boolean {
  /** Only comparison keys are normalized; stored source font values remain untouched. */
  const key = query.trim().normalize("NFC").toLowerCase();
  if (!key) return false;
  for (/** Native and canonical family names are equivalent searchable aliases. */
  const alias of [font.family, font.label, ...font.aliases]) {
    /** Literal normalized alias used for equality or completion. */
    const text = alias.normalize("NFC").toLowerCase();
    if (prefix ? text.startsWith(key) : text === key) return true;
  }
  return false;
}
