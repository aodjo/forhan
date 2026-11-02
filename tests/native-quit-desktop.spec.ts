import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {desktopLaunchOptions,closeOwnedDesktop} from './helpers/desktop-launch.ts';

/**
 * Observe an owned native process independently from a disposed automation channel.
 *
 * Signal zero only checks process existence. Unexpected observation failures
 * remain errors instead of being reported as successful application shutdown.
 * @param {number} pid - Actual main-process identifier captured before closing.
 * @returns {boolean} Whether the original native process still exists.
 * @throws {Error} If the operating system rejects observation for a reason other than absence.
 * @example
 * const alive=ownedProcessExists(nativePid);
 */
function ownedProcessExists(pid:number):boolean{
 try{process.kill(pid,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;}
}

/**
 * Preserve cancellation and resume an actual native application quit.
 *
 * The real application opens its own unsaved-work dialog. Cancelling preserves
 * the original source. A later ordinary window close retains Mac residency,
 * and a pristine application quit must actually end the native process. The
 * packaged gate selects the actual distribution instead of development Electron.
 * @async
 * @returns {Promise<void>} Resolves after source retention, platform residency and genuine quit agree.
 * @throws {Error} If a cancelled quit loses work, leaks quit intent or leaves a pristine application running.
 * @example
 * // Both Windows and actual Mac CI run this lifecycle without platform spoofing.
 */
async function verifyNativeQuitLifecycle():Promise<void>{
 test.setTimeout(120000);
 /** Every launch and generated profile belongs only to this native regression. */
 const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-quit-'));
 let desktop:ElectronApplication|undefined;
 let nativeClosed=false,nativePid=0;
 /**
  * Remember actual application closure before the automation channel is disposed.
  *
  * The same listener follows each separately owned launch without consulting a closed channel.
  * @returns {void} Records that the current native application closed.
  * @example
  * desktop.once('close',markNativeClosed);
  */
 function markNativeClosed():void{nativeClosed=true;}
 try{
  desktop=await electron.launch(desktopLaunchOptions(profile));
  desktop.once('close',markNativeClosed);
  nativePid=desktop.process().pid!;
  /** Actual application identity cannot be inferred from a test filename or an unrelated shell's current directory. */
  const identity=await desktop.evaluate(
   /**
    * Read the actual running application's source and distribution identity.
    *
    * This does not replace launch arguments or alter native lifecycle state.
    * @param {{app:Electron.App}} context - Actual main-process application.
    * @returns {object} Actual source path, executable, platform and packaging state.
    * @example
    * // A development test must run its own source tree, and a packaged test its distribution.
    */
   ({app})=>({application:app.getAppPath(),executable:process.execPath,platform:process.platform,packaged:app.isPackaged}),
  );
  if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
  else expect(path.resolve(identity.application)).toBe(path.resolve(fileURLToPath(new URL('../',import.meta.url))));
  expect(identity.platform).toBe(process.platform);
  await test.info().attach('native-quit-runtime',{body:JSON.stringify(identity,null,2),contentType:'application/json'});
  /** Original authored source must survive cancelling the real native quit. */
  const page=await desktop.firstWindow(),source='Native quit retains 한글 source';
  await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
  await page.locator('.tiptap').fill(source);
  await desktop.evaluate(
   /**
    * Request genuine application quitting through the native application API.
    *
    * Repeated requests share the original product save decision instead of opening duplicate prompts.
    * @param {{app:Electron.App}} context - Actual owning main-process application.
    * @returns {void} Requests quit without replacing any product handler.
    * @example
    * // This enters the same native lifecycle as Cmd+Q.
    */
   ({app})=>{app.quit();app.quit();},
  );
  await expect(page.locator('.modal [data-modal-value="cancel"]')).toBeVisible();
  await page.locator('.modal [data-modal-value="cancel"]').click();
  await expect(page.locator('.tiptap')).toHaveText(source);
  await expect(page.locator('.modal')).toHaveCount(0);
  /** A second close is an ordinary window operation after the previous quit was rejected. */
  const applicationClosed=process.platform==='darwin'?undefined:desktop.waitForEvent('close',{timeout:30000});
  await desktop.evaluate(
   /**
    * Close the actual document window through the native window API.
    *
    * The unchanged product save guard still controls document destruction.
    * @param {{BrowserWindow:typeof Electron.BrowserWindow}} context - Actual owning native window class.
    * @returns {void} Requests one real document-window close.
    * @example
    * // A Mac last-window close must not inherit a cancelled application quit.
    */
   ({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close(),
  );
  await expect(page.locator('.modal [data-modal-value="discard"]')).toBeVisible();
  /** The genuine page close must finish before residency or a replacement process is inspected. */
  const windowClosed=page.waitForEvent('close',{timeout:30000});
  await page.locator('.modal [data-modal-value="discard"]').click();await windowClosed;
  if(process.platform==='darwin'){
   expect(nativeClosed).toBe(false);expect(ownedProcessExists(nativePid)).toBe(true);
   await desktop.evaluate(
    /**
     * Reactivate the actual resident Mac application after closing its document.
     *
     * Production activation creates the replacement window and its original profile.
     * @param {{app:Electron.App}} context - Actual resident native application.
     * @returns {void} Emits the native application activation lifecycle event.
     * @example
     * // The new pristine window must still permit a subsequent genuine quit.
     */
    ({app})=>{app.emit('activate');},
   );
  }else{
   await applicationClosed;
   desktop=await electron.launch(desktopLaunchOptions(profile));
   nativeClosed=false;desktop.once('close',markNativeClosed);nativePid=desktop.process().pid!;
  }
  /** The resumed editor has no unsaved source, so a normal quit must terminate instead of hanging. */
  const pristine=await desktop.firstWindow();
  await expect(pristine.locator('.tiptap')).toBeVisible({timeout:30000});
  await expect(pristine.locator('.tiptap')).toHaveText('');
  await desktop.close();
  expect(nativeClosed).toBe(true);
  await expect.poll(
   /**
    * Observe actual kernel process removal after the normal application close event.
    *
    * A disposed automation channel cannot substitute for genuine native process termination.
    * @returns {boolean} Whether the original owned native process still exists.
    * @example
    * // The original PID must disappear without a test-side termination request.
    */
   ()=>ownedProcessExists(nativePid),
   {timeout:5000},
  ).toBe(false);
 }finally{
  if(desktop&&!nativeClosed)await closeOwnedDesktop(desktop);
  if(path.dirname(path.resolve(profile))!==path.resolve(tmpdir())||!path.basename(profile).startsWith('forhan-native-quit-'))throw new Error('The native quit profile escaped its owned directory.');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
}

test('actual native quit retains cancelled source, ordinary Mac residency and pristine process termination',verifyNativeQuitLifecycle);
