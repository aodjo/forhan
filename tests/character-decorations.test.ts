import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import {
  characterDecoration,
  NATIVE_LINE_PATTERNS,
  nativeDecorationPattern,
  decorationHtml,
  nativeLineSvg,
} from "../src/character-decorations.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import { decorationDrawingStyle } from "../src/decoration-drawing.ts";

/**
 * Verify distinct native line domains and safe independent drawing definitions.
 *
 * Every supported pattern has distinct geometry; line color never becomes text
 * color. Invalid source settings must fail before a serializer changes them.
 * @returns {void} Checks actual line validation, independent colors and pattern drawings.
 * @example
 * // Native DOT is one and DASH is two in independently generated native XML.
 */
function verifyDecorationRules(): void {
  assert.equal(nativeDecorationPattern("DOT", "underline"), 1);
  assert.equal(nativeDecorationPattern("DASH", "strike"), 2);
  assert.equal(
    characterDecoration({ nativePosition: "CENTER" }, "underline")
      .nativePosition,
    "CENTER",
  );
  /** Original SVG geometry must distinguish every editable native shape. */
  const geometry = new Set<string>();
  for (let index = 0; index < 13; index++)
    geometry.add(nativeLineSvg(index, "#123456"));
  assert.equal(geometry.size, 13);
  assert.match(
    decorationHtml(
      { nativePosition: "TOP", nativePattern: 11, nativeColor: "#123456" },
      "underline",
    ).style,
    /text-decoration-line:overline/,
  );
  assert.match(
    decorationHtml(null, "strike").style,
    /text-decoration-color:#000000/,
  );
  assert.match(
    decorationDrawingStyle([
      { type: "strike", attrs: { nativePattern: 10, nativeColor: "#654321" } },
    ]),
    /background-image:url/,
  );
  assert.throws(
    /**
     * Reject an unknown native shape without flattening it to a solid line.
     *
     * A mismatched source pattern must not be silently rewritten as solid.
     * @returns {number} Never returns for this deliberately unsupported pattern.
     * @throws {RangeError} Always rejects the invalid native strike shape.
     * @example
     * // Unknown enum spellings cannot enter native file writing.
     */
    () => nativeDecorationPattern("UNKNOWN", "strike"),
    RangeError,
  );
}
test(
  "native decoration positions, shapes and opaque colors remain distinct",
  verifyDecorationRules,
);

/**
 * Verify every editable native line survives independently inspected binary/XML rewrites.
 *
 * Published character-shape bit fields and independent line COLORREF offsets
 * are checked directly, alongside both source readers and changed text exports.
 * @async
 * @returns {Promise<void>} Resolves after all native positions, patterns and colors survive.
 * @throws {Error} If actual stored line bits/colors or changed-content formatting differ.
 * @example
 * // A colored overline wave and a differently colored dotted strike coexist.
 */
async function verifyNativeDecorations(): Promise<void> {
  for (let pattern = 0; pattern < 13; pattern++) {
    /** Separate line shapes and colors are independently authored for each case. */
    const position = pattern % 2 === 0 ? "TOP" : "BOTTOM",
      strikePattern = pattern % 11,
      payload = {
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Native lines 한글",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: { fontSize: "16pt", color: "#aabbcc" },
                    },
                    {
                      type: "underline",
                      attrs: {
                        nativePosition: position,
                        nativePattern: pattern,
                        nativeColor: "#123456",
                      },
                    },
                    {
                      type: "strike",
                      attrs: {
                        nativePattern: strikePattern,
                        nativeColor: "#654321",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
    /** Raw native flags and COLORREF bytes do not depend on the reconstructed source reader. */
    const binary = writeHwp(payload),
      container = CFB.read(binary, { type: "buffer" }),
      stream = CFB.find(container, "DocInfo")!,
      records = parseHwpRecords(
        inflateSync(new Uint8Array(stream.content as Uint8Array)),
      );
    let matched = false;
    for (/** Every actual character-shape record is inspected at the published byte offsets. */ const record of records)
      if (record.tag === 21) {
        /** Foreground color identifies the controlled source shape independently of its registry index. */
        const data = new DataView(record.bytes.buffer, record.bytes.byteOffset),
          flags = data.getUint32(46, true);
        if (data.getUint32(52, true) !== 0xccbbaa) continue;
        assert.equal((flags >>> 2) & 3, position === "TOP" ? 3 : 1);
        assert.equal((flags >>> 4) & 15, pattern);
        assert.equal((flags >>> 26) & 15, strikePattern);
        assert.equal(data.getUint32(56, true), 0x563412);
        assert.equal(data.getUint32(70, true), 0x214365);
        matched = true;
      }
    assert(matched);
    /** XML attributes expose actual native line names and independent colors. */
    const xml = await writeHwpx(payload),
      header = strFromU8(unzipSync(xml)["Contents/header.xml"]);
    assert(
      header.includes(
        `type="${position}" shape="${NATIVE_LINE_PATTERNS[pattern]}" color="#123456"`,
      ),
    );
    assert(
      header.includes(
        `shape="${NATIVE_LINE_PATTERNS[strikePattern]}" color="#654321"`,
      ),
    );
    for (/** Both actual native encodings must survive unrelated text changes, not only source-byte reuse. */ const format of [
      "hwp",
      "hwpx",
    ] as const) {
      /** Parsed editable marks retain each original line's own complete source properties. */
      const parsed = format === "hwp" ? readHwp(binary) : await readHwpx(xml),
        run = parsed.doc.content![0].content![0];
      for (/** Actual independent mark lookup avoids assumptions about parser-specific ordering. */ const mark of run.marks!) {
        if (mark.type === "underline")
          assert.deepEqual(mark.attrs, {
            nativePosition: position,
            nativePattern: pattern,
            nativeColor: "#123456",
          });
        if (mark.type === "strike") {
          assert.equal(mark.attrs!.nativePattern, strikePattern);
          assert.equal(mark.attrs!.nativeColor, "#654321");
        }
      }
      run.text += " EDIT";
      /** An edited rewrite cannot fall back to returning original native source bytes. */
      const changed = { doc: parsed.doc },
        rewritten =
          format === "hwp"
            ? readHwp(writeHwp(changed))
            : await readHwpx(await writeHwpx(changed));
      assert.equal(
        rewritten.doc.content![0].content![0].text,
        "Native lines 한글 EDIT",
      );
      assert.deepEqual(rewritten.doc.content![0].content![0].marks, run.marks);
    }
  }
}
test(
  "all native underline and strike shapes preserve independent binary/XML attributes",
  verifyNativeDecorations,
);

/**
 * Preserve the installed-native binary conversion of legacy centered underline color.
 *
 * Native HWP reload converts CENTER to strikeout. HWPX retains CENTER, while
 * binary export must transfer its actual color and pattern rather than using
 * an unrelated absent-strike color. Two independent centered lines cannot be
 * represented by one binary strike definition and must fail explicitly.
 * @async
 * @returns {Promise<void>} Resolves after native-equivalent binary projection and exact XML retention.
 * @throws {Error} If original line color is lost or unsupported dual lines silently collapse.
 * @example
 * // The installed-native CENTER sample reopens as a #123456 strike in binary HWP.
 */
async function verifyCenteredNativeLine(): Promise<void> {
  /** Original centered line comes from the native legacy position domain. */
  const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Legacy center",
              marks: [
                {
                  type: "underline",
                  attrs: {
                    nativePosition: "CENTER",
                    nativePattern: 0,
                    nativeColor: "#123456",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    binary = readHwp(writeHwp({ doc })),
    xml = await readHwpx(await writeHwpx({ doc }));
  assert.equal(binary.doc.content![0].content![0].marks![0].type, "strike");
  assert.equal(
    binary.doc.content![0].content![0].marks![0].attrs!.nativeColor,
    "#123456",
  );
  assert.equal(
    xml.doc.content![0].content![0].marks![0].attrs!.nativePosition,
    "CENTER",
  );
  /** A second independently styled center line must not disappear silently. */
  const conflicting = structuredClone(doc);
  conflicting.content[0].content[0].marks.push({
    type: "strike",
    attrs: {
      nativePosition: "BOTTOM",
      nativePattern: 2,
      nativeColor: "#654321",
    },
  });
  assert.throws(
    /**
     * Reject two independent centered source definitions in a single binary line slot.
     *
     * HWPX and Forhan remain available to retain the complete editable source.
     * @returns {Uint8Array} Never returns for the unrepresentable binary combination.
     * @throws {Error} Always rejects the conflicting source definitions.
     * @example
     * // A wave center and separately colored strike cannot be flattened safely.
     */
    () => writeHwp({ doc: conflicting }),
    /two independently styled centered lines/,
  );
}
test(
  "legacy native centered lines preserve color through binary HWP conversion",
  verifyCenteredNativeLine,
);
