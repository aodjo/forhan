import { Extension, type Editor } from "@tiptap/core";
import { characterMetrics, hasCharacterMetrics } from "../character-metrics.ts";
import { stepNativeWidths } from "../character-width.ts";

/**
 * Step selected native widths without flattening mixed source formatting.
 *
 * Each selected source run keeps its independent language arrays and unrelated
 * font, size, shadow and emphasis. A caret changes only future stored marks.
 * @param {Editor} editor - Actual owning document editor.
 * @param {1|-1} direction - Native one-percentage-point step.
 * @returns {boolean} Whether the native shortcut was handled outside IME composition.
 * @throws {RangeError} If retained native source arrays are invalid.
 * @example
 * stepCharacterWidth(editor,-1); // Alt Shift J narrows selected source widths by one.
 */
function stepCharacterWidth(editor: Editor, direction: 1 | -1): boolean {
  if (editor.view.composing) return false;
  /** One source transaction retains the real selection and one-step undo behavior. */
  const state = editor.state,
    transaction = state.tr,
    type = editor.schema.marks.textStyle,
    selection = state.selection;
  let changed = false;
  /**
   * Step one original text style while retaining every unedited field.
   *
   * Unchanged boundary values do not create an empty formatting transaction.
   * @param {Record<string,unknown>} attrs - Existing independent source attributes.
   * @returns {Record<string,unknown>} Original fields and the explicitly stepped widths.
   * @throws {RangeError} If original source arrays are invalid.
   * @example
   * // Neighboring blue and bold runs retain their own original character effects.
   */
  function updated(attrs: Record<string, unknown>): Record<string, unknown> {
    /** Only width ratios are compared; all other source arrays remain untouched. */
    const original = characterMetrics(attrs.nativeCharacterMetrics),
      metrics = stepNativeWidths(original, direction);
    for (let slot = 0; slot < 7; slot++)
      if (original.ratio[slot] !== metrics.ratio[slot]) changed = true;
    return {
      ...attrs,
      nativeCharacterMetrics: hasCharacterMetrics(metrics) ? metrics : null,
    };
  }
  if (selection.empty) {
    /** Stored source marks determine the next typed character without changing existing text. */
    const marks = state.storedMarks || selection.$from.marks(),
      current = type.isInSet(marks),
      attrs = updated(current?.attrs || {});
    if (changed) transaction.setStoredMarks(type.create(attrs).addToSet(marks));
  } else
    state.doc.nodesBetween(
      selection.from,
      selection.to,
      /**
       * Step only the original selected text interval of an independent source run.
       *
       * Source objects and unselected text keep their original formatting.
       * @param {import('@tiptap/pm/model').Node} node - Original selected source node.
       * @param {number} position - Original absolute model position.
       * @returns {void} Adds only the requested source-width mark update.
       * @example
       * // A partial phrase retains different widths in its unselected neighbors.
       */
      (node, position) => {
        if (!node.isText) return;
        /** Existing source attributes are merged independently of mark order. */
        const current = type.isInSet(node.marks),
          attrs = updated(current?.attrs || {});
        transaction.addMark(
          Math.max(selection.from, position),
          Math.min(selection.to, position + node.nodeSize),
          type.create(attrs),
        );
      },
    );
  if (changed) editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

/** Native width keyboard commands share source formatting and never modify drawing-only DOM. */
export const NativeCharacterWidths = Extension.create({
  name: "nativeCharacterWidths",
  /**
   * Register observed native one-point horizontal width keyboard commands.
   *
   * Both commands preserve independent language arrays and existing undo scope.
   * @returns {object} Native width keyboard bindings.
   * @example
   * // Alt Shift K increases width while keeping physical font height unchanged.
   */
  addKeyboardShortcuts() {
    return {
      /**
       * Increase native character widths by one percentage point.
       *
       * Existing native upper boundaries remain unchanged.
       * @returns {boolean} Whether the source shortcut was handled.
       * @example
       * // A 99-percent width becomes exactly 100 percent.
       */
      "Alt-Shift-k": () => stepCharacterWidth(this.editor, 1),
      /**
       * Decrease native character widths by one percentage point.
       *
       * Original native lower boundaries and retained byte-domain values survive.
       * @returns {boolean} Whether the source shortcut was handled.
       * @example
       * // A 100-percent width becomes exactly 99 percent.
       */
      "Alt-Shift-j": () => stepCharacterWidth(this.editor, -1),
    };
  },
});
