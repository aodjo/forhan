import { spawnSync } from "node:child_process";

/** Actual AppKit registration identifies one native application independently of a renderer or supplied PID. */
export interface MacOwnedApplication {
  pid: number;
  bundleId: string;
  executable: string;
  bundle: string;
  launchTime: number;
}

/**
 * Observe all actual native registrations for an explicit application bundle.
 *
 * Read-only AppKit metadata establishes ownership before any LaunchServices request or cleanup.
 * @param {string} bundleId - Exact selected application identifier.
 * @returns {MacOwnedApplication[]} Original native PID, executable, bundle and launch-time observations.
 * @throws {Error} If native inspection fails or returns malformed process identity.
 * @example
 * const applications=observeMacApplications('org.forhan.editor');
 */
export function observeMacApplications(
  bundleId: string,
): MacOwnedApplication[] {
  /** Structured native arguments never pass through a command shell. */
  const script = `ObjC.import('AppKit');
/** Original native application registrations are observed without modifying them. */
const apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(${JSON.stringify(bundleId)}),rows=[];
for(let index=0;index<Number(apps.count);index++){/** This actual native object supplies its original process identity. */const app=apps.objectAtIndex(index);rows.push({pid:Number(app.processIdentifier),bundleId:ObjC.unwrap(app.bundleIdentifier),executable:ObjC.unwrap(app.executableURL.path),bundle:ObjC.unwrap(app.bundleURL.path),launchTime:Number(app.launchDate.timeIntervalSince1970)});}
JSON.stringify(rows);`,
    result = spawnSync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", script],
      { encoding: "utf8", shell: false, timeout: 15000 },
    );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("Actual AppKit observation failed: " + result.stderr);
  /** Only complete original native process identity can establish an owned target. */
  const rows: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(rows))
    throw new Error("The native application registry did not return an array.");
  for (/** Every native result must carry an actual positive PID and original bundle identity. */ const row of rows)
    if (
      !Number.isSafeInteger(row.pid) ||
      row.pid <= 0 ||
      row.bundleId !== bundleId ||
      typeof row.executable !== "string" ||
      typeof row.bundle !== "string" ||
      !Number.isFinite(row.launchTime) ||
      row.launchTime <= 0
    )
      throw new Error("Actual native process identity is incomplete.");
  return rows;
}

/**
 * Request ordinary termination of one independently identified test-owned native application.
 *
 * Fresh AppKit PID, launch time, bundle and executable must still agree before
 * its normal terminate method is called. No force-kill or foreign app is allowed.
 * @param {MacOwnedApplication} owner - Complete original owned native registration.
 * @returns {void} Requests ordinary termination after exact identity is revalidated.
 * @throws {Error} If ownership differs or the native application rejects normal termination.
 * @example
 * requestOwnedMacTermination(owner); // The caller independently observes actual process exit.
 */
export function requestOwnedMacTermination(owner: MacOwnedApplication): void {
  /** Exact native identity comparisons happen inside the same native operation as the terminate request. */
  const script = `ObjC.import('AppKit');
/** The original complete owner identity is revalidated against its actual native registration. */
const owner=${JSON.stringify(owner)},app=$.NSRunningApplication.runningApplicationWithProcessIdentifier(owner.pid);
if(!app||Number(app.processIdentifier)!==owner.pid||Number(app.launchDate.timeIntervalSince1970)!==owner.launchTime||ObjC.unwrap(app.bundleIdentifier)!==owner.bundleId||ObjC.unwrap(app.executableURL.path)!==owner.executable||ObjC.unwrap(app.bundleURL.path)!==owner.bundle)throw Error('Owned native application identity changed.');
JSON.stringify({accepted:Number(app.terminate)===1,pid:Number(app.processIdentifier),launchTime:Number(app.launchDate.timeIntervalSince1970)});`,
    result = spawnSync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", script],
      { encoding: "utf8", shell: false, timeout: 15000 },
    );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("Owned normal native quit failed: " + result.stderr);
  /** An accepted request is not an inferred process exit; the caller must observe disappearance independently. */
  const observed = JSON.parse(result.stdout);
  if (
    observed.accepted !== true ||
    observed.pid !== owner.pid ||
    observed.launchTime !== owner.launchTime
  )
    throw new Error("The owned application did not accept normal termination.");
}
