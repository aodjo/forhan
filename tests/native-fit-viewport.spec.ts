import {test,type Page} from '@playwright/test';
import {exerciseNativeFitFrames,exerciseNativeFitBehavior} from './helpers/native-fit-scenarios.ts';

/**
 * Match original native fit frames and preserve source behavior through actual resizing.
 *
 * Original percentages, mode labels and complete paper pixels establish expected
 * behavior independently from production fitting calculations.
 * @async
 * @param {{page:Page}} context - Actual isolated public renderer.
 * @returns {Promise<void>} Resolves after all original frames and view/source operations agree.
 * @throws {Error} If persistent fitting, native paper geometry or source undo behavior changes.
 * @example
 * // Width fitting survives six actual viewport sizes without another fit command.
 */
async function verifyBrowserNativeFit({page}:{page:Page}):Promise<void>{
  test.setTimeout(120000);await page.goto('/');
  /**
   * Resize the actual browser viewport while preserving document and view state.
   *
   * Live canvas observers retain responsibility for applying a changed fit percentage.
   * @async
   * @param {number} width - Requested actual viewport width in pixels.
   * @param {number} height - Requested actual viewport height in pixels.
   * @returns {Promise<void>} Resolves after the browser applies its requested dimensions.
   * @example
   * await resize(1200,1000);
   */
  const resize=async(width:number,height:number):Promise<void>=>{await page.setViewportSize({width,height});};
  await exerciseNativeFitFrames(page,resize,test.info().outputPath('native-fit-frames'));await exerciseNativeFitBehavior(page,resize);
}

test('36 original native fit frames retain their modes, exact paper pixels and independent source undo through actual resizing',verifyBrowserNativeFit);
