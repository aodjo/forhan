import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { desktopLaunchOptions } from "./helpers/desktop-launch.ts";
import { saveDesktopOutput } from "./helpers/native-output.ts";
import { openParagraphPreview, verifyParagraphPreview } from "./helpers/paragraph-preview.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { paragraphLengthPoints } from "../src/formatting.ts";

/**
 * Verify actual desktop paragraph preview geometry and independent native source files.
 *
 * The actual running package owns every draft, cancellation and source save.
 * Only chooser destinations are controlled. Preview samples cannot enter the
 * original FHN or the HWP/HWPX source written by one applied paragraph edit.
 * @async
 * @returns {Promise<void>} Resolves after actual physical drafts, files and one undo agree.
 * @throws {Error} If runtime identity, native layout or production output differs.
 * @example
 * // npm run test:packaged exercises the distribution without a development server.
 */
async function verifyDesktopParagraphPreview(): Promise<void> {
  test.setTimeout(90000);
  /** Each native process, profile and output belongs to this unique regression run. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-paragraph-preview-")),
    desktop = await electron.launch(desktopLaunchOptions(profile)),
    outputRoot = process.env.FORHAN_PACKAGED_EXECUTABLE
      ? path.resolve("release/validation/paragraph-preview", randomUUID())
      : path.join(profile, "outputs");
  try {
    await mkdir(outputRoot, { recursive: true });
    /** Runtime identity is queried inside the actual selected native application. */
    const identity = await desktop.evaluate(
      /**
       * Observe the real desktop identity independently from launcher arguments.
       *
       * Exact application bytes accompany all retained actual source files.
       * @param {typeof import('electron')} context - Actual selected native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Original process identity.
       * @example
       * // A development executable cannot satisfy the distribution gate.
       */
      ({ app }) => ({ packaged: app.isPackaged, executable: process.execPath, application: app.getAppPath() }),
    );
    if (process.env.FORHAN_PACKAGED_EXECUTABLE) expect(identity.packaged).toBe(true);
    /** Retained evidence binds the actual running native application to its exact files. */
    const hashes = identity.packaged
        ? {
            executableSha256: createHash("sha256").update(await readFile(identity.executable)).digest("hex"),
            archiveSha256: createHash("sha256").update(await readFile(identity.application)).digest("hex"),
          }
        : {},
      page = await desktop.firstWindow(),
      records: Array<{ format: string; output: string; sha256: string }> = [];
    await expect(page.locator(".tiptap")).toBeVisible();
    await page.locator(".tiptap").fill("실제 문서는 미리 보기와 별도로 유지됩니다.");
    /** The real production FHN writer captures the document before local modal edits. */
    const originalBytes = await saveDesktopOutput(desktop, page, "forhan", path.join(outputRoot, "before.fhn")),
      original = JSON.parse(originalBytes.toString("utf8")).doc,
      observations = await verifyParagraphPreview(page),
      unchangedBytes = await saveDesktopOutput(desktop, page, "forhan", path.join(outputRoot, "cancelled.fhn"));
    expect(JSON.parse(unchangedBytes.toString("utf8")).doc).toEqual(original);
    records.push({ format: "forhan", output: path.join(outputRoot, "before.fhn"), sha256: createHash("sha256").update(originalBytes).digest("hex") });
    records.push({ format: "forhan", output: path.join(outputRoot, "cancelled.fhn"), sha256: createHash("sha256").update(unchangedBytes).digest("hex") });
    await openParagraphPreview(page);
    await page.locator('#native-format-form [name="marginLeft"]').fill("20");
    await page.locator('#native-format-form [name="line"]').fill("200");
    await page.locator('[data-modal-value="apply"]').click();
    for (/** Production native and portable formats must retain only the actual original paragraph. */ const format of ["hwpx", "hwp", "forhan"]) {
      /** Every actual output is decoded independently from current renderer attributes. */
      const output = path.join(outputRoot, "applied." + (format === "forhan" ? "fhn" : format)),
        bytes = await saveDesktopOutput(desktop, page, format, output),
        payload = format === "hwp" ? readHwp(bytes) : format === "hwpx" ? await readHwpx(bytes) : JSON.parse(bytes.toString("utf8")),
        paragraph = payload.doc.content[0];
      expect(payload.doc.content.length).toBe(1);
      expect(Math.abs(paragraphLengthPoints(paragraph.attrs.marginLeft) - 20)).toBeLessThan(0.01);
      expect(["2", "200%"]).toContain(String(paragraph.attrs.lineHeight));
      expect(JSON.stringify(payload.doc)).not.toContain("가나다라AaBbCc12345");
      expect(JSON.stringify(payload.doc)).not.toContain("paragraphPreviewActive");
      records.push({ format, output, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await page.locator(".tiptap").focus();
    await page.keyboard.press("ControlOrMeta+z");
    /** One document undo restores the source preceding every cancelled preview draft. */
    const restoredOutput = path.join(outputRoot, "restored.fhn"),
      restored = await saveDesktopOutput(desktop, page, "forhan", restoredOutput);
    expect(JSON.parse(restored.toString("utf8")).doc).toEqual(original);
    records.push({ format: "forhan", output: restoredOutput, sha256: createHash("sha256").update(restored).digest("hex") });
    await writeFile(path.join(outputRoot, "run.json"), JSON.stringify({ kind: "actual-native-paragraph-preview-geometry-cancel-source-and-one-undo", identity, ...hashes, observations, records }, null, 2) + "\n");
  } finally {
    await desktop.evaluate(
      /**
       * Exit only this regression's isolated desktop application.
       *
       * Native output evidence stays outside its disposable profile.
       * @param {typeof import('electron')} context - Actual owned application exports.
       * @returns {void} Ends the regression without an unrelated save prompt.
       * @example
       * // User documents and native processes are never selected for cleanup.
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("forhan-paragraph-preview-"))
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

test("actual desktop paragraph previews retain native geometry and exclude their sample from every source file", verifyDesktopParagraphPreview);
