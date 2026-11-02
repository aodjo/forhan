import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { JSONContent } from "@tiptap/core";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwpx, writeHwpx } from "../src/formats/hwpx.ts";
import { geometryCells } from "./helpers/cell-geometry.ts";

/** One original source cell owns its address, spans and physical native distances. */
interface ResizedCell {
  row: number;
  column: number;
  colspan: number;
  rowspan: number;
  width: number;
  height: number;
  text: string;
}
/** Independently observed original numeric decisions cover real selections and both merge directions. */
const observations = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-cell-resize.json", import.meta.url),
    "utf8",
  ),
) as {
  rows: {
    scope: string;
    id: string;
    before: ResizedCell[];
    after: ResizedCell[];
  }[];
};

/**
 * Author native source geometry without copying an original document or binary.
 *
 * Each cell stores its independently observed total width and true minimum
 * height. Logical addresses and spans determine which rows own real cells.
 * @param {ResizedCell[]} cells - Literal original owning-cell measurements.
 * @returns {JSONContent} Independently authored editable source with original geometry.
 * @example
 * resizedSource(observations.rows[0].after);
 */
function resizedSource(cells: ResizedCell[]): JSONContent {
  /** Merged cells create only their owning row's real source node. */
  const rows: JSONContent[] = [];
  for (/** No covered logical slot becomes a duplicate source cell. */ const cell of cells) {
    rows[cell.row] ??= { type: "tableRow", content: [] };
    rows[cell.row].content!.push({
      type: "tableCell",
      attrs: {
        colspan: cell.colspan,
        rowspan: cell.rowspan,
        colwidth: [cell.width / 75],
        nativeCellHeight: cell.height,
      },
      content: [
        { type: "paragraph", content: [{ type: "text", text: cell.text }] },
      ],
    });
  }
  return { type: "doc", content: [{ type: "table", content: rows }] };
}

/**
 * Check actual saved native source against independently observed original cells.
 *
 * Logical column agreement cannot substitute for the original owning-cell width.
 * Both physical merge directions retain their complete total measurements.
 * @param {JSONContent} doc - Actual parsed native output.
 * @param {ResizedCell[]} expected - Independent original owning-cell expectations.
 * @returns {void} Completes all actual source-owner, distance and span assertions.
 * @throws {Error} If any actual output loses an original source measurement.
 * @example
 * assertResizedSource(readHwp(bytes).doc,original.after);
 */
function assertResizedSource(doc: JSONContent, expected: ResizedCell[]): void {
  /** Only actual parsed cells supply the output under test. */
  const cells = geometryCells(doc);
  assert.equal(cells.length, expected.length);
  for (let index = 0; index < cells.length; index++) {
    /** Exact native units are reconstructed once after summing the actual source columns. */
    const actual = cells[index],
      original = expected[index];
    let width = 0;
    for (/** Native source precision survives fractional CSS widths. */ const part of actual
      .attrs?.colwidth ?? [])
      width += part * 75;
    assert.equal(Math.round(width), original.width);
    assert.equal(actual.attrs?.nativeCellHeight, original.height);
    assert.equal(actual.attrs?.colspan ?? 1, original.colspan);
    assert.equal(actual.attrs?.rowspan ?? 1, original.rowspan);
  }
}

/**
 * Preserve every observed native resize through actual binary/XML saves and conversions.
 *
 * Actual XML cellSz fields are inspected independently before their reader.
 * Later cross-format regeneration cannot normalize individual native widths.
 * @async
 * @returns {Promise<void>} Resolves after twenty-one actual original geometry outcomes retain their source.
 * @throws {Error} If a source width, height or merged ownership changes.
 * @example
 * // A horizontally merged5669-unit total remains5669 despite wider cells below it.
 */
async function verifyNativeResizeConversions(): Promise<void> {
  assert.equal(observations.rows.length, 21);
  for (/** Every literal original native numeric decision is independently exercised. */ const original of observations.rows) {
    /** Fresh authored source prevents an unchanged imported package from supplying the output. */
    const payload = { doc: resizedSource(original.after) },
      hwp = readHwp(writeHwp(payload)),
      bytes = await writeHwpx(payload),
      xml = strFromU8(unzipSync(bytes)["Contents/section0.xml"]),
      sizes = xml.match(/<hp:cellSz\b[^>]*>/gu) ?? [];
    assert.equal(sizes.length, original.after.length);
    for (let index = 0; index < sizes.length; index++) {
      assert.equal(
        Number(/\bwidth="(\d+)"/u.exec(sizes[index])?.[1]),
        original.after[index].width,
      );
      assert.equal(
        Number(/\bheight="(\d+)"/u.exec(sizes[index])?.[1]),
        original.after[index].height,
      );
    }
    /** Real native outputs and actual opposite-format conversions retain owning-cell dimensions. */
    const hwpx = await readHwpx(bytes);
    assertResizedSource(hwp.doc, original.after);
    assertResizedSource(hwpx.doc, original.after);
    assertResizedSource(
      (await readHwpx(await writeHwpx(hwp))).doc,
      original.after,
    );
    assertResizedSource(readHwp(writeHwp(hwpx)).doc, original.after);
  }
}

test(
  "actual native resize outcomes retain owning-cell width and height through both formats",
  verifyNativeResizeConversions,
);
