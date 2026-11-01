import { characterMetrics } from "./character-metrics.ts";
import { measureNativeDirectionalEnds } from './native-bidi.ts';
import {removeParagraphSpaceDrawings} from './paragraph-minimum-space.ts';
import {normalizeHtmlPrintText} from './print-text.ts';

/** One source ASCII-space range receives native advance without changing its characters. */
export interface NativeSpaceRange {
  node: Text;
  from: number;
  to: number;
  delta: number;
  /** Tracked source spaces explicitly reset inherited letter spacing to avoid cursive engine suppression. */
  resetLetterSpacing?: boolean;
  /** Optional paragraph reduction remains distinct from the original font-space correction. */
  condenseDelta?:number;
}

/**
 * Read a native character-spacing flag without confusing the string zero with true.
 *
 * OWPML accepts both boolean spellings and zero/one. Missing native values use
 * the observed half-em default. Unsupported values fail before native writing
 * rather than silently changing the intended character-shape setting.
 * @param {unknown} value - Source font-space/kerning boolean, OWPML scalar or absent default.
 * @returns {boolean} Whether the independent native character option is enabled.
 * @throws {RangeError} If a supplied flag is outside the native boolean domain.
 * @example
 * nativeSpacingFlag('0'); // false
 */
export function nativeSpacingFlag(value: unknown): boolean {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === 0 ||
    value === "0" ||
    value === "false"
  )
    return false;
  if (value === true || value === 1 || value === "1" || value === "true")
    return true;
  throw new RangeError(
    "Native character-spacing preference must be a boolean.",
  );
}

/**
 * Calculate native ASCII-space advance from independently observed character settings.
 *
 * Effective font size already includes native relative height. Width ratio and
 * tracking multiply the space advance in either mode; ordinary glyph tracking
 * must not be added again to the measured space. Both parameters retain their
 * original signed native precision instead of interactive input bounds.
 * @param {number} fontSize - Effective displayed size in unzoomed CSS pixels.
 * @param {number} intrinsic - Actual intrinsic space width at that displayed size.
 * @param {boolean} useFontSpace - True selects the intrinsic font space; false selects half-em.
 * @param {number} [ratio=100] - Native Latin width percentage.
 * @param {number} [tracking=0] - Native Latin tracking percentage.
 * @returns {number} Intended unzoomed native advance of one ASCII space.
 * @example
 * nativeSpaceAdvance(20,6,false,100,20); // 12
 */
export function nativeSpaceAdvance(
  fontSize: number,
  intrinsic: number,
  useFontSpace: boolean,
  ratio = 100,
  tracking = 0,
): number {
  return (
    (((useFontSpace ? intrinsic : fontSize / 2) * ratio) / 100) *
    (1 + tracking / 100)
  );
}

/**
 * Measure native ASCII-space corrections before actual line breaking is inspected.
 *
 * Tracked space-only ranges retain coherent neighboring source words. Their
 * explicit zero letter-spacing avoids engine-specific cursive suppression.
 * Zero-tracking corrections retain whole text runs so an unchanged kerning
 * preference cannot acquire a different shape after undo. NBSP and tabs retain their own semantics. Wrappers never change the
 * source preference or feed their own delta back into font measurement. No
 * source text, source attributes or DOM is modified by this measurement.
 * @param {HTMLElement} root - Attached live editor or owned standalone body.
 * @returns {NativeSpaceRange[]} Actual text ranges and intrinsic-to-native word deltas.
 * @throws {RangeError|SyntaxError} If explicit native measurement metadata is malformed.
 * @example
 * const spaces = measureNativeSpaces(documentBody); // Native half-em differs from a font's own space.
 */
export function measureNativeSpaces(root: HTMLElement): NativeSpaceRange[] {
  /** Font measurements belong to the same platform and document as the actual text. */
  const document = root.ownerDocument,
    context = document.createElement("canvas").getContext("2d"),
    ranges: NativeSpaceRange[] = [],
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** Ordinary zero-tracking documents need no additional directional analysis. */
  let directionalEnds:Map<Text,Set<number>>|undefined;
  if (!context) return ranges;
  while (walker.nextNode()) {
    /** Original text and styled parent retain character marks independent of layout wrappers. */
    const node = walker.currentNode as Text,
      parent = node.parentElement;
    if (
      !parent ||
      !node.data.includes(" ") ||
      parent.closest('[contenteditable="false"]')
    )
      continue;
    /** Explicit native mode overrides the app's observed half-em default. */
    const marker = parent.closest<HTMLElement>("[data-forhan-use-font-space]"),
      useFontSpace = nativeSpacingFlag(
        marker?.getAttribute("data-forhan-use-font-space"),
      ),
      metricsElement = parent.closest<HTMLElement>(
        "[data-forhan-character-metrics]",
      ),
      metrics = characterMetrics(
        metricsElement
          ? JSON.parse(
              metricsElement.getAttribute("data-forhan-character-metrics")!,
            )
          : null,
      ),
      ratio = metrics.ratio[1],
      tracking = metrics.spacing[1];
    if (tracking !== 0 && !directionalEnds) directionalEnds = measureNativeDirectionalEnds(root);
    if (useFontSpace && ratio === 100 && tracking === 0) continue;
    /** Effective native relative height is already reflected in the actual computed font size. */
    const style = document.defaultView!.getComputedStyle(parent),
      size = parseFloat(style.fontSize);
    if (!Number.isFinite(size) || size <= 0) continue;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    /** Canvas intrinsic space has no inherited browser letter-spacing or drawing-only word-spacing. */
    const intrinsic = context.measureText(" ").width,
      delta = nativeSpaceAdvance(size, intrinsic, useFontSpace, ratio, tracking) - intrinsic,
      endingDelta = nativeSpaceAdvance(size, intrinsic, useFontSpace, ratio, 0) - intrinsic;
    if(tracking===0){
      for(/** Coherent untracked source retains original cross-space kerning after source-equivalent undo. */const match of node.data.matchAll(/(?:\S| )+/gu))if(match[0].includes(' '))ranges.push({node,from:match.index,to:match.index+match[0].length,delta});
      continue;
    }
    for (/** Original joining words are never split to correct a neighboring source space. */ const match of node.data.matchAll(/ +/g)) {
      let from=match.index,current=directionalEnds?.get(node)?.has(from)?endingDelta:delta;
      for(let index=from+1;index<match.index+match[0].length;index++){
        /** Consecutive source spaces share a wrapper only while their native advance is identical. */
        const next=directionalEnds?.get(node)?.has(index)?endingDelta:delta;
        if(next!==current){ranges.push({node,from,to:index,delta:current,resetLetterSpacing:true});from=index;current=next;}
      }
      ranges.push({node,from,to:match.index+match[0].length,delta:current,resetLetterSpacing:true});
    }
  }
  return ranges;
}

/**
 * Apply native space geometry to an owned static export copy.
 *
 * Word-spacing wrappers retain original text and its break opportunities.
 * Exact attribute text survives HTML serialization without a CSSOM rounding
 * pass; source marks remain outside the drawing-only inline element.
 * @param {NativeSpaceRange[]} ranges - Measurements made before native line layout.
 * @returns {void} Adds static drawing geometry without changing the source model.
 * @example
 * applyNativeSpaces(measureNativeSpaces(body)); // Used only on an owned export DOM.
 */
export function applyNativeSpaces(ranges: NativeSpaceRange[]): void {
  for (let index = ranges.length - 1; index >= 0; index--) {
    /** Reverse splitting retains all original text offsets while preserving mark boundaries. */
    const part = ranges[index],
      text = part.node.splitText(part.from),
      wrapper = part.node.ownerDocument.createElement("forhan-space");
    if (part.to - part.from < text.length) text.splitText(part.to - part.from);
    wrapper.setAttribute("data-forhan-space-delta", String(part.delta));
    if(part.condenseDelta!==undefined)wrapper.setAttribute('data-forhan-condense-delta',String(part.condenseDelta));
    wrapper.setAttribute("style", `word-spacing:${part.delta}px${part.resetLetterSpacing?';letter-spacing:0':''}`);
    text.parentNode!.replaceChild(wrapper, text);
    wrapper.appendChild(text);
  }
}

/**
 * Preserve ordinary HTML font spaces without changing explicitly native source preferences.
 *
 * Imported web text uses intrinsic font spacing unless an owned native marker
 * says otherwise. Bare text needs an explicit text-style mark too. Original
 * character marks, links and text remain intact; no rendering wrapper enters
 * the editable source. Standalone Forhan HTML declares its native default.
 * @param {HTMLElement} root - Detached sanitized HTML body or clipboard container.
 * @returns {void} Annotates only text with an otherwise absent native preference.
 * @example
 * normalizeHtmlFontSpaces(parsed.body); // External bare HTML text retains normal font spaces.
 */
export function normalizeHtmlFontSpaces(root: HTMLElement): void {
  normalizeHtmlPrintText(root);
  removeParagraphSpaceDrawings(root);
  /** Snapshot text nodes before adding style spans so the walker cannot revisit inserted nodes. */
  const document = root.ownerDocument,
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes: Text[] = [],
    intrinsic = root.getAttribute("data-forhan-native-space-default") !== "0",
    kerning = root.getAttribute("data-forhan-native-kerning-default") !== "0";
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (/** Existing explicit native spans retain their full source tables and boolean preference. */ const node of nodes) {
    if (!node.data) continue;
    /** Space width and kerning have independent source markers and independent native defaults. */
    const spaceParent = node.parentElement?.closest(
        "[data-forhan-use-font-space]",
      ),
      kerningParent = node.parentElement?.closest("[data-forhan-use-kerning]");
    if (spaceParent && kerningParent) continue;
    /** Reuse an existing styled mark so a nested synthetic mark cannot erase native source metadata. */
    const styled = node.parentElement?.closest<HTMLElement>("span[style]");
    if (styled) {
      if (!spaceParent)
        styled.setAttribute(
          "data-forhan-use-font-space",
          intrinsic ? "1" : "0",
        );
      if (!kerningParent)
        styled.setAttribute(
          "data-forhan-use-kerning",
          styled.style.fontKerning === "none" ? "0" : kerning ? "1" : "0",
        );
      continue;
    }
    /** A normal HTML span remains parseable by the text-style extension even without a font-size property. */
    const span = document.createElement("span");
    span.setAttribute(
      "data-forhan-use-font-space",
      spaceParent?.getAttribute("data-forhan-use-font-space") ??
        (intrinsic ? "1" : "0"),
    );
    span.setAttribute(
      "data-forhan-use-kerning",
      kerningParent?.getAttribute("data-forhan-use-kerning") ??
        (kerning ? "1" : "0"),
    );
    span.setAttribute("style", "word-spacing:normal");
    node.parentNode!.replaceChild(span, node);
    span.appendChild(node);
  }
}
