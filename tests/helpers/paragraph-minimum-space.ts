/** Controlled literal source observed in the original installed Hangul COM navigation matrix. */
export const MINIMUM_SPACE_SOURCE =
  "ALPHA beta gamma delta epsilon zeta eta theta iota kappa";

/** Native source-relative soft-line ends, after excluding the document's sixteen-unit section prefix. */
export const MINIMUM_SPACE_CASES: ReadonlyArray<{
  right: number;
  fontSpace: boolean;
  condense: number;
  ends: readonly number[];
}> = [
  { right: 60000, fontSpace: false, condense: 0, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: false, condense: 25, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: false, condense: 50, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: false, condense: 75, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: true, condense: 0, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: true, condense: 25, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: true, condense: 50, ends: [11, 23, 40, 56] },
  { right: 60000, fontSpace: true, condense: 75, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: false, condense: 0, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: false, condense: 25, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: false, condense: 50, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: false, condense: 75, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: true, condense: 0, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: true, condense: 25, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: true, condense: 50, ends: [11, 23, 40, 56] },
  { right: 57000, fontSpace: true, condense: 75, ends: [17, 36, 56] },
  { right: 54000, fontSpace: false, condense: 0, ends: [17, 36, 56] },
  { right: 54000, fontSpace: false, condense: 25, ends: [17, 36, 56] },
  { right: 54000, fontSpace: false, condense: 50, ends: [17, 40, 56] },
  { right: 54000, fontSpace: false, condense: 75, ends: [17, 40, 56] },
  { right: 54000, fontSpace: true, condense: 0, ends: [17, 40, 56] },
  { right: 54000, fontSpace: true, condense: 25, ends: [17, 40, 56] },
  { right: 54000, fontSpace: true, condense: 50, ends: [17, 40, 56] },
  { right: 54000, fontSpace: true, condense: 75, ends: [17, 40, 56] },
];

/**
 * Resolve literal native source line membership from independently observed offsets.
 *
 * The original installed Hwp.exe SHA-256 is
 * 0d72eb8aba393d2eded01c3f16a2015e5a7125cd229adc373a0e7d1210d6c5d5.
 * Native navigation observed both left and justified alignments at Arial 16pt.
 * Expected source boundaries do not come from the editor's layout algorithm.
 * @param {{ends:readonly number[]}} condition - Literal original source-relative line ends.
 * @returns {string[]} Independently observed complete source words per visual line.
 * @example
 * nativeMinimumSpaceLines(MINIMUM_SPACE_CASES[15]); // A 25% minimum pulls gamma onto line one.
 */
export function nativeMinimumSpaceLines(condition: {
  ends: readonly number[];
}): string[] {
  /** Source slices keep the original native word boundaries without comparing hanging edge blanks. */
  const lines: string[] = [];
  let from = 0;
  for (/** Literal native offsets already exclude the original document's section-control prefix. */ const to of condition.ends) {
    lines.push(MINIMUM_SPACE_SOURCE.slice(from, to).trimEnd());
    from = to;
  }
  return lines;
}

/**
 * Build controlled native source for the actual browser and desktop application.
 *
 * Explicit Arial 16pt source keeps font selection independent from native
 * half-em versus intrinsic ASCII spaces. Paragraph right margin uses original
 * native COM units converted to physical points without changing paper width.
 * @param {{right:number;fontSpace:boolean;condense:number}} condition - Original native source condition.
 * @param {string} [align='left'] - Independent native paragraph alignment.
 * @param {number} [reduction=condition.condense] - Initial source reduction before an explicit dialog edit.
 * @returns {{application:'forhan';version:1;doc:import('@tiptap/core').JSONContent}} Controlled portable source payload.
 * @example
 * minimumSpaceDocument(MINIMUM_SPACE_CASES[15],'justify',0); // Real dialog editing can then set 25%.
 */
export function minimumSpaceDocument(
  condition: { right: number; fontSpace: boolean; condense: number },
  align = "left",
  reduction = condition.condense,
): {
  application: "forhan";
  version: 1;
  doc: import("@tiptap/core").JSONContent;
} {
  return {
    application: "forhan",
    version: 1,
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            nativeParagraphCondense: reduction,
            nativeBreakLatinWord: 0,
            nativeBreakNonLatinWord: 0,
            textAlign: align,
            marginRight: condition.right / 200 + "pt",
            lineHeight: "1.6",
          },
          content: [
            {
              type: "text",
              text: MINIMUM_SPACE_SOURCE,
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontFamily: "Arial",
                    fontSize: "16pt",
                    nativeUseFontSpace: condition.fontSpace,
                    nativeUseKerning: false,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
