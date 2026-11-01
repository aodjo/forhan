import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { paragraphLengthPoints } from "../src/formatting.ts";

/**
 * Open actual native numeric controls through the public paragraph command.
 *
 * The source selection remains owned by the actual editor while its draft opens.
 * @async
 * @param {Page} page - Actual isolated application page.
 * @returns {Promise<void>} Resolves after its native numeric draft is visible.
 * @throws {Error} If the actual ribbon command or form cannot be opened.
 * @example
 * await paragraphNumberDialog(page);
 */
async function paragraphNumberDialog(page: Page): Promise<void> {
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(page.locator("#native-format-form")).toBeVisible();
}

/**
 * Read a real completed native or portable public application download.
 *
 * Serialization is performed by the application and decoded independently.
 * @async
 * @param {Page} page - Actual isolated application page.
 * @param {string} format - Public native or portable export identifier.
 * @returns {Promise<import('../src/types.ts').DocumentPayload>} Actual saved source payload.
 * @throws {Error} If actual export, file reading or native decoding fails.
 * @example
 * const source=await paragraphNumberOutput(page,'hwpx');
 */
async function paragraphNumberOutput(
  page: Page,
  format: string,
): Promise<import("../src/types.ts").DocumentPayload> {
  /** This completion listener belongs to one actual public menu action. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Only actual completed application output is passed to an independent reader. */
  const download = await pending,
    bytes = await readFile((await download.path())!);
  return format === "hwp"
    ? readHwp(bytes)
    : format === "hwpx"
      ? readHwpx(bytes)
      : JSON.parse(bytes.toString("utf8"));
}

/**
 * Verify native decimal display, actual pointer/key steps and precise file source.
 *
 * Unchanged rounded fields retain original hundredth-point source. Independent
 * real button and keyboard edits share a single undo step in all three formats.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after pointer, keyboard, native source and undo agree.
 * @throws {Error} If a draft display, step, native file or one-step undo differs.
 * @example
 * // 1.25pt displays 1.3pt without rewriting the original; one up click produces 2pt.
 */
async function verifyParagraphNumberEdits({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Exact original point values are intentionally finer than native display labels. */
  const attrs = {
    marginLeft: "1.25pt",
    marginRight: "1.25pt",
    marginTop: "1.25pt",
    marginBottom: "1.25pt",
    textIndent: "-18.25pt",
    lineHeight: "18.25pt",
    nativeBreakLatinWord: 2,
    nativeBreakNonLatinWord: 0,
  };
  await page.locator("#file-input").setInputFiles({
    name: "숫자 원문.fhn",
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
              attrs,
              content: [{ type: "text", text: "숫자와 원문 정밀도" }],
            },
          ],
        },
      }),
    ),
  });
  await page.locator(".tiptap").click();
  await paragraphNumberDialog(page);
  await expect(page.locator('[name="marginLeft"]')).toHaveValue("1.3");
  await expect(page.locator('[name="textIndent"]')).toHaveValue("18.3");
  await expect(page.locator('[name="line"]')).toHaveValue("18.3");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/);
  /** Unchanged Apply preserves literal portable attributes rather than rounded control text. */
  const unchanged = await paragraphNumberOutput(page, "forhan");
  for (/** Every original independent source field survives the untouched native form. */ const [
    name,
    value,
  ] of Object.entries(attrs))
    expect(unchanged.doc.content![0].attrs![name]).toBe(value);
  await paragraphNumberDialog(page);
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "왼쪽 여백 늘리기", exact: true })
    .click();
  await expect(page.locator('[name="marginLeft"]')).toHaveValue("2.0");
  await page.keyboard.type("7");
  await expect(page.locator('[name="marginLeft"]')).toHaveValue("7");
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "오른쪽 여백 줄이기", exact: true })
    .click();
  await expect(page.locator('[name="marginRight"]')).toHaveValue("1.0");
  await page.locator('[name="marginTop"]').press("ArrowUp");
  await expect(page.locator('[name="marginTop"]')).toHaveValue("2.0");
  await page.locator('[name="marginBottom"]').press("ArrowDown");
  await expect(page.locator('[name="marginBottom"]')).toHaveValue("1.0");
  await page.locator('[name="line"]').press("ArrowUp");
  await expect(page.locator('[name="line"]')).toHaveValue("19.0");
  await page.locator('[data-modal-value="apply"]').click();
  for (/** Real application writers must emit actual changed distances and untouched original precision. */ const format of [
    "hwpx",
    "hwp",
    "forhan",
  ]) {
    /** Independent native readers inspect actual completed serialized source. */
    const source = await paragraphNumberOutput(page, format),
      actual = source.doc.content![0].attrs!;
    for (/** Expected point values follow original native arrow outcomes and the explicit typed edit. */ const [
      name,
      value,
    ] of Object.entries({
      marginLeft: 7,
      marginRight: 1,
      marginTop: 2,
      marginBottom: 1,
      textIndent: -18.25,
      lineHeight: 19,
    }))
      expect(paragraphLengthPoints(actual[name])).toBeCloseTo(value, 2);
    expect(actual.nativeBreakLatinWord).toBe(2);
    expect(actual.nativeBreakNonLatinWord).toBe(0);
  }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  /** A single source transaction restores every original precise field together. */
  const restored = await paragraphNumberOutput(page, "forhan");
  for (/** Undo must restore original values rather than their displayed rounded text. */ const [
    name,
    value,
  ] of Object.entries(attrs))
    expect(restored.doc.content![0].attrs![name]).toBe(value);
}
test(
  "native paragraph arrows use observed steps while rounded display, exact native source and one undo remain separate",
  verifyParagraphNumberEdits,
);

/**
 * Preserve untouched mixed source and reject empty numeric drafts before Apply.
 *
 * Disabled indentation arrows follow the actual radio mode. Cancel and invalid
 * input cannot edit source; a single margin change preserves unrelated mixed
 * alignments, line modes, fine distances and independent word-breaking fields.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after validation, local draft and mixed-source assertions.
 * @throws {Error} If disabled controls, invalid input or an unrelated source field changes.
 * @example
 * // Editing paragraph-above spacing leaves different original heading/paragraph line heights intact.
 */
async function verifyParagraphNumberDrafts({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Different original block settings cannot be flattened by one representative native form. */
  const originals = [
    {
      type: "heading",
      attrs: {
        level: 2,
        marginLeft: "1.25pt",
        lineHeight: "20pt",
        textAlign: "right",
        nativeBreakLatinWord: 2,
        nativeBreakNonLatinWord: 0,
      },
      content: [{ type: "text", text: "원본 제목" }],
    },
    {
      type: "paragraph",
      attrs: {
        marginLeft: "12.25pt",
        lineHeight: "1.6",
        textAlign: "left",
        nativeBreakLatinWord: 0,
        nativeBreakNonLatinWord: 1,
      },
      content: [{ type: "text", text: "원본 문단" }],
    },
  ];
  await page.locator("#file-input").setInputFiles({
    name: "혼합 숫자.fhn",
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
  await paragraphNumberDialog(page);
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "문단 위 줄이기", exact: true })
    .click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/);
  await paragraphNumberDialog(page);
  await expect(
    page
      .locator("#native-format-form")
      .getByRole("button", { name: "첫 줄 길이 늘리기", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator("#native-format-form")
      .getByRole("button", { name: "첫 줄 길이 줄이기", exact: true }),
  ).toBeDisabled();
  await page.locator('[name="indentMode"][value="INDENT"]').check();
  await expect(
    page
      .locator("#native-format-form")
      .getByRole("button", { name: "첫 줄 길이 늘리기", exact: true }),
  ).toBeEnabled();
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "첫 줄 길이 늘리기", exact: true })
    .click();
  await expect(page.locator('[name="textIndent"]')).toHaveValue("1.0");
  await page.locator('[name="indentMode"][value="NORMAL"]').check();
  await expect(
    page
      .locator("#native-format-form")
      .getByRole("button", { name: "첫 줄 길이 늘리기", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator("#native-format-form")
      .getByRole("button", { name: "최소 공백 늘리기", exact: true }),
  ).toBeEnabled();
  await page.locator('[name="marginLeft"]').fill("");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#native-format-form")).toBeVisible();
  await page.locator('.modal-actions [data-modal-value="cancel"]').click();
  await paragraphNumberDialog(page);
  await page
    .locator("#native-format-form")
    .getByRole("button", { name: "문단 위 늘리기", exact: true })
    .click();
  await page.locator('[data-modal-value="apply"]').click();
  /** Actual portable source distinguishes untouched mixed fields from a representative form display. */
  const actual = (await paragraphNumberOutput(page, "forhan")).doc.content!;
  for (let index = 0; index < 2; index++) {
    expect(actual[index].type).toBe(originals[index].type);
    for (/** Only the explicitly edited paragraph-above amount may differ. */ const [
      name,
      value,
    ] of Object.entries(originals[index].attrs))
      expect(actual[index].attrs![name]).toBe(value);
    expect(actual[index].attrs!.marginTop).toBe("1pt");
  }
}
test(
  "native paragraph numeric drafts retain disabled controls, invalid-input guards and unrelated mixed formatting",
  verifyParagraphNumberDrafts,
);
