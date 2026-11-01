import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyNativePaperFrame,nativeSourceCaretOffset,type NativePaperViewportGroup} from './native-paper-viewport.ts';

/**
 * Resize an actual browser viewport or owned native window.
 *
 * Application observers retain responsibility for updating their dependent
 * geometry without injecting source changes or expected layout coordinates.
 * @param {number} width - Requested actual viewport width in CSS pixels.
 * @param {number} height - Requested actual viewport height in CSS pixels.
 * @returns {Promise<void>} Resolves after the selected runtime applies the actual viewport dimensions.
 * @example
 * await resize(1440,961); // A viewport change leaves the authored document unchanged.
 */
export type NativeViewportResize=(width:number,height:number)=>Promise<void>;

/**
 * Exercise independently observed native paper geometry through public document controls.
 *
 * Eighty-two original frames cover relative fonts, all seven public display
 * scales, four paper sizes, changing even/odd viewport heights and multiple
 * physical pages. Completed screenshots retain exact observable paper edges;
 * authored source text remains unchanged through every display-only operation.
 * @async
 * @param {Page} page - Actual isolated public renderer or selected native application window.
 * @param {NativeViewportResize} resize - Actual browser or native-window viewport operation.
 * @param {string} outputRoot - Test-owned directory retaining actual unmodified screenshots.
 * @returns {Promise<Array<{id:string;zoom:number;height:number;file:string;sha256:string}>>} Exact identities of all verified actual frames.
 * @throws {Error} If physical paper geometry changes or an operation edits original source text.
 * @example
 * await exerciseNativePaperFrames(page,resize,outputRoot); // Source-only page attributes cannot substitute for actual paper pixels.
 */
export async function exerciseNativePaperFrames(page:Page,resize:NativeViewportResize,outputRoot:string):Promise<Array<{id:string;zoom:number;height:number;file:string;sha256:string}>>{
  /** Literal original screen observations remain separate from production layout code. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-paper-viewport.json','utf8')) as {groups:NativePaperViewportGroup[]},records:Array<{id:string;zoom:number;height:number;file:string;sha256:string}>=[];
  await mkdir(outputRoot,{recursive:true});
  for(/** Each original authored document enters the actual public importer. */const group of fixture.groups){
    /** A source hash in the import name distinguishes different original documents with the same human-readable label. */
    const name=group.id+'-'+group.sourceSha256.slice(0,8);
    await page.locator('#file-input').setInputFiles({name:name+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:group.page,doc:group.doc}))});
    await expect(page.locator('#toast')).toContainText(name);
    for(/** Every original viewport condition exercises actual native document zoom and window geometry. */const frame of group.frames){
      await resize(frame.width,frame.height);
      await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill(String(frame.zoom));await page.locator('[data-modal-value="apply"]').click();
      await expect(page.locator('#zoom-reset')).toHaveText(frame.zoom+'%');await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');
      /** Real source and original frame pixels establish completion independently from layout metadata. */
      const observed=await verifyNativePaperFrame(page,frame),file=path.join(outputRoot,name+'-'+frame.height+'-'+frame.zoom+'.png');
      await writeFile(file,observed.png);expect(await page.locator('.tiptap').textContent()).toBe(group.sourceRows.join(''));
      records.push({id:name,zoom:frame.zoom,height:frame.height,file,sha256:createHash('sha256').update(observed.png).digest('hex')});
    }
  }
  expect(records.length).toBe(82);return records;
}

/**
 * Preserve source navigation and actual shade alignment across resize-only operations.
 *
 * Original even/odd native captures establish exact paint without another zoom
 * action masking stale viewport alignment. Vertical movement retains its
 * original paper-relative column after the window moves the paper horizontally.
 * @async
 * @param {Page} page - Actual isolated public renderer or selected native application window.
 * @param {NativeViewportResize} resize - Actual browser or native-window viewport operation.
 * @returns {Promise<void>} Resolves after native source paint, caret columns and original text remain intact.
 * @throws {Error} If a viewport-only change leaves stale paint or changes the source caret's intended column.
 * @example
 * await exerciseNativePaperResize(page,resize); // The next ArrowDown retains "X ii|iiii" instead of jumping to line end.
 */
export async function exerciseNativePaperResize(page:Page,resize:NativeViewportResize):Promise<void>{
  /** These original source conditions share the same literal native font, margins and five source lines. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-paper-viewport.json','utf8')) as {groups:NativePaperViewportGroup[]};
  let group:NativePaperViewportGroup|undefined;
  for(/** The original single-page document contains all required independent even and odd viewport observations. */const candidate of fixture.groups)if(candidate.id==='a4-portrait')group=candidate;
  expect(group).toBeDefined();
  await resize(1440,960);await page.locator('#file-input').setInputFiles({name:'resize-only-native.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:group!.page,doc:group!.doc}))});
  await expect(page.locator('#toast')).toContainText('resize-only-native');await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill('50');await page.locator('[data-modal-value="apply"]').click();
  await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');
  for(/** No zoom, source update or focus action may hide stale native raster alignment after a genuine resize. */const height of [841,960,961,840,960]){
    let original;
    for(/** Exact independent observations supply each requested original window condition. */const frame of group!.frames)if(frame.zoom===50&&frame.height===height)original=frame;
    expect(original).toBeDefined();await resize(1440,height);await verifyNativePaperFrame(page,original!,true);
  }
  await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill('125');await page.locator('[data-modal-value="apply"]').click();
  await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
  expect(await page.locator('.tiptap').evaluate(nativeSourceCaretOffset)).toBe(9);
  await resize(1200,960);await page.locator('.tiptap').press('ArrowDown');
  expect(await page.locator('.tiptap').evaluate(nativeSourceCaretOffset)).toBe(13);
  expect(await page.locator('.tiptap').textContent()).toBe(group!.sourceRows.join(''));
}
