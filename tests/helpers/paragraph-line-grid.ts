import {expect,type Page} from '@playwright/test';
import {defaultPage} from '../../src/documents.ts';

/**
 * Open the measured page-grid tab through the public paper command.
 *
 * Only actual controls are used; source and history are not injected privately.
 * @async
 * @param {Page} page - Actual browser or selected native desktop renderer.
 * @returns {Promise<void>} Resolves with the real grid draft visible.
 * @throws {Error} If public paper controls are unavailable.
 * @example
 * await openPageGrid(page);
 */
export async function openPageGrid(page:Page):Promise<void>{
  await page.locator('#page-settings').click();
  await page.locator('[data-page-tab="grid"]').click();
  await expect(page.locator('#native-page-grid')).toBeVisible();
}

/**
 * Measure actual authored Latin glyph positions in physical native source units.
 *
 * DOM ranges inspect drawn glyphs independently from source layout attributes.
 * Accumulated paper zoom is removed before comparing native hundredths of a point.
 * @param {string|void} [rootSelector='.tiptap'] - Actual source root, including body for standalone output.
 * @returns {number[]} Actual relative glyph positions for generated A/B/C/D source.
 * @throws {Error} If the actual paper or authored glyphs are absent.
 * @example
 * // page.evaluate(gridGlyphPositions) observes native positions [0,3200,6400,9600].
 */
export function gridGlyphPositions(rootSelector:string|void='.tiptap'):number[]{
  /** Only actual generated source glyphs are observed in the owning paper. */
  const paper=document.querySelector<HTMLElement>('#paper'),zoom=paper?parseFloat(paper.style.zoom):1,walker=document.createTreeWalker(document.querySelector(rootSelector||'.tiptap')!,NodeFilter.SHOW_TEXT),range=document.createRange(),points:number[]=[];
  while(walker.nextNode()){
    /** Native drawing wrappers retain authored text separate from hidden measuring surfaces. */
    const node=walker.currentNode as Text;
    if(node.parentElement!.closest('style,script,svg,[aria-hidden="true"]'))continue;
    for(let i=0;i<node.length;i++)if(/[ABCD]/.test(node.data[i])){
      range.setStart(node,i);range.setEnd(node,i+1);points.push(range.getBoundingClientRect().top/zoom*75);
    }
  }
  return points.map(
    /**
     * Normalize actual glyph observations to the first original glyph.
     *
     * Expected relative positions include independently PDF-verified native grid leading.
     * @param {number} point - Actual native-unit glyph top.
     * @returns {number} Rounded native progression from the first authored glyph.
     * @example
     * // Browser subpixel differences have a two-native-unit comparison tolerance.
     */
    point=>Math.round(point-points[0]));
}

/**
 * Import generated source and apply measured native row and point controls.
 *
 * The cancelled draft leaves the actual page disabled. A later accepted twenty-row
 * draft produces raw 3288, while native point arrows use whole-point steps.
 * @async
 * @param {Page} page - Actual browser or selected native renderer.
 * @returns {Promise<void>} Resolves with accepted 3288-unit grid and unchanged source text.
 * @throws {Error} If cancellation, precise draft entry or actual native drawing differs.
 * @example
 * await verifyPageGridControls(page); // The caller then decodes production output.
 */
export async function verifyPageGridControls(page:Page):Promise<void>{
  /** This explicit generated source makes grid progression independent from template defaults. */
  const payload={title:'Native grid regression',page:defaultPage(),doc:{type:'doc',content:[{type:'paragraph',attrs:{lineHeight:'100%',nativeSnapToGrid:true},content:[{type:'text',text:'A',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}]},{type:'hardBreak'},{type:'text',text:'B',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}]}]}]}};
  await page.locator('#file-input').setInputFiles({name:'native-grid.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,...payload}))});
  await expect(page.locator('.tiptap')).toHaveText('AB');
  await openPageGrid(page);
  await expect(page.locator('[name="grid-spacing"]')).toBeDisabled();
  await page.locator('[name="grid-mode"][value="line"]').check();
  await page.locator('[data-page-grid-step="1"][aria-label="줄 간격 증가"]').click();
  await expect(page.locator('[name="grid-spacing"]')).toHaveValue('17.0');
  await expect(page.locator('[name="grid-count"]')).toHaveValue('38');
  await page.locator('.modal-actions [data-modal-value="cancel"]').click();
  await expect(page.locator('#paper')).not.toHaveAttribute('data-forhan-line-grid');
  await openPageGrid(page);
  await page.locator('[name="grid-mode"][value="line"]').check();
  await page.locator('[name="grid-count"]').fill('20');
  await expect(page.locator('[name="grid-spacing"]')).toHaveValue('32.9');
  await page.locator('[data-page-tab="basic"]').click();
  await page.locator('[data-page-tab="grid"]').click();
  await expect(page.locator('[name="grid-spacing"]')).toHaveValue('32.9');
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','3288');
  await expect.poll(
    /**
     * Observe real native progression after the accepted page configuration commits.
     *
     * Actual drawn ranges must refresh even though document text never changed.
     * @async
     * @returns {Promise<number>} Maximum error in native units, or infinity for missing glyphs.
     * @example
     * // Ten-point source progresses by the accepted 32.88pt grid interval.
     */
    async()=>{/** Browser native glyph quantization allows at most two original source units. */const points=await page.evaluate(gridGlyphPositions);return points.length===2&&points[0]===0?Math.abs(points[1]-3288):Infinity;}).toBeLessThanOrEqual(2);
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#paper')).not.toHaveAttribute('data-forhan-line-grid');
  await expect(page.locator('.tiptap')).toHaveText('AB');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','3288');
}
