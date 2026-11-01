import {
  type NativeSpaceRange,
  measureNativeSpaces,
  applyNativeSpaces,
} from "./font-space.ts";
import {
  paragraphSpaceFraction,
  readParagraphCondense,
} from "./paragraph-minimum-space.ts";
import {
  nativeDocumentZoom,
  measureNativeParagraph,
} from "./native-line-layout.ts";

/** One original ASCII space keeps its native base correction and independent paragraph reduction. */
export interface ParagraphSpaceRange extends NativeSpaceRange {
  paragraph: HTMLElement;
  natural: number;
  minimumDelta: number;
  condenseDelta: number;
  eligible: boolean;
}

/**
 * Collect original native spaces with their paragraph's adaptive lower bound.
 *
 * Original font-space, width and tracking corrections remain independent.
 * Leading paragraph whitespace cannot acquire condensation. Reserved native
 * values retain their source without inventing unsupported glyph behavior.
 * @param {HTMLElement} root - Attached live editor or owned static export root.
 * @param {NativeSpaceRange[]} base - Original native character-space corrections.
 * @returns {ParagraphSpaceRange[]} Original source-space ranges at their minimum permitted width.
 * @throws {RangeError} If explicit original paragraph metadata is malformed.
 * @example
 * collectParagraphSpaces(body,base); // A 50% minimum leaves leading indentation untouched.
 */
export function collectParagraphSpaces(
  root: HTMLElement,
  base: NativeSpaceRange[],
): ParagraphSpaceRange[] {
  /** One canvas belongs to the actual owning font environment. */
  const document = root.ownerDocument,
    context = document.createElement("canvas").getContext("2d"),
    parts: ParagraphSpaceRange[] = [],
    byNode = new Map<Text, NativeSpaceRange[]>();
  if (!context) return parts;
  for (/** Native base ranges remain associated with original source text nodes. */ const part of base) {
    /** One text node can have independent tracked directional-end corrections. */
    const existing = byNode.get(part.node) ?? [];
    existing.push(part);
    byNode.set(part.node, existing);
  }
  for (/** Original paragraphs own independent native minimum-space settings. */ const paragraph of root.querySelectorAll<HTMLElement>(
    "p,h1,h2,h3,h4,h5,h6",
  )) {
    /** An unconfigured or reserved source must not change ordinary glyph layout. */
    const fraction = paragraphSpaceFraction(
      readParagraphCondense(paragraph) ?? 0,
    );
    if (fraction >= 1) continue;
    /** Source order distinguishes fixed leading indentation from interword gaps. */
    const walker = document.createTreeWalker(paragraph, 4);
    let seenContent = false;
    while (walker.nextNode()) {
      /** Rendering-only SVG and widget content never becomes authored whitespace. */
      const node = walker.currentNode as Text,
        parent = node.parentElement;
      if (
        !parent ||
        parent.closest(
          'svg,[contenteditable="false"],[data-forhan-hyphen-drawing]',
        )
      )
        continue;
      /** Font metrics do not read the existing drawing's word-spacing correction. */
      const style = document.defaultView!.getComputedStyle(parent);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      /** Intrinsic glyph width and original character corrections remain separately recoverable. */
      const intrinsic = context.measureText(" ").width;
      for (let index = 0; index < node.length; index++) {
        if (node.data[index] !== " ") {
          if (!/\s/u.test(node.data[index])) seenContent = true;
          continue;
        }
        /** Existing source-native character spacing is independent from paragraph condensation. */
        const original = byNode.get(node)?.find(
            /**
             * Select this source character's existing native font-space correction.
             *
             * Directional boundary spaces may differ from neighboring source spaces.
             * @param {NativeSpaceRange} candidate - Original native source correction.
             * @returns {boolean} Whether it contains this exact source character.
             * @example
             * // A trailing tracked run does not inherit the next run's correction.
             */
            (candidate) => candidate.from <= index && candidate.to > index,
          ),
          baseDelta = original?.delta ?? 0,
          natural =
            intrinsic +
            baseDelta +
            (original?.resetLetterSpacing
              ? 0
              : parseFloat(style.letterSpacing) || 0),
          eligible = seenContent && natural > 0,
          minimumDelta = eligible ? natural * (fraction - 1) : 0;
        parts.push({
          paragraph,
          node,
          from: index,
          to: index + 1,
          delta: baseDelta + minimumDelta,
          natural,
          minimumDelta,
          condenseDelta: minimumDelta,
          eligible,
          resetLetterSpacing: original?.resetLetterSpacing,
        });
      }
    }
  }
  return parts;
}

/**
 * Restore unnecessary reduction within the source lines selected at minimum width.
 *
 * Greedy browser wrapping first selects which complete words fit at the native
 * lower bound. Unused line capacity then restores internal gaps proportionally
 * up to their original advances. Hanging trailing spaces retain their original
 * width, and justified browser lines keep their own final alignment expansion.
 * @param {ParagraphSpaceRange[]} parts - Newly measured original spaces after minimum-width layout.
 * @returns {ParagraphSpaceRange[]} Line-sensitive source corrections without changing text or DOM.
 * @example
 * settleParagraphSpaces(parts); // A short final line keeps full original spaces.
 */
export function settleParagraphSpaces(
  parts: ParagraphSpaceRange[],
): ParagraphSpaceRange[] {
  /** Independent source paragraphs retain separate available widths and indentation. */
  const paragraphs = new Map<HTMLElement, ParagraphSpaceRange[]>();
  for (/** New measurements refer to the actual current source DOM nodes. */ const part of parts) {
    /** One paragraph's temporary minimum plan cannot affect its neighbors. */
    const group = paragraphs.get(part.paragraph) ?? [];
    group.push(part);
    paragraphs.set(part.paragraph, group);
  }
  for (/** Each original paragraph is settled against its own measured physical content width. */ const [
    paragraph,
    spaces,
  ] of paragraphs) {
    /** Existing native line measurement removes old rendering-only baseline shifts. */
    const plan = measureNativeParagraph(paragraph);
    if (!plan) {
      for (/** Unmeasured line contexts retain original gaps instead of guessing a global shrink. */ const part of spaces) {
        part.delta -= part.condenseDelta;
        part.condenseDelta = 0;
      }
      continue;
    }
    /** Distances are expressed in original CSS pixels rather than accumulated zoom. */
    const document = paragraph.ownerDocument,
      style = document.defaultView!.getComputedStyle(paragraph),
      zoom = nativeDocumentZoom(paragraph),
      width =
        paragraph.getBoundingClientRect().width / zoom -
        (parseFloat(style.paddingLeft) || 0) -
        (parseFloat(style.paddingRight) || 0) -
        (parseFloat(style.borderLeftWidth) || 0) -
        (parseFloat(style.borderRightWidth) || 0);
    for (let line = 0; line < plan.lines.length; line++) {
      /** Source ranges preserve physical line membership independently from edited glyph text. */
      const ranges = plan.ranges.filter(
        /**
         * Select source fragments belonging to one actual visual line.
         *
         * Native line numbers are measured from original DOM ranges.
         * @param {import('./native-line-layout.ts').NativeLineRange} range - Actual source line fragment.
         * @returns {boolean} Whether it belongs to this physical line.
         * @example
         * // Zero-progress source lines retain independent measured identities.
         */
        (range) => range.line === line,
      );
      let last = ranges.length - 1,
        lastEnd = last >= 0 ? ranges[last].to : 0;
      while (last >= 0) {
        /** Hanging line-end blanks are excluded from content capacity and condensation. */
        const range = ranges[last],
          text = range.node.data
            .slice(range.from, range.to)
            .replace(/ +$/u, "");
        if (text.length) {
          lastEnd = range.from + text.length;
          break;
        }
        last--;
        if (last >= 0) lastEnd = ranges[last].to;
      }
      let left = Infinity,
        right = -Infinity;
      /** Internal source spaces retain their natural per-font width weights. */
      const internal: ParagraphSpaceRange[] = [];
      for (let index = 0; index < ranges.length; index++) {
        /** Each measured fragment retains its current source node and exact offsets. */
        const source = ranges[index],
          end = index === last ? lastEnd : source.to;
        for (/** Only the original source spaces in this line fragment can receive a correction. */ const space of spaces) {
          if (
            space.node !== source.node ||
            space.from < source.from ||
            space.from >= source.to
          )
            continue;
          if (index <= last && space.from < end && space.eligible)
            internal.push(space);
          else {
            space.delta -= space.condenseDelta;
            space.condenseDelta = 0;
          }
        }
        if (index > last || end <= source.from) continue;
        /** Direct original text rectangles supply real occupied width after native character corrections. */
        const range = document.createRange();
        range.setStart(source.node, source.from);
        range.setEnd(source.node, end);
        for (/** A real source fragment can have several directional or generated-hyphen rectangles. */ const rect of range.getClientRects()) {
          if (rect.width <= 0) continue;
          left = Math.min(left, rect.left);
          right = Math.max(right, rect.right);
        }
      }
      if (!internal.length || !Number.isFinite(left) || !Number.isFinite(right))
        continue;
      /** Positive first-line indentation reduces only the first available line width. */
      const available =
          width - (line === 0 ? parseFloat(style.textIndent) || 0 : 0),
        occupied = (right - left) / zoom,
        capacity = Math.max(0, available - occupied - 1 / 64),
        natural = internal.reduce(
          /**
           * Accumulate the original physical widths of this line's internal source gaps.
           *
           * Mixed native fonts share a proportional restoration fraction.
           * @param {number} total - Previously accumulated original gap width.
           * @param {ParagraphSpaceRange} part - One actual original internal source space.
           * @returns {number} Updated original space-width sum.
           * @example
           * // Larger original spaces receive proportionally larger restoration.
           */
          (total, part) => total + part.natural,
          0,
        );
      for (/** Restoration never exceeds each source gap's original native advance. */ const part of internal) {
        /** The original minimum reduction remains a lower bound rather than a fixed global gap. */
        const restored = Math.min(
          -part.minimumDelta,
          natural > 0 ? (capacity * part.natural) / natural : 0,
        );
        part.delta += restored;
        part.condenseDelta += restored;
      }
    }
  }
  return parts;
}

/**
 * Prepare adaptive native paragraph spacing in an owned static export DOM.
 *
 * Original native character corrections must already be present. A temporary
 * lower-bound pass establishes actual wrapping; a second pass restores unused
 * gap width without adding text, marks or scripts to the exported document.
 * @param {HTMLElement} root - Attached owned static export root after native character layout.
 * @returns {void} Updates only detached rendering wrappers at actual paper content width.
 * @throws {Error} If an expected owned drawing wrapper is missing.
 * @example
 * applyParagraphMinimumSpaces(printDocument.body); // Native source writers remain independent.
 */
export function applyParagraphMinimumSpaces(root: HTMLElement): void {
  /** Native character advances are measured independently from existing drawing corrections. */
  const minimum = collectParagraphSpaces(root, measureNativeSpaces(root));
  if (!minimum.length) return;
  applyNativeSpaces(minimum);
  /** The actual lower-bound DOM supplies line membership for the final adaptive layout. */
  const settled = settleParagraphSpaces(
    collectParagraphSpaces(root, measureNativeSpaces(root)),
  );
  for (/** Existing owned wrappers receive final line-sensitive widths without changing source nodes. */ const part of settled) {
    /** Each owned wrapper still contains exactly its original source ASCII space. */
    const wrapper = part.node.parentElement?.closest<HTMLElement>(
      "[data-forhan-condense-delta]",
    );
    if (!wrapper)
      throw new Error("An owned paragraph-space drawing is missing.");
    wrapper.setAttribute("data-forhan-space-delta", String(part.delta));
    wrapper.setAttribute(
      "data-forhan-condense-delta",
      String(part.condenseDelta),
    );
    wrapper.setAttribute(
      "style",
      `word-spacing:${part.delta}px${part.resetLetterSpacing ? ";letter-spacing:0" : ""}`,
    );
  }
}
