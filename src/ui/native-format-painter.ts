import type {NativeDialogMarkup} from './native-dialogs.ts';
import type {FormatPainterOptions,FormatPainterMode} from './format-painter.ts';

/** Dialog-owned draft listeners remain usable after the shared modal removes its DOM. */
export interface FormatPainterDialogBinding {
  /**
   * Read an independent copy of the explicit format-copy draft.
   *
   * Detached controls are not read after the shared modal finishes.
   * @returns {FormatPainterOptions} Retained current choices without document mutations.
   * @example
   * const options=binding.read();
   */
  read():FormatPainterOptions;
  /**
   * Remove listeners owned by this one format-copy dialog.
   *
   * Previously returned source and option snapshots remain independent.
   * @returns {void} Releases all owned DOM event handlers.
   * @example
   * binding.destroy();
   */
  destroy():void;
}

/**
 * Render one original body-format radio at its captured native position.
 *
 * Unsupported native style definitions remain visible and unavailable until
 * the source schema can represent their identity and definition faithfully.
 * @param {string} value - Trusted body-format identifier.
 * @param {string} label - Original native option caption.
 * @param {number} top - Captured vertical offset inside its native group.
 * @param {FormatPainterOptions} draft - Independent current copy choices.
 * @param {boolean} [disabled=false] - Whether the source schema cannot represent this choice.
 * @returns {string} An accessible real radio control at the native group position.
 * @example
 * bodyRadio('both','글자 모양과 문단 모양 둘 다 복사',73,draft);
 */
function bodyRadio(value:string,label:string,top:number,draft:FormatPainterOptions,disabled=false):string{
  return `<label class="nf-option" style="top:${top}px"><input type="radio" name="format-copy-body" value="${value}" ${draft.mode===value?'checked autofocus':''} ${disabled?'disabled':''}><span>${label}</span></label>`;
}

/**
 * Recreate the measured installed-Hangul format-copy dialog.
 *
 * The original 361-by-387 outer frame retains all three native groups and
 * their actual labels. Source-supported cell properties and fill are independent from body
 * appearance; native style definitions and cell borders still
 * require source-model support and are never accepted as working operations.
 * @param {FormatPainterOptions} draft - Independent current copy choices.
 * @param {boolean} hasCell - Whether the actual source cursor is inside a table cell.
 * @returns {NativeDialogMarkup} Original dialog geometry and accessible independent controls.
 * @example
 * const layout=renderNativeFormatPainterDialog(draft,false);
 */
export function renderNativeFormatPainterDialog(draft:FormatPainterOptions,hasCell:boolean):NativeDialogMarkup{
  /** Original body choices retain their literal captured order and positions. */
  const body=bodyRadio('character','글자 모양',25,draft)+bodyRadio('paragraph','문단 모양',49,draft)+bodyRadio('both','글자 모양과 문단 모양 둘 다 복사',73,draft)+bodyRadio('character-style','글자 스타일',97,draft,true)+bodyRadio('paragraph-style','문단 스타일',121,draft,true);
  /** Original caption tools offer local help without launching an online feature. */
  const header='<header class="modal-header"><h2 id="modal-title">모양 복사</h2><button type="button" class="nf-quick-help" data-format-copy-help aria-label="빠른 도움말"><svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M1.5 1.5h10v8h-4l-2 2v-2h-4zM3.5 4h6M3.5 6h6" fill="none" stroke="currentColor" stroke-width="0.8"/></svg></button><button type="button" class="nf-help" data-format-copy-help aria-label="도움말">?</button><button type="button" class="modal-x" aria-label="닫기">×</button></header>';
  return{width:361,height:387,className:'native-dialog native-dialog-format-painter',html:header+`<div class="modal-body"><form id="native-format-copy-form"><fieldset class="nf-group nf-body"><legend>본문 모양 복사</legend>${body}</fieldset><fieldset class="nf-group nf-cell"><legend>셀 모양 복사</legend><label class="nf-option" style="top:25px"><input type="checkbox" name="format-copy-cell-properties" ${draft.cellProperties?'checked':''} ${hasCell?'':'disabled'}><span>셀 속성</span></label><label class="nf-option" style="top:49px"><input type="checkbox" name="format-copy-cell-border" disabled><span>셀 테두리</span></label><label class="nf-option" style="top:73px"><input type="checkbox" name="format-copy-cell-background" ${draft.cellBackground?'checked':''} ${hasCell?'':'disabled'}><span>셀 배경</span></label></fieldset><fieldset class="nf-group nf-target"><legend>표에서 적용 대상</legend><label class="nf-option" style="top:25px"><input type="radio" name="format-copy-table-target" value="both" ${draft.cellOnly?'':'checked'} ${hasCell?'':'disabled'}><span>본문 모양과 셀 모양 둘 다</span></label><label class="nf-option" style="top:49px"><input type="radio" name="format-copy-table-target" value="cell" ${draft.cellOnly?'checked':''} ${hasCell?'':'disabled'}><span>셀 모양만</span></label></fieldset></form></div><div class="modal-actions"><button type="button" class="nd-apply" data-modal-value="apply">복사(<u>D</u>)</button><button type="button" data-modal-value="cancel">취소</button></div><div class="nf-help-text" hidden>커서 위치의 모양을 복사한 다음, 바꿀 부분을 블록으로 선택하고 모양 복사를 다시 실행하세요.</div>`};
}

/**
 * Bind an independent format-copy draft and original native access keys.
 *
 * Copying a source or changing a radio never edits document content. Only a
 * later accepted copy replaces the application's remembered source snapshot.
 * The cell-only decision cannot be accepted without a working cell category.
 * @param {HTMLElement} root - Mounted owned native format-copy dialog.
 * @param {FormatPainterOptions} original - Independent initial copy choices.
 * @returns {FormatPainterDialogBinding} Retained draft reader and deterministic listener cleanup.
 * @example
 * const binding=bindNativeFormatPainterDialog(dialog,options);
 */
export function bindNativeFormatPainterDialog(root:HTMLElement,original:FormatPainterOptions):FormatPainterDialogBinding{
  /** One immutable input snapshot and one owned cancellation signal isolate this modal lifecycle. */
  const draft={...original},listeners=new AbortController();
  /**
   * Retain actual enabled draft controls without changing the editor source.
   *
   * The default copy button is disabled for an empty cell-only operation.
   * @returns {void} Updates only the independent retained copy choices and button state.
   * @example
   * // Selecting cell-only requires selecting cell properties or background.
   */
  function update():void{
    draft.mode=root.querySelector<HTMLInputElement>('[name="format-copy-body"]:checked')!.value as FormatPainterMode;
    draft.cellBackground=root.querySelector<HTMLInputElement>('[name="format-copy-cell-background"]')!.checked;
    draft.cellProperties=root.querySelector<HTMLInputElement>('[name="format-copy-cell-properties"]')!.checked;
    draft.cellOnly=root.querySelector<HTMLInputElement>('[name="format-copy-table-target"]:checked')!.value==='cell';
    root.querySelector<HTMLButtonElement>('[data-modal-value="apply"]')!.disabled=draft.cellOnly&&!draft.cellBackground&&!draft.cellProperties;
  }
  root.addEventListener('change',update,{signal:listeners.signal});
  root.addEventListener('click',
    /**
     * Toggle only the dialog's local instructions from either native help control.
     *
     * Help never opens a browser, changes the source or accepts the draft.
     * @param {MouseEvent} event - Actual click in the owned dialog.
     * @returns {void} Updates only local instruction visibility.
     * @example
     * // The native question-mark control works while offline.
     */
    event=>{if((event.target as Element).closest('[data-format-copy-help]')){/** The local instruction panel belongs to this dialog alone. */const help=root.querySelector<HTMLElement>('.nf-help-text')!;help.hidden=!help.hidden;}},
    {signal:listeners.signal});
  root.addEventListener('keydown',
    /**
     * Route observed native copy-dialog access keys without editing source text.
     *
     * Enter accepts an enabled copy decision; Escape stays with the shared
     * modal cancellation trap. Unsupported choices cannot be selected by keys.
     * @param {KeyboardEvent} event - Actual keyboard event in this dialog.
     * @returns {void} Handles explicit enabled draft or copy actions.
     * @example
     * // Alt+B selects both body appearances; Alt+D remembers their source.
     */
    event=>{
      if(event.isComposing)return;
      if(event.key==='Enter'&&!(event.target instanceof HTMLButtonElement)){event.preventDefault();event.stopPropagation();root.querySelector<HTMLButtonElement>('[data-modal-value="apply"]')!.click();return;}
      if(!event.altKey||event.ctrlKey||event.metaKey)return;
      /** Original native access keys retain independent body, cell and table groups. */
      const key=/^Key[A-Z]$/u.test(event.code)?event.code.slice(3).toLowerCase():event.key.toLowerCase(),targets:Record<string,string>={l:'[name="format-copy-body"][value="character"]',t:'[name="format-copy-body"][value="paragraph"]',b:'[name="format-copy-body"][value="both"]',f:'[name="format-copy-body"][value="character-style"]',p:'[name="format-copy-body"][value="paragraph-style"]',c:'[name="format-copy-cell-properties"]',o:'[name="format-copy-cell-border"]',g:'[name="format-copy-cell-background"]',h:'[name="format-copy-table-target"][value="both"]',e:'[name="format-copy-table-target"][value="cell"]'};
      if(key==='d'){event.preventDefault();event.stopPropagation();root.querySelector<HTMLButtonElement>('[data-modal-value="apply"]')!.click();}
      else if(targets[key]){event.preventDefault();event.stopPropagation();root.querySelector<HTMLInputElement>(targets[key])!.click();}
    },{signal:listeners.signal});
  update();
  return{
    /**
     * Read the retained independent copy choices after either modal decision.
     *
     * No detached form or source document is consulted.
     * @returns {FormatPainterOptions} Independent current format-copy draft.
     * @example
     * const options=binding.read();
     */
    read():FormatPainterOptions{return{...draft};},
    /**
     * Release listeners owned by this one dialog.
     *
     * Copied source and option snapshots remain usable after teardown.
     * @returns {void} Aborts the dialog's owned control handlers.
     * @example
     * binding.destroy();
     */
    destroy():void{listeners.abort();},
  };
}
