/** Persistent display fitting remains separate from authored document settings. */
export type NativeFitMode = "width" | "page";

/** Public view operations own no document transactions or undo history. */
export interface NativeFitBinding {
  /**
   * Select a persistent physical page fitting mode.
   *
   * The selected mode survives viewport changes until a manual zoom cancels it.
   * @param {NativeFitMode} mode - Requested native view fitting operation.
   * @returns {void} Applies the current viewport fit immediately.
   * @example
   * binding.select("width");
   */
  select(mode: NativeFitMode): void;
  /**
   * Cancel automatic fitting before a manual zoom operation.
   *
   * Pending observations cannot restore the previous fitting mode.
   * @returns {void} Retains the last display scale as a manual view.
   * @example
   * binding.cancel();
   */
  cancel(): void;
  /**
   * Read the current persistent display mode.
   *
   * A null result identifies a manually selected zoom percentage.
   * @returns {NativeFitMode | null} Current fitting mode or manual view state.
   * @example
   * binding.mode(); // "width"
   */
  mode(): NativeFitMode | null;
  /**
   * Schedule fitting after physical page or shell geometry changes.
   *
   * Multiple changes share one animation frame and equal results do not reapply styles.
   * @returns {void} Schedules one dependent display update when fitting is active.
   * @example
   * binding.refresh();
   */
  refresh(): void;
  /**
   * Release observers and pending view work.
   *
   * Teardown prevents detached canvases from applying another fitting result.
   * @returns {void} Releases resources owned by the view binding.
   * @example
   * binding.destroy();
   */
  destroy(): void;
}

/** View dependencies expose physical dimensions without changing source content. */
export interface NativeFitOptions {
  canvas: HTMLElement;
  /**
   * Read the currently authored physical paper dimensions.
   *
   * Orientation and document imports are observed through the same live source.
   * @returns {{width:number;height:number}} Paper dimensions in millimetres.
   * @example
   * options.paper(); // { width: 210, height: 297 }
   */
  paper(): { width: number; height: number };
  /**
   * Read the explicitly requested fit-page group dimensions.
   *
   * Automatic arrangement fits one page before deriving its actual columns.
   * @returns {{columns:number;rows:number}} Requested fit group or the default single page.
   * @example
   * options.grid?.(); // A two-by-two group fits both complete physical rows.
   */
  grid?():{columns:number;rows:number};
  /**
   * Apply one derived display percentage and its persistent mode.
   *
   * This callback updates view controls without creating a document transaction.
   * @param {number} zoom - Clamped integer display percentage.
   * @param {NativeFitMode} mode - Selected persistent fitting mode.
   * @returns {void} Updates the live display only.
   * @example
   * options.apply(168, "width");
   */
  apply(zoom: number, mode: NativeFitMode): void;
}

/**
 * Maintain physical paper fitting through viewport and document geometry changes.
 *
 * Original native observations establish width and page fit percentages for
 * portrait, short and landscape paper. Canvas resize observations also cover
 * shell changes without a window resize. A manual operation cancels the mode.
 * @param {NativeFitOptions} options - Live canvas, physical paper and display update dependencies.
 * @returns {NativeFitBinding} Owned persistent view operations and explicit teardown.
 * @example
 * const binding = bindNativeFit({ canvas, paper: readPaper, apply: updateZoom });
 */
export function bindNativeFit(options: NativeFitOptions): NativeFitBinding {
  /** One owned canvas observer coalesces view changes without source transactions. */
  let selected: NativeFitMode | null = null, frame = 0, last = "", disposed = false;

  /**
   * Measure the current canvas and apply a changed fit percentage.
   *
   * Fixed ruler space and scaled paper framing retain the observed native view
   * geometry. Hidden or invalid canvases wait for a later layout observation.
   * @returns {void} Applies at most one changed fitting result.
   * @example
   * measure(); // A4 portrait at the reference viewport selects 168 percent width fit.
   */
  function measure(): void {
    frame = 0;
    if (disposed || !selected) return;
    /** Physical page and available canvas dimensions remain independent from prior zoom. */
    const paper = options.paper(), width = options.canvas.clientWidth, height = options.canvas.clientHeight,grid=options.grid?.()??{columns:1,rows:1};
    if (width <= 0 || height <= 29 || !(paper.width > 0) || !(paper.height > 0)) return;
    /** Native framing uses the available canvas width and the ruler's full fixed band. */
    const across = width / (paper.width * 96 / 25.4 * grid.columns + 16*(grid.columns-1) + 32),
      down = (height - 29) / (paper.height * 96 / 25.4 * grid.rows + 16*(grid.rows-1) + 28),
      zoom = Math.max(10, Math.min(500, Math.floor(100 * Math.min(across, selected === "page" ? down : Infinity)))),
      key = selected + ":" + zoom;
    if (key === last) return;
    last = key;
    options.apply(zoom, selected);
  }

  /**
   * Coalesce dependent viewport observations into one display update.
   *
   * Manual and destroyed bindings leave pending work inert.
   * @returns {void} Schedules at most one animation frame.
   * @example
   * refresh();
   */
  function refresh(): void {
    if (!disposed && selected && !frame) frame = requestAnimationFrame(measure);
  }
  /** Actual canvas changes include ribbon, panels and scrollbar viewport updates. */
  const observer = new ResizeObserver(refresh);
  observer.observe(options.canvas);
  return {
    /**
     * Activate and immediately measure the requested fit mode.
     *
     * A changed mode updates its label even when both modes select the same percentage.
     * @param {NativeFitMode} mode - Requested persistent view operation.
     * @returns {void} Applies the current fitting result.
     * @example
     * binding.select("page");
     */
    select(mode: NativeFitMode): void { if (disposed) return; cancelAnimationFrame(frame); frame = 0; selected = mode; last = ""; measure(); },
    /**
     * Return the view to manually controlled zoom.
     *
     * Pending callbacks observe the cleared mode before applying another scale.
     * @returns {void} Cancels persistent fitting.
     * @example
     * binding.cancel();
     */
    cancel(): void { selected = null; last = ""; },
    /**
     * Read the selected fitting mode.
     *
     * The mode belongs to the editor view and is not serialized with the document.
     * @returns {NativeFitMode | null} Active fit mode or null for manual zoom.
     * @example
     * binding.mode();
     */
    mode(): NativeFitMode | null { return selected; },
    refresh,
    /**
     * Disconnect the canvas observer and cancel owned animation work.
     *
     * A destroyed binding cannot resume fitting through a stale public reference.
     * @returns {void} Releases owned view resources.
     * @example
     * binding.destroy();
     */
    destroy(): void { disposed = true; selected = null; observer.disconnect(); cancelAnimationFrame(frame); frame = 0; },
  };
}
