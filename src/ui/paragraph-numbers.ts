import { MAX_PERCENT_LINE_SPACING } from "../line-spacing.ts";
import {MIN_PARAGRAPH_SPACE,MAX_PARAGRAPH_SPACE} from '../paragraph-minimum-space.ts';

/** Native point and percentage controls retain independent accessible field names. */
export const PARAGRAPH_NUMBER_LABELS: Readonly<Record<string, string>> = {
  marginLeft: "왼쪽 여백",
  marginRight: "오른쪽 여백",
  textIndent: "첫 줄 길이",
  marginTop: "문단 위",
  marginBottom: "문단 아래",
  line: "줄 간격",
  "minimum-space": "최소 공백",
};

/** Native paragraph point controls use the same distance bound as document application. */
export const MAX_PARAGRAPH_DISTANCE = 283.5;

/** A local rounded control retains its explicit raw draft without changing model source. */
const paragraphNumberDrafts = new WeakMap<
  HTMLInputElement,
  { value: number; display: string }
>();
/** Reentrant local input notifications must not discard the value just set by an arrow. */
const steppingParagraphInputs = new WeakSet<HTMLInputElement>();

/**
 * Format native paragraph points without rounding conversion noise the wrong way.
 *
 * Original CSS millimetres can carry decimal conversion noise around a native
 * hundredth-point amount. Resolve that native amount before rounding display
 * halves away from zero; original model values remain untouched.
 * @param {number} value - Original finite point amount.
 * @returns {string} Native one-decimal point display.
 * @example
 * displayParagraphPoints(18.249999999999996); // '18.3'
 */
export function displayParagraphPoints(value: number): string {
  /** Tiny conversion noise must not turn an original quarter point into the lower tenth. */
  const native = Math.round(Math.abs(value) * 100 + 1e-8) / 100,
    magnitude = Math.round(native * 10 + 1e-8) / 10;
  return (value < 0 ? "-" : "") + magnitude.toFixed(1);
}

/**
 * Read the original local numeric draft behind its native rounded display.
 *
 * Cached precision applies only while the actual input still matches that
 * display. Ordinary input events discard it before a new user edit is read.
 * @param {HTMLInputElement} input - Actual owned paragraph numeric control.
 * @returns {string} Explicit raw local draft or the current literal input text.
 * @example
 * paragraphNumberValue(input); // '1.25' behind an explicitly entered '1.3' display.
 */
export function paragraphNumberValue(input: HTMLInputElement): string {
  /** A stale display cache cannot override an externally changed control value. */
  const draft = paragraphNumberDrafts.get(input);
  return draft && draft.display === input.value
    ? String(draft.value)
    : input.value;
}

/**
 * Set a precise local paragraph draft with its separate native display.
 *
 * Imported source and mode conversions retain full numeric precision behind
 * a one-decimal point label. No input event or document edit is emitted.
 * @param {HTMLInputElement} input - Actual owned paragraph numeric field.
 * @param {number} value - Finite original or explicitly converted numeric amount.
 * @param {boolean} points - Whether the native label represents typographic points.
 * @returns {void} Updates only the local control and its precise draft cache.
 * @example
 * setParagraphNumberDraft(input,18.25,true); // Displays 18.3; mode conversion reads 18.25.
 */
export function setParagraphNumberDraft(
  input: HTMLInputElement,
  value: number,
  points: boolean,
): void {
  input.value = points ? displayParagraphPoints(value) : String(value);
  paragraphNumberDrafts.set(input, { value, display: input.value });
}

/**
 * Step a native paragraph number onto the observed whole-unit control grid.
 *
 * Positive fractional values move to the adjacent integer in the requested
 * direction. The observed imported negative up-step uses truncation toward
 * zero before incrementing. Explicit source bounds constrain only the edit.
 * @param {number} value - Original finite local numeric draft.
 * @param {1|-1} direction - One actual native arrow action.
 * @param {number} minimum - Minimum permitted edited numeric value.
 * @param {number} maximum - Maximum permitted edited numeric value.
 * @returns {number} Native whole-unit step clipped to the actual source bounds.
 * @throws {RangeError} If input or bounds are invalid.
 * @example
 * stepParagraphNumber(1.25,1,0,283.5); // 2, rather than 1.26 or 2.25.
 */
export function stepParagraphNumber(
  value: number,
  direction: 1 | -1,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum > maximum
  )
    throw new RangeError("문단 숫자의 범위를 확인하세요.");
  /** Original arrow observations retain directional fractional behavior. */
  const stepped = direction > 0 ? Math.trunc(value) + 1 : Math.ceil(value) - 1;
  return Math.max(minimum, Math.min(maximum, stepped));
}

/**
 * Synchronize native stepper availability with its original numeric control.
 *
 * First-line mode changes affect both its input and its two arrow buttons.
 * Read-only unsupported controls remain inert rather than accepting lost edits.
 * @param {HTMLFormElement} form - Actual owning native paragraph draft form.
 * @returns {void} Updates only the form's local numeric arrow availability.
 * @example
 * refreshParagraphNumbers(form); // Normal indentation disables both arrows.
 */
export function refreshParagraphNumbers(form: HTMLFormElement): void {
  for (/** Only this owned native paragraph's numeric wrappers are inspected. */ const wrapper of form.querySelectorAll<HTMLElement>(
    ".nd-paragraph-number",
  )) {
    /** An actual source input owns both arrow availability states. */
    const input = wrapper.querySelector<HTMLInputElement>("input")!;
    for (/** Native arrows are never separate tab stops or edits to disabled source. */ const button of wrapper.querySelectorAll<HTMLButtonElement>(
      "[data-paragraph-number-step]",
    ))
      button.disabled = input.disabled || input.readOnly;
  }
}

/**
 * Handle one actual paragraph arrow click or numeric keyboard arrow.
 *
 * Direct decimal entry stays independent from the native one-unit step grid.
 * Invalid, read-only and disabled drafts cannot silently become zero. An input
 * event captures the new local draft without editing the document or history.
 * @param {HTMLFormElement} form - Actual owned native paragraph form.
 * @param {Event} [event] - Original click or keyboard event, when present.
 * @returns {boolean} Whether a native numeric arrow action was handled.
 * @throws {RangeError} If the owning fixed-spacing form lacks valid page bounds.
 * @example
 * handleParagraphNumberEvent(form,event); // ArrowUp changes 160 percent to 161.
 */
export function handleParagraphNumberEvent(
  form: HTMLFormElement,
  event?: Event,
): boolean {
  /** Pointer targets may be an SVG path inside the actual accessible arrow button. */
  const target = event?.target;
  if (
    target instanceof HTMLInputElement &&
    target.closest(".nd-paragraph-number") &&
    form.contains(target)
  ) {
    if (event?.type === "input" && !steppingParagraphInputs.has(target))
      paragraphNumberDrafts.delete(target);
    if (
      event?.type === "change" &&
      !target.disabled &&
      !target.readOnly &&
      Number.isFinite(target.valueAsNumber)
    ) {
      /** Blur formats native points while retaining the exact explicitly entered amount. */
      const value = Number(paragraphNumberValue(target)),
        points =
          target.closest(".nd-number")?.querySelector(":scope > span")
            ?.textContent === "pt";
      if (points) {
        target.value = displayParagraphPoints(value);
        paragraphNumberDrafts.set(target, { value, display: target.value });
      }
    }
  }
  let input: HTMLInputElement | null = null,
    direction: 1 | -1 = 1;
  if (event?.type === "click" && target instanceof Element) {
    /** Only native paragraph arrow controls request a local numeric step. */
    const button = target.closest<HTMLButtonElement>(
      "[data-paragraph-number-step]",
    );
    if (!button || !form.contains(button) || button.disabled) return false;
    input =
      button
        .closest(".nd-paragraph-number")
        ?.querySelector<HTMLInputElement>("input") ?? null;
    direction = button.dataset.paragraphNumberStep === "-1" ? -1 : 1;
  } else if (
    event instanceof KeyboardEvent &&
    target instanceof HTMLInputElement &&
    target.closest(".nd-paragraph-number") &&
    form.contains(target) &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === "ArrowUp" || event.key === "ArrowDown")
  ) {
    input = target;
    direction = event.key === "ArrowDown" ? -1 : 1;
  }
  if (!input || input.disabled || input.readOnly) return false;
  event!.preventDefault();
  if (!Number.isFinite(input.valueAsNumber)) {
    input.reportValidity();
    return true;
  }
  /** Physical point bounds and native percentage bounds remain independent. */
  const minimum =
      input.name==='minimum-space'?MIN_PARAGRAPH_SPACE:input.name === "marginLeft" || input.name === "marginRight"
        ? -MAX_PARAGRAPH_DISTANCE
        : 0,
    fixed =
      form.querySelector<HTMLSelectElement>('[name="lineMode"]')?.value ===
      "FIXED",
    maximum =
      input.name==='minimum-space'?MAX_PARAGRAPH_SPACE:input.name === "line"
        ? fixed
          ? Number(form.dataset.fixedLineMaximum)
          : MAX_PERCENT_LINE_SPACING
        : MAX_PARAGRAPH_DISTANCE;
  /** Updating a local form field cannot commit document formatting before Apply. */
  const value = stepParagraphNumber(
    Number(paragraphNumberValue(input)),
    direction,
    minimum,
    maximum,
  );
  if (value === Number(paragraphNumberValue(input))) {
    input.focus();
    input.select();
    return true;
  }
  setParagraphNumberDraft(
    input,
    value,
    input.closest(".nd-number")?.querySelector(":scope > span")?.textContent ===
      "pt",
  );
  input.focus();
  input.select();
  steppingParagraphInputs.add(input);
  try {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } finally {
    steppingParagraphInputs.delete(input);
  }
  return true;
}
