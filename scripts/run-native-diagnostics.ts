import {spawnSync} from 'node:child_process';
import path from 'node:path';

/** Explicit native diagnostic files retain the same complete scope unless an optional title filter is supplied. */
const FILES=['character-width.spec.ts','cold-document-open.spec.ts','contextual-tracking.spec.ts','contextual-width-desktop.spec.ts','desktop.spec.ts','directional-layout-desktop.spec.ts','editable-sheets.spec.ts','font-size.spec.ts','native-body-grid-origin-desktop.spec.ts','native-fit-viewport-desktop.spec.ts','native-format-painter.spec.ts','native-format-painter-desktop.spec.ts','native-line-layout.spec.ts','native-page-view-desktop.spec.ts','native-pagination-desktop.spec.ts','native-manual-paper-edges.spec.ts','native-manual-paper-edges-desktop.spec.ts','native-paper-framing.spec.ts','native-paper-framing-desktop.spec.ts','native-paper-minimum-insets.spec.ts','native-paper-minimum-insets-desktop.spec.ts','native-paper-viewport-desktop.spec.ts','native-quit-desktop.spec.ts','native-relative-shading-desktop.spec.ts','paragraph-alignment.spec.ts','paragraph-word-break.spec.ts','paragraph-word-break-desktop.spec.ts','portable-fonts.spec.ts','print-layout.spec.ts'];
/** Optional manual filtering remains data passed directly to Playwright rather than shell source. */
const pattern=process.env.FORHAN_DIAGNOSTIC_GREP??'';
/** Structured process arguments preserve literal title expressions on both Windows and Mac. */
const result=spawnSync(process.execPath,[path.resolve('node_modules/@playwright/test/cli.js'),'test',...FILES,...(pattern?['--grep',pattern]:[]),'--reporter=line,json'],{stdio:'inherit',shell:false,windowsHide:true,timeout:1200000});
if(result.error)throw result.error;
process.exitCode=result.status??1;
