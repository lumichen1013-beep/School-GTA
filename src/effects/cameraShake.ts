// 全域鏡頭震動請求 (遊戲物件不需持有鏡頭參考，由 ThirdPersonCamera 每幀取用並衰減)
let trauma = 0;

// 請求一次鏡頭震動 (amount 0~1，取最大值不累加，避免連續撞擊震動過猛)
export function requestCameraShake(amount: number) {
  trauma = Math.max(trauma, Math.min(1, amount));
}

// 取得本幀震動幅度並衰減 (約 0.5 秒歸零)
export function consumeCameraShake(delta: number): number {
  if (trauma <= 0) return 0;
  const current = trauma;
  trauma = Math.max(0, trauma - delta * 2.0);
  return current * current;
}
