import {bindPageGrid} from './ui/page-grid.ts';
import { bindNativeTableMenu } from "./ui/native-table";
import "./ui/native-table.css";
import { Editor, type JSONContent, type ChainedCommands } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import type {
  AppAction,
  AsyncBridge,
  BridgeResult,
  DocumentPayload,
  DocumentState,
  ExportFormat,
  OpenedFile,
  PageSettings,
} from "./types";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import {NativeTable,NativeTableCell,NativeTableHeader} from './ui/native-cell-geometry.ts';
import { TextStyleKit } from "@tiptap/extension-text-style";
import {
  NativeCharacterFormatting,
  NativeFontFamily,
  applyCharacterLanguageChanges,
  renderCharacterMetrics,
} from "./ui/character-formatting";
import { CharacterLanguageDraft } from "./ui/character-language";
import { renderCharacterSample } from "./ui/character-preview";
import { renderParagraphPreview } from "./ui/paragraph-preview";
import {sectionGridHtml,readSectionGridHtml} from './section-grid.ts';
import {paragraphGridSelection} from './ui/paragraph-line-grid.ts';
import {NativePageHistory} from './ui/page-history.ts';
import {PageSettingsStep} from './page-history.ts';
import {closeHistory} from '@tiptap/pm/history';
import { characterShadow } from "./character-shadow";
import { NativeCharacterShadow, bindShadowControls, renderShadowPreview, applyShadowDraft } from "./ui/character-shadow";
import { characterOutline } from "./character-outline";
import { NativeCharacterOutline, renderOutlinePreview } from "./ui/character-outline";
import { characterEmphasis } from "./character-emphasis";
import { NativeCharacterEmphasis } from "./ui/character-emphasis";
import { NativeDocumentNavigation } from "./ui/document-navigation";
import { NativeWidthSelection } from "./ui/width-selection";
import {NativeCellProtection} from './ui/native-cell-protection.ts';
import { NativeCharacterWidths } from "./ui/character-width";
import {
  characterMetrics,
  characterMetricInputError,
  EDITABLE_CHARACTER_METRICS,
} from "./character-metrics";
import { NativeParagraphAlignment } from './ui/paragraph-alignment';
import { NativeParagraphWordBreak,paragraphWordBreakSelection } from './ui/paragraph-word-break';
import {removeHyphenDrawings} from './english-hyphenation';
import {handleParagraphNumberEvent,refreshParagraphNumbers,paragraphNumberValue,setParagraphNumberDraft,MAX_PARAGRAPH_DISTANCE} from './ui/paragraph-numbers';
import {paragraphCondense,parseParagraphMinimumSpace,MAX_PARAGRAPH_SPACE} from './paragraph-minimum-space';
import { PARAGRAPH_ALIGNMENTS, paragraphAlignment } from './paragraph-alignment';
import Image from "@tiptap/extension-image";
import {
  createIcons,
  FileText,
  Plus,
  FolderOpen,
  Save,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Table,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Settings2,
  PanelLeftClose,
  PanelLeft,
  HelpCircle,
  ArrowUpRight,
  FilePlus2,
  Check,
  Minus,
  MoreHorizontal,
  FileDown,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  BookOpen,
  LayoutTemplate,
  ShieldCheck,
} from "lucide";
import {
  DocumentAttributes,
  PreservedBlock,
  PageBreak,
  Superscript,
  Subscript,
} from "./extensions";
import {
  defaultPage,
  templates,
  validateDocument,
  validatePage,
  isSafeDocumentLink,
} from "./documents";
import { editHyperlink, navigateHyperlink } from "./ui/hyperlinks";
import {
  synchronizeFormatRibbon,
  applyRibbonField,
  selectionFontSize,
  displayFontSize,
  selectionLineSpacing,
  stepFontSizeField,
} from "./ui/format-ribbon";
import {
  fixedLineHeightPoints,
  nativeParagraphLengthPoints,
  fontSizeInputError,
  stepFontSize,
} from "./formatting";
import { documentContentStyles, documentPageStyles } from "./document-styles";
import {portableOutputFontStyles} from './portable-font-output.ts';
import {PORTABLE_EDITOR_FONT_CSS,loadPortableKoreanFonts} from './portable-editor-font-styles.ts';
import { prepareNativeLayout } from "./native-layout-export";
import { NativeLineLayout } from "./ui/native-line-layout";
import { normalizeHtmlFontSpaces } from "./font-space";
import { NativeFontSpaces, fontSpaceSelection } from "./ui/font-space";
import { bindCharacterTabs } from "./ui/character-tabs";
import { NativeCharacterDecorations, NativeUnderline, NativeStrike, nativeUnderlineDefaultColor } from "./ui/character-decorations";
import { characterDecoration, normalizeHtmlDecorations } from "./character-decorations";
import { bindDecorationControls, renderDecorationPreview, applyDecorationDraft } from "./ui/decoration-controls";
import { readHwpx, writeHwpx } from "./formats/hwpx";
import { readHwp } from "./formats/hwp";
import { writeHwp } from "./formats/hwp-writer";
import { buildNativeShell, renderNativeRuler } from "./ui/native-shell";
import { bindNativeShell } from "./ui/native-interactions";
import { NativeColorPalette } from "./ui/color-palette";
import { NativeFontPicker } from "./ui/font-picker";
import { NativeLineSpacing } from './ui/line-spacing';
import { parseLineSpacingInput,lineSpacingState,fixedLineSpacingMaximum } from './line-spacing';
import {
  renderNativeDialog,
  type NativeDialogMarkup,
} from "./ui/native-dialogs";
import "./ui/native-shell.css";
import "./ui/native-dialogs.css";
import "./ui/native-find.css";
import "./ui/native-view.css";
import { bindNativeScroll } from "./ui/native-scroll";
import { bindNativeFit, type NativeFitBinding } from "./ui/native-fit";
import {readNativePageView,setNativePageView} from './ui/native-page-view';
import {renderNativeZoomDialog,bindNativeZoomDialog,NATIVE_ZOOM_PRESETS,type NativeZoomDraft,type NativeZoomChoice} from './ui/native-zoom-dialog';
import './ui/native-zoom-dialog.css';
import {captureFormatPainter,applyFormatPainter} from './ui/format-painter.ts';
import {FormatCopyMemory,type FormatCopySession,type FormatPainterOptions} from './format-copy-session.ts';
import {renderNativeFormatPainterDialog,bindNativeFormatPainterDialog} from './ui/native-format-painter.ts';
import './ui/native-format-painter.css';
import {captureTableProperties,applyTableProperties} from './ui/table-properties-editor.ts';
import {tableCellDialogValues,renderNativeTableCellDialog} from './ui/native-table-cell-dialog.ts';
import {bindNativeTableCellDialog} from './ui/native-table-cell-dialog-binding.ts';
import './ui/native-table-cell-dialog.css';
import {NativeCharacterDefaults} from './ui/character-defaults.ts';
import "./ui/native-scroll.css";

/** Icons available to application controls and menus. */
const iconSet = {
  FileText,
  Plus,
  FolderOpen,
  Save,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Table,
  Image: ImageIcon,
  Undo2,
  Redo2,
  Settings2,
  PanelLeftClose,
  PanelLeft,
  HelpCircle,
  ArrowUpRight,
  FilePlus2,
  Check,
  Minus,
  MoreHorizontal,
  FileDown,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  BookOpen,
  LayoutTemplate,
  ShieldCheck,
};
/**
 * Create the placeholder markup for a toolbar icon.
 *
 * Lucide replaces the placeholder after controls are inserted into the document.
 * @param {string} name Icon or control name used by the current rendering helper.
 * @returns {string} Decorative Lucide placeholder markup.
 * @example
 * i("save") // An accessible decorative icon placeholder.
 */
const i = (name: string): string =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;
type InputSelector =
  | "#document-title"
  | "#font-size"
  | "#line-height"
  | "#font-color"
  | "#find-text"
  | "#replace-text"
  | "#table-rows"
  | "#table-cols"
  | "#file-input"
  | "#image-input"
  | "#zoom-slider";
type SelectSelector = "#font-family" | "#block-style";
type ButtonSelector = "#undo" | "#redo" | "#save-document";
/**
 * Resolve a required application control.
 *
 * Overloads preserve the DOM type of known inputs, selectors and buttons; missing application markup fails immediately.
 * @param {InputSelector} selector CSS selector of the required application control.
 * @returns {HTMLInputElement} The matching application element with its control-specific DOM type.
 * @throws {Error} If the required application element is absent.
 * @example
 * $("#document-title").value // The current document title.
 */
function $(selector: InputSelector): HTMLInputElement;
/**
 * Resolve a required application control.
 *
 * Overloads preserve the DOM type of known inputs, selectors and buttons; missing application markup fails immediately.
 * @param {SelectSelector} selector CSS selector of the required application control.
 * @returns {HTMLSelectElement} The matching application element with its control-specific DOM type.
 * @throws {Error} If the required application element is absent.
 * @example
 * $("#document-title").value // The current document title.
 */
function $(selector: SelectSelector): HTMLSelectElement;
/**
 * Resolve a required application control.
 *
 * Overloads preserve the DOM type of known inputs, selectors and buttons; missing application markup fails immediately.
 * @param {ButtonSelector} selector CSS selector of the required application control.
 * @returns {HTMLButtonElement} The matching application element with its control-specific DOM type.
 * @throws {Error} If the required application element is absent.
 * @example
 * $("#document-title").value // The current document title.
 */
function $(selector: ButtonSelector): HTMLButtonElement;
/**
 * Resolve a required application control.
 *
 * Overloads preserve the DOM type of known inputs, selectors and buttons; missing application markup fails immediately.
 * @param {string} selector CSS selector of the required application control.
 * @returns {T} The matching application element with its control-specific DOM type.
 * @throws {Error} If the required application element is absent.
 * @example
 * $("#document-title").value // The current document title.
 */
function $<T extends HTMLElement = HTMLElement>(selector: string): T;
/**
 * Resolve a required application control.
 *
 * Overloads preserve the DOM type of known inputs, selectors and buttons; missing application markup fails immediately.
 * @param {string} selector CSS selector of the required application control.
 * @returns {HTMLElement} The matching application element with its control-specific DOM type.
 * @throws {Error} If the required application element is absent.
 * @example
 * $("#document-title").value // The current document title.
 */
function $(selector: string): HTMLElement {
  /** Required DOM control resolved from the application markup. */
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing application element: ${selector}`);
  return element;
}
/**
 * Escape text before inserting it into HTML.
 *
 * Document titles, file names and import notices remain text instead of becoming markup.
 * @param {unknown} s Text to encode in the template or escape for application markup.
 * @returns {string} Text with HTML-sensitive characters replaced by entities.
 * @example
 * escape("<title>") // "&lt;title&gt;"
 */
const escape = (s: unknown): string =>
  String(s).replace(
    /[&<>"']/g,
    /**
     * Convert one HTML-sensitive character to its entity.
     *
     * Text originating in documents or file names remains literal content when application markup is assembled.
     * @param {string} c HTML-sensitive character to replace with its matching entity.
     * @returns {string} Text with HTML-sensitive characters replaced by entities.
     * @example
     * replaceCharacter("<") // "&lt;"
     */
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );
/**
 * Render an accessible icon button.
 *
 * The visible toolbar and menu controls share matching identifiers, titles and accessible labels.
 * @param {string} id Stable DOM identifier assigned to the control.
 * @param {string} name Icon or control name used by the current rendering helper.
 * @param {string} label Visible or accessible label for the control.
 * @param {string} cls Additional CSS classes applied to the control.
 * @returns {string} Markup for the labelled icon button.
 * @example
 * button("save", "save", "Save") // HTML for a labelled save button.
 */
const button = (id: string, name: string, label: string, cls = ""): string =>
  `<button id="${id}" class="${cls}" title="${label}" aria-label="${label}">${i(name)}</button>`;
/** Optional desktop bridge; absent during browser preview. */
const native = window.forhan;
/**
 * Normalise an error for a user-visible message.
 *
 * Errors retain their message while non-Error failures are represented as plain text.
 * @param {unknown} error Failure thrown by a local file, document validation or desktop operation.
 * @returns {string} Plain-text failure message suitable for an escaped notification.
 * @example
 * errorMessage(new Error("Read failed")) // "Read failed"
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
type TableCommand =
  | "addRowAfter"
  | "addColumnAfter"
  | "mergeCells"
  | "splitCell"
  | "toggleHeaderRow"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable";
/** Active document, import provenance and editor interface state. */
const state: DocumentState = {
  title: templates.blank.title,
  page: defaultPage(),
  source: null,
  original: null,
  format: "hwpx",
  warnings: [],
  dirty: false,
  zoom: 125,
  outline: true,
  busy: false,
  composing: false,
};
/** Persistent display fitting is view state and never enters document serialization. */
let nativeFit: NativeFitBinding | undefined;
/** saved searchIndex initial */
let saved = "",
  searchIndex = -1,
  initial = true;
/** recoveryTimer toastTimer */
let recoveryTimer: ReturnType<typeof setTimeout> | undefined,
  toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Text ranges matching the current case-insensitive query. */
let matches: { from: number; to: number }[] = [];

/** One content stylesheet shared with standalone HTML, PDF and native printing. */
const documentStyle = document.createElement("style");
documentStyle.textContent = PORTABLE_EDITOR_FONT_CSS+documentContentStyles(".native-shell .tiptap");
document.head.append(documentStyle);
await loadPortableKoreanFonts(document);

$("#app").innerHTML = buildNativeShell(state.title);
/** One delegated native color picker survives ribbon and dialog replacements. */
const colorPalettes = new NativeColorPalette();
/** Local font enumeration and native dropdowns are shared by quick, ribbon and dialog controls. */
const fontPicker = new NativeFontPicker();

/**
 * Replace decorative icon placeholders.
 *
 * Newly rendered controls receive the application icon set and consistent stroke width.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * icons() // Updates icons in the current document.
 */
function icons() {
  createIcons({ icons: iconSet, attrs: { "stroke-width": 1.7 } });
}
icons();
/** Rich-text editor configured for local document editing. */
const editor = new Editor({
  element: $("#editor"),
  extensions: [
    StarterKit.configure({
      underline: false,
      strike: false,
      link: {
        openOnClick: false,
        autolink: false,
        isAllowedUri: isSafeDocumentLink,
      },
    }),
    TableKit.configure({ table:false,tableCell:false,tableHeader:false }),
    NativeTable.configure({resizable:true}),
    NativeTableCell,
    NativeTableHeader,
    TextStyleKit.configure({ fontSize: false, fontFamily: false }),
    NativeFontFamily,
    NativeCharacterFormatting,
    NativeCharacterDefaults,
    NativeUnderline,
    NativeStrike,
    NativeCharacterDecorations,
    NativeParagraphAlignment,
    NativeFontSpaces,
    NativeLineLayout.configure({
      /**
       * Read independent current physical source settings for editable sheet layout.
       *
       * File loading and page history replace this state without changing source text.
       * @returns {PageSettings} Current validated physical page and native grid settings.
       * @example
       * // Editable sheets and exported pages use the same current document geometry.
       */
      getPage:()=>state.page,
    }),
    NativePageHistory.configure({
      /**
       * Apply committed physical page history to the actual independent document state.
       *
       * Text positions remain unchanged while native layout, dirty state and recovery follow the accepted page.
       * @param {PageSettings} page - Validated accepted or history-restored page source.
       * @returns {void} Updates physical paper layout after the source transaction commits.
       * @example
       * // One undo restores the preceding page-grid interval and original margins.
       */
      onChange(page){state.page=page;applyPage();update();scheduleRecovery();},
    }),
    Image.configure({ allowBase64: true }),
    DocumentAttributes,
    PreservedBlock,
    PageBreak,
    NativeCharacterShadow,
    NativeCharacterOutline,
    NativeCharacterEmphasis,
    NativeDocumentNavigation,
    NativeWidthSelection,
    NativeCellProtection,
    NativeCharacterWidths,
    NativeParagraphWordBreak,
    Superscript,
    Subscript,
  ],
  content: templates.blank.doc,
  editorProps: {
    attributes: {
      "aria-label": "문서 본문",
      role: "textbox",
      "aria-multiline": "true",
      spellcheck: "false",
    },
    /**
     * Remove externally loaded images from pasted HTML.
     *
     * Supported embedded raster data remains available without allowing clipboard content to make image network requests.
     * @param {string} html Clipboard HTML inspected before it enters the editor.
     * @returns {string} Filtered clipboard HTML containing only permitted embedded images.
     * @example
     * transformPastedHTML(clipboardHtml) // HTML containing only permitted embedded images.
     */
    transformPastedHTML(html) {
      /** Detached HTML document used to filter pasted or imported markup. */
      const parsed = new DOMParser().parseFromString(html, "text/html");
      removeHyphenDrawings(parsed.body);
      parsed.querySelectorAll("img").forEach(
        /**
         * Remove an image whose clipboard source is not embedded raster data.
         *
         * Pasted markup keeps only permitted data-image URLs, preventing remote image requests from clipboard content.
         * @param {HTMLImageElement} img Image element being checked for an allowed embedded data source.
         * @returns {void} Filtered clipboard HTML containing only permitted embedded images.
         * @example
         * filterClipboardImage(remoteImageElement) // Removes the external image.
         */
        (img) => {
          if (!/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(img.src))
            img.remove();
        },
      );
      normalizeHtmlFontSpaces(parsed.body);
      normalizeHtmlDecorations(parsed.body);
      return parsed.body.innerHTML;
    },
    /**
     * Reserve dropped local files for document import.
     *
     * Files are handled by the application drop flow; moves of existing editor content retain normal editor behaviour.
     * @param {import("prosemirror-view").EditorView} view Current editor view supplied by the editor event hook.
     * @param {DragEvent} event DOM event that triggered this editor interaction.
     * @param {import("prosemirror-model").Slice} slice Editor content fragment supplied with the drop event.
     * @param {boolean} moved Whether the drop relocates content already inside this document.
     * @returns {boolean} Whether the application must handle the dropped local files.
     * @example
     * handleDrop(view, fileEvent, slice, false) // true when local files are present.
     */
    handleDrop(view, event, slice, moved) {
      if (!moved && event.dataTransfer?.files.length) return true;
      return false;
    },
    /**
     * Import a raster image from the clipboard.
     *
     * The first clipboard image is passed to the same validation and insertion flow used by the image picker.
     * @param {import("prosemirror-view").EditorView} view Current editor view supplied by the editor event hook.
     * @param {ClipboardEvent} event DOM event that triggered this editor interaction.
     * @returns {boolean} Whether an image was handled by the local embedding flow.
     * @example
     * handlePaste(view, imagePasteEvent) // true when an image is handled.
     */
    handlePaste(view, event) {
      /** First supported clipboard image selected for local embedding. */
      const image = [...(event.clipboardData?.files || [])].find(
        /**
         * Select a clipboard image file.
         *
         * The predicate recognises image media types before the local embedding flow validates the exact supported format.
         * @param {File} f Clipboard file inspected for an image media type.
         * @returns {boolean} Whether an image was handled by the local embedding flow.
         * @example
         * isClipboardImage(imageFile) // true
         */
        (f) => f.type.startsWith("image/"),
      );
      if (image) {
        addImage(image);
        return true;
      }
      return false;
    },
    handleDOMEvents: {
      /**
       * Mark the start of IME composition.
       *
       * Recovery writes wait until Korean or other IME text composition has completed.
       * @returns {false} False so the editor continues its normal composition handling.
       * @example
       * compositionstart() // Marks composition active and returns false.
       */
      compositionstart() {
        state.composing = true;
        return false;
      },
      /**
       * Resume updates after IME composition.
       *
       * A deferred refresh lets the editor commit composed characters before computing document state.
       * @returns {false} False so the editor commits the composed text normally.
       * @example
       * compositionend() // Schedules a refresh and returns false.
       */
      compositionend() {
        state.composing = false;
        setTimeout(update, 0);
        return false;
      },
    },
  },

  /**
   * Refresh status and recovery after a committed edit.
   *
   * Initial editor construction is ignored; subsequent edits update the interface and schedule a recovery revision.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * onUpdate() // Refreshes the edited document and queues recovery.
   */
  onUpdate: () => {
    if (!initial) {
      update();
      scheduleRecovery();
    }
  },

  /**
   * Refresh formatting controls after the selection changes.
   *
   * The update reflects the active marks and block properties without scheduling an unnecessary recovery write.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * onSelectionUpdate() // Updates selection-dependent toolbar controls.
   */
  onSelectionUpdate: () => {
    if (!initial) updateToolbar();
  },
});
editor.commands.setFontFamily("함초롬바탕");
editor.commands.setFontSize("10pt");
/** Editable native quick spacing preserves the actual editor selection and one-step history. */
const lineSpacing=new NativeLineSpacing($('.native-line-spacing'),{
  /**
   * Apply line spacing to all selected text blocks in one editor transaction.
   *
   * Mixed heading/body selections must not leave one block type unchanged.
   * @param {string} value - Validated native proportional or point line spacing.
   * @returns {void} Applies the requested spacing without changing character formatting.
   * @example
   * apply('1.75'); // Applies 175% to selected paragraphs and headings.
   */
  apply(value:string):void{editor.chain().updateAttributes('paragraph',{lineHeight:value}).updateAttributes('heading',{lineHeight:value}).run();},
  /**
   * Restore the saved document selection after quick-field completion.
   *
   * Native formatting owns only focus, not an unrelated editor position.
   * @returns {void} Focuses the actual document view.
   * @example
   * focus();
   */
  focus():void{editor.view.focus();},
});
initial = false;
/**
 * Capture the editable revision as a stable string.
 *
 * Dirty-state checks compare text structure, page geometry and title against the saved revision.
 * @param {object} doc Editable document tree for this revision.
 * @param {PageSettings} page Physical page dimensions and margins in millimetres.
 * @param {string} title Document or dialog title presented to the user.
 * @returns {string} Stable JSON representation of content, geometry and title.
 * @example
 * snapshot(editor.getJSON(), state.page, state.title) // A JSON revision string.
 */
function snapshot(
  doc = editor.getJSON(),
  page = state.page,
  title = state.title,
) {
  return JSON.stringify({ doc, page, title });
}
saved = snapshot();
/**
 * Build the native document and recovery payload.
 *
 * The payload includes editable content, page geometry, retained source data and the save timestamp.
 * @param {object} doc Editable document tree for this revision.
 * @param {PageSettings} page Physical page dimensions and margins in millimetres.
 * @param {string} title Document or dialog title presented to the user.
 * @returns {DocumentPayload} Complete native document payload with source retention and timestamp.
 * @example
 * pack().application // "forhan"
 */
function pack(
  doc = editor.getJSON(),
  page = state.page,
  title = state.title,
): DocumentPayload {
  return {
    application: "forhan",
    version: 1,
    title,
    doc,
    page,
    source: state.source,
    original: state.original,
    format: state.format,
    warnings: state.warnings,
    updatedAt: new Date().toISOString(),
  };
}
/**
 * Synchronise the unsaved-change indicator.
 *
 * The desktop close guard, document title and save-status control reflect the same revision state.
 * @param {boolean} value Whether the document contains an unsaved revision.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * setDirty(true) // Marks the document as having unsaved changes.
 */
function setDirty(value: boolean): void {
  state.dirty = value;
  native?.setDirty(value);
  $("#save-state").innerHTML =
    `${i(value ? "file-text" : "check")}${value ? "저장되지 않은 변경" : "저장됨"}`;
  $("#save-state").classList.toggle("unsaved", value);
  document.title = `${value ? "● " : ""}${state.title} — 포한`;
  icons();
}
/**
 * Refresh document status after an edit.
 *
 * The refresh recomputes dirty state, character and word counts, the outline and toolbar selection state.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * update() // Refreshes the active document controls.
 */
function update() {
  setDirty(snapshot() !== saved);
  /** Plain document text used for counts or search positions. */
  const text = editor.getText();
  $("#word-count").textContent =
    `${Array.from(text.replace(/\n/g, "")).length.toLocaleString()}글자`;
  $("#format-badge").textContent = state.format === "forhan" ? "FHN" : state.format.toUpperCase();
  $("#file-breadcrumb").textContent = state.title;
  updateOutline();
  updateToolbar();
}
/**
 * Reflect the current editor selection in toolbar controls.
 *
 * Mark, alignment, history and font controls update without overwriting a toolbar field while the user edits it.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * updateToolbar() // Shows the active selection formatting.
 */
function updateToolbar() {
  lineSpacing.synchronize(selectionLineSpacing(editor),fixedLineSpacingMaximum(state.page));
  synchronizeFormatRibbon(editor);
  document
    .querySelectorAll<HTMLElement>(
      '.native-ribbon [data-native-action="portrait"],.native-ribbon [data-native-action="landscape"]',
    )
    .forEach(
      /**
       * Match the native orientation tile to the document's physical paper dimensions.
       *
       * The ribbon can be rebuilt when tabs change, so its selected tile follows
       * live paper geometry rather than the captured blank-document default.
       *
       * @param {HTMLElement} tile - Portrait or landscape ribbon command.
       * @returns {void} Updates its native selected state.
       * @example
       * // A landscape document selects 가로 when the editing ribbon is reopened.
       */
      (tile) => {
        /** Whether this tile describes the current paper orientation. */
        const selected =
          tile.dataset.nativeAction ===
          (state.page.width <= state.page.height ? "portrait" : "landscape");
        tile.classList.toggle("active", selected);
        tile.setAttribute("aria-pressed", String(selected));
      },
    );
  for (/** Current mark entry from the surrounding control, layout or document iteration. */
  const mark of ["bold", "italic", "underline", "strike"]) {
    $("#" + mark).classList.toggle("active", editor.isActive(mark));
    $("#" + mark).setAttribute("aria-pressed", String(editor.isActive(mark)));
  }
  for (
    /** Every native alignment has independent live selection state in quick and ribbon controls. */
    const align of PARAGRAPH_ALIGNMENTS
  ) {
    for (
      /** Quick and rebuilt ribbon controls expose the same canonical alignment command. */
      const button of document.querySelectorAll<HTMLElement>(`#align-${align},[data-native-action="align-${align}"]`)
    ) {
      button.classList.toggle('active', editor.isActive({ textAlign: align }));
      button.setAttribute('aria-pressed', String(editor.isActive({ textAlign: align })));
    }
  }
  $("#bullet-list").classList.toggle("active", editor.isActive("bulletList"));
  $("#ordered-list").classList.toggle("active", editor.isActive("orderedList"));
  $("#undo").disabled = !editor.can().undo();
  $("#redo").disabled = !editor.can().redo();
  for (/** Ribbon command whose availability follows the current selection and history. */
  const control of document.querySelectorAll<HTMLButtonElement>(
    ".native-ribbon button[data-native-action]",
  )) {
    /** Live availability without overriding unrelated captured control states. */
    const disabled = nativeCommandDisabled(control.dataset.nativeAction || "");
    if (disabled !== undefined) control.disabled = disabled;
  }
  if (document.activeElement?.closest(".toolbar")) return;
  /** Formatting attributes at the current editor selection. */
  const attrs = editor.getAttributes("textStyle");
  if (
    attrs.fontFamily &&
    !Array.from($("#font-family").options).some(
      /**
       * Detect an imported font already present in the native font selector.
       *
       * Document font names remain visible even when they were not among the
       * platform's initial common-font choices.
       *
       * @param {HTMLOptionElement} option - Existing native font option.
       * @returns {boolean} Whether the option represents the imported font.
       * @example
       * // A document's 한컴바탕 font remains selected instead of becoming blank.
       */
      (option) => option.value === attrs.fontFamily,
    )
  )
    $("#font-family").add(
      new Option(String(attrs.fontFamily), String(attrs.fontFamily)),
    );
  $("#font-family").value = attrs.fontFamily || "";
  /** Active heading level used by the paragraph-style control. */
  const level = editor.getAttributes("heading").level;
  $("#block-style").value = level ? String(level) : "paragraph";
}
/**
 * Rebuild navigation from document headings.
 *
 * Heading positions remain editor positions so selecting an outline item navigates to the corresponding text.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * updateOutline() // Renders one navigation entry per heading.
 */
function updateOutline() {
  /** Document headings and their editor positions for outline navigation. */
  const headings: { text: string; level: number; pos: number }[] = [];
  editor.state.doc.descendants(
    /**
     * Collect a document heading and its navigation position.
     *
     * Heading levels, visible text and editor positions are kept together so outline clicks select the correct document location.
     * @param {import("prosemirror-model").Node} node Editor document node currently being inspected or rendered.
     * @param {number} pos Editor position at the start of the inspected node.
     * @returns {void} Completes this editor update without returning a value.
     * @example
     * headingCallback(heading, position) // Adds or renders the corresponding outline entry.
     */
    (node, pos) => {
      if (node.type.name === "heading")
        headings.push({ text: node.textContent, level: node.attrs.level, pos });
    },
  );
  $("#outline-list").innerHTML = headings.length
    ? headings
        .map(
          /**
           * Navigate to the heading selected in the document outline.
           *
           * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
           * @param {{ text: string; level: number; pos: number; }} h Heading descriptor containing its text, level and navigation position.
           * @param {number} idx Zero-based position of this item in its rendered collection.
           * @returns {string} HTML or text representing the described document entry.
           * @example
           * handler(event) // Performs the action associated with this control.
           */
          (h, idx) =>
            `<button data-heading="${h.pos}" class="outline-item level-${h.level} ${idx === 0 ? "current" : ""}"><span>${idx + 1 < 10 ? "0" : ""}${idx + 1}</span>${escape(h.text || "제목 없음")}</button>`,
        )
        .join("")
    : '<p class="outline-empty">아직 제목이 없습니다.</p>';
}
/**
 * Apply physical page geometry and display zoom.
 *
 * Paper dimensions, margins, ruler width and the orientation label use the current validated page settings.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * applyPage() // Updates the paper and ruler without editing document text.
 */
function applyPage() {
  /** Current physical page geometry in millimetres. */
  const p = state.page;
  if (nativeFit?.mode()) $("#paper").dataset.nativeFit = nativeFit.mode()!;
  else delete $("#paper").dataset.nativeFit;
  /** Original custom and fit screenshots paint at whole device DPI while controls retain integer percentages. */
  const scale = Math.round(state.zoom * 96 / 100) / 96;
  if(p.lineGrid)$('#paper').dataset.forhanLineGrid=String(p.lineGrid);
  else delete $('#paper').dataset.forhanLineGrid;
  $("#paper").style.cssText =
    `--page-width:${p.width}mm;--page-height:${p.height}mm;--margin-top:${p.marginTop + (p.header ?? 0)}mm;--margin-bottom:${p.marginBottom + (p.footer ?? 0)}mm;--margin-left:${p.marginLeft}mm;--margin-right:${p.marginRight}mm;zoom:${scale}`;
  $(".ruler").style.width = `${p.width * scale}mm`;
  $(".ruler").innerHTML = renderNativeRuler(
    p.width,
    p.marginLeft,
    p.marginRight,
  );
  $(".workspace").style.setProperty("--native-zoom", String(scale));
  $(".workspace").style.setProperty("--native-zoom-percent", String(state.zoom));
  $(".workspace").style.setProperty(
    "--native-body-top",
    `${p.marginTop + (p.header ?? 0)}mm`,
  );
  $("#zoom-slider").value = String(zoomToSlider(state.zoom));
  nativeFit?.refresh();
  $("#page-label").textContent =
    `${Math.abs(p.width - 210) < 1 && Math.abs(p.height - 297) < 1 ? "A4" : `${Math.round(p.width)} × ${Math.round(p.height)} mm`} · ${p.width > p.height ? "가로" : "세로"}`;
}
/**
 * Display a temporary operation result.
 *
 * Errors remain visible longer, and each new message replaces the previous dismissal timer.
 * @param {string} message Named collection entry supplied to this document operation.
 * @param {boolean} error Failure thrown by a local file, document validation or desktop operation.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * toast("Saved") // Shows a short success message.
 */
function toast(message: string, error = false): void {
  $("#toast").textContent = message;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    /**
     * Hide the completed status message.
     *
     * The dismissal timer only removes the toast visibility after its success or error interval expires.
     * @returns {void} Completes this editor update without returning a value.
     * @example
     * dismissToast() // Hides the notification.
     */
    () => {
      $("#toast").hidden = true;
    },
    error ? 9000 : 3500,
  );
}
/**
 * Show the current import compatibility notice.
 *
 * The first warning is displayed with a count of remaining details that the document information dialog can reveal.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * showNotice() // Hides the notice when there are no import warnings.
 */
function showNotice() {
  /** DOM control currently being rendered or bound to an editor action. */
  const el = $("#notice");
  el.hidden = !state.warnings.length;
  if (!el.hidden)
    el.innerHTML = `${i("shield-check")}<span>${escape(state.warnings[0])}${state.warnings.length > 1 ? ` 외 ${state.warnings.length - 1}건` : ""}</span><button id="notice-details">자세히</button>`;
  icons();
}
type BridgeValue<K extends keyof AsyncBridge> =
  Awaited<ReturnType<AsyncBridge[K]>> extends BridgeResult<infer V> ? V : never;
/**
 * Invoke an allowed desktop capability.
 *
 * Bridge method names determine argument and result types, and unsuccessful desktop results become errors for the calling flow.
 * @param {K} method Allowed desktop capability to invoke through the isolated bridge.
 * @param {Parameters<AsyncBridge[K]>} ...args Arguments matching the selected desktop capability.
 * @returns {Promise<BridgeValue<K>>} The successful result of the selected typed desktop capability.
 * @throws {Error} If the desktop bridge is absent or the selected capability returns a failure.
 * @example
 * await invoke("recent") // The recent-document metadata returned by the desktop host.
 */
async function invoke<K extends keyof AsyncBridge>(
  method: K,
  ...args: Parameters<AsyncBridge[K]>
): Promise<BridgeValue<K>> {
  if (!native) throw new Error("Desktop bridge is unavailable.");
  /** Typed bridge capability selected from the allowed desktop API. */
  const fn = native[method] as (
    ...params: Parameters<AsyncBridge[K]>
  ) => Promise<BridgeResult<BridgeValue<K>>>;
  /** Explicit operation result used to decide whether the current flow may continue. */
  const result = await fn(...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
/**
 * Debounce saving a recovery revision.
 *
 * Recovery waits for IME composition to finish and stores the complete native payload through the desktop bridge or local storage.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * scheduleRecovery() // Saves the latest revision after the debounce interval.
 */
function scheduleRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(
    /**
     * Write the latest recovery revision after the debounce.
     *
     * An active IME composition defers this write; otherwise the current payload is stored locally and storage failures are shown.
     * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
     * @example
     * saveRecovery() // Persists the latest complete document payload.
     */
    async () => {
      if (state.composing) return scheduleRecovery();
      try {
        /** Complete document payload captured for recovery or local import. */
        const payload = pack();
        if (native) await invoke("recover", payload);
        else localStorage.setItem("forhan.recovery", JSON.stringify(payload));
      } catch {
        toast(
          "자동 복구본을 저장하지 못했습니다. 문서를 직접 저장해 주세요.",
          true,
        );
      }
    },
    800,
  );
}
/**
 * Remove the stored recovery revision.
 *
 * Pending writes are cancelled before clearing desktop or browser recovery storage.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await clearRecovery() // Removes the previous automatic recovery copy.
 */
async function clearRecovery() {
  clearTimeout(recoveryTimer);
  if (native) await invoke("clearRecovery");
  else localStorage.removeItem("forhan.recovery");
}
interface ModalAction {
  label: string;
  value: string;
  primary?: boolean;
}
/**
 * Present a focus-trapped application dialog.
 *
 * The promise resolves only after an explicit dialog action, while dismissal restores focus to the previous control.
 * @param {string} title Document or dialog title presented to the user.
 * @param {string} body Application-authored HTML used for the dialog body.
 * @param {ModalAction[]} actions Explicit user choices rendered by the dialog.
 * @param {NativeDialogMarkup} [layout] Measured native dialog contents and outer dimensions.
 * @returns {Promise<string>} A promise resolving to the explicitly chosen dialog action value.
 * @example
 * await modal("Information", "<p>Details</p>") // Resolves to the selected action value.
 */
function modal(
  title: string,
  body: string,
  actions: ModalAction[] = [{ label: "닫기", value: "close" }],
  layout?: NativeDialogMarkup,
): Promise<string> {
  return new Promise<string>(
    /**
     * Create and bind the modal dialog controls.
     *
     * The dialog controls preserve explicit choice values and restore prior focus when the dialog closes.
     * @param {(value: string | PromiseLike<string>) => void} resolve Promise continuation receiving the completed local operation result.
     * @returns {void} Binds the dialog controls and settles through the selected action.
     * @example
     * dialogCallback() // Handles the corresponding explicit dialog choice.
     */
    (resolve) => {
      /** Control that held focus before the application dialog opened. */
      const prior = document.activeElement as HTMLElement | null;
      $("#modal-root").innerHTML =
        `<div class="modal-shade"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${escape(title)}</h2><button class="modal-x" aria-label="닫기">${i("x")}</button></div><div class="modal-body">${body}</div><div class="modal-actions">${actions
          .map(
            /**
             * Render or bind an explicit dialog action.
             *
             * The dialog controls preserve explicit choice values and restore prior focus when the dialog closes.
             * @param {ModalAction} a Dialog action or template entry currently being rendered.
             * @param {number} idx Zero-based position of this item in its rendered collection.
             * @returns {string} A promise resolving to the explicitly chosen dialog action value.
             * @example
             * dialogCallback() // Handles the corresponding explicit dialog choice.
             */
            (a, idx) =>
              `<button class="button ${a.primary ? "primary" : "secondary"}" data-modal-value="${escape(a.value)}" ${idx === actions.length - 1 ? "autofocus" : ""}>${escape(a.label)}</button>`,
          )
          .join("")}</div></section></div>`;
      if (layout)
        $("#modal-root").innerHTML =
          `<div class="modal-shade native-dialog-shade"><section class="modal ${layout.className}" role="dialog" aria-modal="true" aria-labelledby="modal-title" style="--native-dialog-width:${layout.width}px;--native-dialog-height:${layout.height}px;width:${layout.width}px;height:${layout.height}px">${layout.html}</section></div>`;
      icons();
      /**
       * Close the dialog with an explicit result.
       *
       * Keyboard trapping is removed, prior focus is restored and the waiting dialog promise resolves once.
       * @param {string} value Document payload, action or explicit choice consumed by this operation.
       * @returns {void} Completes this editor update without returning a value.
       * @example
       * finish("cancel") // Closes the dialog with the cancel result.
       */
      const finish = (value: string): void => {
        document.removeEventListener("keydown", trap);
        $("#modal-root").innerHTML = "";
        if(prior===editor.view.dom)editor.view.focus();
        else prior?.focus();
        resolve(value);
      };
      /**
       * Keep keyboard focus within the active dialog.
       *
       * Tab wraps between dialog controls, and Escape resolves the dialog as cancelled.
       * @param {KeyboardEvent} event DOM event that triggered this editor interaction.
       * @returns {void} Completes this editor update without returning a value.
       * @example
       * trap(tabEvent) // Wraps focus when the last dialog control is active.
       */
      function trap(event: KeyboardEvent): void {
        if(event.isComposing||event.keyCode===229)return;
        if (event.key === "Escape") {
          event.preventDefault();
          finish("cancel");
        }
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLInputElement &&
          event.target.type !== "checkbox" &&
          event.target.type !== "radio"
        ) {
          event.preventDefault();
          $(".modal")
            .querySelector<HTMLButtonElement>('[data-modal-value="apply"]')
            ?.click();
        }
        if (event.key === "Tab") {
          /** Dialog controls available for keyboard focus trapping. */
          const focusable = [
            ...$(".modal").querySelectorAll<HTMLElement>("button,input,select"),
          ].filter(
            /**
             * Keep disabled or hidden native controls outside the dialog focus loop.
             *
             * Read-only visible inputs remain focusable, while disabled advanced
             * controls and hidden compatibility buttons cannot trap keyboard focus.
             *
             * @param {HTMLElement} control - One dialog focus candidate.
             * @returns {boolean} Whether the control can receive keyboard focus.
             * @example
             * // A hidden Letter preset is excluded from native dialog tab order.
             */
            (control) =>
              !control.matches(":disabled") &&
              control.tabIndex >= 0 &&
              control.getClientRects().length > 0,
          );
          /** First focusable control in the active dialog. Last focusable control in the active dialog. */
          const first = focusable[0],
            last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }
      document.addEventListener("keydown", trap);
      $(".modal-x").onclick =
        /**
         * Dismiss the dialog with a cancelled result.
         *
         * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
         * @returns {void} A promise resolving to the explicitly chosen dialog action value.
         * @example
         * handler(event) // Performs the action associated with this control.
         */
        () => finish("cancel");
      $(".modal-shade").onclick =
        /**
         * Dismiss the dialog only when its backdrop receives the click.
         *
         * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
         * @param {PointerEvent} e DOM event raised by the bound application control.
         * @returns {void} A promise resolving to the explicitly chosen dialog action value.
         * @example
         * handler(event) // Performs the action associated with this control.
         */
        (e) => {
          if (!layout && e.target === e.currentTarget) finish("cancel");
        };
      document
        .querySelectorAll<HTMLButtonElement>("[data-modal-value]")
        .forEach(
          /**
           * Resolve the dialog action selected by the user.
           *
           * The dialog controls preserve explicit choice values and restore prior focus when the dialog closes.
           * @param {HTMLButtonElement} el Rendered control or detached HTML element being processed.
           * @returns {void} A promise resolving to the explicitly chosen dialog action value.
           * @example
           * dialogCallback() // Handles the corresponding explicit dialog choice.
           */
          (el) => {
            el.onclick =
              /**
               * Resolve the dialog action selected by the user.
               *
               * The dialog controls preserve explicit choice values and restore prior focus when the dialog closes.
               * @returns {void} A promise resolving to the explicitly chosen dialog action value.
               * @example
               * dialogCallback() // Handles the corresponding explicit dialog choice.
               */
              () => {
                /** Editable dialog form whose invalid draft must remain visible. */
                const form = $(".modal").querySelector<HTMLFormElement>("form");
                if (
                  el.dataset.modalValue === "apply" &&
                  form &&
                  !form.reportValidity()
                )
                  return;
                finish(el.dataset.modalValue!);
              };
          },
        );
      $(".modal")
        .querySelector<HTMLElement>('[autofocus],[data-modal-value="apply"]')
        ?.focus();
    },
  );
}
/**
 * Resolve unsaved changes before changing documents.
 *
 * A save must succeed before navigation continues; cancellation keeps the current document open.
 * @returns {Promise<boolean>} A promise resolving to whether saving or explicit discard permits navigation.
 * @example
 * await canLeave() // true after a successful save or explicit discard.
 */
async function canLeave() {
  if (!state.dirty) return true;
  /** Explicit operation result used to decide whether the current flow may continue. */
  const result = await modal(
    "변경 내용을 저장할까요?",
    "<p>저장하지 않은 변경 내용이 있습니다. 문서를 바꾸기 전에 저장할 수 있습니다.</p>",
    [
      { label: "취소", value: "cancel" },
      { label: "저장 안 함", value: "discard" },
      { label: "저장", value: "save", primary: true },
    ],
  );
  if (result === "save") return saveDocument();
  return result === "discard";
}
/**
 * Validate a document against editor structure rules.
 *
 * The application validator runs before the editor schema check so malformed imports cannot replace the active document.
 * @param {JSONContent} doc Editable document tree for this revision.
 * @returns {void} Completes this editor update without returning a value.
 * @throws {Error} If the imported tree violates application or editor-schema rules.
 * @example
 * checkSchema({ type: "doc", content: [{ type: "paragraph" }] }) // Returns for a valid document.
 */
function checkSchema(doc: JSONContent): void {
  validateDocument(doc);
  editor.schema.nodeFromJSON(doc).check();
}
/**
 * Replace the active document after validation.
 *
 * Content and page geometry validate before editor state, import notices and recovery status are changed.
 * @param {DocumentPayload} value Parsed document payload with editable content and retained source data.
 * @param {boolean} recovered Whether the payload is an unsaved recovery revision.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @throws {Error} If the document tree, page geometry or recovery-storage update fails.
 * @example
 * await loadDocument(payload) // Opens the validated document.
 */
async function loadDocument(
  value: DocumentPayload,
  recovered = false,
): Promise<void> {
  checkSchema(value.doc);
  /** Validated or captured page geometry for this document revision. */
  const page = validatePage(value.page);
  lineSpacing.cancelDraft();
  editor.commands.setContent(value.doc, {
    emitUpdate: false,
    errorOnInvalidContent: true,
  });
  editor.view.updateState(
    EditorState.create({
      schema: editor.schema,
      doc: editor.state.doc,
      plugins: editor.state.plugins,
    }),
  );
  if (!$("#find-panel").hidden) findMatches(false);
  Object.assign(state, {
    title: String(value.title || "제목 없는 문서").slice(0, 180),
    page,
    format: value.format || "forhan",
    source: value.source || null,
    original: value.original || null,
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
  });
  /** Number of source objects retained outside the editable document model. */
  let preservedObjects = 0;
  editor.state.doc.descendants(
    /**
     * Count retained source objects whose visual representation is simplified.
     *
     * Original bytes remain attached to the document, while this count informs
     * the user that screen and PDF output cannot reproduce every source object.
     *
     * @param {import('@tiptap/pm/model').Node} node - The current document descendant.
     * @returns {void} Increments the count for a retained opaque object.
     * @example
     * // A retained equation contributes one object to the visible document notice.
     */
    (node) => {
      if (node.type.name === "preservedBlock") preservedObjects++;
    },
  );
  if (
    preservedObjects &&
    !state.warnings.some(
      /**
       * Detect a previously stored retained-object notice.
       *
       * Avoids adding duplicate notices when a portable document is reopened.
       *
       * @param {string} warning - Existing document compatibility notice.
       * @returns {boolean} Whether the notice already describes retained objects.
       * @example
       * // A notice beginning with "[개체 보존]" is already present.
       */
      (warning) => warning.startsWith("[개체 보존]"),
    )
  ) {
    state.warnings.push(
      `[개체 보존] ${preservedObjects}개 개체의 원본을 보관했습니다. 화면과 PDF의 개체 표현은 원본과 다를 수 있습니다.`,
    );
  }
  native?.resetDocument();
  $("#document-title").value = state.title;
  saved = recovered ? "" : snapshot();
  applyPage();
  update();
  showNotice();
  $(".canvas").scrollTop = 0;
  if (!recovered) await clearRecovery();
}
/**
 * Start a document from an independent template.
 *
 * The current revision is resolved first, then a cloned template receives fresh page settings and editor focus.
 * @param {string} kind Requested starter template or document export format.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await newDocument("blank") // Opens a new empty document.
 */
async function newDocument(kind = "blank") {
  if (state.busy || !(await canLeave())) return;
  await loadDocument({
    ...structuredClone(templates[kind]),
    format: "hwpx",
    page: defaultPage(),
  });
  if (kind === "blank") {
    editor.commands.setFontFamily("함초롬바탕");
    editor.commands.setFontSize("10pt");
  }
  editor.commands.focus("start");
}
/**
 * Parse and open a selected local document.
 *
 * Each supported format is parsed independently before replacing the current document; failures leave the active revision intact.
 * @param {OpenedFile} payload Selected file metadata and local bytes to parse.
 * @param {boolean} ask Whether unsaved changes must be resolved before opening this file.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await importFile({ name: "example.hwp", data: fileBytes }) // Opens a valid local HWP document.
 */
async function importFile(payload: OpenedFile, ask = true): Promise<void> {
  if (state.busy || (ask && !(await canLeave()))) return;
  state.busy = true;
  document.body.classList.add("busy");
  try {
    /** Selected local file name used to determine its import format. Lowercase extension selecting the local document parser. Local input bytes or generated document export bytes. */
    const name = payload.name,
      ext = (name.split(".").pop() || "").toLowerCase(),
      bytes = new Uint8Array(payload.data);
    if (bytes.byteLength > 100 * 1024 * 1024)
      throw new Error("100MB 이하 문서를 열 수 있습니다.");
    /** Explicit operation result used to decide whether the current flow may continue. */
    let result: DocumentPayload;
    if (ext === "hwpx") result = await readHwpx(bytes);
    else if (ext === "hwp") result = await readHwp(bytes);
    else if (ext === "fhn" || ext === "forhan") {
      result = JSON.parse(new TextDecoder().decode(bytes));
      if (result.application !== "forhan" || result.version !== 1)
        throw new Error("지원되지 않는 포한 문서 버전입니다.");
    } else if (ext === "txt")
      result = {
        doc: {
          type: "doc",
          content: new TextDecoder()
            .decode(bytes)
            .replace(/\r/g, "")
            .split("\n")
            .map(
              /**
               * Convert one text-file line into an editable paragraph.
               *
               * Only the filtered document structure enters the editor; parsing finishes before the active document is replaced.
               * @param {string} t One text-file line to wrap in an editable paragraph.
               * @returns {{ type: string; content: { type: string; text: string; }[]; }} Editor content or control data constructed for the operation described above.
               * @example
               * importCallback(input) // Produces or retains permitted local document content.
               */
              (t) => ({
                type: "paragraph",
                content: t ? [{ type: "text", text: t }] : [],
              }),
            ),
        },
      };
    else if (["html", "htm"].includes(ext)) {
      /** Detached HTML document used to filter pasted or imported markup. */
      const parsed = new DOMParser().parseFromString(
        new TextDecoder().decode(bytes),
        "text/html",
      );
      parsed
        .querySelectorAll("script,style,iframe,object,embed,link,meta,[data-forhan-outline-drawing],[data-forhan-hyphen-drawing]")
        .forEach(
          /**
           * Remove unsafe or externally loaded markup from imported HTML.
           *
           * Only the filtered document structure enters the editor; parsing finishes before the active document is replaced.
           * @param {Element} el Rendered control or detached HTML element being processed.
           * @returns {void} Completes this editor update without returning a value.
           * @example
           * importCallback(input) // Produces or retains permitted local document content.
           */
          (el) => el.remove(),
        );
      parsed.querySelectorAll("img").forEach(
        /**
         * Remove unsafe or externally loaded markup from imported HTML.
         *
         * Only the filtered document structure enters the editor; parsing finishes before the active document is replaced.
         * @param {HTMLImageElement} el Rendered control or detached HTML element being processed.
         * @returns {void} Completes this editor update without returning a value.
         * @example
         * importCallback(input) // Produces or retains permitted local document content.
         */
        (el) => {
          if (!el.src.startsWith("data:image/")) el.remove();
        },
      );
      /** Temporary editor that parses filtered HTML without replacing the active document. */
      normalizeHtmlFontSpaces(parsed.body);
      normalizeHtmlDecorations(parsed.body);
      /** Temporary parsing retains each original source style and its space preference. */
      const temp = new Editor({
        extensions: editor.options.extensions,
        content: parsed.body.innerHTML,
      });
      result = { doc: temp.getJSON(),page:{...defaultPage(),...readSectionGridHtml(parsed.body)} };
      temp.destroy();
    } else throw new Error("HWPX, HWP, FHN, TXT, HTML 문서를 선택하세요.");
    result.title ||= name.replace(/\.[^.]+$/, "");
    result.format ||=
      ext === "hwp" ? "hwp" : ext === "fhn" || ext === "forhan" ? "forhan" : "hwpx";
    await loadDocument(result);
    toast(`${name} 문서를 열었습니다.`);
    await refreshRecent();
  } catch (error) {
    await modal(
      "문서를 열지 못했습니다",
      `<p>${escape(errorMessage(error))}</p><p class="muted">현재 편집 중인 문서는 유지됩니다.</p>`,
    );
  } finally {
    state.busy = false;
    document.body.classList.remove("busy");
  }
}
/**
 * Ask the user to select a local document.
 *
 * The desktop picker or browser file input feeds the same import flow after resolving unsaved changes.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await openDocument() // Opens the selected file or leaves the current document unchanged.
 */
async function openDocument() {
  if (state.busy || !(await canLeave())) return;
  try {
    if (native) {
      /** Local file selected from the picker or drag-and-drop payload. */
      const file = await invoke("open");
      if (file) await importFile(file, false);
    } else {
      $("#file-input").value = "";
      $("#file-input").click();
    }
  } catch (error) {
    toast(errorMessage(error), true);
  }
}
/**
 * Download generated bytes in the browser.
 *
 * A temporary object URL delivers the selected export name and is revoked after the download begins.
 * @param {Uint8Array<ArrayBufferLike>} bytes Complete generated file bytes to deliver to the browser.
 * @param {string} filename Suggested file name for the browser download.
 * @param {string} type Media type assigned to the generated download.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * download(new Uint8Array([65]), "example.txt", "text/plain") // Downloads a one-character text file.
 */
function download(
  bytes: Uint8Array,
  filename: string,
  type = "application/octet-stream",
): void {
  /** Temporary object URL used to download generated bytes. */
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  /** Temporary download link carrying the generated file name. */
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(
    /**
     * Release the completed download object URL.
     *
     * The delayed cleanup lets the browser start reading the generated bytes before the temporary URL is revoked.
     * @returns {void} Completes this editor update without returning a value.
     * @example
     * releaseDownload() // Revokes the temporary download URL.
     */
    () => URL.revokeObjectURL(url),
    1000,
  );
}
/**
 * Save or export a captured document revision.
 *
 * The saved baseline uses the captured revision, so edits made during an asynchronous save remain marked unsaved.
 * @param {ExportFormat | undefined} kind Requested starter template or document export format.
 * @param {boolean} saveAs Whether the desktop host must ask for a new output location.
 * @returns {Promise<boolean>} A promise resolving to true only when the requested save or export completes.
 * @example
 * await saveDocument("hwpx") // true when the export completes.
 */
async function saveDocument(
  kind?: ExportFormat,
  saveAs = false,
): Promise<boolean> {
  if (state.busy) return false;
  kind ||= state.format;
  state.busy = true;
  $("#save-document").disabled = true;
  /** Captured editable document tree for a save or export. Validated or captured page geometry for this document revision. Document title captured with the revision being saved. */
  const doc = editor.getJSON(),
    page = { ...state.page },
    title = state.title;
  /** Stable snapshot of the revision whose bytes are being written. */
  const captured = snapshot(doc, page, title);
  try {
    /** Local input bytes or generated document export bytes. */
    let bytes;
    if (kind === "pdf") {
      if (native) {
        /** Explicit operation result used to decide whether the current flow may continue. */
        const result = await invoke("exportPdf", await prepareNativeLayout(editor.getHTML(), page), page, title);
        if (!result) return false;
        toast("PDF 문서를 저장했습니다.");
        return true;
      }
      window.print();
      return true;
    }
    if (kind === "hwpx")
      bytes = await writeHwpx({ doc, page, title, source: state.source });
    else if (kind === "hwp")
      bytes = writeHwp({ doc, page, title, original: state.original });
    else if (kind === "forhan")
      bytes = new TextEncoder().encode(
        JSON.stringify({ ...pack(doc, page, title), format: "forhan" }),
      );
    else if (kind === "txt")
      bytes = new TextEncoder().encode(
        "\ufeff" + editor.getText({ blockSeparator: "\n" }),
      );
    else if (kind === "html") {
      /** One original source revision supplies both asynchronously loaded fonts and physical output layout. */
      const html=editor.getHTML();
      bytes = new TextEncoder().encode(
        `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escape(title)}</title><style>${await portableOutputFontStyles(html)}${documentPageStyles(page)}${documentContentStyles("body")}body{width:${page.width}mm;margin:0 auto;padding:${page.marginTop + (page.header ?? 0)}mm ${page.marginRight}mm ${page.marginBottom + (page.footer ?? 0)}mm ${page.marginLeft}mm}@media print{body{width:auto;margin:0;padding:0}}</style><body data-forhan-native-space-default="0" data-forhan-native-kerning-default="0"${sectionGridHtml(page)}>${await prepareNativeLayout(html, page)}</body></html>`,
      );
    }
    else throw new Error("저장 형식을 확인하세요.");
    /** File-system-safe base name for the selected export format. */
    const base =
      title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "제목 없는 문서";
    /** The stable internal Forhan payload identifier uses the public FHN file extension. */
    const extension = kind === "forhan" ? "fhn" : kind;
    /** Explicit operation result used to decide whether the current flow may continue. */
    let result;
    if (native)
      result = await invoke("save", bytes, base + "." + extension, kind, saveAs);
    else {
      download(bytes, `${base}.${extension}`);
      result = { name: `${base}.${extension}` };
    }
    if (!result) return false;
    if (kind === "hwpx" || kind === "hwp" || kind === "forhan") {
      state.format = kind;
      if (kind === "hwp") state.original = readHwp(bytes).original;
      saved = captured;
      update();
      if (!state.dirty) await clearRecovery();
      await refreshRecent();
    }
    toast(`${result.name} 저장 완료`);
    return true;
  } catch (error) {
    await modal(
      "문서를 저장하지 못했습니다",
      `<p>${escape(errorMessage(error))}</p><p class="muted">편집 내용은 유지됩니다. 포한 문서로 저장하면 원본 데이터도 함께 보관됩니다.</p>`,
    );
    return false;
  } finally {
    state.busy = false;
    $("#save-document").disabled = false;
  }
}
/**
 * Refresh recent-document navigation.
 *
 * The desktop host supplies opaque recent identifiers; browser sessions display an empty list.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await refreshRecent() // Updates the recent-document list.
 */
async function refreshRecent() {
  /** Opaque recent-document entries returned by the desktop host. */
  const items = native ? await invoke("recent") : [];
  $("#recent-list").innerHTML = items.length
    ? items
        .slice(0, 6)
        .map(
          /**
           * Open the selected recent document after resolving unsaved changes.
           *
           * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
           * @param {import("./types").RecentFile} x Recent-file entry or compatibility message being rendered.
           * @returns {string} HTML or text representing the described document entry.
           * @example
           * handler(event) // Performs the action associated with this control.
           */
          (x) =>
            `<button class="recent-item" data-recent="${escape(x.id)}" title="${escape(x.name)}">${i("file-text")}<span>${escape(x.name)}</span></button>`,
        )
        .join("")
    : '<p class="empty-recent">저장한 문서가 여기에 표시됩니다.</p>';
  icons();
}
/**
 * Validate and embed a selected raster image.
 *
 * Supported image files become data URLs after file-type and size checks, then enter the document at the current selection.
 * @param {File} file Local raster image selected for validation and embedding.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await addImage(pngFile) // Inserts a permitted embedded image.
 */
async function addImage(file: File): Promise<void> {
  if (
    !/^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type) ||
    file.size > 20 * 1024 * 1024
  ) {
    toast("20MB 이하의 PNG·JPEG·GIF·WEBP·BMP 그림을 선택하세요.", true);
    return;
  }
  try {
    /** Embedded image data URL read from the selected local file. */
    const src = await new Promise<string>(
      /**
       * Read the selected raster file as an embedded data URL.
       *
       * The image remains local and is inserted only after the file reader supplies its complete result.
       * @param {(value: string | PromiseLike<string>) => void} resolve Promise continuation receiving the completed local operation result.
       * @param {(reason?: any) => void} reject Promise continuation receiving a file-read failure.
       * @returns {void} Completes this editor update without returning a value.
       * @example
       * imageReadCallback() // Resolves the selected embedded image data.
       */
      (resolve, reject) => {
        /** FileReader that converts the selected raster image into an embedded data URL. */
        const reader = new FileReader();
        reader.onload =
          /**
           * Complete the local image read with its data URL.
           *
           * The image remains local and is inserted only after the file reader supplies its complete result.
           * @returns {void} Completes this editor update without returning a value.
           * @example
           * imageReadCallback() // Resolves the selected embedded image data.
           */
          () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      },
    );
    editor.chain().focus().setImage({ src, alt: file.name }).run();
  } catch {
    toast("그림을 읽지 못했습니다.", true);
  }
}
/**
 * Open the native document search dock.
 *
 * Repeated find commands retain the pane and focus the query without moving document selection.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * toggleFind() // Opens and focuses the search dock.
 */
function toggleFind() {
  $("#find-panel").hidden = false;
  document.body.classList.add("find-open");
  document.body.classList.remove("replace-mode");
  $("#native-find-options").hidden = true;
  $("#find-text").focus();
  findMatches(false);
}
/**
 * Locate case-insensitive matches in text blocks.
 *
 * Block-local searches retain editor positions while excluding embedded object payloads from text matching.
 * @param {boolean} select Whether the first search result should become the editor selection.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * findMatches(false) // Updates match positions without selecting a result.
 */
function findMatches(select = true) {
  matches = [];
  /** Case-normalised search query entered in the find panel. */
  const query = $("#find-text").value.toLocaleLowerCase();
  if (query)
    editor.state.doc.descendants(
      /**
       * Collect case-insensitive matches from one text block.
       *
       * Search offsets are converted to editor positions and stop descending after the text block is searched.
       * @param {import("prosemirror-model").Node} node Editor document node currently being inspected or rendered.
       * @param {number} pos Editor position at the start of the inspected node.
       * @returns {false | undefined} Editor content or control data constructed for the operation described above.
       * @example
       * searchBlock(node, position) // Records matches contained in the current block.
       */
      (node, pos) => {
        if (!node.isTextblock) return;
        /** Plain document text used for counts or search positions. */
        const text = node
          .textBetween(0, node.content.size, "", "\ufffc")
          .toLocaleLowerCase();
        /** Current search offset inside one text block. */
        let at = 0;
        while ((at = text.indexOf(query, at)) !== -1) {
          matches.push({ from: pos + 1 + at, to: pos + 1 + at + query.length });
          at += query.length;
        }
        return false;
      },
    );
  searchIndex = matches.length ? 0 : -1;
  updateSearchCount();
  if (select && matches.length) selectMatch();
}
/**
 * Display the active search result index.
 *
 * The counter shows the selected match and total, or an empty result count.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * updateSearchCount() // Refreshes the find-result count.
 */
function updateSearchCount() {
  $("#find-panel").classList.toggle(
    "has-query",
    Boolean($("#find-text").value),
  );
  $("#find-count").hidden = !$("#find-text").value;
  $("#find-count").textContent = matches.length
    ? `${searchIndex + 1} / ${matches.length}`
    : "0개";
  /** Persistent result list populated with safe document-text snippets. */
  const results = $("#native-find-results");
  results.replaceChildren();
  for (
    /** Document-order index of the search hit represented by a button. */
    let index = 0;
    index < matches.length;
    index++
  ) {
    /** Current hit range used for navigation and snippet highlighting. */
    const match = matches[index]!;
    /** Resolved hit position locating its containing paragraph. */
    const position = editor.state.doc.resolve(match.from);
    /** Hit offset within its text block. */
    const offset = position.parentOffset;
    /** Paragraph text with embedded objects represented by one character. */
    const text = position.parent.textBetween(
      0,
      position.parent.content.size,
      "",
      "\ufffc",
    );
    /** Start of the context preceding the search hit. */
    const start = Math.max(0, offset - 24);
    /** End of the context following the search hit. */
    const end = Math.min(text.length, offset + match.to - match.from + 48);
    /** Result button preserving the current document-order index. */
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.dataset.findIndex = String(index);
    button.classList.toggle("active", index === searchIndex);
    button.setAttribute(
      "aria-current",
      index === searchIndex ? "true" : "false",
    );
    button.append((start ? "…" : "") + text.slice(start, offset));
    /** Highlight containing plain query text rather than parsed document markup. */
    const highlight = document.createElement("mark");
    highlight.textContent = text.slice(offset, offset + match.to - match.from);
    button.append(
      highlight,
      text.slice(offset + match.to - match.from, end) +
        (end < text.length ? "…" : ""),
    );
    results.append(button);
  }
}
/**
 * Select and reveal the current search match.
 *
 * Valid match positions update the editor selection and scroll into view before refreshing the counter.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * selectMatch() // Navigates to the current result when it exists.
 */
function selectMatch() {
  /** Search match selected for navigation or replacement. */
  const match = matches[searchIndex];
  if (match) {
    editor.commands.setTextSelection(match);
    editor.commands.scrollIntoView();
    updateSearchCount();
  }
}
/**
 * Toggle a menu near its anchor control.
 *
 * Horizontal placement stays inside the viewport while the menu appears below the triggering button.
 * @param {HTMLElement} menu Popup menu to position and toggle.
 * @param {HTMLElement} anchor Control whose bounds anchor the popup menu.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * positionMenu(menuElement, buttonElement) // Toggles the anchored menu.
 */
function positionMenu(menu: HTMLElement, anchor: HTMLElement): void {
  /** Anchor bounds used to keep a popup menu inside the viewport. */
  const rect = anchor.getBoundingClientRect();
  if (menu.id === "table-menu") {
    menu.style.left = Math.max(0, Math.min(innerWidth - 251, rect.left)) + "px";
    menu.style.top =
      Math.max(0, Math.min(innerHeight - 426, rect.bottom + 2)) + "px";
    menu.hidden = !menu.hidden;
    return;
  }
  menu.style.left =
    Math.max(8, Math.min(innerWidth - 290, rect.right - 260)) + "px";
  menu.style.top = rect.bottom + 8 + "px";
  menu.hidden = !menu.hidden;
}
/**
 * Clamp and apply the paper display scale.
 *
 * Zoom updates the range control and display label, then reapplies paper dimensions without altering document content.
 * @param {string | number} value Requested display zoom percentage.
 * @param {boolean} [preserveFit=false] - Whether a derived fit update retains its selected view mode.
 * @returns {void} Completes this editor update without returning a value.
 * @example
 * setZoom(100) // Displays the paper at 100 percent.
 */
function setZoom(value: string | number, preserveFit = false): void {
  /** Finite display zoom requested by a toolbar, dialog or native view command. */
  const requested = Number(value);
  if (!Number.isFinite(requested)) return;
  if (!preserveFit) nativeFit?.cancel();
  state.zoom = Math.max(10, Math.min(500, requested));
  $("#zoom-slider").value = String(zoomToSlider(state.zoom));
  $("#zoom-reset").textContent = nativeFit?.mode() === "width" ? "폭 맞춤" : nativeFit?.mode() === "page" ? "쪽 맞춤" : state.zoom + "%";
  applyPage();
}

/**
 * Map display zoom onto the native slider's two linear half-ranges.
 *
 * The installed application's UIA reports position 270.3125 at 125%: 100%
 * occupies the midpoint, with 10–100% on the left and 100–500% on the right.
 *
 * @param {number} zoom - Display scale in percent.
 * @returns {number} Native slider position in its observed 10–500 coordinate range.
 * @example
 * zoomToSlider(125); // 270.3125
 */
function zoomToSlider(zoom: number): number {
  return zoom <= 100
    ? 10 + ((zoom - 10) / 90) * 245
    : 255 + ((zoom - 100) / 400) * 245;
}

/**
 * Convert a native slider position back to an integer document zoom.
 *
 * Uses the same midpoint mapping as the visible native slider rather than
 * treating its accessibility range value as a direct percentage.
 *
 * @param {number} position - Current native slider coordinate.
 * @returns {number} Display zoom rounded to the nearest whole percent.
 * @example
 * sliderToZoom(270.3125); // 125
 */
function sliderToZoom(position: number): number {
  return Math.round(
    position <= 255
      ? 10 + ((position - 10) / 245) * 90
      : 100 + ((position - 255) / 245) * 400,
  );
}

/**
 * Open the original measured native zoom, page arrangement and scrolling choices.
 *
 * An independent draft retains custom input, fixed percentages, fitting, page
 * groups and scrolling direction. Explicit application changes only the view;
 * cancellation leaves authored content, physical settings and history intact.
 *
 * @async
 * @returns {Promise<void>} Resolves after the user applies or cancels a zoom change.
 * @example
 * await zoomSettings();
 */
async function zoomSettings(): Promise<void> {
  /** The current visible percentage and selected fit mode seed an independent native dialog draft. */
  const current=String(state.zoom),draft:NativeZoomDraft={
    choice:nativeFit?.mode()??((NATIVE_ZOOM_PRESETS as readonly string[]).includes(current)?current as NativeZoomChoice:'custom'),
    zoom:state.zoom,view:readNativePageView($('#paper')),
  };
  /** Shared modal teardown retains focus and cancellation without applying an isolated view draft. */
  const decision=modal('확대/축소','',[],renderNativeZoomDialog(draft)),binding=bindNativeZoomDialog($('.native-dialog-zoom'),draft);
  /** The binding retains actual input before the shared modal removes its controls. */
  const choice=await decision,accepted=binding.read();binding.destroy();
  if(choice!=='apply')return;
  setNativePageView($('#paper'),accepted.view);
  if(accepted.choice==='width'||accepted.choice==='page')nativeFit?.select(accepted.choice);
  else setZoom(accepted.choice==='custom'?accepted.zoom:Number(accepted.choice));
}

/**
 * Edit and validate physical page settings.
 *
 * Preset buttons and millimetre fields update a draft; only the explicit apply action changes the active document.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await pageSettings() // Applies the validated settings selected in the dialog.
 */
async function pageSettings() {
  /** Snapshot of the active document's millimetre page settings. */
  const values: PageSettings = { ...state.page };
  /** Complete measured native paper dialog. */
  const layout = renderNativeDialog("page", { ...values });
  /** Explicit apply or cancel decision from the visible native dialog. */
  const decision = modal(
    "편집 용지",
    "",
    [
      { label: "취소", value: "cancel" },
      { label: "설정(D)", value: "apply", primary: true },
    ],
    layout,
  );
  /**
   * Capture every supported paper dimension before the modal is removed.
   * The draft remains independent from the active document until validation succeeds.
   * @returns {void} Updates the pending page settings.
   * @example capture();
   */
  function capture(): void {
    for (/** Supported physical page setting. */ const key of [
      "width",
      "height",
      "marginTop",
      "marginBottom",
      "marginLeft",
      "marginRight",
      "header",
      "footer",
    ] as const)
      values[key] = Number($<HTMLInputElement>("#page-" + key).value);
  }
  /**
   * Set draft paper edges while retaining the chosen orientation.
   * Preset selection updates visible measurements and captures the same draft used by Apply.
   * @param {number} width Portrait paper width in millimetres.
   * @param {number} height Portrait paper height in millimetres.
   * @returns {void} Updates paper dimensions and orientation tiles.
   * @example setSize(210,297);
   */
  function setSize(width: number, height: number): void {
    /** Whether the current draft uses landscape orientation. */
    const landscape =
      Number($<HTMLInputElement>("#page-width").value) >
      Number($<HTMLInputElement>("#page-height").value);
    $<HTMLInputElement>("#page-width").value = String(
      landscape ? height : width,
    );
    $<HTMLInputElement>("#page-height").value = String(
      landscape ? width : height,
    );
    capture();
  }
  /**
   * Swap the current paper edges into the requested orientation.
   * A Letter or custom page retains its dimensions instead of becoming A4.
   * @param {boolean} landscape Requested paper orientation.
   * @returns {void} Updates the draft orientation.
   * @example orient(true);
   */
  function orient(landscape: boolean): void {
    /** Current paper's shorter edge. */
    const short = Math.min(
      Number($<HTMLInputElement>("#page-width").value),
      Number($<HTMLInputElement>("#page-height").value),
    );
    /** Current paper's longer edge. */
    const long = Math.max(
      Number($<HTMLInputElement>("#page-width").value),
      Number($<HTMLInputElement>("#page-height").value),
    );
    $<HTMLInputElement>("#page-width").value = String(landscape ? long : short);
    $<HTMLInputElement>("#page-height").value = String(
      landscape ? short : long,
    );
    $("#preset-a4").setAttribute("aria-pressed", String(!landscape));
    $("#preset-landscape").setAttribute("aria-pressed", String(landscape));
    capture();
  }
  /**
   * Apply the standard size selected from the paper dropdown.
   * Custom dimensions remain untouched until the user edits their numeric fields.
   * @returns {void} Updates the paper draft for a known preset.
   * @example choosePaper();
   */
  function choosePaper(): void {
    /** Standard paper edge lengths in millimetres. */
    const sizes: Record<string, [number, number]> = {
      A4: [210, 297],
      Letter: [215.9, 279.4],
      A3: [297, 420],
      B4: [257, 364],
      B5: [182, 257],
      A5: [148, 210],
    };
    /** Selected standard size, if any. */
    const size = sizes[$<HTMLSelectElement>("#native-paper-size").value];
    if (size) setSize(size[0], size[1]);
  }
  /**
   * Select portrait orientation for the existing paper size.
   * The original dimensions remain available for later landscape selection.
   * @returns {void} Updates the draft orientation.
   * @example portrait();
   */
  function portrait(): void {
    orient(false);
  }
  /**
   * Select landscape orientation for the existing paper size.
   * Only the order of the current page edges changes.
   * @returns {void} Updates the draft orientation.
   * @example landscape();
   */
  function landscape(): void {
    orient(true);
  }
  /**
   * Apply the legacy Letter preset while retaining orientation.
   * The hidden compatibility control shares the visible paper dropdown behavior.
   * @returns {void} Updates the Letter paper draft.
   * @example letter();
   */
  function letter(): void {
    $<HTMLSelectElement>("#native-paper-size").value = "Letter";
    setSize(215.9, 279.4);
  }
  bindPageGrid($<HTMLFormElement>("#native-page-form"),values);
  $("#native-page-form").addEventListener("input", capture);
  $(".native-dialog").addEventListener("click", capture, true);
  $("#preset-a4").onclick = portrait;
  $("#preset-landscape").onclick = landscape;
  $("#preset-letter").onclick = letter;
  $("#native-paper-size").onchange = choosePaper;
  capture();
  if ((await decision) === "apply") {
    try {
      /** A document-level page change is one reversible source transaction with no new characters. */
      const page=validatePage(values);
      if(JSON.stringify(page)!==JSON.stringify(state.page))
        editor.view.dispatch(closeHistory(editor.state.tr).step(new PageSettingsStep(state.page,page)));
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }
}
/**
 * Show document editing and storage guidance.
 *
 * The dialog explains supported formats, keyboard shortcuts and local source retention.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await help() // Shows the application usage dialog.
 */
async function help() {
  await modal(
    "누구에게나 열린 문서, 포한",
    '<p>한글이 없는 사람들을 위한 문서 편집기입니다. 내 컴퓨터에서 문서를 열고 편집합니다.</p><dl class="help-list"><dt>문서 열기</dt><dd>HWP 5 · HWPX · 포한 · TXT · HTML</dd><dt>문서 저장</dt><dd>HWP · HWPX · 포한 · PDF · TXT · HTML</dd><dt>자주 쓰는 단축키</dt><dd>Ctrl/⌘ S 저장 · Ctrl/⌘ O 열기<br>Ctrl/⌘ F 찾기 · Ctrl/⌘ Enter 쪽 나누기</dd><dt>안전한 편집</dt><dd>불러온 원본은 덮어쓰지 않습니다. 첫 저장에서 저장 위치를 선택하세요. 포한 형식은 원본 데이터와 복구 가능한 편집 내용을 함께 보관합니다.</dd></dl><p class="muted">포한은 한글과컴퓨터와 별개의 독립 프로젝트입니다.</p>',
  );
}
/**
 * Show format, page and source-retention details.
 *
 * Import notices are rendered as escaped text alongside the active document geometry and retained-source status.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await documentInfo() // Shows the current document information.
 */
async function documentInfo() {
  await modal(
    "문서 정보",
    `<dl class="help-list"><dt>문서 형식</dt><dd>${escape(state.format === "forhan" ? "FHN" : state.format.toUpperCase())}</dd><dt>용지</dt><dd>${state.page.width} × ${state.page.height} mm</dd><dt>가져오기 결과</dt><dd>${
      state.warnings.length
        ? state.warnings
            .map(
              /**
               * Render an import notice as escaped dialog text.
               *
               * Compatibility details remain literal text when the document information dialog is assembled.
               * @param {string} x Recent-file entry or compatibility message being rendered.
               * @returns {string} HTML or text representing the described document entry.
               * @example
               * renderNotice("Notice") // A text-only notice paragraph.
               */
              (x) => `<p>${escape(x)}</p>`,
            )
            .join("")
        : "추가 안내가 없습니다."
    }</dd><dt>원본 보관</dt><dd>${state.source || state.original ? "가져온 원본 데이터가 문서에 보관되어 있습니다." : "포한에서 작성한 문서입니다."}</dd></dl>`,
  );
}

$("#new-document").onclick =
  /**
   * Start a new blank document after resolving unsaved changes.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => newDocument();
$("#open-document").onclick = openDocument;
$("#save-document").onclick =
  /**
   * Save the current document through the normal save flow.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {Promise<boolean>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => saveDocument();
$("#file-input").onchange =
  /**
   * Import the local document selected in the browser file picker.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {Event} e DOM event raised by the bound application control.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  async (e) => {
    /** Local file selected from the picker or drag-and-drop payload. */
    const file = (e.target as HTMLInputElement).files![0];
    if (file)
      await importFile({ name: file.name, data: await file.arrayBuffer() });
  };
$("#image-input").onchange =
  /**
   * Embed the selected local image and reset the image picker.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {Event} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    if ((e.target as HTMLInputElement).files![0])
      addImage((e.target as HTMLInputElement).files![0]);
    (e.target as HTMLInputElement).value = "";
  };
$("#document-title").oninput =
  /**
   * Synchronise the edited document title and schedule recovery.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {InputEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    state.title =
      (e.target as HTMLInputElement).value.trim() || "제목 없는 문서";
    update();
    scheduleRecovery();
  };
$("#document-title").onblur =
  /**
   * Synchronise the edited document title and schedule recovery.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {FocusEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    (e.target as HTMLInputElement).value = state.title;
  };
$("#toggle-sidebar").onclick =
  /**
   * Toggle the navigation sidebar.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    document.body.classList.toggle("outline-open");
  };
$("#outline-collapse").onclick =
  /**
   * Toggle the document outline panel.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    document.body.classList.remove("outline-open");
  };
$("#current-document").onclick =
  /**
   * Return keyboard focus to the active document.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {PointerEvent} event - Pointer activation of the document tab or its editable title.
   * @returns {void} Focuses the document without stealing focus from title editing.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (event) => {
    if (event.target !== $("#document-title")) editor.commands.focus();
  };
$(".brand").onclick =
  /**
   * Open the welcome document after resolving unsaved changes.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {PointerEvent} e DOM event raised by the bound application control.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  async (e) => {
    e.preventDefault();
    await newDocument("welcome");
  };
$("#outline-list").onclick =
  /**
   * Navigate to the heading selected in the document outline.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {PointerEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    /** Delegated control selected from the current pointer event. */
    const target = (e.target as Element).closest<HTMLElement>("[data-heading]");
    if (target)
      editor
        .chain()
        .focus()
        .setTextSelection(Number(target.dataset.heading) + 1)
        .scrollIntoView()
        .run();
  };
$("#recent-list").onclick =
  /**
   * Open the selected recent document after resolving unsaved changes.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {PointerEvent} e DOM event raised by the bound application control.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  async (e) => {
    /** Delegated control selected from the current pointer event. */
    const target = (e.target as Element).closest<HTMLElement>("[data-recent]");
    if (target?.dataset.recent && (await canLeave())) {
      try {
        await importFile(
          await invoke("openRecent", target.dataset.recent),
          false,
        );
      } catch (error) {
        toast(errorMessage(error), true);
      }
    }
  };
$("#show-templates").onclick =
  /**
   * Create the report or letter template explicitly selected in the dialog.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  async () => {
    /** Template identifier explicitly selected in the template dialog. */
    const choice = await modal(
      "시작하기 좋은 문서 양식",
      '<p class="muted">필요한 양식을 선택하고 내용을 채워 보세요.</p><div class="template-cards"><div><span>01</span><h3>업무 보고서</h3><p>개요, 진행 현황 표, 다음 계획</p></div><div><span>02</span><h3>안내문</h3><p>인사말과 주요 안내 사항</p></div></div>',
      [
        { label: "취소", value: "cancel" },
        { label: "보고서 만들기", value: "report", primary: true },
        { label: "안내문 만들기", value: "letter" },
      ],
    );
    if (templates[choice]) newDocument(choice);
  };
$("#help").onclick = help;
$("#compatibility-status").onclick = documentInfo;
$("#notice").onclick = documentInfo;
$("#page-settings").onclick = pageSettings;
$(".toolbar").addEventListener(
  "mousedown",
  /**
   * Preserve the editor selection while toolbar buttons receive pointer input.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {MouseEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  (e) => {
    if ((e.target as Element).closest<HTMLElement>("button"))
      e.preventDefault();
  },
);
/** Toolbar control identifiers mapped to supported editor commands. */
const commands = {
  undo: "undo",
  redo: "redo",
  bold: "toggleBold",
  italic: "toggleItalic",
  underline: "toggleUnderline",
  strike: "toggleStrike",
  "bullet-list": "toggleBulletList",
  "ordered-list": "toggleOrderedList",
} as const;
for (/** Current [id, cmd] entry from the surrounding control, layout or document iteration. */
const [id, cmd] of Object.entries(commands))
  $("#" + id).onclick =
    /**
     * Run the toolbar command mapped to this control.
     *
     * The editor is focused before invoking the supported history, emphasis or list command.
     * @returns {boolean} Whether the event or collection entry meets the condition described above.
     * @example
     * toolbarCommand() // Executes the selected editing command.
     */
    () => editor.chain().focus()[cmd]().run();
for (/** Current align entry from the surrounding control, layout or document iteration. */
const align of ["left", "center", "right", "justify"])
  $("#align-" + align).onclick =
    /**
     * Apply the chosen paragraph alignment.
     *
     * The focused command chain changes alignment at the current editor selection.
     * @returns {boolean} Whether the event or collection entry meets the condition described above.
     * @example
     * alignSelection() // Applies the selected left, centre, right or justified alignment.
     */
    () => editor.chain().focus().setTextAlign(align).run();
$("#block-style").onchange =
  /**
   * Apply the selected paragraph or heading style.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {Event} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    /** Focused editor command chain for the chosen formatting operation. */
    const chain = editor.chain().focus();
    (e.target as HTMLInputElement).value === "paragraph"
      ? chain.setParagraph().run()
      : chain
          .setHeading({
            level: Number((e.target as HTMLInputElement).value) as 1 | 2 | 3,
          })
          .run();
  };
$("#font-family").onchange =
  /**
   * Apply or clear the selected font family.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {Event} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    /** Focused editor command chain for the chosen formatting operation. */
    const chain = editor.chain();
    (e.target as HTMLInputElement).value
      ? chain.setFontFamily((e.target as HTMLInputElement).value).run()
      : chain.unsetFontFamily().run();
    editor.view.focus();
  };
$("#font-size").onchange =
  /**
   * Apply a quick-toolbar size using the native character-entry rules.
   *
   * The shared validator retains invalid drafts and imported subminimum sizes;
   * valid edits format the selection and restore document focus synchronously.
   * @param {Event} e - Change event raised by the quick character-size field.
   * @returns {void} Applies valid character formatting or reports the input error.
   * @example
   * // Entering 200 applies a 200pt character-size mark to selected text.
   */
  (e) => {
    applyRibbonField(editor, "font-size", e.target as HTMLInputElement);
  };
$("#font-color").oninput =
  /**
   * Apply the selected text colour.
   *
   * The native palette emits only a committed opaque color. Synchronous focus
   * restoration keeps the document selection ready for the next edit.
   * @param {InputEvent} e - Input event from the committed quick color field.
   * @returns {void} Applies the selected text color and restores document focus.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    editor
      .chain()
      .setColor((e.target as HTMLInputElement).value)
      .run();
    editor.view.focus();
  };
$("#insert-image").onclick =
  /**
   * Open the local image picker.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => $("#image-input").click();
$("#insert-table").onclick =
  /**
   * Toggle table controls with commands enabled only inside a table.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    document.querySelectorAll<HTMLButtonElement>("[data-table]").forEach(
      /**
       * Toggle table controls with commands enabled only inside a table.
       *
       * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
       * @param {HTMLButtonElement} el Rendered control or detached HTML element being processed.
       * @returns {void} Completes this editor update without returning a value.
       * @example
       * handler(event) // Performs the action associated with this control.
       */
      (el) => {
        el.disabled = !editor.isActive("table");
      },
    );
    positionMenu($("#table-menu"), $("#insert-table"));
  };
$("#table-create").onclick =
  /**
   * Insert a table after validating its row and column counts.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    /** Requested row count for a new table. Requested column count for a new table. */
    const rows = Number($("#table-rows").value),
      cols = Number($("#table-cols").value);
    if (
      rows < 1 ||
      rows > 30 ||
      cols < 1 ||
      cols > 12 ||
      !Number.isInteger(rows) ||
      !Number.isInteger(cols)
    )
      return toast("행은 1~30, 열은 1~12로 입력하세요.", true);
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
    $("#table-menu").hidden = true;
  };
bindNativeTableMenu();
document.querySelectorAll<HTMLButtonElement>("[data-table]").forEach(
  /**
   * Run or bind the selected table editing command.
   *
   * Commands operate on the current table selection, then close the menu and report when the action cannot run.
   * @param {HTMLButtonElement} el Rendered control or detached HTML element being processed.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * tableAction() // Applies the chosen supported table command.
   */
  (el) => {
    el.onclick =
      /**
       * Run or bind the selected table editing command.
       *
       * Commands operate on the current table selection, then close the menu and report when the action cannot run.
       * @returns {void} Completes this editor update without returning a value.
       * @example
       * tableAction() // Applies the chosen supported table command.
       */
      () => {
        /** Whether the selected table command could run at the current selection. */
        const ok = editor
          .chain()
          .focus()
          [el.dataset.table as TableCommand]()
          .run();
        if (!ok) toast("셀 또는 표를 선택한 뒤 다시 시도하세요.");
        $("#table-menu").hidden = true;
      };
  },
);
$("#export-menu-toggle").onclick =
  /**
   * Toggle the export-format menu.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => positionMenu($("#export-menu"), $("#export-menu-toggle"));
document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach(
  /**
   * Run or bind an explicit export-format choice.
   *
   * The selected menu format is passed to the save-as flow and the export menu is closed.
   * @param {HTMLButtonElement} el Rendered control or detached HTML element being processed.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * exportAction() // Starts saving in the selected document format.
   */
  (el) => {
    el.onclick =
      /**
       * Run or bind an explicit export-format choice.
       *
       * The selected format starts the save-as flow after original editor focus
       * is restored, preserving keyboard undo after a completed or cancelled save.
       * @returns {void} Completes this editor update without returning a value.
       * @example
       * exportAction() // Starts saving in the selected document format.
       */
      () => {
        $("#export-menu").hidden = true;
        editor.view.focus();
        saveDocument(el.dataset.export as ExportFormat, true);
      };
  },
);
document.addEventListener(
  "click",
  /**
   * Close open menus when the pointer clicks outside their anchors.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {PointerEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  (e) => {
    for (/** Current [menu, toggle] entry from the surrounding control, layout or document iteration. */
    const [menu, toggle] of [
      ["#export-menu", "#export-menu-toggle"],
      ["#table-menu", "#insert-table"],
    ])
      if (
        !(e.target as Element).closest<HTMLElement>(menu) &&
        !(e.target as Element).closest<HTMLElement>(toggle)
      )
        $(menu).hidden = true;
  },
);
/**
 * Select a search result from the native task pane.
 *
 * Delegation retains navigation when a changed query rebuilds the result buttons.
 * @param {MouseEvent} event Click raised within the search result container.
 * @returns {void} Selects and reveals the clicked document range.
 * @example
 * selectNativeFindResult(event);
 */
function selectNativeFindResult(event: MouseEvent): void {
  /** Clicked result control carrying its current document-order index. */
  const button = (event.target as Element).closest<HTMLElement>(
    "[data-find-index]",
  );
  if (!button) return;
  searchIndex = Number(button.dataset.findIndex);
  selectMatch();
}
/**
 * Toggle the search task pane's command menu.
 *
 * The popup exposes the editor's find and replacement modes without editing text.
 * @returns {void} Updates popup visibility and its accessible expanded state.
 * @example
 * toggleNativeFindOptions();
 */
function toggleNativeFindOptions(): void {
  $("#native-find-options").hidden = !$("#native-find-options").hidden;
  $(".native-find-options-toggle").setAttribute(
    "aria-expanded",
    String(!$("#native-find-options").hidden),
  );
}
$("#native-find-results").onclick = selectNativeFindResult;
$(".native-find-options-toggle").onclick = toggleNativeFindOptions;
$("#find-toggle").onclick = toggleFind;
$("#find-close").onclick =
  /**
   * Close the search panel and return focus to the document.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    $("#find-panel").hidden = true;
    document.body.classList.remove("find-open", "replace-mode");
    $("#native-find-options").hidden = true;
    editor.commands.focus();
  };
$("#find-text").oninput =
  /**
   * Recompute search results or navigate on Enter.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => findMatches();
$("#find-text").onkeydown =
  /**
   * Recompute search results or navigate on Enter.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {KeyboardEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#find-next").click();
    }
  };
$("#find-next").onclick =
  /**
   * Select the next search match after the current editor selection.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    findMatches(false);
    if (matches.length) {
      /** Current editor selection position used to choose the next search match. */
      const pos = editor.state.selection.from;
      searchIndex = matches.findIndex(
        /**
         * Select a search match relative to the editor selection.
         *
         * The predicate compares recorded text positions so next, previous and replacement controls keep their expected ordering.
         * @param {{ from: number; to: number; }} m Recorded match positions compared with the current editor selection.
         * @returns {boolean} Whether the event or collection entry meets the condition described above.
         * @example
         * matchPredicate(match) // Whether the match satisfies the requested selection position.
         */
        (m) => m.from > pos,
      );
      if (searchIndex < 0) searchIndex = 0;
      selectMatch();
    }
  };
$("#find-prev").onclick =
  /**
   * Select the previous search match before the current editor selection.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    findMatches(false);
    if (matches.length) {
      /** Current editor selection position used to choose the next search match. */
      const pos = editor.state.selection.from;
      searchIndex = matches.findLastIndex(
        /**
         * Select a search match relative to the editor selection.
         *
         * The predicate compares recorded text positions so next, previous and replacement controls keep their expected ordering.
         * @param {{ from: number; to: number; }} m Recorded match positions compared with the current editor selection.
         * @returns {boolean} Whether the event or collection entry meets the condition described above.
         * @example
         * matchPredicate(match) // Whether the match satisfies the requested selection position.
         */
        (m) => m.from < pos,
      );
      if (searchIndex < 0) searchIndex = matches.length - 1;
      selectMatch();
    }
  };
$("#replace-one").onclick =
  /**
   * Replace the selected search match with the entered replacement text.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    /** Editor selection captured before recomputing replacement matches. */
    const selection = editor.state.selection;
    findMatches(false);
    /** Search match selected for navigation or replacement. */
    const match =
      matches.find(
        /**
         * Replace the selected search match with the entered replacement text.
         *
         * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
         * @param {{ from: number; to: number; }} m Recorded match positions compared with the current editor selection.
         * @returns {boolean} Whether the event or collection entry meets the condition described above.
         * @example
         * handler(event) // Performs the action associated with this control.
         */
        (m) => m.from === selection.from && m.to === selection.to,
      ) || matches[0];
    if (match) {
      editor.view.dispatch(
        editor.state.tr.insertText(
          $("#replace-text").value,
          match.from,
          match.to,
        ),
      );
      findMatches();
    }
  };
$("#replace-all").onclick =
  /**
   * Replace matches from the end of the document to retain valid source positions.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => {
    findMatches(false);
    if (!matches.length) return;
    /** Number of search matches included in the replacement operation. Replacement text entered in the find-and-replace panel. */
    const count = matches.length,
      replacement = $("#replace-text").value;
    /** Editor transaction collecting replacements from the end of the document. */
    let tr = editor.state.tr;
    for (/** Current match entry from the surrounding control, layout or document iteration. */
    const match of [...matches].reverse())
      tr = tr.insertText(replacement, match.from, match.to);
    editor.view.dispatch(tr);
    findMatches(false);
    toast(`${count}곳을 바꿨습니다.`);
  };
$("#zoom-out").onclick =
  /**
   * Decrease display zoom within its supported range.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => setZoom(state.zoom - 10);
$("#zoom-in").onclick =
  /**
   * Increase display zoom within its supported range.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  () => setZoom(state.zoom + 10);
$("#zoom-reset").onclick =
  /**
   * Open the numeric paper zoom settings.
   *
   * The dialog applies a validated display percentage without changing document content.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  zoomSettings;
$("#zoom-slider").oninput =
  /**
   * Apply the zoom selected on the display-scale control.
   *
   * The handler applies this control action to the current document while retaining the surrounding save and validation flow.
   * @param {InputEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handler(event) // Performs the action associated with this control.
   */
  (e) => setZoom(sliderToZoom(Number((e.target as HTMLInputElement).value)));
/** Whether this renderer already owns an unresolved interactive print request. */
let printing = false;

/**
 * Print the current document without saving or changing its revision state.
 *
 * Uses the native interactive print dialog on desktop and browser printing in
 * the web fallback. Repeated commands do not open overlapping native dialogs;
 * cancellation is silent and printer errors remain visible to the user.
 * @async
 * @returns {Promise<void>} Resolves after printing, cancellation or a visible error.
 * @example
 * await printDocument(); // Opens the printer chooser rather than PDF export.
 */
async function printDocument(): Promise<void> {
  if (printing) return;
  printing = true;
  try {
    if (native) {
      /** One immutable print revision keeps layout width, title and markup together across preparation. */
      const page = { ...state.page }, title = state.title, html = editor.getHTML();
      /** Result of the interactive job; false means the user cancelled. */
      const accepted = await invoke(
        "printDocument",
        await prepareNativeLayout(html, page),
        page,
        title,
      );
      if (accepted) toast("인쇄 작업을 보냈습니다.");
    } else window.print();
  } catch (error) {
    toast(errorMessage(error), true);
  } finally {
    printing = false;
  }
}

/** Whether a print snapshot is currently being generated for this editor. */
let previewing = false;

/**
 * Open a paginated print snapshot without changing document editing or zoom.
 *
 * Desktop uses the isolated native PDF preview; browser builds use their print
 * preview dialog. Concurrent requests share the current in-progress operation.
 * @async
 * @returns {Promise<void>} Resolves after opening the preview or showing an error.
 * @example
 * await previewDocument();
 */
async function previewDocument(): Promise<void> {
  if (previewing) return;
  previewing = true;
  try {
    if (native) {
      /** Capture the preview revision before asynchronous font and geometry preparation. */
      const page = { ...state.page }, title = state.title, html = editor.getHTML();
      await invoke(
        "previewDocument",
        await prepareNativeLayout(html, page),
        page,
        title,
      );
    } else window.print();
  } catch (error) {
    toast(errorMessage(error), true);
  } finally {
    previewing = false;
  }
}

/**
 * Dispatch a desktop or browser application action.
 *
 * File payloads enter the import flow; close and document-switch commands retain the unsaved-change guard.
 * @param {AppAction} value Document payload, action or explicit choice consumed by this operation.
 * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
 * @example
 * await action("save") // Runs the document save flow.
 */
async function action(value: AppAction) {
  if ($("#modal-root").firstChild) return;
  if (typeof value === "object") return importFile(value.payload);
  /** Allowed application commands or explicit dialog actions. */
  const actions = {
    /**
     * Execute the selected application menu action.
     *
     * Document creation, saving and closing use the same guarded flows as the visible controls.
     * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
     * @example
     * runAction() // Completes the selected document operation.
     */
    new: () => newDocument(),
    open: openDocument,

    /**
     * Execute the selected application menu action.
     *
     * Document creation, saving and closing use the same guarded flows as the visible controls.
     * @returns {Promise<boolean>} Resolves when the local document action or explicit dialog interaction completes.
     * @example
     * runAction() // Completes the selected document operation.
     */
    save: () => saveDocument(),

    /**
     * Execute the selected application menu action.
     *
     * Document creation, saving and closing use the same guarded flows as the visible controls.
     * @returns {Promise<boolean>} Resolves when the local document action or explicit dialog interaction completes.
     * @example
     * runAction() // Completes the selected document operation.
     */
    "save-as": () => saveDocument(undefined, true),

    /**
     * Execute the selected application menu action.
     *
     * Document creation, saving and closing use the same guarded flows as the visible controls.
     * @returns {Promise<boolean>} Resolves when the local document action or explicit dialog interaction completes.
     * @example
     * runAction() // Completes the selected document operation.
     */
    pdf: () => saveDocument("pdf"),
    print: printDocument,
    preview: previewDocument,
    find: toggleFind,
    help,

    /**
     * Execute the selected application menu action.
     *
     * Document creation, saving and closing use the same guarded flows as the visible controls.
     * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
     * @example
     * runAction() // Completes the selected document operation.
     */
    close: async () => {
      try {
        if (await canLeave()) {
          await clearRecovery();
          native?.close();
        } else native?.close(false);
      } catch (error) { native?.close(false); throw error; }
    },
  };
  await actions[value]?.();
}

/**
 * Open editable character or paragraph settings from the measured native ribbon.
 *
 * Values are captured before the shared modal closes, then applied through
 * Tiptap commands so undo history and imported source retention remain intact.
 *
 * @async
 * @param {'character' | 'paragraph'} kind - The formatting settings requested by the user.
 * @returns {Promise<void>} Resolves after explicit application or cancellation.
 * @example
 * await nativeFormatSettings('character');
 */
async function nativeFormatSettings(
  kind: "character" | "paragraph",
): Promise<void> {
  /** Character attributes at the current text selection. */
  const character = editor.getAttributes("textStyle");
  /** Independent native lines retain source position, shape and color across panel switches. */
  const underlineStyle = characterDecoration(editor.getAttributes("underline"),"underline"),
    strikeStyle = characterDecoration(editor.getAttributes("strike"),"strike"),
    underlineActive = editor.isActive("underline"), strikeActive = editor.isActive("strike");
  /** Selected source modes retain a mixed state until the native checkbox is explicitly edited. */
  const fontSpaces = fontSpaceSelection(editor);
  /** Kerning is a separate native character-shape flag and can be mixed independently. */
  const kerning = fontSpaceSelection(editor, "nativeUseKerning");
  /** Complete native character arrays remain separate from the current script's displayed values. */
  const nativeMetrics = characterMetrics(character.nativeCharacterMetrics);
  /** Active native language slot supplied by script-aware document import. */
  const nativeLanguage =
    Number.isInteger(character.nativeCharacterLanguage) &&
    character.nativeCharacterLanguage >= 0 &&
    character.nativeCharacterLanguage < 7
      ? Number(character.nativeCharacterLanguage)
      : 0;
  /** Language-specific edits stay local and preserve their chronological scope. */
  const languageDraft = new CharacterLanguageDraft({ ...character, fontFamily: character.fontFamily || "함초롬바탕" }, nativeLanguage);
  /** Representative scope applies new edits to all seven languages. */
  let languageScope: number | null = null;
  /** Editable block containing the current selection. */
  const block = editor.isActive("heading") ? "heading" : "paragraph";
  /** Current block spacing and alignment attributes. */
  const paragraph = editor.getAttributes(block);
  /** Independent paragraph fields retain mixed source values until explicitly changed. */
  const wordBreaks=paragraphWordBreakSelection(editor);
  /** An untouched mixed paragraph-grid selection retains each original native flag. */
  const snapToGrid=paragraphGridSelection(editor);
  /** Explicit physical line spacing, when the imported paragraph uses fixed mode. */
  const fixedLine = fixedLineHeightPoints(paragraph.lineHeight);
  /** Point-valued spacing fields displayed by the native paragraph dialog. */
  const properties = [
    "marginLeft",
    "marginRight",
    "textIndent",
    "marginTop",
    "marginBottom",
  ];
  /** Selection settings supplied to the measured native form. */
  const initial: Record<string, unknown> =
    kind === "character"
      ? {
          family: character.fontFamily || "함초롬바탕",
          size: selectionFontSize(editor),
          color: character.color || "#000000",
          backgroundColor: character.backgroundColor || "",
          useFontSpace: fontSpaces.value,
          useKerning: kerning.value,
          shadowType: characterShadow(character).type,
          shadowX: characterShadow(character).x,
          shadowY: characterShadow(character).y,
          shadowColor: characterShadow(character).color,
          outlineType: characterOutline(character.nativeOutlineType),
          emphasisType: characterEmphasis(character.nativeEmphasisType),
          ratio: nativeMetrics.ratio[nativeLanguage],
          spacing: nativeMetrics.spacing[nativeLanguage],
          relativeSize: nativeMetrics.relativeSize[nativeLanguage],
          offset: nativeMetrics.offset[nativeLanguage],
          bold: editor.isActive("bold"),
          italic: editor.isActive("italic"),
          underline: editor.isActive("underline"),
          strike: editor.isActive("strike"),
          underlinePosition: underlineStyle.nativePosition,
          underlinePattern: underlineStyle.nativePattern,
          underlineColor: underlineStyle.nativeColor || character.color || "#000000",
          strikePattern: strikeStyle.nativePattern,
          strikeColor: strikeStyle.nativeColor || "#000000",
          superscript: editor.isActive("superscript"),
          subscript: editor.isActive("subscript"),
        }
      : {
          snapToGrid,
          breakLatinWord:wordBreaks.latin,
          'minimum-space':MAX_PARAGRAPH_SPACE-paragraphCondense(paragraph),
          breakNonLatinWord:wordBreaks.nonLatin,
          align: paragraph.textAlign || "justify",
          lineMode: fixedLine === null ? "PERCENT" : "FIXED",
          line:
            fixedLine ??
            Math.round(
              Number(String(paragraph.lineHeight || "1.6").replace("%", "")) *
                (String(paragraph.lineHeight || "").endsWith("%") ? 1 : 100),
            ),
        };
  if (kind === "paragraph")
    for (/** Physical paragraph spacing property. */ const property of properties)
      initial[property] = nativeParagraphLengthPoints(paragraph[property]);
  /** Values captured before the modal removes its controls. */
  const values: Record<string, string | boolean> = {};
  /** Explicit character-field edits distinguish user intent from untouched mixed formatting. */
  const changedCharacterFields = new Set<string>();
  /** Explicit field changes preserve unrelated mixed paragraph breaking settings. */
  const changedWordBreakFields = new Set<string>();
  /** Untouched rounded paragraph controls retain each original source value and unit. */
  const changedParagraphFields = new Set<string>();
  /** Measured dialog markup for this formatting category. */
  const layout = renderNativeDialog(kind, initial);
  /** Explicit formatting decision pending in the native dialog. */
  const decision = modal(
    kind === "character" ? "글자 모양" : "문단 모양",
    "",
    [
      { label: "취소", value: "cancel" },
      { label: "설정(D)", value: "apply", primary: true },
    ],
    layout,
  );
  /**
   * Capture editable native formatting controls before modal dismissal.
   *
   * Unchecked radio buttons cannot overwrite the selected alignment value.
   * Character-size arrows alter only the local draft, whose validation message
   * prevents an invalid Apply from dismissing the dialog.
   * @param {Event} [event] - Changed formatting control, when capture follows an edit.
   * @returns {void} Retains the current formatting draft.
   * @example capture();
   */
  function capture(event?: Event): void {
    /** Changed native control, when capturing follows a formatting edit. */
    const changed = event?.target;
    if (kind === "character") {
      if (changed instanceof HTMLSelectElement && changed.name === "language" &&
          (event?.type === "input" || event?.type === "change")) {
        for (
          /** Invalid drafts must be corrected before switching away from their language. */
          const [key, rule] of Object.entries(EDITABLE_CHARACTER_METRICS)
        ) {
          /** Visible numeric field still belongs to the previous language scope. */
          const field = document.querySelector<HTMLInputElement>(`#native-format-form [name="${rule.field}"]`)!;
          field.setCustomValidity(characterMetricInputError(key as keyof typeof EDITABLE_CHARACTER_METRICS, field.value,
            Number(languageDraft.value(key as keyof typeof EDITABLE_CHARACTER_METRICS, languageScope, true))));
          if (!field.checkValidity()) {
            changed.value = languageScope === null ? "all" : String(languageScope);
            field.reportValidity();
            return;
          }
        }
        languageScope = changed.value === "all" ? null : Number(changed.value);
        for (
          /** A scope switch displays the retained draft without recording a new edit. */
          const [key, rule] of Object.entries(EDITABLE_CHARACTER_METRICS)
        ) document.querySelector<HTMLInputElement>(`#native-format-form [name="${rule.field}"]`)!.value =
          String(languageDraft.value(key as keyof typeof EDITABLE_CHARACTER_METRICS, languageScope));
        document.querySelector<HTMLInputElement>('#native-format-form [name="scale"]')!.value = String(languageDraft.value("ratio", languageScope));
        /** Language-specific source faces may not appear in the initial representative font menu. */
        const family = document.querySelector<HTMLSelectElement>('#native-format-form [name="family"]')!;
        /** Face choice retained by the newly selected language. */
        const face = String(languageDraft.value("family", languageScope));
        if (!Array.from(family.options).some(
          /**
           * Find an existing literal native font option.
           *
           * Missing source faces are added without interpreting them as markup.
           * @param {HTMLOptionElement} option - Existing font menu choice.
           * @returns {boolean} Whether this choice represents the source face.
           * @example
           * // A source Latin face can be selected independently from Hangul.
           */
          (option) => option.value === face,
        )) family.add(new Option(face, face));
        family.value = face;
      }
      if (
        (event?.type === "input" || event?.type === "change") &&
        (changed instanceof HTMLInputElement ||
          changed instanceof HTMLSelectElement) &&
        changed.name
      )
        changedCharacterFields.add(changed.name);
      /** Character-size draft stays local until the native dialog is applied. */
      const sizeField = document.querySelector<HTMLInputElement>(
        '#native-format-form [name="size"]',
      )!;
      /** Explicit arrow clicked inside the numeric character-size control. */
      const arrow =
        event?.type === "click" && changed instanceof Element
          ? changed.closest<HTMLElement>("[data-font-size-step]")
          : null;
      /** Keyboard arrows use the same one-point increment as the visible buttons. */
      const keyStep =
        event instanceof KeyboardEvent &&
        changed === sizeField &&
        (event.key === "ArrowUp" || event.key === "ArrowDown");
      if (keyStep) event.preventDefault();
      if (arrow || keyStep) {
        if (!fontSizeInputError(sizeField.value, Number(initial.size))) {
          changedCharacterFields.add("size");
          /** Requested direction preserves the existing fractional point size. */
          const direction = arrow
            ? Number(arrow.dataset.fontSizeStep)
            : (event as KeyboardEvent).key === "ArrowUp"
              ? 1
              : -1;
          sizeField.value = displayFontSize(
            stepFontSize(Number(sizeField.value), direction === 1 ? 1 : -1),
          );
        }
      }
      sizeField.setCustomValidity(
        fontSizeInputError(sizeField.value, Number(initial.size)),
      );
      /** Valid percentage drafts also drive the live character sample. */
      let validMetrics = true;
      /** Independent preview arrays prevent changing the saved document before Apply. */
      const previewMetrics = characterMetrics(languageDraft.preview().nativeCharacterMetrics);
      for (/** Native editable percentage validated before the modal may dismiss. */ const [
        key,
        rule,
      ] of Object.entries(EDITABLE_CHARACTER_METRICS)) {
        /** Native percentage field whose original stored value can remain unchanged. */
        const field = document.querySelector<HTMLInputElement>(
          `#native-format-form [name="${rule.field}"]`,
        )!;
        /** Native imports can retain values outside entry bounds in each independent language. */
        const original = Number(languageDraft.value(key as keyof typeof EDITABLE_CHARACTER_METRICS, languageScope, true));
        field.min = String(Math.min(rule.min, original));
        field.max = String(Math.max(rule.max, original));
        /** Shared entry validation rejects fractional percentages and out-of-range edits. */
        const error = characterMetricInputError(
          key as keyof typeof EDITABLE_CHARACTER_METRICS,
          field.value,
          original,
        );
        field.setCustomValidity(error);
        validMetrics &&= !error;
        if (!error && changed === field && (event?.type === "input" || event?.type === "change"))
          languageDraft.set(key as keyof typeof EDITABLE_CHARACTER_METRICS, languageScope, Number(field.value));
        previewMetrics[key as keyof typeof EDITABLE_CHARACTER_METRICS][languageScope ?? nativeLanguage] = Number(field.value);
      }
      if (changed instanceof HTMLSelectElement && changed.name === "family" && (event?.type === "input" || event?.type === "change"))
        languageDraft.set("family", languageScope, changed.value);
      if (validMetrics && !sizeField.validationMessage) {
        /** Sample span shares the document renderer's physical character measurements. */
        const preview = document.querySelector<HTMLElement>(
          ".nd-character-sample",
        )!;
        preview.style.cssText = renderCharacterMetrics({
          fontSize: sizeField.value + "pt",
          nativeCharacterMetrics: previewMetrics,
          nativeCharacterLanguage: languageScope ?? nativeLanguage,
        }).style;
        preview.style.color = document.querySelector<HTMLInputElement>(
          "#native-character-color",
        )!.value;
        preview.style.backgroundColor =
          document.querySelector<HTMLInputElement>("#native-character-shade")!
            .value || "transparent";
        preview.style.fontFamily = document.querySelector<HTMLSelectElement>(
          '#native-format-form [name="family"]',
        )!.value;
        renderCharacterSample(preview, {...languageDraft.preview(), fontSize:sizeField.value + "pt", nativeUseKerning: document.querySelector<HTMLInputElement>('#native-format-form [name="kerning"]')!.checked}, languageScope ?? nativeLanguage);
        renderDecorationPreview(preview,document.querySelector<HTMLFormElement>("#native-format-form")!);
        renderShadowPreview(preview,document.querySelector<HTMLFormElement>("#native-format-form")!);
        renderOutlinePreview(preview,document.querySelector<HTMLFormElement>("#native-format-form")!);
      }
      if ((arrow || keyStep) && !sizeField.checkValidity())
        sizeField.reportValidity();
    }
    if (kind === "paragraph") {
      handleParagraphNumberEvent($('#native-format-form') as HTMLFormElement,event);
      if(changed instanceof HTMLInputElement&&changed.name==='minimum-space'&&(event?.type==='input'||event?.type==='change')){
        try{parseParagraphMinimumSpace(paragraphNumberValue(changed));changed.setCustomValidity('');}
        catch(error){changed.setCustomValidity(error instanceof Error?error.message:'최소 공백을 확인하세요.');}
      }
      if((changed instanceof HTMLInputElement||changed instanceof HTMLSelectElement)&&
        (event?.type==='input'||event?.type==='change'))changedParagraphFields.add(changed.name);
      if(changed instanceof HTMLSelectElement &&
        (changed.name==='breakLatinWord'||changed.name==='breakNonLatinWord') &&
        (event?.type==='input'||event?.type==='change') && changed.value!=='')
        changedWordBreakFields.add(changed.name);
      /** Native line-spacing mode and value captured before modal dismissal. */
      const mode = document.querySelector<HTMLSelectElement>(
        '#native-format-form [name="lineMode"]',
      )!;
      /** Numeric draft expressed in percent or points according to its selected mode. */
      const line = document.querySelector<HTMLInputElement>(
        '#native-format-form [name="line"]',
      )!;
      if (changed === mode && values.lineMode && values.lineMode !== mode.value)
        setParagraphNumberDraft(line,
          mode.value === "FIXED"
            ? (Number(paragraphNumberValue(line)) / 100) * selectionFontSize(editor)
            : Math.round(
                  (Number(paragraphNumberValue(line)) / selectionFontSize(editor)) * 100,
                ),
          mode.value === 'FIXED');
      /** Visible unit must follow the actual mode rather than always saying percent. */
      const unit = line.parentElement?.querySelector("span");
      if (unit) unit.textContent = mode.value === "FIXED" ? "pt" : "%";
      line.step = "any";
      /** Indentation magnitude is editable only for first-line or hanging modes. */
      const indentation = document.querySelector<HTMLInputElement>(
        '#native-format-form [name="textIndent"]',
      )!;
      /** Mutually exclusive native indentation mode, independent of its unsigned magnitude. */
      const indentationMode = document.querySelector<HTMLInputElement>(
        '#native-format-form [name="indentMode"]:checked',
      )!;
      indentation.disabled = indentationMode.value === "NORMAL";
      refreshParagraphNumbers($('#native-format-form') as HTMLFormElement);
      renderParagraphPreview($('#native-format-form') as HTMLFormElement);
    }
    if (
      changed instanceof HTMLInputElement &&
      changed.checked &&
      (changed.name === "superscript" || changed.name === "subscript")
    ) {
      /** Opposite character position, which cannot coexist on one native character. */
      const opposite = document.querySelector<HTMLInputElement>(
        `#native-format-form [name="${changed.name === "superscript" ? "subscript" : "superscript"}"]`,
      );
      if (opposite) {
        if (opposite.checked) changedCharacterFields.add(opposite.name);
        opposite.checked = false;
      }
    }
    for (/** Named control in the active formatting form. */ const field of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement
    >("#native-format-form [name]")) {
      if (
        field.disabled ||
        (field instanceof HTMLInputElement &&
          (field.readOnly || (field.type === "radio" && !field.checked)))
      )
        continue;
      values[field.name] =
        field instanceof HTMLInputElement && field.type === "checkbox"
          ? field.checked
          : kind==='paragraph'&&field instanceof HTMLInputElement&&field.closest('.nd-paragraph-number')?paragraphNumberValue(field):field.value;
    }
  }
  if (kind === "character") {
    bindCharacterTabs($("#native-format-form"));
    $("#native-format-form").dataset.underlineDefaultColor = nativeUnderlineDefaultColor(editor);
    bindDecorationControls($("#native-format-form"));
    bindShadowControls($("#native-format-form") as HTMLFormElement);
    /** An untouched mixed checkbox preserves every selected run's original preference. */
    const fontSpace = document.querySelector<HTMLInputElement>('#native-format-form [name="font-space"]')!;
    if (fontSpaces.mixed) fontSpace.checked = false;
    fontSpace.indeterminate = fontSpaces.mixed;
    /** A mixed kerning selection remains unchanged unless the actual checkbox is edited. */
    const kerningField = document.querySelector<HTMLInputElement>('#native-format-form [name="kerning"]')!;
    if (kerning.mixed) kerningField.checked = false;
    kerningField.indeterminate = kerning.mixed;
  }
  $("#native-format-form").addEventListener("input", capture);
  $("#native-format-form").addEventListener("change", capture);
  $("#native-format-form").addEventListener("keydown", capture);
  if(kind==='paragraph'){
    /** A mixed checkbox remains indeterminate until an actual user edit supplies a uniform flag. */
    const gridField=document.querySelector<HTMLInputElement>('#native-format-form [name="snap-to-grid"]')!;
    gridField.checked=snapToGrid===true;gridField.indeterminate=snapToGrid===null;
    /** Original fine source amounts remain independent of native rounded form labels. */
    const paragraphNumberForm=$('#native-format-form') as HTMLFormElement;
    paragraphNumberForm.dataset.fixedLineMaximum=String(fixedLineSpacingMaximum(state.page));
    for(/** Only actual editable numeric fields receive their own original local draft. */const field of paragraphNumberForm.querySelectorAll<HTMLInputElement>('.nd-paragraph-number input')){
      if(initial[field.name]===undefined)continue;
      /** First-line controls display an unsigned magnitude behind their separate mode. */
      const amount=Number(initial[field.name]);
      if(Number.isFinite(amount))setParagraphNumberDraft(field,field.name==='textIndent'?Math.abs(amount):amount,field.closest('.nd-number')?.querySelector(':scope > span')?.textContent==='pt');
    }
  }
  $(".native-dialog").addEventListener("click", capture, true);
  capture();
  if ((await decision) !== "apply") return;
  if (kind === "character") {
    /** Requested font size in typographic points. */
    const size = Number(values.size);
    /** Defensive validation shares the rules enforced before modal dismissal. */
    const sizeError = fontSizeInputError(
      String(values.size),
      Number(initial.size),
    );
    if (sizeError) return toast(sizeError, true);
    for (/** Native measurement draft validated independently from character height. */ const [
      key,
      rule,
    ] of Object.entries(EDITABLE_CHARACTER_METRICS)) {
      /** Literal percentage captured before the dialog controls were removed. */
      const draft = String(values[rule.field]);
      /** Defensive validation shares the pre-dismissal form rules. */
      const error = characterMetricInputError(
        key as keyof typeof EDITABLE_CHARACTER_METRICS,
        draft,
        Number(languageDraft.value(key as keyof typeof EDITABLE_CHARACTER_METRICS, languageScope, true)),
      );
      if (error) return toast(error, true);
    }
    /** One character-command chain applies only fields the user actually edited. */
    const characterChain = editor.chain();
    /** Percentage-only edits need no empty primitive-formatting transaction. */
    let hasCharacterCommands = false;
    if (changedCharacterFields.has("size")) {
      characterChain.setFontSize(size + "pt");
      hasCharacterCommands = true;
    }
    if (changedCharacterFields.has("color")) {
      characterChain.setColor(String(values.color));
      hasCharacterCommands = true;
    }
    if (changedCharacterFields.has("backgroundColor")) {
      if (values.backgroundColor)
        characterChain.setBackgroundColor(String(values.backgroundColor));
      else characterChain.unsetBackgroundColor();
      hasCharacterCommands = true;
    }
    for (/** Supported character emphasis mark. */ const mark of [
      "bold",
      "italic",
      "superscript",
      "subscript",
    ]) {
      if (!changedCharacterFields.has(mark)) continue;
      if (values[mark]) characterChain.setMark(mark);
      else characterChain.unsetMark(mark);
      hasCharacterCommands = true;
    }
    if (applyDecorationDraft(characterChain,values,changedCharacterFields,"underline",underlineActive)) hasCharacterCommands = true;
    if (applyDecorationDraft(characterChain,values,changedCharacterFields,"strike",strikeActive)) hasCharacterCommands = true;
    if (applyShadowDraft(characterChain,values,changedCharacterFields)) hasCharacterCommands = true;
    if (changedCharacterFields.has("outline-type")) {
      characterChain.setMark("textStyle",{nativeOutlineType:characterOutline(values["outline-type"])});
      hasCharacterCommands=true;
    }
    if (changedCharacterFields.has("emphasis-type")) {
      characterChain.setMark("textStyle",{nativeEmphasisType:characterEmphasis(values["emphasis-type"])});
      hasCharacterCommands=true;
    }
    if (changedCharacterFields.has("font-space")) {
      characterChain.setMark("textStyle", { nativeUseFontSpace: !!values["font-space"] });
      hasCharacterCommands = true;
    }
    if (changedCharacterFields.has("kerning")) {
      characterChain.setMark("textStyle", { nativeUseKerning: !!values.kerning });
      hasCharacterCommands = true;
    }
    if(languageDraft.edits.length){
      characterChain.command(
        /**
         * Add native language drafts to the same character-formatting transaction.
         *
         * One Apply action must have one undo step, including simultaneous width,
         * color, outline, shadow and spacing-preference edits on mixed source runs.
         * @param {import('@tiptap/core').CommandProps} context - Existing command-chain transaction.
         * @returns {boolean} Confirms that scoped source changes joined the owning command.
         * @example
         * // Undo restores both a width edit and a font-space checkbox together.
         */
        ({tr})=>{applyCharacterLanguageChanges(editor,languageDraft.edits,tr);return true;}
      );
      hasCharacterCommands=true;
    }
    if (hasCharacterCommands) characterChain.run();
    editor.view.focus();
  } else {
    /** Whether the user chose a fixed physical line distance. */
    const fixed = values.lineMode === "FIXED";
    /** Unchanged imported spacing retains its original unit, precision and entry-bound exceptions. */
    const unchangedSpacing=!changedParagraphFields.has('line')&&values.lineMode===initial.lineMode;
    let lineValue:string;
    try{lineValue=unchangedSpacing?String(paragraph.lineHeight??'1.6'):parseLineSpacingInput(String(values.line),lineSpacingState(fixed?'0pt':'0',fixedLineSpacingMaximum(state.page)));}
    catch(error){return toast(error instanceof Error?error.message:'줄 간격을 확인하세요.',true);}
    /** Validated block settings applied in one document transaction. */
    const attributes: Record<string, string|number|boolean> = {};
    if(changedParagraphFields.has('snap-to-grid'))attributes.nativeSnapToGrid=values['snap-to-grid']===true;
    if(changedParagraphFields.has('minimum-space')){
      try{attributes.nativeParagraphCondense=parseParagraphMinimumSpace(values['minimum-space']);}
      catch(error){return toast(error instanceof Error?error.message:'최소 공백을 확인하세요.',true);}
    }
    if(changedParagraphFields.has('align'))attributes.textAlign=paragraphAlignment(values.align,'justify');
    if(changedParagraphFields.has('line')||changedParagraphFields.has('lineMode'))attributes.lineHeight=lineValue;
    for (/** Point-valued paragraph spacing attribute. */ const property of properties) {
      if(!changedParagraphFields.has(property)&&!(property==='textIndent'&&changedParagraphFields.has('indentMode')))continue;
      /** User-entered physical spacing in typographic points. */
      const value =
        property === "textIndent"
          ? values.indentMode === "NORMAL"
            ? 0
            : (changedParagraphFields.has(property)?Number(values[property]):Math.abs(Number(initial[property]))) *
              (values.indentMode === "HANGING" ? -1 : 1)
          : Number(values[property]);
      if (
        !Number.isFinite(value) ||
        Math.abs(value) > MAX_PARAGRAPH_DISTANCE ||
        ((property === "marginTop" || property === "marginBottom") && value < 0)
      )
        return toast("문단 여백을 확인하세요.", true);
      attributes[property] = value + "pt";
    }
    for(/** Only explicitly selected native modes replace their own original source fields. */const name of changedWordBreakFields)
      attributes[name==='breakLatinWord'?'nativeBreakLatinWord':'nativeBreakNonLatinWord']=Number(values[name]);
    if(!Object.keys(attributes).length){editor.view.focus();return;}
    editor.chain().updateAttributes('paragraph', attributes).updateAttributes('heading',attributes).run();
    editor.view.focus();
  }
}

/** Browser-only appearance memory stays outside document content and recovery storage. */
const browserFormatCopyMemory=new FormatCopyMemory();
/** An application with no accepted source starts with the original native character-only choice. */
const defaultFormatCopyOptions:FormatPainterOptions={mode:'character',cellProperties:false,cellBackground:false,cellOnly:false};

/**
 * Copy cursor appearance or apply the remembered source to an actual selection.
 *
 * A collapsed source cursor opens the original native copy dialog. Accepting
 * remembers an independent source snapshot without editing the document;
 * cancellation keeps the previous snapshot. A nonempty selection applies the
 * accepted choices in one undoable appearance transaction without reopening.
 * @async
 * @returns {Promise<void>} Resolves after the explicit copy decision or selected-source application.
 * @example
 * await formatPainter(); // Copy at the cursor, then apply after selecting target text.
 */
async function formatPainter():Promise<void>{
  if(editor.view.composing)return;
  try{
    /** Only the original invocation's source and selection may receive an asynchronously read snapshot. */
    const original=editor.state;
    /** Accepted native appearance belongs to the app process rather than the current source renderer. */
    let copied:FormatCopySession|null;
    if(native){
      /** The authenticated native bridge returns an independent app-session snapshot. */
      const result=await native.readFormatCopy();
      if(!result.ok)throw new Error(result.error);
      copied=result.value;
    }else copied=browserFormatCopyMemory.read();
    if($('#modal-root').firstChild||editor.view.composing||editor.state.doc!==original.doc||!editor.state.selection.eq(original.selection))return;
    if(!original.selection.empty){
      if(!copied){toast('복사한 모양이 없습니다. 복사할 글자 뒤에 커서를 놓고 모양 복사를 실행하세요.');return;}
      applyFormatPainter(editor,copied.source,copied.options);
      return;
    }
    /** Candidate source and draft remain independent from the last accepted app-session snapshot. */
    const source=captureFormatPainter(editor);
    if(!source)return;
    /** An actual non-cell source cannot borrow previous table-only choices. */
    const draft={...(copied?.options??defaultFormatCopyOptions),...(source.cellBackground===undefined?{cellProperties:false,cellBackground:false,cellOnly:false}:{})},
      decision=modal('모양 복사','',[],renderNativeFormatPainterDialog(draft,source.cellBackground!==undefined)),
      binding=bindNativeFormatPainterDialog($('.native-dialog-format-painter'),draft);
    try{
      if(await decision==='apply'){
        /** Only an explicitly accepted appearance snapshot can replace existing app-session memory. */
        const accepted:FormatCopySession={version:1,source,options:binding.read()};
        if(native){
          /** Rejected native writes preserve the earlier accepted source instead of diverging between windows. */
          const result=await native.writeFormatCopy(accepted);
          if(!result.ok)throw new Error(result.error);
        }else browserFormatCopyMemory.write(accepted);
      }
    }finally{binding.destroy();editor.view.focus();}
  }catch(error){toast(error instanceof Error?error.message:'모양 복사를 완료하지 못했습니다.',true);}
}

/**
 * Dispatch a measured native menu or ribbon command to the working editor.
 *
 * File actions retain the existing save guard, formatting uses undoable editor
 * transactions, and view-only changes do not modify the document's file content.
 *
 * @async
 * @param {string} command - Logical operation declared by a captured native control.
 * @param {HTMLElement} [anchor] - Activating control used for popover positioning and labels.
 * @returns {Promise<void>} Resolves when the selected operation has been handled.
 * @example
 * await runNativeCommand('page-settings', ribbonButton);
 */
async function runNativeCommand(
  command: string,
  anchor?: HTMLElement,
): Promise<void> {
  if ($("#modal-root").firstChild) return;
  if((command==='edit-object'||command==='object-properties')&&editor.isActive('table')){
    /** Only the actual invocation's immutable source table can receive an accepted dialog draft. */
    const context=captureTableProperties(editor);
    if(!context)return;
    /** Native controls retain exact source values behind their rounded physical display. */
    const values=tableCellDialogValues(editor,context),decision=modal('표/셀 속성','',[],renderNativeTableCellDialog(values)),binding=bindNativeTableCellDialog($('.native-dialog-table-cell'),values,context);
    try{
      if(await decision==='apply'){
        if(editor.state.doc!==context.doc)toast('문서가 바뀌었습니다. 표/셀 속성을 다시 실행하세요.',true);
        else applyTableProperties(editor,context,binding.read());
      }
    }catch(error){toast(error instanceof Error?error.message:'표/셀 속성을 적용하지 못했습니다.',true);}
    finally{binding.destroy();editor.view.focus();}
    return;
  }
  if (command === 'format-painter') {
    await formatPainter();
    return;
  }
  if (command === "ribbon-field-cancel") {
    synchronizeFormatRibbon(editor, anchor);
    editor.commands.focus();
    return;
  }
  if (anchor && applyRibbonField(editor, command, anchor)) return;
  if (command === "color") {
    colorPalettes.open(anchor || $("#font-color-button"));
    return;
  }
  if (command === "superscript" || command === "subscript") {
    editor
      .chain()
      .focus()
      .unsetMark(command === "superscript" ? "subscript" : "superscript")
      .toggleMark(command)
      .run();
    return;
  }
  if (command === "ribbon-changed") {
    updateToolbar();
    return;
  }
  if (command === "hyperlink") {
    await editHyperlink(editor, modal);
    return;
  }
  if (command === "hyperlink-previous" || command === "hyperlink-next") {
    if (!navigateHyperlink(editor, command === "hyperlink-previous"))
      toast("문서에 하이퍼링크가 없습니다.");
    return;
  }
  if (command === "quick-find") {
    $("#find-text").value =
      anchor instanceof HTMLInputElement ? anchor.value : "";
    toggleFind();
    findMatches();
    return;
  }
  if (command === "collapse-ribbon" || command === "hide-ribbon") {
    document.body.classList.toggle("ribbon-collapsed");
    return;
  }
  /** Native menu names that share an already implemented file or document action. */
  const aliases: Record<string, string> = {
    "save-pdf": "pdf",
    "export-pdf": "pdf",
    quit: "close",
    "close-document": "new",
    margins: "page-settings",
    "page-size": "page-settings",
    "paragraph-settings": "paragraph-format",
    "character-settings": "char-format",
    "font-dialog": "char-format",
    "toggle-outline": "show-outline",
    "toggle-ruler": "show-ruler",
    "fit-to-width": "fit-width",
    "fit-to-page": "fit-page",
    "full-screen": "fullscreen",
  };
  if (command === "application-menu") {
    nativeShell.selectTab("file");
    return;
  }
  command = aliases[command] || command;
  if (
    [
      "new",
      "open",
      "save",
      "save-as",
      "pdf",
      "print",
      "preview",
      "find",
      "help",
      "close",
    ].includes(command)
  ) {
    await action(command as AppAction);
    return;
  }
  if (command === "replace") {
    toggleFind();
    document.body.classList.add("replace-mode");
    $("#replace-text").focus();
    return;
  }
  if (command === "collapse-find") {
    $("#find-close").click();
    return;
  }
  if (command === "find-pane-add") {
    $(".native-find-options-toggle").click();
    return;
  }
  if (command === "table" || command === "insert-table") {
    positionMenu($("#table-menu"), anchor || $("#insert-table"));
    return;
  }
  if (
    command === "image" ||
    command === "picture" ||
    command === "insert-image" ||
    command === "import-image"
  ) {
    $("#image-input").click();
    return;
  }
  if (command === "page-settings") {
    await pageSettings();
    return;
  }
  if (command === "char-format" || command === "font") {
    await nativeFormatSettings("character");
    return;
  }
  if (command === "paragraph-format") {
    await nativeFormatSettings("paragraph");
    return;
  }
  if (command === "style" || command === "styles") {
    $("#block-style").focus();
    return;
  }
  if (command === "templates") {
    $("#show-templates").click();
    return;
  }
  if (command === "document-info") {
    await documentInfo();
    return;
  }
  if (command === "zoom") {
    await zoomSettings();
    return;
  }
  if (command === "font-size-up" || command === "font-size-down") {
    /** Size field belonging to the command's toolbar, or the persistent quick field. */
    const field =
      anchor instanceof HTMLInputElement
        ? anchor
        : anchor
            ?.closest(".native-ribbon")
            ?.querySelector<HTMLInputElement>(
              'input[data-native-action="font-size"]',
            ) || $("#font-size");
    stepFontSizeField(editor, field, command === "font-size-up" ? 1 : -1);
    return;
  }
  if (command === "show-outline" || command === "outline") {
    document.body.classList.toggle("outline-open");
    return;
  }
  if (command === "show-ruler" || command === "ruler") {
    document.body.classList.toggle("hide-rulers");
    return;
  }
  if (command === "page-outline") {
    document.body.classList.toggle("hide-page-outline");
    return;
  }
  if (command === "fullscreen") {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    return;
  }
  if (command === "zoom-in") {
    setZoom(state.zoom + 10);
    return;
  }
  if (command === "zoom-out") {
    setZoom(state.zoom - 10);
    return;
  }
  if (command === "fit-width" || command === "fit-page") {
    nativeFit?.select(command === "fit-width" ? "width" : "page");
    return;
  }
  if (command === "portrait" || command === "landscape") {
    /** Ordered paper edges used to change orientation without losing the selected paper size. */
    const edges = [
      Math.min(state.page.width, state.page.height),
      Math.max(state.page.width, state.page.height),
    ];
    /** An orientation change uses the same reversible physical-page transaction as the page dialog. */
    const page = validatePage({
      ...state.page,
      width: edges[command === "portrait" ? 0 : 1],
      height: edges[command === "portrait" ? 1 : 0],
    });
    if (JSON.stringify(page) !== JSON.stringify(state.page))
      editor.view.dispatch(closeHistory(editor.state.tr).step(new PageSettingsStep(state.page, page)));
    return;
  }
  if (command === "cut" || command === "copy") {
    editor.commands.focus();
    document.execCommand(command);
    return;
  }
  if (command === "paste") {
    try {
      /** Plain clipboard text inserted as authored content rather than interpreted HTML. */
      const text = await navigator.clipboard.readText();
      if (text)
        editor
          .chain()
          .focus()
          .insertContent(
            text.split(/\r?\n/).map(
              /**
               * Convert one clipboard line into a plain editable paragraph.
               *
               * Text is represented as a text node so angle brackets do not become markup.
               *
               * @param {string} line - One clipboard text line.
               * @returns {JSONContent} Paragraph preserving the line's text content.
               * @example
               * // "<b>" remains literal text after pasting.
               */
              (line) => ({
                type: "paragraph",
                content: line ? [{ type: "text", text: line }] : [],
              }),
            ),
          )
          .run();
    } catch {
      toast("붙여넣기는 Ctrl/⌘ V로도 사용할 수 있습니다.");
    }
    return;
  }
  if (command === "undo") {
    editor.commands.undo();
    return;
  }
  if (command === "redo") {
    editor.commands.redo();
    return;
  }
  if (command === "bold") {
    editor.chain().focus().toggleBold().run();
    return;
  }
  if (command === "italic") {
    editor.chain().focus().toggleItalic().run();
    return;
  }
  if (command === "underline") {
    editor.chain().focus().toggleUnderline().run();
    return;
  }
  if (command === "strike") {
    editor.chain().focus().toggleStrike().run();
    return;
  }
  if (command === "bullet-list" || command === "bullets") {
    editor.chain().focus().toggleBulletList().run();
    return;
  }
  if (command === "ordered-list" || command === "numbering") {
    editor.chain().focus().toggleOrderedList().run();
    return;
  }
  if (command.startsWith("align-")) {
    editor
      .chain()
      .focus()
      .setTextAlign(command.slice(6))
      .run();
    return;
  }
  if (command === "insert-pagebreak" || command === "page-break") {
    editor.chain().focus().insertContent({ type: "pageBreak" }).run();
    return;
  }
  if (command === "select-all") {
    editor.chain().focus().selectAll().run();
    return;
  }
  if (command === "clear-formatting") {
    editor.chain().focus().unsetAllMarks().run();
    return;
  }
  /** Visible native command label retained for an explicit unsupported-operation notice. */
  const label =
    anchor?.getAttribute("title")?.split(" : ")[0] ||
    anchor?.textContent?.trim() ||
    command;
  toast(`${label}: 현재 문서 편집기에서 지원하지 않는 명령입니다.`, true);
}

/**
 * Resolve menu availability from the current selection and document undo state.
 *
 * Measured blank-window menu data provides default states, but history and
 * selection commands must become available as the user edits a real document.
 *
 * @param {string} command - Logical native menu command being rendered.
 * @returns {boolean | undefined} Live disabled state or undefined to retain the captured default.
 * @example
 * nativeCommandDisabled('undo'); // false after an undoable document edit.
 */
function nativeCommandDisabled(command: string): boolean | undefined {
  if (command === "hyperlink-previous" || command === "hyperlink-next")
    return !editor.state.doc.rangeHasMark(
      0,
      editor.state.doc.content.size,
      editor.schema.marks.link,
    );
  if (command === "undo") return !editor.can().undo();
  if (command === "redo") return !editor.can().redo();
  if (command === "copy" || command === "cut" || command === "delete-selection")
    return editor.state.selection.empty;
  if (command === "edit-object" || command === "object-properties")
    return !(
      editor.isActive("image") ||
      editor.isActive("table") ||
      editor.isActive("preservedBlock")
    );
  return undefined;
}

/** Native-style menu and ribbon controller connected to live editor operations. */
const nativeShell = bindNativeShell({
  run: runNativeCommand,
  isDisabled: nativeCommandDisabled,
});
bindNativeScroll($(".native-shell"),editor.view);
nativeFit = bindNativeFit({
  canvas: $(".canvas"),
  /**
   * Read the active document's physical dimensions for a display-only fit.
   *
   * Imports and orientation changes use the same current page settings.
   * @returns {PageSettings} Current authored paper dimensions and margins.
   * @example
   * // A landscape change immediately changes the next fit calculation.
   */
  paper: () => state.page,
  /**
   * Read the explicit physical page group for persistent native fitting.
   *
   * Automatic arrangement fits one physical page before deriving actual columns.
   * @returns {{columns:number;rows:number}} Current explicit fit group dimensions.
   * @example
   * // A requested two-by-two group reserves both its horizontal and vertical paper framing.
   */
  grid:()=>{
    /** The registered view stays independent from physical document page settings. */
    const view=readNativePageView($('#paper'));
    return{columns:view.shape==='auto'||view.shape==='single'?1:view.shape==='two'||view.shape==='facing'?2:view.columns,rows:view.shape==='multiple'?view.rows:1};
  },
  /**
   * Apply a derived native fit percentage without cancelling the selected mode.
   *
   * Existing display controls update without creating a source transaction.
   * @param {number} zoom - Current fit percentage derived from physical geometry.
   * @returns {void} Applies the display scale and persistent mode label.
   * @example
   * // Resizing the canvas updates the fit without editing document content.
   */
  apply: (zoom: number) => setZoom(zoom, true),
});
native?.onAction(action);
document.addEventListener(
  "keydown",
  /**
   * Dispatch supported shortcuts while respecting dialogs and IME composition.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {KeyboardEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  (e) => {
    if ($("#modal-root").firstChild || e.isComposing) return;
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&(e.code==='KeyC'||e.key.toLowerCase()==='c')&&document.activeElement===editor.view.dom){
      e.preventDefault();
      void runNativeCommand('format-painter');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
      e.preventDefault();
      void runNativeCommand("replace");
      return;
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      ["s", "o", "n", "f", "p"].includes(e.key.toLowerCase())
    ) {
      e.preventDefault();
      /** Keyboard shortcut or page-setting property currently being processed. */
      const key = e.key.toLowerCase();
      action(
        key === "s" && e.shiftKey
          ? "save-as"
          : (
              { s: "save", o: "open", n: "new", f: "find", p: "print" } as const
            )[key as "s" | "o" | "n" | "f" | "p"],
      );
    }
    if (e.key === "Escape") {
      if (!$("#find-panel").hidden) {
        $("#native-find-options").hidden = true;
        editor.commands.focus();
      }
      $("#export-menu").hidden = true;
      $("#table-menu").hidden = true;
    }
  },
);
window.addEventListener(
  "beforeunload",
  /**
   * Keep unsaved browser edits behind the browser close confirmation.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {BeforeUnloadEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  (e) => {
    if (!native && state.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  },
);
/** Nested drag-target count controlling the local-file drop overlay. */
let dragDepth = 0;
document.addEventListener(
  "dragenter",
  /**
   * Show the local-file drop overlay when files enter the window.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {DragEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  (e) => {
    if ([...(e.dataTransfer?.types || [])].includes("Files")) {
      e.preventDefault();
      dragDepth++;
      $("#drop-overlay").hidden = false;
    }
  },
);
document.addEventListener(
  "dragleave",
  /**
   * Hide the drop overlay once the pointer leaves its nested drag targets.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      $("#drop-overlay").hidden = true;
    }
  },
);
document.addEventListener(
  "dragover",
  /**
   * Allow the application to receive a local-file drop.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {DragEvent} e DOM event raised by the bound application control.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  (e) => {
    if ([...(e.dataTransfer?.types || [])].includes("Files"))
      e.preventDefault();
  },
);
document.addEventListener(
  "drop",
  /**
   * Import the dropped document or embed the dropped local image.
   *
   * The event is routed through the existing document actions without changing the stored document format.
   * @param {DragEvent} e DOM event raised by the bound application control.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * handleEvent(event) // Performs the application action for this event.
   */
  async (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    dragDepth = 0;
    $("#drop-overlay").hidden = true;
    /** Local file selected from the picker or drag-and-drop payload. */
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith("image/")) await addImage(file);
    else await importFile({ name: file.name, data: await file.arrayBuffer() });
  },
);
applyPage();
update();
editor.commands.focus("start", { scrollIntoView: false });
refreshRecent().catch(
  /**
   * Keep recent-file refresh failure from blocking editor startup.
   *
   * The optional navigation refresh does not prevent the initial document from becoming editable.
   * @returns {void} Completes this editor update without returning a value.
   * @example
   * ignoreRecentRefreshFailure() // Leaves the editor available.
   */
  () => {},
);
(
  /**
   * Offer restoration of the stored recovery revision.
   *
   * The previous payload is opened only after the restore choice; explicit discard clears it from local storage.
   * @returns {Promise<void>} Resolves when the local document action or explicit dialog interaction completes.
   * @example
   * restorePreviousWork() // Offers the prior unsaved document when a recovery copy exists.
   */
  async () => {
    try {
      /** Previously stored recovery payload offered for explicit restoration. */
      const recovery = native
        ? await invoke("recovery")
        : JSON.parse(localStorage.getItem("forhan.recovery") || "null");
      if (recovery?.doc) {
        /** Explicit operation result used to decide whether the current flow may continue. */
        const result = await modal(
          "이전 작업을 복구할까요?",
          `<p><strong>${escape(recovery.title)}</strong> 문서의 자동 복구본이 있습니다.</p><p class="muted">복구하면 이전에 저장하지 못한 편집 내용을 이어 쓸 수 있습니다.</p>`,
          [
            { label: "삭제", value: "discard" },
            { label: "복구", value: "restore", primary: true },
          ],
        );
        if (result === "restore") {
          await loadDocument(recovery, true);
          toast("이전 작업을 복구했습니다.");
        } else if (result === "discard") await clearRecovery();
      }
    } catch (error) {
      toast("복구본 확인 중 오류: " + errorMessage(error), true);
    }
  }
)();
