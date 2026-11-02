import {Extension} from '@tiptap/core';

/** Explicit native normal weight and hyperlink underline absence survive HTML without changing semantic node types. */
export const NativeCharacterDefaults=Extension.create({
  name:'nativeCharacterDefaults',
  /**
   * Declare explicit source resets for inherited heading and hyperlink appearance.
   *
   * Defaults remain absent on ordinary source. Partial hyperlink formatting
   * splits only appearance attributes while preserving each original URL.
   * @returns {object[]} Independent text-style and semantic-link attribute groups.
   * @example
   * // A normal-weight heading and an unlined link remain editable native source.
   */
  addGlobalAttributes(){return[
    {types:['textStyle'],attributes:{nativeNormalWeight:{default:null,
      /**
       * Restore an explicit source normal-weight reset from marked HTML.
       *
       * Ordinary unmarked heading HTML keeps its usual inherited bold default.
       * @param {HTMLElement} element - Actual original imported source element.
       * @returns {true|null} Explicit normal weight or no native reset.
       * @example
       * // A retained native reset does not become a heading-level change.
       */
      parseHTML:(element:HTMLElement)=>element.getAttribute('data-forhan-normal-weight')==='1'?true:null,
      /**
       * Render explicit normal character weight separately from heading semantics.
       *
       * A later explicit bold mark still overrides this retained native reset.
       * @param {Record<string,unknown>} attrs - Complete original text-style attributes.
       * @returns {Record<string,string>} Actual native normal-weight CSS and retained metadata.
       * @example
       * // Copied plain body text can retain normal weight inside a semantic heading.
       */
      renderHTML:(attrs:Record<string,unknown>)=>attrs.nativeNormalWeight===true?{style:'font-weight:400','data-forhan-normal-weight':'1'}:{},
    }}},
    {types:['link'],attributes:{nativeDefaultUnderline:{default:null,
      /**
       * Restore an explicit native hyperlink underline absence from HTML.
       *
       * Ordinary imported hyperlinks retain their existing automatic underline.
       * @param {HTMLElement} element - Original imported hyperlink element.
       * @returns {false|null} Explicit no-default-underline or the ordinary link default.
       * @example
       * // Only one copied fragment of a hyperlink can suppress its default line.
       */
      parseHTML:(element:HTMLElement)=>element.getAttribute('data-forhan-default-underline')==='0'?false:null,
      /**
       * Suppress only the inherited link decoration while retaining explicit character lines.
       *
       * Separate underline marks keep their real pattern, color and placement.
       * @param {Record<string,unknown>} attrs - Actual semantic-link attributes.
       * @returns {Record<string,string>} Actual independent link-decoration reset.
       * @example
       * // The original URL stays clickable after plain character appearance is copied.
       */
      renderHTML:(attrs:Record<string,unknown>)=>attrs.nativeDefaultUnderline===false?{style:'text-decoration:none','data-forhan-default-underline':'0'}:{},
    }}},
  ];},
});
