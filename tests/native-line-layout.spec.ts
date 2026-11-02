import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * Import an independently authored three-line paragraph at a requested interval.
 *
 * Hard breaks remain distinct source nodes even when their native interval is
 * zero. Actual text marks carry their original point heights.
 * @async
 * @param {Page} page - Owned browser renderer.
 * @param {string} spacing - Original native interval.
 * @param {number[]} [sizes=[16,16,16]] - Original point size for each hard line.
 * @returns {Promise<void>} Resolves once real drawing geometry has been applied.
 * @example
 * await loadLines(page, '0pt', [20,10,20]);
 */
async function loadLines(
  page: Page,
  spacing: string,
  sizes: number[] = [16, 16, 16],
): Promise<void> {
  /** Source model contains no measured geometry attributes or wrapper marks. */
  const content: object[] = [];
  for (/** Hard-line source sizes are independent of their paragraph's default font. */ const [
    index,
    size,
  ] of sizes.entries()) {
    if (index) content.push({ type: "hardBreak" });
    content.push({
      type: "text",
      text: String.fromCharCode(65 + index),
      marks: [{ type: "textStyle", attrs: { fontSize: `${size}pt` } }],
    });
  }
  await page.locator("#file-input").setInputFiles({
    name: "native-lines.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        application: "forhan",
        version: 1,
        title: "Native lines",
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { lineHeight: spacing, textAlign: "left" },
              content,
            },
          ],
        },
      }),
    ),
  });
  await expect(
    page.locator(".tiptap p[data-forhan-layout-height]"),
  ).toHaveCount(1);
  await expect(page.locator(".tiptap [data-forhan-line-shift]")).toHaveCount(3);
}

/**
 * Read actual visible glyph rectangles and physical paragraph progress.
 *
 * Drawing-only wrappers can be nested with original character marks. Text
 * rectangles are measured directly rather than inferred from their CSS shift.
 * @returns {{top:number;height:number;glyphs:number[];scale:number}} Actual native drawing geometry.
 * @example
 * const geometry = await page.evaluate(lineGeometry);
 */
function lineGeometry(): {
  top: number;
  height: number;
  glyphs: number[];
  scale: number;
} {
  /** The native reference capture uses the same actual paper zoom. */
  const paragraph = document.querySelector<HTMLElement>(".tiptap p")!,
    rect = paragraph.getBoundingClientRect(),
    walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT),
    glyphs: number[] = [],
    scale = Number(getComputedStyle(document.querySelector("#paper")!).zoom);
  while (walker.nextNode()) {
    /** Actual source selection rectangles retain character-specific font-box metrics. */
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    glyphs.push(range.getBoundingClientRect().top);
  }
  return { top: rect.top, height: rect.height, glyphs, scale };
}

/**
 * Verify interval-independent first-line placement and intentional native overlap.
 *
 * The native oracle keeps the first glyph at the same vertical position for
 * percent, fixed-point and fixed-zero modes. Subsequent hard lines must follow
 * their actual interval instead of gaining browser parent-strut height.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after actual geometry comparisons.
 * @throws {Error} If first-line placement or native progress changes unexpectedly.
 * @example
 * // 0pt means three coincident line positions, not three four-pixel steps.
 */
async function verifyLeading({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  /** The baseline source is one of the independently captured native modes. */
  const first: number[] = [];
  for (/** Actual source modes cover both large leading and zero overlap. */ const spacing of [
    "1",
    "1.6",
    "2",
    "18.25pt",
    "30pt",
    "0pt",
  ]) {
    await loadLines(page, spacing);
    /** Actual glyph position is compared independently of declared paragraph height. */
    const geometry = await page.evaluate(lineGeometry);
    first.push(geometry.glyphs[0] - geometry.top);
    if (spacing === "0pt") {
      expect(geometry.height).toBe(0);
      expect(
        Math.max(...geometry.glyphs) - Math.min(...geometry.glyphs),
      ).toBeLessThan(0.03);
    } else {
      /** Native physical interval in unzoomed pixels, independently calculated from the test source. */
      const interval = spacing.endsWith("pt")
        ? (parseFloat(spacing) * 4) / 3
        : ((16 * 4) / 3) * Number(spacing);
      expect(
        (geometry.glyphs[1] - geometry.glyphs[0]) / geometry.scale,
      ).toBeCloseTo(interval, 1);
      expect(geometry.height / geometry.scale).toBeCloseTo(interval * 3, 1);
    }
  }
  /** Two independently quantized CSS positions can differ by less than 0.05 screen pixels. */
  const screenTolerance = 0.05;
  expect(Math.max(...first) - Math.min(...first)).toBeLessThan(screenTolerance);
}
test(
  "native first-line leading and zero overlap follow the installed reference",
  verifyLeading,
);

/**
 * Verify mixed hard lines use each actual line's font height for progress.
 *
 * A smaller second line must not inherit the previous line's maximum font size.
 * Rendering corrections must also converge without continuously rewriting DOM.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after measured flow and stability assertions.
 * @throws {Error} If native mixed-line flow or convergence fails.
 * @example
 * // 20/10/20pt at 160 percent advances by 32pt, then 16pt.
 */
async function verifyMixedLines({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadLines(page, "1.6", [20, 10, 20]);
  /** Native sum is 50pt of text times 160 percent, converted to actual screen pixels. */
  const actual = await page.evaluate(lineGeometry);
  expect(actual.height / actual.scale).toBeCloseTo((50 * 1.6 * 4) / 3, 1);
  /**
   * Count only changes caused after the geometry has settled.
   *
   * A repeated self-correction would keep producing new style attributes.
   * @returns {Promise<number>} Actual late mutation count over several frames.
   * @example
   * // Stable measured decorations cause no layout-only transaction loop.
   */
  async function lateMutations(): Promise<number> {
    return page.evaluate(
      /**
       * Observe real editor DOM changes after native geometry settles.
       *
       * The observer does not alter text, selection or rendering metadata.
       * @returns {Promise<number>} Mutations during eight actual rendering frames.
       * @example
       * // Stable source and width should leave native geometry untouched.
       */
      async () => {
        let changes = 0;
        /**
         * Count actual late editor mutations without changing the editor.
         *
         * Attribute and subtree records expose geometry feedback loops.
         * @param {MutationRecord[]} records - Observed actual DOM changes.
         * @returns {void} Accumulates mutation count.
         * @example
         * // No records are expected once the independent line plan converges.
         */
        function changed(records: MutationRecord[]): void {
          changes += records.length;
        }
        /** Read-only observer targets only the editor content subtree. */
        const observer = new MutationObserver(changed);
        observer.observe(document.querySelector(".tiptap")!, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        for (let index = 0; index < 8; index++)
          await new Promise<void>(
            /**
             * Wait for an actual drawing frame while observing late geometry changes.
             *
             * The frame does not schedule editor work of its own.
             * @param {()=>void} resolve - Signals the next actual animation frame.
             * @returns {void} Registers one frame completion.
             * @example
             * // Several observed frames expose a recurring correction loop.
             */
            (resolve) =>
              requestAnimationFrame(
                /**
                 * Complete one independent observed rendering frame.
                 *
                 * No editor transaction or DOM mutation is dispatched.
                 * @returns {void} Resolves the current frame wait.
                 * @example
                 * // The next frame can be observed without a timer assumption.
                 */
                () => resolve(),
              ),
          );
        observer.disconnect();
        return changes;
      },
    );
  }
  expect(await lateMutations()).toBe(0);
}
test("mixed native line flow converges without source edits", verifyMixedLines);

/**
 * Verify corrected glyphs remain editable and source/history stay free of geometry.
 *
 * A direct click targets the physically shifted final line, then one edit and
 * one undo must restore the original text. Real native-source serialization
 * must retain the authored interval and marks without drawing-only metadata.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after hit testing, undo and serialized-source checks.
 * @throws {Error} If rendering corrections leak into editing or stored source.
 * @example
 * // Clicking a corrected C line must not edit the preceding B line.
 */
async function verifySourceIsolation({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await loadLines(page, "1.6", [20, 10, 20]);
  /** Visible text node coordinates include the actual native correction. */
  const last = await page
    .locator(".tiptap [data-forhan-line-shift]")
    .last()
    .boundingBox();
  expect(last).toBeTruthy();
  await page.mouse.click(last!.x + last!.width - 1, last!.y + last!.height / 2);
  await page.keyboard.press("End");
  await page.keyboard.type("X");
  await expect(page.locator(".tiptap p")).toHaveText("ABCX");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".tiptap p")).toHaveText("ABC");
  /** Real source serialization is verified through the application's ordinary save command. */
  const pending = page.waitForEvent("download");
  await page.locator("#save-document").click();
  /** Actual downloaded model can expose any accidental DOM import or geometry marks. */
  const output = await pending,
    source = JSON.parse(await readFile((await output.path())!, "utf8")),
    paragraph = source.doc.content[0];
  expect(paragraph.attrs.lineHeight).toBe("1.6");
  expect(
    paragraph.content
      .map(
        /**
         * Read authored source sizes independently of the rendered span hierarchy.
         *
         * Hard breaks remain genuine structural source nodes without style marks.
         * @param {object} node - Serialized source node.
         * @returns {string|undefined} Original point height for a text node.
         * @example
         * // The smaller second line remains 10pt in the saved model.
         */
        (node: { marks?: { attrs?: { fontSize?: string } }[] }) =>
          node.marks?.[0]?.attrs?.fontSize,
      )
      .filter(Boolean),
  ).toEqual(["20pt", "10pt", "20pt"]);
  expect(JSON.stringify(source.doc)).not.toMatch(
    /forhan-line-shift|layout-height/,
  );
}
test(
  "native line drawing retains hit testing, undo and canonical source",
  verifySourceIsolation,
);

/**
 * Resolve a genuine pending browser caret before handling its immediate line-end key.
 *
 * Native pointer selection can reach the source DOM before selectionchange
 * updates the immutable editor state. A same-turn End event must use that
 * actual source endpoint rather than the previous model caret on line A or
 * a preceding whole-document AllSelection. Direct typing without a line-end
 * command must also retain the genuine collapsed source caret.
 * @async
 * @param {{page:Page}} context - Actual isolated public browser application.
 * @returns {Promise<void>} Resolves after source navigation and direct typing retain their genuine original caret positions.
 * @throws {Error} If pending browser selection is replaced by an older model position.
 * @example
 * // Pending selection on C followed immediately by End produces ABCX, never AXBC.
 */
async function verifyPendingLineEnd({page}:{page:Page}):Promise<void>{
  for(/** Source navigation and direct typing both yield to genuine pending endpoints after whole-document selection. */const scenario of [{wholeDocument:false,useLineEnd:true},{wholeDocument:true,useLineEnd:true},{wholeDocument:true,useLineEnd:false}]){
  await page.goto('/');await loadLines(page,'1.6',[20,10,20]);await page.locator('.tiptap').focus();
  if(scenario.wholeDocument)await page.keyboard.press('ControlOrMeta+a');
  await page.evaluate(
    /**
     * Queue a genuine source DOM endpoint and its same-turn line-end command.
     *
     * No editor state or source text is injected. The command deliberately
     * precedes the browser's asynchronous selectionchange notification.
     * @param {boolean} useLineEnd - Whether the same-turn original source edge command precedes typing.
     * @returns {void} Presents the original pending-selection ordering to the real editor handler.
     * @example
     * // Subsequent real browser text input verifies the handler's selected source position.
     */
    useLineEnd=>{
      /** The actual source C text node supplies both unchanged DOM selection endpoints. */
      const root=document.querySelector<HTMLElement>('.tiptap')!,last=root.querySelectorAll('forhan-line')[2],walker=document.createTreeWalker(last,NodeFilter.SHOW_TEXT);
      walker.nextNode();getSelection()!.setBaseAndExtent(walker.currentNode,0,walker.currentNode,0);
      if(useLineEnd)root.dispatchEvent(new KeyboardEvent('keydown',{key:'End',code:'End',bubbles:true,cancelable:true}));
    },scenario.useLineEnd);
  await page.keyboard.type('X');await expect(page.locator('.tiptap p')).toHaveText(scenario.useLineEnd?'ABCX':'ABXC');
  }
}

test('a pending native DOM selection remains authoritative for an immediate source line-end command',verifyPendingLineEnd);

/**
 * Preserve ordinary word wraps even when every native baseline coincides.
 *
 * The first word ends well before the content edge, so a right-edge-only wrap
 * heuristic would merge the two lines. Actual browser word boxes establish
 * that two logical visual lines remain present at fixed zero and normal flow.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after actual wrapped-line geometry checks.
 * @throws {Error} If an early word wrap gains extra progress or loses a line.
 * @example
 * // A long second word wraps before the preceding short line fills its width.
 */
async function verifyEarlyWordWrap({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  await page.addStyleTag({ content: ".tiptap p{max-width:80px}" });
  for (/** Distinct source modes must retain the same physical word wrapping. */ const spacing of [
    "0pt",
    "1.6",
  ]) {
    await page.locator("#file-input").setInputFiles({
      name: "wrapped.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          application: "forhan",
          version: 1,
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { lineHeight: spacing, textAlign: "left" },
                content: [{ type: "text", text: "AB CCCCCCCC" }],
              },
            ],
          },
        }),
      ),
    });
    await expect(
      page.locator(".tiptap p[data-forhan-layout-height]"),
    ).toBeAttached();
    /** Native normal progress is exactly two 10pt lines at 160 percent. */
    const geometry = await page.evaluate(lineGeometry);
    expect(geometry.height / geometry.scale).toBeCloseTo(
      spacing === "0pt" ? 0 : (20 * 1.6 * 4) / 3,
      1,
    );
    await expect(page.locator(".tiptap p")).toHaveText("AB CCCCCCCC");
  }
}
test(
  "native zero spacing retains word wraps before the right content edge",
  verifyEarlyWordWrap,
);

/**
 * Retain native original line height when language-relative glyph height changes.
 *
 * Actual installed-native saved caches keep 1600-unit text height, 1360-unit
 * baseline and 2560-unit line progress at 50, 80 and 120 percent glyph sizes.
 * The real renderer must preserve that progress rather than scale the lines too.
 * @async
 * @param {{page:Page}} context - Owned browser test context.
 * @returns {Promise<void>} Resolves after actual physical line-progress assertions.
 * @throws {Error} If relative glyph size changes original paragraph line metrics.
 * @example
 * // Smaller Latin glyphs share the same base-height line grid as larger glyphs.
 */
async function verifyRelativeLineHeight({
  page,
}: {
  page: Page;
}): Promise<void> {
  await page.goto("/");
  for (/** Native cache observations cover both smaller and larger glyph heights. */ const relative of [
    50, 80, 120,
  ]) {
    /** Explicit native arrays retain original 16pt base separately from displayed glyph size. */
    const metrics = {
        ratio: Array(7).fill(100),
        spacing: Array(7).fill(0),
        relativeSize: Array(7).fill(relative),
        offset: Array(7).fill(0),
      },
      content: object[] = [];
    for (let index = 0; index < 3; index++) {
      if (index) content.push({ type: "hardBreak" });
      content.push({
        type: "text",
        text: String.fromCharCode(65 + index),
        marks: [
          {
            type: "textStyle",
            attrs: { fontSize: "16pt", nativeCharacterMetrics: metrics },
          },
        ],
      });
    }
    await page
      .locator("#file-input")
      .setInputFiles({
        name: `relative-${relative}.forhan`,
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            application: "forhan",
            version: 1,
            doc: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  attrs: { lineHeight: "1.6", textAlign: "left" },
                  content,
                },
              ],
            },
          }),
        ),
      });
    await expect(page.locator(".tiptap [data-forhan-line-shift]")).toHaveCount(
      3,
    );
    /** Actual selection rectangles establish physical line advance independently of CSS labels. */
    const actual = await page.evaluate(lineGeometry);
    expect(actual.height / actual.scale).toBeCloseTo((3 * 25.6 * 4) / 3, 1);
    expect((actual.glyphs[1] - actual.glyphs[0]) / actual.scale).toBeCloseTo(
      (25.6 * 4) / 3,
      1,
    );
  }
}
test(
  "native line caches retain base height independently of relative glyph sizes",
  verifyRelativeLineHeight,
);

/**
 * Read native Hebrew source baselines independently of auxiliary glyph drawing.
 *
 * Browser source ranges include real font ascent and accumulated paper zoom.
 * The inaccessible drawing text is excluded so it cannot duplicate a line or
 * make an incorrect source selection rectangle appear correct.
 * @param {HTMLElement} paragraph - Actual rendered source paragraph.
 * @returns {{height:number;baselines:number[]}} Paragraph height and source baselines in unzoomed CSS pixels.
 * @example
 * const geometry=await page.locator('.tiptap p').evaluate(hebrewLineGeometry);
 */
function hebrewLineGeometry(paragraph:HTMLElement):{height:number;baselines:number[]} {
  /** Canvas and actual source DOM use the same original installed font face. */
  const context=document.createElement('canvas').getContext('2d')!,
    walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT),
    box=paragraph.getBoundingClientRect(),
    zoom=Number(getComputedStyle(document.querySelector('#paper')!).zoom),
    baselines:number[]=[];
  while(walker.nextNode()){
    if(walker.currentNode.parentElement?.closest('[contenteditable="false"]'))continue;
    /** Actual source glyph geometry is independent of any declared layout-height attribute. */
    const node=walker.currentNode as Text,
      style=getComputedStyle(node.parentElement!),
      range=document.createRange();
    context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    let offset=0;
    for(/** Each Unicode source glyph is observed independently of platform-dependent text-node segmentation. */const glyph of node.data){
      range.setStart(node,offset);offset+=glyph.length;range.setEnd(node,offset);
      baselines.push((range.getBoundingClientRect().top-box.top)/zoom+context.measureText(glyph).fontBoundingBoxAscent);
    }
  }
  return{height:box.height/zoom,baselines};
}

/**
 * Verify native Hebrew baseline flow without mistaking bidi order for wrapping.
 *
 * Mixed original heights exercise common-line correction and native zero/fixed
 * progress. Soft wraps retain browser bidi shaping while drawing-only offsets
 * converge without creating source edits or undo history.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after actual source baselines match native physical line rules.
 * @example
 * // Consecutive RTL letters share one native baseline rather than becoming separate lines.
 */
async function verifyHebrewLineFlow({page}:{page:Page}):Promise<void>{
  await page.goto('/');
  for(/** Physical native intervals retain independent font heights even at zero progress. */const spacing of ['1.6','18pt','0pt']){
    /** Native width corrections coexist with original hard breaks and independent base heights. */
    const content:object[]=[],sizes=[32,16,24],words=['אב','גד','הו'];
    for(let index=0;index<sizes.length;index++){
      if(index)content.push({type:'hardBreak'});
      content.push({type:'text',text:words[index],marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:sizes[index]+'pt',nativeCharacterMetrics:{ratio:Array(7).fill(75),spacing:Array(7).fill(20),relativeSize:Array(7).fill(100),offset:Array(7).fill(0)}}}]});
    }
    /** Unique local filenames distinguish source replacement from the preceding layout. */
    const name='hebrew-lines-'+spacing+'.forhan';
    await page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph',attrs:{textAlign:'left',lineHeight:spacing},content}]}}))});
    await expect(page.locator('#toast')).toContainText(name);
    /** Expected native baselines follow original source heights, not RTL character order. */
    const fixed=spacing==='1.6'?null:spacing==='18pt'?24:0,
      advances=sizes.map(
        /**
         * Calculate physical native line progress for an independently known source height.
         *
         * A fixed interval remains independent of the current line's glyph size.
         * @param {number} size - Original native point height for this hard line.
         * @returns {number} Expected unzoomed line advance in CSS pixels.
         * @example
         * // A 32pt line at 160 percent advances by 68.2667 CSS pixels.
         */
        size=>fixed??size*4/3*1.6),
      height=advances[0]+advances[1]+advances[2];
    await expect(
      /**
       * Await complete physical glyph placement independently from rendering metadata.
       *
       * Paragraph progress can settle before dependent inline glyph offsets.
       * Every retry retains all original baselines and the existing height bound;
       * persistent platform geometry differences cannot pass this condition.
       * @async
       * @returns {Promise<void>} Resolves only after all actual original glyph baselines and height agree.
       * @throws {Error} If source glyph count, baselines or physical height differs.
       * @example
       * // Three original intervals must retain their physical total at the actual display scale.
       */
      async()=>{
        /** Every original two-letter word must have one shared baseline, including fixed-zero overlap. */
        const actual=await page.locator('.tiptap p').evaluate(hebrewLineGeometry);
        expect(Math.abs(actual.height-height)).toBeLessThan(.05);
        expect(actual.baselines).toHaveLength(6);
        let top=0;
        for(let line=0;line<sizes.length;line++){
          for(let glyph=0;glyph<2;glyph++)expect(actual.baselines[line*2+glyph]).toBeCloseTo(top+sizes[line]*4/3*.85,1);
          top+=advances[line];
        }
        expect(actual.height).toBeCloseTo(height,1);
      },
    ).toPass({timeout:5000,intervals:[16,32,64,100]});
  }
  /** Mixed bidi words retain their authored order as actual content width changes. */
  const text='ABC אבגד הוזח 123 טיכל מנסע 한글 פצקר שתאב גדוה',
    content=[{type:'text',text,marks:[{type:'textStyle',attrs:{fontFamily:'Arial',fontSize:'32pt',nativeCharacterMetrics:{ratio:Array(7).fill(75),spacing:Array(7).fill(20),relativeSize:Array(7).fill(100),offset:Array(7).fill(0)}}}]}];
  await page.locator('#file-input').setInputFiles({name:'hebrew-soft-lines.forhan',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph',attrs:{textAlign:'left',lineHeight:'1.6'},content}]}}))});
  await expect(page.locator('#toast')).toContainText('hebrew-soft-lines.forhan');
  /** The same narrow width must reproduce its physical line count after reflow. */
  const counts:number[]=[];
  for(/** Source glyphs can move between real browser lines without extra authored paragraphs. */const width of [140,220,140]){
    await page.locator('.tiptap').evaluate(
      /**
       * Change the actual source viewport width through ordinary browser layout.
       *
       * The editor's owned resize observer schedules remeasurement; no native
       * line marker or source model value is substituted by the regression.
       * @param {HTMLElement} root - Actual live editable document root.
       * @param {number} width - Requested unzoomed viewport width in CSS pixels.
       * @returns {void} Changes only temporary test-owned viewport geometry.
       * @example
       * // Narrowing the page produces real soft wraps inside the same source paragraph.
       */
      (root,width)=>{root.style.width=width+'px';},width);
    await expect.poll(
      /**
       * Observe stable native source flow after a real browser width change.
       *
       * Every glyph baseline must lie on the independent native line interval,
       * even when consecutive source letters move left within one bidi run.
       * @async
       * @returns {Promise<boolean>} Whether height and source baselines agree with native progress.
       * @example
       * // A Hebrew word's descending x positions never create extra source lines.
       */
      async()=>{
        /** Physical source geometry supplies the line count independently of rendering metadata. */
        const actual=await page.locator('.tiptap p').evaluate(hebrewLineGeometry),
          advance=32*4/3*1.6,
          count=Math.round(actual.height/advance);
        if(count<3||Math.abs(actual.height-count*advance)>.1)return false;
        let physicalCount=0;
        for(/** Actual source rectangles must converge on native baselines after every reflow. */const baseline of actual.baselines){
          /** Independently observed physical source lines must agree with the current paragraph height. */
          const line=(baseline-32*4/3*.85)/advance;
          if(Math.abs(line-Math.round(line))>.01)return false;
          physicalCount=Math.max(physicalCount,Math.round(line)+1);
        }
        if(physicalCount!==count)return false;
        if(counts.length===1&&count>=counts[0])return false;
        if(counts.length===2&&count!==counts[0])return false;
        return true;
      }).toBe(true);
    /** Actual height counts native physical progress rather than counting source wrapper elements. */
    const actual=await page.locator('.tiptap p').evaluate(hebrewLineGeometry);
    counts.push(Math.round(actual.height/(32*4/3*1.6)));
  }
  expect(counts[0]).toBeGreaterThan(counts[1]);
  expect(counts[2]).toBe(counts[0]);
  await page.locator('#file-input').setInputFiles({name:'hebrew-soft-zero.forhan',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph',attrs:{textAlign:'left',lineHeight:'0pt'},content}]}}))});
  await expect(page.locator('#toast')).toContainText('hebrew-soft-zero.forhan');
  await expect(page.locator('.tiptap p')).toHaveAttribute('data-forhan-layout-height','0');
  await expect(
    /**
     * Await the complete physical source layout after fixed-zero document replacement.
     *
     * A zero paragraph height can precede dependent width and line decorations.
     * Every original glyph must converge on the same native baseline without
     * relaxing the existing physical tolerance or accepting missing source.
     * @async
     * @returns {Promise<void>} Resolves after actual source height and every glyph baseline agree.
     * @throws {Error} If source glyph count, physical height or any baseline differs.
     * @example
     * // The paragraph height marker alone cannot establish completed source glyph placement.
     */
    async()=>{
      /** Real editable source ranges establish complete native fixed-zero placement. */
      const zero=await page.locator('.tiptap p').evaluate(hebrewLineGeometry);
      expect(Math.abs(zero.height)).toBeLessThan(.05);
      expect(zero.baselines).toHaveLength(Array.from(text).length);
      for(/** Original editable source remains complete even when all drawn lines coincide. */const baseline of zero.baselines)expect(baseline).toBeCloseTo(32*4/3*.85,1);
    },
  ).toPass({timeout:5000,intervals:[16,32,64,100]});
  /** Source serialization must retain one original paragraph with no layout characters or drawings. */
  const pending=page.waitForEvent('download');
  await page.locator('#save-document').click();
  /** The actual serializer output supplies independent original text, not live drawing text. */
  const saved=JSON.parse((await readFile((await (await pending).path())!)).toString('utf8'));
  expect(saved.doc.content).toHaveLength(1);
  expect(saved.doc.content[0].content.map(
    /**
     * Join genuine serialized text nodes without interpreting drawing-only DOM.
     *
     * Script-specific normalization may split marks but cannot duplicate source.
     * @param {{text?:string}} node - Actual saved source inline node.
     * @returns {string} Original authored text for this source node.
     * @example
     * // The saved paragraph contains the original mixed bidi sentence exactly once.
     */
    (node:{text?:string})=>node.text||'').join('')).toBe(text);
}

test('Hebrew native line flow preserves bidi ordering through mixed heights and fixed-zero spacing',verifyHebrewLineFlow);
