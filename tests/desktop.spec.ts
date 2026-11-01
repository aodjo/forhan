import {DOCUMENT_END_KEY} from './helpers/native-keyboard.ts';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type Frame,
} from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from 'node:url';
import { tmpdir } from "node:os";
import path from "node:path";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";
import { spawnSync } from 'node:child_process';
import { desktopArguments, desktopLaunchOptions } from './helpers/desktop-launch';
/** Collected options and isolated document markup from a stubbed native print call. */
interface NativePrintCall { options: Electron.WebContentsPrintOptions; html: string; url: string }
/** Test-owned main-process state; actual printer submission is always intercepted. */
interface NativePrintHarness { calls: NativePrintCall[]; mode: 'success' | 'cancel' | 'failure'; saves: number }
/**
 * The temporary application profile used to keep desktop tests outside real user data.
 */
let profile: string;
/**
 * The isolated Electron application owned by the current desktop regression test.
 */
let desktop: ElectronApplication;
/**
 * The renderer page controlled by the current desktop regression test.
 */
let window: Page;
test.beforeEach(
  /**
   * Launch an isolated desktop test application.
   *
   * Creates a temporary application profile, launches the owned Electron instance and waits for its renderer to initialize.
   *
   * @returns {Promise<void>} The completion or inspection result used by the regression test.
   * @example
   * desktop = await electron.launch({ args: ['.'] });
   */
  async () => {
    profile = await mkdtemp(path.join(tmpdir(), "forhan-test-"));
    desktop = await electron.launch(desktopLaunchOptions(profile));
    window = await desktop.firstWindow();
    await window.waitForSelector(".tiptap");
  },
);
test.afterEach(
  /**
   * Clean up the desktop test application and profile.
   *
   * Terminates only the test-owned Electron process and removes its temporary profile after the test has completed.
   *
   * @returns {Promise<void>} The completion or inspection result used by the regression test.
   * @example
   * await desktop.close();
   */
  async () => {
    if (desktop) {
      await desktop
        .evaluate(
          /**
           * Terminate the owned Electron test process.
           *
           * Exits the isolated application directly during teardown so an unsaved-document dialog cannot block profile cleanup.
           *
           * @param {typeof CrossProcessExports} context - The isolated test or Electron process bindings supplied by Playwright.
           * @returns {void} Completes the test callback without returning a value.
           * @example
           * app.exit(0);
           */
          ({ app }) => app.exit(0),
        )
        .catch(
          /**
           * Ignore an already-completed teardown operation.
           *
           * Allows cleanup to continue when the test-owned process has already exited or closed its application connection.
           *
           * @returns {void} Completes the test callback without returning a value.
           * @example
           * await desktop.close().catch(() => {});
           */
          () => {},
        );
      await desktop.close().catch(
        /**
         * Ignore an already-completed teardown operation.
         *
         * Allows cleanup to continue when the test-owned process has already exited or closed its application connection.
         *
         * @returns {void} Completes the test callback without returning a value.
         * @example
         * await desktop.close().catch(() => {});
         */
        () => {},
      );
    }
    if (profile)
      await rm(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
  },
);
test("native isolated bridge saves atomically, reloads content and exports PDF", /**
 * Verify native document saving and PDF export.
 *
 * Exercises the isolated desktop bridge with deterministic native destinations and checks serialized document updates and the exported PDF signature.
 *
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await expect(window.locator('.tiptap')).toBeVisible();
 */
async () => {
  await expect(window.locator('#document-title')).toHaveValue('빈 문서 1');
  /**
   * The renderer bridge and Node-isolation state returned by the owned desktop window.
   */
  const bridge = await window.evaluate(
    /**
     * Inspect renderer process isolation.
     *
     * Checks that the narrow desktop bridge exists while the renderer has no unrestricted Node require function.
     *
     * @returns {{ desktop: boolean; node: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function"; }} The completion or inspection result used by the regression test.
     * @example
     * typeof (globalThis as { require?: unknown }).require;
     */
    () => ({
      desktop: !!globalThis.window.forhan,
      node: typeof (
        globalThis as unknown as {
          require?: unknown;
        }
      ).require,
    }),
  );
  expect(bridge).toEqual({ desktop: true, node: "undefined" });
  /**
   * The completed download or temporary native destination used by the test.
   */
  const output = path.join(profile, "한국어 문서.hwpx");
  await desktop.evaluate(
    /**
     * Provide a deterministic native save destination.
     *
     * Replaces the save chooser only inside the test-owned Electron process so filesystem assertions can inspect a known temporary path.
     *
     * @param {typeof CrossProcessExports} context - The isolated test or Electron process bindings supplied by Playwright.
     * @param {string} target - The temporary native save destination.
     * @returns {void} Completes the test callback without returning a value.
     * @example
     * dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
     */
    ({ dialog }, target) => {
      dialog.showSaveDialog =
        /**
         * Return the selected temporary save destination.
         *
         * Simulates a completed native save dialog using the temporary path supplied by the surrounding desktop test.
         *
         * @returns {Promise<{ canceled: false; filePath: string; }>} The completion or inspection result used by the regression test.
         * @example
         * ({ canceled: false, filePath: target });
         */
        async () => ({ canceled: false, filePath: target });
    },
    output,
  );
  await window.locator("#new-document").click();
  await window.locator("#document-title").fill("실제 데스크톱 검증");
  await window.locator(".tiptap").fill("맥과 윈도우를 위한 포한 문서입니다.");
  await window.keyboard.press("ControlOrMeta+s");
  await expect(window.locator("#save-state")).toContainText("저장됨");
  /**
   * The saved portable-document payload read from the chosen native destination.
   */
  const saved = await readHwpx(await readFile(output));
  expect(JSON.stringify(saved.doc)).toContain("포한 문서");
  await window.locator(".tiptap").press("End");
  await window.keyboard.insertText(" 수정 완료.");
  await window.locator("#save-document").click();
  await expect(window.locator("#save-state")).toContainText("저장됨");
  expect(JSON.stringify((await readHwpx(await readFile(output))).doc)).toContain("수정 완료");
  /**
   * The temporary PDF destination inside the test-owned application profile.
   */
  const pdf = path.join(profile, "인쇄.pdf");
  await desktop.evaluate(
    /**
     * Provide a deterministic native save destination.
     *
     * Replaces the save chooser only inside the test-owned Electron process so filesystem assertions can inspect a known temporary path.
     *
     * @param {typeof CrossProcessExports} context - The isolated test or Electron process bindings supplied by Playwright.
     * @param {string} target - The temporary native save destination.
     * @returns {void} Completes the test callback without returning a value.
     * @example
     * dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
     */
    ({ dialog }, target) => {
      dialog.showSaveDialog =
        /**
         * Return the selected temporary save destination.
         *
         * Simulates a completed native save dialog using the temporary path supplied by the surrounding desktop test.
         *
         * @returns {Promise<{ canceled: false; filePath: string; }>} The completion or inspection result used by the regression test.
         * @example
         * ({ canceled: false, filePath: target });
         */
        async () => ({ canceled: false, filePath: target });
    },
    pdf,
  );
  await window.locator("#export-menu-toggle").click();
  await window.locator('[data-export="pdf"]').click();
  await expect(window.locator("#toast")).toContainText("PDF");
  /**
   * Serialized document or PDF bytes used to verify native format output.
   */
  const bytes = await readFile(pdf);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1000);
  /** Legacy HWP destination chosen within the isolated test profile. */
  const legacy = path.join(profile, "문서.hwp");
  await desktop.evaluate(
    /**
     * Direct the native save chooser to the owned legacy-document destination.
     *
     * The replacement affects only this test process and allows the ordinary
     * save IPC to validate and write a genuine HWP file to a known location.
     *
     * @param {typeof import('electron')} context - Electron exports from the isolated main process.
     * @param {string} target - Temporary path used for the HWP export assertion.
     * @returns {void} Replaces the save chooser without touching user files.
     * @example
     * // The next save dialog resolves to the test-owned .hwp path.
     */
    ({ dialog }, target) => {
      dialog.showSaveDialog =
        /**
         * Resolve the selected HWP destination.
         *
         * Returns a successful save-dialog result without opening an interactive
         * chooser while the test checks the real native document-save handler.
         *
         * @async
         * @returns {Promise<{canceled: false; filePath: string}>} The owned output filename.
         * @example
         * await dialog.showSaveDialog(); // Resolves to the test HWP path.
         */
        async () => ({ canceled: false, filePath: target });
    }, legacy);
  await window.locator("#export-menu-toggle").click();
  await window.locator('[data-export="hwp"]').click();
  await expect(window.locator("#format-badge")).toHaveText("HWP");
  expect(JSON.stringify(readHwp(await readFile(legacy)).doc)).toContain("수정 완료");
  /** The actual FHN chooser maps a stable internal payload kind to the canonical public extension. */
  const portable = path.join(profile, 'portable-source');
  await desktop.evaluate(
    /**
     * Redirect the owned FHN chooser while checking its real default path and extension filter.
     *
     * Native serialization and filesystem output remain production operations.
     * @param {typeof import('electron')} context - Actual owned Electron exports.
     * @param {string} target - Owned extensionless destination selected by the test.
     * @returns {void} Installs the controlled chooser result.
     * @example
     * // Selecting an extensionless path must create exactly one .fhn suffix.
     */
    ({dialog},target)=>{
      dialog.showSaveDialog =
        /**
         * Validate actual FHN chooser options and select the owned extensionless path.
         *
         * A FORHAN filter or legacy suffix cannot pass as the public FHN format.
         * @async
         * @param {unknown[]} args - Actual native save-dialog overload arguments.
         * @returns {Promise<{canceled:false;filePath:string}>} Exact owned save result.
         * @throws {Error} If the live application offers a noncanonical extension.
         * @example
         * // The actual production handler appends .fhn to this extensionless path.
         */
        async(...args:unknown[])=>{
          /** Real production chooser metadata establishes the public save format. */
          const options=args.at(-1) as {defaultPath?:string;filters?:{extensions:string[]}[]};
          if(!options.defaultPath?.endsWith('.fhn')||options.filters?.[0].extensions.join(',')!=='fhn')throw new Error('The FHN save chooser has an incorrect extension.');
          return {canceled:false,filePath:target};
        };
    },portable,
  );
  await window.locator('#export-menu-toggle').click();
  await window.locator('[data-export="forhan"]').click();
  await expect(window.locator('#format-badge')).toHaveText('FHN');
  expect(JSON.parse(await readFile(portable+'.fhn','utf8')).application).toBe('forhan');
  expect(JSON.stringify(JSON.parse(await readFile(portable+'.fhn','utf8')).doc)).toContain('수정 완료');
});
test("native closing guard cancels and preserves unsaved text", /**
 * Verify cancellation of the native close guard.
 *
 * Requests a native window close with unsaved edits and confirms that canceling the renderer dialog preserves the active document.
 *
 * @returns {Promise<void>} The completion or inspection result used by the regression test.
 * @throws {Error} If initialization fails or an expected application behavior is not observed.
 * @example
 * await expect(window.locator('.tiptap')).toBeVisible();
 */
async () => {
  await window.locator("#new-document").click();
  await window.locator(".tiptap").fill("저장하지 않은 문서");
  await expect(window.locator("#save-state")).toContainText(
    "저장되지 않은 변경",
  );
  await desktop.evaluate(
    /**
     * Request a native close for the owned test window.
     *
     * Invokes the platform window close path so the regression test exercises the main-process unsaved-work guard.
     *
     * @param {typeof CrossProcessExports} context - The isolated test or Electron process bindings supplied by Playwright.
     * @returns {void} Completes the test callback without returning a value.
     * @example
     * BrowserWindow.getAllWindows()[0].close();
     */
    ({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].close();
    },
  );
  await expect(window.getByRole("dialog")).toContainText(
    "변경 내용을 저장할까요",
  );
  await window.getByRole("button", { name: "취소", exact: true }).click();
  await expect(window.locator(".tiptap")).toHaveText("저장하지 않은 문서");
  await expect(window.locator("#save-state")).toContainText(
    "저장되지 않은 변경",
  );
});

test("reactivated windows never reuse a previous document save destination",
  /**
   * Verify file-target isolation when the application creates a replacement window.
   *
   * Retains the production macOS application lifetime on Mac runners and emulates
   * it on other hosts, then saves a distinct document in the reactivated window.
   *
   * @async
   * @returns {Promise<void>} Resolves when both saved files retain their own content.
   * @throws {Error} If reopening the application reuses and overwrites the old save target.
   * @example
   * // The first document still contains "첫 문서" after the new window saves "새 창 문서".
   */
  async () => {
    /** Owned destinations for the original and reactivated-window documents. */
    const targets = [path.join(profile, 'first.hwpx'), path.join(profile, 'second.hwpx')];
    await desktop.evaluate(
      /**
       * Prepare deterministic destinations and retain the process after window closure.
       *
       * This changes only the isolated test process; consecutive native choosers
       * select distinct files so accidental target reuse can be detected.
       *
       * @param {typeof import('electron')} context - The isolated Electron main-process exports.
       * @param {string[]} destinations - Ordered save destinations owned by this test.
       * @returns {void} Installs the deterministic chooser and reactivation fixture.
       * @example
       * // The next two dialogs choose first.hwpx and second.hwpx respectively.
       */
      ({ app, dialog }, destinations) => {
        if (process.platform !== 'darwin') app.removeAllListeners('window-all-closed');
        let next = 0;
        dialog.showSaveDialog =
          /**
           * Choose the next test-owned document destination.
           *
           * Each new window must request its own path instead of silently reusing
           * the previously saved document target.
           *
           * @async
           * @returns {Promise<{canceled: false; filePath: string}>} The next isolated output path.
           * @example
           * await dialog.showSaveDialog(); // Selects the next owned document path.
           */
          async () => ({ canceled: false, filePath: destinations[next++] });
      }, targets);
    await window.locator('#new-document').click();
    await window.locator('.tiptap').fill('첫 문서');
    await window.locator('#save-document').click();
    await expect(window.locator('#save-state')).toContainText('저장됨');
    /** Window-close event registered before requesting the native close. */
    const closed = window.waitForEvent('close');
    await desktop.evaluate(
      /**
       * Close the clean first window through its ordinary native close guard.
       *
       * The application remains alive because the test removed only the exit listener.
       *
       * @param {typeof import('electron')} context - Electron exports in the owned test process.
       * @returns {void} Requests the current native window to close.
       * @example
       * // The renderer confirms the already-saved document may close.
       */
      ({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
    await closed;
    /** Replacement window expected after the simulated application activation. */
    const reopened = desktop.waitForEvent('window');
    await desktop.evaluate(
      /**
       * Trigger the same activation event used by macOS dock reactivation.
       *
       * The application's registered activation listener creates the replacement window.
       *
       * @param {typeof import('electron')} context - Electron exports in the owned test process.
       * @returns {void} Emits the activation event for the existing application.
       * @example
       * // A new document window opens without inheriting the previous save path.
       */
      ({ app }) => { app.emit('activate'); });
    window = await reopened;
    await window.waitForSelector('.tiptap');
    await window.locator('#new-document').click();
    await window.locator('.tiptap').fill('새 창 문서');
    await window.locator('#save-document').click();
    await expect(window.locator('#save-state')).toContainText('저장됨');
    expect(JSON.stringify((await readHwpx(await readFile(targets[0]))).doc)).toContain('첫 문서');
    expect(JSON.stringify((await readHwpx(await readFile(targets[1]))).doc)).toContain('새 창 문서');
  });

test("operating-system file requests reopen an editor after its last window closes",
  /**
   * Verify the macOS-style file-opening lifecycle in an already running application.
   *
   * Closes the clean editor while retaining the process, then supplies an owned
   * document through the same event used by Finder to reopen a document window.
   *
   * @async
   * @returns {Promise<void>} Resolves when the recreated editor contains the requested document.
   * @throws {Error} If the document remains queued without a window or cannot be loaded.
   * @example
   * // Opening a document from Finder recreates its editor even when no windows remain.
   */
  async () => {
    /** Portable document requested through the operating-system file-open event. */
    const filename = path.join(profile, 'reopen.fhn');
    await writeFile(filename, JSON.stringify({ application: 'forhan', version: 1, title: '다시 연 문서', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '파일 연결로 다시 열린 문서' }] }] } }));
    /** Close event registered before the clean native window is closed. */
    const closed = window.waitForEvent('close');
    await desktop.evaluate(
      /**
       * Keep the test process alive while closing its clean document window.
       *
       * Mac keeps its production window-all-closed listener; other hosts emulate its lifetime.
       *
       * @param {typeof import('electron')} context - Main-process Electron exports owned by the test.
       * @returns {void} Requests closure while retaining the isolated application process.
       * @example
       * // The app remains running with zero document windows.
       */
      ({ app, BrowserWindow }) => { if (process.platform !== 'darwin') app.removeAllListeners('window-all-closed'); BrowserWindow.getAllWindows()[0].close(); });
    await closed;
    /** New native window expected in response to the file-open request. */
    const reopened = desktop.waitForEvent('window');
    await desktop.evaluate(
      /**
       * Dispatch an owned file through the native document-open event.
       *
       * The event carries no external navigation and uses only the fixture path
       * created inside the isolated application profile.
       *
       * @param {typeof import('electron')} context - Main-process Electron exports owned by the test.
       * @param {string} target - The owned document that should open in the replacement window.
       * @returns {void} Emits the native document-open event.
       * @example
       * // The application's open-file listener creates the replacement editor.
       */
      ({ app }, target) => {
        app.emit('open-file', {
          defaultPrevented: false,
          /**
           * Acknowledge the synthetic native event's default-prevention request.
           *
           * The fixture has no operating-system default behavior to cancel.
           *
           * @returns {void} Leaves the test-owned synthetic event acknowledged.
           * @example
           * event.preventDefault(); // No operating-system side effect occurs in the fixture.
           */
          preventDefault() {},
        }, target);
      }, filename);
    window = await reopened;
    await expect(window.locator('.tiptap')).toContainText('파일 연결로 다시 열린 문서');
    await expect(window.locator('#document-title')).toHaveValue('다시 연 문서');
  });

test("a second launch forwards its document to the profile owner",
  /**
   * Verify that separate launches share one editor process and recovery owner.
   *
   * Starts another runtime against the same isolated profile and confirms that
   * its document is delivered to the existing window instead of starting a second editor.
   *
   * @async
   * @returns {Promise<void>} Resolves when the primary editor has opened the forwarded document.
   * @throws {Error} If the additional runtime fails to exit or its document is not forwarded.
   * @example
   * // Double-clicking another .fhn document opens it in the existing application.
   */
  async () => {
    /** Document requested by the additional application process. */
    const filename = path.join(profile, 'second-launch.fhn');
    await writeFile(filename, JSON.stringify({ application: 'forhan', version: 1, title: '다른 실행 요청', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '같은 프로필에서 전달한 문서' }] }] } }));
    /** Native runtime executable rather than a platform-specific launcher shell. */
    const runtime = await desktop.evaluate(
      /**
       * Identify the actual Electron executable inside the primary process.
       *
       * Windows test launchers may use a command-shell wrapper whose spawnfile
       * cannot be reused as the application runtime for a second-instance request.
       *
       * @returns {string} The executable path of the running native Electron process.
       * @example
       * process.execPath; // The real Electron executable, not cmd.exe.
       */
      () => process.execPath);
    /** Additional process result after it forwards the request and releases ownership. */
    const outcome = spawnSync(runtime, desktopArguments(profile, [filename]), { cwd: process.cwd(), env: { ...process.env, APPDATA: profile }, windowsHide: true, timeout: 15000, encoding: 'utf8' });
    expect(outcome.status, outcome.stderr).toBe(0);
    await expect(window.locator('.tiptap')).toContainText('같은 프로필에서 전달한 문서');
    await expect(window.locator('#document-title')).toHaveValue('다른 실행 요청');
  });

/**
 * Verify native printing uses its own interactive path and isolated page layout.
 *
 * Intercepts only the test-owned window's printer submission, so no paper or
 * system print dialog is used. Exercises the real IPC, Ctrl+P dispatch, page
 * geometry, callback outcomes and destruction of temporary rendering windows.
 * @async
 * @returns {Promise<void>} Resolves when interactive printing preserves document state.
 * @throws {Error} If printing saves a PDF, loses geometry or leaks a print window.
 * @example
 * // Printer cancellation resolves false while the manuscript stays unsaved.
 */
async function verifyInteractivePrinting(): Promise<void> {
  await desktop.evaluate(
    /**
     * Install printer interception exclusively in the isolated test process.
     *
     * Newly created document renderers retain real loading and sandbox settings;
     * their native print call is replaced before any printer can be contacted.
     * @param {typeof import('electron')} electron - Test-owned Electron module.
     * @returns {void} Installs the print harness and save-dialog tripwire.
     * @example
     * // Calls to the system printer are recorded rather than submitted.
     */
    ({ app, dialog }) => {
      /** State owned by this application process and cleared by test teardown. */
      const state: NativePrintHarness = { calls: [], mode: 'success', saves: 0 };
      (globalThis as unknown as { forhanPrintHarness: NativePrintHarness }).forhanPrintHarness = state;
      dialog.showSaveDialog =
        /**
         * Detect accidental routing of printing into the PDF save chooser.
         *
         * Cancels instead of opening a real native file dialog during the test.
         * @returns {Promise<{canceled: boolean; filePath: string}>} A cancelled save result.
         * @example
         * // Ctrl+P must leave the save-dialog counter at zero.
         */
        async () => { state.saves++; return { canceled: true, filePath: '' }; };
      app.on('browser-window-created',
        /**
         * Replace the newly owned print renderer's printer submission method.
         *
         * Does not bypass HTML loading or request authentication; only the final
         * platform printer callback is simulated to avoid physical side effects.
         * @param {Electron.Event} _event - Owned window creation event.
         * @param {Electron.BrowserWindow} created - Temporary document renderer.
         * @returns {void} Installs native printer interception.
         * @example
         * // The original editor predates this listener and remains untouched.
         */
        (_event, created) => {
          created.webContents.print =
            /**
             * Record print options and return the configured native outcome.
             *
             * The actual loaded document is captured to verify layout and its
             * resource policy at submission, independently of its transport URL.
             * The owned temporary HTML must already have been removed.
             * @async
             * @param {Electron.WebContentsPrintOptions} [options] - Submitted print settings.
             * @param {(success: boolean, reason: string) => void} [callback] - Native job continuation.
             * @returns {Promise<void>} Records actual loaded markup and settles its callback.
             * @example
             * // A simulated cancellation uses the native Print job canceled reason.
             */
            async (options, callback) => {
              /** DOM protocol inspection works with document JavaScript disabled and leaves the source unchanged. */
              const debuggerClient = created.webContents.debugger;
              debuggerClient.attach('1.3');
              let html: string;
              try {
                /** Actual loaded markup is read independently of file contents and transport encoding. */
                const { root } = await debuggerClient.sendCommand('DOM.getDocument'),
                  observed = await debuggerClient.sendCommand('DOM.getOuterHTML', { nodeId: root.nodeId });
                html = observed.outerHTML;
              } finally { debuggerClient.detach(); }
              state.calls.push({ options: options || {}, html, url: created.webContents.getURL() });
              if (state.mode === 'success') callback?.(true, '');
              else callback?.(false, state.mode === 'cancel' ? 'Print job canceled' : 'Printer unavailable');
            };
        });
    });
  await window.locator('.tiptap').fill('프린터로 보낼 한국어 원고');
  /** Dirty-state label that printing must leave unchanged. */
  const before = await window.locator('#save-state').textContent();
  await window.keyboard.press('ControlOrMeta+p');
  await expect(window.locator('#toast')).toHaveText('인쇄 작업을 보냈습니다.');
  /**
   * Inspect printer calls and temporary window ownership after completion.
   *
   * Returns serializable test observations without exposing native objects to
   * the document renderer or altering the application's window lifecycle.
   * @param {typeof import('electron')} electron - Owned Electron module.
   * @returns {{state: NativePrintHarness; windows: number}} Captured job settings and live windows.
   * @example
   * // Exactly the document editor should remain after printing completes.
   */
  function inspect({ BrowserWindow }: typeof import('electron')) {
    return { state: (globalThis as unknown as { forhanPrintHarness: NativePrintHarness }).forhanPrintHarness, windows: BrowserWindow.getAllWindows().length };
  }
  /** Recorded acceptance of the Ctrl+P operation. */
  const first = await desktop.evaluate(inspect);
  expect(first.state.calls).toHaveLength(1);
  expect(first.state.saves).toBe(0);
  await expect(access(fileURLToPath(first.state.calls[0].url))).rejects.toMatchObject({code:'ENOENT'});
  await expect(access(path.dirname(fileURLToPath(first.state.calls[0].url)))).rejects.toMatchObject({code:'ENOENT'});
  expect(first.windows).toBe(1);
  expect(first.state.calls[0].options).toMatchObject({ silent: false, printBackground: true, landscape: false, pageSize: { width: 210000, height: 297000 } });
  expect(first.state.calls[0].html).toContain("default-src 'none'; style-src 'unsafe-inline'; img-src data:;");
  expect(first.state.calls[0].html).toContain('size:210mm 297mm;margin:35mm 30mm 30mm 30mm');
  expect(first.state.calls[0].html).toContain('body{margin:0;');
  expect(first.state.calls[0].html).toContain('프린터로 보낼 한국어 원고');
  await expect(window.locator('#save-state')).toHaveText(before!);
  /**
   * Choose a simulated native callback outcome for the next owned job.
   *
   * Only test-process state is changed; no production printer settings are modified.
   * @param {typeof import('electron')} _electron - Owned Electron module.
   * @param {'cancel' | 'failure'} mode - Callback outcome to simulate.
   * @returns {void} Updates the owned printer interception mode.
   * @example
   * // A cancellation is a normal false result, not a save or printer error.
   */
  function setMode(_electron: typeof import('electron'), mode: 'cancel' | 'failure'): void {
    (globalThis as unknown as { forhanPrintHarness: NativePrintHarness }).forhanPrintHarness.mode = mode;
  }
  /**
   * Send a landscape print request through the real isolated preload bridge.
   *
   * Uses custom paper geometry and header offsets while printer callbacks remain
   * intercepted in the owned main process.
   * @returns {Promise<import('../src/types').BridgeResult<boolean>>} Native request outcome.
   * @example
   * // A 297 by 210mm page sets landscape orientation on portrait-sized media.
   */
  async function requestPrint() {
    return globalThis.window.forhan!.printDocument('<p>가로 인쇄</p>', {width: 297, height: 210, marginTop: 12, marginBottom: 13, marginLeft: 14, marginRight: 15, header: 4, footer: 5}, '보고서 <초안>');
  }
  await desktop.evaluate<void, 'cancel' | 'failure'>(setMode, 'cancel');
  expect(await window.evaluate(requestPrint)).toEqual({ ok: true, value: false });
  /** Captured landscape cancellation, after the temporary window is destroyed. */
  const cancelled = await desktop.evaluate(inspect);
  expect(cancelled.windows).toBe(1);
  expect(cancelled.state.calls[1].options).toMatchObject({ landscape: true, pageSize: { width: 210000, height: 297000 } });
  expect(cancelled.state.calls[1].html).toContain('size:297mm 210mm;margin:16mm 15mm 18mm 14mm');
  expect(cancelled.state.calls[1].html).toContain('<title>보고서 &lt;초안&gt;</title>');
  await desktop.evaluate<void, 'cancel' | 'failure'>(setMode, 'failure');
  expect(await window.evaluate(requestPrint)).toEqual({ ok: false, error: 'Printer unavailable' });
  expect((await desktop.evaluate(inspect)).windows).toBe(1);
  /**
   * Reject unusable paper dimensions through the authenticated bridge.
   *
   * Validation must run before another print renderer or native dialog is created.
   * @returns {Promise<import('../src/types').BridgeResult<boolean>>} Rejected native request.
   * @example
   * // A one-millimetre page cannot be submitted to a printer.
   */
  async function requestInvalidPaper() {
    return globalThis.window.forhan!.printDocument('<p>잘못된 용지</p>', {width: 1, height: 297, marginTop: 20, marginBottom: 20, marginLeft: 20, marginRight: 20}, 'Invalid');
  }
  expect(await window.evaluate(requestInvalidPaper)).toMatchObject({ ok: false });
  /** Final state verifies rejected geometry never reaches the printer callback. */
  const rejected = await desktop.evaluate(inspect);
  expect(rejected.state.calls).toHaveLength(3);
  expect(rejected.windows).toBe(1);
  await expect(window.locator('#save-state')).toHaveText(before!);
}
test('native printing uses interactive printer callbacks without saving or leaking windows', verifyInteractivePrinting);

/**
 * Verify the menu opens a real paginated PDF snapshot and releases its file.
 *
 * Checks generated PDF page objects and the live built-in viewer's page and
 * zoom controls. Closing it must remove the private file while the source
 * document's content, dirty state and editor zoom remain unchanged.
 * @async
 * @returns {Promise<void>} Resolves after visible preview and cleanup checks.
 * @throws {Error} If the preview is only a zoom change or leaks private content.
 * @example
 * // A document with an explicit page break previews as two separate pages.
 */
async function verifyPaginatedPreview(): Promise<void> {
  /** Portable fixture with an explicit, editable page-break block. */
  const buffer = Buffer.from(JSON.stringify({ application: 'forhan', version: 1, title: '두 쪽 미리 보기', doc: { type: 'doc', content: [{type:'paragraph',content:[{type:'text',text:'첫째 쪽'}]},{type:'pageBreak'},{type:'paragraph',content:[{type:'text',text:'둘째 쪽'}]}] } }));
  await window.locator('#file-input').setInputFiles({ name: '두 쪽.forhan', mimeType: 'application/json', buffer });
  await expect(window.locator('.tiptap')).toContainText('둘째 쪽');
  await window.locator('.tiptap').press(DOCUMENT_END_KEY);
  await window.keyboard.insertText(' 수정');
  /** Dirty-state caption captured before generating the independent snapshot. */
  const before = await window.locator('#save-state').textContent();
  /** Editor scale must remain independent of PDF viewer zoom. */
  const zoom = await window.locator('#zoom-reset').textContent();
  await window.locator('button[data-native-tab="file"]').click();
  await window.locator('#native-file-menu [data-native-action="preview"]').click();
  /**
   * Locate the loaded PDF window, excluding its temporary HTML renderer.
   *
   * Polling uses the owned application's actual live window list and document URL.
   * @returns {Page | undefined} The generated PDF window when available.
   * @example
   * // The hidden HTML print window never matches the PDF suffix.
   */
  function currentPreview(): Page | undefined {
    for (/** Live application page inspected for the generated document URL. */ const page of desktop.windows()) if (page.url().endsWith('.forhan-preview.pdf')) return page;
    return undefined;
  }
  await expect.poll(currentPreview).toBeTruthy();
  /** Actual native preview page, whose file URL is independent of the editor. */
  const preview = currentPreview()!;
  /** Owned PDF path, read by the test without exposing filesystem IPC to the viewer. */
  const file = fileURLToPath(preview.url());
  expect(path.dirname(file)).toBe(path.join(profile, 'print-previews'));
  /** Real PDF bytes produced by Chromium's shared print renderer. */
  const pdf = await readFile(file);
  expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  await window.locator('.tiptap').press(DOCUMENT_END_KEY);
  await window.keyboard.insertText(' 이후 변경');
  expect(await readFile(file)).toEqual(pdf);
  /**
   * Identify the built-in viewer frame after its extension finishes loading.
   *
   * Application documents cannot create arbitrary extension frames; this URL
   * belongs to Chromium's PDF viewer rather than the original document HTML.
   * @param {Frame} frame - Live frame of the owned preview window.
   * @returns {boolean} Whether the built-in PDF viewer is ready for inspection.
   * @example
   * // The initial about:blank guest frame does not match.
   */
  function isViewer(frame: Frame): boolean { return frame.url().startsWith('chrome-extension:'); }
  /** Real PDF viewer frame; initial file loading may precede its attachment. */
  const viewer = preview.frames().find(isViewer) || await preview.waitForEvent('framenavigated', {predicate:isViewer});
  await expect(viewer.locator('pdf-viewer')).toBeVisible();
  await expect(viewer.locator('viewer-page-selector')).toContainText('2');
  await expect(viewer.locator('#pageSelector')).toHaveValue('1');
  await viewer.locator('#pageSelector').fill('2');
  await viewer.locator('#pageSelector').press('Enter');
  /**
   * Inspect the actual PDF canvas scroll position after page navigation.
   *
   * A changed input alone does not prove that the preview moved between pages.
   * @returns {number} Actual vertical scroll offset.
   * @example
   * // Navigating to page two moves the scroll offset beyond zero.
   */
  function scrollOffset(): number { return globalThis.scrollY; }
  /**
   * Wait for the PDF viewer to perform asynchronous page navigation.
   *
   * Chromium updates the canvas after the toolbar's input event has completed.
   * @returns {Promise<number>} Current rendered document scroll position.
   * @example
   * // Polling observes real navigation rather than the editable input value.
   */
  async function currentOffset(): Promise<number> {
    for (/** Native PDF document frame, separate from the viewer's toolbar extension. */ const frame of preview.frames()) if (frame !== preview.mainFrame() && frame.url() === preview.url()) return frame.evaluate(scrollOffset);
    return 0;
  }
  await expect.poll(currentOffset).toBeGreaterThan(0);
  await viewer.getByRole('textbox', {name:/확대.*축소|Zoom/i}).fill('175%');
  await viewer.getByRole('textbox', {name:/확대.*축소|Zoom/i}).press('Enter');
  await expect(viewer.getByRole('textbox', {name:/확대.*축소|Zoom/i})).toHaveValue('175%');
  /**
   * Inspect viewer isolation without granting it editor or filesystem access.
   *
   * Only the main document renderer is permitted to receive the application preload.
   * @returns {{node: string; bridge: string}} Native Node and preload visibility.
   * @example
   * // Both capabilities are undefined in a PDF snapshot window.
   */
  function viewerAccess() { return {node: typeof (globalThis as unknown as {require?: unknown}).require, bridge: typeof globalThis.window.forhan}; }
  expect(await preview.evaluate(viewerAccess)).toEqual({ node: 'undefined', bridge: 'undefined' });
  /**
   * Verify native menu printing targets the focused PDF instead of newer editor content.
   *
   * The editor print IPC is removed as a tripwire, and the PDF's final printer
   * call is intercepted so this test can never submit a physical print job.
   * @param {typeof import('electron')} electron - Owned native menu and window APIs.
   * @returns {{calls: number; url: string; silent: boolean | undefined}} Snapshot print observations.
   * @throws {Error} If the preview or application Print menu cannot be located.
   * @example
   * // The menu uses the existing PDF window rather than opening an HTML renderer.
   */
  function printSnapshot({Menu, BrowserWindow, ipcMain}: typeof import('electron')) {
    ipcMain.removeHandler('document:print');
    /** Native window whose loaded PDF must be sent to the printer. */
    let target: Electron.BrowserWindow | undefined;
    for (/** Owned window inspected for the preview PDF. */ const candidate of BrowserWindow.getAllWindows()) if (candidate.webContents.getURL().endsWith('.forhan-preview.pdf')) target = candidate;
    if (!target) throw new Error('Preview window missing');
    /** Number of native printer calls intercepted in this process. */
    let calls = 0;
    /** Silent printing must never be enabled by a menu action. */
    let silent: boolean | undefined;
    target.webContents.print =
      /**
       * Intercept only the PDF window's final native print call.
       *
       * Simulates acceptance without opening a dialog or submitting a printer job.
       * @param {Electron.WebContentsPrintOptions} [options] - Native print options.
       * @param {(success: boolean, reason: string) => void} [callback] - Job continuation.
       * @returns {void} Records one safe interactive request.
       * @example
       * // silent:false proves the production route requires user confirmation.
       */
      (options, callback) => { calls++; silent = options?.silent; callback?.(true, ''); };
    /** Native Print command selected from the application menu. */
    let command: Electron.MenuItem | undefined;
    for (/** Application menu group containing the file operations. */ const group of Menu.getApplicationMenu()?.items || []) if(group.label === '파일') {
      for (/** File menu command inspected for interactive printing. */ const item of group.submenu?.items || []) if(item.label === '인쇄…') command=item;
    }
    if (!command) throw new Error('Print menu missing');
    command.click(command, target, {});
    return {calls, url:target.webContents.getURL(), silent};
  }
  expect(await desktop.evaluate(printSnapshot)).toEqual({calls:1,url:preview.url(),silent:false});
  /** Owned BrowserWindow handle used to close only the preview. */
  const nativePreview = await desktop.browserWindow(preview);
  /**
   * Close the owned PDF window through its actual native lifecycle.
   *
   * This runs the same closed-event cleanup as the user's caption close button.
   * @param {Electron.BrowserWindow} owned - Native preview window.
   * @returns {void} Closes the preview and releases its generated file.
   * @example
   * // The source editor stays open and editable.
   */
  function closePreview(owned: Electron.BrowserWindow): void { owned.close(); }
  await nativePreview.evaluate(closePreview);
  await nativePreview.dispose();
  /**
   * Observe deletion of the one private PDF created by this preview.
   *
   * Unexpected filesystem errors are rethrown rather than counted as deletion.
   * @returns {Promise<boolean>} Whether the owned file no longer exists.
   * @throws {Error} If filesystem access fails for another reason.
   * @example
   * // The closed preview's file returns ENOENT.
   */
  async function removed(): Promise<boolean> { try { await access(file); return false; } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return true; throw error; } }
  await expect.poll(removed).toBe(true);
  expect(desktop.windows()).toHaveLength(1);
  await expect(window.locator('.tiptap')).toContainText('둘째 쪽 수정 이후 변경');
  await expect(window.locator('#save-state')).toHaveText(before!);
  await expect(window.locator('#zoom-reset')).toHaveText(zoom!);
}
test('print preview renders pages, navigates and cleans its private PDF', verifyPaginatedPreview);

/**
 * Verify startup removes only recognizable stale preview files.
 *
 * Simulates a prior interrupted preview inside the isolated application profile.
 * Unrelated files and subdirectories must survive the single-instance startup sweep.
 * @async
 * @returns {Promise<void>} Resolves after restart and selective cleanup checks.
 * @throws {Error} If generated private content remains or unrelated content is deleted.
 * @example
 * // A user-created keep.pdf file is never treated as a generated preview.
 */
async function verifyStalePreviewCleanup(): Promise<void> {
  /**
   * Stop only the empty test-owned application before preparing a crash fixture.
   *
   * Exiting bypasses ordinary viewer cleanup to simulate interrupted execution.
   * @param {typeof import('electron')} electron - Test-owned Electron module.
   * @returns {void} Exits the isolated process.
   * @example
   * // The following launch obtains the same profile's single-instance lock.
   */
  function exitOwned({ app }: typeof import('electron')): void { app.exit(0); }
  await desktop.evaluate(exitOwned);
  await desktop.close();
  /** Explicitly owned profile directory reserved for preview snapshots. */
  const directory = path.join(profile,'print-previews');
  await mkdir(directory,{recursive:true});
  /** Recognizable file left by an interrupted preview renderer. */
  const stale = path.join(directory,'00000000-0000-4000-8000-000000000000.forhan-preview.pdf');
  /** Unrelated file that must not be deleted by recovery housekeeping. */
  const unrelated = path.join(directory,'keep.pdf');
  await writeFile(stale,'%PDF- interrupted preview');
  await writeFile(unrelated,'retained user content');
  await mkdir(path.join(directory,'retained-directory'),{recursive:true});
  desktop = await electron.launch(desktopLaunchOptions(profile));
  window = await desktop.firstWindow();
  await window.waitForSelector('.tiptap');
  await expect(access(stale)).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(unrelated,'utf8')).toBe('retained user content');
  await access(path.join(directory,'retained-directory'));
}
test('startup clears stale generated previews without touching unrelated cache files', verifyStalePreviewCleanup);
