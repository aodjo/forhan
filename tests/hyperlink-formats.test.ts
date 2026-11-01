import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/**
 * Verify document links use the same safe destinations in both native formats.
 *
 * File URLs and relative paths must remain editable links rather than becoming
 * opaque HWP controls. Delimiters, Korean paths and URL query text round trip
 * literally; executable schemes must still fail document validation.
 * @async
 * @returns {Promise<void>} Resolves after both encoders preserve every safe target.
 * @throws {Error} If a destination changes or unsafe markup can be exported.
 * @example
 * // A relative Korean document path survives HWP and HWPX without network access.
 */
async function verifyPortableHyperlinkTargets(): Promise<void> {
  for (/** Destination accepted by the shared hyperlink dialog and document validator. */ const href of [
    "https://example.com/?a=한글&b=2",
    "file:///C:/문서/보고서.pdf",
    "../문서/보고서.hwpx",
    "#목차",
    "mailto:hello@example.com",
    "tel:+821012345678",
  ]) {
    /** Minimal document containing one explicitly styled hyperlink. */
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "연결",
              marks: [{ type: "link", attrs: { href } }, { type: "bold" }],
            },
          ],
        },
      ],
    };
    /** Independently parsed HWP binary output. */
    const hwp = readHwp(writeHwp({ doc }));
    /** Independently parsed XML package output. */
    const hwpx = await readHwpx(await writeHwpx({ doc }));
    assert.ok(JSON.stringify(hwp.doc).includes(JSON.stringify(href)));
    assert.ok(JSON.stringify(hwpx.doc).includes(JSON.stringify(href)));
  }
  /** Rejected link payload that must never reach a native field serializer. */
  const unsafe: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "실행 금지",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ],
  };
  /**
   * Attempt to serialize the rejected document through the binary writer.
   *
   * Supplies a deferred operation so the assertion can inspect its error.
   * @returns {Uint8Array} Encoded bytes only if validation incorrectly succeeds.
   * @throws {Error} Expected because executable hyperlink schemes are invalid.
   * @example
   * assert.throws(writeUnsafe);
   */
  function writeUnsafe(): Uint8Array {
    return writeHwp({ doc: unsafe });
  }
  assert.throws(writeUnsafe);
  await assert.rejects(writeHwpx({ doc: unsafe }));
}

test(
  "safe hyperlink destinations round trip across HWP and HWPX consistently",
  verifyPortableHyperlinkTargets,
);
