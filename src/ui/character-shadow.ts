import { Extension, type ChainedCommands } from "@tiptap/core";
import {
  characterShadow,
  characterShadowCss,
  readCharacterShadow,
  renderCharacterShadow,
} from "../character-shadow.ts";

/** Independent source fields allow partial edits without flattening mixed runs. */
const SHADOW_FIELDS: Readonly<Record<string, string>> = {
  "shadow-type": "nativeShadowType",
  "shadow-x": "nativeShadowOffsetX",
  "shadow-y": "nativeShadowOffsetY",
  "shadow-color": "nativeShadowColor",
};

/** Native shadow metadata belongs to the existing editable text-style mark. */
export const NativeCharacterShadow = Extension.create({
  name: "nativeCharacterShadow",
  /**
   * Retain native shadow fields independently of other character properties.
   *
   * One renderer emits the complete metadata and drawing CSS; the remaining
   * fields are serialized in the source model without duplicate HTML attributes.
   * @returns {object[]} Global text-style attribute definitions.
   * @example
   * // An offset-only edit retains every selected run's own type and color.
   */
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          nativeShadowType: {
            default: null,
            renderHTML: renderCharacterShadow,
            /**
             * Restore an explicitly retained native shadow kind.
             *
             * Plain external spans keep the inherited default without metadata.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {string|null} Validated native kind or no source override.
             * @throws {SyntaxError|RangeError} If explicit metadata is invalid.
             * @example
             * // CONTINUOUS survives HTML export without being reduced to DROP.
             */
            parseHTML: (element: HTMLElement) =>
              readCharacterShadow(element)?.type ?? null,
          },
          nativeShadowOffsetX: {
            default: null,
            rendered: false,
            /**
             * Restore the signed horizontal shadow percentage.
             *
             * Zero remains distinct from the default ten-percent offset.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {number|null} Validated native percentage or no override.
             * @throws {SyntaxError|RangeError} If explicit metadata is invalid.
             * @example
             * // Negative offsets continue to draw left of the source glyph.
             */
            parseHTML: (element: HTMLElement) =>
              readCharacterShadow(element)?.x ?? null,
          },
          nativeShadowOffsetY: {
            default: null,
            rendered: false,
            /**
             * Restore the signed vertical shadow percentage.
             *
             * The original byte value is independent of character baseline offsets.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {number|null} Validated native percentage or no override.
             * @throws {SyntaxError|RangeError} If explicit metadata is invalid.
             * @example
             * // A horizontal extrusion retains its explicit zero vertical offset.
             */
            parseHTML: (element: HTMLElement) =>
              readCharacterShadow(element)?.y ?? null,
          },
          nativeShadowColor: {
            default: null,
            rendered: false,
            /**
             * Restore the independent solid shadow color.
             *
             * Turning the effect off does not discard its saved color preference.
             * @param {HTMLElement} element - Imported text-style span.
             * @returns {string|null} Validated RGB color or no override.
             * @throws {SyntaxError|RangeError} If explicit metadata is invalid.
             * @example
             * // Foreground color changes do not overwrite native shadow color.
             */
            parseHTML: (element: HTMLElement) =>
              readCharacterShadow(element)?.color ?? null,
          },
        },
      },
    ];
  },
});

/**
 * Keep native shadow draft controls enabled only while their effect is active.
 *
 * Listeners belong to this owned form and never edit the document. Disabled
 * fields keep their original drafts so returning to an active kind restores them.
 * @param {HTMLFormElement} form - Existing character dialog form.
 * @returns {void} Initializes local control state and its input listener.
 * @example
 * bindShadowControls(form); // Choosing NONE disables offsets and the color picker.
 */
export function bindShadowControls(form: HTMLFormElement): void {
  /**
   * Refresh local enabled states without dispatching invented source edits.
   *
   * The shared color palette still owns literal color selection and cancellation.
   * @returns {void} Updates only this form's shadow controls.
   * @example
   * // An unrelated character edit cannot enable a disabled shadow palette.
   */
  function refresh(): void {
    /** Checked native radio is the single authoritative local shadow kind. */
    const disabled =
      form.querySelector<HTMLInputElement>('[name="shadow-type"]:checked')!
        .value === "NONE";
    for (/** Each dependent label retains its existing absolute native geometry. */ const label of form.querySelectorAll<HTMLElement>(
      ".nd-shadow-x,.nd-shadow-y,.nd-shadow-color",
    )) {
      label.classList.toggle("nd-expanded-muted", disabled);
      for (/** Hidden color preferences remain source values even while their picker is disabled. */ const field of label.querySelectorAll<
        HTMLInputElement | HTMLButtonElement
      >("input:not([type=hidden]),button"))
        field.disabled = disabled;
    }
  }
  form.addEventListener("input", refresh);
  refresh();
}

/**
 * Draw the pending shadow on the character preview without editing source text.
 *
 * Invalid intermediate numeric drafts suppress only this temporary effect;
 * browser form validity prevents those drafts from becoming applied changes.
 * @param {HTMLElement} sample - Actual original preview sample.
 * @param {HTMLFormElement} form - Current cancelable shadow draft.
 * @returns {void} Updates only the sample's drawing style.
 * @example
 * renderShadowPreview(sample,form); // Foreground color remains independent.
 */
export function renderShadowPreview(
  sample: HTMLElement,
  form: HTMLFormElement,
): void {
  try {
    /** Shared preview metadata lets a contour layer retain the same independent shadow. */
    const attrs = {
      fontSize:
        form.querySelector<HTMLInputElement>('[name="size"]')!.value + "pt",
      nativeShadowType: form.querySelector<HTMLInputElement>(
        '[name="shadow-type"]:checked',
      )!.value,
      nativeShadowOffsetX:
        form.querySelector<HTMLInputElement>('[name="shadow-x"]')!.value,
      nativeShadowOffsetY:
        form.querySelector<HTMLInputElement>('[name="shadow-y"]')!.value,
      nativeShadowColor: form.querySelector<HTMLInputElement>(
        '[name="shadow-color"]',
      )!.value,
    };
    sample.dataset.forhanShadow=JSON.stringify(characterShadow(attrs));
    sample.style.textShadow=characterShadowCss(attrs);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    delete sample.dataset.forhanShadow;
    sample.style.textShadow = "none";
  }
}

/**
 * Apply only explicitly edited shadow fields to the existing character chain.
 *
 * Mixed selections retain each untouched offset, kind and color on its own run.
 * Disabling an effect ignores invalid disabled numeric drafts while preserving
 * their original source preferences; active numeric edits must fit signed bytes.
 * @param {ChainedCommands} chain - Owning single character-edit transaction.
 * @param {Record<string,string|boolean>} values - Captured local form values.
 * @param {Set<string>} changed - Names explicitly edited by the user.
 * @returns {boolean} Whether a real native shadow change was queued.
 * @throws {RangeError} If an active numeric shadow draft is invalid.
 * @example
 * applyShadowDraft(chain,values,new Set(['shadow-color'])); // Preserves mixed positions.
 */
export function applyShadowDraft(
  chain: ChainedCommands,
  values: Record<string, string | boolean>,
  changed: Set<string>,
): boolean {
  /** Flat independent source attributes avoid replacing representative nested style objects. */
  const attrs: Record<string, unknown> = {};
  for (/** Only actual edited form fields participate in this transaction. */ const [
    field,
    key,
  ] of Object.entries(SHADOW_FIELDS)) {
    if (!changed.has(field)) continue;
    if (field === "shadow-x" || field === "shadow-y") {
      /** Empty numeric drafts are not silently interpreted as an explicit zero. */
      const literal = String(values[field] ?? ""),
        value = Number(literal);
      if (
        !literal.trim() ||
        !Number.isInteger(value) ||
        value < -128 ||
        value > 127
      ) {
        if (values["shadow-type"] === "NONE") continue;
        throw new RangeError(
          "그림자 방향은 -128~127 사이의 정수로 입력하세요.",
        );
      }
      attrs[key] = value;
    } else attrs[key] = values[field];
  }
  if (!Object.keys(attrs).length) return false;
  characterShadow(attrs);
  chain.setMark("textStyle", attrs);
  return true;
}
