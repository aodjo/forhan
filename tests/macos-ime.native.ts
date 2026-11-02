import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";
import {
  imeSourceText,
  observeImeEvents,
  imeEvents,
} from "./helpers/windows-ime.ts";
import { saveNativeCopy } from "./helpers/format-copy-native.ts";

/** Physical two-set key positions produce the expected text through the installed Apple input method. */
const SCENARIOS = [
  {
    id: "korean-phrase",
    keys: [
      "g",
      "k",
      "s",
      "r",
      "m",
      "f",
      "SPACE",
      "w",
      "h",
      "g",
      "k",
      "q",
      "SPACE",
    ],
    expected: "한글 조합 ",
    delayMs: 70,
  },
  {
    id: "rapid-korean",
    keys: [
      "g",
      "k",
      "s",
      "r",
      "m",
      "f",
      "SPACE",
      "g",
      "k",
      "s",
      "r",
      "m",
      "f",
      "SPACE",
      "g",
      "k",
      "s",
      "r",
      "m",
      "f",
      "SPACE",
    ],
    expected: "한글 한글 한글 ",
    delayMs: 10,
  },
  {
    id: "batchim-deletion",
    keys: ["r", "k", "r", "BACKSPACE", "SPACE"],
    expected: "가 ",
    delayMs: 70,
  },
] as const;

for (/** Each native scenario owns its process, profile, original observations and production outputs. */ const scenario of SCENARIOS) {
  test(
    scenario.id,
    /**
     * Verify trusted Apple Korean composition and three actual document writers.
     *
     * Expected Unicode is used only for assertions. The native helper receives
     * physical keys, verifies foreground ownership, and restores input-source state.
     * @async
     * @returns {Promise<void>} Resolves after native input, passive events and original output bytes agree.
     * @throws {Error} If native input, restoration, source order or production saving fails.
     * @example
     * // A rapid sequence must retain every syllable in HWPX, HWP and FHN.
     */
    async () => {
      /** One generated profile separates this actual native application from existing sessions. */
      const profile = await mkdtemp(path.join(tmpdir(), "forhan-macos-ime-")),
        directory = path.join(
          process.env.FORHAN_MACOS_IME_DIRECTORY!,
          scenario.id,
        ),
        desktop = await electron.launch(desktopLaunchOptions(profile)),
        outputs: object[] = [];
      await mkdir(directory, { recursive: true });
      /** Original events and native results remain available on failed assertions. */
      let native: unknown = null,
        events: unknown = null,
        source: unknown = null;
      try {
        /** The real renderer starts with a genuinely blank source document. */
        const page = await desktop.firstWindow(),
          root = page.locator(".tiptap");
        await expect(root).toBeVisible({ timeout: 30000 });
        expect(await root.evaluate(imeSourceText)).toBe("");
        await root.evaluate(observeImeEvents);
        await desktop.evaluate(
          /**
           * Focus the native window belonging to this isolated application.
           *
           * The keyboard helper independently checks the actual frontmost PID.
           * @param {typeof import('electron')} context - Actual owned native Electron exports.
           * @returns {void} Shows and focuses only the test-owned editor window.
           * @example
           * // No other application is activated or closed.
           */
          ({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0].show();
            BrowserWindow.getAllWindows()[0].focus();
          },
        );
        await root.click();
        /** Actual native runtime identity binds the keyboard operation to this process and package. */
        const identity = await desktop.evaluate(
          /**
           * Observe the real selected packaged application's native identity.
           *
           * These values are read from the owned process, never supplied as expected runtime facts.
           * @param {typeof import('electron')} context - Actual owned native Electron exports.
           * @returns {object} Actual PID, native architecture, executable and archive path.
           * @example
           * // A development Electron process cannot satisfy the packaged assertion.
           */
          ({ app }) => ({
            pid: process.pid,
            executable: process.execPath,
            appPath: app.getAppPath(),
            arch: process.arch,
            platform: process.platform,
            isPackaged: app.isPackaged,
          }),
        );
        expect(identity.isPackaged).toBe(true);
        expect(identity.platform).toBe("darwin");
        expect(identity.arch).toBe(process.arch);
        expect(path.resolve(identity.executable)).toBe(
          path.resolve(process.env.FORHAN_PACKAGED_EXECUTABLE!),
        );
        /** The helper never receives an expected source string or completed Unicode text. */
        const result = spawnSync(process.env.FORHAN_MACOS_IME_HELPER!, [], {
          input: JSON.stringify({
            pid: identity.pid,
            executable: identity.executable,
            bundle: path.dirname(
              path.dirname(path.dirname(identity.executable)),
            ),
            keys: scenario.keys,
            delayMs: scenario.delayMs,
          }),
          encoding: "utf8",
          shell: false,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        await writeFile(
          path.join(directory, "native-original.json"),
          result.stdout,
        );
        await writeFile(
          path.join(directory, "native-stderr.txt"),
          result.stderr,
        );
        if (result.error) throw result.error;
        native = JSON.parse(result.stdout);
        expect(result.status, result.stderr + "\n" + result.stdout).toBe(0);
        expect(native).toMatchObject({
          success: true,
          restored: true,
          ownerPid: identity.pid,
          eventsPosted: scenario.keys.length * 2,
          unicodeTextInjected: false,
          permissionsRequested: false,
          selectedSource: "com.apple.inputmethod.Korean.2SetKorean",
        });
        await expect
          .poll(
            /**
             * Read the actual document after native keyboard processing completes.
             *
             * Rendering copies cannot hide missing, duplicated or reordered source characters.
             * @async
             * @returns {Promise<string>} Original logical editor text.
             * @example
             * // Only actual source text can satisfy the expected Korean phrase.
             */
            async () => root.evaluate(imeSourceText),
          )
          .toBe(scenario.expected);
        events = await imeEvents(page);
        source = await root.evaluate(imeSourceText);
        expect(events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "compositionstart",
              trusted: true,
            }),
            expect.objectContaining({
              type: "compositionupdate",
              trusted: true,
            }),
            expect.objectContaining({
              type: "input",
              inputType: "insertCompositionText",
              trusted: true,
            }),
          ]),
        );
        for (/** Every public format must contain the text actually produced by the operating-system IME. */ const format of [
          "hwpx",
          "hwp",
          "forhan",
        ] as const) {
          /** Independent parsers inspect the actual production writer's original bytes. */
          const doc = await saveNativeCopy(
              desktop,
              page,
              profile,
              scenario.id,
              format,
            ),
            extension = format === "forhan" ? "fhn" : format,
            bytes = await readFile(
              path.join(profile, scenario.id + "." + extension),
            ),
            destination = path.join(directory, "original-output." + extension);
          expect(doc.content?.[0]?.content).toEqual([
            expect.objectContaining({ type: "text", text: scenario.expected }),
          ]);
          await writeFile(destination, bytes);
          outputs.push({
            format: extension,
            file: destination,
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
        }
        await writeFile(
          path.join(directory, "success.json"),
          JSON.stringify(
            { identity, native, events, source, outputs, verified: true },
            null,
            2,
          ) + "\n",
        );
      } finally {
        await writeFile(
          path.join(directory, "attempt.json"),
          JSON.stringify({ native, events, source, outputs }, null, 2) + "\n",
        );
        await closeOwnedDesktop(desktop);
        expect(path.dirname(profile)).toBe(path.resolve(tmpdir()));
        expect(path.basename(profile).startsWith("forhan-macos-ime-")).toBe(
          true,
        );
        await rm(profile, { recursive: true, force: true });
      }
    },
  );
}
