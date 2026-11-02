import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readHwp} from '../src/formats/hwp.ts';
import {readHwpx} from '../src/formats/hwpx.ts';
import {observeFallbackPlatformFonts} from './helpers/fallback-glyph-observation.ts';

/** Original Unicode includes decomposed modern Hangul without normalizing authored source. */
const ORDINARY_SOURCE='한글 가각간 가나다 가나다';
/** The native language table remains independent from the rendering-only fallback family. */
const NATIVE_FONTS=['맑은 고딕','Arial','Batang','MS Mincho','Arial','Segoe UI Symbol','Arial'];
/** Original bold source exercises both the actual bundled weight and native font-table retention. */
const NATIVE_SOURCE='굵은 한글 가나다';

/**
 * Read authored source text without inspecting rendering-only drawing nodes.
 *
 * Original native readers can split language runs while preserving exact Unicode.
 * Paragraph boundaries are excluded consistently with the controlled source fixture.
 * @param {Record<string,any>} node - Actual decoded source model node.
 * @returns {string} Original text concatenated in authored order.
 * @example
 * sourceText(payload.doc); // Retains decomposed Jamo codepoints exactly.
 */
function sourceText(node:Record<string,any>):string{
  let result=node.text??'';
  for(/** Original children retain their authored text independently of their mark boundaries. */const child of node.content??[])result+=sourceText(child);
  return result;
}

/**
 * Verify original source font names and the complete native language font table.
 *
 * Native and local formats must not inherit a rendering-only fallback family.
 * Language-specific mark splitting is allowed while original names stay literal.
 * @param {Record<string,any>} doc - Actual decoded original document.
 * @returns {void} Completes after original Unicode, names and native font slots agree.
 * @throws {Error} If a source output leaks a derived rendering family or changes a native table.
 * @example
 * verifyOriginalFontSource(readHwp(bytes).doc);
 */
function verifyOriginalFontSource(doc:Record<string,any>):void{
  expect(sourceText(doc)).toBe(ORDINARY_SOURCE+NATIVE_SOURCE);
  expect(JSON.stringify(doc)).not.toContain('Fhan Sans KR');
  /** Original model marks remain authoritative even after serialization merges adjacent runs. */
  const pending=[doc];
  let foundNative=false,foundOriginal=false;
  while(pending.length){
    /** Only actual decoded source attributes determine font preservation. */
    const node=pending.pop()!;
    for(/** Every original character-shape mark retains its independent language attributes. */const mark of node.marks??[]){
      if(mark.attrs?.fontFamily==='맑은 고딕')foundOriginal=true;
      if(mark.attrs?.nativeCharacterFonts){expect(mark.attrs.nativeCharacterFonts).toEqual(NATIVE_FONTS);foundNative=true;}
    }
    for(/** Actual reader-created source children are traversed without manufacturing expected marks. */const child of node.content??[])pending.push(child);
  }
  expect(foundOriginal).toBe(true);expect(foundNative).toBe(true);
}

/**
 * Save actual production output through the public browser export command.
 *
 * The observer is registered before the serializer is triggered. Complete bytes
 * come from the actual download rather than a test-side replacement writer.
 * @async
 * @param {Page} page - Actual owning production renderer.
 * @param {'forhan'|'hwp'|'hwpx'|'html'} format - Requested public output format.
 * @returns {Promise<Buffer>} Complete original downloaded output bytes.
 * @throws {Error} If the public export does not produce a readable download.
 * @example
 * const bytes=await saveFontSource(page,'hwpx');
 */
async function saveFontSource(page:Page,format:'forhan'|'hwp'|'hwpx'|'html'):Promise<Buffer>{
  /** The actual download belongs to the public operation that immediately follows. */
  const pending=page.waitForEvent('download');
  await page.locator('#export-menu-toggle').click();await page.locator(`[data-export="${format}"]`).click();
  /** Complete original serializer output remains independently decodable. */
  const downloaded=await pending;
  return readFile((await downloaded.path())!);
}

/**
 * Measure every modern Hangul glyph in both actual bundled production weights.
 *
 * A detached canvas reads intrinsic advances after the application's real font
 * bootstrap. No font, source style or expected geometry is injected by the test.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after all22344 actual glyph advances retain one em.
 * @throws {Error} If a bundled face is absent, invalid or has incompatible intrinsic advances.
 * @example
 * // The same actual assets are measured on Windows, Intel Mac and Apple Silicon.
 */
async function verifyBundledKoreanAdvances({page}:{page:Page}):Promise<void>{
  await page.goto('/');await expect(page.locator('.tiptap')).toBeVisible();
  /** Intrinsic real face measurements are independent from editor source wrappers. */
  const observed=await page.evaluate(
    /**
     * Inspect loaded production faces and intrinsic modern Hangul advances.
     *
     * Font data comes only from the application's actual shipped stylesheet.
     * Detached measurement does not modify the original editor or its model.
     * @returns {object} Loaded face identity and complete per-weight advance statistics.
     * @throws {Error} If actual canvas measurement is unavailable.
     * @example
     * measureBundledAdvances(); // Both actual weights cover11172 one-em syllables.
     */
    function measureBundledAdvances(){
      /** Explicit Korean shaping language follows the actual application document. */
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),weights=[],faces=[];
      if(!context)throw new Error('Actual bundled font canvas measurement is unavailable.');
      canvas.lang='ko';(context as CanvasRenderingContext2D&{lang?:string}).lang='ko';
      for(/** Only real production FontFace instances can establish loaded bundled weight coverage. */const face of document.fonts)if(face.family.includes('Fhan Sans KR'))faces.push({family:face.family,weight:face.weight,status:face.status});
      for(/** Both actual independently supplied weight files must retain the same original Korean cell advance. */const weight of ['400','700']){
        context.font=`${weight} 16px "Fhan Sans KR"`;
        let count=0,mismatches=0,maxDifference=0;
        for(let codepoint=0xac00;codepoint<=0xd7a3;codepoint++){
          /** Original Unicode scalars are measured without width transforms, tracking or drawing widgets. */
          const width=context.measureText(String.fromCodePoint(codepoint)).width,difference=Math.abs(width-16);
          count++;maxDifference=Math.max(maxDifference,difference);if(difference>1/64)mismatches++;
        }
        weights.push({weight,count,mismatches,maxDifference,decomposedWidth:context.measureText('가나다').width});
      }
      return{faces,weights};
    });
  await test.info().attach('actual-bundled-korean-advances',{body:JSON.stringify(observed),contentType:'application/json'});
  expect(observed.faces).toHaveLength(2);
  for(/** Actual loaded files rather than a generic fallback supply both declared production weights. */const face of observed.faces){expect(face.status).toBe('loaded');expect(['400','700']).toContain(face.weight);}
  for(/** Every original modern Hangul glyph is independently included in the intrinsic face check. */const weight of observed.weights){expect(weight.count).toBe(11172);expect(weight.mismatches).toBe(0);expect(weight.maxDifference).toBeLessThanOrEqual(1/64);expect(weight.decomposedWidth).toBeCloseTo(48,3);}
}

test('both shipped Korean weights retain all modern intrinsic Hangul advances without source transforms',verifyBundledKoreanAdvances);

/**
 * Retain original source fonts through native outputs and self-contained HTML.
 *
 * Actual original document markup requests Malgun while the production fallback
 * supplies missing Korean glyphs. The same source and seven-language font table
 * survive HWPX, HWP, FHN, HTML reopening and an external authoritative font edit.
 * @async
 * @param {{page:Page}} context - Actual isolated production renderer.
 * @returns {Promise<void>} Resolves after genuine outputs preserve original source and licensed offline fonts.
 * @throws {Error} If a source name changes, a fallback leaks into the model or standalone font data is absent.
 * @example
 * // Opening the HTML on a Mac without Malgun retains both actual Korean advance and original editable face names.
 */
async function verifyPortableFontOutputs({page}:{page:Page}):Promise<void>{
  test.setTimeout(90000);
  await page.goto('/');await expect(page.locator('.tiptap')).toBeVisible();
  await page.locator('#file-input').setInputFiles({name:'portable-original-fonts.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:ORDINARY_SOURCE,marks:[{type:'textStyle',attrs:{fontFamily:'맑은 고딕',fontSize:'16pt',nativeUseFontSpace:false,nativeUseKerning:false}}]}]},{type:'paragraph',content:[{type:'text',text:NATIVE_SOURCE,marks:[{type:'bold'},{type:'textStyle',attrs:{fontFamily:'맑은 고딕',fontSize:'16pt',nativeUseFontSpace:false,nativeUseKerning:false,nativeCharacterFonts:NATIVE_FONTS}}]}]}]}}))});
  await expect(page.locator('#toast')).toContainText('portable-original-fonts');
  await expect(page.locator('.tiptap')).toHaveText(ORDINARY_SOURCE+NATIVE_SOURCE);
  /** Actual resolved native font identity remains independent from a requested CSS family label. */
  const fonts=await observeFallbackPlatformFonts(page,'.tiptap') as {available:boolean;fonts?:Array<{postScriptName:string;glyphCount:number}>};
  await test.info().attach('original-requested-font-platform-faces',{body:JSON.stringify(fonts),contentType:'application/json'});
  expect(fonts.available).toBe(true);
  expect(fonts.fonts?.some(
    /**
     * Require an actual original or bundled Korean face behind the real source.
     *
     * A generic system fallback or a requested CSS label cannot establish the face used.
     * @param {{postScriptName:string;glyphCount:number}} font - Actual protocol font observation.
     * @returns {boolean} Whether a genuine source Korean face rendered original glyphs.
     * @example
     * isOriginalOrPortableKoreanFace(font); // true for actual Malgun or Fhan source glyphs.
     */
    function isOriginalOrPortableKoreanFace(font){return /^(?:MalgunGothic|FhanSansKR)/u.test(font.postScriptName)&&font.glyphCount>0;}
  )).toBe(true);
  for(/** Every actual native and local output uses the unchanged source model. */const format of ['hwpx','hwp','forhan'] as const){
    /** Original downloaded bytes are independently decoded by their real format reader. */
    const bytes=await saveFontSource(page,format),payload=format==='hwpx'?await readHwpx(bytes):format==='hwp'?readHwp(bytes):JSON.parse(bytes.toString('utf8'));
    verifyOriginalFontSource(payload.doc);
  }
  /** Complete original HTML is retained for a real offline standalone opening. */
  const htmlBytes=await saveFontSource(page,'html'),html=htmlBytes.toString('utf8'),file=test.info().outputPath('portable-original-fonts.html');
  expect(html).toContain('data-forhan-font-family');expect(html).toContain('SIL OPEN FONT LICENSE');expect(html).toContain('Fhan Sans KR');expect(html).toMatch(/src:url\("data:[^;]+;base64,/u);
  await writeFile(file,htmlBytes);
  /** A separate actual browser document uses only the emitted standalone bytes. */
  const standalone=await page.context().newPage();
  try{
    await standalone.goto(pathToFileURL(file).href);await standalone.evaluate(
      /**
       * Await actual fonts requested by the emitted offline standalone document.
       *
       * No editor script, network resource or reference font is injected.
       * @async
       * @returns {Promise<void>} Resolves after original standalone font loading settles.
       * @example
       * await waitForStandaloneFonts();
       */
      async function waitForStandaloneFonts(){await document.fonts.ready;}
    );
    expect(await standalone.locator('body').innerText()).toContain(ORDINARY_SOURCE);
    await test.info().attach('standalone-platform-faces',{body:JSON.stringify(await observeFallbackPlatformFonts(standalone,'body')),contentType:'application/json'});
  }finally{await standalone.close();}
  await page.locator('#file-input').setInputFiles({name:'portable-font-roundtrip.html',mimeType:'text/html',buffer:htmlBytes});await expect(page.locator('#toast')).toContainText('portable-font-roundtrip');
  verifyOriginalFontSource(JSON.parse((await saveFontSource(page,'forhan')).toString('utf8')).doc);
  /** An external author changes actual ordinary CSS while leaving older source metadata untouched. */
  const external=await page.evaluate(
    /**
     * Edit the emitted standalone input as an independent HTML author would.
     *
     * The captured document is detached; no live editor or expected geometry is changed.
     * Older rendering metadata must not overrule the author's newer actual CSS.
     * @param {string} html - Original emitted standalone HTML source.
     * @returns {string} Authored HTML with an explicit ordinary Arial override.
     * @throws {Error} If original ordinary source metadata is absent.
     * @example
     * editExternalSourceFont(html); // Original source metadata remains deliberately stale.
     */
    function editExternalSourceFont(html){
      /** Only the first ordinary source span is edited in this independent input document. */
      const parsed=new DOMParser().parseFromString(html,'text/html'),span=parsed.querySelector<HTMLElement>('[data-forhan-font-family]');
      if(!span)throw new Error('The emitted ordinary source font metadata is absent.');
      span.style.fontFamily='Arial';return '<!doctype html>'+parsed.documentElement.outerHTML;
    },html
  );
  await page.locator('#file-input').setInputFiles({name:'external-portable-font-edit.html',mimeType:'text/html',buffer:Buffer.from(external)});await expect(page.locator('#toast')).toContainText('external-portable-font-edit');
  /** Actual reimported source must accept the newer external ordinary font choice. */
  const edited=JSON.parse((await saveFontSource(page,'forhan')).toString('utf8')).doc;
  verifyOriginalFontSource(edited);expect(JSON.stringify(edited.content[0])).toContain('"fontFamily":"Arial"');expect(JSON.stringify(edited.content[0])).not.toContain('"fontFamily":"맑은 고딕"');
}

test('portable Korean rendering preserves source font names and native language tables in every editable output',verifyPortableFontOutputs);
