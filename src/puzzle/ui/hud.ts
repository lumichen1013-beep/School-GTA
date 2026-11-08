import type { Mode } from '../core/types';
import type { Text } from '../text/text';

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
  /** v0.4 N28：手上有一組配方時的「合成」鈕文字；沒有 = 不顯示 */
  combine?: string;
}

/** HUD：依 HudData 做 diff 後寫 DOM；旁白、通關畫面 (DOM 由 ui/dom.ts 建立) */
export class PuzzleHud {
  private root = $('pz-root');
  private modeEl = $('pz-mode');
  private inkEl = $('pz-ink');
  private ink = '';
  private promptEl = $('pz-prompt');
  private toastEl = $('pz-toast');
  private narrationEl = $('pz-narration');
  private clearEl = $('pz-clear');
  private toastUntil = 0;
  private mode: Mode | null = null;
  private prompt: string | null = null;
  private toastSeq = 0;
  private combineBtn = $('pz-combine');
  private combineText = '';
  private helpBtn = $('pz-help-btn');
  private helpEl = $('pz-help');
  private tipEl = $('pz-tip');
  private helpKey = '';
  private tipUntil = 0;

  constructor(private text: Text) {}

  /** 新世界開始：只記下目前訊息序號 (不重播舊訊息) */
  reset(msgSeq: number): void {
    this.toastSeq = msgSeq;
  }

  render(m: HudData, nowMs: number): void {
    if (m.toast.seq !== this.toastSeq) { this.toastSeq = m.toast.seq; this.toast(m.toast.text, nowMs); }
    this.tick(nowMs);
    this.setMode(m.mode, m.modeText);
    this.setPrompt(m.prompt);
    if ((m.ink ?? '') !== this.ink) { this.ink = m.ink ?? ''; this.inkEl.textContent = this.ink; }
    if ((m.combine ?? '') !== this.combineText) {
      this.combineText = m.combine ?? '';
      this.combineBtn.textContent = this.combineText;
      this.combineBtn.classList.toggle('show', !!this.combineText);
    }
  }

  private setMode(m: Mode, label: string): void {
    if (m === this.mode) return;
    this.mode = m;
    this.modeEl.textContent = label;
    this.root.classList.toggle('mode2d', m === '2d');
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
  /** 操作說明：小鈕 (收合時) / 面板 (展開時；遇到展開圖、字卡匣、轉動模式自動讓位) */
  renderHelp(v: { button: boolean; expanded: boolean; yielded: boolean; label: string }): void {
    const key = `${v.button}|${v.expanded}|${v.yielded}|${v.label}`;
    if (key === this.helpKey) return;
    this.helpKey = key;
    this.helpBtn.classList.toggle('show', v.button);
    this.helpBtn.classList.toggle('open', v.expanded || v.yielded);
    this.helpBtn.querySelector('span')!.textContent = v.label;
    this.helpBtn.setAttribute('aria-expanded', String(v.expanded));
    this.helpEl.classList.toggle('show', v.expanded);
  }
  /** 「合成」鈕 (觸控 / 滑鼠；鍵盤 = C) */
  onCombine(fn: () => void): void { this.combineBtn.addEventListener('click', e => { e.preventDefault(); fn(); this.combineBtn.blur(); }); }
  onHelp(fn: () => void): void { this.helpBtn.addEventListener('click', e => { e.preventDefault(); fn(); this.helpBtn.blur(); }); }
  /** 一次性操作小提示 (畫面上方一行；ms 後自動消失；null = 立刻收起) */
  showTip(text: string | null, nowMs: number, ms: number): void {
    this.tipEl.textContent = text ?? '';
    this.tipEl.classList.toggle('show', !!text);
    this.tipUntil = text ? nowMs + ms : 0;
  }
  tickTip(nowMs: number): void {
    if (this.tipUntil && nowMs > this.tipUntil) { this.tipEl.classList.remove('show'); this.tipUntil = 0; }
  }
  get tipShowing(): boolean { return this.tipUntil > 0; }
  /** 互動提示可點 (觸控：點提示 = 按 E)；只有互動提示可點，展開圖提示不可點 */
  setPromptTap(on: boolean): void { this.promptEl.classList.toggle('tap', on); }
  onPrompt(fn: () => void): void {
    this.promptEl.addEventListener('click', e => { if (this.promptEl.classList.contains('tap')) { e.preventDefault(); fn(); } });
  }
  onReplay(fn: () => void): void { $('pz-replay').addEventListener('click', fn); }
  onMenu(fn: () => void): void { $('pz-tomenu').addEventListener('click', fn); }
  onContinue(fn: () => void): void { $('pz-continue').addEventListener('click', fn); }
}
