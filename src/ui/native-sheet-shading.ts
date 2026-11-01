import {nativeDocumentZoom,nativeLineBaseSize,nativeLineBaseline,nativeRelativeShift,NATIVE_UNITS_PER_CSS_PIXEL,type NativeParagraphLayout} from '../native-line-layout.ts';
import type {NativeEditableSheets} from './native-sheets.ts';

/** Owned vector paint remains outside editable source and the undo history. */
const SVG_NAMESPACE='http://www.w3.org/2000/svg';

/** One original opaque source shade uses coordinates inside the actual paper border. */
export interface NativeSheetShade {
  x:number;
  y:number;
  width:number;
  height:number;
  color:string;
}

/** Physical paper origin and display scale are independent from source paragraph flow. */
interface ShadeViewport {x:number;y:number;rasterX:number;rasterY:number;zoom:number;deviceScale:number;}

/**
 * Recover the native physical paper origin before browser layout quantization.
 *
 * Centered multi-page views can lose a fraction of a CSS pixel before source
 * paint is rounded. Original native observations round source coordinates
 * after centering. Native margin-unit boundary captures additionally retain
 * an integer document-unit origin relative to the edit viewport before source
 * raster rounding. This prevents fractional centered origins from moving a
 * shade edge while preserving each authored baseline and font height.
 * @param {HTMLElement} root - Actual original source editor.
 * @param {NativeEditableSheets} sheets - Independently paginated physical view projection.
 * @param {ShadeViewport} viewport - Actual SVG anchoring and device raster geometry.
 * @returns {{x:number;y:number;zoom:number}} Unquantized inner paper origin and exact view scale.
 * @example
 * sourcePaperOrigin(root,sheets,viewport); // A centered 85-percent group retains the original first shade row.
 */
function sourcePaperOrigin(root:HTMLElement,sheets:NativeEditableSheets,viewport:ShadeViewport):{x:number;y:number;zoom:number}{
  /** Temporary unprojected containers retain their actual source coordinate system. */
  const canvas=root.closest<HTMLElement>('.canvas');if(!canvas)return{x:viewport.x,y:viewport.y,zoom:viewport.zoom};
  /** Raw custom-property tokens retain the exact native scale beyond computed-style decimal serialization. */
  const zoom=Number(sheets.paper.closest<HTMLElement>('.workspace')?.style.getPropertyValue('--native-zoom'))||viewport.zoom,
    border=Math.round(sheets.border*zoom*viewport.deviceScale)/viewport.deviceScale,box=canvas.getBoundingClientRect(),rulerHeight=canvas.querySelector<HTMLElement>(':scope > .ruler')?.getBoundingClientRect().height??0,
    horizontal=Math.max(0,12*zoom-border),before=rulerHeight+12*zoom,after=Math.max(0,16*zoom-border),
    width=sheets.projection.width*zoom+2*border,height=sheets.projection.height*zoom+2*border,
    editTop=box.top+canvas.clientTop+rulerHeight+border,
    sourceTop=box.top+canvas.clientTop+before+Math.max(0,(canvas.clientHeight-before-after-height)/2)-canvas.scrollTop+border;
  return{x:box.left+canvas.clientLeft+horizontal+Math.max(0,(canvas.clientWidth-2*horizontal-width)/2)-canvas.scrollLeft+border,
    y:editTop+Math.floor((sourceTop-editTop)*NATIVE_UNITS_PER_CSS_PIXEL/zoom)*zoom/NATIVE_UNITS_PER_CSS_PIXEL,zoom};
}

/**
 * Read the nearest original opaque inline source background.
 *
 * Transparent rendering wrappers do not replace their authored ancestor shade.
 * Native file backgrounds are opaque RGB; independent alpha and paragraph
 * backgrounds retain complete existing flow through the page eligibility gate.
 * @param {HTMLElement} element - Actual original text leaf's current parent.
 * @param {HTMLElement} paragraph - Original owning paragraph or heading.
 * @returns {string|null} Actual computed opaque source color, or no inline shade.
 * @example
 * inlineShade(span,paragraph); // A transparent line wrapper retains its source mark's yellow shade.
 */
function inlineShade(element:HTMLElement,paragraph:HTMLElement):string|null{
  for(let current:HTMLElement|null=element;current&&current!==paragraph;current=current.parentElement){
    /** Source style remains intact when screen paint is separately projected. */
    const color=element.ownerDocument.defaultView!.getComputedStyle(current).backgroundColor;
    if(/^rgb\([\d\s,]+\)$/u.test(color))return color;
    if(color!=='transparent'&&color!=='rgba(0, 0, 0, 0)')return null;
  }
  return null;
}

/**
 * Read the actual paper's inner physical origin and device raster scale.
 *
 * Screen coordinates include accumulated CSS zoom while owned vector geometry
 * remains in unzoomed paper units. Device rounding stays independent from the
 * printer-only coordinate transform used for native PDF background paint.
 * @param {HTMLElement} root - Actual original editable source root.
 * @param {HTMLElement} paper - Owned physical paper containing that source.
 * @returns {ShadeViewport} Actual inner paper origin and current display scales.
 * @example
 * shadeViewport(editor,paper); // At 125 percent one physical border pixel remains outside source paint.
 */
function shadeViewport(root:HTMLElement,paper:HTMLElement):ShadeViewport{
  /** Actual computed border geometry already reflects the current CSS zoom. */
  const window=root.ownerDocument.defaultView!,zoom=nativeDocumentZoom(root),box=paper.getBoundingClientRect(),style=window.getComputedStyle(paper),deviceScale=window.devicePixelRatio||1,
    x=box.left+(parseFloat(style.borderLeftWidth)||0)*zoom,y=box.top+(parseFloat(style.borderTopWidth)||0)*zoom;
  return{x,y,rasterX:Math.round(x*deviceScale)/deviceScale,rasterY:Math.round(y*deviceScale)/deviceScale,zoom,deviceScale};
}

/**
 * Round one source shade at actual device-pixel edges without changing glyphs.
 *
 * Original controlled native captures retain independently rounded vertical
 * edges and a measured horizontal advance. At 125 percent a 10pt source shade
 * therefore occupies sixteen or seventeen physical rows as its line changes.
 * @param {ShadeViewport} viewport - Actual paper origin and current display scales.
 * @param {number} left - Measured original horizontal source origin in viewport CSS pixels.
 * @param {number} width - Measured original horizontal source advance in viewport CSS pixels.
 * @param {number} top - Independent native shade top in viewport CSS pixels.
 * @param {number} height - Independent native font height in viewport CSS pixels.
 * @param {string} color - Original computed opaque source color.
 * @returns {NativeSheetShade} Pixel-aligned owned vector geometry in original paper units.
 * @example
 * rasterShade(viewport,left,width,top,height,color); // Source text and source marks remain untouched.
 */
function rasterShade(viewport:ShadeViewport,left:number,width:number,top:number,height:number,color:string):NativeSheetShade{
  /** Physical rounding follows the actual display device rather than source CSS serialization. */
  const scale=viewport.deviceScale,y=Math.round(top*scale)/scale,bottom=Math.round((top+height)*scale)/scale;
  return{x:(Math.round(left*scale)/scale-viewport.rasterX)/viewport.zoom,y:(y-viewport.rasterY)/viewport.zoom,
    width:Math.max(0,Math.round(width*scale)/scale/viewport.zoom),height:Math.max(0,(bottom-y)/viewport.zoom),color};
}

/**
 * Project original inline source shades onto independently planned editable sheets.
 *
 * Native page placements supply vertical source geometry. Real DOM ranges
 * retain independent horizontal advances, including spaces and bidi fragments.
 * Every original paragraph and mark stays intact; only owned paper paint moves.
 * @param {HTMLElement} root - Actual original editable document root.
 * @param {NativeParagraphLayout[]} plans - Complete original measured paragraphs in source order.
 * @param {NativeEditableSheets} sheets - Independently planned physical source pages.
 * @returns {NativeSheetShade[]} Complete original opaque source shading for the owned paper layer.
 * @example
 * const paint=measureNativeSheetShading(root,plans,sheets); // One original paragraph can retain shades on several sheets.
 */
export function measureNativeSheetShading(root:HTMLElement,plans:NativeParagraphLayout[],sheets:NativeEditableSheets):NativeSheetShade[]{
  /** The native line lookup remains linear in the complete original source size. */
  const viewport=shadeViewport(root,sheets.paper),origin=sourcePaperOrigin(root,sheets,viewport),placements=new Map<string,typeof sheets.pages.layout.lines[number]>(),paint:NativeSheetShade[]=[],window=root.ownerDocument.defaultView!;
  for(/** Every physical source placement retains its original paragraph and visual line. */const line of sheets.pages.layout.lines)placements.set(`${line.paragraph}:${line.line}`,line);
  for(let paragraph=0;paragraph<plans.length;paragraph++){
    /** Original ranges retain their source ownership across drawing-only wrappers. */
    const plan=plans[paragraph];
    for(/** One source range may have several independent horizontal bidi fragments. */const source of plan.ranges){
      /** Source color and actual displayed font remain independent from any previous line drawing. */
      const parent=source.node.parentElement!,color=inlineShade(parent,plan.element),fontSize=nativeLineBaseSize(parent,parseFloat(window.getComputedStyle(parent).fontSize)),placement=placements.get(`${paragraph}:${source.line}`);
      if(!color||!placement||!Number.isFinite(fontSize)||fontSize<=0)continue;
      /** Exact owned shifts are removed before retaining an authored character offset. */
      const shift=nativeRelativeShift(parent,plan.element),offset=shift.relative-shift.previous,
        top=origin.y+(sheets.projection.cells[placement.page].y+(sheets.pages.paper.top+placement.baseline)/75-nativeLineBaseline(fontSize)+offset)*origin.zoom,
        range=root.ownerDocument.createRange();
      range.setStart(source.node,source.from);range.setEnd(source.node,source.to);
      for(/** Actual range fragments retain visual bidi gaps without painting unrelated source. */const box of range.getClientRects())if(box.width>0)paint.push(rasterShade(viewport,box.left+((source.shiftX??0)-shift.previousX+(plan.shiftX??0)-(plan.previousShiftX??0))*viewport.zoom+(origin.x-viewport.x),box.width,top,fontSize*origin.zoom,color));
    }
  }
  return paint;
}

/**
 * Follow actual provisional source paint while a native IME owns its DOM.
 *
 * Read-only grapheme ranges observe current browser baselines without using
 * stale model positions or dispatching a layout transaction. Only the owned
 * external paint layer changes. A current stored mark can supply the preedit
 * color before the browser has restored its original inline source wrapper.
 * @param {HTMLElement} root - Actual editable root currently owned by native composition.
 * @param {string|null} [fallbackColor=null] - Original current source mark for an unwrapped preedit text node.
 * @returns {NativeSheetShade[]} Actual provisional source shading in paper coordinates.
 * @example
 * measureComposingSheetShading(root,color); // Korean preedit can grow its background without changing IME text nodes.
 */
export function measureComposingSheetShading(root:HTMLElement,fallbackColor:string|null=null):NativeSheetShade[]{
  /** Composition paint uses only the actual owned paper and current source DOM. */
  const paper=root.closest<HTMLElement>('#paper');if(!paper)return[];
  /** Actual font metrics and source selection stay independent from rendering metadata. */
  const viewport=shadeViewport(root,paper),document=root.ownerDocument,window=document.defaultView!,context=document.createElement('canvas').getContext('2d')!,
    walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),fragments:Array<{left:number;right:number;top:number;height:number;color:string}>=[],paint:NativeSheetShade[]=[],selection=document.getSelection(),segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'}),fallback=document.createElement('span').style;
  fallback.backgroundColor=fallbackColor??'';
  while(walker.nextNode()){
    /** Auxiliary carets and independent drawings cannot become authored provisional text. */
    const node=walker.currentNode as Text,parent=node.parentElement!,paragraph=parent.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
    if(!paragraph||parent.closest('svg,[contenteditable="false"]'))continue;
    /** A browser-created preedit text node can temporarily precede its semantic source wrapper. */
    const color=inlineShade(parent,paragraph)??(selection?.anchorNode===node&&/^rgb\([\d\s,]+\)$/u.test(fallback.backgroundColor)?fallback.backgroundColor:null),style=window.getComputedStyle(parent),fontSize=nativeLineBaseSize(parent,parseFloat(style.fontSize));
    if(!color||!Number.isFinite(fontSize)||fontSize<=0)continue;
    context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    for(/** Original graphemes retain combining sequences while actual provisional wraps change. */const part of segmenter.segment(node.data)){
      /** Actual browser glyph metrics locate this provisional source's current physical baseline. */
      const range=document.createRange(),ascent=context.measureText(part.segment).fontBoundingBoxAscent;
      if(!Number.isFinite(ascent))continue;
      range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);
      for(/** Multiple fragments preserve actual bidi positioning without invented source characters. */const box of range.getClientRects())if(box.width>0){
        /** Neighboring source glyphs with the same actual native shade can share one owned rectangle. */
        const top=box.top+(ascent-nativeLineBaseline(fontSize))*viewport.zoom,height=fontSize*viewport.zoom,previous=fragments.at(-1);
        if(previous&&previous.color===color&&Math.abs(previous.top-top)<1/64&&Math.abs(previous.height-height)<1/64&&box.left<=previous.right+1/64&&box.right>=previous.left-1/64){previous.left=Math.min(previous.left,box.left);previous.right=Math.max(previous.right,box.right);}
        else fragments.push({left:box.left,right:box.right,top,height,color});
      }
    }
  }
  for(/** Complete source advances are rasterized after grouping so rounding cannot accumulate per grapheme. */const fragment of fragments)paint.push(rasterShade(viewport,fragment.left,fragment.right-fragment.left,fragment.top,fragment.height,fragment.color));
  return paint;
}

/**
 * Synchronize source-free opaque background paint outside ProseMirror ownership.
 *
 * Original inline colors remain semantic source. The screen stylesheet clips
 * their old paint to the empty border area where supported, otherwise to source
 * glyphs, while this owned layer draws complete
 * native rectangles behind editable text and selection. Stable geometry causes
 * no DOM writes; unsupported source restores its complete ordinary paint.
 * @param {HTMLElement} root - Actual original editable source root.
 * @param {NativeSheetShade[]|null} paint - Complete current shading, or no independent projection.
 * @returns {void} Updates only owned paper paint and its outside-source display class.
 * @example
 * renderNativeSheetShading(root,paint); // Clipboard, native writers and undo retain original source marks.
 */
export function renderNativeSheetShading(root:HTMLElement,paint:NativeSheetShade[]|null):void{
  /** Only the actual application editor may own this paper paint layer. */
  const paper=root.closest<HTMLElement>('#paper');if(!paper||root.parentElement?.id!=='editor')return;
  /** The owned layer is never a document child or an editable selection position. */
  const existing=paper.querySelector<SVGSVGElement>(':scope > svg[data-forhan-sheet-shading]');
  if(!paint?.length){existing?.remove();if(paper.classList.contains('native-sheet-shading'))paper.classList.remove('native-sheet-shading');return;}
  /** All geometry and source colors participate in stable owned paint identity. */
  const key=JSON.stringify(paint),svg=existing??root.ownerDocument.createElementNS(SVG_NAMESPACE,'svg'),viewport=shadeViewport(root,paper),
    left=(viewport.rasterX-viewport.x)/viewport.zoom+'px',top=(viewport.rasterY-viewport.y)/viewport.zoom+'px';
  if(svg.style.left!==left)svg.style.left=left;
  if(svg.style.top!==top)svg.style.top=top;
  if(svg.getAttribute('data-geometry')!==key){
    svg.setAttribute('data-forhan-sheet-shading','');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('data-geometry',key);
    svg.replaceChildren();
    for(/** Actual source rectangles remain independent from the editable text DOM. */const shade of paint){
      /** Every attribute comes from measured numeric source geometry or a computed RGB color. */
      const rect=root.ownerDocument.createElementNS(SVG_NAMESPACE,'rect');
      rect.setAttribute('x',String(shade.x));rect.setAttribute('y',String(shade.y));rect.setAttribute('width',String(shade.width));rect.setAttribute('height',String(shade.height));rect.setAttribute('fill',shade.color);svg.append(rect);
    }
  }
  if(!existing)paper.insertBefore(svg,root.parentElement);
  if(!paper.classList.contains('native-sheet-shading'))paper.classList.add('native-sheet-shading');
}
