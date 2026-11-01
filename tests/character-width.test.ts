import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeGlyphAdvance,
  needsNativeWidth,
  stepNativeWidths,
  supportsNativeWidthRun,
} from "../src/character-width.ts";
import {
  characterMetrics,
  characterMetricInputError,
} from "../src/character-metrics.ts";
import { editCharacterLanguages } from "../src/ui/character-language.ts";
import { characterShadowCss } from "../src/character-shadow.ts";

/**
 * Verify native horizontal advance and independent vertical source settings.
 *
 * Controlled original M captures show width and tracking multiply intrinsic
 * glyph advance. Relative size and baseline offset remain separate source data.
 * @returns {void} Asserts native advance formulas and active-language detection.
 * @example
 * // Fifty-percent width and twenty-percent tracking produce sixty-percent advance.
 */
function verifyNativeWidthRules(): void {
  assert.equal(nativeGlyphAdvance(40, 50, 20), 24);
  assert.equal(nativeGlyphAdvance(40, 200, -20), 64);
  assert.equal(nativeGlyphAdvance(40, 0, 20), 0);
  assert.equal(needsNativeWidth({}), false);
  assert.equal(supportsNativeWidthRun('ABC 한글 漢字 あいう Ω'),true);
  assert.equal(supportsNativeWidthRun('العربية'),false);
  assert.equal(supportsNativeWidthRun('ABC עִבְרִית 123 한글'),true);
  assert.equal(supportsNativeWidthRun('\ufb2a\ufb2b'),true);
  assert.equal(supportsNativeWidthRun('עברית العربية'),false);
  assert.equal(supportsNativeWidthRun('हिन्दी'),false);
  /** All seven original arrays remain available independently of the active language. */
  const metrics = characterMetrics(null);
  metrics.ratio[1] = 50;
  assert.equal(
    needsNativeWidth({
      nativeCharacterMetrics: metrics,
      nativeCharacterLanguage: 0,
    }),
    false,
  );
  assert.equal(
    needsNativeWidth({
      nativeCharacterMetrics: metrics,
      nativeCharacterLanguage: 1,
    }),
    true,
  );
  metrics.spacing[0] = 20;
  assert.equal(
    needsNativeWidth({
      nativeCharacterMetrics: metrics,
      nativeCharacterLanguage: 0,
    }),
    true,
  );
  assert.equal(
    characterMetricInputError("ratio", "49", 100),
    "장평은 50~200% 범위의 정수로 입력하세요.",
  );
  assert.equal(characterMetricInputError("ratio", "50", 100), "");
  assert.equal(characterMetricInputError("ratio", "200", 100), "");
  assert.equal(
    characterMetricInputError("ratio", "201", 100),
    "장평은 50~200% 범위의 정수로 입력하세요.",
  );
  assert.equal(characterMetricInputError("ratio", "0", 0), "");
  assert.deepEqual(
    stepNativeWidths(null, 1).ratio,
    [101, 101, 101, 101, 101, 101, 101],
  );
  /** Actual native shortcut observations include retained unsigned-byte edge behavior. */
  const legacy = characterMetrics(null);
  legacy.ratio = [50, 80, 100, 150, 200, 0, 255];
  assert.deepEqual(stepNativeWidths(legacy, 1).ratio, legacy.ratio);
  assert.deepEqual(
    stepNativeWidths(legacy, -1).ratio,
    [50, 79, 99, 149, 199, 255, 254],
  );
}
test(
  "native width changes glyph advances while retaining independent language and legacy source values",
  verifyNativeWidthRules,
);

/**
 * Verify scoped width edits and physical shadow offsets survive glyph scaling.
 *
 * Width-only language edits must preserve unrelated font, size and tracking
 * settings. A glyph transform cannot multiply its independent shadow offset.
 * @returns {void} Asserts immutable source editing and physical shadow compensation.
 * @example
 * // A half-width glyph retains the same physical one-point shadow offset.
 */
function verifyScopedWidthEffects(): void {
  /** Distinct original arrays expose accidental flattening during a scoped width edit. */
  const metrics = characterMetrics(null);
  metrics.spacing = [-20, 15, -5, 10, 0, 25, -35];
  /** Every unrelated source field belongs to its original run. */
  const original = {
      fontSize: "32pt",
      color: "#123456",
      nativeOutlineType: 2,
      nativeShadowType: "CONTINUOUS",
      nativeCharacterMetrics: metrics,
    },
    edited = editCharacterLanguages(original, [
      { language: null, key: "ratio", value: 75 },
      { language: 1, key: "ratio", value: 150 },
    ]);
  assert.deepEqual(
    characterMetrics(edited.nativeCharacterMetrics).ratio,
    [75, 150, 75, 75, 75, 75, 75],
  );
  assert.deepEqual(
    characterMetrics(edited.nativeCharacterMetrics).spacing,
    metrics.spacing,
  );
  assert.deepEqual(metrics.ratio, [100, 100, 100, 100, 100, 100, 100]);
  assert.equal(edited.fontSize, "32pt");
  assert.equal(edited.color, "#123456");
  assert.equal(edited.nativeOutlineType, 2);
  assert.equal(
    characterShadowCss({ fontSize: "10pt", nativeShadowType: "DROP" }, 0.5),
    "2pt 1pt 0 #c0c0c0",
  );
  assert.equal(
    characterShadowCss({ fontSize: "10pt", nativeShadowType: "DROP" }, 2),
    "0.5pt 1pt 0 #c0c0c0",
  );
}
test(
  "scoped native width edits preserve other fields and compensate independent shadow geometry",
  verifyScopedWidthEffects,
);
