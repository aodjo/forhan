import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FormatCopyMemory,
  FORMAT_COPY_PARAGRAPH_FIELDS,
  MAX_FORMAT_COPY_SESSION_BYTES,
  type FormatCopySession,
} from "../src/format-copy-session.ts";

/**
 * Create independent source appearance containing explicit native false and zero values.
 *
 * All represented paragraph fields are present without borrowing a document's
 * source identifiers, authored text or filesystem ownership.
 * @returns {FormatCopySession} Complete independent accepted source and choices.
 * @example
 * const source=sessionSource();
 */
function sessionSource(): FormatCopySession {
  /** Paragraph metadata retains every represented original property. */
  const paragraph: Record<string, unknown> = {};
  for (/** No missing paragraph value can silently inherit a different target shape. */ const key of FORMAT_COPY_PARAGRAPH_FIELDS)
    paragraph[key] = null;
  paragraph.textAlign = "left";
  paragraph.lineHeight = "0";
  paragraph.nativeSnapToGrid = false;
  return {
    version: 1,
    source: {
      marks: [
        {
          type: "textStyle",
          attrs: {
            fontSize: "0pt",
            nativeUseFontSpace: false,
            nativeCharacterMetrics: {
              ratio: [100, 100, 100, 100, 100, 100, 100],
              spacing: [0, -5, 0, 0, 0, 0, 0],
              relativeSize: [100, 100, 100, 100, 100, 100, 100],
              offset: [0, 0, 0, 0, 0, 0, 0],
            },
          },
        },
      ],
      paragraph,
    },
    options: { mode: "both", cellBackground: false, cellOnly: false },
  };
}

/**
 * Preserve complete appearance independently from both writer and reader mutations.
 *
 * False, zero, absent cell context and all native language arrays must survive
 * without giving a later renderer a reference to accepted process memory.
 * @returns {void} Verifies deep memory independence and fresh-session emptiness.
 * @example
 * // Editing a returned snapshot cannot alter the next source window's copy.
 */
function verifyIndependentMemory(): void {
  /** Separate source, expected snapshot and memory retain their actual own identities. */
  const memory = new FormatCopyMemory(),
    source = sessionSource(),
    expected = structuredClone(source);
  assert.equal(memory.read(), null);
  memory.write(source);
  source.source.marks[0].attrs!.fontSize = "42pt";
  source.source.paragraph.textAlign = "right";
  source.options.mode = "character";
  assert.deepEqual(memory.read(), expected);
  /** A separately returned renderer snapshot must not be the memory's internal object. */
  const returned = memory.read()!;
  returned.source.marks[0].attrs!.nativeCharacterMetrics.spacing[1] = 99;
  returned.source.paragraph.nativeSnapToGrid = true;
  returned.options.cellOnly = true;
  assert.deepEqual(memory.read(), expected);
  assert.equal(memory.read()!.source.cellBackground, undefined);
  assert.equal(new FormatCopyMemory().read(), null);
}

/**
 * Reject invalid native appearance writes without discarding the prior accepted copy.
 *
 * Domain failures include semantic links, source ownership, duplicate marks,
 * missing paragraph data and values that JSON would otherwise silently coerce.
 * @returns {void} Verifies every failed write leaves accepted app-session memory unchanged.
 * @example
 * // A rejected non-finite native spacing cannot erase the last valid source.
 */
function verifyFailedWritesRetainMemory(): void {
  /** Every invalid candidate is independent from the earlier accepted snapshot. */
  const source = sessionSource(),
    memory = new FormatCopyMemory(),
    invalid: unknown[] = [
      null,
      {},
      { ...source, version: 2 },
      { ...source, document: "unexpected document data" },
      {
        ...source,
        source: {
          ...source.source,
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
      },
      {
        ...source,
        source: {
          ...source.source,
          marks: [...source.source.marks, ...source.source.marks],
        },
      },
      {
        ...source,
        source: {
          ...source.source,
          paragraph: {
            ...source.source.paragraph,
            sourceId: "another-document",
          },
        },
      },
      { ...source, source: { ...source.source, paragraph: {} } },
      { ...source, options: { ...source.options, mode: ["both"] } },
      { ...source, options: { ...source.options, cellOnly: true } },
      { ...source, options: { ...source.options, cellBackground: true } },
    ];
  memory.write(source);
  /** Non-finite values must never be turned into null by ordinary JSON serialization. */
  const nonFinite = structuredClone(source);
  nonFinite.source.marks[0].attrs!.nativeCharacterMetrics.spacing[0] =
    Number.NaN;
  invalid.push(nonFinite);
  for (/** Every malformed write must preserve the same prior accepted source and choices. */ const candidate of invalid) {
    assert.throws(
      /**
       * Attempt an untrusted snapshot replacement through the actual memory contract.
       *
       * The test expects a failure before the accepted memory is changed.
       * @returns {void} Attempts the original untrusted write.
       * @throws {TypeError} If appearance validation correctly rejects the candidate.
       * @example
       * // Unknown source ownership cannot enter a future source window.
       */
      () => memory.write(candidate),
      TypeError,
    );
    assert.deepEqual(memory.read(), source);
  }
}

/**
 * Distinguish actual no-fill cells from absent cell context under the UTF-8 memory bound.
 *
 * A real empty cell fill is copyable, while missing context cannot supply a
 * cell-only operation. Korean metadata is bounded by bytes rather than its
 * smaller UTF-16 character count, and failed size validation retains memory.
 * @returns {void} Verifies real cell absence and byte-size semantics.
 * @example
 * // Null clears a target cell fill; undefined does not invent a source cell.
 */
function verifyCellContextAndByteLimit(): void {
  /** An actual no-fill source cell is an independent accepted appearance category. */
  const memory = new FormatCopyMemory(),
    source = sessionSource();
  source.source.cellBackground = null;
  source.options.cellBackground = true;
  source.options.cellOnly = true;
  memory.write(source);
  assert.deepEqual(memory.read(), source);
  /** Korean font metadata can exceed the byte bound while remaining below that character count. */
  const oversized = structuredClone(source);
  oversized.source.marks[0].attrs!.fontFamily = "가".repeat(
    Math.floor(MAX_FORMAT_COPY_SESSION_BYTES / 3) + 1,
  );
  assert.ok(
    oversized.source.marks[0].attrs!.fontFamily.length <
      MAX_FORMAT_COPY_SESSION_BYTES,
  );
  assert.throws(
    /**
     * Attempt an oversized real UTF-8 snapshot through the actual memory write path.
     *
     * The original accepted source must remain available after rejection.
     * @returns {void} Attempts bounded app-session storage.
     * @throws {RangeError} If actual serialized UTF-8 bytes exceed the session limit.
     * @example
     * // UTF-16 string length cannot substitute for the native transport byte bound.
     */
    () => memory.write(oversized),
    RangeError,
  );
  assert.deepEqual(memory.read(), source);
}

test(
  "format-copy memory retains exact native metadata independently from source and reader mutations",
  verifyIndependentMemory,
);
test(
  "invalid format-copy writes preserve the previous accepted app-session source",
  verifyFailedWritesRetainMemory,
);
test(
  "format-copy memory distinguishes absent cells and no fill while bounding actual UTF-8 bytes",
  verifyCellContextAndByteLimit,
);
