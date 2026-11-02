import type { JSONContent } from "@tiptap/core";
import type {FormatCopySession} from './format-copy-session.ts';
export type {FormatCopySession} from './format-copy-session.ts';
import type { HwpxSource } from "./formats/hwpx";
import type { SectionGridSettings } from "./section-grid.ts";

/** Physical paper dimensions and margins, measured in millimetres. */
export interface PageSettings extends SectionGridSettings {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  header?: number;
  footer?: number;
}
/** Stable payload kinds; portable Forhan content uses the public .fhn file extension. */
export type DocumentFormat = "forhan" | "hwpx" | "hwp";
export type ExportFormat = DocumentFormat | "pdf" | "html" | "txt";
/** A portable document, including retained source material for faithful edits. */
export interface DocumentPayload {
  application?: "forhan";
  version?: 1;
  title?: string;
  doc: JSONContent;
  page?: PageSettings;
  source?: HwpxSource | null;
  original?: { format: string; base64: string; doc: JSONContent } | null;
  format?: DocumentFormat;
  warnings?: string[];
  updatedAt?: string;
}
export interface DocumentState {
  title: string;
  page: PageSettings;
  source: HwpxSource | null;
  original: DocumentPayload["original"];
  format: DocumentFormat;
  warnings: string[];
  dirty: boolean;
  zoom: number;
  outline: boolean;
  busy: boolean;
  composing: boolean;
}
export interface OpenedFile {
  name: string;
  data: Uint8Array | ArrayBuffer;
}
export interface SavedFile {
  name: string;
  path?: string;
}
export interface RecentFile {
  id: string;
  name: string;
  date: string;
}
export type BridgeResult<T> =
  { ok: true; value: T } | { ok: false; error: string };
/** The complete, intentionally narrow renderer-to-main process contract. */
export interface AsyncBridge {
  /**
   * Read copied appearance belonging to the current native application lifetime.
   *
   * Independent source snapshots survive renderer replacement without being
   * written to document files, recovery storage or the system clipboard.
   * @async
   * @returns {Promise<BridgeResult<FormatCopySession|null>>} Current accepted appearance or no copied source.
   * @throws {Error} If the isolated native transport cannot complete the request.
   * @example
   * const result=await window.forhan?.readFormatCopy();
   */
  readFormatCopy():Promise<BridgeResult<FormatCopySession|null>>;
  /**
   * Remember an explicitly accepted appearance snapshot for the current app session.
   *
   * The native process validates the bounded source before replacing prior
   * memory. Closing the final Mac window retains it; actual app exit clears it.
   * @async
   * @param {FormatCopySession} value - Independent copied source and accepted native choices.
   * @returns {Promise<BridgeResult<boolean>>} Whether the native application accepted the snapshot.
   * @throws {Error} If the isolated native transport cannot complete the request.
   * @example
   * await window.forhan?.writeFormatCopy({version:1,source,options});
   */
  writeFormatCopy(value:FormatCopySession):Promise<BridgeResult<boolean>>;
  /**
   * Open a document with the native file chooser.
   *
   * Reads the selected file in the main process and returns its name and bytes.
   * Canceling the chooser produces a successful null result.
   *
   * @returns {Promise<BridgeResult<OpenedFile | null>>} The selected document or cancellation.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * const result = await window.forhan?.open();
   */
  open(): Promise<BridgeResult<OpenedFile | null>>;
  /**
   * Reopen a document from the native recent-file list.
   *
   * Resolves an opaque recent-file identifier in the main process without
   * exposing arbitrary filesystem access to renderer code.
   *
   * @param {string} id - The identifier returned by the recent-file list.
   * @returns {Promise<BridgeResult<OpenedFile>>} The requested file name and bytes.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * const result = await window.forhan?.openRecent(recent.id);
   */
  openRecent(id: string): Promise<BridgeResult<OpenedFile>>;
  /**
   * Save document bytes through the native filesystem bridge.
   *
   * Uses the current document path when permitted, or asks the user to choose a
   * destination. The main process performs the final atomic replacement.
   *
   * @param {Uint8Array} data - The complete serialized document bytes.
   * @param {string} name - The proposed filename, including its extension.
   * @param {Exclude<ExportFormat, 'pdf'>} kind - The serialized document format.
   * @param {boolean} saveAs - Whether a destination chooser is required.
   * @returns {Promise<BridgeResult<SavedFile | null>>} The saved destination or cancellation.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * await window.forhan?.save(bytes, 'Report.hwpx', 'hwpx', true);
   */
  save(
    data: Uint8Array,
    name: string,
    kind: Exclude<ExportFormat, "pdf">,
    saveAs: boolean,
  ): Promise<BridgeResult<SavedFile | null>>;
  /**
   * Export printable document content as a native PDF file.
   *
   * Sends sanitized print markup and physical page settings to an isolated
   * main-process print window, then asks the user for an output destination.
   *
   * @param {string} html - The printable document markup.
   * @param {PageSettings} page - Physical paper dimensions and margins.
   * @param {string} title - The document title used for the proposed PDF filename.
   * @returns {Promise<BridgeResult<SavedFile | null>>} The exported PDF destination or cancellation.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * await window.forhan?.exportPdf(printHtml, settings, 'Report');
   */
  exportPdf(
    html: string,
    page: PageSettings,
    title: string,
  ): Promise<BridgeResult<SavedFile | null>>;
  /**
   * Open the operating system's interactive print dialog for a document.
   *
   * Uses the same isolated page layout as PDF export. Cancellation returns false
   * and never changes the document's saved path or dirty state.
   * @param {string} html - Printable document markup.
   * @param {PageSettings} page - Physical paper size and margins in millimetres.
   * @param {string} title - Title displayed for the print job.
   * @returns {Promise<BridgeResult<boolean>>} Whether the print job was accepted.
   * @throws {Error} If IPC cannot complete the request.
   * @example
   * await window.forhan?.printDocument('<p>Report</p>', settings, 'Report');
   */
  printDocument(
    html: string,
    page: PageSettings,
    title: string,
  ): Promise<BridgeResult<boolean>>;
  /**
   * Open a paginated snapshot using the document's actual print layout.
   *
   * The preview has independent zoom and page navigation and does not change
   * the document's saved path. Its generated PDF is removed when it closes.
   * @param {string} html - Printable document markup.
   * @param {PageSettings} page - Physical page geometry in millimetres.
   * @param {string} title - Caption for the preview window.
   * @returns {Promise<BridgeResult<boolean>>} Whether the preview was opened.
   * @throws {Error} If the IPC transport cannot complete the operation.
   * @example
   * await window.forhan?.previewDocument(html, page, 'Report');
   */
  previewDocument(
    html: string,
    page: PageSettings,
    title: string,
  ): Promise<BridgeResult<boolean>>;
  /**
   * Read the latest unsaved-work recovery snapshot.
   *
   * Retrieves the application-owned recovery file without changing the active
   * document or deleting the retained snapshot.
   *
   * @returns {Promise<BridgeResult<DocumentPayload | null>>} The retained document or null.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * const snapshot = await window.forhan?.recovery();
   */
  recovery(): Promise<BridgeResult<DocumentPayload | null>>;
  /**
   * Persist an unsaved-work recovery snapshot.
   *
   * Stores the portable document payload in the application-owned profile so
   * the renderer can offer recovery after a later launch.
   *
   * @param {DocumentPayload} data - The complete document state to retain.
   * @returns {Promise<BridgeResult<boolean>>} Whether recovery persistence succeeded.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * await window.forhan?.recover(documentPayload);
   */
  recover(data: DocumentPayload): Promise<BridgeResult<boolean>>;
  /**
   * Remove the retained unsaved-work snapshot.
   *
   * Clears application-owned recovery data after an explicit discard or a
   * successful save so obsolete edits are not offered again.
   *
   * @returns {Promise<BridgeResult<void>>} Completion of the recovery cleanup.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * await window.forhan?.clearRecovery();
   */
  clearRecovery(): Promise<BridgeResult<void>>;
  /**
   * Read the native recent-document list.
   *
   * Returns display metadata and opaque identifiers for files previously opened
   * or saved through the main-process document bridge.
   *
   * @returns {Promise<BridgeResult<RecentFile[]>>} The ordered recent-document entries.
   * @throws {Error} If the IPC transport cannot complete the request.
   * @example
   * const recent = await window.forhan?.recent();
   */
  recent(): Promise<BridgeResult<RecentFile[]>>;
}
export type AppAction =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "pdf"
  | "print"
  | "preview"
  | "find"
  | "help"
  | "close"
  | { type: "open-file"; payload: OpenedFile };
export interface DesktopBridge extends AsyncBridge {
  /** Actual desktop host supplied by the isolated preload; browser-only sessions omit this field. */
  readonly platform?:string;
  /**
   * Apply a native window command from the custom application caption.
   *
   * Only minimize, maximize and close are exposed; close still passes through
   * the renderer's unsaved-document confirmation before the window is destroyed.
   *
   * @param {'minimize' | 'maximize' | 'close'} command - The supported native window operation.
   * @returns {void} Sends the command to the owning desktop window.
   * @example
   * window.forhan?.windowControl('minimize');
   */
  windowControl(command: "minimize" | "maximize" | "close"): void;
  /**
   * Synchronize the active document's unsaved state with the main process.
   *
   * Updates the native close guard whenever an edit or completed save changes
   * whether the active document contains unsaved work.
   *
   * @param {boolean} value - Whether the active document has unsaved changes.
   * @returns {void} Sends the updated state to the main process.
   * @example
   * window.forhan?.setDirty(true);
   */
  setDirty(value: boolean): void;
  /**
   * Reset the native destination associated with the active document.
   *
   * Clears the previous save-path binding when the renderer creates or replaces
   * its document, preventing a new document from reusing an unrelated path.
   *
   * @returns {void} Sends the document reset notification.
   * @example
   * window.forhan?.resetDocument();
   */
  resetDocument(): void;
  /**
   * Complete a renderer-approved native window close.
   *
   * Notifies the main process after the renderer has resolved the unsaved-work
   * dialog, allowing the owned editor window to close. A rejected close cancels
   * pending application quit intent while retaining the document and process.
   *
   * @param {boolean} [confirmed=true] - Whether the current document may close.
   * @returns {void} Sends the approved close notification.
   * @example
   * window.forhan?.close();
   */
  close(confirmed?: boolean): void;
  /**
   * Subscribe to native menu and document actions.
   *
   * Receives the narrow application action union from the main process and
   * returns a function that removes this listener during renderer cleanup.
   *
   * @param {(action: AppAction) => void} callback - The renderer action handler.
   * @returns {() => void} A function that unregisters the action handler.
   * @example
   * const unsubscribe = window.forhan?.onAction(handleAction);
   */
  onAction(callback: (action: AppAction) => void): () => void;
}
declare global {
  interface Window {
    forhan?: DesktopBridge;
  }
}
