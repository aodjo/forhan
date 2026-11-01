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
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { desktopLaunchOptions } from "./helpers/desktop-launch.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { paragraphLengthPoints } from "../src/formatting.ts";

/**
 * Verify precise paragraph drafts through the actual selected desktop runtime.
 *
 * Actual native output files retain original quarter points after unchanged
 * Apply. Pointer and keyboard arrows then change only their own fields in a
 * single undoable source transaction. Retained packaged outputs support an
 * independent installed-Hangul reopen without using the editor's own reader.
 * @async
 * @returns {Promise<void>} Resolves after desktop controls, files and undo agree.
 * @throws {Error} If actual runtime identity, controls or native source differ.
 * @example
 * // npm run test:packaged runs the same checks against the distribution.
 */
async function verifyDesktopParagraphNumbers(): Promise<void> {
  test.setTimeout(90000);
  /** Every native window and output belongs to this unique isolated run. */
  const profile = await mkdtemp(
      path.join(tmpdir(), "forhan-paragraph-numbers-"),
    ),
    desktop = await electron.launch(desktopLaunchOptions(profile)),
    outputRoot = process.env.FORHAN_PACKAGED_EXECUTABLE
      ? path.resolve("release/validation/paragraph-numbers", randomUUID())
      : path.join(profile, "outputs");
  try {
    await mkdir(outputRoot, { recursive: true });
    /** Runtime identity is observed inside the real application process. */
    const identity = await desktop.evaluate(
      /**
       * Read actual desktop identity rather than infer it from launch options.
       *
       * The resulting identity accompanies the retained native source files.
       * @param {typeof import('electron')} context - Actual desktop exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual running application identity.
       * @example
       * // app.isPackaged must be true during the packaged gate.
       */
      ({ app }) => ({
        packaged: app.isPackaged,
        executable: process.execPath,
        application: app.getAppPath(),
      }),
    );
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(identity.packaged).toBe(true);
    /** Exact runtime bytes bind each output to this native distribution. */
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
      original = {
        marginLeft: "1.25pt",
        marginRight: "1.25pt",
        marginTop: "1.25pt",
        marginBottom: "1.25pt",
        textIndent: "-18.25pt",
        lineHeight: "18.25pt",
        nativeBreakLatinWord: 2,
        nativeBreakNonLatinWord: 0,
      };
    await expect(page.locator(".tiptap")).toBeVisible();
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "문단 숫자 원본.fhn",
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
                  attrs: original,
                  content: [{ type: "text", text: "문단 숫자와 저장 정밀도" }],
                },
              ],
            },
          }),
        ),
      });
    await page.locator(".tiptap").click();
    await page.locator('button[data-native-tab="format"]').click();
    for (/** Each stage has actual independent source outputs and a distinct expected result. */ const stage of [
      "unchanged",
      "changed",
      "undone",
    ]) {
      if (stage !== "undone") {
        await page
          .locator('.native-ribbon [data-native-action="paragraph-format"]')
          .click();
        /** All numeric input actions are scoped to the actual owned modal form. */
        const form = page.locator("#native-format-form");
        await expect(form.locator('[name="marginLeft"]')).toHaveValue("1.3");
        await expect(form.locator('[name="textIndent"]')).toHaveValue("18.3");
        await expect(form.locator('[name="line"]')).toHaveValue("18.3");
        if (stage === "changed") {
          await form
            .getByRole("button", { name: "왼쪽 여백 늘리기", exact: true })
            .click();
          await expect(form.locator('[name="marginLeft"]')).toHaveValue("2.0");
          await page.keyboard.type("7");
          await expect(form.locator('[name="marginLeft"]')).toHaveValue("7");
          await form
            .getByRole("button", { name: "오른쪽 여백 줄이기", exact: true })
            .click();
          await form.locator('[name="marginTop"]').press("ArrowUp");
          await form.locator('[name="marginBottom"]').press("ArrowDown");
          await form.locator('[name="line"]').press("ArrowUp");
          await expect(form.locator('[name="line"]')).toHaveValue("19.0");
        }
        await page.mouse.move(1350, 850);
        await page
          .locator(".native-dialog-paragraph")
          .screenshot({ path: path.join(outputRoot, stage + ".png") });
        await page.locator('[data-modal-value="apply"]').click();
        if (stage === "unchanged")
          await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/);
      } else await page.locator(".tiptap").press("ControlOrMeta+z");
      /** Whole-unit arrow edits cannot round an untouched first-line amount. */
      const expected =
        stage === "changed"
          ? {
              marginLeft: 7,
              marginRight: 1,
              marginTop: 2,
              marginBottom: 1,
              textIndent: -18.25,
              lineHeight: 19,
            }
          : {
              marginLeft: 1.25,
              marginRight: 1.25,
              marginTop: 1.25,
              marginBottom: 1.25,
              textIndent: -18.25,
              lineHeight: 18.25,
            };
      for (/** Real public writers create each retained native or portable output. */ const format of [
        "hwpx",
        "hwp",
        "forhan",
      ]) {
        /** Expected files are generated exclusively through the public native save flow. */
        const output = path.join(
            outputRoot,
            stage + "." + (format === "forhan" ? "fhn" : format),
          ),
          bytes = await saveDesktopOutput(desktop, page, format, output),
          source =
            format === "hwp"
              ? await readHwp(bytes)
              : format === "hwpx"
                ? await readHwpx(bytes)
                : JSON.parse(bytes.toString("utf8")),
          actual = source.doc.content[0].attrs;
        for (/** Independent readers inspect native physical values rather than rounded display text. */ const [
          name,
          value,
        ] of Object.entries(expected))
          expect(paragraphLengthPoints(actual[name])).toBeCloseTo(value, 2);
        expect(actual.nativeBreakLatinWord).toBe(2);
        expect(actual.nativeBreakNonLatinWord).toBe(0);
        if (stage !== "changed" && format === "forhan")
          for (/** Portable source retains literal original precision after no-op or undo. */ const [
            name,
            value,
          ] of Object.entries(original))
            expect(actual[name]).toBe(value);
        records.push({
          stage,
          format,
          output,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          expected,
          actual,
        });
      }
    }
    await writeFile(
      path.join(outputRoot, "run.json"),
      JSON.stringify(
        {
          kind: "actual-native-desktop-numeric-controls-and-file-output-not-REA",
          identity,
          ...hashes,
          records,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await desktop.evaluate(
      /**
       * Exit only this regression-owned native application.
       *
       * No user application or source document is selected for cleanup.
       * @param {typeof import('electron')} context - Owned desktop exports.
       * @returns {void} Ends the isolated native application without a prompt.
       * @example
       * // The source application remains untouched after regression cleanup.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (
      path.dirname(profile) === path.resolve(tmpdir()) &&
      path.basename(profile).startsWith("forhan-paragraph-numbers-")
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
  "native desktop paragraph numbers retain precise source through real arrows, native output and one undo",
  verifyDesktopParagraphNumbers,
);
