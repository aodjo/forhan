import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/**
 * Exercise genuine quick-field drafts, native stepping and one-step undo.
 *
 * Preset navigation must not mutate a paragraph until committed. Invalid input,
 * IME Enter and Escape preserve the real document; actual exports prove zero
 * spacing remains native data rather than just an input's displayed label.
 * @async
 * @param {object} context - Playwright's isolated page fixture.
 * @returns {Promise<void>} Resolves when actual editor and native output agree.
 * @throws {Error} If drafts leak edits, mode stepping diverges or zero export is lost.
 * @example
 * // Typing 163 and pressing Up produces 168%, with one undoable change.
 */
async function verifyQuickSpacing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("직접 입력과 목록의 줄 간격 검증");
  /** Actual native-style numeric field replaces the former fixed select. */
  const field = page.locator("#line-height");
  await page.keyboard.press("Alt+7");
  await expect(field).toBeFocused();
  await field.fill("163");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "21.3333px");
  await field.press("Enter");
  await expect(field).toHaveValue("163");
  await page
    .getByRole("button", { name: "줄 간격 늘리기", exact: true })
    .click();
  await expect(field).toHaveValue("168");
  await page
    .getByRole("button", { name: "줄 간격 줄이기", exact: true })
    .click();
  await expect(field).toHaveValue("163");
  await field.focus();
  await field.press("ArrowUp");
  await field.press("ArrowUp");
  await expect(field).toHaveValue("173");
  await expect(field).toBeFocused();
  await field.press("ArrowDown");
  await expect(field).toHaveValue("168");
  await field.fill("175.5");
  await field.press("Enter");
  await expect(field).toHaveValue("175");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "23.3333px");
  await field.fill("501");
  await field.press("Enter");
  await expect(field).toHaveValue("501");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "23.3333px");
  await field.press("Escape");
  await expect(field).toHaveValue("175");
  await page.getByRole("button", { name: "줄 간격 목록", exact: true }).click();
  await expect(
    page.locator('#native-line-spacing-list [role="option"]'),
  ).toHaveText(["100%", "130%", "160%", "180%", "200%", "300%"]);
  await field.press("End");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "23.3333px");
  await field.press("Escape");
  await expect(field).toHaveValue("175");
  await field.fill("300");
  await field.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "23.3333px");
  await field.press("Escape");
  await field.fill("0");
  await field.press("Enter");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "0px");
  for (/** Exported bytes must retain native zero line spacing in both supported formats. */ const format of [
    "hwp",
    "hwpx",
  ] as const) {
    /** Actual completed browser download from the ordinary export control. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Real document bytes are inspected independently of the rendered input. */
    const download = await pending,
      bytes = await readFile((await download.path())!);
    /** Native reader sees an explicit proportional zero, never a default fallback. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(parsed.doc.content![0].attrs!.lineHeight).toBe(
      format === "hwp" ? "0%" : "0",
    );
  }
}

/**
 * Preserve fixed source precision and apply mode-specific presets to mixed blocks.
 *
 * The idle bar rounds to one decimal like the native app, while untouched
 * source survives blur and unrelated paragraph edits. A selected heading/body
 * range receives one explicit quick-field change across both block types.
 * @async
 * @param {object} context - Playwright's isolated page fixture.
 * @returns {Promise<void>} Resolves after precision, fixed stepping and mixed-range checks.
 * @throws {Error} If rounded display overwrites source precision or a block type is skipped.
 * @example
 * // The same selection receives 19pt from an original 18.25pt native paragraph.
 */
async function verifyFixedSpacing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await page.locator("#file-input").setInputFiles({
    name: "고정 줄 간격.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        title: "고정 간격",
        doc: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2, lineHeight: "18.25pt" },
              content: [{ type: "text", text: "고정 간격 제목" }],
            },
            {
              type: "paragraph",
              attrs: { lineHeight: "18.25pt" },
              content: [{ type: "text", text: "정밀한 본문 간격" }],
            },
          ],
        },
      }),
    ),
  });
  /** Native quick bar displays one decimal without normalizing the imported source. */
  const field = page.locator("#line-height");
  await expect(field).toHaveValue("18.3");
  await expect(page.locator(".native-line-spacing .native-unit")).toHaveText(
    "pt",
  );
  await field.focus();
  await field.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("#native-line-spacing-list")).toBeVisible();
  await field.press("Escape");
  await expect(page.locator(".tiptap h2")).toHaveCSS(
    "line-height",
    "24.3333px",
  );
  await page.getByRole("button", { name: "줄 간격 목록", exact: true }).click();
  await expect(
    page.locator('#native-line-spacing-list [role="option"]'),
  ).toHaveText([
    "3pt",
    "6pt",
    "10pt",
    "13pt",
    "16pt",
    "18pt",
    "20pt",
    "30pt",
    "40pt",
    "50pt",
  ]);
  await field.press("Escape");
  await page.locator(".tiptap").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page
    .getByRole("button", { name: "줄 간격 늘리기", exact: true })
    .click();
  await expect(page.locator(".tiptap h2")).toHaveCSS(
    "line-height",
    "25.3333px",
  );
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "25.3333px");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".tiptap h2")).toHaveCSS(
    "line-height",
    "24.3333px",
  );
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "24.3333px");
  await field.fill("0");
  await field.press("Enter");
  await expect(page.locator(".tiptap h2")).toHaveCSS("line-height", "0px");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "0px");
}
test(
  "native quick spacing edits, cancels, navigates presets and exports explicit zero",
  verifyQuickSpacing,
);
test(
  "fixed quick spacing retains precision, steps natively and formats mixed selected blocks",
  verifyFixedSpacing,
);

/**
 * Keep a new toolbar draft focused after the paragraph dialog has completed.
 *
 * Deferred document focus previously ran after a user started another field.
 * Holding animation callbacks until that interaction exposes the stale focus
 * handoff deterministically, without slowing typing or waiting fixed delays.
 * @async
 * @param {object} context - Owned Playwright browser bindings.
 * @returns {Promise<void>} Resolves after late animation callbacks preserve the new draft.
 * @throws {Error} If a completed dialog steals focus or discards subsequent numeric input.
 * @example
 * // Applying paragraph settings then typing 163 keeps that field active.
 */
async function verifyDialogFocusHandoff({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("대화상자 뒤의 빠른 입력");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await page.evaluate(
    /**
     * Hold application animation callbacks across the completed dialog handoff.
     *
     * Browser painting remains active; only the application scheduling API is
     * temporarily intercepted inside this disposable test page.
     * @returns {void} Saves the original scheduler and pending callbacks.
     * @example
     * // A deferred editor focus cannot run until after the next field is edited.
     */
    () => {
      /** Page-owned scheduler state cannot escape this isolated regression. */
      const state = window as unknown as {
        forhanFrames: {
          original: typeof requestAnimationFrame;
          pending: FrameRequestCallback[];
        };
      };
      state.forhanFrames = {
        original: window.requestAnimationFrame,
        pending: [],
      };
      window.requestAnimationFrame =
        /**
         * Retain an application frame until the next toolbar interaction finishes.
         *
         * The production callback itself stays unchanged for later execution.
         * @param {FrameRequestCallback} callback - Actual requested application frame.
         * @returns {number} Stable owned pending callback identifier.
         * @example
         * // A delayed focus callback remains executable after numeric typing.
         */
        (callback) => state.forhanFrames.pending.push(callback);
    },
  );
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-paragraph")).toHaveCount(0);
  /** Actual user draft begins after the dialog has already completed. */
  const field = page.locator("#line-height");
  await field.fill("163");
  await page.evaluate(
    /**
     * Run previously requested frames after restoring the ordinary scheduler.
     *
     * Late production callbacks must respect the user's newer focused control.
     * @returns {void} Flushes only this page's saved application callbacks.
     * @example
     * // No sleeps are needed to expose a stale deferred editor focus.
     */
    () => {
      /** Saved scheduling state belongs exclusively to this disposable page. */
      const state = window as unknown as {
        forhanFrames: {
          original: typeof requestAnimationFrame;
          pending: FrameRequestCallback[];
        };
      };
      window.requestAnimationFrame = state.forhanFrames.original;
      for (/** Every actual saved callback runs with a current browser timestamp. */ const callback of state
        .forhanFrames.pending)
        callback(performance.now());
    },
  );
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("163");
  await field.press("Enter");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "21.7333px");
}
test(
  "completed paragraph dialogs cannot steal focus from a newer quick-field draft",
  verifyDialogFocusHandoff,
);

/**
 * Keep transient numeric edits scoped to the document that created them.
 *
 * Replacing a clean file while a draft/menu is active must cancel that state
 * even when both files use the same line height. Rejected input files never
 * cancel a valid existing document's pending draft.
 * @async
 * @param {object} context - Isolated browser regression fixture.
 * @returns {Promise<void>} Resolves after replacement and failed-import isolation checks.
 * @throws {Error} If an old draft reaches the replacement document or invalid import clears it.
 * @example
 * // Opening another 160% file cannot inherit a pending 175% edit.
 */
async function verifySpacingDocumentScope({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Both clean files deliberately share the same original paragraph spacing. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "첫 문서",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { lineHeight: "1.6" },
          content: [{ type: "text", text: "첫 문서의 줄 간격" }],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "첫 문서.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  /** Pending draft is not a saved document mutation. */
  const field = page.locator("#line-height");
  await field.fill("175");
  await page.getByRole("button", { name: "줄 간격 목록", exact: true }).click();
  payload.title = "다음 문서";
  payload.doc.content[0].content[0].text = "새 문서의 원래 간격";
  await page.locator("#file-input").setInputFiles({
    name: "다음 문서.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator(".tiptap")).toHaveText("새 문서의 원래 간격");
  await expect(field).toHaveValue("160");
  await expect(page.locator("#native-line-spacing-list")).toBeHidden();
  await field.press("Enter");
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "21.3333px");
  await field.fill("175");
  await page.locator("#file-input").setInputFiles({
    name: "잘못된.forhan",
    mimeType: "application/json",
    buffer: Buffer.from('{"application":"invalid"}'),
  });
  await expect(field).toHaveValue("175");
  await expect(page.locator(".tiptap")).toHaveText("새 문서의 원래 간격");
  await field.press("Escape");
}
test(
  "pending native spacing drafts cannot cross document replacements",
  verifySpacingDocumentScope,
);
