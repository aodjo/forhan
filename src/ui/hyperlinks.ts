import { getMarkRange, type Editor } from "@tiptap/core";
import { isSafeDocumentLink } from "../documents";

/** Dialog action accepted by the document application's shared modal. */
interface LinkDialogAction {
  label: string;
  value: string;
  primary?: boolean;
}

/**
 * Request an explicit dialog choice from the document application.
 *
 * The host mounts the supplied controls synchronously and resolves after a
 * choice, allowing draft controls to be bound before document changes occur.
 * @param {string} title - Dialog caption.
 * @param {string} body - Independently authored dialog markup.
 * @param {LinkDialogAction[]} actions - Available explicit choices.
 * @returns {Promise<string>} Selected action or cancellation.
 * @example
 * const result = await showDialog('하이퍼링크', markup, actions);
 */
type ShowLinkDialog = (
  title: string,
  body: string,
  actions: LinkDialogAction[],
) => Promise<string>;

/**
 * Edit, insert or remove the hyperlink at the document selection.
 *
 * Retains mixed character formatting when its label is unchanged. An insertion
 * or label replacement is one undoable transaction; cancelling or rejecting an
 * unsafe destination leaves the original document unchanged.
 * @async
 * @param {Editor} editor - Active rich-text editor.
 * @param {ShowLinkDialog} showDialog - Application modal implementation.
 * @returns {Promise<void>} Resolves after an explicit edit or cancellation.
 * @example
 * await editHyperlink(editor, modal);
 */
export async function editHyperlink(
  editor: Editor,
  showDialog: ShowLinkDialog,
): Promise<void> {
  /** Selection captured before dialog focus can move the editor caret. */
  const selection = editor.state.selection;
  /** Existing link mark, if the caret lies in one. */
  const current = editor.getAttributes("link");
  /** Entire existing link range when editing from a collapsed caret. */
  const range = selection.empty
    ? getMarkRange(selection.$from, editor.schema.marks.link) || selection
    : selection;
  if (!current.href && range.from !== range.to) {
    for (/** Marks on the text at the start of an existing link range. */ const mark of editor.state.doc.nodeAt(
      range.from,
    )?.marks || [])
      if (mark.type.name === "link") Object.assign(current, mark.attrs);
  }
  /** Original display text used to avoid replacing mixed-format link contents. */
  const originalText = editor.state.doc.textBetween(range.from, range.to, "\n");
  /** Draft dialog choices, with removal available for an existing link. */
  const actions: LinkDialogAction[] = [{ label: "취소", value: "cancel" }];
  if (current.href) actions.push({ label: "연결 해제", value: "remove" });
  actions.push({ label: "설정", value: "apply", primary: true });
  /** Explicit dialog result; no document mutation occurs before it resolves. */
  const decision = showDialog(
    "하이퍼링크",
    '<form id="hyperlink-form" class="settings-grid"><label>표시할 문자열<input id="hyperlink-text" aria-label="표시할 문자열" maxlength="8192"></label><label>연결 대상<input id="hyperlink-target" aria-label="연결 대상" required maxlength="8192" spellcheck="false"></label></form>',
    actions,
  );
  /** Visible hyperlink label draft. */
  const text = document.querySelector<HTMLInputElement>("#hyperlink-text")!;
  /** Destination remains a literal string and is never followed by the dialog. */
  const target = document.querySelector<HTMLInputElement>("#hyperlink-target")!;
  text.value = originalText;
  target.value = String(current.href || "");
  /** Captured draft label, retained after the host removes its modal controls. */
  let label = text.value;
  /** Captured draft destination. */
  let href = target.value;
  /**
   * Capture and validate hyperlink fields without touching the document.
   *
   * Validation uses the same protocol rules as document import. Values are read
   * before modal dismissal and the shared form guard keeps invalid drafts open.
   * @returns {void} Updates the pending label, destination and validity state.
   * @example
   * capture(); // Records the current draft without inserting a link.
   */
  function capture(): void {
    label = text.value;
    href = target.value.trim();
    target.setCustomValidity(
      isSafeDocumentLink(href)
        ? ""
        : "웹 주소, 전자 우편 또는 문서 경로를 입력하세요.",
    );
  }
  document.querySelector("#hyperlink-form")!.addEventListener("input", capture);
  capture();
  target.focus();
  /** Explicit action selected before the dialog controls were removed. */
  const result = await decision;
  if (result === "remove") {
    editor
      .chain()
      .focus()
      .setTextSelection({ from: range.from, to: range.to })
      .unsetLink()
      .run();
    return;
  }
  if (result !== "apply" || !isSafeDocumentLink(href)) return;
  /** One undoable chain keeps label changes and destination edits together. */
  const chain = editor
    .chain()
    .focus()
    .setTextSelection({ from: range.from, to: range.to });
  if (originalText && label === originalText) chain.setLink({ href }).run();
  else {
    /** Existing character marks retained when the user replaces a link label. */
    const marks = [];
    for (/** Character mark at the original selection start. */ const mark of selection.$from.marks())
      if (mark.type.name !== "link") marks.push(mark.toJSON());
    marks.push({ type: "link", attrs: { href } });
    chain.insertContent({ type: "text", text: label || href, marks }).run();
  }
}

/**
 * Move to the preceding or following hyperlink, wrapping at document boundaries.
 *
 * Adjacent text nodes with the same destination form one navigation target even
 * when they have different fonts or emphasis. No destination is opened.
 * @param {Editor} editor - Active rich-text editor.
 * @param {boolean} backwards - Whether to select the preceding link.
 * @returns {boolean} Whether any hyperlink was available for navigation.
 * @example
 * navigateHyperlink(editor, false); // Selects the following link.
 */
export function navigateHyperlink(editor: Editor, backwards: boolean): boolean {
  /** Contiguous hyperlink ranges in document order. */
  const links: { from: number; to: number; href: string }[] = [];
  editor.state.doc.descendants(
    /**
     * Collect one marked text node into a complete hyperlink range.
     *
     * Merging adjacent equivalent marks avoids stopping at every bold or italic
     * segment within a single native link field.
     * @param {import('@tiptap/pm/model').Node} node - Current document node.
     * @param {number} position - Absolute node position.
     * @returns {void} Adds or extends a navigation range.
     * @example
     * // Two differently styled runs with the same href become one target.
     */
    (node, position) => {
      if (!node.isText) return;
      /** Link mark attached to this text run. */
      const mark = node.marks.find(
        /**
         * Identify the hyperlink mark on one text run.
         *
         * Other formatting marks remain untouched during navigation.
         * @param {import('@tiptap/pm/model').Mark} candidate - Inline mark.
         * @returns {boolean} Whether it represents a hyperlink.
         * @example
         * // A bold mark does not define a navigation target.
         */
        (candidate) => candidate.type.name === "link",
      );
      if (!mark) return;
      /** Last collected range, potentially adjacent to this text. */
      const last = links.at(-1);
      if (last?.to === position && last.href === mark.attrs.href)
        last.to += node.nodeSize;
      else
        links.push({
          from: position,
          to: position + node.nodeSize,
          href: mark.attrs.href,
        });
    },
  );
  if (!links.length) return false;
  /** Starting point of the current selection used for directional navigation. */
  const position = editor.state.selection.from;
  /** Next range in the chosen direction, wrapping only when necessary. */
  const next = backwards
    ? links.findLast(
        /**
         * Locate a preceding range in document order.
         *
         * The current range is excluded so repeated commands advance between links.
         * @param {{to: number}} link - Candidate range.
         * @returns {boolean} Whether it precedes the current selection.
         * @example
         * // A link starting before the caret is a backward navigation candidate.
         */
        (link) => link.to <= position,
      ) || links.at(-1)!
    : links.find(
        /**
         * Locate the next range in document order.
         *
         * Equal positions are excluded so a selected link advances to its successor.
         * @param {{from: number}} link - Candidate range.
         * @returns {boolean} Whether it follows the current selection.
         * @example
         * // A later link is selected without opening its destination.
         */
        (link) => link.from > position,
      ) || links[0];
  editor.chain().focus().setTextSelection(next).scrollIntoView().run();
  return true;
}
