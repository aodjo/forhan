import { renderNativeRibbon } from "./native-shell";
import { nativeIcon } from "./native-icons";
import { getNativeDropdown } from "./native-dropdowns";

/** Editor operations invoked by the measured native-style menu and ribbon controls. */
export interface NativeShellActions {
  /**
   * Execute a document operation selected from the application chrome.
   *
   * The editor remains responsible for validation, undo history, native dialogs
   * and resolving unsaved changes before a document is replaced.
   *
   * @param {string} command - Logical menu or ribbon operation.
   * @param {HTMLElement} [anchor] - The activating control used to position a popup.
   * @returns {void | Promise<void>} Completion of the requested editor operation.
   * @example
   * actions.run('page-settings', button);
   */
  run(command: string, anchor?: HTMLElement): void | Promise<void>;
  /**
   * Resolve command availability from the live editor selection and history.
   *
   * Undefined keeps the captured native default for commands whose availability
   * does not depend on document state known to this editor.
   *
   * @param {string} command - Logical operation shown in a native menu.
   * @returns {boolean | undefined} Whether the current document disables the command.
   * @example
   * actions.isDisabled?.('undo'); // false when an undo step is available.
   */
  isDisabled?(command: string): boolean | undefined;
}

/** Native-style ribbon selection and menu dismissal operations used by the editor. */
export interface NativeShellController {
  /**
   * Select a measured ribbon without changing the document selection.
   *
   * File is a popup overlay and preserves the previously selected ribbon.
   *
   * @param {string} tab - Stable identifier of the requested native tab.
   * @returns {void} Updates the visible chrome while preserving document content.
   * @example
   * controller.selectTab('edit');
   */
  selectTab(tab: string): void;
  /**
   * Dismiss all native-style menu overlays.
   *
   * Keyboard and pointer actions call the same operation so menus cannot remain
   * above an unrelated document dialog after a command is chosen.
   *
   * @returns {void} Hides the native file menu and generic dropdown container.
   * @example
   * controller.closeMenus();
   */
  closeMenus(): void;
}

/**
 * Escape a measured menu label before inserting it into application markup.
 *
 * File names and document strings can appear alongside static native labels;
 * neither may introduce HTML through the menu-rendering path.
 *
 * @param {unknown} value - The visible menu value.
 * @returns {string} Escaped text safe for a menu label or attribute.
 * @example
 * escapeMenu('A & B'); // 'A &amp; B'
 */
function escapeMenu(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    /**
     * Encode one reserved HTML character in a menu value.
     *
     * Keeps label and attribute boundaries intact without interpreting the text.
     *
     * @param {string} character - One matched reserved character.
     * @returns {string} The corresponding HTML entity.
     * @example
     * // An ampersand becomes &amp; in the generated markup.
     */
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );
}

/**
 * Bind native-style tab, ribbon, caption and menu interactions.
 *
 * Event delegation keeps measured ribbon replacements interactive. Existing
 * directly bound editor controls retain their original handlers and are not
 * invoked a second time by the delegated chrome listener.
 *
 * @param {NativeShellActions} actions - Typed document actions supplied by the editor.
 * @returns {NativeShellController} Tab-selection and menu-dismissal operations.
 * @example
 * const controller = bindNativeShell({ run: command => runEditorCommand(command) });
 * controller.selectTab('view');
 */
export function bindNativeShell(
  actions: NativeShellActions,
): NativeShellController {
  /** Last non-file ribbon selected by the user. */
  let activeTab = "edit";
  /** Identifier of the currently visible dropdown, if any. */
  let openMenu: string | null = null;

  /**
   * Hide menu overlays while retaining the active ribbon tab.
   *
   * Removing the open state from file does not change the document toolbar
   * selection that was visible before the file menu appeared.
   *
   * @returns {void} Completes menu dismissal without changing the document.
   * @example
   * closeMenus();
   */
  function closeMenus(): void {
    document
      .querySelectorAll<HTMLElement>(".native-menu-popup,#native-file-menu")
      .forEach(
        /**
         * Hide one native-style menu container.
         *
         * Both the static file overlay and measured tab dropdowns use this path.
         *
         * @param {HTMLElement} menu - Menu container being dismissed.
         * @returns {void} Hides the selected menu.
         * @example
         * // The file dropdown no longer obscures the editing ribbon.
         */
        (menu) => {
          menu.hidden = true;
        },
      );
    document
      .querySelector('[data-native-tab="file"]')
      ?.classList.remove("menu-open", "open");
    openMenu = null;
  }

  /**
   * Open a captured native dropdown at its measured window coordinates.
   *
   * File uses its persistent menu so recent-document identifiers and directly
   * bound template actions remain available across repeated menu openings.
   *
   * @param {string} tab - Native tab whose dropdown should become visible.
   * @returns {void} Displays a known menu or delegates an uncaptured menu to its tab.
   * @example
   * showMenu('file');
   */
  function showMenu(tab: string): void {
    if (openMenu === tab) {
      closeMenus();
      return;
    }
    closeMenus();
    if (tab === "file") {
      /** Persistent file menu containing current Forhan recent-document entries. */
      const file = document.querySelector<HTMLElement>("#native-file-menu");
      if (file) {
        file.hidden = false;
        openMenu = tab;
        document
          .querySelector('[data-native-tab="file"]')
          ?.classList.add("menu-open", "open");
      }
      return;
    }
    /** Captured geometry and rows for the requested native dropdown. */
    const measured = getNativeDropdown(tab);
    /** Shared overlay reused for measured non-file dropdown menus. */
    const container = document.querySelector<HTMLElement>("#native-other-menu");
    if (!measured || !container) {
      selectTab(tab);
      return;
    }
    container.innerHTML = measured.items
      .map(
        /**
         * Render a captured native dropdown entry.
         *
         * Visible labels and keyboard hints use native observations; document
         * effects remain routed through the typed editor action dispatcher.
         *
         * @param {typeof measured.items[number]} item - One captured menu command.
         * @returns {string} Native-style menu-row markup.
         * @example
         * // A measured undo entry retains its visible label and shortcut.
         */
        (item) => {
          /** Native row coordinates translated into the dropdown's local coordinate system. */
          const placement = item.bounds
            ? `position:absolute;left:${item.bounds.x - measured.x}px;top:${item.bounds.y - measured.y}px;width:${item.bounds.width}px;height:${item.bounds.height}px`
            : "";
          /** Current command availability, falling back to the captured blank-document state. */
          const disabled = actions.isDisabled?.(item.action) ?? item.disabled;
          /** Captured separator origin immediately above the menu row it precedes. */
          const separator = item.separatorBefore
            ? `<div class="native-menu-separator"${item.bounds ? ` style="position:absolute;left:0;right:0;top:${item.bounds.y - measured.y - 2}px"` : ""}></div>`
            : "";
          return `${separator}<button class="native-menu-row" style="${placement}" data-native-action="${escapeMenu(item.action)}" ${disabled ? "disabled" : ""}><span class="native-menu-icon">${item.checked ? "✓" : nativeIcon(item.icon || "document", 16)}</span><span class="native-menu-label">${escapeMenu(item.label)}</span><span class="native-menu-shortcut">${escapeMenu(item.shortcut || "")}</span>${item.hasDropdown || item.children?.length ? '<span class="native-submenu-arrow">›</span>' : ""}</button>`;
        },
      )
      .join("");
    container.style.left = `${measured.x}px`;
    container.style.top = `${measured.y}px`;
    container.style.width = `${measured.width}px`;
    container.style.height = `${measured.height}px`;
    container.hidden = false;
    openMenu = tab;
  }

  /**
   * Replace the active measured ribbon and update its menu-tab selection.
   *
   * Pointer actions preserve the editor's existing text selection, while file
   * opens an overlay instead of substituting an unrelated ribbon command set.
   *
   * @param {string} tab - Stable native tab identifier.
   * @returns {void} Updates the measured ribbon chrome.
   * @example
   * selectTab('page');
   */
  function selectTab(tab: string): void {
    if (tab === "file") {
      showMenu(tab);
      return;
    }
    closeMenus();
    activeTab = tab;
    document.querySelectorAll<HTMLElement>("button[data-native-tab]").forEach(
      /**
       * Synchronize one top-menu tab with the selected ribbon.
       *
       * The accessible pressed state follows the same selection as the native blue underline.
       *
       * @param {HTMLElement} button - One top-menu tab control.
       * @returns {void} Updates its visible and accessible selection state.
       * @example
       * // Selecting 쪽 removes the underline from 편집.
       */
      (button) => {
        /** Whether this menu tab owns the ribbon currently displayed. */
        const selected = button.dataset.nativeTab === activeTab;
        button.classList.toggle("selected", selected);
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
        button.setAttribute("aria-selected", String(selected));
      },
    );
    /** Persistent ribbon host whose children follow the selected captured tab. */
    const ribbon = document.querySelector<HTMLElement>("#native-ribbon");
    if (ribbon) ribbon.innerHTML = renderNativeRibbon(tab);
    document.body.dataset.nativeTab = tab;
    void actions.run("ribbon-changed");
  }

  document.addEventListener(
    "mousedown",
    /**
     * Preserve document selection while a ribbon or menu button receives a pointer action.
     *
     * Editable fields retain ordinary focus behavior; command buttons operate on
     * the existing document selection instead of moving its caret into the chrome.
     *
     * @param {MouseEvent} event - The document-level pointer event.
     * @returns {void} Prevents focus transfer for native-style command buttons.
     * @example
     * // A selected phrase stays selected when its bold button is pressed.
     */
    (event) => {
      if (
        (event.target as Element).closest(
          ".native-ribbon button,.native-menu-popup button,.native-font-size-step",
        )
      )
        event.preventDefault();
    },
  );

  document.addEventListener(
    "click",
    /**
     * Route a native-style chrome click to its measured menu or editor action.
     *
     * Directly bound core controls are skipped after their handler has run,
     * preventing duplicate saves, popovers and formatting commands.
     *
     * @param {MouseEvent} event - The pointer event originating in application chrome.
     * @returns {void} Executes one supported chrome interaction.
     * @example
     * // Selecting 표 in a rebuilt ribbon invokes the same table insertion flow.
     */
    (event) => {
      /** Original element used to resolve the closest native control. */
      const target = event.target as Element;
      /** Caption operation requested by a custom minimize, maximize or close button. */
      const caption = target.closest<HTMLElement>("[data-window]");
      if (caption) {
        /** Validated name of the native caption operation selected by the user. */
        const command = caption.dataset.window;
        if (
          command === "minimize" ||
          command === "maximize" ||
          command === "close"
        )
          window.forhan?.windowControl(command);
        return;
      }
      /** Split-menu arrow, which does not change the currently selected ribbon. */
      const arrow = target.closest<HTMLElement>("[data-native-menu]");
      if (arrow?.dataset.nativeMenu) {
        showMenu(arrow.dataset.nativeMenu);
        return;
      }
      /** Native tab selected by its visible label rather than its dropdown arrow. */
      const tab = target.closest<HTMLButtonElement>("button[data-native-tab]");
      if (tab?.dataset.nativeTab && !tab.disabled) {
        selectTab(tab.dataset.nativeTab);
        return;
      }
      /** Document operation selected from a ribbon, caption utility or menu row. */
      const control = target.closest<HTMLElement>(
        "button[data-native-action],a[data-native-action]",
      );
      if (
        control?.dataset.nativeAction &&
        !(control as HTMLButtonElement).disabled
      ) {
        if (!control.onclick)
          void actions.run(control.dataset.nativeAction, control);
        if (control.closest(".native-menu-popup,#native-file-menu"))
          closeMenus();
        return;
      }
      if (
        !target.closest(".native-menu-popup,#native-file-menu,.native-menubar")
      )
        closeMenus();
    },
  );

  document.addEventListener(
    "change",
    /**
     * Apply a field edited inside a captured ribbon variant.
     *
     * Persistent quick-format fields keep their directly registered handlers;
     * dynamically rebuilt ribbon fields use the same typed editor dispatcher.
     *
     * @param {Event} event - The change event from a ribbon input or select control.
     * @returns {void} Dispatches an edited dynamic field when no direct handler owns it.
     * @example
     * // A selected font in the 서식 ribbon updates the current text formatting.
     */
    (event) => {
      /** Dynamic field whose logical formatting operation is declared by the ribbon data. */
      const field = (event.target as Element).closest<
        HTMLInputElement | HTMLSelectElement
      >(".native-ribbon [data-native-action]");
      if (field?.dataset.nativeAction && !field.onchange)
        void actions.run(field.dataset.nativeAction, field);
    },
  );

  document.addEventListener(
    "keydown",
    /**
     * Apply native menu dismissal and access-key behavior.
     *
     * Document editing shortcuts remain owned by the editor and native main
     * process; this listener handles Escape and unambiguous Alt file commands.
     *
     * @param {KeyboardEvent} event - Keyboard event from the application window.
     * @returns {void} Dismisses menus or dispatches a native file access-key command.
     * @example
     * // Alt+O invokes the same local file picker as 불러오기.
     */
    (event) => {
      if (
        ["Enter", "Escape", "ArrowUp", "ArrowDown"].includes(event.key) &&
        event.target instanceof HTMLInputElement &&
        event.target.matches(
          '.native-ribbon input[data-native-action="font-size"], #font-size',
        )
      ) {
        event.preventDefault();
        void actions.run(
          event.key === "Escape"
            ? "ribbon-field-cancel"
            : event.key === "ArrowUp"
              ? "font-size-up"
              : event.key === "ArrowDown"
                ? "font-size-down"
                : "font-size",
          event.target,
        );
        return;
      }
      if (
        event.key === "Enter" &&
        event.target instanceof HTMLInputElement &&
        event.target.closest(".native-menu-search")
      ) {
        event.preventDefault();
        void actions.run("quick-find", event.target);
        return;
      }
      if (event.key === "Escape") closeMenus();
      if (!event.altKey || event.ctrlKey || event.metaKey || event.isComposing)
        return;
      /** Native file access keys observed in the installed application's file menu. */
      const commands: Record<string, string> = {
        n: "new",
        o: "open",
        s: "save",
        v: "save-as",
        p: "print",
        x: "close",
      };
      /** Logical editor command corresponding to the pressed access key. */
      const command = commands[event.key.toLowerCase()];
      if (command) {
        event.preventDefault();
        closeMenus();
        void actions.run(command);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        showMenu("file");
      }
    },
  );

  return { selectTab, closeMenus };
}
