import type { JSONContent } from "@tiptap/core";
import type { PageSettings } from "./types";
import {sectionGridSettings} from './section-grid.ts';
/**
 * Create independent A4 page settings.
 *
 * Each new document receives its own millimetre-based geometry object and margins.
 * @returns {PageSettings} Fresh A4 page settings with independent margin values.
 * @example
 * defaultPage().width // 210
 */
export const defaultPage = (): PageSettings => ({
  width: 210,
  height: 297,
  marginTop: 20,
  marginBottom: 15,
  marginLeft: 30,
  marginRight: 30,
  header: 15,
  footer: 15,
});
/**
 * Create a text node for a document template.
 *
 * Optional marks remain attached to the authored template text.
 * @param {string} s Text to encode in the template or escape for application markup.
 * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }[] | undefined} marks Optional editor marks to attach to the authored text.
 * @returns {JSONContent} Text node retaining the optional authored marks.
 * @example
 * text("Example").text // "Example"
 */
const text = (s: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: s,
  ...(marks ? { marks } : {}),
});
/**
 * Create a template paragraph.
 *
 * Empty text produces a valid empty paragraph instead of an invalid empty text node.
 * @param {string} s Text to encode in the template or escape for application markup.
 * @returns {JSONContent} Paragraph node containing the authored text or no inline content.
 * @example
 * p("").content?.length // 0
 */
const p = (s: string): JSONContent => ({
  type: "paragraph",
  content: s ? [text(s)] : [],
});
/**
 * Create a template heading.
 *
 * Heading levels are retained for outline navigation and document export.
 * @param {string} s Text to encode in the template or escape for application markup.
 * @param {number} level Heading level to retain in the starter document.
 * @returns {JSONContent} Heading node carrying the authored text and requested level.
 * @example
 * h("Title", 2).attrs?.level // 2
 */
const h = (s: string, level = 1): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [text(s)],
});
/**
 * Create a template table cell.
 *
 * Header and ordinary cells share valid default spans and an editable paragraph.
 * @param {string} s Text to encode in the template or escape for application markup.
 * @param {boolean} header Whether the starter table cell uses the header-cell node.
 * @returns {JSONContent} Editable table cell with valid spans and an initial paragraph.
 * @example
 * cell("Column", true).type // "tableHeader"
 */
const cell = (s: string, header = false): JSONContent => ({
  type: header ? "tableHeader" : "tableCell",
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [p(s)],
});
/** Independently authored starter documents for the local editor. */
export const templates: Record<string, { title: string; doc: JSONContent }> = {
  welcome: {
    title: "포한에 오신 것을 환영합니다",
    doc: {
      type: "doc",
      content: [
        h("한글이 없어도,\n문서는 이어집니다."),
        p(
          "포한은 누구나 자신의 문서를 열고, 쓰고, 나눌 수 있도록 만드는 문서 편집기입니다.",
        ),
        h("내 문서를 여는 첫걸음", 2),
        p(
          "왼쪽의 문서 열기를 누르거나 HWP·HWPX 파일을 이 창으로 끌어오세요. 계정이나 인터넷 연결 없이, 내 컴퓨터에서 작업합니다.",
        ),
        h("익숙하게 쓰고, 자유롭게 나누세요", 2),
        {
          type: "bulletList",
          content: [
            "글자와 문단 서식을 바꾸고, 표와 그림을 넣으세요.",
            "포한 문서로 저장하면 편집 내용과 가져온 원본이 함께 보관됩니다.",
            "HWPX로 저장하거나 PDF로 내보내 문서를 전달하세요.",
          ].map(
            /**
             * Construct an editable list item or report row.
             *
             * Independently authored starter text is wrapped in the document nodes needed by the template.
             * @param {string} s Text to encode in the template or escape for application markup.
             * @returns {{ type: string; content: JSONContent[]; }} Editor content or control data constructed for the operation described above.
             * @example
             * templateCallback(item) // A valid list item or report row.
             */
            (s) => ({ type: "listItem", content: [p(s)] }),
          ),
        },
        h("함께 만드는 포한", 2),
        p(
          "이 문서는 자유롭게 편집할 수 있습니다. 새 문서에서 여러분의 이야기를 시작해 보세요.",
        ),
        p("한글이 없는 사람들을 위한 한글, 포한."),
      ],
    },
  },
  blank: { title: "빈 문서 1", doc: { type: "doc", content: [p("")] } },
  report: {
    title: "업무 보고서",
    doc: {
      type: "doc",
      content: [
        h("업무 보고서"),
        p("작성일:          작성자:          소속:"),
        h("1. 보고 개요", 2),
        p("보고의 목적과 핵심 내용을 작성하세요."),
        h("2. 주요 진행 사항", 2),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                cell("항목", true),
                cell("진행 내용", true),
                cell("상태", true),
              ],
            },
            ...[1, 2, 3].map(
              /**
               * Construct an editable list item or report row.
               *
               * Independently authored starter text is wrapped in the document nodes needed by the template.
               * @param {number} i One-based report row number rendered in the starter table.
               * @returns {{ type: string; content: JSONContent[]; }} Editor content or control data constructed for the operation described above.
               * @example
               * templateCallback(item) // A valid list item or report row.
               */
              (i) => ({
                type: "tableRow",
                content: [cell(String(i)), cell(""), cell("진행 중")],
              }),
            ),
          ],
        },
        h("3. 다음 계획", 2),
        p("향후 일정과 필요한 의사결정을 작성하세요."),
      ],
    },
  },
  letter: {
    title: "안내문",
    doc: {
      type: "doc",
      content: [
        h("안내드립니다"),
        p("수신:          발신:          날짜:"),
        p("안녕하세요."),
        p("전달할 내용을 여기에 작성하세요."),
        h("주요 안내 사항", 2),
        {
          type: "orderedList",
          content: ["일정 및 장소", "참여 방법", "문의처"].map(
            /**
             * Construct an editable list item or report row.
             *
             * Independently authored starter text is wrapped in the document nodes needed by the template.
             * @param {string} s Text to encode in the template or escape for application markup.
             * @returns {{ type: string; content: JSONContent[]; }} Editor content or control data constructed for the operation described above.
             * @example
             * templateCallback(item) // A valid list item or report row.
             */
            (s) => ({
              type: "listItem",
              content: [p(s)],
            }),
          ),
        },
        p("감사합니다."),
      ],
    },
  },
};
/**
 * Validate an imported editor document tree.
 *
 * Node count, nesting and embedded-image rules are checked before the active editor accepts the document.
 * @param {JSONContent} value Imported editor document tree to validate before editing.
 * @returns {JSONContent} The same document tree after structural and image-source validation.
 * @throws {Error} If the document is malformed, excessively complex or references external images.
 * @example
 * validateDocument({ type: "doc", content: [{ type: "paragraph" }] }).type // "doc"
 */
export function validateDocument(value: JSONContent): JSONContent {
  if (!value || value.type !== "doc" || !Array.isArray(value.content))
    throw new Error("문서 내용이 올바르지 않습니다.");
  /** Number of document nodes visited by the complexity guard. */
  let nodes = 0;
  /**
   * Check one imported document node.
   *
   * The recursive guard counts descendants, enforces depth bounds and rejects externally loaded images.
   * @param {JSONContent} n Document node being validated for size, depth and embedded images.
   * @param {number} depth Current document-tree depth used by the complexity guard.
   * @returns {void} Completes this editor update without returning a value.
   * @throws {Error} If a node is malformed, exceeds complexity limits or references an external image.
   * @example
   * walk({ type: "paragraph" }, 0) // Accepts a valid paragraph.
   */
  function walk(n: JSONContent, depth: number): void {
    if (++nodes > 200000 || depth > 80)
      throw new Error("문서 구조가 너무 복잡합니다.");
    if (!n || typeof n.type !== "string")
      throw new Error("올바르지 않은 문서 개체입니다.");
    if (
      n.type === "image" &&
      !/^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(n.attrs?.src || "")
    )
      throw new Error("문서의 외부 이미지 주소는 허용하지 않습니다.");
    /** Inline marks examined before hyperlinks enter the editable document tree. */
    for (const mark of n.marks || []) {
      if (mark.type === 'link' && !isSafeDocumentLink(mark.attrs?.href)) {
        throw new Error('실행 가능한 스크립트나 올바르지 않은 링크가 문서에 포함되어 있습니다.');
      }
    }
    for (/** Current child entry from the surrounding control, layout or document iteration. */
    const child of n.content || [])
      walk(child, depth + 1);
  }
  walk(value, 0);
  return value;
}

/**
 * Validate a document hyperlink without fetching or following its destination.
 *
 * Common web, mail, phone, file and relative document references remain portable,
 * while executable URL schemes and control characters are rejected before rendering.
 *
 * @param {unknown} value - The hyperlink destination supplied by an imported mark.
 * @returns {boolean} Whether the destination uses a supported non-script URL scheme.
 * @example
 * isSafeDocumentLink('https://example.com/report'); // true
 * isSafeDocumentLink('javascript:alert(1)'); // false
 */
export function isSafeDocumentLink(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    /** Parsed URL used only for protocol inspection; no network request is performed. */
    const target = new URL(value.trim(), 'https://forhan.invalid/');
    return ['http:', 'https:', 'mailto:', 'tel:', 'file:', 'ftp:'].includes(target.protocol);
  } catch { return false; }
}
/**
 * Validate document page geometry.
 *
 * Default dimensions fill omitted fields, while invalid measurements or margins that remove the text area are rejected.
 * @param {Partial<PageSettings> | undefined} value Optional page geometry overrides to validate.
 * @returns {PageSettings} Complete validated page dimensions and margins.
 * @throws {Error} If page measurements are invalid or margins leave insufficient text area.
 * @example
 * validatePage({ width: 210, height: 297 }).width // 210
 */
export function validatePage(value?: Partial<PageSettings>): PageSettings {
  /** Complete candidate page settings after applying the supplied overrides. */
  const out = { ...defaultPage(), ...value };
  Object.assign(out,sectionGridSettings(out));
  if (value && value.header === undefined) out.header = 0;
  if (value && value.footer === undefined) out.footer = 0;
  for (/** Current key entry from the surrounding control, layout or document iteration. */
  const key of ["width","height","marginTop","marginBottom","marginLeft","marginRight","header","footer"] as const)
    if (!Number.isFinite(out[key] ?? 0) || (out[key] ?? 0) < 0 || (out[key] ?? 0) > 1200)
      throw new Error("용지 설정이 올바르지 않습니다.");
  if (
    out.width < 50 ||
    out.height < 50 ||
    out.marginLeft + out.marginRight >= out.width - 20 ||
    out.marginTop + (out.header ?? 0) + out.marginBottom + (out.footer ?? 0) >= out.height - 20
  )
    throw new Error("본문을 넣을 수 있도록 용지 크기와 여백을 조정하세요.");
  return out;
}
