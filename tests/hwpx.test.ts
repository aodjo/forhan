import { nativeCorpusFixture } from "./helpers/native-corpus.ts";
import type { EditorNode, HwpxPage } from "../src/formats/hwpx.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
/**
 * Physical page dimensions and margins used by the current document fixture.
 */
const page: HwpxPage = {
  width: 210,
  height: 297,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
};
/**
 * Create a typed paragraph fixture.
 *
 * Builds a small paragraph with optional formatting for document interoperability assertions.
 *
 * @param {string} s - The s input.
 * @param {NonNullable<EditorNode['attrs']>} attrs - The attrs input.
 * @param {NonNullable<EditorNode['marks']>} marks - The marks input.
 * @returns {EditorNode} The computed result of this operation.
 * @example
 * para(s, attrs, marks);
 */
const para = (
  s: string,
  attrs: NonNullable<EditorNode["attrs"]> = {},
  marks?: NonNullable<EditorNode["marks"]>,
): EditorNode => ({
  type: "paragraph",
  attrs,
  content: [{ type: "text", text: s, ...(marks ? { marks } : {}) }],
});
/**
 * Create a typed document fixture.
 *
 * Wraps the supplied block nodes in the editor document schema.
 *
 * @param {EditorNode[]} content - The content input.
 * @returns {EditorNode} The computed result of this operation.
 * @example
 * doc(content);
 */
const doc = (...content: EditorNode[]): EditorNode => ({
  type: "doc",
  content,
});
/**
 * Collect fixture nodes of a selected type.
 *
 * Traverses the editor fixture hierarchy to locate content used by round-trip assertions.
 *
 * @param {EditorNode} n - The n input.
 * @param {string} type - The type input.
 * @returns {EditorNode[]} The computed result of this operation.
 * @example
 * all(n, type);
 */
const all = (n: EditorNode, type: string): EditorNode[] => [
  ...(n.type === type ? [n] : []),
  ...(n.content || []).flatMap(
    /**
     * Evaluate the flatMap callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {EditorNode} c - The c input.
     * @returns {EditorNode[]} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (c) => all(c, type),
  ),
];
/**
 * Collect fixture text for comparison.
 *
 * Joins text nodes so tests can compare document content independently of formatting.
 *
 * @param {EditorNode} n - The n input.
 * @returns {string} The computed result of this operation.
 * @example
 * string(n);
 */
const string = (n: EditorNode): string =>
  all(n, "text")
    .map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {EditorNode} n - The n input.
       * @returns {any} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => n.text,
    )
    .join("");
/**
 * Verify hWPX Korean, XML escapes, mixed formatting and paragraph geometry round trip.
 *
 * Verifies Korean text, XML escaping, character marks, line breaks and physical page dimensions after an independent native-format round trip.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyHWPXKoreanXMLEscapesMixedFormattingAndParagraphGeometryRoundTrip();
 */
async function verifyHWPXKoreanXMLEscapesMixedFormattingAndParagraphGeometryRoundTrip(): Promise<void> {
  /**
   * The independently constructed document fixture supplied to the serializer.
   */
  const input = doc(
    para('가나다 & <포한> "문서"', { textAlign: "center", lineHeight: "1.8" }, [
      { type: "bold" },
      { type: "italic" },
      { type: "underline" },
      { type: "strike" },
      {
        type: "textStyle",
        attrs: { fontSize: "16pt", fontFamily: "맑은 고딕", color: "#123456" },
      },
    ]),
    para("두 번째\t문단\n다음 줄"),
  );
  /**
   * Serialized HWPX package bytes used by the interoperability assertion.
   */
  const bytes = await writeHwpx({ doc: input, page, title: "테스트" });
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(bytes);
  assert.equal(
    string(parsed.doc),
    '가나다 & <포한> "문서"두 번째\t문단다음 줄',
  );
  assert.equal(parsed.doc.content![0].attrs!.textAlign, "center");
  assert.equal(parsed.doc.content![0].attrs!.lineHeight, "1.8");
  assert.ok(
    parsed.doc.content![0].content![0].marks!.some(
      /**
       * Evaluate the some callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {{         type: string;         attrs?: Record<string, unknown>;     }} m - The m input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (m: { type: string; attrs?: Record<string, unknown> }) =>
        m.type === "bold",
    ),
  );
  assert.ok(
    parsed.doc.content![0].content![0].marks!.some(
      /**
       * Evaluate the some callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {{         type: string;         attrs?: Record<string, unknown>;     }} m - The m input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (m: { type: string; attrs?: Record<string, unknown> }) =>
        m.attrs?.fontSize === "16pt",
    ),
  );
  assert.ok(Math.abs(parsed.page.width - 210) < 0.01);
  assert.ok(all(parsed.doc, "hardBreak").length);
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(bytes);
  assert.equal(strFromU8(files.mimetype), "application/hwp+zip");
  assert.equal(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
      8,
      true,
    ),
    0,
    "mimetype must be stored",
  );
}

test(
  "HWPX Korean, XML escapes, mixed formatting and paragraph geometry round trip",
  verifyHWPXKoreanXMLEscapesMixedFormattingAndParagraphGeometryRoundTrip,
);
/**
 * Verify merged and nested table cells survive export/import.
 *
 * Checks nested table hierarchy, merged-cell spans and solid cell fills after serialization and import.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyMergedAndNestedTableCellsSurviveExportImport();
 */
async function verifyMergedAndNestedTableCellsSurviveExportImport(): Promise<void> {
  /**
   * Create a typed table-cell fixture.
   *
   * Wraps fixture text in a table cell with optional merge and fill attributes.
   *
   * @param {string} s - The s input.
   * @param {NonNullable<EditorNode['attrs']>} attrs - The attrs input.
   * @returns {EditorNode} The computed result of this operation.
   * @example
   * cell(s, attrs);
   */
  const cell = (
    s: string,
    attrs: NonNullable<EditorNode["attrs"]> = {},
  ): EditorNode => ({
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, ...attrs },
    content: [para(s)],
  });
  /**
   * A nested table fixture used to verify table hierarchy preservation.
   */
  const inner = {
    type: "table",
    content: [{ type: "tableRow", content: [cell("안쪽")] }],
  };
  /**
   * The table fixture containing merged cells, fills and nested content.
   */
  const table = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          cell("병합", { colspan: 2, backgroundColor: "#ffeeaa" }),
          cell("오른쪽", { rowspan: 2 }),
        ],
      },
      {
        type: "tableRow",
        content: [
          cell("아래"),
          { ...cell(""), content: [para("겹표"), inner] },
        ],
      },
    ],
  };
  /**
   * Serialized HWPX package bytes used by the interoperability assertion.
   */
  const bytes = await writeHwpx({ doc: doc(table), page });
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(bytes);
  assert.equal(all(parsed.doc, "table").length, 2);
  assert.ok(
    all(parsed.doc, "tableCell").some(
      /**
       * Evaluate the some callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {EditorNode} c - The c input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (c) => c.attrs!.colspan === 2,
    ),
  );
  assert.ok(
    all(parsed.doc, "tableCell").some(
      /**
       * Evaluate the some callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {EditorNode} c - The c input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (c) => c.attrs!.rowspan === 2,
    ),
  );
  assert.ok(
    all(parsed.doc, "tableCell").some(
      /**
       * Evaluate the some callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {EditorNode} c - The c input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (c) => c.attrs!.backgroundColor === "#ffeeaa",
    ),
  );
  assert.ok(string(parsed.doc).includes("안쪽"));
}

test(
  "merged and nested table cells survive export/import",
  verifyMergedAndNestedTableCellsSurviveExportImport,
);
/**
 * Verify image bytes and display dimensions round trip.
 *
 * Checks that embedded image bytes and CSS-pixel display dimensions survive an independent native-format round trip.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyImageBytesAndDisplayDimensionsRoundTrip();
 */
async function verifyImageBytesAndDisplayDimensionsRoundTrip(): Promise<void> {
  /**
   * A self-contained PNG fixture encoded as base64.
   */
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  /**
   * Serialized HWPX package bytes used by the interoperability assertion.
   */
  const bytes = await writeHwpx({
    doc: doc({
      type: "image",
      attrs: {
        src: `data:image/png;base64,${png}`,
        width: 120,
        height: 60,
        alt: "그림",
      },
    }),
    page,
  });
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(bytes);
  /**
   * The embedded image node selected for geometry and byte-content assertions.
   */
  const image = all(parsed.doc, "image")[0];
  assert.equal(image.attrs!.src, `data:image/png;base64,${png}`);
  assert.equal(image.attrs!.width, 120);
  assert.equal(image.attrs!.height, 60);
}

test(
  "image bytes and display dimensions round trip",
  verifyImageBytesAndDisplayDimensionsRoundTrip,
);
/**
 * Verify new bullet and numbered lists export native list definitions.
 *
 * Checks native bullet and numbering reference definitions and their decoded editor list items.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyNewBulletAndNumberedListsExportNativeListDefinitions();
 */
async function verifyNewBulletAndNumberedListsExportNativeListDefinitions(): Promise<void> {
  /**
   * Bullet and numbered list fixtures used to check native list definitions.
   */
  const lists = ["bulletList", "orderedList"].map(
    /**
     * Evaluate the map callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {string} type - The type input.
     * @returns {{ type: string; attrs: { start: number; }; content: { type: string; content: EditorNode[]; }[]; }} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (type) => ({
      type,
      attrs: { start: 1 },
      content: [
        { type: "listItem", content: [para("목록 첫 항목")] },
        { type: "listItem", content: [para("목록 둘째 항목")] },
      ],
    }),
  );
  /**
   * Serialized HWPX package bytes used by the interoperability assertion.
   */
  const bytes = await writeHwpx({ doc: doc(...lists), page });
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(bytes);
  assert.equal(all(parsed.doc, "bulletList").length, 1);
  assert.equal(all(parsed.doc, "orderedList").length, 1);
  assert.equal(all(parsed.doc, "listItem").length, 4);
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(bytes);
  assert.match(strFromU8(files["Contents/header.xml"]), /<hh:numbering /);
  assert.match(strFromU8(files["Contents/header.xml"]), /<hh:bullet /);
}

test(
  "new bullet and numbered lists export native list definitions",
  verifyNewBulletAndNumberedListsExportNativeListDefinitions,
);
/**
 * Verify hWP-style percentage line spacing, paragraph margins and page breaks convert accurately.
 *
 * Checks conversion of HWP-style percentage spacing, CSS physical margins, text indentation and page-break flags.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyHWPStylePercentageLineSpacingParagraphMarginsAndPageBreaksConvertAccurately();
 */
async function verifyHWPStylePercentageLineSpacingParagraphMarginsAndPageBreaksConvertAccurately(): Promise<void> {
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(
    await writeHwpx({
      doc: doc(
        para("들여쓰기 문단", {
          lineHeight: "160%",
          marginLeft: "10mm",
          marginRight: "5mm",
          textIndent: "-2mm",
          marginTop: "3mm",
          marginBottom: "4mm",
          pageBreak: true,
        }),
      ),
      page,
    }),
  );
  /**
   * The editable attributes resolved from the current native document properties.
   */
  const attrs = parsed.doc.content![0].attrs;
  assert.equal(attrs.lineHeight, "1.6");
  assert.equal(attrs.pageBreakBefore, true);
  assert.ok(Math.abs(parseFloat(attrs.marginLeft) - 10) < 0.01);
  assert.ok(Math.abs(parseFloat(attrs.textIndent) + 2) < 0.01);
}

test(
  "HWP-style percentage line spacing, paragraph margins and page breaks convert accurately",
  verifyHWPStylePercentageLineSpacingParagraphMarginsAndPageBreaksConvertAccurately,
);
/**
 * Verify heading level and native paragraph styles survive HWPX round trip.
 *
 * Checks semantic heading levels and named native paragraph styles after serialization and import.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyHeadingLevelAndNativeParagraphStylesSurviveHWPXRoundTrip();
 */
async function verifyHeadingLevelAndNativeParagraphStylesSurviveHWPXRoundTrip(): Promise<void> {
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(
    await writeHwpx({
      doc: doc(
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "두 번째 수준 제목" }],
        },
        para("본문"),
      ),
      page,
    }),
  );
  assert.equal(parsed.doc.content![0].type, "heading");
  assert.equal(parsed.doc.content![0].attrs!.level, 2);
  assert.equal(string(parsed.doc), "두 번째 수준 제목본문");
  /** Native style metadata using the independent HWP writer's semantic heading prefix. */
  const prefixed = unzipSync(await writeHwpx(parsed));
  prefixed["Contents/header.xml"] = strToU8(
    strFromU8(prefixed["Contents/header.xml"]).replace(
      'engName="Heading 2"',
      'engName="Forhan Heading 2"',
    ),
  );
  assert.equal(
    (await readHwpx(zipSync(prefixed))).doc.content![0].attrs!.level,
    2,
  );
}

test(
  "heading level and native paragraph styles survive HWPX round trip",
  verifyHeadingLevelAndNativeParagraphStylesSurviveHWPXRoundTrip,
);
/**
 * Verify unknown controls remain available after neighboring paragraph edits.
 *
 * Checks that changing nearby editable text retains one copy of the original opaque equation XML.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyUnknownControlsRemainAvailableAfterNeighboringParagraphEdits();
 */
async function verifyUnknownControlsRemainAvailableAfterNeighboringParagraphEdits(): Promise<void> {
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(
    await writeHwpx({ doc: doc(para("수식 앞"), para("원본")), page }),
  );
  let xml = strFromU8(files["Contents/section0.xml"]);
  xml = xml.replace(
    "원본</hp:t>",
    '원본</hp:t><hp:equation id="42"><hp:script>a over b</hp:script></hp:equation>',
  );
  files["Contents/section0.xml"] = strToU8(xml);
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(zipSync(files));
  assert.equal(all(parsed.doc, "preservedBlock").length, 1);
  parsed.doc.content![0].content![0].text = "수정한 문단";
  /**
   * The re-exported package or document used to verify round-trip preservation.
   */
  const output = unzipSync(await writeHwpx(parsed));
  assert.match(strFromU8(output["Contents/section0.xml"]), /a over b/);
  assert.equal(
    (strFromU8(output["Contents/section0.xml"]).match(/<hp:equation /g) || [])
      .length,
    1,
    "preserved equation must not be duplicated",
  );
  assert.match(strFromU8(output["Contents/section0.xml"]), /수정한 문단/);
}

test(
  "unknown controls remain available after neighboring paragraph edits",
  verifyUnknownControlsRemainAvailableAfterNeighboringParagraphEdits,
);
/**
 * Verify unmodified HWPX retains every original uncompressed package entry.
 *
 * Compares every original package entry with its re-exported bytes, including opaque non-document payloads.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyUnmodifiedHWPXRetainsEveryOriginalUncompressedPackageEntry();
 */
async function verifyUnmodifiedHWPXRetainsEveryOriginalUncompressedPackageEntry(): Promise<void> {
  /**
   * The initial independently generated package before round-trip modifications.
   */
  const initial = await writeHwpx({ doc: doc(para("손실 없는 저장")), page });
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(initial);
  files["custom-opaque.bin"] = Uint8Array.of(0, 1, 2, 255);
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(zipSync(files));
  /**
   * The re-exported package or document used to verify round-trip preservation.
   */
  const output = unzipSync(await writeHwpx(parsed));
  assert.deepEqual(Object.keys(output).sort(), Object.keys(files).sort());
  for (/**
   * The current native XML, property or content binding selected by this iteration.
   */
  const path of Object.keys(files))
    assert.deepEqual(output[path], files[path], path);
}

test(
  "unmodified HWPX retains every original uncompressed package entry",
  verifyUnmodifiedHWPXRetainsEveryOriginalUncompressedPackageEntry,
);
/**
 * Verify tiptap default attrs and property order do not break unchanged source preservation.
 *
 * Checks that schema-default attributes and reordered properties do not trigger unnecessary package reconstruction.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyTiptapDefaultAttrsAndPropertyOrderDoNotBreakUnchangedSourcePreservation();
 */
async function verifyTiptapDefaultAttrsAndPropertyOrderDoNotBreakUnchangedSourcePreservation(): Promise<void> {
  /**
   * The initial independently generated package before round-trip modifications.
   */
  const initial = await writeHwpx({ doc: doc(para("편집기 왕복")), page });
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(initial);
  files["Preview/PrvImage.png"] = Uint8Array.of(1, 2, 3);
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(zipSync(files));
  parsed.doc.content![0].attrs = {
    pageBreak: false,
    lineHeight: null,
    ...parsed.doc.content![0].attrs,
  };
  parsed.doc.content![0].content![0].marks[0].attrs = {
    fontFamily: null,
    ...parsed.doc.content![0].content![0].marks[0].attrs,
  };
  /**
   * The re-exported package or document used to verify round-trip preservation.
   */
  const output = unzipSync(await writeHwpx(parsed));
  for (/**
   * The current native XML, property or content binding selected by this iteration.
   */
  const path of Object.keys(files))
    assert.deepEqual(output[path], files[path], path);
}

test(
  "Tiptap default attrs and property order do not break unchanged source preservation",
  verifyTiptapDefaultAttrsAndPropertyOrderDoNotBreakUnchangedSourcePreservation,
);
/**
 * Verify spine determines multiple section order and imported section edit keeps sections.
 *
 * Checks content-spine ordering and preserves distinct native section files after an imported paragraph is edited.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifySpineDeterminesMultipleSectionOrderAndImportedSectionEditKeepsSections();
 */
async function verifySpineDeterminesMultipleSectionOrderAndImportedSectionEditKeepsSections(): Promise<void> {
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(await writeHwpx({ doc: doc(para("첫째")), page }));
  files["Contents/section1.xml"] = strToU8(
    strFromU8(files["Contents/section0.xml"]).replace("첫째", "둘째"),
  );
  files["Contents/content.hpf"] = strToU8(
    strFromU8(files["Contents/content.hpf"])
      .replace(
        "</opf:manifest>",
        '<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/></opf:manifest>',
      )
      .replace(
        '<opf:itemref idref="section0" linear="yes"/>',
        '<opf:itemref idref="section1" linear="yes"/><opf:itemref idref="section0" linear="yes"/>',
      ),
  );
  /**
   * The imported document and retained source returned by the HWPX reader.
   */
  const parsed = await readHwpx(zipSync(files));
  assert.equal(string(parsed.doc), "둘째첫째");
  parsed.doc.content![0].content![0].text = "수정 둘째";
  /**
   * The re-exported package or document used to verify round-trip preservation.
   */
  const output = await readHwpx(await writeHwpx(parsed));
  assert.equal(string(output.doc), "수정 둘째첫째");
  assert.equal(output.source.sections.length, 2);
}

test(
  "spine determines multiple section order and imported section edit keeps sections",
  verifySpineDeterminesMultipleSectionOrderAndImportedSectionEditKeepsSections,
);
/**
 * Verify invalid ZIP, XML entity declarations, external images and raw foreign controls fail closed.
 *
 * Checks explicit rejection of malformed archives, entity declarations, external image URLs and foreign opaque controls without retained XML.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyInvalidZIPXMLEntityDeclarationsExternalImagesAndRawForeignControlsFailClosed();
 */
async function verifyInvalidZIPXMLEntityDeclarationsExternalImagesAndRawForeignControlsFailClosed(): Promise<void> {
  await assert.rejects(
    /**
     * Evaluate the rejects callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @returns {Promise<HwpxDocument>} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    () => readHwpx(Uint8Array.of(1, 2, 3)),
  );
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(await writeHwpx({ doc: doc(para("본문")), page }));
  files["Contents/header.xml"] = strToU8('<!DOCTYPE a [<!ENTITY x "x">]><a/>');
  await assert.rejects(
    /**
     * Evaluate the rejects callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @returns {Promise<HwpxDocument>} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    () => readHwpx(zipSync(files)),
    /엔티티/,
  );
  await assert.rejects(
    /**
     * Evaluate the rejects callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @returns {Promise<Uint8Array<ArrayBufferLike>>} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    () =>
      writeHwpx({
        doc: doc({
          type: "image",
          attrs: { src: "https://example.com/a.png" },
        }),
        page,
      }),
    /이미지/,
  );
  await assert.rejects(
    /**
     * Evaluate the rejects callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @returns {Promise<Uint8Array<ArrayBufferLike>>} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    () =>
      writeHwpx({
        doc: doc({
          type: "preservedBlock",
          attrs: { label: "HWP 개체", raw: "abc" },
        }),
        page,
      }),
    /원본/,
  );
}

test(
  "invalid ZIP, XML entity declarations, external images and raw foreign controls fail closed",
  verifyInvalidZIPXMLEntityDeclarationsExternalImagesAndRawForeignControlsFailClosed,
);
/**
 * Preserve edits and tables while exporting an independently authored native source.
 *
 * The checked-in reference was reserialized and reopened by original Hancom.
 * Exported bytes are read directly in memory, leaving completed research
 * evidence and the caller's working directory untouched.
 * @async
 * @returns {Promise<void>} Resolves after the original table and explicit source edit survive export.
 * @throws {AssertionError} If native content, editing or table preservation differs.
 * @example
 * await verifySelfCreatedNativeHancomFixturesImportAndCanBeExportedForOracleVerification();
 */
async function verifySelfCreatedNativeHancomFixturesImportAndCanBeExportedForOracleVerification(): Promise<void> {
  /** Required native source remains independent from the installed application and ignored files. */
  const parsed = await readHwpx(
    await readFile(nativeCorpusFixture("rich.hwpx")),
  );
  assert.ok(string(parsed.doc).includes("포한"));
  assert.equal(all(parsed.doc, "table").length, 1);
  let target: EditorNode | undefined;
  for (/** Each original native paragraph keeps its own editable source ownership. */
  const candidate of all(parsed.doc, "paragraph")) {
    for (/** Actual native leaves, rather than generated preview text, receive the source edit. */
    const leaf of candidate.content ?? [])
      if (leaf.type === "text" && leaf.text?.includes("포한")) {
        target = leaf;
        break;
      }
    if (target) break;
  }
  assert.ok(target);
  target.text += " · 포한 수정";
  /** The independent export is verified without a persistent output-file side effect. */
  const edited = await readHwpx(await writeHwpx(parsed));
  assert.ok(string(edited.doc).includes(" · 포한 수정"));
  assert.equal(all(edited.doc, "table").length, 1);
}

test(
  "native authored corpus remains editable through independent HWPX export",

  verifySelfCreatedNativeHancomFixturesImportAndCanBeExportedForOracleVerification,
);

/**
 * Preserve supplied per-column measurements during native table export.
 *
 * Uses unequal widths and a merged cell to distinguish a real logical
 * column grid from a table stretched across the available page body.
 *
 * @returns {Promise<void>} Completion of the native table-width assertions.
 * @throws {Error} If explicit widths or merged-cell geometry are not preserved.
 * @example
 * await writeHwpx({ doc: documentWithExplicitWidths, page });
 */
async function verifyExplicitColumnWidths(): Promise<void> {
  /** A narrow table whose merged cell spans unequal 82px and 60px columns. */
  const table: EditorNode = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 2, rowspan: 1, colwidth: [82, 60] },
            content: [para("병합된 칸")],
          },
          {
            type: "tableCell",
            attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
            content: [para("오른쪽 칸")],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colwidth: [82] },
            content: [para("첫째")],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [60] },
            content: [para("둘째")],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [100] },
            content: [para("셋째")],
          },
        ],
      },
    ],
  };
  /** Serialized native bytes containing the explicitly measured table. */
  const bytes = await writeHwpx({ doc: doc(table), page });
  /** Uncompressed section XML used to assert actual native table dimensions. */
  const xml = strFromU8(unzipSync(bytes)["Contents/section0.xml"]);
  assert.match(xml, /<hp:sz width="18150"/);
  assert.match(xml, /<hp:cellSz width="10650"/);
  /** The decoded editor table whose merged cell must expose two width slots. */
  const parsed = await readHwpx(bytes);
  assert.deepEqual(all(parsed.doc, "tableCell")[0].attrs!.colwidth, [82, 60]);
  assert.deepEqual(all(parsed.doc, "tableCell")[1].attrs!.colwidth, [100]);
}

test(
  "explicit unequal column widths determine table and merged-cell sizes",
  verifyExplicitColumnWidths,
);

/**
 * Preserve native geometry while still applying an explicit resize edit.
 *
 * Verifies both source-preserving text changes and regenerated width records
 * after the standard editor colwidth array changes.
 *
 * @returns {Promise<void>} Completion of the text-edit and resize assertions.
 * @throws {Error} If text editing stretches a table or resizing leaves stale widths.
 * @example
 * imported.doc.content[0].content[0].content[0].attrs.colwidth = [120, 60];
 */
async function verifyRetainedAndResizedColumnWidths(): Promise<void> {
  /** A single-row narrow table with explicit merged-column measurements. */
  const table: EditorNode = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 2, colwidth: [82, 60] },
            content: [para("원래 문단")],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [100] },
            content: [para("오른쪽")],
          },
        ],
      },
    ],
  };
  /** Imported native table and source XML before its text-only change. */
  const parsed = await readHwpx(await writeHwpx({ doc: doc(table), page }));
  all(parsed.doc, "text")[0].text = "문단만 수정";
  /** Native section XML after the text-only change. */
  const edited = strFromU8(
    unzipSync(await writeHwpx(parsed))["Contents/section0.xml"],
  );
  assert.match(edited, /<hp:sz width="18150"/);
  assert.match(edited, /<hp:cellSz width="10650"/);
  all(parsed.doc, "tableCell")[0].attrs!.colwidth = [120, 60];
  /** Native section XML after the first logical column is explicitly resized. */
  const resized = strFromU8(
    unzipSync(await writeHwpx(parsed))["Contents/section0.xml"],
  );
  assert.match(resized, /<hp:sz width="21000"/);
  assert.match(resized, /<hp:cellSz width="13500"/);
}

test(
  "retained table widths survive text edits and change when a column is resized",
  verifyRetainedAndResizedColumnWidths,
);

/**
 * Resolve native image display size independently of zero curSz records.
 *
 * Models the exact Hancom-resaved shape where curSz contains zero values,
 * sz carries display geometry and orgSz may contain a different intrinsic size.
 *
 * @returns {Promise<void>} Completion of the image-geometry fallback assertions.
 * @throws {Error} If a zero placeholder hides a positive native display size.
 * @example
 * await readHwpx(nativePackageWithZeroCurSz);
 */
async function verifyZeroImageSizeFallback(): Promise<void> {
  /** A self-contained PNG used only to exercise native picture-size records. */
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
  /** The independent package that will receive Hancom-style geometry records. */
  const files = unzipSync(
    await writeHwpx({
      doc: doc({
        type: "image",
        attrs: { src: `data:image/png;base64,${png}`, width: 120, height: 60 },
      }),
      page,
    }),
  );
  /** Section XML with zero transformed dimensions and smaller intrinsic dimensions. */
  const xml = strFromU8(files["Contents/section0.xml"])
    .replace(/<hp:curSz[^>]*\/>/, '<hp:curSz width="0" height="0"/>')
    .replace(/<hp:orgSz[^>]*\/>/, '<hp:orgSz width="2400" height="1200"/>');
  files["Contents/section0.xml"] = strToU8(xml);
  /** The decoded native image whose sz record must control its display dimensions. */
  const displayed = all((await readHwpx(zipSync(files))).doc, "image")[0];
  assert.equal(displayed.attrs!.width, 120);
  assert.equal(displayed.attrs!.height, 60);
  files["Contents/section0.xml"] = strToU8(xml.replace(/<hp:sz[^>]*\/>/, ""));
  /** The decoded image using positive intrinsic dimensions when display records are absent. */
  const intrinsic = all((await readHwpx(zipSync(files))).doc, "image")[0];
  assert.equal(intrinsic.attrs!.width, 32);
  assert.equal(intrinsic.attrs!.height, 16);
}

test(
  "zero native transformed image sizes fall back to positive display dimensions",
  verifyZeroImageSizeFallback,
);

/**
 * Verify native Hancom image and merged-cell fixtures retain their measured geometry.
 *
 * Reads local native fixtures and compares their measured image dimensions and merged-cell column-width arrays.
 *
 * @returns {Promise<void>} Completion of the documented interoperability assertions.
 * @throws {Error} If the expected document behavior is not preserved.
 * @example
 * await verifyNativeHancomImageAndMergedCellFixturesRetainTheirMeasuredGeometry();
 */
async function verifyNativeHancomImageAndMergedCellFixturesRetainTheirMeasuredGeometry(): Promise<void> {
  /** The image decoded from a native file whose curSz values are both zero. */
  const image = all(
    (await readHwpx(await readFile(nativeCorpusFixture("image.hwpx")))).doc,
    "image",
  )[0];
  assert.equal(image.attrs!.width, 32);
  assert.equal(image.attrs!.height, 16);
  /** Native table cells including a cell merged across its first two columns. */
  const cells = all(
    (await readHwpx(await readFile(nativeCorpusFixture("table.hwpx")))).doc,
    "tableCell",
  );
  assert.equal(cells[0].attrs!.colspan, 2);
  assert.deepEqual(cells[0].attrs!.colwidth, [82, 82]);
  assert.deepEqual(cells[1].attrs!.colwidth, [82]);
}

test(
  "native Hancom image and merged-cell fixtures retain their measured geometry",

  verifyNativeHancomImageAndMergedCellFixturesRetainTheirMeasuredGeometry,
);

/**
 * Verify newly inserted images retain positive intrinsic or aspect-ratio dimensions.
 *
 * Models editor image nodes whose default width and height attributes are null.
 * Uses an independently generated 32 by 16 pixel PNG so missing dimensions can
 * be checked against actual raster metadata rather than arbitrary fallback sizes.
 *
 * @returns {Promise<void>} Completion of the inserted-image geometry assertions.
 * @throws {Error} If default null dimensions export a zero-size or distorted image.
 * @example
 * await verifyInsertedImageDimensions();
 */
async function verifyInsertedImageDimensions(): Promise<void> {
  /** An independently generated red-and-blue PNG with known 32 by 16 pixel dimensions. */
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAYAAAB3AH1ZAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABQSURBVEhLpcihEcBAEAOx67/pTwFeogkQ0b2790eU2TFRZsdEmR0TZXZMlNkxUWbHRJkdE2V2TJTZMVFmx0SZHRNldkyU2TFRZsdEmR0TRT7a4vwuKstR+AAAAABJRU5ErkJggg==";
  /** Explicit and default dimension combinations expected to preserve the intrinsic aspect ratio. */
  const scenarios = [
    { width: null, height: null, expectedWidth: 32, expectedHeight: 16 },
    { width: 64, height: null, expectedWidth: 64, expectedHeight: 32 },
    { width: null, height: 48, expectedWidth: 96, expectedHeight: 48 },
  ];
  for (/** The image-attribute combination whose exported geometry is being verified. */ const scenario of scenarios) {
    /** Native package bytes generated from an image carrying default or partial dimensions. */
    const bytes = await writeHwpx({
      doc: doc({
        type: "image",
        attrs: {
          src: `data:image/png;base64,${png}`,
          width: scenario.width,
          height: scenario.height,
        },
      }),
      page,
    });
    /** The image decoded from exported native geometry records. */
    const image = all((await readHwpx(bytes)).doc, "image")[0];
    assert.equal(image.attrs!.width, scenario.expectedWidth);
    assert.equal(image.attrs!.height, scenario.expectedHeight);
  }
}

test(
  "inserted image null dimensions use intrinsic raster size and preserve aspect ratio",
  verifyInsertedImageDimensions,
);

/**
 * Verify genuine native hyperlink fields retain exact targets and mixed text runs.
 *
 * Serializes one linked range across bold and italic runs, with plain text on
 * each side. Checks the native field parameters and the reader's exact mark
 * extent, including query and escaped delimiter characters in the destination.
 *
 * @returns {Promise<void>} Completion of native hyperlink serialization assertions.
 * @throws {Error} If a target, linked text range or native field boundary is lost.
 * @example
 * await verifyNativeHyperlinkRoundTrip();
 */
async function verifyNativeHyperlinkRoundTrip(): Promise<void> {
  /** A destination containing query syntax and a native command separator. */
  const href = "https://example.com/forhan?x=1&y=2;part=3#details";
  /** One linked text range split across independently formatted editor nodes. */
  const input = doc({
    type: "paragraph",
    content: [
      { type: "text", text: "링크 앞 " },
      {
        type: "text",
        text: "포한 ",
        marks: [
          { type: "bold" },
          { type: "link", attrs: { href, target: "_self" } },
        ],
      },
      {
        type: "text",
        text: "프로젝트",
        marks: [
          { type: "italic" },
          { type: "link", attrs: { href, target: "_self" } },
        ],
      },
      { type: "text", text: " 링크 뒤" },
    ],
  });
  /** Independent native package bytes containing one paired hyperlink field. */
  const bytes = await writeHwpx({ doc: input, page });
  /** Native section XML containing the complete six-parameter hyperlink definition. */
  const xml = strFromU8(unzipSync(bytes)["Contents/section0.xml"]);
  assert.equal((xml.match(/type="HYPERLINK"/g) || []).length, 1);
  assert.equal((xml.match(/<hp:fieldEnd /g) || []).length, 1);
  assert.match(xml, /<hp:parameters cnt="6"/);
  assert.ok(xml.includes("forhan\\?x=1&amp;y=2\\;part=3#details;1;0;0;"));
  /** Decoded text nodes whose hyperlink marks must cover only the intended range. */
  const nodes = all((await readHwpx(bytes)).doc, "text");
  assert.equal(nodes[0].text, "링크 앞 ");
  assert.equal(
    nodes[0].marks?.some(
      /**
       * Detect an unexpectedly linked plain-text prefix.
       *
       * Tests the decoded mark type without changing the native document content.
       *
       * @param {{type: string}} mark - The decoded editor mark being inspected.
       * @returns {boolean} Whether the mark is a hyperlink.
       * @example
       * mark.type === 'link';
       */
      (mark: { type: string }) => mark.type === "link",
    ),
    false,
  );
  for (/** The two formatted text nodes belonging to the one native hyperlink field. */ const node of nodes.slice(
    1,
    3,
  )) {
    let target: string | undefined;
    for (/** The decoded mark inspected for the exact hyperlink target. */ const mark of node.marks ||
      [])
      if (mark.type === "link") target = mark.attrs?.href;
    assert.equal(target, href);
  }
  assert.equal(nodes.at(-1)!.text, " 링크 뒤");
}

test(
  "genuine hyperlink fields preserve URL and mixed-run scope",
  verifyNativeHyperlinkRoundTrip,
);

/**
 * Verify hyperlink edits regenerate one paired field while retaining unknown fields.
 *
 * Changes an imported target and its linked text after adding unrelated native
 * field metadata. Counts begin/end controls to detect stale shell duplicates.
 *
 * @returns {Promise<void>} Completion of the source-shell field-preservation assertions.
 * @throws {Error} If editing duplicates a hyperlink or discards an unknown native field.
 * @example
 * await verifyEditedHyperlinkFieldPreservation();
 */
async function verifyEditedHyperlinkFieldPreservation(): Promise<void> {
  /** A simple native package that will receive an unrelated retained field. */
  const files = unzipSync(
    await writeHwpx({
      doc: doc(
        para("원래 링크", {}, [
          { type: "link", attrs: { href: "https://example.com/original" } },
        ]),
      ),
      page,
    }),
  );
  /** An unknown native field preserved independently of the editable hyperlink range. */
  const opaqueField =
    '<hp:ctrl><hp:fieldBegin id="91" type="CLICK_HERE" name="보존할필드" editable="1" fieldid="92"><hp:parameters cnt="1" name=""><hp:stringParam name="Command">opaque-field-command</hp:stringParam></hp:parameters></hp:fieldBegin><hp:fieldEnd beginIDRef="91" fieldid="92"/></hp:ctrl>';
  files["Contents/section0.xml"] = strToU8(
    strFromU8(files["Contents/section0.xml"]).replace(
      "<hp:t>원래 링크",
      `${opaqueField}<hp:t>원래 링크`,
    ),
  );
  /** The imported document carrying both recognized and unknown native fields. */
  const parsed = await readHwpx(zipSync(files));
  /** The linked text node whose label and destination are being edited. */
  const linked = all(parsed.doc, "text")[0];
  linked.text = "수정한 포한 링크";
  for (/** The editable hyperlink mark receiving the new destination. */ const mark of linked.marks ||
    [])
    if (mark.type === "link")
      mark.attrs!.href = "https://example.com/edited?x=1&y=2";
  /** Reconstructed native XML after the hyperlink is regenerated from editor marks. */
  const bytes = await writeHwpx(parsed);
  /** The section used to count paired field controls and inspect retained metadata. */
  const xml = strFromU8(unzipSync(bytes)["Contents/section0.xml"]);
  assert.equal((xml.match(/type="HYPERLINK"/g) || []).length, 1);
  assert.equal((xml.match(/type="CLICK_HERE"/g) || []).length, 1);
  assert.equal((xml.match(/<hp:fieldEnd /g) || []).length, 2);
  assert.ok(xml.includes("opaque-field-command"));
  assert.ok(xml.includes("https://example.com/edited?x=1&amp;y=2"));
  assert.ok(string((await readHwpx(bytes)).doc).includes("수정한 포한 링크"));
}

test(
  "hyperlink edits replace old fields without losing unknown field metadata",
  verifyEditedHyperlinkFieldPreservation,
);

/**
 * Verify older command-only fields and unsafe-link rejection.
 *
 * Removes the modern Path parameter to exercise native command escaping, then
 * checks both editor-mark and retained-package validation against script URLs.
 *
 * @returns {Promise<void>} Completion of command fallback and URL-safety assertions.
 * @throws {Error} If command escaping loses a destination or an unsafe link is accepted.
 * @example
 * await verifyHyperlinkCommandAndSafety();
 */
async function verifyHyperlinkCommandAndSafety(): Promise<void> {
  /** A safe destination containing an escaped semicolon and a query marker. */
  const href = "https://example.com/path;segment?x=1&y=2";
  /** The package whose modern Path parameter is removed for compatibility testing. */
  const files = unzipSync(
    await writeHwpx({
      doc: doc(para("옛 명령 링크", {}, [{ type: "link", attrs: { href } }])),
      page,
    }),
  );
  files["Contents/section0.xml"] = strToU8(
    strFromU8(files["Contents/section0.xml"]).replace(
      /<hp:stringParam name="Path">[\s\S]*?<\/hp:stringParam>/,
      "",
    ),
  );
  /** Text decoded from the escaped native Command representation alone. */
  const linked = all((await readHwpx(zipSync(files))).doc, "text")[0];
  let target: string | undefined;
  for (/** The decoded mark supplying the command-only hyperlink destination. */ const mark of linked.marks ||
    [])
    if (mark.type === "link") target = mark.attrs?.href;
  assert.equal(target, href);
  for (/** The executable or control-character URL that must never be written as a native link. */ const unsafe of [
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox(1)",
    "https://example.com/\nscript",
  ])
    await assert.rejects(
      writeHwpx({
        doc: doc(
          para("위험 링크", {}, [{ type: "link", attrs: { href: unsafe } }]),
        ),
        page,
      }),
      /하이퍼링크/,
    );
  files["Contents/section0.xml"] = strToU8(
    strFromU8(files["Contents/section0.xml"]).replace(
      /<hp:stringParam name="Command">[\s\S]*?<\/hp:stringParam>/,
      '<hp:stringParam name="Command">javascript:alert(1);1;0;0;</hp:stringParam>',
    ),
  );
  await assert.rejects(readHwpx(zipSync(files)), /하이퍼링크/);
  files["Contents/section0.xml"] = strToU8(
    strFromU8(files["Contents/section0.xml"]).replace(
      "</hp:parameters>",
      '<hp:stringParam name="Path">https://example.com/safe-looking</hp:stringParam></hp:parameters>',
    ),
  );
  await assert.rejects(readHwpx(zipSync(files)), /하이퍼링크/);
  /** A safe imported snapshot used to verify validation before original-package reuse. */
  const retained = await readHwpx(
    await writeHwpx({
      doc: doc(para("보존된 링크", {}, [{ type: "link", attrs: { href } }])),
      page,
    }),
  );
  retained.source.files["Contents/section0.xml"] = Buffer.from(
    files["Contents/section0.xml"],
  ).toString("base64");
  await assert.rejects(writeHwpx(retained), /하이퍼링크/);
}

test(
  "command-only hyperlink fields decode safely and script URLs are rejected",
  verifyHyperlinkCommandAndSafety,
);
/**
 * Retain an original native hyperlink through a real source-text edit and export.
 *
 * Native field boundaries supply the reference label and exact query target.
 * Exported bytes remain in memory and never overwrite research artifacts.
 * @async
 * @returns {Promise<void>} Resolves after the native link survives the explicit edit.
 * @throws {AssertionError} If its label, target or edited export differs.
 * @example
 * await verifyNativeHyperlinkFixture();
 */
async function verifyNativeHyperlinkFixture(): Promise<void> {
  /** Required native source and independently decoded text runs retain their literal values. */
  const parsed = await readHwpx(
      await readFile(nativeCorpusFixture("hyperlink-native.hwpx")),
    ),
    nodes = all(parsed.doc, "text");
  assert.equal(nodes[0].text, "링크 앞 ");
  assert.equal(nodes[1].text, "포한 프로젝트");
  let href: string | undefined;
  for (/** Every native source mark is inspected without replacing its field boundary. */
  const mark of nodes[1].marks ?? [])
    if (mark.type === "link") href = mark.attrs?.href;
  assert.equal(href, "https://example.com/forhan?x=1&y=2");
  nodes[1].text = "포한 프로젝트 수정";
  /** Independently serialized and imported bytes prove the edited native field remains intact. */
  const edited = await readHwpx(await writeHwpx(parsed)),
    revised = all(edited.doc, "text");
  assert.equal(revised[1].text, "포한 프로젝트 수정");
  let revisedHref: string | undefined;
  for (/** The edited native mark retains the exact original query target. */
  const mark of revised[1].marks ?? [])
    if (mark.type === "link") revisedHref = mark.attrs?.href;
  assert.equal(revisedHref, href);
}

test(
  "native Hancom hyperlink run boundaries remain editable and retain the exact query target",

  verifyNativeHyperlinkFixture,
);

/**
 * Verify positive native header and footer metrics survive editing and export.
 *
 * Checks independently generated page offsets, their imported source snapshot
 * and explicit metric changes so body-text origin settings remain editable.
 *
 * @returns {Promise<void>} Completion of header and footer round-trip assertions.
 * @throws {Error} If a reserved header or footer area is lost or cannot be cleared.
 * @example
 * await verifyHeaderFooterGeometry();
 */
async function verifyHeaderFooterGeometry(): Promise<void> {
  /** Physical page settings with separate top and bottom reserved text areas. */
  const settings = { ...page, header: 15, footer: 12 };
  /** The imported native page and retained source after positive metrics are serialized. */
  const parsed = await readHwpx(
    await writeHwpx({ doc: doc(para("머리말과 꼬리말 여백")), page: settings }),
  );
  assert.ok(Math.abs(parsed.page.header! - 15) < 0.01);
  assert.ok(Math.abs(parsed.page.footer! - 12) < 0.01);
  parsed.page.header = 10;
  parsed.page.footer = 8;
  /** Native output after the imported document's reserved areas are explicitly edited. */
  const edited = await readHwpx(await writeHwpx(parsed));
  assert.ok(Math.abs(edited.page.header! - 10) < 0.01);
  assert.ok(Math.abs(edited.page.footer! - 8) < 0.01);
  edited.page.header = 0;
  edited.page.footer = 0;
  /** Native output after both optional text offsets are explicitly cleared. */
  const cleared = await readHwpx(await writeHwpx(edited));
  assert.equal(cleared.page.header, undefined);
  assert.equal(cleared.page.footer, undefined);
}

test(
  "positive header and footer metrics round-trip and remain editable",
  verifyHeaderFooterGeometry,
);

/**
 * Verify zero optional offsets preserve legacy six-field page compatibility.
 *
 * Confirms that documents with no reserved areas still expose the original
 * six-field page shape and that explicit zeros do not reconstruct an unchanged
 * imported package or discard its existing preview entries.
 *
 * @returns {Promise<void>} Completion of legacy page-shape and byte-preservation assertions.
 * @throws {Error} If absent offsets become implicit positive areas or force a lossy rewrite.
 * @example
 * await verifyLegacyPageOffsets();
 */
async function verifyLegacyPageOffsets(): Promise<void> {
  /** Independent six-field page output whose optional native offsets must be zero. */
  const bytes = await writeHwpx({
    doc: doc(para("기존 여섯 항목 쪽 설정")),
    page,
  });
  /** The uncompressed original package augmented with a retained preview payload. */
  const files = unzipSync(bytes);
  files["Preview/PrvImage.png"] = Uint8Array.of(1, 2, 3);
  /** The legacy page state read without zero-valued optional properties. */
  const parsed = await readHwpx(zipSync(files));
  assert.deepEqual(Object.keys(parsed.page).sort(), Object.keys(page).sort());
  parsed.page.header = 0;
  parsed.page.footer = 0;
  /** The unchanged native package retained despite explicit zero-valued optional metrics. */
  const output = unzipSync(await writeHwpx(parsed));
  for (/** The original package entry whose exact bytes must remain untouched. */ const name of Object.keys(
    files,
  ))
    assert.deepEqual(output[name], files[name], name);
}

test(
  "zero header and footer offsets preserve legacy page shape and package bytes",
  verifyLegacyPageOffsets,
);

/**
 * Verify the body-text origin of a native blank Hancom document.
 *
 * Reads independently created native page settings with 20mm top margin and
 * 15mm reserved header area, preserving both components needed by the renderer
 * and PDF layout rather than collapsing them into one ambiguous margin.
 *
 * @returns {Promise<void>} Completion of required native blank-page geometry assertions.
 * @throws {Error} If native header/footer areas or their body-text offset are misread.
 * @example
 * await verifyNativeBlankTextOffsets();
 */
async function verifyNativeBlankTextOffsets(): Promise<void> {
  /** The native blank document whose pagePr defines separate body-text offsets. */
  const parsed = await readHwpx(
    await readFile(nativeCorpusFixture("blank.hwpx")),
  );
  assert.ok(Math.abs(parsed.page.marginLeft - 30) < 0.01);
  assert.ok(Math.abs(parsed.page.marginRight - 30) < 0.01);
  assert.ok(Math.abs(parsed.page.marginTop - 20) < 0.01);
  assert.ok(Math.abs(parsed.page.marginBottom - 15) < 0.01);
  assert.ok(Math.abs(parsed.page.header! - 15) < 0.01);
  assert.ok(Math.abs(parsed.page.footer! - 15) < 0.01);
  assert.ok(Math.abs(parsed.page.marginTop + parsed.page.header! - 35) < 0.01);
}

test(
  "native blank page preserves header/footer text-origin components",

  verifyNativeBlankTextOffsets,
);
