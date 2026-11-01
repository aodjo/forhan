import test from "node:test";
import assert from "node:assert/strict";
import { englishHyphenationPoints } from "../src/english-hyphenation.ts";

/**
 * Verify published English word breaks independently of browser dictionary support.
 *
 * Boundaries retain the bundled public dictionary's left/right minima and
 * exception weights. Original source words remain unchanged and case-safe.
 * @returns {void} Completes original-source dictionary boundary assertions.
 * @throws {Error} If dictionary weights, minima or original source boundaries differ.
 * @example
 * // English hyphenation works offline even when Electron has no automatic dictionary.
 */
function verifyEnglishDictionary(): void {
  assert.deepEqual(englishHyphenationPoints("hyphenation"), [2, 6]);
  assert.deepEqual(englishHyphenationPoints("representation"), [3, 5, 8, 10]);
  assert.deepEqual(
    englishHyphenationPoints("counterrevolutionary"),
    [4, 7, 10, 11, 13, 17],
  );
  assert.deepEqual(
    englishHyphenationPoints("COUNTERREVOLUTIONARY"),
    [4, 7, 10, 11, 13, 17],
  );
  assert.deepEqual(englishHyphenationPoints("beautiful"), [4, 6]);
  assert.deepEqual(englishHyphenationPoints("exceptional"), [2, 5]);
  for (/** Unknown, non-English, numeric and short source remains literal instead of receiving guessed boundaries. */ const word of [
    "한글",
    "العربية",
    "café",
    "cafe\u0301",
    "abc",
    "ABC123",
    "😀",
    "",
  ])
    assert.deepEqual(englishHyphenationPoints(word), []);
}
test(
  "offline English patterns retain source boundaries, case and native dictionary minima",
  verifyEnglishDictionary,
);
