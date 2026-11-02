/** Native cell distances retain exact integer HWP units, including explicit zero. */
export interface NativeCellMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Independent cell properties exclude text, dimensions, fills and border ownership. */
export interface NativeCellProperties {
  textDirection: 0 | 1 | 2;
  lineWrap: 0 | 1 | 2;
  verticalAlign: 0 | 1 | 2;
  hasMargin: boolean;
  margins: NativeCellMargins;
  protected: boolean;
  editable: boolean;
}

/** Original native cell flags represented explicitly by the neutral model and cell node type. */
const CELL_PROPERTY_FLAGS = 7 | (3 << 3) | (3 << 5) | (15 << 16);
/** Original HWPX direction names observed independently in native generated documents. */
const TEXT_DIRECTIONS = ["HORIZONTAL", "VERTICAL", "VERTICALALL"] as const;
/** Original HWPX wrapping names retain distinct native values rather than Boolean coercion. */
const LINE_WRAPS = ["BREAK", "SQUEEZE", "KEEP"] as const;
/** Original cell vertical alignment names follow the native top, center and bottom order. */
const VERTICAL_ALIGNMENTS = ["TOP", "CENTER", "BOTTOM"] as const;
/** Native distance fields cannot exceed a signed 32-bit physical source value. */
const MAX_CELL_DISTANCE = 0x7fffffff;

/**
 * Require one finite nonnegative integral native cell distance.
 *
 * No CSS conversion, floating-point rounding or truthy fallback can erase a
 * retained zero value. Native binary writers additionally check field widths.
 * @param {unknown} value - Original physical distance in HWP units.
 * @returns {number} Exact original distance.
 * @throws {RangeError} If the distance is nonintegral, negative or outside native bounds.
 * @example
 * cellDistance(0); // 0
 */
function cellDistance(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_CELL_DISTANCE
  )
    throw new RangeError("셀 안 여백의 원본 단위가 올바르지 않습니다.");
  return value;
}

/**
 * Normalize exact native margins without sharing mutable defaults.
 *
 * An absent record receives the independently observed native table defaults.
 * Present records must supply all four sides, including explicit zero values.
 * @param {unknown} [value=undefined] - Original native margin record or no retained source.
 * @returns {NativeCellMargins} Independent validated physical distances.
 * @throws {RangeError|TypeError} If an original margin record is malformed.
 * @example
 * nativeCellMargins({left:123,right:456,top:0,bottom:789}).top; // 0
 */
export function nativeCellMargins(value?: unknown): NativeCellMargins {
  if (value === undefined || value === null)
    return { left: 510, right: 510, top: 141, bottom: 141 };
  if (typeof value !== "object" || Array.isArray(value))
    throw new TypeError("셀 안 여백 정보가 올바르지 않습니다.");
  /** Every side is validated independently rather than merged with arbitrary input properties. */
  const margins = value as Record<string, unknown>;
  return {
    left: cellDistance(margins.left),
    right: cellDistance(margins.right),
    top: cellDistance(margins.top),
    bottom: cellDistance(margins.bottom),
  };
}

/**
 * Validate one native three-state cell enumeration.
 *
 * Zero is a real source choice for horizontal writing, wrapping or top alignment.
 * @param {unknown} value - Original uncoerced cell property.
 * @returns {0|1|2} Exact supported original state.
 * @throws {RangeError} If the value is not one of the three native states.
 * @example
 * cellState(0); // 0
 */
function cellState(value: unknown): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2)
    throw new RangeError("지원하지 않는 셀 속성 값입니다.");
  return value;
}

/**
 * Normalize the complete represented native cell properties.
 *
 * Missing metadata receives actual native defaults. Present metadata retains
 * explicit false flags, exact physical margins and all independent mode values.
 * @param {unknown} [value=undefined] - Original retained cell properties.
 * @returns {NativeCellProperties} Independent validated original properties.
 * @throws {TypeError|RangeError} If any supplied native property is malformed.
 * @example
 * nativeCellProperties().verticalAlign; // 1
 */
export function nativeCellProperties(value?: unknown): NativeCellProperties {
  if (value === undefined || value === null)
    return {
      textDirection: 0,
      lineWrap: 0,
      verticalAlign: 1,
      hasMargin: false,
      margins: nativeCellMargins(),
      protected: false,
      editable: false,
    };
  if (typeof value !== "object" || Array.isArray(value))
    throw new TypeError("셀 속성 정보가 올바르지 않습니다.");
  /** A fresh record prevents mutable source metadata from becoming writer state. */
  const properties = value as Record<string, unknown>;
  if (properties.margins === undefined || properties.margins === null)
    throw new TypeError("셀 안 여백의 원본 정보가 없습니다.");
  for (/** All represented native flags remain genuine Boolean source values. */ const field of [
    "hasMargin",
    "protected",
    "editable",
  ])
    if (typeof properties[field] !== "boolean")
      throw new TypeError("셀 속성의 논리 값이 올바르지 않습니다.");
  return {
    textDirection: cellState(properties.textDirection),
    lineWrap: cellState(properties.lineWrap),
    verticalAlign: cellState(properties.verticalAlign),
    hasMargin: properties.hasMargin as boolean,
    margins: nativeCellMargins(properties.margins),
    protected: properties.protected as boolean,
    editable: properties.editable as boolean,
  };
}

/**
 * Decode independently observed native cell-list flags and physical margins.
 *
 * Native title-cell ownership belongs to the structural cell type and is read
 * separately by the table parser. Unknown flags remain available as raw metadata.
 * @param {number} flags - Original unsigned native LIST_HEADER flags.
 * @param {NativeCellMargins} margins - Exact original cell-margin fields.
 * @returns {NativeCellProperties} Complete represented original cell properties.
 * @throws {TypeError|RangeError} If the source flags or fields are malformed.
 * @example
 * readHwpCellProperties(65609,{left:123,right:456,top:0,bottom:789}).textDirection; // 1
 */
export function readHwpCellProperties(
  flags: number,
  margins: NativeCellMargins,
): NativeCellProperties {
  if (!Number.isInteger(flags) || flags < 0 || flags > 0xffffffff)
    throw new RangeError("셀 속성 플래그가 올바르지 않습니다.");
  return nativeCellProperties({
    textDirection: flags & 7,
    lineWrap: (flags >>> 3) & 3,
    verticalAlign: (flags >>> 5) & 3,
    hasMargin: !!(flags & (1 << 16)),
    margins,
    protected: !!(flags & (1 << 17)),
    editable: !!(flags & (1 << 19)),
  });
}

/**
 * Encode native cell properties without erasing unrelated retained flags.
 *
 * The destination cell type supplies the native title-cell flag. Exact native
 * margin distances are checked against HWP's unsigned 16-bit storage bounds.
 * @param {unknown} value - Original complete neutral cell properties.
 * @param {boolean} header - Whether the actual cell node is a native title cell.
 * @param {number} [original=0] - Original raw unsigned LIST_HEADER flags.
 * @returns {number} Native unsigned flags retaining unrelated original bits.
 * @throws {RangeError|TypeError} If source metadata cannot fit native fields.
 * @example
 * hwpCellFlags(nativeCellProperties(),false); // 32
 */
export function hwpCellFlags(
  value: unknown,
  header: boolean,
  original = 0,
): number {
  /** Known properties replace only their own independent native flag bits. */
  const properties = nativeCellProperties(value);
  if (!Number.isInteger(original) || original < 0 || original > 0xffffffff)
    throw new RangeError("원본 셀 속성 플래그가 올바르지 않습니다.");
  for (/** Native HWP margins cannot silently truncate larger HWPX physical values. */ const margin of Object.values(
    properties.margins,
  ))
    if (margin > 0xffff)
      throw new RangeError("셀 안 여백이 HWP 저장 범위를 벗어났습니다.");
  return (
    ((original & ~CELL_PROPERTY_FLAGS) |
      properties.textDirection |
      (properties.lineWrap << 3) |
      (properties.verticalAlign << 5) |
      (Number(properties.hasMargin) << 16) |
      (Number(properties.protected) << 17) |
      (Number(header) << 18) |
      (Number(properties.editable) << 19)) >>>
    0
  );
}

/**
 * Decode one exact HWPX native enumeration name.
 *
 * An absent attribute receives the format default; an unsupported present value
 * cannot silently become a different direction, wrapping or alignment mode.
 * @param {string|undefined} value - Original native XML attribute.
 * @param {readonly string[]} names - Ordered native enumeration names.
 * @param {0|1|2} fallback - Default used only when the source attribute is absent.
 * @returns {0|1|2} Exact represented native state.
 * @throws {RangeError} If the original attribute name is unsupported.
 * @example
 * xmlCellState('KEEP',['BREAK','SQUEEZE','KEEP'],0); // 2
 */
function xmlCellState(
  value: string | undefined,
  names: readonly string[],
  fallback: 0 | 1 | 2,
): 0 | 1 | 2 {
  return value === undefined ? fallback : cellState(names.indexOf(value));
}

/**
 * Decode native XML Boolean spellings without treating zero as absent.
 *
 * Both numeric and schema Boolean spellings retain their original meaning.
 * @param {string|undefined} value - Original XML cell flag.
 * @returns {boolean} Exact original value, with false for an absent optional flag.
 * @throws {TypeError} If a present value is not a native Boolean spelling.
 * @example
 * xmlCellFlag('0'); // false
 */
function xmlCellFlag(value: string | undefined): boolean {
  if (value === undefined || value === "0" || value === "false") return false;
  if (value === "1" || value === "true") return true;
  throw new TypeError("셀 속성의 XML 논리 값이 올바르지 않습니다.");
}

/**
 * Read exact native margin distances from XML attributes.
 *
 * Entirely absent records retain native defaults. Supplied sides are parsed as
 * literal nonnegative integers, preserving zero and rejecting invalid suffixes.
 * @param {Record<string,string>|undefined} values - Original native margin attributes.
 * @returns {NativeCellMargins} Exact independent original physical distances.
 * @throws {TypeError|RangeError} If a present native distance is malformed.
 * @example
 * readHwpxCellMargins({left:'123',right:'456',top:'0',bottom:'789'}).top; // 0
 */
export function readHwpxCellMargins(
  values: Record<string, string> | undefined,
): NativeCellMargins {
  if (!values) return nativeCellMargins();
  /** Only explicit physical sides can enter the retained margin record. */
  const margins: Record<string, number> = {};
  for (/** Missing individual sides retain native per-side defaults without replacing explicit zero. */ const [
    side,
    fallback,
  ] of Object.entries(nativeCellMargins())) {
    /** Native XML values remain exact integer HWP units until actual browser rendering. */
    const value = values[side];
    if (value !== undefined && !/^\d+$/u.test(value))
      throw new TypeError("셀 안 여백의 XML 값이 올바르지 않습니다.");
    margins[side] = value === undefined ? fallback : Number(value);
  }
  return nativeCellMargins(margins);
}

/**
 * Decode independent HWPX cell and list properties into the neutral model.
 *
 * Cell margins remain separate from table defaults so later edits cannot turn
 * inherited margins into an unrelated explicit native setting.
 * @param {Record<string,string>} cell - Original native cell attributes.
 * @param {Record<string,string>} list - Original native subList attributes.
 * @param {Record<string,string>|undefined} margins - Original native cellMargin attributes.
 * @returns {NativeCellProperties} Validated independent cell properties.
 * @throws {TypeError|RangeError} If original native metadata is malformed or unsupported.
 * @example
 * readHwpxCellProperties({hasMargin:'0'},{vertAlign:'TOP'},undefined).verticalAlign; // 0
 */
export function readHwpxCellProperties(
  cell: Record<string, string>,
  list: Record<string, string>,
  margins: Record<string, string> | undefined,
): NativeCellProperties {
  return nativeCellProperties({
    textDirection: xmlCellState(list.textDirection, TEXT_DIRECTIONS, 0),
    lineWrap: xmlCellState(list.lineWrap, LINE_WRAPS, 0),
    verticalAlign: xmlCellState(list.vertAlign, VERTICAL_ALIGNMENTS, 1),
    hasMargin: xmlCellFlag(cell.hasMargin),
    margins: readHwpxCellMargins(margins),
    protected: xmlCellFlag(cell.protect),
    editable: xmlCellFlag(cell.editable),
  });
}

/**
 * Encode neutral cell properties as distinct native HWPX attribute groups.
 *
 * Geometry, title-cell ownership and border references remain the caller's
 * destination properties rather than being copied from another source cell.
 * @param {unknown} value - Complete original neutral cell properties.
 * @returns {{cell:Record<string,string>;list:Record<string,string>;margins:NativeCellMargins}} Original native XML attribute groups.
 * @throws {TypeError|RangeError} If source metadata is malformed.
 * @example
 * hwpxCellProperties(nativeCellProperties()).list.vertAlign; // 'CENTER'
 */
export function hwpxCellProperties(value: unknown): {
  cell: Record<string, string>;
  list: Record<string, string>;
  margins: NativeCellMargins;
} {
  /** Validation supplies independent owned source fields before any XML is changed. */
  const properties = nativeCellProperties(value);
  return {
    cell: {
      hasMargin: String(Number(properties.hasMargin)),
      protect: String(Number(properties.protected)),
      editable: String(Number(properties.editable)),
    },
    list: {
      textDirection: TEXT_DIRECTIONS[properties.textDirection],
      lineWrap: LINE_WRAPS[properties.lineWrap],
      vertAlign: VERTICAL_ALIGNMENTS[properties.verticalAlign],
    },
    margins: properties.margins,
  };
}
