// 畫面上方的工具列 (重置 / 魔方 / 2D / 3D；app/toolbarModel 推導資料)：DOM 按鈕放在右上角容器 #pz-topright (操作說明小鈕左側)
/** 工具列的資料 (由 app/toolbarModel 的 deriveToolbar 產生；字串已解析) */
/** badge = 角標數字 (「道具」鈕 = 持有總數；0 = 不畫) */
export interface ToolbarButton { id: 'reset' | 'cube' | '2d' | '3d' | 'items' | 'settings'; label: string; aria: string; active: boolean; enabled: boolean; badge?: number }
export interface ToolbarView { show: boolean; buttons: ToolbarButton[] }

/** 齒輪 (「設定」鈕；手機只顯示圖示) */
const GEAR_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M8.6 1.5h2.8l.4 2.3 1.6.7 1.9-1.4 2 2-1.4 1.9.7 1.6 2.3.4v2.8l-2.3.4-.7 1.6 1.4 1.9-2 2-1.9-1.4-1.6.7-.4 2.3H8.6l-.4-2.3-1.6-.7-1.9 1.4-2-2 1.4-1.9-.7-1.6-2.3-.4V8.6l2.3-.4.7-1.6-1.4-1.9 2-2 1.9 1.4 1.6-.7Z" fill="currentColor"/><circle cx="10" cy="10" r="3" fill="var(--paper)"/></svg>';

export class Toolbar {
  private bar: HTMLElement;
  private btns = new Map<string, HTMLButtonElement>();
  private key = '';
  /** 上一次的道具數 (變多 = 鈕播一次取得動畫；同舊持有物列) */
  private count: number | null = null;

  constructor(private onClick: (id: ToolbarButton['id']) => void) {
    this.bar = document.getElementById('pz-bar')!;
  }

  render(v: ToolbarView): void {
    const key = JSON.stringify(v);
    if (key === this.key) return;
    this.key = key;
    this.bar.classList.toggle('show', v.show);
    const ids = v.buttons.map(b => b.id).join(',');
    if (ids !== [...this.btns.keys()].join(',')) {
      this.btns.clear();
      this.bar.replaceChildren(...v.buttons.map(b => {
        const e = document.createElement('button');
        e.type = 'button';
        e.tabIndex = -1;
        e.className = `pz-bar-btn ${b.id === 'reset' || b.id === 'items' || b.id === 'settings' ? b.id : 'mode'}`;
        e.dataset.bar = b.id;
        e.addEventListener('click', ev => { ev.preventDefault(); e.blur(); this.onClick(b.id); });
        this.btns.set(b.id, e);
        return e;
      }));
    }
    for (const b of v.buttons) {
      const e = this.btns.get(b.id)!;
      if (b.id === 'settings') { e.innerHTML = GEAR_SVG; e.append(Object.assign(document.createElement('span'), { textContent: b.label })); }
      else e.textContent = b.label;
      if (b.badge) e.append(Object.assign(document.createElement('i'), { className: 'pz-bar-badge', textContent: String(b.badge) }));
      if (b.id === 'items') {
        const n = b.badge ?? 0;
        if (this.count !== null && n > this.count) { e.classList.remove('got'); void e.offsetWidth; e.classList.add('got'); }
        this.count = n;
      }
      e.title = b.aria;
      e.setAttribute('aria-label', b.aria);
      e.classList.toggle('active', b.active);
      e.classList.toggle('off', !b.enabled);
      // 停用的鈕仍可點 (點了說明原因)；aria-disabled 只給輔助技術
      e.setAttribute('aria-disabled', String(!b.enabled));
      if (b.id !== 'reset') e.setAttribute(b.id === 'items' || b.id === 'settings' ? 'aria-expanded' : 'aria-pressed', String(b.active));
    }
  }
}
