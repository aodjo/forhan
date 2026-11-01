import test from "node:test";
import assert from "node:assert/strict";
import {
  stepParagraphNumber,
  displayParagraphPoints,
} from "../src/ui/paragraph-numbers.ts";

/**
 * Match original native integer, fractional and imported negative arrow observations.
 *
 * Independent UIA records and actual native paragraph properties establish
 * these one-unit edits. Display conversion must also recover original native
 * hundredth points from CSS millimetre rounding without changing source.
 * @returns {void} Completes independently observed numeric compatibility assertions.
 * @throws {Error} If native steps or native point labels change.
 * @example
 * // Native 1.25pt displays 1.3pt, steps upward to 2pt and downward to 1pt.
 */
function verifyNativeParagraphNumbers(): void {
  for (/** Literal outcomes come from guarded original native arrow clicks and parameter reads. */ const [
    value,
    direction,
    expected,
  ] of [
    [0, 1, 1],
    [160, 1, 161],
    [100, -1, 99],
    [1.25, 1, 2],
    [1.25, -1, 1],
    [-1.25, 1, 0],
    [-1.25, -1, -2],
  ] as const)
    assert.equal(stepParagraphNumber(value, direction, -283.5, 500), expected);
  assert.equal(stepParagraphNumber(0, -1, 0, 500), 0);
  assert.equal(stepParagraphNumber(500, 1, 0, 500), 500);
  assert.equal(displayParagraphPoints(1.25), "1.3");
  assert.equal(displayParagraphPoints(-1.25), "-1.3");
  assert.equal(displayParagraphPoints(18.249449), "18.3");
  assert.equal(displayParagraphPoints(0), "0.0");
}
test(
  "paragraph number edits and labels match actual native whole-unit and fractional observations",
  verifyNativeParagraphNumbers,
);
