import type {NativePixelBounds} from './native-paper-pixels.ts';

/** Controlled original page paint retains each source band's literal visible coverage. */
export interface NativeGridShade extends NativePixelBounds {pixels:number;}
/** Independent controlled source paint stays associated with its visible physical paper. */
export interface NativeGridPaint {papers:NativeGridShade[][];outsidePixels:number;}

/**
 * Decode controlled source shading independently inside each visible paper.
 *
 * Original opaque RGB coverage establishes horizontal source origins and line
 * positions without consulting production source offsets. Foreground-covered
 * gaps up to three rows remain inside a controlled line band. Wider gaps
 * identify separate lines; complete unmodified images retain all coordinates.
 * @async
 * @param {{encoded:string;papers:NativePixelBounds[]}} input - Complete PNG and independently decoded visible paper extrema.
 * @returns {Promise<NativeGridPaint>} Literal per-paper source bands and any paint outside physical paper.
 * @throws {Error} If a complete image decoder is unavailable.
 * @example
 * await page.evaluate(nativePaperGridShades,{encoded,papers}); // Projection cannot paint an unchanged source line on another page.
 */
export async function nativePaperGridShades(input:{encoded:string;papers:NativePixelBounds[]}):Promise<NativeGridPaint>{
  /** One-to-one decoding retains every original source pixel. */
  const image=new Image();image.src='data:image/png;base64,'+input.encoded;await image.decode();
  /** The complete original frame remains unmodified during independent observation. */
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  /** The controlled original native source uses one literal opaque shade color. */
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('A complete source image decoder is unavailable.');
  context.drawImage(image,0,0);
  /** Paint coordinates and component bookkeeping remain separate from the actual decoded source bytes. */
  const bytes=context.getImageData(0,0,canvas.width,canvas.height).data,rows:Array<Array<NativeGridShade|undefined>>=[];
  let outsidePixels=0;
  for(let y=215;y<canvas.height-55;y++)for(let x=29;x<canvas.width-17;x++){
    /** Only exact original source RGB and alpha establish controlled paint. */
    const offset=4*(y*canvas.width+x);if(bytes[offset]!==255||bytes[offset+1]!==241||bytes[offset+2]!==168||bytes[offset+3]!==255)continue;
    let page=-1;
    for(let index=0;index<input.papers.length;index++){
      /** Independently observed paper coverage determines source ownership. */
      const bounds=input.papers[index];if(x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom){page=index;break;}
    }
    if(page<0){outsidePixels++;continue;}
    rows[page]??=[];
    /** One original row retains literal source extrema independently from glyph holes. */
    const row=rows[page][y];
    if(row){row.left=Math.min(row.left,x);row.right=Math.max(row.right,x);row.pixels++;}
    else rows[page][y]={left:x,right:x,top:y,bottom:y,pixels:1};
  }
  /** Every independently observed page contributes a separate ordered source band collection. */
  const papers:NativeGridShade[][]=[];
  for(let index=0;index<input.papers.length;index++){
    /** Sparse source rows coalesce only the controlled gaps covered by foreground glyphs. */
    const bands:NativeGridShade[]=[];
    for(/** Original source foreground can cover at most three consecutive shade rows in these fixtures. */const row of rows[index]??[]){
      if(!row)continue;
      /** Source line ownership follows literal vertical coverage rather than renderer line indices. */
      const previous=bands.at(-1);
      if(previous&&row.top-previous.bottom<=4){previous.bottom=row.bottom;previous.left=Math.min(previous.left,row.left);previous.right=Math.max(previous.right,row.right);previous.pixels+=row.pixels;}
      else bands.push({...row});
    }
    papers.push(bands);
  }
  return{papers,outsidePixels};
}
