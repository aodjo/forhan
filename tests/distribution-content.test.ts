import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  cp,
  rm,
  rename,
  symlink,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inventoryDistribution,
  requireMatchingDistribution,
} from "../scripts/lib/distribution-content.ts";

test("distribution inventories preserve original bytes, permissions, links and Unicode identity", /**
 * Reject real copied runtime mutations independently of archive format and timestamps.
 *
 * Actual temporary trees exercise same-length binary corruption, missing resources
 * and Unicode spelling. Native Unix hosts also prove executable bits and link targets;
 * Windows does not claim Unix symlink or permission semantics.
 * @async
 * @returns {Promise<void>} Resolves after independent copied-runtime corruption cases are rejected.
 * @throws {Error} If copied bytes or supported native filesystem semantics are accepted incorrectly.
 * @example
 * // Replacing one binary byte must fail even when its size and filename remain unchanged.
 */
async () => {
  /** This test exclusively owns both independent real filesystem trees. */
  const owned = path.resolve(
      await mkdtemp(path.join(tmpdir(), "forhan-distribution-inventory-")),
    ),
    source = path.join(owned, "source"),
    copy = path.join(owned, "copy");
  assert.equal(path.dirname(owned), path.resolve(tmpdir()));
  assert.ok(path.basename(owned).startsWith("forhan-distribution-inventory-"));
  /**
   * Restore the exclusively owned copy from the independent original tree.
   *
   * The resolved deletion target must remain the named child of this test's own directory.
   * @async
   * @returns {Promise<void>} Recreates a fresh copy without stale normalization aliases.
   * @throws {Error} If the owned path changes or native copy/removal fails.
   * @example
   * await resetCopy(); // Restores the original executable and resources.
   */
  async function resetCopy(): Promise<void> {
    assert.equal(path.relative(owned, path.resolve(copy)), "copy");
    await rm(copy, { recursive: true, force: true });
    await cp(source, copy, { recursive: true, verbatimSymlinks: true });
  }
  try {
    await mkdir(path.join(source, "Contents"), { recursive: true });
    await writeFile(
      path.join(source, "Contents", "포한"),
      Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 1, 2, 3, 4]),
    );
    await writeFile(
      path.join(source, "Contents", "license.txt"),
      "original license\n",
    );
    if (process.platform !== "win32") {
      await chmod(path.join(source, "Contents", "포한"), 0o755);
      await symlink("포한", path.join(source, "Contents", "runtime-link"));
    }
    await cp(source, copy, { recursive: true, verbatimSymlinks: true });
    await rename(
      path.join(copy, "Contents", "포한"),
      path.join(copy, "Contents", "포한".normalize("NFD")),
    );
    if (process.platform !== "win32") {
      await rm(path.join(copy, "Contents", "runtime-link"));
      await symlink(
        "포한".normalize("NFD"),
        path.join(copy, "Contents", "runtime-link"),
      );
    }
    /** Unicode filesystem spelling is independent of complete regular-file runtime content. */
    const baseline = await inventoryDistribution(source);
    requireMatchingDistribution(baseline, await inventoryDistribution(copy));
    await writeFile(
      path.join(copy, "Contents", "포한".normalize("NFD")),
      Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 1, 2, 3, 5]),
    );
    /** Same-length byte corruption is observed from the real copied executable. */
    const corrupt = await inventoryDistribution(copy);
    assert.throws(
      /**
       * Reject the independently observed same-length runtime byte mutation.
       *
       * The candidate inventory is captured before this synchronous comparison.
       * @returns {void} Throws because the real copied binary digest differs.
       * @example
       * // An unchanged filename and byte count cannot conceal a corrupted executable.
       */
      () => requireMatchingDistribution(baseline, corrupt),
      /runtime differs/,
    );
    await resetCopy();
    await rm(path.join(copy, "Contents", "license.txt"));
    /** Missing runtime resources are observed from the actual copied tree. */
    const missing = await inventoryDistribution(copy);
    assert.throws(
      /**
       * Reject a copied bundle that omits an original runtime resource.
       *
       * This failure is independent of file-byte comparisons for surviving entries.
       * @returns {void} Throws because the copied tree has fewer entries.
       * @example
       * // An archive lacking its original license or runtime resource cannot match.
       */
      () => requireMatchingDistribution(baseline, missing),
      /entry count differs/,
    );
    await resetCopy();
    if (process.platform !== "win32") {
      await chmod(path.join(copy, "Contents", "포한"), 0o644);
      /** Native executable permission loss is independent of otherwise identical binary bytes. */
      const nonexecutable = await inventoryDistribution(copy);
      assert.throws(
        /**
         * Reject removal of the original Unix executable permission bits.
         *
         * Native macOS and Linux hosts exercise their actual filesystem modes.
         * @returns {void} Throws because the original executable mode changed.
         * @example
         * // Identical Mach-O bytes without executable permission are insufficient.
         */
        () => requireMatchingDistribution(baseline, nonexecutable),
        /runtime differs/,
      );
      await chmod(path.join(copy, "Contents", "포한"), 0o755);
      await rm(path.join(copy, "Contents", "runtime-link"));
      await symlink("license.txt", path.join(copy, "Contents", "runtime-link"));
      /** A real changed link target must fail even when all regular-file bytes still match. */
      const wrongLink = await inventoryDistribution(copy);
      assert.throws(
        /**
         * Reject a framework-style link retargeted to another real bundle member.
         *
         * Link content is recorded without silently following and hashing its destination.
         * @returns {void} Throws because the original runtime link target differs.
         * @example
         * // Framework links remain significant even when the destination exists.
         */
        () => requireMatchingDistribution(baseline, wrongLink),
        /runtime differs/,
      );
      await writeFile(path.join(owned, "external-code"), "external runtime");
      await rm(path.join(copy, "Contents", "runtime-link"));
      await symlink(
        "../../external-code",
        path.join(copy, "Contents", "runtime-link"),
      );
      await assert.rejects(
        /**
         * Reject a copied runtime that relies on a link outside its own bundle.
         *
         * The external target exists, so the failure proves ownership containment.
         * @returns {Promise<import('../scripts/lib/distribution-content.ts').DistributionEntry[]>} Rejected unsafe inventory observation.
         * @throws {Error} If the real link resolves outside the actual copied runtime.
         * @example
         * // A copy cannot rely on the original staging tree remaining installed.
         */
        () => inventoryDistribution(copy),
        /link escapes/,
      );
    }
  } finally {
    await rm(owned, { recursive: true, force: true });
  }
});
