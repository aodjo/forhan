/**
 * Bind measured character tabs without replacing or resetting their draft controls.
 *
 * Click and arrow-key navigation share one state change. Invalid hidden basic
 * fields reveal their panel before the browser reports validity. All listeners
 * belong to the modal DOM and disappear when that owned modal is removed.
 * @param {HTMLElement} form - Actual native character form in its owned modal.
 * @returns {void} Installs local panel switching and accessible tab navigation.
 * @example
 * bindCharacterTabs(form); // Switching to Expanded preserves a pending Basic font size.
 */
export function bindCharacterTabs(form: HTMLElement): void {
  /** Native tab controls belong to the same modal, outside the form's content subtree. */
  const modal = form.closest<HTMLElement>(".native-dialog")!,
    tabs = Array.from(
      modal.querySelectorAll<HTMLButtonElement>("[data-character-tab]"),
    );
  /**
   * Select one character panel while retaining every existing draft input.
   *
   * Panels are hidden rather than recreated, so invalid and mixed drafts remain intact.
   * @param {string} name - Basic or expanded native panel name.
   * @param {boolean} [focus=false] - Whether keyboard/click navigation should focus the selected tab.
   * @returns {void} Updates only panel visibility and accessible tab state.
   * @example
   * select('expanded',true); // No document formatting is applied by tab navigation.
   */
  function select(name: string, focus = false): void {
    form.dataset.characterActive = name;
    for (/** Existing panel controls retain values and source exceptions while hidden. */ const panel of form.querySelectorAll<HTMLElement>(
      "[data-character-panel]",
    ))
      panel.hidden = panel.dataset.characterPanel !== name;
    for (/** Accessible tabs reflect the actual selected draft panel. */ const tab of tabs) {
      /** Exactly one enabled tab participates in normal keyboard tab order. */
      const selected = tab.dataset.characterTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
  }
  for (/** Each measured character tab uses the same local draft state. */ const tab of tabs) {
    tab.addEventListener(
      "click",
      /**
       * Show the requested native character panel without applying its settings.
       *
       * Apply and Cancel remain the only document decision controls.
       * @returns {void} Selects and focuses this local panel tab.
       * @example
       * // Returning to Basic retains the previous language and font drafts.
       */
      () => select(tab.dataset.characterTab!, true),
    );
    tab.addEventListener(
      "keydown",
      /**
       * Navigate enabled native character tabs with standard tab-list keys.
       *
       * Unrelated document/editor shortcuts do not run while focus belongs to this modal.
       * @param {KeyboardEvent} event - Actual tab-list keyboard input.
       * @returns {void} Handles only arrow, Home and End panel navigation.
       * @example
       * // ArrowRight moves from Basic to Expanded while preserving both drafts.
       */
      (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        /** Actual enabled tab order is independent of source character formatting. */
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (tabs.indexOf(tab) +
                  (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                tabs.length;
        select(tabs[index].dataset.characterTab!, true);
      },
    );
  }
  form.addEventListener(
    "invalid",
    /**
     * Reveal a hidden invalid control before native browser validation focuses it.
     *
     * An invalid Basic draft cannot be bypassed by applying from Expanded.
     * @param {Event} event - Actual form validation failure.
     * @returns {void} Shows the owning panel without changing its input value.
     * @example
     * // An invalid size draft remains visible and editable after an Expanded Apply.
     */
    (event) => {
      /** A real failed field identifies its already existing native panel. */
      const panel =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-character-panel]")
          : null;
      if (panel) select(panel.dataset.characterPanel!);
    },
    true,
  );
}
