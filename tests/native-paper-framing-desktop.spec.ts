import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions} from './helpers/desktop-launch.ts';
import {exerciseNativePaperFraming} from './helpers/native-paper-framing.ts';

/**
 * Verify original native margin boundaries and small-scale paper gaps in the selected application.
 *
 * Actual native execution retains complete screenshot bytes and executable/archive
 * identities. Public controls own every source import, view choice and navigation.
 * @async
 * @returns {Promise<void>} Resolves after nineteen original frames and actual source behavior agree.
 * @throws {Error} If native execution, observed physical paper and source shade edges or original source behavior differs.
 * @example
 * // The packaged gate cannot substitute the preview server for the archived application.
 */
async function verifyDesktopNativePaperFraming():Promise<void>{
  test.setTimeout(180000);
  /** Only this invocation owns its native profile and actual completed frame artifacts. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-paper-framing-')),options=desktopLaunchOptions(profile),
    outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/native-paper-framing',randomUUID()):test.info().outputPath('native-paper-framing-frames');
  options.args!.push('--force-device-scale-factor=1');
  /** The selected native runtime remains independent from its renderer observations. */
  const desktop=await electron.launch(options);
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Original application readiness precedes every public native operation. */
    const page=await desktop.firstWindow();await expect(page.locator('.tiptap')).toBeVisible();
    /** Actual main-process identity proves the selected executable and archived resource path. */
    const identity=await desktop.evaluate(
      /**
       * Read original native executable and application identities.
       *
       * The actual main process supplies paths independently from requested launch arguments.
       * @param {typeof import('electron')} context - Actual selected native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual executing resource paths.
       * @example
       * // A packaged application resolves its own app.asar.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    /**
     * Resize only the selected owned native application window.
     *
     * Original source and live observers remain responsible for all subsequent layout.
     * @async
     * @param {number} width - Actual native content width.
     * @param {number} height - Actual native content height.
     * @returns {Promise<void>} Resolves after the owned native viewport changes.
     * @example
     * await resize(1440,960);
     */
    const resize=async(width:number,height:number):Promise<void>=>{
      await desktop.evaluate(
        /**
         * Apply actual owned native content dimensions.
         *
         * Only this generated application's window is resized; no expected source position is injected.
         * @param {typeof import('electron')} context - Actual selected native exports.
         * @param {{width:number;height:number}} size - Requested native viewport dimensions.
         * @returns {void} Applies real physical viewport dimensions.
         * @example
         * // Native resize observers update the original document view.
         */
        ({BrowserWindow},size)=>{BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height);},{width,height});
    };
    /** Complete native observations retain their unchanged image bytes and independent resource identities. */
    const records=await exerciseNativePaperFraming(page,resize,outputRoot);
    /** The archived executable and resource bundle must match this actual observed run. */
    const hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-native-paper-framing-and-source-observation-not-REA',identity,...hashes,records},null,2)+'\n');
  }finally{
    try{
      await desktop.evaluate(
        /**
         * Exit only the generated native regression application after success or failure.
         *
         * An open modal or unsaved synthetic document cannot leave this owned process running.
         * @param {typeof import('electron')} context - Actual selected owned native exports.
         * @returns {void} Terminates only this generated application without a save prompt.
         * @example
         * // A failed assertion cannot retain an owned native foreground actor.
         */
        ({app})=>app.exit(0));
    }finally{await desktop.close();}
    expect(path.dirname(path.resolve(profile))).toBe(path.resolve(tmpdir()));expect(path.basename(profile).startsWith('forhan-native-paper-framing-')).toBe(true);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('actual native application retains 19 original margin and small-scale frames with native shade-unit boundaries and horizontal page coverage',verifyDesktopNativePaperFraming);
