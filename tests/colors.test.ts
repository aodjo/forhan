import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import {
  normalizeColor,
  colorRef,
  colorToHsv,
  hsvToColor,
  colorToHsl,
  hslToColor,
} from "../src/colors.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/**
 * Verify native color normalization and spectrum coordinates against known RGB values.
 *
 * Opaque white remains distinct from no shading. Explicit translucent colors
 * cannot be silently flattened into a different native document color.
 * @returns {void} Completes standard RGB, alpha and color-model assertions.
 * @throws {Error} If channel ordering, named colors or known spectrum points change.
 * @example
 * // Native low-byte-red #123456 encodes as 0x563412.
 */
function verifyNativeColorMath(): void {
  assert.equal(normalizeColor("papayawhip"), "#ffefd5");
  assert.equal(normalizeColor("#abc"), "#aabbcc");
  assert.equal(normalizeColor("#ffff", true), "#ffffff");
  assert.equal(normalizeColor("#fff0", true), null);
  assert.equal(normalizeColor("rgb(100% 0% 0% / 100%)"), "#ff0000");
  assert.equal(normalizeColor("rgba(255,255,255,0)", true), null);
  assert.equal(normalizeColor("transparent", true), null);
  assert.equal(normalizeColor("none", true), null);
  assert.equal(normalizeColor("#ffffff", true), "#ffffff");
  assert.equal(colorRef("#123456"), 0x563412);
  assert.deepEqual(colorToHsv("#ff0000"), [0, 100, 100]);
  assert.deepEqual(colorToHsv("#00ff00"), [120, 100, 100]);
  assert.deepEqual(colorToHsl("#0000ff"), [240, 100, 50]);
  assert.equal(hsvToColor(0, 50, 50), "#804040");
  assert.equal(hslToColor(0, 50, 50), "#bf4040");
  assert.equal(hsvToColor(360, 100, 100), "#ff0000");
  assert.equal(hslToColor(240, 100, 50), "#0000ff");
  for (
    /** Explicit invalid syntax or unrepresentable native alpha value. */
    const value of [
    "#12",
    "rgb(256,0,0)",
    "rgb(NaN,0,0)",
    "rgba(255,0,0,0.5)",
    "#ff000080",
  ])
    assert.throws(
      /**
       * Attempt to normalize one invalid native color.
       *
       * Rejection preserves an explicit failure instead of channel wrapping or alpha loss.
       * @returns {string | null} Color only if the invalid-input guard fails.
       * @throws {RangeError} Because the supplied color cannot be encoded natively.
       * @example
       * // Invoked by assert.throws for each invalid or translucent color.
       */
      () => normalizeColor(value, true),
      RangeError,
    );
}
test(
  "native colors distinguish no shading from white and use consistent RGB/HSL/HSV conversion",
  verifyNativeColorMath,
);

/**
 * Preserve foreground and shading colors in independently generated native files.
 *
 * Black, white, named/RGB colors and absent/transparent shading are exercised
 * separately. Public native readers inspect the actual serialized definitions.
 * @async
 * @returns {Promise<void>} Resolves after both file formats retain every color state.
 * @throws {Error} If white becomes absent or an opaque fill is replaced by a default.
 * @example
 * // Explicit #ffffff shading survives both native serializers as white.
 */
async function verifyNativeCharacterShading(): Promise<void> {
  for (
    /** Source shading and independently specified native background expectation. */
    const [
    value,
    expected,
  ] of [
    [undefined, undefined],
    ["transparent", undefined],
    ["rgba(255,255,255,0)", undefined],
    ["#fff", "#ffffff"],
    ["#000", "#000000"],
    ["#4a60d3", "#4a60d3"],
    ["papayawhip", "#ffefd5"],
    ["rgb(10 20 30)", "#0a141e"],
  ] as const) {
    /** One native text run retains both its opaque foreground and independent shading state. */
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "음영 색 보존",
              marks: [
                {
                  type: "textStyle",
                  attrs: { color: "rgb(18 52 86)", backgroundColor: value },
                },
              ],
            },
          ],
        },
      ],
    };
    for (
      /** Actual native definition reconstructed independently from the encoded bytes. */
      const parsed of [
      readHwp(writeHwp({ doc })),
      await readHwpx(await writeHwpx({ doc })),
    ]) {
      /** First text style exposes the native stored foreground and background values. */
      const attrs = parsed.doc.content![0].content![0].marks![0].attrs!;
      assert.equal(attrs.color, "#123456");
      assert.equal(attrs.backgroundColor, expected);
    }
  }
  /** Retained-source HWPX must preserve shading while an unrelated text edit rebuilds its run. */
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "원본",
            marks: [{ type: "textStyle", attrs: { backgroundColor: "#fff" } }],
          },
        ],
      },
    ],
  };
  /** Actual package/source pair is used for a changed export rather than a byte-preserving shortcut. */
  const retained = await readHwpx(await writeHwpx({ doc }));
  retained.doc.content![0].content![0].text = "수정";
  /** Reopened edited package must still reference explicit white character shading. */
  const changed = await readHwpx(
    await writeHwpx({ doc: retained.doc, source: retained.source }),
  );
  assert.equal(
    changed.doc.content![0].content![0].marks![0].attrs!.backgroundColor,
    "#ffffff",
  );
}
test(
  "HWP and HWPX preserve black, white, opaque and absent character shading",
  verifyNativeCharacterShading,
);

/**
 * Reject unsupported native shading alpha at both public export boundaries.
 *
 * The browser may display alpha, but neither native character color field can
 * retain it. Export must fail instead of silently replacing it with white/none.
 * @async
 * @returns {Promise<void>} Resolves after both serializers explicitly reject partial alpha.
 * @throws {Error} If either native writer drops the alpha component.
 * @example
 * // rgba(255,0,0,0.5) cannot become opaque red in an exported native document.
 */
async function verifyNativeAlphaRejection(): Promise<void> {
  /** Authored translucent shading cannot fit native character COLORREF storage. */
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "반투명",
            marks: [
              {
                type: "textStyle",
                attrs: { backgroundColor: "rgba(255,0,0,0.5)" },
              },
            ],
          },
        ],
      },
    ],
  };
  assert.throws(
    /**
     * Serialize unsupported alpha through the binary native exporter.
     *
     * No native output may claim to retain an unrepresentable character fill.
     * @returns {Uint8Array} Bytes only if the export validation fails.
     * @throws {RangeError} Because native character shading has no partial alpha.
     * @example
     * // Invoked by assert.throws at the public HWP export boundary.
     */
    () => writeHwp({ doc }),
    RangeError,
  );
  await assert.rejects(
    /**
     * Serialize the same unsupported alpha through the XML-package exporter.
     *
     * Both native formats enforce the same character-color representation.
     * @returns {Promise<Uint8Array>} Package only if validation fails.
     * @throws {RangeError} Because native shading cannot retain partial alpha.
     * @example
     * // Invoked by assert.rejects at the public HWPX export boundary.
     */
    () => writeHwpx({ doc }),
    RangeError,
  );
}
test(
  "both native exporters reject partial shading alpha instead of flattening it",
  verifyNativeAlphaRejection,
);
