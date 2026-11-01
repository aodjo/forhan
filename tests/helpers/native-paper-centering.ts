import {expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {nativePaperGridPixels} from './native-paper-grid-pixels.ts';
import type {NativePixelBounds} from './native-paper-pixels.ts';
import type {NativeViewportResize} from './native-paper-scenarios.ts';

/** Independently observed native bounds cover even and odd viewport heights. */
interface NativeCenteringFrame {id:string;width:number;ratio:number;columns:number;viewport:{width:number;height:number};papers:NativePixelBounds[];captureSha256:string;}

/**
 * Compare complete paper bodies with original native viewport holdouts.
 *
 * Public source import, view controls and actual window resizing establish
 * every condition. Literal expected pixels come from unchanged original
 * captures. Each observation also verifies unchanged original source text.
 * @async
 * @param {Page} page - Actual browser or selected native application renderer.
 * @param {NativeViewportResize} resize - Real viewport or owned native-window resize.
 * @param {string} outputRoot - Owned destination for unchanged actual frames.
 * @returns {Promise<object[]>} Complete frame identities for all 32 original conditions.
 * @throws {Error} If any paper bound, page count or source text differs.
 * @example
 * await exerciseNativePaperCentering(page,resize,outputRoot);
 */
export async function exerciseNativePaperCentering(page:Page,resize:NativeViewportResize,outputRoot:string):Promise<object[]>{
  /** Checked source and literal native pixels never depend on production centering calculations. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-paper-centering.json','utf8')) as {source:{page:Record<string,number>;doc:object;sourceRows:string[]};rows:NativeCenteringFrame[]},records:object[]=[];
  let sourceWidth=0;
  await mkdir(outputRoot,{recursive:true});
  for(/** Each width is imported once while every actual view condition remains independent. */const frame of fixture.rows){
    if(sourceWidth!==frame.width){
      /** Public source loading preserves the same independently authored three-page document. */
      const name='native-centering-'+frame.width;
      await page.locator('#file-input').setInputFiles({name:name+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...fixture.source.page,width:frame.width},doc:fixture.source.doc}))});
      await expect(page.locator('#toast')).toContainText(name);await expect(page.locator('#toast')).toBeHidden();sourceWidth=frame.width;
    }
    await resize(frame.viewport.width,frame.viewport.height);
    await page.locator('#zoom-reset').click();await page.locator('[name="native-page-shape"][value="'+(frame.columns===2?'two':'single')+'"]').check();
    await page.locator('[name="native-page-direction"][value="vertical"]').check();await page.locator('[name="native-zoom-mode"][value="custom"]').check();
    await page.locator('#native-zoom-value').fill(String(frame.ratio));await page.locator('[data-modal-value="apply"]').click();
    await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');
    let completed:Buffer|undefined;
    await expect(
      /**
       * Observe complete actual paper pixels after asynchronous layout settles.
       *
       * Retries supply no geometry or corrective style to the application.
       * @async
       * @returns {Promise<void>} Resolves when every independently observed bound agrees.
       * @throws {Error} If a physical paper body differs from the original capture.
       * @example
       * // Odd viewport heights exercise a different native centering boundary.
       */
      async()=>{
        /** Complete unedited frame bytes retain all original viewport coordinates. */
        const png=await page.screenshot(),papers=await page.evaluate(nativePaperGridPixels,{encoded:png.toString('base64'),minimumHeight:20});
        expect(papers).toEqual(frame.papers);completed=png;
      }).toPass({timeout:5000,intervals:[16,32,64,100]});
    expect(await page.locator('.tiptap').textContent()).toBe(fixture.source.sourceRows.join(''));
    /** Actual full frames remain separate from the literal original expected fixture. */
    const file=path.join(outputRoot,frame.id+'.png');await writeFile(file,completed!);
    records.push({id:frame.id,file,sha256:createHash('sha256').update(completed!).digest('hex'),originalCaptureSha256:frame.captureSha256});
  }
  expect(records).toHaveLength(32);return records;
}
