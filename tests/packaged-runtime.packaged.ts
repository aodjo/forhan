import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desktopLaunchOptions } from "./helpers/desktop-launch";

/**
 * Prove the selected distribution runs its own archived, isolated application.
 *
 * Runtime platform/architecture and archive paths come from the live native
 * process. The renderer must load local packaged assets and enumerate actual
 * installed fonts through its production UI, without a source-server fallback.
 * @async
 * @returns {Promise<void>} Resolves after runtime identity and renderer capabilities agree.
 * @throws {Error} If the distribution fails to launch, is not packaged or loses required capabilities.
 * @example
 * // npm run test:packaged writes identity only after the actual app passes.
 */
async function verifyPackagedRuntime(): Promise<void> {
  /** Every native run owns an independent profile outside real user data. */
  const profile = await mkdtemp(
    path.join(tmpdir(), "forhan-packaged-identity-"),
  );
  /** The helper uses only the explicit distribution executable in this suite. */
  const desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** The production renderer must finish loading before inspecting its bridge. */
    const page = await desktop.firstWindow();
    await page.waitForSelector(".tiptap");
    /** Values are collected inside the running native main process. */
    const runtime = await desktop.evaluate(
      /**
       * Inspect the actual running process and production window preferences.
       *
       * This read-only probe does not alter platform checks or Electron settings.
       * @param {typeof import('electron')} context - Live native Electron exports.
       * @returns {object} Actual package identity and renderer security preferences.
       * @example
       * // isPackaged must be true and appPath must identify this app.asar.
       */
      ({ app, BrowserWindow }) => {
        /** Actual editor preferences are obtained from the production window. */
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        /** Electron's runtime-only inspector requires its original WebContents receiver. */
        const preferences = Reflect.get(contents, "getLastWebPreferences").call(
          contents,
        ) as Electron.WebPreferences;
        return {
          isPackaged: app.isPackaged,
          platform: process.platform,
          arch: process.arch,
          execPath: process.execPath,
          appPath: app.getAppPath(),
          version: app.getVersion(),
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          sessionSpellcheck: contents.session.isSpellCheckerEnabled(),
        };
      },
    );
    expect(runtime.isPackaged).toBe(true);
    expect(runtime.platform).toBe(process.env.FORHAN_PACKAGED_PLATFORM);
    expect(runtime.arch).toBe(process.env.FORHAN_PACKAGED_ARCH);
    expect(path.resolve(runtime.execPath)).toBe(
      path.resolve(process.env.FORHAN_PACKAGED_EXECUTABLE!),
    );
    expect(path.basename(runtime.appPath)).toBe("app.asar");
    expect(runtime.sandbox).toBe(true);
    expect(runtime.contextIsolation).toBe(true);
    expect(runtime.nodeIntegration).toBe(false);
    expect(runtime.sessionSpellcheck).toBe(false);
    expect(page.url().startsWith("file:")).toBe(true);
    expect(fileURLToPath(page.url())).toBe(
      path.join(runtime.appPath, "dist", "index.html"),
    );
    /** Renderer globals must expose the narrow preload bridge without Node access. */
    const renderer = await page.evaluate(
      /**
       * Read the bridge and forbidden globals in the real packaged renderer.
       *
       * DOM state comes from the live page rather than archived source text.
       * @returns {object} Actual renderer capability state.
       * @example
       * // The preload bridge exists while require and process remain absent.
       */
      () => ({
        bridge: typeof window.forhan?.save,
        require: typeof Reflect.get(window, "require"),
        process: typeof Reflect.get(window, "process"),
        text: document.querySelector(".tiptap")?.textContent,
      }),
    );
    expect(renderer.bridge).toBe("function");
    expect(renderer.require).toBe("undefined");
    expect(renderer.process).toBe("undefined");
    await page.locator("#font-family").click();
    await expect(page.locator("#font-family")).toHaveAttribute(
      "data-font-catalog",
      "installed",
      { timeout: 30000 },
    );
    /** Actual localized family count varies by native host and is never hard-coded. */
    const installedFamilies = Number(
      await page
        .locator("#font-family")
        .getAttribute("data-installed-families"),
    );
    expect(installedFamilies).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    /** Evidence is emitted only after all actual native identity checks succeed. */
    const destination = process.env.FORHAN_PACKAGED_IDENTITY;
    if (!destination)
      throw new Error("Packaged runtime identity output is required.");
    await writeFile(
      destination,
      JSON.stringify(
        { ...runtime, rendererUrl: page.url(), renderer, installedFamilies },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await desktop.close();
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}
test(
  "actual packaged process retains native identity, isolated renderer and installed fonts",
  verifyPackagedRuntime,
);
