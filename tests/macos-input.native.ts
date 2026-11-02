import {test,expect,_electron as electron} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {desktopLaunchOptions,closeOwnedDesktop} from './helpers/desktop-launch.ts';
import {imeSourceText,observeImeEvents,imeEvents} from './helpers/windows-ime.ts';

/** Native helpers execute without shell interpolation or blocking the owned renderer. */
const execute=promisify(execFile);
/** Physical Apple virtual keys type an independently expected two-set Korean sentence and commit its final syllable. */
const KOREAN_KEYS=[15,40,0,17,40,5,40,12,1,37,14,40,47,49,5,40,1,15,46,3,49];

/**
 * Verify real Apple input-method composition and ordered original source at several typing rates.
 *
 * The native helper selects the installed two-set input source, posts physical
 * keys only to the owned foreground application and restores the original mode.
 * Passive records must contain trusted composition, not merely completed text.
 * @async
 * @returns {Promise<void>} Resolves after all physical input cases and source serialization agree.
 * @throws {Error} If native input access, actual composition, source order or cleanup fails.
 * @example
 * // Real R K A T K G K Q S L E K keys must compose 감사합니다.
 */
async function verifyMacInput():Promise<void>{
  if(process.platform!=='darwin')throw new Error('Actual macOS is required for this native input test.');
  /** Only this process owns the temporary application profile and native helper output. */
  const profile=await mkdtemp(path.join(tmpdir(),'forhan-macos-input-'));
  /** The actual selected development or packaged runtime retains its original platform and architecture. */
  const desktop=await electron.launch(desktopLaunchOptions(profile));
  /** Each original case retains actual host events before any expected-source assertion. */
  const rows:unknown[]=[];
  await mkdir('release/validation',{recursive:true});
  try{
    /** The only native target is the application process launched by this test. */
    const page=await desktop.firstWindow(),pid=desktop.process().pid!;
    await page.locator('.tiptap').waitFor({timeout:30000});
    for(/** Slow, ordinary and rapid actual key intervals cover separate composition timing conditions. */const interval of [100,30,5]){
      /** Unique source names prevent an earlier completed document from satisfying a later case. */
      const name=`mac-input-${interval}.fhn`,reportFile=path.resolve(`release/validation/macos-input-${interval}.json`);
      await page.locator('#file-input').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({application:'forhan',version:1,doc:{type:'doc',content:[{type:'paragraph'}]}}))});
      await expect(page.locator('#toast')).toContainText(name);
      await page.locator('.tiptap').click();
      await page.locator('.tiptap').evaluate(observeImeEvents);
      /** Native accessibility absence fails explicitly and retains the helper's original observations. */
      const result=await execute(path.resolve('release/validation/macos-keyboard'),[String(pid),JSON.stringify(KOREAN_KEYS),String(interval),reportFile],{timeout:30000});
      /** Actual helper output is separate from any expected document string. */
      const native=JSON.parse(await readFile(reportFile,'utf8'));
      /** Capture original events before an assertion can fail on lost or reordered text. */
      const events=await imeEvents(page),actual=await page.locator('.tiptap').evaluate(imeSourceText);
      rows.push({interval,native,events,actual,helperStderr:result.stderr});
      await expect.poll(
        /**
         * Read original source after physical Apple keyboard processing.
         *
         * Generated drawings are excluded and no input event is synthesized.
         * @returns {Promise<string>} Current real editable source text.
         * @example
         * // Missing or reordered syllables remain observable failures.
         */
        ()=>page.locator('.tiptap').evaluate(imeSourceText),
      ).toBe('감사합니다. 한글 ');
      expect(native.selectedInputSource).toBe('com.apple.inputmethod.Korean.2SetKorean');
      expect(native.restoredInputSource).toBe(native.originalInputSource);
      expect(events.some(
        /**
         * Require actual native preedit rather than only completed Unicode insertion.
         *
         * The original browser trust flag is inspected without being changed.
         * @param {import('./helpers/windows-ime.ts').ImeDomObservation} event - Passive actual host event.
         * @returns {boolean} Whether this is a trusted original composition update.
         * @example
         * // A protocol-only completed string cannot satisfy the native input path.
         */
        event=>event.type==='compositionupdate'&&event.trusted,
      )).toBe(true);
    }
  }finally{
    await writeFile('release/validation/macos-input-observations.json',JSON.stringify({platform:process.platform,arch:process.arch,rows},null,2));
    await closeOwnedDesktop(desktop);
    await rm(profile,{recursive:true,force:true});
  }
}

test('actual Apple two-set input preserves Korean syllables and order at slow and rapid typing rates',verifyMacInput);
