import {DOCUMENT_START_KEY} from './helpers/native-keyboard.ts';
import {nativeSourceCaretOffset} from './helpers/native-paper-viewport.ts';
import {observeNativeKeySource,retainNativeKeySource} from './helpers/native-key-source-observation.ts';
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {createHash} from 'node:crypto';
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { characterMetrics } from "../src/character-metrics.ts";
import type { JSONContent } from "@tiptap/core";
import { contextualInk, contextualPositions, contextualCaret } from "./helpers/contextual-width";

/** Two raster-edge pixels allow sparse mark antialiasing while source font height remains exactly invariant. */
const CONTEXTUAL_INK_EDGE_TOLERANCE = 2;

/**
 * Install passive native source ordering observations before each owned page loads.
 *
 * Test behavior and expected text remain unchanged across all platform runners.
 * @async
 * @param {{page:Page}} context - Current isolated regression renderer.
 * @returns {Promise<void>} Resolves after registering the read-only observer.
 * @example
 * // Actual Command-arrow and subsequent typing share one untouched source trace.
 */
async function installKeySourceObservation({page}:{page:Page}):Promise<void>{await page.addInitScript(observeNativeKeySource);}

/**
 * Preserve genuine source observations after the original assertion outcome.
 *
 * Successful and failed original cases retain the same diagnostic evidence.
 * @async
 * @param {{page:Page}} context - Current test-owned application renderer.
 * @returns {Promise<void>} Resolves after retaining the original observation buffer.
 * @example
 * // A failed immediate typing assertion retains its preceding real caret endpoints.
 */
async function attachKeySourceObservation({page}:{page:Page}):Promise<void>{await retainNativeKeySource(page);}

test.beforeEach(installKeySourceObservation);
test.afterEach(attachKeySourceObservation);

/**
 * Keep Command-arrow navigation anchored in original native-width source.
 *
 * Browser default movement can target drawing wrappers while a source caret
 * still points elsewhere. Real key chords must commit line/document edges
 * before immediate typing, preserve Shift selection and retain ordinary undo.
 * @async
 * @param {{page:Page}} context - Actual isolated public document renderer.
 * @returns {Promise<void>} Resolves after source edges, typing, selection and undo agree.
 * @throws {Error} If a Command-arrow gesture leaves the caret in drawing DOM or at a stale source endpoint.
 * @example
 * // Command-Up, Right and C produce MCMMMMMMM rather than MMMMMMMMC.
 */
async function verifyNativeCommandEdges({page}:{page:Page}):Promise<void>{
  await page.goto('/');await loadWidth(page,50);await page.locator('.tiptap').focus();
  await test.info().attach('command-source-before-input',{body:await page.locator('#paper').evaluate(/**
   * Retain the actual original source and drawing geometry before navigation.
   *
   * @param {HTMLElement} paper - Actual unmodified rendered paper.
   * @returns {string} Original paper markup for diagnosing source caret ownership.
   * @example
   * // A missing native flow stays observable instead of being assumed ready.
   */paper=>paper.outerHTML),contentType:'text/html'});
  for(/** Every native document or line edge is observed through its real source DOM caret. */const [key,expected]of [['Meta+ArrowDown',8],['Meta+ArrowUp',0],['Meta+ArrowRight',8],['Meta+ArrowLeft',0]] as const){
    await page.keyboard.press(key);
    expect(await page.locator('.tiptap').evaluate(nativeSourceCaretOffset),key).toBe(expected);
  }
  await page.keyboard.press('ArrowRight');await page.keyboard.type('C');
  expect(widthSourceText(JSON.parse((await saveWidth(page,'forhan')).toString()).doc)).toBe('MCMMMMMMM');
  await page.keyboard.press('ControlOrMeta+z');expect(widthSourceText(JSON.parse((await saveWidth(page,'forhan')).toString()).doc)).toBe('MMMMMMMM');
  await page.keyboard.press('Meta+ArrowDown');await page.keyboard.press('Shift+Meta+ArrowUp');await page.keyboard.type('C');
  expect(widthSourceText(JSON.parse((await saveWidth(page,'forhan')).toString()).doc)).toBe('C');
  await page.keyboard.press('ControlOrMeta+z');expect(widthSourceText(JSON.parse((await saveWidth(page,'forhan')).toString()).doc)).toBe('MMMMMMMM');
}

test('Command-arrow edges commit native-width source before immediate typing and Shift replacement',verifyNativeCommandEdges);

/**
 * Load native width source through the ordinary document input.
 *
 * Every case retains the same installed face and physical font height so only
 * explicit width and tracking changes can alter horizontal source geometry.
 * @async
 * @param {Page} page - Owned renderer page.
 * @param {number} [ratio=100] - Original native width percentage.
 * @param {number} [tracking=0] - Original native tracking percentage.
 * @param {string} [text='MMMMMMMM'] - Original authored source text.
 * @param {Record<string,unknown>} [paragraphAttrs={}] - Original paragraph alignment and physical spacing.
 * @returns {Promise<void>} Resolves after the original source is loaded.
 * @example
 * await loadWidth(page,50,20); // Half width and proportional tracking.
 */
async function loadWidth(
  page: Page,
  ratio = 100,
  tracking = 0,
  text = "MMMMMMMM",
  paragraphAttrs: Record<string,unknown> = {},
): Promise<void> {
  /** Complete native arrays remain source data, independent of drawing wrappers. */
  const metrics = characterMetrics(null),
    name=`width-${ratio}-${tracking}-${createHash('sha256').update(text).digest('hex').slice(0,10)}.forhan`;
  metrics.ratio.fill(ratio);
  metrics.spacing.fill(tracking);
  await page.locator("#file-input").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        title: "Width",
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: paragraphAttrs,
              content: [
                {
                  type: "text",
                  text,
                  marks: [
                    {
                      type: "textStyle",
                      attrs: {
                        fontFamily: "Arial",
                        fontSize: "32pt",
                        color: "#123456",
                        nativeCharacterMetrics: metrics,
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
  await expect(page.locator('#toast')).toContainText(name);
  await expect(
    page.locator(".tiptap [data-forhan-character-metrics]").first(),
  ).toBeAttached();
  await page.evaluate(
    /**
     * Await real font loading and queued drawing work after source replacement.
     *
     * Existing wrappers can briefly describe the previous document while its
     * owned rendering plugins process the replacement source.
     * @async
     * @returns {Promise<void>} Resolves after two actual rendering frames.
     * @example
     * // Subsequent geometry belongs to the newly opened native measurements.
     */
    async()=>{
      await document.fonts.ready;
      await new Promise<void>(
        /**
         * Observe two browser frames without a fixed observation delay.
         *
         * Native advance and contour plugins settle in consecutive frames.
         * @param {()=>void} resolve - Completion callback for the owned render wait.
         * @returns {void} Schedules completion after queued drawing work.
         * @example
         * // Source font measurements settle before their dependent glyph drawing.
         */
        resolve=>requestAnimationFrame(
          /**
           * Wait for dependent contour work after source advances apply.
           *
           * Completion belongs to the current source renderer only.
           * @returns {number} Identifier of the final owned browser frame.
           * @example
           * // The second frame observes final native source geometry.
           */
          ()=>requestAnimationFrame(
            /**
             * Finish the owned wait after the final rendering callback.
             *
             * Browser timestamps are deliberately excluded from the promise result.
             * @returns {void} Resolves this source-render observation.
             * @example
             * // Geometry can now be read from the current document.
             */
            ()=>resolve())));
    });
}

/**
 * Open the real character dialog while preserving the authored selection.
 *
 * Draft values stay local until the native Apply action is selected.
 * @async
 * @param {Page} page - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after the Basic character panel is visible.
 * @example
 * await openWidth(page); // The width control is editable and independently validated.
 */
async function openWidth(page: Page): Promise<void> {
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
}

/**
 * Observe actual native, local or HTML output created through production UI.
 *
 * The helper never substitutes source-generated expected bytes for a download.
 * @async
 * @param {Page} page - Owned actual renderer.
 * @param {'hwp'|'hwpx'|'forhan'|'html'} format - Real requested output format.
 * @returns {Promise<Buffer>} Complete original output bytes.
 * @example
 * const bytes=await saveWidth(page,'hwp');
 */
async function saveWidth(
  page: Page,
  format: "hwp" | "hwpx" | "forhan" | "html",
): Promise<Buffer> {
  /** The download observer is registered before triggering the actual serializer. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Original serializer output supplies independent native and source assertions. */
  const downloaded = await pending;
  return readFile((await downloaded.path())!);
}

/**
 * Read authored text without counting inaccessible glyph drawing nodes.
 *
 * Native and HTML paths may split script runs while retaining original text.
 * @param {JSONContent} node - Actual serialized source node.
 * @returns {string} Authored source text in document order.
 * @example
 * widthSourceText(payload.doc); // No duplicate SVG text enters source.
 */
function widthSourceText(node: JSONContent): string {
  let text = node.text || "";
  for (/** Actual source children retain text and independent mark boundaries. */ const child of node.content ||
    [])
    text += widthSourceText(child);
  return text;
}

/**
 * Measure actual source advance independently of its drawing-only glyph shapes.
 *
 * Complete source ranges include their real browser letter advances and native
 * correction wrappers; inaccessible SVG text is excluded from the measurement.
 * @param {HTMLElement} root - Actual editor document root.
 * @returns {object} Original source bounds and first painted glyph bounds.
 * @example
 * const bounds=await page.locator('.tiptap').evaluate(widthGeometry);
 */
function widthGeometry(root: HTMLElement) {
  /** Only authored text participates in source width and line-height measurements. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    nodes: Text[] = [];
  while (walker.nextNode())
    if (!walker.currentNode.parentElement?.closest('[contenteditable="false"]'))
      nodes.push(walker.currentNode as Text);
  /** Real range geometry is observed after source corrections have settled. */
  const range = document.createRange();
  range.setStart(nodes[0], 0);
  range.setEnd(nodes.at(-1)!, nodes.at(-1)!.length);
  /** Native glyph transforms change horizontal shape while keeping its original vertical metrics. */
  const rect = range.getBoundingClientRect(),
    glyph = root.querySelector("[data-width-ratio]")?.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    glyph: glyph
      ? {
          width: glyph.width,
          height: glyph.height,
          fontSize: getComputedStyle(root.querySelector("[data-width-ratio]")!)
            .fontSize,
          verticalScale: (
            root.querySelector("[data-width-ratio]") as SVGGraphicsElement
          ).getCTM()!.d,
        }
      : null,
  };
}

/**
 * Measure actual authored foreground ink in an unchanged renderer screenshot.
 *
 * Fixed source-blue thresholds exclude neutral page borders and black caret
 * pixels. Decoding never rescales, aligns or edits the original PNG bytes.
 * @async
 * @param {string} base64 - Complete original editor screenshot bytes.
 * @returns {Promise<{height:number;pixels:number;left:number}>} Actual foreground ink height, area and left edge.
 * @example
 * // Half-width glyphs retain ink height while their painted area decreases.
 */
async function widthInk(
  base64: string,
): Promise<{ height: number; pixels: number; left: number }> {
  /** Original PNG dimensions and source coordinates remain untouched. */
  const image = new Image();
  image.src = "data:image/png;base64," + base64;
  await image.decode();
  /** Canvas only inspects the complete unmodified screenshot. */
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  /** Exact source-blue ink remains independent of metadata and SVG attribute names. */
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  /** Actual raster ink bounds expose unwanted vertical glyph scaling. */
  const bytes = context.getImageData(0, 0, image.width, image.height).data;
  let top = image.height,
    bottom = -1,
    left = image.width,
    pixels = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    if (
      bytes[index] < 80 &&
      bytes[index + 1] > 20 &&
      bytes[index + 1] < 110 &&
      bytes[index + 2] > 50 &&
      bytes[index + 2] < 150 &&
      bytes[index + 2] > bytes[index + 1] &&
      bytes[index + 1] > bytes[index]
    ) {
      /** Literal device-pixel coordinates are counted without changing the image. */
      const y = Math.floor(index / 4 / image.width);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left,(index/4)%image.width);
      pixels++;
    }
  }
  return { height: Math.max(0, bottom - top + 1), pixels, left };
}

/**
 * Verify native width validation, cancel, real geometry, source editing and undo.
 *
 * Logical source advances and real painted glyph widths both change while the
 * font height stays fixed. Native Home, arrows and typing cannot enter SVG.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after actual GUI, geometry and source checks.
 * @example
 * // Fifty-percent width halves M advances without shrinking their height.
 */
async function verifyWidthEditing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadWidth(page);
  /** Baseline geometry comes from the original unscaled source. */
  const baseline = await page.locator(".tiptap").evaluate(widthGeometry);
  await openWidth(page);
  await expect(page.locator('[name="scale"]')).toBeEditable();
  await page.locator('[name="scale"]').fill("49");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator('[name="scale"]').fill("50");
  await expect(
    page.locator('.nd-character-sample [data-width-ratio="50"]').first(),
  ).toBeAttached();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(page.locator(".tiptap [data-forhan-width-ratio]")).toHaveCount(
    0,
  );
  await openWidth(page);
  await page.locator('[name="scale"]').fill("50");
  await page.locator('[data-character-tab="expanded"]').click();
  await page.locator('[name="font-space"]').check();
  await page.getByRole('combobox',{name:'외곽선',exact:true}).click();
  await page.getByRole('option',{name:'점선 외곽선',exact:true}).click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.tiptap [data-width-ratio="50"]')).toHaveCount(8);
  /** Settled source geometry retains the exact authored font height. */
  const half = await page.locator(".tiptap").evaluate(widthGeometry);
  expect(half.width / baseline.width).toBeCloseTo(0.5, 2);
  expect(half.height).toBeCloseTo(baseline.height, 3);
  await page.locator(".tiptap").press(DOCUMENT_START_KEY);
  await page.locator(".tiptap").press("ArrowRight");
  await page.locator(".tiptap").pressSequentially("C");
  /** One real typed character changes the authored source and never edits drawing text. */
  const typed = JSON.parse((await saveWidth(page, "forhan")).toString("utf8"));
  expect(widthSourceText(typed.doc)).toBe("MCMMMMMMM");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  /** Native export retains source percentages after the single typing undo. */
  const binary = readHwp(await saveWidth(page, "hwp"));
  expect(widthSourceText(binary.doc)).toBe("MMMMMMMM");
  for (/** Native source values are identified independently of mark order. */ const mark of binary
    .doc.content![0].content![0].marks!)
    if (mark.type === "textStyle"){
      expect(
        characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio,
      ).toEqual([50, 50, 50, 50, 50, 50, 50]);
      expect(mark.attrs!.nativeUseFontSpace).toBe(true);
      expect(mark.attrs!.nativeOutlineType).toBe(2);
    }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap [data-forhan-width-ratio]")).toHaveCount(
    0,
  );
  await expect(page.locator('.tiptap [data-forhan-use-font-space="1"]')).toHaveCount(0);
  await expect(page.locator('.tiptap [data-forhan-outline="2"]')).toHaveCount(0);
  await page.locator(".tiptap").press("Alt+Shift+j");
  await expect(page.locator('.tiptap [data-width-ratio="99"]')).toHaveCount(8);
  await page.locator(".tiptap").press("Alt+Shift+k");
  await expect(page.locator(".tiptap [data-forhan-width-ratio]")).toHaveCount(
    0,
  );
}
test(
  "native width dialog changes real glyph geometry and preserves typing, cancellation and undo",
  verifyWidthEditing,
);

/**
 * Verify proportional tracking, native word wrapping and complete source text.
 *
 * The same glyphs are rendered at full and half width with tracking enabled.
 * A narrow paragraph keeps native source break opportunities and all characters.
 * @async
 * @param {{page:Page}} context - Owned renderer bindings.
 * @returns {Promise<void>} Resolves after actual source, glyph and wrapping checks.
 * @example
 * // Twenty-percent tracking scales glyph advance rather than adding a font-size gap.
 */
async function verifyWidthLayout({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadWidth(page, 100, 20);
  await expect(page.locator('.tiptap [data-width-ratio="100"]')).toHaveCount(8);
  /** Independent full-width geometry supplies the scaling reference. */
  const full = await page.locator(".tiptap").evaluate(widthGeometry);
  /** An actual full-width raster supplies an independent painted-shape reference. */
  const fullInk = await page.evaluate(
    widthInk,
    (await page.locator(".tiptap").screenshot({ caret: "hide" })).toString(
      "base64",
    ),
  );
  await loadWidth(page, 50, 20);
  await expect(page.locator('.tiptap [data-width-ratio="50"]')).toHaveCount(8);
  /** Actual source and actual painted shape must both scale horizontally. */
  const half = await page.locator(".tiptap").evaluate(widthGeometry);
  expect(half.width / full.width).toBeCloseTo(0.5, 2);
  expect(half.glyph!.width / full.glyph!.width).toBeCloseTo(0.5, 3);
  expect(half.height).toBeCloseTo(full.height, 3);
  expect(half.glyph!.fontSize).toBe(full.glyph!.fontSize);
  expect(half.glyph!.verticalScale).toBe(full.glyph!.verticalScale);
  /** SVG text bounding boxes can vary below one pixel with font hinting; actual ink checks physical height. */
  const halfInk = await page.evaluate(
    widthInk,
    (await page.locator(".tiptap").screenshot({ caret: "hide" })).toString(
      "base64",
    ),
  );
  expect(fullInk.pixels).toBeGreaterThan(100);
  expect(Math.abs(halfInk.height - fullInk.height)).toBeLessThanOrEqual(1);
  expect(halfInk.pixels / fullInk.pixels).toBeGreaterThan(0.35);
  expect(halfInk.pixels / fullInk.pixels).toBeLessThan(0.65);
  await page.addStyleTag({ content: ".tiptap p{width:180px}" });
  await loadWidth(page, 75, 0, "가나다라마바사 ABCDEFGHIJKLMN é 👩‍💻");
  await expect(
    page.locator('.tiptap [data-width-ratio="75"]').first(),
  ).toBeAttached();
  await expect(page.locator('.tiptap svg text[data-width-ratio="75"]').filter({hasText:'👩‍💻'})).toHaveCount(1);
  await expect(page.locator('.tiptap svg text[data-width-ratio="75"]').filter({hasText:'é'})).toHaveCount(1);
  /** Several actual source lines retain every complete source grapheme. */
  await expect.poll(
    /**
     * Observe actual painted wrapping after dependent native source drawing settles.
     *
     * Paper flow and native glyph drawing can finish in successive rendering
     * frames. The expected result remains actual multi-line source geometry.
     * @async
     * @returns {Promise<number>} Number of actual distinct painted source rows.
     * @example
     * // Original source still wraps into more than two actual glyph rows.
     */
    async()=>page
    .locator('.tiptap [data-width-ratio="75"]')
    .evaluateAll(
      /**
       * Count real rendered glyph rows after native horizontal wrapping.
       *
       * This reads original glyph bounds without mutating source or drawing.
       * @param {Element[]} elements - Actual native width glyph drawings.
       * @returns {number} Number of distinct painted line rows.
       * @example
       * // A long Latin word can still wrap rather than becoming an atomic inline block.
       */
      (elements) => {
        /** Shared first-line top values are grouped without changing their geometry. */
        const rows = new Set<number>();
        for (/** Every complete grapheme owns one original source interval. */ const element of elements)
          rows.add(Math.round(element.getBoundingClientRect().top / 5));
        return rows.size;
      },
    )).toBeGreaterThan(2);
  /** Actual source output proves SVG never duplicates the original text. */
  const saved = JSON.parse((await saveWidth(page, "forhan")).toString("utf8"));
  expect(widthSourceText(saved.doc)).toBe("가나다라마바사 ABCDEFGHIJKLMN é 👩‍💻");
}
test(
  "native widths and proportional tracking preserve actual glyph height and ordinary line breaks",
  verifyWidthLayout,
);

/**
 * Verify independent language width drafts and native/HTML source round trips.
 *
 * A language-specific width edit must not flatten a neighboring script. Retained
 * native zero width stays valid when the user leaves that original value alone.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after actual native files and HTML reimport agree.
 * @example
 * // Hangul can remain half width while Latin becomes one-and-a-half width.
 */
async function verifyWidthLanguages({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadWidth(page, 100, 0, "한글 ABC");
  await openWidth(page);
  await page.locator('[name="language"]').selectOption("0");
  await page.locator('[name="scale"]').fill("50");
  await page.locator('[name="language"]').selectOption("1");
  await page.locator('[name="scale"]').fill("150");
  await page.locator('[name="language"]').selectOption("0");
  await expect(page.locator('[name="scale"]')).toHaveValue("50");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.tiptap [data-width-ratio="50"]')).toHaveCount(2);
  await expect(page.locator('.tiptap [data-width-ratio="150"]')).toHaveCount(3);
  for (/** Production native writers retain every independent language slot. */ const format of [
    "hwp",
    "hwpx",
  ] as const) {
    /** Real output bytes are decoded independently of DOM metadata. */
    const bytes = await saveWidth(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    for (/** All native text runs retain the same complete source measurement table. */ const run of parsed
      .doc.content![0].content!)
      for (/** Mark order does not define native width identity. */ const mark of run.marks ||
        [])
        if (mark.type === "textStyle")
          expect(mark.attrs!.nativeCharacterMetrics.ratio).toEqual([
            50, 150, 100, 100, 100, 100, 100,
          ]);
  }
  await saveWidth(page, "forhan");
  /** Standalone HTML carries original source metadata alongside inaccessible width drawings. */
  const html = await saveWidth(page, "html");
  await page
    .locator("#file-input")
    .setInputFiles({ name: "width.html", mimeType: "text/html", buffer: html });
  await expect(page.locator('.tiptap [data-width-ratio="50"]')).toHaveCount(2);
  await expect(page.locator('.tiptap [data-width-ratio="150"]')).toHaveCount(3);
  /** HTML reimport must retain the source text exactly once. */
  const saved = JSON.parse((await saveWidth(page, "forhan")).toString("utf8"));
  expect(widthSourceText(saved.doc)).toBe("한글 ABC");
  await loadWidth(page, 0);
  await openWidth(page);
  await expect(page.locator('[name="scale"]')).toHaveValue("0");
  await page.locator('[data-modal-value="apply"]').click();
  /** Legacy zero is storage data rather than a newly accepted ordinary UI value. */
  const legacy = await readHwpx(await saveWidth(page, "hwpx"));
  for (/** Unchanged zero width is never clamped to the interactive minimum. */ const mark of legacy
    .doc.content![0].content![0].marks!)
    if (mark.type === "textStyle")
      expect(mark.attrs!.nativeCharacterMetrics.ratio).toEqual([
        0, 0, 0, 0, 0, 0, 0,
      ]);
}
test(
  "native width language drafts and legacy values survive real native and HTML output",
  verifyWidthLanguages,
);

/**
 * Scale tracked contextual glyphs while retaining their shape, height and native source arrays.
 *
 * One coherent original SVG text retains Arabic contextual shaping at both
 * tracked widths. Independent source geometry and original foreground pixels
 * verify horizontal scaling without changing the physical glyph height.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after original raster geometry and native source data agree.
 * @example
 * // A tracked Arabic word narrows without turning into isolated visible letters.
 */
async function verifyTrackedContextualRatio({page}:{page:Page}):Promise<void>{
  await page.goto('/');await loadWidth(page,100,20,'العربية');
  await expect(page.locator('.tiptap svg text[data-context-width="100"]')).toHaveText('العربية');
  await expect(page.locator('#toast')).toBeHidden();
  /** Original complete-word source bounds and unchanged foreground pixels establish independent physical references. */
  const original=await page.locator('.tiptap').evaluate(widthGeometry),beforeBox=(await page.locator('.tiptap p').boundingBox())!,before=await page.screenshot({caret:'hide'}),
    originalInk=await page.evaluate(contextualInk,{image:before.toString('base64'),left:beforeBox.x-20,top:beforeBox.y-20,right:beforeBox.x+beforeBox.width+20,bottom:beforeBox.y+beforeBox.height+20});
  await loadWidth(page,50,20,'العربية');
  await expect(page.locator('.tiptap [data-forhan-width-ratio]')).toHaveCount(0);
  await expect(page.locator('.tiptap svg text[data-context-width="50"]')).toHaveText('العربية');
  await expect(page.locator('#toast')).toBeHidden();
  /** Actual decoded original pixels retain vertical shape while their horizontal foreground coverage changes. */
  const geometry=await page.locator('.tiptap').evaluate(widthGeometry),afterBox=(await page.locator('.tiptap p').boundingBox())!,after=await page.screenshot({caret:'hide'}),
    actualInk=await page.evaluate(contextualInk,{image:after.toString('base64'),left:afterBox.x-20,top:afterBox.y-20,right:afterBox.x+afterBox.width+20,bottom:afterBox.y+afterBox.height+20});
  expect(Math.abs(geometry.width-original.width*.5)).toBeLessThan(.2);
  expect(geometry.height).toBeCloseTo(original.height,1);
  expect(Math.abs(actualInk.height-originalInk.height)).toBeLessThanOrEqual(CONTEXTUAL_INK_EDGE_TOLERANCE);
  expect(actualInk.coverage/originalInk.coverage).toBeGreaterThan(.4);
  expect(actualInk.coverage/originalInk.coverage).toBeLessThan(.6);
  /** Actual native output preserves explicit width and tracking independently of drawing-only source cells. */
  const parsed=await readHwpx(await saveWidth(page,'hwpx'));
  expect(widthSourceText(parsed.doc)).toBe('العربية');
  for(/** Every native language retains its explicit original source measurements. */const mark of parsed.doc.content![0].content![0].marks!)if(mark.type==='textStyle'){
    expect(characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio).toEqual(Array(7).fill(50));
    expect(characterMetrics(mark.attrs!.nativeCharacterMetrics).spacing).toEqual(Array(7).fill(20));
  }
}

test('tracked contextual widths preserve coherent glyphs, physical height and exact native source arrays',verifyTrackedContextualRatio);

/**
 * Verify coherent contextual word ratios against actual source and raster geometry.
 *
 * Complete original strings preserve required ligatures and combining marks;
 * only horizontal shape/advance changes. Each ordinary ratio must retain the
 * original native font height and produce coherent complete-word SVG text.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after source, glyph and native output checks pass.
 * @throws {Error} If a word becomes isolated letters, loses source text or changes physical height.
 * @example
 * // Arabic, Indic and Thai words narrow without turning into isolated source characters.
 */
async function verifyContextualRatios({page}:{page:Page}):Promise<void> {
  await page.goto('/');
  for (
    /** Required ligatures and original script marks remain inside coherent word text. */
    const text of ['العربية','لا','سَلَام','हिन्दी','বাংলা','ภาษา']
  ) {
    await loadWidth(page,100,0,text);
    /** Original browser source geometry and actual foreground pixels provide independent references. */
    const original = await page.locator('.tiptap').evaluate(widthGeometry), originalBox = (await page.locator('.tiptap p').boundingBox())!, originalRaster = await page.screenshot({caret:'hide'}), originalInk = await page.evaluate(contextualInk,{image:originalRaster.toString('base64'),left:originalBox.x-20,top:originalBox.y-20,right:originalBox.x+originalBox.width+20,bottom:originalBox.y+originalBox.height+20});
    for (
      /** Each normal ratio keeps the same installed font and physical point height. */
      const ratio of [50,75,150,200]
    ) {
      await loadWidth(page,ratio,0,text);
      await expect(page.locator('.tiptap [data-forhan-context-ratio]')).toHaveCount(1);
      await expect(page.locator('.tiptap svg text[data-context-width]')).toHaveText(text);
      /** Real transformed source bounds must scale horizontally while original font height remains fixed. */
      const geometry = await page.locator('.tiptap').evaluate(widthGeometry), actualBox = (await page.locator('.tiptap p').boundingBox())!, raster = await page.screenshot({caret:'hide'}), ink = await page.evaluate(contextualInk,{image:raster.toString('base64'),left:actualBox.x-20,top:actualBox.y-20,right:actualBox.x+actualBox.width+20,bottom:actualBox.y+actualBox.height+20});
      expect(Math.abs(geometry.width-original.width*ratio/100)).toBeLessThan(0.2);
      expect(geometry.height).toBeCloseTo(original.height,1);
      if (Math.abs(ink.height-originalInk.height)>CONTEXTUAL_INK_EDGE_TOLERANCE || ink.coverage < originalInk.coverage*ratio/100*0.8 || ink.coverage > originalInk.coverage*ratio/100*1.2) {
        await test.info().attach('original-context.png',{body:originalRaster,contentType:'image/png'});
        await test.info().attach('actual-context.png',{body:raster,contentType:'image/png'});
        await test.info().attach('actual-context.html',{body:await page.locator('.tiptap').innerHTML(),contentType:'text/html'});
      }
      expect(Math.abs(ink.height-originalInk.height),`${text} at ${ratio}% must retain ink height: original=${originalInk.height}, actual=${ink.height}`).toBeLessThanOrEqual(CONTEXTUAL_INK_EDGE_TOLERANCE);
      expect(ink.coverage,`${text} at ${ratio}% must retain proportional ink coverage: original=${originalInk.coverage}`).toBeGreaterThan(originalInk.coverage*ratio/100*0.8);
      expect(ink.coverage,`${text} at ${ratio}% must retain proportional ink coverage: original=${originalInk.coverage}`).toBeLessThan(originalInk.coverage*ratio/100*1.2);
      /** Actual production output retains source text and every independent native ratio slot. */
      const parsed = await readHwpx(await saveWidth(page,'hwpx'));
      expect(widthSourceText(parsed.doc)).toBe(text);
      for (
        /** Source formats never receive generated bidi markers or drawing containers. */
        const run of parsed.doc.content![0].content!
      ) for (
        /** Original measurement arrays remain source data independent of the word drawing. */
        const mark of run.marks || []
      ) if(mark.type==='textStyle') expect(characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio).toEqual(Array(7).fill(ratio));
    }
  }
  for (
    /** Imported native byte-domain values are preserved independently of interactive entry bounds. */
    const ratio of [0,255]
  ) {
    await loadWidth(page,ratio,0,'العربية');
    await expect(page.locator('.tiptap [data-forhan-context-ratio]')).toHaveAttribute('data-forhan-context-ratio',String(ratio));
    if(ratio===0)await expect(page.locator('.tiptap svg g[data-context-width="0"]')).toHaveCount(1);
    /** Actual output must not clamp imported original native width values. */
    const parsed=await readHwpx(await saveWidth(page,'hwpx'));
    expect(widthSourceText(parsed.doc)).toBe('العربية');
    for(
      /** Complete native source arrays retain every original imported byte-domain value. */
      const mark of parsed.doc.content![0].content![0].marks || []
    )if(mark.type==='textStyle')expect(characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio).toEqual(Array(7).fill(ratio));
  }
}

test('coherent contextual words retain native horizontal ratios, real glyph height and original source',verifyContextualRatios);

/**
 * Verify coherent bidi word order, original source editing and actual HTML round trips.
 *
 * Physical clicks and drags operate on original source positions. Partial
 * selections repaint coherent words through clipping; neither selected text
 * nor Latin input can turn the remaining Arabic into isolated glyphs.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after real source input, undo and static output checks pass.
 * @throws {Error} If source order, bidi placement or a saved original string differs.
 * @example
 * // A right-edge click inserts before the Arabic word while neighboring numbers remain unchanged.
 */
async function verifyContextualEditing({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Original mixed source contains two distinct Arabic words and an independent numeric run. */
  const original='ABC العربية جميلة 123 한글';
  await loadWidth(page,75,0,original);
  await expect(page.locator('.tiptap [data-forhan-context-ratio]')).toHaveCount(2);
  /** Real original source boxes must retain the browser's Arabic word order. */
  const boxes=await page.locator('.tiptap').evaluate(contextualPositions,['العربية','جميلة','123']);
  expect(boxes[0].left).toBeGreaterThan(boxes[1].right);
  expect(boxes[1].left).toBeGreaterThan(boxes[2].right);
  await page.mouse.click(boxes[0].right-1,boxes[0].top+boxes[0].height/2);await page.keyboard.type('Z');
  /** Real source save proves the click mapped to the original logical Arabic boundary. */
  const inserted=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(inserted.doc)).toBe('ABC Zالعربية جميلة 123 한글');
  await expect(page.locator('.tiptap [data-forhan-context-ratio]')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  /** A complete coherent word remains available after one authored undo. */
  const restored=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(restored.doc)).toBe(original);
  /** A physical source drag selects the first two original Arabic letters. */
  const first=(await page.locator('.tiptap').evaluate(contextualPositions,['العربية']))[0],partial=(await page.locator('.tiptap').evaluate(contextualPositions,['ال']))[0];
  await page.mouse.move(first.right-1,first.top+first.height/2);await page.mouse.down();await page.mouse.move(partial.left+0.25,partial.top+partial.height/2,{steps:10});await page.mouse.up();
  await expect(page.locator('.tiptap svg text[data-context-width="75"][fill="#ffffff"]')).toHaveText('العربية');
  await expect(page.locator('.tiptap svg clipPath')).toHaveCount(1);
  await page.keyboard.type('Q');
  /** The actual serializer must retain the unselected Arabic suffix and every neighboring source run. */
  const changed=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(changed.doc)).toBe('ABC Qعربية جميلة 123 한글');
  await page.keyboard.press('ControlOrMeta+z');await saveWidth(page,'forhan');
  /** Static HTML uses the same coherent source containers and no generated control characters. */
  const html=await saveWidth(page,'html'),output=await page.context().newPage();
  try{
    await output.setContent(html.toString('utf8'));
    await expect(output.locator('[data-forhan-context-ratio]')).toHaveCount(2);
    await expect(output.locator('svg text[data-context-width="75"]')).toHaveCount(2);
    /** Original source ranges retain the same semantic bidi word order in static output. */
    const staticBoxes=await output.locator('body').evaluate(contextualPositions,['العربية','جميلة','123']);
    expect(staticBoxes[0].left).toBeGreaterThan(staticBoxes[1].right);expect(staticBoxes[1].left).toBeGreaterThan(staticBoxes[2].right);
  }finally{await output.close();}
  await page.locator('#file-input').setInputFiles({name:'coherent-width.html',mimeType:'text/html',buffer:html});
  await expect(page.locator('#toast')).toContainText('coherent-width.html');
  /** Reimport retains original source exactly once after inaccessible drawings are removed. */
  const reimported=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(reimported.doc)).toBe(original);
}

test('coherent contextual widths retain bidi order through physical source editing, undo and actual HTML',verifyContextualEditing);

/**
 * Verify independent coherent selection masks across actual original paragraphs.
 *
 * A real source drag partially selects two different contextual words. Each
 * paragraph's clip and shadow-exclusion mask must address its own SVG rather
 * than another paragraph's identically named definition. Actual typing merges
 * the selected source interval and one undo restores both original paragraphs.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after physical selection, source replacement and undo pass.
 * @throws {Error} If source range identity or independent drawing definitions differ.
 * @example
 * // A cross-paragraph Arabic selection never reuses another paragraph's clip rectangle.
 */
async function verifyContextualParagraphSelection({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Separate original paragraphs retain independent coherent glyph contexts. */
  const words=['العربية','جميلة'],content:JSONContent[]=[];
  for(
    /** Native source width remains independent of original paragraph identity. */
    const text of words
  )content.push({type:'paragraph',attrs:{textAlign:'left'},content:[{type:'text',text,marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'32pt',nativeCharacterMetrics:{ratio:Array(7).fill(75),spacing:Array(7).fill(0),relativeSize:Array(7).fill(100),offset:Array(7).fill(0)}}}]}]});
  await page.locator('#file-input').setInputFiles({name:'coherent-paragraph-selection.forhan',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content}}))});
  await expect(page.locator('#toast')).toContainText('coherent-paragraph-selection.forhan');
  await expect(page.locator('.tiptap svg text[data-context-width]')).toHaveCount(2);
  /** Original internal caret rectangles provide actual physical drag endpoints. */
  const start=await page.locator('.tiptap p').nth(0).evaluate(contextualCaret,2),end=await page.locator('.tiptap p').nth(1).evaluate(contextualCaret,3);
  await page.mouse.move(start.left+0.125,start.top+start.height/2);await page.mouse.down();await page.mouse.move(end.left+0.125,end.top+end.height/2,{steps:12});await page.mouse.up();
  await expect(page.locator('.tiptap svg mask')).toHaveCount(2);
  /** Real document-wide identifiers must resolve independently for each owning paragraph. */
  const ids=await page.locator('.tiptap svg mask').evaluateAll(
    /**
     * Read actual generated definition identities from the rendered document.
     *
     * Document-wide URL references cannot distinguish duplicated element IDs.
     * @param {Element[]} masks - Actual paragraph-owned SVG mask elements.
     * @returns {string[]} Literal generated mask identifiers.
     * @example
     * // Partial words in two source paragraphs require two distinct definitions.
     */
    masks=>{
      /** Literal generated identities are read independently of source selection metadata. */
      const ids:string[]=[];
      for(
        /** Each original paragraph owns its actual document-wide definition. */
        const mask of masks
      )ids.push(mask.id);
      return ids;
    },
  );
  expect(new Set(ids).size).toBe(2);
  await page.keyboard.type('Q');
  /** Actual source output proves the physical selection excluded both unselected word fragments. */
  const saved=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(saved.doc.content).toHaveLength(1);expect(widthSourceText(saved.doc)).toBe('الQلة');
  await page.keyboard.press('ControlOrMeta+z');
  /** One authored undo restores both original paragraphs without retaining a drawing-only history step. */
  const restored=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(restored.doc.content).toHaveLength(2);expect(widthSourceText(restored.doc)).toBe(words.join(''));
}

test('coherent contextual partial selections retain independent paragraph drawings and one source undo',verifyContextualParagraphSelection);

/**
 * Verify independent native effects on a coherently scaled marked Arabic word.
 *
 * Selection must retain a complete required-ligature drawing while changing
 * only foreground/shadow presentation. Both actual native output formats keep
 * the original word, width arrays, outline, shadow, shading and underline data.
 * @async
 * @param {{page:Page}} context - Actual owned renderer.
 * @returns {Promise<void>} Resolves after coherent effect rendering and independent output reads pass.
 * @throws {Error} If a source effect is dropped or the word is redrawn as isolated fragments.
 * @example
 * // An outlined selected lam-alef word retains its source shadow after the selection collapses.
 */
async function verifyContextualEffects({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Independent native fields must survive one coherent whole-word horizontal ratio. */
  const text='سَلَام',attrs={fontFamily:'Arial',fontSize:'32pt',color:'#123456',backgroundColor:'#faf3db',nativeOutlineType:3,nativeShadowType:'DROP',nativeShadowOffsetX:20,nativeShadowOffsetY:-10,nativeShadowColor:'#c00000',nativeEmphasisType:1,nativeCharacterMetrics:{ratio:Array(7).fill(75),spacing:Array(7).fill(0),relativeSize:Array(7).fill(100),offset:Array(7).fill(0)}};
  await page.locator('#file-input').setInputFiles({name:'coherent-effects.forhan',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text,marks:[{type:'textStyle',attrs},{type:'underline',attrs:{nativePosition:'TOP',nativePattern:11,nativeColor:'#654321'}}]}]}]}}))});
  await expect(page.locator('#toast')).toContainText('coherent-effects.forhan');
  /** The complete original marked word owns one coherent contour rather than isolated glyph fragments. */
  const glyph=page.locator('.tiptap svg text[data-context-width="75"]');
  await expect(glyph).toHaveText(text);await expect(glyph).toHaveAttribute('data-outline-kind','3');await expect(glyph).toHaveAttribute('stroke-width','2');await expect(glyph).toHaveAttribute('vector-effect','non-scaling-stroke');
  await expect(glyph).toHaveCSS('text-shadow',/192, 0, 0/);
  await expect(page.locator('.tiptap svg g[data-emphasis-kind="1"]')).not.toHaveCount(0);
  await page.locator('.tiptap').press('ControlOrMeta+a');
  await expect(glyph).toHaveAttribute('stroke','#ffffff');await expect(glyph).toHaveCSS('text-shadow','none');
  await page.locator('.tiptap').press(DOCUMENT_START_KEY);await expect(glyph).toHaveCSS('text-shadow',/192, 0, 0/);
  for(
    /** Both native formats are inspected independently after their real GUI output path. */
    const format of ['hwp','hwpx'] as const
  ){
    /** Production bytes retain original source, not the selection color or drawing-only markers. */
    const bytes=await saveWidth(page,format),parsed=format==='hwp'?readHwp(bytes):await readHwpx(bytes);
    expect(widthSourceText(parsed.doc)).toBe(text);
    for(
      /** Every original script run keeps independent unedited effects. */
      const run of parsed.doc.content![0].content!
    ){
      for(
        /** Drawing foreground changes cannot become saved original character preferences. */
        const mark of run.marks || []
      ){
        if(mark.type==='textStyle'){
          expect(mark.attrs).toMatchObject({nativeOutlineType:3,nativeShadowType:'DROP',nativeShadowOffsetX:20,nativeShadowOffsetY:-10,nativeShadowColor:'#c00000',nativeEmphasisType:1,backgroundColor:'#faf3db'});
          expect(characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio).toEqual(Array(7).fill(75));
        }else if(mark.type==='underline')expect(mark.attrs).toMatchObject({nativePosition:'TOP',nativePattern:11,nativeColor:'#654321'});
      }
    }
  }
}

test('coherent contextual widths preserve native outlines, shadows, emphasis and independent native outputs',verifyContextualEffects);

/**
 * Verify original paragraph anchors stay independent of coherent source-word internals.
 *
 * Paragraph alignment, first-line indentation and margins apply to the actual
 * outer text flow once. Atomic source containers must not inherit another copy
 * of those paragraph-level indentation or justification instructions.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after actual indented source anchors remain correct.
 * @throws {Error} If changing word width repeats paragraph indentation or displaces the aligned source anchor.
 * @example
 * // A 150-percent Arabic word cannot move into the preceding margin or repeat the paragraph indent.
 */
async function verifyContextualParagraphAnchors({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  for(
    /** RTL and LTR joining words retain their original native paragraph anchors. */
    const text of ['العربية','हिन्दी']
  )for(
    /** Paragraph modes retain their independent first-line and margin geometry. */
    const align of ['left','right','center','justify']
  ){
    /** Literal source point values are not injected as generated word styles. */
    const attrs={textAlign:align,textIndent:'12pt',marginLeft:'9pt',marginRight:'7pt'};
    await loadWidth(page,100,0,text,attrs);
    /** Real original source coordinates provide the independent paragraph alignment anchor. */
    const original=(await page.locator('.tiptap').evaluate(contextualPositions,[text]))[0];
    for(
      /** Narrow and wide word geometry must apply paragraph indentation only once. */
      const ratio of [75,150]
    ){
      await loadWidth(page,ratio,0,text,attrs);
      await expect(page.locator('.tiptap svg text[data-context-width]')).toHaveAttribute('data-context-width',String(ratio));
      /** Actual source positions must preserve the corresponding original alignment edge or center. */
      const actual=(await page.locator('.tiptap').evaluate(contextualPositions,[text]))[0],before=align==='right'?original.right:align==='center'?(original.left+original.right)/2:original.left,after=align==='right'?actual.right:align==='center'?(actual.left+actual.right)/2:actual.left;
      expect(Math.abs(after-before),`${text}, ${align}, ${ratio}% must apply original paragraph indentation once`).toBeLessThan(0.2);
    }
  }
}

test('coherent contextual source anchors preserve paragraph alignment and apply original indentation once',verifyContextualParagraphAnchors);

/**
 * Verify original unselected contours survive a partial selection far down a tall paragraph.
 *
 * Real hard breaks place the last source word beyond ten thousand paragraph
 * pixels. Physical source selection must leave the remaining original glyphs
 * visible rather than clipping them to a fixed drawing extent.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after original unselected ink remains visible.
 * @throws {Error} If a genuine partial selection erases the unselected source contours.
 * @example
 * // Selecting letters on the sixtieth line retains the remaining Arabic word.
 */
async function verifyTallContextualSelection({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Actual original hard breaks retain one paragraph coordinate frame. */
  const content:JSONContent[]=[];
  for(let line=0;line<60;line++){
    if(line)content.push({type:'hardBreak'});
    content.push({type:'text',text:'العربية',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'100pt',color:'#000000',nativeCharacterMetrics:{ratio:Array(7).fill(75),spacing:Array(7).fill(0),relativeSize:Array(7).fill(100),offset:Array(7).fill(0)}}}]});
  }
  await page.locator('#file-input').setInputFiles({name:'tall-contextual-selection.forhan',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph',attrs:{textAlign:'left',lineHeight:'1.6'},content}]}}))});
  await expect(page.locator('.tiptap svg text[data-context-width]')).toHaveCount(60);
  /** Actual final source geometry determines scrolling and physical pointer endpoints. */
  const last=page.locator('.tiptap [data-forhan-context-source]').last();
  await last.scrollIntoViewIfNeeded();
  /** Internal caret positions belong to the last original word, never its drawing clone. */
  const start=await last.evaluate(contextualCaret,2),end=await last.evaluate(contextualCaret,3);
  await page.mouse.move(start.left+0.125,start.top+start.height/2);await page.mouse.down();await page.mouse.move(end.left+0.125,end.top+end.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('.tiptap svg mask')).toHaveCount(1);
  /** Original full-viewport pixels retain their actual coordinates without registration or resampling. */
  const box=(await last.boundingBox())!,png=await page.screenshot({caret:'hide'}),pixels=await page.evaluate(
    /**
     * Count original dark foreground inside the actual last source word bounds.
     *
     * White selected contours and the native blue selection background cannot
     * pass the dark-ink threshold. The original viewport PNG remains unchanged.
     * @async
     * @param {{image:string;box:{x:number;y:number;width:number;height:number}}} source - Original screenshot and actual source bounds.
     * @returns {Promise<number>} Original unselected dark foreground pixel count.
     * @example
     * // An erased unselected word has no surviving dark glyph pixels.
     */
    async(source:{image:string;box:{x:number;y:number;width:number;height:number}}):Promise<number>=>{
      /** Canvas decoding observes the complete original PNG at its original resolution. */
      const image=new Image();image.src='data:image/png;base64,'+source.image;await image.decode();
      /** Source geometry alone bounds pixel observation. */
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      /** The native selection background is excluded by all three foreground channels. */
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
      /** Original raster bytes are never edited to manufacture agreement. */
      const data=context.getImageData(0,0,image.width,image.height).data;
      let count=0;
      for(let y=Math.max(0,Math.floor(source.box.y));y<Math.min(image.height,Math.ceil(source.box.y+source.box.height));y++)for(let x=Math.max(0,Math.floor(source.box.x));x<Math.min(image.width,Math.ceil(source.box.x+source.box.width));x++){
        /** Actual original pixel offset identifies only the current source word. */
        const at=(y*image.width+x)*4;if(Math.max(data[at],data[at+1],data[at+2])<100)count++;
      }
      return count;
    },{image:png.toString('base64'),box});
  expect(pixels,'Partial source selection must preserve the unselected original word contours on the last line').toBeGreaterThan(20);
}

test('coherent contextual partial selections preserve original ink deep inside tall paragraphs',verifyTallContextualSelection);

/**
 * Verify fractional pointer coordinates cannot turn an ordinary source click into a bidi selection.
 *
 * Compatibility mouse events round coordinates while pointer events retain
 * fractions. The same physical click at a contextual word boundary must retain
 * one original source caret through pointer release and subsequent typing.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after real source clicks insert without deleting original words.
 * @throws {Error} If a stationary click selects or replaces an adjacent original bidi word.
 * @example
 * // Typing beside a 150% Arabic word retains all original Arabic letters.
 */
async function verifyContextualFractionalClicks({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  for(/** Real source boundaries retain the same physical input semantics at narrow and wide ratios. */ const ratio of [50,75,150,200]){
    await loadWidth(page,ratio,0,'X العربية Z',{textAlign:'left'});
    await expect(page.locator('.tiptap svg text[data-context-width]')).toHaveAttribute('data-context-width',String(ratio));
    /** Actual original source bounds determine the fractional physical pointer location. */
    const word=(await page.locator('.tiptap').evaluate(contextualPositions,['العربية']))[0];
    await page.mouse.click(word.right-0.5,word.top+word.height/2);await page.keyboard.type('N');
    /** Independent original source output must retain every unselected original Arabic letter. */
    const saved=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
    expect(widthSourceText(saved.doc),`A stationary real source click at ${ratio}% must retain the original word`).toBe('X Nالعربية Z');
  }
}

test('coherent contextual fractional clicks retain one original source caret across pointer release',verifyContextualFractionalClicks);

/**
 * Verify actual Hebrew advances, unchanged glyph height and logical editing.
 *
 * Browser bidi layout owns source positions while complete niqqud graphemes
 * are painted from the right edge. Tracking changes advance independently of
 * outline width. Real native and static HTML exports retain the same source.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after rendered geometry and source operations agree.
 * @throws {Error} If bidi layout, source editing or output loses native measurements.
 * @example
 * // Half-width Hebrew keeps its marks, visual order, caret positions and font height.
 */
async function verifyHebrewWidth({page}:{page:Page}):Promise<void> {
  await page.goto('/');
  /** Complete graphemes include combining niqqud without an extra source character. */
  const text='עִבְרִית';
  await loadWidth(page,100,0,text);
  /** Native-default source geometry and original raster height supply independent references. */
  const original=await page.locator('.tiptap').evaluate(widthGeometry),
    ink=await page.evaluate(widthInk,(await page.locator('.tiptap').screenshot({caret:'hide'})).toString('base64'));
  let paintedWidth:number|undefined;
  for(/** Tracking must change logical advance without multiplying the painted glyph. */const ratio of [50,100,200])
    for(/** Native negative and positive tracking remain independent of bidi ordering. */const tracking of [-20,0,20]){
      if(ratio===100&&tracking===0)continue;
      await loadWidth(page,ratio,tracking,text);
      await expect(page.locator('.tiptap svg text[data-width-ratio]')).toHaveCount(5);
      /** Actual native PDFs retain base-glyph tracking before the terminal zero-advance niqqud mark. */
      const geometry=await page.locator('.tiptap').evaluate(widthGeometry);
      expect(Math.abs(geometry.width-original.width*ratio/100*(1+tracking/100))).toBeLessThan(1);
      expect(geometry.height).toBeCloseTo(original.height,1);
      /** Original browser source boxes must still follow RTL visual order. */
      const boxes=await page.locator('.tiptap forhan-width').evaluateAll(
        /**
         * Read actual source fragments in logical document order.
         *
         * Native width wrappers remain ordinary inline text containers, so their
         * real browser positions prove bidi order without rewriting source text.
         * @param {Element[]} elements - Actual editable grapheme fragments.
         * @returns {number[]} Physical left edges in logical source order.
         * @example
         * // Consecutive Hebrew source graphemes progress toward the left.
         */
        elements=>elements.map(
          /**
           * Observe one original source interval's physical browser position.
           *
           * The measurement excludes the separate inaccessible SVG drawing.
           * @param {Element} element - Actual inline source wrapper.
           * @returns {number} Physical left edge in CSS pixels.
           * @example
           * // The first logical letter has the greatest left coordinate.
           */
          element=>element.getBoundingClientRect().left));
      expect(boxes).toHaveLength(5);
      for(let index=1;index<boxes.length;index++)expect(boxes[index]).toBeLessThan(boxes[index-1]);
      /** SVG bounds are observed independently of the source advance correction. */
      const width=geometry.glyph!.width/ratio;
      if(paintedWidth===undefined)paintedWidth=width;
      else expect(width).toBeCloseTo(paintedWidth,2);
      /** Literal original screenshot pixels detect vertical scaling or missing combining marks. */
      const currentInk=await page.evaluate(widthInk,(await page.locator('.tiptap').screenshot({caret:'hide'})).toString('base64'));
      expect(Math.abs(currentInk.height-ink.height)).toBeLessThanOrEqual(1);
      if(ratio===100)expect(Math.abs(currentInk.left-ink.left)).toBeLessThanOrEqual(1);
    }
  await loadWidth(page,75,20,'ABC עברית 123 한글');
  await expect(page.locator('.tiptap svg text[direction="rtl"]')).toHaveCount(5);
  for(/** Production native output must preserve all source characters and all seven width slots. */const format of ['hwp','hwpx'] as const){
    /** Actual output is parsed independently from live DOM decorations. */
    const bytes=await saveWidth(page,format),parsed=format==='hwp'?readHwp(bytes):await readHwpx(bytes);
    expect(widthSourceText(parsed.doc)).toBe('ABC עברית 123 한글');
    for(/** Every normalized script run retains the same original native definition. */const run of parsed.doc.content![0].content!)
      for(/** Drawing direction never becomes an authored source mark. */const mark of run.marks||[])
        if(mark.type==='textStyle')expect(characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio).toEqual([75,75,75,75,75,75,75]);
  }
  /** A script-free HTML document must paint the same independently scaled RTL glyphs. */
  const html=await saveWidth(page,'html'),output=await page.context().newPage();
  try {
    await output.setContent(html.toString('utf8'));
    await expect(output.locator('svg text[direction="rtl"][data-width-ratio="75"]')).toHaveCount(5);
    expect(await output.locator('script').count()).toBe(0);
  }finally{await output.close();}
  await page.locator('#file-input').setInputFiles({name:'hebrew-width.html',mimeType:'text/html',buffer:html});
  await expect(page.locator('#toast')).toContainText('hebrew-width.html');
  await expect(page.locator('.tiptap svg text[direction="rtl"]')).toHaveCount(5);
  await page.locator('.tiptap').press(DOCUMENT_START_KEY);
  await page.keyboard.type('X');
  /** Source output proves keyboard input remains outside the inaccessible RTL drawing. */
  const edited=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(edited.doc)).toBe('XABC עברית 123 한글');
  await page.keyboard.press('ControlOrMeta+z');
  /** One native undo restores the complete actual source without an extra layout entry. */
  const restored=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(restored.doc)).toBe('ABC עברית 123 한글');
  /** A real pointer enters the first logical Hebrew letter through its right edge. */
  const first=page.locator('.tiptap forhan-width').filter({hasText:'ע'}),bounds=(await first.boundingBox())!;
  await page.mouse.click(bounds.x+bounds.width-1,bounds.y+bounds.height/2);
  await page.keyboard.type('Z');
  /** Browser caret mapping must insert before the RTL word without changing source order. */
  const inserted=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(inserted.doc)).toBe('ABC Zעברית 123 한글');
  await page.keyboard.press('ControlOrMeta+z');
  await first.dblclick();
  await expect(page.locator('.tiptap svg text[direction="rtl"][fill="#ffffff"]')).toHaveCount(5);
  await page.keyboard.type('NEW');
  /** Double-click selection and actual typing replace the original word once, excluding drawings. */
  const replaced=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(replaced.doc)).toBe('ABC NEW 123 한글');
}

test('Hebrew native widths preserve bidi order, niqqud, physical height and source editing',verifyHebrewWidth);

/**
 * Keep rapid committed text in source order after replacing a scaled RTL word.
 *
 * Repeated real pointer selection and individual keyboard events overlap live
 * native drawing updates. Actual serializer output detects caret-affinity races
 * that can otherwise produce NWE from NEW despite correct final glyph geometry.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after source order and one-step undo remain correct in every cycle.
 * @example
 * // A selected Hebrew word becomes NEWTEXT123 rather than reordered native-width letters.
 */
async function verifyWidthTextOrder({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  for(let index=0;index<12;index++){
    /** Each distinct source separates this actual editing cycle from earlier document state. */
    const original=`ABC ${index} עברית 123 한글`,replacement=index%2?'NEWTEXT123':'새원문NEWTEXT';
    await loadWidth(page,75,20,original);
    await expect(page.locator('.tiptap svg text[direction="rtl"]')).toHaveCount(5);
    await page.locator('.tiptap forhan-width').filter({hasText:/^A$/}).click();
    await page.locator('.tiptap forhan-width').filter({hasText:'ע'}).dblclick();
    await expect(page.locator('.tiptap svg text[direction="rtl"][fill="#ffffff"]')).toHaveCount(5);
    await page.keyboard.type(replacement);
    /** Actual source bytes prove every committed character remains in its original keyboard order. */
    const edited=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
    expect(widthSourceText(edited.doc)).toBe(original.replace('עברית',replacement));
    await page.locator('.tiptap').press('ControlOrMeta+z');
    /** Rendering transactions cannot split one continuous source typing action into extra undo steps. */
    const restored=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
    expect(widthSourceText(restored.doc)).toBe(original);
  }
}

test('rapid native-width typing preserves source order after real bidi word replacement',verifyWidthTextOrder);

/**
 * Replace the exact original word selected by a real native-width pointer drag.
 *
 * Actual viewport coordinates include paper zoom and corrected source advances.
 * Production source output detects browser bidi hit tests that select adjacent
 * numbers despite visually dragging across the complete Hebrew source word.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after drag replacement and one source undo agree.
 * @example
 * // Dragging right-to-left across עברית replaces only that original word.
 */
async function verifyWidthDragging({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** The neighboring numeric run exposes the native browser's incorrect bidi caret lookup. */
  const text='ABC עברית 123 한글';
  await loadWidth(page,75,20,text);
  await expect(page.locator('.tiptap svg text[direction="rtl"]')).toHaveCount(5);
  /** Real source boxes supply the two logical word boundaries in physical viewport coordinates. */
  const first=(await page.locator('.tiptap forhan-width').filter({hasText:'ע'}).boundingBox())!,
    last=(await page.locator('.tiptap forhan-width').filter({hasText:'ת'}).boundingBox())!;
  await page.mouse.move(first.x+first.width-1,first.y+first.height/2);
  await page.mouse.down();
  await page.mouse.move(last.x+1,last.y+last.height/2,{steps:12});
  await page.mouse.up();
  await page.keyboard.type('Q');
  /** Actual saved model text remains independent of selection paint or drawing metadata. */
  const edited=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(edited.doc)).toBe('ABC Q 123 한글');
  await page.locator('.tiptap').press('ControlOrMeta+z');
  /** Pointer-only rendering and source selection cannot add an extra authored undo step. */
  const restored=JSON.parse((await saveWidth(page,'forhan')).toString('utf8'));
  expect(widthSourceText(restored.doc)).toBe(text);
}

test('native-width pointer dragging selects original bidi text without adjacent numeric runs',verifyWidthDragging);
