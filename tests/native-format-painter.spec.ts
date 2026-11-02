import {test,expect,type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import {readFile} from 'node:fs/promises';
import {SOURCE_DOCUMENT,SOURCE_METRICS,SOURCE_PARAGRAPH,importSource,focusSourceForSelection,selectSource,savedSource,ribbonCopy} from './helpers/format-painter.ts';

/**
 * Check measured original dialog controls, cancellation and independent accepted copying.
 *
 * Source copying is not a document edit. All original groups stay visible, and
 * native options without a faithful source representation remain unavailable.
 * @async
 * @param {{page:Page}} context - Isolated actual browser application.
 * @returns {Promise<void>} Resolves after native geometry, defaults, cancellation and unchanged source agree.
 * @example
 * // The original dialog remains 361 by 387 CSS pixels and defaults to character appearance.
 */
async function verifyCopyDialog({page}:{page:Page}):Promise<void>{
  await page.goto('/');await importSource(page,'dialog-copy.fhn',SOURCE_DOCUMENT);
  /** Production serialization before any copy supplies an independent source baseline. */
  const before=await savedSource(page);
  await selectSource(page,'.tiptap > p:first-child',1);await page.keyboard.press('Alt+c');
  /** The actual modal bounds are observed without image registration or expected-geometry injection. */
  const dialog=page.locator('.native-dialog-format-painter'),bounds=await dialog.boundingBox();
  expect(bounds?.width).toBe(361);expect(bounds?.height).toBe(387);
  await expect(dialog.getByRole('radio',{name:'글자 모양',exact:true})).toBeChecked();
  await expect(dialog.getByRole('radio',{name:'글자 스타일',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('radio',{name:'문단 스타일',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('checkbox',{name:'셀 배경',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'도움말',exact:true}).click();
  await expect(dialog.locator('.nf-help-text')).toBeVisible();
  await page.keyboard.press('Alt+b');
  await expect(dialog.getByRole('radio',{name:'글자 모양과 문단 모양 둘 다 복사',exact:true})).toBeChecked();
  await page.keyboard.press('Escape');
  expect(await savedSource(page)).toEqual(before);
  await selectSource(page,'.tiptap > p:first-child',1);await ribbonCopy(page);await page.keyboard.press('Alt+d');
  await expect(dialog).toHaveCount(0);
  expect(await savedSource(page)).toEqual(before);
}

/**
 * Verify source character replacement, target semantic retention and one-step history.
 *
 * A cancelled later source copy cannot replace the accepted clipboard. Repeated
 * application preserves the remembered source, and all three actual save
 * readers must observe the copied original character arrays and appearance.
 * @async
 * @param {{page:Page}} context - Actual isolated application renderer.
 * @returns {Promise<void>} Resolves after exact source, native outputs and undo/redo retain all target invariants.
 * @example
 * // Bold 11.25pt blue source replaces red italic target while retaining its hyperlink destination.
 */
async function verifyCharacterCopy({page}:{page:Page}):Promise<void>{
  await page.goto('/');await importSource(page,'character-copy.fhn',SOURCE_DOCUMENT);
  /** Actual production baseline includes normalized target attributes and complete native source marks. */
  const before=await savedSource(page);
  await selectSource(page,'.tiptap > p:first-child',1);await ribbonCopy(page);await page.keyboard.press('Enter');
  await selectSource(page,'.tiptap > p:nth-child(2)',1);await ribbonCopy(page);await page.keyboard.press('Escape');
  await selectSource(page,'.tiptap > p:nth-child(2)',0,4);await ribbonCopy(page);
  /** FHN proves target identity and authored break remain original, independently of the DOM. */
  const changed=await savedSource(page),target=changed.content![1],run=target.content![0];
  expect(target.attrs).toEqual(before.content![1].attrs);
  expect(run.text).toBe('대상링크');
  expect(run.marks).toContainEqual(expect.objectContaining({type:'bold'}));
  expect(run.marks).not.toContainEqual(expect.objectContaining({type:'italic'}));
  expect(run.marks).toContainEqual(expect.objectContaining({type:'link',attrs:expect.objectContaining({href:'https://example.com/target'})}));
  expect(run.marks).toContainEqual(expect.objectContaining({type:'textStyle',attrs:expect.objectContaining({fontSize:'11.25pt',color:'#13579b',nativeCharacterMetrics:SOURCE_METRICS})}));
  expect(changed.content![0]).toEqual(before.content![0]);
  expect(changed.content![2]).toEqual(before.content![2]);
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
  expect(await savedSource(page)).toEqual(before);
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await savedSource(page)).toEqual(changed);
  for(/** Actual native formats independently retain complete copied character shape. */const format of ['hwpx','hwp'] as const){
    /** The genuine native reader sees the saved production source rather than expected attributes. */
    const output=await savedSource(page,format),serialized=JSON.stringify(output);
    expect(serialized).toContain('11.25pt');expect(serialized).toContain('#13579b');expect(serialized).toContain('https://example.com/target');
  }
  await selectSource(page,'.tiptap > h2',0,2);await page.keyboard.press('Alt+c');
  /** A remembered source remains available after one application and keeps target heading semantics. */
  const repeated=await savedSource(page);
  expect(repeated.content![2].type).toBe('heading');expect(repeated.content![2].attrs?.level).toBe(2);
  expect(repeated.content![2].content![0].marks).toContainEqual(expect.objectContaining({type:'textStyle',attrs:expect.objectContaining({fontSize:'11.25pt'})}));
}

/**
 * Verify independent paragraph-only and combined copy through source saves and history.
 *
 * Target identities and manual breaks are retained while all represented
 * paragraph shape fields are reset or copied. Character-only data changes
 * exclusively when the accepted source mode explicitly includes characters.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after both accepted body modes preserve their independent scope.
 * @example
 * // Paragraph-only copying cannot remove the target's original italic mark.
 */
async function verifyParagraphCopy({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  for(/** Each mode starts from a uniquely imported complete independent source. */const mode of ['paragraph','both'] as const){
    await importSource(page,mode+'-copy.fhn',SOURCE_DOCUMENT);
    /** A serialized source baseline exposes any unintended target character or structure change. */
    const before=await savedSource(page);
    await selectSource(page,'.tiptap > p:first-child',1);await ribbonCopy(page);
    await page.locator(`[name="format-copy-body"][value="${mode}"]`).check();await page.keyboard.press('Alt+d');
    await selectSource(page,'.tiptap > p:nth-child(2)',0,4);await ribbonCopy(page);
    /** Actual target paragraph shape is inspected through production serialization. */
    const changed=await savedSource(page),target=changed.content![1];
    for(/** Structural source IDs cannot be copied with the original paragraph shape. */const [key,value] of Object.entries(SOURCE_PARAGRAPH))if(key!=='sourceId')expect(target.attrs?.[key]).toEqual(value);
    expect(target.attrs?.sourceId).toBe('copy-target');expect(target.attrs?.pageBreakBefore).toBe(true);
    if(mode==='paragraph')expect(target.content).toEqual(before.content![1].content);
    else expect(target.content![0].marks).toContainEqual(expect.objectContaining({type:'bold'}));
    await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');
    expect(await savedSource(page)).toEqual(before);
  }
}

/**
 * Verify independent supported cell-fill copying without changing cell structure or body appearance.
 *
 * A selected merged target cell keeps its span, widths, text and character
 * marks. The actual production HWP/HWPX readers must retain the copied fill.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after source and native output confirm the independent cell-only change.
 * @example
 * // A yellow source fill replaces one merged target's blue fill with one undo step.
 */
async function verifyCellFillCopy({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** A valid two-column table includes one independently merged destination. */
  const doc:JSONContent={type:'doc',content:[{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{backgroundColor:'#ffeecc'},content:[{type:'paragraph',content:[{type:'text',text:'원본'}]}]},{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'유지'}]}]}]},{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:2,colwidth:[120,140],backgroundColor:'#112233',sourceId:'merged-target'},content:[{type:'paragraph',attrs:{textAlign:'center'},content:[{type:'text',text:'대상',marks:[{type:'italic'}]}]}]}]}]}]};
  await importSource(page,'cell-fill-copy.fhn',doc);
  /** Actual normalized source supplies original target body and span invariants. */
  const before=await savedSource(page);
  await selectSource(page,'.tiptap tr:first-child td:first-child p',1);await ribbonCopy(page);
  await page.getByRole('checkbox',{name:'셀 배경',exact:true}).check();
  await page.locator('[name="format-copy-table-target"][value="cell"]').check();await page.keyboard.press('Alt+d');
  await selectSource(page,'.tiptap tr:nth-child(2) td p',0,2);await ribbonCopy(page);
  /** The copied fill cannot replace target content or its original merge dimensions. */
  const changed=await savedSource(page),target=changed.content![0].content![1].content![0],original=before.content![0].content![1].content![0];
  expect(target.content).toEqual(original.content);expect(target.attrs).toEqual({...original.attrs,backgroundColor:'#ffeecc'});
  expect(changed.content![0].content![0]).toEqual(before.content![0].content![0]);
  for(/** Both actual native table readers must retain the supported copied fill. */const format of ['hwpx','hwp'] as const){
    /** The final native table source is inspected independently from rendered CSS. */
    const output=await savedSource(page,format);expect(JSON.stringify(output)).toContain('#ffeecc');
  }
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');expect(await savedSource(page)).toEqual(before);
}

test('native format-copy dialog retains original bounds, independent defaults and unchanged cancelled source',verifyCopyDialog);
test('character format copying retains target source and hyperlinks through native saves and one undo',verifyCharacterCopy);
test('paragraph-only and combined format copying retain independent character and structural scope',verifyParagraphCopy);
test('cell-only format copying retains merged target structure and actual native fill output',verifyCellFillCopy);

/**
 * Verify copied normal character defaults override heading and partial-link inheritance.
 *
 * Semantic heading level and hyperlink destinations stay intact. Unselected
 * link fragments retain their prior default underline, and real native files
 * retain an explicitly normal heading after their independent readers run.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after explicit default resets, native outputs and later bold toggling agree.
 * @example
 * // Plain 10pt source stays normal inside a first-level heading and clears only a selected link fragment's line.
 */
async function verifyNormalDefaults({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Original semantic targets intentionally inherit different bold and underline defaults. */
  const doc:JSONContent={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'평문'}]},{type:'heading',attrs:{level:1},content:[{type:'text',text:'진한제목'}]},{type:'paragraph',content:[{type:'text',text:'링크본문',marks:[{type:'link',attrs:{href:'https://example.com/defaults'}}]}]}]};
  await importSource(page,'normal-default-copy.fhn',doc);
  await selectSource(page,'.tiptap > p:first-child',1);await ribbonCopy(page);await page.keyboard.press('Enter');
  await selectSource(page,'.tiptap > h1',0,4);await ribbonCopy(page);
  await expect(page.locator('.tiptap > h1 span[style*="font-size"]')).toHaveCSS('font-weight','400');
  await expect(page.locator('.tiptap > h1 [data-forhan-normal-weight]')).toHaveCSS('font-size','13.3333px');
  await selectSource(page,'.tiptap > p:last-child',1,3);await ribbonCopy(page);
  /** Only the selected original URL fragment loses its automatic link underline. */
  const reset=page.locator('.tiptap > p:last-child a[data-forhan-default-underline="0"]');
  await expect(reset).toHaveText('크본');await expect(reset).toHaveCSS('text-decoration-line','none');
  await expect(page.locator('.tiptap > p:last-child a:not([data-forhan-default-underline])')).toHaveCount(2);
  for(/** Unselected URL fragments retain their original automatic decoration. */const link of await page.locator('.tiptap > p:last-child a:not([data-forhan-default-underline])').all())await expect(link).toHaveCSS('text-decoration-line','underline');
  for(/** Both real native writers must encode explicit false bold rather than infer it from the target heading. */const format of ['hwpx','hwp'] as const){
    /** Actual native reconstruction retains semantic headings with explicitly normal character weight. */
    const output=await savedSource(page,format),heading=output.content![1];
    expect(heading.type).toBe('heading');expect(heading.attrs?.level).toBe(1);
    expect(heading.content![0].marks).not.toContainEqual(expect.objectContaining({type:'bold'}));
    expect(heading.content![0].marks).toContainEqual(expect.objectContaining({type:'textStyle',attrs:expect.objectContaining({nativeNormalWeight:true,fontSize:'10pt'})}));
  }
  await selectSource(page,'.tiptap > h1',0,4);await page.keyboard.press('ControlOrMeta+b');
  await expect(page.locator('.tiptap > h1 strong')).toHaveCSS('font-weight','700');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(page.locator('.tiptap > h1 [data-forhan-normal-weight]')).toHaveCSS('font-weight','400');
}

test('plain copied character defaults override heading weight and only selected hyperlink decoration',verifyNormalDefaults);

/**
 * Preserve the original native paragraph-copy boundary at the next paragraph's start.
 *
 * A separately observed installed-Hwp case supplies actual before and after
 * alignments. The final source paragraph owns no selected glyph and must keep
 * its original shape rather than receiving the preceding paragraph's copy.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after the original endpoint result and one-step undo agree.
 * @example
 * // Original native alignments 3,1,2 become 3,3,2, preserving the last centered paragraph.
 */
async function verifyOriginalParagraphEndpoint({page}:{page:Page}):Promise<void>{
  /** Public numeric source observations contain no native program bytes or private document data. */
  const oracle=JSON.parse(await readFile(new URL('./fixtures/native-format-copy-paragraph-endpoint.json',import.meta.url),'utf8')),
    doc:JSONContent={type:'doc',content:[]};
  for(let index=0;index<oracle.texts.length;index++)doc.content!.push({type:'paragraph',attrs:{textAlign:oracle.initialAlignment[index]},content:[{type:'text',text:oracle.texts[index]}]});
  await page.goto('/');await importSource(page,'original-copy-endpoint.fhn',doc);
  /** Actual production source before copying supplies complete untouched paragraph invariants. */
  const before=await savedSource(page);
  await selectSource(page,'.tiptap > p:first-child',oracle.sourceOffset);await ribbonCopy(page);
  await page.locator('[name="format-copy-body"][value="paragraph"]').check();await page.keyboard.press('Alt+d');
  await focusSourceForSelection(page);await page.locator('.tiptap').evaluate(
    /**
     * Select actual source from the target start to the following paragraph's first position.
     *
     * Only genuine browser selection changes; no model attributes or content are assigned.
     * @param {HTMLElement} root - Actual owning source editor root.
     * @returns {void} Assigns original source endpoints matching the independently observed native case.
     * @throws {Error} If the selected original source text is absent.
     * @example
     * // The final paragraph's first original glyph remains outside the selection.
     */
    root=>{
      /** Each original paragraph contributes its actual first editable text node. */
      const points:Node[]=[];
      for(/** Only the two independent source endpoint blocks establish the selection. */const index of [1,2]){
        /** Auxiliary drawings cannot become source endpoints. */
        const walker=document.createTreeWalker(root.children[index],NodeFilter.SHOW_TEXT);
        while(walker.nextNode())if(!walker.currentNode.parentElement?.closest('svg,[contenteditable="false"]')){points.push(walker.currentNode);break;}
      }
      if(points.length!==2)throw new Error('Original endpoint source is absent.');
      document.getSelection()!.setBaseAndExtent(points[0],0,points[1],0);
    },
  );
  await page.keyboard.press('Shift');await ribbonCopy(page);
  /** Actual serialized paragraph alignments are independent from generated paint and selection markup. */
  const after=await savedSource(page),alignments:string[]=[];
  for(/** Every final source block retains its real paragraph identity. */const node of after.content!)alignments.push(node.attrs!.textAlign);
  expect(alignments).toEqual(oracle.observedAlignment);
  expect(after.content![2]).toEqual(before.content![2]);
  await page.locator('.tiptap').focus();await page.keyboard.press('ControlOrMeta+z');expect(await savedSource(page)).toEqual(before);
}

test('format copying preserves the independently observed original next-paragraph selection boundary',verifyOriginalParagraphEndpoint);
