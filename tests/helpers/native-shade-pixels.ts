/** Literal source-color coverage is read from original full-frame screenshot bytes. */
export interface NativeShadePixelBox {left:number;top:number;right:number;bottom:number;width:number;height:number;pixels:number;}
/** Narrow provisional glyphs can retain the same strict geometric oracle without the sixteen-pixel word-noise filter. */
export interface NativeShadePixelInput {encoded:string;minimumWidth?:number;minimumHeight?:number;minimumPixels?:number;}

/**
 * Observe connected opaque source-shade pixels without modifying an original screenshot.
 *
 * Canvas decodes the complete original frame one-to-one. Exact RGB coverage
 * establishes painted source boxes independently from SVG attributes or native
 * layout metadata. Toolbar and status regions stay outside the document region.
 * No alignment, scaling, masking or replacement image is produced.
 * @async
 * @param {string|NativeShadePixelInput} input - Original complete PNG bytes as base64, optionally with a narrower source-glyph width filter.
 * @returns {Promise<NativeShadePixelBox[]>} Actual connected source-color coverage in original physical pixels.
 * @throws {Error} If actual original image decoding or pixel access fails.
 * @example
 * const boxes=await page.evaluate(nativeShadePixels,png.toString('base64')); // Source coordinates remain unchanged.
 */
export async function nativeShadePixels(input:string|NativeShadePixelInput):Promise<NativeShadePixelBox[]>{
  /** Ordinary word references keep their original sixteen-pixel filter; native preedit may contain a narrower real glyph. */
  const encoded=typeof input==='string'?input:input.encoded,minimumWidth=typeof input==='string'?16:Math.max(1,input.minimumWidth??16),
    minimumHeight=typeof input==='string'?4:Math.max(1,input.minimumHeight??4),minimumPixels=typeof input==='string'?50:Math.max(1,input.minimumPixels??50);
  /** The original complete frame retains its exact physical dimensions and all original channels. */
  const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
  /** One-to-one decoding reads original pixels without resampling or image edits. */
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  /** Literal source-color pixels remain independent from production rendering metadata. */
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
  /** The complete original image supplies every inspected pixel and connected component. */
  const bytes=context.getImageData(0,0,image.width,image.height).data,visited=new Uint8Array(image.width*image.height),boxes:NativeShadePixelBox[]=[];
  /**
   * Recognize the independently controlled original opaque source shade.
   *
   * Native and current screenshots use the same literal RGB source color.
   * @param {number} index - Original one-dimensional physical pixel index.
   * @returns {boolean} Whether this original pixel has exact source RGB coverage.
   * @example
   * match(index); // Antialiased foreground cannot replace an opaque background pixel.
   */
  function match(index:number):boolean{return bytes[index*4]===255&&bytes[index*4+1]===241&&bytes[index*4+2]===168;}
  for(let y=190;y<image.height-50;y++)for(let x=0;x<image.width;x++){
    /** Each original document-region color component is visited exactly once. */
    const index=y*image.width+x;if(visited[index]||!match(index))continue;
    /** A bounded source component retains its literal original extrema. */
    const stack=[index];visited[index]=1;
    let left=x,right=x,top=y,bottom=y,pixels=0;
    while(stack.length){
      /** Four-neighbor connectivity cannot wrap between unrelated image rows. */
      const at=stack.pop()!,px=at%image.width,py=Math.floor(at/image.width);
      left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);pixels++;
      for(/** Actual source neighbors retain their original physical image coordinates. */const next of [at-1,at+1,at-image.width,at+image.width])if(next>=0&&next<visited.length&&!visited[next]&&Math.abs(next%image.width-px)+Math.abs(Math.floor(next/image.width)-py)===1&&match(next)){visited[next]=1;stack.push(next);}
    }
    if(right-left+1>=minimumWidth&&bottom-top+1>=minimumHeight&&pixels>=minimumPixels)boxes.push({left,right,top,bottom,width:right-left+1,height:bottom-top+1,pixels});
  }
  return boxes;
}

/**
 * Read complete source-color extrema when foreground glyphs divide an opaque background.
 *
 * Every component retains original full-frame coordinates. The source glyph's
 * independently measured neighborhood selects relevant components without
 * clipping their extents, so oversized paint still fails the original edge
 * oracle. No image is aligned, scaled, masked or otherwise changed.
 * @param {NativeShadePixelBox[]} boxes - Actual original source-color connected components.
 * @param {{left:number;right:number;top:number;bottom:number}} region - Independent actual source-glyph neighborhood in original frame coordinates.
 * @returns {NativeShadePixelBox|null} Complete original color coverage, or no observed source color.
 * @example
 * nativeShadeCoverage(boxes,region); // A Hangul stroke can split the top yellow strip from the remaining background.
 */
export function nativeShadeCoverage(boxes:NativeShadePixelBox[],region:{left:number;right:number;top:number;bottom:number}):NativeShadePixelBox|null{
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,pixels=0;
  for(/** Foreground-separated components retain their complete original extrema rather than a clipped expected box. */const box of boxes){
    if(box.right<region.left||box.left>region.right||box.bottom<region.top||box.top>region.bottom)continue;
    left=Math.min(left,box.left);right=Math.max(right,box.right);top=Math.min(top,box.top);bottom=Math.max(bottom,box.bottom);pixels+=box.pixels;
  }
  return pixels?{left,right,top,bottom,width:right-left+1,height:bottom-top+1,pixels}:null;
}
