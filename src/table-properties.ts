/** Original table page modes retain their independently observed HWPX enumeration names. */
const TABLE_PAGE_MODES = ["NONE", "TABLE", "CELL"] as const;
/** Only original page-mode and header-repeat bits are replaced in an HWP table definition. */
const TABLE_PROPERTY_FLAGS = 7;
/** Native physical source distances retain the same signed range as table and cell margins. */
const MAX_TABLE_DISTANCE = 0x7fffffff;

/** Independent table properties exclude cell appearance, dimensions and common object positioning. */
export interface NativeTableProperties {
  pageBreak: 0 | 1 | 2;
  repeatHeader: boolean;
  cellSpacing: number;
}

/**
 * Normalize independent native table properties without coercing source values.
 *
 * Missing new metadata receives actual native defaults. Present records must
 * retain explicit false, zero and all three distinct source page modes.
 * @param {unknown} [value=undefined] - Complete original or explicitly edited table properties.
 * @returns {NativeTableProperties} Fresh validated native table properties.
 * @throws {TypeError|RangeError} If any explicitly supplied source property is invalid.
 * @example
 * nativeTableProperties().pageBreak; // 2, the original CELL mode.
 */
export function nativeTableProperties(value?: unknown): NativeTableProperties {
  if (value === undefined || value === null)
    return { pageBreak: 2, repeatHeader: true, cellSpacing: 0 };
  if (typeof value !== "object" || Array.isArray(value))
    throw new TypeError("표 속성 정보가 올바르지 않습니다.");
  /** Every source property is validated independently instead of merged with truthy defaults. */
  const properties = value as Record<string, unknown>;
  if (
    properties.pageBreak !== 0 &&
    properties.pageBreak !== 1 &&
    properties.pageBreak !== 2
  )
    throw new RangeError("표의 쪽 나눔 방식이 올바르지 않습니다.");
  if (typeof properties.repeatHeader !== "boolean")
    throw new TypeError("표의 제목 줄 반복 값이 올바르지 않습니다.");
  if (
    typeof properties.cellSpacing !== "number" ||
    !Number.isInteger(properties.cellSpacing) ||
    properties.cellSpacing < 0 ||
    properties.cellSpacing > MAX_TABLE_DISTANCE
  )
    throw new RangeError("표의 셀 간격이 올바르지 않습니다.");
  return {
    pageBreak: properties.pageBreak,
    repeatHeader: properties.repeatHeader,
    cellSpacing: properties.cellSpacing,
  };
}

/**
 * Validate an original unsigned native table-definition flag word.
 *
 * Unknown original bits remain data rather than being dropped or interpreted.
 * @param {unknown} [value=0] - Original native flag word or absent fresh metadata.
 * @returns {number} Exact unsigned source flags.
 * @throws {RangeError} If explicit flags are not an unsigned thirty-two-bit integer.
 * @example
 * nativeTableFlags(6); // Original CELL mode with header repetition.
 */
export function nativeTableFlags(value: unknown = 0): number {
  if (value === undefined || value === null) return 0;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  )
    throw new RangeError("표의 원본 속성 플래그가 올바르지 않습니다.");
  return value;
}

/**
 * Decode actual HWP table-definition flags and independent cell spacing.
 *
 * The original low two bits retain three page modes and bit two controls
 * header repetition. Cell spacing is an independent unsigned source field.
 * @param {number} flags - Original unsigned table-definition flags.
 * @param {number} spacing - Original physical cell spacing in HWP units.
 * @returns {NativeTableProperties} Validated independent native table properties.
 * @throws {TypeError|RangeError} If the native source values are unsupported or malformed.
 * @example
 * readHwpTableProperties(5,37); // TABLE mode, repeated headers and 37-unit spacing.
 */
export function readHwpTableProperties(
  flags: number,
  spacing: number,
): NativeTableProperties {
  return nativeTableProperties({
    pageBreak: nativeTableFlags(flags) & 3,
    repeatHeader: !!(flags & 4),
    cellSpacing: spacing,
  });
}

/**
 * Encode known native table flags without erasing unrelated original bits.
 *
 * Only the three independently observed property bits are replaced.
 * @param {unknown} value - Complete neutral native table properties.
 * @param {unknown} [original=0] - Original raw unsigned flags, if retained.
 * @returns {number} Native unsigned flags retaining unknown original metadata.
 * @throws {TypeError|RangeError} If represented or original properties are invalid.
 * @example
 * hwpTableFlags({pageBreak:0,repeatHeader:false,cellSpacing:0},0x40000006); // 0x40000000
 */
export function hwpTableFlags(value: unknown, original: unknown = 0): number {
  /** Original reserved bits remain independent from the explicit neutral properties. */
  const properties = nativeTableProperties(value);
  return (
    ((nativeTableFlags(original) & ~TABLE_PROPERTY_FLAGS) |
      properties.pageBreak |
      (properties.repeatHeader ? 4 : 0)) >>>
    0
  );
}

/**
 * Require an exact table spacing value representable by HWP's native field.
 *
 * Wider HWPX physical values cannot be silently truncated into sixteen bits.
 * @param {unknown} value - Complete native table properties.
 * @returns {number} Exact native unsigned sixteen-bit cell spacing.
 * @throws {TypeError|RangeError} If properties are invalid or spacing exceeds HWP bounds.
 * @example
 * hwpTableSpacing({pageBreak:2,repeatHeader:true,cellSpacing:37}); // 37
 */
export function hwpTableSpacing(value: unknown): number {
  /** Native HWPX and FHN values remain intact when HWP cannot represent them. */
  const spacing = nativeTableProperties(value).cellSpacing;
  if (spacing > 0xffff)
    throw new RangeError("셀 간격이 HWP 저장 범위를 벗어났습니다.");
  return spacing;
}

/**
 * Decode original HWPX table attributes without substituting unknown modes.
 *
 * Only absent attributes receive native defaults; explicit false and zero
 * values retain their independent meaning.
 * @param {Record<string,string>} attributes - Actual native table attributes.
 * @returns {NativeTableProperties} Validated independent original properties.
 * @throws {TypeError|RangeError} If an explicitly supplied native value is unsupported.
 * @example
 * readHwpxTableProperties({pageBreak:'NONE',repeatHeader:'0',cellSpacing:'37'});
 */
export function readHwpxTableProperties(
  attributes: Record<string, string>,
): NativeTableProperties {
  /** Native XML enum names are independent from interface captions and source numeric codes. */
  const mode =
    attributes.pageBreak === undefined
      ? 2
      : TABLE_PAGE_MODES.indexOf(
          attributes.pageBreak as (typeof TABLE_PAGE_MODES)[number],
        );
  if (
    attributes.repeatHeader !== undefined &&
    attributes.repeatHeader !== "0" &&
    attributes.repeatHeader !== "1"
  )
    throw new TypeError("표의 제목 줄 반복 XML 값이 올바르지 않습니다.");
  if (
    attributes.cellSpacing !== undefined &&
    !/^\d+$/u.test(attributes.cellSpacing)
  )
    throw new TypeError("표의 셀 간격 XML 값이 올바르지 않습니다.");
  return nativeTableProperties({
    pageBreak: mode,
    repeatHeader:
      attributes.repeatHeader === undefined || attributes.repeatHeader === "1",
    cellSpacing:
      attributes.cellSpacing === undefined ? 0 : Number(attributes.cellSpacing),
  });
}

/**
 * Serialize neutral table properties as literal original native XML attributes.
 *
 * Cell data, table margins, geometry and common object attributes remain the
 * caller's independent source properties.
 * @param {unknown} value - Complete represented native table properties.
 * @returns {Record<string,string>} Native page-mode, repeat and spacing attributes.
 * @throws {TypeError|RangeError} If represented source properties are invalid.
 * @example
 * hwpxTableProperties(nativeTableProperties()).pageBreak; // 'CELL'
 */
export function hwpxTableProperties(value: unknown): Record<string, string> {
  /** Validation happens before any actual native XML record is changed. */
  const properties = nativeTableProperties(value);
  return {
    pageBreak: TABLE_PAGE_MODES[properties.pageBreak],
    repeatHeader: String(Number(properties.repeatHeader)),
    cellSpacing: String(properties.cellSpacing),
  };
}

/**
 * Recover properties from an older retained HWPX shell only when neutral metadata is absent.
 *
 * Older FHN files retained original XML without representing these fields in
 * their editor nodes. Explicit current metadata always wins over the old shell.
 * @param {unknown} value - Current explicit native properties or absent older metadata.
 * @param {string|undefined} xml - Actual retained original table XML, if present.
 * @returns {NativeTableProperties} Current explicit values or independently retained original properties.
 * @throws {TypeError|RangeError} If explicitly represented or retained native values are invalid.
 * @example
 * retainedTableProperties(null,'<hp:tbl pageBreak="NONE" repeatHeader="0" cellSpacing="37"/>');
 */
export function retainedTableProperties(
  value: unknown,
  xml: string | undefined,
): NativeTableProperties {
  if ((value !== undefined && value !== null) || !xml)
    return nativeTableProperties(value);
  /** Only the retained table's own opening tag can supply older source metadata. */
  const tag = /<(?:[A-Za-z_][\w.-]*:)?tbl\b[^>]*>/u.exec(xml)?.[0],
    attributes: Record<string, string> = {};
  if (!tag) return nativeTableProperties();
  for (/** These fixed native values do not contain authored markup or executable content. */ const match of tag.matchAll(
    /\b(pageBreak|repeatHeader|cellSpacing)="([^"]*)"/gu,
  ))
    attributes[match[1]] = match[2];
  return readHwpxTableProperties(attributes);
}
