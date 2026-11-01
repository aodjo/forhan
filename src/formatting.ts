/** Default body character size measured in the installed blank document, in points. */
export const DEFAULT_FONT_SIZE = 10;
/** Nominal native paragraph CHAR distance in points, independent of the current glyph size. */
export const NATIVE_PARAGRAPH_CHARACTER_POINTS = 5;
/** Minimum newly entered character size documented by the native application, in points. */
export const MIN_FONT_SIZE = 1;
/** Largest point size representable by the signed native hundredth-point height field. */
export const MAX_STORED_FONT_SIZE = 0x7fffffff / 100;
/** Heading sizes used by the editor's native-style theme and native document writers. */
const HEADING_SIZES: Readonly<Record<number, number>> = {
  1: 24,
  2: 18,
  3: 15,
  4: 13,
  5: 13,
  6: 13,
};

/**
 * Resolve the default character size for a paragraph or heading.
 *
 * Explicit character formatting takes precedence over these shared defaults;
 * missing heading levels use the ordinary document body size.
 * @param {number} [level=0] - Heading level, or zero for body text.
 * @returns {number} Default character size in points.
 * @example
 * defaultFontSize(3); // 15
 */
export function defaultFontSize(level = 0): number {
  return HEADING_SIZES[level] || DEFAULT_FONT_SIZE;
}

/**
 * Display a point size without concealing native hundredth-point precision.
 *
 * Ordinary sizes retain the measured one-decimal appearance; imported sizes
 * with finer precision keep two decimals instead of changing during editing.
 * @param {number} size - Character size in points.
 * @returns {string} Decimal character size for native-style controls.
 * @example
 * displayFontSize(10); // '10.0'
 * displayFontSize(12.25); // '12.25'
 */
export function displayFontSize(size: number): string {
  return size.toFixed(
    Math.abs(size * 10 - Math.round(size * 10)) < 0.000001 ? 1 : 2,
  );
}

/**
 * Convert an absolute CSS character size to typographic points.
 *
 * Plain numeric values retain the document model's point convention. Relative
 * units require inherited layout context and use the caller's explicit fallback
 * rather than being mistaken for point values by parseFloat.
 * @param {unknown} value - Character size from imported or edited text.
 * @param {number} [fallback=DEFAULT_FONT_SIZE] - Inherited/default point size.
 * @returns {number} Positive finite size in points.
 * @example
 * fontSizePoints('16px'); // 12
 * fontSizePoints('1in'); // 72
 */
export function fontSizePoints(
  value: unknown,
  fallback = DEFAULT_FONT_SIZE,
): number {
  /** Absolute character size, including a native zero-height definition. */
  const size = absoluteFontSizePoints(value);
  return size !== null && size > 0 ? size : fallback;
}

/**
 * Parse an absolute character size without replacing native zero-height text.
 *
 * Unsupported relative units require inherited layout context and return null;
 * physical units retain full precision until the native encoder rounds them.
 * @param {unknown} value - Imported character-size attribute.
 * @returns {number | null} Finite nonnegative point size, or null for an unsupported value.
 * @example
 * absoluteFontSizePoints('0pt'); // 0
 */
function absoluteFontSizePoints(value: unknown): number | null {
  /** Numeric absolute size with an optional physical or pixel unit. */
  const parsed = String(value ?? "")
    .trim()
    .match(
      /^(\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(pt|px|mm|cm|in|pc)?$/i,
    );
  if (!parsed) return null;
  /** Point conversion factors shared by UI and both native format encoders. */
  const factors: Record<string, number> = {
    pt: 1,
    px: 0.75,
    mm: 72 / 25.4,
    cm: 72 / 2.54,
    in: 72,
    pc: 12,
  };
  /** Converted size validated before it reaches a native character definition. */
  const size = Number(parsed[1]) * factors[(parsed[2] || "pt").toLowerCase()];
  return Number.isFinite(size) && size >= 0 ? size : null;
}

/**
 * Resolve stored character sizes while preserving imported zero-height text.
 *
 * Native documents can contain values below the interactive minimum. Reading
 * or changing an unrelated property must not silently enlarge those characters.
 * @param {unknown} value - Imported character-size attribute.
 * @param {number} [fallback=DEFAULT_FONT_SIZE] - Inherited size for a missing attribute.
 * @returns {number} Nonnegative character size in points.
 * @example
 * storedFontSizePoints('0pt'); // 0
 */
export function storedFontSizePoints(
  value: unknown,
  fallback = DEFAULT_FONT_SIZE,
): number {
  return absoluteFontSizePoints(value) ?? fallback;
}

/**
 * Encode a native character height without integer overflow.
 *
 * Both native writers share the signed 32-bit hundredth-point storage limit.
 * Imported subminimum heights remain valid; values beyond storage capacity fail
 * explicitly rather than wrapping into a different or negative character size.
 * @param {unknown} value - Character-size attribute, with an optional absolute unit.
 * @param {number} [fallback=DEFAULT_FONT_SIZE] - Inherited size when no absolute size exists.
 * @returns {number} Integral native character height in hundredths of a point.
 * @throws {RangeError} If the resolved size exceeds native storage capacity.
 * @example
 * nativeFontHeight('13.25pt'); // 1325
 */
export function nativeFontHeight(
  value: unknown,
  fallback = DEFAULT_FONT_SIZE,
): number {
  /** Resolved document value checked before any integer conversion. */
  const size = storedFontSizePoints(value, fallback);
  if (!Number.isFinite(size) || size < 0 || size > MAX_STORED_FONT_SIZE)
    throw new RangeError(
      "Character size exceeds native height storage capacity.",
    );
  return Math.round(size * 100);
}

/**
 * Validate a point-size draft against native entry and storage rules.
 *
 * A previously imported subminimum size may remain unchanged. New values must
 * start at one point and fit hundredth-point storage without silent rounding.
 * @param {string} value - Literal numeric draft from a character-size field.
 * @param {number} original - Current stored selection size, including imported zero.
 * @returns {string} Korean validation message, or an empty string for a valid draft.
 * @example
 * fontSizeInputError('0.5', 10); // Nonempty validation message.
 * fontSizeInputError('0.5', 0.5); // ''
 */
export function fontSizeInputError(value: string, original: number): string {
  /** Numeric draft is checked independently of the browser's step alignment. */
  const size = Number(value);
  if (
    !value.trim() ||
    !Number.isFinite(size) ||
    size < 0 ||
    (size < MIN_FONT_SIZE && size !== original)
  )
    return "글자 크기는 1pt 이상으로 입력하세요.";
  if (size > MAX_STORED_FONT_SIZE)
    return "저장할 수 있는 글자 크기 범위를 초과했습니다.";
  if (Math.abs(size * 100 - Math.round(size * 100)) > 0.000001)
    return "글자 크기는 소수 둘째 자리까지 입력하세요.";
  return "";
}

/**
 * Change character height by one point while retaining its fractional part.
 *
 * Native increase and decrease actions operate on the value itself rather than
 * snapping it to an HTML number input's step grid. New sizes stay within the
 * interactive minimum and native storage capacity.
 * @param {number} size - Valid current point size.
 * @param {1 | -1} direction - One-point increase or decrease.
 * @returns {number} Bounded point size with hundredth-point precision.
 * @example
 * stepFontSize(13.25, 1); // 14.25
 */
export function stepFontSize(size: number, direction: 1 | -1): number {
  return (
    Math.round(
      Math.min(
        MAX_STORED_FONT_SIZE,
        Math.max(MIN_FONT_SIZE, size + direction),
      ) * 100,
    ) / 100
  );
}

/**
 * Distinguish a fixed physical line height from proportional spacing.
 *
 * Unitless multipliers and percentages return null. Absolute nonnegative lengths
 * use physical conversion factors. The model's legacy em notation represents
 * native CHAR distances, whose nominal point size does not follow glyph size.
 * @param {unknown} value - Paragraph line-height attribute.
 * @returns {number | null} Fixed distance in points, or null for another mode.
 * @example
 * fixedLineHeightPoints('24px'); // 18
 * fixedLineHeightPoints('160%'); // null
 */
export function fixedLineHeightPoints(value: unknown): number | null {
  /** Explicit absolute unit required to avoid misreading relative multipliers. */
  const source = String(value ?? "").trim();
  /** Native character distances retain their encoded hundredth-character precision. */
  const character = nativeCharacterDistancePoints(source);
  if (character !== null) return character >= 0 ? character : null;
  if (
    !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*(pt|px|mm|cm|in|pc)$/i.test(
      source,
    )
  )
    return null;
  /** Zero fixed spacing is a real native value rather than an absent line-height definition. */
  return absoluteFontSizePoints(source);
}

/**
 * Resolve the document model's legacy native CHAR length to physical points.
 *
 * Native paragraph codecs historically spell CHAR values with em. This model
 * notation is not ordinary font-relative CSS: native captures at 10pt and 20pt
 * both resolve 1.5 native characters to the same 7.5pt distance.
 * @param {unknown} value - Canonical native paragraph distance.
 * @returns {number|null} Native point distance, or null for another unit.
 * @example
 * nativeCharacterDistancePoints('1.5em'); // 7.5
 */
export function nativeCharacterDistancePoints(value: unknown): number | null {
  /** Strict native character syntax excludes arbitrary CSS expressions. */
  const match = String(value ?? "")
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*em$/i);
  if (!match) return null;
  /** Match native serialization's integral hundredth-character resolution. */
  const points =
    (Math.round(Number(match[1]) * 100) * NATIVE_PARAGRAPH_CHARACTER_POINTS) /
    100;
  return Number.isFinite(points) ? points : null;
}

/**
 * Resolve native paragraph units for physical controls and rendering.
 *
 * Native CHAR values retain their fixed nominal size. Other physical units and
 * bare millimetre values follow the existing paragraph distance convention.
 * @param {unknown} value - Canonical native paragraph distance.
 * @returns {number} Signed native distance in points.
 * @example
 * nativeParagraphLengthPoints('-0.5em'); // -2.5
 */
export function nativeParagraphLengthPoints(value: unknown): number {
  return nativeCharacterDistancePoints(value) ?? paragraphLengthPoints(value);
}

/**
 * Convert signed paragraph spacing into typographic points without early rounding.
 *
 * Negative lengths represent hanging indents. Bare values retain the paragraph
 * model's millimetre convention; absent or unsupported lengths resolve to zero.
 * Rounding belongs to the final native hundredth-point control or file encoder.
 * @param {unknown} value - Imported paragraph margin or first-line indentation.
 * @param {number} [characterSize=DEFAULT_FONT_SIZE] - Point size for relative character units.
 * @returns {number} Finite signed distance in points.
 * @example
 * paragraphLengthPoints('-0.25in'); // -18
 * paragraphLengthPoints('6.438194444444445mm'); // Approximately 18.25
 */
export function paragraphLengthPoints(
  value: unknown,
  characterSize = DEFAULT_FONT_SIZE,
): number {
  /** Optional sign, absolute magnitude and supported physical or CSS pixel unit. */
  const parsed = String(value ?? "")
    .trim()
    .match(
      /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?\s*(pt|px|mm|cm|in|pc|em)?$/i,
    );
  if (!parsed) return 0;
  if (parsed[4]?.toLowerCase() === "em") {
    /** Relative character distance resolved against the active paragraph's font size. */
    const relative =
      Number(`${parsed[1]}${parsed[2]}${parsed[3] ? `e${parsed[3]}` : ""}`) *
      characterSize;
    return Number.isFinite(relative) ? relative : 0;
  }
  return (
    (parsed[1] === "-" ? -1 : 1) *
    fontSizePoints(
      `${parsed[2]}${parsed[3] ? `e${parsed[3]}` : ""}${parsed[4] || "mm"}`,
      0,
    )
  );
}
