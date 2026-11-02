import { expect } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import { geometryCells } from "./cell-geometry.ts";

/**
 * Author six independent source cells with an originally observed resized owner.
 *
 * The first owning cell deliberately disagrees with the cell below it. Each
 * remaining source cell has its own independently authored marker and width.
 * @param {boolean} [resized=false] - Whether the first cell has the original20mm width.
 * @returns {JSONContent} Complete independently authored two-row source document.
 * @example
 * cellSizeDocument(true); // First width5669, all other widths6122.
 */
export function cellSizeDocument(resized = false): JSONContent {
  /** Native owning-cell dimensions remain distinct from logical column allocation. */
  const rows: JSONContent[] = [];
  for (let row = 0; row < 2; row++) {
    /** Every real source row owns three independent authored cells. */
    const cells: JSONContent[] = [];
    for (let column = 0; column < 3; column++)
      cells.push({
        type: "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: [(resized && row === 0 && column === 0 ? 5669 : 6122) / 75],
          nativeCellHeight: 282,
        },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: String.fromCharCode(65 + row * 3 + column),
              },
            ],
          },
        ],
      });
    rows.push({ type: "tableRow", content: cells });
  }
  return { type: "doc", content: [{ type: "table", content: rows }] };
}

/**
 * Assert actual saved source retains all independently authored cell widths.
 *
 * Source units are reconstructed after summing physical column measurements.
 * The expected values come from original native observations, not renderer paint.
 * @param {JSONContent} doc - Actual parsed public native output.
 * @param {string} format - Actual output format used for failure diagnostics.
 * @returns {void} Completes all owning-cell width and marker assertions.
 * @throws {Error} If a source owner, width or authored marker changes.
 * @example
 * assertIndependentCellWidths(actualSavedDoc,'hwpx');
 */
export function assertIndependentCellWidths(
  doc: JSONContent,
  format: string,
): void {
  /** Actual saved cells supply every output measurement under test. */
  const cells = geometryCells(doc),
    widths: number[] = [],
    markers: string[] = [];
  for (/** Each source cell retains its own physical width independently of adjacent rows. */ const cell of cells) {
    let width = 0;
    for (/** Summing precedes native unit reconstruction to avoid repeated rounding. */ const part of cell
      .attrs?.colwidth ?? [])
      width += part * 75;
    widths.push(Math.round(width));
    markers.push(cell.content?.[0].content?.[0].text ?? "");
  }
  expect(widths, format).toEqual([5669, 6122, 6122, 6122, 6122, 6122]);
  expect(markers, format).toEqual(["A", "B", "C", "D", "E", "F"]);
}
