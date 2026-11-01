import { documentContentStyles } from "./document-styles.ts";
import {portableFontStyles} from './portable-font-styles.ts';
import {
  applyNativeParagraph,
  measureNativeParagraph,
  type NativeParagraphLayout,
} from "./native-line-layout.ts";
import type { PageSettings } from "./types.ts";
import { applyNativeSpaces, measureNativeSpaces } from "./font-space.ts";
import { applyNativeDecorations } from "./decoration-drawing.ts";
import { applyNativeOutlines } from "./outline-drawing.ts";
import { applyNativeWidths, measureNativeWidths } from "./character-width.ts";
import { applyContextualWidths, measureContextualWidths } from './contextual-width.ts';
import { refreshContextualCellLayout } from './contextual-tracking.ts';
import { applyParagraphWordBreaks } from './paragraph-word-break.ts';
import {applyParagraphMinimumSpaces} from './paragraph-space-layout.ts';
import {createNativeGridFlow,applyNativeGrid} from './native-grid-layout.ts';
import {captureNativePrintText,attachNativePrintText,type NativePrintText} from './print-text.ts';
import {installNativePrintPages} from './native-page-export.ts';

/**
 * Prepare static native drawing geometry for standalone HTML and script-free printing.
 *
 * An owned sandboxed frame measures the canonical serialized source at physical
 * paper content width. Fonts finish loading before layout. Rendering spans and
 * heights affect only this export copy; native writers and editable history
 * continue to use the unchanged document model. No export script is required.
 * Explicit physical body width avoids the iframe viewport's integer-pixel rounding.
 * The Korean document language matches the editor and completed standalone output
 * so generic fallback fonts retain the same language-dependent metrics.
 * @async
 * @param {string} html - Canonical sanitized editor serialization for one captured revision.
 * @param {PageSettings} page - Validated physical paper dimensions and margins.
 * @returns {Promise<string>} Standalone drawing markup at the requested physical width.
 * @throws {Error} If the isolated measurement document cannot be created.
 * @example
 * const printable = await prepareNativeLayout(editor.getHTML(), pageSettings);
 */
export async function prepareNativeLayout(
  html: string,
  page: PageSettings,
): Promise<string> {
  /** Only the available text width participates in line wrapping and exported geometry. */
  const width = Math.max(1, page.width - page.marginLeft - page.marginRight),
    frame = document.createElement("iframe");
  frame.sandbox.add("allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}mm;height:1px;border:0;opacity:0;pointer-events:none`;
  /** The isolated export cannot load scripts, remote styles or external images. */
  const loaded = new Promise<void>(
    /**
     * Wait for the owned static export frame to finish its initial load.
     *
     * The frame contains no executable document scripts or network resources.
     * @param {()=>void} resolve - Signals that its static layout tree is ready.
     * @returns {void} Installs the single owned completion handler.
     * @example
     * // Font readiness is awaited separately after document creation.
     */
    (resolve) => {
      /**
       * Complete the isolated static document load.
       *
       * No access to the editable source model is granted to the frame.
       * @returns {void} Resolves the owned frame readiness promise.
       * @example
       * // The sandbox continues to prohibit scripts after loading.
       */
      frame.onload = () => resolve();
    },
  );
  frame.srcdoc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:;"><style>${portableFontStyles(html)}${documentContentStyles("body")}html,body{margin:0;padding:0;width:${width}mm}</style></head><body>${html}</body></html>`;
  document.body.appendChild(frame);
  try {
    await loaded;
    /** The same-origin sandbox permits measurement while retaining script isolation. */
    const output = frame.contentDocument;
    if (!output) throw new Error("출력 문서의 줄 배치를 계산하지 못했습니다.");
    await output.fonts.ready;
    output.body.dataset.forhanLineGrid=String(page.lineGrid??0);
    output.body.style.display='flow-root';
    applyParagraphWordBreaks(output.body);
    applyNativeDecorations(output.body);
    applyNativeSpaces(measureNativeSpaces(output.body));
    applyNativeWidths(measureNativeWidths(output.body));
    applyContextualWidths(measureContextualWidths(output.body));
    refreshContextualCellLayout(output.body);
    applyParagraphMinimumSpaces(output.body);
    for (/** Embedded images must settle before neighboring native paragraphs are measured. */ const image of output.images)
      if (!image.complete)
        await image.decode().catch(
          /**
           * Preserve a broken embedded image without aborting unrelated text export.
           *
           * Unsupported image decoding keeps the browser's own fallback behavior.
           * @returns {void} Lets independent paragraph geometry continue.
           * @example
           * // A broken raster does not erase adjacent text in the exported document.
           */
          () => {},
        );
    /** Measure every source paragraph before any height change can move the next paragraph. */
    const grid=createNativeGridFlow(output.body,1),plans:NativeParagraphLayout[]=[];
    for (/** Each original paragraph keeps its authored mark boundaries and source values. */ const element of output.querySelectorAll<HTMLElement>(
      "p,h1,h2,h3,h4,h5,h6",
    )) {
      /** Geometry is shared with the live editor rather than recalculated by a print script. */
      const plan = measureNativeParagraph(element);
      if (plan) plans.push(applyNativeGrid(plan,grid,1));
    }
    /** Detached vector print layers retain exact source baselines before DOM source ranges are split. */
    const printLayers:NativePrintText[]=[];
    for(/** Screen drawing and vector print drawing share one independently measured native plan. */const plan of plans){
      /** Ordinary source is wrapped without moving any authored glyph or source position. */
      const layer=captureNativePrintText(plan);if(layer)printLayers.push(layer);
    }
    for(/** Every print coordinate is captured before a paragraph height can move another source block. */const plan of plans)applyNativeParagraph(plan);
    applyNativeOutlines(output.body);
    for(/** Auxiliary print text cannot be interpreted as source by another drawing pass. */const layer of printLayers)attachNativePrintText(layer);
    installNativePrintPages(output.body,plans,printLayers,page);
    return output.body.innerHTML;
  } finally {
    frame.remove();
  }
}
