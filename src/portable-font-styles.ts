import regular from './assets/FhanSansKR-Regular.otf?inline';
import bold from './assets/FhanSansKR-Bold.otf?inline';
import {PORTABLE_KOREAN_FAMILY} from './font-fallback.ts';
import {createPortableFontCss} from './portable-font-css.ts';

/** Original licensing and both real weights accompany every self-contained Korean fallback stylesheet. */
const PORTABLE_FONT_CSS=createPortableFontCss(regular,bold);

/**
 * Supply offline fallback fonts only when an original output can use them.
 *
 * Static outputs include the complete license and original data URLs when
 * their captured source requests the face; omitted markup includes both faces.
 * Unrelated documents do not acquire unnecessary embedded font payloads.
 * @param {string} [html] - Captured source markup; omitted values include both trusted faces.
 * @returns {string} Trusted self-contained font CSS or an empty unused stylesheet.
 * @example
 * const css=portableFontStyles(editor.getHTML());
 */
export function portableFontStyles(html?:string):string{
  return html===undefined||html.includes(PORTABLE_KOREAN_FAMILY)?PORTABLE_FONT_CSS:'';
}
