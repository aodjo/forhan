import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {observePdf} from './helpers/pdf.ts';
import {nativePaginationDocument,verifyNativePaginationPdf,type NativePaginationFixture} from './helpers/native-pagination.ts';
import {defaultPage} from '../src/documents.ts';

/**
 * Compare real exported physical PDF pages with original native source observations.
 *
 * The public importer and production HTML exporter own every source operation.
 * An independent native print engine creates the actual PDF, whose CMaps and
 * physical glyph matrices are checked against actual original application PDFs.
 * No production pagination function generates the expected page membership.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after all original physical source cases agree and HTML source remains editable.
 * @throws {Error} If source rows, native page membership, page origins or reimport differ.
 * @example
 * // A line ending exactly at the native body edge starts on the next physical page.
 */
async function verifyNativePageMatrix({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Literal native observations retain independently generated source hashes and actual PDF pages. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-pagination.json','utf8')) as {rows:NativePaginationFixture[]},output=await page.context().newPage();
  expect(fixture.rows.length).toBe(63);
  try{
    for(/** Each original source condition enters the same public file importer. */const row of fixture.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.source.page,doc:nativePaginationDocument(row.source)}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      /** Only actual completed production output is independently printed and decoded. */
      const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
      /** Output bytes cannot be substituted by a synthetic source or another print path. */
      const download=await pending,html=await readFile((await download.path())!,'utf8');await expect(page.locator('#save-document')).toBeEnabled();
      await output.setContent(html);await expect(output.locator('forhan-print-pages[data-forhan-native-pages]')).toHaveCount(1);
      verifyNativePaginationPdf(await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true})),row);
      await page.locator('#file-input').setInputFiles({name:row.id+'-roundtrip.html',mimeType:'text/html',buffer:Buffer.from(html)});
      await expect(page.locator('#toast')).toContainText(row.id+'-roundtrip.html');
      await expect(page.locator('.tiptap forhan-print-pages,.tiptap forhan-print-original,.tiptap svg[data-forhan-print-text],.tiptap forhan-print-source')).toHaveCount(0);
      await expect(page.locator('.tiptap p')).toHaveCount(row.source.separate?row.source.count:1);
    }
  }finally{await output.close();}
}

test('63 real PDFs retain original native physical pages, strict line fit, absolute body baselines and per-page origins',verifyNativePageMatrix);

/**
 * Compare real PDF glyph progression with original fractional-font native caches and printing.
 *
 * Adjacent hundredth points expose the native proportional gap quantum and
 * signed half ties. Actual CMaps independently reject source duplication while
 * physical matrices retain tiny zero-percent residues and full grid jumps.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after all fifty-four independent native source conditions agree.
 * @throws {Error} If original text, native source intervals or actual PDF coordinates differ.
 * @example
 * // Zero percent at 10.01pt has a native remainder; fixed 0pt remains exact overlap.
 */
async function verifyNativeFractionalFonts({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Literal original source caches and actual native PDF matrices are separate independent observations. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-proportional-spacing.json','utf8')),output=await page.context().newPage();
  expect(fixture.rows.length+fixture.gridRows.length).toBe(54);
  try{
    for(/** Every original source condition enters the public importer and actual completed production export. */const row of [...fixture.rows,...fixture.gridRows]){
      /** Original source marks preserve their precise hundredth-point base height. */
      const content:Record<string,unknown>[]=[],marks=[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:row.font/100+'pt',nativeUseFontSpace:false,nativeUseKerning:false}}];
      for(/** All four original source letters retain their distinct authored line membership. */const letter of ['A','B','C','D']){if(content.length)content.push({type:'hardBreak'});content.push({type:'text',text:letter,marks});}
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...defaultPage(),lineGrid:row.grid??0},doc:{type:'doc',content:[{type:'paragraph',attrs:{lineHeight:row.percent+'%',nativeSnapToGrid:true},content}]}}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      /** Actual completed static bytes supply the source for the real independent PDF engine. */
      const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
      /** No production geometry attribute is used as the expected physical PDF position. */
      const download=await pending,html=await readFile((await download.path())!,'utf8');await expect(page.locator('#save-document')).toBeEnabled();await output.setContent(html);
      /** Embedded font CMaps and actual glyph matrices expose physical native progression. */
      const pdf=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true})),letters:string[]=[],positions:number[]=[];
      for(/** Actual source glyphs must appear exactly once in the completed physical file. */const glyph of pdf.glyphs)for(/** Native four-letter source uses one original glyph per measured logical line. */const letter of glyph.text)if(/[ABCD]/u.test(letter)){letters.push(letter);positions.push((pdf.glyphs[0].y-glyph.y)*100);}
      expect(letters.join(''),row.id).toBe('ABCD');expect(pdf.pages,row.id).toBe(1);
      for(let index=0;index<positions.length;index++){
        expect(Math.abs(positions[index]-row.lines[index].position),`${row.id}: exact native source interval`).toBeLessThanOrEqual(2);
        expect(Math.abs(positions[index]-row.nativePdfPositions[index]),`${row.id}: independent original PDF interval`).toBeLessThanOrEqual(14);
      }
    }
  }finally{await output.close();}
}

test('54 real PDFs preserve original proportional gap quantum, fractional font baselines and zero-percent grid boundaries',verifyNativeFractionalFonts);

/**
 * Retain an existing heading connection when ordinary line fit reaches a page boundary.
 *
 * Nineteen native grid rows leave room for the heading alone. The original
 * source explicitly protects the heading's following connection, so a new
 * pagination path cannot strand it on the preceding physical page. This
 * functional check allows future complete constraint projection as well.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after actual printed heading and following text share the same page.
 * @throws {Error} If existing source flow constraints are lost or original text duplicates.
 * @example
 * // TITLE and NEXT remain together even when TITLE alone would fit the preceding page.
 */
async function verifyHeadingConnection({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Explicit original source has nineteen rows before a protected heading and its next paragraph. */
  const marks=[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}],attrs={lineHeight:'100%',nativeSnapToGrid:true},content:Record<string,unknown>[]=[];
  for(let index=0;index<19;index++){if(index)content.push({type:'hardBreak'});content.push({type:'text',text:'pre'+String(index).padStart(2,'0'),marks});}
  await page.locator('#file-input').setInputFiles({name:'protected-heading.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...defaultPage(),lineGrid:3288},doc:{type:'doc',content:[{type:'paragraph',attrs,content},{type:'heading',attrs:{...attrs,level:1},content:[{type:'text',text:'TITLE',marks}]},{type:'paragraph',attrs,content:[{type:'text',text:'NEXT',marks}]}]}}))});
  await expect(page.locator('#toast')).toContainText('protected-heading.fhn');
  /** Actual completed production markup remains the only source of the independent physical print operation. */
  const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
  /** Original source and actual native text matrices are observed from the completed output bytes. */
  const download=await pending,html=await readFile((await download.path())!,'utf8'),output=await page.context().newPage();
  try{
    await output.setContent(html);
    /** Real CMaps independently expose the actual page of each original source word. */
    const pdf=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true})),title:typeof pdf.glyphs=[],next:typeof pdf.glyphs=[];
    for(/** Every original heading and following paragraph must occur exactly once in the completed file. */const glyph of pdf.glyphs){if(glyph.text==='TITLE')title.push(glyph);if(glyph.text==='NEXT')next.push(glyph);}
    expect(title.length).toBe(1);expect(next.length).toBe(1);expect(title[0].page).toBe(2);expect(next[0].page).toBe(title[0].page);
  }finally{await output.close();}
}

test('actual PDF preserves a protected heading with its following paragraph at a native grid page boundary',verifyHeadingConnection);
