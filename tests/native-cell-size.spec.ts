import { test, type Page } from "@playwright/test";
import { importSource, savedSource } from "./helpers/format-painter.ts";
import {
  cellSizeDocument,
  assertIndependentCellWidths,
} from "./helpers/cell-size.ts";

/**
 * Preserve independently sized original cells through real renderer import and native saving.
 *
 * The ordinary table repair pass must not silently copy a resized first-row
 * width onto an unselected second-row cell or undo the resized source width.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after every actual saved source format retains each owning width.
 * @throws {Error} If logical column normalization changes the original native source.
 * @example
 * // The original document contains5669 above6122 in one logical column.
 */
async function verifyIndependentCellWidths({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await importSource(
    page,
    "independent-cell-widths.fhn",
    cellSizeDocument(true),
  );
  for (/** Each actual public writer must retain the independent owning-cell geometry. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const) {
    assertIndependentCellWidths(await savedSource(page, format), format);
  }
}

test(
  "native cell widths remain independent across shared logical columns",
  verifyIndependentCellWidths,
);
