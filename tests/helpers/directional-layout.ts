import { expect, type Page } from "@playwright/test";
import { contextualPositions } from "./contextual-width";
/**
 * Observe real source ASCII-space rectangles independently of rendering-only attributes.
 *
 * Original logical source nodes remain authoritative across character and
 * layout wrappers. Inaccessible SVG text never contributes a source space.
 * @param {HTMLElement} root - Actual attached original editor source.
 * @returns {number[]} Physical original space advances in source order.
 * @example
 * await page.locator('.tiptap').evaluate(originalSpaceWidths); // Two genuine original ASCII-space rectangles.
 */
export function originalSpaceWidths(root: HTMLElement): number[] {
  /** Each actual original text interval owns its real source geometry. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    range = document.createRange(),
    result: number[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest('[contenteditable="false"]'))
      continue;
    /** Only literal original ASCII spaces enter this measurement. */
    const node = walker.currentNode as Text;
    for (let index = 0; index < node.length; index++)
      if (node.data[index] === " ") {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        result.push(range.getBoundingClientRect().width);
      }
  }
  return result;
}

/**
 * Prepare unchanged original native directional source for the real document input.
 *
 * Every language retains independent native arrays. The owned renderer, font
 * measurement and native serializers remain responsible for all actual output.
 * @param {string} name - Unique original source filename for observation readiness.
 * @param {string} text - Complete original authored Unicode source.
 * @param {number} tracking - Original signed native tracking percentage.
 * @param {'left'|'right'} [alignment='left'] - Original controlled paragraph alignment.
 * @returns {{name:string;mimeType:string;buffer:Buffer}} Real source file input payload.
 * @example
 * directionalSourceFile('native.forhan','X עברית Z',20); // No layout values are injected into the product.
 */
export function directionalSourceFile(
  name: string,
  text: string,
  tracking: number,
  alignment: "left" | "right" = "left",
): { name: string; mimeType: string; buffer: Buffer } {
  return {
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
              attrs: { textAlign: alignment },
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
                        nativeCharacterMetrics: {
                          ratio: Array(7).fill(100),
                          spacing: Array(7).fill(tracking),
                          relativeSize: Array(7).fill(100),
                          offset: Array(7).fill(0),
                        },
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
  };
}

/**
 * Compare actual mixed Hebrew placement with the native directional policy using real host font advances.
 *
 * The original installed-Hangul PDF establishes which runs omit terminal
 * tracking. Natural host font geometry supplies glyph sizes on every platform;
 * Windows tests separately compare all origins with the literal native PDF.
 * @param {Record<string,number>} baseline - Actual untracked original source glyph origins.
 * @param {Record<string,number>} actual - Actual tracked original drawing glyph origins.
 * @param {number} xAdvance - Actual untracked original X advance on this host.
 * @param {number} spaceAdvance - Actual untracked original half-em space advance.
 * @param {number} tracking - Original native signed tracking percentage.
 * @param {readonly string[]} [visualOrder=['ת','י','ר','ב','ע']] - Literal original native visual grapheme order.
 * @param {number} [terminalAdvance=0] - Natural terminal base advance retained before a zero-width native mark.
 * @returns {number} Maximum actual advance error in physical source viewport pixels.
 * @example
 * directionalGlyphOriginError(base,actual,xWidth,spaceWidth,20); // No browser selection or coordinate is modified.
 */
export function directionalGlyphOriginError(
  baseline: Record<string, number>,
  actual: Record<string, number>,
  xAdvance: number,
  spaceAdvance: number,
  tracking: number,
  visualOrder: readonly string[] = ["ת", "י", "ר", "ב", "ע"],
  terminalAdvance = 0,
): number {
  let error = Math.abs(actual.X - baseline.X);
  for (/** Literal native PDF visual glyph order remains independent of production bidi resolution. */ const text of visualOrder)
    error = Math.max(
      error,
      Math.abs(
        actual[text] -
          baseline[text] -
          ((xAdvance + baseline[text] - baseline[visualOrder[0]]) * tracking) /
            100,
      ),
    );
  return Math.max(
    error,
    Math.abs(
      actual.Z -
        baseline.Z -
        ((xAdvance +
          baseline[visualOrder[visualOrder.length - 1]] -
          baseline[visualOrder[0]] +
          spaceAdvance +
          terminalAdvance) *
          tracking) /
          100,
    ),
  );
}

/** Original native text-matrix references retain literal controlled source and visual glyph grouping. */
interface NativeGlyphReference {
  id: string;
  text: string;
  tracking: number;
  positions: Record<string, number>;
  visualOrder: string[];
  terminalTracked: boolean;
}

/** Original installed-Hangul PDF text-matrix x positions for the exact Arial32pt plain and niqqud Hebrew sources. */
export const NATIVE_HEBREW_ORIGINS: NativeGlyphReference[] = [
  {
    id: "marked-0",
    text: "X עִבְרִית Z",
    tracking: 0,
    positions: {
      X: 591,
      ת: 902,
      י: 1074,
      רִ: 1139,
      בְ: 1275,
      עִ: 1420,
      Z: 1696,
    },
    visualOrder: ["ת", "י", "רִ", "בְ", "עִ"],
    terminalTracked: true,
  },
  {
    id: "marked-20",
    text: "X עִבְרִית Z",
    tracking: 20,
    positions: {
      X: 591,
      ת: 938,
      י: 1144,
      רִ: 1222,
      בְ: 1385,
      עִ: 1559,
      Z: 1890,
    },
    visualOrder: ["ת", "י", "רִ", "בְ", "עִ"],
    terminalTracked: true,
  },
  {
    id: "plain-0",
    text: "X עברית Z",
    visualOrder: ["ת", "י", "ר", "ב", "ע"],
    terminalTracked: false,
    tracking: 0,
    positions: { X: 591, ת: 902, י: 1074, ר: 1140, ב: 1275, ע: 1420, Z: 1694 },
  },
  {
    id: "plain-20",
    text: "X עברית Z",
    visualOrder: ["ת", "י", "ר", "ב", "ע"],
    terminalTracked: false,
    tracking: 20,
    positions: { X: 591, ת: 938, י: 1144, ר: 1223, ב: 1385, ע: 1559, Z: 1860 },
  },
];

/**
 * Observe actual glyph advance origins from source and the real owned drawing.
 *
 * Uncorrected source uses genuine complete source ranges. Corrected text uses
 * its real SVG font advance and screen matrix, independently of drawing data
 * attributes claiming a particular position or native ratio.
 * @param {HTMLElement} root - Actual attached original source editor.
 * @returns {Record<string,number>} Actual physical advance origins for the unique original source letters.
 * @example
 * await page.locator('.tiptap').evaluate(actualDirectionalGlyphOrigins); // Real X/Hebrew/Z glyph positions.
 */
export function actualDirectionalGlyphOrigins(
  root: HTMLElement,
): Record<string, number> {
  /** Actual source glyph origins remain distinct from logical bidi caret affinity. */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    range = document.createRange(),
    result: Record<string, number> = {};
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest('[contenteditable="false"]'))
      continue;
    /** Each original source grapheme in this controlled native source is unique. */
    const node = walker.currentNode as Text;
    for (/** Complete original niqqud clusters retain their base glyph's actual source origin. */ const part of new Intl.Segmenter(
      "ko",
      { granularity: "grapheme" },
    ).segment(node.data))
      if (!/\s/u.test(part.segment)) {
        range.setStart(node, part.index);
        range.setEnd(node, part.index + part.segment.length);
        result[part.segment] = range.getBoundingClientRect().left;
      }
  }
  for (/** Real corrected glyphs are measured using their actual font advance, never a supplied expected coordinate. */ const text of root.querySelectorAll<SVGTextElement>(
    "svg text[data-width-ratio]",
  )) {
    /** The owned glyph matrix includes actual horizontal scaling and visible paper zoom. */
    const matrix = text.getScreenCTM()!,
      origin = new DOMPoint(
        text.getAttribute("direction") === "rtl"
          ? -text.getComputedTextLength()
          : 0,
        0,
      ).matrixTransform(matrix);
    result[text.textContent!] = origin.x;
  }
  return result;
}

/**
 * Verify real directional space advances using independent native PDF measurements.
 *
 * Native PDF coordinates show that the space before an Arabic run omits its
 * tracking, whereas both surrounding spaces in the original Indic source use
 * normal tracking. Zero and signed values retain the same base half-em width.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after original source advances match the native directional policy.
 * @throws {Error} If a directional boundary receives the wrong actual source advance.
 * @example
 * // Arabic and Indic sources with the same tracking do not use identical first-space widths.
 */
export async function verifyDirectionalSpaces({
  page,
}: {
  page: Page;
}): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  for (/** Literal original native source cases retain independently observed per-space tracking decisions. */ const sample of [
    { id: "arabic", text: "X العربية Z", tracked: [false, true] },
    { id: "lam-alef", text: "X لا Z", tracked: [false, true] },
    { id: "arabic-marks", text: "X سَلَام Z", tracked: [false, true] },
    { id: "hebrew-marks", text: "X עִבְרִית Z", tracked: [false, true] },
    { id: "hebrew", text: "X עברית Z", tracked: [false, true] },
    { id: "indic", text: "X हिन्दी Z", tracked: [true, true] },
    {
      id: "arabic-words",
      text: "X العربية جميلة Z",
      tracked: [false, true, true],
    },
    {
      id: "arabic-numbers",
      text: "X العربية 123 Z",
      tracked: [false, true, true],
    },
    { id: "arabic-parens", text: "X (العربية) Z", tracked: [true, true] },
    { id: "rli", text: "X \u2067العربية\u2069 Z", tracked: [true, true] },
    { id: "lri", text: "X \u2066العربية\u2069 Z", tracked: [true, true] },
    { id: "fsi", text: "X \u2068العربية\u2069 Z", tracked: [true, true] },
    { id: "trailing", text: "X  ", tracked: [false, false] },
    { id: "double-before", text: "X  العربية Z", tracked: [true, false, true] },
  ])
    for (/** Signed spacing retains native source precision independently of the directional boundary. */ const tracking of [
      -20, 0, 20,
    ]) {
      /** Literal original source and native language arrays enter through the real document input. */
      const name =
        "directional-space-" + sample.id + "-" + tracking + ".forhan";
      await page
        .locator("#file-input")
        .setInputFiles(directionalSourceFile(name, sample.text, tracking));
      await expect(page.locator("#toast")).toContainText(name);
      await expect
        .poll(
          /**
           * Read actual source advances after owned native layout work settles.
           *
           * No expected rectangle is assigned to the product or its source model.
           * @async
           * @returns {Promise<number>} Maximum deviation from the independently observed native policy.
           * @example
           * // The current imported source, rather than a previous layout frame, supplies every measurement.
           */
          async () => {
            /** Actual visible paper zoom converts the original source advance to physical viewport pixels. */
            const widths = await page
                .locator(".tiptap")
                .evaluate(originalSpaceWidths),
              base = ((32 * 4) / 3) * 0.5 * 1.25;
            if (widths.length !== sample.tracked.length) return Infinity;
            let error = 0;
            for (let index = 0; index < widths.length; index++)
              error = Math.max(
                error,
                Math.abs(
                  widths[index] -
                    base * (1 + (sample.tracked[index] ? tracking : 0) / 100),
                ),
              );
            return error;
          },
        )
        .toBeLessThan(0.2);
    }
}

/**
 * Verify actual mixed-direction glyph placement against literal original native PDF matrices.
 *
 * Native tracking omits the last visual glyph of each directional run. This
 * independently checks all seven actual X/Hebrew/Z glyph origins, including
 * the following Latin run, rather than accepting a proportional-width model.
 * @async
 * @param {{page:Page}} context - Actual owned renderer page.
 * @returns {Promise<void>} Resolves after both original native placement conditions match.
 * @throws {Error} If a native run ending adds a spurious glyph or space advance.
 * @example
 * // The following Z cannot drift because the RTL word was given an extra terminal tracking advance.
 */
export async function verifyNativeGlyphOrigins({
  page,
}: {
  page: Page;
}): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  let baseline: Record<string, number> | undefined,
    xAdvance = 0,
    spaceAdvance = 0,
    terminalAdvance = 0;
  for (/** Original zero/positive native conditions use the same complete original Unicode source. */ const sample of NATIVE_HEBREW_ORIGINS) {
    /** Complete native source arrays remain separate from the literal external placement evidence. */
    const name = "native-directional-glyphs-" + sample.id + ".forhan";
    await page
      .locator("#file-input")
      .setInputFiles(directionalSourceFile(name, sample.text, sample.tracking));
    await expect(page.locator("#toast")).toContainText(name);
    if (sample.tracking)
      await expect(
        page.locator(".tiptap svg text[data-width-ratio]"),
      ).toHaveCount(7);
    else {
      await expect(
        page.locator(".tiptap svg text[data-width-ratio]"),
      ).toHaveCount(0);
      await expect(page.locator(".tiptap forhan-space")).toHaveCount(1);
    }
    /** The literal original PDF transform converts native glyph offsets into physical source-viewport advances. */
    let actual = await page
      .locator(".tiptap")
      .evaluate(actualDirectionalGlyphOrigins);
    if (!sample.tracking) {
      baseline = actual;
      /** Actual host source geometry supplies natural advances without assuming Windows font files on another platform. */
      const x = (
        await page.locator(".tiptap").evaluate(contextualPositions, ["X"])
      )[0];
      xAdvance = x.right - x.left;
      spaceAdvance = (
        await page.locator(".tiptap").evaluate(originalSpaceWidths)
      )[1];
      /** Independent original source ranges retain the natural base advance before a terminal zero-width mark. */
      const terminal = (
        await page
          .locator(".tiptap")
          .evaluate(contextualPositions, [
            sample.visualOrder[sample.visualOrder.length - 1],
          ])
      )[0];
      terminalAdvance = sample.terminalTracked
        ? terminal.right - terminal.left
        : 0;
    } else
      await expect
        .poll(
          /**
           * Observe current real paint origins after dependent native source advances settle.
           *
           * SVG glyph count alone can become ready before the next native space
           * measurement frame. Only genuine current paint origins satisfy this observation.
           * @async
           * @returns {Promise<number>} Actual native directional advance error on this host.
           * @example
           * // An old glyph layer cannot pass as the newly imported original source.
           */
          async () => {
            actual = await page
              .locator(".tiptap")
              .evaluate(actualDirectionalGlyphOrigins);
            return directionalGlyphOriginError(
              baseline!,
              actual,
              xAdvance,
              spaceAdvance,
              sample.tracking,
              sample.visualOrder,
              terminalAdvance,
            );
          },
        )
        .toBeLessThan(0.2);
    if (process.platform !== "win32") continue;
    for (/** Every glyph is independently compared with its literal original native text-matrix position. */ const [
      text,
      x,
    ] of Object.entries(sample.positions))
      expect(
        Math.abs(
          actual[text] -
            actual.X -
            (((x - sample.positions.X) * 0.119935 * 96) / 72) * 1.25,
        ),
        `${text} at tracking ${sample.tracking} must retain its actual native glyph advance origin`,
      ).toBeLessThan(0.75);
  }
}

/**
 * Verify native terminal tracking after canonical character composition.
 *
 * Original native right-aligned PDFs keep the final accented glyph fixed and
 * shift X by exactly the tracked preceding X/space advances. Both original
 * Unicode spellings must preserve their source while producing that geometry.
 * @async
 * @param {{page:Page}} context - Actual owned browser or selected native renderer.
 * @returns {Promise<void>} Resolves after original composed and decomposed source placement agrees.
 * @throws {Error} If a decomposed mark creates a spurious terminal tracking advance.
 * @example
 * // X é and X é retain identical native right-aligned glyph origins at tracking 0 and 20.
 */
export async function verifyNativeTerminalComposition({
  page,
}: {
  page: Page;
}): Promise<void> {
  if (page.url() === "about:blank") await page.goto("/");
  for (/** Literal original native PDFs independently establish both unchanged Unicode source spellings. */ const sample of [
    { id: "composed", text: "X é", glyph: "é" },
    { id: "decomposed", text: "X e\u0301", glyph: "e\u0301" },
  ]) {
    let baseline: Record<string, number> | undefined,
      xAdvance = 0,
      spaceAdvance = 0;
    for (/** Right alignment exposes a terminal advance that would be invisible beyond an ordinary left-aligned final glyph. */ const tracking of [
      0, 20,
    ]) {
      /** The real document input receives original source and explicit native alignment. */
      const name = "native-terminal-" + sample.id + "-" + tracking + ".forhan";
      await page
        .locator("#file-input")
        .setInputFiles(
          directionalSourceFile(name, sample.text, tracking, "right"),
        );
      await expect(page.locator("#toast")).toContainText(name);
      await expect(
        page.locator(".tiptap svg text[data-width-ratio]"),
      ).toHaveCount(tracking ? 2 : 0);
      if (!tracking) {
        await expect(page.locator(".tiptap forhan-space")).toHaveCount(1);
        baseline = await page
          .locator(".tiptap")
          .evaluate(actualDirectionalGlyphOrigins);
        /** Real natural host font geometry remains independent of the original native PDF x matrices. */
        const x = (
          await page.locator(".tiptap").evaluate(contextualPositions, ["X"])
        )[0];
        xAdvance = x.right - x.left;
        spaceAdvance = (
          await page.locator(".tiptap").evaluate(originalSpaceWidths)
        )[0];
      } else {
        let actual: Record<string, number> = {};
        await expect
          .poll(
            /**
             * Observe actual final composed glyph placement after native layout settles.
             *
             * Genuine source geometry establishes the natural advances; no
             * browser coordinate or source selection is assigned by the test.
             * @async
             * @returns {Promise<number>} Actual maximum terminal-glyph or preceding-run placement error.
             * @example
             * // The final accented glyph stays fixed while its preceding run changes width.
             */
            async () => {
              actual = await page
                .locator(".tiptap")
                .evaluate(actualDirectionalGlyphOrigins);
              return Math.max(
                Math.abs(actual[sample.glyph] - baseline![sample.glyph]),
                Math.abs(
                  actual.X - baseline!.X + (xAdvance + spaceAdvance) * 0.2,
                ),
              );
            },
          )
          .toBeLessThan(0.2);
        if (process.platform === "win32")
          expect(
            Math.abs(
              actual.X - baseline!.X + ((63 * 0.119935 * 96) / 72) * 1.25,
            ),
          ).toBeLessThan(0.75);
      }
    }
  }
}
