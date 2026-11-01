import {
  englishHyphenationPoints,
  createHyphenDrawing,
} from "./english-hyphenation.ts";

/** Native Latin paragraph modes retain their binary meanings, including a reserved imported value. */
export type NativeLatinWordBreak = 0 | 1 | 2 | 3;

/** Native non-Latin paragraph modes distinguish complete words from characters. */
export type NativeNonLatinWordBreak = 0 | 1;

/** Independent native paragraph choices do not collapse into one CSS word-break value. */
export interface ParagraphWordBreaks {
  latin: NativeLatinWordBreak;
  nonLatin: NativeNonLatinWordBreak;
}

/** Original native defaults use Latin words and non-Latin characters. */
export const DEFAULT_PARAGRAPH_WORD_BREAKS: Readonly<ParagraphWordBreaks> =
  Object.freeze({ latin: 0, nonLatin: 1 });

/** Latin option labels retain native numeric modes independently from their displayed order. */
export const LATIN_WORD_BREAK_OPTIONS = [
  { value: 0, label: "단어" },
  { value: 2, label: "글자" },
  { value: 1, label: "하이픈" },
] as const;

/** Native non-Latin option labels retain the original paragraph dialog terminology. */
export const NON_LATIN_WORD_BREAK_OPTIONS = [
  { value: 1, label: "글자" },
  { value: 0, label: "어절" },
] as const;

/** Published native XML values map independently from the binary numeric order. */
const LATIN_XML_WORD_BREAKS = [
  "KEEP_WORD",
  "HYPHENATION",
  "BREAK_WORD",
] as const;

/** Installed Hangul maps non-Latin XML names inversely to its binary/COM character-mode bit. */
const NON_LATIN_XML_WORD_BREAKS = ["BREAK_WORD", "KEEP_WORD"] as const;

/**
 * Validate one exact native mode or its invariant control value.
 *
 * Boolean, empty and nonnumeric source values cannot silently become a
 * different native paragraph choice through JavaScript number coercion.
 * @param {unknown} value - Original source or control value.
 * @param {number} fallback - Native default used only for absent source values.
 * @param {number} maximum - Largest representable native mode.
 * @returns {number} Original validated native numeric mode.
 * @throws {RangeError} If a supplied value is malformed or outside the native range.
 * @example
 * nativeWordBreakMode('2',0,3); // 2
 */
function nativeWordBreakMode(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (value === null || value === undefined) return fallback;
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^[0-3]$/.test(value))
  )
    throw new RangeError("문단의 줄 나눔 설정을 확인하세요.");
  /** Native values must remain integral and within their independent encoded range. */
  const mode = Number(value);
  if (!Number.isInteger(mode) || mode < 0 || mode > maximum)
    throw new RangeError("문단의 줄 나눔 설정을 확인하세요.");
  return mode;
}

/**
 * Resolve original native paragraph word-breaking choices.
 *
 * Missing values use the installed application's defaults. Imported binary
 * Latin value three remains representable for HWP/FHN preservation, while
 * malformed or out-of-range values never silently change native behavior.
 * @param {Record<string,unknown>} [attrs={}] - Original paragraph source attributes.
 * @returns {ParagraphWordBreaks} Independent validated native breaking modes.
 * @throws {RangeError} If a supplied native mode is outside its encoded range.
 * @example
 * paragraphWordBreaks({nativeBreakLatinWord:2,nativeBreakNonLatinWord:0});
 */
export function paragraphWordBreaks(
  attrs: Record<string, unknown> = {},
): ParagraphWordBreaks {
  /** Native numeric strings from controls and imported numeric properties share one bounded encoding. */
  const latin = nativeWordBreakMode(
      attrs.nativeBreakLatinWord,
      DEFAULT_PARAGRAPH_WORD_BREAKS.latin,
      3,
    ),
    nonLatin = nativeWordBreakMode(
      attrs.nativeBreakNonLatinWord,
      DEFAULT_PARAGRAPH_WORD_BREAKS.nonLatin,
      1,
    );
  return {
    latin: latin as NativeLatinWordBreak,
    nonLatin: nonLatin as NativeNonLatinWordBreak,
  };
}

/**
 * Decode native HWPX word-breaking attributes without assigning absent source fields.
 *
 * Latin hyphenation and character breaking have distinct native XML values.
 * Missing optional source metadata remains absent for lossless source handling.
 * @param {Record<string,unknown>} [attributes={}] - Original breakSetting XML attributes.
 * @returns {Record<string,number>} Original supported editor attributes.
 * @throws {RangeError} If native source XML contains an unknown breaking mode.
 * @example
 * readHwpxWordBreaks({breakLatinWord:'HYPHENATION',breakNonLatinWord:'BREAK_WORD'});
 */
export function readHwpxWordBreaks(
  attributes: Record<string, unknown> = {},
): Record<string, number> {
  /** Only explicitly present original native attributes enter the reconstructed model. */
  const result: Record<string, number> = {};
  if (attributes.breakLatinWord !== undefined) {
    /** Latin XML ordering is independent of the displayed option ordering. */
    const value = LATIN_XML_WORD_BREAKS.indexOf(
      String(
        attributes.breakLatinWord,
      ) as (typeof LATIN_XML_WORD_BREAKS)[number],
    );
    if (value < 0)
      throw new RangeError("지원하지 않는 HWPX 영어 줄 나눔 설정입니다.");
    result.nativeBreakLatinWord = value;
  }
  if (attributes.breakNonLatinWord !== undefined) {
    /** Non-Latin character mode uses its own native numeric bit. */
    const value = NON_LATIN_XML_WORD_BREAKS.indexOf(
      String(
        attributes.breakNonLatinWord,
      ) as (typeof NON_LATIN_XML_WORD_BREAKS)[number],
    );
    if (value < 0)
      throw new RangeError("지원하지 않는 HWPX 한글 줄 나눔 설정입니다.");
    result.nativeBreakNonLatinWord = value;
  }
  return result;
}

/**
 * Encode native HWPX word-breaking choices without flattening either language mode.
 *
 * New paragraphs use original native defaults. The reserved binary Latin mode
 * has no native XML equivalent and must remain in HWP/FHN rather than being
 * silently converted to an ordinary word mode.
 * @param {Record<string,unknown>} [attrs={}] - Original paragraph source attributes.
 * @returns {{breakLatinWord:string;breakNonLatinWord:string}} Validated native XML properties.
 * @throws {RangeError} If a mode is invalid or the reserved binary value has no XML equivalent.
 * @example
 * hwpxWordBreaks({}); // Native character mode uses KEEP_WORD for non-Latin.
 */
export function hwpxWordBreaks(attrs: Record<string, unknown> = {}): {
  breakLatinWord: string;
  breakNonLatinWord: string;
} {
  /** The original validated independent modes select actual native XML names. */
  const modes = paragraphWordBreaks(attrs);
  if (modes.latin === 3)
    throw new RangeError(
      "가져온 영어 줄 나눔 값 3은 HWPX로 변환할 수 없습니다. HWP 또는 FHN으로 저장하세요.",
    );
  return {
    breakLatinWord: LATIN_XML_WORD_BREAKS[modes.latin],
    breakNonLatinWord: NON_LATIN_XML_WORD_BREAKS[modes.nonLatin],
  };
}

/**
 * Recover native paragraph modes from original HTML or explicit standard CSS.
 *
 * Retained metadata preserves independent Latin/non-Latin choices only while
 * the corresponding outer CSS still matches it. External CSS edits take
 * precedence over stale native markers. Unspecified HTML remains unspecified.
 * @param {HTMLElement} element - Original paragraph or heading element.
 * @returns {Partial<ParagraphWordBreaks>} Explicit source modes or an empty unconfigured result.
 * @example
 * readParagraphWordBreaks(paragraph); // Standard keep-all restores native word choices.
 */
export function readParagraphWordBreaks(
  element: HTMLElement,
): Partial<ParagraphWordBreaks> {
  /** Inline CSS is independent evidence when a document was edited outside the application. */
  const word = element.style.wordBreak,
    hyphens = element.style.hyphens,
    latin = element.getAttribute("data-forhan-break-latin-word"),
    nonLatin = element.getAttribute("data-forhan-break-non-latin-word");
  if (
    latin !== null &&
    nonLatin !== null &&
    /^[0-3]$/.test(latin) &&
    /^[01]$/.test(nonLatin)
  ) {
    /** Native metadata remains authoritative only for its matching original rendered style. */
    const modes = paragraphWordBreaks({
      nativeBreakLatinWord: latin,
      nativeBreakNonLatinWord: nonLatin,
    });
    if (
      word === (modes.nonLatin ? "normal" : "keep-all") &&
      hyphens === (modes.latin === 1 ? "auto" : "manual")
    )
      return modes;
  }
  if (word === "break-all") return { latin: 2, nonLatin: 1 };
  if (word === "keep-all")
    return { latin: hyphens === "auto" ? 1 : 0, nonLatin: 0 };
  if (word === "normal" || word === "break-word")
    return { latin: hyphens === "auto" ? 1 : 0, nonLatin: 1 };
  if (hyphens === "auto") return { latin: 1 };
  return {};
}

/**
 * Render independent paragraph breaking metadata and actual browser behavior.
 *
 * Non-Latin word boundaries belong to the paragraph; Latin character mode
 * receives additional transparent source-range decorations. English automatic
 * hyphenation uses an explicit language without rewriting original Unicode.
 * @param {Record<string,unknown>} attrs - Original paragraph source attributes.
 * @returns {Record<string,string>} Native metadata and outer breaking CSS.
 * @throws {RangeError} If a supplied native mode is unrepresentable.
 * @example
 * renderParagraphWordBreaks({nativeBreakLatinWord:1,nativeBreakNonLatinWord:0});
 */
export function renderParagraphWordBreaks(
  attrs: Record<string, unknown>,
): Record<string, string> {
  if (
    attrs.nativeBreakLatinWord === null ||
    attrs.nativeBreakLatinWord === undefined
  ) {
    if (
      attrs.nativeBreakNonLatinWord === null ||
      attrs.nativeBreakNonLatinWord === undefined
    )
      return {};
  }
  /** Source metadata retains both independent modes even when only one control was changed. */
  const modes = paragraphWordBreaks(attrs);
  return {
    "data-forhan-break-latin-word": String(modes.latin),
    "data-forhan-break-non-latin-word": String(modes.nonLatin),
    style: `word-break:${modes.nonLatin ? "normal" : "keep-all"};hyphens:${modes.latin === 1 ? "auto" : "manual"}`,
  };
}

/**
 * Locate original Latin words without rewriting Unicode or source offsets.
 *
 * Combining marks stay attached to their preceding Latin letter. Numbers may
 * participate in a Latin word; unrelated scripts never inherit English layout.
 * @param {string} text - Literal source run with UTF-16 model offsets.
 * @returns {Array<{from:number;to:number}>} Ordered, nonoverlapping Latin intervals.
 * @example
 * latinWordIntervals('가나다 café'); // [{from:4,to:8}]
 */
export function latinWordIntervals(
  text: string,
): Array<{ from: number; to: number }> {
  /** Each match retains its original UTF-16 positions, including combining characters. */
  const result: Array<{ from: number; to: number }> = [];
  for (/** Only Latin-led words receive the independent native Latin mode. */ const match of text.matchAll(
    /\p{Script=Latin}[\p{Script=Latin}\p{M}\p{N}]*/gu,
  ))
    result.push({ from: match.index, to: match.index + match[0].length });
  return result;
}

/**
 * Describe transparent Latin layout independently from non-Latin word boundaries.
 *
 * Character mode permits breaks inside a Latin word even when its parent keeps
 * Korean words together. Hyphenation language stays local to Latin source text.
 * @param {NativeLatinWordBreak} mode - Validated independent native Latin mode.
 * @returns {Record<string,string>} Transparent layout wrapper attributes.
 * @example
 * latinWordBreakAttributes(2); // Latin characters may wrap without changing Hangul.
 */
export function latinWordBreakAttributes(
  mode: NativeLatinWordBreak,
): Record<string, string> {
  return {
    "data-forhan-latin-break": String(mode),
    style:
      mode === 2
        ? "word-break:break-all;hyphens:manual"
        : "word-break:normal;hyphens:manual",
    ...(mode === 1 ? { lang: "en" } : {}),
  };
}

/**
 * Apply the live editor's Latin breaking rules to an owned static export copy.
 *
 * Transparent inline elements retain literal text and authored marks. Existing
 * wrappers are not duplicated, and drawings never become document source.
 * @param {HTMLElement} root - Detached owned HTML or print document body.
 * @returns {void} Updates only the supplied export DOM before line measurement.
 * @example
 * applyParagraphWordBreaks(printDocument.body);
 */
export function applyParagraphWordBreaks(root: HTMLElement): void {
  for (/** Only actual source paragraphs and headings own these independent settings. */ const paragraph of root.querySelectorAll<HTMLElement>(
    "p,h1,h2,h3,h4,h5,h6",
  )) {
    /** Original native metadata determines whether a Latin wrapper is necessary. */
    const mode = readParagraphWordBreaks(paragraph).latin;
    if (mode !== 1 && mode !== 2) continue;
    /** Stable source nodes are gathered before splitting alters the detached tree. */
    const walker = root.ownerDocument.createTreeWalker(paragraph, 4),
      nodes: Text[] = [];
    while (walker.nextNode()) {
      /** Source text excludes existing layout wrappers and inaccessible drawings. */
      const node = walker.currentNode as Text;
      if (
        !node.parentElement?.closest(
          '[data-forhan-latin-break],[aria-hidden="true"],svg',
        )
      )
        nodes.push(node);
    }
    for (/** Reverse splitting keeps every original UTF-16 source interval stable. */ const node of nodes) {
      for (/** Wrappers add no characters, boxes or synthetic native source marks. */ const interval of latinWordIntervals(
        node.data,
      ).reverse()) {
        /** A split source word retains its original text style and surrounding content. */
        const word = node.splitText(interval.from),
          wrapper = root.ownerDocument.createElement("forhan-word-break");
        word.splitText(interval.to - interval.from);
        for (/** Static attributes match the actual live editor decoration exactly. */ const [
          name,
          value,
        ] of Object.entries(latinWordBreakAttributes(mode)))
          wrapper.setAttribute(name, value);
        word.replaceWith(wrapper);
        wrapper.append(word);
        if (mode === 1)
          for (/** Rendering-only markers preserve every original UTF-16 source position. */ const boundary of englishHyphenationPoints(
            word.data,
          ).reverse()) {
            /** Reverse splitting keeps each earlier original dictionary boundary unchanged. */
            const tail = word.splitText(boundary);
            tail.before(createHyphenDrawing(root.ownerDocument));
          }
      }
    }
  }
}
