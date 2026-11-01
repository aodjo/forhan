import { measureNativeWidths } from "./character-width.ts";
import { nativeDocumentZoom } from "./native-line-layout.ts";
import { characterOutline, OUTLINE_DASHES } from "./character-outline.ts";
import { characterShadowCss, readCharacterShadow } from "./character-shadow.ts";
import type { OutlineSelection } from "./outline-drawing.ts";

/** Width drawing uses native SVG nodes without interpreting authored text as markup. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Draw horizontally scaled glyphs at their actual original source positions.
 *
 * Logical inline advances drive browser wrapping and caret geometry. Drawing
 * scales only the glyph's x axis, so source font height, baseline and paragraph
 * metrics stay unchanged. Native outlines, foreground and shadows coexist.
 * @param {HTMLElement} paragraph - Actual source paragraph, heading or preview.
 * @param {SVGSVGElement} svg - Existing owned paragraph-relative drawing layer.
 * @param {OutlineSelection} [selected] - Actual source selection lookup.
 * @returns {void} Appends inaccessible glyph drawings without changing source text.
 * @throws {RangeError|SyntaxError} If explicit native source metadata is invalid.
 * @example
 * drawNativeWidths(paragraph,svg); // Fifty-percent width retains the same font height.
 */
export function drawNativeWidths(
  paragraph: HTMLElement,
  svg: SVGSVGElement,
  selected?: OutlineSelection,
): void {
  /** Measured glyphs and outlines share one real paragraph coordinate system. */
  const document = paragraph.ownerDocument,
    window = document.defaultView!,
    context = document.createElement("canvas").getContext("2d"),
    box = paragraph.getBoundingClientRect(),
    zoom = nativeDocumentZoom(paragraph),
    paragraphStyle = window.getComputedStyle(paragraph),
    borderX = parseFloat(paragraphStyle.borderLeftWidth) || 0,
    borderY = parseFloat(paragraphStyle.borderTopWidth) || 0;
  if (!context) return;
  for (/** Complete original graphemes retain their original editable source ranges. */ const glyph of measureNativeWidths(
    paragraph,
  )) {
    /** Source controls and original drawing fields remain separate from correction wrappers. */
    const parent = glyph.node.parentElement!,
      style = window.getComputedStyle(parent),
      range = document.createRange(),
      ratio = glyph.ratio / 100,
      owner = parent.closest<HTMLElement>("[data-forhan-character-metrics]")!,
      outlineOwner = parent.closest<HTMLElement>("[data-forhan-outline]"),
      code = characterOutline(outlineOwner?.dataset.forhanOutline),
      outlined = code > 0 && code < 7;
    if (ratio <= 0) {
      /** Native zero width is retained without exposing the unscaled fallback glyph. */
      const empty = document.createElementNS(SVG_NAMESPACE, "g");
      empty.setAttribute("data-width-ratio", "0");
      svg.appendChild(empty);
      continue;
    }
    range.setStart(glyph.node, glyph.from);
    range.setEnd(glyph.endNode, glyph.to);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    /** Real source boxes include native line offsets, wrapping and relative character height. */
    const rect = range.getBoundingClientRect(),
      metrics = context.measureText(glyph.text),
      size = parseFloat(style.fontSize),
      ascent = metrics.fontBoundingBoxAscent ?? size * 0.8,
      descent = metrics.fontBoundingBoxDescent ?? size * 0.2,
      baseline =
        (rect.top - box.top) / zoom -
        borderY +
        Math.max(0, (rect.height / zoom - ascent - descent) / 2) +
        ascent,
      x =
        (rect.left - box.left) / zoom - borderX +
        (glyph.direction === "rtl" ? glyph.intrinsic * ratio : 0),
      element = document.createElementNS(SVG_NAMESPACE, "text"),
      isSelected =
        selected?.(
          glyph.node,
          glyph.from,
          glyph.node === glyph.endNode ? glyph.to : glyph.node.length,
        ) ?? false,
      color = isSelected ? "#ffffff" : style.color,
      shadow = readCharacterShadow(parent);
    if (!Number.isFinite(baseline) || size <= 0) continue;
    element.textContent = glyph.text;
    element.setAttribute(
      "transform",
      `translate(${x} ${baseline}) scale(${ratio} 1)`,
    );
    element.setAttribute("x", "0");
    element.setAttribute("y", "0");
    element.setAttribute("direction", glyph.direction);
    element.setAttribute("text-anchor", "start");
    element.style.unicodeBidi = "isolate";
    element.setAttribute("data-width-ratio", String(glyph.ratio));
    element.setAttribute("fill", outlined ? "none" : color);
    if (outlined) {
      element.setAttribute("data-outline-kind", String(code));
      element.setAttribute("stroke", color);
      element.setAttribute("stroke-width", String(code === 3 ? 2 : 1));
      element.setAttribute("stroke-linejoin", "round");
      element.setAttribute("vector-effect", "non-scaling-stroke");
      if (OUTLINE_DASHES[code])
        element.setAttribute("stroke-dasharray", OUTLINE_DASHES[code]);
    }
    element.style.fontFamily = style.fontFamily;
    element.style.fontSize = style.fontSize;
    element.style.fontWeight = style.fontWeight;
    element.style.fontStyle = style.fontStyle;
    element.style.fontStretch = style.fontStretch;
    element.style.fontSynthesis = "none";
    element.style.fontKerning = "none";
    element.style.fontVariantLigatures = "none";
    element.style.letterSpacing = "0";
    element.style.wordSpacing = "0";
    element.style.whiteSpace = "pre";
    element.style.webkitTextFillColor = "initial";
    element.style.webkitTextStrokeWidth = "0";
    element.style.textShadow =
      isSelected || !shadow
        ? "none"
        : characterShadowCss(
            {
              fontSize:
                owner.dataset.forhanBaseFontSize ||
                owner.style.fontSize ||
                style.fontSize,
              nativeShadowType: shadow.type,
              nativeShadowOffsetX: shadow.x,
              nativeShadowOffsetY: shadow.y,
              nativeShadowColor: shadow.color,
            },
            ratio,
          );
    svg.appendChild(element);
  }
}
