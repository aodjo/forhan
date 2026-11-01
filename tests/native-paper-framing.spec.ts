import {test,type Page} from '@playwright/test';
import {exerciseNativePaperFraming} from './helpers/native-paper-framing.ts';
import {exerciseNativePaperCentering} from './helpers/native-paper-centering.ts';

/**
 * Retain original shade-unit boundaries and small-scale physical page gaps.
 *
 * Complete native captures establish literal expected edges independently
 * from the actual renderer and its public source imports and view controls.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser renderer.
 * @returns {Promise<void>} Resolves after twenty original frames and 32 viewport centering conditions agree.
 * @throws {Error} If native paper columns, vertical shading or source content differs.
 * @example
 * // A one-HWP-unit margin increment moves the native 85-percent first shade edge.
 */
async function verifyBrowserNativePaperFraming({page}:{page:Page}):Promise<void>{
  test.setTimeout(120000);await page.goto('/');
  /**
   * Resize the real browser viewport without supplying expected geometry.
   *
   * Ordinary application observers independently project the current source.
   * @async
   * @param {number} width - Requested actual viewport width.
   * @param {number} height - Requested actual viewport height.
   * @returns {Promise<void>} Resolves after the actual viewport changes.
   * @example
   * await resize(1440,960);
   */
  const resize=async(width:number,height:number):Promise<void>=>{await page.setViewportSize({width,height});};
  await exerciseNativePaperFraming(page,resize,test.info().outputPath('native-paper-framing'));
  await exerciseNativePaperCentering(page,resize,test.info().outputPath('native-paper-centering'));
}

test('twenty original native margin and small-scale frames retain shade-unit boundaries and horizontal page coverage',verifyBrowserNativePaperFraming);
