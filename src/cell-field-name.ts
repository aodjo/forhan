/** Original Hancom 2024 named-cell extension prefix, independently observed before its UTF-16 length. */
const NAMED_CELL_PREFIX = [255, 27, 2, 1, 0, 0, 0, 0, 64, 1, 0] as const;
/** Original unnamed modern cells retain nine trailing zero bytes after the reference width. */
const EMPTY_CELL_DATA_LENGTH = 9;

/** Independently decoded field identity and opaque original cell extension bytes. */
export interface NativeCellField {
  nativeCellFieldName: string | null;
  nativeCellFieldData: string;
}

/**
 * Validate one literal native cell field name without trimming or normalization.
 *
 * Names remain independent from cell text and appearance. UTF-16 code-unit
 * length must fit HWP's original field, and every scalar must survive XML.
 * @param {unknown} value - Literal original or explicitly edited field name.
 * @returns {string} The unchanged valid name, including an explicit empty name.
 * @throws {TypeError|RangeError} If the name cannot be represented losslessly.
 * @example
 * cellFieldName('Invoice_A'); // 'Invoice_A'
 */
export function cellFieldName(value: unknown): string {
  if (typeof value !== "string")
    throw new TypeError("셀 필드 이름이 문자열이 아닙니다.");
  if (value.length > 65535)
    throw new RangeError("셀 필드 이름이 저장 범위를 벗어났습니다.");
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(
      value,
    )
  )
    throw new TypeError("셀 필드 이름에 저장할 수 없는 문자가 있습니다.");
  return value;
}

/**
 * Decode an actual named-cell extension while retaining every original byte.
 *
 * Unknown extension layouts retain a null name instead of claiming the cell is
 * unnamed. Their original bytes remain available for unchanged HWP/FHN saves.
 * @param {Uint8Array} bytes - Original bytes after the cell's reference width.
 * @returns {NativeCellField} Literal field identity and lossless hexadecimal extension.
 * @throws {TypeError} If a recognized name contains invalid Unicode.
 * @example
 * readHwpCellField(new Uint8Array(9)).nativeCellFieldName; // ''
 */
export function readHwpCellField(bytes: Uint8Array): NativeCellField {
  /** Opaque source bytes never become executable or rendered markup. */
  let data = "",
    empty = true;
  for (/** Hexadecimal retention remains portable in both browser and desktop readers. */ const byte of bytes) {
    data += byte.toString(16).padStart(2, "0");
    if (byte !== 0) empty = false;
  }
  if (empty) return { nativeCellFieldName: "", nativeCellFieldData: data };
  for (let index = 0; index < NAMED_CELL_PREFIX.length; index++)
    if (bytes[index] !== NAMED_CELL_PREFIX[index])
      return { nativeCellFieldName: null, nativeCellFieldData: data };
  if (bytes.length < 21)
    return { nativeCellFieldName: null, nativeCellFieldData: data };
  /** Native field length counts UTF-16 code units, independently of Unicode scalar count. */
  const length = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint16(11, true),
    end = 13 + length * 2;
  if (end + 8 > bytes.length)
    return { nativeCellFieldName: null, nativeCellFieldData: data };
  return {
    nativeCellFieldName: cellFieldName(
      new TextDecoder("utf-16le", { fatal: true, ignoreBOM: true }).decode(
        bytes.subarray(13, end),
      ),
    ),
    nativeCellFieldData: data,
  };
}

/**
 * Serialize field identity without silently discarding opaque cell data.
 *
 * Unchanged original extensions are byte-identical. Known field-name edits
 * preserve their trailing data; unknown layouts reject an incompatible edit.
 * Fresh cells receive the independently observed native extension structure.
 * @param {unknown} name - Literal field name, or null for an unknown retained layout.
 * @param {unknown} [data=undefined] - Original hexadecimal cell extension, if retained.
 * @returns {Uint8Array} Complete native bytes following the reference width.
 * @throws {TypeError|RangeError} If a name or retained extension is malformed or cannot be changed safely.
 * @example
 * writeHwpCellField('Invoice_A'); // A native named-cell extension.
 */
export function writeHwpCellField(name: unknown, data?: unknown): Uint8Array {
  if (
    data !== undefined &&
    data !== null &&
    (typeof data !== "string" || !/^(?:[0-9a-f]{2})*$/iu.test(data))
  )
    throw new TypeError("셀의 원본 필드 데이터가 올바르지 않습니다.");
  /** Original opaque data remains independent from newly encoded field-name text. */
  const hex = typeof data === "string" ? data : "",
    original = new Uint8Array(hex.length / 2);
  for (let index = 0; index < original.length; index++)
    original[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  /** Null belongs only to an unknown source extension; absent new names mean explicitly unnamed cells. */
  const decoded = readHwpCellField(original),
    value =
      name === undefined || (name === null && !original.length)
        ? decoded.nativeCellFieldName
        : name;
  if (value === decoded.nativeCellFieldName && original.length) return original;
  if (value === null)
    throw new TypeError("해석할 수 없는 셀 필드의 원본 데이터가 없습니다.");
  /** Validated names must fit both the native UTF-16 length and HWPX XML. */
  const valid = cellFieldName(value);
  if (decoded.nativeCellFieldName === null)
    throw new TypeError(
      "해석할 수 없는 원본 셀 필드 데이터를 변경할 수 없습니다.",
    );
  /** Existing known named extensions keep all bytes following the original name. */
  const suffix =
    decoded.nativeCellFieldName && original.length >= 21
      ? original.slice(13 + decoded.nativeCellFieldName.length * 2)
      : new Uint8Array(8);
  if (!valid) {
    for (/** Clearing a field cannot erase unrelated nonzero original extension bytes. */ const byte of suffix)
      if (byte !== 0)
        throw new TypeError(
          "다른 원본 데이터가 있는 셀 필드 이름을 지울 수 없습니다.",
        );
    return new Uint8Array(EMPTY_CELL_DATA_LENGTH);
  }
  /** Original field names use little-endian UTF-16 with no added terminator. */
  const result = new Uint8Array(13 + valid.length * 2 + suffix.length),
    view = new DataView(result.buffer);
  result.set(NAMED_CELL_PREFIX);
  view.setUint16(11, valid.length, true);
  for (let index = 0; index < valid.length; index++)
    view.setUint16(13 + index * 2, valid.charCodeAt(index), true);
  result.set(suffix, 13 + valid.length * 2);
  return result;
}

/**
 * Restore literal cell identity from serialized HTML metadata.
 *
 * Absence remains distinct from an explicit empty field name and an imported
 * native field whose opaque data is not yet understood.
 * @param {HTMLElement} element - Actual imported table cell.
 * @returns {string|null} Validated field name or no represented identity.
 * @throws {TypeError|RangeError} If explicit name metadata is malformed.
 * @example
 * readHtmlCellFieldName(cell); // The original literal data attribute.
 */
export function readHtmlCellFieldName(element: HTMLElement): string | null {
  /** Browser attribute decoding supplies the literal original text safely. */
  const name = element.getAttribute("data-forhan-cell-field-name");
  return name === null ? null : cellFieldName(name);
}

/**
 * Render independent cell identity without changing its visible text or style.
 *
 * The editor's attribute serializer escapes the literal metadata value.
 * @param {Record<string,unknown>} attrs - Actual original cell attributes.
 * @returns {Record<string,string>} Literal identity metadata, if represented.
 * @throws {TypeError|RangeError} If an explicitly represented name is malformed.
 * @example
 * renderHtmlCellFieldName({nativeCellFieldName:'Invoice_A'});
 */
export function renderHtmlCellFieldName(
  attrs: Record<string, unknown>,
): Record<string, string> {
  return attrs.nativeCellFieldName === undefined ||
    attrs.nativeCellFieldName === null
    ? {}
    : {
        "data-forhan-cell-field-name": cellFieldName(attrs.nativeCellFieldName),
      };
}

/**
 * Restore opaque original cell extension bytes from serialized HTML metadata.
 *
 * Validation retains unknown layouts without assuming that they are unnamed.
 * @param {HTMLElement} element - Actual imported table cell.
 * @returns {string|null} Validated original hexadecimal bytes or no source data.
 * @throws {TypeError} If explicit original metadata is malformed.
 * @example
 * readHtmlCellFieldData(cell); // The unchanged original extension.
 */
export function readHtmlCellFieldData(element: HTMLElement): string | null {
  /** A missing attribute cannot create an invented native extension. */
  const data = element.getAttribute("data-forhan-cell-field-data");
  if (data !== null) writeHwpCellField(undefined, data);
  return data;
}

/**
 * Retain opaque cell extensions independently of their optional readable names.
 *
 * HTML serialization escapes metadata without rendering source bytes as text.
 * @param {Record<string,unknown>} attrs - Actual original cell attributes.
 * @returns {Record<string,string>} Validated original extension metadata.
 * @throws {TypeError} If explicit original metadata is malformed.
 * @example
 * renderHtmlCellFieldData({nativeCellFieldData:'000000000000000000'});
 */
export function renderHtmlCellFieldData(
  attrs: Record<string, unknown>,
): Record<string, string> {
  if (
    attrs.nativeCellFieldData === undefined ||
    attrs.nativeCellFieldData === null
  )
    return {};
  writeHwpCellField(undefined, attrs.nativeCellFieldData);
  return { "data-forhan-cell-field-data": attrs.nativeCellFieldData as string };
}
