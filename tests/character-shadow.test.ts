import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import {
  characterShadow,
  characterShadowCss,
  renderCharacterShadow,
} from "../src/character-shadow.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import type { JSONContent } from "@tiptap/core";

/**
 * Verify safe native shadow domains and distinct disabled, zero and extrusion states.
 *
 * Invalid values must fail before binary wrapping or CSS construction. Bounded
 * drawing retains source percentages even when a very large font needs sampling.
 * @returns {void} Asserts independent preferences and safe deterministic drawing.
 * @example
 * // DROP with zero offsets remains enabled in metadata instead of becoming NONE.
 */
function verifyShadowRules(): void {
  assert.deepEqual(characterShadow(), {
    type: "NONE",
    x: 10,
    y: 10,
    color: "#c0c0c0",
  });
  assert.equal(
    characterShadowCss({ fontSize: "10pt", nativeShadowType: "DROP" }),
    "1pt 1pt 0 #c0c0c0",
  );
  assert.equal(
    characterShadowCss({
      fontSize: "16pt",
      nativeShadowType: "DROP",
      nativeShadowOffsetX: -20,
      nativeShadowOffsetY: 0,
    }),
    "-3.2pt 0pt 0 #c0c0c0",
  );
  assert.equal(
    characterShadowCss({ nativeShadowType: "NONE", nativeShadowOffsetX: -128 }),
    "none",
  );
  assert.equal(
    characterShadowCss({
      fontSize: "10pt",
      nativeShadowType: "DROP",
      nativeShadowOffsetX: 0,
      nativeShadowOffsetY: 0,
    }),
    "0pt 0pt 0 #c0c0c0",
  );
  assert.ok(
    characterShadowCss({
      fontSize: "16pt",
      nativeShadowType: "CONTINUOUS",
    }).split(",").length > 1,
  );
  assert.ok(
    characterShadowCss({
      fontSize: "5000pt",
      nativeShadowType: "CONTINUOUS",
      nativeShadowOffsetX: 127,
    }).split(",").length <= 512,
  );
  assert.deepEqual(renderCharacterShadow({}), {});
  assert.equal(
    JSON.parse(
      renderCharacterShadow({
        nativeShadowType: "NONE",
        nativeShadowOffsetY: -20,
      })["data-forhan-shadow"],
    ).y,
    -20,
  );
  for (/** Malformed source inputs must be rejected independently of visible drawing state. */ const attrs of [
    { nativeShadowType: "invalid" },
    { nativeShadowOffsetX: 128 },
    { nativeShadowOffsetY: -129 },
    { nativeShadowOffsetX: 0.5 },
    { nativeShadowOffsetY: "" },
    { nativeShadowOffsetY: true },
    { nativeShadowColor: "url(https://example.com/image)" },
  ])
    assert.throws(
      /**
       * Validate one malformed source definition through the production boundary.
       *
       * Native disabled state does not excuse corrupt retained preferences.
       * @returns {void} Throws the expected domain-validation error.
       * @example
       * // 128 must never wrap into a negative signed-byte percentage.
       */
      () => {
        characterShadow(attrs);
      },
      RangeError,
    );
}
test(
  "native shadow validation retains inactive and zero values without unsafe coercion",
  verifyShadowRules,
);

/**
 * Verify exact native fields against independently observed installed-Hangul encodings.
 *
 * Both real writers and parsers must preserve direction signs, zero offsets,
 * type bits and COLORREF byte order. Inactive preferences are serialized too.
 * @async
 * @returns {Promise<void>} Resolves after binary and XML encodings agree with native observations.
 * @throws {Error} If independent expected bits or round-tripped source fields differ.
 * @example
 * // Native DROP is bits 11..12 value one; signed offsets occupy bytes 50 and 51.
 */
async function verifyShadowEncodings(): Promise<void> {
  for (/** Native-generated sample values are fixed independently of the implementation's constants. */ const [
    type,
    x,
    y,
    color,
    bits,
    colorref,
  ] of [
    ["NONE", 10, 10, "#c0c0c0", 0, 0xc0c0c0],
    ["DROP", 10, 20, "#123456", 2048, 0x563412],
    ["CONTINUOUS", 10, 10, "#654321", 4096, 0x214365],
    ["DROP", -20, 30, "#775533", 2048, 0x335577],
    ["DROP", 0, 0, "#000000", 2048, 0],
    ["CONTINUOUS", -10, 0, "#663300", 4096, 0x003366],
  ] as const) {
    /** Foreground and shadow colors remain independent on the actual editable source run. */
    const attrs = {
        fontSize: "16pt",
        color: "#112233",
        nativeShadowType: type,
        nativeShadowOffsetX: x,
        nativeShadowOffsetY: y,
        nativeShadowColor: color,
      },
      doc: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shadow 한글",
                marks: [{ type: "textStyle", attrs }],
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
    for (/** Raw bytes establish conformance independently of the corresponding source parser. */ const record of records)
      if (record.tag === 21) {
        /** Shared character definitions contain the actual independently encoded native fields. */
        const view = new DataView(
          record.bytes.buffer,
          record.bytes.byteOffset,
          record.bytes.byteLength,
        );
        if (view.getUint32(52, true) !== 0x332211) continue;
        assert.equal(view.getUint32(46, true) & (3 << 11), bits);
        assert.equal(view.getInt8(50), x);
        assert.equal(view.getInt8(51), y);
        assert.equal(view.getUint32(64, true), colorref);
        matched = true;
      }
    assert.equal(matched, true);
    /** Actual generated header bytes must retain the native XML type and signed decimal offsets. */
    const header = strFromU8(unzipSync(hwpx)["Contents/header.xml"]);
    assert.match(
      header,
      new RegExp(
        `<hh:shadow type="${type}" color="${color}" offsetX="${x}" offsetY="${y}"`,
      ),
    );
    for (/** Actual binary and XML parser outputs must retain the same complete native source definition. */ const parsed of [
      readHwp(hwp),
      await readHwpx(hwpx),
    ]) {
      let found = false;
      for (/** Parser mark ordering does not define source style identity. */ const mark of parsed
        .doc.content![0].content![0].marks!)
        if (mark.type === "textStyle") {
          assert.deepEqual(characterShadow(mark.attrs), { type, x, y, color });
          assert.equal(mark.attrs!.color, "#112233");
          found = true;
        }
      assert.equal(found, true);
    }
  }
}
test(
  "native shadow binary and XML fields match installed application observations",
  verifyShadowEncodings,
);
