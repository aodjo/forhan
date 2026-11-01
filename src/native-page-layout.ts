import type {PageSettings} from './types.ts';
import {nativeLineAdvance,nativeLineSpacing,NATIVE_UNITS_PER_CSS_PIXEL,type NativeParagraphLayout} from './native-line-layout.ts';
import {paginateNativeParagraphs,type NativePaginationLayout,type NativePaginationParagraph} from './native-pagination.ts';

/** Physical source components are rounded independently in hundredths of a point. */
const NATIVE_UNITS_PER_MM=7200/25.4;
/** Unmeasured drawings retain their complete existing source rendering. */
const INDEPENDENT_DRAWINGS='img:not(.ProseMirror-separator),sup,sub,svg:not([data-forhan-print-text]),[data-forhan-width-ratio],[data-forhan-context-source],[data-forhan-hyphen-drawing],[contenteditable="false"]:not([data-forhan-caret-flow])';

/** Shared physical page geometry uses integral original HWP distances. */
export interface NativePaperGeometry {
  width:number;
  height:number;
  top:number;
  bottom:number;
  left:number;
  right:number;
}

/** Source-referenced physical placement is shared by editable sheets and standalone printing. */
export interface NativeDocumentPages {
  paper:NativePaperGeometry;
  paragraphs:NativePaginationParagraph[];
  layout:NativePaginationLayout;
}

/**
 * Convert independent physical source components to integral native distances.
 *
 * Header and top margin are rounded separately, as are footer and bottom
 * margin. Combining those millimetre values first can lose one source unit.
 * @param {PageSettings} page - Validated independent document page settings.
 * @returns {NativePaperGeometry} Native paper dimensions and combined content insets.
 * @example
 * const paper=nativePaperGeometry(page); // Distances remain independent of screen zoom.
 */
export function nativePaperGeometry(page:PageSettings):NativePaperGeometry{
  return {width:Math.round(page.width*NATIVE_UNITS_PER_MM),height:Math.round(page.height*NATIVE_UNITS_PER_MM),
    top:Math.round(page.marginTop*NATIVE_UNITS_PER_MM)+Math.round((page.header??0)*NATIVE_UNITS_PER_MM),
    bottom:Math.round(page.marginBottom*NATIVE_UNITS_PER_MM)+Math.round((page.footer??0)*NATIVE_UNITS_PER_MM),
    left:Math.round(page.marginLeft*NATIVE_UNITS_PER_MM),right:Math.round(page.marginRight*NATIVE_UNITS_PER_MM)};
}

/**
 * Check that independent paragraph paint can follow measured native lines.
 *
 * Text, links and their measured character effects can move together. Objects,
 * compound drawings and paragraph backgrounds require independent geometry.
 * A print caller may separately capture every solid inline source shade;
 * editable callers retain complete existing flow until that paint can move.
 * @param {HTMLElement} paragraph - Actual original source paragraph.
 * @param {boolean} [inlineBackgrounds=false] - Whether the caller independently captures solid inline source backgrounds.
 * @returns {boolean} Whether all paragraph paint follows measured text ranges.
 * @example
 * canProjectNativeParagraph(paragraph); // An image keeps its original complete flow.
 */
export function canProjectNativeParagraph(paragraph:HTMLElement,inlineBackgrounds=false):boolean{
  if(paragraph.querySelector(INDEPENDENT_DRAWINGS))return false;
  /** Source elements are inspected independently from auxiliary searchable print drawings. */
  const elements=[paragraph,...paragraph.querySelectorAll<HTMLElement>('*')],window=paragraph.ownerDocument.defaultView!;
  for(/** Every original visible effect needs a complete measured representation. */const element of elements){
    if(element.closest('svg,[data-forhan-caret-flow],.ProseMirror-separator'))continue;
    /** Unprojected paint cannot disappear when original source text moves across pages. */
    const style=window.getComputedStyle(element),background=style.backgroundColor;
    if((background!=='transparent'&&background!=='rgba(0, 0, 0, 0)'&&(!inlineBackgrounds||element===paragraph||!/^rgb\([\d\s,]+\)$/u.test(background)))||style.backgroundImage!=='none'||
      style.opacity!=='1'||style.filter!=='none'||style.visibility!=='visible'||style.writingMode!=='horizontal-tb'||
      (parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0)+(parseFloat(style.borderLeftWidth)||0)+(parseFloat(style.borderRightWidth)||0)>0)return false;
  }
  return true;
}

/**
 * Plan complete native physical pages from observed original paragraph lines.
 *
 * Editable and print output use the same source distances and strict native
 * line fit. Unsupported structures and unprojected heading connections retain
 * their complete existing flow. No editable document or measured DOM is changed.
 * @param {HTMLElement} root - Actual original content root.
 * @param {NativeParagraphLayout[]} plans - Complete original paragraph measurements in source order.
 * @param {PageSettings} page - Validated physical page and section grid settings.
 * @param {boolean} [inlineBackgrounds=false] - Whether independent vector capture includes every solid inline source background.
 * @returns {NativeDocumentPages|null} Complete source-referenced placement, or null when projection is incomplete.
 * @throws {RangeError} If validated physical source geometry is invalid.
 * @example
 * const pages=planNativeDocumentPages(root,plans,page); // Source paragraphs remain unsplit.
 */
export function planNativeDocumentPages(root:HTMLElement,plans:NativeParagraphLayout[],page:PageSettings,inlineBackgrounds=false):NativeDocumentPages|null{
  if(!plans.length||root.children.length!==plans.length)return null;
  /** Original margins, font metrics and following connections retain their independent source scopes. */
  const window=root.ownerDocument.defaultView!,paragraphs:NativePaginationParagraph[]=[],protectedAfter:boolean[]=[];
  for(let index=0;index<plans.length;index++){
    /** Every top-level original block must be completely represented by one measured paragraph. */
    const plan=plans[index],element=plan.element,style=window.getComputedStyle(element),spacing=nativeLineSpacing(element.style.lineHeight);
    if(root.children[index]!==element||element.parentElement!==root||!spacing||!canProjectNativeParagraph(element,inlineBackgrounds))return null;
    /** Source margins are independent from collapsed browser paragraph boxes. */
    const block:NativePaginationParagraph={before:Math.round((parseFloat(style.marginTop)||0)*NATIVE_UNITS_PER_CSS_PIXEL),
      after:Math.round((parseFloat(style.marginBottom)||0)*NATIVE_UNITS_PER_CSS_PIXEL),snap:element.getAttribute('data-forhan-snap-to-grid')!=='0',
      pageBreakBefore:style.breakBefore==='page'||style.pageBreakBefore==='always',lines:[]};
    for(/** Full original base heights remain separate from quantized proportional line advances. */const line of plan.lines){
      /** Integral source intervals do not depend on browser page origins or drawing corrections. */
      const height=Math.round(line.fontSize*NATIVE_UNITS_PER_CSS_PIXEL),advance=Math.round(nativeLineAdvance(line.fontSize,spacing)*NATIVE_UNITS_PER_CSS_PIXEL);
      if(height<=0||!Number.isFinite(height)||advance<0||!Number.isFinite(advance))return null;
      block.lines.push({height,advance});
    }
    paragraphs.push(block);protectedAfter.push(style.breakAfter==='avoid'||style.breakAfter==='avoid-page');
  }
  /** Integral physical source geometry is shared by both independent renderers. */
  const paper=nativePaperGeometry(page),layout=paginateNativeParagraphs(paragraphs,paper.height-paper.top-paper.bottom,page.lineGrid??0),
    firstPages:number[]=[],lastPages:number[]=[];
  for(/** Every original paragraph retains its first and last physical page. */const line of layout.lines){firstPages[line.paragraph]??=line.page;lastPages[line.paragraph]=line.page;}
  for(let index=0;index<paragraphs.length-1;index++)if(protectedAfter[index]&&lastPages[index]!==firstPages[index+1])return null;
  return {paper,paragraphs,layout};
}
