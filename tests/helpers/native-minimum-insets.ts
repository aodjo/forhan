import {expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {JSONContent} from '@tiptap/core';
import type {PageSettings} from '../../src/types.ts';
import {DOCUMENT_START_KEY} from './native-keyboard.ts';
import {nativePaperGridPixels} from './native-paper-grid-pixels.ts';

/** Controlled original source remains separate from observed native frame coordinates. */
interface NativeMinimumSource {id:string;pageCount:number;page:PageSettings;doc:JSONContent;text:string;}
/** Literal native first-paper pixels cover both centered and overflowing long groups. */
interface NativeMinimumFrame {id:string;source:string;ratio:number;columns:number;viewport:{width:number;height:number};paper:{left:number;right:number;top:number;bottom:number};}
/** Independent original captures were collected only after freezing the source minimum-inset candidate. */
const FIXTURE=JSON.parse(readFileSync(new URL('../fixtures/native-paper-minimum-insets.json',import.meta.url),'utf8')) as {sources:NativeMinimumSource[];frames:NativeMinimumFrame[]};

/**
 * Compare actual first-paper pixels with independent original native captures.
 *
 * Public imports, view controls and real viewport changes produce all drawing.
 * The expected rectangles never enter the application, and source text, actual
 * page count and the clean document state remain unchanged. Later-page paint
 * edges have separate regressions and are not implied by this first-inset case.
 * @async
 * @param {Page} page - Actual browser or owned native application renderer.
 * @param {(width:number,height:number)=>Promise<void>} resize - Actual host viewport resizing operation.
 * @returns {Promise<void>} Resolves after all forty-eight original first-paper rectangles agree.
 * @throws {Error} If original pixels, source page count, text or clean state differ.
 * @example
 * await exerciseNativeMinimumInsets(page, resizeOwnedWindow);
 */
export async function exerciseNativeMinimumInsets(page:Page,resize:(width:number,height:number)=>Promise<void>):Promise<void>{
  await expect(page.locator('.tiptap')).toBeVisible({timeout:30000});
  for(/** Each imported controlled document retains its original decoded integer-unit geometry. */const source of FIXTURE.sources){
    /** A public portable input contains the original decoded source rather than any expected screen rectangle. */
    const filename=source.id+'.fhn';
    await page.locator('#file-input').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,title:source.id,page:source.page,doc:source.doc}))});
    await expect(page.locator('#toast')).toContainText(filename);
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('#paper')).toHaveAttribute('data-forhan-page-count',String(source.pageCount));
    /** View changes must not become authored edits or change the save indicator. */
    const pristine=await page.locator('#save-state').textContent();
    for(/** Original near and far first-paper edges are literal independent observations. */const frame of FIXTURE.frames){
      if(frame.source!==source.id)continue;
      await resize(frame.viewport.width,frame.viewport.height);
      await page.locator('#zoom-reset').click();
      await page.locator(`[name="native-page-shape"][value="${frame.columns===2?'two':'single'}"]`).check();
      await page.locator('[name="native-page-direction"][value="vertical"]').check();
      await page.locator('[name="native-zoom-mode"][value="custom"]').check();
      await page.locator('#native-zoom-value').fill(String(frame.ratio));
      await page.locator('[data-modal-value="apply"]').click();
      await page.locator('.tiptap').press(DOCUMENT_START_KEY);
      await page.keyboard.press('ArrowRight');
      await expect(
        /**
         * Observe completed real screenshot pixels after ordinary application observers settle.
         *
         * No style, origin, scale or expected-value hook is injected into the renderer.
         * @async
         * @returns {Promise<void>} Resolves when the original complete first-paper rectangle is visible.
         * @throws {Error} If actual white pixels differ from the original capture.
         * @example
         * // A missing minimum gap changes the observed top edge on long documents.
         */
        async()=>{
          /** The unmodified actual PNG supplies white-paper edges independently from DOM boxes. */
          const png=await page.screenshot(),papers=await page.evaluate(nativePaperGridPixels,{encoded:png.toString('base64'),minimumHeight:20});
          expect(papers[0],frame.id).toEqual(frame.paper);
        },
      ).toPass({timeout:5000,intervals:[16,32,64,100]});
      await expect(page.locator('.tiptap')).toHaveText(source.text);
      await expect(page.locator('#save-state')).toHaveText(pristine??'');
      await expect(page.locator('#paper')).toHaveAttribute('data-forhan-page-count',String(source.pageCount));
    }
  }
}
