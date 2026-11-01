import {
  test,
  expect,
  _electron as electron,
  type Page,
  type PlaywrightWorkerArgs,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desktopLaunchOptions } from './helpers/desktop-launch';
import {observeFallbackGlyphs,observeFallbackPlatformFonts} from './helpers/fallback-glyph-observation.ts';

/**
 * Measure actual document-content styles without depending on stylesheet text.
 *
 * The same structural probes run inside the editor, its exported HTML and the
 * authenticated print renderer's captured HTML. App chrome and selection
 * decorations are deliberately outside the measured document subtree.
 * @param {string} rootSelector - Actual document root in the current test page.
 * @returns {Record<string, Record<string, string>>} Computed styles by content selector.
 * @example
 * const styles = await page.evaluate(measureDocumentStyles, '.tiptap');
 */
function measureDocumentStyles(
  rootSelector: string,
): Record<string, Record<string, string>> {
  /** Document root containing the authored content. */
  const root = document.querySelector(rootSelector)!;
  /** Physical and typographic properties that previously diverged on output. */
  const properties = [
    "font-family",
    "font-size",
    "font-weight",
    "font-synthesis",
    "font-kerning",
    "word-spacing",
    "line-height",
    "height",
    "text-align",
    "text-align-last",
    "text-justify",
    "text-indent",
    "margin-top",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "border-top-width",
    "border-top-color",
    "background-color",
    "color",
    "box-sizing",
    "display",
    "letter-spacing",
    "position",
    "top",
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-color",
    "text-shadow",
    "-webkit-text-fill-color",
    "-webkit-text-stroke-width",
    "fill",
    "stroke",
    "stroke-dasharray",
    "background-image",
    "background-size",
    "background-position",
    "background-repeat",
  ];
  /** Serializable computed values grouped by actual content element. */
  const result: Record<string, Record<string, string>> = {};
  for (/** Structural element shared by all document outputs. */ const selector of [
    "p",
    "h3",
    "ul",
    "li",
    "blockquote",
    "a",
    "table",
    "th",
    "td",
    "code",
    "pre",
    "hr",
    "[data-forhan-character-metrics]",
    '[data-forhan-character-language="0"]',
    '[data-forhan-character-language="1"]',
    '[data-forhan-native-line-height]',
    '[data-forhan-paragraph-alignment="distribute"]',
    '[data-forhan-paragraph-alignment="split"]',
    '[data-forhan-line-shift]',
    '[data-forhan-layout-height]',
    '[data-forhan-space-delta]',
    '[data-forhan-decoration="underline"]',
    '[data-forhan-decoration="strike"]',
    '[data-forhan-decoration-drawing]',
    '[data-forhan-shadow]',
    '[data-forhan-outline]',
    'svg[data-forhan-outline-drawing] text',
    '[data-forhan-emphasis]',
    'svg[data-forhan-outline-drawing] g[data-emphasis-kind]',
  ]) {
    /** First occurrence of the matching authored node. */
    const element = root.querySelector(selector);
    if (!element) continue;
    /** Browser-resolved physical styles, including inherited typography. */
    const style = getComputedStyle(element);
    result[selector] = {};
    for (/** Individual property compared independently of generated CSS strings. */ const property of properties)
      result[selector][property] = style.getPropertyValue(property);
  }
  return result;
}

/**
 * Capture the actual isolated print HTML without replacing the PDF engine.
 *
 * The listener belongs exclusively to the test-owned main process. Only loaded
 * data documents are observed; the editor and PDF viewer remain untouched.
 * @param {typeof import('electron')} runtime - Owned Electron module.
 * @returns {void} Registers a read-only print-document observation.
 * @example
 * await desktop.evaluate(observePrintHtml);
 */
function observePrintHtml({ app }: typeof import("electron")): void {
  /** Test-owned main-process storage used after the temporary window closes. */
  const state = globalThis as unknown as { forhanLayoutHtml: string };
  state.forhanLayoutHtml = "";
  app.on(
    "browser-window-created",
    /**
     * Observe loading in a newly owned window without changing its preferences.
     *
     * The hidden renderer still loads under its production resource policy and
     * uses its real native printToPDF method.
     * @param {Electron.Event} _event - Owned creation notification.
     * @param {Electron.BrowserWindow} created - Newly created application window.
     * @returns {void} Attaches a single read-only load observation.
     * @example
     * // A generated PDF viewer does not match the data-document filter.
     */
    (_event, created) => {
      created.webContents.once(
        "did-finish-load",
        /**
         * Retain the fully loaded print document for computed-style comparison.
         *
         * Does not execute code inside the sandboxed print renderer or intercept
         * its native PDF generation and lifecycle.
         * @returns {void} Stores only an owned printable data document.
         * @example
         * // The stored markup is the same document submitted to Chromium PDF.
         */
        () => {
          /** Completed document URL after production loading succeeds. */
          const url = created.webContents.getURL();
          if (url.startsWith("data:text/html;charset=utf-8,"))
            state.forhanLayoutHtml = decodeURIComponent(
              url.slice(url.indexOf(",") + 1),
            );
        },
      );
    },
  );
}

/**
 * Verify HTML and real native PDF output retain the editor's paragraph layout.
 *
 * Rich document elements are compared through computed styles after actual HTML
 * export and native preview. Forty ordinary paragraphs must fit on one A4 page;
 * accidental default after-spacing used to force a second page. A plain rule
 * must also remain a rule rather than silently becoming a page break.
 * Cold native PDF generation has its own readiness budget before completed
 * output bytes and physical pagination are checked.
 * @async
 * @param {PlaywrightWorkerArgs} context - Browser bindings for independent style probes.
 * @returns {Promise<void>} Resolves after export, style and PDF pagination assertions.
 * @throws {Error} If output adds spacing, changes content styles or adds a page.
 * @example
 * // Editor paragraph margins of zero stay zero in HTML and the printed PDF.
 */
async function verifySharedDocumentLayout({
  browser,
}: PlaywrightWorkerArgs): Promise<void> {
  test.setTimeout(90000);
  /** Completed standalone bytes and native window state remain available after a CI failure. */
  const diagnosticRoot=test.info().outputPath('layout-diagnostics');await mkdir(diagnosticRoot,{recursive:true});
  /** Isolated application profile, removed after the owned process exits. */
  const profile = await mkdtemp(path.join(tmpdir(), "forhan-layout-test-"));
  /** Owned desktop application with the real sandboxed bridge and PDF renderer. */
  const desktop = await electron.launch(desktopLaunchOptions(profile));
  /** Independent page used to inspect the emitted standalone document styles. */
  const probe = await browser.newPage();
  try {
    /** Application editor page, distinct from the temporary native print renderer. */
    const editor = await desktop.firstWindow();
    await editor.waitForSelector(".tiptap");
    /** Rich fixture exercises defaults and explicit paragraph overrides together. */
    const payload = {
      application: "forhan",
      version: 1,
      title: "공통 문서 서식",
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: {
              textIndent: "-18.25pt",
              marginLeft: "12.25pt",
              marginTop: "3.25pt",
              marginBottom: "6.5pt",
              lineHeight: "18.25pt",
            },
            content: [
              {
                type: "text",
                text: "문단 여백을 보존합니다.",
                marks: [
                  {type:"underline",attrs:{nativePosition:"TOP",nativePattern:12,nativeColor:"#123456"}},
                  {type:"strike",attrs:{nativePattern:10,nativeColor:"#654321"}},
                  {
                    type: "textStyle",
                    attrs: {
                      fontSize: "10pt",
                      color: "#3a3c84",
                      nativeShadowType: "CONTINUOUS",
                      nativeShadowOffsetX: -10,
                      nativeShadowOffsetY: 20,
                      nativeShadowColor: "#775533",
                      nativeOutlineType: 5,
                      nativeEmphasisType: 12,
                      backgroundColor: "#faf3db",
                      nativeCharacterFonts: ["함초롬바탕", "Arial", "바탕", "돋움", "굴림", "맑은 고딕", "Times New Roman"],
                      nativeCharacterMetrics: {
                        ratio: [100, 100, 100, 100, 100, 100, 100],
                        spacing: [20, 20, 20, 20, 20, 20, 20],
                        relativeSize: [80, 80, 80, 80, 80, 80, 80],
                        offset: [30, 30, 30, 30, 30, 30, 30],
                      },
                    },
                  },
                ],
              },
            ],
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "세 번째 제목" }],
          },
          {
            type: 'paragraph',
            attrs: {textAlign: 'distribute'},
            content: [{type: 'text', text: 'ABC 가나다 배분'}],
          },
          {
            type: 'paragraph',
            attrs: {textAlign: 'split'},
            content: [{type: 'text', text: 'ABC 가나다 나눔'}],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{
                  type: 'paragraph',
                  attrs: {
                    marginLeft: '1.5em',
                    textIndent: '-0.5em',
                    lineHeight: '1.5em',
                    marginTop: '0.5em',
                    marginBottom: '1.5em',
                  },
                  content: [{
                    type: 'text',
                    text: '네이티브 글자 단위의 인쇄 간격',
                    marks: [{type: 'textStyle', attrs: {fontSize: '20pt'}}],
                  }],
                }],
              },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "목록 문단" }],
                  },
                ],
              },
            ],
          },
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "인용 문단" }],
              },
            ],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "문서 링크",
                marks: [
                  { type: "link", attrs: { href: "https://example.com/" } },
                ],
              },
              { type: "text", text: " 코드", marks: [{ type: "code" }] },
            ],
          },
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableHeader",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "제목 셀" }],
                      },
                    ],
                  },
                  {
                    type: "tableCell",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "본문 셀" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { type: "codeBlock", content: [{ type: "text", text: "코드 블록" }] },
          { type: "horizontalRule" },
          {
            type: "paragraph",
            content: [{ type: "text", text: "구분선 다음 문단" }],
          },
        ],
      },
    };
    await editor.locator("#file-input").setInputFiles({
      name: "서식.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(payload)),
    });
    await editor.locator("#zoom-reset").click();
    await editor.locator('[name="native-zoom-mode"][value="custom"]').check();await editor.locator("#native-zoom-value").fill("100");
    await editor.locator('[data-modal-value="apply"]').click();
    await expect(editor.locator('.tiptap [data-forhan-line-shift]').first()).toBeAttached();
    await editor.evaluate(
      /**
       * Wait for native remeasurement after the actual zoom change.
       *
       * The marker may still belong to the preceding 125 percent frame. Font
       * readiness and two real frames allow the owned zoom observer to settle.
       * @returns {Promise<void>} Resolves after the physical 100 percent layout.
       * @example
       * // Style comparisons inspect the current view rather than stale corrections.
       */
      async () => {
        await document.fonts.ready;
        await new Promise<void>(
          /**
           * Schedule completion after the next two actual drawing opportunities.
           *
           * This observes the layout lifecycle without editing any source state.
           * @param {()=>void} resolve - Completes the physical-layout wait.
           * @returns {void} Registers the first actual drawing frame.
           * @example
           * // The native observer can run before the measured comparison.
           */
          (resolve) => requestAnimationFrame(
            /**
             * Observe the frame in which native zoom remeasurement is applied.
             *
             * The second callback runs after that actual DOM update.
             * @returns {void} Schedules the final physical-layout observation.
             * @example
             * // No fixed-duration sleep or expected shift value is used.
             */
            () => { requestAnimationFrame(
              /**
               * Finish waiting for the settled drawing geometry.
               *
               * Native decorations already reflect the requested zoom.
               * @returns {void} Resolves the independent layout wait.
               * @example
               * // Computed styles can now be compared with standalone output.
               */
              () => resolve(),
            ); },
          ),
        );
      },
    );
    /** Actual settled editing styles used as the source of output fidelity assertions. */
    const editing = await editor.evaluate(measureDocumentStyles, ".tiptap");
    /** Read-only source observations distinguish actual font fallback from output-parity assertions. */
    const editorGlyphs=await editor.evaluate(observeFallbackGlyphs,'.tiptap p'),editorFonts=await observeFallbackPlatformFonts(editor,'.tiptap p');
    /** The short mixed-script source fits one authored 18.25pt line even when its primary Korean face is unavailable. */
    const firstParagraphHeight=Number.parseFloat(editing.p.height);
    expect(Math.abs(firstParagraphHeight-18.25*96/72)).toBeLessThanOrEqual(1/64);
    expect(Object.keys(editing)).toHaveLength(29);
    expect(editing['[data-forhan-paragraph-alignment="distribute"]']['text-justify']).toBe('inter-character');
    expect(editing['[data-forhan-paragraph-alignment="split"]']['text-justify']).toBe('inter-word');
    expect(editing['[data-forhan-native-line-height]']['line-height']).toBe('10px');
    /** Native HTML output remains inside the isolated test profile. */
    const htmlFile = path.join(profile, "공통 문서 서식.html");
    await desktop.evaluate(
      /**
       * Redirect only the owned application's save chooser to a temporary file.
       *
       * The production serializer, authenticated bridge and atomic write remain
       * active; no operating-system file dialog or real user path is touched.
       * @param {typeof import('electron')} runtime - Test-owned Electron module.
       * @param {string} target - Temporary standalone HTML output path.
       * @returns {void} Installs the owned save-dialog result.
       * @example
       * // The HTML exporter writes its real bytes into the temporary profile.
       */
      ({ dialog }, target: string) => {
        dialog.showSaveDialog =
          /**
           * Choose the isolated native HTML destination for this export.
           *
           * Replaces the interactive chooser while keeping native file writing.
           * @returns {Promise<{canceled:boolean;filePath:string}>} Owned native destination.
           * @example
           * // No user-facing file dialog is opened by this regression.
           */
          async () => ({ canceled: false, filePath: target });
      },
      htmlFile,
    );
    await editor.locator("#export-menu-toggle").click();
    await editor.locator('[data-export="html"]').click();
    await expect(editor.locator("#toast")).toContainText("html 저장 완료");
    /** Exported bytes, including their production content stylesheet. */
    const html = await readFile(htmlFile, "utf8");
    await writeFile(path.join(diagnosticRoot,'standalone.html'),html);
    await probe.setContent(html);
    /** Real output styles remain an independent observation rather than an expected-value injection. */
    const standalone=await probe.evaluate(measureDocumentStyles,"body");
    /** Both source documents retain independently observed platform faces and glyph baselines. */
    const standaloneGlyphs=await probe.evaluate(observeFallbackGlyphs,'body p'),standaloneFonts=await observeFallbackPlatformFonts(probe,'body p');
    await writeFile(path.join(diagnosticRoot,'fallback-source.json'),JSON.stringify({editorGlyphs,editorFonts,standaloneGlyphs,standaloneFonts},null,2));
    await writeFile(path.join(diagnosticRoot,'content-styles.json'),JSON.stringify({editing,standalone},null,2));
    expect(standalone).toEqual(editing);
    await desktop.evaluate(observePrintHtml);
    /** Native generation time begins before the public preview command is invoked. */
    const previewRequestedAt=Date.now();
    await editor.locator('[data-native-tab="file"]').click();
    await editor
      .locator('#native-file-menu [data-native-action="preview"]')
      .click();
    /**
     * Read the actually loaded printable HTML after preview generation begins.
     *
     * Returns a serializable observation without altering the production window.
     * @returns {Promise<string>} Captured HTML once the real print renderer loads.
     * @example
     * // Polling waits on the owned load event rather than a fixed delay.
     */
    async function capturedHtml(): Promise<string> {
      return desktop.evaluate(
        /**
         * Read the test-owned document load observation from the main process.
         *
         * The application renderer has no access to this main-process storage.
         * @returns {string} Loaded production print markup, or an empty pending value.
         * @example
         * // An empty value means the hidden document has not completed loading.
         */
        () =>
          (globalThis as unknown as { forhanLayoutHtml: string })
            .forhanLayoutHtml,
      );
    }
    await expect.poll(capturedHtml).toContain("data-forhan-character-fonts");
    await probe.setContent(await capturedHtml());
    expect(await probe.evaluate(measureDocumentStyles, "body")).toEqual(
      editing,
    );
    /**
     * Locate a live generated PDF viewer among the owned application windows.
     *
     * Hidden printable HTML cannot satisfy the private generated PDF suffix.
     * @returns {Page | undefined} The live PDF viewer after generation finishes.
     * @example
     * // The source editor remains a separate window.
     */
    function currentPreview(): Page | undefined {
      for (/** Owned live page inspected for the generated document URL. */ const page of desktop.windows())
        if (page.url().endsWith(".forhan-preview.pdf")) return page;
      return undefined;
    }
    try{await expect.poll(currentPreview,{timeout:30000}).toBeTruthy();}
    finally{
      /** Native windows distinguish pending generation from an untracked PDF browser target. */
      const nativeWindows=await desktop.evaluate(
        /**
         * Observe actual owned native windows without changing PDF generation.
         *
         * Inline print source URLs are summarized to avoid copying complete documents
         * into window metadata. Actual PDF paths and loading states remain visible.
         * @param {typeof import('electron')} runtime - Selected native application runtime.
         * @returns {Array<{id:number;url:string;visible:boolean;loading:boolean}>} Actual native window state.
         * @example
         * // A generated PDF can be distinguished from a still-loading hidden renderer.
         */
        ({BrowserWindow})=>{
          /** Every entry belongs to this isolated regression application's main process. */
          const records=[];
          for(/** Destroyed windows cannot provide a live generated viewer. */const window of BrowserWindow.getAllWindows()){
            if(window.isDestroyed())continue;
            /** Full data-document markup is retained separately from concise native lifecycle metadata. */
            const url=window.webContents.getURL();
            records.push({id:window.id,url:url.startsWith('data:')?'data:text/html':url,visible:window.isVisible(),loading:window.webContents.isLoading()});
          }
          return records;
        });
      /** Playwright targets are compared with native ownership rather than assumed identical across platforms. */
      const pageUrls=[];for(/** Each observed target belongs to the selected native application. */const page of desktop.windows()){
        /** Large inline print documents remain in their dedicated artifact instead of window metadata. */
        const url=page.url();pageUrls.push(url.startsWith('data:')?'data:text/html':url);
      }
      await writeFile(path.join(diagnosticRoot,'native-preview-windows.json'),JSON.stringify({elapsedMilliseconds:Date.now()-previewRequestedAt,nativeWindows,pageUrls},null,2));
    }
    /** First generated PDF must not gain a page merely from an ordinary rule. */
    const richPreview = currentPreview()!;
    /** Real Chromium PDF bytes from the private generated snapshot. */
    const richPdf = await readFile(fileURLToPath(richPreview.url()));
    expect(richPdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(
      1,
    );
    await richPreview.close();
    /** Forty single-line paragraphs fit within A4's authored 232mm text height. */
    const content = [];
    for (let line = 1; line <= 40; line++)
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: `일반 문단 ${line}` }],
      });
    await editor.locator("#file-input").setInputFiles({
      name: "마흔 문단.forhan",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          application: "forhan",
          version: 1,
          title: "마흔 문단",
          doc: { type: "doc", content },
        }),
      ),
    });
    await editor.locator('[data-native-tab="file"]').click();
    await editor
      .locator('#native-file-menu [data-native-action="preview"]')
      .click();
    await expect.poll(currentPreview,{timeout:30000}).toBeTruthy();
    /** The second real snapshot tests physical pagination, not stylesheet strings. */
    const paragraphsPdf = await readFile(
      fileURLToPath(currentPreview()!.url()),
    );
    expect(
      paragraphsPdf.toString("latin1").match(/\/Type\s*\/Page\b/g),
    ).toHaveLength(1);
  } finally {
    await probe.close();
    await desktop.evaluate(
      /**
       * Exit only the test-owned desktop process before deleting its profile.
       *
       * Discarding isolated test edits avoids an unsaved-close prompt in teardown.
       * @param {typeof import('electron')} runtime - Owned Electron module.
       * @returns {void} Terminates the isolated desktop application.
       * @example
       * app.exit(0);
       */
      ({ app }) => app.exit(0),
    );
    await desktop.close();
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}
test(
  "editor, HTML export and actual native PDF share document layout",
  verifySharedDocumentLayout,
);
