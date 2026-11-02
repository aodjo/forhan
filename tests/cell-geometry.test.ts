import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import type { JSONContent } from "@tiptap/core";
import {
  nativeCellDimension,
  nativeColumnMeasurements,
} from "../src/cell-geometry.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import {
  NATIVE_CELL_GEOMETRY,
  nativeGeometryDocument,
  geometryCells,
  type OriginalGeometryCase,
} from "./helpers/cell-geometry.ts";

/**
 * Verify source-unit geometry against literal independent original binary cells.
 *
 * Native height and merged-column expectations come from the original source
 * application, independently of production encoders and display rounding.
 * @returns {void} Completes original integer-field and logical-width assertions.
 * @throws {Error} If a stored original dimension or inferred logical width changes.
 * @example
 * // The original merged cell is 10123 units across unequal 4001 and 6122 columns.
 */
function verifyOriginalGeometry(): void {
  for (/** Every actual original topology supplies its own literal native cell fields. */ const row of NATIVE_CELL_GEOMETRY.rows) {
    /** Constraints are independently read from original raw bytes. */
    const measurements = [];
    for (/** Source count, geometry and spans are checked without invoking a production geometry decoder. */ const cell of row.cells) {
      /** Actual original modern binary list-header offsets remain independent expectations. */
      const bytes = Buffer.from(cell.headerHex, "hex"),
        view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      assert.equal(view.getUint32(16, true), cell.width);
      assert.equal(view.getUint32(20, true), cell.height);
      measurements.push({
        column: view.getUint16(8, true),
        span: view.getUint16(12, true),
        width: view.getUint32(16, true),
      });
      assert.equal(nativeCellDimension(cell.height), cell.height);
    }
    assert.deepEqual(
      nativeColumnMeasurements(3, measurements),
      row.columnWidths,
    );
  }
  assert.deepEqual(
    nativeColumnMeasurements(3, [{ column: 0, span: 3, width: 10001 }]),
    [3334, 3334, 3333],
  );
  assert.equal(nativeCellDimension(0), 0);
  assert.equal(nativeCellDimension(undefined), null);
}

/**
 * Assert actual native source cells retain independently observed physical geometry.
 *
 * Source text can change without replacing the native dimensions or merge
 * ownership. Fractional pixel widths must reconstruct exact integer HWP units.
 * @param {JSONContent} doc - Actual parsed production native output.
 * @param {OriginalGeometryCase} original - Independent original source expectations.
 * @returns {void} Completes every source cell dimension and span assertion.
 * @throws {Error} If source geometry is changed, truncated or applied to another cell.
 * @example
 * assertGeometry(parsed.doc,NATIVE_CELL_GEOMETRY.rows[0]);
 */
function assertGeometry(
  doc: JSONContent,
  original: OriginalGeometryCase,
): void {
  /** Only actual output cells supply the dimensions under test. */
  const cells = geometryCells(doc);
  assert.equal(cells.length, original.cells.length);
  for (let index = 0; index < cells.length; index++) {
    /** Original source order and spans identify each independent expected measurement. */
    const cell = cells[index],
      expected = original.cells[index],
      widths: number[] = [];
    for (
      let column = expected.column;
      column < expected.column + expected.colspan;
      column++
    )
      widths.push(original.columnWidths[column] / 75);
    assert.deepEqual(cell.attrs!.colwidth, widths, original.id + "/" + index);
    assert.equal(
      cell.attrs!.nativeCellHeight,
      expected.height,
      original.id + "/" + index,
    );
    assert.equal(cell.attrs!.colspan ?? 1, expected.colspan);
    assert.equal(cell.attrs!.rowspan ?? 1, expected.rowspan);
  }
}

/**
 * Preserve original geometry through actual binary and XML saves and changed-source conversions.
 *
 * Real serialized native fields are inspected independently before invoking
 * their readers. Later text edits force source regeneration in both directions.
 * @async
 * @returns {Promise<void>} Resolves after all original topologies survive every real native conversion.
 * @throws {Error} If any source distance or merge boundary is lost.
 * @example
 * // Unequal merged columns retain their original fractional pixel widths after HWP import.
 */
async function verifyGeometryConversions(): Promise<void> {
  for (/** Every independently observed original topology exercises both native encoders and readers. */ const original of NATIVE_CELL_GEOMETRY.rows) {
    /** Fresh authored source cannot borrow an unchanged original package or native binary. */
    const payload = { doc: nativeGeometryDocument(original) },
      binary = writeHwp(payload),
      compound = CFB.read(binary, { type: "buffer" }),
      section = stream(compound, "BodyText/Section0"),
      header = stream(compound, "FileHeader"),
      records = parseHwpRecords(
        header[36] & 1 ? inflateSync(section) : section,
      );
    let index = 0;
    for (/** Actual generated binary fields are compared directly with original literal measurements. */ const record of records)
      if (record.tag === 72) {
        /** Modern source geometry is independent from production reader results. */
        const view = new DataView(
            record.bytes.buffer,
            record.bytes.byteOffset,
            record.bytes.byteLength,
          ),
          expected = original.cells[index++];
        assert.equal(view.getUint32(16, true), expected.width);
        assert.equal(view.getUint32(20, true), expected.height);
      }
    assert.equal(index, original.cells.length);
    /** Native XML is also inspected directly without the production geometry parser. */
    const xmlBytes = await writeHwpx(payload),
      xml = strFromU8(unzipSync(xmlBytes)["Contents/section0.xml"]),
      sizes = xml.match(/<hp:cellSz\b[^>]*>/gu) ?? [];
    assert.equal(sizes.length, original.cells.length);
    for (let cell = 0; cell < sizes.length; cell++) {
      assert.equal(
        Number(/\bwidth="(\d+)"/u.exec(sizes[cell])?.[1]),
        original.cells[cell].width,
      );
      assert.equal(
        Number(/\bheight="(\d+)"/u.exec(sizes[cell])?.[1]),
        original.cells[cell].height,
      );
    }
    /** Complete actual native outputs establish each imported source before a real text edit. */
    const hwp = readHwp(binary),
      hwpx = await readHwpx(xmlBytes);
    assertGeometry(hwp.doc, original);
    assertGeometry(hwpx.doc, original);
    geometryCells(hwp.doc)[0].content![0].content![0].text = "A EDITED";
    geometryCells(hwpx.doc)[0].content![0].content![0].text = "A EDITED";
    assertGeometry((await readHwpx(await writeHwpx(hwp))).doc, original);
    assertGeometry(readHwp(writeHwp(hwpx)).doc, original);
    assertGeometry(readHwp(writeHwp(hwp)).doc, original);
    assertGeometry((await readHwpx(await writeHwpx(hwpx))).doc, original);
  }
}

/**
 * Retain explicit zero and reject invalid native height metadata before serialization.
 *
 * A zero source height is not an absent value or a request for a synthetic
 * 2400-unit replacement. Oversized or fractional source integers are invalid.
 * @async
 * @returns {Promise<void>} Resolves after both native formats retain zero source height.
 * @throws {Error} If a zero is replaced or invalid metadata is silently coerced.
 * @example
 * // Automatic content growth remains possible with a genuine zero stored minimum.
 */
async function verifyGeometryZero(): Promise<void> {
  /** One actual authored table supplies independent zero-height source cells. */
  const payload = { doc: nativeGeometryDocument(NATIVE_CELL_GEOMETRY.rows[0]) };
  for (/** All original cells retain an explicit zero independently of row spans. */ const cell of geometryCells(
    payload.doc,
  ))
    cell.attrs!.nativeCellHeight = 0;
  for (/** Both complete production encoders must preserve the same zero source height. */ const output of [
    readHwp(writeHwp(payload)),
    await readHwpx(await writeHwpx(payload)),
  ])
    for (/** Parsed source cells must not receive a synthesized positive height. */ const cell of geometryCells(
      output.doc,
    ))
      assert.equal(cell.attrs!.nativeCellHeight, 0);
  for (/** Invalid JSON types and physical integer values are rejected without coercion. */ const value of [
    -1,
    1.5,
    NaN,
    Infinity,
    0x80000000,
    "282",
  ]) {
    let error: unknown;
    try {
      nativeCellDimension(value);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof RangeError);
  }
}

/**
 * Preserve older one-slot merged totals without losing residual native units.
 *
 * A legacy merged width represents the complete span. Both real native writers
 * must retain that original total instead of stretching it to page width or
 * rounding each inferred internal column independently.
 * @async
 * @returns {Promise<void>} Resolves after exact legacy totals survive both native formats.
 * @throws {Error} If a total is stretched or an inferred residual unit is lost.
 * @example
 * // 10001 native units across three columns remains 10001 rather than 10002.
 */
async function verifyLegacyMergedGeometry(): Promise<void> {
  /** One older source slot deliberately stores a complete merged span. */
  const cell: JSONContent = {
    type: "tableCell",
    attrs: {
      colspan: 3,
      rowspan: 1,
      colwidth: [10001 / 75],
      nativeCellHeight: 1777,
    },
    content: [
      { type: "paragraph", content: [{ type: "text", text: "LEGACY" }] },
    ],
  };
  /** Source topology has one real cell spanning three logical columns. */
  const payload = {
    doc: {
      type: "doc",
      content: [
        { type: "table", content: [{ type: "tableRow", content: [cell] }] },
      ],
    },
  };
  for (/** Complete native outputs establish the actual retained merged-cell total. */ const output of [
    readHwp(writeHwp(payload)),
    await readHwpx(await writeHwpx(payload)),
  ]) {
    /** Actual parsed source cells remain independent from expected scalar width calculations. */
    const cells = geometryCells(output.doc);
    expectSingleMergedCell(cells);
    let width = 0;
    for (/** Exact native logical columns are summed before comparing the total. */ const pixels of cells[0]
      .attrs!.colwidth)
      width += pixels * 75;
    assert.equal(Math.round(width), 10001);
    assert.equal(cells[0].attrs!.nativeCellHeight, 1777);
  }
}

/**
 * Require the actual one-cell legacy merged topology before inspecting dimensions.
 *
 * Missing or split cells must not make a width assertion pass vacuously.
 * @param {JSONContent[]} cells - Actual parsed native cells.
 * @returns {void} Completes source topology assertions.
 * @throws {Error} If the merged source cell is missing or split.
 * @example
 * expectSingleMergedCell(geometryCells(parsed.doc));
 */
function expectSingleMergedCell(cells: JSONContent[]): void {
  assert.equal(cells.length, 1);
  assert.equal(cells[0].attrs!.colspan, 3);
}

/**
 * Read an actual generated compound stream by its original relative name.
 *
 * Only separators are normalized; source byte identity is unchanged.
 * @param {CFB.CFB$Container} compound - Actual serialized native document.
 * @param {string} name - Exact relative stream name.
 * @returns {Uint8Array} Actual native stream bytes.
 * @throws {Error} If the generated native stream is missing.
 * @example
 * stream(compound,'BodyText/Section0');
 */
function stream(compound: CFB.CFB$Container, name: string): Uint8Array {
  for (let index = 0; index < compound.FullPaths.length; index++)
    if (compound.FullPaths[index].replaceAll("\\", "/").endsWith("/" + name))
      return new Uint8Array(compound.FileIndex[index].content!);
  throw new Error("Missing actual native stream: " + name);
}

test(
  "native cell geometry matches independently observed source integers and merge constraints",
  verifyOriginalGeometry,
);
test(
  "native cell dimensions survive real raw fields and changed HWP HWPX conversions",
  verifyGeometryConversions,
);
test(
  "native cell heights retain zero and reject invalid source distances",
  verifyGeometryZero,
);
test(
  "legacy merged cell totals retain every source unit in both native formats",
  verifyLegacyMergedGeometry,
);
