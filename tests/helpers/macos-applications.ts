import { spawnSync } from "node:child_process";

/**
 * Read actual process identifiers registered for a macOS application bundle.
 *
 * Read-only AppKit inspection prevents an owned file request from reaching an
 * unrelated application instance. No native event or application is modified.
 * @param {string} bundleId - Actual selected application's native bundle identifier.
 * @returns {number[]} Original positive native process identifiers.
 * @throws {Error} If native inspection fails or returns invalid identifiers.
 * @example
 * expect(macApplicationIds('org.forhan.editor')).toEqual([ownedPid]);
 */
export function macApplicationIds(bundleId: string): number[] {
  /** Direct process arguments keep this read-only native source outside command-shell interpolation. */
  const script = `ObjC.import('AppKit');
/** Only actual application registrations supply process identity. */
const applications=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(${JSON.stringify(bundleId)});
/** The observer returns only actual process identifiers. */
const identifiers=[];
for(let index=0;index<Number(applications.count);index++)identifiers.push(Number(applications.objectAtIndex(index).processIdentifier));
JSON.stringify(identifiers);`,
    result = spawnSync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", "-e", script],
      { encoding: "utf8", shell: false, timeout: 15000 },
    );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      "Actual native application inspection failed: " +
        result.stderr.slice(-2000),
    );
  /** Returned values retain actual native identity rather than a supplied expected process. */
  const ids: unknown = JSON.parse(result.stdout.trim());
  if (!Array.isArray(ids))
    throw new Error(
      "The native application registry did not return an identifier list.",
    );
  for (/** Every original registry entry must identify a real positive native process. */ const id of ids)
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error(
        "The native application registry returned an invalid process identifier.",
      );
  return ids;
}
