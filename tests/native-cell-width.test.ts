import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema, type Node as SourceNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { tableEditing, tableNodes, TableMap } from "@tiptap/pm/tables";
import { preserveNativeCellWidths } from "../src/ui/native-cell-geometry.ts";

/** Minimal real editor table roles isolate source ownership from browser paint and file encoders. */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
    ...tableNodes({
      tableGroup: "block",
      cellContent: "paragraph+",
      cellAttributes: {},
    }),
  },
});

/**
 * Create original independent cell widths with an optional real missing-cell defect.
 *
 * Literal5669 and6122 units come from independently observed original Hangul
 * resize output. Each cell keeps distinct content for source ownership checks.
 * @param {boolean} [missing=false] - Whether the second row omits its last cell.
 * @returns {SourceNode} Actual editor source document with independent physical widths.
 * @example
 * independentWidthDocument(); // A is5669 units and C below it is6122 units.
 */
function independentWidthDocument(missing = false): SourceNode {
  /** Independently authored row content does not use the production repair result as its fixture. */
  const rows = [];
  for (let row = 0; row < 2; row++) {
    /** Distinct source cells must survive any unrelated topology repair. */
    const cells = [];
    for (let column = 0; column < (row === 1 && missing ? 1 : 2); column++)
      cells.push({
        type: "table_cell",
        attrs: { colwidth: [(row === 0 && column === 0 ? 5669 : 6122) / 75] },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: String.fromCharCode(65 + row * 2 + column),
              },
            ],
          },
        ],
      });
    rows.push({ type: "table_row", content: cells });
  }
  return schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "table", content: rows }],
  });
}

/**
 * Import actual source through the ordinary editor transaction and table plugin.
 *
 * Any repair comes from the real plugin's appended transaction. The caller
 * inspects its final source rather than manufacturing normalized expectations.
 * @param {SourceNode} doc - Independently authored source to import.
 * @returns {EditorState} Final editor state after all real append transactions.
 * @example
 * importedWidthState(independentWidthDocument(true)); // Repairs the real missing cell.
 */
function importedWidthState(doc: SourceNode): EditorState {
  /** Original table normalization remains installed with the native owning-width adaptation. */
  const initial = EditorState.create({
    schema,
    plugins: [preserveNativeCellWidths(tableEditing())],
  });
  return initial.applyTransaction(
    initial.tr.replaceWith(0, initial.doc.content.size, doc.content),
  ).state;
}

/**
 * Keep original differing source widths through real editor import normalization.
 *
 * A genuine native resized cell cannot be replaced by its unselected neighbor.
 * @returns {void} Completes source width and authored content assertions.
 * @throws {Error} If real normalization changes original owning-cell measurements.
 * @example
 * // A5669-unit cell can remain directly above a6122-unit cell.
 */
function verifyIndependentWidthNormalization(): void {
  /** The original literal source remains the independent expected document. */
  const original = independentWidthDocument(),
    state = importedWidthState(original);
  assert.deepEqual(state.doc.toJSON(), original.toJSON());
}

/**
 * Retain genuine missing-cell repair alongside independently sized source cells.
 *
 * Disabling all table repair would preserve widths while leaving invalid table
 * structure. This verifies that the actual missing cell is still inserted.
 * @returns {void} Completes valid topology and original source-owner assertions.
 * @throws {Error} If a required repair or an unrelated original width is lost.
 * @example
 * // A missing D is repaired while A and C keep their distinct physical widths.
 */
function verifyStructuralWidthRepair(): void {
  /** The real final table must contain its missing logical grid slot. */
  const state = importedWidthState(independentWidthDocument(true)),
    table = state.doc.firstChild!,
    map = TableMap.get(table);
  assert.equal(map.width, 2);
  assert.equal(map.height, 2);
  assert.equal(table.child(1).childCount, 2);
  assert.equal(table.child(0).child(0).textContent, "A");
  assert.equal(table.child(1).child(0).textContent, "C");
  assert.equal(
    Math.round(table.child(0).child(0).attrs.colwidth[0] * 75),
    5669,
  );
  assert.equal(
    Math.round(table.child(1).child(0).attrs.colwidth[0] * 75),
    6122,
  );
  assert.ok(
    !(map.problems ?? []).some(
      /**
       * Recognize only genuine topology defects after the actual repair.
       *
       * Differing original widths are valid native source and remain independent.
       * @param {{type:string}} problem - Actual original table-map observation.
       * @returns {boolean} Whether a structural defect remains unrepaired.
       * @example
       * // Missing cells must be repaired even when original widths differ.
       */
      (problem) => problem.type !== "colwidth mismatch",
    ),
  );
}

/**
 * Preserve an intentional real cell-width edit through appended normalization.
 *
 * The native adapter must preserve the current accepted source transaction,
 * allowing ordinary editor resize commands to change their intended cells.
 * @returns {void} Completes changed-owner and untouched-neighbor assertions.
 * @throws {Error} If an intended width is reverted or copied onto another cell.
 * @example
 * // Editing A to5000 units cannot change C below it.
 */
function verifyExplicitWidthEdit(): void {
  /** A real markup transaction edits only the first original source cell. */
  const state = importedWidthState(independentWidthDocument()),
    cell = state.doc.nodeAt(2)!,
    edited = state.applyTransaction(
      state.tr.setNodeMarkup(2, undefined, {
        ...cell.attrs,
        colwidth: [5000 / 75],
      }),
    ).state,
    table = edited.doc.firstChild!;
  assert.equal(
    Math.round(table.child(0).child(0).attrs.colwidth[0] * 75),
    5000,
  );
  assert.equal(
    Math.round(table.child(1).child(0).attrs.colwidth[0] * 75),
    6122,
  );
}

test(
  "native editor normalization retains independent owning-cell widths",
  verifyIndependentWidthNormalization,
);
test(
  "native editor still repairs missing cells without changing original widths",
  verifyStructuralWidthRepair,
);
test(
  "native editor retains intentional selected-cell resizing without changing neighbors",
  verifyExplicitWidthEdit,
);
