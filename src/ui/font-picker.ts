import {
  enumerateInstalledFonts,
  matchesInstalledFont,
  type InstalledFont,
  type LocalFontWindow,
} from "./installed-fonts";
import "./font-picker.css";

/** All persistent and dynamically rebuilt native font-family controls. */
const FONT_FIELDS =
  '#font-family,.native-ribbon select[data-native-action="font"],#native-format-form select[name="family"]';
/** Native quick-font category labels, independently rendered as application controls. */
const FONT_GROUPS = [
  "모든 글꼴",
  "현재 글꼴",
  "제목 글꼴",
  "본문 글꼴",
  "꾸미기 글꼴",
  "한컴 글꼴",
  "시스템 글꼴",
] as const;
/** Native font-list row height measured through an owned UI Automation capture. */
const FONT_ROW_HEIGHT = 26;

/** Shared font dropdown preserves ordinary select values while adding local catalog and native interaction. */
export class NativeFontPicker {
  private fonts: InstalledFont[] = [];
  private loading: Promise<void> | null = null;
  private loaded = false;
  private popup: HTMLDivElement | null = null;
  private field: HTMLSelectElement | null = null;
  private draft: HTMLInputElement | null = null;
  private list: HTMLDivElement | null = null;
  private choices: InstalledFont[] = [];
  private active = -1;
  private group = 0;
  private typed = false;
  private chosen = false;
  private openingPointer = false;

  /**
   * Bind delegated font-list interactions without changing the blank document.
   *
   * Font discovery starts only when the user opens a font control. Rebuilt ribbon
   * and dialog controls share the catalog without duplicate listeners or filesystem IPC.
   * @returns {NativeFontPicker} Controller with no open dropdown or pending font request.
   * @example
   * const fontPicker = new NativeFontPicker();
   */
  constructor() {
    document.addEventListener(
      "pointerdown",
      this.handlePointerDown.bind(this),
      true,
    );
    document.addEventListener("click", this.handleClick.bind(this), true);
    document.addEventListener("keydown", this.handleKeyDown.bind(this), true);
    document.addEventListener("input", this.handleInput.bind(this), true);
    document.addEventListener(
      "compositionend",
      this.handleCompositionEnd.bind(this),
      true,
    );
    window.addEventListener("resize", this.handleLayout.bind(this));
    document.addEventListener("scroll", this.handleScroll.bind(this), true);
    /** Dynamic modal removal must not leave a dropdown attached to a destroyed font field. */
    const observer = new MutationObserver(this.handleMutation.bind(this));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Enumerate local fonts once and populate the current real select controls.
   *
   * Browser denial/unavailability retains existing choices and imported family
   * names. Catalog updates dispatch no input/change event and cannot edit a document.
   * @async
   * @param {boolean} [refresh=false] - Whether an explicit refresh should enumerate again.
   * @returns {Promise<void>} Resolves after available font metadata is cached or fallback retained.
   * @example
   * await picker.load();
   */
  async load(refresh = false): Promise<void> {
    if (this.loading) return this.loading;
    if (this.loaded && !refresh) return;
    this.loading = this.discover();
    await this.loading;
    this.loading = null;
  }

  /**
   * Discover browser-owned font descriptors and refresh connected controls.
   *
   * Only names and script samples are retained. A closed or replaced dropdown
   * cannot be reopened or committed by a late metadata result.
   * @async
   * @returns {Promise<void>} Resolves after catalog discovery or capability fallback.
   * @example
   * // Completing discovery updates the existing menu without changing selection.
   */
  private async discover(): Promise<void> {
    try {
      this.fonts = await enumerateInstalledFonts(
        window as unknown as LocalFontWindow,
      );
      this.loaded = true;
    } catch {
      this.loaded = true;
      this.fonts = [];
    }
    for (/** Font fields retain their selected canonical or imported value during catalog refresh. */
    const field of document.querySelectorAll<HTMLSelectElement>(FONT_FIELDS))
      this.populate(field);
    if (this.field?.isConnected && this.popup) this.renderList();
  }

  /**
   * Add every discovered family to a real font field while preserving its value.
   *
   * Canonical values remain stable for native export. Localized names are labels
   * only, and imported names remain explicit choices even when unavailable locally.
   * @param {HTMLSelectElement} field - Existing font select in the current UI.
   * @returns {void} Adds missing installed choices without dispatching document edits.
   * @example
   * // An imported custom face stays selected while new installed fonts are added.
   */
  private populate(field: HTMLSelectElement): void {
    /** Selected source identifier is never replaced by a localized alias. */
    const value = field.value;
    /** Existing values include imported names and platform-independent generic families. */
    const existing = new Set<string>();
    for (/** Existing option's identity remains independent of display-label localization. */
    const option of field.options)
      existing.add(option.value);
    for (/** Installed canonical family discovered through the browser's local font API. */
    const font of this.fonts)
      if (!existing.has(font.family)) {
        field.add(new Option(font.label, font.family));
        existing.add(font.family);
      }
    field.value = value;
    field.dataset.fontCatalog = this.fonts.length ? "installed" : "fallback";
    field.dataset.installedFamilies = String(this.fonts.length);
  }

  /**
   * Open a native-size dropdown for a quick, ribbon or character-dialog field.
   *
   * The original select stays authoritative for existing editor handlers. The
   * editable overlay stores only a local font-name draft until explicit choice.
   * @param {HTMLSelectElement} field - Connected enabled source font control.
   * @param {string} [initial=""] - Optional first typed character.
   * @returns {void} Opens one dropdown and starts lazy local discovery.
   * @example
   * picker.open(document.querySelector('#font-family'));
   */
  open(field: HTMLSelectElement, initial = ""): void {
    if (field.disabled || !field.isConnected) return;
    this.close(false);
    this.field = field;
    this.typed = !!initial;
    this.group = 0;
    this.populate(field);
    this.popup = document.createElement("div");
    this.popup.id = "native-font-picker";
    /** Dialog fields use the measured compact list; quick/ribbon fields use the categorized font pane. */
    const compact = !!field.closest(".native-dialog-character");
    this.popup.className = compact ? "nfp-compact" : "nfp-expanded";
    this.popup.setAttribute("role", "dialog");
    this.popup.setAttribute("aria-label", "글꼴 목록");
    if (!compact) {
      /** Native category column remains outside the scrolling font sample list. */
      const groups = document.createElement("div");
      groups.className = "nfp-groups";
      groups.setAttribute("role", "tablist");
      groups.setAttribute("aria-label", "글꼴 분류");
      for (let index = 0; index < FONT_GROUPS.length; index++) {
        /** Independently functional native font category. */
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.fontGroup = String(index);
        button.textContent = FONT_GROUPS[index];
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(index === this.group));
        groups.append(button);
      }
      /** Explicit refresh makes newly installed local fonts available without restarting the document. */
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "nfp-refresh";
      refresh.dataset.fontRefresh = "";
      refresh.textContent = "글꼴 새로 고침";
      groups.append(refresh);
      this.popup.append(groups);
    }
    this.list = document.createElement("div");
    this.list.id = "native-font-options";
    this.list.className = "nfp-list";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "사용할 글꼴");
    this.popup.append(this.list);
    document.body.append(this.popup);
    field.setAttribute("aria-expanded", "true");
    field.setAttribute("aria-controls", this.list.id);
    this.draft = document.createElement("input");
    this.draft.type = "text";
    this.draft.id = "native-font-draft";
    this.draft.className = "nfp-draft";
    this.draft.setAttribute("role", "combobox");
    this.draft.setAttribute("aria-autocomplete", "list");
    this.draft.setAttribute("aria-expanded", "true");
    this.draft.setAttribute("aria-controls", this.list.id);
    this.draft.setAttribute("aria-label", "글꼴 이름 입력");
    this.draft.value =
      initial || field.selectedOptions[0]?.textContent || field.value;
    document.body.append(this.draft);
    this.position();
    this.renderList();
    this.draft.focus();
    if (initial) this.updateQuery();
    else this.draft.select();
    void this.load();
  }

  /**
   * Collect font families currently used in the document or a structural subset.
   *
   * Heading and body categories reflect actual document choices, including
   * imported fonts, rather than inventing a curated native font collection.
   * @param {string} selector - Document subtree whose face names are requested.
   * @returns {Set<string>} Literal source family names used by matching text spans.
   * @example
   * picker.usedFonts('.tiptap h1,.tiptap h2');
   */
  private usedFonts(selector: string): Set<string> {
    /** Explicit fonts used in the selected document structures. */
    const result = new Set<string>();
    for (/** Authored text span whose computed fallback is not substituted into document marks. */
    const element of document.querySelectorAll<HTMLElement>(selector)) {
      /** Literal inline face removes only an enclosing quote pair. */
      const family = element.style.fontFamily.replace(/^(["'])(.*)\1$/, "$2");
      if (family) result.add(family);
    }
    if (!result.size && this.field?.value) result.add(this.field.value);
    return result;
  }

  /**
   * Build visible menu choices from installed and current document families.
   *
   * Language filtering uses real cmap samples when known. Existing selected
   * names remain available even if metadata or the installed family is absent.
   * @returns {InstalledFont[]} Current categorized font choices in stable order.
   * @example
   * // Latin scope can list a Western face without claiming Hangul support.
   */
  private visibleFonts(): InstalledFont[] {
    if (!this.field) return [];
    /** Local choices can be unavailable after browser denial without removing source fields. */
    const fonts = this.fonts.length ? [...this.fonts] : [];
    /** Current source and fallback choices remain selectable without being mislabeled as installed. */
    const extras: InstalledFont[] = [];
    /** Unavailable source fonts remain selectable only when current or actually used in this document. */
    const usedNames = this.usedFonts('.tiptap [style*="font-family"]');
    for (/** Literal existing choice can represent an imported missing font or generic CSS family. */
    const option of this.field.options) {
      if (!option.value) continue;
      if (
        fonts.length &&
        option.value !== this.field.value &&
        !usedNames.has(option.value) &&
        !["serif", "sans-serif", "monospace"].includes(option.value) &&
        !fonts.some(
          /**
           * Keep only installed, generic or authored choices after discovery.
           *
           * An unrelated platform's initial fallback is not presented as an installed family.
           * @param {InstalledFont} font - Available installed candidate.
           * @returns {boolean} Whether the legacy option names an actual local family.
           * @example
           * // An unavailable Apple family is omitted on Windows unless authored in the document.
           */
          (font) => matchesInstalledFont(font, option.value),
        )
      )
        continue;
      if (
        !fonts.some(
          /**
           * Resolve a source choice against canonical and localized installed aliases.
           *
           * Equal aliases reuse the local family's metadata without changing the source value.
           * @param {InstalledFont} font - Installed family candidate.
           * @returns {boolean} Whether the source choice names this installed family.
           * @example
           * // 함초롬바탕 can resolve to HCR Batang without rewriting the document.
           */
          (font) => matchesInstalledFont(font, option.value),
        )
      )
        extras.push({
          family: option.value,
          label: option.textContent || option.value,
          aliases: [option.value],
          scripts: null,
          decorative: null,
        });
    }
    /** Native dialog language selection is independent of the current font field's value. */
    const language = document.querySelector<HTMLSelectElement>(
      '#native-format-form [name="language"]',
    )?.value;
    /** Representative scope permits all scripts; only explicit language choices filter Unicode support. */
    const slot = language && language !== "all" ? Number(language) : 6;
    /** Native side categories retain document-based choices, not copied private Hancom collections. */
    const used =
      this.group === 1
        ? this.usedFonts('.tiptap [style*="font-family"]')
        : this.group === 2
          ? this.usedFonts(
              '.tiptap :is(h1,h2,h3,h4,h5,h6) [style*="font-family"]',
            )
          : this.group === 3
            ? this.usedFonts('.tiptap p [style*="font-family"]')
            : null;
    /** Available installed choices filtered by the currently selected native scope/category. */
    const result: InstalledFont[] = [];
    for (/** Local or retained-source font candidate. */
    const font of [...fonts, ...extras]) {
      if (
        this.field.closest(".native-dialog-character") &&
        font.scripts &&
        slot < 6 &&
        !font.scripts[slot] &&
        !matchesInstalledFont(font, this.field.value)
      )
        continue;
      if (used) {
        let match = false;
        for (/** Source font name used in the chosen document structures. */
        const name of used)
          if (matchesInstalledFont(font, name)) {
            match = true;
            break;
          }
        if (!match) continue;
      }
      /** Native PANOSE metadata identifies real decorative/script/symbol families when known. */
      const decorative = font.decorative === true;
      /** Vendor grouping uses literal installed face/alias names rather than native binaries. */
      const hancom =
        /^(?:HCR |Hancom|Haansoft|Han Santteut|함초롬|한컴|한양)/i.test(
          font.family,
        ) || /^(?:함초롬|한컴)/.test(font.label);
      if (
        (this.group === 4 && !decorative) ||
        (this.group === 5 && !hancom) ||
        (this.group === 6 && hancom)
      )
        continue;
      if (
        !result.some(
          /**
           * Keep distinct family identifiers while suppressing duplicate fallback rows.
           *
           * No CSS or native font substitution is performed during deduplication.
           * @param {InstalledFont} existing - Earlier accepted row.
           * @returns {boolean} Whether its canonical family is already present.
           * @example
           * // One canonical Arial row remains visible.
           */
          (existing) => existing.family === font.family,
        )
      )
        result.push(font);
    }
    return result;
  }

  /**
   * Render literal font names and keep the active choice at the native list origin.
   *
   * Quick controls preview each face while compact dialog rows use the measured
   * native UI font and TT indicator. Imported names are created only as text nodes.
   * @returns {void} Updates the current list and its accessibility selection state.
   * @example
   * // Metadata completion localizes row labels without committing a font change.
   */
  private renderList(): void {
    if (!this.list || !this.field) return;
    /** Pending keyboard selection keeps its identity if discovery reorders the list. */
    const pending = this.chosen ? this.choices[this.active]?.family : null;
    this.choices = this.visibleFonts();
    this.list.replaceChildren();
    this.active = -1;
    for (let index = 0; index < this.choices.length; index++) {
      /** Literal family and localized display label for this row. */
      const font = this.choices[index];
      /** A real button preserves keyboard/click activation without inline markup interpolation. */
      const row = document.createElement("button");
      row.type = "button";
      row.className = "nfp-row";
      row.id = "native-font-option-" + index;
      row.dataset.fontIndex = String(index);
      row.dataset.fontFamily = font.family;
      row.setAttribute("role", "option");
      row.tabIndex = -1;
      row.title = font.family;
      if (matchesInstalledFont(font, this.field.value)) this.active = index;
      row.setAttribute(
        "aria-selected",
        String(matchesInstalledFont(font, this.field.value)),
      );
      /** Native compact menu uses an independently drawn green TrueType indicator. */
      const marker = document.createElement("span");
      marker.className = "nfp-tt";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = "Tт";
      row.append(marker);
      /** Labels remain plain text even for a font with punctuation resembling markup. */
      const label = document.createElement("span");
      label.className = "nfp-label";
      label.textContent = font.label;
      if (this.popup?.classList.contains("nfp-expanded"))
        label.style.fontFamily = `"${font.family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      row.append(label);
      this.list.append(row);
    }
    if (!this.choices.length) {
      /** Empty categories remain explicit instead of presenting unrelated substitute faces. */
      const empty = document.createElement("div");
      empty.className = "nfp-empty";
      empty.textContent = "해당 글꼴이 없습니다.";
      this.list.append(empty);
    }
    if (this.active < 0 && this.choices.length) this.active = 0;
    if (pending) {
      /** Updated index of the same pending family after asynchronous localization/sorting. */
      const index = this.choices.findIndex(
        /**
         * Keep a pending keyboard choice stable across catalog refresh.
         *
         * Only the current list position changes; document marks remain untouched.
         * @param {InstalledFont} font - Updated local family row.
         * @returns {boolean} Whether this is the pending chosen family.
         * @example
         * // Arial remains chosen after Korean labels arrive before it in sorted order.
         */
        (font) => font.family === pending,
      );
      if (index >= 0) this.active = index;
    }
    if (this.typed) this.updateQuery();
    else this.highlight(false, true);
  }

  /**
   * Position the native list and editable draft against actual viewport bounds.
   *
   * Compact and expanded menu dimensions come from separate owned native captures.
   * Small viewports clamp the popup and reduce its height without scrolling the document.
   * @returns {void} Positions connected menu elements or leaves a closed menu unchanged.
   * @example
   * // A quick font control opens a 393 by 474 categorized popup when space permits.
   */
  private position(): void {
    if (!this.field || !this.popup || !this.draft) return;
    /** Actual control bounds retain the current window scale and modal position. */
    const rect = this.field.getBoundingClientRect(),
      compact = this.popup.classList.contains("nfp-compact");
    /** Native popup dimensions differ between compact dialog and categorized quick menus. */
    const width = Math.min(
        window.innerWidth - 8,
        compact ? Math.max(324, rect.width) : 393,
      ),
      height = Math.min(window.innerHeight - 8, compact ? 478 : 474);
    this.popup.style.width = Math.round(width) + "px";
    this.popup.style.height = Math.round(height) + "px";
    this.popup.style.left =
      Math.round(
        Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)),
      ) + "px";
    this.popup.style.top =
      Math.round(
        Math.max(4, Math.min(rect.bottom, window.innerHeight - height - 4)),
      ) + "px";
    /** Quick/ribbon labels leave their native TrueType marker visible while the font name is edited. */
    const inset = compact ? 2 : 21;
    this.draft.style.left = Math.round(rect.left + inset) + "px";
    this.draft.style.top = Math.round(rect.top + 2) + "px";
    this.draft.style.width =
      Math.max(20, Math.round(rect.width - inset - 18)) + "px";
    this.draft.style.height = Math.max(16, Math.round(rect.height - 4)) + "px";
  }

  /**
   * Match a typed font prefix without editing source formatting.
   *
   * No match stays an invalid local draft. Enter selects a matching completion;
   * cancellation always restores the original control value.
   * @returns {void} Updates local completion, validation and active row.
   * @example
   * // Typing 함초롬 finds its canonical installed family by localized alias.
   */
  private updateQuery(): void {
    if (!this.draft) return;
    this.active = this.choices.findIndex(
      /**
       * Find a literal installed or retained family matching the current typed prefix.
       *
       * Matching is normalized for search only; canonical source values remain intact.
       * @param {InstalledFont} font - Current category choice.
       * @returns {boolean} Whether its name or native alias starts with the draft.
       * @example
       * // Ar can complete to Arial without writing Ar into document marks.
       */
      (font) => matchesInstalledFont(font, this.draft!.value, true),
    );
    this.draft.setCustomValidity(
      this.active < 0 ? "목록에서 사용할 글꼴을 선택하세요." : "",
    );
    this.highlight(true, true);
  }

  /**
   * Reflect the active list row and keep it visible without moving editor content.
   *
   * Initial native opening scrolls the chosen face to the first row. Keyboard
   * navigation then scrolls only enough to keep its focused row within the list.
   * @param {boolean} keyboard - Whether to draw the keyboard highlight.
   * @param {boolean} [origin=false] - Whether the active row becomes the first visible row.
   * @returns {void} Updates list highlight and combobox active-descendant metadata.
   * @example
   * // ArrowDown moves focus one 26-pixel native row.
   */
  private highlight(keyboard: boolean, origin = false): void {
    if (!this.list) return;
    for (/** Current literal font row whose focus state remains independent of document formatting. */
    const row of this.list.querySelectorAll<HTMLElement>("[data-font-index]"))
      row.classList.toggle(
        "nfp-active",
        keyboard && Number(row.dataset.fontIndex) === this.active,
      );
    /** Current active row, if the typed prefix has a match. */
    const row = this.list.querySelector<HTMLElement>(
      `[data-font-index="${this.active}"]`,
    );
    if (!row) {
      this.draft?.removeAttribute("aria-activedescendant");
      return;
    }
    this.draft?.setAttribute("aria-activedescendant", row.id);
    if (origin) this.list.scrollTop = this.active * FONT_ROW_HEIGHT;
    else if (row.offsetTop - 4 < this.list.scrollTop)
      this.list.scrollTop = Math.max(0, row.offsetTop - 4);
    else if (
      row.offsetTop + row.offsetHeight >
      this.list.scrollTop + this.list.clientHeight
    )
      this.list.scrollTop =
        row.offsetTop + row.offsetHeight - this.list.clientHeight;
  }

  /**
   * Commit one explicit font choice through the real source field's events.
   *
   * The popup is removed before dispatch so an editor focus update cannot leave
   * stale dropdown elements. Dialog fields still remain local until parent Apply.
   * @param {number} index - Selected current-category font row.
   * @returns {void} Applies the chosen canonical font or ignores an invalid index.
   * @example
   * // Choosing HCR Batang displays 함초롬바탕 while preserving a valid CSS/native name.
   */
  private commit(index: number): void {
    /** A late catalog update cannot apply a font to a replaced or disconnected field. */
    const field = this.field,
      font = this.choices[index];
    if (!field?.isConnected || !font) return;
    let value = font.family;
    if (matchesInstalledFont(font, field.value)) value = field.value;
    /** Imported aliases remain authoritative only when they were the actual selected source value. */
    const exists = Array.from(field.options).some(
      /**
       * Locate the committed canonical or retained source family option.
       *
       * Missing canonical entries are added as safe DOM options below.
       * @param {HTMLOptionElement} option - Existing font field choice.
       * @returns {boolean} Whether this value can be committed directly.
       * @example
       * // A discovered local face can be added without replacing source aliases.
       */
      (option) => option.value === value,
    );
    if (!exists) field.add(new Option(font.label, value));
    this.close(false);
    field.value = value;
    field.focus();
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Close the local font menu without applying an unfinished choice.
   *
   * Original selected values and document marks remain unchanged. Focus returns
   * only when requested and the original source field still exists.
   * @param {boolean} [restore=true] - Whether to refocus the original field.
   * @returns {void} Removes all transient font-menu and typing elements.
   * @example
   * picker.close(); // Escape cancels only the font dropdown.
   */
  close(restore = true): void {
    /** Original field identity survives only until its current dialog/ribbon is replaced. */
    const field = this.field;
    this.popup?.remove();
    this.draft?.remove();
    this.popup = null;
    this.draft = null;
    this.list = null;
    this.field = null;
    this.choices = [];
    this.active = -1;
    this.typed = false;
    this.chosen = false;
    this.openingPointer = false;
    field?.setAttribute("aria-expanded", "false");
    field?.removeAttribute("aria-controls");
    if (restore && field?.isConnected) field.focus();
  }

  /**
   * Open font controls and protect invalid typed drafts before outside actions.
   *
   * Explicit parent cancellation always discards the dropdown. A valid typed
   * choice commits before a scope switch or Apply; invalid input cannot bypass validation.
   * @param {PointerEvent | MouseEvent} event - Capture-phase pointer or fallback click.
   * @returns {void} Opens, closes or validates the currently owned font menu.
   * @example
   * // Clicking parent Apply cannot silently discard an invalid font name.
   */
  private handlePointerDown(event: PointerEvent | MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    if (event.type === "pointerdown") this.openingPointer = false;
    /** Original select controls remain visible and keep all existing document handlers. */
    const field = event.target.closest<HTMLSelectElement>(FONT_FIELDS);
    if (field && !field.disabled && event.button === 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open(field);
      this.openingPointer = event.type === "pointerdown";
      return;
    }
    if (
      !this.popup ||
      this.popup.contains(event.target) ||
      event.target === this.draft
    )
      return;
    if (event.target.closest('[data-modal-value="cancel"]')) {
      this.close(false);
      return;
    }
    if (this.typed && this.draft && !this.draft.checkValidity()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.draft.reportValidity();
      return;
    }
    if ((this.typed || this.chosen) && this.active >= 0)
      this.commit(this.active);
    else this.close(false);
  }

  /**
   * Activate a native font row, category or explicit catalog refresh.
   *
   * Capture-phase outside guarding also covers programmatic clicks that do not
   * emit pointer events. Popup controls never dispatch parent modal actions.
   * @param {MouseEvent} event - Click from a font menu or surrounding UI.
   * @returns {void} Applies the selected local menu action.
   * @example
   * // A category change affects only visible choices, never the document font.
   */
  private handleClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    if (this.openingPointer) {
      this.openingPointer = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!this.popup && event.target.closest(FONT_FIELDS)) {
      this.handlePointerDown(event);
      return;
    }
    if (!this.popup?.contains(event.target)) {
      if (this.popup) this.handlePointerDown(event);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    /** Clicked native list row. */
    const row = event.target.closest<HTMLElement>("[data-font-index]");
    if (row) {
      this.commit(Number(row.dataset.fontIndex));
      return;
    }
    /** Selected native category button. */
    const group = event.target.closest<HTMLElement>("[data-font-group]");
    if (group) {
      this.group = Number(group.dataset.fontGroup);
      this.typed = false;
      this.chosen = false;
      this.draft?.setCustomValidity("");
      for (/** Category tabs expose the current list scope to assistive technology. */
      const tab of this.popup.querySelectorAll<HTMLElement>(
        "[data-font-group]",
      ))
        tab.setAttribute("aria-selected", String(tab === group));
      this.renderList();
      this.draft?.focus();
      return;
    }
    if (event.target.closest("[data-font-refresh]")) void this.load(true);
  }

  /**
   * Keep font-list keyboard actions separate from native parent dialogs.
   *
   * Escape cancels only this menu; Enter commits one choice; arrows, page keys,
   * Home and End move within real rows without editing text until commitment.
   * @param {KeyboardEvent} event - Keyboard input at a source font control or open list.
   * @returns {void} Handles supported font keyboard interactions.
   * @example
   * // Alt+Down opens the categorized list while keeping the editor selection.
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.isComposing) {
      if (event.target === this.draft) event.stopImmediatePropagation();
      return;
    }
    if (!this.popup) {
      /** Source control can open a dropdown through standard combobox keys. */
      const field =
        event.target instanceof Element
          ? event.target.closest<HTMLSelectElement>(FONT_FIELDS)
          : null;
      if (
        field &&
        (event.key === "F4" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Enter" ||
          event.key === " " ||
          (!event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key.length === 1))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open(
          field,
          event.key.length === 1 && event.key !== " " ? event.key : "",
        );
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }
    if (
      event.target !== this.draft &&
      !this.popup.contains(event.target as Node)
    )
      return;
    if (
      event.target instanceof HTMLButtonElement &&
      event.target.closest(".nfp-groups") &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.target.click();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.active >= 0) this.commit(this.active);
      else this.draft?.reportValidity();
      return;
    }
    if (event.key === "Tab") {
      if (this.typed && this.draft && !this.draft.checkValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.draft.reportValidity();
        return;
      }
      if ((this.typed || this.chosen) && this.active >= 0)
        this.commit(this.active);
      else this.close();
      return;
    }
    if (
      ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(
        event.key,
      ) &&
      this.choices.length
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      /** Native page movement follows the number of complete visible font rows. */
      const page = Math.max(
        1,
        Math.floor(
          (this.list?.clientHeight || FONT_ROW_HEIGHT) / FONT_ROW_HEIGHT,
        ),
      );
      this.active =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? this.choices.length - 1
            : Math.max(
                0,
                Math.min(
                  this.choices.length - 1,
                  this.active +
                    (event.key === "PageDown"
                      ? page
                      : event.key === "PageUp"
                        ? -page
                        : event.key === "ArrowDown"
                          ? 1
                          : -1),
                ),
              );
      this.typed = false;
      this.chosen = true;
      this.draft?.setCustomValidity("");
      if (this.draft) this.draft.value = this.choices[this.active].label;
      this.highlight(true);
      return;
    }
  }

  /**
   * Update only the editable font-name draft after actual text input.
   *
   * Composition updates remain local until the browser emits a committed input.
   * @param {Event} event - Input event from the transient font draft.
   * @returns {void} Updates prefix matching without changing document marks.
   * @example
   * // Typing Arial highlights its row; Enter performs the actual selection.
   */
  private handleInput(event: Event): void {
    if (
      event.target !== this.draft ||
      (event instanceof InputEvent && event.isComposing)
    )
      return;
    this.typed = true;
    this.updateQuery();
  }

  /**
   * Match a completed IME font-name composition without applying it prematurely.
   *
   * Korean and Japanese input can finish after the last composing input event.
   * The committed draft still waits for an explicit row, Enter or valid blur.
   * @param {CompositionEvent} event - Completed composition in the font-name draft.
   * @returns {void} Updates only the local font completion state.
   * @example
   * // Completing 함초롬 updates the matching row without changing the document.
   */
  private handleCompositionEnd(event: CompositionEvent): void {
    if (event.target === this.draft) {
      this.typed = true;
      this.updateQuery();
    }
  }

  /**
   * Dismiss an open font popup when its source geometry changes.
   *
   * Resizing the application cannot leave the editable overlay at stale coordinates.
   * @returns {void} Cancels transient font UI without editing the document.
   * @example
   * // A resized window dismisses the popup before the next font control opens.
   */
  private handleLayout(): void {
    if (this.popup) this.close(false);
  }

  /**
   * Keep internal font-list scrolling while dismissing external layout scrolls.
   *
   * Font navigation scrolls only its own list, not the underlying editor selection.
   * @param {Event} event - Captured scrolling element.
   * @returns {void} Leaves internal list scrolling alone or closes the popup.
   * @example
   * // Mouse-wheel scrolling the font list never closes its menu.
   */
  private handleScroll(event: Event): void {
    if (
      this.popup &&
      event.target instanceof Node &&
      !this.popup.contains(event.target)
    )
      this.close(false);
  }

  /**
   * Remove font UI whose original source control has been destroyed.
   *
   * Late catalog results cannot revive a popup after dialog cancellation or ribbon replacement.
   * @returns {void} Cancels only an orphaned font picker.
   * @example
   * // Closing 글자 모양 removes its local font-name draft as well.
   */
  private handleMutation(): void {
    if (this.popup && !this.field?.isConnected) this.close(false);
  }
}
