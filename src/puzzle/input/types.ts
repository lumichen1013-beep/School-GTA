import type { WorldAction } from '../core/actions';

/**
 * 外殼動作 (不進世界模擬；map = 開關展開圖，v0.3；slot1～3 / uncard = 字卡匣開著時貼第 n 格的卡 / 取下，v0.3 N22；
 * turnMode / undo = 控制盤的轉動模式開關、回退一步；nav* = 轉動模式裡用方向鍵選標頭 (快速點按也抓得到)，v0.4 N32)；
 * help = 開合操作說明面板；combine = 把手上的道具合成 (N28)；notes / menu 等於對應畫面實作時加入
 */
export type ShellAction = 'restart' | 'confirm' | 'cancel' | 'map' | 'slot1' | 'slot2' | 'slot3' | 'uncard' | 'help' | 'combine' | 'turnMode' | 'undo' | 'navLeft' | 'navRight' | 'navUp' | 'navDown';
export type InputAction = WorldAction | ShellAction;
/** 持續軸 */
export type Axis = 'left' | 'right' | 'up' | 'down' | 'jump';
/** 動作 / 軸 → KeyboardEvent.code 清單 (可重綁) */
export type Bindings = Readonly<Record<InputAction | Axis, readonly string[]>>;

/** 每幀取樣結果：持續軸 + 上次取樣後新按下的動作 */
export interface InputFrame {
  moveX: number; moveZ: number; jump: boolean; pressed: InputAction[]; anyKey: boolean;
  /** 上次取樣後跳躍鍵是否新按下 (快速點按也抓得到；過場用空白鍵推進) */
  jumpPressed?: boolean;
}

export interface InputSource {
  /** 每幀取樣 (新按下的動作取走即清空) */
  poll(): InputFrame;
  /** 丟棄尚未取走的按鍵 */
  clear(): void;
  /** 丟棄未取走的按鍵，並視為所有按著的鍵都已放開 (確認窗開啟 / 取消時避免卡鍵) */
  releaseAll(): void;
  dispose(): void;
}
