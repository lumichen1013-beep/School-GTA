// 測試工具：devtools/runScript 的薄包裝 (簽名與行為同 S8 以前的 helpers；移動只走 step 的無動作幀，等同 stepWorld)
import { foyer } from '../../src/puzzle/content/levels/ch1/1-2-foyer';
import { createWorld } from '../../src/puzzle/core/world';
import { DEFAULT_MECHANICS } from '../../src/puzzle/mechanics';
import type { InputState, LevelDef, Mode, World } from '../../src/puzzle/core/types';
import { SCRIPT_DT, driver, hold, hop, placePlayer, walk } from '../../src/puzzle/devtools/runScript';
import { TEXT } from './msgs';
import { FOYER_V02 } from './fixtures/foyerV02';

/** v0.2 玄關 (墨水閥 / 出口門) 的固定場景：給機制 / 引擎行為的回歸測試用 (M-Cube C6 起正式玄關已改版) */
export { FOYER_V02 };

export const DT = SCRIPT_DT;
export const newWorld = (level: LevelDef = foyer): World => createWorld(level, { mechanics: DEFAULT_MECHANICS, text: TEXT });

export function run(w: World, input: Partial<InputState>, seconds: number, each?: () => void): void {
  hold(driver(w), input, seconds, each);
}

/** 直接把玩家放到某處並落地 (測試用) */
export function place(w: World, x: number, y: number, z: number, mode: Mode = '3d'): void {
  placePlayer(driver(w), x, y, z, mode);
}

/** 簡易控制器：朝目標走，直到進入容差 (3D 先 x 後 z 或相反) */
export function walkTo(w: World, tx: number | null, tz: number | null, opts: { zFirst?: boolean; tol?: number; max?: number } = {}): void {
  walk(driver(w), tx, tz, opts);
}

/** 持續按住方向 + 跳，直到條件成立或逾時；回傳是否成立 */
export function hopUntil(w: World, moveX: number, done: () => boolean, seconds = 10): boolean {
  return hop(driver(w), moveX, done, seconds);
}

/** v0.2 玄關 (FOYER_V02) 的 1-2d：把木箱擺到出口區墨水閥正下方 (x=15、z=0)，玩家站上箱頂 (墨水閥在 y=2.3，站地板搆不到) */
export function onCrateAtValve(w: World, mode: Mode = '2d'): void {
  const c = w.byId.get('crate')!;
  c.x = 15; c.z = 0;
  place(w, 15, c.y + c.def.h, 0, mode);
}
