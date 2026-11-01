import test from "node:test";
import assert from "node:assert/strict";
import { readLocalFontMetadata } from "../src/font-metadata.ts";
import {
  localFontFixture,
  localFontCollectionFixture,
} from "./fixtures/local-font.ts";

/**
 * Decode native localized names and actual cmap glyphs without reading outlines.
 *
 * Two different Unicode map formats contribute samples, while explicit glyph
 * zero remains absent even when an indirect segment specifies a nonzero delta.
 * @async
 * @returns {Promise<void>} Resolves after names, glyph holes and bounded reads agree.
 * @throws {Error} If metadata decoding borrows glyphs or reads the dummy outline table.
 * @example
 * // Latin A and Hangul 가 exist; Japanese あ and symbol ※ do not.
 */
async function verifyFontMetadata(): Promise<void> {
  /** Independent synthetic font with a large dummy outline table. */
  const bytes = localFontFixture();
  /** Requested metadata ranges reveal accidental full-font reads. */
  const reads: number[] = [];
  /** Native metadata parsed through the same bounded provider used by browser Blob slices. */
  const metadata = await readLocalFontMetadata(
    {
      size: bytes.length,
      /**
       * Supply an exact synthetic metadata slice.
       *
       * Every requested length is recorded to detect accidental outline transfer.
       * @async
       * @param {number} offset - Selected SFNT range start.
       * @param {number} length - Selected metadata byte count.
       * @returns {Promise<Uint8Array>} Exact fixture bytes.
       * @example
       * // Metadata reads stay small despite a one-megabyte glyf table.
       */
      async read(offset: number, length: number): Promise<Uint8Array> {
        reads.push(length);
        return bytes.slice(offset, offset + length);
      },
    },
    "Fixture Font",
  );
  assert.equal(metadata.label, "검증 글꼴");
  assert.deepEqual(metadata.aliases, ["Fixture Font", "검증 글꼴"]);
  assert.deepEqual(metadata.scripts, [true, true, false, false, false, false]);
  assert.equal(metadata.decorative, true);
  assert.ok(Math.max(...reads) < 1024);
  assert.ok(
    reads.reduce(
      /**
       * Sum actual metadata transfer sizes.
       *
       * Outline padding must never contribute to the selected read total.
       * @param {number} total - Previous transfer size.
       * @param {number} length - One requested metadata slice.
       * @returns {number} Accumulated selected metadata bytes.
       * @example
       * // All reads together remain much smaller than one glyph-outline megabyte.
       */
      (total, length) => total + length,
      0,
    ) < 1024,
  );
  /** Separate TTC member must be chosen by its native family name. */
  const collection = localFontCollectionFixture();
  /** Selected second-face native metadata. */
  const second = await readLocalFontMetadata(
    {
      size: collection.length,
      /**
       * Read exact whole-collection offsets for a nonzero TTC member.
       *
       * Returning face-relative bytes would fail the independent fixture assertion.
       * @async
       * @param {number} offset - Absolute whole-collection offset.
       * @param {number} length - Required metadata bytes.
       * @returns {Promise<Uint8Array>} Selected collection metadata.
       * @example
       * // The second face's directory references absolute collection table locations.
       */
      async read(offset: number, length: number): Promise<Uint8Array> {
        return collection.slice(offset, offset + length);
      },
    },
    "Second Font",
  );
  assert.equal(second.label, "둘째 글꼴");
  assert.deepEqual(second.aliases, ["Second Font", "둘째 글꼴"]);
  /** Unicode language tags provide localized names independently of Windows numeric locale IDs. */
  const tagged = localFontFixture(
    "Tagged Font",
    "언어 태그 글꼴",
    true,
    0,
    true,
  );
  /** Version-one name metadata parsed through an independent bounded source. */
  const localized = await readLocalFontMetadata(
    {
      size: tagged.length,
      /**
       * Return selected synthetic version-one naming-table bytes.
       *
       * Korean language identity is expressed by ko-KR rather than numeric locale 0x0412.
       * @async
       * @param {number} offset - Selected metadata range start.
       * @param {number} length - Required byte count.
       * @returns {Promise<Uint8Array>} Independent language-tag fixture bytes.
       * @example
       * // The shared string store contains a UTF-16 ko-KR language tag.
       */
      async read(offset: number, length: number): Promise<Uint8Array> {
        return tagged.slice(offset, offset + length);
      },
    },
    "Tagged Font",
  );
  assert.equal(localized.label, "언어 태그 글꼴");
  /** A Korean subset font can map 각 while intentionally lacking the former 가 sample. */
  const subset = localFontFixture("Subset Font", "부분 글꼴", true, 0),
    subsetView = new DataView(subset.buffer);
  /** The independently encoded cmap's format-12 last group is changed to a neighboring Hangul scalar. */
  const cmapOffset = subsetView.getUint32(12 + 16 + 8),
    fullOffset = cmapOffset + subsetView.getUint32(cmapOffset + 16);
  subsetView.setUint32(fullOffset + 28, 0xac01);
  subsetView.setUint32(fullOffset + 32, 0xac01);
  /** Block-level support must not hide a real subset face merely because one sample glyph is absent. */
  const subsetMetadata = await readLocalFontMetadata(
    {
      size: subset.length,
      /**
       * Return selected metadata from an independent one-glyph Hangul subset.
       *
       * Only 각 is mapped in the Hangul block, so a single 가 probe would be incorrect.
       * @async
       * @param {number} offset - Requested metadata range start.
       * @param {number} length - Required byte count.
       * @returns {Promise<Uint8Array>} Exact independent subset metadata.
       * @example
       * // A block intersection discovers the actual nonzero 각 glyph.
       */
      async read(offset: number, length: number): Promise<Uint8Array> {
        return subset.slice(offset, offset + length);
      },
    },
    "Subset Font",
  );
  assert.equal(subsetMetadata.scripts![0], true);
}
test(
  "local font metadata resolves localized SFNT and TTC names, real cmap holes and bounded slices",
  verifyFontMetadata,
);

/**
 * Reject corrupt font-table offsets before a provider reads unrelated data.
 *
 * A malformed native name-table range cannot silently become a guessed family
 * classification or force a full font-file read.
 * @async
 * @returns {Promise<void>} Resolves after invalid directory ranges fail explicitly.
 * @throws {Error} If corrupt metadata unexpectedly succeeds.
 * @example
 * // A declared name table outside the font container raises RangeError.
 */
async function verifyFontMetadataBounds(): Promise<void> {
  /** Corrupt only the directory's first metadata table offset. */
  const bytes = localFontFixture();
  new DataView(bytes.buffer).setUint32(20, bytes.length + 1);
  await assert.rejects(
    readLocalFontMetadata(
      {
        size: bytes.length,
        /**
         * Supply bounded fixture ranges before validation rejects the corrupt directory.
         *
         * The provider itself cannot expose data outside this isolated fixture.
         * @async
         * @param {number} offset - Requested local metadata offset.
         * @param {number} length - Requested byte count.
         * @returns {Promise<Uint8Array>} Selected synthetic metadata.
         * @example
         * // The invalid name-table request never reaches this provider.
         */
        async read(offset: number, length: number): Promise<Uint8Array> {
          return bytes.slice(offset, offset + length);
        },
      },
      "Fixture Font",
    ),
    RangeError,
  );
}
test(
  "corrupt local font metadata offsets fail before table access",
  verifyFontMetadataBounds,
);
