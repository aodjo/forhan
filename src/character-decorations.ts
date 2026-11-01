import { normalizeColor } from "./colors.ts";

/** Native line-shape order observed through installed Hangul character properties and saved XML. */
export const NATIVE_LINE_PATTERNS = [
  "SOLID",
  "DOT",
  "DASH",
  "DASH_DOT",
  "DASH_DOT_DOT",
  "LONG_DASH",
  "CIRCLE",
  "DOUBLE_SLIM",
  "SLIM_THICK",
  "THICK_SLIM",
  "SLIM_THICK_SLIM",
  "WAVE",
  "DOUBLEWAVE",
] as const;

/** Accessible Korean descriptions accompany independently drawn native line samples. */
export const NATIVE_LINE_LABELS = [
  "실선",
  "점선",
  "파선",
  "일점쇄선",
  "이점쇄선",
  "긴 파선",
  "원형 점선",
  "이중 실선",
  "가는 선과 굵은 선",
  "굵은 선과 가는 선",
  "가는 선과 굵은 선과 가는 선",
  "물결선",
  "이중 물결선",
] as const;

/** Source mark type determines independent default colors and valid native line choices. */
export type DecorationKind = "underline" | "strike";
/** Original native position remains distinct from the independent strikeout flag. */
export type DecorationPosition = "BOTTOM" | "CENTER" | "TOP";
/** Validated source settings have no dependency on the DOM or a platform font. */
export interface CharacterDecoration {
  nativePosition: DecorationPosition;
  nativePattern: number;
  nativeColor: string | null;
}

/**
 * Validate an independent native underline or strikeout character definition.
 *
 * Missing values retain ordinary editor defaults. Unknown shapes fail before
 * serialization instead of becoming solid lines, and explicit colors remain
 * separate from foreground text color. CENTER is retained for imported files.
 * @param {unknown} value - Original mark attributes or absent ordinary defaults.
 * @param {DecorationKind} kind - Actual native character decoration.
 * @returns {CharacterDecoration} Canonical native position, pattern and opaque color.
 * @throws {RangeError} If a position, pattern or explicit color is unsupported.
 * @example
 * characterDecoration({nativePosition:'TOP',nativePattern:11},'underline'); // A native overline wave.
 */
export function characterDecoration(
  value: unknown,
  kind: DecorationKind,
): CharacterDecoration {
  /** Imported attributes are never treated as executable markup or style text. */
  const attrs =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {},
    position = attrs.nativePosition ?? "BOTTOM",
    pattern = attrs.nativePattern ?? 0;
  if (!["BOTTOM", "CENTER", "TOP"].includes(String(position)))
    throw new RangeError("Unsupported native decoration position.");
  if (!Number.isInteger(pattern) || Number(pattern) < 0 || Number(pattern) > 12)
    throw new RangeError("Unsupported native decoration pattern.");
  return {
    nativePosition:
      kind === "strike" ? "BOTTOM" : (position as DecorationPosition),
    nativePattern: Number(pattern),
    nativeColor: normalizeColor(attrs.nativeColor),
  };
}

/**
 * Resolve a native XML line name without substituting a visually different pattern.
 *
 * XML and binary line orders are mapped explicitly from installed-native
 * generated samples; DOT and DASH must not be swapped by a prose table.
 * @param {unknown} shape - Original OWPML line-name scalar.
 * @param {DecorationKind} kind - Independent underline or strikeout domain.
 * @returns {number} Original native numeric line pattern.
 * @throws {RangeError} If the original pattern cannot be represented.
 * @example
 * nativeDecorationPattern('DOUBLEWAVE','underline'); // 12
 */
export function nativeDecorationPattern(
  shape: unknown,
  kind: DecorationKind,
): number {
  /** The native vocabularies are fixed strings independent of imported markup. */
  const index = NATIVE_LINE_PATTERNS.indexOf(
    String(shape ?? "SOLID") as (typeof NATIVE_LINE_PATTERNS)[number],
  );
  return characterDecoration({ nativePattern: index }, kind).nativePattern;
}

/**
 * Draw one independently authored native line tile for controls and complex text patterns.
 *
 * Every pattern has distinct geometry, including asymmetric double lines,
 * triple lines and double waves. The caller controls repeated physical width;
 * no native program icon, font file or raster image is embedded.
 * @param {number} pattern - Validated native line index from zero through twelve.
 * @param {string} [color='#173a60'] - Opaque line color, normalized before SVG insertion.
 * @param {number} [width=16] - Original tile or repeated control-sample width.
 * @returns {string} Original SVG tile with a sixteen by eight coordinate system.
 * @throws {RangeError} If the line index or color is invalid.
 * @example
 * nativeLineSvg(10,'#123456'); // Three independently drawn horizontal strokes.
 */
export function nativeLineSvg(
  pattern: number,
  color = "#173a60",
  width = 16,
): string {
  if (!Number.isInteger(width) || width < 1 || width > 1000)
    throw new RangeError("Invalid native line sample width.");
  /** Canonical values prevent source strings from injecting SVG attributes. */
  const style = characterDecoration(
      { nativePattern: pattern, nativeColor: color },
      "underline",
    ),
    ink = style.nativeColor || "#173a60";
  let drawing: string;
  if (pattern === 11 || pattern === 12) {
    drawing = `<path d="M-4 4Q0 0 4 4T12 4T20 4" fill="none" stroke="${ink}"/>`;
    if (pattern === 12)
      drawing += `<path d="M-4 7Q0 3 4 7T12 7T20 7" fill="none" stroke="${ink}"/>`;
  } else if (pattern === 6)
    drawing = `<circle cx="3" cy="4" r="1.5" fill="none" stroke="${ink}"/><circle cx="11" cy="4" r="1.5" fill="none" stroke="${ink}"/>`;
  else if (pattern >= 7) {
    drawing = `<path d="M0 2H16M0 6H16" stroke="${ink}"/>`;
    if (pattern === 8)
      drawing += `<path d="M0 5H16" stroke="${ink}" stroke-width="2"/>`;
    if (pattern === 9)
      drawing += `<path d="M0 3H16" stroke="${ink}" stroke-width="2"/>`;
    if (pattern === 10)
      drawing += `<path d="M0 4H16" stroke="${ink}" stroke-width="2"/>`;
  } else {
    /** Exact repeating dash sequences distinguish native dotted and compound patterns. */
    const dash = ["", "1 3", "5 3", "7 3 1 5", "6 2 1 2 1 4", "12 4"][pattern];
    drawing = `<path d="M0 4H32" stroke="${ink}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  }
  if (width !== 16) {
    /** Fixed local pattern identity cannot be supplied by imported markup. */
    const id = `forhan-line-${pattern}-${ink.slice(1)}`;
    drawing = `<defs><pattern id="${id}" width="16" height="8" patternUnits="userSpaceOnUse">${drawing}</pattern></defs><rect width="${width}" height="8" fill="url(#${id})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="8" viewBox="0 0 ${width} 8">${drawing}</svg>`;
}

/**
 * Render independent native decoration metadata and actual line drawing styles.
 *
 * Common patterns use real CSS text decorations across wrapped fragments.
 * Compound shapes have distinct repeated SVG tiles rather than collapsing to
 * solid. Glyph metrics and source text remain unchanged. Their exact native
 * vertical raster positions still depend on the platform font engine.
 * @param {unknown} attrs - Original native mark attributes.
 * @param {DecorationKind} kind - Underline or independent strikeout.
 * @returns {Record<string,string>} Safe HTML ownership metadata and drawing CSS.
 * @throws {RangeError} If native attributes cannot be represented.
 * @example
 * decorationHtml({nativePosition:'TOP',nativePattern:7,nativeColor:'#123456'},'underline');
 */
export function decorationHtml(
  attrs: unknown,
  kind: DecorationKind,
): Record<string, string> {
  /** Independent source properties are validated before building trusted CSS. */
  const source = characterDecoration(attrs, kind),
    line =
      kind === "strike" || source.nativePosition === "CENTER"
        ? "line-through"
        : source.nativePosition === "TOP"
          ? "overline"
          : "underline",
    color =
      source.nativeColor || (kind === "strike" ? "#000000" : "currentColor"),
    common = new Map([
      [0, "solid"],
      [1, "dotted"],
      [2, "dashed"],
      [7, "double"],
      [11, "wavy"],
    ]);
  let style = `text-decoration-line:${line};text-decoration-color:${color};text-decoration-skip-ink:none`;
  if (common.has(source.nativePattern))
    style += `;text-decoration-style:${common.get(source.nativePattern)}`;
  else style = "text-decoration-line:none";
  return {
    "data-forhan-decoration": kind,
    "data-forhan-line-position": source.nativePosition,
    "data-forhan-line-pattern": String(source.nativePattern),
    ...(source.nativeColor
      ? { "data-forhan-line-color": source.nativeColor }
      : {}),
    style,
  };
}

/**
 * Normalize foreign inline line decorations before semantic editor parsing.
 *
 * ProseMirror style rules receive only a declaration value, so they cannot
 * recover the same element's independent color, shape and position. Real
 * semantic wrappers retain those properties together without changing text,
 * existing foreground styles or explicit native-owned marks.
 * @param {HTMLElement} root - Detached sanitized HTML body or rich clipboard container.
 * @returns {void} Adds semantic line wrappers only for foreign explicit inline decorations.
 * @throws {RangeError} If an explicit source line color cannot be stored natively.
 * @example
 * normalizeHtmlDecorations(parsed.body); // Foreign colored overlines become complete editable native marks.
 */
export function normalizeHtmlDecorations(root: HTMLElement): void {
  /** Snapshot source elements before inserting wrappers so each original declaration is handled once. */
  const elements = [root, ...root.querySelectorAll<HTMLElement>("[style]")];
  for (/** Native-owned semantic markup already carries complete independent source properties. */ const element of elements) {
    if (element.dataset.forhanDecoration) continue;
    /** Actual inline CSS longhands expose both shorthand and explicit declarations. */
    const line = element.style.textDecorationLine,
      cssPattern = element.style.textDecorationStyle,
      declaredColor = element.style.textDecorationColor,
      pattern =
        (
          { dotted: 1, dashed: 2, double: 7, wavy: 11 } as Record<
            string,
            number
          >
        )[cssPattern] || 0;
    if (!/(?:underline|overline|line-through)/.test(line)) continue;
    element.style.removeProperty("text-decoration");
    element.style.removeProperty("text-decoration-line");
    element.style.removeProperty("text-decoration-style");
    element.style.removeProperty("text-decoration-color");
    for (/** Both independent decorations can coexist on one real foreign source element. */ const kind of [
      "underline",
      "strike",
    ] as const) {
      if (
        kind === "underline"
          ? !/(?:underline|overline)/.test(line)
          : !line.includes("line-through")
      )
        continue;
      let color =
        declaredColor && declaredColor.toLowerCase() !== "currentcolor"
          ? declaredColor
          : null;
      if (!color && kind === "strike") {
        for (
          let ancestor: HTMLElement | null = element;
          ancestor;
          ancestor = ancestor.parentElement
        )
          if (ancestor.style.color) {
            color = ancestor.style.color;
            break;
          }
        color ||= "#000000";
      }
      /** Original foreign wave shapes remain intact even when absent from the native strike dropdown. */
      const attrs = decorationHtml(
          {
            nativePosition: line.includes("overline") ? "TOP" : "BOTTOM",
            nativePattern: pattern,
            nativeColor: color,
          },
          kind,
        ),
        tag = kind === "underline" ? "u" : "s",
        wrapper =
          element.tagName.toLowerCase() === tag
            ? element
            : root.ownerDocument.createElement(tag);
      for (/** Only trusted normalized source metadata and generated geometry enter native wrappers. */ const [
        key,
        value,
      ] of Object.entries(attrs)) {
        if (key === "style") wrapper.style.cssText += ";" + value;
        else wrapper.setAttribute(key, value);
      }
      if (wrapper !== element) {
        wrapper.append(...element.childNodes);
        element.appendChild(wrapper);
      }
    }
  }
}
