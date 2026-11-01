/** A native-style scrollbar bound to the actual document canvas. */
export interface NativeScrollBinding {
  /**
   * Recompute the document scrollbar geometry.
   *
   * Call after an external layout change when immediate measurement is required.
   * @returns {void} Synchronizes the visible thumb with the document canvas.
   * @example
   * binding.refresh();
   */
  refresh(): void;
  /**
   * Release the document scrollbar binding.
   *
   * Disconnect observers and listeners before discarding the application shell.
   * @returns {void} Releases resources owned by this binding.
   * @example
   * binding.destroy();
   */
  destroy(): void;
}

import {readNativePageView} from './native-page-view.ts';
import {nativeSheetGoToPage,nativeSheetSourcePage} from './native-sheet-selection.ts';
import type {EditorView} from '@tiptap/pm/view';

/**
 * Render the document scrollbar and page navigation controls.
 *
 * The narrow strip follows the observed native blank-window geometry while its thumb reflects real content size.
 * @returns {string} Accessible controls without document-specific content.
 * @example
 * workspace.insertAdjacentHTML('beforeend', renderNativeScroll());
 */
export function renderNativeScroll(): string {
  return `<aside class="native-scroll-strip" aria-label="문서 스크롤"><span class="native-scroll-grip" aria-hidden="true"></span><button class="native-scroll-up" data-scroll-command="up" aria-label="위로 스크롤"></button><div class="native-scroll-track"><div class="native-scroll-thumb" role="scrollbar" tabindex="0" aria-label="문서 위치" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"></div></div><button class="native-scroll-down" data-scroll-command="down" aria-label="아래로 스크롤"></button><button class="native-scroll-select" data-scroll-command="select" aria-label="찾아가기"><span></span></button><button class="native-scroll-previous" data-scroll-command="previous" aria-label="이전 쪽"></button><button class="native-scroll-next" data-scroll-command="next" aria-label="다음 쪽"></button><div class="native-scroll-page-picker" hidden><label for="native-scroll-page-number">찾아가기</label><input id="native-scroll-page-number" type="number" min="1" value="1" aria-label="쪽 번호"><button data-scroll-command="apply">이동</button></div></aside>`;
}

/**
 * Synchronize native scrollbar controls with a document canvas.
 *
 * Wheel, dragging, keyboard navigation, track clicks, resize and document edits all retain the browser's actual scroll position.
 * @param {HTMLElement} root - Application element containing the canvas and rendered strip.
 * @param {EditorView} [view] - Actual original source view for native caret-based page navigation.
 * @returns {NativeScrollBinding} Explicit refresh and teardown operations for the owned listeners.
 * @throws {Error} When the required document scrolling controls are absent.
 * @example
 * const binding = bindNativeScroll(document.querySelector('main')!);
 */
export function bindNativeScroll(root: HTMLElement,view?:EditorView): NativeScrollBinding {
  /** Scrollable document canvas. */
  const canvas = root.querySelector<HTMLElement>(".canvas");
  /** Native control strip. */
  const strip = root.querySelector<HTMLElement>(".native-scroll-strip");
  /** Draggable content-position indicator. */
  const thumb = strip?.querySelector<HTMLElement>(".native-scroll-thumb");
  /** Clickable document-position track. */
  const track = strip?.querySelector<HTMLElement>(".native-scroll-track");
  if (!canvas || !strip || !thumb || !track)
    throw new Error("Native scrollbar controls are missing.");
  /** Validated canvas retained by event callbacks. */
  const documentCanvas: HTMLElement = canvas;
  /** Validated control strip retained by event callbacks. */
  const scrollStrip: HTMLElement = strip;
  /** Validated thumb retained by event callbacks. */
  const scrollThumb: HTMLElement = thumb;
  /** Validated track retained by event callbacks. */
  const scrollTrack: HTMLElement = track;
  /** Vertical ruler labels follow the actual paper origin without touching editable source. */
  const verticalRuler=root.querySelector<HTMLElement>('.native-vertical-ruler');
  /** Abort controller releases every listener on teardown. */
  const listeners = new AbortController();
  /** Current pointer drag, if any. */
  let drag: { pointerId: number; y: number; scrollTop: number } | null = null;

  /**
   * Read current physical sheet navigation from the actual rendered paper.
   *
   * Measured native sheets include their independent borders and intervening
   * workspace gaps. Unprojected source retains its established continuous
   * scrolling path until complete physical geometry becomes available.
   * @returns {{count:number;stride:number;origin:number;current:number}} Current physical navigation bounds.
   * @example
   * const pages=physicalPages(); // A four-sheet document exposes exactly four destinations.
   */
  function physicalPages():{count:number;stride:number;origin:number;current:number}{
    /** Actual paper metadata is display state and never enters source document serialization. */
    const paper=documentCanvas.querySelector<HTMLElement>('.paper'),style=getComputedStyle(documentCanvas),
      zoom=Number.parseFloat(style.getPropertyValue('--native-zoom'))||1.25,
      pageHeight=(Number.parseFloat(getComputedStyle(paper??documentCanvas).getPropertyValue('--page-height'))||297)*96/25.4,
      stride=(Number(paper?.dataset.forhanPageStride)||pageHeight)*zoom,
      count=Number(paper?.dataset.forhanPageCount)||Math.max(1,Math.ceil(((paper?.scrollHeight||pageHeight)*zoom-1)/stride)),
      origin=0,
      current=Math.max(1,Math.min(count,view?(nativeSheetSourcePage(view)??Math.floor((documentCanvas.scrollTop-origin+1)/stride))+1:Math.floor((documentCanvas.scrollTop-origin+1)/stride)+1));
    return {count,stride,origin,current};
  }

  /**
   * Navigate to an original physical source page through the actual caret map.
   *
   * Unsupported documents retain the established continuous viewport fallback.
   * Complete native source geometry moves the real caret and horizontal viewport
   * together, including destinations that are already visible in the same row.
   * @param {number} page - Validated one-based physical page destination.
   * @returns {void} Updates only source selection and the actual document viewport.
   * @example
   * navigateToPage(2); // Both page status and the active horizontal ruler follow page two.
   */
  function navigateToPage(page:number):void{
    if(view&&nativeSheetGoToPage(view,page-1))return;
    /** Original continuous flow retains physical vertical page distances when no complete source map exists. */
    const pages=physicalPages();documentCanvas.scrollTop=pages.origin+(page-1)*pages.stride;
  }

  /**
   * Refresh the thumb from the current scroll range.
   *
   * Read actual layout measurements so zoom, resizing and document length remain
   * synchronized. Vertical ruler labels retain the actual first paper origin.
   * @returns {void} Updates thumb geometry, accessible ranges and the source-free ruler origin.
   * @example
   * refresh();
   */
  function refresh(): void {
    /** Centering, document scaling and scrolling can move paper independently from its source content width. */
    const paper=documentCanvas.querySelector<HTMLElement>('.paper');
    if(paper&&verticalRuler){
      /** A ruler-owned variable avoids triggering source-ancestor observers during ordinary scrolling. */
      const origin=`${paper.getBoundingClientRect().top-verticalRuler.getBoundingClientRect().top}px`;
      if(verticalRuler.style.getPropertyValue('--native-paper-top')!==origin)verticalRuler.style.setProperty('--native-paper-top',origin);
    }
    /** Available vertical track pixels. */
    const height = scrollTrack.clientHeight;
    /** Maximum supported document offset. */
    const maximum = Math.max(
      0,
      documentCanvas.scrollHeight - documentCanvas.clientHeight,
    );
    /** Proportional thumb length, with a usable minimum for long documents. */
    const length = maximum
      ? Math.max(
          24,
          Math.round(
            (height * documentCanvas.clientHeight) /
              documentCanvas.scrollHeight,
          ),
        )
      : height;
    scrollThumb.style.height = `${length}px`;
    scrollThumb.style.top = `${maximum ? Math.round(((height - length) * documentCanvas.scrollTop) / maximum) : 0}px`;
    scrollThumb.setAttribute("aria-valuemax", String(maximum));
    scrollThumb.setAttribute(
      "aria-valuenow",
      String(Math.round(documentCanvas.scrollTop)),
    );
    scrollThumb.setAttribute("aria-disabled", String(maximum === 0));
  }

  /**
   * Scroll by one line or document viewport.
   *
   * The page selector delegates to the existing page navigation control rather than modifying the document.
   * @param {MouseEvent} event - Click from a navigation button or the track.
   * @returns {void} Moves the real canvas or opens its existing page selector.
   * @example
   * scrollStrip.addEventListener('click', handleClick);
   */
  function handleClick(event: MouseEvent): void {
    /** Closest native navigation button. */
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-scroll-command]",
    );
    /** Requested action from the clicked control. */
    const command = button?.dataset.scrollCommand;
    if (command === "select" || command === "apply") {
      /** Independent page-position picker, distinct from the native object browsing menu. */
      const picker = scrollStrip.querySelector<HTMLElement>(
        ".native-scroll-page-picker",
      );
      /** Numeric page destination entered by the user. */
      const input = scrollStrip.querySelector<HTMLInputElement>(
        "#native-scroll-page-number",
      );
      if (!picker || !input) return;
      /** Actual measured sheet origins include physical page borders and workspace gaps. */
      const pages=physicalPages();
      if (command === "select") {
        picker.hidden = !picker.hidden;
        input.max = String(pages.count);
        input.value = String(pages.current);
        if (!picker.hidden) input.focus();
      } else {
        navigateToPage(Math.max(
            1,
            Math.min(
              pages.count,
              Number.isFinite(Number(input.value)) ? Math.floor(Number(input.value)) : 1,
            ),
          ));
        picker.hidden = true;
        if(!view?.hasFocus())documentCanvas.focus();
        refresh();
      }
      return;
    }
    if (command) {
      if(command==='previous'||command==='next'){
        /** Buttons move between complete physical sheets rather than arbitrary viewport heights. */
        const pages=physicalPages(),destination=Math.max(1,Math.min(pages.count,pages.current+(command==='previous'?-1:1)));
        navigateToPage(destination);
        refresh();return;
      }
      documentCanvas.scrollTop +=
        command === "up"
          ? -48
          : 48;
      refresh();
      return;
    }
    if (event.target === scrollTrack)
      documentCanvas.scrollTop +=
        (event.clientY < scrollThumb.getBoundingClientRect().top ? -1 : 1) *
        documentCanvas.clientHeight;
    refresh();
  }

  /**
   * Begin dragging the scrollbar thumb.
   *
   * Pointer capture keeps dragging synchronized even when the pointer leaves the narrow control.
   * @param {PointerEvent} event - Primary pointer press on the thumb.
   * @returns {void} Starts an owned drag without selecting document text.
   * @example
   * scrollThumb.addEventListener('pointerdown', beginDrag);
   */
  function beginDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      y: event.clientY,
      scrollTop: documentCanvas.scrollTop,
    };
    scrollThumb.setPointerCapture(event.pointerId);
  }

  /**
   * Translate thumb movement to document scroll offset.
   *
   * The remaining track distance maps to the full current document range.
   * @param {PointerEvent} event - Pointer movement during an owned drag.
   * @returns {void} Updates the canvas when a drag is active.
   * @example
   * scrollThumb.addEventListener('pointermove', moveDrag);
   */
  function moveDrag(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    /** Available travel after accounting for thumb length. */
    const travel = scrollTrack.clientHeight - scrollThumb.offsetHeight;
    if (travel > 0)
      documentCanvas.scrollTop =
        drag.scrollTop +
        ((event.clientY - drag.y) *
          (documentCanvas.scrollHeight - documentCanvas.clientHeight)) /
          travel;
    refresh();
  }

  /**
   * Finish a captured thumb drag.
   *
   * Pointer cancellation and normal release share the same idempotent cleanup.
   * @param {PointerEvent} event - Pointer release or cancellation.
   * @returns {void} Clears the active drag and releases capture when still held.
   * @example
   * scrollThumb.addEventListener('pointerup', endDrag);
   */
  function endDrag(event: PointerEvent): void {
    if (drag?.pointerId !== event.pointerId) return;
    drag = null;
    if (scrollThumb.hasPointerCapture(event.pointerId))
      scrollThumb.releasePointerCapture(event.pointerId);
  }

  /**
   * Apply keyboard navigation to the focused scrollbar.
   *
   * Arrow keys move by lines, page keys move by viewports, and Home/End select the document limits.
   * @param {KeyboardEvent} event - Key press on the accessible scrollbar.
   * @returns {void} Handles recognized navigation keys only.
   * @example
   * scrollThumb.addEventListener('keydown', handleKey);
   */
  function handleKey(event: KeyboardEvent): void {
    /** Scroll deltas for supported relative navigation keys. */
    const deltas: Record<string, number> = {
      ArrowUp: -48,
      ArrowDown: 48,
      PageUp: -documentCanvas.clientHeight,
      PageDown: documentCanvas.clientHeight,
    };
    if (event.key in deltas) documentCanvas.scrollTop += deltas[event.key];
    else if (event.key === "Home") documentCanvas.scrollTop = 0;
    else if (event.key === "End")
      documentCanvas.scrollTop = documentCanvas.scrollHeight;
    else return;
    event.preventDefault();
    refresh();
  }

  /**
   * Forward wheel input over the strip to the document.
   *
   * A custom scrollbar must retain native document wheel behavior while the pointer rests over its controls.
   * @param {WheelEvent} event - Wheel input received by the strip.
   * @returns {void} Applies the wheel delta to the real canvas.
   * @example
   * scrollStrip.addEventListener('wheel', handleWheel, { passive: false });
   */
  function handleWheel(event: WheelEvent): void {
    if(event.ctrlKey)return;
    if(handleHorizontalWheel(event))return;
    event.preventDefault();
    documentCanvas.scrollTop +=
      event.deltaY *
      (event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? documentCanvas.clientHeight
          : 1);
    refresh();
  }

  /**
   * Route real wheel movement through the accepted horizontal page-view preference.
   *
   * The source-independent setting applies to the canvas and its scroll strip.
   * Native line and page wheel units use the corresponding physical horizontal
   * distance. Control-wheel remains available to the host's existing zoom path.
   * @param {WheelEvent} event - Actual wheel event over the owned document workspace.
   * @returns {boolean} Whether horizontal page-view scrolling consumed the event.
   * @example
   * // Horizontal view with the wheel option enabled moves through actual paper columns.
   */
  function handleHorizontalWheel(event:WheelEvent):boolean{
    /** Current accepted view settings never become authored document or history data. */
    const paper=documentCanvas.querySelector<HTMLElement>('.paper'),view=paper&&readNativePageView(paper);
    if(event.ctrlKey||!view||view.direction!=='horizontal'||!view.horizontalWheel)return false;
    event.preventDefault();
    documentCanvas.scrollLeft+=(event.deltaX+event.deltaY)*(event.deltaMode===1?16:event.deltaMode===2?documentCanvas.clientWidth:1);
    refresh();return true;
  }

  /**
   * Apply the horizontal preference to the actual document canvas wheel path.
   *
   * Returning without cancellation retains ordinary vertical scrolling whenever
   * the accepted view disables the horizontal wheel preference.
   * @param {WheelEvent} event - Actual wheel event received by the document canvas.
   * @returns {void} Moves only the physical viewport when horizontal scrolling is enabled.
   * @example
   * // Changing back to vertical view restores normal canvas wheel handling.
   */
  function handleCanvasWheel(event:WheelEvent):void{handleHorizontalWheel(event);}

  /**
   * Confirm or dismiss the page picker from its keyboard controls.
   *
   * Enter invokes the same validated destination action as the Go button, while Escape closes the picker.
   * @param {KeyboardEvent} event - Key pressed within the independent page picker.
   * @returns {void} Handles picker keys without changing document content.
   * @example
   * scrollStrip.addEventListener('keydown', handlePickerKey);
   */
  function handlePickerKey(event: KeyboardEvent): void {
    /** Open page destination picker. */
    const picker = scrollStrip.querySelector<HTMLElement>(
      ".native-scroll-page-picker",
    );
    if (!picker || picker.hidden) return;
    if (event.key === "Escape") {
      picker.hidden = true;
      event.preventDefault();
    } else if (event.key === "Enter") {
      scrollStrip
        .querySelector<HTMLButtonElement>('[data-scroll-command="apply"]')
        ?.click();
      event.preventDefault();
    }
  }

  /** Layout observer detects zoom and viewport or document size changes. */
  const resize = new ResizeObserver(refresh);
  resize.observe(documentCanvas);
  /** Paper whose height changes when content or zoom changes. */
  const paper = root.querySelector<HTMLElement>(".paper");
  if (paper) resize.observe(paper);
  /** Content observer also catches style changes that alter overflow. */
  const changes = new MutationObserver(refresh);
  changes.observe(documentCanvas, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  documentCanvas.addEventListener("scroll", refresh, {
    signal: listeners.signal,
    passive: true,
  });
  scrollStrip.addEventListener("click", handleClick, {
    signal: listeners.signal,
  });
  scrollStrip.addEventListener("wheel", handleWheel, {
    signal: listeners.signal,
    passive: false,
  });
  documentCanvas.addEventListener('wheel',handleCanvasWheel,{
    signal:listeners.signal,
    passive:false,
  });
  scrollThumb.addEventListener("pointerdown", beginDrag, {
    signal: listeners.signal,
  });
  scrollThumb.addEventListener("pointermove", moveDrag, {
    signal: listeners.signal,
  });
  scrollThumb.addEventListener("pointerup", endDrag, {
    signal: listeners.signal,
  });
  scrollThumb.addEventListener("pointercancel", endDrag, {
    signal: listeners.signal,
  });
  scrollThumb.addEventListener("keydown", handleKey, {
    signal: listeners.signal,
  });
  scrollStrip.addEventListener("keydown", handlePickerKey, {
    signal: listeners.signal,
  });
  refresh();

  /**
   * Release scrollbar observers and event listeners.
   *
   * The binding can be discarded before replacing the application shell without retaining document nodes.
   * @returns {void} Disconnects observers and aborts owned listeners.
   * @example
   * binding.destroy();
   */
  function destroy(): void {
    resize.disconnect();
    changes.disconnect();
    listeners.abort();
  }
  return { refresh, destroy };
}
