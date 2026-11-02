import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { readFile, access } from "node:fs/promises";

/**
 * Save actual native application output to an exact test-owned destination.
 *
 * Only the chooser response is supplied. Production file serialization, static
 * layout, native IPC and atomic writing create every actual output byte. The
 * public save control must also finish recovery/recent-file bookkeeping before
 * a subsequent source import can be accepted by the application. Native print
 * jobs have a thirty-second completion budget on cold or busy desktop hosts;
 * their emitted content and geometry checks remain unchanged.
 * @async
 * @param {ElectronApplication} desktop - Actual selected desktop application.
 * @param {Page} page - Actual owning native renderer.
 * @param {string} format - Public native or printable export menu identifier.
 * @param {string} output - Exact generated test-owned output path.
 * @returns {Promise<Buffer>} Actual completed production output bytes.
 * @throws {Error} If native export or observing the actual output fails.
 * @example
 * const bytes=await saveDesktopOutput(desktop,page,'hwpx',ownedOutput);
 */
export async function saveDesktopOutput(
  desktop: ElectronApplication,
  page: Page,
  format: string,
  output: string,
): Promise<Buffer> {
  await desktop.evaluate(
    /**
     * Resolve only the next native chooser with its exact owned destination.
     *
     * The application still creates and writes the real native document.
     * @param {typeof import('electron')} context - Actual native application exports.
     * @param {string} output - Exact isolated output destination.
     * @returns {void} Installs the owned native chooser response.
     * @example
     * // No unrelated user file can be selected by the regression.
     */
    ({ dialog }, output) => {
      dialog.showSaveDialog =
        /**
         * Complete the owned chooser with its exact generated filename.
         *
         * Only the destination response is controlled by the test.
         * @async
         * @returns {Promise<{canceled:false;filePath:string}>} Actual requested output destination.
         * @example
         * // Production atomic saving remains responsible for the emitted bytes.
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
       * Only initial absence is retried; unexpected filesystem errors fail.
       * @async
       * @returns {Promise<boolean>} Whether this exact completed output exists.
       * @throws {Error} If observing the owned file fails unexpectedly.
       * @example
       * // Native PDF printing completes before its bytes are inspected.
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
      {timeout:30000},
    )
    .toBe(true);
  await expect(page.locator("#save-document")).toBeEnabled();
  return readFile(output);
}
