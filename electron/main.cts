import { app, BrowserWindow, ipcMain, dialog, Menu, session } from 'electron';
import type { FileFilter, IpcMainEvent, IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { documentContentStyles, documentPageStyles } from '../src/document-styles.ts';
import { showPdfPreview, clearStalePreviews, isPreviewWindow } from './preview.cts';
import type { AppAction, BridgeResult, DocumentPayload, ExportFormat, OpenedFile, PageSettings, RecentFile, SavedFile } from '../src/types';

type SaveKind = Exclude<ExportFormat, 'pdf'>;
interface StoredRecent extends RecentFile { path: string }
interface SaveRequest { data: Uint8Array | ArrayBuffer; name: string; kind: SaveKind; saveAs: boolean }
interface PrintRequest { html: string; page: PageSettings; title: string }
type MainEvent = IpcMainEvent | IpcMainInvokeEvent;

/** Explicit Chromium profile directory used by isolated launches and desktop tests. */
const requestedProfile = app.commandLine.getSwitchValue('user-data-dir');
if (requestedProfile) app.setPath('userData', path.resolve(requestedProfile));
/** Ownership of the application profile's single editor process. */
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

let win: BrowserWindow | null = null;
let currentPath: string | null = null;
let currentKind: SaveKind | null = null;
let dirty = false;
let confirmedClose = false;
let queuedFile: string | null = null;
/** Whether initial startup has already created an editor window. */
let hasCreatedEditor = false;
/**
 * Maximum document size accepted by native operations, in bytes.
 */
const MAX = 100 * 1024 * 1024;
/**
 * Document extensions offered by the native file picker.
 */
const filters: FileFilter[] = [{ name: '한글·포한 문서', extensions: ['hwpx', 'hwp', 'fhn'] }, { name: '가져올 문서', extensions: ['txt', 'html', 'htm', 'forhan'] }];
/**
 * Document formats accepted by native save operations.
 */
const saveKinds: ReadonlySet<string> = new Set(['forhan', 'hwpx', 'hwp', 'txt', 'html']);

/**
 * Narrow an untrusted value to an object.
 *
 * Check the container before reading properties supplied over IPC or persisted JSON.
 *
 * @param {unknown} value - Untrusted value to validate before accessing its properties.
 * @returns {boolean} The operation result or completion signal.
 * @example
 * isObject({ name: "report.hwpx" });
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolve an application-owned configuration path.
 *
 * Keep private settings inside the operating-system user-data directory.
 *
 * @param {string} name - Configuration filename or document display name for this operation.
 * @returns {string} The operation result or completion signal.
 * @example
 * configPath("recent.json");
 */
function configPath(name: string): string {
  return path.join(app.getPath('userData'), name);
}

/**
 * Read a bounded JSON configuration file.
 *
 * Return null for missing, oversized, or damaged files so startup remains recoverable.
 *
 * @param {string} name - Configuration filename or document display name for this operation.
 * @returns {Promise<unknown>} The operation result or completion signal.
 * @example
 * await readJson("recovery.json");
 */
async function readJson(name: string): Promise<unknown> {
  try {
    /**
     * Application-owned configuration file path.
     */
    const filename = configPath(name);
    /**
     * Source metadata used to enforce regular-file and byte limits.
     */
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > MAX) return null;
    /**
     * Bounded UTF-8 configuration contents.
     */
    const content = await fs.readFile(filename, 'utf8');
    if (Buffer.byteLength(content) > MAX) return null;
    return JSON.parse(content) as unknown;
  } catch { return null; }
}

/**
 * Replace a file with a completed temporary write.
 *
 * Keep the previous document intact until replacement bytes are ready and remove abandoned temporary data.
 *
 * @param {string} target - Destination file selected by the native save flow.
 * @param {string | Uint8Array<ArrayBufferLike>} data - Document bytes or the recovery payload submitted by the editor.
 * @returns {Promise<void>} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * await atomicWrite("report.forhan", new Uint8Array([123, 125]));
 */
async function atomicWrite(target: string, data: string | Uint8Array): Promise<void> {
  /**
   * Unique temporary path beside the destination document.
   */
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }).catch(/**
   * Handle an asynchronous operation failure.
   *
   * Prevent cleanup or error reporting from leaving an unhandled rejection.
   *
   * @returns {undefined} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  () => undefined); }
}

/**
 * Load validated recent document metadata.
 *
 * Discard malformed records before exposing opaque document identifiers to the editor.
 *
 * @returns {Promise<StoredRecent[]>} The operation result or completion signal.
 * @example
 * await readRecent();
 */
async function readRecent(): Promise<StoredRecent[]> {
  /**
   * Untrusted persisted value awaiting validation.
   */
  const value = await readJson('recent.json');
  if (!Array.isArray(value)) return [];
  return value.filter(/**
   * Select valid collection entries.
   *
   * Retain records that satisfy the current document operation requirements.
   *
   * @param {unknown} item - Value supplied by the owning operation.
   * @returns {boolean} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  (item: unknown): item is StoredRecent => isObject(item)
    && typeof item.id === 'string' && typeof item.path === 'string'
    && typeof item.name === 'string' && typeof item.date === 'string').slice(0, 12);
}

/**
 * Record a selected document in recent history.
 *
 * Retain at most twelve unique paths and update the native operating-system history.
 *
 * @param {string} file - Absolute path selected by the user or operating system.
 * @returns {Promise<void>} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * await remember("C:/Documents/report.hwpx");
 */
async function remember(file: string): Promise<void> {
  /**
   * Previously validated recent document entries.
   */
  const items = await readRecent();
  /**
   * Metadata for the newly selected document.
   */
  const recent: StoredRecent = { id: randomUUID(), path: file, name: path.basename(file), date: new Date().toISOString() };
  await atomicWrite(configPath('recent.json'), JSON.stringify([recent, ...items.filter(/**
   * Select valid collection entries.
   *
   * Retain records that satisfy the current document operation requirements.
   *
   * @param {StoredRecent} item - Value supplied by the owning operation.
   * @returns {boolean} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  item => item.path !== file)].slice(0, 12)));
  app.addRecentDocument(file);
}

/**
 * Read a user-selected document.
 *
 * Enforce the byte limit without granting overwrite permission to the imported source.
 *
 * @param {string} file - Absolute path selected by the user or operating system.
 * @returns {Promise<OpenedFile>} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * await readDocument("C:/Documents/report.hwpx");
 */
async function readDocument(file: string): Promise<OpenedFile> {
  /**
   * Source metadata used to enforce regular-file and byte limits.
   */
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('열 수 있는 문서 파일을 선택하세요.');
  if (stat.size > MAX) throw new Error('100MB 이하 문서를 열 수 있습니다.');
  /**
   * Bytes read from the selected document.
   */
  const data = await fs.readFile(file);
  if (data.byteLength > MAX) throw new Error('100MB 이하 문서를 열 수 있습니다.');
  await remember(file);
  return { name: path.basename(file), data: new Uint8Array(data) };
}

/**
 * Authenticate the current editor main frame.
 *
 * Reject other windows and embedded frames before running privileged operations.
 *
 * @param {MainEvent} event - Electron IPC event used to authenticate the sending main frame.
 * @returns {BrowserWindow} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * const owner = requireSender(event);
 */
function requireSender(event: MainEvent): BrowserWindow {
  if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
    throw new Error('허용되지 않은 요청입니다.');
  }
  return win;
}

/**
 * Register a guarded IPC operation.
 *
 * Authenticate the sender and translate operation failures into the shared result envelope.
 *
 * @param {string} channel - Registered application IPC channel.
 * @param {(...args: unknown[]) => T | Promise<T>} operation - Guarded callback that implements the requested native operation.
 * @returns {void} The operation result or completion signal.
 * @example
 * handle("recent:list", readRecent);
 */
function handle<T>(channel: string, operation: (...args: unknown[]) => T | Promise<T>): void {
  ipcMain.handle(channel, /**
   * Complete the registered application callback.
   *
   * Run this callback only within its owning desktop operation or subscription.
   *
   * @param {IpcMainInvokeEvent} event - Electron IPC event used to authenticate the sending main frame.
   * @param {unknown[]} args - Structured-clone arguments forwarded to the native operation.
   * @returns {Promise<BridgeResult<T>>} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (event, ...args: unknown[]): Promise<BridgeResult<T>> => {
    try {
      requireSender(event);
      return { ok: true, value: await operation(...args) };
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' };
    }
  });
}

/**
 * Deliver a supported action to the editor.
 *
 * Skip delivery when the editor window has already been destroyed.
 *
 * @param {AppAction} action - Supported application action delivered to the editor.
 * @returns {void} The operation result or completion signal.
 * @example
 * send("save");
 */
function send(action: AppAction): void {
  if (win && !win.isDestroyed()) win.webContents.send('action', action);
}

/**
 * Return the live editor window.
 *
 * Require a valid owner before opening native document dialogs.
 *
 * @returns {BrowserWindow} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * const owner = editorWindow();
 */
function editorWindow(): BrowserWindow {
  if (!win || win.isDestroyed()) throw new Error('문서 편집 창이 없습니다.');
  return win;
}

/**
 * Validate an untrusted binary save request.
 *
 * Check its format, metadata, byte carrier, and size before allocating document bytes.
 *
 * @param {unknown} value - Untrusted value to validate before accessing its properties.
 * @returns {SaveRequest} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * parseSaveRequest({ data: new Uint8Array(), name: "report.hwpx", kind: "hwpx", saveAs: true });
 */
function parseSaveRequest(value: unknown): SaveRequest {
  if (!isObject(value) || typeof value.kind !== 'string' || !saveKinds.has(value.kind)
    || typeof value.name !== 'string' || typeof value.saveAs !== 'boolean'
    || (!(value.data instanceof Uint8Array) && !(value.data instanceof ArrayBuffer))) {
    throw new Error('저장할 문서와 형식을 확인하세요.');
  }
  if (value.data.byteLength > MAX) throw new Error('저장할 문서가 100MB를 넘습니다.');
  return { data: value.data, name: value.name, kind: value.kind as SaveKind, saveAs: value.saveAs };
}

/**
 * Validate physical print geometry.
 *
 * Apply defaults to omitted settings and reject dimensions that leave no usable text area.
 *
 * @param {unknown} value - Untrusted value to validate before accessing its properties.
 * @returns {PageSettings} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * parsePage({ width: 210, height: 297, marginTop: 25, marginBottom: 25, marginLeft: 25, marginRight: 25 });
 */
function parsePage(value: unknown): PageSettings {
  /**
   * Default A4 print geometry.
   */
  const fallback: PageSettings = { width: 210, height: 297, marginTop: 20, marginBottom: 15, marginLeft: 30, marginRight: 30, header: 0, footer: 0 };
  /**
   * Validated physical print dimensions and margins.
   */
  const page: PageSettings = { ...fallback };
  if (isObject(value)) {
    /** The current physical page dimension or margin key being validated. */
    for (const key of ["width","height","marginTop","marginBottom","marginLeft","marginRight","header","footer"] as const) {
      /**
       * The supplied value for the current page geometry property.
       */
      const input = value[key];
      if (typeof input === 'number' && Number.isFinite(input)) page[key] = input;
    }
  }
  if (page.width < 50 || page.height < 50 || page.width > 1200 || page.height > 1200
    || page.marginTop < 0 || page.marginBottom < 0 || page.marginLeft < 0 || page.marginRight < 0
    || (page.header ?? 0) < 0 || (page.footer ?? 0) < 0
    || page.marginLeft + page.marginRight >= page.width - 20 || page.marginTop + (page.header ?? 0) + page.marginBottom + (page.footer ?? 0) >= page.height - 20) {
    throw new Error('인쇄할 용지 크기와 여백을 확인하세요.');
  }
  return page;
}

/**
 * Recognize a recoverable document root.
 *
 * Check the outer shape while leaving detailed document-node validation to the editor.
 *
 * @param {unknown} value - Untrusted value to validate before accessing its properties.
 * @returns {boolean} The operation result or completion signal.
 * @example
 * isDocumentPayload({ doc: { type: "doc", content: [] } });
 */
function isDocumentPayload(value: unknown): value is DocumentPayload {
  return isObject(value) && isObject(value.doc) && value.doc.type === 'doc' && Array.isArray(value.doc.content);
}

/**
 * Export HTML through a sandboxed print window.
 *
 * Disable page scripts and networking before atomically writing the native PDF result.
 *
 * @param {unknown} value - Untrusted value to validate before accessing its properties.
 * @returns {Promise<SavedFile | null>} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * await exportPdf({ html: "<p>Report</p>", page: {}, title: "Report" });
 */
async function exportPdf(value: unknown): Promise<SavedFile | null> {
  if (!isObject(value) || typeof value.html !== 'string' || Buffer.byteLength(value.html) > MAX || typeof value.title !== 'string') {
    throw new Error('인쇄할 문서가 올바르지 않습니다.');
  }
  /**
   * Validated HTML and print geometry.
   */
  const request: PrintRequest = { html: value.html, page: parsePage(value.page), title: value.title };
  /**
   * The result returned by the native document dialog.
   */
  const result = await dialog.showSaveDialog(editorWindow(), {
    defaultPath: path.basename(request.title || '제목 없는 문서').replace(/\.[^.]+$/, '') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;
  /** Isolated, fully loaded print renderer owned by this export. */
  const print = await createPrintWindow(request);
  try {
    /**
     * Completed PDF bytes produced by Chromium.
     */
    const pdf = await print.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    /**
     * Destination approved by the native save flow.
     */
    const target = result.filePath.toLowerCase().endsWith('.pdf') ? result.filePath : result.filePath + '.pdf';
    await atomicWrite(target, pdf);
    return { name: path.basename(target) };
  } finally { print.destroy(); }
}

/**
 * Create and load the isolated document renderer shared by PDF and printing.
 *
 * Scripts, external resources, popups and navigation are disabled. The caller
 * owns the returned window and must destroy it after its print job completes.
 * @param {PrintRequest} request - Validated markup, title and physical geometry.
 * @returns {Promise<BrowserWindow>} Fully loaded sandboxed print window.
 * @throws {Error} If loading fails; the failed window is destroyed first.
 * @example
 * const print = await createPrintWindow(request);
 */
async function createPrintWindow(request: PrintRequest): Promise<BrowserWindow> {
  /**
   * Physical page geometry used in the print stylesheet.
   */
  const p = request.page;
  /**
   * Temporary sandboxed window shared by PDF export and interactive printing.
   */
  const print = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, javascript: false, spellcheck: false } });
  print.webContents.setWindowOpenHandler(/**
   * Complete the registered application callback.
   *
   * Run this callback only within its owning desktop operation or subscription.
   *
   * @returns {{ action: "deny"; }} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  () => ({ action: 'deny' }));
  print.webContents.on('will-navigate', /**
   * Handle the will-navigate application operation.
   *
   * Keep this callback scoped to the registered will-navigate lifecycle or IPC event.
   *
   * @param {Event<WebContentsWillNavigateEventParams>} event - Electron IPC event used to authenticate the sending main frame.
   * @returns {void} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  event => event.preventDefault());

  /** Escaped job caption, kept literal even when a document title contains markup. */
  const title = request.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  /** Shared print stylesheet and document markup, with all external resources blocked. */
  const content = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><style>${documentPageStyles(p)}body{margin:0;}${documentContentStyles('body')}</style></head><body>${request.html}</body></html>`;
  try {
    await print.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(content));
    return print;
  } catch (error) { print.destroy(); throw error; }
}

/**
 * Present an interactive operating-system print dialog for the document.
 *
 * Reuses PDF layout without writing a file or changing document ownership.
 * Printer cancellation resolves false; device errors propagate through IPC.
 * Only an accepted interactive job resolves true, and the renderer is always
 * destroyed after the print callback or a synchronous printer error.
 * @param {unknown} value - Untrusted printable request from the authenticated editor.
 * @returns {Promise<boolean>} Whether the operating system accepted the job.
 * @throws {Error} If validation, loading or native printing fails.
 * @example
 * await printDocument({html: '<p>Report</p>', page: {}, title: 'Report'});
 */
async function printDocument(value: unknown): Promise<boolean> {
  if (!isObject(value) || typeof value.html !== 'string' || Buffer.byteLength(value.html) > MAX || typeof value.title !== 'string') throw new Error('인쇄할 문서가 올바르지 않습니다.');
  /** Validated print content and geometry; the file save path is never consulted. */
  const request: PrintRequest = {html: value.html, page: parsePage(value.page), title: value.title};
  /** Fully loaded, isolated document window owned by this one job. */
  const print = await createPrintWindow(request);
  try {
    return await new Promise<boolean>(
      /**
       * Submit a user-confirmed print job through Chromium's native print dialog.
       *
       * The callback settles only after printer acceptance, cancellation or error.
       * Explicit physical dimensions prevent silent substitution of default paper.
       * @param {(value: boolean) => void} resolve - Receives job acceptance or cancellation.
       * @param {(reason: Error) => void} reject - Receives a printer failure.
       * @returns {void} Opens the interactive dialog without automatic printing.
       * @example
       * // Cancelling the system dialog resolves false.
       */
      (resolve, reject) => {
        print.webContents.print({silent: false, printBackground: true, landscape: request.page.width > request.page.height, pageSize: {width: Math.round(Math.min(request.page.width, request.page.height) * 1000), height: Math.round(Math.max(request.page.width, request.page.height) * 1000)}},
          /**
           * Translate the printer callback into an explicit application result.
           *
           * User cancellation is normal; other native failures remain visible errors.
           * @param {boolean} success - Whether Chromium accepted the print job.
           * @param {string} reason - Native cancellation or failure description.
           * @returns {void} Settles the print request without mutating the document.
           * @example
           * // A cancelled print job does not mark unsaved work as saved.
           */
          (success, reason) => { if (success) resolve(true); else if (/cancel/i.test(reason)) resolve(false); else reject(new Error(reason || '인쇄 작업을 시작하지 못했습니다.')); });
      });
  } finally { if (!print.isDestroyed()) print.destroy(); }
}

/**
 * Render an independent print-layout snapshot in the native PDF viewer.
 *
 * Reuses the isolated PDF renderer and never opens a save or printer chooser.
 * The temporary HTML renderer is destroyed before displaying the resulting PDF.
 * @param {unknown} value - Authenticated editor's untrusted printable request.
 * @returns {Promise<boolean>} True once the PDF preview has loaded.
 * @throws {Error} If request validation, PDF generation or preview loading fails.
 * @example
 * await previewDocument({html: '<p>Report</p>', page: {}, title: 'Report'});
 */
async function previewDocument(value: unknown): Promise<boolean> {
  if (!isObject(value) || typeof value.html !== 'string' || Buffer.byteLength(value.html) > MAX || typeof value.title !== 'string') throw new Error('미리 볼 문서가 올바르지 않습니다.');
  /** Immutable print request owned by this preview operation. */
  const request: PrintRequest = {html: value.html, page: parsePage(value.page), title: value.title};
  /** Source window is captured before asynchronous rendering begins. */
  const owner = editorWindow();
  /** Sandboxed HTML renderer, separate from both the editor and PDF viewer. */
  const print = await createPrintWindow(request);
  /** Generated snapshot retained until the PDF viewer takes ownership. */
  let bytes: Buffer;
  try { bytes = await print.webContents.printToPDF({printBackground: true, preferCSSPageSize: true}); }
  finally { if (!print.isDestroyed()) print.destroy(); }
  if (owner.isDestroyed()) return false;
  await showPdfPreview(bytes, request.title, owner);
  return true;
}

/**
 * Create the isolated desktop editor.
 *
 * Reset document ownership and deliver queued operating-system document requests after loading.
 *
 * @returns {Promise<void>} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * await createWindow();
 */
async function createWindow(): Promise<void> {
  currentPath = null;
  currentKind = null;
  dirty = false;
  confirmedClose = false;
  let rendererAlive = true;
  /** Native window owned by this lifecycle, independent of later replacement windows. */
  const owner = new BrowserWindow({
    width: 1440, height: 960, minWidth: 950, minHeight: 640, backgroundColor: '#f5f5f5', title: '포한 · Forhan',
    frame: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win = owner;
  hasCreatedEditor = true;
  if (process.platform !== 'darwin') owner.setMenu(null);
  owner.webContents.on('before-input-event',
    /**
     * Route application shortcuts before Chromium or the native menu consumes them.
     *
     * Prevents duplicate menu and renderer dispatch for file actions while leaving
     * text editing shortcuts and active IME composition to the document editor.
     *
     * @param {Electron.Event} event - The cancellable native keyboard event.
     * @param {Electron.Input} input - Keyboard modifiers, key identity and composition state.
     * @returns {void} Dispatches one supported application action when appropriate.
     * @example
     * // Pressing Ctrl+S or Command+S sends the single "save" application action.
     */
    (event, input) => {
      if (input.type !== 'keyDown' || input.isComposing || !(input.control || input.meta)) return;
      /** Application commands that own their native modifier-key shortcuts. */
      const shortcuts: Partial<Record<string, AppAction>> = { s: input.shift ? 'save-as' : 'save', o: 'open', n: 'new', f: 'find', p: 'print', w: 'close' };
      /** The command selected by the pressed key, if the application owns it. */
      const command = shortcuts[input.key.toLowerCase()];
      if (command) { event.preventDefault(); send(command); }
    });
  owner.webContents.setWindowOpenHandler(/**
   * Complete the registered application callback.
   *
   * Run this callback only within its owning desktop operation or subscription.
   *
   * @returns {{ action: "deny"; }} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  () => ({ action: 'deny' }));
  owner.webContents.on('will-navigate', /**
   * Handle the will-navigate application operation.
   *
   * Keep this callback scoped to the registered will-navigate lifecycle or IPC event.
   *
   * @param {Event<WebContentsWillNavigateEventParams>} event - Electron IPC event used to authenticate the sending main frame.
   * @returns {void} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  event => event.preventDefault());
  owner.webContents.on('render-process-gone', /**
   * Remember that the editor process can no longer confirm a close request.
   *
   * Keep a crashed renderer from trapping the native window in the normal close handshake.
   *
   * @returns {void} Updates the renderer availability flag for this window.
   * @example
   * // Electron invokes this callback after the owned renderer terminates.
   */
  () => { rendererAlive = false; });
  owner.on('close', /**
   * Ask the editor to resolve every unconfirmed native close request.
   *
   * The renderer owns the latest document state, which can be newer than its asynchronous
   * dirty-state IPC message. A crashed renderer uses a native confirmation instead.
   *
   * @param {{ preventDefault: () => void; readonly defaultPrevented: boolean; }} event - Native close event to defer until the editor confirms.
   * @returns {void} Prevents closing until the latest editor state has been checked.
   * @example
   * // BrowserWindow.close() enters this handshake before destroying the document window.
   */
  event => {
    if (confirmedClose) return;
    if (!rendererAlive || owner.webContents.isDestroyed()) {
      if (!owner.isDestroyed() && dialog.showMessageBoxSync(owner, {
        type: 'question', title: '포한', message: '편집 화면이 종료되었습니다. 창을 닫을까요?',
        detail: '저장하지 못한 변경 내용이 있을 수 있습니다.',
        buttons: ['돌아가기', '창 닫기'], defaultId: 0, cancelId: 0,
      }) === 0) event.preventDefault();
      return;
    }
    event.preventDefault();
    owner.webContents.send('action', 'close');
  });
  owner.on('closed', /**
   * Release only the native window owned by this lifecycle.
   *
   * A delayed close event from an earlier window must not clear a replacement
   * window that was already created by application reactivation.
   *
   * @returns {void} Clears the active reference only if it still points to this window.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  () => { if (win === owner) win = null; });
  await owner.loadFile(path.join(__dirname, '../dist/index.html'));
  if (queuedFile && win === owner) {
    /**
     * Pending document path selected by the operating system.
     */
    const file = queuedFile;
    queuedFile = null;
    send({ type: 'open-file', payload: await readDocument(file) });
  }
}

/**
 * Initialize native document operations and menus.
 *
 * Prepare private storage, register the guarded bridge, and load the editor when Electron is ready.
 *
 * @returns {Promise<void>} The operation result or completion signal.
 * @throws {Error} When validation or a required native file operation fails.
 * @example
 * await initialize();
 */
async function initialize(): Promise<void> {
  /** Restrict Electron's eager dictionary initialization to local files before disabling its checker. */
  const dictionaryDirectory = pathToFileURL(path.join(app.getPath('userData'), 'Dictionaries') + path.sep).href;
  session.defaultSession.setSpellCheckerDictionaryDownloadURL(dictionaryDirectory);
  session.defaultSession.setSpellCheckerEnabled(false);
  await clearStalePreviews().catch(reportError);
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  handle('document:open', /**
   * Handle the document:open application operation.
   *
   * Keep this callback scoped to the registered document:open lifecycle or IPC event.
   *
   * @returns {Promise<OpenedFile | null>} The operation result or completion signal.
   * @throws {Error} When validation or a required native file operation fails.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (): Promise<OpenedFile | null> => {
    /**
     * The result returned by the native document dialog.
     */
    const result = await dialog.showOpenDialog(editorWindow(), { properties: ['openFile'], filters });
    /**
     * Source path selected in the native open dialog.
     */
    const selected = result.filePaths[0];
    return result.canceled || !selected ? null : readDocument(selected);
  });
  handle('document:recent', /**
   * Handle the document:recent application operation.
   *
   * Keep this callback scoped to the registered document:recent lifecycle or IPC event.
   *
   * @param {unknown} id - Opaque identifier from the validated recent-document list.
   * @returns {Promise<OpenedFile>} The operation result or completion signal.
   * @throws {Error} When validation or a required native file operation fails.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (id): Promise<OpenedFile> => {
    if (typeof id !== 'string') throw new Error('최근 문서가 올바르지 않습니다.');
    /**
     * The recent-document entry matching the requested opaque identifier.
     */
    const item = (await readRecent()).find(/**
     * Find a matching collection entry.
     *
     * Return the first document identifier or launch argument satisfying the selection criteria.
     *
     * @param {StoredRecent} recent - Value supplied by the owning operation.
     * @returns {boolean} The operation result or completion signal.
     * @example
     * // Invoked by the registered Electron event or collection operation.
     */
    recent => recent.id === id);
    if (!item) throw new Error('최근 문서를 찾을 수 없습니다.');
    return readDocument(item.path);
  });
  handle('document:save', /**
   * Handle the document:save application operation.
   *
   * Keep this callback scoped to the registered document:save lifecycle or IPC event.
   *
   * @param {unknown} value - Untrusted value to validate before accessing its properties.
   * @returns {Promise<SavedFile | null>} The operation result or completion signal.
   * @throws {Error} When validation or a required native file operation fails.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (value): Promise<SavedFile | null> => {
    /**
     * Local { data, name, kind, saveAs } value used by the current desktop operation.
     */
    const { data, name, kind, saveAs } = parseSaveRequest(value);
    /** Stable internal portable payload identifiers map to the public FHN filename extension. */
    const extension = kind === 'forhan' ? 'fhn' : kind;
    /**
     * Validated document bytes for the native save.
     */
    const bytes = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data);
    let target = currentKind === kind && !saveAs ? currentPath : null;
    if (!target) {
      /**
       * The result returned by the native document dialog.
       */
      const result = await dialog.showSaveDialog(editorWindow(), {
        defaultPath: path.basename(name || '제목 없는 문서').replace(/\.[^.]+$/, '') + '.' + extension,
        filters: [{ name: extension.toUpperCase() + ' 문서', extensions: [extension] }],
      });
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
      if (path.extname(target).toLowerCase() !== '.' + extension) target += '.' + extension;
    }
    await atomicWrite(target, bytes);
    if (kind === 'forhan' || kind === 'hwpx' || kind === 'hwp') { currentPath = target; currentKind = kind; await remember(target); }
    return { name: path.basename(target), path: target };
  });
  handle('recent:list', /**
   * Handle the recent:list application operation.
   *
   * Keep this callback scoped to the registered recent:list lifecycle or IPC event.
   *
   * @returns {Promise<RecentFile[]>} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (): Promise<RecentFile[]> => (await readRecent()).map(/**
   * Project collection data for the renderer.
   *
   * Retain only metadata required for the current native document operation.
   *
   * @param {StoredRecent} entry - Value supplied by the owning operation.
   * @returns {{ id: string; name: string; date: string; }} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  ({ id, name, date }) => ({ id, name, date })));
  handle('recovery:read', /**
   * Handle the recovery:read application operation.
   *
   * Keep this callback scoped to the registered recovery:read lifecycle or IPC event.
   *
   * @returns {Promise<DocumentPayload | null>} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (): Promise<DocumentPayload | null> => {
    /**
     * Untrusted persisted value awaiting validation.
     */
    const value = await readJson('recovery.json');
    return isDocumentPayload(value) ? value : null;
  });
  handle('recovery:write', /**
   * Handle the recovery:write application operation.
   *
   * Keep this callback scoped to the registered recovery:write lifecycle or IPC event.
   *
   * @param {unknown} value - Untrusted value to validate before accessing its properties.
   * @returns {Promise<boolean>} The operation result or completion signal.
   * @throws {Error} When validation or a required native file operation fails.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  async (value): Promise<boolean> => {
    if (!isDocumentPayload(value)) throw new Error('복구 문서의 내용이 올바르지 않습니다.');
    /**
     * Serialized automatic recovery snapshot.
     */
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > MAX) throw new Error('복구 문서 크기가 제한을 넘습니다.');
    await atomicWrite(configPath('recovery.json'), json);
    return true;
  });
  handle('recovery:clear', /**
   * Handle the recovery:clear application operation.
   *
   * Keep this callback scoped to the registered recovery:clear lifecycle or IPC event.
   *
   * @returns {Promise<void>} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  (): Promise<void> => fs.rm(configPath('recovery.json'), { force: true }));
  handle('document:pdf', exportPdf);
  handle('document:print', printDocument);
  handle('document:preview', previewDocument);
  ipcMain.on('document:dirty', /**
   * Handle the document:dirty application operation.
   *
   * Keep this callback scoped to the registered document:dirty lifecycle or IPC event.
   *
   * @param {IpcMainEvent} event - Electron IPC event used to authenticate the sending main frame.
   * @param {unknown} value - Untrusted value to validate before accessing its properties.
   * @returns {void} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  (event: IpcMainEvent, value: unknown) => {
    try { /**
     * The authenticated live editor window.
     */
    const window = requireSender(event); dirty = value === true; window.setDocumentEdited(dirty); } catch { /* Ignore messages from untrusted frames. */ }
  });
  ipcMain.on('document:reset', /**
   * Handle the document:reset application operation.
   *
   * Keep this callback scoped to the registered document:reset lifecycle or IPC event.
   *
   * @param {IpcMainEvent} event - Electron IPC event used to authenticate the sending main frame.
   * @returns {void} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  (event: IpcMainEvent) => {
    try { requireSender(event); currentPath = null; currentKind = null; } catch { /* Ignore messages from untrusted frames. */ }
  });
  ipcMain.on('window:control',
    /**
     * Apply a named caption operation to the authenticated editor window.
     *
     * Closing uses BrowserWindow.close so the existing unsaved-document handshake
     * remains authoritative for custom caption buttons on every platform.
     *
     * @param {IpcMainEvent} event - The isolated renderer's native command event.
     * @param {unknown} command - A requested minimize, maximize or close operation.
     * @returns {void} Applies a supported operation and ignores untrusted requests.
     * @example
     * // A caption close button enters the same save guard as Alt+F4.
     */
    (event: IpcMainEvent, command: unknown) => {
      try {
        /** Authenticated editor window associated with the custom caption control. */
        const target = requireSender(event);
        if (command === 'minimize') target.minimize();
        else if (command === 'maximize') { if (target.isMaximized()) target.unmaximize(); else target.maximize(); }
        else if (command === 'close') target.close();
      } catch { /* Ignore unsupported or untrusted caption requests. */ }
    });
  ipcMain.on('window:close-confirmed', /**
   * Handle the window:close-confirmed application operation.
   *
   * Keep this callback scoped to the registered window:close-confirmed lifecycle or IPC event.
   *
   * @param {IpcMainEvent} event - Electron IPC event used to authenticate the sending main frame.
   * @returns {void} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  (event: IpcMainEvent) => {
    try { /**
     * The authenticated live editor window.
     */
    const window = requireSender(event); confirmedClose = true; window.close(); } catch { /* Ignore messages from untrusted frames. */ }
  });
  /**
   * The recent-document entry matching the requested opaque identifier.
   */
  const item = /**
   * Create a native menu action.
   *
   * Connect a translated label and optional keyboard shortcut to a supported renderer command.
   *
   * @param {string} label - Translated menu label displayed by the operating system.
   * @param {AppAction} action - Supported application action delivered to the editor.
   * @param {string | undefined} accelerator - Optional cross-platform keyboard shortcut.
   * @returns {MenuItemConstructorOptions} The operation result or completion signal.
   * @example
   * item("Save", "save", "CmdOrCtrl+S");
   */
  (label: string, action: AppAction, accelerator?: string): MenuItemConstructorOptions => ({ label, accelerator, click: /**
   * Complete the registered application callback.
   *
   * Print actions target a focused snapshot when present; other operations
   * retain the active editor as their document owner.
   *
   * @param {Electron.MenuItem} _item - Selected application menu item.
   * @param {Electron.BaseWindow | undefined} focused - Window owning the menu action.
   * @returns {void} Routes the action to its owning document or snapshot.
   * @example
   * click(...args);
   */
  (_item, focused) => {
    if (action === 'print' && isPreviewWindow(focused)) focused.webContents.print({silent:false, printBackground:true},
      /**
       * Surface native PDF printer errors while keeping cancellation silent.
       *
       * The focused PDF snapshot remains open and the editable document is untouched.
       * @param {boolean} success - Whether the PDF print job was accepted.
       * @param {string} reason - Native cancellation or printer error description.
       * @returns {void} Reports unexpected printer failures only.
       * @example
       * // Cancelling the printer dialog leaves the snapshot visible.
       */
      (success, reason) => { if (!success && !/cancel/i.test(reason)) reportError(new Error(reason || '인쇄 작업을 시작하지 못했습니다.')); });
    else send(action);
  } });
  /**
   * Native application menu definitions.
   */
  const menu: MenuItemConstructorOptions[] = [];
  if (process.platform === 'darwin') menu.push({ role: 'appMenu' });
  menu.push(
    { label: '파일', submenu: [item('새 문서', 'new', 'CmdOrCtrl+N'), item('열기…', 'open', 'CmdOrCtrl+O'), item('저장', 'save', 'CmdOrCtrl+S'), item('다른 이름으로 저장…', 'save-as', 'CmdOrCtrl+Shift+S'), { type: 'separator' }, item('미리 보기', 'preview'), item('인쇄…', 'print', 'CmdOrCtrl+P'), item('PDF로 내보내기…', 'pdf'), { type: 'separator' }, { role: process.platform === 'darwin' ? 'close' : 'quit' }] },
    { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, item('찾기 및 바꾸기', 'find', 'CmdOrCtrl+F')] },
    { label: '보기', submenu: [{ role: 'togglefullscreen' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' as const }] : [])] },
    { label: '도움말', submenu: [item('포한 안내', 'help')] },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  /**
   * Document path supplied in operating-system launch arguments.
   */
  const fileArg = process.argv.slice(app.isPackaged ? 1 : 2).find(/**
   * Find a matching collection entry.
   *
   * Return the first document identifier or launch argument satisfying the selection criteria.
   *
   * @param {string} argument - Value supplied by the owning operation.
   * @returns {boolean} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  argument => /\.(hwpx|hwp|fhn|forhan|txt|html?)$/i.test(argument));
  if (fileArg) queuedFile = path.resolve(fileArg);
  await createWindow();
  app.on('activate', /**
   * Handle the activate application operation.
   *
   * Keep this callback scoped to the registered activate lifecycle or IPC event.
   *
   * @returns {void} The operation result or completion signal.
   * @example
   * // Invoked by the registered Electron event or collection operation.
   */
  () => {
    if (!BrowserWindow.getAllWindows().length) void createWindow().catch(reportError);
  });
}

/**
 * Present an asynchronous desktop error.
 *
 * Convert unknown failures into a readable native dialog instead of dropping a rejection.
 *
 * @param {unknown} error - Unknown asynchronous failure to show in a native error dialog.
 * @returns {void} The operation result or completion signal.
 * @example
 * reportError(new Error("Document could not be opened."));
 */
function reportError(error: unknown): void {
  dialog.showErrorBox('포한', error instanceof Error ? error.message : '문서를 열지 못했습니다.');
}

app.on('open-file', /**
 * Open an operating-system document request in an available editor window.
 *
 * Startup requests wait for initialization. Later macOS requests recreate an
 * editor after its last window closes, rather than leaving the document queued forever.
 *
 * @param {{ preventDefault: () => void; readonly defaultPrevented: boolean; }} event - Electron IPC event used to authenticate the sending main frame.
 * @param {string} file - Absolute path selected by the user or operating system.
 * @returns {void} The operation result or completion signal.
 * @example
 * // Invoked by the registered Electron event or collection operation.
 */
(event, file: string) => {
  event.preventDefault();
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
    void readDocument(file).then(/**
     * Continue the completed asynchronous operation.
     *
     * Deliver its result through the next application lifecycle step.
     *
     * @param {OpenedFile} payload - Value supplied by the owning operation.
     * @returns {void} The operation result or completion signal.
     * @example
     * // Invoked by the registered Electron event or collection operation.
     */
    payload => send({ type: 'open-file', payload })).catch(reportError);
  } else {
    queuedFile = file;
    if ((!win || win.isDestroyed()) && app.isReady() && hasCreatedEditor) {
      void createWindow().catch(reportError);
    }
  }
});
app.on('second-instance',
  /**
   * Forward another application launch to the existing local editor process.
   *
   * A single profile owns recovery and recent-document storage. Additional launches
   * deliver their document request to that owner instead of racing those files.
   *
   * @param {Electron.Event} event - The application relaunch notification.
   * @param {string[]} argumentsList - Command-line arguments from the additional launch.
   * @param {string} workingDirectory - Base directory for a relative document argument.
   * @returns {void} Focuses the editor and forwards a requested document when present.
   * @example
   * // Opening a second .hwp file delivers it to the existing editor and its save guard.
   */
  (event, argumentsList, workingDirectory) => {
    /** Document argument selected by the operating-system file association or launcher. */
    const selected = argumentsList.find(
      /**
       * Identify a supported document argument from a repeated application launch.
       *
       * Runtime flags and executable names are ignored without interpreting shell text.
       *
       * @param {string} argument - One command-line argument supplied by the new process.
       * @returns {boolean} Whether the argument names a supported document format.
       * @example
       * // "report.hwpx" matches while "--user-data-dir=..." does not.
       */
      argument => !argument.startsWith('-') && /\.(hwpx|hwp|fhn|forhan|txt|html?)$/i.test(argument));
    if (selected) {
      /** Absolute document filename requested by the additional launch. */
      const file = path.resolve(workingDirectory, selected);
      if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
        void readDocument(file).then(
          /**
           * Deliver the requested local document to the existing renderer save guard.
           *
           * The renderer resolves unsaved edits before replacing its active document.
           *
           * @param {OpenedFile} payload - Bytes read from the selected local document.
           * @returns {void} Sends the supported document-open action to the editor.
           * @example
           * // The active renderer asks to save current edits before loading the new document.
           */
          payload => send({ type: 'open-file', payload })).catch(reportError);
      } else queuedFile = file;
    }
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); }
    else if (app.isReady() && hasCreatedEditor) void createWindow().catch(reportError);
  });
if (primaryInstance) void app.whenReady().then(initialize).catch(reportError);
app.on('window-all-closed', /**
 * Handle the window-all-closed application operation.
 *
 * Keep this callback scoped to the registered window-all-closed lifecycle or IPC event.
 *
 * @returns {void} The operation result or completion signal.
 * @example
 * // Invoked by the registered Electron event or collection operation.
 */
() => { if (process.platform !== 'darwin') app.quit(); });
