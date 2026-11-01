import {
  paragraphCssPoints,
  readParagraphDistance,
  renderParagraphDistance,
  nativeParagraphDistanceCss,
  NATIVE_PARAGRAPH_CSS_TOLERANCE_POINTS,
} from "./paragraph-distance.ts";
import { parseParagraphMeasure } from "./formats/paragraph-measures.ts";
import { nativeParagraphLengthPoints } from "./formatting.ts";

/**
 * Render native hanging indentation using the browser's first-line CSS model.
 *
 * Hancom keeps the first line at the native left margin and moves later lines
 * right. CSS negative text-indent moves the first line left, so its block margin
 * must include the hanging magnitude. A literal data attribute retains the
 * native margin for lossless HTML reimport. Unsupported CSS expressions remain
 * standard CSS and are left to the existing native-export validation.
 * @param {Record<string, unknown>} attrs - Canonical native paragraph attributes.
 * @returns {Record<string, string>} Margin CSS and optional native-margin marker.
 * @example
 * renderParagraphMargin({marginLeft:'12pt',textIndent:'-18pt'});
 * // CSS uses a 30pt block margin and an -18pt first-line indent.
 */
export function renderParagraphMargin(
  attrs: Record<string, unknown>,
): Record<string, string> {
  /** Canonical margin and signed native first-line distance. */
  const left = String(attrs.marginLeft || "0pt");
  /** Negative native indentation moves continuation lines rather than the first line. */
  const indent = String(attrs.textIndent || "").trim();
  if (indent.startsWith("-") && parseFloat(indent) < 0) {
    try {
      parseParagraphMeasure(left);
      parseParagraphMeasure(indent);
      return {
        style: `margin-left:${Number((nativeParagraphLengthPoints(left) + nativeParagraphLengthPoints(indent.slice(1))).toFixed(8))}pt`,
        "data-forhan-native-margin-left": left,
      };
    } catch {
      // Preserve unsupported CSS expressions until an explicit native export validates them.
    }
  }
  return renderParagraphDistance(attrs, "marginLeft");
}

/**
 * Restore native margins from exported or ordinary browser paragraph markup.
 *
 * Forhan markup retains its original native margin explicitly. Standard HTML
 * negative indentation is converted back into Hancom's continuation-line model.
 * Ordinary external em values resolve against the paragraph's inline font
 * size; native CHAR markers retain their independent nominal point meaning.
 * @param {HTMLElement} element - Imported paragraph or heading element.
 * @returns {string | null} Canonical native left margin, or null when absent.
 * @example
 * readParagraphMargin(element); // A CSS 12pt margin and -18pt indent become -6pt.
 */
export function readParagraphMargin(element: HTMLElement): string | null {
  /** Native ownership metadata must still agree with the actual rendered geometry. */
  const retained = element.getAttribute("data-forhan-native-margin-left");
  if (retained !== null) {
    /** A changed first-line CSS offset can invalidate the original hanging compensation. */
    const indent = readParagraphDistance(element, "textIndent") || "0pt",
      actual = paragraphCssPoints(element.style.marginLeft, element);
    let expected = paragraphCssPoints(
      nativeParagraphDistanceCss(retained),
      element,
    );
    if (indent.startsWith("-") && parseFloat(indent) < 0) {
      /** Resolve the native hanging magnitude independently from external font-relative CSS. */
      const hanging = paragraphCssPoints(
        nativeParagraphDistanceCss(indent.slice(1)),
        element,
      );
      if (expected !== null && hanging !== null) expected += hanging;
      else expected = null;
    }
    if (
      expected !== null &&
      actual !== null &&
      Math.abs(expected - actual) < NATIVE_PARAGRAPH_CSS_TOLERANCE_POINTS
    )
      return retained;
  }
  /** Standard HTML block margin before its first-line CSS offset is applied. */
  const left = readParagraphDistance(element, "marginLeft") || "";
  /** Standard first-line offset, whose negative value requires inverse mapping. */
  const indent = element.style.textIndent;
  if (indent.startsWith("-") && parseFloat(indent) < 0) {
    try {
      /** Real external CSS remains authoritative when native metadata is missing or stale. */
      const margin = paragraphCssPoints(
          element.style.marginLeft || "0pt",
          element,
        ),
        first = paragraphCssPoints(indent, element);
      if (margin !== null && first !== null)
        return `${Number((margin + first).toFixed(8))}pt`;
    } catch {
      // Keep unrepresentable CSS intact rather than silently replacing it with zero.
    }
  }
  return left || null;
}
