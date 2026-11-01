import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Move native document-edge selection through source positions instead of SVG.
 *
 * Browser default Home handling can leave an all-document selection unchanged
 * around noneditable drawing widgets. Explicit source selection keeps the next
 * arrow or typed character in the original editable document.
 * @param {Editor} editor - Actual owning document editor.
 * @param {boolean} end - Whether to target the final editable source position.
 * @param {boolean} [extend=false] - Whether to retain the current source anchor.
 * @returns {boolean} Whether an editable source destination was found and selected.
 * @example
 * selectDocumentEdge(editor,false); // Ctrl/Command Home collapses to original source start.
 */
function selectDocumentEdge(
  editor: Editor,
  end: boolean,
  extend = false,
): boolean {
  /** Source lookup skips drawing widgets, which never belong to the document model. */
  const state = editor.state,
    destination = TextSelection.findFrom(
      state.doc.resolve(end ? state.doc.content.size : 0),
      end ? -1 : 1,
      true,
    );
  if (!destination) return false;
  /** Extended native selection retains an editable source anchor even after Select All. */
  const anchor = TextSelection.near(
      state.doc.resolve(state.selection.anchor),
    ).anchor,
    selection = extend
      ? TextSelection.create(state.doc, anchor, destination.head)
      : destination;
  editor.view.focus();
  editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView());
  return true;
}

/** Source-based document navigation remains independent of glyph drawing, formatting and undo. */
export const NativeDocumentNavigation = Extension.create({
  name: "nativeDocumentNavigation",
  /**
   * Register native document-edge shortcuts for all editable source documents.
   *
   * Each command changes selection only and cannot create an authored undo step.
   * @returns {object} Source document-edge keyboard commands.
   * @example
   * // Ctrl/Command Shift End extends selection to the final editable character.
   */
  addKeyboardShortcuts() {
    return {
      /**
       * Collapse native selection at the first editable source position.
       *
       * Rendering widgets cannot consume the next typed source character.
       * @returns {boolean} Whether the source move was handled.
       * @example
       * // Ctrl/Command Home after Select All returns to source start.
       */
      "Mod-Home": () => selectDocumentEdge(this.editor, false),
      /**
       * Collapse native selection at the final editable source position.
       *
       * Drawing text never contributes an extra logical document position.
       * @returns {boolean} Whether the source move was handled.
       * @example
       * // Ctrl/Command End moves after the last authored character.
       */
      "Mod-End": () => selectDocumentEdge(this.editor, true),
      /**
       * Extend native selection to the first editable source position.
       *
       * The original source anchor is retained independently of overlay DOM.
       * @returns {boolean} Whether the extended source move was handled.
       * @example
       * // Ctrl/Command Shift Home selects toward source start.
       */
      "Mod-Shift-Home": () => selectDocumentEdge(this.editor, false, true),
      /**
       * Extend native selection to the final editable source position.
       *
       * Only original source text and objects participate in the selection.
       * @returns {boolean} Whether the extended source move was handled.
       * @example
       * // Ctrl/Command Shift End selects toward source end.
       */
      "Mod-Shift-End": () => selectDocumentEdge(this.editor, true, true),
    };
  },
});
