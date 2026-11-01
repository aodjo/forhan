/**
 * Encode a literal Unicode family name as OpenType big-endian UTF-16.
 *
 * These synthetic metadata strings contain no glyph outlines or proprietary font data.
 * @param {string} text - Native family name for a fixture record.
 * @returns {Uint8Array} Big-endian UTF-16 name bytes.
 * @example
 * fontFixtureName('검증 글꼴');
 */
function fontFixtureName(text: string): Uint8Array {
  /** Independently encoded UTF-16 string buffer. */
  const bytes = new Uint8Array(text.length * 2),
    view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index++)
    view.setUint16(index * 2, text.charCodeAt(index));
  return bytes;
}

/**
 * Build an independent synthetic SFNT metadata fixture.
 *
 * Unicode cmap format 4 contains an indirect Latin glyph and an explicit missing
 * symbol glyph with nonzero delta. Format 12 contributes a Hangul glyph and a
 * missing Japanese glyph. A large dummy glyf range detects accidental outline reads.
 * @param {string} [family="Fixture Font"] - Canonical browser family name.
 * @param {string} [label="검증 글꼴"] - Localized native Korean label.
 * @param {boolean} [hangul=true] - Whether the synthetic face maps the Hangul sample glyph.
 * @param {number} [outlineBytes=1048576] - Unread dummy outline size; browser interaction fixtures can use zero.
 * @param {boolean} [languageTag=false] - Whether Korean uses an OpenType version-one language tag.
 * @returns {Uint8Array} Synthetic standalone font metadata and unread outline padding.
 * @example
 * const bytes = localFontFixture(); // No real font binary is included.
 */
export function localFontFixture(
  family = "Fixture Font",
  label = "검증 글꼴",
  hangul = true,
  outlineBytes = 1024 * 1024,
  languageTag = false,
): Uint8Array {
  /** Name table stores English and Korean Windows Unicode family records. */
  const english = fontFixtureName(family),
    korean = fontFixtureName(label),
    tag = languageTag ? fontFixtureName("ko-KR") : new Uint8Array(),
    base = languageTag ? 36 : 30,
    name = new Uint8Array(base + english.length + korean.length + tag.length),
    names = new DataView(name.buffer);
  names.setUint16(0, languageTag ? 1 : 0);
  names.setUint16(2, 2);
  names.setUint16(4, base);
  for (let index = 0; index < 2; index++) {
    /** Fixed 12-byte native name record. */
    const at = 6 + index * 12;
    names.setUint16(at, 3);
    names.setUint16(at + 2, 1);
    names.setUint16(at + 4, index ? (languageTag ? 0x8000 : 0x412) : 0x409);
    names.setUint16(at + 6, 1);
    names.setUint16(at + 8, index ? korean.length : english.length);
    names.setUint16(at + 10, index ? english.length : 0);
  }
  name.set(english, base);
  name.set(korean, base + english.length);
  if (languageTag) {
    names.setUint16(30, 1);
    names.setUint16(32, tag.length);
    names.setUint16(34, english.length + korean.length);
    name.set(tag, base + english.length + korean.length);
  }
  /** Format-4 segments use indirect glyph IDs plus a valid terminal sentinel. */
  const bmp = new Uint8Array(44),
    b = new DataView(bmp.buffer);
  b.setUint16(0, 4);
  b.setUint16(2, bmp.length);
  b.setUint16(6, 6);
  for (let index = 0; index < 3; index++) {
    /** Latin A, reference mark and mandatory terminal segment boundaries. */
    const scalar = [0x41, 0x203b, 0xffff][index];
    b.setUint16(14 + index * 2, scalar);
    b.setUint16(22 + index * 2, scalar);
    b.setInt16(28 + index * 2, [3, 7, 1][index]);
    b.setUint16(34 + index * 2, index < 2 ? 6 : 0);
  }
  b.setUint16(40, 5);
  b.setUint16(42, 0);
  /** Format-12 groups remain sorted and deliberately include an actual glyph-zero hole. */
  const full = new Uint8Array(40),
    f = new DataView(full.buffer);
  f.setUint16(0, 12);
  f.setUint32(4, 40);
  f.setUint32(12, 2);
  f.setUint32(16, 0x3042);
  f.setUint32(20, 0x3042);
  f.setUint32(24, 0);
  f.setUint32(28, 0xac00);
  f.setUint32(32, 0xac00);
  f.setUint32(36, hangul ? 9 : 0);
  /** Two independent Unicode subtables combine their nonzero sample mappings. */
  const cmap = new Uint8Array(20 + bmp.length + full.length),
    c = new DataView(cmap.buffer);
  c.setUint16(2, 2);
  c.setUint16(4, 3);
  c.setUint16(6, 1);
  c.setUint32(8, 20);
  c.setUint16(12, 3);
  c.setUint16(14, 10);
  c.setUint32(16, 20 + bmp.length);
  cmap.set(bmp, 20);
  cmap.set(full, 20 + bmp.length);
  /** Decorative PANOSE family classification sits in the documented fixed OS/2 prefix. */
  const os2 = new Uint8Array(42);
  os2[32] = 4;
  /** SFNT directory has separate native metadata and a large unread glyph-outline range. */
  const tables: [string, Uint8Array][] = [
    ["name", name],
    ["cmap", cmap],
    ["OS/2", os2],
    ["glyf", new Uint8Array(outlineBytes)],
  ];
  let size = 12 + tables.length * 16;
  for (/** Independent native table aligned to the required four-byte boundary. */
  const [, table] of tables)
    size = (size + table.length + 3) & ~3;
  /** Complete synthetic standalone container. */
  const bytes = new Uint8Array(size),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x10000);
  view.setUint16(4, tables.length);
  let offset = 12 + tables.length * 16;
  for (let index = 0; index < tables.length; index++) {
    /** Directory record and its independently constructed table bytes. */
    const [tag, table] = tables[index],
      at = 12 + index * 16;
    for (let character = 0; character < 4; character++)
      bytes[at + character] = tag.charCodeAt(character);
    view.setUint32(at + 8, offset);
    view.setUint32(at + 12, table.length);
    bytes.set(table, offset);
    offset = (offset + table.length + 3) & ~3;
  }
  return bytes;
}

/**
 * Build a two-face TTC whose later member has a different native family and cmap.
 *
 * All member table offsets are rewritten relative to the whole collection, as
 * required by OpenType. The decoder must select by family rather than using face zero.
 * @returns {Uint8Array} Independent two-member synthetic font collection.
 * @example
 * localFontCollectionFixture(); // Second face is Second Font / 둘째 글꼴.
 */
export function localFontCollectionFixture(): Uint8Array {
  /** Distinct member names make incorrect first-face borrowing observable. */
  const faces = [
    localFontFixture("First Font", "첫째 글꼴"),
    localFontFixture("Second Font", "둘째 글꼴"),
  ];
  /** TTC header contains two absolute member offset-table locations. */
  const bytes = new Uint8Array(20 + faces[0].length + faces[1].length),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x74746366);
  view.setUint32(4, 0x10000);
  view.setUint32(8, 2);
  let offset = 20;
  for (let index = 0; index < faces.length; index++) {
    view.setUint32(12 + index * 4, offset);
    bytes.set(faces[index], offset);
    /** Each copied member's native directory now points to whole-collection table positions. */
    const count = view.getUint16(offset + 4);
    for (let table = 0; table < count; table++) {
      /** Table-location field inside the selected member's directory. */
      const at = offset + 12 + table * 16 + 8;
      view.setUint32(at, view.getUint32(at) + offset);
    }
    offset += faces[index].length;
  }
  return bytes;
}
