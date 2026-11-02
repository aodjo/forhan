import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions,closeOwnedDesktop,resizeOwnedDesktop} from './helpers/desktop-launch.ts';
import {exerciseNativePaperFrames,exerciseNativePaperResize,exerciseNativeNavigationKeyup} from './helpers/native-paper-scenarios.ts';
import {observeNativeKeySource,retainNativeKeySource} from './helpers/native-key-source-observation.ts';

/**
 * Verify original paper viewport pixels and source behavior in the selected native application.
 *
 * Every completed frame retains its actual native runtime identity and complete
 * unmodified bytes. Independent original captures establish observable geometry;
 * public source controls and actual window resizes must preserve original text,
 * source shade alignment and the vertical caret column.
 * @async
 * @returns {Promise<void>} Resolves after all eighty-two original native conditions and resize-only source checks agree.
 * @throws {Error} If runtime identity, native paper placement or original source behavior changes.
 * @example
 * // The packaged gate observes the actual archived application without a preview server.
 */
async function verifyDesktopNativePaperViewport():Promise<void>{
  test.setTimeout(180000);
  /** One invocation owns its native profile, completed frames and actual selected desktop entry point. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-paper-')),options=desktopLaunchOptions(profile),
    outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/native-paper-viewport',randomUUID()):test.info().outputPath('native-paper-frames');
  options.args!.push('--force-device-scale-factor=1');
  /** Actual process launch remains separate from requested runtime identity. */
  const desktop=await electron.launch(options);
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Renderer readiness precedes all native window sizing and public source operations. */
    const page=await desktop.firstWindow();await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
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
      await resizeOwnedDesktop(desktop,width,height);
    };
    /** Completed original frame comparisons retain their actual unmodified screenshot identities. */
    const records=await exerciseNativePaperFrames(page,resize,outputRoot);await exerciseNativePaperResize(page,resize);
    /** Packaged observations bind every actual frame to the selected executable and application archive. */
    const hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-native-paper-viewport-and-source-resize-observation-not-REA',identity,...hashes,records},null,2)+'\n');
  }finally{
    await closeOwnedDesktop(desktop);expect(path.dirname(path.resolve(profile))).toBe(path.resolve(tmpdir()));expect(path.basename(profile).startsWith('forhan-native-paper-')).toBe(true);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('actual native application retains 82 original paper viewport frames and source behavior through real resizing',verifyDesktopNativePaperViewport);

/**
 * Isolate native source columns from the longer original paper-frame matrix.
 *
 * The same original document, five independent resize frames and exact source
 * offsets remain covered by the complete eighty-two-frame case above. This
 * focused native regression makes the immediate arrow/resize failure observable
 * without replacing the full matrix or changing any original expected position.
 * @async
 * @returns {Promise<void>} Resolves after actual native source offsets9 and13 survive movement and resize.
 * @throws {Error} If original native frames, actual source columns or runtime ownership differ.
 * @example
 * // A pending source caret after a native word-spacing wrapper must retain its true column.
 */
async function verifyDesktopNativePaperCaretColumns():Promise<void>{
  test.setTimeout(60000);
  /** One original native application and unique disposable profile own this focused regression. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-source-columns-')),options=desktopLaunchOptions(profile);
  options.args!.push('--force-device-scale-factor=1');
  /** Actual native execution remains independent from a browser viewport substitute. */
  const desktop=await electron.launch(options);
  try{
    /** Public document controls and original source inputs belong to this actual renderer. */
    const page=await desktop.firstWindow();await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
    /** Actual native runtime identity is retained separately from requested launch arguments. */
    const identity=await desktop.evaluate(
      /**
       * Observe identity from the actual selected native main process.
       *
       * Packaged regressions require the real archived application instead of a development substitute.
       * @param {typeof import('electron')} context - Actual selected native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Original native process identity.
       * @example
       * // The packaged gate supplies an executable whose app.isPackaged must be true.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    await test.info().attach('native-source-column-runtime',{body:JSON.stringify(identity),contentType:'application/json'});
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    if(process.env.FORHAN_KEY_SOURCE_OBSERVE==='1')await page.evaluate(observeNativeKeySource);
    /**
     * Resize the original owning native window before inspecting its real source.
     *
     * Existing native observers retain both requested and actual display/window bounds.
     * @async
     * @param {number} width - Original requested content width in pixels.
     * @param {number} height - Original requested content height in pixels.
     * @returns {Promise<void>} Resolves after the actual native resize and its independent observation.
     * @example
     * await resize(1200,960); // The source caret must retain its original unzoomed column.
     */
    const resize=async(width:number,height:number):Promise<void>=>{await resizeOwnedDesktop(desktop,width,height);};
    try{await exerciseNativePaperResize(page,resize);}
    finally{if(process.env.FORHAN_KEY_SOURCE_OBSERVE==='1')await retainNativeKeySource(page);}
  }finally{
    await closeOwnedDesktop(desktop);
    expect(path.dirname(path.resolve(profile))).toBe(path.resolve(tmpdir()));expect(path.basename(profile).startsWith('forhan-native-source-columns-')).toBe(true);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('native source caret columns survive real native resize after immediate arrow movement',verifyDesktopNativePaperCaretColumns);

/**
 * Verify actual native navigation releases commit source before deferred focus can restore an older caret.
 *
 * The original short-line fixture uses genuine native key events and a read-only
 * root-phase observer. The selected packaged executable must remain a real
 * archived application, and all cleanup stays inside its generated profile.
 * @async
 * @returns {Promise<void>} Resolves after actual original navigation endpoints agree.
 * @throws {Error} If actual source, runtime identity, native keyup or owned cleanup fails.
 * @example
 * // Three Right releases retain the third original source position on Mac and Windows.
 */
async function verifyDesktopNativeNavigationKeyup():Promise<void>{
  test.setTimeout(60000);
  /** One unique native application and disposable profile own this independent regression. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-keyup-columns-')),options=desktopLaunchOptions(profile);
  options.args!.push('--force-device-scale-factor=1');
  /** Real native execution cannot be replaced by a browser viewport or fake platform. */
  const desktop=await electron.launch(options);
  try{
    /** Original source and native keyboard events belong to this actual renderer. */
    const page=await desktop.firstWindow();await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(await desktop.evaluate(
      /**
       * Read actual native packaging identity without changing the selected application.
       *
       * @param {typeof import('electron')} context - Actual owned native process exports.
       * @returns {boolean} Original real packaging state.
       * @example
       * // Development Electron cannot satisfy the packaged gate.
       */
      ({app})=>app.isPackaged,
    )).toBe(true);
    await resizeOwnedDesktop(desktop,1440,960);
    await exerciseNativeNavigationKeyup(page);
  }finally{
    await closeOwnedDesktop(desktop);
    expect(path.dirname(path.resolve(profile))).toBe(path.resolve(tmpdir()));expect(path.basename(profile).startsWith('forhan-native-keyup-columns-')).toBe(true);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

test('native source caret navigation commits actual keyup before delayed focus work',verifyDesktopNativeNavigationKeyup);
