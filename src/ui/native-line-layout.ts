import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { measureNativeParagraph,nativeDocumentZoom,nativeLineBaseline,type NativeParagraphLayout } from "../native-line-layout.ts";
import {createNativeGridFlow,applyNativeGrid} from '../native-grid-layout.ts';
import type {PageSettings} from '../types.ts';
import {measureNativeSheets,renderNativeSheets} from './native-sheets.ts';
import {measureNativeSheetShading,measureComposingSheetShading,renderNativeSheetShading} from './native-sheet-shading.ts';
import {setNativeSheetCursorLines,nativeSheetKeyDown,nativeSheetBeforeInput,nativeSheetScrollToSelection,nativeSheetCaretBounds,nativeSheetSourcePage,flushNativeSheetScroll,type NativeSheetCursorLine} from './native-sheet-selection.ts';
import {readNativePageView} from './native-page-view.ts';
import { fontSpaceKey } from "./font-space.ts";
import { preserveNativeTextSelection } from "./native-selection.ts";

/** Rendering geometry has its own plugin state and never becomes document formatting. */
const layoutKey = new PluginKey<DecorationSet>("forhan-native-lines");

/**
 * Show the actual caret page and complete measured physical page count.
 *
 * Status follows the unchanged source selection rather than the scroll thumb.
 * Bounds are read after drawing decorations have reached the live editor DOM.
 * @param {EditorView} view - Actual live application editor view.
 * @returns {void} Updates only the existing native page status label.
 * @example
 * refreshNativeSheetStatus(view); // Moving the caret to the next sheet updates the page label.
 */
function refreshNativeSheetStatus(view:EditorView):void{
  /** Detached temporary editors cannot update application status. */
  const paper=view.dom.closest<HTMLElement>('#paper'),label=view.dom.ownerDocument.querySelector<HTMLElement>('.native-status-page');
  if(!paper||!label||view.dom.parentElement?.id!=='editor')return;
  /** Current physical placement is observed from the actual source caret rectangle. */
  const count=Number(paper.dataset.forhanPageCount)||1,stride=Number(paper.dataset.forhanPageStride),
    bounds=nativeSheetCaretBounds(view)??view.coordsAtPos(view.state.selection.head),offset=(bounds.top-paper.getBoundingClientRect().top)/nativeDocumentZoom(view.dom),
    current=paper.classList.contains('native-grid-paper')?(nativeSheetSourcePage(view)??0)+1:stride?Math.max(1,Math.min(count,Math.floor(offset/stride)+1)):1,text=`${current}/${count}쪽`;
  if(label.textContent!==text)label.textContent=text;
  /** The native horizontal ruler follows the active physical source page, including a right-hand facing page. */
  const ruler=paper.closest('.canvas')?.querySelector<HTMLElement>(':scope > .ruler'),sheet=paper.querySelector<HTMLElement>(`.native-sheet-background[data-page-index="${current-1}"]`);
  if(ruler){
    /** Stable relative cell alignment preserves the existing single-paper ruler framing. */
    const frame=paper.getBoundingClientRect(),cell=sheet?.getBoundingClientRect(),offset=paper.classList.contains('native-grid-paper')&&cell?cell.left-frame.left-(frame.width-cell.width)/2:0,
      transform=offset?`translateX(${Math.round(offset*64)/64}px)`:'';
    if(ruler.style.transform!==transform)ruler.style.transform=transform;
  }
}

/**
 * Observe actual lines and build drawing-only native paragraph decorations.
 *
 * The editable model, text offsets and native source attributes remain intact.
 * Paragraph height and text drawing offsets are applied together so fixed-zero
 * lines do not accumulate the browser's parent-font strut height.
 * @param {EditorView} view - Fully initialized live ProseMirror view.
 * @param {PageSettings|null} page - Independent physical source settings for the application editor.
 * @returns {{decorations:DecorationSet;signature:string}} Measured decorations and stable geometry identity.
 * @example
 * const next = nativeLineDecorations(view,page); // Does not edit view.state.doc.
 */
function nativeLineDecorations(view: EditorView,page:PageSettings|null): {
  decorations: DecorationSet;
  signature: string;
} {
  /** Plans are collected before one layout-only transaction changes their DOM. */
  const decorations: Decoration[] = [],
    signature: (number | string)[] = [],
    grid=createNativeGridFlow(view.dom,nativeDocumentZoom(view.dom),view.dom.parentElement??view.dom),
    plans:{position:number;size:number;plan:NativeParagraphLayout}[]=[];
  view.state.doc.descendants(
    /**
     * Measure an authored paragraph using its actual rendered text positions.
     *
     * Unsupported native contexts retain normal browser rendering for now.
     * Descending into containers still covers list and table paragraphs.
     * @param {import('@tiptap/pm/model').Node} node - Actual document node.
     * @param {number} position - Unchanged model position before that node.
     * @returns {void} Adds rendering decorations for supported paragraphs.
     * @example
     * // A table cell's paragraph can have its own fixed line interval.
     */
    (node, position) => {
      if (node.type.name !== "paragraph" && node.type.name !== "heading")
        return;
      /** A model paragraph must have a real element before layout can be measured. */
      const element = view.nodeDOM(position);
      if (!(element instanceof HTMLElement)) return;
      /** Source spacing and measured browser geometry remain separate in the plan. */
      const plan = measureNativeParagraph(element);
      if (!plan) return;
      plans.push({position,size:node.nodeSize,plan});
    },
  );
  /** Complete native pages are planned before any original paragraph height changes. */
  const sheets=page?measureNativeSheets(view.dom,plans.map(
    /**
     * Read one original paragraph plan without copying or changing its source.
     *
     * Ordered source ownership is retained for shared physical pagination.
     * @param {{plan:NativeParagraphLayout}} entry - One measured original model block.
     * @returns {NativeParagraphLayout} Original rendering plan.
     * @example
     * // Nested paragraphs remain detectable as unsupported complete-page source.
     */
    entry=>entry.plan),page):null;
  renderNativeSheets(view.dom,sheets);
  renderNativeSheetShading(view.dom,sheets?measureNativeSheetShading(view.dom,plans.map(
    /**
     * Read one measured original paragraph for independent inline source paint.
     *
     * Native line placements keep the original source order and ownership.
     * @param {{plan:NativeParagraphLayout}} entry - Original measured model paragraph.
     * @returns {NativeParagraphLayout} Same original drawing-only paragraph plan.
     * @example
     * // Background projection cannot split an authored paragraph.
     */
    entry=>entry.plan),sheets):null);
  /** Complete top-level source lines retain navigation even when independent paint prevents page projection. */
  const cursorLines:NativeSheetCursorLine[]=[],paper=view.dom.closest<HTMLElement>('#paper'),
    cursorSourceComplete=!!paper&&plans.length===view.dom.children.length&&plans.every(
      /**
       * Require every measured source block to belong directly to the original editor.
       *
       * Nested table or list fragments cannot establish complete document navigation.
       * Independent glyph drawings may prevent paper projection without invalidating source line geometry.
       * @param {{plan:NativeParagraphLayout}} entry - One actual measured original block.
       * @returns {boolean} Whether this block retains complete top-level source ownership.
       * @example
       * // A native-width paragraph keeps its own caret edges without moving auxiliary paint.
       */
      entry=>entry.plan.element.parentElement===view.dom);
  for(/** Model blocks retain their original offsets regardless of their physical page count. */const {position,size,plan} of plans){
    if(!sheets)applyNativeGrid(plan,grid,nativeDocumentZoom(plan.element));
    let trailingGap:number|null=null;
    if(sheets)for(/** Original break rectangles must follow physical line placement just like original text. */const line of plan.lines){
      if(!line.placeholder)continue;
      /** Rendering-only caret corrections are quantized at effective browser layout precision. */
      const placeholder=line.placeholder,shift=Math.round((line.baseline-placeholder.browserBaseline)*nativeDocumentZoom(view.dom)*64)/64/nativeDocumentZoom(view.dom);
      if(placeholder.element.classList.contains('ProseMirror-trailingBreak')){
        /** An owned zero-height flow spacer moves the actual empty caret, including native IME candidate geometry. */
        const previous=Number(plan.element.querySelector<HTMLElement>('[data-forhan-caret-flow]')?.dataset.forhanCaretFlow)||0;
        trailingGap=Math.round((previous+line.baseline-placeholder.browserBaseline)*nativeDocumentZoom(view.dom)*64)/64/nativeDocumentZoom(view.dom);
      }
      else{
        /** An authored hard break retains its own original one-position model range. */
        const from=view.posAtDOM(placeholder.element,0);
        decorations.push(Decoration.inline(from,from+1,{nodeName:'forhan-break',style:`position:relative;top:${shift}px;left:${(line.shiftX??0)-(plan.shiftX??0)}px`,'data-forhan-break-shift':String(shift),'data-forhan-break-shift-x':String((line.shiftX??0)-(plan.shiftX??0))}));
        signature.push(from,shift,(line.shiftX??0)-(plan.shiftX??0));
      }
    }
    if(trailingGap!==null){
      /** An empty continuation needs real native caret flow without inserting an authored character. */
      const gap=trailingGap,at=position+size-1;
      decorations.push(Decoration.widget(at,
        /**
         * Create one noneditable empty-line caret flow spacer outside source serialization.
         *
         * A block margin moves the browser's actual trailing caret for positive
         * page gaps and intentional negative overlap alike. No text is added.
         * @returns {HTMLElement} Owned zero-height source-free caret spacer.
         * @example
         * // The IME caret follows a blank continuation onto its physical native sheet.
         */
        ()=>{
          /** Only the owned view document creates this rendering-only auxiliary element. */
          const spacer=view.dom.ownerDocument.createElement('span');spacer.dataset.forhanCaretFlow=String(gap);
          spacer.setAttribute('aria-hidden','true');spacer.style.cssText=`display:block;width:0;height:0;margin-top:${gap}px`;
          return spacer;
        },{side:-1,key:`native-caret:${at}:${gap}`}));
    }
    decorations.push(Decoration.node(position,position+size,{style:`height:${plan.height}px${plan.shiftX?`;position:relative;left:${plan.shiftX}px`:''}`,
      'data-forhan-layout-height':String(plan.height),'data-forhan-paragraph-shift-x':String(plan.shiftX??0)}));
    signature.push(position,plan.height,trailingGap??'',plan.shiftX??0);
    /** Every physical line retains its source endpoints, including genuine empty hard-break lines. */
    const firstPositions:number[]=[],lastPositions:number[]=[];
    for(/** Each original text fragment retains its original source and character marks. */const range of plan.ranges){
      /** Existing rendering wrappers are resolved through the actual live source mapping. */
      const from=view.posAtDOM(range.node,range.from),to=view.posAtDOM(range.node,range.to);
      if(from>=to)continue;
      firstPositions[range.line]??=from;lastPositions[range.line]=to;
      decorations.push(Decoration.inline(from,to,{nodeName:'forhan-line',style:`position:relative;top:${range.shift}px;left:${range.shiftX??0}px`,
        'data-forhan-line-shift':String(range.shift),'data-forhan-line-shift-x':String(range.shiftX??0),'data-forhan-visual-line':`${position}:${range.line}`}));
      signature.push(from,to,range.shift,range.shiftX??0);
    }
    if(cursorSourceComplete)for(let line=0;line<plan.lines.length;line++){
      /** Empty source lines remain addressable without adding visible or serialized characters. */
      const source=plan.lines[line],from=firstPositions[line]??(source.breakBefore?view.posAtDOM(source.breakBefore,0)+1:position+1);
      cursorLines.push({from,to:lastPositions[line]??from,key:`${position}:${line}`,height:source.fontSize,page:source.page??0,pageX:source.shiftX??0,top:(plan.element.getBoundingClientRect().top-paper!.getBoundingClientRect().top)/nativeDocumentZoom(view.dom)+source.baseline-nativeLineBaseline(source.fontSize)});
    }
  }
  setNativeSheetCursorLines(view,cursorSourceComplete?cursorLines:null);
  return {
    decorations: DecorationSet.create(view.state.doc, decorations),
    signature: signature.join(","),
  };
}

/**
 * Schedule native measurements after actual editor, font and width changes.
 *
 * Composition owns its DOM until completion. Layout-only transactions never
 * enter undo history; stable signatures stop their updates from feeding back.
 * Observers and pending animation frames are released with the owned view.
 * @param {EditorView} view - Live editor view owned by this plugin instance.
 * @param {()=>PageSettings|null} getPage - Reads independent current physical source settings.
 * @returns {{update:(view:EditorView,previous:EditorState)=>void;destroy:()=>void}} Owned plugin lifecycle hooks.
 * @example
 * nativeLineView(view,getPage); // Reflow follows width and installed-font readiness.
 */
function nativeLineView(view: EditorView,getPage:()=>PageSettings|null): {
  update: (view: EditorView, previous: EditorState) => void;
  destroy: () => void;
} {
  let frame = 0,
    destroyed = false,
    signature: string | null = null,
    width = -1;
  /** Font readiness belongs to the actual editor document rather than a global test window. */
  const window = view.dom.ownerDocument.defaultView!,
    fonts = view.dom.ownerDocument.fonts;
  /**
   * Commit measured drawing geometry after the current document update.
   *
   * No source transaction is synthesized while an IME owns composing text.
   * @returns {void} Updates only plugin decoration state when geometry differs.
   * @example
   * // Repeated frames with identical baselines do not dispatch more transactions.
   */
  function measure(): void {
    frame = 0;
    if (destroyed) return;
    if(view.composing){
      /** Native preedit owns its DOM; only actual outside-source background paint may follow provisional glyphs. */
      const paper=view.dom.closest<HTMLElement>('#paper'),marks=view.state.storedMarks??view.state.selection.$from.marks(),color=marks.find(
        /**
         * Read the current original text-style source mark during native composition.
         *
         * No mark or provisional text node is created by paint observation.
         * @param {import('@tiptap/pm/model').Mark} mark - Actual current source mark.
         * @returns {boolean} Whether this original mark owns the text background.
         * @example
         * // An empty colored continuation can retain its stored native shade.
         */
        mark=>mark.type.name==='textStyle')?.attrs.backgroundColor;
      if(paper?.classList.contains('native-sheet-shading'))renderNativeSheetShading(view.dom,measureComposingSheetShading(view.dom,typeof color==='string'?color:null));
      return;
    }
    /** Real browser geometry is recalculated from the current immutable document. */
    const next = nativeLineDecorations(view,getPage());
    refreshNativeSheetStatus(view);
    if (next.signature === signature){flushNativeSheetScroll(view);refreshNativeSheetStatus(view);return;}
    signature = next.signature;
    view.dispatch(preserveNativeTextSelection(view,
      view.state.tr
        .setMeta(layoutKey, next.decorations)
        .setMeta("addToHistory", false),
    ));
    refreshNativeSheetStatus(view);
  }
  /**
   * Coalesce source, font and resize notifications into one rendering frame.
   *
   * Composition completion schedules another measurement through its listener.
   * @returns {void} Requests one owned animation callback unless already pending.
   * @example
   * schedule(); // Several same-frame edits share one actual layout read.
   */
  function schedule(): void {
    if (!destroyed && !frame) frame = window.requestAnimationFrame(measure);
  }
  /**
   * Reflow after a real content width change without looping on native height.
   *
   * Paragraph-height corrections can resize the editor vertically; only width
   * changes require another line-breaking measurement from this observer.
   * @param {ResizeObserverEntry[]} entries - Actual root resize notifications.
   * @returns {void} Schedules measurement only for a changed content width.
   * @example
   * // Switching paper orientation changes available line width.
   */
  function resized(entries: ResizeObserverEntry[]): void {
    /** One owned content root is observed, with width in unzoomed CSS pixels. */
    const nextWidth = entries[0]?.contentRect.width ?? 0;
    if (nextWidth === width) return;
    width = nextWidth;
    schedule();
  }
  /** Width and font readiness determine actual line breaks independently of model edits. */
  const observer = new ResizeObserver(resized);
  observer.observe(view.dom);
  /** Ancestor zoom changes can alter fractional font rounding without changing content width. */
  const ancestry = new MutationObserver(schedule);
  for (
    let element = view.dom.parentElement;
    element;
    element = element.parentElement
  )
    ancestry.observe(element, {
      attributes: true,
      attributeFilter: ["style", "class", "data-forhan-line-grid", "data-native-page-view"],
    });
  fonts.addEventListener("loadingdone", schedule);
  view.dom.addEventListener("compositionstart", schedule);
  view.dom.addEventListener("compositionupdate", schedule);
  view.dom.addEventListener("compositionend", schedule);
  /** Only physical raster alignment changes when an independently shaded source scrolls. */
  const canvas=view.dom.closest<HTMLElement>('.canvas');
  /**
   * Follow actual source-paint alignment when its viewport scrolls or resizes.
   *
   * Centered paper can move without changing its content width. Only the
   * external source shading needs new raster alignment; plain documents retain
   * their existing path without extra measurement or source transactions.
   * @returns {void} Schedules only independently shaded physical source paint.
   * @example
   * // Resizing centered paper cannot leave its original shade at a stale half-pixel origin.
   */
  function viewportChanged():void{
    /** Automatic and horizontal arrangements can change physical source cells without changing their authored width. */
    const paper=view.dom.closest<HTMLElement>('#paper'),pageView=paper?readNativePageView(paper):null;
    if(paper&&(paper.classList.contains('native-sheet-shading')||pageView?.shape!=='single'||pageView.direction!=='vertical'))schedule();
  }
  canvas?.addEventListener('scroll',viewportChanged,{passive:true});
  /** Canvas size changes can move centered paper while leaving the source editor's own size unchanged. */
  const viewportObserver=canvas?new ResizeObserver(viewportChanged):null;
  if(canvas)viewportObserver?.observe(canvas);
  void fonts.ready.then(schedule);
  schedule();
  return {
    /**
     * Recompute geometry after source or mapped decoration state changes.
     *
     * A source edit invalidates the signature even if its numerical geometry
     * happens to equal the previous layout at the same positions.
     * @param {EditorView} current - Updated live view.
     * @param {EditorState} previous - Previous immutable editor state.
     * @returns {void} Schedules a read after source or layout updates.
     * @example
     * // Typing retains normal source history while moving later visual lines.
     */
    update(current, previous) {
      if (previous.doc !== current.state.doc){
        signature = null;
        setNativeSheetCursorLines(current,null);
      }
      if (
        !previous.selection.eq(current.state.selection) ||
        previous.doc !== current.state.doc ||
        fontSpaceKey.getState(previous) !== fontSpaceKey.getState(current.state) ||
        layoutKey.getState(previous) !== layoutKey.getState(current.state)
      )
        schedule();
    },
    /**
     * Release only this view's observers and deferred geometry work.
     *
     * A pending font-ready promise becomes harmless after destruction.
     * @returns {void} Disconnects the owned rendering lifecycle.
     * @example
     * // Temporary import editors do not leave resize or font listeners behind.
     */
    destroy() {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      ancestry.disconnect();
      renderNativeSheets(view.dom,null);
      renderNativeSheetShading(view.dom,null);
      setNativeSheetCursorLines(view,null);
      fonts.removeEventListener("loadingdone", schedule);
      view.dom.removeEventListener("compositionstart", schedule);
      view.dom.removeEventListener("compositionupdate", schedule);
      view.dom.removeEventListener("compositionend", schedule);
      canvas?.removeEventListener('scroll',viewportChanged);
      viewportObserver?.disconnect();
    },
  };
}

/** Native rendering geometry is kept out of document attributes, serialization and undo. */
export const NativeLineLayout = Extension.create<{getPage:()=>PageSettings|null}>({
  name: "forhanNativeLineLayout",
  /**
   * Supply optional independent physical source settings for the actual application editor.
   *
   * Standalone and temporary editors retain ordinary measured paragraph flow.
   * @returns {{getPage:()=>PageSettings|null}} Independent page source reader.
   * @example
   * NativeLineLayout.configure({getPage}); // No physical settings enter document attributes.
   */
  addOptions(){return {
    /**
     * Leave physical sheet ownership unset for standalone editor instances.
     *
     * The application explicitly supplies its independent document page state.
     * @returns {null} No application paper ownership by default.
     * @example
     * // Temporary import editors cannot modify the main application's paper.
     */
    getPage:()=>null,
  };},
  /**
   * Register drawing-only native line geometry with the editor lifecycle.
   *
   * Existing source attributes continue to drive all native format writers.
   * @returns {Plugin[]} One plugin owning its decorations and measurement observers.
   * @example
   * // Native fixed-zero overlap does not add formatting transactions to undo.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: layoutKey,
        state: {
          /**
           * Begin without geometry until the editor has an actual DOM layout.
           *
           * The first owned rendering frame supplies measured decorations.
           * @returns {DecorationSet} Empty initial rendering state.
           * @example
           * // Detached temporary serializers do not need measured font geometry.
           */
          init: () => DecorationSet.empty,
          /**
           * Retain or replace decorations without changing the source document.
           *
           * Ordinary source edits map existing ranges until the next frame.
           * @param {import('@tiptap/pm/state').Transaction} transaction - Current source or layout transaction.
           * @param {DecorationSet} previous - Previous rendering-only ranges.
           * @returns {DecorationSet} Measured replacement or safely mapped ranges.
           * @example
           * // Inserting text keeps decorations attached to their source positions.
           */
          apply: (transaction, previous) =>
            transaction.getMeta(layoutKey) ??
            previous.map(transaction.mapping, transaction.doc),
        },
        props: {
          handleKeyDown:nativeSheetKeyDown,
          handleScrollToSelection:nativeSheetScrollToSelection,
          handleDOMEvents:{beforeinput:nativeSheetBeforeInput},
          /**
           * Supply current rendering-only native text positions to ProseMirror.
           *
           * HTML and native serializers still operate on the original model.
           * @param {EditorState} state - Actual current editor state.
           * @returns {DecorationSet|undefined} Native drawing ranges for this view.
           * @example
           * // Selection and document content keep their original model offsets.
           */
          decorations: (state) => layoutKey.getState(state),
        },
        /**
         * Bind independent physical source state to one owned live rendering lifecycle.
         *
         * The source reader remains current after page history and file loading.
         * @param {EditorView} view - Actual initialized editor view.
         * @returns {ReturnType<typeof nativeLineView>} Owned measurement and cleanup hooks.
         * @example
         * // Page changes reflow existing source without inserting page nodes.
         */
        view:(view)=>nativeLineView(view,this.options.getPage),
      }),
    ];
  },
});
