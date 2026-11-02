/** Independent HWP 5 reader, based on Hancom's published HWP 5.0 revision 1.3.
 * No Hancom runtime, fonts, DLLs or code are required.
 * https://cdn.hancom.com/link/docs/한글문서파일형식_5.0_revision1.3.pdf
 */
import CFB from "cfb";
import {readHwpTableProperties,type NativeTableProperties} from '../table-properties.ts';
import {CELL_UNITS_PER_PIXEL,nativeColumnMeasurements,nativeCellDimension,type NativeColumnMeasurement} from '../cell-geometry.ts';
import {readHwpCellField} from '../cell-field-name.ts';
import {readHwpCellProperties,type NativeCellProperties,type NativeCellMargins} from '../cell-properties.ts';
import { characterDecoration } from "../character-decorations.ts";
import { NATIVE_SHADOW_TYPES } from "../character-shadow.ts";
import { characterOutline } from "../character-outline.ts";
import { PARAGRAPH_ALIGNMENTS } from '../paragraph-alignment.ts';
import type { CFB$Container, CFB$Blob } from "cfb";
import { inflateSync } from "fflate";
import {sectionGridSettings,type SectionGridSettings} from '../section-grid.ts';
import { hasCharacterFonts } from "../character-fonts.ts";
import { isSafeDocumentLink } from "../documents.ts";
import {retainNormalCharacterWeight,nativeHyperlinkAppearance} from '../character-defaults.ts';
import {
  characterLanguage,
  characterMetrics,
  hasCharacterMetrics,
} from "../character-metrics.ts";
import {
  decodeParagraphUrc,
  paragraphMeasureCss,
} from "./paragraph-measures.ts";

/** An editor mark reconstructed from a source HWP character shape. */
export interface HwpMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Paragraph layout values use CSS units; source positions remain opaque IDs. */
export interface HwpParagraphAttributes {
  nativeSnapToGrid?: boolean;
  nativeParagraphCondense?: number;
  nativeBreakLatinWord?: number;
  nativeBreakNonLatinWord?: number;
  textAlign?: string;
  sourceId?: string;
  marginLeft?: string;
  marginRight?: string;
  marginTop?: string;
  marginBottom?: string;
  textIndent?: string;
  lineHeight?: string | null;
  pageBreak?: boolean;
  listType?: "bulletList" | "orderedList";
  listLevel?: number;
  listReference?: number;
  listStart?: number;
}

/** Raw control records retained when an object cannot yet be rendered. */
export interface HwpRawRecord {
  tag: number;
  level: number;
  base64: string;
  children: HwpRawRecord[];
}

/** Attributes understood by the editor or retained in its native document. */
export interface HwpNodeAttributes extends HwpParagraphAttributes {
  start?: number;
  level?: number;
  colspan?: number;
  rowspan?: number;
  colwidth?: number[] | null;
  backgroundColor?: string;
  nativeCellProperties?: NativeCellProperties;
  nativeCellFlags?: number;
  nativeCellMargins?: NativeCellMargins;
  nativeCellFieldName?: string | null;
  nativeCellFieldData?: string;
  nativeCellHeight?: number | null;
  nativeTableProperties?: NativeTableProperties;
  nativeTableFlags?: number;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  label?: string;
  preview?: string;
  raw?: { format: "hwp"; controlId: string; records: HwpRawRecord[] };
}

/** Tiptap-compatible document JSON produced by the independent HWP reader. */
export interface HwpDocumentNode {
  type: string;
  attrs?: HwpNodeAttributes;
  content?: HwpDocumentNode[];
  marks?: HwpMark[];
  text?: string;
}

/** Physical page measurements, in millimetres. */
export interface HwpPageSettings extends SectionGridSettings {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Additional top header area, measured in millimetres when present. */
  header?: number;
  /** Additional bottom footer area, measured in millimetres when present. */
  footer?: number;
}

/** The import result includes original bytes so source data is never discarded. */
export interface HwpImportResult {
  doc: HwpDocumentNode;
  page: HwpPageSettings;
  pages: HwpPageSettings[];
  warnings: string[];
  format: "hwp";
  original: { format: "hwp"; base64: string; doc: HwpDocumentNode };
}

/** A bounded binary record with hierarchy and its original byte offset. */
export interface HwpRecord {
  tag: number;
  level: number;
  offset: number;
  bytes: Uint8Array;
  children: HwpRecord[];
}
interface RecordContainer {
  children: HwpRecord[];
}
interface BinaryReference {
  flags: number;
  id?: number;
  ext?: string;
  linked?: boolean;
}
interface DocInfo {
  fonts: string[];
  marks: HwpMark[][];
  marksByLanguage: HwpMark[][][];
  paragraphs: HwpParagraphAttributes[];
  binary: BinaryReference[];
  borders: { backgroundColor?: string | null }[];
  headingStyles: number[];
}

/** Maximum accepted HWP file size in bytes. */
const MAX_FILE = 64 * 1024 * 1024;
/** Maximum expanded stream size in bytes. */
const MAX_STREAM = 32 * 1024 * 1024;
/** Maximum number of records in one stream. */
const MAX_RECORDS = 500000;
/** Strict UTF-16LE decoder for source text. */
const decoder = new TextDecoder("utf-16le", { fatal: true });
/** Decoder for fixed-width HWP identifiers. */
const ascii = new TextDecoder("ascii");
/** Control codes whose payload occupies eight UTF-16 units. */
const LONG_CONTROLS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
]);
/**
 * Create an empty editable paragraph.
 *
 * The placeholder gives empty documents and table cells a valid editor block.
 * @returns {HwpDocumentNode} The result consumed by the caller or enclosing collection operation.
 * @example
 * emptyParagraph().type // "paragraph"
 */
const emptyParagraph = (): HwpDocumentNode => ({ type: "paragraph" });
/**
 * Convert HWP units to millimetres.
 *
 * HWP uses 7,200 units per inch; the result retains three decimal places.
 * @param {number} value The value value supplied to this operation.
 * @returns {number} The result consumed by the caller or enclosing collection operation.
 * @example
 * mm(7200) // 25.4
 */
const mm = (value: number): number =>
  Math.round(((value * 25.4) / 7200) * 1000) / 1000;
/**
 * Convert HWP units to screen pixels.
 *
 * The conversion assumes the editor display density of 96 pixels per inch.
 * @param {number} value The value value supplied to this operation.
 * @returns {number} The result consumed by the caller or enclosing collection operation.
 * @example
 * px(7200) // 96
 */
const px = (value: number): number => Math.round(value / 75);
/**
 * Create a byte-aligned data view.
 *
 * The view preserves the offset and length of a sliced source buffer.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @returns {DataView<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * view(new Uint8Array([1, 0])).getUint16(0, true) // 1
 */
const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
/**
 * Create a recognisable import error.
 *
 * Every reader error carries the HWP prefix so callers can identify its source.
 * @param {string} message The message value supplied to this operation.
 * @returns {Error} The result consumed by the caller or enclosing collection operation.
 * @example
 * error("Invalid record").message // "HWP: Invalid record"
 */
const error = (message: string): Error => new Error(`HWP: ${message}`);
/**
 * Normalise an OLE byte collection.
 *
 * Typed arrays retain their existing storage; ordinary number arrays become byte arrays.
 * @param {CFB.CFB$Blob} bytes The bytes value supplied to this operation.
 * @returns {Uint8Array<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @example
 * toBytes([1, 2])[1] // 2
 */
const toBytes = (bytes: CFB$Blob): Uint8Array =>
  bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

/**
 * Encode binary data as base64.
 *
 * Chunking avoids exceeding the argument limit while retaining every source byte.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @returns {string} The result consumed by the caller or enclosing collection operation.
 * @example
 * base64(new Uint8Array([65])) // "QQ=="
 */
function base64(bytes: Uint8Array): string {
  /** Constructed bytes, editor nodes or parsed result for the current serialization step. */
  let result = "";
  for (let p = 0; p < bytes.length; p += 8192)
    result += String.fromCharCode(...bytes.subarray(p, p + 8192));
  return btoa(result);
}
/**
 * Validate a minimum record length.
 *
 * The guard rejects truncated binary fields before any indexed read occurs.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @param {number} size The size value supplied to this operation.
 * @param {string} what The what value supplied to this operation.
 * @returns {void} Completes the operation without returning a value.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * requireLength(new Uint8Array(4), 4, "header") // Returns normally.
 */
function requireLength(bytes: Uint8Array, size: number, what: string): void {
  if (bytes.length < size) throw error(`${what} 데이터가 잘렸습니다.`);
}
/**
 * Decode an exact UTF-16LE range.
 *
 * The range is measured in code units and rejects invalid surrogate sequences.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @param {number} start The start value supplied to this operation.
 * @param {number} count The count value supplied to this operation.
 * @returns {string} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * utf16(new Uint8Array([65, 0]), 0, 1) // "A"
 */
function utf16(bytes: Uint8Array, start: number, count: number): string {
  if (start + count * 2 > bytes.length)
    throw error("문자열 길이가 데이터 범위를 벗어납니다.");
  try {
    return decoder.decode(bytes.subarray(start, start + count * 2));
  } catch {
    throw error("잘못된 UTF-16 문자열입니다.");
  }
}
/**
 * Expand a bounded HWP stream.
 *
 * Compressed streams use raw DEFLATE with a fixed destination limit; plain streams pass through.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @param {boolean} compressed The compressed value supplied to this operation.
 * @returns {Uint8Array<ArrayBufferLike>} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * expand(new Uint8Array([1, 2]), false).length // 2
 */
function expand(bytes: Uint8Array, compressed: boolean): Uint8Array {
  if (bytes.length > MAX_STREAM)
    throw error("스트림 크기가 제한을 초과했습니다.");
  if (!compressed) return bytes;
  try {
    /** Accumulated result for the current parsing operation. */
    const result = inflateSync(bytes, { out: new Uint8Array(MAX_STREAM + 1) });
    if (result.length > MAX_STREAM)
      throw error("압축 해제 크기가 제한을 초과했습니다.");
    return result.slice();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("HWP:")) throw e;
    throw error("압축된 스트림을 해제할 수 없습니다.");
  }
}

/**
 * Parse length-delimited HWP records.
 *
 * The reader validates ordinary and extended headers, record counts and nesting before returning complete records.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @returns {HwpRecord[]} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * parseHwpRecords(new Uint8Array()).length // 0
 */
export function parseHwpRecords(bytes: Uint8Array): HwpRecord[] {
  /** Validated records in source order. */
  const records: HwpRecord[] = [];
  /** Little-endian view of the current binary structure. */
  const d = view(bytes);
  /** Source p used by the current native serialization step. */
  let p = 0;
  while (p < bytes.length) {
    if (records.length >= MAX_RECORDS)
      throw error("레코드 개수가 제한을 초과했습니다.");
    if (p + 4 > bytes.length) throw error("레코드 헤더가 잘렸습니다.");
    /** Byte offset of the current source field. */
    const offset = p;
    /** Header bytes or header word for the current structure. */
    const header = d.getUint32(p, true);
    p += 4;
    /** Numeric identifier of the current record type. */
    const tag = header & 1023;
    /** Source hierarchy depth of the current record. */
    const level = (header >>> 10) & 1023;
    /** Current encoded structure or image-segment byte length. */
    let length = header >>> 20;
    if (length === 4095) {
      if (p + 4 > bytes.length) throw error("확장 레코드 길이가 잘렸습니다.");
      length = d.getUint32(p, true);
      p += 4;
    }
    if (p + length > bytes.length)
      throw error("레코드 데이터 길이가 스트림을 벗어납니다.");
    if (level > 128)
      throw error("문서 구조의 중첩 깊이가 제한을 초과했습니다.");
    records.push({
      tag,
      level,
      offset,
      bytes: bytes.subarray(p, p + length),
      children: [],
    });
    p += length;
  }
  return records;
}
/**
 * Reconstruct the HWP record hierarchy.
 *
 * The hierarchy includes sequential cell paragraph lists observed in Hancom-generated documents.
 * @param {HwpRecord[]} records The records value supplied to this operation.
 * @returns {RecordContainer} The result consumed by the caller or enclosing collection operation.
 * @example
 * tree([]).children.length // 0
 */
function tree(records: HwpRecord[]): RecordContainer {
  /** Synthetic root that owns top-level source records. */
  const root: RecordContainer & { level: number } = { level: -1, children: [] };
  /** Ancestor stack for rebuilding the source hierarchy. */
  const stack: (RecordContainer & { level: number })[] = [root];
  for (/** Current record binding supplied by the enclosing source iteration. */
  const record of records) {
    while (stack[stack.length - 1].level >= record.level) stack.pop();
    stack[stack.length - 1].children.push(record);
    stack.push(record);
  }
  // HWP lists are sequential containers: their paragraphs can be at the *same*
  // level as LIST_HEADER (observed in Hancom 2024), rather than children.
  /**
   * Group sequential cell paragraphs.
   *
   * Some HWP writers place list paragraphs beside their headers; this pass restores container ownership.
   * @param {RecordContainer} node The node value supplied to this operation.
   * @returns {void} Completes the operation without returning a value.
   * @example
   * groupLists({ children: [] }) // Leaves an empty list unchanged.
   */
  function groupLists(node: RecordContainer): void {
    /** Child records after sequential paragraph-list ownership is restored. */
    const grouped: HwpRecord[] = [];
    for (let i = 0; i < node.children.length; i++) {
      /** Current child record from the source hierarchy. */
      const child = node.children[i];
      if (child.tag === 72) {
        while (
          node.children[i + 1]?.tag === 66 &&
          node.children[i + 1].level === child.level
        )
          child.children.push(node.children[++i]);
      }
      groupLists(child);
      grouped.push(child);
    }
    node.children = grouped;
  }
  groupLists(root);
  return root;
}
/**
 * Collect records with a selected tag.
 *
 * The traversal preserves source order while searching every descendant of one control.
 * @param {HwpRecord} node The node value supplied to this operation.
 * @param {number} tag The tag value supplied to this operation.
 * @returns {HwpRecord[]} The result consumed by the caller or enclosing collection operation.
 * @example
 * all(recordWithoutMatches, 85).length // 0
 */
function all(node: HwpRecord, tag: number): HwpRecord[] {
  /** Accumulated result for the current parsing operation. */
  const result: HwpRecord[] = [];
  /**
   * Traverse the current control records.
   *
   * The recursive walk collects only records belonging to the current parsing operation.
   * @param {HwpRecord} n The n value supplied to this operation.
   * @returns {void} Completes the operation without returning a value.
   * @example
   * visit(controlRecord) // Collects matching descendants in source order.
   */
  function visit(n: HwpRecord): void {
    if (n.tag === tag) result.push(n);
    for (/** Current c binding supplied by the enclosing source iteration. */
    const c of n.children || [])
      visit(c);
  }
  visit(node);
  return result;
}
/**
 * Read a CSS colour from HWP bytes.
 *
 * The three stored colour channels become a six-digit hexadecimal CSS value.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @param {number} offset The offset value supplied to this operation.
 * @returns {string} The result consumed by the caller or enclosing collection operation.
 * @example
 * color(new Uint8Array([255, 0, 0]), 0) // "#ff0000"
 */
function color(bytes: Uint8Array, offset: number): string {
  return (
    "#" +
    [bytes[offset], bytes[offset + 1], bytes[offset + 2]]
      .map(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {number} n The n value supplied to this operation.
         * @returns {string} The result consumed by the caller or enclosing collection operation.
         * @example
         * n.toString(16).padStart(2, '0') // Produces the result consumed by the enclosing operation.
         */
        (n) => n.toString(16).padStart(2, "0"),
      )
      .join("")
  );
}
/**
 * Reconstruct character formatting marks.
 *
 * Font references resolve within each script-specific font table, alongside size, colour and emphasis.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @param {string[]} fonts The fonts value supplied to this operation.
 * @param {number} language The language value supplied to this operation.
 * @param {number[]} [fontOffsets=[0]] - Start offsets of all native font tables.
 * @returns {HwpMark[]} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * charMarks(shapeBytes, ["Example Font"])[0].type // A supported editor mark.
 */
function charMarks(
  bytes: Uint8Array,
  fonts: string[],
  language = 0,
  fontOffsets: number[] = [0],
): HwpMark[] {
  requireLength(bytes, 56, "글자 모양");
  /** Source values for d, flags used by the current binary parsing operation. */
  const d = view(bytes),
    flags = d.getUint32(46, true);
  /** Accumulated result for the current parsing operation. */
  const result: HwpMark[] = [];
  if (flags & 1) result.push({ type: "italic" });
  if (flags & 2) result.push({ type: "bold" });
  if ((flags >>> 2) & 3) result.push({ type: "underline", attrs: {...characterDecoration({nativePosition: ["BOTTOM","BOTTOM","CENTER","TOP"][(flags >>> 2) & 3],nativePattern:(flags >>> 4) & 15,nativeColor:color(bytes,bytes.length >= 60 ? 56 : 52)},"underline")} });
  if ((flags >>> 18) & 7) result.push({ type: "strike", attrs: {...characterDecoration({nativePattern:(flags >>> 26) & 15,nativeColor:color(bytes,bytes.length >= 74 ? 70 : 52)},"strike"),nativeStrikeType:(flags >>> 18) & 7} });
  if (flags & (1 << 15)) result.push({ type: "superscript" });
  if (flags & (1 << 16)) result.push({ type: "subscript" });
  /** Editor attributes reconstructed from the source properties. */
  const attrs: Record<string, unknown> = {
    fontSize: `${Math.max(0, d.getInt32(42, true) / 100)}pt`,
    color: color(bytes, 52),
    nativeUseFontSpace: !!(flags & (1 << 25)),
    nativeUseKerning: !!(flags & (1 << 30)),
    nativeOutlineType: characterOutline((flags >>> 8) & 7),
    nativeEmphasisType: (flags >>> 21) & 15,
    nativeShadowType: NATIVE_SHADOW_TYPES[(flags >>> 11) & 3] ?? "RESERVED",
    nativeShadowOffsetX: d.getInt8(50),
    nativeShadowOffsetY: d.getInt8(51),
    nativeShadowColor: bytes.length >= 68 ? color(bytes, 64) : "#c0c0c0",
  };
  if (bytes.length >= 64 && d.getUint32(60, true) !== 0xffffffff)
    attrs.backgroundColor = color(bytes, 60);
  /** Seven native language arrays retain signed spacing and baseline offsets. */
  const metrics = characterMetrics(null);
  for (let slot = 0; slot < 7; slot++) {
    metrics.ratio[slot] = d.getUint8(14 + slot);
    metrics.spacing[slot] = d.getInt8(21 + slot);
    metrics.relativeSize[slot] = d.getUint8(28 + slot);
    metrics.offset[slot] = d.getInt8(35 + slot);
  }
  if (hasCharacterMetrics(metrics)) {
    attrs.nativeCharacterMetrics = metrics;
    attrs.nativeCharacterLanguage = language;
  }
  /** Font name selected by the source font reference. */
  const font = fonts[(fontOffsets[language] || 0) + d.getUint16(language * 2, true)];
  if (font) attrs.fontFamily = font;
  /** All native face references survive unrelated edits, including currently unused scripts. */
  const faces: string[] = [];
  for (let slot = 0; slot < 7; slot++)
    faces.push(fonts[(fontOffsets[slot] || 0) + d.getUint16(slot * 2, true)] || "");
  if (hasCharacterFonts(faces)) {
    attrs.nativeCharacterFonts = faces;
    attrs.nativeCharacterLanguage = language;
  }
  result.push({ type: "textStyle", attrs });
  return result;
}
/**
 * Reconstruct paragraph layout attributes.
 *
 * Stored alignment, spacing, indentation and page-break values use editor-compatible CSS units.
 * @param {Uint8Array<ArrayBufferLike>} bytes The bytes value supplied to this operation.
 * @returns {HwpParagraphAttributes} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * paragraphAttrs(shapeBytes).textAlign // A CSS alignment value.
 */
function paragraphAttrs(bytes: Uint8Array): HwpParagraphAttributes {
  requireLength(bytes, 28, "문단 모양");
  /** Source values for d, flags used by the current binary parsing operation. */
  const d = view(bytes),
    flags = d.getUint32(0, true);
  /** Public paragraph-head mode selecting native numbering or bullets. */
  const headingType = (flags >>> 23) & 3;
  if (headingType === 2 || headingType === 3)
    requireLength(bytes, 32, "문단 목록 정보");
  /** Modern paragraph shapes store their current line mode and URC after legacy fields. */
  const spacingType =
    bytes.length >= 54 ? d.getUint32(46, true) & 31 : flags & 3;
  /** Proportional percentages are unencoded; fixed distances retain their unit bit. */
  const spacing = d.getInt32(bytes.length >= 54 ? 50 : 24, true);
  return {
    nativeParagraphCondense:(flags >>> 9)&127,
    nativeSnapToGrid:!!(flags & 0x100),
    nativeBreakLatinWord:(flags >>> 5)&3,
    nativeBreakNonLatinWord:(flags >>> 7)&1,
    textAlign:
      PARAGRAPH_ALIGNMENTS[
        (flags >>> 2) & 7
      ] || "left",
    // Extra attributes can be retained by hosts which implement paragraph layout.
    marginLeft: paragraphMeasureCss(decodeParagraphUrc(d.getInt32(4, true))),
    marginRight: paragraphMeasureCss(decodeParagraphUrc(d.getInt32(8, true))),
    textIndent: paragraphMeasureCss(decodeParagraphUrc(d.getInt32(12, true))),
    marginTop: paragraphMeasureCss(decodeParagraphUrc(d.getInt32(16, true))),
    marginBottom: paragraphMeasureCss(decodeParagraphUrc(d.getInt32(20, true))),
    lineHeight:
      spacingType === 0 && spacing >= 0
        ? `${spacing}%`
        : spacingType === 1 && spacing >= 0
          ? paragraphMeasureCss(decodeParagraphUrc(spacing), "pt")
          : null,
    pageBreak: Boolean(flags & (1 << 19)),
    ...(headingType === 2 || headingType === 3
      ? {
          listType:
            headingType === 2
              ? ("orderedList" as const)
              : ("bulletList" as const),
          listLevel: (flags >>> 25) & 7,
          listReference: d.getUint16(30, true),
        }
      : {}),
  };
}
/**
 * Read shared document definitions.
 *
 * Fonts, character shapes, paragraph shapes and binary references are indexed for subsequent body parsing.
 * @param {HwpRecord[]} records The records value supplied to this operation.
 * @returns {DocInfo} The result consumed by the caller or enclosing collection operation.
 * @example
 * readDocInfo([]).fonts.length // 0
 */
function readDocInfo(records: HwpRecord[]): DocInfo {
  /** Font names in the source definition order. */
  const fonts = records
    .filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 19 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 19,
    )
    .map(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {string} The result consumed by the caller or enclosing collection operation.
       * @example
       * { requireLength(r.bytes, 3, '글꼴'); return utf16(r.bytes, 3, view(r.bytes).getUint16(1, true)); } // Produces the result consumed by the enclosing operation.
       */
      (r) => {
        requireLength(r.bytes, 3, "글꼴");
        return utf16(r.bytes, 3, view(r.bytes).getUint16(1, true));
      },
    );
  /** Language font-count mapping from DocInfo. */
  const mapping = records.find(
    /**
     * Evaluate the current parsing callback.
     *
     * This callback supplies the enclosing collection operation with its record-specific result.
     * @param {HwpRecord} r The r value supplied to this operation.
     * @returns {boolean} The result consumed by the caller or enclosing collection operation.
     * @example
     * r.tag === 17 // Produces the result consumed by the enclosing operation.
     */
    (r) => r.tag === 17,
  )?.bytes;
  /** Start offsets of the seven script-specific font tables. */
  const offsets = [0];
  for (let language = 1; language < 7; language++)
    offsets.push(
      offsets[offsets.length - 1] +
        (mapping && mapping.length >= 4 + language * 4
          ? view(mapping).getUint32(language * 4, true)
          : 0),
    );
  /** Shared source character-shape records. */
  const charShapes = records.filter(
    /**
     * Evaluate the current parsing callback.
     *
     * This callback supplies the enclosing collection operation with its record-specific result.
     * @param {HwpRecord} r The r value supplied to this operation.
     * @returns {boolean} The result consumed by the caller or enclosing collection operation.
     * @example
     * r.tag === 21 // Produces the result consumed by the enclosing operation.
     */
    (r) => r.tag === 21,
  );
  /** Character marks resolved separately for each script. */
  const marksByLanguage = Array.from(
    { length: 7 },
    /**
     * Evaluate the current parsing callback.
     *
     * This callback supplies the enclosing collection operation with its record-specific result.
     * @param {unknown} _ The index value supplied to this operation.
     * @param {number} language The language value supplied to this operation.
     * @returns {HwpMark[][]} The result consumed by the caller or enclosing collection operation.
     * @example
     * charShapes.map(r => charMarks(r.bytes, fonts, language, offsets[language])) // Produces the result consumed by the enclosing operation.
     */
    (_, language) =>
      charShapes.map(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {HwpRecord} r The r value supplied to this operation.
         * @returns {HwpMark[]} The result consumed by the caller or enclosing collection operation.
         * @example
         * charMarks(r.bytes, fonts, language, offsets[language]) // Produces the result consumed by the enclosing operation.
         */
        (r) => charMarks(r.bytes, fonts, language, offsets),
      ),
  );
  /** Editor marks active for the current source character. */
  const marks = marksByLanguage[0];
  /** Shared paragraph layout definitions. */
  const paragraphs = records
    .filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 25 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 25,
    )
    .map(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {HwpParagraphAttributes} The result consumed by the caller or enclosing collection operation.
       * @example
       * paragraphAttrs(r.bytes) // Produces the result consumed by the enclosing operation.
       */
      (r) => paragraphAttrs(r.bytes),
    );
  /** Starting values from the native seven-level numbering definitions. */
  const numberingStarts: number[] = [];
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const record of records) {
    if (record.tag !== 23) continue;
    /** Current offset past the variable-length numbering format strings. */
    let offset = 0;
    for (let level = 0; level < 7; level++) {
      requireLength(record.bytes, offset + 14, "번호 문단");
      offset += 14 + view(record.bytes).getUint16(offset + 12, true) * 2;
    }
    requireLength(record.bytes, offset + 2, "번호 시작 값");
    /** Per-level start overrides take precedence in modern HWP documents. */
    const start =
      record.bytes.length >= offset + 30
        ? view(record.bytes).getUint32(offset + 2, true)
        : view(record.bytes).getUint16(offset, true);
    numberingStarts.push(Math.max(1, start));
  }
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const attrs of paragraphs)
    if (attrs.listType === "orderedList")
      attrs.listStart = numberingStarts[(attrs.listReference || 1) - 1] || 1;
  /** Indexed references to embedded or linked binary data. */
  const binary = records
    .filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 18 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 18,
    )
    .map(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {BinaryReference} The result consumed by the caller or enclosing collection operation.
       * @example
       * { requireLength(r.bytes, 2, '바이너리 정보'); const d = view(r.bytes), flags = d.getUint16(0, true), type  // Produces the result consumed by the enclosing operation.
       */
      (r): BinaryReference => {
        requireLength(r.bytes, 2, "바이너리 정보");
        /** Source values for d, flags, type used by the current binary parsing operation. */
        const d = view(r.bytes),
          flags = d.getUint16(0, true),
          type = flags & 15;
        if (type === 0) return { flags, linked: true };
        requireLength(r.bytes, 4, "바이너리 정보");
        /** Source ext used by the current native serialization step. */
        let ext = "";
        if (type === 1) {
          requireLength(r.bytes, 6, "바이너리 확장자");
          ext = utf16(r.bytes, 6, d.getUint16(4, true));
        }
        return { flags, id: d.getUint16(2, true), ext: ext.toLowerCase() };
      },
    );
  /** Shared border and background definitions. */
  const borders = records
    .filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 20 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 20,
    )
    .map(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {{ backgroundColor?: undefined; } | { backgroundColor: string | null; }} The result consumed by the caller or enclosing collection operation.
       * @example
       * { if (r.bytes.length < 40) return {}; const d = view(r.bytes); return { backgroundColor: (d.getUint3 // Produces the result consumed by the enclosing operation.
       */
      (r) => {
        if (r.bytes.length < 40) return {};
        /** Little-endian view of the current binary structure. */
        const d = view(r.bytes);
        return {
          backgroundColor:
            d.getUint32(32, true) & 1 && d.getUint32(36, true) !== 0xffffffff
              ? color(r.bytes, 36)
              : null,
        };
      },
    );
  /** Heading levels retained by genuine named paragraph-style definitions. */
  const headingStyles: number[] = [];
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const record of records) {
    if (record.tag !== 26) continue;
    requireLength(record.bytes, 2, "문단 스타일");
    /** Offset of the English style name following its localised name. */
    const offset = 2 + view(record.bytes).getUint16(0, true) * 2;
    requireLength(record.bytes, offset + 2, "영문 문단 스타일");
    /** Authored style name retains heading semantics without forced numbering. */
    const name = utf16(
      record.bytes,
      offset + 2,
      view(record.bytes).getUint16(offset, true),
    );
    /** Only explicit standard or Forhan heading-style names imply a heading level. */
    const match = /^(?:Forhan Heading|Heading)\s*([1-6])$/i.exec(name);
    headingStyles.push(match ? Number(match[1]) : 0);
  }
  return {
    fonts,
    marks,
    marksByLanguage,
    paragraphs,
    binary,
    borders,
    headingStyles,
  };
}
/**
 * Decode a four-character control identifier.
 *
 * HWP stores identifier bytes in reverse character order inside the control header.
 * @param {HwpRecord} record The record value supplied to this operation.
 * @returns {string} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * controlId(tableRecord) // "tbl "
 */
function controlId(record: HwpRecord): string {
  requireLength(record.bytes, 4, "컨트롤");
  return ascii.decode(record.bytes.subarray(0, 4)).split("").reverse().join("");
}
/**
 * Archive a complete control record.
 *
 * Binary payloads become base64 while the original child hierarchy remains intact.
 * @param {HwpRecord} record The record value supplied to this operation.
 * @returns {HwpRawRecord} The result consumed by the caller or enclosing collection operation.
 * @example
 * rawRecord(record).tag === record.tag // true
 */
function rawRecord(record: HwpRecord): HwpRawRecord {
  return {
    tag: record.tag,
    level: record.level,
    base64: base64(record.bytes),
    children: record.children.map(rawRecord),
  };
}

/**
 * Decode a native hyperlink field's escaped URL command.
 *
 * The URL ends at the first unescaped command separator. Other field options
 * remain in the retained source, while supported protocols become editor marks.
 * @param {HwpRecord} record Native percent-hlk field header.
 * @returns {string | null} Supported URL destination, or null for a different field protocol.
 * @throws {Error} If the native hyperlink command is truncated.
 * @example
 * hyperlinkDestination(fieldRecord) // "https://example.com/forhan?x=1&y=2"
 */
function hyperlinkDestination(record: HwpRecord): string | null {
  requireLength(record.bytes, 11, "하이퍼링크 필드");
  /** Native command contains a length-prefixed UTF-16 URL and field options. */
  const command = utf16(
    record.bytes,
    11,
    view(record.bytes).getUint16(9, true),
  );
  /** Decoded destination assembled before the first unescaped separator. */
  let destination = "",
    escaped = false;
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const character of command) {
    if (escaped) {
      destination += character;
      escaped = false;
    } else if (character === "\\") escaped = true;
    else if (character === ";") break;
    else destination += character;
  }
  return isSafeDocumentLink(destination) ? destination : null;
}

/**
 * Reconstruct native paragraph heads as editable editor lists.
 *
 * Consecutive numbering or bullet references form list containers. Source
 * levels nest beneath the preceding item, while aligned continuation
 * paragraphs remain inside that item without gaining another list marker.
 * @param {HwpDocumentNode[]} blocks Imported blocks carrying native list metadata.
 * @returns {HwpDocumentNode[]} Blocks containing explicit bulletList and orderedList nodes.
 * @example
 * groupListBlocks(nativeListParagraphs)[0].type // "bulletList" or "orderedList"
 */
function groupListBlocks(blocks: HwpDocumentNode[]): HwpDocumentNode[] {
  /** Completed blocks at the current document or table-cell level. */
  const result: HwpDocumentNode[] = [];
  /** Active native list containers and the last item available for nesting. */
  const stack: {
    type: string;
    level: number;
    reference: number;
    indent: number;
    list: HwpDocumentNode;
    item: HwpDocumentNode;
  }[] = [];
  for (/** Current source entry in the ordered byte, style or table iteration. */
  const original of blocks) {
    /** Child blocks grouped recursively without mutating the imported source snapshot. */
    const node: HwpDocumentNode = original.content
      ? { ...original, content: groupListBlocks(original.content) }
      : { ...original };
    /** Native list head attributes associated with this paragraph. */
    const attrs = node.attrs || {};
    if (node.type === "paragraph" && attrs.listType) {
      /** Requested nesting level and native numbering-definition reference. */
      const level = attrs.listLevel || 0,
        reference = attrs.listReference || 1;
      while (
        stack.length &&
        (stack[stack.length - 1].level > level ||
          (stack[stack.length - 1].level === level &&
            (stack[stack.length - 1].type !== attrs.listType ||
              stack[stack.length - 1].reference !== reference)))
      )
        stack.pop();
      if (!stack.length || stack[stack.length - 1].level !== level) {
        /** Editor list container corresponding to this native list sequence. */
        const list: HwpDocumentNode = {
          type: attrs.listType,
          ...(attrs.listType === "orderedList"
            ? { attrs: { start: attrs.listStart || 1 } }
            : {}),
          content: [],
        };
        if (stack.length) {
          stack[stack.length - 1].item.content ||= [];
          stack[stack.length - 1].item.content!.push(list);
        } else result.push(list);
        stack.push({
          type: attrs.listType,
          level,
          reference,
          indent: parseFloat(attrs.marginLeft || "0"),
          list,
          item: { type: "listItem", content: [] },
        });
      }
      /** Paragraph attributes after removing import-only list metadata. */
      const clean = { ...attrs };
      delete clean.listType;
      delete clean.listLevel;
      delete clean.listReference;
      delete clean.listStart;
      node.attrs = clean;
      /** List item retaining the source paragraph's formatting and text. */
      const item: HwpDocumentNode = { type: "listItem", content: [node] };
      stack[stack.length - 1].list.content!.push(item);
      stack[stack.length - 1].item = item;
      continue;
    }
    /** Last native list item, if the next aligned paragraph continues it. */
    const current = stack[stack.length - 1];
    if (
      current &&
      node.type === "paragraph" &&
      current.indent > 0 &&
      parseFloat(attrs.marginLeft || "0") >= current.indent - 0.01
    )
      current.item.content!.push(node);
    else {
      stack.length = 0;
      result.push(node);
    }
  }
  return result;
}

/**
 * Import an editable HWP 5 document.
 *
 * The independent reader reconstructs supported content and archives original bytes and unrendered controls without requiring Hancom.
 * @param {ArrayBuffer | Uint8Array<ArrayBufferLike>} input The input value supplied to this operation.
 * @returns {HwpImportResult} The result consumed by the caller or enclosing collection operation.
 * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
 * @example
 * readHwp(validHwpBytes).format // "hwp"
 */
export function readHwp(input: Uint8Array | ArrayBuffer): HwpImportResult {
  /** Byte array used by the current operation. */
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_FILE)
    throw error("64MB보다 큰 문서는 열 수 없습니다.");
  if (
    bytes.length < 512 ||
    ![208, 207, 17, 224, 161, 177, 26, 225].every(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {number} v The v value supplied to this operation.
       * @param {number} i The i value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * bytes[i] === v // Produces the result consumed by the enclosing operation.
       */
      (v, i) => bytes[i] === v,
    )
  ) {
    throw error("HWP 5 OLE 문서가 아닙니다. HWPX는 HWPX 열기를 사용하세요.");
  }
  /** Source cfb used by the current native serialization step. */
  let cfb: CFB$Container;
  try {
    cfb = CFB.read(bytes, { type: "array" });
  } catch {
    throw error("OLE 컨테이너가 손상되었습니다.");
  }
  /**
   * Find one named OLE stream.
   *
   * The lookup accepts the container root prefix and normalises Windows path separators.
   * @param {string} name The name value supplied to this operation.
   * @returns {{ content: Uint8Array; } | null} The result consumed by the caller or enclosing collection operation.
   * @example
   * find("FileHeader")?.content.length // 256 for a valid HWP header.
   */
  const find = (name: string): { content: Uint8Array } | null => {
    /** The i value used by the current fixture or parsing operation. */
    const i = cfb.FullPaths.findIndex(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {string} p The p value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * p.replaceAll('\\', '/').endsWith(`/${name}`) // Produces the result consumed by the enclosing operation.
       */
      (p) => p.replaceAll("\\", "/").endsWith(`/${name}`),
    );
    return i >= 0 ? { content: toBytes(cfb.FileIndex[i].content) } : null;
  };
  /** Header bytes or header word for the current structure. */
  const header = find("FileHeader")?.content;
  if (!header) throw error("FileHeader가 없습니다.");
  requireLength(header, 256, "파일 헤더");
  if (ascii.decode(header.subarray(0, 17)) !== "HWP Document File")
    throw error("HWP 서명이 올바르지 않습니다.");
  if (header[35] !== 5) throw error("HWP 5 문서만 지원합니다.");
  /** Source flags controlling document or object behaviour. */
  const flags = view(header).getUint32(36, true);
  if (flags & 2)
    throw error("암호화된 문서입니다. 암호를 해제한 문서가 필요합니다.");
  if (flags & 4)
    throw error("배포용 문서는 편집할 수 없습니다. 일반 문서가 필요합니다.");
  if (flags & ((1 << 4) | (1 << 8) | (1 << 10) | (1 << 13)))
    throw error("보안 설정된 문서는 열 수 없습니다.");
  /** Whether streams inherit raw-DEFLATE compression. */
  const compressed = Boolean(flags & 1);
  /** Shared document-definition stream. */
  const docInfo = find("DocInfo");
  if (!docInfo?.content) throw error("DocInfo가 없습니다.");
  /** Parsed shared definitions used while reading body content. */
  const info = readDocInfo(
    parseHwpRecords(expand(docInfo.content, compressed)),
  );
  /** Body streams ordered by their numeric section index. */
  const sections = cfb.FullPaths.map(
    /**
     * Evaluate the current parsing callback.
     *
     * This callback supplies the enclosing collection operation with its record-specific result.
     * @param {string} path The path value supplied to this operation.
     * @param {number} i The i value supplied to this operation.
     * @returns {{ path: string; entry: CFB.CFB$Entry; index: number; }} The result consumed by the caller or enclosing collection operation.
     * @example
     * ({ path, entry: cfb.FileIndex[i], index: Number(path.match(/\/BodyText\/Section(\d+)$/)?.[1]) }) // Produces the result consumed by the enclosing operation.
     */
    (path, i) => ({
      path,
      entry: cfb.FileIndex[i],
      index: Number(path.match(/\/BodyText\/Section(\d+)$/)?.[1]),
    }),
  )
    .filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {{ path: string; entry: CFB.CFB$Entry; index: number; }} s The s value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * Number.isInteger(s.index) // Produces the result consumed by the enclosing operation.
       */
      (s) => Number.isInteger(s.index),
    )
    .sort(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {{ path: string; entry: CFB.CFB$Entry; index: number; }} a The a value supplied to this operation.
       * @param {{ path: string; entry: CFB.CFB$Entry; index: number; }} b The b value supplied to this operation.
       * @returns {number} The result consumed by the caller or enclosing collection operation.
       * @example
       * a.index - b.index // Produces the result consumed by the enclosing operation.
       */
      (a, b) => a.index - b.index,
    );
  if (!sections.length) throw error("본문 구역이 없습니다.");
  if (sections.length > 256) throw error("구역 개수가 제한을 초과했습니다.");
  /** Distinct messages for controls retained without editable rendering. */
  const warnings = new Set<string>();
  /** Physical layout of the first document section. */
  const page: HwpPageSettings = {
    width: 210,
    height: 297,
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 25,
  };
  /** Physical layouts retained for all document sections. */
  const pages: HwpPageSettings[] = [];
  /** Source sequence used by the current native serialization step. */
  let sequence = 0;
  /** Decoded images cached by their source binary reference. */
  const imageCache = new Map<number, HwpDocumentNode>();

  /**
   * Retain an unrendered HWP control.
   *
   * A readable editor placeholder keeps the complete binary control tree available in the native document.
   * @param {HwpRecord} control The control value supplied to this operation.
   * @param {string} label The label value supplied to this operation.
   * @param {string} preview The preview value supplied to this operation.
   * @returns {HwpDocumentNode} The result consumed by the caller or enclosing collection operation.
   * @example
   * preserve(control, "Equation").type // "preservedBlock"
   */
  function preserve(
    control: HwpRecord,
    label: string,
    preview = "",
  ): HwpDocumentNode {
    warnings.add(
      `${label}: 원본 HWP 데이터와 내용이 보존됩니다. HWPX 변환 시 해당 개체의 변환 지원을 확인하세요.`,
    );
    return {
      type: "preservedBlock",
      attrs: {
        label,
        preview,
        sourceId: `hwp-control-${sequence++}`,
        raw: {
          format: "hwp",
          controlId: controlId(control),
          records: [rawRecord(control)],
        },
      },
    };
  }
  /**
   * Import an embedded raster image.
   *
   * Binary references determine the source stream and compression; unsupported images retain their original control.
   * @param {HwpRecord} control The control value supplied to this operation.
   * @returns {HwpDocumentNode | null} The result consumed by the caller or enclosing collection operation.
   * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
   * @example
   * image(pictureControl)?.type // "image" for a supported embedded PNG.
   */
  function image(control: HwpRecord): HwpDocumentNode | null {
    /** Picture payload record inside the current control. */
    const picture = all(control, 85)[0];
    if (!picture) return null;
    requireLength(picture.bytes, 73, "그림");
    /** One-based index of the referenced binary definition. */
    const reference = view(picture.bytes).getUint16(71, true);
    /** Definition of the referenced embedded or linked binary. */
    const bin = info.binary[reference - 1];
    if (!bin || bin.linked || bin.id === undefined)
      return preserve(
        control,
        "연결 그림",
        "외부 파일 경로는 자동으로 열지 않습니다.",
      );
    /** Previously decoded node for the same binary reference. */
    const cached = imageCache.get(reference);
    if (cached) return structuredClone(cached);
    /** Source stream or fixture name used by the current operation. */
    const name = `BIN${bin.id.toString(16).toUpperCase().padStart(4, "0")}.${bin.ext}`;
    /** OLE entry containing the selected binary stream. */
    const entry =
      cfb.FileIndex[
        cfb.FullPaths.findIndex(
          /**
           * Evaluate the current parsing callback.
           *
           * This callback supplies the enclosing collection operation with its record-specific result.
           * @param {string} p The p value supplied to this operation.
           * @returns {boolean} The result consumed by the caller or enclosing collection operation.
           * @example
           * p.toUpperCase().endsWith(`/BINDATA/${name.toUpperCase()}`) // Produces the result consumed by the enclosing operation.
           */
          (p) => p.toUpperCase().endsWith(`/BINDATA/${name.toUpperCase()}`),
        )
      ];
    if (!entry?.content) throw error(`삽입 그림 ${name}이 없습니다.`);
    /** Binary-reference override for inherited stream compression. */
    const compression = (bin.flags >>> 4) & 3;
    /** Decoded source payload for the current binary object. */
    const data = expand(
      toBytes(entry.content),
      compression === 1 || (compression === 0 && compressed),
    );
    /** Browser media type selected from the embedded image extension. */
    const mime = (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        bmp: "image/bmp",
        webp: "image/webp",
      } as Record<string, string>
    )[bin.ext || ""];
    if (!mime)
      return preserve(
        control,
        `${bin.ext || "알 수 없는"} 그림`,
        "그림 원본 데이터 보존",
      );
    /** Accumulated result for the current parsing operation. */
    const result: HwpDocumentNode & { attrs: HwpNodeAttributes } = {
      type: "image",
      attrs: { src: `data:${mime};base64,${base64(data)}`, alt: name },
    };
    /** Little-endian view of the current binary structure. */
    const d = view(control.bytes);
    if (control.bytes.length >= 24) {
      result.attrs.width = px(d.getUint32(16, true));
      result.attrs.height = px(d.getUint32(20, true));
    }
    imageCache.set(reference, result);
    return structuredClone(result);
  }
  /**
   * Reconstruct an editable HWP table.
   *
   * Explicit cell addresses and merge spans define the topology; overlaps and missing cells reject the import.
   * @param {HwpRecord} control The control value supplied to this operation.
   * @returns {HwpDocumentNode} The result consumed by the caller or enclosing collection operation.
   * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
   * @example
   * table(tableControl).type // "table"
   */
  function table(control: HwpRecord): HwpDocumentNode {
    /** Source table definition carrying its row and column counts. */
    const definition =
      control.children.find(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {HwpRecord} r The r value supplied to this operation.
         * @returns {boolean} The result consumed by the caller or enclosing collection operation.
         * @example
         * r.tag === 77 // Produces the result consumed by the enclosing operation.
         */
        (r) => r.tag === 77,
      ) || all(control, 77)[0];
    if (!definition) throw error("표 정의가 없습니다.");
    requireLength(definition.bytes, 18, "표 정의");
    /** Source values for d, rows, cols used by the current binary parsing operation. */
    const d = view(definition.bytes),
      rows = d.getUint16(4, true),
      cols = d.getUint16(6, true);
    if (!rows || !cols || rows * cols > 50000)
      throw error("표의 행·열 개수가 올바르지 않습니다.");
    /** Cell-list records owned by the current table. */
    const cells: HwpRecord[] = [];
    /**
     * Traverse the current control records.
     *
     * The recursive walk collects only records belonging to the current parsing operation.
     * @param {HwpRecord} n The n value supplied to this operation.
     * @returns {void} Completes the operation without returning a value.
     * @example
     * visit(controlRecord) // Collects matching descendants in source order.
     */
    function visit(n: HwpRecord): void {
      for (/** Current c binding supplied by the enclosing source iteration. */
      const c of n.children) {
        if (c.tag === 72 && c.bytes.length >= 32) cells.push(c);
        else if (c.tag !== 66 && c.tag !== 71) visit(c);
      }
    }
    visit(control);
    /** Cell coverage map used to reject overlaps and missing topology. */
    const grid: (HwpRecord | null)[][] = Array.from(
      { length: rows },
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @returns {(HwpRecord | null)[]} The result consumed by the caller or enclosing collection operation.
       * @example
       * Array<HwpRecord | null>(cols).fill(null) // Produces the result consumed by the enclosing operation.
       */
      () => Array<HwpRecord | null>(cols).fill(null),
    );
    /** Editable cells grouped by their starting row. */
    const starts: { col: number; width:number; node: HwpDocumentNode }[][] = Array.from(
      { length: rows },
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @returns {never[]} The result consumed by the caller or enclosing collection operation.
       * @example
       * [] // Produces the result consumed by the enclosing operation.
       */
      () => [],
    );
    /** Original cell spans constrain logical columns before merged widths are represented in CSS. */
    const measurements:NativeColumnMeasurement[]=[];
    for (/** Current cell binding supplied by the enclosing source iteration. */
    const cell of cells) {
      /** Little-endian view of the current cell-list payload. */
      const cd = view(cell.bytes);
      // Hancom 2024 uses a 4-byte count and 4-byte properties (observed).
      // Earlier documented lists use a 2-byte count. Validate both layouts.
      /** Possible legacy and modern cell-list prefix lengths. */
      const candidates = cell.bytes.length >= 34 ? [8, 6] : [6];
      /** Byte offset of the current source field. */
      const offset = candidates.find(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {number} o The o value supplied to this operation.
         * @returns {boolean} The result consumed by the caller or enclosing collection operation.
         * @example
         * { const x = cd.getUint16(o, true), y = cd.getUint16(o + 2, true); const w = cd.getUint16(o + 4, true // Produces the result consumed by the enclosing operation.
         */
        (o) => {
          /** Source values for x, y used by the current binary parsing operation. */
          const x = cd.getUint16(o, true),
            y = cd.getUint16(o + 2, true);
          /** Source values for w, h used by the current binary parsing operation. */
          const w = cd.getUint16(o + 4, true),
            h = cd.getUint16(o + 6, true);
          return w > 0 && h > 0 && x + w <= cols && y + h <= rows;
        },
      );
      if (offset === undefined)
        throw error("표의 셀 주소·병합 정보가 올바르지 않습니다.");
      /** Source values for col, row used by the current binary parsing operation. */
      const col = cd.getUint16(offset, true),
        row = cd.getUint16(offset + 2, true);
      /** Source values for colspan, rowspan used by the current binary parsing operation. */
      const colspan = cd.getUint16(offset + 4, true),
        rowspan = cd.getUint16(offset + 6, true);
      if (!colspan || !rowspan || col + colspan > cols || row + rowspan > rows)
        throw error("표의 셀 주소·병합 정보가 올바르지 않습니다.");
      for (let y = row; y < row + rowspan; y++)
        for (let x = col; x < col + colspan; x++) {
          if (grid[y][x]) throw error("표의 셀 병합 영역이 겹칩니다.");
          grid[y][x] = cell;
        }
      /** Editable child nodes accumulated in source order. */
      const content = cell.children
        .filter(
          /**
           * Evaluate the current parsing callback.
           *
           * This callback supplies the enclosing collection operation with its record-specific result.
           * @param {HwpRecord} r The r value supplied to this operation.
           * @returns {boolean} The result consumed by the caller or enclosing collection operation.
           * @example
           * r.tag === 66 // Produces the result consumed by the enclosing operation.
           */
          (r) => r.tag === 66,
        )
        .flatMap(paragraph);
      /** Original integer source width remains independent from display-pixel precision. */
      const width = cd.getUint32(offset + 8, true);
      measurements.push({column:col,span:colspan,width});
      /** Editor attributes reconstructed from the source properties. */
      const attrs: HwpNodeAttributes = {
        colspan,
        rowspan,
        nativeCellHeight:nativeCellDimension(cd.getUint32(offset+12,true)),
        ...readHwpCellField(cell.bytes.subarray(offset+30)),
        nativeCellFlags: cd.getUint32(offset-4,true),
        nativeCellProperties: readHwpCellProperties(cd.getUint32(offset-4,true),{
          left:cd.getUint16(offset+16,true),right:cd.getUint16(offset+18,true),
          top:cd.getUint16(offset+20,true),bottom:cd.getUint16(offset+22,true),
        }),
        colwidth:
          width > 0
            ? Array<number>(colspan).fill(width / CELL_UNITS_PER_PIXEL / colspan)
            : null,
      };
      if (cell.bytes.length >= offset + 26) {
        /** Referenced solid background definition for the current cell. */
        const fill = info.borders[cd.getUint16(offset + 24, true) - 1];
        if (fill?.backgroundColor) attrs.backgroundColor = fill.backgroundColor;
      }
      starts[row].push({
        col,
        width,
        node: {
          type: cd.getUint32(offset-4,true)&(1<<18)?"tableHeader":"tableCell",
          attrs,
          content: content.length ? content : [emptyParagraph()],
        },
      });
    }
    if (!cells.length) throw error("표의 셀 목록이 없습니다.");
    /** Independent unmerged measurements recover unequal logical columns inside original merged cells. */
    const columnWidths=nativeColumnMeasurements(cols,measurements,control.bytes.length>=20?view(control.bytes).getUint32(16,true):0);
    for(/** Original row and cell ownership remain unchanged while native logical boundaries are resolved. */const row of starts)for(/** A cell retains its own total if inconsistent source constraints cannot share a single grid. */const cell of row){
      if(!cell.node.attrs?.colwidth)continue;
      /** Only matching original totals can replace an inferred equal division inside a merged cell. */
      const widths=columnWidths.slice(cell.col,cell.col+(cell.node.attrs.colspan??1));
      let total=0;for(/** Native distances are summed before any CSS-pixel conversion. */const width of widths)total+=width;
      if(Math.round(total)===cell.width)cell.node.attrs.colwidth=[];
      else continue;
      for(/** Fractional CSS widths retain every original native physical unit. */const width of widths)cell.node.attrs.colwidth.push(width/CELL_UNITS_PER_PIXEL);
    }
    /** Editable child nodes accumulated in source order. */
    const content = starts.map(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {{ col: number; node: HwpDocumentNode; }[]} row The row value supplied to this operation.
       * @param {number} y The y value supplied to this operation.
       * @returns {{ type: string; content: HwpDocumentNode[]; }} The result consumed by the caller or enclosing collection operation.
       * @example
       * { for (let x = 0; x < cols; x++) if (!grid[y][x]) throw error('표의 일부 셀이 누락되었습니다.'); return { type: ' // Produces the result consumed by the enclosing operation.
       */
      (row, y) => {
        for (let x = 0; x < cols; x++)
          if (!grid[y][x]) throw error("표의 일부 셀이 누락되었습니다.");
        return {
          type: "tableRow",
          content: row
            .sort(
              /**
               * Evaluate the current parsing callback.
               *
               * This callback supplies the enclosing collection operation with its record-specific result.
               * @param {{ col: number; node: HwpDocumentNode; }} a The a value supplied to this operation.
               * @param {{ col: number; node: HwpDocumentNode; }} b The b value supplied to this operation.
               * @returns {number} The result consumed by the caller or enclosing collection operation.
               * @example
               * a.col - b.col // Produces the result consumed by the enclosing operation.
               */
              (a, b) => a.col - b.col,
            )
            .map(
              /**
               * Evaluate the current parsing callback.
               *
               * This callback supplies the enclosing collection operation with its record-specific result.
               * @param {{ col: number; node: HwpDocumentNode; }} c The c value supplied to this operation.
               * @returns {HwpDocumentNode} The result consumed by the caller or enclosing collection operation.
               * @example
               * c.node // Produces the result consumed by the enclosing operation.
               */
              (c) => c.node,
            ),
        };
      },
    );
    return { type: "table", attrs:{nativeTableFlags:d.getUint32(0,true),nativeTableProperties:readHwpTableProperties(d.getUint32(0,true),d.getUint16(8,true)),nativeCellMargins:{left:d.getUint16(10,true),right:d.getUint16(12,true),top:d.getUint16(14,true),bottom:d.getUint16(16,true)}}, content };
  }
  /**
   * Convert one anchored HWP control.
   *
   * Tables and images become editor nodes while remaining controls retain their source records.
   * @param {HwpRecord} control The control value supplied to this operation.
   * @returns {HwpDocumentNode[]} The result consumed by the caller or enclosing collection operation.
   * @example
   * parseControl(sectionControl).length // 0
   */
  function parseControl(control: HwpRecord): HwpDocumentNode[] {
    /** Decoded source identifier used by the current operation. */
    const id = controlId(control);
    if (id === "secd" || id === "cold") return [];
    if (id === "tbl ") return [table(control)];
    if (all(control, 85).length) {
      /** Picture payload record inside the current control. */
      const picture = image(control);
      return picture ? [picture] : [];
    }
    /** Paragraph records owned by a preserved control. */
    const nested = all(control, 66);
    /** The text value used by the current fixture or parsing operation. */
    const text = nested
      .flatMap(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {HwpRecord} r The r value supplied to this operation.
         * @returns {HwpRecord[]} The result consumed by the caller or enclosing collection operation.
         * @example
         * r.children.filter(c => c.tag === 67) // Produces the result consumed by the enclosing operation.
         */
        (r) =>
          r.children.filter(
            /**
             * Evaluate the current parsing callback.
             *
             * This callback supplies the enclosing collection operation with its record-specific result.
             * @param {HwpRecord} c The c value supplied to this operation.
             * @returns {boolean} The result consumed by the caller or enclosing collection operation.
             * @example
             * c.tag === 67 // Produces the result consumed by the enclosing operation.
             */
            (c) => c.tag === 67,
          ),
      )
      .map(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {HwpRecord} r The r value supplied to this operation.
         * @returns {string} The result consumed by the caller or enclosing collection operation.
         * @example
         * plainText(r.bytes) // Produces the result consumed by the enclosing operation.
         */
        (r) => plainText(r.bytes),
      )
      .join("\n");
    if (id === "eqed") {
      /** Equation payload used for a readable preserved preview. */
      const equation = all(control, 88)[0];
      /** Source script used by the current native serialization step. */
      let script = "";
      if (equation) {
        requireLength(equation.bytes, 6, "수식");
        script = utf16(
          equation.bytes,
          6,
          view(equation.bytes).getUint16(4, true),
        );
      }
      return [preserve(control, "수식", script)];
    }
    /** Human-readable label for an unrendered source control. */
    const label =
      (
        {
          head: "머리말",
          foot: "꼬리말",
          "fn  ": "각주",
          "en  ": "미주",
          "gso ": "그리기 개체",
          atno: "자동 번호",
          nwno: "새 번호",
          pgnp: "쪽 번호",
          pgct: "쪽 감추기",
          bokm: "책갈피",
          "%hlk": "하이퍼링크",
        } as Record<string, string>
      )[id] || `HWP 개체 (${id})`;
    return [preserve(control, label, text)];
  }
  /**
   * Reconstruct paragraph text and objects.
   *
   * Character shapes use original UTF-16 positions, and anchored controls retain their position among text blocks.
   * @param {HwpRecord} record The record value supplied to this operation.
   * @returns {HwpDocumentNode[]} The result consumed by the caller or enclosing collection operation.
   * @throws {Error} If the source data is malformed, protected, incomplete or outside the supported bounds.
   * @example
   * paragraph(textRecord)[0].type // "paragraph"
   */
  function paragraph(record: HwpRecord): HwpDocumentNode[] {
    requireLength(record.bytes, 12, "문단 헤더");
    /** Source values for d, shape used by the current binary parsing operation. */
    const d = view(record.bytes),
      shape = info.paragraphs[d.getUint16(8, true)] || {};
    /** Explicit custom heading style attached to this native paragraph. */
    const headingLevel = shape.listType
      ? 0
      : info.headingStyles[record.bytes[10]] || 0;
    /** Editor attributes reconstructed from the source properties. */
    const attrs = {
      ...shape,
      ...(headingLevel ? { level: headingLevel } : {}),
      sourceId: `hwp-p-${sequence++}`,
      pageBreak: Boolean(shape.pageBreak || record.bytes[11] & 4),
    };
    /** Direct text payloads owned by the current paragraph. */
    const textRecords = record.children.filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 67 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 67,
    );
    /** Character-range payload owned by the current paragraph. */
    const shapes = record.children.find(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 68 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 68,
    );
    /** Source UTF-16 offsets and their active character-shape references. */
    const spans: { pos: number; id: number }[] = [];
    if (shapes) {
      if (shapes.bytes.length % 8)
        throw error("글자 모양 범위 데이터가 잘렸습니다.");
      /** Little-endian view of the character-range payload. */
      const sd = view(shapes.bytes);
      for (let p = 0; p < shapes.bytes.length; p += 8)
        spans.push({
          pos: sd.getUint32(p, true),
          id: sd.getUint32(p + 4, true),
        });
      for (let i = 1; i < spans.length; i++)
        if (spans[i].pos < spans[i - 1].pos)
          throw error("글자 모양 범위 순서가 잘못되었습니다.");
    }
    /** Anchored controls owned by the current paragraph. */
    const controls = record.children.filter(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 71 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 71,
    );
    /** Controls already matched to their inline source anchors. */
    const used = new Set<HwpRecord>();
    /** Editable blocks produced for the current paragraph. */
    const output: HwpDocumentNode[] = [];
    /** Destination active between native hyperlink begin and end anchors. */
    let activeHyperlink = "";
    /** Current inline editor node being encoded as text or a hard break. Source sourcePos used by the current native serialization step. */
    let inline: HwpDocumentNode[] = [],
      sourcePos = 0;
    /**
     * Finish the current paragraph fragment.
     *
     * The fragment is appended before a block object; forcing also retains a required empty paragraph.
     * @param {boolean} force The force value supplied to this operation.
     * @returns {void} Completes the operation without returning a value.
     * @example
     * flush(true) // Appends a paragraph even when the inline buffer is empty.
     */
    const flush = (force = false) => {
      if (inline.length || force)
        output.push({
          type: headingLevel ? "heading" : "paragraph",
          attrs: { ...attrs },
          ...(inline.length ? { content: inline } : {}),
        });
      inline = [];
    };
    /**
     * Append a styled text fragment.
     *
     * Adjacent fragments with matching script-specific marks merge into a single editor text node.
     * @param {string} value The value value supplied to this operation.
     * @param {number} position The position value supplied to this operation.
     * @returns {void} Completes the operation without returning a value.
     * @example
     * text("A", 0) // Appends the source character with its active marks.
     */
    const text = (value: string, position: number): void => {
      /** Source id used by the current native serialization step. */
      let id = spans[0]?.id ?? 0;
      for (/** Current span binding supplied by the enclosing source iteration. */
      const span of spans) {
        if (span.pos > position) break;
        id = span.id;
      }
      /** Script-table index selected for the current source character. */
      const language = characterLanguage(value);
      /** Editor marks active for the current source character. */
      const marks = [
        ...(info.marksByLanguage[language]?.[id] || info.marks[id] || []),
      ];
      if(headingLevel)retainNormalCharacterWeight(marks);
      if (activeHyperlink)
        marks.push(nativeHyperlinkAppearance(marks,{href:activeHyperlink}));
      /** Previous inline node considered for adjacent text merging. */
      const previous = inline.at(-1);
      if (
        previous?.type === "text" &&
        JSON.stringify(previous.marks || []) === JSON.stringify(marks)
      )
        previous.text = (previous.text || "") + value;
      else
        inline.push({
          type: "text",
          text: value,
          ...(marks.length ? { marks } : {}),
        });
    };
    for (/** Current recordText binding supplied by the enclosing source iteration. */
    const recordText of textRecords) {
      /** Source text bytes or fixture byte buffer used by the current operation. */
      const b = recordText.bytes;
      if (b.length % 2)
        throw error("문단 텍스트 바이트 수가 올바르지 않습니다.");
      /** Little-endian view of the current source text. */
      const td = view(b);
      for (let p = 0; p < b.length;) {
        /** Source values for unit, position used by the current binary parsing operation. */
        const unit = td.getUint16(p, true),
          position = sourcePos;
        if (unit < 32 && LONG_CONTROLS.has(unit)) {
          if (p + 16 > b.length) throw error("문단 제어 문자가 잘렸습니다.");
          if (unit === 9) text("\t", position);
          else if (unit === 4) activeHyperlink = "";
          else {
            /** Decoded source identifier used by the current operation. */
            const id = ascii
              .decode(b.subarray(p + 2, p + 6))
              .split("")
              .reverse()
              .join("");
            /** Control selected by its source anchor identifier. */
            const control = controls.find(
              /**
               * Evaluate the current parsing callback.
               *
               * This callback supplies the enclosing collection operation with its record-specific result.
               * @param {HwpRecord} c The c value supplied to this operation.
               * @returns {boolean} The result consumed by the caller or enclosing collection operation.
               * @example
               * !used.has(c) && controlId(c) === id // Produces the result consumed by the enclosing operation.
               */
              (c) => !used.has(c) && controlId(c) === id,
            );
            if (control) {
              used.add(control);
              if (unit === 3 && controlId(control) === "%hlk") {
                /** URL decoded from the exact native hyperlink field record. */
                const destination = hyperlinkDestination(control);
                if (destination) {
                  activeHyperlink = destination;
                  p += 16;
                  sourcePos += 8;
                  continue;
                }
              }
              /** Editable or preserved blocks produced by the selected control. */
              const nodes = parseControl(control);
              if (nodes.length) {
                flush();
                output.push(...nodes);
              }
            } else if (unit === 11)
              throw error(`개체 컨트롤 ${id}의 헤더가 없습니다.`);
          }
          p += 16;
          sourcePos += 8;
        } else {
          if (unit === 10) inline.push({ type: "hardBreak" });
          else if (unit === 24) text("-", position);
          else if (unit === 30) text("\u00a0", position);
          else if (unit === 31) text("\u2007", position);
          else if (unit >= 32) {
            // Decode surrogate pairs together, but keep source positions in UTF-16 units.
            /** UTF-16 code-unit count of the current Unicode character. */
            const count = unit >= 0xd800 && unit <= 0xdbff ? 2 : 1;
            text(utf16(b, p, count), position);
            p += (count - 1) * 2;
            sourcePos += count - 1;
          }
          p += 2;
          sourcePos++;
        }
      }
    }
    flush(!output.length);
    for (/** Current control binding supplied by the enclosing source iteration. */
    const control of controls)
      if (!used.has(control)) output.push(...parseControl(control));
    return output;
  }
  /**
   * Read text for a preserved object preview.
   *
   * The preview skips binary control payloads and retains printable characters, tabs and line breaks.
   * @param {Uint8Array<ArrayBufferLike>} b The b value supplied to this operation.
   * @returns {string} The result consumed by the caller or enclosing collection operation.
   * @example
   * plainText(new Uint8Array([65, 0])) // "A"
   */
  function plainText(b: Uint8Array): string {
    /** Little-endian view of the current binary structure. */
    const d =
      view(
        b,
      ); /** Character metadata or encoded Unicode text used by the current source structure. */
    let text = "";
    for (let p = 0; p + 1 < b.length; p += 2) {
      /** UTF-16 code unit inspected for the object preview. */
      const code = d.getUint16(p, true);
      if (code < 32 && LONG_CONTROLS.has(code)) {
        if (code === 9) text += "\t";
        p += 14;
      } else if (code >= 32) text += String.fromCharCode(code);
      else if (code === 10) text += "\n";
    }
    return text;
  }

  /** Editable child nodes accumulated in source order. */
  const content: HwpDocumentNode[] = [];
  for (/** Current section binding supplied by the enclosing source iteration. */
  const section of sections) {
    /** Validated records in source order. */
    const records = parseHwpRecords(
      expand(toBytes(section.entry.content), compressed),
    );
    /** Reconstructed hierarchy for the current body section. */
    const sectionTree = tree(records);
    /** Page-definition record owned by the current section. */
    const paper = records.find(
      /**
       * Evaluate the current parsing callback.
       *
       * This callback supplies the enclosing collection operation with its record-specific result.
       * @param {HwpRecord} r The r value supplied to this operation.
       * @returns {boolean} The result consumed by the caller or enclosing collection operation.
       * @example
       * r.tag === 73 // Produces the result consumed by the enclosing operation.
       */
      (r) => r.tag === 73,
    );
    if (paper) {
      requireLength(paper.bytes, 40, "용지 설정");
      /** Little-endian view of the current binary structure. */
      const d = view(paper.bytes);
      /** Physical page dimensions and margins decoded from the source. */
      const settings: HwpPageSettings = {
        width: mm(d.getUint32(0, true)),
        height: mm(d.getUint32(4, true)),
        marginLeft: mm(d.getUint32(8, true)),
        marginRight: mm(d.getUint32(12, true)),
        marginTop: mm(d.getUint32(16, true)),
        marginBottom: mm(d.getUint32(20, true)),
        ...(d.getUint32(24, true) > 0
          ? { header: mm(d.getUint32(24, true)) }
          : {}),
        ...(d.getUint32(28, true) > 0
          ? { footer: mm(d.getUint32(28, true)) }
          : {}),
      };
      if (d.getUint32(36, true) & 1)
        [settings.width, settings.height] = [settings.height, settings.width];
      /** Section distances belong to the section control, independently from paper margins. */
      const definition=records.find(
        /**
         * Select the actual native section control for these physical page settings.
         *
         * Other control records cannot supply document grid axes.
         * @param {HwpRecord} record - Original body control record.
         * @returns {boolean} Whether it is this section's native definition.
         * @example
         * // Table and column controls remain separate from section metadata.
         */
        (record)=>record.tag===71&&controlId(record)==='secd');
      if(definition){
        requireLength(definition.bytes,14,'구역 격자');
        /** Published native section offsets follow its four-byte control identifier. */
        const grid=view(definition.bytes),lineGrid=grid.getInt16(10,true),charGrid=grid.getInt16(12,true),manuscript=!!(grid.getUint32(4,true)&(1<<22));
        Object.assign(settings,sectionGridSettings({...(lineGrid?{lineGrid}:{}),...(charGrid?{charGrid}:{}),...(manuscript?{wonggojiFormat:true}:{})}));
      }
      pages.push(settings);
      if (section.index === 0) Object.assign(page, settings);
    }
    /** Editable top-level blocks produced for the current section. */
    const blocks = sectionTree.children
      .filter(
        /**
         * Evaluate the current parsing callback.
         *
         * This callback supplies the enclosing collection operation with its record-specific result.
         * @param {HwpRecord} r The r value supplied to this operation.
         * @returns {boolean} The result consumed by the caller or enclosing collection operation.
         * @example
         * r.tag === 66 // Produces the result consumed by the enclosing operation.
         */
        (r) => r.tag === 66,
      )
      .flatMap(paragraph);
    if (content.length && blocks[0]?.type === "paragraph") {
      blocks[0].attrs ||= {};
      blocks[0].attrs.pageBreak = true;
    }
    content.push(...blocks);
  }
  /** Final editor document containing all imported body blocks. */
  const doc: HwpDocumentNode = {
    type: "doc",
    content: content.length ? groupListBlocks(content) : [emptyParagraph()],
  };
  return {
    doc,
    page,
    pages,
    warnings: [...warnings],
    format: "hwp",
    original: {
      format: "hwp",
      base64: base64(bytes),
      doc: structuredClone(doc),
    },
  };
}
