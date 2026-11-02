import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode,ResolvedPos} from '@tiptap/pm/model';
import {Plugin,TextSelection,type Selection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import type {EditorView} from '@tiptap/pm/view';

/** A protected cell owns its complete source extent, including any nested table. */
interface ProtectedCellExtent {from:number;to:number}

/**
 * Find the outer protected cell owning an actual original source position.
 *
 * Form-editable metadata does not override ordinary cell protection. An outer
 * protected cell also owns the source of tables nested inside its content.
 * @param {ResolvedPos} position - Original resolved document position.
 * @returns {ProtectedCellExtent|null} Whole protected cell extent or no protection.
 * @example
 * const protectedCell=protectedCellAt(state.selection.$head);
 */
function protectedCellAt(position:ResolvedPos):ProtectedCellExtent|null{
  for(let depth=1;depth<=position.depth;depth++){
    /** Only actual native cell protection prevents an ordinary source caret. */
    const node=position.node(depth);
    if((node.type.name==='tableCell'||node.type.name==='tableHeader')&&node.attrs.nativeCellProperties?.protected===true){
      /** Original source node boundaries remain independent of drawing geometry. */
      const from=position.before(depth);
      return {from,to:from+node.nodeSize};
    }
  }
  return null;
}

/**
 * Locate an ordinary text caret beyond complete protected source cells.
 *
 * Forward navigation enters the next editable source at its start; backward
 * navigation enters the previous editable source at its end. Contiguous and
 * nested protected cells are skipped without inserting replacement paragraphs.
 * @param {ProseMirrorNode} doc - Actual immutable document.
 * @param {ProtectedCellExtent} cell - Original blocked source cell.
 * @param {1|-1} direction - Native source navigation direction.
 * @returns {Selection|null} First genuine editable source destination or none.
 * @example
 * const next=editableCellCaret(state.doc,cell,1);
 */
function editableCellCaret(doc:ProseMirrorNode,cell:ProtectedCellExtent,direction:1|-1):Selection|null{
  let boundary=direction===1?cell.to:cell.from;
  while(boundary>=0&&boundary<=doc.content.size){
    /** A real text selection can occur in an adjacent cell or outside the table. */
    const candidate=TextSelection.findFrom(doc.resolve(boundary),direction,true);
    if(!candidate)return null;
    /** An outer protected cell can contain several nested source paragraphs. */
    const blocked=protectedCellAt(candidate.$head);
    if(!blocked)return candidate;
    /** Monotonic whole-cell progress prevents repeated lookup at one source boundary. */
    const next=direction===1?blocked.to:blocked.from;
    if(direction===1?next<=boundary:next>=boundary)return null;
    boundary=next;
  }
  return null;
}

/**
 * Keep ordinary pointer focus outside a protected original table cell.
 *
 * Existing source selection remains available for typing after an ignored
 * protected-cell click. Modified gestures can still extend source or cell
 * selections so protected cell properties can be changed through a cell block.
 * @param {EditorView} view - Actual owning source view.
 * @param {MouseEvent} event - Genuine source mouse-down event.
 * @returns {boolean} Whether this protected cell consumed ordinary pointer focus.
 * @throws {Error} If an unexpected original source mapping error occurs.
 * @example
 * // Clicking protected text cannot move an editable source caret into that cell.
 */
function protectCellPointer(view:EditorView,event:MouseEvent):boolean{
  if(event.button!==0||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return false;
  /** Actual original table ownership is resolved from the clicked DOM cell. */
  const element=event.target instanceof Element?event.target.closest('td,th'):null;
  if(!element||!view.dom.contains(element))return false;
  try{
    if(!protectedCellAt(view.state.doc.resolve(view.posAtDOM(element,0))))return false;
  }catch(error){
    if(error instanceof RangeError)return false;
    throw error;
  }
  event.preventDefault();
  view.focus();
  return true;
}

/** Native cell protection prevents source caret entry while retaining cell-block formatting and original source bytes. */
export const NativeCellProtection=Extension.create({
  name:'nativeCellProtection',
  priority:2000,
  /**
   * Register ordinary protected-cell pointer and source-navigation handling.
   *
   * An insertion caret or text range wholly inside one protected cell is redirected.
   * Authored text, cell attributes,
   * rectangular selections, document-wide selections and undo history remain
   * intact. A source containing only protected cells receives a cell selection
   * rather than an invented editable paragraph.
   * @returns {Plugin[]} One owned protected-source navigation plugin.
   * @example
   * // Tab and native arrows cannot leave an insertion caret in a protected cell.
   */
  addProseMirrorPlugins(){
    return [new Plugin({
      props:{handleDOMEvents:{mousedown:protectCellPointer}},
      /**
       * Redirect a committed insertion caret away from protected native source.
       *
       * Direction follows the original source move. If that side has no editable
       * destination, the opposite side is used before falling back to a genuine
       * cell-block selection. Layout and selection corrections cannot add history.
       * @param {readonly import('@tiptap/pm/state').Transaction[]} _transactions - Actual committed source transactions.
       * @param {import('@tiptap/pm/state').EditorState} previous - Original state before the update.
       * @param {import('@tiptap/pm/state').EditorState} current - Actual new source state.
       * @returns {import('@tiptap/pm/state').Transaction|null} History-free selection correction or none.
       * @example
       * // Forward movement from LEFT skips protected MIDDLE and enters RIGHT.
       */
      appendTransaction(_transactions,previous,current){
        /** Ranges spanning separate cells and genuine cell blocks retain their original native purpose. */
        const selection=current.selection;
        if(!(selection instanceof TextSelection))return null;
        /** Original protected-cell metadata remains separate from form-editable flags. */
        const cell=protectedCellAt(selection.$head);
        if(!cell)return null;
        if(!selection.empty){
          /** Table Tab normally selects a complete cell's text; it must also skip protected source. */
          const anchor=protectedCellAt(selection.$anchor);
          if(!anchor||anchor.from!==cell.from)return null;
        }
        /** Document replacement has no previous cursor affinity in the newly loaded source. */
        const direction=previous.doc===current.doc&&selection.head<previous.selection.head?-1:1,
          destination=editableCellCaret(current.doc,cell,direction)??editableCellCaret(current.doc,cell,direction===1?-1:1)??CellSelection.create(current.doc,cell.from);
        return current.tr.setSelection(destination).setMeta('addToHistory',false);
      },
    })];
  },
});
