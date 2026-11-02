import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import type { JSONContent } from "@tiptap/core";
import {
  nativeCellProperties,
  nativeCellMargins,
  readHwpCellProperties,
  hwpCellFlags,
  readHwpxCellProperties,
  hwpxCellProperties,
  type NativeCellProperties,
} from "../src/cell-properties.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";

/** Literal original native observations are independent of the production readers and writers. */
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-cell-properties.json", import.meta.url),
    "utf8",
  ),
) as {
  rows: {
    id: string;
    expected: NativeCellProperties;
    header: boolean;
    hwp: { flags: number; cellHeaderHex: string };
    hwpx: {
      cell: Record<string, string>;
      list: Record<string, string>;
      margins: Record<string, string>;
      tableMargins: Record<string, string>;
    };
  }[];
};

/**
 * Verify every independently observed native cell-property representation.
 *
 * Literal original HWP bytes, HWPX names and COM values establish independent
 * expectations for zero, false, distinct modes and unrelated native flag bits.
 * @returns {void} Completes all twelve original native mapping assertions.
 * @throws {Error} If a neutral property differs from an actual original observation.
 * @example
 * // Native LineWrap one is HWPX SQUEEZE while two is KEEP.
 */
function verifyNativeCellObservations(): void {
  for (/** Actual native records establish expected values without a production encoder round trip. */ const row of fixture.rows) {
    /** Exact original cell-list bytes retain the observed modern eight-byte prefix. */
    const bytes = Buffer.from(row.hwp.cellHeaderHex, "hex"),
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      margins = {
        left: view.getUint16(24, true),
        right: view.getUint16(26, true),
        top: view.getUint16(28, true),
        bottom: view.getUint16(30, true),
      };
    assert.equal(view.getUint32(4, true), row.hwp.flags, row.id);
    assert.deepEqual(
      readHwpCellProperties(row.hwp.flags, margins),
      row.expected,
      row.id,
    );
    assert.deepEqual(
      readHwpxCellProperties(row.hwpx.cell, row.hwpx.list, row.hwpx.margins),
      row.expected,
      row.id,
    );
    assert.equal(
      hwpCellFlags(row.expected, row.header, row.hwp.flags),
      row.hwp.flags,
      row.id,
    );
    /** Native XML fields are checked literally against the independently saved original tags. */
    const xml = hwpxCellProperties(row.expected);
    for (/** Each represented property remains independently observable in the actual source formats. */ const [
      name,
      value,
    ] of Object.entries(xml.cell))
      assert.equal(value, row.hwpx.cell[name], row.id + "/" + name);
    for (/** Native enum names retain their actual numeric mapping rather than an English-name assumption. */ const [
      name,
      value,
    ] of Object.entries(xml.list))
      assert.equal(value, row.hwpx.list[name], row.id + "/" + name);
    for (/** Explicit zero cannot become an absent margin or a default. */ const [
      name,
      value,
    ] of Object.entries(xml.margins))
      assert.equal(String(value), row.hwpx.margins[name], row.id + "/" + name);
  }
}
test(
  "twelve actual original native cell states retain independent binary and XML property mappings",
  verifyNativeCellObservations,
);

/**
 * Find an actual cell in a reconstructed document without assuming body positions.
 *
 * Native control anchors can produce ordinary surrounding paragraphs while the
 * owned table remains the only structural cell in these controlled documents.
 * @param {JSONContent} node - Actual document or child source node.
 * @returns {JSONContent} Actual source cell.
 * @throws {Error} If the independently parsed document has no editable cell.
 * @example
 * const cell=findCell(parsed.doc);
 */
function findCell(node: JSONContent): JSONContent {
  if (node.type === "tableCell" || node.type === "tableHeader") return node;
  for (/** Original source order is retained while traversing structural containers. */ const child of node.content ??
    []) {
    if (child.type === "tableCell" || child.type === "tableHeader")
      return child;
    if (child.content?.length) {
      /** An absent branch remains absent instead of manufacturing a replacement cell. */
      const found = findOptionalCell(child);
      if (found) return found;
    }
  }
  throw new Error("Missing actual native source cell.");
}

/**
 * Traverse one original source branch without creating substitute nodes.
 *
 * Optional lookup allows ordinary paragraphs around the actual table to remain
 * separate from its real cell ownership.
 * @param {JSONContent} node - Actual original source branch.
 * @returns {JSONContent|null} First actual source cell or no cell in this branch.
 * @example
 * findOptionalCell({type:'paragraph'}); // null
 */
function findOptionalCell(node: JSONContent): JSONContent | null {
  if (node.type === "tableCell" || node.type === "tableHeader") return node;
  for (/** Real source descendants retain their existing order and identities. */ const child of node.content ??
    []) {
    /** This branch can contain nested tables without borrowing unrelated sibling cells. */
    const found = findOptionalCell(child);
    if (found) return found;
  }
  return null;
}

/**
 * Preserve exact cell properties through actual native writes and changed-content conversions.
 *
 * Raw binary flags and native XML are inspected independently before parsing.
 * A later authored text edit forces regeneration of retained imported shells.
 * @async
 * @returns {Promise<void>} Resolves after every original state survives both native formats and edited rewrites.
 * @throws {Error} If any represented source property, title flag or physical margin is lost.
 * @example
 * // A zero top margin and false inheritance flag survive HWP to HWPX conversion.
 */
async function verifyNativeCellConversions(): Promise<void> {
  for (/** Both actual native formats must encode all independently observed source states. */ const row of fixture.rows) {
    /** Table defaults deliberately differ from cell overrides to expose accidental flattening. */
    const margins = { left: 333, right: 444, top: 0, bottom: 222 },
      payload = {
        doc: {
          type: "doc",
          content: [
            {
              type: "table",
              attrs: { nativeCellMargins: margins },
              content: [
                {
                  type: "tableRow",
                  content: [
                    {
                      type: row.header ? "tableHeader" : "tableCell",
                      attrs: {
                        colspan: 1,
                        rowspan: 1,
                        colwidth: [120],
                        nativeCellProperties: structuredClone(row.expected),
                        nativeCellFlags: row.hwp.flags,
                      },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "원본 셀 ABC" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
    /** Original record definitions establish raw binary expectations before invoking its reader. */
    const binary = writeHwp(payload),
      container = CFB.read(binary, { type: "buffer" }),
      index = container.FullPaths.findIndex(
        /**
         * Locate the genuine native section stream beneath its original storage root.
         *
         * No production table parser supplies the bytes used for raw assertions.
         * @param {string} path - Actual compound-document member path.
         * @returns {boolean} Whether this is the original first body stream.
         * @example
         * // Root Entry/BodyText/Section0 contains the actual generated native records.
         */
        (path) => path.replaceAll("\\", "/").endsWith("/BodyText/Section0"),
      );
    assert.ok(index >= 0);
    /** Raw generated records are checked independently from the complete document parser. */
    const records = parseHwpRecords(
      inflateSync(new Uint8Array(container.FileIndex[index].content!)),
    );
    for (/** The controlled table has one cell-list and one table-definition record. */ const record of records) {
      if (record.tag === 72) {
        /** Native prefix flags retain unrelated bits from the actual original file. */
        const view = new DataView(
          record.bytes.buffer,
          record.bytes.byteOffset,
          record.bytes.byteLength,
        );
        assert.equal(view.getUint32(4, true), row.hwp.flags, row.id);
        assert.equal(
          view.getUint16(28, true),
          row.expected.margins.top,
          row.id,
        );
      }
      if (record.tag === 77) {
        /** The independent table top margin stays zero even when the cell has a different override. */
        const view = new DataView(
          record.bytes.buffer,
          record.bytes.byteOffset,
          record.bytes.byteLength,
        );
        assert.equal(view.getUint16(14, true), 0, row.id);
      }
    }
    /** Exact native XML enumeration names are visible in the actual generated section. */
    const xmlBytes = await writeHwpx(payload),
      xml = strFromU8(unzipSync(xmlBytes)["Contents/section0.xml"]);
    assert.ok(
      xml.includes(`textDirection="${row.hwpx.list.textDirection}"`),
      row.id,
    );
    assert.ok(xml.includes(`lineWrap="${row.hwpx.list.lineWrap}"`), row.id);
    assert.ok(xml.includes(`vertAlign="${row.hwpx.list.vertAlign}"`), row.id);
    for (/** Real text edits invalidate native retained source shortcuts in both imported formats. */ const parsed of [
      readHwp(binary),
      await readHwpx(xmlBytes),
    ]) {
      /** Parsed real cell ownership supplies the title-cell flag and complete neutral properties. */
      const cell = findCell(parsed.doc);
      assert.deepEqual(cell.attrs!.nativeCellProperties, row.expected, row.id);
      assert.equal(cell.type, row.header ? "tableHeader" : "tableCell", row.id);
      cell.content![0].content![0].text += " 편집";
      for (/** Cross-format writes must retain independent properties without depending on the prior native source shell. */ const rewritten of [
        readHwp(writeHwp(parsed)),
        await readHwpx(await writeHwpx(parsed)),
      ]) {
        /** Independent native parsing establishes the actual regenerated source result. */
        const actual = findCell(rewritten.doc);
        assert.deepEqual(
          actual.attrs!.nativeCellProperties,
          row.expected,
          row.id,
        );
        assert.equal(actual.type, cell.type, row.id);
        assert.ok(
          actual.content![0].content![0].text!.endsWith(" 편집"),
          row.id,
        );
        assert.deepEqual(
          rewritten.doc.content!.find(
            /**
             * Locate the real top-level native table for its independent inherited defaults.
             *
             * Surrounding ordinary paragraphs remain separate authored source.
             * @param {JSONContent} node - Actual parsed top-level block.
             * @returns {boolean} Whether the block is the actual source table.
             * @example
             * // Cell overrides cannot replace the table's original top margin of zero.
             */
            (node) => node.type === "table",
          )!.attrs!.nativeCellMargins,
          margins,
          row.id,
        );
      }
    }
  }
}
test(
  "native cell properties and distinct table defaults survive raw fields and edited cross-format writes",
  verifyNativeCellConversions,
);

/**
 * Reject lossy coercion and native binary overflow while retaining wider XML distances.
 *
 * Invalid source flags cannot silently become defaults, and HWP physical fields
 * must fail explicitly before unsigned truncation changes a genuine margin.
 * @returns {void} Completes malformed metadata and exact default independence assertions.
 * @throws {Error} If validation accepts malformed native source data.
 * @example
 * // HWPX retains a 65536-unit margin while HWP rejects its 16-bit overflow.
 */
function verifyCellValidation(): void {
  /** Independent copies protect original appearance from later mutation. */
  const first = nativeCellProperties(),
    second = nativeCellProperties();
  first.margins.top = 0;
  assert.equal(second.margins.top, 141);
  assert.equal(second.hasMargin, false);
  assert.equal(second.verticalAlign, 1);
  for (/** Malformed modes must never turn into a different valid original cell choice. */ const value of [
    true,
    false,
    "1",
    null,
    -1,
    3,
    NaN,
    1.5,
  ])
    assert.throws(
      /**
       * Exercise actual source enum validation rather than a test-owned substitute.
       *
       * Each invalid value is supplied to the ordinary production normalizer.
       * @returns {NativeCellProperties} The normalized result if incorrectly accepted.
       * @throws {RangeError} For the deliberately malformed native enumeration.
       * @example
       * // String one cannot become numeric one.
       */
      () => nativeCellProperties({ ...second, lineWrap: value }),
      RangeError,
    );
  /** Wider exact HWPX distances stay supported without weakening the native HWP boundary. */
  const wide = { ...second, margins: { ...second.margins, left: 65536 } };
  assert.equal(hwpxCellProperties(wide).margins.left, 65536);
  assert.throws(
    /**
     * Verify the actual binary encoder rejects unsigned native distance overflow.
     *
     * No native source bytes can be emitted with a silently wrapped margin.
     * @returns {number} Native flags if incorrectly accepted.
     * @throws {RangeError} Because the retained physical margin exceeds 16-bit storage.
     * @example
     * // A 65536-unit margin cannot become zero in HWP.
     */
    () => hwpCellFlags(wide, false),
    RangeError,
  );
  assert.deepEqual(
    nativeCellMargins({ left: 0, right: 0, top: 0, bottom: 0 }),
    { left: 0, right: 0, top: 0, bottom: 0 },
  );
}
test(
  "native cell validation preserves zero and independent defaults without coercion or binary overflow",
  verifyCellValidation,
);
