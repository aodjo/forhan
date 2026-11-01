import {expect,type Page} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Original native keyboard conditions retain accepted properties independently from current rendering code. */
interface NativeZoomKeyCase {
  id:string;
  choices:Array<[string,string]>;
  actions:Array<{key:string;digits?:string}>;
  expected:{choice:string;shape:string;ratio:number;columns:number;rows:number;direction:string;horizontalWheel:boolean};
  originalDialogCaptureSha256:string;
  originalViewportCaptureSha256:string;
}

/**
 * Match original enabled and disabled zoom-field access keys through public controls.
 *
 * Original native physical key input and accepted COM values establish fourteen
 * independent conditions. Numeric typing must replace the complete current
 * draft, while disabled controls preserve focus and wheel preferences. All
 * accepted changes remain view state outside source edits and undo history.
 * @async
 * @param {Page} page - Actual browser or selected native application renderer.
 * @param {string} outputRoot - Owned complete-frame observation directory.
 * @returns {Promise<object[]>} Fourteen completed actual keyboard condition identities.
 * @throws {Error} If native focus, numeric replacement, accepted view or original source differs.
 * @example
 * await exerciseNativeZoomFieldAccessKeys(page,outputRoot); // Alt+U then 137 replaces the original 125 draft.
 */
export async function exerciseNativeZoomFieldAccessKeys(page:Page,outputRoot:string):Promise<object[]>{
  /** Literal expected native properties come only from the retained original runtime fixture. */
  const fixture=JSON.parse(await readFile('tests/fixtures/native-zoom-accesskeys.json','utf8')) as {source:{page:object;doc:object;sourceRows:string[]};rows:NativeZoomKeyCase[]},records:object[]=[];
  await mkdir(outputRoot,{recursive:true});
  await page.locator('#file-input').setInputFiles({name:'native-zoom-accesskeys.fhn',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,page:fixture.source.page,doc:fixture.source.doc}))});
  await expect(page.locator('#toast')).toContainText('native-zoom-accesskeys');await expect(page.locator('#toast')).toBeHidden();
  /** Accepted view operations cannot dirty the original source document. */
  const saved=await page.locator('#save-state').textContent(),source=fixture.source.sourceRows.join('');
  for(/** Each original case starts from the same explicit accepted native view. */const condition of fixture.rows){
    await page.locator('#zoom-reset').click();
    await page.locator('[name="native-page-shape"][value="single"]').check();await page.locator('[name="native-zoom-mode"][value="125"]').check();
    await page.locator('[name="native-page-direction"][value="horizontal"]').check();await page.locator('[name="native-zoom-wheel"]').uncheck();
    await page.locator('[name="native-page-direction"][value="vertical"]').check();await page.locator('[data-modal-value="apply"]').click();
    await page.locator('#zoom-reset').click();
    for(/** Observed original pointer choices retain their native dependent-field rules. */const [group,value]of condition.choices)await page.locator(`[name="${group}"][value="${value}"]`).check();
    await page.locator('[data-modal-value="cancel"]').focus();
    for(/** Actual renderer key events retain full numeric selection and real checkbox changes. */const action of condition.actions){
      /** The literal mnemonic identifies one independent input rather than a replacement radio choice. */
      const selectors:Record<string,string>={U:'#native-zoom-value',N:'#native-zoom-columns',Y:'#native-zoom-rows',C:'[name="native-zoom-wheel"]'},input=page.locator(selectors[action.key]),disabled=await input.isDisabled(),previous=action.key==='C'?await input.isChecked():await input.inputValue();
      await page.keyboard.press('Alt+'+action.key.toLowerCase());
      if(disabled){
        await expect(page.locator('[data-modal-value="cancel"]')).toBeFocused();
        if(action.key==='C')expect(await input.isChecked()).toBe(previous);else await expect(input).toHaveValue(String(previous));
      }else{
        await expect(input).toBeFocused();
        if(action.key==='C')expect(await input.isChecked()).toBe(!previous);
      }
      if(action.digits){expect(disabled).toBe(false);await page.keyboard.type(action.digits);await expect(input).toHaveValue(action.digits);}
    }
    /** Complete actual modal frames retain original source coordinates without crop, alignment or recoloring. */
    const file=path.join(outputRoot,condition.id+'.png'),bytes=await page.screenshot({path:file});
    await page.locator('[data-modal-value="apply"]').click();await expect(page.locator('.native-dialog-zoom')).toHaveCount(0);
    /** Original accepted view properties are checked separately from source content and painted geometry. */
    const expected=condition.expected;
    await expect(page.locator('#zoom-reset')).toHaveText(expected.choice==='page'?'쪽 맞춤':expected.ratio+'%');
    await expect(page.locator('#paper')).toHaveAttribute('data-native-page-view',[expected.shape,expected.columns,expected.rows,expected.direction,Number(expected.horizontalWheel)].join(':'));
    expect(await page.locator('.workspace').evaluate(
      /**
       * Read the actual accepted native display scale without modifying the source or view.
       *
       * Raw custom-property tokens retain the exact whole-DPI scale.
       * @param {HTMLElement} workspace - Actual live document workspace.
       * @returns {number} Actual current native display scale.
       * @example
       * // Original accepted 137 percent produces 132 display DPI.
       */
      (workspace:HTMLElement)=>Number(workspace.style.getPropertyValue('--native-zoom')))).toBe(Math.round(expected.ratio*96/100)/96);
    expect(await page.locator('.tiptap').textContent()).toBe(source);expect(await page.locator('#save-state').textContent()).toBe(saved);
    records.push({id:condition.id,file,sha256:createHash('sha256').update(bytes).digest('hex'),originalDialogCaptureSha256:condition.originalDialogCaptureSha256,originalViewportCaptureSha256:condition.originalViewportCaptureSha256});
  }
  await page.locator('#zoom-reset').click();await page.locator('[name="native-zoom-mode"][value="custom"]').check();
  await page.locator('[data-modal-value="cancel"]').focus();await page.keyboard.press('Alt+u');await page.keyboard.type('137');
  await page.locator('[data-modal-value="cancel"]').click();await expect(page.locator('#zoom-reset')).toHaveText('151%');
  await page.locator('.tiptap').press('ControlOrMeta+End');await page.keyboard.type('Z');await expect(page.locator('.tiptap')).toContainText('Z');
  await page.keyboard.press('ControlOrMeta+z');expect(await page.locator('.tiptap').textContent()).toBe(source);expect(records).toHaveLength(14);return records;
}
