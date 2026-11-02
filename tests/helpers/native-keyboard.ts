/** Native caret movement to document start; macOS Home scrolls without moving the insertion point. */
export const DOCUMENT_START_KEY = process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home';

/** Native caret movement to document end uses the operating system's editing shortcut. */
export const DOCUMENT_END_KEY = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End';

/** Native caret movement to line end remains distinct from macOS End document scrolling. */
export const LINE_END_KEY = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End';
