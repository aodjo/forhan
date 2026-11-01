import {expect,type Page} from '@playwright/test';
import type {NativePaginationFixture} from './native-pagination.ts';

/** Actual source rectangles are read independently from rendering metadata and pagination functions. */
export interface EditableSheetGeometry {
  sheets:Array<{top:number;bottom:number}>;
  rows:Array<{label:string;baseline:number}>;
  zoom:number;
  border:number;
  paperTop:number;
}

/**
 * Observe real editable text baselines and independent physical sheet boxes.
 *
 * Font metrics and DOM ranges observe actual painted source positions. No
 * production line shifts, page assignments or pagination functions supply
 * expected values, and noneditable auxiliary drawings cannot count as source.
 * @param {HTMLElement} root - Actual live editable document root.
 * @returns {EditableSheetGeometry} Actual physical sheet bounds and original source baselines.
 * @example
 * const geometry=await page.locator('.tiptap').evaluate(editableSheetGeometry);
 */
export function editableSheetGeometry(root:HTMLElement):EditableSheetGeometry{
  /** Owned source text is observed independently from paper chrome. */
  const paper=root.closest<HTMLElement>('#paper')??root,canvas=document.createElement('canvas').getContext('2d')!,
    walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT),rows:EditableSheetGeometry['rows']=[],sheets:EditableSheetGeometry['sheets']=[],
    sourceRuns:Array<{node:Text;start:number}>=[];
  let source='';
  let zoom=1;
  for(let element:HTMLElement|null=root;element;element=element.parentElement)zoom*=Number(getComputedStyle(element).zoom)||1;
  for(/** Real paper rectangles determine physical page origins independently from stored geometry attributes. */const sheet of paper.querySelectorAll<HTMLElement>('.native-sheet-background')){
    /** Bounds belong to the actual visible sheet rather than a synthesized expected origin. */
    const bounds=sheet.getBoundingClientRect();sheets.push({top:bounds.top,bottom:bounds.bottom});
  }
  while(walker.nextNode()){
    if(walker.currentNode.nodeType===Node.ELEMENT_NODE){if((walker.currentNode as Element).tagName==='BR')source+='\n';continue;}
    /** Only original editable source text participates in page membership. */
    const text=walker.currentNode as Text;if(text.parentElement?.closest('svg,[contenteditable="false"]'))continue;
    sourceRuns.push({node:text,start:source.length});source+=text.data;
  }
  let runIndex=0;
  for(/** Original identifiers may span several transparent drawing wrappers after real incremental input. */const match of source.matchAll(/row\d{3}/gu)){
      while(runIndex<sourceRuns.length-1&&sourceRuns[runIndex+1].start<=match.index)runIndex++;
      /** The identifier's actual first glyph establishes its independently observed physical baseline. */
      const run=sourceRuns[runIndex],text=run.node,offset=match.index-run.start;
      /** Independent installed font metrics locate the actually rendered glyph baseline. */
      const range=document.createRange(),style=getComputedStyle(text.parentElement!);range.setStart(text,offset);range.setEnd(text,offset+1);
      canvas.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      rows.push({label:match[0],baseline:range.getBoundingClientRect().top+canvas.measureText(match[0]).fontBoundingBoxAscent*zoom});
  }
  return {sheets,rows,zoom,border:parseFloat(getComputedStyle(paper).borderTopWidth)||0,paperTop:paper.getBoundingClientRect().top};
}

/**
 * Verify actual editable physical source against an independent original native PDF.
 *
 * Paragraph flow and glyph decorations can settle in successive rendering
 * frames after file loading or zoom changes. Read actual source rectangles on
 * every attempt, retaining the same strict physical page and baseline oracle.
 * No rendering metadata supplies expected coordinates or relaxes their bounds.
 * @async
 * @param {Page} page - Actual browser or selected native application renderer.
 * @param {NativePaginationFixture} row - Independent original source and actual native PDF observations.
 * @returns {Promise<EditableSheetGeometry>} Verified actual source and physical sheet rectangles.
 * @throws {Error} If source glyphs remain missing, duplicated or physically misplaced after rendering settles.
 * @example
 * const geometry=await verifyEditableSheetCase(page,row); // Actual native baseline tolerance remains 0.14pt.
 */
export async function verifyEditableSheetCase(page:Page,row:NativePaginationFixture):Promise<EditableSheetGeometry>{
  let geometry:EditableSheetGeometry|undefined;
  await expect(
    /**
     * Observe complete actual source geometry after its dependent drawing work.
     *
     * Every retry reads real glyphs and checks the unchanged independent native
     * oracle, so a persistent layout error cannot pass a readiness condition.
     * @async
     * @returns {Promise<void>} Resolves only when every original source row matches its native physical placement.
     * @throws {Error} If current actual geometry disagrees with the original native PDF.
     * @example
     * // A source import cannot reuse the previous document's page-count metadata as proof of readiness.
     */
    async()=>{
      geometry=await page.locator('.tiptap').evaluate(editableSheetGeometry);
      expect(geometry.sheets.length,row.id).toBe(row.pages.length);expect(geometry.rows.length,row.id).toBe(row.source.count);
      let offset=0;
      for(let sheet=0;sheet<row.pages.length;sheet++)for(let line=0;line<row.pages[sheet].labels.length;line++){
        /** Expected physical positions belong to the original application rather than the live layout implementation. */
        const actual=geometry.rows[offset++],bounds=geometry.sheets[sheet],baseline=(actual.baseline-bounds.top)/geometry.zoom*75-row.paper.top-row.paper.header-geometry.border*75;
        expect(actual.label,row.id).toBe(row.pages[sheet].labels[line]);expect(actual.baseline,row.id).toBeGreaterThan(bounds.top);expect(actual.baseline,row.id).toBeLessThan(bounds.bottom);
        expect(Math.abs(baseline-row.pages[sheet].baselines[line]),`${row.id}: native editable ${actual.label}`).toBeLessThanOrEqual(14);
      }
    }).toPass({timeout:5000,intervals:[16,32,64,100]});
  return geometry!;
}
