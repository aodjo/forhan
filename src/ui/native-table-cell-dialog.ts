import type { Editor } from "@tiptap/core";
import type { NativeDialogMarkup } from "./native-dialogs.ts";
import type {
  TablePropertyContext,
  TablePropertyCell,
} from "./table-properties-editor.ts";
import { nativeCellProperties, nativeCellMargins } from "../cell-properties.ts";
import { nativeTableProperties } from "../table-properties.ts";
import { TableMap } from "@tiptap/pm/tables";
import {
  nativeColumnMeasurements,
  type NativeColumnMeasurement,
} from "../cell-geometry.ts";

/** Exact native measurements retain their integer source units behind rounded millimeter controls. */
export interface TableCellDialogValues {
  fields: Record<string, string | number | boolean>;
  mixed: string[];
  unknownField: boolean;
  tableWidth: number;
  tableHeight: number;
}

/**
 * Read actual cell fields and fitted dimensions for a native property draft.
 *
 * Visible fitted height remains distinct from the source minimum height. Widths
 * retain their exact native units behind the two-decimal millimeter display.
 * @param {Editor} editor - Actual owning source renderer.
 * @param {TablePropertyCell} selected - Exact immutable source cell.
 * @returns {Record<string,string|number|boolean>} Independent native control values.
 * @example
 * cellDialogFields(editor,context.cells[0]).vertical;
 */
function cellDialogFields(
  editor: Editor,
  selected: TablePropertyCell,
): Record<string, string | number | boolean> {
  /** Actual source metadata remains independent from the physical browser measurement. */
  const attrs = selected.node.attrs,
    properties = nativeCellProperties(attrs.nativeCellProperties),
    element = editor.view.nodeDOM(selected.position),
    style = element instanceof HTMLElement ? getComputedStyle(element) : null;
  let width = 0;
  for (/** Exact logical native widths are not rounded to whole screen pixels. */ const value of attrs.colwidth ??
    [])
    width += Number(value) * 75;
  return {
    hasMargin: properties.hasMargin,
    marginLeft: properties.margins.left,
    marginRight: properties.margins.right,
    marginTop: properties.margins.top,
    marginBottom: properties.margins.bottom,
    oneLine: properties.lineWrap !== 0,
    vertical: properties.textDirection !== 0,
    direction: properties.textDirection || 1,
    align: properties.verticalAlign,
    protected: properties.protected,
    editable: properties.editable,
    header: selected.node.type.name === "tableHeader",
    fieldName:
      typeof attrs.nativeCellFieldName === "string"
        ? attrs.nativeCellFieldName
        : "",
    width: Math.round(width || parseFloat(style?.width ?? "0") * 75),
    height:
      Math.round(parseFloat(style?.height ?? "0") * 75) ||
      Number(attrs.nativeCellHeight) ||
      0,
  };
}

/**
 * Snapshot independent source values for the measured four-tab native dialog.
 *
 * Mixed selected fields remain explicit and untouched until edited. Unknown
 * opaque native field names remain read-only while other cell properties work.
 * @param {Editor} editor - Actual owning source renderer.
 * @param {TablePropertyContext} context - Immutable original table and cell scope.
 * @returns {TableCellDialogValues} Independent source values, mixed fields and physical object measurements.
 * @example
 * const values=tableCellDialogValues(editor,context);
 */
export function tableCellDialogValues(
  editor: Editor,
  context: TablePropertyContext,
): TableCellDialogValues {
  /** Common table values and the actual first selected cell establish the representative draft. */
  const table = nativeTableProperties(
      context.table.attrs.nativeTableProperties,
    ),
    margins = nativeCellMargins(context.table.attrs.nativeCellMargins),
    fields = cellDialogFields(editor, context.cells[0]),
    mixed: string[] = [];
  let unknownField = false;
  for (/** Every selected original cell retains its independent untouched native fields. */ const selected of context.cells) {
    /** Only real selected source differences produce a mixed display state. */
    const next = cellDialogFields(editor, selected);
    for (/** Cell fields remain independent from common owning-table defaults. */ const key of Object.keys(
      fields,
    ))
      if (next[key] !== fields[key] && !mixed.includes(key)) mixed.push(key);
    if (
      selected.node.attrs.nativeCellFieldName === null &&
      selected.node.attrs.nativeCellFieldData
    )
      unknownField = true;
  }
  Object.assign(fields, {
    pageBreak: table.pageBreak,
    repeatHeader: table.repeatHeader,
    tableMarginLeft: margins.left,
    tableMarginRight: margins.right,
    tableMarginTop: margins.top,
    tableMarginBottom: margins.bottom,
    sizeApply: false,
  });
  /** Actual table geometry supplies display-only common object measurements. */
  const element = editor.view.nodeDOM(context.position),
    tableElement =
      element instanceof HTMLElement
        ? element.matches("table")
          ? element
          : element.querySelector("table")
        : null,
    style = tableElement ? getComputedStyle(tableElement) : null;
  /** Exact native column constraints exclude browser perimeter-border rounding. */
  const map = TableMap.get(context.table),
    measurements: NativeColumnMeasurement[] = [],
    seen = new Set<number>();
  for (/** Logical cell ownership supplies native source constraints across both merge directions. */ const offset of map.map) {
    if (seen.has(offset)) continue;
    seen.add(offset);
    /** Each actual original cell keeps either logical column widths or its older whole-span total. */
    const cell = context.table.nodeAt(offset)!,
      box = map.findCell(offset),
      widths = cell.attrs.colwidth as number[] | null,
      span = box.right - box.left;
    if (widths?.length === span) {
      for (let column = 0; column < span; column++)
        if (widths[column] > 0)
          measurements.push({
            column: box.left + column,
            span: 1,
            width: Math.round(widths[column] * 75),
          });
    } else if (widths?.length === 1 && widths[0] > 0)
      measurements.push({
        column: box.left,
        span,
        width: Math.round(widths[0] * 75),
      });
  }
  /** Only complete original source constraints can replace an actual fitted fallback measurement. */
  const columns = nativeColumnMeasurements(map.width, measurements);
  let tableWidth = table.cellSpacing * (map.width + 1),
    complete = true;
  for (/** Exact source units are summed before any millimeter display rounding. */ const width of columns) {
    tableWidth += width;
    if (width <= 0) complete = false;
  }
  /** Native size controls represent the current fitted logical allocation rather than an inconsistent raw owning-cell total. */
  const selectedBox = map.findCell(
    context.cells[0].position - context.position - 1,
  );
  let fittedWidth = 0;
  for (let column = selectedBox.left; column < selectedBox.right; column++)
    fittedWidth += columns[column] || 0;
  if (fittedWidth > 0) fields.width = Math.round(fittedWidth);
  for (/** Native explicit size application uses visible representative distances even when raw selected sizes differ. */ const name of [
    "width",
    "height",
  ]) {
    /** Native dimension drafts display their representative physical allocation rather than a mixed-value blank. */
    const index = mixed.indexOf(name);
    if (index >= 0) mixed.splice(index, 1);
  }
  return {
    fields,
    mixed,
    unknownField,
    tableWidth: complete
      ? tableWidth
      : Math.round(parseFloat(style?.width ?? "0") * 75),
    tableHeight: Math.round(parseFloat(style?.height ?? "0") * 75),
  };
}

/**
 * Escape literal source data before placing it in native dialog markup.
 *
 * Imported field names never become HTML or selector syntax.
 * @param {unknown} value - Literal authored source value.
 * @returns {string} Safe attribute or text content.
 * @example
 * tableDialogText('A&B'); // 'A&amp;B'
 */
function tableDialogText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Position one native control relative to the observed content-panel origin.
 *
 * Coordinates remain actual96-DPI original pixels without proportional scaling.
 * @param {number} left - Original complete-dialog horizontal coordinate.
 * @param {number} top - Original complete-dialog vertical coordinate.
 * @returns {string} Exact panel-relative inline position.
 * @example
 * tableDialogPosition(45,248);
 */
function tableDialogPosition(left: number, top: number): string {
  return `left:${left - 17}px;top:${top - 72}px`;
}

/**
 * Render an independent native checkbox with the captured caption and position.
 *
 * Mixed fields are marked for the binder's genuine indeterminate state.
 * @param {string} name - Fixed source property field.
 * @param {string} label - Original native caption.
 * @param {number} left - Original complete-dialog horizontal coordinate.
 * @param {number} top - Original complete-dialog vertical coordinate.
 * @param {TableCellDialogValues} values - Independent original source values.
 * @param {boolean} [disabled=false] - Whether source support is not yet available.
 * @returns {string} Accessible native checkbox markup.
 * @example
 * tableDialogCheck('protected','셀 보호',45,272,values);
 */
function tableDialogCheck(
  name: string,
  label: string,
  left: number,
  top: number,
  values: TableCellDialogValues,
  disabled = false,
): string {
  return `<label class="ntc-check" style="${tableDialogPosition(left, top)}"><input type="checkbox" name="${name}" ${values.fields[name] ? "checked" : ""} ${disabled ? "disabled" : ""} ${values.mixed.includes(name) ? 'data-mixed="true"' : ""}><span>${label}</span></label>`;
}

/**
 * Render one original physical-distance control while retaining native precision.
 *
 * The binder converts only explicit edits. Two-decimal display rounding cannot
 * overwrite an untouched source distance or a mixed selection's own values.
 * @param {string} name - Fixed independent source distance field.
 * @param {string} label - Original native numeric caption.
 * @param {number|null} value - Exact native units or an unavailable common-object value.
 * @param {number} left - Original caption horizontal coordinate.
 * @param {number} top - Original numeric-control vertical coordinate.
 * @param {boolean} [disabled=false] - Whether this field is initially unavailable.
 * @param {number} [captionWidth=39] - Original caption-to-input distance.
 * @param {boolean} [mixed=false] - Whether selected original values differ.
 * @returns {string} Original millimeter display and accessible step controls.
 * @example
 * tableDialogDistance('marginLeft','왼쪽',510,53,163,true,50);
 */
function tableDialogDistance(
  name: string,
  label: string,
  value: number | null,
  left: number,
  top: number,
  disabled = false,
  captionWidth = 39,
  mixed = false,
): string {
  /** Display units remain separate from each exact original native integer. */
  const display =
    value === null || mixed ? "" : ((value * 25.4) / 7200).toFixed(2);
  return `<label class="ntc-distance" style="${tableDialogPosition(left, top)};--ntc-caption-width:${captionWidth}px"><span>${label}</span><span class="ntc-number"><input type="text" inputmode="decimal" name="${name}" aria-label="${label}" value="${display}" placeholder="${mixed ? "혼합" : ""}" ${disabled ? "disabled" : ""}><span class="ntc-unit">mm</span><span class="ntc-steps"><button type="button" tabindex="-1" aria-label="${label} 증가" data-table-step="${name}" data-direction="1" ${disabled ? "disabled" : ""}>⌃</button><button type="button" tabindex="-1" aria-label="${label} 감소" data-table-step="${name}" data-direction="-1" ${disabled ? "disabled" : ""}>⌄</button></span></span></label>`;
}

/**
 * Render an observed native group separator without introducing a new box frame.
 *
 * Original group captions interrupt a single horizontal light-gray rule.
 * @param {string} label - Original native group caption.
 * @param {number} top - Original group caption vertical coordinate.
 * @returns {string} Exact native group separator markup.
 * @example
 * tableDialogGroup('속성',228);
 */
function tableDialogGroup(label: string, top: number): string {
  return `<div class="ntc-group" style="${tableDialogPosition(32, top)}"><span>${label}</span></div>`;
}

/**
 * Render measured native table page modes using their independently observed source values.
 *
 * The native captions and numeric modes are explicitly independent: 나눔 is2,
 * 셀 단위로 나눔 is1 and 나누지 않음 is0.
 * @param {TableCellDialogValues} values - Independent actual source values.
 * @returns {string} Three real native source choices with local vector icons.
 * @example
 * tableDialogPageModes(values);
 */
function tableDialogPageModes(values: TableCellDialogValues): string {
  let html = "";
  /** Original display order follows actual original UI actions and accepted native properties. */
  const modes = [
    { value: 2, label: "나눔" },
    { value: 1, label: "셀 단위로 나눔" },
    { value: 0, label: "나누지 않음" },
  ];
  for (let index = 0; index < modes.length; index++) {
    /** Native page diagrams are authored vectors rather than copied bitmap resources. */
    const mode = modes[index],
      rows =
        mode.value === 0
          ? '<path d="M12 25h18v10H12zM12 29h18M18 25v10M24 25v10"/>'
          : mode.value === 1
            ? '<path d="M12 10h18v10H12zM12 14h18M18 10v10M24 10v10M12 30h18v5H12zM18 30v5M24 30v5"/>'
            : '<path d="M12 9h18v10H12zM12 13h18M18 9v10M24 9v10M12 26h18v10H12zM12 30h18M18 26v10M24 26v10"/>';
    html += `<label class="ntc-page-choice" style="${tableDialogPosition(45 + index * 86, 140)}"><input type="radio" name="pageBreak" value="${mode.value}" ${values.fields.pageBreak === mode.value ? "checked" : ""}><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><path d="M7 7v30M36 7v30M4 23h36" stroke="#ccc" fill="none"/><g fill="none" stroke="#777" stroke-width=".8">${rows}</g><path d="M14 17h4M25 32h3" stroke="#356eff"/></svg><span>${mode.label}</span></label>`;
  }
  return html;
}

/**
 * Build the original measured four-tab table and cell properties window.
 *
 * Implemented source-backed controls remain separate from common positioning
 * and captions whose source model still needs implementation. Those controls
 * stay unavailable instead of accepting edits that would be discarded.
 * @param {TableCellDialogValues} values - Independent actual source draft.
 * @returns {NativeDialogMarkup}670-by715 native dialog layout with working independent property fields.
 * @example
 * renderNativeTableCellDialog(tableCellDialogValues(editor,context));
 */
export function renderNativeTableCellDialog(
  values: TableCellDialogValues,
): NativeDialogMarkup {
  /** Original tabs retain their literal observed order and complete-dialog positions. */
  const labels = ["기본", "여백/캡션", "표", "셀"],
    tabWidths = [43, 70, 32, 31];
  let tabs = "",
    left = 16;
  for (let index = 0; index < labels.length; index++) {
    tabs += `<button type="button" role="tab" id="ntc-tab-${index}" aria-controls="ntc-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-table-tab="${index}" style="width:${tabWidths[index]}px;left:${left - 1}px">${labels[index]}</button>`;
    left += tabWidths[index];
  }
  /** Common-object controls remain visibly unavailable until they have independent source representation. */
  const basic =
    tableDialogGroup("크기", 88) +
    tableDialogDistance(
      "objectWidth",
      "너비",
      values.tableWidth,
      45,
      109,
      true,
      184,
    ) +
    tableDialogDistance(
      "objectHeight",
      "높이",
      values.tableHeight,
      45,
      139,
      true,
      184,
    ) +
    tableDialogCheck("fixedSize", "크기 고정", 45, 170, values, true) +
    tableDialogGroup("위치", 198) +
    tableDialogCheck("treatAsChar", "글자처럼 취급", 45, 218, values, true) +
    `<span class="ntc-text" style="${tableDialogPosition(45, 248)}">본문과의 배치</span><div class="ntc-unavailable-wrap" style="${tableDialogPosition(45, 273)}"><button disabled>▤</button><button disabled>▤</button><button disabled>▤</button><button disabled>▤</button></div><label class="ntc-basic-position" style="${tableDialogPosition(45, 323)}">가로 <select disabled><option>단</option></select> 의 <select disabled><option>왼쪽</option></select> 기준 <input disabled> mm</label><label class="ntc-basic-position" style="${tableDialogPosition(45, 353)}">세로 <select disabled><option>문단</option></select> 의 <select disabled><option>위</option></select> 기준 <input disabled> mm</label>` +
    tableDialogCheck(
      "pageLimit",
      "쪽 영역 안으로 제한",
      45,
      386,
      values,
      true,
    ) +
    tableDialogCheck("overlap", "서로 겹침 허용", 45, 410, values, true) +
    tableDialogCheck(
      "anchor",
      "개체와 조판 부호를 항상 같은 쪽에 놓기",
      45,
      434,
      values,
      true,
    ) +
    tableDialogGroup("개체 회전 · 기울이기", 462) +
    tableDialogDistance("rotation", "회전각", null, 45, 484, true) +
    tableDialogDistance("skew", "가로", null, 313, 484, true) +
    tableDialogGroup("기타", 548) +
    `<label class="ntc-basic-position" style="${tableDialogPosition(45, 569)}">번호 종류 <select disabled><option>표</option></select></label>` +
    tableDialogCheck("objectProtected", "개체 보호하기", 45, 599, values, true);
  /** Captions and outer object margins are not invented from unrelated source-cell measurements. */
  const caption =
    tableDialogGroup("바깥 여백", 88) +
    tableDialogDistance("outerLeft", "왼쪽", null, 45, 109, true) +
    tableDialogDistance("outerTop", "위쪽", null, 195, 109, true) +
    tableDialogDistance("outerRight", "오른쪽", null, 45, 139, true) +
    tableDialogDistance("outerBottom", "아래쪽", null, 195, 139, true) +
    tableDialogGroup("캡션", 175) +
    `<div class="ntc-caption-grid" style="${tableDialogPosition(45, 195)}">${'<button type="button" disabled aria-label="캡션 위치">▯</button>'.repeat(9)}</div>` +
    tableDialogDistance("captionSize", "크기", null, 209, 195, true, 75) +
    tableDialogDistance(
      "captionGap",
      "개체와의 간격",
      null,
      209,
      225,
      true,
      75,
    ) +
    tableDialogCheck(
      "captionMargin",
      "여백 부분까지 너비 확대",
      209,
      258,
      values,
      true,
    ) +
    tableDialogCheck("captionLine", "한 줄로 입력", 209, 282, values, true);
  /** All original table page modes and every independent common inner margin are editable. */
  const table =
    tableDialogGroup("여러 쪽 지원", 88) +
    `<span class="ntc-text" style="${tableDialogPosition(45, 115)}">쪽 경계에서</span>` +
    tableDialogPageModes(values) +
    tableDialogCheck("repeatHeader", "제목 줄 자동 반복", 45, 210, values) +
    tableDialogCheck(
      "dividedBorder",
      "자동으로 나뉜 표의 경계선 설정",
      45,
      234,
      values,
      true,
    ) +
    `<div class="ntc-divider-controls" style="${tableDialogPosition(65, 255)}"><label>종류 <select disabled><option>────────</option></select></label><label>굵기 <select disabled><option>0.1mm ────</option></select></label><label>색 <button type="button" disabled aria-label="경계선 색"></button></label></div>` +
    tableDialogGroup("모든 셀의 안 여백", 352) +
    tableDialogDistance(
      "tableMarginLeft",
      "왼쪽",
      Number(values.fields.tableMarginLeft),
      45,
      373,
    ) +
    tableDialogDistance(
      "tableMarginTop",
      "위쪽",
      Number(values.fields.tableMarginTop),
      195,
      373,
    ) +
    tableDialogDistance(
      "tableMarginRight",
      "오른쪽",
      Number(values.fields.tableMarginRight),
      45,
      403,
    ) +
    tableDialogDistance(
      "tableMarginBottom",
      "아래쪽",
      Number(values.fields.tableMarginBottom),
      195,
      403,
    );
  let alignment = "",
    direction = "";
  for (let index = 0; index < 3; index++)
    alignment += `<label class="ntc-align" style="${tableDialogPosition(301 + index * 46, 278)}"><input type="radio" name="align" value="${index}" ${values.fields.align === index ? "checked" : ""}><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 1.5h21v21h-21z" fill="none" stroke="#999"/><path d="M4 ${5 + index * 5}h16m-16 3h16m-16 3h16" fill="none" stroke="#666"/></svg><span class="ntc-sr">${["위", "가운데", "아래"][index]}</span></label>`;
  for (let index = 1; index <= 2; index++)
    direction += `<label class="ntc-direction" style="${tableDialogPosition(65 + (index - 1) * 86, 341)}"><input type="radio" name="direction" value="${index}" ${values.fields.direction === index ? "checked" : ""} ${values.fields.vertical ? "" : "disabled"}><span class="ntc-direction-symbol">다${index === 1 ? "ᴬᴮᶜ" : "A B C"}</span><span>${index === 1 ? "영문 눕힘" : "영문 세움"}</span></label>`;
  /** Original native size application is opt-in and applies both visible dimensions to the real selected cells. */
  const cell =
    tableDialogCheck("sizeApply", "셀 크기 적용", 33, 88, values) +
    tableDialogDistance(
      "width",
      "너비",
      Number(values.fields.width),
      53,
      109,
      true,
      50,
      values.mixed.includes("width"),
    ) +
    tableDialogDistance(
      "height",
      "높이",
      Number(values.fields.height),
      214,
      109,
      true,
      50,
      values.mixed.includes("height"),
    ) +
    tableDialogCheck("hasMargin", "안 여백 지정", 33, 142, values) +
    tableDialogDistance(
      "marginLeft",
      "왼쪽",
      Number(values.fields.marginLeft),
      53,
      163,
      !values.fields.hasMargin,
      50,
      values.mixed.includes("marginLeft"),
    ) +
    tableDialogDistance(
      "marginTop",
      "위쪽",
      Number(values.fields.marginTop),
      214,
      163,
      !values.fields.hasMargin,
      50,
      values.mixed.includes("marginTop"),
    ) +
    tableDialogDistance(
      "marginRight",
      "오른쪽",
      Number(values.fields.marginRight),
      53,
      193,
      !values.fields.hasMargin,
      50,
      values.mixed.includes("marginRight"),
    ) +
    tableDialogDistance(
      "marginBottom",
      "아래쪽",
      Number(values.fields.marginBottom),
      214,
      193,
      !values.fields.hasMargin,
      50,
      values.mixed.includes("marginBottom"),
    ) +
    tableDialogGroup("속성", 228) +
    tableDialogCheck("oneLine", "한 줄로 입력", 45, 248, values) +
    tableDialogCheck("protected", "셀 보호", 45, 272, values) +
    tableDialogCheck("header", "제목 셀", 45, 296, values) +
    tableDialogCheck("vertical", "세로쓰기", 45, 320, values) +
    `<span class="ntc-text" style="${tableDialogPosition(301, 254)}">세로 정렬</span>` +
    alignment +
    direction +
    tableDialogGroup("필드", 420) +
    `<label class="ntc-field-label" style="${tableDialogPosition(45, 445)}">필드 이름<input name="fieldName" value="${tableDialogText(values.fields.fieldName)}" placeholder="${values.mixed.includes("fieldName") ? "혼합" : ""}" ${values.unknownField ? "readonly" : ""}></label>` +
    tableDialogCheck("editable", "양식 모드에서 편집 가능", 45, 499, values);
  /** Original common controls retain their measured header, action and footer positions. */
  const panels = [basic, caption, table, cell];
  let content = "";
  for (let index = 0; index < panels.length; index++)
    content += `<section class="ntc-panel" id="ntc-panel-${index}" role="tabpanel" aria-labelledby="ntc-tab-${index}" ${index === 0 ? "" : "hidden"}>${panels[index]}</section>`;
  return {
    width: 670,
    height: 715,
    className: "native-dialog native-dialog-table-cell",
    html: `<header class="modal-header"><h2 id="modal-title">표/셀 속성</h2><button type="button" class="ntc-quick-help" data-table-help aria-label="빠른 도움말">▤</button><button type="button" class="ntc-help" data-table-help aria-label="도움말">?</button><button type="button" class="modal-x" aria-label="닫기">×</button></header><nav class="ntc-tabs" role="tablist" aria-label="표/셀 속성 탭">${tabs}</nav><form id="native-table-cell-form">${content}</form><div class="modal-actions"><button type="button" class="nd-apply" data-modal-value="apply">설정(<u>D</u>)</button><button type="button" data-modal-value="cancel">취소</button></div><footer class="ntc-footer"><label>대화 상자 설정 <select aria-label="대화 상자 설정"><option>사용자 지정</option></select></label><button type="button" disabled>구성...</button></footer><p class="ntc-help-text" hidden>선택한 표와 셀의 속성을 설정합니다. 설정한 내용은 한 번에 되돌릴 수 있습니다.</p>`,
  };
}
