import { Extension } from "@tiptap/core";
import {
  characterEmphasis,
  renderCharacterEmphasis,
} from "../character-emphasis.ts";

/** Native emphasis shares source text-style marks and the existing paragraph drawing lifecycle. */
export const NativeCharacterEmphasis = Extension.create({
  name: "nativeCharacterEmphasis",
  /**
   * Retain native emphasis independently of all ordinary character effects.
   *
   * Plain external source has no synthetic preference. Explicit NONE remains
   * distinguishable from an absent value for partial-selection formatting.
   * @returns {object[]} Source text-style metadata definition.
   * @example
   * // A foreground-only edit preserves imported below-dot emphasis.
   */
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          nativeEmphasisType: {
            default: null,
            renderHTML: renderCharacterEmphasis,
            /**
             * Restore literal emphasis metadata from imported rich source.
             *
             * Nested character effects inherit the nearest explicit source value.
             * @param {HTMLElement} element - Original imported source element.
             * @returns {number|null} Exact native source code or absent preference.
             * @throws {RangeError} If explicit source metadata is invalid.
             * @example
             * // A retained legacy code fourteen survives an unrelated HTML color edit.
             */
            parseHTML: (element: HTMLElement) => {
              /** Literal source values are validated before entering editable marks. */
              const value = element
                .closest("[data-forhan-emphasis]")
                ?.getAttribute("data-forhan-emphasis");
              return value == null ? null : characterEmphasis(value);
            },
          },
        },
      },
    ];
  },
});
