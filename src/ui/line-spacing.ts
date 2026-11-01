import {
  lineSpacingState,
  parseLineSpacingInput,
  stepLineSpacing,
  PERCENT_LINE_PRESETS,
  FIXED_LINE_PRESETS,
  type LineSpacingState,
} from "../line-spacing.ts";

/** Document operations stay outside the popup/input controller. */
export interface LineSpacingActions {
  /**
   * Apply one validated paragraph spacing transaction to the saved editor selection.
   *
   * The editor owns history and native document serialization.
   * @param {string} value - Validated proportional or point line-height value.
   * @returns {void} Applies the requested line spacing.
   * @example
   * actions.apply('1.75');
   */
  apply(value: string): void;
  /**
   * Restore focus without changing the current document selection.
   *
   * Keyboard commitment and cancellation share the editor's ordinary focus path.
   * @returns {void} Focuses the document editor.
   * @example
   * actions.focus();
   */
  focus(): void;
}

/** Editable native quick spacing, independent percent/point presets and keyboard-safe drafts. */
export class NativeLineSpacing {
  private state: LineSpacingState = lineSpacingState("1.6");
  private dirty = false;
  private active = -1;
  private applying = false;
  private readonly input: HTMLInputElement;
  private readonly toggle: HTMLButtonElement;
  private readonly popup: HTMLDivElement;

  /**
   * Bind the persistent native quick control once.
   *
   * Delegated popup events retain selection and never submit a parent form.
   * The list is positioned outside the clipped toolbar and closes on layout
   * changes, outside interaction, cancellation and document-state replacement.
   * @param {HTMLElement} control - Persistent quick-control wrapper.
   * @param {LineSpacingActions} actions - Editor-owned mutation and focus operations.
   * @returns {NativeLineSpacing} Initialized field and popup controller.
   * @throws {Error} If required application control markup is missing.
   * @example
   * new NativeLineSpacing(control,actions);
   */
  constructor(
    private readonly control: HTMLElement,
    private readonly actions: LineSpacingActions,
  ) {
    this.input = control.querySelector<HTMLInputElement>("#line-height")!;
    this.toggle = control.querySelector<HTMLButtonElement>(
      "[data-line-spacing-toggle]",
    )!;
    this.popup = document.querySelector<HTMLDivElement>(
      "#native-line-spacing-list",
    )!;
    if (!this.input || !this.toggle || !this.popup)
      throw new Error("Native line-spacing controls are missing.");
    control.addEventListener("input", this.handleInput.bind(this));
    control.addEventListener("keydown", this.handleKey.bind(this));
    control.addEventListener("click", this.handleClick.bind(this));
    control.addEventListener("focusout", this.handleBlur.bind(this));
    document.addEventListener("keydown", this.handleShortcut.bind(this));
    this.popup.addEventListener("click", this.handleClick.bind(this));
    this.popup.addEventListener("pointermove", this.handleHover.bind(this));
    document.addEventListener(
      "pointerdown",
      this.handlePointer.bind(this),
      true,
    );
    window.addEventListener("resize", this.close.bind(this));
    document.addEventListener("scroll", this.close.bind(this), true);
    this.synchronize("1.6");
  }

  /**
   * Reflect the live editor source without rewriting an active numeric draft.
   *
   * A changed source invalidates old popup choices and drafts. Untouched fixed
   * values retain exact precision even when their idle display is rounded.
   * @param {string} source - Actual selected paragraph line-height attribute.
   * @param {number} [fixedMaximum=Infinity] - Current physical body-height bound.
   * @returns {void} Updates visible state without editing the document.
   * @example
   * controller.synchronize('18.25pt'); // Keeps the exact source behind 18.3.
   */
  synchronize(source: string, fixedMaximum = Infinity): void {
    if (this.applying) return;
    if (source === this.state.source && document.activeElement === this.input) {
      this.state = lineSpacingState(source, fixedMaximum);
      return;
    }
    if (source !== this.state.source) this.close();
    this.state = lineSpacingState(source, fixedMaximum);
    this.reset();
  }

  /**
   * Discard numeric drafts and menu choices before replacing the active document.
   *
   * Identical line-height attributes in two documents do not make an old draft
   * belong to the new document. Cancellation changes no editor content or focus.
   * @returns {void} Clears only transient quick-field state.
   * @example
   * controller.cancelDraft(); // A pending 175% cannot leak into another file.
   */
  cancelDraft(): void {
    this.close();
    this.reset();
  }

  /**
   * Restore the visible committed source and clear draft-only validation.
   *
   * Resetting this control has no editor or history side effects.
   * @returns {void} Restores numeric display, unit and input metadata.
   * @example
   * controller.reset(); // Discards an invalid draft after Escape.
   */
  private reset(): void {
    this.dirty = false;
    this.input.value = this.state.display;
    this.input.setCustomValidity("");
    this.input.dataset.mode = this.state.mode;
    this.control.querySelector<HTMLElement>(".native-unit")!.textContent =
      this.state.unit;
    this.input.setAttribute(
      "aria-label",
      this.state.unit ? `줄 간격 (${this.state.unit})` : "줄 간격",
    );
    for (/** Numeric arrows cannot invent a conversion for retained source syntax. */ const button of this.control.querySelectorAll<HTMLButtonElement>(
      "[data-line-spacing-step]",
    ))
      button.disabled = this.state.mode === "retained";
  }

  /**
   * Apply one validated value and atomically synchronize the field state.
   *
   * Main-process/editor selection events and blur cannot reenter commitment.
   * An unchanged original source creates no formatting transaction.
   * @param {string} value - Validated next line-height attribute.
   * @param {boolean} focus - Whether commitment should return to the document.
   * @returns {void} Applies and reflects exactly one requested change.
   * @example
   * controller.apply('1.75',true);
   */
  private apply(value: string, focus: boolean): void {
    this.applying = true;
    try {
      /** Equality uses the precise source rather than its rounded idle display. */
      const changed = value !== this.state.source;
      this.state = lineSpacingState(value, this.state.maximum);
      this.close();
      this.reset();
      if (changed) this.actions.apply(value);
      if (focus) this.actions.focus();
    } finally {
      this.applying = false;
    }
  }

  /**
   * Commit a typed draft or move it through the native spinner rules.
   *
   * Invalid input remains a visible draft with no document/history mutation.
   * Untouched source precision survives ordinary Enter, Tab and blur.
   * @param {boolean} focus - Whether to return focus after commitment.
   * @param {1|-1} [direction] - Optional explicit native increment/decrement.
   * @returns {boolean} Whether the requested commitment succeeded.
   * @example
   * controller.commit(true,1); // A proportional 163 becomes 168.
   */
  private commit(focus: boolean, direction?: 1 | -1): boolean {
    if (this.applying) return true;
    try {
      /** Dirty numeric text is interpreted in the current mode before stepping. */
      const parsed = parseLineSpacingInput(
        this.input.value,
        this.state,
        this.dirty,
      );
      this.apply(
        direction
          ? stepLineSpacing(
              lineSpacingState(parsed, this.state.maximum),
              direction,
            )
          : parsed,
        focus,
      );
      return true;
    } catch (error) {
      this.input.setCustomValidity(
        error instanceof Error ? error.message : "줄 간격을 확인하세요.",
      );
      this.input.reportValidity();
      return false;
    }
  }

  /**
   * Close the owned preset popup without changing the selected document value.
   *
   * Layout and outside-pointer handlers use this same cancellation path.
   * @returns {void} Removes expanded/active-option accessibility state.
   * @example
   * controller.close();
   */
  private close(): void {
    this.popup.hidden = true;
    this.toggle.setAttribute("aria-expanded", "false");
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.active = -1;
  }

  /**
   * Open the native mode's actual preset choices beside the quick field.
   *
   * Percent and fixed lists retain their measured 26-pixel row height. Opening
   * a menu never applies its initial highlighted value or changes an old draft.
   * @returns {void} Displays the current mode's preset choices.
   * @example
   * controller.open(); // Includes 300% for proportional spacing.
   */
  private open(): void {
    /** Retained modes can be explicitly replaced with a chosen percent preset. */
    const fixed = this.state.mode === "fixed";
    /** Both modes share numeric navigation while retaining their observed independent presets. */
    const values: readonly number[] = fixed
      ? FIXED_LINE_PRESETS
      : PERCENT_LINE_PRESETS;
    this.popup.replaceChildren();
    for (/** Each actual native preset is a literal text option, never injected markup. */ const value of values) {
      /** Accessible choices stay outside the clipped toolbar. */
      const option = document.createElement("button");
      option.type = "button";
      option.tabIndex = -1;
      option.id = `native-line-spacing-option-${this.popup.children.length}`;
      option.setAttribute("role", "option");
      option.dataset.lineSpacingValue = fixed
        ? `${value}pt`
        : String(value / 100);
      option.textContent = `${value}${fixed ? "pt" : "%"}`;
      option.setAttribute("aria-selected", String(value === this.state.value));
      this.popup.append(option);
    }
    /** Popup coordinates are constrained to the actual current application viewport. */
    const bounds = this.control.getBoundingClientRect();
    this.popup.style.width = bounds.width + "px";
    this.popup.style.left =
      Math.max(0, Math.min(bounds.left+1, window.innerWidth - bounds.width)) +
      "px";
    this.popup.hidden = false;
    this.popup.style.top =
      Math.max(
        0,
        Math.min(
          bounds.bottom,
          window.innerHeight - this.popup.offsetHeight,
        ),
      ) + "px";
    this.toggle.setAttribute("aria-expanded", "true");
    this.input.setAttribute("aria-expanded", "true");
    this.active = values.indexOf(this.state.value ?? NaN);
    this.highlight();
    this.input.focus();
  }

  /**
   * Reflect keyboard or pointer navigation without applying a preset.
   *
   * The active descendant is independent of the document's selected option.
   * @returns {void} Updates the visible active row and accessible focus target.
   * @example
   * controller.highlight(); // Arrow navigation alone does not edit a paragraph.
   */
  private highlight(): void {
    for (/** Preset rows expose independent navigation and document selection state. */ const [
      index,
      option,
    ] of Array.from(this.popup.children).entries()) {
      option.classList.toggle("active", index === this.active);
      if (index === this.active)
        this.input.setAttribute("aria-activedescendant", option.id);
    }
    if (this.active < 0) this.input.removeAttribute("aria-activedescendant");
  }

  /**
   * Mark genuine text input without applying partial or composing text.
   *
   * Input events clear prior validation while Enter/change/blur decide when a
   * complete numeric draft becomes an editor transaction.
   * @param {Event} event - Input event from the persistent numeric field.
   * @returns {void} Retains a draft without modifying document formatting.
   * @example
   * // Typing 175 does not create three paragraph undo steps.
   */
  private handleInput(event: Event): void {
    if (event.target !== this.input) return;
    this.dirty = true;
    this.input.setCustomValidity("");
  }

  /**
   * Dispatch explicit preset, popup and spinner clicks.
   *
   * An explicit preset replaces an invalid draft. Spinners validate numeric
   * drafts before applying their native step, and never submit a form.
   * @param {MouseEvent} event - Click inside the owned control or popup.
   * @returns {void} Performs only the requested control action.
   * @example
   * // Clicking the up arrow changes 160% to 165%.
   */
  private handleClick(event: MouseEvent): void {
    /** Only buttons within this controller's own markup may dispatch actions. */
    const target = (event.target as Element).closest<HTMLButtonElement>(
      "button",
    );
    if (!target) return;
    if (target.dataset.lineSpacingValue) {
      this.apply(target.dataset.lineSpacingValue, true);
      return;
    }
    if (target === this.toggle) {
      if (this.popup.hidden) this.open();
      else this.close();
      return;
    }
    if (target.dataset.lineSpacingStep)
      this.commit(true, target.dataset.lineSpacingStep === "up" ? 1 : -1);
  }

  /**
   * Keep document selection stable during popup/button pointer interaction.
   *
   * Outside interaction dismisses the popup; the ordinary focusout path commits
   * a complete valid draft before another editor location gains focus.
   * @param {PointerEvent} event - Captured application pointer event.
   * @returns {void} Retains focus for owned buttons and closes outside popups.
   * @example
   * // A preset click formats the previously selected paragraphs.
   */
  private handlePointer(event: PointerEvent): void {
    /** Pointer ownership is determined from actual connected application elements. */
    const target = event.target as Node;
    if (this.popup.contains(target) || this.control.contains(target)) {
      if ((event.target as Element).closest("button")) event.preventDefault();
    } else this.close();
  }

  /**
   * Move the active preset row under the actual pointer.
   *
   * Hover remains a menu-navigation operation with no editor side effects.
   * @param {PointerEvent} event - Pointer move inside the visible preset list.
   * @returns {void} Reflects the hovered row without applying it.
   * @example
   * // Moving over 300% does not apply it until clicked.
   */
  private handleHover(event: PointerEvent): void {
    /** The pointer must refer to a real owned option. */
    const option = (event.target as Element).closest<HTMLButtonElement>(
      '[role="option"]',
    );
    if (!option) return;
    this.active = Array.from(this.popup.children).indexOf(option);
    this.highlight();
  }

  /**
   * Commit valid numeric drafts when focus leaves the whole quick control.
   *
   * Popup focus/button handling and in-progress editor transactions cannot
   * generate duplicate commits or rewrite a rounded untouched physical value.
   * @param {FocusEvent} event - Focus transition from an owned control element.
   * @returns {void} Applies a complete draft if focus actually leaves the control.
   * @example
   * // Leaving an untouched 18.3 display retains imported 18.25pt.
   */
  private handleBlur(event: FocusEvent): void {
    if (
      this.applying ||
      this.control.contains(event.relatedTarget as Node) ||
      this.popup.contains(event.relatedTarget as Node)
    )
      return;
    if (this.dirty) this.commit(false);
    this.close();
  }

  /**
   * Handle native numeric commitment, cancellation, stepping and preset navigation.
   *
   * IME composition is never treated as Enter confirmation. Arrow keys navigate
   * an open menu or step a closed numeric field; Alt+Down explicitly opens the
   * preset list, and Escape closes it before discarding a numeric draft.
   * @param {KeyboardEvent} event - Key event within the quick control.
   * @returns {void} Performs a single keyboard operation and preserves history semantics.
   * @example
   * // Enter commits one edit; Escape restores the original value.
   */
  private handleKey(event: KeyboardEvent): void {
    if (event.target === this.toggle && event.key === "Enter") return;
    if (
      event.isComposing ||
      event.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    if (
      ![
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Enter",
        "Escape",
        "Tab",
      ].includes(event.key)
    )
      return;
    if (event.key === "Tab") {
      if (!this.commit(false)) event.preventDefault();
      this.close();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (this.popup.hidden) return;
      event.preventDefault();
      this.active = event.key === "Home" ? 0 : this.popup.children.length - 1;
      this.highlight();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      if (!this.popup.hidden) this.close();
      else {
        this.reset();
        this.actions.focus();
      }
      return;
    }
    if (event.key === "Enter") {
      /** Only a navigated option can replace the current draft on Enter. */
      const option = this.popup.hidden
        ? null
        : (this.popup.children[this.active] as HTMLButtonElement | undefined);
      if (option?.dataset.lineSpacingValue)
        this.apply(option.dataset.lineSpacingValue, true);
      else this.commit(true);
      return;
    }
    if (event.altKey) {
      if (this.popup.hidden) this.open();
      else this.close();
      return;
    }
    if (this.popup.hidden) this.commit(false, event.key === "ArrowUp" ? 1 : -1);
    else {
      this.active = Math.max(
        0,
        Math.min(
          this.popup.children.length - 1,
          this.active + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      this.highlight();
    }
  }

  /**
   * Focus the real quick field through the observed native Alt+7 access key.
   *
   * Modal dialogs retain their own keyboard scope, and composing or modified
   * shortcuts cannot move focus away from an active IME operation.
   * @param {KeyboardEvent} event - Application keyboard event.
   * @returns {void} Selects the quick-field text for native numeric replacement.
   * @example
   * // Alt+7 selects 160 for direct replacement with 175.
   */
  private handleShortcut(event: KeyboardEvent): void {
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing ||
      event.key !== "7" ||
      document.querySelector("#modal-root")?.firstChild
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.input.focus();
    this.input.select();
  }
}
