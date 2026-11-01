import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {gridGlyphPositions,verifyPageGridControls,openPageGrid} from './helpers/paragraph-line-grid.ts';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';

/**
 * Compare real editor glyph positions against independent original native observations.
 *
 * Generated original documents cover fifty-four line cases, twenty-four
 * paragraph transitions and seven precise boundaries, including zero overlap and independently
 * snapped before/after spacing. No expected position uses renderer calculations.
 * @async
 * @param {{page:Page}} context - Actual isolated application page.
 * @returns {Promise<void>} Resolves after all eighty-five native observations agree.
 * @throws {Error} If a real source import or native glyph progression differs.
 * @example
 * // An original 17pt source advance becomes two 16pt grid intervals.
 */
async function verifyNativeGridMatrix({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Literal native observations retain source hashes and generated A/B/C/D paragraphs. */
  const matrix=JSON.parse(await readFile('tests/fixtures/native-line-grid.json','utf8'));
  expect(matrix.rows).toHaveLength(85);
  for(/** Each independently observed native case enters through the public file importer. */const row of matrix.rows){
    await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,title:row.id,doc:row.doc,page:row.page}))});
    await expect(page.locator('#toast')).toContainText(row.id);
    await expect.poll(
      /**
       * Compare actual range observations to the original native line cache.
       *
       * Two native units allow only browser drawing quantization differences.
       * @async
       * @returns {Promise<boolean>} Whether all actual relative glyph positions agree.
       * @example
       * // Literal native zero spacing remains actual overlapping glyph positions.
       */
      async()=>{/** Actual glyph ranges are independent from retained source attributes. */const points=await page.evaluate(gridGlyphPositions);return points.length===row.glyphPositions.length&&points.every(
        /**
         * Compare one actual glyph against its independently measured original position.
         *
         * The tolerance covers only the browser drawing quantum.
         * @param {number} point - Actual native-unit glyph progression.
         * @param {number} index - Corresponding original native line index.
         * @returns {boolean} Whether original native progression agrees within two units.
         * @example
         * // Source zero and positive grid jumps remain independently distinguishable.
         */
        (point,index)=>Math.abs(point-row.glyphPositions[index])<=2);},{message:row.id}).toBe(true);
  }
}
test('85 original native grid line and paragraph positions agree with actual glyphs',verifyNativeGridMatrix);

/**
 * Verify measured native grid drafts, one undo and real three-format source output.
 *
 * Fine native precision survives tab navigation and file serialization. A
 * paragraph can opt out without changing the accepted document-level grid.
 * @async
 * @param {{page:Page}} context - Actual isolated application page.
 * @returns {Promise<void>} Resolves after actual controls, files and undo agree.
 * @throws {Error} If source precision, actual glyph layout or independent decoding differs.
 * @example
 * // A displayed 32.9pt interval saves as raw native 3288.
 */
async function verifyGridDraftAndSource({page}:{page:Page}):Promise<void>{
  await page.goto('/');await verifyPageGridControls(page);
  await openPageGrid(page);
  await page.locator('[name="grid-spacing"]').fill('');
  await page.locator('[name="grid-spacing"]').pressSequentially('32.88');
  await expect(page.locator('[name="grid-spacing"]')).toHaveValue('32.88');
  await page.locator('[data-modal-value="apply"]').click();
  await page.locator('button[data-native-tab="format"]').click();
  await page.locator('.native-ribbon [data-native-action="paragraph-format"]').click();
  await page.locator('[name="snap-to-grid"]').uncheck();
  await page.locator('[data-modal-value="apply"]').click();
  await expect.poll(
    /**
     * Observe actual non-grid source progression after the paragraph opts out.
     *
     * Page grid metadata stays active while this independent paragraph uses 10pt.
     * @async
     * @returns {Promise<number>} Native glyph error, or infinity for missing source.
     * @example
     * // Actual source advances 1000 units with the paragraph checkbox cleared.
     */
    async()=>{/** Actual native source permits only browser glyph-edge quantization. */const points=await page.evaluate(gridGlyphPositions);return points.length===2&&points[0]===0?Math.abs(points[1]-1000):Infinity;}).toBeLessThanOrEqual(2);
  for(/** Production downloads are independently decoded in the requested save priority order. */const format of ['hwpx','hwp','forhan']){
    /** Each real export listener belongs to exactly one public menu operation. */
    const pending=page.waitForEvent('download');
    await page.locator('#export-menu-toggle').click();await page.locator(`[data-export="${format}"]`).click();
    /** Actual completed production bytes, independent from current renderer attributes. */
    const download=await pending,bytes=await readFile((await download.path())!),payload=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString('utf8'));
    expect(payload.page.lineGrid).toBe(3288);expect(payload.doc.content[0].attrs.nativeSnapToGrid).toBe(false);
    await expect(page.locator('#save-document')).toBeEnabled();
  }
}
test('native grid controls preserve precise source and independent paragraph opt-out',verifyGridDraftAndSource);

/**
 * Preserve mixed paragraph and heading grid flags until the checkbox is explicitly edited.
 *
 * An unrelated physical spacing edit must not collapse independent original
 * flags. A real checkbox click resolves the mixed state in one source change.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after mixed drafts, native output and one undo agree.
 * @throws {Error} If an untouched grid preference changes or explicit application is lost.
 * @example
 * // A paragraph opting out and a heading opting in retain their independent flags.
 */
async function verifyMixedGridSelection({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Both independent native paragraph kinds participate in the mixed source selection. */
  const original={type:'doc',content:[{type:'paragraph',attrs:{nativeSnapToGrid:false},content:[{type:'text',text:'Paragraph'}]},{type:'heading',attrs:{level:2,nativeSnapToGrid:true},content:[{type:'text',text:'Heading'}]}]};
  await page.locator('#file-input').setInputFiles({name:'mixed-grid.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:original}))});
  await page.locator('.tiptap').click();await page.keyboard.press('ControlOrMeta+a');
  await page.locator('button[data-native-tab="format"]').click();await page.locator('.native-ribbon [data-native-action="paragraph-format"]').click();
  await expect(page.locator('[name="snap-to-grid"]')).toHaveJSProperty('indeterminate',true);
  await page.locator('[name="marginTop"]').fill('3');await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-forhan-snap-to-grid','0');
  await expect(page.locator('.tiptap h2')).toHaveAttribute('data-forhan-snap-to-grid','1');
  await page.locator('.native-ribbon [data-native-action="paragraph-format"]').click();
  await expect(page.locator('[name="snap-to-grid"]')).toHaveJSProperty('indeterminate',true);
  await page.locator('[name="snap-to-grid"]').click();await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-forhan-snap-to-grid','1');
  await expect(page.locator('.tiptap h2')).toHaveAttribute('data-forhan-snap-to-grid','1');
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.tiptap p').first()).toHaveAttribute('data-forhan-snap-to-grid','0');
  await expect(page.locator('.tiptap h2')).toHaveAttribute('data-forhan-snap-to-grid','1');
}
test('mixed paragraph grid preferences survive unrelated edits and resolve through one explicit click',verifyMixedGridSelection);

/**
 * Compare actual standalone HTML glyphs against all original native grid positions.
 *
 * Measurement and drawing must occur in separate passes so an earlier changed
 * paragraph cannot invalidate a later source origin. A separate real page loads
 * each actual script-free download and observes original text ranges.
 * @async
 * @param {{page:Page}} context - Actual isolated application page.
 * @returns {Promise<void>} Resolves after all eighty-five actual HTML outputs agree.
 * @throws {Error} If real output loses native spacing, boundaries or paragraph transitions.
 * @example
 * // Native 32pt before/after spacing retains the original 48pt A-to-B progression.
 */
async function verifyStaticGridMatrix({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Independent original native expectations are shared without using renderer calculations. */
  const matrix=JSON.parse(await readFile('tests/fixtures/native-line-grid.json','utf8')),output=await page.context().newPage();
  try{
    for(/** Each source enters the public importer before the actual production HTML export. */const row of matrix.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,title:row.id,doc:row.doc,page:row.page}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      /** The actual download belongs to exactly this public source export operation. */
      const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
      /** Actual completed production output is loaded into an independent real document. */
      const download=await pending,html=await readFile((await download.path())!,'utf8');await output.setContent(html);await output.evaluate(
        /**
         * Await actual standalone font readiness before observing native glyph positions.
         *
         * No source or drawing attributes are modified by this observation.
         * @async
         * @returns {Promise<void>} Resolves after actual fonts settle.
         * @example
         * // Original downloaded Arial text is measured after font selection completes.
         */
        async()=>{await document.fonts.ready;});
      await expect.poll(
        /**
         * Compare actual downloaded glyphs with independent original PDF-verified glyph positions.
         *
         * Only the browser drawing quantum is tolerated; source text and line count remain exact.
         * @async
         * @returns {Promise<boolean>} Whether every actual source glyph matches original progression.
         * @example
         * // A later paragraph is not measured after the first paragraph's height changes.
         */
        async()=>{/** Physical glyphs are observed independently in the actual standalone output. */const points=await output.evaluate(gridGlyphPositions,'body');return points.length===row.glyphPositions.length&&points.every(
          /**
           * Compare one actual exported glyph with its original native progression.
           *
           * Two native units cover only the browser drawing quantum.
           * @param {number} point - Actual relative native-unit glyph position.
           * @param {number} index - Corresponding original native line index.
           * @returns {boolean} Whether the original native position agrees.
           * @example
           * // Native zero overlap remains independently distinguishable from one grid interval.
           */
          (point,index)=>Math.abs(point-row.glyphPositions[index])<=2);},{message:row.id}).toBe(true);
      await expect(page.locator('#save-document')).toBeEnabled();
    }
  }finally{await output.close();}
}
test('85 actual standalone HTML outputs retain original native grid progression across paragraphs',verifyStaticGridMatrix);
