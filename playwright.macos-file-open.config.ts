import { defineConfig } from "@playwright/test";

if (
  process.platform !== "darwin" ||
  !process.env.FORHAN_PACKAGED_EXECUTABLE ||
  !process.env.FORHAN_MACOS_FILE_OPEN_DIRECTORY
)
  throw new Error(
    "Select an actual native Mac distribution through the explicit file-open gate.",
  );

/** All real operating-system file requests are serialized against exclusively owned native application instances. */
export default defineConfig({
  testDir: "./tests",
  testMatch: "macos-file-open.native.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  outputDir: "test-results/macos-file-open",
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.FORHAN_MACOS_FILE_OPEN_TEST_REPORT }],
  ],
  use: { trace: "retain-on-failure" },
});
