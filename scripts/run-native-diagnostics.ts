import {spawnSync} from 'node:child_process';
import path from 'node:path';

/** Explicit native diagnostic files retain the same complete scope unless an optional title filter is supplied. */
const FILES=['character-width.spec.ts','cold-document-open.spec.ts','contextual-tracking.spec.ts','contextual-width-desktop.spec.ts','desktop.spec.ts','directional-layout-desktop.spec.ts','editable-sheets.spec.ts','font-size.spec.ts','native-body-grid-origin-desktop.spec.ts','native-fit-viewport-desktop.spec.ts','native-format-painter.spec.ts','native-format-painter-desktop.spec.ts','native-format-copy-memory-desktop.spec.ts','native-cell-format-copy.spec.ts','native-cell-format-copy-desktop.spec.ts','native-cell-protection.spec.ts','native-cell-protection-desktop.spec.ts','native-line-layout.spec.ts','native-page-view-desktop.spec.ts','native-pagination-desktop.spec.ts','native-manual-paper-edges.spec.ts','native-manual-paper-edges-desktop.spec.ts','native-paper-framing.spec.ts','native-paper-framing-desktop.spec.ts','native-paper-minimum-insets.spec.ts','native-paper-minimum-insets-desktop.spec.ts','native-paper-viewport-desktop.spec.ts','native-quit-desktop.spec.ts','native-relative-shading-desktop.spec.ts','paragraph-alignment.spec.ts','paragraph-word-break.spec.ts','paragraph-word-break-desktop.spec.ts','portable-fonts.spec.ts','print-layout.spec.ts'];
/** Optional manual filtering remains data passed directly to Playwright rather than shell source. */
const pattern=process.env.FORHAN_DIAGNOSTIC_GREP??'';
/** Bounded repetition diagnoses actual input ordering without retrying failed assertions into a pass. */
const repeats=Number(process.env.FORHAN_DIAGNOSTIC_REPEATS??'1');
if(!Number.isInteger(repeats)||repeats<1||repeats>20)throw new RangeError('Native diagnostic repetitions must be an integer between 1 and 20.');
/** Structured process arguments preserve literal title expressions on both Windows and Mac. */
const result=spawnSync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test',...FILES,...(pattern?['--grep',pattern]:[]),'--repeat-each',String(repeats),'--reporter=line,json'],{stdio:'inherit',shell:false,windowsHide:true,timeout:1200000});
if(result.error)throw result.error;
process.exitCode=result.status??1;
