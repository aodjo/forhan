import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  WindowsNativeKeyboard,
  WINDOWS_IME_PROFILE_PREFIX,
  type WindowsKeyboardOwner,
} from "./windows-keyboard.ts";

/** Original DOM observations distinguish genuine native composition from a derived completion event. */
export interface ImeDomObservation {
  type: string;
  data: string | null;
  inputType: string | null;
  key: string | null;
  keyCode: number | null;
  isComposing: boolean | null;
  trusted: boolean;
  source: string;
}

/** One test-owned browser window retains its original IME observations outside authored source. */
type ImeObservationWindow = Window &
  typeof globalThis & {
    __forhanImeEvents: ImeDomObservation[];
  };

/** Explicit native IME tests share real writers and a uniquely owned actual application. */
export interface WindowsImeContext {
  desktop: ElectronApplication;
  page: Page;
  keyboard: WindowsNativeKeyboard;
  profile: string;
  rows: object[];
  artifacts: string;
  outputs: {
    format: "fhn" | "hwpx" | "hwp";
    file: string;
    bytes: number;
    sha256: string;
  }[];
}

/**
 * Retain unchanged actual production output for independent native reopening.
 *
 * Only generated source is copied. Complete original bytes are preserved under
 * the gate's unique artifact directory before the temporary profile is removed.
 * @async
 * @param {WindowsImeContext} context - Actual owned native scenario and artifact directory.
 * @param {'fhn'|'hwpx'|'hwp'} format - Actual production output format.
 * @param {Buffer} bytes - Complete unchanged bytes read from the actual native writer.
 * @returns {Promise<void>} Resolves after original bytes and independent content identity are retained.
 * @example
 * await retainImeOutput(context,'hwpx',bytes); // The installed application can reopen these exact bytes.
 */
export async function retainImeOutput(
  context: WindowsImeContext,
  format: "fhn" | "hwpx" | "hwp",
  bytes: Buffer,
): Promise<void> {
  /** Unique original output identity cannot overwrite another scenario's native source file. */
  const file = path.join(context.artifacts, randomUUID() + "." + format);
  await mkdir(context.artifacts, { recursive: true });
  await writeFile(file, bytes, { flag: "wx" });
  context.outputs.push({
    format,
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

/**
 * Read original paragraph text without inaccessible drawing copies.
 *
 * Native rendering retains coherent auxiliary SVG words. Those words and
 * generated controls cannot become source text or hide a duplicated IME edit.
 * Paragraph joins preserve the empty final paragraph created by Enter.
 * @param {HTMLElement} root - Actual attached editor source root.
 * @returns {string} Original logical text with paragraph boundaries.
 * @example
 * await page.locator('.tiptap').evaluate(imeSourceText); // "간\n" after Enter.
 */
export function imeSourceText(root: HTMLElement): string {
  /** Actual source blocks remain separate from inaccessible drawing widgets. */
  const blocks = [...root.querySelectorAll("p,h1,h2,h3,h4,h5,h6")],
    output: string[] = [];
  for (/** Every original source paragraph contributes exactly one logical block. */ const block of blocks) {
    /** Only genuine source text nodes contribute authored Unicode. */
    const walker = root.ownerDocument.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT,
    );
    let text = "";
    while (walker.nextNode()) {
      if (
        walker.currentNode.parentElement?.closest(
          '[contenteditable="false"],svg',
        )
      )
        continue;
      text += walker.currentNode.textContent || "";
    }
    output.push(text);
  }
  return output.join("\n");
}

/**
 * Observe actual native composition and input without modifying editor behavior.
 *
 * Listeners record original trust flags and source snapshots. A completion
 * event derived by the host remains explicitly distinguishable from trusted
 * composition starts, updates and insertCompositionText input events.
 * @param {HTMLElement} root - Actual selected native editor source root.
 * @returns {void} Installs one test-owned passive event observation.
 * @example
 * await page.locator('.tiptap').evaluate(observeImeEvents);
 */
export function observeImeEvents(root: HTMLElement): void {
  /** Observation storage belongs only to the generated test page. */
  const window = root.ownerDocument.defaultView as ImeObservationWindow;
  window.__forhanImeEvents = [];
  for (/** No expected editor event or completed Unicode text is dispatched. */ const name of [
    "keydown",
    "beforeinput",
    "input",
    "compositionstart",
    "compositionupdate",
    "compositionend",
  ])
    root.addEventListener(
      name,
      /**
       * Record one original event from the actual application input path.
       *
       * Reading text does not synthesize an event, replace a text node or force a source transaction.
       * @param {Event} event - Actual original event received by the editor root.
       * @returns {void} Appends the unchanged event identity and source snapshot.
       * @example
       * // Trusted insertCompositionText establishes actual Windows IME processing.
       */
      (event: Event) => {
        /** Keyboard, input and composition fields remain original rather than inferred expected values. */
        const input = event as InputEvent,
          key = event as KeyboardEvent;
        /** Source text excludes inaccessible SVG copies without importing production rendering functions. */
        const blocks = [...root.querySelectorAll("p,h1,h2,h3,h4,h5,h6")],
          source: string[] = [];
        for (/** Each actual source block retains its logical Unicode order. */ const block of blocks) {
          /** One original native text walk never includes generated drawing copies. */
          const walker = root.ownerDocument.createTreeWalker(
            block,
            NodeFilter.SHOW_TEXT,
          );
          let text = "";
          while (walker.nextNode())
            if (
              !walker.currentNode.parentElement?.closest(
                '[contenteditable="false"],svg',
              )
            )
              text += walker.currentNode.textContent || "";
          source.push(text);
        }
        window.__forhanImeEvents.push({
          type: event.type,
          data: input.data ?? null,
          inputType: input.inputType ?? null,
          key: key.key ?? null,
          keyCode: key.keyCode ?? null,
          isComposing: input.isComposing ?? null,
          trusted: event.isTrusted,
          source: source.join("\n"),
        });
      },
    );
}

/**
 * Read the original IME observations retained by the selected native page.
 *
 * The records are copied from passive observers and contain their original
 * trust flags. No synthetic event is upgraded to a native event.
 * @async
 * @param {Page} page - Actual selected packaged application renderer.
 * @returns {Promise<ImeDomObservation[]>} Original recorded composition and input events.
 * @example
 * const events = await imeEvents(page);
 */
export async function imeEvents(page: Page): Promise<ImeDomObservation[]> {
  return page.evaluate(
    /**
     * Read the test-owned passive event buffer.
     *
     * Returning data cannot mutate source, selection, history or native input state.
     * @returns {ImeDomObservation[]} Original native and derived event observations.
     * @example
     * // All trust flags retain the values supplied by the actual host.
     */
    () => (window as ImeObservationWindow).__forhanImeEvents,
  );
}

/**
 * Import an original controlled source and initialize actual Korean input focus.
 *
 * Every public format is saved after each scenario before the next import.
 * Original font arrays remain source data; expected input results never enter
 * the renderer. Empty sources create a valid empty paragraph.
 * @async
 * @param {WindowsImeContext} context - Actual owned native input fixture.
 * @param {string} id - Unique controlled source identity.
 * @param {string} [text=''] - Original source before any native keystroke.
 * @param {boolean} [decorated=false] - Whether native width and outline effects are active.
 * @param {Record<string,unknown>} [paragraph={}] - Original independent paragraph source attributes.
 * @returns {Promise<void>} Resolves after original source, real focus and Korean mode are ready.
 * @example
 * await importImeSource(context,'decorated','X العربية Z',true);
 */
export async function importImeSource(
  context: WindowsImeContext,
  id: string,
  text = "",
  decorated = false,
  paragraph:Record<string,unknown>={},
): Promise<void> {
  /** Named original imports distinguish current source ownership from a previous scenario. */
  const name = id + ".fhn",
    attrs = {
      fontFamily: "Arial",
      fontSize: decorated ? "32pt" : "10pt",
      nativeUseFontSpace: false,
      nativeUseKerning: false,
      nativeCharacterMetrics: {
        ratio: Array(7).fill(decorated ? 75 : 100),
        spacing: Array(7).fill(decorated ? 20 : 0),
        relativeSize: Array(7).fill(100),
        offset: Array(7).fill(0),
      },
      ...(decorated ? { nativeOutlineType: 3 } : {}),
    };
  await context.page.locator("#file-input").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { textAlign: "left", lineHeight: "1.6",...paragraph },
              content: text
                ? [
                    {
                      type: "text",
                      text,
                      marks: [{ type: "textStyle", attrs }],
                    },
                  ]
                : [],
            },
          ],
        },
      }),
    ),
  });
  await expect(context.page.locator("#toast")).toContainText(name);
  await context.page.locator(".tiptap").click();
  /** Native compatibility state is read from the actual selected GUI thread. */
  const original = await context.keyboard.observe();
  if (original.openStatus === 0) await context.keyboard.press([0x15]);
  await context.page.evaluate(
    /**
     * Reset only the owned passive event record for the current original source.
     *
     * The actual editor, input state, selection and authored history remain unchanged.
     * @returns {void} Starts a separate actual event record for this scenario.
     * @example
     * // A prior scenario's trusted composition cannot satisfy a current source assertion.
     */
    () => {
      (window as ImeObservationWindow).__forhanImeEvents = [];
    },
  );
}

/**
 * Select one generated destination for the next actual native save.
 *
 * Only the exact destination is redirected. Actual serialization, source
 * conversion, native IPC and atomic file replacement remain production code.
 * Every operation uses a fresh generated filename and inspects real bytes.
 * @async
 * @param {WindowsImeContext} context - Actual owned native application and profile.
 * @param {'fhn'|'hwpx'|'hwp'} format - Explicit public native document format.
 * @returns {Promise<string>} Exact generated native output destination.
 * @example
 * const output = await chooseImeDestination(context,'hwpx');
 */
export async function chooseImeDestination(
  context: WindowsImeContext,
  format: "fhn" | "hwpx" | "hwp",
): Promise<string> {
  /** Generated output destinations cannot overwrite an existing user document. */
  const output = path.join(context.profile, randomUUID() + "." + format);
  await context.desktop.evaluate(
    /**
     * Choose the exact owned native output destination.
     *
     * The actual application remains responsible for every serialized file byte.
     * @param {typeof import('electron')} electron - Actual selected main-process exports.
     * @param {string} output - Exact generated destination under the owned profile.
     * @returns {void} Redirects only this native chooser response.
     * @example
     * // The native atomic writer and format implementation are never replaced.
     */
    ({ dialog }, output) => {
      dialog.showSaveDialog =
        /**
         * Resolve the owned save chooser with its explicit generated path.
         *
         * An unrelated user destination cannot be selected by this operation.
         * @async
         * @returns {Promise<{canceled:false;filePath:string}>} Exact native chooser response.
         * @example
         * // Public FHN extension mapping remains production behavior.
         */
        async () => ({ canceled: false, filePath: output });
    },
    output,
  );
  return output;
}

/**
 * Save genuine source through the actual public format action and writer.
 *
 * A fresh destination cannot be satisfied by an older output. The native
 * chooser result alone is redirected; serialization and atomic writes remain
 * production operations and are independently inspected by each scenario.
 * @async
 * @param {WindowsImeContext} context - Actual owned native application and profile.
 * @param {'fhn'|'hwpx'|'hwp'} format - Explicit public native document format.
 * @returns {Promise<Buffer>} Actual complete production output bytes.
 * @example
 * const source = JSON.parse((await saveImeSource(context,'fhn')).toString());
 */
export async function saveImeSource(
  context: WindowsImeContext,
  format: "fhn" | "hwpx" | "hwp",
): Promise<Buffer> {
  /** Generated output identity is independent of the renderer's current title and imported filename. */
  const output = await chooseImeDestination(context, format);
  await context.page.locator("#export-menu-toggle").click();
  await context.page
    .locator('[data-export="' + (format === "fhn" ? "forhan" : format) + '"]')
    .click();
  await expect
    .poll(
      /**
       * Observe the actual complete native output creation.
       *
       * The unique destination cannot be satisfied by a preceding scenario's file.
       * @async
       * @returns {Promise<boolean>} Whether the original production output now exists.
       * @example
       * // An unsuccessful save cannot count as preserved source.
       */
      async () => {
        try {
          await access(output);
          return true;
        } catch {
          return false;
        }
      },
    )
    .toBe(true);
  await expect(context.page.locator("#save-document")).toBeEnabled();
  /** Complete native bytes are retained before the owned profile is released. */
  const bytes = await readFile(output);
  await retainImeOutput(context, format, bytes);
  return bytes;
}

/**
 * Run an explicit IME scenario against the actual packaged Windows application.
 *
 * A fresh profile and main-process identity bind all native input. The observed
 * Windows owner is read from the actual application rather than its launcher
 * process. Every result retains original observations and actual source evidence.
 * @async
 * @param {string} id - Fixed scenario report identifier.
 * @param {(context:WindowsImeContext)=>Promise<void>} run - Actual original input and output checks.
 * @returns {Promise<void>} Resolves after the scenario and owned native cleanup.
 * @throws {Error} If the host, executable, isolated profile, native input or scenario differs.
 * @example
 * await withWindowsIme('native-source', verifyOriginalKoreanInput);
 */
export async function withWindowsIme(
  id: string,
  run: (context: WindowsImeContext) => Promise<void>,
): Promise<void> {
  /** Explicit native gates cannot silently substitute a source-project launch. */
  const selected = process.env.FORHAN_PACKAGED_EXECUTABLE,
    directory = process.env.FORHAN_IME_REPORT_DIRECTORY;
  if (
    process.platform !== "win32" ||
    process.arch !== "x64" ||
    !selected ||
    !directory
  )
    throw new Error(
      "Use the explicit Windows x64 IME gate with an actual packaged executable.",
    );
  /** Every native operation belongs to this actual fresh generated application profile. */
  const executable = path.resolve(selected),
    profile = await mkdtemp(path.join(tmpdir(), WINDOWS_IME_PROFILE_PREFIX)),
    desktop = await electron.launch({
      executablePath: executable,
      args: ["--user-data-dir=" + profile],
      env: { ...process.env, APPDATA: profile },
    }),
    page = await desktop.firstWindow();
  let keyboard: WindowsNativeKeyboard | undefined,
    identity: object | undefined,
    passed = false;
  /** Individual cases retain their actual source and raw event observations. */
  const rows: object[] = [],
    outputs: WindowsImeContext["outputs"] = [],
    artifacts = path.join(directory, id + "-outputs");
  try {
    await expect(page.locator(".tiptap")).toBeVisible();
    /** The actual main process supplies native window ownership and original profile identity. */
    const native = await desktop.evaluate(
      /**
       * Read actual native main-process and window identity before input.
       *
       * The Playwright launcher PID can differ from the native application PID on Windows.
       * @param {typeof import('electron')} electron - Actual selected native exports.
       * @returns {object} Original main PID, native window and packaged profile identity.
       * @example
       * // Only this actual generated application's window is eligible for native keys.
       */
      ({ app, BrowserWindow }) => ({
        pid: process.pid,
        window: BrowserWindow.getAllWindows()[0]
          .getNativeWindowHandle()
          .readBigUInt64LE()
          .toString(),
        executable: process.execPath,
        profile: app.getPath("userData"),
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        platform: process.platform,
        arch: process.arch,
      }),
    );
    expect(native.isPackaged).toBe(true);
    expect(native.platform).toBe("win32");
    expect(native.arch).toBe("x64");
    expect(path.resolve(native.executable)).toBe(executable);
    expect(path.resolve(native.profile)).toBe(profile);
    expect(page.url().startsWith("file:")).toBe(true);
    identity = native;
    keyboard = new WindowsNativeKeyboard(native as WindowsKeyboardOwner);
    await desktop.evaluate(
      /**
       * Focus only the previously verified generated native window.
       *
       * System input preferences and existing user application windows are never changed.
       * @param {typeof import('electron')} electron - Actual owned native exports.
       * @returns {void} Requests focus for this explicit interactive regression.
       * @example
       * // Native input still stops if the actual foreground does not match.
       */
      ({ BrowserWindow }) => {
        /** Only the selected generated application owns this window. */ const window =
          BrowserWindow.getAllWindows()[0];
        window.show();
        window.focus();
      },
    );
    await keyboard.focus();
    await page.locator(".tiptap").click();
    await keyboard.observe();
    await page.locator(".tiptap").evaluate(observeImeEvents);
    await run({ desktop, page, keyboard, profile, rows, artifacts, outputs });
    passed = true;
  } finally {
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, id + ".json"),
        JSON.stringify(
          {
            kind: "actual-packaged-win32-input-processed-by-installed-korean-ime",
            passed,
            identity,
            launcherPid: desktop.process().pid,
            observations: keyboard?.observations || [],
            rows,
            outputs,
            scope:
              "Explicit interactive Windows x64 host with an installed Korean IME. Input uses guarded Win32 virtual-key transitions, never completed Unicode text or synthetic DOM composition. Native ownership, executable, profile and foreground are checked independently. Original derived completion events retain their original trust flags. This does not establish other input methods, touch/pen, every language or actual Mac execution.",
            macOSExecuted: false,
          },
          null,
          2,
        ),
      );
    } finally {
      try {
        await desktop.evaluate(
          /**
           * Exit only the generated native input application.
           *
           * The isolated profile cannot contain an existing user document or unsaved revision.
           * @param {typeof import('electron')} electron - Actual owned native application exports.
           * @returns {void} Terminates this owned application without a user save prompt.
           * @example
           * // A failed assertion cannot leave the native input target running.
           */
          ({ app }) => app.exit(0),
        );
      } finally {
        await desktop.close();
        if (
          path.dirname(profile) === path.resolve(tmpdir()) &&
          path.basename(profile).startsWith(WINDOWS_IME_PROFILE_PREFIX)
        )
          await rm(profile, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
          });
      }
    }
  }
}
