import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { paragraphLengthPoints } from "../src/formatting.ts";
import {
  encodeParagraphUrc,
  decodeParagraphUrc,
  paragraphMeasureCss,
} from "../src/formats/paragraph-measures.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/**
 * Verify paragraph distances and hanging signs across both native file formats.
 *
 * Expectations use physical points rather than reader-specific CSS strings.
 * The native switch fixture reproduces the mixed-unit alternative observed in
 * installed Hancom output, including misleading HWPUNIT fields in its CHAR case.
 * @async
 * @returns {Promise<void>} Resolves when every native distance survives reconstruction.
 * @throws {Error} If a margin is halved, rounded prematurely or changes indentation sign.
 * @example
 * // A hanging first line remains -18.25pt while the left margin stays 12.25pt.
 */
async function verifyParagraphDistances(): Promise<void> {
  for (/** First-line and hanging indentation use opposite signed native distances. */ const sign of [
    1, -1,
  ]) {
    /** Independent authored physical distances in native hundredth points. */
    const expected = {
      marginLeft: 12.25,
      marginRight: 7.5,
      textIndent: sign * 18.25,
      marginTop: 3.25,
      marginBottom: 6.5,
    };
    /** Paragraph with explicit physical geometry and enough text for several lines. */
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            marginLeft: "12.25pt",
            marginRight: "7.5pt",
            textIndent: `${sign * 18.25}pt`,
            marginTop: "3.25pt",
            marginBottom: "6.5pt",
          },
          content: [{ type: "text", text: "첫 줄과 여백 검증 ".repeat(12) }],
        },
      ],
    };
    /** Public XML package used to exercise both direct and alternate margin definitions. */
    const encoded = await writeHwpx({ doc });
    /** Writable native package entries for the observed mixed-unit switch fixture. */
    const entries = unzipSync(encoded);
    /** Explicit mixed-unit case and its legacy packed-URC fallback. */
    const header = strFromU8(entries["Contents/header.xml"]).replace(
      /<hh:margin>([\s\S]*?)<\/hh:margin>/g,
      `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:intent value="${Math.floor((sign * 1825) / 2)}" unit="CHAR"/><hc:left value="612" unit="CHAR"/><hc:right value="375" unit="HWPUNIT"/><hc:prev value="162" unit="CHAR"/><hc:next value="325" unit="HWPUNIT"/></hh:margin></hp:case><hp:default>$&</hp:default></hp:switch>`,
    );
    assert.ok(header.includes('unit="CHAR"'));
    entries["Contents/header.xml"] = strToU8(header);
    for (/** Reconstruction from independent native binary and plain XML formats. */ const result of [
      readHwp(writeHwp({ doc })),
      await readHwpx(encoded),
    ]) {
      for (/** Authored property checked independently in physical points. */ const key of Object.keys(
        expected,
      ) as Array<keyof typeof expected>) {
        assert.equal(
          Number(
            paragraphLengthPoints(
              result.doc.content?.[0]?.attrs?.[key],
            ).toFixed(2),
          ),
          expected[key],
          key,
        );
      }
    }
    /** Native explicit-unit reconstruction retains characters instead of guessing point values. */
    const mixed = await readHwpx(zipSync(entries));
    assert.equal(mixed.doc.content?.[0]?.attrs?.marginLeft, "6.12em");
    assert.equal(
      mixed.doc.content?.[0]?.attrs?.textIndent,
      `${Math.floor((sign * 1825) / 2) / 100}em`,
    );
    assert.equal(
      Number(
        paragraphLengthPoints(
          mixed.doc.content?.[0]?.attrs?.marginRight,
        ).toFixed(2),
      ),
      3.75,
    );
    /** An empty recognized case exercises the legacy URC default without losing its type. */
    const fallbackHeader = header.replace(
      /(<hp:case[^>]*>)[\s\S]*?(<\/hp:case>)/g,
      "$1$2",
    );
    entries["Contents/header.xml"] = strToU8(fallbackHeader);
    /** Legacy default and explicit case describe the same typed native distances. */
    const legacy = await readHwpx(zipSync(entries));
    assert.equal(
      legacy.doc.content?.[0]?.attrs?.marginLeft,
      mixed.doc.content?.[0]?.attrs?.marginLeft,
    );
    assert.equal(
      legacy.doc.content?.[0]?.attrs?.textIndent,
      mixed.doc.content?.[0]?.attrs?.textIndent,
    );
  }
  assert.equal(paragraphLengthPoints("-0.25in"), -18);
  assert.equal(paragraphLengthPoints("24px"), 18);
  assert.equal(paragraphLengthPoints("1pc"), 12);
  assert.equal(paragraphLengthPoints("normal"), 0);
  assert.equal(paragraphLengthPoints("-1.825e1pt"), -18.25);
  assert.equal(encodeParagraphUrc("50pt"), 10000);
  assert.deepEqual(decodeParagraphUrc(10000), { value: 5000, unit: "HWPUNIT" });
  assert.equal(encodeParagraphUrc("-18.25pt"), -3650);
  assert.equal(encodeParagraphUrc("-1.5em"), -299);
  assert.equal(paragraphMeasureCss(decodeParagraphUrc(-299)), "-1.5em");
  /** Relative indentation and fixed character spacing must retain their native units. */
  const relativeDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          marginLeft: "1.5em",
          textIndent: "-0.5em",
          lineHeight: "1.75em",
        },
        content: [{ type: "text", text: "글자 단위 보존" }],
      },
    ],
  };
  for (/** Relative typed geometry reconstructed through each public native codec. */ const relative of [
    readHwp(writeHwp({ doc: relativeDoc })),
    await readHwpx(await writeHwpx({ doc: relativeDoc })),
  ]) {
    assert.equal(relative.doc.content?.[0]?.attrs?.marginLeft, "1.5em");
    assert.equal(relative.doc.content?.[0]?.attrs?.textIndent, "-0.5em");
    assert.equal(relative.doc.content?.[0]?.attrs?.lineHeight, "1.75em");
  }
  assert.equal(
    Number(paragraphLengthPoints("6.438194444444445mm").toFixed(2)),
    18.25,
  );
}
test(
  "native paragraph distances preserve hundredth points and complete unit alternatives",
  verifyParagraphDistances,
);
