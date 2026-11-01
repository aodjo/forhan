import {AllSelection,TextSelection} from '@tiptap/pm/state';
import type {EditorView} from '@tiptap/pm/view';
import {preserveNativeTextSelection} from './native-selection.ts';
import {nativeDocumentZoom} from '../native-line-layout.ts';
import {nativeHasRightToLeftText} from '../native-bidi.ts';

/** Original editable positions identify a visual line without splitting source paragraphs. */
export interface NativeSheetCursorLine {
  from:number;
  to:number;
  key:string;
  top:number;
  height:number;
  /** Physical source page and horizontal cell origin remain separate from authored model positions. */
  page?:number;
  pageX?:number;
}
/** Each owned editor retains only source positions and its current vertical movement goal. */
interface NativeSheetCursor {
  lines:NativeSheetCursorLine[];
  goal:{offset:number;head:number}|null;
}
/** Weak ownership prevents destroyed temporary or application editors from retaining documents. */
const cursors=new WeakMap<EditorView,NativeSheetCursor>();
/** Source edits can request scrolling before their new physical drawing geometry reaches the DOM. */
const pendingScroll=new WeakSet<EditorView>();
/** Original 125-percent captures retain fifty viewport pixels of caret context at 10, 16 and 24 points. */
const NATIVE_SELECTION_CONTEXT=50;

/**
 * Read the actual source page without assuming a vertical sheet stack.
 *
 * Source intervals and live visual-line affinity distinguish pages in one row
 * and endpoints shared by soft-wrap lines without changing the selection.
 * @param {EditorView} view - Actual owning original source editor.
 * @returns {number | null} Zero-based current physical source page or no complete map.
 * @example
 * nativeSheetSourcePage(view); // A right-hand sheet retains its original source page number.
 */
export function nativeSheetSourcePage(view:EditorView):number|null{
  /** Actual DOM affinity has priority at a shared visual-line endpoint. */
  const selection=view.state.selection,dom=view.dom.ownerDocument.getSelection(),focus=dom?.focusNode,
    element=focus?.nodeType===Node.ELEMENT_NODE?focus as Element:focus?.parentElement,
    key=element?.closest('[data-forhan-visual-line]')?.getAttribute('data-forhan-visual-line');
  let page:number|null=null;
  for(/** Every candidate retains its original authored source interval. */const line of cursors.get(view)?.lines??[])if(selection.head>=line.from&&selection.head<=line.to){page??=line.page??null;if(line.key===key)return line.page??page;}
  return page;
}

/**
 * Move the source caret to the first original line of a physical page.
 *
 * Native page buttons move the actual caret even when both destination papers
 * are already visible. The original line map supplies a model position without
 * splitting paragraphs or adding an undo entry. Active IME composition remains
 * owned by the installed input method.
 * @param {EditorView} view - Actual owning original source view.
 * @param {number} page - Zero-based physical source destination.
 * @returns {boolean} Whether a complete original page map handled navigation.
 * @example
 * nativeSheetGoToPage(view,1); // The caret and ruler follow the right-hand second page.
 */
export function nativeSheetGoToPage(view:EditorView,page:number):boolean{
  if(view.composing||!Number.isInteger(page)||page<0)return false;
  for(/** The first original visual line establishes the actual native page start. */const line of cursors.get(view)?.lines??[])if(line.page===page){
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,line.from)).setMeta('addToHistory',false).scrollIntoView());
    view.focus();nativeSheetScrollToSelection(view);return true;
  }
  return false;
}

/**
 * Read the actual source caret independently of unshifted outer inline wrappers.
 *
 * ProseMirror can report a word-spacing wrapper's original flow rectangle at
 * the end of a marked word, although the browser's real text caret follows its
 * shifted child. A collapsed source range retains the actual physical point.
 * Genuine native focus affinity takes priority over a model DOM lookup.
 * @param {EditorView} view - Actual owning source editor.
 * @param {number} [position=view.state.selection.head] - Original model position to observe.
 * @returns {{left:number;right:number;top:number;bottom:number}|null} Actual physical source caret, or no reliable text rectangle.
 * @throws {Error} If source mapping fails outside a transient range mismatch.
 * @example
 * nativeSheetCaretBounds(view); // A committed colored word retains its real second-sheet caret.
 */
export function nativeSheetCaretBounds(view:EditorView,position=view.state.selection.head):{left:number;right:number;top:number;bottom:number}|null{
  try{
    /** Native source endpoints retain soft-wrap affinity without reading generated paint. */
    const document=view.dom.ownerDocument,selection=document.getSelection(),focus=selection?.focusNode;
    let node:Node,offset:number;
    if(focus&&view.dom.contains(focus)&&view.posAtDOM(focus,selection!.focusOffset)===position){node=focus;offset=selection!.focusOffset;}
    else{
      /** Backward source affinity reaches the actual preceding text leaf at a marked word end. */
      const point=view.domAtPos(position,-1);node=point.node;offset=point.offset;
    }
    /** Auxiliary noneditable paint and caret spacers cannot become original source points. */
    const parent=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
    if(parent?.closest('svg,[contenteditable="false"]'))return null;
    /** A detached empty range reads the real native caret without changing the browser selection. */
    const range=document.createRange();range.setStart(node,offset);range.collapse(true);
    /** Empty block ranges without a reliable physical caret retain ordinary fallback handling. */
    const box=range.getBoundingClientRect();
    if(box.height<=0||box.width>1||!Number.isFinite(box.left+box.right+box.top+box.bottom))return null;
    return{left:box.left,right:box.right,top:box.top,bottom:box.bottom};
  }catch(error){if(error instanceof RangeError)return null;throw error;}
}

/**
 * Finish a source scroll request after physical drawing geometry has settled.
 *
 * Only an actual earlier selection-scroll request can trigger this action.
 * Rendering-only updates and ordinary viewport movement cannot create a new
 * source scroll. Pending ownership is released before the actual scroll runs.
 * @param {EditorView} view - Actual owning editable source view.
 * @returns {void} Completes one pending physical selection-scroll request.
 * @example
 * flushNativeSheetScroll(view); // An empty new continuation becomes visible after its caret flow moves.
 */
export function flushNativeSheetScroll(view:EditorView):void{
  if(!pendingScroll.has(view))return;
  pendingScroll.delete(view);nativeSheetScrollToSelection(view);
}

/**
 * Replace a selected native source range with committed ordinary text.
 *
 * Chromium can discard the first inserted character when its native editing
 * default deletes a range spanning physically shifted inline wrappers. The
 * unchanged source selection owns this replacement and its next caret. Native
 * composition, collapsed typing, paste and deletion retain ordinary ownership.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {InputEvent} event - Original browser beforeinput event.
 * @returns {boolean} Whether the source transaction handled a committed range replacement.
 * @example
 * nativeSheetBeforeInput(view,event); // Replacing two physical rows with CHANGED retains its first C.
 */
export function nativeSheetBeforeInput(view:EditorView,event:InputEvent):boolean{
  if((!cursors.has(view)&&!view.dom.querySelector('forhan-width,[data-forhan-width-ratio]'))||view.composing||event.isComposing||event.defaultPrevented||event.inputType!=='insertText'||!event.data)return false;
  /** Pending genuine DOM endpoints are resolved before replacing their unchanged source. */
  const transaction=preserveNativeTextSelection(view,view.state.tr.setMeta('addToHistory',false));
  if(!(transaction.selection instanceof TextSelection))return false;
  if(transaction.selection.empty){
    if(!transaction.selection.eq(view.state.selection))view.dispatch(transaction);
    return false;
  }
  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(transaction.selection).insertText(event.data).setMeta('uiEvent','input').scrollIntoView());return true;
}

/**
 * Commit an original source caret with explicit text-leaf affinity.
 *
 * Native vector copies can leave an equivalent model endpoint before an
 * auxiliary drawing. Source-side DOM affinity keeps immediate arrows and
 * typing in actual editable text without adding source or undo history.
 * @param {EditorView} view - Actual owning original source editor.
 * @param {number} anchor - Valid original source selection anchor.
 * @param {number} head - Valid original source selection head.
 * @param {1|-1} side - Preferred source leaf at the destination boundary.
 * @returns {void} Commits one history-free source selection and its genuine DOM endpoints.
 * @throws {RangeError} If an original model endpoint is invalid.
 * @example
 * commitNativeSourceCaret(view,2,2,1); // The next ordinary key follows the first original glyph.
 */
function commitNativeSourceCaret(view:EditorView,anchor:number,head:number,side:1|-1):void{
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,anchor,head)).setMeta('addToHistory',false).scrollIntoView());
  /** Actual source DOM lookup never uses a drawing's text or an expected screen coordinate. */
  const focus=view.domAtPos(head,side),start=anchor===head?focus:view.domAtPos(anchor,anchor<=head?1:-1);
  view.dom.ownerDocument.getSelection()?.setBaseAndExtent(start.node,start.offset,focus.node,focus.offset);
}

/**
 * Synchronize genuine pending source endpoints before keymaps and keypress input.
 *
 * A browser caret can move away from a prior AllSelection before its asynchronous
 * selectionchange notification reaches the model. Some platforms insert text
 * from keypress before beforeinput, so the original source selection must be
 * committed at the initial DOM keydown phase. The key itself remains unconsumed.
 * @param {EditorView} view - Actual owning original source editor.
 * @param {KeyboardEvent} event - Original editor keydown event.
 * @returns {false} Always preserves normal ownership of the original keyboard event.
 * @example
 * nativeSheetKeySelection(view,event); // Typing at a pending C caret cannot replace the previously selected whole document.
 */
export function nativeSheetKeySelection(view:EditorView,event:KeyboardEvent):false{
  if(view.composing||event.isComposing||event.defaultPrevented||event.keyCode===229)return false;
  /** Only independently observed genuine source endpoints can replace an older model selection. */
  const transaction=preserveNativeTextSelection(view,view.state.tr.setMeta('addToHistory',false)),selection=transaction.selection;
  if(transaction.selectionSet&&selection instanceof TextSelection&&!selection.eq(view.state.selection))commitNativeSourceCaret(view,selection.anchor,selection.head,selection.head>=selection.anchor?1:-1);
  return false;
}

/**
 * Advance native-width left-to-right source by complete original graphemes.
 *
 * Negative native letter spacing and interleaved vector copies can make a
 * browser arrow enter a wrapper or jump an entire source word. Ordinary
 * unmodified arrows in an eligible original text block commit logical source
 * boundaries directly. Unicode bidi runs, objects, word shortcuts, cross-block
 * selections and active composition retain their existing native handling.
 * @param {EditorView} view - Actual owning original source editor.
 * @param {KeyboardEvent} event - Original source keyboard event.
 * @returns {boolean} Whether one complete original grapheme movement was committed.
 * @example
 * nativeWidthHorizontalKeyDown(view,event); // A, woman-technologist and B retain three source graphemes.
 */
function nativeWidthHorizontalKeyDown(view:EditorView,event:KeyboardEvent):boolean{
  if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.metaKey||event.ctrlKey||event.altKey||event.isComposing||view.composing)return false;
  /** A pending genuine DOM caret can follow an earlier whole-document selection. */
  const selection=preserveNativeTextSelection(view,view.state.tr.setMeta('addToHistory',false)).selection;
  if(!(selection instanceof TextSelection)||!selection.$head.depth||!selection.$head.parent.inlineContent||selection.$from.parent!==selection.$to.parent)return false;
  /** Only the current original text block's owned width wrappers request source navigation. */
  const parent=selection.$head.parent,element=view.nodeDOM(selection.$head.before());
  if(!(element instanceof HTMLElement)||!element.querySelector('forhan-width,[data-forhan-width-ratio]')||getComputedStyle(element).direction==='rtl')return false;
  for(let index=0;index<parent.childCount;index++){
    /** Source objects keep ordinary object-selection semantics rather than being skipped as text. */
    const child=parent.child(index);if(!child.isText&&child.type.name!=='hardBreak')return false;
  }
  /** Original UTF-16 source positions remain independent from rendered glyph widths. */
  const text=parent.textBetween(0,parent.content.size,'\n','\ufffc');
  if(text.length!==parent.content.size||nativeHasRightToLeftText(text))return false;
  let position:number|undefined;
  if(!selection.empty&&!event.shiftKey)position=event.key==='ArrowLeft'?selection.from:selection.to;
  else{
    /** Browser-independent grapheme boundaries preserve surrogate pairs, combining marks and joiners. */
    const offset=selection.$head.parentOffset,start=selection.$head.start(),segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'});
    if(event.key==='ArrowRight'){
      for(/** The next complete source cluster is never split into UTF-16 units. */const part of segmenter.segment(text))if(part.index+part.segment.length>offset){position=start+part.index+part.segment.length;break;}
    }else{
      for(/** Only complete source cluster starts can become a backward caret destination. */const part of segmenter.segment(text))if(part.index<offset)position=start+part.index;else break;
    }
  }
  if(position===undefined)return false;
  commitNativeSourceCaret(view,event.shiftKey?selection.anchor:position,position,event.key==='ArrowRight'?-1:1);return true;
}

/**
 * Keep independently projected native caret context visible during source navigation.
 *
 * Controlled original captures retain fifty viewport pixels below the
 * active native character box regardless of its font height. Native source geometry provides
 * that box independently from the browser's taller inline caret. Actual text
 * ranges retain physical caret ownership when outer inline wrappers stay in
 * their original flow. Pending source changes finish after drawing settles.
 * @param {EditorView} view - Actual source editor requesting selection visibility.
 * @returns {boolean} Whether owned physical source geometry handled selection scrolling.
 * @example
 * nativeSheetScrollToSelection(view); // Down twenty lines preserves the original native page-boundary viewport.
 */
export function nativeSheetScrollToSelection(view:EditorView):boolean{
  /** Temporary, unsupported and composing source retains its established native browser ownership. */
  const cursor=cursors.get(view),paper=view.dom.closest<HTMLElement>('#paper'),canvas=view.dom.closest<HTMLElement>('.canvas');
  if(!paper||!canvas||!paper.classList.contains('native-paged-paper')||view.composing||!(view.state.selection instanceof TextSelection))return false;
  /** The actual source endpoint resolves shared visual wrap boundaries through its owned line key. */
  const selection=view.state.selection,dom=view.dom.ownerDocument.getSelection(),focus=dom?.focusNode,
    element=focus?.nodeType===Node.ELEMENT_NODE?focus as Element:focus?.parentElement,key=element?.closest('[data-forhan-visual-line]')?.getAttribute('data-forhan-visual-line');
  let target:NativeSheetCursorLine|undefined;
  for(/** Original source intervals remain independent from native physical page gaps. */const line of cursor?.lines??[])if(selection.head>=line.from&&selection.head<=line.to){target??=line;if(line.key===key){target=line;break;}}
  /** A changed source document can precede its next complete physical line map. */
  const caret=nativeSheetCaretBounds(view);
  if(!target){pendingScroll.add(view);if(!caret)return true;}
  /** Native raster geometry follows the actual current document zoom and viewport. */
  const zoom=nativeDocumentZoom(view.dom),scale=view.dom.ownerDocument.defaultView!.devicePixelRatio||1,viewport=canvas.getBoundingClientRect(),
    ruler=canvas.querySelector<HTMLElement>(':scope > .ruler'),topLimit=viewport.top+(ruler?.getBoundingClientRect().height??0),bottomLimit=viewport.top+canvas.clientHeight,
    top=target?Math.round((paper.getBoundingClientRect().top+target.top*zoom)*scale)/scale:caret!.top,
    bottom=target?Math.round((paper.getBoundingClientRect().top+(target.top+target.height)*zoom)*scale)/scale:caret!.bottom,
    context=Math.round(NATIVE_SELECTION_CONTEXT*scale)/scale;
  if(bottom-top>canvas.clientHeight/2)return false;
  if(bottom>bottomLimit)canvas.scrollTop+=bottom-(bottomLimit-context);
  else if(top<topLimit)canvas.scrollTop+=top-(topLimit+context);
  if(caret){
    /** The actual source point also retains horizontal visibility inside the owned canvas. */
    const left=viewport.left+canvas.clientLeft,right=left+canvas.clientWidth;
    if(caret.left<left)canvas.scrollLeft+=caret.left-left;
    else if(caret.right>right)canvas.scrollLeft+=caret.right-right;
  }
  return true;
}

/**
 * Replace the original source line map for one measured physical document.
 *
 * Only model positions are retained; live text nodes may be replaced by the
 * next decoration transaction. A source edit invalidates the previous movement
 * goal naturally when its selection no longer matches the recorded head.
 * @param {EditorView} view - Actual owning editable view.
 * @param {NativeSheetCursorLine[]|null} lines - Complete physical line source map, or null for ordinary flow.
 * @returns {void} Replaces or releases only this view's navigation geometry.
 * @example
 * setNativeSheetCursorLines(view,lines); // A four-page paragraph remains one original model node.
 */
export function setNativeSheetCursorLines(view:EditorView,lines:NativeSheetCursorLine[]|null):void{
  if(!lines){cursors.delete(view);pendingScroll.delete(view);return;}
  /** Consecutive vertical movement retains its preferred horizontal caret position. */
  const previous=cursors.get(view);cursors.set(view,{lines,goal:previous?.goal??null});
}

/**
 * Move the source caret between actual physical lines across native page gaps.
 *
 * Browser vertical movement uses unshifted inline flow and can stop at a page
 * boundary after transparent text moves. Original source intervals identify
 * the next real line; actual DOM caret rectangles choose its nearest complete
 * grapheme. Shift retains the original anchor and source history is untouched.
 * Home and End commit their actual source line edge synchronously, so an
 * immediate following Enter or IME key cannot reuse a pending browser caret.
 * Command-arrow line and document edges use the same source path, including
 * Shift selections, instead of leaving native-width drawings to browser flow.
 * Genuine DOM endpoints are resolved before choosing a line because native
 * pointer selection can precede the editor's selectionchange notification.
 * @param {EditorView} view - Actual live source editor view.
 * @param {KeyboardEvent} event - Original editor keyboard event.
 * @returns {boolean} Whether complete native physical line navigation handled the event.
 * @example
 * nativeSheetKeyDown(view,event); // ArrowDown crosses the physical page margin without inserting text.
 */
export function nativeSheetKeyDown(view:EditorView,event:KeyboardEvent):boolean{
  if(nativeWidthHorizontalKeyDown(view,event))return true;
  /** Command-arrow source edges distinguish a whole-document jump from a current-line edge. */
  const cursor=cursors.get(view),commandArrow=event.metaKey&&!event.ctrlKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key),
    edgeKey=commandArrow?(event.key==='ArrowUp'||event.key==='ArrowLeft'?'Home':'End'):event.key,
    documentEdge=commandArrow?(event.key==='ArrowUp'||event.key==='ArrowDown'):(event.ctrlKey||event.metaKey);
  if(!cursor)return false;
  if(!['ArrowUp','ArrowDown','Home','End'].includes(edgeKey)){cursor.goal=null;return false;}
  if(view.composing||event.isComposing||event.altKey||!(view.state.selection instanceof TextSelection||view.state.selection instanceof AllSelection))return false;
  if((event.ctrlKey||event.metaKey)&&edgeKey!=='Home'&&edgeKey!=='End')return false;
  /** The real source DOM endpoint resolves soft-wrap affinity without generated document attributes. */
  const selection=preserveNativeTextSelection(view,view.state.tr.setMeta('addToHistory',false)).selection;
  if(!(selection instanceof TextSelection)){
    if(documentEdge&&(edgeKey==='Home'||edgeKey==='End')&&cursor.lines.length){
      /** Whole-document navigation must collapse an earlier AllSelection before browser input can reuse it. */
      const position=edgeKey==='Home'?cursor.lines[0].from:cursor.lines[cursor.lines.length-1].to;
      cursor.goal=null;commitNativeSourceCaret(view,event.shiftKey?cursor.lines[0].from:position,position,edgeKey==='Home'?1:-1);
      if(edgeKey==='Home'){/** A real document-begin command retains the complete first-paper inset. */const canvas=view.dom.closest<HTMLElement>('.canvas');if(canvas)canvas.scrollTop=0;}
      return true;
    }
    return false;
  }
  /** The real source DOM endpoint retains its original soft-wrap line affinity. */
  const domSelection=view.dom.ownerDocument.getSelection(),focus=domSelection?.focusNode,
    element=focus?.nodeType===Node.ELEMENT_NODE?focus as Element:focus?.parentElement,
    key=element?.closest('[data-forhan-visual-line]')?.getAttribute('data-forhan-visual-line'),paper=view.dom.closest<HTMLElement>('#paper');
  if(!paper)return false;
  let zoom=1,index=-1,distance=Infinity;
  for(let parent:HTMLElement|null=view.dom;parent;parent=parent.parentElement)zoom*=Number(getComputedStyle(parent).zoom)||1;
  /** Original source caret geometry remains independent of the drawing plugin's stored line shifts and viewport placement. */
  const paperBounds=paper.getBoundingClientRect(),head=nativeSheetCaretBounds(view,selection.head)??view.coordsAtPos(selection.head),top=(head.top-paperBounds.top)/zoom;
  for(let line=0;line<cursor.lines.length;line++){
    /** Inclusive source endpoints retain original affinity at a shared soft-wrap offset. */
    const candidate=cursor.lines[line];if(selection.head<candidate.from||selection.head>candidate.to)continue;
    if(candidate.key===key){index=line;break;}
    /** Actual paper-relative caret geometry resolves a source boundary shared by two visual lines. */
    const next=Math.abs(candidate.top-top);if(next<distance){distance=next;index=line;}
  }
  if(index<0)return false;
  if(edgeKey==='Home'||edgeKey==='End'){
    /** Synchronous source selection keeps an immediate following Enter or IME key at the intended visual line edge. */
    const line=documentEdge?cursor.lines[edgeKey==='Home'?0:cursor.lines.length-1]:cursor.lines[index],
      position=edgeKey==='Home'?line.from:line.to;
    cursor.goal=null;
    commitNativeSourceCaret(view,event.shiftKey?selection.anchor:position,position,edgeKey==='Home'?1:-1);
    if(documentEdge&&edgeKey==='Home'){
      /** Original document-begin navigation restores the first paper's complete initial inset. */
      const canvas=view.dom.closest<HTMLElement>('.canvas');if(canvas)canvas.scrollTop=0;
    }
    return true;
  }
  /** Native vertical movement chooses adjacent source lines independently from physical margin length. */
  const targetIndex=index+(event.key==='ArrowUp'?-1:1),target=cursor.lines[targetIndex];
  if(!target)return false;
  /** An unzoomed paper-relative column survives window resizing, horizontal scrolling and display zoom changes. */
  const offset=cursor.goal?.head===selection.head?cursor.goal.offset:(head.left-paperBounds.left)/zoom-(cursor.lines[index].pageX??0),x=paperBounds.left+(offset+(target.pageX??0))*zoom,
    text=view.state.doc.textBetween(target.from,target.to),segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'}),positions=[target.from];
  for(/** Every candidate caret is an original complete source grapheme boundary. */const part of segmenter.segment(text))positions.push(target.from+part.index+part.segment.length);
  let position=target.from,nearest=Infinity;
  for(/** Actual caret rectangles retain original fonts, alignment, tracking and bidirectional run placement. */const candidate of positions){
    /** A line-end boundary uses its preceding source fragment rather than the following soft-wrap line. */
    const bounds=view.coordsAtPos(candidate,candidate===target.to?-1:1),delta=Math.abs(bounds.left-x);
    if(delta<nearest){nearest=delta;position=candidate;}
  }
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,event.shiftKey?selection.anchor:position,position)).setMeta('addToHistory',false).scrollIntoView());
  cursor.goal={offset,head:position};return true;
}
