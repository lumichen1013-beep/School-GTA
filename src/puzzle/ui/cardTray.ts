// 字卡匣 (v0.3 N22 最小版；mobile-controls 2.5)：從畫面底部升起的紙卡；左邊是標籤 (墨框裡的字，貼了詞卡就是卡上的字)，
// 右邊是卡匣格 (每張 ≥ 56 CSS px，點一張 = 貼到這個標籤)、貼著的卡 (點「取下」)；寫錯 → 標籤字顫動、墨色變淡
// 只畫 app/cardTrayModel 推導好的資料；點選只回呼外殼 (外殼產生 WorldCommand)，不改世界
import type { Text } from '../text/text';

export interface CardTrayModel {
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
  text: { head: string; close: string; remove: string; hint: string; scale: string };
}

export interface CardTrayHandlers { slot(n: number): void; remove(): void; close(): void }

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
    m.slots.forEach((s, i) => {
      if (!s.card) { cards.append(el('div', 'pz-tray-card empty', s.name)); return; }
      const b = this.button('pz-tray-card', '', () => this.on.slot(i + 1));
      b.append(el('kbd', '', s.key), el('b', '', s.glyph), el('small', '', s.name));
      b.setAttribute('aria-label', s.name);
      cards.append(b);
    });
    const foot = el('div', 'pz-tray-foot');
    foot.append(el('span', 'pz-tray-msg', m.message || m.text.hint), this.button('pz-tray-close', m.text.close, () => this.on.close()));
    const body = el('div', 'pz-tray-body');
    body.append(tag, cards);
    this.sheet.replaceChildren(head, body, foot);
  }
}
