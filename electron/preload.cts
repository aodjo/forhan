import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { AppAction, BridgeResult, DesktopBridge, PageSettings } from '../src/types';

/** Native actions received before the asynchronously initialized editor subscribes retain their order. */
const pendingActions: AppAction[] = [];
/** Renderer subscribers receive supported actions without private Electron event objects. */
const actionListeners = new Set<(action: AppAction) => void>();
ipcRenderer.on('action',
  /**
   * Retain native actions until the editor is ready to receive them.
   *
   * The preload subscribes before document scripts execute, so local font loading
   * cannot discard an operating-system file request delivered after page loading.
   * @param {IpcRendererEvent} _event - Private event kept inside the isolated preload.
   * @param {AppAction} action - Supported native application action.
   * @returns {void} Queues the action or forwards it to current subscribers.
   * @example
   * // A file request arriving during font loading is delivered after subscription.
   */
  (_event: IpcRendererEvent, action: AppAction): void => {
    if (!actionListeners.size) pendingActions.push(action);
    else for (/** Each subscriber receives the same native action once. */ const listener of actionListeners) listener(action);
  },
);

/**
 * Invoke one named application operation.
 *
 * Keep raw IPC access inside the preload sandbox while preserving the typed result envelope.
 *
 * @param {string} channel - Registered application IPC channel.
 * @param {unknown[]} args - Structured-clone arguments forwarded to the native operation.
 * @returns {Promise<BridgeResult<T>>} The operation result or completion signal.
 * @example
 * await invoke("recent:list");
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<BridgeResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<BridgeResult<T>>;
}

/** Expose only document operations supported by the isolated main process. */
const bridge: DesktopBridge = {
  /**
   * Apply an allowed caption-button operation to the native editor window.
   *
   * The preload exposes named commands rather than raw IPC access, and the
   * main process authenticates the sender before changing window state.
   *
   * @param {'minimize' | 'maximize' | 'close'} command - The requested caption control.
   * @returns {void} Sends the supported command to the owning window.
   * @example
   * window.forhan?.windowControl('close'); // The unsaved-document guard still runs.
   */
  windowControl: command => { ipcRenderer.send('window:control', command); },
  open: /**
   * Open a document through the native picker.
   *
   * Return bytes only for a source file selected by the user.
   *
   * @returns {Promise<BridgeResult<OpenedFile | null>>} The operation result or completion signal.
   * @example
   * await window.forhan?.open();
   */
  () => invoke('document:open'),
  openRecent: /**
   * Open an opaque recent-document identifier.
   *
   * Resolve the source path in the main process instead of accepting an arbitrary renderer path.
   *
   * @param {string} id - Opaque identifier from the validated recent-document list.
   * @returns {Promise<BridgeResult<OpenedFile>>} The operation result or completion signal.
   * @example
   * await window.forhan?.openRecent("recent-document-id");
   */
  id => invoke('document:recent', id),
  save: /**
   * Request a native document save.
   *
   * Submit document bytes and the selected format while the main process controls the target path.
   *
   * @param {Uint8Array<ArrayBufferLike>} data - Document bytes or the recovery payload submitted by the editor.
   * @param {string} name - Configuration filename or document display name for this operation.
   * @param {"forhan" | "hwpx" | "html" | "txt"} kind - Document format to serialize and save.
   * @param {boolean} saveAs - Whether a native dialog must select a new save target.
   * @returns {Promise<BridgeResult<SavedFile | null>>} The operation result or completion signal.
   * @example
   * await window.forhan?.save(new Uint8Array(), "report.hwpx", "hwpx", true);
   */
  (data, name, kind, saveAs) => invoke('document:save', { data, name, kind, saveAs }),
  exportPdf: /**
   * Export HTML through a sandboxed print window.
   *
   * Disable page scripts and networking before atomically writing the native PDF result.
   *
   * @param {string} html - Editor HTML to render without scripts or network requests.
   * @param {PageSettings} page - Physical paper dimensions and margins, measured in millimetres.
   * @param {string} title - Document title used as the suggested PDF filename.
   * @returns {Promise<BridgeResult<SavedFile | null>>} The operation result or completion signal.
   * @example
   * await exportPdf({ html: "<p>Report</p>", page: {}, title: "Report" });
   */
  (html, page, title) => invoke('document:pdf', { html, page, title }),
  printDocument:
  /**
   * Request interactive printing through the authenticated native bridge.
   *
   * Passes only document markup, geometry and title into the isolated print
   * renderer; printer access and user confirmation remain in the main process.
   * @param {string} html - Printable document markup.
   * @param {PageSettings} page - Physical paper size and margins.
   * @param {string} title - Job title.
   * @returns {Promise<BridgeResult<boolean>>} Print acceptance or cancellation.
   * @example
   * window.forhan?.printDocument(html, page, 'Report');
   */
  (html, page, title) => invoke('document:print', { html, page, title }),
  previewDocument:
  /**
   * Request a paginated native preview without granting document file access.
   *
   * Only printable markup, page geometry and caption cross the isolated bridge.
   * @param {string} html - Printable document markup.
   * @param {PageSettings} page - Physical dimensions and margins.
   * @param {string} title - Preview caption.
   * @returns {Promise<BridgeResult<boolean>>} Whether a preview was opened.
   * @example
   * window.forhan?.previewDocument(html, page, 'Report');
   */
  (html, page, title) => invoke('document:preview', { html, page, title }),
  recovery: /**
   * Read the previous recovery snapshot.
   *
   * Retrieve a nullable document through the guarded main-process bridge.
   *
   * @returns {Promise<BridgeResult<DocumentPayload | null>>} The operation result or completion signal.
   * @example
   * await window.forhan?.recovery();
   */
  () => invoke('recovery:read'),
  recover: /**
   * Persist a recovery snapshot.
   *
   * Store the editor payload separately from the user-selected document file.
   *
   * @param {DocumentPayload} data - Document bytes or the recovery payload submitted by the editor.
   * @returns {Promise<BridgeResult<boolean>>} The operation result or completion signal.
   * @example
   * await window.forhan?.recover({ doc: { type: "doc", content: [] } });
   */
  data => invoke('recovery:write', data),
  clearRecovery: /**
   * Remove the automatic recovery snapshot.
   *
   * Clear previous recovery data after saving or explicitly discarding work.
   *
   * @returns {Promise<BridgeResult<void>>} The operation result or completion signal.
   * @example
   * await window.forhan?.clearRecovery();
   */
  () => invoke('recovery:clear'),
  recent: /**
   * List recent native documents.
   *
   * Expose display metadata and opaque identifiers without privileged file paths.
   *
   * @returns {Promise<BridgeResult<RecentFile[]>>} The operation result or completion signal.
   * @example
   * await window.forhan?.recent();
   */
  () => invoke('recent:list'),
  setDirty: /**
   * Update the native unsaved-change indicator.
   *
   * Notify the main process so closing the window can request a save decision.
   *
   * @param {boolean} value - Untrusted value to validate before accessing its properties.
   * @returns {void} The operation result or completion signal.
   * @example
   * window.forhan?.setDirty(true);
   */
  value => ipcRenderer.send('document:dirty', Boolean(value)),
  resetDocument: /**
   * Release the previous document save target.
   *
   * Prevent newly loaded documents from overwriting the preceding document file.
   *
   * @returns {void} The operation result or completion signal.
   * @example
   * window.forhan?.resetDocument();
   */
  () => ipcRenderer.send('document:reset'),
  /**
   * Close the editor after confirmation.
   *
   * Complete the native close operation after the editor resolves unsaved changes,
   * or cancel pending application quit intent when the document remains open.
   *
   * @param {boolean} [confirmed=true] - Whether the renderer approved closing its current document.
   * @returns {void} The operation result or completion signal.
   * @example
   * window.forhan?.close();
   */
  close: (confirmed = true) => ipcRenderer.send('window:close-confirmed', confirmed),
  /**
   * Subscribe to native application actions.
   *
   * Remove Electron event details and return an unsubscribe function for the renderer.
   *
   * @param {(action: AppAction) => void} callback - Renderer callback receiving only the supported application action.
   * @returns {() => void} The operation result or completion signal.
   * @example
   * const unsubscribe = window.forhan?.onAction(action => console.log(action));
   */
  onAction(callback) {
    actionListeners.add(callback);
    for (/** The initial native actions are delivered in their original order exactly once. */ const action of pendingActions.splice(0)) callback(action);
    /**
     * Unsubscribe from native application actions.
     *
     * Remove only the listener created by this subscription and retain other clients.
     *
     * @returns {void} The operation result or completion signal.
     * @example
     * unsubscribe();
     */
    function unsubscribe(): void { actionListeners.delete(callback); }
    return unsubscribe;
  },
};

contextBridge.exposeInMainWorld('forhan', bridge);
