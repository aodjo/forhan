import test from 'node:test';
import assert from 'node:assert/strict';
import CFB from 'cfb';
import {inflateSync,unzipSync,strFromU8} from 'fflate';
import {Schema} from '@tiptap/pm/model';
import {EditorState,Plugin} from '@tiptap/pm/state';
import {history,undo,redo,closeHistory} from '@tiptap/pm/history';
import {Step} from '@tiptap/pm/transform';
import {PageSettingsStep} from '../src/page-history.ts';
import {defaultPage} from '../src/documents.ts';
import {writeHwp} from '../src/formats/hwp-writer.ts';
import {readHwp,parseHwpRecords} from '../src/formats/hwp.ts';
import {writeHwpx,readHwpx} from '../src/formats/hwpx.ts';
import {paragraphSnapToGrid} from '../src/paragraph-line-grid.ts';
import {sectionGridDistance,hwpGridDistance} from '../src/section-grid.ts';
import {nativeGridAdvance} from '../src/native-grid-layout.ts';

/**
 * Verify native section axes and independent paragraph flags in actual file bytes.
 *
 * Raw binary offsets and literal XML expectations come from the published file
 * layout and original native saves, independently from the production readers.
 * Changed text is rewritten across formats so retained original bytes cannot
 * hide missing source fields.
 * @async
 * @returns {Promise<void>} Resolves after exact raw fields and edited conversions agree.
 * @throws {Error} If a native flag, section offset or edited source changes.
 * @example
 * // A 32.88pt section interval remains native integer 3288 in both formats.
 */
async function verifyNativeGridFiles():Promise<void>{
  for(/** Native default, explicitly disabled and enabled paragraphs use independent bit eight. */const snap of [undefined,false,true]){
    /** Actual source includes separately retained horizontal and manuscript settings. */
    const payload={page:{...defaultPage(),lineGrid:3288,charGrid:2000,wonggojiFormat:true},doc:{type:'doc',content:[{type:'paragraph',attrs:snap===undefined?{}:{nativeSnapToGrid:snap},content:[{type:'text',text:'A B'}]}]}},
      hwp=writeHwp(payload),cfb=CFB.read(hwp,{type:'buffer'}),info=CFB.find(cfb,'DocInfo')!,
      flags=parseHwpRecords(inflateSync(new Uint8Array(info.content!))).filter(
        /**
         * Inspect original raw paragraph-shape records without invoking the reader.
         *
         * Binary property tag twenty-five carries the native independent flag.
         * @param {{tag:number}} record - Actual decoded binary record header.
         * @returns {boolean} Whether this is a native paragraph-shape record.
         * @example
         * // Raw section controls cannot satisfy a paragraph bit assertion.
         */
        record=>record.tag===25);
    assert.ok(flags.length);
    assert.equal(new DataView(flags.at(-1)!.bytes.buffer,flags.at(-1)!.bytes.byteOffset).getUint32(0,true)&0x100,snap===false?0:0x100);
    for(/** Native section streams have container-owned prefixes in the compound file. */const [index,name] of cfb.FullPaths.entries())if(name.endsWith('/BodyText/Section0')){
      /** Raw native control offsets retain signed sixteen-bit axes independently. */
      const records=parseHwpRecords(inflateSync(new Uint8Array(cfb.FileIndex[index].content!)));
      for(/** Only the actual native section-definition control owns grid offsets. */const record of records)if(record.tag===71&&String.fromCharCode(...record.bytes.slice(0,4))==='dces'){
        /** Published control offsets retain the exact original hundredth-point units. */
        const view=new DataView(record.bytes.buffer,record.bytes.byteOffset);
        assert.equal(view.getInt16(10,true),3288);assert.equal(view.getInt16(12,true),2000);assert.equal((view.getUint32(4,true)>>>22)&1,1);
      }
    }
    /** Literal XML expectations remain independent from the shared readers. */
    const hwpx=await writeHwpx(payload),files=unzipSync(hwpx),header=strFromU8(files['Contents/header.xml']),section=strFromU8(files['Contents/section0.xml']);
    assert.ok(header.includes(`snapToGrid="${snap===false?0:1}"`));
    assert.match(section,/lineGrid="3288" charGrid="2000" wonggojiFormat="1"/);
    for(/** Actual imported formats undergo another content-changing conversion. */const parsed of [readHwp(hwp),await readHwpx(hwpx)]){
      assert.equal(parsed.page!.lineGrid,3288);assert.equal(parsed.page!.charGrid,2000);assert.equal(parsed.page!.wonggojiFormat,true);
      assert.equal(paragraphSnapToGrid(parsed.doc.content![0].attrs??{}),snap!==false);
      parsed.doc.content![0].content![0].text+=' edited';
      for(/** Both writers must retain independent native source through changed content. */const rewritten of [readHwp(writeHwp(parsed)),await readHwpx(await writeHwpx(parsed))]){
        assert.equal(rewritten.page!.lineGrid,3288);assert.equal(rewritten.page!.charGrid,2000);assert.equal(paragraphSnapToGrid(rewritten.doc.content![0].attrs??{}),snap!==false);
        assert.ok(rewritten.doc.content![0].content![0].text!.endsWith(' edited'));
      }
    }
  }
}
test('native line-grid fields survive raw bytes and edited cross-format saves',verifyNativeGridFiles);

/**
 * Reject invalid storage values before either native writer can wrap source.
 *
 * Wider XML axes remain available in HWPX while the binary writer explicitly
 * rejects values outside signed sixteen-bit positive storage.
 * @async
 * @returns {Promise<void>} Resolves after defaults, zero and format limits agree.
 * @throws {Error} If invalid source is silently coerced or truncated.
 * @example
 * // Native XML interval 40000 survives while binary export fails explicitly.
 */
async function verifyGridBounds():Promise<void>{
  assert.equal(paragraphSnapToGrid({}),true);assert.equal(sectionGridDistance(undefined),0);assert.equal(hwpGridDistance(32767),32767);
  for(/** Malformed explicit native settings must not become another valid interval. */const value of [-1,1.2,NaN,'bad',true])assert.throws(
    /**
     * Validate one actual malformed native interval.
     *
     * No binary writer is invoked until source validation succeeds.
     * @returns {number} A value only if validation incorrectly succeeds.
     * @example
     * // A negative interval raises RangeError.
     */
    ()=>sectionGridDistance(value),RangeError);
  /** Wider native XML source cannot fit a signed binary grid field. */
  const payload={doc:{type:'doc',content:[{type:'paragraph'}]},page:{...defaultPage(),lineGrid:40000}};
  assert.throws(
    /**
     * Attempt a real binary export of a wider original XML interval.
     *
     * The writer must fail before truncating to a negative signed field.
     * @returns {Uint8Array} Output only if binary source validation incorrectly succeeds.
     * @example
     * // HWPX and FHN remain available for this wider retained original.
     */
    ()=>writeHwp(payload),RangeError);
  assert.equal((await readHwpx(await writeHwpx(payload))).page!.lineGrid,40000);
}
test('native grid limits reject binary wrap while retaining wider XML',verifyGridBounds);

/**
 * Verify real history records document-level page settings without source text edits.
 *
 * Empty position maps must still undo and redo the registered page step. A
 * neighboring text edit stays independent from the native page configuration.
 * @returns {void} Checks actual history dispatch, inversion and JSON restoration.
 * @throws {Error} If native page history disappears or modifies document characters.
 * @example
 * // One undo restores the original page while leaving the original source intact.
 */
function verifyPageHistory():void{
  /** Minimal real schema isolates the native page step from unrelated extensions. */
  const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*'},text:{}}}),before=defaultPage(),after={...before,lineGrid:3288},step=new PageSettingsStep(before,after),
    observer=new Plugin<ReturnType<typeof defaultPage>>({state:{
      /**
       * Start with the actual original accepted page configuration.
       *
       * History operates independently from all document characters.
       * @returns {ReturnType<typeof defaultPage>} Original physical page source.
       * @example
       * // The source has no explicit vertical grid before the real step.
       */
      init:()=>before,
      /**
       * Observe actual registered page steps during history dispatch.
       *
       * Ordinary source edits cannot modify the independent native page state.
       * @param {import('@tiptap/pm/state').Transaction} transaction - Actual committed transform.
       * @param {ReturnType<typeof defaultPage>} page - Prior accepted page source.
       * @returns {ReturnType<typeof defaultPage>} Accepted page source after real steps.
       * @example
       * // A native undo transaction contains the inverted original page step.
       */
      apply:(transaction,page)=>{for(/** Actual inverse steps retain independent document configuration. */const candidate of transaction.steps)if(candidate instanceof PageSettingsStep)page=candidate.after;return page;},
    }});
  let state=EditorState.create({schema,plugins:[history(),observer]});
  /** Original source identity must survive the physical configuration step. */
  const original=state.doc;
  state=state.apply(closeHistory(state.tr).step(step));assert.strictEqual(state.doc,original);assert.equal(observer.getState(state)!.lineGrid,3288);
  /**
   * Commit an actual undo or redo transaction to the owning test state.
   *
   * The real history plugin generates and maps the registered page step.
   * @param {import('@tiptap/pm/state').Transaction} transaction - Actual generated history transform.
   * @returns {void} Applies the real history transaction.
   * @example
   * undo(state,dispatch); // Restores original page without adding a character.
   */
  function dispatch(transaction:import('@tiptap/pm/state').Transaction):void{state=state.apply(transaction);}
  assert.ok(undo(state,dispatch));assert.deepEqual(observer.getState(state),before);assert.strictEqual(state.doc,original);
  assert.ok(redo(state,dispatch));assert.deepEqual(observer.getState(state),after);
  assert.deepEqual(Step.fromJSON(schema,step.toJSON()).toJSON(),step.toJSON());assert.equal(step.getMap().map(12),12);
}
test('native page configuration has real single-step undo without document characters',verifyPageHistory);

/**
 * Keep exact native grid boundaries despite finite computed-CSS serialization.
 *
 * Literal expected intervals use native source units independently from the
 * production rounding code. Real one-unit increases and every positive
 * source advance remain distinguishable from conversion noise and literal zero.
 * @returns {void} Checks finite CSS boundary noise and exact adjacent native values.
 * @throws {Error} If rounding adds a grid line or consumes real positive source.
 * @example
 * // Computed 26.6667px is still one 20pt native grid interval.
 */
function verifyGridCssBoundaries():void{
  for(/** Expected native-unit results follow exact source intervals independently from computed CSS. */const [actual,grid,expected] of [[26.6667,2000,2000],[266.667,20000,20000],[42.6667,1600,3200],[2001/75,2000,4000],[1999/75,2000,2000],[1e-9,2000,2000],[0,2000,0]])
    assert.ok(Math.abs(nativeGridAdvance(actual,grid/75)-expected/75)<1e-8);
}
test('native grid boundaries ignore only computed CSS noise and retain a real source-unit increase',verifyGridCssBoundaries);
