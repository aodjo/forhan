import { test, expect, type PlaywrightTestArgs } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { characterMetrics } from "../src/character-metrics";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/** Native face table deliberately differs across all seven scripts. */
const FACES = [
  "함초롬바탕",
  "Arial",
  "바탕",
  "돋움",
  "굴림",
  "맑은 고딕",
  "Times New Roman",
];

/**
 * Edit independent script measurements and fonts through the real native dialog.
 *
 * Selector changes retain drafts, reject invalid values, and do not mutate the
 * document until Apply. Native downloads and HTML must preserve unused faces
 * and each independently edited script without merging the source tables.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser page bindings.
 * @returns {Promise<void>} Resolves after scoped entry, native save and undo checks.
 * @throws {Error} If switching, cancellation, serialization or font rendering loses scope.
 * @example
 * // Latin receives 20 percent tracking while Hangul receives minus ten percent.
 */
async function verifyLanguageDialog({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Source document exercises font-only language splitting without metric overrides. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "언어별 글자 모양",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "가A漢あΩ※",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontFamily: FACES[0],
                    fontSize: "10pt",
                    nativeCharacterFonts: FACES,
                    nativeCharacterLanguage: 0,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "language-fonts.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-family", "Arial");
  await page.locator(".tiptap").press("ControlOrMeta+Home");
  await page.locator(".tiptap").press("ArrowRight");
  await page.locator(".tiptap").pressSequentially("B");
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveText("BA");
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-family", "Arial");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await expect(page.locator('[name="language"] option')).toHaveCount(8);
  await page.locator('[name="language"]').selectOption("1");
  await expect(page.locator('[name="family"]')).toHaveValue("Arial");
  await page.locator('[name="tracking"]').fill("20");
  await page.locator('[name="relative-size"]').fill("90");
  await page.locator('[name="family"]').selectOption("Times New Roman");
  await expect(page.locator('[data-preview-language="1"]')).toHaveCSS(
    "font-family",
    '"Times New Roman"',
  );
  await expect(page.locator('[data-preview-language="1"]')).toHaveCSS(
    "font-size",
    "12px",
  );
  await expect(page.locator('[data-preview-language="0"]')).toHaveCSS(
    "font-family",
    "함초롬바탕",
  );
  await expect(page.locator('[data-preview-language="0"]')).toHaveCSS(
    "font-size",
    "13.3333px",
  );
  await page.locator('[name="language"]').selectOption("0");
  await expect(page.locator('[name="tracking"]')).toHaveValue("0");
  await page.locator('[name="tracking"]').fill("-10");
  await page.locator('[name="family"]').selectOption("바탕");
  await page.locator('[name="language"]').selectOption("1");
  await expect(page.locator('[name="tracking"]')).toHaveValue("20");
  await expect(page.locator('[name="relative-size"]')).toHaveValue("90");
  await page.locator('[name="tracking"]').fill("51");
  await page.locator('[name="language"]').selectOption("0");
  await expect(page.locator('[name="language"]')).toHaveValue("1");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-family", "Arial");
  await expect(
    page.locator(".tiptap [data-forhan-character-metrics]"),
  ).toHaveCount(0);
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="language"]').selectOption("1");
  await page.locator('[name="tracking"]').fill("20");
  await page.locator('[name="relative-size"]').fill("90");
  await page.locator('[name="family"]').selectOption("Times New Roman");
  await page.locator('[name="language"]').selectOption("0");
  await page.locator('[name="tracking"]').fill("-10");
  await page.locator('[name="family"]').selectOption("바탕");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(
    page.locator('.tiptap [data-forhan-character-language="0"]'),
  ).toHaveCSS("font-family", "바탕");
  await expect(
    page.locator('.tiptap [data-forhan-character-language="0"]'),
  ).toHaveCSS("letter-spacing", "-1.33333px");
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-family", '"Times New Roman"');
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-size", "12px");
  for (
    /** Native public download must retain every language, including the unused user face. */
  const format of ["hwp", "hwpx"]) {
    /** Listener precedes actual toolbar serialization. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Exported native document bytes. */
    const bytes = await readFile((await (await pending).path())!);
    /** Independent parser verifies native storage rather than document CSS. */
    const result = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    for (
      /** Script run whose native arrays and full face table must remain independent. */
    const node of result.doc.content![0].content!) {
      /** Full native text-style attributes. */
      const attrs = node.marks![0].attrs!;
      expect(attrs.nativeCharacterFonts).toEqual([
        "바탕",
        "Times New Roman",
        ...FACES.slice(2),
      ]);
      expect(characterMetrics(attrs.nativeCharacterMetrics).spacing).toEqual([
        -10, 20, 0, 0, 0, 0, 0,
      ]);
      expect(
        characterMetrics(attrs.nativeCharacterMetrics).relativeSize,
      ).toEqual([100, 90, 100, 100, 100, 100, 100]);
    }
  }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(
    page.locator(".tiptap [data-forhan-character-metrics]"),
  ).toHaveCount(0);
  await page.locator(".tiptap").press("ControlOrMeta+Shift+z");
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-size", "12px");
  /** HTML metadata must preserve all faces after reimport and a subsequent representative font edit. */
  const htmlPending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="html"]').click();
  /** Exact standalone HTML export. */
  const html = await readFile((await (await htmlPending).path())!);
  await page.locator("#file-input").setInputFiles({
    name: "language-fonts.html",
    mimeType: "text/html",
    buffer: html,
  });
  await expect(
    page.locator('.tiptap [data-forhan-character-language="1"]'),
  ).toHaveCSS("font-family", '"Times New Roman"');
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#font-family").selectOption("Batang");
  await expect(
    page.locator(".tiptap [data-forhan-character-fonts]"),
  ).toHaveCount(0);
  /** Actual source saving excludes inaccessible contour and width drawing text. */
  const savedPending=page.waitForEvent('download');
  await page.locator('#export-menu-toggle').click();
  await page.locator('[data-export="forhan"]').click();
  /** Serialized source remains the authority after changing representative fonts. */
  const saved=JSON.parse((await readFile((await (await savedPending).path())!)).toString('utf8'));
  let text='';
  for(/** Rich source can retain several independent script runs without duplicating authored text. */const run of saved.doc.content[0].content)text+=run.text||'';
  expect(text).toBe('가BA漢あΩ※');
}
test(
  "native language selector retains scoped fonts, percentages, invalid drafts and exports",
  verifyLanguageDialog,
);

/**
 * Preserve imported language-specific values outside ordinary entry ranges.
 *
 * Switching from a normal Hangul slot to native Latin zero-size/negative-offset
 * values updates HTML input bounds before an unrelated font edit is applied.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser page bindings.
 * @returns {Promise<void>} Resolves after native edge values survive the scoped edit.
 * @throws {Error} If language switching incorrectly invalidates unchanged imported values.
 * @example
 * // An imported zero relative size remains zero after changing only its language font.
 */
async function verifyImportedLanguageBounds({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Native storage accepts values outside the ordinary interactive entry range. */
  const metrics = {
    ...characterMetrics(null),
    relativeSize: [100, 0, 100, 100, 100, 100, 100],
    offset: [0, -128, 0, 0, 0, 0, 0],
  };
  /** Both source languages retain the same complete native metric table. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "언어별 원본 범위",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "가A",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontFamily: "Arial",
                    fontSize: "10pt",
                    nativeCharacterMetrics: metrics,
                    nativeCharacterLanguage: 0,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "language-bounds.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="language"]').selectOption("1");
  await expect(page.locator('[name="relative-size"]')).toHaveValue("0");
  await expect(page.locator('[name="relative-size"]')).toHaveAttribute(
    "min",
    "0",
  );
  await expect(page.locator('[name="position"]')).toHaveValue("-128");
  await expect(page.locator('[name="position"]')).toHaveAttribute(
    "min",
    "-128",
  );
  await page.locator('[name="family"]').selectOption("Times New Roman");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-character")).toHaveCount(0);
  /** Native export checks the invisible zero-size run's retained state independently of CSS visibility. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="hwp"]').click();
  /** Actual exported native payload. */
  const result = readHwp(await readFile((await (await pending).path())!));
  expect(
    characterMetrics(
      result.doc.content![0].content![0].marks![0].attrs!
        .nativeCharacterMetrics,
    ),
  ).toEqual(metrics);
  expect(
    result.doc.content![0].content![0].marks![0].attrs!.nativeCharacterFonts,
  ).toEqual([
    "Arial",
    "Times New Roman",
    "Arial",
    "Arial",
    "Arial",
    "Arial",
    "Arial",
  ]);
}
test(
  "language switches preserve unchanged imported native entry-bound exceptions",
  verifyImportedLanguageBounds,
);
