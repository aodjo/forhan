import { test, expect, type Page } from "@playwright/test";
import {
  importSource,
  selectSource,
  ribbonCopy,
  savedSource,
} from "./helpers/format-painter.ts";
import { cellDocument } from "./helpers/cell-format-copy.ts";

/**
 * Preserve actual target field identity while copying cell appearance through the public UI.
 *
 * Real imports, native copy controls, rendered metadata and three production
 * save formats establish that field identity belongs to the destination cell.
 * @async
 * @param {{page:Page}} context - Actual isolated production application renderer.
 * @returns {Promise<void>} Resolves after destination names and text survive all saves.
 * @throws {Error} If cell appearance copying or native serialization replaces field identity.
 * @example
 * // Copying a source title cell never renames the target form field.
 */
async function verifyNativeCellFieldIdentity({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  /** Independent source and destination fields deliberately have unrelated identities. */
  const source = cellDocument(true),
    target = cellDocument(false),
    name = '포한_<TARGET>&"🙂';
  source.content![0].content![0].content![0].attrs!.nativeCellFieldName =
    "SOURCE_FIELD";
  target.content![0].content![0].content![0].attrs!.nativeCellFieldName = name;
  await importSource(page, "named-source.fhn", source);
  await selectSource(page, ".tiptap th p", 1);
  await ribbonCopy(page);
  await page.locator('[name="format-copy-cell-properties"]').check();
  await page.locator('[name="format-copy-table-target"][value="cell"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await importSource(page, "named-target.fhn", target);
  await expect(page.locator(".tiptap td")).toHaveAttribute(
    "data-forhan-cell-field-name",
    name,
  );
  await selectSource(page, ".tiptap td p", 0, "대상 형식 유지 ABC".length);
  await ribbonCopy(page);
  await expect(page.locator(".tiptap th")).toHaveAttribute(
    "data-forhan-cell-field-name",
    name,
  );
  for (/** Actual file bytes are parsed independently of the visible target cell. */ const format of [
    "forhan",
    "hwpx",
    "hwp",
  ] as const) {
    /** Surrounding native anchor paragraphs do not change the target table's actual ownership. */
    const saved = await savedSource(page, format);
    /** A missing native table cannot make the field assertions vacuously pass. */
    let tables = 0;
    for (/** Only real native table cells supply the saved field identity. */ const block of saved.content ??
      [])
      if (block.type === "table") {
        tables++;
        expect(block.content![0].content![0].attrs!.nativeCellFieldName).toBe(
          name,
        );
        expect(block.content![0].content![0].content![0].content![0].text).toBe(
          "대상 형식 유지 ABC",
        );
      }
    expect(tables).toBe(1);
  }
}

test(
  "native cell appearance copying preserves destination field identity in all document formats",
  verifyNativeCellFieldIdentity,
);
