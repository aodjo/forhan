import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {observePdf} from './helpers/pdf.ts';
import {defaultPage} from '../src/documents.ts';
import type {JSONContent} from '@tiptap/core';

/**
 * Download one actual completed production HTML export for independent printing.
 *
 * The application owns native layout preparation and static serialization.
 * The independent browser's real PDF engine observes that exact output.
 * @async
 * @param {Page} page - Actual owning editor page.
 * @returns {Promise<string>} Actual complete script-free HTML source bytes.
 * @throws {Error} If the public output cannot be completed or read.
 * @example
 * const html=await fractionalPrintHtml(page);
 */
async function fractionalPrintHtml(page:Page):Promise<string>{
  /** One original download listener belongs exclusively to this public operation. */
  const pending=page.waitForEvent('download');await page.locator('#export-menu-toggle').click();await page.locator('[data-export="html"]').click();
  /** Production serialization creates the actual file before independent decoding begins. */
  const download=await pending,html=await readFile((await download.path())!,'utf8');await expect(page.locator('#save-document')).toBeEnabled();return html;
}

/**
 * Verify actual PDF source text retains fractional native grid intervals.
 *
 * Real font CMaps and physical glyph matrices independently catch Chromium's
 * whole-pixel inline-text rounding. Screen source remains visible and actual
 * reimport cannot turn the auxiliary print copy into duplicate editable text.
 * @async
 * @param {{page:Page}} context - Actual isolated browser application.
 * @returns {Promise<void>} Resolves after real PDF baselines and source reimport agree.
 * @throws {Error} If a source interval rounds, source duplicates or output becomes an image.
 * @example
 * // A 32.88pt source interval cannot silently print as 33pt.
 */
async function verifyFractionalPdf({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Source uses an exact native hundredth-point interval and independently styled authored text. */
  const source={application:'forhan',version:1,title:'Fractional native print',page:{...defaultPage(),lineGrid:3288},doc:{type:'doc',content:[{type:'paragraph',attrs:{lineHeight:'100%',nativeSnapToGrid:true},content:[{type:'text',text:'A',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}]},{type:'hardBreak'},{type:'text',text:'B',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}]}]}]}};
  await page.locator('#file-input').setInputFiles({name:'fractional-print.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
  await expect(page.locator('.tiptap')).toHaveText('AB');
  /** Actual output is printed in its own real browser page without replacing the PDF engine. */
  const html=await fractionalPrintHtml(page),output=await page.context().newPage();
  try{
    await output.setContent(html);await expect(output.locator('svg[data-forhan-print-text]')).toBeHidden();
    /** Physical PDF content is independently decoded from the actual native print engine. */
    const pdf=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true}));
    expect(pdf.pages).toBe(1);expect(pdf.glyphs.map(
      /**
       * Retain actual PDF source text without consulting the editor model.
       *
       * A hidden original plus a vector copy cannot count as two authored strings.
       * @param {import('./helpers/pdf.ts').PdfGlyphItem} item - Actual decoded native PDF text.
       * @returns {string} Original embedded source Unicode.
       * @example
       * // The actual completed PDF contains A and B exactly once.
       */
      item=>item.text).join('')).toBe('AB');
    expect(Math.abs(pdf.glyphs[0].y-pdf.glyphs[1].y-32.88)).toBeLessThan(0.02);
    await page.locator('#file-input').setInputFiles({name:'fractional-roundtrip.html',mimeType:'text/html',buffer:Buffer.from(html)});
    await expect(page.locator('#toast')).toContainText('fractional-roundtrip.html');
    await expect(page.locator('.tiptap')).toHaveText('AB');await expect(page.locator('.tiptap svg[data-forhan-print-text]')).toHaveCount(0);
    await expect(page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','3288');
  }finally{await output.close();}
}
test('actual PDF glyph matrices retain a 32.88pt native interval without source duplication',verifyFractionalPdf);

/**
 * Compare every actual native-grid PDF glyph baseline with original native PDF observations.
 *
 * Each real completed HTML export is printed and decoded independently. The
 * matrix includes zero overlap, mixed paragraph preferences, exact adjacent
 * native units and cross-paragraph before/after spacing.
 * @async
 * @param {{page:Page}} context - Actual isolated application.
 * @returns {Promise<void>} Resolves after all eighty-five original source progressions agree.
 * @throws {Error} If an actual physical glyph moves, duplicates or disappears.
 * @example
 * // Separate paragraph origins cannot reintroduce whole-pixel print rounding.
 */
async function verifyFractionalPdfMatrix({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /** Literal original native observations do not use the production rounding or SVG code. */
  const matrix=JSON.parse(await readFile('tests/fixtures/native-line-grid.json','utf8')),output=await page.context().newPage();
  try{
    for(/** Every generated original native document enters the public importer. */const row of matrix.rows){
      await page.locator('#file-input').setInputFiles({name:row.id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:row.doc,page:row.page}))});
      await expect(page.locator('#toast')).toContainText(row.id);
      await output.setContent(await fractionalPrintHtml(page));
      /** Actual physical text matrices belong to the independently decoded printed file. */
      const pdf=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true})),points:number[]=[],letters:string[]=[];
      for(/** Original generated source uses one independently observed A/B/C/D glyph per line. */const glyph of pdf.glyphs)for(/** PDF text extraction may group coincident glyphs without changing their baseline. */const letter of glyph.text)if(/[ABCD]/.test(letter)){letters.push(letter);points.push((pdf.glyphs[0].y-glyph.y)*100);}
      expect(letters.join(''),row.id).toBe(row.glyphPositions.length===2?'AB':'ABCD');
      expect(points.length,row.id).toBe(row.glyphPositions.length);
      for(let index=0;index<points.length;index++){
        expect(Math.abs(points[index]-row.glyphPositions[index]),`${row.id}: exact source baseline`).toBeLessThanOrEqual(2);
        expect(Math.abs(points[index]-row.nativePdfGlyphPositions[index]),`${row.id}: independent original PDF baseline`).toBeLessThanOrEqual(72/row.nativeDeviceDpi*100+2);
      }
    }
  }finally{await output.close();}
}
test('85 actual PDFs retain original native grid glyph baselines across line and paragraph boundaries',verifyFractionalPdfMatrix);

/**
 * Verify real vector PDF text survives native grid pagination without duplicate rows.
 *
 * Long paragraphs and separate paragraph blocks exercise distinct Chromium
 * fragmentation paths. Every authored row must remain searchable exactly once
 * across the actual physical PDF pages.
 * @async
 * @param {{page:Page}} context - Actual isolated application.
 * @returns {Promise<void>} Resolves after both real multipage source structures retain every row.
 * @throws {Error} If vector content disappears, duplicates or fails to paginate.
 * @example
 * // Eighty native-grid rows remain eighty source rows across multiple PDF pages.
 */
async function verifyPrintPagination({page}:{page:Page}):Promise<void>{
  test.setTimeout(90000);await page.goto('/');
  /** A separate real document owns independent native PDF generation for each public export. */
  const output=await page.context().newPage(),expected:string[]=[];
  for(let index=0;index<80;index++)expected.push('row'+String(index).padStart(3,'0'));
  try{
    for(/** Both source structures must survive actual pagination rather than a viewport screenshot. */const separate of [false,true]){
      /** Original authored rows keep explicit native source geometry and a genuine installed font. */
      const doc:JSONContent={type:'doc',content:[]},content:JSONContent[]=[],attrs={lineHeight:'100%',nativeSnapToGrid:true},marks=[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}];
      for(let index=0;index<expected.length;index++){
        /** A source row remains original editable Unicode, independently from auxiliary print drawings. */
        const text={type:'text',text:expected[index],marks};
        if(separate)doc.content!.push({type:'paragraph',attrs,content:[text]});
        else{if(index)content.push({type:'hardBreak'});content.push(text);}
      }
      if(!separate)doc.content!.push({type:'paragraph',attrs,content});
      await page.locator('#file-input').setInputFiles({name:`pagination-${separate}.fhn`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...defaultPage(),lineGrid:3288},doc}))});
      await expect(page.locator('#toast')).toContainText(`pagination-${separate}.fhn`);
      await output.setContent(await fractionalPrintHtml(page));
      /** Actual font CMaps reveal source rows on their original physical PDF pages. */
      const pdf=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true})),actual:string[]=[];
      for(/** Actual decoded text may combine adjacent source fragments without changing original Unicode. */const glyph of pdf.glyphs)for(/** Each authored row identifier must occur exactly once in the completed native output. */const match of glyph.text.matchAll(/row\d{3}/gu))actual.push(match[0]);
      expect(pdf.pages).toBeGreaterThan(1);expect(actual,`separate=${separate}, pages=${pdf.pages}`).toEqual(expected);
      for(/** Text outside a physical page is searchable but clipped and cannot satisfy visible pagination. */const glyph of pdf.glyphs){
        expect(glyph.y,`separate=${separate}, ${JSON.stringify(glyph)}`).toBeGreaterThanOrEqual(pdf.pageBounds[glyph.page-1][1]);
        expect(glyph.y,`separate=${separate}, ${JSON.stringify(glyph)}`).toBeLessThanOrEqual(pdf.pageBounds[glyph.page-1][3]);
      }
    }
  }finally{await output.close();}
}
test('native vector PDF printing retains every source row through long and separate paragraph pagination',verifyPrintPagination);

/**
 * Compare real vector print shaping with the same original screen text and links.
 *
 * A separately printed control removes only the auxiliary print drawing. Its
 * actual font CMaps and horizontal ink advances expose broken joins, combining
 * marks, lost inline fonts and duplicate text. Native vertical correction is
 * checked separately because the control retains Chromium's rounding.
 * @async
 * @param {{page:Page}} context - Actual isolated public application.
 * @returns {Promise<void>} Resolves after actual source, shaping and clickable links survive output and reimport.
 * @throws {Error} If actual embedded text, horizontal progression or links differ.
 * @example
 * // A colored run inside an Arabic word cannot break its source joining.
 */
async function verifyStyledPrint({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  /** Color boundaries retain identical metrics while independent font sizes remain explicitly authored. */
  const marks=[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'16pt'}}],doc:JSONContent={type:'doc',content:[]},samples=['office e\u0301 fi','السلام بالعالم','नमस्ते दुनिया','한글과 English'];
  for(/** Every real source script is printed through the same production export operation. */const sample of samples){
    /** A real mark boundary occurs inside the first word rather than only at whitespace. */
    const boundary=Math.max(1,sample.indexOf(' ')),content:JSONContent[]=[{type:'text',text:sample.slice(0,1),marks},{type:'text',text:sample.slice(1,boundary),marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'16pt',color:'#c02030'}}]},{type:'text',text:sample.slice(boundary),marks}];
    doc.content!.push({type:'paragraph',attrs:{lineHeight:'100%',nativeSnapToGrid:true},content});
  }
  doc.content!.push({type:'paragraph',attrs:{lineHeight:'100%'},content:[{type:'text',text:'linked',marks:[...marks,{type:'link',attrs:{href:'https://example.com/forhan-print'}}]},{type:'text',text:' small',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}]}]});
  await page.locator('#file-input').setInputFiles({name:'styled-print.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...defaultPage(),lineGrid:3288},doc}))});
  await expect(page.locator('#toast')).toContainText('styled-print.fhn');
  /** Both physical PDFs begin with the exact same actual completed production HTML. */
  const html=await fractionalPrintHtml(page),output=await page.context().newPage();
  try{
    await output.setContent(html);
    /** Actual vector PDF must retain Unicode and clickable destination annotations. */
    const actual=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true}));
    await output.addStyleTag({content:'@media print {forhan-print-pages[data-forhan-native-pages],svg[data-forhan-print-text]{display:none!important} forhan-print-original[data-forhan-page-source]{display:contents!important} forhan-print-source,a[data-forhan-print-link-source]{visibility:visible!important} html body{width:793.7066666667px!important;padding:132.28px 113.3866666667px 113.3866666667px!important;margin:0!important;box-sizing:border-box!important}}'});
    /** The control uses the original retained source and genuine browser font shaping. */
    const control=await observePdf(await output.pdf({printBackground:true,preferCSSPageSize:true}));
    expect(actual.pages).toBe(control.pages);
    /** Spaces can be synthesized between independent PDF words without changing the authored glyph sequence. */
    const actualText:string[]=[],controlText:string[]=[];
    for(/** Every real embedded CMap is decoded without consulting the editor model. */const item of actual.glyphs)actualText.push(item.text.replace(/\s/gu,''));
    for(/** Independent control font mappings preserve the same logical source script. */const item of control.glyphs)controlText.push(item.text.replace(/\s/gu,''));
    // PDF extraction can order separately colored RTL pieces differently; presentation-form code points still expose broken joining.
    expect(Array.from(actualText.join('')).sort()).toEqual(Array.from(controlText.join('')).sort());
    for(let line=0;line<5;line++){
      /** Actual physical line grouping allows only the control's documented subpixel baseline rounding. */
      const actualRows:typeof actual.glyphs=[],controlRows:typeof control.glyphs=[],ys:number[]=[];
      for(/** Native rows occupy distinct physical grid cells in the completed control PDF. */const item of control.glyphs)if(!ys.some(
        /**
         * Recognize an already observed physical baseline.
         *
         * Font pieces on the same original row may differ by PDF serialization noise.
         * @param {number} value - Previously observed physical PDF baseline.
         * @returns {boolean} Whether the item shares this original physical row.
         * @example
         * // Independent color runs remain one authored line.
         */
        value=>Math.abs(value-item.y)<1))ys.push(item.y);
      for(/** Source pieces retain the same original row despite vertical paint rounding. */const item of actual.glyphs)if(Math.abs(item.y-ys[line])<1)actualRows.push(item);
      for(/** The independent control owns its original physical glyph advances. */const item of control.glyphs)if(Math.abs(item.y-ys[line])<1)controlRows.push(item);
      expect(actualRows.length,`actual physical row ${line}`).toBeGreaterThan(0);
      /** One original 600dpi device pixel bounds this shaping comparison; exact source baseline tests retain their tighter limit. */
      const tolerance=72/600;
      expect(Math.abs(Math.min(...actualRows.map(printGlyphLeft))-Math.min(...controlRows.map(printGlyphLeft))),JSON.stringify({line,actualRows,controlRows})).toBeLessThan(tolerance);
      expect(Math.abs(Math.max(...actualRows.map(printGlyphRight))-Math.max(...controlRows.map(printGlyphRight))),JSON.stringify({line,actualRows,controlRows})).toBeLessThan(tolerance);
    }
    expect(actual.links.length).toBe(1);expect(actual.links[0].url).toBe('https://example.com/forhan-print');
    expect(actual.links[0].rect[2]-actual.links[0].rect[0]).toBeGreaterThan(10);
    await page.locator('#file-input').setInputFiles({name:'styled-print-roundtrip.html',mimeType:'text/html',buffer:Buffer.from(html)});
    await expect(page.locator('#toast')).toContainText('styled-print-roundtrip.html');
    await expect(page.locator('.tiptap svg[data-forhan-print-text],.tiptap forhan-print-source')).toHaveCount(0);
    await expect(page.locator('.tiptap a')).toHaveAttribute('href','https://example.com/forhan-print');
    for(let index=0;index<samples.length;index++)await expect(page.locator('.tiptap p').nth(index)).toHaveText(samples[index]);
  }finally{await output.close();}
}

/**
 * Read the physical left edge of one independently decoded PDF text item.
 *
 * Font mappings can group several source glyphs without changing their ink advance.
 * @param {import('./helpers/pdf.ts').PdfGlyphItem} glyph - Actual original PDF text item.
 * @returns {number} Physical left coordinate in PDF points.
 * @example
 * // Mapping this observer does not consult production layout metadata.
 */
function printGlyphLeft(glyph:import('./helpers/pdf.ts').PdfGlyphItem):number{return glyph.x;}

/**
 * Read the physical right advance of one independently decoded PDF text item.
 *
 * Actual embedded font advances remain independent from retained HTML attributes.
 * @param {import('./helpers/pdf.ts').PdfGlyphItem} glyph - Actual original PDF text item.
 * @returns {number} Physical right progression coordinate in PDF points.
 * @example
 * // Broken word shaping changes this actual completed PDF extent.
 */
function printGlyphRight(glyph:import('./helpers/pdf.ts').PdfGlyphItem):number{return glyph.x+glyph.width;}

test('real PDF printing preserves mixed marks, multilingual shaping and one clickable source link',verifyStyledPrint);
