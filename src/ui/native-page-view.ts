import {NATIVE_UNITS_PER_CSS_PIXEL} from '../native-line-layout.ts';

/** Native page arrangement belongs to the view rather than authored document settings. */
export type NativePageShape = 'auto'|'single'|'two'|'facing'|'multiple';
/** Native single-page views can advance through vertical or horizontal workspace scrolling. */
export type NativePageDirection = 'vertical'|'horizontal';
/** Independent view choices remain outside file serialization and source history. */
export interface NativePageView {
  shape:NativePageShape;
  columns:number;
  rows:number;
  direction:NativePageDirection;
  horizontalWheel:boolean;
}
/** One physical page occupies an independent source-free cell inside the view. */
export interface NativePageCell {x:number;y:number;}
/** View projection retains the original page count and immutable physical source units. */
export interface NativePageProjection {
  cells:NativePageCell[];
  width:number;
  height:number;
  strideX:number;
  strideY:number;
  columns:number;
  rows:number;
}
/** Native paper bodies use a sixteen-pixel unzoomed gap before applying the viewport minimum. */
export const NATIVE_PAGE_VIEW_GAP=16;
/** Original small-scale views retain at least five viewport pixels between physical paper bodies. */
export const NATIVE_PAGE_VIEW_MIN_GAP=5;
/** Original manual captions 10 through 32 retain independently measured gaps in 1/7200-inch document units. */
const NATIVE_MANUAL_PAGE_GAPS=[3600,3240,3120,3000,2640,2520,2520,2400,2160,2160,2040,1800,1800,1680,1560,1560,1560,1440,1440,1320,1200,1200,1200] as const;
/** Each actual application paper owns independent view settings without changing authored source. */
const pageViews=new WeakMap<HTMLElement,NativePageView>();

/**
 * Resolve an original manual page gap independently from display DPI rounding.
 *
 * All integer manual captions below the ordinary gap transition were measured
 * through original cursor-to-document coordinates on two paper widths. Adjacent
 * captions can share display DPI while retaining different source-unit gaps.
 * Callers without a manual caption retain the existing automatic fit rule.
 *
 * @param {number} zoom - Positive effective display scale after device DPI rounding.
 * @param {number} [percentage] - Explicit manual integer caption from 10 through 500.
 * @returns {number} Unzoomed CSS distance between physical source page bodies.
 * @throws {RangeError} If display scale or an explicit manual caption is invalid.
 * @example
 * nativePageViewGap(0.125,12); // 41.6; the adjacent caption 13 retains 40 at the same DPI.
 */
export function nativePageViewGap(zoom:number,percentage?:number):number{
  if(!Number.isFinite(zoom)||zoom<=0||percentage!==undefined&&(!Number.isInteger(percentage)||percentage<10||percentage>500))throw new RangeError('Native page gaps require a valid display scale and manual caption.');
  if(percentage===undefined)return Math.max(NATIVE_PAGE_VIEW_GAP,NATIVE_PAGE_VIEW_MIN_GAP/zoom);
  return percentage<=32?NATIVE_MANUAL_PAGE_GAPS[percentage-10]/NATIVE_UNITS_PER_CSS_PIXEL:NATIVE_PAGE_VIEW_GAP;
}

/**
 * Read an independent snapshot of the current paper view.
 *
 * Temporary export editors and newly created papers retain native single-page
 * defaults. A caller cannot mutate the registered view through this snapshot.
 * @param {HTMLElement} paper - Actual application paper or temporary source container.
 * @returns {NativePageView} Independent current view settings or a fresh default view.
 * @example
 * const view=readNativePageView(paper); // The document's physical margins remain separate.
 */
export function readNativePageView(paper:HTMLElement):NativePageView{return{...(pageViews.get(paper)??defaultNativePageView())};}

/**
 * Register one validated source-independent native page view.
 *
 * The marker notifies owned source-layout observers without dispatching a
 * document transaction. Physical page dimensions and history remain unchanged.
 * @param {HTMLElement} paper - Actual application paper containing the source editor.
 * @param {NativePageView} view - Explicit accepted view settings.
 * @returns {void} Stores an independent view and updates its rendering-only marker.
 * @throws {RangeError} If an explicit page-grid dimension is outside the native integer range.
 * @example
 * setNativePageView(paper,{...defaultNativePageView(),shape:'two',columns:2});
 */
export function setNativePageView(paper:HTMLElement,view:NativePageView):void{
  if(!Number.isInteger(view.columns)||!Number.isInteger(view.rows)||view.columns<1||view.columns>8||view.rows<1||view.rows>8)throw new RangeError('Native view grids require one to eight integer columns and rows.');
  /** Accepted settings remain independent from the caller's editable dialog draft. */
  const snapshot={...view},key=[view.shape,view.columns,view.rows,view.direction,Number(view.horizontalWheel)].join(':');
  pageViews.set(paper,snapshot);if(paper.dataset.nativePageView!==key)paper.dataset.nativePageView=key;
}

/**
 * Create the original single-page vertical view defaults.
 *
 * Each editor owns an independent mutable view while document files retain
 * only their authored page dimensions, margins, grid and source content.
 * @returns {NativePageView} Fresh native single-column view settings.
 * @example
 * const view=defaultNativePageView(); // Editing another file cannot mutate these settings by reference.
 */
export function defaultNativePageView():NativePageView{
  return{shape:'single',columns:1,rows:1,direction:'vertical',horizontalWheel:false};
}

/**
 * Project unchanged physical source pages into the requested native view.
 *
 * Automatic rows independently center their remaining pages. Facing pages
 * reserve the first empty cell. Native horizontal direction applies only to
 * a one-by-one manual view; explicit multi-page grids retain vertical rows.
 * The calculation changes no document page, source paragraph or undo entry.
 * @param {number} count - Actual independently paginated source page count.
 * @param {number} width - Physical paper width in unzoomed CSS pixels.
 * @param {number} height - Physical paper height in unzoomed CSS pixels.
 * @param {NativePageView} view - Current independent native page arrangement.
 * @param {number} availableWidth - Actual document canvas width in viewport CSS pixels.
 * @param {number} zoom - Effective display scale rather than its integer caption percentage.
 * @param {number} [percentage] - Explicit manual caption, omitted for automatic fit projection.
 * @returns {NativePageProjection} Immutable source page cells and complete physical view extents.
 * @throws {RangeError} If source geometry or actual display scale is invalid.
 * @example
 * projectNativePages(3,793.7,340.16,{...defaultNativePageView(),shape:'facing'},1395,0.5); // The first page occupies the right-hand cell.
 */
export function projectNativePages(count:number,width:number,height:number,view:NativePageView,availableWidth:number,zoom:number,percentage?:number):NativePageProjection{
  if(!Number.isInteger(count)||count<1||![width,height,zoom].every(
    /**
     * Reject an invalid original geometry or display scale before projection.
     *
     * Native source validation has already constrained ordinary paper sizes.
     * @param {number} value - Physical source or actual display scale.
     * @returns {boolean} Whether the value is finite and positive.
     * @example
     * // An invalid zero scale cannot create infinite source cell coordinates.
     */
    value=>Number.isFinite(value)&&value>0))throw new RangeError('Native page projection requires valid source pages and display geometry.');
  /** Native automatic fitting uses the real available width and complete scaled paper framing. */
  const gap=nativePageViewGap(zoom,percentage),strideX=width+gap,strideY=height+gap,
    columns=view.shape==='auto'?Math.max(1,Math.min(count,Math.floor(((Number.isFinite(availableWidth)?Math.max(0,availableWidth):0)/zoom-gap)/strideX))):view.shape==='single'?1:view.shape==='two'||view.shape==='facing'?2:Math.max(1,Math.min(8,Math.round(view.columns))),
    groupRows=view.shape==='multiple'?Math.max(1,Math.min(8,Math.round(view.rows))):1,
    horizontal=view.direction==='horizontal'&&view.shape!=='auto'&&columns===1&&groupRows===1,facing=view.shape==='facing'?1:0,cells:NativePageCell[]=[];
  let maximumX=0,maximumY=0;
  for(let page=0;page<count;page++){
    /** Source page order remains unchanged regardless of a cell's physical screen position. */
    const index=page+facing,block=Math.floor(index/(columns*groupRows)),within=index%(columns*groupRows),row=Math.floor(index/columns),
      remaining=view.shape==='auto'?Math.min(columns,count-row*columns):columns,
      x=horizontal?(block*columns+within%columns)*strideX:((index%columns)+(columns-remaining)/2)*strideX,
      y=(horizontal?Math.floor(within/columns):row)*strideY;
    cells.push({x,y});maximumX=Math.max(maximumX,x+width);maximumY=Math.max(maximumY,y+height);
  }
  /** Explicit two/facing/multiple views retain their complete configured row width, including an empty trailing cell. */
  const projectedWidth=view.shape==='auto'?Math.min(columns,count)*strideX-gap:horizontal?Math.max(columns*strideX-gap,maximumX):columns*strideX-gap;
  return{cells,width:projectedWidth,height:maximumY,strideX,strideY,columns,rows:Math.max(1,Math.ceil((maximumY+gap)/strideY))};
}
