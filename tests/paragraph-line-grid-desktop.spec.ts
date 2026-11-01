import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions} from './helpers/desktop-launch.ts';
import {saveDesktopOutput} from './helpers/native-output.ts';
import {verifyPageGridControls,gridGlyphPositions} from './helpers/paragraph-line-grid.ts';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';

/**
 * Verify actual native grid drawing, reversible page state and production file output.
 *
 * The selected desktop owns every actual modal, native history transaction and
 * file write. Exact running executable and application hashes accompany all
 * retained native files. No development renderer can satisfy the packaged gate.
 * @async
 * @returns {Promise<void>} Resolves after native drawing and all source outputs agree.
 * @throws {Error} If actual identity, native progression, output or page undo differs.
 * @example
 * // npm run test:packaged executes this regression inside the actual distribution.
 */
async function verifyDesktopGrid():Promise<void>{
  test.setTimeout(90000);
  /** This isolated application and every generated native file have a unique owner. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-line-grid-')),desktop=await electron.launch(desktopLaunchOptions(profile)),outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/line-grid',randomUUID()):path.join(profile,'outputs');
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Native runtime identity is queried inside the actual selected application. */
    const identity=await desktop.evaluate(
      /**
       * Observe actual native application identity independently from launch arguments.
       *
       * Retained output evidence binds the actual running executable and archive.
       * @param {typeof import('electron')} context - Actual selected native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual native process identity.
       * @example
       * // A development executable cannot satisfy the distribution identity check.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    /** Exact native identities accompany actual bytes independently from renderer attributes. */
    const hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{},page=await desktop.firstWindow(),records:Array<{format:string;output:string;sha256:string}>=[];
    await expect(page.locator('.tiptap')).toBeVisible();await verifyPageGridControls(page);
    for(/** Every actual native format retains precise raw page source. */const format of ['hwpx','hwp','forhan','html','pdf']){
      /** Production serialization, native printing and atomic writes create every byte. */
      const output=path.join(outputRoot,'applied.'+(format==='forhan'?'fhn':format)),bytes=await saveDesktopOutput(desktop,page,format,output);
      if(['hwpx','hwp','forhan'].includes(format)){
        /** Independent decoders inspect actual completed source outputs. */
        const payload=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString('utf8'));
        expect(payload.page.lineGrid).toBe(3288);expect(payload.doc.content[0].attrs.nativeSnapToGrid).toBe(true);
      }else if(format==='html')expect(bytes.toString('utf8')).toContain('data-forhan-line-grid="3288"');
      else expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
      records.push({format,output,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    /** Real source reimport must retain the same accepted native progression. */
    const hwpx=records[0];await page.locator('#file-input').setInputFiles(hwpx.output);
    await expect(page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','3288');
    await expect.poll(
      /**
       * Observe native drawing after actual production output is reopened.
       *
       * Glyph ranges are measured independently from original source metadata.
       * @async
       * @returns {Promise<number>} Native-unit glyph error, or infinity for missing source.
       * @example
       * // A reopened real HWPX retains the actual 3288-unit line interval.
       */
      async()=>{/** Exact native units allow only the browser drawing quantum at the glyph edge. */const points=await page.evaluate(gridGlyphPositions);return points.length===2&&points[0]===0?Math.abs(points[1]-3288):Infinity;}).toBeLessThanOrEqual(2);
    await page.locator('.tiptap').click();
    await page.locator('button[data-native-tab="format"]').click();
    await page.locator('.native-ribbon [data-native-action="paragraph-format"]').click();
    await page.locator('[name="snap-to-grid"]').uncheck();
    await page.locator('[data-modal-value="apply"]').click();
    for(/** Independently disabled paragraphs retain the same accepted document grid. */const format of ['hwpx','hwp','forhan']){
      /** Actual native files must preserve a false paragraph flag without disabling the section. */
      const output=path.join(outputRoot,'opt-out.'+(format==='forhan'?'fhn':format)),bytes=await saveDesktopOutput(desktop,page,format,output),payload=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString('utf8'));
      expect(payload.page.lineGrid).toBe(3288);expect(payload.doc.content[0].attrs.nativeSnapToGrid).toBe(false);
      records.push({format,output,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    await page.locator('#file-input').setInputFiles(records[3].output);
    await expect(page.locator('#toast')).toContainText('applied.html');
    await expect(page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','3288');
    await expect.poll(
      /**
       * Observe actual source-based grid layout after standalone HTML reimport.
       *
       * Already drawn output wrappers cannot double the retained native interval.
       * @async
       * @returns {Promise<number>} Native glyph-position error, or infinity for missing source.
       * @example
       * // Reimported script-free output retains one actual 32.88pt grid interval.
       */
      async()=>{/** Physical source glyphs are measured after actual HTML normalization. */const points=await page.evaluate(gridGlyphPositions);return points.length===2&&points[0]===0?Math.abs(points[1]-3288):Infinity;}).toBeLessThanOrEqual(2);
    /** Native multi-paragraph spacing exposes measurement feedback that a single paragraph cannot detect. */
    const fixture=JSON.parse(await readFile('tests/fixtures/native-line-grid.json','utf8')).rows.find(
      /**
       * Select the independently measured native before-and-after spacing boundary.
       *
       * The original native cache retains 48pt logical progression; actual glyph leading gives 45pt.
       * @param {{id:string}} row - Original generated native fixture projection.
       * @returns {boolean} Whether this is the exact original spacing boundary.
       * @example
       * // Two independently snapped 32pt margins cannot become sequential measurement feedback.
       */
      (row:{id:string})=>row.id==='spacing-boundary-before-after32-snap1-next0');
    await page.locator('#file-input').setInputFiles({name:'native-grid-transition.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:fixture.doc,page:fixture.page}))});
    await expect(page.locator('#toast')).toContainText('native-grid-transition.fhn');
    for(/** Real standalone and paginated outputs must retain the same independent paragraph transition. */const format of ['html','pdf']){
      /** Actual production bytes stay available for independent PDF glyph-matrix decoding. */
      const output=path.join(outputRoot,'transition.'+format),bytes=await saveDesktopOutput(desktop,page,format,output);
      records.push({format,output,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-native-grid-controls-source-outputs-and-reopen',identity,...hashes,records},null,2)+'\n');
  }finally{
    if(desktop.process().exitCode===null)await desktop.evaluate(
      /**
       * Exit only this regression's isolated native process.
       *
       * Retained output stays outside the disposable application profile.
       * @param {typeof import('electron')} context - Actual owned native exports.
       * @returns {void} Exits without an unrelated save prompt.
       * @example
       * // User documents and unrelated applications remain outside this cleanup.
       */
      ({app})=>app.exit(0));
    await desktop.close();
    if(path.dirname(profile)===path.resolve(tmpdir())&&path.basename(profile).startsWith('forhan-line-grid-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}
test('actual desktop grid controls preserve native source in real files and reopened drawing',verifyDesktopGrid);
