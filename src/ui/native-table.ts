import { nativeIcon } from "./native-icons";

/**
 * Render the measured native table insertion popup and accessible editing submenu.
 * The hidden numeric insertion controls retain the editor's existing validated command path.
 * @returns {string} Complete popup markup with a twelve by twelve selection grid.
 * @example renderNativeTableMenu()
 */
export function renderNativeTableMenu(): string {
  /** Individual cells of the native table size picker. */
  let cells = "";
  for (
    /** One-based row selected by this grid cell. */ let row = 1;
    row <= 12;
    row++
  )
    for (
      /** One-based column selected by this grid cell. */ let col = 1;
      col <= 12;
      col++
    )
      cells += `<button type="button" role="gridcell" data-table-row="${row}" data-table-col="${col}" aria-label="${row}행 ${col}열"></button>`;
  return `<div id="table-menu" class="dropdown table-menu native-table-menu" hidden><button type="button" class="nt-cancel">취소</button><div class="nt-grid" role="grid" aria-label="표 크기 선택">${cells}</div><div class="nt-commands"><button type="button" class="nt-create-dialog">${nativeIcon("table", 16)}<span>표 만들기(T)...</span><kbd>Ctrl+N,T</kbd></button><button type="button" class="nt-draw" disabled title="자유 그리기는 지원되지 않습니다">${nativeIcon("table", 16)}<span>표 그리기(W)</span></button><button type="button" class="nt-edit-toggle">${nativeIcon("clear-format", 16)}<span>표 지우개(D)</span></button><div class="nt-convert"><button type="button" disabled>문자열을 표로(L)...</button><button type="button" disabled>표를 문자열로(X)...</button></div></div><div class="nt-numeric" hidden><strong>표 만들기</strong><label>줄 수<input id="table-rows" type="number" min="1" max="30" value="3"></label><label>칸 수<input id="table-cols" type="number" min="1" max="12" value="3"></label><button type="button" id="table-create">만들기</button></div><div class="nt-edit" hidden><button type="button" data-table="addRowAfter">아래에 행 추가</button><button type="button" data-table="addColumnAfter">오른쪽에 열 추가</button><button type="button" data-table="mergeCells">셀 합치기</button><button type="button" data-table="splitCell">셀 나누기</button><button type="button" data-table="toggleHeaderRow">제목 행 켜기·끄기</button><button type="button" data-table="deleteRow">행 삭제</button><button type="button" data-table="deleteColumn">열 삭제</button><button type="button" data-table="deleteTable">표 삭제</button></div></div>`;
}

/**
 * Bind grid hover, keyboard selection and native table popup commands.
 * Grid insertion clicks the existing create button so all editor validation and undo behavior remains shared.
 * @returns {void} Installs interaction handlers on the rendered popup.
 * @example bindNativeTableMenu();
 */
export function bindNativeTableMenu(): void {
  /** Rendered native insertion popup. */
  const menu = document.querySelector<HTMLElement>("#table-menu");
  if (!menu) return;
  /** Native cancel label also displaying the hovered dimensions. */
  const caption = menu.querySelector<HTMLButtonElement>(".nt-cancel")!;
  /**
   * Highlight a rectangular table size in the native grid.
   * The dimension label follows the selection without inserting document content.
   * @param {number} rows Selected row count.
   * @param {number} cols Selected column count.
   * @returns {void} Updates preview cells and the native caption.
   * @example preview(3,4);
   */
  function preview(rows: number, cols: number): void {
    for (/** Cell participating in the selected rectangular region. */ const cell of menu!.querySelectorAll<HTMLElement>(
      "[data-table-row]",
    ))
      cell.classList.toggle(
        "selected",
        Number(cell.dataset.tableRow) <= rows &&
          Number(cell.dataset.tableCol) <= cols,
      );
    caption.textContent = rows && cols ? `${cols} × ${rows} 표` : "취소";
  }
  /**
   * Close the insertion popup without changing the document.
   * Existing keyboard and outside-click dismissal remain handled by the shell.
   * @returns {void} Hides the popup.
   * @example close();
   */
  function close(): void {
    menu!.hidden = true;
  }
  /**
   * Expose numeric table creation for dimensions beyond the visual grid.
   * The native grid stays visible while the compatible size controls appear alongside it.
   * @returns {void} Opens and focuses the numeric insertion controls.
   * @example showNumeric();
   */
  function showNumeric(): void {
    menu!.querySelector<HTMLElement>(".nt-numeric")!.hidden = false;
    menu!.querySelector<HTMLInputElement>("#table-rows")!.focus();
  }
  /**
   * Expose working table edit commands from the native eraser entry.
   * Row, column and table deletion remain explicit rather than emulating an unavailable drawing tool.
   * @returns {void} Toggles the compatible edit submenu.
   * @example showEditing();
   */
  function showEditing(): void {
    /** Existing command submenu. */ const edit =
      menu!.querySelector<HTMLElement>(".nt-edit")!;
    edit.hidden = !edit.hidden;
  }
  /**
   * Handle pointer and click interaction on a single table picker cell.
   * The selected row and column counts are forwarded through the existing hidden numeric controls.
   * @param {MouseEvent} event Pointer event targeting a grid cell or command.
   * @returns {void} Previews or inserts the selected table dimensions.
   * @example handleCell(event);
   */
  function handleCell(event: MouseEvent): void {
    /** Grid cell targeted by this pointer event. */
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-table-row]",
    );
    if (!cell) return;
    /** Requested row count. */
    const rows = Number(cell.dataset.tableRow);
    /** Requested column count. */
    const cols = Number(cell.dataset.tableCol);
    preview(rows, cols);
    if (event.type === "click") {
      menu!.querySelector<HTMLInputElement>("#table-rows")!.value =
        String(rows);
      menu!.querySelector<HTMLInputElement>("#table-cols")!.value =
        String(cols);
      menu!.querySelector<HTMLButtonElement>("#table-create")!.click();
    }
  }
  caption.onclick = close;
  menu
    .querySelector<HTMLElement>(".nt-grid")!
    .addEventListener("mouseover", handleCell);
  menu
    .querySelector<HTMLElement>(".nt-grid")!
    .addEventListener("click", handleCell);
  menu.querySelector<HTMLButtonElement>(".nt-create-dialog")!.onclick =
    showNumeric;
  menu.querySelector<HTMLButtonElement>(".nt-edit-toggle")!.onclick =
    showEditing;
}
