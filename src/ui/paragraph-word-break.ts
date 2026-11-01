import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  englishHyphenationPoints,
  createHyphenDrawing,
} from "../english-hyphenation.ts";
import {
  paragraphWordBreaks,
  latinWordIntervals,
  latinWordBreakAttributes,
  type ParagraphWordBreaks,
} from "../paragraph-word-break.ts";

/** Independent word-breaking decorations never add source text or stored marks. */
export const wordBreakKey = new PluginKey<DecorationSet>(
  "forhan-paragraph-word-break",
);

/**
 * Read selected paragraph modes while preserving independently mixed fields.
 *
 * A caret inspects its own paragraph. A range covers selected paragraphs and
 * headings, including empty blocks, without inventing values from containers.
 * @param {Editor} editor - Actual owning document editor.
 * @returns {{latin:number|null;nonLatin:number|null}} Values or a mixed null per field.
 * @throws {RangeError} If retained native source modes are malformed.
 * @example
 * paragraphWordBreakSelection(editor); // A mixed Latin field remains null.
 */
export function paragraphWordBreakSelection(editor: Editor): {
  latin: number | null;
  nonLatin: number | null;
} {
  /** Source blocks contribute independent modes in their real selection order. */
  const selected: ParagraphWordBreaks[] = [],
    selection = editor.state.selection;
  editor.state.doc.nodesBetween(
    selection.from,
    selection.to,
    /**
     * Collect only real selected source paragraphs and headings.
     *
     * Nested table/list containers do not contribute default formatting.
     * @param {import('@tiptap/pm/model').Node} node - Original selected source node.
     * @returns {boolean|void} Avoids descending into an already inspected text block.
     * @example
     * // An empty selected paragraph still retains its own breaking mode.
     */
    (node) => {
      if (node.type.name === "paragraph" || node.type.name === "heading") {
        selected.push(paragraphWordBreaks(node.attrs));
        return false;
      }
    },
  );
  if (!selected.length)
    selected.push(
      paragraphWordBreaks(
        editor.getAttributes(
          editor.isActive("heading") ? "heading" : "paragraph",
        ),
      ),
    );
  /** Each field becomes mixed only when its own original values differ. */
  const result: { latin: number | null; nonLatin: number | null } = {
    ...selected[0],
  };
  for (/** Unrelated mixed settings cannot overwrite an untouched native field. */ const value of selected) {
    if (value.latin !== result.latin) result.latin = null;
    if (value.nonLatin !== result.nonLatin) result.nonLatin = null;
  }
  return result;
}

/**
 * Build transparent Latin ranges for the current original document revision.
 *
 * Parent paragraph CSS controls non-Latin boundaries independently. These
 * inline decorations alter only Latin layout and never become saved marks.
 * @param {EditorState} state - Actual owning source document revision.
 * @returns {DecorationSet} Transparent source-position decorations.
 * @throws {RangeError} If a retained native mode is malformed.
 * @example
 * wordBreakDecorations(state); // Latin character mode keeps Korean words intact.
 */
function wordBreakDecorations(state: EditorState): DecorationSet {
  /** Every interval is anchored in original model coordinates. */
  const decorations: Decoration[] = [];
  state.doc.descendants(
    /**
     * Decorate Latin source text using its immediate paragraph's native mode.
     *
     * Atomic objects, source marks and unrelated scripts remain untouched.
     * @param {import('@tiptap/pm/model').Node} node - Original source node.
     * @param {number} position - Absolute original model position.
     * @param {import('@tiptap/pm/model').Node|null} parent - Actual owning source container.
     * @returns {void} Adds only transparent eligible Latin intervals.
     * @example
     * // Adjacent bold and plain Latin runs retain their original source boundaries.
     */
    (node, position, parent) => {
      if (
        !node.isText ||
        !parent ||
        !["paragraph", "heading"].includes(parent.type.name)
      )
        return;
      /** Native Latin mode is independent of the paragraph's non-Latin setting. */
      const mode = paragraphWordBreaks(parent.attrs).latin;
      if (mode !== 1 && mode !== 2) return;
      for (/** UTF-16 positions retain combining characters and exact source content. */ const range of latinWordIntervals(
        node.text!,
      )) {
        decorations.push(
          Decoration.inline(
            position + range.from,
            position + range.to,
            {
              nodeName: "forhan-word-break",
              ...latinWordBreakAttributes(mode),
            },
            { latinMode: mode },
          ),
        );
        if (mode === 1)
          for (/** Public local dictionary boundaries never enter original model text. */ const boundary of englishHyphenationPoints(
            node.text!.slice(range.from, range.to),
          ))
            decorations.push(
              Decoration.widget(
                position + range.from + boundary,
                /**
                 * Create one transparent manual hyphen drawing in the owning editor.
                 *
                 * Its discretionary Unicode exists only in inaccessible drawing DOM.
                 * @param {import('@tiptap/pm/view').EditorView} view - Actual owning source editor view.
                 * @returns {HTMLElement} Rendering-only discretionary hyphen marker.
                 * @example
                 * // HWPX, HWP, FHN and clipboard serialization retain the original word.
                 */
                (view) => createHyphenDrawing(view.dom.ownerDocument),
                {
                  side: -1,
                  key: `english-hyphen-${position + range.from + boundary}`,
                },
              ),
            );
      }
    },
  );
  return DecorationSet.create(state.doc, decorations);
}

/** Native Latin wrapping remains independent of Korean word boundaries and undo history. */
export const NativeParagraphWordBreak = Extension.create({
  name: "nativeParagraphWordBreak",
  /**
   * Install source-only Latin wrapping decorations without layout transactions.
   *
   * Recalculation follows document edits; selection-only changes retain the
   * existing set, preventing caret movement or IME layout feedback loops.
   * @returns {Plugin[]} One cached source decoration plugin.
   * @example
   * // Native paragraph formatting and its decorations share one undoable edit.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: wordBreakKey,
        state: {
          /**
           * Initialize transparent source decorations for a new document.
           *
           * No document transaction or source mutation is needed.
           * @param {unknown} _configuration - ProseMirror plugin initialization options.
           * @param {EditorState} state - Actual initial source revision.
           * @returns {DecorationSet} Original source-position decorations.
           * @example
           * // Imported native modes appear before the first source edit.
           */
          init(_configuration, state) {
            return wordBreakDecorations(state);
          },
          /**
           * Refresh only when original document content or attributes change.
           *
           * Layout-only and selection transactions cannot rewrite the native caret.
           * @param {import('@tiptap/pm/state').Transaction} transaction - Actual editor transaction.
           * @param {DecorationSet} previous - Existing cached transparent decorations.
           * @param {EditorState} _oldState - Previous source revision.
           * @param {EditorState} state - Resulting source revision.
           * @returns {DecorationSet} Cached or rebuilt source-position decorations.
           * @example
           * // Arrow movement reuses the same decoration set during Korean input.
           */
          apply(transaction, previous, _oldState, state) {
            return transaction.docChanged
              ? wordBreakDecorations(state)
              : previous;
          },
        },
        props: {
          /**
           * Expose current transparent source decorations to the editor view.
           *
           * Original source text and stored marks remain unchanged.
           * @param {EditorState} state - Current original source revision.
           * @returns {DecorationSet|undefined} Current source-position decorations.
           * @example
           * // Copy and native save serialize source text rather than layout wrappers.
           */
          decorations(state) {
            return wordBreakKey.getState(state);
          },
        },
      }),
    ];
  },
});
