import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readHwpx } from '../src/formats/hwpx';
import { readHwp } from '../src/formats/hwp';

/**
 * Verify public document extensions, ordered saving and real canonical format bytes.
 *
 * New documents save as HWPX by default. Explicit HWP and FHN outputs retain
 * actual document text; reopening FHN and legacy Forhan source preserves the
 * portable payload while subsequent saves use the canonical .fhn extension.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after real ordered saves and canonical source reopens.
 * @throws {Error} If a public extension, format signature or authored source differs.
 * @example
 * // The visible save list and actual filenames use HWPX, HWP, FHN in that order.
 */
async function verifyDocumentFormats({page}:{page:Page}):Promise<void> {
  await page.goto('/');
  await expect(page.locator('.tiptap')).toBeVisible();
  await expect(page.locator('#format-badge')).toHaveText('HWPX');
  await page.locator('#document-title').fill('저장 우선순위');
  await page.locator('.tiptap').fill('HWPX와 HWP 그리고 FHN 문서입니다.');
  await page.locator('#export-menu-toggle').click();
  await expect(page.locator('#export-menu button span').nth(0)).toHaveText('.hwpx');
  await expect(page.locator('#export-menu button span').nth(1)).toHaveText('.hwp');
  await expect(page.locator('#export-menu button span').nth(2)).toHaveText('.fhn');
  await page.keyboard.press('Escape');
  for (/** The actual default save and explicit native formats produce independent original bytes. */ const format of ['hwpx','hwp','fhn']) {
    /** The genuine production download is observed before its initiating command. */
    const pending=page.waitForEvent('download');
    if(format==='hwpx')await page.locator('#save-document').click();
    else {
      await page.locator('#export-menu-toggle').click();
      await page.locator('[data-export="'+(format==='fhn'?'forhan':format)+'"]').click();
    }
    /** Real downloaded bytes establish filename and document-format behavior. */
    const output=await pending,bytes=await readFile((await output.path())!);
    expect(output.suggestedFilename()).toBe('저장 우선순위.'+format);
    await expect(page.locator('#format-badge')).toHaveText(format.toUpperCase());
    if(format!=='fhn') {
      /** Independent native readers inspect actual archive/binary output rather than trusting a suffix. */
      const parsed=format==='hwpx'?await readHwpx(bytes):readHwp(bytes);
      expect(JSON.stringify(parsed.doc)).toContain('HWPX와 HWP 그리고 FHN 문서입니다.');
      continue;
    }
    /** FHN retains the stable existing payload identity and original document source. */
    const parsed=JSON.parse(bytes.toString('utf8'));
    expect(parsed.application).toBe('forhan');expect(parsed.version).toBe(1);
    for (/** Both current and historical portable source filenames remain readable. */ const name of ['다시.FHN','이전.forhan']) {
      await page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:bytes});
      await expect(page.locator('#toast')).toContainText(name);
      await expect(page.locator('.tiptap')).toHaveText('HWPX와 HWP 그리고 FHN 문서입니다.');
      await expect(page.locator('#format-badge')).toHaveText('FHN');
      /** Saving a reopened legacy payload always uses the current canonical public extension. */
      const next=page.waitForEvent('download');
      await page.locator('#save-document').click();
      expect((await next).suggestedFilename()).toBe('저장 우선순위.fhn');
    }
  }
}

test('new documents save as HWPX and offer real HWP and FHN outputs in priority order',verifyDocumentFormats);
