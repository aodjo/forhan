import { test, expect, type Page, type Route } from "@playwright/test";

/** Unicode source distinguishes the requested document from the initial empty editor. */
const COLD_DOCUMENT_TEXT = "처음 여는 포한 문서 — cafe\u0301와 한글";

/**
 * Preserve a file selected at the earliest available application input.
 *
 * Real production font requests remain pending while the public file input is
 * used. An application may queue that selection or publish the input after it
 * is ready, but it must retain the original filename and authored Unicode text.
 * @async
 * @param {{page: Page}} context - Fresh browser renderer with an empty font cache.
 * @returns {Promise<void>} Resolves after the selected source replaces the empty document.
 * @throws {Error} If font loading stalls or the earliest file selection is lost.
 * @example
 * // A cold start followed immediately by opening an FHN file retains its text.
 */
async function verifyColdDocumentOpen({ page }: { page: Page }): Promise<void> {
  /** Assigned promise resolver releases both genuine packaged font requests together. */
  let releaseFonts!: () => void;
  /** Assigned observer reports the first genuine font request before selecting a file. */
  let observeRequest!: () => void;
  /** Network gate changes resource timing without replacing fonts or editor behavior. */
  const fontGate = new Promise<void>(
    /**
     * Retain the font gate resolver for the test's cleanup path.
     *
     * Both font routes await the same promise so neither weight bypasses the cold start.
     * @param {() => void} resolve - Resolver supplied by the native Promise implementation.
     * @returns {void} Stores the resolver without releasing any resource.
     * @example
     * releaseFonts(); // Allow the actual font responses to continue.
     */
    function captureFontGate(resolve) { releaseFonts = resolve; },
  );
  /** Request observation is independent of page load, which can await top-level initialization. */
  const firstFontRequest = new Promise<void>(
    /**
     * Retain the observer for the first actual font network request.
     *
     * Calling this resolver again for the second font weight has no additional effect.
     * @param {() => void} resolve - Resolver supplied by the native Promise implementation.
     * @returns {void} Stores the one-time network observation callback.
     * @example
     * observeRequest(); // Signals that the browser has requested a real font.
     */
    function captureRequestObserver(resolve) { observeRequest = resolve; },
  );
  /**
   * Delay the actual font response until the initial public file selection starts.
   *
   * Continuing the route preserves the production font bytes and cache behavior.
   * @async
   * @param {Route} route - Genuine regular or bold portable font request.
   * @returns {Promise<void>} Resolves after the original network request continues.
   * @throws {Error} If the page closes before the pending request can continue.
   * @example
   * await holdFont(route); // The actual response remains pending until releaseFonts().
   */
  async function holdFont(route: Route): Promise<void> {
    observeRequest();
    await fontGate;
    await route.continue();
  }
  await page.route("**/assets/FhanSansKR-*.otf", holdFont);
  /** Loading can depend on top-level font initialization, so navigation starts without awaiting load. */
  const navigation = page.goto("/");
  try {
    await firstFontRequest;
    /** An already published input must consume its event before font loading is released. */
    const inputAlreadyPublished = await page.locator("#file-input").count() > 0;
    /** This selection uses the earliest available real input without waiting for editor visibility. */
    const selection = page.locator("#file-input").setInputFiles({
      name: "처음 여는 문서.fhn",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        application: "forhan", version: 1, title: "처음 여는 문서",
        doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: COLD_DOCUMENT_TEXT }] }] },
      })),
    });
    if (inputAlreadyPublished) await selection;
    releaseFonts();
    await navigation;
    await selection;
    await expect(page.locator(".tiptap")).toHaveText(COLD_DOCUMENT_TEXT);
    await expect(page.locator("#document-title")).toHaveValue("처음 여는 문서");
    await expect(page.locator("#format-badge")).toHaveText("FHN");
  } finally {
    releaseFonts();
    await navigation;
  }
}

test("opening a file at the earliest cold-start input preserves its Unicode document", verifyColdDocumentOpen);
