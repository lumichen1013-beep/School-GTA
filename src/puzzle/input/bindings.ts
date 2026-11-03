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
  map: ['KeyM'],
  /** 字卡匣 (v0.3 N22；開著時才有作用)：貼第 1～3 格的卡、取下標籤上的卡 */
  slot1: ['Digit1', 'Numpad1'],
  slot2: ['Digit2', 'Numpad2'],
  slot3: ['Digit3', 'Numpad3'],
  uncard: ['KeyX', 'Backspace'],
  /** 控制盤 (v0.4 N32；第二章起)：進出轉動模式 (展開圖的「轉」頁籤)、回退一步 */
  turnMode: ['Tab'],
  undo: ['KeyZ']
};

/** 動作在 poll 結果中的順序 (固定，便於測試) */
export const INPUT_ACTIONS: readonly InputAction[] = ['flip', 'reset', 'interact', 'restart', 'confirm', 'cancel', 'map', 'slot1', 'slot2', 'slot3', 'uncard', 'turnMode', 'undo'];

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
