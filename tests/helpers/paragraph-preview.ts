import { expect, type Page } from "@playwright/test";

/** Actual preview measurements retain original text separately from physical sample rectangles. */
export interface PreviewGeometry {
  active: { x: number; y: number; width: number; height: number };
  previousY: number;
  nextY: number;
  firstX: number;
  text: string;
}

/**
 * Measure the real isolated paragraph sample through original DOM ranges.
 *
 * The first authored glyph is inspected inside its native drawing wrappers.
 * Source text and physical context paragraphs are observed independently.
 * @returns {PreviewGeometry} Actual current sample and surrounding paragraph geometry.
 * @throws {Error} If the controlled preview or its source text is absent.
 * @example
 * // page.evaluate(paragraphPreviewGeometry) reads pixels without consulting model attributes.
 */
export function paragraphPreviewGeometry(): PreviewGeometry {
  /** Only the actual owned preview and its central source paragraph are measured. */
  const root = document.querySelector<HTMLElement>(".nd-paragraph-preview")!,
    active = root.querySelector<HTMLElement>("[data-paragraph-preview-active]")!,
    box = active.getBoundingClientRect(),
    walker = document.createTreeWalker(active, NodeFilter.SHOW_TEXT),
    range = document.createRange();
  let text: Text | null = null;
  while (walker.nextNode()) {
    /** Source splitting may retain an empty boundary node before the first actual glyph. */
    const candidate = walker.currentNode as Text;
    if (candidate.length) {
      text = candidate;
      break;
    }
  }
  if (!text) throw new Error("The actual paragraph sample is empty.");
  range.setStart(text, 0);
  range.setEnd(text, 1);
  return {
    active: { x: box.x, y: box.y, width: box.width, height: box.height },
    previousY: root.firstElementChild!.getBoundingClientRect().y,
    nextY: root.lastElementChild!.getBoundingClientRect().y,
    firstX: range.getBoundingClientRect().x,
    text: active.textContent!,
  };
}

/**
 * Open the public paragraph dialog in the actual selected browser or desktop app.
 *
 * No preview state is injected and no private editor command is called.
 * @async
 * @param {Page} page - Actual isolated application window.
 * @returns {Promise<void>} Resolves after the real native preview becomes visible.
 * @throws {Error} If the actual ribbon command or attached preview is unavailable.
 * @example
 * await openParagraphPreview(page);
 */
export async function openParagraphPreview(page: Page): Promise<void> {
  await page.locator('button[data-native-tab="format"]').click();
  await page.locator('.native-ribbon [data-native-action="paragraph-format"]').click();
  await expect(page.getByRole("img", { name: "문단 모양 미리 보기" })).toBeVisible();
}

/**
 * Exercise actual native preview drafts and leave their document source unchanged.
 *
 * Literal native observations require a twenty-point offset near sixteen
 * pixels, unchanged context, independent indentation, proportional/fixed/zero
 * intervals and identical minimum-space sample pixels. Actual source files are
 * verified separately by each browser or native desktop caller.
 * @async
 * @param {Page} page - Actual isolated application page with an ordinary source paragraph.
 * @returns {Promise<Record<string,PreviewGeometry>>} Original real measurements retained for artifact evidence.
 * @throws {Error} If a physical native draft, cancellation or local text differs.
 * @example
 * const observations=await verifyParagraphPreview(page); // Cancel leaves the real source untouched.
 */
export async function verifyParagraphPreview(
  page: Page,
): Promise<Record<string, PreviewGeometry>> {
  await openParagraphPreview(page);
  /** All edits target real existing fields in the isolated native draft. */
  const form = page.locator("#native-format-form"),
    preview = page.locator(".nd-paragraph-preview"),
    records: Record<string, PreviewGeometry> = {};
  expect(await preview.locator(":scope > p").count()).toBe(3);
  records.default = await page.evaluate(paragraphPreviewGeometry);
  await form.locator('[name="marginLeft"]').fill("20");
  records.left = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.left.active.x - records.default.active.x - 16)).toBeLessThan(1);
  expect(records.left.previousY).toBe(records.default.previousY);
  await form.locator('[name="marginLeft"]').fill("0");
  await form.locator('[name="marginRight"]').fill("20");
  records.right = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.default.active.width - records.right.active.width - 16)).toBeLessThan(1);
  await form.locator('[name="marginRight"]').fill("0");
  await form.locator('[name="marginTop"]').fill("20");
  records.before = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.before.active.y - records.default.active.y - 16)).toBeLessThan(1);
  expect(records.before.previousY).toBe(records.default.previousY);
  await form.locator('[name="marginTop"]').fill("0");
  await form.locator('[name="marginBottom"]').fill("20");
  records.after = await page.evaluate(paragraphPreviewGeometry);
  expect(records.after.active.y).toBe(records.default.active.y);
  expect(Math.abs(records.after.nextY - records.default.nextY - 16)).toBeLessThan(1);
  await form.locator('[name="marginBottom"]').fill("0");
  await form.locator('[name="indentMode"][value="INDENT"]').check();
  await form.locator('[name="textIndent"]').fill("20");
  records.indent = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.indent.firstX - records.default.firstX - 16)).toBeLessThan(1);
  await form.locator('[name="indentMode"][value="HANGING"]').check();
  records.hanging = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.hanging.firstX - records.default.firstX)).toBeLessThan(0.1);
  expect(records.hanging.active.x).toBeGreaterThan(records.default.active.x + 15);
  await form.locator('[name="indentMode"][value="NORMAL"]').check();
  await form.locator('[name="line"]').fill("80");
  records.half = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.half.active.height * 2 - records.default.active.height)).toBeLessThan(0.1);
  await form.locator('[name="line"]').fill("100");
  records.percent100 = await page.evaluate(paragraphPreviewGeometry);
  await form.locator('[name="lineMode"]').selectOption("FIXED");
  await form.locator('[name="line"]').fill("10");
  records.fixed10 = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.percent100.active.height - records.fixed10.active.height)).toBeLessThan(0.1);
  await form.locator('[name="line"]').fill("0");
  records.zero = await page.evaluate(paragraphPreviewGeometry);
  expect(records.zero.active.height).toBe(0);
  await form.locator('[name="lineMode"]').selectOption("PERCENT");
  await form.locator('[name="line"]').fill("160");
  for (/** Every real native alignment retains the same original preview text. */ const alignment of [
    "left", "center", "right", "justify", "distribute", "split",
  ]) {
    await form.locator(`[name="align"][value="${alignment}"]`).check();
    records[alignment + "Align"] = await page.evaluate(paragraphPreviewGeometry);
    expect(records[alignment + "Align"].text).toBe(records.default.text);
  }
  expect(records.centerAlign.firstX).toBeGreaterThan(records.leftAlign.firstX);
  expect(records.rightAlign.firstX).toBeGreaterThan(records.centerAlign.firstX);
  await form.locator('[name="align"][value="justify"]').check();
  /** The original native dialog preserves this sample when only minimum spacing changes. */
  const originalPixels = await preview.screenshot();
  await form.locator('[name="minimum-space"]').fill("25");
  expect((await preview.screenshot()).equals(originalPixels)).toBe(true);
  /** A partially typed draft retains its exact preceding local rendering tree. */
  const validMarkup = await preview.innerHTML();
  await form.locator('[name="marginLeft"]').fill("");
  expect(await preview.innerHTML()).toBe(validMarkup);
  await form.locator('[name="marginLeft"]').fill("1.25");
  await form.locator('[name="marginRight"]').focus();
  records.quarter = await page.evaluate(paragraphPreviewGeometry);
  expect(Math.abs(records.quarter.active.x - records.default.active.x - 1)).toBeLessThan(0.1);
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  return records;
}
