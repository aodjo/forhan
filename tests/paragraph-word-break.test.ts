import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import {
  paragraphWordBreaks,
  hwpxWordBreaks,
  latinWordIntervals,
} from "../src/paragraph-word-break.ts";

/**
 * Preserve independent native paragraph modes through actual edited native files.
 *
 * Raw HWP bits follow the published binary format. HWPX non-Latin names use
 * the installed application's inverse mapping rather than their English label.
 * A second changed-content save prevents retained original bytes hiding loss.
 * @async
 * @returns {Promise<void>} Resolves after all six native combinations survive both formats.
 * @throws {Error} If raw native fields, independent readers or changed rewrites disagree.
 * @example
 * // Native non-Latin character value one saves as HWPX KEEP_WORD.
 */
async function verifyIndependentNativeWordBreaks(): Promise<void> {
  for (/** Independent expectations come from native numeric properties and literal native XML. */ const [
    latin,
    nonLatin,
    raw,
    latinXml,
    nonLatinXml,
  ] of [
    [0, 0, 0x100, "KEEP_WORD", "BREAK_WORD"],
    [1, 0, 0x120, "HYPHENATION", "BREAK_WORD"],
    [2, 0, 0x140, "BREAK_WORD", "BREAK_WORD"],
    [0, 1, 0x180, "KEEP_WORD", "KEEP_WORD"],
    [1, 1, 0x1a0, "HYPHENATION", "KEEP_WORD"],
    [2, 1, 0x1c0, "BREAK_WORD", "KEEP_WORD"],
  ] as const) {
    /** A real source paragraph preserves both independent modes and actual mixed-language text. */
    const payload = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: {
              nativeBreakLatinWord: latin,
              nativeBreakNonLatinWord: nonLatin,
            },
            content: [
              {
                type: "text",
                text: "앞말 가나다라마바 counterrevolutionary 뒷말",
              },
            ],
          },
        ],
      },
    };
    /** Actual binary records are inspected before invoking the corresponding reader. */
    const hwp = writeHwp(payload),
      container = CFB.read(hwp, { type: "buffer" }),
      info = CFB.find(container, "DocInfo");
    assert.ok(info?.content);
    let found = false;
    for (/** Raw paragraph flags retain Latin bits five/six and non-Latin bit seven independently. */ const record of parseHwpRecords(
      inflateSync(new Uint8Array(info.content)),
    ))
      if (
        record.tag === 25 &&
        (new DataView(record.bytes.buffer, record.bytes.byteOffset).getUint32(
          0,
          true,
        ) &
          0x1e0) ===
          (raw & 0x1e0)
      )
        found = true;
    assert.ok(found, `raw native paragraph flags ${raw.toString(16)}`);
    /** Raw HWPX names are checked independently from any shared normalizer. */
    const hwpx = await writeHwpx(payload),
      header = strFromU8(unzipSync(hwpx)["Contents/header.xml"]);
    assert.ok(
      header.includes(
        `breakLatinWord="${latinXml}" breakNonLatinWord="${nonLatinXml}"`,
      ),
    );
    for (/** Both actual formats are edited and converted so original source retention cannot mask a lossy writer. */ const parsed of [
      readHwp(hwp),
      await readHwpx(hwpx),
    ]) {
      assert.equal(parsed.doc.content![0].attrs!.nativeBreakLatinWord, latin);
      assert.equal(
        parsed.doc.content![0].attrs!.nativeBreakNonLatinWord,
        nonLatin,
      );
      parsed.doc.content![0].content![0].text += " 편집";
      for (/** Cross-format changes must preserve both independently selected source modes. */ const rewritten of [
        readHwp(writeHwp(parsed)),
        await readHwpx(await writeHwpx(parsed)),
      ]) {
        assert.equal(
          rewritten.doc.content![0].attrs!.nativeBreakLatinWord,
          latin,
        );
        assert.equal(
          rewritten.doc.content![0].attrs!.nativeBreakNonLatinWord,
          nonLatin,
        );
        assert.ok(
          rewritten.doc.content![0].content![0].text!.endsWith(" 편집"),
        );
      }
    }
  }
}
test(
  "six native word-breaking combinations retain raw encodings and survive edited cross-format saves",
  verifyIndependentNativeWordBreaks,
);

/**
 * Reject malformed modes and preserve the reserved binary source value explicitly.
 *
 * Absent settings use actual native defaults. A reserved binary value has no
 * HWPX equivalent and must never silently convert to ordinary word wrapping.
 * @async
 * @returns {Promise<void>} Resolves after validation, default and reserved-value checks.
 * @throws {Error} If invalid metadata is accepted or a reserved source value is silently changed.
 * @example
 * // Latin value three survives an edited HWP save while HWPX reports the limitation.
 */
async function verifyWordBreakValidation(): Promise<void> {
  assert.deepEqual(paragraphWordBreaks(), { latin: 0, nonLatin: 1 });
  assert.deepEqual(hwpxWordBreaks(), {
    breakLatinWord: "KEEP_WORD",
    breakNonLatinWord: "KEEP_WORD",
  });
  for (/** Coercion cannot turn malformed imported metadata into a different valid native mode. */ const value of [
    "",
    true,
    false,
    NaN,
    -1,
    4,
    1.5,
    "01",
    "word",
  ])
    assert.throws(
      /**
       * Exercise rejection of one malformed original native mode.
       *
       * The assertion must observe a real validation error rather than a default.
       * @returns {unknown} The normalization result, if incorrectly accepted.
       * @throws {RangeError} For the supplied malformed mode.
       * @example
       * // Boolean true is rejected instead of becoming numeric one.
       */
      () => paragraphWordBreaks({ nativeBreakLatinWord: value }),
      RangeError,
    );
  /** Reserved binary source remains representable in the original binary container. */
  const payload = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { nativeBreakLatinWord: 3, nativeBreakNonLatinWord: 0 },
            content: [{ type: "text", text: "원본 예약 값" }],
          },
        ],
      },
    },
    parsed = readHwp(writeHwp(payload));
  parsed.doc.content![0].content![0].text += " 편집";
  assert.equal(
    readHwp(writeHwp(parsed)).doc.content![0].attrs!.nativeBreakLatinWord,
    3,
  );
  await assert.rejects(writeHwpx(parsed), /HWP 또는 FHN/);
  /** A fresh native file uses defaults matching the installed original application. */
  const fresh = await readHwpx(
    await writeHwpx({
      doc: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "기본" }] },
        ],
      },
    }),
  );
  assert.equal(fresh.doc.content![0].attrs!.nativeBreakLatinWord, 0);
  assert.equal(fresh.doc.content![0].attrs!.nativeBreakNonLatinWord, 1);
}
test(
  "native defaults and reserved values cannot be silently changed by coercion or HWPX conversion",
  verifyWordBreakValidation,
);

/**
 * Preserve original Unicode boundaries for independently decorated Latin words.
 *
 * Combining marks and supplementary source characters retain UTF-16 offsets;
 * Korean, Hebrew, Arabic and emoji do not inherit the Latin paragraph mode.
 * @returns {void} Completes source-interval assertions without browser assumptions.
 * @throws {Error} If source intervals split a combining sequence or include another script.
 * @example
 * // A decomposed café remains one original Latin interval after an emoji.
 */
function verifyLatinSourceIntervals(): void {
  assert.deepEqual(
    latinWordIntervals("😀 한글 cafe\u0301 עברית العربية ABC123"),
    [
      { from: 6, to: 11 },
      { from: 26, to: 32 },
    ],
  );
  assert.deepEqual(latinWordIntervals("한글 😀 עברית العربية"), []);
}
test(
  "Latin word intervals preserve original UTF-16 combining sequences and independent scripts",
  verifyLatinSourceIntervals,
);
