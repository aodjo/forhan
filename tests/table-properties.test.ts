import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import CFB from "cfb";
import { inflateSync, unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { JSONContent } from "@tiptap/core";
import {
  nativeTableProperties,
  readHwpTableProperties,
  hwpTableFlags,
  hwpTableSpacing,
  readHwpxTableProperties,
  hwpxTableProperties,
  type NativeTableProperties,
} from "../src/table-properties.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";

/** One actual original source state supplies independent mode, repeat, spacing and geometry expectations. */
interface TableOracle {
  id: string;
  columns: number;
  properties: NativeTableProperties;
  hwp: { flags: number; spacing: number; tableDefinitionHex: string };
  hwpx: Record<string, string>;
  geometry: {
    cellWidths: number[];
    cellHeights: number[];
    tableWidth: number;
    tableHeight: number;
  };
}
/** Literal original HWP, HWPX and accepted native properties establish independent expected values. */
const oracle = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-table-properties.json", import.meta.url),
    "utf8",
  ),
) as { rows: TableOracle[] };

/**
 * Verify every independent original table property representation.
 *
 * Literal native records and original XML names establish expectations without
 * relying on an encoder round trip or translated interface captions.
 * @returns {void} Completes all twenty-four original source-property assertions.
 * @throws {Error} If a numeric mode, false flag or exact distance changes.
 * @example
 * // Original low mode one is TABLE; two is CELL.
 */
function verifyOriginalProperties(): void {
  for (/** Both native column contexts keep independent source property and spacing encodings. */ const row of oracle.rows) {
    /** Actual original table-definition bytes supply the wire fields directly. */
    const bytes = Buffer.from(row.hwp.tableDefinitionHex, "hex"),
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.equal(view.getUint32(0, true), row.hwp.flags);
    assert.equal(view.getUint16(8, true), row.hwp.spacing);
    assert.deepEqual(
      readHwpTableProperties(row.hwp.flags, row.hwp.spacing),
      row.properties,
    );
    assert.deepEqual(readHwpxTableProperties(row.hwpx), row.properties);
    assert.equal(hwpTableFlags(row.properties, row.hwp.flags), row.hwp.flags);
    assert.equal(hwpTableSpacing(row.properties), row.hwp.spacing);
    assert.deepEqual(hwpxTableProperties(row.properties), row.hwpx);
    assert.equal(
      row.geometry.tableWidth,
      row.geometry.cellWidths.reduce(sumWidths, 0) +
        row.properties.cellSpacing * (row.columns + 1),
    );
  }
}

/**
 * Sum independent original native cell widths.
 *
 * Native spacing remains outside these individual cell measurements.
 * @param {number} total - Previously accumulated original width.
 * @param {number} width - Actual next original cell width.
 * @returns {number} Exact accumulated native cell width.
 * @example
 * sumWidths(6122,6122); // 12244
 */
function sumWidths(total: number, width: number): number {
  return total + width;
}

/**
 * Create authored editable source from an independent native table observation.
 *
 * Exact source distances remain fractional CSS pixels until native encoding.
 * No original package bytes are reused by these fresh writer inputs.
 * @param {TableOracle} row - Original source property and geometry observation.
 * @returns {JSONContent} Complete editable one-row source table.
 * @example
 * tableDocument(oracle.rows[0]);
 */
function tableDocument(row: TableOracle): JSONContent {
  /** Actual source columns retain their own independent physical widths and cell heights. */
  const cells: JSONContent[] = [];
  for (let column = 0; column < row.columns; column++)
    cells.push({
      type: "tableCell",
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: [row.geometry.cellWidths[column] / 75],
        nativeCellHeight: row.geometry.cellHeights[column],
      },
      content: [
        {
          type: "paragraph",
          content:
            column === 0
              ? [{ type: "text", text: "TABLE PAGE PROPERTIES" }]
              : undefined,
        },
      ],
    });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: {
          nativeTableProperties: structuredClone(row.properties),
          nativeTableFlags: row.hwp.flags,
        },
        content: [{ type: "tableRow", content: cells }],
      },
    ],
  };
}

/**
 * Find the actual first source table without assuming native anchor paragraphs.
 *
 * Missing table content aborts assertions instead of creating expected data.
 * @param {JSONContent} doc - Actual parsed native document.
 * @returns {JSONContent} Actual original source table.
 * @throws {Error} If the actual output contains no table.
 * @example
 * firstTable(parsed.doc).attrs.nativeTableProperties;
 */
function firstTable(doc: JSONContent): JSONContent {
  for (/** Only real direct source tables supply the original output properties. */ const node of doc.content ??
    [])
    if (node.type === "table") return node;
  throw new Error("Actual native source table is missing.");
}

/**
 * Preserve properties through genuine raw native output and edited source conversions.
 *
 * Independent raw binary/XML assertions precede native parsing. Later authored
 * text edits force source regeneration in both same- and opposite-format saves.
 * @async
 * @returns {Promise<void>} Resolves after all original modes, flags and physical gaps survive actual writes.
 * @throws {Error} If any original table property or cell-gap relationship changes.
 * @example
 * // NONE mode and a false repeat flag cannot become native defaults during editing.
 */
async function verifyNativeConversions(): Promise<void> {
  for (/** Every original mode/repeat/spacing combination is checked in both column contexts. */ const row of oracle.rows) {
    /** Fresh authored source cannot return an unchanged original native archive. */
    const input = { doc: tableDocument(row) },
      binary = writeHwp(input),
      compound = CFB.read(binary, { type: "buffer" }),
      section = stream(compound, "BodyText/Section0"),
      header = stream(compound, "FileHeader"),
      records = parseHwpRecords(
        header[36] & 1 ? inflateSync(section) : section,
      );
    let definitions = 0;
    for (/** The actual stored native definition supplies original flag and distance bytes. */ const record of records)
      if (record.tag === 77) {
        /** Fixed original table fields are compared independently from the production reader. */
        const view = new DataView(
          record.bytes.buffer,
          record.bytes.byteOffset,
          record.bytes.byteLength,
        );
        definitions++;
        assert.equal(view.getUint32(0, true), row.hwp.flags);
        assert.equal(view.getUint16(8, true), row.hwp.spacing);
      }
    assert.equal(definitions, 1);
    /** Actual XML output retains literal original names and spacing-inclusive object width. */
    const xmlBytes = await writeHwpx(input),
      xml = strFromU8(unzipSync(xmlBytes)["Contents/section0.xml"]),
      tag = xml.match(/<hp:tbl\b[^>]*>/u)?.[0] ?? "",
      size = xml.match(/<hp:sz\b[^>]*>/u)?.[0] ?? "";
    for (/** Exact literal native attributes establish their own independent expected representation. */ const [
      name,
      value,
    ] of Object.entries(row.hwpx))
      assert.equal(attribute(tag, name), value);
    assert.equal(Number(attribute(size, "width")), row.geometry.tableWidth);
    /** Complete actual source readers establish the first parsed state before a real text edit. */
    const hwp = readHwp(binary),
      hwpx = await readHwpx(xmlBytes);
    assert.deepEqual(
      firstTable(hwp.doc).attrs!.nativeTableProperties,
      row.properties,
    );
    assert.deepEqual(
      firstTable(hwpx.doc).attrs!.nativeTableProperties,
      row.properties,
    );
    firstTable(hwp.doc).content![0].content![0].content![0].content![0].text +=
      " EDITED";
    firstTable(hwpx.doc).content![0].content![0].content![0].content![0].text +=
      " EDITED";
    for (/** Native same- and cross-format writes must preserve each independent original property. */ const result of [
      readHwp(writeHwp(hwp)),
      readHwp(writeHwp(hwpx)),
      await readHwpx(await writeHwpx(hwp)),
      await readHwpx(await writeHwpx(hwpx)),
    ])
      assert.deepEqual(
        firstTable(result.doc).attrs!.nativeTableProperties,
        row.properties,
      );
  }
}

/**
 * Recover older XML-only metadata while respecting explicit current edits.
 *
 * A consistent authored HWPX package carries the independently observed fitted
 * height. Clearing its spacing must preserve that fitted height relationship
 * without replacing it by a generic per-row writer estimate.
 * @async
 * @returns {Promise<void>} Resolves after legacy retained source and explicit replacement values agree.
 * @throws {Error} If older source is overwritten or a spacing-only edit discards fitted geometry.
 * @example
 * // Native fitted height6156 becomes6082 when the two37-unit perimeter gaps are removed.
 */
async function verifyLegacyAndSpacingEdits(): Promise<void> {
  /** The independent original sample defines CELL mode, repeated headers and37-unit spacing. */
  const row = oracle.rows.find(originalSpacedTable)!;
  assert.ok(row);
  /** This complete authored native input has a real original fitted-height value rather than a writer default. */
  const files = unzipSync(await writeHwpx({ doc: tableDocument(row) }));
  files["Contents/section0.xml"] = strToU8(
    strFromU8(files["Contents/section0.xml"]).replace(
      /(<hp:sz\b[^>]*\bheight=")\d+("[^>]*>)/u,
      `$1${row.geometry.tableHeight}$2`,
    ),
  );
  /** Reading the complete real package keeps its raw files and retained XML snapshots consistent. */
  const payload = await readHwpx(zipSync(files, { level: 0 })),
    table = firstTable(payload.doc);
  table.attrs!.nativeTableProperties = null;
  table.content![0].content![0].content![0].content![0].text += " LEGACY EDIT";
  assert.deepEqual(
    firstTable(readHwp(writeHwp(payload)).doc).attrs!.nativeTableProperties,
    row.properties,
  );
  assert.deepEqual(
    firstTable((await readHwpx(await writeHwpx(payload))).doc).attrs!
      .nativeTableProperties,
    row.properties,
  );
  table.attrs!.nativeTableProperties = {
    pageBreak: 0,
    repeatHeader: false,
    cellSpacing: 0,
  };
  /** An explicit current edit must replace the old retained shell and retain its fitted baseline. */
  const output = await writeHwpx(payload),
    xml = strFromU8(unzipSync(output)["Contents/section0.xml"]),
    size = xml.match(/<hp:sz\b[^>]*>/u)?.[0] ?? "";
  assert.equal(Number(attribute(size, "width")), 6122);
  assert.equal(Number(attribute(size, "height")), 6082);
  assert.deepEqual(
    firstTable((await readHwpx(output)).doc).attrs!.nativeTableProperties,
    { pageBreak: 0, repeatHeader: false, cellSpacing: 0 },
  );
  assert.deepEqual(
    firstTable(readHwp(writeHwp(payload)).doc).attrs!.nativeTableProperties,
    { pageBreak: 0, repeatHeader: false, cellSpacing: 0 },
  );
  /** A later real width edit must update the existing size record without duplicating it. */
  const resized = await readHwpx(output);
  firstTable(resized.doc).content![0].content![0].attrs!.colwidth = [6000 / 75];
  /** Independent native XML inspection detects duplicate size records hidden by first-child readers. */
  const resizedXml = strFromU8(
      unzipSync(await writeHwpx(resized))["Contents/section0.xml"],
    ),
    sizes = [...resizedXml.matchAll(/<hp:sz\b[^>]*>/gu)];
  assert.equal(sizes.length, 1);
  assert.equal(Number(attribute(sizes[0][0], "width")), 6000);
  assert.equal(Number(attribute(sizes[0][0], "height")), 6082);
}

/**
 * Match the independent original one-column fully enabled spacing observation.
 *
 * Expected source values come from original native output rather than a writer.
 * @param {TableOracle} row - Independent original table observation.
 * @returns {boolean} Whether this is the intended original spacing case.
 * @example
 * originalSpacedTable(oracle.rows[0]);
 */
function originalSpacedTable(row: TableOracle): boolean {
  return (
    row.columns === 1 &&
    row.properties.pageBreak === 2 &&
    row.properties.repeatHeader &&
    row.properties.cellSpacing === 37
  );
}

/**
 * Preserve unknown native flag bits and reject unrepresentable source values.
 *
 * Native defaults remain independent fresh records. Wider XML spacing must not
 * wrap into HWP's sixteen-bit physical field.
 * @returns {void} Completes flag retention, default independence and validation assertions.
 * @throws {Error} If source metadata is coerced or silently truncated.
 * @example
 * // Explicit false and zero cannot be replaced by a native true/default value.
 */
function verifyValidation(): void {
  assert.equal(
    hwpTableFlags(
      { pageBreak: 0, repeatHeader: false, cellSpacing: 0 },
      0x80000006,
    ),
    0x80000000,
  );
  /** Mutating a caller-owned default cannot alter a later source record. */
  const first = nativeTableProperties();
  first.repeatHeader = false;
  assert.equal(nativeTableProperties().repeatHeader, true);
  for (/** Invalid explicit source records cannot be silently normalized into valid default properties. */ const value of [
    { pageBreak: 3, repeatHeader: true, cellSpacing: 0 },
    { pageBreak: 0, repeatHeader: 1, cellSpacing: 0 },
    { pageBreak: 0, repeatHeader: false, cellSpacing: -1 },
    { pageBreak: 0, repeatHeader: false, cellSpacing: 1.5 },
  ]) {
    let error: unknown;
    try {
      nativeTableProperties(value);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error instanceof TypeError || error instanceof RangeError);
  }
  /** XML/FHN can retain a wide spacing even when binary HWP cannot represent it. */
  const wide = { pageBreak: 2, repeatHeader: true, cellSpacing: 65536 };
  assert.equal(hwpxTableProperties(wide).cellSpacing, "65536");
  let error: unknown;
  try {
    hwpTableSpacing(wide);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof RangeError);
}

/**
 * Read one bounded actual native XML attribute.
 *
 * Missing source fields remain errors rather than fabricated expected values.
 * @param {string} tag - Actual native output tag.
 * @param {string} name - Fixed trusted native attribute name.
 * @returns {string} Literal actual source attribute.
 * @throws {Error} If the actual field is absent.
 * @example
 * attribute('<hp:tbl pageBreak="CELL"/>','pageBreak'); // 'CELL'
 */
function attribute(tag: string, name: string): string {
  /** Fixed internal names do not originate in imported authored document text. */
  const value = new RegExp("\\b" + name + '="([^"]*)"', "u").exec(tag)?.[1];
  if (value === undefined)
    throw new Error("Missing actual native attribute: " + name);
  return value;
}

/**
 * Read one actual generated compound stream beneath its storage root.
 *
 * Only separators are normalized while actual byte identity remains unchanged.
 * @param {CFB.CFB$Container} compound - Actual serialized native document.
 * @param {string} name - Exact native stream name.
 * @returns {Uint8Array} Actual unchanged source bytes.
 * @throws {Error} If the actual native stream is missing.
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
  "table properties match all independent original native modes, repeat flags and spacing fields",
  verifyOriginalProperties,
);
test(
  "table page properties and physical spacing survive raw native fields and edited conversions",
  verifyNativeConversions,
);
test(
  "older table XML metadata and spacing-only edits retain original fitted geometry",
  verifyLegacyAndSpacingEdits,
);
test(
  "table source flags, defaults and spacing bounds remain independently validated",
  verifyValidation,
);
