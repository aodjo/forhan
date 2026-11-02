import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  inspectPackagedApplication,
  MIN_NATIVE_REGRESSIONS,
  type PackageArchitecture,
  type PackageExpectation,
} from "./lib/native-package.ts";
import {
  distributionFileDigest,
  inventoryDistribution,
  requireMatchingDistribution,
} from "./lib/distribution-content.ts";

/** Only the two actual user-distributed Mac containers participate in this native gate. */
const DISTRIBUTION_KINDS = ["zip", "dmg"] as const;
/** Each ZIP extraction and DMG copy verifies actual identity/fonts, complete native quit and app-session format copying. */
const REQUIRED_PAYLOAD_TESTS = 6;

/**
 * Execute a native macOS tool with direct arguments and bounded diagnostics.
 *
 * No command shell, privilege change or system-wide security setting is involved.
 * @param {string} executable - Explicit system executable or the current Node binary.
 * @param {string[]} args - Original argument vector with Unicode paths preserved.
 * @param {string} [input=''] - Optional property-list bytes supplied on standard input.
 * @returns {string} Original UTF-8 standard output.
 * @throws {Error} If the tool fails, times out or emits excessive output.
 * @example
 * nativeTool('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
 */
function nativeTool(executable: string, args: string[], input = ""): string {
  /** The selected native process has an explicit finite budget and no inherited shell. */
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    input,
    shell: false,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      path.basename(executable) +
        " failed: " +
        String(result.stderr || result.stdout).slice(-4000),
    );
  return result.stdout;
}

/**
 * Read actual mounted-image metadata through the operating system's plist decoder.
 *
 * The native JSON conversion retains boolean values without inferring truth from XML text.
 * @returns {Record<string,unknown>[]} Actual currently attached image records.
 * @throws {Error} If either native inspection or property-list conversion fails.
 * @example
 * const images=mountedImages(); // Read-only hdiutil info observation.
 */
function mountedImages(): Record<string, unknown>[] {
  /** Actual attached-image state is decoded by macOS rather than a human-readable output parser. */
  const xml = nativeTool("/usr/bin/hdiutil", ["info", "-plist"]),
    data = JSON.parse(
      nativeTool("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], xml),
    );
  if (!Array.isArray(data.images))
    throw new Error("Native mounted-image metadata has no image list.");
  return data.images;
}

/**
 * Find only the disk image mounted at this invocation's exclusively owned path.
 *
 * Other attached images remain untouched and cannot be selected for cleanup.
 * @param {string} mount - Exact absolute mountpoint beneath this invocation's temporary root.
 * @returns {Record<string,unknown>|null} Matching native image or null when detached.
 * @throws {Error} If the operating system cannot report attached images.
 * @example
 * const ownImage=ownedMountedImage('/private/tmp/forhan-distribution-abc/volume');
 */
function ownedMountedImage(mount: string): Record<string, unknown> | null {
  for (/** Native image records are read without modifying any system attachment. */ const image of mountedImages()) {
    /** Only a matching actual mountpoint establishes ownership of an attached image. */
    const entities = image["system-entities"];
    if (!Array.isArray(entities)) continue;
    for (/** This volume belongs to the current invocation only when its complete mountpoint agrees. */ const entity of entities)
      if (
        typeof entity["mount-point"] === "string" &&
        path.resolve(entity["mount-point"]).normalize("NFC") ===
          mount.normalize("NFC")
      )
        return image;
  }
  return null;
}

/**
 * Run real identity/font and quit regressions against one extracted native executable.
 *
 * The full staging suite has already validated identical bundle bytes. These
 * additional tests establish that the actual relocated user payload launches,
 * enumerates installed fonts and terminates normally on the matching Mac host.
 * @async
 * @param {string} root - Current project with its original production tests.
 * @param {string} executable - Actual ZIP-extracted or DMG-copied executable.
 * @param {PackageArchitecture} arch - Independently selected native host architecture.
 * @param {string} kind - Container identity used for separate evidence paths.
 * @param {string} validation - Original release validation directory.
 * @returns {Promise<Record<string,unknown>>} Actual runtime identity and successful native test summary.
 * @throws {Error} If tests fail, skip, execute partially or identify another application.
 * @example
 * await exercisePayload(root,copiedExecutable,'arm64','zip',validation);
 */
async function exercisePayload(
  root: string,
  executable: string,
  arch: PackageArchitecture,
  kind: string,
  validation: string,
): Promise<Record<string, unknown>> {
  /** Every relocated payload retains independent native identity, report and trace files. */
  const identity = path.join(
      validation,
      `identity-distribution-${arch}-${kind}.json`,
    ),
    report = path.join(validation, `tests-distribution-${arch}-${kind}.json`);
  await rm(identity, { force: true });
  await rm(report, { force: true });
  /** The real distribution is selected explicitly; development Electron cannot substitute for it. */
  const run = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "--config",
      path.join(root, "playwright.packaged.config.ts"),
      "packaged-runtime.packaged.ts",
      "native-quit-desktop.spec.ts",
      "native-format-copy-memory-desktop.spec.ts",
      "native-cell-format-copy-desktop.spec.ts",
      "native-table-cell-dialog-desktop.spec.ts",
      "native-cell-protection-desktop.spec.ts",
      "--output",
      path.join(root, "test-results", "distributions-" + kind),
    ],
    {
      cwd: root,
      stdio: "inherit",
      shell: false,
      timeout: 300000,
      env: {
        ...process.env,
        FORHAN_PACKAGED_EXECUTABLE: executable,
        FORHAN_PACKAGED_PLATFORM: "darwin",
        FORHAN_PACKAGED_ARCH: arch,
        FORHAN_PACKAGED_IDENTITY: identity,
        FORHAN_PACKAGED_TEST_REPORT: report,
      },
    },
  );
  if (run.error) throw run.error;
  if (run.status !== 0)
    throw new Error("Actual " + kind + " payload native regressions failed.");
  /** Native reporter output rejects skipped, flaky and partial relocation checks. */
  const tests = JSON.parse(await readFile(report, "utf8")).stats,
    runtime = JSON.parse(await readFile(identity, "utf8"));
  if (
    tests?.expected !== REQUIRED_PAYLOAD_TESTS ||
    tests.unexpected !== 0 ||
    tests.skipped !== 0 ||
    tests.flaky !== 0
  )
    throw new Error(
      "Relocated payload did not pass every required native regression.",
    );
  if (
    runtime.isPackaged !== true ||
    runtime.platform !== "darwin" ||
    runtime.arch !== arch ||
    path.resolve(runtime.execPath) !== executable ||
    !(runtime.installedFamilies > 0)
  )
    throw new Error(
      "Relocated payload runtime identity differs from the selected native executable.",
    );
  return { runtime, tests };
}

/**
 * Verify both actual downloadable Mac artifacts after a successful complete staging run.
 *
 * ZIP extraction and a read-only DMG mount/copy preserve the signed bundle's
 * complete content. The DMG is detached before its copy executes. Successful
 * evidence requires both actual relocated runtimes and normal owned cleanup.
 * @async
 * @returns {Promise<void>} Writes distribution proof only after both artifacts and cleanup pass.
 * @throws {Error} If native host, source bytes, signature, mounts, execution or cleanup differs.
 * @example
 * // node scripts/test-macos-distributions.ts --arch arm64
 */
async function main(): Promise<void> {
  /** A foreign host cannot emit successful Mac execution evidence. */
  const arch =
    process.argv.length === 2
      ? process.arch
      : process.argv.length === 4 && process.argv[2] === "--arch"
        ? process.argv[3]
        : "";
  if (
    process.platform !== "darwin" ||
    !["x64", "arm64"].includes(arch) ||
    arch !== process.arch
  )
    throw new Error(
      "Mac distributions require their matching actual native macOS host and architecture.",
    );
  /** Source paths come from this script, never an unrelated caller directory. */
  const root = fileURLToPath(new URL("../", import.meta.url)),
    validation = path.join(root, "release", "validation"),
    manifest = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );
  await mkdir(validation, { recursive: true });
  /** Existing successful distribution evidence cannot survive a new failed attempt. */
  const report = path.join(validation, `distributions-darwin-${arch}.json`),
    attempt = path.join(validation, `distribution-attempt-darwin-${arch}.json`);
  await rm(report, { force: true });
  /** The source manifest remains authoritative for copied application identity. */
  const expected: PackageExpectation = {
    platform: "darwin",
    arch: arch as PackageArchitecture,
    name: manifest.name,
    version: manifest.version,
    main: manifest.main,
    productName: manifest.build.productName,
    bundleId: manifest.build.appId,
  };
  /** Complete native staging evidence must exist before a short relocation check can establish artifact equivalence. */
  const staging = JSON.parse(
    await readFile(path.join(validation, `native-darwin-${arch}.json`), "utf8"),
  );
  if (
    staging.kind !== "actual-packaged-native-runtime" ||
    staging.executionVerified !== true ||
    staging.platform !== "darwin" ||
    staging.arch !== arch ||
    staging.signature?.verified !== true ||
    !Number.isSafeInteger(staging.tests?.expected) ||
    staging.tests.expected < MIN_NATIVE_REGRESSIONS ||
    staging.tests.unexpected !== 0 ||
    staging.tests.skipped !== 0 ||
    staging.tests.flaky !== 0
  )
    throw new Error(
      "A complete successful matching native staging report is required.",
    );
  /** Actual filesystem spelling retains the bundle's NFC/NFD helper-name contract. */
  const stageExecutable = await realpath(
      path.join(
        root,
        "release",
        arch === "arm64" ? "mac-arm64" : "mac",
        expected.productName + ".app",
        "Contents",
        "MacOS",
        expected.productName,
      ),
    ),
    stage = await inspectPackagedApplication(root, stageExecutable, expected),
    stageBundle = path.dirname(path.dirname(path.dirname(stageExecutable)));
  if (
    stage.executableSha256 !== staging.structure?.executableSha256 ||
    stage.archiveSha256 !== staging.structure?.archiveSha256 ||
    staging.runtime?.execPath !== stageExecutable ||
    staging.runtime?.appPath !== stage.archive
  )
    throw new Error(
      "The native staging report identifies different current application bytes.",
    );
  nativeTool("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    stageBundle,
  ]);
  /** Every framework, helper, signature, resource and symlink participates in relocation equivalence. */
  const inventory = await inventoryDistribution(stageBundle),
    inventorySha256 = createHash("sha256")
      .update(JSON.stringify(inventory))
      .digest("hex");
  /** Real temporary-parent spelling prevents symlink aliases from weakening mount ownership checks. */
  const temporaryParent = await realpath(tmpdir()),
    owned = await mkdtemp(path.join(temporaryParent, "forhan-distribution-")),
    mount = path.join(owned, "readonly-volume"),
    variants: Record<string, unknown>[] = [],
    cleanupErrors: string[] = [];
  let failure: unknown = null,
    removed = false;
  try {
    for (/** Both containers are independently extracted/copied before actual native execution. */ const kind of DISTRIBUTION_KINDS) {
      /** Artifact selection follows the current builder manifest without accepting a stale wildcard match. */
      const filename = String(manifest.build.mac.artifactName)
        .replaceAll("${version}", expected.version)
        .replaceAll("${arch}", arch)
        .replaceAll("${ext}", kind);
      if (filename !== path.basename(filename) || filename.includes("${"))
        throw new Error("Unsupported Mac distribution artifact filename.");
      /** Original downloaded-container digest remains fixed across extraction, mounting and runtime tests. */
      const artifact = await realpath(path.join(root, "release", filename)),
        artifactSha256 = await distributionFileDigest(artifact),
        destination = path.join(owned, kind);
      await mkdir(destination);
      if (kind === "zip")
        nativeTool("/usr/bin/ditto", ["-x", "-k", artifact, destination]);
      else {
        await mkdir(mount);
        nativeTool("/usr/bin/hdiutil", [
          "attach",
          "-readonly",
          "-nobrowse",
          "-noautoopen",
          "-mountpoint",
          mount,
          "-plist",
          artifact,
        ]);
        /** The actual attached image must report read-only state at this invocation's own mountpoint. */
        const image = ownedMountedImage(mount);
        if (!image || image.writeable !== false)
          throw new Error(
            "The actual owned DMG attachment is not confirmed read-only.",
          );
        nativeTool("/usr/bin/ditto", [
          "--rsrc",
          "--extattr",
          path.join(mount, expected.productName + ".app"),
          path.join(destination, expected.productName + ".app"),
        ]);
        nativeTool("/usr/bin/hdiutil", ["detach", mount]);
        if (ownedMountedImage(mount))
          throw new Error(
            "The owned DMG remains attached before copied payload execution.",
          );
      }
      /** Copied Unicode bundle paths resolve independently of the original staging app. */
      const executable = await realpath(
          path.join(
            destination,
            expected.productName + ".app",
            "Contents",
            "MacOS",
            expected.productName,
          ),
        ),
        bundle = path.dirname(path.dirname(path.dirname(executable))),
        structure = await inspectPackagedApplication(
          root,
          executable,
          expected,
        );
      /** Real copied executables must remain inside this variant's own extracted tree. */
      const relocated = path.relative(destination, executable);
      if (
        path.isAbsolute(relocated) ||
        relocated === ".." ||
        relocated.startsWith(".." + path.sep)
      )
        throw new Error(
          "The distribution resolves to an executable outside its own copied payload.",
        );
      if (
        structure.archiveSha256 !== stage.archiveSha256 ||
        structure.executableSha256 !== stage.executableSha256
      )
        throw new Error(
          "The relocated executable or ASAR differs from the fully tested staging app.",
        );
      nativeTool("/usr/bin/codesign", [
        "--verify",
        "--deep",
        "--strict",
        "--verbose=2",
        bundle,
      ]);
      requireMatchingDistribution(
        inventory,
        await inventoryDistribution(bundle),
      );
      /** Actual identity/fonts and process lifecycle come from this copied executable. */
      const execution = await exercisePayload(
        root,
        executable,
        arch as PackageArchitecture,
        kind,
        validation,
      );
      /** The live relocated archive and version must agree with the independently inspected payload. */
      const runtime = execution.runtime as Record<string, unknown>;
      if (
        runtime.appPath !== structure.archive ||
        runtime.version !== expected.version
      )
        throw new Error(
          "The live relocated archive or version differs from the inspected payload.",
        );
      requireMatchingDistribution(
        inventory,
        await inventoryDistribution(bundle),
      );
      if ((await distributionFileDigest(artifact)) !== artifactSha256)
        throw new Error(
          "Original Mac distribution changed during native verification.",
        );
      variants.push({
        kind,
        artifact,
        artifactSha256,
        structure,
        signatureVerified: true,
        inventorySha256,
        ...execution,
        executionVerified: true,
        dmgDetachedBeforeLaunch: kind === "dmg" ? true : null,
      });
    }
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (ownedMountedImage(mount))
        nativeTool("/usr/bin/hdiutil", ["detach", mount]);
    } catch (error) {
      cleanupErrors.push(String(error));
    }
    try {
      if (ownedMountedImage(mount))
        throw new Error(
          "Owned DMG remains mounted; recursive temporary cleanup is prohibited.",
        );
      if (
        path.dirname(path.resolve(owned)) !== temporaryParent ||
        !path.basename(owned).startsWith("forhan-distribution-")
      )
        throw new Error(
          "Temporary cleanup target is outside the owned native scope.",
        );
      await rm(owned, { recursive: true, force: true });
      removed = true;
    } catch (error) {
      cleanupErrors.push(String(error));
    }
    await writeFile(
      attempt,
      JSON.stringify(
        {
          kind: "actual-macos-distribution-attempt",
          recordedAt: new Date().toISOString(),
          arch,
          ownedTemporaryRoot: owned,
          ownedTemporaryRootRemoved: removed,
          cleanupErrors,
          failure: failure ? String(failure) : null,
          completedVariants: variants,
        },
        null,
        2,
      ) + "\n",
    );
  }
  if (failure || cleanupErrors.length)
    throw new AggregateError(
      [...(failure ? [failure] : []), ...cleanupErrors],
      "Native Mac distribution verification did not complete successfully.",
    );
  await writeFile(
    report,
    JSON.stringify(
      {
        kind: "actual-extracted-macos-distribution-runtime",
        validatedAt: new Date().toISOString(),
        platform: "darwin",
        arch,
        staging: stage,
        stagingNativeTests: staging.tests,
        inventory,
        inventorySha256,
        variants,
        ownedTemporaryRootRemoved: removed,
        cleanupErrors,
        executionVerified: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Verified actual ZIP and DMG payload execution for native Mac ${arch}: ${report}`,
  );
}

await main();
