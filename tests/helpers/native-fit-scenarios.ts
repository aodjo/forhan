import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyNativePaperFrame,type NativePaperViewportFrame,type NativePaperViewportGroup} from './native-paper-viewport.ts';
import type {NativeViewportResize} from './native-paper-scenarios.ts';

/** Original native modes are selected once before each actual resize sequence. */
interface NativeFitFrame extends NativePaperViewportFrame {mode:'width'|'page';step:number;fitLabel:string;}
/** Literal original source accompanies its independently observed native fit frames. */
interface NativeFitGroup extends Omit<NativePaperViewportGroup,'frames'|'font'|'relativeSize'> {frames:NativeFitFrame[];}

/**
 * Read the public display percentage without cancelling persistent fitting.
 *
 * The public dialog exposes the numeric view percentage while its cancel action
 * preserves the active fit mode and authored source content.
 * @async
 * @param {Page} page - Actual isolated browser or native renderer.
 * @returns {Promise<number>} Current percentage exposed by the public view dialog.
 * @example
 * await nativeFitPercentage(page); // 168
 */
export async function nativeFitPercentage(page:Page):Promise<number>{
  await page.locator('#zoom-reset').click();
  /** Only the actual public control supplies the observed numeric percentage. */
  const value=Number(await page.locator('#native-zoom-value').inputValue());
  await page.locator('[data-modal-value="cancel"]').click();return value;
}

/**
 * Match original persistent native fitting through actual viewport changes.
 *
 * Thirty-six original COM percentages, independent UIA labels and unmodified
 * screenshot paper edges remain separate expected observations. Each fit mode
 * is selected once; later frames require actual resize observers to update it.
 * @async
 * @param {Page} page - Actual isolated public renderer or selected native application.
 * @param {NativeViewportResize} resize - Real browser or owned native-window size operation.
 * @param {string} outputRoot - Owned directory retaining complete unmodified actual PNGs.
 * @returns {Promise<Array<{id:string;mode:string;step:number;zoom:number;file:string;sha256:string}>>} Exact identities of every verified frame.
 * @throws {Error} If a native fit percentage, mode label, paper edge or original source changes.
 * @example
 * await exerciseNativeFitFrames(page,resize,outputRoot); // Resizing never reselects the mode to mask missing observers.
 */
export async function exerciseNativeFitFrames(page:Page,resize:NativeViewportResize,outputRoot:string):Promise<Array<{id:string;mode:string;step:number;zoom:number;file:string;sha256:string}>>{
  /** Expected values retain independent original native provenance rather than production calculations. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-fit-viewport.json','utf8')) as {groups:NativeFitGroup[]},records:Array<{id:string;mode:string;step:number;zoom:number;file:string;sha256:string}>=[];
  await mkdir(outputRoot,{recursive:true});
  for(/** Public imports preserve the original document's physical paper and authored source. */const group of fixture.groups){
    /** A source digest distinguishes the original controlled document from unrelated imported files. */
    const name='fit-'+group.id+'-'+group.sourceSha256.slice(0,8);
    await page.locator('#file-input').setInputFiles({name:name+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:group.page,doc:group.doc}))});
    await expect(page.locator('#toast')).toContainText(name);
    for(/** All later frames in a mode require persistent fitting through a real resize. */const frame of group.frames){
      await resize(frame.width,frame.height);
      if(frame.step===0)await page.locator('.native-statusbar [data-native-action="fit-'+frame.mode+'"]').click();
      await expect(page.locator('#zoom-reset')).toHaveText(frame.fitLabel);
      await expect.poll(
        /**
         * Read a settled fit percentage through actual public controls.
         *
         * No production measurement helper or injected zoom value supplies the result.
         * @async
         * @returns {Promise<number>} Observed current display percentage.
         * @example
         * // A changed viewport must expose the original native percentage.
         */
        async()=>nativeFitPercentage(page)).toBe(frame.zoom);
      await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');
      /** Exact source-colored and paper pixels are decoded from a complete actual screenshot. */
      const observed=await verifyNativePaperFrame(page,frame),file=path.join(outputRoot,name+'-'+frame.mode+'-'+frame.step+'.png');
      await writeFile(file,observed.png);expect(await page.locator('.tiptap').textContent()).toBe(group.sourceRows.join(''));
      expect(await page.locator('#zoom-reset').textContent()).toBe(frame.fitLabel);
      records.push({id:group.id,mode:frame.mode,step:frame.step,zoom:frame.zoom,file,sha256:createHash('sha256').update(observed.png).digest('hex')});
    }
  }
  expect(records.length).toBe(36);return records;
}

/**
 * Preserve persistent fitting, manual choices, authored content and undo behavior.
 *
 * Public controls cover cancellation, explicit numeric zoom, incremental zoom,
 * shell-only geometry, orientation undo and a real source edit followed by undo.
 * @async
 * @param {Page} page - Actual isolated public renderer or selected native application.
 * @param {NativeViewportResize} resize - Actual browser or owned native-window size operation.
 * @returns {Promise<void>} Resolves after independent view and source behavior remains correct.
 * @throws {Error} If a stale fit overrides manual zoom or view changes enter document undo history.
 * @example
 * await exerciseNativeFitBehavior(page,resize); // Undo removes the source edit while retaining the chosen view.
 */
export async function exerciseNativeFitBehavior(page:Page,resize:NativeViewportResize):Promise<void>{
  /** Original text remains independent from all display-only operations. */
  const original=await page.locator('.tiptap').textContent();
  await resize(1440,960);await page.locator('.native-statusbar [data-native-action="fit-page"]').click();
  expect(await nativeFitPercentage(page)).toBe(83);
  await page.locator('.native-ribbon-collapse').click();
  await expect.poll(
    /**
     * Observe fitting after a shell change without resizing the actual window.
     *
     * Collapsing the ribbon creates more physical page space.
     * @async
     * @returns {Promise<number>} Current public fit percentage.
     * @example
     * // A persistent page fit grows after the ribbon is collapsed.
     */
    async()=>nativeFitPercentage(page)).toBeGreaterThan(83);
  await page.locator('.native-ribbon-collapse').click();
  await expect.poll(
    /**
     * Observe the restored original shell's fit percentage.
     *
     * Restoring the ribbon requires another canvas observation without a window resize.
     * @async
     * @returns {Promise<number>} Public numeric percentage after shell restoration.
     * @example
     * // Restoring the reference shell restores its original 83-percent page fit.
     */
    async()=>nativeFitPercentage(page)).toBe(83);
  await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill('125');await page.locator('[data-modal-value="apply"]').click();
  await resize(1200,840);await expect(page.locator('#zoom-reset')).toHaveText('125%');
  expect(await nativeFitPercentage(page)).toBe(125);
  await page.locator('.native-statusbar [data-native-action="fit-width"]').click();
  /** The public numeric control establishes the incremental zoom's independent starting point. */
  const fitted=await nativeFitPercentage(page);
  await page.locator('#zoom-out').click();await resize(1440,960);await expect(page.locator('#zoom-reset')).toHaveText((fitted-10)+'%');
  await page.locator('.native-statusbar [data-native-action="fit-width"]').click();
  await page.locator('[data-native-tab="page"]').click();await page.locator('.native-ribbon [data-native-action="portrait"]').click();
  await expect.poll(
    /**
     * Observe fitting after an authored orientation change.
     *
     * The active width mode must use the new physical paper width.
     * @async
     * @returns {Promise<number>} Public numeric fit percentage after changing orientation.
     * @example
     * // A4 portrait requires 168 percent at the original viewport width.
     */
    async()=>nativeFitPercentage(page)).toBe(168);
  await page.locator('.tiptap').press('ControlOrMeta+z');
  await expect.poll(
    /**
     * Observe fitting after undo restores the authored paper orientation.
     *
     * View operations must not consume the document's page-history undo entry.
     * @async
     * @returns {Promise<number>} Public percentage for the restored landscape page.
     * @example
     * // Undo restores landscape width fitting at 120 percent.
     */
    async()=>nativeFitPercentage(page)).toBe(120);
  await page.locator('.tiptap').press('ControlOrMeta+End');await page.keyboard.type('fit-source-check');
  await page.locator('.native-statusbar [data-native-action="fit-page"]').click();await resize(1200,1000);
  await page.locator('.tiptap').press('ControlOrMeta+z');expect(await page.locator('.tiptap').textContent()).toBe(original);
  await expect(page.locator('#zoom-reset')).toHaveText('쪽 맞춤');
}
