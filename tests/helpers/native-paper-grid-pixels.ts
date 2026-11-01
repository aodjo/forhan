import type {NativePixelBounds} from './native-paper-pixels.ts';

/**
 * Decode visible controlled paper components from a complete original or actual frame.
 *
 * A four-neighbour flood fill finds connected opaque white paper independently
 * from source glyphs, shades, renderer metadata and production grid formulas.
 * The measured reference shell bounds exclude chrome, rulers and scroll strips.
 * Screenshots remain unmodified and every decoded pixel retains its original
 * coordinate. Controlled documents leave connected source-free paper margins.
 * @async
 * @param {string|{encoded:string;minimumHeight:number}} input - Complete unmodified PNG bytes and an optional explicit small-paper height floor; string input retains fifty pixels.
 * @returns {Promise<NativePixelBounds[]>} Visible white paper extrema ordered by row and column.
 * @throws {Error} If the complete original image cannot be decoded.
 * @throws {RangeError} If an explicit component height is not a positive integer.
 * @example
 * await page.evaluate(nativePaperGridPixels,png.toString('base64')); // Facing pages retain a genuinely empty first cell.
 */
export async function nativePaperGridPixels(input:string|{encoded:string;minimumHeight:number}):Promise<NativePixelBounds[]>{
  /** Small-scale fixtures explicitly lower only component height, preserving original pixels and the area floor. */
  const encoded=typeof input==='string'?input:input.encoded,minimumHeight=typeof input==='string'?50:input.minimumHeight;
  if(!Number.isInteger(minimumHeight)||minimumHeight<1)throw new RangeError('Paper component height must be a positive integer.');
  /** One-to-one image decoding preserves original source coordinates. */
  const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
  /** No scaling, crop, alignment, mask or recoloring precedes independent pixel observation. */
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  /** Complete opaque source pixels remain separate from the component search bookkeeping. */
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('A complete image decoder is unavailable.');
  context.drawImage(image,0,0);
  /** The controlled native reference shell's workspace has a fixed ruler and bottom document controls. */
  const width=canvas.width,height=canvas.height,bytes=context.getImageData(0,0,width,height).data,
    left=29,right=width-17,top=215,bottom=height-55,seen=new Uint8Array(width*height),queue=new Int32Array(width*height),papers:NativePixelBounds[]=[];
  /**
   * Recognize a literal opaque white source pixel.
   *
   * A foreground glyph or source shade remains a hole in its connected paper.
   * @param {number} index - Original complete-frame pixel index.
   * @returns {boolean} Whether every original RGB channel and alpha is exactly white and opaque.
   * @example
   * white(1000); // A grey workspace pixel cannot become paper.
   */
  function white(index:number):boolean{index*=4;return bytes[index]===255&&bytes[index+1]===255&&bytes[index+2]===255&&bytes[index+3]===255;}
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    /** Each connected source component enters the queue exactly once. */
    const initial=y*width+x;if(seen[initial]||!white(initial))continue;
    let start=0,end=1,minX=x,maxX=x,minY=y,maxY=y;queue[0]=initial;seen[initial]=1;
    while(start<end){
      /** Original complete-frame coordinates retain adjacency without image edits. */
      const index=queue[start++],column=index%width,row=Math.floor(index/width);
      minX=Math.min(minX,column);maxX=Math.max(maxX,column);minY=Math.min(minY,row);maxY=Math.max(maxY,row);
      for(let edge=0;edge<4;edge++){
        /** Four-neighbour connectivity preserves native borders without allocating one array per source pixel. */
        const neighbour=edge===0?(column>left?index-1:-1):edge===1?(column+1<right?index+1:-1):edge===2?(row>top?index-width:-1):(row+1<bottom?index+width:-1);
        if(neighbour<0||seen[neighbour])continue;seen[neighbour]=1;if(white(neighbour))queue[end++]=neighbour;
      }
    }
    if(end>=2000&&maxX-minX>=49&&maxY-minY>=minimumHeight-1)papers.push({left:minX,right:maxX,top:minY,bottom:maxY});
  }
  papers.sort(
    /**
     * Retain physical row and column ordering independently from source page metadata.
     *
     * Components in one measured row share their exact upper paper edge.
     * @param {NativePixelBounds} first - One original connected paper extent.
     * @param {NativePixelBounds} second - Another original connected paper extent.
     * @returns {number} Physical row order followed by physical column order.
     * @example
     * // A facing-page blank cell contributes no component or invented page.
     */
    (first,second)=>first.top-second.top||first.left-second.left);
  return papers;
}
