import {nativeLineBaseSize,nativeLineBaseline,type NativeParagraphLayout,type NativeLineRange} from './native-line-layout.ts';
import { characterOutline } from './character-outline.ts';
import { isSafeDocumentLink } from './documents.ts';

/** SVG transforms preserve fractional text origins after Chromium's inline-text pixel snapping. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** Actual source font properties remain independent from the drawing-only print layer. */
const FONT_PROPERTIES = ['font-family','font-size','font-weight','font-style','font-stretch','font-kerning','font-feature-settings','font-variation-settings','font-variant-ligatures','font-variant-caps','font-variant-numeric','font-optical-sizing','font-synthesis','letter-spacing','word-spacing','text-transform','text-shadow','direction','unicode-bidi'] as const;

/** One original range keeps its source offsets while compatible inline marks share a complete word. */
interface PrintPiece {
  source: NativeLineRange;
  start: number;
  style: CSSStyleDeclaration;
  offset: number;
  link: HTMLAnchorElement | null;
}
/** A logical source group cannot cross a visual line or another independently painted native effect. */
interface PrintGroup { line: number; text: string; pieces: PrintPiece[]; }
/** A detached print layer is attached only after ordinary source measurements and effects finish. */
export interface NativePrintText { paragraph: HTMLElement; svg: SVGSVGElement; }

/**
 * Recover only authored relative offsets before native line wrappers are created.
 *
 * Native base-line geometry remains exact while independent character offsets
 * retain their original source scope and sign.
 * @param {HTMLElement} element - Actual original source leaf.
 * @param {HTMLElement} paragraph - Owning measured source paragraph.
 * @returns {number} Authored relative vertical displacement in CSS pixels.
 * @example
 * sourceOffset(span,paragraph); // A positive native character offset remains downward.
 */
function sourceOffset(element:HTMLElement,paragraph:HTMLElement):number{
  let offset=0;
  for(let node:HTMLElement|null=element;node&&node!==paragraph;node=node.parentElement){
    /** Only actual relative CSS shifts participate in native character positioning. */
    const style=paragraph.ownerDocument.defaultView!.getComputedStyle(node);
    if(style.position==='relative'&&style.top!=='auto')offset+=parseFloat(style.top)||0;
  }
  return offset;
}

/**
 * Retain propagated ordinary text decorations independently from native SVG effects.
 *
 * CSS decoration lines propagate through inline children without appearing as
 * inherited computed properties. Native underline drawings already disable
 * their browser decoration and must not be painted twice.
 * @param {HTMLElement} source - Original actual source leaf.
 * @param {HTMLElement} paragraph - Owning source paragraph.
 * @param {SVGElement} target - New source-equivalent vector text span.
 * @returns {void} Copies the nearest active browser decoration when present.
 * @example
 * copyDecoration(linkSpan,paragraph,tspan); // Ordinary hyperlink underlining survives printing.
 */
function copyDecoration(source:HTMLElement,paragraph:HTMLElement,target:SVGElement):void{
  for(let node:HTMLElement|null=source;node;node=node.parentElement){
    /** Ordinary propagated decoration belongs to its original ancestor's color and pattern. */
    const style=paragraph.ownerDocument.defaultView!.getComputedStyle(node);
    if(style.textDecorationLine!=='none'){
      target.style.textDecorationLine=style.textDecorationLine;
      target.style.textDecorationColor=style.textDecorationColor;
      target.style.textDecorationStyle=style.textDecorationStyle;
      target.style.textDecorationThickness=style.textDecorationThickness;
      break;
    }
    if(node===paragraph)break;
  }
}

/**
 * Capture fractional vector text for every ordinary measured native source word.
 *
 * The original inline source remains visible on screen. Printing hides only
 * its owned text wrappers and paints searchable SVG text at exact native
 * baselines. Compatible mark pieces share a complete word and retain their
 * individual font, foreground, offset and hyperlink. Solid inline backgrounds
 * retain their original horizontal source extent and native font-height box,
 * moving with their own line rather than a fragmented ancestor paragraph.
 * Existing native width,
 * contextual and outline drawings keep their established independent paths.
 * The returned detached layer must be attached after ordinary source effects.
 * @param {NativeParagraphLayout} plan - Actual original measured native paragraph plan.
 * @returns {NativePrintText|null} Detached print geometry, or null when another native path owns every glyph.
 * @throws {RangeError} If explicit original outline metadata is malformed.
 * @example
 * const drawing=captureNativePrintText(plan); // 32.88pt stays fractional in actual PDF text matrices.
 */
export function captureNativePrintText(plan:NativeParagraphLayout):NativePrintText|null{
  /** Every coordinate belongs to this actual attached source paragraph and its own document. */
  const paragraph=plan.element,document=paragraph.ownerDocument,window=document.defaultView!,bounds=paragraph.getBoundingClientRect(),paragraphStyle=window.getComputedStyle(paragraph),borderX=parseFloat(paragraphStyle.borderLeftWidth)||0,borderY=parseFloat(paragraphStyle.borderTopWidth)||0,
    width=Math.max(1,bounds.width-borderX-(parseFloat(paragraphStyle.borderRightWidth)||0)),height=Math.max(1,plan.height),svg=document.createElementNS(SVG_NAMESPACE,'svg'),groups:PrintGroup[]=[],sources=new Set<Text>(),links=new Set<HTMLAnchorElement>();
  let group:PrintGroup|undefined;
  for(/** Existing native effects already provide their own vector glyphs and cannot receive duplicates. */const source of plan.ranges){
    /** Actual source ownership determines which independent drawing path paints these glyphs. */
    const parent=source.node.parentElement!,outline=parent.closest<HTMLElement>('[data-forhan-outline]');
    if(parent.closest('[data-forhan-context-source],[data-forhan-width-ratio]')||(outline&&characterOutline(outline.dataset.forhanOutline)!==0)){
      group=undefined;continue;
    }
    if(!group||group.line!==source.line){group={line:source.line,text:'',pieces:[]};groups.push(group);}
    group.pieces.push({source,start:group.text.length,style:window.getComputedStyle(parent),offset:sourceOffset(parent,paragraph),link:parent.closest<HTMLAnchorElement>('a[href]')});
    group.text+=source.node.data.slice(source.from,source.to);
  }
  svg.setAttribute('data-forhan-print-text','');
  svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.setAttribute('focusable','false');svg.style.width=`${width}px`;svg.style.height=`${height}px`;
  for(/** Only captured searchable glyph groups own their corresponding independent inline shading. */const current of groups)for(/** Source shading cannot duplicate another independent outline or contextual drawing path. */const {source} of current.pieces){
    /** The nearest actual source background owns this original text range. */
    const parent=source.node.parentElement!,style=window.getComputedStyle(parent),range=document.createRange();
    let color:string|null=null;
    for(let element:HTMLElement|null=parent;element&&element!==paragraph;element=element.parentElement){
      /** Transparent rendering wrappers retain the original nearest visible inline source shade. */
      const background=window.getComputedStyle(element).backgroundColor;
      if(background!=='transparent'&&background!=='rgba(0, 0, 0, 0)'){color=background;break;}
    }
    if(!color)continue;
    range.setStart(source.node,source.from);range.setEnd(source.node,source.to);
    /** Native shading retains the base font height independently from relative glyph size and horizontal advance. */
    const box=range.getBoundingClientRect(),fontSize=nativeLineBaseSize(parent,parseFloat(style.fontSize)),line=plan.lines[source.line],rect=document.createElementNS(SVG_NAMESPACE,'rect');
    if(box.width<=0||!Number.isFinite(fontSize)||fontSize<=0)continue;
    rect.setAttribute('x','0');rect.setAttribute('y',String(sourceOffset(parent,paragraph)-nativeLineBaseline(fontSize)));
    rect.setAttribute('width',String(box.width));rect.setAttribute('height',String(fontSize));rect.setAttribute('fill',color);
    rect.setAttribute('transform',`translate(${box.left-bounds.left-borderX} ${line.baseline-borderY})`);
    rect.setAttribute('data-forhan-print-line',String(source.line));rect.setAttribute('data-forhan-print-background','');svg.append(rect);
  }
  for(/** Original words and whitespace retain independent browser advances and justification gaps. */const current of groups){
    let cursor=0;
    for(/** Whole non-space words preserve joining and combining across compatible original marks. */const word of current.text.matchAll(/\s+|\S+/gu)){
      /** Source piece indices move monotonically through the original line. */
      const start=word.index,end=start+word[0].length;
      while(cursor<current.pieces.length&&current.pieces[cursor].start+current.pieces[cursor].source.to-current.pieces[cursor].source.from<=start)cursor++;
      let last=cursor;
      while(last+1<current.pieces.length&&current.pieces[last+1].start<end)last++;
      /** An actual DOM range supplies horizontal placement independently from the source baseline target. */
      const first=current.pieces[cursor],final=current.pieces[last],range=document.createRange();
      if(!first||!final)continue;
      range.setStart(first.source.node,first.source.from+start-first.start);
      range.setEnd(final.source.node,final.source.from+end-final.start);
      /** Exact viewport dimensions prevent viewBox fitting from scaling fractional vertical coordinates. */
      const rect=range.getBoundingClientRect();
      if(rect.width<=0)continue;
      /** SVG transforms avoid the integer inline-text origin used by Chromium's paint path. */
      const text=document.createElementNS(SVG_NAMESPACE,'text'),x=(paragraphStyle.direction==='rtl'?rect.right:rect.left)-bounds.left-borderX,y=plan.lines[current.line].baseline-borderY;
      text.setAttribute('x','0');text.setAttribute('y','0');text.setAttribute('transform',`translate(${x} ${y})`);
      text.setAttribute('textLength',String(rect.width));text.setAttribute('lengthAdjust',/^\s+$/u.test(word[0])?'spacingAndGlyphs':'spacing');
      text.setAttribute('data-forhan-print-line',String(current.line));text.style.whiteSpace='pre';text.style.direction=paragraphStyle.direction;
      let previousOffset=0;
      for(let index=cursor;index<=last;index++){
        /** Original styles remain attached to complete logical source pieces within this word. */
        const piece=current.pieces[index],from=Math.max(start,piece.start)-piece.start+piece.source.from,to=Math.min(end,piece.start+piece.source.to-piece.source.from)-piece.start+piece.source.from,tspan=document.createElementNS(SVG_NAMESPACE,'tspan');
        tspan.textContent=piece.source.node.data.slice(from,to);
        for(/** SVG inherits the same actual installed font selection and native typography as the original source. */const property of FONT_PROPERTIES)tspan.style.setProperty(property,piece.style.getPropertyValue(property));
        tspan.style.fill=piece.style.color;tspan.style.stroke='none';tspan.style.whiteSpace='pre';
        tspan.setAttribute('dy',String(piece.offset-previousOffset));previousOffset=piece.offset;
        copyDecoration(piece.source.node.parentElement!,paragraph,tspan);
        /** Hyperlinks preserve their real destination and their actual painted glyph rectangle. */
        const href=piece.link?.getAttribute('href');
        if(href&&isSafeDocumentLink(href)){
          /** A real SVG anchor retains an actual native PDF link annotation without executing script. */
          const anchor=document.createElementNS(SVG_NAMESPACE,'a');anchor.setAttribute('href',href);anchor.style.textDecorationLine='none';anchor.append(tspan);text.append(anchor);links.add(piece.link!);
        }else text.append(tspan);
        sources.add(piece.source.node);
      }
      svg.append(text);
    }
  }
  if(!svg.childNodes.length)return null;
  for(/** Wrapping a complete source text node cannot add a character or change its screen appearance. */const node of sources){
    /** Screen-visible original source remains independently editable after HTML reimport. */
    const wrapper=document.createElement('forhan-print-source');node.parentNode!.replaceChild(wrapper,node);wrapper.append(node);
  }
  for(/** Only fully replaced source anchors hide their old print rectangle. */const anchor of links){
    /** Other independently drawn effects keep their existing original anchor until their full source is replaced. */
    const walker=document.createTreeWalker(anchor,NodeFilter.SHOW_TEXT);let complete=true;
    while(walker.nextNode())if(walker.currentNode.textContent&&!sources.has(walker.currentNode as Text)){complete=false;break;}
    if(complete)anchor.setAttribute('data-forhan-print-link-source','');
  }
  paragraph.classList.add('forhan-print-text-container');
  return {paragraph,svg};
}

/**
 * Attach vector text with a pixel-aligned viewport and an exact inverse translation.
 *
 * Chromium also snaps replaced SVG viewport origins. Moving the untransformed
 * viewport to an integer and restoring its fraction through a transform keeps
 * identical source geometry while preserving subpixel paragraph origins in PDF.
 * All paragraph height changes must finish before this origin is observed.
 * @param {NativePrintText} layer - Detached exact native print drawing and its actual source owner.
 * @returns {void} Installs only drawing geometry without changing authored text or document history.
 * @example
 * attachNativePrintText(layer); // Neighboring native paragraphs do not acquire a quarter-point print jump.
 */
export function attachNativePrintText(layer:NativePrintText):void{
  /** The SVG containing block starts just inside its original paragraph border. */
  const style=layer.paragraph.ownerDocument.defaultView!.getComputedStyle(layer.paragraph),top=layer.paragraph.getBoundingClientRect().top+(parseFloat(style.borderTopWidth)||0),fraction=top-Math.round(top);
  layer.svg.style.top=`${-fraction}px`;layer.svg.style.transform=`translateY(${fraction}px)`;layer.svg.style.transformOrigin='0 0';
  layer.paragraph.append(layer.svg);
}

/**
 * Remove owned vector print copies before importing HTML or clipboard source.
 *
 * Actual authored text, link destinations and native source flags remain.
 * Ordinary external SVG content has no owned marker and is never removed.
 * @param {HTMLElement} root - Actual detached imported HTML or clipboard root.
 * @returns {void} Restores original source without duplicate drawing text or stale print visibility.
 * @example
 * normalizeHtmlPrintText(body); // A printed SVG copy never becomes a second editable paragraph.
 */
export function normalizeHtmlPrintText(root:HTMLElement):void{
  for(/** Physical print pages contain only auxiliary drawings and their owned print stylesheet. */const pages of root.querySelectorAll('forhan-print-pages[data-forhan-native-pages]'))pages.remove();
  for(/** The unchanged original screen document returns to its original parent before source parsing. */const source of root.querySelectorAll('forhan-print-original[data-forhan-page-source]'))source.replaceWith(...source.childNodes);
  for(/** Only owned auxiliary print layers are removed. */const svg of root.querySelectorAll('svg[data-forhan-print-text]'))svg.remove();
  for(/** Source children retain their original order and exact Unicode. */const wrapper of root.querySelectorAll('forhan-print-source'))wrapper.replaceWith(...wrapper.childNodes);
  for(/** Original links return to ordinary visibility before source parsing. */const anchor of root.querySelectorAll('[data-forhan-print-link-source]'))anchor.removeAttribute('data-forhan-print-link-source');
  for(/** Container geometry belongs only to the discarded drawing copy. */const element of root.querySelectorAll('.forhan-print-text-container'))element.classList.remove('forhan-print-text-container');
}
