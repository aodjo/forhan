import type { Editor } from "@tiptap/core";
import type { Node as SourceNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { closeHistory } from "@tiptap/pm/history";
import {
  nativeCellProperties,
  nativeCellMargins,
  type NativeCellProperties,
  type NativeCellMargins,
} from "../cell-properties.ts";
import {
  nativeTableProperties,
  type NativeTableProperties,
} from "../table-properties.ts";
import { cellFieldName, writeHwpCellField } from "../cell-field-name.ts";

/** A selected original cell retains its own immutable source identity and absolute position. */
export interface TablePropertyCell {
  node: SourceNode;
  position: number;
}
/** Only the exact original table and source snapshot may receive a later accepted modal draft. */
export interface TablePropertyContext {
  doc: SourceNode;
  selection: Selection;
  table: SourceNode;
  position: number;
  cells: TablePropertyCell[];
}
/** Explicit field edits preserve unrelated mixed values across selected cells. */
export interface TablePropertyChanges {
  table?: Partial<NativeTableProperties>;
  margins?: Partial<NativeCellMargins>;
  cell?: Partial<Omit<NativeCellProperties, "margins">>;
  cellMargins?: Partial<NativeCellMargins>;
  header?: boolean;
  fieldName?: string;
}

/**
 * Capture the actual selected table and native cell scope without editing source.
 *
 * A genuine rectangular cell selection supplies its own cells. A text cursor
 * uses its nearest owning table and cell, including a table nested in a cell.
 * @param {Editor} editor - Actual source-owning editor.
 * @returns {TablePropertyContext|null} Exact immutable source context or no supported table selection.
 * @example
 * const context=captureTableProperties(editor);
 */
export function captureTableProperties(
  editor: Editor,
): TablePropertyContext | null {
  if (editor.view.composing) return null;
  /** Real selected source ancestry determines ownership independently from DOM paint. */
  const selection = editor.state.selection,
    point =
      selection instanceof CellSelection
        ? selection.$anchorCell
        : selection.$from;
  let depth = point.depth;
  while (depth > 0 && point.node(depth).type.name !== "table") depth--;
  if (depth === 0) return null;
  /** A nearest table owns its own selected cells without borrowing an outer nested table. */
  const table = point.node(depth),
    position = point.before(depth),
    cells: TablePropertyCell[] = [];
  if (selection instanceof CellSelection)
    selection.forEachCell(
      /**
       * Retain each actual selected source cell with its original absolute position.
       *
       * CellSelection supplies the true native rectangle rather than a broad range.
       * @param {SourceNode} node - Actual selected original cell.
       * @param {number} position - Its original document position.
       * @returns {void} Appends the actual immutable selected source cell.
       * @example
       * // Unselected cells between disjoint ranges remain outside the draft scope.
       */
      (node, position) => {
        cells.push({ node, position });
      },
    );
  else
    for (let cellDepth = point.depth; cellDepth > depth; cellDepth--) {
      /** Only actual cell ancestors own editable cell metadata. */
      const node = point.node(cellDepth);
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
        cells.push({ node, position: point.before(cellDepth) });
        break;
      }
    }
  return cells.length
    ? { doc: editor.state.doc, selection, table, position, cells }
    : null;
}

/**
 * Commit explicit table and cell changes as one independent undoable operation.
 *
 * Untouched mixed fields, raw source flags, field identities, fills, geometry,
 * marks and authored content retain their original owners. Stale modal drafts
 * cannot change a replacement document, even when positions happen to match.
 * @param {Editor} editor - Actual source-owning editor.
 * @param {TablePropertyContext} context - Exact source snapshot captured before opening the dialog.
 * @param {TablePropertyChanges} changes - Explicitly edited validated source fields.
 * @returns {boolean} Whether actual source changed in one accepted history transaction.
 * @throws {TypeError|RangeError} If a represented property or field name cannot be retained losslessly.
 * @example
 * applyTableProperties(editor,context,{table:{repeatHeader:false},cell:{verticalAlign:2}});
 */
export function applyTableProperties(
  editor: Editor,
  context: TablePropertyContext,
  changes: TablePropertyChanges,
): boolean {
  if (editor.view.composing || editor.state.doc !== context.doc) return false;
  /** Validation completes before a document transaction can be dispatched. */
  const transaction = closeHistory(editor.state.tr),
    tableAttrs = { ...context.table.attrs };
  if (changes.table)
    tableAttrs.nativeTableProperties = nativeTableProperties({
      ...nativeTableProperties(tableAttrs.nativeTableProperties),
      ...changes.table,
    });
  if (changes.margins)
    tableAttrs.nativeCellMargins = nativeCellMargins({
      ...nativeCellMargins(tableAttrs.nativeCellMargins),
      ...changes.margins,
    });
  transaction.setNodeMarkup(
    context.position,
    undefined,
    tableAttrs,
    context.table.marks,
  );
  for (/** Only captured original selected cells receive explicitly changed fields. */ const selected of context.cells) {
    /** Each selected cell keeps its independent untouched property values and raw source identity. */
    const attrs = { ...selected.node.attrs },
      properties = nativeCellProperties(attrs.nativeCellProperties);
    if (changes.cell || changes.cellMargins)
      attrs.nativeCellProperties = nativeCellProperties({
        ...properties,
        ...changes.cell,
        margins: { ...properties.margins, ...changes.cellMargins },
      });
    if (changes.fieldName !== undefined) {
      /** Existing opaque data must permit this explicit name before any source change is committed. */
      const name = cellFieldName(changes.fieldName);
      writeHwpCellField(name, attrs.nativeCellFieldData);
      attrs.nativeCellFieldName = name;
    }
    /** Native title-cell ownership changes node type without changing its text style, fill or content. */
    const type =
      changes.header === undefined
        ? selected.node.type
        : editor.schema.nodes[changes.header ? "tableHeader" : "tableCell"];
    transaction.setNodeMarkup(
      selected.position,
      type,
      attrs,
      selected.node.marks,
    );
  }
  if (transaction.doc.eq(context.doc)) return false;
  editor.view.dispatch(transaction);
  editor.view.dispatch(
    closeHistory(editor.state.tr).setMeta("addToHistory", false),
  );
  return true;
}
