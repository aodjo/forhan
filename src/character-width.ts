import { characterMetrics, type CharacterMetrics } from "./character-metrics.ts";
import { measureNativeDirectionalEnds } from './native-bidi.ts';
import { nativeSpacingFlag } from "./font-space.ts";

/** One complete source grapheme may cross transparent rendering wrappers. */
export interface NativeWidthGlyph {
  node: Text;
  from: number;
  endNode: Text;
  to: number;
  text: string;
  direction: "ltr" | "rtl";
  ratio: number;
  advance: number;
  intrinsic: number;
  parts: { node: Text; from: number; to: number }[];
}

/** A coherent styled source run is collected before rendering wrappers are changed. */
interface WidthRun {
  block: HTMLElement;
  effects: string;
  font: string;
  kerning: boolean;
  ratio: number;
  tracking: number;
  text: string;
  nodes: { node: Text; start: number }[];
}

/**
 * Calculate native glyph advance independently of the visible glyph contour.
 *
 * Original controlled Arial captures show that tracking scales glyph advance,
 * and width scales that result. Relative height is already in the font metric.
 * @param {number} intrinsic - Actual untracked glyph advance in CSS pixels.
 * @param {number} ratio - Native horizontal percentage, including retained byte values.
 * @param {number} tracking - Native signed tracking percentage.
 * @returns {number} Native physical source advance.
 * @example
 * nativeGlyphAdvance(40,50,20); // 24, with the original glyph height unchanged.
 */
export function nativeGlyphAdvance(
  intrinsic: number,
  ratio: number,
  tracking: number,
): number {
  return ((intrinsic * ratio) / 100) * (1 + tracking / 100);
}

/**
 * Step all native language widths using observed native keyboard boundaries.
 *
 * Ordinary widths stop at fifty and two hundred. Retained zero decreases to
 * byte value 255 in the original application; an increment containing 255 is
 * rejected for the whole original definition rather than wrapping its arrays.
 * @param {unknown} source - Original seven-language native measurement arrays.
 * @param {1|-1} direction - Native one-percentage-point keyboard direction.
 * @returns {CharacterMetrics} Fresh source arrays with only width percentages stepped.
 * @throws {RangeError} If source arrays or the step direction are invalid.
 * @example
 * stepNativeWidths(null,1).ratio; // Seven independently stepped values of 101.
 */
export function stepNativeWidths(source:unknown,direction:1|-1):CharacterMetrics {
  if(direction!==1&&direction!==-1)throw new RangeError('Invalid native width step direction.');
  /** The native byte-domain edge is checked before any independent array is modified. */
  const metrics=characterMetrics(source);
  if(direction===1&&metrics.ratio.includes(255))return metrics;
  for(let slot=0;slot<7;slot++){
    /** Each language retains its own original width rather than inheriting a representative value. */
    const value=metrics.ratio[slot];
    metrics.ratio[slot]=direction===1?(value<200?value+1:value):(value===0?255:value>50?value-1:value);
  }
  return metrics;
}

/**
 * Detect source measurements requiring independent native horizontal geometry.
 *
 * All seven arrays remain source data; only the active script requests drawing.
 * Missing native measurements keep ordinary browser glyphs and shaping intact.
 * @param {Record<string,unknown>} attrs - Actual original text-style attributes.
 * @returns {boolean} Whether active width or tracking differs from native defaults.
 * @throws {RangeError} If retained native measurement arrays are invalid.
 * @example
 * needsNativeWidth({}); // false, without an invented source width preference.
 */
export function needsNativeWidth(attrs: Record<string, unknown>): boolean {
  if (!attrs.nativeCharacterMetrics) return false;
  /** The source normalizer supplies an explicit native script slot. */
  const metrics = characterMetrics(attrs.nativeCharacterMetrics),
    language = Number(attrs.nativeCharacterLanguage ?? 0);
  return (
    (metrics.ratio[language] ?? 100) !== 100 ||
    (metrics.spacing[language] ?? 0) !== 0
  );
}

/**
 * Identify scripts that require coherent shaping instead of independent glyph drawing.
 *
 * Hebrew graphemes retain browser bidi layout and use right-anchored drawings.
 * Joining scripts use the separate coherent-word controller. Its unsupported
 * tracking/style boundaries retain original shaping and exact native arrays.
 * @param {string} text - Coherent original source run.
 * @returns {boolean} Whether independent horizontal glyph drawing is supported.
 * @example
 * supportsNativeWidthRun('ABC 한글'); // true; Arabic uses coherent source-word shaping.
 */
export function supportsNativeWidthRun(text:string):boolean {
  return !/[\u0600-\u109f\u1780-\u18af\u1a00-\u1cff\ua800-\uabff\ufb50-\ufdff\ufe70-\ufeff]/u.test(text);
}

/**
 * Measure native source advances without feeding rendering corrections back.
 *
 * Transparent space, line and width wrappers are joined into their original
 * font run before pair kerning is inspected. Complete graphemes retain their
 * source intervals; ASCII spaces keep the independent native space controller.
 * @param {HTMLElement} root - Actual attached source document or owned preview.
 * @returns {NativeWidthGlyph[]} Original graphemes and independently measured advances.
 * @throws {RangeError|SyntaxError} If explicit native metrics or flags are invalid.
 * @example
 * measureNativeWidths(editorRoot); // Reads geometry without changing source or DOM.
 */
export function measureNativeWidths(root: HTMLElement): NativeWidthGlyph[] {
  /** Canvas font metrics belong to the same document and installed faces as the source. */
  const document = root.ownerDocument,
    window = document.defaultView!,
    context = document.createElement("canvas").getContext("2d"),
    walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    ),
    runs: WidthRun[] = [],
    result: NativeWidthGlyph[] = [],
    segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
  if (!context) return result;
  let current: WidthRun | null = null;
  while (walker.nextNode()) {
    /** Real hard breaks cannot form a cross-line kerning pair. */
    const candidate = walker.currentNode;
    if (candidate instanceof window.HTMLElement && candidate.tagName === "BR") {
      current = null;
      continue;
    }
    if (candidate.nodeType !== 3) continue;
    /** Generated contours and other non-source nodes are never reinterpreted as authored glyphs. */
    const node = candidate as Text,
      parent = node.parentElement,
      owner = parent?.closest<HTMLElement>("[data-forhan-character-metrics]");
    if (
      !parent ||
      !owner ||
      parent.closest('[data-forhan-outline-drawing],[contenteditable="false"]')
    )
      continue;
    /** Original source arrays remain outside every drawing-only correction wrapper. */
    const metrics = characterMetrics(
        JSON.parse(owner.dataset.forhanCharacterMetrics!),
      ),
      language = Number(owner.dataset.forhanCharacterLanguage ?? 0),
      ratio = metrics.ratio[language] ?? 100,
      tracking = metrics.spacing[language] ?? 0;
    if (ratio === 100 && tracking === 0) {
      current = null;
      continue;
    }
    /** Kerning preference is read from source rather than an earlier correction's CSS override. */
    const style = window.getComputedStyle(parent),
      font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      kerningOwner = parent.closest<HTMLElement>("[data-forhan-use-kerning]"),
      kerning = kerningOwner
        ? nativeSpacingFlag(kerningOwner.dataset.forhanUseKerning)
        : style.fontKerning === "normal";
    if(parseFloat(style.fontSize)<=0){current=null;continue;}
    /** Language-only source spans cannot split one combining or joined grapheme when actual formatting agrees. */
    const block=parent.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,.nd-character-sample')||root,
      effects=[style.color,owner.style.backgroundColor,owner.dataset.forhanBaseFontSize||'',metrics.offset[language]??0,parent.closest<HTMLElement>('[data-forhan-outline]')?.dataset.forhanOutline||'',parent.closest<HTMLElement>('[data-forhan-shadow]')?.dataset.forhanShadow||'',parent.closest<HTMLElement>('[data-forhan-emphasis]')?.dataset.forhanEmphasis||''].join('|');
    if (
      !current ||
      current.block !== block || current.effects!==effects || current.ratio!==ratio || current.tracking!==tracking ||
      current.font !== font ||
      current.kerning !== kerning
    ) {
      current = { block, effects, font, kerning, ratio, tracking, text: "", nodes: [] };
      runs.push(current);
    }
    current.nodes.push({ node, start: current.text.length });
    current.text += node.data;
  }
  /** Original visual run endings suppress tracking independently of transparent font/style wrappers. */
  let directionalEnds:Map<Text,Set<number>>|undefined;
  for (/** Native width and tracking apply to each original source font run independently. */ const run of runs) {
    if(run.tracking!==0&&!directionalEnds)directionalEnds=measureNativeDirectionalEnds(root);
    context.font = run.font;
    context.fontKerning = "none";
    /** Segmenting the coherent original run avoids splitting combining or joined characters. */
    const segments = Array.from(segmenter.segment(run.text));
    let sourceIndex = 0;
    for (let index = 0; index < segments.length; index++) {
      /** Actual original grapheme indices remain independent of transparent DOM splits. */
      const part = segments[index],
        next = segments[index + 1];
      if (/^[\s\p{Cc}\p{Cf}]+$/u.test(part.segment)) continue;
      if (!supportsNativeWidthRun(part.segment)) continue;
      /** Unkerned glyph shape and pair adjustment are measured independently. */
      const intrinsic = context.measureText(part.segment).width,
        parts: NativeWidthGlyph["parts"] = [];
      let shaped = intrinsic;
      if (run.kerning && next && !/\s/u.test(next.segment) && supportsNativeWidthRun(next.segment)) {
        context.fontKerning = "normal";
        shaped +=
          context.measureText(part.segment + next.segment).width -
          context.measureText(part.segment).width -
          context.measureText(next.segment).width;
        context.fontKerning = "none";
      }
      while (
        sourceIndex < run.nodes.length &&
        run.nodes[sourceIndex].start + run.nodes[sourceIndex].node.length <=
          part.index
      )
        sourceIndex++;
      for (
        let nodeIndex = sourceIndex;
        nodeIndex < run.nodes.length &&
        run.nodes[nodeIndex].start < part.index + part.segment.length;
        nodeIndex++
      ) {
        /** A grapheme may span existing line or space decorations without changing its source identity. */
        const source = run.nodes[nodeIndex];
        /** Only original source intervals overlapping this complete grapheme are retained. */
        const from = Math.max(0, part.index - source.start),
          to = Math.min(
            source.node.length,
            part.index + part.segment.length - source.start,
          );
        if (from < to) parts.push({ node: source.node, from, to });
      }
      let tracking=run.tracking;
      for(/** A complete source grapheme can span transparent marks while retaining its native visual run ending. */const fragment of parts){
        if(!directionalEnds?.get(fragment.node)?.has(fragment.from))continue;
        /** Original native PDF glyph matrices retain base-glyph tracking before an uncomposed zero-advance terminal mark. */
        const normalized=Array.from(part.segment.normalize('NFC')),last=normalized.at(-1)!;
        if(!(normalized.length>1&&/\p{Mark}/u.test(last)&&context.measureText(last).width===0))tracking=0;
        break;
      }
      if (parts.length)
        result.push({
          node: parts[0].node,
          from: parts[0].from,
          endNode: parts.at(-1)!.node,
          to: parts.at(-1)!.to,
          text: part.segment,
          direction: /[\u0590-\u05ff\ufb1d-\ufb4f]/u.test(part.segment)
            ? "rtl"
            : "ltr",
          ratio: run.ratio,
          advance: nativeGlyphAdvance(shaped, run.ratio, tracking),
          intrinsic,
          parts,
        });
    }
  }
  return result;
}

/**
 * Apply native glyph advances to a detached static output or local preview.
 *
 * Inline wrappers preserve ordinary word-break opportunities and original text.
 * Their letter spacing controls logical advance while separate SVG preserves
 * actual horizontal glyph proportions without changing vertical font metrics.
 * @param {NativeWidthGlyph[]} glyphs - Measurements from the unchanged source copy.
 * @returns {void} Adds only owned drawing geometry to the static DOM.
 * @example
 * applyNativeWidths(measureNativeWidths(output.body)); // Before paragraph line layout.
 */
export function applyNativeWidths(glyphs: NativeWidthGlyph[]): void {
  for (let index = glyphs.length - 1; index >= 0; index--) {
    /** Reverse source splitting preserves every earlier authored text offset. */
    const glyph = glyphs[index];
    for (let partIndex = glyph.parts.length - 1; partIndex >= 0; partIndex--) {
      /** Only the last source fragment owns the complete grapheme's extra advance. */
      const part = glyph.parts[partIndex],
        text = part.node.splitText(part.from),
        wrapper = part.node.ownerDocument.createElement("forhan-width"),
        spacing =
          partIndex === glyph.parts.length - 1
            ? glyph.advance - glyph.intrinsic
            : 0;
      if (part.to - part.from < text.length)
        text.splitText(part.to - part.from);
      wrapper.dataset.forhanWidthRatio = String(glyph.ratio);
      wrapper.setAttribute(
        "style",
        `letter-spacing:${spacing}px;font-kerning:none;font-variant-ligatures:none`,
      );
      text.parentNode!.replaceChild(wrapper, text);
      wrapper.appendChild(text);
    }
  }
}
