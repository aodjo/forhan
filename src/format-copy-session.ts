import type { JSONContent } from "@tiptap/core";
import {
  nativeCellProperties,
  type NativeCellProperties,
} from "./cell-properties.ts";

/** Body-format choices represented independently from the copied source document. */
export type FormatPainterMode = "character" | "paragraph" | "both";
/** Explicit accepted copy choices remain independent from every destination document. */
export interface FormatPainterOptions {
  mode: FormatPainterMode;
  cellProperties: boolean;
  cellBackground: boolean;
  cellOnly: boolean;
}
/** Appearance snapshots contain no authored text, semantic links or source-node ownership. */
export interface FormatPainterSource {
  marks: NonNullable<JSONContent["marks"]>;
  paragraph: Record<string, unknown>;
  cellBackground?: string | null;
  cellProperties?: NativeCellProperties;
  cellHeader?: boolean;
}
/** Versioned appearance-only session data belongs to one application process. */
export interface FormatCopySession {
  version: 1;
  source: FormatPainterSource;
  options: FormatPainterOptions;
}
/** Actual copyable paragraph-shape fields exclude authored breaks, source IDs and heading levels. */
export const FORMAT_COPY_PARAGRAPH_FIELDS = [
  "textAlign",
  "lineHeight",
  "marginLeft",
  "marginRight",
  "marginTop",
  "marginBottom",
  "textIndent",
  "nativeSnapToGrid",
  "nativeParagraphCondense",
  "nativeBreakLatinWord",
  "nativeBreakNonLatinWord",
] as const;
/** One appearance snapshot is bounded independently from the much larger document import limit. */
export const MAX_FORMAT_COPY_SESSION_BYTES = 64 * 1024;
/** Only appearance marks can enter the process-local format-copy memory. */
const CHARACTER_MARK_TYPES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "textStyle",
  "superscript",
  "subscript",
  "code",
];

/**
 * Require one appearance-only record with an explicit allowed key set.
 *
 * Source text, paths and document-node ownership cannot be added as top-level
 * session or paragraph properties through the isolated native bridge.
 * @param {unknown} value - Untrusted session record.
 * @param {readonly string[]} keys - Exact permitted record properties.
 * @returns {Record<string,unknown>} Original validated record.
 * @throws {TypeError} If the record is absent, is an array or includes unknown properties.
 * @example
 * const options=appearanceRecord(value,['mode','cellBackground','cellOnly']);
 */
function appearanceRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("모양 복사 정보가 올바르지 않습니다.");
  for (/** Only explicit appearance properties belong to the session contract. */ const key of Object.keys(
    value,
  ))
    if (!keys.includes(key))
      throw new TypeError("지원하지 않는 모양 복사 정보가 있습니다.");
  return value as Record<string, unknown>;
}

/**
 * Require bounded JSON appearance values without coercing source metadata.
 *
 * Native language arrays, explicit false flags and zero values remain exact.
 * Excessive nesting cannot enter the application-owned in-memory snapshot.
 * @param {unknown} value - Original JSON-compatible appearance value.
 * @param {number} [depth=0] - Current nested appearance depth.
 * @returns {void} Confirms the value contains only bounded ordinary JSON data.
 * @throws {TypeError} If metadata is non-finite, unsafe, non-JSON or too deeply nested.
 * @example
 * appearanceJson({spacing:[0,-5,10,0,0,0,0]});
 */
function appearanceJson(value: unknown, depth = 0): void {
  if (depth > 8) throw new TypeError("모양 복사 정보의 구조가 너무 깊습니다.");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (/** Every native source array element remains ordinary JSON data. */ const item of value)
      appearanceJson(item, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    /** Native metadata records retain ordinary own data rather than special object serialization. */
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError("모양 복사 정보의 개체가 올바르지 않습니다.");
    for (/** Dangerous object keys are never interpreted as native appearance metadata. */ const [
      key,
      item,
    ] of Object.entries(value)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor")
        throw new TypeError("모양 복사 정보의 속성이 올바르지 않습니다.");
      if (item !== undefined) appearanceJson(item, depth + 1);
    }
    return;
  }
  throw new TypeError("모양 복사 정보의 값이 올바르지 않습니다.");
}

/**
 * Serialize a validated independent appearance snapshot for process-local memory.
 *
 * No document bytes or filesystem paths belong to the payload. Undefined cell
 * context remains absent instead of becoming a real no-fill cell. Validation
 * finishes before any previous accepted memory can be replaced.
 * @param {unknown} value - Untrusted accepted source and copy choices.
 * @returns {string} Bounded canonical JSON retaining exact native metadata.
 * @throws {TypeError} If the payload is malformed or includes unsupported source fields.
 * @throws {RangeError} If the UTF-8 snapshot exceeds the independent session limit.
 * @example
 * const json=serializeFormatCopySession({version:1,source,options});
 */
export function serializeFormatCopySession(value: unknown): string {
  appearanceJson(value);
  /** Structural validation applies to the exact independent JSON that would enter app memory. */
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_FORMAT_COPY_SESSION_BYTES)
    throw new RangeError("모양 복사 정보의 크기가 제한을 넘습니다.");
  /** Only explicit source and accepted option records are permitted. */
  const session = appearanceRecord(JSON.parse(json), [
      "version",
      "source",
      "options",
    ]),
    source = appearanceRecord(session.source, [
      "marks",
      "paragraph",
      "cellBackground",
      "cellProperties",
      "cellHeader",
    ]),
    options = appearanceRecord(session.options, [
      "mode",
      "cellBackground",
      "cellProperties",
      "cellOnly",
    ]),
    paragraph = appearanceRecord(
      source.paragraph,
      FORMAT_COPY_PARAGRAPH_FIELDS,
    );
  if (
    session.version !== 1 ||
    !Array.isArray(source.marks) ||
    source.marks.length > CHARACTER_MARK_TYPES.length
  )
    throw new TypeError("모양 복사 정보의 형식이 올바르지 않습니다.");
  for (/** Every represented paragraph property has an explicit source or default value. */ const key of FORMAT_COPY_PARAGRAPH_FIELDS)
    if (!(key in paragraph))
      throw new TypeError("모양 복사 문단 정보가 빠져 있습니다.");
  /** A real source mark set contains each character appearance type at most once. */
  const seen = new Set<string>();
  for (/** Semantic links never become copied appearance or source ownership. */ const candidate of source.marks) {
    /** Source marks have only their actual appearance type and optional native attributes. */
    const mark = appearanceRecord(candidate, ["type", "attrs"]);
    if (
      typeof mark.type !== "string" ||
      !CHARACTER_MARK_TYPES.includes(mark.type) ||
      seen.has(mark.type)
    )
      throw new TypeError("모양 복사의 글자 정보가 올바르지 않습니다.");
    seen.add(mark.type);
    if (
      mark.attrs !== undefined &&
      (mark.attrs === null ||
        typeof mark.attrs !== "object" ||
        Array.isArray(mark.attrs))
    )
      throw new TypeError("모양 복사 글자 속성이 올바르지 않습니다.");
  }
  if (
    typeof options.mode !== "string" ||
    !["character", "paragraph", "both"].includes(options.mode) ||
    typeof options.cellBackground !== "boolean" ||
    typeof options.cellProperties !== "boolean" ||
    typeof options.cellOnly !== "boolean" ||
    (options.cellOnly && !options.cellBackground && !options.cellProperties)
  )
    throw new TypeError("모양 복사 선택 정보가 올바르지 않습니다.");
  if (
    source.cellBackground !== undefined &&
    source.cellBackground !== null &&
    typeof source.cellBackground !== "string"
  )
    throw new TypeError("모양 복사의 셀 배경이 올바르지 않습니다.");
  if (options.cellBackground && source.cellBackground === undefined)
    throw new TypeError("복사할 셀 배경 정보가 없습니다.");
  if (source.cellProperties !== undefined) {
    /** Cell appearance contains only the independently represented native property record. */
    const properties = appearanceRecord(source.cellProperties, [
      "textDirection",
      "lineWrap",
      "verticalAlign",
      "hasMargin",
      "margins",
      "protected",
      "editable",
    ]);
    appearanceRecord(properties.margins, ["left", "right", "top", "bottom"]);
    nativeCellProperties(properties);
    if (
      typeof source.cellHeader !== "boolean" ||
      source.cellBackground === undefined
    )
      throw new TypeError("복사할 셀 속성의 원본 정보가 없습니다.");
  } else if (source.cellHeader !== undefined || options.cellProperties)
    throw new TypeError("복사할 셀 속성 정보가 없습니다.");
  return json;
}

/** Application-owned memory survives source-window replacement and is never stored on disk. */
export class FormatCopyMemory {
  /** Only a successfully validated immutable JSON snapshot replaces the accepted session. */
  private serialized: string | null = null;

  /**
   * Read an independent snapshot from the current application lifetime.
   *
   * The caller cannot mutate the accepted source or options through a returned
   * object. A newly started process has no previous copied appearance.
   * @returns {FormatCopySession|null} Independent accepted appearance or no current session.
   * @example
   * const copied=memory.read();
   */
  read(): FormatCopySession | null {
    return this.serialized === null
      ? null
      : (JSON.parse(this.serialized) as FormatCopySession);
  }

  /**
   * Replace current app-lifetime appearance only after complete validation.
   *
   * Failed writes preserve the last accepted source. There are no filesystem,
   * system clipboard, document history or recovery-storage side effects.
   * @param {unknown} value - Untrusted accepted source and copy choices.
   * @returns {void} Stores only the validated independent appearance snapshot.
   * @throws {TypeError} If the appearance payload is invalid.
   * @throws {RangeError} If the bounded source snapshot is too large.
   * @example
   * memory.write({version:1,source,options});
   */
  write(value: unknown): void {
    this.serialized = serializeFormatCopySession(value);
  }
}
