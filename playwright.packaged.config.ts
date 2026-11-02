import { defineConfig } from "@playwright/test";

if (!process.env.FORHAN_PACKAGED_EXECUTABLE)
  throw new Error("Use npm run test:packaged with a real packaged executable.");

/** Native packaged regressions never start Vite or substitute development Electron. */
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "desktop.spec.ts",
    "native-quit-desktop.spec.ts",
    "native-format-painter-desktop.spec.ts",
    "print-layout.spec.ts",
    "packaged-runtime.packaged.ts",
    "width-drag-desktop.spec.ts",
    "joined-lines-desktop.spec.ts",
    "contextual-width-desktop.spec.ts",
    "directional-layout-desktop.spec.ts",
    "paragraph-word-break-desktop.spec.ts",
    "paragraph-numbers-desktop.spec.ts",
    "paragraph-minimum-space-desktop.spec.ts",
    "paragraph-preview-desktop.spec.ts",
    "paragraph-line-grid-desktop.spec.ts",
    "fractional-print-desktop.spec.ts",
    "native-pagination-desktop.spec.ts",
    "native-body-grid-origin-desktop.spec.ts",
    "native-relative-shading-desktop.spec.ts",
    "native-paper-viewport-desktop.spec.ts",
    "native-fit-viewport-desktop.spec.ts",
    "native-page-view-desktop.spec.ts",
    "native-paper-framing-desktop.spec.ts",
    "native-paper-minimum-insets-desktop.spec.ts",
    "native-manual-paper-edges-desktop.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  outputDir: "test-results/packaged",
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.FORHAN_PACKAGED_TEST_REPORT }],
  ],
  use: { trace: "retain-on-failure" },
});
