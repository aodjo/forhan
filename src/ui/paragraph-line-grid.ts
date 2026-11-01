import type { Editor } from "@tiptap/core";
import { paragraphSnapToGrid } from "../paragraph-line-grid.ts";

/**
 * Inspect selected source grid preferences without flattening a mixed selection.
 *
 * Empty paragraphs, headings and nested source blocks retain independent flags.
 * The caret reads its owning paragraph; only explicit edits replace mixed flags.
 * @param {Editor} editor - Actual owning document editor.
 * @returns {boolean|null} Common native preference, or null for independent mixed values.
 * @throws {RangeError} If an explicit original paragraph flag is malformed.
 * @example
 * paragraphGridSelection(editor); // A mixed true/false selection remains null.
 */
export function paragraphGridSelection(editor: Editor): boolean | null {
  /** Native block settings are collected from the real source selection. */
  const selected = new Set<boolean>(), selection = editor.state.selection;
  editor.state.doc.nodesBetween(selection.from, selection.to,
    /**
     * Collect only authored paragraph and heading flags in the actual selection.
     *
     * A selected container cannot substitute its defaults for nested source blocks.
     * @param {import('@tiptap/pm/model').Node} node - Original selected source node.
     * @returns {boolean|void} Stops descending into an already inspected paragraph.
     * @example
     * // Empty selected paragraphs contribute their own native setting.
     */
    (node)=>{if(node.type.name==='paragraph'||node.type.name==='heading'){selected.add(paragraphSnapToGrid(node.attrs));return false;}});
  if(!selected.size)selected.add(paragraphSnapToGrid(editor.getAttributes(editor.isActive('heading')?'heading':'paragraph')));
  return selected.size===1 ? selected.values().next().value! : null;
}
