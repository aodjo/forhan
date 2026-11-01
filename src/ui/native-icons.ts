/**
 * Independently drawn classic desktop glyphs in a shared 24-unit coordinate
 * system. Thin square-ended grey strokes, restrained fills and small coloured
 * accents follow the installed editor's visual language without copying assets.
 */
const DRAWINGS = {
  "document-color":
    '<path fill="#fff" d="M4 2h16v20H4z"/><path stroke="#f28d64" d="M7 6h10"/><path stroke="#6e9bd1" d="M7 10h10"/><path stroke="#82b588" d="M7 14h10"/><path d="M7 18h7"/>',
  "paragraph-mark": '<path d="M16 22V2h-5a5 5 0 0 0 0 10h2M13 2v20M16 2h5"/>',
  grid: '<path d="M2 2h20v20H2zM2 7h20M2 12h20M2 17h20M7 2v20M12 2v20M17 2v20"/>',
  guides:
    '<path stroke="#78a1d8" stroke-dasharray="2 2" d="M6 1v22M18 1v22M1 6h22M1 18h22"/><path d="M9 9h6v6H9z"/>',
  phonetic:
    '<text x="1" y="9" stroke="none" fill="#e95454" font-size="14">*</text><text x="7" y="22" stroke="none" fill="#777" font-size="18">가</text>',
  "task-pane":
    '<path fill="#fff" d="M2 3h20v18H2z"/><path fill="#dce9ff" d="M15 3h7v18h-7z"/><path d="M2 7h20M15 7v14M17 10h3M17 13h3M17 16h3"/>',
  "split-view":
    '<path d="M2 3h20v18H2zM2 11h20"/><path stroke="#6792c9" d="M5 6h13M5 15h13M5 18h10"/>',
  "arrange-windows":
    '<path fill="#fff" d="M1 2h15v14H1z"/><path fill="#fff" d="M8 9h15v14H8z"/><path d="M1 6h15M8 13h15"/>',
  "switch-window":
    '<path d="M1 2h15v14H1zM8 10h15v13H8z"/><path stroke="#568cf3" d="m12 17 4-4 4 4M16 13v8"/>',
  zoom100:
    '<text x="0" y="17" font-family="Arial" font-size="12" fill="#777" stroke="none">100%</text>',
  textbox:
    '<path stroke-dasharray="2 1" d="M1 3h22v18H1z"/><text x="5" y="18" stroke="none" fill="#777" font-size="16">가</text>',
  rectangle: '<path d="M2 4h20v16H2z"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="10" ry="8"/>',
  line: '<path d="M2 22 22 2"/>',
  arc: '<path d="M2 20C2 2 22 2 22 20"/>',
  polygon: '<path d="m3 7 8-5 10 8-4 11H6z"/>',
  curve: '<path d="M2 21C4-4 10 29 14 7S23 4 22 20"/>',
  freehand: '<path d="m2 17 5-4 1 6 5-15 2 12 7-8"/>',
  arrow: '<path d="M2 20 21 3M12 3h9v9"/>',
  "double-arrow": '<path d="M2 20 21 3M12 3h9v9M2 11v9h9"/>',
  elbow: '<path d="M3 3v17h18M16 15l5 5-5 3"/>',
  "chevron-up": '<path d="m7 15 5-5 5 5"/>',
  "word-art":
    '<text x="2" y="21" fill="#eaf0ff" stroke="#5781cc" font-size="23" font-weight="bold">가</text>',
  equation:
    '<path d="m1 12 4 8L10 2h13"/><text x="12" y="18" stroke="none" fill="#777" font-family="serif" font-size="17">x</text>',
  ole: '<path stroke="#cb6c63" d="M2 4h20v17H2z"/><text x="3" y="15" stroke="none" fill="#c56d63" font-size="10">OLE</text>',
  "form-field":
    '<path d="M2 5h20v14H2zM6 9v6M10 9h8M10 13h8"/><path stroke="#5594e1" d="m15 16 2 2 4-5"/>',
  field:
    '<text x="0" y="18" fill="#777" stroke="none" font-size="17">{가}</text>',
  footnote:
    '<path d="M3 2h18v20H3zM6 6h12M6 9h12M6 16h9M6 18h6"/><text x="13" y="15" fill="#6095df" stroke="none" font-size="9">1)</text>',
  endnote:
    '<path d="M3 2h18v20H3zM6 6h12M6 9h12M6 13h12"/><text x="8" y="20" fill="#6095df" stroke="none" font-size="9">1)</text>',
  comment:
    '<path fill="#fff7ba" stroke="#cabb77" d="M2 3h20v14H9l-5 5v-5H2z"/><path d="M5 7h14M5 10h14M5 13h9"/>',
  proofing:
    '<path d="M4 4h17M4 9h17M4 14h17M4 19h11"/><path stroke="#e77979" d="m1 7 2 2 4-5m-6 12 2 2 4-5"/>',
  bookmark: '<path fill="#ffe1bc" stroke="#c79468" d="M6 2h12v21l-6-5-6 5z"/>',
  reference:
    '<path d="M3 3h13v16H3zM8 7h13v16H8z"/><path stroke="#5688ce" d="M12 13h6m-3-3 3 3-3 3"/>',
  hyperlink:
    '<circle cx="9" cy="9" r="7" stroke="#6c9eae"/><path stroke="#6c9eae" d="M2 9h14M9 2c-4 5-4 9 0 14M9 2c4 5 4 9 0 14"/><path stroke="#4e78bd" d="m13 15 4-4a3 3 0 0 1 4 4l-4 4m-3-4-4 4a3 3 0 0 0 4 4l4-4"/>',
  "special-character":
    '<text x="2" y="21" fill="#777" stroke="none" font-family="serif" font-size="25">Ω</text>',
  superscript:
    '<text x="2" y="21" fill="#777" stroke="none" font-size="19">가</text><text x="17" y="9" fill="#777" stroke="none" font-size="10">2</text>',
  subscript:
    '<text x="2" y="17" fill="#777" stroke="none" font-size="19">가</text><text x="17" y="23" fill="#777" stroke="none" font-size="10">2</text>',
  "text-border":
    '<path stroke-dasharray="2 1" d="M2 2h20v20H2z"/><text x="5" y="19" fill="#777" stroke="none" font-size="17">가</text>',
  highlight:
    '<path fill="#fff476" stroke="none" d="M2 15h20v7H2z"/><text x="4" y="19" fill="#777" stroke="none" font-size="20">가</text>',
  "spacing-narrow":
    '<text x="3" y="17" fill="#777" stroke="none" font-size="15">가</text><path stroke="#6798db" d="M1 22h8m-3-3 3 3-3 2M23 22h-8m3-3-3 3 3 2"/>',
  "spacing-wide":
    '<text x="3" y="17" fill="#777" stroke="none" font-size="15">가</text><path stroke="#6798db" d="M9 22H1m3-3-3 3 3 2M15 22h8m-3-3 3 3-3 2"/>',
  "indent-less":
    '<path d="M2 3h20M9 8h13M9 13h13M2 19h20"/><path stroke="#668fc4" d="m6 7-4 4 4 4"/>',
  "indent-more":
    '<path d="M2 3h20M9 8h13M9 13h13M2 19h20"/><path stroke="#668fc4" d="m2 7 4 4-4 4"/>',
  "drop-cap":
    '<text x="0" y="20" fill="#777" stroke="none" font-size="21">가</text><path d="M17 5h6M17 9h6M17 13h6M1 23h22"/>',
  numbering:
    '<text x="0" y="7" fill="#777" stroke="none" font-size="8">1</text><text x="0" y="15" fill="#777" stroke="none" font-size="8">2</text><text x="0" y="23" fill="#777" stroke="none" font-size="8">3</text><path d="M8 4h15M8 12h15M8 20h15"/>',
  bullets:
    '<circle cx="3" cy="4" r="1" fill="#777"/><circle cx="3" cy="12" r="1" fill="#777"/><circle cx="3" cy="20" r="1" fill="#777"/><path d="M8 4h15M8 12h15M8 20h15"/>',
  "level-up":
    '<path d="M2 4h20M7 10h15M7 16h15M7 22h15"/><path stroke="#6695d7" d="M3 17V8m-3 3 3-3 3 3"/>',
  "level-down":
    '<path d="M2 4h20M7 10h15M7 16h15M7 22h15"/><path stroke="#6695d7" d="M3 8v9m-3-3 3 3 3-3"/>',
  "text-direction":
    '<text x="1" y="14" fill="#777" stroke="none" font-size="14">가</text><path stroke="#6695d7" d="M17 2v19m-3-3 3 3 3-3"/>',
  header:
    '<path d="M4 2h16v20H4z"/><path fill="#d9e6fb" d="M6 4h12v5H6z"/><path d="M7 12h10M7 15h10M7 18h7"/>',
  footer:
    '<path d="M4 2h16v20H4z"/><path fill="#d9e6fb" d="M6 16h12v4H6z"/><path d="M7 5h10M7 8h10M7 11h7"/>',
  "page-border":
    '<path d="M3 1h18v22H3zM6 4h12v16H6z"/><path d="M8 8h8M8 11h8M8 14h8M8 17h6"/>',
  "page-number":
    '<path d="M4 2h16v20H4zM7 6h10M7 9h10M7 12h8"/><text x="10" y="20" fill="#6796da" stroke="none" font-size="8">1</text>',
  "restart-number":
    '<text x="8" y="17" fill="#777" stroke="none" font-size="18">1</text><path stroke="#6796da" d="M21 12A9 9 0 1 0 5 20M21 4v8h-7"/>',
  "hide-page":
    '<path d="M4 2h16v20H4zM7 6h10M7 9h10"/><path stroke="#d18585" d="m2 21 20-18"/>',
  "line-number":
    '<path d="M8 4h14M8 10h14M8 16h14M8 22h14"/><text x="0" y="7" stroke="none" fill="#6796da" font-size="8">1</text><text x="0" y="13" stroke="none" fill="#6796da" font-size="8">2</text><text x="0" y="19" stroke="none" fill="#6796da" font-size="8">3</text>',
  "page-break":
    '<path d="M4 2h16v7H4zM4 15h16v7H4z"/><path stroke="#6796da" stroke-dasharray="2 1" d="M1 12h22"/>',
  "column-break":
    '<path d="M3 2h7v20H3zM14 2h7v20h-7z"/><path stroke="#6796da" d="M8 12h8m-3-3 3 3-3 3"/>',
  "delete-page":
    '<path d="M4 2h16v20H4z"/><path stroke="#c77575" d="m8 8 8 8m0-8-8 8"/>',
  "section-break":
    '<path d="M3 2h18v7H3zM3 15h18v7H3z"/><path stroke="#6796da" d="M1 11h22M1 13h22"/>',
  labels:
    '<path d="M2 2h20v20H2zM2 8h20M2 15h20M12 2v20"/><path stroke="#6796da" d="M4 5h5M15 5h5M4 11h5M15 11h5M4 18h5M15 18h5"/>',
  manuscript:
    '<path stroke="#b89185" d="M2 2h20v20H2zM2 7h20M2 12h20M2 17h20M7 2v20M12 2v20M17 2v20"/>',
  password:
    '<path stroke="#cc6c67" d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="4" y="11" width="16" height="12" fill="#eaa29b" stroke="#c36f68"/><path d="M12 15v4"/>',
  history:
    '<circle cx="12" cy="12" r="9"/><path stroke="#6893d2" d="M12 5v8h6M2 2v7h6"/>',
  compare:
    '<path d="M1 2h9v20H1zM14 2h9v20h-9zM3 6h5M3 10h5M16 6h5M16 10h5"/><path stroke="#6893d2" d="M8 16h8m-3-3 3 3-3 3"/>',
  "track-changes":
    '<path d="M3 2h17v20H3zM6 6h11M6 10h11"/><path stroke="#d87676" d="M6 14h11M6 17h8"/><path stroke="#6196d8" d="m12 22 8-8 3 3-8 7"/>',
  "accept-change":
    '<path d="M3 2h17v20H3zM6 6h11M6 10h11"/><path stroke="#5c9d69" stroke-width="2" d="m8 17 4 4 10-12"/>',
  "reject-change":
    '<path d="M3 2h17v20H3zM6 6h11M6 10h11"/><path stroke="#c87575" stroke-width="2" d="m10 14 10 9m0-9-10 9"/>',
  index:
    '<path d="M3 2h18v20H3zM7 6h11M7 10h11M7 14h11M7 18h11"/><text x="0" y="10" fill="#6796da" stroke="none" font-size="9">A</text>',
  toc: '<path d="M2 2h20v20H2zM5 6h8M8 10h5M8 14h5M5 18h8"/><path stroke-dasharray="1 1" d="M14 6h5M14 10h5M14 14h5M14 18h5"/>',
  citation:
    '<text x="1" y="22" fill="#6796da" stroke="none" font-family="serif" font-size="30">“”</text>',
  macro:
    '<path d="M3 2h18v20H3zM6 6h12M6 10h9"/><path fill="#e5a5a5" stroke="#bf7777" d="m10 13 9 4-9 5z"/>',
  spelling:
    '<text x="0" y="12" fill="#777" stroke="none" font-size="10">가나다</text><path stroke="#ce7777" d="m4 17 5 5L21 9"/>',
  presentation:
    '<path d="M2 3h20v15H2zM12 18v5M7 23h10"/><path stroke="#6796da" d="m6 14 4-5 4 3 5-7"/>',
  keyboard:
    '<path d="M1 6h22v14H1zM4 10h2M9 10h2M14 10h2M19 10h2M4 13h2M9 13h2M14 13h2M19 13h2M6 17h12"/>',
  cut: '<g stroke="#a4a4a4"><circle cx="6" cy="18" r="3"/><circle cx="17" cy="18" r="3"/><path d="M7.5 15.5 18 2M15.5 15.5 6 2"/><path d="m10.5 10.5 2 3"/></g>',
  copy: '<path fill="#fafafa" stroke="#b0b0b0" d="M4.5 3.5h13v16h-13z"/><path fill="#fff" d="M7.5 1.5h13v16h-13z"/><path stroke="#b3b3b3" d="M10 5h8M10 8h8M10 11h8M10 14h6"/>',
  paste:
    '<path fill="#ffd11b" stroke="#dfaa00" d="M3.5 2.5h14v17h-14z"/><path fill="#fff" d="M8.5 5.5h12v17h-12z"/><path fill="#f8e29b" stroke="#cbb974" d="M8 1h6v3H8z"/><path d="M11 9h7M11 12h7M11 15h7M11 18h6"/>',
  "format-painter":
    '<path fill="#fff" d="M2.5 1.5h14v17h-14z"/><path stroke="#a4a4a4" d="M5 5h9M5 8h9M5 11h7M5 14h5"/><path fill="#5b79f2" stroke="#5066bb" d="m10 20 7-7 3 3-7 7H9z"/><path fill="#fff" d="m17 13 3-3 3 3-3 3z"/>',
  "clear-format":
    '<text x="2" y="10" fill="#666" stroke="none" font-family="Consolas,monospace" font-size="10">[##]</text><path stroke="#f13d27" stroke-width="1.4" d="m12 15 7 7M19 15l-7 7"/>',
  "char-format":
    '<text x="1" y="11" fill="#8b8b8b" stroke="none" font-size="11">가</text><text x="9" y="23" fill="#4675f1" stroke="none" font-size="16">가</text>',
  "paragraph-format":
    '<path d="M2 3.5h20M2 7.5h15M2 11.5h20M2 15.5h12"/><path stroke="#4678f3" stroke-width="1.25" d="m13 19 4 4 6-8"/>',
  style:
    '<text x="1" y="12" fill="#777" stroke="none" font-size="14" font-family="Arial,sans-serif">A</text><path d="M12 3.5h11M12 7.5h11M12 11.5h11M1 15.5h15M1 19.5h12"/><text x="14" y="23" fill="#4678f3" stroke="none" font-family="Arial,sans-serif" font-size="14">A</text>',
  portrait:
    '<path fill="#dedede" d="M5.5 1.5h13v21h-13z"/><path d="M8 5.5h8M8 8.5h8M8 11.5h8M8 14.5h8M8 17.5h8"/>',
  landscape:
    '<path fill="#fff" d="M1.5 5.5h21v14h-21z"/><path d="M4 9h16M4 12h16M4 15h16"/>',
  margins:
    '<path fill="#fff" d="M4.5 1.5h15v21h-15z"/><path stroke="#ee5a48" d="M7.5 2v20M16.5 2v20M5 5.5h14M5 18.5h14"/><path stroke="#c2c2c2" d="M10 8h4M10 11h4M10 14h4"/>',
  "master-page":
    '<path fill="#fff" d="M1.5 1.5h8v10h-8zM1.5 14.5h8v8h-8z"/><path fill="#fff" stroke="#ed5948" d="M13.5 1.5h8v10h-8zM13.5 14.5h8v8h-8z"/><path stroke="#b5b5b5" d="M4 4h3M4 7h3M4 17h3M4 20h3"/>',
  columns:
    '<path d="M1 3.5h9M1 6.5h9M1 9.5h9M1 12.5h9M1 15.5h9M1 18.5h9M14 3.5h9M14 6.5h9M14 9.5h9M14 12.5h9M14 15.5h9M14 18.5h9"/>',
  shape:
    '<circle cx="14" cy="8" r="6.5" fill="#fff"/><path fill="#7685f5" stroke="#6270d4" d="m3 18 5-10 5 10z"/><path fill="#e8d9f5" stroke="#c1a1d8" d="M12.5 14.5h10v8h-10z"/>',
  picture:
    '<path fill="#53b4e8" stroke="#6191b4" d="M1.5 3.5h21v17h-21z"/><circle fill="#ffe35c" stroke="none" cx="16.5" cy="9" r="3.5"/><path fill="#3b9c42" stroke="#368d3b" d="m2 19 6-8 6 7 3-4 5 6H2z"/>',
  table:
    '<path fill="#fff" stroke="#5971bc" d="M1.5 3.5h21v18h-21z"/><path fill="#dce5fb" stroke="#7f8fd0" d="M2 4h20v5H2z"/><path stroke="#818ac6" d="M2 9.5h20M2 15.5h20M8.5 4v17M15.5 4v17"/>',
  chart:
    '<path stroke="#a1a1a1" d="M1.5 1v21h22"/><path fill="#78c33e" stroke="#5a9b2c" d="M4.5 12.5h4v9h-4z"/><path fill="#49a9f8" stroke="#3a88d2" d="M11.5 3.5h4v18h-4z"/><path fill="#b36fe6" stroke="#9751c8" d="M18.5 8.5h4v13h-4z"/>',
  "select-object":
    '<path stroke="#6988fc" stroke-dasharray="2 2" d="M2.5 2.5h17v17h-17z"/><g fill="#6682f0" stroke="none"><rect x="1" y="1" width="3" height="3"/><rect x="18" y="1" width="3" height="3"/><rect x="1" y="18" width="3" height="3"/></g><path fill="#737373" stroke="#fff" stroke-width=".7" d="m14 11 1 12 3-4 5 1z"/>',
  "lock-object":
    '<path fill="#fff" d="M1.5 1.5h14v17h-14z"/><path fill="#fff" d="M8.5 11.5h14v11h-14z"/><path d="M12 11V9a4 4 0 0 1 8 0v2"/><path fill="#777" stroke="none" d="M15 15h2v4h-2z"/>',
  find: '<path fill="#b5b5b5" d="M3.5 7.5h6v13h-8l1-9zM14.5 7.5h6l2 13h-8z"/><path fill="#eaeaea" d="M5.5 2.5h3v6h-3zM15.5 2.5h3v6h-3z"/><path d="M9.5 10.5h5v6h-5z"/><circle fill="#eee" cx="5.5" cy="18" r="3.5"/><circle fill="#eee" cx="18.5" cy="18" r="3.5"/>',
  replace:
    '<text x="1" y="12" fill="#717171" stroke="none" font-size="11">수</text><text x="12" y="22" fill="#717171" stroke="none" font-size="11">가</text><path stroke="#4b7bff" d="M13 3h9l-3-3M22 3l-3 3M11 20H2l3-3M2 20l3 3"/>',
  sort: '<text x="1" y="9" fill="#787878" stroke="none" font-size="10">가</text><text x="1" y="22" fill="#787878" stroke="none" font-size="10">하</text><path stroke="#90b4ed" d="M19 1v19m-4-4 4 4 4-4"/><path stroke="#ee8a8a" d="M13 6h3M13 10h3"/>',
  new: '<path fill="#fff" d="M5.5 1.5h9l4 4v17h-13z"/><path d="M14.5 1.5v4h4"/>',
  open: '<path fill="#fff" d="M1.5 6.5h8l2-3h8v16h-18z"/><path fill="#ffda68" stroke="#b79845" d="M2.5 9.5h21l-4 11h-18z"/>',
  save: '<path fill="#eee" d="M3.5 2.5h15l2 2v18h-17z"/><path fill="#fff" d="M6.5 2.5h10v7h-10zM6.5 14.5h11v8h-11z"/><path fill="#aaa" stroke="none" d="M13 3h2v5h-2z"/>',
  print:
    '<path fill="#fff" d="M6.5 1.5h11v9h-11z"/><path fill="#e1e1e1" d="M2.5 8.5h19v10h-19z"/><path fill="#fff" d="M6.5 14.5h11v8h-11z"/><path d="M9 17.5h6M9 20.5h6"/><path stroke="#999" d="M17 11.5h2"/>',
  preview:
    '<path fill="#fff" d="M3.5 1.5h13v18h-13z"/><path stroke="#a3a3a3" d="M6 5h8M6 8h8M6 11h5"/><circle fill="#fff" cx="16" cy="15" r="4.5"/><path d="m19 18 4 5"/>',
  undo: '<path d="M8.5 5.5 3 10l5.5 4.5M3.5 10H14c6 0 7 8 1 10"/>',
  redo: '<path d="m15.5 5.5 5.5 4.5-5.5 4.5M20.5 10H10c-6 0-7 8-1 10"/>',
  bold: '<text x="3" y="19" stroke="none" fill="#666" font-size="17" font-weight="700">가</text>',
  italic:
    '<text x="4" y="19" stroke="none" fill="#747474" font-size="17" font-style="italic">가</text>',
  underline:
    '<text x="3" y="17" stroke="none" fill="#747474" font-size="16">가</text><path d="M3 21.5h17"/>',
  strike:
    '<text x="3" y="19" stroke="none" fill="#747474" font-size="17">가</text><path d="M2 12.5h20"/>',
  color:
    '<text x="3" y="17" stroke="none" fill="#777" font-size="16">가</text><path stroke="#ff493a" stroke-width="3" d="M3 22h18"/>',
  "align-justify":
    '<path d="M2 3.5h20M2 6.5h20M2 9.5h20M2 12.5h20M2 15.5h20M2 18.5h20M2 21.5h20"/>',
  "align-left":
    '<path d="M2 3.5h20M2 6.5h14M2 9.5h20M2 12.5h12M2 15.5h20M2 18.5h15M2 21.5h18"/>',
  "align-center":
    '<path d="M2 3.5h20M6 6.5h12M2 9.5h20M7 12.5h10M2 15.5h20M5 18.5h14M3 21.5h18"/>',
  "align-right":
    '<path d="M2 3.5h20M8 6.5h14M2 9.5h20M10 12.5h12M2 15.5h20M7 18.5h15M4 21.5h18"/>',
  "align-distribute":
    '<path d="M2 3.5h20M2 6.5h20M2 9.5h20M2 12.5h20M2 15.5h20"/><path stroke-dasharray="1 2" d="M2 18.5h20M2 21.5h20"/>',
  "align-split":
    '<path d="M2 3.5h20M2 6.5h20M2 9.5h20M2 12.5h20M2 15.5h20"/><path d="M2 18.5h7M15 18.5h7M2 21.5h4M10 21.5h4M18 21.5h4"/>',
  settings:
    '<path d="m9 2 1-1h4l1 1v3l2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1v3h-6v-3l-2-1-3 1-2-4 2-2v-2L2 9l2-4 3 1 2-1z"/><circle cx="12" cy="12" r="3.5"/>',
  help: '<text x="6" y="20" fill="#777" stroke="none" font-size="22" font-family="Arial,sans-serif">?</text>',
  minimize: '<path stroke="#444" d="M5 12.5h14"/>',
  maximize: '<path stroke="#444" d="M5.5 5.5h13v13h-13z"/>',
  close: '<path stroke="#444" d="m5.5 5.5 13 13m0-13-13 13"/>',
  menu: '<path d="M4 5.5h16M4 11.5h16M4 17.5h16"/>',
  "chevron-down": '<path stroke="#858585" d="m7 9 5 5 5-5"/>',
  "page-outline":
    '<path fill="#f4f4f4" d="M5.5 2.5h13v18h-13z"/><path stroke="#a5a5a5" d="M8.5 6h7M8.5 9h7M8.5 12h7M8.5 15h5"/>',
  "fit-width":
    '<path d="M3.5 3v18M20.5 3v18M5 12h14m-10-4-4 4 4 4m6-8 4 4-4 4"/>',
  "fit-page":
    '<path d="M6.5 1.5h11v21h-11zM12 5v14m-3-3 3 3 3-3M9 8l3-3 3 3"/>',
  "zoom-in":
    '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 7 7M6.5 10h7M10 6.5v7"/>',
  "zoom-out":
    '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 7 7M6.5 10h7"/>',
  eye: '<path d="M1 12s4-6 11-6 11 6 11 6-4 6-11 6S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  "tab-plus": '<path stroke="#777" d="M5 12.5h14M12 5.5v14"/>',
  document:
    '<path fill="#fff" d="M5.5 1.5h9l4 4v17h-13z"/><path d="M14.5 1.5v4h4M8 10h8M8 13.5h8M8 17h6"/>',
} as const;

/** Independently drawn small-toolbar geometry keeps one-pixel rules on the actual CSS pixel grid. */
const COMPACT_DRAWINGS = {
  "paragraph-style": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M0 1.5h12M2 3.5h10M4 5.5h8M2 7.5h10M0 9.5h12M0 11.5h9M0 13.5h12"/>',
  },
  "line-spacing": {
    size: 20,
    markup:
      '<path stroke="#666" stroke-linecap="butt" d="M8 3.5h8M8 7.5h8M8 11.5h8M8 15.5h8"/><path stroke="#2367ff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="m.5 6.5 3-3 3 3M3.5 3.5v12m-3-3 3 3 3-3"/>',
  },
  "align-justify": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M1 2.5h14M1 4.5h14M1 6.5h14M1 8.5h14M1 10.5h14M1 12.5h14M1 14.5h14"/>',
  },
  "align-left": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M1 2.5h14M1 4.5h11M1 6.5h9M1 8.5h7M1 10.5h9M1 12.5h11M1 14.5h14"/>',
  },
  "align-center": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M1 2.5h14M4 4.5h8M1 6.5h14M4 8.5h8M1 10.5h14M4 12.5h8M1 14.5h14"/>',
  },
  "align-right": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M1 2.5h14M4 4.5h11M6 6.5h9M8 8.5h7M6 10.5h9M4 12.5h11M1 14.5h14"/>',
  },
  "align-distribute": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M1 2.5h14M1 4.5h14M1 6.5h14M1 8.5h14M1 10.5h14M1 12.5h14M1 14.5h2M5 14.5h2M9 14.5h2M13 14.5h2"/>',
  },
  "align-split": {
    size: 16,
    markup:
      '<path stroke="currentColor" stroke-linecap="butt" d="M1 2.5h14M1 4.5h14M1 6.5h14M1 8.5h14M1 10.5h14M1 12.5h14M1 14.5h4M11 14.5h4"/>',
  },
} as const;

/** Names of independently drawn native-style toolbar and window glyphs. */
export type NativeIconName =
  keyof typeof DRAWINGS | keyof typeof COMPACT_DRAWINGS;

/**
 * Render a classic native-style desktop icon as inline SVG.
 *
 * Known names select hand-authored geometry with thin grey outlines and small
 * colour accents. Small toolbar rules use their own integer pixel geometry
 * instead of scaling 24-unit line patterns. Unknown names use the document glyph.
 * The renderer never inserts arbitrary names or input markup into its SVG output.
 *
 * @param {NativeIconName | string} name - Named ribbon, quick-toolbar or window glyph.
 * @param {number} [size=24] - Requested square size in CSS pixels.
 * @returns {string} Decorative inline SVG with geometry appropriate to its toolbar size.
 * @example
 * nativeIcon("picture", 24) // Coloured picture glyph for the ribbon.
 * nativeIcon("save", 16) // Thin grey floppy-disk glyph for the quick toolbar.
 */
export function nativeIcon(name: NativeIconName | string, size = 24): string {
  /** Known icon key or the neutral fallback used for an unrecognised name. */
  const key: NativeIconName =
    Object.hasOwn(DRAWINGS, name) || Object.hasOwn(COMPACT_DRAWINGS, name)
      ? (name as NativeIconName)
      : "document";
  /** Finite, bounded SVG size that prevents malformed dimensions in toolbar markup. */
  const pixels = Number.isFinite(size) ? Math.max(8, Math.min(96, size)) : 24;
  /** Existing large ribbon drawings remain separate from exact small-toolbar rules. */
  const compact =
    (pixels === 16 || !Object.hasOwn(DRAWINGS, key)) &&
    Object.hasOwn(COMPACT_DRAWINGS, key)
      ? COMPACT_DRAWINGS[key as keyof typeof COMPACT_DRAWINGS]
      : null;
  /** Compact-only glyphs retain their own view box when another output size is requested. */
  const coordinateSize = compact?.size ?? 24,
    markup = compact?.markup ?? DRAWINGS[key as keyof typeof DRAWINGS];
  return `<svg xmlns="http://www.w3.org/2000/svg" class="native-icon native-icon-${key}" width="${pixels}" height="${pixels}" viewBox="0 0 ${coordinateSize} ${coordinateSize}" color="#666" fill="none" stroke="#777" stroke-width="1" stroke-linecap="square" stroke-linejoin="miter" font-family="'Malgun Gothic','Apple SD Gothic Neo',sans-serif" aria-hidden="true" focusable="false">${markup}</svg>`;
}
