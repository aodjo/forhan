import { fixedLineSpacingMaximum } from '../line-spacing.ts';
import { displayParagraphPoints } from './paragraph-numbers.ts';
import type { PageSettings } from '../types.ts';

/** Largest positive interval representable by both native document formats. */
const MAX_GRID = 32767;

/**
 * Bind reversible page-grid drafts to the measured native settings controls.
 *
 * Exact native hundredths remain independent from rounded point labels. Changes
 * affect only the caller's modal draft; cancelling never edits the document.
 * Character-grid and manuscript controls preserve imported source read-only
 * until their independent horizontal layout is implemented.
 * @param {HTMLFormElement} form - Actual owned native paper settings form.
 * @param {PageSettings} draft - Independent pending page configuration.
 * @returns {void} Installs local accessible tabs and precise line-grid entry.
 * @example
 * bindPageGrid(form,draft); // Entering twenty rows retains 3288 native units.
 */
export function bindPageGrid(form: HTMLFormElement, draft: PageSettings): void {
  /** All controls belong exclusively to this pending modal instance. */
  const modal = form.closest<HTMLElement>('.native-dialog')!,
    tabs = Array.from(modal.querySelectorAll<HTMLButtonElement>('[data-page-tab]')),
    spacing = form.elements.namedItem('grid-spacing') as HTMLInputElement,
    count = form.elements.namedItem('grid-count') as HTMLInputElement,
    modes = Array.from(form.querySelectorAll<HTMLInputElement>('[name="grid-mode"]'));
  /** Unedited display precision never replaces exact imported native source. */
  let interval = draft.lineGrid || 1600;

  /**
   * Select an accessible paper panel without rebuilding pending controls.
   *
   * Hidden basic dimensions retain their original values and validation state.
   * @param {string} name - Requested basic or line-grid panel.
   * @returns {void} Updates actual tab selection and owned panel visibility.
   * @example
   * select('grid'); // Draft page dimensions remain unchanged.
   */
  function select(name: string): void {
    for (/** One local panel is exposed without removing its draft fields. */ const panel of form.querySelectorAll<HTMLElement>('[data-page-panel]'))
      panel.hidden = panel.dataset.pagePanel !== name;
    for (/** Native tab accessibility follows the visible owned panel. */ const tab of tabs) {
      /** The selected tab alone participates in sequential keyboard navigation. */
      const selected = tab.dataset.pageTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  }

  /**
   * Read actual pending body geometry in native units for the row calculation.
   *
   * Physical dimensions can change on the other tab without committing the page.
   * @returns {number} Rounded native body height consistent with fixed spacing.
   * @example
   * bodyUnits(); // 65762 for the default portrait A4 page.
   */
  function bodyUnits(): number {
    /** Pending physical controls remain independent from accepted application state. */
    const page = { ...draft };
    for (/** Native body geometry uses each independently entered physical edge. */ const key of ['width','height','marginTop','marginBottom','marginLeft','marginRight','header','footer'] as const)
      page[key] = Number((form.elements.namedItem(key) as HTMLInputElement).value);
    return Math.round(fixedLineSpacingMaximum(page) * 100);
  }

  /**
   * Display pending exact source without converting it to rounded labels.
   *
   * Native point arrows and row arrows share the same raw native interval.
   * @param {HTMLInputElement} [editing] - Actual entry whose in-progress text must remain untouched.
   * @returns {void} Synchronizes count, point label and mode-dependent availability.
   * @example
   * refresh(); // 3288 displays as 32.9pt with twenty rows.
   */
  function refresh(editing?: HTMLInputElement): void {
    /** Vertical editing is available only for an active native line-grid mode. */
    const enabled = modes.some(
      /**
       * Identify an active vertical grid without changing retained horizontal source.
       *
       * Imported combined mode still permits its independent vertical interval.
       * @param {HTMLInputElement} mode - Actual owned mode control.
       * @returns {boolean} Whether this selected mode has vertical spacing.
       * @example
       * // The native no-grid mode disables vertical numeric controls.
       */
      mode => mode.checked && mode.value !== 'none',
    );
    if(editing!==spacing) spacing.value = displayParagraphPoints(interval / 100);
    if(editing!==count) count.value = String(Math.floor(bodyUnits() / interval));
    for (/** Source interval and count controls share native mode availability. */ const input of [spacing,count]) input.disabled = !enabled;
    for (/** Actual arrows must not accept edits while their input is unavailable. */ const button of form.querySelectorAll<HTMLButtonElement>('[data-page-grid-step]')) button.disabled = !enabled;
  }

  /**
   * Accept a representable pending interval without truncating native storage.
   *
   * Wider imported XML remains untouched until edited; new invalid entries keep
   * their visible draft and cannot bypass actual form validation.
   * @param {number} value - Requested exact native interval.
   * @param {HTMLInputElement} input - Actual control receiving validation feedback.
   * @param {boolean} [editing=false] - Whether to retain the actual entry while typing.
   * @returns {void} Updates only valid pending source and dependent labels.
   * @example
   * accept(3288,count); // Keeps the source finer than the native visible label.
   */
  function accept(value: number, input: HTMLInputElement, editing=false): void {
    input.setCustomValidity(Number.isInteger(value) && value > 0 && value <= MAX_GRID ? '' : '줄 간격은 0.01pt에서 327.67pt 사이로 입력하세요.');
    if (!input.checkValidity()) return;
    interval = value;
    draft.lineGrid = interval;
    spacing.setCustomValidity(''); count.setCustomValidity('');
    refresh(editing?input:undefined);
  }

  for (/** Each native tab owns its accessible click and keyboard navigation. */ const tab of tabs) {
    tab.addEventListener('click',
      /**
       * Show the requested pending paper panel without applying source.
       *
       * Focus remains on the actual native tab that was activated.
       * @returns {void} Changes local panel visibility only.
       * @example
       * // Clicking Basic retains a pending precise grid entry.
       */
      () => select(tab.dataset.pageTab!));
    tab.addEventListener('keydown',
      /**
       * Navigate owned native paper tabs with standard tab-list keys.
       *
       * Editor shortcuts do not run while focus belongs to this modal.
       * @param {KeyboardEvent} event - Actual tab-list key input.
       * @returns {void} Handles arrow, Home and End navigation only.
       * @example
       * // ArrowRight exposes the line-grid draft and focuses its tab.
       */
      event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        /** This two-panel native dialog cycles only through its owned enabled tabs. */
        const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length-1] : tabs[(tabs.indexOf(tab)+1)%tabs.length];
        select(next.dataset.pageTab!); next.focus();
      });
  }
  for (/** Mode changes remain explicit pending source edits. */ const mode of modes) mode.addEventListener('change',
    /**
     * Enable or disable vertical grid source in the pending page draft.
     *
     * Imported horizontal and manuscript settings remain independently retained.
     * @returns {void} Changes draft vertical source and its visible availability.
     * @example
     * // Selecting no grid stores zero without modifying paragraph preferences.
     */
    () => { draft.lineGrid = mode.value === 'none' ? 0 : interval; if(mode.value!=='both')draft.charGrid=0; refresh(); });
  form.addEventListener('input',
    /**
     * Convert an explicitly edited row count or point entry to exact native units.
     *
     * Physical edits refresh only the dependent count, never the original interval.
     * @param {Event} event - Actual pending form input.
     * @returns {void} Validates source changes and updates dependent controls.
     * @example
     * // Twenty rows produces floor(65762/20), independent from the displayed 32.9.
     */
    event => {
      if (event.target === spacing) accept(Math.round(Number(spacing.value)*100),spacing,true);
      else if (event.target === count) accept(Number.isInteger(Number(count.value)) && Number(count.value)>0 ? Math.floor(bodyUnits()/Number(count.value)) : NaN,count,true);
      else if ((event.target as HTMLElement).id.startsWith('page-')) refresh();
    });
  form.addEventListener('click',
    /**
     * Apply an actual native arrow step using integer points or row counts.
     *
     * Button steps share exact interval validation with direct numeric entry.
     * @param {MouseEvent} event - Actual pending form click.
     * @returns {void} Handles only owned enabled grid step buttons.
     * @example
     * // The native spacing up arrow changes 16.0pt to 17.0pt.
     */
    event => {
      /** Only owned native grid arrows participate in this local edit. */
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-page-grid-step]');
      if (!button || button.disabled) return;
      /** Count and point steps use independent native units. */
      const direction = Number(button.dataset.pageGridStep),
        input = button.closest('.nd-number')!.querySelector('input')!;
      if (input === spacing) accept((direction>0 ? Math.floor(interval/100)+1 : Math.ceil(interval/100)-1)*100,spacing);
      else accept(Math.floor(bodyUnits()/(Number(count.value)+direction)),count);
    });
  form.addEventListener('keydown',
    /**
     * Apply native whole-point or whole-row keyboard steps to grid inputs.
     *
     * Browser fractional number stepping cannot replace the measured native units.
     * @param {KeyboardEvent} event - Actual pending native numeric key input.
     * @returns {void} Handles only up/down keys on enabled grid inputs.
     * @example
     * // ArrowUp changes the visible native spacing from 16.0pt to 17.0pt.
     */
    event => {
      if (!['ArrowUp','ArrowDown'].includes(event.key) || ![spacing,count].includes(event.target as HTMLInputElement)) return;
      event.preventDefault();
      /** The pending source interval retains precision until this explicit key step. */
      const direction=event.key==='ArrowUp'?1:-1;
      if(event.target===spacing) accept((direction>0?Math.floor(interval/100)+1:Math.ceil(interval/100)-1)*100,spacing);
      else accept(Math.floor(bodyUnits()/(Number(count.value)+direction)),count);
    });
  form.addEventListener('focusout',
    /**
     * Normalize a completed valid numeric entry to the measured native point label.
     *
     * Source precision remains exact while partial typing is never rewritten.
     * @param {FocusEvent} event - Actual pending numeric focus departure.
     * @returns {void} Formats only completed valid grid entries.
     * @example
     * // Typing 32.88 remains possible; leaving the field displays 32.9pt.
     */
    event=>{if([spacing,count].includes(event.target as HTMLInputElement)&&(event.target as HTMLInputElement).validity.valid)refresh();});
  form.addEventListener('invalid',
    /**
     * Reveal an invalid hidden pending control before browser validation focuses it.
     *
     * Applying from the other tab cannot bypass an invalid physical or grid entry.
     * @param {Event} event - Actual form validation failure.
     * @returns {void} Exposes the invalid input's original owning panel.
     * @example
     * // Invalid spacing remains visible until corrected or cancelled.
     */
    event => select((event.target as HTMLElement).closest<HTMLElement>('[data-page-panel]')!.dataset.pagePanel!),true);
  refresh();
}
