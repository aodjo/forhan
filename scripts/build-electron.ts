import { build } from "esbuild";

/** Compile isolated Electron entry points without bundling the Electron runtime. */
await build({
  entryPoints: { main: "electron/main.cts", preload: "electron/preload.cts" },
  outdir: "electron-dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
});
