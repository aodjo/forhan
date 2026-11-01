import {nativeCorpusFixture} from './helpers/native-corpus.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import CFB from 'cfb';
import { deflateSync } from 'fflate';
import { readHwp as importHwp, parseHwpRecords } from '../src/formats/hwp.ts';
import type { HwpDocumentNode, HwpMark, HwpImportResult, HwpNodeAttributes } from '../src/formats/hwp.ts';

/** A fixture node whose tested fields are asserted by the individual test cases. */
interface FixtureNode extends HwpDocumentNode {
  content: FixtureNode[];
  attrs: HwpNodeAttributes & { src: string; raw: NonNullable<HwpNodeAttributes['raw']> };
  marks: (HwpMark & { attrs: NonNullable<HwpMark['attrs']> })[];
}

/** Options used to build an independent synthetic OLE fixture. */
interface FixtureOptions { compressed?: boolean; flags?: number; docInfo?: Buffer; major?: number; streams?: Record<string, Uint8Array> }

/**
 * Import an HWP fixture for typed assertions.
 *
 * The fixture-specific view allows test cases to assert required nodes and attributes explicitly.
 * @param {Uint8Array<ArrayBufferLike>} input The input value supplied to this operation.
 * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * readHwp(makeHwp(paragraph("A"))).format // "hwp"
 */
const readHwp = (input: Uint8Array): Omit<HwpImportResult, 'doc'> & { doc: FixtureNode } => importHwp(input) as Omit<HwpImportResult, 'doc'> & { doc: FixtureNode };

/**
 * Encode fixture text as UTF-16LE.
 *
 * Synthetic paragraph records use the same byte order as native HWP text.
 * @param {string} text The text value supplied to this operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * utf("A").length // 2
 */
const utf = (text: string): Buffer => Buffer.from(text, 'utf16le');
/**
 * Build one synthetic HWP record.
 *
 * The header selects ordinary or extended lengths while retaining the requested tag and level.
 * @param {number} tag The tag value supplied to this operation.
 * @param {number} level The level value supplied to this operation.
 * @param {Buffer<ArrayBufferLike>} payload The payload value supplied to this operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * record(67, 1, Buffer.alloc(2)).length // 6
 */
function record(tag: number, level: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  /** Header bytes or header word for the current structure. */
  const header = Buffer.alloc(payload.length >= 4095 ? 8 : 4);
  header.writeUInt32LE((tag | (level << 10) | (Math.min(payload.length, 4095) << 20)) >>> 0);
  if (header.length === 8) header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
/**
 * Create a synthetic paragraph header.
 *
 * The fixture uses the modern 24-byte layout with default properties.
 * @returns {Buffer<ArrayBuffer>} The result consumed by the caller or enclosing collection operation.
 * @example
 * paragraphHeader().length // 24
 */
const paragraphHeader = () => Buffer.alloc(24);
/**
 * Build a synthetic paragraph record group.
 *
 * Text and optional character ranges exercise the independent importer with known source positions.
 * @param {string} text The text value supplied to this operation.
 * @param {number} level The level value supplied to this operation.
 * @param {[number, number][] | null} spans The spans value supplied to this operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * paragraph("A").length > 24 // true
 */
function paragraph(text: string, level = 0, spans: [number, number][] | null = null): Buffer {
  /** The parts value used by the current fixture or parsing operation. */
  const parts = [record(66, level, paragraphHeader()), record(67, level + 1, utf(text + '\r'))];
  if (spans) {
    /** Byte array used by the current operation. */
    const bytes = Buffer.alloc(spans.length * 8);
    spans.forEach(/**
     * Evaluate the current parsing callback.
     *
     * This callback supplies the enclosing collection operation with its record-specific result.
     * @param {[number, number]} options Options controlling the fixture or parsing operation.
     * @param {number} i The i value supplied to this operation.
     * @returns {void} Completes the operation without returning a value.
     * @example
     * { bytes.writeUInt32LE(pos, i * 8); bytes.writeUInt32LE(id, i * 8 + 4); } // Produces the result consumed by the enclosing operation.
     */
    ([pos, id], i) => { bytes.writeUInt32LE(pos, i * 8); bytes.writeUInt32LE(id, i * 8 + 4); });
    parts.push(record(68, level + 1, bytes));
  }
  return Buffer.concat(parts);
}
/**
 * Build an independent OLE HWP fixture.
 *
 * The helper writes the header, shared definitions and body, optionally adding compressed image streams.
 * @param {Buffer<ArrayBufferLike>} body The body value supplied to this operation.
 * @param {FixtureOptions} options Options controlling the fixture or parsing operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * makeHwp(paragraph("A")).length > 512 // true
 */
function makeHwp(body: Buffer, { compressed = true, flags = 0, docInfo = Buffer.alloc(0), major = 5, streams = {} }: FixtureOptions = {}): Buffer {
  /** The c value used by the current fixture or parsing operation. */
  const c = CFB.utils.cfb_new();
  /** Header bytes or header word for the current structure. */
  const header = Buffer.alloc(256);
  header.write('HWP Document File', 'ascii'); header[35] = major; header[33] = 3;
  header.writeUInt32LE(flags | (compressed ? 1 : 0), 36);
  CFB.utils.cfb_add(c, 'FileHeader', header);
  CFB.utils.cfb_add(c, 'DocInfo', compressed ? deflateSync(docInfo) : docInfo);
  CFB.utils.cfb_add(c, 'BodyText/Section0', compressed ? deflateSync(body) : body);
  for (
    /** Current [name, data] binding supplied by the enclosing source iteration. */
    const [name, data] of Object.entries(streams)) CFB.utils.cfb_add(c, name, data);
  return CFB.write(c, { type: 'buffer' });
}
/**
 * Collect document text for an assertion.
 *
 * Recursive concatenation verifies text order without depending on visual layout.
 * @param {HwpDocumentNode} node The node value supplied to this operation.
 * @returns {string} The result consumed by the caller or enclosing collection operation.
 * @example
 * texts({ type: "text", text: "A" }) // "A"
 */
function texts(node: HwpDocumentNode): string { return (node.text || '') + (node.content || []).map(texts).join(''); }
/**
 * Build a synthetic character-shape record.
 *
 * Fixture options control emphasis, font size and the red colour channel.
 * @param {{ bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; size?: number | undefined; red?: number | undefined; }} options Options controlling the fixture or parsing operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * charShape({ bold: true }).length // 78
 */
function charShape({ bold = false, italic = false, underline = false, size = 1100, red = 0 } = {}) {
  /** Byte array used by the current operation. */
  const bytes = Buffer.alloc(74); bytes.writeInt32LE(size, 42);
  bytes.writeUInt32LE((bold ? 2 : 0) | (italic ? 1 : 0) | (underline ? 4 : 0), 46);
  bytes[52] = red;
  return record(21, 1, bytes);
}

test('Korean, surrogate pairs, empty paragraphs and raw/DEFLATE streams', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  for (
    /** Current compressed binding supplied by the enclosing source iteration. */
    const compressed of [true, false]) {
    /** Accumulated result for the current parsing operation. */
    const result = readHwp(makeHwp(Buffer.concat([paragraph('안녕 😀 ABC'), paragraph('')]), { compressed }));
    assert.equal(texts(result.doc), '안녕 😀 ABC');
    assert.equal(result.doc.content.length, 2);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.original.format, 'hwp');
    assert.equal(Buffer.compare(Buffer.from(result.original.base64, 'base64'), makeHwp(Buffer.concat([paragraph('안녕 😀 ABC'), paragraph('')]), { compressed })), 0);
  }
});
test('mixed character ranges preserve bold/italic/underline, size and color', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Shared document-definition stream. */
  const docInfo = Buffer.concat([charShape(), charShape({ bold: true, italic: true, underline: true, red: 255, size: 1800 })]);
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(makeHwp(paragraph('AB가나', 0, [[0, 0], [2, 1]]), { docInfo }));
  /** The runs value used by the current fixture or parsing operation. */
  const runs = result.doc.content[0].content;
  assert.equal(runs.length, 2);
  assert.equal(runs[0].text, 'AB'); assert.equal(runs[1].text, '가나');
  assert.deepEqual(runs[1].marks.map(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {string} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.type // Produces the result consumed by the enclosing operation.
   */
  m => m.type), ['italic', 'bold', 'underline', 'textStyle']);
  assert.equal(runs[1].marks.at(-1)!.attrs.color, '#ff0000');
  assert.equal(runs[1].marks.at(-1)!.attrs.fontSize, '18pt');
});
test('script-specific font IDs resolve through language font counts', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Language font-count mapping from DocInfo. */
  const mapping = Buffer.alloc(72); mapping.writeUInt32LE(1, 4); mapping.writeUInt32LE(1, 8);
  /**
   * Build a synthetic font-name record.
   *
   * The encoded name supports independent script-specific font lookup assertions.
   * @param {string} name The name value supplied to this operation.
   * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
   * @example
   * font("A").length // 9
   */
  const font = (name: string): Buffer => { /** Source text bytes or fixture byte buffer used by the current operation. */
  const b = Buffer.alloc(3 + name.length * 2); b.writeUInt16LE(name.length, 1); utf(name).copy(b, 3); return record(19, 1, b); };
  /** Shared document-definition stream. */
  const docInfo = Buffer.concat([record(17, 0, mapping), font('한글 글꼴'), font('Latin Font'), charShape()]);
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(makeHwp(paragraph('한A'), { docInfo }));
  assert.equal(result.doc.content[0].content[0].marks.at(-1)!.attrs.fontFamily, '한글 글꼴');
  assert.equal(result.doc.content[0].content[1].marks.at(-1)!.attrs.fontFamily, 'Latin Font');
});
test('tab payload and section-control bytes never become visible garbage', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** The tab value used by the current fixture or parsing operation. */
  const tab = Buffer.alloc(16); tab.writeUInt16LE(9); tab.writeUInt16LE(9, 14);
  /** The section value used by the current fixture or parsing operation. */
  const section = Buffer.alloc(16); section.writeUInt16LE(2); section.write('dces', 2); section.writeUInt16LE(2, 14);
  /** The payload value used by the current fixture or parsing operation. */
  const payload = Buffer.concat([section, utf('앞'), tab, utf('뒤\r')]);
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(makeHwp(Buffer.concat([record(66, 0, paragraphHeader()), record(67, 1, payload)])));
  assert.equal(texts(result.doc), '앞\t뒤');
});
test('rejects encrypted, distributed, secured and non-HWP5 input', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  for (
    /** Current flag binding supplied by the enclosing source iteration. */
    const flag of [2, 4, 16, 256, 1024, 8192]) assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(makeHwp(paragraph('A'), { flags: flag })) // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(makeHwp(paragraph('A'), { flags: flag })), /HWP:/);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(makeHwp(paragraph('A'), { major: 3 })) // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(makeHwp(paragraph('A'), { major: 3 })), /HWP 5/);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(new Uint8Array(512)) // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(new Uint8Array(512)), /OLE/);
});
test('rejects truncated, oversized and invalid UTF-16 records', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {import("../src/formats/hwp.ts").HwpRecord[]} The result consumed by the caller or enclosing collection operation.
   * @example
   * parseHwpRecords(new Uint8Array([1, 2, 3])) // Produces the result consumed by the enclosing operation.
   */
  () => parseHwpRecords(new Uint8Array([1, 2, 3])), /헤더/);
  /** The bad value used by the current fixture or parsing operation. */
  const bad = Buffer.alloc(4); bad.writeUInt32LE((67 | (100 << 20)) >>> 0);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {import("../src/formats/hwp.ts").HwpRecord[]} The result consumed by the caller or enclosing collection operation.
   * @example
   * parseHwpRecords(bad) // Produces the result consumed by the enclosing operation.
   */
  () => parseHwpRecords(bad), /길이/);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(makeHwp(Buffer.concat([record(66, 0, paragraphHeader()), record(67, 1, Buffer.from([0x00, 0x // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(makeHwp(Buffer.concat([record(66, 0, paragraphHeader()), record(67, 1, Buffer.from([0x00, 0xd8]))]))), /문자열/);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(makeHwp(Buffer.concat([record(66, 0, paragraphHeader()), record(67, 1, Buffer.from([9, 0]))] // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(makeHwp(Buffer.concat([record(66, 0, paragraphHeader()), record(67, 1, Buffer.from([9, 0]))]))), /제어 문자/);
});
test('extended record length is parsed exactly', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Validated records in source order. */
  const records = parseHwpRecords(record(70, 1, Buffer.alloc(5000, 8)));
  assert.equal(records.length, 1); assert.equal(records[0].bytes.length, 5000);
});

/**
 * Build a synthetic table-cell list.
 *
 * The fixture supports legacy and modern list prefixes, merge spans and nested paragraph text.
 * @param {number} row The row value supplied to this operation.
 * @param {number} col The col value supplied to this operation.
 * @param {string} text The text value supplied to this operation.
 * @param {{ rowspan?: number | undefined; colspan?: number | undefined; modern?: boolean | undefined; }} options Options controlling the fixture or parsing operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * cell(0, 0, "A").length > 32 // true
 */
function cell(row: number, col: number, text: string, { rowspan = 1, colspan = 1, modern = false } = {}): Buffer {
  /** Byte array used by the current operation. */
  const bytes = Buffer.alloc(modern ? 47 : 32); bytes.writeUInt16LE(1);
  /** Byte offset of the current source field. */
  const offset = modern ? 8 : 6;
  if (modern) bytes.writeUInt32LE(32, 4);
  bytes.writeUInt16LE(col, offset); bytes.writeUInt16LE(row, offset + 2);
  bytes.writeUInt16LE(colspan, offset + 4); bytes.writeUInt16LE(rowspan, offset + 6);
  bytes.writeUInt32LE(9000 * colspan, offset + 8); bytes.writeUInt32LE(3000 * rowspan, offset + 12);
  return Buffer.concat([record(72, 2, bytes), paragraph(text, modern ? 2 : 3)]);
}
/**
 * Build an anchored synthetic table body.
 *
 * The control, table definition and cell lists exercise topology parsing without native dependencies.
 * @param {Buffer<ArrayBufferLike>[]} cells The cells value supplied to this operation.
 * @param {number} rows The rows value supplied to this operation.
 * @param {number} cols The cols value supplied to this operation.
 * @returns {Buffer<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * tableDocument([cell(0, 0, "A")], 1, 1).length > 0 // true
 */
function tableDocument(cells: Buffer[], rows = 2, cols = 2): Buffer {
  /** The ctrl value used by the current fixture or parsing operation. */
  const ctrl = Buffer.alloc(44); ctrl.write(' lbt', 'ascii');
  /** The table value used by the current fixture or parsing operation. */
  const table = Buffer.alloc(18 + 2 * rows + 4); table.writeUInt16LE(rows, 4); table.writeUInt16LE(cols, 6);
  /** The marker value used by the current fixture or parsing operation. */
  const marker = Buffer.alloc(16); marker.writeUInt16LE(11); marker.write(' lbt', 2); marker.writeUInt16LE(11, 14);
  return Buffer.concat([record(66, 0, paragraphHeader()), record(67, 1, Buffer.concat([marker, utf('\r')])), record(71, 1, ctrl), record(77, 2, table), ...cells]);
}
test('table with merged cells keeps rows, spans and each cell paragraph exactly once', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** The body value used by the current fixture or parsing operation. */
  const body = tableDocument([cell(0, 0, '병합', { colspan: 2 }), cell(1, 0, '왼쪽'), cell(1, 1, '오른쪽')]);
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(makeHwp(body));
  /** The table value used by the current fixture or parsing operation. */
  const table = result.doc.content[0];
  assert.equal(table.type, 'table'); assert.equal(table.content.length, 2);
  assert.equal(table.content[0].content[0].attrs.colspan, 2);
  assert.equal(table.content[1].content.length, 2);
  assert.equal(texts(result.doc), '병합왼쪽오른쪽');
});
test('vertical merges preserve covered row cells, reject overlap/missing topology', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** The valid value used by the current fixture or parsing operation. */
  const valid = tableDocument([cell(0, 0, '세로', { rowspan: 2 }), cell(0, 1, '위'), cell(1, 1, '아래')]);
  /** The table value used by the current fixture or parsing operation. */
  const table = readHwp(makeHwp(valid)).doc.content[0];
  assert.equal(table.content[0].content[0].attrs.rowspan, 2);
  assert.equal(table.content[1].content.length, 1);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(makeHwp(tableDocument([cell(0, 0, '누락')]))) // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(makeHwp(tableDocument([cell(0, 0, '누락')]))), /누락/);
  assert.throws(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @returns {Omit<HwpImportResult, "doc"> & { doc: FixtureNode; }} The result consumed by the caller or enclosing collection operation.
   * @example
   * readHwp(makeHwp(tableDocument([cell(0, 0, '겹침', { colspan: 2 }), cell(0, 1, '중복')]))) // Produces the result consumed by the enclosing operation.
   */
  () => readHwp(makeHwp(tableDocument([cell(0, 0, '겹침', { colspan: 2 }), cell(0, 1, '중복')]))), /겹칩니다/);
});
test('modern sequential cell lists use 32-bit paragraph count and retain merged topology', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** The body value used by the current fixture or parsing operation. */
  const body = tableDocument([cell(0, 0, '머리', { colspan: 2, modern: true }), cell(1, 0, '왼쪽', { modern: true }), cell(1, 1, '오른쪽', { modern: true })]);
  /** The table value used by the current fixture or parsing operation. */
  const table = readHwp(makeHwp(body)).doc.content[0];
  assert.equal(table.content[0].content[0].attrs.colspan, 2);
  assert.equal(table.content[1].content.length, 2);
  assert.equal(texts(table), '머리왼쪽오른쪽');
});
test('unknown controls retain complete binary payload with a readable placeholder', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** The ctrl value used by the current fixture or parsing operation. */
  const ctrl = Buffer.from('zzzzprivate-data', 'ascii');
  /** The body value used by the current fixture or parsing operation. */
  const body = Buffer.concat([paragraph('문장'), record(71, 1, ctrl)]);
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(makeHwp(body));
  /** The preserved value used by the current fixture or parsing operation. */
  const preserved = result.doc.content.find(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} n The n value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * n.type === 'preservedBlock' // Produces the result consumed by the enclosing operation.
   */
  n => n.type === 'preservedBlock')!;
  assert.equal(preserved.attrs.raw.controlId, 'zzzz');
  assert.deepEqual(Buffer.from(preserved.attrs.raw.records[0].base64, 'base64'), ctrl);
  assert.equal(result.warnings.length, 1);
});
test('checked-in Hancom 2024 source opens independently',  /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(fs.readFileSync(nativeCorpusFixture('sample.hwp')));
  assert.match(texts(result.doc), /포한 호환성 시험/);
  assert.match(texts(result.doc), /한글 문서를 누구나 편집합니다/);
  assert.ok(Math.abs(result.page.width - 210) < 0.1);
  assert.deepEqual(result.warnings, []);
});
test('Hancom 2024 generated table fixture uses sequential list headers and 8-byte prefixes',  /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(fs.readFileSync(nativeCorpusFixture('rich.hwp')));
  /** The table value used by the current fixture or parsing operation. */
  const table = result.doc.content.find(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} n The n value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * n.type === 'table' // Produces the result consumed by the enclosing operation.
   */
  n => n.type === 'table')!;
  assert.equal(table.content.length, 2);
  assert.equal(table.content[0].content.length, 2);
  assert.equal(texts(table), '항목내용포한한글 호환성');
  /** The heading value used by the current fixture or parsing operation. */
  const heading = result.doc.content[0].content[0];
  assert.ok(heading.marks.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.type === 'bold' // Produces the result consumed by the enclosing operation.
   */
  m => m.type === 'bold'));
  assert.equal(heading.marks.find(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.type === 'textStyle' // Produces the result consumed by the enclosing operation.
   */
  m => m.type === 'textStyle')!.attrs.fontSize, '16pt');
  assert.deepEqual(result.warnings, []);
});
test('native merged table retains multi-paragraph cells and per-cell formatting',  /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(fs.readFileSync(nativeCorpusFixture('table.hwp')));
  /** The table value used by the current fixture or parsing operation. */
  const table = result.doc.content.find(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} n The n value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * n.type === 'table' // Produces the result consumed by the enclosing operation.
   */
  n => n.type === 'table')!;
  assert.equal(table.content[0].content.length, 2);
  assert.equal(table.content[0].content[0].attrs.colspan, 2);
  assert.equal(table.content[0].content[0].content.length, 2);
  assert.equal(table.content[1].content.length, 3);
  assert.equal(table.content[1].content[0].content.length, 2);
  /** The runs value used by the current fixture or parsing operation. */
  const runs = table.content.flatMap(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} r The r value supplied to this operation.
   * @returns {FixtureNode[]} The result consumed by the caller or enclosing collection operation.
   * @example
   * r.content // Produces the result consumed by the enclosing operation.
   */
  r => r.content).flatMap(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} c The c value supplied to this operation.
   * @returns {FixtureNode[]} The result consumed by the caller or enclosing collection operation.
   * @example
   * c.content // Produces the result consumed by the enclosing operation.
   */
  c => c.content).flatMap(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} p The p value supplied to this operation.
   * @returns {FixtureNode[]} The result consumed by the caller or enclosing collection operation.
   * @example
   * p.content || [] // Produces the result consumed by the enclosing operation.
   */
  p => p.content || []);
  assert.ok(runs.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} r The r value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * r.marks.some(m => m.type === 'bold') // Produces the result consumed by the enclosing operation.
   */
  r => r.marks.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.type === 'bold' // Produces the result consumed by the enclosing operation.
   */
  m => m.type === 'bold')));
  assert.ok(runs.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} r The r value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * r.marks.some(m => m.type === 'italic') // Produces the result consumed by the enclosing operation.
   */
  r => r.marks.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.type === 'italic' // Produces the result consumed by the enclosing operation.
   */
  m => m.type === 'italic')));
  assert.ok(runs.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} r The r value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * r.marks.some(m => m.type === 'underline') // Produces the result consumed by the enclosing operation.
   */
  r => r.marks.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.type === 'underline' // Produces the result consumed by the enclosing operation.
   */
  m => m.type === 'underline')));
  assert.ok(runs.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} r The r value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * r.marks.some(m => m.attrs?.color === '#ff0000') // Produces the result consumed by the enclosing operation.
   */
  r => r.marks.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.attrs?.color === '#ff0000' // Produces the result consumed by the enclosing operation.
   */
  m => m.attrs?.color === '#ff0000')));
  assert.ok(runs.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} r The r value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * r.marks.some(m => m.attrs?.fontSize === '18pt') // Produces the result consumed by the enclosing operation.
   */
  r => r.marks.some(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {HwpMark & { attrs: NonNullable<HwpMark["attrs"]>; }} m The m value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * m.attrs?.fontSize === '18pt' // Produces the result consumed by the enclosing operation.
   */
  m => m.attrs?.fontSize === '18pt')));
  assert.deepEqual(result.warnings, []);
});
test('embedded picture resolves BinData reference and forced compression without native DLLs', /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** The png value used by the current fixture or parsing operation. */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  /** Definition of the referenced embedded or linked binary. */
  const bin = Buffer.alloc(12); bin.writeUInt16LE(0x11); bin.writeUInt16LE(1, 2); bin.writeUInt16LE(3, 4); utf('png').copy(bin, 6);
  /** The ctrl value used by the current fixture or parsing operation. */
  const ctrl = Buffer.alloc(44); ctrl.write(' osg', 'ascii'); ctrl.writeUInt32LE(7500, 16); ctrl.writeUInt32LE(3750, 20);
  /** Picture payload record inside the current control. */
  const picture = Buffer.alloc(78); picture.writeUInt16LE(1, 71);
  /** The body value used by the current fixture or parsing operation. */
  const body = Buffer.concat([paragraph('그림'), record(71, 1, ctrl), record(85, 2, picture)]);
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(makeHwp(body, { docInfo: record(18, 1, bin), streams: { 'BinData/BIN0001.png': deflateSync(png) } }));
  /** The image value used by the current fixture or parsing operation. */
  const image = result.doc.content.find(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} n The n value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * n.type === 'image' // Produces the result consumed by the enclosing operation.
   */
  n => n.type === 'image')!;
  assert.equal(image.attrs.src, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(image.attrs.width, 100); assert.equal(image.attrs.height, 50);
  assert.deepEqual(result.warnings, []);
});
test('native Hancom embedded image matches original PNG bytes and dimensions',  /**
 * Verify the documented HWP compatibility case.
 *
 * The assertions exercise known fixture input and fail when imported structure, content or protection handling differs.
 * @returns {void} Completes the operation without returning a value.
 * @throws {AssertionError} If the imported result differs from the documented fixture expectation.
 * @example
 * node --test tests/hwp.test.ts // The compatibility assertion passes.
 */
() => {
  /** Accumulated result for the current parsing operation. */
  const result = readHwp(fs.readFileSync(nativeCorpusFixture('image.hwp')));
  /** The image value used by the current fixture or parsing operation. */
  const image = result.doc.content.find(/**
   * Evaluate the current parsing callback.
   *
   * This callback supplies the enclosing collection operation with its record-specific result.
   * @param {FixtureNode} n The n value supplied to this operation.
   * @returns {boolean} The result consumed by the caller or enclosing collection operation.
   * @example
   * n.type === 'image' // Produces the result consumed by the enclosing operation.
   */
  n => n.type === 'image')!;
  assert.equal(image.attrs.width, 32); assert.equal(image.attrs.height, 16);
  assert.equal(Buffer.compare(Buffer.from(image.attrs.src.split(',')[1], 'base64'), fs.readFileSync(nativeCorpusFixture('pattern.png'))), 0);
  assert.match(texts(result.doc), /이미지 앞 문단/);
  assert.deepEqual(result.warnings, []);
});
