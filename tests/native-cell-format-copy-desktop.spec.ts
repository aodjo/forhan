import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";
import {
  SOURCE_PROPERTIES,
  TARGET_MARGINS,
  cellDocument,
} from "./helpers/cell-format-copy.ts";
import {
  importSource,
  selectSource,
  ribbonCopy,
} from "./helpers/format-painter.ts";
import { saveNativeCopy } from "./helpers/format-copy-native.ts";

/**
 * Verify native cell-property memory, actual file writes and independent body ownership.
 *
 * Renderer reload discards browser variables before the actual native bridge
 * supplies the accepted cell snapshot. Real HWPX, HWP and FHN output must retain
 * its exact native modes without copying source table defaults or text.
 * @async
 * @returns {Promise<void>} Resolves after actual native app memory, source files and one-step history agree.
 * @throws {Error} If the native source cache, output properties or destination ownership differs.
 * @example
 * // Copied cell modes survive renderer replacement in the actual selected packaged application.
 */
async function verifyNativeCellPropertyCopy(): Promise<void> {
  /** Both the profile and all produced native documents belong to this one regression process. */
  const profile = await mkdtemp(
    path.join(tmpdir(), "forhan-native-cell-copy-"),
  );
  /** The ordinary helper selects the exact packaged executable supplied by distribution validation. */
  const desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** Original renderer readiness is observed without substituting a browser-only application. */
    const page = await desktop.firstWindow();
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(
        await desktop.evaluate(
          /**
           * Read actual native packaging identity from the selected owned application.
           *
           * No platform, architecture or application status is changed by this read.
           * @param {typeof import('electron')} context - Actual owned native Electron exports.
           * @returns {boolean} Whether the running application is actually packaged.
           * @example
           * // A development runtime cannot satisfy a packaged cell-copy regression.
           */
          ({ app }) => app.isPackaged,
        ),
      ).toBe(true);
    /** Source appearance and destination field identity have independent original ownership. */
    const source=cellDocument(true),target=cellDocument(false),targetName='포한_<TARGET>&"🙂';
    source.content![0].content![0].content![0].attrs!.nativeCellFieldName='SOURCE_FIELD';
    target.content![0].content![0].content![0].attrs!.nativeCellFieldName=targetName;
    await importSource(page, "native-cell-original.fhn", source);
    await selectSource(page, ".tiptap th p", 1);
    await ribbonCopy(page);
    await expect(page.locator(".native-dialog-format-painter")).toBeVisible();
    await page.locator('[name="format-copy-cell-properties"]').check();
    await page.locator('[name="format-copy-cell-background"]').uncheck();
    await page
      .locator('[name="format-copy-table-target"][value="cell"]')
      .check();
    await page.locator('[data-modal-value="apply"]').click();
    await page.reload();
    await expect(page.locator(".tiptap")).toBeVisible();
    await importSource(
      page,
      "native-cell-destination.fhn",
      target,
    );
    /** Actual FHN output establishes target source identity and content before the native operation. */
    const before = await saveNativeCopy(
      desktop,
      page,
      profile,
      "before",
      "forhan",
    );
    await selectSource(page, ".tiptap td p", 0, "대상 형식 유지 ABC".length);
    await ribbonCopy(page);
    await expect(page.locator(".tiptap th")).toHaveCount(1);
    for (/** Every native production writer must receive the accepted real app-process source record. */ const format of [
      "forhan",
      "hwpx",
      "hwp",
    ] as const) {
      /** Actual atomic native output is inspected through an independent complete format reader. */
      const output = await saveNativeCopy(
          desktop,
          page,
          profile,
          "copied",
          format,
        ),
        table = output.content!.find(
          /**
           * Find the actual native table independently of generated control-anchor paragraphs.
           *
           * Its source structure comes from the saved file rather than a substituted expected value.
           * @param {import('@tiptap/core').JSONContent} node - Actual parsed original source block.
           * @returns {boolean} Whether this block is the native table.
           * @example
           * // Each output has one real target table.
           */
          (node) => node.type === "table",
        )!,
        cell = table.content![0].content![0];
      expect(table.attrs!.nativeCellMargins).toEqual(TARGET_MARGINS);
      expect(cell.type).toBe("tableHeader");
      expect(cell.attrs!.nativeCellFieldName).toBe(targetName);
      expect(cell.attrs!.nativeCellProperties).toEqual(SOURCE_PROPERTIES);
      expect(cell.attrs!.backgroundColor).toBe("#112233");
      expect(cell.content![0].content![0].text).toBe("대상 형식 유지 ABC");
      expect(cell.content![0].content![0].marks).toContainEqual(
        expect.objectContaining({
          type: "textStyle",
          attrs: expect.objectContaining({
            fontSize: "20pt",
            color: "#ff0000",
          }),
        }),
      );
      if (format === "forhan") {
        expect(cell.attrs!.sourceId).toBe("target-cell");
        expect(cell.attrs!.colwidth).toEqual([240]);
      }
    }
    await page.locator(".tiptap").focus();
    await page.keyboard.press("ControlOrMeta+z");
    expect(
      await saveNativeCopy(desktop, page, profile, "undone", "forhan"),
    ).toEqual(before);
  } finally {
    await closeOwnedDesktop(desktop);
    expect(path.dirname(profile)).toBe(path.resolve(tmpdir()));
    expect(path.basename(profile)).toMatch(/^forhan-native-cell-copy-/u);
    await rm(profile, { recursive: true, force: true });
  }
}
test(
  "native cell properties survive renderer reload, real HWPX HWP FHN saves and one-step undo",
  verifyNativeCellPropertyCopy,
);
