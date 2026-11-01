import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { desktopLaunchOptions } from "./helpers/desktop-launch.ts";
import { saveDesktopOutput } from "./helpers/native-output.ts";
import {
  MINIMUM_SPACE_CASES,
  MINIMUM_SPACE_SOURCE,
  nativeMinimumSpaceLines,
  minimumSpaceDocument,
} from "./helpers/paragraph-minimum-space.ts";
import { actualWordBreakLines } from "./helpers/paragraph-word-break.ts";
import { contextualSourceText } from "./helpers/contextual-width.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Match actual native desktop paragraph condensation and retain real output bytes.
 *
 * All forty-eight native source conditions execute through the selected desktop
 * runtime. Representative cases use real minimum-space dialog edits. Every
 * condition saves actual HWPX/HWP/FHN output; two changed wrapping conditions
 * also retain actual HTML and paginated PDF for independent physical checking.
 * @async
 * @returns {Promise<void>} Resolves after actual desktop glyph rows, controls and native outputs agree.
 * @throws {Error} If runtime identity, original source line membership or native output differs.
 * @example
 * // npm run test:packaged uses the actual distribution without a development server.
 */
async function verifyDesktopMinimumSpaces(): Promise<void> {
  test.setTimeout(180000);
  /** One unique profile owns all source documents, native windows and outputs. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-minimum-spaces-")),
    desktop = await electron.launch(desktopLaunchOptions(profile)),
    outputRoot = process.env.FORHAN_PACKAGED_EXECUTABLE
      ? path.resolve("release/validation/paragraph-minimum-space", randomUUID())
      : path.join(profile, "outputs");
  try {
    await mkdir(outputRoot, { recursive: true });
    /** Identity is observed inside the actual selected native process. */
    const identity = await desktop.evaluate(
      /**
       * Read original runtime identity without inferring it from launcher arguments.
       *
       * Actual packaged files accompany every retained output source condition.
       * @param {typeof import('electron')} context - Actual selected native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Observed native process identity.
       * @example
       * // A development runtime cannot satisfy the packaged gate.
       */
      ({ app }) => ({
        packaged: app.isPackaged,
        executable: process.execPath,
        application: app.getAppPath(),
      }),
    );
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(identity.packaged).toBe(true);
    /** Exact runtime hashes bind actual source outputs to the selected distribution. */
    const hashes = identity.packaged
        ? {
            executableSha256: createHash("sha256")
              .update(await readFile(identity.executable))
              .digest("hex"),
            archiveSha256: createHash("sha256")
              .update(await readFile(identity.application))
              .digest("hex"),
          }
        : {},
      page = await desktop.firstWindow(),
      records: Record<string, unknown>[] = [],
      prints: Record<string, unknown>[] = [];
    await expect(page.locator(".tiptap")).toBeVisible();
    for (/** Both original native alignments must retain the same independently observed word boundaries. */ const alignment of [
      "justify",
      "left",
    ])
      for (/** Literal source cases do not derive expected wrapping from the editor's algorithm. */ const [
        index,
        condition,
      ] of MINIMUM_SPACE_CASES.entries()) {
        /** Only native cases with a meaningful changed word boundary use an explicit dialog edit. */
        const edited =
            (condition.fontSpace &&
              condition.condense === 75 &&
              condition.right === 57000) ||
            (!condition.fontSpace &&
              condition.condense === 50 &&
              condition.right === 54000),
          id = alignment + "-" + index,
          name = "native-minimum-" + id + ".fhn",
          fixture = Buffer.from(
            JSON.stringify(
              minimumSpaceDocument(
                condition,
                alignment,
                edited ? 0 : condition.condense,
              ),
            ),
          ),
          dirty = (
            await page.locator("#save-state").getAttribute("class")
          )?.includes("unsaved");
        await page.locator("#file-input").setInputFiles({
          name,
          mimeType: "application/json",
          buffer: fixture,
        });
        if (dirty)
          await page
            .getByRole("button", { name: "저장 안 함", exact: true })
            .click();
        await expect(page.locator("#toast")).toContainText(name);
        await page.locator(".tiptap").click();
        await page.locator('button[data-native-tab="format"]').click();
        await page
          .locator('.native-ribbon [data-native-action="paragraph-format"]')
          .click();
        await expect(page.locator('[name="minimum-space"]')).toHaveValue(
          String(100 - (edited ? 0 : condition.condense)),
        );
        if (edited) {
          await page
            .locator('[name="minimum-space"]')
            .fill(String(100 - condition.condense));
          await page.locator('[data-modal-value="apply"]').click();
        } else
          await page
            .locator('.modal-actions [data-modal-value="cancel"]')
            .click();
        /** Expected native source words come from retained original COM navigation positions. */
        const expected = nativeMinimumSpaceLines(condition);
        await expect
          .poll(
            /**
             * Observe actual desktop source-glyph rows after asynchronous native drawing settles.
             *
             * Measurements exclude inaccessible widgets and use physical source ranges.
             * @async
             * @returns {Promise<string[]>} Original source glyphs grouped by actual physical line.
             * @example
             * // Native source blanks with empty text rectangles use their real wrapper position.
             */
            async () => page.evaluate(actualWordBreakLines, ".tiptap p"),
          )
          .toEqual(expected);
        await expect(page.locator(".tiptap p")).toHaveText(
          MINIMUM_SPACE_SOURCE,
        );
        /** Each production native output retains its own immutable completed bytes. */
        const files: Record<string, unknown>[] = [];
        for (/** Native and portable writers all retain independently stored reduction rather than its UI complement. */ const format of [
          "hwpx",
          "hwp",
          "forhan",
        ]) {
          /** Only the actual production chooser response is redirected to a unique owned destination. */
          const output = path.join(
              outputRoot,
              id + "." + (format === "forhan" ? "fhn" : format),
            ),
            bytes = await saveDesktopOutput(desktop, page, format, output),
            source =
              format === "hwp"
                ? readHwp(bytes)
                : format === "hwpx"
                  ? await readHwpx(bytes)
                  : JSON.parse(bytes.toString("utf8"));
          expect(source.doc.content[0].attrs.nativeParagraphCondense).toBe(
            condition.condense,
          );
          expect(source.doc.content[0].attrs.nativeBreakLatinWord).toBe(0);
          expect(source.doc.content[0].attrs.nativeBreakNonLatinWord).toBe(0);
          expect(contextualSourceText(source.doc)).toBe(MINIMUM_SPACE_SOURCE);
          files.push({
            format,
            output,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
        }
        records.push({
          id,
          alignment,
          condition,
          edited,
          lines: expected,
          fixtureSha256: createHash("sha256").update(fixture).digest("hex"),
          files,
        });
        if (edited && alignment === "left") {
          /** Actual static HTML and paginated PDF remain separate independent production outputs. */
          const htmlFile = path.join(outputRoot, id + ".html"),
            html = await saveDesktopOutput(desktop, page, "html", htmlFile),
            pdfFile = path.join(outputRoot, id + ".pdf"),
            pdf = await saveDesktopOutput(desktop, page, "pdf", pdfFile);
          expect(html.toString("utf8")).toContain(
            'data-forhan-paragraph-condense="' + condition.condense + '"',
          );
          expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
          prints.push({
            id,
            lines: expected,
            html: htmlFile,
            htmlSha256: createHash("sha256").update(html).digest("hex"),
            pdf: pdfFile,
            pdfSha256: createHash("sha256").update(pdf).digest("hex"),
          });
        }
      }
    await writeFile(
      path.join(outputRoot, "run.json"),
      JSON.stringify(
        {
          kind: "actual-native-desktop-minimum-space-physical-lines-and-output-not-REA",
          identity,
          ...hashes,
          records,
          prints,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await desktop.evaluate(
      /**
       * End only the isolated regression-owned native application.
       *
       * Unrelated user applications and source files remain untouched.
       * @param {typeof import('electron')} context - Owned application exports.
       * @returns {void} Exits only this test-owned application without a save prompt.
       * @example
       * // Generated outputs remain retained separately from the disposable profile.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (
      path.dirname(profile) === path.resolve(tmpdir()) &&
      path.basename(profile).startsWith("forhan-minimum-spaces-")
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
  "actual native desktop minimum spacing matches original source line choices and retains all real native output fields",
  verifyDesktopMinimumSpaces,
);
