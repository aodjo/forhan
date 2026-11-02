import { spawnSync } from "node:child_process";
import { readFile, mkdir, rm, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  inspectPackagedApplication,
  type PackageArchitecture,
  type PackagePlatform,
} from "./lib/native-package.ts";

/**
 * Inspect the actual native caption before the complete packaged regression suite.
 *
 * This focused diagnostic retains separate original screenshots and statistics;
 * its one executed case never substitutes for the subsequent complete native suite.
 * @async
 * @returns {Promise<void>} Resolves after the original native caption case passes for the exact current package.
 * @throws {Error} If host, package, actual caption, screenshot or original execution validation fails.
 * @example
 * // node scripts/test-native-caption.ts
 */
async function main(): Promise<void> {
  assert.ok(process.platform === "win32" || process.platform === "darwin");
  assert.ok(process.arch === "x64" || process.arch === "arm64");
  /** The matching real native executable is selected from this source's actual builder output. */
  const root = fileURLToPath(new URL("../", import.meta.url)),
    manifest = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ),
    executable = await realpath(
      path.join(
        root,
        "release",
        process.platform === "win32"
          ? "win-unpacked"
          : process.arch === "arm64"
            ? "mac-arm64"
            : "mac",
        ...(process.platform === "win32"
          ? [manifest.build.productName + ".exe"]
          : [
              manifest.build.productName + ".app",
              "Contents",
              "MacOS",
              manifest.build.productName,
            ]),
      ),
    ),
    directory = path.join(root, "release/validation"),
    report = path.join(
      directory,
      `native-caption-tests-${process.platform}-${process.arch}.json`,
    ),
    summary = path.join(
      directory,
      `native-caption-${process.platform}-${process.arch}.json`,
    );
  await mkdir(directory, { recursive: true });
  await rm(report, { force: true });
  await rm(summary, { force: true });
  /** Current compiled resources and original machine architecture must match the selected native application. */
  const structure = await inspectPackagedApplication(root, executable, {
      platform: process.platform as PackagePlatform,
      arch: process.arch as PackageArchitecture,
      name: manifest.name,
      version: manifest.version,
      main: manifest.main,
      productName: manifest.build.productName,
      bundleId: manifest.build.appId,
    }),
    result = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        path.join(root, "playwright.packaged.config.ts"),
        "native-window-caption-desktop.spec.ts",
        "--output",
        path.join(
          root,
          `test-results/native-caption-${process.platform}-${process.arch}`,
        ),
      ],
      {
        cwd: root,
        stdio: "inherit",
        shell: false,
        timeout: 120000,
        env: {
          ...process.env,
          FORHAN_PACKAGED_EXECUTABLE: executable,
          FORHAN_PACKAGED_TEST_REPORT: report,
        },
      },
    );
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    "The focused actual native caption must pass.",
  );
  /** This one-case observation stays separate from complete-suite and copied-container qualification. */
  const stats = JSON.parse(await readFile(report, "utf8")).stats;
  assert.equal(stats.expected, 1);
  assert.equal(stats.unexpected, 0);
  assert.equal(stats.skipped, 0);
  assert.equal(stats.flaky, 0);
  await writeFile(
    summary,
    JSON.stringify(
      {
        kind: "focused-actual-native-window-caption",
        recordedAt: new Date().toISOString(),
        structure,
        tests: stats,
        fullPackagedSuiteVerified: false,
        copiedDistributionsVerified: false,
      },
      null,
      2,
    ) + "\n",
  );
}

await main();
