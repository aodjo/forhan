import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { JSONContent } from "@tiptap/core";
import {
  cellFieldName,
  readHwpCellField,
  writeHwpCellField,
} from "../src/cell-field-name.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";

/** Literal original native bytes establish independent empty, assigned, Unicode and cleared expectations. */
const oracle = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-cell-field-name.json", import.meta.url),
    "utf8",
  ),
) as { rows: { id: string; name: string; extensionHex: string }[] };

/**
 * Verify literal original named-cell encodings independently from round trips.
 *
 * Both decoding and fresh encoding must match bytes saved by the original
 * application, including its actual UTF-16 length and empty-cell extension.
 * @returns {void} Completes all original byte and name assertions.
 * @throws {Error} If native identity or original extension bytes change.
 * @example
 * // A Korean name uses ten original UTF-16 code units in this fixture.
 */
function verifyOriginalCellFields(): void {
  for (/** Every expected extension comes directly from the original independent source application. */ const row of oracle.rows) {
    /** Original literal bytes remain independent from the production encoder. */
    const bytes = new Uint8Array(Buffer.from(row.extensionHex, "hex")),
      decoded = readHwpCellField(bytes);
    assert.equal(decoded.nativeCellFieldName, row.name, row.id);
    assert.equal(decoded.nativeCellFieldData, row.extensionHex, row.id);
    assert.equal(
      Buffer.from(writeHwpCellField(row.name)).toString("hex"),
      row.extensionHex,
      row.id,
    );
    assert.deepEqual(
      writeHwpCellField(row.name, decoded.nativeCellFieldData),
      bytes,
      row.id,
    );
  }
}

/**
 * Find an actual cell in the generated native document without assuming its anchor paragraphs.
 *
 * Surrounding native control paragraphs remain independent from the real cell.
 * @param {JSONContent} node - Actual parsed source branch.
 * @returns {JSONContent|undefined} First actual native cell, if present.
 * @example
 * const cell=findCell(parsed.doc);
 */
function findCell(node: JSONContent): JSONContent | undefined {
  if (node.type === "tableCell" || node.type === "tableHeader") return node;
  for (/** Nested source order is traversed without constructing a replacement expected cell. */ const child of node.content ??
    []) {
    /** An absent branch must not masquerade as a native source cell. */
    const found = findCell(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * Preserve field identity across genuine HWP/HWPX conversions and changed-content saves.
 *
 * Literal names, explicit clearing, XML punctuation and supplementary Unicode
 * survive actual writers. Text edits force imported shells to regenerate.
 * @async
 * @returns {Promise<void>} Resolves after every native identity and content assertion.
 * @throws {Error} If any name is lost, reused after clearing or confused with cell text.
 * @example
 * // Editing visible text never changes the destination cell's field identity.
 */
async function verifyNativeFieldConversions(): Promise<void> {
  for (/** Original independent cases and XML-sensitive names exercise both native formats. */ const name of [
    ...oracle.rows.map(originalName),
    'A<&>"🙂',
    "\ufeffFIELD",
  ]) {
    /** The generated table has authored text independent from its field name. */
    const input = {
      doc: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    attrs: { nativeCellFieldName: name },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "VISIBLE ORIGINAL" }],
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
    /** Actual native binary output supplies the first independent imported source. */
    const binary = readHwp(writeHwp(input)),
      binaryCell = findCell(binary.doc)!;
    assert.equal(binaryCell.attrs!.nativeCellFieldName, name);
    binaryCell.content![0].content![0].text = "EDITED NATIVE SOURCE";
    /** Real changed-content conversion cannot fall back to an unchanged original archive. */
    const xml = await readHwpx(await writeHwpx(binary)),
      xmlCell = findCell(xml.doc)!;
    assert.equal(xmlCell.attrs!.nativeCellFieldName, name);
    assert.equal(xmlCell.content![0].content![0].text, "EDITED NATIVE SOURCE");
    xmlCell.attrs!.nativeCellFieldName = "REASSIGNED";
    xmlCell.content![0].content![0].text = "SECOND EDIT";
    /** Updating an imported source name must replace its retained old native XML attribute. */
    const renamed = await readHwpx(await writeHwpx(xml));
    assert.equal(
      findCell(renamed.doc)!.attrs!.nativeCellFieldName,
      "REASSIGNED",
    );
    /** An explicit empty name must clear the old imported native field. */
    findCell(renamed.doc)!.attrs!.nativeCellFieldName = "";
    assert.equal(
      findCell(readHwp(writeHwp(renamed)).doc)!.attrs!.nativeCellFieldName,
      "",
    );
    assert.equal(
      findCell((await readHwpx(await writeHwpx(renamed))).doc)!.attrs!
        .nativeCellFieldName,
      "",
    );
  }
}

/**
 * Read one literal original field name for the native conversion matrix.
 *
 * The independent original byte fixture remains the source of these names.
 * @param {{name:string}} row - Actual original named-cell observation.
 * @returns {string} Literal original name.
 * @example
 * originalName({name:'FORHAN_FIELD_A'}); // 'FORHAN_FIELD_A'
 */
function originalName(row: { name: string }): string {
  return row.name;
}

/**
 * Retain unknown cell extensions and reject malformed or destructive name edits.
 *
 * Unknown bytes stay distinct from an unnamed field. Known name edits retain
 * unrelated trailing bytes; clearing cannot silently destroy that extra data.
 * @returns {void} Completes opaque-data and Unicode validity assertions.
 * @throws {Error} If invalid metadata is accepted or original bytes are discarded.
 * @example
 * // A future opaque extension remains byte-identical during an unchanged HWP save.
 */
function verifyOpaqueCellFields(): void {
  /** Unsupported original extension bytes are retained without inventing a readable name. */
  const unknown = new Uint8Array([9, 8, 7, 6]),
    decoded = readHwpCellField(unknown);
  assert.equal(decoded.nativeCellFieldName, null);
  assert.deepEqual(
    writeHwpCellField(null, decoded.nativeCellFieldData),
    unknown,
  );
  assert.throws(
    /**
     * Attempt to rename an opaque original field.
     *
     * Unknown source bytes must remain independently distinguishable.
     * @returns {Uint8Array} No result because this edit must be rejected.
     * @throws {TypeError} If the unknown original layout cannot be renamed.
     * @example
     * // The assertion requires an actual TypeError.
     */
    () => writeHwpCellField("OTHER", decoded.nativeCellFieldData),
    TypeError,
  );
  /** Extra source bytes following a known name survive an actual renamed extension. */
  const known = writeHwpCellField("A");
  known[known.length - 1] = 7;
  /** Original known trailing bytes remain independently inspectable. */
  const data = Buffer.from(known).toString("hex"),
    renamed = writeHwpCellField("RENAMED", data);
  assert.equal(renamed[renamed.length - 1], 7);
  assert.equal(readHwpCellField(renamed).nativeCellFieldName, "RENAMED");
  assert.throws(
    /**
     * Attempt to clear a field with unrelated nonzero trailing data.
     *
     * Removing the name must not silently destroy retained native metadata.
     * @returns {Uint8Array} No result because this edit must be rejected.
     * @throws {TypeError} If clearing would erase unrelated original bytes.
     * @example
     * // Original trailing byte seven remains protected.
     */
    () => writeHwpCellField("", data),
    TypeError,
  );
  assert.throws(
    /**
     * Attempt to serialize malformed hexadecimal metadata.
     *
     * Invalid text must not become a truncated empty native extension.
     * @returns {Uint8Array} No result because invalid metadata must be rejected.
     * @throws {TypeError} If hexadecimal source metadata is malformed.
     * @example
     * // The literal invalid source is "zz".
     */
    () => writeHwpCellField("A", "zz"),
    TypeError,
  );
  for (/** Invalid XML scalars and lone UTF-16 surrogates cannot be changed silently. */ const value of [
    "\0",
    "\u0002",
    "\ud800",
    "\udfff",
    "\uffff",
  ])
    assert.throws(
      /**
       * Validate one exact malformed original name.
       *
       * Invalid scalars cannot silently become replacement characters.
       * @returns {string} No result because this source must be rejected.
       * @throws {TypeError} If the original scalar sequence is invalid.
       * @example
       * // A lone high surrogate remains an error.
       */
      () => cellFieldName(value),
      TypeError,
    );
  assert.throws(
    /**
     * Validate a name beyond the native sixteen-bit length field.
     *
     * The writer must reject overflow before serializing truncated metadata.
     * @returns {string} No result because this name exceeds native limits.
     * @throws {RangeError} If the UTF-16 name length is too large.
     * @example
     * // 65536 code units cannot fit an unsigned sixteen-bit count.
     */
    () => cellFieldName("A".repeat(65536)),
    RangeError,
  );
}

test(
  "cell field names match independent original native bytes",
  verifyOriginalCellFields,
);
test(
  "cell field identity survives changed HWP and HWPX conversions",
  verifyNativeFieldConversions,
);
test(
  "unknown cell field extensions and invalid names remain distinguishable",
  verifyOpaqueCellFields,
);
