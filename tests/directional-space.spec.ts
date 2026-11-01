import { test } from "@playwright/test";
import {
  verifyDirectionalSpaces,
  verifyNativeGlyphOrigins,
  verifyNativeTerminalComposition,
} from "./helpers/directional-layout";
test(
  "native directional spaces retain actual Arabic and Indic tracking boundaries",
  verifyDirectionalSpaces,
);
test(
  "native directional glyph origins retain actual Hebrew PDF placement and following Latin alignment",
  verifyNativeGlyphOrigins,
);
test(
  "native terminal composition preserves original Unicode and right-aligned accented glyph placement",
  verifyNativeTerminalComposition,
);
