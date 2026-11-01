import { Extension, type Editor } from "@tiptap/core";
import { normalizeColor } from "../colors.ts";
import { Underline } from "@tiptap/extension-underline";
import { Strike } from "@tiptap/extension-strike";
import { decorationHtml } from "../character-decorations.ts";
import { decorationDrawingStyle } from "../decoration-drawing.ts";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Pure source-derived compound line layers never add document attributes or history transactions. */
const nativeDecorationKey = new PluginKey<DecorationSet>(
  "forhan-character-line-drawings",
);

/**
 * Resolve the native Basic underline default for the actual selected foreground colors.
 *
 * One uniform foreground supplies its line color. Mixed foregrounds use the
 * installed-native black default instead of borrowing a representative run's
 * color. Unsupported foreign display colors remain editable with a black draft.
 * @param {Editor} editor - Actual owning document and selection.
 * @returns {string} Canonical opaque default for a newly enabled Basic underline.
 * @example
 * nativeUnderlineDefaultColor(editor); // Differently colored selected runs produce '#000000'.
 */
export function nativeUnderlineDefaultColor(editor: Editor): string {
  let representative: string | undefined,
    mixed = false;
  /**
   * Inspect one original foreground without modifying source styles.
   *
   * Unknown foreign colors cannot prevent the native dialog from opening.
   * @param {unknown} value - Original source foreground or absent default.
   * @returns {void} Accumulates the actual uniform-or-mixed foreground state.
   * @example
   * inspect('#123456'); // No line mark or text-style property is edited.
   */
  function inspect(value: unknown): void {
    let color: string;
    try {
      color = normalizeColor(value) || "#000000";
    } catch {
      color = "#000000";
    }
    if (representative === undefined) representative = color;
    else if (representative !== color) mixed = true;
  }
  if (editor.state.selection.empty)
    inspect(editor.getAttributes("textStyle").color);
  else
    editor.state.doc.nodesBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      /**
       * Inspect the foreground of an actual selected text run.
       *
       * Containers do not introduce invented black colors into uniform selections.
       * @param {Node} node - Actual immutable selected source node.
       * @returns {void} Accumulates this run's original foreground only.
       * @example
       * // Different line colors do not make otherwise uniform foregrounds mixed.
       */
      (node) => {
        if (!node.isText) return;
        let color: unknown;
        for (/** Foreground color remains independent of native underline and strike colors. */ const mark of node.marks)
          if (mark.type.name === "textStyle") color = mark.attrs.color;
        inspect(color);
      },
    );
  return mixed ? "#000000" : representative || "#000000";
}

/**
 * Derive innermost compound-line drawing ranges from original semantic source marks.
 *
 * Drawing ranges retain coherent text runs and inherit actual glyph metrics.
 * Foreground/shading marks remain outside, so their backgrounds cannot cover
 * independent native line layers. Ordinary lines keep native CSS drawing.
 * @param {Node} doc - Actual immutable document source.
 * @returns {DecorationSet} Transparent source-position drawing ranges.
 * @throws {RangeError} If an explicit native line definition is invalid.
 * @example
 * sourceLineDrawings(editor.state.doc); // No extra history or replacement text.
 */
function sourceLineDrawings(doc: Node): DecorationSet {
  /** One drawing wrapper can retain both independent complex source lines. */
  const ranges: Decoration[] = [];
  doc.descendants(
    /**
     * Collect actual text-node line marks at their immutable source positions.
     *
     * Atomic objects and unmarked text do not acquire synthetic source styles.
     * @param {Node} node - Actual source descendant.
     * @param {number} position - Original document start position.
     * @returns {void} Appends only necessary transparent drawing ranges.
     * @example
     * // An opaque textStyle shading span stays outside the drawing wrapper.
     */
    (node, position) => {
      if (!node.isText) return;
      /** Native line definitions remain independent of source foreground color. */
      const marks: { type: string; attrs: Record<string, unknown> }[] = [];
      let foreground = "#000000";
      for (/** All original mark attributes remain untouched by drawing. */ const mark of node.marks) {
        if (mark.type.name === "textStyle" && mark.attrs.color)
          foreground = String(mark.attrs.color);
        marks.push({ type: mark.type.name, attrs: mark.attrs });
      }
      /** Empty drawing styles leave ordinary CSS decoration rendering intact. */
      const style = decorationDrawingStyle(marks, foreground);
      if (style)
        ranges.push(
          Decoration.inline(position, position + node.nodeSize, {
            nodeName: "forhan-decoration",
            "data-forhan-decoration-drawing": "",
            style,
          }),
        );
    },
  );
  return DecorationSet.create(doc, ranges);
}

/**
 * Recognize real external underline/overline CSS without interpreting arbitrary markup.
 *
 * Native overlines remain underline marks with independent position attributes.
 * @param {string} value - Actual imported inline decoration-line declaration.
 * @returns {object|false} Empty mark attributes for a recognized native-compatible line.
 * @example
 * underlineCss('overline'); // An actual editable underline-position mark.
 */
function underlineCss(value: string): object | false {
  return /(?:^|\s)(?:underline|overline)(?:\s|$)/.test(value) ? {} : false;
}

/**
 * Recognize independent external strikeout CSS.
 *
 * Ordinary line-through remains separate from an imported centered underline.
 * @param {string} value - Actual imported inline decoration-line declaration.
 * @returns {object|false} Mark attributes or a nonmatching rule result.
 * @example
 * strikeCss('line-through'); // A real editable strike mark.
 */
function strikeCss(value: string): object | false {
  return value.split(/\s+/).includes("line-through") ? {} : false;
}

/** Underline commands retain native position/pattern attributes and recognize real CSS overlines. */
export const NativeUnderline = Underline.extend({
  /**
   * Extend semantic underline parsing with the external CSS longhand form.
   *
   * Existing keyboard commands and semantic u tags remain inherited.
   * @returns {object[]} Original mark rules and a nonconsuming CSS rule.
   * @example
   * // A foreign span with text-decoration-line:overline remains editable.
   */
  parseHTML() {
    return [
      ...(this.parent?.() || []),
      {
        style: "text-decoration-line",
        consuming: false,
        getAttrs: underlineCss,
      },
    ];
  },
});

/** Independent strikeout commands recognize the same explicit CSS longhand as standalone exports. */
export const NativeStrike = Strike.extend({
  /**
   * Retain semantic strike parsing and real external line-through CSS.
   *
   * The line's color and pattern are resolved independently by global attributes.
   * @returns {object[]} Original strike rules and an explicit CSS rule.
   * @example
   * // Exported s tags and foreign line-through spans share the same source model.
   */
  parseHTML() {
    return [
      ...(this.parent?.() || []),
      { style: "text-decoration-line", consuming: false, getAttrs: strikeCss },
    ];
  },
});

/** Native line attributes live on their semantic marks and survive HTML, rich paste and history. */
export const NativeCharacterDecorations = Extension.create({
  name: "nativeCharacterDecorations",
  /**
   * Keep compound line drawing inside semantic marks through edits and undo.
   *
   * Drawing state derives from immutable source only and never dispatches a
   * second history transaction or waits for an artificial rendering timeout.
   * @returns {Plugin[]} One source-position drawing plugin.
   * @example
   * // Source-equivalent undo immediately restores the same compound line layers.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: nativeDecorationKey,
        state: {
          /**
           * Initialize source drawing ranges on the actual document.
           *
           * No DOM measurement or source mutation is required.
           * @param {unknown} _config - Actual editor-state configuration.
           * @param {EditorState} state - Original immutable source state.
           * @returns {DecorationSet} Initial transparent line drawing ranges.
           * @example
           * // Imported shaded compound lines draw on their first actual render.
           */
          init: (_config: unknown, state: EditorState): DecorationSet =>
            sourceLineDrawings(state.doc),
          /**
           * Refresh compound line ranges only when actual source content changes.
           *
           * Selection-only transactions reuse the original drawing set.
           * @param {Transaction} transaction - Actual immutable source update.
           * @param {DecorationSet} previous - Previous valid drawing ranges.
           * @returns {DecorationSet} Current source-derived ranges without new history.
           * @example
           * // One native dialog edit creates one source undo step.
           */
          apply: (
            transaction: Transaction,
            previous: DecorationSet,
          ): DecorationSet =>
            transaction.docChanged
              ? sourceLineDrawings(transaction.doc)
              : previous,
        },
        props: {
          /**
           * Expose transparent compound-line ranges to the actual editor view.
           *
           * Native source serialization never includes these drawing elements.
           * @param {EditorState} state - Actual owning editor state.
           * @returns {DecorationSet} Current drawing set or the empty initialization default.
           * @example
           * // Original semantic underline and strike marks remain editable.
           */
          decorations: (state: EditorState): DecorationSet =>
            nativeDecorationKey.getState(state) || DecorationSet.empty,
        },
      }),
    ];
  },
  /**
   * Register independent position, shape, color and retained legacy strike flags.
   *
   * Only the position renderer emits combined drawing CSS, preventing separate
   * attribute renderers from overwriting one another's line declarations.
   * @returns {object[]} Native underline/strike attribute groups.
   * @example
   * // A blue wave overline and red dotted strike remain independent nested marks.
   */
  addGlobalAttributes() {
    /** Shared source attributes are copied into each independent semantic mark group. */
    const common = {
      nativePosition: {
        default: null,
        /**
         * Restore an original native position or an ordinary external overline.
         *
         * Centered native underlines retain their own source mark identity.
         * @param {HTMLElement} element - Imported semantic line element.
         * @returns {string} Original position or an ordinary bottom default.
         * @example
         * // TOP remains TOP through standalone HTML and rich clipboard copying.
         */
        parseHTML: (element: HTMLElement): string =>
          element.dataset.forhanLinePosition ||
          (element.style.textDecorationLine.includes("overline")
            ? "TOP"
            : "BOTTOM"),
        /**
         * Render all independent native line properties on one semantic source mark.
         *
         * The semantic kind is supplied by the mark-specific attribute group below.
         * @param {Record<string,unknown>} attrs - Actual source mark attributes.
         * @returns {Record<string,string>} Source metadata and combined drawing CSS.
         * @example
         * // Rendering never changes text glyphs or the source foreground color.
         */
        renderHTML: (attrs: Record<string, unknown>): Record<string, string> =>
          decorationHtml(attrs, "underline"),
      },
      nativePattern: {
        default: null,
        /**
         * Restore an exact native shape or a supported ordinary CSS line style.
         *
         * Ownership metadata preserves shapes with no direct CSS keyword.
         * @param {HTMLElement} element - Imported semantic decoration element.
         * @returns {number} Original line index or a real CSS-derived default.
         * @example
         * // DOUBLEWAVE remains twelve instead of silently becoming solid.
         */
        parseHTML: (element: HTMLElement): number =>
          element.dataset.forhanLinePattern !== undefined
            ? Number(element.dataset.forhanLinePattern)
            : (
                { dotted: 1, dashed: 2, double: 7, wavy: 11 } as Record<
                  string,
                  number
                >
              )[element.style.textDecorationStyle] || 0,
        rendered: false,
      },
      nativeColor: {
        default: null,
        /**
         * Retain explicit native line color independently of foreground text.
         *
         * An absent currentColor declaration keeps ordinary semantic inheritance.
         * @param {HTMLElement} element - Imported source line element.
         * @returns {string|null} Original opaque color or absent inherited color.
         * @example
         * // A red strike does not change the black text it crosses.
         */
        parseHTML: (element: HTMLElement): string | null =>
          element.dataset.forhanLineColor ||
          (element.style.textDecorationColor &&
          element.style.textDecorationColor !== "currentcolor"
            ? element.style.textDecorationColor
            : null),
        rendered: false,
      },
    };
    return [
      { types: ["underline"], attributes: common },
      {
        types: ["strike"],
        attributes: {
          ...common,
          nativePosition: {
            ...common.nativePosition,
            /**
             * Render strikeout using its independent native color and pattern.
             *
             * Global strike-specific attributes override the shared underline renderer.
             * @param {Record<string,unknown>} attrs - Actual strike source attributes.
             * @returns {Record<string,string>} Independent line-through metadata and CSS.
             * @example
             * // Missing native strike color uses the installed-native black default.
             */
            renderHTML: (
              attrs: Record<string, unknown>,
            ): Record<string, string> => decorationHtml(attrs, "strike"),
          },
          nativeStrikeType: {
            default: null,
            /**
             * Restore a retained legacy binary strikeout flag from owned HTML.
             *
             * Modern XML line shape and color remain independent of this optional flag.
             * @param {HTMLElement} element - Imported semantic strike element.
             * @returns {number|null} Explicit retained flag or absent native default.
             * @example
             * // A legacy double-strike source flag is not discarded by an unrelated text edit.
             */
            parseHTML: (element: HTMLElement): number | null =>
              element.dataset.forhanStrikeType
                ? Number(element.dataset.forhanStrikeType)
                : null,
            /**
             * Keep an explicit legacy native strike flag in source-owned markup.
             *
             * Newly authored strikes need no synthetic legacy field.
             * @param {Record<string,unknown>} attrs - Original strike mark attributes.
             * @returns {Record<string,string>} Optional exact flag metadata.
             * @example
             * // Native HWP reexport can retain the original flag after HTML import.
             */
            renderHTML: (
              attrs: Record<string, unknown>,
            ): Record<string, string> =>
              attrs.nativeStrikeType == null
                ? {}
                : { "data-forhan-strike-type": String(attrs.nativeStrikeType) },
          },
        },
      },
    ];
  },
});
