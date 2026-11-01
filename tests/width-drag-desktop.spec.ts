import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { desktopLaunchOptions } from "./helpers/desktop-launch";
import { characterMetrics } from "../src/character-metrics.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Join actual saved model text independently of source-container and drawing markup.
 *
 * Native script normalization may split source runs; auxiliary glyph drawings
 * never contribute authored characters to the serialized document.
 * @param {JSONContent} node - Genuine serialized source node.
 * @returns {string} Original source text in logical document order.
 * @example
 * desktopDragText(saved.doc); // Exactly the native-width text the user edited.
 */
function desktopDragText(node: JSONContent): string {
  let text = node.text || "";
  for (
    /** Only genuine source children contribute original text. */
    const child of node.content ||
    [])
    text += desktopDragText(child);
  return text;
}

/**
 * Redirect only the owned native chooser result to an exact test-profile destination.
 *
 * The production preload bridge, serializer and atomic file-writing code remain
 * responsible for every saved byte. No renderer filesystem access is introduced.
 * @async
 * @param {ElectronApplication} desktop - Actual isolated native application.
 * @param {string} destination - Exact test-owned output path.
 * @returns {Promise<void>} Resolves after the owned native chooser is configured.
 * @example
 * await dragDestination(desktop,file); // The real application still serializes and writes the file.
 */
async function dragDestination(
  desktop: ElectronApplication,
  destination: string,
): Promise<void> {
  await desktop.evaluate(
    /**
     * Replace the native chooser response inside the actual owned main process.
     *
     * Existing production save handlers and atomic filesystem writes are unchanged.
     * @param {typeof import('electron')} context - Actual native Electron exports.
     * @param {string} destination - Exact allowed test-profile output file.
     * @returns {void} Installs the owned chooser response.
     * @example
     * // The next real chooser returns this test-owned path only.
     */
    ({ dialog }, destination) => {
      dialog.showSaveDialog =
        /**
         * Resolve the actual save chooser with the test-owned output destination.
         *
         * No interactive native dialog or unrelated user file is accessed.
         * @async
         * @returns {Promise<{canceled:false;filePath:string}>} Exact owned save response.
         * @example
         * await dialog.showSaveDialog(); // Returns the isolated test profile path.
         */
        async () => ({ canceled: false, filePath: destination });
    },
    destination,
  );
}

/**
 * Drag actual native source glyph edges using trusted physical pointer events.
 *
 * Real source boxes include paper zoom and advance corrections. Pointer capture,
 * model selection and drawing updates all belong to the actual desktop process.
 * @async
 * @param {Page} page - Actual native application renderer.
 * @param {string} first - Unique original source glyph at the anchor.
 * @param {'left'|'right'} firstEdge - Physical anchor edge.
 * @param {string} last - Unique original source glyph at the destination.
 * @param {'left'|'right'} lastEdge - Physical destination edge.
 * @returns {Promise<void>} Resolves after the actual captured pointer is released.
 * @example
 * await desktopSourceDrag(page,'ע','right','ת','left'); // Selects the original Hebrew word.
 */
async function desktopSourceDrag(
  page: Page,
  first: string,
  firstEdge: "left" | "right",
  last: string,
  lastEdge: "left" | "right",
): Promise<void> {
  /** Source glyphs must actually exist after undo or import before observing their physical coordinates. */
  const firstGlyph = page
      .locator(".tiptap forhan-width")
      .filter({ hasText: first })
      .first(),
    lastGlyph = page
      .locator(".tiptap forhan-width")
      .filter({ hasText: last })
      .first();
  await expect(firstGlyph).toBeVisible();
  await expect(lastGlyph).toBeVisible();
  /** Source glyph geometry is observed independently of the expected selection range. */
  const a = (await firstGlyph.boundingBox())!,
    b = (await lastGlyph.boundingBox())!;
  await page.mouse.move(
    firstEdge === "left" ? a.x + 1 : a.x + a.width - 1,
    a.y + a.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    lastEdge === "left" ? b.x + 1 : b.x + b.width - 1,
    b.y + b.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

/**
 * Verify real desktop drag replacement, source undo and native document output.
 *
 * The same regression runs on development Electron and the actual packaged
 * executable selected by the native distribution gate, including Mac CI hosts.
 * No Vite page, simulated editor selection or supplied expected bytes replace
 * actual pointer interaction, production source saving or native serialization.
 * @async
 * @returns {Promise<void>} Resolves after native pointer editing and saved source/native files agree.
 * @throws {Error} If the actual native process, source range or output fails verification.
 * @example
 * // npm run test:packaged verifies this interaction inside the real shipped executable.
 */
async function verifyDesktopSourceDrag(): Promise<void> {
  /** Every native regression owns a fresh profile outside all real application data. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-width-drag-")),
    desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** Actual native identity is observed before interacting with source content. */
    const page = await desktop.firstWindow(),
      packaged = await desktop.evaluate(
        /**
         * Read actual package identity from the running native process.
         *
         * The packaged gate must never substitute development Electron for its executable.
         * @param {typeof import('electron')} context - Actual live native exports.
         * @returns {boolean} Whether the running application is packaged.
         * @example
         * // An explicitly selected distribution must report true.
         */
        ({ app }) => app.isPackaged,
      );
    if (process.env.FORHAN_PACKAGED_EXECUTABLE) expect(packaged).toBe(true);
    await page.waitForSelector(".tiptap");
    /** Exact native arrays are authored source data rather than prebuilt drawing wrappers. */
    const metrics = characterMetrics(null),
      original = "ABC עברית 123 한글",
      file = path.join(profile, "selection.fhn");
    metrics.ratio.fill(75);
    metrics.spacing.fill(20);
    await page.locator("#file-input").setInputFiles({
      name: "desktop-drag.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          application: "forhan",
          version: 1,
          title: "Desktop drag",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { textAlign: "left", lineHeight: "1.6" },
                content: [
                  {
                    type: "text",
                    text: original,
                    marks: [
                      {
                        type: "textStyle",
                        attrs: {
                          fontFamily: "Arial",
                          fontSize: "32pt",
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
    await expect(page.locator("#toast")).toContainText("desktop-drag.forhan");
    await expect(page.locator('.tiptap svg text[direction="rtl"]')).toHaveCount(
      5,
    );
    await desktopSourceDrag(page, "ע", "right", "ת", "left");
    await page.keyboard.type("Q");
    await dragDestination(desktop, file);
    await page.locator("#save-document").click();
    await expect
      .poll(
        /**
         * Read actual production output until the first native source save completes.
         *
         * Only absence before the owned atomic write is retried; malformed source
         * output remains a real regression.
         * @async
         * @returns {Promise<string|null>} Actual saved source text, or null before file creation.
         * @example
         * // The original Hebrew word is replaced without deleting adjacent numbers.
         */
        async () => {
          try {
            return desktopDragText(
              JSON.parse(await readFile(file, "utf8")).doc,
            );
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
          }
        },
      )
      .toBe("ABC Q 123 한글");
    await page.locator(".tiptap").press("ControlOrMeta+z");
    await page.locator("#save-document").click();
    await expect
      .poll(
        /**
         * Reobserve the real atomic source file after one native undo.
         *
         * Existing bytes cannot stand in for a completed production rewrite.
         * @async
         * @returns {Promise<string>} Actual current saved source text.
         * @example
         * // One source undo restores the entire original mixed bidi paragraph.
         */
        async () =>
          desktopDragText(JSON.parse(await readFile(file, "utf8")).doc),
      )
      .toBe(original);
    await page.locator(".tiptap").press("ControlOrMeta+Home");
    await desktopSourceDrag(page, "י", "left", "ב", "right");
    await page.keyboard.type("Q");
    for (
      /** Both actual native formats must retain the same corrected source edit and original measurements. */
      const format of [
      "hwp",
      "hwpx",
    ] as const) {
      /** Every native file belongs to the same isolated test profile. */
      const destination = path.join(profile, "selection." + format);
      await dragDestination(desktop, destination);
      await page.locator("#export-menu-toggle").click();
      await page.locator(`[data-export="${format}"]`).click();
      await expect
        .poll(
          /**
           * Observe completion of the actual native document export.
           *
           * The native serializer supplies all bytes before they are parsed independently.
           * @async
           * @returns {Promise<boolean>} Whether the exact owned output file exists.
           * @example
           * // Production export completes before independent source decoding.
           */
          async () => {
            try {
              await access(destination);
              return true;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT")
                return false;
              throw error;
            }
          },
        )
        .toBe(true);
      /** Native source text and measurement arrays are decoded from actual output bytes. */
      const bytes = new Uint8Array(await readFile(destination)),
        parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(desktopDragText(parsed.doc)).toBe("ABC עQת 123 한글");
      for (
        /** Script normalization cannot flatten or drop original native measurement arrays. */
        const run of parsed
        .doc.content![0].content || [])
        for (
          /** Real source marks remain independent of pointer-only drawing metadata. */
          const mark of run.marks ||
          [])
          if (mark.type === "textStyle") {
            expect(
              characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio,
            ).toEqual(Array(7).fill(75));
            expect(
              characterMetrics(mark.attrs!.nativeCharacterMetrics).spacing,
            ).toEqual(Array(7).fill(20));
          }
    }
  } finally {
    await desktop.evaluate(
      /**
       * End only the owned native test process without an interactive unsaved prompt.
       *
       * All outputs and user data belong to this isolated profile.
       * @param {typeof import('electron')} context - Actual owned native application.
       * @returns {void} Exits this test process only.
       * @example
       * // Test failure cannot leave another editor window behind.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    /** The recursive cleanup target must remain the exact generated native test profile. */
    const target = path.resolve(profile),
      root = path.resolve(tmpdir());
    if (
      path.dirname(target) !== root ||
      !path.basename(target).startsWith("forhan-width-drag-")
    )
      throw new Error("Native drag profile escaped its owned temporary root.");
    await rm(target, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

test(
  "native desktop dragging preserves real bidi source, one undo and HWP/HWPX output",
  verifyDesktopSourceDrag,
);
