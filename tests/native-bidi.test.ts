import test from "node:test";
import assert from "node:assert/strict";
import { nativeDirectionalRunEnds } from "../src/native-bidi.ts";

/**
 * Verify native mixed-direction glyph endings against independently generated native PDF runs.
 *
 * Original native PDF positions show that the Latin space before Arabic and
 * the first logical Arabic letter omit trailing tracking. The final Latin Z
 * remains the last visual glyph of its separate original directional run.
 * @returns {void} Confirms the literal native run endings without changing source order.
 * @example
 * // The first space and first Arabic letter belong to different native visual run endings.
 */
function verifyNativeMixedEndings(): void {
  /** Original native source retains logical source order and original UTF-16 offsets. */
  const text = "X العربية Z",
    ends = nativeDirectionalRunEnds(text);
  assert.deepEqual([...ends].sort(), [1, 2, 10].sort());
  assert.deepEqual([...nativeDirectionalRunEnds("X हिन्दी Z")], [9]);
}
test(
  "native directional endings retain actual Arabic and Indic PDF run boundaries",
  verifyNativeMixedEndings,
);

/**
 * Verify that spaces between original RTL words remain inside one resolved directional run.
 *
 * A script-name or per-word heuristic would suppress both word starts and the
 * interword space. Unicode embedding resolution preserves the complete run.
 * @returns {void} Confirms only the actual visual run endings are selected.
 * @example
 * // Internal Arabic word spaces retain their ordinary native tracking.
 */
function verifyWholeRtlRun(): void {
  /** One original RTL run includes its internal word space. */
  const text = "X العربية جميلة Z",
    ends = nativeDirectionalRunEnds(text);
  assert.equal(ends.has(1), true);
  assert.equal(ends.has(2), true);
  assert.equal(ends.has(text.indexOf("جميلة")), false);
  assert.equal(ends.has(text.indexOf(" جميلة")), false);
  assert.equal(ends.has(text.length - 1), true);
  assert.deepEqual([...nativeDirectionalRunEnds("العربية", "rtl")], [0]);
}
test(
  "native directional tracking retains internal Arabic spaces and explicit paragraph direction",
  verifyWholeRtlRun,
);

/**
 * Verify hard breaks, supplementary source and combining marks retain original offsets.
 *
 * Grapheme endings must never split a surrogate pair or mark sequence. A real
 * paragraph break starts an independent directional run in the next line.
 * @returns {void} Confirms complete original grapheme and paragraph ownership.
 * @example
 * // The final emoji remains one original UTF-16 source interval.
 */
function verifyOriginalGraphemeEndings(): void {
  assert.deepEqual([...nativeDirectionalRunEnds("A e\u0301")], [2]);
  assert.deepEqual([...nativeDirectionalRunEnds("A 👩‍💻")], [2]);
  assert.deepEqual([...nativeDirectionalRunEnds("A\nB")], [0, 2]);
  assert.deepEqual([...nativeDirectionalRunEnds("")], []);
  assert.deepEqual(
    new Set(nativeDirectionalRunEnds("X  ")),
    new Set([0, 1, 2]),
  );
}
test(
  "native directional endings preserve original graphemes, empty source and hard breaks",
  verifyOriginalGraphemeEndings,
);

/**
 * Verify native-labelled controls retain their actual neutral glyph boundary behavior.
 *
 * Actual native GUI captures and PDF matrices show LRI/RLI/FSI/PDI as visible
 * labelled glyphs. Their original code points remain unchanged while analysis
 * preserves tracking on the preceding space instead of treating it as an isolate.
 * @returns {void} Confirms native control positions without normalizing authored text.
 * @example
 * // The space before the native RLI label retains its ordinary tracking.
 */
function verifyNativeVisibleControls(): void {
  for (/** Each original opening control is displayed with its own native label. */ const control of [
    "\u2066",
    "\u2067",
    "\u2068",
  ]) {
    /** Original native source includes its own closing PDI label. */
    const source = "X " + control + "العربية\u2069 Z",
      ends = nativeDirectionalRunEnds(source);
    assert.equal(ends.has(1), false);
    assert.equal(ends.has(2), true);
    assert.equal(ends.has(3), true);
    assert.equal(ends.has(source.length - 1), true);
    assert.equal(source.codePointAt(2), control.codePointAt(0));
  }
}
test(
  "native directional endings retain labelled isolate-control glyph boundaries",
  verifyNativeVisibleControls,
);
