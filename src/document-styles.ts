import type { PageSettings } from "./types.ts";
import { DEFAULT_FONT_SIZE, defaultFontSize } from "./formatting.ts";

/** Trusted document roots used by the editor and standalone HTML/print documents. */
export type DocumentStyleRoot = ".native-shell .tiptap" | "body";

/**
 * Build the content stylesheet shared by editing, HTML export, PDF and printing.
 *
 * Document formatting remains separate from editor controls and page geometry.
 * Inline imported styles override these defaults. Only the two trusted roots
 * are accepted, so document content cannot inject a selector into the stylesheet.
 * @param {DocumentStyleRoot} root - Editor content root or standalone body.
 * @returns {string} Scoped document-content CSS with explicit print page breaks.
 * @example
 * const css = documentContentStyles('body');
 * // Ordinary paragraphs have no implicit after-spacing in every output.
 */
export function documentContentStyles(root: DocumentStyleRoot): string {
  /** Trusted selector shared by all generated descendant rules. */
  const scope = root === "body" ? "body" : ".native-shell .tiptap";
  /** Content rules exclude selection highlights, resize handles and app chrome. */
  let css = `${scope}{font-family:'함초롬바탕','HCR Batang','Batang','바탕','AppleMyungjo',serif;font-size:${DEFAULT_FONT_SIZE}pt;font-weight:400;font-synthesis:none;font-kerning:none;line-height:1.6;color:#000;text-align:justify;overflow-wrap:break-word}
${scope},${scope} *{box-sizing:border-box}
${scope} p{margin:0;white-space:pre-wrap}
${scope} svg[data-forhan-print-text]{display:none;position:absolute;left:0;top:0;overflow:visible}
@media print{${scope} .forhan-print-text-container{position:relative}${scope} svg[data-forhan-print-text]{display:block}${scope} forhan-print-source,${scope} a[data-forhan-print-link-source]{visibility:hidden}}
${scope} h1,${scope} h2,${scope} h3,${scope} h4,${scope} h5,${scope} h6{font-family:inherit;font-weight:700;letter-spacing:0;line-height:1.6;margin:0;white-space:pre-wrap;break-after:avoid}
${scope} ul,${scope} ol{margin:0;padding-left:22px}
${scope} li{padding-left:0}
${scope} li p{margin:0}
${scope} li::marker{color:#000}
${scope} blockquote{margin:10pt 0;padding:0 10pt;border-left:2px solid #aaa;color:#333}
${scope} a{color:#0000ff;text-decoration:underline}
${scope} img{display:block;max-width:100%;height:auto;margin:0}
${scope} table{border-collapse:collapse;border-color:#808080;table-layout:fixed;margin:0;width:auto;overflow:hidden;break-inside:auto}
${scope} td,${scope} th{border:1px solid #555;padding:2pt 5pt;vertical-align:top;position:relative;min-width:1em}
${scope} th{background:#f1f1f1;font-weight:700}
${scope} td>p:last-child,${scope} th>p:last-child{margin:0}
${scope} code{border-radius:0;background:#eee;padding:1px 3px}
${scope} pre{border-radius:0;background:#f5f5f5;padding:10px;white-space:pre-wrap}
${scope} hr{border:0;border-top:1px solid #999;margin:12pt 0}
${scope} .preserved-block{margin:8pt 0;padding:8pt;border:1px dashed #999;border-radius:0;background:#f7f7f7;color:#444;white-space:pre-wrap;font-size:${DEFAULT_FONT_SIZE}pt}
${scope} .object-label{display:block;color:#777;font-size:9px;margin-bottom:4px}
${scope} .forhan-outline-container{position:relative}
${scope} .forhan-outline-ready [data-forhan-context-source]{-webkit-text-fill-color:transparent!important;-webkit-text-stroke-width:0!important;text-shadow:none!important}
${scope} .forhan-outline-ready [data-forhan-context-source]::selection{-webkit-text-fill-color:transparent!important;text-shadow:none!important}
${scope}.forhan-outline-composing .forhan-outline-ready [data-forhan-context-source]{-webkit-text-fill-color:currentColor!important}
${scope} [data-forhan-context-direction="rtl"]::before,${scope} [data-forhan-context-direction="rtl"]::after{content:"\\200f";font-size:0}
${scope} [data-forhan-context-direction="ltr"]::before,${scope} [data-forhan-context-direction="ltr"]::after{content:"\\200e";font-size:0}
${scope}.forhan-outline-composing forhan-context-source,${scope}.forhan-outline-composing forhan-context-box{display:inline!important;width:auto!important;transform:none!important;white-space:inherit!important}
${scope}.forhan-outline-composing [data-forhan-context-cell]{display:inline!important;position:static!important;left:auto!important}
${scope} .forhan-outline-ready [data-forhan-width-ratio]{-webkit-text-fill-color:transparent!important;-webkit-text-stroke-width:0!important;text-shadow:none!important}
${scope}.forhan-outline-composing .forhan-outline-ready [data-forhan-width-ratio]{-webkit-text-fill-color:currentColor!important}
${scope} .forhan-outline-ready [data-forhan-outline]:not([data-forhan-outline="0"]):not([data-forhan-outline="7"]),${scope} .forhan-outline-ready[data-forhan-outline]:not([data-forhan-outline="0"]):not([data-forhan-outline="7"]){-webkit-text-stroke-width:0!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}
${scope} .forhan-outline-ready [data-forhan-outline]:not([data-forhan-outline="0"]):not([data-forhan-outline="7"])::selection{-webkit-text-fill-color:transparent;text-shadow:none}
${scope}.forhan-outline-composing .forhan-outline-ready [data-forhan-outline]:not([data-forhan-outline="0"]):not([data-forhan-outline="7"]){-webkit-text-stroke-width:1px!important}
${scope}.forhan-outline-composing .forhan-outline-ready [data-forhan-outline="3"]{-webkit-text-stroke-width:2px!important}
${scope}.forhan-outline-composing svg[data-forhan-outline-drawing]{visibility:hidden}
@media print{${scope} hr.page-break{break-after:page;height:0;border:0;margin:0}${scope} hr.page-break::after{display:none}${scope} tr{break-inside:avoid}}
`;
  for (let level = 1; level <= 6; level++) {
    css += `${scope} h${level}{font-size:${defaultFontSize(level)}pt}\n`;
  }
  return css;
}

/**
 * Build physical print-page geometry for every standalone document output.
 *
 * Reserved header and footer areas contribute to effective body margins, just
 * as they do in the editing canvas. Callers validate page dimensions first.
 * @param {PageSettings} page - Validated paper dimensions and margins in millimetres.
 * @returns {string} One CSS page rule with physical dimensions and effective margins.
 * @example
 * const css = documentPageStyles(page);
 * // A 20mm top margin plus a 15mm header leaves 35mm above the text.
 */
export function documentPageStyles(page: PageSettings): string {
  return `@page{size:${page.width}mm ${page.height}mm;margin:${page.marginTop + (page.header ?? 0)}mm ${page.marginRight}mm ${page.marginBottom + (page.footer ?? 0)}mm ${page.marginLeft}mm}`;
}
