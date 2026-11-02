import {characterFontCss} from './character-fonts.ts';

/** Distinct openly licensed derived family supplies original one-em modern Hangul advances. */
export const PORTABLE_KOREAN_FAMILY='Fhan Sans KR';
/** Only original Korean script ranges use this fallback; unrelated script font choices remain independent. */
export const PORTABLE_KOREAN_RANGES='U+1100-11FF,U+3130-318F,U+A960-A97F,U+AC00-D7AF,U+D7B0-D7FF';
/** Independently observed source families request the compatible Korean advance profile. */
const COMPATIBLE_SOURCE_FAMILIES=new Set(['맑은 고딕','malgun gothic']);

/**
 * Split an existing CSS family list without changing quoted or escaped names.
 *
 * Only commas outside original quoted strings delimit families. Literal native
 * names enter through characterFontCss first, so a comma inside a face name
 * cannot accidentally become a fallback-list boundary.
 * @param {string} value - Existing validated CSS font-family value.
 * @returns {string[]} Original family tokens with whitespace and escaping retained.
 * @example
 * splitFontFamilies('Arial,"A,B"'); // ['Arial','"A,B"']
 */
function splitFontFamilies(value:string):string[]{
  /** Original tokens are copied without CSS evaluation or model changes. */
  const result:string[]=[];
  let token='',quote='',escaped=false;
  for(/** Each source CSS character retains its original spelling. */const character of value){
    if(escaped){token+=character;escaped=false;continue;}
    if(character==='\\'){token+=character;escaped=true;continue;}
    if(quote){token+=character;if(character===quote)quote='';continue;}
    if(character==='"'||character==="'"){quote=character;token+=character;continue;}
    if(character===','){result.push(token);token='';continue;}
    token+=character;
  }
  result.push(token);return result;
}

/**
 * Normalize a simple source family for a bounded compatibility-profile lookup.
 *
 * Complex escaped CSS names remain unmatched and retain their original list.
 * This does not rename any family in the authored document or native output.
 * @param {string} token - One original validated CSS family token.
 * @returns {string} Normalized simple lookup identity.
 * @example
 * sourceFamilyIdentity('"Malgun Gothic"'); // 'malgun gothic'
 */
function sourceFamilyIdentity(token:string):string{
  /** Matching outer quotes belong to CSS syntax rather than the original family name. */
  const value=token.trim(),unquoted=/^(["'])([\s\S]*)\1$/u.exec(value)?.[2]??value;
  return unquoted.replace(/\s+/gu,' ').normalize('NFC').toLowerCase();
}

/**
 * Append a Korean metric fallback after an original compatible source family.
 *
 * Available original fonts always retain priority. The derived face is limited
 * to Korean script ranges, and original lists remain intact for other scripts.
 * Already rendered fallback lists remain idempotent across HTML serialization.
 * @param {string} family - Original validated CSS font-family value.
 * @returns {string} Rendering-only family list with original priority preserved.
 * @example
 * renderFontFamilyCss('"Malgun Gothic",Arial'); // '"Malgun Gothic","Fhan Sans KR",Arial'
 */
export function renderFontFamilyCss(family:string):string{
  /** Original family ordering is preserved, including caller-supplied fallback faces. */
  const tokens=splitFontFamilies(family),fallbackIdentity=PORTABLE_KOREAN_FAMILY.toLowerCase();
  for(/** An existing derived family must never be appended a second time. */const token of tokens)if(sourceFamilyIdentity(token)===fallbackIdentity)return family;
  /** Rendering tokens never replace the authored font-family field. */
  const rendered:string[]=[];
  for(/** Only independently observed source families receive the Korean advance fallback. */const token of tokens){
    rendered.push(token);
    if(COMPATIBLE_SOURCE_FAMILIES.has(sourceFamilyIdentity(token)))rendered.push(characterFontCss(PORTABLE_KOREAN_FAMILY));
  }
  return rendered.join(',');
}

/**
 * Render one literal native language face with its optional Korean fallback.
 *
 * Native names remain inert quoted tokens before profile matching. The original
 * seven-language font array continues to hold the untouched literal face name.
 * @param {string} face - Literal original native language face.
 * @returns {string} Safe rendering-only CSS family list.
 * @example
 * renderLiteralFontCss('맑은 고딕'); // Original face remains first.
 */
export function renderLiteralFontCss(face:string):string{
  return renderFontFamilyCss(characterFontCss(face));
}
