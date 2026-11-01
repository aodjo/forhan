import { createReadStream } from "node:fs";
import { lstat, readdir, readlink, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

/** Complete runtime bundle entry, independent of archive timestamps and filesystem Unicode normalization. */
export interface DistributionEntry {
  path: string;
  kind: "directory" | "file" | "symlink";
  mode: number;
  bytes?: number;
  sha256?: string;
  target?: string;
}

/**
 * Hash a real distribution file without retaining large framework images in memory.
 *
 * Streaming reads cover every original byte, including framework resources outside ASAR.
 * @async
 * @param {string} file - Actual regular file in a project-owned distribution.
 * @returns {Promise<string>} Lowercase SHA-256 digest of its original bytes.
 * @throws {Error} If the original file cannot be read completely.
 * @example
 * const digest=await distributionFileDigest('/tmp/owned/포한.app/Contents/MacOS/포한');
 */
export async function distributionFileDigest(file: string): Promise<string> {
  /** Each stream chunk contributes once to the complete runtime byte digest. */
  const digest = createHash("sha256");
  for await (/** Original file bytes are never replaced by metadata or sampled prefixes. */ const chunk of createReadStream(
    file,
  ))
    digest.update(chunk);
  return digest.digest("hex");
}

/**
 * Order normalized runtime paths without depending on the host's language or locale.
 *
 * Stable ordering makes the complete inventory comparable across archive filesystems.
 * @param {DistributionEntry} left - First normalized runtime entry.
 * @param {DistributionEntry} right - Second normalized runtime entry.
 * @returns {number} Stable lexical path ordering.
 * @example
 * entries.sort(compareDistributionPaths);
 */
function compareDistributionPaths(
  left: DistributionEntry,
  right: DistributionEntry,
): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

/**
 * Observe every file, directory and link in an actual extracted application bundle.
 *
 * Symlinks remain links in the inventory, and their actual resolution must stay
 * inside the bundle. Canonically equivalent filesystem spellings share a portable
 * identity; duplicate normalized paths are rejected.
 * Executable permission bits, link targets and all regular-file bytes remain significant.
 * @async
 * @param {string} root - Existing actual bundle directory selected by the caller.
 * @returns {Promise<DistributionEntry[]>} Complete sorted runtime inventory.
 * @throws {Error} If a path collides, a file changes while read or an unsupported entry is encountered.
 * @example
 * const entries=await inventoryDistribution('/tmp/owned/포한.app');
 */
export async function inventoryDistribution(
  root: string,
): Promise<DistributionEntry[]> {
  /** The caller-selected bundle remains the only inventory root. */
  const absolute = path.resolve(root),
    entries: DistributionEntry[] = [],
    seen = new Set<string>();
  if (!(await lstat(absolute)).isDirectory())
    throw new Error(
      "Distribution inventory requires an actual bundle directory.",
    );
  /**
   * Visit one actual bundle entry without dereferencing filesystem links.
   *
   * Regular files are hashed in full and directories recurse using their original spelling.
   * @async
   * @param {string} file - Current actual filesystem entry inside the selected bundle.
   * @returns {Promise<void>} Appends this entry and all real directory descendants.
   * @throws {Error} If metadata is unsupported, ambiguous or changes while hashing.
   * @example
   * await visit(absolute); // Includes the bundle root and every actual runtime child.
   */
  async function visit(file: string): Promise<void> {
    /** Normalized identities allow APFS/HFS normalization without accepting extra or missing files. */
    const relative =
        path
          .relative(absolute, file)
          .split(path.sep)
          .join("/")
          .normalize("NFC") || ".",
      metadata = await lstat(file);
    if (seen.has(relative))
      throw new Error("Duplicate normalized distribution path: " + relative);
    seen.add(relative);
    if (metadata.isSymbolicLink()) {
      /** Portable links must remain relative and resolve entirely inside the copied runtime. */
      const target = await readlink(file),
        resolved = path.relative(
          await realpath(absolute),
          await realpath(file),
        );
      if (
        path.isAbsolute(target) ||
        path.isAbsolute(resolved) ||
        resolved === ".." ||
        resolved.startsWith(".." + path.sep)
      )
        throw new Error(
          "Distribution link escapes its own runtime: " + relative,
        );
      entries.push({
        path: relative,
        kind: "symlink",
        mode: metadata.mode & 0o777,
        target: target.normalize("NFC"),
      });
    } else if (metadata.isDirectory()) {
      entries.push({
        path: relative,
        kind: "directory",
        mode: metadata.mode & 0o777,
      });
      for (/** Original directory spelling is used for all subsequent native filesystem reads. */ const child of await readdir(
        file,
      ))
        await visit(path.join(file, child));
    } else if (metadata.isFile()) {
      /** Complete digest and post-read metadata reject a file that mutates during observation. */
      const sha256 = await distributionFileDigest(file),
        after = await lstat(file);
      if (metadata.size !== after.size || metadata.mtimeMs !== after.mtimeMs)
        throw new Error("Distribution changed while hashing: " + relative);
      entries.push({
        path: relative,
        kind: "file",
        mode: metadata.mode & 0o777,
        bytes: metadata.size,
        sha256,
      });
    } else throw new Error("Unsupported distribution entry: " + relative);
  }
  await visit(absolute);
  return entries.sort(compareDistributionPaths);
}

/**
 * Require a copied distribution to preserve the entire validated runtime bundle.
 *
 * Comparisons retain permission bits, file digests and link targets while ignoring
 * timestamps. Error output identifies the first differing entry without dumping binaries.
 * @param {DistributionEntry[]} original - Original validated staging inventory.
 * @param {DistributionEntry[]} candidate - Actual ZIP-extracted or DMG-copied inventory.
 * @returns {void} Completes only when every original runtime entry is preserved.
 * @throws {Error} If the copied runtime contains a missing, extra or altered entry.
 * @example
 * requireMatchingDistribution(staging,await inventoryDistribution(copiedBundle));
 */
export function requireMatchingDistribution(
  original: DistributionEntry[],
  candidate: DistributionEntry[],
): void {
  if (original.length !== candidate.length)
    throw new Error(
      "Distribution entry count differs from the validated staging app.",
    );
  for (let index = 0; index < original.length; index++) {
    /** Both sorted inventories must retain the same actual entry identity and full byte proof. */
    const expected = original[index],
      actual = candidate[index];
    if (
      expected.path !== actual.path ||
      expected.kind !== actual.kind ||
      expected.mode !== actual.mode ||
      expected.bytes !== actual.bytes ||
      expected.sha256 !== actual.sha256 ||
      expected.target !== actual.target
    )
      throw new Error("Distribution runtime differs at: " + expected.path);
  }
}
