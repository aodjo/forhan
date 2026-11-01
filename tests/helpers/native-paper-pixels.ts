/** Original pixel rectangles use inclusive full-frame coordinates. */
export interface NativePixelBounds {left:number;right:number;top:number;bottom:number;}
/** Opaque source-color coverage remains independent from DOM drawing attributes. */
export interface NativePaperShade extends NativePixelBounds {width:number;height:number;pixels:number;}
/** Independently decoded native paper and source paint retain all visible physical bounds. */
export interface NativePaperPixels {
  width:number;
  height:number;
  shades:NativePaperShade[];
  papers:NativePixelBounds[];
  unpaintedBottom:NativePixelBounds|null;
}

/**
 * Observe actual paper edges and source-color bands in controlled original frames.
 *
 * Complete PNG decoding uses one canvas pixel per original pixel. The controlled
 * source has at least five blank rows between its shades at the smallest scale;
 * up to three foreground-covered rows can therefore remain inside one shade.
 * A source-free margin column identifies every visible white paper segment.
 * A full-width black strip explicitly identifies unpainted native capture rows,
 * whose paper continuation cannot supply an observed lower edge. No image is
 * cropped, aligned, scaled, recolored or otherwise edited.
 * @async
 * @param {string} encoded - Actual complete original PNG bytes encoded as base64.
 * @returns {Promise<NativePaperPixels>} Literal frame dimensions, original opaque source paint and observable white paper bounds.
 * @throws {Error} If the actual PNG cannot be decoded or its controlled source is not present.
 * @example
 * const pixels=await nativePaperPixels(encoded); // Expected edges come from original frame bytes, never CSS layout values.
 */
export async function nativePaperPixels(encoded:string):Promise<NativePaperPixels>{
  /** Original frame dimensions remain unchanged during decoding. */
  const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
  /** One-to-one decoding preserves each original channel and physical pixel position. */
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  /** Actual original pixels supply every independently measured rectangle. */
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
  /** The fixed document region excludes only controlled application chrome. */
  const bytes=context.getImageData(0,0,image.width,image.height).data,shades:NativePaperShade[]=[],papers:NativePixelBounds[]=[];
  /**
   * Read one literal opaque RGB value from the unmodified original frame.
   *
   * Out-of-frame sentinels terminate runs without substituting a pixel value.
   * @param {number} x - Original full-frame horizontal pixel coordinate.
   * @param {number} y - Original full-frame vertical pixel coordinate.
   * @param {number} red - Required literal red channel.
   * @param {number} green - Required literal green channel.
   * @param {number} blue - Required literal blue channel.
   * @returns {boolean} Whether the original pixel has the exact required RGB channels.
   * @example
   * rgb(x,y,255,241,168); // Antialiased foreground cannot replace an opaque source-color pixel.
   */
  function rgb(x:number,y:number,red:number,green:number,blue:number):boolean{
    if(x<0||x>=image.width||y<0||y>=image.height)return false;
    /** The original complete buffer retains one physical pixel per four channels. */
    const at=(y*image.width+x)*4;return bytes[at]===red&&bytes[at+1]===green&&bytes[at+2]===blue;
  }
  let previous:NativePaperShade|undefined;
  for(let y=190;y<image.height-50;y++){
    let left=image.width,right=-1,pixels=0;
    for(let x=0;x<image.width;x++)if(rgb(x,y,255,241,168)){left=Math.min(left,x);right=Math.max(right,x);pixels++;}
    if(!pixels)continue;
    if(previous&&y-previous.bottom<=4){previous.left=Math.min(previous.left,left);previous.right=Math.max(previous.right,right);previous.bottom=y;previous.width=previous.right-previous.left+1;previous.height=y-previous.top+1;previous.pixels+=pixels;}
    else{previous={left,right,top:y,bottom:y,width:right-left+1,height:1,pixels};shades.push(previous);}
  }
  if(shades.length<2)throw new Error('The controlled original source must retain at least two visible shade bands.');
  /** The source's second line has a blank gap before the next controlled line. */
  const sampleY=shades[1].bottom+3;
  let start=-1,paperLeft=0,paperRight=-1;
  for(let x=0;x<=image.width;x++){
    if(rgb(x,sampleY,255,255,255)){if(start<0)start=x;}
    else if(start>=0){if(x-start>paperRight-paperLeft+1){paperLeft=start;paperRight=x-1;}start=-1;}
  }
  if(paperRight-paperLeft<100)throw new Error('The controlled original source must retain an observable white paper margin.');
  /** Ten original pixels inside the paper stay in the controlled source-free left margin. */
  const sampleX=paperLeft+10;
  let top=-1;
  for(let y=190;y<=image.height-50;y++){
    if(y<image.height-50&&rgb(sampleX,y,255,255,255)){if(top<0)top=y;}
    else if(top>=0){
      if(y-top>=50)papers.push({left:paperLeft,right:paperRight,top,bottom:y-1});
      top=-1;
    }
  }
  let unpaintedBottom:NativePixelBounds|null=null;
  for(let y=190;y<image.height-50;y++){
    let black=true;
    for(let x=29;x<image.width-16;x++)if(!rgb(x,y,0,0,0)){black=false;break;}
    if(black){if(!unpaintedBottom)unpaintedBottom={left:29,right:image.width-17,top:y,bottom:y};else unpaintedBottom.bottom=y;}
  }
  return{width:image.width,height:image.height,shades,papers,unpaintedBottom};
}
