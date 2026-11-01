import { defineConfig } from "vite";
/** Relative asset paths and renderer syntax supported by the packaged desktop runtime. */
export default defineConfig({ base: "./", build: { target: "es2022" } });
