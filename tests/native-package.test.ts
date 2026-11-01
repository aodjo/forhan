import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import asar from "@electron/asar";
import {
  nativeArchitecture,
  validateMacBundleInfo,
  inspectPackagedApplication,
  type PackageExpectation,
  type PackagePlatform,
  type PackageArchitecture,
} from "../scripts/lib/native-package.ts";

/** Independent test identity does not derive expected values from the inspected bundle. */
const EXPECTED: PackageExpectation = {
  platform: "darwin",
  arch: "arm64",
  name: "forhan",
  version: "0.1.0",
  main: "electron-dist/main.cjs",
  productName: "포한",
  bundleId: "org.forhan.editor",
};
/** Ordered generated plist exercises adjacent key/value decoding and native file associations. */
const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>포한</string>
<key>CFBundleIdentifier</key><string>org.forhan.editor</string>
<key>CFBundleDocumentTypes</key><array><dict>
<key>CFBundleTypeRole</key><string>Editor</string>
<key>CFBundleTypeExtensions</key><array><string>hwpx</string><string>hwp</string><string>fhn</string></array>
</dict></array>
<key>NSHighResolutionCapable</key><true/>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleExecutable</key><string>포한</string>
</dict></plist>`;

/**
 * Create an independent native header fixture without claiming it is executable.
 *
 * Deliberately minimal synthetic bytes exercise architecture and truncation
 * checks. Only the separate packaged suite can establish actual execution.
 * @param {PackagePlatform} platform - Header format to construct.
 * @param {PackageArchitecture} arch - Required machine field.
 * @returns {Buffer} Synthetic PE32+ or Mach-O executable header.
 * @example
 * nativeArchitecture(header('darwin','arm64'),'darwin'); // 'arm64', structural only.
 */
function header(platform: PackagePlatform, arch: PackageArchitecture): Buffer {
  /** Extra prefix/suffix storage exercises nonzero typed-array byte offsets. */
  const storage = Buffer.alloc(272),
    bytes = storage.subarray(8, 264);
  if (platform === "win32") {
    bytes.writeUInt16LE(0x5a4d, 0);
    bytes.writeUInt32LE(64, 0x3c);
    bytes.writeUInt32LE(0x00004550, 64);
    bytes.writeUInt16LE(arch === "x64" ? 0x8664 : 0xaa64, 68);
    bytes.writeUInt16LE(2, 86);
    bytes.writeUInt16LE(0x20b, 88);
  } else {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(arch === "x64" ? 0x01000007 : 0x0100000c, 4);
    bytes.writeUInt32LE(2, 12);
  }
  return bytes;
}

/**
 * Reject misleading native headers, wrong binary types and truncated ranges.
 *
 * Both architectures are identified from independent machine fields. A renamed
 * DLL, universal Mach-O, wrong byte order and out-of-bounds PE offset must fail.
 * @returns {void} Completes when native format checks distinguish every fixture.
 * @throws {Error} If a malformed image is accepted or a valid header is misidentified.
 * @example
 * // Passing this test alone never establishes a runnable Mac artifact.
 */
function verifyNativeHeaders(): void {
  for (/** Native target format checked independently. */ const platform of [
    "win32",
    "darwin",
  ] as const)
    for (/** Supported architecture encoded directly into the fixture. */ const arch of [
      "x64",
      "arm64",
    ] as const)
      assert.equal(nativeArchitecture(header(platform, arch), platform), arch);
  /** A DLL has a matching machine field but is not an application entry point. */
  const dll = header("win32", "x64");
  dll.writeUInt16LE(0x2002, 86);
  assert.throws(
    /**
     * Inspect the independently marked DLL as a purported app.
     *
     * The executable bit alone cannot override the DLL characteristic.
     * @returns {PackageArchitecture} Would return a machine only if validation regressed.
     * @example
     * // Throws for a DLL renamed with an .exe suffix.
     */
    () => nativeArchitecture(dll, "win32"),
    /PE32/,
  );
  /** A corrupted DOS offset cannot point beyond the owned file bytes. */
  const truncated = header("win32", "x64");
  truncated.writeUInt32LE(0xfffffff0, 0x3c);
  assert.throws(
    /**
     * Read a PE fixture whose optional header is outside the image.
     *
     * This checks bounds before DataView reads can report a plausible machine.
     * @returns {PackageArchitecture} Never returns for the truncated fixture.
     * @example
     * // Throws RangeError before any architecture is accepted.
     */
    () => nativeArchitecture(truncated, "win32"),
    RangeError,
  );
  for (/** Unsupported universal magic, byte order, CPU and dylib type fail independently. */ const [
    offset,
    value,
  ] of [
    [0, 0xcafebabe],
    [0, 0xcffaedfe],
    [4, 0x12345678],
    [12, 6],
  ]) {
    /** Each malformed native image retains the other valid machine fields. */
    const invalid = header("darwin", "arm64");
    invalid.writeUInt32LE(value, offset);
    assert.throws(
      /**
       * Inspect a Mac fixture with one unsupported native field.
       *
       * No filename, target option or host setting can replace actual header evidence.
       * @returns {PackageArchitecture} Never returns for malformed Mach-O metadata.
       * @example
       * // A dylib or unsupported CPU cannot pass as an application.
       */
      () => nativeArchitecture(invalid, "darwin"),
      /Mac/,
    );
  }
}

/**
 * Validate actual plist key/value pairing and required Editor document roles.
 *
 * Correct values under unrelated or duplicate keys must not mask missing identity
 * fields. Finder associations must include all supported editable extensions.
 * @returns {void} Completes after identity and association rejection checks.
 * @throws {Error} If grouped keys, malformed XML or non-Editor roles are accepted.
 * @example
 * // Valid Info.plist structure remains distinct from execution proof.
 */
function verifyBundleMetadata(): void {
  assert.deepEqual(validateMacBundleInfo(PLIST, EXPECTED).documentExtensions, [
    "fhn",
    "hwp",
    "hwpx",
  ]);
  for (/** Independently corrupted identity/role/pairing/extension fixture. */ const xml of [
    PLIST.replace(
      "<key>CFBundleIdentifier</key>",
      "<key>UnrelatedIdentifier</key>",
    ),
    PLIST.replace("<key>CFBundleExecutable</key>", "<key>CFBundleName</key>"),
    PLIST.replace("<string>Editor</string>", "<string>Viewer</string>"),
    PLIST.replace("<string>hwp</string>", "<string>txt</string>"),
    PLIST.replace("<string>0.1.0</string>", "<real>0.1</real>"),
    PLIST.replace("</dict></plist>", "<key>Unpaired</key></dict></plist>"),
    PLIST.replace("</plist>", ""),
  ])
    assert.throws(
      /**
       * Validate one independently damaged generated property list.
       *
       * Every rejection is based on source expectations and ordered native fields.
       * @returns {object} Never returns for the corrupted metadata.
       * @example
       * // Missing HWP associations fail even when HWPX is present.
       */
      () => validateMacBundleInfo(xml, EXPECTED),
      /Mac/,
    );
}

/**
 * Verify archived runtime resources against independent current build bytes.
 *
 * Synthetic Mac and Windows package layouts exercise cross-host structural
 * checks only. Stale renderer files and accidentally archived local instructions
 * reject before the separate native execution gate could launch anything.
 * @async
 * @returns {Promise<void>} Resolves after both layouts and stale/private rejection checks.
 * @throws {Error} If package resource matching or private-artifact rejection fails.
 * @example
 * // Synthetic fixture inspection always returns executionVerified: false.
 */
async function verifyArchivedResources(): Promise<void> {
  /** Every fixture lives under a test-owned temporary root. */
  const root = await mkdtemp(path.join(tmpdir(), "forhan-package-structure-"));
  try {
    /** Independent current compiled outputs are copied separately into the test archive input. */
    const source = path.join(root, "archive-input");
    /** Minimal runtime files include two actually linked hashed renderer assets. */
    const files = new Map<string, string>([
      [
        "package.json",
        JSON.stringify({
          name: EXPECTED.name,
          version: EXPECTED.version,
          main: EXPECTED.main,
        }),
      ],
      [EXPECTED.main, "// Synthetic main fixture; never executed."],
      [
        "electron-dist/preload.cjs",
        "// Synthetic preload fixture; never executed.",
      ],
      [
        "dist/index.html",
        '<script type="module" src="./assets/app-123.js"></script><link href="./assets/app-123.css" rel="stylesheet">',
      ],
      [
        "dist/assets/app-123.js",
        "// Synthetic renderer fixture; never executed.",
      ],
      ["dist/assets/app-123.css", "body { color: black; }"],
    ]);
    for (/** File name and independent fixture content included in the current build and archive. */ const [
      member,
      content,
    ] of files) {
      await mkdir(path.dirname(path.join(root, member)), { recursive: true });
      await mkdir(path.dirname(path.join(source, member)), { recursive: true });
      await writeFile(path.join(root, member), content);
      await writeFile(path.join(source, member), content);
    }
    for (/** Target-specific resource layout inspected without launching its synthetic header. */ const platform of [
      "win32",
      "darwin",
    ] as const) {
      /** Mac structure contains an actual XML Info.plist beside its Resources directory. */
      const bundle = path.join(root, "Fixture.app");
      /** Native entry point differs from a portable installer or source app. */
      const executable =
        platform === "darwin"
          ? path.join(bundle, "Contents", "MacOS", "포한")
          : path.join(root, "win-unpacked", "포한.exe");
      /** Both layouts retain the production resources/app.asar structure. */
      const archive =
        platform === "darwin"
          ? path.join(bundle, "Contents", "Resources", "app.asar")
          : path.join(path.dirname(executable), "resources", "app.asar");
      await mkdir(path.dirname(executable), { recursive: true });
      await mkdir(path.dirname(archive), { recursive: true });
      await writeFile(executable, header(platform, "arm64"));
      if (platform === "darwin")
        await writeFile(path.join(bundle, "Contents", "Info.plist"), PLIST);
      await asar.createPackage(source, archive);
      /** Only structure/content evidence can result from a non-runnable synthetic image. */
      const inspected = await inspectPackagedApplication(root, executable, {
        ...EXPECTED,
        platform,
      });
      assert.equal(inspected.executionVerified, false);
      assert.equal(inspected.files.length, 5);
      assert.equal(
        inspected.macBundle?.identifier ?? null,
        platform === "darwin" ? EXPECTED.bundleId : null,
      );
      await writeFile(
        path.join(root, "dist", "assets", "app-123.js"),
        "// Stale independent current build.",
      );
      await assert.rejects(
        /**
         * Inspect an archive whose renderer differs from the current build.
         *
         * Manifest/version equality cannot override a stale runtime file.
         * @returns {Promise<object>} Rejects before any process is launched.
         * @example
         * // A previously built app cannot pass against changed current JavaScript.
         */
        () =>
          inspectPackagedApplication(root, executable, {
            ...EXPECTED,
            platform,
          }),
        /stale/,
      );
      await writeFile(
        path.join(root, "dist", "assets", "app-123.js"),
        files.get("dist/assets/app-123.js")!,
      );
      await writeFile(
        path.join(source, "AGENTS.md"),
        "Private local instructions.",
      );
      await asar.createPackage(source, archive);
      asar.uncache(archive);
      await assert.rejects(
        /**
         * Reject a distribution containing development-only local instructions.
         *
         * Private artifact filtering checks the actual archive member list.
         * @returns {Promise<object>} Rejects because AGENTS.md was accidentally included.
         * @example
         * // Source-side gitignore alone cannot prove correct package contents.
         */
        () =>
          inspectPackagedApplication(root, executable, {
            ...EXPECTED,
            platform,
          }),
        /Private/,
      );
      await rm(path.join(source, "AGENTS.md"));
    }
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
test(
  "native package architecture checks reject misleading executable headers",
  verifyNativeHeaders,
);
test(
  "generated Mac plist keeps identity pairs and Editor associations",
  verifyBundleMetadata,
);
test(
  "packaged archive rejects stale outputs and private development files",
  verifyArchivedResources,
);
