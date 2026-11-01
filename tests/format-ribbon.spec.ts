import { test, expect, type PlaywrightTestArgs } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/**
 * Verify live character editing, native ribbon rebuilding and script-position history.
 *
 * Font controls operate on the existing document selection. Invalid and cancelled
 * drafts cannot overwrite it; hundredth-point sizes and emphasis remain visible
 * across tab changes and survive both native exporters.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser test bindings.
 * @returns {Promise<void>} Resolves after editing, state and native export assertions.
 * @throws {Error} If a rebuilt ribbon becomes stale or formatting changes on export.
 * @example
 * // 13.25pt stays 13.25pt when the native character dialog is opened and applied.
 */
async function verifyLiveFormatRibbon({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("선택한 한글 서식");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon select[data-native-action="font"]')
    .selectOption("Malgun Gothic");
  await page
    .locator('.native-ribbon input[data-native-action="font-size"]')
    .fill("13.25");
  await page
    .locator('.native-ribbon input[data-native-action="font-size"]')
    .press("Enter");
  await expect(page.locator('.tiptap [style*="13.25pt"]')).toContainText(
    "선택한 한글 서식",
  );
  await expect(page.locator("#font-size")).toHaveValue("13.25");
  await expect(page.locator("#font-family")).toHaveValue("Malgun Gothic");
  await page.locator('.native-ribbon [data-native-action="bold"]').click();
  await expect(
    page.locator('.native-ribbon [data-native-action="bold"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator('.native-ribbon [data-native-action="subscript"]').click();
  await expect(page.locator(".tiptap sub")).toHaveText("선택한 한글 서식");
  await page
    .locator('.native-ribbon [data-native-action="superscript"]')
    .click();
  await expect(page.locator(".tiptap sup")).toHaveText("선택한 한글 서식");
  await expect(page.locator(".tiptap sub")).toHaveCount(0);
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap sub")).toHaveText("선택한 한글 서식");
  await expect(page.locator(".tiptap sup")).toHaveCount(0);
  await page.locator('button[data-native-tab="edit"]').click();
  await page.locator('button[data-native-tab="format"]').click();
  await expect(
    page.locator('.native-ribbon select[data-native-action="font"]'),
  ).toHaveValue("Malgun Gothic");
  await expect(
    page.locator('.native-ribbon input[data-native-action="font-size"]'),
  ).toHaveValue("13.25");
  await expect(
    page.locator('.native-ribbon [data-native-action="subscript"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator('.native-ribbon input[data-native-action="font-size"]')
    .fill("0.5");
  await page
    .locator('.native-ribbon input[data-native-action="font-size"]')
    .press("Enter");
  await expect(page.locator('.tiptap [style*="13.25pt"]')).toContainText(
    "선택한 한글 서식",
  );
  await page
    .locator('.native-ribbon input[data-native-action="font-size"]')
    .press("Escape");
  await expect(
    page.locator('.native-ribbon input[data-native-action="font-size"]'),
  ).toHaveValue("13.25");
  await expect(page.locator(".tiptap")).toBeFocused();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await expect(page.locator('#native-format-form [name="size"]')).toHaveValue(
    "13.25",
  );
  await page.locator('#native-format-form [name="superscript"]').check();
  await expect(
    page.locator('#native-format-form [name="subscript"]'),
  ).not.toBeChecked();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap sup")).toHaveText("선택한 한글 서식");
  await expect(page.locator(".tiptap sub")).toHaveCount(0);
  for (/** Native format whose exported document must retain the live ribbon edits. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Download registered before activating the exporter. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Exported native document file. */
    const download = await pending;
    /** Complete native bytes reconstructed through the independent reader. */
    const bytes = await readFile((await download.path())!);
    /** Reopened document used to inspect actual character definitions. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(JSON.stringify(parsed.doc)).toContain("13.25pt");
    expect(JSON.stringify(parsed.doc)).toContain("Malgun Gothic");
    expect(JSON.stringify(parsed.doc)).toContain('"type":"superscript"');
  }
}
test(
  "native formatting ribbon applies live font fields and mutually exclusive scripts",
  verifyLiveFormatRibbon,
);

/**
 * Verify imported font units and custom paragraph spacing stay visible.
 *
 * An unlisted font is retained as literal option text. Pixel-based character
 * sizes display as points, and fixed spacing never masquerades as percentages.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after live controls reflect both imported paragraphs.
 * @throws {Error} If a selector becomes blank or reports the wrong physical unit.
 * @example
 * // A 16px run and 175% paragraph display 12.0pt and 175 percent.
 */
async function verifyImportedFormatFields({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Portable document with a font absent from application presets. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "가져온 서식",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { lineHeight: "175%" },
          content: [
            {
              type: "text",
              text: "사용자 글꼴의 문장",
              marks: [
                {
                  type: "textStyle",
                  attrs: { fontFamily: "문서 전용 글꼴", fontSize: "16px" },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "서식.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator("#font-size")).toHaveValue("12.0");
  await expect(page.locator("#line-height")).toHaveValue("175");
  await expect(page.locator(".native-line-spacing .native-unit")).toHaveText(
    "%",
  );
  await page.locator('button[data-native-tab="format"]').click();
  await expect(
    page.locator('.native-ribbon select[data-native-action="font"]'),
  ).toHaveValue("문서 전용 글꼴");
  await expect(
    page.locator('.native-ribbon input[data-native-action="font-size"]'),
  ).toHaveValue("12.0");
  payload.doc.content[0].attrs.lineHeight = "18.25pt";
  await page.locator("#file-input").setInputFiles({
    name: "고정 간격.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(page.locator("#line-height")).toHaveValue("18.3");
  await expect(page.locator(".native-line-spacing .native-unit")).toHaveText(
    "pt",
  );
  await expect(page.locator("#line-height")).toHaveAttribute('data-mode','fixed');
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(page.getByLabel("줄 간격 방식")).toHaveValue("FIXED");
  await expect(page.locator('#native-format-form [name="line"]')).toHaveValue(
    "18.3",
  );
  await expect(page.locator(".nd-line .nd-number > span")).toHaveText("pt");
  await page.locator('#native-format-form [name="marginTop"]').fill("5");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "24.3333px");
  await expect(page.locator("#line-height")).toHaveValue("18.3");
  for (/** Native format exported after changing an unrelated paragraph setting. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Download registered before the native exporter starts. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Completed native document download. */
    const download = await pending;
    /** Actual serialized bytes, reconstructed through the native reader. */
    const bytes = await readFile((await download.path())!);
    /** Parsed paragraph properties from the exported file. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(parsed.doc.content?.[0]?.attrs?.lineHeight).toBe("18.25pt");
  }
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await page.getByLabel("줄 간격 방식").selectOption("PERCENT");
  await expect(page.locator('#native-format-form [name="line"]')).toHaveValue(
    "152",
  );
  await expect(page.locator(".nd-line .nd-number > span")).toHaveText("%");
  await page.locator('#native-format-form [name="line"]').fill("175");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#line-height")).toHaveValue("175");
}
test(
  "imported custom fonts and line spacing retain their physical display units",
  verifyImportedFormatFields,
);
