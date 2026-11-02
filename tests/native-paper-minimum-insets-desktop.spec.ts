import {test,expect,_electron as electron} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {desktopLaunchOptions,resizeOwnedDesktop,closeOwnedDesktop} from './helpers/desktop-launch.ts';
import {exerciseNativeMinimumInsets} from './helpers/native-minimum-insets.ts';

test('actual native first-paper frames retain all forty-eight original minimum insets through real source imports and resizing',
  /**
   * Retain the original minimum source spacing in a genuine native application.
   *
   * Packaged validation selects its real distribution executable. An owned
   * profile, actual native resizing and unmodified screenshot pixels retain
   * the independent original conditions without viewport emulation.
   * @async
   * @returns {Promise<void>} Resolves after all original native first-paper frames agree.
   * @throws {Error} If real native geometry, source or independent pixels differ.
   * @example
   * // The packaged gate uses the same original frames with its actual executable.
   */
  async()=>{
    test.setTimeout(300000);
    /** Only this invocation owns its temporary native document profile and runtime. */
    const profile=await mkdtemp(path.join(tmpdir(),'forhan-native-minimum-insets-')),desktop=await electron.launch(desktopLaunchOptions(profile));
    try{
      /** The actual native renderer supplies both original source controls and completed screenshot pixels. */
      const page=await desktop.firstWindow();
      /** Actual main-process identity remains independent of the requested launcher options. */
      const identity=await desktop.evaluate(
        /**
         * Read the current native application's actual executable and resource identity.
         *
         * A packaged run cannot substitute development Electron or a preview server.
         * @param {typeof import('electron')} context - Actual owning native application exports.
         * @returns {{packaged:boolean;executable:string;application:string}} Actual native runtime paths and packaging state.
         * @example
         * // The packaged gate requires its running application to resolve app.asar.
         */
        ({app})=>({packaged:app.isPackaged,executable:process.execPath,application:app.getAppPath()}),
      );
      if(process.env.FORHAN_PACKAGED_EXECUTABLE)expect(identity.packaged).toBe(true);
      await test.info().attach('native-minimum-inset-runtime',{body:JSON.stringify(identity,null,2),contentType:'application/json'});
      await exerciseNativeMinimumInsets(page,
        /**
         * Resize the real owned native window without supplying expected renderer coordinates.
         *
         * The existing native helper independently verifies actual system bounds.
         * @async
         * @param {number} width - Actual requested content width.
         * @param {number} height - Actual requested content height.
         * @returns {Promise<void>} Resolves after the owning window has resized.
         * @example
         * await resize(1280,1000);
         */
        async(width,height)=>{await resizeOwnedDesktop(desktop,width,height);},
      );
    }finally{
      await closeOwnedDesktop(desktop);
      if(path.dirname(path.resolve(profile))!==path.resolve(tmpdir())||!path.basename(profile).startsWith('forhan-native-minimum-insets-'))throw new Error('The temporary native profile escaped its owned directory.');
      await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  },
);
