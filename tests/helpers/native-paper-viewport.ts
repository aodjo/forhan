import {expect,type Page} from '@playwright/test';
import type {JSONContent} from '@tiptap/core';
import type {PageSettings} from '../../src/types.ts';
import {nativePaperPixels,type NativePaperPixels} from './native-paper-pixels.ts';

/** A literal original frame retains independently observed physical paper and source-color coordinates. */
export interface NativePaperViewportFrame extends NativePaperPixels {
  zoom:number;
  captureSha256:string;
  bottomObserved:boolean;
}
/** One original document retains its authored source independently from native viewport expectations. */
export interface NativePaperViewportGroup {
  id:string;
  sourceSha256:string;
  font:number;
  relativeSize:number;
  page:PageSettings;
  doc:JSONContent;
  sourceRows:string[];
  frames:NativePaperViewportFrame[];
}

/**
 * Verify actual paper pixels against an independently captured original native frame.
 *
 * Every retry observes a new complete screenshot rather than renderer metadata.
 * All observable native paper edges retain exact original pixel coordinates.
 * The original capture's explicitly unpainted black continuation strip cannot
 * establish a lower edge, while its other visible edges remain strict.
 * @async
 * @param {Page} page - Actual public renderer or selected native application window.
 * @param {NativePaperViewportFrame} frame - Literal independently decoded original frame observations.
 * @param {boolean} [shades=false] - Whether independently observed source shade starts and vertical edges must also agree.
 * @returns {Promise<{png:Buffer;pixels:NativePaperPixels}>} Actual complete screenshot bytes and verified physical observations.
 * @throws {Error} If actual paper placement or requested original source-color edges disagree after rendering settles.
 * @example
 * await verifyNativePaperFrame(page,frame); // A fixed top margin cannot replace original centered paper.
 */
export async function verifyNativePaperFrame(page:Page,frame:NativePaperViewportFrame,shades=false):Promise<{png:Buffer;pixels:NativePaperPixels}>{
  let png:Buffer|undefined,pixels:NativePaperPixels|undefined;
  await expect(
    /**
     * Read a fresh actual frame after dependent native layout updates settle.
     *
     * Expected values stay literal original observations on every attempt.
     * @async
     * @returns {Promise<void>} Resolves only after every observable physical paper edge matches the original frame.
     * @throws {Error} If the actual completed screenshot disagrees with an original observed edge.
     * @example
     * // A matching page-count attribute cannot hide paper displaced by forty-eight pixels.
     */
    async()=>{
      png=await page.screenshot();pixels=await page.evaluate(nativePaperPixels,png.toString('base64'));
      expect(pixels.width).toBe(frame.width);expect(pixels.height).toBe(frame.height);expect(pixels.papers.length).toBe(frame.papers.length);
      for(let index=0;index<frame.papers.length;index++){
        /** Native black unpainted capture rows do not substitute for an observed lower paper edge. */
        const actual=pixels.papers[index],original=frame.papers[index];
        expect(actual.left).toBe(original.left);expect(actual.right).toBe(original.right);expect(actual.top).toBe(original.top);
        if(!frame.bottomObserved&&original.bottom+1===frame.unpaintedBottom?.top)expect(actual.bottom).toBeGreaterThanOrEqual(original.bottom);
        else expect(actual.bottom).toBe(original.bottom);
      }
      if(shades){
        expect(pixels.shades.length).toBe(frame.shades.length);
        for(let index=0;index<frame.shades.length;index++){
          /** Font advance and foreground antialiasing remain separate from native source-paint vertical placement. */
          const actual=pixels.shades[index],original=frame.shades[index];
          expect(actual.left).toBe(original.left);expect(actual.top).toBe(original.top);expect(actual.bottom).toBe(original.bottom);
        }
      }
    }).toPass({timeout:5000,intervals:[16,32,64,100]});
  return{png:png!,pixels:pixels!};
}

/**
 * Read the current source caret as an authored text offset through native wrappers.
 *
 * A detached source prefix excludes auxiliary drawings and noneditable widgets.
 * Hard breaks add no authored characters to this text-only offset, so known
 * source strings establish expectations independently from editor model APIs.
 * @param {HTMLElement} root - Actual live original editable content root.
 * @returns {number} Authored source text characters before the real collapsed caret.
 * @throws {Error} If the actual DOM selection does not belong to the original editor.
 * @example
 * await page.locator('.tiptap').evaluate(nativeSourceCaretOffset); // Resizing cannot turn a four-character column into line end.
 */
export function nativeSourceCaretOffset(root:HTMLElement):number{
  /** Only the actual browser selection supplies this observed source endpoint. */
  const selection=root.ownerDocument.getSelection();
  if(!selection?.focusNode||!root.contains(selection.focusNode))throw new Error('The actual source caret is outside its original editor.');
  /** A detached prefix never changes the live source or native composition DOM. */
  const range=root.ownerDocument.createRange();range.setStart(root,0);range.setEnd(selection.focusNode,selection.focusOffset);
  /** Owned drawing copies cannot count as authored source text. */
  const fragment=range.cloneContents();
  for(/** Only noneditable or auxiliary drawing nodes are excluded from this detached observation. */const extra of fragment.querySelectorAll('svg,[contenteditable="false"]'))extra.remove();
  return fragment.textContent?.length??0;
}
