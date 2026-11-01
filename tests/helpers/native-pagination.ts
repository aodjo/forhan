import type {JSONContent} from '@tiptap/core';
import {expect} from '@playwright/test';
import type {PageSettings} from '../../src/types.ts';
import type {PdfObservation} from './pdf.ts';

/** Original generated conditions retain their physical and paragraph source independently from expected output. */
export interface NativePaginationSource {
  page:PageSettings;
  font:number;
  percent:number;
  snap:boolean;
  separate:boolean;
  before:number;
  after:number;
  breakBefore:number|null;
  count:number;
}

/** Independent original native PDF pages and integral paper margins provide the actual physical oracle. */
export interface NativePaginationFixture {
  id:string;
  inputSha256:string;
  nativePdfSha256:string;
  source:NativePaginationSource;
  paper:{top:number;header:number;left:number};
  pages:Array<{labels:string[];baselines:number[]}>;
}

/**
 * Reconstruct the original generated paragraph source without deriving expected page membership.
 *
 * Only original font, spacing, margins, hard breaks and explicit paragraph
 * page breaks are used. Expected physical pages remain separate literal data
 * from actual original application printing.
 * @param {NativePaginationSource} source - Independently retained original source conditions.
 * @returns {JSONContent} Original editable document with eighty stable row labels.
 * @example
 * nativePaginationDocument(row.source); // Both one paragraph and eighty paragraphs retain their original structure.
 */
export function nativePaginationDocument(source:NativePaginationSource):JSONContent{
  /** Original source marks retain one complete actual installed Latin font selection. */
  const doc:JSONContent={type:'doc',content:[]},content:JSONContent[]=[],marks=[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:source.font/100+'pt',nativeUseFontSpace:false,nativeUseKerning:false}}],
    attrs={lineHeight:source.percent+'%',nativeSnapToGrid:source.snap,marginTop:source.before/100+'pt',marginBottom:source.after/100+'pt'};
  for(let index=0;index<source.count;index++){
    /** Stable ASCII identifiers expose missing, duplicate or incorrectly paginated original text. */
    const text:JSONContent={type:'text',text:'row'+String(index).padStart(3,'0'),marks};
    if(source.separate)doc.content!.push({type:'paragraph',attrs:{...attrs,...(index===source.breakBefore?{pageBreakBefore:true}:{})},content:[text]});
    else{if(index)content.push({type:'hardBreak'});content.push(text);}
  }
  if(!source.separate)doc.content!.push({type:'paragraph',attrs,content});
  return doc;
}

/**
 * Compare actual completed PDF pages with independent original native printing.
 *
 * Font CMaps establish exact row membership; physical text matrices establish
 * body-relative baselines. Native printer quantization allows one observed
 * 600dpi pixel plus two source units, while current per-page origin stability
 * retains the tighter two-unit bound. Searchable off-page content cannot pass.
 * @param {PdfObservation} pdf - Independently decoded actual completed production bytes.
 * @param {NativePaginationFixture} row - Literal original native PDF and source observations.
 * @returns {void} Verifies exact source rows, physical pages, native baselines and stable page origins.
 * @throws {Error} If any actual glyph is missing, duplicated, misplaced or clipped outside its physical page.
 * @example
 * verifyNativePaginationPdf(await observePdf(actualBytes),row);
 */
export function verifyNativePaginationPdf(pdf:PdfObservation,row:NativePaginationFixture):void{
  expect(pdf.pages,row.id).toBe(row.pages.length);
  /** Actual source labels are observed independently on each physical output page. */
  const pages:Array<Array<{label:string;baseline:number}>>=[];
  for(let index=0;index<pdf.pages;index++)pages.push([]);
  for(/** Actual PDF text matrices and embedded CMaps belong to the completed native output. */const glyph of pdf.glyphs){
    for(/** Each independently decoded source identifier must occur exactly once. */const match of glyph.text.matchAll(/row\d{3}/gu)){
      expect(glyph.y,row.id).toBeGreaterThanOrEqual(pdf.pageBounds[glyph.page-1][1]);
      expect(glyph.y,row.id).toBeLessThanOrEqual(pdf.pageBounds[glyph.page-1][3]);
      pages[glyph.page-1].push({label:match[0],baseline:(pdf.pageBounds[glyph.page-1][3]-glyph.y)*100-row.paper.top-row.paper.header});
    }
  }
  for(let page=0;page<pages.length;page++){
    expect(pages[page].length,`${row.id}: page ${page+1}`).toBe(row.pages[page].labels.length);
    for(let index=0;index<pages[page].length;index++){
      expect(pages[page][index].label,`${row.id}: physical source membership`).toBe(row.pages[page].labels[index]);
      expect(Math.abs(pages[page][index].baseline-row.pages[page].baselines[index]),`${row.id}: original actual PDF baseline`).toBeLessThanOrEqual(14);
    }
    expect(Math.abs(pages[page][0].baseline-pages[0][0].baseline),`${row.id}: per-page origin must not accumulate browser rounding`).toBeLessThanOrEqual(2);
  }
}
