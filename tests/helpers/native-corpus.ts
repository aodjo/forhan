/** Required reference data is independently authored and accepted by the original native application. */
const NATIVE_CORPUS_NAMES = new Set([
  "sample.hwp",
  "sample.hwpx",
  "rich.hwp",
  "rich.hwpx",
  "table.hwp",
  "table.hwpx",
  "image.hwp",
  "image.hwpx",
  "hyperlink-native.hwp",
  "hyperlink-native.hwpx",
  "lists.hwp",
  "lists.hwpx",
  "blank.hwp",
  "blank.hwpx",
  "pattern.png",
  "manifest.json",
  "source.json",
]);

/**
 * Locate one required checked-in native compatibility fixture.
 *
 * Module-relative URLs work on Windows, macOS and any working directory.
 * Missing reference data fails the caller's read instead of silently skipping
 * native compatibility assertions. Only declared flat corpus names are valid.
 * @param {string} name - Exact declared native fixture or metadata filename.
 * @returns {URL} Portable required source fixture URL.
 * @throws {RangeError} If the name is not a declared corpus entry.
 * @example
 * readFileSync(nativeCorpusFixture('sample.hwp')); // No installed Hancom or ignored research folder is required.
 */
export function nativeCorpusFixture(name: string): URL {
  if (!NATIVE_CORPUS_NAMES.has(name))
    throw new RangeError("Unknown native compatibility corpus entry.");
  return new URL("../fixtures/native-corpus/" + name, import.meta.url);
}
