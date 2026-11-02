import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readFile as readOutput } from "node:fs/promises";
import type { JSONContent } from "@tiptap/core";
import type { NativeTableProperties } from "../src/table-properties.ts";
import {
  importSource,
  selectSource,
  savedSource,
} from "./helpers/format-painter.ts";

/** Independent original three-column observations supply source modes and physical distances. */
const originals = JSON.parse(
  readFileSync(
    new URL("./fixtures/native-table-properties.json", import.meta.url),
    "utf8",
  ),
) as {
  rows: {
    columns: number;
    properties: NativeTableProperties;
    geometry: { cellWidths: number[]; cellHeights: number[] };
  }[];
};

/**
 * Locate the actual saved table without assuming native anchor paragraphs.
 *
 * The production native readers determine its properties and content.
 * @param {JSONContent} doc - Actual saved production document.
 * @returns {JSONContent} Actual saved table.
 * @throws {Error} If no actual output table exists.
 * @example
 * tableSource(await savedSource(page)).attrs.nativeTableProperties;
 */
function tableSource(doc: JSONContent): JSONContent {
  for (/** Only real source tables can supply independent saved properties. */ const node of doc.content ??
    [])
    if (node.type === "table") return node;
  throw new Error("Actual saved table is absent.");
}

/**
 * Measure actual browser cell spacing separately from exact native metadata.
 *
 * Chromium quantizes table border spacing to whole layout pixels. The computed
 * CSS distance, computed spacing and measured physical gap remain separate observations.
 * @param {HTMLTableElement} table - Actual live rendered source table.
 * @returns {{gap:number;css:number;declared:number}} Actual gap, computed spacing and declared fractional source distance.
 * @example
 * // A 300-unit gap occupies four CSS pixels; a 37-unit gap is subpixel source data.
 */
function measureTableGap(table: HTMLTableElement): {
  gap: number;
  css: number;
  declared: number;
} {
  /** Visible cell positions establish the physical gap without replacing styles or paint. */
  const cells = table.querySelectorAll("td"),
    first = cells[0].getBoundingClientRect(),
    second = cells[1].getBoundingClientRect(),
    style = getComputedStyle(table),
    scale = table.getBoundingClientRect().width / parseFloat(style.width);
  return {
    gap: (second.left - first.right) / scale,
    css: parseFloat(style.borderSpacing),
    declared: parseFloat(table.style.borderSpacing),
  };
}

/**
 * Preserve independently observed table properties through ordinary editing and file operations.
 *
 * Physical browser cell gaps are measured before typing. Public native saves,
 * one-step undo and an unchanged exported HTML reimport verify source retention.
 * @async
 * @param {Page} page - Actual isolated application renderer.
 * @param {0|1|2} mode - Independently observed native page mode.
 * @returns {Promise<void>} Resolves after all physical and saved source assertions pass.
 * @throws {Error} If false flags, exact gaps or a native page mode change.
 * @example
 * await verifyTableProperties(page,0);
 */
async function verifyTableProperties(
  page: Page,
  mode: 0 | 1 | 2,
): Promise<void> {
  await page.goto("/");
  /** The literal original observation is independent from the production encoder and decoder. */
  const row = originals.rows.find(
    /**
     * Select one actual original three-column state with explicit false and nonzero fields.
     *
     * All mode expectations originate in original saved fields.
     * @param {{columns:number;properties:NativeTableProperties}} value - Independent original observation.
     * @returns {boolean} Whether it is the required original state.
     * @example
     * // Three source modes use the same independent physical gap.
     */
    (value) =>
      value.columns === 3 &&
      value.properties.pageBreak === mode &&
      !value.properties.repeatHeader &&
      value.properties.cellSpacing === 37,
  )!;
  expect(row).toBeTruthy();
  /** Fresh source cells retain actual independently measured widths and heights. */
  const cells: JSONContent[] = [];
  for (let column = 0; column < 3; column++)
    cells.push({
      type: "tableCell",
      attrs: {
        colspan: 1,
        rowspan: 1,
        colwidth: [row.geometry.cellWidths[column] / 75],
        nativeCellHeight: row.geometry.cellHeights[column],
      },
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: column === 0 ? "TABLE PAGE PROPERTIES" : "CELL " + column,
            },
          ],
        },
      ],
    });
  await importSource(page, "native-table-mode-" + mode + ".fhn", {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: {
          nativeTableProperties: row.properties,
          nativeTableFlags: (0x80000000 | mode) >>> 0,
        },
        content: [{ type: "tableRow", content: cells }],
      },
    ],
  });
  await expect(page.locator(".tiptap table")).toHaveCSS(
    "border-collapse",
    "separate",
  );
  await expect(page.locator(".tiptap table")).toHaveCSS(
    "break-inside",
    mode === 0 ? "avoid" : "auto",
  );
  await expect(page.locator(".tiptap tr")).toHaveCSS(
    "break-inside",
    mode === 1 ? "avoid" : "auto",
  );
  /** Real browser geometry is read without changing any table or cell style. */
  const gap = await page.locator(".tiptap table").evaluate(measureTableGap);
  expect(gap.declared).toBeCloseTo(37 / 75, 5);
  expect(gap.css).toBe(0);
  expect(gap.gap).toBeCloseTo(0, 1);
  /** Public FHN output establishes the independent real pre-edit undo baseline. */
  const before = await savedSource(page);
  await selectSource(page, ".tiptap td:first-child p", 21);
  await page.keyboard.insertText(" EDITED");
  for (/** Complete public output files expose actual production writer behavior. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const) {
    /** A native reader inspects the actual file rather than live editor state. */
    const table = tableSource(await savedSource(page, format));
    expect(table.attrs!.nativeTableProperties).toEqual(row.properties);
    expect(table.content![0].content![0].content![0].content![0].text).toBe(
      "TABLE PAGE PROPERTIES EDITED",
    );
    if (format !== "hwpx")
      expect(table.attrs!.nativeTableFlags).toBe((0x80000000 | mode) >>> 0);
  }
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
  /** The exact production HTML is reimported without modifying its metadata or physical widths. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="html"]').click();
  /** Actual exported bytes supply the entire next source document. */
  const download = await pending,
    bytes = await readOutput((await download.path())!);
  await page.locator("#file-input").setInputFiles({
    name: "native-table-properties.html",
    mimeType: "text/html",
    buffer: bytes,
  });
  await expect(page.locator("#toast")).toContainText(
    "native-table-properties.html",
  );
  /** Native data survives ordinary schema HTML parsing independently from computed browser CSS. */
  const restored = tableSource(await savedSource(page));
  expect(restored.attrs!.nativeTableProperties).toEqual(row.properties);
  expect(restored.attrs!.nativeTableFlags).toBe((0x80000000 | mode) >>> 0);
  restored.attrs!.nativeTableProperties = {
    ...row.properties,
    cellSpacing: 300,
  };
  await importSource(page, "native-visible-table-gap.fhn", {
    type: "doc",
    content: [restored],
  });
  /** A fully representable independent gap must change actual cell positions, not only metadata. */
  const visibleGap = await page
    .locator(".tiptap table")
    .evaluate(measureTableGap);
  expect(visibleGap.declared).toBe(4);
  expect(visibleGap.css).toBe(4);
  expect(visibleGap.gap).toBeCloseTo(4, 1);
}

for (/** Every distinct original mode is exercised through actual public UI and native files. */ const mode of [
  0, 1, 2,
] as const) {
  test(
    "native table page mode " +
      mode +
      " retains source flags, physical spacing, saved files, HTML and undo",
    /**
     * Execute one independent original page-mode regression.
     *
     * Each mode gets its own isolated real application document and public saves.
     * @async
     * @param {{page:Page}} context - Actual isolated application renderer.
     * @returns {Promise<void>} Resolves after the source mode and spacing survive ordinary operations.
     * @throws {Error} If physical or saved source properties change unexpectedly.
     * @example
     * // Native NONE, TABLE and CELL remain three separate source values.
     */
    async ({ page }) => {
      await verifyTableProperties(page, mode);
    },
  );
}
