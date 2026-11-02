import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import asar from "@electron/asar";
import { XMLParser, XMLValidator } from "fast-xml-parser";

/** Minimum complete native distribution suite, shared by staging and extracted-payload verification. */
export const MIN_NATIVE_REGRESSIONS = 38;

/** Native platforms for which the project builds desktop distribution artifacts. */
export type PackagePlatform = "win32" | "darwin";
/** Independently packaged architectures, each tested on its corresponding native runner. */
export type PackageArchitecture = "x64" | "arm64";
/** Property-list values needed for the generated application bundle metadata. */
type PlistValue =
  string | number | boolean | PlistValue[] | { [key: string]: PlistValue };
/** Ordered XML property-list node without relying on grouped key/value arrays. */
type PlistNode = Record<string, unknown>;
/** Immutable metadata expected from this project's own distribution manifest. */
export interface PackageExpectation {
  platform: PackagePlatform;
  arch: PackageArchitecture;
  name: string;
  version: string;
  main: string;
  productName: string;
  bundleId: string;
}
/** Required Finder bundle metadata, separate from proof that the app actually executes. */
export interface MacBundleMetadata {
  identifier: string;
  executable: string;
  name: string;
  version: string;
  documentExtensions: string[];
}
/** One archived runtime file proven byte-identical to the current compiled workspace. */
export interface PackagedFileProof {
  path: string;
  sha256: string;
  bytes: number;
}
/** Structural artifact evidence is explicitly distinct from actual native execution evidence. */
export interface PackageInspection {
  kind: "packaged-artifact-structure-and-current-build-content";
  executable: string;
  executableSha256: string;
  archive: string;
  archiveSha256: string;
  platform: PackagePlatform;
  arch: PackageArchitecture;
  version: string;
  files: PackagedFileProof[];
  macBundle: MacBundleMetadata | null;
  executionVerified: false;
}
/** Supported Windows COFF machine values for the project's 64-bit native executables. */
const PE_MACHINES = new Map<number, PackageArchitecture>([
  [0x8664, "x64"],
  [0xaa64, "arm64"],
]);
/** Supported little-endian 64-bit Mach-O CPU types, including the ABI64 flag. */
const MACH_CPUS = new Map<number, PackageArchitecture>([
  [0x01000007, "x64"],
  [0x0100000c, "arm64"],
]);

/**
 * Validate a native executable range before reading machine metadata.
 *
 * This inspector reads complete project-owned artifacts but must reject a
 * truncated or mismatched header instead of reporting a plausible architecture.
 * @param {number} offset - Required byte offset.
 * @param {number} length - Required byte count.
 * @param {number} available - Complete executable byte length.
 * @returns {void} Completes when the required range exists.
 * @throws {RangeError} If the header range is invalid or truncated.
 * @example
 * nativeRange(0, 32, bytes.length);
 */
function nativeRange(offset: number, length: number, available: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > available
  )
    throw new RangeError("Native executable header is truncated or invalid.");
}

/**
 * Identify the architecture of a project's PE or thin 64-bit Mach-O executable.
 *
 * The per-architecture gate requires an actual executable image, not a source
 * path, installer wrapper or unrelated file with a matching filename. Universal
 * binaries are outside this separate-x64/arm64 build matrix.
 * @param {Uint8Array} bytes - Complete native executable contents.
 * @param {PackagePlatform} platform - Required target format.
 * @returns {PackageArchitecture} Actual supported architecture encoded by the executable.
 * @throws {Error | RangeError} If the native format, executable type or architecture is unsupported.
 * @example
 * nativeArchitecture(bytes, 'darwin'); // 'arm64' from the actual Mach-O header.
 */
export function nativeArchitecture(
  bytes: Uint8Array,
  platform: PackagePlatform,
): PackageArchitecture {
  nativeRange(0, 4, bytes.length);
  /** Typed-array offsets remain significant for Buffer-backed file contents. */
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (platform === "win32") {
    nativeRange(0, 64, bytes.length);
    if (view.getUint16(0, true) !== 0x5a4d)
      throw new Error("Packaged Windows target is not a PE executable.");
    /** DOS e_lfanew points to the full PE signature and COFF header. */
    const pe = view.getUint32(0x3c, true);
    nativeRange(pe, 26, bytes.length);
    if (
      view.getUint32(pe, true) !== 0x00004550 ||
      view.getUint16(pe + 24, true) !== 0x20b ||
      (view.getUint16(pe + 22, true) & 0x2002) !== 0x0002
    )
      throw new Error("Packaged Windows target is not a PE32+ executable.");
    /** The actual COFF machine field must match one of the supported native targets. */
    const arch = PE_MACHINES.get(view.getUint16(pe + 4, true));
    if (!arch) throw new Error("Packaged Windows architecture is unsupported.");
    return arch;
  }
  nativeRange(0, 32, bytes.length);
  if (view.getUint32(0, true) !== 0xfeedfacf || view.getUint32(12, true) !== 2)
    throw new Error(
      "Packaged Mac target is not a thin 64-bit Mach-O executable.",
    );
  /** The same filename can contain an Intel or Apple Silicon binary, so inspect its CPU type. */
  const arch = MACH_CPUS.get(view.getUint32(4, true));
  if (!arch) throw new Error("Packaged Mac architecture is unsupported.");
  return arch;
}

/**
 * Read ordered child elements from a generated property-list node.
 *
 * Plain whitespace nodes are ignored, while dictionary order is retained so
 * every key remains paired with its actual following value.
 * @param {unknown} value - XML parser child value.
 * @returns {PlistNode[]} Ordered structural child nodes.
 * @throws {Error} If a property-list container is malformed.
 * @example
 * plistChildren(node.dict); // Ordered key/value element pairs.
 */
function plistChildren(value: unknown): PlistNode[] {
  if (!Array.isArray(value))
    throw new Error("Mac Info.plist container is invalid.");
  /** Actual element nodes exclude attribute/whitespace records. */
  const result: PlistNode[] = [];
  for (/** Ordered native property-list child selected without flattening its siblings. */
  const entry of value)
    if (entry && typeof entry === "object" && !Object.hasOwn(entry, "#text"))
      result.push(entry as PlistNode);
  return result;
}

/**
 * Decode a literal generated property-list text value.
 *
 * Numeric-looking version strings remain strings. The parser performs no
 * external entity expansion or filesystem access.
 * @param {unknown} value - Ordered XML text children.
 * @returns {string} Literal text content.
 * @throws {Error} If an expected scalar has nested structural elements.
 * @example
 * plistText(node.string); // '0.1.0' remains a version string.
 */
function plistText(value: unknown): string {
  if (!Array.isArray(value)) throw new Error("Mac Info.plist text is invalid.");
  let result = "";
  for (/** Plain text node within an Info.plist key or scalar value. */
  const child of value) {
    if (!child || typeof child !== "object" || !Object.hasOwn(child, "#text"))
      throw new Error("Mac Info.plist scalar has nested elements.");
    result += String((child as PlistNode)["#text"]);
  }
  return result;
}

/**
 * Decode generated XML property-list arrays, dictionaries and scalar values.
 *
 * Pairwise dictionary traversal prevents grouped XML keys from borrowing another
 * key's value. Duplicate/prototype keys and unsupported structures reject.
 * @param {PlistNode} node - One ordered native property-list value element.
 * @returns {PlistValue} Decoded native metadata value.
 * @throws {Error} If the generated property-list structure is invalid or unsupported.
 * @example
 * plistValue({string:[{'#text':'포한'}]}); // '포한'
 */
function plistValue(node: PlistNode): PlistValue {
  /** Each native value element has exactly one structural tag. */
  const keys = Object.keys(node);
  if (keys.length !== 1) throw new Error("Mac Info.plist value is ambiguous.");
  /** Actual property-list type, independent of text that happens to resemble a number. */
  const tag = keys[0],
    children = node[tag];
  if (tag === "dict") {
    /** Native dictionaries preserve each key's actual adjacent value. */
    const entries = plistChildren(children),
      result: Record<string, PlistValue> = Object.create(null);
    if (entries.length % 2)
      throw new Error("Mac Info.plist dictionary has an unmatched key.");
    for (let index = 0; index < entries.length; index += 2) {
      if (!Object.hasOwn(entries[index], "key"))
        throw new Error("Mac Info.plist dictionary key is missing.");
      /** Literal dictionary key must be unique and cannot modify object prototypes. */
      const key = plistText(entries[index].key);
      if (
        ["__proto__", "prototype", "constructor"].includes(key) ||
        Object.hasOwn(result, key)
      )
        throw new Error(
          "Mac Info.plist dictionary key is invalid or repeated.",
        );
      result[key] = plistValue(entries[index + 1]);
    }
    return result;
  }
  if (tag === "array") {
    /** Array members remain typed native values rather than concatenated XML text. */
    const result: PlistValue[] = [];
    for (/** Ordered nested property-list array item. */
    const child of plistChildren(children))
      result.push(plistValue(child));
    return result;
  }
  if (tag === "true" || tag === "false") return tag === "true";
  if (tag === "string" || tag === "date" || tag === "data")
    return plistText(children);
  if (tag === "integer" || tag === "real") {
    /** Numeric metadata is validated independently from string-valued application versions. */
    const number = Number(plistText(children));
    if (
      !Number.isFinite(number) ||
      (tag === "integer" && !Number.isInteger(number))
    )
      throw new Error("Mac Info.plist number is invalid.");
    return number;
  }
  throw new Error("Mac Info.plist value type is unsupported.");
}

/**
 * Validate the bundle identity, entry point and declared native document types.
 *
 * This is structural evidence only. The separate native runtime gate must still
 * launch the actual application, verify its process architecture and test file operations.
 * Human-readable names accept Unicode canonical equivalence; bundle identifiers,
 * versions and required document associations retain their exact source checks.
 * @param {string} xml - Generated XML Info.plist contents.
 * @param {PackageExpectation} expected - Required application identity from the source manifest.
 * @returns {MacBundleMetadata} Validated generated bundle fields.
 * @throws {Error} If XML, identity, executable or required Editor associations do not match.
 * @example
 * validateMacBundleInfo(xml, expected); // Never proves Mac execution by itself.
 */
export function validateMacBundleInfo(
  xml: string,
  expected: PackageExpectation,
): MacBundleMetadata {
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Mac Info.plist is not valid XML.");
  /** Entity expansion stays disabled; generated keys and values retain literal order. */
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
    ignoreDeclaration: true,
    processEntities: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml) as PlistNode[];
  let root: PlistNode | null = null;
  for (/** Root element selected independently from optional XML declarations. */
  const node of parsed)
    if (Object.hasOwn(node, "plist")) root = node;
  if (!root) throw new Error("Mac Info.plist root is missing.");
  /** A proper bundle contains one top-level dictionary. */
  const children = plistChildren(root.plist);
  if (children.length !== 1 || !Object.hasOwn(children[0], "dict"))
    throw new Error("Mac Info.plist dictionary is missing.");
  /** Actual generated bundle properties retain their native scalar/array types. */
  const info = plistValue(children[0]) as Record<string, PlistValue>;
  /** Canonical source identity permits decomposed names, while runtime helper lookup requires identical raw bundle and executable names. */
  const productName=expected.productName.normalize('NFC');
  if (
    info.CFBundleIdentifier !== expected.bundleId ||
    typeof info.CFBundleExecutable!=='string' || info.CFBundleExecutable.normalize('NFC')!==productName ||
    typeof info.CFBundleName!=='string' || info.CFBundleName.normalize('NFC')!==productName ||
    info.CFBundleName!==info.CFBundleExecutable ||
    info.CFBundleShortVersionString !== expected.version ||
    info.CFBundlePackageType !== "APPL"
  )
    throw new Error(
      "Mac application bundle identity differs from the source manifest.",
    );
  /** Extensions accepted as editable documents, not unrelated shell URL schemes. */
  const extensions = new Set<string>();
  if (Array.isArray(info.CFBundleDocumentTypes))
    for (/** Native Finder document-type association. */
    const type of info.CFBundleDocumentTypes) {
      if (
        !type ||
        typeof type !== "object" ||
        Array.isArray(type) ||
        type.CFBundleTypeRole !== "Editor"
      )
        continue;
      if (Array.isArray(type.CFBundleTypeExtensions))
        for (/** Literal file extension declared for this editor association. */
        const extension of type.CFBundleTypeExtensions)
          if (typeof extension === "string")
            extensions.add(extension.toLowerCase());
    }
  for (/** Every native document format promised by the desktop package must be registered. */
  const extension of ["hwpx", "hwp", "fhn"])
    if (!extensions.has(extension))
      throw new Error(
        "Mac application document association is missing: " + extension,
      );
  return {
    identifier: expected.bundleId,
    executable: expected.productName,
    name: expected.productName,
    version: expected.version,
    documentExtensions: [...extensions].sort(),
  };
}

/**
 * Hash exact build artifacts without changing package resources.
 *
 * Structural and runtime reports use the same digest to identify the actual app.
 * @param {Uint8Array} bytes - Complete native or archived runtime contents.
 * @returns {string} Lowercase SHA-256 digest.
 * @example
 * packageDigest(await readFile(executable));
 */
export function packageDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Inspect the actual packaged executable, bundle and archived runtime files.
 *
 * Required renderer, main and preload bytes must match the current compiled
 * workspace. A stale artifact, wrong architecture, missing preload or absent
 * local renderer asset fails before any application process is launched.
 * @async
 * @param {string} projectRoot - Absolute source/build workspace.
 * @param {string} executable - Project-owned unpacked native application executable.
 * @param {PackageExpectation} expected - Required current application and native target.
 * @returns {Promise<PackageInspection>} Structural proof explicitly marked as not execution verification.
 * @throws {Error} If native format, bundle fields or archived current-build contents differ.
 * @example
 * await inspectPackagedApplication(root, executable, expected);
 */
export async function inspectPackagedApplication(
  projectRoot: string,
  executable: string,
  expected: PackageExpectation,
): Promise<PackageInspection> {
  /** The exact native application image is inspected instead of an installer wrapper. */
  const binary = await readFile(executable),
    arch = nativeArchitecture(binary, expected.platform);
  if (arch !== expected.arch)
    throw new Error(
      "Packaged native architecture differs from the required target.",
    );
  /** Mac resources live inside Contents; Windows resources live beside the unpacked executable. */
  const bundle =
    expected.platform === "darwin"
      ? path.dirname(path.dirname(path.dirname(executable)))
      : null;
  /** ASAR is the actual Electron application resource, not a source-project fallback. */
  const archive = bundle
    ? path.join(bundle, "Contents", "Resources", "app.asar")
    : path.join(path.dirname(executable), "resources", "app.asar");
  /** Archived package identity must still match the current source application. */
  const manifest = JSON.parse(
    asar.extractFile(archive, "package.json").toString("utf8"),
  ) as Record<string, unknown>;
  if (
    manifest.name !== expected.name ||
    manifest.version !== expected.version ||
    manifest.main !== expected.main
  )
    throw new Error(
      "Packaged ASAR manifest differs from the current source application.",
    );
  /** Source/research/private artifacts are never valid runtime package payloads. */
  const members = asar.listPackage(archive, { isPack: false }).map(
    /**
     * Normalize host separators in ASAR listing metadata.
     *
     * Member identities stay relative and portable across Windows and macOS.
     * @param {string} member - Library-reported archived path.
     * @returns {string} Relative forward-slash member name.
     * @example
     * // Both hosts identify dist/index.html identically.
     */
    (member) => member.replace(/\\/g, "/").replace(/^\//, ""),
  );
  for (/** Packaged member checked for accidentally included private project files. */
  const member of members)
    if (
      /^(?:research|\.tools)(?:\/|$)/.test(member) ||
      /(?:^|\/)AGENTS\.md$/.test(member)
    )
      throw new Error(
        "Private development artifact was included in the application.",
      );
  /** Required compiled entry points and independently linked renderer assets. */
  const required = new Set<string>([
    expected.main,
    "electron-dist/preload.cjs",
    "dist/index.html",
  ]);
  /** Actual archived HTML determines which hashed assets this app loads. */
  const html = asar.extractFile(archive, "dist/index.html").toString("utf8");
  for (/** Relative Vite entry assets remain local to the archived renderer directory. */
  const match of html.matchAll(/(?:src|href)="\.\/([^"\s]+)"/g)) {
    if (match[1].includes("..") || !match[1].startsWith("assets/"))
      throw new Error("Packaged renderer asset is not a local build output.");
    required.add("dist/" + match[1]);
  }
  if (required.size < 5)
    throw new Error("Packaged renderer entry assets are missing.");
  /** Every required runtime resource is proven against the current compiled bytes. */
  const files: PackagedFileProof[] = [];
  for (/** Main/preload/renderer resource required by this exact app archive. */
  const member of required) {
    if (!members.includes(member))
      throw new Error("Packaged runtime resource is missing: " + member);
    /** Native archive bytes and the current workspace's independently compiled output. */
    const packed = asar.extractFile(archive, path.normalize(member)),
      compiled = await readFile(path.join(projectRoot, member));
    if (!packed.equals(compiled))
      throw new Error(
        "Packaged runtime resource is stale or differs from the current build: " +
          member,
      );
    files.push({
      path: member,
      sha256: packageDigest(packed),
      bytes: packed.length,
    });
  }
  /** Bundle identity and Finder registrations are checked only for an actual Mac target. */
  const macBundle = bundle
    ? validateMacBundleInfo(
        await readFile(path.join(bundle, "Contents", "Info.plist"), "utf8"),
        expected,
      )
    : null;
  return {
    kind: "packaged-artifact-structure-and-current-build-content",
    executable,
    executableSha256: packageDigest(binary),
    archive,
    archiveSha256: packageDigest(await readFile(archive)),
    platform: expected.platform,
    arch,
    version: expected.version,
    files,
    macBundle,
    executionVerified: false,
  };
}
