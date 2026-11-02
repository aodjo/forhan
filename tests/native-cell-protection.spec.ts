import {test,expect,type Page} from '@playwright/test';
import {savedSource} from './helpers/format-painter.ts';
import {verifyProtectionNavigation,verifyProtectedPointer} from './helpers/cell-protection.ts';

/**
 * Verify ordinary native cell navigation against the original protected and unprotected controls.
 *
 * Original form-editable metadata cannot silently override protection.
 * @async
 * @param {{page:Page}} context - Actual isolated browser renderer.
 * @returns {Promise<void>} Resolves after source navigation matches original observations.
 * @example
 * // Protected MIDDLE is skipped in both directions.
 */
async function verifyNavigation({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  await verifyProtectionNavigation(page);
}

/**
 * Verify protected pointer input, real native output and undo retain original protected source.
 *
 * Genuine user input can edit ordinary source without changing protected text.
 * Production HWP and HWPX readers independently inspect the saved protection bit.
 * @async
 * @param {{page:Page}} context - Actual isolated browser renderer.
 * @returns {Promise<void>} Resolves after native saves and source undo agree.
 * @example
 * // Clicking protected MIDDLE cannot send the following X into that cell.
 */
async function verifyPointerAndOutput({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  await verifyProtectedPointer(page);
  for(/** Both native writers must retain the protected middle source after a genuine adjacent edit. */const format of ['hwp','hwpx'] as const){
    /** Actual production output is decoded independently from original renderer state. */
    const output=await savedSource(page,format),cells=output.content!.find(
      /**
       * Locate the original saved table independently of surrounding paragraphs.
       *
       * No generated drawing node can supply its source.
       * @param {import('@tiptap/core').JSONContent} node - Actual saved block.
       * @returns {boolean} Whether this source block is the original table.
       * @example
       * // Native files retain their own paragraph ordering.
       */
      node=>node.type==='table')!.content![0].content!;
    expect(cells[1].attrs!.nativeCellProperties).toMatchObject({protected:true,editable:true});
    expect(cells[1].content![0].content![0].text).toBe('MIDDLE');
  }
  await page.locator('.tiptap').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.tiptap td p')).toHaveText(['LEFT','MIDDLE','RIGHT']);
}

test('native protected cells match original bidirectional navigation and independent form-editable state',verifyNavigation);
test('native protected cell pointer input preserves original source through real HWP HWPX output and undo',verifyPointerAndOutput);
