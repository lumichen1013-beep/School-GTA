/** 玩家對世界的單次動作 (pin / section / mark 於對應機制實作時加入) */
export type WorldAction = 'flip' | 'reset' | 'interact';

/** 同一幀多個動作的處理順序：沿用舊 game.ts 的「切換 → 歸位 → 互動」，之後才是移動 */
export const ACTION_ORDER: readonly WorldAction[] = ['flip', 'reset', 'interact'];

/**
 * 帶參數的指令 (v0.3；architecture 4.17)：字卡匣貼卡 / 取卡；v0.4 combine = 把持有的道具依配方合成 (N28，mechanics/combine)。由外殼 (字卡匣 UI) 產生、經 ActionFrame 送進世界，可錄製、可回放；
 * 核心不解讀內容，交給機制的 command 掛點 (mechanics/labels)
 */
export type WorldCommand = { t: 'card'; label: string; card: string } | { t: 'uncard'; label: string; card: string } | { t: 'combine' };

/** 一幀的輸入：持續軸 + 本幀新按下的動作 + 本幀的指令 (動作之後、移動之前處理) */
export interface ActionFrame { moveX: number; moveZ: number; jump: boolean; pressed: readonly WorldAction[]; commands?: readonly WorldCommand[] }
