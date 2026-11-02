import { Table, TableCell, TableHeader } from "@tiptap/extension-table";
import { Plugin, type Transaction, type EditorState } from "@tiptap/pm/state";
import { tableEditingKey } from "@tiptap/pm/tables";

/**
 * Keep original owning-cell widths while retaining ordinary table structure repair.
 *
 * Hangul permits different widths in cells that share a logical column. The
 * standard table plugin replaces those widths with a common column value.
 * Only that replacement is reversed; valid selection and structural repairs
 * retain their original implementation and transaction mapping.
 * @param {Plugin} plugin - Original editor table plugin with its existing key and event behavior.
 * @returns {Plugin} Equivalent plugin that preserves independently owned source widths.
 * @example
 * preserveNativeCellWidths(tablePlugin); // Keeps5669 above6122 in one column.
 */
export function preserveNativeCellWidths(plugin: Plugin): Plugin {
  if (plugin.spec.key !== tableEditingKey || !plugin.spec.appendTransaction)
    return plugin;
  /** The original repair and selection implementation remains the source of structural behavior. */
  const append = plugin.spec.appendTransaction;
  return new Plugin({
    ...plugin.spec,
    /**
     * Retain each structurally unchanged cell's original width after ordinary table repair.
     *
     * Mapped positions preserve actual source ownership when other repairs insert
     * cells. Repaired spans keep their repaired widths. A width-only reversal
     * produces no history entry or repeated normalization transaction.
     * @param {readonly Transaction[]} transactions - Original transactions awaiting table normalization.
     * @param {EditorState} oldState - State before those actual transactions.
     * @param {EditorState} state - Current source state with independently owned cell widths.
     * @returns {Transaction|null|undefined} Necessary structural/selection repair or no effective change.
     * @example
     * // Normalizing another row cannot replace an original first-cell width.
     */
    appendTransaction(
      transactions: readonly Transaction[],
      oldState: EditorState,
      state: EditorState,
    ) {
      /** Existing normalization still repairs malformed topology and genuine invalid selections. */
      const repaired = append.call(this, transactions, oldState, state);
      if (!repaired?.docChanged) return repaired;
      state.doc.descendants(
        /**
         * Restore only a real original cell's independently owned column measurements.
         *
         * New cells and altered spans remain governed by structural normalization.
         * @param {import('@tiptap/pm/model').Node} before - Actual source node before the repair.
         * @param {number} position - Its original document position.
         * @returns {void} Retains source measurements in the mapped owning cell.
         * @example
         * // An unrelated missing-cell repair must still add its real missing cell.
         */
        (before, position) => {
          if (
            before.type.spec.tableRole !== "cell" &&
            before.type.spec.tableRole !== "header_cell"
          )
            return;
          /** Only matching original cell structure can receive retained source width metadata. */
          const mapped = repaired.mapping.map(position),
            after = repaired.doc.nodeAt(mapped);
          if (
            !after ||
            after.type !== before.type ||
            after.attrs.colspan !== before.attrs.colspan ||
            after.attrs.rowspan !== before.attrs.rowspan ||
            !after.content.eq(before.content)
          )
            return;
          if (
            JSON.stringify(after.attrs.colwidth) !==
            JSON.stringify(before.attrs.colwidth)
          )
            repaired.setNodeMarkup(
              mapped,
              undefined,
              { ...after.attrs, colwidth: before.attrs.colwidth },
              after.marks,
            );
        },
      );
      return repaired.doc.eq(state.doc) &&
        repaired.selection.eq(state.selection)
        ? null
        : repaired;
    },
  });
}

/** Native table repair retains individual physical cell widths instead of imposing a shared source column width. */
export const NativeTable = Table.extend({
  /**
   * Keep table pointer, keyboard, paste, resize and selection plugins with native width ownership.
   *
   * Only the standard table normalization transaction is adapted. Column resize
   * commands continue to edit their explicitly selected logical column normally.
   * @returns {Plugin[]} Original table plugins with independent owning-cell widths preserved.
   * @example
   * // Ordinary native table commands retain their parent implementations.
   */
  addProseMirrorPlugins() {
    return (this.parent?.() ?? []).map(preserveNativeCellWidths);
  },
});

/**
 * Read an authored HTML column length without truncating fractional pixels.
 *
 * Physical units convert to CSS pixels; percentages remain unresolved rather
 * than becoming invented absolute widths in the imported document.
 * @param {string|null} value - Original authored HTML width.
 * @returns {number|null} Nonnegative physical CSS-pixel length or no resolved width.
 * @example
 * columnPixels('81.6266666667'); // 81.6266666667
 */
function columnPixels(value: string | null): number | null {
  /** Explicit zero remains a real native source distance instead of becoming an absent width. */
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px|pt|mm|cm|in)?\s*$/iu.exec(
      value ?? "",
    ),
    factors: Record<string, number> = {
      px: 1,
      pt: 96 / 72,
      mm: 96 / 25.4,
      cm: 960 / 25.4,
      in: 96,
    };
  if (!match) return null;
  /** Source numeric precision survives independently from browser layout rounding. */
  const width = Number(match[1]) * factors[(match[2] || "px").toLowerCase()];
  return Number.isFinite(width) && width >= 0 ? width : null;
}

/**
 * Locate a real cell's logical starting column across merged native HTML rows.
 *
 * Earlier row spans occupy logical slots even when the current DOM row omits
 * those cells. Nested tables do not contribute to the owning table's grid.
 * @param {HTMLTableElement} table - Actual owning imported table.
 * @param {HTMLElement} target - Actual imported cell or header.
 * @returns {number|null} Real logical starting column, if the target is owned.
 * @example
 * logicalCellColumn(table,cell); // Includes earlier row-spanning cells.
 */
function logicalCellColumn(
  table: HTMLTableElement,
  target: HTMLElement,
): number | null {
  /** Source row-span occupancy is independent from DOM child indices. */
  const occupied: number[] = [];
  for (let row = 0; row < table.rows.length; row++) {
    let column = 0;
    for (/** Only actual direct row cells participate in this table's logical grid. */ const cell of table
      .rows[row].cells) {
      while ((occupied[column] ?? 0) > row) column++;
      if (cell === target) return column;
      for (let offset = 0; offset < cell.colSpan; offset++)
        occupied[column + offset] = row + cell.rowSpan;
      column += cell.colSpan;
    }
  }
  return null;
}

/**
 * Import exact fractional column widths from actual HTML cell metadata or colgroups.
 *
 * The standard editor parser uses integer parsing. Native HWP units require
 * fractional pixels to survive copying and real HTML export/reimport.
 * @param {HTMLElement} element - Actual source cell or title cell.
 * @returns {number[]|null} Exact physical column widths or automatic sizing.
 * @example
 * readCellColumnWidths(cell); // Retains 6122/75 instead of 81 or 82 pixels.
 */
export function readCellColumnWidths(element: HTMLElement): number[] | null {
  /** Explicit standard cell metadata has precedence over an independently authored colgroup. */
  const source = element.getAttribute("colwidth");
  if (source) {
    /** Every column is validated independently without a permissive parseInt conversion. */
    const widths: number[] = [];
    for (/** Comma-separated native editor widths retain their original fractional precision. */ const item of source.split(
      ",",
    )) {
      /** Invalid standard HTML metadata falls back to automatic sizing. */
      const width = columnPixels(item);
      if (width === null) return null;
      widths.push(width);
    }
    return widths.length ? widths : null;
  }
  /** Original colgroup fallback follows logical columns instead of DOM cell indices. */
  const table = element.closest("table");
  if (!table) return null;
  /** Merged source cells need one physical width per occupied logical column. */
  const start = logicalCellColumn(table, element),
    columns: (number | null)[] = [],
    span = Number(element.getAttribute("colspan") || 1);
  if (start === null || !Number.isInteger(span) || span < 1) return null;
  for (/** Only the owning table's direct colgroups supply original source widths. */ const col of table.querySelectorAll<HTMLTableColElement>(
    ":scope > colgroup > col",
  )) {
    /** A source col span repeats its original width over the corresponding logical slots. */
    const width = columnPixels(col.style.width || col.getAttribute("width"));
    for (let offset = 0; offset < col.span; offset++) columns.push(width);
  }
  /** Incomplete or unresolved percentage widths remain automatic. */
  const widths: number[] = [];
  for (let column = start; column < start + span; column++) {
    if (columns[column] === null || columns[column] === undefined) return null;
    widths.push(columns[column]!);
  }
  return widths;
}

/** Ordinary cell behavior remains unchanged while its HTML width parser retains native physical precision. */
export const NativeTableCell = TableCell.extend({
  /**
   * Keep standard cell attributes while restoring exact original column widths.
   *
   * Existing merge, alignment, table roles and resizing commands retain their
   * original implementations; only lossy HTML numeric parsing is replaced.
   * @returns {Record<string,object>} Standard cell attributes with a precise column parser.
   * @example
   * // A fractional native column survives actual clipboard or HTML import.
   */
  addAttributes() {
    /** Parent definitions retain standard source defaults and serialization. */
    const inherited = this.parent?.() ?? {};
    return {
      ...inherited,
      colwidth: { ...inherited.colwidth, parseHTML: readCellColumnWidths },
    };
  },
});

/** Title cells retain the same exact column-width behavior as ordinary native cells. */
export const NativeTableHeader = TableHeader.extend({
  /**
   * Preserve standard title-cell behavior with precise native HTML column widths.
   *
   * Header semantics and structural merge attributes retain their parent
   * definitions independently from the physical width representation.
   * @returns {Record<string,object>} Standard title-cell attributes with a precise column parser.
   * @example
   * // A merged title cell keeps both unequal source column widths.
   */
  addAttributes() {
    /** Parent definitions remain the source of all independent cell behavior. */
    const inherited = this.parent?.() ?? {};
    return {
      ...inherited,
      colwidth: { ...inherited.colwidth, parseHTML: readCellColumnWidths },
    };
  },
});
