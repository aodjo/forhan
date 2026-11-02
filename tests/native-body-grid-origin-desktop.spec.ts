import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";
import {
  saveDesktopOutput,
  NATIVE_OUTPUT_TIMEOUT_MS,
} from "./helpers/native-output.ts";
import { observePdf } from "./helpers/pdf.ts";
import { verifyNativePaginationPdf } from "./helpers/native-pagination.ts";
import {
  verifyNativeBodyOrigin,
  verifyNativeBodyOriginPdf,
  verifyNativeBodyBackgroundPdf,
  type NativeBodyOriginFixture,
} from "./helpers/native-body-grid-origin.ts";
import { verifyEditableSheetCase } from "./helpers/editable-sheets.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { validatePage } from "../src/documents.ts";
import { nativePaperGeometry } from "../src/native-page-layout.ts";

/** Every original body condition retains both public native display scales. */
const BODY_ORIGIN_ZOOMS = [50, 125] as const;
/** Selected original inset samples retain all three complete native document outputs. */
const BODY_ORIGIN_SOURCE_FORMATS = ["hwpx", "hwp", "forhan"] as const;

/**
 * Budget one complete original body condition without reducing its measured phases.
 *
 * Each display scale and actual native output gets a bounded phase allowance.
 * Per-output completion still uses the unchanged thirty-second native wait.
 * @param {NativeBodyOriginFixture} row - Actual independently observed original body condition.
 * @returns {number} Bounded complete-condition timeout in milliseconds.
 * @example
 * bodyOriginConditionBudget(original); // Includes native copies for the original inset samples.
 */
function bodyOriginConditionBudget(row: NativeBodyOriginFixture): number {
  return (
    NATIVE_OUTPUT_TIMEOUT_MS *
    (BODY_ORIGIN_ZOOMS.length +
      1 +
      (row.id.endsWith("g1600-p170-paragraphs")
        ? BODY_ORIGIN_SOURCE_FORMATS.length
        : 0))
  );
}

/**
 * Verify original shaded body origins and native source output in the selected desktop application.
 *
 * Eighteen actual source conditions retain every physical page's source coordinates
 * at two public display scales. Real native PDF output is decoded independently;
 * original physical page membership, glyph baselines and opaque shade paths
 * remain the oracle. Three source samples also
 * produce all native containers without introducing default header distances.
 * Other independent paint remains outside this measured solid-background contract.
 * @async
 * @returns {Promise<void>} Resolves after actual desktop glyphs, physical output pages, source shades and native insets agree.
 * @throws {Error} If body placement, independent margins, source characters or native insets change.
 * @example
 * // npm run test:packaged exercises the actual archived application rather than a preview server.
 */
async function verifyDesktopNativeBodyOrigins(): Promise<void> {
  /** Actual fixture scope determines the batch allowance while every original condition remains independently bounded. */
  const fixture = JSON.parse(
      await readFile("tests/fixtures/native-body-grid-origin.json", "utf8"),
    ) as { rows: NativeBodyOriginFixture[] },
    completedConditions: string[] = [];
  expect(fixture.rows.length).toBe(18);
  let batchTimeout = NATIVE_OUTPUT_TIMEOUT_MS * 2;
  for (/** All eighteen original conditions retain their full display, PDF and source-output scope. */ const row of fixture.rows)
    batchTimeout += bodyOriginConditionBudget(row);
  test.setTimeout(batchTimeout);
  /** Unique owned native profiles and output directories prevent cross-run evidence reuse. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-body-origin-")),
    desktop = await electron.launch(desktopLaunchOptions(profile)),
    outputRoot = process.env.FORHAN_PACKAGED_EXECUTABLE
      ? path.resolve("release/validation/native-body-grid-origin", randomUUID())
      : test.info().outputPath("native-body-output");
  try {
    await mkdir(outputRoot, { recursive: true });
    /** Actual renderer readiness also establishes that native application initialization has completed. */
    const page = await desktop.firstWindow();
    await expect(page.locator(".tiptap")).toBeVisible();
    /** Actual running native identity is independent from the requested executable argument. */
    const identity = await desktop.evaluate(
      /**
       * Observe the selected native application's actual runtime identity.
       *
       * A development runtime cannot satisfy a packaged execution claim.
       * @param {typeof import('electron')} context - Native exports from the actual running main process.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual native process identity.
       * @example
       * // Packaged application resources resolve to its own app.asar.
       */
      ({ app }) => ({
        packaged: app.isPackaged,
        executable: process.execPath,
        application: app.getAppPath(),
      }),
    );
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(identity.packaged).toBe(true);
    /** Expected positions and insets come from independently retained original native observations. */
    const records: unknown[] = [],
      hashes = identity.packaged
        ? {
            executableSha256: createHash("sha256")
              .update(await readFile(identity.executable))
              .digest("hex"),
            archiveSha256: createHash("sha256")
              .update(await readFile(identity.application))
              .digest("hex"),
          }
        : {};
    for (/** Every condition enters the actual production importer without patching source or layout. */ const row of fixture.rows) {
      await writeFile(
        path.join(outputRoot, "progress.json"),
        JSON.stringify(
          {
            kind: "actual-native-body-condition-progress",
            expectedConditions: fixture.rows.length,
            completedConditions,
            activeCondition: row.id,
            complete: false,
            conditionTimeoutMs: bodyOriginConditionBudget(row),
            nativeOutputTimeoutMs: NATIVE_OUTPUT_TIMEOUT_MS,
          },
          null,
          2,
        ) + "\n",
      );
      await test.step(
        row.id,
        /**
         * Verify one complete actual native body condition with its original independent expectations.
         *
         * Every scale, physical glyph/background check and real source output
         * remains unchanged. A stalled condition cannot consume the whole batch.
         * @async
         * @returns {Promise<void>} Resolves after this original condition's complete actual source and output checks.
         * @throws {Error} If any original measurement, real output or bounded condition fails.
         * @example
         * // The eighteenth condition receives its own native output wait instead of the last fraction of a shared timeout.
         */
        async (): Promise<void> => {
          await page
            .locator("#file-input")
            .setInputFiles({
              name: row.id + ".fhn",
              mimeType: "application/json",
              buffer: Buffer.from(
                JSON.stringify({
                  application: "forhan",
                  version: 1,
                  page: row.source.page,
                  doc: row.doc,
                }),
              ),
            });
          await expect(page.locator("#toast")).toContainText(row.id);
          for (/** Actual native display scaling retains physical source distances. */ const zoom of BODY_ORIGIN_ZOOMS) {
            await page.locator("#zoom-reset").click();
            await page
              .locator('[name="native-zoom-mode"][value="custom"]')
              .check();
            await page.locator("#native-zoom-value").fill(String(zoom));
            await page.locator('[data-modal-value="apply"]').click();
            await expect(page.locator("#zoom-reset")).toHaveText(zoom + "%");
            await verifyNativeBodyOrigin(page, row);
            await verifyEditableSheetCase(page, row);
          }
          /** Real completed native PDF bytes retain independently measurable source baselines. */
          const file = path.join(outputRoot, row.id + ".pdf"),
            bytes = await saveDesktopOutput(desktop, page, "pdf", file),
            pdf = await observePdf(bytes),
            first = verifyNativeBodyOriginPdf(pdf, row),
            backgroundBoxes = await verifyNativeBodyBackgroundPdf(
              bytes,
              pdf,
              row,
            );
          verifyNativePaginationPdf(pdf, row);
          records.push({
            id: row.id,
            format: "pdf",
            file,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            originalPdfSha256: row.nativePdfSha256,
            firstBody: first,
            backgroundBoxes,
            observed: pdf,
          });
          if (row.id.endsWith("g1600-p170-paragraphs"))
            for (/** Each physical inset preset retains real unchanged source in all three native containers. */ const format of BODY_ORIGIN_SOURCE_FORMATS) {
              /** Actual production writers receive original source independently from drawing-only decorations. */
              const sourceFile = path.join(
                  outputRoot,
                  row.id + "." + (format === "forhan" ? "fhn" : format),
                ),
                sourceBytes = await saveDesktopOutput(
                  desktop,
                  page,
                  format,
                  sourceFile,
                ),
                payload =
                  format === "hwp"
                    ? readHwp(sourceBytes)
                    : format === "hwpx"
                      ? await readHwpx(sourceBytes)
                      : JSON.parse(sourceBytes.toString("utf8")),
                physical = nativePaperGeometry(validatePage(payload.page));
              expect(physical, row.id).toEqual({
                width: row.paper.width,
                height: row.paper.height,
                top: row.paper.top + row.paper.header,
                bottom: row.paper.bottom + row.paper.footer,
                left: row.paper.left,
                right: row.paper.right,
              });
              expect(payload.doc.content.length, row.id).toBe(80);
              records.push({
                id: row.id,
                format,
                file: sourceFile,
                sha256: createHash("sha256").update(sourceBytes).digest("hex"),
              });
            }
        },
        { timeout: bodyOriginConditionBudget(row) },
      );
      completedConditions.push(row.id);
      await writeFile(
        path.join(outputRoot, "progress.json"),
        JSON.stringify(
          {
            kind: "actual-native-body-condition-progress",
            expectedConditions: fixture.rows.length,
            completedConditions,
            activeCondition: null,
            complete: completedConditions.length === fixture.rows.length,
            nativeOutputTimeoutMs: NATIVE_OUTPUT_TIMEOUT_MS,
          },
          null,
          2,
        ) + "\n",
      );
    }
    await writeFile(
      path.join(outputRoot, "run.json"),
      JSON.stringify(
        {
          kind: "actual-native-shaded-first-body-origin-and-independent-source-insets-not-REA",
          identity,
          ...hashes,
          expectedConditions: fixture.rows.length,
          completedConditions,
          complete: true,
          records,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await closeOwnedDesktop(desktop);
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

test(
  "18 actual native shaded documents preserve physical print pages, opaque background paths and stable first-body origins",
  verifyDesktopNativeBodyOrigins,
);
