import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {desktopLaunchOptions} from './helpers/desktop-launch.ts';
import {saveDesktopOutput} from './helpers/native-output.ts';
import {observePdf} from './helpers/pdf.ts';
import type {JSONContent} from '@tiptap/core';
import {defaultPage} from '../src/documents.ts';

/**
 * Decode actual desktop PDFs for fractional grid leading, links and pagination.
 *
 * The selected application writes every byte through its public native output
 * operation. Real embedded font mappings and physical matrices are decoded by
 * an independent reader. Retained file hashes bind these observations to the
 * actual executable and archive rather than to development HTML.
 * @async
 * @returns {Promise<void>} Resolves after exact source progression and all multipage rows survive native output.
 * @throws {Error} If actual output loses source, rounds native baselines or drops a clickable link.
 * @example
 * // The packaged gate observes the real distribution's print-to-PDF renderer.
 */
async function verifyDesktopFractionalPrint():Promise<void>{
  test.setTimeout(90000);
  /** Each native process owns one disposable profile and retained output directory. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-fractional-print-')),desktop=await electron.launch(desktopLaunchOptions(profile)),outputRoot=process.env.FORHAN_PACKAGED_EXECUTABLE?path.resolve('release/validation/fractional-print',randomUUID()):path.join(profile,'outputs');
  try{
    await mkdir(outputRoot,{recursive:true});
    /** Runtime identity comes from inside the actual selected native process. */
    const identity=await desktop.evaluate(
      /**
       * Observe actual native process ownership and application resources.
       *
       * The distribution must identify itself independently from launch arguments.
       * @param {typeof import('electron')} context - Actual running native exports.
       * @returns {{packaged:boolean;executable:string;application:string}} Actual runtime identity.
       * @example
       * // Development Electron cannot satisfy a packaged execution claim.
       */
      ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}));
    if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
    /** Original native source observations remain independent from production layout code. */
    const matrix=JSON.parse(await readFile('tests/fixtures/native-line-grid.json','utf8')),page=await desktop.firstWindow(),records:unknown[]=[],hashes=identity.packaged?{executableSha256:createHash('sha256').update(await readFile(identity.executable)).digest('hex'),archiveSha256:createHash('sha256').update(await readFile(identity.application)).digest('hex')}:{};
    await expect(page.locator('.tiptap')).toBeVisible();
    for(/** Separate paragraph preferences expose centering that constant line-cache starts cannot detect. */const id of ['spacing-boundary-before-after32-snap1-next0','painted-h1000-g1600-s1-p170']){
      /** Literal generated source retains its original native input hash and real PDF reference. */
      const row=matrix.rows.find(findPrintFixture.bind(null,id));
      expect(row,`original fixture ${id}`).toBeTruthy();
      await page.locator('#file-input').setInputFiles({name:id+'.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:row.page,doc:row.doc}))});
      await expect(page.locator('#toast')).toContainText(id);
      /** Production native PDF bytes are observed independently after the atomic save finishes. */
      const file=path.join(outputRoot,id+'.pdf'),bytes=await saveDesktopOutput(desktop,page,'pdf',file),pdf=await observePdf(bytes),positions:number[]=[],letters:string[]=[];
      for(/** Independently decoded actual font CMaps reveal missing or duplicate source glyphs. */const glyph of pdf.glyphs)for(/** Generated source has one original A/B/C/D glyph on each observed line. */const letter of glyph.text)if(/[ABCD]/u.test(letter)){letters.push(letter);positions.push((pdf.glyphs[0].y-glyph.y)*100);}
      expect(letters.join('')).toBe(row.glyphPositions.length===2?'AB':'ABCD');
      for(let index=0;index<positions.length;index++){
        expect(Math.abs(positions[index]-row.glyphPositions[index]),id).toBeLessThanOrEqual(2);
        expect(Math.abs(positions[index]-row.nativePdfGlyphPositions[index]),id).toBeLessThanOrEqual(72/row.nativeDeviceDpi*100+2);
      }
      records.push({id,file,sha256:createHash('sha256').update(bytes).digest('hex'),positions,originalPdfSha256:row.nativePdfSha256});
    }
    /** Eighty original rows exercise a real multipage single-paragraph print fragment with a clickable source link. */
    const content:JSONContent[]=[],expected:string[]=[],marks=[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'10pt'}}];
    for(let index=0;index<80;index++){
      /** Authored source identifiers must survive exactly once in actual embedded PDF text. */
      const text='row'+String(index).padStart(3,'0');expected.push(text);
      if(index)content.push({type:'hardBreak'});
      content.push({type:'text',text,marks:index===0?[...marks,{type:'link',attrs:{href:'https://example.com/forhan-print'}}]:marks});
    }
    await page.locator('#file-input').setInputFiles({name:'fractional-native-pages.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:{...defaultPage(),lineGrid:3288},doc:{type:'doc',content:[{type:'paragraph',attrs:{lineHeight:'100%',nativeSnapToGrid:true},content}]}}))});
    await expect(page.locator('#toast')).toContainText('fractional-native-pages.fhn');
    /** Actual completed print bytes carry original searchable row text and PDF link annotations. */
    const file=path.join(outputRoot,'fractional-native-pages.pdf'),bytes=await saveDesktopOutput(desktop,page,'pdf',file),pdf=await observePdf(bytes),actual:string[]=[];
    for(/** Actual original font mappings remain independent from HTML source strings. */const item of pdf.glyphs)for(/** Every original row must occur once across the physical native output pages. */const match of item.text.matchAll(/row\d{3}/gu))actual.push(match[0]);
    expect(pdf.pages).toBeGreaterThan(1);expect(actual).toEqual(expected);expect(pdf.links.length).toBe(1);expect(pdf.links[0].url).toBe('https://example.com/forhan-print');
    for(/** Actual searchable glyphs must also lie on their physical output page. */const glyph of pdf.glyphs){
      expect(glyph.y,JSON.stringify(glyph)).toBeGreaterThanOrEqual(pdf.pageBounds[glyph.page-1][1]);
      expect(glyph.y,JSON.stringify(glyph)).toBeLessThanOrEqual(pdf.pageBounds[glyph.page-1][3]);
    }
    records.push({id:'fractional-native-pages',file,sha256:createHash('sha256').update(bytes).digest('hex'),pages:pdf.pages,glyphs:pdf.glyphs,links:pdf.links});
    await writeFile(path.join(outputRoot,'run.json'),JSON.stringify({kind:'actual-desktop-fractional-PDF-font-matrices-grid-leading-links-and-pagination',identity,...hashes,records},null,2)+'\n');
  }finally{
    if(desktop.process().exitCode===null)await desktop.evaluate(
      /**
       * Exit only the isolated native process owned by this regression.
       *
       * Retained evidence lives outside the disposable profile directory.
       * @param {typeof import('electron')} context - Actual owned native exports.
       * @returns {void} Exits without an unrelated save dialog.
       * @example
       * // User applications remain outside this cleanup.
       */
      ({app})=>app.exit(0));
    await desktop.close();
    if(path.dirname(profile)===path.resolve(tmpdir())&&path.basename(profile).startsWith('forhan-fractional-print-'))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
}

/**
 * Select one literal original native print fixture by its stable identifier.
 *
 * No geometry is generated by the selector; expected positions remain actual reference data.
 * @param {string} id - Original source condition identifier.
 * @param {{id:string}} row - Independently generated original reference projection.
 * @returns {boolean} Whether this exact original condition was selected.
 * @example
 * // Array.find uses this observer without consulting production rounding code.
 */
function findPrintFixture(id:string,row:{id:string}):boolean{return row.id===id;}

test('actual desktop PDFs retain native grid leading, fractional text, links and all paginated rows',verifyDesktopFractionalPrint);
