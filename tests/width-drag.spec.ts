import {DOCUMENT_START_KEY} from './helpers/native-keyboard.ts';
import { test, expect, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import { readFile } from "node:fs/promises";
import { characterMetrics } from "../src/character-metrics.ts";

/**
 * Create original source text with independently retained native horizontal measurements.
 *
 * Fixtures contain only model source, never drawing wrappers, measured pointer
 * positions or a substituted editor selection.
 * @param {string} text - Original authored paragraph text.
 * @param {number} [ratio=75] - Original seven-language width percentage.
 * @param {number} [tracking=20] - Original signed tracking percentage.
 * @returns {JSONContent} One editable original source paragraph.
 * @example
 * dragParagraph('ABC עברית 123 한글'); // Native width remains real source formatting.
 */
function dragParagraph(text: string, ratio = 75, tracking = 20): JSONContent {
  /** All language slots remain exact source data during pointer-only operations. */
  const metrics = characterMetrics(null);
  metrics.ratio.fill(ratio);
  metrics.spacing.fill(tracking);
  return {
    type: "paragraph",
    attrs: { textAlign: "left", lineHeight: "1.6" },
    content: [
      {
        type: "text",
        text,
        marks: [
          {
            type: "textStyle",
            attrs: {
              fontFamily: "Arial",
              fontSize: "32pt",
              nativeCharacterMetrics: metrics,
            },
          },
        ],
      },
    ],
  };
}

/**
 * Observe actual fonts and rendering frames without a fixed timeout.
 *
 * The browser executes this helper in the real source document so pointer
 * coordinates describe the current native advance and line-layout corrections.
 * @async
 * @param {number} count - Number of actual source rendering frames to observe.
 * @returns {Promise<void>} Resolves after those browser frames and font readiness.
 * @example
 * await page.evaluate(dragFrames,2); // Source geometry is ready to inspect.
 */
async function dragFrames(count: number): Promise<void> {
  await document.fonts.ready;
  for (let index = 0; index < count; index++)
    await new Promise<void>(
      /**
       * Wait for one actual source rendering frame.
       *
       * Browser timestamps are deliberately excluded from the completion value.
       * @param {()=>void} resolve - Completion callback for the owned frame wait.
       * @returns {void} Schedules one real browser-frame observation.
       * @example
       * // Pending native geometry work is observed rather than hidden with a sleep.
       */
      (resolve) =>
        requestAnimationFrame(
          /**
           * Finish this owned source-frame observation.
           *
           * The callback never changes source content or editor selection.
           * @returns {void} Resolves the current browser-frame wait.
           * @example
           * // The next pointer measurement sees the current DOM geometry.
           */
          () => resolve(),
        ),
    );
}

/**
 * Open complete original source through the production document input.
 *
 * Unique names distinguish asynchronous replacement from preceding source.
 * Actual fonts and drawing frames settle before physical pointer coordinates
 * are observed; no selection or source content is injected through test hooks.
 * @async
 * @param {Page} page - Actual owned application renderer.
 * @param {string} name - Unique local fixture name.
 * @param {JSONContent[]} blocks - Original source paragraphs or tables.
 * @returns {Promise<void>} Resolves after real source replacement and rendering.
 * @example
 * await openDrag(page,'mixed.forhan',[dragParagraph('ABC עברית')]);
 */
async function openDrag(
  page: Page,
  name: string,
  blocks: JSONContent[],
): Promise<void> {
  await page.locator("#file-input").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        title: name,
        doc: { type: "doc", content: blocks },
      }),
    ),
  });
  await expect(page.locator("#toast")).toContainText(name);
  await page.evaluate(dragFrames, 2);
}

/**
 * Read actual production source serialization after pointer and typing operations.
 *
 * Complete downloaded bytes prove what was edited independently of painted SVG,
 * browser selection highlights or rendering-only geometry metadata.
 * @async
 * @param {Page} page - Actual owned application renderer.
 * @returns {Promise<JSONContent>} Complete genuine saved source document.
 * @example
 * const doc=await saveDrag(page); // Contains the actual edited original model.
 */
async function saveDrag(page: Page): Promise<JSONContent> {
  /** The real file download is observed before triggering production serialization. */
  const pending = page.waitForEvent("download");
  await page.locator("#save-document").click();
  /** Actual serializer output remains separate from the expected fixture source. */
  const download = await pending;
  return JSON.parse((await readFile((await download.path())!)).toString("utf8"))
    .doc;
}

/**
 * Join original saved text without counting source-container structure or drawings.
 *
 * Script normalization may split source marks. Only genuine model text nodes
 * contribute to a paragraph or table cell's authored text.
 * @param {JSONContent} node - Actual serialized source node.
 * @returns {string} Original authored text in logical document order.
 * @example
 * dragText(doc.content[0]); // One original paragraph's text, without auxiliary SVG.
 */
function dragText(node: JSONContent): string {
  let text = node.text || "";
  for (
    /** Actual source children remain ordered independently of bidi visual positions. */
    const child of node.content ||
    [])
    text += dragText(child);
  return text;
}

/**
 * Observe a real source glyph edge in physical viewport coordinates.
 *
 * The returned point includes actual paper zoom and native advance correction.
 * Pointer input uses the observed physical position without changing the model.
 * @async
 * @param {Page} page - Actual owned renderer.
 * @param {number} paragraph - Original paragraph index.
 * @param {string} text - Unique original source glyph or complete grapheme.
 * @param {'left'|'right'} edge - Physical source edge to approach.
 * @returns {Promise<{x:number;y:number}>} Physical viewport point inside the original source glyph.
 * @example
 * await dragPoint(page,0,'ע','right'); // The Hebrew word's logical start edge.
 */
async function dragPoint(
  page: Page,
  paragraph: number,
  text: string,
  edge: "left" | "right",
): Promise<{ x: number; y: number }> {
  /** Real source wrappers remain distinct from the inaccessible glyph drawing layer. */
  const glyph = page
    .locator(".tiptap p")
    .nth(paragraph)
    .locator("forhan-width")
    .filter({ hasText: text })
    .first();
  await expect(glyph).toBeVisible();
  /** Actual source attachment precedes the physical pointer-coordinate observation. */
  const box = (await glyph.boundingBox())!;
  return {
    x: edge === "left" ? box.x + 1 : box.x + box.width - 1,
    y: box.y + box.height / 2,
  };
}

/**
 * Exercise actual mouse movement while retaining the physical source endpoints.
 *
 * The gesture never calls editor selection commands or DOM selection setters.
 * Intermediate pointer steps allow actual native drawing frames to run.
 * @async
 * @param {Page} page - Actual owned renderer.
 * @param {{x:number;y:number}} from - Physical original source anchor.
 * @param {{x:number;y:number}} to - Physical original source destination.
 * @returns {Promise<void>} Resolves after the real pointer release.
 * @example
 * await sourceDrag(page,first,last); // Actual RTL or reversed dragging.
 */
async function sourceDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Verify reversed, partial, mixed-run and grapheme-safe source text dragging.
 *
 * Actual typed replacement and source undo establish the selected logical range
 * independently of browser bidi caret guesses or visual selection paint.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after all physical source gestures retain exact editing scope.
 * @example
 * // Backward dragging across ברי replaces those source letters and leaves ע and ת intact.
 */
async function verifyDragDirections({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Each expected source range is independent of the native pointer implementation. */
  const cases = [
    {
      name: "reverse",
      text: "ABC עברית 123 한글",
      from: "ת",
      fromEdge: "left",
      to: "ע",
      toEdge: "right",
      expected: "ABC Q 123 한글",
    },
    {
      name: "partial",
      text: "ABC עברית 456 한글",
      from: "י",
      fromEdge: "left",
      to: "ב",
      toEdge: "right",
      expected: "ABC עQת 456 한글",
    },
    {
      name: "mixed",
      text: "ABC עברית 789 한글",
      from: "B",
      fromEdge: "left",
      to: "ר",
      toEdge: "left",
      expected: "AQית 789 한글",
    },
    {
      name: "graphemes",
      text: "A é 👩‍💻 B",
      from: "é",
      fromEdge: "left",
      to: "👩‍💻",
      toEdge: "right",
      expected: "A Q B",
    },
  ] as const;
  for (
    /** Unique real documents preserve independent physical gesture and source expectations. */
    const item of cases
  ) {
    await openDrag(page, item.name + ".forhan", [dragParagraph(item.text)]);
    /** Actual endpoint source boxes include real paper zoom and current native width. */
    const from = await dragPoint(page, 0, item.from, item.fromEdge),
      to = await dragPoint(page, 0, item.to, item.toEdge);
    await sourceDrag(page, from, to);
    await page.keyboard.type("Q");
    expect(dragText(await saveDrag(page))).toBe(item.expected);
    await page.locator(".tiptap").press("ControlOrMeta+z");
    expect(dragText(await saveDrag(page))).toBe(item.text);
  }
  await openDrag(page, "cross-paragraph.forhan", [
    dragParagraph("ABC plain", 100, 0),
    dragParagraph("עברית 123 한글"),
  ]);
  /** An unscaled source paragraph can anchor a drag into another paragraph with native width. */
  const plain = (await page.locator(".tiptap p").first().boundingBox())!,
    end = await dragPoint(page, 1, "ת", "left");
  await sourceDrag(
    page,
    { x: plain.x + 1, y: plain.y + plain.height / 3 },
    end,
  );
  await page.keyboard.type("Q");
  /** Cross-block replacement joins genuine source paragraphs without duplicated drawing text. */
  const crossed = await saveDrag(page);
  expect(crossed.content).toHaveLength(1);
  expect(dragText(crossed)).toBe("Q 123 한글");
  await openDrag(page, "empty-destination.forhan", [
    dragParagraph("ABC עברית"),
    { type: "paragraph" },
    dragParagraph("남은 문단"),
  ]);
  /** A real empty source block remains a valid cross-paragraph drag destination. */
  const start = await dragPoint(page, 0, "A", "left"),
    empty = (await page.locator(".tiptap p").nth(1).boundingBox())!;
  await sourceDrag(page, start, {
    x: empty.x + 4,
    y: empty.y + empty.height / 2,
  });
  await page.keyboard.type("Q");
  expect((await saveDrag(page)).content!.map(dragText)).toEqual([
    "Q",
    "남은 문단",
  ]);
  await openDrag(page, "shift-drag.forhan", [
    dragParagraph("ABC עברית 123 한글"),
  ]);
  /** A genuine Shift gesture extends the original clicked source anchor. */
  const anchor = await dragPoint(page, 0, "B", "left"),
    shiftStart = await dragPoint(page, 0, "ע", "right"),
    shiftEnd = await dragPoint(page, 0, "ר", "left");
  await page.mouse.click(anchor.x, anchor.y);
  await page.keyboard.down("Shift");
  await sourceDrag(page, shiftStart, shiftEnd);
  await page.keyboard.up("Shift");
  await page.keyboard.type("Q");
  expect(dragText(await saveDrag(page))).toBe("AQית 123 한글");
  /** Unicode graphemes can cross original formatting marks without becoming separate pointer characters. */
  const styled = dragParagraph("A "),
    marks = styled.content![0].marks!,
    base = marks[0].attrs!;
  styled.content = [
    { type: "text", text: "A ", marks },
    {
      type: "text",
      text: "e",
      marks: [{ type: "textStyle", attrs: { ...base, color: "#123456" } }],
    },
    {
      type: "text",
      text: "́",
      marks: [{ type: "textStyle", attrs: { ...base, color: "#663322" } }],
    },
    { type: "text", text: " B", marks },
  ];
  await openDrag(page, "cross-mark-grapheme.forhan", [styled]);
  /** Pointer endpoints approach only the visible base while the original accent remains a separate marked source node. */
  const graphemeStart = await dragPoint(page, 0, "e", "left"),
    graphemeEnd = await dragPoint(page, 0, "e", "right");
  await sourceDrag(page, graphemeStart, graphemeEnd);
  await page.keyboard.type("Q");
  expect(dragText(await saveDrag(page))).toBe("A Q B");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  /** Clicking within the restored selected grapheme must still place a whole-grapheme caret. */
  const markedEnd = await dragPoint(page, 0, "e", "right");
  await page.mouse.click(markedEnd.x, markedEnd.y);
  await page.keyboard.type("Q");
  expect(dragText(await saveDrag(page))).toBe("A éQ B");
}

test(
  "native-width source dragging preserves reversed, mixed-run, cross-block and grapheme boundaries",
  verifyDragDirections,
);

/**
 * Verify actual source scrolling during a captured text gesture and stopping on release.
 *
 * The final physical endpoint is observed after scrolling settles. Exact saved
 * paragraphs prove that viewport movement neither substitutes browser hit tests
 * nor adds layout edits to the original source undo history.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after actual scrolling, release and source replacement agree.
 * @example
 * // Holding below the canvas selects later real source paragraphs and releases cleanly.
 */
async function verifyDragScrolling({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Original source has enough physical line progress for real owned-canvas scrolling. */
  const texts: string[] = [],
    blocks: JSONContent[] = [];
  for (let index = 0; index < 24; index++) {
    texts.push(`줄 ${index} ABC עברית 끝`);
    blocks.push(dragParagraph(texts[index]));
  }
  await openDrag(page, "drag-scroll.forhan", blocks);
  /** Captured source begins at the first original paragraph, not a drawing widget. */
  const first = await dragPoint(page, 0, "줄", "left"),
    canvas = (await page.locator(".canvas").boundingBox())!;
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x, canvas.y + canvas.height + 40, { steps: 8 });
  await expect
    .poll(
      /**
       * Read real source-canvas scrolling while the original mouse remains held.
       *
       * Selection code cannot substitute an expected scroll value in this observation.
       * @async
       * @returns {Promise<number>} Actual current source scroll offset.
       * @example
       * // A held off-canvas pointer advances the real document viewport.
       */
      async () =>
        page.locator(".canvas").evaluate(
          /**
           * Observe the actual owned canvas scroll position.
           *
           * The measurement does not change layout or model source.
           * @param {HTMLElement} element - Real source canvas.
           * @returns {number} Actual physical scroll-container offset.
           * @example
           * // The value increases only after real automatic scrolling.
           */
          (element) => element.scrollTop,
        ),
    )
    .toBeGreaterThan(150);
  await page.mouse.move(first.x, canvas.y + canvas.height / 2, { steps: 3 });
  await page.evaluate(dragFrames, 2);
  /** A currently visible original paragraph supplies the final actual source destination. */
  const destination = await page.locator(".tiptap").evaluate(
    /**
     * Locate the final complete visible source paragraph without altering its source.
     *
     * Its last original width wrapper supplies actual physical pointer coordinates.
     * @param {HTMLElement} root - Actual editable source root after scrolling.
     * @returns {{index:number;x:number;y:number}} Visible source paragraph index and final glyph edge.
     * @example
     * // The endpoint follows real scrolling rather than a preset source position.
     */
    (root) => {
      /** Real canvas bounds distinguish visible source from offscreen document content. */
      const canvas = root.closest(".canvas")!.getBoundingClientRect(),
        paragraphs = Array.from(root.querySelectorAll("p"));
      let result = { index: -1, x: 0, y: 0 };
      for (let index = 0; index < paragraphs.length; index++) {
        /** Only fully visible source glyphs can supply the observed physical destination. */
        const glyph =
          paragraphs[index].querySelector("forhan-width:last-of-type") ||
          paragraphs[index].querySelector("forhan-width");
        if (!glyph) continue;
        /** Source order is independent of the paragraph's auxiliary SVG drawing text. */
        const wrappers = paragraphs[index].querySelectorAll("forhan-width"),
          box = wrappers[wrappers.length - 1].getBoundingClientRect();
        if (box.top > canvas.top + 30 && box.bottom < canvas.bottom - 30)
          result = { index, x: box.right - 1, y: box.top + box.height / 2 };
      }
      return result;
    },
  );
  expect(destination.index).toBeGreaterThan(1);
  await page.mouse.move(destination.x, destination.y, { steps: 4 });
  await page.mouse.up();
  /** Actual scrolling must stop on real pointer release, even when native drawing continues. */
  const stopped = await page.locator(".canvas").evaluate(
    /**
     * Read the owned source canvas after its captured pointer is released.
     *
     * This value remains independent of subsequent rendering-only source frames.
     * @param {HTMLElement} canvas - Actual owned source viewport.
     * @returns {number} Real scroll offset after release.
     * @example
     * // A released drag has no remaining auto-scroll owner.
     */
    (canvas) => canvas.scrollTop,
  );
  await page.evaluate(dragFrames, 6);
  expect(
    await page.locator(".canvas").evaluate(
      /**
       * Reobserve the actual source viewport after several real rendering frames.
       *
       * No timer or expected value replaces the original browser scroll offset.
       * @param {HTMLElement} canvas - Actual source canvas.
       * @returns {number} Real current scroll offset.
       * @example
       * // Stale gesture frames cannot keep moving the source after release.
       */
      (canvas) => canvas.scrollTop,
    ),
  ).toBe(stopped);
  await page.keyboard.type("Z");
  /** Production source bytes establish the exact cross-paragraph replacement scope. */
  const edited = await saveDrag(page);
  expect(edited.content!.map(dragText)).toEqual([
    "Z",
    ...texts.slice(destination.index + 1),
  ]);
  await page.locator(".tiptap").press("ControlOrMeta+z");
  expect((await saveDrag(page)).content!.map(dragText)).toEqual(texts);
}

test(
  "captured native-width dragging scrolls real source and stops cleanly on release",
  verifyDragScrolling,
);

/**
 * Read the actual source viewport scroll position without changing layout.
 *
 * Cancellation checks compare observed browser offsets across real frames,
 * independently of the private gesture controller's state or timers.
 * @param {HTMLElement} canvas - Actual owned source canvas.
 * @returns {number} Real current source scroll offset.
 * @example
 * await page.locator('.canvas').evaluate(dragScrollOffset); // Actual source scrolling.
 */
function dragScrollOffset(canvas: HTMLElement): number {
  return canvas.scrollTop;
}

/**
 * Release stale pointer ownership on Escape and original-document replacement.
 *
 * The original mouse remains held while the source changes, exposing callbacks
 * that accidentally reuse old model positions or continue scrolling a new file.
 * @async
 * @param {{page:Page}} context - Actual owned source renderer.
 * @returns {Promise<void>} Resolves after real cancellation and replacement preserve source ownership.
 * @example
 * // A released old drag cannot edit or scroll a newly opened source document.
 */
async function verifyDragCancellation({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** Native source has enough physical height to expose stale automatic scrolling. */
  const blocks: JSONContent[] = [],
    errors: string[] = [];
  for (let index = 0; index < 20; index++)
    blocks.push(dragParagraph(`줄 ${index} ABC עברית 끝`));
  page.on(
    "pageerror",
    /**
     * Retain actual renderer errors during document replacement and pointer release.
     *
     * Invalid old model positions must not become silent background exceptions.
     * @param {Error} error - Original browser renderer exception.
     * @returns {void} Records the exact unexpected renderer error.
     * @example
     * // Replacing source during a held gesture must produce no range errors.
     */
    (error) => {
      errors.push(error.message);
    },
  );
  await openDrag(page, "cancel-drag.forhan", blocks);
  /** Real capture starts on original source and reaches outside the actual canvas. */
  const first = await dragPoint(page, 0, "줄", "left"),
    canvas = (await page.locator(".canvas").boundingBox())!;
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(first.x, canvas.y + canvas.height + 35, { steps: 5 });
  await expect
    .poll(
      /**
       * Observe real automatic source scrolling before explicit cancellation.
       *
       * No expected scroll offset is assigned to the application.
       * @async
       * @returns {Promise<number>} Actual current source canvas offset.
       * @example
       * // The held pointer owns real source scrolling before Escape.
       */
      async () => page.locator(".canvas").evaluate(dragScrollOffset),
    )
    .toBeGreaterThan(80);
  await page.keyboard.press("Escape");
  /** Escape must release the active pointer's automatic source scrolling. */
  const stopped = await page.locator(".canvas").evaluate(dragScrollOffset);
  await page.mouse.move(first.x + 10, canvas.y + canvas.height + 40);
  await page.evaluate(dragFrames, 6);
  expect(await page.locator(".canvas").evaluate(dragScrollOffset)).toBe(
    stopped,
  );
  await page.mouse.up();
  expect((await saveDrag(page)).content!.map(dragText)).toEqual(
    blocks.map(dragText),
  );
  await openDrag(page, "replace-held-drag.forhan", [
    dragParagraph("ABC עברית 123 한글"),
    dragParagraph("두 번째 원문"),
  ]);
  /** Replacement occurs while the original mouse pointer is still physically held. */
  const from = await dragPoint(page, 0, "ע", "right"),
    to = await dragPoint(page, 0, "ת", "left");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await openDrag(page, "replacement-source.forhan", [
    dragParagraph("새 문서 원문"),
  ]);
  await page.mouse.move(1300, 850, { steps: 4 });
  await page.mouse.up();
  await page.locator(".tiptap").press(DOCUMENT_START_KEY);
  await page.keyboard.type("R");
  expect(dragText(await saveDrag(page))).toBe("R새 문서 원문");
  expect(errors).toEqual([]);
}

test(
  "native-width drag cancellation and document replacement release old source ownership",
  verifyDragCancellation,
);

/**
 * Preserve source word/block drag granularity and existing rectangular cell selection.
 *
 * Trusted mouse click counts select original words and paragraphs. Text dragging
 * within a table cell uses source positions, while actual cell-background drags
 * retain the editor's independent rectangular table selection path.
 * @async
 * @param {{page:Page}} context - Actual owned renderer bindings.
 * @returns {Promise<void>} Resolves after semantic source replacement and table selections agree.
 * @example
 * // Double-click dragging retains whole words, and cell-background dragging still selects cells.
 */
async function verifyDragGranularity({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await openDrag(page, "word-drag.forhan", [
    dragParagraph("ABC עברית 123 한글 END"),
  ]);
  /** Real double-click-and-hold input chooses complete original word intervals. */
  const first = await dragPoint(page, 0, "ע", "right"),
    last = await dragPoint(page, 0, "D", "right");
  await page.mouse.click(first.x, first.y);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down({ clickCount: 2 });
  await page.mouse.move(last.x, last.y, { steps: 8 });
  await page.mouse.up({ clickCount: 2 });
  await page.keyboard.type("Q");
  expect(dragText(await saveDrag(page))).toBe("ABC Q");
  await openDrag(page, "paragraph-drag.forhan", [
    dragParagraph("ABC עברית"),
    dragParagraph("다음 문단 Z"),
  ]);
  /** Browser triple-click metadata selects complete original source blocks across a real drag. */
  const begin = await dragPoint(page, 0, "A", "left"),
    end = await dragPoint(page, 1, "Z", "right");
  await page.mouse.move(begin.x, begin.y);
  await page.mouse.down({ clickCount: 3 });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up({ clickCount: 3 });
  await page.keyboard.type("Q");
  expect((await saveDrag(page)).content!.map(dragText)).toEqual(["Q"]);
  /** Source table cells contain real native-width text and independent paragraph structure. */
  const rows: JSONContent[] = [];
  for (let row = 0; row < 2; row++) {
    /** Real table background remains outside the native-width source glyph rectangles. */
    const cells: JSONContent[] = [];
    for (let column = 0; column < 2; column++)
      cells.push({ type: "tableCell", content: [dragParagraph("AB")] });
    rows.push({ type: "tableRow", content: cells });
  }
  await openDrag(page, "native-width-cells.forhan", [
    { type: "table", content: rows },
  ]);
  /** Actual first/last cell coordinates exercise the independent rectangular selection path. */
  const a = (await page.locator(".tiptap td").first().boundingBox())!,
    b = (await page.locator(".tiptap td").last().boundingBox())!;
  await sourceDrag(
    page,
    { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
  );
  await expect(page.locator(".tiptap td.selectedCell")).toHaveCount(4);
  await expect(page.locator('.tiptap td svg text[fill="#ffffff"]')).toHaveCount(
    0,
  );
  await page.locator(".tiptap").press("Escape");
  await openDrag(page, "native-width-table-text.forhan", [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [dragParagraph("ABC עברית 123")] },
            { type: "tableCell", content: [dragParagraph("다른 칸")] },
          ],
        },
      ],
    },
  ]);
  /** Text gestures inside one actual cell remain character selections rather than cell selections. */
  const left = await dragPoint(page, 0, "ע", "right"),
    right = await dragPoint(page, 0, "ת", "left");
  await sourceDrag(page, left, right);
  await page.keyboard.type("Q");
  /** Genuine source cells retain their structure and independently authored neighboring text. */
  const saved = await saveDrag(page),
    cells = saved.content![0].content![0].content!;
  expect(cells.map(dragText)).toEqual(["ABC Q 123", "다른 칸"]);
}

test(
  "native-width word and paragraph drags preserve table text and rectangular cell selection",
  verifyDragGranularity,
);
