import {
  test,
  expect,
  type Page,
  type PlaywrightTestArgs,
} from "@playwright/test";
import { localFontFixture } from "./fixtures/local-font";

/**
 * Install a controlled local-font capability without reading desktop font files.
 *
 * Independent SFNT fixtures exercise the real metadata parser. Descriptor
 * duplication, permission denial and delayed completion stay deterministic.
 * Actual Windows enumeration is verified separately through the packaged runtime.
 * @async
 * @param {Page} page - Isolated browser page.
 * @param {boolean} [deny=false] - Whether enumeration should reject with permission denial.
 * @param {boolean} [delayed=false] - Whether the test explicitly releases enumeration later.
 * @param {boolean} [metadataDelayed=false] - Whether actual fixture blobs wait after canonical enumeration succeeds.
 * @returns {Promise<void>} Resolves after the controlled capability is installed before page load.
 * @example
 * await installFontCatalog(page);
 */
async function installFontCatalog(
  page: Page,
  deny = false,
  delayed = false,
  metadataDelayed = false,
): Promise<void> {
  await page.addInitScript(
    /**
     * Expose synthetic browser-owned font descriptors for an isolated test page.
     *
     * No native permissions, filesystem paths or real font binaries are involved.
     * @param {{first:number[],second:number[],deny:boolean,delayed:boolean,metadataDelayed:boolean}} data - Independent metadata fixtures and request behavior.
     * @returns {void} Installs one deterministic local-font query capability.
     * @example
     * // Two family choices include one Latin-only face and one localized Hangul face.
     */
    ({ first, second, deny, delayed, metadataDelayed }) => {
      /** Isolated request state used only by this controlled browser test. */
      const state = window as unknown as {
        fontCatalogCalls: number;
        fontResolve?: () => void;
        fontMetadataResolve?: () => void;
      };
      state.fontCatalogCalls = 0;
      /** Optional blob gate leaves the successful canonical descriptor response independent of metadata timing. */
      const metadataGate = metadataDelayed
        ? new Promise<void>(
            /**
             * Retain the controlled metadata release callback before any blob is read.
             *
             * Canonical enumeration remains available while only optional fixture bytes wait.
             * @param {() => void} resolve - Native Promise completion callback.
             * @returns {void} Stores the isolated metadata gate resolver.
             * @example
             * window.fontMetadataResolve(); // Releases the real fixture metadata reads.
             */
            function captureMetadataGate(resolve) {
              state.fontMetadataResolve = resolve;
            },
          )
        : Promise.resolve();
      /**
       * Prepare a browser Blob provider for one independent metadata fixture.
       *
       * The synthetic blob contains no actual font outlines or installed font bytes.
       * @param {number[]} bytes - Independently encoded SFNT fixture.
       * @returns {Function} Asynchronous font-blob capability.
       * @example
       * const provider = fixtureBlob(first);
       */
      function fixtureBlob(bytes: number[]): () => Promise<Blob> {
        /**
         * Return the selected independent metadata fixture as a browser Blob.
         *
         * The production parser still reads its real name/cmap/OS2 table slices.
         * @async
         * @returns {Promise<Blob>} Independent fixture container.
         * @example
         * await provider(); // Controlled local font metadata.
         */
        const provider = async () => {
          await metadataGate;
          return new Blob([Uint8Array.from(bytes)]);
        };
        return provider;
      }
      Object.defineProperty(window, "queryLocalFonts", {
        configurable: true,
        value:
          /**
           * Resolve one controlled native font enumeration request.
           *
           * Duplicate style descriptors test family deduplication; optional delay
           * tests that discovery cannot commit a font to a replaced source field.
           * @async
           * @returns {Promise<object[]>} Synthetic installed face descriptors.
           * @throws {DOMException} When the test intentionally denies local-font access.
           * @example
           * // One request serves quick, ribbon and character-dialog font controls.
           */
          async () => {
            state.fontCatalogCalls++;
            if (deny)
              throw new DOMException(
                "Denied by the controlled test",
                "NotAllowedError",
              );
            if (delayed)
              await new Promise<void>(
                /**
                 * Retain this request until the test explicitly releases its result.
                 *
                 * Cancellation of a popup does not implicitly grant or resolve enumeration.
                 * @param {Function} resolve - Completion callback for this controlled request.
                 * @returns {void} Exposes the isolated release callback.
                 * @example
                 * // The test can cancel a popup before a descriptor list arrives.
                 */
                (resolve) => {
                  state.fontResolve = resolve;
                },
              );
            return [
              {
                family: "Fixture Font",
                style: "Bold",
                blob: fixtureBlob(first),
              },
              {
                family: "Fixture Font",
                style: "Regular",
                blob: fixtureBlob(first),
              },
              {
                family: "Western Fixture",
                style: "Regular",
                blob: fixtureBlob(second),
              },
            ];
          },
      });
    },
    {
      first: [...localFontFixture("Fixture Font", "검증 글꼴", true, 0)],
      second: [
        ...localFontFixture("Western Fixture", "Western Fixture", false, 0),
      ],
      deny,
      delayed,
      metadataDelayed,
    },
  );
}

/**
 * Verify installed font selection, native menu geometry and scoped dialog drafts.
 *
 * Real source select events update the document only after explicit commitment.
 * Font metadata localizes labels, filters languages and survives ribbon rebuilds.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after font entry, keyboard navigation and cancellation checks.
 * @throws {Error} If a font menu closes on its opening click or changes formatting before commitment.
 * @example
 * // A localized Korean label commits the valid canonical Fixture Font identifier.
 */
async function verifyFontPicker({ page }: PlaywrightTestArgs): Promise<void> {
  await installFontCatalog(page);
  await page.goto("/");
  await page.locator(".tiptap").fill("글꼴 선택과 문서 유지");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#font-family").click();
  await expect(page.locator("#native-font-picker")).toBeVisible();
  await expect(page.locator("#native-font-picker")).toHaveCSS("width", "393px");
  await expect(page.locator("#native-font-picker")).toHaveCSS(
    "height",
    "474px",
  );
  await expect(page.locator("#font-family")).toHaveAttribute(
    "data-installed-families",
    "2",
  );
  await expect(
    page.locator('.nfp-row[data-font-family="Fixture Font"]'),
  ).toHaveText("Tт검증 글꼴");
  await page.locator('.nfp-row[data-font-family="Fixture Font"]').click();
  await expect(page.locator("#native-font-picker")).toHaveCount(0);
  await expect(page.locator(".tiptap")).toBeFocused();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "font-family",
    '"Fixture Font"',
  );
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator("#font-family")).toHaveValue("함초롬바탕");
  await page.locator(".tiptap").press("ControlOrMeta+Shift+z");
  await expect(page.locator("#font-family")).toHaveValue("Fixture Font");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon select[data-native-action="font"]')
    .click();
  await expect(
    page.locator('.nfp-row[data-font-family="Western Fixture"]'),
  ).toBeVisible();
  await page.locator("#native-font-draft").press("Escape");
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="language"]').selectOption("0");
  await page.locator('[name="family"]').click();
  await expect(page.locator("#native-font-picker")).toHaveCSS(
    "height",
    "478px",
  );
  await expect(
    page.locator('.nfp-row[data-font-family="Western Fixture"]'),
  ).toHaveCount(0);
  await page.locator("#native-font-draft").fill("no such font");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#native-font-picker")).toBeVisible();
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator("#native-font-draft").press("Escape");
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator('[name="language"]').selectOption("1");
  await page.locator('[name="family"]').click();
  await expect(
    page.locator('.nfp-row[data-font-family="Western Fixture"]'),
  ).toBeVisible();
  await page.locator("#native-font-draft").fill("West");
  await page.locator("#native-font-draft").press("Enter");
  await expect(page.locator('[name="family"]')).toHaveValue("Western Fixture");
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "font-family",
    '"Fixture Font"',
  );
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "font-family",
    '"Fixture Font"',
  );
  await page.locator("#font-family").press("Alt+ArrowDown");
  await page.locator("#native-font-draft").fill("West");
  await page.locator("#native-font-draft").press("Tab");
  await expect(page.locator("#font-family")).toHaveValue("Western Fixture");
  await expect(page.locator(".tiptap")).toHaveText("글꼴 선택과 문서 유지");
  expect(
    await page.evaluate(
      /**
       * Read the controlled capability request counter.
       *
       * Lazy discovery must be shared across every rebuilt native font field.
       * @returns {number} Number of actual descriptor enumeration requests.
       * @example
       * // Opening three font surfaces still performs one enumeration.
       */
      () =>
        (window as unknown as { fontCatalogCalls: number }).fontCatalogCalls,
    ),
  ).toBe(1);
}
test(
  "native font menus localize installed names and preserve selection, language scope and drafts",
  verifyFontPicker,
);

/**
 * Keep late local-font discovery separate from cancelled or replaced controls.
 *
 * The old quick menu is cancelled before its request resolves; a replacement
 * character dialog can use the result without receiving an unsolicited font edit.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after late discovery populates only valid current controls.
 * @throws {Error} If a late result revives old UI or edits the document.
 * @example
 * // Cancelling an unfinished font request leaves the original family selected.
 */
async function verifyLateFontDiscovery({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await installFontCatalog(page, false, true);
  await page.goto("/");
  await page.locator(".tiptap").fill("늦게 도착한 글꼴 목록");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#font-family").click();
  await page.locator("#native-font-draft").press("Escape");
  await page.locator('[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[name="family"]').click();
  await page.evaluate(
    /**
     * Release the explicitly pending controlled descriptor request.
     *
     * The original menu has already been cancelled and its field identity changed.
     * @returns {void} Resolves the current test's local-font enumeration.
     * @example
     * // Metadata can now arrive while a different font control owns the menu.
     */
    () => (window as unknown as { fontResolve: () => void }).fontResolve(),
  );
  await expect(
    page.locator('.nfp-row[data-font-family="Fixture Font"]'),
  ).toBeVisible();
  await expect(page.locator('[name="family"]')).toHaveValue("함초롬바탕");
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(page.locator("#native-font-picker")).toHaveCount(0);
  await expect(page.locator("#native-font-draft")).toHaveCount(0);
  await expect(page.locator("#font-family")).toHaveValue("함초롬바탕");
}
test(
  "late font enumeration cannot revive a cancelled menu or apply a family to a replacement field",
  verifyLateFontDiscovery,
);

/**
 * Retain existing and imported font choices when browser font access is denied.
 *
 * Denial does not claim an installed catalog, overwrite selection or repeatedly
 * prompt on each menu opening. The document remains editable with known choices.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after fallback menu and cancellation checks.
 * @throws {Error} If font capability denial loses the selected document family.
 * @example
 * // A browser without local-font access still exposes the authored font name.
 */
async function verifyFontDenial({ page }: PlaywrightTestArgs): Promise<void> {
  await installFontCatalog(page, true);
  await page.goto("/");
  await page.locator("#font-family").click();
  await expect(page.locator("#font-family")).toHaveAttribute(
    "data-font-catalog",
    "fallback",
  );
  await expect(page.locator("#native-font-picker")).toBeVisible();
  await page.locator("#native-font-draft").press("Escape");
  await page.locator("#font-family").click();
  await expect(
    page.locator('.nfp-row[data-font-family="함초롬바탕"]'),
  ).toBeVisible();
  await page.locator("#native-font-draft").press("Escape");
  await expect(page.locator("#font-family")).toHaveValue("함초롬바탕");
}
test(
  "denied local font capability preserves the source family and a working fallback menu",
  verifyFontDenial,
);

/**
 * Release only the controlled optional font metadata request.
 *
 * The already fulfilled native-style descriptor response and selected document
 * remain unchanged; production metadata parsing still reads the original fixtures.
 * @async
 * @param {Page} page - Actual isolated browser renderer with its controlled blob gate.
 * @returns {Promise<void>} Resolves after the original fixture reads are released.
 * @throws {Error} If the actual owning renderer has already closed.
 * @example
 * await releaseMetadata(page);
 */
async function releaseMetadata(page: Page): Promise<void> {
  await page.evaluate(
    /**
     * Resolve the original metadata gate without replacing its bytes or source state.
     *
     * A second call has no additional effect on the native Promise resolver.
     * @returns {void} Releases the optional local fixture blob reads.
     * @example
     * // Only metadata timing changes; actual document selection remains authoritative.
     */
    () => Reflect.get(window, "fontMetadataResolve")?.(),
  );
}

test("actual installed families remain selectable while optional font metadata is pending", /**
 * Select a genuinely enumerated canonical family before its optional metadata is ready.
 *
 * A later localized label must update both the real field and open menu while
 * preserving the authored text and already selected canonical document family.
 * @async
 * @param {{page:Page}} context - Isolated real production browser renderer.
 * @returns {Promise<void>} Resolves after early selection and late localization both preserve source.
 * @throws {Error} If pending optional reads hide actual families or later change authored source.
 * @example
 * // A slow font blob never leaves a successful installed catalog empty.
 */
async ({ page }: { page: Page }) => {
  await installFontCatalog(page, false, false, true);
  await page.goto("/");
  await page.locator(".tiptap").fill("선택 가능한 실제 글꼴과 원문");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#font-family").click();
  try {
    await expect(page.locator("#font-family")).toHaveAttribute(
      "data-font-catalog",
      "installed",
    );
    await expect(page.locator("#font-family")).toHaveAttribute(
      "data-installed-families",
      "2",
    );
    await expect(
      page.locator('.nfp-row[data-font-family="Fixture Font"]'),
    ).toContainText("Fixture Font");
    await page.locator('.nfp-row[data-font-family="Fixture Font"]').click();
    await expect(page.locator("#font-family")).toHaveValue("Fixture Font");
    await expect(page.locator(".tiptap span")).toHaveCSS(
      "font-family",
      '"Fixture Font"',
    );
    await releaseMetadata(page);
    await page.locator("#font-family").click();
    await expect(
      page.locator('.nfp-row[data-font-family="Fixture Font"]'),
    ).toContainText("검증 글꼴");
    await expect(page.locator("#font-family option:checked")).toHaveText(
      "검증 글꼴",
    );
    await expect(page.locator("#font-family")).toHaveValue("Fixture Font");
    await expect(page.locator(".tiptap")).toHaveText(
      "선택 가능한 실제 글꼴과 원문",
    );
    await expect(page.locator(".tiptap span")).toHaveCSS(
      "font-family",
      '"Fixture Font"',
    );
  } finally {
    await releaseMetadata(page);
  }
});
