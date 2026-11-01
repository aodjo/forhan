import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { PageSettingsStep } from "../page-history.ts";
import type { PageSettings } from "../types.ts";

/** Native page history has separate source state without modifying document attributes or characters. */
export const pageHistoryKey = new PluginKey<PageSettings | null>("forhan-page-settings");
/** Accepted native page changes are applied only after their actual history transaction commits. */
export const NativePageHistory = Extension.create<{ onChange?: (page: PageSettings) => void }>({
  name: "nativePageHistory",
  /**
   * Install source-preserving page state and its owned view notification.
   *
   * Opening a different document initializes empty state. Only real page steps,
   * including their history inverses, notify the owning application after commit.
   * @returns {Plugin[]} One independent native page-history observer.
   * @example
   * // NativePageHistory.configure({onChange:applyAcceptedPage}) retains one-step undo.
   */
  addProseMirrorPlugins() {
    /** The application callback belongs to this actual configured editor instance. */
    const changed = this.options.onChange;
    return [new Plugin<PageSettings | null>({
      key: pageHistoryKey,
      state: {
        /**
         * Start a new source document without carrying another document's page history.
         *
         * Existing page source is loaded independently by the application.
         * @returns {null} Empty page-step state for the new owning document.
         * @example
         * // Importing a new file cannot undo an older file's page configuration.
         */
        init() { return null; },
        /**
         * Retain the last committed page configuration from an actual history step.
         *
         * Ordinary text edits and drawing transactions leave page source untouched.
         * @param {import('@tiptap/pm/state').Transaction} transaction - Actual committed source transaction.
         * @param {PageSettings|null} previous - Prior page-step source, when present.
         * @returns {PageSettings|null} Newly accepted page source or the unchanged state.
         * @example
         * // An undo transaction contains the exact inverse PageSettingsStep.
         */
        apply(transaction, previous) {
          for (/** Only registered real page steps carry new document-level physical source. */ const step of transaction.steps)
            if (step instanceof PageSettingsStep) previous = step.after;
          return previous;
        },
      },
      /**
       * Observe accepted page history after the owning editor view commits.
       *
       * No callback runs for empty initialization or an unrelated source edit.
       * @returns {{update:(view:import('@tiptap/pm/view').EditorView,previous:import('@tiptap/pm/state').EditorState)=>void}} Owned page-change observer.
       * @example
       * // A cancelled dialog has no page step and produces no notification.
       */
      view() {
        return {
          /**
           * Notify the owner after an actual accepted page configuration changes.
           *
           * The callback updates physical paper layout without dispatching another edit.
           * @param {import('@tiptap/pm/view').EditorView} view - Actual owning committed editor view.
           * @param {import('@tiptap/pm/state').EditorState} previous - Prior immutable editor state.
           * @returns {void} Applies only a changed nonempty page-step source.
           * @example
           * // Redo restores the accepted native grid interval and original paper geometry.
           */
          update(view, previous) {
            /** State identity keeps layout-only updates from replaying a page edit. */
            const page = pageHistoryKey.getState(view.state);
            if (page && page !== pageHistoryKey.getState(previous)) changed?.({ ...page });
          },
        };
      },
    })];
  },
});
