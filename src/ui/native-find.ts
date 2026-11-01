import { nativeIcon } from "./native-icons.ts";

/**
 * Builds the native document search dock.
 *
 * The persistent controls retain the editor's search and replacement IDs while
 * the result list remains available for the controller to populate safely.
 *
 * @returns {string} Accessible markup for the initially hidden right search pane.
 * @example
 * document.body.insertAdjacentHTML("beforeend", renderNativeFindPane());
 */
export function renderNativeFindPane(): string {
  return `<aside id="find-panel" class="find-panel native-find-pane" aria-label="탐색" hidden>
    <div class="native-find-topbar"><button class="native-find-collapse" data-native-action="collapse-find" title="작업 창 접기" aria-label="작업 창 접기">»</button><button class="native-find-options-toggle" title="작업 창 메뉴" aria-label="탐색 메뉴" aria-expanded="false" aria-controls="native-find-options">☰</button><button id="find-close" title="탐색 닫기" aria-label="찾기 닫기">${nativeIcon("close", 14)}</button></div>
    <div class="native-find-main"><h2>탐색</h2><div class="native-find-query"><input id="find-text" type="text" aria-label="찾을 내용" autocomplete="off" spellcheck="false"><span class="native-find-history-arrow" aria-hidden="true">⌄</span><button id="find-next" title="다음 결과" aria-label="다음 결과">${nativeIcon("find", 20)}<span aria-hidden="true">⌄</span></button><button id="find-prev" class="native-find-previous" title="이전 결과" aria-label="이전 결과">${nativeIcon("up", 14)}</button></div>
    <div class="native-replace-controls"><input id="replace-text" type="text" aria-label="바꿀 내용" placeholder="바꿀 내용" autocomplete="off"><div><button id="replace-one">바꾸기</button><button id="replace-all">모두 바꾸기</button></div></div>
    <div class="native-find-results-heading"><h3>결과</h3><span id="find-count" role="status" hidden></span></div><div id="native-find-results" role="list" aria-label="찾기 결과"></div></div>
    <div class="native-find-rail"><button class="native-find-rail-search" data-native-action="find" title="탐색" aria-label="탐색">${nativeIcon("find", 20)}</button><button class="native-find-rail-add" data-native-action="find-pane-add" title="작업 창 추가" aria-label="작업 창 추가">+</button></div>
    <div id="native-find-options" class="native-find-options" role="menu" hidden><button role="menuitem" data-native-action="find">찾기</button><button role="menuitem" data-native-action="replace">찾아 바꾸기</button></div>
  </aside>`;
}
