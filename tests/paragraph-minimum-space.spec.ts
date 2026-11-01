import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import {
  MINIMUM_SPACE_CASES,
  MINIMUM_SPACE_SOURCE,
  nativeMinimumSpaceLines,
  minimumSpaceDocument,
} from "./helpers/paragraph-minimum-space.ts";
import { actualWordBreakLines } from "./helpers/paragraph-word-break.ts";

/**
 * Match actual live minimum-space wrapping against forty-eight native observations.
 *
 * Native half-em and intrinsic font spaces remain independent from paragraph
 * reduction. Measured physical glyph rows and paragraph heights must agree;
 * collapsed hanging spaces cannot introduce phantom empty visual lines.
 * @async
 * @param {{page:Page}} context - Actual isolated application renderer.
 * @returns {Promise<void>} Resolves after every native source-line condition agrees.
 * @throws {Error} If actual glyph rows, source text or physical line height differs.
 * @example
 * // At a narrow width, a 25% intrinsic-space minimum pulls one more whole word upward.
 */
async function verifyNativeMinimumSpaceLines({
  page,
}: {
  page: Page;
}): Promise<void> {
  test.setTimeout(90000);
  await page.goto("/");
  for (/** Native justified and left-aligned conditions have independently identical word boundaries. */ const align of [
    "justify",
    "left",
  ])
    for (/** Literal source cases come from the original native navigation matrix. */ const [
      index,
      condition,
    ] of MINIMUM_SPACE_CASES.entries()) {
      /** Every fixture has a distinct owned source name and explicit original native font settings. */
      const name = "minimum-" + align + "-" + index + ".fhn",
        expected = nativeMinimumSpaceLines(condition);
      await page.locator("#file-input").setInputFiles({
        name,
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            application: "forhan",
            version: 1,
            doc: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    nativeParagraphCondense: condition.condense,
                    nativeBreakLatinWord: 0,
                    nativeBreakNonLatinWord: 0,
                    textAlign: align,
                    marginRight: condition.right / 200 + "pt",
                    lineHeight: "1.6",
                  },
                  content: [
                    {
                      type: "text",
                      text: MINIMUM_SPACE_SOURCE,
                      marks: [
                        {
                          type: "textStyle",
                          attrs: {
                            fontFamily: "Arial",
                            fontSize: "16pt",
                            nativeUseFontSpace: condition.fontSpace,
                            nativeUseKerning: false,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        ),
      });
      await expect(page.locator("#toast")).toContainText(name);
      await expect(page.locator(".tiptap p")).toHaveAttribute(
        "data-forhan-paragraph-condense",
        String(condition.condense),
      );
      await expect
        .poll(
          /**
           * Observe current glyph line membership after native rendering corrections settle.
           *
           * The measurement reads original source ranges rather than model labels.
           * @async
           * @returns {Promise<string[]>} Actual current physical source rows.
           * @example
           * // Hanging source blanks use their real inline wrapper position when their text range is empty.
           */
          async () => page.evaluate(actualWordBreakLines, ".tiptap p"),
        )
        .toEqual(expected);
      await expect(page.locator(".tiptap p")).toHaveText(MINIMUM_SPACE_SOURCE);
      await expect
        .poll(
          /**
           * Read actual paragraph flow height independently from source line labels.
           *
           * A collapsed trailing source space must not create an extra native line.
           * @async
           * @returns {Promise<number>} Actual unzoomed native paragraph height in CSS pixels.
           * @example
           * // Three 16pt lines at 160% occupy about 102.4 CSS pixels.
           */
          async () =>
            parseFloat(
              (await page
                .locator(".tiptap p")
                .getAttribute("data-forhan-layout-height")) ?? "NaN",
            ),
        )
        .toBeCloseTo(((expected.length * 16 * 4) / 3) * 1.6, 1);
      await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/);
    }
}
test(
  "native minimum-space glyph wrapping and physical line heights match all forty-eight original source conditions",
  verifyNativeMinimumSpaceLines,
);

/**
 * Read one actual native application download through its corresponding independent reader.
 *
 * Production serialization creates every byte; this helper supplies no source
 * model attributes or replacement writer implementation.
 * @async
 * @param {Page} page - Actual isolated application renderer.
 * @param {string} format - Public native or portable export menu identifier.
 * @returns {Promise<import('../src/types.ts').DocumentPayload>} Actual emitted native or portable source.
 * @throws {Error} If a public export, completed file or native reader fails.
 * @example
 * const source=await minimumSpaceOutput(page,'hwpx');
 */
async function minimumSpaceOutput(
  page: Page,
  format: string,
): Promise<import("../src/types.ts").DocumentPayload> {
  /** The completion listener is installed before the actual public export command. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="' + format + '"]').click();
  /** Only actual completed output bytes enter the native readers. */
  const download = await pending,
    bytes = await readFile((await download.path())!);
  return format === "hwp"
    ? readHwp(bytes)
    : format === "hwpx"
      ? readHwpx(bytes)
      : JSON.parse(bytes.toString("utf8"));
}

/**
 * Verify minimum-space editing, invalid drafts, independent mixed source and atomic undo.
 *
 * An untouched representative value cannot flatten different original heading
 * and paragraph reductions. One explicit minimum edit preserves unrelated
 * native breaking, alignment and exact fixed line-height values in all formats.
 * @async
 * @param {{page:Page}} context - Actual isolated native-dialog renderer.
 * @returns {Promise<void>} Resolves after real controls, output and source history agree.
 * @throws {Error} If validation, independent source fields or one-step undo differs.
 * @example
 * // Displaying 75% remains stored as reduction 25; setting 50% explicitly stores 50.
 */
async function verifyMinimumSpaceDrafts({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Mixed original blocks retain all independent native source fields. */
  const originals = [
    {
      type: "heading",
      attrs: {
        level: 2,
        nativeParagraphCondense: 25,
        nativeBreakLatinWord: 2,
        nativeBreakNonLatinWord: 0,
        textAlign: "right",
        lineHeight: "18.25pt",
      },
      content: [{ type: "text", text: "ALPHA beta gamma heading" }],
    },
    {
      type: "paragraph",
      attrs: {
        nativeParagraphCondense: 75,
        nativeBreakLatinWord: 0,
        nativeBreakNonLatinWord: 1,
        textAlign: "left",
        lineHeight: "1.6",
      },
      content: [{ type: "text", text: "ALPHA beta gamma paragraph" }],
    },
  ];
  await page.locator("#file-input").setInputFiles({
    name: "mixed-minimum.fhn",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        doc: { type: "doc", content: originals },
      }),
    ),
  });
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/);
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  /** Real pointer and keyboard arrows share the original one-percent integer grid. */
  const minimum = page.locator('[name="minimum-space"]'),
    initial = 75;
  await minimum.fill(String(initial));
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "최소 공백 줄이기", exact: true })
    .click();
  await expect(minimum).toHaveValue(String(initial - 1));
  await minimum.press("ArrowUp");
  await expect(minimum).toHaveValue(String(initial));
  await minimum.fill("25");
  await minimum.press("ArrowDown");
  await expect(minimum).toHaveValue("25");
  await minimum.fill("100");
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "최소 공백 늘리기", exact: true })
    .click();
  await expect(minimum).toHaveValue("100");
  await page.locator('[name="minimum-space"]').fill("24");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#native-format-form")).toBeVisible();
  await page.locator('[name="minimum-space"]').fill("50.5");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#native-format-form")).toBeVisible();
  await page.locator('[name="minimum-space"]').fill("50");
  await page.locator('[data-modal-value="apply"]').click();
  for (/** Real native and portable output distinguish stored reduction from the visible complement. */ const format of [
    "hwpx",
    "hwp",
    "forhan",
  ]) {
    /** Actual source is inspected after the application completes its writer. */
    const actual = (await minimumSpaceOutput(page, format)).doc.content!;
    for (let index = 0; index < 2; index++) {
      assertMinimumSpaceSource(
        actual[index].attrs!,
        originals[index].attrs,
        50,
        format === "forhan",
      );
    }
  }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  /** One undo restores the two originally distinct reductions together. */
  const restored = (await minimumSpaceOutput(page, "forhan")).doc.content!;
  for (let index = 0; index < 2; index++)
    assertMinimumSpaceSource(
      restored[index].attrs!,
      originals[index].attrs,
      originals[index].attrs.nativeParagraphCondense,
      true,
    );
}

/**
 * Check independent source fields beside one explicit paragraph reduction edit.
 *
 * Native formats can normalize CSS line-height units, while portable source
 * retains original literal precision and heading level attributes.
 * @param {Record<string,unknown>} actual - Actual decoded source block attributes.
 * @param {Record<string,unknown>} original - Original independent source fields.
 * @param {number} reduction - Expected independently stored native reduction.
 * @param {boolean} portable - Whether literal portable-only fields must also remain exact.
 * @returns {void} Completes independent native source assertions.
 * @throws {Error} If a source reduction or unrelated original native field differs.
 * @example
 * assertMinimumSpaceSource(actual,original,50,true);
 */
function assertMinimumSpaceSource(
  actual: Record<string, unknown>,
  original: Record<string, unknown>,
  reduction: number,
  portable: boolean,
): void {
  expect(actual.nativeParagraphCondense).toBe(reduction);
  for (/** Explicit minimum spacing cannot replace unrelated original native source fields. */ const key of [
    "nativeBreakLatinWord",
    "nativeBreakNonLatinWord",
    "textAlign",
  ])
    expect(actual[key]).toBe(original[key]);
  if (portable) {
    expect(actual.lineHeight).toBe(original.lineHeight);
    if (original.level) expect(actual.level).toBe(original.level);
  }
}
test(
  "minimum-space controls validate native bounds and preserve independent mixed source through all formats and one undo",
  verifyMinimumSpaceDrafts,
);

/**
 * Preserve adaptive minimum spacing through actual script-free HTML and reimport.
 *
 * Two independently observed native word-pulling conditions must produce the
 * same source rows in editing and real exported HTML. Reimport removes physical
 * drawing corrections before restoring the original native paragraph setting.
 * @async
 * @param {{page:Page}} context - Actual isolated native application renderer.
 * @returns {Promise<void>} Resolves after static glyph rows, source and native reimport agree.
 * @throws {Error} If static layout, original Unicode or restored native reduction differs.
 * @example
 * // A 25% intrinsic-space minimum retains its native three-line layout after HTML reimport.
 */
async function verifyMinimumSpaceHtml({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  for (/** These two original native conditions pull different complete words onto earlier lines. */ const condition of [
    MINIMUM_SPACE_CASES[15],
    MINIMUM_SPACE_CASES[18],
  ]) {
    /** The owning application creates actual native source at the independently observed width. */
    const source = minimumSpaceDocument(condition),
      expected = nativeMinimumSpaceLines(condition);
    await page.locator("#file-input").setInputFiles({
      name: "static-minimum.fhn",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(source)),
    });
    await expect(page.locator("#toast")).toContainText("static-minimum.fhn");
    await expect
      .poll(
        /**
         * Observe real live native source rows before exporting the same revision.
         *
         * Native drawing can finish after the source document has been imported.
         * @async
         * @returns {Promise<string[]>} Actual physical source word rows.
         * @example
         * // A transient first frame cannot become the expected static layout.
         */
        async () => page.evaluate(actualWordBreakLines, ".tiptap p"),
      )
      .toEqual(expected);
    /** Actual download completion precedes inspection of production static HTML. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator('[data-export="html"]').click();
    /** Only actual exported bytes are used for both static observation and source reimport. */
    const download = await pending,
      bytes = await readFile((await download.path())!),
      html = bytes.toString("utf8"),
      observer = await page.context().newPage();
    expect(html).not.toMatch(/<script\b/i);
    try {
      await observer.setContent(html);
      await expect
        .poll(
          /**
           * Read actual source word rows from the script-free exported document.
           *
           * Production static output supplies all widths; no correction script runs.
           * @async
           * @returns {Promise<string[]>} Real exported source glyph rows.
           * @example
           * // HTML contains the original spaces rather than replacement text.
           */
          async () => observer.evaluate(actualWordBreakLines, "p"),
        )
        .toEqual(expected);
      await expect(observer.locator("p")).toHaveText(MINIMUM_SPACE_SOURCE,{useInnerText:true});
    } finally {
      await observer.close();
    }
    await page.locator("#file-input").setInputFiles({
      name: "minimum-roundtrip.html",
      mimeType: "text/html",
      buffer: bytes,
    });
    await expect(page.locator("#toast")).toContainText(
      "minimum-roundtrip.html",
    );
    await expect(page.locator(".tiptap p")).toHaveAttribute(
      "data-forhan-paragraph-condense",
      String(condition.condense),
    );
    await expect
      .poll(
        /**
         * Observe physical reimported source after owned drawing corrections are regenerated.
         *
         * An exported physical space adjustment must not be applied a second time.
         * @async
         * @returns {Promise<string[]>} Actual reimported physical glyph rows.
         * @example
         * // Native remaining-space percentages stay independent from applied drawing widths.
         */
        async () => page.evaluate(actualWordBreakLines, ".tiptap p"),
      )
      .toEqual(expected);
    expect(
      (await minimumSpaceOutput(page, "hwpx")).doc.content![0].attrs!
        .nativeParagraphCondense,
    ).toBe(condition.condense);
  }
}
test(
  "minimum-space HTML export and reimport retain actual native word rows without source-space or correction duplication",
  verifyMinimumSpaceHtml,
);

/**
 * Preserve fixed leading source blanks and restore full gaps on a short native line.
 *
 * Original native navigation observed four leading blanks at both native space
 * modes and alignments. They cannot be shrunk to pull gamma onto line one. A
 * separate short paragraph requires no reduction anywhere in its only line.
 * @async
 * @param {{page:Page}} context - Actual isolated native paragraph renderer.
 * @returns {Promise<void>} Resolves after actual native leading and short-line geometry agree.
 * @throws {Error} If source indentation is condensed or a short line is globally shrunk.
 * @example
 * // Four source indentation blanks keep full native width at a 25% paragraph minimum.
 */
async function verifyMinimumSpaceLeadingBlanks({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  for (/** Native leading blanks stay fixed for both original source alignment modes. */ const align of [
    "left",
    "justify",
  ])
    for (/** Intrinsic and half-em source spaces remain independent from paragraph condensation. */ const fontSpace of [
      false,
      true,
    ]) {
      /** These literal source boundaries were independently observed in installed Hangul with four leading blanks. */
      const condition = { right: 57000, fontSpace, condense: 75 },
        source = minimumSpaceDocument(condition, align),
        text = "    " + MINIMUM_SPACE_SOURCE;
      source.doc.content![0].content![0].text = text;
      await page.locator("#file-input").setInputFiles({
        name: "leading-minimum.fhn",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(source)),
      });
      await expect(page.locator("#toast")).toContainText("leading-minimum.fhn");
      await expect
        .poll(
          /**
           * Read physical source rows without interpreting indentation blanks as new glyph lines.
           *
           * Expected boundaries come from the original native leading-blank matrix.
           * @async
           * @returns {Promise<string[]>} Actual physical source word rows.
           * @example
           * // Condensing indentation would incorrectly pull gamma into the first line.
           */
          async () => page.evaluate(actualWordBreakLines, ".tiptap p"),
        )
        .toEqual([
          "ALPHA beta",
          "gamma delta",
          "epsilon zeta eta",
          "theta iota kappa",
        ]);
      await expect(page.locator(".tiptap p")).toHaveText(text);
      await expect
        .poll(
          /**
           * Read actual rendering corrections of the four original indentation spaces.
           *
           * Character-native base correction may remain, but paragraph reduction must be zero.
           * @async
           * @returns {Promise<number[]>} Actual paragraph reductions for the leading source blanks.
           * @example
           * // Half-em source remains half-em independently from a zero paragraph reduction.
           */
          async () =>
            page.locator(".tiptap [data-forhan-condense-delta]").evaluateAll(
              /**
               * Inspect original source-space drawing attributes after actual layout settles.
               *
               * These values do not substitute for the independent physical glyph-row check.
               * @param {Element[]} elements - Actual source-space drawing wrappers.
               * @returns {number[]} Four actual leading source reductions.
               * @example
               * // All four leading source blanks keep their original advance.
               */
              (elements) =>
                elements.slice(0, 4).map(
                  /**
                   * Read one actual native paragraph reduction marker.
                   *
                   * Native character-space correction is stored independently.
                   * @param {Element} element - Actual original source-space wrapper.
                   * @returns {number} Its paragraph-only width correction.
                   * @example
                   * // A leading indentation space has correction zero.
                   */
                  (element) =>
                    Number(element.getAttribute("data-forhan-condense-delta")),
                ),
            ),
        )
        .toEqual([0, 0, 0, 0]);
    }
  /** A wide short paragraph has no line overflow that could justify adaptive reduction. */
  const short = minimumSpaceDocument({
    right: 0,
    fontSpace: false,
    condense: 75,
  });
  short.doc.content![0].content![0].text = "ALPHA beta";
  await page.locator("#file-input").setInputFiles({
    name: "short-minimum.fhn",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(short)),
  });
  await expect(page.locator("#toast")).toContainText("short-minimum.fhn");
  await expect(
    page.locator(".tiptap [data-forhan-condense-delta]"),
  ).toHaveAttribute("data-forhan-condense-delta", "0");
}
test(
  "minimum-space rendering keeps native leading indentation and does not shrink an unoverflowed short line",
  verifyMinimumSpaceLeadingBlanks,
);
