import TextAlign from "@tiptap/extension-text-align";
import {isActive,type CommandProps} from '@tiptap/core';
import {Plugin,type EditorState,type Transaction} from '@tiptap/pm/state';
import {closeHistory} from '@tiptap/pm/history';
import {
  PARAGRAPH_ALIGNMENTS,
  readParagraphAlignment,
  renderParagraphAlignment,
} from "../paragraph-alignment.ts";

/** One explicit native alignment gesture owns its own undo event independently of typing speed. */
const ALIGNMENT_HISTORY_BOUNDARY='forhan-native-alignment-history';

/** Native alignment uses distinct model values while retaining Tiptap's selection/history commands. */
export const NativeParagraphAlignment = TextAlign.extend({
  /**
   * Keep each explicit native alignment command in its own source undo event.
   *
   * Parent commands retain their actual selection and supported node types.
   * Identical alignment is a no-op; a real change closes the previous history
   * group and requests a boundary before subsequent ordinary source input.
   * @returns {object} Parent commands with discrete native alignment ownership.
   * @example
   * // Rapid justify then distribute can be undone once back to justify.
   */
  addCommands(){
    /** Original command factories retain the extension's configured source types and native modes. */
    const parent=this.parent?.();
    return{...parent,
      /**
       * Build one explicitly chosen native paragraph alignment command.
       *
       * The returned command retains all unrelated source marks and attributes.
       * @param {string} alignment - Requested independent native alignment mode.
       * @returns {import('@tiptap/core').Command} Source formatting command with one undo boundary.
       * @example
       * // setTextAlign('distribute') remains distinct from ordinary justification.
       */
      setTextAlign:(alignment:string)=>
        /**
         * Apply the actual source alignment with a discrete history boundary.
         *
         * Capability checks remain read-only and unchanged formatting creates
         * no source step or empty user-visible history event.
         * @param {CommandProps} props - Actual shared command transaction and editor context.
         * @returns {boolean} Whether the requested native source alignment is supported.
         * @example
         * // One subsequent undo restores the immediately preceding alignment.
         */
        (props:CommandProps):boolean=>{
          if(!this.options.alignments.includes(alignment)||!parent?.setTextAlign)return false;
          if(isActive(props.state,null,{textAlign:alignment}))return true;
          if(props.dispatch)closeHistory(props.tr).setMeta(ALIGNMENT_HISTORY_BOUNDARY,true);
          return parent.setTextAlign(alignment)(props);
        },
    };
  },
  /**
   * End an explicit alignment gesture before the next ordinary source edit.
   *
   * The appended transaction changes no document content and cannot itself
   * become an undo event. Typing immediately after formatting therefore owns
   * its own source history even within the normal typing-group delay.
   * @returns {Plugin[]} Parent plugins and one source-history boundary plugin.
   * @example
   * // Undoing newly typed X preserves the preceding alignment choice.
   */
  addProseMirrorPlugins(){
    return[...(this.parent?.()??[]),new Plugin({
      /**
       * Close only the history group explicitly requested by native alignment.
       *
       * Rendering and unrelated source transactions do not request boundaries.
       * The appended boundary has no request marker, preventing recursion.
       * @param {readonly Transaction[]} transactions - Newly applied original source transactions.
       * @param {EditorState} _previous - Source state before the current transaction batch.
       * @param {EditorState} state - Actual source after the accepted alignment command.
       * @returns {Transaction|null} Source-free history boundary or no appended transaction.
       * @example
       * // A native alignment and its following typed word remain two undo gestures.
       */
      appendTransaction(transactions:readonly Transaction[],_previous:EditorState,state:EditorState):Transaction|null{
        for(/** Only an actual accepted source-formatting command owns this history request. */const transaction of transactions)
          if(transaction.getMeta(ALIGNMENT_HISTORY_BOUNDARY))return closeHistory(state.tr).setMeta('addToHistory',false);
        return null;
      },
    })];
  },
  /**
   * Retain native alignment semantics in both live HTML and exported markup.
   *
   * Parent commands still update paragraph/heading attributes in one transaction.
   * Rendering resolves native distribution names to valid justification CSS.
   * @returns {object[]} Paragraph alignment attribute definitions.
   * @example
   * // Native DISTRIBUTE_SPACE remains split through HTML export and reimport.
   */
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            /**
             * Import real standard or native distribution alignment from HTML.
             *
             * A stale semantic marker never overrides externally edited CSS.
             * @param {HTMLElement} element - Parsed paragraph or heading.
             * @returns {string|null} Canonical native alignment or the configured default.
             * @example
             * // Inter-character last-line justification becomes distribute.
             */
            parseHTML: (element: HTMLElement) =>
              readParagraphAlignment(element) ?? this.options.defaultAlignment,
            /**
             * Render alignment without collapsing independent native distribution modes.
             *
             * Standard alignments explicitly clear inherited distribution properties.
             * @param {Record<string,unknown>} attrs - Live paragraph attributes.
             * @returns {Record<string,string>} Native semantic marker and actual browser CSS.
             * @example
             * // split expands word spaces on the final line.
             */
            renderHTML: (attrs: Record<string, unknown>) =>
              renderParagraphAlignment(attrs.textAlign),
          },
        },
      },
    ];
  },
  /**
   * Add installed-native alignment shortcuts alongside existing editor shortcuts.
   *
   * Shortcuts belong to the editor keymap, so typing in another control or a
   * modal cannot unexpectedly format the saved document selection.
   * @returns {Record<string,()=>boolean>} Native and inherited alignment shortcuts.
   * @example
   * // Ctrl/Command+Shift+T applies character distribution to selected paragraphs.
   */
  addKeyboardShortcuts() {
    /** Installed quick-control access keys follow visual order, not binary enum order. */
    const numberedAlignments = [
      "justify",
      "left",
      "center",
      "right",
      "distribute",
      "split",
    ];
    /** Numbered native shortcuts stay within the editor keymap's normal focus scope. */
    const numbered: Record<string, () => boolean> = {};
    for (/** Each observed Alt+number key applies the corresponding independent native alignment. */
    const [index, alignment] of numberedAlignments.entries()) {
      numbered[`Alt-${index + 1}`] =
        /**
         * Apply the numbered native quick-alignment command to the current selection.
         *
         * The normal editor transaction preserves text, marks and undo history.
         * Modal and toolbar input fields do not use this editor-only keymap.
         * @returns {boolean} Whether the native alignment command succeeds.
         * @example
         * // Alt+5 applies character distribution; Alt+6 applies word distribution.
         */
        () => this.editor.commands.setTextAlign(alignment);
    }
    return {
      ...this.parent?.(),
      ...numbered,
      /**
       * Apply native justify through one ordinary document transaction.
       *
       * The keymap owns editor focus and preserves the current selection.
       * @returns {boolean} Whether the alignment command succeeds.
       * @example
       * // Ctrl/Command+Shift+M applies ordinary justification.
       */
      "Mod-Shift-m": () => this.editor.commands.setTextAlign("justify"),
      /**
       * Apply the native center shortcut without changing text or marks.
       *
       * Other toolbar drafts and dialogs do not receive this editor-only keymap.
       * @returns {boolean} Whether the alignment command succeeds.
       * @example
       * // Ctrl/Command+Shift+C centers the active paragraph.
       */
      "Mod-Shift-c": () => this.editor.commands.setTextAlign("center"),
      /**
       * Apply native character distribution through the editor's normal history.
       *
       * Distribution remains distinct from ordinary justification on the last line.
       * @returns {boolean} Whether the alignment command succeeds.
       * @example
       * // Ctrl/Command+Shift+T stretches character gaps across every line.
       */
      "Mod-Shift-t": () => this.editor.commands.setTextAlign("distribute"),
    };
  },
}).configure({
  types: ["paragraph", "heading"],
  alignments: [...PARAGRAPH_ALIGNMENTS],
  defaultAlignment: "justify",
});
