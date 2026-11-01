import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {nativePaperGridPixels} from './native-paper-grid-pixels.ts';
import {nativePaperGridShades} from './native-paper-grid-shades.ts';
import type {NativePixelBounds} from './native-paper-pixels.ts';
import type {NativeViewportResize} from './native-paper-scenarios.ts';

/** Literal native margin boundaries retain independently observed paper and vertical source paint. */
interface NativeMarginFrame {ratio:number;delta:number;topMargin:number;captureSha256:string;papers:NativePixelBounds[];bands:Array<Array<{top:number;bottom:number}>>;}
/** Small-scale originals establish horizontal coverage separately from unresolved vertical framing. */
interface NativeSmallFrame {ratio:number;captureSha256:string;papers:NativePixelBounds[];topMargin?:never;delta?:never;bands?:never;}

/**
 * Exercise native integer-unit shade origins and minimum visible page gaps.
 *
 * All expected coordinates originate in complete original native captures.
 * Actual public imports and zoom controls supply source and view conditions;
 * no expected coordinate or renderer layout metadata enters the application.
 * Vertical glyph coverage and small-scale paper height remain separate claims.
 * @async
 * @param {Page} page - Actual browser or packaged desktop renderer.
 * @param {NativeViewportResize} resize - Real browser or owned native-window resize.
 * @param {string} outputRoot - Owned destination for unchanged completed screenshots.
 * @returns {Promise<object[]>} Nineteen complete actual frame identities.
 * @throws {Error} If an observed native edge, page count or source content differs.
 * @example
 * await exerciseNativePaperFraming(page,resize,outputRoot); // A one-unit margin change crosses the original 85-percent shade boundary.
 */
export async function exerciseNativePaperFraming(page:Page,resize:NativeViewportResize,outputRoot:string):Promise<object[]>{
  /** Fixture source is independently authored and its literal expectations never depend on production geometry. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-paper-framing.json','utf8')) as {source:{id:string;page:Record<string,number>;doc:object;sourceRows:string[]};frames:NativeMarginFrame[];small:NativeSmallFrame[]},records:object[]=[];
  await mkdir(outputRoot,{recursive:true});await resize(1440,960);
  for(/** Margin variants preserve the source container's other original physical settings. */const frame of [...fixture.frames,...fixture.small]){
    /** The public document importer receives source units converted to its ordinary millimetre setting. */
    const margin=typeof frame.topMargin==='number',settings={...fixture.source.page,...(margin?{marginTop:frame.topMargin*25.4/7200}:{})},name=`native-framing-${frame.ratio}-${margin?frame.delta:'gap'}`;
    await page.locator('#file-input').setInputFiles({name:name+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:settings,doc:fixture.source.doc}))});
    await expect(page.locator('#toast')).toContainText(name);await expect(page.locator('#toast')).toBeHidden();
    await page.locator('#zoom-reset').click();await page.locator('[name="native-page-shape"][value="two"]').check();
    await page.locator('[name="native-page-direction"][value="vertical"]').check();await page.locator('[name="native-zoom-mode"][value="custom"]').check();
    await page.locator('#native-zoom-value').fill(String(frame.ratio));await page.locator('[data-modal-value="apply"]').click();
    await page.locator('.tiptap').press('ControlOrMeta+Home');await page.keyboard.press('ArrowRight');
    let completed:Buffer|undefined;
    await expect(
      /**
       * Read complete actual pixels after asynchronous drawing settles.
       *
       * Every retry observes the same public condition without corrective injection.
       * @async
       * @returns {Promise<void>} Resolves when all independently observed native edges agree.
       * @throws {Error} If a physical paper or source shade edge differs.
       * @example
       * // Ten-percent papers must be observed rather than silently discarded by a fifty-pixel height filter.
       */
      async()=>{
        /** Small components retain the same original-pixel area and width floors. */
        const png=await page.screenshot(),encoded=png.toString('base64'),papers=await page.evaluate(nativePaperGridPixels,{encoded,minimumHeight:20});
        expect(papers).toHaveLength(3);
        for(let index=0;index<papers.length;index++){
          expect(papers[index].left).toBe(frame.papers[index].left);expect(papers[index].right).toBe(frame.papers[index].right);
          if(margin){expect(papers[index].top).toBe(frame.papers[index].top);expect(papers[index].bottom).toBe(frame.papers[index].bottom);}
        }
        if(margin){
          /** Source shades are decoded from literal RGB independently from physical paper metadata. */
          const paint=await page.evaluate(nativePaperGridShades,{encoded,papers});expect(paint.outsidePixels).toBe(0);
          for(let index=0;index<papers.length;index++){
            expect(paint.papers[index]).toHaveLength(frame.bands[index].length);
            for(let line=0;line<frame.bands[index].length;line++){
              expect(paint.papers[index][line].top).toBe(frame.bands[index][line].top);
              expect(paint.papers[index][line].bottom).toBe(frame.bands[index][line].bottom);
            }
          }
        }
        completed=png;
      }).toPass({timeout:5000,intervals:[16,32,64,100]});
    expect(await page.locator('.tiptap').textContent()).toBe(fixture.source.sourceRows.join(''));
    /** Unchanged complete frames retain original coordinates and cryptographic identities. */
    const file=path.join(outputRoot,name+'.png');await writeFile(file,completed!);
    records.push({name,file,sha256:createHash('sha256').update(completed!).digest('hex'),originalCaptureSha256:frame.captureSha256});
  }
  expect(records).toHaveLength(19);return records;
}
