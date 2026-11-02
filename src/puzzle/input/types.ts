import type { WorldAction } from '../core/actions';

/** 外殼動作 (不進世界模擬)；notes / menu 等於對應畫面實作時加入 */
export type ShellAction = 'restart' | 'confirm' | 'cancel';
export type InputAction = WorldAction | ShellAction;
/** 持續軸 */
export type Axis = 'left' | 'right' | 'up' | 'down' | 'jump';
/** 動作 / 軸 → KeyboardEvent.code 清單 (可重綁) */
export type Bindings = Readonly<Record<InputAction | Axis, readonly string[]>>;

/** 每幀取樣結果：持續軸 + 上次取樣後新按下的動作 */
export interface InputFrame { moveX: number; moveZ: number; jump: boolean; pressed: InputAction[]; anyKey: boolean }

export interface InputSource {
  /** 每幀取樣 (新按下的動作取走即清空) */
  poll(): InputFrame;
  /** 丟棄尚未取走的按鍵 */
  clear(): void;
  /** 丟棄未取走的按鍵，並視為所有按著的鍵都已放開 (確認窗開啟 / 取消時避免卡鍵) */
  releaseAll(): void;
  dispose(): void;
}
