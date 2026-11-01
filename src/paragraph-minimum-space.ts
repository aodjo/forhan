/** Lowest editable native minimum-space percentage documented by Hancom. */
export const MIN_PARAGRAPH_SPACE = 25;
/** Uncondensed word spaces retain their entire original native advance. */
export const MAX_PARAGRAPH_SPACE = 100;
/** Native HWP paragraph flags retain seven original condensation bits. */
export const MAX_STORED_PARAGRAPH_CONDENSE = 127;

/**
 * Read the original paragraph's native space-reduction percentage.
 *
 * HWP stores reduction, while the dialog displays the remaining width. Missing
 * source means no reduction. Reserved binary values remain available for
 * lossless HWP/FHN retention instead of being silently clamped to editable UI.
 * @param {Record<string,unknown>} attrs - Original paragraph or heading attributes.
 * @returns {number} Original seven-bit reduction percentage, including reserved values.
 * @throws {RangeError} If supplied source is not an exact representable integer.
 * @example
 * paragraphCondense({nativeParagraphCondense:50}); // 50 means a 50% minimum space.
 */
export function paragraphCondense(attrs: Record<string, unknown>): number {
  /** Absent native source uses the original uncondensed paragraph default. */
  const source = attrs.nativeParagraphCondense;
  if (source === undefined || source === null) return 0;
  if (
    (typeof source !== "number" && typeof source !== "string") ||
    (typeof source === "string" && !/^\d+$/.test(source.trim()))
  )
    throw new RangeError("문단 최소 공백의 원본 값을 확인하세요.");
  /** Only the actual native integer domain may enter binary paragraph flags. */
  const value = Number(source);
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_STORED_PARAGRAPH_CONDENSE
  )
    throw new RangeError("문단 최소 공백의 원본 값은 0~127의 정수여야 합니다.");
  return value;
}

/**
 * Convert an explicit native minimum-space draft into stored reduction.
 *
 * New edits use Hancom's documented 25–100% remaining-width domain. Fractional,
 * empty and nonnumeric drafts cannot silently become another paragraph value.
 * @param {unknown} source - Explicit remaining-width percentage from the owned form.
 * @returns {number} Native editable reduction between zero and seventy-five.
 * @throws {RangeError} If the draft is empty, fractional or outside editable bounds.
 * @example
 * parseParagraphMinimumSpace('75'); // 25, stored independently from its displayed 75%.
 */
export function parseParagraphMinimumSpace(source: unknown): number {
  if (
    (typeof source !== "number" && typeof source !== "string") ||
    (typeof source === "string" && !/^\d+$/.test(source.trim()))
  )
    throw new RangeError("최소 공백은 25~100%의 정수로 입력하세요.");
  /** Displayed remaining width and native stored reduction sum to one hundred. */
  const value = Number(source);
  if (
    !Number.isInteger(value) ||
    value < MIN_PARAGRAPH_SPACE ||
    value > MAX_PARAGRAPH_SPACE
  )
    throw new RangeError("최소 공백은 25~100%의 정수로 입력하세요.");
  return MAX_PARAGRAPH_SPACE - value;
}

/**
 * Resolve supported native space condensation without guessing reserved behavior.
 *
 * Native binary values beyond the documented editable range are retained in
 * source, but do not invent an undocumented negative or subminimum glyph gap.
 * @param {number} reduction - Validated original native reduction percentage.
 * @returns {number} Remaining native width fraction, or one for an opaque reserved value.
 * @example
 * paragraphSpaceFraction(75); // 0.25.
 */
export function paragraphSpaceFraction(reduction: number): number {
  return reduction <= MAX_PARAGRAPH_SPACE - MIN_PARAGRAPH_SPACE
    ? 1 - reduction / 100
    : 1;
}

/**
 * Read explicit paragraph condensation metadata from authored native HTML.
 *
 * Fixed CSS word spacing does not encode an adaptive minimum width. Only the
 * owned semantic marker can restore this independent native paragraph option.
 * @param {HTMLElement} element - Original imported paragraph or heading.
 * @returns {number|null} Explicit validated reduction, or null when no marker exists.
 * @throws {RangeError} If an explicit original native marker is malformed.
 * @example
 * readParagraphCondense(element); // 25 for data-forhan-paragraph-condense="25".
 */
export function readParagraphCondense(element: HTMLElement): number | null {
  /** Only this source paragraph's own metadata supplies its native setting. */
  const source = element.getAttribute("data-forhan-paragraph-condense");
  return source === null
    ? null
    : paragraphCondense({ nativeParagraphCondense: source });
}

/**
 * Preserve adaptive minimum spacing as source metadata without globally shrinking gaps.
 *
 * Actual line-sensitive layout is applied separately to original source ranges.
 * An absent native value introduces no marker into ordinary imported HTML.
 * @param {Record<string,unknown>} attrs - Original paragraph or heading attributes.
 * @returns {Record<string,string>} Explicit native semantic marker, when configured.
 * @throws {RangeError} If retained source is outside the original binary domain.
 * @example
 * renderParagraphCondense({nativeParagraphCondense:25}); // Retains the 75% minimum.
 */
export function renderParagraphCondense(
  attrs: Record<string, unknown>,
): Record<string, string> {
  return attrs.nativeParagraphCondense === null ||
    attrs.nativeParagraphCondense === undefined
    ? {}
    : { "data-forhan-paragraph-condense": String(paragraphCondense(attrs)) };
}

/**
 * Encode the documented native condensation domain in HWPX paragraph XML.
 *
 * Reserved binary values stay lossless in HWP/FHN. HWPX export rejects values
 * whose interoperable meaning has not been established instead of replacing
 * the original with an unrelated valid-looking minimum percentage.
 * @param {Record<string,unknown>} attrs - Original paragraph source attributes.
 * @returns {number} Supported native HWPX reduction percentage.
 * @throws {RangeError} If original source is malformed or is a reserved binary value.
 * @example
 * hwpxParagraphCondense({nativeParagraphCondense:75}); // 75, displayed as 25%.
 */
export function hwpxParagraphCondense(attrs: Record<string, unknown>): number {
  /** Export validates the stored reduction independently from its displayed complement. */
  const value = paragraphCondense(attrs);
  if (value > MAX_PARAGRAPH_SPACE - MIN_PARAGRAPH_SPACE)
    throw new RangeError(
      "이 문단의 원본 최소 공백 값은 HWPX에서 지원하지 않습니다. HWP 또는 FHN으로 보관하세요.",
    );
  return value;
}

/**
 * Remove export-only minimum-space correction wrappers before reading source HTML.
 *
 * Paragraph semantic metadata remains intact. Original authored characters and
 * marks survive without importing an already-applied physical correction twice.
 * @param {HTMLElement} root - Detached imported or clipboard HTML body.
 * @returns {void} Unwraps only explicitly owned paragraph-space drawing ranges.
 * @example
 * removeParagraphSpaceDrawings(parsed.body); // Keeps every original Unicode space.
 */
export function removeParagraphSpaceDrawings(root: HTMLElement): void {
  for (/** Only explicitly owned drawing wrappers are removed from detached imported HTML. */ const drawing of root.querySelectorAll(
    "[data-forhan-condense-delta]",
  ))
    drawing.replaceWith(...drawing.childNodes);
}
