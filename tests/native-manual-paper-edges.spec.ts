import {test} from '@playwright/test';
import {exerciseNativeManualPaperEdges} from './helpers/native-manual-paper-edges.ts';

test('forty-eight original complete-paper frames retain original page edges for thirteen and forty-three source pages',
  /**
   * Retain original complete-paper pixels across public browser source and view changes.
   *
   * The source was authored and captured in the original installed application
   * before its literal frames entered this independent regression fixture.
   * @async
   * @param {{page:import('@playwright/test').Page}} context - Actual isolated browser page.
   * @returns {Promise<void>} Resolves after every original visible page array and clean source agree.
   * @throws {Error} If actual pixels or original source state differ.
   * @example
   * // Original low-scale page gaps also constrain an overflowing group's leading space.
   */
  async({page})=>{
    test.setTimeout(240000);await page.goto('/');
    await exerciseNativeManualPaperEdges(page,
      /**
       * Resize the actual browser viewport to its independently declared source condition.
       *
       * Ordinary application observers remain responsible for subsequent layout.
       * @async
       * @param {number} width - Actual viewport width in CSS pixels.
       * @param {number} height - Actual viewport height in CSS pixels.
       * @returns {Promise<void>} Resolves after the viewport changes.
       * @example
       * await resize(1440,961);
       */
      async(width,height)=>{await page.setViewportSize({width,height});},
    );
  },
);
