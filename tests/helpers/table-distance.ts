import { expect, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import { geometryCells } from "./cell-geometry.ts";

/** Actual original cell/table numeric input stores0.50mm as141 native units. */
export const NATIVE_HALF_MILLIMETER = 141;

/**
 * Edit all four actual native cell or common-table margins through the real form.
 *
 * Cell override ownership is enabled explicitly. Common table margins remain
 * separate from each cell's own independent override and raw margin values.
 * @async
 * @param {Page} page - Actual renderer with the native table property dialog open.
 * @param {'cell'|'table'} scope - Actual original margin ownership to edit.
 * @returns {Promise<void>} Resolves after the actual native margin decision closes its dialog.
 * @throws {Error} If a real native field or accepted Apply is unavailable.
 * @example
 * await editNativeTableDistances(page,'cell'); // Original margins become141 units.
 */
export async function editNativeTableDistances(
  page: Page,
  scope: "cell" | "table",
): Promise<void> {
  await page.locator(`[data-table-tab="${scope === "cell" ? 3 : 2}"]`).click();
  if (scope === "cell") await page.locator('[name="hasMargin"]').check();
  /** Real original source field names distinguish common table defaults from cell overrides. */
  const prefix = scope === "cell" ? "margin" : "tableMargin";
  for (/** All four independently owned source distances receive genuine numeric form input. */ const side of [
    "Left",
    "Right",
    "Top",
    "Bottom",
  ])
    await page.locator(`[name="${prefix}${side}"]`).fill("0.50");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-table-cell")).toHaveCount(0);
}

/**
 * Assert actual native output retains original fractional margins and unrelated geometry.
 *
 * Literal141 comes from independently observed original CELLMARGIN and
 * INSIDEMARGIN XML. Source width, minimum height and other margin ownership stay separate.
 * @param {JSONContent} doc - Actual parsed public native output.
 * @param {'cell'|'table'} scope - The actual native margin owner edited through the form.
 * @param {string} format - Actual output format for failure diagnostics.
 * @returns {void} Completes original margin and unrelated geometry assertions.
 * @throws {Error} If a physical distance or unrelated source owner changes.
 * @example
 * assertNativeTableDistances(savedDoc,'table','hwpx');
 */
export function assertNativeTableDistances(
  doc: JSONContent,
  scope: "cell" | "table",
  format: string,
): void {
  let table: JSONContent | undefined;
  for (/** Only an actual saved source table can supply the common native margin values. */ const node of doc.content ??
    [])
    if (node.type === "table") {
      table = node;
      break;
    }
  expect(table, format).toBeDefined();
  /** The actual parser supplies source owners and all output measurements under test. */
  const cells = geometryCells(doc),
    half = {
      left: NATIVE_HALF_MILLIMETER,
      right: NATIVE_HALF_MILLIMETER,
      top: NATIVE_HALF_MILLIMETER,
      bottom: NATIVE_HALF_MILLIMETER,
    };
  if (scope === "table")
    expect(table!.attrs!.nativeCellMargins, format).toEqual(half);
  else {
    expect(cells[0].attrs!.nativeCellProperties.hasMargin, format).toBe(true);
    expect(cells[0].attrs!.nativeCellProperties.margins, format).toEqual(half);
    expect(table!.attrs!.nativeCellMargins, format).toEqual({
      left: 510,
      right: 510,
      top: 141,
      bottom: 141,
    });
  }
  expect(cells.length).toBe(3);
  for (let index = 0; index < 3; index++) {
    let width = 0;
    for (/** Actual source widths reconstruct native distances before independent comparisons. */ const part of cells[
      index
    ].attrs!.colwidth)
      width += part * 75;
    expect(Math.round(width), format).toBe([6122, 8003, 4001][index]);
    expect(cells[index].attrs!.nativeCellHeight, format).toBe(
      [282, 1001, 1777][index],
    );
  }
}
