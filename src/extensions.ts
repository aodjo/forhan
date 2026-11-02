import { Extension, Node, Mark, mergeAttributes } from "@tiptap/core";
import {readNativeTableProperties,renderNativeTableProperties,readNativeTableFlags,renderNativeTableFlags} from './ui/native-table-properties.ts';
import {readNativeCellHeight,renderNativeCellHeight} from './cell-geometry.ts';
import {readHtmlCellFieldName,renderHtmlCellFieldName,readHtmlCellFieldData,renderHtmlCellFieldData} from './cell-field-name.ts';
import { renderParagraphMargin, readParagraphMargin } from "./paragraph-layout";
import {renderParagraphWordBreaks,readParagraphWordBreaks} from './paragraph-word-break.ts';
import {readParagraphCondense,renderParagraphCondense} from './paragraph-minimum-space.ts';
import {readParagraphGrid,renderParagraphGrid} from './paragraph-line-grid.ts';
import {readNativeCellProperties,renderNativeCellProperties,readNativeCellMargins,renderNativeCellMargins,readNativeCellFlags,renderNativeCellFlags} from './ui/native-cell-properties.ts';
import {
  renderParagraphDistance,
  readParagraphDistance,
  type ParagraphDistanceProperty,
} from './paragraph-distance';

/** Extension retaining source identifiers and supported document layout properties. */
export const DocumentAttributes = Extension.create({
  name: "documentAttributes",
  /**
   * Declare retained source and layout attributes.
   *
   * Source identifiers remain opaque, while paragraph spacing, page breaks and
   * table-cell backgrounds participate in HTML round trips and PDF rendering.
   * @returns {object[]} Attribute groups for supported editor node types.
   * @example
   * addGlobalAttributes() // Returns source, paragraph and cell attribute groups.
   */
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "table",
          "image",
          "tableCell",
          "tableHeader",
        ],
        attributes: { sourceId: { default: null, rendered: false } },
      },
      {
        types: ["paragraph", "heading"],
        attributes: {
          nativeSnapToGrid:{default:null,parseHTML:readParagraphGrid,renderHTML:renderParagraphGrid},
          nativeParagraphCondense:{
            default:null,
            /**
             * Restore explicit native minimum spacing independently from fixed CSS gaps.
             *
             * The adaptive paragraph setting belongs to its original source block.
             * @param {HTMLElement} element - Original imported paragraph or heading.
             * @returns {number|null} Explicit native reduction or an absent source marker.
             * @throws {RangeError} If retained source metadata is malformed.
             * @example
             * // A marker of 25 retains the original 75% remaining-space minimum.
             */
            parseHTML:readParagraphCondense,
            renderHTML:renderParagraphCondense,
          },
          nativeBreakLatinWord:{
            default:null,
            /**
             * Restore independent native Latin word breaking from original HTML.
             *
             * Matching source metadata preserves character and hyphenation choices while external CSS edits remain authoritative.
             * @param {HTMLElement} element - Original paragraph or heading source.
             * @returns {number|null} Explicit original Latin mode or an unconfigured value.
             * @example
             * // Standard hyphens:auto restores original native English hyphenation.
             */
            parseHTML:(element:HTMLElement)=>readParagraphWordBreaks(element).latin??null,
            /**
             * Render independent native paragraph word-breaking behavior.
             *
             * Both source modes share one set of semantic markers and outer CSS declarations.
             * @param {Record<string,unknown>} attrs - Original complete paragraph attributes.
             * @returns {Record<string,string>} Native breaking metadata and real browser behavior.
             * @throws {RangeError} If original native breaking metadata is invalid.
             * @example
             * // Non-Latin word mode remains independent from Latin character mode.
             */
            renderHTML:renderParagraphWordBreaks,
          },
          nativeBreakNonLatinWord:{
            default:null,rendered:false,
            /**
             * Restore the original independent non-Latin paragraph breaking mode.
             *
             * Native metadata and externally edited standard CSS follow the same source resolution as the Latin mode.
             * @param {HTMLElement} element - Original paragraph or heading source.
             * @returns {number|null} Explicit original non-Latin mode or an unconfigured value.
             * @example
             * // Standard keep-all preserves complete original Korean words.
             */
            parseHTML:(element:HTMLElement)=>readParagraphWordBreaks(element).nonLatin??null,
          },
          lineHeight: {
            default: null,
            /**
             * Read paragraph line spacing from HTML.
             *
             * Inline CSS is retained without assigning a replacement value
             * when the imported element has no explicit line spacing.
             * @param {HTMLElement} element Paragraph or heading element being parsed.
             * @returns {string | null} Inline line-height value, or null when absent.
             * @example
             * parseHTML(element) // "1.6" when element.style.lineHeight is "1.6".
             */
            parseHTML: (element) => readParagraphDistance(element,'lineHeight'),
            /**
             * Render retained paragraph line spacing.
             *
             * The stored value becomes inline CSS for HTML and PDF output;
             * an unset attribute introduces no declaration.
             * @param {Record<string, any>} attrs Current paragraph or heading attributes.
             * @returns {{ style?: string }} Line-height CSS when a value is present.
             * @example
             * renderHTML({ lineHeight: "1.6" }) // { style: "line-height:1.6" }
             */
            renderHTML: (attrs) => renderParagraphDistance(attrs, 'lineHeight'),
          },
          pageBreak: {
            default: false,
            /**
             * Read a paragraph page break from HTML.
             *
             * Standard print CSS restores the page-break flag when a
             * paragraph or heading enters the editor through HTML.
             * @param {HTMLElement} element Paragraph or heading element being parsed.
             * @returns {boolean} Whether the element starts on a new printed page.
             * @example
             * parseHTML(element) // true when element.style.breakBefore is "page".
             */
            parseHTML: (element) => element.style.breakBefore === "page",
            /**
             * Render a paragraph's explicit page break.
             *
             * HWP-derived page-break flags become standard CSS so HTML and
             * PDF output retain the paragraph's new-page requirement.
             * @param {Record<string, any>} attrs Current paragraph or heading attributes.
             * @returns {{ style?: string }} Page-break CSS when the flag is enabled.
             * @example
             * renderHTML({ pageBreak: true }) // { style: "break-before:page" }
             */
            renderHTML: (attrs) =>
              attrs.pageBreak ? { style: "break-before:page" } : {},
          },
          pageBreakBefore: {
            default: false,
            /**
             * Render an imported HWPX paragraph page break.
             *
             * The HWPX-specific flag must become print CSS so HTML exports and
             * the desktop PDF renderer start this paragraph on a new page.
             * @param {Record<string, unknown>} attrs Current paragraph or heading attributes.
             * @returns {{ style?: string }} Page-break CSS when the imported flag is enabled.
             * @example
             * renderHTML({ pageBreakBefore: true }) // { style: "break-before:page" }
             */
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.pageBreakBefore ? { style: "break-before:page" } : {},
          },
          ...Object.fromEntries(
            Object.entries({
              marginLeft: "margin-left",
              marginRight: "margin-right",
              textIndent: "text-indent",
              marginTop: "margin-top",
              marginBottom: "margin-bottom",
            }).map(
              /**
               * Build one retained paragraph layout attribute.
               *
               * The editor attribute is paired with its CSS property so
               * paragraph spacing and indentation survive HTML round trips.
               * @param {[string, string]} entry Editor attribute name and matching CSS property.
               * @returns {[string, object]} Named attribute definition for Object.fromEntries.
               * @example
               * layoutAttribute(["marginLeft", "margin-left"]) // Defines marginLeft.
               */
              ([name]) => [
                name,
                {
                  default: null,
                  /**
                   * Read the corresponding paragraph layout property.
                   *
                   * Inline values retain their units. Left margins restore native
                   * hanging geometry from retained metadata or standard HTML CSS.
                   * @param {HTMLElement} element Paragraph or heading element being parsed.
                   * @returns {string | null} Inline layout value, or null when absent.
                   * @example
                   * parseHTML(element) // "10mm" for a retained 10mm margin.
                   */
                  parseHTML: (element) =>
                    name === "marginLeft"
                      ? readParagraphMargin(element)
                      : readParagraphDistance(element, name as ParagraphDistanceProperty),
                  /**
                   * Render the corresponding paragraph layout property.
                   *
                   * The named attribute becomes CSS. Native hanging indentation
                   * compensates the block margin and retains its original HTML value.
                   * @param {Record<string, any>} attrs Current paragraph or heading attributes.
                   * @returns {Record<string, string>} CSS and optional native-margin metadata.
                   * @example
                   * renderHTML({ marginLeft: "10mm" }) // { style: "margin-left:10mm" }
                   */
                  renderHTML: (attrs) =>
                    name === "marginLeft"
                      ? renderParagraphMargin(attrs)
                      : renderParagraphDistance(attrs, name as ParagraphDistanceProperty),
                },
              ],
            ),
          ),
        },
      },
      {
        types: ['table'],
        attributes: {
          /** Independent source table page and spacing properties survive JSON and actual HTML saves. */
          nativeTableProperties: {default:null,parseHTML:readNativeTableProperties,renderHTML:renderNativeTableProperties},
          /** Unknown binary table flag bits remain independent from the represented source properties. */
          nativeTableFlags: {default:null,parseHTML:readNativeTableFlags,renderHTML:renderNativeTableFlags},
          /** Exact table defaults remain separate from each cell's own optional physical margins. */
          nativeCellMargins: {default:null,parseHTML:readNativeCellMargins,renderHTML:renderNativeCellMargins},
        },
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          /** Source cell heights retain exact native units independently of the rendered text height. */
          nativeCellHeight: {default:null,parseHTML:readNativeCellHeight,renderHTML:renderNativeCellHeight},
          /** Cell field identity is separate from cell appearance and never copied by the format painter. */
          nativeCellFieldName: {default:null,parseHTML:readHtmlCellFieldName,renderHTML:renderHtmlCellFieldName},
          /** Unknown original HWP cell extensions remain available for lossless native saves. */
          nativeCellFieldData: {default:null,parseHTML:readHtmlCellFieldData,renderHTML:renderHtmlCellFieldData},
          /** Complete neutral native properties remain in editor JSON and every native document save. */
          nativeCellProperties: {default:null,parseHTML:readNativeCellProperties,renderHTML:renderNativeCellProperties},
          /** Original native flag bits survive alongside the explicitly represented cell properties. */
          nativeCellFlags: {default:null,parseHTML:readNativeCellFlags,renderHTML:renderNativeCellFlags},
          backgroundColor: {
            default: null,
            /**
             * Read a table cell's solid background colour.
             *
             * The inline fill becomes an editor attribute so cell backgrounds
             * remain available during editing and document export.
             * @param {HTMLElement} element Table cell or header element being parsed.
             * @returns {string | null} Inline background colour, or null when absent.
             * @example
             * parseHTML(element) // "red" when element.style.backgroundColor is "red".
             */
            parseHTML: (element) => element.style.backgroundColor || null,
            /**
             * Render a table cell's retained background colour.
             *
             * The stored solid fill becomes inline CSS for the editor,
             * HTML export and the desktop PDF renderer.
             * @param {Record<string, any>} attrs Current table-cell or header attributes.
             * @returns {{ style?: string }} Background CSS when a solid fill is present.
             * @example
             * renderHTML({ backgroundColor: "#ffeecc" }) // { style: "background-color:#ffeecc" }
             */
            renderHTML: (attrs) =>
              attrs.backgroundColor
                ? { style: `background-color:${attrs.backgroundColor}` }
                : {},
          },
        },
      },
    ];
  },
});

/** Superscript character mark that excludes simultaneous subscript formatting. */
export const Superscript = Mark.create({
  name: "superscript",
  excludes: "subscript",
  /**
   * Recognise superscript text in HTML.
   *
   * The standard sup element restores the character mark when formatted
   * document HTML enters the editor.
   * @returns {{ tag: string }[]} Parsing rule for the superscript element.
   * @example
   * parseHTML() // [{ tag: "sup" }]
   */
  parseHTML() {
    return [{ tag: "sup" }];
  },
  /**
   * Render superscript text as standard HTML.
   *
   * The content hole retains marked text inside a sup element for document
   * exports and the print renderer.
   * @returns {[string, object, number]} Superscript DOM specification.
   * @example
   * renderHTML() // ["sup", {}, 0]
   */
  renderHTML() {
    return ["sup", {}, 0];
  },
});

/** Subscript character mark that excludes simultaneous superscript formatting. */
export const Subscript = Mark.create({
  name: "subscript",
  excludes: "superscript",
  /**
   * Recognise subscript text in HTML.
   *
   * The standard sub element restores the character mark when formatted
   * document HTML enters the editor.
   * @returns {{ tag: string }[]} Parsing rule for the subscript element.
   * @example
   * parseHTML() // [{ tag: "sub" }]
   */
  parseHTML() {
    return [{ tag: "sub" }];
  },
  /**
   * Render subscript text as standard HTML.
   *
   * The content hole retains marked text inside a sub element for document
   * exports and the print renderer.
   * @returns {[string, object, number]} Subscript DOM specification.
   * @example
   * renderHTML() // ["sub", {}, 0]
   */
  renderHTML() {
    return ["sub", {}, 0];
  },
});

/** Atomic editor node retaining a source object that is not rendered natively. */
export const PreservedBlock = Node.create({
  name: "preservedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  /**
   * Declare a preserved object's visible and opaque attributes.
   *
   * The label and text preview are displayed, while the source identifier and
   * original record remain in document JSON instead of rendered HTML.
   * @returns {object} Definitions for sourceId, label, preview and raw attributes.
   * @example
   * addAttributes().raw.rendered // false
   */
  addAttributes() {
    return {
      sourceId: { default: null, rendered: false },
      label: { default: "문서 개체" },
      preview: { default: "" },
      raw: { default: null, rendered: false },
    };
  },
  /**
   * Recognise a preserved object's HTML placeholder.
   *
   * The dedicated marker identifies this atomic editor block; opaque source
   * records are not reconstructed from arbitrary HTML attributes.
   * @returns {{ tag: string }[]} Rule matching the preserved-object placeholder.
   * @example
   * parseHTML() // [{ tag: "div[data-preserved-block]" }]
   */
  parseHTML() {
    return [{ tag: "div[data-preserved-block]" }];
  },
  /**
   * Render a preserved object's label and readable preview.
   *
   * The original record remains outside HTML. Literal text children expose
   * the label and available preview without treating them as markup.
   * @param {object} context Editor rendering context containing the preserved block node.
   * @returns {Array} DOM specification for the preserved-object placeholder.
   * @example
   * renderHTML({ node: preservedNode }) // A div with the object's label and preview.
   */
  renderHTML({ node }) {
    return [
      "div",
      { class: "preserved-block", "data-preserved-block": "" },
      ["span", { class: "object-label" }, node.attrs.label],
      ["div", {}, node.attrs.preview || "원본 개체가 문서와 함께 보존됩니다."],
    ];
  },
});

/** Explicit page-break block and its platform modifier plus Enter shortcut. */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  /**
   * Recognise an explicit page-break block in HTML.
   *
   * The dedicated marker distinguishes document page breaks from ordinary
   * horizontal rules imported into the editor.
   * @returns {{ tag: string }[]} Rule matching the marked page-break element.
   * @example
   * parseHTML() // [{ tag: "hr[data-page-break]" }]
   */
  parseHTML() {
    return [{ tag: "hr[data-page-break]" }];
  },
  /**
   * Render an explicit page-break block.
   *
   * Permitted attributes are merged with the marker and class consumed by
   * the editor display and document print styles.
   * @param {object} context Editor rendering context containing permitted HTML attributes.
   * @returns {[string, object]} Marked horizontal-rule DOM specification.
   * @example
   * renderHTML({ HTMLAttributes: {} }) // An hr with the page-break marker and class.
   */
  renderHTML({ HTMLAttributes }) {
    return [
      "hr",
      mergeAttributes(HTMLAttributes, {
        "data-page-break": "",
        class: "page-break",
      }),
    ];
  },
  /**
   * Register the platform page-break keyboard shortcut.
   *
   * The editor resolves Mod to the platform modifier so Windows and macOS use
   * their expected modifier plus Enter combination.
   * @returns {{ "Mod-Enter": () => boolean }} Shortcut handler for page-break insertion.
   * @example
   * addKeyboardShortcuts()["Mod-Enter"]() // Inserts a pageBreak node.
   */
  addKeyboardShortcuts() {
    return {
      /**
       * Insert a page-break node at the current selection.
       *
       * The editor inserts an atomic page-break block and reports whether
       * the active selection permits the insertion.
       * @returns {boolean} Whether the editor accepted the page-break command.
       * @example
       * shortcut() // true after inserting a page-break block.
       */
      "Mod-Enter": () =>
        this.editor.commands.insertContent({ type: "pageBreak" }),
    };
  },
});
