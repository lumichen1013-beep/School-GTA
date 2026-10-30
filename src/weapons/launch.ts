// 擊飛初速度與飛行距離 (純函式，NPC.launchFlying 與測試共用)
export const LAUNCH_GRAVITY = 26;

export interface LaunchCap { readonly h: number; readonly v: number }

// 水平 / 垂直初速度：force 換算後夾在 [下限, 上限]
export function launchHorizontal(force: number, maxH: number): number {
  return Math.min(Math.max(force * 1.1, 3.0), maxH);
}
export function launchVertical(force: number, maxV: number): number {
  return Math.min(Math.max(force * 0.6, 2.0), maxV);
}

// 無阻擋、同高度落地的水平飛行距離 = H × 2V / g
export function launchDistance(force: number, cap: LaunchCap): number {
  return launchHorizontal(force, cap.h) * 2 * launchVertical(force, cap.v) / LAUNCH_GRAVITY;
}
