import { renderNativeScroll } from "./native-scroll.ts";
import { renderNativeTableMenu } from "./native-table";
import { renderNativeFindPane } from "./native-find";
import { nativeIcon } from "./native-icons";
import { MIN_FONT_SIZE, MAX_STORED_FONT_SIZE } from "../formatting";
import {
  getRibbonGroups,
  getRibbonItems,
  nativeFileMenu,
  nativeFileMenuGeometry,
  nativeRibbonGalleries,
  nativeTabs,
  type RibbonItem,
} from "./native-tabs";

/** HTML entities used when document titles and captured labels enter shell markup. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Existing editor control identifiers retained on the corresponding native ribbon commands. */
const PRIMARY_RIBBON_IDS: Readonly<Record<string, string>> = {
  table: "insert-table",
  image: "insert-image",
  "page-settings": "page-settings",
  find: "find-toggle",
};

/**
 * Escape a value before inserting it into native shell HTML.
 *
 * Captured command labels and user-controlled document titles remain literal
 * text in both element content and quoted accessibility attributes.
 *
 * @param {unknown} value - Text or a scalar value to include in shell markup.
 * @returns {string} HTML-escaped text safe for content and quoted attributes.
 * @example
 * escapeMarkup('<document>');
 */
function escapeMarkup(value: unknown): string {
  let output = "";
  for (/** The current character inspected for an HTML-sensitive representation. */ const character of String(
    value ?? "",
  ))
    output += HTML_ENTITIES[character] || character;
  return output;
}

/**
 * Render a measured native ribbon control.
 *
 * Supports large commands, compact icon controls, field selectors, checkbox
 * toggles and gallery tiles while preserving the captured absolute bounds.
 *
 * @param {RibbonItem} item - The measured native command and its logical action.
 * @param {string} id - An existing editor control identifier, when this command owns one.
 * @param {number} originX - The containing coordinate origin relative to the reference window.
 * @param {number} originY - The containing coordinate origin relative to the native ribbon.
 * @returns {string} Positioned button markup retaining native label and control semantics.
 * @example
 * renderRibbonItem(item, 'insert-table', 1, 0);
 */
function renderRibbonItem(
  item: RibbonItem,
  id = "",
  originX = 1,
  originY = 0,
): string {
  /** Captured label and access-key text shown by the native command tooltip. */
  const title =
    (item.action === "font" && item.size === "field" ? "글꼴" : item.tooltip) ||
    `${item.label}${item.shortcut ? ` : ${item.shortcut}` : ""}`;
  /** Whether the measured control displays its label beside or beneath its icon. */
  const showLabel =
    item.showLabel ??
    (item.size !== "icon" && (item.size !== "compact" || item.width > 45));
  /** Native control state and geometry encoded without adding implementation details to its label. */
  const attributes = `${id ? ` id="${escapeMarkup(id)}"` : ""} data-native-action="${escapeMarkup(item.action)}" data-native-control="${escapeMarkup(item.id)}" title="${escapeMarkup(title)}" aria-label="${escapeMarkup(item.action === "font" ? "글꼴" : item.label)}" style="left:${item.x - originX}px;top:${item.y - originY}px;width:${item.width}px;height:${item.height}px"${item.disabled ? " disabled" : ""}${item.selected ? ' aria-pressed="true"' : ""}`;
  /** The independent native-style glyph sized to the measured control class. */
  const icon = nativeIcon(item.icon, item.size === "large" ? 24 : 16);
  if (item.size === "toggle")
    return `<button${attributes} class="native-ribbon-button native-ribbon-toggle${item.selected ? " active" : ""}" role="checkbox" aria-checked="${Boolean(item.selected)}"><span class="native-check-box" aria-hidden="true">${item.selected ? "✓" : ""}</span><span>${escapeMarkup(item.label)}</span></button>`;
  if (item.size === "field") {
    if (item.action === "font")
      return `<select${attributes} class="native-ribbon-button native-ribbon-field native-ribbon-font"><option value="함초롬바탕">함초롬바탕</option></select><span class="native-ribbon-font-tt" style="left:${item.x - originX + 4}px;top:${item.y - originY + 5}px" aria-hidden="true">TT</span>`;
    if (item.action === "font-size")
      return `<input${attributes} class="native-ribbon-button native-ribbon-field native-ribbon-font-size" type="number" min="${MIN_FONT_SIZE}" max="${MAX_STORED_FONT_SIZE}" step="0.01" value="10.0"><span class="native-ribbon-unit" style="left:${item.x - originX + item.width - 45}px;top:${item.y - originY + 4}px" aria-hidden="true">pt</span><button type="button" tabindex="-1" class="native-font-size-step" data-native-action="font-size-up" aria-label="글자 크기 키우기" style="left:${item.x - originX + item.width - 14}px;top:${item.y - originY + 1}px;height:${(item.height - 2) / 2}px">⌃</button><button type="button" tabindex="-1" class="native-font-size-step" data-native-action="font-size-down" aria-label="글자 크기 줄이기" style="left:${item.x - originX + item.width - 14}px;top:${item.y - originY + item.height / 2}px;height:${(item.height - 2) / 2}px">⌄</button>`;
    return `<button${attributes} class="native-ribbon-button native-ribbon-field" role="combobox" aria-expanded="false"><span class="native-field-value">${escapeMarkup(item.value || item.label)}</span><span class="native-small-chevron">${nativeIcon("chevron-down", 12)}</span></button>`;
  }
  return `<button${attributes} class="native-ribbon-button native-ribbon-${item.size || "large"}${item.selected ? " active" : ""}${item.gallery ? ` native-gallery-${item.gallery}` : ""}${showLabel ? " native-has-label" : ""}"><span class="native-ribbon-glyph">${icon}</span>${showLabel ? `<span class="native-ribbon-label">${escapeMarkup(item.label)}</span>` : ""}${item.hasDropdown ? `<span class="native-ribbon-chevron">${nativeIcon("chevron-down", 11)}</span>` : ""}</button>`;
}

/**
 * Render the inner contents of a measured native ribbon tab.
 *
 * Preserves independent shape/style gallery viewports and native separator
 * positions. Hidden compatibility buttons keep existing editor selectors
 * available when their commands are absent from the selected ribbon.
 *
 * @param {string} tab - The selected stable tab identifier or its visible Korean label.
 * @returns {string} Inner markup for the persistent native-ribbon container.
 * @example
 * ribbon.innerHTML = renderNativeRibbon('input');
 */
export function renderNativeRibbon(tab: string): string {
  /** The selected native tab identifier, with the default ribbon retained behind an initial File popup. */
  const selected = tab === "파일" || tab === "file" ? "edit" : tab;
  let tabId = selected;
  for (/** The captured native tab used to resolve a visible Korean tab label. */ const candidate of nativeTabs)
    if (candidate.label === selected) tabId = candidate.id;
  /** The measured commands, viewport definitions and identity assignments for this ribbon render. */
  const items = getRibbonItems(tabId),
    galleries = nativeRibbonGalleries[tabId] || [],
    assigned = new Set<string>();
  let output = `<div class="native-ribbon-content" data-ribbon-tab="${escapeMarkup(tabId)}" role="toolbar" aria-label="${escapeMarkup(selected)} 도구">`;
  for (/** The measured command cluster whose preceding gap contains a native separator line. */ const group of getRibbonGroups(
    tabId,
  ).slice(1))
    output += `<span class="native-ribbon-separator" style="left:${group.x - 8}px" aria-hidden="true"></span>`;
  for (/** The shape or style viewport clipped to its captured native gallery bounds. */ const gallery of galleries) {
    output += `<div class="native-ribbon-gallery native-ribbon-gallery-${gallery.kind}" style="left:${gallery.x - 1}px;top:${gallery.y}px;width:${gallery.width}px;height:${gallery.height}px">`;
    for (/** The native tile or gallery scroll control rendered inside this viewport. */ const item of items) {
      if (
        item.gallery !== gallery.kind &&
        !(gallery.kind === "shapes"
          ? item.action.startsWith("shape-gallery-")
          : item.action.startsWith("style-gallery-"))
      )
        continue;
      output += renderRibbonItem(item, "", gallery.x + 1, gallery.y + 1);
    }
    output += "</div>";
  }
  for (/** The measured native command placed outside gallery clipping viewports. */ const item of items) {
    if (
      item.gallery ||
      item.action.startsWith("shape-gallery-") ||
      item.action.startsWith("style-gallery-")
    )
      continue;
    /** The existing editor identifier assigned only once when multiple native commands share an action. */
    const id =
      PRIMARY_RIBBON_IDS[item.action] &&
      !assigned.has(PRIMARY_RIBBON_IDS[item.action])
        ? PRIMARY_RIBBON_IDS[item.action]
        : "";
    if (id) assigned.add(id);
    output += renderRibbonItem(
      item.action === "portrait" && tabId === "edit"
        ? { ...item, selected: true }
        : item,
      id,
    );
  }
  for (/** The existing primary command retained as a hidden selector when it has no visible ribbon control. */ const action of Object.keys(
    PRIMARY_RIBBON_IDS,
  )) {
    /** The stable legacy selector for the current logical native action. */
    const id = PRIMARY_RIBBON_IDS[action];
    if (!assigned.has(id))
      output += `<button id="${id}" data-native-action="${action}" hidden aria-label="${escapeMarkup(action)}"></button>`;
  }
  return output + "</div>";
}

/**
 * Render the inner markings of the native horizontal document ruler.
 *
 * Places centimetre zero at the physical left text margin, displays unsigned
 * distances before that origin and marks both text-area margins independently.
 * Percentage positioning lets the persistent ruler follow the current zoom.
 *
 * @param {number} width - The physical paper width in millimetres.
 * @param {number} left - The physical left text margin in millimetres.
 * @param {number} right - The physical right text margin in millimetres.
 * @returns {string} Inner ruler markup for the existing ruler element.
 * @example
 * ruler.innerHTML = renderNativeRuler(210, 30, 30);
 */
export function renderNativeRuler(width = 210, left = 30, right = 30): string {
  /** Finite physical ruler measurements used to keep label and margin positions bounded. */
  const paperWidth = Number.isFinite(width) && width > 0 ? width : 210,
    leftMargin = Number.isFinite(left)
      ? Math.max(0, Math.min(left, paperWidth))
      : 30,
    rightMargin = Number.isFinite(right)
      ? Math.max(0, Math.min(right, paperWidth))
      : 30;
  let output = `<div class="native-ruler-margin native-ruler-margin-left" style="width:${(leftMargin / paperWidth) * 100}%"></div><div class="native-ruler-margin native-ruler-margin-right" style="width:${(rightMargin / paperWidth) * 100}%"></div><div class="native-ruler-ticks" style="--ruler-mm:${100 / paperWidth}%"></div>`;
  for (
    let centimetre = -Math.ceil(leftMargin / 10);
    centimetre <= Math.floor((paperWidth - leftMargin) / 10);
    centimetre++
  ) {
    /** The physical paper coordinate of a label relative to the native text-area origin. */
    const millimetres = leftMargin + centimetre * 10;
    if (millimetres < 0 || millimetres > paperWidth) continue;
    output += `<span class="native-ruler-number" style="left:${(millimetres / paperWidth) * 100}%">${Math.abs(centimetre)}</span>`;
  }
  return (
    output +
    `<span class="native-indent-marker" style="left:${(leftMargin / paperWidth) * 100}%"><svg viewBox="0 0 11 26" aria-hidden="true" focusable="false"><path d="M0.5 1.5H8.5V5.5L4.5 10.5L0.5 5.5Z M4.5 11.5L-0.5 15.5V16.5H0.5V18.5H8.5V16.5H9.5V15.5Z M0.5 18.5H8.5V23.5H0.5Z" fill="white" stroke="#7f7f7f" stroke-width="1" shape-rendering="crispEdges"/></svg></span><span class="native-right-margin-marker" style="left:${((paperWidth - rightMargin) / paperWidth) * 100}%"></span>`
  );
}

/**
 * Render a compact native quick-toolbar button.
 *
 * Retains existing command identifiers while using the exact measured button
 * bounds of the always-visible native formatting toolbar.
 *
 * @param {string} id - The existing control identifier, or an empty string for a delegated action.
 * @param {string} icon - The independent native glyph to display.
 * @param {string} label - The accessible control label and tooltip.
 * @param {number} left - The native horizontal position relative to the reference window.
 * @param {number} width - The measured control width in pixels.
 * @param {string} action - The delegated native command action, when one is needed.
 * @returns {string} A positioned quick-toolbar button.
 * @example
 * quickButton('bold', 'bold', '굵게 (Ctrl/⌘ B)', 732);
 */
function quickButton(
  id: string,
  icon: string,
  label: string,
  left: number,
  width = 24,
  action = "",
): string {
  return `<button${id ? ` id="${escapeMarkup(id)}"` : ""}${action ? ` data-native-action="${escapeMarkup(action)}"` : ""} class="native-quick-button" style="left:${left - 1}px;width:${width}px" title="${escapeMarkup(label)}" aria-label="${escapeMarkup(label)}">${nativeIcon(icon, 16)}</button>`;
}

/**
 * Render a native quick-toolbar button and its separate dropdown target.
 *
 * Keeps the primary command on its existing selector and delegates the arrow
 * separately so a save or history action is not triggered twice.
 *
 * @param {string} id - Existing primary editor command identifier.
 * @param {string} icon - The native-style quick-toolbar glyph.
 * @param {string} label - The primary command's accessible label.
 * @param {number} left - The measured native horizontal group origin.
 * @param {string} arrowAction - Logical action of the adjacent dropdown arrow.
 * @param {string} arrowId - Existing identifier for the arrow, when one is required.
 * @returns {string} The primary button and its independently accessible dropdown arrow.
 * @example
 * quickSplit('save-document', 'save', '저장하기', 107, 'export-menu', 'export-menu-toggle');
 */
function quickSplit(
  id: string,
  icon: string,
  label: string,
  left: number,
  arrowAction: string,
  arrowId = "",
): string {
  return (
    quickButton(id, icon, label, left) +
    `<button${arrowId ? ` id="${escapeMarkup(arrowId)}"` : ""} class="native-quick-button native-quick-arrow" data-native-action="${escapeMarkup(arrowAction)}" style="left:${left + 23}px;width:16px" title="${escapeMarkup(label)} 메뉴" aria-label="${escapeMarkup(label)} 메뉴">${nativeIcon("chevron-down", 11)}</button>`
  );
}

/**
 * Render the persistent native quick-access and character-format toolbar.
 *
 * Uses measured native positions for file commands, history, font selectors,
 * decorations, six alignment controls and the line-spacing selector.
 *
 * @returns {string} Always-visible native toolbar markup retaining legacy editor selectors.
 * @example
 * renderQuickToolbar();
 */
function renderQuickToolbar(): string {
  return `<section class="native-quickbar toolbar" aria-label="문서 서식">
    ${quickSplit("new-document", "new", "새 문서", 19, "new-menu")}${quickSplit("open-document", "open", "문서 열기", 63, "open-menu")}${quickSplit("save-document", "save", "저장", 107, "export-menu", "export-menu-toggle")}${quickButton("", "print", "인쇄", 151, 24, "print")}${quickButton("", "preview", "미리 보기", 179, 24, "preview")}${quickSplit("undo", "undo", "실행 취소 (Ctrl/⌘ Z)", 207, "undo-history")}${quickSplit("redo", "redo", "다시 실행 (Ctrl/⌘ Shift Z)", 251, "redo-history")}
    <label class="native-quick-combo native-style-combo" style="left:294px;width:106px"><span class="native-combo-icon">${nativeIcon("paragraph-style", 16)}</span><select id="block-style" aria-label="문단 스타일"><option value="paragraph">바탕글</option><option value="1">제목 1</option><option value="2">제목 2</option><option value="3">제목 3</option></select></label>
    <button class="native-quick-combo native-language-combo" data-native-action="font-language" style="left:404px;width:91px" aria-label="언어">대표${nativeIcon("chevron-down", 12)}</button>
    <label class="native-quick-combo native-font-combo" style="left:499px;width:118px"><span class="native-font-tt" aria-hidden="true">TT</span><select id="font-family" aria-label="글꼴"><option value="">함초롬바탕</option><option value="함초롬바탕">함초롬바탕</option><option value="함초롬돋움">함초롬돋움</option><option value="Malgun Gothic">맑은 고딕</option><option value="Batang">바탕</option><option value="Apple SD Gothic Neo">Apple SD Gothic Neo</option><option value="Noto Serif CJK KR">Noto Serif CJK KR</option><option value="serif">명조 계열</option><option value="sans-serif">고딕 계열</option></select></label>
    <label class="native-quick-combo native-font-size-combo" style="left:621px;width:106px"><input id="font-size" aria-label="글자 크기 (pt)" type="number" min="${MIN_FONT_SIZE}" max="${MAX_STORED_FONT_SIZE}" step="0.01" value="10.0"><span class="native-unit">pt</span><span class="native-font-size-arrow">${nativeIcon("chevron-down", 11)}</span><button type="button" tabindex="-1" class="native-font-size-step native-font-size-up" data-native-action="font-size-up" aria-label="글자 크기 키우기" title="글자 크기 키우기">⌃</button><button type="button" tabindex="-1" class="native-font-size-step native-font-size-down" data-native-action="font-size-down" aria-label="글자 크기 줄이기" title="글자 크기 줄이기">⌄</button></label>
    ${quickButton("bold", "bold", "굵게 (Ctrl/⌘ B)", 732)}${quickButton("italic", "italic", "기울임 (Ctrl/⌘ I)", 760)}${quickSplit("underline", "underline", "밑줄 (Ctrl/⌘ U)", 788, "underline-options")}${quickSplit("strike", "strike", "취소선", 832, "strike-options")}
    <button type="button" id="font-color-button" class="native-color-control" style="left:875px" title="글자 색" aria-label="글자 색" aria-haspopup="dialog" aria-expanded="false" data-color-target="#font-color">${nativeIcon("color", 16)}<input id="font-color" type="hidden" value="#ff0000"><span>${nativeIcon("chevron-down", 11)}</span></button>
    ${quickButton("align-justify", "align-justify", "양쪽 정렬", 920)}${quickButton("align-left", "align-left", "왼쪽 정렬", 948)}${quickButton("align-center", "align-center", "가운데 정렬", 976)}${quickButton("align-right", "align-right", "오른쪽 정렬", 1004)}${quickButton("", "align-distribute", "배분 정렬", 1032, 24, "align-distribute")}${quickButton("", "align-split", "나눔 정렬", 1060, 24, "align-split")}
    <div class="native-quick-combo native-line-spacing" style="left:1087px;width:123px"><span class="native-line-spacing-glyph" aria-hidden="true">${nativeIcon("line-spacing",20)}</span><input id="line-height" type="text" inputmode="decimal" role="combobox" aria-label="줄 간격 (%)" aria-controls="native-line-spacing-list" aria-expanded="false" aria-autocomplete="none" value="160"><span class="native-unit">%</span><button type="button" class="native-line-toggle" data-line-spacing-toggle aria-label="줄 간격 목록" aria-haspopup="listbox" aria-controls="native-line-spacing-list" aria-expanded="false"></button><span class="native-line-arrows"><button type="button" tabindex="-1" data-line-spacing-step="up" aria-label="줄 간격 늘리기">⌃</button><button type="button" tabindex="-1" data-line-spacing-step="down" aria-label="줄 간격 줄이기">⌄</button></span></div>
  </section>`;
}

/**
 * Render the measured native File popup without copying private recent paths.
 *
 * Keeps command labels, mnemonics, shortcuts and absolute row bounds while
 * reserving the observed recent-file area for application-owned dynamic data.
 *
 * @returns {string} Hidden File menu markup ready for the shell's delegated menu actions.
 * @example
 * renderNativeFileMenu();
 */
function renderNativeFileMenu(): string {
  let output = `<div id="native-file-menu" class="native-file-menu native-menu-popup" role="menu" aria-label="파일" hidden>`;
  let recent = false;
  for (/** The measured File command or sanitized recent-slot placeholder being rendered. */ const item of nativeFileMenu) {
    if (item.kind === "recent-slot") {
      if (!recent) {
        output +=
          '<div id="recent-list" class="native-recent-list"><span class="native-recent-placeholder"></span><span class="native-recent-placeholder"></span><span class="native-recent-placeholder"></span><span class="native-recent-placeholder"></span></div>';
        recent = true;
      }
      continue;
    }
    /** The legacy editor identifier retained on its corresponding native File menu row. */
    const id =
      item.action === "templates"
        ? "show-templates"
        : item.action === "document-info"
          ? "compatibility-status"
          : "";
    /** The row origin measured relative to the popup's bordered content area. */
    const top =
      (item.y || nativeFileMenuGeometry.y) - nativeFileMenuGeometry.y - 1;
    if (item.separatorBefore)
      output += `<span class="native-file-separator" style="top:${top - 2}px" aria-hidden="true"></span>`;
    output += `<button${id ? ` id="${id}"` : ""} role="menuitem" class="native-file-entry" data-native-action="${escapeMarkup(item.action)}" style="left:${(item.x || 2) - 1}px;top:${top}px;width:${item.width || 363}px;height:${item.height || 26}px"${item.hasDropdown ? ' aria-haspopup="menu"' : ""}><span class="native-menu-icon">${item.icon ? nativeIcon(item.icon, 16) : ""}</span><span class="native-menu-label">${escapeMarkup(item.label)}</span>${item.shortcut ? `<span class="native-menu-shortcut">${escapeMarkup(item.shortcut)}</span>` : ""}${item.hasDropdown ? `<span class="native-menu-chevron">›</span>` : ""}</button>`;
  }
  return output + "</div>";
}

/**
 * Render the complete independently implemented native-style editor shell.
 *
 * Reproduces the measured blank-window layout while retaining every persistent
 * editor selector needed for document editing, recovery, import, export and
 * dialogs. Document content remains mounted separately into the editor node.
 *
 * @param {string} title - The active document title shown in the caption and document tab.
 * @returns {string} Full shell and overlay markup for the application root.
 * @example
 * app.innerHTML = buildNativeShell('빈 문서 1');
 */
export function buildNativeShell(title: string): string {
  let tabs = "",
    verticalRuler = "";
  for (/** The native top-menu tab retaining its exact reference-window horizontal bounds. */ const tab of nativeTabs)
    tabs += `<button class="native-tab${tab.id === "edit" ? " active" : ""}" data-native-tab="${tab.id}" style="left:${tab.x - 1}px;width:${tab.width}px" aria-label="${escapeMarkup(tab.accessibleLabel || tab.label)}"${tab.id === "file" ? ' aria-haspopup="menu"' : ` role="tab" aria-selected="${tab.id === "edit"}"`}${tab.disabled ? " disabled" : ""}>${tab.icon ? nativeIcon(tab.icon, 16) : `<span>${escapeMarkup(tab.label)}</span>`}${tab.hasDropdown ? `<span class="native-tab-chevron" data-native-menu="${tab.id}">${nativeIcon("chevron-down", 11)}</span>` : ""}</button>`;
  for (let centimetre = -10; centimetre <= 60; centimetre++)
    verticalRuler += `<span style="top:calc(var(--native-paper-top, 43px) + (var(--native-body-top, 35mm) + ${centimetre * 10}mm) * var(--native-zoom, 1.25) - 6px)">${Math.abs(centimetre)}</span>`;
  return `<main class="native-shell main">
    <header class="native-caption"><button class="native-app-mark" aria-label="프로그램 메뉴" data-native-action="application-menu"><i></i><b></b><em></em></button><div class="native-caption-title"><span id="file-breadcrumb">${escapeMarkup(title)}</span> - 포한</div><div class="native-caption-controls"><button title="환경 설정" aria-label="환경 설정" data-native-action="preferences">${nativeIcon("settings", 16)}</button><button title="전체 화면" aria-label="전체 화면" data-native-action="full-screen">↗</button><button title="터치 모드" aria-label="터치 모드" data-native-action="touch-mode"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#555" stroke-width="0.8" aria-hidden="true"><path d="M6 8V2a1 1 0 0 1 2 0v5-2a1 1 0 0 1 2 0v3-2a1 1 0 0 1 2 0v3-1a1 1 0 0 1 2 0v3l-2 3H7L3 10a1 1 0 0 1 1-2l2 2"/></svg></button><button id="help" title="도움말" aria-label="도움말">${nativeIcon("help", 16)}</button><span class="native-caption-divider"></span><button data-window="minimize" title="최소화" aria-label="최소화">${nativeIcon("minimize", 16)}</button><button data-window="maximize" title="최대화" aria-label="최대화">${nativeIcon("maximize", 16)}</button><button data-window="close" class="native-window-close" title="닫기" aria-label="닫기">${nativeIcon("close", 16)}</button></div></header>
    <nav class="native-menubar" role="tablist" aria-label="한글 메뉴">${tabs}<div class="native-menu-tools"><label class="native-menu-search"><input aria-label="빠른 찾기" placeholder="찾을 내용"><span>${nativeIcon("chevron-down", 11)}</span></label><button class="native-ribbon-collapse" data-native-action="collapse-ribbon" title="도구 상자 접기" aria-label="도구 상자 접기">⌃</button><button class="native-ribbon-close" data-native-action="hide-ribbon" title="도구 상자 닫기" aria-label="도구 상자 닫기">${nativeIcon("close", 12)}</button></div></nav>
    <section id="native-ribbon" class="native-ribbon">${renderNativeRibbon("edit")}</section>
    ${renderQuickToolbar()}
    <div class="workspace native-workspace"><aside class="outline-panel" aria-label="문서 개요"><div class="outline-heading">문서 개요<button id="outline-collapse" title="문서 개요 접기" aria-label="문서 개요 접기">${nativeIcon("minimize", 12)}</button></div><div id="outline-list"></div><div class="outline-footnote">제목 스타일을 적용하면 목차가 표시됩니다.</div></aside><div class="native-vertical-ruler" aria-hidden="true"><span class="native-ruler-selector">└</span>${verticalRuler}</div><section class="canvas" aria-label="문서 편집 영역"><div class="ruler" aria-hidden="true">${renderNativeRuler()}</div><div class="paper" id="paper" style="--page-width:210mm;--page-height:297mm;--margin-top:35mm;--margin-bottom:30mm;--margin-left:30mm;--margin-right:30mm;zoom:1.25"><i class="native-margin-corner native-margin-top-left"></i><i class="native-margin-corner native-margin-top-right"></i><div id="editor"></div></div></section>${renderNativeScroll()}</div>
    <div class="native-document-navigation"><button id="toggle-sidebar" class="native-navigation-panel" title="작업 창" aria-label="사이드바 접기">${nativeIcon("task-pane", 16)}</button><button class="native-document-first" data-native-action="first-document" title="처음 문서" disabled>Ⅰ‹</button><button class="native-document-previous" data-native-action="previous-document" title="이전 문서" disabled>‹</button><button class="native-document-next" data-native-action="next-document" title="다음 문서" disabled>›</button><button class="native-document-last" data-native-action="last-document" title="마지막 문서" disabled>›Ⅰ</button><div id="current-document" class="native-document-tab"><input id="document-title" aria-label="문서 제목" value="${escapeMarkup(title)}" maxlength="180"></div><button class="native-document-add" data-native-action="new" title="새 문서" aria-label="새 문서 탭">${nativeIcon("tab-plus", 16)}</button><div class="native-horizontal-scroll" aria-hidden="true"><span>‹</span><i></i><span>›</span></div></div>
    <footer class="statusbar native-statusbar"><div class="native-status-left"><span class="native-status-page">1/1쪽</span><span class="native-status-column">1단</span><span class="native-status-line">1줄</span><span class="native-status-cell">1칸</span><span id="word-count">0글자</span><span class="native-status-input">문자 입력</span><span class="native-status-section">1/1 구역</span><span class="native-status-insert">삽입</span><button class="native-status-changes" data-native-action="track-changes">변경 내용</button><button class="native-status-record" data-native-action="track-changes">[기록 중지]</button><span class="native-status-keystrokes">타수 : 0타</span></div><div class="native-status-right"><button class="native-view-mode active" data-native-action="page-outline" aria-label="쪽 윤곽">${nativeIcon("page-outline", 16)}</button><button data-native-action="fit-width" aria-label="폭 맞춤">${nativeIcon("fit-width", 16)}</button><button data-native-action="fit-page" aria-label="쪽 맞춤">${nativeIcon("fit-page", 16)}</button><button id="zoom-out" title="축소" aria-label="축소"><span class="native-zoom-out-icon">−</span></button><input id="zoom-slider" type="range" min="10" max="500" step="any" value="270.3125" aria-label="확대 비율"><button id="zoom-in" title="확대" aria-label="확대">${nativeIcon("maximize", 14)}</button><span class="native-status-magnifier">${nativeIcon("zoom-in", 16)}</span><button id="zoom-reset" title="확대 비율">125%</button></div><span id="save-state" class="native-visually-hidden">저장됨</span><span id="format-badge" class="native-visually-hidden">FORHAN</span><span id="page-label" class="native-visually-hidden">A4 · 세로</span></footer>
  </main>
  ${renderNativeFileMenu()}
  <div id="native-other-menu" class="native-menu-popup" role="menu" hidden></div>
  <div id="notice" class="notice" role="status" hidden></div>
  ${renderNativeFindPane()}
  <div id="export-menu" class="dropdown" hidden><div class="menu-caption">다른 형식으로 저장</div><button data-export="hwpx">${nativeIcon("document", 16)}한글 표준 문서<span>.hwpx</span></button><button data-export="hwp">${nativeIcon("document", 16)}한글 문서<span>.hwp</span></button><button data-export="forhan">${nativeIcon("save", 16)}포한 문서<span>.fhn</span></button><button data-export="pdf">${nativeIcon("document", 16)}PDF 문서<span>.pdf</span></button><button data-export="txt">${nativeIcon("document", 16)}텍스트<span>.txt</span></button><button data-export="html">${nativeIcon("document", 16)}웹 문서<span>.html</span></button></div>
  ${renderNativeTableMenu()}
  <div id="native-line-spacing-list" class="native-line-spacing-list" role="listbox" aria-label="줄 간격 목록" hidden></div><div class="native-command-bank" hidden><button id="bullet-list">글머리표</button><button id="ordered-list">번호 매기기</button><a class="brand" href="#" aria-label="포한 시작 문서">포한</a></div><div id="modal-root"></div><div id="toast" class="toast" role="status" hidden></div><div id="drop-overlay" hidden>${nativeIcon("open", 48)}여기에 문서를 놓으세요<span>HWPX · HWP · FHN 문서</span></div><input id="file-input" type="file" accept=".hwpx,.hwp,.fhn,.txt,.html,.htm,.forhan" hidden><input id="image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden>`;
}
