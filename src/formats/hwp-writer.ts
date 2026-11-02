import CFB from "cfb";
import {retainedTableProperties,hwpTableFlags,hwpTableSpacing,type NativeTableProperties} from '../table-properties.ts';
import {nativeCellDimension} from '../cell-geometry.ts';
import {writeHwpCellField} from '../cell-field-name.ts';
import {hwpCellFlags,nativeCellProperties,nativeCellMargins,type NativeCellMargins} from '../cell-properties.ts';
import { characterDecoration, type CharacterDecoration } from "../character-decorations.ts";
import { characterFonts } from "../character-fonts.ts";
import { nativeSpacingFlag } from "../font-space.ts";
import { characterShadow, NATIVE_SHADOW_TYPES, type CharacterShadow } from "../character-shadow.ts";
import { characterOutline } from "../character-outline.ts";
import { characterEmphasis } from "../character-emphasis.ts";
import { normalizeColor, colorRef } from "../colors.ts";
import { deflateSync } from "fflate";
import type { JSONContent } from "@tiptap/core";
import type { PageSettings, DocumentPayload } from "../types";
import {
  validateDocument,
  validatePage,
  isSafeDocumentLink,
} from "../documents.ts";
import { readHwp } from "./hwp.ts";
import { encodeParagraphUrc } from "./paragraph-measures.ts";
import { hwpParagraphAlignment } from '../paragraph-alignment.ts';
import { paragraphWordBreaks } from '../paragraph-word-break.ts';
import {paragraphCondense} from '../paragraph-minimum-space.ts';
import {paragraphSnapToGrid,PARAGRAPH_GRID_FLAG} from '../paragraph-line-grid.ts';
import {hwpGridDistance} from '../section-grid.ts';
import {
  characterMetrics,
  type CharacterMetrics,
} from "../character-metrics.ts";
import {
  defaultFontSize,
  nativeFontHeight,
  fixedLineHeightPoints,
} from "../formatting.ts";

/** Input for a runtime-independent HWP 5 document export. */
export interface HwpWriteOptions {
  doc: JSONContent;
  page?: PageSettings;
  title?: string;
  original?: DocumentPayload["original"];
  source?: DocumentPayload['source'];
}
interface CharacterStyle {
  fonts: string[];
  size: number;
  color: number;
  shade: number;
  flags: number;
  metrics: CharacterMetrics;
  underline: CharacterDecoration;
  strike: CharacterDecoration;
  shadow: CharacterShadow;
  outline: number;
  emphasis: number;
}
interface ParagraphStyle {
  snapToGrid:boolean;
  condense:number;
  breakLatinWord:number;
  breakNonLatinWord:number;
  align: number;
  left: number;
  right: number;
  indent: number;
  before: number;
  after: number;
  spacing: number;
  spacingType: number;
  headingType: number;
  headingLevel: number;
  headingReference: number;
}
interface EmbeddedImage {
  id: number;
  extension: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}
interface CellLayout {
  node: JSONContent;
  row: number;
  column: number;
  colspan: number;
  rowspan: number;
  width: number;
  height: number;
  fill: number;
}
interface TableLayout {
  properties:NativeTableProperties;
  flags:unknown;
  margins: NativeCellMargins;
  rows: number;
  columns: number;
  width: number;
  height: number;
  cells: CellLayout[];
  rowCounts: number[];
}
type Field = readonly [offset: number, value: number, size?: 1 | 2 | 4];

/** Maximum size of one source image retained in an HWP export. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Maximum generated compound document size. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Join source byte arrays without depending on Node Buffer.
 *
 * Browser and desktop exports share the same Uint8Array implementation.
 * @param {Uint8Array[]} parts Ordered byte fragments to concatenate.
 * @returns {Uint8Array} Complete contiguous source bytes.
 * @example
 * join([new Uint8Array([1]), new Uint8Array([2])]) // Uint8Array [1, 2]
 */
function join(parts: Uint8Array[]): Uint8Array {
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = new Uint8Array(
    parts.reduce(
      /**
       * Sum byte-fragment lengths for the destination allocation.
       *
       * A single destination array reserves exactly the space needed by the ordered source fragments.
       * @param {number} total Source entry supplied by the enclosing record mapping or assertion.
       * @param {Uint8Array<ArrayBufferLike>} part Source entry supplied by the enclosing record mapping or assertion.
       * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
       * @example
       * sumLengths(total, part) // The accumulated byte length.
       */
      (total, part) => total + part.length,
      0,
    ),
  );
  /** Current source-byte or character-range offset. */
  let offset = 0;
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Construct little-endian binary fields.
 *
 * Numeric fields use explicit offsets and widths from the public HWP 5 format.
 * @param {number} length Byte length of the structure.
 * @param {Field[]} values Offset, value and optional integer-width tuples.
 * @returns {Uint8Array} Zero-initialised structure with the supplied fields.
 * @example
 * fields(2, [[0, 1, 2]]) // Uint8Array [1, 0]
 */
function fields(length: number, values: Field[]): Uint8Array {
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = new Uint8Array(length);
  /** Little-endian view of the binary structure being constructed. */
  const view = new DataView(result.buffer);
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const [offset, value, size = 4] of values) {
    if (size === 1) view.setUint8(offset, value);
    else if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value >>> 0, true);
  }
  return result;
}

/**
 * Encode text in HWP's UTF-16LE byte order.
 *
 * JavaScript code units preserve surrogate pairs without a platform codec.
 * @param {string} value Text to encode.
 * @returns {Uint8Array} UTF-16LE bytes without a byte-order mark.
 * @example
 * utf16("A") // Uint8Array [65, 0]
 */
function utf16(value: string): Uint8Array {
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = new Uint8Array(value.length * 2);
  /** Little-endian view of the binary structure being constructed. */
  const view = new DataView(result.buffer);
  for (let index = 0; index < value.length; index++)
    view.setUint16(index * 2, value.charCodeAt(index), true);
  return result;
}

/**
 * Encode one length-prefixed HWP Unicode string.
 *
 * Font and style metadata store the number of UTF-16 code units before text.
 * @param {string} value Metadata text to encode.
 * @returns {Uint8Array} A two-byte length followed by UTF-16LE text.
 * @throws {Error} If the text exceeds the metadata length field.
 * @example
 * hwpString("A").length // 4
 */
function hwpString(value: string): Uint8Array {
  if (value.length > 65535) throw new Error("HWP metadata text is too long.");
  return join([fields(2, [[0, value.length, 2]]), utf16(value)]);
}

/**
 * Encode a public-format HWP record header and payload.
 *
 * Extended lengths are used when the twelve-bit ordinary length is exhausted.
 * @param {number} tag Public HWP record tag.
 * @param {number} level Source hierarchy level.
 * @param {Uint8Array} payload Complete record payload.
 * @returns {Uint8Array} Header and payload bytes.
 * @example
 * record(67, 1, utf16("A")).length // 6
 */
function record(tag: number, level: number, payload: Uint8Array): Uint8Array {
  return join([
    fields(payload.length >= 4095 ? 8 : 4, [
      [0, tag | (level << 10) | (Math.min(payload.length, 4095) << 20)],
      ...(payload.length >= 4095 ? [[4, payload.length] as Field] : []),
    ]),
    payload,
  ]);
}

/**
 * Encode the reversed bytes of a four-character HWP control ID.
 *
 * Control headers and inline anchors use the same public identifier encoding.
 * @param {string} identifier Four ASCII characters identifying the control.
 * @returns {Uint8Array} Four bytes in the source's little-endian order.
 * @example
 * controlId("tbl ")[0] // 32
 */
function controlId(identifier: string): Uint8Array {
  return Uint8Array.from(
    [...identifier].reverse().map(
      /**
       * Convert one reversed control-ID character to its byte.
       *
       * HWP identifiers retain their public four-character encoding in little-endian byte order.
       * @param {string} character Source entry supplied by the enclosing record mapping or assertion.
       * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
       * @example
       * encodeCharacter("t") // 116
       */
      (character) => character.charCodeAt(0),
    ),
  );
}

/**
 * Encode an extended inline control anchor.
 *
 * Eight UTF-16 code units reserve the control's position among paragraph text.
 * @param {number} code Public control character code.
 * @param {string} identifier Four-character control identifier.
 * @returns {Uint8Array} Sixteen-byte source anchor.
 * @example
 * anchor(11, "tbl ").length // 16
 */
function anchor(code: number, identifier: string): Uint8Array {
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = fields(16, [
    [0, code, 2],
    [14, code, 2],
  ]);
  result.set(controlId(identifier), 2);
  return result;
}

/**
 * Convert CSS lengths to HWP units.
 *
 * HWP uses 7,200 units per inch; unitless values follow the caller's default.
 * @param {unknown} value CSS length or numerical default-unit value.
 * @param {number} fallback Default HWP-unit value for an absent length.
 * @param {string} defaultUnit Unit to assume for a bare number.
 * @returns {number} Rounded HWP units.
 * @throws {Error} If an explicit CSS length has an unsupported unit or magnitude.
 * @example
 * units("25.4mm") // 7200
 */
function units(value: unknown, fallback = 0, defaultUnit = "px"): number {
  if (value === undefined || value === null || value === "") return fallback;
  /** Validated CSS-length or embedded-data pattern match. */
  const match = String(value)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|in|pt|px)?$/i);
  if (!match)
    throw new Error(`HWP cannot encode this length: ${String(value)}`);
  /** Conversion factors from supported CSS length units to HWP units. */
  const factors: Record<string, number> = {
    mm: 7200 / 25.4,
    cm: 72000 / 25.4,
    in: 7200,
    pt: 100,
    px: 75,
  };
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result = Math.round(
    Number(match[1]) * factors[(match[2] || defaultUnit).toLowerCase()],
  );
  if (!Number.isFinite(result) || Math.abs(result) > 10000000)
    throw new Error("HWP length is outside the supported range.");
  return result;
}

/**
 * Convert a CSS colour to HWP's low-byte-red integer.
 *
 * Common hexadecimal and RGB notation preserve character and cell colours.
 * @param {unknown} value CSS colour string.
 * @param {number} fallback Default source colour when no colour is specified.
 * @returns {number} HWP COLORREF value.
 * @throws {Error} If an explicit colour is unsupported.
 * @example
 * colour("#ff0000") // 255
 */
function colour(value: unknown, fallback = 0): number {
  return colorRef(
    String(value).trim().toLowerCase() === "transparent" ? "#ffffff" : value,
    fallback,
  );
}

/**
 * Compare document meaning while ignoring editor defaults.
 *
 * Source IDs, null attributes and false default flags do not prevent an
 * unchanged imported source from being returned byte-for-byte.
 * @param {unknown} value Document tree or retained JSON metadata.
 * @returns {unknown} Canonical JSON-compatible value.
 * @example
 * canonical({ sourceId: "a", pageBreak: false }) // {}
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  const result: Record<string, unknown> = {};
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const [key, child] of Object.entries(value).sort(
    /**
     * Order document object keys for semantic comparison.
     *
     * Stable key order allows retained-source comparisons without depending on object insertion order.
     * @param {[string, any]} entry Source entry supplied by the enclosing record mapping or assertion.
     * @param {[string, any]} entry Source entry supplied by the enclosing record mapping or assertion.
     * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
     * @example
     * compareKeys(["a"], ["b"]) // A negative ordering value.
     */
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (
      key === "sourceId" ||
      child === null ||
      child === undefined ||
      child === false ||
      (Array.isArray(child) && !child.length)
    )
      continue;
    result[key] = canonical(child);
  }
  return result;
}

/**
 * Read the intrinsic dimensions of an embedded raster image.
 *
 * PNG, JPEG, GIF, BMP and common WebP headers are decoded without a browser
 * image loader so the same synchronous writer works on both desktop platforms.
 * @param {Uint8Array} bytes Complete image bytes.
 * @param {string} extension Embedded image extension.
 * @returns {[number, number]} Width and height in pixels.
 * @throws {Error} If the image header cannot establish valid dimensions.
 * @example
 * imageSize(validPng, "png") // PNG width and height.
 */
function imageSize(bytes: Uint8Array, extension: string): [number, number] {
  /** Little-endian view of the binary structure being constructed. */
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /** Decoded raster or table width used by the current source structure. Object or paragraph line height in native HWP units. */
  let width = 0,
    height = 0;
  if (extension === "png" && bytes.length >= 24) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (extension === "gif" && bytes.length >= 10) {
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (extension === "bmp" && bytes.length >= 26) {
    width = view.getInt32(18, true);
    height = Math.abs(view.getInt32(22, true));
  } else if (extension === "jpg") {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 255) break;
      /** JPEG segment marker inspected while locating intrinsic image dimensions. */
      const marker = bytes[offset + 1];
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        height = view.getUint16(offset + 5);
        width = view.getUint16(offset + 7);
        break;
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      /** Current encoded structure or image-segment byte length. */
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      offset += length + 2;
    }
  } else if (extension === "webp" && bytes.length >= 30) {
    /** WebP image encoding selected from its source signature. */
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === "VP8X") {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === "VP8 ") {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === "VP8L") {
      /** Packed WebP lossless image dimensions. */
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    }
  }
  if (!width || !height || width > 100000 || height > 100000)
    throw new Error("HWP cannot determine the embedded image dimensions.");
  return [width, height];
}

/**
 * Construct an HWP summary property set from authored metadata.
 *
 * The OLE property-set header identifies HWP summary information, while the
 * title uses the standard Unicode string property type and four-byte padding.
 * @param {string} title Authored document title.
 * @returns {Uint8Array} Complete HwpSummaryInformation property-set bytes.
 * @example
 * summaryInformation("Report").length > 48 // true
 */
function summaryInformation(title: string): Uint8Array {
  /** Public HWP summary-property-set identifier bytes. */
  const identifier = Uint8Array.from([
    0x60, 0xb6, 0xa2, 0x9f, 0x61, 0x10, 0xd4, 0x11, 0xb4, 0xc6, 0x00, 0x60,
    0x97, 0xc0, 0x9d, 0x8c,
  ]);
  /** Character metadata or encoded Unicode text used by the current source structure. */
  const text = utf16(title.slice(0, 1000) + "\0");
  /** Padded Unicode title property for the OLE summary stream. */
  const property = fields(Math.ceil((8 + text.length) / 4) * 4, [
    [0, 31],
    [4, text.length / 2],
  ]);
  property.set(text, 8);
  /** Independently constructed source record or compound-document header. */
  const header = fields(48, [
    [0, 0xfffe, 2],
    [4, 0x0000000d],
    [24, 1],
    [44, 48],
  ]);
  header.set(identifier, 8);
  header.set(identifier, 28);
  return join([
    header,
    fields(16, [
      [0, 16 + property.length],
      [4, 1],
      [8, 2],
      [12, 16],
    ]),
    property,
  ]);
}

/**
 * Write a genuine standalone HWP 5 OLE document.
 *
 * Fonts, paragraph and character styles, merged tables and embedded raster
 * images use independently constructed public-format records. An unchanged
 * imported source is returned exactly; unsupported changed controls reject
 * export instead of silently dropping their original data.
 * @param {HwpWriteOptions} options Editable document, physical page and optional retained HWP source.
 * @returns {Uint8Array} Complete HWP 5 compound-document bytes.
 * @throws {Error} If a document element cannot be encoded safely or bounds are exceeded.
 * @example
 * writeHwp({ doc: { type: "doc", content: [{ type: "paragraph" }] } }) // Genuine HWP 5 bytes.
 */
export function writeHwp(options: HwpWriteOptions): Uint8Array {
  /** Validated editor document captured for this export. */
  const doc = validateDocument(options.doc);
  /** Validated physical page dimensions and margins. */
  const page = validatePage(options.page);
  if (options.original?.format === "hwp") {
    /** Base64-decoded original source represented as a binary string. */
    const encoded = atob(options.original.base64);
    /** Retained original HWP bytes considered for an unchanged-source return. */
    const originalBytes = Uint8Array.from(
      encoded,

      /**
       * Decode one retained-source byte.
       *
       * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
       * @param {string} character Source entry supplied by the enclosing record mapping or assertion.
       * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
       * @example
       * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
       */
      (character) => character.charCodeAt(0),
    );
    /** Independent parse of the retained source used to verify content and geometry. */
    const parsed = readHwp(originalBytes);
    if (
      JSON.stringify(canonical(doc)) ===
        JSON.stringify(canonical(options.original.doc)) &&
      JSON.stringify(canonical(doc)) ===
        JSON.stringify(canonical(parsed.doc)) &&
      Object.keys(page).every(
        /**
         * Verify retained-source page geometry is unchanged.
         *
         * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
         * @param {string} key Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
         */
        (key) =>
          Math.abs(
            Number(page[key as keyof PageSettings] || 0) -
              Number(parsed.page[key as keyof PageSettings] || 0),
          ) < 0.02,
      )
    )
      return originalBytes;
  }
  /** Distinct authored font names used by the document. */
  const fonts: string[] = [];
  /** Interned character-style definitions referenced by paragraph ranges. */
  const characters: CharacterStyle[] = [];
  /** Interned paragraph-layout definitions referenced by body paragraphs. */
  const paragraphs: ParagraphStyle[] = [];
  /** Source border definitions and optional solid table-cell fills. */
  const fills: number[] = [-1, -1];
  /** Validated embedded raster payloads and their source storage IDs. */
  const images: EmbeddedImage[] = [];
  /** Starting values of independently numbered native paragraph-list definitions. */
  const numberingStarts: number[] = [];
  /** Genuine custom paragraph styles retaining editor heading levels without automatic outline numbering. */
  const headingStyles: {
    level: number;
    paragraph: number;
    character: number;
  }[] = [];
  /** Whether the document needs the standard Unicode bullet definition. */
  let bulletUsed = false;
  /** Next independent instance identifier and ownership of the first top-level section control. */
  let instance = 1,
    sectionWritten = false;
  /** Writable body width after subtracting physical page margins. */
  const bodyWidth = units(
    page.width - page.marginLeft - page.marginRight,
    0,
    "mm",
  );

  /**
   * Intern an editable character-format combination.
   *
   * Supported emphasis, font, size and colour values share one DocInfo definition so paragraph ranges reference stable IDs.
   * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }[] | undefined} marks Character marks on the authored editor text.
   * @param {number} heading Heading level selecting the visual character defaults.
   * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
   * @throws {Error} If the source content cannot be encoded safely in the supported native record structure.
   * @example
   * characterStyle([{ type: "bold" }]) // ID of the bold character definition.
   */
  function characterStyle(
    marks: JSONContent["marks"] = [],
    heading = 0,
  ): number {
    /** Character metadata or encoded Unicode text used by the current source structure. */
    const text =
      marks.find(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "textStyle",
      )?.attrs || {};
    /** Character mark without a safe native HWP representation. */
    const unsupported = marks.find(
      /**
       * Select a supported character mark from the authored run.
       *
       * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
       * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
       */
      (mark) =>
        ![
          "bold",
          "italic",
          "underline",
          "strike",
          "textStyle",
          "superscript",
          "subscript",
          "code",
          "link",
        ].includes(mark.type),
    );
    if (unsupported)
      throw new Error(
        `HWP cannot safely encode character mark ${unsupported.type}.`,
      );
    /** Font name selected for the current character style. */
    const font = String(
      text.fontFamily ||
        (marks.some(
          /**
           * Select a supported character mark from the authored run.
           *
           * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
           * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
           * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
           * @example
           * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
           */
          (mark) => mark.type === "code",
        )
          ? "monospace"
          : "Malgun Gothic"),
    ).replace(/^['"]|['"]$/g, "");
    /** Independent language names retain native references instead of copying one script's face. */
    const faces = characterFonts(text.nativeCharacterFonts, font);
    for (let slot = 0; slot < faces.length; slot++)
      if (!faces[slot]) faces[slot] = font;
    for (
      /** Font registry is shared across separately indexed native language tables. */
      const face of faces
    ) if (!fonts.includes(face || font)) fonts.push(face || font);
    /** Native line properties retain independent shape, position and color. */
    let underline = characterDecoration(null,"underline"), strike = characterDecoration(null,"strike"), strikeType = 1;
    for (/** Original source mark properties remain distinct from foreground text color. */ const mark of marks) {
      if (mark.type === "underline") underline = characterDecoration(mark.attrs,"underline");
      if (mark.type === "strike") {
        strike = characterDecoration(mark.attrs,"strike");
        if (mark.attrs?.nativeStrikeType != null) {
          strikeType = Number(mark.attrs.nativeStrikeType);
          if (!Number.isInteger(strikeType) || strikeType < 1 || strikeType > 7) throw new RangeError("Unsupported native strikeout type.");
        }
      }
    }
    /** Public-format bit flags describing the character or object properties. */
    const flags =
      (marks.some(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "italic",
      )
        ? 1
        : 0) |
      (marks.some(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "bold",
      ) || (heading && text.nativeNormalWeight !== true)
        ? 2
        : 0) |
      (marks.some(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "underline",
      )
        ? 4
        : 0) |
      (marks.some(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "strike",
      )
        ? 1 << 18
        : 0) |
      (marks.some(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "superscript",
      )
        ? 1 << 15
        : 0) |
      (marks.some(
        /**
         * Select a supported character mark from the authored run.
         *
         * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
         * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
         * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
         * @example
         * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
         */
        (mark) => mark.type === "subscript",
      )
        ? 1 << 16
        : 0) |
      (nativeSpacingFlag(text.nativeUseFontSpace) ? 1 << 25 : 0) |
      (nativeSpacingFlag(text.nativeUseKerning) ? 1 << 30 : 0);
    /** Installed Hangul converts legacy centered underlines to independent strikes when reopening binary HWP. */
    const centeredUnderline = !!(flags & 4) && underline.nativePosition === "CENTER";
    if (centeredUnderline) {
      if (flags & (1 << 18)) throw new Error("HWP cannot retain two independently styled centered lines; save this document as HWPX or Forhan.");
      strike = {...underline,nativePosition:"BOTTOM"};
      strikeType = 1;
    }
    /** Candidate shared character or paragraph definition. */
    const style: CharacterStyle = {
      fonts: faces,
      size: nativeFontHeight(text.fontSize, defaultFontSize(heading)),
      color: colour(text.color),
      shade: normalizeColor(text.backgroundColor, true)
        ? colorRef(text.backgroundColor)
        : 0xffffffff,
      flags: (flags & ~0xfc & ~(7 << 18)) |
        (flags & 4 && !centeredUnderline ? ((underline.nativePosition === "TOP" ? 3 : 1) << 2) | (underline.nativePattern << 4) : 0) |
        (flags & (1 << 18) || centeredUnderline ? (strikeType << 18) | (strike.nativePattern << 26) : 0),
      underline,
      strike,
      shadow: characterShadow(text),
      outline: characterOutline(text.nativeOutlineType),
      emphasis: characterEmphasis(text.nativeEmphasisType),
      metrics: characterMetrics(text.nativeCharacterMetrics),
    };
    /** Existing shared-definition index matching the candidate properties. */
    const found = characters.findIndex(
      /**
       * Find a matching shared character-style definition.
       *
       * The style registry preserves explicit font, colour and emphasis while reusing identical source definitions.
       * @param {CharacterStyle} current Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * matchCharacterStyle(markOrStyle) // Whether it supplies the requested formatting.
       */
      (current) => JSON.stringify(current) === JSON.stringify(style),
    );
    if (found >= 0) return found;
    characters.push(style);
    return characters.length - 1;
  }
  /**
   * Intern a paragraph layout definition.
   *
   * Alignment, spacing, indentation and margins become shared HWP paragraph properties referenced by body records.
   * @param {JSONContent} node Editable block, cell or inline node being serialized.
   * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
   * @example
   * paragraphStyle({ type: "paragraph" }) // ID of the paragraph layout definition.
   */
  function paragraphStyle(node: JSONContent): number {
    /** Current paragraph or image attributes from the editor document. */
    const attrs = node.attrs || {};
    /** Requested line-spacing value or generated line-layout payload. */
    const line = String(attrs.lineHeight || "1.6");
    /** Explicit physical distance, distinct from a proportional line-height multiplier. */
    const fixedLine = fixedLineHeightPoints(line);
    /** Native line-spacing mode: proportional or fixed distance. */
    const spacingType = fixedLine === null && !/em$/i.test(line) ? 0 : 1;
    /** Line-spacing value in its selected native mode. */
    const spacing =
      spacingType === 0
        ? Number.isFinite(parseFloat(line))
          ? Math.round(parseFloat(line) * (line.endsWith("%") ? 1 : 100))
          : 160
        : encodeParagraphUrc(line);
    /** Candidate shared character or paragraph definition. */
    const style: ParagraphStyle = {
      snapToGrid:paragraphSnapToGrid(attrs),
      condense:paragraphCondense(attrs),
      breakLatinWord:paragraphWordBreaks(attrs).latin,
      breakNonLatinWord:paragraphWordBreaks(attrs).nonLatin,
      align: hwpParagraphAlignment(attrs.textAlign),
      left: encodeParagraphUrc(attrs.marginLeft),
      right: encodeParagraphUrc(attrs.marginRight),
      indent: encodeParagraphUrc(attrs.textIndent),
      before: encodeParagraphUrc(attrs.marginTop),
      after: encodeParagraphUrc(attrs.marginBottom),
      spacing,
      spacingType,
      headingType: Number(attrs.hwpListType || 0),
      headingLevel: Number(attrs.hwpListLevel || 0),
      headingReference: Number(attrs.hwpListReference || 0),
    };
    /** Existing shared-definition index matching the candidate properties. */
    const found = paragraphs.findIndex(
      /**
       * Find a matching shared paragraph-layout definition.
       *
       * Equivalent alignment, spacing, margin and indentation values reuse the same native paragraph ID.
       * @param {ParagraphStyle} current Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * matchParagraphStyle(style) // Whether its geometry matches the candidate.
       */
      (current) => JSON.stringify(current) === JSON.stringify(style),
    );
    if (found >= 0) return found;
    paragraphs.push(style);
    return paragraphs.length - 1;
  }
  /**
   * Resolve a solid cell-fill border definition.
   *
   * Table cells reuse an existing background definition or add an independently authored solid-fill record.
   * @param {unknown} background Optional authored solid table-cell background colour.
   * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
   * @example
   * borderId(null) // 2, the ordinary table-border definition.
   */
  function borderId(background: unknown): number {
    if (!background) return 2;
    /** Candidate solid cell background converted to HWP COLORREF. */
    const value = colour(background);
    /** Current position in the ordered source fields. */
    let index = fills.indexOf(value, 2);
    if (index < 0) {
      index = fills.length;
      fills.push(value);
    }
    return index + 1;
  }
  /**
   * Validate and register an embedded raster image.
   *
   * The data URL is decoded locally, intrinsic dimensions are established and the binary receives its HWP storage ID.
   * @param {JSONContent} node Editable block, cell or inline node being serialized.
   * @returns {EmbeddedImage} Native source records or editor fixture data for the operation described above.
   * @throws {Error} If the source content cannot be encoded safely in the supported native record structure.
   * @example
   * image(imageNode).id // The one-based embedded image ID.
   */
  function image(node: JSONContent): EmbeddedImage {
    /** Embedded raster data URL or independently imported source fixture. */
    const source = String(node.attrs?.src || "");
    /** Validated CSS-length or embedded-data pattern match. */
    const match = source.match(
      /^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,([A-Za-z\d+/=\s]+)$/,
    );
    if (!match)
      throw new Error("HWP export requires an embedded raster image.");
    /** Locally decoded embedded-image payload before byte conversion. */
    const decoded = atob(match[2]);
    if (decoded.length > MAX_IMAGE_BYTES)
      throw new Error("HWP image exceeds 20MB.");
    /** Complete local input, output or independently constructed source bytes. */
    const bytes = Uint8Array.from(
      decoded,

      /**
       * Convert one decoded raster byte to a Uint8Array value.
       *
       * Local base64 image data is retained exactly in the generated native binary stream.
       * @param {string} character Source entry supplied by the enclosing record mapping or assertion.
       * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
       * @example
       * decodeByte("A") // 65
       */
      (character) => character.charCodeAt(0),
    );
    /** Image storage extension used by the HWP binary reference. */
    const extension = match[1] === "jpeg" ? "jpg" : match[1];
    /** Intrinsic raster width and height obtained from its header. */
    const dimensions = imageSize(bytes, extension);
    /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
    const result: EmbeddedImage = {
      id: images.length + 1,
      extension,
      bytes,
      width: units(node.attrs?.width, dimensions[0] * 75),
      height: units(node.attrs?.height, dimensions[1] * 75),
    };
    if (result.width <= 0 || result.height <= 0)
      throw new Error("HWP image dimensions must be positive.");
    images.push(result);
    return result;
  }
  /**
   * Validate and reconstruct explicit table geometry.
   *
   * Covered grid positions detect invalid merges, while cell widths and paragraph counts define the source cell records.
   * @param {JSONContent} node Editable block, cell or inline node being serialized.
   * @param {number} available Writable width available to the block in HWP units.
   * @returns {TableLayout} Native source records or editor fixture data for the operation described above.
   * @throws {Error} If the source content cannot be encoded safely in the supported native record structure.
   * @example
   * tableLayout(tableNode, 42520).columns // Number of logical table columns.
   */
  function tableLayout(node: JSONContent, available: number): TableLayout {
    /** Older retained XML shells supply properties only for the actual owning source table. */
    const originalTable=options.source?.nodes[String(node.attrs?.sourceId)],properties=retainedTableProperties(node.attrs?.nativeTableProperties,originalTable?.original.type==='table'?originalTable.xml:undefined);
    /** Editor rows to serialize into the native table. */
    const rows = node.content || [];
    /** Logical cell-coverage matrix used to reject overlapping or missing merges. */
    const grid: boolean[][] = [];
    /** Validated table cells and their source row/column geometry. */
    const cells: CellLayout[] = [];
    /** Number of cell-list entries starting in each native table row. */
    const rowCounts: number[] = [];
    /** Logical number of columns in the validated table grid. */
    let columns = 0;
    for (let row = 0; row < rows.length; row++) {
      if (rows[row].type !== "tableRow")
        throw new Error("HWP table contains an invalid row.");
      grid[row] ||= []; /** Next uncovered column in the current table row. */
      let column = 0;
      for (/** Current source entry in the ordered byte, style or table iteration. */
      const cell of rows[row].content || []) {
        if (!["tableCell", "tableHeader"].includes(cell.type || ""))
          throw new Error("HWP table contains an invalid cell.");
        while (grid[row][column]) column++;
        /** Source colspan used by the current native serialization step. Source rowspan used by the current native serialization step. */
        const colspan = Number(cell.attrs?.colspan || 1),
          rowspan = Number(cell.attrs?.rowspan || 1);
        if (
          !Number.isInteger(colspan) ||
          !Number.isInteger(rowspan) ||
          colspan < 1 ||
          rowspan < 1 ||
          row + rowspan > rows.length ||
          column + colspan > 1000
        )
          throw new Error("HWP table merge geometry is invalid.");
        for (let y = row; y < row + rowspan; y++) {
          grid[y] ||= [];
          for (let x = column; x < column + colspan; x++) {
            if (grid[y][x]) throw new Error("HWP table merges overlap.");
            grid[y][x] = true;
          }
        }
        /** Explicit per-column widths or one older total spanning the complete merged cell. */
        const colwidth = cell.attrs?.colwidth as number[] | null;
        /** Decoded raster or table width used by the current source structure. */
        const width =
          (colwidth?.length === colspan || colwidth?.length === 1) &&
          colwidth.every(
            /**
             * Validate an explicit table-column width.
             *
             * The logical table grid and width calculations retain cell spans without introducing missing or overlapping positions.
             * @param {number} value Source entry supplied by the enclosing record mapping or assertion.
             * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
             * @example
             * tableGeometry(entry) // The corresponding validated width or row-cell contribution.
             */
            (value) => value > 0,
          )
            ? Math.round(
                colwidth.reduce(
                  /**
                   * Accumulate authored table-cell widths.
                   *
                   * The logical table grid and width calculations retain cell spans without introducing missing or overlapping positions.
                   * @param {number} sum Source entry supplied by the enclosing record mapping or assertion.
                   * @param {number} value Source entry supplied by the enclosing record mapping or assertion.
                   * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
                   * @example
                   * tableGeometry(entry) // The corresponding validated width or row-cell contribution.
                   */
                  (sum, value) => sum + value,
                  0,
                ) * 75,
              )
            : 0;
        cells.push({
          node: cell,
          row,
          column,
          colspan,
          rowspan,
          width,
          height: nativeCellDimension(cell.attrs?.nativeCellHeight)??Math.max(2400 * (cell.content?.length || 1), 2400 * rowspan),
          fill: borderId(cell.attrs?.backgroundColor),
        });
        rowCounts[row] = (rowCounts[row] || 0) + 1;
        column += colspan;
        columns = Math.max(columns, column);
      }
    }
    if (!rows.length || !columns || rows.length * columns > 50000)
      throw new Error("HWP table size is invalid.");
    for (/** Current source entry in the ordered byte, style or table iteration. */
    const row of grid)
      for (let column = 0; column < columns; column++)
        if (!row[column])
          throw new Error("HWP table has an uncovered cell position.");
    for (/** Current source entry in the ordered byte, style or table iteration. */
    const cell of cells)
      if (!cell.width)
        cell.width = Math.round((Math.max(1,available-properties.cellSpacing*(columns+1)) * cell.colspan) / columns);
    /** Decoded raster or table width used by the current source structure. */
    const width = Math.max(
      ...Array.from(
        { length: rows.length },

        /**
         * Accumulate authored table-cell widths.
         *
         * The logical table grid and width calculations retain cell spans without introducing missing or overlapping positions.
         * @param {unknown} _ Source entry supplied by the enclosing record mapping or assertion.
         * @param {number} row Source entry supplied by the enclosing record mapping or assertion.
         * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
         * @example
         * tableGeometry(entry) // The corresponding validated width or row-cell contribution.
         */
        (_, row) =>
          cells
            .filter(
              /**
               * Collect the cells starting in one table row.
               *
               * The logical table grid and width calculations retain cell spans without introducing missing or overlapping positions.
               * @param {CellLayout} cell Source entry supplied by the enclosing record mapping or assertion.
               * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
               * @example
               * tableGeometry(entry) // The corresponding validated width or row-cell contribution.
               */
              (cell) => cell.row === row,
            )
            .reduce(
              /**
               * Accumulate authored table-cell widths.
               *
               * The logical table grid and width calculations retain cell spans without introducing missing or overlapping positions.
               * @param {number} sum Source entry supplied by the enclosing record mapping or assertion.
               * @param {CellLayout} cell Source entry supplied by the enclosing record mapping or assertion.
               * @returns {number} Shared source ID, geometry measurement or accumulated native field value.
               * @example
               * tableGeometry(entry) // The corresponding validated width or row-cell contribution.
               */
              (sum, cell) => sum + cell.width,
              0,
            ),
      ),
    );
    return {
      properties,
      flags:node.attrs?.nativeTableFlags,
      rows: rows.length,
      margins:nativeCellMargins(node.attrs?.nativeCellMargins),
      columns,
      cells,
      width:width+properties.cellSpacing*(columns+1),
      height: rows.length * 3000+properties.cellSpacing*(rows.length+1),
      rowCounts,
    };
  }
  /**
   * Construct common object-control fields.
   *
   * Independent width, height, category and instance fields are shared by table and picture controls.
   * @param {string} identifier Public four-character source control identifier.
   * @param {number} width Object width in native HWP units.
   * @param {number} height Object height in native HWP units.
   * @param {number} category Public numbering category for the native object control.
   * @returns {Uint8Array<ArrayBufferLike>} Native source records or editor fixture data for the operation described above.
   * @example
   * commonControl("tbl ", 40000, 6000, 2).length // 48
   */
  function commonControl(
    identifier: string,
    width: number,
    height: number,
    category: number,
  ): Uint8Array {
    /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
    const result = fields(48, [
      [4, 0x002a2211 | (category << 26)],
      [16, width],
      [20, height],
      [36, instance++],
    ]);
    result.set(controlId(identifier));
    return result;
  }
  /**
   * Serialize a raster picture control subtree.
   *
   * An embedded picture uses its common control, identity transformation matrices and binary-reference payload.
   * @param {EmbeddedImage} media Validated embedded raster bytes and source image geometry.
   * @param {number} level Native record hierarchy level for the generated subtree.
   * @returns {Uint8Array<ArrayBufferLike>[]} Native source records or editor fixture data for the operation described above.
   * @example
   * imageControl(media, 1).length // 3 records for the picture subtree.
   */
  function imageControl(media: EmbeddedImage, level: number): Uint8Array[] {
    /** Picture shape payload containing independent dimensions and matrices. */
    const component = fields(196, [
      [18, 1, 2],
      [20, media.width],
      [24, media.height],
      [28, media.width],
      [32, media.height],
      [42, Math.round(media.width / 2)],
      [46, Math.round(media.height / 2)],
      [50, 1, 2],
    ]);
    component.set(controlId("$pic"));
    component.set(controlId("$pic"), 4);
    /** Data view used to write identity picture transformation matrices. */
    const matrix = new DataView(component.buffer);
    for (/** Current source entry in the ordered byte, style or table iteration. */
    const start of [52, 100, 148]) {
      matrix.setFloat64(start, 1, true);
      matrix.setFloat64(start + 32, 1, true);
    }
    /** Picture payload linking geometry to the embedded binary ID. */
    const picture = fields(78, [
      [20, media.width],
      [28, media.width],
      [32, media.height],
      [40, media.height],
      [52, media.width],
      [56, media.height],
      [71, media.id, 2],
      [74, instance++],
    ]);
    return [
      record(71, level, commonControl("gso ", media.width, media.height, 1)),
      record(76, level + 1, component),
      record(85, level + 2, picture),
    ];
  }
  /**
   * Serialize an editable table control subtree.
   *
   * The definition, sequential cell lists and each cell paragraph preserve row addresses, merged spans and text ordering.
   * @param {TableLayout} layout Validated table cell geometry and logical coverage.
   * @param {number} level Native record hierarchy level for the generated subtree.
   * @returns {Uint8Array<ArrayBufferLike>[]} Native source records or editor fixture data for the operation described above.
   * @example
   * tableControl(layout, 1) // Table header, definition, cell-list and paragraph records.
   */
  function tableControl(layout: TableLayout, level: number): Uint8Array[] {
    for(/** Native table defaults cannot silently truncate when encoded in unsigned 16-bit fields. */const margin of Object.values(layout.margins))
      if(margin>0xffff)throw new RangeError('셀 기본 여백이 HWP 저장 범위를 벗어났습니다.');
    /** Native table definition with row counts and border references. */
    const definition = fields(22 + layout.rows * 2, [
      [0, hwpTableFlags(layout.properties,layout.flags)],
      [4, layout.rows, 2],
      [6, layout.columns, 2],
      [8, hwpTableSpacing(layout.properties), 2],
      [10, layout.margins.left, 2],
      [12, layout.margins.right, 2],
      [14, layout.margins.top, 2],
      [16, layout.margins.bottom, 2],
      [18 + layout.rows * 2, 2, 2],
    ]);
    /** View used to write the per-row native cell-list counts. */
    const definitionView = new DataView(definition.buffer);
    for (let row = 0; row < layout.rows; row++)
      definitionView.setUint16(18 + row * 2, layout.rowCounts[row] || 0, true);
    /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
    const result = [
      record(71, level, commonControl("tbl ", layout.width, layout.height, 2)),
      record(77, level + 1, definition),
    ];
    for (/** Current source entry in the ordered byte, style or table iteration. */
    const cell of layout.cells) {
      /** Editable paragraphs or objects belonging to the current cell or document. */
      const blocks = cell.node.content?.length
        ? cell.node.content
        : [{ type: "paragraph" }];
      /** Exact source cell properties remain independent from the destination geometry and border reference. */
      const properties=nativeCellProperties(cell.node.attrs?.nativeCellProperties),flags=hwpCellFlags(properties,cell.node.type==='tableHeader',cell.node.attrs?.nativeCellFlags??0),margins=properties.hasMargin?properties.margins:layout.margins;
      /** Modern cell-list header containing paragraph count and explicit geometry. */
      const cellHeader = join([fields(38, [
        [0, blocks.length],
        [4, flags],
        [8, cell.column, 2],
        [10, cell.row, 2],
        [12, cell.colspan, 2],
        [14, cell.rowspan, 2],
        [16, cell.width],
        [20, cell.height],
        [24, properties.margins.left, 2],
        [26, properties.margins.right, 2],
        [28, properties.margins.top, 2],
        [30, properties.margins.bottom, 2],
        [32, cell.fill, 2],
        [34, cell.width],
      ]),writeHwpCellField(cell.node.attrs?.nativeCellFieldName,cell.node.attrs?.nativeCellFieldData)]);
      result.push(record(72, level + 1, cellHeader));
      for (let index = 0; index < blocks.length; index++)
        result.push(
          ...blockRecords(
            blocks[index],
            level + 1,
            Math.max(1000, cell.width - margins.left - margins.right),
            index === blocks.length - 1,
          ),
        );
    }
    return result;
  }
  /**
   * Serialize mandatory page-section definitions.
   *
   * The page, footnote, endnote and page-border records form the complete section structure required by native Hancom readers.
   * @param {number} level Native record hierarchy level for the generated subtree.
   * @returns {Uint8Array<ArrayBufferLike>[]} Native source records or editor fixture data for the operation described above.
   * @example
   * sectionControl(1).length // 8 source records.
   */
  function sectionControl(level: number): Uint8Array[] {
    /** Section control fields identifying the first document section. */
    const section = fields(47, [
      [4,page.wonggojiFormat ? 1<<22 : 0],
      [8, 1134, 2],
      [10,hwpGridDistance(page.lineGrid),2],
      [12,hwpGridDistance(page.charGrid),2],
      [14, 8000],
    ]);
    section.set(controlId("secd"));
    /** Physical page-definition structure constructed from validated measurements. */
    const paper = fields(40, [
      [0, units(page.width, 0, "mm")],
      [4, units(page.height, 0, "mm")],
      [8, units(page.marginLeft, 0, "mm")],
      [12, units(page.marginRight, 0, "mm")],
      [16, units(page.marginTop, 0, "mm")],
      [20, units(page.marginBottom, 0, "mm")],
      [24, units((page as PageSettings & { header?: number }).header, 0, "mm")],
      [28, units((page as PageSettings & { footer?: number }).footer, 0, "mm")],
    ]);
    /** Next uncovered column in the current table row. */
    const column = fields(16, [[4, 0x1004]]);
    column.set(controlId("cold"));
    /** Default footnote/endnote shape required by native section parsing. */
    const note = fields(28, [
      [8, 41, 2],
      [10, 1, 2],
      [12, 0xffffffff],
      [16, 850, 2],
      [18, 567, 2],
      [20, 283, 2],
      [22, 1, 1],
      [23, 1, 1],
    ]);
    /** Default page-border placement required by native section parsing. */
    const border = fields(14, [
      [0, 1],
      [4, 1417, 2],
      [6, 1417, 2],
      [8, 1417, 2],
      [10, 1417, 2],
      [12, 1, 2],
    ]);
    return [
      record(71, level, section),
      record(73, level + 1, paper),
      record(74, level + 1, note),
      record(74, level + 1, note),
      record(75, level + 1, border),
      record(75, level + 1, border),
      record(75, level + 1, border),
      record(71, level, column),
    ];
  }
  /**
   * Serialize a genuine native hyperlink field header.
   *
   * The command retains an escaped URL and the native field instance ID; the
   * linked text remains ordinary editable paragraph content between anchors.
   * @param {string} href Authored hyperlink destination.
   * @param {number} level Source hierarchy level of the field control.
   * @returns {Uint8Array} Encoded HWP percent-hlk field-header record.
   * @throws {Error} If the destination protocol or command length is unsupported.
   * @example
   * hyperlinkControl("https://example.com", 1) // Native hyperlink field bytes.
   */
  function hyperlinkControl(href: string, level: number): Uint8Array {
    if (!isSafeDocumentLink(href))
      throw new Error("HWP hyperlink protocol is unsupported.");
    /** Native command text with delimiter and query characters escaped. */
    const command = href.replace(/([\\?;])/g, "\\$1") + ";1;0;0;";
    if (command.length > 65535) throw new Error("HWP hyperlink is too long.");
    /** Source field header followed by its UTF-16 command and unique instance ID. */
    const payload = fields(19 + command.length * 2, [
      [4, 0xa800],
      [9, command.length, 2],
      [11 + command.length * 2, instance++],
    ]);
    payload.set(controlId("%hlk"));
    payload.set(utf16(command), 11);
    return record(71, level, payload);
  }
  /**
   * Serialize one paragraph and its anchored objects.
   *
   * UTF-16 positions track style ranges and extended control anchors; CR-only text records are omitted for native empty-paragraph compatibility.
   * Line-layout caches are omitted so native readers recompute actual font
   * advances, bidi ordering and wrapping instead of trusting fabricated geometry.
   * @param {JSONContent} node - Editable block, cell or inline node being serialized.
   * @param {number} level - Native record hierarchy level for the generated subtree.
   * @param {{anchor:Uint8Array;controls:Uint8Array[]}|undefined} [object] - Optional anchored table or picture control subtree.
   * @param {boolean} [lastInList=false] - Whether this paragraph ends its containing native paragraph list.
   * @returns {Uint8Array<ArrayBufferLike>[]} Native source records or editor fixture data for the operation described above.
   * @throws {Error} If the source content cannot be encoded safely in the supported native record structure.
   * @example
   * paragraphRecords(paragraphNode, 0) // Source records with native-recomputed layout.
   */
  function paragraphRecords(
    node: JSONContent,
    level: number,
    object?: { anchor: Uint8Array; controls: Uint8Array[] },
    lastInList = false,
  ): Uint8Array[] {
    /** Whether this paragraph owns the first top-level section definition. */
    const first = level === 0 && !sectionWritten;
    if (first) sectionWritten = true;
    /** Ordered paragraph text and inline-control byte fragments. */
    const parts: Uint8Array[] = [];
    /** Native field controls anchored by the current paragraph's linked text. */
    const hyperlinks: Uint8Array[] = [];
    /** Destination currently open between native field begin/end anchors. */
    let activeLink = "";
    /** UTF-16 positions paired with their shared character-style IDs. */
    const ranges: [number, number][] = [];
    /** Editor heading level used to select authored visual defaults. */
    const heading =
      node.type === "heading" ? Number(node.attrs?.level || 1) : 0;
    /** Shared paragraph-layout reference used both by the body and custom heading style. */
    const paragraphReference = paragraphStyle(node);
    /** Native STYLE identifier; zero retains the ordinary Normal style. */
    let styleReference = 0;
    if (heading && !node.attrs?.hwpListType) {
      styleReference =
        headingStyles.findIndex(
          /**
           * Encode one source character-range pair.
           *
           * Range positions count UTF-16 code units and remain aligned with extended control anchors.
           * @param {{ level: number; paragraph: number; character: number; }} style Source entry supplied by the enclosing record mapping or assertion.
           * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
           * @example
           * characterRange(range, index) // A retained range or its encoded field tuples.
           */
          (style) => style.level === heading,
        ) + 1;
      if (!styleReference)
        styleReference = headingStyles.push({
          level: heading,
          paragraph: paragraphReference,
          character: characterStyle([], heading),
        });
    }
    /** Current UTF-16 source position including extended control anchors. */
    let position = 0;
    if (first) {
      parts.push(anchor(2, "secd"), anchor(2, "cold"));
      position = 16;
    }
    if (object) {
      parts.push(object.anchor);
      position += 8;
    }
    ranges.push([0, characterStyle([], heading)]);
    for (/** Current source entry in the ordered byte, style or table iteration. */
    const inline of node.content || []) {
      /** Link destination attached to this inline run, if any. */
      const href = String(
        inline.marks?.find(
          /**
           * Encode one source character-range pair.
           *
           * Range positions count UTF-16 code units and remain aligned with extended control anchors.
           * @param {{ [key: string]: any; type: string; attrs?: Record<string, any>; }} mark Source entry supplied by the enclosing record mapping or assertion.
           * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
           * @example
           * characterRange(range, index) // A retained range or its encoded field tuples.
           */
          (mark) => mark.type === "link",
        )?.attrs?.href || "",
      );
      if (href !== activeLink) {
        if (activeLink) {
          parts.push(anchor(4, "\0hlk"));
          position += 8;
        }
        if (href) {
          hyperlinks.push(hyperlinkControl(href, level + 1));
          parts.push(anchor(3, "%hlk"));
          position += 8;
        }
        activeLink = href;
      }
      if (inline.type === "hardBreak") {
        parts.push(utf16("\n"));
        position++;
        continue;
      }
      if (inline.type !== "text")
        throw new Error(`HWP cannot encode inline ${inline.type}.`);
      /** Candidate shared character or paragraph definition. */
      const style = characterStyle(inline.marks, heading);
      ranges.push([position, style]);
      /** Authored inline text encoded while retaining UTF-16 source positions. */
      const value = inline.text || "";
      for (/** Current source entry in the ordered byte, style or table iteration. */
      const character of value) {
        if (character === "\t") {
          parts.push(anchor(9, "\0\0\0\0"));
          position += 8;
        } else {
          if (character.charCodeAt(0) < 32 && character !== "\n")
            throw new Error(
              "HWP text contains an unsupported control character.",
            );
          parts.push(utf16(character));
          position += character.length;
        }
      }
    }
    if (activeLink) {
      parts.push(anchor(4, "\0hlk"));
      position += 8;
    }
    parts.push(utf16("\r"));
    position++;
    /** Character ranges after removing duplicate positions. */
    const uniqueRanges = ranges.filter(
      /**
       * Remove a style range superseded at the same source position.
       *
       * Range positions count UTF-16 code units and remain aligned with extended control anchors.
       * @param {[number, number]} range Source entry supplied by the enclosing record mapping or assertion.
       * @param {number} index Source entry supplied by the enclosing record mapping or assertion.
       * @returns {boolean} Whether the source entry satisfies the compatibility condition described above.
       * @example
       * characterRange(range, index) // A retained range or its encoded field tuples.
       */
      (range, index) =>
        index === ranges.length - 1 || ranges[index + 1][0] !== range[0],
    );
    if (uniqueRanges.length > 65535 || position > 4000000)
      throw new Error("HWP paragraph exceeds the supported size.");
    /** Encoded source offsets and shared character-style references. */
    const rangeBytes = fields(
      uniqueRanges.length * 8,
      uniqueRanges.flatMap(
        /**
         * Encode one source character-range pair.
         *
         * Range positions count UTF-16 code units and remain aligned with extended control anchors.
         * @param {[number, number]} entry Source entry supplied by the enclosing record mapping or assertion.
         * @param {number} index Source entry supplied by the enclosing record mapping or assertion.
         * @returns {[Field, Field]} Native source records or editor fixture data for the operation described above.
         * @example
         * characterRange(range, index) // A retained range or its encoded field tuples.
         */
        ([offset, style], index) => [
          [index * 8, offset] as Field,
          [index * 8 + 4, style] as Field,
        ],
      ),
    );
    /** Independently constructed source record or compound-document header. */
    const header = fields(24, [
      [0, (position | (lastInList ? 0x80000000 : 0)) >>> 0],
      [
        4,
        (first ? 4 : 0) |
          (object ? 1 << 11 : 0) |
          (hyperlinks.length ? (1 << 3) | (1 << 4) : 0),
      ],
      [8, paragraphReference, 2],
      [10, styleReference, 1],
      [
        11,
        first
          ? 3
          : node.attrs?.pageBreak || node.attrs?.pageBreakBefore
            ? 4
            : 0,
        1,
      ],
      [12, uniqueRanges.length, 2],
      [16, 0, 2],
      [18, instance++],
    ]);
    return [
      record(66, level, header),
      ...(position > 1 ? [record(67, level + 1, join(parts))] : []),
      record(68, level + 1, rangeBytes),
      ...(first ? sectionControl(level + 1) : []),
      ...(object?.controls || []),
      ...hyperlinks,
    ];
  }
  /**
   * Serialize one supported editor block.
   *
   * Paragraphs, headings, tables, pictures and explicit breaks use genuine HWP structures; unsupported changed content rejects export.
   * @param {JSONContent} node Editable block, cell or inline node being serialized.
   * @param {number} level Native record hierarchy level for the generated subtree.
   * @param {number} available Writable width available to the block in HWP units.
   * @param {boolean} lastInList Whether this paragraph ends its containing native paragraph list.
   * @param {number} listDepth Zero-based editor list nesting level used by native paragraph heads.
   * @returns {Uint8Array<ArrayBufferLike>[]} Native source records or editor fixture data for the operation described above.
   * @throws {Error} If the source content cannot be encoded safely in the supported native record structure.
   * @example
   * blockRecords(paragraphNode, 0, 42520) // Source records for the paragraph.
   */
  function blockRecords(
    node: JSONContent,
    level: number,
    available: number,
    lastInList = false,
    listDepth = 0,
  ): Uint8Array[] {
    if (node.type === "bulletList" || node.type === "orderedList") {
      if (listDepth > 6)
        throw new Error("HWP list nesting exceeds seven supported levels.");
      /** Source ordered used by the current native serialization step. */
      const ordered = node.type === "orderedList";
      /** Source start used by the current native serialization step. */
      const start = Number(node.attrs?.start || 1);
      if (!Number.isInteger(start) || start < 1 || start > 65535)
        throw new Error("HWP list start number is invalid.");
      /** Source reference used by the current native serialization step. */
      const reference = ordered ? numberingStarts.push(start) : 1;
      if (!ordered) bulletUsed = true;
      /** Source items used by the current native serialization step. */
      const items = node.content || [];
      /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
      const result: Uint8Array[] = [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        /** Source item used by the current native serialization step. */
        const item = items[itemIndex];
        if (item.type !== "listItem")
          throw new Error("HWP list contains an invalid item.");
        /** Source children used by the current native serialization step. */
        const children = item.content?.length
          ? item.content
          : [{ type: "paragraph" }];
        /** Source firstParagraph used by the current native serialization step. */
        let firstParagraph = true;
        for (let childIndex = 0; childIndex < children.length; childIndex++) {
          /** Source child used by the current native serialization step. */
          const child = children[childIndex];
          /** Source final used by the current native serialization step. */
          const final =
            lastInList &&
            itemIndex === items.length - 1 &&
            childIndex === children.length - 1;
          if (child.type === "bulletList" || child.type === "orderedList") {
            result.push(
              ...blockRecords(child, level, available, final, listDepth + 1),
            );
            continue;
          }
          if (child.type !== "paragraph" && child.type !== "heading")
            throw new Error(
              `HWP list items cannot safely encode ${child.type}.`,
            );
          /** Current paragraph or image attributes from the editor document. */
          const attrs = {
            ...child.attrs,
            marginLeft:
              child.attrs?.marginLeft || `${(listDepth + 1) * 8.466667}mm`,
            hwpListType: firstParagraph ? (ordered ? 2 : 3) : 0,
            hwpListLevel: listDepth,
            hwpListReference: firstParagraph ? reference : 0,
          };
          result.push(
            ...paragraphRecords(
              { ...child, attrs },
              level,
              undefined,
              final,
            ),
          );
          firstParagraph = false;
        }
      }
      return result;
    }
    if (node.type === "paragraph" || node.type === "heading")
      return paragraphRecords(node, level, undefined, lastInList);
    if (node.type === "table") {
      /** Validated native table layout and cell coverage. */
      const layout = tableLayout(node, available);
      return paragraphRecords(
        { type: "paragraph" },
        level,
        {
          anchor: anchor(11, "tbl "),
          controls: tableControl(layout, level + 1),
        },
        lastInList,
      );
    }
    if (node.type === "image") {
      /** Registered embedded raster image and its storage geometry. */
      const media = image(node);
      return paragraphRecords(
        { type: "paragraph" },
        level,
        {
          anchor: anchor(11, "gso "),
          controls: imageControl(media, level + 1),
        },
        lastInList,
      );
    }
    if (node.type === "pageBreak")
      return paragraphRecords(
        { type: "paragraph", attrs: { pageBreak: true } },
        level,
        undefined,
        lastInList,
      );
    throw new Error(
      `HWP export cannot safely convert ${node.type}; save a Forhan document to retain its original data.`,
    );
  }

  characterStyle();
  paragraphStyle({ type: "paragraph" });
  /** Complete uncompressed Section0 body record stream. */
  const body = join(
    (doc.content?.length ? doc.content : [{ type: "paragraph" }]).flatMap(
      /**
       * Serialize a top-level document block with its list-ending flag.
       *
       * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
       * @param {JSONContent} node Editable block, cell or inline node being serialized.
       * @param {number} index Source entry supplied by the enclosing record mapping or assertion.
       * @param {JSONContent[]} blocks Source entry supplied by the enclosing record mapping or assertion.
       * @returns {Uint8Array<ArrayBufferLike>[]} Native source records or editor fixture data for the operation described above.
       * @example
       * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
       */
      (node, index, blocks) =>
        blockRecords(node, 0, bodyWidth, index === blocks.length - 1),
    ),
  );
  /** Ordered shared DocInfo records for the independent export. */
  const info: Uint8Array[] = [];
  /** Native document section and starting-number properties. */
  const properties = fields(26, [
    [0, 1, 2],
    [2, 1, 2],
    [4, 1, 2],
    [6, 1, 2],
    [8, 1, 2],
    [10, 1, 2],
    [12, 1, 2],
  ]);
  /** DocInfo definition counts for fonts, styles, borders and binary data. */
  const mapping = fields(72, [
    [0, images.length],
    ...Array.from(
      { length: 7 },

      /**
       * Declare one script-specific font-table count.
       *
       * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
       * @param {unknown} _ Source entry supplied by the enclosing record mapping or assertion.
       * @param {number} index Source entry supplied by the enclosing record mapping or assertion.
       * @returns {Field} Native source records or editor fixture data for the operation described above.
       * @example
       * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
       */
      (_, index) => [4 + index * 4, fonts.length] as Field,
    ),
    [32, fills.length],
    [36, characters.length],
    [40, 1],
    [44, numberingStarts.length],
    [48, bulletUsed ? 1 : 0],
    [52, paragraphs.length],
    [56, headingStyles.length + 1],
  ]);
  info.push(record(16, 0, properties), record(17, 0, mapping));
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const media of images)
    info.push(
      record(
        18,
        1,
        join([
          fields(4, [
            [0, 0x21, 2],
            [2, media.id, 2],
          ]),
          hwpString(media.extension),
        ]),
      ),
    );
  for (let language = 0; language < 7; language++)
    for (/** Current source entry in the ordered byte, style or table iteration. */
    const font of fonts)
      info.push(record(19, 1, join([new Uint8Array([0]), hwpString(font)])));
  for (let index = 0; index < fills.length; index++) {
    /** Independently constructed table-border or solid-fill record. */
    const fill = fields(fills[index] >= 0 ? 53 : 40, [
      [26, 1, 1],
      ...(fills[index] >= 0
        ? ([
            [32, 1] as Field,
            [36, fills[index]],
            [40, 0],
            [44, 0xffffffff],
            [48, 0],
          ] as Field[])
        : []),
    ]);
    if (index >= 1)
      for (/** Current source entry in the ordered byte, style or table iteration. */
      const offset of [2, 8, 14, 20]) {
        fill[offset] = 1;
        fill[offset + 1] = 1;
      }
    info.push(record(20, 1, fill));
  }
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const style of characters) {
    /** Complete local input, output or independently constructed source bytes. */
    const bytes = fields(74, [
      [42, style.size],
      [46, style.flags | (NATIVE_SHADOW_TYPES.indexOf(style.shadow.type) << 11) | (style.outline << 8) | (style.emphasis << 21)],
      [50, style.shadow.x, 1],
      [51, style.shadow.y, 1],
      [52, style.color],
      [56, style.underline.nativeColor ? colour(style.underline.nativeColor) : style.color],
      [60, style.shade],
      [64, colour(style.shadow.color)],
      [68, 1, 2],
      [70, style.strike.nativeColor ? colour(style.strike.nativeColor) : 0],
    ]);
    /** Little-endian view of the binary structure being constructed. */
    const view = new DataView(bytes.buffer);
    for (let language = 0; language < 7; language++) {
      view.setUint16(language * 2, fonts.indexOf(style.fonts[language]), true);
      view.setUint8(14 + language, style.metrics.ratio[language]);
      view.setInt8(21 + language, style.metrics.spacing[language]);
      view.setUint8(28 + language, style.metrics.relativeSize[language]);
      view.setInt8(35 + language, style.metrics.offset[language]);
    }
    info.push(record(21, 1, bytes));
  }
  info.push(record(22, 1, new Uint8Array(8)));
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const start of numberingStarts) {
    /** Source levels used by the current native serialization step. */
    const levels: Uint8Array[] = [];
    for (let level = 1; level <= 7; level++)
      levels.push(
        join([
          fields(12, [
            [0, 12],
            [6, 50, 2],
            [8, 0xffffffff],
          ]),
          hwpString(`^${level}.`),
        ]),
      );
    info.push(
      record(
        23,
        1,
        join([
          ...levels,
          fields(2, [[0, start, 2]]),
          fields(
            28,
            Array.from(
              { length: 7 },
              /**
               * Collect authored text for the HWP preview stream.
               *
               * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
               * @param {unknown} _ Source entry supplied by the enclosing record mapping or assertion.
               * @param {number} index Source entry supplied by the enclosing record mapping or assertion.
               * @returns {Field} Native source records or editor fixture data for the operation described above.
               * @example
               * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
               */
              (_, index) => [index * 4, start] as Field,
            ),
          ),
        ]),
      ),
    );
  }
  if (bulletUsed)
    info.push(
      record(
        24,
        1,
        fields(25, [
          [0, 8],
          [6, 50, 2],
          [12, 0x2022, 2],
        ]),
      ),
    );
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const style of paragraphs)
    info.push(
      record(
        25,
        1,
        fields(58, [
          [
            0,
            (style.snapToGrid ? PARAGRAPH_GRID_FLAG : 0) |
              (style.condense << 9) |
              (style.breakLatinWord << 5) |
              (style.breakNonLatinWord << 7) |
              (style.align << 2) |
              style.spacingType |
              (style.headingType << 23) |
              (style.headingLevel << 25),
          ],
          [4, style.left],
          [8, style.right],
          [12, style.indent],
          [16, style.before],
          [20, style.after],
          [24, style.spacing],
          [30, style.headingReference, 2],
          [32, 1, 2],
          [42, 8],
          [46, style.spacingType],
          [50, style.spacing],
        ]),
      ),
    );
  info.push(
    record(
      26,
      1,
      join([
        hwpString("Normal"),
        hwpString("Normal"),
        fields(10, [[2, 1042, 2]]),
      ]),
    ),
  );
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const style of headingStyles)
    info.push(
      record(
        26,
        1,
        join([
          hwpString(`Forhan Heading ${style.level}`),
          hwpString(`Forhan Heading ${style.level}`),
          fields(10, [
            [2, 1042, 2],
            [4, style.paragraph, 2],
            [6, style.character, 2],
          ]),
        ]),
      ),
    );
  /** Independently constructed source record or compound-document header. */
  const header = fields(256, [
    [32, 0x05000300],
    [36, 1],
  ]);
  header.set(new TextEncoder().encode("HWP Document File"));
  /** New OLE compound document receiving the generated HWP streams. */
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "FileHeader", header);
  CFB.utils.cfb_add(
    container,
    "\u0005HwpSummaryInformation",
    summaryInformation(options.title || "Forhan document"),
  );
  CFB.utils.cfb_add(container, "DocInfo", deflateSync(join(info)));
  CFB.utils.cfb_add(container, "BodyText/Section0", deflateSync(body));
  CFB.utils.cfb_add(
    container,
    "PrvText",
    utf16(
      (doc.content || [])
        .map(
          /**
           * Collect authored text for the HWP preview stream.
           *
           * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
           * @param {JSONContent} node Editable block, cell or inline node being serialized.
           * @returns {string} Native source records or editor fixture data for the operation described above.
           * @example
           * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
           */
          (node) =>
            (node.content || [])
              .map(
                /**
                 * Collect authored text for the HWP preview stream.
                 *
                 * The generated document remains local and independently constructed, while exact original bytes are reused only for an unchanged revision.
                 * @param {JSONContent} child Source entry supplied by the enclosing record mapping or assertion.
                 * @returns {string} Native source records or editor fixture data for the operation described above.
                 * @example
                 * exportCallback(entry) // The corresponding source bytes, metadata or unchanged-value decision.
                 */
                (child) => child.text || "",
              )
              .join(""),
        )
        .join("\r\n")
        .slice(0, 4000),
    ),
  );
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const media of images)
    CFB.utils.cfb_add(
      container,
      `BinData/BIN${media.id.toString(16).toUpperCase().padStart(4, "0")}.${media.extension}`,
      media.bytes,
    );
  /** Completed genuine HWP compound-document bytes. */
  const output = new Uint8Array(CFB.write(container, { type: "array" }));
  if (output.length > MAX_OUTPUT_BYTES)
    throw new Error("Generated HWP exceeds 64MB.");
  return output;
}
