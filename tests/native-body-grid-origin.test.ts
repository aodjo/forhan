import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {writeHwp} from '../src/formats/hwp-writer.ts';
import {readHwp} from '../src/formats/hwp.ts';
import {writeHwpx,readHwpx} from '../src/formats/hwpx.ts';
import {validatePage} from '../src/documents.ts';
import {nativePaperGeometry} from '../src/native-page-layout.ts';
import type {NativeBodyOriginFixture} from './helpers/native-body-grid-origin.ts';

/**
 * Retain independently observed native physical insets through both real native containers.
 *
 * Explicit zero header/footer values may be omitted by a reader's compact
 * representation, but validated source must retain zero rather than introduce
 * new-document defaults. Fractional components retain their independent source
 * rounding as observed in actual original native files.
 * @async
 * @returns {Promise<void>} Resolves after every source condition preserves its original integral paper geometry.
 * @throws {AssertionError} If a native container changes zero or fractional physical source insets.
 * @example
 * // A zero-header document keeps a zero header when native reader output is validated.
 */
async function verifyNativePhysicalInsets():Promise<void>{
  /** Expected paper fields come only from actual original application's generated native records. */
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-body-grid-origin.json',import.meta.url),'utf8')) as {rows:NativeBodyOriginFixture[]};
  assert.equal(fixture.rows.length,18);
  for(/** Both native formats must preserve identical original physical source components. */const row of fixture.rows){
    /** Native writers create real container bytes before their independent readers reconstruct settings. */
    const hwp=readHwp(writeHwp({doc:row.doc,page:row.source.page})),hwpx=await readHwpx(await writeHwpx({doc:row.doc,page:row.source.page})),
      expected={width:row.paper.width,height:row.paper.height,top:row.paper.top+row.paper.header,bottom:row.paper.bottom+row.paper.footer,left:row.paper.left,right:row.paper.right};
    for(/** Validation preserves original zero insets independently from new-document defaults. */const payload of [hwp,hwpx])assert.deepEqual(nativePaperGeometry(validatePage(payload.page)),expected,row.id);
  }
}

test('native HWP and HWPX retain actual original zero and independently rounded physical body insets',verifyNativePhysicalInsets);
