// 道具欄 popup (2026-11-08；app/inventoryModel 推導資料)：格子 (一格一個圖示、數量角標、空格淡色) + 點選後的名稱與說明；
// 只檢視、不改世界。開著時 LevelSession 暫停角色移動 (世界照常)；展開圖 / 字卡匣 / 轉動模式打開時自動收起

export interface InventoryCell { id: string; name: string; n: number; icon: string; card: boolean; selected: boolean }
export interface InventoryView {
  title: string; close: string;
  cells: InventoryCell[];
  /** 格數 (≥ 12、整列；空格畫淡色) */
  slots: number;
  /** 持有總數 (工具列「道具」鈕的角標) */
  count: number;
  /** 什麼都沒有時的一句話 */
  empty: string | null;
  detail: { name: string; desc: string; count: string | null; note: string | null } | null;
  /** 還沒點選時的說明 */
  hint: string;
  slotLabel: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class InventoryPopup {
  private card = el('div', 'pz-items');
  private head = el('div', 'pz-items-head');
  private title = el('b', 'pz-items-title');
  private closeBtn = el('button', 'pz-items-close');
  private grid = el('div', 'pz-items-grid');
  private detail = el('div', 'pz-items-detail');
  private key = '';

  constructor(root: HTMLElement, private on: { pick(id: string): void; close(): void }) {
    this.card.id = 'pz-items';
    this.card.setAttribute('role', 'dialog');
    this.closeBtn.type = 'button';
    this.closeBtn.tabIndex = -1;
    this.closeBtn.addEventListener('click', e => { e.preventDefault(); this.on.close(); });
    this.head.append(this.title, this.closeBtn);
    this.card.append(this.head, this.grid, this.detail);
    root.append(this.card);
  }

  /** v = null 收起；相同內容不重畫 */
  render(v: InventoryView | null): void {
    const key = v ? JSON.stringify(v) : '';
    if (key === this.key) return;
    this.key = key;
    this.card.classList.toggle('show', !!v);
    if (!v) return;
    this.title.textContent = v.title;
    this.closeBtn.textContent = v.close;
    this.card.setAttribute('aria-label', v.title);
    const cells: HTMLElement[] = v.cells.map(c => {
      const b = el('button', `pz-item${c.selected ? ' sel' : ''}${c.card ? ' card' : ''}`);
      b.type = 'button';
      b.tabIndex = -1;
      b.dataset.item = c.id;
      b.title = c.name;
      b.setAttribute('aria-label', c.n > 1 ? `${c.name} ×${c.n}` : c.name);
      b.setAttribute('aria-pressed', String(c.selected));
      b.innerHTML = c.icon;
      if (c.n > 1) b.append(el('i', 'pz-item-n', String(c.n)));
      b.addEventListener('click', e => { e.preventDefault(); this.on.pick(c.id); });
      return b;
    });
    for (let i = v.cells.length; i < v.slots; i++) { const s = el('span', 'pz-item empty'); s.setAttribute('aria-label', v.slotLabel); cells.push(s); }
    this.grid.replaceChildren(...cells);
    const d = v.detail;
    if (!d) this.detail.replaceChildren(el('p', 'pz-items-hint', v.empty ?? v.hint));
    else {
      const h = el('b', 'pz-items-name', d.name);
      if (d.count) h.append(el('small', '', ` ${d.count}`));
      this.detail.replaceChildren(h, el('p', 'pz-items-desc', d.desc), ...(d.note ? [el('p', 'pz-items-note', d.note)] : []));
    }
  }
}
