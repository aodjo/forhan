/** Unicode script-block ranges identify at least one mapped glyph without claiming complete language coverage. */
export const FONT_SCRIPT_RANGES = [
  [
    [0x1100, 0x11ff],
    [0x3130, 0x318f],
    [0xa960, 0xa97f],
    [0xac00, 0xd7af],
    [0xd7b0, 0xd7ff],
  ],
  [
    [0x20, 0x024f],
    [0x1e00, 0x1eff],
  ],
  [
    [0x2e80, 0x2fff],
    [0x3400, 0x4dbf],
    [0x4e00, 0x9fff],
    [0xf900, 0xfaff],
    [0x20000, 0x3ffff],
  ],
  [
    [0x3040, 0x30ff],
    [0x31f0, 0x31ff],
    [0xff66, 0xff9f],
  ],
  [
    [0x370, 0x52f],
    [0x590, 0x10ff],
    [0x1200, 0x1dff],
    [0xa000, 0xa8ff],
  ],
  [
    [0x2000, 0x2bff],
    [0x1f000, 0x1faff],
  ],
] as const;
/** Bounded font-table reader used by browser blobs and independent binary fixtures. */
export interface FontTableSource {
  size: number;
  /**
   * Read a bounded slice from the local font container.
   *
   * The caller supplies byte offsets rather than filesystem paths. Reads must
   * return the requested number of bytes or reject without returning partial data.
   * @async
   * @param {number} offset - Absolute byte offset in the SFNT container.
   * @param {number} length - Number of bytes to read.
   * @returns {Promise<Uint8Array>} Exact selected font-table bytes.
   * @throws {Error} If the requested slice cannot be read.
   * @example
   * await source.read(0, 12); // SFNT offset-table bytes.
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}
/** Localized face label and sampled native-language support, with no font binary retained. */
export interface LocalFontMetadata {
  label: string;
  aliases: string[];
  scripts: boolean[] | null;
  decorative: boolean | null;
}
/** Required metadata table size limit, independent of the full font's outline size. */
const MAX_METADATA_TABLE = 8 * 1024 * 1024;

/**
 * Validate a byte range before inspecting an installed font's metadata.
 *
 * Local fonts can still contain corrupt offsets. Integer arithmetic is checked
 * before any DataView access or browser Blob allocation.
 * @param {number} offset - Requested byte offset.
 * @param {number} length - Requested byte count.
 * @param {number} size - Available container length.
 * @returns {void} Completes when the entire range is present.
 * @throws {RangeError} If offsets or bounds are invalid.
 * @example
 * fontRange(0, 12, 100); // Valid SFNT header slice.
 */
function fontRange(offset: number, length: number, size: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > size
  )
    throw new RangeError("Local font metadata range is invalid.");
}

/**
 * Decode the Unicode name records relevant to a local family label.
 *
 * Windows and Unicode platforms use big-endian UTF-16. Other encodings are
 * ignored rather than guessed, and invalid/control-only names remain absent.
 * @param {Uint8Array} bytes - Complete native name table.
 * @param {string} family - Canonical browser family used as the fallback label.
 * @returns {{label: string, aliases: string[], matched: boolean}} Korean label, searchable aliases and canonical family-match result.
 * @throws {RangeError} If the name table is structurally truncated.
 * @example
 * // HCR Batang's native Korean name becomes the visible 함초롬바탕 label.
 */
function fontNames(
  bytes: Uint8Array,
  family: string,
): { label: string; aliases: string[]; matched: boolean } {
  fontRange(0, 6, bytes.length);
  /** Big-endian name table header and fixed records. */
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /** Name record count and shared string-storage base. */
  const count = view.getUint16(2),
    base = view.getUint16(4);
  fontRange(6, count * 12, bytes.length);
  /** Windows locale IDs and OpenType version-one language tags can both identify Korean names. */
  const koreanLanguages = new Set<number>([0x412]);
  if (view.getUint16(0) === 1) {
    /** Version-one language-tag records follow the fixed native name-record array. */
    const at = 6 + count * 12;
    fontRange(at, 2, bytes.length);
    /** Each language tag has a length/offset pair relative to the shared string storage. */
    const tags = view.getUint16(at);
    fontRange(at + 2, tags * 4, bytes.length);
    for (let index = 0; index < tags; index++) {
      /** Selected UTF-16 language tag has its own bounded shared-storage range. */
      const length = view.getUint16(at + 2 + index * 4),
        offset = base + view.getUint16(at + 4 + index * 4);
      fontRange(offset, length, bytes.length);
      if (length % 2) continue;
      let tag = "";
      for (let cursor = offset; cursor < offset + length; cursor += 2)
        tag += String.fromCharCode(view.getUint16(cursor));
      if (/^ko(?:-|$)/i.test(tag)) koreanLanguages.add(0x8000 + index);
    }
  } else if (view.getUint16(0) !== 0)
    throw new RangeError("Local font naming-table version is unsupported.");
  /** Candidate family records remain scoped by the native name identifier. */
  const records: { id: number; language: number; text: string }[] = [];
  for (let index = 0; index < count; index++) {
    /** Fixed record position in the name table. */
    const at = 6 + index * 12;
    /** Only Unicode or Windows Unicode encodings can be decoded without platform guessing. */
    const platform = view.getUint16(at),
      encoding = view.getUint16(at + 2),
      language = view.getUint16(at + 4),
      id = view.getUint16(at + 6);
    if (
      (platform !== 0 && platform !== 3) ||
      (platform === 3 && encoding !== 0 && encoding !== 1 && encoding !== 10) ||
      (id !== 1 && id !== 16)
    )
      continue;
    /** Selected UTF-16 byte range is independently bounded inside this table. */
    const length = view.getUint16(at + 8),
      offset = base + view.getUint16(at + 10);
    fontRange(offset, length, bytes.length);
    if (length % 2) continue;
    let text = "";
    for (let cursor = offset; cursor < offset + length; cursor += 2)
      text += String.fromCharCode(view.getUint16(cursor));
    text = text.trim();
    if (text && !/[\u0000-\u001f]/.test(text))
      records.push({ id, language, text });
  }
  /** Stable browser name normalization is used only for matching, never for document substitution. */
  const canonical = family.normalize("NFC").toLowerCase();
  let id = 16;
  let matching = false;
  for (/** A matching canonical name chooses the corresponding localized family identifier. */
  const record of records)
    if (record.text.normalize("NFC").toLowerCase() === canonical) {
      if (!matching || record.id === 16) id = record.id;
      matching = true;
    }
  /** All actual family aliases remain searchable without turning them into CSS values. */
  const aliases = [family];
  let label = family;
  for (/** Localized Korean names are preferred only within the matched family identifier. */
  const record of records) {
    if (matching && record.id !== id) continue;
    if (!aliases.includes(record.text)) aliases.push(record.text);
    if (koreanLanguages.has(record.language) && /[가-힣]/.test(record.text))
      label = record.text;
  }
  return { label, aliases, matched: matching };
}

/**
 * Find a real nonzero glyph within one Unicode block intersection.
 *
 * TrueType BMP format 4 and full-Unicode format 12 use different segment layouts.
 * Missing glyph zero remains unsupported, including ranges with explicit holes.
 * @param {DataView} view - Complete cmap table view.
 * @param {number} offset - Start of a selected Unicode mapping subtable.
 * @param {number} codepoint - Inclusive requested Unicode range start.
 * @param {number} last - Inclusive requested Unicode range end.
 * @returns {number} First available nonzero glyph, or zero when the range has no mapping.
 * @throws {RangeError} If a mapping's structural ranges are malformed.
 * @example
 * // A font advertising a Unicode range can still lack the sampled Hangul glyph.
 */
function fontGlyph(
  view: DataView,
  offset: number,
  codepoint: number,
  last: number,
): number {
  fontRange(offset, 2, view.byteLength);
  /** Native subtable format controls the interpretation of all following offsets. */
  const format = view.getUint16(offset);
  if (format === 12) {
    fontRange(offset, 16, view.byteLength);
    /** Format-12 groups are ordered full-Unicode ranges. */
    const length = view.getUint32(offset + 4),
      count = view.getUint32(offset + 12);
    fontRange(offset, length, view.byteLength);
    fontRange(16, count * 12, length);
    let low = 0,
      high = count - 1;
    while (low <= high) {
      /** Binary search avoids scanning a large CJK mapping for every language probe. */
      const middle = (low + high) >>> 1,
        at = offset + 16 + middle * 12,
        end = view.getUint32(at + 4);
      if (codepoint > end) low = middle + 1;
      else high = middle - 1;
    }
    for (let index = low; index < count; index++) {
      /** Ordered full-Unicode group overlapping the requested script block. */
      const at = offset + 16 + index * 12,
        start = view.getUint32(at),
        end = view.getUint32(at + 4);
      if (start > end)
        throw new RangeError("Local font cmap group range is invalid.");
      if (start > last) break;
      /** Nonzero sequential glyph mappings retain an explicit single-glyph zero hole. */
      const first = Math.max(codepoint, start),
        final = Math.min(last, end),
        glyph = view.getUint32(at + 8) + first - start;
      if (first <= final) {
        if (glyph) return glyph;
        if (first < final) return 1;
      }
    }
  } else if (format === 4 && codepoint <= 0xffff) {
    fontRange(offset, 14, view.byteLength);
    /** Segment arrays share a native subtable length and ordered BMP boundaries. */
    const length = view.getUint16(offset + 2),
      count = view.getUint16(offset + 6) / 2;
    if (!Number.isInteger(count))
      throw new RangeError("Local font cmap segment count is invalid.");
    fontRange(offset, length, view.byteLength);
    fontRange(14, count * 8 + 2, length);
    for (let segment = 0; segment < count; segment++) {
      /** End, start, delta and relative-address entries for the selected BMP segment. */
      const end = view.getUint16(offset + 14 + segment * 2),
        start = view.getUint16(offset + 16 + count * 2 + segment * 2),
        delta = view.getInt16(offset + 16 + count * 4 + segment * 2),
        rangeAt = offset + 16 + count * 6 + segment * 2,
        range = view.getUint16(rangeAt);
      if (start > end)
        throw new RangeError("Local font cmap segment range is invalid.");
      if (codepoint > end) continue;
      if (last < start) break;
      /** Only actual segment/block intersections need glyph-map inspection. */
      const first = Math.max(codepoint, start),
        final = Math.min(last, end);
      if (!range) {
        /** A sequential BMP mapping can contain one wrapped glyph-zero entry. */
        const glyph = (first + delta) & 0xffff;
        if (glyph) return glyph;
        if (first < final) return (first + 1 + delta) & 0xffff;
        continue;
      }
      /** Relative addressing can land after the range-offset array in glyphIdArray. */
      const glyphAt = rangeAt + range + (first - start) * 2;
      fontRange(glyphAt - offset, (final - first + 1) * 2, length);
      for (let at = glyphAt; at <= glyphAt + (final - first) * 2; at += 2) {
        /** Explicit zero remains missing even when the segment has a nonzero delta. */
        const glyph = view.getUint16(at);
        if (glyph && (glyph + delta) & 0xffff) return (glyph + delta) & 0xffff;
      }
    }
  }
  return 0;
}

/**
 * Detect mapped native script blocks from an installed font's real Unicode cmap.
 *
 * Results establish at least one real mapped glyph, not complete language coverage.
 * Unicode platform subtables take priority over legacy symbol encodings.
 * @param {Uint8Array} bytes - Complete cmap table.
 * @returns {boolean[] | null} Six script-block support results, or unknown for unsupported mapping formats.
 * @throws {RangeError} If the mapping directory or a selected subtable is malformed.
 * @example
 * // Western fonts remain available for Latin without claiming Hangul support.
 */
function fontScripts(bytes: Uint8Array): boolean[] | null {
  fontRange(0, 4, bytes.length);
  /** Big-endian cmap table contains one directory entry per encoded subtable. */
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    count = view.getUint16(2);
  fontRange(4, count * 8, bytes.length);
  /** Distinct Unicode mappings can each contribute nonzero sample glyphs. */
  const offsets = new Set<number>();
  for (let index = 0; index < count; index++) {
    /** Platform/encoding pair selects Unicode BMP or full-Unicode mapping. */
    const at = 4 + index * 8,
      platform = view.getUint16(at),
      encoding = view.getUint16(at + 2);
    if (
      platform === 0 ||
      (platform === 3 && (encoding === 1 || encoding === 10))
    )
      offsets.add(view.getUint32(at + 4));
  }
  /** No sample is inferred from a font's marketing name or declared OS/2 range bits. */
  const support = Array<boolean>(FONT_SCRIPT_RANGES.length).fill(false);
  let supported = false;
  for (/** Unicode cmap subtable contributing actual glyph mappings. */
  const offset of offsets) {
    fontRange(offset, 2, bytes.length);
    if (view.getUint16(offset) !== 4 && view.getUint16(offset) !== 12) continue;
    supported = true;
    for (let slot = 0; slot < FONT_SCRIPT_RANGES.length; slot++)
      for (/** Whole script-block intersections retain subset, old-Hangul and supplementary CJK-only faces. */
      const [first, last] of FONT_SCRIPT_RANGES[slot])
        support[slot] ||= fontGlyph(view, offset, first, last) !== 0;
  }
  return supported ? support : null;
}

/**
 * Read a standalone face's bounded metadata directory within a font container.
 *
 * Collection faces use a nonzero offset-table location while table records keep
 * absolute whole-file offsets. Unneeded outline tables are never requested.
 * @async
 * @param {FontTableSource} source - Bounded local font container.
 * @param {number} offset - Absolute location of the selected SFNT offset table.
 * @returns {Promise<Map<string, {offset: number, length: number}>>} Bounded name, cmap and optional OS/2 table locations.
 * @throws {RangeError} If a metadata range is invalid or its required table is absent.
 * @example
 * await readFontDirectory(source, 0); // Standalone SFNT metadata table locations.
 */
async function readFontDirectory(
  source: FontTableSource,
  offset: number,
): Promise<Map<string, { offset: number; length: number }>> {
  fontRange(offset, 12, source.size);
  /** SFNT signatures distinguish standalone TrueType and CFF wrappers from TTC/WOFF containers. */
  const header = await source.read(offset, 12),
    view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  fontRange(0, 12, header.length);
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(view.getUint32(0)))
    throw new RangeError("Local font metadata container is unsupported.");
  /** Font-table directory is small even when the actual CJK outline data is large. */
  const count = view.getUint16(4);
  fontRange(offset + 12, count * 16, source.size);
  /** Individual entries contain absolute offsets within the browser's SFNT wrapper. */
  const directory = await source.read(offset + 12, count * 16),
    tables = new Map<string, { offset: number; length: number }>();
  fontRange(0, count * 16, directory.length);
  /** Native directory entry view retains the selected typed-array offset. */
  const entries = new DataView(
    directory.buffer,
    directory.byteOffset,
    directory.byteLength,
  );
  for (let index = 0; index < count; index++) {
    /** Four-byte ASCII table identifier. */
    const at = index * 16,
      tag = String.fromCharCode(...directory.subarray(at, at + 4));
    if (tag !== "name" && tag !== "cmap" && tag !== "OS/2") continue;
    /** Required metadata slice remains bounded independently of the source font size. */
    const offset = entries.getUint32(at + 8),
      length = entries.getUint32(at + 12);
    fontRange(offset, length, source.size);
    if (length > MAX_METADATA_TABLE)
      throw new RangeError("Local font metadata table is too large.");
    tables.set(tag, { offset, length });
  }
  return tables;
}

/**
 * Read a standalone or collection face's localized names and sampled scripts.
 *
 * TrueType collections keep table offsets relative to the whole collection.
 * The correct member is selected by its actual canonical family name; a missing
 * match stays unclassified rather than silently borrowing the first face.
 * Only metadata tables are read, and no font outlines are retained or exported.
 * @async
 * @param {FontTableSource} source - Bounded local SFNT or TTC container.
 * @param {string} family - Canonical browser family selecting the correct face.
 * @returns {Promise<LocalFontMetadata>} Localized label, aliases, sampled scripts and decoration class.
 * @throws {RangeError} If the container, required metadata or selected collection face is invalid.
 * @example
 * await readLocalFontMetadata(source, 'BatangChe'); // Selects its own TTC member.
 */
export async function readLocalFontMetadata(
  source: FontTableSource,
  family: string,
): Promise<LocalFontMetadata> {
  fontRange(0, 12, source.size);
  /** Collection headers and standalone SFNT headers share the initial signature position. */
  const header = await source.read(0, 12),
    view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  fontRange(0, 12, header.length);
  /** One standalone face or a bounded set of absolute collection member offsets. */
  const offsets: number[] = [];
  if (view.getUint32(0) === 0x74746366) {
    /** Native collection member count is bounded before allocating or scanning its directory. */
    const count = view.getUint32(8);
    if (!count || count > 1024)
      throw new RangeError("Local font collection count is invalid.");
    fontRange(12, count * 4, source.size);
    /** TTC offsets point to individual SFNT offset tables within the full source blob. */
    const directory = await source.read(12, count * 4),
      entries = new DataView(
        directory.buffer,
        directory.byteOffset,
        directory.byteLength,
      );
    fontRange(0, count * 4, directory.length);
    for (let index = 0; index < count; index++)
      offsets.push(entries.getUint32(index * 4));
  } else offsets.push(0);
  /** Selected member metadata never inherits another collection face's names or glyph map. */
  let tables: Map<string, { offset: number; length: number }> | null = null;
  let names: { label: string; aliases: string[]; matched: boolean } | null =
    null;
  for (/** Candidate collection face or the sole standalone offset table. */
  const offset of offsets) {
    /** Candidate directory retains absolute whole-container table offsets. */
    const candidate = await readFontDirectory(source, offset),
      name = candidate.get("name");
    if (!name) continue;
    /** Localized source names also prove which member the browser's family identifies. */
    const bytes = await source.read(name.offset, name.length),
      resolved = fontNames(bytes, family);
    if (offsets.length === 1 || resolved.matched) {
      tables = candidate;
      names = resolved;
      break;
    }
  }
  if (!tables || !names)
    throw new RangeError("Local font collection family was not found.");
  /** Both required metadata tables must be present before a face is classified. */
  const name = tables.get("name"),
    cmap = tables.get("cmap");
  if (!name || !cmap)
    throw new RangeError("Local font name or Unicode map is missing.");
  /** Independent table reads avoid downloading, exporting or persisting any font binary. */
  const cmapBytes = await source.read(cmap.offset, cmap.length);
  fontRange(0, cmap.length, cmapBytes.length);
  /** Optional PANOSE family type identifies handwritten, decorative and symbol faces. */
  const os2 = tables.get("OS/2");
  let decorative: boolean | null = null;
  if (os2 && os2.length >= 42) {
    /** Only the fixed prefix containing PANOSE is needed for font-category classification. */
    const classification = await source.read(os2.offset, 42);
    fontRange(0, 42, classification.length);
    decorative = classification[32] >= 3 && classification[32] <= 5;
  }
  return {
    label: names.label,
    aliases: names.aliases,
    scripts: fontScripts(cmapBytes),
    decorative,
  };
}
