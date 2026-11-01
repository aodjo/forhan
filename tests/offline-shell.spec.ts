import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { nativeTabs } from "../src/ui/native-tabs.ts";

/** Removed online-service entry points must remain absent from both visible and dormant shell markup. */
const ONLINE_CONTROLS =
  '[data-native-action="assistant"],[data-native-action="login"],[data-native-action="start-assistant"],[data-native-action="translate"],[data-native-action="assets"],[data-native-action="addons"],[data-native-action="send-document"],[data-native-tab="addons"]';

/**
 * Inspect real shell entry points without confusing document text with application features.
 *
 * Hidden menus also count: deleting a button from the caption alone must not
 * leave the same service reachable through another ribbon or dropdown.
 * @async
 * @param {Page} page - Actual owned offline renderer.
 * @returns {Promise<void>} Resolves when all service controls are absent.
 * @example
 * await expectOfflineShell(page); // Original document text can still contain arbitrary words or URLs.
 */
async function expectOfflineShell(page: Page): Promise<void> {
  await expect(page.locator(ONLINE_CONTROLS)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "어시스턴트", exact: true }),
  ).toHaveCount(0);
}

/**
 * Verify the offline interface and actual document operations with browser networking disabled.
 *
 * Every available tab and menu is rendered before checking service removal.
 * Real local editing, formatting, source saving/reopening and page settings
 * must continue to work without network access or account entry points.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after all shell and real offline document checks.
 * @throws {Error} If an online entry remains or a local document operation needs networking.
 * @example
 * // An offline saved document reopens with its original Korean text and bold mark.
 */
async function verifyOfflineDocumentFlow({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".tiptap")).toBeVisible();
  await expect(page.locator(".tiptap")).toHaveAttribute("spellcheck", "false");
  await page.context().setOffline(true);
  try {
    for (/** Each actual remaining menu/ribbon must be free of service-only entry points. */ const tab of nativeTabs) {
      if (tab.disabled) continue;
      await page.locator(`button[data-native-tab="${tab.id}"]`).click();
      await expectOfflineShell(page);
      if (tab.id === "file") {
        await expect(page.locator("#native-file-menu")).toBeVisible();
        await expect(page.locator("#native-file-menu")).toHaveCSS(
          "height",
          "668px",
        );
        await page.keyboard.press("Escape");
      } else if (tab.hasDropdown) {
        await page.locator(`[data-native-menu="${tab.id}"]`).click();
        await expect(page.locator("#native-other-menu")).toBeVisible();
        await expectOfflineShell(page);
        await page.keyboard.press("Escape");
      }
    }
    await page.locator('button[data-native-tab="edit"]').click();
    await page
      .locator(".tiptap")
      .fill("인터넷 없이 문서를 편집하고 보관합니다.");
    await page.locator(".tiptap").press("ControlOrMeta+a");
    await page.locator("#bold").click();
    /** Production source serialization supplies the complete actual download. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator('[data-export="forhan"]').click();
    /** Actual saved bytes are reopened through the same source file input as ordinary documents. */
    const download = await pending,
      bytes = await readFile((await download.path())!),
      source = JSON.parse(bytes.toString("utf8"));
    expect(source.application).toBe("forhan");
    await page.locator("#file-input").setInputFiles({
      name: "offline-saved.fhn",
      mimeType: "application/json",
      buffer: bytes,
    });
    await expect(page.locator(".tiptap strong")).toHaveText(
      "인터넷 없이 문서를 편집하고 보관합니다.",
    );
    await page.locator('button[data-native-tab="file"]').click();
    /** Real recent-document rows must not cover the relocated local close command. */
    const recent = await page.locator("#recent-list").boundingBox(),
      close = await page
        .locator('#native-file-menu [data-native-action="close-document"]')
        .boundingBox();
    expect(recent!.y + recent!.height).toBeLessThanOrEqual(close!.y);
    await page
      .locator('#native-file-menu [data-native-action="page-settings"]')
      .click();
    await expect(page.locator(".native-dialog-page")).toBeVisible();
    await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
    await expectOfflineShell(page);
  } finally {
    await page.context().setOffline(false);
  }
}
test(
  "all shell menus remain offline while local editing, save, reopen and page settings work without networking",
  verifyOfflineDocumentFlow,
);
