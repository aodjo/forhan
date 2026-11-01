import {PORTABLE_FONT_LICENSE} from './portable-font-license.ts';
import {PORTABLE_KOREAN_FAMILY,PORTABLE_KOREAN_RANGES} from './font-fallback.ts';

/**
 * Describe the two trusted offline Korean faces with their complete licensing.
 *
 * The editor supplies build-owned local asset URLs. Standalone output supplies
 * original data URLs for the same bytes, preserving source ranges and real
 * weight declarations without copying large payloads into every live DOM.
 * @param {string} regular - Trusted build-owned regular OpenType source URL.
 * @param {string} bold - Trusted build-owned bold OpenType source URL.
 * @returns {string} Matching font declarations and original full license.
 * @example
 * const css=createPortableFontCss(regularAsset,boldAsset);
 */
export function createPortableFontCss(regular:string,bold:string):string {
  return `/*\n${PORTABLE_FONT_LICENSE.replace(/\*\//gu,'* /')}\n*/
@font-face{font-family:"${PORTABLE_KOREAN_FAMILY}";src:url("${regular}") format("opentype");font-style:normal;font-weight:400;font-display:block;unicode-range:${PORTABLE_KOREAN_RANGES}}
@font-face{font-family:"${PORTABLE_KOREAN_FAMILY}";src:url("${bold}") format("opentype");font-style:normal;font-weight:700;font-display:block;unicode-range:${PORTABLE_KOREAN_RANGES}}
`;
}
