import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions} from './helpers/desktop-launch.ts';
import {saveDesktopOutput} from './helpers/native-output.ts';
import {observePdf} from './helpers/pdf.ts';
import {verifyNativePaginationPdf} from './helpers/native-pagination.ts';
import {verifyNativeBodyBackgroundPdf,type NativeBodyOriginFixture} from './helpers/native-body-grid-origin.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';

/**
 * Preserve original native shade height independently from relative glyph size.
 *
 * Four actual original PDFs establish physical glyph baselines, page membership
 * and opaque background edges. Relative 50 and 150 percent glyphs retain their
 * original 16pt base-font shade height. Expectations come from independently
 * decoded original PDF operators rather than production drawing attributes.
 * @async
 * @returns {Promise<void>} Resolves after all actual native output files agree with the original physical observations.
 * @throws {Error} If glyphs, physical pages or an original background edge differ beyond native printer precision.
 * @example
 * // A 16pt source at 50 percent retains a 16pt shade behind its 8pt glyphs.
 */
async function verifyNativeRelativeShading():Promise<void>{
  test.setTimeout(90000);
  /** Every invocation owns its native profile and completed output directory. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-relative-shading-')),desktop=await electron.launch(desktopLaunchOptions(profile)),
    outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/native-relative-shading',randomUUID()):test.info().outputPath('native-relative-shading');
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Literal observations retain their original source and native executable hashes. */
    const fixture=JSON.parse(await readFile('tests/fixtures/native-relative-shading.json','utf8')) as {rows:NativeBodyOriginFixture[]},
      page=await desktop.firstWindow(),records:unknown[]=[];
    await expect(page.locator('.tiptap')).toBeVisible();expect(fixture.rows.length).toBe(4);
    /** The actual runtime identity accompanies these independently decoded completed bytes. */
    const identity=await desktop.evaluate(
      /**
       * Observe the application that actually owns the native output operation.
       *
       * Requested launch arguments alone cannot establish packaged execution.
       * @param {typeof import('electron')} context - Native exports from the actual running main process.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual executable and application resource paths.
       * @example
       * // An archived run resolves application resources to its own app.asar.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    for(/** Every original font condition enters the same public production document importer. */const row of fixture.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
      await expect(page.locator('#toast')).toContainText(row.id);await verifyEditableSheetCase(page,row);
      /** Actual completed file bytes supply searchable text and opaque path geometry independently. */
      const file=path.join(outputRoot,row.id+'.pdf'),bytes=await saveDesktopOutput(desktop,page,'pdf',file),pdf=await observePdf(bytes),backgrounds=await verifyNativeBodyBackgroundPdf(bytes,pdf,row);
      verifyNativePaginationPdf(pdf,row);
      records.push({id:row.id,file,sha256:createHash('sha256').update(bytes).digest('hex'),originalPdfSha256:row.nativePdfSha256,pdf,backgrounds});
    }
    /** A packaged observation binds every completed output to the actual running archive. */
    const hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-native-relative-glyph-and-base-font-shade-PDF-observation-not-REA',identity,...hashes,records},null,2)+'\n');
  }finally{await desktop.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}

test('four original native font conditions preserve physical PDF glyphs and base-font shade edges',verifyNativeRelativeShading);
