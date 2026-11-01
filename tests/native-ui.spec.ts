import { test, expect } from "@playwright/test";

test(
"measured native chrome keeps its geometry and working ribbon selection",
/**
 * Verify the captured native window bands and independently working tabs.
 *
 * Checks measured geometry at the reference viewport, then selects a different
 * ribbon and opens a split menu without changing the selected ribbon.
 *
 * @async
 * @param {import('@playwright/test').PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves when the measured controls behave correctly.
 * @throws {Error} If the native bands move or tab and split-menu state diverge.
 * @example
 * // The editing ribbon starts at y=66 at a 1440 by 960 viewport.
 */
async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tiptap")).toBeVisible();
  expect(await page.locator(".native-caption").boundingBox()).toMatchObject({
    x: 1,
    y: 1,
    height: 32,
  });
  expect(await page.locator(".native-menubar").boundingBox()).toMatchObject({
    x: 1,
    y: 33,
    height: 33,
  });
  expect(await page.locator("#native-ribbon").boundingBox()).toMatchObject({
    x: 1,
    y: 66,
    height: 88,
  });
  await page.locator('button[data-native-tab="format"]').click();
  await expect(page.locator('[data-ribbon-tab="format"]')).toBeVisible();
  await page.locator('[data-native-menu="page"]').click();
  await expect(page.locator("#native-other-menu")).toBeVisible();
  await expect(
    page.locator('button[data-native-tab="format"]'),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#native-other-menu")).toBeHidden();
});

test(
"character dialog applies formatting and cancellation preserves the draft",
/**
 * Verify native dialog geometry and explicit character-format application.
 *
 * A selected Korean phrase receives a new point size and emphasis through the
 * native ribbon dialog. A second cancelled draft leaves the saved style intact.
 *
 * @async
 * @param {import('@playwright/test').PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves when application and cancellation retain their semantics.
 * @throws {Error} If dialog geometry or editor formatting is incorrect.
 * @example
 * // Setting 14 pt and bold creates styled editable text after confirmation.
 */
async ({ page }) => {
  await page.goto("/");
  await page.locator(".tiptap").fill("한글 서식 검증");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('#native-ribbon [data-native-action="char-format"]')
    .first()
    .click();
  expect(
    await page.locator(".modal.native-dialog-character").boundingBox(),
  ).toMatchObject({ width: 695, height: 570 });
  await page.locator('#native-format-form [name="size"]').fill("14");
  await page.locator('#native-format-form [name="bold"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap strong")).toContainText("한글 서식 검증");
  await expect(page.locator('.tiptap [style*="14pt"]')).toContainText(
    "한글 서식 검증",
  );
  await page
    .locator('#native-ribbon [data-native-action="char-format"]')
    .first()
    .click();
  await page.locator('#native-format-form [name="size"]').fill("30");
  await page.keyboard.press("Escape");
  await expect(page.locator('.tiptap [style*="14pt"]')).toContainText(
    "한글 서식 검증",
  );
  await expect(page.locator('.tiptap [style*="30pt"]')).toHaveCount(0);
});

test(
"opening another document clears history from the previous document",
/**
 * Verify that undo cannot restore content belonging to an earlier document.
 *
 * Loads a second portable document after editing the first and presses Undo,
 * ensuring document replacement establishes a fresh editor history boundary.
 *
 * @async
 * @param {import('@playwright/test').PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves when document isolation survives an undo command.
 * @throws {Error} If an earlier document is restored through shared undo history.
 * @example
 * // Undo in the newly opened document never restores the prior manuscript.
 */
async ({ page }) => {
  await page.goto("/");
  await page.locator(".tiptap").fill("이전 문서의 비공개 원고");
  /** Independent portable document used to replace the edited manuscript. */
  const buffer = Buffer.from(
    JSON.stringify({
      application: "forhan",
      version: 1,
      title: "두 번째 문서",
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "새 문서 내용" }],
          },
        ],
      },
    }),
  );
  await page.locator("#file-input").setInputFiles({
    name: "다음.forhan",
    mimeType: "application/json",
    buffer,
  });
  await page.getByRole("button", { name: "저장 안 함", exact: true }).click();
  await expect(page.locator(".tiptap")).toContainText("새 문서 내용");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap")).toHaveText("새 문서 내용");
  await expect(page.locator(".tiptap")).not.toContainText("비공개");
});

/**
 * Verify native table grid preview, insertion and compatible numeric creation.
 * The test inserts a rectangular grid selection through the existing table command.
 * @param {import('@playwright/test').PlaywrightTestArgs} context Isolated browser page.
 * @returns {Promise<void>} Resolves after native table selection inserts the expected cells.
 * @throws {Error} If picker geometry, highlighting or document insertion is incorrect.
 * @example await verifyNativeTableGrid({page});
 */
async function verifyNativeTableGrid({
  page,
}: import("@playwright/test").PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".tiptap")).toBeVisible();
  await page.locator('button[data-native-tab="format"]').click();
  await page.locator('button[data-native-tab="edit"]').click();
  await page.locator("#insert-table").click();
  await expect(page.locator('.nt-grid [role="gridcell"]')).toHaveCount(144);
  await page.locator('[data-table-row="2"][data-table-col="3"]').hover();
  await expect(page.locator(".nt-grid .selected")).toHaveCount(6);
  await expect(page.locator(".nt-cancel")).toHaveText("3 × 2 표");
  await page.locator('[data-table-row="2"][data-table-col="3"]').click();
  await expect(page.locator(".tiptap table tr")).toHaveCount(2);
  await expect(page.locator(".tiptap table td,.tiptap table th")).toHaveCount(
    6,
  );
  await expect(page.locator("#table-menu")).toBeHidden();
  await page.locator("#insert-table").click();
  await page.locator(".nt-create-dialog").click();
  await expect(page.locator("#table-rows")).toBeVisible();
  await page.locator(".nt-cancel").click();
  await expect(page.locator("#table-menu")).toBeHidden();
}
test(
  "native table picker previews and inserts the selected rectangle",
  verifyNativeTableGrid,
);

/**
 * Verify native search geometry and persistent replacement behavior.
 *
 * Search opens a measured right dock, offers real selectable results, and keeps
 * the pane open on Escape while explicit closing restores the workspace.
 * @param {import('@playwright/test').PlaywrightTestArgs} context Isolated browser page.
 * @returns {Promise<void>} Resolves when native search and replacement behave correctly.
 * @throws {Error} If geometry, search navigation, replacement or closing regresses.
 * @example
 * await verifyNativeFindDock({ page });
 */
async function verifyNativeFindDock({
  page,
}: import("@playwright/test").PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("포한 검색 첫째 포한 검색 둘째");
  await page.keyboard.press("ControlOrMeta+f");
  expect(await page.locator("#find-panel").boundingBox()).toMatchObject({
    x: 1059,
    y: 187,
    width: 380,
    height: 747,
  });
  expect(await page.locator("#find-text").boundingBox()).toMatchObject({
    x: 1077,
    y: 250,
    width: 256,
    height: 24,
  });
  expect(
    await page.locator("#native-find-results").boundingBox(),
  ).toMatchObject({ x: 1081, y: 328, width: 294, height: 582 });
  await page.locator("#find-text").fill("포한");
  await expect(page.locator("#native-find-results > button")).toHaveCount(2);
  await page.locator("#native-find-results > button").nth(1).click();
  await expect(page.locator("#find-count")).toHaveText("2 / 2");
  await page.keyboard.press("Escape");
  await expect(page.locator("#find-panel")).toBeVisible();
  await expect(page.locator(".tiptap")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.locator("#find-panel")).toBeVisible();
  await expect(page.locator("#replace-text")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+h");
  await expect(page.locator("#replace-text")).toBeVisible();
  await page.locator("#replace-text").fill("<Forhan>");
  await page.locator("#replace-all").click();
  await expect(page.locator(".tiptap")).toHaveText(
    "<Forhan> 검색 첫째 <Forhan> 검색 둘째",
  );
  await page.locator("#find-close").click();
  await expect(page.locator("#find-panel")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/find-open/);
}
test(
  "native find dock preserves measured geometry and Korean replacement",
  verifyNativeFindDock,
);

/**
 * Verify that the native-looking scrollbar controls the actual document range.
 *
 * Arrow and keyboard commands update its accessible position, while a page
 * destination stays within real paper pages and Home returns to the beginning.
 *
 * @async
 * @param {import('@playwright/test').PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after the real canvas follows each command.
 * @throws {Error} If scroll state or destination controls stop tracking the canvas.
 * @example
 * // End reaches the actual maximum and Home restores position zero.
 */
async function verifyNativeScrolling({
  page,
}: import("@playwright/test").PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Accessible range indicator linked to the canvas scroll position. */
  const thumb = page.locator(".native-scroll-thumb");
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");
  await page.locator('[data-scroll-command="down"]').click();
  await expect(thumb).toHaveAttribute("aria-valuenow", "48");
  await thumb.focus();
  await page.keyboard.press("End");
  await expect(thumb).toHaveAttribute(
    "aria-valuenow",
    (await thumb.getAttribute("aria-valuemax"))!,
  );
  await page.keyboard.press("Home");
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");
  await page.locator('[data-scroll-command="select"]').click();
  await expect(page.locator("#native-scroll-page-number")).toHaveAttribute(
    "max",
    "1",
  );
  await page.locator("#native-scroll-page-number").fill("99");
  await page.locator('[data-scroll-command="apply"]').click();
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".native-scroll-page-picker")).toBeHidden();
}
test(
  "native scrollbar follows real canvas position and page navigation",
  verifyNativeScrolling,
);
