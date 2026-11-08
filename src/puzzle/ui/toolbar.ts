// 畫面上方的工具列 (重置 / 魔方 / 2D / 3D；app/toolbarModel 推導資料)：DOM 按鈕放在右上角容器 #pz-topright (操作說明小鈕左側)
/** 工具列的資料 (由 app/toolbarModel 的 deriveToolbar 產生；字串已解析) */
export interface ToolbarButton { id: 'reset' | 'cube' | '2d' | '3d'; label: string; aria: string; active: boolean; enabled: boolean }
export interface ToolbarView { show: boolean; buttons: ToolbarButton[] }

export class Toolbar {
  private bar: HTMLElement;
  private btns = new Map<string, HTMLButtonElement>();
  private key = '';

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
        e.className = `pz-bar-btn ${b.id === 'reset' ? 'reset' : 'mode'}`;
        e.dataset.bar = b.id;
        e.addEventListener('click', ev => { ev.preventDefault(); e.blur(); this.onClick(b.id); });
        this.btns.set(b.id, e);
        return e;
      }));
    }
    for (const b of v.buttons) {
      const e = this.btns.get(b.id)!;
      e.textContent = b.label;
      e.title = b.aria;
      e.setAttribute('aria-label', b.aria);
      e.classList.toggle('active', b.active);
      e.classList.toggle('off', !b.enabled);
      // 停用的鈕仍可點 (點了說明原因)；aria-disabled 只給輔助技術
      e.setAttribute('aria-disabled', String(!b.enabled));
      if (b.id !== 'reset') e.setAttribute('aria-pressed', String(b.active));
    }
  }
}
