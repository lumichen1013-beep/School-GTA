import type { Text } from '../text/text';

/** 操作說明的一列：按鍵標籤 (每個一個 <kbd>) + 說明文字 key */
export interface HelpRow { keys: readonly string[]; labelKey: string }

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
  status.append(el('span', 'pz-mode', text('term.mode3d')), el('span', 'pz-inv', text('ui.inv.none')));
  const helpEl = el('div', 'pz-help');
  fillHelp(helpEl, text, help);
  hud.append(status, helpEl, el('div', 'pz-prompt'), el('div', 'pz-toast'));
  const clear = el('div', 'pz-clear');
  const replay = el('button', 'pz-replay', text('ui.clear.replay')) as HTMLButtonElement;
  replay.type = 'button';
  clear.append(el('h1', 'pz-clear-title'), el('p', 'pz-next'), replay);
  root.append(el('div', 'pz-canvas'), el('div', 'pz-fade'), hud, el('div', 'pz-narration'), clear);
}

/** 依說明列重建操作說明 (日後重綁按鍵後重新呼叫即可一致) */
export function fillHelp(helpEl: HTMLElement, text: Text, help: readonly HelpRow[]): void {
  helpEl.replaceChildren(el('b', undefined, text('ui.help.title')));
  for (const row of help) {
    const d = el('div');
    for (const k of row.keys) d.append(el('kbd', undefined, k));
    d.append(text(row.labelKey));
    helpEl.append(d);
  }
}
