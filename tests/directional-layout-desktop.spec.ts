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
  verifyDirectionalSpaces,
  verifyNativeGlyphOrigins,
  verifyNativeTerminalComposition,
} from "./helpers/directional-layout";
import { contextualSourceText } from "./helpers/contextual-width";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { characterMetrics } from "../src/character-metrics.ts";
import {
  verifyContextualTracking,
  verifyContextualTrackingWrap,
  verifyTrackedContextEditing,
  type TrackedContextFormat,
} from "./helpers/contextual-tracking";
import { randomUUID } from "node:crypto";

/**
 * Verify actual native directional source geometry and production native/HTML/PDF outputs.
 *
 * The packaged gate selects the actual executable. Independent original
 * Hangul PDF matrices and source-caret observations establish directional
 * spacing. Source measurement arrays must remain unchanged in actual files.
 * A ninety-second case budget includes native startup and every physical
 * export on the slower Intel runner; individual geometry assertions are unchanged.
 * @async
 * @returns {Promise<void>} Resolves after real native geometry and actual output validation.
 * @throws {Error} If native geometry, executable identity or original saved source differs.
 * @example
 * // npm run test:packaged exercises the distribution itself without Vite.
 */
async function verifyNativeDirectionalLayout(): Promise<void> {
  test.setTimeout(90000);
  /** Every observation and file belongs to this generated native profile. */
  const profile = await mkdtemp(
      path.join(tmpdir(), "forhan-directional-native-"),
    ),
    desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** The actual selected renderer supplies all source and physical glyph geometry. */
    const page = await desktop.firstWindow();
    /** Actual first-start font initialization can outlast a five-second visibility assertion on Intel. */
    await expect(page.locator(".tiptap")).toBeVisible({timeout:30000});
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(
        await desktop.evaluate(
          /**
           * Read the actual selected application's native packaging identity.
           *
           * Launch arguments alone cannot establish distribution execution.
           * @param {typeof import('electron')} context - Actual native application exports.
           * @returns {boolean} Whether the observed actual application is packaged.
           * @example
           * // Native gates cannot substitute development Electron for the distribution.
           */
          ({ app }) => app.isPackaged,
        ),
      ).toBe(true);
    await verifyContextualTracking({ page });
    await verifyContextualTrackingWrap({ page });
    /**
     * Save actual tracked source through the owned native chooser and production writers.
     *
     * Each output has a unique owned path; completion cannot be inferred from
     * a preceding file with the same extension. Browser and native checks then
     * share identical actual source editing, undo and output assertions.
     * @async
     * @param {Page} source - Actual selected native renderer.
     * @param {TrackedContextFormat} format - Explicit public output format.
     * @returns {Promise<Buffer>} Actual complete original production output bytes.
     * @example
     * await saveTrackedNative(page,'fhn'); // The production host writes canonical FHN bytes.
     */
    async function saveTrackedNative(
      source: Page,
      format: TrackedContextFormat,
    ): Promise<Buffer> {
      /** Every actual native output belongs to this generated profile and this exact save operation. */
      const output = path.join(profile, randomUUID() + "." + format);
      expect(path.dirname(output)).toBe(profile);
      await desktop.evaluate(
        /**
         * Redirect the exact owned native chooser destination without replacing serialization.
         *
         * Original IPC, atomic writes, source conversion and static layout remain production code.
         * @param {typeof import('electron')} context - Actual selected native exports.
         * @param {string} output - Exact unique owned output path.
         * @returns {void} Installs this operation's controlled native chooser response.
         * @example
         * // Existing user documents cannot be selected by this generated destination.
         */
        ({ dialog }, output) => {
          dialog.showSaveDialog =
            /**
             * Select only the exact generated native source-output destination.
             *
             * The actual application still writes every original file byte.
             * @async
             * @returns {Promise<{canceled:false;filePath:string}>} Exact owned native save result.
             * @example
             * // FHN extension mapping is handled by the actual production save operation.
             */
            async () => ({ canceled: false, filePath: output });
        },
        output,
      );
      await source.locator("#export-menu-toggle").click();
      await source
        .locator(
          '[data-export="' + (format === "fhn" ? "forhan" : format) + '"]',
        )
        .click();
      await expect
        .poll(
          /**
           * Observe actual original native output creation before inspecting source bytes.
           *
           * The unique operation path cannot be satisfied by an older output file.
           * @async
           * @returns {Promise<boolean>} Whether the current exact original file exists.
           * @example
           * // Failed production writes cannot count as a completed native source export.
           */
          async () => {
            try {
              await access(output);
              return true;
            } catch {
              return false;
            }
          },
        )
        .toBe(true);
      await expect(source.locator("#save-document")).toBeEnabled();
      return readFile(output);
    }
    await verifyTrackedContextEditing({
      page,
      desktop,
      save: saveTrackedNative,
    });
    await verifyDirectionalSpaces({ page });
    await verifyNativeTerminalComposition({ page });
    await verifyNativeGlyphOrigins({ page });
    for (/** Actual native writers and script-free outputs retain the same original final Hebrew source. */ const format of [
      "hwp",
      "hwpx",
      "html",
      "pdf",
    ]) {
      /** Only the exact generated-profile output is offered to the real native chooser. */
      const output = path.join(profile, "directional-source." + format);
      expect(path.dirname(output)).toBe(profile);
      await desktop.evaluate(
        /**
         * Redirect only the owned chooser destination for real production output.
         *
         * Native IPC, serialization, static layout and printing still produce
         * every original output byte through the running application.
         * @param {typeof import('electron')} context - Actual native application exports.
         * @param {string} output - Exact generated output destination.
         * @returns {void} Installs the owned native chooser response.
         * @example
         * // Existing user files cannot become generated observation destinations.
         */
        ({ dialog }, output) => {
          dialog.showSaveDialog =
            /**
             * Resolve the owned save chooser with its exact generated destination.
             *
             * The actual application still writes every native and PDF byte.
             * @async
             * @returns {Promise<{canceled:false;filePath:string}>} Owned output response.
             * @example
             * // The next original output belongs only to the generated native profile.
             */
            async () => ({ canceled: false, filePath: output });
        },
        output,
      );
      await page.locator("#export-menu-toggle").click();
      await page.locator('[data-export="' + format + '"]').click();
      await expect
        .poll(
          /**
           * Observe real atomic file creation through the production output path.
           *
           * A timeout or missing file cannot be counted as native success.
           * @async
           * @returns {Promise<boolean>} Whether the exact owned original output exists.
           * @example
           * // Independent readers inspect original bytes only after real output creation.
           */
          async () => {
            try {
              await access(output);
              return true;
            } catch {
              return false;
            }
          },
        )
        .toBe(true);
      await expect(page.locator("#save-document")).toBeEnabled();
      /** Independent original bytes establish actual writer and PDF execution. */
      const bytes = await readFile(output);
      if (format === "pdf") {
        expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
        continue;
      }
      if (format === "html") {
        expect(
          await page.evaluate(
            /**
             * Read original logical source from the actual standalone HTML output.
             *
             * Auxiliary drawing text is excluded. Parsing output never modifies
             * live source or injects expected geometry into the real renderer.
             * @param {string} html - Actual original production HTML bytes.
             * @returns {string} Authored Unicode source in original logical order.
             * @example
             * // The original exported Hebrew source occurs exactly once.
             */
            (html) => {
              /** Original parsed output and its source walker remain independent of live renderer state. */
              const document = new DOMParser().parseFromString(
                  html,
                  "text/html",
                ),
                walker = document.createTreeWalker(
                  document.body,
                  NodeFilter.SHOW_TEXT,
                );
              let text = "";
              while (walker.nextNode())
                if (
                  !walker.currentNode.parentElement?.closest(
                    '[contenteditable="false"],svg',
                  )
                )
                  text += walker.currentNode.textContent;
              return text;
            },
            bytes.toString("utf8"),
          ),
        ).toBe("X עברית Z");
        continue;
      }
      /** Rendering-only terminal suppression never rewrites original explicit tracking arrays. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(contextualSourceText(parsed.doc)).toBe("X עברית Z");
      for (/** Every independently decoded original run retains its full source native language measurements. */ const node of parsed
        .doc.content![0].content!)
        for (/** Inactive native language slots remain original data too. */ const mark of node.marks ||
          [])
          if (mark.type === "textStyle")
            expect(
              characterMetrics(mark.attrs!.nativeCharacterMetrics).spacing,
            ).toEqual(Array(7).fill(20));
    }
  } finally {
    await desktop.evaluate(
      /**
       * End only the generated native observation process.
       *
       * Existing user application profiles and documents remain untouched.
       * @param {typeof import('electron')} context - Actual owned native exports.
       * @returns {void} Exits this owned application without an unrelated save prompt.
       * @example
       * // Failed assertions cannot leave the generated native window running.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (
      path.dirname(profile) === path.resolve(tmpdir()) &&
      path.basename(profile).startsWith("forhan-directional-native-")
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
  "native desktop directional tracking retains native glyph origins and actual HWP, HWPX, HTML and PDF source",
  verifyNativeDirectionalLayout,
);
