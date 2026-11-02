import { test, expect, type PlaywrightTestArgs } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/**
 * Verify native-size entry and fractional increments on every editing surface.
 *
 * Quick controls, rebuilt ribbon fields and the character dialog share one
 * point-size policy. Invalid drafts stay editable without formatting the
 * selection, while dialog increments remain local until Apply is chosen.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after all controls and document state agree.
 * @throws {Error} If entry, cancellation, validation or a one-point step diverges.
 * @example
 * // Both keyboard and pointer steps change 13.25pt to 14.25pt.
 */
async function verifyFontSizeControls({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("글자 크기 호환성");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  /** Persistent point-size control used by the quick toolbar. */
  const quick = page.locator("#font-size");
  await quick.fill("1");
  await quick.press("Enter");
  await expect(page.locator('.tiptap [style*="font-size: 1pt"]')).toHaveText(
    "글자 크기 호환성",
  );
  await expect(page.locator(".tiptap")).toBeFocused();
  await quick.fill("3.25");
  await quick.press("Enter");
  await expect(page.locator(".tiptap")).toBeFocused();
  await quick.press("ArrowUp");
  await expect(quick).toHaveValue("4.25");
  await expect(page.locator(".tiptap")).toBeFocused();
  await page
    .locator('.native-font-size-combo [data-native-action="font-size-down"]')
    .click();
  await expect(quick).toHaveValue("3.25");
  await page.locator('button[data-native-tab="format"]').click();
  /** Recreated format ribbon field must retain the existing document selection. */
  const ribbon = page.locator(
    '.native-ribbon input[data-native-action="font-size"]',
  );
  await ribbon.fill("13.25");
  await ribbon.press("Enter");
  await expect(page.locator(".tiptap")).toBeFocused();
  await page
    .locator('.native-ribbon [data-native-action="font-size-up"]')
    .click();
  await expect(ribbon).toHaveValue("14.25");
  await expect(page.locator(".tiptap")).toBeFocused();
  await ribbon.press("ArrowDown");
  await expect(ribbon).toHaveValue("13.25");
  await expect(page.locator(".tiptap")).toBeFocused();
  await quick.fill("0.5");
  await quick.press("Enter");
  await expect(quick).toBeFocused();
  await expect(page.locator('.tiptap [style*="13.25pt"]')).toHaveText(
    "글자 크기 호환성",
  );
  await quick.press("Escape");
  await expect(quick).toHaveValue("13.25");
  await ribbon.fill("21474836.48");
  await ribbon.press("Enter");
  await expect(ribbon).toBeFocused();
  await ribbon.press("Escape");
  await expect(ribbon).toHaveValue("13.25");
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  /** Character-size draft is not committed by its spinner buttons. */
  const dialog = page.locator('#native-format-form [name="size"]');
  await page.locator('[data-font-size-step="1"]').click();
  await expect(dialog).toHaveValue("14.25");
  await dialog.press("ArrowDown");
  await expect(dialog).toHaveValue("13.25");
  await dialog.fill("0.5");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('.tiptap [style*="13.25pt"]')).toHaveText(
    "글자 크기 호환성",
  );
  await dialog.fill("200");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog")).toHaveCount(0);
  await expect(quick).toHaveValue("200.0");
  await expect(ribbon).toHaveValue("200.0");
  await expect(page.locator('.tiptap [style*="200pt"]')).toHaveText(
    "글자 크기 호환성",
  );
  for (/** Native format exported from the large-size GUI selection. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Native download begins only after the listener has been installed. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Completed file emitted by the public export command. */
    const download = await pending;
    /** Native bytes reopened independently of browser style inspection. */
    const bytes = await readFile((await download.path())!);
    /** Parsed native character definitions must retain the applied 200pt size. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(JSON.stringify(parsed.doc)).toContain("200pt");
  }
}
test(
  "font-size controls share native entry rules and fractional one-point actions",
  verifyFontSizeControls,
);

/**
 * Preserve imported subminimum character sizes through unrelated GUI edits.
 *
 * Zero-height and tiny text are legal native storage values even though new
 * interactive sizes start at one point. Changing color through the character
 * dialog must retain each imported height in both exported file formats.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after native reimport confirms every tiny size.
 * @throws {Error} If displaying or applying the dialog normalizes an imported size.
 * @example
 * // Imported 0pt text stays 0pt after changing its color to red.
 */
async function verifyImportedTinySizes({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  for (/** Stored character height below the interactive minimum, including native zero. */ const size of [
    0, 0.01, 0.5,
  ]) {
    /** Portable import bypasses interactive entry while preserving the native document model. */
    const payload = {
      application: "forhan",
      version: 1,
      title: "작은 글자",
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "작은 글자",
                marks: [
                  { type: "textStyle", attrs: { fontSize: `${size}pt` } },
                ],
              },
            ],
          },
        ],
      },
    };
    /** Distinct public import completion precedes selecting the current original tiny-font source. */
    const filename=`tiny-${size}.fhn`;
    await page.locator("#file-input").setInputFiles({
      name: filename,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
    await expect(page.locator('#toast')).toContainText(filename);
    await page.locator(".tiptap").press("ControlOrMeta+a");
    await page.locator('button[data-native-tab="format"]').click();
    await page
      .locator('.native-ribbon [data-native-action="char-format"]')
      .click();
    await expect(page.locator('#native-format-form [name="size"]')).toHaveValue(
      size === 0 ? "0.0" : String(size),
    );
    await page.locator('[data-color-target="#native-character-color"]').click();
    await page
      .locator('#native-color-palette [data-color-value="#ff0000"]')
      .click();
    await page.locator('[data-modal-value="apply"]').click();
    await expect(page.locator(".native-dialog")).toHaveCount(0);
    for (/** Native format whose serializer must retain a stored subminimum height. */ const format of [
      "hwp",
      "hwpx",
    ]) {
      /** Download listener registered before invoking the native export command. */
      const pending = page.waitForEvent("download");
      await page.locator("#export-menu-toggle").click();
      await page.locator(`[data-export="${format}"]`).click();
      /** Actual native file saved after an unrelated color edit. */
      const download = await pending;
      /** Reopened file bytes contain the final character definition. */
      const bytes = await readFile((await download.path())!);
      /** Independent native read result used to check height and color together. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(JSON.stringify(parsed.doc)).toContain(`"fontSize":"${size}pt"`);
      expect(JSON.stringify(parsed.doc).toLowerCase()).toContain("#ff0000");
    }
  }
}
test(
  "imported subminimum font sizes survive unrelated dialog edits and native export",
  verifyImportedTinySizes,
);
