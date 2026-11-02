import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";
import {
  SOURCE_DOCUMENT,
  importSource,
  selectSource,
  ribbonCopy,
} from "./helpers/format-painter.ts";
import { saveNativeCopy } from "./helpers/format-copy-native.ts";
import { macApplicationIds } from "./helpers/macos-applications.ts";

/** The independent target owns no source appearance or copied document identity. */
const TARGET: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { sourceId: "session-destination" },
      content: [{ type: "text", text: "대상" }],
    },
  ],
};

/**
 * Verify app-lifetime copied appearance through renderer reload, native Mac reopening and fresh app startup.
 *
 * Copying uses the real production dialog, and actual native writers supply
 * every output. Mac closes its original window and reopens an owned file via
 * Launch Services without emitting application events. A normal app quit and
 * same-profile restart must clear the session instead of reading disk state.
 * @async
 * @returns {Promise<void>} Resolves after native source, lifetime and fresh-session invariants agree.
 * @throws {Error} If native routing, actual source, application identity or owned cleanup fails.
 * @example
 * // A remembered blue 11.25pt source survives a new Mac renderer but never a fresh process.
 */
async function verifyFormatCopySession(): Promise<void> {
  test.setTimeout(120000);
  /** One owned directory contains only this test's profile and generated native documents. */
  const profile = await mkdtemp(
    path.join(tmpdir(), "forhan-format-copy-memory-"),
  );
  /** The application handle changes only after the first owned native process terminates normally. */
  let desktop: ElectronApplication | null = await electron.launch(
    desktopLaunchOptions(profile),
  );
  /** The original child-process object remains readable after its inspector connection closes. */
  let ownedProcess = desktop.process();
  try {
    /** The original native process identity remains authoritative throughout renderer replacement. */
    let page = await desktop.firstWindow();
    /** Real native process identity distinguishes resident reopening from a replacement application. */
    const firstPid = ownedProcess.pid;
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    await importSource(page, "remember-source.fhn", SOURCE_DOCUMENT);
    await selectSource(page, ".tiptap > p:first-child", 1);
    await ribbonCopy(page);
    await expect(page.locator(".native-dialog-format-painter")).toBeVisible();
    await page.keyboard.press("Alt+b");
    await page.keyboard.press("Alt+d");
    await expect(page.locator(".native-dialog-format-painter")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    await importSource(page, "after-renderer-reload.fhn", TARGET);
    await selectSource(page, ".tiptap > p", 0, 2);
    await ribbonCopy(page);
    for (/** Every real native format must receive the original remembered appearance after reload. */ const format of [
      "hwpx",
      "hwp",
      "forhan",
    ] as const) {
      /** Production native output is independently parsed after the remembered-source application. */
      const output = await saveNativeCopy(
          desktop,
          page,
          profile,
          "after-reload",
          format,
        ),
        marks = output.content![0].content![0].marks ?? [];
      expect(marks).toContainEqual(
        expect.objectContaining({
          type: "textStyle",
          attrs: expect.objectContaining({
            fontSize: "11.25pt",
            color: "#13579b",
          }),
        }),
      );
      if (format === "forhan")
        expect(output.content![0].attrs?.sourceId).toBe("session-destination");
    }
    await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/u);
    if (process.platform === "darwin") {
      /** The selected bundle is read from the real native executable rather than inferred from a filename. */
      const executable = await desktop.evaluate(
          /**
           * Read the original actual native executable path.
           *
           * No process, platform or bundle identity is substituted by the test.
           * @returns {string} Actual running native executable path.
           * @example
           * // Packaged and development apps both use their real bundle.
           */
          () => process.execPath,
        ),
        bundle = path.dirname(path.dirname(path.dirname(executable))),
        info = spawnSync(
          "/usr/libexec/PlistBuddy",
          [
            "-c",
            "Print :CFBundleIdentifier",
            path.join(bundle, "Contents", "Info.plist"),
          ],
          { encoding: "utf8", shell: false, timeout: 15000 },
        );
      if (info.error) throw info.error;
      expect(info.status, info.stderr).toBe(0);
      /** Actual native bundle identity limits file delivery to this one owned application. */
      const bundleId = info.stdout.trim(),
        file = path.join(profile, "새 창 모양 복사 대상.fhn"),
        bytes = Buffer.from(
          JSON.stringify({
            application: "forhan",
            version: 1,
            title: "새 창 모양 복사 대상",
            doc: TARGET,
          }),
        );
      await writeFile(file, bytes);
      expect(macApplicationIds(bundleId)).toEqual([firstPid]);
      /** Native window closure is armed before its normal production lifecycle runs. */
      const closed = page.waitForEvent("close");
      await desktop.evaluate(
        /**
         * Close only the clean owned native editor window.
         *
         * The real Mac window-all-closed handler stays installed and unchanged.
         * @param {typeof import('electron')} context - Actual native Electron exports.
         * @returns {void} Requests ordinary closure of the selected owned window.
         * @example
         * // Mac keeps the same application process resident with no source renderer.
         */
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(macApplicationIds(bundleId)).toEqual([firstPid]);
      /** Genuine native file delivery creates the replacement window without synthetic application events. */
      const opened = desktop.waitForEvent("window", { timeout: 30000 }),
        request = spawnSync("/usr/bin/open", ["-a", bundle, file], {
          encoding: "utf8",
          shell: false,
          timeout: 15000,
        });
      if (request.error) throw request.error;
      expect(request.status, request.stderr).toBe(0);
      page = await opened;
      await expect(page.locator(".tiptap")).toHaveText("대상", {
        timeout: 30000,
      });
      await selectSource(page, ".tiptap > p", 0, 2);
      await ribbonCopy(page);
      /** Actual saved replacement-renderer source must retain the prior process's copied appearance. */
      const reopened = await saveNativeCopy(
        desktop,
        page,
        profile,
        "after-mac-last-window",
        "forhan",
      );
      expect(reopened.content![0].content![0].marks).toContainEqual(
        expect.objectContaining({
          type: "textStyle",
          attrs: expect.objectContaining({
            fontSize: "11.25pt",
            color: "#13579b",
          }),
        }),
      );
      expect(macApplicationIds(bundleId)).toEqual([firstPid]);
      expect(await readFile(file)).toEqual(bytes);
      await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/u);
    }
    /** Native application termination is observed before the real product quit request. */
    const applicationClosed = desktop.waitForEvent("close");
    /** The real quit may close its inspector before the final protocol response arrives. */
    const quitResult = desktop
      .evaluate(
        /**
         * Quit the clean owned native application through its real production lifecycle.
         *
         * The actual process exit is observed independently from the inspector's lifetime.
         * @param {typeof import('electron')} context - Actual native Electron exports.
         * @returns {void} Schedules the real ordinary app quit request.
         * @example
         * // Session data must disappear when this actual process terminates.
         */
        ({ app }) => {
          setImmediate(
            /**
             * Request actual native application quit after the inspector response.
             *
             * Production before-quit and close guards remain installed.
             * @returns {void} Requests normal termination of this owned application.
             * @example
             * // No forced app.exit call proves session termination.
             */
            () => app.quit(),
          );
        },
      )
      .catch(
        /**
         * Retain a possible inspector closure until actual native termination is verified.
         *
         * Other errors remain failures even when the owned process exits normally.
         * @param {unknown} error - Original native inspector result.
         * @returns {unknown} Retained original protocol failure for explicit classification.
         * @example
         * // A closed inspector cannot replace the required actual zero exit status.
         */
        (error) => error,
      );
    await applicationClosed;
    /** The already closed handle cannot be used for a second forced-cleanup request. */
    const stopped = desktop;
    desktop = null;
    await expect
      .poll(
        /**
         * Observe actual native process termination independently from the closed inspector.
         *
         * No exit status is replaced by a requested or expected value.
         * @returns {number|null} Actual owned native process exit code.
         * @example
         * // Normal product quit must reach a real zero exit code.
         */
        () => ownedProcess.exitCode,
      )
      .toBe(0);
    /** Only the expected native inspector closure can accompany a confirmed normal quit. */
    const result = await quitResult;
    if (
      result !== undefined &&
      !(
        result instanceof Error &&
        /Target page, context or browser has been closed/u.test(result.message)
      )
    )
      throw result;
    await stopped.close();
    desktop = await electron.launch(desktopLaunchOptions(profile));
    page = await desktop.firstWindow();
    ownedProcess = desktop.process();
    expect(ownedProcess.pid).not.toBe(firstPid);
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    await importSource(page, "fresh-session.fhn", TARGET);
    /** The new actual process supplies its original source before any remembered-paste attempt. */
    const before = await saveNativeCopy(
      desktop,
      page,
      profile,
      "fresh-before",
      "forhan",
    );
    await selectSource(page, ".tiptap > p", 0, 2);
    await ribbonCopy(page);
    await expect(page.locator("#toast")).toContainText(
      "복사한 모양이 없습니다",
    );
    expect(
      await saveNativeCopy(desktop, page, profile, "fresh-after", "forhan"),
    ).toEqual(before);
  } finally {
    if (desktop) {
      if (ownedProcess.exitCode === null) await closeOwnedDesktop(desktop);
      else await desktop.close();
    }
    await rm(profile, { recursive: true, force: true });
  }
}

test(
  "native format-copy session survives renderer replacement and Mac last-window reopening until actual app quit",
  verifyFormatCopySession,
);
