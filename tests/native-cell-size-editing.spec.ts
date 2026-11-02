import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { JSONContent } from "@tiptap/core";
import {
  importSource,
  savedSource,
  selectSource,
} from "./helpers/format-painter.ts";
import { cellSizeDocument } from "./helpers/cell-size.ts";
import { openTableDialog } from "./helpers/table-properties-dialog.ts";
import { geometryCells } from "./helpers/cell-geometry.ts";
import {
  editNativeCellSize,
  assertSingleCellSize,
} from "./helpers/cell-size-editing.ts";

/**
 * Edit the actual owning cell through native controls, all public saves and one undo.
 *
 * Original observed source distances differ from rounded display conversion.
 * Every unselected owning cell must retain its own complete source snapshot.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after real saved source and one-step history agree.
 * @throws {Error} If sizing, source ownership, native controls or undo changes.
 * @example
 * // Explicit20mm and10mm become original5669 and2834 native units.
 */
async function verifySingleSize({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await importSource(page, "single-size.fhn", cellSizeDocument());
  /** The actual imported source is the independent untouched-neighbor and history baseline. */
  const before = await savedSource(page);
  await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
  await openTableDialog(page);
  await editNativeCellSize(page);
  for (/** Every public native save observes actual accepted original distances. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const)
    assertSingleCellSize(await savedSource(page, format), format);
  /** Unselected FHN source owners remain complete, not only visually unchanged. */
  const after = geometryCells(await savedSource(page));
  expect(after.slice(1)).toEqual(geometryCells(before).slice(1));
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
}

/**
 * Apply both visible native dimensions to a real mixed-width selected rectangle.
 *
 * Changing only height still explicitly applies the displayed logical width,
 * exactly as independently observed in the original mixed native selection.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after both selected owners and all unselected source agree.
 * @throws {Error} If visible native width, selected scope or untouched source differs.
 * @example
 * // A raw5669-unit first cell and6122-unit second cell both receive displayed6122.
 */
async function verifyMixedSize({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await importSource(page, "mixed-size.fhn", cellSizeDocument(true));
  /** Genuine rendered cell bounds determine the actual native selected rectangle. */
  const before = await savedSource(page),
    first = await page.locator(".tiptap td").nth(0).boundingBox(),
    second = await page.locator(".tiptap td").nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  await page.mouse.move(first!.x + 10, first!.y + 10);
  await page.mouse.down();
  await page.mouse.move(second!.x + 10, second!.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".selectedCell")).toHaveCount(2);
  await openTableDialog(page);
  await page.locator('[data-table-tab="3"]').click();
  await expect(page.locator('[name="width"]')).toHaveValue("21.60");
  await page.locator('[name="sizeApply"]').check();
  await page.locator('[name="height"]').fill("10.00");
  await page.locator('[data-modal-value="apply"]').click();
  /** Only the two actually selected source owners receive the explicit common native dimensions. */
  const after = geometryCells(await savedSource(page));
  for (let index = 0; index < 2; index++) {
    expect(Math.round(after[index].attrs!.colwidth[0] * 75)).toBe(6122);
    expect(after[index].attrs!.nativeCellHeight).toBe(2834);
  }
  expect(after.slice(2)).toEqual(geometryCells(before).slice(2));
}

/**
 * Keep invalid, canceled and disabled native size drafts outside document history.
 *
 * A hidden invalid width must become visible and retain the modal. Turning off
 * size application discards its draft without changing original minimum heights.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after invalid Apply, cancellation and disabled drafts preserve source.
 * @throws {Error} If a rejected or disabled numeric draft changes source.
 * @example
 * // An unaccepted negative width cannot modify any selected or neighboring cell.
 */
async function verifySizeCancellation({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await importSource(page, "canceled-size.fhn", cellSizeDocument());
  /** Exact original source remains the independent cancellation and disabled-draft baseline. */
  const before = await savedSource(page);
  await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
  await openTableDialog(page);
  await page.locator('[data-table-tab="3"]').click();
  await page.locator('[name="sizeApply"]').check();
  await page.locator('[name="width"]').fill("-1");
  await page.locator('[data-table-tab="0"]').click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#ntc-panel-3")).toBeVisible();
  await expect(page.locator('[name="width"]')).toBeFocused();
  await page.keyboard.press("Escape");
  expect(await savedSource(page)).toEqual(before);
  await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
  await openTableDialog(page);
  await page.locator('[data-table-tab="3"]').click();
  await page.locator('[name="sizeApply"]').check();
  await page.locator('[name="width"]').fill("20.00");
  await page.locator('[name="sizeApply"]').uncheck();
  await page.locator('[data-modal-value="apply"]').click();
  expect(await savedSource(page)).toEqual(before);
}

/**
 * Resize a real horizontally or vertically merged owning cell without changing its neighbors.
 *
 * Literal original addresses, spans and measurements independently author the
 * starting document. The real native dialog applies one common physical total.
 * @async
 * @param {string} scope - Independently observed original merge direction.
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after all three saved formats retain original merged ownership.
 * @throws {Error} If total width, height, spans or unrelated source changes.
 * @example
 * // A two-column total becomes5669 units while its two-column ownership remains intact.
 */
async function verifyMergedSize(
  scope: string,
  { page }: { page: Page },
): Promise<void> {
  /** Actual original observations supply literal source addresses and independently measured sizes. */
  const observations = JSON.parse(
      readFileSync(
        new URL("./fixtures/native-cell-resize.json", import.meta.url),
        "utf8",
      ),
    ),
    original = observations.rows.find(
      /**
       * Select the literal original merge case without producing expected geometry through editor code.
       *
       * Source observations remain independent from the production native controls.
       * @param {{scope:string;id:string}} row - Independent original observed source decision.
       * @returns {boolean} Whether it is this actual original merged resize case.
       * @example
       * // Horizontal and vertical spans are distinct original observations.
       */
      (row: { scope: string; id: string }) =>
        row.scope === scope && row.id === "resize-both",
    ),
    rows: JSONContent[] = [];
  expect(original).toBeTruthy();
  for (/** Actual starting-row ownership omits covered slots in merged source rows. */ const cell of original.before) {
    rows[cell.row] ??= { type: "tableRow", content: [] };
    rows[cell.row].content!.push({
      type: "tableCell",
      attrs: {
        colspan: cell.colspan,
        rowspan: cell.rowspan,
        colwidth: Array(cell.colspan).fill(cell.width / cell.colspan / 75),
        nativeCellHeight: cell.height,
      },
      content: [
        { type: "paragraph", content: [{ type: "text", text: cell.text }] },
      ],
    });
  }
  await page.goto("/");
  await importSource(page, scope + ".fhn", {
    type: "doc",
    content: [{ type: "table", content: rows }],
  });
  /** The real original source remains the independent unselected-owner and history baseline. */
  const before = await savedSource(page);
  await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
  await openTableDialog(page);
  await editNativeCellSize(page);
  for (/** Each actual public writer must retain the merged physical total independently from shared grid widths. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const) {
    /** Actual parsed native output supplies all measurements and source spans. */
    const cells = geometryCells(await savedSource(page, format));
    expect(cells.length).toBe(original.after.length);
    for (let index = 0; index < cells.length; index++) {
      let width = 0;
      for (/** Sum actual fractional physical slots before reconstructing native source units. */ const part of cells[
        index
      ].attrs!.colwidth)
        width += part * 75;
      expect(Math.round(width)).toBe(original.after[index].width);
      expect(cells[index].attrs!.nativeCellHeight).toBe(
        original.after[index].height,
      );
      expect(cells[index].attrs!.colspan ?? 1).toBe(
        original.after[index].colspan,
      );
      expect(cells[index].attrs!.rowspan ?? 1).toBe(
        original.after[index].rowspan,
      );
    }
  }
  expect(geometryCells(await savedSource(page)).slice(1)).toEqual(
    geometryCells(before).slice(1),
  );
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
}

test(
  "native cell size applies original physical units through three formats and one undo",
  verifySingleSize,
);
for (/** Actual original zero and half-millimeter values retain literal independently observed native units. */ const [
  display,
  units,
] of [
  ["0.00", 0],
  ["0.50", 141],
] as const) {
  /**
   * Retain a genuinely entered native boundary value through real native and HTML saves.
   *
   * Explicit zero is distinct from an absent width. The original half-millimeter
   * value truncates to141 units rather than rounding to142 native units.
   * @async
   * @param {{page:Page}} context - Actual isolated production renderer.
   * @returns {Promise<void>} Resolves after every actual saved source and HTML reimport retain the boundary.
   * @throws {Error} If explicit zero, fractional native units or unrelated source changes.
   * @example
   * // Original0.00mm remains0 and original0.50mm remains141 source units.
   */
  async function verifyNativeSizeBoundary({
    page,
  }: {
    page: Page;
  }): Promise<void> {
    await page.goto("/");
    await importSource(page, "native-size-boundary.fhn", cellSizeDocument());
    /** The actual original source snapshot independently identifies every unselected cell. */
    const before = await savedSource(page);
    await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
    await openTableDialog(page);
    await editNativeCellSize(page, display, display);
    for (/** Each public native writer must preserve the explicitly entered original boundary distance. */ const format of [
      "forhan",
      "hwpx",
      "hwp",
    ] as const) {
      /** Actual source output supplies every measured original boundary and unselected owner. */
      const cells = geometryCells(await savedSource(page, format));
      let width = 0;
      for (/** A native complete cell width is reconstructed after its physical slots are summed. */ const part of cells[0]
        .attrs!.colwidth)
        width += part * 75;
      expect(Math.round(width)).toBe(units);
      expect(cells[0].attrs!.nativeCellHeight).toBe(units);
    }
    expect(geometryCells(await savedSource(page)).slice(1)).toEqual(
      geometryCells(before).slice(1),
    );
    /** The actual public HTML export is reimported without replacing its original width metadata. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator('[data-export="html"]').click();
    /** Actual complete exported bytes enter the production import path unchanged. */
    const download = await pending,
      bytes = await readFile((await download.path())!);
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "native-size-boundary.html",
        mimeType: "text/html",
        buffer: bytes,
      });
    await expect(page.locator("#toast")).toContainText(
      "native-size-boundary.html",
    );
    /** Only actual reimported source measurements determine whether explicit zero survived HTML. */
    const first = geometryCells(await savedSource(page))[0];
    let width = 0;
    for (/** Exact native source units remain independent from browser minimum painting width. */ const part of first
      .attrs!.colwidth)
      width += part * 75;
    expect(Math.round(width)).toBe(units);
    expect(first.attrs!.nativeCellHeight).toBe(units);
  }
  test(
    "native cell-size boundary " +
      display +
      " retains original source through native files and HTML",
    verifyNativeSizeBoundary,
  );
}
test(
  "native size application retains the original mixed-selection scope and displayed width",
  verifyMixedSize,
);
test(
  "native size cancellation and disabled drafts preserve original source",
  verifySizeCancellation,
);
for (/** Both independently observed native merge directions retain their complete source ownership. */ const scope of [
  "merged-horizontal",
  "merged-vertical",
]) {
  /**
   * Supply real browser fixtures to one independently observed native merge direction.
   *
   * A declared destructured fixture keeps Playwright's real page ownership.
   * @async
   * @param {{page:Page}} context - Actual isolated browser renderer.
   * @returns {Promise<void>} Resolves after this original merged scope and actual undo agree.
   * @throws {Error} If merged source dimensions or public native output differ.
   * @example
   * // Each merge direction gets its own genuine isolated browser page.
   */
  async function verifyMergedScope({ page }: { page: Page }): Promise<void> {
    await verifyMergedSize(scope, { page });
  }
  test(
    "native size editing preserves " + scope + " source and undo",
    verifyMergedScope,
  );
}
