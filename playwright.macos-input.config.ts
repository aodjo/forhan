import {defineConfig} from '@playwright/test';

/** Actual macOS input-method verification is separate from protocol and browser keyboard regressions. */
export default defineConfig({testDir:'./tests',testMatch:'macos-input.native.ts',workers:1,timeout:180000,use:{trace:'retain-on-failure'},reporter:[['line'],['json',{outputFile:'release/validation/macos-input-results.json'}]],outputDir:'test-results/macos-input'});
