import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {verifyNativeBodyOrigin,type NativeBodyOriginFixture} from './helpers/native-body-grid-origin.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';

/**
 * Keep shaded native text at its original body origin across real document and zoom changes.
 *
 * Eighteen original files cover proportional/grid spacing, independent paragraph
 * margins and default, zero and fractional header/footer insets. Every actual
 * source glyph on every original physical page retains its original
 * physical baseline at seven public display scales.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after all 126 actual source and zoom conditions agree.
 * @throws {Error} If source spacing collapses or the document grid starts at the paper rather than its body.
 * @example
 * // A shaded paragraph retains its 35mm native body inset instead of jumping upward.
 */
async function verifyRichNativeBodyOrigins({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Literal original PDF observations are independent of current browser rendering. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-body-grid-origin.json','utf8')) as {rows:NativeBodyOriginFixture[]};
  expect(fixture.rows.length).toBe(18);
  for(/** Every original source condition enters the same public document importer. */const row of fixture.rows){
    await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
    await expect(page.locator('#toast')).toContainText(row.id);
    for(/** Native physical source coordinates remain independent from display scale. */const zoom of [50,75,100,125,150,175,200]){
      await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill(String(zoom));await page.locator('[data-modal-value="apply"]').click();
      await expect(page.locator('#zoom-reset')).toHaveText(zoom+'%');
      /** Actual glyph geometry establishes completion rather than a retained drawing marker. */
      const geometry=await verifyNativeBodyOrigin(page,row);expect(geometry.zoom).toBe(zoom/100);await verifyEditableSheetCase(page,row);
    }
  }
}

test('18 original shaded native bodies preserve independent margins and every physical-page glyph across seven zoom levels',verifyRichNativeBodyOrigins);

/**
 * Preserve native first-body source placement in actual standalone HTML output.
 *
 * Real completed export bytes are loaded without application scripts. The
 * independent original PDF remains the expected body origin and source spacing,
 * including literal zero header/footer values and independently snapped margins.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after eighteen completed standalone documents preserve source placement.
 * @throws {Error} If exported source duplicates, collapses native margins or changes its body origin.
 * @example
 * // Disabled grids still retain independent before and after paragraph spacing.
 */
async function verifyStandaloneNativeBodyOrigins({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Actual standalone bytes retain all original source characters and native paragraph settings. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-body-grid-origin.json','utf8')) as {rows:NativeBodyOriginFixture[]},output=await page.context().newPage();
  try{
    for(/** Original native physical body coordinates remain the independent oracle. */const row of fixture.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      /** Production export owns serialization, measuring and creation of these actual output bytes. */
      const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
      /** The completed output is observed independently from editable drawing metadata. */
      const download=await pending,html=await readFile((await download.path())!,'utf8');await expect(page.locator('#save-document')).toBeEnabled();await output.setContent(html);await output.evaluate(
        /**
         * Await only actual standalone font readiness before measuring source glyphs.
         *
         * The exported file contains no executable document scripts.
         * @async
         * @returns {Promise<void>} Resolves after its actual installed fonts are ready.
         * @example
         * // Browser fallback font loading cannot substitute an expected native coordinate.
         */
        async()=>{await document.fonts.ready;});
      await verifyNativeBodyOrigin(output,row,'body');
    }
  }finally{await output.close();}
}

test('18 actual standalone shaded HTML documents retain original native body origins and independent paragraph margins',verifyStandaloneNativeBodyOrigins);
