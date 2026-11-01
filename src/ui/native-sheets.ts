import type {PageSettings} from '../types.ts';
import {nativeDocumentZoom,NATIVE_UNITS_PER_CSS_PIXEL,type NativeParagraphLayout} from '../native-line-layout.ts';
import {planNativeDocumentPages,type NativeDocumentPages} from '../native-page-layout.ts';
import {snapNativePageDistance} from '../native-pagination.ts';
import {projectNativePages,readNativePageView,type NativePageProjection} from './native-page-view.ts';

/** Browser layout retains one sixty-fourth of an effective zoomed CSS pixel. */
const SHEET_LAYOUT_QUANTUM=1/64;
/** Exact requested fit paint heights avoid mutation loops caused by CSS decimal serialization. */
const NATIVE_FIT_EDGE_HEIGHTS=new WeakMap<HTMLElement,string>();
/** Absolute page-column edges retain exact requested paint without CSS decimal mutation feedback. */
const NATIVE_GRID_EDGE_WIDTHS=new WeakMap<HTMLElement,string>();

/** Editable paper metadata stays outside document attributes, serialization and history. */
export interface NativeEditableSheets {
  paper:HTMLElement;
  pages:NativeDocumentPages;
  stride:number;
  height:number;
  border:number;
  projection:NativePageProjection;
}

/**
 * Resolve physical sheets and move only measured original drawing geometry.
 *
 * Source paragraphs remain intact across physical pages. Independent paper
 * backgrounds live outside ProseMirror, while transparent inline decorations
 * retain original text positions for editing, selection and serialization.
 * @param {HTMLElement} root - Actual live editable content root.
 * @param {NativeParagraphLayout[]} plans - Complete original paragraph measurements before drawing changes.
 * @param {PageSettings} page - Independent document paper and section settings.
 * @returns {NativeEditableSheets|null} Complete editable physical sheet geometry, or null for unprojected source.
 * @throws {RangeError} If validated native physical geometry is invalid.
 * @example
 * const sheets=measureNativeSheets(view.dom,plans,page); // A single source paragraph can span four editable sheets.
 */
export function measureNativeSheets(root:HTMLElement,plans:NativeParagraphLayout[],page:PageSettings):NativeEditableSheets|null{
  /** Temporary import and export editors never own application paper chrome. */
  const paper=root.closest<HTMLElement>('#paper'),pages=paper&&root.parentElement?.id==='editor'?planNativeDocumentPages(root,plans,page,true):null;
  if(!paper||!pages)return null;
  /** Quantized source paper dimensions retain the same physical origins used by standalone printing. */
  const zoom=nativeDocumentZoom(root),window=root.ownerDocument.defaultView!,border=parseFloat(window.getComputedStyle(paper).borderTopWidth)||0,
    projection=projectNativePages(pages.layout.pages.length,pages.paper.width/NATIVE_UNITS_PER_CSS_PIXEL,pages.paper.height/NATIVE_UNITS_PER_CSS_PIXEL,readNativePageView(paper),paper.closest<HTMLElement>('.canvas')?.clientWidth??0,zoom,paper.dataset.nativeFit?undefined:Number(paper.closest<HTMLElement>('.workspace')?.style.getPropertyValue('--native-zoom-percent'))||undefined),
    stride=projection.strideY,
    height=projection.height,
    inset=(root.getBoundingClientRect().top-paper.getBoundingClientRect().top)/zoom-border,
    origin=pages.paper.top/NATIVE_UNITS_PER_CSS_PIXEL-inset;
  let correction=0;
  /**
   * Round an unzoomed distance at the browser's effective layout precision.
   *
   * Quantizing before accumulation prevents eighty separate paragraph boxes
   * from introducing a progressive vertical drift at fractional display zoom.
   * @param {number} value - Original unzoomed CSS distance.
   * @returns {number} Stable effective browser layout distance.
   * @example
   * quantize(5.333333); // Matches the live browser box at its actual zoom.
   */
  function quantize(value:number):number{return Math.round(value*zoom/SHEET_LAYOUT_QUANTUM)*SHEET_LAYOUT_QUANTUM/zoom;}
  /** Placements are grouped once without quadratic searches through the source document. */
  const placements:typeof pages.layout.lines[]=[];
  for(/** All line placements retain their original paragraph ownership. */const line of pages.layout.lines)(placements[line.paragraph]??=[]).push(line);
  for(let index=0;index<plans.length;index++){
    /** Flex flow keeps authored margins independent while transparent line shifts cross physical page gaps. */
    const plan=plans[index],style=window.getComputedStyle(plan.element),box=plan.element.getBoundingClientRect(),
      after=parseFloat(style.marginBottom)||0,top=(box.top-root.getBoundingClientRect().top)/zoom+correction,
      source=pages.paragraphs[index],rows=placements[index];
    if(!rows?.length)return null;
    for(let line=0;line<plan.lines.length;line++){
      /** Native baseline and line top share their own page origin instead of cumulative browser fragmentation. */
      const placement=rows[line],target=plan.lines[line],cell=projection.cells[placement.page];
      target.top=origin+cell.y+placement.top/NATIVE_UNITS_PER_CSS_PIXEL-top;
      target.baseline=origin+cell.y+placement.baseline/NATIVE_UNITS_PER_CSS_PIXEL-top;
      target.page=placement.page;target.shiftX=cell.x;
      target.advance=placement.advance/NATIVE_UNITS_PER_CSS_PIXEL;
    }
    /** A genuine empty line retains physical source insertion on its own page without editing composition DOM. */
    const lastLine=plan.lines.at(-1),baseX=lastLine?.placeholder?quantize(lastLine.shiftX??0):0;
    plan.shiftX=baseX;plan.previousShiftX=Number(plan.element.getAttribute('data-forhan-paragraph-shift-x'))||0;
    for(/** Original source ranges keep their unchanged model positions and character marks. */const range of plan.ranges){
      /** The recovered original browser baseline excludes all existing rendering-only shifts. */
      const line=plan.lines[range.line];range.shift=quantize(line.baseline-(line.browserBaseline??line.baseline));range.shiftX=quantize((line.shiftX??0)-baseX);
    }
    /** Snapped after spacing belongs to the source paragraph rather than the following page margin. */
    const last=rows[rows.length-1],end=origin+last.page*stride+(last.top+last.advance+snapNativePageDistance(source.after,source.snap?(page.lineGrid??0):0))/NATIVE_UNITS_PER_CSS_PIXEL;
    plan.height=Math.max(0,quantize(end-top-after));correction+=plan.height-box.height/zoom;
  }
  return {paper,pages,stride,height,border,projection};
}

/**
 * Synchronize noneditable paper backgrounds with measured physical page count.
 *
 * The owned background is a sibling of the editor host. It contains no source
 * text, selection positions or serialized document attributes. Repeated stable
 * measurements perform no DOM writes and do not start observer feedback loops.
 * @param {HTMLElement} root - Actual live editable root.
 * @param {NativeEditableSheets|null} sheets - Complete native placement, or null to restore ordinary source flow.
 * @returns {void} Updates or removes only owned paper backgrounds and display metadata.
 * @example
 * renderNativeSheets(view.dom,sheets); // Undo and saving retain the original unsplit document.
 */
export function renderNativeSheets(root:HTMLElement,sheets:NativeEditableSheets|null):void{
  /** Only the real application editor can own editable physical paper chrome. */
  const paper=root.closest<HTMLElement>('#paper');if(!paper||root.parentElement?.id!=='editor')return;
  /** Existing owned chrome is independent of document model and source content. */
  const existing=paper.querySelector<HTMLElement>(':scope > .native-sheet-backgrounds');
  if(!sheets){
    if(existing)existing.remove();
    if(paper.classList.contains('native-paged-paper'))paper.classList.remove('native-paged-paper');
    if(paper.classList.contains('native-grid-paper'))paper.classList.remove('native-grid-paper');
    paper.style.removeProperty('--native-sheets-width');
    for(/** Removed physical metadata cannot leak stale physical page cells after loading unsupported source. */const name of ['data-forhan-page-count','data-forhan-page-stride','data-forhan-page-cells'])if(paper.hasAttribute(name))paper.removeAttribute(name);
    if(paper.style.getPropertyValue('--native-sheets-height'))paper.style.removeProperty('--native-sheets-height');
    return;
  }
  /** Background identity also includes page dimensions, so orientation changes refresh every sheet. */
  const count=sheets.pages.layout.pages.length,view=readNativePageView(paper),grid=view.shape!=='single'||view.direction!=='vertical',cells=JSON.stringify(sheets.projection.cells),key=[count,sheets.stride,sheets.pages.paper.width,sheets.pages.paper.height,sheets.border,paper.dataset.nativeFit??'',grid,cells].join(':'),
    backgrounds=existing??paper.ownerDocument.createElement('div');
  if(backgrounds.dataset.geometry!==key){
    backgrounds.className='native-sheet-backgrounds';backgrounds.setAttribute('aria-hidden','true');backgrounds.setAttribute('inert','');backgrounds.dataset.geometry=key;
    backgrounds.style.inset=`${-sheets.border}px ${-sheets.border}px auto`;
    backgrounds.replaceChildren();
    for(let index=0;index<count;index++){
      /** Physical paper contains only its own border and margin corner decorations. */
      const sheet=paper.ownerDocument.createElement('div');sheet.className='native-sheet-background';sheet.dataset.pageIndex=String(index);
      sheet.style.top=`${sheets.projection.cells[index].y}px`;sheet.style.left=`${sheets.projection.cells[index].x}px`;sheet.style.height=`${sheets.pages.paper.height/NATIVE_UNITS_PER_CSS_PIXEL+2*sheets.border}px`;
      if(grid)sheet.style.width=`${sheets.pages.paper.width/NATIVE_UNITS_PER_CSS_PIXEL+2*sheets.border}px`;
      for(/** Every physical page repeats both native margin corner pairs. */const edge of ['top','bottom'])for(/** Each paper edge has independent left and right content insets. */const side of ['left','right']){
        /** Corner markings are visual chrome and cannot become editable source. */
        const corner=paper.ownerDocument.createElement('i');corner.className=`native-margin-corner native-margin-top-${side}${edge==='bottom'?' native-margin-bottom':''}`;sheet.append(corner);
      }
      backgrounds.append(sheet);
    }
  }
  if(!existing)paper.prepend(backgrounds);
  if(!paper.classList.contains('native-paged-paper'))paper.classList.add('native-paged-paper');
  if(paper.classList.contains('native-grid-paper')!==grid)paper.classList.toggle('native-grid-paper',grid);
  if(grid){if(paper.style.getPropertyValue('--native-sheets-width')!==`${sheets.projection.width}px`)paper.style.setProperty('--native-sheets-width',`${sheets.projection.width}px`);}
  else if(paper.style.getPropertyValue('--native-sheets-width'))paper.style.removeProperty('--native-sheets-width');
  if(paper.dataset.forhanPageCells!==cells)paper.dataset.forhanPageCells=cells;
  if(paper.dataset.forhanPageCount!==String(count))paper.dataset.forhanPageCount=String(count);
  if(paper.dataset.forhanPageStride!==String(sheets.stride))paper.dataset.forhanPageStride=String(sheets.stride);
  if(paper.style.getPropertyValue('--native-sheets-height')!==`${sheets.height}px`)paper.style.setProperty('--native-sheets-height',`${sheets.height}px`);
  if(grid){
    /** Native column edges round independent absolute source coordinates before browser layout quantization. */
    const canvas=paper.closest<HTMLElement>('.canvas')!,canvasStyle=getComputedStyle(canvas),paperBox=paper.getBoundingClientRect(),
      scale=Number(paper.closest<HTMLElement>('.workspace')?.style.getPropertyValue('--native-zoom'))||nativeDocumentZoom(root),padding=Number.parseFloat(canvasStyle.paddingLeft)||0,
      extent=sheets.projection.width*scale+2,origin=canvas.getBoundingClientRect().left+canvas.clientLeft+padding+Math.max(0,(canvas.clientWidth-2*padding-extent)/2)-canvas.scrollLeft;
    for(let index=0;index<backgrounds.children.length;index++){
      /** Complete physical page corners retain native half-up horizontal rounding independently from inter-page gaps. */
      const sheet=backgrounds.children[index] as HTMLElement,left=Math.round(origin+sheets.projection.cells[index].x*scale),right=Math.round(origin+sheets.projection.cells[index].x*scale+sheets.pages.paper.width/NATIVE_UNITS_PER_CSS_PIXEL*scale+2),
        offset=`${(left-paperBox.left)/scale}px`,width=`${(right-left)/scale}px`,key=offset+':'+width;
      if(NATIVE_GRID_EDGE_WIDTHS.get(sheet)!==key){NATIVE_GRID_EDGE_WIDTHS.set(sheet,key);sheet.style.left=offset;sheet.style.width=width;}
    }
  }
  if(paper.dataset.nativeFit){
    /** Original fit frames retain whole device DPI and nearest absolute paper edges, with halfway edges rounding down. */
    const zoom=nativeDocumentZoom(root),extent=Math.floor((sheets.pages.paper.height/NATIVE_UNITS_PER_CSS_PIXEL+2*sheets.border)*zoom/SHEET_LAYOUT_QUANTUM)*SHEET_LAYOUT_QUANTUM;
    for(/** Snapping only background paint cannot change authored pagination or source coordinates. */const sheet of backgrounds.querySelectorAll<HTMLElement>('.native-sheet-background')){
      /** Absolute edge snapping preserves centered paper geometry across even and odd viewport sizes. */
      const top=sheet.getBoundingClientRect().top,bottom=Math.ceil(top+extent-0.5),height=`${(bottom-top)/zoom}px`;
      if(NATIVE_FIT_EDGE_HEIGHTS.get(sheet)!==height){NATIVE_FIT_EDGE_HEIGHTS.set(sheet,height);sheet.style.height=height;}
    }
  }
}
