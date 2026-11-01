import {test,type Page} from '@playwright/test';
import {exerciseNativePageViewFrames,exerciseNativeZoomBehavior} from './helpers/native-page-view-scenarios.ts';

/**
 * Match original native page-view paper pixels through actual public controls.
 *
 * Every completed frame retains its complete unchanged PNG and source identity.
 * @async
 * @param {{page:Page}} context - Actual isolated browser renderer.
 * @returns {Promise<void>} Resolves after all thirty-four original conditions agree.
 * @throws {Error} If physical source papers or accepted native zoom differ.
 * @example
 * // Nine-page originals distinguish horizontal single views from vertical multi-page rows.
 */
async function verifyBrowserNativePageFrames({page}:{page:Page}):Promise<void>{
  test.setTimeout(120000);await page.goto('/');
  /**
   * Resize the actual browser viewport without injecting source geometry.
   *
   * Application observers remain responsible for fitting and projection.
   * @async
   * @param {number} width - Actual requested viewport width.
   * @param {number} height - Actual requested viewport height.
   * @returns {Promise<void>} Resolves after the real viewport changes.
   * @example
   * await resize(1440,960);
   */
  const resize=async(width:number,height:number):Promise<void>=>{await page.setViewportSize({width,height});};
  await exerciseNativePageViewFrames(page,resize,test.info().outputPath('native-page-view-frames'));
}

/**
 * Preserve native dialog drafts and real source navigation through page-view changes.
 *
 * Actual wheel events, caret page changes and one undo establish working public behavior.
 * @async
 * @param {{page:Page}} context - Actual isolated browser renderer.
 * @returns {Promise<void>} Resolves after original geometry and source behavior agree.
 * @throws {Error} If any observed native control or source operation differs.
 * @example
 * // Pressing Enter on Cancel discards the independent view draft.
 */
async function verifyBrowserNativeZoomBehavior({page}:{page:Page}):Promise<void>{await page.goto('/');await exerciseNativeZoomBehavior(page);}

test('34 original native page-view frames preserve exact paper pixels and unchanged source',verifyBrowserNativePageFrames);
test('native zoom dialog preserves original geometry, independent drafts, page caret navigation and wheel behavior',verifyBrowserNativeZoomBehavior);
