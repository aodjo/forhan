import { defineConfig } from "@playwright/test";

if (
  process.platform !== "darwin" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  !process.env.FORHAN_MACOS_IME_HELPER ||
  !process.env.FORHAN_PACKAGED_EXECUTABLE ||
  !process.env.FORHAN_MACOS_IME_DIRECTORY
)
  throw new Error("Use the explicit CI-owned native macOS IME gate.");

/** Real operating-system input is serialized on the matching CI-owned Mac. */
export default defineConfig({
  testDir: "./tests",
  testMatch: "macos-ime.native.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  outputDir: "test-results/macos-ime",
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.FORHAN_MACOS_IME_TEST_REPORT }],
  ],
  use: { trace: "retain-on-failure" },
});
