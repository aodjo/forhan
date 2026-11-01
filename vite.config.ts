import { defineConfig } from "vite";
/** Relative asset paths and renderer syntax supported by the packaged desktop runtime. */
export default defineConfig({ base: "./", build: { target: "es2022",assetsInlineLimit:
  /**
   * Keep the two trusted fallback faces self-contained in every desktop bundle.
   *
   * Other assets retain Vite's ordinary threshold. Font data URLs can also be
   * embedded in isolated print and standalone documents without file access.
   * @param {string} filePath - Original build-owned asset path.
   * @param {Buffer} content - Complete original asset bytes.
   * @returns {boolean|undefined} Explicit inline decision for the trusted fonts, otherwise the ordinary default.
   * @example
   * inlinePortableFonts('/src/assets/FhanSansKR-Regular.otf',content); // true
   */
  function inlinePortableFonts(filePath,content){return filePath.endsWith('FhanSansKR-Regular.otf')||filePath.endsWith('FhanSansKR-Bold.otf')?content.length>0:undefined;}
} });
