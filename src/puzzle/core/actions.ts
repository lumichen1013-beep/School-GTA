/** 玩家對世界的單次動作 (pin / section / mark 於對應機制實作時加入) */
export type WorldAction = 'flip' | 'reset' | 'interact';

/** 同一幀多個動作的處理順序：沿用舊 game.ts 的「切換 → 歸位 → 互動」，之後才是移動 */
export const ACTION_ORDER: readonly WorldAction[] = ['flip', 'reset', 'interact'];

/** 一幀的輸入：持續軸 + 本幀新按下的動作 */
export interface ActionFrame { moveX: number; moveZ: number; jump: boolean; pressed: readonly WorldAction[] }
