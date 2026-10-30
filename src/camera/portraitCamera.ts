// 直屏 (aspect < 1) 鏡頭補償：three.js 的 FOV 為垂直視角，直屏時水平視野會變得很窄，
// 因此以 aspect 計算 0~1 的補償係數，同時提高垂直 FOV、拉遠鏡頭、抬高機位並讓角色略低於畫面中心。
// aspect >= 1 (橫屏、桌機) 係數恆為 0，所有補償值與原本完全相同。

/** 補償係數達 1 時的 aspect (約 9:16 手機直屏以下全額補償) */
export const PORTRAIT_FULL_ASPECT = 0.45;
/** 直屏垂直 FOV 上限 (度)，避免魚眼 */
export const PORTRAIT_MAX_FOV = 78;
/** 補償全額時戶外跟隨距離的額外倍率 (4.2m -> 7.56m) */
export const PORTRAIT_DISTANCE_GAIN = 0.8;
/** 補償全額時戶外機位額外抬高 (公尺) */
export const PORTRAIT_HEIGHT_LIFT = 0.6;
/** 補償全額時視線焦點上移 (公尺)，使角色落在畫面中心偏下 */
export const PORTRAIT_LOOK_LIFT = 0.7;
/** 補償係數過渡速率 (每秒，指數平滑) */
export const PORTRAIT_BLEND_RATE = 4.0;

/** aspect -> 直屏補償係數 0~1 (aspect >= 1 為 0) */
export function portraitFactor(aspect: number): number {
  if (!(aspect < 1)) return 0;
  const t = (1 - aspect) / (1 - PORTRAIT_FULL_ASPECT);
  return Math.min(1, Math.max(0, t));
}

/** 垂直 FOV：橫屏為 baseFov，直屏隨係數提高至 PORTRAIT_MAX_FOV */
export function portraitFov(baseFov: number, factor: number): number {
  return baseFov + factor * Math.max(0, PORTRAIT_MAX_FOV - baseFov);
}

/** 戶外跟隨距離倍率 (室內／樓梯間／電梯的上限不乘此倍率) */
export function portraitDistanceScale(factor: number): number {
  return 1 + factor * PORTRAIT_DISTANCE_GAIN;
}

/** 垂直 FOV (度) + aspect -> 水平 FOV (度) */
export function horizontalFov(verticalFovDeg: number, aspect: number): number {
  const v = (verticalFovDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(v / 2) * aspect) * 180) / Math.PI;
}
