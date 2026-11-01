import type {NativeDialogMarkup} from './native-dialogs.ts';
import type {NativePageView,NativePageShape} from './native-page-view.ts';
import type {NativeFitMode} from './native-fit.ts';

/** Native fixed percentages coexist with independent custom input and persistent fit choices. */
export type NativeZoomChoice='100'|'125'|'150'|'200'|'300'|'500'|'custom'|NativeFitMode;
/** An editable view draft cannot mutate authored page geometry or source history. */
export interface NativeZoomDraft {choice:NativeZoomChoice;zoom:number;view:NativePageView;}
/** An owned dialog binding retains its draft after shared modal teardown. */
export interface NativeZoomDialogBinding {
  /**
   * Read an independent accepted or cancelled view draft.
   *
   * Input events retain values before the shared modal removes its controls.
   * @returns {NativeZoomDraft} Independent current draft without document mutations.
   * @example
   * const draft=binding.read();
   */
  read():NativeZoomDraft;
  /**
   * Release dialog-owned control and keyboard listeners.
   *
   * The retained draft remains readable after detached controls are discarded.
   * @returns {void} Aborts every listener owned by this dialog binding.
   * @example
   * binding.destroy();
   */
  destroy():void;
}
/** Literal original fixed percentages retain the captured native control order. */
export const NATIVE_ZOOM_PRESETS=['100','125','150','200','300','500'] as const;

/**
 * Render one measured native radio option without changing its logical group.
 *
 * Selected labels receive native keyboard focus while actual radio semantics
 * retain native arrow-key navigation and accessible grouping.
 * @param {string} group - Trusted native radio group name.
 * @param {string} value - Trusted native option value.
 * @param {string} label - Literal native caption.
 * @param {string} selected - Current selected value for the group.
 * @param {number} x - Measured option origin within its native group.
 * @param {number} y - Measured vertical origin within its native group.
 * @param {boolean} [focus=false] - Whether this selected group owns initial modal focus.
 * @returns {string} Native radio markup with an independent accessible label.
 * @example
 * radio('native-zoom-mode','125','125%','125',15,49,true);
 */
function radio(group:string,value:string,label:string,selected:string,x:number,y:number,focus=false):string{
  return `<label class="nz-option" style="left:${x}px;top:${y}px"><input type="radio" name="${group}" value="${value}" ${value===selected?'checked':''} ${focus&&value===selected?'autofocus':''}><span>${label}</span></label>`;
}

/**
 * Render an independent native integer field and its working spinner buttons.
 *
 * Native disabled fields remain visible while their values stay independent
 * from the chosen preset or fit radio until the dialog is accepted.
 * @param {string} id - Trusted stable public field identifier.
 * @param {string} label - Accessible native field purpose.
 * @param {number} value - Current independent field value.
 * @param {number} minimum - Native integer entry minimum.
 * @param {number} maximum - Native integer entry maximum.
 * @param {boolean} enabled - Whether the current draft enables this field.
 * @param {string} className - Trusted scoped layout class.
 * @param {boolean} [percent=false] - Whether an active field includes the native percent unit.
 * @returns {string} Actual editable integer input with native step controls.
 * @example
 * spinner('native-zoom-value','사용자 정의 배율',125,10,500,false,'nz-custom',true);
 */
function spinner(id:string,label:string,value:number,minimum:number,maximum:number,enabled:boolean,className:string,percent=false):string{
  return `<span class="nz-spin ${className}${enabled?'':' nz-disabled'}"><input id="${id}" type="number" aria-label="${label}" min="${minimum}" max="${maximum}" step="1" value="${value}" ${enabled?'':'disabled'}>${percent?'<span class="nz-unit">%</span>':''}<button type="button" class="nz-up" data-zoom-field="${id}" data-zoom-step="1" aria-label="${label} 늘리기" ${enabled?'':'disabled'}></button><button type="button" class="nz-down" data-zoom-field="${id}" data-zoom-step="-1" aria-label="${label} 줄이기" ${enabled?'':'disabled'}></button></span>`;
}

/**
 * Recreate the original native zoom dialog with working independent view choices.
 *
 * Literal original 468-by-459 geometry keeps percentage, arrangement and
 * scrolling groups separate. Fixed percentages do not overwrite the custom
 * field. Multiple-page and direction controls remain explicit draft choices.
 * @param {NativeZoomDraft} draft - Independent current editor view snapshot.
 * @returns {NativeDialogMarkup} Measured native dialog markup and exact outer dimensions.
 * @example
 * const layout=renderNativeZoomDialog({choice:'width',zoom:168,view});
 */
export function renderNativeZoomDialog(draft:NativeZoomDraft):NativeDialogMarkup{
  /** Original native fixed options occupy their own first column. */
  let scale='';
  for(let index=0;index<NATIVE_ZOOM_PRESETS.length;index++)scale+=radio('native-zoom-mode',NATIVE_ZOOM_PRESETS[index],NATIVE_ZOOM_PRESETS[index]+'%',draft.choice,15,25+index*24,true);
  scale+=radio('native-zoom-mode','width','폭 맞춤',draft.choice,94,25,true)+radio('native-zoom-mode','page','쪽 맞춤',draft.choice,94,49,true)+radio('native-zoom-mode','custom','사용자 정의',draft.choice,94,73,true);
  /** Captured source order remains separate from the physical second-column option. */
  const shapes=[['auto','자동',15,25],['single','한 쪽',15,49],['two','두 쪽',15,73],['facing','맞쪽',15,97],['multiple','여러 쪽',87,25]] as const;
  let arrangement='';
  for(/** Actual radio controls retain the original native grouping. */const [value,label,x,y]of shapes)arrangement+=radio('native-page-shape',value,label,draft.view.shape,x,y);
  /** Header controls offer local help while preserving the original measured caption geometry. */
  const header='<header class="modal-header"><h2 id="modal-title">확대/축소</h2><button type="button" class="nz-quick-help" data-zoom-help aria-label="빠른 도움말"><svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M1.5 1.5h10v8h-4l-2 2v-2h-4zM3.5 4h6M3.5 6h6" fill="none" stroke="currentColor" stroke-width="0.8"/></svg></button><button type="button" class="nz-help" data-zoom-help aria-label="도움말">?</button><button type="button" class="modal-x" aria-label="닫기">×</button></header>';
  return{width:468,height:459,className:'native-dialog native-dialog-zoom',html:header+`<div class="modal-body"><form id="native-zoom-form"><fieldset class="nz-group nz-scale"><legend>배율</legend>${scale}${spinner('native-zoom-value','사용자 정의 배율',draft.zoom,10,500,draft.choice==='custom','nz-custom',true)}</fieldset><fieldset class="nz-group nz-shape"><legend>쪽 모양</legend>${arrangement}${spinner('native-zoom-columns','가로 쪽 수',draft.view.columns,1,8,draft.view.shape==='multiple','nz-columns')}<span class="nz-times">×</span>${spinner('native-zoom-rows','세로 쪽 수',draft.view.rows,1,8,draft.view.shape==='multiple','nz-rows')}</fieldset><fieldset class="nz-group nz-direction"><legend>쪽 이동</legend>${radio('native-page-direction','vertical','세로 방향',draft.view.direction,15,25)}${radio('native-page-direction','horizontal','가로 방향',draft.view.direction,15,49)}<label class="nz-wheel"><input type="checkbox" name="native-zoom-wheel" ${draft.view.horizontalWheel?'checked':''} ${draft.view.direction==='horizontal'?'':'disabled'}><span>마우스 휠을 사용하여 좌우로 스크롤 하기</span></label></fieldset></form></div><div class="modal-actions"><button type="button" class="nd-apply" data-modal-value="apply">설정(<u>D</u>)</button><button type="button" data-modal-value="cancel">취소</button></div><div class="nz-help-text" hidden>배율과 쪽 모양을 선택한 뒤 설정을 누르면 화면에 적용됩니다. 취소하면 현재 보기를 유지합니다.</div>`};
}

/**
 * Bind original native draft transitions without creating a document transaction.
 *
 * Percentage fields stay independent from fixed choices. Selecting multiple
 * pages initially selects page fitting; a later explicit percentage remains
 * valid with that arrangement. Horizontal direction initially enables wheel
 * scrolling, and vertical direction retains its disabled wheel preference.
 * @param {HTMLElement} root - Actual owned native zoom dialog.
 * @param {NativeZoomDraft} initial - Independent initial editor view snapshot.
 * @returns {NativeZoomDialogBinding} Retained draft reader and explicit listener teardown.
 * @example
 * const binding=bindNativeZoomDialog(dialog,initial); // Cancel never updates the live editor view.
 */
export function bindNativeZoomDialog(root:HTMLElement,initial:NativeZoomDraft):NativeZoomDialogBinding{
  /** All dialog work belongs to one abortable listener scope and one independent draft. */
  const listeners=new AbortController(),draft:NativeZoomDraft={...initial,view:{...initial.view}};
  /**
   * Synchronize enabled native fields without replacing their independent text.
   *
   * Changing a preset leaves the custom value intact and no live view changes.
   * @returns {void} Updates only the dialog's actual dependent controls.
   * @example
   * update(); // Selecting custom enables its input and both spinner buttons.
   */
  function update():void{
    for(/** Spinner groups follow only their own actual radio choice. */const [id,enabled]of [['native-zoom-value',draft.choice==='custom'],['native-zoom-columns',draft.view.shape==='multiple'],['native-zoom-rows',draft.view.shape==='multiple']] as const){
      /** Native disabled input and step controls retain their original draft values. */
      const input=root.querySelector<HTMLInputElement>('#'+id)!,group=input.closest('.nz-spin')!;input.disabled=!enabled;group.classList.toggle('nz-disabled',!enabled);
      for(/** A disabled source field cannot receive a spinner action. */const button of group.querySelectorAll<HTMLButtonElement>('button'))button.disabled=!enabled;
    }
    root.querySelector<HTMLInputElement>('[name="native-zoom-wheel"]')!.disabled=draft.view.direction!=='horizontal';
  }
  /**
   * Retain actual control changes before the shared modal can remove its DOM.
   *
   * Dependent native choices alter only this isolated draft.
   * @param {Event} event - Actual bubbling control input or change event.
   * @returns {void} Updates the retained independent view draft.
   * @example
   * // Entering a custom percentage never applies it before the explicit decision.
   */
  function change(event:Event):void{
    /** Only actual named native inputs own view choices. */
    const input=event.target;if(!(input instanceof HTMLInputElement))return;
    if(input.name==='native-zoom-mode'){
      draft.choice=input.value as NativeZoomChoice;update();
      if(draft.choice==='custom'){
        /** Native custom selection focuses and selects its independent numeric draft. */
        const custom=root.querySelector<HTMLInputElement>('#native-zoom-value')!;custom.focus();custom.select();
      }
    }else if(input.name==='native-page-shape'){
      draft.view.shape=input.value as NativePageShape;
      if(draft.view.shape==='single'){draft.view.columns=1;draft.view.rows=1;}
      else if(draft.view.shape==='two'||draft.view.shape==='facing'){draft.view.columns=2;draft.view.rows=1;}
      else if(draft.view.shape==='multiple'){draft.choice='page';root.querySelector<HTMLInputElement>('[name="native-zoom-mode"][value="page"]')!.checked=true;}
      if(draft.view.shape==='auto'){
        if(!Number.isInteger(draft.view.columns)||draft.view.columns<1||draft.view.columns>8)draft.view.columns=1;
        if(!Number.isInteger(draft.view.rows)||draft.view.rows<1||draft.view.rows>8)draft.view.rows=1;
      }
      root.querySelector<HTMLInputElement>('#native-zoom-columns')!.value=String(draft.view.columns);root.querySelector<HTMLInputElement>('#native-zoom-rows')!.value=String(draft.view.rows);update();
      if(draft.view.shape==='multiple'){
        /** Native multiple-page selection focuses its first independent count. */
        const columns=root.querySelector<HTMLInputElement>('#native-zoom-columns')!;columns.focus();columns.select();
      }
    }else if(input.name==='native-page-direction'){
      draft.view.direction=input.value==='horizontal'?'horizontal':'vertical';
      if(draft.view.direction==='horizontal'){draft.view.horizontalWheel=true;root.querySelector<HTMLInputElement>('[name="native-zoom-wheel"]')!.checked=true;}update();
    }else if(input.name==='native-zoom-wheel')draft.view.horizontalWheel=input.checked;
    else if(input.id==='native-zoom-value')draft.zoom=Number(input.value);
    else if(input.id==='native-zoom-columns')draft.view.columns=Number(input.value);
    else if(input.id==='native-zoom-rows')draft.view.rows=Number(input.value);
  }
  root.addEventListener('change',change,{signal:listeners.signal});
  root.addEventListener('input',
    /**
     * Capture numeric typing independently from radio focus transitions.
     *
     * Radio change events own dependent focus changes exactly once.
     * @param {Event} event - Actual numeric or checkbox input event.
     * @returns {void} Retains current numeric text for an eventual explicit decision.
     * @example
     * // Filling 137 retains 137 even when the modal DOM is later removed.
     */
    event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='number')change(event);},{signal:listeners.signal});
  root.addEventListener('click',
    /**
     * Dispatch actual native spinners and local help from the owned dialog.
     *
     * Step controls retain the same input events used by keyboard entry.
     * @param {MouseEvent} event - Actual owned dialog click.
     * @returns {void} Performs only the selected draft or local help operation.
     * @example
     * // A spinner increases an enabled custom draft by one native percent.
     */
    event=>{
      /** The nearest owned button identifies an explicit local dialog operation. */
      const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!button)return;
      if(button.hasAttribute('data-zoom-help')){root.querySelector<HTMLElement>('.nz-help-text')!.hidden=!root.querySelector<HTMLElement>('.nz-help-text')!.hidden;return;}
      if(!button.dataset.zoomField)return;
      /** A real enabled numeric field retains standard validity and step boundaries. */
      const input=root.querySelector<HTMLInputElement>('#'+button.dataset.zoomField)!;if(input.disabled)return;
      if(Number(button.dataset.zoomStep)>0)input.stepUp();else input.stepDown();input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
    },{signal:listeners.signal});
  root.addEventListener('keydown',
    /**
     * Preserve native access keys and explicit Enter application.
     *
     * Keyboard choice changes dispatch the same real draft events as pointer
     * selection. Escape remains owned by the shared modal cancellation trap.
     * @param {KeyboardEvent} event - Original owned native dialog key.
     * @returns {void} Handles native shortcuts while preserving ordinary input editing.
     * @example
     * // Alt+M selects multiple pages and Alt+D applies its explicit draft.
     */
    event=>{
      if(event.key==='Enter'&&!(event.target instanceof HTMLButtonElement)){event.preventDefault();event.stopPropagation();root.querySelector<HTMLButtonElement>('[data-modal-value="apply"]')!.click();return;}
      if(!event.altKey||event.ctrlKey||event.metaKey)return;
      /** Native access keys retain the observed original options and groups. */
      const shortcuts:Record<string,[string,string]>={'1':['native-zoom-mode','100'],'2':['native-zoom-mode','125'],'3':['native-zoom-mode','150'],'4':['native-zoom-mode','200'],'5':['native-zoom-mode','300'],'6':['native-zoom-mode','500'],w:['native-zoom-mode','width'],p:['native-zoom-mode','page'],j:['native-zoom-mode','custom'],o:['native-page-shape','auto'],s:['native-page-shape','single'],t:['native-page-shape','two'],a:['native-page-shape','facing'],m:['native-page-shape','multiple'],v:['native-page-direction','vertical'],h:['native-page-direction','horizontal']},key=event.key.toLowerCase(),target=shortcuts[key];
      /** Original field mnemonics retain their own enabled state and never select a different radio choice. */
      const fields:Record<string,string>={u:'#native-zoom-value',n:'#native-zoom-columns',y:'#native-zoom-rows',c:'[name="native-zoom-wheel"]'},field=fields[key];
      if(field){
        event.preventDefault();
        /** Numeric access keys select the complete independent draft; the enabled wheel shortcut toggles its real checkbox. */
        const input=root.querySelector<HTMLInputElement>(field)!;
        if(!input.disabled){input.focus();if(input.type==='checkbox')input.click();else input.select();}
        return;
      }
      if(key==='d'){event.preventDefault();root.querySelector<HTMLButtonElement>('[data-modal-value="apply"]')!.click();}
      else if(target){event.preventDefault();root.querySelector<HTMLInputElement>(`[name="${target[0]}"][value="${target[1]}"]`)!.click();}
    },{signal:listeners.signal});
  update();
  return{
    /**
     * Return an independent retained draft after either explicit modal decision.
     *
     * Detached DOM controls are never consulted after modal teardown.
     * @returns {NativeZoomDraft} Independent current native view draft.
     * @example
     * binding.read();
     */
    read():NativeZoomDraft{return{...draft,view:{...draft.view}};},
    /**
     * Release all control listeners owned by this dialog.
     *
     * The retained snapshot remains available without keeping active handlers.
     * @returns {void} Aborts owned listeners.
     * @example
     * binding.destroy();
     */
    destroy():void{listeners.abort();},
  };
}
