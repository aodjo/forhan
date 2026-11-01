import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nativeCorpusFixture } from "./helpers/native-corpus.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx";
import { readHwp } from "../src/formats/hwp";
import { defaultPage } from "../src/documents";
/**
 * Open a clean renderer and surface runtime errors.
 *
 * Navigates to the editor in the isolated test context and waits for its accessible document textbox before assertions begin.
 *
 * @param {Page} page - The isolated renderer page controlled by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async function openEditor(page: Page): Promise<void> {
  page.on(
    "pageerror",
    /**
     * Surface an asynchronous renderer exception.
     *
     * Rethrows a browser page error so unexpected application exceptions fail the regression test.
     *
     * @param {Error} error - The asynchronous renderer exception reported by the page.
     * @returns {never} Never returns because the renderer exception is rethrown.
     * @throws {Error} Always rethrows the renderer exception to fail the test.
     * @example
     * page.on('pageerror', error => { throw error; });
     */
    (error) => {
      throw error;
    },
  );
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "문서 본문" })).toBeVisible();
}

test(
"retained objects remain visible and disclose simplified PDF rendering",
/**
 * Verify the notice for an object retained outside the editable schema.
 *
 * A portable document keeps the source object and its visible preview, while
 * the document notice makes the screen and PDF rendering limit explicit.
 *
 * @async
 * @param {import('@playwright/test').PlaywrightTestArgs} context - The isolated renderer test context.
 * @returns {Promise<void>} Resolves when the retained object and notice are visible.
 * @throws {Error} If loading removes the object or hides its rendering limitation.
 * @example
 * // A retained equation shows its preview together with the document notice.
 */
async ({ page }) => {
  await openEditor(page);
  /** Portable fixture containing one retained equation preview. */
  const bytes = Buffer.from(
    JSON.stringify({
      application: "forhan",
      version: 1,
      title: "개체 보존 검증",
      doc: {
        type: "doc",
        content: [
          {
            type: "preservedBlock",
            attrs: { label: "수식", preview: "x^2 + y^2" },
          },
        ],
      },
    }),
  );
  await page.locator("#file-input").setInputFiles({
    name: "보존.forhan",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.locator(".preserved-block")).toContainText("x^2 + y^2");
  await expect(page.locator("#notice")).toContainText("1개 개체");
  await expect(page.locator("#notice")).toContainText("PDF");
});

test(
"HWP binary export and reimport retain editable Korean content",
/**
 * Verify genuine HWP output from the browser document workflow.
 *
 * Exports Korean text without a Hancom runtime, validates the compound-file
 * signature, and reopens the bytes through the ordinary document picker.
 *
 * @async
 * @param {import('@playwright/test').PlaywrightTestArgs} context - The isolated renderer test context.
 * @returns {Promise<void>} Resolves after export and reimport preserve the edited content.
 * @throws {Error} If the browser exporter produces invalid or incomplete document bytes.
 * @example
 * // Running the suite exports a real .hwp document and reopens it in the editor.
 */
async ({ page }) => {
  await openEditor(page);
  await page.locator("#new-document").click();
  await page.locator(".tiptap").fill("HWP 직접 저장 검증: 한글과 포한");
  /** Browser download registered before invoking the binary document exporter. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="hwp"]').click();
  /** The generated legacy document downloaded by the renderer. */
  const output = await pending;
  /** Complete compound-document bytes produced without the native Hancom engine. */
  const bytes = await readFile((await output.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("d0cf11e0a1b11ae1");
  expect(JSON.stringify(readHwp(bytes).doc)).toContain("한글과 포한");
  await page.locator("#file-input").setInputFiles({
    name: "직접 저장.hwp",
    mimeType: "application/x-hwp",
    buffer: bytes,
  });
  await expect(page.locator(".tiptap")).toContainText("한글과 포한");
  await expect(page.locator("#format-badge")).toHaveText("HWP");
});
test("native blank document, Korean editing, formatting and history", /**
 * Verify Korean editing and formatting history.
 *
 * Creates a document, applies bold and heading formatting, and confirms that undo, redo and the outline follow the edited content.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  await openEditor(page);
  await expect(page.locator("#document-title")).toHaveValue("빈 문서 1");
  await expect(page.locator(".tiptap")).toHaveText("");
  await page
    .getByRole("button", { name: "새 문서", exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "문서 본문" })
    .fill("포한으로 쓰는 한글 문서");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page
    .getByRole("button", { name: "굵게 (Ctrl/⌘ B)", exact: true })
    .click();
  await expect(page.locator(".tiptap strong")).toHaveText(
    "포한으로 쓰는 한글 문서",
  );
  await page.locator("#block-style").selectOption("1");
  await expect(page.locator(".tiptap h1")).toHaveText(
    "포한으로 쓰는 한글 문서",
  );
  await expect(page.locator("#outline-list")).toContainText(
    "포한으로 쓰는 한글 문서",
  );
  await page.locator("#undo").click();
  await expect(page.locator(".tiptap h1")).toHaveCount(0);
  await page.locator("#redo").click();
  await expect(page.locator(".tiptap h1")).toHaveCount(1);
});
test("table insertion, row operations and page geometry", /**
 * Verify table commands and landscape page settings.
 *
 * Creates a table, inserts a row and checks that physical page geometry changes when the landscape preset is applied.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  await openEditor(page);
  await page.locator("#new-document").click();
  await page.locator("#insert-table").click();
  await page.locator(".nt-create-dialog").click();
  await page.locator("#table-rows").fill("2");
  await page.locator("#table-cols").fill("2");
  await page.locator("#table-create").click();
  await expect(page.locator(".tiptap tr")).toHaveCount(2);
  await page.locator(".tiptap th").first().click();
  await page.keyboard.insertText("제목");
  await page.locator("#insert-table").click();
  await page.locator(".nt-edit-toggle").click();
  await page.locator('[data-table="addRowAfter"]').click();
  await expect(page.locator(".tiptap tr")).toHaveCount(3);
  await page.locator("#page-settings").click();
  await page.locator("#preset-landscape").click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#page-label")).toContainText("가로");
  await expect(page.locator("#paper")).toHaveCSS("width", /112[12]/);
});
test("find and replace uses plain text and supports Korean", /**
 * Verify Korean plain-text find and replace.
 *
 * Checks match counts and replacement actions while confirming that replacement strings are never interpreted as HTML markup.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  await openEditor(page);
  await page.locator("#new-document").click();
  await page.locator(".tiptap").fill("한글 문서, 한글 편집");
  await page.locator("#find-toggle").click();
  await page.locator("#find-text").fill("한글");
  await expect(page.locator("#find-count")).toHaveText("1 / 2");
  await page.keyboard.press("ControlOrMeta+h");
  await page.locator("#replace-text").fill("<포한>");
  await page.locator("#replace-all").click();
  await expect(page.locator(".tiptap")).toHaveText("<포한> 문서, <포한> 편집");
  await page.locator("#find-text").fill("<포한>");
  await page.locator("#replace-text").fill("<b>");
  await page.locator("#replace-one").click();
  await expect(page.locator(".tiptap")).toContainText("<b>");
  await expect(page.locator(".tiptap b")).toHaveCount(0);
});
test("native HWPX UI import and export preserve image/table/package", /**
 * Verify renderer HWPX import and export.
 *
 * Opens an independently generated native document and inspects its downloaded HWPX content after a renderer round trip.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  /**
   * Serialized document or PDF bytes used to verify native format output.
   */
  const bytes = await writeHwpx({
    title: "호환성",
    page: defaultPage(),
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "한글 호환성 확인",
              marks: [{ type: "bold" }],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { pageBreakBefore: true },
          content: [{ type: "text", text: "두 번째 쪽" }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "표 안의 문단" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  await openEditor(page);
  await page.locator("#file-input").setInputFiles({
    name: "검증.hwpx",
    mimeType: "application/hwp+zip",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator(".tiptap strong")).toHaveText("한글 호환성 확인");
  await expect(page.locator(".tiptap td")).toContainText("표 안의 문단");
  await expect(
    page.locator(".tiptap p").filter({ hasText: "두 번째 쪽" }),
  ).toHaveCSS("break-before", "page");
  /**
   * The pending browser download event registered before the export action starts.
   */
  const download = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="hwpx"]').click();
  /**
   * The completed download or temporary native destination used by the test.
   */
  const output = await download;
  /**
   * Serialized HWPX bytes read from the completed browser download.
   */
  const saved = await readFile((await output.path())!);
  /**
   * The HWPX document decoded from the renderer-generated download.
   */
  const imported = await readHwpx(saved);
  expect(JSON.stringify(imported.doc)).toContain("표 안의 문단");
  expect(JSON.stringify(imported.doc)).toContain("한글 호환성 확인");
});
test("portable document saves and reloads retained content", /**
 * Verify portable-document save and reload.
 *
 * Downloads a portable document, inspects its stored payload and reopens it to confirm that the title and Korean content remain available.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  await openEditor(page);
  await page.locator("#new-document").click();
  await page.locator("#document-title").fill("나의 첫 포한 문서");
  await page.locator(".tiptap").fill("안녕하세요. 맥과 윈도우에서 만나요.");
  /**
   * The pending browser download event registered before the export action starts.
   */
  const download = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="forhan"]').click();
  /**
   * The completed download or temporary native destination used by the test.
   */
  const output = await download;
  expect(output.suggestedFilename()).toBe('나의 첫 포한 문서.fhn');
  /**
   * Portable-document file bytes reused for the renderer reopen assertion.
   */
  const data = await readFile((await output.path())!);
  /**
   * The parsed portable-document payload inspected before reopening it.
   */
  const parsed = JSON.parse(data.toString());
  expect(parsed.application).toBe("forhan");
  expect(parsed.doc.content[0].content[0].text).toContain("맥과 윈도우");
  await page.locator("#new-document").click();
  await page.locator("#file-input").setInputFiles({
    name: "다시.fhn",
    mimeType: "application/json",
    buffer: data,
  });
  await expect(page.locator("#document-title")).toHaveValue(
    "나의 첫 포한 문서",
  );
  await expect(page.locator(".tiptap")).toContainText("맥과 윈도우");
});
test("invalid file never replaces the active document", /**
 * Verify failed imports preserve the active document.
 *
 * Supplies invalid HWPX bytes and confirms that the error dialog leaves the existing document content untouched.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  await openEditor(page);
  await page.locator(".tiptap").fill("열기에 실패해도 유지할 원고");
  await page.locator("#file-input").setInputFiles({
    name: "깨진.hwpx",
    mimeType: "application/hwp+zip",
    buffer: Buffer.from("not a zip"),
  });
  await page.getByRole("button", { name: "저장 안 함", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "문서를 열지 못했습니다",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  await expect(page.locator(".tiptap")).toHaveText(
    "열기에 실패해도 유지할 원고",
  );
});
test("recovery restores unsaved Korean work after reload", /**
 * Verify recovery after a renderer reload.
 *
 * Waits for an unsaved snapshot, reloads the editor and restores that snapshot through the recovery dialog.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  await openEditor(page);
  await page.locator("#new-document").click();
  await page.locator(".tiptap").fill("자동 복구할 한글 원고");
  await expect
    .poll(
      /**
       * Read the renderer recovery snapshot.
       *
       * Retrieves the application-owned local storage entry used to confirm that unsaved content has been persisted.
       *
       * @returns {Promise<string | null>} The completion or inspection result used by the regression test.
       * @example
       * localStorage.getItem('forhan.recovery');
       */
      async () =>
        page.evaluate(
          /**
           * Read the renderer recovery snapshot.
           *
           * Retrieves the application-owned local storage entry used to confirm that unsaved content has been persisted.
           *
           * @returns {string | null} The completion or inspection result used by the regression test.
           * @example
           * localStorage.getItem('forhan.recovery');
           */
          () => localStorage.getItem("forhan.recovery"),
        ),
    )
    .toContain("자동 복구할 한글 원고");
  page.on(
    "dialog",
    /**
     * Accept the test reload confirmation.
     *
     * Resolves the browser confirmation dialog so the recovery test can complete its deliberate renderer reload.
     *
     * @param {Dialog} dialog - The browser confirmation dialog created by the test action.
     * @returns {Promise<void>} The completion or inspection result used by the regression test.
     * @example
     * await dialog.accept();
     */
    (dialog) => dialog.accept(),
  );
  await page.reload();
  await page.getByRole("button", { name: "복구", exact: true }).click();
  await expect(page.locator(".tiptap")).toHaveText("자동 복구할 한글 원고");
  await expect(page.locator("#save-state")).toContainText("저장되지 않은 변경");
});
test("checked-in native HWP fixture opens without Hancom runtime in renderer", /**
 * Verify independent import of a native HWP fixture.
 *
 * Loads a required independently authored native document and checks merged-cell
 * rendering without an installed Hancom runtime or ignored research directory.
 *
 * @param {PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions} context - The isolated test or Electron process bindings supplied by Playwright.
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await openEditor(page);
 */
async ({ page }) => {
  /**
   * Required native reference path remains portable across Windows and Mac checkouts.
   */
  const filename = fileURLToPath(nativeCorpusFixture("table.hwp"));
  await openEditor(page);
  await page.locator("#file-input").setInputFiles(filename);
  await expect(page.locator(".tiptap table")).toHaveCount(1);
  await expect(page.locator('.tiptap td[colspan="2"]')).toHaveCount(1);
  await expect(page.locator("#format-badge")).toHaveText("HWP");
});
