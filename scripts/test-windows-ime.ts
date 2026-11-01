import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  inspectPackagedApplication,
  packageDigest,
  type PackageExpectation,
} from "./lib/native-package.ts";

/** Each explicit scenario requires actual operating-system composition and native output. */
const IME_SCENARIOS = [
  "original-korean-input",
  "decorated-korean-input",
  "composing-native-save",
  "hyphenated-latin-input",
  "minimum-space-korean-input",
  "line-grid-korean-input",
  "native-sheet-korean-input",
  "shaded-native-sheet-korean-input",
  "grid-shaded-native-sheet-korean-input",
] as const;

/** Exact source identities are checked before and after actual native input execution. */
const IME_SOURCE_FILES = [
  "src/main.ts",
  "src/ui/native-page-view.ts",
  "src/ui/native-fit.ts",
  "src/ui/native-zoom-dialog.ts",
  "src/ui/native-zoom-dialog.css",
  "src/ui/native-scroll.ts",
  "scripts/test-windows-ime.ts",
  "playwright.ime.config.ts",
  "tests/windows-ime.native.ts",
  "tests/helpers/windows-ime.ts",
  "tests/helpers/windows-keyboard.ts",
  "tests/helpers/windows-keyboard.ps1",
  "src/ui/native-selection.ts",
  "src/ui/native-line-layout.ts",
  "src/ui/font-space.ts",
  "src/ui/paragraph-word-break.ts",
  "src/paragraph-word-break.ts",
  "src/paragraph-minimum-space.ts",
  "src/paragraph-space-layout.ts",
  "src/ui/paragraph-numbers.ts",
  "src/ui/paragraph-preview.ts",
  "src/native-grid-layout.ts",
  "src/native-line-layout.ts",
  "src/native-pagination.ts",
  "src/native-page-export.ts",
  "src/native-page-layout.ts",
  "src/ui/native-sheets.ts",
  "src/ui/native-sheet-selection.ts",
  "src/ui/native-sheet-shading.ts",
  "src/ui/paragraph-alignment.ts",
  "src/ui/native-shell.css",
  "tests/helpers/native-shade-pixels.ts",
  "src/print-text.ts",
  "src/native-layout-export.ts",
  "src/paragraph-line-grid.ts",
  "src/section-grid.ts",
  "src/ui/page-grid.ts",
  "src/page-history.ts",
  "src/ui/page-history.ts",
  "src/english-hyphenation.ts",
  "src/data/english-hyphenation.ts",
  "licenses/english-hyphenation.txt",
] as const;

/**
 * Verify actual Korean IME behavior on an interactive Windows x64 distribution.
 *
 * The host must already provide a Korean IME and native foreground input.
 * Missing prerequisites fail explicitly without skipped tests, configuration
 * changes or Unicode/DOM event substitution. The report binds original native
 * input observations and successful scenario results to the exact package.
 * @async
 * @returns {Promise<void>} Writes final native IME evidence after all scenarios pass.
 * @throws {Error} If the host, package, native input, source results or artifacts differ.
 * @example
 * // npm run test:ime:windows -- --executable release/win-unpacked/포한.exe
 */
async function main(): Promise<void> {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error(
      "The actual Korean IME gate requires an interactive Windows x64 host with an installed Korean input method.",
    );
  /** Resource roots do not depend on a caller-controlled current directory. */
  const root = fileURLToPath(new URL("../", import.meta.url)),
    manifest = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );
  if (
    process.argv.length !== 2 &&
    (process.argv.length !== 4 || process.argv[2] !== "--executable")
  )
    throw new Error(
      "Expected an optional --executable followed by one explicit native application path.",
    );
  /** The expected product identity comes from current source metadata rather than the inspected package. */
  const expected: PackageExpectation = {
      platform: "win32",
      arch: "x64",
      name: manifest.name,
      version: manifest.version,
      main: manifest.main,
      productName: manifest.build.productName,
      bundleId: manifest.build.appId,
    },
    executable = path.resolve(
      root,
      process.argv[3] ||
        path.join(
          "release",
          "win-unpacked",
          manifest.build.productName + ".exe",
        ),
    ),
    report = path.join(
      root,
      "release",
      "validation",
      "windows-ime-win32-x64.json",
    ),
    directory = path.join(
      root,
      "release",
      "validation",
      "windows-ime",
      randomUUID(),
    ),
    reporterFile = path.join(directory, "tests.json");
  await mkdir(directory, { recursive: true });
  await rm(report, { force: true });
  /** Native structure and every compiled runtime resource are proven before application execution. */
  const structure = await inspectPackagedApplication(
    root,
    executable,
    expected,
  );
  /** Every original implementation and regression byte is identified before any native key is sent. */
  const sourceHashes: Record<string, string> = {};
  for (/** Each selected source must remain unchanged during the entire observed gate. */ const file of IME_SOURCE_FILES)
    sourceHashes[file] = packageDigest(await readFile(path.join(root, file)));
  /** The explicit native suite never starts a browser preview or development Electron fallback. */
  const processResult = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "--config",
      path.join(root, "playwright.ime.config.ts"),
    ],
    {
      cwd: root,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      timeout: 360000,
      env: {
        ...process.env,
        FORHAN_PACKAGED_EXECUTABLE: executable,
        FORHAN_IME_REPORT_DIRECTORY: directory,
        FORHAN_IME_TEST_REPORT: reporterFile,
      },
    },
  );
  if (processResult.error) throw processResult.error;
  if (processResult.status !== 0)
    throw new Error("Actual native Korean IME scenarios failed.");
  /** The independent reporter rejects empty, skipped, flaky or partially executed input checks. */
  const reporter = JSON.parse(await readFile(reporterFile, "utf8")),
    stats = reporter.stats,
    scenarios: object[] = [];
  if (
    stats?.expected !== IME_SCENARIOS.length ||
    stats.unexpected !== 0 ||
    stats.skipped !== 0 ||
    stats.flaky !== 0
  )
    throw new Error(
      "Every original Korean IME scenario must pass without skips or retries.",
    );
  for (/** Each scenario retains its original native owner and actual source/input observations. */ const id of IME_SCENARIOS) {
    /** Original scenario files cannot be supplied by another gate invocation. */
    const bytes = await readFile(path.join(directory, id + ".json")),
      scenario = JSON.parse(bytes.toString("utf8"));
    if (
      scenario.passed !== true ||
      scenario.identity?.isPackaged !== true ||
      path.resolve(scenario.identity.executable) !== executable ||
      !scenario.observations.length ||
      !scenario.outputs.length ||
      !scenario.rows.length
    )
      throw new Error(
        "Actual native input scenario evidence is incomplete: " + id,
      );
    for (/** All native keyboard requests must refer to the same actual original main process instance. */ const observation of scenario.observations)
      if (
        observation.process !== scenario.identity.pid ||
        observation.startTicks !== scenario.observations[0].startTicks ||
        observation.window !== scenario.identity.window
      )
        throw new Error("Native input ownership changed inside a scenario.");
    for (/** Every retained file preserves the exact production bytes before temporary profile cleanup. */ const output of scenario.outputs)
      if (output.sha256 !== packageDigest(await readFile(output.file)))
        throw new Error(
          "An original native IME output changed before evidence recording.",
        );
    if(id==='shaded-native-sheet-korean-input'||id==='grid-shaded-native-sheet-korean-input'){
      /** Actual provisional source-color frames are retained independently from completed source files. */
      const frames=scenario.rows.filter(
        /**
         * Identify an actual provisional frame recorded by the shaded native input scenario.
         *
         * Completed source observations cannot replace original preedit coverage.
         * @param {{id:string}} row - Actual native scenario observation.
         * @returns {boolean} Whether this row owns one retained provisional frame.
         * @example
         * // The six native keys each retain their own original screenshot identity.
         */
        (row:{id:string})=>row.id==='shaded-native-sheet-preedit');
      if(frames.length!==6)throw new Error('The shaded native scenario must retain every original provisional frame.');
      for(/** Retained screenshots preserve complete original bytes after actual native preedit observation. */const frame of frames)
        if(frame.sha256!==packageDigest(await readFile(frame.file)))throw new Error('An original shaded native preedit frame changed.');
    }
    scenarios.push({ id, sha256: packageDigest(bytes), ...scenario });
  }
  if (
    packageDigest(await readFile(executable)) !== structure.executableSha256 ||
    packageDigest(await readFile(structure.archive)) !== structure.archiveSha256
  )
    throw new Error(
      "The native application changed during actual IME verification.",
    );
  for (/** Final source identity cannot silently differ from the original code that processed actual native input. */ const file of IME_SOURCE_FILES)
    if (
      sourceHashes[file] !==
      packageDigest(await readFile(path.join(root, file)))
    )
      throw new Error("Native IME source changed during verification: " + file);
  await writeFile(
    report,
    JSON.stringify(
      {
        kind: "actual-packaged-korean-windows-ime-native-key-input-and-source-output",
        validatedAt: new Date().toISOString(),
        executionVerified: true,
        platform: process.platform,
        arch: process.arch,
        structure,
        tests: stats,
        sourceHashes,
        reporterSha256: packageDigest(await readFile(reporterFile)),
        scenarios,
        scope:
          "Actual interactive Windows x64 packaged application with the host's installed Korean IME. Guarded Win32 virtual-key input produces original trusted preedit updates and input events. Original installed-Hangul key results establish batchim deletion, resegmentation, arrows, Enter and undo. Decorated Arabic/Hebrew replacement, complete seven-language measurements, one undo and production HWPX/HWP/FHN output are checked. A fresh document saves final composing text through native Ctrl+S with HWPX priority. No input language is installed or reconfigured. Derived completion events retain their original trust flags. This does not establish every IME, touch/pen, all fonts, full UI equality or actual Mac execution.",
        macOSExecuted: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Verified " +
      stats.expected +
      " actual Windows Korean IME scenarios: " +
      report,
  );
}
await main();
