import regular from './assets/FhanSansKR-Regular.otf';
import bold from './assets/FhanSansKR-Bold.otf';
import {PORTABLE_FONT_LICENSE} from './portable-font-license.ts';
import {PORTABLE_KOREAN_FAMILY,PORTABLE_KOREAN_RANGES} from './font-fallback.ts';

/** Original licensing and both real weights accompany every self-contained Korean fallback stylesheet. */
const PORTABLE_FONT_CSS=`/*\n${PORTABLE_FONT_LICENSE.replace(/\*\//gu,'* /')}\n*/
@font-face{font-family:"${PORTABLE_KOREAN_FAMILY}";src:url("${regular}") format("opentype");font-style:normal;font-weight:400;font-display:block;unicode-range:${PORTABLE_KOREAN_RANGES}}
@font-face{font-family:"${PORTABLE_KOREAN_FAMILY}";src:url("${bold}") format("opentype");font-style:normal;font-weight:700;font-display:block;unicode-range:${PORTABLE_KOREAN_RANGES}}
`;

/**
 * Supply offline fallback fonts only when an original output can use them.
 *
 * The editor installs both weights once. Static outputs include the complete
 * license and original data URLs when their captured source requests the face;
 * unrelated documents do not acquire unnecessary embedded font payloads.
 * @param {string} [html] - Captured source markup; omitted values initialize the editor.
 * @returns {string} Trusted self-contained font CSS or an empty unused stylesheet.
 * @example
 * const css=portableFontStyles(editor.getHTML());
 */
export function portableFontStyles(html?:string):string{
  return html===undefined||html.includes(PORTABLE_KOREAN_FAMILY)?PORTABLE_FONT_CSS:'';
}

/**
 * Load both actual bundled weights before the first native source measurement.
 *
 * Fonts come from trusted local data URLs rather than a network or an installed
 * Hancom/Windows package. Later editor font-loading observers remain active for
 * ordinary source changes and independently created measurement documents.
 * @async
 * @param {Document} document - Original owning application document with installed font CSS.
 * @returns {Promise<void>} Resolves after both original bundled faces are available.
 * @throws {Error} If either actual bundled face is absent or fails to load.
 * @example
 * await loadPortableKoreanFonts(document);
 */
export async function loadPortableKoreanFonts(document:Document):Promise<void>{
  /** Real normal and bold font faces are loaded independently without synthetic weight declarations. */
  const regular=await document.fonts.load(`400 16px "${PORTABLE_KOREAN_FAMILY}"`,'한글'),bold=await document.fonts.load(`700 16px "${PORTABLE_KOREAN_FAMILY}"`,'한글');
  if(!regular.length||!bold.length)throw new Error('The bundled Korean fallback font faces are unavailable.');
}
