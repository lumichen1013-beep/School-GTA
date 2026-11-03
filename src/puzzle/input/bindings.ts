import type { Axis, Bindings, InputAction } from './types';

/** 預設按鍵 (沿用舊 input.ts / game.ts) */
export const DEFAULT_BINDINGS: Bindings = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  /** W = 往房間深處 (-z) */
  up: ['KeyW', 'ArrowUp'],
  /** S = 往鏡頭 (+z) */
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  flip: ['KeyF', 'KeyQ'],
  reset: ['KeyT'],
  interact: ['KeyE'],
  restart: ['KeyR'],
  /** 確認窗：Enter 確認、Esc 取消 */
  confirm: ['Enter', 'NumpadEnter'],
  cancel: ['Escape'],
  /** 展開圖 (v0.3；只在藏寶圖看得到) */
  map: ['KeyM']
};

/** 動作在 poll 結果中的順序 (固定，便於測試) */
export const INPUT_ACTIONS: readonly InputAction[] = ['flip', 'reset', 'interact', 'restart', 'confirm', 'cancel', 'map'];

/** 以設定中的覆寫 (settings.keys) 合併預設按鍵；不認得的名稱與非字串清單忽略 */
export function mergeBindings(base: Bindings, override: Readonly<Record<string, unknown>> | undefined): Bindings {
  const out: Record<string, readonly string[]> = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    if (k in base && Array.isArray(v) && v.length > 0 && v.every(c => typeof c === 'string')) out[k] = [...v];
  }
  return out as Bindings;
}

/** KeyboardEvent.code → 顯示用按鍵名 ('KeyF' → 'F'、'Digit1' → '1'、'Space' → 'Space') */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}

export const AXES: readonly Axis[] = ['left', 'right', 'up', 'down', 'jump'];
