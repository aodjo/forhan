import { defineConfig } from "@playwright/test";

if (
  process.platform !== "win32" ||
  process.arch !== "x64" ||
  !process.env.FORHAN_PACKAGED_EXECUTABLE ||
  !process.env.FORHAN_IME_REPORT_DIRECTORY
)
  throw new Error(
    "Use the explicit Windows x64 native IME gate with an installed Korean IME.",
  );

/** Explicit operating-system input tests run serially on a real interactive Windows host. */
export default defineConfig({
  testDir: "./tests",
  testMatch: "windows-ime.native.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  outputDir: "test-results/windows-ime",
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.FORHAN_IME_TEST_REPORT }],
  ],
  use: { trace: "retain-on-failure" },
});
