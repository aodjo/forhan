import {
  WORD_BREAK_SOURCE,
  actualWordBreakLines,
} from "./helpers/paragraph-word-break.ts";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Open real mixed-language source through the public portable file input.
 *
 * Physical paper width, resolved font faces and margins match the installed-native sample;
 * no test-only editor hook or replacement renderer is used.
 * @async
 * @param {Page} page - Actual owning browser application.
 * @param {boolean} [mixed=false] - Whether to include a differently configured heading.
 * @returns {Promise<void>} Resolves when original source text is visible.
 * @throws {Error} If the actual public source file fails to load.
 * @example
 * await openWordBreakSource(page);
 */
async function openWordBreakSource(page: Page, mixed = false): Promise<void> {
  /** Original hard line boundaries remain source nodes rather than generated text. */
  const content: Record<string, unknown>[] = [];
  for (/** Every reference hard line shares the original 16pt Arial character shape. */ const [
    index,
    text,
  ] of WORD_BREAK_SOURCE.entries()) {
    if (index) content.push({ type: "hardBreak" });
    content.push({
      type: "text",
      text,
      marks: [
        { type: "textStyle", attrs: { fontFamily: index===0?"맑은 고딕":"Arial", fontSize: "16pt" } },
      ],
    });
  }
  /** Public portable source retains independent modes on different real block types. */
  const blocks = [
    {
      type: "paragraph",
      attrs: {
        marginRight: "200pt",
        textAlign: "left",
        nativeBreakLatinWord: 0,
        nativeBreakNonLatinWord: 1,
      },
      content,
    },
  ];
  if (mixed)
    blocks.unshift({
      type: "heading",
      attrs: {
        marginRight: "200pt",
        textAlign: "left",
        nativeBreakLatinWord: 2,
        nativeBreakNonLatinWord: 0,
      },
      content: [
        {
          type: "text",
          text: "Heading original",
          marks: [
            {
              type: "textStyle",
              attrs: { fontFamily: "Arial", fontSize: "16pt" },
            },
          ],
        },
      ],
    });
  await page.goto("/");
  await page.locator("#file-input").setInputFiles({
    name: "줄 나눔.fhn",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        doc: { type: "doc", content: blocks },
      }),
    ),
  });
  await expect(page.locator(".tiptap p")).toContainText(WORD_BREAK_SOURCE[0]);
  await page.locator(".tiptap p").click();
}

/**
 * Open the actual paragraph modal through its visible native ribbon command.
 *
 * The real selection remains owned by the editor while the native form opens.
 * @async
 * @param {Page} page - Actual owning browser application.
 * @returns {Promise<void>} Resolves after enabled native breaking controls appear.
 * @throws {Error} If the native command or enabled controls are unavailable.
 * @example
 * await openWordBreakDialog(page);
 */
async function openWordBreakDialog(page: Page): Promise<void> {
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(
    page.getByRole("combobox", { name: "한글 단위", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("combobox", { name: "영어 단위", exact: true }),
  ).toBeEnabled();
}

/**
 * Read an actual completed application export without substituting a serializer.
 *
 * Public menu actions determine the emitted source format and owned download.
 * @async
 * @param {Page} page - Actual browser application.
 * @param {string} format - Public native, portable or HTML menu identifier.
 * @returns {Promise<Buffer>} Actual completed downloaded file bytes.
 * @throws {Error} If exporting or reading the completed download fails.
 * @example
 * const bytes=await wordBreakExport(page,'hwpx');
 */
async function wordBreakExport(page: Page, format: string): Promise<Buffer> {
  /** The completion listener belongs to this exact public export action. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** File contents come from the actual emitted application download. */
  const download = await pending;
  return readFile((await download.path())!);
}

/**
 * Exercise all six native word-breaking combinations through the real dialog.
 *
 * Actual rendered lines must change independently for Korean and Latin text;
 * actual HWPX/HWP/FHN downloads retain both source fields and original Unicode.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after all six UI modes and actual outputs agree.
 * @throws {Error} If physical layout, source text or saved native choices disagree.
 * @example
 * // Latin character mode may split counterrevolutionary while Korean words stay together.
 */
async function verifyWordBreakDialog({ page }: { page: Page }): Promise<void> {
  test.setTimeout(90000);
  await openWordBreakSource(page);
  /** Real source measurements distinguish native character, word and hyphen modes. */
  const observed: Array<{ latin: number; nonLatin: number; lines: string[] }> =
    [];
  for (/** Every independently represented native combination is applied using enabled controls. */ const nonLatin of [
    0, 1,
  ])
    for (/** Actual numeric native modes are independent of the displayed option order. */ const latin of [
      0, 1, 2,
    ]) {
      await openWordBreakDialog(page);
      await page
        .getByRole("combobox", { name: "한글 단위", exact: true })
        .selectOption(String(nonLatin));
      await page
        .getByRole("combobox", { name: "영어 단위", exact: true })
        .selectOption(String(latin));
      await page.locator('[data-modal-value="apply"]').click();
      await expect(page.locator(".tiptap p")).toHaveAttribute(
        "data-forhan-break-latin-word",
        String(latin),
      );
      await expect(page.locator(".tiptap p")).toHaveAttribute(
        "data-forhan-break-non-latin-word",
        String(nonLatin),
      );
      /** Real DOM ranges prove the mode affects actual glyph wrapping. */
      const lines = await page.evaluate(actualWordBreakLines, ".tiptap p");
      observed.push({ latin, nonLatin, lines });
      expect(lines.slice(0, 2)).toEqual(
        nonLatin === 0
          ? ["앞말 가나다라마바", "사자차카타파하 뒷말"]
          : ["앞말 가나다라마바 사자차카타", "파하 뒷말"],
      );
      for (/** Independent public writers must retain both fields and the complete untouched original source. */ const format of [
        "hwpx",
        "hwp",
        "forhan",
      ]) {
        /** Native readers inspect actual file bytes after the completed public menu download. */
        const bytes = await wordBreakExport(page, format),
          parsed =
            format === "hwp"
              ? readHwp(bytes)
              : format === "hwpx"
                ? await readHwpx(bytes)
                : JSON.parse(bytes.toString("utf8"));
        expect(parsed.doc.content[0].attrs.nativeBreakLatinWord).toBe(latin);
        expect(parsed.doc.content[0].attrs.nativeBreakNonLatinWord).toBe(
          nonLatin,
        );
      }
    }
  expect(observed[0].lines).not.toEqual(observed[1].lines);
  expect(observed[0].lines).not.toEqual(observed[2].lines);
  expect(observed[1].lines).not.toEqual(observed[2].lines);
  await test
    .info()
    .attach("actual-word-break-lines", {
      body: Buffer.from(JSON.stringify(observed, null, 2)),
      contentType: "application/json",
    });
}
test(
  "six actual paragraph word-breaking modes change physical wrapping and survive HWPX HWP FHN exports",
  verifyWordBreakDialog,
);

/**
 * Preserve mixed independent paragraph modes and one-step undo across block types.
 *
 * Opening/applying an unchanged mixed selector cannot flatten original modes.
 * An explicit Latin change affects both blocks while Korean modes stay mixed.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after original mixed values and undo are verified.
 * @throws {Error} If an untouched field, heading or undo scope is changed incorrectly.
 * @example
 * // Choosing Latin hyphenation leaves distinct original Korean modes unchanged.
 */
async function verifyMixedWordBreakSelection({
  page,
}: {
  page: Page;
}): Promise<void> {
  await openWordBreakSource(page, true);
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await openWordBreakDialog(page);
  await expect(
    page.getByRole("combobox", { name: "한글 단위", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "영어 단위", exact: true }),
  ).toHaveValue("");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap h1")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "2",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "0",
  );
  await openWordBreakDialog(page);
  await page
    .getByRole("combobox", { name: "영어 단위", exact: true })
    .selectOption("1");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap h1")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "1",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "1",
  );
  await expect(page.locator(".tiptap h1")).toHaveAttribute(
    "data-forhan-break-non-latin-word",
    "0",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-non-latin-word",
    "1",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".tiptap h1")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "2",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "0",
  );
}
test(
  "mixed paragraph and heading word-breaking fields remain independent and share one undo step",
  verifyMixedWordBreakSelection,
);

/**
 * Preserve actual static Latin wrapping through public HTML export and reimport.
 *
 * Output contains transparent source wrappers without inserting hyphens into
 * original text. External CSS edits take precedence over stale source markers.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after static output, reimport and external CSS checks.
 * @throws {Error} If output layout, literal source or externally edited CSS is lost.
 * @example
 * // Latin automatic hyphenation is local to Latin text rather than Korean font fallback.
 */
async function verifyWordBreakHtml({ page }: { page: Page }): Promise<void> {
  await openWordBreakSource(page);
  await openWordBreakDialog(page);
  await page
    .getByRole("combobox", { name: "한글 단위", exact: true })
    .selectOption("0");
  await page
    .getByRole("combobox", { name: "영어 단위", exact: true })
    .selectOption("1");
  await page.locator('[data-modal-value="apply"]').click();
  /** Actual export HTML must contain both source metadata and functional Latin-only wrapping. */
  const bytes = await wordBreakExport(page, "html"),
    html = bytes.toString("utf8");
  expect(html).toContain("forhan-word-break");
  expect(html).toContain('lang="en"');
  expect(html).toContain('data-forhan-break-non-latin-word="0"');
  /** Actual static output must wrap the same source as the real editable document. */
  const liveLines = await page.evaluate(actualWordBreakLines, ".tiptap p"),
    staticPage = await page.context().newPage();
  try {
    await staticPage.setContent(html);
    await expect
      .poll(
        /**
         * Observe actual static source wrapping after its installed fonts settle.
         *
         * Geometry is read from the real script-free exported document.
         * @async
         * @returns {Promise<string[]>} Actual static source glyph lines.
         * @example
         * // Native line and Latin wrapping agree between live editing and HTML output.
         */
        async () => staticPage.evaluate(actualWordBreakLines, "p"),
      )
      .toEqual(liveLines);
  } finally {
    await staticPage.close();
  }
  await page.locator("#file-input").setInputFiles({
    name: "HTML 재가져오기.html",
    mimeType: "text/html",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "저장 안 함", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "저장 안 함", exact: true }),
  ).toBeHidden();
  await expect(page.locator("#document-title")).toHaveValue("HTML 재가져오기");
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "1",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-non-latin-word",
    "0",
  );
  /** External standard CSS must override mismatching retained native markers. */
  const changed = Buffer.from(
    '<p data-forhan-break-latin-word="2" data-forhan-break-non-latin-word="0" style="word-break:normal;hyphens:manual">외부 수정 ABCDE</p>',
  );
  await page.locator("#file-input").setInputFiles({
    name: "외부 수정.html",
    mimeType: "text/html",
    buffer: changed,
  });
  await expect(page.locator(".tiptap p")).toHaveText("외부 수정 ABCDE");
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-latin-word",
    "0",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-break-non-latin-word",
    "1",
  );
}
test(
  "static HTML retains real Latin wrapping while externally edited CSS overrides stale native markers",
  verifyWordBreakHtml,
);
