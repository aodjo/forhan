import { fixedLineHeightPoints } from "./formatting.ts";
import type { PageSettings } from "./types.ts";

/** Native proportional presets observed in the installed line-spacing popup. */
export const PERCENT_LINE_PRESETS = [100, 130, 160, 180, 200, 300] as const;
/** Native point presets observed when the same popup edits fixed spacing. */
export const FIXED_LINE_PRESETS = [
  3, 6, 10, 13, 16, 18, 20, 30, 40, 50,
] as const;
/** Largest proportional value accepted by the observed native quick control. */
export const MAX_PERCENT_LINE_SPACING = 500;
/** Modes whose numeric quick entry is established independently of retained source syntax. */
export type LineSpacingMode = "percent" | "fixed" | "retained";
/** Visible numeric state retains exact original units and sub-display precision until edited. */
export interface LineSpacingState {
  source: string;
  mode: LineSpacingMode;
  value: number | null;
  display: string;
  unit: string;
  maximum: number;
}

/**
 * Resolve the physical line-height bound from actual native page-body geometry.
 *
 * Each native page component is rounded separately before subtraction. The
 * observed blank native page has a 657.62pt body, accepts that exact fixed
 * value and rejects 657.63pt. This geometry-based bound is an inference from
 * that observation; native live-page-change refresh remains separately unproven.
 * @param {PageSettings} page - Validated current page dimensions in millimetres.
 * @returns {number} Available body height in points with hundredth-point precision.
 * @example
 * fixedLineSpacingMaximum(page); // Taller content areas allow larger physical values.
 */
export function fixedLineSpacingMaximum(page: PageSettings): number {
  /** Every page component has an independent integral HWPUNIT representation. */
  const body =
    Math.round((page.height * 7200) / 25.4) -
    Math.round((page.marginTop * 7200) / 25.4) -
    Math.round((page.marginBottom * 7200) / 25.4) -
    Math.round(((page.header ?? 0) * 7200) / 25.4) -
    Math.round(((page.footer ?? 0) * 7200) / 25.4);
  return Math.max(0, body / 100);
}

/**
 * Describe a paragraph's original line spacing for the native quick field.
 *
 * Percent multipliers display integer percentages and physical lengths display
 * one decimal point. The original source remains authoritative for untouched
 * fields, including zero, finer physical precision and unknown relative modes.
 * @param {string} source - Original paragraph line-height attribute.
 * @param {number} [fixedMaximum=Infinity] - Current physical page-body bound supplied by the UI.
 * @returns {LineSpacingState} Visible field state with exact retained source.
 * @example
 * lineSpacingState('18.25pt'); // Displays 18.3 while retaining 18.25pt.
 */
export function lineSpacingState(
  source: string,
  fixedMaximum = Infinity,
): LineSpacingState {
  /** Relative multipliers and explicit percentages have the same native numeric field. */
  const relative = source.trim().match(/^(\d+(?:\.\d+)?)\s*(%)?$/);
  if (relative) {
    /** Percentage arithmetic is rounded only to remove binary multiplication noise. */
    const value = Number(
      (Number(relative[1]) * (relative[2] ? 1 : 100)).toFixed(8),
    );
    if (Number.isFinite(value))
      return {
        source,
        mode: "percent",
        value,
        display: String(Math.trunc(value)),
        unit: "%",
        maximum: MAX_PERCENT_LINE_SPACING,
      };
  }
  /** Fixed native distances may be zero and retain their original physical unit. */
  const points = fixedLineHeightPoints(source);
  if (points !== null)
    return {
      source,
      mode: "fixed",
      value: points,
      display: points.toFixed(1),
      unit: "pt",
      maximum: fixedMaximum,
    };
  return {
    source,
    mode: "retained",
    value: null,
    display: source === "normal" ? "자동" : source,
    unit: "",
    maximum: 0,
  };
}

/**
 * Validate and normalize an explicit quick-field edit without rewriting untouched source.
 *
 * Native percentage input discards fractional percent digits. Point input keeps
 * hundredth-point storage precision even though the idle control shows one
 * decimal. Unrecognized imported syntax survives unchanged, but requires an
 * explicit preset or paragraph dialog before numeric editing is possible.
 * @param {string} text - User-entered numeric field contents.
 * @param {LineSpacingState} state - Exact source and current native entry mode.
 * @param {boolean} [edited=true] - Whether the user actually changed the visible draft.
 * @returns {string} Validated paragraph line-height value.
 * @throws {RangeError} If numeric syntax, entry mode or native range is invalid.
 * @example
 * parseLineSpacingInput('175.5',lineSpacingState('1.6')); // '1.75'
 */
export function parseLineSpacingInput(
  text: string,
  state: LineSpacingState,
  edited = true,
): string {
  if (!edited && text === state.display) return state.source;
  if (state.mode === "retained")
    throw new RangeError("이 줄 간격은 목록이나 문단 모양에서 변경하세요.");
  /** Strict decimal entry excludes empty values, executable text and implicit unit changes. */
  const draft = text.trim();
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft))
    throw new RangeError("줄 간격을 숫자로 입력하세요.");
  /** Proportional limits remain independent of the current physical page-body bound. */
  const value = Number(draft);
  if (!Number.isFinite(value) || value < 0 || value > state.maximum)
    throw new RangeError(
      `줄 간격은 0~${state.maximum}${state.unit}로 입력하세요.`,
    );
  /** Percent storage is integral; fixed distance storage retains hundredths of a point. */
  const normalized =
    state.mode === "percent"
      ? Math.trunc(value)
      : Math.round(value * 100) / 100;
  if (normalized === state.value) return state.source;
  return state.mode === "percent"
    ? String(normalized / 100)
    : `${normalized}pt`;
}

/**
 * Move to the native spinner's next proportional or physical value.
 *
 * Percent values move by five. Fixed values move to the next integer point,
 * preserving the distinction between 18.25pt and an idle rounded display of
 * 18.3pt. Imported out-of-range or relative values are never silently clamped.
 * @param {LineSpacingState} state - Parsed current source or validated edited draft.
 * @param {1|-1} direction - Increment or decrement direction.
 * @returns {string} Next native paragraph line-height value.
 * @throws {RangeError} If the source cannot be safely stepped in the quick field.
 * @example
 * stepLineSpacing(lineSpacingState('1.63'),1); // '1.68'
 * stepLineSpacing(lineSpacingState('18.25pt'),-1); // '18pt'
 */
export function stepLineSpacing(
  state: LineSpacingState,
  direction: 1 | -1,
): string {
  if (state.value === null || state.value < 0 || state.value > state.maximum)
    throw new RangeError("줄 간격 값을 먼저 확인하세요.");
  /** Native steps snap fixed distances while retaining ordinary percentage offsets. */
  const next =
    state.mode === "percent"
      ? Math.trunc(state.value) + direction * 5
      : direction > 0
        ? Math.floor(state.value) + 1
        : Math.ceil(state.value) - 1;
  /** Only an explicit spinner action may reach the nearest native entry boundary. */
  const bounded = Math.max(0, Math.min(state.maximum, next));
  return state.mode === "percent" ? String(bounded / 100) : `${bounded}pt`;
}
