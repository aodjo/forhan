import { Extension, type Editor } from "@tiptap/core";
import { Fragment, Slice, type MarkType, type Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measureNativeSpaces, nativeSpacingFlag } from "../font-space.ts";
import { measureNativeWidths } from "../character-width.ts";
import { measureContextualWidths, contextualWidthStyles, contextualClusterStyles, createContextualDirection } from '../contextual-width.ts';
import { refreshContextualCellLayout } from '../contextual-tracking.ts';
import { preserveNativeTextSelection } from './native-selection.ts';
import {collectParagraphSpaces,settleParagraphSpaces} from '../paragraph-space-layout.ts';

/** Final paragraph corrections stay attached to immutable original source positions. */
type ParagraphSpaceCache=Map<number,{delta:number;condenseDelta:number}>;

/** Space geometry has a separate state so line breaking can react after actual advances change. */
export const fontSpaceKey = new PluginKey<DecorationSet>(
  "forhan-native-spaces",
);

/**
 * Inspect selected source modes without flattening mixed character runs.
 *
 * Empty selections follow stored/cursor attributes. Text selections retain a
 * mixed indicator so an untouched checkbox cannot reset a different source run.
 * @param {Editor} editor - Actual owning document editor.
 * @param {'nativeUseFontSpace'|'nativeUseKerning'} [key='nativeUseFontSpace'] - Native source boolean inspected independently.
 * @returns {{value:boolean;mixed:boolean}} Representative mode and independent mixed indicator.
 * @throws {RangeError} If a stored source preference is not a native boolean.
 * @example
 * fontSpaceSelection(editor); // Mixed native modes produce an indeterminate checkbox.
 */
export function fontSpaceSelection(
  editor: Editor,
  key: "nativeUseFontSpace" | "nativeUseKerning" = "nativeUseFontSpace",
): {
  value: boolean;
  mixed: boolean;
} {
  /** Real selection boundaries preserve mark scope across paragraphs and drawing wrappers. */
  const selection = editor.state.selection;
  let value: boolean | undefined,
    mixed = false;
  if (!selection.empty)
    editor.state.doc.nodesBetween(
      selection.from,
      selection.to,
      /**
       * Inspect an actual selected text run's native character-shape preference.
       *
       * Nontext containers contribute no invented default to mixed state.
       * @param {Node} node - Actual selected source node.
       * @returns {void} Accumulates real source modes.
       * @throws {RangeError} If stored native metadata is invalid.
       * @example
       * // True beside an implicit false preference remains mixed.
       */
      (node) => {
        if (!node.isText) return;
        /** Missing character preferences use the observed native half-em default. */
        const current = nativeSpacingFlag(
          editor.schema.marks.textStyle.isInSet(node.marks)?.attrs[key],
        );
        if (value === undefined) value = current;
        else if (current !== value) mixed = true;
      },
    );
  return {
    value: value ?? nativeSpacingFlag(editor.getAttributes("textStyle")[key]),
    mixed,
  };
}

/**
 * Preserve native source space modes in a detached rich clipboard fragment.
 *
 * A newly authored unmarked run still uses half-em spaces. Adding an explicit
 * clipboard mark prevents external-HTML defaults from changing that mode on
 * paste. The live document and its history are never modified.
 * @param {Fragment} source - Detached source content selected for copying.
 * @param {MarkType} type - Actual text-style mark from the owning schema.
 * @param {boolean} [permitted=true] - Whether the immediate text container permits this mark.
 * @returns {Fragment} Structurally identical clipboard content with explicit source modes.
 * @throws {RangeError} If an existing native source preference is invalid.
 * @example
 * stampCopiedSpaces(slice.content, schema.marks.textStyle); // Preserves native false during self-paste.
 */
function stampCopiedSpaces(
  source: Fragment,
  type: MarkType,
  permitted = true,
): Fragment {
  /** Original order and node/mark boundaries survive clipboard-only annotation. */
  const nodes: Node[] = [];
  source.forEach(
    /**
     * Annotate only text whose owning schema permits character-style marks.
     *
     * Atomic objects and code blocks retain their existing structure and marks.
     * @param {Node} node - Actual selected source node.
     * @returns {void} Adds one independently copied node in source order.
     * @example
     * // A bold run keeps its emphasis while its previously implicit mode becomes explicit.
     */
    (node) => {
      if (node.isText && permitted) {
        /** Complete original text-style properties remain independent of the one copied flag. */
        const previous = type.isInSet(node.marks),
          mark = type.create({
            ...previous?.attrs,
            nativeUseFontSpace: nativeSpacingFlag(
              previous?.attrs.nativeUseFontSpace,
            ),
            nativeUseKerning: nativeSpacingFlag(
              previous?.attrs.nativeUseKerning,
            ),
          });
        nodes.push(node.mark(mark.addToSet(node.marks)));
      } else if (!node.isLeaf)
        nodes.push(
          node.copy(
            stampCopiedSpaces(
              node.content,
              type,
              node.type.allowsMarkType(type),
            ),
          ),
        );
      else nodes.push(node);
    },
  );
  return Fragment.fromArray(nodes);
}

/**
 * Measure source space advances and map them to drawing-only editor ranges.
 *
 * Source positions are recovered from real DOM text nodes after font loading.
 * Decorations retain ordinary Unicode spaces and native word-break behavior.
 * @param {EditorView} view - Actual live editor view.
 * @param {ParagraphSpaceCache} [cached] - Final paragraph corrections for the current unchanged source revision.
 * @param {boolean} [settle=false] - Whether actual minimum-width lines are ready for adaptive restoration.
 * @returns {{decorations:DecorationSet;signature:string;paragraphSpaces:ParagraphSpaceCache}} Native advances and stable source-position identity.
 * @throws {RangeError|SyntaxError} If explicit native source metadata is malformed.
 * @example
 * const next = spaceDecorations(view); // Does not replace source text with fixed-width Unicode characters.
 */
function spaceDecorations(view: EditorView,cached?:ParagraphSpaceCache,settle=false): {
  decorations: DecorationSet;
  signature: string;
  paragraphSpaces:ParagraphSpaceCache;
} {
  /** Source positions and actual advances determine rendering independently of wrapper nesting. */
  const decorations: Decoration[] = [],
    signature: number[] = [];
  for (
    /** One coherent source node owns each complete contextual word and its physical width. */
    const word of measureContextualWidths(view.dom)
  ) {
    /** Original source positions remain unchanged through all rendering-only containers. */
    const first = word.parts[0], last = word.parts[word.parts.length - 1],
      from = view.posAtDOM(first.node, first.from), to = view.posAtDOM(last.node, last.to), styles = contextualWidthStyles(word);
    if (word.clusters.length) {
      for (/** A coherent painted cluster owns one original source cell and its native visual advance. */ const cluster of word.clusters) {
        let begin = -1, end = -1;
        for (/** Logical source fragments remain independent of transparent layout containers. */ const part of word.parts) {
          /** Only original overlapping source offsets establish the proportional editable cell. */
          const a = Math.max(cluster.from, part.start), b = Math.min(cluster.to, part.start + part.to - part.from);
          if (a >= b) continue;
          if (begin < 0) begin = view.posAtDOM(part.node, part.from + a - part.start);
          end = view.posAtDOM(part.node, part.from + b - part.start);
        }
        if (begin < 0 || end <= begin) continue;
        /** Per-cluster cells avoid duplicating a whole-word width around each ProseMirror text fragment. */
        const clusterStyles = contextualClusterStyles(word, cluster);
        decorations.push(
          Decoration.inline(begin, end, {nodeName:'forhan-context-source', 'data-forhan-context-source':'', 'data-forhan-context-cluster':'', style:clusterStyles.source}),
          Decoration.inline(begin, end, {nodeName:'forhan-context-box', 'data-forhan-context-ratio':String(word.ratio), style:clusterStyles.box}),
          Decoration.inline(begin, end, {nodeName:'forhan-context-bidi', 'data-forhan-context-cell':'',role:'presentation',style:clusterStyles.marker}),
        );
        signature.push(begin, end, cluster.advance, cluster.intrinsic, cluster.delta);
      }
      decorations.push(
        Decoration.widget(from,createContextualDirection(view.dom.ownerDocument,word.direction),{side:-1,ignoreSelection:true,key:`context-start-${from}-${to}-${word.direction}`}),
        Decoration.widget(to,createContextualDirection(view.dom.ownerDocument,word.direction),{side:1,ignoreSelection:true,key:`context-end-${from}-${to}-${word.direction}`}),
      );
      signature.push(from, to, word.ratio, word.tracking, word.advance);
      continue;
    }
    decorations.push(
      Decoration.inline(from, to, {nodeName:'forhan-context-source', 'data-forhan-context-source':'', style:styles.source}),
      Decoration.inline(from, to, {nodeName:'forhan-context-box', 'data-forhan-context-ratio':String(word.ratio), style:styles.box}),
      Decoration.inline(from, to, {nodeName:'forhan-context-bidi', 'data-forhan-context-direction':styles.direction}),
    );
    signature.push(from, to, word.ratio, word.intrinsic, word.tracking, word.advance);
  }
  for(/** Glyph advances use inline source ranges so ordinary word wrapping remains available. */const glyph of measureNativeWidths(view.dom)){
    for(let index=0;index<glyph.parts.length;index++){
      /** A complete grapheme contributes its correction only at its last original source fragment. */
      const part=glyph.parts[index],from=view.posAtDOM(part.node,part.from),to=view.posAtDOM(part.node,part.to),spacing=index===glyph.parts.length-1?glyph.advance-glyph.intrinsic:0;
      if(from>=to)continue;
      decorations.push(Decoration.inline(from,to,{nodeName:'forhan-width','data-forhan-width-ratio':String(glyph.ratio),style:`letter-spacing:${spacing}px;font-kerning:none;font-variant-ligatures:none`}));
      signature.push(from,to,spacing,glyph.ratio);
    }
  }
  /** Native character spacing and paragraph condensation remain independent source settings. */
  const originalSpaces=measureNativeSpaces(view.dom),paragraphSpaces=collectParagraphSpaces(view.dom,originalSpaces),
    condensedParagraphs=new Set<HTMLElement>(),spaceRanges=[...paragraphSpaces],paragraphCache:ParagraphSpaceCache=new Map();
  for(/** Only paragraphs with actual adaptive source spaces replace their ordinary base wrappers. */const part of paragraphSpaces)condensedParagraphs.add(part.paragraph);
  if(settle)settleParagraphSpaces(paragraphSpaces);
  /** Ordinary paragraphs retain their original coherent native character-space wrappers. */
  const combined:import('../font-space.ts').NativeSpaceRange[]=[];
  for(/** Unsupported and unconfigured paragraphs retain existing native character-spacing behavior. */const part of originalSpaces){
    /** The actual source paragraph owns its complete independent condensation setting. */
    const paragraph=part.node.parentElement?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
    if(!paragraph||!condensedParagraphs.has(paragraph))combined.push(part);
  }
  combined.push(...spaceRanges);
  for (/** Only measured original ASCII-space ranges receive native word advances. */ const part of combined) {
    /** ProseMirror maps real text offsets through existing character and line wrappers. */
    const from = view.posAtDOM(part.node, part.from),
      to = view.posAtDOM(part.node, part.to);
    if (from >= to) continue;
    if(part.condenseDelta!==undefined){
      /** Rendering updates reuse final corrections only while source, fonts and width remain unchanged. */
      const retained=cached?.get(from);
      if(retained){part.delta=retained.delta;part.condenseDelta=retained.condenseDelta;}
      paragraphCache.set(from,{delta:part.delta,condenseDelta:part.condenseDelta});
    }
    decorations.push(
      Decoration.inline(from, to, {
        nodeName: "forhan-space",
        "data-forhan-space-delta": String(part.delta),
        ...(part.condenseDelta===undefined?{}:{'data-forhan-condense-delta':String(part.condenseDelta)}),
        style: `word-spacing:${part.delta}px${part.resetLetterSpacing?';letter-spacing:0':''}`,
      }),
    );
    signature.push(from, to, part.delta,part.resetLetterSpacing?1:0,part.condenseDelta===undefined?0:1,part.condenseDelta??0);
  }
  return {
    decorations: DecorationSet.create(view.state.doc, decorations),
    signature: signature.join(","),
    paragraphSpaces:paragraphCache,
  };
}

/**
 * Recalculate native spaces after source/font changes while preserving IME ownership.
 *
 * Stable signatures prevent feedback from transparent drawing wrappers. Only
 * decoration state changes; the independent line-layout plugin observes those
 * changes and measures actual new wrapping after native advances have applied.
 * @param {EditorView} view - Actual live view owned by this plugin instance.
 * @returns {{update:(view:EditorView,previous:EditorState)=>void;destroy:()=>void}} Owned rendering lifecycle hooks.
 * @example
 * spaceView(view); // A native flag edit can change line breaks without an extra source edit.
 */
function spaceView(view: EditorView): {
  update: (view: EditorView, previous: EditorState) => void;
  destroy: () => void;
} {
  let frame = 0,
    destroyed = false,
    signature: string | null = null,
    paragraphCache:ParagraphSpaceCache|undefined,
    settling=false,
    observedWidth=-1;
  /** Font readiness belongs to the actual source document and platform. */
  const window = view.dom.ownerDocument.defaultView!,
    fonts = view.dom.ownerDocument.fonts;
  /**
   * Commit actual native word advances after the current source update.
   *
   * IME text remains untouched until composition completes. Layout-only changes
   * cannot create undo entries or make an unchanged document dirty.
   * @returns {void} Replaces drawing geometry only when its measured signature differs.
   * @example
   * // Existing correction wrappers do not keep increasing their own space width.
   */
  function measure(): void {
    frame = 0;
    if (destroyed || view.composing) return;
    /** Independent actual source/advance identity prevents self-triggered rendering loops. */
    const next = spaceDecorations(view,paragraphCache,settling);
    if(settling){paragraphCache=next.paragraphSpaces;settling=false;}
    else if(!paragraphCache&&next.paragraphSpaces.size){settling=true;schedule();}
    if (next.signature === signature) return;
    signature = next.signature;
    view.dispatch(preserveNativeTextSelection(view,
      view.state.tr
        .setMeta(fontSpaceKey, next.decorations)
        .setMeta("addToHistory", false),
    ));
  }
  /**
   * Coalesce native source and font notifications into one drawing frame.
   *
   * A pending font-ready callback becomes harmless after the owning view dies.
   * @returns {void} Requests at most one owned measurement callback.
   * @example
   * // Several same-frame character edits share one actual font measurement.
   */
  function schedule(): void {
    if (!destroyed && !frame) frame = window.requestAnimationFrame(measure);
  }
  /**
   * Rebuild minimum-width line choices after real font or composition changes.
   *
   * Cached source positions cannot outlive the font metrics that produced them.
   * @returns {void} Resets only owned paragraph geometry and schedules one pass.
   * @example
   * // Late native fonts can change which complete word fits a condensed line.
   */
  function reset():void{paragraphCache=undefined;settling=false;signature=null;schedule();}
  /**
   * Reflow adaptive source gaps only when the actual content width changes.
   *
   * Native paragraph height corrections cannot trigger an endless width loop.
   * @param {ResizeObserverEntry[]} entries - Actual owned editor content measurements.
   * @returns {void} Resets active paragraph line choices after a physical width change.
   * @example
   * // Paper orientation changes recompute minimum-space word membership.
   */
  function resized(entries:ResizeObserverEntry[]):void{
    /** Actual CSS content width remains separate from decorated paragraph height. */
    const width=entries[0]?.contentRect.width??0;
    if(width===observedWidth)return;observedWidth=width;if(paragraphCache||settling)reset();
  }
  /** Only this owned source view's content width participates in adaptive wrapping. */
  const observer=new ResizeObserver(resized);
  observer.observe(view.dom);
  /** Ancestor zoom and paper styles can change fractional native wrapping without changing CSS content width. */
  const ancestry=new MutationObserver(reset);
  for(let element=view.dom.parentElement;element;element=element.parentElement)ancestry.observe(element,{attributes:true,attributeFilter:['style','class','data-forhan-line-grid']});
  fonts.addEventListener("loadingdone", reset);
  view.dom.addEventListener("compositionend", reset);
  void fonts.ready.then(reset);
  schedule();
  return {
    /**
     * React to source changes and complete the resulting native correction pass.
     *
     * Source replacement invalidates the old signature even when positions and
     * font advances happen to equal the preceding document.
     * @param {EditorView} current - Updated live view.
     * @param {EditorState} previous - Previous immutable source/decorations.
     * @returns {void} Schedules source or owned geometry changes.
     * @example
     * // An unrelated caret move does not remeasure every source space.
     */
    update(current, previous) {
      if (!current.composing) refreshContextualCellLayout(current.dom);
      if (previous.doc !== current.state.doc){signature=null;paragraphCache=undefined;settling=false;}
      if (
        previous.doc !== current.state.doc ||
        fontSpaceKey.getState(previous) !== fontSpaceKey.getState(current.state)
      )
        schedule();
    },
    /**
     * Release only this view's deferred work and font/composition subscriptions.
     *
     * Detached temporary import editors cannot keep a rendering loop alive.
     * @returns {void} Stops owned layout work without modifying the document.
     * @example
     * // Destroying an editor does not remove another document's font listeners.
     */
    destroy() {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      ancestry.disconnect();
      fonts.removeEventListener("loadingdone", reset);
      view.dom.removeEventListener("compositionend", reset);
    },
  };
}

/** Native ASCII-space drawing is independent of source characters, source marks and line baselines. */
export const NativeFontSpaces = Extension.create({
  name: "forhanNativeFontSpaces",
  /**
   * Install native space advances and lossless clipboard mode annotation.
   *
   * Document serializers still use the original source model; rich copying
   * annotates only a detached fragment to retain the native default on paste.
   * @returns {Plugin[]} One owned drawing/clipboard plugin.
   * @example
   * // HWP/HWPX mode changes are visible before line layout measures wrapping.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: fontSpaceKey,
        state: {
          /**
           * Start without drawing corrections before the DOM has actual font metrics.
           *
           * The first owned frame supplies the real measured native advances.
           * @returns {DecorationSet} Empty initial rendering state.
           * @example
           * // A detached source parser needs no space width measurements.
           */
          init: () => DecorationSet.empty,
          /**
           * Replace or safely map drawing ranges through immutable source updates.
           *
           * Native corrections never alter a source text-style preference.
           * @param {import('@tiptap/pm/state').Transaction} transaction - Current source or layout change.
           * @param {DecorationSet} previous - Previous drawing-only space ranges.
           * @returns {DecorationSet} Measured replacement or mapped source positions.
           * @example
           * // Inserting a character keeps existing ranges attached until remeasurement.
           */
          apply: (transaction, previous) =>
            transaction.getMeta(fontSpaceKey) ??
            previous.map(transaction.mapping, transaction.doc),
        },
        props: {
          /**
           * Supply current native advances to the actual editor DOM renderer.
           *
           * Source text, marks and caret positions remain ordinary model values.
           * @param {EditorState} state - Current live source/decorations.
           * @returns {DecorationSet|undefined} Current native space drawing ranges.
           * @example
           * // Eight ASCII spaces stay eight original source characters.
           */
          decorations: (state) => fontSpaceKey.getState(state),
          /**
           * Retain explicit native modes in rich copied content without editing the source.
           *
           * Ordinary external HTML still defaults to its own intrinsic font spacing.
           * @param {Slice} slice - Actual copied source selection.
           * @param {EditorView} view - Owning source schema and view.
           * @returns {Slice} Same text/structure/open depths with explicit clipboard preferences.
           * @throws {RangeError} If a stored source preference is invalid.
           * @example
           * // Copy/paste of newly authored default text does not switch to intrinsic spaces.
           */
          transformCopied: (slice, view) =>
            new Slice(
              stampCopiedSpaces(
                slice.content,
                view.state.schema.marks.textStyle,
              ),
              slice.openStart,
              slice.openEnd,
            ),
        },
        view: spaceView,
      }),
    ];
  },
});
