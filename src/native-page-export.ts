import type {PageSettings} from './types.ts';
import {NATIVE_UNITS_PER_CSS_PIXEL,type NativeParagraphLayout} from './native-line-layout.ts';
import {planNativeDocumentPages} from './native-page-layout.ts';
import type {NativePrintText} from './print-text.ts';

/** Exact viewport dimensions share the browser's stable binary CSS layout quantum. */
const VIEWPORT_QUANTUM = 1 / 64;
/** Vector text stays searchable and keeps actual native link annotations. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** Independently observed 600dpi native background paths use twelve hundredths of a point per printer pixel. */
const NATIVE_SHADE_DEVICE_UNITS=12;
/** Original native PDF background paths fit their integral printer raster to whole-point page bounds. */
const NATIVE_SHADE_POINT_UNITS=100;
/**
 * Read original paragraph Unicode independently from auxiliary SVG copies.
 *
 * Native rendering wrappers retain the original text nodes. Hard breaks have
 * no text content and therefore cannot introduce a second authored character.
 * @param {HTMLElement} paragraph - Actual original source paragraph.
 * @returns {string} Unchanged source Unicode in logical document order.
 * @example
 * originalParagraphText(paragraph); // A hidden print copy is never counted twice.
 */
function originalParagraphText(paragraph:HTMLElement):string{
  /** The owning document supplies the original source walker. */
  const walker=paragraph.ownerDocument.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
  let text='';
  while(walker.nextNode())if(!walker.currentNode.parentElement?.closest('svg'))text+=walker.currentNode.textContent??'';
  return text;
}

/**
 * Project complete measured paragraph source onto independent native print pages.
 *
 * The original screen document and editable source remain intact. Each physical
 * page gets searchable vector glyphs and captured solid inline shading at independently planned native coordinates,
 * avoiding browser margin rounding and cumulative fragmentainer origins. A
 * print-only page rule removes implicit browser margins; source margins are
 * drawn explicitly in native units. Documents containing unprojected structures
 * retain their complete existing path until those structures are measured.
 * @param {HTMLElement} root - Actual owned prepared static document body.
 * @param {NativeParagraphLayout[]} plans - Measured original source paragraphs in document order.
 * @param {NativePrintText[]} layers - Actual detached or attached source-equivalent vector drawings.
 * @param {PageSettings} page - Validated original physical source geometry.
 * @returns {boolean} Whether complete native physical pages were installed.
 * @throws {RangeError} If the validated native page geometry becomes invalid.
 * @example
 * installNativePrintPages(body,plans,layers,page); // Every physical page restarts at its original baseline.
 */
export function installNativePrintPages(
  root:HTMLElement,plans:NativeParagraphLayout[],layers:NativePrintText[],page:PageSettings,
):boolean{
  /** Editable and print output share the same independently measured native source placements. */
  const planned=planNativeDocumentPages(root,plans,page,true);
  if(!planned)return false;
  /** Searchable print text must cover the complete original Unicode before source flow is hidden. */
  const document=root.ownerDocument,layerByParagraph=new Map<HTMLElement,NativePrintText>(),lefts:number[]=[],rootLeft=root.getBoundingClientRect().left;
  for(/** Original paragraph ownership cannot be inferred from a detached clone. */const layer of layers)layerByParagraph.set(layer.paragraph,layer);
  for(/** Each original source paragraph retains complete original text and horizontal geometry. */const plan of plans){
    /** Empty paragraphs need no vector glyphs but still contribute native physical height. */
    const source=originalParagraphText(plan.element),layer=layerByParagraph.get(plan.element);
    if(source.trim()&&(!layer||layer.svg.textContent!==source))return false;
    lefts.push(plan.element.getBoundingClientRect().left-rootLeft);
  }
  /** Physical dimensions are quantized only at the independent vector viewport boundary. */
  const {paper,layout}=planned,{width,height,top,left}=paper,
    viewportWidth=Math.round(width/NATIVE_UNITS_PER_CSS_PIXEL/VIEWPORT_QUANTUM)*VIEWPORT_QUANTUM,
    viewportHeight=Math.round(height/NATIVE_UNITS_PER_CSS_PIXEL/VIEWPORT_QUANTUM)*VIEWPORT_QUANTUM,
    pages=document.createElement('forhan-print-pages'),original=document.createElement('forhan-print-original'),
    stylesheet=document.createElement('style'),drawings:SVGSVGElement[]=[],backgrounds:SVGGElement[]=[],placements=new Map<string,typeof layout.lines[number]>(),
    backgroundScaleX=Math.floor(width/NATIVE_SHADE_POINT_UNITS)*NATIVE_SHADE_POINT_UNITS/(Math.ceil(width/NATIVE_SHADE_DEVICE_UNITS)*NATIVE_SHADE_DEVICE_UNITS),
    backgroundScaleY=Math.floor(height/NATIVE_SHADE_POINT_UNITS)*NATIVE_SHADE_POINT_UNITS/(Math.ceil(height/NATIVE_SHADE_DEVICE_UNITS)*NATIVE_SHADE_DEVICE_UNITS);
  pages.setAttribute('data-forhan-native-pages','');original.setAttribute('data-forhan-page-source','');
  stylesheet.textContent='forhan-print-original[data-forhan-page-source]{display:contents}forhan-print-pages[data-forhan-native-pages]{display:none}@media print{@page{margin:0}body{margin:0!important;padding:0!important}forhan-print-original[data-forhan-page-source]{display:none}forhan-print-pages[data-forhan-native-pages]{display:block}forhan-print-pages[data-forhan-native-pages]>forhan-print-page{display:block;position:relative;height:1px;margin:0;padding:0;break-before:page}forhan-print-pages[data-forhan-native-pages]>forhan-print-page:first-of-type{break-before:auto}}';
  pages.append(stylesheet);
  for(/** Source-referenced placement lookup keeps projection linear in the actual glyph count. */const placement of layout.lines)placements.set(`${placement.paragraph}:${placement.line}`,placement);
  for(let index=0;index<layout.pages.length;index++){
    /** A small nonempty flow box forces one physical page without quantizing its independent drawing origin. */
    const sheet=document.createElement('forhan-print-page'),svg=document.createElementNS(SVG_NAMESPACE,'svg'),background=document.createElementNS(SVG_NAMESPACE,'g');
    sheet.setAttribute('data-forhan-page-index',String(index));
    svg.setAttribute('data-forhan-print-text','');svg.setAttribute('width',String(viewportWidth));svg.setAttribute('height',String(viewportHeight));
    svg.setAttribute('viewBox',`0 0 ${viewportWidth} ${viewportHeight}`);svg.setAttribute('focusable','false');
    svg.style.width=`${viewportWidth}px`;svg.style.height=`${viewportHeight}px`;
    background.setAttribute('data-forhan-print-backgrounds','');background.setAttribute('transform',`scale(${backgroundScaleX} ${backgroundScaleY})`);
    svg.append(background);sheet.append(svg);pages.append(sheet);drawings.push(svg);backgrounds.push(background);
  }
  for(let index=0;index<plans.length;index++){
    /** Empty source paragraphs still contribute native height and may create a physical blank page. */
    const layer=layerByParagraph.get(plans[index].element);if(!layer)continue;
    for(/** Each original source word moves once, preserving original marks and actual PDF link annotations. */const text of Array.from(layer.svg.children)){
      /** Original capture supplies its own actual horizontal range; only physical page placement changes. */
      const line=Number(text.getAttribute('data-forhan-print-line')),placement=placements.get(`${index}:${line}`),
        transform=(text as SVGGraphicsElement).transform.baseVal.consolidate();
      if(!placement||!transform)throw new RangeError('Original native print geometry is incomplete.');
      text.setAttribute('transform',`translate(${left/NATIVE_UNITS_PER_CSS_PIXEL+lefts[index]+transform.matrix.e} ${(top+placement.baseline)/NATIVE_UNITS_PER_CSS_PIXEL})`);
      text.setAttribute('data-forhan-print-paragraph',String(index));
      if(text.hasAttribute('data-forhan-print-background'))backgrounds[placement.page].append(text);
      else drawings[placement.page].append(text);
    }
    layer.svg.remove();layer.paragraph.classList.remove('forhan-print-text-container');
  }
  while(root.firstChild)original.append(root.firstChild);
  root.append(original,pages);return true;
}
