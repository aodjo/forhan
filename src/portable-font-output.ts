import {PORTABLE_KOREAN_FAMILY} from './font-fallback.ts';

/**
 * Load self-contained font payloads only for outputs that request the face.
 *
 * Normal editing and local measurement use bundled asset URLs. Dynamic loading
 * keeps their large embedded equivalents outside the initial renderer module
 * while retaining complete fonts and licensing in standalone HTML exports.
 * @async
 * @param {string} html - Original captured sanitized document markup.
 * @returns {Promise<string>} Complete licensed embedded font CSS or an unused empty value.
 * @throws {Error} If the build-owned output module cannot be loaded.
 * @example
 * const css=await portableOutputFontStyles(editor.getHTML());
 */
export async function portableOutputFontStyles(html:string):Promise<string>{
  if(!html.includes(PORTABLE_KOREAN_FAMILY))return '';
  /** The same trusted original data URLs are loaded only after an output needs them. */
  const {portableFontStyles}=await import('./portable-font-styles.ts');
  return portableFontStyles(html);
}
