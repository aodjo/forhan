import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions} from './helpers/desktop-launch.ts';
import {saveDesktopOutput} from './helpers/native-output.ts';
import {observePdf} from './helpers/pdf.ts';
import {nativePaginationDocument,verifyNativePaginationPdf,type NativePaginationFixture} from './helpers/native-pagination.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';

/**
 * Compare actual desktop PDF pages and source files with original native observations.
 *
 * Every physical PDF is written by the selected native application and decoded
 * independently. Three representative source conditions also retain actual
 * HWPX/HWP/FHN bytes for independent source checks and original native reopens.
 * Retained file identities bind the complete observation to the actual running
 * executable and archive rather than to a development print substitute.
 * @async
 * @returns {Promise<void>} Resolves after all sixty-three actual native PDFs and retained source files agree.
 * @throws {Error} If physical page membership, absolute source baselines, runtime identity or source output differs.
 * @example
 * // npm run test:packaged uses the exact validated native distribution.
 */
async function verifyDesktopNativePagination():Promise<void>{
  test.setTimeout(180000);
  /** The actual selected application owns one unique profile and retained output directory. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-pagination-')),desktop=await electron.launch(desktopLaunchOptions(profile)),
    outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/native-pagination',randomUUID()):path.join(profile,'outputs');
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Actual native process identity is observed inside the selected application. */
    const identity=await desktop.evaluate(
      /**
       * Observe actual native process ownership independently from launch arguments.
       *
       * Development Electron cannot satisfy a packaged execution claim.
       * @param {typeof import('electron')} context - Actual selected native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual native runtime identity.
       * @example
       * // The retained archive hash belongs to the running distribution.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    /** Independent original data and exact runtime hashes accompany every retained completed output. */
    const fixture=JSON.parse(await readFile('tests/fixtures/native-pagination.json','utf8')) as {rows:NativePaginationFixture[]},page=await desktop.firstWindow(),records:unknown[]=[],
      hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{},
      selected=new Set(['g3288-s1-p100-h1000-breaks','g0-h1999-p170-before0-after0-breaks','g3288-h1000-p100-before400-after400-paragraphs']);
    await expect(page.locator('.tiptap')).toBeVisible();expect(fixture.rows.length).toBe(63);
    for(/** Every original source condition enters the actual public native file importer. */const row of fixture.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:nativePaginationDocument(row.source)}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      await expect(page.locator('.native-sheet-background')).toHaveCount(row.pages.length);
      /** Actual native glyphs must settle at their independently observed original physical coordinates. */
      const geometry=await verifyEditableSheetCase(page,row);
      /** Actual print-window fragmentation and native atomic writing create these real bytes. */
      const file=path.join(outputRoot,row.id+'.pdf'),bytes=await saveDesktopOutput(desktop,page,'pdf',file),pdf=await observePdf(bytes);
      verifyNativePaginationPdf(pdf,row);
      records.push({id:row.id,format:'pdf',file,sha256:createHash('sha256').update(bytes).digest('hex'),editableGeometry:geometry,originalPdfSha256:row.nativePdfSha256,observed:pdf});
      if(selected.has(row.id))for(/** Native source output retains original paragraph structure and precise physical page data. */const format of ['hwpx','hwp','forhan']){
        /** Production writers receive the original unchanged model independently from auxiliary print pages. */
        const sourceFile=path.join(outputRoot,row.id+'.'+(format==='forhan'?'fhn':format)),sourceBytes=await saveDesktopOutput(desktop,page,format,sourceFile),
          payload=format==='hwp'?readHwp(sourceBytes):format==='hwpx'?await readHwpx(sourceBytes):JSON.parse(sourceBytes.toString('utf8'));
        expect(payload.doc.content.length,row.id).toBe(row.source.separate?row.source.count:1);
        expect(payload.page.lineGrid??0,row.id).toBe(row.source.page.lineGrid??0);
        expect(payload.doc.content[0].attrs.nativeSnapToGrid,row.id).toBe(row.source.snap);
        /** Native readers may spell the same proportional source as either a percentage or multiplier. */
        const spacing=String(payload.doc.content[0].attrs.lineHeight),percent=Number.parseFloat(spacing)*(spacing.endsWith('%')?1:100);
        expect(percent,row.id).toBe(row.source.percent);
        records.push({id:row.id,format,file:sourceFile,sha256:createHash('sha256').update(sourceBytes).digest('hex')});
      }
    }
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-desktop-native-source-pagination-physical-PDF-pages-font-matrices-and-source-files',identity,...hashes,records},null,2)+'\n');
  }finally{
    if(desktop.process().exitCode===null)await desktop.evaluate(
      /**
       * Exit only the isolated native process owned by this regression.
       *
       * Retained output lives outside its disposable application profile.
       * @param {typeof import('electron')} context - Actual owned native exports.
       * @returns {void} Exits without an unrelated save prompt.
       * @example
       * // User applications remain outside this cleanup.
       */
      ({app})=>app.exit(0));
    await desktop.close();
    if(path.dirname(profile)===path.resolve(tmpdir())&&path.basename(profile).startsWith('forhan-native-pagination-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('actual desktop writes 63 PDFs with original native physical pagination and unchanged HWPX, HWP and FHN source',verifyDesktopNativePagination);
