import { _electron as electron } from "@playwright/test";
import path from "node:path";

/** Native desktop launch options shared by development and actual packaged regression suites. */
export type DesktopLaunchOptions = NonNullable<
  Parameters<typeof electron.launch>[0]
>;

/**
 * Build arguments for the actual selected desktop entry point.
 *
 * Development Electron needs the source project argument. Packaged applications
 * already contain their entry point and must receive only profile/file arguments.
 * @param {string} profile - Test-owned absolute profile directory.
 * @param {string[]} [files=[]] - Test-owned documents supplied by another launch.
 * @returns {string[]} Arguments appropriate to the selected desktop runtime.
 * @example
 * desktopArguments(profile); // Packaged launches omit the source-project dot argument.
 */
export function desktopArguments(
  profile: string,
  files: string[] = [],
): string[] {
  return [
    ...(process.env.FORHAN_PACKAGED_EXECUTABLE ? [] : ["."]),
    `--user-data-dir=${profile}`,
    ...files,
  ];
}

/**
 * Select the compiled development application or a real packaged executable.
 *
 * The packaged gate explicitly supplies its validated executable. Ordinary UI
 * tests retain the development runtime without accidentally substituting it for
 * a missing or broken packaged app.
 * @param {string} profile - Existing test-owned temporary profile.
 * @returns {DesktopLaunchOptions} Isolated native launch options.
 * @example
 * await electron.launch(desktopLaunchOptions(profile));
 */
export function desktopLaunchOptions(profile: string): DesktopLaunchOptions {
  /** Explicit packaged target is never inferred from an unrelated installed application. */
  const executable = process.env.FORHAN_PACKAGED_EXECUTABLE;
  return {
    ...(executable ? { executablePath: path.resolve(executable) } : {}),
    args: desktopArguments(profile),
    env: { ...process.env, APPDATA: profile },
    timeout: 60000,
  };
}
