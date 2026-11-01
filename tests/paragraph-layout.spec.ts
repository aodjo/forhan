import {
  test,
  expect,
  type PlaywrightTestArgs,
  type Page,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { writeHwp } from "../src/formats/hwp-writer";
import { readHwp } from "../src/formats/hwp";
import { writeHwpx, readHwpx } from "../src/formats/hwpx";
import {
  paragraphLengthPoints,
  nativeParagraphLengthPoints,
} from "../src/formatting";

/**
 * Verify native paragraph modes preserve precision, validation and undo history.
 *
 * Imports real files with a hanging first line and hundredth-point margins.
 * Reapplying the dialog must not change those distances. Mode switches retain
 * an unsigned editable magnitude while applying the correct native sign.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser bindings.
 * @returns {Promise<void>} Resolves after import, dialog and native export assertions.
 * @throws {Error} If a mode, margin, sign or cancellation changes the authored geometry.
 * @example
 * // Native display rounds -18.25pt to 18.3 while an untouched source stays -18.25pt.
 */
async function verifyParagraphModes({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  for (/** Both independent native importers feed the same paragraph controls. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Authored paragraph whose point values cannot be rounded to tenths. */
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            textIndent: "-18.25pt",
            marginLeft: "12.25pt",
            marginRight: "7.5pt",
            marginTop: "3.25pt",
            marginBottom: "6.5pt",
          },
          content: [{ type: "text", text: "내어쓰기와 소수점 여백 검증" }],
        },
      ],
    };
    /** Complete native input, rather than a portable JSON-only fixture. */
    const input =
      format === "hwp" ? writeHwp({ doc }) : await writeHwpx({ doc });
    await page.locator("#file-input").setInputFiles({
      name: `문단.${format}`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(input),
    });
    await page.locator('button[data-native-tab="format"]').click();
    await page
      .locator('.native-ribbon [data-native-action="paragraph-format"]')
      .click();
    await expect(
      page.locator('[name="indentMode"][value="HANGING"]'),
    ).toBeChecked();
    await expect(page.locator('[name="textIndent"]')).toHaveValue("18.3");
    await expect(page.locator('[name="marginLeft"]')).toHaveValue("12.3");
    await expect(page.locator('[name="marginTop"]')).toHaveValue("3.3");
    await page.locator('[data-modal-value="apply"]').click();
    /** Actual native download registered before triggering serialization. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Completed native document whose stored paragraph geometry is checked. */
    const download = await pending;
    /** Exported bytes reconstructed by the corresponding independent native reader. */
    const bytes = await readFile((await download.path())!);
    /** Reconstructed paragraph layout rather than the dialog's draft values. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(
      Number(
        paragraphLengthPoints(
          parsed.doc.content?.[0]?.attrs?.textIndent,
        ).toFixed(2),
      ),
    ).toBe(-18.25);
    expect(
      Number(
        paragraphLengthPoints(
          parsed.doc.content?.[0]?.attrs?.marginLeft,
        ).toFixed(2),
      ),
    ).toBe(12.25);
    expect(
      Number(
        paragraphLengthPoints(
          parsed.doc.content?.[0]?.attrs?.marginTop,
        ).toFixed(2),
      ),
    ).toBe(3.25);
  }
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await page.locator('[name="indentMode"][value="NORMAL"]').check();
  await expect(page.locator('[name="textIndent"]')).toBeDisabled();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(
    page.locator('[name="indentMode"][value="HANGING"]'),
  ).toBeChecked();
  await page.locator('[name="indentMode"][value="INDENT"]').check();
  await page.locator('[name="textIndent"]').fill("-2");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".native-dialog-paragraph")).toBeVisible();
  await page.locator('[name="textIndent"]').fill("14.25");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap p")).toHaveCSS("text-indent", "19px");
  await page.locator(".tiptap").press("ControlOrMeta+z");
  await expect(page.locator(".tiptap p")).toHaveCSS(
    "text-indent",
    "-24.3333px",
  );
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await page.locator('[name="indentMode"][value="NORMAL"]').check();
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap p")).toHaveCSS("text-indent", "0px");
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(
    page.locator('[name="indentMode"][value="NORMAL"]'),
  ).toBeChecked();
  await expect(page.locator('[name="textIndent"]')).toBeDisabled();
  await page.keyboard.press("Escape");
}
test(
  "paragraph indentation modes retain native precision, cancellation and history",
  verifyParagraphModes,
);

/**
 * Verify native hanging geometry and relative units remain visible and editable.
 *
 * Actual wrapped-line positions distinguish Hancom's continuation-line offset
 * from a bare negative CSS indent. Unrelated dialog edits preserve character
 * units, and standard HTML negative indentation is mapped without moving text.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser regression bindings.
 * @returns {Promise<void>} Resolves after geometry, native exports and HTML import checks.
 * @throws {Error} If the first line moves left of its native margin or relative units flatten.
 * @example
 * // Native CHAR 150 plus hanging CHAR 50 starts lines at 7.5pt and 10pt.
 */
async function verifyHangingGeometryAndRelativeUnits({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  /** Native paragraph geometry with relative character units and wrapped Korean text. */
  const payload = {
    application: "forhan",
    version: 1,
    title: "글자 단위 내어쓰기",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            marginLeft: "1.5em",
            textIndent: "-0.5em",
            lineHeight: "1.75em",
          },
          content: [
            {
              type: "text",
              text: "내어쓰기는 첫 줄을 유지하고 다음 줄을 오른쪽으로 이동합니다. ".repeat(
                12,
              ),
            },
          ],
        },
      ],
    },
  };
  await page.locator("#file-input").setInputFiles({
    name: "내어쓰기.forhan",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  /**
   * Measure real wrapped text positions in the zoomed editing canvas.
   *
   * A DOM range reports each actual line rather than inferring geometry from
   * the generated CSS declarations or native serializer implementation.
   * @returns {{origin:number;first:number;second:number;zoom:number}} Physical line starts and view scale.
   * @example
   * // Continuation lines start half a character to the right of the first line.
   */
  function measureLines(): {
    origin: number;
    first: number;
    second: number;
    zoom: number;
  } {
    /** Paragraph text range covering enough content to wrap across several lines. */
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(".tiptap p")!);
    /** Actual line rectangles, unaffected by serializer-side expected values. */
    const lines = range.getClientRects();
    /** Continuation text starts below the first line, excluding collapsed whitespace rectangles. */
    let second = lines[0];
    for (/** Actual text fragment inspected for the next rendered line. */ const line of lines)
      if (line.top > lines[0].top + 1 && line.width > 0) {
        second = line;
        break;
      }
    return {
      origin: document.querySelector(".tiptap")!.getBoundingClientRect().left,
      first: lines[0].left,
      second: second.left,
      zoom: Number(getComputedStyle(document.querySelector("#paper")!).zoom),
    };
  }
  /** Observed text geometry in the actual editor, including its current zoom. */
  const positions = await page.evaluate(measureLines);
  expect((positions.first - positions.origin) / positions.zoom).toBeCloseTo(
    10,
    1,
  );
  expect((positions.second - positions.origin) / positions.zoom).toBeCloseTo(
    13.3333,
    1,
  );
  await page.locator('button[data-native-tab="format"]').click();
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(page.locator('[name="textIndent"]')).toHaveValue("2.5");
  await expect(page.getByLabel("줄 간격 방식")).toHaveValue("FIXED");
  await expect(page.locator('[name="line"]')).toHaveValue("8.8");
  await page.locator('[name="marginTop"]').fill("3.25");
  await page.locator('[data-modal-value="apply"]').click();
  for (/** Native formats must retain character units after an unrelated point-valued edit. */ const format of [
    "hwp",
    "hwpx",
  ]) {
    /** Actual browser-native export download. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator(`[data-export="${format}"]`).click();
    /** Downloaded serialized document. */
    const download = await pending;
    /** Actual encoded bytes reconstructed through the independent format reader. */
    const bytes = await readFile((await download.path())!);
    /** Parsed native paragraph with explicit physical/character geometry. */
    const parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
    expect(parsed.doc.content?.[0]?.attrs?.marginLeft).toBe("1.5em");
    expect(parsed.doc.content?.[0]?.attrs?.textIndent).toBe("-0.5em");
    expect(parsed.doc.content?.[0]?.attrs?.lineHeight).toBe("1.75em");
    expect(
      Number(
        paragraphLengthPoints(
          parsed.doc.content?.[0]?.attrs?.marginTop,
        ).toFixed(2),
      ),
    ).toBe(3.25);
  }
  /** Standard HTML geometry has a different negative-indent origin than native paragraphs. */
  const html =
    '<p style="margin-left:12pt;text-indent:-18pt">표준 HTML 내어쓰기</p>';
  await page.locator("#file-input").setInputFiles({
    name: "표준 내어쓰기.html",
    mimeType: "text/html",
    buffer: Buffer.from(html),
  });
  await expect(page.locator(".tiptap p")).toHaveCSS("margin-left", "16px");
  await expect(page.locator(".tiptap p")).toHaveCSS("text-indent", "-24px");
  await page
    .locator('.native-ribbon [data-native-action="paragraph-format"]')
    .click();
  await expect(page.locator('[name="marginLeft"]')).toHaveValue("-6.0");
  await expect(page.locator('[name="textIndent"]')).toHaveValue("18.0");
  await page.locator('[data-modal-value="apply"]').click();
  await expect(page.locator(".tiptap p")).toHaveCSS("margin-left", "16px");
}
test(
  "native hanging line starts and relative units survive editing and standard HTML import",
  verifyHangingGeometryAndRelativeUnits,
);

/**
 * Download the application's actual serialized file through its export menu.
 *
 * Registering before the click observes the real browser download rather than
 * calling a serializer directly or reconstructing output from editor markup.
 * @async
 * @param {Page} page - Owned browser editor page.
 * @param {string} format - Available native or HTML export format.
 * @returns {Promise<Buffer>} Actual completed file bytes.
 * @throws {Error} If exporting or reading the downloaded file fails.
 * @example
 * const html = await paragraphExport(page, 'html');
 */
async function paragraphExport(page: Page, format: string): Promise<Buffer> {
  /** Download listener belongs to this export only. */
  const pending = page.waitForEvent("download");
  await page.locator("#export-menu-toggle").click();
  await page.locator(`[data-export="${format}"]`).click();
  /** Completed download retains the application's real serializer output. */
  const download = await pending;
  return readFile((await download.path())!);
}

/**
 * Keep nominal native CHAR geometry independent of text size and HTML CSS em.
 *
 * Installed-native captures establish CHAR 150 as 7.5pt at both 10pt and 20pt.
 * Real native inputs, computed editor layout, quick edits, undo, HTML reimport
 * and native downloads exercise that distinction through public UI controls.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser regression bindings.
 * @returns {Promise<void>} Resolves after geometry and source-unit retention checks.
 * @throws {Error} If text size scales a native distance or HTML loses its original unit.
 * @example
 * // Both 10pt and 20pt native text retain the same 7.5pt fixed line height.
 */
async function verifyNominalCharacterSpacing({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  for (/** Independently observed native font sizes must not scale paragraph CHAR units. */ const size of [
    10, 20,
  ]) {
    for (/** Both native formats must feed the same physical browser geometry. */ const format of [
      "hwp",
      "hwpx",
    ]) {
      /** Native attributes retain their established model spelling and explicit font size. */
      const payload = {
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: {
                marginLeft: "1.5em",
                textIndent: "-0.5em",
                lineHeight: "1.5em",
                marginTop: "0.5em",
                marginBottom: "1.5em",
                marginRight: "0.5em",
              },
              content: [
                {
                  type: "text",
                  text: "글자 단위의 한글 ABC",
                  marks: [
                    { type: "textStyle", attrs: { fontSize: `${size}pt` } },
                  ],
                },
                { type: "hardBreak" },
                {
                  type: "text",
                  text: "둘째 줄의 간격",
                  marks: [
                    { type: "textStyle", attrs: { fontSize: `${size}pt` } },
                  ],
                },
              ],
            },
          ],
        },
      };
      /** Real native source bytes are imported by the application. */
      const input =
        format === "hwp" ? writeHwp(payload) : await writeHwpx(payload);
      await page.locator("#file-input").setInputFiles({
        name: `글자 단위 ${size}.${format}`,
        mimeType: "application/octet-stream",
        buffer: Buffer.from(input),
      });
      await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "10px");
      await expect(page.locator(".tiptap p")).toHaveCSS(
        "margin-left",
        "13.3333px",
      );
      await expect(page.locator(".tiptap p")).toHaveCSS(
        "text-indent",
        "-3.33333px",
      );
      await expect(page.locator(".tiptap p")).toHaveCSS(
        "margin-top",
        "3.33333px",
      );
      await expect(page.locator("#line-height")).toHaveValue("7.5");
      await page
        .getByRole("button", { name: "줄 간격 늘리기", exact: true })
        .click();
      await expect(page.locator("#line-height")).toHaveValue("8.0");
      await expect(page.locator(".tiptap p")).toHaveCSS(
        "line-height",
        "10.6667px",
      );
      await page.keyboard.press("ControlOrMeta+z");
      await expect(page.locator("#line-height")).toHaveValue("7.5");
      /** HTML has physical CSS plus explicit ownership metadata for native reimport. */
      const html = await paragraphExport(page, "html");
      expect(html.toString()).toContain(
        'data-forhan-native-line-height="1.5em"',
      );
      await page.locator("#file-input").setInputFiles({
        name: "글자 단위 재입력.html",
        mimeType: "text/html",
        buffer: html,
      });
      await expect(page.locator(".tiptap p")).toHaveCSS("line-height", "10px");
      /** Native serialization after HTML reimport must keep source CHAR units, including undo. */
      const bytes = await paragraphExport(page, format),
        parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes);
      expect(parsed.doc.content?.[0]?.attrs).toMatchObject({
        marginLeft: "1.5em",
        textIndent: "-0.5em",
        lineHeight: "1.5em",
        marginTop: "0.5em",
        marginBottom: "1.5em",
        marginRight: "0.5em",
      });
    }
  }
}
test(
  "native CHAR spacing has fixed nominal geometry at 10pt and 20pt across HTML and native files",
  verifyNominalCharacterSpacing,
);

/**
 * Respect ordinary external CSS and visible edits over stale native markers.
 *
 * External em distances resolve against their real inline font cascade. Native
 * ownership metadata is useful only while it agrees with the physical style;
 * changing that CSS must change the later native file rather than hide edits.
 * @async
 * @param {PlaywrightTestArgs} context - Isolated browser regression bindings.
 * @returns {Promise<void>} Resolves after ordinary CSS and stale-marker native exports agree.
 * @throws {Error} If native metadata overrides actual externally edited geometry.
 * @example
 * // Ordinary HTML 1.5em at 20pt becomes 30pt, rather than native CHAR 150.
 */
async function verifyExternalParagraphUnits({
  page,
}: PlaywrightTestArgs): Promise<void> {
  await page.goto("/");
  for (/** Ordinary CSS and an externally edited native export must retain their own geometry. */ const [
    name,
    html,
    line,
    left,
    indent,
  ] of [
    [
      "external",
      '<div style="font-size:20pt"><p style="margin-left:1.5em;text-indent:-0.5em;line-height:1.5em">외부 HTML의 실제 글꼴 기준 간격</p></div>',
      30,
      20,
      -10,
    ],
    [
      "stale",
      '<p style="margin-left:22pt;text-indent:-2.5pt;line-height:25pt" data-forhan-native-margin-left="1.5em" data-forhan-native-text-indent="-0.5em" data-forhan-native-line-height="1.5em">외부에서 수정한 네이티브 HTML</p>',
      25,
      19.5,
      -2.5,
    ],
    [
      "rounded-native",
      '<p style="margin-left:calc(13.3333px);text-indent:-2.5pt;line-height:7.5pt" data-forhan-native-margin-left="1.5em" data-forhan-native-text-indent="-0.5em" data-forhan-native-line-height="1.5em">CSSOM이 반올림한 기존 포한 HTML</p>',
      7.5,
      7.5,
      -2.5,
    ],
  ] as const) {
    await page.locator("#file-input").setInputFiles({
      name: name + ".html",
      mimeType: "text/html",
      buffer: Buffer.from(html),
    });
    await expect(page.locator("#line-height")).toHaveValue(line.toFixed(1));
    for (/** Native output must describe the imported CSS, not the stale marker. */ const format of [
      "hwp",
      "hwpx",
    ]) {
      /** Independent native readers inspect actual downloaded bytes. */
      const bytes = await paragraphExport(page, format),
        parsed = format === "hwp" ? readHwp(bytes) : await readHwpx(bytes),
        attrs = parsed.doc.content![0].attrs!;
      expect(nativeParagraphLengthPoints(attrs.lineHeight)).toBeCloseTo(
        line,
        2,
      );
      expect(nativeParagraphLengthPoints(attrs.marginLeft)).toBeCloseTo(
        left,
        2,
      );
      expect(nativeParagraphLengthPoints(attrs.textIndent)).toBeCloseTo(
        indent,
        2,
      );
      if (name === "rounded-native")
        expect(attrs).toMatchObject({
          marginLeft: "1.5em",
          textIndent: "-0.5em",
          lineHeight: "1.5em",
        });
    }
  }
}
test(
  "external CSS em and stale native markers preserve actual geometry in both native formats",
  verifyExternalParagraphUnits,
);
