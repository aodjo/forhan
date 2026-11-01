/** Original decoded screenshot bytes retain their complete dimensions and four-channel pixel stride. */
export interface UiPixelFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Literal original RGB equality is distinct from overall UI, layout or functional completion. */
export interface UiPixelComparison {
  width: number;
  height: number;
  pixels: number;
  exactRgbPixels: number;
  exactRgbPercent: number;
  meanAbsoluteRgbError: number;
}

/**
 * Validate actual decoded pixel storage before a screenshot comparison.
 *
 * Encoded base64 strings, JSON arrays and short buffers cannot be treated as
 * pixel data. Exact stride validation prevents undefined indices from being
 * counted as matching pixels outside an encoded string's length.
 * @param {UiPixelFrame} frame - Original decoded image with explicit dimensions.
 * @returns {void} Accepts only complete four-channel decoded byte storage.
 * @throws {TypeError} If the supplied storage is not a real Uint8Array or Buffer.
 * @throws {RangeError} If dimensions or byte stride are invalid.
 * @example
 * validateUiPixels({width:1,height:1,data:new Uint8Array([0,0,0,255])});
 */
function validateUiPixels(frame: UiPixelFrame): void {
  if (!(frame.data instanceof Uint8Array))
    throw new TypeError(
      "Screenshot comparison requires decoded pixel bytes, not encoded text.",
    );
  /** Exact native byte stride is checked before any original channel is indexed. */
  const bytes = frame.width * frame.height * 4;
  if (
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1 ||
    !Number.isSafeInteger(bytes) ||
    frame.data.byteLength !== bytes
  )
    throw new RangeError(
      "Screenshot dimensions do not match decoded four-channel pixel storage.",
    );
}

/**
 * Compare every original RGB pixel without alignment, masking or image edits.
 *
 * Inputs must use the same decoder/channel order. Alpha is deliberately outside
 * this RGB metric. White background contributes to equality; the result alone
 * does not prove functional equivalence or equality in unobserved UI states.
 * @param {UiPixelFrame} source - Complete original decoded reference screenshot.
 * @param {UiPixelFrame} target - Complete independently captured product screenshot.
 * @returns {UiPixelComparison} Literal RGB equality and mean channel error over the full frame.
 * @throws {TypeError} If encoded strings or other nonpixel storage are supplied.
 * @throws {RangeError} If decoded storage or original frame dimensions differ.
 * @example
 * compareUiPixels(source,target).exactRgbPercent; // No registration or post-capture editing.
 */
export function compareUiPixels(
  source: UiPixelFrame,
  target: UiPixelFrame,
): UiPixelComparison {
  validateUiPixels(source);
  validateUiPixels(target);
  if (source.width !== target.width || source.height !== target.height)
    throw new RangeError(
      "Original screenshot dimensions differ; alignment and resampling are not performed.",
    );
  /** Exact original dimensions and channel storage remain independent of metadata labels. */
  const pixels = source.width * source.height,
    a = source.data,
    b = target.data;
  let equal = 0,
    error = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    if (
      a[offset] === b[offset] &&
      a[offset + 1] === b[offset + 1] &&
      a[offset + 2] === b[offset + 2]
    )
      equal++;
    for (let channel = 0; channel < 3; channel++)
      error += Math.abs(a[offset + channel] - b[offset + channel]);
  }
  return {
    width: source.width,
    height: source.height,
    pixels,
    exactRgbPixels: equal,
    exactRgbPercent: (equal / pixels) * 100,
    meanAbsoluteRgbError: error / (pixels * 3),
  };
}
