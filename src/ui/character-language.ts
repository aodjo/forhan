import { characterFonts, hasCharacterFonts } from "../character-fonts.ts";
import { characterMetrics, hasCharacterMetrics } from "../character-metrics.ts";

/** Editable native character properties retain independent seven-language source values. */
export type CharacterLanguageKey =
  "ratio" | "spacing" | "relativeSize" | "offset" | "family";
/** One ordered draft edit, with null targeting the native representative setting. */
export interface CharacterLanguageEdit {
  language: number | null;
  key: CharacterLanguageKey;
  value: number | string;
}

/**
 * Apply ordered language edits to one independent source text style.
 *
 * A representative edit updates all seven slots; a later language edit changes
 * only that slot. Each selected run starts from its own original arrays and
 * faces, preserving mixed formatting and every untouched native property.
 * @param {Record<string, unknown>} attrs - Original text-style attributes.
 * @param {readonly CharacterLanguageEdit[]} edits - Ordered explicit draft changes.
 * @returns {Record<string, unknown>} Fresh attributes with only requested language changes.
 * @throws {RangeError} If an existing table, scope or edit value is invalid.
 * @example
 * editCharacterLanguages(attrs, [{language:1,key:'spacing',value:20}]);
 */
export function editCharacterLanguages(
  attrs: Record<string, unknown>,
  edits: readonly CharacterLanguageEdit[],
): Record<string, unknown> {
  /** Fresh metrics retain all unedited script slots. */
  const metrics = characterMetrics(attrs.nativeCharacterMetrics);
  /** Font arrays start from each run's independent ordinary family. */
  const fonts = characterFonts(
    attrs.nativeCharacterFonts,
    String(attrs.fontFamily || ""),
  );
  let familyChanged = false;
  let metricsChanged = false;
  for (
    /** Explicit edit whose order determines representative-versus-language precedence. */
  const edit of edits) {
    if (
      edit.language !== null &&
      (!Number.isInteger(edit.language) ||
        edit.language < 0 ||
        edit.language > 6)
    )
      throw new RangeError("Native character language index is invalid.");
    if (
      edit.key === "family"
        ? typeof edit.value !== "string"
        : !Number.isInteger(edit.value)
    )
      throw new RangeError("Native character language value is invalid.");
    for (let slot = 0; slot < 7; slot++) {
      if (edit.language !== null && edit.language !== slot) continue;
      if (edit.key === "family") fonts[slot] = String(edit.value);
      else metrics[edit.key][slot] = Number(edit.value);
    }
    if (edit.key === "family") familyChanged = true;
    else metricsChanged = true;
  }
  /** The visible font follows the current source run's active script. */
  const language = Number(attrs.nativeCharacterLanguage ?? 0);
  /** All unrelated attributes remain attached to their original source run. */
  const result = { ...attrs };
  if (metricsChanged)
    result.nativeCharacterMetrics = hasCharacterMetrics(
      characterMetrics(metrics),
    )
      ? metrics
      : null;
  if (familyChanged) {
    characterFonts(fonts);
    result.nativeCharacterFonts = hasCharacterFonts(fonts) ? fonts : null;
    result.fontFamily = fonts[language] || null;
  }
  return result;
}

/** Stateful dialog draft keeps language switching separate from document edits. */
export class CharacterLanguageDraft {
  readonly edits: CharacterLanguageEdit[] = [];
  private readonly attrs: Record<string, unknown>;
  private readonly representative: number;

  /**
   * Create an isolated native language draft.
   *
   * No document marks are modified before the parent dialog is explicitly applied.
   * @param {Record<string, unknown>} attrs - Representative selected text attributes.
   * @param {number} representative - Active language supplying initial representative values.
   * @returns {CharacterLanguageDraft} Empty ordered draft over the original source style.
   * @example
   * const draft = new CharacterLanguageDraft(attrs, 0);
   */
  constructor(attrs: Record<string, unknown>, representative: number) {
    this.attrs = { ...attrs };
    this.representative = representative;
  }

  /**
   * Read a current scoped percentage or font value.
   *
   * Previously edited language values survive switching controls. Representative
   * display uses the initial selected script without merging source arrays.
   * @param {CharacterLanguageKey | "ratio"} key - Requested native property.
   * @param {number | null} language - Specific slot or representative scope.
   * @param {boolean} [original=false] - Whether to ignore pending edits.
   * @returns {number | string} Source or pending value for this language.
   * @throws {RangeError} If the retained native table is malformed.
   * @example
   * draft.value('spacing', 1); // Current Latin tracking.
   */
  value(
    key: CharacterLanguageKey | "ratio",
    language: number | null,
    original = false,
  ): number | string {
    /** Representative source or source with explicit ordered edits applied. */
    const attrs = original
      ? this.attrs
      : editCharacterLanguages(this.attrs, this.edits);
    /** Selected language defaults to the initially selected document script. */
    const slot = language ?? this.representative;
    return key === "family"
      ? characterFonts(
          attrs.nativeCharacterFonts,
          String(attrs.fontFamily || ""),
        )[slot]
      : characterMetrics(attrs.nativeCharacterMetrics)[key][slot];
  }

  /**
   * Record an explicitly edited valid language value.
   *
   * Consecutive updates to the same scoped field replace its previous draft;
   * edits across scopes retain their chronological precedence.
   * @param {CharacterLanguageKey} key - Changed percentage or font property.
   * @param {number | null} language - Specific native slot or representative scope.
   * @param {number | string} value - Validated draft value.
   * @returns {void} Updates only the local ordered edit list.
   * @example
   * draft.set('relativeSize', 1, 80);
   */
  set(
    key: CharacterLanguageKey,
    language: number | null,
    value: number | string,
  ): void {
    /** Adjacent updates from input/change belong to the same draft field. */
    const last = this.edits.at(-1);
    if (last?.key === key && last.language === language) last.value = value;
    else this.edits.push({ key, language, value });
  }

  /**
   * Resolve the draft's representative style for a physical preview.
   *
   * Arrays are cloned and validated while the document remains unchanged.
   * @returns {Record<string, unknown>} Preview attributes with all current language edits.
   * @throws {RangeError} If retained native values are invalid.
   * @example
   * draft.preview().nativeCharacterMetrics;
   */
  preview(): Record<string, unknown> {
    return editCharacterLanguages(this.attrs, this.edits);
  }
}
