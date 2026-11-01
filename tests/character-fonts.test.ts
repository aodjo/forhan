import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { characterFonts, characterFontCss } from "../src/character-fonts.ts";
import { characterMetrics } from "../src/character-metrics.ts";
import {
  CharacterLanguageDraft,
  editCharacterLanguages,
} from "../src/ui/character-language.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/** Distinct literal face names expose native language-table collapse. */
export const LANGUAGE_FONTS = [
  "함초롬바탕",
  "Arial",
  "바탕",
  "돋움",
  "굴림",
  "맑은 고딕",
  "Times New Roman",
];

/**
 * Verify native fonts survive both formats and a retained-source edit.
 *
 * Visible text covers six ordinary Unicode script slots while the unused user
 * font still remains in every source table. HWPX IDs are then deliberately made
 * identical across scripts to expose cross-language reference mistakes.
 * @async
 * @returns {Promise<void>} Resolves after independent and retained native font checks.
 * @throws {Error} If a native language face or active rendered family changes.
 * @example
 * // Latin ID zero and Hangul ID zero can name different native fonts.
 */
async function verifyNativeLanguageFonts(): Promise<void> {
  /** Native font-only document has no percentage override to trigger script splitting. */
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "가A漢あΩ※",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  fontFamily: LANGUAGE_FONTS[0],
                  nativeCharacterFonts: LANGUAGE_FONTS,
                },
              },
            ],
          },
        ],
      },
    ],
  };
  /** Independent XML export also supplies a retained-source fixture. */
  const xmlBytes = await writeHwpx({ doc });
  for (
    /** Public serializer output reconstructed through the corresponding independent reader. */
  const result of [readHwp(writeHwp({ doc })), await readHwpx(xmlBytes)]) {
    /** Active script slots in source order. */
    const slots = [0, 1, 2, 3, 4, 5];
    for (let index = 0; index < slots.length; index++) {
      /** Reconstructed active face retains the entire independent language table. */
      const attrs = result.doc.content![0].content![index].marks!.find(
        /**
         * Find the native character-style mark.
         *
         * Other emphasis or hyperlink marks have independent semantics.
         * @param {NonNullable<JSONContent['marks']>[number]} mark - Decoded native mark.
         * @returns {boolean} Whether it contains character attributes.
         * @example
         * // The textStyle mark contains all seven retained faces.
         */
        (mark: NonNullable<JSONContent["marks"]>[number]) =>
          mark.type === "textStyle",
      )!.attrs!;
      assert.deepEqual(attrs.nativeCharacterFonts, LANGUAGE_FONTS);
      assert.equal(attrs.fontFamily, LANGUAGE_FONTS[slots[index]]);
    }
  }
  /** Editable retained XML payload. */
  const retained = await readHwpx(xmlBytes);
  retained.doc.content![0].content![0].text = "나";
  /** Retained source export must update text without merging unused language references. */
  const edited = await readHwpx(
    await writeHwpx({ doc: retained.doc, source: retained.source }),
  );
  assert.deepEqual(
    edited.doc.content![0].content![0].marks![0].attrs!.nativeCharacterFonts,
    LANGUAGE_FONTS,
  );
  /** Source archive whose per-language font zero deliberately differs. */
  const archive = unzipSync(xmlBytes);
  /** Native header with independently scoped face tables. */
  let header = strFromU8(archive["Contents/header.xml"]);
  let slot = 0;
  header = header
    .replace(
      /<hh:fontface\b[^>]*>[\s\S]*?<\/hh:fontface>/g,
      /**
       * Retain exactly one zero-ID font inside each independent source language table.
       *
       * The test deliberately gives equal numeric IDs different native names.
       * @returns {string} Independent font table using local ID zero.
       * @example
       * // Hangul zero names 함초롬바탕 while Latin zero names Arial.
       */
      () =>
        `<hh:fontface lang="${["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"][slot]}" fontCnt="1"><hh:font id="0" face="${LANGUAGE_FONTS[slot++]}" type="TTF"/></hh:fontface>`,
    )
    .replace(
      /<hh:fontRef\b[^>]*\/>/g,
      '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>',
    );
  archive["Contents/header.xml"] = strToU8(header);
  /** Native XML reader must resolve font zero against the correct language table. */
  const collision = await readHwpx(zipSync(archive));
  assert.deepEqual(
    collision.doc.content![0].content![0].marks![0].attrs!.nativeCharacterFonts,
    LANGUAGE_FONTS,
  );
}
test(
  "native language fonts retain unused faces and independent HWPX font identifiers",
  verifyNativeLanguageFonts,
);

/**
 * Verify language draft precedence, ownership and representative overrides.
 *
 * Untouched source runs keep their own metrics and fonts. Scoped edits survive
 * selector changes, while later representative edits intentionally affect all scripts.
 * @returns {void} Completes pure draft and native representation checks.
 * @throws {Error} If an edit loses its scope, precedence or source ownership.
 * @example
 * // A later Latin-only tracking edit overrides only Latin after a representative edit.
 */
function verifyScopedLanguageDraft(): void {
  /** Original mixed-script source with independently owned arrays. */
  const attrs = {
    fontFamily: "함초롬바탕",
    nativeCharacterFonts: LANGUAGE_FONTS,
    nativeCharacterMetrics: characterMetrics(null),
  };
  /** Isolated draft defaults its representative readout to Hangul. */
  const draft = new CharacterLanguageDraft(attrs, 0);
  draft.set("spacing", 1, 20);
  draft.set("relativeSize", 0, 80);
  draft.set("family", 1, "Times New Roman");
  assert.equal(draft.value("spacing", null), 0);
  assert.equal(draft.value("spacing", 1), 20);
  assert.equal(draft.value("family", 1), "Times New Roman");
  assert.equal(draft.value("family", 0), "함초롬바탕");
  assert.deepEqual(attrs.nativeCharacterMetrics.spacing, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(LANGUAGE_FONTS[1], "Arial");
  draft.set("spacing", null, -10);
  draft.set("spacing", 1, 15);
  assert.deepEqual(
    characterMetrics(draft.preview().nativeCharacterMetrics).spacing,
    [-10, 15, -10, -10, -10, -10, -10],
  );
  /** A second selected run keeps its independent relative sizes through the same font edit. */
  const other = editCharacterLanguages(
    {
      fontFamily: "Arial",
      nativeCharacterLanguage: 1,
      nativeCharacterMetrics: {
        ...characterMetrics(null),
        relativeSize: [110, 120, 130, 140, 150, 160, 170],
      },
    },
    [{ language: 1, key: "family", value: "바탕" }],
  );
  assert.equal(other.fontFamily, "바탕");
  assert.deepEqual(
    characterMetrics(other.nativeCharacterMetrics).relativeSize,
    [110, 120, 130, 140, 150, 160, 170],
  );
  assert.throws(
    /**
     * Reject an incomplete language font table.
     *
     * Missing slots cannot silently reuse another script's font.
     * @returns {string[]} Never returns because the table is invalid.
     * @throws {RangeError} Always for this incomplete table.
     * @example
     * // A single name cannot stand in for seven explicit entries.
     */
    () => characterFonts(["Arial"]),
    RangeError,
  );
  assert.throws(
    /**
     * Reject control characters in a native font name.
     *
     * Literal face metadata must remain representable as native font-table text.
     * @returns {string[]} Never returns because the name is invalid.
     * @throws {RangeError} Always for this invalid face.
     * @example
     * // A newline cannot be embedded in a native face name.
     */
    () => characterFonts(["A", "B", "C", "D", "E", "F", "bad\nname"]),
    RangeError,
  );
  assert.equal(characterFontCss('A";color:red;"'), '"A\\";color:red;\\""');
}
test(
  "scoped native character drafts preserve ordered representative and language edits",
  verifyScopedLanguageDraft,
);
