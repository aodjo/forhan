import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/** Native command observations are bounded independently from actual distribution test outcomes. */
const MAX_COMMAND_BYTES=1024*1024;
/** Only bounded text crash reports from the current CI application's own process family are retained. */
const MAX_CRASH_BYTES=4*1024*1024;
/** A bounded command result records actual output without evaluating shell source. */
interface NativeCommandObservation {status:number|null;signal:NodeJS.Signals|null;stdout:string;stderr:string;error?:string;}

/**
 * Observe one native signing or metadata command through explicit arguments.
 *
 * The read-only command runs without a shell and cannot exceed its output or
 * time budget. Collection errors remain diagnostic data instead of replacing
 * an earlier genuine package-build or application-execution failure.
 * @param {string} executable - Explicit installed native inspection command.
 * @param {string[]} args - Separate read-only command arguments.
 * @returns {NativeCommandObservation} Actual command status and bounded output.
 * @example
 * const signature=observeNativeCommand('codesign',['--display','--verbose=4',bundle]);
 */
function observeNativeCommand(executable:string,args:string[]):NativeCommandObservation {
  /** No shell interpolation or target-program execution is needed for metadata inspection. */
  const result=spawnSync(executable,args,{encoding:'utf8',shell:false,windowsHide:true,timeout:15000,maxBuffer:MAX_COMMAND_BYTES});
  return {status:result.status,signal:result.signal,stdout:result.stdout??'',stderr:result.stderr??'',...(result.error?{error:result.error.message}:{})};
}

/**
 * Retain actual signed-bundle metadata and this CI application's crash reports.
 *
 * Collection is restricted to native GitHub Actions hosts and the current
 * project product name. Original crash bytes remain unchanged, while explicit
 * file-size and file-count limits keep diagnostics bounded. User machines and
 * unrelated process reports are never inspected by this CI-only command.
 * @async
 * @returns {Promise<void>} Writes bounded metadata and original owned crash evidence.
 * @throws {Error} If the host, architecture or generated output cannot be validated.
 * @example
 * // node scripts/collect-macos-package-diagnostics.ts --arch arm64
 */
async function main():Promise<void> {
  if(process.platform!=='darwin'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Mac package diagnostics require the native owned CI host.');
  if(process.argv.length!==4||process.argv[2]!=='--arch'||!['arm64','x64'].includes(process.argv[3]))throw new Error('Expected exactly --arch arm64 or --arch x64.');
  /** Script location and a closed architecture set fix all generated artifact paths. */
  const arch=process.argv[3],root=fileURLToPath(new URL('../',import.meta.url)),manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),
    productName=manifest.build.productName as string,validation=path.join(root,'release','validation'),output=path.join(validation,'macos-package-'+arch),
    bundle=path.join(root,'release',arch==='arm64'?'mac-arm64':'mac',productName+'.app');
  if(typeof productName!=='string'||!productName)throw new Error('The current source product name is missing.');
  await mkdir(output,{recursive:true});
  /** Main and renderer helper entitlements remain actual observations rather than requested build settings. */
  const targets:Array<[string,string]>=[['application',bundle],['renderer',path.join(bundle,'Contents','Frameworks',productName+' Helper (Renderer).app')]],signatures:Record<string,unknown>={},crashes:Array<{name:string;bytes:number;sha256:string}>=[],collectionErrors:string[]=[];
  for(/** Only exact generated application and helper bundles are inspected. */const [kind,target] of targets)signatures[kind]={metadata:observeNativeCommand('codesign',['--display','--verbose=4',target]),entitlements:observeNativeCommand('codesign',['--display','--entitlements',':-',target])};
  /** Generated property lists preserve the exact original executable and display-name representation. */
  const plist=observeNativeCommand('plutil',['-convert','xml1','-o','-',path.join(bundle,'Contents','Info.plist')]);
  try{
    /** Only the ephemeral CI user's standard text-report directory can supply owned process reports. */
    const directory=path.join(homedir(),'Library','Logs','DiagnosticReports'),names:string[]=[];
    for(/** Canonical product-name matching admits Mac filename decomposition without broadening process ownership. */const name of await readdir(directory)){
      /** Only current application-family text reports can be selected. */
      const normalized=name.normalize('NFC'),product=productName.normalize('NFC');
      if((normalized.startsWith(product+'-')||normalized.startsWith(product+' Helper'))&&/\.(?:ips|crash)$/u.test(name))names.push(name);
    }
    for(/** Latest bounded original reports retain their native bytes and independent digests. */const name of names.sort().reverse().slice(0,8)){
      /** The size check precedes reading any actual report content. */
      const file=path.join(directory,name),information=await stat(file);
      if(!information.isFile()||information.size>MAX_CRASH_BYTES){collectionErrors.push('Skipped oversized or non-file owned report: '+name);continue;}
      /** Retaining original bytes avoids Unicode re-encoding or diagnostic postprocessing. */
      const bytes=await readFile(file);await writeFile(path.join(output,name),bytes,{flag:'wx'});
      crashes.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
  }catch(error){collectionErrors.push(error instanceof Error?error.message:String(error));}
  await writeFile(path.join(validation,'macos-package-'+arch+'.json'),JSON.stringify({kind:'actual-owned-ci-macos-signing-and-crash-observation',recordedAt:new Date().toISOString(),arch,productName,bundle,signatures,plist,crashes,collectionErrors},null,2)+'\n');
  console.log(JSON.stringify({arch,ownedCrashReports:crashes.length,collectionErrors:collectionErrors.length,metadata:path.relative(root,path.join(validation,'macos-package-'+arch+'.json'))}));
}

await main();
