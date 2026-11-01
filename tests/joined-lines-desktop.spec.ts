import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { desktopLaunchOptions } from "./helpers/desktop-launch";
import { JOINED_SCRIPTS, joinedGeometry } from "./helpers/joined-layout";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Collect actual serialized original source text without drawing-only DOM.
 *
 * Native import may retain independent marks or split script runs, but cannot
 * invent presentation forms or remove combining/reordering source characters.
 * @param {JSONContent} node - Actual independently decoded source node.
 * @returns {string} Original logical text in document order.
 * @example
 * joinedSourceText(parsed.doc); // Original Arabic/Indic source appears exactly once.
 */
function joinedSourceText(node: JSONContent): string {
  let result = node.text || "";
  for (/** Only authored original descendants contribute logical source text. */
  const child of node.content || [])
    result += joinedSourceText(child);
  return result;
}

/**
 * Exercise joined-script source geometry and real outputs in the selected desktop runtime.
 *
 * The packaged gate supplies the real executable. An isolated profile owns all
 * files and native chooser results; actual production serializers and native
 * printing still write every output byte. No Vite server supplies the renderer.
 * @async
 * @returns {Promise<void>} Resolves after native source geometry and actual output checks pass.
 * @throws {Error} If source positions, native identity or real output differs.
 * @example
 * // npm run test:packaged also executes all twelve joining-script line cases.
 */
async function verifyDesktopJoinedLines(): Promise<void> {
  /** Generated temporary paths isolate all native source, PDF and format writes. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-joined-lines-")),
    desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** Every action addresses this actual native application renderer. */
    const page = await desktop.firstWindow();
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(
        await desktop.evaluate(
          /**
           * Inspect actual native application identity rather than inferring it from arguments.
           *
           * The packaged regression must never substitute the development app.
           * @param {typeof import('electron')} context - Actual native exports.
           * @returns {boolean} Whether the real running application is packaged.
           * @example
           * // Actual packaged execution is asserted before source geometry is inspected.
           */
          ({ app }) => app.isPackaged,
        ),
      ).toBe(true);
    await expect(page.locator(".tiptap")).toBeVisible();
    for (/** Original contextual source and font fallback remain script-specific. */
    const script of JOINED_SCRIPTS)
      for (/** Actual proportional, fixed and zero progress cover independent native modes. */
      const spacing of ["1.6", "18pt", "0pt"]) {
        /** Native source heights and independently verified line baselines stay in physical units. */
        const content: JSONContent[] = [],
          sizes = [32, 16, 24],
          expected: number[] = [];
        let height = 0;
        for (let index = 0; index < sizes.length; index++) {
          if (index) content.push({ type: "hardBreak" });
          content.push({
            type: "text",
            text: script.words[index],
            marks: [
              {
                type: "textStyle",
                attrs: { fontFamily: "Arial", fontSize: sizes[index] + "pt" },
              },
            ],
          });
          expected.push(height + ((sizes[index] * 4) / 3) * 0.85);
          height +=
            spacing === "1.6"
              ? ((sizes[index] * 4) / 3) * 1.6
              : spacing === "18pt"
                ? 24
                : 0;
        }
        /** Literal generated source imports exercise the production document pipeline. */
        const name = `desktop-${script.id}-${spacing}.forhan`;
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
                      attrs: { lineHeight: spacing, textAlign: "left" },
                      content,
                    },
                  ],
                },
              }),
            ),
          });
        await expect(page.locator("#toast")).toContainText(name);
        await expect(page.locator(".tiptap p")).toHaveAttribute(
          "data-forhan-layout-height",
          /^-?\d/u,
        );
        /** Physical source ranges independently validate the declared native height. */
        const actual = await page.locator(".tiptap p").evaluate(joinedGeometry);
        expect(actual.height).toBeCloseTo(height, 1);
        expect(actual.runs).toHaveLength(3);
        for (let index = 0; index < sizes.length; index++) {
          expect(actual.runs[index].text).toBe(script.words[index]);
          expect(actual.runs[index].baseline).toBeCloseTo(expected[index], 1);
        }
      }
    for (/** Current Thai zero-progress source exercises native writers, static HTML and actual PDF printing. */
    const format of ["hwp", "hwpx", "html", "pdf"]) {
      /** Each exact output belongs only to this generated profile and cannot overwrite another file. */
      const output = path.join(profile, "joined-native." + format);
      expect(path.dirname(output)).toBe(profile);
      await desktop.evaluate(
        /**
         * Redirect only the owned native chooser result to its exact temporary output.
         *
         * Native IPC, atomic writing, source serialization and printing remain
         * actual production behavior in the selected application process.
         * @param {typeof import('electron')} context - Actual native exports.
         * @param {string} output - Exact test-owned destination path.
         * @returns {void} Installs the owned save destination.
         * @example
         * // The real application still produces every HWP/HWPX/HTML/PDF output byte.
         */
        ({ dialog }, output) => {
          dialog.showSaveDialog =
            /**
             * Resolve the owned save chooser with the exact generated output.
             *
             * No interactive chooser or unrelated user path is accessed.
             * @async
             * @returns {Promise<{canceled:false;filePath:string}>} The exact owned destination.
             * @example
             * // Only the next test-owned output file can be written.
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
           * Observe the actual production atomic output rather than a simulated serializer response.
           *
           * Only initial absence is retried; other filesystem errors remain failures.
           * @async
           * @returns {Promise<boolean>} Whether the real native output exists.
           * @throws {Error} If an unexpected filesystem failure occurs.
           * @example
           * // Native PDF printing must finish before its bytes can be inspected.
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
      /** Independent output readers inspect actual production bytes. */
      const bytes = await readFile(output);
      if (format === "hwp" || format === "hwpx") {
        /** Source decoding must preserve original contextual Thai text and both hard breaks. */
        const parsed =
          format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
        expect(joinedSourceText(parsed.doc)).toBe(
          JOINED_SCRIPTS[3].words.join(""),
        );
        expect(parsed.doc.content?.[0].attrs?.lineHeight).toBe("0pt");
      } else if (format === "pdf")
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      else {
        /** Actual static HTML contains both original zero progress and coherent source text. */
        const html = bytes.toString("utf8");
        expect(html).toContain('data-forhan-layout-height="0"');
        for (/** Original strings remain literal text without isolated presentation-form substitutions. */
        const word of JOINED_SCRIPTS[3].words)
          expect(html).toContain(word);
      }
    }
  } finally {
    await desktop.evaluate(
      /**
       * End only the owned native regression application without opening a save guard.
       *
       * Every actual output has already been independently inspected.
       * @param {typeof import('electron')} context - Actual native exports.
       * @returns {void} Exits only this test-owned process.
       * @example
       * // Other application profiles and user windows remain untouched.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (
      path.dirname(profile) === path.resolve(tmpdir()) &&
      path.basename(profile).startsWith("forhan-joined-lines-")
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
  "native desktop joined-script lines retain source baselines and actual HWP, HWPX, HTML and PDF output",
  verifyDesktopJoinedLines,
);
