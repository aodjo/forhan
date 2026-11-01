import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

/** Native keys are individual virtual keys or one balanced modifier chord. */
export type WindowsKey = number | readonly number[];

/** A selected application must identify its actual main process and generated profile. */
export interface WindowsKeyboardOwner {
  pid: number;
  window: string;
  executable: string;
  profile: string;
}

/** Original Win32 observations retain exact process start time without numeric rounding. */
export interface WindowsKeyboardObservation {
  process: number;
  startTicks: string;
  thread: number;
  window: string;
  focus: string;
  layout: string;
  installedLayouts: string[];
  openStatus: number;
  action: "focus" | "inspect" | "keys";
  keys: string;
}

/** Keyboard batches remain shorter than the independent helper's terminal deadline. */
const MAX_NATIVE_KEY_BATCH = 64;

/** Generated profiles distinguish the explicit interactive gate from existing user sessions. */
export const WINDOWS_IME_PROFILE_PREFIX = "forhan-windows-ime-";

/** The native helper lives beside this source and never resolves through a caller-controlled shell. */
const WINDOWS_KEYBOARD_HELPER = fileURLToPath(
  new URL("./windows-keyboard.ps1", import.meta.url),
);

/**
 * Encode a bounded operating-system key batch without completed Unicode text.
 *
 * Only the letters, composition mode, editing keys and modifiers used by this
 * explicit regression are accepted. Windows shell keys and Unicode packet
 * injection are excluded. The native helper sends balanced transitions.
 * @param {readonly WindowsKey[]} keys - Original virtual keys or modifier chords.
 * @returns {string} Invariant numeric batch understood by the owned helper.
 * @throws {RangeError} If a batch, chord or virtual key is outside the test scope.
 * @example
 * windowsKeyBatch([0x52, 0x4b, [0x11, 0x5a]]); // R, K, then Ctrl+Z.
 */
export function windowsKeyBatch(keys: readonly WindowsKey[]): string {
  if (!keys.length || keys.length > MAX_NATIVE_KEY_BATCH)
    throw new RangeError("Expected between one and 64 native key operations.");
  /** Each operation retains its complete modifier ownership in one native request. */
  const operations: string[] = [];
  for (/** Individual transitions cannot escape the explicitly supported keyboard regression. */ const key of keys) {
    /** A single key and a modifier chord share the same validated native encoding. */
    const chord = typeof key === "number" ? [key] : key;
    if (!chord.length || chord.length > 3)
      throw new RangeError(
        "Expected one key or a chord with at most two modifiers.",
      );
    for (/** Packet injection and shell keys cannot enter this native input path. */ const value of chord)
      if (
        !Number.isInteger(value) ||
        !(
          (value >= 0x41 && value <= 0x5a) ||
          (value >= 0x21 && value <= 0x28) ||
          [0x08, 0x0d, 0x10, 0x11, 0x15, 0x20, 0x2e].includes(value)
        )
      )
        throw new RangeError(
          "The native key is outside the explicit IME regression.",
        );
    for (let index = 0; index < chord.length - 1; index++)
      if (![0x10, 0x11].includes(chord[index]))
        throw new RangeError(
          "Only Shift or Control may precede a chord's final key.",
        );
    operations.push(chord.join("+"));
  }
  return operations.join(",");
}

/** Native input remains outside the renderer and is available only to the explicit Windows gate. */
export class WindowsNativeKeyboard {
  /** Original accepted observations remain separate from expected editor results. */
  readonly observations: WindowsKeyboardObservation[] = [];

  /** Exact native process start ticks prevent PID reuse between operations. */
  private startTicks: string | undefined;

  /** Immutable selected native owner remains independent of later helper observations. */
  private readonly owner: WindowsKeyboardOwner;

  /**
   * Bind a native keyboard observer to a uniquely generated application profile.
   *
   * Construction does not focus a window or send input. Every later operation
   * independently verifies executable, native window, profile and input focus.
   * @param {WindowsKeyboardOwner} owner - Actual packaged application's main-process identity.
   * @returns {WindowsNativeKeyboard} A keyboard observer bound to the generated native owner.
   * @throws {Error} If the host or generated ownership is outside this explicit gate.
   * @example
   * const keyboard = new WindowsNativeKeyboard(owner);
   */
  constructor(owner: WindowsKeyboardOwner) {
    this.owner = owner;
    if (process.platform !== "win32" || process.arch !== "x64")
      throw new Error(
        "Real Windows IME validation requires a Windows x64 host.",
      );
    if (
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      !/^[1-9]\d*$/.test(owner.window) ||
      !path.isAbsolute(owner.executable) ||
      path.dirname(owner.profile) !== path.resolve(tmpdir()) ||
      !path.basename(owner.profile).startsWith(WINDOWS_IME_PROFILE_PREFIX)
    )
      throw new Error(
        "Native input requires an exact generated application owner.",
      );
  }

  /**
   * Observe original native focus and keyboard layout without sending keys.
   *
   * The first successful observation records the actual process start time.
   * Further observations must refer to that same native process instance.
   * @async
   * @returns {Promise<WindowsKeyboardObservation>} Original operating-system state.
   * @throws {Error} If the window is not foreground, ownership differs or the helper fails.
   * @example
   * const initial = await keyboard.observe();
   */
  async observe(): Promise<WindowsKeyboardObservation> {
    return this.request("inspect", "");
  }

  /**
   * Activate the verified generated frame before the first native input observation.
   *
   * A bounded native title-bar click requires an exact process, executable,
   * isolated profile and unobstructed owned hit target. Actual foreground and
   * input focus must still match afterward. No keyboard input is submitted.
   * @async
   * @returns {Promise<WindowsKeyboardObservation>} Actual owned foreground and keyboard state.
   * @throws {Error} If activation, ownership, foreground or native focus differs.
   * @example
   * await keyboard.focus(); // Every subsequent key still rechecks foreground ownership.
   */
  async focus(): Promise<WindowsKeyboardObservation> {
    return this.request("focus", "");
  }

  /**
   * Send bounded virtual keys through the actual installed Windows input method.
   *
   * An initial observation is mandatory. The helper rejects focus changes and
   * held user modifiers before input, and rechecks native ownership for every
   * operation. Failed or timed-out batches are never retried automatically.
   * @async
   * @param {readonly WindowsKey[]} keys - Native letters, editing keys or modifier chords.
   * @returns {Promise<WindowsKeyboardObservation>} Original accepted batch and native owner.
   * @throws {Error} If native ownership, foreground, active Korean layout or input acceptance differs.
   * @throws {RangeError} If the requested batch is outside the explicit regression.
   * @example
   * await keyboard.press([0x52, 0x4b]); // The installed Korean IME composes the keys.
   */
  async press(
    keys: readonly WindowsKey[],
  ): Promise<WindowsKeyboardObservation> {
    if (!this.startTicks)
      throw new Error(
        "Observe the original native input owner before sending keys.",
      );
    return this.request("keys", windowsKeyBatch(keys));
  }

  /**
   * Execute one literal native helper request with a terminal deadline.
   *
   * Separate process arguments prevent shell interpolation. Only successful
   * original JSON observations enter the retained record, and a helper timeout
   * cannot restart or repeat a potentially completed input request.
   * @async
   * @param {'focus'|'inspect'|'keys'} action - Owned activation, read-only observation or explicit native input.
   * @param {string} keys - Validated invariant batch or an empty observation value.
   * @returns {Promise<WindowsKeyboardObservation>} Original accepted native observation.
   * @throws {Error} If the helper fails, times out or reports a different owner.
   * @example
   * // observe() and press() are the public ownership-preserving entry points.
   */
  private async request(
    action: "focus" | "inspect" | "keys",
    keys: string,
  ): Promise<WindowsKeyboardObservation> {
    /** Exact arguments identify the selected process without changing any user input preference. */
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      WINDOWS_KEYBOARD_HELPER,
      "-OwnerProcess",
      String(this.owner.pid),
      "-WindowHandle",
      this.owner.window,
      "-ExpectedExecutable",
      this.owner.executable,
      "-ProfileDirectory",
      this.owner.profile,
      "-Action",
      action,
    ];
    if (this.startTicks) args.push("-OwnerStartTicks", this.startTicks);
    if (keys) args.push("-Keys", keys);
    /** The short-lived helper owns no independent application window or renderer capability. */
    const observation = await new Promise<WindowsKeyboardObservation>(
      /**
       * Collect one actual helper process until its authoritative terminal event.
       *
       * A native timeout kills only this helper; it never launches another input batch.
       * @param {(value:WindowsKeyboardObservation)=>void} resolve - Receives original accepted native state.
       * @param {(reason:Error)=>void} reject - Receives terminal ownership or process failure.
       * @returns {void} Starts one bounded hidden helper with literal process arguments.
       * @example
       * // Output is parsed only after the original helper closes successfully.
       */
      (resolve, reject) => {
        /** Each request has independent bounded stdout, stderr and native process ownership. */
        const child = spawn("powershell.exe", args, {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 12000,
        });
        let stdout = "",
          stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on(
          "data",
          /**
           * Retain original native observation output.
           *
           * The helper emits one compact JSON record without completed editor text.
           * @param {string} part - Original decoded stdout chunk.
           * @returns {void} Appends the current original observation bytes as text.
           * @example
           * // Native process ticks remain a string rather than a rounded number.
           */
          (part: string) => {
            stdout += part;
          },
        );
        child.stderr.on(
          "data",
          /**
           * Retain original helper failure details.
           *
           * Rejected ownership or native calls cannot become a successful input observation.
           * @param {string} part - Original decoded stderr chunk.
           * @returns {void} Appends the actual native helper diagnostics.
           * @example
           * // A focus-change failure is reported without resending keys.
           */
          (part: string) => {
            stderr += part;
          },
        );
        child.once("error", reject);
        child.once(
          "close",
          /**
           * Classify the authoritative original helper completion.
           *
           * Only a zero exit with valid JSON is accepted; signal termination remains failure.
           * @param {number|null} code - Original helper exit status.
           * @param {NodeJS.Signals|null} signal - Original termination signal, if any.
           * @returns {void} Resolves the observed state or rejects the original terminal failure.
           * @example
           * // A 12-second helper deadline does not authorize another input attempt.
           */
          (code, signal) => {
            if (code !== 0 || signal) {
              reject(
                new Error(
                  stderr.trim() ||
                    "Native keyboard helper failed or exceeded its deadline.",
                ),
              );
              return;
            }
            try {
              resolve(JSON.parse(stdout.trim().replace(/^\ufeff/, "")));
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          },
        );
      },
    );
    if (
      observation.process !== this.owner.pid ||
      observation.window !== this.owner.window ||
      observation.action !== action ||
      observation.keys !== keys ||
      !/^[1-9]\d*$/.test(observation.startTicks) ||
      (this.startTicks !== undefined &&
        observation.startTicks !== this.startTicks)
    )
      throw new Error(
        "Native keyboard observation differs from its original request owner.",
      );
    this.startTicks = observation.startTicks;
    this.observations.push(observation);
    return observation;
  }
}
