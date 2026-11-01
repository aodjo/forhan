/** Section grid distances retain native hundredths of a point instead of rounded dialog labels. */
export interface SectionGridSettings {
  lineGrid?: number;
  charGrid?: number;
  wonggojiFormat?: boolean;
}
/** Native HWP section distances use the positive domain of a signed sixteen-bit field. */
export const MAX_HWP_GRID = 32767;
/** Native XML grid distances cannot exceed the signed native automation integer domain. */
const MAX_XML_GRID = 2147483647;

/**
 * Validate an original section-grid distance without converting absence into an edit.
 *
 * Native section units are one hundredth of a point. Zero disables an axis.
 * Explicit malformed values are rejected before a writer can truncate them.
 * @param {unknown} value - Original native-unit distance or absent source.
 * @returns {number} Nonnegative exact native-unit distance, with zero for absence.
 * @throws {RangeError} If explicit source is not a representable native integer.
 * @example
 * sectionGridDistance(1600); // 16pt, retained as 1600 native units.
 */
export function sectionGridDistance(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && !/^\d+$/.test(value.trim())))
    throw new RangeError("용지 격자 간격은 올바른 원본 정수여야 합니다.");
  /** Native integers remain independent from rounded point-valued form labels. */
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0 || result > MAX_XML_GRID)
    throw new RangeError("용지 격자 간격이 저장 범위를 벗어났습니다.");
  return result;
}

/**
 * Retain explicit section-grid axes and manuscript preference in page source.
 *
 * Ordinary pages gain no new optional fields. Existing zero values remain
 * explicit, while native XML Boolean spellings resolve without truthy coercion.
 * @param {SectionGridSettings} source - Original page-level grid settings.
 * @returns {SectionGridSettings} Validated independent native source settings.
 * @throws {RangeError} If a retained distance or manuscript flag is malformed.
 * @example
 * sectionGridSettings({lineGrid:1600,charGrid:0}); // Retains both original axes.
 */
export function sectionGridSettings(source: SectionGridSettings): SectionGridSettings {
  /** Only supplied source fields enter the canonical page object. */
  const result: SectionGridSettings = {};
  for (/** Each original axis is validated without inventing another axis. */ const key of ["lineGrid", "charGrid"] as const)
    if (source[key] !== undefined) result[key] = sectionGridDistance(source[key]);
  if (source.wonggojiFormat !== undefined) {
    if (typeof source.wonggojiFormat !== "boolean")
      throw new RangeError("원고지 정서법 설정은 참 또는 거짓이어야 합니다.");
    result.wonggojiFormat = source.wonggojiFormat;
  }
  return result;
}

/**
 * Validate a section-grid axis before encoding an actual HWP binary field.
 *
 * Wider native XML source can remain in HWPX/FHN. Binary export rejects its
 * unrepresentable distance instead of wrapping it into a negative interval.
 * @param {unknown} value - Original native-unit section distance.
 * @returns {number} Representable nonnegative signed-sixteen-bit distance.
 * @throws {RangeError} If source exceeds the actual binary storage domain.
 * @example
 * hwpGridDistance(1600); // 1600, encoded independently from paragraph flags.
 */
export function hwpGridDistance(value: unknown): number {
  /** XML validation precedes the narrower independent binary range check. */
  const result = sectionGridDistance(value);
  if (result > MAX_HWP_GRID)
    throw new RangeError("용지 격자 간격을 HWP에 저장할 수 없습니다. HWPX 또는 FHN으로 보관하세요.");
  return result;
}

/**
 * Preserve native section-grid source on a standalone HTML body.
 *
 * Only validated integer axes and a Boolean preference enter attributes.
 * These markers remain distinct from already-applied physical line drawings.
 * @param {SectionGridSettings} page - Validated physical page source.
 * @returns {string} Safe owned body attributes, or an empty string for ordinary pages.
 * @throws {RangeError} If original section metadata is malformed.
 * @example
 * sectionGridHtml({lineGrid:1600}); // Retains the original 16pt interval.
 */
export function sectionGridHtml(page: SectionGridSettings): string {
  /** Each explicitly supplied native field is independently serialized. */
  const grid = sectionGridSettings(page);
  let attributes = "";
  if (grid.lineGrid !== undefined) attributes += ` data-forhan-line-grid="${grid.lineGrid}"`;
  if (grid.charGrid !== undefined) attributes += ` data-forhan-char-grid="${grid.charGrid}"`;
  if (grid.wonggojiFormat !== undefined) attributes += ` data-forhan-wonggoji-format="${grid.wonggojiFormat ? 1 : 0}"`;
  return attributes;
}

/**
 * Read owned standalone HTML section-grid metadata without guessing from CSS.
 *
 * Source axes survive script-free HTML output and subsequent reimport. Ordinary
 * external line-height styles do not invent a native grid or manuscript mode.
 * @param {HTMLElement} body - Original detached HTML body.
 * @returns {SectionGridSettings} Explicit original page-grid source, when present.
 * @throws {RangeError} If an explicit owned marker is malformed.
 * @example
 * readSectionGridHtml(parsed.body); // Restores native units rather than rounded pixels.
 */
export function readSectionGridHtml(body: HTMLElement): SectionGridSettings {
  /** Source metadata belongs to this body rather than an unrelated nested paragraph. */
  const result: SectionGridSettings = {};
  for (/** Each native axis keeps its independent presence and literal integer value. */ const key of ["lineGrid", "charGrid"] as const) {
    /** Attribute names are owned constants, independent from untrusted document strings. */
    const value = body.getAttribute(key === "lineGrid" ? "data-forhan-line-grid" : "data-forhan-char-grid");
    if (value !== null) result[key] = sectionGridDistance(value);
  }
  /** Manuscript behavior remains separately retained even when both axes are disabled. */
  const manuscript = body.getAttribute("data-forhan-wonggoji-format");
  if (manuscript !== null) {
    if (manuscript !== "0" && manuscript !== "1") throw new RangeError("원고지 정서법의 원본 HTML 값을 확인하세요.");
    result.wonggojiFormat = manuscript === "1";
  }
  return result;
}
