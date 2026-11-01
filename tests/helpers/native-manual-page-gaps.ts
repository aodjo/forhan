import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Original cursor samples retain true page origins independently from renderer metadata. */
interface NativeGapPoint {page:number;x:number;y:number;sourceX:number;sourceY:number;}
/** Each physical width and page arrangement has its own original native observation. */
interface NativeGapObservation {shape:'single'|'two';pageWidthMillimetres:number;captureSha256:string;points:NativeGapPoint[];}
/** Shared DPI does not replace independently accepted manual percentage semantics. */
interface NativeGapCondition {percentage:number;dpi:number;observations:NativeGapObservation[];}

/**
 * Match original low-zoom page strides through actual public editor controls.
 *
 * Native cursor-to-source samples establish relative page origins for all
 * 23 low manual captions, two physical widths and both page arrangements.
 * Actual browser rectangles allow only ordinary layout quantization error.
 * Full screenshots remain unchanged; absolute vertical paper framing is a
 * separate claim. View changes preserve source text, saved state and one undo.
 *
 * @async
 * @param {Page} page - Actual browser or selected packaged native renderer.
 * @param {string} outputRoot - Owned directory for unchanged complete frames.
 * @returns {Promise<object[]>} All 92 completed native source-stride comparisons.
 * @throws {Error} If native page strides, source content or undo behavior differs.
 * @example
 * await exerciseNativeManualPageGaps(page,outputRoot); // Captions12 and13 retain distinct strides at12DPI.
 */
export async function exerciseNativeManualPageGaps(page:Page,outputRoot:string):Promise<object[]>{
  /** Required fixture source and native samples work without installed Hancom or ignored research. */
  const fixture=JSON.parse(await readFile(new URL('../fixtures/native-manual-page-gaps.json',import.meta.url),'utf8')) as {source:{doc:object;page:Record<string,number>;sourceRows:string[]};rows:NativeGapCondition[]},records:object[]=[];
  await mkdir(outputRoot,{recursive:true});
  for(
    /** Independently authored narrow paper is a physical geometry holdout. */
    const width of [180,210]
  )for(
    /** Single-column and two-column layouts retain different source cell arrangements. */
    const shape of ['single','two'] as const
  ){
    /** Public import supplies only authored page settings and source content. */
    const name=`native-manual-gap-${width}-${shape}`,source=fixture.source.sourceRows.join('');
    await page.locator('#file-input').setInputFiles({name:name+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...fixture.source.page,width},doc:fixture.source.doc}))});
    await expect(page.locator('#toast')).toContainText(name);await expect(page.locator('#toast')).toBeHidden();
    /** View-only operations cannot dirty a newly imported source document. */
    const saved=await page.locator('#save-state').textContent();
    for(
      /** Every integer manual caption retains its original independently observed source units. */
      const condition of fixture.rows
    ){
      await page.locator('#zoom-reset').click();await page.locator(`[name="native-page-shape"][value="${shape}"]`).check();await page.locator('[name="native-page-direction"][value="vertical"]').check();await page.locator('[name="native-zoom-mode"][value="custom"]').check();await page.locator('#native-zoom-value').fill(String(condition.percentage));await page.locator('[data-modal-value="apply"]').click();
      /** The original native source supplies relative viewport origins, never production layout formulas. */
      let observation:NativeGapObservation|undefined;
      for(
        /** Only an independently observed matching width and arrangement may supply expected geometry. */
        const candidate of condition.observations
      )if(candidate.shape===shape&&candidate.pageWidthMillimetres===width){observation=candidate;break;}
      assertNativeObservation(observation);
      /** Page two follows the first row in a two-column arrangement and the first page in a single column. */
      const index=shape==='two'?2:1,a=observation.points[0],b=observation.points[index],expected=(b.y-a.y)-(b.sourceY-a.sourceY)*condition.dpi/7200;
      await expect(
        /**
         * Observe native relative page geometry after the real layout settles.
         *
         * No expected position, style, source transaction or layout attribute is injected.
         * @async
         * @returns {Promise<void>} Resolves when native source strides agree within browser layout precision.
         * @throws {Error} If independently observed page movement differs.
         * @example
         * // A0.2-pixel native stride difference remains larger than the0.05-pixel layout tolerance.
         */
        async()=>{
          /** Live background rectangles expose rendered geometry instead of internal source-cell metadata. */
          const boxes=await page.locator('.native-sheet-background').evaluateAll(
            /**
             * Read actual physical page rectangle tops without changing the view.
             *
             * The independent original cursor samples supply all expected strides.
             * @param {Element[]} sheets - Actual rendered physical page backgrounds.
             * @returns {number[]} Current viewport top of each authored page.
             * @example
             * // Three original pages produce three actual rectangle tops.
             */
            sheets=>sheets.map(
              /**
               * Observe one current physical page position.
               *
               * Source and renderer state remain unchanged.
               * @param {Element} sheet - Actual owned page background.
               * @returns {number} Current viewport top in CSS pixels.
               * @example
               * sheet.getBoundingClientRect().top;
               */
              sheet=>sheet.getBoundingClientRect().top));
          expect(boxes).toHaveLength(3);expect(Math.abs(boxes[index]-boxes[0]-expected)).toBeLessThan(0.05);
        }).toPass({timeout:5000,intervals:[16,32,64,100]});
      await expect(page.locator('#zoom-reset')).toHaveText(condition.percentage+'%');expect(await page.locator('.tiptap').textContent()).toBe(source);expect(await page.locator('#save-state').textContent()).toBe(saved);
      /** Complete unmodified screenshots retain the original viewport and every physical paper. */
      const file=path.join(outputRoot,`${width}-${shape}-${condition.percentage}.png`),bytes=await page.screenshot({path:file});
      records.push({width,shape,percentage:condition.percentage,file,sha256:createHash('sha256').update(bytes).digest('hex'),expectedStride:expected,originalCaptureSha256:observation.captureSha256});
    }
  }
  await page.locator('.tiptap').press('ControlOrMeta+End');await page.keyboard.type('Z');await expect(page.locator('.tiptap')).toContainText('Z');await page.keyboard.press('ControlOrMeta+z');expect(await page.locator('.tiptap').textContent()).toBe(fixture.source.sourceRows.join(''));expect(records).toHaveLength(92);return records;
}

/**
 * Require the exact original native layout observation before comparing geometry.
 *
 * Missing reference data cannot silently bypass one physical width or arrangement.
 * @param {NativeGapObservation|undefined} observation - Matching original source condition.
 * @returns {asserts observation is NativeGapObservation} Establishes a complete required native reference.
 * @throws {Error} If the original source condition is absent.
 * @example
 * assertNativeObservation(observation); // Every width and arrangement requires real native evidence.
 */
function assertNativeObservation(observation:NativeGapObservation|undefined):asserts observation is NativeGapObservation{
  if(!observation)throw new Error('Required original native page-gap observation is missing.');
}
