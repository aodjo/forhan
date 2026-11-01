import { nativeIcon } from "./native-icons";
import {
  displayFontSize,
  MIN_FONT_SIZE,
  MAX_STORED_FONT_SIZE,
} from "../formatting";
import { EDITABLE_CHARACTER_METRICS, CHARACTER_LANGUAGE_LABELS } from "../character-metrics";
import { normalizeColor } from "../colors";
import { characterShadow } from "../character-shadow";
import { renderDecorationPattern, renderUnderlinePosition, renderOutlinePattern, renderEmphasisPattern } from "./decoration-controls";
import {LATIN_WORD_BREAK_OPTIONS,NON_LATIN_WORD_BREAK_OPTIONS} from '../paragraph-word-break.ts';
import {PARAGRAPH_NUMBER_LABELS,displayParagraphPoints} from './paragraph-numbers.ts';
import {MIN_PARAGRAPH_SPACE,MAX_PARAGRAPH_SPACE} from '../paragraph-minimum-space.ts';

/**
 * Render an independent native paragraph word-breaking control.
 *
 * A mixed source selection stays unassigned until explicitly changed. Reserved
 * imported Latin values remain visible without being converted on dialog open.
 * @param {string} name - Actual form field for the independent source mode.
 * @param {unknown} value - Current numeric native mode or a mixed null value.
 * @param {ReadonlyArray<{value:number;label:string}>} options - Native choices in display order.
 * @param {string} label - Accessible native control label.
 * @returns {string} An enabled native selector preserving mixed source state.
 * @example
 * paragraphBreakControl('breakLatinWord',0,LATIN_WORD_BREAK_OPTIONS,'영어 단위');
 */
function paragraphBreakControl(name:string,value:unknown,options:ReadonlyArray<{value:number;label:string}>,label:string):string{
  /** A null value identifies a mixed selection rather than an implicit default. */
  let markup=value===null?'<option value="" selected disabled>혼합</option>':'';
  if(value===3)markup+='<option value="3" selected>원본 값 3</option>';
  for(/** Numeric native values remain independent from translated display text. */const option of options)markup+=`<option value="${option.value}" ${value===option.value?'selected':''}>${option.label}</option>`;
  return `<select name="${name}" aria-label="${label}">${markup}</select>`;
}

/**
 * Render a native color button backed by an explicit foreground/shading draft.
 *
 * No shading stays empty rather than becoming white. Canonical color samples
 * are independent HTML/CSS, and palette choices update the hidden form field.
 * @param {'color' | 'backgroundColor' | 'underline-color' | 'strike-color' | 'shadow-color'} name - Independent character, shadow or line color edited by the control.
 * @param {unknown} value - Current selected character color or absent shading.
 * @returns {string} Accessible color button and its corresponding form input.
 * @example
 * colorControl('backgroundColor', null); // The native no-shading label.
 */
function colorControl(
  name: "color" | "backgroundColor" | "underline-color" | "strike-color" | "shadow-color",
  value: unknown,
): string {
  /** Shading alone supports the native no-color sentinel. */
  const allowNone = name === "backgroundColor";
  /** Native form identifiers are fixed strings, independent of imported document text. */
  const id = allowNone ? "native-character-shade" : name === "color" ? "native-character-color" : `native-${name}`;
  /** Unsupported imported display colors remain untouched unless this field is edited. */
  let color: string | null;
  try {
    color = normalizeColor(value, allowNone);
  } catch {
    color = null;
  }
  if (!allowNone && !color) color = "#000000";
  return `<input type="hidden" id="${id}" name="${name}" value="${color || ""}"><button type="button" class="nd-color-select${color ? "" : " color-none"}" data-color-target="#${id}" data-color-none="${allowNone}" aria-label="${allowNone ? "음영 색" : name === "underline-color" ? "밑줄 색" : name === "strike-color" ? "취소선 색" : name === "shadow-color" ? "그림자 색" : "글자 색"}" aria-haspopup="dialog" aria-expanded="false" style="--native-selected-color:${color || "transparent"}"><span data-color-sample>${color ? "" : "음영 색"}</span></button>`;
}

/** Supported native formatting and paper configuration windows. */
export type NativeDialogKind = "character" | "paragraph" | "page";

/** Rendered contents and measured outer dimensions of a native dialog. */
export interface NativeDialogMarkup {
  html: string;
  className: string;
  width: number;
  height: number;
}

/**
 * Escapes a value before placing it in an HTML attribute or text node.
 * Dialog values originate in the current document and must remain literal text.
 * @param {unknown} value Document setting to escape.
 * @returns {string} Safe HTML text.
 * @example escapeHtml('A&B') // 'A&amp;B'
 */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Reads a finite numeric document setting with a visible fallback.
 * Non-numeric imported values cannot produce invalid number controls.
 * @param {unknown} value Candidate document value.
 * @param {number} fallback Default setting.
 * @returns {number} Finite numeric value.
 * @example numeric(undefined, 10) // 10
 */
function numeric(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) && value !== undefined && value !== null
    ? Number(value)
    : fallback;
}

/**
 * Builds a compact native numeric control with its displayed measurement unit.
 * Read-only controls show unsupported settings without accepting discarded edits.
 * @param {string} name Form field name.
 * @param {number} value Initial numeric setting.
 * @param {string} [unit='mm'] - Displayed measurement unit.
 * @param {string} [id=''] - Optional integration identifier.
 * @param {boolean} [readonly=false] - Whether this setting is visual only.
 * @param {boolean} [disabled=false] - Whether the current mode prevents editing.
 * @param {boolean} [paragraph=false] - Whether observed paragraph arrows replace browser-specific spinners.
 * @returns {string} Label-ready HTML control.
 * @example numberField('size', 10, 'pt')
 */
function numberField(
  name: string,
  value: number,
  unit = "mm",
  id = "",
  readonly = false,
  disabled = false,
  paragraph = false,
): string {
  /** Character sizes and fixed line heights preserve native hundredth points. */
  const precise = unit === "pt";
  /** Native editable percentages use integral steps and measurement-specific bounds. */
  const metric =
    name === "scale"
      ? EDITABLE_CHARACTER_METRICS.ratio
      : name === "tracking"
      ? EDITABLE_CHARACTER_METRICS.spacing
      : name === "relative-size"
        ? EDITABLE_CHARACTER_METRICS.relativeSize
        : name === "position"
          ? EDITABLE_CHARACTER_METRICS.offset
          : null;
  /** Character height uses storage bounds and preserves a pre-existing subminimum size. */
  const bounds =
    name==='minimum-space'?`min="${Math.min(value,MIN_PARAGRAPH_SPACE)}" max="${Math.max(value,MAX_PARAGRAPH_SPACE)}" required`:name === "size"
      ? `min="${Math.min(MIN_FONT_SIZE, value)}" max="${MAX_STORED_FONT_SIZE}" required`
      : metric
        ? `min="${Math.min(value, metric.min)}" max="${Math.max(value, metric.max)}" required`
        : name === "line" || name === "textIndent"
          ? 'min="0"'
          : "";
  /** Explicit one-point arrows avoid the browser's hundredth-point step grid. */
  const arrows =
    name === "size"
      ? '<button type="button" tabindex="-1" class="nd-size-up" data-font-size-step="1" aria-label="글자 크기 키우기">⌃</button><button type="button" tabindex="-1" class="nd-size-down" data-font-size-step="-1" aria-label="글자 크기 줄이기">⌄</button>'
      : paragraph?`<button type="button" tabindex="-1" class="nd-paragraph-up" data-paragraph-number-step="1" aria-label="${PARAGRAPH_NUMBER_LABELS[name]} 늘리기" ${disabled||readonly?'disabled':''}><svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true"><path d="m1 3.5 3-3 3 3"/></svg></button><button type="button" tabindex="-1" class="nd-paragraph-down" data-paragraph-number-step="-1" aria-label="${PARAGRAPH_NUMBER_LABELS[name]} 줄이기" ${disabled||readonly?'disabled':''}><svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true"><path d="m1 1.5 3 3 3-3"/></svg></button>`:"";
  return `<span class="nd-number${name === "size" ? " nd-font-size" : ""}${paragraph?' nd-paragraph-number':''}"><input type="number" step="${paragraph?'any':metric ? "1" : precise ? "0.01" : "0.1"}" ${bounds} ${paragraph&&!readonly?'required':''} name="${escapeHtml(name)}" ${id ? `id="${escapeHtml(id)}"` : ""} value="${paragraph&&precise?displayParagraphPoints(value):precise ? displayFontSize(value) : unit === "%" ? value : value.toFixed(1)}" ${readonly ? 'readonly aria-readonly="true"' : ""}${disabled ? " disabled" : ""}><span>${unit}</span>${arrows}</span>`;
}

/**
 * Draws the document line preview using original vector geometry.
 * The preview shares the native black-line paper motif without shipping screenshots.
 * @returns {string} Inline SVG paper illustration.
 * @example paperPreview()
 */
function paperPreview(): string {
  return '<svg viewBox="0 0 100 140" aria-hidden="true"><rect x="9" y="5" width="82" height="120" fill="white" stroke="black"/><path d="M24 22h56M21 27h59M21 30h59M21 33h59M21 36h45M21 42h59M21 45h59M21 48h59M21 51h38M21 58h59M21 61h59M21 64h59M21 67h50M21 74h59M21 77h59M21 80h59M21 83h44M21 90h59M21 93h59M21 96h59M21 99h56M21 106h59M21 109h59M21 112h39" stroke="black" stroke-width="1"/></svg>';
}

/**
 * Creates the common caption, tabs, right action rail and native preset footer.
 * The returned markup is the complete inner content of the host modal element.
 * @param {string} title Native caption.
 * @param {string[]} tabs Observed tab labels.
 * @param {string} content Kind-specific form markup.
 * @returns {string} Complete dialog contents.
 * @example shell('글자 모양', ['기본'], '<form></form>')
 */
function shell(title: string, tabs: string[], content: string): string {
  /** Rendered observed tab buttons. */
  let tabMarkup = "";
  for (/** Observed native tab title and its actual dialog panel index. */ const [index, tab] of tabs.entries()) {
    /** Character basic/expanded panels retain their drafts when switching tabs. */
    const characterTab = title === "글자 모양" && index < 2, pageTab = title === "편집 용지";
    tabMarkup += `<button type="button" role="tab" aria-selected="${tab === "기본"}" ${characterTab ? `data-character-tab="${index ? "expanded" : "basic"}" aria-controls="native-character-${index ? "expanded" : "basic"}" tabindex="${index ? -1 : 0}"` : pageTab ? `data-page-tab="${index ? "grid" : "basic"}" aria-controls="native-page-${index ? "grid" : "basic"}" tabindex="${index ? -1 : 0}"` : tab !== "기본" ? "disabled" : ""}>${tab}</button>`;
  }
  return `<header class="modal-header"><h2 id="modal-title">${title}</h2><span class="nd-caption-tools">▤　? </span><button type="button" class="modal-x" aria-label="닫기" data-modal-value="cancel">×</button></header><div class="nd-tabs" role="tablist">${tabMarkup}</div><div class="modal-body">${content}</div><div class="modal-actions"><button type="button" class="nd-apply" data-modal-value="apply">설정(<u>D</u>)</button><button type="button" data-modal-value="cancel">취소</button></div><div class="nd-preset"><label>대화 상자 설정</label><select disabled><option>사용자 지정</option></select><button type="button" disabled>구성...</button></div>`;
}

/**
 * Renders native character controls from the active text selection.
 * Character effects and native percentages use independent cancelable drafts.
 * Width, height, tracking and baseline offsets retain their original source scope.
 * @param {Record<string, unknown>} values Selected text attributes.
 * @returns {string} Character formatting form.
 * @example characterForm({size:16,bold:true})
 */
function characterForm(values: Record<string, unknown>): string {
  /** Representative and seven independently editable native language choices. */
  let languages = '<option value="all">대표</option>';
  for (let slot = 0; slot < CHARACTER_LANGUAGE_LABELS.length; slot++)
    languages += `<option value="${slot}">${CHARACTER_LANGUAGE_LABELS[slot]}</option>`;
  /** Current document font family. */
  const family = String(
    values.family ?? values.fontfamily ?? values.fontFamily ?? "함초롬바탕",
  );
  /** Fonts available as editable family choices. */
  const fonts = [
    ...new Set([
      family,
      "함초롬바탕",
      "함초롬돋움",
      "맑은 고딕",
      "바탕",
      "돋움",
      "굴림",
      "Arial",
      "Times New Roman",
    ]),
  ];
  /** Safe font option markup. */
  let options = "";
  for (/** Available font family. */ const font of fonts) {
    options += `<option ${font === family ? "selected" : ""}>${escapeHtml(font)}</option>`;
  }
  /** Native emphasis tile definitions. */
  const marks = [
    ["bold", "진하게"],
    ["italic", "기울임"],
    ["underline", "밑줄"],
    ["strike", "취소선"],
    ["superscript", "위 첨자"],
    ["subscript", "아래 첨자"],
  ];
  /** Rendered functional emphasis controls. */
  let tiles = "";
  for (/** Name and accessible label for the tile. */ const [
    name,
    label,
  ] of marks) {
    tiles += `<label class="nd-mark nd-mark-${name}" title="${label}"><input type="checkbox" name="${name}" ${values[name] ? "checked" : ""}><span>가</span><span class="nd-sr">${label}</span></label>`;
  }
  return `<form id="native-format-form" class="nd-character" data-character-active="basic"><div id="native-character-basic" data-character-panel="basic" role="tabpanel"><label class="nd-base-size">기준 크기 ${numberField("size", numeric(values.size, 10), "pt")}</label><fieldset><legend>언어별 설정</legend><div class="nd-font-grid"><label>언어 <select name="language">${languages}</select></label><label>글꼴 <select name="family">${options}</select></label><label>상대 크기 ${numberField("relative-size", numeric(values.relativeSize, 100), "%")}</label><label>장평 ${numberField("scale", numeric(values.ratio, 100), "%")}</label><label>글자 위치 ${numberField("position", numeric(values.offset, 0), "%")}</label><label>자간 ${numberField("tracking", numeric(values.spacing, 0), "%")}</label></div></fieldset><fieldset><legend>속성</legend><div class="nd-marks">${tiles}<button type="button" disabled>가·</button><button type="button" disabled>가·</button><button type="button" disabled>┄가┄</button><button type="button" disabled>┄가┄</button><button type="button" disabled>가</button></div><label class="nd-color">글자 색 ${colorControl("color", values.color)}</label><label class="nd-shade">음영 색 ${colorControl("backgroundColor", values.backgroundColor)}</label></fieldset></div>${characterExpandedForm(values)}<div class="nd-character-preview"><span><span class="nd-character-sample">한글Eng123漢字あいう※◎</span></span></div></form>`;
}

/**
 * Render the measured expanded character panel and its native font-space control.
 *
 * The native 695 by 570 dialog retains the same basic controls and one shared
 * draft. Unimplemented decoration choices remain visibly unavailable rather
 * than accepting changes that the independent native writer cannot preserve.
 * @param {Record<string,unknown>} values - Current source character settings.
 * @returns {string} Initially hidden expanded panel with the original native control geometry.
 * @example
 * characterExpandedForm({useFontSpace:true}); // The actual native checkbox begins selected.
 */
function characterExpandedForm(values: Record<string, unknown>): string {
  return `<div id="native-character-expanded" class="nd-character-expanded" data-character-panel="expanded" role="tabpanel" hidden>
${shadowForm(values)}
<div class="nd-expanded-group nd-expanded-underline" role="group" aria-labelledby="nd-underline-legend"><span class="nd-expanded-legend" id="nd-underline-legend">밑줄</span><label class="nd-underline-position">위치 ${renderUnderlinePosition(values.underlinePosition,Boolean(values.underline))}</label><label class="nd-underline-pattern">모양 ${renderDecorationPattern("underline-pattern",Number(values.underlinePattern || 0),false)}</label><label class="nd-underline-color">색 ${colorControl("underline-color",values.underlineColor)}</label></div>
<div class="nd-expanded-group nd-expanded-strike" role="group" aria-labelledby="nd-strike-legend"><span class="nd-expanded-legend" id="nd-strike-legend">취소선</span><label class="nd-strike-pattern">모양 ${renderDecorationPattern("strike-pattern",values.strike ? Number(values.strikePattern || 0) : -1,true)}</label><label class="nd-strike-color">색 ${colorControl("strike-color",values.strikeColor)}</label></div>
<div class="nd-expanded-group nd-expanded-other" role="group" aria-labelledby="nd-other-legend"><span class="nd-expanded-legend" id="nd-other-legend">기타</span><label class="nd-outline-pattern">외곽선 ${renderOutlinePattern(values.outlineType)}</label><label class="nd-emphasis-pattern">강조점 ${renderEmphasisPattern(values.emphasisType)}</label><label class="nd-font-space-option"><input type="checkbox" name="font-space" ${values.useFontSpace ? "checked" : ""}>글꼴에 어울리는 빈칸</label><label class="nd-kerning-option"><input type="checkbox" name="kerning" ${values.useKerning ? "checked" : ""}>커닝</label></div>
</div>`;
}

/**
 * Render independently editable native shadow kind, direction and color fields.
 *
 * Stored inactive preferences remain present in disabled controls. Fixed labels
 * and validated signed-byte values are inserted as literal safe form markup.
 * @param {Record<string,unknown>} values - Original representative character settings.
 * @returns {string} Measured shadow group with cancelable local source drafts.
 * @throws {RangeError} If supplied native shadow preferences are unrepresentable.
 * @example
 * shadowForm({shadowType:'DROP',shadowX:-20}); // Enables the independent direction fields.
 */
function shadowForm(values: Record<string,unknown>): string {
  /** Canonical source defaults match the installed application's inactive preferences. */
  const shadow = characterShadow({nativeShadowType:values.shadowType,nativeShadowOffsetX:values.shadowX,nativeShadowOffsetY:values.shadowY,nativeShadowColor:values.shadowColor});
  return `<div class="nd-expanded-group nd-expanded-shadow" role="group" aria-labelledby="nd-shadow-legend"><span class="nd-expanded-legend" id="nd-shadow-legend">그림자</span><div class="nd-shadow-radios"><label><input type="radio" name="shadow-type" value="NONE" ${shadow.type === "NONE" ? "checked" : ""}>없음</label><label><input type="radio" name="shadow-type" value="DROP" ${shadow.type === "DROP" ? "checked" : ""}>비연속</label><label><input type="radio" name="shadow-type" value="CONTINUOUS" ${shadow.type === "CONTINUOUS" ? "checked" : ""}>연속</label></div><label class="nd-shadow-x">X 방향 <span class="nd-number"><input type="number" name="shadow-x" aria-label="그림자 X 방향" value="${shadow.x}" min="-128" max="127" step="1" required><span>%</span></span></label><label class="nd-shadow-y">Y 방향 <span class="nd-number"><input type="number" name="shadow-y" aria-label="그림자 Y 방향" value="${shadow.y}" min="-128" max="127" step="1" required><span>%</span></span></label><label class="nd-shadow-color">색 ${colorControl("shadow-color",shadow.color)}</label></div>`;
}

/**
 * Renders native paragraph alignment, indentation and spacing controls.
 * Distances use typographic points; line spacing supports percentages and fixed points.
 * @param {Record<string, unknown>} values Active paragraph settings.
 * @returns {string} Paragraph formatting form.
 * @example paragraphForm({align:'center',line:160})
 */
function paragraphForm(values: Record<string, unknown>): string {
  /** Signed first-line distance determines the selected native indentation mode. */
  const indentation = numeric(values.textIndent, 0);
  /** Native alignment choices in observed order. */
  const alignments = [
    ["justify", "양쪽"],
    ["left", "왼쪽"],
    ["center", "가운데"],
    ["right", "오른쪽"],
    ["distribute", "배분"],
    ["split", "나눔"],
  ];
  /** Real alignment radio controls with vector icons. */
  let alignment = "";
  for (/** Alignment identifier and label. */ const [
    name,
    label,
  ] of alignments) {
    alignment += `<label class="nd-align" title="${label}"><input type="radio" name="align" value="${name}" ${(values.align ?? "justify") === name ? "checked" : ""}><span>${nativeIcon(`align-${name}`, 28)}</span><span class="nd-sr">${label}</span></label>`;
  }
  return `<form id="native-format-form" class="nd-paragraph"><fieldset><legend>일반</legend><div class="nd-align-row"><span>정렬</span>${alignment}</div></fieldset><div class="nd-para-columns"><fieldset><legend>여백</legend><label>왼쪽 ${numberField("marginLeft", numeric(values.marginLeft, 0), "pt", "", false, false, true)}</label><label>오른쪽 ${numberField("marginRight", numeric(values.marginRight, 0), "pt", "", false, false, true)}</label></fieldset><fieldset><legend>첫 줄</legend><label class="nd-first-label"><input type="radio" name="indentMode" value="NORMAL" ${indentation === 0 ? "checked" : ""}> 보통</label><label class="nd-first-label"><input type="radio" name="indentMode" value="INDENT" ${indentation > 0 ? "checked" : ""}> 들여쓰기</label><label class="nd-first-label"><input type="radio" name="indentMode" value="HANGING" ${indentation < 0 ? "checked" : ""}> 내어쓰기</label><label class="nd-indent">${numberField("textIndent", Math.abs(indentation), "pt", "", false, indentation === 0, true)}<span class="nd-sr">첫 줄 길이</span></label></fieldset></div><fieldset class="nd-spacing"><legend>간격</legend><label>줄 간격 <select name="lineMode" aria-label="줄 간격 방식"><option value="PERCENT" ${values.lineMode !== "FIXED" ? "selected" : ""}>글자에 따라</option><option value="FIXED" ${values.lineMode === "FIXED" ? "selected" : ""}>고정 값</option></select></label><label class="nd-line">${numberField("line", numeric(values.line, 160), values.lineMode === "FIXED" ? "pt" : "%", "", false, false, true)}</label><label class="nd-before">문단 위 ${numberField("marginTop", numeric(values.marginTop, 0), "pt", "", false, false, true)}</label><label class="nd-after">문단 아래 ${numberField("marginBottom", numeric(values.marginBottom, 0), "pt", "", false, false, true)}</label><label class="nd-grid-check"><input type="checkbox" name="snap-to-grid" ${values.snapToGrid===false?"":"checked"}> 편집 용지의 줄 격자 사용</label></fieldset><fieldset class="nd-break"><legend>줄 나눔 기준</legend><label>한글 단위 ${paragraphBreakControl("breakNonLatinWord",values.breakNonLatinWord===undefined?1:values.breakNonLatinWord,NON_LATIN_WORD_BREAK_OPTIONS,"한글 단위")}</label><label>최소 공백 ${numberField("minimum-space", numeric(values["minimum-space"], 100), "%", "", false, false, true)}</label><label>영어 단위 ${paragraphBreakControl("breakLatinWord",values.breakLatinWord===undefined?0:values.breakLatinWord,LATIN_WORD_BREAK_OPTIONS,"영어 단위")}</label></fieldset><div class="nd-paragraph-preview"><p>이전 문단 이전 문단 이전 문단 이전 문단 이전 문단 이전 문단</p><p>가나다라마바사AbBc12345　 가나다라마AbBc12345</p><p>AaBbCc12345 가나다라마AbBc12345가나다라마AbBc12345</p><p>AaBbCc12345가나다라마AbBc12345가나다라마바사</p><p>다음 문단 다음 문단 다음 문단 다음 문단 다음 문단 다음 문단</p></div></form>`;
}

/**
 * Render the independently retained native vertical grid panel.
 *
 * Character-grid and manuscript source stays visible read-only while vertical
 * spacing uses actual measured point and count controls in a cancelable draft.
 * @param {Record<string,unknown>} values - Current physical page and native grid source.
 * @returns {string} Hidden native grid panel sharing the original paper form.
 * @example
 * pageGridForm({lineGrid:1600}); // A pending 16pt native vertical grid.
 */
function pageGridForm(values:Record<string,unknown>):string{
  /** Imported horizontal source remains independent from editable vertical spacing. */
  const combined=Number(values.charGrid)>0,line=Number(values.lineGrid)>0;
  /** Native grid numeric arrows use their own source-aware controller. */
  let fields='';
  for(/** Native count and point rows have independent labels and step units. */const [name,label,value,unit] of [['grid-count','한 쪽의 줄 수',41,''],['grid-spacing','줄 간격',Number(values.lineGrid||1600)/100,'pt']] as const){
    fields+=`<label>${label}<span class="nd-number"><input type="number" step="any" min="0.01" required name="${name}" aria-label="${label}" value="${value}"><span>${unit}</span><span class="nd-number-arrows"><button type="button" data-page-grid-step="1" aria-label="${label} 증가">▴</button><button type="button" data-page-grid-step="-1" aria-label="${label} 감소">▾</button></span></span></label>`;
  }
  return `<div id="native-page-grid" data-page-panel="grid" role="tabpanel" hidden><div class="nd-grid-modes"><label><input type="radio" name="grid-mode" value="none" ${!line&&!combined?'checked':''}>격자 설정 안 함</label><label><input type="radio" name="grid-mode" value="line" ${line&&!combined?'checked':''}>줄 격자 설정</label><label><input type="radio" name="grid-mode" value="both" ${combined?'checked':''} disabled>줄 격자와 글자 격자 설정</label></div><fieldset class="nd-grid-lines"><legend>줄 수 지정</legend>${fields}</fieldset><fieldset class="nd-grid-characters"><legend>글자 수 지정</legend><label>한 줄당 눈금 수 ${numberField('grid-char-count',21,'','',false,true)}</label><label>글자 간격 ${numberField('grid-char-spacing',Number(values.charGrid||2000)/100,'pt','',false,true)}</label></fieldset><label class="nd-grid-manuscript"><input type="checkbox" disabled ${values.wonggojiFormat?'checked':''}>원고지 정서법 적용</label><div class="nd-grid-scope"><label>적용 범위 <select disabled><option>문서 전체</option></select></label></div></div>`;
}

/**
 * Renders paper dimensions and all eight supported page margin measurements.
 * Orientation and preset controls expose the identifiers used by the host editor.
 * @param {Record<string, unknown>} values Current page settings in millimetres.
 * @returns {string} Native paper configuration form.
 * @example pageForm({width:210,height:297,header:15})
 */
function pageForm(values: Record<string, unknown>): string {
  /** Current orientation derived from actual page dimensions. */
  const landscape = numeric(values.width, 210) > numeric(values.height, 297);
  /** Source-observed paper options. */
  const papers = [
    ["A4", "A4(국배판)  [210 x 297 mm]"],
    ["Letter", "Letter  [215.9 x 279.4 mm]"],
    ["A3", "A3  [297 x 420 mm]"],
    ["B4", "B4  [257 x 364 mm]"],
    ["B5", "B5(국판)  [182 x 257 mm]"],
    ["A5", "A5  [148 x 210 mm]"],
  ];
  /** Paper selection options. */
  let options = "";
  /** Portrait edge lengths used to identify an existing standard paper size. */
  const paperSizes: Record<string, [number, number]> = {
    A4: [210, 297],
    Letter: [215.9, 279.4],
    A3: [297, 420],
    B4: [257, 364],
    B5: [182, 257],
    A5: [148, 210],
  };
  /** Shorter edge of the current page independent of orientation. */
  const shortEdge = Math.min(
    numeric(values.width, 210),
    numeric(values.height, 297),
  );
  /** Longer edge of the current page independent of orientation. */
  const longEdge = Math.max(
    numeric(values.width, 210),
    numeric(values.height, 297),
  );
  /** Whether a standard paper option matches the current page. */
  let matched = false;
  for (/** Paper key and displayed dimensions. */ const [
    key,
    label,
  ] of papers) {
    /** Dimensions associated with this standard paper option. */
    const dimensions = paperSizes[key];
    /** Native unit rounding tolerance for imported standard paper geometry. */
    const selected =
      Math.abs(shortEdge - dimensions[0]) < 0.15 &&
      Math.abs(longEdge - dimensions[1]) < 0.15;
    matched ||= selected;
    options += `<option value="${key}" ${selected ? "selected" : ""}>${label}</option>`;
  }
  if (!matched)
    options += '<option value="custom" selected>사용자 정의</option>';
  return `<form id="native-page-form" class="nd-page"><div id="native-page-basic" data-page-panel="basic" role="tabpanel"><fieldset class="nd-paper-kind"><legend>용지 종류</legend><label>종류 <select id="native-paper-size">${options}</select></label><button type="button" disabled>등록...</button><button type="button" disabled>삭제</button><div class="nd-paper-dimensions"><label>폭 ${numberField("width", numeric(values.width, 210), "mm", "page-width")}</label><label>길이 ${numberField("height", numeric(values.height, 297), "mm", "page-height")}</label></div></fieldset><div class="nd-page-options"><fieldset><legend>용지 방향</legend><div class="nd-orientation"><button type="button" id="preset-a4" aria-pressed="${!landscape}">${paperPreview()}<span>세로</span></button><button type="button" id="preset-landscape" aria-pressed="${landscape}">${paperPreview()}<span>가로</span></button><button type="button" id="preset-letter" hidden>Letter</button></div></fieldset><fieldset><legend>제본</legend><div class="nd-binding"><button type="button" disabled aria-pressed="true"><span>가</span>한쪽</button><button type="button" disabled><span>가나</span>맞쪽</button><button type="button" disabled><span>가</span>위로</button></div></fieldset></div><fieldset class="nd-page-margins"><legend>용지 여백</legend><label class="nd-margin-top">위쪽 ${numberField("marginTop", numeric(values.marginTop, 20), "mm", "page-marginTop")}</label><label class="nd-header">머리말 ${numberField("header", numeric(values.header, 15), "mm", "page-header")}</label><div class="nd-paper-preview">${paperPreview()}</div><label class="nd-margin-left">왼쪽 ${numberField("marginLeft", numeric(values.marginLeft, 30), "mm", "page-marginLeft")}</label><label class="nd-gutter">제본 ${numberField("gutter", 0, "mm", "", true)}</label><label class="nd-margin-right">오른쪽 ${numberField("marginRight", numeric(values.marginRight, 30), "mm", "page-marginRight")}</label><label class="nd-footer">꼬리말 ${numberField("footer", numeric(values.footer, 15), "mm", "page-footer")}</label><label class="nd-margin-bottom">아래쪽 ${numberField("marginBottom", numeric(values.marginBottom, 15), "mm", "page-marginBottom")}</label></fieldset><div class="nd-page-scope"><label>적용 범위 <select disabled><option>문서 전체</option></select></label><label><input type="checkbox" disabled> 현재 설정 값을 새 문서에 적용</label></div></div>${pageGridForm(values)}</form>`;
}

/**
 * Recreates an observed native formatting dialog as editable code-native HTML.
 * The host inserts this complete markup into its modal and binds apply/cancel actions.
 * @param {NativeDialogKind} kind Character, paragraph or page configuration window.
 * @param {Record<string, unknown>} values Current document or selection settings.
 * @returns {NativeDialogMarkup} Inner markup, scoped CSS classes and measured outer size.
 * @example renderNativeDialog('page', {width:210,height:297,header:15})
 */
export function renderNativeDialog(
  kind: NativeDialogKind,
  values: Record<string, unknown>,
): NativeDialogMarkup {
  if (kind === "character")
    return {
      html: shell(
        "글자 모양",
        ["기본", "확장", "테두리/배경"],
        characterForm(values),
      ),
      className: "native-dialog native-dialog-character",
      width: 695,
      height: 570,
    };
  if (kind === "paragraph")
    return {
      html: shell(
        "문단 모양",
        ["기본", "확장", "탭 설정", "테두리/배경"],
        paragraphForm(values),
      ),
      className: "native-dialog native-dialog-paragraph",
      width: 553,
      height: 642,
    };
  return {
    html: shell("편집 용지", ["기본", "줄 격자"], pageForm(values)),
    className: "native-dialog native-dialog-page",
    width: 661,
    height: 682,
  };
}
