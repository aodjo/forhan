import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { JSONContent } from "@tiptap/core";
import {
  JOINED_SCRIPTS,
  joinedGeometry,
  joinedGlyphGeometry,
} from "./helpers/joined-layout";

/**
 * Verify native mixed-height line progress for contextual joining scripts.
 *
 * Physical hard breaks and zero progress exercise actual source line identity;
 * descending RTL glyph coordinates must not invent extra visual lines. Saved
 * source retains the original Unicode strings and authored hard breaks.
 * @async
 * @param {{page:Page}} context - Actual owned renderer.
 * @returns {Promise<void>} Resolves after all real source geometry and save checks pass.
 * @throws {Error} If native progress or original source identity differs.
 * @example
 * // Arabic, Devanagari, Bengali and Thai retain independent original point heights.
 */
async function verifyJoinedLines({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  for (/** Each coherent original script retains its own real installed fallback glyphs. */
  const script of JOINED_SCRIPTS)
    for (/** Native zero and fixed modes cannot inherit proportional browser strut leading. */
    const spacing of ["1.6", "18pt", "0pt"]) {
      /** Original physical point heights determine the independently expected native baselines. */
      const sizes = [32, 16, 24],
        content: JSONContent[] = [],
        expected: number[] = [];
      let top = 0;
      for (let index = 0; index < sizes.length; index++) {
        if (index) content.push({ type: "hardBreak" });
        content.push({
          type: "text",
          text: script.words[index],
          marks: [
            {
              type: "textStyle",
              attrs: { fontFamily: "Arial", fontSize: sizes[index] + "pt" },
            },
          ],
        });
        expected.push(top + ((sizes[index] * 4) / 3) * 0.85);
        top +=
          spacing === "1.6"
            ? ((sizes[index] * 4) / 3) * 1.6
            : spacing === "18pt"
              ? 24
              : 0;
      }
      /** Unique import names require an actual source replacement before reading its geometry. */
      const name = `joined-${script.id}-${spacing}.forhan`,
        doc: JSONContent = {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { lineHeight: spacing, textAlign: "left" },
              content,
            },
          ],
        };
      await page
        .locator("#file-input")
        .setInputFiles({
          name,
          mimeType: "application/json",
          buffer: Buffer.from(
            JSON.stringify({ application: "forhan", version: 1, doc }),
          ),
        });
      await expect(page.locator("#toast")).toContainText(name);
      await expect(page.locator(".tiptap p")).toHaveAttribute(
        "data-forhan-layout-height",
        /^-?\d/u,
      );
      /** Actual original glyph positions independently verify the planned native metadata. */
      const actual = await page.locator(".tiptap p").evaluate(joinedGeometry);
      expect(actual.height).toBeCloseTo(top, 1);
      expect(actual.runs).toHaveLength(3);
      for (let index = 0; index < sizes.length; index++) {
        expect(actual.runs[index].text).toBe(script.words[index]);
        expect(actual.runs[index].baseline).toBeCloseTo(expected[index], 1);
      }
      /** Real serialization must not substitute isolated Arabic presentation forms or duplicate drawing text. */
      const pending = page.waitForEvent("download");
      await page.locator("#save-document").click();
      /** Actual downloaded source bytes keep all authored text and break nodes. */
      const saved = JSON.parse(
        (await readFile((await (await pending).path())!)).toString("utf8"),
      );
      expect(saved.doc.content[0].content).toMatchObject(content);
    }
}

test(
  "joined-script native line flow retains contextual source across physical mixed-height and zero intervals",
  verifyJoinedLines,
);

/**
 * Verify coherent joining-script reflow and actual standalone HTML geometry.
 *
 * Real viewport narrowing/widening must converge without inventing lines from
 * descending Arabic x positions. Native zero progress and real saved HTML use
 * the same baseline model while original script shaping remains browser-owned.
 * @async
 * @param {{page:Page}} context - Actual owned browser renderer.
 * @returns {Promise<void>} Resolves after real reflow, HTML output and source checks pass.
 * @throws {Error} If source geometry drifts or output replaces original Unicode text.
 * @example
 * // A narrow Arabic paragraph returns to the same real line count after widening and narrowing.
 */
async function verifyJoinedReflow({ page }: { page: Page }): Promise<void> {
  await page.goto("/");
  for (/** Original Arabic and three joining/mark scripts use real platform font fallback. */
  const script of JOINED_SCRIPTS) {
    /** Long original sentences provide real browser soft-wrap opportunities. */
    const text = `${script.words.join(" ")} ${script.words.join(" ")} ${script.words.join(" ")}`,
      counts: number[] = [],
      doc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { lineHeight: "1.6", textAlign: "left" },
            content: [
              {
                type: "text",
                text,
                marks: [
                  {
                    type: "textStyle",
                    attrs: { fontFamily: "Arial", fontSize: "32pt" },
                  },
                ],
              },
            ],
          },
        ],
      },
      name = `joined-reflow-${script.id}.forhan`;
    await page
      .locator("#file-input")
      .setInputFiles({
        name,
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ application: "forhan", version: 1, doc }),
        ),
      });
    await expect(page.locator("#toast")).toContainText(name);
    for (/** Returning to the same source width must reproduce the same physical source flow. */
    const width of [160, 300, 160]) {
      await page.locator(".tiptap").evaluate(
        /**
         * Resize only the owned source viewport through ordinary layout.
         *
         * The production resize observer must measure real new wrapping without
         * synthetic source nodes or substituted line metadata.
         * @param {HTMLElement} root - Actual editable source root.
         * @param {number} width - Requested unzoomed CSS width.
         * @async
         * @returns {Promise<void>} Resolves after the real resize observer and its layout frame can run.
         * @example
         * // Narrowing creates real browser lines within the original paragraph.
         */
        async (root, width) => {
          root.style.width = width + "px";
          await new Promise<void>(
            /**
             * Observe actual browser rendering phases after the source width change.
             *
             * Resize observers and their scheduled production measurements run
             * across real frames; no fixed elapsed delay substitutes geometry.
             * @param {()=>void} resolve - Completes after the layout observation frame.
             * @returns {void} Requests actual consecutive browser animation frames.
             * @example
             * // The test cannot accept a previous width's still-valid baseline grid.
             */
            (resolve) =>
              requestAnimationFrame(
                /**
                 * Allow the actual resize observer to schedule its source measurement.
                 *
                 * The following frame then observes current production layout work.
                 * @returns {void} Schedules completion after the real observer phase.
                 * @example
                 * // No synthetic source geometry is injected into the application.
                 */
                () => {
                    requestAnimationFrame(
                      /**
                       * Complete observation after the actual production layout frame.
                       *
                       * The animation timestamp is deliberately ignored rather than
                       * passed as the resolved value of this void promise.
                       * @returns {void} Completes the owned frame observation.
                       * @example
                       * // Resizing has had its real observer and measurement phases.
                       */
                      () => resolve(),
                    );
                },
              ),
          );
        },
        width,
      );
      await expect
        .poll(
          /**
           * Observe physical source baselines after actual viewport reflow.
           *
           * Declared height alone is insufficient: every original grapheme must
           * lie on a real native baseline without repeated measurement drift.
           * @async
           * @returns {Promise<boolean>} Whether physical source geometry has converged.
           * @example
           * // Arabic x movement within a line cannot create fictitious extra lines.
           */
          async () => {
            /** Native line intervals come from independent original point heights. */
            const actual = await page
                .locator(".tiptap p")
                .evaluate(joinedGlyphGeometry),
              advance = ((32 * 4) / 3) * 1.6,
              count = Math.round(actual.height / advance);
            if (count < 2 || Math.abs(actual.height - count * advance) > 0.1)
              return false;
            /** Observed physical lines must cover exactly the actual paragraph height. */
            const observed = new Set<number>();
            for (/** Every actual complete source grapheme must belong to a valid physical line. */
            const baseline of actual.baselines) {
              /** Source glyphs identify native physical line indices without counting wrappers. */
              const line = (baseline - ((32 * 4) / 3) * 0.85) / advance;
              if (
                Math.abs(line - Math.round(line)) > 0.01 ||
                line < -0.01 ||
                line > count - 0.99
              )
                return false;
              observed.add(Math.round(line));
            }
            return observed.size === count;
          },
        )
        .toBe(true);
      /** Actual paragraph height supplies the observed line count without inspecting decoration nodes. */
      const actual = await page
        .locator(".tiptap p")
        .evaluate(joinedGlyphGeometry);
      counts.push(Math.round(actual.height / (((32 * 4) / 3) * 1.6)));
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[2]).toBe(counts[0]);
    /** Actual HTML export runs the production isolated static layout pipeline. */
    const pending = page.waitForEvent("download");
    await page.locator("#export-menu-toggle").click();
    await page.locator('[data-export="html"]').click();
    /** Complete downloaded HTML must retain the original coherent script exactly once. */
    const html = (await readFile((await (await pending).path())!)).toString(
        "utf8",
      ),
      output = await page.context().newPage();
    try {
      await output.setContent(html);
      await output.evaluate(
        /**
         * Wait for the actual standalone output font layout.
         *
         * The downloaded document contains no script that could repair or
         * substitute its serialized native geometry after loading.
         * @async
         * @returns {Promise<void>} Resolves when its original fonts are ready.
         * @example
         * // Real static HTML requires no application JavaScript to position Arabic lines.
         */
        async () => {
          await document.fonts.ready;
        },
      );
      await expect(output.locator("p")).toHaveText(text,{useInnerText:true});
      /** Original output ranges expose actual static positions without trusting height metadata. */
      const geometry = await output.locator("p").evaluate(joinedGlyphGeometry),
        advance = ((32 * 4) / 3) * 1.6;
      for (/** Static source uses the same independent physical baseline rule as the live editor. */
      const baseline of geometry.baselines)
        expect((baseline - ((32 * 4) / 3) * 0.85) / advance).toBeCloseTo(
          Math.round((baseline - ((32 * 4) / 3) * 0.85) / advance),
          1,
        );
      expect(geometry.height / advance).toBeCloseTo(
        Math.round(geometry.height / advance),
        1,
      );
    } finally {
      await output.close();
    }
    /** Zero physical spacing must preserve every original wrapped source glyph on one baseline. */
    doc.content[0].attrs.lineHeight = "0pt";
    await page
      .locator("#file-input")
      .setInputFiles({
        name: "zero-" + name,
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ application: "forhan", version: 1, doc }),
        ),
      });
    await expect(page.locator("#toast")).toContainText("zero-" + name);
    await expect(page.locator(".tiptap p")).toHaveAttribute(
      "data-forhan-layout-height",
      "0",
    );
    /** Actual ranges must overlap without deleting or isolating original script characters. */
    const zero = await page.locator(".tiptap p").evaluate(joinedGlyphGeometry);
    for (/** Zero progress retains the original 32pt baseline independently of browser wrap count. */
    const baseline of zero.baselines)
      expect(baseline).toBeCloseTo(((32 * 4) / 3) * 0.85, 1);
  }
}

test(
  "joined-script real soft wraps converge and standalone HTML retains original contextual source geometry",
  verifyJoinedReflow,
);
