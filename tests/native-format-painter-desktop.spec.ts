import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {desktopLaunchOptions,closeOwnedDesktop} from './helpers/desktop-launch.ts';
import {SOURCE_DOCUMENT,SOURCE_PARAGRAPH,importSource,selectSource,ribbonCopy} from './helpers/format-painter.ts';
import {saveNativeCopy} from './helpers/format-copy-native.ts';

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
    await expect(page.locator('.native-dialog-format-painter')).toBeVisible();
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
