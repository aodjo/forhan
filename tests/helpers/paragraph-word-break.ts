/** Literal controlled source matches the six installed-native reference captures. */
export const WORD_BREAK_SOURCE = [
  "앞말 가나다라마바 사자차카타파하 뒷말",
  "characteristically counterrevolutionary internationalization exceptional",
  "ALPHA beta gamma delta epsilon",
];

/**
 * Observe actual browser glyph line membership using individual source ranges.
 *
 * Drawing widgets and inaccessible SVG labels are excluded. Measurements use
 * real physical positions rather than computed CSS labels or model attributes.
 * @param {string} [selector='.tiptap p'] - Actual source paragraph in editing or static output.
 * @returns {string[]} Literal source glyphs grouped by actual rendered line.
 * @throws {Error} If the controlled source paragraph is absent.
 * @example
 * // A native character mode splits a Latin word where word mode keeps it intact.
 */
export function actualWordBreakLines(selector = ".tiptap p"): string[] {
  /** Original visible text nodes retain their Unicode and their real glyph positions. */
  const paragraph = document.querySelector(selector)!,
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    rows: Array<{ top: number; text: string }> = [],
    range = document.createRange();
  while (walker.nextNode()) {
    /** Inaccessible line markers are drawings rather than original document source. */
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('[aria-hidden="true"],svg')) continue;
    for (let index = 0; index < node.length; index++) {
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      /** Native line shifts are observed directly in the actual rendered source. */
      const fragments = range.getClientRects(),
        box = fragments[fragments.length - 1] || (node.data[index]===' '&&node.parentElement?.closest('[data-forhan-condense-delta]')?node.parentElement.closest('[data-forhan-condense-delta],[data-forhan-line-shift]')?.getBoundingClientRect():null) || range.getBoundingClientRect();
      let row = rows[rows.length - 1];
      if (!row || Math.abs(row.top - box.top) > 1) {
        row = { top: box.top, text: "" };
        rows.push(row);
      }
      row.text += node.data[index];
    }
  }
  /** Normalized edge whitespace does not change source word or character membership. */
  const result: string[] = [];
  for (/** Physical source lines retain all non-edge literal characters. */ const row of rows)
    result.push(row.text.trim());
  return result;
}
