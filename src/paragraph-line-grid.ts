/** Native HWP paragraph flags store the independent page-grid preference in bit eight. */
export const PARAGRAPH_GRID_FLAG = 0x100;

/**
 * Resolve the original paragraph's independent line-grid preference.
 *
 * New paragraphs use the observed checked native default. Explicit false and
 * zero remain distinct from absence, including native XML Boolean spellings.
 * Unknown values cannot silently become another paragraph's valid-looking flag.
 * @param {Record<string,unknown>} attrs - Original paragraph or heading attributes.
 * @returns {boolean} Whether this paragraph participates in its section's line grid.
 * @throws {RangeError} If an explicit retained source value is not a Boolean.
 * @example
 * paragraphSnapToGrid({nativeSnapToGrid:false}); // false, independently of line spacing.
 */
export function paragraphSnapToGrid(attrs: Record<string, unknown>): boolean {
  /** An absent value retains the native default without replacing explicit false. */
  const value = attrs.nativeSnapToGrid;
  if (value === null || value === undefined) return true;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new RangeError("문단의 줄 격자 사용 값은 참 또는 거짓이어야 합니다.");
}

/**
 * Read explicitly authored native paragraph-grid metadata from source HTML.
 *
 * Ordinary CSS line height does not encode a section-grid participation flag.
 * Missing metadata stays unspecified until the native default is resolved.
 * @param {HTMLElement} element - Original imported paragraph or heading.
 * @returns {boolean|null} Explicit retained preference, or null when no marker exists.
 * @throws {RangeError} If an explicit native marker is malformed.
 * @example
 * readParagraphGrid(element); // false for data-forhan-snap-to-grid="0".
 */
export function readParagraphGrid(element: HTMLElement): boolean | null {
  /** Only this paragraph's own semantic source marker supplies its preference. */
  const value = element.getAttribute("data-forhan-snap-to-grid");
  return value === null ? null : paragraphSnapToGrid({ nativeSnapToGrid: value });
}

/**
 * Preserve a paragraph's source-grid preference independently from physical drawings.
 *
 * Absent native source introduces no new marker into ordinary external HTML.
 * Actual section grid metrics are resolved separately from paragraph line height.
 * @param {Record<string,unknown>} attrs - Original paragraph or heading attributes.
 * @returns {Record<string,string>} Explicit native grid-participation marker when present.
 * @throws {RangeError} If an explicit source value is malformed.
 * @example
 * renderParagraphGrid({nativeSnapToGrid:false}); // Preserves zero without modifying CSS intervals.
 */
export function renderParagraphGrid(attrs: Record<string, unknown>): Record<string, string> {
  return attrs.nativeSnapToGrid === null || attrs.nativeSnapToGrid === undefined
    ? {}
    : { "data-forhan-snap-to-grid": paragraphSnapToGrid(attrs) ? "1" : "0" };
}
