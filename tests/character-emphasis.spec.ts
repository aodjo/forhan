import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import type { JSONContent } from '@tiptap/core';
import { createHash } from 'node:crypto';

/**
 * Read authored text independently of source mark splitting and SVG drawing.
 *
 * Rich HTML may split language runs while retaining exactly the same text.
 * @param {JSONContent} node - Actual serialized source node.
 * @returns {string} Original source text in document order.
 * @example
 * emphasisSourceText(payload.doc); // Drawing-only marks never enter source.
 */
function emphasisSourceText(node:JSONContent):string {
  let text=node.text||'';
  for(/** Native and HTML sources may contain different but equivalent run boundaries. */const child of node.content||[])text+=emphasisSourceText(child);
  return text;
}

/**
 * Load editable emphasized source using the normal document picker.
 *
 * Supplementary and combined characters ensure mark geometry uses complete
 * graphemes. Ordinary spaces must remain unmarked and preserve their advance.
 * @async
 * @param {Page} page - Owned browser renderer.
 * @param {number} [code=1] - Literal retained native emphasis code.
 * @returns {Promise<void>} Resolves after source metadata is rendered.
 * @example
 * await loadEmphasis(page,15); // Retains an unlisted native binary value.
 */
async function loadEmphasis(page: Page, code = 1): Promise<void> {
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "emphasis.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          application: "forhan",
          version: 1,
          title: "Emphasis",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "ABC 한글 123 가나 다라 é 👩‍💻",
                    marks: [
                      {
                        type: "textStyle",
                        attrs: {
                          fontFamily: "Arial",
                          fontSize: "32pt",
                          color: "#123456",
                          nativeEmphasisType: code,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      ),
    });
  await expect(
    page.locator(`.tiptap [data-forhan-emphasis="${code}"]`),
  ).toBeAttached();
}

/**
 * Open the native Expanded character panel with the original source selected.
 *
 * Menu focus cannot change authored text or the pending source selection.
 * @async
 * @param {Page} page - Actual owned renderer.
 * @returns {Promise<void>} Resolves with editable emphasis controls.
 * @example
 * await openEmphasis(page); // Local changes remain cancelable until Apply.
 */
async function openEmphasis(page: Page): Promise<void> {
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
}

/**
 * Observe an actual production download without replacing its source bytes.
 *
 * Native, local and standalone HTML exports all use their ordinary UI actions.
 * @async
 * @param {Page} page - Owned renderer page.
 * @param {'forhan'|'hwp'|'hwpx'|'html'} format - Requested real export format.
 * @returns {Promise<Buffer>} Original downloaded bytes.
 * @example
 * const bytes=await exportEmphasis(page,'hwp');
 */
async function exportEmphasis(
  page: Page,
  format: "forhan" | "hwp" | "hwpx" | "html",
): Promise<Buffer> {
  /** Observe the real download before triggering its source action. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Actual file bytes remain independent of any test-generated expected document. */
  const downloaded = await pending;
  return readFile((await downloaded.path())!);
}

/**
 * Verify cancelable editing, keyboard ownership, native output and a single undo.
 *
 * A native side-dot choice must survive source serialization and both native
 * formats. HTML reimport cannot duplicate source through rendering nodes.
 * @async
 * @param {{page:Page}} context - Owned browser test bindings.
 * @returns {Promise<void>} Resolves after real UI and output checks.
 * @example
 * // Escape closes the popup while leaving the character dialog open.
 */
async function verifyEmphasisEditing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadEmphasis(page);
  await openEmphasis(page);
  /** The observed native graphic popup retains its measured thirteen-row geometry. */
  const button = page.getByRole("combobox", { name: "강조점", exact: true }),
    list = page.locator("#native-emphasis-type-list");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(list).toHaveCSS("width", "91px");
  await expect(list).toHaveCSS("height", "348px");
  await expect(list.getByRole("option")).toHaveCount(13);
  await list.locator('[data-line-value="12"]').click();
  await expect(
    page.locator('.nd-character-sample [data-emphasis-kind="12"]'),
  ).toHaveCount(15);
  await expect(
    page.locator('.tiptap [data-forhan-emphasis="1"]'),
  ).toBeAttached();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await openEmphasis(page);
  await button.click();
  await button.press("End");
  await button.press("Escape");
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await expect(page.locator('[name="emphasis-type"]')).toHaveValue("1");
  await button.click();
  await list.locator('[data-line-value="5"]').click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.tiptap [data-emphasis-kind="5"]')).toHaveCount(
    14,
  );
  for (/** Real native serializers retain the actual GUI change. */ const format of [
    "hwp",
    "hwpx",
  ] as const) {
    /** The original exported bytes are decoded independently of the source document. */
    const bytes = await exportEmphasis(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    for (/** Native mark order does not define effect identity. */ const mark of parsed
      .doc.content![0].content![0].marks!)
      if (mark.type === "textStyle")
        expect(mark.attrs).toMatchObject({
          nativeEmphasisType: 5,
          color: "#123456",
        });
  }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator('.tiptap [data-emphasis-kind="1"]')).toHaveCount(
    14,
  );
  /** Rendering groups contain no authored text and cannot duplicate HTML import. */
  const html = await exportEmphasis(page, "html");
  expect(html.toString("utf8")).toContain('data-emphasis-kind="1"');
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "emphasis.html",
      mimeType: "text/html",
      buffer: html,
    });
  await page.getByRole('button',{name:'저장 안 함',exact:true}).click();
  await expect(page.locator('.tiptap [data-emphasis-kind="1"]')).toHaveCount(14);
  /** Saved source remains the authority for original text after rich HTML reimport. */
  const local = JSON.parse(
    (await exportEmphasis(page, "forhan")).toString("utf8"),
  );
  expect(emphasisSourceText(local.doc)).toBe(
    "ABC 한글 123 가나 다라 é 👩‍💻",
  );
}
test(
  "native emphasis editing retains popup ownership, source history and actual native outputs",
  verifyEmphasisEditing,
);

/**
 * Verify every supported mark, wrapped geometry and unlisted legacy retention.
 *
 * Above, below and side positioning are checked against actual source boxes;
 * opening and applying an unchanged dialog retains legacy binary preferences.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after every live style and legacy path is exercised.
 * @example
 * // Soft wrapping moves marks with complete source graphemes without editing their text.
 */
async function verifyEmphasisGeometry({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Original captured pixels, with caret hidden, prove every visual kind actually paints differently. */
  const images=new Set<string>();
  for (let code = 0; code < 13; code++) {
    await loadEmphasis(page, code);
    await expect(
      page.locator(`.tiptap [data-emphasis-kind="${code}"]`),
    ).toHaveCount(code ? 14 : 0);
    images.add(createHash('sha256').update(await page.locator('.tiptap').screenshot({caret:'hide',animations:'disabled'})).digest('hex'));
    if (!code) continue;
    /** Actual SVG geometry reflects observed mark placement without source mutations. */
    const geometry = await page.locator(".tiptap").evaluate(
      /**
       * Read original source and its first measured emphasis group.
       *
       * Coordinates are observed after the actual rendering frame has completed.
       * @param {HTMLElement} root - Existing editable document root.
       * @returns {object} Source bounds and drawing position.
       * @example
       * // Side marks appear before the first glyph rather than above its center.
       */
      (root) => {
        /** One complete source character supplies an independent reference box. */
        const span = root.querySelector("[data-forhan-emphasis]")!,
          range = document.createRange();
        range.setStart(span.firstChild!, 0);
        range.setEnd(span.firstChild!, 1);
        /** Real client bounds include the editor's actual zoom. */
        const glyph = range.getBoundingClientRect(),
          mark = root
            .querySelector("[data-emphasis-kind]")!
            .getBoundingClientRect();
        return {
          glyph: {
            left: glyph.left,
            right: glyph.right,
            top: glyph.top,
            bottom: glyph.bottom,
          },
          mark: {
            left: mark.left,
            right: mark.right,
            top: mark.top,
            bottom: mark.bottom,
          },
        };
      },
    );
    if (code === 5 || code === 6)
      expect(geometry.mark.right).toBeLessThan(geometry.glyph.left + 3);
    else if (code === 12)
      expect(geometry.mark.top).toBeGreaterThan(geometry.glyph.bottom - 3);
    else expect(geometry.mark.bottom).toBeLessThan(geometry.glyph.top + 3);
  }
  expect(images.size).toBe(13);
  await page.addStyleTag({content:'.tiptap p{width:180px}'});
  await loadEmphasis(page,1);
  await expect(page.locator('.tiptap [data-emphasis-kind="1"]')).toHaveCount(14);
  /** Actual wrapped lines must move the drawing with their unchanged source glyphs. */
  await expect.poll(
    /**
     * Wait for actual emphasis positions after asynchronous source and width layout.
     *
     * Existing mark nodes can precede their updated drawing geometry by one frame.
     * @async
     * @returns {Promise<number>} Actual distinct physical emphasis rows.
     * @example
     * // Mark count alone cannot prove that narrow source wrapping has settled.
     */
    async()=>page.locator('.tiptap [data-emphasis-kind="1"]').evaluateAll(
    /**
     * Count actual measured drawing rows after the source paragraph wraps.
     *
     * The observation reads real drawing bounds without changing source text.
     * @param {Element[]} elements - Actual emphasis drawing groups.
     * @returns {number} Number of distinct rendered mark rows.
     * @example
     * // A narrow paragraph retains all marks across several visual lines.
     */
    elements=>{
      /** Subpixel variation within one line must not create a synthetic row. */
      const rows=new Set<number>();
      for(/** Each complete grapheme owns exactly one mark group. */const element of elements)rows.add(Math.round(element.getBoundingClientRect().top/5));
      return rows.size;
    })).toBeGreaterThan(2);
  await loadEmphasis(page, 15);
  await openEmphasis(page);
  await expect(page.locator('[name="emphasis-type"]')).toHaveValue("15");
  await page.locator('[data-modal-value="apply"]').click();
  /** Legacy storage survives a dialog that makes no authored change. */
  const binary = readHwp(await exportEmphasis(page, "hwp")),
    xml = await readHwpx(await exportEmphasis(page, "hwpx"));
  for (/** Native legacy XML conversion follows observed native omission. */ const [
    doc,
    expected,
  ] of [
    [binary.doc, 15],
    [xml.doc, 0],
  ] as const)
    for (/** Source effect is identified by its own mark type. */ const mark of doc
      .content![0].content![0].marks!)
      if (mark.type === "textStyle")
        expect(mark.attrs!.nativeEmphasisType).toBe(expected);
}
test(
  "native emphasis draws all supported placements per grapheme and retains legacy storage",
  verifyEmphasisGeometry,
);
