import type { JSONContent } from "@tiptap/core";
import {nativeTableProperties,readHwpxTableProperties,hwpxTableProperties} from '../table-properties.ts';
import {CELL_UNITS_PER_PIXEL,nativeColumnMeasurements,nativeCellDimension,type NativeColumnMeasurement} from '../cell-geometry.ts';
import {cellFieldName} from '../cell-field-name.ts';
import {readHwpxCellProperties,readHwpxCellMargins,hwpxCellProperties,nativeCellMargins} from '../cell-properties.ts';
import { characterDecoration, nativeDecorationPattern, NATIVE_LINE_PATTERNS, type CharacterDecoration, type DecorationKind } from "../character-decorations.ts";
import { characterShadow } from "../character-shadow.ts";
import { characterOutline, NATIVE_OUTLINE_TYPES } from "../character-outline.ts";
import { characterEmphasis, NATIVE_EMPHASIS_TYPES } from "../character-emphasis.ts";
import { normalizeColor } from "../colors.ts";
import { paragraphAlignment, hwpxParagraphAlignment } from '../paragraph-alignment.ts';
import { characterFonts, hasCharacterFonts } from "../character-fonts.ts";
import { nativeSpacingFlag } from "../font-space.ts";
import {readHwpxWordBreaks,hwpxWordBreaks} from '../paragraph-word-break.ts';
import {paragraphCondense,hwpxParagraphCondense} from '../paragraph-minimum-space.ts';
import {paragraphSnapToGrid} from '../paragraph-line-grid.ts';
import {sectionGridSettings,sectionGridDistance,type SectionGridSettings} from '../section-grid.ts';
import {retainNormalCharacterWeight,nativeHyperlinkAppearance} from '../character-defaults.ts';
import {
  CHARACTER_LANGUAGES,
  characterMetrics,
  hasCharacterMetrics,
  splitCharacterMetrics,
} from "../character-metrics.ts";
import {
  parseParagraphMeasure,
  decodeParagraphUrc,
  paragraphMeasureCss,
  type ParagraphMeasure,
} from "./paragraph-measures.ts";
import {
  defaultFontSize,
  nativeFontHeight,
  fixedLineHeightPoints,
} from "../formatting.ts";
/** An editor document node whose type is known after input validation. */
export interface EditorNode extends Omit<JSONContent, "type" | "content"> {
  type: string;
  content?: EditorNode[];
}
/** Physical page dimensions and margins expressed in millimetres. */
export interface HwpxPage extends SectionGridSettings {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Reserved header area added to the top margin before body text starts, in millimetres. */
  header?: number;
  /** Reserved footer area added to the bottom margin after body text ends, in millimetres. */
  footer?: number;
}
/** An ordered internal XML tree with normalized string attributes. */
interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text?: string;
}
/** The ordered-record representation supplied by the XML parser boundary. */
interface OrderedXmlRecord {
  ":@"?: Record<string, string>;
  [key: string]: unknown;
}
/** Original XML and editable state retained under a stable source identifier. */
interface RetainedNode {
  xml: string;
  original: EditorNode;
  section: number;
  shell?: string;
  object?: boolean;
  listKind?: string;
}
/** The original package path and namespace attributes of an imported section. */
interface RetainedSection {
  path: string;
  name: string;
  attrs: Record<string, string>;
}
/** An editable table cell positioned on its table's logical column grid. */
interface PositionedCell {
  c: EditorNode;
  start: number;
  cs: number;
  rs: number;
}
/** Positive intrinsic raster dimensions measured in CSS pixels. */
interface RasterDimensions {
  width: number;
  height: number;
}
/** A validated native hyperlink target and its portable editor attributes. */
interface NativeHyperlink {
  href: string;
  target: string;
  rel: string;
}
/** A generated native hyperlink scope and the paired identifiers of its controls. */
interface GeneratedHyperlink extends NativeHyperlink {
  id: string;
  fieldId: string;
}
/** Serializable original package entries and source nodes for safe round trips. */
export interface HwpxSource {
  kind: "hwpx";
  files: Record<string, string>;
  nodes: Record<string, RetainedNode>;
  sections: RetainedSection[];
  doc: EditorNode;
  page: HwpxPage;
}
/** An imported document with physical page settings and its retained source. */
export interface HwpxDocument {
  doc: EditorNode;
  page: HwpxPage;
  warnings: string[];
  format: "hwpx";
  source: HwpxSource;
}
/** Editor content and optional original-source context accepted by the serializer. */
export interface HwpxWriteOptions {
  doc: JSONContent;
  page?: Partial<HwpxPage>;
  title?: string;
  source?: HwpxSource | null;
}
/** A text mark accepted by the editor's ProseMirror schema. */
type EditorMark = NonNullable<JSONContent["marks"]>[number];
/** Schema-defined editor attributes accepted at the document conversion boundary. */
type NodeAttributes = NonNullable<JSONContent["attrs"]>;
/** Supported native character decorations and their editor text-style attributes. */
type CharacterStyle = {
  tags?: string[];
  attrs?: NodeAttributes;
  decorations?: Partial<Record<DecorationKind,CharacterDecoration>>;
};
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { isSafeDocumentLink } from "../documents.ts";
// Package structure: https://tech.hancom.com/hwpxformat/ . XML is generated
// independently; no Hancom application code, template or fonts are bundled.
/**
 * OWPML namespace declarations shared by independently generated XML document roots.
 */
const NS =
  'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph"';
/**
 * The UTF-8 XML declaration prepended to generated package documents.
 */
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
/**
 * The maximum accepted compressed input and cumulative decompressed package size in bytes.
 */
const MAX = 128 * 1024 * 1024;
/**
 * The ordered XML parser configured to preserve attributes and mixed text content.
 */
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});
/**
 * Escape an XML scalar.
 *
 * Replaces reserved XML characters before a value is written into an attribute or text node.
 *
 * @param {unknown} s - The s input.
 * @returns {string} The computed result of this operation.
 * @example
 * esc(s);
 */
const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"']/g,
    /**
     * Evaluate the replace callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {string} c - The c input.
     * @returns {string} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
/**
 * Read the local XML element name.
 *
 * Removes a namespace prefix so equivalent OWPML namespace aliases are handled consistently.
 *
 * @param {XmlNode | null} n - The n input.
 * @returns {string} The computed result of this operation.
 * @example
 * local(n);
 */
const local = (n?: XmlNode | null): string => n?.name?.split(":").at(-1) || "";
/**
 * Create a normalized XML element.
 *
 * Converts attribute scalars to strings and retains the supplied ordered child elements.
 *
 * @param {string} name - The name input.
 * @param {Record<string, unknown>} attrs - The attrs input.
 * @param {XmlNode[]} children - The children input.
 * @returns {XmlNode} The computed result of this operation.
 * @example
 * el(name, attrs, children);
 */
const el = (
  name: string,
  attrs: Record<string, unknown> = {},
  children: XmlNode[] = [],
): XmlNode => ({
  name,
  attrs: Object.fromEntries(
    Object.entries(attrs).map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {[string, unknown]} options - Document content and serialization settings.
       * @returns {[string, string]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      ([key, value]) => [key, String(value)],
    ),
  ),
  children,
});
/**
 * Create an XML text node.
 *
 * Represents text separately from elements so serialization can escape content exactly once.
 *
 * @param {unknown} value - The value input.
 * @returns {XmlNode} The computed result of this operation.
 * @example
 * txt(value);
 */
const txt = (value: unknown): XmlNode => ({
  name: "#text",
  attrs: {},
  children: [],
  text: String(value ?? ""),
});
/**
 * Select direct XML children by local name.
 *
 * Preserves document order and does not include nested descendants.
 *
 * @param {XmlNode | undefined | null} n - The n input.
 * @param {string} name - The name input.
 * @returns {XmlNode[]} The computed result of this operation.
 * @example
 * kids(n, name);
 */
const kids = (n: XmlNode | undefined | null, name: string): XmlNode[] =>
  (n?.children || []).filter(
    /**
     * Evaluate the filter callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {XmlNode} c - The c input.
     * @returns {boolean} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (c) => local(c) === name,
  );
/**
 * Select the first matching direct child.
 *
 * Returns the first child with the requested local name, or undefined when it is absent.
 *
 * @param {XmlNode | undefined | null} n - The n input.
 * @param {string} name - The name input.
 * @returns {XmlNode | undefined} The computed result of this operation.
 * @example
 * child(n, name);
 */
const child = (
  n: XmlNode | undefined | null,
  name: string,
): XmlNode | undefined => kids(n, name)[0];
/**
 * Resolve a paragraph property using Hancom's explicit-unit namespace branch.
 *
 * HwpUnitChar cases carry separate value/unit pairs. Their legacy default
 * branch carries packed URC magnitudes even when its attributes say HWPUNIT.
 * Reading arbitrary descendants loses that essential representation context.
 * @param {XmlNode | undefined} paragraph - Native paragraph property definition.
 * @param {string} name - Margin or line-spacing element to select.
 * @returns {{element?:XmlNode;packed:boolean}} Selected property and its encoding.
 * @example
 * paragraphProperty(definition,'margin'); // Prefer the explicit HwpUnitChar case.
 */
function paragraphProperty(
  paragraph: XmlNode | undefined,
  name: string,
): { element?: XmlNode; packed: boolean } {
  /** Direct properties use explicit native units without a compatibility wrapper. */
  const direct = child(paragraph, name);
  if (direct) return { element: direct, packed: false };
  for (/** Ordered compatibility switch containing paragraph layout alternatives. */ const choice of kids(
    paragraph,
    "switch",
  )) {
    let hasCharacterNamespace = false;
    for (/** Namespace-specific paragraph layout branch. */ const branch of kids(
      choice,
      "case",
    )) {
      /** Namespace prefixes are arbitrary XML aliases rather than part of the property name. */
      let requiredNamespace = "";
      for (/** Qualified or unqualified namespace-requirement attribute. */ const [
        key,
        value,
      ] of Object.entries(branch.attrs))
        if (key.split(":").at(-1) === "required-namespace")
          requiredNamespace = value;
      if (
        requiredNamespace !== "http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"
      )
        continue;
      hasCharacterNamespace = true;
      /** Explicit-unit property supported by this reader, including relative characters. */
      const element = child(branch, name);
      if (element) return { element, packed: false };
    }
    /** Legacy fallback whose URC encoding is identified by its companion namespace case. */
    const fallback = child(child(choice, "default"), name);
    if (fallback) return { element: fallback, packed: hasCharacterNamespace };
  }
  return { packed: false };
}

/**
 * Read a selected native paragraph distance without confusing URC and HWP units.
 *
 * Explicit CHAR values retain their relative character unit. Compatibility
 * defaults are unpacked before conversion, including signed indentation.
 * @param {XmlNode | undefined} element - Selected native value/unit field.
 * @param {boolean} packed - Whether its magnitude is a legacy URC value.
 * @returns {ParagraphMeasure} Decoded native distance and measurement unit.
 * @throws {Error} If an explicit native measurement unit is unsupported.
 * @example
 * paragraphDistance(field,true); // Unpacks the fallback's unit bit first.
 */
function paragraphDistance(
  element: XmlNode | undefined,
  packed: boolean,
): ParagraphMeasure {
  /** Integral native geometry remains distinct from percentages and font-size scalars. */
  const value = number(element?.attrs.value);
  if (packed) return decodeParagraphUrc(value);
  /** Explicit unit absent from older physical properties follows the legacy reader convention. */
  const unit = element?.attrs.unit || "HWPUNIT";
  if (unit !== "HWPUNIT" && unit !== "CHAR")
    throw new Error(`Unsupported native paragraph unit: ${unit}`);
  return { value, unit };
}
/**
 * Collect matching descendants in document order.
 *
 * Traverses the current node and its descendants without changing their original order.
 *
 * @param {XmlNode | undefined | null} n - The n input.
 * @param {string} name - The name input.
 * @returns {XmlNode[]} The computed result of this operation.
 * @example
 * all(n, name);
 */
const all = (n: XmlNode | undefined | null, name: string): XmlNode[] => [
  ...(n && local(n) === name ? [n] : []),
  ...(n?.children || []).flatMap(
    /**
     * Evaluate the flatMap callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {XmlNode} c - The c input.
     * @returns {XmlNode[]} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (c) => all(c, name),
  ),
];
/**
 * Read the textual content of an XML subtree.
 *
 * Joins descendant text nodes while excluding element markup and attributes.
 *
 * @param {XmlNode | null} n - The n input.
 * @returns {string} The computed result of this operation.
 * @example
 * text(n);
 */
const text = (n?: XmlNode | null): string =>
  n?.name === "#text" ? n.text || "" : (n?.children || []).map(text).join("");
/**
 * Serialize an ordered XML subtree.
 *
 * Writes escaped text and attributes while preserving the retained child-element order.
 *
 * @param {XmlNode} n - The n input.
 * @returns {string} The computed result of this operation.
 * @example
 * serialize(n);
 */
function serialize(n: XmlNode): string {
  if (n.name === "#text") return esc(n.text);
  /**
   * The normalized attribute representation used by the current XML conversion.
   */
  const a = Object.entries(n.attrs || {})
    .map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {[string, string]} options - Document content and serialization settings.
       * @returns {string} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      ([k, v]) => ` ${k}="${esc(v)}"`,
    )
    .join("");
  return n.children?.length
    ? `<${n.name}${a}>${n.children.map(serialize).join("")}</${n.name}>`
    : `<${n.name}${a}/>`;
}
/**
 * Parse a validated XML document.
 *
 * Rejects document type declarations and entities before converting XML into an ordered internal tree.
 *
 * @param {string} xml - The xml input.
 * @returns {XmlNode} The computed result of this operation.
 * @throws {Error} If the input is malformed or cannot be represented safely.
 * @example
 * parse(xml);
 */
function parse(xml: string): XmlNode {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("외부 엔티티가 포함된 XML은 열 수 없습니다.");
  if (XMLValidator.validate(xml) !== true)
    throw new Error("HWPX XML 구조가 손상되었습니다.");
  /**
   * Compute the convert result.
   *
   * Applies the local transformation used by the HWPX import or export workflow.
   *
   * @param {OrderedXmlRecord[]} rows - The rows input.
   * @returns {XmlNode[]} The computed result of this operation.
   * @example
   * convert(rows);
   */
  const convert = (rows: OrderedXmlRecord[]): XmlNode[] =>
    rows
      .filter(
        /**
         * Evaluate the filter callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {OrderedXmlRecord} r - The r input.
         * @returns {boolean} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (r) => !Object.keys(r)[0].startsWith("?"),
      )
      .map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {OrderedXmlRecord} r - The r input.
         * @returns {XmlNode} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (r) => {
          /**
           * The element name or canonical cache key selected for this conversion.
           */
          const key = Object.keys(r).find(
            /**
             * Evaluate the find callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {string} k - The k input.
             * @returns {boolean} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (k) => k !== ":@",
          )!;
          return key === "#text"
            ? txt(r[key])
            : el(
                key,
                r[":@"] || {},
                convert((r[key] || []) as OrderedXmlRecord[]),
              );
        },
      );
  return convert(parser.parse(xml))[0];
}
/**
 * Encode package bytes as base64.
 *
 * Uses the available Node or browser implementation while avoiding oversized argument lists.
 *
 * @param {Uint8Array} bytes - The bytes input.
 * @returns {string} The computed result of this operation.
 * @example
 * base64(bytes);
 */
function base64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined")
    return Buffer.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
/**
 * Decode retained base64 bytes.
 *
 * Restores an embedded package entry using either the Node or browser base64 implementation.
 *
 * @param {string} s - The s input.
 * @returns {Uint8Array} The computed result of this operation.
 * @throws {Error} If the input is malformed or cannot be represented safely.
 * @example
 * unbase64(s);
 */
function unbase64(s: string): Uint8Array {
  if (typeof Buffer !== "undefined")
    return new Uint8Array(Buffer.from(s, "base64"));
  return Uint8Array.from(
    atob(s),
    /**
     * Evaluate the from callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {string} c - The c input.
     * @returns {number} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (c) => c.charCodeAt(0),
  );
}
/**
 * Clone a serializable document value.
 *
 * Creates an independent copy before mutable editor state or original XML is changed.
 *
 * @param {T} o - The o input.
 * @returns {T} The computed result of this operation.
 * @example
 * clone(o);
 */
const clone = <T>(o: T): T => structuredClone(o);
/**
 * Canonicalize document state for comparison.
 *
 * Normalizes editor defaults and property order so an unchanged import can reuse its original package.
 *
 * @param {unknown} value - The value input.
 * @returns {string} The computed result of this operation.
 * @example
 * clean(value);
 */
function clean(value: unknown): string {
  /**
   * Normalize a comparison value recursively.
   *
   * Removes source identifiers and empty defaults while retaining semantic document content.
   *
   * @param {unknown} v - The v input.
   * @returns {unknown} The computed result of this operation.
   * @example
   * normalize(v);
   */
  function normalize(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(normalize);
    if (!v || typeof v !== "object") return v;
    /**
     * The ordered results accumulated by the current conversion.
     */
    const out: Record<string, unknown> = {};
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const key of Object.keys(v).sort()) {
      /**
       * The current package, attribute or reference-list entry being inspected.
       */
      const item = (v as Record<string, unknown>)[key];
      if ((key === "header" || key === "footer") && item === 0) continue;
      if (
        key === "sourceId" ||
        item === null ||
        item === undefined ||
        (Array.isArray(item) && !item.length)
      )
        continue;
      if (key === "attrs") {
        /**
         * The editable attributes resolved from the current native document properties.
         */
        const attrs = { ...(item as Record<string, unknown>) };
        if (attrs.pageBreak === true) attrs.pageBreakBefore = true;
        delete attrs.pageBreak;
        if (attrs.textAlign === "left") delete attrs.textAlign;
        for (/**
         * The current native XML, property or content binding selected by this iteration.
         */
        const flag of ["pageBreak", "pageBreakBefore", "nativeUseFontSpace", "nativeUseKerning"])
          if (attrs[flag] === false) delete attrs[flag];
        if (attrs.colspan === 1) delete attrs.colspan;
        if (attrs.rowspan === 1) delete attrs.rowspan;
        /**
         * The normalized attribute representation used by the current XML conversion.
         */
        const a = normalize(attrs) as Record<string, unknown>;
        if (Object.keys(a).length) out.attrs = a;
      } else out[key] = normalize(item);
    }
    return out;
  }
  return JSON.stringify(normalize(value));
}
/**
 * Read a finite numeric value.
 *
 * Converts a scalar to a finite number and returns the supplied fallback for invalid values.
 *
 * @param {unknown} v - The v input.
 * @param {number} fallback - The fallback input.
 * @returns {number} The computed result of this operation.
 * @example
 * number(v, fallback);
 */
const number = (v: unknown, fallback = 0): number =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;
/**
 * Convert HWP units to millimetres.
 *
 * Uses the OWPML convention of 7200 document units per inch.
 *
 * @param {unknown} u - The u input.
 * @returns {number} The computed result of this operation.
 * @example
 * mm(u);
 */
const mm = (u: unknown): number => (number(u) * 25.4) / 7200;
/**
 * Convert millimetres to HWP units.
 *
 * Rounds physical dimensions to the integer unit representation expected by OWPML.
 *
 * @param {unknown} m - The m input.
 * @returns {number} The computed result of this operation.
 * @example
 * unit(m);
 */
const unit = (m: unknown): number => Math.round((number(m) * 7200) / 25.4);
/**
 * Convert a CSS length to HWP units.
 *
 * Accepts millimetres, points and pixels from imported paragraph geometry.
 *
 * @param {unknown} value - The value input.
 * @returns {number} The computed result of this operation.
 * @example
 * cssUnit(value);
 */
function cssUnit(value: unknown): number {
  if (value === undefined || value === null) return 0;
  /**
   * The parsed scalar or XML element being constructed by the current conversion.
   */
  const n = parseFloat(String(value));
  if (!Number.isFinite(n)) return 0;
  if (String(value).endsWith("pt")) return Math.round(n * 100);
  if (String(value).endsWith("px")) return Math.round(n * 75);
  return unit(n);
}
/**
 * Normalize paragraph line spacing.
 *
 * Accepts either a percentage string or a unitless line-height multiplier.
 *
 * @param {unknown} value - The value input.
 * @returns {number} The computed result of this operation.
 * @example
 * linePercent(value);
 */
function linePercent(value: unknown): number {
  /**
   * The parsed scalar or XML element being constructed by the current conversion.
   */
  const n = parseFloat(String(value));
  if (!Number.isFinite(n)) return 160;
  return Math.round(String(value).endsWith("%") ? n : n * 100);
}
/**
 * Independent A4 page dimensions and default margins, expressed in millimetres.
 */
const defaultPage: HwpxPage = {
  width: 210,
  height: 297,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 25,
  marginRight: 25,
};
/**
 * Complete physical page geometry.
 *
 * Fills missing dimensions and margins with the independent editor defaults.
 *
 * @param {Partial<HwpxPage>} p - The p input.
 * @returns {HwpxPage} The computed result of this operation.
 * @example
 * normalizePage(p);
 */
const normalizePage = (p?: Partial<HwpxPage>): HwpxPage => {
  /** Complete six-field page geometry before optional native header and footer metrics are retained. */
  const normalized = Object.fromEntries(
    Object.entries(defaultPage).map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {[string, any]} options - Document content and serialization settings.
       * @returns {[string, number]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      ([k, v]) => [k, number(p?.[k as keyof HwpxPage], v)],
    ),
  ) as unknown as HwpxPage;
  for (/** The optional native body-text offset retained when supplied by the caller. */ const metric of [
    "header",
    "footer",
  ] as const) {
    if (p?.[metric] !== undefined)
      normalized[metric] = Math.max(0, number(p[metric]));
  }
  Object.assign(normalized,sectionGridSettings(p??{}));
  return normalized;
};
/**
 * Read a bounded HWPX archive.
 *
 * Checks archive paths, decompressed sizes, entry counts, the MIME signature and encryption declarations.
 *
 * @param {Uint8Array | ArrayBuffer} bytes - The bytes input.
 * @returns {Record<string, Uint8Array>} The computed result of this operation.
 * @throws {Error} If the input is malformed or cannot be represented safely.
 * @example
 * unpack(bytes);
 */
function unpack(bytes: Uint8Array | ArrayBuffer): Record<string, Uint8Array> {
  /**
   * The normalized archive input bytes before decompression and signature checks.
   */
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length > MAX) throw new Error("문서 크기는 128MB 이하여야 합니다.");
  let total = 0,
    count = 0;
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unzipSync(data, {
    /**
     * Compute the filter result.
     *
     * Applies the local transformation used by the HWPX import or export workflow.
     *
     * @param {UnzipFileInfo} f - The f input.
     * @returns {true} The computed result of this operation.
     * @example
     * filter(f);
     */
    filter(f) {
      if (
        ++count > 4096 ||
        (total += f.originalSize) > MAX ||
        f.originalSize > MAX / 2
      )
        throw new Error("압축을 푼 문서가 너무 큽니다.");
      if (
        f.name.includes("..") ||
        f.name.startsWith("/") ||
        f.name.includes("\\")
      )
        throw new Error("잘못된 HWPX 경로입니다.");
      return true;
    },
  });
  if (
    !files.mimetype ||
    strFromU8(files.mimetype).trim() !== "application/hwp+zip"
  )
    throw new Error("한글 HWPX 문서가 아닙니다.");
  /**
   * The package manifest containing file and encryption declarations.
   */
  const manifest = files["META-INF/manifest.xml"];
  if (manifest && /encryption-data|encrypted-key/i.test(strFromU8(manifest)))
    throw new Error(
      "암호화된 HWPX입니다. 한글에서 암호를 해제한 뒤 열어 주세요.",
    );
  return files;
}
/**
 * Resolve an embedded image's positive display dimension.
 *
 * Native Hancom files can set curSz to zero while keeping the real display size
 * in sz. Display geometry therefore precedes positive transformed or intrinsic
 * fallback dimensions, and zero placeholders never hide a valid size.
 *
 * @param {XmlNode} pic - The native picture element containing size records.
 * @param {'width' | 'height'} axis - The display dimension to resolve.
 * @returns {number | null} The positive dimension in CSS pixels, or null when absent.
 * @example
 * imageDimension(pic, 'width');
 */
function imageDimension(pic: XmlNode, axis: "width" | "height"): number | null {
  for (/** The native size record name in display-to-intrinsic preference order. */ const name of [
    "sz",
    "curSz",
    "orgSz",
  ]) {
    /** The positive native dimension candidate expressed in HWP document units. */
    const candidate = number(child(pic, name)?.attrs[axis]);
    if (candidate > 0) return (candidate * 96) / 7200;
  }
  return null;
}
/**
 * Resolve a native table's individual column widths.
 *
 * Unmerged native cells supply exact column measurements first. Merged cells
 * then divide only their unresolved width among the remaining columns so a
 * two-column cell becomes two editor colwidth slots rather than one total.
 *
 * @param {XmlNode} table - The native table containing row, span and size records.
 * @returns {number[]} Individual logical column widths in HWP document units.
 * @throws {Error} If the declared column count exceeds the supported allocation bound.
 * @example
 * nativeColumnWidths(table);
 */
function nativeColumnWidths(table: XmlNode): number[] {
  /** The original native column count retains the existing allocation bound. */
  const count=Math.max(1,Math.trunc(number(table.attrs.colCnt,1)));
  if(count>4096)throw new Error("표의 열 개수가 너무 큽니다.");
  /** Actual source cell sizes constrain logical columns before pixel conversion. */
  const measurements:NativeColumnMeasurement[]=[];
  for(/** Only direct table cells supply this table's independent physical measurements. */const row of kids(table,'tr'))for(/** Nested child tables cannot replace their owning cell's geometry. */const cell of kids(row,'tc')){
    measurements.push({column:number(child(cell,'cellAddr')?.attrs.colAddr),span:number(child(cell,'cellSpan')?.attrs.colSpan,1),width:number(child(cell,'cellSz')?.attrs.width)});
  }
  return nativeColumnMeasurements(count,measurements,number(child(table,'sz')?.attrs.width));
}
/**
 * Resolve editable table widths without stretching explicit column measurements.
 *
 * Standard editor colwidth arrays contain one CSS-pixel measurement per spanned
 * column. These measurements determine the native table width. Unspecified
 * columns receive the available-page fallback; legacy merged totals are split
 * only when no per-column array is present.
 *
 * @param {PositionedCell[][]} rows - Editable cells with resolved logical grid positions.
 * @param {number} columnCount - The total number of logical table columns.
 * @param {number} fallbackWidth - Available page-body width in HWP document units.
 * @returns {number[]} Positive individual column widths in HWP document units.
 * @example
 * editableColumnWidths(rows, 3, 42520);
 */
function editableColumnWidths(
  rows: PositionedCell[][],
  columnCount: number,
  fallbackWidth: number,
): number[] {
  /** Logical column width slots populated from explicit editor measurements. */
  const widths = new Array<number>(columnCount).fill(0);
  for (/** The positioned editable row supplying column measurements. */ const row of rows) {
    for (/** The positioned cell whose colwidth array describes its occupied columns. */ const cell of row) {
      /** The cell's optional standard per-column width array in CSS pixels. */
      const supplied = cell.c.attrs?.colwidth as unknown;
      if (!Array.isArray(supplied)) continue;
      for (
        let offset = 0;
        offset < Math.min(cell.cs, supplied.length);
        offset++
      ) {
        /** The positive pixel width supplied for the current logical column. */
        const pixels = number(supplied[offset]);
        if (pixels > 0 && (supplied.length >= cell.cs || cell.cs === 1))
          widths[cell.start + offset] = pixels * CELL_UNITS_PER_PIXEL;
      }
    }
  }
  for (/** The positioned row whose legacy merged measurements need expansion. */ const row of rows) {
    for (/** The positioned merged cell supplying one legacy total-width slot. */ const cell of row) {
      /** The retained colwidth representation inspected for an older merged-cell total. */
      const supplied = cell.c.attrs?.colwidth as unknown;
      if (
        !Array.isArray(supplied) ||
        supplied.length !== 1 ||
        cell.cs <= 1 ||
        number(supplied[0]) <= 0
      )
        continue;
      let known = 0,
        missing = 0;
      for (let offset = 0; offset < cell.cs; offset++) {
        if (widths[cell.start + offset]) known += widths[cell.start + offset];
        else missing++;
      }
      /** The total native width carried by the older one-slot merged-cell representation. */
      const total = number(supplied[0]) * 75;
      if (missing)
        for (let offset = 0; offset < cell.cs; offset++)
          if (!widths[cell.start + offset])
            widths[cell.start + offset] = total > known ? (total - known) / missing : total / cell.cs;
    }
  }
  for (let column = 0; column < columnCount; column++)
    if (!widths[column])
      widths[column] = Math.max(1, fallbackWidth / columnCount);
  return widths;
}
/**
 * Sum the widths occupied by a logical column span.
 *
 * Uses the resolved per-column measurements for both the native table's total
 * size and individual merged-cell sizes so their geometry remains consistent.
 *
 * @param {number[]} widths - Resolved column widths in HWP document units.
 * @param {number} start - The first logical column to include.
 * @param {number} span - The number of logical columns to include.
 * @returns {number} The total native width of the selected columns.
 * @example
 * columnSpanWidth([6150, 6150, 4500], 0, 2);
 */
function columnSpanWidth(
  widths: number[],
  start = 0,
  span = widths.length,
): number {
  let total = 0;
  for (
    let column = start;
    column < Math.min(widths.length, start + span);
    column++
  )
    total += widths[column];
  return Math.round(total);
}
/**
 * Import an HWPX document.
 *
 * Decodes editable content and preserves original package entries and XML nodes for subsequent lossless round trips.
 *
 * @param {Uint8Array | ArrayBuffer} bytes - The bytes input.
 * @returns {Promise<HwpxDocument>} The computed result of this operation.
 * @throws {Error} If the input is malformed or cannot be represented safely.
 * @example
 * readHwpx(bytes);
 */
export async function readHwpx(
  bytes: Uint8Array | ArrayBuffer,
): Promise<HwpxDocument> {
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = unpack(bytes);
  if (!files["Contents/header.xml"])
    throw new Error("HWPX 서식 정보가 없습니다.");
  /**
   * The native document header containing formatting reference collections.
   */
  const header = parse(strFromU8(files["Contents/header.xml"]));
  /**
   * Native character-property records indexed by their document identifiers.
   */
  const chars = new Map(
    all(header, "charPr").map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {[string, XmlNode]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => [n.attrs.id, n],
    ),
  );
  /**
   * Native paragraph-property records indexed by their document identifiers.
   */
  const paras = new Map(
    all(header, "paraPr").map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {[string, XmlNode]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => [n.attrs.id, n],
    ),
  );
  /**
   * Native border and fill records indexed by their document identifiers.
   */
  const borders = new Map(
    all(header, "borderFill").map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {[string, XmlNode]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => [n.attrs.id, n],
    ),
  );
  /**
   * Native named paragraph and character styles indexed by their identifiers.
   */
  const styles = new Map(
    all(header, "style").map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {[string, XmlNode]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => [n.attrs.id, n],
    ),
  );
  /**
   * Independent language font references indexed within their own native tables.
   */
  const fonts = new Map<string, Map<string, string>>();
  for (
    /** Native language tables have independent identifiers even when the numbers coincide. */
    const table of all(header, "fontface")
  ) {
    /** Face-name references scoped to one native language. */
    const faces = new Map<string, string>();
    for (
      /** Literal face entry whose ID must not resolve against another script. */
      const font of kids(table, "font")
    ) faces.set(font.attrs.id, font.attrs.face);
    fonts.set(table.attrs.lang.toLowerCase(), faces);
  }
  /**
   * Package manifest items indexed by their declared identifiers.
   */
  const items = new Map<string, Record<string, string>>();
  let packageRoot: XmlNode | undefined;
  if (files["Contents/content.hpf"]) {
    packageRoot = parse(strFromU8(files["Contents/content.hpf"]));
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const n of all(packageRoot, "item"))
      items.set(n.attrs.id, n.attrs);
  }
  let paths = all(packageRoot, "itemref")
    .map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {string | undefined} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => items.get(n.attrs.idref)?.href,
    )
    .filter(
      /**
       * Evaluate the filter callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {string | undefined} p - The p input.
       * @returns {p is string} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (p): p is string => !!p && /section[^/]*\.xml$/i.test(p),
    );
  if (!paths.length)
    paths = Object.keys(files)
      .filter(
        /**
         * Evaluate the filter callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {string} p - The p input.
         * @returns {boolean} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (p) => /^Contents\/section\d+\.xml$/.test(p),
      )
      .sort(
        /**
         * Evaluate the sort callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {string} a - The a input.
         * @param {string} b - The b input.
         * @returns {number} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (a, b) => number(a.match(/\d+/)?.[0]) - number(b.match(/\d+/)?.[0]),
      );
  if (!paths.length) throw new Error("HWPX 본문 구역이 없습니다.");
  /**
   * The retained original package, XML nodes and editor snapshots needed for safe round trips.
   */
  const source: HwpxSource = {
    kind: "hwpx",
    files: Object.fromEntries(
      Object.entries(files).map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {[string, Uint8Array<ArrayBufferLike>]} options - Document content and serialization settings.
         * @returns {[string, string]} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        ([k, v]) => [k, base64(v)],
      ),
    ),
    nodes: {},
    sections: [],
    doc: { type: "doc", content: [] },
    page: { ...defaultPage },
  };
  /**
   * Import messages associated with the decoded document.
   */
  const warnings: string[] = [];
  /** Validated native hyperlink definitions shared by their begin/end controls. */
  const linkDefinitions = new Map<string, NativeHyperlink>();
  /** Active native hyperlink scopes in document order across adjacent runs. */
  const activeLinkIds: string[] = [];
  let seq = 0,
    activeSection = 0,
    page = { ...defaultPage };
  /**
   * Retain the XML source of an editor node.
   *
   * Assigns a stable source identifier and saves the original editable state beside its XML representation.
   *
   * @param {EditorNode} node - The node input.
   * @param {XmlNode} xmlNode - The xml node input.
   * @param {Partial<RetainedNode>} extra - The extra input.
   * @returns {EditorNode} The computed result of this operation.
   * @example
   * remember(node, xmlNode, extra);
   */
  function remember(
    node: EditorNode,
    xmlNode: XmlNode,
    extra: Partial<RetainedNode> = {},
  ): EditorNode {
    /**
     * The stable identifier allocated or selected for the current native reference.
     */
    const id = `hwpx-${seq++}`;
    node.attrs = { ...node.attrs, sourceId: id };
    source.nodes[id] = {
      xml: serialize(xmlNode),
      original: clone(node),
      section: activeSection,
      ...extra,
    };
    return node;
  }
  /**
   * Resolve native character properties.
   *
   * Maps a character-property reference to editor marks while retaining supported font and decoration settings.
   *
   * @param {unknown} id - The id input.
   * @returns {EditorMark[]} The computed result of this operation.
   * @example
   * marks(id);
   */
  function marks(id: unknown): EditorMark[] {
    /**
     * The native character-property record selected by the supplied reference.
     */
    const cp = chars.get(String(id));
    if (!cp) return [];
    /**
     * The ordered results accumulated by the current conversion.
     */
    const out: EditorMark[] = [];
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const [tag, type] of [
      ["bold", "bold"],
      ["italic", "italic"],
    ])
      if (child(cp, tag)) out.push({ type });
    if (
      child(cp, "underline")?.attrs.type &&
      child(cp, "underline")!.attrs.type !== "NONE"
    )
      out.push({ type: "underline",attrs:characterDecoration({nativePosition:child(cp,"underline")!.attrs.type,nativePattern:nativeDecorationPattern(child(cp,"underline")!.attrs.shape,"underline"),nativeColor:child(cp,"underline")!.attrs.color},"underline") });
    if (
      child(cp, "strikeout")?.attrs.shape &&
      child(cp, "strikeout")!.attrs.shape !== "NONE"
    )
      out.push({ type: "strike",attrs:characterDecoration({nativePattern:nativeDecorationPattern(child(cp,"strikeout")!.attrs.shape,"strike"),nativeColor:child(cp,"strikeout")!.attrs.color},"strike") });
    if (child(cp, "supscript")) out.push({ type: "superscript" });
    if (child(cp, "subscript")) out.push({ type: "subscript" });
    /**
     * The editable attributes resolved from the current native document properties.
     */
    const attrs: NodeAttributes = {
      fontSize: `${number(cp.attrs.height, 1100) / 100}pt`,
      color: cp.attrs.textColor || "#000000",
      nativeUseFontSpace: nativeSpacingFlag(cp.attrs.useFontSpace),
      nativeUseKerning: nativeSpacingFlag(cp.attrs.useKerning),
      nativeOutlineType: characterOutline(NATIVE_OUTLINE_TYPES.indexOf((child(cp,"outline")?.attrs.type || "NONE") as typeof NATIVE_OUTLINE_TYPES[number])),
      nativeEmphasisType: characterEmphasis(NATIVE_EMPHASIS_TYPES.indexOf((cp.attrs.symMark || "NONE") as typeof NATIVE_EMPHASIS_TYPES[number])),
      nativeShadowType: child(cp,"shadow")?.attrs.type || "NONE",
      nativeShadowOffsetX: number(child(cp,"shadow")?.attrs.offsetX,10),
      nativeShadowOffsetY: number(child(cp,"shadow")?.attrs.offsetY,10),
      nativeShadowColor: child(cp,"shadow")?.attrs.color || "#c0c0c0",
    };
    /** Native no-color shading remains distinct from an explicit opaque white fill. */
    const shade = normalizeColor(cp.attrs.shadeColor, true);
    if (shade) attrs.backgroundColor = shade;
    /** Language-specific percentages retained independently of the displayed run. */
    const metrics = characterMetrics(null);
    for (/** Native XML measurement element and its portable array name. */ const [
      tag,
      key,
    ] of [
      ["ratio", "ratio"],
      ["spacing", "spacing"],
      ["relSz", "relativeSize"],
      ["offset", "offset"],
    ] as const) {
      for (let language = 0; language < 7; language++)
        metrics[key][language] = number(
          child(cp, tag)?.attrs[CHARACTER_LANGUAGES[language]],
          metrics[key][language],
        );
    }
    if (hasCharacterMetrics(metrics))
      attrs.nativeCharacterMetrics = characterMetrics(metrics);
    /**
     * The font face resolved from the current native character properties.
     */
    const faces: string[] = [];
    for (
      /** Ordered native font language used by the character reference. */
      const language of CHARACTER_LANGUAGES
    ) faces.push(fonts.get(language)?.get(child(cp, "fontRef")?.attrs[language] || "") || "");
    if (faces[0]) attrs.fontFamily = faces[0];
    if (hasCharacterFonts(faces)) attrs.nativeCharacterFonts = faces;
    out.push({ type: "textStyle", attrs });
    return out;
  }
  /**
   * Resolve native paragraph properties.
   *
   * Converts alignment, line spacing, margins and page breaks into editor attributes.
   *
   * @param {XmlNode} p - The p input.
   * @returns {NodeAttributes} The computed result of this operation.
   * @example
   * pAttrs(p);
   */
  function pAttrs(p: XmlNode): NodeAttributes {
    /**
     * The selected native paragraph properties and their normalized horizontal alignment.
     */
    const pp = paras.get(p.attrs.paraPrIDRef),
      align = child(pp, "align")?.attrs.horizontal?.toLowerCase();
    /**
     * The editable attributes resolved from the current native document properties.
     */
    const attrs: NodeAttributes = {
      textAlign: paragraphAlignment(align),
      nativeParagraphCondense:paragraphCondense({nativeParagraphCondense:pp?.attrs.condense}),
      nativeSnapToGrid:paragraphSnapToGrid({nativeSnapToGrid:pp?.attrs.snapToGrid}),
      ...readHwpxWordBreaks(paragraphProperty(pp,"breakSetting").element?.attrs),
    };
    /**
     * The native line-spacing record selected from the paragraph properties.
     */
    const spacing = paragraphProperty(pp, "lineSpacing");
    /** Selected line spacing carries either a percentage or a typed native distance. */
    const ls = spacing.element;
    if (ls?.attrs.type === "PERCENT")
      attrs.lineHeight = String(number(ls.attrs.value, 160) / 100);
    else if (ls?.attrs.type === "FIXED" && (number(ls.attrs.value)>0 || /^\+?0+(?:\.0+)?$/.test(String(ls.attrs.value??'').trim())))
      attrs.lineHeight = paragraphMeasureCss(
        paragraphDistance(ls, spacing.packed),
        "pt",
      );
    /**
     * The native paragraph margin record, including indent and spacing values.
     */
    const margin = paragraphProperty(pp, "margin");
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const [tag, key] of [
      ["left", "marginLeft"],
      ["right", "marginRight"],
      ["intent", "textIndent"],
      ["prev", "marginTop"],
      ["next", "marginBottom"],
    ]) {
      /**
       * The native numeric property being converted into editor units.
       */
      const value = paragraphDistance(
        child(margin.element, tag),
        margin.packed,
      );
      if (value.value) attrs[key] = paragraphMeasureCss(value);
    }
    if (p.attrs.pageBreak === "1") attrs.pageBreakBefore = true;
    return attrs;
  }
  /**
   * Decode ordered inline paragraph content.
   *
   * Preserves mixed text, tabs, hard breaks and supported spacing characters under the supplied marks.
   *
   * @param {XmlNode} t - The t input.
   * @param {EditorMark[]} ms - The ms input.
   * @returns {EditorNode[]} The computed result of this operation.
   * @example
   * inline(t, ms);
   */
  function inline(t: XmlNode, ms: EditorMark[]): EditorNode[] {
    /**
     * The ordered results accumulated by the current conversion.
     */
    const out: EditorNode[] = [];
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const n of t.children || []) {
      if (n.name === "#text" && n.text)
        out.push(...(splitCharacterMetrics(n.text, clone(ms)) as EditorNode[]));
      else if (local(n) === "lineBreak") out.push({ type: "hardBreak" });
      else if (local(n) === "tab")
        out.push(...(splitCharacterMetrics("\t", clone(ms)) as EditorNode[]));
      else if (local(n) === "nbSpace")
        out.push(
          ...(splitCharacterMetrics("\u00a0", clone(ms)) as EditorNode[]),
        );
      else if (local(n) === "fwSpace")
        out.push(
          ...(splitCharacterMetrics("\u3000", clone(ms)) as EditorNode[]),
        );
      else if (local(n) === "hyphen")
        out.push(...(splitCharacterMetrics("-", clone(ms)) as EditorNode[]));
      else if (n.name !== "#text") out.push(...inline(n, ms));
    }
    return out;
  }
  /**
   * Retain an opaque document object.
   *
   * Creates an editor placeholder with its original XML so unsupported objects are never silently discarded.
   *
   * @param {XmlNode} n - The n input.
   * @returns {EditorNode} The computed result of this operation.
   * @example
   * opaque(n);
   */
  function opaque(n: XmlNode): EditorNode {
    /**
     * Human-readable labels for opaque native document object types.
     */
    const names: Record<string, string> = {
      equation: "수식",
      rect: "글상자 / 사각형",
      ellipse: "타원",
      line: "선",
      ole: "OLE 개체",
      shapeComponent: "그리기 개체",
      ctrl: "문서 필드",
    };
    /**
     * Readable text retained for displaying an opaque object in the editor.
     */
    const preview =
      all(n, "script").map(text).join(" ") ||
      all(n, "t").map(text).join(" ") ||
      local(n);
    return remember(
      {
        type: "preservedBlock",
        attrs: { label: names[local(n)] || `문서 개체 · ${local(n)}`, preview },
      },
      n,
      { object: true },
    );
  }
  /**
   * Decode a native embedded image.
   *
   * Resolves package image bytes and display geometry without fetching external resources.
   *
   * @param {XmlNode} pic - The pic input.
   * @returns {EditorNode} The computed result of this operation.
   * @example
   * image(pic);
   */
  function image(pic: XmlNode): EditorNode {
    /**
     * The native image descriptor and its corresponding package manifest item.
     */
    const image = all(pic, "img")[0],
      item = items.get(image?.attrs.binaryItemIDRef || "");
    let path =
      item?.href ||
      Object.keys(files).find(
        /**
         * Evaluate the find callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {string} p - The p input.
         * @returns {boolean} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (p) =>
          p.startsWith("BinData/") &&
          p.split("/").at(-1)?.split(".")[0] === image?.attrs.binaryItemIDRef,
      );
    if (path && !files[path] && files[`Contents/${path}`])
      path = `Contents/${path}`;
    /**
     * The embedded image media type resolved from package metadata or its filename.
     */
    const mime =
      item?.["media-type"] ||
      (
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          bmp: "image/bmp",
          svg: "image/svg+xml",
          webp: "image/webp",
        } as Record<string, string>
      )[path?.split(".").at(-1)?.toLowerCase() || ""];
    if (
      !path ||
      !files[path] ||
      !/^image\/(png|jpeg|gif|bmp|webp)$/.test(mime || "")
    )
      return opaque(pic);
    return remember(
      {
        type: "image",
        attrs: {
          src: `data:${mime};base64,${base64(files[path])}`,
          alt: all(pic, "shapeComment").map(text).join(""),
          width: imageDimension(pic, "width"),
          height: imageDimension(pic, "height"),
        },
      },
      pic,
      { object: true },
    );
  }
  /**
   * Decode a native table hierarchy.
   *
   * Builds editable rows and cells while retaining merged-cell spans, nested content and source geometry.
   *
   * @param {XmlNode} tbl - The tbl input.
   * @returns {EditorNode} The computed result of this operation.
   * @example
   * table(tbl);
   */
  function table(tbl: XmlNode): EditorNode {
    /** Parent paragraph hyperlink scopes suspended while nested table cells are decoded. */
    const parentLinks = [...activeLinkIds];
    activeLinkIds.length = 0;
    /** Individual native column widths resolved before merged cells become editor nodes. */
    const columnWidths = nativeColumnWidths(tbl);
    /**
     * The ordered editable content produced from the current native hierarchy.
     */
    const content = kids(tbl, "tr").map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} tr - The tr input.
       * @returns {{ type: string; content: EditorNode[]; }} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (tr) => ({
        type: "tableRow",
        content: kids(tr, "tc").map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {XmlNode} tc - The tc input.
           * @returns {EditorNode} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (tc) => {
            /**
             * The native horizontal and vertical merge spans of the current table cell.
             */
            const span = child(tc, "cellSpan")?.attrs || {};
            /**
             * The native geometry record used for the current embedded object.
             */
            const size = child(tc, "cellSz")?.attrs || {};
            /**
             * The editable table-cell representation including its merge attributes.
             */
            const cell: EditorNode = {
              type: tc.attrs.header === "1" ? "tableHeader" : "tableCell",
              attrs: {
                colspan: number(span.colSpan, 1),
                rowspan: number(span.rowSpan, 1),
                nativeCellHeight:nativeCellDimension(size.height===undefined?null:Number(size.height)),
                nativeCellFieldName:cellFieldName(tc.attrs.name??''),
                nativeCellProperties:readHwpxCellProperties(tc.attrs,child(tc,'subList')?.attrs??{},child(tc,'cellMargin')?.attrs),
                colwidth: size.width ? [] : null,
              },
              content: kids(child(tc, "subList"), "p").flatMap(paragraph),
            };
            if (size.width) {
              /** The first logical column occupied by this native cell. */
              const start = Math.max(
                0,
                number(child(tc, "cellAddr")?.attrs.colAddr),
              );
              for (let offset = 0; offset < number(span.colSpan, 1); offset++)
                cell.attrs.colwidth.push(
                  (columnWidths[start + offset] ||number(size.width)/number(span.colSpan,1))/CELL_UNITS_PER_PIXEL,
                );
            }
            /**
             * The native solid background color selected for the current table cell.
             */
            const fill = all(
              borders.get(tc.attrs.borderFillIDRef),
              "winBrush",
            )[0]?.attrs.faceColor;
            if (fill && fill !== "none") cell.attrs.backgroundColor = fill;
            if (!cell.content?.length) cell.content = [{ type: "paragraph" }];
            return remember(cell, tc);
          },
        ),
      }),
    );
    activeLinkIds.length = 0;
    activeLinkIds.push(...parentLinks);
    return remember({ type: "table", attrs:{nativeTableProperties:readHwpxTableProperties(tbl.attrs),nativeCellMargins:readHwpxCellMargins(child(tbl,'inMargin')?.attrs)}, content }, tbl, { object: true });
  }
  /**
   * Advance a recognized hyperlink field scope while reading ordered controls.
   *
   * Keeps start and end markers separate from text runs so one hyperlink can
   * retain its target across formatting changes and adjacent native runs.
   *
   * @param {XmlNode} field - The native field begin or end control being inspected.
   * @returns {boolean} Whether the control belongs to a recognized hyperlink field.
   * @throws {Error} If a hyperlink begin marker lacks an identifier or safe destination.
   * @example
   * processHyperlinkField(fieldBegin);
   */
  function processHyperlinkField(field: XmlNode): boolean {
    if (local(field) === "fieldBegin" && field.attrs.type === "HYPERLINK") {
      /** The stable begin-control identifier used to match the native field end. */
      const id = field.attrs.id || field.attrs.fieldid;
      if (!id) throw new Error("하이퍼링크 필드 식별자가 없습니다.");
      if (!linkDefinitions.has(id))
        linkDefinitions.set(id, nativeHyperlink(field));
      activeLinkIds.push(id);
      return true;
    }
    if (
      local(field) === "fieldEnd" &&
      linkDefinitions.has(field.attrs.beginIDRef)
    ) {
      for (let index = activeLinkIds.length - 1; index >= 0; index--) {
        if (activeLinkIds[index] === field.attrs.beginIDRef) {
          activeLinkIds.splice(index, 1);
          break;
        }
      }
      return true;
    }
    return false;
  }
  /**
   * Decode a native paragraph and anchored objects.
   *
   * Separates editable text from object blocks while retaining document controls and reusable XML shells.
   *
   * @param {XmlNode} p - The p input.
   * @returns {EditorNode[]} The computed result of this operation.
   * @example
   * paragraph(p);
   */
  function paragraph(p: XmlNode): EditorNode[] {
    /**
     * Editable inline content, separately anchored objects and a retained paragraph shell.
     */
    const content: EditorNode[] = [],
      objects: EditorNode[] = [],
      shell = clone(p);
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const run of kids(p, "run")) {
      /**
       * Editor marks resolved for the current native text run.
       */
      const ms = marks(run.attrs.charPrIDRef);
      for (/**
       * The current native XML, property or content binding selected by this iteration.
       */
      const n of run.children || []) {
        /**
         * The namespace-independent native XML element name currently being dispatched.
         */
        const tag = local(n);
        if (tag === "t") {
          /** Character marks augmented by the innermost active native hyperlink scope. */
          const textMarks = clone(ms);
          /** The portable hyperlink attributes active at this exact native text position. */
          const link = linkDefinitions.get(activeLinkIds.at(-1) || "");
          if (link) textMarks.push(nativeHyperlinkAppearance(textMarks,{...link}));
          content.push(...inline(n, textMarks));
        } else if (tag === "tbl") objects.push(table(n));
        else if (tag === "pic") objects.push(image(n));
        else if (
          (tag === "fieldBegin" || tag === "fieldEnd") &&
          processHyperlinkField(n)
        )
          continue;
        else if (
          ["secPr", "ctrl", "run", "linesegarray", "#text"].includes(tag) ||
          n.name === "#text"
        ) {
          if (tag === "ctrl")
            for (/**
             * The current native XML, property or content binding selected by this iteration.
             */
            const c of n.children || []) {
              if (processHyperlinkField(c)) continue;
              if (
                ![
                  "colPr",
                  "fieldBegin",
                  "fieldEnd",
                  "pageNum",
                  "autoNum",
                  "newNum",
                  "bookmark",
                ].includes(local(c))
              )
                objects.push(opaque(el(n.name, n.attrs, [c])));
            }
        } else objects.push(opaque(n));
      }
    }
    // Known content is serialized separately. Keep document-level controls in shell.
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const run of kids(shell, "run"))
      run.children = (run.children || [])
        .filter(
          /**
           * Evaluate the filter callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {XmlNode} n - The n input.
           * @returns {boolean} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (n) => ["secPr", "ctrl"].includes(local(n)),
        )
        .map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {XmlNode} n - The n input.
           * @returns {XmlNode} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (n) =>
            local(n) === "ctrl"
              ? {
                  ...n,
                  children: n.children.filter(
                    /**
                     * Evaluate the filter callback.
                     *
                     * Processes the current collection item while preserving the surrounding operation ordering.
                     *
                     * @param {XmlNode} c - The c input.
                     * @returns {boolean} The computed result of this operation.
                     * @example
                     * collection.map(callback);
                     */
                    (c) =>
                      [
                        "colPr",
                        "fieldBegin",
                        "fieldEnd",
                        "pageNum",
                        "autoNum",
                        "newNum",
                        "bookmark",
                      ].includes(local(c)),
                  ),
                }
              : n,
        );
    shell.children = shell.children.filter(
      /**
       * Evaluate the filter callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {number | boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) =>
        local(n) !== "linesegarray" &&
        (local(n) !== "run" || n.children.length),
    );
    stripHyperlinkShell(shell, linkDefinitions);
    // Object nodes are emitted as editor blocks below. Remove them from the
    // paragraph's reusable XML so editing a different paragraph cannot duplicate
    // an equation/table/image when both blocks are serialized.
    /**
     * A retained paragraph copy with separately emitted anchored objects removed.
     */
    const reusable = clone(p);
    if (objects.length)
      for (/**
       * The current native XML, property or content binding selected by this iteration.
       */
      const run of kids(reusable, "run"))
        run.children = (run.children || [])
          .filter(
            /**
             * Evaluate the filter callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {XmlNode} n - The n input.
             * @returns {boolean} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (n) => ["t", "secPr", "ctrl"].includes(local(n)),
          )
          .map(
            /**
             * Evaluate the map callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {XmlNode} n - The n input.
             * @returns {XmlNode} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (n) =>
              local(n) === "ctrl"
                ? {
                    ...n,
                    children: n.children.filter(
                      /**
                       * Evaluate the filter callback.
                       *
                       * Processes the current collection item while preserving the surrounding operation ordering.
                       *
                       * @param {XmlNode} c - The c input.
                       * @returns {boolean} The computed result of this operation.
                       * @example
                       * collection.map(callback);
                       */
                      (c) =>
                        [
                          "colPr",
                          "fieldBegin",
                          "fieldEnd",
                          "pageNum",
                          "autoNum",
                          "newNum",
                          "bookmark",
                        ].includes(local(c)),
                    ),
                  }
                : n,
          );
    /**
     * The referenced native style and any heading level encoded in its name.
     */
    const style = styles.get(p.attrs.styleIDRef),
      heading = (style?.attrs.engName || style?.attrs.name || "").match(
        /^(?:Forhan Heading|Heading|제목)\s*(\d+)/i,
      );
    /**
     * The editable attributes resolved from the current native document properties.
     */
    const attrs = pAttrs(p);
    if (heading) attrs.level = Math.max(1, Math.min(6, number(heading[1], 1)));
    if(heading)for(/** An explicit native normal weight must survive semantic heading reconstruction. */const node of content)if(node.type==='text'){node.marks??=[];retainNormalCharacterWeight(node.marks);}
    /**
     * The editable paragraph paired with its retained native XML.
     */
    const para = remember(
      {
        type: heading ? "heading" : "paragraph",
        attrs,
        ...(content.length ? { content } : {}),
      },
      reusable,
      { shell: serialize(shell) },
    );
    if (
      objects.length &&
      !content.length &&
      !all(shell, "secPr").length &&
      !all(shell, "ctrl").length
    )
      return objects;
    /**
     * The native heading or list definition referenced by the current paragraph.
     */
    const h = child(paras.get(p.attrs.paraPrIDRef), "heading");
    if (h && ["NUMBER", "BULLET"].includes(h.attrs.type)) {
      /**
       * The editor list type corresponding to the native numbering mode.
       */
      const kind = h.attrs.type === "BULLET" ? "bulletList" : "orderedList";
      source.nodes[para.attrs!.sourceId].listKind = kind;
      return [
        {
          type: kind,
          ...(kind === "orderedList" ? { attrs: { start: 1 } } : {}),
          content: [{ type: "listItem", content: [para, ...objects] }],
        },
      ];
    }
    return [para, ...objects];
  }
  /**
   * The editable document hierarchy produced by the conversion.
   */
  const doc: EditorNode = { type: "doc", content: [] };
  paths.forEach(
    /**
     * Evaluate the forEach callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {string} path - The path input.
     * @param {number} index - The index input.
     * @returns {void} Completes the local operation.
     * @example
     * collection.map(callback);
     */
    (path, index) => {
      if (!files[path]) throw new Error(`본문 파일 ${path}이 없습니다.`);
      activeSection = index;
      /**
       * The validated XML root for the current section or generated header.
       */
      const root = parse(strFromU8(files[path]));
      if (local(root) !== "sec")
        throw new Error("HWPX 구역 형식이 잘못되었습니다.");
      activeLinkIds.length = 0;
      for (/** The section hyperlink definition validated before ordered paragraph decoding. */ const field of all(
        root,
        "fieldBegin",
      )) {
        if (field.attrs.type === "HYPERLINK")
          linkDefinitions.set(
            field.attrs.id || field.attrs.fieldid,
            nativeHyperlink(field),
          );
      }
      source.sections.push({ path, name: root.name, attrs: root.attrs });
      /**
       * The native page properties and their physical margin element.
       */
      const pp = all(root, "pagePr")[0],
        margin = child(pp, "margin");
      if (index === 0 && pp) {
        page = {
          width: mm(pp.attrs.width),
          height: mm(pp.attrs.height),
          marginTop: mm(margin?.attrs.top),
          marginBottom: mm(margin?.attrs.bottom),
          marginLeft: mm(margin?.attrs.left),
          marginRight: mm(margin?.attrs.right),
        };
        if (number(margin?.attrs.header) > 0)
          page.header = mm(margin?.attrs.header);
        if (number(margin?.attrs.footer) > 0)
          page.footer = mm(margin?.attrs.footer);
        /** Native section grid axes remain independent from physical page margins. */
        const grid=child(all(root,'secPr')[0],'grid'),lineGrid=sectionGridDistance(grid?.attrs.lineGrid),charGrid=sectionGridDistance(grid?.attrs.charGrid),manuscript=grid?.attrs.wonggojiFormat;
        if(manuscript!==undefined&&!['0','1','false','true'].includes(manuscript))throw new RangeError('원고지 정서법의 원본 값을 확인하세요.');
        Object.assign(page,sectionGridSettings({...(lineGrid?{lineGrid}:{}),...(charGrid?{charGrid}:{}),...(['1','true'].includes(manuscript??'')?{wonggojiFormat:true}:{})}));
      }
      for (/**
       * The current native XML, property or content binding selected by this iteration.
       */
      const p of root.children || [])
        if (local(p) === "p") doc.content!.push(...paragraph(p));
        else if (p.name !== "#text") doc.content!.push(opaque(p));
    },
  );
  if (!doc.content!.length) doc.content = [{ type: "paragraph" }];
  /**
   * Combine adjacent native list blocks.
   *
   * Joins consecutive lists of the same type so editor rendering preserves a continuous item sequence.
   *
   * @param {EditorNode} n - The n input.
   * @returns {void} Completes the local operation.
   * @example
   * mergeLists(n);
   */
  function mergeLists(n: EditorNode): void {
    if (!n.content) return;
    /**
     * The ordered results accumulated by the current conversion.
     */
    const out: EditorNode[] = [];
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const c of n.content) {
      mergeLists(c);
      /**
       * The preceding editor block inspected for adjacent-list merging.
       */
      const last = out.at(-1);
      if (
        ["bulletList", "orderedList"].includes(c.type) &&
        last?.type === c.type
      )
        last.content!.push(...c.content!);
      else out.push(c);
    }
    n.content = out;
  }
  mergeLists(doc);
  source.doc = clone(doc);
  source.page = clone(page);
  return { doc, page, warnings, format: "hwpx", source };
}
/**
 * Build native character properties.
 *
 * Creates independent OWPML character formatting from editor marks and a registered font reference.
 *
 * @param {number} id - The id input.
 * @param {CharacterStyle} style - The style input.
 * @param {number[]} fontIds - Registered font identifiers in native language order.
 * @returns {XmlNode} The computed result of this operation.
 * @example
 * makeChar(id, style, fontIds);
 */
function makeChar(id: number, style: CharacterStyle, fontIds: number[]): XmlNode {
  /**
   * Character formatting settings supplied to the native character-property builder.
   */
  const s = style || {};
  /**
   * The normalized attribute representation used by the current XML conversion.
   */
  const a = s.attrs || {};
  /** Complete validated measurement arrays prevent unrelated edits from resetting native values. */
  const metrics = characterMetrics(a.nativeCharacterMetrics);
  /** Inactive directions and color remain part of the serialized native character shape. */
  const shadow = characterShadow(a);
  /**
   * Serialize one measurement's seven OWPML language attributes.
   *
   * Validated arrays retain their signed values instead of replacing imported
   * per-language measurements with a repeated default.
   * @param {keyof CharacterMetrics} key - Native measurement array to serialize.
   * @returns {Record<string, number>} OWPML percentage attributes in native language order.
   * @example
   * languageMetrics('spacing'); // Preserves Hangul and Latin spacing separately.
   */
  const languageMetrics = (
    key: keyof typeof metrics,
  ): Record<string, number> => {
    /** OWPML language-value attributes constructed without losing signed percentages. */
    const result: Record<string, number> = {};
    for (let language = 0; language < 7; language++)
      result[CHARACTER_LANGUAGES[language]] = metrics[key][language];
    return result;
  };
  /**
   * The text-decoration mark names enabled for the current character style.
   */
  const tags = s.tags || [];
  /**
   * Compute the langAttrs result.
   *
   * Applies the local transformation used by the HWPX import or export workflow.
   *
   * @param {unknown} value - The value input.
   * @returns {Record<string, unknown>} The computed result of this operation.
   * @example
   * langAttrs(value);
   */
  const langAttrs = (value: unknown): Record<string, unknown> =>
    Object.fromEntries(
      ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"].map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {string} k - The k input.
         * @returns {[string, unknown]} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (k) => [k, value],
      ),
    );
  /**
   * The parsed scalar or XML element being constructed by the current conversion.
   */
  const n = el(
    "hh:charPr",
    {
      id,
      height: nativeFontHeight(a.fontSize),
      textColor: normalizeColor(a.color) || "#000000",
      shadeColor: normalizeColor(a.backgroundColor, true) || "none",
      useFontSpace: nativeSpacingFlag(a.nativeUseFontSpace) ? 1 : 0,
      useKerning: nativeSpacingFlag(a.nativeUseKerning) ? 1 : 0,
      ...(characterEmphasis(a.nativeEmphasisType)<13 ? {symMark:NATIVE_EMPHASIS_TYPES[characterEmphasis(a.nativeEmphasisType)]} : {}),
      borderFillIDRef: 1,
    },
    [
      el("hh:fontRef", Object.fromEntries(CHARACTER_LANGUAGES.map(
        /**
         * Pair each native language with its independently registered font.
         *
         * Equal numeric IDs in different source tables no longer collapse faces.
         * @param {string} language - Native font reference attribute.
         * @param {number} index - Language-array slot.
         * @returns {[string, number]} Native language/font reference pair.
         * @example
         * // Latin can reference a different font from Hangul.
         */
        (language, index) => [language, fontIds[index]],
      ))),
      el("hh:ratio", languageMetrics("ratio")),
      el("hh:spacing", languageMetrics("spacing")),
      el("hh:relSz", languageMetrics("relativeSize")),
      el("hh:offset", languageMetrics("offset")),
      el("hh:underline", {
        type: tags.includes("underline") ? s.decorations?.underline?.nativePosition || "BOTTOM" : "NONE",
        shape: NATIVE_LINE_PATTERNS[s.decorations?.underline?.nativePattern || 0],
        color: s.decorations?.underline?.nativeColor || a.color || "#000000",
      }),
      el("hh:strikeout", {
        shape: tags.includes("strike") ? NATIVE_LINE_PATTERNS[s.decorations?.strike?.nativePattern || 0] : "NONE",
        color: s.decorations?.strike?.nativeColor || "#000000",
      }),
      el("hh:outline", characterOutline(a.nativeOutlineType)===7 ? {} : { type: NATIVE_OUTLINE_TYPES[characterOutline(a.nativeOutlineType)] }),
      el("hh:shadow", {
        type: shadow.type,
        color: shadow.color,
        offsetX: shadow.x,
        offsetY: shadow.y,
      }),
    ],
  );
  for (/**
   * The current native XML, property or content binding selected by this iteration.
   */
  const t of ["bold", "italic", "superscript", "subscript"])
    if (tags.includes(t))
      n.children.push(
        el(
          `hh:${{ superscript: "supscript", subscript: "subscript" }[t] || t}`,
        ),
      );
  return n;
}
/**
 * Build native paragraph properties.
 *
 * Serializes paragraph alignment, list references, spacing, margins and pagination attributes.
 *
 * @param {number} id - The id input.
 * @param {NodeAttributes} attrs - The attrs input.
 * @returns {XmlNode} The computed result of this operation.
 * @example
 * makePara(id, attrs);
 */
function makePara(id: number, attrs: NodeAttributes = {}): XmlNode {
  /** Fixed line distances must not be serialized as large percentage values. */
  const fixedLine =
    fixedLineHeightPoints(attrs.lineHeight) !== null ||
    /em$/i.test(String(attrs.lineHeight))
      ? parseParagraphMeasure(attrs.lineHeight)
      : null;
  /**
   * The normalized native horizontal paragraph alignment.
   */
  const align = hwpxParagraphAlignment(attrs.textAlign);
  return el(
    "hh:paraPr",
    {
      id,
      tabPrIDRef: 0,
      condense: hwpxParagraphCondense(attrs),
      fontLineHeight: 0,
      snapToGrid: paragraphSnapToGrid(attrs) ? 1 : 0,
      suppressLineNumbers: 0,
      checked: 0,
    },
    [
      el("hh:align", { horizontal: align, vertical: "BASELINE" }),
      el("hh:heading", {
        type:
          attrs.listKind === "bulletList"
            ? "BULLET"
            : attrs.listKind === "orderedList"
              ? "NUMBER"
              : "NONE",
        idRef: attrs.listId || 0,
        level: attrs.listLevel || 0,
      }),
      el("hh:breakSetting", {
        ...hwpxWordBreaks(attrs),
        widowOrphan: 0,
        keepWithNext: 0,
        keepLines: 0,
        pageBreakBefore: attrs.pageBreakBefore || attrs.pageBreak ? 1 : 0,
        lineWrap: "BREAK",
      }),
      el("hh:autoSpacing", { eAsianEng: 0, eAsianNum: 0 }),
      el(
        "hh:margin",
        {},
        Object.entries({
          intent: "textIndent",
          left: "marginLeft",
          right: "marginRight",
          prev: "marginTop",
          next: "marginBottom",
        }).map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {[string, string]} options - Document content and serialization settings.
           * @returns {XmlNode} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          ([k, key]) => {
            /** Explicit paragraph unit is retained in the modern native value/unit pair. */
            const measure = parseParagraphMeasure(
              attrs[key] ||
                (attrs.listKind && k === "left" ? "12pt" : undefined),
            );
            return el(`hc:${k}`, { value: measure.value, unit: measure.unit });
          },
        ),
      ),
      el("hh:lineSpacing", {
        type: fixedLine === null ? "PERCENT" : "FIXED",
        value:
          fixedLine === null ? linePercent(attrs.lineHeight) : fixedLine.value,
        unit: fixedLine?.unit || "HWPUNIT",
      }),
      el("hh:border", {
        borderFillIDRef: 1,
        offsetLeft: 0,
        offsetRight: 0,
        offsetTop: 0,
        offsetBottom: 0,
        connect: 0,
        ignoreMargin: 0,
      }),
    ],
  );
}
/**
 * Build independent document defaults.
 *
 * Creates the OWPML reference lists required by a new document without copying installed application templates.
 *
 * @returns {XmlNode} The computed result of this operation.
 * @example
 * makeHeader();
 */
function makeHeader(): XmlNode {
  /**
   * Compute the border result.
   *
   * Applies the local transformation used by the HWPX import or export workflow.
   *
   * @param {number} id - The id input.
   * @returns {XmlNode} The computed result of this operation.
   * @example
   * border(id);
   */
  const border = (id: number): XmlNode =>
    el(
      "hh:borderFill",
      {
        id,
        threeD: 0,
        shadow: 0,
        centerLine: "NONE",
        breakCellSeparateLine: 0,
      },
      [
        el("hh:slash", { type: "NONE", Crooked: 0, isCounter: 0 }),
        el("hh:backSlash", { type: "NONE", Crooked: 0, isCounter: 0 }),
        ...["left", "right", "top", "bottom"].map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {string} k - The k input.
           * @returns {XmlNode} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (k) =>
            el(`hh:${k}Border`, {
              type: id === 1 ? "NONE" : "SOLID",
              width: "0.12 mm",
              color: "#555555",
            }),
        ),
        el("hh:diagonal", { type: "SOLID", width: "0.1 mm", color: "#000000" }),
      ],
    );
  /**
   * The validated XML root for the current section or generated header.
   */
  const root = parse(`${XML}<hh:head ${NS} version="1.5" secCnt="1"/>`);
  root.children = [
    el("hh:beginNum", {
      page: 1,
      footnote: 1,
      endnote: 1,
      pic: 1,
      tbl: 1,
      equation: 1,
    }),
    el("hh:refList", {}, [
      el(
        "hh:fontfaces",
        { itemCnt: 7 },
        ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"].map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {string} lang - The lang input.
           * @returns {XmlNode} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (lang) => el("hh:fontface", { lang, fontCnt: 0 }),
        ),
      ),
      el("hh:borderFills", { itemCnt: 2 }, [border(1), border(2)]),
      el("hh:charProperties", { itemCnt: 0 }),
      el("hh:tabProperties", { itemCnt: 1 }, [
        el("hh:tabPr", { id: 0, autoTabLeft: 0, autoTabRight: 0 }),
      ]),
      el("hh:paraProperties", { itemCnt: 0 }),
      el("hh:styles", { itemCnt: 1 }, [
        el("hh:style", {
          id: 0,
          type: "PARA",
          name: "바탕글",
          engName: "Normal",
          paraPrIDRef: 0,
          charPrIDRef: 0,
          nextStyleIDRef: 0,
          langID: 1042,
          lockForm: 0,
        }),
      ]),
    ]),
    el("hh:compatibleDocument", { targetProgram: "HWP201X" }, [
      el("hh:layoutCompatibility"),
    ]),
    el("hh:docOption", {}, [
      el("hh:linkinfo", { path: "", pageInherit: 0, footnoteInherit: 0 }),
    ]),
  ];
  return root;
}
/**
 * Build physical section properties.
 *
 * Writes page dimensions, margins and independent section defaults in native document units.
 *
 * @param {HwpxPage} page - The page input.
 * @returns {XmlNode} The computed result of this operation.
 * @example
 * sectionProperties(page);
 */
function sectionProperties(page: HwpxPage): XmlNode {
  return el(
    "hp:secPr",
    {
      id: "",
      textDirection: "HORIZONTAL",
      spaceColumns: 1134,
      tabStop: 8000,
      tabStopVal: 4000,
      tabStopUnit: "HWPUNIT",
      outlineShapeIDRef: 0,
      memoShapeIDRef: 0,
      textVerticalWidthHead: 0,
      masterPageCnt: 0,
    },
    [
      el("hp:grid", { lineGrid: sectionGridDistance(page.lineGrid), charGrid: sectionGridDistance(page.charGrid), wonggojiFormat: page.wonggojiFormat ? 1 : 0 }),
      el("hp:startNum", {
        pageStartsOn: "BOTH",
        page: 0,
        pic: 0,
        tbl: 0,
        equation: 0,
      }),
      el("hp:visibility", {
        hideFirstHeader: 0,
        hideFirstFooter: 0,
        hideFirstMasterPage: 0,
        border: "SHOW_ALL",
        fill: "SHOW_ALL",
        hideFirstPageNum: 0,
        hideFirstEmptyLine: 0,
        showLineNumber: 0,
      }),
      el("hp:lineNumberShape", {
        restartType: 0,
        countBy: 0,
        distance: 0,
        startNumber: 0,
      }),
      el(
        "hp:pagePr",
        {
          landscape: "WIDELY",
          width: unit(page.width),
          height: unit(page.height),
          gutterType: "LEFT_ONLY",
        },
        [
          el("hp:margin", {
            header: unit(page.header ?? 0),
            footer: unit(page.footer ?? 0),
            gutter: 0,
            left: unit(page.marginLeft),
            right: unit(page.marginRight),
            top: unit(page.marginTop),
            bottom: unit(page.marginBottom),
          }),
        ],
      ),
    ],
  );
}
/**
 * Extract the document preview text.
 *
 * Collects readable text with block separators for the package preview entry.
 *
 * @param {EditorNode} doc - The doc input.
 * @returns {string} The computed result of this operation.
 * @example
 * plain(doc);
 */
function plain(doc: EditorNode): string {
  return doc?.type === "text"
    ? doc.text || ""
    : (doc?.content || [])
        .map(plain)
        .join(["doc", "table", "tableRow"].includes(doc?.type) ? "\n" : "");
}
/**
 * Export an HWPX document.
 *
 * Serializes supported editing changes while retaining original XML for untouched and opaque source objects.
 *
 * @param {HwpxWriteOptions} options - Document content and serialization settings.
 * @returns {Promise<Uint8Array>} The computed result of this operation.
 * @throws {Error} If the input is malformed or cannot be represented safely.
 * @example
 * writeHwpx(options);
 */
export async function writeHwpx({
  doc: inputDoc,
  page: inputPage,
  title = "포한 문서",
  source,
}: HwpxWriteOptions): Promise<Uint8Array> {
  if (!inputDoc || inputDoc.type !== "doc")
    throw new Error("저장할 문서가 없습니다.");
  /**
   * The editable document hierarchy produced by the conversion.
   */
  const doc = inputDoc as EditorNode;
  validateHyperlinkMarks(doc);
  /**
   * Normalized physical page settings and the presence of a retained HWPX source package.
   */
  const page = normalizePage(inputPage),
    imported = source?.kind === "hwpx" && source.files && source.nodes;
  /**
   * The complete mapping of package paths to their uncompressed bytes.
   */
  const files = imported
    ? Object.fromEntries(
        Object.entries(source.files).map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {[string, string]} options - Document content and serialization settings.
           * @returns {[string, Uint8Array<ArrayBufferLike>]} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          ([k, v]) => [k, unbase64(v)],
        ),
      )
    : {};
  /** Native hyperlink identifiers reserved by retained fields before new fields are generated. */
  const usedHyperlinkIds = new Set<string>();
  if (imported) {
    for (/** The retained section inspected for native hyperlink identity and destination validation. */ const section of source.sections) {
      /** The validated native section root containing any retained hyperlink controls. */
      const root = parse(strFromU8(files[section.path]));
      for (/** The native field whose identifiers and hyperlink destination remain part of the output. */ const field of all(
        root,
        "fieldBegin",
      )) {
        if (field.attrs.id) usedHyperlinkIds.add(field.attrs.id);
        if (field.attrs.fieldid) usedHyperlinkIds.add(field.attrs.fieldid);
        if (field.attrs.type === "HYPERLINK") nativeHyperlink(field);
      }
    }
  }
  let nextLinkId = 1000000000;
  /**
   * Allocate an unused native hyperlink control identifier.
   *
   * Avoids retained field identifiers when an imported document receives new
   * or regenerated hyperlinks, keeping begin/end references unambiguous.
   *
   * @returns {string} A unique decimal identifier for a native hyperlink marker.
   * @example
   * allocateHyperlinkId();
   */
  function allocateHyperlinkId(): string {
    while (usedHyperlinkIds.has(String(nextLinkId))) nextLinkId++;
    /** The unused native identifier reserved for the next generated marker. */
    const id = String(nextLinkId++);
    usedHyperlinkIds.add(id);
    return id;
  }
  /**
   * Build the final HWPX archive.
   *
   * Stores the MIME entry first without compression and compresses the remaining package entries.
   *
   * @returns {Uint8Array<ArrayBuffer>} The computed result of this operation.
   * @example
   * pack();
   */
  const pack = () =>
    zipSync(
      {
        mimetype: [strToU8("application/hwp+zip"), { level: 0 }],
        ...Object.fromEntries(
          Object.entries(files).filter(
            /**
             * Evaluate the filter callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {[string, Uint8Array<ArrayBufferLike>]} options - Document content and serialization settings.
             * @returns {boolean} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            ([k]) => k !== "mimetype",
          ),
        ),
      },
      { level: 6 },
    );
  if (
    imported &&
    clean(doc) === clean(source.doc) &&
    clean(page) === clean(normalizePage(source.page))
  )
    return pack();
  /**
   * The native document header containing formatting reference collections.
   */
  const header = imported
    ? parse(strFromU8(files["Contents/header.xml"]))
    : makeHeader();
  /**
   * The native header reference-list container.
   */
  const ref = child(header, "refList")!;
  /**
   * Ensure a native reference collection exists.
   *
   * Returns the existing header reference list or creates a new empty collection in that header.
   *
   * @param {string} name - The name input.
   * @returns {XmlNode} The computed result of this operation.
   * @example
   * ensure(name);
   */
  const ensure = (name: string): XmlNode => {
    let n = child(ref, name);
    if (!n) {
      n = el(`hh:${name}`, { itemCnt: 0 });
      ref.children.push(n);
    }
    return n;
  };
  /**
   * The header collections receiving character, paragraph and font references.
   */
  const charList = ensure("charProperties"),
    paraList = ensure("paraProperties"),
    fontfaces = ensure("fontfaces");
  /**
   * Allocate the next reference identifier.
   *
   * Scans existing native identifiers so newly generated properties do not collide with imported values.
   *
   * @param {XmlNode} list - The list input.
   * @returns {number} The computed result of this operation.
   * @example
   * next(list);
   */
  const next = (list: XmlNode): number =>
    Math.max(
      -1,
      ...list.children.map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {XmlNode} n - The n input.
         * @returns {number} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (n) => number(n.attrs?.id, -1),
      ),
    ) + 1;
  let nextChar = next(charList),
    nextPara = next(paraList),
    nextObj = 1000;
  /**
   * Deduplication caches for generated character styles, paragraph styles and fonts.
   */
  const charCache = new Map<string, number>(),
    paraCache = new Map<string, number>(),
    fontCache = new Map<string, number>();
  /**
   * Register an independent font reference.
   *
   * Adds the requested font name to every language reference list and caches its identifier.
   *
   * @param {string} face - The face input.
   * @returns {number} The computed result of this operation.
   * @example
   * addFont(face);
   */
  const addFont = (face: string): number => {
    if (fontCache.has(face)) return fontCache.get(face)!;
    /**
     * The language-specific native font-reference collections.
     */
    const faces = kids(fontfaces, "fontface");
    let id = 0;
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const ff of faces)
      id = Math.max(
        id,
        ...kids(ff, "font").map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {XmlNode} n - The n input.
           * @returns {number} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (n) => number(n.attrs.id) + 1,
        ),
      );
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const ff of faces) {
      ff.children.push(
        el("hh:font", { id, face, type: "TTF", isEmbedded: 0 }, [
          el("hh:typeInfo", {
            familyType: "FCAT_GOTHIC",
            weight: 5,
            proportion: 3,
            contrast: 0,
            strokeVariation: 0,
            armStyle: 0,
            letterform: 0,
            midline: 0,
            xHeight: 0,
          }),
        ]),
      );
      ff.attrs.fontCnt = String(ff.children.length);
    }
    fontCache.set(face, id);
    return id;
  };
  /**
   * Register reusable character formatting.
   *
   * Deduplicates editor marks and optional heading formatting into native character-property references.
   *
   * @param {EditorMark[]} marks - The marks input.
   * @param {number} heading - The heading input.
   * @returns {number} The computed result of this operation.
   * @example
   * charId(marks, heading);
   */
  const charId = (marks: EditorMark[] = [], heading?: number): number => {
    /**
     * The normalized character style used to deduplicate generated formatting.
     */
    const style = {
      tags: marks
        .map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {{ [key: string]: any; type: string; attrs?: Record<string, any> | undefined; }} m - The m input.
           * @returns {string} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (m) => m.type,
        )
        .filter(
          /**
           * Evaluate the filter callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {string} t - The t input.
           * @returns {boolean} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (t) => t !== "textStyle" && t !== "link",
        ),
      attrs: {
        ...marks.find(
          /**
           * Evaluate the find callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {{ [key: string]: any; type: string; attrs?: Record<string, any> | undefined; }} m - The m input.
           * @returns {boolean} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (m) => m.type === "textStyle",
        )?.attrs,
      },
    };
    if (heading && !style.attrs.fontSize)
      style.attrs.fontSize = `${defaultFontSize(heading)}pt`;
    /** Native decoration attributes participate in character-style identity independently of mark names. */
    const decorated: CharacterStyle = style;
    for (/** Each original line retains its own native color and pattern after unrelated edits. */ const mark of marks)
      if (mark.type === "underline" || mark.type === "strike") {
        decorated.decorations ||= {};
        decorated.decorations[mark.type] = characterDecoration(mark.attrs,mark.type);
      }
    if (heading && style.attrs.nativeNormalWeight !== true && !style.tags.includes("bold")) style.tags.push("bold");
    for (/** The link mark whose standard native visual formatting needs a default. */ const mark of marks) {
      if (mark.type === "link") {
        if (!style.attrs.color) style.attrs.color = "#0000FF";
        if (mark.attrs?.nativeDefaultUnderline !== false && !style.tags.includes("underline")) style.tags.push("underline");
      }
    }
    /**
     * The element name or canonical cache key selected for this conversion.
     */
    const key = JSON.stringify(style);
    if (charCache.has(key)) return charCache.get(key)!;
    /**
     * The stable identifier allocated or selected for the current native reference.
     */
    const id = nextChar++;
    /** Every language chooses its own face while font registration retains source table IDs. */
    const fontIds: number[] = [];
    for (
      /** Validated face name supplied by this character's language table. */
      const face of characterFonts(style.attrs.nativeCharacterFonts, style.attrs.fontFamily || "맑은 고딕")
    ) fontIds.push(addFont(face || style.attrs.fontFamily || "맑은 고딕"));
    charList.children.push(makeChar(id, style, fontIds));
    charCache.set(key, id);
    return id;
  };
  /**
   * Register reusable paragraph formatting.
   *
   * Deduplicates paragraph attributes into the native paragraph-property reference list.
   *
   * @param {NodeAttributes} attrs - The attrs input.
   * @returns {number} The computed result of this operation.
   * @example
   * paraId(attrs);
   */
  const paraId = (attrs: NodeAttributes = {}): number => {
    /**
     * The element name or canonical cache key selected for this conversion.
     */
    const key = JSON.stringify(attrs || {});
    if (paraCache.has(key)) return paraCache.get(key)!;
    /**
     * The stable identifier allocated or selected for the current native reference.
     */
    const id = nextPara++;
    paraList.children.push(makePara(id, attrs));
    paraCache.set(key, id);
    return id;
  };
  charId();
  paraId();
  /**
   * Find the retained source of an editor node.
   *
   * Looks up the node source identifier only when an imported HWPX package is available.
   *
   * @param {EditorNode} node - The node input.
   * @returns {RetainedNode | null | undefined} The computed result of this operation.
   * @example
   * original(node);
   */
  const original = (node: EditorNode): RetainedNode | null | undefined =>
    imported ? source.nodes[node.attrs?.sourceId] : null;
  /**
   * Anchor an object in a native paragraph.
   *
   * Creates the paragraph and run container required for block objects in OWPML sections.
   *
   * @param {XmlNode} obj - The obj input.
   * @returns {XmlNode} The computed result of this operation.
   * @example
   * wrap(obj);
   */
  const wrap = (obj: XmlNode): XmlNode =>
    el(
      "hp:p",
      {
        id: nextObj++,
        paraPrIDRef: paraId({}),
        styleIDRef: 0,
        pageBreak: 0,
        columnBreak: 0,
        merged: 0,
      },
      [el("hp:run", { charPrIDRef: charId() }, [obj, el("hp:t")])],
    );
  /**
   * Reuse unchanged native XML when possible.
   *
   * Compares normalized editor state with retained state before returning the original source subtree.
   *
   * @param {EditorNode} node - The node input.
   * @returns {XmlNode | null} The computed result of this operation.
   * @example
   * saved(node);
   */
  const saved = (node: EditorNode): XmlNode | null => {
    /**
     * Character formatting settings supplied to the native character-property builder.
     */
    const s = original(node);
    return s && clean(node) === clean(s.original) ? parse(s.xml) : null;
  };
  /**
   * Serialize ordered inline content.
   *
   * Creates native text runs for mixed marks, tabs and hard breaks while rejecting unknown inline node types.
   *
   * @param {EditorNode[]} nodes - The nodes input.
   * @param {number} heading - The heading input.
   * @returns {XmlNode[]} The computed result of this operation.
   * @throws {Error} If the input is malformed or cannot be represented safely.
   * @example
   * textRuns(nodes, heading);
   */
  const textRuns = (nodes?: EditorNode[], heading?: number): XmlNode[] => {
    /**
     * The ordered results accumulated by the current conversion.
     */
    const out: XmlNode[] = [];
    let activeLink: GeneratedHyperlink | undefined;
    for (/**
     * The current native XML, property or content binding selected by this iteration.
     */
    const n of nodes || []) {
      let requestedLink: NativeHyperlink | undefined;
      for (/** The inline link mark defining this text node's native field scope. */ const mark of n.marks ||
        []) {
        if (mark.type === "link")
          requestedLink = {
            href: safeHyperlinkUrl(mark.attrs?.href),
            target: mark.attrs?.target === "_blank" ? "_blank" : "_self",
            rel: "noopener noreferrer nofollow",
          };
      }
      if (
        activeLink &&
        (activeLink.href !== requestedLink?.href ||
          activeLink.target !== requestedLink.target)
      ) {
        out.push(
          el("hp:run", { charPrIDRef: charId() }, [
            el("hp:ctrl", {}, [
              el("hp:fieldEnd", {
                beginIDRef: activeLink.id,
                fieldid: activeLink.fieldId,
              }),
            ]),
          ]),
        );
        activeLink = undefined;
      }
      if (!activeLink && requestedLink) {
        activeLink = {
          ...requestedLink,
          id: allocateHyperlinkId(),
          fieldId: allocateHyperlinkId(),
        };
        out.push(
          el("hp:run", { charPrIDRef: charId() }, [
            el("hp:ctrl", {}, [makeHyperlinkField(activeLink)]),
          ]),
        );
      }
      if (n.type === "text") {
        /**
         * Text fragments split around tabs and hard line breaks for native run serialization.
         */
        const chunks = String(n.text).split(/(\n|\t)/);
        /**
         * The XML text container for the current serialized text fragment.
         */
        const t = el(
          "hp:t",
          {},
          chunks.filter(Boolean).map(
            /**
             * Evaluate the map callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {string} s - The s input.
             * @returns {XmlNode} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (s) =>
              s === "\n"
                ? el("hp:lineBreak")
                : s === "\t"
                  ? el("hp:tab", { width: 4000, leader: 0, type: 0 })
                  : txt(s),
          ),
        );
        out.push(el("hp:run", { charPrIDRef: charId(n.marks, heading) }, [t]));
      } else if (n.type === "hardBreak")
        out.push(
          el("hp:run", { charPrIDRef: charId() }, [
            el("hp:t", {}, [el("hp:lineBreak")]),
          ]),
        );
      else throw new Error(`문단 안의 ${n.type} 개체를 저장할 수 없습니다.`);
    }
    if (activeLink)
      out.push(
        el("hp:run", { charPrIDRef: charId() }, [
          el("hp:ctrl", {}, [
            el("hp:fieldEnd", {
              beginIDRef: activeLink.id,
              fieldid: activeLink.fieldId,
            }),
          ]),
        ]),
      );
    return out.length
      ? out
      : [el("hp:run", { charPrIDRef: charId([], heading) }, [el("hp:t")])];
  };
  /**
   * Serialize an embedded image object.
   *
   * Reuses unchanged source images or registers supported image data and native geometry in the package.
   *
   * @param {EditorNode} node - The node input.
   * @returns {XmlNode} The computed result of this operation.
   * @throws {Error} If the input is malformed or cannot be represented safely.
   * @example
   * makeImage(node);
   */
  const makeImage = (node: EditorNode): XmlNode => {
    /**
     * An unchanged original XML subtree available for direct reuse.
     */
    const old = saved(node);
    if (old) return old;
    /**
     * The image data URL and its validated supported-media match.
     */
    const src = node.attrs?.src || "",
      match = src.match(
        /^data:image\/(png|jpeg|gif|bmp|webp);base64,([A-Za-z0-9+/=\s]+)$/,
      );
    if (!match)
      throw new Error("이미지는 PNG/JPEG/GIF/BMP/WebP 데이터여야 합니다.");
    /**
     * The embedded image extension, unique manifest identifier and package-relative path.
     */
    const ext = match[1] === "jpeg" ? "jpg" : match[1],
      id = `forhanImage${nextObj++}`,
      path = `BinData/${id}.${ext}`;
    files[path] = unbase64(match[2]);
    imageItems.push({
      id,
      href: path,
      "media-type": `image/${match[1]}`,
      isEmbeded: 1,
    });
    /** Positive display dimensions resolved from explicit attributes or embedded raster metadata. */
    const dimensions = imageExportDimensions(node, files[path], match[1], page);
    /** Native picture dimensions expressed in HWP document units. */
    const width = Math.round(dimensions.width * 75),
      height = Math.round(dimensions.height * 75);
    return el(
      "hp:pic",
      {
        id: nextObj++,
        zOrder: 0,
        numberingType: "PICTURE",
        textWrap: "TOP_AND_BOTTOM",
        textFlow: "BOTH_SIDES",
        lock: 0,
        dropcapstyle: "None",
        href: "",
        groupLevel: 0,
        instid: nextObj++,
        reverse: 0,
      },
      [
        el("hp:offset", { x: 0, y: 0 }),
        el("hp:orgSz", { width, height }),
        el("hp:curSz", { width, height }),
        el("hp:flip", { horizontal: 0, vertical: 0 }),
        el("hp:rotationInfo", {
          angle: 0,
          centerX: Math.round(width / 2),
          centerY: Math.round(height / 2),
          rotateimage: 1,
        }),
        el(
          "hp:renderingInfo",
          {},
          ["transMatrix", "scaMatrix", "rotMatrix"].map(
            /**
             * Evaluate the map callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {string} n - The n input.
             * @returns {XmlNode} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (n) => el(`hc:${n}`, { e1: 1, e2: 0, e3: 0, e4: 0, e5: 1, e6: 0 }),
          ),
        ),
        el(
          "hp:imgRect",
          {},
          [
            [0, 0],
            [width, 0],
            [width, height],
            [0, height],
          ].map(
            /**
             * Evaluate the map callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {number[]} options - Document content and serialization settings.
             * @param {number} i - The i input.
             * @returns {XmlNode} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            ([x, y], i) => el(`hc:pt${i}`, { x, y }),
          ),
        ),
        el("hp:imgClip", { left: 0, right: width, top: 0, bottom: height }),
        el("hp:inMargin", { left: 0, right: 0, top: 0, bottom: 0 }),
        el("hp:imgDim", { dimwidth: width, dimheight: height }),
        el("hc:img", {
          binaryItemIDRef: id,
          bright: 0,
          contrast: 0,
          effect: "REAL_PIC",
          alpha: 0,
        }),
        el("hp:effects"),
        el("hp:sz", {
          width,
          widthRelTo: "ABSOLUTE",
          height,
          heightRelTo: "ABSOLUTE",
          protect: 0,
        }),
        el("hp:pos", {
          treatAsChar: 1,
          affectLSpacing: 0,
          flowWithText: 1,
          allowOverlap: 0,
          holdAnchorAndSO: 0,
          vertRelTo: "PARA",
          horzRelTo: "PARA",
          vertAlign: "TOP",
          horzAlign: "LEFT",
          vertOffset: 0,
          horzOffset: 0,
        }),
        el("hp:outMargin", { left: 0, right: 0, top: 0, bottom: 0 }),
        el("hp:shapeComment", {}, [txt(node.attrs?.alt || "")]),
      ],
    );
  };
  /**
   * New embedded-image manifest entries accumulated during serialization.
   */
  const imageItems: Record<string, string | number>[] = [];
  /**
   * Allocated border and fill identifiers indexed by their canonical formatting keys.
   */
  const borderCache = new Map<string, number>();
  /**
   * Register a reusable cell border and fill.
   *
   * Preserves imported border properties while creating independent native fill references for edited cells.
   *
   * @param {string} color - The color input.
   * @param {string} baseId - The base id input.
   * @returns {number} The computed result of this operation.
   * @example
   * cellBorder(color, baseId);
   */
  function cellBorder(color?: string, baseId?: string): number {
    /**
     * The element name or canonical cache key selected for this conversion.
     */
    const key = `${baseId || "new"}:${color || "none"}`;
    if (borderCache.has(key)) return borderCache.get(key)!;
    /**
     * The destination native formatting collection and its newly allocated identifier.
     */
    const list = ensure("borderFills"),
      id = Math.max(1, next(list));
    /**
     * The imported border definition used as the starting point for a cell-fill edit.
     */
    const base = baseId
      ? list.children.find(
          /**
           * Evaluate the find callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {XmlNode} n - The n input.
           * @returns {boolean} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (n) => String(n.attrs.id) === String(baseId),
        )
      : null;
    /**
     * The parsed scalar or XML element being constructed by the current conversion.
     */
    const n = base
      ? clone(base)
      : el(
          "hh:borderFill",
          {
            threeD: 0,
            shadow: 0,
            centerLine: "NONE",
            breakCellSeparateLine: 0,
          },
          [
            el("hh:slash", { type: "NONE", Crooked: 0, isCounter: 0 }),
            el("hh:backSlash", { type: "NONE", Crooked: 0, isCounter: 0 }),
            ...["left", "right", "top", "bottom"].map(
              /**
               * Evaluate the map callback.
               *
               * Processes the current collection item while preserving the surrounding operation ordering.
               *
               * @param {string} k - The k input.
               * @returns {XmlNode} The computed result of this operation.
               * @example
               * collection.map(callback);
               */
              (k) =>
                el(`hh:${k}Border`, {
                  type: "SOLID",
                  width: "0.12 mm",
                  color: "#555555",
                }),
            ),
          ],
        );
    n.attrs.id = String(id);
    n.children = n.children.filter(
      /**
       * Evaluate the filter callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => local(n) !== "fillBrush",
    );
    if (color)
      n.children.push(
        el("hc:fillBrush", {}, [
          el("hc:winBrush", {
            faceColor: color,
            hatchColor: "#999999",
            alpha: 0,
          }),
        ]),
      );
    list.children.push(n);
    list.attrs.itemCnt = String(list.children.length);
    borderCache.set(key, id);
    return id;
  }
  /**
   * Allocated native list identifiers indexed by list type and starting number.
   */
  const listIds = new Map<string, number>();
  /**
   * Allocated native heading-style identifiers indexed by level and paragraph attributes.
   */
  const headingStyles = new Map<string, number>();
  /**
   * Register a semantic heading style.
   *
   * Creates a native paragraph style with its level-specific name and character formatting.
   *
   * @param {number} level - The level input.
   * @param {NodeAttributes} attrs - The attrs input.
   * @returns {number} The computed result of this operation.
   * @example
   * headingStyle(level, attrs);
   */
  function headingStyle(level: number, attrs: NodeAttributes): number {
    /**
     * The element name or canonical cache key selected for this conversion.
     */
    const key = JSON.stringify({ level, attrs });
    if (headingStyles.has(key)) return headingStyles.get(key)!;
    /**
     * The destination native formatting collection and its newly allocated identifier.
     */
    const list = ensure("styles"),
      id = next(list);
    list.children.push(
      el("hh:style", {
        id,
        type: "PARA",
        name: `제목 ${level}`,
        engName: `Heading ${level}`,
        paraPrIDRef: paraId(attrs),
        charPrIDRef: charId([], level),
        nextStyleIDRef: 0,
        langID: 1042,
        lockForm: 0,
      }),
    );
    list.attrs.itemCnt = String(list.children.length);
    headingStyles.set(key, id);
    return id;
  }
  /**
   * Register native list formatting.
   *
   * Creates bullet or numbered-list definitions and caches identifiers for equivalent list settings.
   *
   * @param {string} kind - The kind input.
   * @param {number} start - The start input.
   * @returns {number} The computed result of this operation.
   * @example
   * listId(kind, start);
   */
  function listId(kind: string, start = 1): number {
    /**
     * The element name or canonical cache key selected for this conversion.
     */
    const key = `${kind}:${start}`;
    if (listIds.has(key)) return listIds.get(key)!;
    /**
     * The native reference collection receiving a newly generated formatting definition.
     */
    const list = ensure(kind === "bulletList" ? "bullets" : "numberings");
    /**
     * The stable identifier allocated or selected for the current native reference.
     */
    const id = Math.max(1, next(list));
    if (kind === "bulletList")
      list.children.push(
        el("hh:bullet", { id, char: "•", useImage: 0 }, [
          el("hh:paraHead", {
            level: 0,
            align: "LEFT",
            useInstWidth: 0,
            autoIndent: 1,
            widthAdjust: 0,
            textOffsetType: "PERCENT",
            textOffset: 50,
            numFormat: "DIGIT",
            charPrIDRef: charId(),
            checkable: 0,
          }),
        ]),
      );
    else
      list.children.push(
        el(
          "hh:numbering",
          { id, start: start - 1 },
          Array.from(
            { length: 7 },
            /**
             * Evaluate the from callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {unknown} _ - The _ input.
             * @param {number} i - The i input.
             * @returns {XmlNode} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (_, i) =>
              el(
                "hh:paraHead",
                {
                  start,
                  level: i + 1,
                  align: "LEFT",
                  useInstWidth: 1,
                  autoIndent: 1,
                  widthAdjust: 0,
                  textOffsetType: "PERCENT",
                  textOffset: 50,
                  numFormat: "DIGIT",
                  charPrIDRef: 4294967295,
                  checkable: 0,
                },
                [txt(`^${i + 1}.`)],
              ),
          ),
        ),
      );
    list.attrs.itemCnt = String(list.children.length);
    listIds.set(key, id);
    return id;
  }
  /**
   * Serialize a native table hierarchy.
   *
   * Calculates merged-cell coordinates while retaining imported cell geometry and unknown XML properties.
   *
   * @param {EditorNode} node - The node input.
   * @returns {XmlNode} The computed result of this operation.
   * @example
   * makeTable(node);
   */
  function makeTable(node: EditorNode): XmlNode {
    /**
     * An unchanged original XML subtree available for direct reuse.
     */
    const old = saved(node);
    if (old) return old;
    /**
     * The retained table source and the native table element being serialized.
     */
    const src = original(node),
      table = src
        ? parse(src.xml)
        : el("hp:tbl", {
            id: nextObj++,
            zOrder: 0,
            numberingType: "TABLE",
            textWrap: "TOP_AND_BOTTOM",
            textFlow: "BOTH_SIDES",
            lock: 0,
            dropcapstyle: "None",
            pageBreak: "CELL",
            repeatHeader: 1,
            rowCnt: node.content?.length || 0,
            colCnt: 0,
            cellSpacing: 0,
            borderFillIDRef: cellBorder(),
            noAdjust: 0,
          });
    /**
     * The editable rows to serialize into the current native table.
     */
    const rows = node.content || [];
    /**
     * A row-and-column occupancy grid used to position merged table cells.
     */
    const occupied: number[][] = [];
    let maxCols = 1;
    /**
     * Resolved native coordinates and spans for every serialized table cell.
     */
    const coords = rows.map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {EditorNode} r - The r input.
       * @param {number} ri - The ri input.
       * @returns {{ c: EditorNode; start: number; cs: number; rs: number; }[]} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (r, ri) => {
        occupied[ri] ||= [];
        let col = 0;
        return (r.content || []).map(
          /**
           * Evaluate the map callback.
           *
           * Processes the current collection item while preserving the surrounding operation ordering.
           *
           * @param {EditorNode} c - The c input.
           * @returns {{ c: EditorNode; start: number; cs: number; rs: number; }} The computed result of this operation.
           * @example
           * collection.map(callback);
           */
          (c) => {
            while (occupied[ri][col]) col++;
            /**
             * The cell starting column, column span and row span used by the occupancy grid.
             */
            const start = col,
              cs = Math.max(1, number(c.attrs?.colspan, 1)),
              rs = Math.max(1, number(c.attrs?.rowspan, 1));
            if (col + cs > 4096 || rs > 4096)
              throw new Error("표의 셀 병합 범위가 너무 큽니다.");
            for (let y = ri; y < ri + rs; y++) {
              occupied[y] ||= [];
              for (let x = col; x < col + cs; x++) occupied[y][x] = 1;
            }
            col += cs;
            maxCols = Math.max(maxCols, col);
            return { c, start, cs, rs };
          },
        );
      },
    );
    /** Explicit source properties take precedence over older retained XML-only metadata. */
    const priorProperties=readHwpxTableProperties(table.attrs),properties=nativeTableProperties(node.attrs?.nativeTableProperties??priorProperties),spacingChanged=properties.cellSpacing!==priorProperties.cellSpacing;
    /** Explicit editor column measurements, with page-width fallback only for missing slots. */
    const columnWidths = editableColumnWidths(
      coords,
      maxCols,
      Math.max(1,unit(page.width - page.marginLeft - page.marginRight)-properties.cellSpacing*(maxCols+1)),
    );
    /** Native table dimensions derived from resolved columns rather than forced page-body width. */
    const width = columnSpanWidth(columnWidths)+properties.cellSpacing*(maxCols+1),
      height = rows.length * 2400+properties.cellSpacing*(rows.length+1);
    let geometryChanged = !src || src.original.content?.length !== rows.length;
    for (/** The positioned row checked for explicit cell-geometry changes. */ const row of coords) {
      for (/** The positioned cell compared with its retained native geometry. */ const cell of row) {
        /** The original editable cell snapshot corresponding to this positioned cell. */
        const previous = original(cell.c)?.original;
        if (
          !previous ||
          clean(previous.attrs?.colwidth) !== clean(cell.c.attrs?.colwidth) ||
          number(previous.attrs?.colspan, 1) !== cell.cs ||
          number(previous.attrs?.rowspan, 1) !== cell.rs
        )
          geometryChanged = true;
      }
    }
    /** A spacing-only edit retains the original fitted object height plus the independent perimeter/inter-row gaps. */
    const cellsChanged=geometryChanged;
    geometryChanged ||= spacingChanged;
    table.attrs = {
      ...table.attrs,
      ...hwpxTableProperties(properties),
      rowCnt: String(rows.length),
      colCnt: String(maxCols),
    };
    if (!src)
      table.children = [
        el("hp:sz", {
          width,
          widthRelTo: "ABSOLUTE",
          height,
          heightRelTo: "ABSOLUTE",
          protect: 0,
        }),
        el("hp:pos", {
          treatAsChar: 1,
          affectLSpacing: 0,
          flowWithText: 1,
          allowOverlap: 0,
          holdAnchorAndSO: 0,
          vertRelTo: "PARA",
          horzRelTo: "PARA",
          vertAlign: "TOP",
          horzAlign: "LEFT",
          vertOffset: 0,
          horzOffset: 0,
        }),
        el("hp:outMargin", { left: 0, right: 0, top: 0, bottom: 0 }),
        el("hp:inMargin", {...nativeCellMargins(node.attrs?.nativeCellMargins)}),
      ];
    else if (geometryChanged) {
      /** The retained native table-size record whose width follows edited column measurements. */
      const tableSize = child(table, "sz");
      if (tableSize) {
        tableSize.attrs.width = String(width);
        if(spacingChanged&&!cellsChanged)tableSize.attrs.height=String(Math.max(0,number(tableSize.attrs.height)+(properties.cellSpacing-priorProperties.cellSpacing)*(rows.length+1)));
      } else
        table.children.unshift(
          el("hp:sz", {
            width,
            widthRelTo: "ABSOLUTE",
            height,
            heightRelTo: "ABSOLUTE",
            protect: 0,
          }),
        );
    }
    /** Table defaults remain separate from cell overrides, including a zero margin on any side. */
    const tableMargins=child(table,'inMargin');
    if(tableMargins)Object.assign(tableMargins.attrs,Object.fromEntries(Object.entries(nativeCellMargins(node.attrs?.nativeCellMargins)).map(
      /**
       * Encode one exact physical table default as its native XML integer.
       *
       * Source units remain integral and independent of browser display zoom.
       * @param {[string,number]} entry - Original side name and physical source distance.
       * @returns {[string,string]} Native XML attribute pair.
       * @example
       * // An original top margin of zero remains the string zero.
       */
      ([side,value])=>[side,String(value)])));
    else table.children.push(el('hp:inMargin',{...nativeCellMargins(node.attrs?.nativeCellMargins)}));
    table.children = table.children.filter(
      /**
       * Evaluate the filter callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {XmlNode} n - The n input.
       * @returns {boolean} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (n) => local(n) !== "tr",
    );
    coords.forEach(
      /**
       * Evaluate the forEach callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {{ c: EditorNode; start: number; cs: number; rs: number; }[]} row - The row input.
       * @param {number} ri - The ri input.
       * @returns {number} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (row, ri) =>
        table.children.push(
          el(
            "hp:tr",
            {},
            row.map(
              /**
               * Evaluate the map callback.
               *
               * Processes the current collection item while preserving the surrounding operation ordering.
               *
               * @param {{ c: EditorNode; start: number; cs: number; rs: number; }} options - Document content and serialization settings.
               * @returns {XmlNode} The computed result of this operation.
               * @example
               * collection.map(callback);
               */
              ({ c, start, cs, rs }) => {
                /**
                 * The retained table-cell source and the native cell element receiving edits.
                 */
                const prior = original(c),
                  tc = prior
                    ? parse(prior.xml)
                    : el("hp:tc", {
                        name: "",
                        header: c.type === "tableHeader" ? 1 : 0,
                        hasMargin: 1,
                        protect: 0,
                        editable: 0,
                        dirty: 0,
                        borderFillIDRef: cellBorder(c.attrs?.backgroundColor),
                      });
                /** Complete retained cell appearance is serialized independently of its unchanged source shell. */
                const properties=hwpxCellProperties(c.attrs?.nativeCellProperties);
                Object.assign(tc.attrs,properties.cell,{header:String(Number(c.type==='tableHeader'))});
                if(c.attrs?.nativeCellFieldName!==undefined&&c.attrs.nativeCellFieldName!==null)tc.attrs.name=cellFieldName(c.attrs.nativeCellFieldName);
                if (
                  prior &&
                  (c.attrs?.backgroundColor || null) !==
                    (prior.original.attrs?.backgroundColor || null)
                )
                  tc.attrs.borderFillIDRef = String(
                    cellBorder(
                      c.attrs?.backgroundColor,
                      tc.attrs.borderFillIDRef,
                    ),
                  );
                /**
                 * The native cell-content list receiving serialized paragraph blocks.
                 */
                const sub =
                  child(tc, "subList") ||
                  el("hp:subList", {
                    id: "",
                    textDirection: "HORIZONTAL",
                    lineWrap: "BREAK",
                    vertAlign: "CENTER",
                    linkListIDRef: 0,
                    linkListNextIDRef: 0,
                    textWidth: 0,
                    textHeight: 0,
                    hasTextRef: 0,
                    hasNumRef: 0,
                  });
                Object.assign(sub.attrs,properties.list);
                sub.children = (c.content || [{ type: "paragraph" }]).flatMap(
                  blocks,
                );
                tc.children = tc.children.filter(
                  /**
                   * Evaluate the filter callback.
                   *
                   * Processes the current collection item while preserving the surrounding operation ordering.
                   *
                   * @param {XmlNode} n - The n input.
                   * @returns {boolean} The computed result of this operation.
                   * @example
                   * collection.map(callback);
                   */
                  (n) =>
                    ![
                      "subList",
                      "cellAddr",
                      "cellSpan",
                      "cellSz",
                      "cellMargin",
                    ].includes(local(n)),
                );
                /**
                 * The retained native cell size reused when imported geometry remains applicable.
                 */
                const oldSize = prior
                  ? child(parse(prior.xml), "cellSz")
                  : null;
                /** The native cell size retaining its prior height and respecting explicit logical column widths. */
                const cellSize = oldSize
                  ? clone(oldSize)
                  : el("hp:cellSz", {
                      width: columnSpanWidth(columnWidths, start, cs),
                      height: 2400 * rs,
                    });
                if (geometryChanged)
                  cellSize.attrs.width = String(
                    columnSpanWidth(columnWidths, start, cs),
                  );
                /** Explicit source height remains exact even when text changes or a cell is resized. */
                const cellHeight=nativeCellDimension(c.attrs?.nativeCellHeight);
                if(cellHeight!==null)cellSize.attrs.height=String(cellHeight);
                tc.children.push(
                  sub,
                  el("hp:cellAddr", { colAddr: start, rowAddr: ri }),
                  el("hp:cellSpan", { colSpan: cs, rowSpan: rs }),
                  cellSize,
                  el("hp:cellMargin", {
                    ...properties.margins,
                  }),
                );
                return tc;
              },
            ),
          ),
        ),
    );
    return table;
  }
  /**
   * Serialize an editor block into native paragraphs.
   *
   * Dispatches editable block types and fails explicitly when a block cannot be represented safely.
   *
   * @param {EditorNode} node - The node input.
   * @returns {XmlNode[]} The computed result of this operation.
   * @throws {Error} If the input is malformed or cannot be represented safely.
   * @example
   * blocks(node);
   */
  function blocks(node: EditorNode): XmlNode[] {
    /**
     * An unchanged original XML subtree available for direct reuse.
     */
    const old = saved(node);
    if (node.type === "preservedBlock") {
      if (!old)
        throw new Error("원본 데이터가 없는 문서 개체는 저장할 수 없습니다.");
      return [wrap(old)];
    }
    if (node.type === "table") return [wrap(makeTable(node))];
    if (node.type === "image") return [wrap(makeImage(node))];
    if (["bulletList", "orderedList"].includes(node.type))
      return (node.content || []).flatMap(
        /**
         * Evaluate the flatMap callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {EditorNode} item - The item input.
         * @returns {XmlNode[]} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (item) =>
          (item.content || []).flatMap(
            /**
             * Evaluate the flatMap callback.
             *
             * Processes the current collection item while preserving the surrounding operation ordering.
             *
             * @param {EditorNode} n - The n input.
             * @param {number} j - The j input.
             * @returns {XmlNode[]} The computed result of this operation.
             * @example
             * collection.map(callback);
             */
            (n, j) => {
              if (j !== 0 || !["paragraph", "heading"].includes(n.type))
                return blocks(n);
              if (original(n)?.listKind === node.type && saved(n))
                return blocks(n);
              return blocks({
                ...n,
                attrs: {
                  ...n.attrs,
                  listKind: node.type,
                  listLevel: 0,
                  listId: listId(node.type, number(node.attrs?.start, 1)),
                },
              });
            },
          ),
      );
    if (["blockquote", "listItem"].includes(node.type))
      return (node.content || []).flatMap(blocks);
    if (node.type === "horizontalRule")
      return blocks({
        type: "paragraph",
        content: [{ type: "text", text: "────────────────────" }],
      });
    if (node.type === "pageBreak")
      return blocks({ type: "paragraph", attrs: { pageBreakBefore: true } });
    if (!["paragraph", "heading", "codeBlock"].includes(node.type))
      throw new Error(`지원하지 않는 문서 구조: ${node.type}`);
    if (old) return [old];
    /**
     * The retained paragraph source and its reusable or newly generated XML shell.
     */
    const src = original(node),
      p = src?.shell
        ? parse(src.shell)
        : el("hp:p", {
            id: nextObj++,
            styleIDRef: 0,
            columnBreak: 0,
            merged: 0,
          });
    p.attrs.paraPrIDRef = String(paraId(node.attrs));
    p.attrs.pageBreak =
      node.attrs?.pageBreakBefore || node.attrs?.pageBreak ? "1" : "0";
    if (node.type === "heading")
      p.attrs.styleIDRef = String(
        headingStyle(number(node.attrs?.level, 1), node.attrs || {}),
      );
    p.children.push(
      ...textRuns(
        node.content,
        node.type === "heading" ? node.attrs?.level : undefined,
      ),
    );
    return [p];
  }
  /**
   * The ordered native section roots that receive the serialized document blocks.
   */
  const sections = imported
    ? source.sections.map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {RetainedSection} s - The s input.
         * @returns {{ tree: XmlNode; path: string; name: string; attrs: Record<string, string>; }} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (s) => ({ ...s, tree: el(s.name, s.attrs, []) }),
      )
    : [{ path: "Contents/section0.xml", tree: parse(`${XML}<hs:sec ${NS}/>`) }];
  let active = 0;
  for (/**
   * The current native XML, property or content binding selected by this iteration.
   */
  const n of doc.content || []) {
    /**
     * The retained original XML and editor state for the current source identifier.
     */
    const src = original(n);
    if (src) active = Math.max(0, Math.min(sections.length - 1, src.section));
    sections[active].tree.children.push(...blocks(n));
  }
  sections.forEach(
    /**
     * Evaluate the forEach callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {{ path: string; tree: XmlNode; }} s - The s input.
     * @param {number} i - The i input.
     * @returns {void} Completes the local operation.
     * @example
     * collection.map(callback);
     */
    (s, i) => {
      if (!s.tree.children.length)
        s.tree.children = blocks({ type: "paragraph" });
      if (!all(s.tree, "secPr").length) {
        /**
         * The imported section root used to recover required section properties.
         */
        const originalSection = imported
          ? parse(strFromU8(files[s.path]))
          : null;
        /**
         * The native section properties retained or generated for the output section.
         */
        const sec = clone(
          all(originalSection, "secPr")[0] || sectionProperties(page),
        );
        s.tree.children[0].children.unshift(
          el("hp:run", { charPrIDRef: charId() }, [
            sec,
            el("hp:ctrl", {}, [
              el("hp:colPr", {
                id: "",
                type: "NEWSPAPER",
                layout: "LEFT",
                colCount: 1,
                sameSz: 1,
                sameGap: 0,
              }),
            ]),
          ]),
        );
      }
      if (!imported || clean(page) !== clean(normalizePage(source.page)))
        for (/**
         * The current native XML, property or content binding selected by this iteration.
         */
        const pp of all(s.tree, "pagePr")) {
          pp.attrs.width = String(unit(page.width));
          pp.attrs.height = String(unit(page.height));
          /**
           * The native page-margin element being updated from physical page settings.
           */
          const m = child(pp, "margin");
          if (m) {
            for (/**
             * The current native XML, property or content binding selected by this iteration.
             */
            const k of ["Top", "Bottom", "Left", "Right"])
              m.attrs[k.toLowerCase()] = String(
                unit(page[`margin${k}` as keyof HwpxPage]),
              );
            m.attrs.header = String(unit(page.header ?? 0));
            m.attrs.footer = String(unit(page.footer ?? 0));
          }
        }
      if(!imported||clean(sectionGridSettings(page))!==clean(sectionGridSettings(source.page)))
        for(/** Only section-owned grids receive explicitly accepted document-level changes. */const section of all(s.tree,'secPr')){
          /** Imported sections without a grid gain the schema-ordered source element only after an explicit edit. */
          let grid=child(section,'grid');
          if(!grid){grid=el('hp:grid',{});section.children.unshift(grid);}
          grid.attrs.lineGrid=String(sectionGridDistance(page.lineGrid));
          grid.attrs.charGrid=String(sectionGridDistance(page.charGrid));
          grid.attrs.wonggojiFormat=page.wonggojiFormat?'1':'0';
        }
      files[s.path] = strToU8(XML + serialize(s.tree));
    },
  );
  header.attrs.secCnt = String(sections.length);
  charList.attrs.itemCnt = String(charList.children.length);
  paraList.attrs.itemCnt = String(paraList.children.length);
  /**
   * The schema ordering of native header reference collections.
   */
  const refOrder = [
    "fontfaces",
    "borderFills",
    "charProperties",
    "tabProperties",
    "numberings",
    "bullets",
    "paraProperties",
    "styles",
    "memoProperties",
    "trackChanges",
    "trackChangeAuthors",
  ];
  ref.children.sort(
    /**
     * Evaluate the sort callback.
     *
     * Processes the current collection item while preserving the surrounding operation ordering.
     *
     * @param {XmlNode} a - The a input.
     * @param {XmlNode} b - The b input.
     * @returns {number} The computed result of this operation.
     * @example
     * collection.map(callback);
     */
    (a, b) =>
      (refOrder.indexOf(local(a)) < 0 ? 999 : refOrder.indexOf(local(a))) -
      (refOrder.indexOf(local(b)) < 0 ? 999 : refOrder.indexOf(local(b))),
  );
  files["Contents/header.xml"] = strToU8(XML + serialize(header));
  let pkg =
    imported && files["Contents/content.hpf"]
      ? parse(strFromU8(files["Contents/content.hpf"]))
      : parse(
          `${XML}<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id=""><opf:metadata><opf:title>${esc(title)}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest/><opf:spine/></opf:package>`,
        );
  /**
   * The package metadata container retaining the document title and language.
   */
  const meta = child(pkg, "metadata");
  /**
   * The existing package title element to update with the current document name.
   */
  const titleNode = child(meta, "title");
  if (titleNode) titleNode.children = [txt(title)];
  /**
   * The package file manifest and ordered content spine.
   */
  const manifest = child(pkg, "manifest")!,
    spine = child(pkg, "spine")!;
  if (!imported) {
    manifest.children = [
      el("opf:item", {
        id: "header",
        href: "Contents/header.xml",
        "media-type": "application/xml",
      }),
      ...sections.map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {{ tree: XmlNode; path: string; name: string; attrs: Record<string, string>; } | { path: string; tree: XmlNode; }} s - The s input.
         * @param {number} i - The i input.
         * @returns {XmlNode} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (s, i) =>
          el("opf:item", {
            id: `section${i}`,
            href: s.path,
            "media-type": "application/xml",
          }),
      ),
      el("opf:item", {
        id: "settings",
        href: "settings.xml",
        "media-type": "application/xml",
      }),
    ];
    spine.children = [
      el("opf:itemref", { idref: "header", linear: "yes" }),
      ...sections.map(
        /**
         * Evaluate the map callback.
         *
         * Processes the current collection item while preserving the surrounding operation ordering.
         *
         * @param {{ tree: XmlNode; path: string; name: string; attrs: Record<string, string>; } | { path: string; tree: XmlNode; }} s - The s input.
         * @param {number} i - The i input.
         * @returns {XmlNode} The computed result of this operation.
         * @example
         * collection.map(callback);
         */
        (s, i) => el("opf:itemref", { idref: `section${i}`, linear: "yes" }),
      ),
    ];
  }
  manifest.children.push(
    ...imageItems.map(
      /**
       * Evaluate the map callback.
       *
       * Processes the current collection item while preserving the surrounding operation ordering.
       *
       * @param {Record<string, string | number>} a - The a input.
       * @returns {XmlNode} The computed result of this operation.
       * @example
       * collection.map(callback);
       */
      (a) => el("opf:item", a),
    ),
  );
  files["Contents/content.hpf"] = strToU8(XML + serialize(pkg));
  files["Preview/PrvText.txt"] = strToU8(plain(doc));
  delete files["Preview/PrvImage.png"]; // A stale thumbnail must never represent an edited document.
  if (!files["version.xml"])
    files["version.xml"] = strToU8(
      `${XML}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Forhan" appVersion="0.1.0"/>`,
    );
  if (!files["settings.xml"])
    files["settings.xml"] = strToU8(
      `${XML}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`,
    );
  if (!files["META-INF/container.xml"])
    files["META-INF/container.xml"] = strToU8(
      `${XML}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`,
    );
  if (!files["META-INF/manifest.xml"])
    files["META-INF/manifest.xml"] = strToU8(
      `${XML}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`,
    );
  return pack();
}

/**
 * Inspect supported raster headers for intrinsic image dimensions.
 *
 * Reads bounded PNG, GIF, BMP, JPEG and WebP metadata directly from embedded
 * bytes without decoding executable content or fetching an external resource.
 *
 * @param {Uint8Array} bytes - The embedded image payload to inspect.
 * @param {string} mediaType - The image subtype declared by the validated data URL.
 * @returns {RasterDimensions | null} Positive intrinsic pixel dimensions, or null when unavailable.
 * @example
 * intrinsicImageSize(pngBytes, 'png');
 */
function intrinsicImageSize(
  bytes: Uint8Array,
  mediaType: string,
): RasterDimensions | null {
  /** A bounded view over the supplied embedded raster bytes. */
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0;
  if (
    mediaType === "png" &&
    bytes.length >= 24 &&
    view.getUint32(0) === 0x89504e47
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (
    mediaType === "gif" &&
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
  } else if (
    mediaType === "bmp" &&
    bytes.length >= 26 &&
    bytes[0] === 0x42 &&
    bytes[1] === 0x4d
  ) {
    width = Math.abs(view.getInt32(18, true));
    height = Math.abs(view.getInt32(22, true));
  } else if (
    mediaType === "jpeg" &&
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      /** The current JPEG marker identifying a bounded metadata or frame segment. */
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda || offset + 2 > bytes.length)
        break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      /** The JPEG segment length including its own two-byte length field. */
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker) &&
        length >= 7
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (
    mediaType === "webp" &&
    bytes.length >= 30 &&
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57454250
  ) {
    /** The WebP raster chunk identifier selecting its dimension representation. */
    const kind = view.getUint32(12);
    if (kind === 0x56503858) {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (
      kind === 0x56503820 &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 0x5650384c && bytes[20] === 0x2f) {
      /** Packed lossless WebP dimensions stored after the chunk signature. */
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Resolve positive image export geometry without treating null as zero size.
 *
 * Honors positive explicit dimensions, derives a missing dimension from the
 * intrinsic aspect ratio and fits images with no explicit size to the page body.
 * This matches image nodes inserted by the editor with default null attributes.
 *
 * @param {EditorNode} node - The editable image node and optional display attributes.
 * @param {Uint8Array} bytes - The embedded raster bytes supplying intrinsic geometry.
 * @param {string} mediaType - The validated embedded raster subtype.
 * @param {HwpxPage} page - Physical page dimensions used for automatic image fitting.
 * @returns {RasterDimensions} Positive image dimensions in CSS pixels.
 * @example
 * imageExportDimensions(imageNode, pngBytes, 'png', page);
 */
function imageExportDimensions(
  node: EditorNode,
  bytes: Uint8Array,
  mediaType: string,
  page: HwpxPage,
): RasterDimensions {
  /** Intrinsic raster measurements or an independent fallback when metadata is unavailable. */
  const intrinsic = intrinsicImageSize(bytes, mediaType) || {
    width: 480,
    height: 320,
  };
  let width = number(node.attrs?.width),
    height = number(node.attrs?.height);
  if (width <= 0 && height <= 0) {
    width = intrinsic.width;
    height = intrinsic.height;
    /** The printable page-body width expressed in CSS pixels. */
    const available =
      ((page.width - page.marginLeft - page.marginRight) * 96) / 25.4;
    if (available > 0 && width > available) {
      height *= available / width;
      width = available;
    }
  } else if (width <= 0) width = (height * intrinsic.width) / intrinsic.height;
  else if (height <= 0) height = (width * intrinsic.height) / intrinsic.width;
  return { width, height };
}

/**
 * Validate a portable hyperlink destination without following it.
 *
 * Reuses the document boundary's supported non-script schemes and relative
 * references so imported fields and newly exported marks share one URL policy.
 *
 * @param {unknown} value - The destination stored in a native field or editor mark.
 * @returns {string} The validated destination with surrounding whitespace removed.
 * @throws {Error} If the destination contains a script scheme, control characters or an invalid URL.
 * @example
 * safeHyperlinkUrl('https://example.com/forhan?x=1&y=2');
 */
function safeHyperlinkUrl(value: unknown): string {
  if (!isSafeDocumentLink(value))
    throw new Error("안전하지 않거나 올바르지 않은 하이퍼링크 주소입니다.");
  return String(value).trim();
}

/**
 * Decode the destination prefix of a native hyperlink command.
 *
 * Treats a backslash as the native command escape and stops only at an
 * unescaped parameter separator. The separate native Path parameter is
 * preferred by the caller whenever it is present.
 *
 * @param {string} command - The retained native hyperlink Command parameter.
 * @returns {string} The unescaped destination preceding native option fields.
 * @example
 * decodeHyperlinkCommand('https://example.com/forhan\\?x=1;1;0;0;');
 */
function decodeHyperlinkCommand(command: string): string {
  let output = "";
  for (let index = 0; index < command.length; index++) {
    /** The current native command character, inspected before separator handling. */
    const character = command[index];
    if (character === "\\" && index + 1 < command.length)
      output += command[++index];
    else if (character === ";") break;
    else output += character;
  }
  return output;
}

/**
 * Encode a validated destination for the native hyperlink Command parameter.
 *
 * Escapes native command delimiters and query markers while keeping the full
 * original destination separately available in the field's Path parameter.
 * The native option suffix records URL mode and the requested window target.
 *
 * @param {string} href - The validated portable hyperlink destination.
 * @param {string} target - The editor window target, such as _self or _blank.
 * @returns {string} The escaped native command and its option suffix.
 * @example
 * encodeHyperlinkCommand('https://example.com/forhan?x=1&y=2', '_self');
 */
function encodeHyperlinkCommand(href: string, target: string): string {
  let command = "";
  for (/** The destination character checked for native command escaping. */ const character of href) {
    if (character === "\\" || character === ";" || character === "?")
      command += "\\";
    command += character;
  }
  return `${command};1;0;${target === "_blank" ? 1 : 0};`;
}

/**
 * Read a genuine native HYPERLINK field into portable editor attributes.
 *
 * Uses the exact Path parameter when available, falling back to the older
 * escaped Command form. Native window options remain attached to the mark,
 * and unsafe destinations fail before any clickable editor content is created.
 *
 * @param {XmlNode} field - The native fieldBegin element with HYPERLINK type.
 * @returns {NativeHyperlink} The validated destination and editor target attributes.
 * @throws {Error} If the field has no safe, representable destination.
 * @example
 * nativeHyperlink(fieldBegin);
 */
function nativeHyperlink(field: XmlNode): NativeHyperlink {
  /** Native field string parameters indexed without changing their text values. */
  const parameters = new Map<string, string>();
  for (/** The native string parameter supplying hyperlink metadata. */ const parameter of all(
    field,
    "stringParam",
  ))
    parameters.set(parameter.attrs.name, text(parameter));
  /** The native executable hyperlink command validated even when an exact Path is available. */
  const command = parameters.get("Command") || "";
  if (command) safeHyperlinkUrl(decodeHyperlinkCommand(command));
  /** The destination before portable URL validation, preferring the exact native Path. */
  const destination = parameters.get("Path") || decodeHyperlinkCommand(command);
  /** The requested native document-window behavior retained in the editor mark. */
  const openType = parameters.get("DocOpenType") || "";
  return {
    href: safeHyperlinkUrl(destination),
    target:
      openType === "HWPHYPERLINK_JUMP_NEWTAB" ||
      openType === "HWPHYPERLINK_JUMP_NEWWINDOW"
        ? "_blank"
        : "_self",
    rel: "noopener noreferrer nofollow",
  };
}

/**
 * Validate every hyperlink mark before any original-package fast path is used.
 *
 * Traverses editable content so a changed or forged source snapshot cannot
 * bypass URL validation merely because other document properties are unchanged.
 *
 * @param {EditorNode} node - The current editor document or nested content node.
 * @returns {void} Completes after all hyperlink destinations have been validated.
 * @throws {Error} If any hyperlink mark has an unsafe or invalid destination.
 * @example
 * validateHyperlinkMarks(document);
 */
function validateHyperlinkMarks(node: EditorNode): void {
  for (/** The inline editor mark checked before native hyperlink serialization. */ const mark of node.marks ||
    [])
    if (mark.type === "link") safeHyperlinkUrl(mark.attrs?.href);
  for (/** The nested editor node inspected for hyperlink destinations. */ const nested of node.content ||
    [])
    validateHyperlinkMarks(nested);
}

/**
 * Remove recognized hyperlink markers from an editable paragraph shell.
 *
 * Hyperlink marks regenerate their own begin/end controls at the edited text
 * positions. Removing only these known controls prevents duplicate stale fields
 * while preserving unknown native field metadata and document-level controls.
 *
 * @param {XmlNode} shell - The retained paragraph shell before regenerated text is appended.
 * @param {ReadonlyMap<string, NativeHyperlink>} definitions - Validated native hyperlink identifiers.
 * @returns {void} Mutates the shell to retain only controls not regenerated from link marks.
 * @example
 * stripHyperlinkShell(paragraphShell, hyperlinkDefinitions);
 */
function stripHyperlinkShell(
  shell: XmlNode,
  definitions: ReadonlyMap<string, NativeHyperlink>,
): void {
  for (/** The retained native run whose hyperlink controls will be regenerated from editor marks. */ const run of kids(
    shell,
    "run",
  )) {
    for (let index = run.children.length - 1; index >= 0; index--) {
      /** The run child inspected for a native control container. */
      const control = run.children[index];
      if (local(control) !== "ctrl") continue;
      for (
        let markerIndex = control.children.length - 1;
        markerIndex >= 0;
        markerIndex--
      ) {
        /** The native begin or end marker considered for recognized hyperlink removal. */
        const marker = control.children[markerIndex];
        if (
          (local(marker) === "fieldBegin" &&
            marker.attrs.type === "HYPERLINK") ||
          (local(marker) === "fieldEnd" &&
            definitions.has(marker.attrs.beginIDRef))
        )
          control.children.splice(markerIndex, 1);
      }
      if (!control.children.length) run.children.splice(index, 1);
    }
    if (!run.children.length)
      shell.children.splice(shell.children.indexOf(run), 1);
  }
}

/**
 * Build a genuine native HYPERLINK begin control with its complete parameters.
 *
 * Writes the six-parameter native shape observed in independently created
 * Hancom documents, retaining an exact Path beside the escaped Command and
 * recording the requested document-window behavior.
 *
 * @param {GeneratedHyperlink} link - The validated destination and paired native identifiers.
 * @returns {XmlNode} The native fieldBegin element that precedes its linked text runs.
 * @example
 * makeHyperlinkField({ href, target: '_self', rel, id, fieldId });
 */
function makeHyperlinkField(link: GeneratedHyperlink): XmlNode {
  return el(
    "hp:fieldBegin",
    {
      id: link.id,
      type: "HYPERLINK",
      name: "",
      editable: 0,
      dirty: 1,
      zorder: -1,
      fieldid: link.fieldId,
    },
    [
      el("hp:parameters", { cnt: 6, name: "" }, [
        el("hp:integerParam", { name: "Prop" }, [txt(0)]),
        el("hp:stringParam", { name: "Command" }, [
          txt(encodeHyperlinkCommand(link.href, link.target)),
        ]),
        el("hp:stringParam", { name: "Path" }, [txt(link.href)]),
        el("hp:stringParam", { name: "Category" }, [
          txt("HWPHYPERLINK_TYPE_URL"),
        ]),
        el("hp:stringParam", { name: "TargetType" }, [
          txt("HWPHYPERLINK_TARGET_BOOKMARK"),
        ]),
        el("hp:stringParam", { name: "DocOpenType" }, [
          txt(
            link.target === "_blank"
              ? "HWPHYPERLINK_JUMP_NEWTAB"
              : "HWPHYPERLINK_JUMP_CURRENTTAB",
          ),
        ]),
      ]),
    ],
  );
}
