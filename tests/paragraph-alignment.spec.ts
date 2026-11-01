import {DOCUMENT_START_KEY,LINE_END_KEY} from './helpers/native-keyboard.ts';
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Download actual UI output so native/HTML assertions use real application serialization.
 *
 * The listener is registered before export. No editor state or internal
 * serializer is substituted for the actual completed download.
 * @async
 * @param {Page} page - Owned browser application.
 * @param {string} format - Native or standalone HTML export format.
 * @returns {Promise<Buffer>} Actual application-produced file bytes.
 * @throws {Error} If exporting or reading the real download fails.
 * @example
 * const bytes=await alignmentExport(page,'hwp');
 */
async function alignmentExport(page: Page, format: string): Promise<Buffer> {
  /** One completed UI export belongs to this download listener. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Real serialized file remains available in the browser-owned download directory. */
  const download = await pending;
  return readFile((await download.path())!);
}

/**
 * Measure the second hard line's actual individual Latin character positions.
 *
 * DOM ranges observe real browser glyph layout, independently of model attrs,
 * computed text-justify labels and native file serialization expectations.
 * @returns {{width:number;extent:number;advance:number}} Actual unzoomed line geometry.
 * @throws {Error} If the controlled text node or paper geometry is unavailable.
 * @example
 * // ABCDE spans the line in character distribution but remains a word in split mode.
 */
function latinLineGeometry(): {
  width: number;
  extent: number;
  advance: number;
} {
  /** Actual paragraph and text fragments are measured inside the live editor. */
  const paragraph = document.querySelector(".tiptap p")!,
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    zoom = Number(getComputedStyle(document.querySelector("#paper")!).zoom);
  let node: Node | null = null;
  while (walker.nextNode())
    if (walker.currentNode.textContent === "ABCDE") {
      node = walker.currentNode;
      break;
    }
  if (!node) throw new Error("Controlled native-alignment text is missing.");
  /** Each letter is measured with a real DOM range on the exact rendered text node. */
  const range = document.createRange(),
    positions: DOMRect[] = [];
  for (let index = 0; index < 5; index++) {
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    positions.push(range.getBoundingClientRect());
  }
  return {
    width: paragraph.getBoundingClientRect().width / zoom,
    extent: (positions[4].right - positions[0].left) / zoom,
    advance: (positions[1].left - positions[0].left) / zoom,
  };
}

/**
 * Exercise all native alignment buttons, actual distribution geometry and native saving.
 *
 * The same three hard lines used in the installed-native capture distinguish
 * character distribution from word distribution, including single-word lines.
 * Dialog radios and quick buttons must show the actual independent selection.
 * @async
 * @param {object} context - Isolated browser regression bindings.
 * @returns {Promise<void>} Resolves after all six UI modes and native outputs agree.
 * @throws {Error} If selection state, real glyph layout or native saved alignment differs.
 * @example
 * // Distribute stretches ABCDE; split keeps it together while distributing word spaces.
 */
async function verifySixAlignmentModes({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Controlled native sample geometry matches the installed-native observations. */
  const payload = {
    application: "forhan",
    version: 1,
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { marginRight: "200pt" },
          content: [
            {
              type: "text",
              text: "AB CD 가나다 라마",
              marks: [{ type: "textStyle", attrs: { fontSize: "16pt" } }],
            },
            { type: "hardBreak" },
            {
              type: "text",
              text: "ABCDE",
              marks: [{ type: "textStyle", attrs: { fontSize: "16pt" } }],
            },
            { type: "hardBreak" },
            {
              type: "text",
              text: "가나다라마",
              marks: [{ type: "textStyle", attrs: { fontSize: "16pt" } }],
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "여섯 정렬.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  for (/** Native source order differs from visual toolbar order but every mode is independently addressable. */
  const [mode, label] of [
    ["distribute", "배분 정렬"],
    ["split", "나눔 정렬"],
    ["left", "왼쪽 정렬"],
    ["right", "오른쪽 정렬"],
    ["center", "가운데 정렬"],
    ["justify", "양쪽 정렬"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tiptap p")).toHaveAttribute(
      "data-forhan-paragraph-alignment",
      mode,
    );
    if (mode === "distribute" || mode === "split") {
      /** Observed glyph geometry independently proves the two strategies actually differ. */
      const layout = await page.evaluate(latinLineGeometry);
      if (mode === "distribute") {
        expect(layout.extent).toBeCloseTo(layout.width, 0);
        expect(layout.advance).toBeGreaterThan(50);
      } else {
        expect(layout.extent).toBeLessThan(layout.width / 2);
        expect(layout.advance).toBeLessThan(25);
      }
    }
    await page.locator('button[data-native-tab="format"]').click();
    await page
      .locator('.native-ribbon [data-native-action="paragraph-format"]')
      .click();
    await expect(page.locator(`[name="align"][value="${mode}"]`)).toBeChecked();
    await page.locator('[data-modal-value="apply"]').click();
    for (/** Native downloads distinguish model semantics from a merely selected-looking icon. */
    const format of ["hwp", "hwpx"]) {
      /** Actual application serialization is reconstructed through the corresponding native reader. */
      const bytes = await alignmentExport(page, format),
        parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(parsed.doc.content![0].attrs!.textAlign).toBe(mode);
    }
  }
  await page.locator(".tiptap").click();
  for (/** Actual installed-native quick access keys follow the six visible toolbar positions. */
  const [index, mode] of [
    "justify",
    "left",
    "center",
    "right",
    "distribute",
    "split",
  ].entries()) {
    await page.keyboard.press(`Alt+${index + 1}`);
    await expect(page.locator(".tiptap p")).toHaveAttribute(
      "data-forhan-paragraph-alignment",
      mode,
    );
  }
  await page.keyboard.press("Alt+1");
  await page.keyboard.press("ControlOrMeta+Shift+t");
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "distribute",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "justify",
  );
  await page.keyboard.press("ControlOrMeta+Shift+c");
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "center",
  );
  await page.keyboard.press("ControlOrMeta+Shift+m");
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "justify",
  );
}
test(
  "six native alignment modes have real distinct geometry, selection state, shortcuts and native exports",
  verifySixAlignmentModes,
);

/**
 * Keep rapid alignment gestures and subsequent source typing independently undoable.
 *
 * Public native shortcuts and ordinary keyboard input must retain discrete
 * user gestures regardless of the typing-group delay. Repeating the current
 * alignment must not introduce an empty undo step.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after rapid source formatting, typing, undo and redo agree.
 * @throws {Error} If formatting merges with later typing or a no-op creates history.
 * @example
 * // Undo X preserves distribution; the next undo restores justification.
 */
async function verifyDiscreteAlignmentHistory({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Explicit original source keeps formatting history independent of document initialization. */
  const doc={type:'doc',content:[{type:'paragraph',attrs:{textAlign:'justify',lineHeight:'100%'},content:[{type:'text',text:'ALPHA beta',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'16pt'}}]}]}]};
  await page.locator('#file-input').setInputFiles({name:'alignment-history.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc}))});
  await expect(page.locator('#toast')).toContainText('alignment-history.fhn');await page.locator('.tiptap').press(DOCUMENT_START_KEY);
  await page.keyboard.press('ControlOrMeta+Shift+t');await expect(page.locator('.tiptap p')).toHaveAttribute('data-forhan-paragraph-alignment','distribute');
  await page.keyboard.press(LINE_END_KEY);await page.keyboard.type('X');await expect(page.locator('.tiptap')).toHaveText('ALPHA betaX');
  await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap')).toHaveText('ALPHA beta');await expect(page.locator('.tiptap p')).toHaveAttribute('data-forhan-paragraph-alignment','distribute');
  await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap p')).toHaveAttribute('data-forhan-paragraph-alignment','justify');
  await page.keyboard.press('ControlOrMeta+Shift+z');await expect(page.locator('.tiptap p')).toHaveAttribute('data-forhan-paragraph-alignment','distribute');
  await page.keyboard.press('ControlOrMeta+Shift+t');await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap p')).toHaveAttribute('data-forhan-paragraph-alignment','justify');
}

test('rapid native alignment gestures, subsequent typing and repeated no-op formatting retain discrete source undo',verifyDiscreteAlignmentHistory);

/**
 * Preserve distribution across HTML and apply one transaction to mixed selected blocks.
 *
 * Real standalone HTML keeps word/character justification semantics. External
 * changes to CSS override stale native markers; model metadata cannot conceal
 * those edits. Undo restores the original distinct paragraph/heading modes.
 * @async
 * @param {object} context - Isolated browser regression bindings.
 * @returns {Promise<void>} Resolves after HTML, external editing and undo checks.
 * @throws {Error} If HTML collapses native modes or a selected block is omitted.
 * @example
 * // A distributed heading and split paragraph survive HTML reimport independently.
 */
async function verifyAlignmentHtmlAndSelection({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** A heading and body deliberately begin with distinct native distribution modes. */
  const payload = {
    application: "forhan",
    version: 1,
    doc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "distribute" },
          content: [{ type: "text", text: "배분하는 제목" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "split" },
          content: [{ type: "text", text: "나눔 정렬의 문단" }],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "혼합 정렬.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  /** Standalone HTML contains the actual browser distribution properties. */
  const html = await alignmentExport(page, "html");
  expect(html.toString()).toContain("inter-character");
  expect(html.toString()).toContain("inter-word");
  await page
    .locator("#file-input")
    .setInputFiles({ name: "왕복.html", mimeType: "text/html", buffer: html });
  await expect(page.locator(".tiptap h2")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "distribute",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "split",
  );
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.getByRole("button", { name: "나눔 정렬", exact: true }).click();
  await expect(page.locator(".tiptap h2")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "split",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".tiptap h2")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "distribute",
  );
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "split",
  );
  for (/** Native outputs preserve both original modes after the real undo transaction. */
  const format of ["hwp", "hwpx"]) {
    /** Actual mixed-block native download is read independently. */
    const bytes = await alignmentExport(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(parsed.doc.content![0].attrs!.textAlign).toBe("distribute");
    expect(parsed.doc.content![1].attrs!.textAlign).toBe("split");
  }
  await page.locator("#file-input").setInputFiles({
    name: "수정.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      '<p data-forhan-paragraph-alignment="distribute" style="text-align:center;text-align-last:auto;text-justify:auto">외부에서 가운데로 수정한 정렬</p>',
    ),
  });
  await expect(page.locator(".tiptap p")).toHaveAttribute(
    "data-forhan-paragraph-alignment",
    "center",
  );
  /** Native output must reflect externally edited CSS instead of the old distribution marker. */
  const changed = await readHwpx(await alignmentExport(page, "hwpx"));
  expect(changed.doc.content![0].attrs!.textAlign).toBe("center");
}
test(
  "native distribution survives HTML and mixed-block undo while external CSS remains authoritative",
  verifyAlignmentHtmlAndSelection,
);
