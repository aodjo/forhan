import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {nativeShadePixels,type NativeShadePixelBox} from './helpers/native-shade-pixels.ts';
import {verifyEditableSheetCase} from './helpers/editable-sheets.ts';
import type {NativeBodyOriginFixture} from './helpers/native-body-grid-origin.ts';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';
import {contextualSourceText} from './helpers/contextual-width.ts';
import {minimumSpaceDocument} from './helpers/paragraph-minimum-space.ts';

/** Literal original frames retain independently observed device-pixel shade bounds and explicit caret occlusion. */
interface NativeShadeReference {
  id:string;name:'first'|'boundary';sourceSha256:string;captureSha256:string;zoomPercent:number;width:number;height:number;
  boxes:Array<Omit<NativeShadePixelBox,'pixels'>&{occludedLeft:boolean}>;
}

/**
 * Compare actual screen background coverage with six untouched original native frames.
 *
 * Original literal RGB extrema establish screen paint independently of layout
 * metadata or PDF coordinates. Native caret-covered left edges remain explicitly
 * unobserved. Foreground antialiasing and spelling marks are outside this claim.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after initial and twenty-line navigation frames retain original shade geometry.
 * @throws {Error} If native page movement or painted source-color bounds disagree.
 * @example
 * // A 10pt background at 125 percent retains independently rounded sixteen- and seventeen-pixel heights.
 */
async function verifyNativeShadeFrames({page}:{page:Page}):Promise<void>{
  test.setTimeout(90000);await page.goto('/');
  /** Original source and original frame observations have separate retained identities. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-body-grid-origin.json','utf8')) as {rows:NativeBodyOriginFixture[]},
    reference=JSON.parse(await readFile('tests/fixtures/native-editable-shading.json','utf8')) as {rows:NativeShadeReference[]};
  expect(reference.rows.length).toBe(6);
  for(/** Each frame is reached using public source import and ordinary source navigation. */const frame of reference.rows){
    /** Source identity binds observed native paint to the existing independently printed source fixture. */
    const row=fixture.rows.find(
      /**
       * Resolve only the original native source condition for this retained frame.
       *
       * No current renderer geometry supplies the expected source or bounds.
       * @param {NativeBodyOriginFixture} candidate - Original physical source condition.
       * @returns {boolean} Whether this original source owns the observed frame.
       * @example
       * // The zero-header frame cannot borrow the default body's source settings.
       */
      candidate=>candidate.id===frame.id)!;
    expect(row.nativeHwpSha256).toBe(frame.sourceSha256);
    await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
    await expect(page.locator('#toast')).toContainText(row.id);await verifyEditableSheetCase(page,row);
    await page.locator('.tiptap').press('ControlOrMeta+Home');
    if(frame.name==='boundary')for(let line=0;line<20;line++)await page.keyboard.press('ArrowDown');
    await expect(
      /**
       * Read current actual painted RGB coverage after dependent screen rasterization.
       *
       * Each attempt decodes a complete unmodified screenshot and checks all
       * original observed bounds; no drawing attribute can satisfy the oracle.
       * @async
       * @returns {Promise<void>} Resolves after all actual source-color extrema agree.
       * @throws {Error} If actual source coverage disagrees with the original frame.
       * @example
       * // An SVG reporting the right width while painting only fifty-four pixels fails.
       */
      async()=>{
        /** Screenshot bytes retain actual native viewport placement without registration or image edits. */
        const png=await page.screenshot(),actual=await page.evaluate(nativeShadePixels,png.toString('base64'));
        expect(actual.length,frame.id+' '+frame.name).toBe(frame.boxes.length);
        for(let index=0;index<actual.length;index++){
          /** Native caret-covered source pixels remain outside the independently observed left edge. */
          const box=actual[index],original=frame.boxes[index];
          expect(box.top).toBe(original.top);expect(box.bottom).toBe(original.bottom);expect(box.right).toBe(original.right);
          if(original.occludedLeft){expect(box.left).toBeLessThanOrEqual(original.left);expect(original.left-box.left).toBeLessThanOrEqual(2);}
          else expect(box.left).toBe(original.left);
        }
      }).toPass({timeout:5000,intervals:[16,32,64,100]});
  }
}

test('six original native screen frames preserve opaque shading bounds and twenty-line source navigation',verifyNativeShadeFrames);

/**
 * Edit shaded source across a native sheet boundary and verify independent saved containers.
 *
 * Real mouse and keyboard input select and replace the original two source
 * rows. One undo restores the complete original document including every color
 * mark; production HWPX, HWP and FHN output readers verify source separately.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after cross-page input, one undo and native source files agree.
 * @throws {Error} If screen paint steals source selection or introduces extra history or saved content.
 * @example
 * // Selecting row019 through row020 crosses physical sheet chrome without copying a drawing.
 */
async function verifyShadedSourceEditing({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Independent original source has one paragraph and four physical sheets. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-body-grid-origin.json','utf8')) as {rows:NativeBodyOriginFixture[]},row=fixture.rows[4];
  expect(row.id).toBe('default-g3288-p100-breaks');
  await page.locator('#file-input').setInputFiles({name:'shaded-editing.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
  await expect(page.locator('#toast')).toContainText('shaded-editing.fhn');await verifyEditableSheetCase(page,row);
  await page.locator('.tiptap forhan-line').filter({hasText:/^row019$/u}).click();await page.keyboard.press('Home');await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Shift+End');
  expect(await page.evaluate(
    /**
     * Read the actual browser source selection without accessing editor state.
     *
     * Owned background paint cannot become selectable authored Unicode.
     * @returns {string} Actual selected original source text.
     * @example
     * // A page gap contributes no copied source character.
     */
    ()=>getSelection()!.toString())).toBe('row019\nrow020');
  await page.keyboard.type('CHANGED');await expect(page.locator('.tiptap')).toContainText('CHANGED');await expect(page.locator('.tiptap')).not.toContainText('row020');
  await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap')).not.toContainText('CHANGED');await verifyEditableSheetCase(page,row);
  for(/** Every supported completed source container is inspected with its independent reader. */const format of ['hwpx','hwp','fhn'] as const){
    /** The ordinary export menu owns actual serialization and completed file creation. */
    const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator(`[data-export="${format==='fhn'?'forhan':format}"]`).click();
    /** Actual native bytes remain independent of paper and paint DOM. */
    const download=await pending,bytes=await readFile((await download.path())!),payload=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString());
    expect(contextualSourceText(payload.doc)).toBe(contextualSourceText(row.doc));expect(payload.doc.content.length).toBe(1);
    for(/** Every original source run retains its opaque native color after history restoration. */const run of payload.doc.content[0].content)if(run.type==='text')expect(run.marks).toContainEqual(expect.objectContaining({type:'textStyle',attrs:expect.objectContaining({backgroundColor:'#fff1a8'})}));
  }
}

test('shaded cross-page mouse selection, replacement, one undo and three native output formats retain original source',verifyShadedSourceEditing);

/**
 * Release shaded paper paint and let ordinary native source layout become idle.
 *
 * Importing an unshaded short paragraph restores its full native word gap.
 * Complete original paper/source DOM observation then rejects repeated idle
 * style or class writes that would continuously reset adaptive layout caches.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after document replacement releases paint and rendering settles.
 * @throws {Error} If old paint survives or idle ownership mutations keep resetting source geometry.
 * @example
 * // Removing a nonexistent paint class cannot start a new adaptive-spacing frame forever.
 */
async function verifyShadingReleaseAndIdle({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Original shaded source establishes a genuinely owned multiple-sheet paint layer before replacement. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-body-grid-origin.json','utf8')) as {rows:NativeBodyOriginFixture[]},row=fixture.rows[4],plain=minimumSpaceDocument({right:0,fontSpace:false,condense:75});
  await page.locator('#file-input').setInputFiles({name:'before-release.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:row.doc}))});
  await expect(page.locator('#toast')).toContainText('before-release.fhn');await verifyEditableSheetCase(page,row);await expect(page.locator('[data-forhan-sheet-shading]')).toHaveCount(1);
  plain.doc.content![0].content![0].text='ALPHA beta';
  await page.locator('#file-input').setInputFiles({name:'after-release.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plain))});
  await expect(page.locator('#toast')).toContainText('after-release.fhn');await expect(page.locator('.tiptap')).toHaveText('ALPHA beta');await expect(page.locator('[data-forhan-sheet-shading]')).toHaveCount(0);await expect(page.locator('.tiptap [data-forhan-condense-delta]')).toHaveAttribute('data-forhan-condense-delta','0');
  await expect(
    /**
     * Observe complete actual paper/source ownership over eight idle rendering frames.
     *
     * Each retry retains the same zero-mutation requirement after genuine
     * document and font work has settled; no rendering marker supplies success.
     * @async
     * @returns {Promise<void>} Resolves after the actual owned DOM remains idle.
     * @throws {Error} If idle class/style changes continue to reset native source layout.
     * @example
     * // An absent paint class stays absent without another ownership mutation.
     */
    async()=>{
      /** Only actual DOM mutations count; source-model or layout signatures are not the oracle. */
      const mutations=await page.locator('#paper').evaluate(
        /**
         * Count actual owned DOM writes while no user or source update occurs.
         *
         * Observer ownership is released after the bounded frame interval.
         * @param {HTMLElement} paper - Actual live source paper and outside-source paint host.
         * @returns {Promise<number>} Actual child, class and style mutation count over eight frames.
         * @example
         * // Stable native paper, paint and text wrappers produce zero writes.
         */
        (paper:HTMLElement)=>new Promise<number>(
          /**
           * Observe one bounded sequence of actual idle animation frames.
           *
           * The promise completes only after observation has been disconnected.
           * @param {(value:number)=>void} resolve - Receives the actual mutation count.
           * @returns {void} Starts only the owned read-only observation.
           * @example
           * // Rendering ownership cannot leak an observer beyond this check.
           */
          resolve=>{
            let writes=0,frames=0;
            /** Native source paint is observed without changing any source node or attribute. */
            const observer=new MutationObserver(
              /**
               * Count original actual paper/source mutations during idle observation.
               *
               * No mutation is filtered because a repeated no-op class write is significant.
               * @param {MutationRecord[]} records - Actual observed DOM ownership changes.
               * @returns {void} Accumulates only actual writes.
               * @example
               * // Repeated equal class attributes still count as active mutation.
               */
              records=>{writes+=records.length;});
            observer.observe(paper,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
            /**
             * Finish the owned observer after eight actual rendering frames.
             *
             * A finite frame interval leaves native source DOM untouched.
             * @returns {void} Continues the bounded observation or resolves its actual count.
             * @example
             * // The last frame disconnects observation before returning.
             */
            function frame():void{if(++frames<8)requestAnimationFrame(frame);else{observer.disconnect();resolve(writes);}}
            requestAnimationFrame(frame);
          }));
      expect(mutations).toBe(0);
    }).toPass({timeout:5000,intervals:[16,32,64,100]});
}

test('replacing shaded source releases owned paint and ordinary adaptive source reaches eight mutation-free idle frames',verifyShadingReleaseAndIdle);
