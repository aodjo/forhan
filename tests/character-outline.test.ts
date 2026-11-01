import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import {
  characterOutline,
  NATIVE_OUTLINE_TYPES,
  nativeOutlineSvg,
  renderCharacterOutline,
} from "../src/character-outline.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import type { JSONContent } from "@tiptap/core";

/**
 * Verify observed outline identities and safe source serialization.
 *
 * Native outline codes differ from underline patterns. The unlisted legacy
 * binary value seven is retained separately rather than invented as a style.
 * @returns {void} Asserts fixed native identities, distinct samples and invalid-input rejection.
 * @example
 * // Outline DOT is two, while native underline DOT is one.
 */
function verifyOutlineRules(): void {
  assert.deepEqual(NATIVE_OUTLINE_TYPES, [
    "NONE",
    "SOLID",
    "DOT",
    "THICK",
    "DASH",
    "DASH_DOT",
    "DASH_DOT_DOT",
  ]);
  /** Each ordinary native selector row must have distinct independently drawn geometry. */
  const samples = new Set<string>();
  for (let code = 0; code < 7; code++) {
    assert.equal(characterOutline(String(code)), code);
    samples.add(nativeOutlineSvg(code));
  }
  assert.equal(samples.size, 7);
  assert.equal(characterOutline(null), 0);
  assert.equal(characterOutline(7), 7);
  assert.equal(
    renderCharacterOutline({ nativeOutlineType: 7 })["data-forhan-outline"],
    "7",
  );
  assert.match(
    renderCharacterOutline({ nativeOutlineType: 7 }).style,
    /fill-color:currentColor/,
  );
  assert.match(
    renderCharacterOutline({ nativeOutlineType: 3 }).style,
    /stroke:2px currentColor/,
  );
  assert.deepEqual(renderCharacterOutline({}), {});
  for (/** Invalid inputs must never coerce into a legitimate native bit field. */ const value of [
    8,
    -1,
    0.5,
    "",
    true,
    {},
    Number.POSITIVE_INFINITY,
  ])
    assert.throws(
      /**
       * Validate one independently malformed native source code.
       *
       * No renderer or writer may silently wrap that value into another outline.
       * @returns {void} Throws the expected domain-validation error.
       * @example
       * // Code eight cannot wrap into the NONE bit pattern.
       */
      () => {
        characterOutline(value);
      },
      RangeError,
    );
}
test(
  "native outline codes keep independent selector identities and legacy source metadata",
  verifyOutlineRules,
);

/**
 * Verify real binary and XML outline encodings against installed-Hangul observations.
 *
 * Bold, underline, shadow and shading coexist with every outline code. The
 * legacy value seven retains binary bits and follows the native application's
 * empty-outline projection when converted to HWPX.
 * @async
 * @returns {Promise<void>} Resolves after independent raw fields and both source decoders agree.
 * @throws {Error} If contour bits collide with other effects or native XML types differ.
 * @example
 * // DOT is binary flags 512 and hh:outline type DOT without replacing shadow bits.
 */
async function verifyOutlineEncodings(): Promise<void> {
  for (let code = 0; code < 8; code++) {
    /** Source data combines effects whose binary fields must remain independent. */
    const attrs = {
        fontFamily: "Arial",
        fontSize: "32pt",
        color: "#123456",
        backgroundColor: "#faf3db",
        nativeOutlineType: code,
        nativeShadowType: "CONTINUOUS",
        nativeShadowOffsetX: -10,
        nativeShadowOffsetY: 20,
        nativeShadowColor: "#775533",
      },
      doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Outline ABC 한글",
                marks: [
                  { type: "textStyle", attrs },
                  { type: "bold" },
                  {
                    type: "underline",
                    attrs: {
                      nativePosition: "TOP",
                      nativePattern: 11,
                      nativeColor: "#654321",
                    },
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
    let found = false;
    for (/** Raw binary assertions do not depend on the matching source decoder. */ const record of records)
      if (record.tag === 21) {
        /** The authored foreground identifies the actual active shared definition. */
        const view = new DataView(
            record.bytes.buffer,
            record.bytes.byteOffset,
            record.bytes.byteLength,
          ),
          flags = view.getUint32(46, true);
        if (view.getUint32(52, true) !== 0x563412) continue;
        assert.equal(flags & (7 << 8), code << 8);
        assert.equal(flags & (3 << 11), 4096);
        assert.equal(flags & 2, 2);
        assert.equal((flags >>> 2) & 3, 3);
        assert.equal((flags >>> 4) & 15, 11);
        found = true;
      }
    assert.equal(found, true);
    /** Actual XML must match the independently observed native type names, including the legacy omission. */
    const header = strFromU8(unzipSync(hwpx)["Contents/header.xml"]);
    if (code === 7) assert.match(header, /<hh:outline\s*\/>/);
    else
      assert.match(
        header,
        new RegExp(`<hh:outline type="${NATIVE_OUTLINE_TYPES[code]}"`),
      );
    for (/** Both actual parsers must preserve all unrelated source effects on their original run. */ const [
      format,
      parsed,
    ] of [
      ["hwp", readHwp(hwp)],
      ["hwpx", await readHwpx(hwpx)],
    ] as const) {
      let matched = false;
      for (/** Native parser mark order does not define character-style identity. */ const mark of parsed
        .doc.content![0].content![0].marks!)
        if (mark.type === "textStyle") {
          assert.equal(
            mark.attrs!.nativeOutlineType,
            format === "hwpx" && code === 7 ? 0 : code,
          );
          assert.equal(mark.attrs!.nativeShadowType, "CONTINUOUS");
          assert.equal(mark.attrs!.nativeShadowOffsetX, -10);
          assert.equal(mark.attrs!.nativeShadowColor, "#775533");
          assert.equal(mark.attrs!.backgroundColor, "#faf3db");
          matched = true;
        }
      assert.equal(matched, true);
    }
  }
}
test(
  "native contour bit fields and XML types preserve concurrent shadow, line and shading effects",
  verifyOutlineEncodings,
);
