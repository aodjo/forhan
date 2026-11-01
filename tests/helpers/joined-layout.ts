/** Original samples include required ligatures and reordering/combining marks. */
export const JOINED_SCRIPTS = [
  { id: "arabic", words: ["العربية", "سَلَام", "جميلة"] },
  { id: "devanagari", words: ["हिन्दी", "क्षि", "भाषा"] },
  { id: "bengali", words: ["বাংলা", "ক্ষি", "ভাষা"] },
  { id: "thai", words: ["ภาษาไทย", "สวัสดี", "ภาษา"] },
];

/**
 * Measure actual source baselines using current DOM ranges and installed fonts.
 *
 * This reads rendered source coordinates without trusting layout metadata or
 * counting auxiliary drawings. Font fallback participates in actual metrics.
 * @param {HTMLElement} paragraph - Actual rendered original paragraph.
 * @returns {{height:number;runs:{text:string;baseline:number}[]}} Real physical source geometry in CSS pixels.
 * @example
 * await page.locator('.tiptap p').evaluate(joinedGeometry); // Original Arabic letters share a native baseline.
 */
export function joinedGeometry(paragraph: HTMLElement): {
  height: number;
  runs: { text: string; baseline: number }[];
} {
  /** Source rectangles include current accumulated paper zoom. */
  const canvas = document.createElement("canvas").getContext("2d")!,
    box = paragraph.getBoundingClientRect(),
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    runs: { text: string; baseline: number }[] = [];
  let zoom = 1;
  for (
    let node: HTMLElement | null = paragraph;
    node;
    node = node.parentElement
  )
    zoom *= Number(getComputedStyle(node).zoom) || 1;
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest('[contenteditable="false"],svg'))
      continue;
    /** Text remains in original coherent script runs across transparent line wrappers. */
    const text = walker.currentNode as Text,
      range = document.createRange(),
      style = getComputedStyle(text.parentElement!);
    range.selectNodeContents(text);
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    runs.push({
      text: text.data,
      baseline:
        (range.getBoundingClientRect().top - box.top) / zoom +
        canvas.measureText(text.data).fontBoundingBoxAscent,
    });
  }
  return { height: box.height / zoom, runs };
}

/**
 * Read actual original grapheme baselines through real soft wrapping.
 *
 * Whole-node rectangles can cover several browser lines. Complete source
 * grapheme ranges independently expose each actual wrapped baseline, including
 * RTL visual motion and contextual clusters without changing the source DOM.
 * @param {HTMLElement} paragraph - Actual original rendered paragraph.
 * @returns {{height:number;baselines:number[]}} Physical source height and complete-grapheme baselines.
 * @example
 * await page.locator('.tiptap p').evaluate(joinedGlyphGeometry); // Soft wraps retain native line intervals.
 */
export function joinedGlyphGeometry(paragraph: HTMLElement): {
  height: number;
  baselines: number[];
} {
  /** Actual source font metrics remain separate from rendered correction metadata. */
  const context = document.createElement("canvas").getContext("2d")!,
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    bounds = paragraph.getBoundingClientRect(),
    segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" }),
    baselines: number[] = [];
  let zoom = 1;
  for (
    let node: HTMLElement | null = paragraph;
    node;
    node = node.parentElement
  )
    zoom *= Number(getComputedStyle(node).zoom) || 1;
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest('[contenteditable="false"],svg'))
      continue;
    /** Real range geometry includes only actual original editable source text. */
    const node = walker.currentNode as Text,
      style = getComputedStyle(node.parentElement!),
      range = document.createRange();
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    for (/** Combining/reordering sequences cannot be split into independent baseline measurements. */
    const part of segmenter.segment(node.data)) {
      range.setStart(node, part.index);
      range.setEnd(node, part.index + part.segment.length);
      baselines.push(
        (range.getBoundingClientRect().top - bounds.top) / zoom +
          context.measureText(part.segment).fontBoundingBoxAscent,
      );
    }
  }
  return { height: bounds.height / zoom, baselines };
}
