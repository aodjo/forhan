import {
  test,
  expect,
  _electron as electron,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { desktopLaunchOptions } from "./helpers/desktop-launch";
import {
  contextualPositions,
  contextualSourceText,
} from "./helpers/contextual-width";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { characterMetrics } from "../src/character-metrics.ts";

/**
 * Import original coherent contextual source through the production file input.
 *
 * Native source fields keep the same real font and point height. Distinct names
 * require the actual replacement to finish before source geometry is inspected.
 * @async
 * @param {Page} page - Actual selected native application renderer.
 * @param {string} name - Unique generated source fixture filename.
 * @param {string} text - Complete original Unicode source string.
 * @param {number} ratio - Original native horizontal percentage.
 * @returns {Promise<void>} Resolves after actual original source import.
 * @example
 * await openContext(page,'native-arabic.forhan','العربية',75);
 */
async function openContext(
  page: Page,
  name: string,
  text: string,
  ratio: number,
): Promise<void> {
  await page
    .locator("#file-input")
    .setInputFiles({
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
                          nativeCharacterMetrics: {
                            ratio: Array(7).fill(ratio),
                            spacing: Array(7).fill(0),
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
    });
  await expect(page.locator("#toast")).toContainText(name);
}

/**
 * Verify coherent original word geometry and actual native output in the selected desktop application.
 *
 * The packaged gate supplies the actual executable. Original source positions,
 * physical pointer input, native identity and real format/PDF writes are read
 * from the production application with a newly generated isolated profile.
 * @async
 * @returns {Promise<void>} Resolves after coherent source geometry, editing and outputs pass.
 * @throws {Error} If source shaping, native identity or actual production output differs.
 * @example
 * // npm run test:packaged exercises real Arabic/Indic/Thai source widths without a development server.
 */
async function verifyNativeContextualWidths(): Promise<void> {
  /** Every native action and output belongs to this generated profile. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-context-width-")),
    desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** The actual native renderer supplies all physical source geometry. */
    const page = await desktop.firstWindow();
    await expect(page.locator(".tiptap")).toBeVisible();
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(
        await desktop.evaluate(
          /**
           * Inspect the actual selected native application's packaging identity.
           *
           * Native execution cannot be inferred only from launcher arguments.
           * @param {typeof import('electron')} context - Actual native exports.
           * @returns {boolean} Whether the running application is packaged.
           * @example
           * // The native gate must exercise the production distribution itself.
           */
          ({ app }) => app.isPackaged,
        ),
      ).toBe(true);
    /** Original source samples include required ligatures, vowel marks and fallback fonts. */
    const words = ["العربية", "لا", "سَلَام", "हिन्दी", "বাংলা", "ภาษา"];
    for (let index = 0; index < words.length; index++) {
      await openContext(
        page,
        "context-original-" + index + ".forhan",
        words[index],
        100,
      );
      await expect(
        page.locator(".tiptap [data-forhan-context-ratio]"),
      ).toHaveCount(0);
      /** Real baseline source bounds remain independent of generated word metadata. */
      const original = (
        await page
          .locator(".tiptap")
          .evaluate(contextualPositions, [words[index]])
      )[0];
      for (/** Ordinary source ratios apply without changing original physical font height. */
      const ratio of [50, 75, 150, 200]) {
        await openContext(
          page,
          `context-${index}-${ratio}.forhan`,
          words[index],
          ratio,
        );
        await expect(page.locator('.tiptap [data-forhan-context-ratio]')).toHaveAttribute('data-forhan-context-ratio',String(ratio));
        await expect(page.locator('.tiptap svg text[data-context-width]')).toHaveAttribute('data-context-width',String(ratio));
        await expect(
          page.locator(".tiptap svg text[data-context-width]"),
        ).toHaveText(words[index]);
        /** Actual source rectangles include production word layout and current native zoom. */
        const actual = (
          await page
            .locator(".tiptap")
            .evaluate(contextualPositions, [words[index]])
        )[0];
        expect(
          Math.abs(
            actual.right -
              actual.left -
              ((original.right - original.left) * ratio) / 100,
          ),`${words[index]} at ${ratio}% must preserve actual source width: original=${original.right-original.left}, actual=${actual.right-actual.left}`,
        ).toBeLessThan(0.2);
        expect(actual.height).toBeCloseTo(original.height, 1);
        expect(Math.abs(actual.left-original.left),`${words[index]} at ${ratio}% must retain its actual left-aligned source origin`).toBeLessThan(0.2);
      }
    }
    await openContext(
      page,
      "context-pointer.forhan",
      "ABC العربية جميلة 123 한글",
      75,
    );
    await expect(
      page.locator(".tiptap [data-forhan-context-ratio]"),
    ).toHaveCount(2);
    /** A real source rectangle, rather than a drawing target, determines the physical pointer boundary. */
    const wordsBefore = await page
      .locator(".tiptap")
      .evaluate(contextualPositions, ["العربية", "جميلة", "123"]);
    expect(wordsBefore[0].left).toBeGreaterThan(wordsBefore[1].right);
    expect(wordsBefore[1].left).toBeGreaterThan(wordsBefore[2].right);
    await page.mouse.click(
      wordsBefore[0].right - 0.5,
      wordsBefore[0].top + wordsBefore[0].height / 2,
    );
    await page.keyboard.type("Z");
    await expect(
      page.locator(".tiptap [data-forhan-context-ratio]"),
    ).toHaveCount(2);
    for (/** Every production output path must retain original contextual source. */
    const format of ["hwp", "hwpx", "html", "pdf"]) {
      /** Only an exact generated-profile path is offered to the owned native chooser. */
      const output = path.join(profile, "contextual-native." + format);
      expect(path.dirname(output)).toBe(profile);
      await desktop.evaluate(
        /**
         * Redirect only the native chooser result to the exact owned output path.
         *
         * Production IPC, source serialization, static layout and native PDF
         * printing remain responsible for every original output byte.
         * @param {typeof import('electron')} context - Actual native exports.
         * @param {string} output - Exact generated-profile destination.
         * @returns {void} Installs the owned chooser response.
         * @example
         * // No unrelated user file or application profile is selected.
         */
        ({ dialog }, output) => {
          dialog.showSaveDialog =
            /**
             * Resolve the owned native chooser with its exact generated destination.
             *
             * The real application still produces all document and PDF bytes.
             * @async
             * @returns {Promise<{canceled:false;filePath:string}>} Exact owned output response.
             * @example
             * // The next native output belongs only to this isolated profile.
             */
            async () => ({ canceled: false, filePath: output });
        },
        output,
      );
      await page.locator("#export-menu-toggle").click();
      await page.locator(`[data-export="${format}"]`).click();
      await expect
        .poll(
          /**
           * Observe the actual native atomic output before reading its complete bytes.
           *
           * Only initial absence is retried; unexpected filesystem errors remain failures.
           * @async
           * @returns {Promise<boolean>} Whether the actual production output exists.
           * @throws {Error} If the output cannot be observed for an unexpected reason.
           * @example
           * // Native PDF printing must finish before its signature is inspected.
           */
          async () => {
            try {
              await access(output);
              return true;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return false;
              throw error;
            }
          },
        )
        .toBe(true);
      /** Real independently decoded source must not contain generated markers or duplicated drawing text. */
      const bytes = await readFile(output);
      if (format === "hwp" || format === "hwpx") {
        /** Both native readers inspect production bytes rather than a simulated serialized model. */
        const parsed =
          format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
        expect(contextualSourceText(parsed.doc)).toBe(
          "ABC Zالعربية جميلة 123 한글",
        );
        for (/** Normalized script runs keep every original native measurement slot. */
        const run of parsed.doc.content![0].content!)
          for (/** Drawing geometry never becomes a source character-format preference. */
          const mark of run.marks || [])
            if (mark.type === "textStyle")
              expect(
                characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio,
              ).toEqual(Array(7).fill(75));
      } else if (format === "pdf")
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      else
        expect(bytes.toString("utf8")).toContain(
          'data-forhan-context-ratio="75"',
        );
    }
  } finally {
    await desktop.evaluate(
      /**
       * Exit only the owned native regression application after actual outputs are inspected.
       *
       * Other native application processes, documents and profiles remain untouched.
       * @param {typeof import('electron')} context - Actual native exports.
       * @returns {void} Ends this owned process without an interactive save guard.
       * @example
       * // No generated test process survives the native regression.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (
      path.dirname(profile) === path.resolve(tmpdir()) &&
      path.basename(profile).startsWith("forhan-context-width-")
    )
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
  }
}

test(
  "native desktop contextual widths retain coherent source geometry and actual native, HTML and PDF output",
  verifyNativeContextualWidths,
);
