import test from "node:test";
import assert from "node:assert/strict";
import { compareUiPixels, type UiPixelFrame } from "../scripts/ui-pixels.ts";

/**
 * Verify literal decoded RGB counts against independently specified tiny original frames.
 *
 * One changed channel in two original pixels produces fifty percent equality
 * and exactly one-sixth mean RGB error. Alpha lies outside the disclosed metric.
 * @returns {void} Checks exact counts without relying on another image comparator.
 * @example
 * // White background pixels participate just like every other original pixel.
 */
function verifyOriginalPixelCounts(): void {
  /** Independent tiny originals establish an exact arithmetic result. */
  const source = {
      width: 2,
      height: 1,
      data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
    },
    target = {
      width: 2,
      height: 1,
      data: new Uint8Array([0, 0, 0, 0, 255, 254, 255, 255]),
    },
    result = compareUiPixels(source, target);
  assert.equal(result.pixels, 2);
  assert.equal(result.exactRgbPixels, 1);
  assert.equal(result.exactRgbPercent, 50);
  assert.equal(result.meanAbsoluteRgbError, 1 / 6);
}
test(
  "UI comparison counts literal decoded RGB pixels against a known original result",
  verifyOriginalPixelCounts,
);

/**
 * Reject the encoded-string indexing error that previously inflated visual equality.
 *
 * Undefined indices beyond a base64 string must never be counted as matching
 * pixels. The malformed object deliberately bypasses TypeScript at runtime.
 * @returns {void} Verifies encoded text fails before pixel iteration.
 * @example
 * // Encoded data cannot masquerade as a complete decoded four-channel buffer.
 */
function verifyEncodedPixelRejection(): void {
  /** Text is deliberately malformed pixel storage, independently of its nominal frame dimensions. */
  const bad = {
    width: 695,
    height: 570,
    data: "encoded PNG bytes",
  } as unknown as UiPixelFrame;
  assert.throws(
    /**
     * Reject base64-like text where real decoded image bytes are required.
     *
     * Matching undefined string indices cannot yield a false passing score.
     * @returns {unknown} Never returns for invalid encoded pixel storage.
     * @throws {TypeError} Always rejects the deliberate historical failure shape.
     * @example
     * // Both malformed inputs are rejected even when their strings match.
     */
    () => compareUiPixels(bad, bad),
    TypeError,
  );
}
test(
  "UI comparison rejects encoded strings before indexing nonexistent pixels",
  verifyEncodedPixelRejection,
);

/**
 * Reject incomplete buffers and incompatible original frame dimensions.
 *
 * The tool cannot silently compare a prefix, align frames or resize a target.
 * @returns {void} Verifies exact original dimensions and byte-stride invariants.
 * @example
 * // A one-pixel native frame cannot be compared with a two-pixel target.
 */
function verifyPixelBounds(): void {
  /** Small original decoded buffers make every boundary independent and explicit. */
  const source = { width: 1, height: 1, data: new Uint8Array(4) },
    short = { width: 1, height: 1, data: new Uint8Array(3) },
    wide = { width: 2, height: 1, data: new Uint8Array(8) };
  assert.throws(
    /**
     * Reject missing decoded channels instead of reading undefined values.
     *
     * A complete four-channel original buffer is mandatory.
     * @returns {unknown} Never returns for the truncated frame.
     * @throws {RangeError} Always rejects incomplete original storage.
     * @example
     * // Three bytes do not describe one complete original RGBA/BGRA pixel.
     */
    () => compareUiPixels(source, short),
    RangeError,
  );
  assert.throws(
    /**
     * Reject mismatched original image dimensions without registration or resampling.
     *
     * Both buffers are valid separately but describe different-sized frames.
     * @returns {unknown} Never returns for different original frame dimensions.
     * @throws {RangeError} Always rejects this incompatible pair.
     * @example
     * // No target pixels are cropped or aligned to force equality.
     */
    () => compareUiPixels(source, wide),
    RangeError,
  );
}
test(
  "UI comparison requires complete original buffers and identical frame dimensions",
  verifyPixelBounds,
);
