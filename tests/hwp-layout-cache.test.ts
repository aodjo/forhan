import test from 'node:test';
import assert from 'node:assert/strict';
import CFB from 'cfb';
import {inflateSync} from 'fflate';
import {writeHwp} from '../src/formats/hwp-writer.ts';
import {parseHwpRecords,readHwp} from '../src/formats/hwp.ts';
import {characterMetrics} from '../src/character-metrics.ts';

/**
 * Preserve complete authored layout inputs without exporting invented line caches.
 *
 * Visible native observations show that a cached ten-point control-prefix line
 * can overlap genuine thirty-two-point glyphs despite correct character shapes.
 * Zero cached-line counts make the native application calculate actual advances
 * and wrapping from original source text, fonts and paragraph definitions.
 * @returns {void} Asserts native recomputation, complete source data and lossless unchanged reuse.
 * @throws {AssertionError} If a generated layout cache overrides original source formatting.
 * @example
 * // Two-hundred-percent Hebrew and Latin retain their actual native source inputs.
 */
function verifyNativeLayoutRecompute():void {
  /** Independent measurements expose the original cache's control-prefix default-height error. */
  const metrics=characterMetrics(null);
  metrics.ratio.fill(200);
  metrics.spacing.fill(20);
  /** Real nested paragraphs exercise the same native cache policy inside tables. */
  const bytes=writeHwp({doc:{type:'doc',content:[
    {type:'paragraph',attrs:{lineHeight:'1.6'},content:[{type:'text',text:'ABC עברית 123 한글',marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'32pt',nativeCharacterMetrics:metrics}}]}]},
    {type:'paragraph',attrs:{lineHeight:'0pt'},content:[{type:'text',text:'앞',marks:[{type:'textStyle',attrs:{fontSize:'24pt'}}]},{type:'hardBreak'},{type:'text',text:'뒤',marks:[{type:'textStyle',attrs:{fontSize:'16pt'}}]}]},
    {type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:1,rowspan:1},content:[{type:'paragraph',content:[{type:'text',text:'표 안의 원문'}]}]}]}]},
  ]}}),
    container=CFB.read(bytes,{type:'array'}),
    index=container.FullPaths.findIndex(
      /**
       * Locate the genuine native body stream in the complete OLE container.
       *
       * The assertion reads output bytes independently of the source writer's
       * private record builders or control-prefix styling decisions.
       * @param {string} path - Original compound-document stream path.
       * @returns {boolean} Whether this is the first native section stream.
       * @example
       * // Root Entry/BodyText/Section0 contains every tested paragraph.
       */
      path=>path.endsWith('/BodyText/Section0')),
    records=parseHwpRecords(inflateSync(new Uint8Array(container.FileIndex[index].content))),
    parsed=readHwp(bytes);
  let paragraphs=0;
  for(/** All source paragraph levels must invalidate uncomputed line geometry consistently. */const record of records){
    assert.notEqual(record.tag,69,'A generated cache must not override actual font advances.');
    if(record.tag===66){
      paragraphs++;
      assert.equal(new DataView(record.bytes.buffer,record.bytes.byteOffset,record.bytes.byteLength).getUint16(16,true),0);
    }
  }
  assert.equal(paragraphs,4);
  let text='';
  for(/** Native script normalization may split source marks without changing authored text. */const run of parsed.doc.content![0].content!)text+=run.text||'';
  assert.equal(text,'ABC עברית 123 한글');
  for(/** Every normalized source script retains the independently authored native definition. */const run of parsed.doc.content![0].content!)
  for(/** Every retained script definition keeps explicit source width independently of cached geometry. */const mark of run.marks||[])
    if(mark.type==='textStyle'){
      assert.equal(mark.attrs!.fontSize,'32pt');
      assert.deepEqual(characterMetrics(mark.attrs!.nativeCharacterMetrics).ratio,metrics.ratio);
      assert.deepEqual(characterMetrics(mark.attrs!.nativeCharacterMetrics).spacing,metrics.spacing);
    }
  assert.equal(parsed.doc.content![1].attrs!.lineHeight,'0pt');
  assert.equal(parsed.doc.content![1].content![1].type,'hardBreak');
  assert.equal(parsed.doc.content![2].type,'table');
  assert.deepEqual(writeHwp({doc:parsed.doc,page:parsed.page,original:parsed.original}),bytes);
}

test('authored HWP preserves actual layout inputs and requests native reflow instead of stale line caches',verifyNativeLayoutRecompute);
