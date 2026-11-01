import { characterOutline, OUTLINE_DASHES } from "./character-outline.ts";
import { characterShadowCss, readCharacterShadow } from "./character-shadow.ts";
import { nativeDocumentZoom } from "./native-line-layout.ts";
import { drawNativeEmphasis } from "./emphasis-drawing.ts";
import { drawNativeWidths } from "./width-drawing.ts";
import { drawContextualWidths } from './contextual-width-drawing.ts';

/** SVG nodes are created directly, so authored text never becomes parsed markup. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** One actual source fragment fits a visual line, word and selection color. */
interface OutlineFragment {
  node: Text;
  from: number;
  to: number;
  top: number;
  selected: boolean;
}

/** Source-position lookup is supplied only by the live editor; static export has no selection. */
export type OutlineSelection = (
  node: Text,
  from: number,
  to: number,
) => boolean;

/**
 * Paint real native outline contours using the original text's measured line fragments.
 *
 * SVG text shares the host's installed fonts and actual source positions. Words
 * and soft lines are measured separately so native spaces and justification do
 * not become arbitrary glyph stretching. The source text remains editable and
 * selectable; this owned, inaccessible drawing layer never changes its model.
 * @param {HTMLElement} paragraph - Actual laid-out paragraph, heading or preview sample.
 * @param {SVGSVGElement} svg - Owned drawing-only SVG attached to this paragraph.
 * @param {OutlineSelection} [selected] - Live source-selection lookup when available.
 * @returns {void} Replaces only drawing nodes with safe font-contour SVG text.
 * @throws {RangeError|SyntaxError} If explicit native source metadata is invalid.
 * @example
 * drawNativeOutline(paragraph,svg); // Dotted strokes follow glyph contours over source shading.
 */
export function drawNativeOutline(
  paragraph: HTMLElement,
  svg: SVGSVGElement,
  selected?: OutlineSelection,
): void {
  /** Source geometry and font metrics are read before replacing the previous contour layer. */
  const document = paragraph.ownerDocument,
    window = document.defaultView!,
    context = document.createElement("canvas").getContext("2d"),
    zoom = nativeDocumentZoom(paragraph),
    box = paragraph.getBoundingClientRect(),
    paragraphStyle = window.getComputedStyle(paragraph),
    leftBorder = parseFloat(paragraphStyle.borderLeftWidth) || 0,
    topBorder = parseFloat(paragraphStyle.borderTopWidth) || 0,
    width = Math.max(
      1,
      box.width / zoom -
        leftBorder -
        (parseFloat(paragraphStyle.borderRightWidth) || 0),
    ),
    height = Math.max(
      1,
      box.height / zoom -
        topBorder -
        (parseFloat(paragraphStyle.borderBottomWidth) || 0),
    ),
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    nodes: Text[] = [],
    output = document.createDocumentFragment(),
    segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
  if (!context) return;
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  for (/** Auxiliary drawing text is never reinterpreted as authored source. */ const node of nodes) {
    /** The nearest source owner permits an explicit NONE override inside inherited markup. */
    const parent = node.parentElement,
      owner = parent?.closest<HTMLElement>("[data-forhan-outline]");
    if (
      !parent ||
      !owner ||
      parent.closest('[data-forhan-outline-drawing],[contenteditable="false"],[data-forhan-width-ratio],[data-forhan-context-source]')
    )
      continue;
    /** Fixed native codes remain separate from actual inherited font and foreground values. */
    const code = characterOutline(owner.dataset.forhanOutline);
    if (!code || code === 7) continue;
    /** Styles come from the real leaf, including script fonts, relative size and authored tracking. */
    const style = window.getComputedStyle(parent),
      range = document.createRange();
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (style.fontKerning === "none" || style.fontKerning === "normal")
      context.fontKerning = style.fontKerning;
    let current: OutlineFragment | null = null;
    /**
     * Append one source word fragment as a genuine dashed or solid glyph contour.
     *
     * Length adjustment changes spacing only, retaining the actual font's glyph
     * shapes. Foreground, shadow and selection colors remain independent.
     * @param {OutlineFragment} fragment - Actual contiguous source interval on one visual line.
     * @returns {void} Adds one inaccessible, drawing-only SVG text element.
     * @example
     * // Soft wrapping produces separate measured fragments without duplicate source text.
     */
    function paint(fragment: OutlineFragment): void {
      range.setStart(node, fragment.from);
      range.setEnd(node, fragment.to);
      /** Real glyph logical boxes retain authored offsets and native line corrections. */
      const rect = range.getBoundingClientRect(),
        text = node.data.slice(fragment.from, fragment.to),
        metrics = context!.measureText(text),
        size = parseFloat(style.fontSize),
        ascent = metrics.fontBoundingBoxAscent ?? size * 0.8,
        descent = metrics.fontBoundingBoxDescent ?? size * 0.2,
        baseline =
          (rect.top - box.top) / zoom -
          topBorder +
          Math.max(0, (rect.height / zoom - ascent - descent) / 2) +
          ascent,
        element = document.createElementNS(SVG_NAMESPACE, "text"),
        color = fragment.selected ? "#ffffff" : style.color,
        shadow = readCharacterShadow(parent!);
      if (rect.width <= 0 || !Number.isFinite(baseline) || size <= 0) return;
      element.textContent = text;
      element.setAttribute(
        "x",
        String(
          ((style.direction === "rtl" ? rect.right : rect.left) - box.left) /
            zoom -
            leftBorder,
        ),
      );
      element.setAttribute("y", String(baseline));
      element.setAttribute("fill", "none");
      element.setAttribute("stroke", color);
      element.setAttribute("stroke-width", String(code === 3 ? 2 : 1));
      element.setAttribute("stroke-linejoin", "round");
      if (OUTLINE_DASHES[code])
        element.setAttribute("stroke-dasharray", OUTLINE_DASHES[code]);
      element.setAttribute("textLength", String(rect.width / zoom));
      element.setAttribute("lengthAdjust", "spacing");
      element.setAttribute("data-outline-kind", String(code));
      element.style.fontFamily = style.fontFamily;
      element.style.fontSize = style.fontSize;
      element.style.fontWeight = style.fontWeight;
      element.style.fontStyle = style.fontStyle;
      element.style.fontStretch = style.fontStretch;
      element.style.fontKerning = style.fontKerning;
      element.style.fontFeatureSettings = style.fontFeatureSettings;
      element.style.fontVariationSettings = style.fontVariationSettings;
      element.style.fontSynthesis = "none";
      element.style.letterSpacing = style.letterSpacing;
      element.style.wordSpacing = style.wordSpacing;
      element.style.whiteSpace = "pre";
      element.style.direction = style.direction;
      element.style.textTransform = style.textTransform;
      element.style.webkitTextFillColor = "initial";
      element.style.webkitTextStrokeWidth = "0";
      element.style.textShadow =
        fragment.selected || !shadow
          ? "none"
          : characterShadowCss({
              fontSize:
                owner!.dataset.forhanBaseFontSize ||
                owner!.style.fontSize ||
                style.fontSize,
              nativeShadowType: shadow.type,
              nativeShadowOffsetX: shadow.x,
              nativeShadowOffsetY: shadow.y,
              nativeShadowColor: shadow.color,
            });
      output.appendChild(element);
    }
    for (/** Grapheme boundaries preserve combining sequences, supplementary scalars and joined emoji. */ const part of segmenter.segment(
      node.data,
    )) {
      if (/\s/u.test(part.segment)) {
        if (current) paint(current);
        current = null;
        continue;
      }
      range.setStart(node, part.index);
      range.setEnd(node, part.index + part.segment.length);
      /** Selection and visual line changes split drawing only, never the source model. */
      const rect = range.getBoundingClientRect(),
        isSelected =
          selected?.(node, part.index, part.index + part.segment.length) ??
          false;
      if (
        current &&
        (Math.abs(current.top - rect.top) > 0.5 ||
          current.selected !== isSelected)
      ) {
        paint(current);
        current = null;
      }
      if (!current)
        current = {
          node,
          from: part.index,
          to: part.index + part.segment.length,
          top: rect.top,
          selected: isSelected,
        };
      else current.to = part.index + part.segment.length;
    }
    if (current) paint(current);
  }
  svg.replaceChildren(output);
  drawNativeWidths(paragraph,svg,selected);
  drawContextualWidths(paragraph,svg,selected);
  drawNativeEmphasis(paragraph, svg, selected);
  paragraph.classList.toggle("forhan-outline-ready", !!svg.childNodes.length);
}

/**
 * Create an owned inaccessible SVG layer without inserting foreign markup.
 *
 * Absolute positioning preserves source line breaks, paragraph height and caret
 * geometry. Overflow permits original glyph contours and shadows beyond a line box.
 * @param {Document} document - Owning live or isolated export document.
 * @returns {SVGSVGElement} Empty drawing layer ready for measured source contours.
 * @example
 * const svg=createOutlineLayer(paragraph.ownerDocument);
 */
export function createOutlineLayer(document: Document): SVGSVGElement {
  /** The same ownership marker excludes generated text from source measurement and reimport. */
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.dataset.forhanOutlineDrawing = "";
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("contenteditable", "false");
  svg.setAttribute("focusable", "false");
  svg.style.cssText =
    "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;user-select:none;z-index:1";
  return svg;
}

/**
 * Materialize native font-contour drawing in a static HTML or print document.
 *
 * Each source paragraph owns its own coordinate system, so body margins and
 * print padding cannot displace its drawings. Generated SVG is removed before
 * any rich HTML reimport and never replaces the original selectable source text.
 * @param {HTMLElement} root - Fully laid-out source export root or preview container.
 * @returns {void} Adds or refreshes only owned static contour layers.
 * @throws {RangeError|SyntaxError} If explicit native outline or shadow metadata is malformed.
 * @example
 * applyNativeOutlines(output.body); // Run after source space and line layout are settled.
 */
export function applyNativeOutlines(root: HTMLElement): void {
  for (/** Preview samples and authored paragraph blocks use the same safe drawing path. */ const paragraph of root.matches(
    "p,h1,h2,h3,h4,h5,h6,.nd-character-sample",
  )
    ? [root]
    : root.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6")) {
    if (
      !paragraph.querySelector(
        '[data-forhan-outline]:not([data-forhan-outline="0"])',
      ) &&
      !paragraph.matches('[data-forhan-outline]:not([data-forhan-outline="0"])') &&
      !paragraph.querySelector('[data-forhan-emphasis]:not([data-forhan-emphasis="0"])') &&
      !paragraph.matches('[data-forhan-emphasis]:not([data-forhan-emphasis="0"])') &&
      !paragraph.querySelector('[data-forhan-width-ratio],[data-forhan-context-ratio]')
    )
      continue;
    paragraph.classList.add("forhan-outline-container");
    /** Existing owned layers are refreshed rather than accumulating duplicate SVG source text. */
    const svg =
      paragraph.querySelector<SVGSVGElement>(
        ":scope > svg[data-forhan-outline-drawing]",
      ) || paragraph.appendChild(createOutlineLayer(paragraph.ownerDocument));
    drawNativeOutline(paragraph, svg);
  }
}
