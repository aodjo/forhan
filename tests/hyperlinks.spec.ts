import { test, expect, type PlaywrightTestArgs } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/**
 * Verify hyperlink editing through actual ribbon commands and binary exports.
 *
 * Unsafe input stays in the dialog, cancellation leaves the destination intact,
 * and changing a target retains bold character runs. Both document exporters
 * must preserve the authored target before link removal and undo are checked.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser test bindings.
 * @returns {Promise<void>} Resolves when editing and both exports retain link semantics.
 * @throws {Error} If validation, formatting, export, removal or undo loses data.
 * @example
 * // A Korean bold hyperlink remains editable after HWP and HWPX export.
 */
async function verifyHyperlinkEditing({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("포한 링크");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#bold").click();
  await page.locator('button[data-native-tab="input"]').click();
  await page.locator('#native-ribbon [data-native-action="hyperlink"]').click();
  await expect(page.locator("#hyperlink-text")).toHaveValue("포한 링크");
  await page.locator("#hyperlink-target").fill("javascript:alert(1)");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#hyperlink-form")).toBeVisible();
  await expect(page.locator(".tiptap a")).toHaveCount(0);
  await page.locator("#hyperlink-target").fill("https://example.com/first");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap a")).toHaveAttribute(
    "href",
    "https://example.com/first",
  );
  await expect(page.locator(".tiptap strong")).toHaveText("포한 링크");
  await page.locator(".tiptap a").click();
  await page.locator('#native-ribbon [data-native-action="hyperlink"]').click();
  await page.locator("#hyperlink-target").fill("https://example.com/cancelled");
  await page.keyboard.press("Escape");
  await expect(page.locator(".tiptap a")).toHaveAttribute(
    "href",
    "https://example.com/first",
  );
  await page.locator('#native-ribbon [data-native-action="hyperlink"]').click();
  await page
    .locator("#hyperlink-target")
    .fill("https://example.com/report?x=한글&y=2");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap strong")).toHaveText("포한 링크");
  await expect(
    page.locator('#native-ribbon [data-native-action="hyperlink-next"]'),
  ).toBeEnabled();
  await page
    .locator('#native-ribbon [data-native-action="hyperlink-next"]')
    .click();
  for (/** Native document format whose real downloaded bytes are independently parsed. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Download registered before invoking the format exporter. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Downloaded native document produced by the application UI. */
    const download = await pending;
    /** Complete document bytes passed through the independent reader. */
    const bytes = await readFile((await download.path())!);
    /** Reimported content used to verify destinations and character formatting. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(JSON.stringify(parsed.doc)).toContain(
      "https://example.com/report?x=한글&y=2",
    );
    expect(JSON.stringify(parsed.doc)).toContain('"type":"bold"');
  }
  await page.locator('#native-ribbon [data-native-action="hyperlink"]').click();
  await page.locator('[data-modal-value="remove"]').click();
  await expect(page.locator(".tiptap a")).toHaveCount(0);
  await expect(page.locator(".tiptap strong")).toHaveText("포한 링크");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap a")).toHaveAttribute(
    "href",
    "https://example.com/report?x=한글&y=2",
  );
}

test(
  "hyperlink ribbon validates edits, preserves styling and exports native links",
  verifyHyperlinkEditing,
);

/**
 * Verify navigation treats mixed-format runs as one hyperlink target.
 *
 * Imports two links, the first split across bold and italic runs, then checks
 * forward, backward and wrapping navigation by opening each selected target.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after navigation visits distinct complete links.
 * @throws {Error} If a formatted run becomes a separate target or wrapping fails.
 * @example
 * // Previous from the first selected link wraps to the second link.
 */
async function verifyLinkNavigation({ page }: PlaywrightTestArgs): Promise<void> {
  await page.goto('/');
  /** Portable fixture containing a mixed-style link and a separate destination. */
  const buffer = Buffer.from(JSON.stringify({ application: 'forhan', version: 1, title: '링크 탐색', doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '첫째', marks: [{ type: 'link', attrs: { href: 'https://example.com/first' } }, { type: 'bold' }] }, { type: 'text', text: ' 링크', marks: [{ type: 'link', attrs: { href: 'https://example.com/first' } }, { type: 'italic' }] }, { type: 'text', text: ' 그리고 ' }, { type: 'text', text: '둘째', marks: [{ type: 'link', attrs: { href: 'https://example.com/second' } }] }] }] } }));
  await page.locator('#file-input').setInputFiles({ name: '탐색.forhan', mimeType: 'application/json', buffer });
  await expect(page.locator('.tiptap')).toContainText('첫째 링크 그리고 둘째');
  await page.locator('.tiptap').press('ControlOrMeta+Home');
  await page.locator('button[data-native-tab="input"]').click();
  for (/** Command and expected target visited from the current selection. */ const [command, target] of [['hyperlink-next', 'second'], ['hyperlink-previous', 'first'], ['hyperlink-previous', 'second']]) {
    await page.locator(`#native-ribbon [data-native-action="${command}"]`).click();
    await page.locator('#native-ribbon [data-native-action="hyperlink"]').click();
    await expect(page.locator('#hyperlink-target')).toHaveValue(`https://example.com/${target}`);
    await page.keyboard.press('Escape');
  }
}

test('hyperlink navigation merges styled runs and wraps between destinations', verifyLinkNavigation);
