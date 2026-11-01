import { test, type Page } from "@playwright/test";
import {
  verifyContextualTracking,
  verifyContextualTrackingWrap,
  verifyTrackedContextEditing,
} from "./helpers/contextual-tracking";

/**
 * Run the shared tracked-source editing flow with the actual browser fixture.
 *
 * Native output providers are explicit shared-flow arguments rather than
 * Playwright fixture names. This registration owns only its real browser page.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after original tracked source editing and output checks.
 * @example
 * // The same source flow also runs through actual native writers in the desktop gate.
 */
async function verifyBrowserTrackedEditing({
  page,
}: {
  page: Page;
}): Promise<void> {
  await verifyTrackedContextEditing({ page });
}

test(
  "contextual tracking retains actual native Arabic and Indic glyph origins, source cells and following text",
  verifyContextualTracking,
);
test(
  "tracked contextual source words retain coherent narrow and wide physical reflow",
  verifyContextualTrackingWrap,
);
test(
  "tracked contextual words preserve original bidi order through trusted editing, one undo and actual native and HTML output",
  verifyBrowserTrackedEditing,
);
