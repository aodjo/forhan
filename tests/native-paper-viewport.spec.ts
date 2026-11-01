import {test,type Page} from '@playwright/test';
import {exerciseNativePaperFrames,exerciseNativePaperResize} from './helpers/native-paper-scenarios.ts';

/**
 * Match original native paper placement and maintain source behavior through viewport changes.
 *
 * Literal original frame pixels establish all observable paper edges without
 * consulting production layout functions. Resize-only operations additionally
 * verify actual source shading and the preserved vertical movement column.
 * @async
 * @param {{page:Page}} context - Actual isolated public application renderer.
 * @returns {Promise<void>} Resolves after all original frames and actual source navigation agree.
 * @throws {Error} If original paper placement, source paint or source navigation changes.
 * @example
 * // A single 50-percent page is centered while a longer document retains its native top inset.
 */
async function verifyBrowserNativePaperViewport({page}:{page:Page}):Promise<void>{
  test.setTimeout(180000);await page.goto('/');
  /**
   * Resize the actual browser viewport without changing document state.
   *
   * Real layout and resize observers must finish their own dependent work.
   * @async
   * @param {number} width - Requested actual viewport width in CSS pixels.
   * @param {number} height - Requested actual viewport height in CSS pixels.
   * @returns {Promise<void>} Resolves after the browser applies the requested viewport.
   * @example
   * await resize(1440,961); // A one-pixel change cannot leave source shading at an old raster origin.
   */
  const resize=async(width:number,height:number):Promise<void>=>{await page.setViewportSize({width,height});};
  await exerciseNativePaperFrames(page,resize,test.info().outputPath('native-paper-frames'));await exerciseNativePaperResize(page,resize);
}

test('82 original native viewport frames preserve physical paper placement, resize-only paint and source caret columns',verifyBrowserNativePaperViewport);
