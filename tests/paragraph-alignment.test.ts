import test from "node:test";
import assert from "node:assert/strict";
import CFB from "cfb";
import { inflateSync, unzipSync, strFromU8 } from "fflate";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp, parseHwpRecords } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/**
 * Preserve six independent native alignment modes in raw files and rewritten documents.
 *
 * Binary paragraph flags and explicit XML enumeration names are checked before
 * invoking the independent readers. Distribution modes cannot collapse to an
 * ordinary alignment merely because both readers share a normalization helper.
 * @async
 * @returns {Promise<void>} Resolves after raw encoding and native rewrite assertions.
 * @throws {Error} If either native format changes an alignment value or enum spelling.
 * @example
 * // split writes HWP value 5 and HWPX DISTRIBUTE_SPACE, then reopens as split.
 */
async function verifyNativeAlignments(): Promise<void> {
  for (/** Independent native values come from the published enum and observed native COM states. */
  const [alignment, raw, xml] of [
    ["justify", 0, "JUSTIFY"],
    ["left", 1, "LEFT"],
    ["right", 2, "RIGHT"],
    ["center", 3, "CENTER"],
    ["distribute", 4, "DISTRIBUTE"],
    ["split", 5, "DISTRIBUTE_SPACE"],
  ] as const) {
    /** A real authored paragraph has visible mixed-language content in every native container. */
    const payload = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: alignment },
            content: [{ type: "text", text: "AB CD 가나다 라마" }],
          },
        ],
      },
    };
    /** Raw native streams are checked before the independent import assertion. */
    const hwp = writeHwp(payload),
      container = CFB.read(hwp, { type: "buffer" }),
      info = CFB.find(container, "DocInfo");
    assert.ok(info?.content);
    /** Direct paragraph shape flags must contain the independently expected enum. */
    let found = false;
    for (/** Each native paragraph-shape record carries alignment bits two through four. */
    const record of parseHwpRecords(inflateSync(new Uint8Array(info.content))))
      if (
        record.tag === 25 &&
        ((new DataView(record.bytes.buffer, record.bytes.byteOffset).getUint32(
          0,
          true,
        ) >>>
          2) &
          7) ===
          raw
      )
        found = true;
    assert.ok(found, alignment + " raw HWP alignment");
    assert.equal(readHwp(hwp).doc.content![0].attrs!.textAlign, alignment);
    /** Native XML uses its actual schema enum rather than the editor command name. */
    const hwpx = await writeHwpx(payload),
      entries = unzipSync(hwpx),
      header = strFromU8(entries["Contents/header.xml"]);
    assert.ok(header.includes(`horizontal="${xml}"`));
    assert.equal(
      (await readHwpx(hwpx)).doc.content![0].attrs!.textAlign,
      alignment,
    );
    /** A real rewrite changes content so retained native-source bytes cannot hide a lossy writer. */
    const fromHwp = readHwp(hwp),
      fromHwpx = await readHwpx(hwpx);
    fromHwp.doc.content![0].content![0].text += " 편집";
    fromHwpx.doc.content![0].content![0].text += " 편집";
    assert.equal(
      readHwp(writeHwp(fromHwp)).doc.content![0].attrs!.textAlign,
      alignment,
    );
    assert.equal(
      (await readHwpx(await writeHwpx(fromHwpx))).doc.content![0].attrs!
        .textAlign,
      alignment,
    );
  }
}
test(
  "six native alignments retain raw binary/XML values and survive changed-content rewrites",
  verifyNativeAlignments,
);
