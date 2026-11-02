import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { readHwp } from "../../src/formats/hwp.ts";
import { readHwpx } from "../../src/formats/hwpx.ts";

/**
 * Save actual native document bytes to an exact owned temporary destination.
 *
 * Only the system chooser's answer is redirected. Production renderer
 * serialization, authenticated IPC and atomic filesystem writes remain real.
 * @async
 * @param {ElectronApplication} desktop - Actual owned native application.
 * @param {Page} page - Its original application renderer.
 * @param {string} profile - Owned temporary application directory.
 * @param {string} id - Trusted unique output-case identifier.
 * @param {'forhan'|'hwp'|'hwpx'} format - Explicit production document writer.
 * @returns {Promise<JSONContent>} Independently parsed actual native output.
 * @throws {Error} If native saving fails or any destination escapes the owned profile.
 * @example
 * const doc=await saveNativeCopy(desktop,page,profile,'combined','hwpx');
 */
export async function saveNativeCopy(
  desktop: ElectronApplication,
  page: Page,
  profile: string,
  id: string,
  format: "forhan" | "hwp" | "hwpx",
): Promise<JSONContent> {
  /** Each output identity is inside the already created owned temporary directory. */
  const output = path.join(
    profile,
    id + "." + (format === "forhan" ? "fhn" : format),
  );
  expect(path.dirname(output)).toBe(profile);
  await desktop.evaluate(
    /**
     * Supply only the next native file chooser's exact owned output path.
     *
     * The selected application still performs every production save operation.
     * @param {typeof import('electron')} context - Actual native Electron exports.
     * @param {string} output - Exact absolute owned temporary destination.
     * @returns {void} Replaces only this owned chooser's user-selection result.
     * @example
     * // No document bytes or formatting results are supplied by this callback.
     */
    ({ dialog }, output) => {
      dialog.showSaveDialog =
        /**
         * Resolve the owned native chooser with its generated destination.
         *
         * The real source writer and filesystem bridge remain unchanged.
         * @async
         * @returns {Promise<{canceled:false;filePath:string}>} Owned chooser answer.
         * @example
         * // A later native read observes the actual produced file.
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
       * Wait for the actual native atomic output to become readable.
       *
       * Only file absence is transient; other filesystem errors remain failures.
       * @async
       * @returns {Promise<boolean>} Whether this exact owned output exists.
       * @throws {Error} If a filesystem error other than absence occurs.
       * @example
       * // An earlier case cannot satisfy this unique destination.
       */
      async () => {
        try {
          await access(output);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        }
      },
    )
    .toBe(true);
  /** Actual complete native bytes are read independently after production saving. */
  const bytes = await readFile(output);
  return format === "forhan"
    ? JSON.parse(bytes.toString()).doc
    : format === "hwp"
      ? readHwp(bytes).doc
      : (await readHwpx(bytes)).doc;
}
