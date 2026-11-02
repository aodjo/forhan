import { test, expect, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import { readFile } from "node:fs/promises";
import {
  importSource,
  selectSource,
  ribbonCopy,
  savedSource,
} from "./helpers/format-painter.ts";

import {
  SOURCE_PROPERTIES,
  TARGET_PROPERTIES,
  TARGET_MARGINS,
  NATIVE_CELL_COPY_ORACLE,
  observedCellProperties,
  cellDocument,
} from "./helpers/cell-format-copy.ts";

/**
 * Apply real native cell-only copying across documents without borrowing source table defaults.
 *
 * Actual UI controls, source serialization, native HWP/HWPX writers, physical
 * CSS and one-step history establish behavior independently from helper calls.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after native source properties and destination ownership are verified.
 * @throws {Error} If source defaults, dimensions, body appearance or history change unexpectedly.
 * @example
 * // Inherited source margins become inherited destination margins, rather than fixed source distances.
 */
async function verifyCellPropertyCopy({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await importSource(page, "native-cell-copy-source.fhn", cellDocument(true));
  await selectSource(page, ".tiptap th p", 1);
  await ribbonCopy(page);
  await expect(
    page.locator('[name="format-copy-cell-properties"]'),
  ).toBeEnabled();
  await page.locator('[name="format-copy-cell-properties"]').check();
  await page.locator('[name="format-copy-cell-background"]').uncheck();
  await page.locator('[name="format-copy-table-target"][value="cell"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await importSource(page, "native-cell-copy-target.fhn", cellDocument(false));
  /** The actual normalized destination supplies independent content, geometry and identity invariants. */
  const before = await savedSource(page),
    original = before.content![0].content![0].content![0];
  await selectSource(page, ".tiptap td p", 0, "대상 형식 유지 ABC".length);
  await ribbonCopy(page);
  /** Native title-cell ownership changes independently from original target body and fill. */
  const changed = await savedSource(page),
    table = changed.content![0],
    target = table.content![0].content![0];
  expect(target.type).toBe("tableHeader");
  expect(target.attrs).toEqual({
    ...original.attrs,
    nativeCellProperties: observedCellProperties(
      NATIVE_CELL_COPY_ORACLE.rows[0].after.cell,
    ),
  });
  expect(target.content).toEqual(original.content);
  expect(table.attrs).toEqual(before.content![0].attrs);
  await expect(page.locator(".tiptap th")).toHaveCSS("padding-left", "8px");
  expect(
    await page.locator(".tiptap th").evaluate(
      /**
       * Read the actual inherited physical padding independently from its source metadata.
       *
       * Browser CSS serialization can round decimals without changing native physical units.
       * @param {HTMLElement} cell - Actual rendered destination cell.
       * @returns {number} Real unzoomed computed top padding in CSS pixels.
       * @example
       * // A destination 800-unit table default becomes 10.6667 CSS pixels.
       */
      (cell) => parseFloat(getComputedStyle(cell).paddingTop),
    ),
  ).toBeCloseTo(800 / 75, 1);
  await expect(page.locator(".tiptap th")).toHaveCSS(
    "writing-mode",
    "vertical-rl",
  );
  await expect(page.locator(".tiptap th")).toHaveCSS(
    "text-orientation",
    "upright",
  );
  await expect(page.locator(".tiptap th")).toHaveCSS(
    "vertical-align",
    "bottom",
  );
  await expect(page.locator(".tiptap th")).toHaveCSS(
    "background-color",
    "rgb(17, 34, 51)",
  );
  await expect(page.locator(".tiptap th p")).toHaveCSS("font-weight", "400");
  for (/** Actual native output must retain the same copied properties, title flag and target table defaults. */ const format of [
    "hwpx",
    "hwp",
  ] as const) {
    /** Independent production readers inspect actual complete native output bytes. */
    const output = await savedSource(page, format),
      nativeTable = output.content!.find(
        /**
         * Locate the actual native table independently from surrounding control-anchor paragraphs.
         *
         * The output's cell ownership comes from the native reader rather than a substituted expected tree.
         * @param {JSONContent} node - Actual parsed source block.
         * @returns {boolean} Whether this is the native table.
         * @example
         * // Native output retains one actual destination table.
         */
        (node) => node.type === "table",
      )!;
    expect(nativeTable.attrs!.nativeCellMargins).toEqual(TARGET_MARGINS);
    expect(
      nativeTable.content![0].content![0].attrs!.nativeCellProperties,
    ).toEqual(SOURCE_PROPERTIES);
    expect(nativeTable.content![0].content![0].type).toBe("tableHeader");
  }
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await savedSource(page)).toEqual(changed);
}
test(
  "native cell-only copying retains destination table defaults, body, fill and geometry across native saves",
  verifyCellPropertyCopy,
);

/**
 * Apply explicit native cell overrides to an actual rectangular cell selection.
 *
 * Real pointer dragging constructs the table plugin's CellSelection. A protected
 * destination becomes unprotected as observed in the original, while an adjacent
 * unselected cell, each selected fill and every source body remain unchanged.
 * @async
 * @param {{page:Page}} context - Actual production renderer.
 * @returns {Promise<void>} Resolves after exact native scope, physical zero padding and one-step undo agree.
 * @throws {Error} If selection scope, destination ownership or source body is changed incorrectly.
 * @example
 * // Source-owned zero top padding replaces only two genuinely selected destination cells.
 */
async function verifyExplicitCellSelection({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** The explicit original source differs only in its independently observed native margin override flag. */
  const source = cellDocument(true),
    properties = observedCellProperties(
      NATIVE_CELL_COPY_ORACLE.rows[1].source.cell,
    );
  source.content![0].content![0].content![0].attrs!.nativeCellProperties =
    properties;
  await importSource(page, "explicit-cell-copy-source.fhn", source);
  await selectSource(page, ".tiptap th p", 1);
  await ribbonCopy(page);
  await page.locator('[name="format-copy-cell-properties"]').check();
  await page.locator('[name="format-copy-table-target"][value="cell"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  /** Three genuine destination cells distinguish selected scope from the untouched adjacent original cell. */
  const target = cellDocument(false),
    row = target.content![0].content![0],
    cells = [];
  for (let index = 0; index < 3; index++) {
    /** Every destination has independent source identity, width and body text. */
    const cell = structuredClone(row.content![0]);
    cell.attrs!.nativeCellProperties = {
      ...TARGET_PROPERTIES,
      protected: index === 0,
    };
    cell.attrs!.sourceId = "target-cell-" + index;
    cell.attrs!.colwidth = [100 + index * 20];
    cell.content![0].content![0].text = ["대상1", "대상2", "유지3"][index];
    cells.push(cell);
  }
  row.content = cells;
  await importSource(page, "explicit-cell-copy-target.fhn", target);
  /** Actual source serialization supplies complete destination and unselected-cell invariants. */
  const before = await savedSource(page),
    first = await page.locator(".tiptap td").nth(0).boundingBox(),
    second = await page.locator(".tiptap td").nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  await page.mouse.move(first!.x + 10, first!.y + 10);
  await page.mouse.down();
  await page.mouse.move(second!.x + 10, second!.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".tiptap .selectedCell")).toHaveCount(2);
  await ribbonCopy(page);
  /** Each original destination cell receives exactly the copied properties and native title flag. */
  const changed = await savedSource(page),
    actual = changed.content![0].content![0].content!;
  for (let index = 0; index < 2; index++) {
    expect(actual[index].type).toBe("tableHeader");
    expect(actual[index].attrs).toEqual({
      ...before.content![0].content![0].content![index].attrs,
      nativeCellProperties: observedCellProperties(
        NATIVE_CELL_COPY_ORACLE.rows[2].after.cell,
      ),
    });
    expect(actual[index].content).toEqual(
      before.content![0].content![0].content![index].content,
    );
  }
  expect(actual[2]).toEqual(before.content![0].content![0].content![2]);
  await expect(page.locator(".tiptap th").first()).toHaveCSS(
    "padding-top",
    "0px",
  );
  await page.locator(".tiptap").focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await savedSource(page)).toEqual(before);
}
test(
  "native cell property copying matches explicit margins and protection for a real rectangular selection",
  verifyExplicitCellSelection,
);

/**
 * Preserve complete native cell metadata through actual HTML export and reimport.
 *
 * Native flags, table defaults and cell overrides are restored from genuine
 * production HTML rather than inferred from already resolved browser padding.
 * @async
 * @param {{page:Page}} context - Actual production renderer.
 * @returns {Promise<void>} Resolves after native source fields and physical modes survive HTML interchange.
 * @throws {Error} If native source fields are flattened or discarded by HTML serialization.
 * @example
 * // A no-fill title cell retains inherited table margins and unrelated original HWP flag bits.
 */
async function verifyNativeCellHtml({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** The actual source includes an independently retained native flag bit outside represented appearance. */
  const source = cellDocument(true);
  source.content![0].content![0].content![0].attrs!.nativeCellFlags = 0x04000000;
  source.content![0].content![0].content![0].attrs!.backgroundColor = '';
  await importSource(page, "native-cell-html-source.fhn", source);
  await expect(page.locator('.tiptap th')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  /** Real browser output bytes come from the ordinary public HTML export action. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator('[data-export="html"]').click();
  /** This exact produced HTML is reimported without replacing its metadata or source content. */
  const download = await pending,
    bytes = await readFile((await download.path())!);
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "native-cell-html-reimport.html",
      mimeType: "text/html",
      buffer: bytes,
    });
  await expect(page.locator("#toast")).toContainText(
    "native-cell-html-reimport.html",
  );
  /** Actual imported source attributes establish round-trip behavior independently from computed drawing CSS. */
  const result = await savedSource(page),
    table = result.content!.find(
      /**
       * Locate the actual HTML-imported table after production parsing.
       *
       * No serialized document or native source attributes are substituted by the test.
       * @param {JSONContent} node - Actual imported source block.
       * @returns {boolean} Whether this is the actual original table.
       * @example
       * // The actual public HTML importer restores native table ownership.
       */
      (node) => node.type === "table",
    )!,
    cell = table.content![0].content![0];
  expect(table.attrs!.nativeCellMargins).toEqual(
    source.content![0].attrs!.nativeCellMargins,
  );
  expect(cell.type).toBe("tableHeader");
  expect(cell.attrs!.nativeCellProperties).toEqual(SOURCE_PROPERTIES);
  expect(cell.attrs!.nativeCellFlags).toBe(0x04000000);
  await expect(page.locator(".tiptap th")).toHaveCSS(
    "writing-mode",
    "vertical-rl",
  );
}
test(
  "native cell metadata and inherited physical margins survive real HTML export and reimport",
  verifyNativeCellHtml,
);

/**
 * Reject a protected original copy source without replacing prior accepted cell appearance.
 *
 * The installed original rejected the same cell-property source. A rejected
 * source cannot clear the accepted snapshot belonging to the current app lifetime.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after protected-source rejection and prior cache retention are verified.
 * @throws {Error} If protected source appearance is accepted or prior accepted source is lost.
 * @example
 * // A failed protected-source copy leaves the earlier valid source available in a later document.
 */
async function verifyProtectedCopySource({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  await importSource(page, "unprotected-copy-source.fhn", cellDocument(true));
  await selectSource(page, ".tiptap th p", 1);
  await ribbonCopy(page);
  await page.locator('[name="format-copy-cell-properties"]').check();
  await page.locator('[name="format-copy-table-target"][value="cell"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  /** Protected original metadata is distinct from the already accepted valid source. */
  const protectedSource = cellDocument(true);
  expect(NATIVE_CELL_COPY_ORACLE.protectedSource.sourceCopyAccepted).toBe(
    false,
  );
  protectedSource.content![0].content![0].content![0].attrs!.nativeCellProperties =
    {
      ...SOURCE_PROPERTIES,
      protected: true,
      margins: { left: 9, right: 8, top: 7, bottom: 6 },
    };
  await importSource(page, "protected-copy-source.fhn", protectedSource);
  await selectSource(page, ".tiptap th p", 1);
  await ribbonCopy(page);
  await expect(page.locator(".native-dialog-format-painter")).toHaveCount(0);
  await importSource(
    page,
    "protected-rejection-target.fhn",
    cellDocument(false),
  );
  await selectSource(page, ".tiptap td p", 0, "대상 형식 유지 ABC".length);
  await ribbonCopy(page);
  /** The later original target receives the earlier accepted source, never the rejected protected source. */
  const output = await savedSource(page);
  expect(
    output.content![0].content![0].content![0].attrs!.nativeCellProperties,
  ).toEqual(SOURCE_PROPERTIES);
}
test(
  "native cell copying rejects a protected source while preserving earlier accepted app appearance",
  verifyProtectedCopySource,
);
