import { test, expect, type Page } from "@playwright/test";
import {
  importSource,
  selectSource,
  savedSource,
} from "./helpers/format-painter.ts";
import {
  tableDialogDocument,
  openTableDialog,
  editTableDialog,
  assertTableDialogOutput,
} from "./helpers/table-properties-dialog.ts";

/**
 * Apply native table and cell fields through the real measured form and complete public saves.
 *
 * Real menu routing, source ownership, three writers and one-step undo establish
 * behavior independently from internal editor commands or injected state.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after actual saved source and undo agree.
 * @throws {Error} If a native property, source cell or physical measurement is lost.
 * @example
 * // Native title-cell ownership cannot change the cell body or fill.
 */
async function verifyNativeTableDialog({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await importSource(page, "table-dialog-edit.fhn", tableDialogDocument());
  /** The public source file establishes exact pre-edit history and ownership invariants. */
  const before = await savedSource(page);
  await selectSource(page, ".tiptap td:first-child p", 1);
  await openTableDialog(page);
  await expect(page.locator(".native-dialog-table-cell")).toHaveCSS(
    "width",
    "670px",
  );
  await expect(page.locator(".native-dialog-table-cell")).toHaveCSS(
    "height",
    "715px",
  );
  await expect(page.locator('.ntc-tabs [role="tab"]')).toHaveText([
    "기본",
    "여백/캡션",
    "표",
    "셀",
  ]);
  await editTableDialog(page);
  for (/** Every public source format must preserve the actual accepted native property draft. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const)
    assertTableDialogOutput(await savedSource(page, format));
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
}

/**
 * Keep invalid hidden drafts and cancellation outside source history.
 *
 * Applying from another tab must reveal the invalid cell margin rather than
 * dismissing the form or silently substituting zero.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after invalid Apply and cancellation retain exact source.
 * @throws {Error} If source changes or an invalid hidden field escapes validation.
 * @example
 * // Negative cell margins remain an editable local draft with native validation.
 */
async function verifyTableDialogCancellation({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await importSource(page, "table-dialog-cancel.fhn", tableDialogDocument());
  /** Actual publicly saved source supplies the complete independent cancellation baseline. */
  const before = await savedSource(page);
  await selectSource(page, ".tiptap td:first-child p", 1);
  await openTableDialog(page);
  await page.locator('[data-table-tab="3"]').click();
  await page.locator('[name="hasMargin"]').check();
  await page.locator('[name="marginLeft"]').fill("-1");
  await page.locator('[data-table-tab="2"]').click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('[data-table-tab="3"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('[name="marginLeft"]')).toBeFocused();
  await page.keyboard.press("Escape");
  expect(await savedSource(page)).toEqual(before);
}

/**
 * Preserve untouched mixed values across a genuine selected-cell rectangle.
 *
 * Real pointer dragging selects two cells. One explicit protection edit cannot
 * borrow the representative cell's alignment, margins, field identity or size.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after independent selected and unselected source invariants agree.
 * @throws {Error} If mixed source values or an unselected source cell are overwritten.
 * @example
 * // Only the two selected native cells receive the explicit protected flag.
 */
async function verifyMixedTableDialog({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await importSource(page, "table-dialog-mixed.fhn", tableDialogDocument());
  /** Original cells and real rendered bounds determine the genuine selected rectangle. */
  const before = await savedSource(page),
    first = await page.locator(".tiptap td").nth(0).boundingBox(),
    second = await page.locator(".tiptap td").nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  await page.mouse.move(first!.x + 10, first!.y + 10);
  await page.mouse.down();
  await page.mouse.move(second!.x + 10, second!.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".tiptap .selectedCell")).toHaveCount(2);
  await openTableDialog(page);
  await page.locator('[data-table-tab="3"]').click();
  await expect(page.locator('[name="hasMargin"]')).toHaveJSProperty(
    "indeterminate",
    true,
  );
  await page.locator('[name="protected"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  /** Actual saved source is compared with independently retained original selected-cell metadata. */
  const after = await savedSource(page);
  for (let index = 0; index < 3; index++) {
    /** Only an explicit selected protection field differs from the complete original source cell. */
    const expected = structuredClone(
      before.content![0].content![0].content![index],
    );
    if (index < 2) expected.attrs!.nativeCellProperties.protected = true;
    expect(after.content![0].content![0].content![index]).toEqual(expected);
  }
}

test(
  "native table and cell dialog applies actual source fields through all native saves and one undo",
  verifyNativeTableDialog,
);
test(
  "native table dialog reveals invalid hidden drafts and cancellation preserves source",
  verifyTableDialogCancellation,
);
test(
  "native table dialog edits only explicit fields in an actual mixed selected-cell rectangle",
  verifyMixedTableDialog,
);

/**
 * Keep an IME composition Enter inside the literal native field-name editor.
 *
 * The same real modal must remain open for composition completion and accept
 * a later ordinary Enter. This tests key routing rather than physical OS IME.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after composition routing, literal source and one-step undo agree.
 * @throws {Error} If composition Enter accepts or loses the native field-name draft.
 * @example
 * // A Korean field name is not applied halfway through its composition.
 */
async function verifyTableDialogComposition({page}:{page:Page}):Promise<void>{
  await page.goto('/');await importSource(page,'table-dialog-composition.fhn',tableDialogDocument());
  /** Complete public source output supplies the independent pre-dialog history baseline. */
  const before=await savedSource(page);
  await selectSource(page,'.tiptap td:first-child p',1);await openTableDialog(page);await page.locator('[data-table-tab="3"]').click();
  await page.locator('[name="fieldName"]').fill('포한 필드');
  await page.locator('[name="fieldName"]').dispatchEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:true,keyCode:229});
  await expect(page.locator('.native-dialog-table-cell')).toBeVisible();
  await expect(page.locator('[name="fieldName"]')).toHaveValue('포한 필드');
  await page.locator('[name="fieldName"]').press('Enter');
  await expect(page.locator('.native-dialog-table-cell')).toHaveCount(0);
  expect((await savedSource(page)).content![0].content![0].content![0].attrs!.nativeCellFieldName).toBe('포한 필드');
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
  expect(await savedSource(page)).toEqual(before);
}

test('native table field-name composition Enter retains the draft until ordinary Enter accepts it',verifyTableDialogComposition);
