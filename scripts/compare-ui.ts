import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

/** Native decoder execution is observed through its actual terminal process result. */
const run = promisify(execFile);
/** Only the installed local Electron executable is used for original-image decoding. */
const require = createRequire(import.meta.url);

/**
 * Compare two original UI screenshots through an owned native pixel decoder.
 *
 * The command creates a disposable worker/profile, opens no editor window and
 * never edits either input. A successful JSON result identifies exact original
 * hashes, dimensions and complete decoded RGB counts without alignment.
 * @async
 * @returns {Promise<void>} Resolves after native comparison and owned profile cleanup.
 * @throws {Error} If arguments, local Electron, native decoding or comparison are invalid.
 * @example
 * // node scripts/compare-ui.ts native.png forhan.png
 */
async function main(): Promise<void> {
  /** Literal caller-provided images are resolved before any native worker starts. */
  const args = process.argv.slice(2),
    executable: unknown = require("electron");
  if (args.length !== 2)
    throw new Error(
      "Usage: node scripts/compare-ui.ts <native.png> <forhan.png>",
    );
  if (typeof executable !== "string")
    throw new Error("The local Electron executable is unavailable.");
  /** Exact temporary ownership is retained for the complete native process lifetime. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-ui-compare-"));
  try {
    /** TypeScript worker is bundled only into its disposable owned directory. */
    const bundled = await build({
        entryPoints: [
          fileURLToPath(new URL("./ui-pixel-worker.cts", import.meta.url)),
        ],
        bundle: true,
        platform: "node",
        format: "cjs",
        write: false,
        external: ["electron"],
      }),
      worker = path.join(profile, "compare.cjs");
    if (!bundled.outputFiles?.[0])
      throw new Error("The native comparison worker did not compile.");
    await writeFile(worker, bundled.outputFiles[0].contents);
    /** Real process completion precedes cleanup; timeout and decoder failures cannot produce a passing result. */
    const result = await run(
      executable,
      [
        worker,
        path.resolve(args[0]),
        path.resolve(args[1]),
        "--user-data-dir=" + profile,
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    process.stdout.write(result.stdout);
  } finally {
    /** Recursive cleanup is restricted to the exact owned temporary profile prefix. */
    const absolute = path.resolve(profile),
      ownedPrefix = path.resolve(tmpdir()) + path.sep + "forhan-ui-compare-";
    if (!absolute.startsWith(ownedPrefix))
      throw new Error(
        "Comparison cleanup escaped its owned temporary directory.",
      );
    await rm(absolute, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

/**
 * Report a failed comparison without emitting a misleading pixel score.
 *
 * Original images remain unchanged and the command exits unsuccessfully.
 * @param {unknown} error - Actual argument, worker or image failure.
 * @returns {void} Reports the failure and sets a nonzero process result.
 * @example
 * fail(new Error('Original image dimensions differ.'));
 */
function fail(error: unknown): void {
  process.stderr.write(
    (error instanceof Error ? error.message : String(error)) + "\n",
  );
  process.exitCode = 1;
}

void main().catch(fail);
