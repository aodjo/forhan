import { fixedLineHeightPoints, storedFontSizePoints } from "./formatting.ts";
import { characterMetrics } from "./character-metrics.ts";

/** Baseline fraction retained in observed native HWP/HWPX line segments at several text heights. */
export const NATIVE_BASELINE_FRACTION = 0.85;
/** Browser layout units retain stable relative positioning without repeated fractional feedback. */
const LAYOUT_QUANTUM = 1 / 64;
/** One CSS pixel spans seventy-five native hundredths of a point. */
export const NATIVE_UNITS_PER_CSS_PIXEL = 75;
/** Observed proportional line gaps use four native units after quantizing their source font height. */
const NATIVE_LINE_GAP_QUANTUM = 4;
/** Mathematical half ties must not move below the boundary through ordinary floating multiplication. */
const NATIVE_GAP_TIE_TOLERANCE = 1e-10;
/** Native line progress uses either a physical interval or a proportional multiplier. */
export interface NativeLineSpacing {
  fixedPixels: number | null;
  multiplier: number;
}
/** One contiguous text range receives its visual line's independent baseline correction. */
export interface NativeLineRange {
  node: Text;
  from: number;
  to: number;
  shift: number;
  shiftX?: number;
  line: number;
}
/** Actual browser line observations and their independently calculated native geometry. */
export interface NativeVisualLine {
  /** View-only physical page ownership and horizontal cell offset never enter authored source. */
  page?:number;
  shiftX?:number;
  /** An authored hard break identifies the original source start of an otherwise empty line. */
  breakBefore?:HTMLBRElement;
  /** Original break geometry keeps native caret rectangles aligned when a line has no authored glyph. */
  placeholder?:{element:HTMLBRElement;browserBaseline:number};
  /** Largest original native base height, independent of relative glyph percentages. */
  fontSize: number;
  browserBaseline: number | null;
  top: number;
  advance: number;
  baseline: number;
}
/** Rendering-only paragraph geometry never enters the editable document or native source bytes. */
export interface NativeParagraphLayout {
  element: HTMLElement;
  height: number;
  /** A trailing native empty line owns genuine horizontal source flow during composition. */
  shiftX?:number;
  previousShiftX?:number;
  ranges: NativeLineRange[];
  lines: NativeVisualLine[];
}

/**
 * Resolve supported native paragraph spacing without treating explicit zero as absent.
 *
 * Source physical units share the native point conversion. Proportional source
 * values retain imported precision and are not restricted by new-entry limits.
 * Unknown CSS modes remain outside this native geometry calculation.
 * @param {unknown} source - Actual inline source spacing, or an absent native default.
 * @returns {NativeLineSpacing|null} Native interval definition or null for an unknown mode.
 * @example
 * nativeLineSpacing('0pt'); // {fixedPixels:0,multiplier:0}
 */
export function nativeLineSpacing(source: unknown): NativeLineSpacing | null {
  /** Empty source paragraphs use the independently observed default 160 percent. */
  const value = String(source ?? "").trim();
  if (!value) return { fixedPixels: null, multiplier: 1.6 };
  /** Fixed source intervals remain independent of visible glyph height. */
  const fixed = fixedLineHeightPoints(value);
  if (fixed !== null) return { fixedPixels: (fixed * 96) / 72, multiplier: 0 };
  /** Native multipliers and literal percentages have equivalent interval semantics. */
  const match = value.match(/^(\d+(?:\.\d*)?|\.\d+)\s*(%)?$/);
  if (!match) return null;
  /** A finite multiplier is never normalized merely to fit an interactive input bound. */
  const multiplier = Number(match[1]) / (match[2] ? 100 : 1);
  return Number.isFinite(multiplier) ? { fixedPixels: null, multiplier } : null;
}

/**
 * Compute one native line's progress independently of its glyph baseline.
 *
 * Fixed zero means no progress. Proportional progress follows the largest
 * original text base size and the independently observed native gap quantum,
 * rather than the browser strut or a language-specific relative glyph height.
 * A zero percent interval can retain a one-to-three-unit native remainder
 * when its original font height is not divisible by the gap quantum.
 * @param {number} fontSize - Largest original line base size in CSS pixels.
 * @param {NativeLineSpacing} spacing - Original native spacing definition.
 * @returns {number} Nonnegative physical progress in CSS pixels.
 * @example
 * nativeLineAdvance(20,{fixedPixels:0,multiplier:0}); // 0
 */
export function nativeLineAdvance(
  fontSize: number,
  spacing: NativeLineSpacing,
): number {
  if(spacing.fixedPixels!==null)return spacing.fixedPixels;
  return nativeProportionalAdvance(Math.max(0,Math.round(fontSize*NATIVE_UNITS_PER_CSS_PIXEL)),spacing.multiplier*100)/NATIVE_UNITS_PER_CSS_PIXEL;
}

/**
 * Resolve proportional native progression from original font height and percent.
 *
 * Independently observed native caches and actual PDFs establish a four-unit
 * source-height quantum, followed by a signed nearest-quantum gap with half
 * ties away from zero. The original full font height remains in the result.
 * These observations describe source geometry, not an asserted internal engine.
 * @param {number} height - Original nonnegative integral font height in native hundredths of a point.
 * @param {number} percent - Original nonnegative proportional source percentage.
 * @returns {number} Nonnegative native progression, including any zero-percent remainder.
 * @example
 * nativeProportionalAdvance(1999,170); // 3395; fixed point intervals use a separate path.
 */
export function nativeProportionalAdvance(height:number,percent:number):number{
  /** The signed gap is calculated from the quantized source height, independently from the retained base height. */
  const gap=Math.floor(height/NATIVE_LINE_GAP_QUANTUM)*(percent-100)/100,
    rounded=Math.sign(gap)*Math.floor(Math.abs(gap)+0.5+NATIVE_GAP_TIE_TOLERANCE)*NATIVE_LINE_GAP_QUANTUM;
  return Math.max(0,height+rounded);
}

/**
 * Recover an integral native glyph baseline from its original base height.
 *
 * Source cache baselines round the observed eighty-five-percent fraction to
 * the nearest native unit before conversion to browser drawing coordinates.
 * @param {number} fontSize - Original font base height in CSS pixels.
 * @returns {number} Independently rounded native baseline in CSS pixels.
 * @example
 * nativeLineBaseline(1001/75); // 851/75, matching the original native cache.
 */
export function nativeLineBaseline(fontSize:number):number{
  return Math.round(Math.round(fontSize*NATIVE_UNITS_PER_CSS_PIXEL)*NATIVE_BASELINE_FRACTION)/NATIVE_UNITS_PER_CSS_PIXEL;
}

/**
 * Read actual accumulated native document zoom from the rendering ancestry.
 *
 * Inline font sizes remain unzoomed CSS values while DOM ranges contain zoomed
 * coordinates. The same function also works in standalone export documents.
 * @param {HTMLElement} element - Measured paragraph or containing document root.
 * @returns {number} Positive product of explicit ancestor CSS zoom values.
 * @example
 * nativeDocumentZoom(paragraph); // 1.25 in the observed editing view.
 */
export function nativeDocumentZoom(element: HTMLElement): number {
  let zoom = 1;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    /** Each explicit zoom contributes once to actual range coordinates. */
    const value = Number(
      element.ownerDocument.defaultView!.getComputedStyle(node).zoom,
    );
    if (Number.isFinite(value) && value > 0) zoom *= value;
  }
  return zoom;
}

/**
 * Remove existing visual shifts when measuring the underlying browser baseline.
 *
 * Authored character offsets remain visible after the new common-line shift.
 * Existing native layout decorations cannot feed their own correction back
 * into a later measurement and create repeated drift.
 * @param {HTMLElement} element - Text run's actual styled parent.
 * @param {HTMLElement} paragraph - Owning native paragraph or heading.
 * @returns {{relative:number;previous:number;previousX:number}} Authored/decorated vertical shift and previous owned two-dimensional correction.
 * @example
 * nativeRelativeShift(span,paragraph); // Existing line corrections are recognized separately.
 */
export function nativeRelativeShift(
  element: HTMLElement,
  paragraph: HTMLElement,
): { relative: number; previous: number; previousX:number } {
  let relative = 0,
    previous = 0,previousX=0;
  for (
    let node: HTMLElement | null = element;
    node && node !== paragraph;
    node = node.parentElement
  ) {
    /** Owned shifts are recognized from explicit rendering-only metadata. */
    const source = node.getAttribute("data-forhan-line-shift")??node.getAttribute('data-forhan-break-shift'),
      style = paragraph.ownerDocument.defaultView!.getComputedStyle(node),
      owned=source!==null&&Number.isFinite(Number(source));
    /** Computed CSS truncates large offsets; exact owned layout units cannot feed that serialization loss back into a later frame. */
    if (style.position === "relative" && style.top !== "auto")
      relative += owned?Number(source):parseFloat(style.top)||0;
    if (owned)
      previous += Number(source);
    previousX+=Number(node.getAttribute('data-forhan-line-shift-x')??node.getAttribute('data-forhan-break-shift-x'))||0;
  }
  return { relative, previous, previousX };
}

/**
 * Recover original native base height independently of relative displayed glyph size.
 *
 * Native saved line caches retain 16pt height and 85 percent baseline for 50,
 * 80 and 120 percent glyph sizes alike. Physical source metadata takes priority;
 * inherited source sizes can be recovered from the displayed percentage. Exact
 * authored point sizes precede rounded CSS serialization for ordinary source. An
 * inherited zero relative size falls back to its original parent's font size.
 * @param {HTMLElement} element - Actual source text run's rendered parent.
 * @param {number} displayed - Browser-resolved glyph size in CSS pixels.
 * @returns {number} Original native base height in unzoomed CSS pixels.
 * @throws {RangeError|SyntaxError} If explicit native measurement metadata is malformed.
 * @example
 * nativeLineBaseSize(span,17.0667); // A 16pt base at 80 percent still uses 21.3333 CSS pixels for line progress.
 */
export function nativeLineBaseSize(element: HTMLElement, displayed: number): number {
  /** Only explicit native character measurements distinguish glyph height from base height. */
  const source = element.closest<HTMLElement>(
    "[data-forhan-character-metrics]",
  );
  if (!source) {
    for(let current:HTMLElement|null=element;current;current=current.parentElement){
      /** Exact authored point values cannot inherit the computed style's decimal truncation. */
      const size=current.style.fontSize;
      if(size){
        if(/pt$/iu.test(size)){
          /** Original point geometry remains independent from display zoom and CSS serialization. */
          const points=storedFontSizePoints(size,Number.NaN);if(Number.isFinite(points))return points*4/3;
        }
        return displayed;
      }
      if(current.classList.contains('tiptap'))break;
    }
    return displayed;
  }
  /** A retained physical base remains exact even when relative glyph size is zero. */
  const points = storedFontSizePoints(
    source.getAttribute("data-forhan-base-font-size"),
    Number.NaN,
  );
  if (Number.isFinite(points)) return (points * 4) / 3;
  /** Active source language selects only its own retained relative-height percentage. */
  const metrics = characterMetrics(
      JSON.parse(source.getAttribute("data-forhan-character-metrics")!),
    ),
    language = Number(
      source.getAttribute("data-forhan-character-language") || 0,
    ),
    relative =
      metrics.relativeSize[language >= 0 && language < 7 ? language : 0];
  return relative
    ? (displayed * 100) / relative
    : parseFloat(
        source.ownerDocument.defaultView!.getComputedStyle(
          source.parentElement!,
        ).fontSize,
      );
}

/**
 * Measure a paragraph's real browser lines and plan native baseline/flow geometry.
 *
 * Canvas font-box metrics locate actual browser baselines. Detached metric
 * canvases use the source language so unavailable faces resolve through the
 * same fallback as the actual paragraph. Hard breaks remain
 * distinct even at zero spacing; ordinary wraps are grouped by baseline and
 * edge reset. Rendering-only ranges retain all original text and mark boundaries.
 * Atomic objects and unmeasured superscript contexts keep browser layout
 * until their independent native geometry has been established.
 * Miniature samples quantize their original source font before applying their
 * independent drawing scale; fixed intervals already use displayed CSS pixels.
 * @param {HTMLElement} paragraph - Actual attached paragraph or heading.
 * @param {number} [sourceScale=1] - Displayed CSS size divided by original source CSS size.
 * @returns {NativeParagraphLayout|null} Independent native layout or null for an unsupported context.
 * @throws {RangeError} If the independent source drawing scale is invalid.
 * @example
 * const plan=measureNativeParagraph(paragraph); // Fixed zero can have several coincident native baselines.
 */
export function measureNativeParagraph(
  paragraph: HTMLElement,
  sourceScale=1,
): NativeParagraphLayout | null {
  if(!Number.isFinite(sourceScale)||sourceScale<=0)throw new RangeError('Invalid native source drawing scale.');
  /** Rendering requires an actual attached layout tree and a supported source interval. */
  const document = paragraph.ownerDocument,
    window = document.defaultView!,
    spacing = nativeLineSpacing(paragraph.style.lineHeight);
  if (!spacing || paragraph.querySelector("img:not(.ProseMirror-separator),sup,sub"))
    return null;
  /** Detached canvas elements must receive the source language before resolving fallback font metrics. */
  const canvas=document.createElement('canvas');
  canvas.lang=paragraph.closest<HTMLElement>('[lang]')?.lang||document.documentElement.lang;
  /** Existing browser fallback remains available when a platform lacks actual font-box metrics. */
  const context = canvas.getContext("2d");
  if (!context) return null;
  if('lang'in context)(context as CanvasRenderingContext2D&{lang:string}).lang=canvas.lang;
  /** Original paragraph geometry is independent of later native height correction. */
  const bounds = paragraph.getBoundingClientRect(),
    zoom = nativeDocumentZoom(paragraph),
    rootStyle = window.getComputedStyle(paragraph),
    rootSize = parseFloat(rootStyle.fontSize) || 0,
    bidirectional = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u.test(paragraph.textContent || "");
  if(rootStyle.writingMode!=='horizontal-tb')return null;
  if (rootStyle.direction === "rtl") return null;
  /** Original base height and an explicit native interval are kept independently for each line. */
  const lines: NativeVisualLine[] = [
      { fontSize: 0, browserBaseline: null, top: 0, advance: 0, baseline: 0 },
    ],
    ranges: NativeLineRange[] = [];
  /** Grapheme boundaries prevent a rendering wrapper from splitting combining or joined characters. */
  const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" }),
    walker = document.createTreeWalker(
      paragraph,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    );
  let line = lines[0],
    lastLeft = -Infinity;
  while (walker.nextNode()) {
    /** Authored hard breaks create lines even when every baseline later coincides. */
    const node = walker.currentNode;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if((node as Element).tagName==='BR'){
        /** Browser caret geometry at a text-line end can come from its break rather than its last text range. */
        const element=node as HTMLBRElement,style=window.getComputedStyle(element),offset=nativeRelativeShift(element,paragraph);
        context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        /** Auxiliary trailing breaks and authored breaks share real installed-font baseline measurement. */
        const baseline=(element.getBoundingClientRect().top-bounds.top)/zoom+context.measureText('M').fontBoundingBoxAscent-offset.relative;
        if(Number.isFinite(baseline)){
          line.placeholder={element,browserBaseline:baseline};
          line.browserBaseline??=baseline;
        }
      }
      if (
        (node as Element).tagName === "BR" &&
        !(node as Element).classList.contains("ProseMirror-trailingBreak")
      ) {
        line = {
          breakBefore:node as HTMLBRElement,
          fontSize: 0,
          browserBaseline: null,
          top: 0,
          advance: 0,
          baseline: 0,
        };
        lines.push(line);
        lastLeft = -Infinity;
      }
      continue;
    }
    if (!node.textContent || node.parentElement?.closest("[data-forhan-outline-drawing],[data-forhan-hyphen-drawing]")) continue;
    /** Actual run metrics include inherited family, effective native relative size and authored offsets. */
    const text = node as Text,
      parent = text.parentElement!,
      style = window.getComputedStyle(parent),
      size = parseFloat(style.fontSize),
      offset = nativeRelativeShift(parent, paragraph),
      range = document.createRange();
    if (!Number.isFinite(size)) return null;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    for (/** One complete grapheme is measured without changing any text or DOM structure. */
    const part of segmenter.segment(text.data)) {
      range.setStart(text, part.index);
      range.setEnd(text, part.index + part.segment.length);
      /** A generated hyphen can prepend the previous line; the final fragment belongs to the original source grapheme. */
      const fragments=range.getClientRects(),
        rect = fragments[fragments.length-1]||(/^ +$/u.test(part.segment)&&parent.closest('[data-forhan-condense-delta]')?parent.closest('[data-forhan-condense-delta],[data-forhan-line-shift]')?.getBoundingClientRect():null)||range.getBoundingClientRect(),
        font = context.measureText(part.segment),
        ascent = font.fontBoundingBoxAscent;
      if (!Number.isFinite(ascent)) return null;
      /** Existing rendered offsets are removed before actual source line grouping. */
      const baseline =
        (rect.top - bounds.top) / zoom + ascent - offset.relative;
      /** Bidi runs share recovered browser baselines; only LTR source can use a horizontal wrap reset. */
      const reset =
        !bidirectional &&
        rect.left-offset.previousX*zoom < lastLeft - 0.5 * zoom &&
        (parseFloat(style.letterSpacing) || 0) >= 0;
      if (
        line.browserBaseline !== null &&
        (Math.abs(baseline - line.browserBaseline) > 1 || reset)
      ) {
        line = {
          fontSize: 0,
          browserBaseline: null,
          top: 0,
          advance: 0,
          baseline: 0,
        };
        lines.push(line);
      }
      if (line.browserBaseline === null) line.browserBaseline = baseline;
      line.fontSize = Math.max(line.fontSize, nativeLineBaseSize(parent, size));
      /** Contiguous text from one actual browser line needs only one transparent rendering wrapper. */
      const previous = ranges.at(-1),
        index = lines.length - 1;
      if (
        previous?.node === text &&
        previous.line === index &&
        previous.to === part.index
      )
        previous.to = part.index + part.segment.length;
      else
        ranges.push({
          node: text,
          from: part.index,
          to: part.index + part.segment.length,
          shift: offset.previous,
          line: index,
        });
      lastLeft = rect.left-offset.previousX*zoom;
    }
  }
  let height = 0,
    inheritedSize = rootSize;
  for (/** Native intervals advance from one line top to the next, independently of glyph centering. */
  const current of lines) {
    if (!current.fontSize) current.fontSize = inheritedSize;
    inheritedSize = current.fontSize;
    current.top = height;
    current.advance = spacing.fixedPixels??nativeLineAdvance(current.fontSize/sourceScale,spacing)*sourceScale;
    current.baseline = height + nativeLineBaseline(current.fontSize/sourceScale)*sourceScale;
    height += current.advance;
  }
  for (/** Each authored text range receives its entire visual line's common baseline shift. */
  const current of ranges) {
    /** Quantized corrections remain stable across repeated browser layout measurements. */
    const target = lines[current.line],
      shift = target.baseline - (target.browserBaseline ?? target.baseline);
    current.shift =
      Math.abs(shift - current.shift) < LAYOUT_QUANTUM * 2
        ? current.shift
        : Math.round(shift / LAYOUT_QUANTUM) * LAYOUT_QUANTUM;
  }
  return {
    element: paragraph,
    height: Math.round(height / LAYOUT_QUANTUM) * LAYOUT_QUANTUM,
    ranges,
    lines,
  };
}

/**
 * Apply a measured native plan to an owned standalone document DOM.
 *
 * Transparent spans change only drawing positions; paragraph height preserves
 * native flow. Reverse range order retains original text offsets and mark
 * boundaries. Exact style attribute text avoids CSSOM's shortened decimal
 * serialization dropping an otherwise exact browser layout unit on reimport.
 * Live ProseMirror views use decorations instead of this mutation.
 * @param {NativeParagraphLayout} plan - Complete independently measured native geometry.
 * @returns {void} Applies rendering-only spans and the native paragraph height.
 * @example
 * applyNativeParagraph(plan); // Used on an isolated export document, never editor model nodes.
 */
export function applyNativeParagraph(plan: NativeParagraphLayout): void {
  /** Original canonical CSS and exact binary-fraction height must survive markup serialization. */
  const styles = plan.element.getAttribute("style") || "";
  plan.element.setAttribute("style", `${styles};height:${plan.height}px`);
  plan.element.setAttribute("data-forhan-layout-height", String(plan.height));
  for (let index = plan.ranges.length - 1; index >= 0; index--) {
    /** Original text offsets remain valid because later pieces are split first. */
    const part = plan.ranges[index],
      text = part.node.splitText(part.from),
      span = plan.element.ownerDocument.createElement("forhan-line");
    if (part.to - part.from < text.length) text.splitText(part.to - part.from);
    span.setAttribute("data-forhan-line-shift", String(part.shift));
    span.setAttribute("style", `position:relative;top:${part.shift}px`);
    text.parentNode!.replaceChild(span, text);
    span.appendChild(text);
  }
}
