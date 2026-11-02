import { expect, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";

/** Independent literal native values expose unrelated field, size, body and selected-cell ownership. */
export const TABLE_DIALOG_FIELD = '포한_<A>&"🙂';

/**
 * Create independently authored unequal cells with deliberately mixed native properties.
 *
 * Literal original source codes and exact fractional widths remain independent
 * from the production dialog, parser and transaction implementation.
 * @returns {JSONContent} Complete three-cell authored source document.
 * @example
 * tableDialogDocument();
 */
export function tableDialogDocument(): JSONContent {
  /** Every selected source cell keeps independent text and exact stored measurements. */
  const cells: JSONContent[] = [],
    widths = [6122, 8003, 4001],
    heights = [282, 1001, 1777];
  for (let index = 0; index < 3; index++)
    cells.push({
      type: "tableCell",
      attrs: {
        sourceId: "dialog-cell-" + index,
        colspan: 1,
        rowspan: 1,
        colwidth: [widths[index] / 75],
        nativeCellHeight: heights[index],
        backgroundColor: "#112233",
        nativeCellFieldName: "FIELD_" + index,
        nativeCellProperties: {
          textDirection: 0,
          lineWrap: 0,
          verticalAlign: index === 0 ? 0 : index === 1 ? 2 : 1,
          hasMargin: index === 1,
          margins: {
            left: 123 + index,
            right: 456 + index,
            top: index,
            bottom: 789 + index,
          },
          protected: false,
          editable: false,
        },
      },
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "CELL " + String.fromCharCode(65 + index),
              marks: [
                {
                  type: "textStyle",
                  attrs: { fontSize: "12pt", color: "#ff0000" },
                },
              ],
            },
          ],
        },
      ],
    });
  return {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: {
          sourceId: "dialog-table",
          nativeTableProperties: {
            pageBreak: 2,
            repeatHeader: true,
            cellSpacing: 37,
          },
          nativeTableFlags: 6,
          nativeCellMargins: { left: 510, right: 510, top: 141, bottom: 141 },
        },
        content: [{ type: "tableRow", content: cells }],
      },
    ],
  };
}

/**
 * Open actual table properties through the real original-style native menu.
 *
 * The command must be enabled by the existing genuine source selection.
 * @async
 * @param {Page} page - Actual source-owning application renderer.
 * @returns {Promise<void>} Resolves after the original-sized four-tab dialog appears.
 * @throws {Error} If the real command, source context or native dialog is missing.
 * @example
 * await openTableDialog(page);
 */
export async function openTableDialog(page: Page): Promise<void> {
  await page.locator('[data-native-menu="format"]').click();
  await expect(
    page.locator('.native-menu-row[data-native-action="object-properties"]'),
  ).toBeEnabled();
  await page
    .locator('.native-menu-row[data-native-action="object-properties"]')
    .click();
  await expect(page.locator(".native-dialog-table-cell")).toBeVisible();
}

/**
 * Edit independent native table and cell controls through their actual public form.
 *
 * Every expected enum comes from separately observed original UI actions.
 * Unrelated source cell widths, heights, content and margins remain untouched.
 * @async
 * @param {Page} page - Actual mounted native table property dialog.
 * @returns {Promise<void>} Resolves after the explicit property draft is accepted.
 * @throws {Error} If a native category or literal field cannot be edited.
 * @example
 * await editTableDialog(page);
 */
export async function editTableDialog(page: Page): Promise<void> {
  await page.locator('[data-table-tab="2"]').click();
  await page.locator('[name="pageBreak"][value="1"]').check();
  await page.locator('[name="repeatHeader"]').uncheck();
  await page.locator('[name="tableMarginTop"]').fill("0.00");
  await page.locator('[data-table-tab="3"]').click();
  await page.locator('[name="hasMargin"]').check();
  await page.locator('[name="marginLeft"]').fill("0.00");
  await page.locator('[name="oneLine"]').check();
  await page.locator('[name="vertical"]').check();
  await page.locator('[name="direction"][value="2"]').check();
  await page.locator('[name="align"][value="2"]').check();
  await page.locator('[name="header"]').check();
  await page.locator('[name="protected"]').check();
  await page.locator('[name="editable"]').check();
  await page.locator('[name="fieldName"]').fill(TABLE_DIALOG_FIELD);
  await page.locator('[name="fieldName"]').dispatchEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:true,keyCode:229});
  await expect(page.locator('.native-dialog-table-cell')).toBeVisible();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-table-cell")).toHaveCount(0);
}

/**
 * Assert actual complete saved native source independently from dialog internals.
 *
 * Native anchor paragraphs are ignored while all actual original table cells,
 * source distances, source flags and literal body content remain observable.
 * @param {JSONContent} doc - Actual complete publicly saved and independently read document.
 * @returns {void} Completes independent native property and destination ownership assertions.
 * @throws {Error} If a source field, untouched cell or physical measurement changes.
 * @example
 * assertTableDialogOutput(await savedSource(page,'hwp'));
 */
export function assertTableDialogOutput(doc: JSONContent): void {
  /** Only the real saved table and cells supply the values under test. */
  let table: JSONContent | undefined;
  for (/** Native output may contain genuine generated control-anchor paragraphs. */ const node of doc.content ??
    [])
    if (node.type === "table") {
      table = node;
      break;
    }
  expect(table).toBeTruthy();
  expect(table!.attrs!.nativeTableProperties).toEqual({
    pageBreak: 1,
    repeatHeader: false,
    cellSpacing: 37,
  });
  expect(table!.attrs!.nativeCellMargins).toEqual({
    left: 510,
    right: 510,
    top: 0,
    bottom: 141,
  });
  /** Native header ownership must preserve independent body, fill, dimensions and field identity. */
  const cells = table!.content![0].content!;
  expect(cells).toHaveLength(3);
  expect(cells[0].type).toBe("tableHeader");
  expect(cells[0].attrs!.nativeCellProperties).toEqual({
    textDirection: 2,
    lineWrap: 1,
    verticalAlign: 2,
    hasMargin: true,
    margins: { left: 0, right: 456, top: 0, bottom: 789 },
    protected: true,
    editable: true,
  });
  expect(cells[0].attrs!.nativeCellFieldName).toBe(TABLE_DIALOG_FIELD);
  for (let index = 0; index < 3; index++) {
    expect(cells[index].attrs!.colwidth).toEqual(
      [[6122 / 75], [8003 / 75], [4001 / 75]][index],
    );
    expect(cells[index].attrs!.nativeCellHeight).toBe([282, 1001, 1777][index]);
    expect(cells[index].content![0].content![0].text).toBe(
      "CELL " + String.fromCharCode(65 + index),
    );
    expect(cells[index].attrs!.backgroundColor).toBe("#112233");
    if (index > 0) {
      expect(cells[index].type).toBe("tableCell");
      expect(cells[index].attrs!.nativeCellFieldName).toBe("FIELD_" + index);
      expect(cells[index].attrs!.nativeCellProperties.protected).toBe(false);
      expect(cells[index].attrs!.nativeCellProperties.verticalAlign).toBe(
        index === 1 ? 2 : 1,
      );
    }
  }
}
