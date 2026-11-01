/** OpenType asset imports resolve to trusted build-owned resource URLs. */
declare module '*.otf' {
  /** Build-owned original font resource; no runtime network download is required. */
  const source:string;
  export default source;
}

/** Explicit Vite asset URLs reference bundled local files instead of duplicating font data inside live document styles. */
declare module '*.otf?no-inline' {
  /** Build-owned local asset URL; packaged editors resolve it inside their own resources. */
  const source:string;
  export default source;
}

/** Standalone output explicitly embeds the same font bytes in both development and production builds. */
declare module '*.otf?inline' {
  /** Trusted original OpenType data URL for self-contained standalone output. */
  const source:string;
  export default source;
}
