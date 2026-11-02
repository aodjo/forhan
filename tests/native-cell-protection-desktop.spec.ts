import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {desktopLaunchOptions,closeOwnedDesktop} from './helpers/desktop-launch.ts';
import {verifyProtectionNavigation,verifyProtectedPointer} from './helpers/cell-protection.ts';
import {saveNativeCopy} from './helpers/format-copy-native.ts';

/**
 * Verify genuine native protected-cell navigation, pointer input and independently decoded output.
 *
 * The selected packaged or development executable owns every native event and
 * output byte. Protection remains distinct from form-editable metadata, and an
 * actual adjacent edit must survive production native saving without changing
 * protected source. Cleanup can remove only the generated owned profile.
 * @async
 * @returns {Promise<void>} Resolves after original native protection and source output agree.
 * @throws {Error} If the actual application, source, output or owned cleanup fails.
 * @example
 * // Copied Mac ZIP and DMG applications must retain the same protected source.
 */
async function verifyNativeProtection():Promise<void>{
  test.setTimeout(90000);
  /** Every generated input, output and native profile belongs to this isolated application. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-cell-protection-')),desktop=await electron.launch(desktopLaunchOptions(profile));
  try{
    /** The actual application renderer supplies its genuine original editing DOM. */
    const page=await desktop.firstWindow();
    await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(await desktop.evaluate(
      /**
       * Read the real native application's packaging identity.
       *
       * No executable, platform or runtime result can be substituted.
       * @param {typeof import('electron')} context - Actual owned native exports.
       * @returns {boolean} Genuine native packaging state.
       * @example
       * // Development Electron cannot satisfy the packaged distribution assertion.
       */
      ({app})=>app.isPackaged,
    )).toBe(true);
    await verifyProtectionNavigation(page);
    await verifyProtectedPointer(page);
    for(/** All native document writers must retain protected source after ordinary adjacent input. */const format of ['hwpx','hwp','forhan'] as const){
      /** Actual native production bytes are independently decoded through public readers. */
      const output=await saveNativeCopy(desktop,page,profile,'protected-adjacent-edit',format),cells=output.content![1].content![0].content!;
      expect(cells[0].content![0].content![0].text).toBe('LEFTX');
      expect(cells[1].content![0].content![0].text).toBe('MIDDLE');
      expect(cells[1].attrs!.nativeCellProperties).toMatchObject({protected:true,editable:true});
    }
    await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('.tiptap td p')).toHaveText(['LEFT','MIDDLE','RIGHT']);
  }finally{
    await closeOwnedDesktop(desktop);
    if(path.dirname(profile)!==path.resolve(tmpdir())||!path.basename(profile).startsWith('forhan-native-cell-protection-'))throw new Error('Native protection cleanup escaped its owned profile.');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('native protected cell navigation and pointer input retain source through actual HWPX HWP FHN saves',verifyNativeProtection);
