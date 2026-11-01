/** One complete shaped source cluster retains required ligatures and original UTF-16 offsets. */
export interface ContextualTrackingCluster {
  from: number;
  to: number;
  advance: number;
  shift: number;
  intrinsic: number;
  delta: number;
  position: number;
}

/** Original coherent word geometry separates physical advance from per-cluster paint offsets. */
export interface ContextualTracking {
  advance: number;
  clusters: ContextualTrackingCluster[];
  dx: number[];
}

/** The original browser shaper measures complete words without exposing generated content as authored text. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Each attached source root owns an independent rendered-cell identity without retaining destroyed editors. */
const CONTEXTUAL_CELL_LAYOUTS = new WeakMap<
  HTMLElement,
  { identity: number; cells: { node: Element; parent: Element | null }[] }
>();

/** Private root identifiers scope temporary layout CSS without changing authored source marks. */
let contextualLayoutSequence = 0;

/**
 * Rebuild anonymous contextual word groups after incremental source DOM updates.
 *
 * Chromium can retain separate anonymous table wrappers when adjacent cells
 * are inserted or replaced individually. A temporary external stylesheet
 * reconstructs their common inline formatting context before paint. Source
 * elements, text nodes, marks, selections and history remain untouched; the
 * actual editor root's private identifier is never serialized as document data.
 * Identical cell ownership skips the layout pass on ordinary selection updates.
 * @param {HTMLElement} root - Actual attached editable source root or owned static body.
 * @returns {void} Restores coherent anonymous word groups without adding source transactions.
 * @example
 * refreshContextualCellLayout(editorRoot); // Required after real incremental cell insertion.
 */
export function refreshContextualCellLayout(root: HTMLElement): void {
  if (!root.isConnected) return;
  /** Original rendered-cell ownership is independent of source text and measurement values. */
  const nodes = [...root.querySelectorAll("[data-forhan-context-cell]")],
    previous = CONTEXTUAL_CELL_LAYOUTS.get(root);
  if (!nodes.length) {
    CONTEXTUAL_CELL_LAYOUTS.delete(root);
    return;
  }
  let changed = !previous || previous.cells.length !== nodes.length;
  if (!changed)
    for (let index = 0; index < nodes.length; index++)
      if (
        previous!.cells[index].node !== nodes[index] ||
        previous!.cells[index].parent !== nodes[index].parentElement
      ) {
        changed = true;
        break;
      }
  if (!changed) return;
  /** The temporary stylesheet belongs outside source content and matches only this actual root. */
  const identity = previous?.identity ?? ++contextualLayoutSequence,
    style = root.ownerDocument.createElement("style"),
    cells: { node: Element; parent: Element | null }[] = [];
  root.dataset.forhanContextLayout = String(identity);
  style.textContent = `[data-forhan-context-layout="${identity}"] [data-forhan-character-metrics]:has([data-forhan-context-cell]){display:inline-block!important}`;
  root.ownerDocument.head.append(style);
  try {
    void root.offsetWidth;
  } finally {
    style.remove();
  }
  void root.offsetWidth;
  for (/** Weak root ownership records actual current rendered cells and their common source containers. */ const node of nodes)
    cells.push({ node, parent: node.parentElement });
  CONTEXTUAL_CELL_LAYOUTS.set(root, { identity, cells });
}

/**
 * Measure native tracking after actual complete-word shaping on the owning host.
 *
 * Tiny independent SVG position probes distinguish required ligature carets
 * from independently addressable shaped clusters. Original Unicode is kept in
 * one text node throughout shaping; neither presentation forms nor isolated
 * character widths replace the host's actual font fallback and reordering.
 * Native terminal suppression applies only to an independently ending source
 * character; multi-character ligatures and uncomposed marks retain their base
 * advance as established by original native PDF text matrices.
 * @param {Document} document - Actual owning source document and installed fonts.
 * @param {string} source - Complete unchanged original contextual word.
 * @param {CSSStyleDeclaration} style - Actual inherited original font properties.
 * @param {'ltr'|'rtl'} direction - Original coherent word direction.
 * @param {number} intrinsic - Complete unscaled word advance from the original font.
 * @param {number} tracking - Native signed percentage of each shaped advance.
 * @param {Set<number>} endings - Original word-relative candidate directional endings.
 * @returns {ContextualTracking} Physical source advance and coherent cluster positioning.
 * @example
 * measureContextualTracking(document, 'لا', style, 'rtl', naturalWidth, 20, new Set([0]));
 */
export function measureContextualTracking(
  document: Document,
  source: string,
  style: CSSStyleDeclaration,
  direction: "ltr" | "rtl",
  intrinsic: number,
  tracking: number,
  endings: Set<number>,
): ContextualTracking {
  /** Attached hidden text uses the actual current document's host shaping engine. */
  const svg = document.createElementNS(SVG_NAMESPACE, "svg"),
    text = document.createElementNS(SVG_NAMESPACE, "text"),
    graphemes = [
      ...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(source),
    ],
    clusters: ContextualTrackingCluster[] = [],
    dx: number[] = Array(source.length).fill(0);
  svg.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden";
  svg.setAttribute("aria-hidden", "true");
  text.textContent = source;
  text.setAttribute("direction", direction);
  text.style.fontFamily = style.fontFamily;
  text.style.fontSize = style.fontSize;
  text.style.fontWeight = style.fontWeight;
  text.style.fontStyle = style.fontStyle;
  text.style.fontStretch = style.fontStretch;
  text.style.fontKerning = style.fontKerning === "normal" ? "normal" : "none";
  text.style.fontVariantLigatures = "normal";
  text.style.fontSynthesis = "none";
  text.style.letterSpacing = "0";
  text.style.wordSpacing = "0";
  text.style.whiteSpace = "pre";
  text.style.unicodeBidi = "isolate";
  svg.append(text);
  document.body.append(svg);
  try {
    /** Natural addressable starts remain distinct from independently painted glyph boundaries. */
    const starts: number[] = [],
      ends: number[] = [],
      naturalPositions = new Map<ContextualTrackingCluster, number>();
    text.setAttribute("dx", dx.join(" "));
    for (let index = 0; index < text.getNumberOfChars(); index++) {
      starts.push(text.getStartPositionOfChar(index).x);
      ends.push(text.getEndPositionOfChar(index).x);
    }
    for (/** A complete grapheme is never split merely because a mark has an addressable SVG caret. */ const part of graphemes) {
      let independent = !clusters.length;
      if (!independent) {
        dx[part.index] = 1;
        text.setAttribute("dx", dx.join(" "));
        independent =
          Math.abs(
            text.getStartPositionOfChar(part.index).x - starts[part.index],
          ) > 0.5;
        dx[part.index] = 0;
      }
      if (independent)
        clusters.push({
          from: part.index,
          to: part.index + part.segment.length,
          advance: 0,
          shift: 0,
          intrinsic: 0,
          delta: 0,
          position: 0,
        });
      else clusters[clusters.length - 1].to = part.index + part.segment.length;
    }
    let total = 0;
    for (/** Ligature subdivisions contribute their complete original cluster advance exactly once. */ const cluster of clusters) {
      cluster.advance = Math.abs(starts[cluster.from] - ends[cluster.to - 1]);
      naturalPositions.set(
        cluster,
        Math.min(starts[cluster.from], ends[cluster.to - 1]),
      );
      total += cluster.advance;
    }
    /** Isolated editable cluster boxes use their natural source width while coherent SVG owns the visible full-word glyphs. */
    const canvas = document.createElement("canvas").getContext("2d")!;
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    canvas.fontKerning = style.fontKerning === "normal" ? "normal" : "none";
    let advance = intrinsic;
    for (/** Logical order preserves the original source while visual directional advance determines position. */ const cluster of clusters) {
      cluster.advance *= total > 0 ? intrinsic / total : 0;
      /** NFC analysis never normalizes or rewrites the original authored source. */
      const normalized = Array.from(
          source.slice(cluster.from, cluster.to).normalize("NFC"),
        ),
        suppressed = endings.has(cluster.from) && normalized.length === 1,
        delta = suppressed ? 0 : (cluster.advance * tracking) / 100;
      cluster.intrinsic = canvas.measureText(
        source.slice(cluster.from, cluster.to),
      ).width;
      cluster.delta = delta;
      advance += delta;
    }
    /** Real host-shaped visual order preserves nested numeric runs inside an otherwise RTL word. */
    const visual = [...clusters].sort(
      /**
       * Order independently shaped source clusters by their actual physical glyph origins.
       *
       * Logical source reversal alone would also reverse an embedded LTR numeric run.
       * @param {ContextualTrackingCluster} left - Original shaped source cluster.
       * @param {ContextualTrackingCluster} right - Another original shaped source cluster.
       * @returns {number} Actual ascending physical glyph order.
       * @example
       * // Arabic-Indic digits retain left-to-right order inside the original Arabic word.
       */
      (left, right) =>
        naturalPositions.get(left)! - naturalPositions.get(right)!,
    );
    let position = 0,
      previous = 0;
    for (/** Native tracking belongs after each shaped glyph cluster in actual visual order. */ const cluster of visual) {
      cluster.position = position;
      position += cluster.advance + cluster.delta;
    }
    for (/** Relative SVG positioning follows unchanged logical source order after physical advances have been resolved. */ const cluster of clusters) {
      cluster.shift =
        cluster.position -
        (direction === "rtl" ? advance : 0) -
        naturalPositions.get(cluster)!;
      dx[cluster.from] = cluster.shift - previous;
      previous = cluster.shift;
    }
    return { advance, clusters, dx };
  } finally {
    svg.remove();
  }
}
