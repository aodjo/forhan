import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startVirtualMacDisplay,type VirtualDisplayReady} from './macos-virtual-display.ts';

/** Native viewport fixtures reach 1440x1100; the CI display also needs room for system chrome. */
const MINIMUM_DISPLAY_WIDTH=1600;
/** An unscaled1200-pixel screen contains the original1100-pixel fixture plus native system chrome. */
const MINIMUM_DISPLAY_HEIGHT=1200;
/** One real unscaled display mode comes from the native displayplacer's original enumeration. */
interface NativeDisplayMode {index:number;width:number;height:number;}
/** The real primary display retains its current geometry and available native modes. */
interface NativeDisplay {id:string;width:number;height:number;scaled:boolean;modes:NativeDisplayMode[];}

/**
 * Run the installed display utility without invoking a command shell.
 *
 * Only the ephemeral GitHub macOS runner calls this setup script. Native
 * display enumeration and changes retain the utility's original output.
 * @param {string[]} args - Explicit display utility arguments.
 * @returns {string} Original native utility output.
 * @throws {Error} If the utility is unavailable, fails or exceeds its deadline.
 * @example
 * const listing=runDisplayCommand(['list']);
 */
function runDisplayCommand(args:string[]):string{
  return execFileSync('displayplacer',args,{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
}

/**
 * Read the actual primary screen and its available unscaled native modes.
 *
 * The utility enumerates each display before its modes. Scaling-enabled modes
 * are excluded because their physical pixel count cannot establish enough
 * usable points for the original native window fixtures. Unknown output fails
 * explicitly instead of changing the expected viewport or skipping tests.
 * @param {string} listing - Unmodified output from displayplacer list.
 * @returns {NativeDisplay} Actual primary screen and its unscaled modes.
 * @throws {Error} If the actual primary screen or its geometry is unavailable.
 * @example
 * const screen=readPrimaryDisplay(runDisplayCommand(['list']));
 */
function readPrimaryDisplay(listing:string):NativeDisplay{
  for(/** Each original display block retains its own identifiers and mode indices. */const block of listing.split(/(?=^Persistent screen id:)/mu)){
    if(!/^Origin:.*- main display\s*$/mu.test(block))continue;
    /** Screen identity and current native mode are parsed independently from requested fixture sizes. */
    const id=/^Persistent screen id:\s*([A-Fa-f0-9-]+)\s*$/mu.exec(block)?.[1],resolution=/^Resolution:\s*(\d+)x(\d+)\s*$/mu.exec(block),scaling=/^Scaling:\s*(on|off)\s*$/mu.exec(block),modes:NativeDisplayMode[]=[];
    if(!id||!resolution||!scaling)throw new Error('The actual primary display metadata is incomplete.');
    for(/** Native mode rows remain literal original observations from the selected screen. */const match of block.matchAll(/^\s+mode (\d+): res:(\d+)x(\d+)([^\r\n]*)$/gmu)){
      if(/\bscaling:on\b/u.test(match[4]))continue;
      modes.push({index:Number(match[1]),width:Number(match[2]),height:Number(match[3])});
    }
    return{id,width:Number(resolution[1]),height:Number(resolution[2]),scaled:scaling[1]==='on',modes};
  }
  throw new Error('The actual native primary display was not enumerated.');
}

/**
 * Give ephemeral macOS CI a real display large enough for original fixtures.
 *
 * The macOS runner previously constrained requested1100-pixel windows to1055
 * pixels. This changes the runner's actual native display mode before tests;
 * application source, renderer viewport emulation and reference pixels remain
 * unchanged. An owned actual native screen is created only when no advertised
 * mode is sufficient. Local machines are rejected before any display command executes.
 * The original enumeration and final native result are retained on failure too.
 * @async
 * @returns {Promise<void>} Resolves after a sufficiently large unscaled native mode is observed.
 * @throws {Error} If the host is not ephemeral macOS CI or actual display setup fails.
 * @example
 * // GitHub's Mac jobs run this after installing displayplacer and before native UI tests.
 */
async function prepareNativeMacDisplay():Promise<void>{
  if(process.platform!=='darwin'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Native display setup is restricted to ephemeral GitHub macOS runners.');
  /** Native setup evidence is retained separately from Playwright's cleared output directory. */
  const directory=path.resolve('release/validation'),file=path.join(directory,'native-display-darwin-'+process.arch+'.json');
  await mkdir(directory,{recursive:true});
  let before='',after='',selected:NativeDisplayMode|undefined,virtual:VirtualDisplayReady|undefined,success=false,dockAutoHide=false,error:string|undefined;
  try{
    execFileSync('defaults',['write','com.apple.dock','autohide','-bool','true'],{encoding:'utf8',timeout:10000});
    dockAutoHide=execFileSync('defaults',['read','com.apple.dock','autohide'],{encoding:'utf8',timeout:10000}).trim()==='1';
    if(!dockAutoHide)throw new Error('The ephemeral runner Dock auto-hide preference was not applied.');
    before=runDisplayCommand(['list']);
    /** Only the actual primary display's advertised unscaled modes are eligible. */
    const display=readPrimaryDisplay(before);
    if(display.scaled||display.width<MINIMUM_DISPLAY_WIDTH||display.height<MINIMUM_DISPLAY_HEIGHT){
      for(/** The smallest sufficient advertised native mode avoids unnecessarily large test desktops. */const mode of display.modes){
        if(mode.width<MINIMUM_DISPLAY_WIDTH||mode.height<MINIMUM_DISPLAY_HEIGHT)continue;
        if(!selected||mode.width*mode.height<selected.width*selected.height)selected=mode;
      }
      if(selected)runDisplayCommand([`id:${display.id} mode:${selected.index}`]);
      else virtual=await startVirtualMacDisplay();
    }
    after=runDisplayCommand(['list']);
    /** The actual final native mode must satisfy the setup contract independently of the command request. */
    const observed=readPrimaryDisplay(after);
    if(observed.scaled||observed.width<MINIMUM_DISPLAY_WIDTH||observed.height<MINIMUM_DISPLAY_HEIGHT)throw new Error('The actual native display did not apply a sufficiently large unscaled mode.');
    success=true;
    console.log(`Native macOS display: ${observed.width}x${observed.height}, scaling off.`);
  }catch(cause){error=cause instanceof Error?cause.message:String(cause);throw cause;}
  finally{await writeFile(file,JSON.stringify({kind:'actual-macos-ci-native-display-setup',recordedAt:new Date().toISOString(),success,minimumWidth:MINIMUM_DISPLAY_WIDTH,minimumHeight:MINIMUM_DISPLAY_HEIGHT,runnerDockAutoHidePreference:dockAutoHide,selected,virtual,before,after,error},null,2)+'\n');}
}

await prepareNativeMacDisplay();
