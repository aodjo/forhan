import type { JSONContent } from "@tiptap/core";
import { readFileSync } from "node:fs";
import type { NativeCellProperties } from "../../src/cell-properties.ts";

/** Exact original COM property names remain independent from the production neutral-cell decoder. */
export interface OriginalNativeCell {
  TextDirection: 0 | 1 | 2;
  LineWrap: 0 | 1 | 2;
  VertAlign: 0 | 1 | 2;
  HasMargin: number;
  MarginLeft: number;
  MarginRight: number;
  MarginTop: number;
  MarginBottom: number;
  Protected: number;
  Editable: number;
  Header: number;
  Width: number;
  Height: number;
}
/** Independently observed original copy results establish expected behavior rather than a copy of implementation logic. */
export const NATIVE_CELL_COPY_ORACLE = JSON.parse(
  readFileSync(
    new URL("../fixtures/native-cell-copy.json", import.meta.url),
    "utf8",
  ),
) as {
  rows: {
    source: { cell: OriginalNativeCell };
    before: { cell: OriginalNativeCell };
    after: { cell: OriginalNativeCell };
  }[];
  protectedSource: { cell: OriginalNativeCell; sourceCopyAccepted: boolean };
};

/** Independent original COM readings establish the native cell-only copy source, including a zero margin. */
export const SOURCE_PROPERTIES = observedCellProperties(
  NATIVE_CELL_COPY_ORACLE.rows[0].source.cell,
);
/** Independent original target flags deliberately differ from every copied source property. */
export const TARGET_PROPERTIES = observedCellProperties(
  NATIVE_CELL_COPY_ORACLE.rows[0].before.cell,
);
/** Cross-document target defaults must remain its own values when the source inherits table margins. */
export const TARGET_MARGINS = { left: 600, right: 700, top: 800, bottom: 900 };

/**
 * Express independently observed original COM values as literal neutral expectations.
 *
 * The production cell decoder is deliberately not used, so an incorrect native
 * property mapping cannot make the implementation and its expectations agree.
 * @param {OriginalNativeCell} cell - Actual original COM observation.
 * @returns {NativeCellProperties} Independent expected physical native source fields.
 * @example
 * observedCellProperties(NATIVE_CELL_COPY_ORACLE.rows[0].after.cell).hasMargin; // false
 */
export function observedCellProperties(
  cell: OriginalNativeCell,
): NativeCellProperties {
  return {
    textDirection: cell.TextDirection,
    lineWrap: cell.LineWrap,
    verticalAlign: cell.VertAlign,
    hasMargin: !!cell.HasMargin,
    margins: {
      left: cell.MarginLeft,
      right: cell.MarginRight,
      top: cell.MarginTop,
      bottom: cell.MarginBottom,
    },
    protected: !!cell.Protected,
    editable: !!cell.Editable,
  };
}

/**
 * Create an independently authored native cell source or destination document.
 *
 * Source and destination keep unrelated text, dimensions, fills and source IDs.
 * Explicit font appearance exposes accidental semantic-header browser styling.
 * @param {boolean} source - Whether to create the original source rather than the destination.
 * @returns {JSONContent} Independent valid source document with one actual table cell.
 * @example
 * const target=cellDocument(false);
 */
export function cellDocument(source: boolean): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: {
          sourceId: source ? "source-table" : "target-table",
          nativeCellMargins: source
            ? { left: 100, right: 200, top: 300, bottom: 400 }
            : TARGET_MARGINS,
        },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: source ? "tableHeader" : "tableCell",
                attrs: {
                  sourceId: source ? "source-cell" : "target-cell",
                  colspan: 1,
                  rowspan: 1,
                  colwidth: [source ? 120 : 240],
                  backgroundColor: source ? "#ffeecc" : "#112233",
                  nativeCellProperties: structuredClone(
                    source ? SOURCE_PROPERTIES : TARGET_PROPERTIES,
                  ),
                },
                content: [
                  {
                    type: "paragraph",
                    attrs: {
                      sourceId: source
                        ? "source-paragraph"
                        : "target-paragraph",
                      textAlign: source ? "right" : "left",
                      lineHeight: source ? "1.75" : "2",
                    },
                    content: [
                      {
                        type: "text",
                        text: source ? "원본 셀 ABC" : "대상 형식 유지 ABC",
                        marks: [
                          {
                            type: "textStyle",
                            attrs: {
                              fontSize: source ? "12pt" : "20pt",
                              color: source ? "#0000ff" : "#ff0000",
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
