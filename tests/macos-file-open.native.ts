import { test, expect, chromium, type Browser } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeHwp } from "../src/formats/hwp-writer.ts";
import { readHwp } from "../src/formats/hwp.ts";
import { writeHwpx, readHwpx } from "../src/formats/hwpx.ts";
import {
  observeMacApplications,
  requestOwnedMacTermination,
  type MacOwnedApplication,
} from "./helpers/macos-owned-application.ts";
import { imeSourceText } from "./helpers/windows-ime.ts";

/** Every public source format must reach a cold, warm and resident native Mac application through LaunchServices. */
const FORMATS = ["hwpx", "hwp", "fhn"] as const;

for (/** Each source format owns a fresh application profile and all generated native input/output files. */ const format of FORMATS) {
  test(
    "actual LaunchServices " +
      format +
      " cold, warm, resident and saved target",
    /**
     * Exercise real macOS document routing without emitting synthetic Electron events.
     *
     * Cold startup uses the actual open tool with the file as a native file request,
     * then warm and last-window requests must preserve ownership, cancellation,
     * native save paths and original neighboring files in all three public formats.
     * @async
     * @returns {Promise<void>} Resolves after actual routing, production saving and normal owned termination pass.
     * @throws {Error} If source delivery, ownership, cancellation, saving or cleanup differs.
     * @example
     * // Korean filenames with spaces must arrive through the operating system's actual document-open path.
     */
    async () => {
      /** This invocation exclusively owns its generated document paths and native Chromium profile. */
      const profile = await mkdtemp(
          path.join(tmpdir(), "forhan-macos-file-open-"),
        ),
        directory = path.join(
          process.env.FORHAN_MACOS_FILE_OPEN_DIRECTORY!,
          format,
        ),
        executable = await realpath(process.env.FORHAN_PACKAGED_EXECUTABLE!),
        bundle = path.dirname(path.dirname(path.dirname(executable))),
        files: { file: string; text: string; sha256: string }[] = [],
        observations: object[] = [];
      await mkdir(directory, { recursive: true });
      /** Native ownership remains available for cleanup even when later renderer assertions fail. */
      let owner: MacOwnedApplication | undefined,
        browser: Browser | undefined,
        passed = false,
        normalExit = false,
        coldRequested = false,
        ownsProfile = false,
        failure: unknown = null;
      try {
        expect(observeMacApplications("org.forhan.editor")).toEqual([]);
        for (/** Every request uses distinct real writer output and a unique Unicode filename. */ const [
          index,
          label,
        ] of ["처음 열기", "실행 중 열기", "창 닫은 뒤 열기"].entries()) {
          /** Expected text exists only as a controlled native source fixture before LaunchServices reads it. */
          const text = "FORHAN " + format + " " + label,
            doc = {
              type: "doc",
              content: [
                { type: "paragraph", content: [{ type: "text", text }] },
              ],
            },
            file = path.join(
              profile,
              label + " 한글 문서 " + index + "." + format,
            ),
            bytes =
              format === "hwp"
                ? writeHwp({ doc })
                : format === "hwpx"
                  ? await writeHwpx({ doc })
                  : Buffer.from(
                      JSON.stringify({
                        application: "forhan",
                        version: 1,
                        title: path.basename(file),
                        doc,
                      }),
                    );
          await writeFile(file, bytes, { flag: "wx" });
          files.push({
            file,
            text,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
        }
        /** The actual operating-system command receives a native document request separately from application arguments. */
        coldRequested = true;
        /** Native file delivery remains separate from the profile and remote-observation arguments. */
        const cold = spawnSync(
          "/usr/bin/open",
          [
            "-n",
            "-a",
            bundle,
            files[0].file,
            "--args",
            "--user-data-dir=" + profile,
            "--remote-debugging-port=0",
          ],
          { encoding: "utf8", shell: false, timeout: 15000 },
        );
        if (cold.error) throw cold.error;
        expect(cold.status, cold.stderr).toBe(0);
        await expect
          .poll(
            /**
             * Observe actual AppKit registration before trusting the launched process.
             *
             * A native launch request cannot supply its own expected PID or executable.
             * @returns {number} Actual count of registered Forhan applications.
             * @example
             * // An unexpected pre-existing or duplicate process fails the gate.
             */
            () => {
              /** Actual AppKit registration supplies the selected process independently of the launch request. */
              const applications = observeMacApplications("org.forhan.editor");
              if (applications.length === 1) owner = applications[0];
              return applications.length;
            },
            { timeout: 30000 },
          )
          .toBe(1);
        expect(await realpath(owner!.executable)).toBe(executable);
        expect(await realpath(owner!.bundle)).toBe(await realpath(bundle));
        /** Native process arguments must retain this test's exact profile rather than an unrelated user session. */
        const processArguments = spawnSync(
          "/bin/ps",
          ["-p", String(owner!.pid), "-o", "command="],
          { encoding: "utf8", shell: false, timeout: 15000 },
        );
        expect(processArguments.status).toBe(0);
        expect(processArguments.stdout).toContain("--user-data-dir=" + profile);
        ownsProfile = true;
        /** The actual selected process exposes its original renderer port in its exclusively owned profile. */
        let port = 0;
        await expect
          .poll(
            /**
             * Read the original DevTools port published by the actual LaunchServices-launched application.
             *
             * Missing startup output is transient; unrelated filesystem errors remain failures.
             * @async
             * @returns {Promise<boolean>} Whether the actual owned native renderer port is readable.
             * @throws {Error} If the owned port file is malformed or unreadable for another reason.
             * @example
             * // No development Electron or Vite renderer can substitute for this port.
             */
            async () => {
              try {
                port = Number(
                  (
                    await readFile(
                      path.join(profile, "DevToolsActivePort"),
                      "utf8",
                    )
                  ).split("\n")[0],
                );
                return Number.isSafeInteger(port) && port > 0;
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT")
                  return false;
                throw error;
              }
            },
            { timeout: 30000 },
          )
          .toBe(true);
        browser = await chromium.connectOverCDP("http://127.0.0.1:" + port);
        await expect
          .poll(
            /**
             * Wait for the actual native document renderer to appear after cold startup.
             *
             * The native debugging endpoint can become ready before its first window.
             * @returns {number} Actual count of owned document renderer pages.
             * @example
             * // A port alone cannot establish that native document delivery created a window.
             */
            () => browser!.contexts()[0].pages().length,
            { timeout: 30000 },
          )
          .toBe(1);
        /** Cold native file delivery must produce the actual source and format in the real packaged renderer. */
        let page = browser.contexts()[0].pages()[0];
        await expect
          .poll(
            /**
             * Read original editable text after cold native file delivery.
             *
             * Inaccessible drawing copies cannot satisfy source delivery assertions.
             * @async
             * @returns {Promise<string>} Actual current source text.
             * @example
             * // This reads the document delivered by macOS, never a supplied renderer import.
             */
            async () => page.locator(".tiptap").evaluate(imeSourceText),
            { timeout: 30000 },
          )
          .toBe(files[0].text);
        await expect(page.locator("#format-badge")).toHaveText(
          format.toUpperCase(),
        );
        expect(page.url()).toContain(
          "/Contents/Resources/app.asar/dist/index.html",
        );
        observations.push({
          phase: "cold",
          owner,
          url: page.url(),
          source: await page.locator(".tiptap").evaluate(imeSourceText),
        });
        await page.locator(".tiptap").fill(files[0].text + " UNSAVED");
        /** A warm native file request must enter the genuine unsaved-source confirmation path. */
        const warm = spawnSync("/usr/bin/open", ["-a", bundle, files[1].file], {
          encoding: "utf8",
          shell: false,
          timeout: 15000,
        });
        if (warm.error) throw warm.error;
        expect(warm.status, warm.stderr).toBe(0);
        await expect(page.getByRole("dialog")).toContainText(
          "변경 내용을 저장할까요",
        );
        await page.getByRole("button", { name: "취소", exact: true }).click();
        expect(await page.locator(".tiptap").evaluate(imeSourceText)).toBe(
          files[0].text + " UNSAVED",
        );
        expect(observeMacApplications("org.forhan.editor")).toEqual([owner]);
        /** Requesting the same native file again permits an explicit ordinary discard decision. */
        const accepted = spawnSync(
          "/usr/bin/open",
          ["-a", bundle, files[1].file],
          { encoding: "utf8", shell: false, timeout: 15000 },
        );
        if (accepted.error) throw accepted.error;
        expect(accepted.status, accepted.stderr).toBe(0);
        await expect(page.getByRole("dialog")).toContainText(
          "변경 내용을 저장할까요",
        );
        await page
          .getByRole("button", { name: "저장 안 함", exact: true })
          .click();
        await expect(page.locator(".tiptap")).toHaveText(files[1].text);
        observations.push({
          phase: "warm",
          owner,
          source: await page.locator(".tiptap").evaluate(imeSourceText),
          cancelPreservedSource: true,
        });
        /** Ordinary last-window closure leaves the original Mac process resident without a renderer. */
        const closed = page.waitForEvent("close");
        await page.locator('[data-window="close"]').click();
        await closed;
        expect(observeMacApplications("org.forhan.editor")).toEqual([owner]);
        /** The actual operating-system file request must create a replacement renderer in the same native process. */
        const opened = browser.contexts()[0].waitForEvent("page"),
          resident = spawnSync("/usr/bin/open", ["-a", bundle, files[2].file], {
            encoding: "utf8",
            shell: false,
            timeout: 15000,
          });
        if (resident.error) throw resident.error;
        expect(resident.status, resident.stderr).toBe(0);
        page = await opened;
        await expect(page.locator(".tiptap")).toHaveText(files[2].text, {
          timeout: 30000,
        });
        expect(observeMacApplications("org.forhan.editor")).toEqual([owner]);
        /** The genuine save action must bind only to the file delivered to this replacement window. */
        const edited = files[2].text + " SAVED";
        await page.locator(".tiptap").fill(edited);
        await page.locator("#save-document").click();
        await expect(page.locator("#save-state")).not.toHaveClass(/unsaved/u);
        /** Independent native parsers inspect actual production filesystem output after the ordinary save. */
        const bytes = await readFile(files[2].file),
          doc =
            format === "hwp"
              ? readHwp(bytes).doc
              : format === "hwpx"
                ? (await readHwpx(bytes)).doc
                : JSON.parse(bytes.toString()).doc;
        expect(doc.content?.[0]?.content).toEqual([
          expect.objectContaining({ type: "text", text: edited }),
        ]);
        for (/** Cancellation and renderer replacement must never overwrite either earlier native source. */ const original of files.slice(
          0,
          2,
        ))
          expect(
            createHash("sha256")
              .update(await readFile(original.file))
              .digest("hex"),
          ).toBe(original.sha256);
        await writeFile(
          path.join(directory, "actual-saved-output." + format),
          bytes,
        );
        observations.push({
          phase: "resident",
          owner,
          source: await page.locator(".tiptap").evaluate(imeSourceText),
          savedOutputSha256: createHash("sha256").update(bytes).digest("hex"),
          earlierSourcesUnchanged: true,
        });
        passed = true;
      } catch (error) {
        failure = String(error);
        throw error;
      } finally {
        /** Cleanup failure is retained independently from the original source/routing assertion. */
        let cleanupFailure: unknown = null;
        try {
          if (coldRequested && !ownsProfile) {
            /** Native recovery never adopts an existing or foreign application without the exact owned profile argument. */
            const applications = observeMacApplications("org.forhan.editor");
            for (/** Only a process launched with this unique profile can be considered for owned cleanup. */ const application of applications) {
              /** Native command-line identity is observed without modifying the candidate application. */
              const argumentsResult = spawnSync(
                "/bin/ps",
                ["-p", String(application.pid), "-o", "command="],
                { encoding: "utf8", shell: false, timeout: 15000 },
              );
              if (
                argumentsResult.status === 0 &&
                argumentsResult.stdout.includes("--user-data-dir=" + profile) &&
                (await realpath(application.executable)) === executable
              ) {
                owner = application;
                ownsProfile = true;
                break;
              }
            }
          }
          if (owner && ownsProfile) {
            requestOwnedMacTermination(owner);
            await expect
              .poll(
                /**
                 * Observe actual process disappearance after the ordinary native terminate request.
                 *
                 * An accepted request cannot substitute for confirmed native termination.
                 * @async
                 * @returns {Promise<boolean>} Whether the exact original native process no longer exists.
                 * @throws {Error} If process inspection fails for a reason other than absence.
                 * @example
                 * // No forced termination can satisfy successful cleanup.
                 */
                async () => {
                  try {
                    process.kill(owner!.pid, 0);
                    if (browser)
                      for (/** A failed assertion may leave owned unsaved data requiring an ordinary discard decision. */ const page of browser
                        .contexts()[0]
                        ?.pages() ?? []) {
                        try {
                          if (
                            !page.isClosed() &&
                            (await page
                              .getByRole("button", {
                                name: "저장 안 함",
                                exact: true,
                              })
                              .isVisible())
                          )
                            await page
                              .getByRole("button", {
                                name: "저장 안 함",
                                exact: true,
                              })
                              .click();
                        } catch (error) {
                          if (
                            !(error instanceof Error) ||
                            !/Target page, context or browser has been closed/u.test(
                              error.message,
                            )
                          )
                            throw error;
                        }
                      }
                    return false;
                  } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === "ESRCH")
                      return true;
                    throw error;
                  }
                },
                { timeout: 15000 },
              )
              .toBe(true);
            normalExit = true;
          }
        } catch (error) {
          cleanupFailure = String(error);
        }
        await writeFile(
          path.join(directory, "run.json"),
          JSON.stringify(
            {
              format,
              passed: passed && !cleanupFailure,
              normalExit,
              forced: false,
              owner,
              ownsProfile,
              failure,
              cleanupFailure,
              files,
              observations,
              nativeOpenRequestsVerified:
                passed && normalExit && !cleanupFailure,
            },
            null,
            2,
          ) + "\n",
        );
        if (browser) await browser.close();
        expect(path.dirname(profile)).toBe(path.resolve(tmpdir()));
        expect(
          path.basename(profile).startsWith("forhan-macos-file-open-"),
        ).toBe(true);
        if (!coldRequested || normalExit)
          await rm(profile, { recursive: true, force: true });
        if (cleanupFailure)
          throw new Error(
            "Owned native file-open cleanup failed: " + cleanupFailure,
          );
      }
    },
  );
}
