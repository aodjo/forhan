import { test, expect, type PlaywrightTestArgs } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readHwp } from "../src/formats/hwp";
import { readHwpx } from "../src/formats/hwpx";

/**
 * Verify native foreground/shading selection, cancellation and white/no-color export.
 *
 * Color choices stay local to the character dialog until its explicit Apply.
 * The no-color option clears shading without replacing opaque white or changing
 * the selected text's independent foreground color.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after GUI and both native serializers retain each state.
 * @throws {Error} If cancellation, undo or native white/no-color semantics fail.
 * @example
 * // White shading exports as #ffffff; 없음 removes only backgroundColor.
 */
async function verifyCharacterColorPalette({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("글자 색과 음영 색");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-color-target="#native-character-color"]').click();
  await expect(page.locator("#native-color-palette")).toHaveCSS(
    "width",
    "239px",
  );
  await expect(page.locator("#native-color-palette")).toHaveCSS(
    "height",
    "184px",
  );
  await page
    .locator(
      '#native-color-palette .cp-theme-base [data-color-value="#3a3c84"]',
    )
    .click();
  await page.locator('[data-color-target="#native-character-shade"]').click();
  await expect(page.locator("#native-color-palette")).toHaveCSS(
    "height",
    "213px",
  );
  await expect(
    page.locator("#native-color-palette [data-color-none]"),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .locator(
      '#native-color-palette .cp-theme-base [data-color-value="#ffffff"]',
    )
    .click();
  await expect(page.locator(".nd-character-sample")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator('.tiptap [style*="background-color"]')).toHaveCount(
    0,
  );
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(58, 60, 132)",
  );
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap")).toHaveText("글자 색과 음영 색");
  await expect(page.locator('.tiptap [style*="background-color"]')).toHaveCount(
    0,
  );
  await page.locator(".tiptap").press("ControlOrMeta+Shift+z");
  for (
    /** Actual native documents are checked separately for white and absent shading. */
    const absent of [
    false,
    true,
  ]) {
    if (absent) {
      await page
        .locator('.native-ribbon [data-native-action="char-format"]')
        .click();
      await page
        .locator('[data-color-target="#native-character-shade"]')
        .click();
      await page.locator("#native-color-palette [data-color-none]").click();
      await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
      await expect(page.locator(".tiptap span")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      await page
        .locator('.native-ribbon [data-native-action="char-format"]')
        .click();
      await page
        .locator('[data-color-target="#native-character-shade"]')
        .click();
      await page.locator("#native-color-palette [data-color-none]").click();
      await page.locator('[data-modal-value="apply"]').click();
      await expect(
        page.locator('.tiptap [style*="background-color"]'),
      ).toHaveCount(0);
    }
    for (
      /** Public native export whose character definitions retain the chosen state. */
      const format of [
      "hwp",
      "hwpx",
    ]) {
      /** Download listener precedes the real toolbar export action. */
      const pending = page.waitForEvent("download");
      await page.locator("#export-menu-toggle").click();
      await page.locator(`[data-export="${format}"]`).click();
      /** Serialized document saved through the actual browser export path. */
      const download = await pending;
      /** Native bytes are reconstructed independently from the UI style attributes. */
      const bytes = await readFile((await download.path())!);
      /** Actual native character attributes expose the distinction between white and no shading. */
      const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      /** First text-style definition retains foreground color even after shading is cleared. */
      const attrs = parsed.doc.content![0].content![0].marks![0].attrs!;
      expect(attrs.color).toBe("#3a3c84");
      expect(attrs.backgroundColor).toBe(absent ? undefined : "#ffffff");
    }
  }
}
test(
  "native character color palettes preserve explicit white, no shading, cancellation and undo",
  verifyCharacterColorPalette,
);

/**
 * Verify quick/ribbon color editing and spectrum keyboard, pointer and validation behavior.
 *
 * The same controller survives ribbon rebuilding. Invalid spectrum drafts cannot
 * bypass parent-dialog validation, and Escape dismisses only the color popup.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after real document colors follow each supported control.
 * @throws {Error} If a popup loses selection, commits an invalid draft or closes its parent.
 * @example
 * // Palette grid arrows select a neighboring color without changing text until Enter.
 */
async function verifyQuickColorSpectrum({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator(".tiptap").fill("색상 선택 유지");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#font-color-button").click();
  await page
    .locator('#native-color-palette .cp-standard [data-color-value="#0000ff"]')
    .click();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(0, 0, 255)",
  );
  await expect(page.locator(".tiptap")).toBeFocused();
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="color"]')
    .first()
    .click();
  await expect(
    page.locator(
      '#native-color-palette .cp-standard [data-color-value="#0000ff"]',
    ),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(66, 199, 241)",
  );
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-color-target="#native-character-color"]').click();
  await page.locator('[data-color-mode="spectrum"]').click();
  await page.locator(".cp-hex").fill("GGGGGG");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator("#native-color-palette")).toBeVisible();
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator(".cp-hex").press("Escape");
  await expect(page.locator("#native-color-palette")).toHaveCount(0);
  await expect(page.locator(".native-dialog-character")).toBeVisible();
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(66, 199, 241)",
  );
  await page.locator("#font-color-button").click();
  await page.locator('[data-color-mode="spectrum"]').click();
  await page.locator(".cp-hex").fill("123456");
  await expect(page.getByLabel("R 값", { exact: true })).toHaveValue("18");
  await expect(page.getByLabel("G 값", { exact: true })).toHaveValue("52");
  await expect(page.getByLabel("B 값", { exact: true })).toHaveValue("86");
  await page.getByLabel("색상 모델", { exact: true }).selectOption("HSL");
  await page.getByLabel("H 값", { exact: true }).fill("240");
  await page.getByLabel("S 값", { exact: true }).fill("100");
  await page.getByLabel("L 값", { exact: true }).fill("50");
  await expect(page.locator(".cp-hex")).toHaveValue("0000FF");
  await page.locator("[data-color-apply]").click();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(0, 0, 255)",
  );
  await page.locator("#font-color-button").click();
  await page.locator('[data-color-mode="palette"]').click();
  await expect(page.locator(".cp-palette-grid .cp-cell")).toHaveCount(240);
  await page.locator('[data-color-mode="spectrum"]').click();
  /** Actual plane bounds supply a physical center point for a real pointer drag. */
  const bounds = await page.locator(".cp-plane").boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator(".cp-hex")).toHaveValue("4040BF");
  await page.locator(".cp-plane").press("Enter");
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(64, 64, 191)",
  );
}
test(
  "quick and ribbon color controls share native palette, RGB/HSL and bounded spectrum interactions",
  verifyQuickColorSpectrum,
);

/**
 * Keep custom colors profile-local without committing an unfinished document draft.
 *
 * The native twelve-color capacity never evicts an existing user color. Reload
 * restores valid custom RGB values, and explicit deletion affects only the
 * selected custom slot rather than document content.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after capacity, reload and explicit deletion checks.
 * @throws {Error} If a full palette silently evicts colors or reload loses saved values.
 * @example
 * // A thirteenth unique custom color stays unadded until the user deletes a slot.
 */
async function verifyCustomColorStorage({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  await page.locator("#font-color-button").click();
  await page.locator('[data-color-mode="spectrum"]').click();
  for (let index = 0; index < 12; index++) {
    await page.locator(".cp-hex").fill((0x102030 + index).toString(16));
    await page.locator("[data-color-add]").click();
  }
  await page.locator(".cp-hex").fill("ABCDEF");
  await expect(page.locator("[data-color-add]")).toBeDisabled();
  await expect(page.locator(".cp-custom-cell:not(:disabled)")).toHaveCount(12);
  await page.locator(".cp-hex").press("Escape");
  await expect(page.locator(".tiptap")).toHaveText("");
  await page.reload();
  await page.locator("#font-color-button").click();
  await page.locator('[data-color-mode="spectrum"]').click();
  await expect(page.locator(".cp-custom-cell:not(:disabled)")).toHaveCount(12);
  await page.locator('[data-color-custom="0"]').click();
  await expect(page.locator(".cp-hex")).toHaveValue("102030");
  await page.locator("[data-color-delete]").click();
  await expect(page.locator(".cp-custom-cell:not(:disabled)")).toHaveCount(11);
}
test(
  "custom native color slots persist, respect capacity and require explicit deletion",
  verifyCustomColorStorage,
);

/**
 * Verify screen-picker results and cancellation stay bound to their originating field.
 *
 * The browser capability is controlled here; no desktop pixel is read. A stale
 * asynchronous result must not apply to another dialog field after Escape.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after explicit result and stale-request assertions.
 * @throws {Error} If a cancelled picker changes the document or replacement control.
 * @example
 * // Cancelling a shade request prevents its late result from changing foreground color.
 */
async function verifyScreenPickerLifetime({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.addInitScript(
    /**
     * Install a controlled asynchronous screen-color capability for this test page.
     *
     * The stub deliberately permits a result after abort, exercising the
     * application's own originating-field identity checks without screen access.
     * @returns {void} Registers the controlled picker constructor.
     * @example
     * // Tests resolve the current request explicitly with a chosen RGB value.
     */
    () => {
      /** Test-owned capability state remains inside this isolated browser page. */
      const state = window as unknown as {
        EyeDropper?: unknown;
        colorSignal?: AbortSignal;
        resolveColor?: (result: { sRGBHex: string }) => void;
      };
      state.EyeDropper = class {
        /**
         * Expose a deferred color result without invoking an operating-system picker.
         *
         * The signal is recorded while the promise remains externally controlled.
         * @async
         * @param {{signal: AbortSignal}} options - Application-owned request lifetime.
         * @returns {Promise<{sRGBHex:string}>} Explicitly resolved test color.
         * @example
         * // A later test action resolves this exact pending request.
         */
        async open(options: {
          signal: AbortSignal;
        }): Promise<{ sRGBHex: string }> {
          state.colorSignal = options.signal;
          return new Promise(
            /**
             * Retain the current owned request's explicit resolution function.
             *
             * No implicit event or timer chooses a color for the application.
             * @param {(result: {sRGBHex:string}) => void} resolve - Current promise resolver.
             * @returns {void} Makes the controlled request available to the test.
             * @example
             * // Resolving after Escape simulates a late browser capability response.
             */
            (resolve) => {
              state.resolveColor = resolve;
            },
          );
        }
      };
    },
  );
  await page.goto("/");
  await page.locator(".tiptap").fill("화면 색 선택 수명");
  await page.locator(".tiptap").press("ControlOrMeta+a");
  await page.locator("#font-color-button").click();
  await page.locator("[data-color-eye]").click();
  await page.evaluate(
    /**
     * Complete the current controlled screen selection with a known opaque color.
     *
     * This verifies result routing without reading or capturing any desktop pixel.
     * @returns {void} Resolves only the request created by the preceding click.
     * @example
     * // The selected phrase receives #13579b through the normal color handler.
     */
    () =>
      (
        window as unknown as {
          resolveColor: (result: { sRGBHex: string }) => void;
        }
      ).resolveColor({ sRGBHex: "#13579b" }),
  );
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(19, 87, 155)",
  );
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="char-format"]')
    .click();
  await page.locator('[data-color-target="#native-character-shade"]').click();
  await page.locator("[data-color-eye]").click();
  await page.keyboard.press("Escape");
  await page.locator('[data-color-target="#native-character-color"]').click();
  expect(
    await page.evaluate(
      /**
       * Inspect cancellation and deliver a stale result to the old request.
       *
       * A replacement foreground picker is already open, so request identity must
       * prevent the old shading response from reaching the new field.
       * @returns {boolean} Whether the old request was explicitly aborted.
       * @example
       * // The late white result must leave the current foreground draft unchanged.
       */
      () => {
        /** Controlled request state is private to this isolated test page. */
        const state = window as unknown as {
          colorSignal: AbortSignal;
          resolveColor: (result: { sRGBHex: string }) => void;
        };
        state.resolveColor({ sRGBHex: "#ffffff" });
        return state.colorSignal.aborted;
      },
    ),
  ).toBe(true);
  await expect(page.locator("#native-color-palette")).toBeVisible();
  await expect(page.locator("#native-character-color")).toHaveValue("#13579b");
  await expect(page.locator("#native-character-shade")).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.locator('[data-modal-value="cancel"]:not(.modal-x)').click();
  await expect(page.locator(".tiptap span")).toHaveCSS(
    "color",
    "rgb(19, 87, 155)",
  );
}
test(
  "screen-color requests apply explicit results and discard late responses after cancellation",
  verifyScreenPickerLifetime,
);
