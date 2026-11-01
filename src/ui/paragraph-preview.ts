import { paragraphNumberValue } from "./paragraph-numbers.ts";
import { renderParagraphAlignment } from "../paragraph-alignment.ts";
import {
  applyParagraphWordBreaks,
  renderParagraphWordBreaks,
} from "../paragraph-word-break.ts";
import { applyNativeSpaces, measureNativeSpaces } from "../font-space.ts";
import {
  applyNativeParagraph,
  measureNativeParagraph,
} from "../native-line-layout.ts";

/** Measured Windows preview scale converts each dialog point to approximately 0.7875 CSS pixels. */
export const PARAGRAPH_PREVIEW_POINT = 0.7875;
/** A neutral mixed-script sample exposes both native character and word wrapping. */
const PREVIEW_WORD = "가나다라AaBbCc12345";
/** Ordinary spaces followed by joined sample words exercise independent breaking modes. */
const PREVIEW_PARAGRAPH =
  Array(6).fill(PREVIEW_WORD).join(" ") +
  PREVIEW_WORD.repeat(5) +
  "가나다라AaBbCc22";
/** Context paragraphs keep their original settings while the active draft changes. */
const PREVIEW_CONTEXT_REPETITIONS = 14;

/**
 * Read a complete finite numeric draft without rounding the native source.
 *
 * An empty or partially typed number leaves the preceding preview intact.
 * Disabled indentation controls still retain their independent local amount.
 * @param {HTMLFormElement} form - Actual isolated paragraph formatting form.
 * @param {string} name - Exact owned numeric control name.
 * @returns {number|null} Precise local draft, or null while the text is incomplete.
 * @example
 * paragraphPreviewNumber(form,'marginLeft'); // Reads 18.25 behind an 18.3 label.
 */
function paragraphPreviewNumber(
  form: HTMLFormElement,
  name: string,
): number | null {
  /** Only the existing owned numeric field supplies this local preview value. */
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return null;
  /** Whitespace cannot silently become zero during a partially typed edit. */
  const source = paragraphNumberValue(field).trim(),
    value = source ? Number(source) : NaN;
  return Number.isFinite(value) ? value : null;
}

/**
 * Apply native rendering metadata to an isolated sample paragraph.
 *
 * Source helpers supply the same independent alignment and word-breaking rules
 * as actual document paragraphs. Their attributes never enter editor source.
 * @param {HTMLElement} paragraph - Attached preview paragraph owned by the dialog.
 * @param {Record<string,string>} attributes - Validated native rendering metadata.
 * @returns {void} Sets only the sample's own attributes and inline layout style.
 * @example
 * setParagraphPreviewAttributes(sample,renderParagraphAlignment('split'));
 */
function setParagraphPreviewAttributes(
  paragraph: HTMLElement,
  attributes: Record<string, string>,
): void {
  for (/** Each explicit native attribute belongs only to this temporary sample. */ const [
    name,
    value,
  ] of Object.entries(attributes)) {
    if (name === "style") paragraph.style.cssText += ";" + value;
    else paragraph.setAttribute(name, value);
  }
}

/**
 * Render the current paragraph draft without changing the actual document.
 *
 * Two unchanged context paragraphs surround one independently wrapped sample.
 * Native points use the measured preview scale. Shared source-space, alignment,
 * word-breaking and line-layout helpers preserve the actual editing semantics.
 * Incomplete numeric drafts retain the preceding valid preview. Every update
 * replaces only owned sample nodes, so cancellation and undo history stay inert.
 * @param {HTMLFormElement} form - Attached actual native paragraph draft form.
 * @returns {void} Updates the local preview when all required drafts are finite.
 * @throws {RangeError|SyntaxError} If explicit native sample metadata is malformed.
 * @example
 * renderParagraphPreview(form); // A 20pt margin moves the sample approximately sixteen pixels.
 */
export function renderParagraphPreview(form: HTMLFormElement): void {
  /** Missing or detached forms cannot update a closed formatting dialog. */
  const root = form.querySelector<HTMLElement>(".nd-paragraph-preview");
  if (!root || !form.isConnected) return;
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "문단 모양 미리 보기");
  /** Raw local amounts retain source precision rather than their rounded labels. */
  const left = paragraphPreviewNumber(form, "marginLeft"),
    right = paragraphPreviewNumber(form, "marginRight"),
    indent = paragraphPreviewNumber(form, "textIndent"),
    before = paragraphPreviewNumber(form, "marginTop"),
    after = paragraphPreviewNumber(form, "marginBottom"),
    line = paragraphPreviewNumber(form, "line");
  if (
    left === null ||
    right === null ||
    indent === null ||
    before === null ||
    after === null ||
    line === null ||
    line < 0
  )
    return;
  /** Checked radios and selects are read without emitting any document transaction. */
  const alignment = form.querySelector<HTMLInputElement>('[name="align"]:checked')
      ?.value,
    indentation = form.querySelector<HTMLInputElement>(
      '[name="indentMode"]:checked',
    )?.value,
    fixed = form.querySelector<HTMLSelectElement>('[name="lineMode"]')?.value ===
      "FIXED",
    latin = form.querySelector<HTMLSelectElement>('[name="breakLatinWord"]')
      ?.value,
    nonLatin = form.querySelector<HTMLSelectElement>('[name="breakNonLatinWord"]')
      ?.value,
    signed = indentation === "NORMAL"
      ? 0
      : indentation === "HANGING"
        ? -Math.abs(indent)
        : Math.abs(indent),
    document = form.ownerDocument,
    previous = document.createElement("p"),
    active = document.createElement("p"),
    next = document.createElement("p");
  previous.textContent = Array(PREVIEW_CONTEXT_REPETITIONS)
    .fill("이전 문단")
    .join(" ");
  next.textContent = Array(PREVIEW_CONTEXT_REPETITIONS)
    .fill("이후 문단")
    .join(" ");
  active.textContent = PREVIEW_PARAGRAPH;
  active.dataset.paragraphPreviewActive = "true";
  active.style.marginLeft =
    (left + Math.max(0, -signed)) * PARAGRAPH_PREVIEW_POINT + "px";
  active.style.marginRight = right * PARAGRAPH_PREVIEW_POINT + "px";
  active.style.textIndent = signed * PARAGRAPH_PREVIEW_POINT + "px";
  active.style.marginTop = before * PARAGRAPH_PREVIEW_POINT + "px";
  active.style.marginBottom = after * PARAGRAPH_PREVIEW_POINT + "px";
  active.style.lineHeight = fixed
    ? line * PARAGRAPH_PREVIEW_POINT + "px"
    : String(line / 100);
  setParagraphPreviewAttributes(active, renderParagraphAlignment(alignment));
  setParagraphPreviewAttributes(
    active,
    renderParagraphWordBreaks({
      nativeBreakLatinWord: latin === "" || latin === undefined ? 0 : Number(latin),
      nativeBreakNonLatinWord:
        nonLatin === "" || nonLatin === undefined ? 1 : Number(nonLatin),
    }),
  );
  // The observed native dialog does not apply minimum-space condensation to its sample.
  root.replaceChildren(previous, active, next);
  applyParagraphWordBreaks(root);
  applyNativeSpaces(measureNativeSpaces(root));
  for (/** Each sample keeps the same measured native baseline and independent line interval. */ const paragraph of [
    previous,
    active,
    next,
  ]) {
    /** Actual sample wrapping determines its own physical line count. */
    const plan = measureNativeParagraph(paragraph,PARAGRAPH_PREVIEW_POINT*72/96);
    if (plan) applyNativeParagraph(plan);
  }
}
