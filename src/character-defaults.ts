/** Native character marks retain appearance separately from heading and hyperlink semantics. */
export interface CharacterAppearanceMark {type:string;attrs?:Record<string,unknown>;}

/**
 * Check one original native character mark without inferring visual defaults.
 *
 * A heading or hyperlink can have an explicit normal character appearance.
 * @param {readonly CharacterAppearanceMark[]} marks - Original explicit character marks.
 * @param {string} kind - Actual mark type to inspect.
 * @returns {boolean} Whether the original explicit appearance contains this mark.
 * @example
 * hasCharacterMark(marks,'bold');
 */
export function hasCharacterMark(marks:readonly CharacterAppearanceMark[],kind:string):boolean{
  for(/** Only explicit source marks establish an encoded native character flag. */const mark of marks)if(mark.type===kind)return true;
  return false;
}

/**
 * Retain an explicitly normal native heading weight in an owned mark array.
 *
 * Native character shapes carry a real false bold flag. Browser heading
 * defaults must not turn that source flag back on after reading a native file.
 * Only the owned array is updated; shared style objects are copied first.
 * @param {CharacterAppearanceMark[]} marks - Owned parsed native character marks.
 * @returns {void} Retains an explicit normal-weight reset when bold is absent.
 * @example
 * retainNormalCharacterWeight(marks); // A native normal-weight heading remains normal.
 */
export function retainNormalCharacterWeight(marks:CharacterAppearanceMark[]):void{
  if(hasCharacterMark(marks,'bold'))return;
  for(let index=0;index<marks.length;index++){
    /** Existing complete native character attributes remain independent from the one normal-weight flag. */
    const mark=marks[index];
    if(mark.type==='textStyle'){marks[index]={...mark,attrs:{...mark.attrs,nativeNormalWeight:true}};return;}
  }
  marks.push({type:'textStyle',attrs:{nativeNormalWeight:true}});
}

/**
 * Create a semantic native hyperlink without inventing a missing underline.
 *
 * Native underline flags already arrive as real character marks. A missing
 * native underline must stay absent despite the browser link default.
 * @param {readonly CharacterAppearanceMark[]} marks - Actual encoded native character appearance.
 * @param {Record<string,unknown>} attrs - Validated native link destination and attributes.
 * @returns {CharacterAppearanceMark} Link mark retaining explicit native underline absence.
 * @example
 * const link=nativeHyperlinkAppearance(marks,{href:'https://example.com'});
 */
export function nativeHyperlinkAppearance(marks:readonly CharacterAppearanceMark[],attrs:Record<string,unknown>):CharacterAppearanceMark{
  return{type:'link',attrs:{...attrs,...(!hasCharacterMark(marks,'underline')?{nativeDefaultUnderline:false}:{})}};
}
