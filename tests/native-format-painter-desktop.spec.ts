import {test,expect,_electron as electron,type ElectronApplication,type Page} from '@playwright/test';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {JSONContent} from '@tiptap/core';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';
import {desktopLaunchOptions,closeOwnedDesktop} from './helpers/desktop-launch.ts';
import {SOURCE_DOCUMENT,SOURCE_PARAGRAPH,importSource,selectSource,ribbonCopy} from './helpers/format-painter.ts';

/**
 * Save actual native document bytes to an exact owned temporary destination.
 *
 * Only the system chooser's answer is redirected. Production renderer
 * serialization, authenticated IPC and atomic filesystem writes remain real.
 * @async
 * @param {ElectronApplication} desktop - Actual owned native application.
 * @param {Page} page - Its original application renderer.
 * @param {string} profile - Owned temporary application directory.
 * @param {string} id - Trusted unique output-case identifier.
 * @param {'forhan'|'hwp'|'hwpx'} format - Explicit production document writer.
 * @returns {Promise<JSONContent>} Independently parsed actual native output.
 * @throws {Error} If native saving fails or any destination escapes the owned profile.
 * @example
 * const doc=await saveNativeCopy(desktop,page,profile,'combined','hwpx');
 */
async function saveNativeCopy(desktop:ElectronApplication,page:Page,profile:string,id:string,format:'forhan'|'hwp'|'hwpx'):Promise<JSONContent>{
  /** Each output identity is inside the already created owned temporary directory. */
  const output=path.join(profile,id+'.'+(format==='forhan'?'fhn':format));
  expect(path.dirname(output)).toBe(profile);
  await desktop.evaluate(
    /**
     * Supply only the next native file chooser's exact owned output path.
     *
     * The selected application still performs every production save operation.
     * @param {typeof import('electron')} context - Actual native Electron exports.
     * @param {string} output - Exact absolute owned temporary destination.
     * @returns {void} Replaces only this owned chooser's user-selection result.
     * @example
     * // No document bytes or formatting results are supplied by this callback.
     */
    ({dialog},output)=>{
      dialog.showSaveDialog=
        /**
         * Resolve the owned native chooser with its generated destination.
         *
         * The real source writer and filesystem bridge remain unchanged.
         * @async
         * @returns {Promise<{canceled:false;filePath:string}>} Owned chooser answer.
         * @example
         * // A later native read observes the actual produced file.
         */
        async()=>({canceled:false,filePath:output});
    },output,
  );
  await page.locator('#export-menu-toggle').click();await page.locator(`[data-export="${format}"]`).click();
  await expect.poll(
    /**
     * Wait for the actual native atomic output to become readable.
     *
     * Only file absence is transient; other filesystem errors remain failures.
     * @async
     * @returns {Promise<boolean>} Whether this exact owned output exists.
     * @throws {Error} If a filesystem error other than absence occurs.
     * @example
     * // An earlier case cannot satisfy this unique destination.
     */
    async()=>{try{await access(output);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}},
  ).toBe(true);
  /** Actual complete native bytes are read independently after production saving. */
  const bytes=await readFile(output);
  return format==='forhan'?JSON.parse(bytes.toString()).doc:format==='hwp'?readHwp(bytes).doc:(await readHwpx(bytes)).doc;
}

/**
 * Verify native format copying, real saves, one-step undo and cross-document memory.
 *
 * The actual selected Windows or Mac application executes its production
 * format-copy UI. Targets keep identity, authored breaks and hyperlink content
 * while copied appearance reaches genuine HWPX, HWP and FHN files. Replacing
 * the document cannot clear the accepted source or add source text to it.
 * @async
 * @returns {Promise<void>} Resolves after actual native source and save invariants agree.
 * @throws {Error} If the selected application, actual saved source or owned cleanup fails.
 * @example
 * // The packaged gate exercises the distribution executable, not Vite or development substitution.
 */
async function verifyNativeFormatCopy():Promise<void>{
  /** This test owns both its isolated application profile and all generated native documents. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-format-copy-'));
  /** The same launch helper selects actual packaged binaries when the distribution gate supplies one. */
  const desktop=await electron.launch(desktopLaunchOptions(profile));
  try{
    /** Actual native source is observed only after the owning renderer finishes initialization. */
    const page=await desktop.firstWindow();
    await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(await desktop.evaluate(
      /**
       * Observe whether the actual running native application is packaged.
       *
       * A development executable cannot establish distribution behavior.
       * @param {typeof import('electron')} context - Actual running native exports.
       * @returns {boolean} Actual native packaging identity.
       * @example
       * // No platform or architecture value is assigned by the test.
       */
      ({app})=>app.isPackaged,
    )).toBe(true);
    await importSource(page,'native-format-copy.fhn',SOURCE_DOCUMENT);
    /** Actual production FHN supplies the original independent source baseline. */
    const before=await saveNativeCopy(desktop,page,profile,'before','forhan');
    await selectSource(page,'.tiptap > p:first-child',1);await ribbonCopy(page);
    await page.keyboard.press('Alt+b');await page.keyboard.press('Alt+d');
    await selectSource(page,'.tiptap > p:nth-child(2)',0,4);await page.keyboard.press('Alt+c');
    /** Native FHN preserves exact target identifiers and manual breaks. */
    const changed=await saveNativeCopy(desktop,page,profile,'combined','forhan'),target=changed.content![1];
    for(/** Every original native paragraph field is independent from source identity. */const [key,value] of Object.entries(SOURCE_PARAGRAPH))if(key!=='sourceId')expect(target.attrs?.[key]).toEqual(value);
    expect(target.attrs?.sourceId).toBe('copy-target');expect(target.attrs?.pageBreakBefore).toBe(true);
    expect(target.content![0].text).toBe('대상링크');
    expect(target.content![0].marks).toContainEqual(expect.objectContaining({type:'bold'}));
    for(/** The original native production writers all operate on the same actual accepted target source. */const format of ['hwpx','hwp'] as const){
      /** Independent native readers inspect real production output bytes. */
      const output=await saveNativeCopy(desktop,page,profile,'combined',format),serialized=JSON.stringify(output);
      expect(serialized).toContain('11.25pt');expect(serialized).toContain('#13579b');expect(serialized).toContain('https://example.com/target');
    }
    await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
    expect(await saveNativeCopy(desktop,page,profile,'undone','forhan')).toEqual(before);
    await importSource(page,'second-format-copy.fhn',{type:'doc',content:[{type:'paragraph',attrs:{sourceId:'second-target'},content:[{type:'text',text:'새문서'}]}]});
    await selectSource(page,'.tiptap > p',0,3);await ribbonCopy(page);
    /** A later document receives only copied appearance while retaining its own source and text. */
    const second=await saveNativeCopy(desktop,page,profile,'second','forhan');
    expect(second.content![0].attrs?.sourceId).toBe('second-target');expect(second.content![0].content![0].text).toBe('새문서');
    expect(second.content![0].content![0].marks).toContainEqual(expect.objectContaining({type:'textStyle',attrs:expect.objectContaining({fontSize:'11.25pt',color:'#13579b'})}));
  }finally{await closeOwnedDesktop(desktop);await rm(profile,{recursive:true,force:true});}
}

test('native desktop format copying preserves source, real HWPX HWP FHN output, undo and cross-document memory',verifyNativeFormatCopy);
