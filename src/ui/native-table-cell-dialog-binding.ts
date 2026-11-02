import type { TableCellDialogValues } from "./native-table-cell-dialog.ts";
import type {
  TablePropertyChanges,
  TablePropertyContext,
} from "./table-properties-editor.ts";
import { writeHwpCellField } from "../cell-field-name.ts";

/** One mounted native draft retains values independently from the shared modal's detached DOM. */
export interface TableCellDialogBinding {
  /**
   * Read the accepted explicit property edits after the modal decision.
   *
   * The returned source patch does not retain mutable form controls.
   * @returns {TablePropertyChanges} Independent explicitly edited source fields.
   * @example
   * const changes=binding.read();
   */
  read(): TablePropertyChanges;
  /**
   * Release listeners owned by this one native dialog.
   *
   * Previously read source patches remain usable after cleanup.
   * @returns {void} Aborts only this dialog's event handlers.
   * @example
   * binding.destroy();
   */
  destroy(): void;
}

/**
 * Convert an explicitly entered native millimeter distance to exact source units.
 *
 * Blank mixed values never become zero. Only actual edits pass through this
 * conversion; untouched rounded controls retain their original integers.
 * @param {string} text - Explicit user-entered native millimeter draft.
 * @returns {number} Integral nonnegative native source distance.
 * @throws {RangeError} If the input is malformed, negative or outside source limits.
 * @example
 * tableDialogUnits('1.80'); // 510
 */
function tableDialogUnits(text: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/u.test(text.trim()))
    throw new RangeError("0 이상의 숫자를 소수점 둘째 자리까지 입력하세요.");
  /** Native source precision remains independent from the rounded control display. */
  const units = Math.round((Number(text) * 7200) / 25.4);
  if (!Number.isSafeInteger(units) || units < 0 || units > 0x7fffffff)
    throw new RangeError("입력한 길이가 저장 범위를 벗어났습니다.");
  return units;
}

/**
 * Bind source-independent native tabs, controls and explicit field validation.
 *
 * Cancellation cannot change source. Only accepted changed fields enter the
 * source patch, so untouched mixed cells retain all their individual values.
 * @param {HTMLElement} root - Actual mounted original-sized native dialog.
 * @param {TableCellDialogValues} initial - Independent exact original source values.
 * @param {TablePropertyContext} context - Exact original selected cell ownership.
 * @returns {TableCellDialogBinding} Retained explicit draft reader and deterministic listener cleanup.
 * @example
 * const binding=bindNativeTableCellDialog(dialog,values,context);
 */
export function bindNativeTableCellDialog(
  root: HTMLElement,
  initial: TableCellDialogValues,
  context: TablePropertyContext,
): TableCellDialogBinding {
  /** Listeners and changed field ownership belong only to this mounted modal. */
  const listeners = new AbortController(),
    changed = new Set<string>(),
    originalDisplays = new Map<string, string>(),
    inputs = root.querySelectorAll<HTMLInputElement>("input[name]");
  let accepted: TablePropertyChanges = {};
  for (/** Mixed native values remain actual indeterminate checkboxes or unassigned radio choices. */ const input of inputs) {
    if (input.type === "checkbox" && input.dataset.mixed === "true")
      input.indeterminate = true;
    if (input.type === "radio" && initial.mixed.includes(input.name))
      input.checked = false;
    if (input.type === "text") originalDisplays.set(input.name, input.value);
  }
  /**
   * Select one real native property tab without changing its source draft.
   *
   * All inactive controls remain mounted, preserving drafts and exact field ownership.
   * @param {number} index - Actual original tab index from zero through three.
   * @param {boolean} [focus=false] - Whether keyboard navigation should focus the selected tab.
   * @returns {void} Updates only the visible native panel and accessibility selection.
   * @example
   * selectTab(3,true);
   */
  function selectTab(index: number, focus = false): void {
    for (/** All four actual tabs retain matching original panel identities. */ const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-table-tab]",
    )) {
      /** Selected tab state never enters source history. */
      const selected = Number(button.dataset.tableTab) === index;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      root.querySelector<HTMLElement>(
        `#ntc-panel-${button.dataset.tableTab}`,
      )!.hidden = !selected;
      if (selected && focus) button.focus();
    }
  }
  /**
   * Read one actual enabled native field without coercing a mixed blank value.
   *
   * Radio groups return their explicitly selected numeric mode.
   * @param {string} name - Fixed owned native source field name.
   * @returns {string|number|boolean} Actual explicit control value.
   * @throws {Error} If the owned field is absent or an unassigned radio group is read.
   * @example
   * value('pageBreak'); // 0,1 or2
   */
  function value(name: string): string | number | boolean {
    /** Only fixed application-authored source field names construct selectors. */
    const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    if (input.type === "radio")
      return Number(
        root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)!.value,
      );
    return input.type === "checkbox" ? input.checked : input.value;
  }
  /**
   * Keep native dependent controls consistent without replacing retained drafts.
   *
   * Disabling page repetition or own margins never clears their original values.
   * @returns {void} Updates only local enabled states.
   * @example
   * // NONE mode leaves the original repeat flag checked but unavailable.
   */
  function availability(): void {
    for (/** Own margins are editable only while their actual native override is enabled. */ const input of root.querySelectorAll<HTMLInputElement>(
      '[name^="margin"]',
    )) {
      input.disabled = !value("hasMargin");
      for (/** Both native spinner arrows share their actual numeric field's enabled state. */ const button of input
        .closest(".ntc-number")!
        .querySelectorAll<HTMLButtonElement>("button"))
        button.disabled = input.disabled;
    }
    for (/** Native English direction buttons depend only on vertical writing. */ const input of root.querySelectorAll<HTMLInputElement>(
      '[name="direction"]',
    ))
      input.disabled = !value("vertical");
    root.querySelector<HTMLInputElement>('[name="repeatHeader"]')!.disabled =
      value("pageBreak") === 0;
  }
  /**
   * Retain one explicit field edit while preserving an unchanged rounded source value.
   *
   * Returning to the original visible value removes the pending source edit.
   * @param {HTMLInputElement} input - Actual owned edited control.
   * @returns {void} Records only an explicit changed source field.
   * @example
   * // An untouched displayed1.80mm never rounds an original509-unit margin.
   */
  function remember(input: HTMLInputElement): void {
    if (input.disabled || !Object.hasOwn(initial.fields, input.name)) return;
    input.setCustomValidity("");
    /** Explicit differences remain separate from representative mixed values. */
    const current = value(input.name),
      original =
        input.type === "text"
          ? originalDisplays.get(input.name)
          : initial.fields[input.name];
    if (!initial.mixed.includes(input.name) && current === original)
      changed.delete(input.name);
    else changed.add(input.name);
    availability();
  }
  /**
   * Validate and capture all explicitly edited fields before modal dismissal.
   *
   * Invalid fields keep their actual native panel visible. Opaque field data is
   * validated before accepting a name change for any selected source cell.
   * @returns {boolean} Whether every explicit source edit is valid and retained.
   * @example
   * capture(); // Does not change the source document.
   */
  function capture(): boolean {
    /** Only explicitly edited values can enter the accepted source patch. */
    const patch: TablePropertyChanges = {};
    for (/** Each source field retains independent validation and patch ownership. */ const name of changed) {
      /** The actual edited control receives its own native validation message. */
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      try {
        if (name === "pageBreak")
          patch.table = { ...patch.table, pageBreak: value(name) as 0 | 1 | 2 };
        else if (name === "repeatHeader")
          patch.table = { ...patch.table, repeatHeader: !!value(name) };
        else if (name.startsWith("tableMargin")) {
          /** Original table margin side names map independently from selected-cell overrides. */
          const side = name.slice(11).toLowerCase() as
            "left" | "right" | "top" | "bottom";
          patch.margins = {
            ...patch.margins,
            [side]: tableDialogUnits(String(value(name))),
          };
        } else if (name.startsWith("margin")) {
          /** An explicit cell side edit cannot overwrite other selected source margins. */
          const side = name.slice(6).toLowerCase() as
            "left" | "right" | "top" | "bottom";
          patch.cellMargins = {
            ...patch.cellMargins,
            [side]: tableDialogUnits(String(value(name))),
          };
        } else if (name === "oneLine")
          patch.cell = { ...patch.cell, lineWrap: value(name) ? 1 : 0 };
        else if (name === "vertical" || name === "direction")
          patch.cell = {
            ...patch.cell,
            textDirection: value("vertical")
              ? (value("direction") as 1 | 2)
              : 0,
          };
        else if (name === "align")
          patch.cell = {
            ...patch.cell,
            verticalAlign: value(name) as 0 | 1 | 2,
          };
        else if (name === "header") patch.header = !!value(name);
        else if (name === "fieldName") {
          /** Every selected original extension must permit the same explicit literal name change. */
          const name = String(value("fieldName"));
          for (/** Original opaque metadata remains protected independently for every selected cell. */ const selected of context.cells)
            writeHwpCellField(name, selected.node.attrs.nativeCellFieldData);
          patch.fieldName = name;
        } else if (
          name === "hasMargin" ||
          name === "protected" ||
          name === "editable"
        )
          patch.cell = { ...patch.cell, [name]: !!value(name) };
      } catch (error) {
        input.setCustomValidity(
          error instanceof Error
            ? error.message
            : "입력한 속성이 올바르지 않습니다.",
        );
        /** Invalid hidden fields must become visible before browser-native validation focuses them. */
        const panel = input.closest<HTMLElement>('[role="tabpanel"]')!;
        selectTab(Number(panel.id.slice(-1)));
        input.reportValidity();
        return false;
      }
    }
    accepted = patch;
    return true;
  }
  root.addEventListener(
    "input",
    /**
     * Retain ordinary native control input as a source-independent draft.
     *
     * Imported source and history stay unchanged until a later accepted Apply.
     * @param {Event} event - Actual owned control input.
     * @returns {void} Retains only the explicit local field change.
     * @example
     * // Editing a literal field name does not modify its cell body.
     */
    (event) => {
      if (event.target instanceof HTMLInputElement) remember(event.target);
    },
    { signal: listeners.signal },
  );
  root.addEventListener(
    "change",
    /**
     * Retain native checkbox and radio choices with their independent source ownership.
     *
     * Unchecked radio events cannot overwrite the actual selected native mode.
     * @param {Event} event - Actual owned native control change.
     * @returns {void} Updates the local explicit draft and dependent enabled states.
     * @example
     * // Switching to NONE disables but does not clear the original repeat flag.
     */
    (event) => {
      if (event.target instanceof HTMLInputElement) remember(event.target);
    },
    { signal: listeners.signal },
  );
  root.addEventListener(
    "click",
    /**
     * Route local native tabs, spinners, help and pre-dismissal validation.
     *
     * Only the shared modal's accepted Apply may later change source.
     * @param {MouseEvent} event - Actual owned dialog click.
     * @returns {void} Updates the local dialog or prevents invalid dismissal.
     * @example
     * // Cancel never reads the accepted source patch.
     */
    (event) => {
      /** All routed actions must originate in this actual mounted dialog. */
      const target = event.target instanceof Element ? event.target : null,
        tab = target?.closest<HTMLElement>("[data-table-tab]"),
        step = target?.closest<HTMLButtonElement>("[data-table-step]");
      if (tab) selectTab(Number(tab.dataset.tableTab));
      if (target?.closest("[data-table-help]")) {
        /** Local instructions never open an online feature. */ const help =
          root.querySelector<HTMLElement>(".ntc-help-text")!;
        help.hidden = !help.hidden;
      }
      if (step && !step.disabled) {
        /** A native one-tenth-millimeter step belongs only to its actual source field. */
        const input = root.querySelector<HTMLInputElement>(
          `[name="${step.dataset.tableStep}"]`,
        )!;
        input.value = Math.max(
          0,
          (Number(input.value) || 0) + Number(step.dataset.direction) * 0.1,
        ).toFixed(2);
        remember(input);
      }
      if (target?.closest('[data-modal-value="apply"]') && !capture()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true, signal: listeners.signal },
  );
  root.addEventListener(
    "keydown",
    /**
     * Route native dialog access keys and accessible tab navigation locally.
     *
     * Composition inside literal field names remains ordinary source-independent
     * form input. Disabled native controls cannot accept an access-key edit.
     * @param {KeyboardEvent} event - Actual owned dialog key event.
     * @returns {void} Updates only an enabled local native control or tab.
     * @example
     * // Alt+D validates the draft before the shared modal accepts it.
     */
    (event) => {
      if (event.isComposing) return;
      /** The actual visible source panel determines the original mnemonic scope. */
      const selected = Number(
          root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!
            .dataset.tableTab,
        ),
        target = event.target;
      if (
        (event.ctrlKey && event.key === "Tab") ||
        (target instanceof HTMLElement &&
          target.matches('[role="tab"]') &&
          (event.key === "ArrowRight" || event.key === "ArrowLeft"))
      ) {
        event.preventDefault();
        event.stopPropagation();
        selectTab(
          (selected + (event.shiftKey || event.key === "ArrowLeft" ? 3 : 1)) %
            4,
          true,
        );
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      /** Original actual native labels independently establish these field access keys. */
      const key = /^Key[A-Z]$/u.test(event.code)
          ? event.code.slice(3).toLowerCase()
          : event.key.toLowerCase(),
        cellKeys: Record<string, string> = {
          c: "sizeApply",
          m: "hasMargin",
          s: "oneLine",
          p: "protected",
          g: "header",
          e: "vertical",
          f: "editable",
          n: "fieldName",
          l: "marginLeft",
          r: "marginRight",
          t: "marginTop",
          b: "marginBottom",
        },
        tableKeys: Record<string, string> = {
          l: "tableMarginLeft",
          r: "tableMarginRight",
          t: "tableMarginTop",
          b: "tableMarginBottom",
        };
      if (key === "d") {
        event.preventDefault();
        event.stopPropagation();
        root
          .querySelector<HTMLButtonElement>('[data-modal-value="apply"]')!
          .click();
        return;
      }
      /** Explicit actual original radio mnemonics remain independent from translated captions. */
      const selector =
        selected === 3 && ["1", "2", "3"].includes(key)
          ? `[name="align"][value="${Number(key) - 1}"]`
          : selected === 3 && (key === "o" || key === "u")
            ? `[name="direction"][value="${key === "o" ? 1 : 2}"]`
            : selected === 2 && ["v", "c", "n"].includes(key)
              ? `[name="pageBreak"][value="${key === "v" ? 2 : key === "c" ? 1 : 0}"]`
              : selected === 3 && cellKeys[key]
                ? `[name="${cellKeys[key]}"]`
                : selected === 2 && tableKeys[key]
                  ? `[name="${tableKeys[key]}"]`
                  : null;
      if (selector) {
        /** A disabled source category cannot receive a silently discarded edit. */
        const input = root.querySelector<HTMLInputElement>(selector)!;
        if (!input.disabled) {
          event.preventDefault();
          event.stopPropagation();
          if (input.type === "checkbox" || input.type === "radio")
            input.click();
          else {
            input.focus();
            input.select();
          }
        }
      }
    },
    { signal: listeners.signal },
  );
  availability();
  return {
    /**
     * Read the retained independent explicit source patch after the modal decision.
     *
     * Detached form controls are never consulted.
     * @returns {TablePropertyChanges} Fresh independent accepted source changes.
     * @example
     * binding.read();
     */
    read(): TablePropertyChanges {
      return structuredClone(accepted);
    },
    /**
     * Remove this native dialog's owned listeners.
     *
     * Original source snapshots and already returned patches remain independent.
     * @returns {void} Aborts only this dialog's event ownership.
     * @example
     * binding.destroy();
     */
    destroy(): void {
      listeners.abort();
    },
  };
}
