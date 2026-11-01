/** Canonical native paragraph alignments in their actual HWP binary enumeration order. */
export const PARAGRAPH_ALIGNMENTS = [
  "justify",
  "left",
  "right",
  "center",
  "distribute",
  "split",
] as const;
/** Editable paragraph alignment retains both distinct native distribution modes. */
export type ParagraphAlignment = (typeof PARAGRAPH_ALIGNMENTS)[number];

/**
 * Normalize model or native XML alignment without merging distribution modes.
 *
 * HWPX calls word distribution DISTRIBUTE_SPACE; the editor uses the existing
 * native toolbar identifier split. Unknown source values retain the caller's
 * established fallback instead of inventing an unsupported native enumeration.
 * @param {unknown} value - Model or native horizontal alignment.
 * @param {ParagraphAlignment} [fallback='left'] - Alignment used for absent or unknown input.
 * @returns {ParagraphAlignment} One of the six independent native alignment modes.
 * @example
 * paragraphAlignment('DISTRIBUTE_SPACE'); // 'split'
 */
export function paragraphAlignment(
  value: unknown,
  fallback: ParagraphAlignment = "left",
): ParagraphAlignment {
  /** Native XML spelling is the only alias needed by the editable model. */
  const source = String(value ?? "")
    .trim()
    .toLowerCase();
  if (source === "distribute_space") return "split";
  return PARAGRAPH_ALIGNMENTS.includes(source as ParagraphAlignment)
    ? (source as ParagraphAlignment)
    : fallback;
}

/**
 * Encode an editable paragraph alignment as its native binary enumeration.
 *
 * Distribution of characters and distribution of words use different values;
 * both must survive an independently written HWP file.
 * @param {unknown} value - Canonical editable paragraph alignment.
 * @returns {number} Native enumeration from zero through five.
 * @example
 * hwpParagraphAlignment('split'); // 5
 */
export function hwpParagraphAlignment(value: unknown): number {
  return PARAGRAPH_ALIGNMENTS.indexOf(paragraphAlignment(value));
}

/**
 * Encode an editable paragraph alignment using native HWPX enum spelling.
 *
 * The editor's split command is DISTRIBUTE_SPACE in the published native XML
 * model. It cannot be written as SPLIT, LEFT or JUSTIFY without changing data.
 * @param {unknown} value - Canonical editable paragraph alignment.
 * @returns {string} Valid native horizontal alignment enumeration.
 * @example
 * hwpxParagraphAlignment('split'); // 'DISTRIBUTE_SPACE'
 */
export function hwpxParagraphAlignment(value: unknown): string {
  /** Native space distribution uses a longer name than its toolbar command. */
  const alignment = paragraphAlignment(value);
  return alignment === "split" ? "DISTRIBUTE_SPACE" : alignment.toUpperCase();
}

/**
 * Render native alignment as actual character or word justification CSS.
 *
 * Both distribution modes justify the last line, including hard-break lines.
 * Explicit ordinary defaults prevent inherited distribution settings from
 * accidentally changing a later paragraph's standard alignment.
 * @param {unknown} value - Canonical native alignment.
 * @returns {Record<string,string>} Physical browser alignment and semantic marker.
 * @example
 * renderParagraphAlignment('distribute'); // Justifies every line between characters.
 */
export function renderParagraphAlignment(
  value: unknown,
): Record<string, string> {
  /** Canonical modes determine real CSS rather than unsupported text-align keywords. */
  const alignment = paragraphAlignment(value, "justify");
  return {
    "data-forhan-paragraph-alignment": alignment,
    style:
      alignment === "distribute" || alignment === "split"
        ? `text-align:justify;text-align-last:justify;text-justify:${alignment === "distribute" ? "inter-character" : "inter-word"}`
        : `text-align:${alignment};text-align-last:auto;text-justify:auto`,
  };
}

/**
 * Import actual alignment CSS without trusting a stale native metadata marker.
 *
 * Physical CSS remains authoritative after external HTML editing. Explicit
 * last-line character/word justification maps naturally to the corresponding
 * native mode; ordinary justify remains distinct from both distribution modes.
 * @param {HTMLElement} element - Imported paragraph or heading.
 * @returns {ParagraphAlignment|null} Actual inline alignment or null when absent.
 * @example
 * readParagraphAlignment(element); // 'split' for last-line inter-word justification.
 */
export function readParagraphAlignment(
  element: HTMLElement,
): ParagraphAlignment | null {
  /** Real CSS can change independently of the optional native semantic marker. */
  const alignment = element.style.textAlign.trim().toLowerCase();
  if (!alignment) return null;
  if (alignment === "justify" && element.style.textAlignLast === "justify") {
    /** Modern Chromium supports both explicit native distribution strategies. */
    const method = element.style.getPropertyValue("text-justify").trim();
    if (method === "inter-character" || method === "distribute")
      return "distribute";
    if (method === "inter-word") return "split";
  }
  return paragraphAlignment(alignment, "justify");
}
