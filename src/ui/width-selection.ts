import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { needsNativeWidth } from "../character-width.ts";
import { widthDragView } from "./width-drag.ts";
import {
  sourcePointerAt,
  sourceWordAt,
  type SourcePointer,
} from "./source-pointer.ts";

/**
 * Recover a pointer position from actual native-width source geometry.
 *
 * Browser caret hit testing can identify a different bidi run after horizontal
 * advance corrections. Original DOM ranges still have correct physical boxes;
 * complete graphemes map those boxes back to unchanged logical source offsets.
 * Anonymous contextual tables can report an ancestor rather than a decorated
 * cell as their hit target; actual contained source bounds resolve that case.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {MouseEvent} event - Original pointer event in viewport coordinates.
 * @returns {SourcePointer|null} Original source interval and nearest logical edge, or null outside native glyphs.
 * @throws {RangeError|SyntaxError} If retained native measurement data is invalid.
 * @example
 * nativeWidthPointer(view,event); // The right edge of a Hebrew glyph maps to its source start.
 */
function nativeWidthPointer(
  view: EditorView,
  event: MouseEvent,
): SourcePointer | null {
  /** Event targets belong to this source document rather than an auxiliary print window. */
  const window = view.dom.ownerDocument.defaultView!,
    element = event.target instanceof window.Element ? event.target : null,
    target =
      element
        ? element.closest<HTMLElement>("[data-forhan-width-ratio],[data-forhan-context-ratio]")
        : null;
  if (target && view.dom.contains(target))
    return sourcePointerAt(view, { left: event.clientX, top: event.clientY });
  if (!element || !view.dom.contains(element) || !view.dom.querySelector('[data-forhan-context-cell]')) return null;
  /** Genuine source containment distinguishes a contextual glyph hit from ordinary paragraph margins. */
  const point=sourcePointerAt(view,{left:event.clientX,top:event.clientY});
  if (!point?.rect || !point.paragraph.querySelector('[data-forhan-context-cell]') ||
      event.clientX<point.rect.left || event.clientX>point.rect.right ||
      event.clientY<point.rect.top || event.clientY>point.rect.bottom) return null;
  return point;
}

/**
 * Place an actual source caret after a native-width pointer click.
 *
 * Source selection uses immutable model positions and never the inaccessible
 * glyph drawing. Ordinary document clicks and node-selection modifiers retain
 * their existing editor behavior.
 * @param {EditorView} view - Actual owning source editor.
 * @param {number} _position - Browser-reported position, which may belong to another bidi run.
 * @param {MouseEvent} event - Actual completed source click.
 * @returns {boolean} Whether a corrected native source selection was dispatched.
 * @example
 * selectNativeWidth(view,position,event); // Typing enters the clicked Hebrew source interval.
 */
function selectNativeWidth(
  view: EditorView,
  _position: number,
  event: MouseEvent,
): boolean {
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey)
    return false;
  /** Source identity is recovered before focus changes can alter the browser's native selection. */
  const point = nativeWidthPointer(view, event);
  if (!point) return false;
  /** Shift extends the same original model anchor without adding a document edit. */
  const anchor = event.shiftKey ? view.state.selection.anchor : point.head;
  view.focus();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, anchor, point.head))
      .setMeta("pointer", true),
  );
  return true;
}

/**
 * Select the original source word beneath a native-width double click.
 *
 * Unicode word segmentation spans formatting marks and keeps original model
 * offsets. Inline objects occupy one placeholder position so they cannot shift
 * the selected source interval or become duplicated auxiliary drawing text.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {number} _position - Untrusted browser caret position for the same pointer.
 * @param {MouseEvent} event - Original native double-click event.
 * @returns {boolean} Whether a complete original source word was selected.
 * @example
 * selectNativeWidthWord(view,position,event); // Selects עברית while adjacent numbers remain unchanged.
 */
function selectNativeWidthWord(
  view: EditorView,
  _position: number,
  event: MouseEvent,
): boolean {
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey)
    return false;
  /** The clicked source grapheme identifies the word even at a bidi boundary. */
  const point = nativeWidthPointer(view, event);
  if (!point) return false;
  /** Click and drag word selection share complete original Unicode boundaries. */
  const word = sourceWordAt(view, point);
  if (!word) return false;
  view.focus();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, word.from, word.to))
      .setMeta("pointer", true),
  );
  return true;
}

/**
 * Insert committed text at the authoritative native-width source selection.
 *
 * Browser bidi caret affinity can lag behind drawing-wrapper replacement and
 * reorder rapidly typed characters after replacing an RTL word. Canceling the
 * ordinary insertText default makes the source transaction own its next caret.
 * Composing text, paste, deletion and unrelated source runs retain their normal
 * editor input paths; an IME keeps ownership until its composition completes.
 * @param {EditorView} view - Actual owning editable source view.
 * @param {InputEvent} event - Original browser beforeinput event.
 * @returns {boolean} Whether committed text was inserted directly into its original source selection.
 * @throws {RangeError} If retained native character measurements are invalid.
 * @example
 * insertNativeWidthText(view,event); // Rapid NEW remains NEW after replacing a Hebrew word.
 */
function insertNativeWidthText(view: EditorView, event: InputEvent): boolean {
  if (
    view.composing ||
    event.isComposing ||
    event.defaultPrevented ||
    event.inputType !== "insertText" ||
    !event.data
  )
    return false;
  /** Stored marks and the current source cursor identify the actual active native-width context. */
  const state = view.state,
    mark = state.schema.marks.textStyle?.isInSet(
      state.storedMarks || state.selection.$from.marks(),
    );
  if (!mark || !needsNativeWidth(mark.attrs)) return false;
  event.preventDefault();
  view.dispatch(
    state.tr
      .insertText(event.data)
      .setMeta("uiEvent", "input")
      .scrollIntoView(),
  );
  return true;
}

/** Native-width pointer selection maps real source geometry independently of browser caret guesses. */
export const NativeWidthSelection = Extension.create({
  name: "nativeWidthSelection",
  /**
   * Register source-based pointer selection and committed native-width text input.
   *
   * Rendering and selection transactions remain independent of source content,
   * source formatting, clipboard serialization and authored undo history.
   * @returns {Plugin[]} One owned source-selection plugin.
   * @example
   * // Native-width drawings remain inaccessible to pointer and keyboard selection.
   */
  addProseMirrorPlugins() {
    let drag: ReturnType<typeof widthDragView> | undefined;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            beforeinput: insertNativeWidthText,
            /**
             * Observe actual mouse pointer identity before compatibility selection events.
             *
             * Native touch and pen behavior remains with the existing editor.
             * @param {EditorView} _view - Owning source view.
             * @param {PointerEvent} event - Original source pointer-down event.
             * @returns {boolean} False so ordinary pointer event processing continues.
             * @example
             * // Pointer capture later belongs to the same real mouse gesture.
             */
            pointerdown: (_view, event) => {
              drag?.pointer(event);
              return false;
            },
            /**
             * Start corrected text dragging from the actual source geometry.
             *
             * The owned gesture handles real release and cancellation independently
             * of the browser's unreliable bidi caret hit testing.
             * @param {EditorView} _view - Owning source view.
             * @param {MouseEvent} event - Original compatibility mouse-down event.
             * @returns {boolean} Whether corrected source selection owns this gesture.
             * @example
             * // A Hebrew drag does not select the adjacent numeric source run.
             */
            mousedown: (_view, event) => drag?.start(event) ?? false,
          },
          handleClick: selectNativeWidth,
          handleDoubleClick: selectNativeWidthWord,
        },
        /**
         * Bind native-width dragging to the owning source view's lifecycle.
         *
         * Temporary import views and replacement documents cannot retain source
         * anchors, global document listeners or auto-scroll animation frames.
         * @param {EditorView} view - Actual owning editable source view.
         * @returns {object} Owned pointer gesture and source-view lifecycle hooks.
         * @example
         * // Destroying the view releases any captured mouse pointer.
         */
        view: (view) => {
          drag = widthDragView(view);
          return drag;
        },
      }),
    ];
  },
});
