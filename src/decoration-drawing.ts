import { characterDecoration, nativeLineSvg } from "./character-decorations.ts";

/**
 * Build complex native line layers inside all character-color and shading marks.
 *
 * Ordinary CSS decorations paint through descendants automatically. Compound
 * native patterns need innermost layers so opaque source shading cannot hide
 * them. Source lines retain independent colors, positions and ordinary text.
 * @param {ReadonlyArray<{type:string;attrs?:Record<string,unknown>}>} marks - Original semantic line marks.
 * @param {string} [foreground='#000000'] - Real foreground for an implicit underline color.
 * @returns {string} Trusted repeated SVG drawing CSS, or empty text for common patterns.
 * @throws {RangeError} If a native pattern or source color is invalid.
 * @example
 * decorationDrawingStyle([{type:'underline',attrs:{nativePattern:10,nativeColor:'#123456'}}]);
 */
export function decorationDrawingStyle(
  marks: ReadonlyArray<{ type: string; attrs?: Record<string, unknown> }>,
  foreground = "#000000",
): string {
  /** Independent native lines contribute separate layers rather than overwriting one another. */
  const images: string[] = [],
    positions: string[] = [];
  for (/** Canonical source order keeps editor and DOM-export layers identical. */ const kind of [
    "underline",
    "strike",
  ] as const)
    for (/** Only semantic native source lines contribute drawing definitions. */ const mark of marks) {
      if (mark.type !== kind) continue;
      if (mark.type !== "underline" && mark.type !== "strike") continue;
      /** Explicit line color remains independent of the text crossed by the line. */
      const source = characterDecoration(mark.attrs, mark.type);
      if ([0, 1, 2, 7, 11].includes(source.nativePattern)) continue;
      images.push(
        `url("data:image/svg+xml,${encodeURIComponent(nativeLineSvg(source.nativePattern, source.nativeColor || (mark.type === "strike" ? "#000000" : foreground)))}")`,
      );
      positions.push(
        mark.type === "strike" || source.nativePosition === "CENTER"
          ? "left center"
          : source.nativePosition === "TOP"
            ? "left top"
            : "left bottom",
      );
    }
  return images.length
    ? `background-image:${images.join(",")};background-position:${positions.join(",")};background-repeat:repeat-x;background-size:16px 8px;box-decoration-break:clone`
    : "";
}

/**
 * Apply the same compound-line drawing to an owned static HTML or preview copy.
 *
 * Drawing elements sit inside source shading and never enter native source
 * serialization. Repeated calls skip existing owned drawing wrappers.
 * @param {HTMLElement} root - Owned export body or local character preview.
 * @returns {void} Adds innermost original SVG pattern layers where needed.
 * @throws {RangeError} If explicit native line properties are invalid.
 * @example
 * applyNativeDecorations(output.body); // Runs before measuring spaces and line geometry.
 */
export function applyNativeDecorations(root: HTMLElement): void {
  /** Snapshot text nodes before adding drawing wrappers to avoid revisiting inserted content. */
  const document = root.ownerDocument,
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (/** Semantic and rendering-only inline wrappers retain actual original source characters. */ const node of nodes) {
    if (
      !node.data ||
      node.parentElement?.closest('forhan-decoration,[contenteditable="false"]')
    )
      continue;
    /** Native source owners remain distinct from their innermost drawing layers. */
    const marks: { type: string; attrs: Record<string, unknown> }[] = [];
    for (
      let ancestor = node.parentElement;
      ancestor && ancestor !== root.parentElement;
      ancestor = ancestor.parentElement
    )
      if (ancestor.dataset.forhanDecoration)
        marks.push({
          type: ancestor.dataset.forhanDecoration,
          attrs: {
            nativePosition: ancestor.dataset.forhanLinePosition,
            nativePattern: Number(ancestor.dataset.forhanLinePattern),
            nativeColor: ancestor.dataset.forhanLineColor,
          },
        });
    /** Actual inherited text color resolves otherwise implicit underline colors. */
    const style = decorationDrawingStyle(
      marks,
      document.defaultView!.getComputedStyle(node.parentElement!).color,
    );
    if (!style) continue;
    /** Custom inline tags are ignored as source marks on a later rich import. */
    const wrapper = document.createElement("forhan-decoration");
    wrapper.dataset.forhanDecorationDrawing = "";
    wrapper.setAttribute("style", style);
    node.parentNode!.replaceChild(wrapper, node);
    wrapper.appendChild(node);
  }
}
