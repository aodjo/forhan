import bidiFactory from "bidi-js";

/** Unicode embedding levels resolve native directional boundaries without changing original logical text. */
const NATIVE_BIDI = bidiFactory();

/** Installed Hangul displays these newer isolate controls as neutral labelled glyphs rather than invisible bidi scope changes. */
const NATIVE_VISIBLE_ISOLATES = /[\u2066-\u2069]/g;

/** Original text offsets bridge transparent native layout and character-style boundaries. */
interface NativeBidiPart {
  node: Text;
  start: number;
}

/**
 * Find candidate source-grapheme endings of original resolved directional runs.
 *
 * Installed Hangul's terminal tracking depends on both direction and shaping.
 * LTR runs end logically at their last grapheme; RTL runs
 * end visually at their first logical grapheme. Unicode embedding levels
 * preserve numbers, neutral punctuation and supported explicit controls.
 * Native-labelled isolate glyphs use neutral analysis placeholders of the same
 * UTF-16 length; the original authored text is never replaced or normalized.
 * Trailing ASCII spaces retain their base advance while the final visible
 * glyph also omits tracking, matching original native caret observations.
 * @param {string} text - Original unchanged logical paragraph source.
 * @param {'ltr'|'rtl'} [direction='ltr'] - Actual paragraph base direction.
 * @returns {Set<number>} Original UTF-16 candidate starts; font measurement retains advances before zero-width marks.
 * @example
 * nativeDirectionalRunEnds('X العربية Z'); // Includes the space before Arabic and the first Arabic letter.
 */
export function nativeDirectionalRunEnds(
  text: string,
  direction: "ltr" | "rtl" = "ltr",
): Set<number> {
  /** Embedding resolution and grapheme segmentation both retain original UTF-16 offsets. */
  const analyzed = text.replace(NATIVE_VISIBLE_ISOLATES, "\ufffc"),
    embedding = NATIVE_BIDI.getEmbeddingLevels(analyzed, direction),
    segments = [
      ...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(
        analyzed,
      ),
    ],
    ends = new Set<number>(),
    trailingStarts: number[] = [];
  for (/** Native line-end whitespace is separate from the final visible glyph's advance. */
  const paragraph of embedding.paragraphs) {
    let tail = paragraph.end + 1;
    while (tail > paragraph.start && /[\r\n\u2029]/u.test(analyzed[tail - 1]))
      tail--;
    while (tail > paragraph.start && /[ \t]/u.test(analyzed[tail - 1])) tail--;
    trailingStarts.push(tail);
  }
  let currentLevel = -1,
    first = -1,
    last = -1,
    paragraph = 0;
  for (/** Supported invisible controls affect embedding resolution; native-labelled isolates remain neutral glyph placeholders. */ const segment of segments) {
    while (
      paragraph + 1 < embedding.paragraphs.length &&
      segment.index > embedding.paragraphs[paragraph].end
    ) {
      if (first >= 0) ends.add(currentLevel % 2 ? first : last);
      first = last = -1;
      currentLevel = -1;
      paragraph++;
    }
    if (/^[\p{Cc}\p{Cf}]+$/u.test(segment.segment)) continue;
    if (
      segment.index >= trailingStarts[paragraph] &&
      /^[ \t]+$/u.test(segment.segment)
    ) {
      ends.add(segment.index);
      continue;
    }
    /** Resolved levels distinguish nested numeric and isolated runs from script-name guesses. */
    const level = embedding.levels[segment.index];
    if (first >= 0 && level !== currentLevel) {
      ends.add(currentLevel % 2 ? first : last);
      first = -1;
    }
    if (first < 0) first = segment.index;
    last = segment.index;
    currentLevel = level;
  }
  if (first >= 0) ends.add(currentLevel % 2 ? first : last);
  return ends;
}

/**
 * Map native visual run endings onto original editable source text nodes.
 *
 * Transparent formatting and drawing containers do not split directional runs.
 * Hard breaks separate paragraphs, source images retain object positions, and
 * inaccessible drawing text never contributes an authored source character.
 * @param {HTMLElement} root - Actual attached native editor or owned static output.
 * @returns {Map<Text,Set<number>>} Original text-node offsets whose native tracking is suppressed.
 * @example
 * measureNativeDirectionalEnds(editor); // The original ASCII space before Arabic uses its untracked width.
 */
export function measureNativeDirectionalEnds(
  root: HTMLElement,
): Map<Text, Set<number>> {
  /** Each measurement belongs to the actual document and its paragraph direction. */
  const document = root.ownerDocument,
    result = new Map<Text, Set<number>>();
  for (/** Original paragraph boundaries remain separate even inside a table or heading. */ const paragraph of root.matches(
    "p,h1,h2,h3,h4,h5,h6,.nd-character-sample",
  )
    ? [root]
    : root.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6")) {
    /** Original offsets survive all source-preserving layout decorations. */
    const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      ),
      parts: NativeBidiPart[] = [];
    let text = "";
    while (walker.nextNode()) {
      /** Generated contours and other inaccessible descendants cannot enter the original paragraph stream. */
      const node = walker.currentNode;
      if (
        node.parentElement?.closest(
          '[contenteditable="false"],[data-forhan-outline-drawing]',
        )
      )
        continue;
      if (node.nodeType === 1) {
        if ((node as Element).tagName === "BR") text += "\n";
        else if ((node as Element).tagName === "IMG") text += "\ufffc";
        continue;
      }
      if (node.nodeType !== 3) continue;
      parts.push({ node: node as Text, start: text.length });
      text += node.textContent || "";
    }
    /** Real paragraph direction supplies the base embedding without inserting source control characters. */
    const ends = nativeDirectionalRunEnds(
      text,
      document.defaultView!.getComputedStyle(paragraph).direction === "rtl"
        ? "rtl"
        : "ltr",
    );
    let index = 0;
    for (/** Every ending remains an actual original grapheme start in source order. */ const end of [
      ...ends,
    ].sort(
      /**
       * Order original source offsets before mapping their actual text nodes.
       *
       * Run endings can be recorded in visual order; source mapping is logical.
       * @param {number} left - Original UTF-16 source offset.
       * @param {number} right - Another original UTF-16 source offset.
       * @returns {number} Ascending original source order.
       * @example
       * // No generated bidi character enters the source-node mapping.
       */
      (left, right) => left - right,
    )) {
      while (
        index < parts.length &&
        parts[index].start + parts[index].node.length <= end
      )
        index++;
      /** Only an exact containing original text fragment receives a source ending. */
      const part = parts[index];
      if (!part || part.start > end) continue;
      if (!result.has(part.node)) result.set(part.node, new Set<number>());
      result.get(part.node)!.add(end - part.start);
    }
  }
  return result;
}
