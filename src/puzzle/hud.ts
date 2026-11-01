import type { Mode } from './logic/types';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

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

  setMode(m: Mode): void {
    this.modeEl.textContent = m === '3d' ? '現實' : '圖紙';
    this.root.classList.toggle('mode2d', m === '2d');
  }
  setInventory(hasKey: boolean): void { this.invEl.textContent = `持有物：${hasKey ? '筆尖' : '無'}`; }
  setPrompt(text: string | null): void {
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
