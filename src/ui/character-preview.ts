import { characterFonts } from "../character-fonts";
import {renderLiteralFontCss} from '../font-fallback.ts';
import {
  characterMetrics,
  characterLanguage,
  CHARACTER_METRICS,
} from "../character-metrics";
import { storedFontSizePoints } from "../formatting";
import { renderCharacterMetrics } from "./character-formatting";
import { nativeSpacingFlag } from "../font-space.ts";
import { applyNativeWidths, measureNativeWidths } from "../character-width.ts";

/** Native character preview sample, independently rendered as text rather than a captured image. */
const CHARACTER_SAMPLE = "한글Eng123漢字あいう※◎";

/**
 * Render every sample script with its own pending native font and percentages.
 *
 * The parent keeps its physical baseline and selected-language readout. Child
 * runs override inherited spacing and compensate only the parent's baseline
 * displacement so a Latin edit cannot reshape the sample's Hangul text.
 * Uniform settings retain a single text node for stable native dialog geometry.
 * @param {HTMLElement} element - Existing measured character sample element.
 * @param {Record<string, unknown>} attrs - Complete local preview style and native arrays.
 * @param {number} language - Active language represented by the parent sample style.
 * @returns {void} Replaces only the local sample's text or script-specific spans.
 * @throws {RangeError} If retained font or measurement arrays are malformed.
 * @example
 * renderCharacterSample(sample, draft.preview(), 1);
 */
export function renderCharacterSample(
  element: HTMLElement,
  attrs: Record<string, unknown>,
  language: number,
): void {
  for(/** Source metadata is replaced with the current isolated draft before physical width measurement. */const name of ['data-forhan-character-metrics','data-forhan-character-language','data-forhan-base-font-size'])element.removeAttribute(name);
  for(/** Parent draft metadata remains separate from its externally anchored preview style. */const [name,value] of Object.entries(renderCharacterMetrics({...attrs,nativeCharacterLanguage:language})))if(name!=='style')element.setAttribute(name,value);
  element.dataset.forhanUseKerning=nativeSpacingFlag(attrs.nativeUseKerning)?'1':'0';
  element.style.fontKerning = nativeSpacingFlag(attrs.nativeUseKerning)
    ? "normal"
    : "none";
  /** Current local native arrays have no reference to the document's source arrays. */
  const metrics = characterMetrics(attrs.nativeCharacterMetrics);
  /** Font choices remain independent across all native script slots. */
  const fonts = characterFonts(
    attrs.nativeCharacterFonts,
    String(attrs.fontFamily || ""),
  );
  let uniform = true;
  for (let slot = 1; slot < 7; slot++) {
    if (fonts[slot] !== fonts[0]) uniform = false;
    for (/** Native measurement whose script differences affect the physical sample. */
    const key of CHARACTER_METRICS)
      if (metrics[key][slot] !== metrics[key][0]) uniform = false;
  }
  if (uniform) {
    element.textContent = CHARACTER_SAMPLE;
    applyNativeWidths(measureNativeWidths(element));
    return;
  }
  element.replaceChildren();
  /** Physical base is independent of both the parent and child relative glyph sizes. */
  const base = storedFontSizePoints(attrs.fontSize, 10);
  let previous = -1;
  let run: HTMLSpanElement | null = null;
  for (/** Complete Unicode sample scalar, preserving supplementary characters if the sample expands. */
  const value of CHARACTER_SAMPLE) {
    /** The same native script classifier is shared by document rendering and export. */
    const slot = characterLanguage(value);
    if (slot === previous && run) {
      run.textContent += value;
      continue;
    }
    run = document.createElement("span");
    run.dataset.previewLanguage = String(slot);
    run.style.cssText = renderCharacterMetrics({
      ...attrs,
      nativeCharacterLanguage: slot,
    }).style;
    for(/** Each script's real source metadata drives its own horizontal glyph proportions. */const [name,value] of Object.entries(renderCharacterMetrics({...attrs,nativeCharacterLanguage:slot})))if(name!=='style')run.setAttribute(name,value);
    run.style.letterSpacing = `${(base * metrics.spacing[slot]) / 100}pt`;
    run.style.position = "relative";
    run.style.top = `${(base * (metrics.offset[slot] - metrics.offset[language])) / 100}pt`;
    if (fonts[slot]) run.style.fontFamily = renderLiteralFontCss(fonts[slot]);
    run.textContent = value;
    element.append(run);
    previous = slot;
  }
  applyNativeWidths(measureNativeWidths(element));
}
