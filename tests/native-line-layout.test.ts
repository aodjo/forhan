import test from "node:test";
import assert from "node:assert/strict";
import {
  nativeLineAdvance,
  nativeLineSpacing,
} from "../src/native-line-layout.ts";

/**
 * Retain native physical and proportional intervals including intentional zero.
 *
 * Native CHAR source units are fixed physical intervals, independent of actual
 * text size. Invalid CSS modes cannot silently become ordinary native percent.
 * @returns {void} Verifies representative imported native line modes.
 * @example
 * // 1.5 native characters represent a physical 7.5pt interval.
 */
function verifyNativeIntervals(): void {
  assert.equal(nativeLineAdvance(40, nativeLineSpacing("1.5em")!), 10);
  assert.equal(nativeLineAdvance(40, nativeLineSpacing("0pt")!), 0);
  assert.equal(nativeLineAdvance(40, nativeLineSpacing("0")!), 0);
  assert.equal(nativeLineAdvance(20, nativeLineSpacing("160%")!), 32);
  assert.equal(nativeLineAdvance(20, nativeLineSpacing("1.6")!), 32);
  assert.equal(nativeLineAdvance(20, nativeLineSpacing(null)!), 32);
  assert.equal(nativeLineAdvance(20, nativeLineSpacing("18.25pt")!), 73 / 3);
  assert.equal(nativeLineSpacing("normal"), null);
  assert.equal(nativeLineSpacing("-2"), null);
  assert.equal(nativeLineSpacing("Infinity"), null);
}
test(
  "native line intervals preserve physical units and zero progress",
  verifyNativeIntervals,
);
