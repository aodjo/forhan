import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import CFB from "cfb";
import type { JSONContent } from "@tiptap/core";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { inflateSync } from "fflate";
import { templates } from "../src/documents.ts";

/**
 * Verify explicit header and footer areas survive native page serialization.
 *
 * Positive dimensions are returned in millimetres, while legacy six-field
 * geometry and explicit zero areas remain absent from imported page metadata.
 * @returns {void} Completes the page-area compatibility assertions.
 * @example
 * verifyHeaderFooterAreas() // Preserves 15mm header and 12.5mm footer dimensions.
 */
function verifyHeaderFooterAreas(): void {
  /** Authored physical page geometry including separate header and footer areas. */
  const page = {
    width: 210,
    height: 297,
    marginTop: 20,
    marginBottom: 15,
    marginLeft: 30,
    marginRight: 30,
    header: 15,
    footer: 12.5,
  };
  /** Imported native page geometry reconstructed from the independently written source. */
  const result = readHwp(
    writeHwp({ doc: documentOf(paragraph("머리말·꼬리말 영역")), page }),
  );
  assert.ok(Math.abs((result.page.header || 0) - 15) < 0.02);
  assert.ok(Math.abs((result.page.footer || 0) - 12.5) < 0.02);
  /** Explicit zero values used to verify legacy page metadata remains absent. */
  const zeroPage = { ...page, header: 0, footer: 0 };
  /** Explicit zero areas must retain the legacy absence convention on import. */
  const zero = readHwp(
    writeHwp({
      doc: documentOf(paragraph("영역 없음")),
      page: zeroPage,
    }),
  );
  assert.equal(zero.page.header, undefined);
  assert.equal(zero.page.footer, undefined);
  /** Six-field geometry carries no implicit additional header or footer margin. */
  const legacyPage = {
    width: 210,
    height: 297,
    marginTop: 20,
    marginBottom: 15,
    marginLeft: 30,
    marginRight: 30,
  };
  /** Legacy input remains compatible even when new-document defaults include header areas. */
  const legacy = readHwp(
    writeHwp({ doc: documentOf(paragraph("이전 쪽 설정")), page: legacyPage }),
  );
  assert.equal(legacy.page.header, undefined);
  assert.equal(legacy.page.footer, undefined);
}
test(
  "native HWP page headers and footers preserve optional millimetre areas",
  verifyHeaderFooterAreas,
);

/**
 * Verify the installed Hancom fixture retains its actual header and footer areas.
 *
 * The authored native fixture uses separate 15mm header and footer dimensions
 * that affect body placement in addition to the top and bottom margins.
 * @returns {void} Completes the native page-geometry assertions.
 * @example
 * verifyNativeHeaderFooterAreas() // Reads approximately 15mm for both areas.
 */
function verifyNativeHeaderFooterAreas(): void {
  /** Native Hancom-authored geometry read without a runtime Hancom dependency. */
  const result = readHwp(
    fs.readFileSync("research/fixtures-private/sample.hwp"),
  );
  assert.ok(Math.abs((result.page.header || 0) - 15) < 0.02);
  assert.ok(Math.abs((result.page.footer || 0) - 15) < 0.02);
}
test(
  "native authored HWP retains real 15mm header and footer areas",
  { skip: !fs.existsSync("research/fixtures-private/sample.hwp") },
  verifyNativeHeaderFooterAreas,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase1(): void {
  /** Validated editor document captured for this export. */
  const doc = documentOf(
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            paragraph("첫 항목"),
            paragraph("이어지는 설명"),
            {
              type: "orderedList",
              attrs: { start: 3 },
              content: [
                { type: "listItem", content: [paragraph("하위 셋째")] },
                { type: "listItem", content: [paragraph("하위 넷째")] },
              ],
            },
          ],
        },
        { type: "listItem", content: [paragraph("둘째 항목")] },
      ],
    },
    paragraph("목록 뒤"),
    {
      type: "orderedList",
      attrs: { start: 8 },
      content: [{ type: "listItem", content: [paragraph("여덟째")] }],
    },
  );
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc }));
  /** Source bullets used by the current native serialization step. */
  const bullets = result.doc.content?.[0];
  assert.equal(bullets?.type, "bulletList");
  assert.equal(bullets?.content?.length, 2);
  assert.equal(bullets?.content?.[0].content?.length, 3);
  assert.equal(bullets?.content?.[0].content?.[2].type, "orderedList");
  assert.equal(bullets?.content?.[0].content?.[2].attrs?.start, 3);
  assert.equal(result.doc.content?.[2].attrs?.start, 8);
  assert.equal(textOf(result.doc), textOf(doc));
}
test(
  "genuine bullet and numbered lists retain nesting, starts and continuation paragraphs",
  verifyHwpWriterCase1,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase2(): void {
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const template of Object.values(templates)) {
    /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
    const result = readHwp(
      writeHwp({ doc: template.doc, title: template.title }),
    );
    assert.equal(
      textOf(result.doc).replace(/\n/g, ""),
      textOf(template.doc).replace(/\n/g, ""),
    );
    assert.deepEqual(result.warnings, []);
  }
}
test(
  "every authored starter template saves as a genuine editable HWP document",
  verifyHwpWriterCase2,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase3(): void {
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(
    fs.readFileSync(
      "research/fixtures-private/forhan-lists-hancom-resaved-hwp-native-lists-native.hwp",
    ),
  );
  assert.equal(result.doc.content?.[0].type, "bulletList");
  assert.equal(result.doc.content?.[0].content?.length, 2);
  assert.equal(result.doc.content?.[1].type, "orderedList");
  assert.equal(result.doc.content?.[1].content?.length, 2);
  assert.equal(result.doc.content?.[1].attrs?.start, 1);
}
test(
  "native authored bullets and numbering become explicit editor list containers",
  {
    skip: !fs.existsSync(
      "research/fixtures-private/forhan-lists-hancom-resaved-hwp-native-lists-native.hwp",
    ),
  },

  verifyHwpWriterCase3,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase4(): void {
  /** Validated editor document captured for this export. */
  const doc = documentOf(
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "문서 제목" }],
    },
    paragraph("본문"),
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "세 번째 수준" }],
    },
  );
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc }));
  assert.equal(result.doc.content?.[0].type, "heading");
  assert.equal(result.doc.content?.[0].attrs?.level, 1);
  assert.equal(result.doc.content?.[2].type, "heading");
  assert.equal(result.doc.content?.[2].attrs?.level, 3);
}
test(
  "genuine named heading styles retain document outline levels",
  verifyHwpWriterCase4,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase5(): void {
  /** Source href used by the current native serialization step. */
  const href = "https://example.com/forhan?x=1&y=2;part=3";
  /** Validated editor document captured for this export. */
  const doc = documentOf({
    type: "paragraph",
    content: [
      { type: "text", text: "앞 " },
      {
        type: "text",
        text: "연결",
        marks: [{ type: "link", attrs: { href } }, { type: "bold" }],
      },
      {
        type: "text",
        text: " 문서",
        marks: [{ type: "link", attrs: { href } }, { type: "italic" }],
      },
      { type: "text", text: " 뒤" },
    ],
  });
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc }));
  /** Source runs used by the current native serialization step. */
  const runs = result.doc.content?.[0].content || [];
  assert.equal(textOf(result.doc), "앞 연결 문서 뒤");
  assert.equal(
    runs[1].marks?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "link",
    )?.attrs?.href,
    href,
  );
  assert.equal(
    runs[2].marks?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "link",
    )?.attrs?.href,
    href,
  );
  assert.ok(
    !runs.at(-1)?.marks?.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "link",
    ),
  );
  assert.ok(
    runs[1].marks?.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "bold",
    ),
  );
  assert.ok(
    runs[2].marks?.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "italic",
    ),
  );
  assert.throws(
    /**
     * Exercise an input that must reject HWP export.
     *
     * The assertion verifies an explicit failure instead of accepting silently incomplete native document data.
     * @returns {Uint8Array<ArrayBufferLike>} Native source records or editor fixture data for the operation described above.
     * @example
     * rejectInvalidExport() // Throws the expected export error.
     */
    () =>
      writeHwp({
        doc: documentOf(
          paragraph("Unsafe", [
            { type: "link", attrs: { href: "javascript:alert(1)" } },
          ]),
        ),
      }),
    /protocol|링크/,
  );
}
test(
  "native hyperlink fields retain targets, text and adjacent formatting",
  verifyHwpWriterCase5,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase6(): void {
  /** Embedded raster data URL or independently imported source fixture. */
  const source = readHwp(
    fs.readFileSync("research/fixtures-private/hyperlink-native.hwp"),
  );
  /** Source linked used by the current native serialization step. */
  const linked = source.doc.content?.[0].content?.find(
    /**
     * Inspect the expected imported node or native stream.
     *
     * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
     * @param {import("../src/formats/hwp.ts").HwpDocumentNode} node Editable block, cell or inline node being serialized.
     * @returns {boolean | undefined} Native source records or editor fixture data for the operation described above.
     * @example
     * fixturePredicate(entry) // Whether the entry is the expected source structure.
     */
    (node) =>
      node.marks?.some(
        /**
         * Inspect the expected imported node or native stream.
         *
         * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
         * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * fixturePredicate(entry) // Whether the entry is the expected source structure.
         */
        (mark) => mark.type === "link",
      ),
  );
  assert.equal(linked?.text, "포한 프로젝트");
  assert.equal(
    linked?.marks?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "link",
    )?.attrs?.href,
    "https://example.com/forhan?x=1&y=2",
  );
  assert.deepEqual(source.warnings, []);
}
test(
  "native hyperlink source imports as an editable link rather than an opaque object",
  { skip: !fs.existsSync("research/fixtures-private/hyperlink-native.hwp") },

  verifyHwpWriterCase6,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase7(): void {
  /** Complete local input, output or independently constructed source bytes. */
  const bytes = writeHwp({
    doc: documentOf(
      paragraph("앞"),
      paragraph(""),
      paragraph("뒤"),
      paragraph(""),
    ),
  });
  /** New OLE compound document receiving the generated HWP streams. */
  const container = CFB.read(bytes, { type: "array" });
  /** Source entry used by the current native serialization step. */
  const entry =
    container.FileIndex[
      container.FullPaths.findIndex(
        /**
         * Inspect the expected imported node or native stream.
         *
         * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
         * @param {string} path Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * fixturePredicate(entry) // Whether the entry is the expected source structure.
         */
        (path) => path.endsWith("/BodyText/Section0"),
      )
    ];
  /** Source records used by the current native serialization step. */
  const records = parseHwpRecords(
    inflateSync(
      entry.content instanceof Uint8Array
        ? entry.content
        : new Uint8Array(entry.content),
    ),
  );
  assert.ok(
    !records.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpRecord} record Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (record) =>
        record.tag === 67 &&
        record.bytes.length === 2 &&
        record.bytes[0] === 13 &&
        record.bytes[1] === 0,
    ),
  );
  assert.equal(readHwp(bytes).doc.content?.length, 4);
}
test("native empty paragraphs omit CR-only text records", verifyHwpWriterCase7);

/**
 * Collect imported text in source order.
 *
 * Recursive concatenation checks text retention independently of the layout.
 * @param {JSONContent} node Editor document or child node.
 * @returns {string} Text contained in the document subtree.
 * @example
 * textOf({ type: "text", text: "A" }) // "A"
 */
function textOf(node: JSONContent): string {
  return (node.text || "") + (node.content || []).map(textOf).join("");
}

/**
 * Create an authored paragraph fixture.
 *
 * Empty input leaves a valid empty editable block for writer edge cases.
 * @param {string} text Authored paragraph text.
 * @param {JSONContent['marks']} marks Optional character formatting.
 * @returns {JSONContent} Paragraph containing the requested text and marks.
 * @example
 * paragraph("A").content?.[0].text // "A"
 */
function paragraph(text: string, marks?: JSONContent["marks"]): JSONContent {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text, ...(marks ? { marks } : {}) }] : [],
  };
}

/**
 * Create a document containing supplied blocks.
 *
 * The fixture keeps writer assertions independent of the built-in templates.
 * @param {JSONContent[]} blocks Authored top-level document blocks.
 * @returns {JSONContent} Editor document fixture.
 * @example
 * documentOf(paragraph("A")).type // "doc"
 */
function documentOf(...blocks: JSONContent[]): JSONContent {
  return { type: "doc", content: blocks };
}

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase8(): void {
  /** Complete local input, output or independently constructed source bytes. */
  const bytes = writeHwp({ doc: documentOf(paragraph("포한 HWP 저장 😀")) });
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [208, 207, 17, 224, 161, 177, 26, 225],
  );
  /** New OLE compound document receiving the generated HWP streams. */
  const container = CFB.read(bytes, { type: "array" });
  assert.ok(
    container.FullPaths.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {string} path Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (path) => path.endsWith("/FileHeader"),
    ),
  );
  assert.ok(
    container.FullPaths.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {string} path Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (path) => path.endsWith("/DocInfo"),
    ),
  );
  assert.ok(
    container.FullPaths.some(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {string} path Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (path) => path.endsWith("/BodyText/Section0"),
    ),
  );
  assert.equal(textOf(readHwp(bytes).doc), "포한 HWP 저장 😀");
}
test(
  "independent HWP output is a genuine OLE container with HWP streams",
  verifyHwpWriterCase8,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase9(): void {
  /** Validated editor document captured for this export. */
  const doc = documentOf(
    paragraph("첫 문단"),
    paragraph(""),
    paragraph("A\tB"),
    {
      type: "heading",
      attrs: {
        level: 2,
        textAlign: "center",
        pageBreakBefore: true,
        marginLeft: "5mm",
        textIndent: "-2mm",
        lineHeight: "180%",
      },
      content: [
        {
          type: "text",
          text: "서식",
          marks: [
            { type: "bold" },
            { type: "italic" },
            { type: "underline" },
            { type: "strike" },
            {
              type: "textStyle",
              attrs: {
                fontFamily: "Example Font",
                fontSize: "18pt",
                color: "#123456",
              },
            },
          ],
        },
        { type: "hardBreak" },
        { type: "text", text: "다음 줄" },
      ],
    },
  );
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc }));
  assert.equal(result.doc.content?.length, 4);
  assert.match(textOf(result.doc), /첫 문단A\tB서식다음 줄/);
  /** Editor heading level used to select authored visual defaults. */
  const heading = result.doc.content?.[3];
  assert.equal(heading?.attrs?.textAlign, "center");
  assert.equal(heading?.attrs?.pageBreak, true);
  assert.equal(heading?.attrs?.lineHeight, "180%");
  assert.ok(Math.abs(parseFloat(heading?.attrs?.marginLeft || "") - 5) < 0.01);
  assert.equal(
    heading?.content?.[0].marks?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "textStyle",
    )?.attrs?.fontFamily,
    "Example Font",
  );
  assert.equal(
    heading?.content?.[0].marks?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpMark} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (mark) => mark.type === "textStyle",
    )?.attrs?.color,
    "#123456",
  );
  assert.deepEqual(result.warnings, []);
}
test(
  "paragraphs, empty blocks, tabs, hard breaks and styles round trip",
  verifyHwpWriterCase9,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase10(): void {
  /**
   * Construct an authored table-cell fixture.
   *
   * The fixture supplies explicit merge spans, a solid background and two independent editable paragraphs.
   * @param {string} text Authored cell text for the round-trip fixture.
   * @param {number} colspan Logical column span of the authored cell.
   * @param {number} rowspan Logical row span of the authored cell.
   * @returns {JSONContent} Native source records or editor fixture data for the operation described above.
   * @example
   * cell("Example", 2).attrs?.colspan // 2
   */
  const cell = (text: string, colspan = 1, rowspan = 1): JSONContent => ({
    type: "tableCell",
    attrs: { colspan, rowspan, backgroundColor: "#ffeecc" },
    content: [paragraph(text), paragraph("둘째 문단")],
  });
  /** Validated editor document captured for this export. */
  const doc = documentOf(
    {
      type: "table",
      content: [
        { type: "tableRow", content: [cell("병합", 2), cell("오른쪽")] },
        {
          type: "tableRow",
          content: [cell("세로", 1, 2), cell("가운데"), cell("끝")],
        },
        { type: "tableRow", content: [cell("아래"), cell("마지막")] },
      ],
    },
    paragraph("표 다음"),
  );
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc }));
  /** Imported table used to assert merge and cell-content retention. */
  const table = result.doc.content?.[0];
  assert.equal(table?.type, "table");
  assert.equal(table?.content?.[0].content?.[0].attrs?.colspan, 2);
  assert.equal(table?.content?.[1].content?.[0].attrs?.rowspan, 2);
  assert.equal(table?.content?.[2].content?.length, 2);
  assert.equal(table?.content?.[0].content?.[0].content?.length, 2);
  assert.equal(
    table?.content?.[0].content?.[0].attrs?.backgroundColor,
    "#ffeecc",
  );
  assert.match(textOf(result.doc), /표 다음$/);
}
test(
  "merged table geometry and multi-paragraph cells round trip",
  verifyHwpWriterCase10,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase11(): void {
  /** Authored one-pixel PNG payload retained for exact embedded-image assertions. */
  const encoded =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  /** Embedded raster data URL used by the image round-trip fixture. */
  const src = `data:image/png;base64,${encoded}`;
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(
    writeHwp({
      doc: documentOf(
        paragraph("그림 앞"),
        { type: "image", attrs: { src, width: 120, height: 60 } },
        paragraph("그림 뒤"),
      ),
    }),
  );
  /** Imported image node used to verify payload and geometry retention. */
  const image = result.doc.content?.find(
    /**
     * Inspect the expected imported node or native stream.
     *
     * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
     * @param {import("../src/formats/hwp.ts").HwpDocumentNode} node Editable block, cell or inline node being serialized.
     * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
     * @example
     * fixturePredicate(entry) // Whether the entry is the expected source structure.
     */
    (node) => node.type === "image",
  );
  assert.equal(image?.attrs?.src, src);
  assert.equal(image?.attrs?.width, 120);
  assert.equal(image?.attrs?.height, 60);
  assert.equal(textOf(result.doc), "그림 앞그림 뒤");
}
test(
  "embedded image payload and dimensions round trip exactly",
  verifyHwpWriterCase11,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase12(): void {
  assert.throws(
    /**
     * Exercise an input that must reject HWP export.
     *
     * The assertion verifies an explicit failure instead of accepting silently incomplete native document data.
     * @returns {Uint8Array<ArrayBufferLike>} Native source records or editor fixture data for the operation described above.
     * @example
     * rejectInvalidExport() // Throws the expected export error.
     */
    () =>
      writeHwp({
        doc: documentOf({
          type: "preservedBlock",
          attrs: { label: "Unknown" },
        }),
      }),
    /cannot safely convert/,
  );
  assert.throws(
    /**
     * Exercise an input that must reject HWP export.
     *
     * The assertion verifies an explicit failure instead of accepting silently incomplete native document data.
     * @returns {Uint8Array<ArrayBufferLike>} Native source records or editor fixture data for the operation described above.
     * @example
     * rejectInvalidExport() // Throws the expected export error.
     */
    () =>
      writeHwp({
        doc: documentOf(
          paragraph("Link", [
            { type: "highlight", attrs: { color: "yellow" } },
          ]),
        ),
      }),
    /character mark highlight/,
  );
  assert.throws(
    /**
     * Exercise an input that must reject HWP export.
     *
     * The assertion verifies an explicit failure instead of accepting silently incomplete native document data.
     * @returns {Uint8Array<ArrayBufferLike>} Native source records or editor fixture data for the operation described above.
     * @example
     * rejectInvalidExport() // Throws the expected export error.
     */
    () =>
      writeHwp({
        doc: documentOf({
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { rowspan: 3 },
                  content: [paragraph("Bad")],
                },
              ],
            },
          ],
        }),
      }),
    /merge geometry/,
  );
}
test(
  "unsupported changed controls and malformed tables reject instead of dropping data",
  verifyHwpWriterCase12,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase13(): void {
  /** Complete local input, output or independently constructed source bytes. */
  const bytes = writeHwp({ doc: documentOf(paragraph("원본 유지")) });
  /** Imported document containing the exact retained source bytes. */
  const original = readHwp(bytes);
  /** Completed genuine HWP compound-document bytes. */
  const output = writeHwp({
    doc: structuredClone(original.doc),
    page: original.page,
    original: original.original,
  });
  assert.equal(Buffer.compare(Buffer.from(bytes), Buffer.from(output)), 0);
  /** Cloned imported document edited before independent HWP serialization. */
  const changed = structuredClone(original.doc);
  if (changed.content?.[0].content?.[0])
    changed.content[0].content[0].text = "수정 저장";
  /** Generated HWP bytes containing the changed document content. */
  const edited = writeHwp({
    doc: changed,
    page: original.page,
    original: original.original,
  });
  assert.equal(textOf(readHwp(edited).doc), "수정 저장");
}
test(
  "unchanged retained HWP source is returned byte-for-byte",
  verifyHwpWriterCase13,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase14(): void {
  /** Embedded raster data URL or independently imported source fixture. */
  const source = readHwp(writeHwp({ doc: documentOf(paragraph("쪽 설정")) }));
  /** Completed genuine HWP compound-document bytes. */
  const output = writeHwp({
    doc: source.doc,
    page: { ...source.page, width: 297, height: 210 },
    original: source.original,
  });
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(output);
  assert.ok(Math.abs(result.page.width - 297) < 0.02);
  assert.ok(Math.abs(result.page.height - 210) < 0.02);
}
test(
  "retained source cannot mask changed physical page settings",
  verifyHwpWriterCase14,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase15(): void {
  /** Embedded raster data URL or independently imported source fixture. */
  const source = readHwp(
    fs.readFileSync("research/fixtures-private/table.hwp"),
  );
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc: source.doc, page: source.page }));
  assert.equal(textOf(result.doc), textOf(source.doc));
  assert.equal(
    result.doc.content?.[0].content?.[0].content?.[0].attrs?.colspan,
    2,
  );
  assert.deepEqual(result.warnings, []);
}
test(
  "native authored merged table survives independent HWP rewriting",
  { skip: !fs.existsSync("research/fixtures-private/table.hwp") },

  verifyHwpWriterCase15,
);

/**
 * Verify the independent HWP compatibility case.
 *
 * Known authored inputs must retain their expected text, structure, source bytes or explicit rejection behaviour.
 * @returns {void} Completes the serialization or compatibility assertion without returning a value.
 * @example
 * node --test tests/hwp-writer.test.ts // This compatibility assertion passes.
 */
function verifyHwpWriterCase16(): void {
  /** Embedded raster data URL or independently imported source fixture. */
  const source = readHwp(
    fs.readFileSync("research/fixtures-private/image.hwp"),
  );
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = readHwp(writeHwp({ doc: source.doc, page: source.page }));
  assert.equal(
    result.doc.content?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpDocumentNode} node Editable block, cell or inline node being serialized.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (node) => node.type === "image",
    )?.attrs?.src,
    source.doc.content?.find(
      /**
       * Inspect the expected imported node or native stream.
       *
       * The predicate locates the structure whose content, formatting or embedded bytes the compatibility assertion verifies.
       * @param {import("../src/formats/hwp.ts").HwpDocumentNode} node Editable block, cell or inline node being serialized.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * fixturePredicate(entry) // Whether the entry is the expected source structure.
       */
      (node) => node.type === "image",
    )?.attrs?.src,
  );
  assert.equal(textOf(result.doc), textOf(source.doc));
}
test(
  "native authored embedded PNG survives independent HWP rewriting",
  { skip: !fs.existsSync("research/fixtures-private/image.hwp") },

  verifyHwpWriterCase16,
);
