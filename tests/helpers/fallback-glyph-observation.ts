import type {Page} from '@playwright/test';

/**
 * Observe source glyph geometry and paired canvas language metrics.
 *
 * Every rectangle comes from the actual source DOM. Auxiliary vector copies
 * are excluded, while the original drawing offset is retained separately.
 * A second detached canvas receives the source language to expose fallback
 * metric differences without changing the source or its drawing geometry.
 * @param {string} selector - Actual original paragraph selector.
 * @returns {object} Source font, geometry and paired canvas observations.
 * @throws {Error} If the selected paragraph or canvas metrics are unavailable.
 * @example
 * const metrics=await page.evaluate(observeFallbackGlyphs,'.tiptap p');
 */
export function observeFallbackGlyphs(selector:string):object{
  /** Both canvases belong to the original source document without modifying its DOM. */
  const paragraph=document.querySelector<HTMLElement>(selector),plainCanvas=document.createElement('canvas'),localizedCanvas=document.createElement('canvas');
  if(!paragraph)throw new Error('Original source paragraph is unavailable.');
  /** Explicit source language is distinct from a detached canvas's default inheritance. */
  const language=paragraph.closest<HTMLElement>('[lang]')?.lang||document.documentElement.lang;
  localizedCanvas.lang=language;
  /** Context language support remains observable across the pinned browser and native runtimes. */
  const plain=plainCanvas.getContext('2d') as (CanvasRenderingContext2D&{lang?:string})|null,localized=localizedCanvas.getContext('2d') as (CanvasRenderingContext2D&{lang?:string})|null;
  if(!plain||!localized)throw new Error('Source canvas metrics are unavailable.');
  if('lang'in localized)localized.lang=language;
  /** Current display scale is observed independently from any expected native geometry. */
  const zoom=Number(paragraph.closest<HTMLElement>('.workspace')?.style.getPropertyValue('--native-zoom'))||1,box=paragraph.getBoundingClientRect(),walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT),range=document.createRange(),glyphs=[];
  while(walker.nextNode()){
    /** Original text remains separate from auxiliary screen and print vector layers. */
    const node=walker.currentNode as Text;if(node.parentElement?.closest('svg,style,script,[aria-hidden="true"]'))continue;
    for(let index=0;index<node.length;index++){
      range.setStart(node,index);range.setEnd(node,index+1);
      /** Every source unit retains its actual installed-font fallback and persisted drawing offset. */
      const parent=node.parentElement!,style=getComputedStyle(parent),rect=range.getBoundingClientRect(),line=parent.closest<HTMLElement>('[data-forhan-line-shift]'),shift=Number(line?.dataset.forhanLineShift)||0;
      plain.font=localized.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      /** Paired font metrics use identical source text and CSS font selection. */
      const ordinary=plain.measureText(node.data[index]),local=localized.measureText(node.data[index]),ordinaryM=plain.measureText('M'),localM=localized.measureText('M');
      glyphs.push({text:node.data[index],left:rect.left-box.left,top:rect.top-box.top,height:rect.height,font:plain.font,shift,
        ordinaryAscent:ordinary.fontBoundingBoxAscent,localizedAscent:local.fontBoundingBoxAscent,ordinaryMAscent:ordinaryM.fontBoundingBoxAscent,localizedMAscent:localM.fontBoundingBoxAscent,
        ordinaryBaseline:(rect.top-box.top)/zoom-shift+ordinary.fontBoundingBoxAscent,localizedBaseline:(rect.top-box.top)/zoom-shift+local.fontBoundingBoxAscent});
    }
  }
  return{documentLanguage:document.documentElement.lang,sourceLanguage:language,plainContextLanguage:plain.lang,localizedContextLanguage:localized.lang,zoom,
    paragraphHeight:box.height,paragraphStyle:paragraph.getAttribute('style'),font:getComputedStyle(paragraph).fontFamily,glyphs};
}

/**
 * Record actual platform faces used by a selected source paragraph.
 *
 * The test-owned debugging session observes font fallback without reading font
 * files or modifying source. An unavailable diagnostic is recorded explicitly
 * and cannot replace the independent output assertions.
 * @async
 * @param {Page} page - Actual browser or selected native renderer.
 * @param {string} selector - Original source paragraph selector.
 * @returns {Promise<object>} Actual platform face metadata or an explicit diagnostic limitation.
 * @example
 * const fonts=await observeFallbackPlatformFonts(page,'.tiptap p');
 */
export async function observeFallbackPlatformFonts(page:Page,selector:string):Promise<object>{
  try{
    /** Only this invocation owns the temporary protocol observation session. */
    const session=await page.context().newCDPSession(page);
    try{
      await session.send('DOM.enable');await session.send('CSS.enable');
      /** The actual source node is resolved from the selected renderer's live DOM. */
      const document=await session.send('DOM.getDocument'),node=await session.send('DOM.querySelector',{nodeId:document.root.nodeId,selector}),descendants=await session.send('DOM.querySelectorAll',{nodeId:node.nodeId,selector:'*:not(svg):not(svg *)'}),faces=new Map();
      for(/** Native font metadata belongs to each original text-node parent rather than its structural paragraph. */const nodeId of [node.nodeId,...descendants.nodeIds]){
        /** Source leaf faces are deduplicated independently from auxiliary vector copies. */
        const used=await session.send('CSS.getPlatformFontsForNode',{nodeId});
        for(/** One sampled face identity is sufficient to establish actual platform fallback. */const font of used.fonts)if(!faces.has(font.postScriptName||font.familyName))faces.set(font.postScriptName||font.familyName,font);
      }
      return{available:true,fonts:[...faces.values()]};
    }finally{await session.detach();}
  }catch(error){return{available:false,error:String(error)};}
}
