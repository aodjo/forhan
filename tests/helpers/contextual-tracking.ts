import { expect, type Page, type ElectronApplication } from "@playwright/test";
import { characterMetrics } from "../../src/character-metrics.ts";
import { contextualPositions } from "./contextual-width";
import { readFile } from "node:fs/promises";
import { readHwp } from "../../src/formats/hwp.ts";
import { readHwpx } from "../../src/formats/hwpx.ts";
import { contextualSourceText } from "./contextual-width";

/** Literal native Arial32pt PDF matrices retain independently established source-cluster origins. */
const NATIVE_TRACKED_WORDS = [
  {
    word: "العربية",
    rtl: true,
    terminal: false,
    numericEnding: false,
    intervals: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ],
    native: [1563, 1497, 1370, 1214, 1136, 1058, 938],
    z: 1778,
  },
  {
    word: "لا",
    rtl: true,
    terminal: true,
    numericEnding: false,
    intervals: [[0, 2]],
    native: [938],
    z: 1272,
  },
  {
    word: "سَلَام",
    rtl: true,
    terminal: true,
    numericEnding: false,
    intervals: [
      [0, 2],
      [2, 5],
      [5, 6],
    ],
    native: [1238, 1046, 938],
    z: 1568,
  },
  {
    word: "हिन्दी",
    rtl: false,
    terminal: true,
    numericEnding: false,
    intervals: [
      [0, 2],
      [2, 6],
    ],
    native: [965, 1240],
    z: 1776,
  },
  {
    word: "العربية١٢٣",
    rtl: true,
    terminal: false,
    numericEnding: true,
    intervals: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
    ],
    native: [2040, 1974, 1847, 1691, 1613, 1535, 1415, 938, 1106, 1275],
    z: 2255,
  },
];

/** Actual source and coherent painted bounds are independent physical measurements. */
export interface ContextualTrackingGeometry {
  source: { left: number; right: number; top: number; height: number }[];
  paint: { left: number; right: number; baseline: number }[];
  sentinelBaseline: number;
}

/** Public output choices retain canonical FHN filenames independently of the stable portable payload identifier. */
export type TrackedContextFormat = "fhn" | "hwpx" | "hwp" | "html";

/**
 * Measure original source intervals and genuine coherent SVG paint positions.
 *
 * Independent logical source ranges exclude auxiliary drawing text. SVG screen
 * matrices retain actual document zoom and complete original shaping context.
 * @param {HTMLElement} root - Actual attached editable or standalone source root.
 * @param {{word:string;intervals:number[][]}} sample - Original word and independently established native source intervals.
 * @returns {ContextualTrackingGeometry} Original physical source and painted cluster bounds.
 * @throws {Error} If an original interval has no source owner.
 * @example
 * await page.locator('.tiptap').evaluate(contextualTrackingGeometry, sample);
 */
export function contextualTrackingGeometry(
  root: HTMLElement,
  sample: { word: string; intervals: number[][] },
): ContextualTrackingGeometry {
  /** Original paragraph text offsets never include inaccessible contours or generated labels. */
  const document = root.ownerDocument,
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    parts: { node: Text; start: number }[] = [],
    source: ContextualTrackingGeometry["source"] = [],
    paint: ContextualTrackingGeometry["paint"] = [];
  let text = "";
  while (walker.nextNode()) {
    if (
      walker.currentNode.parentElement?.closest('[contenteditable="false"],svg')
    )
      continue;
    parts.push({ node: walker.currentNode as Text, start: text.length });
    text += walker.currentNode.textContent || "";
  }
  /** Original authored Unicode alone establishes word ownership. */
  const begin = text.indexOf(sample.word);
  if (begin < 0) throw new Error("The original contextual source is absent.");
  for (/** Native intervals include complete required ligatures and original combining sequences. */ const [
    from,
    to,
  ] of sample.intervals) {
    /** Genuine current source ranges remain independent of production drawing metadata. */
    const range = document.createRange();
    for (/** Every endpoint belongs to the actual original logical text stream. */ const part of parts) {
      if (
        begin + from >= part.start &&
        begin + from < part.start + part.node.length
      )
        range.setStart(part.node, begin + from - part.start);
      if (
        begin + to > part.start &&
        begin + to <= part.start + part.node.length
      )
        range.setEnd(part.node, begin + to - part.start);
    }
    /** Actual editable bounds include the host's physical source width and baseline. */
    const rect = range.getBoundingClientRect();
    source.push({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      height: rect.height,
    });
  }
  for (/** One coherent full-word text node owns actual contextual paint even after partial source selection. */ const svg of root.querySelectorAll<SVGTextElement>(
    "text[data-context-width]",
  )) {
    if (svg.textContent !== sample.word) continue;
    /** Physical screen transforms retain current source zoom without supplying expected renderer values. */
    const matrix = svg.getScreenCTM()!;
    for (/** Each complete source cluster may contain multiple addressable SVG carets. */ const [
      from,
      to,
    ] of sample.intervals) {
      let left = Infinity,
        right = -Infinity;
      for (let index = from; index < to; index++) {
        /** Actual original glyph endpoints are observed after coherent shaping and tracking. */
        const start = svg.getStartPositionOfChar(index).matrixTransform(matrix),
          end = svg.getEndPositionOfChar(index).matrixTransform(matrix);
        left = Math.min(left, start.x, end.x);
        right = Math.max(right, start.x, end.x);
      }
      paint.push({
        left,
        right,
        baseline: svg.getStartPositionOfChar(from).matrixTransform(matrix).y,
      });
    }
    break;
  }
  let sentinelBaseline = NaN;
  for (/** A separately painted Latin sentinel supplies an independent actual common-line baseline. */ const svg of root.querySelectorAll<SVGTextElement>(
    "text[data-width-ratio]",
  )) {
    if (svg.textContent !== "X") continue;
    sentinelBaseline = svg
      .getStartPositionOfChar(0)
      .matrixTransform(svg.getScreenCTM()!).y;
    break;
  }
  return { source, paint, sentinelBaseline };
}

/**
 * Import original contextual tracking through the actual document input.
 *
 * Every language slot keeps its explicit independent ratio and signed spacing.
 * No expected source rectangle or glyph position enters the production renderer.
 * @async
 * @param {Page} page - Actual selected browser or native application renderer.
 * @param {string} text - Complete original authored Unicode source.
 * @param {number} ratio - Native horizontal width percentage.
 * @param {number} tracking - Native signed tracking percentage.
 * @returns {Promise<void>} Resolves after the actual named source import.
 * @example
 * await openTrackedContext(page,'X لا Z',100,20);
 */
export async function openTrackedContext(
  page: Page,
  text: string,
  ratio: number,
  tracking: number,
): Promise<void> {
  /** Distinct original source identities prevent observing a previous import's completed toast. */
  const metrics = characterMetrics(null),
    name = `tracked-context-${Buffer.from(text).toString("hex")}-${ratio}-${tracking}.fhn`;
  metrics.ratio.fill(ratio);
  metrics.spacing.fill(tracking);
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
              attrs: { textAlign: "left", lineHeight: "1.6" },
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
                        nativeUseFontSpace: false,
                        nativeUseKerning: false,
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
  await expect(page.locator("#toast")).toContainText(name);
}

/**
 * Verify coherent tracking against original native matrices and actual source geometry.
 *
 * Host font baselines establish independent signed-width expectations on every
 * platform. Literal Windows PDF matrices additionally verify actual native
 * glyph origins for original 20-percent tracking sources. Required lam-alef
 * and marked Arabic retain terminal advances without splitting visible glyphs.
 * @async
 * @param {{page:Page}} context - Actual owned browser or selected native renderer.
 * @returns {Promise<void>} Resolves after all original signed-tracking and width conditions.
 * @throws {Error} If physical source, coherent paint, native origins or following text differ.
 * @example
 * // Four native words retain source and paint geometry at widths 75/100/150 and tracking −20/20.
 */
export async function verifyContextualTracking({
  page,
}: {
  page: Page;
}): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  for (/** Original native PDFs separately establish required ligatures, marked Arabic and Indic fallback. */ const sample of NATIVE_TRACKED_WORDS) {
    await openTrackedContext(page, "X " + sample.word + " Z", 100, 0);
    await expect(
      page.locator(".tiptap [data-forhan-context-ratio]"),
    ).toHaveCount(0);
    await expect(page.locator(".tiptap forhan-space")).toHaveCount(1);
    /** Natural actual host font geometry supplies independent original advance expectations. */
    const base = await page
        .locator(".tiptap")
        .evaluate(contextualTrackingGeometry, sample),
      original = await page
        .locator(".tiptap")
        .evaluate(contextualPositions, ["X", sample.word, "Z"]),
      xWidth = original[0].right - original[0].left,
      wordWidth = original[1].right - original[1].left,
      space = original[1].left - original[0].right,
      trackedWidth =
        wordWidth -
        (sample.rtl && !sample.terminal
          ? base.source[0].right - base.source[0].left
          : 0) -
        (sample.numericEnding ? base.source[9].right - base.source[9].left : 0);
    for (/** Horizontal scaling keeps font height independent of native signed advances. */ const ratio of [
      75, 100, 150,
    ])
      for (/** Both overlap and expansion retain complete original source and contextual forms. */ const tracking of [
        -20, 20,
      ]) {
        await openTrackedContext(
          page,
          "X " + sample.word + " Z",
          ratio,
          tracking,
        );
        await expect(
          page.locator(".tiptap svg text[data-context-width]"),
        ).toHaveCount(1);
        await expect(
          page.locator(".tiptap svg text[data-context-width]"),
        ).toHaveAttribute("data-context-width", String(ratio));
        await expect
          .poll(
            /**
             * Observe actual source cells, coherent paint and physical following-text advance.
             *
             * A previous import's SVG cannot satisfy current source and paint geometry.
             * @async
             * @returns {Promise<number>} Maximum independently measured source/paint/advance error.
             * @example
             * // Required ligatures retain their original glyph width while their advance changes.
             */
            async () => {
              /** Current physical original source and paint are measured independently. */
              const geometry = await page
                  .locator(".tiptap")
                  .evaluate(contextualTrackingGeometry, sample),
                positions = await page
                  .locator(".tiptap")
                  .evaluate(contextualPositions, ["X", "Z"]),
                r = ratio / 100,
                t = tracking / 100,
                expected =
                  positions[0].left +
                  r *
                    (xWidth * (1 + t) +
                      space * (sample.rtl ? 1 : 1 + t) +
                      wordWidth +
                      trackedWidth * t +
                      space * (1 + t));
              let error = Math.abs(positions[1].left - expected);
              if (geometry.paint.length !== sample.intervals.length)
                return Infinity;
              for (let index = 0; index < geometry.source.length; index++) {
                error = Math.max(
                  error,
                  Math.abs(
                    geometry.source[index].left - geometry.paint[index].left,
                  ),
                  Math.abs(
                    geometry.source[index].right - geometry.paint[index].right,
                  ),
                  Math.abs(
                    geometry.source[index].height - base.source[index].height,
                  ),
                  Math.abs(
                    geometry.paint[index].baseline - geometry.sentinelBaseline,
                  ),
                );
              }
              return error;
            },
          )
          .toBeLessThan(0.35);
        if (sample.numericEnding) {
          /** Actual numeric source and coherent paint retain their original nested left-to-right run. */
          const geometry = await page
            .locator(".tiptap")
            .evaluate(contextualTrackingGeometry, sample);
          expect(geometry.source[7].left).toBeLessThan(geometry.source[8].left);
          expect(geometry.source[8].left).toBeLessThan(geometry.source[9].left);
          expect(geometry.paint[7].left).toBeLessThan(geometry.paint[8].left);
          expect(geometry.paint[8].left).toBeLessThan(geometry.paint[9].left);
        }
        if (process.platform === "win32" && ratio === 100 && tracking === 20) {
          /** Literal original native text matrices independently establish glyph and following-Z placement. */
          const actual = await page
              .locator(".tiptap")
              .evaluate(contextualTrackingGeometry, sample),
            positions = await page
              .locator(".tiptap")
              .evaluate(contextualPositions, ["X", "Z"]);
          for (let index = 0; index < sample.native.length; index++)
            expect(
              Math.abs(
                actual.paint[index].left -
                  positions[0].left -
                  (((sample.native[index] - 591) * 0.119935 * 96) / 72) * 1.25,
              ),
            ).toBeLessThan(0.75);
          expect(
            Math.abs(
              positions[1].left -
                positions[0].left -
                (((sample.z - 591) * 0.119935 * 96) / 72) * 1.25,
            ),
          ).toBeLessThan(0.75);
        }
      }
  }
}

/**
 * Verify tracked contextual words reflow together at actual narrow line boundaries.
 *
 * Coherent anonymous table groups prevent cluster cells from breaking a
 * complete word across lines. Expanding the original source width restores
 * its original single-line flow without altering authored Unicode.
 * @async
 * @param {{page:Page}} context - Actual selected renderer.
 * @returns {Promise<void>} Resolves after actual narrow/wide/narrow source reflow.
 * @throws {Error} If a coherent word's source cells occupy different physical lines.
 * @example
 * // A tracked Arabic word after a long prefix moves as one original word.
 */
export async function verifyContextualTrackingWrap({
  page,
}: {
  page: Page;
}): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  /** Original native source intervals remain unchanged across physical viewport widths. */
  const sample = NATIVE_TRACKED_WORDS[0];
  await openTrackedContext(page, "XXXX " + sample.word + " Z", 100, 20);
  for (/** Actual source width changes exercise real browser reflow and native line-placement convergence. */ const width of [
    180, 600, 180,
  ]) {
    await page.locator(".tiptap").evaluate(
      /**
       * Resize only the actual owned source viewport for a real wrap observation.
       *
       * Expected glyph positions are never assigned to the renderer.
       * @param {HTMLElement} root - Actual editable source viewport.
       * @param {number} width - Physical source viewport width in CSS pixels.
       * @returns {void} Applies the controlled actual viewport size.
       * @example
       * // Native line placement responds to the actual narrowed viewport.
       */
      (root, width) => {
        root.style.width = width + "px";
      },
      width,
    );
    await expect
      .poll(
        /**
         * Observe complete original word source cells after physical line reflow.
         *
         * All source cells must share a real baseline; the word moves below the
         * original prefix only in the narrowed actual viewport.
         * @async
         * @returns {Promise<boolean>} Whether genuine current source layout has converged.
         * @example
         * // A full-word SVG cannot hide editable cells split over two lines.
         */
        async () => {
          /** Independent original source ranges supply current actual physical line positions. */
          const geometry = await page
              .locator(".tiptap")
              .evaluate(contextualTrackingGeometry, sample),
            prefix = (
              await page.locator(".tiptap").evaluate(contextualPositions, ["X"])
            )[0];
          for (/** Every original Arabic source cell must retain the coherent word's physical line. */ const rect of geometry.source)
            if (Math.abs(rect.top - geometry.source[0].top) > 0.2) return false;
          return width === 180
            ? geometry.source[0].top > prefix.top + 10
            : Math.abs(geometry.source[0].top - prefix.top) < 0.2;
        },
      )
      .toBe(true);
  }
  await page.locator(".tiptap").evaluate(
    /**
     * Release the owned source viewport override after the wrap observation.
     *
     * Later native output uses the actual document's normal paper geometry.
     * @param {HTMLElement} root - Owned actual source viewport.
     * @returns {void} Restores document-driven physical source width.
     * @example
     * // The observation cannot leave a test-only source width in subsequent exports.
     */
    (root) => {
      root.style.removeProperty("width");
    },
  );
}

/**
 * Save actual browser document bytes through an explicit public format choice.
 *
 * The canonical FHN extension keeps the established internal portable payload
 * identifier. A real completed download and enabled save control establish
 * output completion before another source edit or keyboard undo begins.
 * @async
 * @param {Page} page - Actual owned browser renderer.
 * @param {TrackedContextFormat} format - Explicit public output format.
 * @returns {Promise<Buffer>} Complete actual production output bytes.
 * @throws {Error} If the real output cannot be completed or its extension differs.
 * @example
 * await saveTrackedContext(page,'fhn'); // Original source is serialized independently of drawings.
 */
async function saveTrackedContext(
  page: Page,
  format: TrackedContextFormat,
): Promise<Buffer> {
  /** Real output observation precedes its explicit production command. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page
    .locator('[data-export="' + (format === "fhn" ? "forhan" : format) + '"]')
    .click();
  /** Original completed output bytes retain their real public format identity. */
  const output = await pending,
    bytes = await readFile((await output.path())!);
  expect(output.suggestedFilename()).toMatch(new RegExp("\\." + format + "$"));
  await expect(page.locator("#save-document")).toBeEnabled();
  return bytes;
}

/**
 * Open an owned independent source-output renderer on the selected actual host.
 *
 * Browser checks use a new page. Native checks create a hidden isolated
 * BrowserWindow with no preload or Node integration; the caller closes that
 * exact output window in its finally path after reading actual HTML geometry.
 * @async
 * @param {Page} page - Actual owning source renderer.
 * @param {ElectronApplication} [desktop] - Actual native application when running the desktop gate.
 * @returns {Promise<Page>} Owned independent output page on the same selected host.
 * @example
 * await trackedOutputPage(page, desktop); // Original static output is measured by the actual native engine.
 */
async function trackedOutputPage(
  page: Page,
  desktop?: ElectronApplication,
): Promise<Page> {
  if (!desktop) return page.context().newPage();
  /** Ownership is registered before the actual native output window is created. */
  const pending = desktop.waitForEvent("window");
  await desktop.evaluate(
    /**
     * Create only the hidden native renderer owned by this output observation.
     *
     * The real main editor and its profile remain untouched; output has no
     * preload, application bridge or unrestricted Node execution.
     * @param {typeof import('electron')} context - Actual selected native exports.
     * @async
     * @returns {Promise<void>} Creates and navigates the exact owned independent source-output window.
     * @example
     * // Closing the resulting page releases this generated BrowserWindow only.
     */
    async ({ BrowserWindow }) => {
      /** An actual initial navigation establishes the owned native page and its observable window event. */
      const output = new BrowserWindow({
        show: false,
        width: 1200,
        height: 960,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          spellcheck: false,
        },
      });
      await output.loadURL("about:blank");
    },
  );
  return pending;
}

/**
 * Await actual matching source and paint after an original tracked word returns.
 *
 * Source undo can complete before the next rendering frame recreates its
 * proportional cells. Physical input uses current genuine paint/source bounds
 * rather than coordinates sampled from that transient preceding layout.
 * @async
 * @param {Page} page - Actual owned browser renderer.
 * @param {{word:string;intervals:number[][]}} sample - Original native word intervals.
 * @returns {Promise<void>} Resolves after current actual source and glyph positions agree.
 * @example
 * await trackedWordReady(page,sample); // A restored model alone cannot establish physical input readiness.
 */
async function trackedWordReady(
  page: Page,
  sample: { word: string; intervals: number[][] },
): Promise<void> {
  await expect(
    page.locator(".tiptap svg text[data-context-width]"),
  ).toHaveCount(2);
  await expect
    .poll(
      /**
       * Observe actual current original source and coherent glyph bounds.
       *
       * No expected coordinate or source selection is assigned to the renderer.
       * @async
       * @returns {Promise<number>} Maximum genuine source/paint cluster boundary error.
       * @example
       * // A stale SVG or a restored source without its current cells cannot satisfy this read.
       */
      async () => {
        /** Real source and actual current full-word paint are independently observed. */
        const geometry = await page
          .locator(".tiptap")
          .evaluate(contextualTrackingGeometry, sample);
        if (geometry.paint.length !== sample.intervals.length) return Infinity;
        let error = 0;
        for (let index = 0; index < geometry.source.length; index++)
          error = Math.max(
            error,
            Math.abs(geometry.source[index].left - geometry.paint[index].left),
            Math.abs(
              geometry.source[index].right - geometry.paint[index].right,
            ),
          );
        return error;
      },
    )
    .toBeLessThan(0.35);
}

/**
 * Verify original tracked RTL word order through trusted source editing and real output.
 *
 * Physical double clicks and key input operate on actual source cells. One
 * authored undo restores the complete original word. Native file readers and
 * standalone HTML independently verify source and source/paint geometry.
 * @async
 * @param {{page:Page;desktop?:ElectronApplication;save?:(page:Page,format:TrackedContextFormat)=>Promise<Buffer>}} context - Actual host and optional real native output writer.
 * @returns {Promise<void>} Resolves after signed tracking, source editing, undo and output checks.
 * @throws {Error} If source order, input ownership, history or actual output geometry differs.
 * @example
 * // A whole-word Arabic replacement never inserts auxiliary direction characters into source.
 */
export async function verifyTrackedContextEditing({
  page,
  desktop,
  save = saveTrackedContext,
}: {
  page: Page;
  desktop?: ElectronApplication;
  save?: (page: Page, format: TrackedContextFormat) => Promise<Buffer>;
}): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  /** Two original RTL words retain one actual resolved directional run. */
  const original = "X العربية جميلة Z",
    sample = NATIVE_TRACKED_WORDS[0];
  for (/** Source cells and coherent glyph paint retain independent horizontal scale. */ const ratio of [
    75, 150,
  ])
    for (/** Both overlapping and expanded native advances retain actual source input ownership. */ const tracking of [
      -20, 20,
    ]) {
      await openTrackedContext(page, original, ratio, tracking);
      await expect(
        page.locator(".tiptap svg text[data-context-width]"),
      ).toHaveCount(2);
      await trackedWordReady(page, sample);
      await expect
        .poll(
          /**
           * Observe native semantic RTL word ordering in actual physical source boxes.
           *
           * Anonymous word groups must remain in the original strong RTL run.
           * @async
           * @returns {Promise<boolean>} Whether actual source words retain their original visual order.
           * @example
           * // The first logical Arabic word stays to the right of the following Arabic word.
           */
          async () => {
            /** Genuine original source intervals establish physical bidi order. */
            const words = await page
              .locator(".tiptap")
              .evaluate(contextualPositions, ["العربية", "جميلة"]);
            return words[0].left > words[1].right;
          },
        )
        .toBe(true);
      /** A trusted physical double click selects the original complete first Arabic word. */
      const word = (
        await page.locator(".tiptap").evaluate(contextualPositions, ["العربية"])
      )[0];
      await page.mouse.dblclick(
        (word.left + word.right) / 2,
        word.top + word.height / 2,
      );
      await expect(
        page.locator('.tiptap svg text[data-context-width][fill="#ffffff"]'),
      ).toHaveCount(1);
      await page.keyboard.type("N");
      /** Actual source output is authoritative for the physical whole-word replacement. */
      const replacement = JSON.parse(
        (await save(page, "fhn")).toString("utf8"),
      );
      expect(contextualSourceText(replacement.doc)).toBe("X N جميلة Z");
      await page.keyboard.press("ControlOrMeta+z");
      /** A single authored undo restores complete original source and explicit native arrays. */
      const restored = JSON.parse((await save(page, "fhn")).toString("utf8"));
      expect(contextualSourceText(restored.doc)).toBe(original);
      await trackedWordReady(page, sample);
      /** The actual first logical letter's physical right edge owns the source caret before that word. */
      const first = (
        await page.locator(".tiptap").evaluate(contextualPositions, ["ا"])
      )[0];
      await page.mouse.click(first.right - 0.125, first.top + first.height / 2);
      await page.keyboard.type("Q");
      expect(
        contextualSourceText(
          JSON.parse((await save(page, "fhn")).toString("utf8")).doc,
        ),
      ).toBe("X Qالعربية جميلة Z");
      await page.keyboard.press("ControlOrMeta+z");
      expect(
        contextualSourceText(
          JSON.parse((await save(page, "fhn")).toString("utf8")).doc,
        ),
      ).toBe(original);
      for (/** Real original HWPX and HWP bytes preserve every native source metric independently of paint. */ const format of [
        "hwpx",
        "hwp",
      ] as const) {
        /** Independent native readers inspect actual original production output. */
        const bytes = await save(page, format),
          parsed = format === "hwpx" ? await readHwpx(bytes) : readHwp(bytes);
        expect(contextualSourceText(parsed.doc)).toBe(original);
        for (/** Native source runs keep the complete original language arrays. */ const node of parsed
          .doc.content![0].content!)
          for (/** Rendering-only source cells cannot overwrite inactive native language slots. */ const mark of node.marks ||
            [])
            if (mark.type === "textStyle") {
              expect(
                characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio,
              ).toEqual(Array(7).fill(ratio));
              expect(
                characterMetrics(mark.attrs!.nativeCharacterMetrics).spacing,
              ).toEqual(Array(7).fill(tracking));
            }
      }
      /** Actual script-free HTML has its own coherent source layout and original glyph paint. */
      const html = await save(page, "html"),
        output = await trackedOutputPage(page, desktop);
      try {
        await output.setContent(html.toString("utf8"));
        await expect(
          output.locator("svg text[data-context-width]"),
        ).toHaveCount(2);
        /** Actual static source and coherent glyph bounds retain independent original identities. */
        const geometry = await output
            .locator("body")
            .evaluate(contextualTrackingGeometry, sample),
          words = await output
            .locator("body")
            .evaluate(contextualPositions, ["العربية", "جميلة"]);
        expect(words[0].left).toBeGreaterThan(words[1].right);
        expect(geometry.paint).toHaveLength(sample.intervals.length);
        for (let index = 0; index < geometry.source.length; index++) {
          expect(
            Math.abs(geometry.source[index].left - geometry.paint[index].left),
          ).toBeLessThan(0.35);
          expect(
            Math.abs(
              geometry.source[index].right - geometry.paint[index].right,
            ),
          ).toBeLessThan(0.35);
        }
      } finally {
        await output.close();
      }
      await page.locator("#file-input").setInputFiles({
        name: "tracked-context-roundtrip.html",
        mimeType: "text/html",
        buffer: html,
      });
      await expect(page.locator("#toast")).toContainText(
        "tracked-context-roundtrip.html",
      );
      expect(
        contextualSourceText(
          JSON.parse((await save(page, "fhn")).toString("utf8")).doc,
        ),
      ).toBe(original);
    }
}
