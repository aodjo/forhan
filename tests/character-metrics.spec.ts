import {DOCUMENT_START_KEY} from './helpers/native-keyboard.ts';
import { test, expect, type PlaywrightTestArgs } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/**
 * Verify editable native percentages, physical preview and native/HTML exports.
 *
 * Percentages use the base size even when relative size changes displayed
 * glyphs. Validation keeps invalid drafts open, cancellation is lossless, and
 * HTML reimport must not mistake the displayed size for a new native base.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser test bindings.
 * @returns {Promise<void>} Resolves after UI, physical CSS and native exports agree.
 * @throws {Error} If validation, cancellation or a serialization changes the native measurements.
 * @example
 * // A 10pt base with 80 percent relative size and 20 percent tracking displays 8pt with 2pt gaps.
 */
async function verifyCharacterMetricEditing({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("글자 간격과 상대 크기");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="tracking"]').fill("51");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator('[name="tracking"]').fill("20");
  await page.locator('[name="relative-size"]').fill("80");
  /** Baseline sample remains anchored near the preview bottom before moving it. */
  const beforeOffset = await page.locator(".nd-character-sample").boundingBox();
  /** Native preview frame supplies an independent physical anchor for the sample. */
  const previewBounds = await page
    .locator(".nd-character-preview")
    .boundingBox();
  expect(beforeOffset!.y).toBeGreaterThan(
    previewBounds!.y + previewBounds!.height / 2,
  );
  await page.locator('[name="position"]').fill("30");
  /** A positive thirty-percent offset of 10pt moves down exactly 3pt, or 4 CSS pixels. */
  const afterOffset = await page.locator(".nd-character-sample").boundingBox();
  expect(afterOffset!.y - beforeOffset!.y).toBeCloseTo(4, 5);
  await expect(page.locator(".nd-character-sample")).toHaveCSS(
    "font-size",
    "10.6667px",
  );
  await expect(page.locator(".nd-character-sample")).toHaveCSS(
    "letter-spacing",
    "2.66667px",
  );
  await expect(page.locator(".nd-character-sample")).toHaveCSS("top", "4px");
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(
    page.locator(".tiptap [data-forhan-character-metrics]"),
  ).toHaveCount(0);
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="tracking"]').fill("20");
  await page.locator('[name="relative-size"]').fill("80");
  await page.locator('[name="position"]').fill("30");
  await page.locator('[data-modal-value="apply"]').click();
  /** Actual document span retains its base size separately from displayed glyph sizing. */
  const measured = page.locator(".tiptap [data-forhan-character-metrics]");
  await expect(measured).toHaveCSS("font-size", "10.6667px");
  await expect(measured).toHaveCSS("letter-spacing", "2.66667px");
  await expect(measured).toHaveCSS("top", "4px");
  await expect(page.locator("#font-size")).toHaveValue("10.0");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(
    page.locator(".tiptap [data-forhan-character-metrics]"),
  ).toHaveCount(0);
  await page.locator(".tiptap").press("ControlOrMeta+Shift+z");
  await expect(measured).toHaveCSS("letter-spacing", "2.66667px");
  for (/** Native and ordinary HTML exports must retain both base size and measurement metadata. */ const format of [
    "hwp",
    "hwpx",
    "html",
  ]) {
    /** Listener registered before the corresponding public file export. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Exported document emitted by the public toolbar command. */
    const download = await pending;
    /** Serialized file bytes are read independently of browser attributes. */
    const bytes = await readFile((await download.path())!);
    if (format === "html") {
      await page.locator("#file-input").setInputFiles({
        name: "character-metrics.html",
        mimeType: "text/html",
        buffer: bytes,
      });
      await expect(measured).toHaveCSS("font-size", "10.6667px");
      await expect(measured).toHaveCSS("letter-spacing", "2.66667px");
      await expect(page.locator("#font-size")).toHaveValue("10.0");
    } else {
      /** Actual native reader result exposes base height and all seven percentage values. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      /** Native character attributes attached to the exported text. */
      const attrs = parsed.doc.content![0].content![0].marks![0].attrs!;
      expect(attrs.fontSize).toBe("10pt");
      expect(attrs.nativeCharacterMetrics.spacing).toEqual([
        20, 20, 20, 20, 20, 20, 20,
      ]);
      expect(attrs.nativeCharacterMetrics.relativeSize).toEqual([
        80, 80, 80, 80, 80, 80, 80,
      ]);
      expect(attrs.nativeCharacterMetrics.offset).toEqual([
        30, 30, 30, 30, 30, 30, 30,
      ]);
    }
  }
}
test(
  "native character percentages edit, preview, undo and retain their base through native and HTML export",
  verifyCharacterMetricEditing,
);

/**
 * Retain distinct native arrays and mixed formatting during representative edits.
 *
 * Untouched controls must not flatten a selected phrase to its first character's
 * font, color, size or emphasis. Script-specific measurement rendering also
 * follows inserted Latin characters inside an imported Hangul text run.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after independent native exports confirm all retained arrays.
 * @throws {Error} If a representative edit resets an untouched measurement or style.
 * @example
 * // Changing only tracking preserves the second run's 14pt bold blue formatting.
 */
async function verifyMixedCharacterMetrics({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Distinct language arrays make unintended default replacement observable. */
  const metrics = {
    ratio: [80, 90, 110, 120, 130, 140, 150],
    spacing: [-20, 15, -5, 10, 0, 25, -35],
    relativeSize: [80, 110, 120, 90, 100, 130, 140],
    offset: [-30, 20, 0, 10, -5, 15, -20],
  };
  /** Mixed styles use different base heights, colors, emphasis and relative-size arrays. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "언어별 서식",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "가나",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontSize: "10pt",
                    nativeCharacterMetrics: metrics,
                    nativeCharacterLanguage: 0,
                  },
                },
              ],
            },
            {
              type: "text",
              text: "AB",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontSize: "14pt",
                    color: "#0000ff",
                    nativeCharacterMetrics: {
                      ...metrics,
                      relativeSize: [70, 90, 110, 80, 100, 120, 130],
                    },
                    nativeCharacterLanguage: 1,
                  },
                },
                { type: "bold" },
              ],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "languages.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator(".tiptap").press(DOCUMENT_START_KEY);
  await page.locator(".tiptap").press("ArrowRight");
  await page.locator(".tiptap").pressSequentially("C");
  await expect(
    page
      .locator('.tiptap [data-forhan-character-language="1"]')
      .filter({ hasText: "C" }),
  ).toHaveCSS("font-size", "14.6667px");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="tracking"]').fill("-10");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap strong")).toHaveText("AB");
  await expect(
    page.locator(".tiptap strong span, .tiptap span:has(strong)").first(),
  ).toBeVisible();
  for (/** Native serializer must preserve each run's untouched base height and native arrays. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Download listener installed before the native save command. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Actual downloaded document containing the edited mixed phrase. */
    const download = await pending;
    /** Native bytes are parsed independently of browser style serialization. */
    const bytes = await readFile((await download.path())!);
    /** Native reader exposes separate runs for script-specific measurements. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    /** Source-order native text fragments carry the actual serialized character definitions. */
    const runs = parsed.doc.content![0].content!;
    expect(runs[0].marks![0].attrs!.fontSize).toBe("10pt");
    expect(runs[0].marks![0].attrs!.nativeCharacterMetrics.ratio).toEqual(
      metrics.ratio,
    );
    expect(runs[0].marks![0].attrs!.nativeCharacterMetrics.spacing).toEqual([
      -10, -10, -10, -10, -10, -10, -10,
    ]);
    expect(JSON.stringify(parsed.doc)).toContain("14pt");
    expect(JSON.stringify(parsed.doc).toLowerCase()).toContain("#0000ff");
    expect(JSON.stringify(parsed.doc)).toContain(
      '"relativeSize":[70,90,110,80,100,120,130]',
    );
    expect(JSON.stringify(parsed.doc)).toContain('"type":"bold"');
  }
}
test(
  "character percentage edits preserve mixed formatting and script-specific arrays",
  verifyMixedCharacterMetrics,
);

/**
 * Keep inherited heading bases when changing native character percentages.
 *
 * A heading without an explicit font-size mark inherits its 24pt style base.
 * Applying relative size must retain that context through HTML and native
 * export instead of silently assigning the ordinary 10pt body fallback.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after inherited typography and native base assertions.
 * @throws {Error} If character metrics replace the inherited heading base.
 * @example
 * // 80 percent of an inherited 24pt heading displays 19.2pt, with 4.8pt tracking at 20 percent.
 */
async function verifyInheritedCharacterBase({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Unformatted heading has no character-level base size to override its style. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "상대 크기 제목",
    doc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "상대 크기 제목" }],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "heading.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="tracking"]').fill("20");
  await page.locator('[name="relative-size"]').fill("80");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap h1 span")).toHaveCSS(
    "font-size",
    "25.6px",
  );
  await expect(page.locator(".tiptap h1 span")).toHaveCSS(
    "letter-spacing",
    "6.4px",
  );
  await expect(page.locator("#font-size")).toHaveValue("24.0");
  for (/** Native base size and standard HTML inheritance must agree after export. */ const format of [
    "hwp",
    "hwpx",
    "html",
  ]) {
    /** Download listener precedes the public toolbar export command. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Serialized document contains the actual exported native or HTML styling. */
    const download = await pending;
    /** Exported bytes are checked independently of the editor's current marks. */
    const bytes = await readFile((await download.path())!);
    if (format === "html") {
      await page.locator("#file-input").setInputFiles({
        name: "heading.html",
        mimeType: "text/html",
        buffer: bytes,
      });
      await page.locator(".tiptap").press(DOCUMENT_START_KEY);
      await expect(page.locator(".tiptap h1 span")).toHaveCSS(
        "font-size",
        "25.6px",
      );
      await expect(page.locator(".tiptap h1 span")).toHaveCSS(
        "letter-spacing",
        "6.4px",
      );
      await expect(page.locator("#font-size")).toHaveValue("24.0");
    } else {
      /** Independent native reader result exposes the original heading base. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(JSON.stringify(parsed.doc)).toContain('"fontSize":"24pt"');
      expect(JSON.stringify(parsed.doc)).toContain(
        '"relativeSize":[80,80,80,80,80,80,80]',
      );
    }
  }
}
test(
  "native character metrics preserve inherited heading bases through HTML and native export",
  verifyInheritedCharacterBase,
);
