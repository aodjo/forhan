import {expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {JSONContent} from '@tiptap/core';
import {importSource,selectSource} from './format-painter.ts';

/** Literal independent original observations distinguish ordinary navigation from direct COM positioning. */
export const CELL_PROTECTION_ORACLE=JSON.parse(readFileSync(new URL('../fixtures/native-cell-protection.json',import.meta.url),'utf8')) as {texts:string[];rows:{id:string;protected:boolean;editable:boolean;expectedRightCell:number;expectedLeftCell:number}[]};

/**
 * Build independent three-cell source with one declared middle-cell protection state.
 *
 * Surrounding paragraphs and ordinary cells remain editable. Original source
 * text and protection metadata are independent of production decoding helpers.
 * @param {boolean} protectedCell - Whether the middle native cell is protected.
 * @param {boolean} [editable=false] - Independent form-editable native field.
 * @returns {JSONContent} Original valid editable document.
 * @example
 * const source=protectionDocument(true,true);
 */
export function protectionDocument(protectedCell:boolean,editable=false):JSONContent{
  /** Explicit neutral fields retain original native units without production-derived expectations. */
  const properties={textDirection:0,lineWrap:0,verticalAlign:1,hasMargin:false,margins:{left:510,right:510,top:141,bottom:141},protected:false,editable:false},cells:JSONContent[]=[];
  for(let index=0;index<CELL_PROTECTION_ORACLE.texts.length;index++)cells.push({type:'tableCell',attrs:{colspan:1,rowspan:1,colwidth:[150],nativeCellProperties:{...properties,margins:{...properties.margins},protected:index===1&&protectedCell,editable:index===1&&editable}},content:[{type:'paragraph',content:[{type:'text',text:CELL_PROTECTION_ORACLE.texts[index]}]}]});
  return {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'BEFORE'}]},{type:'table',content:[{type:'tableRow',content:cells}]},{type:'paragraph',content:[{type:'text',text:'AFTER'}]}]};
}

/**
 * Observe the real browser source selection's cell without accessing editor internals.
 *
 * Only genuine selection endpoints and original table DOM establish this index.
 * @async
 * @param {Page} page - Actual owning application renderer.
 * @returns {Promise<number>} Selected original cell index or minus one outside cells.
 * @example
 * const selected=await activeProtectionCell(page);
 */
export async function activeProtectionCell(page:Page):Promise<number>{
  return page.locator('.tiptap').evaluate(
    /**
     * Locate the genuine current source endpoint in the actual original table.
     *
     * Model selection and expected navigation values are never substituted.
     * @param {HTMLElement} root - Original editor root.
     * @returns {number} Actual endpoint cell index or minus one.
     * @example
     * // Protected MIDDLE must not own an ordinary insertion endpoint.
     */
    root=>{
      /** The owning browser selection remains authoritative after native key events. */
      const node=document.getSelection()?.focusNode,element=node?.nodeType===1?node as Element:node?.parentElement,cell=element?.closest('td,th');
      return cell?[...root.querySelectorAll('td,th')].indexOf(cell):-1;
    },
  );
}

/**
 * Compare real forward and backward cell navigation with independent original observations.
 *
 * Ordinary Tab uses the real table command. Protected source is skipped even
 * with the independent form-editable flag, and source text remains untouched.
 * @async
 * @param {Page} page - Actual isolated browser or native renderer.
 * @returns {Promise<void>} Resolves after all original navigation states agree.
 * @example
 * await verifyProtectionNavigation(page);
 */
export async function verifyProtectionNavigation(page:Page):Promise<void>{
  for(/** Original independently observed states include an unprotected control. */const row of CELL_PROTECTION_ORACLE.rows){
    await importSource(page,`protection-${row.id}.fhn`,protectionDocument(row.protected,row.editable));
    await selectSource(page,'.tiptap td:first-child p',4);
    await page.keyboard.press('Tab');
    await expect.poll(
      /**
       * Read the genuine source cell after ordinary forward navigation.
       *
       * No expected position is assigned through a test API.
       * @async
       * @returns {Promise<number>} Actual original forward endpoint.
       * @example
       * // The protected control must navigate from LEFT to RIGHT.
       */
      async()=>await activeProtectionCell(page),
    ).toBe(row.expectedRightCell);
    await selectSource(page,'.tiptap td:last-child p',0);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(
      /**
       * Read the genuine source cell after ordinary backward navigation.
       *
       * Protected and form-editable fields remain independent.
       * @async
       * @returns {Promise<number>} Actual original backward endpoint.
       * @example
       * // The protected control must navigate from RIGHT to LEFT.
       */
      async()=>await activeProtectionCell(page),
    ).toBe(row.expectedLeftCell);
    await expect(page.locator('.tiptap td p')).toHaveText(CELL_PROTECTION_ORACLE.texts);
  }
}

/**
 * Verify an ordinary protected-cell click preserves the previous real typing destination.
 *
 * Actual pointer and keyboard events must edit LEFT while the protected middle
 * cell and the other original cell remain unchanged.
 * @async
 * @param {Page} page - Actual isolated application renderer.
 * @returns {Promise<void>} Resolves after original source text confirms the edit destination.
 * @example
 * await verifyProtectedPointer(page);
 */
export async function verifyProtectedPointer(page:Page):Promise<void>{
  await importSource(page,'protected-pointer.fhn',protectionDocument(true,true));
  await selectSource(page,'.tiptap td:first-child p',4);
  await page.locator('.tiptap td:nth-child(2) p').click();
  await page.keyboard.type('X');
  await expect(page.locator('.tiptap td p')).toHaveText(['LEFTX','MIDDLE','RIGHT']);
}
