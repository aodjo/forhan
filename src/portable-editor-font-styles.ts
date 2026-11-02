import regular from './assets/FhanSansKR-Regular.otf?no-inline';
import bold from './assets/FhanSansKR-Bold.otf?no-inline';
import {createPortableFontCss} from './portable-font-css.ts';
import {PORTABLE_KOREAN_FAMILY} from './font-fallback.ts';

/** Local cached font assets keep the live editor stylesheet small while standalone outputs embed the same original bytes. */
export const PORTABLE_EDITOR_FONT_CSS=createPortableFontCss(regular,bold);

/**
 * Load both actual bundled weights before the first native source measurement.
 *
 * Trusted local asset URLs reuse the same original font bytes without copying
 * large payloads into the live document. Later editor font-loading observers
 * remain active for source changes and independent measurement documents.
 * @async
 * @param {Document} document - Original owning application document with installed font CSS.
 * @returns {Promise<void>} Resolves after both original bundled faces are available.
 * @throws {Error} If either actual bundled face is absent or fails to load.
 * @example
 * await loadPortableKoreanFonts(document);
 */
export async function loadPortableKoreanFonts(document:Document):Promise<void>{
  /** Real normal and bold faces are loaded independently without synthetic weight declarations. */
  const regular=await document.fonts.load(`400 16px "${PORTABLE_KOREAN_FAMILY}"`,'한글'),bold=await document.fonts.load(`700 16px "${PORTABLE_KOREAN_FAMILY}"`,'한글');
  if(!regular.length||!bold.length)throw new Error('The bundled Korean fallback font faces are unavailable.');
}
