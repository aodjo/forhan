import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import { nativeSpacingFlag, nativeSpaceAdvance } from "../src/font-space.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";

/**
 * Verify native boolean domains and independently observed space-width rules.
 *
 * A literal zero cannot be treated as truthy. Tracking multiplies the selected
 * space advance instead of adding a full-em glyph-tracking distance again.
 * @returns {void} Verifies explicit native mode and physical arithmetic boundaries.
 * @example
 * // A 16pt half-em space with twenty percent tracking advances 9.6pt.
 */
function verifySpaceRules(): void {
  for (/** Native false spellings retain the same half-em semantic mode. */ const value of [
    undefined,
    null,
    false,
    0,
    "0",
    "false",
  ])
    assert.equal(nativeSpacingFlag(value), false);
  for (/** Native XML and model true spellings select intrinsic font advance. */ const value of [
    true,
    1,
    "1",
    "true",
  ])
    assert.equal(nativeSpacingFlag(value), true);
  assert.throws(
    /**
     * Reject a native mode outside the representable boolean domain.
     *
     * An invalid source value cannot be silently written as a different preference.
     * @returns {boolean} Never returns for this deliberately invalid source.
     * @throws {RangeError} Always rejects the invalid flag.
     * @example
     * // The numeric two is not a native boolean.
     */
    () => nativeSpacingFlag(2),
    RangeError,
  );
  assert.equal(nativeSpaceAdvance(20, 6, false), 10);
  assert.equal(nativeSpaceAdvance(20, 6, true), 6);
  assert.equal(nativeSpaceAdvance(20, 6, false, 100, 20), 12);
  assert(Math.abs(nativeSpaceAdvance(20, 6, true, 100, 20) - 7.2) < 1e-12);
  assert.equal(nativeSpaceAdvance(16, 4.8, false, 80, 20), 7.68);
  assert.equal(nativeSpaceAdvance(0, 0, false), 0);
}
test(
  "native font-space flags and per-space tracking retain separate semantics",
  verifySpaceRules,
);

/**
 * Verify both native encodings retain source modes through changed-content rewrites.
 *
 * Raw HWP bit 25 and HWPX useFontSpace are inspected independently of the
 * reconstructed editor attributes, preventing a matching reader/writer mistake
 * from masquerading as format fidelity. An unrelated text edit preserves flags.
 * @async
 * @returns {Promise<void>} Resolves after binary/XML and rewritten source assertions.
 * @throws {Error} If source modes collapse or their native encodings differ.
 * @example
 * // True and false adjacent character runs remain distinct in both native formats.
 */
async function verifyNativeSpaceFormats(): Promise<void> {
  /** Original text has identical fonts but genuinely different native space preferences. */
  const payload = {
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "A A",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontSize: "16pt",
                    nativeUseFontSpace: false,
                    nativeUseKerning: true,
                  },
                },
              ],
            },
            {
              type: "text",
              text: "B B",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontSize: "16pt",
                    nativeUseFontSpace: true,
                    nativeUseKerning: false,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  /** Actual HWP DocInfo stores character-shape flags in the published bit positions. */
  const binary = writeHwp(payload),
    container = CFB.read(binary, { type: "buffer" }),
    stream = CFB.find(container, "DocInfo")!,
    flags = new Set<number>();
  for (/** Native character-shape records retain independent mode bits. */ const record of parseHwpRecords(
    inflateSync(new Uint8Array(stream.content as Uint8Array)),
  )) {
    if (record.tag === 21)
      flags.add(
        new DataView(record.bytes.buffer, record.bytes.byteOffset).getUint32(
          46,
          true,
        ) &
          ((1 << 25) | (1 << 30)),
      );
  }
  assert(flags.has(1 << 25));
  assert(flags.has(1 << 30));
  /** Actual XML exposes the corresponding native preference independently of our XML reader. */
  const xmlBytes = await writeHwpx(payload),
    header = strFromU8(unzipSync(xmlBytes)["Contents/header.xml"]);
  assert.match(header, /useFontSpace="1"/);
  assert.match(header, /useFontSpace="0"/);
  assert.match(header, /useKerning="1"/);
  assert.match(header, /useKerning="0"/);
  for (/** Independent native format inputs retain modes after an unrelated source edit. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Imported editable state keeps source context for a real changed-content rewrite. */
    const result =
      format === "hwp" ? readHwp(binary) : await readHwpx(xmlBytes);
    assert.equal(
      result.doc.content![0].content![0].marks!.at(-1)!.attrs!
        .nativeUseFontSpace,
      false,
    );
    assert.equal(
      result.doc.content![0].content![1].marks!.at(-1)!.attrs!
        .nativeUseFontSpace,
      true,
    );
    result.doc.content![0].content![0].text += "x";
    assert.equal(
      result.doc.content![0].content![0].marks!.at(-1)!.attrs!.nativeUseKerning,
      true,
    );
    assert.equal(
      result.doc.content![0].content![1].marks!.at(-1)!.attrs!.nativeUseKerning,
      false,
    );
    /** Changed source must go through genuine independent native serialization. */
    const rewritten =
      format === "hwp"
        ? readHwp(writeHwp({ doc: result.doc }))
        : await readHwpx(
            await writeHwpx({
              doc: result.doc,
              source: "source" in result ? result.source : null,
            }),
          );
    assert.equal(
      rewritten.doc.content![0].content![0].marks!.at(-1)!.attrs!
        .nativeUseFontSpace,
      false,
    );
    assert.equal(
      rewritten.doc.content![0].content![1].marks!.at(-1)!.attrs!
        .nativeUseFontSpace,
      true,
    );
    assert.equal(
      rewritten.doc.content![0].content![0].marks!.at(-1)!.attrs!
        .nativeUseKerning,
      true,
    );
    assert.equal(
      rewritten.doc.content![0].content![1].marks!.at(-1)!.attrs!
        .nativeUseKerning,
      false,
    );
  }
}
test(
  "HWP bit 25 and HWPX useFontSpace survive source edits independently",
  verifyNativeSpaceFormats,
);
