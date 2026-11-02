import { readFileSync } from "node:fs";
import type { JSONContent } from "@tiptap/core";

/** Independent original native cell geometry, topology and controlled visible text. */
export interface OriginalGeometryCell {
  column: number;
  row: number;
  colspan: number;
  rowspan: number;
  width: number;
  height: number;
  text: string;
  headerHex: string;
}
/** One original table supplies independent column, merge and cell-height expectations. */
export interface OriginalGeometryCase {
  id: string;
  columnWidths: number[];
  cells: OriginalGeometryCell[];
}
/** Literal original native bytes establish expectations independently from all production geometry code. */
export const NATIVE_CELL_GEOMETRY = JSON.parse(
  readFileSync(
    new URL("../fixtures/native-cell-geometry.json", import.meta.url),
    "utf8",
  ),
) as { rows: OriginalGeometryCase[] };

/**
 * Construct authored source from an independently observed original table.
 *
 * Native units retain their exact fractional CSS representation; no original
 * archive or generated expected output is embedded in the input document.
 * @param {OriginalGeometryCase} original - Independent original native geometry.
 * @returns {JSONContent} Complete editable table with exact source dimensions.
 * @example
 * nativeGeometryDocument(NATIVE_CELL_GEOMETRY.rows[1]); // A merged two-row table.
 */
export function nativeGeometryDocument(
  original: OriginalGeometryCase,
): JSONContent {
  /** Rows keep only cells actually starting at their original source address. */
  const rows: JSONContent[] = [];
  for (/** Source row spans do not introduce substitute cells in covered rows. */ const cell of original.cells) {
    rows[cell.row] ??= { type: "tableRow", content: [] };
    /** Exact source columns are converted once without integer screen-pixel rounding. */
    const widths: number[] = [];
    for (
      let column = cell.column;
      column < cell.column + cell.colspan;
      column++
    )
      widths.push(original.columnWidths[column] / 75);
    rows[cell.row].content!.push({
      type: "tableCell",
      attrs: {
        colspan: cell.colspan,
        rowspan: cell.rowspan,
        colwidth: widths,
        nativeCellHeight: cell.height,
      },
      content: [
        { type: "paragraph", content: [{ type: "text", text: cell.text }] },
      ],
    });
  }
  return { type: "doc", content: [{ type: "table", content: rows }] };
}

/**
 * Collect actual source cells without assuming native control-anchor placement.
 *
 * Parsed native files may add surrounding paragraphs; their cells retain their
 * real document order and nested ownership.
 * @param {JSONContent} node - Actual parsed source document or branch.
 * @returns {JSONContent[]} Actual source cells in document order.
 * @example
 * geometryCells(parsed.doc); // No replacement expected cells are created.
 */
export function geometryCells(node: JSONContent): JSONContent[] {
  if (node.type === "tableCell" || node.type === "tableHeader") return [node];
  /** Actual source descendants remain separate from surrounding paragraph containers. */
  const cells: JSONContent[] = [];
  for (/** Original document order defines the complete expected source traversal. */ const child of node.content ??
    [])
    cells.push(...geometryCells(child));
  return cells;
}
