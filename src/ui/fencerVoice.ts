// 花劍客戰「戰鬥字幕條」：畫面下方中央單行，顯示向陽之心的話 (取代系統橫幅) 與遠處 Boss 的台詞。
// 預建 DOM (常駐合成層，只切 opacity / 文字)；放在 #hud-overlay 內，過場時隨 HUD 一起隱藏。佇列最多 3 則、依序播放。

export type VoiceSpeaker = 'heart' | 'boss' | 'flower';

interface VoiceItem { text: string; sec: number; spk: VoiceSpeaker }

const MAX_QUEUE = 3;
const FADE_SEC = 0.25;

export class FencerVoiceStrip {
  private el: HTMLDivElement | null = null;
  private readonly queue: VoiceItem[] = [];
  private current: VoiceItem | null = null;
  private left = 0;

  /** 預建 (預熱時呼叫)：沒有 DOM 時 (測試) 不做事 */
  public ensure(): HTMLDivElement | null {
    if (this.el || typeof document === 'undefined') return this.el;
    this.el = document.getElementById('fencer-voice') as HTMLDivElement | null;
    return this.el;
  }

  public show(text: string, sec: number, spk: VoiceSpeaker) {
    if (!text) return;
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push({ text, sec, spk });
    if (!this.current) this.next();
  }

  public get busy(): boolean {
    return this.current !== null;
  }

  public update(dt: number) {
    if (!this.current) return;
    this.left -= dt;
    if (this.left <= 0) this.next();
  }

  public clear() {
    this.queue.length = 0;
    this.current = null;
    const el = this.ensure();
    if (el) el.classList.remove('fencer-voice--on');
  }

  private next() {
    const el = this.ensure();
    this.current = this.queue.shift() ?? null;
    if (!this.current) {
      if (el) el.classList.remove('fencer-voice--on');
      return;
    }
    this.left = this.current.sec + FADE_SEC;
    if (el) {
      el.textContent = this.current.text;
      el.dataset.spk = this.current.spk;
      el.classList.add('fencer-voice--on');
    }
  }
}

/** 字幕說話者 (CSS data-spk)：🎩 Boss / ☀️ 向陽之心 / 🌻 太陽花 / （…）玩家 */
export function subtitleSpeaker(text: string): 'boss' | 'heart' | 'flower' | 'player' | '' {
  if (text.startsWith('🎩')) return 'boss';
  if (text.startsWith('☀')) return 'heart';
  if (text.startsWith('🌻')) return 'flower';
  if (text.startsWith('（')) return 'player';
  return '';
}
