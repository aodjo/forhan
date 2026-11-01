import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openParagraphPreview, verifyParagraphPreview } from "./helpers/paragraph-preview.ts";

/**
 * Read actual public portable output without inspecting private editor state.
 *
 * Native source and drawing-only preview attributes remain independently testable.
 * @async
 * @param {Page} page - Actual isolated browser app.
 * @returns {Promise<unknown>} Original serialized document model from a completed download.
 * @throws {Error} If real export or JSON decoding fails.
 * @example
 * const original=await previewDocumentSource(page);
 */
async function previewDocumentSource(page: Page): Promise<unknown> {
  /** One public export listener belongs only to this completed actual source download. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="forhan"]').click();
  /** Only the production writer's actual bytes supply the inspected document. */
  const download = await pending,
    payload = JSON.parse((await readFile((await download.path())!)).toString("utf8"));
  return payload.doc;
}

/**
 * Verify native preview geometry while cancellation preserves actual saved source.
 *
 * The local sample never enters the file, source document or undo history.
 * @async
 * @param {{page:Page}} context - Actual isolated application fixture.
 * @returns {Promise<void>} Resolves after real native drafts and portable source agree.
 * @throws {Error} If native physical behavior or retained source differs.
 * @example
 * // npx playwright test tests/paragraph-preview.spec.ts
 */
async function verifyPreviewCancellation({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("실제 문서는 미리 보기와 별도로 유지됩니다.");
  /** Real baseline output precedes all local formatting drafts. */
  const original = await previewDocumentSource(page);
  await verifyParagraphPreview(page);
  expect(await previewDocumentSource(page)).toEqual(original);
  expect(await page.locator(".tiptap [data-paragraph-preview-active]").count()).toBe(0);
  await openParagraphPreview(page);
  await page.locator('#native-format-form [name="marginLeft"]').fill("20");
  await page.locator('#native-format-form [name="line"]').fill("200");
  await page.locator('[data-modal-value="apply"]').click();
  expect(await previewDocumentSource(page)).not.toEqual(original);
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await previewDocumentSource(page)).toEqual(original);
}

test("native paragraph preview follows physical drafts without leaking into saved source or undo", verifyPreviewCancellation);
