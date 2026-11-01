import {execFileSync,spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';

/** Original native display bounds never use renderer viewport emulation. */
interface DisplayBounds {id:number;x:number;y:number;width:number;height:number;}
/** A separate native process observes actual primary ownership and active screen bounds. */
interface NativeDisplays {primaryDisplayId:number;displays:DisplayBounds[];}
/** Actual virtual-screen readiness is emitted only after original CoreGraphics verification. */
export interface VirtualDisplayReady {kind:string;nonce:string;pid:number;displayId:number;primaryDisplayId:number;width:number;height:number;pixelWidth:number;pixelHeight:number;}
/** An invocation-specific state record prevents cleanup from targeting another process. */
interface DisplayOwner {directory:string;nonce:string;pid:number;executable:string;executableSha256:string;fingerprint:string|null;before:NativeDisplays;ready?:VirtualDisplayReady;}
/** Native helper state remains separate from application packages and renderer test output. */
const VALIDATION_DIRECTORY=path.resolve('release/validation');
/** One ephemeral CI job owns at most one helper for its current native architecture. */
const OWNER_FILE=path.join(VALIDATION_DIRECTORY,`native-display-owner-darwin-${process.arch}.json`);

/**
 * Reject native display changes outside an ephemeral macOS GitHub runner.
 *
 * Both setup and teardown use this guard before reading owner files or invoking
 * native tools, so ordinary local development cannot alter a personal display.
 * @returns {void} Continues only on the explicitly supported disposable host.
 * @throws {Error} If the current host is not an ephemeral macOS CI runner.
 * @example
 * requireNativeDisplayRunner(); // Rejects Windows and ordinary local Macs.
 */
function requireNativeDisplayRunner():void{
  if(process.platform!=='darwin'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Virtual display setup is restricted to ephemeral GitHub macOS runners.');
}

/**
 * Read exact native process start information and command ownership.
 *
 * A missing PID is an ordinary terminated actor. Other process-query failures
 * remain errors rather than being interpreted as successful cleanup.
 * @param {number} pid - Exact process identifier recorded by this invocation.
 * @returns {string|null} Original process fingerprint, or null if it no longer exists.
 * @throws {Error} If the native process query fails for a reason other than absence.
 * @example
 * const fingerprint=readDisplayProcessFingerprint(owner.pid);
 */
function readDisplayProcessFingerprint(pid:number):string|null{
  try{return execFileSync('/bin/ps',['-p',String(pid),'-o','lstart=','-o','command='],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();}
  catch(error){if((error as {status?:number}).status===1)return null;throw error;}
}

/**
 * Yield briefly while the same owned native actor changes state.
 *
 * Setup and teardown poll their original process and marker files without
 * launching replacement actors merely because an observation is delayed.
 * @async
 * @returns {Promise<void>} Resolves after a quarter-second observation interval.
 * @example
 * await waitForDisplayObservation();
 */
async function waitForDisplayObservation():Promise<void>{
  await new Promise<void>(
    /**
     * Schedule the next observation of the already running native actor.
     *
     * This timer neither starts a process nor modifies a display configuration.
     * @param {()=>void} resolve - Completion callback for the observation interval.
     * @returns {void} Schedules the existing state check to continue.
     * @example
     * // The owning polling loop resumes after250ms.
     */
    function scheduleObservation(resolve){setTimeout(resolve,250);}
  );
}

/**
 * Create one real native CI display when advertised modes cannot fit original fixtures.
 *
 * An invocation-specific helper retains the CoreGraphics display object while
 * tests run. Independent native queries establish its original bounds, actual
 * pixel dimensions and primary ownership; no renderer or reference is changed.
 * @async
 * @returns {Promise<VirtualDisplayReady>} Original verified native readiness record.
 * @throws {Error} If compilation, private native API support, ownership or readiness fails.
 * @example
 * const ready=await startVirtualMacDisplay(); // A real1920x1440 screen owns native windows.
 */
export async function startVirtualMacDisplay():Promise<VirtualDisplayReady>{
  requireNativeDisplayRunner();
  await mkdir(VALIDATION_DIRECTORY,{recursive:true});
  /** All native artifacts and process arguments belong to one private temporary invocation. */
  const directory=await mkdtemp(path.join(tmpdir(),'forhan-ci-native-display-')),nonce=randomUUID(),executable=path.join(directory,'forhan-ci-native-display'),source=path.resolve('scripts/native/macos-ci-display.m');
  execFileSync('clang',['-fobjc-arc','-O0','-Wall','-Wextra','-Werror','-framework','Foundation','-framework','CoreGraphics',source,'-o',executable],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  /** Actual original display state is queried before the owned native actor exists. */
  const before=JSON.parse(execFileSync(executable,['--inspect'],{encoding:'utf8',timeout:10000})) as NativeDisplays,
    executableSha256=createHash('sha256').update(await readFile(executable)).digest('hex'),logFile=path.join(VALIDATION_DIRECTORY,`native-display-helper-darwin-${process.arch}.log`),descriptor=openSync(logFile,'wx');
  let launchError:Error|undefined;
  /** Detached process ownership survives the setup script only until explicit workflow cleanup. */
  const actor=spawn(executable,[directory,nonce],{detached:true,stdio:['ignore',descriptor,descriptor]});
  closeSync(descriptor);
  actor.on('error',
    /**
     * Retain a native launch failure for the original readiness polling loop.
     *
     * The failed actor is never replaced automatically with another invocation.
     * @param {Error} error - Original process launch error.
     * @returns {void} Stores the original failure for explicit setup rejection.
     * @example
     * // A missing executable remains a failed setup, not a successful display.
     */
    function retainLaunchError(error){launchError=error;}
  );
  actor.unref();
  if(!actor.pid)throw new Error('The owned native display helper did not receive a process identifier.');
  /** The fingerprint binds a PID to this exact executable, start time and private nonce. */
  const owner:DisplayOwner={directory,nonce,pid:actor.pid,executable,executableSha256,fingerprint:readDisplayProcessFingerprint(actor.pid),before};
  if(owner.fingerprint&&(!owner.fingerprint.includes(executable)||!owner.fingerprint.includes(nonce)))throw new Error('The native display process identity does not match its owner.');
  await writeFile(OWNER_FILE,JSON.stringify(owner,null,2)+'\n',{flag:'wx'});
  /** Readiness observes the same original actor for a bounded native registration interval. */
  const deadline=Date.now()+25000;
  while(Date.now()<deadline){
    if(launchError)throw launchError;
    let ready:VirtualDisplayReady|undefined;
    try{ready=JSON.parse(await readFile(path.join(directory,'ready.json'),'utf8')) as VirtualDisplayReady;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(ready){
      if(ready.pid!==owner.pid||ready.nonce!==nonce||ready.width!==1920||ready.height!==1440||ready.pixelWidth!==ready.width||ready.pixelHeight!==ready.height||ready.primaryDisplayId!==ready.displayId)throw new Error('The actual native display readiness record does not match its original owner or unscaled dimensions.');
      if(!owner.fingerprint||readDisplayProcessFingerprint(owner.pid)!==owner.fingerprint)throw new Error('The verified native display actor lost its process ownership.');
      owner.ready=ready;await writeFile(OWNER_FILE,JSON.stringify(owner,null,2)+'\n');
      return ready;
    }
    if(actor.exitCode!==null||actor.signalCode!==null||readDisplayProcessFingerprint(owner.pid)===null)throw new Error(`The native display helper exited before readiness (code ${actor.exitCode}, signal ${actor.signalCode}); inspect ${logFile}.`);
    await waitForDisplayObservation();
  }
  throw new Error(`The existing owned native display did not become ready before its observation deadline; inspect ${logFile}.`);
}

/**
 * Stop only the exact owned CI helper and verify original native display restoration.
 *
 * A private marker first requests normal restoration. Bounded fallback signals
 * require the same start/command fingerprint and immutable helper bytes. A new
 * independent native query verifies removal and original primary screen bounds.
 * @async
 * @returns {Promise<void>} Resolves after owned teardown or when no helper was needed.
 * @throws {Error} If owner validation, process termination or actual native restoration fails.
 * @example
 * await stopVirtualMacDisplay(); // The workflow invokes this with always() semantics.
 */
export async function stopVirtualMacDisplay():Promise<void>{
  requireNativeDisplayRunner();
  let owner:DisplayOwner;
  try{owner=JSON.parse(await readFile(OWNER_FILE,'utf8')) as DisplayOwner;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  if(!path.basename(owner.directory).startsWith('forhan-ci-native-display-')||path.dirname(path.resolve(owner.directory))!==path.resolve(tmpdir())||owner.executable!==path.join(owner.directory,'forhan-ci-native-display')||!Number.isSafeInteger(owner.pid)||owner.pid<=1||!/^[a-f0-9-]{36}$/u.test(owner.nonce))throw new Error('The native display owner record does not name a private CI invocation.');
  if(createHash('sha256').update(await readFile(owner.executable)).digest('hex')!==owner.executableSha256)throw new Error('The owned native helper bytes changed before cleanup.');
  let success=false,error:string|undefined,fallbackSignal:string|undefined,after:NativeDisplays|undefined;
  try{
    /** An absent actor requires no signal; any live actor must retain exact invocation identity. */
    const fingerprint=readDisplayProcessFingerprint(owner.pid);
    if(fingerprint!==null){
      if(!owner.fingerprint||fingerprint!==owner.fingerprint)throw new Error('Refusing to stop a process whose native display ownership changed.');
      await writeFile(path.join(owner.directory,'stop'),'stop\n',{flag:'a'});
      /** Normal native restoration gets its own bounded observation interval. */
      const deadline=Date.now()+15000;
      while(Date.now()<deadline&&readDisplayProcessFingerprint(owner.pid)!==null)await waitForDisplayObservation();
      for(/** Fallback affects only an actor whose original exact process fingerprint remains unchanged. */const signal of ['SIGTERM','SIGKILL'] as const){
        /** The original PID may have exited or been reused while native teardown was observed. */
        const current=readDisplayProcessFingerprint(owner.pid);
        if(current===null)break;
        if(current!==owner.fingerprint)throw new Error('Native helper ownership changed before fallback termination.');
        process.kill(owner.pid,signal);fallbackSignal=signal;
        /** The same signal's effect is observed before considering a stronger owned fallback. */
        const signalDeadline=Date.now()+3000;
        while(Date.now()<signalDeadline&&readDisplayProcessFingerprint(owner.pid)!==null)await waitForDisplayObservation();
      }
      if(readDisplayProcessFingerprint(owner.pid)!==null)throw new Error('The owned native display helper did not terminate.');
    }
    after=JSON.parse(execFileSync(owner.executable,['--inspect'],{encoding:'utf8',timeout:10000})) as NativeDisplays;
    if(owner.ready&&after.displays.some(
      /**
       * Detect an owned virtual display that survived its owning process.
       *
       * Actual native active IDs remain independent of the prior readiness record.
       * @param {DisplayBounds} display - Original post-cleanup native screen observation.
       * @returns {boolean} Whether the owned virtual display is still active.
       * @example
       * isOwnedDisplayStillActive(display); // false after successful teardown.
       */
      function isOwnedDisplayStillActive(display){return display.id===owner.ready!.displayId;}
    ))throw new Error('The owned native display remains active after helper termination.');
    if(after.primaryDisplayId!==owner.before.primaryDisplayId)throw new Error('The original native primary screen was not restored.');
    for(/** Original native screens retain their prior physical dimensions and origins. */const original of owner.before.displays){
      /** Match by actual stable native display ID rather than array order. */
      const restored=after.displays.find(
        /**
         * Locate an original native screen in the independent cleanup query.
         *
         * Display ordering can change after the owned virtual screen is removed.
         * @param {DisplayBounds} display - Actual native screen after cleanup.
         * @returns {boolean} Whether this is the original screen identity.
         * @example
         * isOriginalDisplay(display); // true for the recorded native ID.
         */
        function isOriginalDisplay(display){return display.id===original.id;}
      );
      if(!restored||restored.x!==original.x||restored.y!==original.y||restored.width!==original.width||restored.height!==original.height)throw new Error('An original native screen did not restore its exact bounds.');
    }
    success=true;
  }catch(cause){error=cause instanceof Error?cause.message:String(cause);throw cause;}
  finally{await writeFile(path.join(VALIDATION_DIRECTORY,`native-display-cleanup-darwin-${process.arch}.json`),JSON.stringify({kind:'owned-ci-native-display-cleanup',recordedAt:new Date().toISOString(),success,pid:owner.pid,nonce:owner.nonce,fallbackSignal,before:owner.before,after,error},null,2)+'\n');}
}
