import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

/**
 * Compile and observe a read-only native input capability helper on the actual Mac host.
 *
 * No application is launched, no input is posted and no permission/source state
 * is changed. Complete native output remains separate from actual typing proof.
 * @async
 * @returns {Promise<void>} Resolves after actual host evidence is retained and the owned helper directory is removed.
 * @throws {Error} If the host, native compilation, original output or cleanup cannot be verified.
 * @example
 * // FORHAN_CAPABILITY_ARCH=arm64 node scripts/probe-macos-native-input-capabilities.ts
 */
async function main(): Promise<void> {
  assert.equal(
    process.platform,
    "darwin",
    "This capability observer requires an actual Mac host.",
  );
  /** The actual Node host architecture must agree with the independently compiled native helper. */
  const expected = process.env.FORHAN_CAPABILITY_ARCH ?? process.arch;
  assert.ok(expected === "arm64" || expected === "x64");
  assert.equal(process.arch, expected);
  /** Native helper paths and cleanup remain limited to a fresh test-owned temporary directory. */
  const directory = await mkdtemp(
      path.join(tmpdir(), "forhan-native-input-capabilities-"),
    ),
    helper = path.join(directory, "input-capabilities"),
    source = path.resolve("scripts/native/macos-input-capabilities.mm");
  try {
    execFileSync(
      "/usr/bin/xcrun",
      [
        "clang++",
        "-fobjc-arc",
        "-Wall",
        "-Wextra",
        "-framework",
        "Foundation",
        "-framework",
        "ApplicationServices",
        "-framework",
        "Carbon",
        "-framework",
        "CoreGraphics",
        source,
        "-o",
        helper,
      ],
      { stdio: "inherit", timeout: 60000 },
    );
    /** Original complete native stdout supplies all permissions and installed input-source facts. */
    const stdout = execFileSync(helper, [], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      }),
      native = JSON.parse(stdout);
    assert.equal(native.kind, "read-only-native-macos-input-capabilities");
    assert.equal(native.arch, expected);
    assert.equal(native.eventsPosted, 0);
    assert.equal(native.inputSourcesChanged, 0);
    assert.equal(native.permissionsRequested, false);
    assert.equal(native.targetApplicationLaunched, false);
    assert.equal(native.nativeTypingVerified, false);
    /** Retained native JSON remains unmodified beside explicit observer provenance and limitations. */
    const output = path.resolve("release/validation");
    await mkdir(output, { recursive: true });
    /** The actual installed SDK supplies the primary native API contract for the observed enable/selection behavior. */
    const sdk = execFileSync("/usr/bin/xcrun", ["--show-sdk-path"], {
        encoding: "utf8",
        timeout: 15000,
      }).trim(),
      header = path.join(
        sdk,
        "System/Library/Frameworks/Carbon.framework/Frameworks/HIToolbox.framework/Headers/TextInputSources.h",
      ),
      headerBytes = await readFile(header),
      headerText = headerBytes.toString("utf8"),
      contracts: Record<string, string> = {};
    for (/** Only the three relevant public input-source contracts are retained from the actual installed SDK. */ const name of [
      "TISEnableInputSource",
      "TISDisableInputSource",
      "TISSelectInputSource",
    ]) {
      /** The actual declaration anchors the original preceding documentation rather than a guessed web description. */
      const match = new RegExp("^" + name + "\\s*\\(", "mu").exec(headerText);
      assert.ok(
        match,
        "The actual SDK does not expose the expected declaration: " + name,
      );
      /** Complete preceding native documentation remains verbatim and content-bound to the original SDK header. */
      const begin = headerText.lastIndexOf("/*", match.index),
        end = headerText.indexOf(";", match.index) + 1;
      assert.ok(begin >= 0 && end > match.index && end - begin < 30000);
      contracts[name] = headerText.slice(begin, end);
    }
    await writeFile(
      path.join(output, `macos-input-capabilities-${expected}-contracts.json`),
      JSON.stringify(
        {
          kind: "actual-installed-macos-input-source-sdk-contracts",
          arch: expected,
          sdk,
          header,
          headerSha256: createHash("sha256").update(headerBytes).digest("hex"),
          contracts,
          nativeTypingVerified: false,
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      path.join(output, `macos-input-capabilities-${expected}-native.json`),
      stdout,
    );
    /** Preflight results cannot be promoted into successful native typing execution. */
    const report = {
      recordedAt: new Date().toISOString(),
      kind: "actual-macos-read-only-input-capability-observation",
      platform: process.platform,
      arch: process.arch,
      sourceSha256: createHash("sha256")
        .update(await readFile(source))
        .digest("hex"),
      helperSha256: createHash("sha256")
        .update(await readFile(helper))
        .digest("hex"),
      native,
      applicationTypingExecutionVerified: false,
      permissionsChanged: false,
      inputSourceStateChanged: false,
      limitations: [
        "Permission preflight verdicts do not prove that a native keyboard event reaches an application or its IME.",
        "Installed source metadata does not prove that a disabled Korean source can be enabled or selected.",
        "This observer did not execute Forhan or test actual Hangul composition.",
      ],
    };
    await writeFile(
      path.join(output, `macos-input-capabilities-${expected}.json`),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        arch: expected,
        postEventsAllowed: native.postEventsAllowed,
        accessibilityTrusted: native.accessibilityTrusted,
        koreanSourceCount: native.koreanSources.length,
        nativeTypingVerified: false,
      }),
    );
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(
      path.basename(directory).startsWith("forhan-native-input-capabilities-"),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
