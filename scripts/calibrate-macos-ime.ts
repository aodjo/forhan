import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";

/**
 * Calibrate actual Apple Korean input against an ordinary independent AppKit text view.
 *
 * A test-owned native bundle isolates native event/source transport from Electron
 * and Forhan. Original native state remains retained when calibration fails.
 * @async
 * @param {string} root - Exact selected project directory.
 * @param {string} temporary - Existing owned native-helper temporary directory.
 * @param {string} helper - Actual compiled guarded physical keyboard helper.
 * @param {string} evidence - Existing unique native IME evidence directory.
 * @returns {Promise<void>} Resolves only after native composition and normal owned control cleanup pass.
 * @throws {Error} If actual native control input, identity or termination fails.
 * @example
 * await calibrateMacInput(root,temporary,helper,directory);
 */
export async function calibrateMacInput(
  root: string,
  temporary: string,
  helper: string,
  evidence: string,
): Promise<void> {
  /** Every control binary and original report belongs to the current explicit invocation. */
  const bundle = path.join(temporary, "ImeControl.app"),
    contents = path.join(bundle, "Contents"),
    binary = path.join(contents, "MacOS", "ImeControl"),
    directory = path.join(evidence, "native-control");
  await mkdir(path.dirname(binary), { recursive: true });
  await mkdir(directory);
  await writeFile(
    path.join(contents, "Info.plist"),
    '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.forhan.ime-control</string><key>CFBundleExecutable</key><string>ImeControl</string><key>CFBundleName</key><string>Forhan IME Control</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>',
  );
  execFileSync(
    "/usr/bin/xcrun",
    [
      "clang++",
      "-fobjc-arc",
      "-Wall",
      "-Wextra",
      "-framework",
      "AppKit",
      "-framework",
      "Carbon",
      path.join(root, "scripts/native/macos-ime-control.mm"),
      "-o",
      binary,
    ],
    { stdio: "inherit", timeout: 60000 },
  );
  /** Only this newly compiled calibration application is launched and later terminated. */
  const child = spawn(binary, [directory], { stdio: "inherit" });
  try {
    /** Actual readiness requires the original native window and frontmost process observation. */
    let ready: any = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null)
        throw new Error(
          "The owned native input control exited before readiness.",
        );
      try {
        ready = JSON.parse(
          await readFile(path.join(directory, "control-state.json"), "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (ready?.pid === child.pid && ready?.frontmost === true) break;
      await pause(50);
    }
    assert.equal(ready?.pid, child.pid);
    assert.equal(ready?.frontmost, true);
    await writeFile(
      path.join(directory, "before.json"),
      JSON.stringify(ready, null, 2) + "\n",
    );
    /** The identical physical transport receives only original native identity and physical key positions. */
    const result = spawnSync(helper, [], {
      input: JSON.stringify({
        pid: child.pid,
        executable: await realpath(binary),
        bundle: await realpath(bundle),
        keys: ["g", "k", "s", "r", "m", "f", "SPACE"],
        delayMs: 70,
      }),
      encoding: "utf8",
      shell: false,
      timeout: 30000,
    });
    await writeFile(
      path.join(directory, "native-original.json"),
      result.stdout,
    );
    await writeFile(path.join(directory, "native-stderr.txt"), result.stderr);
    await pause(300);
    /** Native control state remains original even when a source enable, restore or text assertion fails. */
    const after = JSON.parse(
      await readFile(path.join(directory, "control-state.json"), "utf8"),
    );
    await writeFile(
      path.join(directory, "after.json"),
      JSON.stringify(after, null, 2) + "\n",
    );
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      "Native input calibration or restoration failed: " + result.stdout,
    );
    assert.equal(
      after.text,
      "한글 ",
      "The same physical input transport must first produce Korean in an ordinary native AppKit text view.",
    );
    assert.equal(after.marked, false);
  } finally {
    await writeFile(path.join(directory, "stop"), "");
    for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt++)
      await pause(50);
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      throw new Error(
        "The owned calibration application did not terminate normally.",
      );
    }
    assert.equal(
      child.exitCode,
      0,
      "The original native calibration process must exit normally.",
    );
  }
}
