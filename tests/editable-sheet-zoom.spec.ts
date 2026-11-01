import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {nativePaginationDocument,type NativePaginationFixture} from './helpers/native-pagination.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';

/**
 * Preserve original native physical source positions across actual display zoom changes.
 *
 * Public zoom controls reflow real browser text and paper borders. Original
 * native PDF page assignments and absolute baseline observations remain the
 * independent oracle for hard breaks, snapped margins and oversized advances.
 * @async
 * @param {{page:Page}} context - Actual isolated public application window.
 * @returns {Promise<void>} Resolves after seven display scales preserve all original physical source rows.
 * @throws {Error} If zoom changes source pagination, accumulates paragraph drift or loses physical baselines.
 * @example
 * // Fifty-percent and two-hundred-percent displays retain identical native source page membership.
 */
async function verifyEditableSheetZoom({page}:{page:Page}):Promise<void>{
  test.setTimeout(90000);await page.goto('/');
  /** Literal original source cases cover one long paragraph and independent snapped paragraph margins. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-pagination.json','utf8')) as {rows:NativePaginationFixture[]};
  let cases=0;
  for(/** Original native PDF geometry remains independent of current display scale. */const row of fixture.rows){
    if(!['g3288-s1-p100-h1000-breaks','g3288-h1000-p100-before400-after400-paragraphs','g1600-s1-p170-h1000-breaks'].includes(row.id))continue;
    cases++;
    await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:nativePaginationDocument(row.source)}))});
    await expect(page.locator('#toast')).toContainText(row.id);
    for(/** Fractional effective layout quanta must never accumulate across eighty source paragraphs. */const zoom of [50,75,100,125,150,175,200]){
      await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill(String(zoom));await page.locator('[data-modal-value="apply"]').click();
      await expect(page.locator('#zoom-reset')).toHaveText(zoom+'%');await expect(page.locator('.native-sheet-background')).toHaveCount(row.pages.length);
      /** Actual physical glyph checks also wait for dependent zoom reflow to finish. */
      const geometry=await verifyEditableSheetCase(page,row);expect(geometry.zoom).toBe(zoom/100);
    }
  }
  expect(cases).toBe(3);
}

test('editable native physical pages and actual source baselines remain stable across seven display zoom levels',verifyEditableSheetZoom);
