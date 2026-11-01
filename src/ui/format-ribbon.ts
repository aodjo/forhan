import type { Editor } from "@tiptap/core";
import {
  defaultFontSize,
  storedFontSizePoints,
  displayFontSize,
  fontSizeInputError,
  MIN_FONT_SIZE,
  MAX_STORED_FONT_SIZE,
  stepFontSize,
} from "../formatting";
export { displayFontSize } from "../formatting";

/** Representative font used by the installed application's blank document. */
const DEFAULT_FONT = "함초롬바탕";
/** Inline mark commands that have matching measured ribbon buttons. */
const RIBBON_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "superscript",
  "subscript",
] as const;

/**
 * Select a document value without dropping unlisted imported formatting.
 *
 * Imported font names and custom line spacing remain visible even when they
 * are absent from the application's initial preset list.
 * @param {HTMLSelectElement} select - Formatting selector to update.
 * @param {string} value - Underlying document value.
 * @param {string} label - Human-readable text for a missing choice.
 * @returns {void} Selects or appends the required value.
 * @example
 * selectDocumentValue(selector, '1.75', '175');
 */
export function selectDocumentValue(
  select: HTMLSelectElement,
  value: string,
  label: string,
): void {
  for (/** Existing choice checked without interpreting font names as markup. */ const option of select.options) {
    if (option.value === value) {
      select.value = value;
      return;
    }
  }
  select.add(new Option(label, value));
  select.value = value;
}

/**
 * Resolve the active document's character size using shared writer defaults.
 *
 * Absolute CSS units are converted to points; an unformatted heading uses its
 * heading style size rather than the ordinary body-text fallback. Imported
 * zero-height text stays zero instead of displaying an unrelated default size.
 * @param {Editor} editor - Active rich-text document editor.
 * @returns {number} Current character size in typographic points.
 * @example
 * selectionFontSize(editor); // 12 for a 16px text run.
 */
export function selectionFontSize(editor: Editor): number {
  /** A whole-document selection can start above its first text block. */
  const parent = editor.state.selection.$from.parent;
  /** Leading text block supplies inherited size for text, node and whole-document selections. */
  let block = parent.isTextblock
    ? parent
    : editor.state.doc.nodeAt(editor.state.selection.from) || parent;
  while (!block.isTextblock && block.firstChild) block = block.firstChild;
  return storedFontSizePoints(
    editor.getAttributes("textStyle").fontSize,
    defaultFontSize(block.type.name === "heading" ? block.attrs.level : 0),
  );
}

/**
 * Synchronize rebuilt ribbon controls with the current editor selection.
 *
 * Uses persistent quick-toolbar font choices, retains imported names, reflects
 * marks and lists, and never overwrites the field currently being edited unless
 * that exact field is explicitly being reset after cancellation.
 * @param {Editor} editor - Active rich-text editor.
 * @param {HTMLElement} [resetField] - Draft field explicitly cancelled by Escape.
 * @returns {void} Updates visible ribbon state without changing document content.
 * @example
 * synchronizeFormatRibbon(editor);
 */
export function synchronizeFormatRibbon(
  editor: Editor,
  resetField?: HTMLElement,
): void {
  /** Character attributes retained by the actual document selection. */
  const attrs = editor.getAttributes("textStyle");
  /** Persistent quick-format font choices are shared by both editing surfaces. */
  const source = document.querySelector<HTMLSelectElement>("#font-family");
  for (/** Visible font selector recreated when the formatting tab is selected. */ const select of document.querySelectorAll<HTMLSelectElement>(
    '.native-ribbon select[data-native-action="font"]',
  )) {
    if (document.activeElement === select && resetField !== select) continue;
    select.replaceChildren();
    /** Deduplicated font values, preserving distinct imported font identifiers. */
    const seen = new Set<string>();
    for (/** Persistent font choice copied as DOM rather than injected HTML. */ const option of source?.options ||
      []) {
      if (!option.value || seen.has(option.value)) continue;
      seen.add(option.value);
      select.add(option.cloneNode(true) as HTMLOptionElement);
    }
    selectDocumentValue(
      select,
      attrs.fontFamily || DEFAULT_FONT,
      attrs.fontFamily || DEFAULT_FONT,
    );
  }
  for (/** Numeric point-size draft displayed in the formatting ribbon. */ const input of document.querySelectorAll<HTMLInputElement>(
    '.native-ribbon input[data-native-action="font-size"], #font-size',
  )) {
    if (document.activeElement === input && resetField !== input) continue;
    input.setCustomValidity("");
    input.value = displayFontSize(selectionFontSize(editor));
    input.min = String(Math.min(MIN_FONT_SIZE, selectionFontSize(editor)));
    input.max = String(MAX_STORED_FONT_SIZE);
  }
  for (/** Native inline mark command whose live selection state is reflected. */ const mark of RIBBON_MARKS) {
    for (/** Button representing this inline format in the current ribbon. */ const button of document.querySelectorAll<HTMLElement>(
      `.native-ribbon button[data-native-action="${mark}"]`,
    )) {
      button.classList.toggle("active", editor.isActive(mark));
      button.setAttribute("aria-pressed", String(editor.isActive(mark)));
    }
  }
  for (/** List command and editor node name used to display live list selection. */ const [
    action,
    node,
  ] of [
    ["bullet-list", "bulletList"],
    ["ordered-list", "orderedList"],
  ]) {
    for (/** Native list button reflecting the current paragraph container. */ const button of document.querySelectorAll<HTMLElement>(
      `.native-ribbon button[data-native-action="${action}"]`,
    )) {
      button.classList.toggle("active", editor.isActive(node));
      button.setAttribute("aria-pressed", String(editor.isActive(node)));
    }
  }
}

/**
 * Apply an edited native ribbon field as an undoable character change.
 *
 * Returns false for ordinary buttons so menu commands can retain their dialog
 * behavior. Invalid size drafts stay editable and never change the document.
 * Point-size edits restore focus synchronously so a deferred editor focus
 * cannot steal keystrokes from the next character-size field interaction.
 * @param {Editor} editor - Active document editor.
 * @param {string} command - Logical action declared by the native ribbon.
 * @param {HTMLElement} field - Originating select or numeric input.
 * @returns {boolean} Whether this operation owns the edited field.
 * @example
 * applyRibbonField(editor, 'font-size', input);
 */
export function applyRibbonField(
  editor: Editor,
  command: string,
  field: HTMLElement,
): boolean {
  if (command === "font" && field instanceof HTMLSelectElement) {
    if (field.value) editor.chain().setFontFamily(field.value).run();
    editor.view.focus();
    return true;
  }
  if (command === "font-size" && field instanceof HTMLInputElement) {
    /** Finite point size, using the same rules as the persistent quick toolbar. */
    const size = Number(field.value);
    /** Entry validation permits an unchanged imported subminimum height. */
    const error = fontSizeInputError(field.value, selectionFontSize(editor));
    field.setCustomValidity(error);
    if (error) {
      field.reportValidity();
      return true;
    }
    field.setCustomValidity("");
    editor.chain().setFontSize(`${size}pt`).run();
    editor.view.focus();
    return true;
  }
  return false;
}

/**
 * Apply a native one-point size action through the originating font control.
 *
 * Invalid drafts retain focus and leave the document unchanged. Valid fractional
 * sizes advance by a full point without snapping to the input's hundredth grid.
 * @param {Editor} editor - Document whose current text selection is formatted.
 * @param {HTMLInputElement} field - Quick toolbar or ribbon character-size field.
 * @param {1 | -1} direction - Requested increase or decrease.
 * @returns {void} Applies one undoable size change or reports the draft error.
 * @example
 * stepFontSizeField(editor, input, 1); // 13.25pt becomes 14.25pt.
 */
export function stepFontSizeField(
  editor: Editor,
  field: HTMLInputElement,
  direction: 1 | -1,
): void {
  /** Shared validation preserves unsupported drafts rather than silently replacing them. */
  const error = fontSizeInputError(field.value, selectionFontSize(editor));
  field.setCustomValidity(error);
  if (error) {
    field.reportValidity();
    return;
  }
  field.value = displayFontSize(stepFontSize(Number(field.value), direction));
  applyRibbonField(editor, "font-size", field);
}

/**
 * Resolve the leading selected text block's actual paragraph line spacing.
 *
 * Text, node and document selections share the same leading-block fallback.
 * Mixed heading/body selections do not borrow a different block type's spacing.
 * @param {Editor} editor - Actual rich-text editor and saved document selection.
 * @returns {string} Original line-height attribute or the native blank default.
 * @example
 * selectionLineSpacing(editor); // '18.25pt' for a selected fixed-spacing block.
 */
export function selectionLineSpacing(editor: Editor): string {
  /** A whole-document selection can begin above its first text block. */
  const parent = editor.state.selection.$from.parent;
  /** Descend only within the leading selected document node. */
  let block = parent.isTextblock
    ? parent
    : editor.state.doc.nodeAt(editor.state.selection.from) || parent;
  while (!block.isTextblock && block.firstChild) block = block.firstChild;
  return String(block.attrs.lineHeight ?? "1.6");
}
