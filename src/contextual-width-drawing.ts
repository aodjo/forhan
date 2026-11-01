import {
  measureContextualWidths,
  contextualSourceRange,
} from "./contextual-width.ts";
import { nativeDocumentZoom } from "./native-line-layout.ts";
import { characterOutline, OUTLINE_DASHES } from "./character-outline.ts";
import { characterShadowCss, readCharacterShadow } from "./character-shadow.ts";
import type { OutlineSelection } from "./outline-drawing.ts";
import { storedFontSizePoints } from "./formatting.ts";

/** Coherent contextual glyphs remain inaccessible native SVG text, never authored markup. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Weakly owned drawing identities keep document-wide SVG references unique without retaining destroyed views. */
const CONTEXT_DRAWING_IDENTITIES = new WeakMap<SVGSVGElement, number>();

/** Monotonic generated drawing identity never becomes an authored source value. */
let contextDrawingSequence = 0;

/**
 * Draw complete contextual words with native horizontal ratios and original source geometry.
 *
 * A coherent SVG text node preserves contextual forms and required ligatures.
 * Source ranges already use the same horizontal transform, so native caret and
 * selection geometry follow original logical text. Partial selection clips a
 * second coherent drawing instead of shaping independently selected fragments.
 * @param {HTMLElement} paragraph - Actual source paragraph or owned static copy.
 * @param {SVGSVGElement} svg - Existing inaccessible paragraph-relative drawing layer.
 * @param {OutlineSelection} [selected] - Actual original-source selection lookup.
 * @returns {void} Appends coherent width/outline/shadow drawings without changing source.
 * @throws {RangeError|SyntaxError} If explicit native source effects or measurements are malformed.
 * @example
 * drawContextualWidths(paragraph,svg,selected); // Lam-alef is never reshaped as isolated selected letters.
 */
export function drawContextualWidths(
  paragraph: HTMLElement,
  svg: SVGSVGElement,
  selected?: OutlineSelection,
): void {
  /** Original source and coherent drawing share one physical paragraph coordinate system. */
  const document = paragraph.ownerDocument,
    window = document.defaultView!,
    canvas = document.createElement("canvas").getContext("2d"),
    bounds = paragraph.getBoundingClientRect(),
    zoom = nativeDocumentZoom(paragraph),
    paragraphStyle = window.getComputedStyle(paragraph),
    borderX = parseFloat(paragraphStyle.borderLeftWidth) || 0,
    borderY = parseFloat(paragraphStyle.borderTopWidth) || 0;
  if (!canvas) return;
  let ownerIdentity = CONTEXT_DRAWING_IDENTITIES.get(svg);
  if (ownerIdentity === undefined) {
    ownerIdentity = ++contextDrawingSequence;
    CONTEXT_DRAWING_IDENTITIES.set(svg, ownerIdentity);
  }
  for (/** Each source word retains its complete original shaping context and native effects. */
  const word of measureContextualWidths(paragraph)) {
    if (!word.node.parentElement?.closest("[data-forhan-context-source]"))
      continue;
    if (!(word.ratio > 0)) {
      /** An explicit empty drawing keeps native zero-width source hidden without exposing its unscaled fallback. */
      const empty = document.createElementNS(SVG_NAMESPACE, "g");
      empty.setAttribute("data-context-width", "0");
      svg.appendChild(empty);
      continue;
    }
    /** Real original range rectangles already include source horizontal scaling and native baseline shifts. */
    const parent = word.node.parentElement!,
      style = window.getComputedStyle(parent),
      range = contextualSourceRange(
        word,
        0,
        word.parts[0].to - word.parts[0].from,
      ),
      owner = parent.closest<HTMLElement>("[data-forhan-character-metrics]")!,
      ratio = word.ratio / 100,
      code = characterOutline(
        parent.closest<HTMLElement>("[data-forhan-outline]")?.dataset
          .forhanOutline,
      ),
      outlined = code > 0 && code < 7;
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    /** One genuine text fragment recovers the glyph baseline without including intervening anonymous table border boxes. */
    const rect = range.getBoundingClientRect(),
      metric = canvas.measureText(word.text),
      size = parseFloat(style.fontSize),
      ascent = metric.fontBoundingBoxAscent,
      descent = metric.fontBoundingBoxDescent,
      baseline =
        (rect.top - bounds.top) / zoom -
        borderY +
        Math.max(0, (rect.height / zoom - ascent - descent) / 2) +
        ascent,
      firstBox = word.parts[0].node
        .parentElement!.closest<HTMLElement>("[data-forhan-context-ratio]")!
        .getBoundingClientRect(),
      lastBox = word.parts[word.parts.length - 1].node
        .parentElement!.closest<HTMLElement>("[data-forhan-context-ratio]")!
        .getBoundingClientRect(),
      x =
        ((word.direction === "rtl"
          ? Math.max(firstBox.right, lastBox.right)
          : Math.min(firstBox.left, lastBox.left)) -
          bounds.left) /
          zoom -
        borderX,
      text = document.createElementNS(SVG_NAMESPACE, "text"),
      shadow = readCharacterShadow(parent);
    if (!(size > 0) || !Number.isFinite(baseline)) continue;
    text.textContent = word.text;
    text.setAttribute(
      "transform",
      `translate(${x} ${baseline}) scale(${ratio} 1)`,
    );
    text.setAttribute("x", "0");
    text.setAttribute("y", "0");
    text.setAttribute("direction", word.direction);
    text.setAttribute("text-anchor", "start");
    text.setAttribute("data-context-width", String(word.ratio));
    if (word.dx.length) text.setAttribute("dx", word.dx.join(" "));
    text.setAttribute("fill", outlined ? "none" : style.color);
    if (outlined) {
      text.setAttribute("data-outline-kind", String(code));
      text.setAttribute("stroke", style.color);
      text.setAttribute("stroke-width", String(code === 3 ? 2 : 1));
      text.setAttribute("stroke-linejoin", "round");
      text.setAttribute("vector-effect", "non-scaling-stroke");
      if (OUTLINE_DASHES[code])
        text.setAttribute("stroke-dasharray", OUTLINE_DASHES[code]);
    }
    text.style.fontFamily = style.fontFamily;
    text.style.fontSize = style.fontSize;
    text.style.fontWeight = style.fontWeight;
    text.style.fontStyle = style.fontStyle;
    text.style.fontStretch = style.fontStretch;
    text.style.fontSynthesis = "none";
    text.style.fontKerning = word.kerning ? "normal" : "none";
    text.style.fontVariantLigatures = "normal";
    text.style.letterSpacing = "0";
    text.style.wordSpacing = "0";
    text.style.whiteSpace = "pre";
    text.style.unicodeBidi = "isolate";
    text.style.webkitTextFillColor = "initial";
    text.style.webkitTextStrokeWidth = "0";
    text.style.textShadow = shadow
      ? characterShadowCss(
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
        )
      : "none";
    /** Complete original graphemes choose selection clips without splitting shaping contexts. */
    const selections: DOMRect[] = [],
      segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
    let count = 0;
    for (/** Original UTF-16 positions remain authoritative for every selection lookup. */
    const part of segments.segment(word.text)) {
      count++;
      let active = false;
      for (/** Every original source fragment contributes selection without splitting the coherent glyph drawing. */ const source of word.parts) {
        /** A grapheme's true original logical interval can span transparent tracking containers. */
        const from = Math.max(part.index, source.start),
          to = Math.min(
            part.index + part.segment.length,
            source.start + source.to - source.from,
          );
        if (
          from < to &&
          selected?.(
            source.node,
            source.from + from - source.start,
            source.from + to - source.start,
          )
        )
          active = true;
      }
      if (!active) continue;
      selections.push(
        contextualSourceRange(
          word,
          part.index,
          part.index + part.segment.length,
        ).getBoundingClientRect(),
      );
    }
    if (!selections.length) {
      svg.appendChild(text);
      continue;
    }
    /** A selected copy keeps the same complete glyph context and suppresses only its shadow/color. */
    const highlighted = text.cloneNode(true) as SVGTextElement;
    highlighted.setAttribute("fill", outlined ? "none" : "#ffffff");
    if (outlined) highlighted.setAttribute("stroke", "#ffffff");
    highlighted.style.textShadow = "none";
    if (selections.length === count) {
      svg.appendChild(highlighted);
      continue;
    }
    /** Paragraph-local masks keep unselected contours and shadows outside the actual source selection. */
    const identity = `context-${ownerIdentity}-${svg.childElementCount}`,
      definitions = document.createElementNS(SVG_NAMESPACE, "defs"),
      mask = document.createElementNS(SVG_NAMESPACE, "mask"),
      clip = document.createElementNS(SVG_NAMESPACE, "clipPath"),
      background = document.createElementNS(SVG_NAMESPACE, "rect"),
      normal = document.createElementNS(SVG_NAMESPACE, "g"),
      overlay = document.createElementNS(SVG_NAMESPACE, "g");
    /** Real paragraph and source extents retain unselected ink even beyond a fixed viewport-sized mask. */
    const padding =
        4 *
        Math.max(
          size,
          (storedFontSizePoints(
            owner.dataset.forhanBaseFontSize ||
              owner.style.fontSize ||
              style.fontSize,
          ) *
            4) /
            3,
        ),
      maskLeft =
        Math.min(0, (rect.left - bounds.left) / zoom - borderX) - padding,
      maskTop = Math.min(0, (rect.top - bounds.top) / zoom - borderY) - padding,
      maskRight =
        Math.max(
          bounds.width / zoom,
          (rect.right - bounds.left) / zoom - borderX,
        ) + padding,
      maskBottom =
        Math.max(
          bounds.height / zoom,
          (rect.bottom - bounds.top) / zoom - borderY,
        ) + padding;
    mask.setAttribute("id", identity + "-normal");
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.style.maskType = "luminance";
    for (/** The mask and its literal white background share original paragraph coordinates. */
    const element of [mask, background]) {
      element.setAttribute("x", String(maskLeft));
      element.setAttribute("y", String(maskTop));
      element.setAttribute("width", String(maskRight - maskLeft));
      element.setAttribute("height", String(maskBottom - maskTop));
    }
    background.setAttribute("fill", "#ffffff");
    mask.appendChild(background);
    clip.setAttribute("id", identity + "-selected");
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    for (/** Actual editable source rectangles control both normal-shadow exclusion and selected foreground. */
    const selection of selections) {
      /** Selection bounds remain in the original paragraph frame before the text's own transform. */
      const selectedBox = document.createElementNS(SVG_NAMESPACE, "rect");
      selectedBox.setAttribute(
        "x",
        String((selection.left - bounds.left) / zoom - borderX),
      );
      selectedBox.setAttribute(
        "y",
        String((selection.top - bounds.top) / zoom - borderY),
      );
      selectedBox.setAttribute("width", String(selection.width / zoom));
      selectedBox.setAttribute("height", String(selection.height / zoom));
      selectedBox.setAttribute("fill", "#000000");
      mask.appendChild(selectedBox);
      clip.appendChild(selectedBox.cloneNode(true));
    }
    definitions.append(mask, clip);
    normal.setAttribute("mask", `url(#${identity}-normal)`);
    normal.appendChild(text);
    overlay.setAttribute("clip-path", `url(#${identity}-selected)`);
    overlay.appendChild(highlighted);
    svg.append(definitions, normal, overlay);
  }
}
