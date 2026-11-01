import { FontSize, FontFamily } from "@tiptap/extension-text-style";
import {
  characterFonts,
  hasCharacterFonts,
  characterFontCss,
} from "../character-fonts";
import { isValidCSSStyleValue, type Editor } from "@tiptap/core";
import { Plugin, type Transaction } from "@tiptap/pm/state";
import {
  characterMetrics,
  CHARACTER_METRICS,
  characterLanguage,
  type CharacterMetrics,
} from "../character-metrics";
import { storedFontSizePoints } from "../formatting";
import { nativeSpacingFlag } from "../font-space.ts";
import {
  editCharacterLanguages,
  type CharacterLanguageEdit,
} from "./character-language";

/**
 * Render supported native character metrics without changing stored base sizes.
 *
 * Native relative size affects glyph height and positive baseline offsets move
 * downwards. Complete language arrays remain HTML metadata for reimport. The
 * shared horizontal layout applies glyph width and proportional tracking;
 * ordinary inline CSS remains a source-preserving fallback for other hosts.
 * @param {Record<string, unknown>} attrs - Active text-style attributes.
 * @returns {Record<string, string>} Inline CSS and optional native measurement metadata.
 * @throws {RangeError} If a supplied native measurement array is not representable.
 * @example
 * renderCharacterMetrics({ fontSize: '10pt', nativeCharacterMetrics: metrics });
 */
export function renderCharacterMetrics(
  attrs: Record<string, unknown>,
): Record<string, string> {
  /** Valid original CSS size is retained when no native measurement override exists. */
  const originalSize = isValidCSSStyleValue(attrs.fontSize)
    ? String(attrs.fontSize)
    : "";
  if (!attrs.nativeCharacterMetrics)
    return originalSize ? { style: `font-size: ${originalSize}` } : {};
  /** Complete native arrays are independent of the current script's rendering. */
  const metrics = characterMetrics(attrs.nativeCharacterMetrics);
  /** Language metadata is bounded before it indexes the retained arrays. */
  const language =
    Number.isInteger(attrs.nativeCharacterLanguage) &&
    Number(attrs.nativeCharacterLanguage) >= 0 &&
    Number(attrs.nativeCharacterLanguage) < 7
      ? Number(attrs.nativeCharacterLanguage)
      : 0;
  /** Base point size remains separate from the relative displayed glyph size. */
  const baseSize = storedFontSizePoints(originalSize, Number.NaN);
  /** Inherited HTML sizes keep their parent context instead of becoming a 10pt body size. */
  const absolute = Number.isFinite(baseSize);
  /** Native relative size remains distinct from the original base font-size attribute. */
  const relative = metrics.relativeSize[language];
  /** CSS declarations retain inherited heading sizes and base-derived tracking distances. */
  const styles = [
    absolute
      ? `font-size:${(baseSize * relative) / 100}pt`
      : originalSize
        ? `font-size:calc(${originalSize} * ${relative / 100})`
        : `font-size:${relative}%`,
  ];
  if (metrics.spacing[language])
    styles.push(
      absolute
        ? `letter-spacing:${(baseSize * metrics.spacing[language]) / 100}pt`
        : `letter-spacing:calc(1em * ${metrics.spacing[language] / (relative || 100)})`,
    );
  if (metrics.offset[language])
    styles.push(
      "position:relative",
      absolute
        ? `top:${(baseSize * metrics.offset[language]) / 100}pt`
        : `top:calc(1em * ${metrics.offset[language] / (relative || 100)})`,
    );
  return {
    style: styles.join(";"),
    "data-forhan-character-metrics": JSON.stringify(metrics),
    "data-forhan-character-language": String(language),
    "data-forhan-base-font-size": originalSize,
  };
}

/** FontSize commands extended with lossless native character-measurement HTML attributes. */
export const NativeCharacterFormatting = FontSize.extend({
  /**
   * Keep inserted characters on the correct native language measurement slot.
   *
   * Imported nonuniform arrays can otherwise lend Hangul measurements to newly
   * typed Latin text. Mark-only normalization preserves document positions,
   * selection, emphasis and the original native arrays.
   * @returns {Plugin[]} Script-normalization plugin for native text-style measurements.
   * @example
   * // Typing A after a Hangul run selects the retained Latin spacing value.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        /**
         * Normalize language indices after text or character-formatting edits.
         *
         * Uniform/default arrays need no per-character work. An appended mark
         * transaction is ignored on the following pass to avoid recursive edits.
         * @param {readonly import('@tiptap/pm/state').Transaction[]} transactions - Transactions since the previous editor state.
         * @param {import('@tiptap/pm/state').EditorState} previous - Previous editor state.
         * @param {import('@tiptap/pm/state').EditorState} state - Updated document and selection.
         * @returns {import('@tiptap/pm/state').Transaction | null} Required language-mark changes or no appended transaction.
         * @throws {RangeError} If supplied native arrays cannot be represented.
         * @example
         * // One typed Latin character receives Latin metrics without changing its Hangul neighbor.
         */
        appendTransaction(transactions, previous, state) {
          if (
            !transactions.some(
              /**
               * Detect a source edit that can require native script normalization.
               *
               * Plugin-owned mark adjustments never request another normalization pass.
               * @param {import('@tiptap/pm/state').Transaction} transaction - Candidate editor update.
               * @returns {boolean} Whether this is a source document edit.
               * @example
               * // A text insertion qualifies; a plugin-owned language adjustment does not.
               */
              (transaction) =>
                transaction.docChanged &&
                !transaction.getMeta("forhan-native-language"),
            )
          )
            return null;
          /** Existing character-style schema type shared by all formatting controls. */
          const type = state.schema.marks.textStyle;
          /** Position-preserving native language mark changes share one transaction. */
          const update = state.tr;
          state.doc.descendants(
            /**
             * Inspect a native text run for inserted characters from another script.
             *
             * Ordinary text and uniform arrays retain their existing mark structure.
             * @param {import('@tiptap/pm/model').Node} node - Current document node.
             * @param {number} position - Absolute node start in the updated document.
             * @returns {void} Adds only necessary language-specific mark corrections.
             * @throws {RangeError} If this node contains malformed native measurements.
             * @example
             * // A mixed Hangul/Latin run can be split into two correctly measured marks.
             */
            (node, position) => {
              if (!node.isText) return;
              /** Existing style contains complete native arrays and a displayed language index. */
              const mark = type.isInSet(node.marks);
              if (
                !mark ||
                (!mark.attrs.nativeCharacterMetrics &&
                  !mark.attrs.nativeCharacterFonts)
              )
                return;
              /** Validated arrays are inspected for an actual per-language difference. */
              const metrics = characterMetrics(
                mark.attrs.nativeCharacterMetrics,
              );
              /** Language-specific faces require normalization even when percentages are uniform. */
              const fonts = characterFonts(
                mark.attrs.nativeCharacterFonts,
                mark.attrs.fontFamily || "",
              );
              let uniform = !hasCharacterFonts(fonts);
              for (/** Native measurement whose languages may require distinct rendering. */ const key of CHARACTER_METRICS)
                for (/** Per-language value compared with this array's representative value. */ const value of metrics[
                  key
                ])
                  if (value !== metrics[key][0]) uniform = false;
              if (uniform) return;
              let offset = 0;
              for (/** Complete Unicode scalar preserves supplementary characters during edits. */ const value of node.text ||
                "") {
                /** Native slot for the newly inserted or existing source character. */
                const language = characterLanguage(value);
                if (
                  language !== mark.attrs.nativeCharacterLanguage ||
                  (mark.attrs.nativeCharacterFonts &&
                    fonts[language] &&
                    fonts[language] !== mark.attrs.fontFamily)
                )
                  update.addMark(
                    position + offset,
                    position + offset + value.length,
                    type.create({
                      ...mark.attrs,
                      nativeCharacterLanguage: language,
                      ...(mark.attrs.nativeCharacterFonts && fonts[language]
                        ? { fontFamily: fonts[language] }
                        : {}),
                    }),
                  );
                offset += value.length;
              }
            },
          );
          return update.docChanged
            ? update.setMeta("forhan-native-language", true)
            : null;
        },
      }),
    ];
  },
  /**
   * Declare base-size and native language-measurement attributes for text styles.
   *
   * FontSize's existing commands remain available. HTML import restores the
   * original base rather than treating a displayed relative size as a new base.
   * @returns {object[]} Global text-style attribute definitions.
   * @example
   * // A displayed 8pt run can retain a 10pt native base and 80 percent relative size.
   */
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            /**
             * Restore a native base size or an ordinary inline HTML font size.
             *
             * The metadata marker can deliberately contain an empty inherited base.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {string | null} Original base size or ordinary CSS size.
             * @example
             * // A span displaying 8pt with a retained 10pt base restores 10pt.
             */
            parseHTML: (element: HTMLElement) =>
              element.hasAttribute("data-forhan-base-font-size")
                ? element.getAttribute("data-forhan-base-font-size") || null
                : element.style.fontSize || null,
            renderHTML: renderCharacterMetrics,
          },
          nativeCharacterMetrics: {
            default: null,
            rendered: false,
            /**
             * Restore validated native arrays from exported document HTML.
             *
             * Ordinary spans have no native metadata and keep their existing format.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {CharacterMetrics | null} Validated language arrays or no native override.
             * @throws {SyntaxError | RangeError} If supplied metadata is malformed or unrepresentable.
             * @example
             * // Complete signed percentage arrays survive HTML export and reimport.
             */
            parseHTML: (element: HTMLElement): CharacterMetrics | null => {
              /** Serialized native arrays attached only to explicitly measured text. */
              const value = element.getAttribute(
                "data-forhan-character-metrics",
              );
              return value ? characterMetrics(JSON.parse(value)) : null;
            },
          },
          nativeUseFontSpace: {
            default: null,
            /**
             * Restore explicit native space semantics from marked HTML text.
             *
             * Ordinary imported HTML is annotated before parsing. Native false
             * remains distinct from true even though both source glyphs are ASCII spaces.
             * @param {HTMLElement} element - Imported text-style element.
             * @returns {boolean|null} Explicit native mode or the absent native default.
             * @throws {RangeError} If explicit native metadata is not a valid boolean.
             * @example
             * // The literal metadata zero restores half-em space semantics.
             */
            parseHTML: (element: HTMLElement): boolean | null => {
              /** An ancestor may carry the same native preference around another styled child. */
              const source = element.closest("[data-forhan-use-font-space]")?.getAttribute("data-forhan-use-font-space");
              return source === undefined ? null : nativeSpacingFlag(source);
            },
            /**
             * Preserve the character-shape space preference beside actual text styles.
             *
             * Explicit default metadata also identifies newly authored native
             * text when copied through ordinary rich HTML serialization.
             * @param {Record<string,unknown>} attrs - Canonical source text-style attributes.
             * @returns {Record<string,string>} Source mode marker and neutral parseable CSS.
             * @throws {RangeError} If the source preference is invalid.
             * @example
             * // A flag-only text-style mark still has an actual style attribute.
             */
            renderHTML: (attrs: Record<string, unknown>): Record<string, string> => ({
              "data-forhan-use-font-space": nativeSpacingFlag(attrs.nativeUseFontSpace) ? "1" : "0",
              style: "word-spacing:normal",
            }),
          },
          nativeUseKerning: {
            default: null,
            /**
             * Read native kerning independently of the character's space-width mode.
             *
             * Explicit real CSS wins when an external editor changes native
             * output. Missing source metadata keeps the native default off.
             * @param {HTMLElement} element - Actual imported text-style span.
             * @returns {boolean|null} Source kerning mode or an absent native default.
             * @throws {RangeError} If explicit metadata is outside the boolean domain.
             * @example
             * // Native false disables browser automatic A-space pair kerning too.
             */
            parseHTML: (element: HTMLElement): boolean | null => {
              if (element.style.fontKerning === "none") return false;
              if (element.style.fontKerning === "normal") return true;
              /** An ancestor can retain the source preference around a nested styled run. */
              const value = element.closest("[data-forhan-use-kerning]")?.getAttribute("data-forhan-use-kerning");
              return value === undefined ? null : nativeSpacingFlag(value);
            },
            /**
             * Render real native kerning rather than relying on browser auto thresholds.
             *
             * This also keeps word advances stable across transparent drawing
             * wrappers, undo and font-size changes.
             * @param {Record<string,unknown>} attrs - Original source text-style attributes.
             * @returns {Record<string,string>} Explicit source metadata and matching kerning CSS.
             * @throws {RangeError} If the stored source preference is invalid.
             * @example
             * // Native true uses font-kerning:normal on the actual character run.
             */
            renderHTML: (attrs: Record<string, unknown>): Record<string, string> => ({
              "data-forhan-use-kerning": nativeSpacingFlag(attrs.nativeUseKerning) ? "1" : "0",
              style: `font-kerning:${nativeSpacingFlag(attrs.nativeUseKerning) ? "normal" : "none"}`,
            }),
          },
          nativeCharacterFonts: {
            default: null,
            /**
             * Restore all language faces from exported HTML metadata.
             *
             * The visible CSS face alone cannot recover the unused native language tables.
             * @param {HTMLElement} element - Imported native text-style span.
             * @returns {string[] | null} Seven validated face names or no native table.
             * @throws {SyntaxError | RangeError} If native font metadata is malformed.
             * @example
             * // A Latin span still retains its source Hangul font choice.
             */
            parseHTML: (element: HTMLElement): string[] | null => {
              /** Optional retained native face table. */
              const value = element.getAttribute("data-forhan-character-fonts");
              return value ? characterFonts(JSON.parse(value)) : null;
            },
            /**
             * Preserve each native face in standalone document HTML.
             *
             * Attribute values are escaped by the HTML serializer independently of CSS.
             * @param {Record<string, unknown>} attrs - Text-style mark attributes.
             * @returns {Record<string, string>} Native font metadata or no extra attributes.
             * @throws {RangeError} If the stored table is malformed.
             * @example
             * // HTML export keeps all seven faces beside the active face style.
             */
            renderHTML: (
              attrs: Record<string, unknown>,
            ): Record<string, string> =>
              attrs.nativeCharacterFonts
                ? {
                    "data-forhan-character-fonts": JSON.stringify(
                      characterFonts(attrs.nativeCharacterFonts),
                    ),
                  }
                : {},
          },
          nativeCharacterLanguage: {
            default: null,
            /**
             * Preserve the active script even when fonts alone require language metadata.
             *
             * Relative-size metadata may be absent for a font-only native span.
             * @param {Record<string, unknown>} attrs - Active text-style attributes.
             * @returns {Record<string, string>} Bounded language marker or no override.
             * @example
             * // Font-only Latin text retains language slot one in HTML.
             */
            renderHTML: (
              attrs: Record<string, unknown>,
            ): Record<string, string> =>
              attrs.nativeCharacterFonts &&
              Number.isInteger(attrs.nativeCharacterLanguage)
                ? {
                    "data-forhan-character-language": String(
                      attrs.nativeCharacterLanguage,
                    ),
                  }
                : {},
            /**
             * Restore the active script's native measurement slot.
             *
             * Missing metadata leaves an ordinary span unchanged; invalid indices
             * cannot access an array outside the seven native language entries.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {number | null} Native language index or an absent index.
             * @example
             * // A retained Latin span restores language index one.
             */
            parseHTML: (element: HTMLElement): number | null => {
              /** Optional language identifier paired with the measurement metadata. */
              const value = element.getAttribute(
                "data-forhan-character-language",
              );
              return value !== null && /^[0-6]$/.test(value)
                ? Number(value)
                : null;
            },
          },
        },
      },
    ];
  },
});

/** Ordinary font commands clear language overrides while the dialog applies scoped changes separately. */
export const NativeFontFamily = FontFamily.extend({
  /**
   * Render a native face as one quoted token while retaining ordinary CSS families.
   *
   * Source font names cannot inject CSS. HTML metadata independently preserves
   * the native language table for reimport.
   * @returns {object[]} Native-aware text-style family definition.
   * @example
   * // A quoted native face remains independent of its language neighbors.
   */
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            /**
             * Restore the active language face or an ordinary CSS family.
             *
             * Native arrays take priority over CSS canonicalization of literal names.
             * @param {HTMLElement} element - Imported character span.
             * @returns {string | null} Literal native name or ordinary CSS family.
             * @throws {SyntaxError | RangeError} If native face metadata is malformed.
             * @example
             * // Latin metadata restores the Latin face from its own slot.
             */
            parseHTML(element: HTMLElement): string | null {
              /** Optional source font table. */
              const source = element.getAttribute(
                "data-forhan-character-fonts",
              );
              if (source) {
                /** Valid native language index; absent metadata uses Hangul. */
                const language = Number(
                  element.getAttribute("data-forhan-character-language") || 0,
                );
                return (
                  characterFonts(JSON.parse(source))[language] ||
                  element.style.fontFamily ||
                  null
                );
              }
              return element.style.fontFamily || null;
            },
            /**
             * Render the correct script-specific font family.
             *
             * Ordinary values retain Tiptap's CSS validation and list semantics.
             * @param {Record<string, unknown>} attrs - Active text-style attributes.
             * @returns {Record<string, string>} Valid CSS font-family declaration or no style.
             * @throws {RangeError} If the native font table is malformed.
             * @example
             * // A Latin run uses its retained Latin font name.
             */
            renderHTML(attrs: Record<string, unknown>): Record<string, string> {
              if (attrs.nativeCharacterFonts) {
                /** Validated script-indexed native font names. */
                const fonts = characterFonts(attrs.nativeCharacterFonts);
                /** Current bounded native language index. */
                const language = Number(attrs.nativeCharacterLanguage ?? 0);
                /** Active source face, falling back only for missing native names. */
                const face = fonts[language] || String(attrs.fontFamily || "");
                return face
                  ? { style: `font-family:${characterFontCss(face)}` }
                  : {};
              }
              return isValidCSSStyleValue(attrs.fontFamily)
                ? { style: `font-family:${attrs.fontFamily}` }
                : {};
            },
          },
        },
      },
    ];
  },
  /**
   * Apply representative family choices without leaving hidden native overrides.
   *
   * Quick and ribbon choices affect all scripts. Scoped dialog edits use the
   * explicit native table rather than these representative commands.
   * @returns {object} Representative set/unset font-family commands.
   * @example
   * editor.commands.setFontFamily('Arial');
   */
  addCommands() {
    return {
      /**
       * Prepare a representative font-family update.
       *
       * Clearing native faces makes the ordinary family authoritative for all scripts.
       * @param {string} fontFamily - Requested CSS family.
       * @returns {Function} Tiptap command applying the chosen family.
       * @example
       * editor.commands.setFontFamily('Arial');
       */
      setFontFamily:
        (fontFamily: string) =>
        /**
         * Commit a representative family with no language override.
         *
         * The existing chain preserves selection and other text-style attributes.
         * @param {import('@tiptap/core').CommandProps} context - Active command chain.
         * @returns {boolean} Whether the command applies.
         * @example
         * // All selected scripts use the requested family.
         */
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontFamily, nativeCharacterFonts: null })
            .run(),
      /**
       * Prepare removal of representative and native font choices.
       *
       * The next text inherits its surrounding font family.
       * @returns {Function} Tiptap command removing explicit font choices.
       * @example
       * editor.commands.unsetFontFamily();
       */
      unsetFontFamily:
        () =>
        /**
         * Remove the explicit font choices from the selection.
         *
         * Empty text-style marks are removed through the normal editor command.
         * @param {import('@tiptap/core').CommandProps} context - Active command chain.
         * @returns {boolean} Whether the command applies.
         * @example
         * // Selected text inherits its family.
         */
        ({ chain }) =>
          chain()
            .setMark("textStyle", {
              fontFamily: null,
              nativeCharacterFonts: null,
            })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

/**
 * Apply only explicitly changed native language settings to each selected run.
 *
 * Representative changes affect all seven languages; scoped edits affect one.
 * Independent source fonts, arrays and mixed formatting survive untouched.
 * Caret-only operations update stored marks for newly typed characters.
 * @param {Editor} editor - Active document editor.
 * @param {readonly CharacterLanguageEdit[]} changes - Ordered explicit language-scoped edits.
 * @param {Transaction} [target] - Caller-owned transaction updated without an independent dispatch.
 * @returns {void} Adds scoped source changes or dispatches one standalone transaction.
 * @throws {RangeError} If an existing measurement table cannot be represented.
 * @example
 * applyCharacterLanguageChanges(editor, [{language:1,key:'spacing',value:20}]);
 */
export function applyCharacterLanguageChanges(
  editor: Editor,
  changes: readonly CharacterLanguageEdit[],
  target?: Transaction,
): void {
  if (!changes.length) return;
  /** Existing text-style schema type is shared with font, size and color commands. */
  const type = editor.schema.marks.textStyle;
  /** One transaction retains the original range and all unrelated mark attributes. */
  const transaction = target ?? editor.state.tr;
  /** Selected document range or caret whose stored marks are being edited. */
  const { from, to, empty } = transaction.selection;
  /**
   * Merge changed percentages into one run's independent native arrays.
   *
   * Unedited measurements never inherit another selected run's first value.
   * @param {Record<string, unknown>} attrs - Existing character-style attributes.
   * @returns {Record<string, unknown>} Attributes with only requested arrays changed.
   * @throws {RangeError} If an existing native array is malformed.
   * @example
   * // Changing tracking leaves each run's own width and relative size intact.
   */
  function updated(attrs: Record<string, unknown>): Record<string, unknown> {
    return editCharacterLanguages(attrs, changes);
  }
  if (empty) {
    /** Effective caret marks include stored formatting for the next typed character. */
    const marks =
      transaction.storedMarks || transaction.selection.$from.marks();
    /** Current character-style mark contributes font, color and native measurements. */
    const current = type.isInSet(marks);
    transaction.setStoredMarks(
      type.create(updated(current?.attrs || {})).addToSet(marks),
    );
  } else
    transaction.doc.nodesBetween(
      from,
      to,
      /**
       * Update one selected text fragment while retaining its independent attributes.
       *
       * Non-text nodes and their unrelated character state are left intact.
       * @param {import('@tiptap/pm/model').Node} node - Document node intersecting the selection.
       * @param {number} position - Absolute node start in the current document.
       * @returns {void} Adds the updated text-style mark to the selected fragment.
       * @throws {RangeError} If this run contains malformed native arrays.
       * @example
       * // Half of a mixed-style phrase can receive new tracking without changing its neighbor.
       */
      (node, position) => {
        if (!node.isText) return;
        /** Existing mark is updated independently of neighboring selected runs. */
        const current = type.isInSet(node.marks);
        transaction.addMark(
          Math.max(from, position),
          Math.min(to, position + node.nodeSize),
          type.create(updated(current?.attrs || {})),
        );
      },
    );
  if(!target)editor.view.dispatch(transaction);
}

/**
 * Apply representative numeric measurements through the scoped editing path.
 *
 * Existing callers retain all-seven-language behavior while the native dialog
 * supplies explicit ordered scopes through applyCharacterLanguageChanges.
 * @param {Editor} editor - Active document editor.
 * @param {Partial<Record<'ratio' | 'spacing' | 'relativeSize' | 'offset', number>>} changes - Explicit representative numeric changes.
 * @returns {void} Applies the requested measurements to the original selection.
 * @throws {RangeError} If retained native arrays are malformed.
 * @example
 * applyCharacterMetricChanges(editor, {spacing:20});
 */
export function applyCharacterMetricChanges(
  editor: Editor,
  changes: Partial<Record<"ratio" | "spacing" | "relativeSize" | "offset", number>>,
): void {
  /** Ordered representative edits share the same native transaction implementation. */
  const edits: CharacterLanguageEdit[] = [];
  for (/** Numeric field explicitly edited by an existing representative caller. */
  const [key, value] of Object.entries(changes))
    edits.push({
      language: null,
      key: key as "ratio" | "spacing" | "relativeSize" | "offset",
      value,
    });
  applyCharacterLanguageChanges(editor, edits);
}
