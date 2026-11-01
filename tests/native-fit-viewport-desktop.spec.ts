import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions} from './helpers/desktop-launch.ts';
import {exerciseNativeFitFrames,exerciseNativeFitBehavior} from './helpers/native-fit-scenarios.ts';

/**
 * Verify original persistent fitting pixels and source behavior in the selected native application.
 *
 * Every completed frame retains its actual native runtime identity and complete
 * unmodified bytes. Independent original captures establish observable geometry;
 * public source controls and actual window resizes must preserve original text,
 * source shade alignment and the vertical caret column.
 * @async
 * @returns {Promise<void>} Resolves after all thirty-six original native conditions and resize-only source checks agree.
 * @throws {Error} If runtime identity, native paper placement or original source behavior changes.
 * @example
 * // The packaged gate observes the actual archived application without a preview server.
 */
async function verifyDesktopNativeFitViewport():Promise<void>{
  test.setTimeout(180000);
  /** One invocation owns its native profile, completed frames and actual selected desktop entry point. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-fit-')),options=desktopLaunchOptions(profile),
    outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/native-fit-viewport',randomUUID()):test.info().outputPath('native-fit-frames');
  options.args!.push('--force-device-scale-factor=1');
  /** Actual process launch remains separate from requested runtime identity. */
  const desktop=await electron.launch(options);
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Renderer readiness precedes all native window sizing and public source operations. */
    const page=await desktop.firstWindow();await expect(page.locator('.tiptap')).toBeVisible();
    /** Actual native resources accompany every independently observed completed frame. */
    const identity=await desktop.evaluate(
      /**
       * Observe the selected application's actual executable and archive paths.
       *
       * Launch arguments alone cannot establish archived execution.
       * @param {typeof import('electron')} context - Native exports from the actual running main process.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual native process resource paths.
       * @example
       * // An archived run resolves its actual application to its own app.asar.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    /**
     * Resize the actual selected native application window.
     *
     * Source and renderer observers retain responsibility for dependent layout.
     * @async
     * @param {number} width - Requested actual content width in viewport pixels.
     * @param {number} height - Requested actual content height in viewport pixels.
     * @returns {Promise<void>} Resolves after the native window applies the requested content dimensions.
     * @example
     * await resize(1440,961); // No source transaction supplies expected pixel geometry.
     */
    const resize=async(width:number,height:number):Promise<void>=>{
      await desktop.evaluate(
        /**
         * Set real content dimensions on the owned native editor window.
         *
         * The selected test application owns this window and no unrelated process is targeted.
         * @param {typeof import('electron')} context - Native exports from the actual running main process.
         * @param {{width:number;height:number}} size - Requested actual viewport dimensions.
         * @returns {void} Applies native window geometry without editing source or changing document zoom.
         * @example
         * // A centered page moves through actual native resizing rather than injected renderer coordinates.
         */
        ({BrowserWindow},size)=>{BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height);},{width,height});
    };
    /** Completed original frame comparisons retain their actual unmodified screenshot identities. */
    const records=await exerciseNativeFitFrames(page,resize,outputRoot);await exerciseNativeFitBehavior(page,resize);
    /** Packaged observations bind every actual frame to the selected executable and application archive. */
    const hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-native-fit-viewport-and-source-resize-observation-not-REA',identity,...hashes,records},null,2)+'\n');
  }finally{
    await desktop.close();expect(path.dirname(path.resolve(profile))).toBe(path.resolve(tmpdir()));expect(path.basename(profile).startsWith('forhan-native-fit-')).toBe(true);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('actual native application retains 36 original persistent fit frames and source behavior through real resizing',verifyDesktopNativeFitViewport);
