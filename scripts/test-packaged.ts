import { readFile, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectPackagedApplication,
  packageDigest,
  MIN_NATIVE_REGRESSIONS,
  MIN_MAC_NATIVE_REGRESSIONS,
  type PackagePlatform,
  type PackageArchitecture,
  type PackageExpectation,
} from "./lib/native-package.ts";

/**
 * Validate and exercise the current packaged app on its actual native host.
 *
 * Structural inspection rejects stale resources before launch. The desktop
 * regression suite then runs the distribution itself, including native file
 * operations, lifecycle and PDF layout. No cross-host structural check is
 * reported as execution, and zero/skipped/failed tests cannot pass this gate.
 * @async
 * @returns {Promise<void>} Writes native evidence only after every required test passes.
 * @throws {Error} If the target differs from the host, package bytes differ or native regressions fail.
 * @example
 * // npm run test:packaged -- --platform darwin --arch arm64
 */
async function main(): Promise<void> {
  /** Script location fixes resource paths independently of the caller's working directory. */
  const root = fileURLToPath(new URL("../", import.meta.url));
  /** Recognized command-line options require explicit values and cannot become shell code. */
  const options = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    /** Target selector supplied by the native CI matrix or a local invocation. */
    const key = process.argv[index],
      value = process.argv[index + 1];
    if (
      !["--platform", "--arch", "--executable"].includes(key) ||
      !value ||
      options.has(key)
    )
      throw new Error(
        "Expected unique --platform, --arch or --executable values.",
      );
    options.set(key, value);
  }
  /** Only known native targets may select evidence filenames. */
  const platform = options.get("--platform") ?? process.platform,
    arch = options.get("--arch") ?? process.arch;
  if (
    !["win32", "darwin"].includes(platform) ||
    !["x64", "arm64"].includes(arch)
  )
    throw new Error("Unsupported packaged native target.");
  /** Separate platform/architecture reports cannot overwrite another matrix job's evidence. */
  const directory = path.join(root, "release", "validation"),
    suffix = `${platform}-${arch}`;
  await mkdir(directory, { recursive: true });
  /** Existing successful evidence cannot survive a failed or interrupted rerun. */
  const report = path.join(directory, `native-${suffix}.json`),
    identity = path.join(directory, `identity-${suffix}.json`),
    results = path.join(directory, `tests-${suffix}.json`);
  await rm(report, { force: true });
  await rm(identity, { force: true });
  await rm(results, { force: true });
  await rm(path.join(directory, `structure-${suffix}.json`), { force: true });
  if (platform !== process.platform || arch !== process.arch)
    throw new Error(
      "Packaged runtime validation requires the matching native platform and architecture.",
    );
  /** Source metadata describes the exact product expected in the packaged archive. */
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  /** Explicit expectation never derives identity from the artifact being inspected. */
  const expected: PackageExpectation = {
    platform: platform as PackagePlatform,
    arch: arch as PackageArchitecture,
    name: manifest.name,
    version: manifest.version,
    main: manifest.main,
    productName: manifest.build.productName,
    bundleId: manifest.build.appId,
  };
  /** Actual filesystem spelling binds source NFC names to decomposed Mac executables before runtime identity comparison. */
  const executable = await realpath(path.resolve(
    root,
    options.get("--executable") ??
      (platform === "win32"
        ? `release/${arch === "x64" ? "win-unpacked" : "win-arm64-unpacked"}/${expected.productName}.exe`
        : `release/${arch === "x64" ? "mac" : "mac-arm64"}/${expected.productName}.app/Contents/MacOS/${expected.productName}`),
  ));
  /** Structural validation must complete before launching any executable. */
  const structure = await inspectPackagedApplication(
    root,
    executable,
    expected,
  );
  await writeFile(
    path.join(directory, `structure-${suffix}.json`),
    JSON.stringify(structure, null, 2) + "\n",
  );
  /** macOS test bundles must also pass the operating system's native signature verifier. */
  let signature: null | { verified: true; tool: string; bundle: string } = null;
  if (platform === "darwin") {
    /** The verified main executable belongs to this exact app bundle. */
    const bundle = path.dirname(path.dirname(path.dirname(executable)));
    /** Ad-hoc CI signing verifies integrity without claiming Developer ID or notarization. */
    const signed = spawnSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", bundle],
      { stdio: "inherit", shell: false },
    );
    if (signed.error) throw signed.error;
    if (signed.status !== 0)
      throw new Error("Native Mac bundle signature validation failed.");
    signature = {
      verified: true,
      tool: "/usr/bin/codesign --verify --deep --strict",
      bundle,
    };
  }
  /** Direct native argument passing avoids command-shell interpolation and source fallback. */
  const run = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "--config",
      path.join(root, "playwright.packaged.config.ts"),
    ],
    {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        FORHAN_PACKAGED_EXECUTABLE: executable,
        FORHAN_PACKAGED_PLATFORM: platform,
        FORHAN_PACKAGED_ARCH: arch,
        FORHAN_PACKAGED_IDENTITY: identity,
        FORHAN_PACKAGED_TEST_REPORT: results,
      },
    },
  );
  if (run.error) throw run.error;
  if (run.status !== 0)
    throw new Error("Actual packaged application regressions failed.");
  /** Reporter output independently rejects an empty, skipped or partial native run. */
  const summary = JSON.parse(await readFile(results, "utf8")).stats;
  if (
    !summary ||
    summary.expected < (platform === "darwin" ? MIN_MAC_NATIVE_REGRESSIONS : MIN_NATIVE_REGRESSIONS) ||
    summary.unexpected !== 0 ||
    summary.skipped !== 0 ||
    summary.flaky !== 0
  )
    throw new Error(
      "Packaged native suite did not pass every required regression.",
    );
  /** Live main-process values must identify the exact executable and archive inspected before launch. */
  const runtime = JSON.parse(await readFile(identity, "utf8"));
  if (
    runtime.isPackaged !== true ||
    runtime.platform !== platform ||
    runtime.arch !== arch ||
    runtime.version !== expected.version ||
    path.resolve(runtime.execPath) !== executable ||
    path.resolve(runtime.appPath) !== structure.archive
  )
    throw new Error(
      "Live packaged identity differs from the structurally inspected artifact.",
    );
  if (
    packageDigest(await readFile(executable)) !== structure.executableSha256 ||
    packageDigest(await readFile(structure.archive)) !== structure.archiveSha256
  )
    throw new Error(
      "Native artifacts changed during packaged runtime validation.",
    );
  await writeFile(
    report,
    JSON.stringify(
      {
        kind: "actual-packaged-native-runtime",
        validatedAt: new Date().toISOString(),
        platform,
        arch,
        structure,
        signature,
        runtime,
        tests: summary,
        executionVerified: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Verified ${summary.expected} actual packaged native regressions: ${report}`,
  );
}
await main();
