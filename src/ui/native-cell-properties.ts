import {
  nativeCellProperties,
  nativeCellMargins,
  type NativeCellProperties,
  type NativeCellMargins,
} from "../cell-properties.ts";

/** Original native distances use seventy-five HWP units per unzoomed CSS pixel. */
const HWP_UNITS_PER_PIXEL = 75;
/** Native top, center and bottom modes have independent browser table-cell alignments. */
const CELL_ALIGNMENTS = ["top", "middle", "bottom"] as const;

/**
 * Restore native cell properties from actual serialized HTML metadata.
 *
 * Physical distances and mode values remain independent of computed CSS and
 * table inheritance; unknown source fields cannot replace the validated model.
 * @param {HTMLElement} element - Actual source cell or title cell being parsed.
 * @returns {NativeCellProperties|null} Independent native source properties or no native metadata.
 * @throws {SyntaxError|TypeError|RangeError} If explicit native metadata is malformed.
 * @example
 * const properties=readNativeCellProperties(cell);
 */
export function readNativeCellProperties(
  element: HTMLElement,
): NativeCellProperties | null {
  /** Absence remains distinct from an actual native cell using its default properties. */
  const source = element.getAttribute("data-forhan-cell-properties");
  return source === null ? null : nativeCellProperties(JSON.parse(source));
}

/**
 * Render native cell modes and exact inherited or explicit physical margins.
 *
 * A native title-cell flag changes repetition ownership without introducing
 * browser header bolding, centering or a replacement background. Character and
 * paragraph source styles retain their own independent visual appearance.
 * @param {Record<string,unknown>} attrs - Actual source cell attributes.
 * @returns {Record<string,string>} Validated HTML metadata and physical cell CSS.
 * @throws {TypeError|RangeError} If explicit native source properties are malformed.
 * @example
 * renderNativeCellProperties({nativeCellProperties:properties});
 */
export function renderNativeCellProperties(
  attrs: Record<string, unknown>,
): Record<string, string> {
  if (
    attrs.nativeCellProperties === null ||
    attrs.nativeCellProperties === undefined
  )
    return {};
  /** Exact source state remains independent from its inherited browser presentation. */
  const properties = nativeCellProperties(attrs.nativeCellProperties),
    styles = [
      "font-weight:normal",
      "text-align:inherit",
      `background-color:${typeof attrs.backgroundColor === "string" && attrs.backgroundColor.trim() ? attrs.backgroundColor : "transparent"}`,
      `vertical-align:${CELL_ALIGNMENTS[properties.verticalAlign]}`,
      `writing-mode:${properties.textDirection ? "vertical-rl" : "horizontal-tb"}`,
      `text-orientation:${properties.textDirection === 2 ? "upright" : "mixed"}`,
      `white-space:${properties.lineWrap ? "pre" : "pre-wrap"}`,
      `--forhan-cell-wrap:${properties.lineWrap ? "pre" : "pre-wrap"}`,
    ];
  for (/** Native table defaults remain inheritable and never become copied source distances. */ const [
    side,
    value,
  ] of Object.entries(properties.margins))
    styles.push(
      `padding-${side}:${properties.hasMargin ? `${value / HWP_UNITS_PER_PIXEL}px` : `var(--forhan-cell-${side},${nativeCellMargins()[side as keyof NativeCellMargins] / HWP_UNITS_PER_PIXEL}px)`}`,
    );
  return {
    "data-forhan-cell-properties": JSON.stringify(properties),
    style: styles.join(";"),
  };
}

/**
 * Restore exact native table-default margins from original HTML metadata.
 *
 * Cell overrides remain separate and continue to inherit through the actual
 * surrounding table when their own hasMargin source flag is false.
 * @param {HTMLElement} element - Actual source table element.
 * @returns {NativeCellMargins|null} Original independent table defaults or no native metadata.
 * @throws {SyntaxError|TypeError|RangeError} If explicit physical source metadata is malformed.
 * @example
 * const defaults=readNativeCellMargins(table);
 */
export function readNativeCellMargins(
  element: HTMLElement,
): NativeCellMargins | null {
  /** Metadata absence retains ordinary external HTML table behavior. */
  const source = element.getAttribute("data-forhan-cell-margins");
  return source === null ? null : nativeCellMargins(JSON.parse(source));
}

/**
 * Render exact original table defaults as inherited native physical cell variables.
 *
 * A nested table supplies its own defaults rather than borrowing its outer
 * table's margins. Explicit zero values remain visible in metadata and CSS.
 * @param {Record<string,unknown>} attrs - Actual source table attributes.
 * @returns {Record<string,string>} Original physical default metadata and inherited CSS variables.
 * @throws {TypeError|RangeError} If retained source margins are malformed.
 * @example
 * renderNativeCellMargins({nativeCellMargins:{left:600,right:700,top:800,bottom:900}});
 */
export function renderNativeCellMargins(
  attrs: Record<string, unknown>,
): Record<string, string> {
  /** Every physical side is validated before becoming a CSS custom property. */
  const margins = nativeCellMargins(attrs.nativeCellMargins),
    styles = [];
  for (/** Independent native defaults cross only the current table's inheritance boundary. */ const [
    side,
    value,
  ] of Object.entries(margins))
    styles.push(`--forhan-cell-${side}:${value / HWP_UNITS_PER_PIXEL}px`);
  return {
    ...(attrs.nativeCellMargins === null ||
    attrs.nativeCellMargins === undefined
      ? {}
      : { "data-forhan-cell-margins": JSON.stringify(margins) }),
    style: styles.join(";"),
  };
}

/**
 * Restore an original unsigned native cell-list flag word from retained HTML.
 *
 * Explicit zero remains present while absent metadata remains null. Unknown
 * native bits are retained for an eventual HWP save without CSS interpretation.
 * @param {HTMLElement} element - Actual native source cell element.
 * @returns {number|null} Original unsigned source flags or no retained flag word.
 * @throws {RangeError} If explicit native source flags are malformed.
 * @example
 * readNativeCellFlags(cell); // Zero remains zero rather than null.
 */
export function readNativeCellFlags(element: HTMLElement): number | null {
  /** Original raw flags are never interpreted as JavaScript source or generic style text. */
  const source = element.getAttribute("data-forhan-cell-flags");
  if (source === null) return null;
  if (!/^\d+$/u.test(source) || Number(source) > 0xffffffff)
    throw new RangeError("셀 속성의 원본 플래그가 올바르지 않습니다.");
  return Number(source);
}

/**
 * Retain unrelated original HWP cell-list bits in actual serialized HTML.
 *
 * The neutral known properties remain authoritative for their own flag bits
 * when the eventual HWP writer regenerates the source record.
 * @param {Record<string,unknown>} attrs - Actual original source cell attributes.
 * @returns {Record<string,string>} Literal original flag metadata or no retained flag word.
 * @throws {RangeError} If explicit original native flags are malformed.
 * @example
 * renderNativeCellFlags({nativeCellFlags:0}); // Retains the string zero.
 */
export function renderNativeCellFlags(
  attrs: Record<string, unknown>,
): Record<string, string> {
  /** No source-less cell acquires a manufactured original flag word. */
  const value = attrs.nativeCellFlags;
  if (value === undefined || value === null) return {};
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  )
    throw new RangeError("셀 속성의 원본 플래그가 올바르지 않습니다.");
  return { "data-forhan-cell-flags": String(value) };
}
