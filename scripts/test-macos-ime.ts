import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { calibrateMacInput } from "./calibrate-macos-ime.ts";
import {
  inspectPackagedApplication,
  packageDigest,
  type PackageArchitecture,
} from "./lib/native-package.ts";

/**
 * Compile and run the explicit Apple Korean IME gate on a CI-owned native Mac.
 *
 * Complete original helper results, trusted DOM observations and production
 * output bytes remain bound to the actual packaged executable and ASAR digest.
 * This focused gate does not replace full UI or copied ZIP/DMG verification.
 * @async
 * @returns {Promise<void>} Resolves after all three native scenarios and nine document outputs pass.
 * @throws {Error} If host identity, native input, restoration, package identity or output verification fails.
 * @example
 * // GITHUB_ACTIONS=true node scripts/test-macos-ime.ts
 */
async function main(): Promise<void> {
  assert.equal(process.platform, "darwin");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.ok(process.arch === "arm64" || process.arch === "x64");
  /** All paths derive from this selected source and its actual builder manifest. */
  const root = fileURLToPath(new URL("../", import.meta.url)),
    manifest = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ),
    executable = await realpath(
      path.join(
        root,
        "release",
        process.arch === "arm64" ? "mac-arm64" : "mac",
        manifest.build.productName + ".app",
        "Contents",
        "MacOS",
        manifest.build.productName,
      ),
    ),
    validation = path.join(root, "release/validation"),
    summary = path.join(validation, "macos-ime-" + process.arch + ".json"),
    directory = path.join(
      validation,
      "macos-ime-" + process.arch,
      randomUUID(),
    ),
    temporary = await mkdtemp(path.join(tmpdir(), "forhan-macos-ime-helper-")),
    helper = path.join(temporary, "macos-ime-keyboard"),
    source = path.join(root, "scripts/native/macos-ime-keyboard.mm");
  await mkdir(directory, { recursive: true });
  await rm(summary, { force: true });
  try {
    /** Structural inspection rejects another application, architecture or stale compiled source. */
    const before = await inspectPackagedApplication(root, executable, {
      platform: "darwin",
      arch: process.arch as PackageArchitecture,
      name: manifest.name,
      version: manifest.version,
      main: manifest.main,
      productName: manifest.build.productName,
      bundleId: manifest.build.appId,
    });
    execFileSync(
      "/usr/bin/xcrun",
      [
        "clang++",
        "-fobjc-arc",
        "-Wall",
        "-Wextra",
        "-framework",
        "AppKit",
        "-framework",
        "ApplicationServices",
        "-framework",
        "Carbon",
        source,
        "-o",
        helper,
      ],
      { stdio: "inherit", timeout: 60000 },
    );
    await calibrateMacInput(root, temporary, helper, directory);
    /** The real native application and compiled helper are supplied explicitly to the serial input suite. */
    const reporter = path.join(directory, "tests.json"),
      result = spawnSync(
        process.execPath,
        [
          path.join(root, "node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          path.join(root, "playwright.macos-ime.config.ts"),
        ],
        {
          cwd: root,
          stdio: "inherit",
          shell: false,
          timeout: 300000,
          env: {
            ...process.env,
            FORHAN_PACKAGED_EXECUTABLE: executable,
            FORHAN_MACOS_IME_HELPER: helper,
            FORHAN_MACOS_IME_DIRECTORY: directory,
            FORHAN_MACOS_IME_TEST_REPORT: reporter,
          },
        },
      );
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      "Every actual Mac Korean IME scenario must pass.",
    );
    /** Partial, skipped or retried execution cannot establish successful native input. */
    const stats = JSON.parse(await readFile(reporter, "utf8")).stats,
      scenarios: object[] = [];
    assert.equal(stats.expected, 3);
    assert.equal(stats.unexpected, 0);
    assert.equal(stats.skipped, 0);
    assert.equal(stats.flaky, 0);
    for (/** Original independently retained scenario reports must all identify successful native input. */ const id of [
      "korean-phrase",
      "rapid-korean",
      "batchim-deletion",
    ]) {
      /** Original successful report bytes and every retained production output remain independently verifiable. */
      const filename = path.join(directory, id, "success.json"),
        bytes = await readFile(filename),
        scenario = JSON.parse(bytes.toString());
      assert.equal(scenario.verified, true);
      assert.equal(scenario.native.restored, true);
      assert.equal(scenario.native.success, true);
      assert.equal(scenario.outputs.length, 3);
      for (/** Rehashing exact original output bytes rejects stale or substituted proof. */ const output of scenario.outputs)
        assert.equal(packageDigest(await readFile(output.file)), output.sha256);
      scenarios.push({ id, report: filename, sha256: packageDigest(bytes) });
    }
    /** The package inspected after native input must be identical to the package originally selected. */
    const after = await inspectPackagedApplication(root, executable, {
      platform: "darwin",
      arch: process.arch as PackageArchitecture,
      name: manifest.name,
      version: manifest.version,
      main: manifest.main,
      productName: manifest.build.productName,
      bundleId: manifest.build.appId,
    });
    assert.equal(after.executableSha256, before.executableSha256);
    assert.equal(after.archiveSha256, before.archiveSha256);
    await writeFile(
      summary,
      JSON.stringify(
        {
          kind: "actual-packaged-macos-apple-korean-ime",
          recordedAt: new Date().toISOString(),
          arch: process.arch,
          sourceSha: process.env.GITHUB_SHA ?? null,
          structure: before,
          helperSourceSha256: packageDigest(await readFile(source)),
          helperSha256: packageDigest(await readFile(helper)),
          tests: stats,
          scenarios,
          nativeTypingVerified: true,
          fullUi100Verified: false,
          copiedDistributionsVerified: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    assert.equal(path.dirname(temporary), path.resolve(tmpdir()));
    assert.ok(path.basename(temporary).startsWith("forhan-macos-ime-helper-"));
    await rm(temporary, { recursive: true, force: true });
  }
}

await main();
