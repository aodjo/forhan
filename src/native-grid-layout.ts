import {nativeDocumentZoom,nativeLineBaseline,type NativeParagraphLayout} from "./native-line-layout.ts";
import { readParagraphGrid } from "./paragraph-line-grid.ts";
import { sectionGridDistance } from "./section-grid.ts";

/** One source flow keeps its native end and pending physical height corrections separate. */
export interface NativeGridFlow {
  root: HTMLElement;
  origin: number;
  interval: number;
  previous: HTMLElement | null;
  end: number;
  correction: number;
}
/** Actual browser layout resolves to one sixty-fourth of a pixel after accumulated CSS zoom. */
const GRID_QUANTUM = 1 / 64;
/** Computed CSS serializes physical source to finite significant digits; the tolerance stays below half a native unit. */
const GRID_SOURCE_TOLERANCE = 1 / 150 - Number.EPSILON;

/**
 * Round positive source progression to the next native grid interval.
 *
 * Literal zero remains zero, including native fixed/proportional zero overlap.
 * Computed CSS loses significant digits, including 20pt becoming 26.6667px.
 * A bounded tolerance avoids an extra grid jump at those source boundaries
 * while preserving a real one-native-unit increase and every positive advance.
 * @param {number} value - Original nonnegative CSS-pixel progression.
 * @param {number} interval - Positive native grid interval in CSS pixels.
 * @returns {number} Next grid multiple, or the unchanged interval when disabled.
 * @example
 * nativeGridAdvance(22,16); // 32, while nativeGridAdvance(0,16) remains zero.
 */
export function nativeGridAdvance(value: number, interval: number): number {
  if(value<=0||interval<=0)return value;
  /** CSS serialization error grows with the physical magnitude but cannot consume a real native unit. */
  const tolerance=Math.min(GRID_SOURCE_TOLERANCE,Math.max(1e-4,value*5e-6));
  return Math.max(1,Math.ceil((value-tolerance)/interval))*interval;
}

/**
 * Start independent native grid flow at the actual document content origin.
 *
 * The content host supplies the physical body edge, independently from the
 * section marker or a first paragraph's collapsing margin. Live editor hosts
 * own paper padding; standalone export bodies own their own content origin.
 * Existing drawing heights never become new source settings. Host scrolling
 * and its independent zoom remain separate from source line coordinates.
 * A zero interval still preserves independent native before/after spacing,
 * which must not collapse like adjacent browser paragraph margins.
 * @param {HTMLElement} root - Actual live editable root or owned static export body.
 * @param {number} zoom - Accumulated native CSS zoom affecting its physical coordinates.
 * @param {HTMLElement} [content=root] - Physical body host containing the source root.
 * @returns {NativeGridFlow} Isolated body flow with an optional native grid interval.
 * @throws {RangeError} If section metadata is malformed or the content host does not own the source root.
 * @example
 * const flow=createNativeGridFlow(editor.dom,1.25,editor.dom.parentElement!); // Body padding remains outside the grid.
 */
export function createNativeGridFlow(root: HTMLElement, zoom: number,content:HTMLElement=root): NativeGridFlow {
  /** Only an owned section source marker supplies a document grid interval. */
  const owner = root.closest<HTMLElement>("[data-forhan-line-grid]");
  /** Native section units convert independently from user-facing rounded point values. */
  const interval = owner?sectionGridDistance(owner.getAttribute("data-forhan-line-grid"))/75:0;
  if(content.ownerDocument!==root.ownerDocument||!content.contains(root))throw new RangeError('Native grid content must contain its source root.');
  /** The actual body host retains its physical inset even when the section marker is on an outer paper. */
  const style = content.ownerDocument.defaultView!.getComputedStyle(content),
    contentZoom=content===root?zoom:nativeDocumentZoom(content),
    contentEdge=Math.floor(((parseFloat(style.borderTopWidth)||0)+(parseFloat(style.paddingTop)||0))*contentZoom/GRID_QUANTUM+1e-7)*GRID_QUANTUM,
    origin = content.getBoundingClientRect().top +
      contentEdge-content.scrollTop*contentZoom;
  return { root, origin, interval, previous: null, end: 0, correction: 0 };
}

/**
 * Align one source paragraph while preserving its original margins and line spacing.
 *
 * Before/after distances snap independently, and a following checked paragraph
 * aligns after an unchecked paragraph. Half of the additional snapped advance
 * also moves the glyph baseline, as independently observed in native PDF pairs.
 * One ordered plan carries earlier height
 * corrections forward without transient layout feedback. Current evidence covers
 * direct body paragraphs/headings; nested lists/cells and unmeasured objects keep
 * their existing layout and original metadata until separately established.
 * @param {NativeParagraphLayout} plan - Actual original source line measurements.
 * @param {NativeGridFlow|null} flow - Ordered owned document grid context, when enabled.
 * @param {number} zoom - Actual accumulated CSS zoom for physical source coordinates.
 * @returns {NativeParagraphLayout} Drawing-only plan with native grid progression.
 * @example
 * applyNativeGrid(plan,flow,1); // A checked 17pt line on a 16pt grid advances 32pt.
 */
export function applyNativeGrid(
  plan: NativeParagraphLayout,
  flow: NativeGridFlow | null,
  zoom: number,
): NativeParagraphLayout {
  if (!flow || plan.element.parentElement !== flow.root) return plan;
  /** Source margins remain separate from owned line-height and glyph corrections. */
  const element = plan.element,
    style = element.ownerDocument.defaultView!.getComputedStyle(element),
    before = parseFloat(style.marginTop) || 0,
    after = parseFloat(style.marginBottom) || 0,
    box = element.getBoundingClientRect(),
    top = (box.top - flow.origin) / zoom + flow.correction,
    snap = readParagraphGrid(element) ?? true,
    interval = snap ? flow.interval : 0,
    quantum = GRID_QUANTUM / zoom;
  if (element.previousElementSibling !== flow.previous)
    flow.end = top - before;
  /** Source progression accounts for collapsed browser margins without changing native metadata. */
  const start = nativeGridAdvance(flow.end, interval) + nativeGridAdvance(before, interval),
    prefix = start - top;
  let height = 0;
  for (let index = 0; index < plan.lines.length; index++) {
    /** Real line membership is retained while only its native baseline target changes. */
    const line = plan.lines[index],
      sourceAdvance = line.advance,
      snappedAdvance = nativeGridAdvance(sourceAdvance, interval);
    line.top = prefix + height;
    line.baseline = line.top + nativeLineBaseline(line.fontSize) +
      (snappedAdvance - sourceAdvance) / 2;
    line.advance = snappedAdvance;
    height += line.advance;
  }
  for(/** Absolute recovered browser baselines prevent retained subpixel corrections from accumulating across frames. */const range of plan.ranges){
    /** Each source fragment follows its original measured visual line without adding its previous drawing correction. */
    const line=plan.lines[range.line];range.shift=Math.round((line.baseline-(line.browserBaseline??line.baseline))/quantum)*quantum;
  }
  flow.end = start + height + nativeGridAdvance(after, interval);
  plan.height = Math.max(0, Math.round((flow.end - top - after) / quantum) * quantum);
  flow.correction += plan.height - box.height / zoom;
  flow.previous = element;
  return plan;
}
