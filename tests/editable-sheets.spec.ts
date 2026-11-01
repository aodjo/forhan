import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {nativePaginationDocument,type NativePaginationFixture} from './helpers/native-pagination.ts';
import {editableSheetGeometry,verifyEditableSheetCase} from './helpers/editable-sheets.ts';

/**
 * Compare actual editable physical sheets with independently printed original native pages.
 *
 * All sixty-three original conditions use the public file importer. Actual
 * painted source ranges must occupy the original physical page and baseline,
 * including strict body edges, paragraph spacing and explicit page breaks.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after every original source row has the correct editable physical placement.
 * @throws {Error} If original source is duplicated, missing or drawn on a different physical page.
 * @example
 * // Eighty hard-break lines remain one editable paragraph across four native sheets.
 */
async function verifyEditableNativeMatrix({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Literal native PDF observations are independent of the production page planner. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-pagination.json','utf8')) as {rows:NativePaginationFixture[]};
  expect(fixture.rows.length).toBe(63);
  for(/** Each source condition retains its own original physical PDF oracle. */const row of fixture.rows){
    await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:nativePaginationDocument(row.source)}))});
    await expect(page.locator('#toast')).toContainText(row.id);
    await expect(page.locator('.native-sheet-background')).toHaveCount(row.pages.length);
    await expect(page.locator('.tiptap > p')).toHaveCount(row.source.separate?row.source.count:1);
    await verifyEditableSheetCase(page,row);
  }
}

test('63 editable native sheet layouts preserve original physical page membership and actual glyph baselines',verifyEditableNativeMatrix);

/**
 * Edit original text across a physical page boundary through real mouse and keyboard input.
 *
 * Native page navigation follows physical sheets, while typing, paragraph
 * splitting and undo retain original unsplit source and independent page state.
 * The ordinary downloaded FHN file independently verifies unchanged source.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after page navigation, physical caret editing and source history agree.
 * @throws {Error} If a click edits the wrong source row or rendering changes enter document history.
 * @example
 * // Clicking row020 on sheet two edits row020 and one undo restores the original source.
 */
async function verifyEditableSheetInput({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** The independently observed original case has twenty rows per physical native sheet. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-pagination.json','utf8')) as {rows:NativePaginationFixture[]},
    row=fixture.rows.find(
      /**
       * Select the original four-sheet hard-break source condition.
       *
       * Original expected page membership comes from its independent native PDF.
       * @param {NativePaginationFixture} entry - One original native source case.
       * @returns {boolean} Whether this is the twenty-row native grid case.
       * @example
       * // The fixture retains one paragraph containing eighty original rows.
       */
      entry=>entry.id==='g3288-s1-p100-h1000-breaks')!;
  await page.locator('#file-input').setInputFiles({name:'editable-sheets.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:nativePaginationDocument(row.source)}))});
  await expect(page.locator('#toast')).toContainText('editable-sheets.fhn');
  await expect(page.locator('.native-sheet-background')).toHaveCount(4);
  /** Ordinary downloaded source establishes a canonical baseline independently from live DOM wrappers. */
  const initialDownload=page.waitForEvent('download');await page.locator('#save-document').click();
  /** Source serialization must never include paper backgrounds or rendering-only inline positions. */
  const initial=JSON.parse(await readFile((await (await initialDownload).path())!,'utf8'));
  await page.locator('[data-scroll-command="select"]').click();
  await expect(page.locator('#native-scroll-page-number')).toHaveAttribute('max','4');
  await page.locator('#native-scroll-page-number').fill('2');await page.locator('[data-scroll-command="apply"]').click();
  await page.locator('[data-scroll-command="next"]').click();await page.locator('[data-scroll-command="select"]').click();
  await expect(page.locator('#native-scroll-page-number')).toHaveValue('3');
  await page.keyboard.press('Escape');await page.locator('[data-scroll-command="previous"]').click();
  await page.locator('[data-scroll-command="select"]').click();await expect(page.locator('#native-scroll-page-number')).toHaveValue('2');await page.keyboard.press('Escape');
  await page.locator('.tiptap forhan-line').filter({hasText:/^row019$/u}).click();await page.keyboard.press('End');await page.keyboard.press('ArrowDown');
  await expect(page.locator('.native-status-page')).toHaveText('2/4쪽');
  await page.keyboard.type('X');await expect(page.locator('.tiptap')).toContainText('row020X');
  await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap')).not.toContainText('X');
  await page.locator('.tiptap forhan-line').filter({hasText:/^row020$/u}).click();await page.keyboard.press('Home');await page.keyboard.press('Backspace');
  await expect(page.locator('.tiptap')).toContainText('row019row020');
  await page.keyboard.press('ControlOrMeta+z');
  await page.locator('.tiptap forhan-line').filter({hasText:/^row020$/u}).click();await page.keyboard.press('Home');await page.keyboard.press('Enter');
  await expect(page.locator('.tiptap > p')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap > p')).toHaveCount(1);
  await page.locator('.tiptap forhan-line').filter({hasText:/^row019$/u}).click();await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Shift+End');
  /** The real browser selection must contain only the original two source rows across the page boundary. */
  const selected=await page.evaluate(
    /**
     * Read the actual native browser selection without accessing editor state.
     *
     * Source page chrome and drawing metadata cannot become copied text.
     * @returns {string} Real currently selected source Unicode.
     * @example
     * // A physical page boundary contributes no extra authored character.
     */
    ()=>getSelection()!.toString());
  expect(selected).toBe('row019\nrow020');
  await page.keyboard.press('Backspace');await expect(page.locator('.tiptap')).not.toContainText('row019');await expect(page.locator('.tiptap')).not.toContainText('row020');
  await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('.tiptap')).toContainText('row019');await expect(page.locator('.tiptap')).toContainText('row020');
  /** Drawing-only physical sheet changes cannot become extra user-visible undo steps. */
  const finalDownload=page.waitForEvent('download');await page.locator('#save-document').click();
  /** Canonical editable source and independent physical settings must be unchanged after all undo operations. */
  const final=JSON.parse(await readFile((await (await finalDownload).path())!,'utf8'));
  expect(final.doc).toEqual(initial.doc);expect(final.page).toEqual(initial.page);
}

test('physical sheet navigation, cross-page mouse input and one-step undo preserve original editable source',verifyEditableSheetInput);

/**
 * Keep an empty continuation line editable on its actual next physical sheet.
 *
 * A hard break after the twentieth grid row creates genuine empty source on
 * sheet two. The caret must follow that empty line before any glyph exists,
 * and normal text input must then paint on that same physical sheet.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after empty-line caret movement and subsequent input agree.
 * @throws {Error} If a blank continuation caret stays in the preceding page or creates duplicate source.
 * @example
 * // Shift+Enter at the end of a full native page starts its next editable sheet.
 */
async function verifyEditableEmptyContinuation({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Only original source conditions are used to produce one full physical native grid page. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-pagination.json','utf8')) as {rows:NativePaginationFixture[]},row=fixture.rows[4],
    source={...row.source,count:20,page:{...row.source.page,lineGrid:3288},font:1000,percent:100,snap:true,separate:false,before:0,after:0,breakBefore:null};
  await page.locator('#file-input').setInputFiles({name:'empty-continuation.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:source.page,doc:nativePaginationDocument(source)}))});
  await expect(page.locator('#toast')).toContainText('empty-continuation.fhn');
  await expect(page.locator('.native-sheet-background')).toHaveCount(1);
  await page.locator('.tiptap forhan-line').filter({hasText:/^row019$/u}).click();await page.keyboard.press('End');await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.native-sheet-background')).toHaveCount(2);await expect(page.locator('.native-status-page')).toHaveText('2/2쪽');
  await page.keyboard.type('row020');
  await expect(
    /**
     * Await the actual painted continuation after incremental native keyboard input.
     *
     * Source text can update before its dependent page projection. Every retry
     * observes real glyphs and retains the same original physical page bounds.
     * @async
     * @returns {Promise<void>} Resolves only when the original row paints on sheet two.
     * @throws {Error} If the row count, source label or physical page membership differs.
     * @example
     * // A persistent caret or glyph on sheet one still fails the unchanged bounds.
     */
    async()=>{
      /** Actual current glyph and paper rectangles share one original viewport observation. */
      const geometry=await page.locator('.tiptap').evaluate(editableSheetGeometry),last=geometry.rows[geometry.rows.length-1];
      expect(geometry.rows.length).toBe(21);expect(last.label).toBe('row020');expect(last.baseline).toBeGreaterThan(geometry.sheets[1].top);expect(last.baseline).toBeLessThan(geometry.sheets[1].bottom);
    },
  ).toPass({timeout:5000,intervals:[16,32,64,100]});
}

test('an empty hard-break continuation keeps its caret and subsequent input on the next physical sheet',verifyEditableEmptyContinuation);
