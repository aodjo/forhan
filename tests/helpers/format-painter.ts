import {expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {JSONContent} from '@tiptap/core';
import {readHwp} from '../../src/formats/hwp.ts';
import {readHwpx} from '../../src/formats/hwpx.ts';

/** Independent source arrays exercise complete appearance copying rather than one visible representative value. */
export const SOURCE_METRICS={ratio:[85,90,95,100,105,110,115],spacing:[-5,0,5,10,15,20,25],relativeSize:[100,95,90,85,80,75,70],offset:[0,5,10,15,20,25,30]};
/** Paragraph shape deliberately differs from both target blocks. */
export const SOURCE_PARAGRAPH={sourceId:'copy-origin',textAlign:'right',lineHeight:'1.75',marginLeft:'12pt',marginRight:'3pt',marginTop:'2pt',marginBottom:'4pt',textIndent:'-6pt',nativeSnapToGrid:false,nativeParagraphCondense:20,nativeBreakLatinWord:0,nativeBreakNonLatinWord:1};
/** Original controlled source retains semantic links, target identities, heading level and an authored page break. */
export const SOURCE_DOCUMENT:JSONContent={type:'doc',content:[
  {type:'paragraph',attrs:SOURCE_PARAGRAPH,content:[{type:'text',text:'원본',marks:[{type:'bold'},{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'11.25pt',color:'#13579b',backgroundColor:'#ffeecc',nativeCharacterMetrics:SOURCE_METRICS,nativeUseFontSpace:false,nativeUseKerning:true}}]}]},
  {type:'paragraph',attrs:{sourceId:'copy-target',textAlign:'left',lineHeight:'2',marginLeft:'1pt',pageBreakBefore:true},content:[{type:'text',text:'대상링크',marks:[{type:'italic'},{type:'textStyle',attrs:{fontSize:'18pt',color:'#ff0000'}},{type:'link',attrs:{href:'https://example.com/target'}}]}]},
  {type:'heading',attrs:{sourceId:'copy-heading',level:2,textAlign:'center'},content:[{type:'text',text:'제목',marks:[{type:'strike'}]}]},
]};

/**
 * Import a uniquely named independent source through the actual public file picker.
 *
 * No editor commands or internal application objects are used to seed source.
 * @async
 * @param {Page} page - Actual isolated application renderer.
 * @param {string} name - Unique source filename.
 * @param {JSONContent} doc - Original independent editable document.
 * @returns {Promise<void>} Resolves after the public importer acknowledges this exact source.
 * @example
 * await importSource(page,'copy-origin.fhn',SOURCE_DOCUMENT);
 */
export async function importSource(page:Page,name:string,doc:JSONContent):Promise<void>{
  await page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc}))});
  await expect(page.locator('#toast')).toContainText(name);
}

/**
 * Select actual original DOM text without editing its source or using editor internals.
 *
 * Auxiliary drawings are excluded from character offsets. The next real Shift
 * key synchronizes an otherwise asynchronous browser selection before clicking
 * a selection-preserving native command button.
 * @async
 * @param {Page} page - Actual application renderer.
 * @param {string} selector - One actual original source paragraph.
 * @param {number} from - Original UTF-16 anchor inside that paragraph.
 * @param {number} [to=from] - Original head, or the same position for a cursor.
 * @returns {Promise<void>} Resolves with the actual source range selected and editor focused.
 * @throws {RangeError} If either requested original source endpoint is absent.
 * @example
 * await selectSource(page,'.tiptap > p:first-child',1);
 */
export async function selectSource(page:Page,selector:string,from:number,to=from):Promise<void>{
  await page.locator('.tiptap').focus();
  await page.locator(selector).evaluate(
    /**
     * Resolve source-only DOM endpoints and assign the browser's genuine selection.
     *
     * No source characters, schema attributes or generated drawings are changed.
     * @param {Element} root - Actual selected source block.
     * @param {{from:number;to:number}} offsets - Original source endpoints.
     * @returns {void} Assigns only real browser selection endpoints.
     * @throws {RangeError} If either endpoint is outside original text.
     * @example
     * // A reversed source range retains its original anchor and head.
     */
    (root,offsets)=>{
      /** Only actual editable text nodes own source character positions. */
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),points=new Map<number,{node:Node;offset:number}>();
      let count=0;
      while(walker.nextNode()){
        /** Original source nodes remain separate from inaccessible outline and width paint. */
        const node=walker.currentNode;
        if(node.parentElement?.closest('svg,[contenteditable="false"]'))continue;
        for(/** Both original endpoints are resolved independently, including a collapsed cursor. */const offset of [offsets.from,offsets.to])if(!points.has(offset)&&offset>=count&&offset<=count+(node.textContent?.length??0))points.set(offset,{node,offset:offset-count});
        count+=node.textContent?.length??0;
      }
      /** Browser selection retains actual source nodes rather than expected model positions. */
      const anchor=points.get(offsets.from),head=points.get(offsets.to);
      if(!anchor||!head)throw new RangeError('Original source selection endpoint is absent.');
      document.getSelection()!.setBaseAndExtent(anchor.node,anchor.offset,head.node,head.offset);
    },{from,to},
  );
  await page.keyboard.press('Shift');
}

/**
 * Save actual production bytes and parse them through an independent public reader.
 *
 * FHN retains exact target identifiers; native readers independently confirm
 * that applied appearance reaches HWP and HWPX output rather than only the DOM.
 * @async
 * @param {Page} page - Actual browser application renderer.
 * @param {'forhan'|'hwp'|'hwpx'} [format='forhan'] - Explicit production output format.
 * @returns {Promise<JSONContent>} Independently read actual saved document tree.
 * @example
 * const doc=await savedSource(page,'hwpx');
 */
export async function savedSource(page:Page,format:'forhan'|'hwp'|'hwpx'='forhan'):Promise<JSONContent>{
  /** The listener is registered before the original save command. */
  const pending=page.waitForEvent('download');
  await page.locator('#export-menu-toggle').click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Actual complete output bytes come from the public production download. */
  const download=await pending,bytes=await readFile((await download.path())!);
  return format==='forhan'?JSON.parse(bytes.toString()).doc:format==='hwp'?readHwp(bytes).doc:(await readHwpx(bytes)).doc;
}

/**
 * Invoke the actual enabled editing ribbon command while retaining source selection.
 *
 * The ribbon is rebuilt through its public tab control before each operation.
 * @async
 * @param {Page} page - Actual isolated application renderer.
 * @returns {Promise<void>} Resolves after the real native command button is clicked.
 * @example
 * await ribbonCopy(page);
 */
export async function ribbonCopy(page:Page):Promise<void>{
  await page.locator('button[data-native-tab="edit"]').click();
  await page.locator('.native-ribbon [data-native-action="format-painter"]').click();
}
