# Native compatibility corpus

These seven documents and the 32-by-16 PNG were independently authored for
Forhan's required compatibility tests. `source.json` contains their complete
semantic inputs. The PNG contains generated pixels; no application resource,
font file, private document, or third-party image is included.

The original installed Hancom 2024 application, version 13.0.0.4049, opened each
authored input and saved both HWP and HWPX. Its executable SHA-256 was
`0d72eb8aba393d2eded01c3f16a2015e5a7125cd229adc373a0e7d1210d6c5d5`.
These operations used bounded COM automation and owned-window path approvals;
they are ordinary native observations, not REA runtime evidence.

Optional summary metadata, previews, scripts, and document options were removed
from HWP containers. Their FileHeader, DocInfo, BodyText, and included BinData
stream payloads remain byte-identical to the original native saves. HWPX profile
metadata and optional previews were removed; native header, section, and image
payloads remain byte-identical. Archive timestamps are fixed. The manifest
records retained stream hashes, complete file hashes, and removed entries.

The original application separately reopened each raw and sanitized document.
All fourteen pairs had identical complete native HWPML BODY data, identical
native page margins, and unchanged input file hashes after the application
closed. The image pair was regenerated with both surrounding paragraphs and
rechecked separately. `manifest.json` contains the final accepted identities.

The tests load these files using module-relative URLs. They require neither an
installed Hancom application nor an ignored `research` directory. Missing files
fail the tests instead of silently skipping compatibility checks. Edited
round-trip outputs stay in memory.
