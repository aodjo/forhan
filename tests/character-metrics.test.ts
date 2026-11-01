import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import {
  characterMetrics,
  characterLanguage,
  characterMetricInputError,
  type CharacterMetrics,
} from "../src/character-metrics.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/** Distinct language values expose default replacement, signedness and language-order mistakes. */
export const LANGUAGE_METRICS: CharacterMetrics = {
  ratio: [80, 90, 110, 120, 130, 140, 150],
  spacing: [-20, 15, -5, 10, 0, 25, -35],
  relativeSize: [80, 110, 120, 90, 100, 130, 140],
  offset: [-30, 20, 0, 10, -5, 15, -20],
};

/**
 * Collect actual native text-style definitions from a reconstructed document.
 *
 * Recursion includes text inside paragraphs and nested native structures while
 * leaving the original decoded node and mark arrays untouched.
 * @param {JSONContent} node - Native document subtree to inspect.
 * @returns {JSONContent[]} Text nodes whose measurements can be checked independently.
 * @example
 * metricTextNodes(readHwp(bytes).doc); // Native text fragments in source order.
 */
function metricTextNodes(node: JSONContent): JSONContent[] {
  /** Source-order text fragments accumulated from this subtree. */
  const result: JSONContent[] = node.type === "text" ? [node] : [];
  for (/** Decoded native child, including any nested table paragraphs. */ const child of node.content ||
    [])
    result.push(...metricTextNodes(child));
  return result;
}

/**
 * Retain all native language measurements through both serializers and edits.
 *
 * Different values for every native language expose array loss and signed-byte
 * mistakes. A second HWPX export changes text against retained source XML, so a
 * byte-preserving shortcut cannot hide missing generated character attributes.
 * @async
 * @returns {Promise<void>} Resolves when both formats and retained-source edits preserve every array.
 * @throws {Error} If script selection, signed values or independent native definitions change.
 * @example
 * // Hangul spacing -20 and Latin spacing 15 remain distinct after changing text.
 */
async function verifyNativeCharacterArrays(): Promise<void> {
  /** Mixed scripts exercise six native slots without splitting the final surrogate pair. */
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "가A漢あΩ★😀",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  fontSize: "10pt",
                  nativeCharacterMetrics: LANGUAGE_METRICS,
                },
              },
            ],
          },
        ],
      },
    ],
  };
  for (/** Decoded native file checked through each independent public reader. */ const parsed of [
    readHwp(writeHwp({ doc })),
    await readHwpx(await writeHwpx({ doc })),
  ]) {
    /** Text fragments reflect the native language slot used by the source character. */
    const nodes = metricTextNodes(parsed.doc);
    assert.equal(
      nodes
        .map(
          /**
           * Recover source text after native script-specific run reconstruction.
           *
           * This detects duplication, missing characters and split surrogate pairs.
           * @param {JSONContent} node - One reconstructed native text fragment.
           * @returns {string} Literal decoded text.
           * @example
           * // Joining every fragment restores the complete original mixed-script string.
           */
          (node) => node.text || "",
        )
        .join(""),
      "가A漢あΩ★😀",
    );
    for (/** Native text fragment with an independently resolved language slot. */ const node of nodes) {
      /** Actual text-style mark decoded from the native character definition. */
      const mark = node.marks?.find(
        /**
         * Locate the native character definition attached to the current text run.
         *
         * Emphasis and hyperlink marks do not replace measurement attributes.
         * @param {NonNullable<JSONContent['marks']>[number]} value - Decoded text mark.
         * @returns {boolean} Whether the mark holds character-style attributes.
         * @example
         * // A textStyle mark contains the complete native measurement arrays.
         */
        (value) => value.type === "textStyle",
      );
      assert.deepEqual(mark?.attrs?.nativeCharacterMetrics, LANGUAGE_METRICS);
      assert.equal(
        mark?.attrs?.nativeCharacterLanguage,
        characterLanguage(node.text!),
      );
    }
  }
  /** Retained native XML source is used while changing an actual text run. */
  const retained = await readHwpx(await writeHwpx({ doc }));
  retained.doc.content![0].content![0].text = "나";
  /** Changed source export must generate a usable new native character reference. */
  const rewritten = await readHwpx(
    await writeHwpx({ doc: retained.doc, source: retained.source }),
  );
  assert.deepEqual(
    metricTextNodes(rewritten.doc)[0].marks![0].attrs!.nativeCharacterMetrics,
    LANGUAGE_METRICS,
  );
}
test(
  "native character language arrays survive HWP, HWPX and retained-source text edits",
  verifyNativeCharacterArrays,
);

/**
 * Reject native percentage overflow and distinguish entry limits from storage.
 *
 * Signed percentages must never wrap to another value. Imported values within
 * native byte capacity may remain unchanged even outside interactive bounds.
 * @returns {void} Completes native-array ownership and validation assertions.
 * @throws {Error} If overflow is accepted or source arrays are mutated.
 * @example
 * // Imported spacing 100 remains unchanged, but a new 100 percent entry is rejected.
 */
function verifyCharacterMetricBounds(): void {
  /** Fresh measurements must not share mutable array ownership with source data. */
  const copy = characterMetrics(LANGUAGE_METRICS);
  copy.spacing[0] = 50;
  assert.equal(LANGUAGE_METRICS.spacing[0], -20);
  assert.equal(characterMetricInputError("spacing", "-20", 0), "");
  assert.equal(characterMetricInputError("spacing", "100", 100), "");
  assert.notEqual(characterMetricInputError("spacing", "100", 0), "");
  assert.notEqual(characterMetricInputError("spacing", "1.5", 0), "");
  assert.notEqual(characterMetricInputError("relativeSize", "", 100), "");
  assert.equal(characterMetricInputError("offset", "-30", 0), "");
  assert.throws(
    /**
     * Attempt to resolve one spacing value outside signed byte capacity.
     *
     * Rejection prevents modulo conversion during native HWP serialization.
     * @returns {CharacterMetrics} Measurements only if the overflow check fails.
     * @throws {RangeError} Because 128 cannot be represented as a signed byte.
     * @example
     * // Invoked by assert.throws to verify explicit rejection.
     */
    () => characterMetrics({ spacing: [128, 0, 0, 0, 0, 0, 0] }),
    RangeError,
  );
}
test(
  "native character percentages preserve ownership and reject signed overflow",
  verifyCharacterMetricBounds,
);
