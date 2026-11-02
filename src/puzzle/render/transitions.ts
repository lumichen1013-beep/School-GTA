import type { Mode } from '../core/types';

/** 切換視角的過場掛點：期間外殼鎖輸入、不推進世界；swapNow 那一步換渲染模式與鏡頭 */
export interface Transition {
  readonly duration: number;
  start(to: Mode): void;
  tick(dt: number): { done: boolean; swapNow: boolean };
  /** 立即結束並清除畫面 (重來 / 離開關卡) */
  cancel(): void;
}

/** 全螢幕暈開過場的資料：時長、往各模式的背景、縮放起點與幅度、換畫面的進度點 */
export interface FadeSpec {
  duration: number;
  background: Readonly<Record<Mode, string>>;
  scaleFrom: number;
  scaleBy: number;
  swapAt: number;
}

/** 墨水暈開：往圖紙是墨水色，回現實是紙色 (沿用舊 game.ts 的 0.3 秒過場) */
export const INK_FADE: FadeSpec = {
  duration: 0.3,
  background: {
    '2d': 'radial-gradient(circle at 50% 55%, rgba(61,99,255,.96) 0%, rgba(154,77,255,.92) 38%, rgba(253,244,225,.95) 62%, rgba(253,244,225,0) 72%)',
    '3d': 'radial-gradient(circle at 50% 55%, rgba(253,244,225,.98) 0%, rgba(243,217,182,.95) 45%, rgba(231,168,61,.6) 62%, rgba(231,168,61,0) 72%)'
  },
  scaleFrom: 0.35,
  scaleBy: 1.6,
  swapAt: 0.5
};

/** 過場登錄表 (日後「減少動態」加 plain) */
export const TRANSITIONS: Readonly<Record<'ink', FadeSpec>> = { ink: INK_FADE };

/** 以 DOM 元素 (#pz-fade) 播放 FadeSpec */
export function cssFade(el: HTMLElement, spec: FadeSpec): Transition {
  let left = 0;
  let swapped = true;
  return {
    duration: spec.duration,
    start(to) {
      left = spec.duration;
      swapped = false;
      el.style.background = spec.background[to];
    },
    tick(dt) {
      left -= dt;
      const t = 1 - Math.max(left, 0) / spec.duration;
      el.style.opacity = String(1 - Math.abs(2 * t - 1));
      el.style.transform = `scale(${spec.scaleFrom + t * spec.scaleBy})`;
      const swapNow = !swapped && t >= spec.swapAt;
      if (swapNow) swapped = true;
      const done = left <= 0;
      if (done) el.style.opacity = '0';
      return { done, swapNow };
    },
    cancel() {
      left = 0;
      swapped = true;
      el.style.opacity = '0';
    }
  };
}
