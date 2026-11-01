import {
  NATIVE_LINE_LABELS,
  nativeLineSvg as nativeLineTile,
  decorationHtml,
} from "../character-decorations.ts";
import type { ChainedCommands } from "@tiptap/core";
import { applyNativeDecorations } from "../decoration-drawing.ts";
import { characterOutline, NATIVE_OUTLINE_TYPES, NATIVE_OUTLINE_LABELS, nativeOutlineSvg } from "../character-outline.ts";
import { characterEmphasis, NATIVE_EMPHASIS_LABELS, nativeEmphasisSvg } from "../character-emphasis.ts";

/**
 * Render the observed thirteen-row native graphic emphasis selector.
 *
 * Legacy unlisted source codes add one retained row without inventing a new
 * visual style. The standard rows follow observed native binary order.
 * @param {unknown} value - Current native emphasis code or absent NONE.
 * @returns {string} Accessible local selector and independent cancelable draft.
 * @throws {RangeError} If the current source code is invalid.
 * @example
 * renderEmphasisPattern(5); // Selects a left-side dot without changing source.
 */
export function renderEmphasisPattern(value:unknown):string {
  /** Values and labels are fixed local choices and never authored markup. */
  const code=characterEmphasis(value);
  let options='';
  for(let index=0;index<13;index++)options+=`<button type="button" role="option" id="native-emphasis-type-option-${index}" data-line-value="${index}" aria-selected="${index===code}" tabindex="-1" aria-label="${NATIVE_EMPHASIS_LABELS[index]}">${nativeEmphasisSvg(index,58)}</button>`;
  if(code>12)options+=`<button type="button" role="option" id="native-emphasis-type-option-${code}" data-line-value="${code}" aria-selected="true" tabindex="-1" aria-label="원본 호환 강조점">${nativeEmphasisSvg(code,58)}</button>`;
  return `<span class="nd-line-control nd-emphasis-control"><input type="hidden" name="emphasis-type" value="${code}"><button type="button" class="nd-expanded-pattern nd-line-select" role="combobox" aria-label="강조점" aria-haspopup="listbox" aria-expanded="false" aria-controls="native-emphasis-type-list"><span data-line-sample>${nativeEmphasisSvg(code)}</span><span aria-hidden="true">⌄</span></button><span id="native-emphasis-type-list" class="nd-line-list" role="listbox" aria-label="강조점" hidden>${options}</span></span>`;
}

/** Installed-native visual order differs from the numeric DOT/DASH storage order. */
const LINE_SELECTOR_ORDER = [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Render the observed seven-row native outline selector with original samples.
 *
 * Underline pattern codes are not reused: outlines have their own native order,
 * including a distinct thick contour and no-outline row.
 * @param {unknown} value - Current source outline code or absent NONE default.
 * @returns {string} Accessible measured graphic control and independent source draft.
 * @throws {RangeError} If the source code is unsupported.
 * @example
 * renderOutlinePattern(2); // Selects dotted glyph contours without editing source text.
 */
export function renderOutlinePattern(value:unknown):string {
  /** Values and labels derive only from the independently observed native code domain. */
  const code=characterOutline(value);
  let options="";
  for(let index=0;index<NATIVE_OUTLINE_TYPES.length;index++)options+=`<button type="button" role="option" id="native-outline-type-option-${index}" data-line-value="${index}" aria-selected="${index===code}" tabindex="-1" aria-label="${NATIVE_OUTLINE_LABELS[index]}">${nativeOutlineSvg(index,58)}</button>`;
  if(code===7)options+=`<button type="button" role="option" id="native-outline-type-option-7" data-line-value="7" aria-selected="true" tabindex="-1" aria-label="원본 호환 외곽선">${nativeOutlineSvg(7,58)}</button>`;
  return `<span class="nd-line-control nd-outline-control"><input type="hidden" name="outline-type" value="${code}"><button type="button" class="nd-expanded-pattern nd-line-select" role="combobox" aria-label="외곽선" aria-haspopup="listbox" aria-expanded="false" aria-controls="native-outline-type-list"><span data-line-sample>${nativeOutlineSvg(code)}</span><span aria-hidden="true">⌄</span></button><span id="native-outline-type-list" class="nd-line-list" role="listbox" aria-label="외곽선" hidden>${options}</span></span>`;
}

/** Native position labels keep persisted values independent of display text. */
const UNDERLINE_POSITION_LABELS: Readonly<Record<string, string>> = {
  NONE: "없음",
  BOTTOM: "아래쪽",
  TOP: "위쪽",
  CENTER: "가운데",
};

/**
 * Render the observed underline-position popup without a platform select window.
 *
 * The standard three rows retain the measured 91 by 88 pixel menu. Imported
 * legacy CENTER values add a fourth row only while that source value is present.
 * All values and labels come from fixed local choices rather than source markup.
 * @param {unknown} value - Original source underline position.
 * @param {boolean} active - Whether the selection currently contains underline.
 * @returns {string} Accessible position control and its independent hidden draft.
 * @example
 * renderUnderlinePosition('TOP', true); // Shows 위쪽 without applying a source edit.
 */
export function renderUnderlinePosition(
  value: unknown,
  active: boolean,
): string {
  /** Missing native positions follow the original default below the text. */
  const position = active
      ? value === "TOP" || value === "CENTER"
        ? value
        : "BOTTOM"
      : "NONE",
    order =
      position === "CENTER"
        ? ["NONE", "BOTTOM", "TOP", "CENTER"]
        : ["NONE", "BOTTOM", "TOP"];
  let options = "";
  for (/** The observed order is independent of the native file's numeric encoding. */ const item of order)
    options += `<button type="button" role="option" id="native-underline-position-option-${item}" data-line-value="${item}" aria-selected="${position === item}" tabindex="-1">${UNDERLINE_POSITION_LABELS[item]}</button>`;
  return `<span class="nd-line-control nd-position-control"><input type="hidden" name="underline-position" value="${position}"><button type="button" class="nd-line-select" role="combobox" aria-label="밑줄 위치" aria-controls="native-underline-position-list" aria-haspopup="listbox" aria-expanded="false"><span data-line-sample>${UNDERLINE_POSITION_LABELS[position]}</span><span aria-hidden="true">⌄</span></button><span id="native-underline-position-list" class="nd-line-list" role="listbox" aria-label="밑줄 위치" hidden>${options}</span></span>`;
}

/**
 * Repeat an original line tile across the measured native selector sample width.
 *
 * Patterns retain their actual tile period instead of stretching one dash or
 * wave across the whole control.
 * @param {number} pattern - Original native line-shape index.
 * @param {number} [width=66] - Actual closed-control or popup-row sample width.
 * @returns {string} Original sixty-six-pixel graphic sample.
 * @example
 * nativeLineSvg(11); // Repeated wave cycles rather than one stretched curve.
 */
function nativeLineSvg(pattern: number, width = 66): string {
  return nativeLineTile(pattern, "#333333", width);
}

/**
 * Render the original no-line sample without a native raster asset.
 *
 * The red diagonal remains distinct from the solid pattern index zero.
 * @returns {string} Independently drawn native none tile.
 * @example
 * noLineSvg(); // A red diagonal inside a thin rectangular outline.
 */
function noLineSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 66 14"><rect x=".5" y=".5" width="65" height="13" fill="white" stroke="#aaa"/><path d="M1 13L65 1" stroke="#ed1919"/></svg>';
}

/**
 * Render an editable native graphic line selector and detached form draft.
 *
 * Strikeout offers none plus eleven shapes; underline offers thirteen shapes.
 * Visible samples are original SVG geometry with accessible text descriptions.
 * @param {'underline-pattern'|'strike-pattern'} name - Fixed native form field name.
 * @param {number} value - Original native line index, or minus one for no strike.
 * @param {boolean} none - Whether the native selector offers a no-line row.
 * @returns {string} Accessible measured button, original samples and hidden draft.
 * @example
 * renderDecorationPattern('strike-pattern',-1,true); // No strike remains distinct from solid.
 */
export function renderDecorationPattern(
  name: "underline-pattern" | "strike-pattern",
  value: number,
  none: boolean,
): string {
  /** All identifiers derive from fixed local field names rather than imported source text. */
  const id = `native-${name}`,
    maximum = none ? 10 : 12,
    order: number[] = none
      ? [-1, ...LINE_SELECTOR_ORDER.slice(0, 11)]
      : [...LINE_SELECTOR_ORDER];
  if (value > maximum && !order.includes(value)) order.push(value);
  let options = "";
  for (/** Display order and original numeric values remain explicitly separate. */ const index of order)
    options += `<button type="button" role="option" id="${id}-option-${index}" data-line-value="${index}" aria-selected="${value === index}" tabindex="-1" aria-label="${index < 0 ? "선 없음" : NATIVE_LINE_LABELS[index]}">${index < 0 ? noLineSvg() : nativeLineSvg(index, 58)}</button>`;
  return `<span class="nd-line-control"><input type="hidden" name="${name}" value="${value}"><button type="button" class="nd-expanded-pattern nd-line-select" data-line-field="${name}" role="combobox" aria-label="${none ? "취소선 모양" : "밑줄 모양"}" aria-controls="${id}-list" aria-haspopup="listbox" aria-expanded="false"><span data-line-sample>${value < 0 ? noLineSvg() : nativeLineSvg(value)}</span><span aria-hidden="true">⌄</span></button><span id="${id}-list" class="nd-line-list" role="listbox" aria-label="${none ? "취소선 모양" : "밑줄 모양"}" hidden>${options}</span></span>`;
}

/**
 * Synchronize native line drafts, enabled states and original graphic selectors.
 *
 * All listeners belong to the owned modal. Panel switching never replaces
 * fields; cancellation discards drafts and no document transaction runs here.
 * @param {HTMLElement} form - Actual initialized native character form.
 * @returns {void} Binds local graphic selectors and Basic/Expanded draft synchronization.
 * @example
 * bindDecorationControls(form); // Selecting no underline disables its pattern and color.
 */
export function bindDecorationControls(form: HTMLElement): void {
  /** Existing local form controls retain separate underline and strike state. */
  const position = form.querySelector<HTMLInputElement>(
      '[name="underline-position"]',
    )!,
    underline = form.querySelector<HTMLInputElement>('[name="underline"]')!,
    strike = form.querySelector<HTMLInputElement>('[name="strike"]')!,
    strikePattern = form.querySelector<HTMLInputElement>(
      '[name="strike-pattern"]',
    )!,
    underlinePattern = form.querySelector<HTMLInputElement>(
      '[name="underline-pattern"]',
    )!,
    controls = Array.from(
      form.querySelectorAll<HTMLElement>(".nd-line-control"),
    );
  /**
   * Refresh samples and native enabled states from the same retained draft fields.
   *
   * Opening or closing a selector never changes character source preferences.
   * @returns {void} Updates only local samples and accessible control state.
   * @example
   * refresh(); // Disabled patterns cannot accept a hidden draft edit.
   */
  function refresh(): void {
    for (/** Existing graphic control and its backing native value are updated together. */ const control of controls) {
      /** Exact native values remain independent of accessible display labels. */
      const field = control.querySelector<HTMLInputElement>("input")!,
        button = control.querySelector<HTMLButtonElement>(".nd-line-select")!,
        disabled = field === underlinePattern && position.value === "NONE";
      button.disabled = disabled;
      /** Text positions and graphic shapes share navigation but retain distinct samples. */
      const sample = button.querySelector<HTMLElement>("[data-line-sample]")!;
      if (field.name === "outline-type") sample.innerHTML=nativeOutlineSvg(Number(field.value));
      else if (field.name === "emphasis-type") sample.innerHTML=nativeEmphasisSvg(Number(field.value));
      else if (field === position)
        sample.textContent = UNDERLINE_POSITION_LABELS[field.value];
      else
        sample.innerHTML =
          Number(field.value) < 0
            ? noLineSvg()
            : nativeLineSvg(Number(field.value));
      if (disabled) close(control);
      for (/** Accessible selection follows the persisted position or pattern identity. */ const option of control.querySelectorAll<HTMLElement>(
        "[data-line-value]",
      ))
        option.setAttribute(
          "aria-selected",
          String(option.dataset.lineValue === field.value),
        );
    }
    for (/** Each independent line color follows its own native enabled state. */ const [
      selector,
      disabled,
    ] of [
      [".nd-underline-color", position.value === "NONE"],
      [".nd-strike-color", Number(strikePattern.value) < 0],
    ] as const) {
      /** Existing palette controls remain reusable when the corresponding line is enabled. */
      const label = form.querySelector<HTMLElement>(selector)!;
      label.classList.toggle("nd-expanded-muted", disabled);
      /** Programmatic Basic draft resets keep the same real palette sample synchronized. */
      const button = label.querySelector<HTMLButtonElement>("button")!;
      button.disabled = disabled;
      button.style.setProperty(
        "--native-selected-color",
        label.querySelector<HTMLInputElement>("input")!.value,
      );
    }
    form
      .querySelector(".nd-underline-pattern")!
      .classList.toggle("nd-expanded-muted", position.value === "NONE");
  }
  /**
   * Close one owned graphic dropdown without dismissing the character dialog.
   *
   * Pending navigation stays local until an actual option is committed.
   * @param {HTMLElement} control - Original native selector container.
   * @returns {void} Clears popup visibility and active-descendant state.
   * @example
   * close(control); // Escape leaves the original draft line unchanged.
   */
  function close(control: HTMLElement): void {
    control.querySelector<HTMLElement>(".nd-line-list")!.hidden = true;
    /** Focus stays on the owning button while a graphic list is navigated. */
    const button = control.querySelector<HTMLElement>(".nd-line-select")!;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
  }
  /**
   * Commit one explicit native line selection through real form input events.
   *
   * The owning capture handler records only this field as edited; unrelated
   * mark attributes and mixed source runs remain untouched.
   * @param {HTMLElement} control - Actual source graphic selector.
   * @param {string} value - Chosen native position, shape or no-strike sentinel.
   * @returns {void} Updates local draft, closes its list and notifies form capture.
   * @example
   * commit(control,'7'); // One double-line draft edit, with no source transaction yet.
   */
  function commit(control: HTMLElement, value: string): void {
    /** Hidden native draft is the actual submitted form value. */
    const field = control.querySelector<HTMLInputElement>("input")!;
    field.value = value;
    close(control);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    control.querySelector<HTMLButtonElement>(".nd-line-select")!.focus();
  }
  for (/** Dropdown ownership never extends beyond this existing modal DOM. */ const control of controls) {
    /** Actual button, list and source options have independent accessible identities. */
    const button = control.querySelector<HTMLButtonElement>(".nd-line-select")!,
      list = control.querySelector<HTMLElement>(".nd-line-list")!,
      options = Array.from(
        list.querySelectorAll<HTMLButtonElement>("[data-line-value]"),
      );
    let active = 0;
    /**
     * Locate the selected native value in the independently observed display order.
     *
     * Numeric DOT/DASH indices and the optional no-line row cannot be used as
     * keyboard row offsets. A retained nonstandard source row is found by identity.
     * @returns {number} Actual currently selected popup-row index.
     * @example
     * selectedIndex(); // DOT follows DASH even though its stored value is smaller.
     */
    function selectedIndex(): number {
      /** Exact local draft identity is independent of the current navigation target. */
      const value = control.querySelector<HTMLInputElement>("input")!.value;
      for (/** Existing option order is the authoritative keyboard navigation order. */ const [
        index,
        option,
      ] of options.entries())
        if (option.dataset.lineValue === value) return index;
      return 0;
    }
    /**
     * Open and navigate an existing native graphic list without applying a line.
     *
     * Other owned selectors close before this popup becomes visible.
     * @param {number} index - Actual option index bounded to this list.
     * @returns {void} Updates visible keyboard focus without changing the draft.
     * @example
     * navigate(0); // A previewed row remains cancelable with Escape.
     */
    function navigate(index: number): void {
      for (/** At most one native line selector is open in the modal. */ const other of controls)
        if (other !== control) close(other);
      active = Math.max(0, Math.min(options.length - 1, index));
      list.hidden = false;
      button.setAttribute("aria-expanded", "true");
      button.setAttribute("aria-activedescendant", options[active].id);
      for (/** Active navigation remains separate from original selected-value state. */ const [
        index,
        option,
      ] of options.entries())
        option.classList.toggle("active", index === active);
    }
    button.addEventListener(
      "click",
      /**
       * Toggle this actual native graphic list.
       *
       * The currently selected source value is the initial navigation target.
       * @returns {void} Opens or closes this local dropdown.
       * @example
       * // A second button click cancels uncommitted keyboard navigation.
       */
      () => {
        if (!list.hidden) close(control);
        else navigate(selectedIndex());
      },
    );
    button.addEventListener(
      "keydown",
      /**
       * Navigate native line samples with arrows, Home/End, Enter and Escape.
       *
       * Escape closes only an open list, preserving the parent dialog; Tab closes
       * the list while retaining ordinary focus traversal.
       * @param {KeyboardEvent} event - Actual selector keyboard event.
       * @returns {void} Commits or cancels bounded local navigation.
       * @example
       * // ArrowDown then Enter commits one native pattern field.
       */
      (event) => {
        if (event.key === "Tab") {
          close(control);
          return;
        }
        if (event.key === "Escape" && !list.hidden) {
          event.preventDefault();
          event.stopPropagation();
          close(control);
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          navigate(
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? options.length - 1
                : list.hidden
                  ? selectedIndex()
                  : active + (event.key === "ArrowDown" ? 1 : -1),
          );
        } else if (
          (event.key === "Enter" || event.key === " ") &&
          !list.hidden
        ) {
          event.preventDefault();
          event.stopPropagation();
          commit(control, options[active].dataset.lineValue!);
        }
      },
    );
    for (/** Each actual option commits its own fixed native source identity. */ const option of options)
      option.addEventListener(
        "click",
        /**
         * Commit the explicitly clicked native line choice.
         *
         * Only the backing source draft changes; the document remains cancelable.
         * @returns {void} Commits one native shape and restores selector focus.
         * @example
         * // The no-line row disables strike color independently of underline.
         */
        () => commit(control, option.dataset.lineValue!),
      );
  }
  form.addEventListener(
    "input",
    /**
     * Keep Basic emphasis and Expanded position drafts synchronized.
     *
     * Programmatic synchronization emits no invented edit event for the other
     * fields, so untouched mixed colors and line patterns stay independent.
     * @param {Event} event - Actual local form edit.
     * @returns {void} Synchronizes draft controls before the owning capture handler.
     * @example
     * // Choosing TOP checks Basic underline without creating a second source edit.
     */
    (event) => {
      /** A real source field determines which corresponding local draft is synchronized. */
      const name =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
          ? event.target.name
          : "";
      if (name === "underline-position")
        underline.checked = position.value !== "NONE";
      if (name === "color") form.dataset.foregroundEdited = "true";
      if (name === "strike-pattern")
        strike.checked = Number(strikePattern.value) >= 0;
      if (name === "underline") {
        position.value = underline.checked ? "BOTTOM" : "NONE";
        if (underline.checked) {
          underlinePattern.value = "0";
          form.querySelector<HTMLInputElement>(
            '[name="underline-color"]',
          )!.value =
            form.dataset.foregroundEdited === "true"
              ? form.querySelector<HTMLInputElement>('[name="color"]')!.value ||
                "#000000"
              : form.dataset.underlineDefaultColor || "#000000";
        }
      }
      if (name === "strike") {
        strikePattern.value = strike.checked ? "0" : "-1";
        if (strike.checked)
          form.querySelector<HTMLInputElement>('[name="strike-color"]')!.value =
            "#000000";
      }
      refresh();
    },
  );
  form.closest<HTMLElement>(".native-dialog")!.addEventListener(
    "pointerdown",
    /**
     * Close graphic lists when focus moves elsewhere in the same owned modal.
     *
     * No global document listener survives dialog removal.
     * @param {PointerEvent} event - Actual modal pointer interaction.
     * @returns {void} Closes only lists outside the clicked graphic control.
     * @example
     * // Clicking the color palette first dismisses an open pattern list.
     */
    (event) => {
      for (/** Popup ownership is determined by the real target's local control. */ const control of controls)
        if (!(event.target instanceof Node) || !control.contains(event.target))
          close(control);
    },
  );
  refresh();
}

/**
 * Draw independently colored underline and strikeout around the existing preview text.
 *
 * Script-specific preview spans remain intact and independent of source state.
 * The caller restores the sample text before each preview update.
 * @param {HTMLElement} sample - Actual local character preview sample.
 * @param {HTMLFormElement} form - Current cancelable native form draft.
 * @returns {void} Wraps local sample children with semantic drawing marks only.
 * @example
 * renderDecorationPreview(sample,form); // A red overline can coexist with a blue strike.
 */
export function renderDecorationPreview(
  sample: HTMLElement,
  form: HTMLFormElement,
): void {
  for (/** Both native lines retain their own independent local draft color. */ const kind of [
    "underline",
    "strike",
  ] as const) {
    /** Actual retained local values determine whether a preview line is active. */
    const position = form.querySelector<HTMLInputElement>(
        '[name="underline-position"]',
      )!.value,
      pattern = Number(
        form.querySelector<HTMLInputElement>(`[name="${kind}-pattern"]`)!.value,
      ),
      color = form.querySelector<HTMLInputElement>(
        `[name="${kind}-color"]`,
      )!.value;
    if (kind === "underline" ? position === "NONE" : pattern < 0) continue;
    /** Semantic preview marks have no reference to the document's actual source nodes. */
    const wrapper = document.createElement(kind === "underline" ? "u" : "s"),
      attrs = decorationHtml(
        {
          nativePosition: position === "NONE" ? "BOTTOM" : position,
          nativePattern: pattern,
          nativeColor: color,
        },
        kind,
      );
    for (/** Preview wrappers retain exact native ownership for the shared drawing helper. */ const [
      key,
      value,
    ] of Object.entries(attrs))
      wrapper.setAttribute(key, value);
    wrapper.append(...sample.childNodes);
    sample.appendChild(wrapper);
  }
  applyNativeDecorations(sample);
}

/**
 * Add only explicitly edited native line properties to one character transaction.
 *
 * Basic toggles use original native defaults. Expanded edits preserve untouched
 * per-run colors and shapes, including selections with mixed character marks.
 * @param {ChainedCommands} chain - Actual owning editor command chain.
 * @param {Record<string,unknown>} values - Current cancelable form values.
 * @param {Set<string>} changed - Real fields explicitly edited in this dialog.
 * @param {'underline'|'strike'} kind - Independent native source line.
 * @param {boolean} active - Whether the original selection already contains this mark.
 * @returns {boolean} Whether this line added a real source command.
 * @example
 * applyDecorationDraft(chain,values,changed,'underline',true); // A color-only edit retains each original position.
 */
export function applyDecorationDraft(
  chain: ChainedCommands,
  values: Record<string, unknown>,
  changed: Set<string>,
  kind: "underline" | "strike",
  active: boolean,
): boolean {
  if (changed.has(kind)) {
    if (values[kind])
      chain.setMark(kind, {
        nativePosition:
          kind === "underline"
            ? values["underline-position"] || "BOTTOM"
            : "BOTTOM",
        nativePattern: Math.max(0, Number(values[`${kind}-pattern`])),
        nativeColor:
          values[`${kind}-color`] ||
          (kind === "underline" ? values.color || "#000000" : "#000000"),
        ...(kind === "strike" ? { nativeStrikeType: 1 } : {}),
      });
    else chain.unsetMark(kind);
    return true;
  }
  /** Expanded edits are independent fields rather than a complete representative style replacement. */
  const patternName = `${kind}-pattern`,
    colorName = `${kind}-color`,
    positionName = "underline-position",
    patternChanged = changed.has(patternName),
    colorChanged = changed.has(colorName),
    positionChanged = kind === "underline" && changed.has(positionName);
  if (!patternChanged && !colorChanged && !positionChanged) return false;
  if (
    kind === "underline"
      ? values[positionName] === "NONE"
      : Number(values[patternName]) < 0
  ) {
    chain.unsetMark(kind);
    return true;
  }
  /** Untouched native properties remain on their original selected runs. */
  const attrs: Record<string, unknown> = {};
  if (positionChanged) attrs.nativePosition = values[positionName];
  if (patternChanged) {
    attrs.nativePattern = Number(values[patternName]);
    if (kind === "strike") attrs.nativeStrikeType = 1;
  }
  if (colorChanged || !active) attrs.nativeColor = values[colorName];
  chain.setMark(kind, attrs);
  return true;
}
