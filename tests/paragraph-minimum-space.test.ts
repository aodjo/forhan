import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import {
  paragraphCondense,
  parseParagraphMinimumSpace,
  paragraphSpaceFraction,
} from "../src/paragraph-minimum-space.ts";

/**
 * Preserve native reduction independently from the displayed remaining-space percentage.
 *
 * Raw binary flags and native XML are inspected before their respective readers
 * run. Changed-content rewrites ensure retained source bytes cannot hide loss.
 * @async
 * @returns {Promise<void>} Resolves after independent native field and rewrite checks.
 * @throws {Error} If stored bits, XML, editable bounds or native rewrites disagree.
 * @example
 * // A displayed 25% minimum stores native reduction 75 in both native formats.
 */
async function verifyNativeParagraphMinimumSpace(): Promise<void> {
  for (/** Native reduction and the dialog's remaining width are complementary values. */ const reduction of [
    0, 1, 25, 50, 75,
  ]) {
    assert.equal(
      parseParagraphMinimumSpace(String(100 - reduction)),
      reduction,
    );
    assert.equal(paragraphSpaceFraction(reduction), 1 - reduction / 100);
    /** Independent source flags must survive a real text edit in either native format. */
    const payload = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: {
              nativeParagraphCondense: reduction,
              nativeBreakLatinWord: 2,
              nativeBreakNonLatinWord: 0,
              textAlign: "right",
            },
            content: [{ type: "text", text: "ALPHA beta gamma 최소 공백" }],
          },
        ],
      },
    };
    /** The actual compressed DocInfo flags are inspected without using the writer's reader. */
    const hwp = writeHwp(payload),
      container = CFB.read(hwp, { type: "buffer" }),
      info = CFB.find(container, "DocInfo");
    assert.ok(info?.content);
    /** Native paragraph records retain reduction in bits nine through fifteen. */
    const shapes = parseHwpRecords(
      inflateSync(new Uint8Array(info.content)),
    ).filter(
      /**
       * Select actual binary paragraph-shape records.
       *
       * No editor attribute interpretation participates in this raw inspection.
       * @param {ReturnType<typeof parseHwpRecords>[number]} record - Actual decoded binary record.
       * @returns {boolean} Whether this record is a native paragraph shape.
       * @example
       * // HWPTAG_PARA_SHAPE has relative tag twenty-five.
       */
      (record) => record.tag === 25,
    );
    assert.ok(
      shapes.some(
        /**
         * Verify independent flags in the actual source paragraph's binary shape.
         *
         * Latin, non-Latin and alignment bits must remain independent of reduction.
         * @param {ReturnType<typeof parseHwpRecords>[number]} record - Actual paragraph-shape record.
         * @returns {boolean} Whether literal source flags match all requested independent fields.
         * @example
         * // Condensation cannot overwrite the native character-breaking bit.
         */
        (record) => {
          /** Each native flags value is read directly from its original record buffer. */ const flags =
            new DataView(
              record.bytes.buffer,
              record.bytes.byteOffset,
            ).getUint32(0, true);
          return (
            ((flags >>> 9) & 127) === reduction &&
            ((flags >>> 5) & 3) === 2 &&
            ((flags >>> 7) & 1) === 0 &&
            ((flags >>> 2) & 7) === 2
          );
        },
      ),
    );
    /** Actual native XML retains stored reduction rather than the UI's complementary percentage. */
    const hwpx = await writeHwpx(payload),
      header = strFromU8(unzipSync(hwpx)["Contents/header.xml"]);
    assert.match(header, new RegExp('condense="' + reduction + '"'));
    for (/** Each actual format must retain the value after editing imported source. */ const [
      format,
      bytes,
    ] of [
      ["hwp", hwp],
      ["hwpx", hwpx],
    ] as const) {
      /** Native source is decoded independently from the control draft. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      assert.equal(
        parsed.doc.content![0].attrs!.nativeParagraphCondense,
        reduction,
      );
      parsed.doc.content![0].content![0].text += " edited";
      /** A changed document cannot pass through its original package without applying source edits. */
      const rewritten =
          format === "hwp" ? writeHwp(parsed) : await writeHwpx(parsed),
        again =
          format === "hwp" ? readHwp(rewritten) : await readHwpx(rewritten);
      assert.equal(
        again.doc.content![0].attrs!.nativeParagraphCondense,
        reduction,
      );
      assert.equal(again.doc.content![0].attrs!.nativeBreakLatinWord, 2);
      assert.equal(again.doc.content![0].attrs!.nativeBreakNonLatinWord, 0);
      assert.match(again.doc.content![0].content![0].text!, / edited$/);
    }
  }
  assert.equal(paragraphCondense({}), 0);
  for (/** Explicit malformed drafts cannot silently become valid-looking source values. */ const value of [
    "",
    true,
    "25.5",
    24,
    101,
    -1,
    Number.NaN,
  ])
    assert.throws(
      /**
       * Exercise actual native-control draft validation.
       *
       * Each invalid value reaches the same conversion used by document Apply.
       * @returns {number} Conversion result, which must throw for this original invalid draft.
       * @throws {RangeError} Expected for every supplied invalid draft.
       * @example
       * // Empty text is never interpreted as zero-percent minimum spacing.
       */
      () => parseParagraphMinimumSpace(value),
      RangeError,
    );
}
test(
  "native paragraph minimum spacing retains independent binary bits and complementary XML through changed rewrites",
  verifyNativeParagraphMinimumSpace,
);

/**
 * Retain opaque original binary condensation without inventing editable or XML meaning.
 *
 * Reserved source survives independent HWP output and FHN-compatible model
 * values. HWPX writing rejects it rather than replacing it with another value.
 * @async
 * @returns {Promise<void>} Resolves after lossless binary and explicit XML-bound checks.
 * @throws {Error} If reserved source is lost or silently exported as unrelated XML.
 * @example
 * // Native seven-bit value 127 remains 127 through HWP, but is not a new 25–100% UI draft.
 */
async function verifyReservedParagraphCondense(): Promise<void> {
  /** Reserved original bits remain an explicit independent paragraph source value. */
  const payload = {
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { nativeParagraphCondense: 127 },
          content: [{ type: "text", text: "reserved paragraph source" }],
        },
      ],
    },
  };
  assert.equal(paragraphSpaceFraction(127), 1);
  assert.equal(
    readHwp(writeHwp(payload)).doc.content![0].attrs!.nativeParagraphCondense,
    127,
  );
  await assert.rejects(writeHwpx(payload), /HWPX/);
}
test(
  "reserved paragraph condensation remains lossless in binary without silent HWPX substitution",
  verifyReservedParagraphCondense,
);
