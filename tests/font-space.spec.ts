import {DOCUMENT_START_KEY} from './helpers/native-keyboard.ts';
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * Import an independently specified source space mode at a controlled point height.
 *
 * The original text contains ordinary ASCII spaces rather than substitute
 * Unicode glyphs or layout-only source attributes.
 * @async
 * @param {Page} page - Owned renderer page.
 * @param {boolean} mode - Native character-shape space preference.
 * @param {boolean} [kerning=false] - Independent original native kerning preference.
 * @returns {Promise<void>} Resolves when actual source and native drawing state apply.
 * @example
 * await loadSpaceMode(page,false); // Eight native half-em spaces.
 */
async function loadSpaceMode(
  page: Page,
  mode: boolean,
  kerning = false,
): Promise<void> {
  /** Independently authored source has one real character shape and eight ASCII spaces. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "Native spaces",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "left" },
          content: [
            {
              type: "text",
              text: "A        A",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontFamily: "Arial",
                    fontSize: "16pt",
                    nativeUseFontSpace: mode,
                    nativeUseKerning: kerning,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: `space-${mode}.forhan`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(
    page.locator(`.tiptap [data-forhan-use-font-space="${mode ? 1 : 0}"]`),
  ).toBeAttached();
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    mode ? 0 : 1,
  );
}

/**
 * Measure actual first/last glyph positions across arbitrary transparent wrappers.
 *
 * DOM ranges establish real visible text coordinates independently of source
 * mode metadata or declared word-spacing deltas.
 * @returns {{distance:number;zoom:number}} Real glyph-origin distance and actual paper scale.
 * @example
 * const actual = await page.evaluate(spaceGeometry);
 */
function spaceGeometry(): { distance: number; zoom: number } {
  /** Original text remains discoverable across source marks and native drawing-only ranges. */
  const paragraph = document.querySelector(".tiptap p")!,
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    origins: number[] = [];
  while (walker.nextNode()) {
    /** Every matching source letter supplies its actual DOM selection rectangle. */
    const node = walker.currentNode as Text;
    for (let index = 0; index < node.length; index++)
      if (node.data[index] === "A") {
        /** Literal source offsets do not depend on any generated wrapper identity. */
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        origins.push(range.getBoundingClientRect().left);
      }
  }
  return {
    distance: origins.at(-1)! - origins[0],
    zoom: Number(getComputedStyle(document.querySelector("#paper")!).zoom),
  };
}

/**
 * Verify actual mode-dependent spaces, native dialog scope, cancellation and undo.
 *
 * A real Expanded checkbox changes source mode; switching panels cannot reset
 * a Basic font-size draft. Rendering-only changes never create extra undo steps.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after actual geometry and source interaction checks.
 * @throws {Error} If drawing, draft isolation or native source mode changes unexpectedly.
 * @example
 * // Half-em and intrinsic Arial spaces have independently different visible advances.
 */
async function verifySpaceEditing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadSpaceMode(page, false);
  /** Real half-em distance includes one unchanged initial Arial glyph advance. */
  const half = await page.evaluate(spaceGeometry);
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="size"]').fill("18.25");
  await page.locator('[data-character-tab="expanded"]').click();
  await expect(page.locator('[name="font-space"]')).not.toBeChecked();
  await page.locator('[name="font-space"]').check();
  await page.locator('[data-character-tab="basic"]').click();
  await expect(page.locator('[name="size"]')).toHaveValue("18.25");
  await page.locator('[data-character-tab="expanded"]').click();
  await expect(page.locator('[name="font-space"]')).toBeChecked();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(
    page.locator('.tiptap [data-forhan-use-font-space="0"]'),
  ).toHaveCSS("font-size", "21.3333px");
  expect((await page.evaluate(spaceGeometry)).distance).toBeCloseTo(
    half.distance,
    4,
  );
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
  await page.locator('[name="font-space"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(
    page.locator('.tiptap [data-forhan-use-font-space="1"]'),
  ).toBeAttached();
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    0,
  );
  /** The exact mode difference follows eight spaces at the same unchanged point height. */
  const intrinsic = await page.evaluate(spaceGeometry);
  expect((half.distance - intrinsic.distance) / half.zoom).toBeGreaterThan(30);
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(
    page.locator('.tiptap [data-forhan-use-font-space="0"]'),
  ).toBeAttached();
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    1,
  );
  expect((await page.evaluate(spaceGeometry)).distance).toBeCloseTo(
    half.distance,
    4,
  );
}
test(
  "native expanded font-space checkbox changes real advance without losing drafts or undo",
  verifySpaceEditing,
);

/**
 * Copy real editor content into a test-owned rich transfer.
 *
 * Production handlers serialize the current selection without touching the OS clipboard.
 * @returns {string} Original serialized clipboard HTML.
 * @example
 * const html = await page.evaluate(copyOwnedHtml);
 */
function copyOwnedHtml(): string {
  /** The isolated transfer is visible only to this genuine copy event. */
  const transfer = new DataTransfer();
  document
    .querySelector(".tiptap")!
    .dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  return transfer.getData("text/html");
}

/**
 * Paste a real rich fragment through the production clipboard handler.
 *
 * The isolated event retains text and HTML flavors without changing the OS clipboard.
 * @param {string} html - Original markup emitted by the actual copy handler.
 * @returns {void} Dispatches one genuine rich paste event.
 * @example
 * await page.evaluate(pasteOwnedHtml, html);
 */
function pasteOwnedHtml(html: string): void {
  /** Only the disposable renderer observes the two original clipboard flavors. */
  const transfer = new DataTransfer();
  transfer.setData("text/html", html);
  transfer.setData("text/plain", "A A");
  document
    .querySelector(".tiptap")!
    .dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
}

/**
 * Verify ordinary external HTML and owned rich clipboard keep distinct space defaults.
 *
 * Genuine copy/paste handlers run with an isolated DataTransfer, without changing
 * the operating system clipboard. Newly authored bare native text must not gain
 * intrinsic spaces merely because rich copying passes through HTML.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after real clipboard and imported-model checks.
 * @throws {Error} If HTML or clipboard conversion collapses native preferences.
 * @example
 * // External bare HTML is intrinsic; self-copied bare native text stays half-em.
 */
async function verifySpaceHtmlClipboard({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("A A");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  /** Actual production copy handlers write only into this test-owned transfer object. */
  const html = await page.evaluate(
    /**
     * Exercise real rich copying while keeping the OS clipboard untouched.
     *
     * The detached transfer contains exactly what the actual copy handler serializes.
     * @returns {string} Actual rich copied HTML.
     * @example
     * // An implicit native false preference is explicit in clipboard markup.
     */
    () => {
      /** A real DOM clipboard event targets the fully initialized source editor. */
      const transfer = new DataTransfer();
      document.querySelector(".tiptap")!.dispatchEvent(
        new ClipboardEvent("copy", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
      return transfer.getData("text/html");
    },
  );
  expect(html).toContain('data-forhan-use-font-space="0"');
  await page.locator(".tiptap").fill("");
  await page.evaluate(
    /**
     * Paste the actual copied fragment through the production rich-paste path.
     *
     * The transfer is owned and never reaches operating-system clipboard storage.
     * @param {string} html - Exact HTML emitted by the real copy handler.
     * @returns {void} Dispatches one real editor paste event.
     * @example
     * // Source text is still A, ASCII space, A after the rich round trip.
     */
    (html) => {
      /** Actual rich content and text flavors belong to this one isolated paste event. */
      const transfer = new DataTransfer();
      transfer.setData("text/html", html);
      transfer.setData("text/plain", "A A");
      document.querySelector(".tiptap")!.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    html,
  );
  await expect(
    page.locator('.tiptap [data-forhan-use-font-space="0"]'),
  ).toHaveText("A A");
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    1,
  );
  await page.locator("#file-input").setInputFiles({
    name: "ordinary.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      '<p>A A</p><p><span style="font-size:20pt;color:#123456">A A</span></p>',
    ),
  });
  await page.getByRole("button", { name: "저장 안 함", exact: true }).click();
  await expect(
    page.locator('.tiptap [data-forhan-use-font-space="1"]'),
  ).toHaveCount(2);
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    0,
  );
  await expect(page.locator(".tiptap p").last().locator("span")).toHaveCSS(
    "font-size",
    "26.6667px",
  );
  /** Real source serialization exposes the actual imported mode rather than only a DOM label. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="forhan"]').click();
  /** Canonical source retains the external HTML's intrinsic mode and original font size. */
  const output = await pending,
    source = JSON.parse(await readFile((await output.path())!, "utf8"));
  expect(
    source.doc.content[0].content[0].marks[0].attrs.nativeUseFontSpace,
  ).toBe(true);
  expect(source.doc.content[1].content[0].marks[0].attrs.fontSize).toBe("20pt");
  /** Block-only table ancestors must not suppress character marks in their text descendants. */
  const table = {
    application: "forhan",
    version: 1,
    title: "Nested copy",
    doc: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "A A" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "nested.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(table)),
    });
  await expect(page.locator(".tiptap td")).toHaveText("A A");
  await page.locator(".tiptap").press(DOCUMENT_START_KEY);
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  /** The actual copied table contains explicit defaults at its nested source text. */
  const nestedHtml = await page.evaluate(copyOwnedHtml);
  expect(nestedHtml).toContain("<table");
  expect(nestedHtml).toContain('data-forhan-use-font-space="0"');
  expect(nestedHtml).toContain('data-forhan-use-kerning="0"');
  await page.locator(".tiptap").fill("");
  await page.evaluate(pasteOwnedHtml, nestedHtml);
  await expect(
    page.locator('.tiptap td [data-forhan-use-font-space="0"]'),
  ).toHaveText("A A");
}
test(
  "external HTML and real self-copy keep independent font-space semantics",
  verifySpaceHtmlClipboard,
);

/**
 * Verify real kerning changes independently of native space mode and remains undoable.
 *
 * Explicit native false disables browser automatic pair kerning. The same Arial
 * source becomes narrower only after the actual Expanded checkbox is applied.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after source, physical width and undo assertions.
 * @throws {Error} If native kerning is merely a label or alters the space preference.
 * @example
 * // Native AVAVAV kerning must visibly narrow the same unchanged source text.
 */
async function verifyKerningEditing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadSpaceMode(page, false);
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.keyboard.insertText("AVAVAV");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  /** Actual source glyph bounds establish a kerning-off physical baseline. */
  const before = await page
    .locator('.tiptap [data-forhan-use-kerning="0"]')
    .boundingBox();
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
  await page.locator('[name="kerning"]').check();
  await expect(page.locator(".nd-character-sample")).toHaveCSS(
    "font-kerning",
    "normal",
  );
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.tiptap [data-forhan-use-kerning="1"]')).toHaveCSS(
    "font-kerning",
    "normal",
  );
  await expect(
    page.locator('.tiptap [data-forhan-use-font-space="0"]'),
  ).toBeAttached();
  /** Same source letters and font size now use real font pair adjustments. */
  const after = await page
    .locator('.tiptap [data-forhan-use-kerning="1"]')
    .boundingBox();
  expect(before!.width - after!.width).toBeGreaterThan(2);
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator('.tiptap [data-forhan-use-kerning="0"]')).toHaveCSS(
    "font-kerning",
    "none",
  );
  expect(
    (await page.locator('.tiptap [data-forhan-use-kerning="0"]').boundingBox())!
      .width,
  ).toBeCloseTo(before!.width, 4);
}
test(
  "native kerning checkbox changes actual pairs independently of font spaces",
  verifyKerningEditing,
);

/**
 * Preserve independent mixed flags and hidden invalid drafts across native panels.
 *
 * Editing kerning cannot flatten an untouched mixed space preference or font
 * height. Applying from Expanded reveals invalid Basic input before validation.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after mixed-state, validation and actual saved-source checks.
 * @throws {Error} If source scope or hidden-field validation is lost.
 * @example
 * // Two opposite native flag pairs stay independently editable in one selection.
 */
async function verifyMixedFlags({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Opposite source flag pairs make accidental checkbox flattening directly observable. */
  const payload = {
    application: "forhan",
    version: 1,
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "A A",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontSize: "16pt",
                    nativeUseFontSpace: false,
                    nativeUseKerning: true,
                  },
                },
              ],
            },
            {
              type: "text",
              text: "B B",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontSize: "20pt",
                    nativeUseFontSpace: true,
                    nativeUseKerning: false,
                    color: "#123456",
                  },
                },
                { type: "bold" },
              ],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "mixed-flags.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="size"]').fill("0");
  await page.locator('[data-character-tab="expanded"]').click();
  /** Both independent source flags have a genuine mixed selection state. */
  const mixed = await page.locator('[name="font-space"]').evaluate(
    /**
     * Read the actual native checkbox's indeterminate state.
     *
     * The state reflects selected source runs rather than an HTML attribute label.
     * @param {HTMLInputElement} field - Actual mixed font-space checkbox.
     * @returns {boolean} Whether the browser exposes a real mixed state.
     * @example
     * // Untouched mixed source modes remain intact on Apply.
     */
    (field: HTMLInputElement) => field.indeterminate,
  );
  expect(mixed).toBe(true);
  await page.locator('[name="kerning"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await expect(page.locator('[data-character-tab="basic"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('[name="size"]')).toHaveValue("0");
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
  await expect(page.locator('[name="font-space"]')).toBeChecked({
    indeterminate: true,
  });
  await expect(page.locator('[name="kerning"]')).toBeChecked({
    indeterminate: true,
  });
  await page.locator('[name="kerning"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  /** Real source output reveals independent flags after the actual native dialog applies. */
  const pending = page.waitForEvent("download");
  await page.locator("#save-document").click();
  /** Only the explicitly edited flag and restored size draft may change source. */
  const output = await pending,
    source = JSON.parse(await readFile((await output.path())!, "utf8")),
    runs = source.doc.content[0].content;
  expect(runs[0].marks[0].attrs.nativeUseFontSpace).toBe(false);
  expect(runs[1].marks[0].attrs.nativeUseFontSpace).toBe(true);
  expect(runs[0].marks[0].attrs.nativeUseKerning).toBe(true);
  expect(runs[1].marks[0].attrs.nativeUseKerning).toBe(true);
  expect(runs[1].marks[0].attrs.color).toBe("#123456");
  expect(runs[0].marks[0].attrs.fontSize).toBe("16pt");
  expect(runs[1].marks[0].attrs.fontSize).toBe("20pt");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(
    page.locator('.tiptap [data-forhan-use-kerning="0"]'),
  ).toHaveText("B B");
}
test(
  "mixed spacing flags survive panel validation and independent native edits",
  verifyMixedFlags,
);

/**
 * Keep pair shaping stable when a kerned run changes its native space mode and undoes.
 *
 * Transparent corrections span coherent text instead of splitting A-space pairs.
 * Otherwise the browser could restore the same source with a different width.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after identical source restores identical physical geometry.
 * @throws {Error} If source-equivalent undo changes actual pair shaping.
 * @example
 * // Native kerning stays true while only the independent space preference changes.
 */
async function verifyKernedSpaceUndo({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadSpaceMode(page, false, true);
  /** Actual original pair geometry includes explicit native kerning and half-em source spaces. */
  const before = await page.evaluate(spaceGeometry);
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
  await page.locator('[name="font-space"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    0,
  );
  await expect(page.locator('.tiptap [data-forhan-use-kerning="1"]')).toHaveCSS(
    "font-kerning",
    "normal",
  );
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap [data-forhan-space-delta]")).toHaveCount(
    1,
  );
  expect((await page.evaluate(spaceGeometry)).distance).toBeCloseTo(
    before.distance,
    4,
  );
  await expect(page.locator('.tiptap [data-forhan-use-kerning="1"]')).toHaveCSS(
    "font-kerning",
    "normal",
  );
}
test(
  "kerned native spaces restore identical shaping through one undo",
  verifyKernedSpaceUndo,
);
