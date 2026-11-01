/** Bundled OpenType assets become local data URLs in both production compilers. */
declare module '*.otf' {
  /** Build-owned original font data URL; no runtime network download is required. */
  const source:string;
  export default source;
}
