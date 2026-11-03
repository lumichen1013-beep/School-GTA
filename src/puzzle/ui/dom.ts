import type { Text } from '../text/text';

/** 操作說明的一列：按鍵標籤 (每個一個 <kbd>) + 說明文字 key */
export interface HelpRow { keys: readonly string[]; labelKey: string; noteKey?: string }

const el = (tag: string, id?: string, text?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 建立《圖紙之間》的 DOM 骨架 (puzzle.html 只留 #pz-root)；結構與 id 沿用舊 HTML，CSS 不變 */
export function buildPuzzleDom(root: HTMLElement, text: Text, help: readonly HelpRow[]): void {
  root.replaceChildren();
  const hud = el('div', 'pz-hud');
  const status = el('div', 'pz-status');
  status.append(el('span', 'pz-mode', text('term.mode3d')), el('span', 'pz-ink'), el('span', 'pz-inv', text('ui.inv.none')));
  const helpEl = el('div', 'pz-help');
  fillHelp(helpEl, text, help);
  // 操作說明預設收合成右上角的小鈕 (H / 點一下展開)；一次性操作小提示在畫面上方，數秒後自動消失 (app/helpModel)
  const helpBtn = el('button', 'pz-help-btn') as HTMLButtonElement;
  helpBtn.type = 'button';
  helpBtn.tabIndex = -1;
  helpBtn.append(el('i', undefined, '?'), el('span'));
  hud.append(status, helpBtn, helpEl, el('div', 'pz-tip'), el('div', 'pz-prompt'), el('div', 'pz-toast'));
  const clear = el('div', 'pz-clear');
  const replay = el('button', 'pz-replay', text('ui.clear.replay')) as HTMLButtonElement;
  replay.type = 'button';
  const toMenu = el('button', 'pz-tomenu', text('ui.clear.menu')) as HTMLButtonElement;
  toMenu.type = 'button';
  // 繼續 (章門打開 → 下一章；章內的房間通關 → 回到本章)；沒有下一步時隱藏
  const cont = el('button', 'pz-continue') as HTMLButtonElement;
  cont.type = 'button';
  clear.append(el('h1', 'pz-clear-title'), el('p', 'pz-next'), cont, replay, toMenu);
  root.append(el('div', 'pz-canvas'), el('div', 'pz-fade'), el('div', 'pz-veil'), hud, el('div', 'pz-narration'), clear);
}

/** 依說明列重建操作說明 (日後重綁按鍵後重新呼叫即可一致) */
export function fillHelp(helpEl: HTMLElement, text: Text, help: readonly HelpRow[]): void {
  helpEl.replaceChildren(el('b', undefined, text('ui.help.title')));
  for (const row of help) {
    const d = el('div');
    for (const k of row.keys) d.append(el('kbd', undefined, k));
    d.append(text(row.labelKey));
    if (row.noteKey) d.append(el('small', undefined, text(row.noteKey)));
    helpEl.append(d);
  }
}
