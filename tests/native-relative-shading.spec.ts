import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {observePdf} from './helpers/pdf.ts';
import {verifyNativePaginationPdf} from './helpers/native-pagination.ts';
import {verifyNativeBodyBackgroundPdf,type NativeBodyOriginFixture} from './helpers/native-body-grid-origin.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';

/**
 * Retain relative glyph geometry and original base-font shades in standalone printing.
 *
 * Actual original native PDFs supply every physical glyph baseline and shade
 * edge. Public zoom changes measure actual editable source across all sheets.
 * Completed script-free HTML is then printed independently by Chromium without
 * application scripts, so both export paths must preserve the same native
 * physical output regardless of the current editor's display scale.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after four font conditions preserve editable glyphs and independently printed HTML shade coverage.
 * @throws {Error} If source glyphs, physical pages or original native shade edges change.
 * @example
 * // Relative 150 percent glyphs retain their 16pt source shade in a standalone printed document.
 */
async function verifyStandaloneRelativeShading({page}:{page:Page}):Promise<void>{
  test.setTimeout(90000);await page.goto('/');
  /** Original native operators establish expectations independently from production export attributes. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-relative-shading.json','utf8')) as {rows:NativeBodyOriginFixture[]},output=await page.context().newPage();
  try{
    expect(fixture.rows.length).toBe(4);
    for(/** Original source values enter the public document importer without changing runtime layout methods. */const row of fixture.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      for(/** Physical source positions must remain independent from all supported public display scales. */const zoom of [50,75,100,125,150,175,200]){
        await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill(String(zoom));await page.locator('[data-modal-value="apply"]').click();
        await expect(page.locator('#zoom-reset')).toHaveText(zoom+'%');await verifyEditableSheetCase(page,row);
      }
      /** Production export writes the actual standalone bytes before the independent print observer starts. */
      const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
      /** Real completed output retains editable source separately from its print-only drawings. */
      const download=await pending,html=await readFile((await download.path())!,'utf8');
      await writeFile(test.info().outputPath(row.id+'.html'),html);await output.setContent(html);await output.evaluate(
        /**
         * Await actual installed font readiness in the standalone document.
         *
         * No application script or expected layout is injected into the output.
         * @async
         * @returns {Promise<void>} Resolves when the document's original installed font selection is ready.
         * @example
         * // Font fallback cannot substitute an expected native baseline.
         */
        async()=>{await document.fonts.ready;});
      /** Independent native Chromium printing observes the complete script-free exported document. */
      const bytes=await output.pdf({path:test.info().outputPath(row.id+'.pdf'),printBackground:true,preferCSSPageSize:true}),pdf=await observePdf(bytes);
      verifyNativePaginationPdf(pdf,row);await verifyNativeBodyBackgroundPdf(bytes,pdf,row);
    }
  }finally{await output.close();}
}

test('relative-size shaded source retains native pages at seven zoom levels and in actual standalone HTML printing',verifyStandaloneRelativeShading);
