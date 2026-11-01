import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Actual PDF font text matrices remain independent from DOM rectangles and source model attributes. */
export interface PdfGlyphItem { page:number; text:string; x:number; y:number; width:number; height:number; font:string; }
/** Actual native PDF link annotations retain their destination and physical clickable rectangle. */
export interface PdfLink { page:number; url:string; rect:number[]; }
/** Parsed real PDF content is test evidence rather than a replacement PDF writer. */
export interface PdfObservation { pages:number; pageBounds:number[][]; glyphs:PdfGlyphItem[]; links:PdfLink[]; }

/**
 * Decode actual PDF font CMaps, physical text matrices and native link annotations.
 *
 * A separate parser observes completed production bytes. It never consults the
 * renderer model or changes any output. A private byte copy prevents worker
 * ownership from detaching the caller's original file buffer.
 * @async
 * @param {Uint8Array} bytes - Actual complete production PDF file bytes.
 * @returns {Promise<PdfObservation>} Original physical glyphs and real clickable destinations.
 * @throws {Error} If the actual file cannot be parsed or native content is malformed.
 * @example
 * const observed=await observePdf(actualBytes); // Glyph baselines are in physical PDF points.
 */
export async function observePdf(bytes:Uint8Array):Promise<PdfObservation>{
  /** Independent decoding uses embedded original fonts and rejects executable PDF evaluation. */
  const document=await getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:false}).promise,glyphs:PdfGlyphItem[]=[],links:PdfLink[]=[],pageBounds:number[][]=[];
  try{
    for(let index=1;index<=document.numPages;index++){
      /** Original glyph transforms and actual PDF annotations belong to the same physical page. */
      const page=await document.getPage(index),content=await page.getTextContent(),annotations=await page.getAnnotations();
      pageBounds.push(Array.from(page.view));
      for(/** Marked-content boundaries cannot substitute for actual original text glyphs. */const item of content.items)if('str' in item&&item.str)glyphs.push({page:index,text:item.str,x:item.transform[4],y:item.transform[5],width:item.width,height:item.height,font:item.fontName});
      for(/** Only real native PDF link annotations satisfy the destination check. */const annotation of annotations)if(annotation.subtype==='Link'&&typeof annotation.url==='string')links.push({page:index,url:annotation.url,rect:Array.from(annotation.rect as number[])});
    }
    return {pages:document.numPages,pageBounds,glyphs,links};
  }finally{await document.destroy();}
}

/** Actual opaque vector fills retain physical PDF coordinates independently from renderer metadata. */
export interface PdfColorBox {page:number;bounds:[number,number,number,number];}

/**
 * Decode opaque solid-color path bounds from controlled actual native PDF fixtures.
 *
 * Original PDF transforms, save/restore state and actual fill operations determine
 * physical bounds. Text rectangles and production SVG attributes are never used.
 * Exactly touching rectangles with identical vertical extents share one paint
 * coverage box, preserving native paragraph-end shade pieces without duplicates.
 * Unsupported form composition fails rather than inventing a placement. The
 * controlled source uses rectangular fills and one independently specified color.
 * @async
 * @param {Uint8Array} bytes - Completed actual native PDF bytes.
 * @param {string} [color='#fff1a8'] - Literal opaque RGB fill color observed independently in the original source.
 * @returns {Promise<PdfColorBox[]>} Actual physical opaque source fill bounds in page and paint order.
 * @throws {Error} If controlled output uses unsupported form composition or invalid path coordinates.
 * @example
 * const shades=await observePdfColorBoxes(actualBytes); // Original native fill paths supply the independent oracle.
 */
export async function observePdfColorBoxes(bytes:Uint8Array,color='#fff1a8'):Promise<PdfColorBox[]>{
  /** Native PDF operators are decoded from a private copy of the actual completed file. */
  const document=await getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:false}).promise,boxes:PdfColorBox[]=[];
  try{
    for(let page=1;page<=document.numPages;page++){
      /** Each physical page starts with independent original PDF graphics state. */
      const operators=await (await document.getPage(page)).getOperatorList(),stack:Array<{matrix:number[];fill:string|null;alpha:number}>=[];
      let matrix=[1,0,0,1,0,0],fill:string|null=null,alpha=1;
      for(let index=0;index<operators.fnArray.length;index++){
        /** Actual operators preserve source order and their original numeric arguments. */
        const operation=operators.fnArray[index],args=operators.argsArray[index];
        if(operation===OPS.save)stack.push({matrix:matrix.slice(),fill,alpha});
        else if(operation===OPS.restore){
          /** A malformed graphics-state stack cannot provide trustworthy source coordinates. */
          const previous=stack.pop();if(!previous)throw new Error('Unbalanced native PDF graphics state.');({matrix,fill,alpha}=previous);
        }else if(operation===OPS.transform){
          /** PDF affine concatenation retains independent source transforms without browser geometry. */
          const next=args as number[],[a,b,c,d,e,f]=matrix;
          matrix=[a*next[0]+c*next[1],b*next[0]+d*next[1],a*next[2]+c*next[3],b*next[2]+d*next[3],a*next[4]+c*next[5]+e,b*next[4]+d*next[5]+f];
        }else if(operation===OPS.setFillRGBColor)fill=args[0];
        else if(operation===OPS.setFillColor||operation===OPS.setFillColorN)fill=null;
        else if(operation===OPS.setGState){for(/** Actual nonstroking opacity determines whether the controlled source fill is opaque. */const [name,value] of args[0])if(name==='ca')alpha=value;}
        else if(operation===OPS.paintFormXObjectBegin||operation===OPS.paintFormXObjectEnd)throw new Error('Unobserved native PDF form composition.');
        else if(operation===OPS.constructPath&&fill===color&&alpha===1&&[OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke].includes(args[0])){
          /** Actual PDF path bounds are mapped through all original graphics-state transforms. */
          const bounds=Array.from(args[2] as ArrayLike<number>),points:number[][]=[];
          if(bounds.length!==4||bounds.some(
            /**
             * Reject invalid independently decoded source coordinates.
             *
             * A malformed bound cannot be replaced by renderer geometry.
             * @param {number} value - Actual native path coordinate.
             * @returns {boolean} Whether the original value is invalid.
             * @example
             * // NaN cannot satisfy a physical paint comparison.
             */
            value=>!Number.isFinite(value)))throw new Error('Invalid native PDF fill bounds.');
          for(/** Four original rectangle corners determine physical transformed bounds. */const x of [bounds[0],bounds[2]])for(/** PDF coordinates may reverse their vertical axis independently from the source rectangle. */const y of [bounds[1],bounds[3]])points.push([matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
          let left=Infinity,bottom=Infinity,right=-Infinity,top=-Infinity;
          for(/** Actual transformed corners retain their unrounded physical PDF values. */const [x,y] of points){left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}
          /** Native paragraph-end style pieces can paint adjacent parts of the same opaque source shade. */
          const previous=boxes.at(-1);
          if(previous?.page===page&&Math.abs(previous.bounds[1]-bottom)<1e-6&&Math.abs(previous.bounds[3]-top)<1e-6&&Math.abs(previous.bounds[2]-left)<1e-6)previous.bounds[2]=right;
          else boxes.push({page,bounds:[left,bottom,right,top]});
        }
      }
    }
    return boxes;
  }finally{await document.destroy();}
}
