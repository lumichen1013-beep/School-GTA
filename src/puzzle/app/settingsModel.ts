// 關卡中的「設定」popup 與 Esc 的分派 (純函式，Node 可測；ui/settingsPanel.ts 只負責畫)
// Esc 優先順序：確認窗 (外殼 routeFrame 先攔) > 浮層 (道具欄 / 設定) 關閉 > 轉動模式離開 / 字卡匣關閉 (照舊) > 打開設定

export interface EscapeContext {
  /** 開著的浮層 (道具欄 / 設定)；null = 沒有 */
  panel: 'items' | 'settings' | null;
  turnMode: boolean;
  /** 字卡匣開著 */
  tray: boolean;
}

/** closePanel = 關掉開著的浮層；pass = 交給轉動模式 / 字卡匣原本的 Esc；openSettings = 打開設定 */
export type EscapeAction = 'closePanel' | 'pass' | 'openSettings';

export function escapeAction(ctx: EscapeContext): EscapeAction {
  if (ctx.panel) return 'closePanel';
  if (ctx.turnMode || ctx.tray) return 'pass';
  return 'openSettings';
}

/**
 * 「重置記錄」確認窗的兩段式狀態：勾選「我了解，無法復原」(ack) 之後「確定重置」才可按；
 * withSettings = 連設定一起重置 (預設不勾)
 */
export interface ResetDialogState { ack: boolean; withSettings: boolean }
export const initialResetDialog = (): ResetDialogState => ({ ack: false, withSettings: false });
export const canConfirmReset = (s: ResetDialogState): boolean => s.ack;
