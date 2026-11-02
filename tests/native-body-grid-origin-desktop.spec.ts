import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions,closeOwnedDesktop} from './helpers/desktop-launch.ts';
import {saveDesktopOutput} from './helpers/native-output.ts';
import {observePdf} from './helpers/pdf.ts';
import {verifyNativePaginationPdf} from './helpers/native-pagination.ts';
import {verifyNativeBodyOrigin,verifyNativeBodyOriginPdf,verifyNativeBodyBackgroundPdf,type NativeBodyOriginFixture} from './helpers/native-body-grid-origin.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';
import {validatePage} from '../src/documents.ts';
import {nativePaperGeometry} from '../src/native-page-layout.ts';

/**
 * Verify original shaded body origins and native source output in the selected desktop application.
 *
 * Eighteen actual source conditions retain every physical page's source coordinates
 * at two public display scales. Real native PDF output is decoded independently;
 * original physical page membership, glyph baselines and opaque shade paths
 * remain the oracle. Three source samples also
 * produce all native containers without introducing default header distances.
 * Other independent paint remains outside this measured solid-background contract.
 * @async
 * @returns {Promise<void>} Resolves after actual desktop glyphs, physical output pages, source shades and native insets agree.
 * @throws {Error} If body placement, independent margins, source characters or native insets change.
 * @example
 * // npm run test:packaged exercises the actual archived application rather than a preview server.
 */
async function verifyDesktopNativeBodyOrigins():Promise<void>{
  test.setTimeout(180000);
  /** Unique owned native profiles and output directories prevent cross-run evidence reuse. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-body-origin-')),desktop=await electron.launch(desktopLaunchOptions(profile)),
    outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/native-body-grid-origin',randomUUID()):test.info().outputPath('native-body-output');
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Actual renderer readiness also establishes that native application initialization has completed. */
    const page=await desktop.firstWindow();await expect(page.locator('.tiptap')).toBeVisible();
    /** Actual running native identity is independent from the requested executable argument. */
    const identity=await desktop.evaluate(
      /**
       * Observe the selected native application's actual runtime identity.
       *
       * A development runtime cannot satisfy a packaged execution claim.
       * @param {typeof import('electron')} context - Native exports from the actual running main process.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual native process identity.
       * @example
       * // Packaged application resources resolve to its own app.asar.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    /** Expected positions and insets come from independently retained original native observations. */
    const fixture=JSON.parse(await readFile('tests/fixtures/native-body-grid-origin.json','utf8')) as {rows:NativeBodyOriginFixture[]},records:unknown[]=[],
      hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    expect(fixture.rows.length).toBe(18);
    for(/** Every condition enters the actual production importer without patching source or layout. */const row of fixture.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      for(/** Actual native display scaling retains physical source distances. */const zoom of [50,125]){
        await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill(String(zoom));await page.locator('[data-modal-value="apply"]').click();
        await expect(page.locator('#zoom-reset')).toHaveText(zoom+'%');await verifyNativeBodyOrigin(page,row);await verifyEditableSheetCase(page,row);
      }
      /** Real completed native PDF bytes retain independently measurable source baselines. */
      const file=path.join(outputRoot,row.id+'.pdf'),bytes=await saveDesktopOutput(desktop,page,'pdf',file),pdf=await observePdf(bytes),first=verifyNativeBodyOriginPdf(pdf,row),backgroundBoxes=await verifyNativeBodyBackgroundPdf(bytes,pdf,row);
      verifyNativePaginationPdf(pdf,row);
      records.push({id:row.id,format:'pdf',file,sha256:createHash('sha256').update(bytes).digest('hex'),originalPdfSha256:row.nativePdfSha256,firstBody:first,backgroundBoxes,observed:pdf});
      if(row.id.endsWith('g1600-p170-paragraphs'))for(/** Each physical inset preset retains real unchanged source in all three native containers. */const format of ['hwpx','hwp','forhan']){
        /** Actual production writers receive original source independently from drawing-only decorations. */
        const sourceFile=path.join(outputRoot,row.id+'.'+(format==='forhan'?'fhn':format)),sourceBytes=await saveDesktopOutput(desktop,page,format,sourceFile),
          payload=format==='hwp'?readHwp(sourceBytes):format==='hwpx'?await readHwpx(sourceBytes):JSON.parse(sourceBytes.toString('utf8')),
          physical=nativePaperGeometry(validatePage(payload.page));
        expect(physical,row.id).toEqual({width:row.paper.width,height:row.paper.height,top:row.paper.top+row.paper.header,bottom:row.paper.bottom+row.paper.footer,left:row.paper.left,right:row.paper.right});
        expect(payload.doc.content.length,row.id).toBe(80);
        records.push({id:row.id,format,file:sourceFile,sha256:createHash('sha256').update(sourceBytes).digest('hex')});
      }
    }
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-native-shaded-first-body-origin-and-independent-source-insets-not-REA',identity,...hashes,records},null,2)+'\n');
  }finally{await closeOwnedDesktop(desktop);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}

test('18 actual native shaded documents preserve physical print pages, opaque background paths and stable first-body origins',verifyDesktopNativeBodyOrigins);
