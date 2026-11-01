import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";

/**
 * Import independent source lines with separate colors, positions and glyph sizes.
 *
 * Mixed mode retains different native properties on two adjacent source runs.
 * @async
 * @param {Page} page - Owned renderer page.
 * @param {boolean} [mixed=false] - Whether to append an independently styled second run.
 * @param {'TOP'|'BOTTOM'|'CENTER'} [position='TOP'] - Independent source underline position.
 * @returns {Promise<void>} Resolves after actual semantic marks render.
 * @example
 * await loadLines(page,true); // Color edits must preserve both original positions.
 */
async function loadLines(page: Page, mixed = false, position: "TOP" | "BOTTOM" | "CENTER" = "TOP"): Promise<void> {
  /** Source characters and marks remain independent of any product selector implementation. */
  const content = [
    {
      type: "text",
      text: "Native 한글",
      marks: [
        {
          type: "textStyle",
          attrs: {
            fontSize: "16pt",
            color: "#112233",
            backgroundColor: "#f5f5f5",
          },
        },
        {
          type: "underline",
          attrs: {
            nativePosition: position,
            nativePattern: 11,
            nativeColor: "#123456",
          },
        },
        { type: "strike", attrs: { nativePattern: 1, nativeColor: "#654321" } },
      ],
    },
  ];
  if (mixed)
    content.push({
      type: "text",
      text: " Second",
      marks: [
        {
          type: "textStyle",
          attrs: {
            fontSize: "20pt",
            color: "#334455",
            backgroundColor: "#f5f5f5",
          },
        },
        {
          type: "underline",
          attrs: {
            nativePosition: "BOTTOM",
            nativePattern: 7,
            nativeColor: "#abcdef",
          },
        },
        { type: "strike", attrs: { nativePattern: 7, nativeColor: "#fedcba" } },
      ],
    });
  await page.locator("#file-input").setInputFiles({
    name: "lines.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        title: "Native lines",
        doc: { type: "doc", content: [{ type: "paragraph", content }] },
      }),
    ),
  });
  await expect(page.locator(".tiptap u")).toHaveCount(mixed ? 2 : 1);
}

/**
 * Open the actual Expanded panel without editing source formatting.
 *
 * Explicit button scope avoids matching the shell's selected-tab body metadata.
 * @async
 * @param {Page} page - Owned renderer page.
 * @returns {Promise<void>} Resolves with the retained expanded draft visible.
 * @example
 * await openLines(page); // Selection stays attached to the real source text.
 */
async function openLines(page: Page): Promise<void> {
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-character-tab="expanded"]').click();
}

/**
 * Read a real exported document through the production browser download path.
 *
 * The writer creates all bytes; the test never substitutes generated output.
 * @async
 * @param {Page} page - Owned renderer page.
 * @param {'hwp'|'hwpx'|'html'|'forhan'} format - Actual export or source-save format.
 * @returns {Promise<Buffer>} Original complete production output.
 * @example
 * const bytes = await exportedLines(page,'hwp');
 */
async function exportedLines(
  page: Page,
  format: "hwp" | "hwpx" | "html" | "forhan",
): Promise<Buffer> {
  /** Download begins only after its observation has been installed. */
  const pending = page.waitForEvent("download");
  if (format === "forhan") await page.locator("#save-document").click();
  else {
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
  }
  /** Actual browser download bytes retain independent native encodings. */
  const output = await pending;
  return readFile((await output.path())!);
}

/**
 * Verify real graphic selectors, independent line color, cancellation and undo.
 *
 * Local samples and source CSS must agree before both actual native writers
 * preserve the edited shape rather than flattening it to ordinary underline.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after GUI, source, native files and history checks.
 * @throws {Error} If line drafts leak, colors collapse or native writers lose properties.
 * @example
 * // A triple overline can coexist with an independently colored dotted strike.
 */
async function verifyExpandedLines({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadLines(page);
  await openLines(page);
  await expect(page.locator('[name="underline-position"]')).toHaveValue("TOP");
  await expect(page.locator('[name="underline-pattern"]')).toHaveValue("11");
  await expect(page.locator('[name="strike-pattern"]')).toHaveValue("1");
  await page.getByRole("combobox", { name: "밑줄 모양", exact: true }).click();
  await expect(page.locator("#native-underline-pattern-list")).toHaveCSS(
    "width",
    "91px",
  );
  await expect(page.locator("#native-underline-pattern-list")).toHaveCSS(
    "height",
    "348px",
  );
  await expect(
    page.locator('#native-underline-pattern-list [role="option"]').nth(1),
  ).toHaveAttribute("data-line-value", "2");
  await expect(
    page.locator('#native-underline-pattern-list [role="option"]').nth(2),
  ).toHaveAttribute("data-line-value", "1");
  await page
    .getByRole("option", { name: "가는 선과 굵은 선과 가는 선", exact: true })
    .click();
  await page.getByRole("button", { name: "밑줄 색", exact: true }).click();
  await page
    .locator(
      '#native-color-palette .cp-theme-base [data-color-value="#3a3c84"]',
    )
    .click();
  await expect(
    page.locator(".nd-character-sample [data-forhan-decoration-drawing]"),
  ).toHaveAttribute("style", /background-image/);
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-pattern",
    "11",
  );
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-color",
    "#123456",
  );
  await openLines(page);
  await page.getByRole("combobox", { name: "밑줄 모양", exact: true }).click();
  await page
    .getByRole("option", { name: "가는 선과 굵은 선과 가는 선", exact: true })
    .click();
  await page.getByRole("button", { name: "밑줄 색", exact: true }).click();
  await page
    .locator(
      '#native-color-palette .cp-theme-base [data-color-value="#3a3c84"]',
    )
    .click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-pattern",
    "10",
  );
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-position",
    "TOP",
  );
  await expect(page.locator(".tiptap s")).toHaveCSS(
    "text-decoration-color",
    "rgb(101, 67, 33)",
  );
  for (/** Both native encodings are produced through their actual visible export commands. */ const format of [
    "hwp",
    "hwpx",
  ] as const) {
    /** Original native output reconstructs independent edited and untouched source lines. */
    const bytes = await exportedLines(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    for (/** Source lookup is independent of parser-specific mark ordering. */ const mark of parsed
      .doc.content![0].content![0].marks!) {
      if (mark.type === "underline") {
        expect(mark.attrs!.nativePattern).toBe(10);
        expect(mark.attrs!.nativePosition).toBe("TOP");
        expect(mark.attrs!.nativeColor).toBe("#3a3c84");
      }
      if (mark.type === "strike") {
        expect(mark.attrs!.nativePattern).toBe(1);
        expect(mark.attrs!.nativeColor).toBe("#654321");
      }
    }
  }
  await page.locator(".tiptap").press("ArrowRight");
  await expect(
    page.locator(
      '.tiptap [style*="background-color"] [data-forhan-decoration-drawing]',
    ),
  ).toHaveCount(1);
  expect(await visibleCompoundLineInk(page)).toBeGreaterThan(20);
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-pattern",
    "11",
  );
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-color",
    "#123456",
  );
}
test(
  "expanded graphic lines preserve independent native colors, shapes, cancellation and one undo",
  verifyExpandedLines,
);

/**
 * Verify no-line state and keyboard navigation stay local to native line controls.
 *
 * Escape cancels only an open list; Basic toggles and Expanded enabled states
 * share a draft while untouched native colors remain cancelable.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after enabled-state, keyboard and cancellation checks.
 * @throws {Error} If no-line collapses into solid or dropdown Escape closes the modal.
 * @example
 * // Underline NONE and strike NONE independently disable their own color palette.
 */
async function verifyNoLineDraft({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadLines(page);
  await openLines(page);
  await page.getByRole("combobox", { name: "밑줄 위치", exact: true }).click();
  await page.getByRole("option", { name: "없음", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "밑줄 모양", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "밑줄 색", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "취소선 모양", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "취소선 모양", exact: true })
    .press("Home");
  await expect(page.locator("#native-strike-pattern-list")).toHaveCSS(
    "height",
    "322px",
  );
  await page
    .getByRole("combobox", { name: "취소선 모양", exact: true })
    .press("Escape");
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await expect(page.locator('[name="strike-pattern"]')).toHaveValue("1");
  await page
    .getByRole("combobox", { name: "취소선 모양", exact: true })
    .click();
  await page.getByRole("option", { name: "선 없음", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "취소선 색", exact: true }),
  ).toBeDisabled();
  await page.locator('[data-character-tab="basic"]').click();
  await expect(page.locator('[name="underline"]')).not.toBeChecked();
  await expect(page.locator('[name="strike"]')).not.toBeChecked();
  await page.locator('[data-character-tab="expanded"]').click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap u,.tiptap s")).toHaveCount(0);
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap u")).toHaveCount(1);
  await expect(page.locator(".tiptap s")).toHaveCount(1);
  await openLines(page);
  await page.locator('[data-character-tab="basic"]').click();
  await page.locator('[name="underline"]').uncheck();
  await page.locator('[name="underline"]').check();
  await page.locator('[name="strike"]').uncheck();
  await page.locator('[name="strike"]').check();
  await page.locator('[data-character-tab="expanded"]').click();
  await page.getByRole("combobox", { name: "밑줄 모양", exact: true }).click();
  await page.getByRole("option", { name: "이중 물결선", exact: true }).click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-pattern",
    "12",
  );
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-color",
    "#112233",
  );
  await expect(page.locator(".tiptap s")).toHaveAttribute(
    "data-forhan-line-color",
    "#000000",
  );
}
test(
  "native no-line states and keyboard popup cancellation retain independent draft ownership",
  verifyNoLineDraft,
);

/**
 * Verify measured position menus, retained legacy values and actual native edits.
 *
 * Opening and canceling a popup must preserve legacy CENTER source formatting.
 * Explicit position edits retain independent line patterns and colors through
 * HWP/HWPX output and undo; keyboard navigation remains a cancelable local draft.
 * @async
 * @param {{page:Page}} context - Owned renderer bindings.
 * @returns {Promise<void>} Resolves after real position controls and native output agree.
 * @throws {Error} If popup geometry, source preservation or keyboard ownership regresses.
 * @example
 * // A legacy center underline remains unchanged until the user explicitly chooses 위쪽.
 */
async function verifyUnderlinePositions({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadLines(page, false, "CENTER");
  await openLines(page);
  /** The visible selector and hidden draft share one source identity. */
  const position = page.getByRole("combobox", { name: "밑줄 위치", exact: true }),
    list = page.locator("#native-underline-position-list");
  await expect(position).toHaveText("가운데⌄");
  await position.click();
  await expect(list.getByRole("option")).toHaveText(["없음", "아래쪽", "위쪽", "가운데"]);
  await position.press("Home");
  await position.press("Escape");
  await expect(list).toBeHidden();
  await expect(page.locator('[name="underline-position"]')).toHaveValue("CENTER");
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  /** Real HWPX output must retain the imported legacy field after popup cancellation. */
  const original = await readHwpx(await exportedLines(page, "hwpx"));
  let originalPosition: unknown;
  for (/** Underline and strikeout retain independent source identities in legacy documents. */ const mark of original.doc.content![0].content![0].marks!)
    if (mark.type === "underline") originalPosition = mark.attrs!.nativePosition;
  expect(originalPosition).toBe("CENTER");
  await openLines(page);
  await position.click();
  await list.getByRole("option", { name: "위쪽", exact: true }).click();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap u")).toHaveAttribute("data-forhan-line-position", "TOP");
  await openLines(page);
  await position.click();
  await expect(list).toHaveCSS("width", "91px");
  await expect(list).toHaveCSS("height", "88px");
  await expect(list.getByRole("option")).toHaveText(["없음", "아래쪽", "위쪽"]);
  await position.press("Home");
  await position.press("Enter");
  await expect(position).toHaveText("없음⌄");
  await expect(page.getByRole("combobox", { name: "밑줄 모양", exact: true })).toBeDisabled();
  await expect(page.locator(".tiptap u")).toHaveAttribute("data-forhan-line-position", "TOP");
  await position.press("ArrowDown");
  await position.press("End");
  await position.press("ArrowUp");
  await position.press("Enter");
  await expect(position).toHaveText("아래쪽⌄");
  await expect(page.locator(".nd-character-sample u")).toHaveAttribute("data-forhan-line-position", "BOTTOM");
  await position.click();
  await position.press("Tab");
  await expect(list).toBeHidden();
  await expect(position).not.toBeFocused();
  await page.locator('[data-modal-value="apply"]').click();
  for (/** Both production native writers must retain the actual edited position and untouched shape/color. */ const format of ["hwp", "hwpx"] as const) {
    /** Independent binary and XML codecs read actual browser download bytes. */
    const bytes = await exportedLines(page, format),
      parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    for (/** Position edits must not flatten unrelated underline or strikeout properties. */ const mark of parsed.doc.content![0].content![0].marks!) {
      if (mark.type === "underline") expect(mark.attrs).toMatchObject({ nativePosition: "BOTTOM", nativePattern: 11, nativeColor: "#123456" });
      if (mark.type === "strike") expect(mark.attrs).toMatchObject({ nativePattern: 1, nativeColor: "#654321" });
    }
  }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap u")).toHaveAttribute("data-forhan-line-position", "TOP");
}
test("native underline positions preserve legacy values, measured popup geometry and cancelable keyboard edits", verifyUnderlinePositions);

/**
 * Verify a partial line edit preserves different source positions, sizes and other colors.
 *
 * Representative form values are not applied wholesale to mixed source marks.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after actual mixed-source serialization and undo.
 * @throws {Error} If an untouched line property is flattened to the first run.
 * @example
 * // A shared new underline color retains TOP and BOTTOM on the two source runs.
 */
async function verifyMixedLines({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadLines(page, true);
  await openLines(page);
  await page.getByRole("button", { name: "밑줄 색", exact: true }).click();
  await page
    .locator(
      '#native-color-palette .cp-theme-base [data-color-value="#3a3c84"]',
    )
    .click();
  await page
    .getByRole("combobox", { name: "취소선 모양", exact: true })
    .click();
  await page
    .getByRole("option", { name: "가는 선과 굵은 선과 가는 선", exact: true })
    .click();
  await page.locator('[data-modal-value="apply"]').click();
  /** Actual canonical serialization retains different properties for each source run. */
  const source = JSON.parse(
      (await exportedLines(page, "forhan")).toString("utf8"),
    ),
    runs = source.doc.content[0].content;
  for (/** Each independently styled run must retain its own untouched source properties. */ const [
    index,
    run,
  ] of runs.entries())
    for (/** Native line properties remain independent of foreground metrics and the other line. */ const mark of run.marks) {
      if (mark.type === "underline") {
        expect(mark.attrs.nativePosition).toBe(index ? "BOTTOM" : "TOP");
        expect(mark.attrs.nativePattern).toBe(index ? 7 : 11);
        expect(mark.attrs.nativeColor).toBe("#3a3c84");
      }
      if (mark.type === "strike") {
        expect(mark.attrs.nativePattern).toBe(10);
        expect(mark.attrs.nativeColor).toBe(index ? "#fedcba" : "#654321");
      }
      if (mark.type === "textStyle")
        expect(mark.attrs.fontSize).toBe(index ? "20pt" : "16pt");
    }
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap u").first()).toHaveAttribute(
    "data-forhan-line-color",
    "#123456",
  );
  await expect(page.locator(".tiptap u").last()).toHaveAttribute(
    "data-forhan-line-color",
    "#abcdef",
  );
  await openLines(page);
  await page.locator('[data-character-tab="basic"]').click();
  await page.locator('[name="underline"]').uncheck();
  await page.locator('[name="underline"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  for (let index = 0; index < 2; index++)
    await expect(page.locator(".tiptap u").nth(index)).toHaveAttribute(
      "data-forhan-line-color",
      "#000000",
    );
}
test(
  "mixed native line edits preserve independent positions, shapes, font sizes and colors",
  verifyMixedLines,
);

/**
 * Verify real external overline CSS and owned HTML round trips retain line semantics.
 *
 * The source starts with ordinary foreign longhand CSS and no native metadata.
 * @async
 * @param {{page:Page}} context - Owned browser bindings.
 * @returns {Promise<void>} Resolves after foreign import, real HTML export and reimport.
 * @throws {Error} If overline becomes underline or independent strike color disappears.
 * @example
 * // A red wavy overline stays above the original text after standalone HTML import.
 */
async function verifyLineHtml({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await page.locator("#file-input").setInputFiles({
    name: "foreign.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      '<p><span style="text-decoration-line:overline;text-decoration-style:wavy;text-decoration-color:#123456">A</span><span style="text-decoration-line:line-through;text-decoration-style:double;text-decoration-color:#654321">B</span></p>',
    ),
  });
  await expect(page.locator(".tiptap u")).toHaveCSS(
    "text-decoration-line",
    "overline",
  );
  await expect(page.locator(".tiptap s")).toHaveCSS(
    "text-decoration-style",
    "double",
  );
  /** Actual HTML output retains native metadata beside independent real drawing CSS. */
  const html = await exportedLines(page, "html");
  expect(html.toString()).toContain('data-forhan-line-position="TOP"');
  await page
    .locator("#file-input")
    .setInputFiles({ name: "owned.html", mimeType: "text/html", buffer: html });
  await expect(page.locator(".tiptap u")).toHaveCSS(
    "text-decoration-color",
    "rgb(18, 52, 86)",
  );
  await expect(page.locator(".tiptap s")).toHaveCSS(
    "text-decoration-color",
    "rgb(101, 67, 33)",
  );
  await expect(page.locator(".tiptap u")).toHaveAttribute(
    "data-forhan-line-pattern",
    "11",
  );
}
test(
  "external overline CSS and actual HTML exports preserve independent native line properties",
  verifyLineHtml,
);

/**
 * Count literal colored compound-line pixels in an actual editor screenshot.
 *
 * The controlled source foreground and shading have different colors, so
 * original RGB 58/60/132 pixels establish visible line drawing above shading.
 * No screenshot pixels or source DOM are changed during observation.
 * @async
 * @param {Page} page - Actual owned renderer page after selection collapse.
 * @returns {Promise<number>} Original screenshot pixels with the explicit line color.
 * @example
 * const visible = await visibleCompoundLineInk(page); // Opaque shading cannot hide the line.
 */
async function visibleCompoundLineInk(page: Page): Promise<number> {
  /** Actual visible paragraph coordinates exclude unrelated toolbar colors and sticky ruler overlap. */
  const clip = await page.evaluate(showOwnedParagraph),
    screenshot = await page.screenshot({ clip });
  return page.evaluate(countCapturedLineInk, screenshot.toString("base64"));
}

/**
 * Show the owned document's first paragraph at the ordinary top scroll position.
 *
 * A large editor-root locator screenshot scrolls text underneath the sticky
 * ruler. The measured real paragraph region avoids that capture artifact
 * without changing source content, drawing styles or original image pixels.
 * @returns {{x:number;y:number;width:number;height:number}} Actual visible paragraph rectangle.
 * @example
 * // The user-visible canvas scroll position is zero before literal pixel observation.
 */
function showOwnedParagraph(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  document.querySelector<HTMLElement>(".canvas")!.scrollTop = 0;
  /** Real source paragraph geometry is read after the owned viewport scrolls normally. */
  const rect = document.querySelector(".tiptap p")!.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * Read exact original line-color pixels from an unmodified captured PNG.
 *
 * Canvas performs one-to-one decoding only and never creates a replacement image.
 * @async
 * @param {string} base64 - Original complete editor PNG bytes.
 * @returns {Promise<number>} Literal original pixels of the controlled line color.
 * @example
 * // Only the line source uses opaque RGB 58/60/132 in this fixture.
 */
async function countCapturedLineInk(base64: string): Promise<number> {
  /** Decoded dimensions and color channels retain their original capture coordinates. */
  const image = new Image();
  image.src = "data:image/png;base64," + base64;
  await image.decode();
  /** One-to-one canvas reads the actual original raster without resampling or erasure. */
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  /** Original RGB values remain independent of declared source CSS. */
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  /** All literal original pixels contribute without a masking or alignment adjustment. */
  const data = context.getImageData(0, 0, image.width, image.height).data;
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4)
    if (
      data[offset] === 58 &&
      data[offset + 1] === 60 &&
      data[offset + 2] === 132
    )
      count++;
  return count;
}
