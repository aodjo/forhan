import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  fontSizePoints,
  displayFontSize,
  fixedLineHeightPoints,
  storedFontSizePoints,
  fontSizeInputError,
  stepFontSize,
  MAX_STORED_FONT_SIZE,
} from "../src/formatting.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/**
 * Find the first explicit character-size mark in a reconstructed document.
 *
 * Checks imported native character definitions rather than inspecting the
 * writer's private style registry or reproducing its conversion algorithm.
 * @param {JSONContent} node - Reconstructed native document node.
 * @returns {string | undefined} First character size, if present.
 * @example
 * firstFontSize(reimported.doc); // '12pt'
 */
function firstFontSize(node: JSONContent): string | undefined {
  for (/** Inline mark reconstructed by the independent native reader. */ const mark of node.marks ||
    [])
    if (mark.type === "textStyle" && typeof mark.attrs?.fontSize === "string")
      return mark.attrs.fontSize;
  for (/** Child inspected for an explicit native character size. */ const child of node.content ||
    []) {
    /** First size found within this child subtree. */
    const value = firstFontSize(child);
    if (value) return value;
  }
  return undefined;
}

/**
 * Verify physical font units and default heading sizes in both native formats.
 *
 * Point expectations are independent physical measurements: 96 CSS pixels,
 * 72 points, 25.4 millimetres and 2.54 centimetres all represent one inch.
 * Default body and heading sizes must agree with the measured editor theme.
 * @async
 * @returns {Promise<void>} Resolves after both native readers confirm every size.
 * @throws {Error} If a native document changes the authored physical character size.
 * @example
 * // A 16px text run reopens as 12pt rather than 16pt.
 */
async function verifyNativeFontUnits(): Promise<void> {
  for (/** Absolute source size and its independently specified native point expectation. */ const [
    value,
    expected,
  ] of [
    ["16px", 12],
    ["1in", 72],
    ["25.4mm", 72],
    ["2.54cm", 72],
    ["1pc", 12],
    ["13.25pt", 13.25],
    ["0pt", 0],
    ["0.01pt", 0.01],
    ["0.5pt", 0.5],
    ["1pt", 1],
    ["3.25pt", 3.25],
    ["200pt", 200],
    ["5000pt", 5000],
    ["21474836.47pt", 21474836.47],
    ["9.6e1px", 72],
    ["+12pt", 12],
    ["", 10],
  ] as const) {
    /** Minimal authored body run with or without explicit character formatting. */
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "글자 크기",
              ...(value
                ? { marks: [{ type: "textStyle", attrs: { fontSize: value } }] }
                : {}),
            },
          ],
        },
      ],
    };
    for (/** Independently parsed binary or XML-package document. */ const result of [
      readHwp(writeHwp({ doc })),
      await readHwpx(await writeHwpx({ doc })),
    ]) {
      assert.equal(firstFontSize(result.doc), `${expected}pt`);
    }
  }
  for (/** Heading level and the physical size shared by screen and both encoders. */ const [
    level,
    expected,
  ] of [
    [1, 24],
    [2, 18],
    [3, 15],
    [4, 13],
    [5, 13],
    [6, 13],
  ]) {
    /** Unformatted heading whose size must come from the shared style default. */
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level },
          content: [{ type: "text", text: "제목 기본 크기" }],
        },
      ],
    };
    for (/** Native reconstruction of the heading's actual shared character definition. */ const result of [
      readHwp(writeHwp({ doc })),
      await readHwpx(await writeHwpx({ doc })),
    ])
      assert.equal(firstFontSize(result.doc), `${expected}pt`);
  }
  assert.equal(fontSizePoints("0pt"), 10);
  assert.equal(storedFontSizePoints("0pt"), 0);
  assert.equal(fontSizePoints("1.5em", 18), 18);
  assert.equal(displayFontSize(13.25), "13.25");
  assert.equal(displayFontSize(10), "10.0");
}
test(
  "HWP and HWPX retain physical font units and shared body/heading defaults",
  verifyNativeFontUnits,
);

/**
 * Reject unrepresentable native heights and verify interactive size boundaries.
 *
 * Overflow must fail at each public exporter instead of wrapping in a binary
 * integer conversion. Entry validation separately preserves unchanged imported
 * subminimum sizes and one-point actions retain their fractional component.
 * @async
 * @returns {Promise<void>} Resolves after both writers reject the oversized document.
 * @throws {Error} If overflow is accepted or entry and step behavior diverge.
 * @example
 * // 21474836.48pt cannot be encoded in a signed 32-bit native height.
 */
async function verifyFontSizeBoundaries(): Promise<void> {
  /** Document one native height unit beyond the shared signed storage limit. */
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Overflow",
            marks: [
              { type: "textStyle", attrs: { fontSize: "21474836.48pt" } },
            ],
          },
        ],
      },
    ],
  };
  assert.throws(
    /**
     * Serialize an oversized character definition through the binary exporter.
     *
     * The public boundary must throw before writing a wrapped native height.
     * @returns {Uint8Array} Encoded bytes only if the overflow guard fails.
     * @throws {RangeError} Because this character height exceeds signed storage.
     * @example
     * // Invoked by assert.throws to verify failure at the public boundary.
     */
    () => writeHwp({ doc }),
    RangeError,
  );
  await assert.rejects(
    /**
     * Serialize the same oversized definition through the XML exporter.
     *
     * XML and binary documents share native character height capacity.
     * @returns {Promise<Uint8Array>} Encoded package only if validation fails.
     * @throws {RangeError} Because the character height is not representable.
     * @example
     * // Invoked by assert.rejects to verify asynchronous export failure.
     */
    () => writeHwpx({ doc }),
    RangeError,
  );
  assert.equal(fontSizeInputError("1", 10), "");
  assert.equal(fontSizeInputError("200", 10), "");
  assert.equal(fontSizeInputError("5000", 10), "");
  assert.equal(fontSizeInputError("0", 0), "");
  assert.equal(fontSizeInputError("0.5", 0.5), "");
  assert.notEqual(fontSizeInputError("0.5", 10), "");
  assert.notEqual(fontSizeInputError("", 10), "");
  assert.notEqual(fontSizeInputError("NaN", 10), "");
  assert.notEqual(fontSizeInputError("1.001", 10), "");
  assert.notEqual(fontSizeInputError("21474836.48", 10), "");
  assert.equal(stepFontSize(13.25, 1), 14.25);
  assert.equal(stepFontSize(13.25, -1), 12.25);
  assert.equal(stepFontSize(1, -1), 1);
  assert.equal(stepFontSize(MAX_STORED_FONT_SIZE, 1), MAX_STORED_FONT_SIZE);
}
test(
  "native font height overflow fails explicitly and entry rules preserve imported sizes",
  verifyFontSizeBoundaries,
);

/**
 * Verify physical paragraph distances survive both native serializers.
 *
 * Fixed lengths must remain distances rather than silently becoming percent
 * multipliers. The native readers also distinguish proportional line spacing.
 * @async
 * @returns {Promise<void>} Resolves after every authored spacing mode reopens correctly.
 * @throws {Error} If a native format changes the paragraph's physical line distance.
 * @example
 * // 18.25pt stays fixed at 18.25pt in both HWP and HWPX.
 */
async function verifyNativeLineSpacing(): Promise<void> {
  for (/** Source paragraph spacing and its independent physical expectation. */ const [
    value,
    expected,
  ] of [
    ["18pt", "18pt"],
    ["18.25pt", "18.25pt"],
    ["24px", "18pt"],
    ["0.25in", "18pt"],
    ["175%", "175%"],
    ["1.75", "175%"],
    ["normal", "160%"],
  ]) {
    /** Minimal paragraph exercising the public native write/read boundary. */
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { lineHeight: value },
          content: [{ type: "text", text: "고정 줄 간격 검증" }],
        },
      ],
    };
    /** Independent binary reader result. */
    const binary = readHwp(writeHwp({ doc }));
    /** Independent XML-package reader result. */
    const xml = await readHwpx(await writeHwpx({ doc }));
    assert.equal(binary.doc.content?.[0]?.attrs?.lineHeight, expected);
    assert.equal(
      xml.doc.content?.[0]?.attrs?.lineHeight,
      expected.endsWith("%") ? String(parseFloat(expected) / 100) : expected,
    );
  }
  assert.equal(fixedLineHeightPoints("24px"), 18);
  assert.equal(fixedLineHeightPoints("160%"), null);
  assert.equal(fixedLineHeightPoints("1.6"), null);
  assert.equal(fixedLineHeightPoints("0pt"), 0);
  assert.equal(fixedLineHeightPoints("1.5em"), 7.5);
  assert.equal(fixedLineHeightPoints("0em"), 0);
  assert.equal(fixedLineHeightPoints("-1em"), null);
  /** Portable paragraph fixture used to reproduce native unit alternatives. */
  const fixedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { lineHeight: "18.25pt" },
        content: [{ type: "text", text: "단위 대체값" }],
      },
    ],
  };
  /** Public HWPX package containing the authored fixed line distance. */
  const entries = unzipSync(await writeHwpx({ doc: fixedDoc }));
  /** Hancom-style switch: explicit character units followed by legacy packed URC. */
  const header = strFromU8(entries["Contents/header.xml"]).replace(
    /<hh:lineSpacing type="FIXED"[^>]*\/>/g,
    '<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:lineSpacing type="FIXED" value="912" unit="CHAR"/></hp:case><hp:default><hh:lineSpacing type="FIXED" value="1825" unit="HWPUNIT"/></hp:default></hp:switch>',
  );
  assert.ok(header.includes('unit="CHAR"'));
  entries["Contents/header.xml"] = strToU8(header);
  /** Explicit character spacing must retain its unit rather than become points. */
  const alternative = await readHwpx(zipSync(entries));
  assert.equal(alternative.doc.content?.[0]?.attrs?.lineHeight, "9.12em");
}
test(
  "HWP and HWPX preserve fixed and proportional paragraph spacing",
  verifyNativeLineSpacing,
);
