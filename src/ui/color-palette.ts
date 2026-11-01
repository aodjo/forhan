import {
  normalizeColor,
  rgbChannels,
  colorToHsl,
  hslToColor,
  hslColorChannels,
} from "../colors";
import {
  THEME_COLORS,
  STANDARD_COLORS,
  PALETTE_COLORS,
} from "./color-palette-data";
import "./color-palette.css";

/** Supported native color-selection surfaces. */
type PaletteMode = "theme" | "palette" | "spectrum";
/** Browser screen-color picker capability, detected before enabling its command. */
interface ScreenColorPicker {
  /**
   * Select one screen pixel through the browser's explicit user interaction.
   *
   * Cancellation rejects without changing document color; the signal also
   * cancels a request when its originating document dialog is dismissed.
   * @async
   * @param {{signal: AbortSignal}} options - Lifetime of the originating color picker.
   * @returns {Promise<{sRGBHex: string}>} Explicitly selected opaque screen color.
   * @throws {DOMException} If the user cancels or screen picking is unavailable.
   * @example
   * const selected = await picker.open({ signal: controller.signal });
   */
  open(options: { signal: AbortSignal }): Promise<{ sRGBHex: string }>;
}
/** Maximum number of user-defined colors documented by the native color dialog. */
const CUSTOM_COLOR_LIMIT = 12;
/** Profile-local user colors, independent of document contents and native application settings. */
const CUSTOM_COLOR_KEY = "forhan.custom-colors.v1";
/** Independently drawn mode glyphs retain the measured native icon dimensions. */
const MODE_ICONS: Record<PaletteMode | "eyedropper", string> = {
  theme:
    '<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="white" stroke="#777"/><path d="M3 3h4v4H3z" fill="#f03419"/><path d="M9 3h4v4H9z" fill="#ffe000"/><path d="M3 9h4v4H3z" fill="#00b0db"/><path d="M9 9h4v4H9z" fill="#3975d0"/></svg>',
  palette:
    '<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="white" stroke="#777"/><path d="m3 3 5 5-5 5z" fill="#ffd31b"/><path d="m3 3 5 5 5-5z" fill="#fa355d"/><path d="m13 3-5 5 5 5z" fill="#58bd4b"/><path d="m3 13 5-5 5 5z" fill="#4289e9"/></svg>',
  spectrum:
    '<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="white" stroke="#777"/><path d="M3 3h10v2H3z" fill="#d3dcf2"/><path d="M3 5h10v2H3z" fill="#a5b8e2"/><path d="M3 7h10v2H3z" fill="#7897d4"/><path d="M3 9h10v2H3z" fill="#426bb6"/><path d="M3 11h10v2H3z" fill="#1c3b79"/></svg>',
  eyedropper:
    '<svg viewBox="0 0 16 16"><path d="m10 2 4 4-2 2-1-1-6 6H2v-3l6-6-1-1z" fill="#687c98"/><path d="m4 10 2 2-2 2H2v-2z" fill="#ffda00"/></svg>',
};

/**
 * Render one literal color cell without interpreting imported values as markup.
 *
 * The cell stores only a canonical opaque RGB value; selection outlines are
 * independent CSS geometry rather than images copied from the native program.
 * @param {string} color - Valid opaque source color.
 * @returns {string} Accessible color-cell button markup.
 * @throws {RangeError} If a source color cannot be encoded as opaque RGB.
 * @example
 * colorCell('#ff0000'); // A red color-selection button.
 */
function colorCell(color: string): string {
  /** Canonical values are safe in literal CSS and data attributes. */
  const hex = normalizeColor(color)!;
  return `<button type="button" class="cp-cell" data-color-value="${hex}" style="background:${hex}" aria-label="색 ${hex.toUpperCase()}" title="${hex.toUpperCase()}" tabindex="-1"></button>`;
}

/** Native-style color selection shared by rebuilt ribbons, quick controls and character dialogs. */
export class NativeColorPalette {
  private popup: HTMLDivElement | null = null;
  private anchor: HTMLElement | null = null;
  private target: HTMLInputElement | null = null;
  private allowNone = false;
  private original: string | null = null;
  private draft = "#000000";
  private hsl: [number, number, number] = [0, 0, 0];
  private mode: PaletteMode = "theme";
  private model: "RGB" | "HSL" = "RGB";
  private customColors: string[] = [];
  private customIndex = -1;
  private screenRequest: AbortController | null = null;
  private dragPlane: HTMLElement | null = null;
  private paintedCanvas: HTMLCanvasElement | null = null;
  private paintedHue = Number.NaN;

  /**
   * Bind one delegated color-picker controller for the application window.
   *
   * Dynamic ribbon/dialog replacements need no additional listeners. Saved
   * custom colors are validated before becoming native color cells.
   * @returns {NativeColorPalette} Controller with no initially open popup.
   * @example
   * const palettes = new NativeColorPalette();
   */
  constructor() {
    try {
      /** Profile-local color list may be absent or malformed after an interrupted write. */
      const stored: unknown = JSON.parse(
        localStorage.getItem(CUSTOM_COLOR_KEY) || "[]",
      );
      if (Array.isArray(stored))
        for (
          /** Stored opaque color validated before rendering. */
          const value of stored.slice(
          0,
          CUSTOM_COLOR_LIMIT,
        )) {
          /** Canonical stored colors cannot inject markup into swatch buttons. */
          const color = normalizeColor(value);
          if (color && !this.customColors.includes(color))
            this.customColors.push(color);
        }
    } catch {
      this.customColors = [];
    }
    document.addEventListener("click", this.handleClick.bind(this));
    document.addEventListener(
      "click",
      this.handleOutsideClick.bind(this),
      true,
    );
    document.addEventListener(
      "pointerdown",
      this.handlePointerDown.bind(this),
      true,
    );
    document.addEventListener("pointermove", this.handlePointerMove.bind(this));
    document.addEventListener("pointerup", this.handlePointerUp.bind(this));
    document.addEventListener("pointercancel", this.handlePointerUp.bind(this));
    document.addEventListener("input", this.handleInput.bind(this));
    document.addEventListener("change", this.handleInput.bind(this));
    document.addEventListener("keydown", this.handleKeyDown.bind(this), true);
    document.addEventListener(
      "scroll",
      this.handleViewportChange.bind(this),
      true,
    );
    window.addEventListener("resize", this.handleViewportChange.bind(this));
    /** Dialog replacement invalidates an originating control without altering document data. */
    const observer = new MutationObserver(this.handleDialogChange.bind(this));
    /** Existing modal host owns every generated native character dialog. */
    const modal = document.querySelector("#modal-root");
    if (modal) observer.observe(modal, { childList: true });
    this.handleDialogChange();
  }

  /**
   * Open or toggle the native palette anchored to a live color control.
   *
   * Ribbon buttons share the persistent foreground-color field. Dialog buttons
   * declare their own draft field and whether a no-color option is available.
   * @param {HTMLElement} anchor - Activating color button.
   * @returns {void} Opens the requested picker or closes its existing popup.
   * @example
   * palettes.open(document.querySelector('#font-color-button')!);
   */
  open(anchor: HTMLElement): void {
    if (this.popup && this.anchor === anchor) {
      this.close();
      return;
    }
    this.close(false);
    /** Originating field remains the single source consumed by the existing editor/form handler. */
    const target = document.querySelector<HTMLInputElement>(
      anchor.dataset.colorTarget || "#font-color",
    );
    if (!target || !anchor.isConnected) return;
    this.anchor = anchor;
    this.target = target;
    this.allowNone = anchor.dataset.colorNone === "true";
    try {
      this.original = normalizeColor(target.value, this.allowNone);
    } catch {
      this.original = null;
    }
    this.draft = this.original || (this.allowNone ? "#ff0000" : "#000000");
    this.hsl = colorToHsl(this.draft);
    this.mode = "theme";
    this.model = "RGB";
    this.customIndex = -1;
    this.popup = document.createElement("div");
    this.popup.id = "native-color-palette";
    this.popup.className = "native-color-palette";
    this.popup.setAttribute("role", "dialog");
    this.popup.setAttribute(
      "aria-label",
      this.allowNone ? "음영 색 선택" : "글자 색 선택",
    );
    this.popup.setAttribute("aria-modal", "false");
    document.body.append(this.popup);
    anchor.setAttribute("aria-expanded", "true");
    this.render();
    /** Current native color receives focus before ordinary first-cell fallback. */
    const initial =
      this.allowNone && !this.original
        ? this.popup.querySelector<HTMLElement>("[data-color-none]")
        : this.popup.querySelector<HTMLElement>(
            '.cp-cell[aria-selected="true"]',
          ) || this.popup.querySelector<HTMLElement>(".cp-cell");
    initial?.focus({ preventScroll: true });
  }

  /**
   * Dismiss an owned popup without committing an unfinished spectrum draft.
   *
   * A pending screen-picker request is cancelled, and focus returns only when
   * explicitly requested and the originating control still exists.
   * @param {boolean} [restoreFocus=true] - Whether to return focus to the color button.
   * @returns {void} Removes the popup and clears its transient interaction state.
   * @example
   * palettes.close(); // Escape cancels the unfinished draft.
   */
  close(restoreFocus = true): void {
    /** Originating button can survive the popup while its dialog is being replaced. */
    const anchor = this.anchor;
    this.screenRequest?.abort();
    this.screenRequest = null;
    this.popup?.remove();
    this.popup = null;
    this.anchor = null;
    this.target = null;
    this.dragPlane = null;
    anchor?.setAttribute("aria-expanded", "false");
    if (restoreFocus && anchor?.isConnected)
      anchor.focus({ preventScroll: true });
  }

  /**
   * Render one measured native selection mode and its current draft.
   *
   * Theme and palette cells contain measured RGB data. Spectrum controls use
   * independently implemented RGB/HSL math and retain the previous document color.
   * @returns {void} Rebuilds the popup body and retains its anchor positioning.
   * @example
   * // Switching to spectrum exposes hex, RGB/HSL, hue and user-color controls.
   */
  private render(): void {
    if (!this.popup || !this.anchor) return;
    /** Native mode titles correspond to the independently drawn header glyphs. */
    const modes: [PaletteMode, string][] = [
      ["theme", "테마 색"],
      ["palette", "팔레트"],
      ["spectrum", "스펙트럼"],
    ];
    /** Mode header is shared by foreground and no-color-capable shading controls. */
    let html = this.allowNone
      ? `<button type="button" class="cp-none" data-color-none aria-checked="${!this.original}" role="menuitemcheckbox"><span>${!this.original ? "✓" : ""}</span>없음(A)</button>`
      : "";
    html += '<div class="cp-content"><div class="cp-tabs" role="tablist">';
    for (
      /** Native color surface selectable from the shared header. */
      const [
      mode,
      label,
    ] of modes)
      html += `<button type="button" role="tab" data-color-mode="${mode}" aria-label="${label}" title="${label}" aria-selected="${this.mode === mode}" tabindex="${this.mode === mode ? 0 : -1}">${MODE_ICONS[mode]}</button>`;
    html += `</div><button type="button" class="cp-eyedropper" data-color-eye aria-label="색 골라내기" title="색 골라내기" ${"EyeDropper" in window ? "" : "disabled"}>${MODE_ICONS.eyedropper}</button>`;
    if (this.mode === "theme") {
      html += '<div class="cp-theme-base" role="grid" data-color-columns="10">';
      for (
        /** Base theme color from the measured native strip. */
        const color of THEME_COLORS[0])
        html += colorCell(color);
      html +=
        '</div><span class="cp-theme-more" aria-hidden="true">›</span><div class="cp-theme-shades" role="grid" data-color-columns="10">';
      for (
        /** Measured shade row preserves the native ten-column order. */
        const row of THEME_COLORS.slice(
        1,
      ))
        for (
          /** Native tint or shade associated with the corresponding theme color. */
          const color of row)
          html += colorCell(color);
      html +=
        '</div><div class="cp-theme-divider"></div><div class="cp-standard" role="grid" data-color-columns="10">';
      for (
        /** Standard native color strip remains independent of the current theme. */
        const color of STANDARD_COLORS)
        html += colorCell(color);
      html += "</div>";
    } else if (this.mode === "palette") {
      html +=
        '<div class="cp-palette-strip" role="grid" data-color-columns="20">';
      for (
        /** Saturated and grayscale native palette strip color. */
        const color of PALETTE_COLORS[0])
        html += colorCell(color);
      html +=
        '</div><div class="cp-palette-grid" role="grid" data-color-columns="20">';
      for (
        /** Native color-table row sampled without image editing. */
        const row of PALETTE_COLORS.slice(
        1,
      ))
        for (
          /** Opaque native color cell in the twenty-column palette. */
          const color of row)
          html += colorCell(color);
      html += "</div>";
    } else html += this.spectrumMarkup();
    this.popup.dataset.mode = this.mode;
    this.popup.classList.toggle("cp-with-none", this.allowNone);
    this.popup.innerHTML = html + "</div>";
    for (
      /** Native color cell whose selected outline follows the actual document value. */
      const cell of this.popup.querySelectorAll<HTMLButtonElement>(
      "[data-color-value]",
    ))
      cell.setAttribute(
        "aria-selected",
        String(cell.dataset.colorValue === this.original),
      );
    /** Only one grid cell participates in ordinary tab navigation. */
    const selected =
      this.popup.querySelector<HTMLElement>('.cp-cell[aria-selected="true"]') ||
      this.popup.querySelector<HTMLElement>(".cp-cell");
    if (selected) selected.tabIndex = 0;
    this.refreshSpectrum();
    this.position();
  }

  /**
   * Build the measured spectrum controls without embedding native graphics.
   *
   * User-defined colors are ordinary profile-local RGB values. Empty slots do
   * not accept selection, and no action changes the document before Apply.
   * @returns {string} Spectrum body markup including RGB/HSL and saved-color controls.
   * @example
   * // A six-digit hex draft can be edited before pressing 적용.
   */
  private spectrumMarkup(): string {
    /** Numeric channel labels and bounds follow the selected native color model. */
    const labels = this.model === "RGB" ? ["R", "G", "B"] : ["H", "S", "L"];
    /** Three numeric rows remain within the measured channel panel. */
    let channels = "";
    for (let index = 0; index < 3; index++) {
      /** Hue is angular; other HSL components are percentages, while RGB uses bytes. */
      const maximum = this.model === "RGB" ? 255 : index === 0 ? 360 : 100;
      channels += `<label class="cp-channel"><span>${labels[index]}</span><input type="range" min="0" max="${maximum}" step="1" data-color-channel-range="${index}" aria-label="${labels[index]} 슬라이더"><input type="number" min="0" max="${maximum}" step="1" data-color-channel="${index}" aria-label="${labels[index]} 값" required></label>`;
    }
    /** Saved custom slots use canonical values and cannot contain imported markup. */
    let custom = "";
    for (let index = 0; index < CUSTOM_COLOR_LIMIT; index++) {
      /** Optional saved color keeps an empty slot visually distinct from white. */
      const color = this.customColors[index];
      custom += `<button type="button" class="cp-custom-cell" data-color-custom="${index}" aria-label="사용자 정의 색 ${index + 1}${color ? " " + color.toUpperCase() : " 없음"}" ${color ? `style="background:${color}"` : "disabled"} aria-pressed="${this.customIndex === index}"></button>`;
    }
    return `<span class="cp-prior" style="background:${this.original || "transparent"}"></span><span class="cp-current"></span><input class="cp-hex" aria-label="HTML 색상" maxlength="6" pattern="[0-9A-Fa-f]{6}" required><button type="button" class="cp-apply" data-color-apply><span>✓</span> 적용</button><input type="range" class="cp-hue" min="0" max="360" step="1" aria-label="색상"><div class="cp-plane" tabindex="0" role="slider" aria-label="색상 스펙트럼" aria-valuemin="0" aria-valuemax="100"><canvas class="cp-plane-canvas" aria-hidden="true"></canvas><span class="cp-plane-marker"></span></div><div class="cp-channel-panel"><select class="cp-model" aria-label="색상 모델"><option ${this.model === "RGB" ? "selected" : ""}>RGB</option><option ${this.model === "HSL" ? "selected" : ""}>HSL</option></select>${channels}</div><span class="cp-custom-label">사용자 정의 색</span><button type="button" class="cp-custom-add" data-color-add aria-label="사용자 정의 색 추가">＋</button><button type="button" class="cp-custom-delete" data-color-delete aria-label="사용자 정의 색 삭제" ${this.customIndex < 0 ? "disabled" : ""}>×</button><div class="cp-custom">${custom}</div>`;
  }

  /**
   * Position the whole popup inside the current application viewport.
   *
   * Native geometry is preserved when it fits; short windows scroll the popup
   * rather than placing Apply or a custom-color control outside the viewport.
   * @returns {void} Sets bounded popup coordinates relative to its live anchor.
   * @example
   * // A shading popup near the bottom opens above its originating button.
   */
  private position(): void {
    if (!this.popup || !this.anchor) return;
    /** Actual control bounds determine popup placement without reference-image alignment. */
    const bounds = this.anchor.getBoundingClientRect();
    /** Native outer height differs by mode and the optional no-color row. */
    const height =
      (this.mode === "theme" ? 184 : this.mode === "palette" ? 219 : 436) +
      (this.allowNone ? 29 : 0);
    this.popup.style.left = `${Math.round(Math.max(0, Math.min(bounds.left, innerWidth - 239)))}px`;
    this.popup.style.top = `${Math.round(Math.max(0, Math.min(bounds.bottom + 2 + height <= innerHeight ? bounds.bottom + 2 : bounds.top - height - 2, innerHeight - Math.min(height, innerHeight))))}px`;
  }

  /**
   * Refresh spectrum fields from the current opaque RGB draft.
   *
   * A focused editing field retains its literal draft. Other controls display
   * the corresponding channel values without emitting synthetic input events.
   * @param {HTMLElement} [editing] - Control whose literal input must be retained.
   * @returns {void} Updates spectrum colors, marker geometry and numeric displays.
   * @example
   * // RGB 255,0,0 updates the hue plane and hex display to FF0000.
   */
  private refreshSpectrum(editing?: HTMLElement): void {
    if (!this.popup || this.mode !== "spectrum") return;
    /** Source values are authoritative even when channel displays are rounded. */
    const values =
      this.model === "RGB" ? rgbChannels(this.draft) : colorToHsl(this.draft);
    for (let index = 0; index < 3; index++) {
      /** Numeric and slider presentations share the same native channel value. */
      const number = this.popup.querySelector<HTMLInputElement>(
        `[data-color-channel="${index}"]`,
      )!;
      /** Channel slider remains keyboard-operable without replacing the numeric field. */
      const range = this.popup.querySelector<HTMLInputElement>(
        `[data-color-channel-range="${index}"]`,
      )!;
      if (number !== editing) {
        number.value = String(Math.round(values[index]));
        number.setCustomValidity("");
      }
      if (range !== editing) range.value = String(Math.round(values[index]));
    }
    /** Literal hex input omits the prefix used by native color storage. */
    const hex = this.popup.querySelector<HTMLInputElement>(".cp-hex")!;
    if (hex !== editing) {
      hex.value = this.draft.slice(1).toUpperCase();
      hex.setCustomValidity("");
    }
    /** Hue stays meaningful while editing an achromatic color. */
    const hue = this.popup.querySelector<HTMLInputElement>(".cp-hue")!;
    if (hue !== editing) hue.value = String(Math.round(this.hsl[0]));
    /** Continuous HSL painting shares native pixel coordinates with its pointer selection. */
    const plane = this.popup.querySelector<HTMLElement>(".cp-plane")!;
    this.paintPlane();
    plane.setAttribute("aria-valuenow", String(Math.round(this.hsl[1])));
    plane.setAttribute(
      "aria-valuetext",
      `채도 ${Math.round(this.hsl[1])}%, 명도 ${Math.round(this.hsl[2])}%`,
    );
    /** Marker position is independent of the native theme/palette cell geometry. */
    const marker = plane.querySelector<HTMLElement>(".cp-plane-marker")!;
    marker.style.left = this.hsl[1] + "%";
    marker.style.top = 100 - this.hsl[2] + "%";
    this.popup.querySelector<HTMLElement>(".cp-current")!.style.background =
      this.draft;
    this.popup.querySelector<HTMLButtonElement>("[data-color-add]")!.disabled =
      this.customColors.length >= CUSTOM_COLOR_LIMIT &&
      !this.customColors.includes(this.draft);
  }

  /**
   * Update a spectrum draft while retaining hue for gray and black colors.
   *
   * The document's hidden field remains unchanged until the user chooses Apply.
   * @param {string} color - Supported opaque color selected by numeric/custom controls.
   * @param {number} [hueHint] - Explicit hue supplied by an HSL edit, if present.
   * @returns {void} Stores canonical RGB and its continuous spectrum coordinates.
   * @throws {RangeError} If the color cannot be represented as opaque RGB.
   * @example
   * // Selecting gray retains the previous hue for a later saturation increase.
   */
  private setDraft(color: string, hueHint?: number): void {
    this.draft = normalizeColor(color)!;
    /** New spectrum coordinates are derived before preserving an achromatic hue. */
    const hsl = colorToHsl(this.draft);
    if (hueHint !== undefined) hsl[0] = hueHint;
    else if (hsl[1] === 0) hsl[0] = this.hsl[0];
    this.hsl = hsl;
  }

  /**
   * Paint native HSL saturation and lightness from continuous RGB math.
   *
   * Integer pixel coordinates divided by the plane extent match the measured
   * native progression. The plane is cached until hue, canvas or device scale
   * changes; moving its selection marker does not regenerate the image.
   * @returns {void} Updates an owned canvas without changing document content.
   * @example
   * // The center of a red HSL plane is approximately #bf4040.
   */
  private paintPlane(): void {
    /** Only this popup's live spectrum canvas may receive generated pixels. */
    const canvas =
      this.popup?.querySelector<HTMLCanvasElement>(".cp-plane-canvas");
    if (!canvas) return;
    /** Device-pixel backing dimensions keep the generated plane sharp on high-DPI displays. */
    const width = Math.max(
        1,
        Math.round(canvas.clientWidth * devicePixelRatio),
      ),
      height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
    if (
      this.paintedCanvas === canvas &&
      this.paintedHue === this.hsl[0] &&
      canvas.width === width &&
      canvas.height === height
    )
      return;
    canvas.width = width;
    canvas.height = height;
    /** Canvas output is local and never reads another window or document. */
    const context = canvas.getContext("2d");
    if (!context) return;
    /** Saturated mid-lightness hue supplies unquantized RGB components. */
    const base = hslColorChannels(this.hsl[0], 100, 50);
    /** Generated opaque pixels contain no native application image assets. */
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      /** Native lightness starts at white and approaches black at the lower edge. */
      const lightness = 1 - y / height,
        maximumChroma = 1 - Math.abs(2 * lightness - 1);
      for (let x = 0; x < width; x++) {
        /** Saturation and achromatic lightness use the same formula as selected colors. */
        const chroma = (maximumChroma * x) / width,
          minimum = lightness - chroma / 2,
          offset = (y * width + x) * 4;
        pixels.data[offset] = Math.round(base[0] * chroma + minimum * 255);
        pixels.data[offset + 1] = Math.round(base[1] * chroma + minimum * 255);
        pixels.data[offset + 2] = Math.round(base[2] * chroma + minimum * 255);
        pixels.data[offset + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    this.paintedCanvas = canvas;
    this.paintedHue = this.hsl[0];
  }

  /**
   * Commit an explicitly chosen color through the existing document/form field.
   *
   * Native character-dialog fields remain drafts until their own Apply action.
   * Quick-toolbar edits use their persistent editor handler and retain its range.
   * @param {string | null} color - Opaque selected color or absent shading.
   * @returns {void} Emits one input event and closes the owned palette.
   * @example
   * // Choosing white shading stores #ffffff; choosing 없음 stores an empty field.
   */
  private choose(color: string | null): void {
    if (!this.target?.isConnected || (!color && !this.allowNone)) {
      this.close(false);
      return;
    }
    /** Originating field remains live until its application or modal consumes the edit. */
    const field = this.target;
    field.value = color || "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    this.close(field.id !== "font-color");
  }

  /**
   * Validate and apply the current spectrum draft.
   *
   * Invalid hex or channel input remains editable and never changes the
   * selection or dismisses the enclosing native character dialog.
   * @returns {void} Applies a valid color or reports the current field error.
   * @example
   * // A five-digit hex draft stays open until corrected or cancelled.
   */
  private applyDraft(): void {
    /** Native numeric and hex constraints apply only to the current spectrum mode. */
    const invalid =
      this.popup?.querySelector<HTMLInputElement>("input:invalid");
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    this.choose(this.draft);
  }

  /**
   * Route palette controls without rebinding newly created dialog markup.
   *
   * Mode changes and custom-color management do not commit the document draft;
   * theme/palette cells and the explicit spectrum Apply action do.
   * @param {MouseEvent} event - Click originating anywhere in application chrome.
   * @returns {void} Handles one supported color action.
   * @example
   * // Clicking a shading swatch updates only that dialog's shading field.
   */
  private handleClick(event: MouseEvent): void {
    /** Native color controls can be recreated with their containing ribbon or dialog. */
    const target = event.target as Element;
    /** One live button declares the draft or persistent field it owns. */
    const opener = target.closest<HTMLElement>("[data-color-target]");
    if (opener) {
      event.preventDefault();
      this.open(opener);
      return;
    }
    if (!this.popup?.contains(target)) return;
    /** Explicit mode selection retains a pending spectrum color without applying it. */
    const mode =
      target.closest<HTMLElement>("[data-color-mode]")?.dataset.colorMode;
    if (mode === "theme" || mode === "palette" || mode === "spectrum") {
      this.mode = mode;
      this.render();
      this.popup
        ?.querySelector<HTMLElement>(`[data-color-mode="${mode}"]`)
        ?.focus();
      return;
    }
    if (target.closest("[data-color-none]")) {
      this.choose(null);
      return;
    }
    /** Literal cell values were normalized before their markup was created. */
    const color =
      target.closest<HTMLElement>("[data-color-value]")?.dataset.colorValue;
    if (color) {
      this.choose(color);
      return;
    }
    if (target.closest("[data-color-apply]")) {
      this.applyDraft();
      return;
    }
    if (target.closest("[data-color-eye]")) {
      void this.pickScreen();
      return;
    }
    /** User-defined slots select a spectrum draft without prematurely applying it. */
    const custom = target.closest<HTMLElement>("[data-color-custom]");
    if (custom) {
      this.customIndex = Number(custom.dataset.colorCustom);
      if (this.customColors[this.customIndex])
        this.setDraft(this.customColors[this.customIndex]);
      this.render();
      return;
    }
    if (target.closest("[data-color-add]")) {
      if (this.popup.querySelector("input:invalid")) {
        this.applyDraft();
        return;
      }
      /** Existing colors are selected rather than duplicated in profile storage. */
      const existing = this.customColors.indexOf(this.draft);
      if (existing >= 0) this.customIndex = existing;
      else {
        if (this.customColors.length >= CUSTOM_COLOR_LIMIT) return;
        this.customColors.push(this.draft);
        this.customIndex = this.customColors.length - 1;
      }
      this.saveCustomColors();
      this.render();
      return;
    }
    if (target.closest("[data-color-delete]") && this.customIndex >= 0) {
      this.customColors.splice(this.customIndex, 1);
      this.customIndex = -1;
      this.saveCustomColors();
      this.render();
    }
  }

  /**
   * Consume spectrum hex, RGB/HSL and hue edits as a local color draft.
   *
   * Numeric ranges are checked before conversion, and incomplete input cannot
   * replace the last valid draft with a different native color.
   * @param {Event} event - Input or change event from a live spectrum control.
   * @returns {void} Updates related controls without changing document content.
   * @example
   * // Editing the red channel updates hex and HSL coordinates before Apply.
   */
  private handleInput(event: Event): void {
    /** Native color button swatches follow their actual field values, including no color. */
    const target = event.target;
    if (target instanceof HTMLInputElement && target.id) {
      for (
        /** Dynamic color button paired with the changed field. */
        const button of document.querySelectorAll<HTMLElement>(
        "[data-color-target]",
      ))
        if (button.dataset.colorTarget === "#" + target.id) {
          if (target.id === "font-color") button.classList.add("color-updated");
          this.synchronizeButton(button, target);
        }
    }
    if (
      !(target instanceof HTMLElement) ||
      !this.popup?.contains(target) ||
      this.mode !== "spectrum"
    )
      return;
    if (
      target instanceof HTMLSelectElement &&
      target.classList.contains("cp-model")
    ) {
      this.model = target.value === "HSL" ? "HSL" : "RGB";
      this.render();
      this.popup?.querySelector<HTMLElement>(".cp-model")?.focus();
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (target.classList.contains("cp-hex")) {
      target.setCustomValidity(
        /^[\da-f]{6}$/i.test(target.value)
          ? ""
          : "색상은 6자리 16진수로 입력하세요.",
      );
      if (!target.checkValidity()) return;
      this.setDraft("#" + target.value);
      this.refreshSpectrum(target);
      return;
    }
    if (target.classList.contains("cp-hue")) {
      this.hsl[0] = Number(target.value);
      this.draft = hslToColor(...this.hsl);
      this.refreshSpectrum(target);
      return;
    }
    /** A slider edit first updates the corresponding numeric source field. */
    const index =
      target.dataset.colorChannelRange ?? target.dataset.colorChannel;
    if (index === undefined) return;
    if (target.dataset.colorChannelRange !== undefined)
      this.popup.querySelector<HTMLInputElement>(
        `[data-color-channel="${index}"]`,
      )!.value = target.value;
    /** All three numeric channel values must be complete before the draft changes. */
    const values: number[] = [];
    for (
      /** Numeric channel control within the currently selected color model. */
      const field of this.popup.querySelectorAll<HTMLInputElement>(
      "[data-color-channel]",
    )) {
      field.setCustomValidity("");
      if (
        !field.checkValidity() ||
        !field.value ||
        !Number.isInteger(Number(field.value))
      ) {
        field.setCustomValidity("색상 값을 범위 안의 정수로 입력하세요.");
        return;
      }
      values.push(Number(field.value));
    }
    this.setDraft(
      this.model === "RGB"
        ? normalizeColor(`rgb(${values.join(",")})`)!
        : hslToColor(values[0], values[1], values[2]),
      this.model === "HSL" ? values[0] : undefined,
    );
    this.refreshSpectrum(target);
  }

  /**
   * Synchronize a visible color swatch with its persistent or dialog draft field.
   *
   * Imported named/RGB values become a literal button fill without changing the
   * underlying document field. Empty shading displays the native no-color label.
   * @param {HTMLElement} button - Live native-style color button.
   * @param {HTMLInputElement} field - Associated current color value.
   * @returns {void} Updates the visible swatch and its no-color state.
   * @example
   * // White remains a white swatch while an empty shade displays 음영 색.
   */
  synchronizeButton(button: HTMLElement, field: HTMLInputElement): void {
    /** Opaque imported colors are resolved without embedding arbitrary CSS. */
    let color: string | null;
    try {
      color = normalizeColor(field.value, button.dataset.colorNone === "true");
    } catch {
      color = null;
    }
    button.style.setProperty("--native-selected-color", color || "transparent");
    button.classList.toggle("color-none", !color);
    /** Dialog controls have a labeled sample; compact quick controls retain their glyph. */
    const sample = button.querySelector<HTMLElement>("[data-color-sample]");
    if (sample) sample.textContent = color ? "" : "음영 색";
  }

  /**
   * Guard parent-dialog clicks while a spectrum field contains invalid input.
   *
   * Pointer cancellation alone does not suppress every synthetic or keyboard
   * click. Capture-phase validation prevents the parent Apply handler from
   * consuming an unfinished color while retaining explicit cancellation.
   * @param {MouseEvent} event - Click before its target control receives the action.
   * @returns {void} Blocks invalid Apply or dismisses a valid unfinished popup.
   * @example
   * // Clicking the parent 설정 button cannot bypass an invalid hex draft.
   */
  private handleOutsideClick(event: MouseEvent): void {
    if (!this.popup) return;
    /** Parent-dialog controls remain outside the popup's own action surface. */
    const target = event.target as Element;
    if (this.popup.contains(target) || this.anchor?.contains(target)) return;
    /** An explicit cancel action remains available regardless of field validity. */
    const invalid = this.popup.querySelector<HTMLInputElement>("input:invalid");
    if (invalid && !target.closest('[data-modal-value="cancel"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      invalid.reportValidity();
      return;
    }
    this.close(false);
  }

  /**
   * Dismiss outside clicks or begin an owned saturation/lightness drag.
   *
   * Incomplete spectrum drafts cannot be accidentally applied by clicking the
   * enclosing dialog's Apply. Explicit cancellation always remains available.
   * @param {PointerEvent} event - Pointer press inside or outside the owned palette.
   * @returns {void} Starts a plane drag, closes the palette, or retains invalid input.
   * @example
   * // Clicking the editor cancels a valid unfinished spectrum draft.
   */
  private handlePointerDown(event: PointerEvent): void {
    if (!this.popup) return;
    /** Pointer origin is resolved before any popup removal changes the DOM. */
    const target = event.target as Element;
    if (!this.popup.contains(target)) {
      if (this.anchor?.contains(target)) return;
      /** Explicit dialog cancellation never traps an invalid color draft. */
      const cancel = target.closest('[data-modal-value="cancel"]');
      /** A malformed spectrum value remains editable until corrected or cancelled. */
      const invalid =
        this.popup.querySelector<HTMLInputElement>("input:invalid");
      if (invalid && !cancel) {
        event.preventDefault();
        event.stopImmediatePropagation();
        invalid.reportValidity();
        return;
      }
      this.close(false);
      return;
    }
    /** Continuous plane drags retain their pointer even outside the element bounds. */
    const plane = target.closest<HTMLElement>(".cp-plane");
    if (plane && event.button === 0) {
      event.preventDefault();
      this.dragPlane = plane;
      plane.focus();
      plane.setPointerCapture(event.pointerId);
      this.handlePointerMove(event);
    }
  }

  /**
   * Update saturation and lightness while dragging the actual spectrum plane.
   *
   * Coordinates clamp at the plane edges, so pointer capture cannot generate an
   * out-of-range native color when the user drags outside the popup.
   * @param {PointerEvent} event - Current pointer position during a plane drag.
   * @returns {void} Updates the local spectrum draft and marker position.
   * @example
   * // The center of a red plane selects approximately #bf4040.
   */
  private handlePointerMove(event: PointerEvent): void {
    if (!this.dragPlane) return;
    /** Actual displayed plane bounds provide a device-independent pointer fraction. */
    const bounds = this.dragPlane.getBoundingClientRect();
    this.hsl[1] = Math.max(
      0,
      Math.min(
        100,
        ((event.clientX - bounds.left - this.dragPlane.clientLeft) /
          this.dragPlane.clientWidth) *
          100,
      ),
    );
    this.hsl[2] = Math.max(
      0,
      Math.min(
        100,
        (1 -
          (event.clientY - bounds.top - this.dragPlane.clientTop) /
            this.dragPlane.clientHeight) *
          100,
      ),
    );
    this.draft = hslToColor(...this.hsl);
    this.refreshSpectrum();
  }

  /**
   * Release an owned spectrum pointer drag without committing its draft.
   *
   * Pointer cancellation and normal release share the same cleanup path.
   * @param {PointerEvent} event - Released or cancelled pointer.
   * @returns {void} Clears pointer capture and transient drag state.
   * @example
   * // Releasing outside the popup leaves the last bounded spectrum value ready for Apply.
   */
  private handlePointerUp(event: PointerEvent): void {
    if (this.dragPlane?.hasPointerCapture(event.pointerId))
      this.dragPlane.releasePointerCapture(event.pointerId);
    this.dragPlane = null;
  }

  /**
   * Keep palette navigation and dismissal separate from the enclosing dialog.
   *
   * Escape cancels only the popup, Enter applies a chosen color, and grid arrows
   * move by the native column count. Spectrum-plane arrows edit continuous axes.
   * @param {KeyboardEvent} event - Keyboard event while an owned color popup is open.
   * @returns {void} Handles the popup's keyboard action without applying the parent modal.
   * @example
   * // Escape inside a shading palette leaves 글자 모양 open and unchanged.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.popup || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }
    /** Focused control determines grid, plane or ordinary field navigation. */
    const target = event.target as HTMLElement;
    if (!this.popup.contains(target)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (target.matches("button")) target.click();
      else this.applyDraft();
      return;
    }
    if (event.key === "Tab") {
      /** Visible enabled popup controls form an independent keyboard focus loop. */
      const fields: HTMLElement[] = [];
      for (
        /** Popup focus candidate, excluding hidden/disabled swatches and inactive tabs. */
        const field of this.popup.querySelectorAll<HTMLElement>(
        "button,input,select,[tabindex]",
      ))
        if (
          field.tabIndex >= 0 &&
          !field.matches(":disabled") &&
          field.getClientRects().length
        )
          fields.push(field);
      /** Current popup focus position determines forward or backward wraparound. */
      const index = fields.indexOf(target);
      event.preventDefault();
      event.stopImmediatePropagation();
      fields[
        (index + (event.shiftKey ? -1 : 1) + fields.length) % fields.length
      ]?.focus();
      return;
    }
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    )
      return;
    if (
      target.matches("[data-color-mode]") &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      /** Native mode tabs retain one keyboard tab stop and support adjacent arrow navigation. */
      const tabs = [
        ...this.popup.querySelectorAll<HTMLButtonElement>("[data-color-mode]"),
      ];
      /** Focused header tab determines the next color-selection surface. */
      const index = tabs.indexOf(target as HTMLButtonElement);
      /** Horizontal mode navigation wraps without touching the document draft. */
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) %
              tabs.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      tabs[next].click();
      return;
    }
    if (target.classList.contains("cp-plane")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "ArrowLeft" || event.key === "ArrowRight")
        this.hsl[1] = Math.max(
          0,
          Math.min(100, this.hsl[1] + (event.key === "ArrowLeft" ? -1 : 1)),
        );
      else if (event.key === "ArrowUp" || event.key === "ArrowDown")
        this.hsl[2] = Math.max(
          0,
          Math.min(100, this.hsl[2] + (event.key === "ArrowUp" ? 1 : -1)),
        );
      this.draft = hslToColor(...this.hsl);
      this.refreshSpectrum();
      return;
    }
    /** Grid cells have a measured ten- or twenty-column native layout. */
    const grid = target.closest<HTMLElement>("[data-color-columns]");
    if (grid && target.matches(".cp-cell")) {
      /** Grid ordering is source row order, independent of visual wrapping. */
      const cells = [...grid.querySelectorAll<HTMLButtonElement>(".cp-cell")];
      /** Native column count determines vertical keyboard movement. */
      const columns = Number(grid.dataset.colorColumns),
        index = cells.indexOf(target as HTMLButtonElement);
      /** Requested destination remains inside the current measured palette grid. */
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? cells.length - 1
            : Math.max(
                0,
                Math.min(
                  cells.length - 1,
                  index +
                    (event.key === "ArrowLeft"
                      ? -1
                      : event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowUp"
                          ? -columns
                          : columns),
                ),
              );
      event.preventDefault();
      event.stopImmediatePropagation();
      target.tabIndex = -1;
      cells[next].tabIndex = 0;
      cells[next].focus();
    }
  }

  /**
   * Request an explicitly selected screen color when the browser supports it.
   *
   * Abort/cancellation preserves document state. A result from a dismissed or
   * replaced picker cannot change another control that opened in the meantime.
   * @async
   * @returns {Promise<void>} Resolves after selection, cancellation or capability failure.
   * @example
   * // The eyedropper applies only the pixel the user explicitly chooses.
   */
  private async pickScreen(): Promise<void> {
    /** Browser-provided screen picker is optional across execution environments. */
    const Picker = (
      window as unknown as { EyeDropper?: new () => ScreenColorPicker }
    ).EyeDropper;
    if (!Picker || !this.target) return;
    /** Request identity prevents asynchronous results from reaching a replacement control. */
    const target = this.target;
    this.screenRequest?.abort();
    this.screenRequest = new AbortController();
    try {
      /** Only a completed explicit user selection supplies a document color. */
      const selected = await new Picker().open({
        signal: this.screenRequest.signal,
      });
      if (this.target === target && target.isConnected)
        this.choose(normalizeColor(selected.sRGBHex));
    } catch {
      if (this.target === target) this.anchor?.focus({ preventScroll: true });
    }
  }

  /**
   * Persist validated custom RGB colors in the current application profile.
   *
   * Storage failures retain the in-memory list and do not prevent ordinary
   * document editing or turn an unfinished spectrum draft into a saved color.
   * @returns {void} Writes at most twelve canonical color strings.
   * @example
   * // A new application window can reuse colors added by this profile.
   */
  private saveCustomColors(): void {
    try {
      localStorage.setItem(CUSTOM_COLOR_KEY, JSON.stringify(this.customColors));
    } catch {}
  }

  /**
   * Close an anchored popup when its viewport placement becomes stale.
   *
   * Scrolling inside a short popup keeps its controls usable; editor/viewport
   * scrolling dismisses a popup whose originating control has moved.
   * @param {Event} event - Scroll or resize event affecting the application window.
   * @returns {void} Cancels a stale popup without committing its draft.
   * @example
   * // Scrolling the document closes a quick-toolbar color popup.
   */
  private handleViewportChange(event: Event): void {
    if (event.target instanceof Node && this.popup?.contains(event.target))
      return;
    this.close(false);
  }

  /**
   * Remove a dialog-owned popup when its originating button is detached.
   *
   * Native application actions can replace a dialog without a pointer event;
   * such replacement must not leave a floating picker targeting a stale field.
   * @returns {void} Cancels an orphaned popup and pending screen selection.
   * @example
   * // Closing 글자 모양 also removes its detached shading picker.
   */
  private handleDialogChange(): void {
    if (this.anchor && !this.anchor.isConnected) this.close(false);
    for (
      /** Newly rendered color control paired with a current draft or persistent field. */
      const button of document.querySelectorAll<HTMLElement>(
      "[data-color-target]",
    )) {
      /** The application creates these literal selectors alongside each field. */
      const field = document.querySelector<HTMLInputElement>(
        button.dataset.colorTarget!,
      );
      if (field) this.synchronizeButton(button, field);
    }
  }
}
