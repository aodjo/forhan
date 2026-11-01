import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {nativePaperGridPixels} from './native-paper-grid-pixels.ts';
import type {NativePixelBounds} from './native-paper-pixels.ts';
import type {NativeViewportResize} from './native-paper-scenarios.ts';

/** Literal original view conditions are independent from production projection calculations. */
interface NativePageViewFrame {
  id:string;width:number;height:number;zoom:number;requestedZoom:number;
  choice:'custom'|'width'|'page';
  view:{shape:'auto'|'single'|'two'|'facing'|'multiple';columns:number;rows:number;direction:'vertical'|'horizontal';horizontalWheel:boolean};
  papers:NativePixelBounds[];
}
/** Authored source and literal original capture conditions enter the actual public importer. */
interface NativePageViewGroup {id:string;page:object;doc:object;sourceRows:string[];frames:NativePageViewFrame[];}

/**
 * Apply one original page-view condition through actual public dialog controls.
 *
 * Multiple-page selection initially chooses page fitting. The explicit observed
 * scale choice is applied afterward, preserving the native control dependency.
 * @async
 * @param {Page} page - Actual public renderer or selected native window.
 * @param {NativePageViewFrame} frame - Literal independently observed native condition.
 * @returns {Promise<void>} Resolves after the explicit accepted view is displayed.
 * @example
 * await applyNativePageViewFrame(page,frame); // No expected geometry enters the renderer.
 */
export async function applyNativePageViewFrame(page:Page,frame:NativePageViewFrame):Promise<void>{
  await page.locator('#zoom-reset').click();
  await page.locator(`[name="native-page-shape"][value="${frame.view.shape}"]`).check();
  if(frame.view.shape==='multiple'){
    await page.locator('#native-zoom-columns').fill(String(frame.view.columns));
    await page.locator('#native-zoom-rows').fill(String(frame.view.rows));
  }
  await page.locator(`[name="native-page-direction"][value="${frame.view.direction}"]`).check();
  if(frame.view.direction==='horizontal')await page.locator('[name="native-zoom-wheel"]').setChecked(frame.view.horizontalWheel);
  await page.locator(`[name="native-zoom-mode"][value="${frame.choice}"]`).check();
  if(frame.choice==='custom')await page.locator('#native-zoom-value').fill(String(frame.requestedZoom));
  await page.locator('[data-modal-value="apply"]').click();
}

/**
 * Match thirty-four original native page-view frames without altering screenshot pixels.
 *
 * Complete original white-paper components establish physical page placement.
 * Three authored sources cover nine-page direction behavior, facing-page blank
 * cells, automatic rows and fitted grids. Foreground font equality is separate.
 * @async
 * @param {Page} page - Actual public renderer or selected native application.
 * @param {NativeViewportResize} resize - Real browser or owned native-window resize.
 * @param {string} outputRoot - Owned completed-frame artifact directory.
 * @returns {Promise<object[]>} Original identities of all completed actual frames.
 * @throws {Error} If an original paper pixel, zoom or authored source differs.
 * @example
 * await exerciseNativePageViewFrames(page,resize,outputRoot);
 */
export async function exerciseNativePageViewFrames(page:Page,resize:NativeViewportResize,outputRoot:string):Promise<object[]>{
  /** Literal fixture data remains independent from every production grid formula. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-page-view.json','utf8')) as {groups:NativePageViewGroup[]},records:object[]=[];
  await mkdir(outputRoot,{recursive:true});
  for(/** Each authored source enters the actual public file importer unchanged. */const group of fixture.groups){
    await page.locator('#file-input').setInputFiles({name:group.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:group.page,doc:group.doc}))});
    await expect(page.locator('#toast')).toContainText(group.id);await expect(page.locator('#toast')).toBeHidden();
    for(/** Every frame uses actual public controls and an independent original complete-image oracle. */const frame of group.frames){
      await resize(frame.width,frame.height);await applyNativePageViewFrame(page,frame);
      await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');
      let completed:Buffer|undefined;
      await expect(
        /**
         * Observe completed actual paper pixels after asynchronous source projection.
         *
         * Retries only read screenshots; no corrective source or expected coordinates are injected.
         * @async
         * @returns {Promise<void>} Resolves after exact independent physical paper coverage agrees.
         * @example
         * // A nine-page horizontal multi-page grid must retain native vertical rows.
         */
        async()=>{
          /** Actual full-frame PNG bytes retain every original coordinate and channel. */
          const png=await page.screenshot(),papers=await page.evaluate(nativePaperGridPixels,png.toString('base64'));
          expect(papers).toEqual(frame.papers);completed=png;
          await expect(page.locator('#zoom-reset')).toHaveText(frame.choice==='custom'?frame.zoom+'%':frame.choice==='width'?'폭 맞춤':'쪽 맞춤');
        }).toPass({timeout:5000,intervals:[16,32,64,100]});
      expect(await page.locator('.tiptap').textContent()).toBe(group.sourceRows.join(''));
      /** Every completed PNG is retained unchanged alongside its independently calculated identity. */
      const file=path.join(outputRoot,group.id+'-'+frame.id+'.png');await writeFile(file,completed!);
      records.push({id:group.id,frame:frame.id,file,sha256:createHash('sha256').update(completed!).digest('hex')});
    }
  }
  expect(records).toHaveLength(34);return records;
}

/**
 * Verify native zoom drafts, original control geometry and actual page navigation.
 *
 * Cancelled drafts leave the accepted view and original source untouched. Real
 * next-page controls move the actual caret, while wheel preferences move only
 * the physical viewport. A source edit retains one-step undo across a view change.
 * @async
 * @param {Page} page - Actual public renderer or selected native application.
 * @returns {Promise<void>} Resolves after independent source and public view behavior agree.
 * @throws {Error} If a native control rectangle, draft dependency, source edit or view operation fails.
 * @example
 * await exerciseNativeZoomBehavior(page); // Right-hand pages own their actual source caret and ruler.
 */
export async function exerciseNativeZoomBehavior(page:Page):Promise<void>{
  /** A fresh independently authored nine-page source exposes real navigation beyond one viewport. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-page-view.json','utf8')) as {groups:NativePageViewGroup[]},group=fixture.groups[2],
    geometry=JSON.parse(await readFile('tests/fixtures/native-zoom-controls.json','utf8')) as {width:number;height:number;controls:Array<{selector:string;bounds:{left:number;top:number;width:number;height:number}}>},
    source=group.sourceRows.join('');
  await page.locator('#file-input').setInputFiles({name:'native-view-behavior.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:group.page,doc:group.doc}))});
  await expect(page.locator('#toast')).toContainText('native-view-behavior');
  /** The initial accepted condition precedes every independent dialog draft. */
  const initial:NativePageViewFrame={id:'behavior',width:1440,height:960,zoom:125,requestedZoom:125,choice:'custom',view:{shape:'single',columns:1,rows:1,direction:'vertical',horizontalWheel:false},papers:[]};
  await applyNativePageViewFrame(page,initial);await page.locator('#zoom-reset').click();
  /** Complete outer dialog dimensions and all twenty-four literal UIA rectangles must agree. */
  const outer=(await page.locator('.native-dialog-zoom').boundingBox())!;expect(outer.width).toBe(geometry.width);expect(outer.height).toBe(geometry.height);
  for(/** Original UIA rectangles are checked independently from production CSS values. */const control of geometry.controls){
    /** Actual live bounding boxes retain their original unmodified viewport coordinates. */
    const box=(await page.locator('.native-dialog-zoom').locator(control.selector).boundingBox())!;
    expect({left:box.x-outer.x,top:box.y-outer.y,width:box.width,height:box.height}).toEqual(control.bounds);
  }
  await expect(page.locator('#native-zoom-value')).toBeDisabled();await page.locator('[name="native-zoom-mode"][value="custom"]').check();
  await page.locator('#native-zoom-value').fill('137');await page.locator('[name="native-zoom-mode"][value="100"]').check();
  await expect(page.locator('#native-zoom-value')).toHaveValue('137');await expect(page.locator('#native-zoom-value')).toBeDisabled();
  await page.locator('[name="native-page-shape"][value="multiple"]').check();await expect(page.locator('[name="native-zoom-mode"][value="page"]')).toBeChecked();
  await page.locator('#native-zoom-columns').fill('2');await page.locator('#native-zoom-rows').fill('2');
  await page.locator('#native-zoom-columns').fill('9');await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.native-dialog-zoom')).toBeVisible();await expect(page.locator('#zoom-reset')).toHaveText('125%');
  await page.locator('#native-zoom-columns').fill('2');
  await page.locator('[name="native-zoom-mode"][value="125"]').check();await expect(page.locator('[name="native-page-shape"][value="multiple"]')).toBeChecked();
  await page.locator('[data-modal-value="cancel"]').press('Enter');await expect(page.locator('.native-dialog-zoom')).toHaveCount(0);await expect(page.locator('#zoom-reset')).toHaveText('125%');
  await applyNativePageViewFrame(page,{...initial,requestedZoom:50,zoom:50,view:{...initial.view,shape:'two',columns:2}});
  await page.locator('.tiptap').press('ControlOrMeta+Home');await page.locator('[data-scroll-command="next"]').click();
  await expect(page.locator('.native-status-page')).toHaveText('2/9쪽');
  /** The ruler and native source caret follow the actual right-hand page rather than a vertical stride. */
  const ruler=(await page.locator('.ruler').boundingBox())!,second=(await page.locator('.native-sheet-background').nth(1).boundingBox())!;
  expect(Math.abs(ruler.x+ruler.width/2-second.x-second.width/2)).toBeLessThan(2);
  await page.locator('[data-scroll-command="previous"]').click();await expect(page.locator('.native-status-page')).toHaveText('1/9쪽');
  await page.locator('[data-scroll-command="select"]').click();await page.locator('#native-scroll-page-number').fill('9');await page.locator('[data-scroll-command="apply"]').click();
  await expect(page.locator('.native-status-page')).toHaveText('9/9쪽');await page.keyboard.type('Z');
  await expect(page.locator('.tiptap')).toContainText('Zpage09');
  await applyNativePageViewFrame(page,{...initial,requestedZoom:75,zoom:75,view:{...initial.view,shape:'facing',columns:2}});
  await page.locator('.tiptap').press('ControlOrMeta+z');expect(await page.locator('.tiptap').textContent()).toBe(source);await expect(page.locator('#zoom-reset')).toHaveText('75%');
  await applyNativePageViewFrame(page,{...initial,requestedZoom:50,zoom:50,view:{...initial.view,direction:'horizontal',horizontalWheel:true}});
  await page.locator('.tiptap').press('ControlOrMeta+Home');await page.mouse.move(100,500);
  /** Native wheel input must move the real canvas rather than merely retaining a checkbox draft. */
  const before=await page.locator('.canvas').evaluate(readNativeCanvasScroll);await page.mouse.wheel(0,360);
  await expect.poll(
    /**
     * Observe actual physical horizontal wheel progress.
     *
     * No source transaction or rendering metadata can substitute for scrollLeft.
     * @async
     * @returns {Promise<number>} Actual current horizontal document offset.
     * @example
     * // A real wheel event advances through the nine horizontal source papers.
     */
    async()=>(await page.locator('.canvas').evaluate(readNativeCanvasScroll)).left).toBeGreaterThan(before.left);
  await page.locator('#zoom-reset').click();await page.locator('[name="native-page-direction"][value="vertical"]').check();
  await expect(page.locator('[name="native-zoom-wheel"]')).toBeChecked();await expect(page.locator('[name="native-zoom-wheel"]')).toBeDisabled();
  await page.locator('[data-modal-value="apply"]').click();await page.locator('.tiptap').press('ControlOrMeta+Home');await page.mouse.move(100,500);await page.mouse.wheel(0,360);
  await expect.poll(
    /**
     * Observe restored ordinary vertical wheel behavior.
     *
     * A retained disabled horizontal preference cannot consume vertical view input.
     * @async
     * @returns {Promise<number>} Actual current vertical document offset.
     * @example
     * // The original source remains unchanged while the vertical viewport advances.
     */
    async()=>(await page.locator('.canvas').evaluate(readNativeCanvasScroll)).top).toBeGreaterThan(0);
  expect(await page.locator('.tiptap').textContent()).toBe(source);
  await applyNativePageViewFrame(page,{...initial,requestedZoom:50,zoom:50,view:{...initial.view,shape:'two',columns:2}});
  await page.locator('.tiptap').press('ControlOrMeta+End');await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.native-sheet-background')).toHaveCount(10);await expect(page.locator('.native-status-page')).toHaveText('10/10쪽');
  await page.keyboard.type('N');await expect(page.locator('.tiptap')).toContainText('N');
  await expect(
    /**
     * Observe completed physical glyph layout after the actual source insertion.
     *
     * Original text remains unchanged while asynchronous native source drawing reaches its next frame.
     * @async
     * @returns {Promise<void>} Resolves after the genuine source glyph belongs to the actual right-hand paper.
     * @example
     * // A permanent return to vertical source flow cannot satisfy this physical glyph assertion.
     */
    async()=>{
  /** Genuine authored source glyphs must remain inside the newly created right-hand paper. */
  const destination=(await page.locator('.native-sheet-background').nth(9).boundingBox())!,glyph=await page.locator('.tiptap').evaluate(
    /**
     * Observe the actual newly typed source glyph rather than a generated caret widget.
     *
     * A real text range excludes independent SVG copies and source-free drawing layers.
     * @param {HTMLElement} root - Actual original source root after typing.
     * @returns {{left:number;right:number;top:number;bottom:number}|null} Actual physical source glyph bounds.
     * @example
     * // The first key on an empty right-hand continuation cannot return to the left paper.
     */
    (root:HTMLElement)=>{
      /** Original source leaves retain their own browser insertion coordinates. */
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let last:Text|null=null;
      while(walker.nextNode())if(!walker.currentNode.parentElement?.closest('svg,[contenteditable="false"]'))last=walker.currentNode as Text;
      if(!last?.data.endsWith('N'))return null;
      /** The actual newly inserted final source character supplies the observed physical rectangle. */
      const range=document.createRange();range.setStart(last,last.length-1);range.setEnd(last,last.length);return range.getBoundingClientRect().toJSON();
    });
  expect(glyph).not.toBeNull();expect(glyph!.left).toBeGreaterThan(destination.x);expect(glyph!.right).toBeLessThan(destination.x+destination.width);
  expect(glyph!.top).toBeGreaterThan(destination.y);expect(glyph!.bottom).toBeLessThan(destination.y+destination.height);
    }).toPass({timeout:5000,intervals:[16,32,64,100]});
  await page.locator('.tiptap').press('ControlOrMeta+z');expect(await page.locator('.tiptap').textContent()).toBe(source);await expect(page.locator('.native-sheet-background')).toHaveCount(9);
}

/**
 * Read actual physical document scroll offsets without changing source or selection.
 *
 * Browser-native offsets establish wheel behavior independently from view markers.
 * @param {HTMLElement} canvas - Actual owned scrolling document canvas.
 * @returns {{left:number;top:number}} Original native horizontal and vertical offsets.
 * @example
 * await page.locator('.canvas').evaluate(readNativeCanvasScroll);
 */
function readNativeCanvasScroll(canvas:HTMLElement):{left:number;top:number}{return{left:canvas.scrollLeft,top:canvas.scrollTop};}
