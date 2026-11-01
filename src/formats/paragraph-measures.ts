import { paragraphLengthPoints } from "../formatting.ts";

/** Native paragraph measurement with an explicit physical or relative character unit. */
export interface ParagraphMeasure {
  value: number;
  unit: "HWPUNIT" | "CHAR";
}

/**
 * Parse an editable paragraph distance into its native measurement pair.
 *
 * Physical lengths become hundredth points. The model's legacy em spelling
 * stores native CHAR counts and preserves their unit across native saves;
 * rendering resolves these nominal units independently of the current font.
 * Bare paragraph values follow the document model's millimetre convention.
 * @param {unknown} value - CSS paragraph margin, indentation or fixed line distance.
 * @returns {ParagraphMeasure} Bounded integral measurement and native unit.
 * @throws {Error} If the length has unsupported units or an excessive magnitude.
 * @example
 * parseParagraphMeasure('12.25pt'); // {value:1225,unit:'HWPUNIT'}
 * parseParagraphMeasure('-1.5em'); // {value:-150,unit:'CHAR'}
 */
export function parseParagraphMeasure(value: unknown): ParagraphMeasure {
  if (value === undefined || value === null || value === "")
    return { value: 0, unit: "HWPUNIT" };
  /** Finite signed CSS distance and its optional physical or relative unit. */
  const match = String(value)
    .trim()
    .match(
      /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|px|pc|em)?$/i,
    );
  if (!match)
    throw new Error(`Unsupported native paragraph distance: ${String(value)}`);
  /** Relative character measurements keep their type rather than assuming points. */
  const relative = match[2]?.toLowerCase() === "em";
  /** Native integral magnitude before packing its unit bit into an HWP record. */
  const magnitude = Math.round(
    (relative ? Number(match[1]) : paragraphLengthPoints(value)) * 100,
  );
  if (!Number.isFinite(magnitude) || Math.abs(magnitude) > 10000000)
    throw new Error(
      "Native paragraph distance is outside the supported range.",
    );
  return { value: magnitude, unit: relative ? "CHAR" : "HWPUNIT" };
}

/**
 * Decode a binary paragraph unit representation code without discarding its type.
 *
 * Bit zero selects hundredth characters; the signed upper bits otherwise hold
 * HWP units. An arithmetic shift preserves negative hanging-indent magnitudes.
 * @param {number} raw - Signed native 32-bit URC paragraph property.
 * @returns {ParagraphMeasure} Unpacked signed magnitude and measurement unit.
 * @example
 * decodeParagraphUrc(2450); // {value:1225,unit:'HWPUNIT'}
 * decodeParagraphUrc(-299); // {value:-150,unit:'CHAR'}
 */
export function decodeParagraphUrc(raw: number): ParagraphMeasure {
  return { value: raw >> 1, unit: (raw & 1) === 1 ? "CHAR" : "HWPUNIT" };
}

/**
 * Encode a paragraph distance with the native HWP unit-discriminator bit.
 *
 * Ordinary HWP geometry is not packed, but paragraph margins, indentation and
 * fixed line spacing use URC. Writing raw HWP units can accidentally select CHAR.
 * @param {unknown} value - Supported editable paragraph distance.
 * @returns {number} Signed integral native URC measurement.
 * @throws {Error} If the distance cannot be represented by the supported native range.
 * @example
 * encodeParagraphUrc('12.25pt'); // 2450
 * encodeParagraphUrc('-1.5em'); // -299
 */
export function encodeParagraphUrc(value: unknown): number {
  /** Native measurement pair retained before packing its type. */
  const measure = parseParagraphMeasure(value);
  return measure.value * 2 + (measure.unit === "CHAR" ? 1 : 0);
}

/**
 * Render a native paragraph measurement as lossless editable model geometry.
 *
 * Native CHAR counts retain the model's legacy em spelling. These values must
 * pass through the native paragraph renderer before becoming CSS; they are not
 * font-relative browser em lengths. Physical values use millimetres or points.
 * @param {ParagraphMeasure} measure - Decoded native physical or character distance.
 * @param {'mm' | 'pt'} [physicalUnit='mm'] - CSS unit for physical measurements.
 * @returns {string} Model distance preserving native hundredth-unit precision.
 * @example
 * paragraphMeasureCss({value:1225,unit:'HWPUNIT'},'pt'); // '12.25pt'
 * paragraphMeasureCss({value:150,unit:'CHAR'}); // '1.5em'
 */
export function paragraphMeasureCss(
  measure: ParagraphMeasure,
  physicalUnit: "mm" | "pt" = "mm",
): string {
  if (measure.unit === "CHAR") return `${measure.value / 100}em`;
  if (physicalUnit === "pt") return `${measure.value / 100}pt`;
  return `${Number(((measure.value * 25.4) / 7200).toFixed(6))}mm`;
}
