import { test, expect, type Page } from "@playwright/test";
import {
  importSource,
  selectSource,
  savedSource,
} from "./helpers/format-painter.ts";
import {
  tableDialogDocument,
  openTableDialog,
} from "./helpers/table-properties-dialog.ts";
import { geometryCells } from "./helpers/cell-geometry.ts";
import {
  editNativeTableDistances,
  assertNativeTableDistances,
} from "./helpers/table-distance.ts";

for (/** Original actual native observations separately establish cell override and common-table margin units. */ const scope of [
  "cell",
  "table",
] as const) {
  /**
   * Retain original fractional native margins through real source editing and public saves.
   *
   * Ordinary source import, actual native form input, three real save formats
   * and one-step undo independently verify source distance and scope ownership.
   * @async
   * @param {{page:Page}} context - Actual isolated production renderer.
   * @returns {Promise<void>} Resolves after all actual saved source and history assertions agree.
   * @throws {Error} If original141 units become142 or unrelated source changes.
   * @example
   * // Native0.50mm margins must match actual original CELLMARGIN or INSIDEMARGIN fields.
   */
  async function verifyOriginalMarginUnits({
    page,
  }: {
    page: Page;
  }): Promise<void> {
    await page.goto("/");
    await importSource(
      page,
      "fractional-" + scope + "-margins.fhn",
      tableDialogDocument(),
    );
    /** The actual original saved source identifies untouched source owners and one-step history. */
    const before = await savedSource(page);
    await selectSource(page, ".tiptap td:first-child p", 1);
    await openTableDialog(page);
    await editNativeTableDistances(page, scope);
    for (/** Every real native writer must retain the same independently observed original physical units. */ const format of [
      "forhan",
      "hwpx",
      "hwp",
    ] as const)
      assertNativeTableDistances(
        await savedSource(page, format),
        scope,
        format,
      );
    /** Only explicitly changed margin fields may differ in the complete FHN source. */
    const expected = structuredClone(before);
    if (scope === "cell") {
      geometryCells(expected)[0].attrs!.nativeCellProperties.hasMargin = true;
      geometryCells(expected)[0].attrs!.nativeCellProperties.margins = {
        left: 141,
        right: 141,
        top: 141,
        bottom: 141,
      };
    } else
      expected.content![0].attrs!.nativeCellMargins = {
        left: 141,
        right: 141,
        top: 141,
        bottom: 141,
      };
    expect(await savedSource(page)).toEqual(expected);
    await page.locator(".tiptap").focus();
    await page.keyboard.press("ControlOrMeta+z");
    expect(await savedSource(page)).toEqual(before);
  }
  test(
    "native " +
      scope +
      " margins retain original fractional units and source ownership",
    verifyOriginalMarginUnits,
  );
}

/**
 * Preserve an untouched source integer hidden behind a rounded native margin display.
 *
 * Both141 and142 units display0.50mm. Editing another source side must not
 * reconvert the untouched142-unit value or borrow it for the changed side.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after unchanged and explicitly edited native distances remain distinct.
 * @throws {Error} If display rounding destroys untouched source precision.
 * @example
 * // Untouched142 remains142 while the edited right0.50mm becomes original141.
 */
async function verifyUntouchedRoundedMargin({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Independent source integers deliberately share the same two-decimal visible distance. */
  const doc = tableDialogDocument();
  doc.content![0].attrs!.nativeCellMargins.left = 142;
  await importSource(page, "rounded-margin-source.fhn", doc);
  await selectSource(page, ".tiptap td:first-child p", 1);
  await openTableDialog(page);
  await page.locator('[data-table-tab="2"]').click();
  await expect(page.locator('[name="tableMarginLeft"]')).toHaveValue("0.50");
  await page.locator('[name="tableMarginRight"]').fill("0.50");
  await page.locator('[data-modal-value="apply"]').click();
  /** Only actual saved source determines whether the rounded untouched value survived. */
  const output = await savedSource(page);
  expect(output.content![0].attrs!.nativeCellMargins).toEqual({
    left: 142,
    right: 141,
    top: 141,
    bottom: 141,
  });
}

test(
  "native margin display rounding preserves untouched source integers",
  verifyUntouchedRoundedMargin,
);
