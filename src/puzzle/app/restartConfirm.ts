import type { InputAction } from '../input/types';

/** 確認窗開啟後這段時間內忽略「確認」鍵 (玩家可能正按著 E / Enter) */
export const CONFIRM_GUARD_MS = 300;

export type ConfirmOutcome = 'confirm' | 'cancel' | null;

/**
 * 「重新開始本關」確認狀態 (純邏輯，不碰 DOM)：
 * 關閉時 R 只負責開窗；開窗時再按 R 一律忽略 (連按不會確認)，
 * Enter 須在開窗 CONFIRM_GUARD_MS 之後才算確認，Esc 隨時取消。
 */
export class RestartConfirm {
  private openedAt: number | null = null;

  get isOpen(): boolean { return this.openedAt !== null; }

  open(nowMs: number): void { this.openedAt = nowMs; }
  close(): void { this.openedAt = null; }

  /** 開窗期間每幀餵入新按下的動作；回傳結果並在有結果時關窗。同幀 cancel 優先於 confirm */
  press(pressed: readonly InputAction[], nowMs: number): ConfirmOutcome {
    if (this.openedAt === null) return null;
    if (pressed.includes('cancel')) { this.close(); return 'cancel'; }
    if (pressed.includes('confirm') && nowMs - this.openedAt >= CONFIRM_GUARD_MS) { this.close(); return 'confirm'; }
    return null;
  }
}

/** 每幀對輸入的處置：update = 推進世界；其餘皆不推進世界 (確認窗開啟 = 暫停) */
export type FrameRoute = 'update' | 'open' | 'confirm' | 'cancel' | 'wait' | 'restart';

/** 依畫面與確認窗狀態決定本幀處置 (會更新 gate)：關卡中 R → 開窗；通關畫面 R → 直接重玩 (行為不變) */
export function routeFrame(gate: RestartConfirm, screenId: string, pressed: readonly InputAction[], nowMs: number): FrameRoute {
  if (gate.isOpen) return gate.press(pressed, nowMs) ?? 'wait';
  if (!pressed.includes('restart')) return 'update';
  if (screenId !== 'level') return 'restart';
  gate.open(nowMs);
  return 'open';
}
