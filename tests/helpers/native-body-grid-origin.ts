import {expect,type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import {editableSheetGeometry,type EditableSheetGeometry} from './editable-sheets.ts';
import type {NativePaginationFixture} from './native-pagination.ts';
import {observePdfColorBoxes,type PdfColorBox,type PdfObservation} from './pdf.ts';

/** Actual original shaded source retains independent physical page components and source paragraph structure. */
export interface NativeBodyOriginFixture extends NativePaginationFixture {
  nativeHwpSha256:string;
  doc:JSONContent;
  paper:{width:number;height:number;top:number;bottom:number;left:number;right:number;header:number;footer:number};
  nativeBackgrounds:Array<{page:number;left:number;top:number;right:number;bottom:number}>;
}

/**
 * Verify the actual first physical body's glyph coordinates against original native printing.
 *
 * Rich source may use complete continuous flow until its independent paint is
 * projected onto physical sheets. The first body origin and all source rows
 * before the first native page boundary must already match the original
 * application. Expected positions never come from production grid functions.
 * @async
 * @param {Page} page - Actual browser or selected native application renderer.
 * @param {NativeBodyOriginFixture} row - Independent original native source and physical PDF observations.
 * @param {string} [selector='.tiptap'] - Actual original editable or standalone content root.
 * @returns {Promise<EditableSheetGeometry>} Verified actual source rectangles and paper origin.
 * @throws {Error} If original source is missing, duplicated or displaced from its native first physical body.
 * @example
 * await verifyNativeBodyOrigin(page,row); // A text shade cannot move a 35mm body inset to the paper edge.
 */
export async function verifyNativeBodyOrigin(page:Page,row:NativeBodyOriginFixture,selector='.tiptap'):Promise<EditableSheetGeometry>{
  let geometry:EditableSheetGeometry|undefined;
  await expect(
    /**
     * Read actual glyph placement after dependent native rendering has settled.
     *
     * Each attempt preserves the original absolute source-coordinate oracle,
     * including independently rounded header and top-margin components.
     * @async
     * @returns {Promise<void>} Resolves only after all first-body glyphs agree with actual original printing.
     * @throws {Error} If current actual source placement disagrees with the original physical body.
     * @example
     * // A matching page-count attribute cannot hide a glyph drawn in the top margin.
     */
    async()=>{
      geometry=await page.locator(selector).evaluate(editableSheetGeometry);
      await page.evaluate(
        /**
         * Observe another real browser frame without synthesizing a source update.
         *
         * Stable native drawing must leave actual source caret geometry unchanged.
         * @returns {Promise<number>} Resolves at the next actual rendering opportunity.
         * @example
         * // A continuously drifting decoration cannot pass because one frame happens to match a native coordinate.
         */
        ()=>new Promise(requestAnimationFrame));
      /** Consecutive actual source rectangles must remain stable while the document is unchanged. */
      const next=await page.locator(selector).evaluate(editableSheetGeometry);
      expect(next.rows,`${row.id}: stable original source geometry`).toEqual(geometry.rows);geometry=next;
      expect(geometry.rows.length,row.id).toBe(row.source.count);
      for(let index=0;index<geometry.rows.length;index++)expect(geometry.rows[index].label,row.id).toBe('row'+String(index).padStart(3,'0'));
      for(let index=0;index<row.pages[0].labels.length;index++){
        /** Physical glyph positions are measured independently from retained layout attributes. */
        const actual=geometry.rows[index],baseline=(actual.baseline-geometry.paperTop)/geometry.zoom*75-geometry.border*75-row.paper.top-row.paper.header,
          physicalBottom=geometry.paperTop+(row.paper.height/75+2*geometry.border)*geometry.zoom;
        expect(actual.label,row.id).toBe(row.pages[0].labels[index]);expect(actual.baseline,row.id).toBeGreaterThan(geometry.paperTop);expect(actual.baseline,row.id).toBeLessThan(physicalBottom);
        expect(Math.abs(baseline-row.pages[0].baselines[index]),`${row.id}: native body ${actual.label}`).toBeLessThanOrEqual(14);
      }
    }).toPass({timeout:5000,intervals:[16,32,64,100]});
  return geometry!;
}

/**
 * Verify complete PDF source and original first-body glyph positions independently.
 *
 * Actual completed PDF font mappings must retain every source row exactly once.
 * First-body coordinates use the original application's physical observations;
 * continuation-page membership and background paint remain separate contracts.
 * @param {PdfObservation} pdf - Independently decoded actual completed native PDF bytes.
 * @param {NativeBodyOriginFixture} row - Literal original source, paper and first-body observations.
 * @returns {Array<{label:string;baseline:number}>} Actual independently observed first-page source rows.
 * @throws {Error} If source duplicates, disappears or moves from its original first physical body.
 * @example
 * verifyNativeBodyOriginPdf(await observePdf(actualBytes),row); // No production layout function supplies expectations.
 */
export function verifyNativeBodyOriginPdf(pdf:PdfObservation,row:NativeBodyOriginFixture):Array<{label:string;baseline:number}>{
  /** All physical output pages contribute actual source labels; only the first supplies the body-origin oracle. */
  const labels:string[]=[],first:Array<{label:string;baseline:number}>=[];
  for(/** Embedded font mappings identify actual source rather than retained drawing metadata. */const glyph of pdf.glyphs)for(/** Stable source identifiers expose missing or duplicated source across physical pages. */const match of glyph.text.matchAll(/row\d{3}/gu)){
    labels.push(match[0]);if(glyph.page===1)first.push({label:match[0],baseline:(pdf.pageBounds[0][3]-glyph.y)*100-row.paper.top-row.paper.header});
  }
  expect(labels.length,row.id).toBe(80);
  for(let index=0;index<labels.length;index++)expect(labels[index],row.id).toBe('row'+String(index).padStart(3,'0'));
  expect(first.length,row.id).toBeGreaterThanOrEqual(row.pages[0].labels.length);
  for(let index=0;index<row.pages[0].labels.length;index++){
    expect(first[index].label,row.id).toBe(row.pages[0].labels[index]);expect(Math.abs(first[index].baseline-row.pages[0].baselines[index]),`${row.id}: ${first[index].label} at ${first[index].baseline}, original ${row.pages[0].baselines[index]}`).toBeLessThanOrEqual(14);
  }
  return first;
}

/**
 * Compare actual opaque PDF shading with independently decoded original native fill paths.
 *
 * Original native page-device fitting affects background paint separately from
 * searchable text matrices. Actual PDF graphics-state operators establish both
 * completed files' physical fill coverage without using renderer attributes.
 * Exactly touching native paragraph-end pieces represent one source shade.
 * @async
 * @param {Uint8Array} bytes - Actual completed production PDF bytes.
 * @param {PdfObservation} pdf - Independently decoded physical bounds from those same completed bytes.
 * @param {NativeBodyOriginFixture} row - Literal original native shade coverage in original source units.
 * @returns {Promise<PdfColorBox[]>} Independently verified actual native opaque fill coverage.
 * @throws {Error} If a source shade disappears, duplicates or differs from an actual original path beyond native printer precision.
 * @example
 * await verifyNativeBodyBackgroundPdf(bytes,await observePdf(bytes),row); // One observed printer pixel plus two source units is retained.
 */
export async function verifyNativeBodyBackgroundPdf(bytes:Uint8Array,pdf:PdfObservation,row:NativeBodyOriginFixture):Promise<PdfColorBox[]>{
  /** Actual fill operators determine opaque coverage independently from the source model and production SVG. */
  const boxes=await observePdfColorBoxes(bytes);expect(boxes.length,row.id).toBe(80);expect(row.nativeBackgrounds.length,row.id).toBe(80);
  for(let index=0;index<boxes.length;index++){
    /** Physical page coordinates normalize independently from separately rounded native paper components. */
    const box=boxes[index],expected=row.nativeBackgrounds[index],actual={page:box.page,left:box.bounds[0]*100-row.paper.left,
      top:(pdf.pageBounds[box.page-1][3]-box.bounds[3])*100-row.paper.top-row.paper.header,right:box.bounds[2]*100-row.paper.left,
      bottom:(pdf.pageBounds[box.page-1][3]-box.bounds[1])*100-row.paper.top-row.paper.header};
    expect(actual.page,row.id).toBe(expected.page);
    for(/** Every original physical rectangle edge retains the same independent native printer tolerance. */const side of ['left','top','right','bottom'] as const)expect(Math.abs(actual[side]-expected[side]),`${row.id}: shade ${index} ${side}`).toBeLessThanOrEqual(14);
  }
  return boxes;
}
