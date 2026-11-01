import {NATIVE_BASELINE_FRACTION} from './native-line-layout.ts';

/** One measured original line uses native hundredths of a point, independently from browser pixels. */
export interface NativePaginationLine {
  height:number;
  advance:number;
}

/** Paragraph margins, grid preference and explicit page breaks retain their independent source scope. */
export interface NativePaginationParagraph {
  before:number;
  after:number;
  snap:boolean;
  pageBreakBefore:boolean;
  lines:NativePaginationLine[];
}

/** A physical placement refers to the original paragraph and line without splitting editable source. */
export interface NativePageLine {
  paragraph:number;
  line:number;
  page:number;
  top:number;
  baseline:number;
  height:number;
  advance:number;
  fit:number;
}

/** Independent page rows and the ordered source projection share the same immutable placement records. */
export interface NativePaginationLayout {
  pages:NativePageLine[][];
  lines:NativePageLine[];
}

/**
 * Snap positive native source progression without changing intentional overlap.
 *
 * Unlike computed CSS coordinates, integral native source distances require no
 * serialization tolerance. Disabled grids and signed margins retain their source.
 * @param {number} value - Original native distance in hundredths of a point.
 * @param {number} interval - Positive native grid interval, or zero when disabled.
 * @returns {number} Next positive grid multiple, or the unchanged source distance.
 * @example
 * snapNativePageDistance(1700,1600); // 3200; literal zero remains zero.
 */
export function snapNativePageDistance(value:number,interval:number):number{
  return value>0&&interval>0?Math.ceil(value/interval)*interval:value;
}

/**
 * Place measured native paragraphs on independent physical pages.
 *
 * Original native PDFs and caches establish a strict last-line fit: rounded
 * glyph height must end before the body edge. Line progression remains a
 * separate quantity, so a 17pt line on a 16pt grid can use the last 16pt cell
 * while advancing 32pt. Page transitions restart the grid and preserve before
 * spacing only when a new paragraph starts there. Oversized first lines are
 * placed once rather than producing an unbounded sequence of empty pages.
 * @param {NativePaginationParagraph[]} paragraphs - Original ordered paragraph geometry.
 * @param {number} bodyHeight - Positive physical body height in native hundredths of a point.
 * @param {number} lineGrid - Nonnegative independent section interval in native units.
 * @returns {NativePaginationLayout} Actual page membership and source-referenced line baselines.
 * @throws {RangeError} If a physical height, source distance or line advance is invalid.
 * @example
 * paginateNativeParagraphs(paragraphs,65764,3288); // Twenty ordinary grid rows per native A4 page.
 */
export function paginateNativeParagraphs(
  paragraphs:NativePaginationParagraph[],bodyHeight:number,lineGrid:number,
):NativePaginationLayout{
  if(!Number.isFinite(bodyHeight)||bodyHeight<=0||!Number.isFinite(lineGrid)||lineGrid<0)
    throw new RangeError('Invalid native pagination geometry.');
  /** Source rows retain a stable mapping even when a paragraph spans several pages. */
  const pages:NativePageLine[][]=[[]],lines:NativePageLine[]=[];
  let offset=0;
  for(let paragraph=0;paragraph<paragraphs.length;paragraph++){
    /** Paragraph source margins and preferences are never inferred from collapsed CSS boxes. */
    const block=paragraphs[paragraph],interval=block.snap?lineGrid:0,
      before=snapNativePageDistance(block.before,interval),after=snapNativePageDistance(block.after,interval);
    if(!Number.isFinite(before)||!Number.isFinite(after))throw new RangeError('Invalid native paragraph spacing.');
    if(block.pageBreakBefore&&pages[pages.length-1].length){pages.push([]);offset=0;}
    offset=snapNativePageDistance(offset,interval)+before;
    for(let line=0;line<block.lines.length;line++){
      /** Fit height and next-line progression remain independent native quantities. */
      const source=block.lines[line],fit=snapNativePageDistance(source.height,interval),
        advance=snapNativePageDistance(source.advance,interval);
      if(!Number.isFinite(source.height)||source.height<=0||!Number.isFinite(source.advance)||source.advance<0)
        throw new RangeError('Invalid native source line geometry.');
      if(offset+fit>=bodyHeight&&pages[pages.length-1].length){
        pages.push([]);offset=line===0?before:0;
      }
      /** The original logical cache start does not include half of additional snapped leading. */
      const placement:NativePageLine={paragraph,line,page:pages.length-1,top:offset,
        baseline:offset+Math.round(source.height*NATIVE_BASELINE_FRACTION)+(advance-source.advance)/2,
        height:source.height,advance,fit};
      pages[pages.length-1].push(placement);lines.push(placement);offset+=advance;
    }
    offset+=after;
  }
  return {pages,lines};
}
