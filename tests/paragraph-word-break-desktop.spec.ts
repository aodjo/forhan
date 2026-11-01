import {saveDesktopOutput} from './helpers/native-output.ts';
import {
  test,
  expect,
  _electron as electron,
} from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID,createHash } from "node:crypto";
import path from "node:path";
import { desktopLaunchOptions } from "./helpers/desktop-launch.ts";
import {
  WORD_BREAK_SOURCE,
  actualWordBreakLines,
  attachWordBreakFonts,
} from "./helpers/paragraph-word-break.ts";
import { contextualSourceText } from "./helpers/contextual-width.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Verify actual native desktop paragraph breaking and all public native outputs.
 *
 * The packaged gate supplies the real distribution executable. Six actual
 * dialog combinations change physical glyph wrapping and retain source modes
 * in HWPX/HWP/FHN; retained outputs support independent installed-Hangul checks.
 * @async
 * @returns {Promise<void>} Resolves after real desktop layout and native outputs agree.
 * @throws {Error} If packaged identity, actual source wrapping or emitted output differs.
 * @example
 * // npm run test:packaged validates the actual distribution without Vite.
 */
async function verifyDesktopWordBreaking(): Promise<void> {
  test.setTimeout(90000);
  /** Every application action and retained output belongs to this isolated native run. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-word-break-")),
    desktop = await electron.launch(desktopLaunchOptions(profile)),
    outputRoot = process.env.FORHAN_PACKAGED_EXECUTABLE
      ? path.resolve("release/validation/paragraph-word-break", randomUUID())
      : path.join(profile, "outputs");
  try {
    await mkdir(outputRoot, { recursive: true });
    /** The actual native renderer performs all dialog, glyph and file operations. */
    const page = await desktop.firstWindow(),
      content: Record<string, unknown>[] = [],
      records: Record<string, unknown>[] = [];
    /** Actual native Latin line layouts must distinguish words, discretionary hyphens and characters. */
    const layouts: string[][][] = [[], []];
    /** Runtime identity binds retained native files to the actual selected application. */
    const identity=await desktop.evaluate(
      /**
       * Read identity from the actual owning native application process.
       *
       * Retained source outputs cannot be attributed through launch arguments alone.
       * @param {typeof import('electron')} context - Actual native application exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual native runtime identity.
       * @example
       * // A packaged ASAR identity accompanies every retained public native output.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    /** Exact packaged bytes remain separate from native runtime-supplied paths. */
    const hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    await expect(page.locator(".tiptap")).toBeVisible();
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(
        await desktop.evaluate(
          /**
           * Verify the actual running native application is packaged.
           *
           * Launcher arguments alone cannot establish production execution.
           * @param {typeof import('electron')} context - Actual native application exports.
           * @returns {boolean} Actual running application packaging identity.
           * @example
           * // The packaged gate fails if a development runtime was substituted.
           */
          ({ app }) => app.isPackaged,
        ),
      ).toBe(true);
    for (/** Original hard line boundaries and 16pt resolved native fonts match the native reference source. */ const [
      index,
      text,
    ] of WORD_BREAK_SOURCE.entries()) {
      if (index) content.push({ type: "hardBreak" });
      content.push({
        type: "text",
        text,
        marks: [
          {
            type: "textStyle",
            attrs: {
              fontFamily: index === 0 ? "맑은 고딕" : "Arial",
              fontSize: "16pt",
            },
          },
        ],
      });
    }
    await page.locator("#file-input").setInputFiles({
      name: "배포 줄 나눔.fhn",
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
                attrs: {
                  textAlign: "left",
                  marginRight: "200pt",
                  nativeBreakLatinWord: 0,
                  nativeBreakNonLatinWord: 1,
                },
                content,
              },
            ],
          },
        }),
      ),
    });
    await expect(page.locator("#toast")).toContainText("배포 줄 나눔.fhn");
    await attachWordBreakFonts(page);
    await page.locator(".tiptap p").click();
    for (/** Every independent native non-Latin choice is exercised in the real modal. */ const nonLatin of [
      0, 1,
    ])
      for (/** Native Latin numeric order remains independent from the visible translated option order. */ const latin of [
        0, 1, 2,
      ]) {
        await page.locator('button[data-native-tab="format"]').click();
        await page
          .locator('.native-ribbon [data-native-action="paragraph-format"]')
          .click();
        await page
          .getByRole("combobox", { name: "한글 단위", exact: true })
          .selectOption(String(nonLatin));
        await page
          .getByRole("combobox", { name: "영어 단위", exact: true })
          .selectOption(String(latin));
        await page.locator('[data-modal-value="apply"]').click();
        await expect(page.locator(".tiptap p")).toHaveAttribute(
          "data-forhan-break-latin-word",
          String(latin),
        );
        await expect(page.locator(".tiptap p")).toHaveAttribute(
          "data-forhan-break-non-latin-word",
          String(nonLatin),
        );
        await expect
          .poll(
            /**
             * Observe real Korean glyph lines after the native layout frame settles.
             *
             * DOM source ranges establish actual layout rather than CSS labels.
             * @async
             * @returns {Promise<string[]>} First two actual native source lines.
             * @example
             * // Native word mode keeps 사자차카타파하 together on its next line.
             */
            async () =>
              (await page.evaluate(actualWordBreakLines, ".tiptap p")).slice(
                0,
                2,
              ),
          )
          .toEqual(
            nonLatin === 0
              ? ["앞말 가나다라마바", "사자차카타파하 뒷말"]
              : ["앞말 가나다라마바 사자차카타", "파하 뒷말"],
          );
        /** Actual source glyph lines and a literal screenshot remain independently inspectable. */
        const id = `non-latin-${nonLatin}-latin-${latin}`,
          lines = await page.evaluate(actualWordBreakLines, ".tiptap p");
        layouts[nonLatin][latin] = lines;
        await page.screenshot({ path: path.join(outputRoot, id + ".png") });
        for (/** Actual atomic output bytes must preserve both independent native fields and all Unicode source. */ const format of [
          "hwpx",
          "hwp",
          "forhan",
        ]) {
          /** Output extensions retain the public HWPX, HWP, FHN ordering and portable naming. */
          const output = path.join(
              outputRoot,
              id + "." + (format === "forhan" ? "fhn" : format),
            ),
            bytes = await saveDesktopOutput(desktop, page, format, output),
            parsed =
              format === "hwp"
                ? readHwp(bytes)
                : format === "hwpx"
                  ? await readHwpx(bytes)
                  : JSON.parse(bytes.toString("utf8"));
          expect(parsed.doc.content[0].attrs.nativeBreakLatinWord).toBe(latin);
          expect(parsed.doc.content[0].attrs.nativeBreakNonLatinWord).toBe(
            nonLatin,
          );
          expect(contextualSourceText(parsed.doc)).toBe(
            WORD_BREAK_SOURCE.join(""),
          );
          records.push({ id, latin, nonLatin, format, file: output, lines });
        }
      }
    for (/** The actual Electron engine must not silently treat hyphenation as ordinary word mode. */ const modes of layouts) {
      expect(modes[0]).not.toEqual(modes[1]);
      expect(modes[1]).not.toEqual(modes[2]);
      expect(modes[0]).not.toEqual(modes[2]);
    }
    /** Actual native printing uses the same static paragraph preparation as HTML export. */
    const pdf = await saveDesktopOutput(
      desktop,
      page,
      "pdf",
      path.join(outputRoot, "word-breaking.pdf"),
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    await writeFile(
      path.join(outputRoot, "run.json"),
      JSON.stringify(
        {
          kind: "actual-native-desktop-dialog-and-file-output-not-REA",
          identity,...hashes,
          records,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await desktop.evaluate(
      /**
       * End only this test-owned native application after its actual outputs are inspected.
       *
       * Other user applications and source documents remain untouched.
       * @param {typeof import('electron')} context - Actual owned native application exports.
       * @returns {void} Exits this isolated native application without a save prompt.
       * @example
       * // No generated regression application remains after completion.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (
      path.dirname(profile) === path.resolve(tmpdir()) &&
      path.basename(profile).startsWith("forhan-word-break-")
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
  "native desktop paragraph word breaking changes physical layout and preserves actual HWPX HWP FHN PDF outputs",
  verifyDesktopWordBreaking,
);
