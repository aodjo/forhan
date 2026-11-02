/** Native table distances use seventy-five HWP units per unzoomed CSS pixel. */
export const CELL_UNITS_PER_PIXEL = 75;
/** Native cell dimensions share the signed physical range used by cell margins. */
const MAX_CELL_DIMENSION = 0x7fffffff;
/** HWP tables already admit at most fifty thousand logical cells in the reader. */
const MAX_NATIVE_COLUMNS = 50000;

/** One actual cell constrains a contiguous range of logical column widths. */
export interface NativeColumnMeasurement {
  column: number;
  span: number;
  width: number;
}

/**
 * Validate a stored native cell dimension without rounding or replacing zero.
 *
 * An absent height remains automatic; an explicit zero remains a real source
 * value. Positive source values retain their exact integer HWP units.
 * @param {unknown} value - Original native physical cell dimension.
 * @returns {number|null} Exact source value or no explicit dimension.
 * @throws {RangeError} If an explicit dimension is invalid or outside native bounds.
 * @example
 * nativeCellDimension(282); // 282
 */
export function nativeCellDimension(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_CELL_DIMENSION
  )
    throw new RangeError("셀 크기의 원본 단위가 올바르지 않습니다.");
  return value;
}

/**
 * Resolve original column measurements without rounding them to screen pixels.
 *
 * Unmerged cells establish exact widths first. Merged cells constrain only
 * unresolved columns, distributing integral residuals without losing a unit.
 * Internal boundaries absent from all original records are inferred evenly.
 * @param {number} count - Actual logical column count.
 * @param {NativeColumnMeasurement[]} measurements - Original source cell constraints.
 * @param {number} [fallbackWidth=0] - Original table width when cells omit measurements.
 * @returns {number[]} Per-column native distances independent from CSS-pixel rounding.
 * @throws {RangeError} If the logical column count exceeds the supported bound.
 * @example
 * nativeColumnMeasurements(3,[{column:0,span:3,width:10001}]); // [3334,3334,3333]
 */
export function nativeColumnMeasurements(
  count: number,
  measurements: NativeColumnMeasurement[],
  fallbackWidth = 0,
): number[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_NATIVE_COLUMNS)
    throw new RangeError("표의 열 개수가 올바르지 않습니다.");
  /** Original native widths remain independent from any editor display representation. */
  const widths = new Array<number>(count).fill(0);
  for (/** Direct original cells provide independently measured logical column widths. */ const cell of measurements)
    if (
      cell.span === 1 &&
      Number.isInteger(cell.column) &&
      cell.column >= 0 &&
      cell.column < count &&
      cell.width > 0
    )
      widths[cell.column] = cell.width;
  for (/** Narrower original constraints establish boundaries before larger unresolved spans. */ const cell of measurements.toSorted(
    compareNativeSpans,
  )) {
    if (
      !Number.isInteger(cell.column) ||
      !Number.isInteger(cell.span) ||
      cell.column < 0 ||
      cell.span < 1 ||
      cell.column + cell.span > count ||
      !(cell.width > 0)
    )
      continue;
    /** Only unresolved source boundaries receive an inferred residual distance. */
    const end = cell.column + cell.span;
    let known = 0,
      missing = 0;
    for (let column = cell.column; column < end; column++) {
      if (widths[column] > 0) known += widths[column];
      else missing++;
    }
    if (!missing) continue;
    /** An integral residual is divided exactly; physically sub-unit inferred boundaries remain fractional. */
    const remaining =
        cell.width > known
          ? cell.width - known
          : (cell.width / cell.span) * missing,
      whole = Number.isInteger(remaining) && remaining >= missing,
      base = whole ? Math.floor(remaining / missing) : remaining / missing;
    let remainder = whole ? remaining - base * missing : 0;
    for (let column = cell.column; column < end; column++)
      if (!widths[column]) {
        widths[column] = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
      }
  }
  /** Missing measurements use a deterministic table-width allocation, not repeated rounded totals. */
  const fallback = fallbackWidth > 0 ? fallbackWidth / count : 0;
  for (let column = 0; column < count; column++)
    if (!widths[column]) widths[column] = fallback;
  return widths;
}

/**
 * Order independent original constraints by their logical span.
 *
 * Shorter spans supply more precise unresolved boundaries without mutating the
 * original source order or measurements.
 * @param {NativeColumnMeasurement} left - First actual original cell constraint.
 * @param {NativeColumnMeasurement} right - Second actual original cell constraint.
 * @returns {number} Standard ascending span comparison.
 * @example
 * compareNativeSpans({column:0,span:1,width:2},{column:0,span:2,width:3}); // -1
 */
function compareNativeSpans(
  left: NativeColumnMeasurement,
  right: NativeColumnMeasurement,
): number {
  return left.span - right.span;
}

/**
 * Restore exact native cell height from serialized HTML metadata.
 *
 * Explicit native metadata takes precedence over display CSS. Ordinary HTML
 * heights are converted from their authored physical unit only when present.
 * @param {HTMLElement} element - Actual imported table cell.
 * @returns {number|null} Original integer HWP height or automatic sizing.
 * @throws {RangeError} If explicit native height metadata is malformed.
 * @example
 * readNativeCellHeight(cell); // 282 for retained native metadata.
 */
export function readNativeCellHeight(element: HTMLElement): number | null {
  /** Exact metadata does not depend on browser CSS serialization precision. */
  const retained = element.getAttribute("data-forhan-cell-height");
  if (retained !== null) {
    if (!/^\d+$/u.test(retained))
      throw new RangeError("셀 높이의 원본 정보가 올바르지 않습니다.");
    return nativeCellDimension(Number(retained));
  }
  /** Absent ordinary HTML height must not create an invented explicit native height. */
  const value = element.style.height || element.getAttribute("height") || "",
    match = /^\s*(\d+(?:\.\d+)?)\s*(px|mm|cm|pt|in)?\s*$/iu.exec(value);
  if (!match) return null;
  /** Authored HTML lengths retain their own independent physical unit. */
  const factors: Record<string, number> = {
    px: CELL_UNITS_PER_PIXEL,
    mm: 7200 / 25.4,
    cm: 72000 / 25.4,
    pt: 100,
    in: 7200,
  };
  return nativeCellDimension(
    Math.round(Number(match[1]) * factors[(match[2] || "px").toLowerCase()]),
  );
}

/**
 * Render a native cell's minimum source height without clipping authored text.
 *
 * Standard table-cell height grows naturally with content. Exact metadata
 * avoids converting a later HTML save from rounded display CSS.
 * @param {Record<string,unknown>} attrs - Actual original cell attributes.
 * @returns {Record<string,string>} Exact native metadata and physical CSS height.
 * @throws {RangeError} If an explicit source height is malformed.
 * @example
 * renderNativeCellHeight({nativeCellHeight:282}); // Retains a 3.76px minimum source height.
 */
export function renderNativeCellHeight(
  attrs: Record<string, unknown>,
): Record<string, string> {
  /** Automatic height remains distinct from an explicit original zero. */
  const value = nativeCellDimension(attrs.nativeCellHeight);
  return value === null
    ? {}
    : {
        "data-forhan-cell-height": String(value),
        style: `height:${value / CELL_UNITS_PER_PIXEL}px`,
      };
}
