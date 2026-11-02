import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  inspectPackagedApplication,
  packageDigest,
  type PackageArchitecture,
} from "./lib/native-package.ts";
import {
  inventoryDistribution,
  requireMatchingDistribution,
  distributionFileDigest,
} from "./lib/distribution-content.ts";
import { observeMacApplications } from "../tests/helpers/macos-owned-application.ts";

/**
 * Verify actual macOS file requests against an original qualified downloadable ZIP payload.
 *
 * Original workflow, container, native executable, ASAR, signature and complete
 * inventory identities must agree before real LaunchServices routing executes.
 * Every source format must pass cold, warm, resident, cancellation and native save checks.
 * @async
 * @returns {Promise<void>} Resolves after complete original native routing evidence and owned cleanup are retained.
 * @throws {Error} If host, provenance, source, routing, output or cleanup validation fails.
 * @example
 * // FORHAN_ORIGINAL_RUN=41408280436 node scripts/test-macos-file-open.ts
 */
async function main(): Promise<void> {
  assert.equal(process.platform, "darwin");
  assert.ok(process.arch === "arm64" || process.arch === "x64");
  /** The selected original workflow run is explicit, immutable and inspected independently through GitHub. */
  const runId = process.env.FORHAN_ORIGINAL_RUN;
  assert.ok(runId && /^[1-9][0-9]+$/u.test(runId));
  /** Current source and original downloaded artifacts retain independently resolved roots. */
  const root = fileURLToPath(new URL("../", import.meta.url)),
    validation = path.join(root, "release/validation"),
    manifest = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    ),
    originalRoot = path.join(
      root,
      ".tools/original-validation/release/validation",
    ),
    native = JSON.parse(
      await readFile(
        path.join(originalRoot, "native-darwin-" + process.arch + ".json"),
        "utf8",
      ),
    ),
    distributions = JSON.parse(
      await readFile(
        path.join(
          originalRoot,
          "distributions-darwin-" + process.arch + ".json",
        ),
        "utf8",
      ),
    ),
    originalRun = JSON.parse(
      execFileSync("gh", ["api", `repos/aodjo/forhan/actions/runs/${runId}`], {
        encoding: "utf8",
        timeout: 30000,
      }),
    );
  assert.equal(originalRun.status, "completed");
  assert.equal(originalRun.conclusion, "success");
  assert.equal(originalRun.repository.full_name, "aodjo/forhan");
  execFileSync(
    "git",
    [
      "diff",
      "--exit-code",
      originalRun.head_sha,
      "HEAD",
      "--",
      "src",
      "electron",
      "public",
      "build",
      "package.json",
      "package-lock.json",
      "vite.config.ts",
      "scripts/build-electron.ts",
    ],
    { stdio: "inherit", timeout: 15000 },
  );
  assert.equal(native.executionVerified, true);
  assert.equal(native.tests.expected, 37);
  assert.equal(native.tests.unexpected, 0);
  assert.equal(native.tests.skipped, 0);
  assert.equal(native.tests.flaky, 0);
  assert.equal(distributions.executionVerified, true);
  assert.equal(distributions.arch, process.arch);
  assert.equal(
    distributions.staging.archiveSha256,
    native.structure.archiveSha256,
  );
  /** Only the actual independently tested original ZIP is selected; a newly built app cannot substitute for it. */
  const variants = distributions.variants.filter(
    /**
     * Select the independently executed original ZIP variant.
     *
     * An unrelated container or copied executable cannot satisfy original artifact provenance.
     * @param {{kind:string}} variant - Original actual distribution observation.
     * @returns {boolean} Whether the original observation identifies the ZIP payload.
     * @example
     * // Exactly one original ZIP execution is required.
     */
    (variant: { kind: string }) => variant.kind === "zip",
  );
  assert.equal(variants.length, 1);
  /** Original container bytes remain fixed before and after actual native execution. */
  const variant = variants[0],
    archive = path.join(
      root,
      ".tools/original-artifacts",
      path.basename(variant.artifact),
    ),
    archiveSha256 = await distributionFileDigest(archive),
    parent = await realpath(tmpdir()),
    owned = await mkdtemp(path.join(parent, "forhan-macos-file-open-payload-")),
    directory = path.join(
      validation,
      "macos-file-open-" + process.arch,
      randomUUID(),
    ),
    summary = path.join(
      validation,
      "macos-file-open-" + process.arch + ".json",
    );
  assert.equal(archiveSha256, variant.artifactSha256);
  assert.equal(variant.executionVerified, true);
  assert.equal(variant.signatureVerified, true);
  await mkdir(directory, { recursive: true });
  await rm(summary, { force: true });
  /** Original evidence and actual phase failure remain retained even if later cleanup is not possible. */
  let success: object | undefined,
    failure: unknown = null,
    removed = false;
  try {
    execFileSync("/usr/bin/ditto", ["-x", "-k", archive, owned], {
      stdio: "inherit",
      timeout: 180000,
    });
    /** Native filesystem resolution establishes the actual selected downloaded executable. */
    const executable = await realpath(
        path.join(
          owned,
          manifest.build.productName + ".app",
          "Contents/MacOS",
          manifest.build.productName,
        ),
      ),
      bundle = path.dirname(path.dirname(path.dirname(executable))),
      structure = await inspectPackagedApplication(root, executable, {
        platform: "darwin",
        arch: process.arch as PackageArchitecture,
        name: manifest.name,
        version: manifest.version,
        main: manifest.main,
        productName: manifest.build.productName,
        bundleId: manifest.build.appId,
      });
    assert.equal(structure.executableSha256, native.structure.executableSha256);
    assert.equal(structure.archiveSha256, native.structure.archiveSha256);
    execFileSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", bundle],
      { stdio: "inherit", timeout: 30000 },
    );
    requireMatchingDistribution(
      distributions.inventory,
      await inventoryDistribution(bundle),
    );
    /** Actual native routing receives its exact original executable and independent reporter paths. */
    const reporter = path.join(directory, "tests.json"),
      result = spawnSync(
        process.execPath,
        [
          path.join(root, "node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          path.join(root, "playwright.macos-file-open.config.ts"),
        ],
        {
          cwd: root,
          stdio: "inherit",
          shell: false,
          timeout: 420000,
          env: {
            ...process.env,
            FORHAN_PACKAGED_EXECUTABLE: executable,
            FORHAN_MACOS_FILE_OPEN_DIRECTORY: directory,
            FORHAN_MACOS_FILE_OPEN_TEST_REPORT: reporter,
          },
        },
      );
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      "Every actual native Mac file-open scenario must pass.",
    );
    /** Complete original execution rejects skipped, partial, flaky or failed native file routing. */
    const stats = JSON.parse(await readFile(reporter, "utf8")).stats,
      formats: object[] = [];
    assert.equal(stats.expected, 3);
    assert.equal(stats.unexpected, 0);
    assert.equal(stats.skipped, 0);
    assert.equal(stats.flaky, 0);
    for (/** All public formats retain independent original native routing and ordinary quit evidence. */ const format of [
      "hwpx",
      "hwp",
      "fhn",
    ]) {
      /** Original output bytes remain unchanged after independent native parsing assertions passed. */
      const reportPath = path.join(directory, format, "run.json"),
        report = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(report.nativeOpenRequestsVerified, true);
      assert.equal(report.normalExit, true);
      assert.equal(report.forced, false);
      assert.equal(report.observations.length, 3);
      assert.equal(
        packageDigest(
          await readFile(
            path.join(directory, format, "actual-saved-output." + format),
          ),
        ),
        report.observations[2].savedOutputSha256,
      );
      formats.push({
        format,
        report: reportPath,
        reportSha256: packageDigest(await readFile(reportPath)),
      });
    }
    requireMatchingDistribution(
      distributions.inventory,
      await inventoryDistribution(bundle),
    );
    assert.equal(await distributionFileDigest(archive), archiveSha256);
    success = {
      kind: "actual-qualified-zip-macos-launchservices-public-format-routing",
      recordedAt: new Date().toISOString(),
      arch: process.arch,
      originalRunId: runId,
      originalSource: originalRun.head_sha,
      testSource: process.env.GITHUB_SHA,
      archive,
      archiveSha256,
      structure,
      tests: stats,
      formats,
      actualColdWarmAndResidentNativeOpenVerified: true,
      normalOwnedTerminationVerified: true,
      physicalAppleImeVerified: false,
      fullUi100Verified: false,
    };
  } catch (error) {
    failure = String(error);
    throw error;
  } finally {
    /** An owned payload is removed only after no Forhan application remains registered. */
    if (observeMacApplications("org.forhan.editor").length === 0) {
      assert.equal(path.dirname(owned), parent);
      assert.ok(
        path.basename(owned).startsWith("forhan-macos-file-open-payload-"),
      );
      await rm(owned, { recursive: true, force: true });
      removed = true;
    }
    await writeFile(
      path.join(directory, "attempt.json"),
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          failure,
          owned,
          ownedPayloadRemoved: removed,
          success: success ?? null,
        },
        null,
        2,
      ) + "\n",
    );
  }
  assert.equal(
    removed,
    true,
    "The actual owned payload must be cleaned up after normal native termination.",
  );
  await writeFile(
    summary,
    JSON.stringify({ ...success, ownedPayloadRemoved: true }, null, 2) + "\n",
  );
}

await main();
