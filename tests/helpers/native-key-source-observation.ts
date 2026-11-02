import {test,type Page} from '@playwright/test';

/**
 * Record genuine source caret and keyboard ordering without changing the editor.
 *
 * Document-level listeners observe the original editable root across decoration
 * replacement. They never cancel input, set selection, insert text or call an
 * editor command. Captured source prefixes exclude auxiliary vector drawings.
 * @returns {void} Installs a bounded passive observation buffer in this test-owned page.
 * @example
 * await page.addInitScript(observeNativeKeySource);
 */
export function observeNativeKeySource():void{
  /** All records belong exclusively to this isolated test page. */
  const records:object[]=[],owned=window as Window&{__forhanKeySourceObservations?:object[]};
  owned.__forhanKeySourceObservations=records;
  /**
   * Read the actual original DOM caret and its surrounding source wrappers.
   *
   * The selection is observed in place. A detached source prefix removes only
   * noneditable copies so drawing labels cannot count as authored characters.
   * @param {string} phase - Original event or bounded deferred observation phase.
   * @param {Event} [event] - Original host event when the snapshot has one.
   * @returns {void} Appends an unchanged actual source observation when available.
   * @example
   * snapshot('keyup',event); // A real native right arrow must expose its actual source endpoint.
   */
  function snapshot(phase:string,event?:Event):void{
    if(records.length>=256)return;
    /** Only the current original editable source is eligible for observation. */
    const root=document.querySelector<HTMLElement&{editor?:import('@tiptap/core').Editor}>('.tiptap'),selection=document.getSelection(),focus=selection?.focusNode,anchor=selection?.anchorNode;
    if(!root||!selection||!focus||!anchor||!root.contains(focus)||!root.contains(anchor))return;
    /** Native event flags remain original rather than inferred from a requested shortcut string. */
    const key=event as KeyboardEvent|undefined,input=event as InputEvent|undefined,element=focus.nodeType===Node.ELEMENT_NODE?focus as Element:focus.parentElement,range=document.createRange();
    range.setStart(root,0);range.setEnd(focus,selection.focusOffset);
    /** Detached source observation cannot move the live browser caret. */
    const fragment=range.cloneContents();
    for(/** Drawing-only copies remain excluded from genuine source offsets. */const extra of fragment.querySelectorAll('svg,[contenteditable="false"]'))extra.remove();
    /** The actual focused source style can reveal platform font or wrapper differences. */
    const style=element?getComputedStyle(element):null;
    records.push({phase,time:performance.now(),event:event?.type,key:key?.key,code:key?.code,meta:key?.metaKey,control:key?.ctrlKey,shift:key?.shiftKey,alt:key?.altKey,trusted:event?.isTrusted,defaultPrevented:event?.defaultPrevented,inputType:input?.inputType,data:input?.data,composing:input?.isComposing,
      collapsed:selection.isCollapsed,sourceOffset:fragment.textContent?.length??0,modelSelection:root.editor?.state.selection.toJSON(),focusNode:focus.nodeName,focusOffset:selection.focusOffset,focusText:focus.nodeType===Node.TEXT_NODE?focus.textContent?.slice(0,64):null,anchorNode:anchor.nodeName,anchorOffset:selection.anchorOffset,parentTag:element?.tagName,parentClass:element?.getAttribute('class'),parentStyle:element?.getAttribute('style'),lineKey:element?.closest('[data-forhan-visual-line]')?.getAttribute('data-forhan-visual-line'),font:style?.fontFamily,fontSize:style?.fontSize,rootFont:getComputedStyle(root).fontFamily,activeElement:document.activeElement?.tagName});
  }
  /**
   * Observe original key and input events before their source handlers finish.
   *
   * The deferred snapshot retains the same original event identity after all
   * synchronous handlers, without introducing a source transaction or input.
   * @param {Event} event - Actual event emitted by the owned browser input path.
   * @returns {void} Retains bounded before/after source observations.
   * @example
   * // defaultPrevented records whether an actual application handler owned the key.
   */
  function observe(event:Event):void{
    /** Only genuine source-root event targets are recorded. */
    const target=event.target instanceof Element?event.target:null;
    if(!target?.closest('.tiptap'))return;
    snapshot('before-'+event.type,event);
    queueMicrotask(/**
     * Read the original source after synchronous event handling.
     *
     * No key, selection or expected source text is synthesized.
     * @returns {void} Records the actual current source endpoint and original event flags.
     * @example
     * // An arrow can be observed separately from the following insertText event.
     */()=>snapshot('after-'+event.type,event));
  }
  for(/** Passive event observation never alters browser ownership or editor behavior. */const name of ['focus','focusin','keydown','keyup','beforeinput','input'])document.addEventListener(name,observe,true);
  document.addEventListener('selectionchange',/**
   * Observe an actual asynchronous source selection notification.
   *
   * @param {Event} event - Original browser selection-change event.
   * @returns {void} Retains the source endpoint without changing it.
   * @example
   * // Pending source selection can be compared with the next real typing event.
   */event=>snapshot('selectionchange',event),true);
}

/**
 * Retain the page's read-only native key/source observation buffer.
 *
 * A closed page is recorded as a diagnostic limitation. This attachment cannot
 * turn a failed source assertion into a pass or replace actual output checks.
 * @async
 * @param {Page} page - Isolated public browser renderer owned by this test.
 * @returns {Promise<void>} Resolves after attaching original bounded observations.
 * @throws {Error} If the original diagnostic attachment cannot be retained.
 * @example
 * await retainNativeKeySource(page); // Failure traces keep the actual preceding source caret.
 */
export async function retainNativeKeySource(page:Page):Promise<void>{
  let observation:unknown;
  try{observation=await page.evaluate(/**
   * Return the unchanged test-owned event observation buffer.
   *
   * @returns {object[]} Actual original source/input ordering observations.
   * @example
   * // Reading this buffer dispatches no event and changes no document state.
   */()=>(window as Window&{__forhanKeySourceObservations?:object[]}).__forhanKeySourceObservations??[]);}catch(error){observation={available:false,error:String(error)};}
  await test.info().attach('native-key-source-observations',{body:JSON.stringify(observation,null,2),contentType:'application/json'});
}
