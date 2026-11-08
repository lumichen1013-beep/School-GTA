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

/** 過場 id (主題的 transition 欄位；日後「減少動態」加 plain) */
export type TransitionId = 'ink';

/** 過場登錄表：主題選用哪一種 (外殼依 theme.transition 取) */
export const TRANSITIONS: Readonly<Record<TransitionId, FadeSpec>> = { ink: INK_FADE };

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

/** 章節過場 (轉動 / 換房)：不切換渲染模式；swapNow = 換畫面點 (換房時換場景、轉動時說明「房間滑了過去」) */
export interface Fx {
  readonly duration: number;
  tick(dt: number): { done: boolean; swapNow: boolean };
  cancel(): void;
}

/** 轉動短過場 (規格 5.4.1：≤ 1.2 秒；減弱動態 0.6 秒淡入淡出)；換房淡出淡入 */
export const CUBE_FX = {
  turn: 1.0,
  reduced: 0.6,
  /** v0.4 5-5c 第五次轉動 (收束)：1.2 秒、畫面以中心緩緩轉過一個小角度再回正 (減弱動態 = reduced 淡入淡出) */
  collapse: 1.2,
  collapseDeg: 14,
  door: 0.5,
  /** 轉動時畫面往滑動方向位移的幅度 (畫面寬 / 高的比例) */
  shift: 0.08,
  /** 轉動中途的輕微晃動 (px) */
  rumble: 3,
  veil: 0.92
} as const;

/** 滑動方向 → 畫面位移方向 (上 = 北 = 往畫面上方) */
const FX_DIR: Readonly<Record<string, [number, number]>> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

const easeInOut = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

/**
 * dir = 'N' / 'S' / 'E' / 'W'：轉動 — 畫面朝滑動方向滑出、紙色遮罩蓋上、從反方向滑回 (中段輕晃)；
 * dir = null：換房 — 遮罩淡入淡出。reduce (減弱動態)：只有遮罩淡入淡出、不位移不晃動
 */
export function cssCubeFx(stage: HTMLElement, veil: HTMLElement, dir: string | null, reduce: boolean): Fx {
  const collapse = dir === 'collapse';
  const duration = dir === null ? CUBE_FX.door : reduce ? CUBE_FX.reduced : collapse ? CUBE_FX.collapse : CUBE_FX.turn;
  const move = dir !== null && !reduce && !collapse ? FX_DIR[dir] ?? null : null;
  const spin = collapse && !reduce;
  let t = 0;
  let swapped = false;
  const reset = (): void => {
    stage.style.transform = '';
    veil.style.opacity = '0';
  };
  return {
    duration,
    tick(dt) {
      t = Math.min(t + dt, duration);
      const k = t / duration;
      const cover = 1 - Math.abs(2 * k - 1);
      veil.style.opacity = String(easeInOut(cover) * CUBE_FX.veil);
      if (move) {
        // 前半往 dir 滑出，後半從反方向滑回原位
        const off = k < 0.5 ? easeInOut(k * 2) : -easeInOut((1 - k) * 2);
        const jit = Math.sin(t * 70) * CUBE_FX.rumble * cover;
        const px = move[0] * off * CUBE_FX.shift * stage.clientWidth + (move[1] !== 0 ? jit : 0);
        const py = move[1] * off * CUBE_FX.shift * stage.clientHeight + (move[0] !== 0 ? jit : 0);
        stage.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(${(1 - 0.03 * cover).toFixed(3)})`;
      }
      // 第五次轉動：整張畫面繞中心轉過去再回正 (不晃動、不閃爍)
      if (spin) stage.style.transform = `rotate(${(Math.sin(Math.PI * k) * CUBE_FX.collapseDeg).toFixed(2)}deg) scale(${(1 - 0.05 * cover).toFixed(3)})`;
      const swapNow = !swapped && k >= 0.5;
      if (swapNow) swapped = true;
      const done = t >= duration;
      if (done) reset();
      return { done, swapNow };
    },
    cancel: reset
  };
}
