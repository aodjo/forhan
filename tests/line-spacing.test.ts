import test from "node:test";
import assert from "node:assert/strict";
import {
  lineSpacingState,
  parseLineSpacingInput,
  stepLineSpacing,
  fixedLineSpacingMaximum,
} from "../src/line-spacing.ts";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";

/**
 * Preserve native quick-entry semantics without losing hidden source precision.
 *
 * Independent native observations establish five-percent steps, integer-point
 * snapping, zero entry and fractional-percent truncation. Untouched physical
 * and out-of-entry-range source must survive focus/blur without normalization.
 * @returns {void} Completes after native numeric and source-retention assertions.
 * @throws {Error} If entry rules or untouched-source precision regress.
 * @example
 * // An idle 18.3 display still represents 18.25pt until genuinely edited.
 */
function verifyLineEntry(): void {
  assert.equal(lineSpacingState("18.25pt").display, "18.3");
  assert.equal(lineSpacingState("24px").value, 18);
  assert.equal(
    parseLineSpacingInput("18.3", lineSpacingState("18.25pt"), false),
    "18.25pt",
  );
  assert.equal(
    parseLineSpacingInput("18.3", lineSpacingState("18.25pt")),
    "18.3pt",
  );
  assert.equal(parseLineSpacingInput("175.5", lineSpacingState("1.6")), "1.75");
  assert.equal(parseLineSpacingInput("0", lineSpacingState("1.6")), "0");
  assert.equal(parseLineSpacingInput("0", lineSpacingState("18.25pt")), "0pt");
  assert.equal(stepLineSpacing(lineSpacingState("1.63"), 1), "1.68");
  assert.equal(stepLineSpacing(lineSpacingState("1.63"), -1), "1.58");
  assert.equal(stepLineSpacing(lineSpacingState("18.25pt"), 1), "19pt");
  assert.equal(stepLineSpacing(lineSpacingState("18.25pt"), -1), "18pt");
  assert.equal(stepLineSpacing(lineSpacingState("18pt"), -1), "17pt");
  assert.equal(stepLineSpacing(lineSpacingState("0%"), -1), "0");
  assert.equal(stepLineSpacing(lineSpacingState("500pt", 500), 1), "500pt");
  assert.equal(
    parseLineSpacingInput("501", lineSpacingState("18pt", 657.62)),
    "501pt",
  );
  assert.equal(
    fixedLineSpacingMaximum({
      width: 210,
      height: (84186 * 25.4) / 7200,
      marginTop: (5668 * 25.4) / 7200,
      marginBottom: (4252 * 25.4) / 7200,
      header: (4252 * 25.4) / 7200,
      footer: (4252 * 25.4) / 7200,
      marginLeft: 30,
      marginRight: 30,
    }),
    657.62,
  );
  assert.equal(
    parseLineSpacingInput("750", lineSpacingState("7.5"), false),
    "7.5",
  );
  assert.equal(
    parseLineSpacingInput("7.5", lineSpacingState("1.5em"), false),
    "1.5em",
  );
  assert.equal(lineSpacingState("1.5em").mode, "fixed");
  assert.equal(lineSpacingState("1.5em").display, "7.5");
  assert.equal(stepLineSpacing(lineSpacingState("1.5em"), 1), "8pt");
  assert.equal(stepLineSpacing(lineSpacingState("1.5em"), -1), "7pt");
  for (/** Invalid drafts must fail before producing any native formatting value. */ const draft of [
    "",
    "-1",
    "501",
    "1e2",
    "175pt",
    "NaN",
    "175%",
    "12garbage",
  ])
    assert.throws(
      /**
       * Validate one malformed or out-of-range native numeric draft.
       *
       * A rejected draft cannot become a paragraph edit or silently rounded bound.
       * @returns {string} Never returns for this invalid input.
       * @example
       * // 501% does not silently become 500%.
       */
      () => parseLineSpacingInput(draft, lineSpacingState("1.6")),
      RangeError,
    );
}

/**
 * Keep zero proportional and fixed spacing through both real native formats.
 *
 * Independent editor attributes are serialized and parsed through HWP binary
 * and HWPX XML paths. Re-exported results must retain the original native mode
 * instead of falling back to default 160% or confusing fixed zero with percent.
 * @async
 * @returns {Promise<void>} Resolves when both native formats retain every zero-mode case.
 * @throws {Error} If either native reader discards a real zero line-spacing definition.
 * @example
 * // HWP zero-percent and zero-point paragraphs remain distinct after reload.
 */
async function verifyZeroSpacing(): Promise<void> {
  for (/** Different original line-spacing modes include native zero definitions. */ const source of [
    "0",
    "0%",
    "0pt",
    "18.25pt",
    "1.63",
    "1.5em",
  ]) {
    /** Authored paragraph contains visible text even when its line box has zero height. */
    const payload = {
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { lineHeight: source },
            content: [{ type: "text", text: "줄 간격의 네이티브 보존" }],
          },
        ],
      },
    };
    for (/** Independently encoded binary and XML representations exercise both readers. */ const format of [
      "hwp",
      "hwpx",
    ] as const) {
      /** Actual native container bytes, not a renamed JSON fixture. */
      const bytes =
        format === "hwp" ? writeHwp(payload) : await writeHwpx(payload);
      /** Imported attribute retains the mode needed by editor and later native writes. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      /** Semantic mode/value comparison permits native equivalent percentage spelling. */
      const actual = lineSpacingState(
          String(parsed.doc.content![0].attrs!.lineHeight),
        ),
        expected = lineSpacingState(source);
      assert.equal(actual.mode, expected.mode, `${format}: ${source}`);
      assert.equal(actual.value, expected.value, `${format}: ${source}`);
      /** A second native encode/decode cannot restore the old default-spacing fallback. */
      const rewritten =
        format === "hwp"
          ? readHwp(writeHwp(parsed))
          : await readHwpx(await writeHwpx(parsed));
      assert.equal(
        lineSpacingState(String(rewritten.doc.content![0].attrs!.lineHeight))
          .value,
        expected.value,
      );
    }
  }
}
test(
  "native quick spacing retains source precision, integer percent input and measured steps",
  verifyLineEntry,
);
test(
  "zero proportional and physical spacing retain distinct native modes in HWP and HWPX",
  verifyZeroSpacing,
);
