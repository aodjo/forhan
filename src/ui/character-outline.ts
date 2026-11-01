import { Extension } from "@tiptap/core";
import { characterEmphasis } from "../character-emphasis.ts";
import { needsNativeWidth } from "../character-width.ts";
import { Plugin, PluginKey, TextSelection, AllSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import {
  characterOutline,
  renderCharacterOutline,
} from "../character-outline.ts";
import {
  createOutlineLayer,
  drawNativeOutline,
  applyNativeOutlines,
} from "../outline-drawing.ts";

/** Font contours use rendering decorations and never add source history transactions. */
const outlineKey = new PluginKey<DecorationSet>(
  "forhan-native-character-outlines",
);

/**
 * Create the drawing widget in its original owning document.
 *
 * The widget is inaccessible and does not own editable source text or focus.
 * @param {EditorView} view - Actual initialized native editor view.
 * @returns {HTMLElement} Noneditable HTML widget containing the owned drawing layer.
 * @example
 * // ProseMirror owns widget removal when its source paragraph loses outlining.
 */
function outlineWidget(view: EditorView): HTMLElement {
  /** HTML owns editability because an SVG-only widget can capture native Home and arrow selection. */
  const widget=view.dom.ownerDocument.createElement('forhan-drawing');
  widget.contentEditable='false';widget.setAttribute('aria-hidden','true');
  widget.style.cssText='position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;user-select:none';
  widget.appendChild(createOutlineLayer(view.dom.ownerDocument));
  return widget;
}

/**
 * Locate real source paragraphs with active native outline attributes.
 *
 * One absolute widget per paragraph handles wrapped text and mixed fonts while
 * source marks, original positions and all ordinary text remain unchanged.
 * @param {Node} doc - Current immutable source document.
 * @returns {DecorationSet} Paragraph containers and inaccessible contour widgets.
 * @throws {RangeError} If an explicit source outline code is unsupported.
 * @example
 * sourceOutlineDrawings(state.doc); // An offset-only shadow edit does not replace text.
 */
function sourceOutlineDrawings(doc: Node): DecorationSet {
  /** Drawing-only ranges are recreated only after a real document change. */
  const ranges: Decoration[] = [];
  doc.descendants(
    /**
     * Discover paragraphs containing actual outlined source characters.
     *
     * List and table containers still descend into their independent paragraphs.
     * @param {Node} node - Original authored source node.
     * @param {number} position - Its unchanged model position.
     * @returns {void} Appends only necessary drawing ownership ranges.
     * @example
     * // A non-outlined neighboring paragraph acquires no synthetic drawing.
     */
    (node, position) => {
      if (node.type.name !== "paragraph" && node.type.name !== "heading")
        return;
      let active = false;
      node.descendants(
        /**
         * Read existing source outline attributes without modifying marks.
         *
         * The source kind remains independent of foreground, shading and shadow.
         * @param {Node} child - Actual descendant inspected for a text-style mark.
         * @returns {void} Records whether this paragraph needs a contour layer.
         * @example
         * // An explicit NONE run stays ordinary text inside a mixed paragraph.
         */
        (child) => {
          if (child.isText)
            for (/** Only source text-style fields request native font contours. */ const mark of child.marks)
              if (
                mark.type.name === "textStyle" &&
              ((characterOutline(mark.attrs.nativeOutlineType)>0 && characterOutline(mark.attrs.nativeOutlineType)<7) ||
              (characterEmphasis(mark.attrs.nativeEmphasisType)>0 && characterEmphasis(mark.attrs.nativeEmphasisType)<13) || needsNativeWidth(mark.attrs))
              )
                active = true;
        },
      );
      if (!active) return;
      ranges.push(
        Decoration.node(position, position + node.nodeSize, {
          class: "forhan-outline-container forhan-outline-ready",
        }),
        Decoration.widget(position + 1, outlineWidget, {
          side: -1,
          key: `native-outline-${position}`,
          ignoreSelection: true,
        }),
      );
    },
  );
  return DecorationSet.create(doc, ranges);
}

/**
 * Keep paragraph-relative contour layers synchronized with actual source layout.
 *
 * Font, zoom, line-layout and selection changes repaint only owned SVG. IME
 * composition temporarily retains a visible CSS outline fallback until commit.
 * @param {EditorView} view - Actual live or temporary editor view.
 * @returns {object} Owned rendering lifecycle with deterministic cleanup.
 * @example
 * // One source edit still has exactly one undo step after its contours repaint.
 */
function outlineView(view: EditorView) {
  /** All deferred work is bounded to this view's actual window and font set. */
  const window = view.dom.ownerDocument.defaultView!,
    fonts = view.dom.ownerDocument.fonts;
  let frame = 0,
    destroyed = false;
  /**
   * Repaint original source glyphs after the current native layout is available.
   *
   * Rendering reads real source positions and never dispatches a transaction.
   * @returns {void} Updates only owned inaccessible paragraph contour widgets.
   * @example
   * // A selected partial word receives white outline strokes on its normal source highlight.
   */
  function paint(): void {
    frame = 0;
    if (destroyed || view.composing || !view.dom.isConnected) return;
    for (/** Widgets remain inside their original source paragraph or heading. */ const svg of view.dom.querySelectorAll<SVGSVGElement>(
      "svg[data-forhan-outline-drawing]",
    )) {
      /** Selection bounds come from the real immutable editor state. */
      const paragraph = svg.closest<HTMLElement>('.forhan-outline-container')!,
        selection = view.state.selection;
      drawNativeOutline(
        paragraph,
        svg,
        /**
         * Map one real DOM grapheme to its unchanged authored selection interval.
         *
         * Drawing nodes are excluded before this lookup, including nested widgets.
         * @param {Text} node - Original selectable source text node.
         * @param {number} from - UTF-16 start offset of its complete grapheme.
         * @param {number} to - UTF-16 end offset of that grapheme.
         * @returns {boolean} Whether this actual source interval is selected.
         * @example
         * // Surrogate pairs and joined characters are never split into separate contour marks.
         */
        (node, from, to) =>
          (selection instanceof TextSelection || selection instanceof AllSelection) && !selection.empty &&
          view.posAtDOM(node, from) < selection.to &&
          view.posAtDOM(node, to) > selection.from,
      );
    }
  }
  /**
   * Coalesce real source, font and viewport notifications into one paint frame.
   *
   * Destroyed import views cannot revive from a later font-ready promise.
   * @returns {void} Schedules at most one owned rendering callback.
   * @example
   * schedule(); // No source transaction or artificial timeout is required.
   */
  function schedule(): void {
    if (!destroyed && !frame) frame = window.requestAnimationFrame(paint);
  }
  /**
   * Retain visible editable source while native input composition is in progress.
   *
   * The final commit restores patterned contours at their new source positions.
   * @param {Event} event - Actual native composition start or end event.
   * @returns {void} Updates only rendering state and schedules committed drawing.
   * @example
   * // Korean IME preedit does not become an empty transparent text run.
   */
  function composition(event: Event): void {
    view.dom.classList.toggle(
      "forhan-outline-composing",
      event.type === "compositionstart",
    );
    if (event.type === "compositionend") schedule();
  }
  /** Only owned root and ancestor geometry can affect these source coordinates. */
  const observer = new ResizeObserver(schedule),
    ancestry = new MutationObserver(schedule);
  observer.observe(view.dom);
  for (
    let element = view.dom.parentElement;
    element;
    element = element.parentElement
  )
    ancestry.observe(element, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  fonts.addEventListener("loadingdone", schedule);
  view.dom.addEventListener("compositionstart", composition);
  view.dom.addEventListener("compositionend", composition);
  void fonts.ready.then(schedule);
  schedule();
  return {
    /**
     * Repaint after actual source, selection or native geometry transactions.
     *
     * DOM drawing changes do not dispatch further source updates.
     * @returns {void} Schedules one current-state contour repaint.
     * @example
     * // Undo immediately restores the original source kind and font contours.
     */
    update(): void {
      schedule();
    },
    /**
     * Release only this editor's drawing observers and pending frame.
     *
     * Temporary HTML import editors leave no global callbacks or font listeners.
     * @returns {void} Cancels and disconnects owned rendering work.
     * @example
     * // Closing an owned desktop editor releases its complete outline lifecycle.
     */
    destroy(): void {
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      ancestry.disconnect();
      fonts.removeEventListener("loadingdone", schedule);
      view.dom.removeEventListener("compositionstart", composition);
      view.dom.removeEventListener("compositionend", composition);
    },
  };
}

/** Native outlines share the existing editable text-style mark and source serialization. */
export const NativeCharacterOutline = Extension.create({
  name: "nativeCharacterOutline",
  /**
   * Retain explicit native outline kinds alongside ordinary character attributes.
   *
   * Plain external text has no synthetic outline preference or hidden source mark.
   * @returns {object[]} Native text-style attribute definition.
   * @example
   * // A color-only command retains an imported dotted outline.
   */
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          nativeOutlineType: {
            default: null,
            renderHTML: renderCharacterOutline,
            /**
             * Restore literal native outline metadata from an actual imported span.
             *
             * Nested emphasis may inherit the same source owner without losing the code.
             * @param {HTMLElement} element - Actual imported source element.
             * @returns {number|null} Supported explicit native code or absent preference.
             * @throws {RangeError} If explicit source metadata is unsupported.
             * @example
             * // The numeric DOT code is two for contours and remains independent of underline.
             */
            parseHTML: (element: HTMLElement) => {
              /** Source metadata never enters parsed HTML or executable code. */ const value =
                element
                  .closest("[data-forhan-outline]")
                  ?.getAttribute("data-forhan-outline");
              return value == null ? null : characterOutline(value);
            },
          },
        },
      },
    ];
  },
  /**
   * Register pure source ownership and measured contour painting together.
   *
   * The drawing state is absent from native writers, clipboard source and history.
   * @returns {Plugin[]} One owned outline rendering plugin.
   * @example
   * // A static HTML exporter separately materializes the same drawing helper.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: outlineKey,
        state: {
          /**
           * Initialize contour ownership from the actual immutable document.
           *
           * No font measurement or source mutation is needed to create the widgets.
           * @param {unknown} _config - Existing editor-state configuration.
           * @param {EditorState} state - Original immutable source state.
           * @returns {DecorationSet} Initial drawing-only ownership ranges.
           * @example
           * // Native outlines are visible on the first actual editor render.
           */
          init: (_config: unknown, state: EditorState) =>
            sourceOutlineDrawings(state.doc),
          /**
           * Replace drawing ownership only when the authored document changes.
           *
           * Selection-only updates repaint existing widgets without creating new ones.
           * @param {import('@tiptap/pm/state').Transaction} transaction - Actual editor update.
           * @param {DecorationSet} previous - Existing valid drawing ownership.
           * @returns {DecorationSet} Current source-derived widget and container ranges.
           * @example
           * // A single formatting command retains a single source undo step.
           */
          apply: (transaction, previous) =>
            transaction.docChanged
              ? sourceOutlineDrawings(transaction.doc)
              : previous,
        },
        props: {
          /**
           * Supply original source-position drawing ranges to the current native view.
           *
           * Serialization still reads the unchanged source document.
           * @param {EditorState} state - Actual current editor state.
           * @returns {DecorationSet|undefined} Current owned drawing ranges.
           * @example
           * // A paragraph with no outlined source text receives no widget.
           */
          decorations: (state) => outlineKey.getState(state),
        },
        view: outlineView,
      }),
    ];
  },
});

/**
 * Render the local character-outline preview without editing its source document.
 *
 * The preview uses the same actual font-contour helper as editor and output.
 * Parent source metadata preserves the independently pending shadow definition.
 * @param {HTMLElement} sample - Existing character preview sample.
 * @param {HTMLFormElement} form - Current cancelable character form.
 * @returns {void} Updates only local source metadata and contour drawing.
 * @throws {RangeError} If the actual local outline choice is unsupported.
 * @example
 * renderOutlinePreview(sample,form); // Choosing NONE restores filled preview glyphs.
 */
export function renderOutlinePreview(
  sample: HTMLElement,
  form: HTMLFormElement,
): void {
  /** Fixed form values remain independent from any imported document markup. */
  const code = characterOutline(
    form.querySelector<HTMLInputElement>('[name="outline-type"]')!.value,
  );
  sample.dataset.forhanOutline = String(code);
  sample.dataset.forhanEmphasis = String(characterEmphasis(form.querySelector<HTMLInputElement>('[name="emphasis-type"]')!.value));
  sample.dataset.forhanBaseFontSize =
    form.querySelector<HTMLInputElement>('[name="size"]')!.value + "pt";
  sample.classList.remove("forhan-outline-ready");
  applyNativeOutlines(sample);
  if (code > 0 && code < 7) {
    sample.style.webkitTextFillColor = "transparent";
    sample.style.textShadow = "none";
  } else sample.style.webkitTextFillColor = "currentColor";
}
