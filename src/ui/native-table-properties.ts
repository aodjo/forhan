import {
  nativeTableProperties,
  nativeTableFlags,
} from "../table-properties.ts";

/**
 * Restore independent native table properties from serialized HTML metadata.
 *
 * Absent metadata remains distinct from a table explicitly using defaults.
 * @param {HTMLElement} element - Actual imported source table.
 * @returns {import('../table-properties.ts').NativeTableProperties|null} Original validated properties or no native metadata.
 * @throws {SyntaxError|TypeError|RangeError} If explicit metadata is malformed.
 * @example
 * readNativeTableProperties(table);
 */
export function readNativeTableProperties(element: HTMLElement) {
  /** Actual metadata is decoded without borrowing unrelated computed CSS values. */
  const data = element.getAttribute("data-forhan-table-properties");
  return data === null ? null : nativeTableProperties(JSON.parse(data));
}

/**
 * Render exact native spacing and standard table fragmentation hints.
 *
 * Table and row page-break policies remain independent. These CSS hints do not
 * claim complete native table pagination or automatic title-row construction.
 * @param {Record<string,unknown>} attrs - Actual original table attributes.
 * @returns {Record<string,string>} Exact source metadata and independent physical CSS.
 * @throws {TypeError|RangeError} If explicitly represented properties are invalid.
 * @example
 * renderNativeTableProperties({nativeTableProperties:{pageBreak:0,repeatHeader:false,cellSpacing:37}});
 */
export function renderNativeTableProperties(
  attrs: Record<string, unknown>,
): Record<string, string> {
  if (
    attrs.nativeTableProperties === undefined ||
    attrs.nativeTableProperties === null
  )
    return {};
  /** The exact source record does not depend on browser subpixel CSS serialization. */
  const value = nativeTableProperties(attrs.nativeTableProperties);
  return {
    "data-forhan-table-properties": JSON.stringify(value),
    style: `border-collapse:${value.cellSpacing ? "separate" : "collapse"};border-spacing:${value.cellSpacing / 75}px;break-inside:${value.pageBreak === 0 ? "avoid" : "auto"};--forhan-table-row-break:${value.pageBreak === 1 ? "avoid" : "auto"}`,
  };
}

/**
 * Restore opaque original HWP table flags from HTML metadata.
 *
 * Unknown bits stay data while known page properties remain independently
 * represented and replace only their own source bits during an HWP save.
 * @param {HTMLElement} element - Actual imported source table.
 * @returns {number|null} Original unsigned flags or no binary source metadata.
 * @throws {RangeError} If explicit source metadata is malformed.
 * @example
 * readNativeTableFlags(table); // 6 for the original default native flag word.
 */
export function readNativeTableFlags(element: HTMLElement): number | null {
  /** Missing source flags cannot become invented reserved metadata. */
  const value = element.getAttribute("data-forhan-table-flags");
  if (value === null) return null;
  if (!/^\d+$/u.test(value))
    throw new RangeError("표의 원본 플래그 정보가 올바르지 않습니다.");
  return nativeTableFlags(Number(value));
}

/**
 * Retain original native table flags without rendering them as authored text.
 *
 * Attribute serialization escapes the validated numeric metadata.
 * @param {Record<string,unknown>} attrs - Actual original table attributes.
 * @returns {Record<string,string>} Validated opaque native flag metadata.
 * @throws {RangeError} If explicitly supplied source flags are invalid.
 * @example
 * renderNativeTableFlags({nativeTableFlags:6});
 */
export function renderNativeTableFlags(
  attrs: Record<string, unknown>,
): Record<string, string> {
  return attrs.nativeTableFlags === undefined || attrs.nativeTableFlags === null
    ? {}
    : {
        "data-forhan-table-flags": String(
          nativeTableFlags(attrs.nativeTableFlags),
        ),
      };
}
