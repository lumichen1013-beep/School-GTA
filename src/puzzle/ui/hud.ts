import type { Mode } from '../core/types';
import type { Text } from '../text/text';
import { ITEM_ICONS } from './icons';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

/** 寫入一行字：`~~x~~` 片段畫成刪除線 (爸爸劃掉的字，story-bible 7.1)；其餘為純文字節點 (不解析 HTML) */
export function setStruckText(el: HTMLElement, text: string): void {
  el.replaceChildren(...text.split(/(~~.+?~~)/).filter(s => s !== '').map(s => {
    if (!(s.startsWith('~~') && s.endsWith('~~'))) return document.createTextNode(s);
    const del = document.createElement('s');
    del.textContent = s.slice(2, -2);
    return del;
  }));
}

/** ui 只認得的 HUD 資料形狀 (由 app/hudModel 的 deriveHud 產生) */
export interface HudData {
  mode: Mode;
  modeText: string;
  items: ReadonlyArray<{ id: string; n: number; name: string }>;
  prompt: string | null;
  toast: { seq: number; text: string };
  /** v0.4 控制盤章節 2D 的墨量小計 (「墨 ●●●○○○」)；沒有 = 不顯示 */
  ink?: string;
}

/** HUD：依 HudData 做 diff 後寫 DOM；旁白、通關畫面 (DOM 由 ui/dom.ts 建立) */
export class PuzzleHud {
  private root = $('pz-root');
  private modeEl = $('pz-mode');
  private invEl = $('pz-inv');
  private inkEl = $('pz-ink');
  private ink = '';
  private promptEl = $('pz-prompt');
  private toastEl = $('pz-toast');
  private narrationEl = $('pz-narration');
  private clearEl = $('pz-clear');
  private toastUntil = 0;
  private mode: Mode | null = null;
  private invKey: string | null = null;
  private invCount = 0;
  private prompt: string | null = null;
  private toastSeq = 0;

  constructor(private text: Text) {}

  /** 新世界開始：只記下目前訊息序號 (不重播舊訊息)；物品欄下次重畫但不播取得動畫 */
  reset(msgSeq: number): void {
    this.toastSeq = msgSeq;
    this.invKey = null;
  }

  render(m: HudData, nowMs: number): void {
    if (m.toast.seq !== this.toastSeq) { this.toastSeq = m.toast.seq; this.toast(m.toast.text, nowMs); }
    this.tick(nowMs);
    this.setMode(m.mode, m.modeText);
    this.setItems(m.items);
    this.setPrompt(m.prompt);
    if ((m.ink ?? '') !== this.ink) { this.ink = m.ink ?? ''; this.inkEl.textContent = this.ink; }
  }

  private setMode(m: Mode, label: string): void {
    if (m === this.mode) return;
    this.mode = m;
    this.modeEl.textContent = label;
    this.root.classList.toggle('mode2d', m === '2d');
  }
  private setItems(items: HudData['items']): void {
    const key = items.map(i => `${i.id}:${i.n}`).join(',');
    if (key === this.invKey) return;
    const count = items.reduce((s, i) => s + i.n, 0);
    if (this.invKey !== null && count > this.invCount) {
      this.invEl.classList.remove('got');
      void this.invEl.offsetWidth; // 重新觸發取得動畫
      this.invEl.classList.add('got');
    }
    this.invKey = key;
    this.invCount = count;
    this.invEl.innerHTML = items.length
      ? `${this.text('ui.inv.label')} ${items.map(i => `${ITEM_ICONS[i.id] ?? ''}<b>${i.name}</b>`).join('')}`
      : this.text('ui.inv.none');
  }
  private setPrompt(text: string | null): void {
    if (text === this.prompt) return;
    this.prompt = text;
    this.promptEl.textContent = text ?? '';
    this.promptEl.classList.toggle('show', !!text);
  }
  private toast(text: string, nowMs: number, ms = 3500): void {
    setStruckText(this.toastEl, text);
    this.toastEl.classList.toggle('show', !!text);
    this.toastUntil = nowMs + ms;
  }
  private tick(nowMs: number): void {
    if (this.toastUntil && nowMs > this.toastUntil) { this.toastEl.classList.remove('show'); this.toastUntil = 0; }
  }
  showNarration(text: string): void {
    this.narrationEl.textContent = text;
    this.narrationEl.classList.remove('hide');
  }
  hideNarration(): void { this.narrationEl.classList.add('hide'); }
  /** 通關畫面；cont = 「繼續」鈕的字 (null = 沒有下一步，隱藏) */
  showClear(title: string, nextRoom: string, cont: string | null = null): void {
    $('pz-clear-title').textContent = title;
    $('pz-next').textContent = nextRoom;
    const b = $('pz-continue');
    b.textContent = cont ?? '';
    b.hidden = cont === null;
    this.clearEl.classList.add('show');
  }
  hideClear(): void { this.clearEl.classList.remove('show'); }
  /** 互動提示可點 (觸控：點提示 = 按 E)；只有互動提示可點，展開圖提示不可點 */
  setPromptTap(on: boolean): void { this.promptEl.classList.toggle('tap', on); }
  onPrompt(fn: () => void): void {
    this.promptEl.addEventListener('click', e => { if (this.promptEl.classList.contains('tap')) { e.preventDefault(); fn(); } });
  }
  onReplay(fn: () => void): void { $('pz-replay').addEventListener('click', fn); }
  onMenu(fn: () => void): void { $('pz-tomenu').addEventListener('click', fn); }
  onContinue(fn: () => void): void { $('pz-continue').addEventListener('click', fn); }
}
