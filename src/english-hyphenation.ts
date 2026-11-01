import { ENGLISH_HYPHENATION_PATTERNS } from "./data/english-hyphenation.ts";

/** A Liang trie node retains weighted pattern endings independently from child letters. */
interface HyphenationTrie {
  next: Map<string, HyphenationTrie>;
  weights?: number[];
}

/** Compiled public English patterns are shared locally without downloads or OS dictionaries. */
let englishTrie: HyphenationTrie | undefined;

/**
 * Compile the bundled public English Liang patterns on their first actual use.
 *
 * Numeric weights override weaker pattern matches. Only the bundled single
 * pattern level is accepted; malformed data fails rather than changing words.
 * @returns {HyphenationTrie} Immutable-by-convention local pattern lookup tree.
 * @throws {Error} If bundled data contains an unsupported directive or pattern.
 * @example
 * // One compiled trie serves editing, standalone HTML and native printing offline.
 */
function englishPatterns(): HyphenationTrie {
  if (englishTrie) return englishTrie;
  /** Root children represent original dictionary code points rather than source text edits. */
  const root: HyphenationTrie = { next: new Map() };
  for (/** Public header directives are validated independently from weighted dictionary entries. */ const line of ENGLISH_HYPHENATION_PATTERNS.split(
    /\r?\n/,
  )) {
    if (
      !line ||
      line === "UTF-8" ||
      /^(?:COMPOUND)?(?:LEFT|RIGHT)HYPHENMIN [23]$/.test(line)
    )
      continue;
    if (!/^[^\s/]+$/.test(line) || line === "NEXTLEVEL")
      throw new Error("Unsupported bundled English hyphenation pattern.");
    /** Inter-letter weights preserve every maximum original dictionary priority. */
    const letters: string[] = [],
      weights = [0];
    for (/** Original single-digit weights occupy the boundary before the following letter. */ const character of line) {
      if (/^[0-9]$/.test(character))
        weights[weights.length - 1] = Number(character);
      else {
        letters.push(character);
        weights.push(0);
      }
    }
    let node = root;
    for (/** Shared pattern prefixes make lookup independent of the full dictionary size. */ const letter of letters) {
      if (!node.next.has(letter)) node.next.set(letter, { next: new Map() });
      node = node.next.get(letter)!;
    }
    if (node.weights)
      for (let index = 0; index < weights.length; index++)
        weights[index] = Math.max(weights[index], node.weights[index] || 0);
    node.weights = weights;
  }
  englishTrie = root;
  return root;
}

/**
 * Find deterministic English discretionary breaks without altering original text.
 *
 * The public dictionary uses Liang's maximum-weight overlay; odd boundaries
 * permit breaks. Native Unicode offsets remain original UTF-16 positions.
 * Non-ASCII words and words containing numbers are preserved without guesses.
 * @param {string} word - Complete original English source word.
 * @returns {number[]} Permitted original source boundaries, in ascending order.
 * @throws {Error} If the bundled dictionary is malformed.
 * @example
 * englishHyphenationPoints('hyphenation'); // Original positions of discretionary breaks.
 */
export function englishHyphenationPoints(word: string): number[] {
  if (!/^[A-Za-z]{5,1024}$/.test(word)) return [];
  /** Boundary markers participate in dictionary matching without entering original source. */
  const text = "." + word.toLowerCase() + ".",
    weights = new Uint8Array(text.length + 1),
    root = englishPatterns(),
    result: number[] = [];
  for (let start = 0; start < text.length; start++) {
    let node: HyphenationTrie | undefined = root;
    for (let index = start; index < text.length; index++) {
      node = node.next.get(text[index]);
      if (!node) break;
      if (node.weights)
        for (let offset = 0; offset < node.weights.length; offset++)
          weights[start + offset] = Math.max(
            weights[start + offset],
            node.weights[offset],
          );
    }
  }
  for (let boundary = 2; boundary <= word.length - 3; boundary++)
    if (weights[boundary + 1] & 1) result.push(boundary);
  return result;
}

/**
 * Create one rendering-only discretionary hyphen at an original source boundary.
 *
 * The marker never enters the editor model. Clipboard serialization uses the
 * original model and HTML reimport discards this explicit drawing marker.
 * @param {Document} document - Actual owning editor or static output document.
 * @returns {HTMLElement} Transparent inline manual-hyphen drawing marker.
 * @example
 * const marker=createHyphenDrawing(printDocument);
 */
export function createHyphenDrawing(document: Document): HTMLElement {
  /** Only the layout tree contains the discretionary glyph; original source stays unchanged. */
  const marker = document.createElement("forhan-hyphen");
  marker.setAttribute("data-forhan-hyphen-drawing", "");
  marker.setAttribute("aria-hidden", "true");
  marker.setAttribute("contenteditable", "false");
  marker.style.cssText = "hyphens:manual;word-break:normal";
  marker.textContent = "\u00ad";
  return marker;
}

/**
 * Remove owned discretionary drawings before parsing original clipboard source.
 *
 * Render-only soft hyphens must never become authored Unicode during HTML
 * paste or reimport. Unmarked literal source characters remain untouched.
 * @param {HTMLElement} root - Owned detached clipboard or imported HTML body.
 * @returns {void} Removes only explicit owned hyphen drawing nodes.
 * @example
 * removeHyphenDrawings(clipboardDocument.body);
 */
export function removeHyphenDrawings(root: HTMLElement): void {
  for (/** Only explicit drawing protocol nodes are removed from the detached source copy. */ const marker of root.querySelectorAll(
    "[data-forhan-hyphen-drawing]",
  ))
    marker.remove();
}
