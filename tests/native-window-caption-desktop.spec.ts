import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";

test("actual native window caption uses left Mac traffic lights and platform-owned controls", /**
 * Verify the real native caption and reserve its original renderer layout.
 *
 * Mac checks actual AppKit standard controls through independent read-only
 * accessibility metadata and retains an original native screenshot. Windows
 * keeps its actual visible caption buttons and original layout.
 * @async
 * @returns {Promise<void>} Resolves after actual host-specific native controls and renderer spacing agree.
 * @throws {Error} If original native identity, button visibility, geometry or screenshot observation fails.
 * @example
 * // Native red, yellow and green Mac controls must exist inside the leftmost eighty native points.
 */
async () => {
  test.setTimeout(90000);
  /** Every generated helper and application profile belongs exclusively to this regression. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-native-caption-")),
    desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** The first real document window must exist before its native caption is inspected. */
    const page = await desktop.firstWindow();
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    /** Original runtime identity is read from the actual selected application. */
    const identity = await desktop.evaluate(
      /**
       * Focus the actual owned native window and read its original process identity.
       *
       * The operating-system observer separately inspects its standard window buttons.
       * @param {typeof import('electron')} context - Actual native Electron exports.
       * @returns {object} Original native platform, PID, executable and button-position observation.
       * @example
       * // Browser or CSS controls cannot substitute for actual native button metadata.
       */
      ({ app, BrowserWindow }) => {
        /** Only the original first window of this isolated application is selected. */
        const window = BrowserWindow.getAllWindows()[0];
        window.show();
        window.focus();
        if (process.platform === "darwin") app.focus({ steal: true });
        return {
          platform: process.platform,
          pid: process.pid,
          executable: process.execPath,
          position:
            process.platform === "darwin"
              ? window.getWindowButtonPosition()
              : null,
        };
      },
    );
    expect(identity.platform).toBe(process.platform);
    await expect(page.locator("html")).toHaveAttribute(
      "data-native-platform",
      process.platform,
    );
    if (process.platform === "darwin") {
      for (/** Renderer imitations must not accompany actual native Mac window controls. */ const action of [
        "close",
        "minimize",
        "maximize",
      ])
        await expect(page.locator(`[data-window="${action}"]`)).toBeHidden();
      expect(identity.position).toEqual({ x: 12, y: 9 });
      /** Read-only helper compilation uses the actual installed SDK on the matching native Mac. */
      const helper = path.join(profile, "observe-buttons"),
        source = fileURLToPath(
          new URL("../scripts/native/macos-window-buttons.mm", import.meta.url),
        );
      execFileSync(
        "/usr/bin/xcrun",
        [
          "clang++",
          "-fobjc-arc",
          "-Wall",
          "-Wextra",
          "-framework",
          "AppKit",
          "-framework",
          "ApplicationServices",
          source,
          "-o",
          helper,
        ],
        { stdio: "inherit", timeout: 60000 },
      );
      /** Actual original native bytes remain available even when a later geometry assertion fails. */
      const bytes = execFileSync(helper, [String(identity.pid)], {
          timeout: 15000,
        }),
        native = JSON.parse(bytes.toString());
      await test
        .info()
        .attach("actual-native-window-buttons", {
          body: bytes,
          contentType: "application/json",
        });
      expect(native.pid).toBe(identity.pid);
      expect(native.executable.normalize("NFC")).toBe(
        identity.executable.normalize("NFC"),
      );
      expect(native.buttons).toHaveLength(3);
      expect(native.permissionsRequested).toBe(false);
      expect(native.eventsPosted).toBe(0);
      /** Real native button coordinates remain independent of requested constructor positions. */
      const positions: number[] = [];
      for (/** All three actual standard native elements must be visible, enabled and inside the left caption region. */ const button of native.buttons) {
        expect(button.present).toBe(true);
        expect(button.role).toBe("AXButton");
        expect(button.enabled).toBe(true);
        expect(button.frame.width).toBeGreaterThan(10);
        expect(button.frame.height).toBeGreaterThan(10);
        expect(button.frame.x - native.window.x).toBeGreaterThanOrEqual(0);
        expect(
          button.frame.x + button.frame.width - native.window.x,
        ).toBeLessThan(80);
        expect(button.frame.y - native.window.y).toBeGreaterThanOrEqual(0);
        expect(
          button.frame.y + button.frame.height - native.window.y,
        ).toBeLessThanOrEqual(32);
        positions.push(button.frame.x);
      }
      expect(positions[0]).toBeLessThan(positions[1]);
      expect(positions[1]).toBeLessThan(positions[2]);
      expect(native.windowIds).toHaveLength(1);
      /** The real Window Server capture includes original native chrome outside renderer capture APIs. */
      const screenshot = test.info().outputPath("actual-native-window.png");
      execFileSync(
        "/usr/sbin/screencapture",
        ["-x", "-l", String(native.windowIds[0]), screenshot],
        { timeout: 15000 },
      );
      expect((await readFile(screenshot)).length).toBeGreaterThan(100);
      await test
        .info()
        .attach("actual-native-window", {
          path: screenshot,
          contentType: "image/png",
        });
      await expect(page.locator(".native-app-mark")).toHaveCSS("left", "84px");
    } else {
      for (/** Windows retains its native application caption controls on the original right side. */ const action of [
        "close",
        "minimize",
        "maximize",
      ])
        await expect(page.locator(`[data-window="${action}"]`)).toBeVisible();
      await expect(page.locator(".native-app-mark")).toHaveCSS("left", "4px");
    }
  } finally {
    await closeOwnedDesktop(desktop);
    expect(path.dirname(profile)).toBe(path.resolve(tmpdir()));
    expect(path.basename(profile).startsWith("forhan-native-caption-")).toBe(
      true,
    );
    await rm(profile, { recursive: true, force: true });
  }
});
