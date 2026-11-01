import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import {
  characterEmphasis,
  NATIVE_EMPHASIS_TYPES,
  nativeEmphasisSvg,
  renderCharacterEmphasis,
} from "../src/character-emphasis.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import type { JSONContent } from "@tiptap/core";

/**
 * Verify native emphasis validation, distinct graphic samples and legacy values.
 *
 * Explicit unsupported inputs cannot wrap into a different four-bit effect.
 * Native XML identities remain independent of their observed visual shapes.
 * @returns {void} Asserts the complete native domain and safe source metadata.
 * @example
 * // Binary code three serializes as TILDE even though installed Hangul draws a caron.
 */
function verifyEmphasisRules(): void {
  assert.equal(NATIVE_EMPHASIS_TYPES[3], "TILDE");
  assert.equal(NATIVE_EMPHASIS_TYPES[4], "CARON");
  /** Each ordinary menu sample must distinguish its actual visual mark. */
  const samples = new Set<string>();
  for (let code = 0; code < 16; code++) {
    assert.equal(characterEmphasis(String(code)), code);
    assert.equal(
      renderCharacterEmphasis({ nativeEmphasisType: code })[
        "data-forhan-emphasis"
      ],
      String(code),
    );
    if (code < 13) samples.add(nativeEmphasisSvg(code));
  }
  assert.equal(samples.size, 13);
  assert.equal(characterEmphasis(null), 0);
  assert.deepEqual(renderCharacterEmphasis({}), {});
  for (/** Malformed source must never silently become a legitimate native style. */ const value of [
    -1,
    16,
    0.5,
    "",
    true,
    {},
    Infinity,
  ]) {
    assert.throws(
      /**
       * Reject one independently malformed emphasis code.
       *
       * The same validator protects source rendering and both native writers.
       * @returns {void} Throws the expected domain error.
       * @example
       * // Sixteen must not truncate into NONE.
       */
      () => {
        characterEmphasis(value);
      },
      RangeError,
    );
  }
}
test(
  "native emphasis preserves all observed codes and rejects invalid source values",
  verifyEmphasisRules,
);

/**
 * Verify raw native emphasis fields alongside overlapping neighboring effects.
 *
 * Raw binary assertions and literal XML checks are independent of the matching
 * decoders. Legacy binary values follow the installed native HWPX omission.
 * @async
 * @returns {Promise<void>} Resolves after all sixteen binary and XML combinations agree.
 * @throws {Error} If emphasis changes outline, shadow, strike or spacing fields.
 * @example
 * // Emphasis occupies bits twenty-one through twenty-four without changing bit twenty-five.
 */
async function verifyEmphasisEncodings(): Promise<void> {
  for (let code = 0; code < 16; code++) {
    /** Independent effects deliberately border the native emphasis bit range. */
    const doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Emphasis ABC 한글 123",
                marks: [
                  {
                    type: "textStyle",
                    attrs: {
                      fontFamily: "Arial",
                      fontSize: "32pt",
                      color: "#123456",
                      nativeEmphasisType: code,
                      nativeOutlineType: 2,
                      nativeShadowType: "DROP",
                      nativeShadowOffsetX: -10,
                      nativeShadowOffsetY: 20,
                      nativeShadowColor: "#775533",
                      nativeUseFontSpace: true,
                      nativeUseKerning: true,
                    },
                  },
                  { type: "bold" },
                  {
                    type: "strike",
                    attrs: { nativePattern: 2, nativeColor: "#654321" },
                  },
                ],
              },
            ],
          },
        ],
      },
      hwp = writeHwp({ doc }),
      hwpx = await writeHwpx({ doc }),
      compound = CFB.read(hwp, { type: "array" }),
      records = parseHwpRecords(
        inflateSync(CFB.find(compound, "DocInfo")!.content as Uint8Array),
      );
    let matched = false;
    for (/** The authored foreground selects the real active shared definition. */ const record of records) {
      if (record.tag !== 21) continue;
      /** Native flags are checked directly rather than through the corresponding reader. */
      const bytes = new DataView(
          record.bytes.buffer,
          record.bytes.byteOffset,
          record.bytes.byteLength,
        ),
        flags = bytes.getUint32(46, true);
      if (bytes.getUint32(52, true) !== 0x563412) continue;
      assert.equal((flags >>> 21) & 15, code);
      assert.equal((flags >>> 8) & 7, 2);
      assert.equal((flags >>> 11) & 3, 1);
      assert.equal((flags >>> 18) & 7, 1);
      assert.ok(flags & (1 << 25));
      assert.ok(flags & (1 << 30));
      assert.ok(flags & 2);
      matched = true;
    }
    assert.ok(matched);
    /** Native XML names are compared literally, including the original application's legacy omission. */
    const header = strFromU8(unzipSync(hwpx)["Contents/header.xml"]);
    if (code < 13)
      assert.match(
        header,
        new RegExp(`symMark="${NATIVE_EMPHASIS_TYPES[code]}"`),
      );
    else assert.doesNotMatch(header.match(/<hh:charPr\b[^>]*textColor="#123456"[^>]*>/)![0], /symMark=/);
    for (/** Both independent native formats retain effects without overwriting their neighbors. */ const [
      format,
      parsed,
    ] of [
      ["hwp", readHwp(hwp)],
      ["hwpx", await readHwpx(hwpx)],
    ] as const) {
      for (/** Mark ordering is unrelated to effect identity. */ const mark of parsed
        .doc.content![0].content![0].marks!) {
        if (mark.type !== "textStyle") continue;
        assert.equal(
          mark.attrs!.nativeEmphasisType,
          format === "hwpx" && code > 12 ? 0 : code,
        );
        assert.equal(mark.attrs!.nativeOutlineType, 2);
        assert.equal(mark.attrs!.nativeShadowType, "DROP");
        assert.equal(mark.attrs!.nativeShadowOffsetX, -10);
        assert.equal(mark.attrs!.nativeUseFontSpace, true);
        assert.equal(mark.attrs!.nativeUseKerning, true);
      }
    }
  }
}
test(
  "native emphasis bit fields and HWPX identities coexist with neighboring character effects",
  verifyEmphasisEncodings,
);
