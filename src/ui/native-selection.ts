import { AllSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Preserve an actual pending native text selection during a layout-only update.
 *
 * After Windows IME completion, a native arrow can move the DOM caret before
 * the editor receives its selectionchange event. Replacing drawing decorations
 * with the previous model selection would move that caret back. Valid original
 * source endpoints are mapped into the same non-history layout transaction.
 * A genuine source caret can also precede replacement of an earlier whole-document
 * selection. Root-level whole-document endpoints remain unchanged. Composing
 * text, node selections, document edits, auxiliary drawings and selections
 * outside the active editor retain their normal input handling.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {Transaction} transaction - Unchanged-document layout transaction excluded from history.
 * @returns {Transaction} The same layout transaction retaining genuine current native source selection.
 * @throws {Error} If an unexpected source mapping error occurs outside a transient range mismatch.
 * @example
 * view.dispatch(preserveNativeTextSelection(view, layoutTransaction));
 */
export function preserveNativeTextSelection(
  view: EditorView,
  transaction: Transaction,
): Transaction {
  if (
    view.composing ||
    !view.dom.isConnected ||
    !view.hasFocus() ||
    transaction.docChanged ||
    transaction.selectionSet ||
    transaction.doc !== view.state.doc ||
    transaction.getMeta("addToHistory") !== false ||
    !(view.state.selection instanceof TextSelection || view.state.selection instanceof AllSelection)
  )
    return transaction;
  /** Actual browser source endpoints remain independent of stored model selection and drawing coordinates. */
  const selection = view.dom.ownerDocument.getSelection(),
    anchor = selection?.anchorNode,
    focus = selection?.focusNode;
  if (
    !selection ||
    !anchor ||
    !focus ||
    !view.dom.contains(anchor) ||
    !view.dom.contains(focus)
  )
    return transaction;
  /** Generated controls and inaccessible paint cannot become authored source caret positions. */
  const anchorElement =
      anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement,
    focusElement =
      focus.nodeType === 1 ? (focus as Element) : focus.parentElement;
  if (
    anchorElement?.closest('[contenteditable="false"],svg') ||
    focusElement?.closest('[contenteditable="false"],svg')
  )
    return transaction;
  try {
    /** Native logical offsets are resolved only against the same unchanged original document. */
    const from = view.state.doc.resolve(
        view.posAtDOM(anchor, selection.anchorOffset),
      ),
      to = view.state.doc.resolve(view.posAtDOM(focus, selection.focusOffset));
    if (!from.parent.inlineContent || !to.parent.inlineContent)
      return transaction;
    /** A real reversed selection retains its original anchor and head rather than sorted endpoints. */
    const actual = TextSelection.create(view.state.doc, from.pos, to.pos);
    return actual.eq(view.state.selection)
      ? transaction
      : transaction.setSelection(actual);
  } catch (error) {
    if (error instanceof RangeError) return transaction;
    throw error;
  }
}
