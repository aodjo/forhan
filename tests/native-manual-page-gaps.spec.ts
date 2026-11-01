import {test,type Page} from '@playwright/test';
import {exerciseNativeManualPageGaps} from './helpers/native-manual-page-gaps.ts';

/**
 * Preserve all original low manual page strides through the public renderer.
 *
 * Independent native cursor samples cover every caption, two paper widths and
 * both page arrangements while actual source and undo behavior remain intact.
 * @async
 * @param {{page:Page}} context - Actual isolated public renderer.
 * @returns {Promise<void>} Resolves after all92 independently observed conditions agree.
 * @throws {Error} If native strides, source content or undo differs.
 * @example
 * // Adjacent manual captions retain their original source gaps even at identical display DPI.
 */
async function verifyNativeManualPageGaps({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');await exerciseNativeManualPageGaps(page,test.info().outputPath('native-manual-page-gaps'));
}

test('92 original manual page strides preserve source gaps, saved state and one undo across widths and layouts',verifyNativeManualPageGaps);
