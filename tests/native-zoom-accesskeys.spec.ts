import {test,type Page} from '@playwright/test';
import {exerciseNativeZoomFieldAccessKeys} from './helpers/native-zoom-accesskeys.ts';

/**
 * Preserve original zoom field mnemonics, full-value replacement and disabled preferences.
 *
 * Actual public renderer events are compared with fourteen accepted original
 * native conditions, and view-only operations preserve source and one undo.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser renderer.
 * @returns {Promise<void>} Resolves after original native field-key behavior agrees.
 * @throws {Error} If focus, accepted source-independent view or numeric replacement differs.
 * @example
 * // Repeated Alt+U replaces 137 with 151 instead of appending another number.
 */
async function verifyNativeZoomFieldAccessKeys({page}:{page:Page}):Promise<void>{
  test.setTimeout(90000);await page.goto('/');await exerciseNativeZoomFieldAccessKeys(page,test.info().outputPath('native-zoom-accesskeys'));
}

test('fourteen original native zoom-field mnemonic conditions preserve focus, numeric replacement, disabled controls and source undo',verifyNativeZoomFieldAccessKeys);
