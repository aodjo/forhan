import { characterMetrics } from "./character-metrics.ts";
import { supportsNativeWidthRun } from "./character-width.ts";
import { nativeSpacingFlag } from "./font-space.ts";
import { measureNativeDirectionalEnds } from "./native-bidi.ts";
import {
  measureContextualTracking,
  type ContextualTrackingCluster,
} from "./contextual-tracking.ts";

/** An original coherent word may span transparent layout and tracking text containers. */
export interface ContextualWidthPart {
  node: Text;
  from: number;
  to: number;
  start: number;
}

/** One coherent original word retains browser shaping and unchanged model offsets. */
export interface ContextualWidthWord {
  node: Text;
  from: number;
  to: number;
  text: string;
  ratio: number;
  intrinsic: number;
  direction: "ltr" | "rtl";
  layoutDirection: "ltr" | "rtl";
  kerning: boolean;
  tracking: number;
  advance: number;
  parts: ContextualWidthPart[];
  clusters: ContextualTrackingCluster[];
  dx: number[];
}

/** Original paragraph offsets prevent a formatting boundary becoming an isolated shaped word. */
interface ContextSourcePart {
  node: Text;
  start: number;
}

/** Contiguous joining-script spans keep adjoining Latin input outside their shaping context. */
const CONTEXTUAL_SPAN_PATTERN =
  /[\u0600-\u109f\u1780-\u18af\u1a00-\u1cff\ua800-\uabff\ufb50-\ufdff\ufe70-\ufeff][\u0600-\u109f\u1780-\u18af\u1a00-\u1cff\ua800-\uabff\ufb50-\ufdff\ufe70-\ufeff\p{Mark}\u200c\u200d]*/gu;

/**
 * Measure complete original contextual words without splitting their shaping runs.
 *
 * Word segmentation includes existing transparent line wrappers. A word that
 * crosses transparent layout text nodes retains its original shaping context.
 * Actual character-style boundaries remain independent. Tracked words use
 * host-shaped clusters for physical advance and coherent post-shaping offsets.
 * @param {HTMLElement} root - Actual attached source document or owned static output.
 * @returns {ContextualWidthWord[]} Coherent original words and unscaled intrinsic widths.
 * @throws {RangeError|SyntaxError} If explicit native source metrics or flags are malformed.
 * @example
 * measureContextualWidths(editorRoot); // A complete Arabic ligature remains one original text run.
 */
export function measureContextualWidths(
  root: HTMLElement,
): ContextualWidthWord[] {
  /** Every measurement belongs to the same actual fonts and document as its source. */
  const document = root.ownerDocument,
    window = document.defaultView!,
    canvas = document.createElement("canvas").getContext("2d"),
    result: ContextualWidthWord[] = [],
    segmenter = new Intl.Segmenter("ko", { granularity: "word" });
  if (!canvas) return result;
  /** Directional analysis is needed only when actual source words carry nonzero tracking. */
  let directionalEnds: Map<Text, Set<number>> | undefined;
  for (/** Coherent words cannot cross authored paragraph or heading boundaries. */
  const paragraph of root.matches("p,h1,h2,h3,h4,h5,h6,.nd-character-sample")
    ? [root]
    : root.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6")) {
    /** Original text offsets remain separate from auxiliary contours and generated direction markers. */
    const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      ),
      parts: ContextSourcePart[] = [];
    let text = "";
    while (walker.nextNode()) {
      /** Hard breaks separate source words without inventing an editable character. */
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
    /** Mixed Latin/complex words keep independent source nodes without isolating a joining letter. */
    const words: { index: number; segment: string }[] = [];
    for (/** Whole Unicode words retain required ligatures and original combining/reordering marks. */
    const word of segmenter.segment(text)) {
      if (!word.isWordLike || supportsNativeWidthRun(word.segment)) continue;
      for (/** Latin prefixes and suffixes never become part of an atomic contextual shaping span. */
      const part of word.segment.matchAll(CONTEXTUAL_SPAN_PATTERN))
        if (/\p{Letter}/u.test(part[0]))
          words.push({ index: word.index + part.index, segment: part[0] });
    }
    let cursor = 0;
    for (/** Complete contiguous script spans retain original logical word offsets. */
    const word of words) {
      while (
        cursor < parts.length &&
        parts[cursor].start + parts[cursor].node.length <= word.index
      )
        cursor++;
      /** A single actual source node lets the editor own the complete atomic word container. */
      const part = parts[cursor];
      if (!part || part.start > word.index) continue;
      /** Original source metrics remain outside all rendering-only containers. */
      const parent = part.node.parentElement!,
        owner = parent.closest<HTMLElement>("[data-forhan-character-metrics]");
      if (!owner) continue;
      /** Native language selection is preserved independently of complete original word text. */
      const metrics = characterMetrics(
          JSON.parse(owner.dataset.forhanCharacterMetrics!),
        ),
        language = Number(owner.dataset.forhanCharacterLanguage || 0),
        ratio = metrics.ratio[language] ?? 100,
        tracking = metrics.spacing[language] ?? 0;
      if (ratio === 100 && tracking === 0) continue;
      /** Transparent source decorations never create a new authored character-style boundary. */
      const wordParts: ContextualWidthPart[] = [];
      let coherent = true;
      for (
        let index = cursor;
        index < parts.length &&
        parts[index].start < word.index + word.segment.length;
        index++
      ) {
        /** Each actual source fragment maps back to the unchanged complete word. */
        const source = parts[index],
          from = Math.max(0, word.index - source.start),
          to = Math.min(
            source.node.length,
            word.index + word.segment.length - source.start,
          );
        if (
          source.node.parentElement?.closest(
            "[data-forhan-character-metrics]",
          ) !== owner
        ) {
          coherent = false;
          break;
        }
        if (from < to)
          wordParts.push({
            node: source.node,
            from,
            to,
            start: source.start + from - word.index,
          });
      }
      if (!coherent || !wordParts.length) continue;
      /** Font metrics do not include an earlier word transform or paragraph zoom. */
      const style = window.getComputedStyle(parent),
        font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        kerningOwner = parent.closest<HTMLElement>("[data-forhan-use-kerning]"),
        kerning = kerningOwner
          ? nativeSpacingFlag(kerningOwner.dataset.forhanUseKerning)
          : style.fontKerning === "normal";
      if (!(parseFloat(style.fontSize) > 0)) continue;
      canvas.font = font;
      canvas.fontKerning = kerning ? "normal" : "none";
      /** Complete-word intrinsic width keeps contextual forms instead of summing isolated letters. */
      const intrinsic = canvas.measureText(word.segment).width,
        direction =
          /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(
            word.segment,
          )
            ? "rtl"
            : "ltr",
        available =
          paragraph.clientWidth -
          (parseFloat(window.getComputedStyle(paragraph).paddingLeft) || 0) -
          (parseFloat(window.getComputedStyle(paragraph).paddingRight) || 0);
      if (!(intrinsic > 0)) continue;
      /** Candidate directional endings remain offsets in actual original source fragments. */
      const endings = new Set<number>();
      if (tracking !== 0) {
        directionalEnds ??= measureNativeDirectionalEnds(root);
        for (/** The complete word's source map never inserts or normalizes authored characters. */ const source of wordParts)
          for (/** Only actual source endings inside this word affect its cluster advance. */ const end of directionalEnds.get(
            source.node,
          ) || [])
            if (end >= source.from && end < source.to)
              endings.add(source.start + end - source.from);
      }
      /** Complete native word advance and paint offsets preserve contextual glyph selection. */
      const tracked =
        tracking === 0
          ? { advance: intrinsic, clusters: [], dx: [] }
          : measureContextualTracking(
              document,
              word.segment,
              style,
              direction,
              intrinsic,
              tracking,
              endings,
            );
      if (available > 0 && (tracked.advance * ratio) / 100 > available)
        continue;
      result.push({
        node: part.node,
        from: wordParts[0].from,
        to: wordParts[wordParts.length - 1].to,
        text: word.segment,
        ratio,
        intrinsic,
        direction,
        layoutDirection:
          window.getComputedStyle(owner).direction === "rtl" ? "rtl" : "ltr",
        kerning,
        tracking,
        advance: tracked.advance,
        parts: wordParts,
        clusters: tracked.clusters,
        dx: tracked.dx,
      });
    }
  }
  return result;
}

/**
 * Describe rendering-only source containers for one complete contextual word.
 *
 * The atomic box owns physical advance while its coherent editable source
 * scales only horizontally. Generated CSS direction markers retain the word's
 * strong bidi class; no control character enters original source or clipboard.
 * @param {ContextualWidthWord} word - Complete original word and intrinsic source metrics.
 * @returns {{source:string;box:string;direction:'ltr'|'rtl'}} Independent source and physical-word styles.
 * @example
 * contextualWidthStyles(word); // A half-width lam-alef retains original vertical font metrics.
 */
export function contextualWidthStyles(word: ContextualWidthWord): {
  source: string;
  box: string;
  direction: "ltr" | "rtl";
} {
  return {
    source: `display:inline-block;white-space:pre;width:${word.intrinsic}px;transform:scaleX(${word.ratio / 100});transform-origin:${word.direction === "rtl" ? "right" : "left"} center;letter-spacing:0;font-kerning:${word.kerning ? "normal" : "none"};font-variant-ligatures:normal;text-indent:0`,
    box: `display:inline-block;white-space:pre;width:${(word.advance * word.ratio) / 100}px;direction:${word.direction};text-align:${word.direction === "rtl" ? "right" : "left"};text-align-last:auto;text-justify:auto;text-indent:0`,
    direction: word.direction,
  };
}

/**
 * Describe an editable source cluster's physical advance beside coherent word paint.
 *
 * Transparent inline decorations are repeated by ProseMirror around every
 * independently decorated text fragment. Each tracked cluster therefore owns
 * its own proportional source box; one complete SVG word preserves visible
 * contextual shaping independently. Native advance belongs after the glyph in
 * visual order, so the original source width aligns to the left of its cell.
 * @param {ContextualWidthWord} word - Complete original word and native width ratio.
 * @param {ContextualTrackingCluster} cluster - Host-shaped original source cluster.
 * @returns {{source:string;box:string;marker:string;direction:'ltr'|'rtl'}} Independent editable source, physical cluster and atomic word-group styles.
 * @example
 * contextualClusterStyles(word, word.clusters[0]); // A required ligature keeps one source cell.
 */
export function contextualClusterStyles(
  word: ContextualWidthWord,
  cluster: ContextualTrackingCluster,
): { source: string; box: string; marker: string; direction: "ltr" | "rtl" } {
  let prefix = 0;
  for (/** Adjacent anonymous table cells retain original source order without introducing model containers. */ const previous of word.clusters) {
    if (previous === cluster) break;
    prefix += previous.advance + previous.delta;
  }
  /** Anonymous columns inherit their authored owner direction; actual shaped positions preserve embedded numeric runs. */
  const remaining = word.advance - prefix - cluster.advance - cluster.delta,
    shift =
      ((cluster.position -
        (word.layoutDirection === "rtl" ? remaining : prefix)) *
        word.ratio) /
      100;
  return {
    source: `display:inline-block;white-space:pre;width:${cluster.intrinsic}px;transform:scaleX(${cluster.intrinsic > 0 ? ((cluster.advance / cluster.intrinsic) * word.ratio) / 100 : 0});transform-origin:left center;letter-spacing:0;font-kerning:${word.kerning ? "normal" : "none"};font-variant-ligatures:normal;text-indent:0`,
    box: `display:inline-block;white-space:pre;width:${((cluster.advance + cluster.delta) * word.ratio) / 100}px;direction:ltr;text-align:left;text-align-last:auto;text-justify:auto;text-indent:0`,
    marker: `display:table-cell;position:relative;left:${shift}px;padding:0;border:0`,
    direction: word.direction,
  };
}

/**
 * Create an inaccessible generated direction boundary outside an atomic word group.
 *
 * Anonymous tables are neutral bidi objects. Generated CSS direction controls
 * classify the complete contextual word without inserting authored characters
 * into source text, model positions, selection text or the clipboard.
 * @param {Document} document - Actual owning source or static-output document.
 * @param {'ltr'|'rtl'} direction - Original contextual word's strong direction.
 * @returns {HTMLElement} Empty rendering-only inline boundary with generated direction content.
 * @example
 * createContextualDirection(document,'rtl'); // Arabic word groups retain their original relative order.
 */
export function createContextualDirection(
  document: Document,
  direction: "ltr" | "rtl",
): HTMLElement {
  /** Only CSS-generated controls participate in physical bidi ordering. */
  const marker = document.createElement("forhan-context-direction");
  marker.dataset.forhanContextDirection = direction;
  marker.contentEditable = "false";
  marker.setAttribute("aria-hidden", "true");
  marker.style.cssText =
    "display:inline;font-size:0;line-height:0;pointer-events:none;user-select:none";
  return marker;
}

/**
 * Recover an original word interval across transparent source text containers.
 *
 * Logical UTF-16 offsets remain independent of cluster-position decorations.
 * The returned range belongs to the actual attached source document.
 * @param {ContextualWidthWord} word - Complete original word and its source fragments.
 * @param {number} [from=0] - Original word-relative inclusive source offset.
 * @param {number} [to=word.text.length] - Original word-relative exclusive source offset.
 * @returns {Range} Genuine source range with unchanged authored character positions.
 * @throws {RangeError} If an interval has no owning original source fragment.
 * @example
 * contextualSourceRange(word, 0, 1); // The first original Arabic letter keeps its logical position.
 */
export function contextualSourceRange(
  word: ContextualWidthWord,
  from = 0,
  to = word.text.length,
): Range {
  /** Every range is owned by its original attached document. */
  const range = word.node.ownerDocument.createRange();
  let started = false,
    ended = false;
  for (/** Source fragments remain ordered by original logical word offsets. */ const part of word.parts) {
    /** Transparent containers cannot change the length of an original text fragment. */
    const end = part.start + part.to - part.from;
    if (!started && from >= part.start && from < end) {
      range.setStart(part.node, part.from + from - part.start);
      started = true;
    }
    if (to > part.start && to <= end) {
      range.setEnd(part.node, part.from + to - part.start);
      ended = true;
    }
  }
  if (!started || !ended)
    throw new RangeError(
      "The contextual interval has no original source owner.",
    );
  return range;
}

/**
 * Apply coherent source-word width containers to an owned static document copy.
 *
 * Reverse splitting preserves every original text offset. Live editor views
 * use equivalent owned decorations and never call this DOM mutation path.
 * @param {ContextualWidthWord[]} words - Complete unchanged source-word measurements.
 * @returns {void} Adds only source-preserving physical width containers.
 * @example
 * applyContextualWidths(measureContextualWidths(output.body)); // Before common native line placement.
 */
export function applyContextualWidths(words: ContextualWidthWord[]): void {
  for (let index = words.length - 1; index >= 0; index--) {
    /** Later original source offsets are split before earlier words. */
    const word = words[index],
      document = word.node.ownerDocument,
      range = contextualSourceRange(word),
      fragment = document.createDocumentFragment();
    if (word.clusters.length)
      fragment.append(createContextualDirection(document, word.direction));
    for (/** Untracked complete words keep one coherent box; tracked source uses independent host-shaped cluster cells. */ const cluster of word
      .clusters.length
      ? word.clusters
      : [null]) {
      /** Only owned static output is changed; original Unicode and model offsets remain untouched. */
      const source = document.createElement("forhan-context-source"),
        box = document.createElement("forhan-context-box"),
        marker = document.createElement("forhan-context-bidi"),
        styles = cluster
          ? contextualClusterStyles(word, cluster)
          : contextualWidthStyles(word);
      source.dataset.forhanContextSource = "";
      source.style.cssText = styles.source;
      if (cluster) source.dataset.forhanContextCluster = "";
      box.dataset.forhanContextRatio = String(word.ratio);
      box.style.cssText = styles.box;
      if (cluster) {
        marker.dataset.forhanContextCell = "";
        marker.setAttribute("role", "presentation");
        marker.style.cssText = (
          styles as ReturnType<typeof contextualClusterStyles>
        ).marker;
      } else marker.dataset.forhanContextDirection = styles.direction;
      source.append(
        document.createTextNode(
          cluster ? word.text.slice(cluster.from, cluster.to) : word.text,
        ),
      );
      box.append(source);
      marker.append(box);
      fragment.append(marker);
    }
    if (word.clusters.length)
      fragment.append(createContextualDirection(document, word.direction));
    range.deleteContents();
    range.insertNode(fragment);
  }
}
