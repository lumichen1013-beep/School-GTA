// 大型 UI 容器的隱藏 / 顯示：以 opacity + 不可點擊取代 visibility / display 切換。
// 這些容器常駐 will-change: opacity (style.css)，切換時只改合成層透明度，不會在 GPU 執行緒重新配置圖層貼圖
// (visibility / display 切換在 Mali 平板上造成 30~60ms 的 SharedImage 配置卡頓)。
// 隱藏時：.ui-concealed 讓自身與所有子孫 pointer-events:none (子元素自設 pointer-events:auto 也無效)，
// inert 阻擋鍵盤焦點與輔助技術，aria-hidden 讓螢幕閱讀器略過。
// (#hud-overlay / #mobile-controls-container 隱藏時保留不可見的極小 opacity，讓子圖層貼圖常駐，見 style.css)
export const CONCEALED_CLASS = 'ui-concealed';

export interface ConcealTarget {
  classList: { toggle(token: string, force?: boolean): boolean };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  inert?: boolean;
}

export function setConcealed(el: ConcealTarget | null | undefined, concealed: boolean): void {
  if (!el) return;
  el.classList.toggle(CONCEALED_CLASS, concealed);
  el.inert = concealed;
  if (concealed) el.setAttribute('aria-hidden', 'true');
  else el.removeAttribute('aria-hidden');
}

export function setConcealedById(id: string, concealed: boolean): void {
  if (typeof document === 'undefined') return;
  setConcealed(document.getElementById(id), concealed);
}

// 劇情字幕遮罩 (#cutscene-overlay，花劍客過場與少年院開場共用)：同樣以 opacity 切換，常駐 display:flex
export function showCutsceneOverlay(on: boolean): void {
  setConcealedById('cutscene-overlay', !on);
}
