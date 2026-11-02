// 鍵盤輸入：持續按鍵 + 單次觸發 (只用於《圖紙之間》，不依賴 GTA 的 InputManager)
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class PuzzleInput {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** 任意鍵按下的回呼 (跳過旁白) */
  onAnyKey: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', e => {
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.onAnyKey?.();
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private any(...codes: string[]): boolean { return codes.some(c => this.down.has(c)); }

  get moveX(): number { return (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0); }
  /** W = 往房間深處 (-z)，S = 往鏡頭 (+z) */
  get moveZ(): number { return (this.any('KeyS', 'ArrowDown') ? 1 : 0) - (this.any('KeyW', 'ArrowUp') ? 1 : 0); }
  get jump(): boolean { return this.any('Space'); }

  /** 取走單次按鍵事件 */
  take(...codes: string[]): boolean {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }
  clearPressed(): void { this.pressed.clear(); }
}
