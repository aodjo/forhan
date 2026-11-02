import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JSONContent } from "@tiptap/core";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { writeHwpx } from "../src/formats/hwpx.ts";
import { distributionFileDigest } from "../scripts/lib/distribution-content.ts";
import {
  desktopLaunchOptions,
  closeOwnedDesktop,
} from "./helpers/desktop-launch.ts";

/**
 * Read running application identifiers from the actual macOS application registry.
 *
 * AppKit is inspected without sending automation events to other applications.
 * A pre-existing application with this bundle identifier prevents the owned test
 * from dispatching any document request to an unrelated user instance.
 * @param {string} bundleId - Source-declared identifier of the actual selected application.
 * @returns {number[]} Actual native process identifiers registered for this bundle.
 * @throws {Error} If native inspection fails or returns malformed identifiers.
 * @example
 * expect(runningApplicationIds('org.forhan.editor')).toEqual([ownedPid]);
 */
function runningApplicationIds(bundleId: string): number[] {
  /** Native application inspection uses JavaScript for Automation only as a read-only AppKit bridge. */
  const script = `ObjC.import('AppKit');
/** Actual registered applications retain the source-declared bundle identity. */
const applications=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(${JSON.stringify(bundleId)});
/** Only process identifiers leave this read-only native inspection. */
const identifiers=[];
for(let index=0;index<Number(applications.count);index++)identifiers.push(Number(applications.objectAtIndex(index).processIdentifier));
JSON.stringify(identifiers);`;
  /** Direct arguments preserve the native JavaScript source without command-shell interpolation. */
  const result = spawnSync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", script],
    { encoding: "utf8", shell: false, timeout: 15000 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      "Native application-registry inspection failed: " +
        result.stderr.slice(-2000),
    );
  /** The source application must be identified by real positive native PIDs. */
  const ids: unknown = JSON.parse(result.stdout.trim());
  if (!Array.isArray(ids))
    throw new Error(
      "The native application registry did not return an identifier list.",
    );
  for (/** Every observed process identity comes from AppKit rather than a supplied test substitute. */ const id of ids)
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error(
        "The native application registry returned an invalid process identifier.",
      );
  return ids;
}

/**
 * Open all public formats through genuine macOS Launch Services document requests.
 *
 * The packaged process remains resident after each clean window closes. The
 * operating system then receives the actual app bundle and an owned Unicode
 * filename through its open tool. No Electron event is emitted by the test.
 * @async
 * @returns {Promise<void>} Resolves after HWPX, HWP and FHN reopen the same owned process with unchanged original bytes.
 * @throws {Error} If another app is running, native routing fails, source changes or the wrong runtime handles a request.
 * @example
 * // macOS packaged and extracted-payload gates exercise the same real native sender.
 */
async function verifyMacDocumentRequests(): Promise<void> {
  test.setTimeout(120000);
  if (process.platform !== "darwin" || !process.env.FORHAN_PACKAGED_EXECUTABLE)
    throw new Error(
      "Real macOS file requests require an explicit packaged native Mac executable.",
    );
  /** Source metadata is independent of the application being inspected. */
  const manifest = JSON.parse(
      await readFile(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        "utf8",
      ),
    ),
    bundleId: string = manifest.build.appId;
  await expect
    .poll(
      /**
       * Await the actual registry's removal of a previously closed owned test process.
       *
       * A live unrelated application remains visible and prevents document dispatch.
       * @returns {number[]} Actual currently registered native application identifiers.
       * @throws {Error} If read-only native application inspection fails.
       * @example
       * // Only an empty real registry permits this isolated test to begin.
       */
      () => runningApplicationIds(bundleId),
    )
    .toEqual([]);
  /** Temporary input and profile paths belong exclusively to this native test. */
  const parent = await realpath(tmpdir()),
    profile = await mkdtemp(path.join(parent, "forhan-macos-file-open-")),
    title = "Finder 포한 cafe\u0301",
    text = "실제 macOS 파일 요청으로 연 한글 cafe\u0301",
    doc: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    files: Array<{ kind: string; file: string; sha256: string }> = [];
  /** The exclusively owned runtime remains available for cleanup even when launch or initialization fails. */
  let desktop: ElectronApplication | undefined;
  let closedNormally = false;
  try {
    desktop = await electron.launch(desktopLaunchOptions(profile));
    /** A genuinely loaded pristine editor establishes native application readiness before registry inspection. */
    let page = await desktop.firstWindow();
    await expect(page.locator(".tiptap")).toBeVisible({ timeout: 30000 });
    /** Actual runtime identity binds native routing to the selected copied or staging executable. */
    const identity = await desktop.evaluate(
      /**
       * Read the actual owning native application's executable and process identity.
       *
       * This observer cannot replace platform state, handlers or incoming native events.
       * @param {typeof import('electron')} context - Original native Electron exports.
       * @returns {object} Actual native source/distribution identity.
       * @example
       * // pid identifies the sole registered copy before and after OS file delivery.
       */
      ({ app }) => ({
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        executable: process.execPath,
        application: app.getAppPath(),
        packaged: app.isPackaged,
      }),
    );
    expect(identity.platform).toBe("darwin");
    expect(identity.arch).toBe(process.env.FORHAN_PACKAGED_ARCH);
    expect(identity.packaged).toBe(true);
    expect(path.resolve(identity.executable)).toBe(
      path.resolve(process.env.FORHAN_PACKAGED_EXECUTABLE),
    );
    expect(runningApplicationIds(bundleId)).toEqual([identity.pid]);
    /** The exact app bundle is selected instead of changing system-wide file associations. */
    const bundle = path.dirname(
      path.dirname(path.dirname(identity.executable)),
    );
    for (/** Independent native writers preserve the user-facing HWPX, HWP, FHN priority. */ const kind of [
      "hwpx",
      "hwp",
      "fhn",
    ]) {
      /** Combining accents and Hangul in real filenames exercise native filesystem normalization. */
      const file = path.join(profile, title + "." + kind),
        bytes =
          kind === "hwpx"
            ? await writeHwpx({ doc, title })
            : kind === "hwp"
              ? writeHwp({ doc, title })
              : Buffer.from(
                  JSON.stringify({
                    application: "forhan",
                    version: 1,
                    title,
                    doc,
                  }),
                );
      await writeFile(file, bytes);
      files.push({ kind, file, sha256: await distributionFileDigest(file) });
    }
    for (/** Every supported extension must reopen the same actual resident native process. */ const entry of files) {
      /** The real window close is observed before requesting ordinary native closure. */
      const closed = page.waitForEvent("close");
      await desktop.evaluate(
        /**
         * Close the clean real Mac window through its original native lifecycle.
         *
         * The production window-all-closed listener remains installed and unmodified.
         * @param {typeof import('electron')} context - Original native Electron exports.
         * @returns {void} Requests normal closure of the actual owned editor window.
         * @example
         * // The same packaged Mac process remains registered with no document windows.
         */
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close(),
      );
      await closed;
      expect(runningApplicationIds(bundleId)).toEqual([identity.pid]);
      /** Incoming window creation is armed before the real operating-system document sender runs. */
      const reopened = desktop.waitForEvent("window", { timeout: 30000 }),
        sender = spawnSync("/usr/bin/open", ["-a", bundle, entry.file], {
          encoding: "utf8",
          shell: false,
          timeout: 15000,
        });
      if (sender.error) throw sender.error;
      expect(sender.status, sender.stderr).toBe(0);
      page = await reopened;
      await expect(page.locator(".tiptap")).toHaveText(text, {
        timeout: 30000,
      });
      await expect(page.locator("#format-badge")).toHaveText(
        entry.kind.toUpperCase(),
      );
      expect(
        (await page.locator("#document-title").inputValue()).normalize("NFC"),
      ).toBe(title.normalize("NFC"));
      expect(runningApplicationIds(bundleId)).toEqual([identity.pid]);
      expect(desktop.windows()).toHaveLength(1);
    }
    await desktop.close();
    closedNormally = true;
    for (/** Actual original bytes must survive native opening, rendering and normal application closing. */ const entry of files)
      expect(await distributionFileDigest(entry.file)).toBe(entry.sha256);
    await test
      .info()
      .attach("actual-macos-launchservices-file-requests", {
        body: JSON.stringify(
          {
            identity,
            sender: "/usr/bin/open -a <actual bundle> <actual file>",
            formats: files,
            sourceUnchanged: true,
            normalCloseCompleted: true,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
  } finally {
    try {
      if (desktop && !closedNormally) await closeOwnedDesktop(desktop);
    } finally {
      if (
        path.dirname(path.resolve(profile)) !== parent ||
        !path.basename(profile).startsWith("forhan-macos-file-open-")
      )
        throw new Error(
          "Native file-request profile escaped its owned temporary root.",
        );
      await rm(profile, { recursive: true, force: true });
    }
  }
}

test(
  "actual macOS Launch Services reopen resident packaged HWPX, HWP and FHN documents",
  verifyMacDocumentRequests,
);
