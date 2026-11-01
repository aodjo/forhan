import type { JSONContent } from "@tiptap/core";

/** Native language order shared by binary character arrays and OWPML attributes. */
export const CHARACTER_LANGUAGES = [
  "hangul",
  "latin",
  "hanja",
  "japanese",
  "other",
  "symbol",
  "user",
] as const;
/** Native language selector labels in the same order as binary and XML arrays. */
export const CHARACTER_LANGUAGE_LABELS = ["한글", "영문", "한자", "일어", "외국어", "기호", "사용자"] as const;
/** Native character measurements that must survive unrelated formatting edits. */
export const CHARACTER_METRICS = [
  "ratio",
  "spacing",
  "relativeSize",
  "offset",
] as const;
/** Seven language-specific integer percentages for each native character measurement. */
export interface CharacterMetrics {
  ratio: number[];
  spacing: number[];
  relativeSize: number[];
  offset: number[];
}
/** Editable native percentages with observed/documented interactive limits. */
export const EDITABLE_CHARACTER_METRICS = {
  ratio: { min:50,max:200,label:"장평",field:"scale" },
  spacing: { min: -50, max: 50, label: "자간", field: "tracking" },
  relativeSize: {
    min: 10,
    max: 250,
    label: "상대 크기",
    field: "relative-size",
  },
  offset: { min: -100, max: 100, label: "글자 위치", field: "position" },
} as const;

/**
 * Resolve complete native language arrays without truncating signed percentages.
 *
 * Absent measurements receive native defaults. Present arrays must contain
 * seven integers representable by their native byte fields; interactive bounds
 * are deliberately separate so imported values are not silently normalized.
 * @param {unknown} value - Optional serialized character-measurement object.
 * @returns {CharacterMetrics} Fresh validated arrays in native language order.
 * @throws {RangeError} If a supplied language array cannot be stored natively.
 * @example
 * characterMetrics(null).spacing; // [0, 0, 0, 0, 0, 0, 0]
 */
export function characterMetrics(value: unknown): CharacterMetrics {
  /** Optional source measurements, never reused as mutable output arrays. */
  const source =
    value && typeof value === "object"
      ? (value as Partial<CharacterMetrics>)
      : {};
  /** Independently owned arrays avoid modifying retained document source data. */
  const result = {} as CharacterMetrics;
  for (/** Native measurement being validated against its byte representation. */ const key of CHARACTER_METRICS) {
    /** Unsigned size ratios differ from signed spacing and baseline offsets. */
    const unsigned = key === "ratio" || key === "relativeSize";
    /** Supplied per-language values, or seven native defaults when absent. */
    const values = source[key] ?? Array<number>(7).fill(unsigned ? 100 : 0);
    if (!Array.isArray(values) || values.length !== 7)
      throw new RangeError(
        "Native character metrics require seven language values.",
      );
    for (/** Stored language-specific percentage validated before byte conversion. */ const item of values)
      if (
        !Number.isInteger(item) ||
        item < (unsigned ? 0 : -128) ||
        item > (unsigned ? 255 : 127)
      )
        throw new RangeError(
          "Character percentage exceeds native byte storage capacity.",
        );
    result[key] = [...values];
  }
  return result;
}

/**
 * Detect whether native character measurements differ from ordinary defaults.
 *
 * Default definitions need no extra editor metadata, preserving the existing
 * representation and byte-preservation checks for ordinary native documents.
 * @param {CharacterMetrics} metrics - Complete validated native arrays.
 * @returns {boolean} Whether any language has nondefault character measurements.
 * @example
 * hasCharacterMetrics(characterMetrics(null)); // false
 */
export function hasCharacterMetrics(metrics: CharacterMetrics): boolean {
  for (/** Native array inspected for an explicit nondefault percentage. */ const key of CHARACTER_METRICS)
    for (/** Per-language percentage compared with its native default. */ const value of metrics[
      key
    ])
      if (value !== (key === "ratio" || key === "relativeSize" ? 100 : 0))
        return true;
  return false;
}

/**
 * Select the native language slot used by an ordinary Unicode character.
 *
 * Spaces follow Latin metrics. This centralizes the reader's existing script
 * classification so binary and XML documents select the same measurement slot.
 * User-defined and exceptional native character encodings remain outside this
 * Unicode classification and retain their complete arrays for later export.
 * @param {string} text - Unicode character whose script is being inspected.
 * @returns {number} Native language index from zero through five.
 * @example
 * characterLanguage('가'); // 0
 * characterLanguage(' '); // 1
 */
export function characterLanguage(text: string): number {
  /** Full Unicode scalar preserves supplementary characters during classification. */
  const codepoint = text.codePointAt(0) ?? 0;
  return codepoint <= 0x024f
    ? 1
    : (codepoint >= 0xac00 && codepoint <= 0xd7af) ||
        (codepoint >= 0x1100 && codepoint <= 0x11ff) ||
        (codepoint >= 0x3130 && codepoint <= 0x318f)
      ? 0
      : codepoint >= 0x3040 && codepoint <= 0x30ff
        ? 3
        : codepoint >= 0x3400 && codepoint <= 0x9fff
          ? 2
          : codepoint >= 0x2000 && codepoint <= 0x2bff
            ? 5
            : 4;
}

/**
 * Split native text only where nondefault measurements select another language.
 *
 * Mark arrays and complete measurement tables remain attached to each run.
 * Adjacent characters in one script stay together; surrogate pairs are never
 * split into invalid text. Ordinary default formatting is returned unchanged.
 * @param {string} text - Decoded native text.
 * @param {NonNullable<JSONContent['marks']>} marks - Active native character and hyperlink marks.
 * @returns {JSONContent[]} Text runs with the correct language measurement index.
 * @example
 * splitCharacterMetrics('가A', marks); // Separate language runs when metrics exist.
 */
export function splitCharacterMetrics(
  text: string,
  marks: NonNullable<JSONContent["marks"]>,
): JSONContent[] {
  if (
    !marks.some(
      /**
       * Detect native measurements requiring language-specific text rendering.
       *
       * Hyperlinks and unrelated emphasis do not cause unnecessary text splitting.
       * @param {NonNullable<JSONContent['marks']>[number]} mark - One active text mark.
       * @returns {boolean} Whether this mark stores explicit native measurements.
       * @example
       * // A native text-style measurement table requires language selection.
       */
      (mark) =>
        mark.type === "textStyle" && (!!mark.attrs?.nativeCharacterMetrics || !!mark.attrs?.nativeCharacterFonts),
    )
  )
    return [{ type: "text", text, marks }];
  /** Consecutive script runs preserve the source character and mark order. */
  const result: JSONContent[] = [];
  let previousLanguage = -1;
  for (/** Complete Unicode character, including any surrogate pair. */ const value of text) {
    /** Native slot needed to render this character's measurements. */
    const language = characterLanguage(value);
    if (language === previousLanguage) result[result.length - 1].text += value;
    else {
      result.push({
        type: "text",
        text: value,
        marks: marks.map(
          /**
           * Attach a language slot without changing another mark's attributes.
           *
           * Complete native measurement arrays stay available for independent export.
           * @param {NonNullable<JSONContent['marks']>[number]} mark - Active native mark.
           * @returns {NonNullable<JSONContent['marks']>[number]} Original mark or language-aware text style.
           * @example
           * // Latin text selects slot one while retaining all seven arrays.
           */
          (mark) =>
            mark.type === "textStyle"
              ? {
                  ...mark,
                  attrs: {
                    ...mark.attrs,
                    nativeCharacterLanguage: language,
                    ...(Array.isArray(mark.attrs?.nativeCharacterFonts) && mark.attrs.nativeCharacterFonts[language]
                      ? { fontFamily: mark.attrs.nativeCharacterFonts[language] }
                      : {}),
                  },
                }
              : mark,
        ),
      });
      previousLanguage = language;
    }
  }
  return result;
}

/**
 * Validate an editable character percentage while preserving unchanged imports.
 *
 * Native UI values use whole percentages. A stored value outside the ordinary
 * entry range may remain unchanged when the user changes another property.
 * @param {keyof typeof EDITABLE_CHARACTER_METRICS} key - Native measurement being edited.
 * @param {string} draft - Literal numeric draft from the character dialog.
 * @param {number} original - Original selected language percentage.
 * @returns {string} Korean validation message or an empty string for valid input.
 * @example
 * characterMetricInputError('spacing', '-20', 0); // ''
 */
export function characterMetricInputError(
  key: keyof typeof EDITABLE_CHARACTER_METRICS,
  draft: string,
  original: number,
): string {
  /** Explicit metric bounds and native label used by the input message. */
  const rule = EDITABLE_CHARACTER_METRICS[key];
  /** Numeric draft is checked before a native signed-byte conversion can wrap it. */
  const value = Number(draft);
  return !draft.trim() ||
    !Number.isInteger(value) ||
    (value !== original && (value < rule.min || value > rule.max))
    ? `${rule.label}은 ${rule.min}~${rule.max}% 범위의 정수로 입력하세요.`
    : "";
}
