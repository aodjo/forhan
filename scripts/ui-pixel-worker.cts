import { app, nativeImage } from "electron";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { compareUiPixels } from "./ui-pixels.ts";

app.disableHardwareAcceleration();

/**
 * Select original input paths while excluding the owned Electron profile option.
 *
 * The parent resolves both input paths to absolute filenames before launch.
 * @param {string} value - One original native process argument.
 * @returns {boolean} Whether this argument identifies an original screenshot.
 * @example
 * isImageArgument('--user-data-dir=owned'); // false
 */
function isImageArgument(value: string): boolean {
  return !value.startsWith("--user-data-dir=");
}

/**
 * Decode two actual original screenshots and print a complete unmodified RGB comparison.
 *
 * No browser window or user document is opened. Native decoding retains full
 * dimensions and original file hashes; the shared comparator rejects encoded
 * strings and mismatched buffers before indexing any pixel.
 * @async
 * @returns {Promise<void>} Resolves after original image comparison is written to stdout.
 * @throws {Error} If inputs cannot be read/decoded or their dimensions differ.
 * @example
 * // Launched only by compare-ui.ts inside a disposable owned native profile.
 */
async function main(): Promise<void> {
  await app.whenReady();
  /** Exact absolute input paths come from the owned parent command. */
  const paths = process.argv.slice(2).filter(isImageArgument);
  if (paths.length !== 2)
    throw new Error("Provide exactly two original screenshot paths.");
  /** Original file bytes remain separate from native decoded pixel buffers. */
  const sourceBytes = await readFile(paths[0]),
    targetBytes = await readFile(paths[1]),
    source = nativeImage.createFromBuffer(sourceBytes),
    target = nativeImage.createFromBuffer(targetBytes);
  if (source.isEmpty() || target.isEmpty())
    throw new Error("An original screenshot could not be decoded.");
  /** Both actual buffers share the same native BGRA decoder and channel order. */
  const result = compareUiPixels(
      { ...source.getSize(), data: source.toBitmap() },
      { ...target.getSize(), data: target.toBitmap() },
    ),
    report = {
      kind: "original-native-decoded-ui-rgb-comparison",
      source: paths[0],
      target: paths[1],
      sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      targetSha256: createHash("sha256").update(targetBytes).digest("hex"),
      postCaptureImageEdits: false,
      alignmentEdits: false,
      alphaCompared: false,
      ...result,
    };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n", finish);
}

/**
 * Exit the owned decoder only after its original comparison output is flushed.
 *
 * No visible editor or unrelated application process is targeted.
 * @returns {void} Terminates this disposable comparison worker successfully.
 * @example
 * finish(); // Called after the complete JSON result reaches stdout.
 */
function finish(): void {
  app.exit(0);
}

/**
 * Report a failed native decode without inventing an equality result.
 *
 * A failed comparison leaves original screenshots unchanged and exits nonzero.
 * @param {unknown} error - Actual file, decoder or validation failure.
 * @returns {void} Writes the failure and exits this owned worker.
 * @example
 * fail(new Error('Original screenshot dimensions differ.'));
 */
function fail(error: unknown): void {
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)) + "\n",
  );
  app.exit(1);
}

void main().catch(fail);
