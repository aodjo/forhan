import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";
import { importSource, selectSource } from "./helpers/format-painter.ts";
import { saveNativeCopy } from "./helpers/format-copy-native.ts";
import {
  cellSizeDocument,
  assertIndependentCellWidths,
} from "./helpers/cell-size.ts";
import {
  editNativeCellSize,
  assertSingleCellSize,
} from "./helpers/cell-size-editing.ts";
import {
  tableDialogDocument,
  openTableDialog,
  editTableDialog,
  assertTableDialogOutput,
} from "./helpers/table-properties-dialog.ts";

/**
 * Edit actual native table properties and inspect complete atomic native file writes.
 *
 * The selected packaged application must own the dialog, its source and all
 * outputs. Development Electron cannot substitute when a package is supplied.
 * Independent widths, explicit numeric sizes, zero and half-millimeter source
 * values also retain all actual native files and one-step undo.
 * @async
 * @returns {Promise<void>} Resolves after real native files and one-step undo preserve original source ownership.
 * @throws {Error} If package identity, accepted properties, native output or history differs.
 * @example
 * // Both a ZIP-extracted and a DMG-copied Mac payload exercise this same actual dialog.
 */
async function verifyNativeTableDialogFiles(): Promise<void> {
  /** One native application and all its output files belong to this isolated owned profile. */
  const profile = await mkdtemp(
      path.join(tmpdir(), "forhan-native-table-dialog-"),
    ),
    desktop = await electron.launch(desktopLaunchOptions(profile));
  try {
    /** Actual renderer readiness precedes every source import or native menu operation. */
    const page = await desktop.firstWindow();
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    if (process.env.FORHAN_PACKAGED_EXECUTABLE)
      expect(
        await desktop.evaluate(
          /**
           * Observe actual native packaging identity without changing the application.
           *
           * Only the running selected native process supplies its packaged status.
           * @param {typeof import('electron')} context - Actual owned native Electron exports.
           * @returns {boolean} Whether this real running application is packaged.
           * @example
           * // A development executable cannot satisfy packaged dialog validation.
           */
          ({ app }) => app.isPackaged,
        ),
      ).toBe(true);
    await importSource(page, "native-table-dialog.fhn", tableDialogDocument());
    /** Complete actual native FHN output establishes the independent pre-dialog source baseline. */
    const before = await saveNativeCopy(
      desktop,
      page,
      profile,
      "before",
      "forhan",
    );
    await selectSource(page, ".tiptap td:first-child p", 1);
    await openTableDialog(page);
    await editTableDialog(page);
    for (/** Native atomic file output must retain the actual accepted dialog fields in every source format. */ const format of [
      "forhan",
      "hwpx",
      "hwp",
    ] as const)
      assertTableDialogOutput(
        await saveNativeCopy(
          desktop,
          page,
          profile,
          "table-properties",
          format,
        ),
      );
    await page.locator(".tiptap").focus();
    await page.keyboard.press("ControlOrMeta+z");
    expect(
      await saveNativeCopy(desktop, page, profile, "undone", "forhan"),
    ).toEqual(before);
    await importSource(
      page,
      "native-independent-cell-widths.fhn",
      cellSizeDocument(true),
    );
    for (/** Actual copied ZIP and DMG applications must preserve the independently sized original cell. */ const format of [
      "forhan",
      "hwpx",
      "hwp",
    ] as const)
      assertIndependentCellWidths(
        await saveNativeCopy(
          desktop,
          page,
          profile,
          "independent-widths",
          format,
        ),
        format,
      );
    await importSource(
      page,
      "native-explicit-cell-size.fhn",
      cellSizeDocument(),
    );
    /** Actual native source output remains the independent one-step history baseline for cell sizing. */
    const sizeBefore = await saveNativeCopy(
      desktop,
      page,
      profile,
      "before-cell-size",
      "forhan",
    );
    await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
    await openTableDialog(page);
    await editNativeCellSize(page);
    for (/** Actual copied native applications must preserve both explicit original distances in all source formats. */ const format of [
      "forhan",
      "hwpx",
      "hwp",
    ] as const)
      assertSingleCellSize(
        await saveNativeCopy(
          desktop,
          page,
          profile,
          "explicit-cell-size",
          format,
        ),
        format,
      );
    await page.locator(".tiptap").focus();
    await page.keyboard.press("ControlOrMeta+z");
    expect(
      await saveNativeCopy(
        desktop,
        page,
        profile,
        "undone-cell-size",
        "forhan",
      ),
    ).toEqual(sizeBefore);
    for (/** Actual copied native payloads must also retain original zero and fractional native control values. */ const [
      display,
      units,
    ] of [
      ["0.00", 0],
      ["0.50", 141],
    ] as const) {
      await importSource(
        page,
        "native-boundary-" + units + ".fhn",
        cellSizeDocument(),
      );
      /** Each original native import supplies its own independently saved history baseline. */
      const boundaryBefore = await saveNativeCopy(
        desktop,
        page,
        profile,
        "before-boundary-" + units,
        "forhan",
      );
      await selectSource(page, ".tiptap tr:first-child td:first-child p", 1);
      await openTableDialog(page);
      await editNativeCellSize(page, display, display);
      for (/** Real atomic native files preserve explicit zero and fractional units without changing any unselected cell. */ const format of [
        "forhan",
        "hwpx",
        "hwp",
      ] as const)
        assertSingleCellSize(
          await saveNativeCopy(
            desktop,
            page,
            profile,
            "boundary-" + units,
            format,
          ),
          format,
          units,
          units,
        );
      await page.locator(".tiptap").focus();
      await page.keyboard.press("ControlOrMeta+z");
      expect(
        await saveNativeCopy(
          desktop,
          page,
          profile,
          "undone-boundary-" + units,
          "forhan",
        ),
      ).toEqual(boundaryBefore);
    }
  } finally {
    await closeOwnedDesktop(desktop);
    expect(path.dirname(profile)).toBe(path.resolve(tmpdir()));
    expect(path.basename(profile)).toMatch(/^forhan-native-table-dialog-/u);
    await rm(profile, { recursive: true, force: true });
  }
}

test(
  "native table and cell property dialog retains actual HWPX HWP FHN files and one-step undo",
  verifyNativeTableDialogFiles,
);
