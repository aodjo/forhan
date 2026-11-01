import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection } from "@tiptap/pm/tables";
import {
  sourcePointerAt,
  sourceWordAt,
  type SourcePointer,
  type SourcePointerCoordinates,
} from "./source-pointer.ts";

/** An owned text gesture never retains source positions after its original document changes. */
interface WidthDrag {
  doc: EditorState["doc"];
  pointerId: number;
  anchor: number;
  from: number;
  to: number;
  mode: "character" | "word" | "paragraph";
  point: SourcePointerCoordinates;
  scroll: HTMLElement | null;
  cell: { position: number; table: number } | null;
  cells: boolean;
}

/**
 * Locate the original source cell and table containing a text position.
 *
 * Model roles keep nested tables distinct. No browser caret guess or selected
 * cell CSS class is used to construct a rectangular source selection.
 * @param {EditorView} view - Actual owning source editor.
 * @param {number} position - Valid original text position.
 * @returns {{position:number;table:number}|null} Containing cell/table positions, or null outside a cell.
 * @example
 * widthDragCell(view,position); // Text gestures can become real rectangular cell selections.
 */
function widthDragCell(
  view: EditorView,
  position: number,
): { position: number; table: number } | null {
  /** Source ancestors distinguish a nearest cell from an unrelated outer table. */
  const source = view.state.doc.resolve(position);
  let cell: number | null = null;
  for (let depth = source.depth; depth > 0; depth--) {
    /** Native table roles are independent of source heading or paragraph formatting. */
    const role = source.node(depth).type.spec.tableRole;
    if (cell === null && (role === "cell" || role === "header_cell"))
      cell = source.before(depth);
    if (role === "table" && cell !== null)
      return { position: cell, table: source.before(depth) };
  }
  return null;
}

/**
 * Find the actual source viewport that owns text-drag scrolling.
 *
 * Native paper zoom affects source coordinates independently of the scroll
 * container. Only this editor's existing scrolling ancestor can be moved.
 * @param {HTMLElement} root - Actual editable source root.
 * @returns {HTMLElement|null} Nearest source scroll container, or null without one.
 * @example
 * widthDragScroll(view.dom); // The document canvas, without moving another window.
 */
function widthDragScroll(root: HTMLElement): HTMLElement | null {
  for (let node = root.parentElement; node; node = node.parentElement) {
    /** Scroll ownership follows real CSS overflow rather than an application-global selector. */
    const style = root.ownerDocument.defaultView!.getComputedStyle(node);
    if (/auto|scroll/.test(style.overflowY + " " + style.overflowX))
      return node;
  }
  return null;
}

/**
 * Read a text gesture's real visible source viewport.
 *
 * The scroll container excludes its borders and scrollbars; viewport clipping
 * prevents unrelated toolbars from becoming drag-selection destinations.
 * @param {EditorView} view - Actual owning source view.
 * @param {HTMLElement|null} scroll - Owned source scroll container.
 * @returns {{left:number;right:number;top:number;bottom:number}} Visible physical source bounds.
 * @example
 * widthDragViewport(view,scroll); // Coordinates remain in physical viewport pixels.
 */
function widthDragViewport(
  view: EditorView,
  scroll: HTMLElement | null,
): { left: number; right: number; top: number; bottom: number } {
  /** Browser viewport limits remain independent of native paper zoom. */
  const window = view.dom.ownerDocument.defaultView!,
    rect = scroll?.getBoundingClientRect();
  return {
    left: Math.max(0, rect ? rect.left + scroll!.clientLeft : 0),
    right: Math.min(
      window.innerWidth,
      rect
        ? rect.left + scroll!.clientLeft + scroll!.clientWidth
        : window.innerWidth,
    ),
    top: Math.max(0, rect ? rect.top + scroll!.clientTop : 0),
    bottom: Math.min(
      window.innerHeight,
      rect
        ? rect.top + scroll!.clientTop + scroll!.clientHeight
        : window.innerHeight,
    ),
  };
}

/**
 * Expand a genuine source pointer according to native text-selection granularity.
 *
 * Double-click drags retain Unicode word boundaries; triple-click drags retain
 * complete source text blocks. Character dragging always retains whole graphemes.
 * @param {EditorView} view - Actual owning source view.
 * @param {SourcePointer} point - Actual source interval under the pointer.
 * @param {'character'|'word'|'paragraph'} mode - Selection granularity chosen on mouse down.
 * @returns {{from:number;to:number}} Expanded original source interval.
 * @example
 * widthDragRange(view,point,'word'); // Includes the complete original Hebrew word.
 */
function widthDragRange(
  view: EditorView,
  point: SourcePointer,
  mode: WidthDrag["mode"],
): { from: number; to: number } {
  if (mode === "word")
    return sourceWordAt(view, point) || { from: point.from, to: point.to };
  if (mode === "paragraph") {
    /** Text-block edges remain real source positions even in nested list or table paragraphs. */
    const source = view.state.doc.resolve(point.from);
    return { from: source.start(), to: source.end() };
  }
  return { from: point.head, to: point.head };
}

/**
 * Own corrected text-drag selection while retaining normal node and selected-text dragging.
 *
 * Trusted mouse pointer capture keeps release/cancellation observable outside
 * the document canvas. Physical source ranges drive selection and auto-scroll;
 * document replacement, composition and destruction release all owned work.
 * @param {EditorView} view - Actual source view whose plugin owns this lifecycle.
 * @returns {object} Pointer observation, mouse-start and source-view lifecycle hooks.
 * @example
 * widthDragView(view); // Installs listeners only while an owned text gesture is active.
 */
export function widthDragView(view: EditorView) {
  /** Every deferred callback belongs to this source document and window. */
  const document = view.dom.ownerDocument,
    window = document.defaultView!,
    ancestry = new window.MutationObserver(schedule);
  let observed: PointerEvent | null = null,
    active: WidthDrag | null = null,
    frame = 0,
    destroyed = false;

  /**
   * Release only the current gesture's capture, listeners and animation work.
   *
   * Clearing state before releasing capture makes lostpointercapture harmless.
   * Original source text, selection and authored undo history remain unchanged.
   * @returns {void} Ends owned pointer observation without a document edit.
   * @example
   * release(); // A mouse release cannot leave background auto-scroll running.
   */
  function release(): void {
    /** Pointer identity is retained locally only for releasing this view's own capture. */
    const previous = active;
    active = null;
    observed = null;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", cancel, true);
    document.removeEventListener("keydown", key, true);
    view.dom.removeEventListener("lostpointercapture", cancel);
    window.removeEventListener("blur", release);
    window.removeEventListener("resize", schedule);
    previous?.scroll?.removeEventListener("scroll", schedule);
    ancestry.disconnect();
    if (previous && view.dom.hasPointerCapture(previous.pointerId))
      view.dom.releasePointerCapture(previous.pointerId);
  }

  /**
   * Commit original text selection independently of source content and layout history.
   *
   * Identical source selections do not dispatch another rendering transaction,
   * preventing stationary pointer frames from creating feedback loops.
   * @param {number} anchor - Original source anchor position.
   * @param {number} head - Original source destination position.
   * @returns {void} Changes only the actual model selection when needed.
   * @example
   * select(anchor,head); // Corrected glyph drawing remains outside the selection.
   */
  function select(anchor: number, head: number): void {
    /** Only source positions enter the immutable text selection. */
    const selection = TextSelection.create(view.state.doc, anchor, head);
    if (!selection.eq(view.state.selection))
      view.dispatch(
        view.state.tr.setSelection(selection).setMeta("pointer", true),
      );
  }

  /**
   * Update the logical drag edge from the last real physical pointer position.
   *
   * Viewport clamping keeps page margins and scrolling outside the canvas
   * associated with this document rather than an unrelated control.
   * @returns {void} Updates source selection without changing text or formatting.
   * @example
   * measure(); // A reversed Hebrew drag retains its original logical anchor.
   */
  function measure(): void {
    if (!active || active.doc !== view.state.doc || view.composing) {
      release();
      return;
    }
    /** Actual visible source coordinates remain separate from the original offscreen pointer. */
    const viewport = widthDragViewport(view, active.scroll),
      point = sourcePointerAt(view, {
        left: Math.max(
          viewport.left + 1,
          Math.min(viewport.right - 1, active.point.left),
        ),
        top: Math.max(
          viewport.top + 1,
          Math.min(viewport.bottom - 1, active.point.top),
        ),
      });
    if (!point) return;
    if (active.cell) {
      /** Crossing real source cells retains the table editor's independent rectangular selection semantics. */
      const cell = widthDragCell(view, point.head);
      if (
        cell &&
        cell.table === active.cell.table &&
        (cell.position !== active.cell.position || active.cells)
      ) {
        /** Native cell selections keep glyph foreground independent of ordinary text-range highlighting. */
        const selection = CellSelection.create(
          view.state.doc,
          active.cell.position,
          cell.position,
        );
        active.cells = true;
        if (!selection.eq(view.state.selection))
          view.dispatch(
            view.state.tr.setSelection(selection).setMeta("pointer", true),
          );
        return;
      }
      if (active.cells) return;
    }
    if (active.mode === "character") {
      select(active.anchor, point.head);
      return;
    }
    /** Word/block dragging retains the initial whole interval when the pointer changes direction. */
    const range = widthDragRange(view, point, active.mode);
    if (point.head < active.from || range.to <= active.from)
      select(active.to, range.from);
    else select(active.from, range.to);
  }

  /**
   * Move only the owned source canvas while a live pointer reaches its visible edge.
   *
   * Scroll limits stop animation immediately. Pointer capture supplies the final
   * release even when the pointer leaves the canvas or the application window.
   * @returns {boolean} Whether real canvas scrolling changed source geometry.
   * @example
   * scroll(); // Holding below the document viewport selects later original lines.
   */
  function scroll(): boolean {
    if (!active?.scroll) return false;
    /** Edge velocity is bounded in actual scroll-container CSS pixels per animation frame. */
    const host = active.scroll,
      viewport = widthDragViewport(view, host),
      x = active.point.left,
      y = active.point.top,
      dx =
        x < viewport.left + 16
          ? -Math.min(24, (viewport.left + 16 - x) / 2)
          : x > viewport.right - 16
            ? Math.min(24, (x - viewport.right + 16) / 2)
            : 0,
      dy =
        y < viewport.top + 16
          ? -Math.min(24, (viewport.top + 16 - y) / 2)
          : y > viewport.bottom - 16
            ? Math.min(24, (y - viewport.bottom + 16) / 2)
            : 0,
      left = host.scrollLeft,
      top = host.scrollTop;
    host.scrollLeft += dx;
    host.scrollTop += dy;
    return host.scrollLeft !== left || host.scrollTop !== top;
  }

  /**
   * Complete one owned selection frame and continue only actual edge scrolling.
   *
   * Source mutation or cancellation makes queued callbacks harmless. Geometry
   * is measured after scrolling so the selected logical destination stays current.
   * @returns {void} Recomputes the live source selection and bounded continuation.
   * @example
   * render(); // A stationary pointer cannot keep dispatching unchanged selections.
   */
  function render(): void {
    frame = 0;
    if (!active || destroyed) return;
    /** Actual movement determines whether another scrolling frame is necessary. */
    const moved = scroll();
    measure();
    if (moved) schedule();
  }

  /**
   * Coalesce pointer and native geometry changes into one owned animation frame.
   *
   * Gesture cleanup cancels the same frame rather than leaving deferred work
   * attached to a replacement document or destroyed editor.
   * @returns {void} Schedules at most one live text-selection measurement.
   * @example
   * schedule(); // Several same-frame pointer moves share one actual geometry read.
   */
  function schedule(): void {
    if (active && !destroyed && !frame)
      frame = window.requestAnimationFrame(render);
  }

  /**
   * Observe movement only for the captured original mouse pointer.
   *
   * Button release without a matching up event ends ownership immediately.
   * Touch/pen or another pointer cannot move this source selection.
   * @param {PointerEvent} event - Original captured pointer movement.
   * @returns {void} Updates the live physical destination or releases the gesture.
   * @example
   * move(event); // Captured event targets need not be the text element under the pointer.
   */
  function move(event: PointerEvent): void {
    if (!active || event.pointerId !== active.pointerId) return;
    if (!(event.buttons & 1)) {
      release();
      return;
    }
    active.point = { left: event.clientX, top: event.clientY };
    event.preventDefault();
    schedule();
  }

  /**
   * Finalize the original source range before releasing pointer capture.
   *
   * The final pointer position is measured even without a preceding move frame.
   * Selection-only transactions cannot create another authored undo step.
   * @param {PointerEvent} event - Matching original mouse pointer release.
   * @returns {void} Commits the final source selection and releases owned work.
   * @example
   * up(event); // Releasing outside the paper still ends the correct text drag.
   */
  function up(event: PointerEvent): void {
    if (!active || event.pointerId !== active.pointerId) return;
    active.point = { left: event.clientX, top: event.clientY };
    measure();
    event.preventDefault();
    release();
  }

  /**
   * Cancel a gesture only when its captured pointer is lost or canceled.
   *
   * Selection remains at its last valid source position; no text mutation or
   * synthetic input is introduced when capture ends unexpectedly.
   * @param {PointerEvent} event - Original pointer cancellation or lost capture.
   * @returns {void} Releases matching gesture resources.
   * @example
   * cancel(event); // Losing capture never leaves automatic scrolling active.
   */
  function cancel(event: PointerEvent): void {
    if (active?.pointerId === event.pointerId) release();
  }

  /**
   * End owned pointer selection when the user cancels it with Escape.
   *
   * The existing source selection remains valid and other application Escape
   * handlers retain their normal menu, dialog and find-panel behavior.
   * @param {KeyboardEvent} event - Actual source-document keyboard event.
   * @returns {void} Releases owned capture and scrolling on explicit cancellation.
   * @example
   * key(event); // Escape cannot leave a held off-canvas pointer scrolling the document.
   */
  function key(event: KeyboardEvent): void {
    if (event.key === "Escape") release();
  }

  return {
    /**
     * Remember the real pointer identity before its compatibility mouse-down event.
     *
     * Mouse click counts remain browser-owned. Touch and pen continue through
     * their existing native selection and composition paths.
     * @param {PointerEvent} event - Original pointer-down event on this source view.
     * @returns {void} Retains only the current mouse pointer observation.
     * @example
     * controller.pointer(event); // Capture can later be scoped to the same physical mouse.
     */
    pointer(event: PointerEvent): void {
      observed = event.pointerType === "mouse" ? event : null;
    },
    /**
     * Start a source-based text gesture at an actual native-width document position.
     *
     * Existing node/cell selections, modified clicks and selected-text dragging
     * retain the editor's native behavior. Original browser click counts choose
     * character, word or paragraph granularity without a custom timing heuristic.
     * @param {MouseEvent} event - Original compatibility mouse-down event.
     * @returns {boolean} Whether this view owns the corrected text selection gesture.
     * @example
     * controller.start(event); // A native-width Hebrew drag starts at the actual logical source edge.
     */
    start(event: MouseEvent): boolean {
      if (
        destroyed ||
        !observed ||
        !observed.isTrusted ||
        !event.isTrusted ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        view.composing ||
        !view.editable ||
        !(view.state.selection instanceof TextSelection)
      )
        return false;
      /** Normal documents retain the editor's existing pointer and node-selection behavior. */
      const target =
          event.target instanceof window.Element ? event.target : null,
        paragraph = target?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6");
      if (
        !paragraph ||
        !view.dom.contains(paragraph) ||
        target?.closest(
          'img,[contenteditable="false"],.column-resize-handle',
        ) ||
        !view.dom.querySelector("[data-forhan-width-ratio],[data-forhan-context-ratio]")
      )
        return false;
      /** Original pointer precision prevents rounded compatibility mouse coordinates from changing bidi affinity on release. */
      const coordinates = { left: observed.clientX, top: observed.clientY },
        point = sourcePointerAt(view, coordinates),
        selection = view.state.selection;
      if (!point) return false;
      if (
        paragraph.closest("td,th") &&
        (!point.rect ||
          coordinates.left < point.rect.left ||
          coordinates.left > point.rect.right ||
          coordinates.top < point.rect.top ||
          coordinates.top > point.rect.bottom)
      )
        return false;
      if (
        event.detail <= 1 &&
        !event.shiftKey &&
        !selection.empty &&
        point.from >= selection.from &&
        point.to <= selection.to
      )
        return false;
      /** Source document identity and browser click granularity remain fixed for this gesture. */
      const pointerId = observed.pointerId,
        mode: WidthDrag["mode"] =
          event.detail >= 3
            ? "paragraph"
            : event.detail === 2
              ? "word"
              : "character",
        range = widthDragRange(view, point, mode),
        anchor =
          mode === "character" && event.shiftKey
            ? selection.anchor
            : range.from;
      release();
      active = {
        doc: view.state.doc,
        pointerId,
        anchor,
        from: range.from,
        to: range.to,
        mode,
        point: coordinates,
        scroll: widthDragScroll(view.dom),
        cell: widthDragCell(view, anchor),
        cells: false,
      };
      view.focus();
      select(anchor, mode === "character" ? point.head : range.to);
      view.dom.setPointerCapture(pointerId);
      document.addEventListener("pointermove", move, {
        capture: true,
        passive: false,
      });
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", cancel, true);
      document.addEventListener("keydown", key, true);
      view.dom.addEventListener("lostpointercapture", cancel);
      window.addEventListener("blur", release);
      window.addEventListener("resize", schedule);
      active.scroll?.addEventListener("scroll", schedule, { passive: true });
      for (
        let ancestor: HTMLElement | null = view.dom;
        ancestor;
        ancestor = ancestor.parentElement
      )
        ancestry.observe(ancestor, {
          attributes: true,
          attributeFilter: ["style", "class"],
        });
      event.preventDefault();
      return true;
    },
    /**
     * Reconcile a live gesture with current source and native drawing changes.
     *
     * Replacing or editing the source cancels stale model positions immediately.
     * Drawing-only changes remeasure the same valid source anchor.
     * @param {EditorView} current - Updated source view.
     * @param {EditorState} previous - Previous immutable source state.
     * @returns {void} Releases stale gestures or schedules valid current geometry.
     * @example
     * controller.update(view,previous); // Undo or document replacement cannot reuse an old drag anchor.
     */
    update(current: EditorView, previous: EditorState): void {
      if (!active) return;
      if (previous.doc !== current.state.doc) {
        release();
        return;
      }
      schedule();
    },
    /**
     * Destroy only this source view's pointer-selection lifecycle.
     *
     * No captured pointer, document listener or auto-scroll callback survives
     * destruction of an editor or a temporary import view.
     * @returns {void} Permanently releases all owned gesture work.
     * @example
     * controller.destroy(); // Closing an editor cannot move another document's selection.
     */
    destroy(): void {
      destroyed = true;
      release();
    },
  };
}
