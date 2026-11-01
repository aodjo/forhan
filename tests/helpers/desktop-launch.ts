import { _electron as electron, test, type ElectronApplication } from "@playwright/test";
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

/**
 * Terminate an owned regression application without invoking its save dialog.
 *
 * ElectronApplication.close requests a normal quit, which correctly preserves
 * unsaved documents in the product. Synthetic test documents have already been
 * inspected, so teardown explicitly exits only the application launched by the
 * current test. The Playwright handle is released even if the exit call rejects.
 * @async
 * @param {ElectronApplication} desktop - Application launched and owned by this test.
 * @returns {Promise<void>} Resolves after the owned process and automation handle close.
 * @throws {Error} If the owned application's exit or handle cleanup fails.
 * @example
 * await closeOwnedDesktop(desktop); // An unsaved fixture cannot mask an earlier assertion.
 */
export async function closeOwnedDesktop(desktop: ElectronApplication): Promise<void> {
  try {
    await desktop.evaluate(
      /**
       * Exit the explicitly selected test application's native process.
       *
       * This bypasses the product save handshake only during owned test cleanup.
       * @param {typeof import('electron')} context - Exports of the owned main process.
       * @returns {void} Requests immediate termination of this application.
       * @example
       * // No unrelated installed application or process is targeted.
       */
      ({ app }) => app.exit(0),
    );
  } finally {
    await desktop.close();
  }
}

/**
 * Resize an owned native window and retain the actual operating-system bounds.
 *
 * Native screen constraints can differ from requested content dimensions. This
 * observes the real window and display after the ordinary resize operation;
 * it never substitutes renderer dimensions or adjusts an expected paper frame.
 * @async
 * @param {ElectronApplication} desktop - Native application owned by this test.
 * @param {number} width - Requested native content width in CSS pixels.
 * @param {number} height - Requested native content height in CSS pixels.
 * @returns {Promise<void>} Resolves after the native resize and geometry attachment.
 * @throws {Error} If the owned window cannot be resized or observed.
 * @example
 * await resizeOwnedDesktop(desktop,1440,961); // Retains actual bounds and display scale.
 */
export async function resizeOwnedDesktop(desktop: ElectronApplication, width: number, height: number): Promise<void> {
  /** Native observations remain independent of the requested frame and renderer layout. */
  const observation = await desktop.evaluate(
    /**
     * Apply a real native resize and inspect the corresponding display.
     *
     * Only the application created by this test is targeted. Screen work area,
     * display scale and actual content bounds explain platform constraints.
     * @param {typeof import('electron')} context - Owned native application exports.
     * @param {{width:number;height:number}} size - Requested content dimensions.
     * @returns {object} Actual native bounds, requested size and matching display.
     * @throws {Error} If the owned application has no native window.
     * @example
     * // A shortened native window remains visible as evidence rather than being emulated.
     */
    ({BrowserWindow,screen},size)=>{
      /** The first window belongs exclusively to this isolated regression application. */
      const window=BrowserWindow.getAllWindows()[0];
      if(!window)throw new Error('The owned desktop window is absent.');
      /** Ephemeral Mac CI may provide a real secondary screen larger than its original primary screen. */
      const before=window.getBounds(),contentBefore=window.getContentBounds(),chromeWidth=before.width-contentBefore.width,chromeHeight=before.height-contentBefore.height;
      let destination:number|undefined;
      if(process.platform==='darwin'&&process.env.GITHUB_ACTIONS==='true'){
        /** The actual window must fit its native screen's usable points and original chrome. */
        const current=screen.getDisplayMatching(before);
        if(current.workArea.width<size.width+chromeWidth||current.workArea.height<size.height+chromeHeight){
          for(/** Only actual unscaled native displays may host an oversized original fixture. */const candidate of screen.getAllDisplays()){
            if(candidate.scaleFactor!==1||candidate.workArea.width<size.width+chromeWidth||candidate.workArea.height<size.height+chromeHeight)continue;
            window.setPosition(candidate.workArea.x+Math.max(0,Math.floor((candidate.workArea.width-size.width-chromeWidth)/2)),candidate.workArea.y);
            destination=candidate.id;break;
          }
          if(destination===undefined)throw new Error('No actual unscaled native screen can contain the original requested fixture.');
        }
      }
      window.setContentSize(size.width,size.height);
      return {requested:size,before,destination,contentBounds:window.getContentBounds(),bounds:window.getBounds(),display:screen.getDisplayMatching(window.getBounds())};
    },{width,height});
  await test.info().attach('native-window-resize',{body:JSON.stringify(observation,null,2),contentType:'application/json'});
}
