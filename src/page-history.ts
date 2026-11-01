import { Step, StepMap, StepResult } from "@tiptap/pm/transform";
import type { Node, Schema } from "@tiptap/pm/model";
import { validatePage } from "./documents.ts";
import type { PageSettings } from "./types.ts";

/** Physical page changes belong to native document history without introducing source characters. */
export class PageSettingsStep extends Step {
  /** Validated original physical settings retained for exact inversion. */
  readonly before: PageSettings;
  /** Validated replacement settings retained independently from the document text. */
  readonly after: PageSettings;

  /**
   * Capture one reversible document-level page configuration change.
   *
   * Native source units and optional zero grid axes remain independent from text.
   * Defensive copies prevent a later dialog draft from mutating history.
   * @param {PageSettings} before - Original validated document page settings.
   * @param {PageSettings} after - Newly accepted native page configuration.
   * @throws {Error|RangeError} If physical geometry or native grid source is malformed.
   * @example
   * const step=new PageSettingsStep(original,{...original,lineGrid:1600});
   */
  constructor(before: PageSettings, after: PageSettings) {
    super();
    this.before = validatePage({ ...before });
    this.after = validatePage({ ...after });
  }

  /**
   * Retain original text while the companion page-state plugin applies this change.
   *
   * A real history step records metadata without inserting invisible characters.
   * @param {Node} doc - Actual unchanged original source document.
   * @returns {StepResult} Successful source-preserving transform result.
   * @example
   * step.apply(doc).doc === doc; // true.
   */
  apply(doc: Node): StepResult { return StepResult.ok(doc); }

  /**
   * Invert the accepted page configuration for a single native undo.
   *
   * Original optional grid axes and manuscript preference return with the page.
   * @returns {PageSettingsStep} Independent exact inverse of this configuration change.
   * @example
   * step.invert().after.lineGrid; // Restores the preceding original interval.
   */
  invert(): PageSettingsStep { return new PageSettingsStep(this.after, this.before); }

  /**
   * Preserve source positions because page settings never add document characters.
   *
   * Selection, text edits and native layout decorations keep their original offsets.
   * @returns {StepMap} Empty source-position map for this document-level change.
   * @example
   * step.getMap().map(12); // 12.
   */
  getMap(): StepMap { return StepMap.empty; }

  /**
   * Keep a page configuration change across unrelated source-position remapping.
   *
   * Its data belongs to the document as a whole rather than a removable text range.
   * @returns {PageSettingsStep} This immutable source-independent step.
   * @example
   * step.map(); // The page does not disappear when nearby text is edited.
   */
  map(): PageSettingsStep { return this; }

  /**
   * Serialize original and accepted page settings with the registered step identity.
   *
   * History serialization remains separate from all native document file writers.
   * @returns {{stepType:string;before:PageSettings;after:PageSettings}} Validated reversible configuration data.
   * @example
   * step.toJSON().stepType; // 'forhanPageSettings'.
   */
  toJSON(): { stepType: string; before: PageSettings; after: PageSettings } {
    return { stepType: "forhanPageSettings", before: { ...this.before }, after: { ...this.after } };
  }

  /**
   * Restore one registered native page-history step from validated source data.
   *
   * The text schema stays independent while physical page validation rejects
   * malformed or unrepresentable geometry and native grid values.
   * @param {Schema} _schema - Owning document schema retained by the transform API.
   * @param {Record<string,unknown>} json - Original serialized step data.
   * @returns {PageSettingsStep} Independent validated reversible configuration.
   * @throws {Error|RangeError} If either original configuration is malformed.
   * @example
   * PageSettingsStep.fromJSON(schema,step.toJSON());
   */
  static fromJSON(_schema: Schema, json: Record<string, unknown>): PageSettingsStep {
    if (!json.before || !json.after || typeof json.before !== "object" || typeof json.after !== "object")
      throw new RangeError("Page history requires both original configurations.");
    return new PageSettingsStep(json.before as PageSettings, json.after as PageSettings);
  }
}

Step.jsonID("forhanPageSettings", PageSettingsStep);
