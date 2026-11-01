import {
  DEFAULT_FONT_SIZE,
  defaultFontSize,
  storedFontSizePoints,
  paragraphLengthPoints,
  nativeCharacterDistancePoints,
} from "./formatting.ts";

/** Canonical paragraph names and their actual browser CSS properties. */
export const PARAGRAPH_DISTANCE_CSS = {
  lineHeight: "line-height",
  marginLeft: "margin-left",
  marginRight: "margin-right",
  marginTop: "margin-top",
  marginBottom: "margin-bottom",
  textIndent: "text-indent",
} as const;
/** Paragraph distances that can retain native unit ownership in exported HTML. */
export type ParagraphDistanceProperty = keyof typeof PARAGRAPH_DISTANCE_CSS;

/** CSSOM six-digit pixel rounding allowance, below native hundredth-point storage resolution. */
export const NATIVE_PARAGRAPH_CSS_TOLERANCE_POINTS = 0.0005;

/**
 * Resolve nominal native CHAR notation before assigning real CSS.
 *
 * Existing model and native serialization units stay unchanged. Physical CSS
 * prevents current text size from doubling an imported native paragraph offset.
 * @param {unknown} value - Canonical native paragraph distance.
 * @returns {string} Physical native CHAR CSS, or the original other CSS value.
 * @example
 * nativeParagraphDistanceCss('1.5em'); // '7.5pt'
 */
export function nativeParagraphDistanceCss(value: unknown): string {
  /** Recognized native character values have a fixed nominal point meaning. */
  const points = nativeCharacterDistancePoints(value);
  return points === null ? String(value ?? "") : `${points}pt`;
}

/**
 * Render physical CSS while retaining the original native CHAR source unit.
 *
 * A literal marker keeps native model notation distinct from external HTML's
 * ordinary font-relative em values. Unset attributes introduce no declaration.
 * @param {Record<string,unknown>} attrs - Actual paragraph model attributes.
 * @param {ParagraphDistanceProperty} property - Canonical distance attribute.
 * @returns {Record<string,string>} CSS and optional original native-unit marker.
 * @example
 * renderParagraphDistance({lineHeight:'1.5em'},'lineHeight'); // 7.5pt plus its native marker.
 */
export function renderParagraphDistance(
  attrs: Record<string, unknown>,
  property: ParagraphDistanceProperty,
): Record<string, string> {
  if (!attrs[property]) return {};
  /** Only recognized native CHAR values receive source-unit ownership metadata. */
  const source = String(attrs[property]),
    css = PARAGRAPH_DISTANCE_CSS[property];
  return {
    style: `${css}:${nativeParagraphDistanceCss(source)}`,
    ...(nativeCharacterDistancePoints(source) !== null
      ? { ["data-forhan-native-" + css]: source }
      : {}),
  };
}

/**
 * Resolve explicit inline font context for ordinary external CSS imports.
 *
 * Ancestor declarations, relative em sizes and percentages resolve in order.
 * The document and heading defaults supply unstyled context; nested text-span
 * size does not change its paragraph's own CSS length unit.
 * @param {HTMLElement} element - Paragraph or heading being imported.
 * @returns {number} Nonnegative paragraph CSS font size in points.
 * @example
 * paragraphHtmlFontSize(element); // 20 for font-size:20pt.
 */
export function paragraphHtmlFontSize(element: HTMLElement): number {
  /** Detached HTML still retains its explicit inline ancestor cascade. */
  const ancestry: HTMLElement[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    ancestry.unshift(node);
  let size = DEFAULT_FONT_SIZE;
  for (/** Each ancestor contributes at most its own inline font declaration. */ const node of ancestry) {
    /** Relative font sizes use the previously inherited inline context. */
    const source = node.style.fontSize.trim(),
      relative = source.match(/^(\d+(?:\.\d+)?)\s*(em|%)$/i);
    if (relative) size *= Number(relative[1]) / (relative[2] === "%" ? 100 : 1);
    else if (source) size = storedFontSizePoints(source, size);
    else if (node === element && /^H[1-6]$/.test(node.tagName))
      size = defaultFontSize(Number(node.tagName.slice(1)));
  }
  return Number.isFinite(size) ? size : DEFAULT_FONT_SIZE;
}

/**
 * Resolve supported external CSS distances without treating them as native CHAR.
 *
 * Simple sums cover older physical calc exports of native hanging indentation.
 * Unsupported expressions return null instead of silently becoming zero.
 * @param {string} source - Actual inline CSS distance.
 * @param {HTMLElement} element - Paragraph supplying its inline font context.
 * @returns {number|null} Physical points or null for unsupported expressions.
 * @example
 * paragraphCssPoints('1.5em',element); // 30 with ordinary CSS font-size:20pt.
 */
export function paragraphCssPoints(
  source: string,
  element: HTMLElement,
): number | null {
  /** A supported plain CSS length needs no attached browser layout tree. */
  const plain =
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*(?:pt|px|mm|cm|in|pc|em)$/i;
  if (plain.test(source))
    return paragraphLengthPoints(source, paragraphHtmlFontSize(element));
  /** CSSOM can retain a simple signed pair or simplify it to a single term. */
  const calc = source.match(/^calc\(([^()]*)\)$/i);
  if (!calc) return null;
  /** Parse only an explicit length sum/difference, without evaluating arbitrary expressions. */
  const terms = calc[1].trim().split(/\s+([+-])\s+/);
  if (terms.length === 1 && plain.test(terms[0]))
    return paragraphLengthPoints(terms[0], paragraphHtmlFontSize(element));
  if (terms.length !== 3 || !plain.test(terms[0]) || !plain.test(terms[2]))
    return null;
  return (
    paragraphLengthPoints(terms[0], paragraphHtmlFontSize(element)) +
    (terms[1] === "-" ? -1 : 1) *
      paragraphLengthPoints(terms[2], paragraphHtmlFontSize(element))
  );
}

/**
 * Import a distance without letting stale metadata hide actual external edits.
 *
 * Native markers survive only while current physical CSS still agrees with
 * them. Ordinary external em values resolve through their inline font context
 * instead of becoming the model's nominal native character unit.
 * @param {HTMLElement} element - Imported paragraph or heading.
 * @param {ParagraphDistanceProperty} property - Canonical paragraph attribute.
 * @returns {string|null} Retained native value or actual external CSS distance.
 * @example
 * readParagraphDistance(element,'lineHeight'); // A native marker retains 1.5em behind 7.5pt CSS.
 */
export function readParagraphDistance(
  element: HTMLElement,
  property: ParagraphDistanceProperty,
): string | null {
  /** Rendered CSS stays authoritative over stale native-unit ownership metadata. */
  const css = PARAGRAPH_DISTANCE_CSS[property],
    source = element.style.getPropertyValue(css),
    retained = element.getAttribute("data-forhan-native-" + css);
  if (retained !== null) {
    /** A native marker cannot override a changed or absent physical declaration. */
    const expected = nativeCharacterDistancePoints(retained),
      actual = paragraphCssPoints(source, element);
    if (
      expected !== null &&
      actual !== null &&
      Math.abs(expected - actual) < NATIVE_PARAGRAPH_CSS_TOLERANCE_POINTS
    )
      return retained;
  }
  if (!source) return null;
  if (/em/i.test(source)) {
    /** Supported font-relative external CSS becomes its actual physical native distance. */
    const points = paragraphCssPoints(source, element);
    if (points !== null) return `${Number(points.toFixed(8))}pt`;
  }
  return source;
}
