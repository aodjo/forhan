import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import CFB from "cfb";
import { unzipSync, strFromU8 } from "fflate";
import { nativeCorpusFixture } from "./helpers/native-corpus.ts";

/** One retained native stream identifies the unmodified compatibility reference payload. */
interface NativeCoreRecord {
  path: string;
  sha256: string;
}

/** Public fixture provenance contains no machine paths or creator profile values. */
interface NativeCorpusRecord {
  name: string;
  format: "HWP" | "HWPX" | "PNG";
  bytes: number;
  sha256: string;
  retainedCore?: NativeCoreRecord[];
  removedAncillary?: string[];
  nativeReopen?: {
    name: string;
    sha256: string;
    nativeBodySha256: string;
    sourceBytesUnchangedAfterOwnedClose: boolean;
  };
}

/**
 * Check the identities and metadata boundaries of required native reference data.
 *
 * The original application established acceptance separately. This test guards
 * its checked-in evidence against missing files, changed core payloads, and
 * accidentally restored profile metadata without requiring Hancom in CI.
 *
 * @returns {void} Completes after every required reference and core payload matches its manifest.
 * @throws {AssertionError} If reference bytes, native acceptance identities, or metadata boundaries differ.
 * @example
 * node --test tests/native-corpus.test.ts // Checks the native corpus on Windows or macOS.
 */
function verifyNativeCorpusIntegrity(): void {
  /** Independent native acceptance is bound to complete files and their retained core streams. */
  const manifest = JSON.parse(
    readFileSync(nativeCorpusFixture("manifest.json"), "utf8"),
  ) as {
    nativeReopenVerified: boolean;
    records: NativeCorpusRecord[];
  };
  assert.equal(manifest.nativeReopenVerified, true);
  assert.equal(manifest.records.length, 15);
  /** Duplicate records cannot conceal a missing required native reference. */
  const names = new Set<string>();
  for (/** Every source is checked even when other semantic compatibility tests pass. */
  const record of manifest.records) {
    assert.equal(names.has(record.name), false);
    names.add(record.name);
    /** Complete immutable file bytes are checked before reading container metadata. */
    const bytes = readFileSync(nativeCorpusFixture(record.name));
    assert.equal(bytes.length, record.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      record.sha256,
    );
    if (record.format === "PNG") continue;
    assert.equal(record.nativeReopen?.name, record.name);
    assert.equal(record.nativeReopen?.sha256, record.sha256);
    assert.match(
      record.nativeReopen?.nativeBodySha256 ?? "",
      /^[a-f0-9]{64}$/u,
    );
    assert.equal(
      record.nativeReopen?.sourceBytesUnchangedAfterOwnedClose,
      true,
    );
    assert.ok(record.retainedCore?.length);
    /** Container access preserves actual native stream names and payload boundaries. */
    const compound =
      record.format === "HWP" ? CFB.read(bytes, { type: "buffer" }) : undefined;
    /** HWPX metadata is inspected after decompression rather than scanning compressed bytes. */
    const entries = record.format === "HWPX" ? unzipSync(bytes) : undefined;
    for (/** Only genuine retained native payloads may satisfy a core identity. */
    const core of record.retainedCore ?? []) {
      /** Leading slash selects the complete CFB path, including nested BodyText and BinData. */
      const payload = compound
        ? CFB.find(compound, "/" + core.path)?.content
        : entries?.[core.path];
      assert.ok(payload, record.name + ": " + core.path);
      assert.equal(
        createHash("sha256")
          .update(payload as Uint8Array)
          .digest("hex"),
        core.sha256,
      );
    }
    for (/** Removed optional data must stay absent from the distributed reference. */
    const removed of record.removedAncillary ?? []) {
      if (compound) assert.equal(CFB.find(compound, "/" + removed), null);
      else assert.equal(entries?.[removed], undefined);
    }
    if (entries) {
      assert.doesNotMatch(
        strFromU8(entries["Contents/content.hpf"]),
        /name="(?:creator|lastsaveby)"/u,
      );
    }
  }
}

test(
  "required native corpus retains accepted file identities and excludes removed metadata",
  verifyNativeCorpusIntegrity,
);
