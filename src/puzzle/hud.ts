import type { Mode } from './logic/types';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/** 筆尖鑰匙的 HUD 圖示 (與 3D 模型同配色：金色環、柄、齒、筆尖、墨藍寶石) */
const KEY_ICON = `<svg viewBox="0 0 64 28" width="46" height="20" aria-hidden="true">
  <g stroke="#3a2618" stroke-width="2.2" stroke-linejoin="round">
    <circle cx="12" cy="14" r="8.5" fill="#f5c242"/><circle cx="12" cy="14" r="3.4" fill="#3d63ff"/>
    <rect x="20" y="11" width="24" height="6" rx="2" fill="#f5c242"/>
    <rect x="30" y="17" width="4.5" height="5" fill="#f5c242"/><rect x="37" y="17" width="4.5" height="7" fill="#f5c242"/>
    <path d="M44 9 L60 14 L44 19 Z" fill="#f5c242"/>
  </g>
  <path d="M47 14 L58 14" stroke="#3a2618" stroke-width="1.4"/>
</svg>`;

/** HUD：模式、持有物、互動提示、訊息、旁白、通關畫面 */
export class PuzzleHud {
  private root = $('pz-root');
  private modeEl = $('pz-mode');
  private invEl = $('pz-inv');
  private promptEl = $('pz-prompt');
  private toastEl = $('pz-toast');
  private narrationEl = $('pz-narration');
  private clearEl = $('pz-clear');
  private toastUntil = 0;
  private mode: Mode | null = null;
  private hasKey: boolean | null = null;
  private prompt: string | null = null;

  setMode(m: Mode): void {
    if (m === this.mode) return;
    this.mode = m;
    this.modeEl.textContent = m === '3d' ? '現實' : '圖紙';
    this.root.classList.toggle('mode2d', m === '2d');
  }
  setInventory(hasKey: boolean): void {
    if (hasKey === this.hasKey) return;
    if (hasKey && this.hasKey === false) {
      this.invEl.classList.remove('got');
      void this.invEl.offsetWidth; // 重新觸發取得動畫
      this.invEl.classList.add('got');
    }
    this.hasKey = hasKey;
    this.invEl.innerHTML = hasKey ? `持有物 ${KEY_ICON}<b>筆尖</b>` : '持有物：無';
  }
  setPrompt(text: string | null): void {
    if (text === this.prompt) return;
    this.prompt = text;
    this.promptEl.textContent = text ?? '';
    this.promptEl.classList.toggle('show', !!text);
  }
  toast(text: string, nowMs: number, ms = 3500): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('show', !!text);
    this.toastUntil = nowMs + ms;
  }
  tick(nowMs: number): void {
    if (this.toastUntil && nowMs > this.toastUntil) { this.toastEl.classList.remove('show'); this.toastUntil = 0; }
  }
  showNarration(text: string): void {
    this.narrationEl.textContent = text;
    this.narrationEl.classList.remove('hide');
  }
  hideNarration(): void { this.narrationEl.classList.add('hide'); }
  showClear(nextRoom: string): void {
    $('pz-next').textContent = nextRoom;
    this.clearEl.classList.add('show');
  }
  hideClear(): void { this.clearEl.classList.remove('show'); }
  onReplay(fn: () => void): void { $('pz-replay').addEventListener('click', fn); }
}
