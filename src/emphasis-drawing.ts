import { characterEmphasis, emphasisShape } from "./character-emphasis.ts";
import { nativeDocumentZoom } from "./native-line-layout.ts";
import type { OutlineSelection } from "./outline-drawing.ts";

/** Mark geometry is created locally without interpreting any authored text as markup. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Append native emphasis marks at actual source grapheme positions.
 *
 * One mark belongs to each visible non-space grapheme. Rendering never inserts
 * source text or changes line wrapping, caret positions, selection or history.
 * Side dots and colons sit left of each glyph; below dots remain below it.
 * @param {HTMLElement} paragraph - Actual laid-out source paragraph or preview.
 * @param {SVGSVGElement} svg - Existing owned paragraph drawing layer.
 * @param {OutlineSelection} [selected] - Actual source-selection lookup.
 * @returns {void} Appends inaccessible drawing groups for supported emphasis styles.
 * @throws {RangeError} If explicit native emphasis metadata is invalid.
 * @example
 * drawNativeEmphasis(paragraph,svg); // Spaces retain their original unmarked advance.
 */
export function drawNativeEmphasis(
  paragraph: HTMLElement,
  svg: SVGSVGElement,
  selected?: OutlineSelection,
): void {
  /** Source bounds share the contour layer's paragraph-relative coordinate system. */
  const document = paragraph.ownerDocument,
    window = document.defaultView!,
    box = paragraph.getBoundingClientRect(),
    zoom = nativeDocumentZoom(paragraph),
    paragraphStyle = window.getComputedStyle(paragraph),
    borderX = parseFloat(paragraphStyle.borderLeftWidth) || 0,
    borderY = parseFloat(paragraphStyle.borderTopWidth) || 0,
    context = document.createElement("canvas").getContext("2d"),
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    nodes: Text[] = [],
    segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
  if (!context) return;
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (/** Auxiliary drawing nodes never become authored characters. */ const node of nodes) {
    /** An explicit nested NONE overrides an inherited emphasis preference. */
    const parent = node.parentElement,
      owner = parent?.closest<HTMLElement>("[data-forhan-emphasis]");
    if (
      !parent ||
      !owner ||
      parent.closest('[data-forhan-outline-drawing],[contenteditable="false"]')
    )
      continue;
    /** Unknown legacy codes retain storage without inventing an emphasis drawing. */
    const code = characterEmphasis(owner.dataset.forhanEmphasis);
    if (!code || code > 12) continue;
    /** Real source font metrics determine baseline and physical mark scale. */
    const style = window.getComputedStyle(parent),
      size = parseFloat(style.fontSize),
      range = document.createRange();
    if (!Number.isFinite(size) || size <= 0) continue;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    for (/** Joined characters and combining sequences receive one complete mark. */ const part of segmenter.segment(
      node.data,
    )) {
      if (/^[\s\p{Cc}\p{Cf}]+$/u.test(part.segment)) continue;
      range.setStart(node, part.index);
      range.setEnd(node, part.index + part.segment.length);
      /** Empty or hidden source glyphs cannot request stray drawing marks. */
      const rect = range.getBoundingClientRect(),
        metrics = context.measureText(part.segment),
        ascent = metrics.fontBoundingBoxAscent ?? size * 0.8,
        descent = metrics.fontBoundingBoxDescent ?? size * 0.2,
        baseline =
          (rect.top - box.top) / zoom -
          borderY +
          Math.max(0, (rect.height / zoom - ascent - descent) / 2) +
          ascent,
        side = code === 5 || code === 6,
        x =
          (side
            ? rect.left - box.left
            : (rect.left + rect.right) / 2 - box.left) /
            zoom -
          borderX -
          (side ? size * 0.07 : 0),
        y = baseline + size * (side ? -0.34 : code === 12 ? 0.28 : -1.02),
        group = document.createElementNS(SVG_NAMESPACE, "g");
      if (rect.width <= 0 || !Number.isFinite(baseline)) continue;
      group.setAttribute("transform", `translate(${x} ${y}) scale(${size})`);
      group.setAttribute("data-emphasis-kind", String(code));
      group.style.color = selected?.(
        node,
        part.index,
        part.index + part.segment.length,
      )
        ? "#ffffff"
        : style.color;
      group.setAttribute("fill", "currentColor");
      group.innerHTML = emphasisShape(code);
      svg.appendChild(group);
    }
  }
}
