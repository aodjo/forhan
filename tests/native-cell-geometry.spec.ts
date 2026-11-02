import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { JSONContent } from "@tiptap/core";
import {
  importSource,
  selectSource,
  savedSource,
} from "./helpers/format-painter.ts";
import {
  NATIVE_CELL_GEOMETRY,
  nativeGeometryDocument,
  geometryCells,
  type OriginalGeometryCase,
} from "./helpers/cell-geometry.ts";

/**
 * Assert actual saved geometry independently from displayed table measurements.
 *
 * Every real output cell retains original merge ownership and exact physical
 * column widths. The authored first row deliberately has a new explicit height.
 * @param {JSONContent} doc - Actual production saved source.
 * @param {OriginalGeometryCase} original - Independently observed source topology.
 * @returns {void} Completes all actual source geometry assertions.
 * @throws {Error} If a distance, merge or source cell is lost.
 * @example
 * assertSavedGeometry(await savedSource(page),original);
 */
function assertSavedGeometry(
  doc: JSONContent,
  original: OriginalGeometryCase,
): void {
  /** Only actual saved source cells supply the values under test. */
  const cells = geometryCells(doc);
  expect(cells).toHaveLength(original.cells.length);
  for (let index = 0; index < cells.length; index++) {
    /** Independent logical boundaries determine the original per-column distances. */
    const source = original.cells[index],
      widths: number[] = [];
    for (
      let column = source.column;
      column < source.column + source.colspan;
      column++
    )
      widths.push(original.columnWidths[column] / 75);
    expect(cells[index].attrs!.colwidth).toEqual(widths);
    expect(cells[index].attrs!.nativeCellHeight).toBe(
      source.row === 0 ? 6001 : source.height,
    );
    expect(cells[index].attrs!.colspan ?? 1).toBe(source.colspan);
    expect(cells[index].attrs!.rowspan ?? 1).toBe(source.rowspan);
  }
}

/**
 * Preserve fractional native columns and cell heights through real typing and all native saves.
 *
 * Real file import, browser table layout, ordinary source input and complete
 * production output establish behavior without injecting editor state.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after physical sizing, source saves and one-step undo agree.
 * @throws {Error} If fractional source geometry is rounded or replaced during editing.
 * @example
 * // A 10123-unit merged cell retains unequal 4001 and 6122 source columns.
 */
async function verifyNativeGeometryUi({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Independent original topology remains separate from the newly authored explicit row height. */
  const original = NATIVE_CELL_GEOMETRY.rows[1],
    doc = nativeGeometryDocument(original),
    cells = geometryCells(doc);
  for (let index = 0; index < cells.length; index++)
    if (original.cells[index].row === 0)
      cells[index].attrs!.nativeCellHeight = 6001;
  await importSource(page, "native-fractional-cell-geometry.fhn", doc);
  await expect(page.locator(".tiptap td").first()).toHaveAttribute(
    "data-forhan-cell-height",
    "6001",
  );
  /** Actual native table-cell layout must honor the authored minimum physical height. */
  const height = await page
    .locator(".tiptap td")
    .first()
    .evaluate(
      /**
       * Read the actual rendered source cell's physical CSS height.
       *
       * Browser layout is observed without assigning dimensions or replacing paint.
       * @param {HTMLElement} cell - Actual rendered original source cell.
       * @returns {number} Actual computed CSS height in unzoomed pixels.
       * @example
       * // The browser may quantize physical layout to a subpixel grid.
       */
      (cell) => Number.parseFloat(getComputedStyle(cell).height),
    );
  expect(Math.abs(height - 6001 / 75)).toBeLessThan(0.05);
  /** FHN source establishes the exact pre-edit normalized document for real undo comparison. */
  const before = await savedSource(page);
  await selectSource(
    page,
    ".tiptap table tr:first-child td:first-child > p",
    1,
  );
  await page.keyboard.insertText(" EDITED");
  for (/** Actual output bytes from every supported document format must retain the same native source geometry. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const) {
    /** The public save command supplies the real file being independently read. */
    const saved = await savedSource(page, format);
    assertSavedGeometry(saved, original);
    expect(geometryCells(saved)[0].content![0].content![0].text).toBe(
      "A EDITED",
    );
  }
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
  /** This exact production HTML must preserve every physical source field after reimport. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="html"]').click();
  /** No source attributes or colgroup widths are patched by this regression. */
  const download = await pending,
    bytes = await readFile((await download.path())!);
  await page.locator("#file-input").setInputFiles({
    name: "native-exact-geometry.html",
    mimeType: "text/html",
    buffer: bytes,
  });
  await expect(page.locator("#toast")).toContainText(
    "native-exact-geometry.html",
  );
  assertSavedGeometry(await savedSource(page), original);
}

/**
 * Import ordinary fractional colgroups using logical cells across both merge directions.
 *
 * HTML without native metadata still retains authored physical widths. Header
 * cells and later rows must not confuse DOM child indices with logical columns.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after real HTML import preserves all source widths.
 * @throws {Error} If fractional pixels are truncated or row spans shift a source column.
 * @example
 * // A lower row's first DOM cell starts at logical column one after a row span.
 */
async function verifyOrdinaryMergedHtmlGeometry({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Independent ordinary HTML deliberately omits the editor's explicit colwidth metadata. */
  const widths = [4001 / 75, 6122 / 75, 8003 / 75],
    html = `<!doctype html><meta charset="utf-8"><table><colgroup><col width="${widths[0]}"><col style="width:${widths[1]}px"><col width="${widths[2]}"></colgroup><tbody><tr><td rowspan="2" style="height:${2501 / 75}px">A</td><th colspan="2">BC</th></tr><tr><td>B</td><td>C</td></tr></tbody></table>`;
  await page.locator("#file-input").setInputFiles({
    name: "ordinary-fractional-merged.html",
    mimeType: "text/html",
    buffer: Buffer.from(html),
  });
  await expect(page.locator("#toast")).toContainText(
    "ordinary-fractional-merged.html",
  );
  /** Actual imported source cells must retain their independent original logical columns. */
  const cells = geometryCells(await savedSource(page));
  expect(cells).toHaveLength(4);
  expect(cells[0].attrs!.colwidth).toEqual([widths[0]]);
  expect(cells[0].attrs!.nativeCellHeight).toBe(2501);
  expect(cells[1].type).toBe("tableHeader");
  expect(cells[1].attrs!.colwidth).toHaveLength(2);
  expect(Math.round(cells[1].attrs!.colwidth[0] * 75)).toBe(6122);
  expect(Math.round(cells[1].attrs!.colwidth[1] * 75)).toBe(8003);
  expect(cells[2].attrs!.colwidth).toHaveLength(1);
  expect(Math.round(cells[2].attrs!.colwidth[0] * 75)).toBe(6122);
  expect(cells[3].attrs!.colwidth).toEqual([widths[2]]);
}

test(
  "native exact cell geometry survives real typing, all document saves, HTML reimport and undo",
  verifyNativeGeometryUi,
);
test(
  "ordinary HTML fractional colgroups retain logical widths across row and column spans",
  verifyOrdinaryMergedHtmlGeometry,
);

/**
 * Keep older one-slot merged totals through the actual public document importer.
 *
 * The live editor's table normalization must not reinterpret a whole merged
 * width as the first logical column before real native saves are produced.
 * @async
 * @param {{page:Page}} context - Actual isolated production application renderer.
 * @returns {Promise<void>} Resolves after the real imported legacy width survives all native saves.
 * @throws {Error} If editor normalization stretches the original merged total.
 * @example
 * // A single old colwidth slot is the complete 10001-unit three-column span.
 */
async function verifyLegacyGeometryUi({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Independent older source deliberately stores its complete span in one width slot. */
  const cell: JSONContent = {
    type: "tableCell",
    attrs: {
      colspan: 3,
      rowspan: 1,
      colwidth: [10001 / 75],
      nativeCellHeight: 1777,
    },
    content: [
      { type: "paragraph", content: [{ type: "text", text: "LEGACY" }] },
    ],
  };
  /** The public file importer supplies this real source to the actual editor schema. */
  const doc: JSONContent = {
    type: "doc",
    content: [
      { type: "table", content: [{ type: "tableRow", content: [cell] }] },
    ],
  };
  await importSource(page, "legacy-merged-width.fhn", doc);
  for (/** Actual native output includes any real editor-side normalization rather than bypassing it. */ const format of [
    "hwpx",
    "hwp",
  ] as const) {
    /** The independently read complete native file exposes the actual stored merged width. */
    const cells = geometryCells(await savedSource(page, format));
    expect(cells).toHaveLength(1);
    let total = 0;
    for (/** Actual serialized logical widths must retain the original complete span. */ const width of cells[0]
      .attrs!.colwidth)
      total += width * 75;
    expect(Math.round(total)).toBe(10001);
    expect(cells[0].attrs!.nativeCellHeight).toBe(1777);
  }
}

test(
  "legacy merged totals survive actual editor import and real native file saves",
  verifyLegacyGeometryUi,
);
