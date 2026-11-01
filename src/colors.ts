import { CSS_NAMED_COLORS } from "./css-named-colors.ts";

/**
 * Resolve an RGB channel or alpha component without integer wrapping.
 *
 * Percentage components use their supplied scale. Explicit values outside the
 * representable interval are rejected before native color serialization.
 * @param {string} value - Decimal component with an optional percent suffix.
 * @param {number} scale - Maximum component value, normally 255 or one.
 * @returns {number} Finite component in the requested interval.
 * @throws {RangeError} If the component syntax or range is invalid.
 * @example
 * colorComponent('100%', 255); // 255
 */
function colorComponent(value: string, scale: number): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(value))
    throw new RangeError("Color component is not a finite decimal value.");
  /** Percent notation is converted before validating the native component range. */
  const component =
    Number.parseFloat(value) * (value.endsWith("%") ? scale / 100 : 1);
  if (!Number.isFinite(component) || component < 0 || component > scale)
    throw new RangeError("Color component exceeds its representable range.");
  return component;
}

/**
 * Normalize an opaque CSS color while distinguishing absent shading from white.
 *
 * Named sRGB colors, hexadecimal colors and legacy/modern RGB functions share
 * one native representation. Fully transparent shading resolves to no color;
 * partial alpha cannot be represented by native character COLORREF fields and
 * fails explicitly instead of silently flattening against an arbitrary page.
 * @param {unknown} value - Optional CSS or native color value.
 * @param {boolean} [allowNone=false] - Whether transparent/no-color shading is accepted.
 * @returns {string | null} Lowercase six-digit RGB color, or an absent color.
 * @throws {RangeError} If a supplied color or alpha cannot be encoded natively.
 * @example
 * normalizeColor('rgb(255 0 0 / 100%)'); // '#ff0000'
 * normalizeColor('transparent', true); // null
 * normalizeColor('#fff', true); // '#ffffff'
 */
export function normalizeColor(
  value: unknown,
  allowNone = false,
): string | null {
  /** Literal source color is never evaluated as markup or executable CSS. */
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (text === "transparent" || text === "none") {
    if (allowNone) return null;
    throw new RangeError("Native text color requires an opaque RGB value.");
  }
  if (Object.hasOwn(CSS_NAMED_COLORS, text)) return CSS_NAMED_COLORS[text];
  /** Valid source channels remain numeric until the final opaque-color decision. */
  let channels: number[];
  let alpha = 1;
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) {
    /** Short hex notation expands individual channel nibbles without changing their values. */
    const hex =
      text.length <= 5
        ? [...text.slice(1)]
            .map(
              /**
               * Expand one hexadecimal channel nibble to a complete byte.
               *
               * Repeating the nibble preserves standard CSS short-color semantics.
               * @param {string} channel - One hexadecimal digit.
               * @returns {string} Two hexadecimal digits for the same channel intensity.
               * @example
               * // The nibble f becomes ff.
               */
              (channel) => channel + channel,
            )
            .join("")
        : text.slice(1);
    channels = [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
    if (hex.length === 8) alpha = Number.parseInt(hex.slice(6), 16) / 255;
  } else {
    /** RGB functions support both comma-separated and modern space/slash notation. */
    const rgb = /^rgba?\((.*)\)$/.exec(text);
    if (!rgb)
      throw new RangeError("Color cannot be represented as native sRGB.");
    /** Channels and optional alpha are parsed independently of comma/space syntax. */
    let parts: string[];
    if (rgb[1].includes(","))
      parts = rgb[1].split(",").map(
        /**
         * Read one literal component of a legacy RGB function.
         *
         * Whitespace is ignored while empty or malformed components remain invalid.
         * @param {string} component - Comma-separated source component.
         * @returns {string} Trimmed decimal or percentage component.
         * @example
         * // The source component ' 255 ' becomes '255'.
         */
        (component) => component.trim(),
      );
    else {
      /** A modern RGB function may contain one explicit alpha separator. */
      const split = rgb[1].split("/");
      if (split.length > 2)
        throw new RangeError("RGB color has multiple alpha separators.");
      parts = split[0].trim().split(/\s+/);
      if (split.length === 2) parts.push(split[1].trim());
    }
    if (parts.length !== 3 && parts.length !== 4)
      throw new RangeError(
        "RGB color requires three channels and optional alpha.",
      );
    channels = [
      colorComponent(parts[0], 255),
      colorComponent(parts[1], 255),
      colorComponent(parts[2], 255),
    ];
    if (parts.length === 4) alpha = colorComponent(parts[3], 1);
  }
  if (allowNone && alpha === 0) return null;
  if (alpha !== 1)
    throw new RangeError(
      "Native character color does not support partial transparency.",
    );
  return (
    "#" +
    channels
      .map(
        /**
         * Encode a validated RGB channel as one rounded native byte.
         *
         * Native character colors have eight bits per channel, including percentage input.
         * @param {number} channel - Validated component between zero and 255.
         * @returns {string} Two lowercase hexadecimal digits.
         * @example
         * // Channel 255 becomes ff.
         */
        (channel) => Math.round(channel).toString(16).padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Encode an opaque CSS color as HWP's low-byte-red COLORREF integer.
 *
 * Missing values use the supplied fallback. No-color shading is resolved by
 * callers separately so the native 0xffffffff sentinel never becomes white.
 * @param {unknown} value - CSS color to encode.
 * @param {number} [fallback=0] - Native value used when no color is specified.
 * @returns {number} Twenty-four-bit native COLORREF value.
 * @throws {RangeError} If an explicit color cannot be encoded natively.
 * @example
 * colorRef('#123456'); // 0x563412
 */
export function colorRef(value: unknown, fallback = 0): number {
  /** Canonical RGB channels retain their order before little-endian color encoding. */
  const hex = normalizeColor(value);
  if (!hex) return fallback;
  return (
    Number.parseInt(hex.slice(1, 3), 16) |
    (Number.parseInt(hex.slice(3, 5), 16) << 8) |
    (Number.parseInt(hex.slice(5, 7), 16) << 16)
  );
}

/**
 * Read opaque native RGB channels for spectrum controls.
 *
 * Missing input uses black; transparent or partially opaque text colors cannot
 * enter numeric channel controls as if they were ordinary opaque colors.
 * @param {string} value - Supported opaque CSS color.
 * @returns {[number, number, number]} Red, green and blue byte values.
 * @throws {RangeError} If the input cannot be represented as opaque RGB.
 * @example
 * rgbChannels('#123456'); // [18, 52, 86]
 */
export function rgbChannels(value: string): [number, number, number] {
  /** Canonical hex notation provides one unambiguous value for each channel. */
  const hex = normalizeColor(value) || "#000000";
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Convert opaque RGB to hue, saturation and value for the spectrum plane.
 *
 * Achromatic colors use hue zero; the picker may retain its previous hue when
 * editing a gray so saturation can be raised without unexpectedly changing hue.
 * @param {string} value - Supported opaque CSS color.
 * @returns {[number, number, number]} Hue in degrees and saturation/value percentages.
 * @throws {RangeError} If the input is not representable as opaque RGB.
 * @example
 * colorToHsv('#ff0000'); // [0, 100, 100]
 */
export function colorToHsv(value: string): [number, number, number] {
  /** Source byte channels are normalized before the hue-sector calculation. */
  const [red, green, blue] = rgbChannels(value);
  /** Maximum and minimum channels define value and chroma independently. */
  const maximum = Math.max(red, green, blue),
    minimum = Math.min(red, green, blue),
    delta = maximum - minimum;
  /** Hue uses the dominant channel's sector and wraps into a nonnegative turn. */
  const hue =
    delta === 0
      ? 0
      : maximum === red
        ? (green - blue) / delta
        : maximum === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4;
  return [
    (((hue * 60) % 360) + 360) % 360,
    maximum === 0 ? 0 : (delta / maximum) * 100,
    (maximum / 255) * 100,
  ];
}

/**
 * Convert a bounded HSV spectrum coordinate to an opaque native RGB color.
 *
 * Hue wraps at a complete turn. Eight-bit RGB rounding happens only after the
 * continuous spectrum calculation, keeping pointer and numeric edits aligned.
 * @param {number} hue - Color angle in degrees.
 * @param {number} saturation - Saturation percentage from zero through 100.
 * @param {number} value - Brightness percentage from zero through 100.
 * @returns {string} Lowercase six-digit native RGB color.
 * @throws {RangeError} If a coordinate is nonfinite or outside its percentage range.
 * @example
 * hsvToColor(120, 100, 100); // '#00ff00'
 */
export function hsvToColor(
  hue: number,
  saturation: number,
  value: number,
): string {
  if (
    !Number.isFinite(hue) ||
    !Number.isFinite(saturation) ||
    !Number.isFinite(value) ||
    saturation < 0 ||
    saturation > 100 ||
    value < 0 ||
    value > 100
  )
    throw new RangeError(
      "Spectrum coordinates are outside their finite range.",
    );
  /** Normalized hue sector supplies the two nonzero chroma components. */
  const sector = (((hue % 360) + 360) % 360) / 60,
    chroma = ((value / 100) * saturation) / 100,
    secondary = chroma * (1 - Math.abs((sector % 2) - 1)),
    minimum = value / 100 - chroma;
  /** RGB components before adding the achromatic brightness contribution. */
  const channels =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  return (
    "#" +
    channels
      .map(
        /**
         * Quantize a continuous spectrum component to one native RGB byte.
         *
         * The achromatic contribution is added before rounding to avoid intermediate loss.
         * @param {number} channel - One continuous chroma component.
         * @returns {string} Two hexadecimal digits for the final RGB byte.
         * @example
         * // A final full-intensity component becomes ff.
         */
        (channel) =>
          Math.round((channel + minimum) * 255)
            .toString(16)
            .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Convert opaque RGB to the HSL values displayed by native color controls.
 *
 * Achromatic colors have zero saturation; hue remains a complete-turn angle.
 * The native RGB value remains authoritative when only switching display modes.
 * @param {string} value - Supported opaque CSS color.
 * @returns {[number, number, number]} Hue degrees and saturation/lightness percentages.
 * @throws {RangeError} If the input is not an opaque native color.
 * @example
 * colorToHsl('#ff0000'); // [0, 100, 50]
 */
export function colorToHsl(value: string): [number, number, number] {
  /** Source channels determine native HSL lightness and chroma. */
  const [red, green, blue] = rgbChannels(value);
  /** Normalized extrema define HSL saturation without depending on display rounding. */
  const maximum = Math.max(red, green, blue) / 255,
    minimum = Math.min(red, green, blue) / 255,
    lightness = (maximum + minimum) / 2,
    delta = maximum - minimum;
  return [
    colorToHsv(value)[0],
    delta === 0 ? 0 : (delta / (1 - Math.abs(2 * lightness - 1))) * 100,
    lightness * 100,
  ];
}

/**
 * Convert native HSL input through the shared opaque spectrum calculation.
 *
 * Numeric and pointer controls use the same continuous HSL calculation and
 * quantize only the final native RGB value.
 * @param {number} hue - Color angle in degrees.
 * @param {number} saturation - HSL saturation percentage.
 * @param {number} lightness - HSL lightness percentage.
 * @returns {string} Lowercase six-digit native RGB color.
 * @throws {RangeError} If a coordinate cannot be represented by the spectrum.
 * @example
 * hslToColor(240, 100, 50); // '#0000ff'
 */
export function hslToColor(
  hue: number,
  saturation: number,
  lightness: number,
): string {
  return (
    "#" +
    hslColorChannels(hue, saturation, lightness)
      .map(
        /**
         * Quantize one continuous HSL channel at the final native RGB boundary.
         *
         * Spectrum painting shares these continuous values before final byte rounding.
         * @param {number} channel - Continuous RGB intensity from zero through 255.
         * @returns {string} Two lowercase hexadecimal digits.
         * @example
         * // A full-intensity channel becomes ff.
         */
        (channel) => Math.round(channel).toString(16).padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Resolve continuous HSL channels before native eight-bit quantization.
 *
 * The native spectrum has white at its top, saturated hue at its middle and
 * black at its bottom. Fractional channels let painting and pointer selection
 * use the same color instead of incompatible intermediate gradient rounding.
 * @param {number} hue - Color angle in degrees.
 * @param {number} saturation - HSL saturation percentage.
 * @param {number} lightness - HSL lightness percentage.
 * @returns {[number, number, number]} Continuous RGB intensities from zero through 255.
 * @throws {RangeError} If a coordinate is nonfinite or outside its percentage range.
 * @example
 * hslColorChannels(0,50,50); // [191.25, 63.75, 63.75]
 */
export function hslColorChannels(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  if (
    !Number.isFinite(hue) ||
    !Number.isFinite(saturation) ||
    !Number.isFinite(lightness) ||
    saturation < 0 ||
    saturation > 100 ||
    lightness < 0 ||
    lightness > 100
  )
    throw new RangeError("HSL percentages are outside their finite range.");
  /** Continuous chroma and sector values avoid intermediate eight-bit rounding. */
  const sector = (((hue % 360) + 360) % 360) / 60,
    chroma = ((1 - Math.abs((2 * lightness) / 100 - 1)) * saturation) / 100,
    secondary = chroma * (1 - Math.abs((sector % 2) - 1)),
    minimum = lightness / 100 - chroma / 2;
  /** Hue components are combined with the achromatic lightness contribution. */
  const channels =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  return [
    Math.max(0, Math.min(255, (channels[0] + minimum) * 255)),
    Math.max(0, Math.min(255, (channels[1] + minimum) * 255)),
    Math.max(0, Math.min(255, (channels[2] + minimum) * 255)),
  ];
}
