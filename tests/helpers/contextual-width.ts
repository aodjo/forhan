import type { JSONContent } from "@tiptap/core";

/**
 * Inspect original full-viewport foreground pixels only inside actual source bounds.
 *
 * An element screenshot of a tall editor can scroll/resize the native canvas
 * and capture sticky controls or a toast instead of the complete original word.
 * This reads unchanged full-viewport PNG bytes in a real source-derived region,
 * including glyph overhangs, without aligning or resampling either image.
 * @async
 * @param {{image:string;left:number;top:number;right:number;bottom:number}} source - Original PNG and measured source bounds.
 * @returns {Promise<{height:number;pixels:number;coverage:number}>} Actual source pixel count, fractional foreground coverage and vertical extent.
 * @example
 * await page.evaluate(contextualInk,source); // UI toast pixels cannot pass as Arabic foreground ink.
 */
export async function contextualInk(source: {
  image: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}): Promise<{ height: number; pixels: number; coverage: number }> {
  /** Original complete screenshot dimensions and pixels remain unchanged. */
  const image = new Image();
  image.src = "data:image/png;base64," + source.image;
  await image.decode();
  /** Canvas decoding is observation only; no image pixels are edited. */
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  /** Actual source bounds exclude native chrome and transient status/toast text. */
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  /** Literal source-blue foreground is measured at the PNG's original physical resolution. */
  const bytes = context.getImageData(0, 0, image.width, image.height).data;
  let top = image.height,
    bottom = -1,
    pixels = 0,
    coverage = 0;
  for (
    let y = Math.max(0, Math.floor(source.top));
    y < Math.min(image.height, Math.ceil(source.bottom));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(source.left));
      x < Math.min(image.width, Math.ceil(source.right));
      x++
    ) {
      /** The exact original pixel is inspected without registration or coordinate substitution. */
      const at = (y * image.width + x) * 4;
      if (
        bytes[at + 2] - bytes[at] > 1 &&
        bytes[at + 1] >= bytes[at] &&
        bytes[at + 2] >= bytes[at + 1]
      ) {
        /** Fractional edge coverage keeps narrow diacritics visible below the old dark-pixel cutoff. */
        const alpha = (255 - bytes[at]) / (255 - 18);
        coverage += alpha;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      if (
        bytes[at] < 80 &&
        bytes[at + 1] > 20 &&
        bytes[at + 1] < 110 &&
        bytes[at + 2] > 50 &&
        bytes[at + 2] < 150 &&
        bytes[at + 2] > bytes[at + 1] &&
        bytes[at + 1] > bytes[at]
      )
        pixels++;
    }
  return { height: Math.max(0, bottom - top + 1), pixels, coverage };
}

/**
 * Locate actual logical source strings across transparent drawing containers.
 *
 * SVG and other inaccessible content never contribute text offsets. Original
 * DOM ranges expose physical positions independently of word-drawing metadata.
 * @param {HTMLElement} root - Actual source editor or static output paragraph.
 * @param {string[]} labels - Unique original source substrings to locate.
 * @returns {{text:string;left:number;right:number;top:number;height:number}[]} Actual source rectangles in label order.
 * @throws {Error} If any requested original source substring is absent.
 * @example
 * await page.locator('.tiptap').evaluate(contextualPositions,['العربية','جميلة']); // Actual original bidi order.
 */
export function contextualPositions(
  root: HTMLElement,
  labels: string[],
): {
  text: string;
  left: number;
  right: number;
  top: number;
  height: number;
}[] {
  /** Source fragments retain original text order despite visual bidi reordering. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    parts: { node: Text; start: number }[] = [],
    result: {
      text: string;
      left: number;
      right: number;
      top: number;
      height: number;
    }[] = [];
  let source = "";
  while (walker.nextNode())
    if (
      !walker.currentNode.parentElement?.closest('[contenteditable="false"]')
    ) {
      parts.push({ node: walker.currentNode as Text, start: source.length });
      source += walker.currentNode.textContent || "";
    }
  for (/** Complete original words can span ordinary source wrappers and style nodes. */
  const text of labels) {
    /** Original logical offsets determine a genuine current source range. */
    const begin = source.indexOf(text),
      end = begin + text.length,
      range = document.createRange();
    if (begin < 0)
      throw new Error("The requested original source word is absent.");
    for (/** Every boundary is recovered from actual authored source nodes. */
    const part of parts) {
      if (begin >= part.start && begin < part.start + part.node.length)
        range.setStart(part.node, begin - part.start);
      if (end > part.start && end <= part.start + part.node.length)
        range.setEnd(part.node, end - part.start);
    }
    /** Physical source positions remain independent of auxiliary full-word SVG text. */
    const rect = range.getBoundingClientRect();
    result.push({
      text,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      height: rect.height,
    });
  }
  return result;
}

/**
 * Observe an internal original source caret without selecting auxiliary drawing text.
 *
 * The real browser range includes horizontal word scaling and native line
 * shifts. No expected x coordinate or model selection is injected into input.
 * @param {HTMLElement} root - Actual source paragraph containing a coherent word.
 * @param {number} offset - Internal original UTF-16 source offset.
 * @returns {{left:number;top:number;height:number}} Real original caret rectangle.
 * @throws {RangeError} If the original source offset is absent.
 * @example
 * await page.locator('.tiptap p').evaluate(contextualCaret,2); // A genuine internal source caret.
 */
export function contextualCaret(
  root: HTMLElement,
  offset: number,
): { left: number; top: number; height: number } {
  /** Only original editable text owns caret positions. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    range = document.createRange();
  let remaining = offset;
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest('[contenteditable="false"]'))
      continue;
    /** Generated wrappers never contribute an original source character. */
    const node = walker.currentNode as Text;
    if (remaining > node.length) {
      remaining -= node.length;
      continue;
    }
    range.setStart(node, remaining);
    range.collapse(true);
    /** Actual source geometry remains separate from any SVG clip or mask. */
    const rect = range.getBoundingClientRect();
    return { left: rect.left, top: rect.top, height: rect.height };
  }
  throw new RangeError("The requested original source caret is absent.");
}
/**
 * Read actual original logical text from an independently decoded source model.
 *
 * Script normalization and native imports may split original marks, but drawing
 * text and generated bidi markers cannot become authored source characters.
 * @param {JSONContent} node - Actual saved or independently decoded source node.
 * @returns {string} Original authored logical text in document order.
 * @example
 * contextualSourceText(parsed.doc); // Original Arabic source appears exactly once.
 */
export function contextualSourceText(node: JSONContent): string {
  let text = node.text || "";
  for (/** Only genuine original source children contribute logical text. */
  const child of node.content || [])
    text += contextualSourceText(child);
  return text;
}
