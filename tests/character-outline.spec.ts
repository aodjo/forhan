import {DOCUMENT_END_KEY} from './helpers/native-keyboard.ts';
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Load independently authored outlined source through the ordinary file input.
 *
 * Shadow, shading and native underline remain separate source properties and
 * must not be overwritten by a representative outline-only edit.
 * @async
 * @param {Page} page - Owned renderer page.
 * @param {number} [code=2] - Native outline source code, including retained legacy seven.
 * @returns {Promise<void>} Resolves after actual source metadata renders.
 * @example
 * await loadOutline(page,7); // Keeps the unlisted native binary preference editable.
 */
async function loadOutline(page: Page, code = 2): Promise<void> {
  await page.locator("#file-input").setInputFiles({
    name: "outline.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        title: "Outline source",
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Outline ABC 한글",
                  marks: [
                    {
                      type: "textStyle",
                      attrs: {
                        fontFamily: "Arial",
                        fontSize: "32pt",
                        color: "#123456",
                        backgroundColor: "#faf3db",
                        nativeOutlineType: code,
                        nativeShadowType: "CONTINUOUS",
                        nativeShadowOffsetX: -10,
                        nativeShadowOffsetY: 20,
                        nativeShadowColor: "#775533",
                      },
                    },
                    {
                      type: "underline",
                      attrs: {
                        nativePosition: "TOP",
                        nativePattern: 11,
                        nativeColor: "#654321",
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
    page.locator(`.tiptap [data-forhan-outline="${code}"]`),
  ).toBeAttached();
}

/**
 * Open the real Expanded panel while retaining its original source selection.
 *
 * Dialog focus changes do not replace source text or its editing history.
 * @async
 * @param {Page} page - Owned renderer page.
 * @returns {Promise<void>} Resolves with the native outline selector available.
 * @example
 * await openOutline(page); // Pending choices stay cancelable.
 */
async function openOutline(page: Page): Promise<void> {
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
}

/**
 * Read original bytes from an actual source, native or standalone HTML export.
 *
 * Production serializers create all output; this helper only observes downloads.
 * @async
 * @param {Page} page - Owned browser renderer.
 * @param {'forhan'|'hwp'|'hwpx'|'html'} format - Actual selected output format.
 * @returns {Promise<Buffer>} Complete unmodified production output.
 * @example
 * const native=await exportOutline(page,'hwp');
 */
async function exportOutline(
  page: Page,
  format: "forhan" | "hwp" | "hwpx" | "html",
): Promise<Buffer> {
  /** The real download observer is installed before the source action. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Actual saved bytes retain the independently generated binary or XML encoding. */
  const output = await pending;
  return readFile((await output.path())!);
}

/**
 * Concatenate authored text without counting inaccessible contour drawing nodes.
 *
 * Source serialization is the authority for original document content and undo.
 * @param {JSONContent} node - Actual exported source node.
 * @returns {string} Original authored text in source order.
 * @example
 * sourceOutlineText(payload.doc); // Does not double text because SVG also draws its contours.
 */
function sourceOutlineText(node: JSONContent): string {
  let text = node.text || "";
  for (/** Source content remains independent of the drawing-only DOM. */ const child of node.content ||
    [])
    text += sourceOutlineText(child);
  return text;
}

/**
 * Verify native outline controls, actual saved effects, cancellation and one undo.
 *
 * The graphic menu retains native geometry and keyboard ownership. HTML reimport
 * removes auxiliary SVG before parsing the unchanged selectable source text.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after GUI, both native formats, HTML and source checks.
 * @throws {Error} If source effects flatten, popup ownership leaks or drawings duplicate text.
 * @example
 * // Selecting DASH_DOT_DOT changes only outline kind while keeping the original shadow and line.
 */
async function verifyOutlineEditing({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadOutline(page);
  await openOutline(page);
  /** The source draft and real graphic selector remain independently addressable. */
  const button = page.getByRole("combobox", { name: "외곽선", exact: true }),
    list = page.locator("#native-outline-type-list");
  await expect(page.locator('[name="outline-type"]')).toHaveValue("2");
  await button.click();
  await expect(list).toHaveCSS("width", "91px");
  await expect(list).toHaveCSS("height", "192px");
  await expect(list.getByRole("option")).toHaveCount(7);
  await list
    .getByRole("option", { name: "일점쇄선 외곽선", exact: true })
    .click();
  await expect(
    page
      .locator(
        '.nd-character-sample svg[data-forhan-outline-drawing] text[data-outline-kind="5"]',
      )
      .first(),
  ).toBeAttached();
  await expect(
    page.locator('.tiptap [data-forhan-outline="2"]'),
  ).toBeAttached();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await openOutline(page);
  await button.click();
  await button.press("Home");
  await button.press("Escape");
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await expect(page.locator('[name="outline-type"]')).toHaveValue("2");
  await button.click();
  await button.press("End");
  await button.press("Enter");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(
    page
      .locator(
        '.tiptap svg[data-forhan-outline-drawing] text[data-outline-kind="6"]',
      )
      .first(),
  ).toBeAttached();
  for (/** Real binary and XML outputs retain independently stored character effects. */ const format of [
    "hwp",
    "hwpx",
  ] as const) {
    /** Original output bytes are decoded without substituting a test-generated file. */
    const bytes = await exportOutline(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    for (/** Original mark order is not an authority for effect identity. */ const mark of parsed
      .doc.content![0].content![0].marks!) {
      if (mark.type === "textStyle")
        expect(mark.attrs).toMatchObject({
          nativeOutlineType: 6,
          nativeShadowType: "CONTINUOUS",
          nativeShadowOffsetX: -10,
          nativeShadowOffsetY: 20,
          nativeShadowColor: "#775533",
          backgroundColor: "#faf3db",
          color: "#123456",
        });
      if (mark.type === "underline")
        expect(mark.attrs).toMatchObject({
          nativePosition: "TOP",
          nativePattern: 11,
          nativeColor: "#654321",
        });
    }
  }
  /** Standalone HTML contains genuine font contours alongside original source metadata. */
  const html = await exportOutline(page, "html");
  expect(html.toString()).toContain("data-forhan-outline-drawing");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(
    page.locator('.tiptap [data-forhan-outline="2"]'),
  ).toBeAttached();
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "outline.html",
      mimeType: "text/html",
      buffer: html,
    });
  await page.getByRole("button", { name: "저장 안 함", exact: true }).click();
  await expect(
    page.locator('.tiptap [data-forhan-outline="6"]'),
  ).toBeAttached();
  /** Real source saving proves inaccessible SVG text never duplicates authored content. */
  const saved = JSON.parse((await exportOutline(page, "forhan")).toString());
  expect(sourceOutlineText(saved.doc)).toBe("Outline ABC 한글");
  expect(JSON.stringify(saved.doc)).not.toContain("forhan-outline-drawing");
}
test(
  "native outline controls preserve source effects through real native exports, HTML reimport and one undo",
  verifyOutlineEditing,
);

/**
 * Count real rasterized foreground ink in an unchanged captured paragraph image.
 *
 * A warm source background is excluded by fixed independent thresholds. This
 * checks actual hollow glyph painting rather than a metadata-only effect label.
 * @async
 * @param {string} base64 - Original actual paragraph PNG bytes.
 * @returns {Promise<number>} Number of dark source foreground pixels.
 * @throws {Error} If the real screenshot cannot be decoded.
 * @example
 * // Hollow contours contain substantially less foreground ink than filled Arial glyphs.
 */
async function outlineInk(base64: string): Promise<number> {
  /** Original screenshot pixels are decoded without registration, masking or source mutation. */
  const image = new Image();
  image.src = "data:image/png;base64," + base64;
  await image.decode();
  /** Canvas is used only to inspect the original complete screenshot buffer. */
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  /** Real decoded RGBA values remain independent of native outline implementation details. */
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  /** Warm shading remains distinct from the authored dark blue glyph contours. */
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4)
    if (
      pixels[index] < 150 &&
      pixels[index + 1] < 170 &&
      pixels[index + 2] < 180
    )
      count++;
  return count;
}

/**
 * Verify actual hollow and patterned rendering, wrapping, source integrity and typing.
 *
 * Every supported style must draw differently, while thick contours paint more
 * ink than thin contours. A wrapped source paragraph uses several real SVG lines
 * without entering source counts or creating extra undo history.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after actual screenshot and source-history checks.
 * @throws {Error} If outlines remain filled, patterns collapse or drawing changes source text.
 * @example
 * // Dotted and dashed contours differ even though they share the same source glyphs.
 */
async function verifyOutlineRendering({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Identical independently authored glyphs make raster differences attributable to the actual effect. */
  const content: JSONContent[] = [];
  for (let code = 0; code < 7; code++)
    content.push({
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        {
          type: "text",
          text: "OOOO",
          marks: [
            {
              type: "textStyle",
              attrs: {
                fontFamily: "Arial",
                fontSize: "64pt",
                color: "#123456",
                backgroundColor: "#faf3db",
                nativeOutlineType: code,
              },
            },
          ],
        },
      ],
    });
  content.push({
    type: "paragraph",
    attrs: { textAlign: "left" },
    content: [
      {
        type: "text",
        text: "Wrapped outline text 한글 ".repeat(30),
        marks: [
          {
            type: "textStyle",
            attrs: {
              fontFamily: "Arial",
              fontSize: "20pt",
              color: "#123456",
              nativeOutlineType: 4,
            },
          },
        ],
      },
    ],
  });
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "outline-raster.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          application: "forhan",
          version: 1,
          title: "Raster outline",
          doc: { type: "doc", content },
        }),
      ),
    });
  await expect(
    page.locator(".tiptap svg[data-forhan-outline-drawing]"),
  ).toHaveCount(7);
  /** Actual rendered paragraph captures retain all original pixels for independent ink counts. */
  const counts: number[] = [],
    hashes = new Set<string>();
  for (let code = 0; code < 7; code++) {
    /** One genuine element capture contains identical source glyphs and source shading. */
    const bytes = await page.locator(".tiptap p").nth(code).screenshot();
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
    counts.push(await page.evaluate(outlineInk, bytes.toString("base64")));
  }
  expect(hashes.size).toBe(7);
  expect(counts[0]).toBeGreaterThan(counts[1] * 1.5);
  expect(counts[3]).toBeGreaterThan(counts[1] * 1.3);
  for (/** Every contour must contain actual visible ink, including sparse dotted strokes. */ const count of counts)
    expect(count).toBeGreaterThan(30);
  /** Actual contour baselines span several real soft-wrapped lines. */
  const rows = new Set(
    await page
      .locator(".tiptap p")
      .last()
      .locator("svg[data-forhan-outline-drawing] text")
      .evaluateAll(
        /**
         * Read original measured contour baselines from the actual drawing layer.
         *
         * Repeated words on one line share a baseline but remain original source text.
         * @param {Element[]} elements - Real owned SVG text fragments.
         * @returns {(string|null)[]} Actual source-derived baseline positions.
         * @example
         * // A narrow paragraph has multiple y positions without inserted source breaks.
         */
        (elements) =>
          elements.map(
            /**
             * Read one actual drawing fragment's baseline without changing layout.
             *
             * Numeric identity comes from the current measured SVG, not a test fixture.
             * @param {Element} element - One owned SVG contour fragment.
             * @returns {string|null} Its original baseline attribute.
             * @example
             * // The baseline remains inside its owning source paragraph coordinate system.
             */
            (element) => element.getAttribute("y"),
          ),
      ),
  );
  expect(rows.size).toBeGreaterThan(3);
  /** Saved source is independent of the repeated text used by inaccessible contour drawing. */
  const before = JSON.parse((await exportOutline(page, "forhan")).toString());
  expect(sourceOutlineText(before.doc)).toBe(
    content
      .map(
        /**
         * Collect independently authored test text for a source-content comparison.
         *
         * The expected value never reads glyph drawing nodes or their SVG content.
         * @param {JSONContent} node - Original authored paragraph.
         * @returns {string} Its expected source text.
         * @example
         * // Repeated visual contours cannot inflate this expected source value.
         */
        (node) => sourceOutlineText(node),
      )
      .join(""),
  );
  await page.locator(".tiptap").press(DOCUMENT_END_KEY);
  await page.keyboard.insertText("검증");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  /** Real source after one undo must exactly retain its pre-typing document. */
  const after = JSON.parse((await exportOutline(page, "forhan")).toString());
  expect(after.doc).toEqual(before.doc);
}
test(
  "real contour pixels distinguish all native styles while wrapping and source history remain intact",
  verifyOutlineRendering,
);

/**
 * Verify the unlisted native compatibility code survives ordinary editing.
 *
 * Installed Hangul can store seven in binary but emits no outline type in HWPX.
 * The source code stays explicit in Forhan and HTML instead of blocking document
 * use or silently overwriting it when an unrelated foreground field changes.
 * @async
 * @param {{page:Page}} context - Owned renderer bindings.
 * @returns {Promise<void>} Resolves after legacy source editing and native conversion checks.
 * @throws {Error} If the source code is flattened before an explicit outline edit.
 * @example
 * // A foreground color edit retains legacy binary flag seven and the native HWPX projection.
 */
async function verifyLegacyOutline({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadOutline(page, 7);
  await openOutline(page);
  await page.getByRole("combobox", { name: "외곽선", exact: true }).click();
  await expect(
    page.locator('#native-outline-type-list [role="option"]'),
  ).toHaveCount(8);
  await expect(
    page.getByRole("option", { name: "원본 호환 외곽선", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("combobox", { name: "외곽선", exact: true })
    .press("Escape");
  await page.locator('[data-character-tab="basic"]').click();
  await page.locator(".native-dialog-character").getByRole("button", { name: "글자 색", exact: true }).click();
  await page
    .locator(
      '#native-color-palette .cp-theme-base [data-color-value="#3a3c84"]',
    )
    .click();
  await page.locator('[data-modal-value="apply"]').click();
  for (/** Legacy binary storage and the native XML omission are distinct format behaviors. */ const format of [
    "hwp",
    "hwpx",
  ] as const) {
    /** Both expected representations are read from actual GUI export bytes. */
    const bytes = await exportOutline(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    let found = false;
    for (/** Unrelated source foreground edits must not replace the original outline field. */ const mark of parsed
      .doc.content![0].content![0].marks!)
      if (mark.type === "textStyle") {
        expect(mark.attrs).toMatchObject({
          nativeOutlineType: format === "hwp" ? 7 : 0,
          color: "#3a3c84",
        });
        found = true;
      }
    expect(found).toBe(true);
  }
}
test(
  "unlisted native outline compatibility values retain binary storage through unrelated edits",
  verifyLegacyOutline,
);

/**
 * Keep contour foreground visible during actual rectangular table-cell selection.
 *
 * A cell selection highlights cells rather than selecting a browser text range.
 * Its glyphs must retain their foreground instead of acquiring white text-range
 * strokes, including cells crossed by a real pointer drag.
 * @async
 * @param {{page:Page}} context - Owned renderer bindings.
 * @returns {Promise<void>} Resolves after all four actual selected cells retain readable contours.
 * @throws {Error} If rectangular selection hides outlined source glyphs.
 * @example
 * // The table selection layer can tint cell backgrounds without erasing dark glyph contours.
 */
async function verifyOutlineCellSelection({page}:{page:Page}):Promise<void>{
  await page.goto("/");
  /** Authored cell source does not contain drawing SVG or a synthetic selection state. */
  const rows:JSONContent[]=[];
  for(let row=0;row<2;row++){
    /** Each real cell has its own selectable source paragraph and contour layer. */
    const cells:JSONContent[]=[];
    for(let column=0;column<2;column++)cells.push({type:"tableCell",content:[{type:"paragraph",content:[{type:"text",text:"Outline",marks:[{type:"textStyle",attrs:{fontSize:"20pt",fontFamily:"Arial",color:"#123456",nativeOutlineType:2}}]}]}]});
    rows.push({type:"tableRow",content:cells});
  }
  await page.locator("#file-input").setInputFiles({name:"outline-cells.forhan",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({application:"forhan",version:1,title:"Outline cells",doc:{type:"doc",content:[{type:"table",content:rows}]}}))});
  await expect(page.locator('.tiptap td svg[data-forhan-outline-drawing]')).toHaveCount(4);
  /** Real pointer coordinates belong to the actual first and last source cells. */
  const first=(await page.locator(".tiptap td").first().boundingBox())!,last=(await page.locator(".tiptap td").last().boundingBox())!;
  await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();
  await page.mouse.move(last.x+last.width/2,last.y+last.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator(".tiptap td.selectedCell")).toHaveCount(4);
  for(let index=0;index<4;index++)await expect(page.locator('.tiptap td.selectedCell svg[data-forhan-outline-drawing] text').nth(index)).toHaveCSS("stroke","rgb(18, 52, 86)");
}
test("rectangular table selection retains visible original foreground on outlined cells",verifyOutlineCellSelection);
