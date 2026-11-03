// 過場畫面的 DOM 部分 (cutscenes-v0.1 2.3、2.4)：字幕帶 (整段淡入淡出)、推進提示、跳過按鈕與長按進度
import type { Text } from '../text/text';
import { make } from './screens/screen';

/** ui 只認得的字幕資料 (由 app 從播放器狀態轉成) */
export interface SubtitleModel {
  lines: readonly string[] | null;
  alpha: number;
  /** 已可推進 (手動模式時顯示小箭頭) */
  canAdvance: boolean;
  /** 長按跳過進度 0..1 */
  holdProgress: number;
  /** 確認窗開著 (暫停) */
  paused: boolean;
}

export interface CutsceneUi {
  /** 放畫布的容器 (render 層的 canvas 由 app 掛進來) */
  readonly stage: HTMLElement;
  update(m: SubtitleModel): void;
  /** 淡出後移除 */
  close(): void;
}

export interface CutsceneUiHandlers {
  pointerDown(): void;
  pointerUp(): void;
  pointerCancel(): void;
  skip(): void;
}

export function showCutsceneUi(text: Text, opts: { title: string; noteScale: number; reduceMotion: boolean }, on: CutsceneUiHandlers): CutsceneUi {
  document.getElementById('pz-cutscene')?.remove();
  const root = make('div', 'pz-cutscene');
  root.id = 'pz-cutscene';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', opts.title);
  root.style.setProperty('--pz-cs-scale', String(opts.noteScale));
  root.classList.toggle('reduce', opts.reduceMotion);
  const stage = make('div', 'pz-cs-stage');
  const band = make('div', 'pz-cs-band');
  const textEl = make('div', 'pz-cs-text');
  textEl.id = 'pz-cs-text';
  textEl.setAttribute('aria-live', 'polite');
  const next = make('span', 'pz-cs-next');
  next.setAttribute('aria-hidden', 'true');
  band.append(textEl, next);
  const skip = make('button', 'pz-cs-skip', text('ui.cutscene.skip'));
  skip.id = 'pz-cs-skip';
  skip.type = 'button';
  skip.title = text('ui.cutscene.hold');
  const hint = make('span', 'pz-cs-hold', text('ui.cutscene.hold'));
  root.append(stage, band, skip, hint);
  document.getElementById('pz-root')!.append(root);

  skip.addEventListener('pointerdown', e => e.stopPropagation());
  skip.addEventListener('pointerup', e => e.stopPropagation());
  skip.addEventListener('click', e => { e.stopPropagation(); on.skip(); });
  root.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    root.setPointerCapture?.(e.pointerId);
    on.pointerDown();
  });
  root.addEventListener('pointerup', () => on.pointerUp());
  root.addEventListener('pointercancel', () => on.pointerCancel());
  root.addEventListener('contextmenu', e => e.preventDefault());

  let shown: string | null = null;
  let alpha = -1;
  let flags = '';
  return {
    stage,
    update(m) {
      const key = m.lines ? m.lines.join('\n') : null;
      if (key !== shown) {
        shown = key;
        textEl.replaceChildren(...(m.lines ?? []).map(l => make('div', 'pz-cs-line', l)));
      }
      const a = m.lines ? Math.round(m.alpha * 100) / 100 : 0;
      if (a !== alpha) { alpha = a; textEl.style.opacity = String(a); }
      const f = `${m.canAdvance ? 1 : 0}${m.holdProgress > 0.15 ? 1 : 0}${m.paused ? 1 : 0}`;
      if (f !== flags) {
        flags = f;
        root.classList.toggle('can-advance', m.canAdvance && !m.paused);
        root.classList.toggle('holding', m.holdProgress > 0.15);
      }
      skip.style.setProperty('--hold', String(m.holdProgress));
    },
    close() {
      root.classList.add('closing');
      root.style.pointerEvents = 'none';
      window.setTimeout(() => root.remove(), 650);
    }
  };
}
