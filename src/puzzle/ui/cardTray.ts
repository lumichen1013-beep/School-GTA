// 字卡匣 (v0.3 N22 最小版；mobile-controls 2.5)：從畫面底部升起的紙卡；左邊是標籤 (墨框裡的字，貼了詞卡就是卡上的字)，
// 右邊是卡匣格 (每張 ≥ 56 CSS px，點一張 = 貼到這個標籤)、貼著的卡 (點「取下」)；v0.4 H1：卡匣上方的頁籤 (詞卡 / 部件卡 / 尺度卡)；寫錯 → 標籤字顫動、墨色變淡；
// 底部一直顯示操作說明 (鍵盤與滑鼠 / 觸控)，最近的訊息另起一行；按鈕按下不取焦點
// 只畫 app/cardTrayModel 推導好的資料；點選只回呼外殼 (外殼產生 WorldCommand)，不改世界
import type { Text } from '../text/text';

export interface CardTrayModel {
  /** v0.4 H1 分頁：此刻出現過的組 (詞卡 / 部件卡 / 尺度卡) 與開著的那一頁；只有一組時不畫頁籤 */
  tabs: ReadonlyArray<'word' | 'part' | 'scale'>;
  tab: 'word' | 'part' | 'scale';
  label: string;
  title: string;
  /** 標籤此刻的字、原字；covered = 原字被詞卡蓋住 */
  glyph: string; base: string; covered: boolean;
  /** 字旁有空的尺度卡槽 (只鋪陳) */
  scale: boolean;
  slots: ReadonlyArray<{ card: string | null; glyph: string; name: string; key: string }>;
  attached: ReadonlyArray<{ card: string; glyph: string; name: string }>;
  /** 最近一則標籤訊息 (寫上 / 取下 / 無效) */
  message: string;
  /** 無效字回饋的序號 (變了就播一次顫動) */
  feedbackSeq: number;
  /** howto = 操作說明 (貼上 / 取下 / 關閉；鍵盤與滑鼠 / 觸控並列，一直顯示) */
  text: { head: string; close: string; remove: string; howto: readonly string[]; scale: string; tabs: Readonly<Partial<Record<'word' | 'part' | 'scale', string>>> };
}

export interface CardTrayHandlers { slot(n: number): void; remove(): void; close(): void; tab(t: 'word' | 'part' | 'scale'): void }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class CardTray {
  private sheet = el('div', 'pz-tray');
  private last = '';
  private seq = 0;
  private shown = false;

  constructor(root: HTMLElement, _text: Text, private on: CardTrayHandlers) {
    this.sheet.setAttribute('role', 'dialog');
    root.append(this.sheet);
    // 點卡匣外的畫面 = 關閉 (mobile-controls 2.5)
    root.addEventListener('pointerdown', e => { if (this.shown && !this.sheet.contains(e.target as Node)) this.on.close(); });
  }

  get isShown(): boolean { return this.shown; }

  /** model = null 收起 */
  render(m: CardTrayModel | null): void {
    if (!m) {
      if (this.shown) { this.sheet.classList.remove('show'); this.shown = false; this.last = ''; }
      return;
    }
    if (!this.shown) { this.sheet.classList.add('show'); this.shown = true; }
    const key = JSON.stringify({ ...m, feedbackSeq: 0 });
    if (key !== this.last) { this.last = key; this.build(m); }
    if (m.feedbackSeq !== this.seq) {
      this.seq = m.feedbackSeq;
      const g = this.sheet.querySelector('.pz-tray-glyph');
      g?.classList.remove('bad');
      void (g as HTMLElement | null)?.offsetWidth;
      g?.classList.add('bad');
    }
  }

  private button(cls: string, label: string, fn: () => void): HTMLButtonElement {
    const b = el('button', cls);
    b.type = 'button';
    b.textContent = label;
    // 按下不取焦點 (之後 Space / Enter 不會被按鈕吃掉、鍵盤照常操作遊戲)；點擊照常觸發
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', e => { e.preventDefault(); fn(); b.blur(); });
    return b;
  }

  private build(m: CardTrayModel): void {
    const head = el('div', 'pz-tray-head', m.text.head);
    const tag = el('div', 'pz-tray-tag');
    const glyph = el('div', `pz-tray-glyph${m.covered ? ' covered' : ''}`, m.glyph);
    tag.append(glyph);
    if (m.scale) { const slot = el('div', 'pz-tray-scale'); slot.title = m.text.scale; tag.append(slot); }
    if (m.attached.length) tag.append(this.button('pz-tray-remove', m.text.remove, () => this.on.remove()));
    const cards = el('div', 'pz-tray-cards');
    let ready = m.attached.length === 0;
    m.slots.forEach((s, i) => {
      if (!s.card) { cards.append(el('div', 'pz-tray-card empty', s.name)); return; }
      // 第一張可貼的卡帶 ready (輕輕脈動)：打開時一眼看到「點這張 / 按這個數字」
      const b = this.button(`pz-tray-card${ready ? ' ready' : ''}`, '', () => this.on.slot(i + 1));
      ready = false;
      b.append(el('kbd', '', s.key), el('b', '', s.glyph), el('small', '', s.name));
      b.setAttribute('aria-label', s.name);
      cards.append(b);
    });
    const foot = el('div', 'pz-tray-foot');
    const help = el('div', 'pz-tray-help');
    for (const line of m.text.howto) help.append(el('span', '', line));
    const info = el('div', 'pz-tray-info');
    info.append(el('div', 'pz-tray-msg', m.message), help);
    foot.append(info, this.button('pz-tray-close', m.text.close, () => this.on.close()));
    const body = el('div', 'pz-tray-body');
    body.append(tag, cards);
    // 頁籤 (v0.4 H1：詞卡 / 部件卡 / 尺度卡；只有一組時不畫)：點一下換頁 (鍵盤 ← / → 由外殼處理)
    if (m.tabs.length > 1) {
      const tabs = el('div', 'pz-tray-tabs');
      tabs.setAttribute('role', 'tablist');
      for (const k of m.tabs) {
        const b = this.button(`pz-tray-tab${k === m.tab ? ' on' : ''}`, m.text.tabs[k] ?? k, () => this.on.tab(k));
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(k === m.tab));
        tabs.append(b);
      }
      this.sheet.replaceChildren(head, tabs, body, foot);
    } else this.sheet.replaceChildren(head, body, foot);
  }
}
