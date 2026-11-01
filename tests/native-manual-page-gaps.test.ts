import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultNativePageView,projectNativePages} from '../src/ui/native-page-view.ts';

/** Original native coordinates retain independent cursor samples on three authored pages. */
interface NativeGapPoint {page:number;x:number;y:number;sourceX:number;sourceY:number;}
/** A real native source and unchanged complete screenshot bind one independently observed layout. */
interface NativeGapObservation {shape:'single'|'two';widthUnits:number;heightUnits:number;sourceSha256:string;captureSha256:string;points:NativeGapPoint[];}
/** Each allowed low manual caption has four native observations at the independently applied DPI. */
interface NativeGapCondition {percentage:number;dpi:number;gapUnits:number;observations:NativeGapObservation[];}

/**
 * Preserve measured original source gaps across manual captions and page layouts.
 *
 * Native cursor-to-document samples independently recover both page strides.
 * Required checked-in data covers every integer low caption on two physical
 * paper widths. Forhan must project those source distances without replacing
 * distinct adjacent captions with one rounded display-DPI minimum.
 *
 * @returns {void} Completes after all 92 native observations agree with projected source page cells.
 * @throws {AssertionError} If native evidence, page origins, physical source gaps or projection differs.
 * @example
 * node --test tests/native-manual-page-gaps.test.ts // Captions12 and13 share12DPI while retaining different gaps.
 */
function verifyNativeManualPageGaps():void{
  /** The reference is required on clean Windows and Mac checkouts without Hancom or private research. */
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-manual-page-gaps.json',import.meta.url),'utf8')) as {rows:NativeGapCondition[]};
  assert.equal(fixture.rows.length,23);
  for(
    /** Each independently requested caption retains its actual native display DPI and source gap. */
    const condition of fixture.rows
  ){
    assert.equal(condition.observations.length,4);
    assert.equal(condition.dpi,Math.round(condition.percentage*96/100));
    for(
      /** Width and arrangement holdouts share source gap semantics while retaining different page origins. */
      const observation of condition.observations
    ){
      assert.match(observation.sourceSha256,/^[a-f0-9]{64}$/u);assert.match(observation.captureSha256,/^[a-f0-9]{64}$/u);
      /** Pixel samples recover original source origins independently from Forhan's page projection. */
      const origins=[];
      for(
        /** Original page indices prove that samples address three distinct native source pages. */
        const point of observation.points
      )origins.push({page:point.page,x:point.x-point.sourceX*condition.dpi/7200,y:point.y-point.sourceY*condition.dpi/7200});
      assert.equal(origins[0].page,0);assert.equal(origins[1].page,1);assert.equal(origins[2].page,2);
      /** Logical cursor samples are integer HWP units, so inverse conversion permits under two source units of error. */
      const measured=observation.shape==='two'?(origins[1].x-origins[0].x)*7200/condition.dpi-observation.widthUnits:(origins[1].y-origins[0].y)*7200/condition.dpi-observation.heightUnits;
      assert.ok(Math.abs(measured-condition.gapUnits)<2);
      /** Physical authored dimensions remain unchanged while view cells retain the measured source gap. */
      const width=observation.widthUnits/75,height=observation.heightUnits/75,projection=projectNativePages(3,width,height,{...defaultNativePageView(),shape:observation.shape,columns:observation.shape==='two'?2:1},1395,condition.dpi/96,condition.percentage),
        actual=observation.shape==='two'?projection.cells[1].x-width:projection.cells[1].y-height;
      assert.ok(Math.abs(actual-condition.gapUnits/75)<1e-10);
      assert.ok(Math.abs(projection.cells[2].y-(observation.shape==='two'?1:2)*(height+condition.gapUnits/75))<1e-10);
    }
  }
}

test('92 original low-zoom observations retain distinct manual source gaps across paper widths and page layouts',verifyNativeManualPageGaps);
