import { expect, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import { geometryCells } from "./cell-geometry.ts";

/**
 * Apply explicit physical dimensions through the real native cell-size form.
 *
 * Actual native access keys focus each enabled numeric draft. The shared modal
 * accepts one explicit source decision after both native values are entered.
 * @async
 * @param {Page} page - Actual renderer with its real table property dialog open.
 * @param {string} [width='20.00'] - Explicit native width in millimeters.
 * @param {string} [height='10.00'] - Explicit native height in millimeters.
 * @returns {Promise<void>} Resolves after the actual valid size decision closes the dialog.
 * @throws {Error} If native controls, access keys or actual Apply do not work.
 * @example
 * await editNativeCellSize(page); // Original source width5669 and height2834.
 */
export async function editNativeCellSize(
  page: Page,
  width = "20.00",
  height = "10.00",
): Promise<void> {
  await page.locator('[data-table-tab="3"]').click();
  await expect(page.locator('[name="width"]')).toBeDisabled();
  await expect(page.locator('[name="height"]')).toBeDisabled();
  await page.locator('[name="sizeApply"]').check();
  await page.keyboard.press("Alt+w");
  await expect(page.locator('[name="width"]')).toBeFocused();
  await page.locator('[name="width"]').fill(width);
  await page.keyboard.press("Alt+h");
  await expect(page.locator('[name="height"]')).toBeFocused();
  await page.locator('[name="height"]').fill(height);
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-table-cell")).toHaveCount(0);
}

/**
 * Check the original source sizes of one explicitly resized six-cell table.
 *
 * Original20mm and10mm source values are literal independent expectations.
 * Every unselected source cell must keep its original width and minimum height.
 * @param {JSONContent} doc - Actual parsed native output.
 * @param {string} format - Actual native format for source diagnostics.
 * @param {number} [width=5669] - Independently observed native width for the selected first cell.
 * @param {number} [height=2834] - Independently observed native height for the selected first cell.
 * @returns {void} Completes original geometry and unselected-source checks.
 * @throws {Error} If an owner, original distance or unselected size changes.
 * @example
 * assertSingleCellSize(savedDoc,'hwp');
 */
export function assertSingleCellSize(
  doc: JSONContent,
  format: string,
  width = 5669,
  height = 2834,
): void {
  /** Actual saved source supplies every owning-cell measurement. */
  const cells = geometryCells(doc),
    widths: number[] = [],
    heights: number[] = [];
  for (/** Native physical widths are reconstructed before comparing independent original units. */ const cell of cells) {
    let measured = 0;
    for (/** Fractional column slots retain one complete native total. */ const part of cell
      .attrs?.colwidth ?? [])
      measured += part * 75;
    widths.push(Math.round(measured));
    heights.push(cell.attrs!.nativeCellHeight);
  }
  expect(widths, format).toEqual([width, 6122, 6122, 6122, 6122, 6122]);
  expect(heights, format).toEqual([height, 282, 282, 282, 282, 282]);
}
