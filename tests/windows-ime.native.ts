import { test, expect } from "@playwright/test";
import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import {createHash} from 'node:crypto';
import {nativeShadePixels,nativeShadeCoverage} from './helpers/native-shade-pixels.ts';
import { readHwp } from "../src/formats/hwp.ts";
import { readHwpx } from "../src/formats/hwpx.ts";
import { characterMetrics } from "../src/character-metrics.ts";
import { contextualSourceText } from "./helpers/contextual-width.ts";
import {
  imeSourceText,
  imeEvents,
  importImeSource,
  saveImeSource,
  chooseImeDestination,
  retainImeOutput,
  withWindowsIme,
  type WindowsImeContext,
} from "./helpers/windows-ime.ts";
import type { WindowsKey } from "./helpers/windows-keyboard.ts";
import {defaultPage} from '../src/documents.ts';
import {nativePaginationDocument} from './helpers/native-pagination.ts';

/** Installed Hangul 13.0.0.4049 independently establishes these literal two-set Korean key results. */
const ORIGINAL_KOREAN_CASES: {
  id: string;
  keys: WindowsKey[];
  expected: string;
}[] = [
  {
    id: "basic",
    keys: [0x47, 0x4b, 0x53, 0x52, 0x4d, 0x46, 0x20],
    expected: "한글 ",
  },
  {
    id: "backspace-final",
    keys: [0x52, 0x4b, 0x51, 0x54, 0x08, 0x20],
    expected: "갑 ",
  },
  {
    id: "resyllabify",
    keys: [0x52, 0x4b, 0x53, 0x4b, 0x20],
    expected: "가나 ",
  },
  {
    id: "arrow-commit",
    keys: [0x52, 0x4b, 0x53, 0x25, 0x45, 0x4b, 0x20],
    expected: "다 간",
  },
  { id: "enter-commit", keys: [0x52, 0x4b, 0x53, 0x0d], expected: "간\n" },
  {
    id: "undo-word",
    keys: [0x47, 0x4b, 0x53, 0x52, 0x4d, 0x46, 0x20, [0x11, 0x5a]],
    expected: "",
  },
];

/**
 * Verify native Korean preedit and original installed-Hangul editing results.
 *
 * Actual Win32 keys produce trusted composition starts, updates and input.
 * Independent saved source confirms every result rather than relying on an
 * inaccessible SVG copy or text inserted through a browser automation API.
 * @async
 * @param {WindowsImeContext} context - Actual packaged native application and keyboard.
 * @returns {Promise<void>} Resolves after real preedit and all six original native cases.
 * @throws {Error} If original composition, source, visibility or saved results differ.
 * @example
 * // R, K, S pass through the installed input method as ㄱ, 가, 간.
 */
async function verifyOriginalKoreanInput(
  context: WindowsImeContext,
): Promise<void> {
  await importImeSource(context, "original-preedit");
  for (/** Each observed preedit state is produced by a native virtual key, never assigned expected text. */ const step of [
    { key: 0x52, text: "ㄱ" },
    { key: 0x4b, text: "가" },
    { key: 0x53, text: "간" },
  ]) {
    await context.keyboard.press([step.key]);
    await expect
      .poll(
        /**
         * Observe actual original Korean source during composition.
         *
         * Rendering-only text is excluded before comparison with the independent key result.
         * @async
         * @returns {Promise<string>} Current original preedit text.
         * @example
         * // A completed Unicode insert cannot satisfy the recorded trusted composition events.
         */
        async () => context.page.locator(".tiptap").evaluate(imeSourceText),
      )
      .toBe(step.text);
    await expect(context.page.locator(".tiptap")).toHaveClass(
      /forhan-outline-composing/,
    );
    /** Actual native composition records retain the host's original trust flags. */
    const events = await imeEvents(context.page);
    expect(
      events.some(
        /**
         * Require this original preedit value from an actual trusted native update.
         *
         * Previous source or synthetic composition cannot satisfy the current key result.
         * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Original recorded DOM event.
         * @returns {boolean} Whether this actual native update belongs to the current preedit value.
         * @example
         * // The installed IME emits 가 after the native K key.
         */
        (event) =>
          event.type === "compositionupdate" &&
          event.trusted &&
          event.data === step.text,
      ),
    ).toBe(true);
    context.rows.push({
      id: "preedit-" + step.text,
      source: step.text,
      events,
    });
  }
  await context.keyboard.press([0x20]);
  expect(
    contextualSourceText(
      JSON.parse((await saveImeSource(context, "fhn")).toString()).doc,
    ),
  ).toBe("간 ");
  for (/** Independent installed-Hangul source results include batchim deletion, resegmentation, navigation and undo. */ const sample of ORIGINAL_KOREAN_CASES) {
    await importImeSource(context, sample.id);
    await context.keyboard.press(sample.keys);
    /** Actual canonical output includes original paragraph boundaries and no generated glyph copies. */
    const bytes = await saveImeSource(context, "fhn"),
      payload = JSON.parse(bytes.toString()),
      actual = payload.doc.content.map(contextualSourceText).join("\n"),
      events = await imeEvents(context.page);
    context.rows.push({
      id: sample.id,
      keys: sample.keys,
      actual,
      expected: sample.expected,
      events,
    });
    expect(actual).toBe(sample.expected);
    expect(
      events.some(
        /**
         * Require actual native composition input for every original source scenario.
         *
         * A saved expected string cannot substitute for a native IME event path.
         * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Original recorded input event.
         * @returns {boolean} Whether trusted composing text entered through the native input method.
         * @example
         * // The original source is typed through Windows rather than Playwright insertText.
         */
        (event) =>
          event.type === "input" &&
          event.inputType === "insertCompositionText" &&
          event.trusted &&
          event.isComposing === true,
      ),
    ).toBe(true);
  }
}

/**
 * Verify actual IME replacement of decorated original source and one undo.
 *
 * Full-word native drawing, width correction and original bidi source remain
 * active before native Ctrl+A and Korean composition. Real output readers
 * inspect every source metric after commit and undo restores the original text.
 * @async
 * @param {WindowsImeContext} context - Actual owned packaged editor and keyboard.
 * @returns {Promise<void>} Resolves after original Arabic/Hebrew replacement, outputs and undo.
 * @throws {Error} If original native input, metrics or one-step undo differs.
 * @example
 * // Composing 한글 replaces actual decorated source without duplicating glyph text.
 */
async function verifyDecoratedKoreanInput(
  context: WindowsImeContext,
): Promise<void> {
  for (/** Both coherent contextual words and independently scaled RTL glyphs retain their original input path. */ const original of [
    "X العربية Z",
    "ABC עברית 123 한글",
  ]) {
    await importImeSource(
      context,
      "decorated-" + Buffer.from(original).toString("hex"),
      original,
      true,
    );
    await context.keyboard.press([[0x11, 0x41]]);
    await context.keyboard.press([0x47, 0x4b, 0x53, 0x52, 0x4d, 0x46, 0x20]);
    /** Actual source and original trusted IME observations are retained before any expected-value assertion. */
    const actual = await context.page
        .locator(".tiptap")
        .evaluate(imeSourceText),
      events = await imeEvents(context.page);
    context.rows.push({
      id: "decorated-replacement",
      original,
      actual,
      events,
    });
    expect(actual).toBe("한글 ");
    for (/** Public native outputs independently retain the actual composed source and all original language arrays. */ const format of [
      "hwpx",
      "hwp",
    ] as const) {
      /** Independent document readers inspect actual production bytes. */
      const bytes = await saveImeSource(context, format),
        parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(contextualSourceText(parsed.doc)).toBe("한글 ");
      for (/** Every nonempty original run retains all seven source measurement slots. */ const run of parsed
        .doc.content![0].content || [])
        for (/** Drawing-only advances cannot replace original character measurements. */ const mark of run.marks ||
          [])
          if (mark.type === "textStyle") {
            /** Full source arrays remain independent of the active Korean language slot. */
            const metrics = characterMetrics(
              mark.attrs!.nativeCharacterMetrics,
            );
            expect(metrics.ratio).toEqual(Array(7).fill(75));
            expect(metrics.spacing).toEqual(Array(7).fill(20));
            expect(mark.attrs!.nativeOutlineType).toBe(3);
          }
    }
    await context.keyboard.press([[0x11, 0x5a]]);
    /** Real FHN serialization observes the source restored by the original native undo chord. */
    const restored = JSON.parse(
      (await saveImeSource(context, "fhn")).toString(),
    );
    context.rows.push({
      id: "decorated-one-undo",
      original,
      actual: contextualSourceText(restored.doc),
    });
    expect(contextualSourceText(restored.doc)).toBe(original);
  }
}

/**
 * Verify default HWPX saving while the actual Korean IME still owns preedit.
 *
 * Native Ctrl+S must preserve the final original syllable through the real
 * application shortcut and atomic writer. Public HWP and FHN outputs then
 * retain the same original text without a duplicate composition commit.
 * @async
 * @param {WindowsImeContext} context - Actual fresh packaged document and native keyboard.
 * @returns {Promise<void>} Resolves after actual default save and all public native outputs.
 * @throws {Error} If preedit, native shortcut, default format or saved source differs.
 * @example
 * // A new document containing composing 한글 saves as HWPX through native Ctrl+S.
 */
async function verifyComposingNativeSave(
  context: WindowsImeContext,
): Promise<void> {
  /** A fresh actual document retains the user's preferred HWPX default. */
  const initial = await context.keyboard.observe();
  if (initial.openStatus === 0) await context.keyboard.press([0x15]);
  await context.keyboard.press([0x47, 0x4b, 0x53, 0x52, 0x4d, 0x46]);
  expect(await context.page.locator(".tiptap").evaluate(imeSourceText)).toBe(
    "한글",
  );
  await expect(context.page.locator(".tiptap")).toHaveClass(
    /forhan-outline-composing/,
  );
  /** The actual native chooser destination has the required default HWPX extension. */
  const output = await chooseImeDestination(context, "hwpx");
  await context.keyboard.press([[0x11, 0x53]]);
  await expect
    .poll(
      /**
       * Observe the actual default native save rather than invoking a serializer directly.
       *
       * The generated HWPX path cannot be satisfied by an earlier operation.
       * @async
       * @returns {Promise<boolean>} Whether the actual original Ctrl+S output exists.
       * @example
       * // An IME-swallowed shortcut cannot pass by supplying expected file bytes.
       */
      async () => {
        try {
          await access(output);
          return true;
        } catch {
          return false;
        }
      },
    )
    .toBe(true);
  /** The independent native reader observes the actual written final composed syllable. */
  const bytes = await readFile(output),
    parsed = await readHwpx(bytes);
  await retainImeOutput(context, "hwpx", bytes);
  expect(contextualSourceText(parsed.doc)).toBe("한글");
  await expect(context.page.locator("#format-badge")).toHaveText("HWPX");
  context.rows.push({
    id: "composing-default-hwpx-save",
    source: contextualSourceText(parsed.doc),
    events: await imeEvents(context.page),
  });
  for (/** Every public native format preserves the actual committed original input. */ const format of [
    "hwp",
    "fhn",
  ] as const) {
    /** Format-specific independent readers inspect original production output bytes. */
    const bytes = await saveImeSource(context, format),
      doc =
        format === "hwp"
          ? readHwp(bytes).doc
          : JSON.parse(bytes.toString()).doc;
    expect(contextualSourceText(doc)).toBe("한글");
    context.rows.push({
      id: "composed-" + format + "-save",
      source: contextualSourceText(doc),
    });
  }
}

/**
 * Register the actual original Korean preedit regression with an isolated native application.
 *
 * The explicit interactive gate owns native keyboard input and never runs as an ordinary browser fixture.
 * @async
 * @returns {Promise<void>} Resolves after genuine original Korean input verification.
 * @example
 * // npm run test:ime:windows runs this actual native scenario.
 */
async function originalKoreanInput(): Promise<void> {
  await withWindowsIme("original-korean-input", verifyOriginalKoreanInput);
}

/**
 * Register decorated native source replacement with original Korean composition.
 *
 * A separate native profile prevents another test's source or undo history from satisfying this regression.
 * @async
 * @returns {Promise<void>} Resolves after actual decorated source and output verification.
 * @example
 * // Native keys replace the original Arabic and Hebrew source before one undo.
 */
async function decoratedKoreanInput(): Promise<void> {
  await withWindowsIme("decorated-korean-input", verifyDecoratedKoreanInput);
}

/**
 * Register the real composing-source save shortcut regression.
 *
 * A fresh actual new document proves HWPX priority without importing a preselected format.
 * @async
 * @returns {Promise<void>} Resolves after actual native Ctrl+S and public source output verification.
 * @example
 * // The original final Korean syllable must survive a composing native save.
 */
async function composingNativeSave(): Promise<void> {
  await withWindowsIme("composing-native-save", verifyComposingNativeSave);
}

/**
 * Replace an actually hyphenated Latin source through the installed Korean IME.
 *
 * Drawing-only discretionary characters must never enter model source, native
 * files or undo history. Original Latin source and its drawings return together
 * after one real operating-system undo shortcut.
 * @async
 * @param {WindowsImeContext} context - Actual owned packaged editor and native keyboard.
 * @returns {Promise<void>} Resolves after native composition, real file inspection and one undo.
 * @throws {Error} If composition, literal native source, retained paragraph modes or undo differs.
 * @example
 * // Real Korean input replaces a word containing multiple inaccessible hyphen drawings.
 */
async function verifyHyphenatedLatinInput(context:WindowsImeContext):Promise<void>{
  /** A narrow real paragraph forces the original dictionary word to wrap physically. */
  const original='characteristically counterrevolutionary internationalization';
  await importImeSource(context,'hyphenated-latin-source',original,false,{nativeBreakLatinWord:1,nativeBreakNonLatinWord:0,marginRight:'350pt'});
  await expect(context.page.locator('.tiptap [data-forhan-hyphen-drawing]').first()).toBeAttached();
  await context.keyboard.press([[0x11,0x41]]);
  await context.keyboard.press([0x47,0x4b,0x53,0x52,0x4d,0x46,0x20]);
  /** Actual native input observations and original source are retained before assertions. */
  const actual=await context.page.locator('.tiptap').evaluate(imeSourceText),events=await imeEvents(context.page);
  context.rows.push({id:'hyphenated-latin-replacement',original,actual,events});
  expect(actual).toBe('한글 ');
  expect(events.some(
    /**
     * Require trusted operating-system composition in this original source scenario.
     *
     * Completed Unicode insertion cannot satisfy this native input assertion.
     * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Original passive native input record.
     * @returns {boolean} Whether actual trusted composing text entered the original editor.
     * @example
     * // The installed IME produces the actual Korean source replacement.
     */
    event=>event.type==='input'&&event.trusted&&event.isComposing===true&&event.inputType==='insertCompositionText'
  )).toBe(true);
  for(/** Real public native containers retain only original Unicode and both independent paragraph modes. */const format of ['hwpx','hwp','fhn'] as const){
    /** Actual completed file bytes are decoded independently of rendering decorations. */
    const bytes=await saveImeSource(context,format),parsed=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString());
    expect(contextualSourceText(parsed.doc)).toBe('한글 ');
    expect(parsed.doc.content[0].attrs.nativeBreakLatinWord).toBe(1);
    expect(parsed.doc.content[0].attrs.nativeBreakNonLatinWord).toBe(0);
  }
  await context.keyboard.press([[0x11,0x5a]]);
  await expect.poll(
    /**
     * Observe restored original source independently of inaccessible hyphen drawings.
     *
     * Drawing-only soft hyphens cannot satisfy the expected original text.
     * @async
     * @returns {Promise<string>} Actual original editable Unicode source.
     * @example
     * // One native undo restores the original Latin words without discretionary characters.
     */
    async()=>context.page.locator('.tiptap').evaluate(imeSourceText)
  ).toBe(original);
  /** A completed real portable save establishes original source after native undo. */
  const restored=JSON.parse((await saveImeSource(context,'fhn')).toString());
  expect(contextualSourceText(restored.doc)).toBe(original);
  expect(contextualSourceText(restored.doc)).not.toContain('\u00ad');
  await expect(context.page.locator('.tiptap [data-forhan-hyphen-drawing]').first()).toBeAttached();
  context.rows.push({id:'hyphenated-latin-one-undo',actual:original});
}

/**
 * Register actual Korean composition over source with offline hyphen drawings.
 *
 * A separate native profile owns real keyboard input, source history and outputs.
 * @async
 * @returns {Promise<void>} Resolves after the actual hyphenated-source input scenario.
 * @example
 * // npm run test:ime:windows executes the production package with real Windows keys.
 */
async function hyphenatedLatinInput():Promise<void>{await withWindowsIme('hyphenated-latin-input',verifyHyphenatedLatinInput);}

/**
 * Replace adaptively condensed source through the actual installed Korean IME.
 *
 * The original paragraph has real negative interword corrections before input.
 * Composition owns its DOM until completion. Native minimum spacing, original
 * Unicode, real output files and one operating-system undo remain independent
 * from the rendering-only source-space correction wrappers.
 * @async
 * @param {WindowsImeContext} context - Owned actual desktop and native keyboard.
 * @returns {Promise<void>} Resolves after trusted composition, native files and atomic source restoration.
 * @throws {Error} If native input, retained paragraph reduction or source undo differs.
 * @example
 * // A 25% paragraph minimum survives actual Korean replacement and restores its original Latin source.
 */
async function verifyMinimumSpaceKoreanInput(context:WindowsImeContext):Promise<void>{
  /** Narrow original source requires actual adaptive gaps rather than only a stored paragraph marker. */
  const original='ALPHA beta gamma delta epsilon zeta eta theta iota kappa';
  await importImeSource(context,'minimum-space-native-source',original,false,{nativeParagraphCondense:75,nativeBreakLatinWord:0,nativeBreakNonLatinWord:0,marginRight:'328.2pt'});
  await expect.poll(
    /**
     * Observe real negative paragraph gap corrections before original native input.
     *
     * Merely declaring native paragraph metadata cannot satisfy this check.
     * @async
     * @returns {Promise<boolean>} Whether a real current source gap is actually condensed.
     * @example
     * // The original narrow Latin paragraph contains at least one physically reduced gap.
     */
    async()=>context.page.locator('.tiptap [data-forhan-condense-delta]').evaluateAll(
      /**
       * Inspect the current original source-space drawing corrections.
       *
       * Only actual nonzero source-gap reductions establish active rendering.
       * @param {Element[]} elements - Actual owned source-space wrappers.
       * @returns {boolean} Whether any real source gap is narrower than its original advance.
       * @example
       * // Leading and unneeded trailing gaps can still retain correction zero.
       */
      elements=>elements.some(
        /**
         * Recognize one actual negative paragraph-only correction.
         *
         * The original native character-space delta remains separate.
         * @param {Element} element - Actual original source-space wrapper.
         * @returns {boolean} Whether its paragraph-only width correction is negative.
         * @example
         * // Rendering changes do not insert Unicode characters into source.
         */
        element=>Number(element.getAttribute('data-forhan-condense-delta'))<0))).toBe(true);
  await context.keyboard.press([[0x11,0x41]]);
  await context.keyboard.press([0x47,0x4b,0x53,0x52,0x4d,0x46,0x20]);
  /** Passive original native events and source are retained before native file inspection. */
  const actual=await context.page.locator('.tiptap').evaluate(imeSourceText),events=await imeEvents(context.page);
  context.rows.push({id:'minimum-space-native-replacement',original,actual,events});expect(actual).toBe('한글 ');
  expect(events.some(
    /**
     * Require trusted original operating-system composition in this active-gap scenario.
     *
     * Completed Unicode or synthetic DOM events cannot satisfy actual native input.
     * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Original passive input observation.
     * @returns {boolean} Whether the real installed IME supplied composing source text.
     * @example
     * // The original source is edited through actual physical Windows keys.
     */
    event=>event.type==='input'&&event.trusted&&event.isComposing===true&&event.inputType==='insertCompositionText')).toBe(true);
  for(/** Real native containers retain paragraph reduction independently from literal source text. */const format of ['hwpx','hwp','fhn'] as const){
    /** Only actual completed production writer bytes enter independent native readers. */
    const bytes=await saveImeSource(context,format),source=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString());
    expect(contextualSourceText(source.doc)).toBe('한글 ');expect(source.doc.content[0].attrs.nativeParagraphCondense).toBe(75);
  }
  await context.keyboard.press([[0x11,0x5a]]);
  await expect.poll(
    /**
     * Observe original source restoration after one actual native undo.
     *
     * Drawing wrappers and their width metadata are excluded from literal text.
     * @async
     * @returns {Promise<string>} Actual restored original editable Unicode.
     * @example
     * // One native undo restores the original complete Latin paragraph.
     */
    async()=>context.page.locator('.tiptap').evaluate(imeSourceText)).toBe(original);
  /** Actual portable source retains both restored Unicode and native paragraph reduction. */
  const restored=JSON.parse((await saveImeSource(context,'fhn')).toString());
  expect(contextualSourceText(restored.doc)).toBe(original);expect(restored.doc.content[0].attrs.nativeParagraphCondense).toBe(75);
  context.rows.push({id:'minimum-space-native-one-undo',actual:original});
}

/**
 * Register native Korean composition over adaptively condensed paragraph source.
 *
 * A fresh native profile owns original keyboard input, source history and files.
 * @async
 * @returns {Promise<void>} Resolves after the actual condensed-source native input scenario.
 * @throws {Error} If actual owned native input or its source verification fails.
 * @example
 * // npm run test:ime:windows executes this actual production scenario.
 */
async function minimumSpaceKoreanInput():Promise<void>{await withWindowsIme('minimum-space-korean-input',verifyMinimumSpaceKoreanInput);}

/**
 * Replace grid-aligned source through the actual installed Korean input method.
 *
 * A public page change activates the grid before real guarded Win32 key input.
 * Trusted original events, actual native files and one source undo independently
 * verify that drawing does not replace composition or page source.
 * @async
 * @param {WindowsImeContext} context - Actual packaged application and guarded OS keyboard.
 * @returns {Promise<void>} Resolves after actual Korean input, native output and undo agree.
 * @throws {Error} If original composition, native settings or restored source differs.
 * @example
 * // Actual Korean input retains the document's accepted 16pt grid interval.
 */
async function verifyLineGridKoreanInput(context:WindowsImeContext):Promise<void>{
  /** Original source wraps physically before trusted native replacement. */
  const original='ALPHA beta gamma delta epsilon zeta eta theta iota kappa';
  await importImeSource(context,'line-grid-native-source',original,false,{lineHeight:'100%',nativeSnapToGrid:true,marginRight:'328.2pt'});
  await context.page.locator('#page-settings').click();
  await context.page.locator('[data-page-tab="grid"]').click();
  await context.page.locator('[name="grid-mode"][value="line"]').check();
  await context.page.locator('[data-modal-value="apply"]').click();
  await expect(context.page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','1600');
  await context.page.locator('.tiptap').click();
  await context.keyboard.press([[0x11,0x41]]);
  await context.keyboard.press([0x47,0x4b,0x53,0x52,0x4d,0x46,0x20]);
  /** Actual trusted input is observed before any source serialization. */
  const actual=await context.page.locator('.tiptap').evaluate(imeSourceText),events=await imeEvents(context.page);
  expect(actual).toBe('한글 ');
  expect(events.some(
    /**
     * Require original trusted composition in this active-grid source.
     *
     * Completed Unicode insertion or synthetic composition cannot pass this check.
     * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Original passive native record.
     * @returns {boolean} Whether the actual installed IME composed original source.
     * @example
     * // Actual Windows composition owns the document while preedit is active.
     */
    event=>event.type==='input'&&event.trusted&&event.isComposing===true&&event.inputType==='insertCompositionText')).toBe(true);
  for(/** Production files preserve accepted page source independently from Korean Unicode. */const format of ['hwpx','hwp','fhn'] as const){
    /** Completed real native output is decoded independently from rendering markers. */
    const bytes=await saveImeSource(context,format),payload=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString());
    expect(contextualSourceText(payload.doc)).toBe('한글 ');expect(payload.page.lineGrid).toBe(1600);expect(payload.doc.content[0].attrs.nativeSnapToGrid).toBe(true);
  }
  await context.keyboard.press([[0x11,0x5a]]);
  await expect.poll(
    /**
     * Observe original source restoration after one actual operating-system undo.
     *
     * Page configuration remains active while the original authored text returns.
     * @async
     * @returns {Promise<string>} Actual restored original editable Unicode.
     * @example
     * // Undoing Korean replacement restores the original complete Latin source.
     */
    async()=>context.page.locator('.tiptap').evaluate(imeSourceText)).toBe(original);
  await expect(context.page.locator('#paper')).toHaveAttribute('data-forhan-line-grid','1600');
  context.rows.push({id:'line-grid-native-composition-and-one-undo',original,actual,events});
}

/**
 * Register actual Korean composition over an active native line grid.
 *
 * A fresh uniquely owned profile isolates real input, page history and native files.
 * @async
 * @returns {Promise<void>} Resolves after actual packaged native grid input verification.
 * @throws {Error} If the actual owned native scenario fails.
 * @example
 * // npm run test:ime:windows executes this actual production scenario.
 */
async function lineGridKoreanInput():Promise<void>{await withWindowsIme('line-grid-korean-input',verifyLineGridKoreanInput);}

/**
 * Compose Korean on a genuinely empty continuation sheet through actual Windows keys.
 *
 * Native Shift+Enter creates the empty physical line before trusted Korean
 * preedit begins. Actual source, visible glyph bounds and all three completed
 * native containers independently verify the resulting second-sheet input.
 * @async
 * @param {WindowsImeContext} context - Actual owned packaged application and operating-system keyboard.
 * @param {boolean} [shaded=false] - Whether original source and provisional input retain opaque character shading.
 * @param {boolean} [grid=false] - Whether real composition starts on a horizontally projected second paper.
 * @returns {Promise<void>} Resolves after real next-sheet composition and completed native source files agree.
 * @throws {Error} If trusted composition, physical caret placement or original source is lost.
 * @example
 * // A real Korean IME types on sheet two immediately after a full twenty-row native grid page.
 */
async function verifyNativeSheetKoreanInput(context:WindowsImeContext,shaded=false,grid=false):Promise<void>{
  await importImeSource(context,'native-sheet-ime-setup');
  /** Original source has twenty actual grid rows and contains no expected Korean result. */
  const source={page:{...defaultPage(),lineGrid:3288},font:1000,percent:100,snap:true,separate:false,before:0,after:0,breakBefore:null,count:20},
    doc=nativePaginationDocument(source),original=contextualSourceText(doc);
  if(shaded)for(/** Original color is authored before native composition begins. */const run of doc.content![0].content??[])if(run.type==='text')run.marks![0].attrs!.backgroundColor='#fff1a8';
  await context.page.locator('#file-input').setInputFiles({name:'native-sheet-ime.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:source.page,doc}))});
  await expect(context.page.locator('#toast')).toContainText('native-sheet-ime.fhn');
  if(grid){
    await context.page.locator('#zoom-reset').click();await context.page.locator('[name="native-page-shape"][value="two"]').check();
    await context.page.locator('[name="native-zoom-mode"][value="custom"]').check();await context.page.locator('#native-zoom-value').fill('125');
    await context.page.locator('[data-modal-value="apply"]').click();
  }
  await expect(context.page.locator('.native-sheet-background')).toHaveCount(1);
  await expect(context.page.locator('.tiptap forhan-line').filter({hasText:/^row019$/u})).toHaveCount(1);
  await context.page.locator('.tiptap').click();
  if(grid){
    /** The real numeric zoom control uses Latin input; the original document regains Korean mode through its native toggle. */
    const input=await context.keyboard.observe();
    if(input.openStatus===0)await context.keyboard.press([0x15]);
  }
  await context.keyboard.press([[0x11,0x23],[0x10,0x0d]]);
  await expect(context.page.locator('.native-sheet-background')).toHaveCount(2);await expect(context.page.locator('.native-status-page')).toHaveText('2/2쪽');
  if(grid){
    /** Actual physical paper rectangles establish a genuinely separate right-hand source destination. */
    const first=await context.page.locator('.native-sheet-background').nth(0).boundingBox(),second=await context.page.locator('.native-sheet-background').nth(1).boundingBox();
    expect(first).not.toBeNull();expect(second).not.toBeNull();expect(second!.x).toBeGreaterThan(first!.x+first!.width);
  }
  if(shaded){
    for(/** Each provisional original value is produced by an actual installed-input-method key. */const step of [{key:0x47,text:'\u314e'},{key:0x4b,text:'\ud558'},{key:0x53,text:'\ud55c'},{key:0x52,text:'\ud55c\u3131'},{key:0x4d,text:'\ud55c\uadf8'},{key:0x46,text:'\ud55c\uae00'}]){
      await context.keyboard.press([step.key]);await verifyNativeShadedPreedit(context,step.text);
      if(grid)await expectNativeGridPreedit(context,step.text);
    }
    await context.keyboard.press([0x20]);
  }else await context.keyboard.press([0x47,0x4b,0x53,0x52,0x4d,0x46,0x20]);
  /** Trusted original native events and source are retained before any subsequent save dialog. */
  const actual=await context.page.locator('.tiptap').evaluate(imeSourceText),events=await imeEvents(context.page);
  expect(actual).toBe(original+'한글 ');
  await expect(context.page.locator('.tiptap br:not(.ProseMirror-trailingBreak)')).toHaveCount(20);
  try{await expect(context.page.locator('.native-status-page')).toHaveText('2/2쪽');}
  finally{if(shaded){
    /** Actual committed source ownership remains independently inspectable if caret or page status differs. */
    const committed=await context.page.locator('.tiptap').evaluate(
      /**
       * Read actual source, selection and owned continuation geometry after real native commit.
       *
       * Diagnostic observation does not dispatch a transaction or change source DOM.
       * @param {HTMLElement} root - Actual original source editor.
       * @returns {object} Actual committed source, caret, paper and retained flow ownership.
       * @example
       * // A stale caret widget remains visible in raw source DOM evidence.
       */
      (root:HTMLElement)=>{
        /** Only the actual mounted editor supplies original model and native caret ownership. */
        const editor=(root as HTMLElement&{editor:import('@tiptap/core').Editor}).editor,paper=root.closest('#paper')!,selection=editor.state.selection;
        return{doc:editor.getJSON(),selection:selection.toJSON(),nativeSelection:{text:getSelection()?.toString(),anchor:getSelection()?.anchorNode?.textContent,anchorOffset:getSelection()?.anchorOffset,focus:getSelection()?.focusNode?.textContent,focusOffset:getSelection()?.focusOffset},composing:editor.view.composing,caret:editor.view.coordsAtPos(selection.head),html:root.innerHTML,paperTop:paper.getBoundingClientRect().top,sheets:[...paper.querySelectorAll('.native-sheet-background')].map(
          /**
           * Read each actual physical paper rectangle without interpreting source metadata.
           *
           * Bounds remain in the actual current viewport coordinates.
           * @param {Element} sheet - Actual rendered physical paper.
           * @returns {{top:number;bottom:number}} Independent visible page bounds.
           * @example
           * // Committed source and its actual caret must remain on the second paper.
           */
          sheet=>({top:sheet.getBoundingClientRect().top,bottom:sheet.getBoundingClientRect().bottom}))};
      });
    await mkdir(context.artifacts,{recursive:true});
    /** Unchanged post-commit frame bytes retain their actual native evidence identity. */
    const file=context.artifacts+'/committed-shaded-source.png',frame=await context.page.screenshot({path:file});
    context.rows.push({id:'shaded-native-sheet-committed-observation',committed,file,sha256:createHash('sha256').update(frame).digest('hex')});
  }}
  expect(events.some(
    /**
     * Require actual installed-input-method composition on the continuation sheet.
     *
     * Completed Unicode insertion and synthetic DOM events cannot satisfy this check.
     * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Passive original operating-system event.
     * @returns {boolean} Whether original trusted native preedit reached the real source editor.
     * @example
     * // The installed Korean input method owns its actual preedit DOM.
     */
    event=>event.type==='input'&&event.trusted&&event.isComposing===true&&event.inputType==='insertCompositionText')).toBe(true);
  /** Actual source glyph rectangles must paint inside the independently rendered second physical sheet. */
  const visible=await context.page.locator('.tiptap').evaluate(
    /**
     * Observe actual committed Korean glyph positions independently from layout metadata.
     *
     * Only original source text nodes participate; auxiliary vector copies are ignored.
     * @param {HTMLElement} root - Actual source editor root.
     * @returns {boolean} Whether every committed Korean source glyph lies inside physical sheet two.
     * @example
     * // A source character drawn in the preceding page cannot satisfy physical input verification.
     */
    root=>{
      /** Real sheet bounds establish the actual visible continuation region. */
      const sheet=root.closest('#paper')!.querySelectorAll('.native-sheet-background')[1].getBoundingClientRect(),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let count=0;
      while(walker.nextNode()){
        /** Source text remains independent from inaccessible auxiliary drawings. */
        const text=walker.currentNode as Text;if(text.parentElement?.closest('svg,[contenteditable="false"]'))continue;
        for(let index=0;index<text.length;index++)if(/[한글]/u.test(text.data[index])){
          /** Actual native glyph boxes retain their real on-screen page placement. */
          const range=document.createRange();range.setStart(text,index);range.setEnd(text,index+1);
          /** Both source glyphs must lie wholly inside the actual physical paper. */
          const box=range.getBoundingClientRect();if(box.top<sheet.top||box.bottom>sheet.bottom)return false;count++;
        }
      }
      return count===2;
    });
  expect(visible).toBe(true);
  for(/** Every completed native container is decoded independently from source drawings. */const format of ['hwpx','hwp','fhn'] as const){
    /** Actual production bytes retain original text, hard breaks and independent physical page settings. */
    const bytes=await saveImeSource(context,format),payload=format==='hwp'?readHwp(bytes):format==='hwpx'?await readHwpx(bytes):JSON.parse(bytes.toString());
    expect(contextualSourceText(payload.doc)).toBe(actual);expect(payload.page.lineGrid).toBe(3288);expect(payload.doc.content.length).toBe(1);
    let breaks=0;
    for(/** Independent native readers must retain all twenty authored hard breaks, including the empty continuation boundary. */const node of payload.doc.content[0].content??[])if(node.type==='hardBreak')breaks++;
    expect(breaks).toBe(20);
    if(shaded)for(/** Every nonempty original source run retains its authored shade through real native writers. */const run of payload.doc.content[0].content??[])if(run.type==='text')expect(run.marks).toContainEqual(expect.objectContaining({type:'textStyle',attrs:expect.objectContaining({backgroundColor:'#fff1a8'})}));
  }
  context.rows.push({id:'native-sheet-empty-continuation-trusted-composition',original,actual,events,visible});
}

/**
 * Register actual Korean input on a blank native continuation sheet.
 *
 * A fresh uniquely owned native profile isolates original Windows input and completed files.
 * @async
 * @returns {Promise<void>} Resolves after the actual packaged continuation-sheet input scenario.
 * @throws {Error} If the owned native scenario fails.
 * @example
 * // npm run test:ime:windows includes this actual physical multi-sheet input case.
 */
async function nativeSheetKoreanInput():Promise<void>{await withWindowsIme('native-sheet-korean-input',verifyNativeSheetKoreanInput);}

/**
 * Verify actual opaque source-color paint while Windows owns provisional Korean text.
 *
 * Actual grapheme rectangles and installed font ascent independently locate
 * the current source baseline. Unmodified complete screenshot bytes establish
 * the background's physical coverage without trusting vector attributes. Each
 * successful provisional frame is retained beside the actual native output.
 * @async
 * @param {WindowsImeContext} context - Actual owned packaged renderer and native keyboard.
 * @param {string} text - Independently expected provisional Korean suffix from the preceding native key.
 * @returns {Promise<void>} Resolves after the actual source and painted provisional background agree.
 * @throws {Error} If composition is replaced, its color is absent or provisional width is stale.
 * @example
 * await verifyNativeShadedPreedit(context,'\ud55c'); // The native IME still owns the actual text node.
 */
async function verifyNativeShadedPreedit(context:WindowsImeContext,text:string):Promise<void>{
  await expect(context.page.locator('.tiptap')).toContainText(text);
  await expect(
    /**
     * Observe genuine provisional source and complete actual screen paint.
     *
     * The source DOM remains read-only while the installed IME owns preedit.
     * @async
     * @returns {Promise<void>} Resolves after the current opaque background covers the actual provisional source.
     * @throws {Error} If source coordinates or painted color coverage disagree.
     * @example
     * // A stale twenty-row background cannot satisfy the new twenty-first source line.
     */
    async()=>{
      /** Actual DOM source glyphs establish the physical provisional location independently of drawing attributes. */
      const source=await context.page.locator('.tiptap').evaluate(
        /**
         * Read actual provisional grapheme bounds and installed font metrics.
         *
         * Source text outside its retained twenty original Latin rows identifies
         * actual Korean input without accessing editor state or generated copies.
         * @param {HTMLElement} root - Actual original source root.
         * @returns {{left:number;right:number;top:number;bottom:number;scale:number}} Original provisional native font-height box in screenshot pixels.
         * @example
         * // The actual range lies on the new physical continuation sheet.
         */
        (root:HTMLElement)=>{
          /** Original text leaves and installed font ascent determine actual baseline independently. */
          const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),canvas=document.createElement('canvas').getContext('2d')!;
          let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,zoom=1;
          for(let ancestor:HTMLElement|null=root;ancestor;ancestor=ancestor.parentElement)zoom*=Number(getComputedStyle(ancestor).zoom)||1;
          while(walker.nextNode()){
            /** Auxiliary paint cannot become original provisional text. */
            const node=walker.currentNode as Text;if(node.parentElement?.closest('svg,[contenteditable="false"]'))continue;
            for(let index=0;index<node.length;index++)if(/[\u3131-\u318e\uac00-\ud7a3]/u.test(node.data[index])){
              /** Actual browser ranges and font ascent observe the current physical source baseline. */
              const range=document.createRange(),style=getComputedStyle(node.parentElement!);range.setStart(node,index);range.setEnd(node,index+1);
              canvas.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
              /** Original 10pt source caches independently retain an 850-unit baseline and 1000-unit shade height. */
              const box=range.getBoundingClientRect(),baseline=box.top+canvas.measureText(node.data[index]).fontBoundingBoxAscent*zoom,y=baseline-850/75*zoom;
              left=Math.min(left,box.left);right=Math.max(right,box.right);top=Math.min(top,y);bottom=Math.max(bottom,y+1000/75*zoom);
            }
          }
          return{left,right,top,bottom,scale:devicePixelRatio};
        }),png=await context.page.screenshot(),boxes=await context.page.evaluate(nativeShadePixels,{encoded:png.toString('base64'),minimumWidth:1,minimumHeight:1,minimumPixels:1});
      expect(Number.isFinite(source.left)).toBe(true);
      await mkdir(context.artifacts,{recursive:true});
      /** Every observed original frame retains its actual geometry even when provisional paint has not settled. */
      const observedFile=context.artifacts+'/observed-preedit-'+Buffer.from(text).toString('hex')+'-'+context.rows.length+'.png';
      await writeFile(observedFile,png,{flag:'wx'});
      context.rows.push({id:'shaded-native-sheet-preedit-observation',text,source,boxes,file:observedFile,sha256:createHash('sha256').update(png).digest('hex')});
      /** The screenshot retains actual device pixels while DOM ranges use viewport CSS coordinates. */
      const scale=source.scale,coverage=nativeShadeCoverage(boxes,{left:source.left*scale-3,right:source.right*scale+3,top:source.top*scale-3,bottom:source.bottom*scale+3});
      expect(coverage).not.toBeNull();
      expect(Math.abs(coverage!.left-source.left*scale)).toBeLessThanOrEqual(1);expect(Math.abs(coverage!.right+1-source.right*scale)).toBeLessThanOrEqual(1);
      expect(Math.abs(coverage!.top-source.top*scale)).toBeLessThanOrEqual(1);expect(Math.abs(coverage!.bottom+1-source.bottom*scale)).toBeLessThanOrEqual(1);
    }).toPass({timeout:5000,intervals:[16,32,64,100]});
  await mkdir(context.artifacts,{recursive:true});
  /** Complete unchanged provisional frame bytes retain their independent evidence identity. */
  const file=context.artifacts+'/preedit-'+Buffer.from(text).toString('hex')+'.png',frame=await context.page.screenshot({path:file});
  context.rows.push({id:'shaded-native-sheet-preedit',text,file,sha256:createHash('sha256').update(frame).digest('hex'),events:await imeEvents(context.page)});
}

/**
 * Run actual Korean composition over a colored empty native continuation sheet.
 *
 * The scenario retains the same real keyboard and source-file verification as
 * ordinary continuation input, adding actual provisional background coverage.
 * @async
 * @param {WindowsImeContext} context - Actual uniquely owned packaged native scenario.
 * @returns {Promise<void>} Resolves after shaded preedit and all actual native containers agree.
 * @throws {Error} If actual trusted source input or source-color coverage fails.
 * @example
 * // The new empty sheet remains editable while its original source shade grows with Korean preedit.
 */
async function verifyShadedNativeSheetKoreanInput(context:WindowsImeContext):Promise<void>{await verifyNativeSheetKoreanInput(context,true);}

/**
 * Register actual operating-system Korean input on shaded native continuation source.
 *
 * A fresh owned profile isolates genuine composition and completed source files.
 * @async
 * @returns {Promise<void>} Resolves after the actual shaded native input scenario.
 * @throws {Error} If the real native scenario fails.
 * @example
 * // npm run test:ime:windows executes this actual shaded preedit scenario.
 */
async function shadedNativeSheetKoreanInput():Promise<void>{await withWindowsIme('shaded-native-sheet-korean-input',verifyShadedNativeSheetKoreanInput);}

/**
 * Verify every genuine provisional Korean fragment occupies the actual right-hand paper.
 *
 * Source text ranges and physical paper rectangles remain independent from
 * generated caret metadata. Committed and provisional syllables are all read,
 * so a later composition cannot silently return to the first paper.
 * @async
 * @param {WindowsImeContext} context - Actual uniquely owned packaged renderer and native keyboard.
 * @param {string} text - Independently expected provisional Korean suffix.
 * @returns {Promise<void>} Resolves when every actual source fragment stays inside the second paper.
 * @throws {Error} If source text, physical composition ownership or page membership differs.
 * @example
 * await expectNativeGridPreedit(context,'\ud55c\uae00'); // Both syllables must occupy the right-hand source page.
 */
async function expectNativeGridPreedit(context:WindowsImeContext,text:string):Promise<void>{
  await expect(context.page.locator('.tiptap')).toContainText(text);
  /** Actual source and visible physical rectangles establish composition ownership without editor internals. */
  const actual=await context.page.locator('.tiptap').evaluate(
    /**
     * Read every original Korean source fragment and both actual physical papers.
     *
     * Auxiliary paint and noneditable widgets cannot supply a provisional source range.
     * @param {HTMLElement} root - Actual original editable source.
     * @returns {{papers:Array<{left:number;right:number;top:number;bottom:number}>;fragments:Array<{left:number;right:number;top:number;bottom:number}>}} Literal actual source and physical paper bounds.
     * @example
     * // A generated source-page label cannot hide Korean preedit appearing in the left column.
     */
    (root:HTMLElement)=>{
      /** All independently rendered papers remain outside the authored source editor. */
      const papers=[...root.closest('#paper')!.querySelectorAll('.native-sheet-background')].map(
        /**
         * Retain a genuine physical page rectangle in viewport coordinates.
         *
         * No authored model attribute supplies the observed position.
         * @param {Element} element - Actual visible physical paper background.
         * @returns {{left:number;right:number;top:number;bottom:number}} Actual native renderer rectangle.
         * @example
         * // The second paper begins strictly beyond the first paper's right edge.
         */
        element=>{
          /** Literal physical paper bounds remain separate from source page identifiers. */
          const box=element.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom};}),
        walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),fragments:Array<{left:number;right:number;top:number;bottom:number}>=[];
      while(walker.nextNode()){
        /** Only actual original Korean text can establish provisional composition placement. */
        const node=walker.currentNode as Text;if(!/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(node.data)||node.parentElement?.closest('svg,[contenteditable="false"]'))continue;
        /** A real source range includes every currently committed or provisional syllable. */
        const range=document.createRange();range.selectNodeContents(node);
        for(/** Separate physical fragments cannot be concealed by one large generated bounding rectangle. */const box of range.getClientRects())if(box.width>0&&box.height>0)fragments.push({left:box.left,right:box.right,top:box.top,bottom:box.bottom});
      }
      return{papers,fragments};
    });
  expect(actual.papers).toHaveLength(2);expect(actual.fragments.length).toBeGreaterThan(0);
  expect(actual.papers[1].left).toBeGreaterThan(actual.papers[0].right);
  for(/** Every true source fragment must stay within its intended second physical page. */const fragment of actual.fragments){
    expect(fragment.left).toBeGreaterThan(actual.papers[1].left);expect(fragment.right).toBeLessThan(actual.papers[1].right);
    expect(fragment.top).toBeGreaterThan(actual.papers[1].top);expect(fragment.bottom).toBeLessThan(actual.papers[1].bottom);
  }
  context.rows.push({id:'actual-grid-right-paper-preedit-source-bounds',text,...actual});
}

/**
 * Run genuine native Korean input on a horizontally projected empty continuation.
 *
 * Existing source, trusted-event, preedit-color and actual native file gates
 * also verify every provisional source fragment remains on the second paper.
 * @async
 * @param {WindowsImeContext} context - Actual uniquely owned native input scenario.
 * @returns {Promise<void>} Resolves after projected native composition and source files agree.
 * @throws {Error} If genuine composition, physical ownership or native source output differs.
 * @example
 * // Shift+Enter creates a real right-hand continuation without splitting the original source paragraph.
 */
async function verifyGridShadedNativeSheetKoreanInput(context:WindowsImeContext):Promise<void>{await verifyNativeSheetKoreanInput(context,true,true);}

/**
 * Register actual operating-system composition on a right-hand native paper.
 *
 * A fresh owned native profile isolates keyboard focus and retained source artifacts.
 * @async
 * @returns {Promise<void>} Resolves after the actual projected shaded input scenario.
 * @throws {Error} If the owned native scenario fails.
 * @example
 * // The actual Windows IME gate cannot substitute synthetic DOM composition events.
 */
async function gridShadedNativeSheetKoreanInput():Promise<void>{await withWindowsIme('grid-shaded-native-sheet-korean-input',verifyGridShadedNativeSheetKoreanInput);}

test(
  "actual Windows Korean IME retains original preedit, batchim editing, resegmentation, arrows, Enter and undo",
  originalKoreanInput,
);
test(
  "actual Windows Korean IME replaces decorated RTL source with original native arrays and one undo",
  decoratedKoreanInput,
);
test(
  "actual Windows Korean IME preserves final preedit through native Ctrl+S and HWPX, HWP and FHN saving",
  composingNativeSave,
);
test('actual Windows Korean IME replaces hyphenated Latin drawings without changing source, native modes or one undo',hyphenatedLatinInput);
test('actual Windows Korean IME retains adaptively condensed paragraph source, native files and one undo',minimumSpaceKoreanInput);
test('actual Windows Korean IME retains native line-grid source, real output and one undo',lineGridKoreanInput);
test('actual Windows Korean IME composes on an empty native continuation sheet and retains real physical source files',nativeSheetKoreanInput);
test('actual Windows Korean IME retains provisional shading and real source files on an empty native continuation sheet',shadedNativeSheetKoreanInput);
test('actual Windows Korean IME retains genuine right-paper preedit, source shading and native output in a two-page view',gridShadedNativeSheetKoreanInput);
