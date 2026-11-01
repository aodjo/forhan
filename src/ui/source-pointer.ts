import type { EditorView } from "@tiptap/pm/view";

/** One complete source grapheme and its nearest logical caret edge. */
export interface SourcePointer {
  from: number;
  to: number;
  head: number;
  paragraph: HTMLElement;
  rect: DOMRect | null;
}

/** A viewport point remains independent of pointer capture and source zoom. */
export interface SourcePointerCoordinates {
  left: number;
  top: number;
}

/** Original text offsets bridge transparent formatting and native rendering wrappers. */
interface PointerTextPart {
  node: Text;
  start: number;
}

/**
 * Find the original text block at or nearest a physical pointer position.
 *
 * Pointer capture can retarget events to the editor root. Actual hit testing
 * remains independent of event.target, while page margins use the nearest
 * paragraph rather than an unrelated toolbar or inaccessible drawing layer.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {SourcePointerCoordinates} point - Physical viewport coordinates.
 * @returns {{paragraph:HTMLElement;hit:Element|null}|null} Owning source block and actual hit element.
 * @example
 * pointerParagraph(view,{left:500,top:420}); // Actual source block under paper zoom.
 */
function pointerParagraph(
  view: EditorView,
  point: SourcePointerCoordinates,
): { paragraph: HTMLElement; hit: Element | null } | null {
  /** Physical hit testing ignores the element that currently owns pointer capture. */
  const hit = view.dom.ownerDocument.elementFromPoint(point.left, point.top),
    direct = hit?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6");
  if (
    direct &&
    view.dom.contains(direct) &&
    !direct.closest('[contenteditable="false"]')
  )
    return { paragraph: direct, hit };
  /** A real table background identifies its own cell even without a text-element hit. */
  const cell = hit?.closest("td,th"),
    scope = cell && view.dom.contains(cell) ? cell : view.dom;
  let paragraph: HTMLElement | null = null,
    bestY = Infinity,
    bestX = Infinity;
  for (
    /** Page-margin dragging still targets original source paragraphs and headings. */
    const candidate of scope.querySelectorAll<HTMLElement>(
    "p,h1,h2,h3,h4,h5,h6",
  )) {
    if (candidate.closest('[contenteditable="false"]')) continue;
    /** Vertical proximity chooses a source block without treating bidi x movement as a new line. */
    const rect = candidate.getBoundingClientRect(),
      dy = Math.max(rect.top - point.top, point.top - rect.bottom, 0),
      dx = Math.max(rect.left - point.left, point.left - rect.right, 0);
    if (dy < bestY || (dy === bestY && dx < bestX)) {
      paragraph = candidate;
      bestY = dy;
      bestX = dx;
    }
  }
  return paragraph ? { paragraph, hit: null } : null;
}

/**
 * Read a grapheme's physical direction from genuine source caret rectangles.
 *
 * Bidi boundaries may expose a collapsed caret at the opposite side of a run.
 * Only caret edges local to the complete source box contribute; script-based
 * direction is reserved for ambiguous or coincident caret observations.
 * @param {Range} range - Complete original source grapheme range.
 * @param {DOMRect} rect - Actual physical source bounds.
 * @param {string} text - Original complete grapheme text.
 * @returns {boolean} Whether its logical trailing edge lies physically to the left.
 * @example
 * sourcePointerRtl(range,range.getBoundingClientRect(),'ע'); // true at an RTL run boundary.
 */
function sourcePointerRtl(range: Range, rect: DOMRect, text: string): boolean {
  /** Cloned ranges inspect source caret edges without changing the real selection. */
  const first = range.cloneRange(),
    last = range.cloneRange();
  first.collapse(true);
  last.collapse(false);
  /** Small layout rounding cannot turn a genuine local edge into a different bidi run. */
  const start = first.getBoundingClientRect().left,
    end = last.getBoundingClientRect().left,
    localStart = start >= rect.left - 0.5 && start <= rect.right + 0.5,
    localEnd = end >= rect.left - 0.5 && end <= rect.right + 0.5;
  if (localStart && localEnd && Math.abs(start - end) > 0.5) return end < start;
  if (localEnd && !localStart) return end < (rect.left + rect.right) / 2;
  if (localStart && !localEnd) return start > (rect.left + rect.right) / 2;
  return (
    /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(
      text,
    ) && !/^[\p{Decimal_Number}\p{Mark}]+$/u.test(text)
  );
}

/**
 * Map actual source grapheme boxes back to a logical editor position.
 *
 * Transparent native wrappers never introduce source characters. Complete
 * paragraph segmentation protects combining/ZWJ sequences across mark nodes;
 * hard breaks separate graphemes and auxiliary drawing text is excluded.
 * Correct physical ranges replace unreliable native browser caret hit tests.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {SourcePointerCoordinates} point - Original physical viewport position.
 * @returns {SourcePointer|null} Closest original source grapheme and logical edge, or null without editable source.
 * @example
 * sourcePointerAt(view,{left:710,top:430}); // Maps a clicked Hebrew glyph independently of adjacent numbers.
 */
export function sourcePointerAt(
  view: EditorView,
  point: SourcePointerCoordinates,
): SourcePointer | null {
  /** Each pointer lookup owns only one current source paragraph and its real DOM nodes. */
  const owner = pointerParagraph(view, point);
  if (!owner) return null;
  /** Original text and DOM offsets are collected before measuring complete source graphemes. */
  const { paragraph, hit } = owner,
    document = view.dom.ownerDocument,
    walker = document.createTreeWalker(
      paragraph,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    ),
    parts: PointerTextPart[] = [],
    segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
  let text = "";
  while (walker.nextNode()) {
    /** Hard breaks cannot become part of a combining sequence across source lines. */
    const node = walker.currentNode;
    if (node.nodeType === 1 && (node as Element).tagName === "BR") {
      text += "\n";
      continue;
    }
    if (
      node.nodeType !== 3 ||
      node.parentElement?.closest(
        '[contenteditable="false"],[data-forhan-outline-drawing]',
      )
    )
      continue;
    parts.push({ node: node as Text, start: text.length });
    text += node.textContent || "";
  }
  /** Direct text hits restrict measurement to the actual source element rather than a neighboring bidi run. */
  const preferred =
    hit && hit !== paragraph
      ? parts.filter(
          /**
           * Identify source fragments belonging to the actual element under the pointer.
           *
           * Actual source rectangles must also contain the physical point: DOM hit
           * testing can round a fractional word edge into an adjacent bidi space.
           * A grapheme can still include neighboring fragments across transparent marks.
           * @param {PointerTextPart} part - Original source text and coherent paragraph offset.
           * @returns {boolean} Whether this source fragment belongs to the physical hit element.
           * @example
           * // Hitting a native-width Hebrew wrapper cannot select an adjacent numeric wrapper.
           */
          (part) => {
            if (!hit.contains(part.node)) return false;
            /** Original source rectangles validate DOM hit ownership before narrowing grapheme candidates. */
            const range = document.createRange();
            range.selectNodeContents(part.node);
            for (/** Wrapped source fragments retain separate physical rectangles. */
            const rect of range.getClientRects())
              if (point.left >= rect.left && point.left <= rect.right && point.top >= rect.top && point.top <= rect.bottom)
                return true;
            return false;
          },
        )
      : [];
  let best: SourcePointer | null = null,
    bestY = Infinity,
    bestX = Infinity,
    cursor = 0;
  for (
    /** Complete graphemes retain original text offsets across drawing-only wrapper boundaries. */
    const segment of segmenter.segment(
    text,
  )) {
    /** Every source interval is located before a native source range is measured. */
    const begin = segment.index,
      end = begin + segment.segment.length;
    while (
      cursor < parts.length &&
      parts[cursor].start + parts[cursor].node.length <= begin
    )
      cursor++;
    if (cursor >= parts.length || parts[cursor].start >= end) continue;
    let tail = cursor;
    while (tail + 1 < parts.length && parts[tail + 1].start < end) tail++;
    if (preferred.length) {
      let matches = false;
      for (
        /** Actual hit fragments can overlap any portion of a complete source grapheme. */
        const part of preferred
      )
        if (part.start < end && part.start + part.node.length > begin) {
          matches = true;
          break;
        }
      if (!matches) continue;
    }
    /** Real source nodes remain editable while auxiliary SVG has no model position. */
    const first = parts[cursor],
      last = parts[tail],
      range = document.createRange();
    range.setStart(first.node, Math.max(0, begin - first.start));
    range.setEnd(last.node, Math.min(last.node.length, end - last.start));
    /** Vertical line proximity is resolved before horizontal glyph proximity. */
    const rect = range.getBoundingClientRect(),
      dy = Math.max(rect.top - point.top, point.top - rect.bottom, 0),
      dx = Math.max(rect.left - point.left, point.left - rect.right, 0);
    if (!rect.height || dy > bestY || (dy === bestY && dx >= bestX)) continue;
    /** Logical edge choice preserves browser bidi ordering and original grapheme integrity. */
    const from = view.posAtDOM(first.node, Math.max(0, begin - first.start)),
      to = view.posAtDOM(
        last.node,
        Math.min(last.node.length, end - last.start),
      ),
      rtl = sourcePointerRtl(range, rect, segment.segment),
      trailing = rtl
        ? point.left < (rect.left + rect.right) / 2
        : point.left >= (rect.left + rect.right) / 2;
    best = { from, to, head: trailing ? to : from, paragraph, rect };
    bestY = dy;
    bestX = dx;
  }
  if (best) return best;
  if (parts.length) return null;
  /** Empty source paragraphs remain valid destinations for a drag from another original block. */
  const head = view.posAtDOM(paragraph, 0);
  return { from: head, to: head, head, paragraph, rect: null };
}

/**
 * Find a complete original Unicode word around a genuine source grapheme.
 *
 * Formatting marks do not split words. Inline objects occupy one placeholder
 * position so original model offsets remain valid through embedded controls.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {SourcePointer} point - Original source grapheme under the pointer.
 * @returns {{from:number;to:number}|null} Complete original word interval, or null for nonword source.
 * @example
 * sourceWordAt(view,point); // A Hebrew word remains one word across source marks.
 */
export function sourceWordAt(
  view: EditorView,
  point: SourcePointer,
): { from: number; to: number } | null {
  /** Original paragraph content retains one model position per inline object. */
  const source = view.state.doc.resolve(point.from),
    start = source.start(),
    text = source.parent.textBetween(
      0,
      source.parent.content.size,
      "",
      "\ufffc",
    ),
    offset = point.from - start,
    segmenter = new Intl.Segmenter("ko", { granularity: "word" });
  for (
    /** Native word selection spans real source text rather than drawing wrapper elements. */
    const word of segmenter.segment(
    text,
  ))
    if (
      word.isWordLike &&
      offset >= word.index &&
      offset < word.index + word.segment.length
    )
      return {
        from: start + word.index,
        to: start + word.index + word.segment.length,
      };
  return null;
}
