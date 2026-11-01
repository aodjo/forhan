import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paginateNativeParagraphs,snapNativePageDistance,type NativePaginationParagraph} from '../src/native-pagination.ts';
import {nativeProportionalAdvance,nativeLineBaseline} from '../src/native-line-layout.ts';
import {fixedLineSpacingMaximum} from '../src/line-spacing.ts';

/**
 * Compare native page placement against actual original PDF pages and line caches.
 *
 * Literal reference data comes from independent original application printing.
 * Both hard-break and separate paragraph source retain original page membership,
 * strict fit boundaries, before/after spacing and explicit page breaks.
 * @returns {void} Verifies all sixty-three independent physical source conditions.
 * @throws {AssertionError} If page membership, source progression or native glyph baselines differ.
 * @example
 * // Exact last-line equality moves to the next native page; one extra unit admits it.
 */
function verifyNativePagination():void{
  /** Actual original observations never use the production pagination algorithm to generate expected positions. */
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-pagination.json',import.meta.url),'utf8'));
  assert.equal(fixture.rows.length,63);
  for(/** Each original native file retains an independent input, native cache and PDF identity. */const row of fixture.rows){
    /** Source conditions build measured lines without consulting expected cache or PDF positions. */
    const source=row.source,paragraphs:NativePaginationParagraph[]=[],advance=nativeProportionalAdvance(source.font,source.percent);
    for(let index=0;index<(source.separate?source.count:1);index++){
      /** Original paragraph preferences are preserved separately from physical source line geometry. */
      const paragraph:NativePaginationParagraph={before:source.before,after:source.after,snap:source.snap,pageBreakBefore:index===source.breakBefore,lines:[]};
      for(let line=0;line<(source.separate?1:source.count);line++)paragraph.lines.push({height:source.font,advance});
      paragraphs.push(paragraph);
    }
    /** Native page components round independently before deriving the actual physical body height. */
    const body=Math.round(fixedLineSpacingMaximum(source.page)*100),layout=paginateNativeParagraphs(paragraphs,body,source.page.lineGrid??0);
    assert.equal(body,row.bodyHeight,row.id);assert.equal(layout.pages.length,row.pages.length,row.id);assert.equal(layout.lines.length,source.count,row.id);
    let offset=0;
    for(let page=0;page<layout.pages.length;page++){
      assert.equal(layout.pages[page].length,row.pages[page].labels.length,row.id);
      for(let line=0;line<layout.pages[page].length;line++){
        /** The PDF independently assigns each original label to its actual physical page. */
        const placement=layout.pages[page][line],cache=row.cache[offset];
        assert.equal(row.pages[page].labels[line],'row'+String(offset).padStart(3,'0'),row.id);
        assert.equal(placement.top,cache.position,`${row.id}: original logical cache start`);
        assert.ok(Math.abs(placement.baseline-row.pages[page].baselines[line])<=12.01,`${row.id}: independently decoded original PDF baseline`);
        assert.equal(placement.page,page,row.id);offset++;
      }
    }
  }
}

test('63 original native PDF conditions retain exact page membership, strict fit and independent paragraph spacing',verifyNativePagination);

/**
 * Verify original proportional gap quantization and integral glyph baselines.
 *
 * The source-height sweep includes adjacent hundredth points, signed half ties
 * and zero-percent remainders. Actual native PDF matrices cross-check each
 * original cache progression within one observed printer device pixel.
 * @returns {void} Verifies all forty-nine independent original source conditions.
 * @throws {AssertionError} If source geometry differs from actual native observations.
 * @example
 * // A 19.99pt source at 170 percent advances 33.95pt in original native caches.
 */
function verifyNativeProportionalSpacing():void{
  /** Full original line caches and actual printed glyph matrices retain independent hashes. */
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-proportional-spacing.json',import.meta.url),'utf8'));
  assert.equal(fixture.rows.length,49);
  for(/** Each adjacent original source size is observed independently. */const row of fixture.rows){
    /** Original font height and percentage alone determine production progression. */
    const advance=nativeProportionalAdvance(row.font,row.percent),baseline=nativeLineBaseline(row.font/75)*75;
    for(let index=0;index<row.lines.length;index++){
      assert.equal(advance,row.lines[index].height+row.lines[index].spacing,row.id);
      assert.ok(Math.abs(baseline-row.lines[index].baseline)<1e-8,row.id);
      assert.equal(advance*index,row.lines[index].position,row.id);
      assert.ok(Math.abs(advance*index-row.nativePdfPositions[index])<=12.01,row.id);
    }
  }
}

test('49 original native font sizes retain proportional gap quantum, signed ties and zero-percent residues',verifyNativeProportionalSpacing);

/**
 * Verify native zero-percent remainders interact with an independent grid.
 *
 * Actual original PDFs confirm that a one-unit proportional remainder can
 * advance a full grid cell, while a true zero source interval stays overlapped.
 * Fixed zero remains independent from the proportional native source path.
 * @returns {void} Verifies all five independently printed native grid boundaries.
 * @throws {AssertionError} If native overlap or positive grid progression is lost.
 * @example
 * // Original 10.01pt at zero percent advances 16pt on a 16pt grid.
 */
function verifyNativeZeroGrid():void{
  /** Literal original source and actual physical glyph observations retain independent native hashes. */
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-proportional-spacing.json',import.meta.url),'utf8'));
  assert.equal(fixture.gridRows.length,5);
  for(/** Every original condition distinguishes zero source progression from a positive native remainder. */const row of fixture.gridRows){
    /** Production progression derives only from original font, percentage and section source. */
    const advance=snapNativePageDistance(nativeProportionalAdvance(row.font,row.percent),row.grid);
    for(let index=0;index<row.lines.length;index++){
      assert.equal(advance*index,row.lines[index].position,row.id);
      assert.ok(Math.abs(advance*index-row.nativePdfPositions[index])<=12.01,row.id);
    }
  }
}

test('five actual native grid PDFs distinguish true zero overlap from proportional source residues',verifyNativeZeroGrid);
