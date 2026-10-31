/// <reference types="vite/client" />

// 開發中武器開關。
// 開發中武器定義在所有建置 (含正式版) 都會打包，是否啟用由 devWeaponsMode 決定：
// 開發版 (MODE !== production) 預設 unlocked；正式版預設 off，需以網址 ?devweapons=1|locked 開啟 (會記在 localStorage，?devweapons=0 關回)。
// devWeaponsMode：off = 完全隱藏；unlocked = 可直接裝備 (標「開發中」)；locked = 需達成解鎖條件。
// 模型於 WeaponRig 建構時預建 → 切換模式需重整頁面，不做熱切換。
export type DevWeaponsMode = 'off' | 'unlocked' | 'locked';

// 以 MODE 判斷 dev：import.meta.env.DEV 取決於 NODE_ENV，環境變數被設成非 production 值時正式建置也會誤判為 true
const DEFAULT_MODE: DevWeaponsMode = import.meta.env.MODE !== 'production' ? 'unlocked' : 'off';

export const DEV_WEAPONS_STORAGE_KEY = 'schoolgta.devweapons';

function parseMode(v: string | null | undefined): DevWeaponsMode | null {
  switch (v) {
    case '0': case 'off': return 'off';
    case '1': case 'unlocked': return 'unlocked';
    case 'locked': return 'locked';
    default: return null;
  }
}

function resolveInitialMode(): DevWeaponsMode {
  let mode: DevWeaponsMode | null = null;
  try {
    mode = parseMode(new URLSearchParams(window.location.search).get('devweapons'));
    if (mode) window.localStorage.setItem(DEV_WEAPONS_STORAGE_KEY, mode);
    else mode = parseMode(window.localStorage.getItem(DEV_WEAPONS_STORAGE_KEY));
  } catch { /* 無 window / 無痕模式等無法存取時採預設 */ }
  return mode ?? DEFAULT_MODE;
}

export let devWeaponsMode: DevWeaponsMode = resolveInitialMode();

// 測試專用：須在載入 registry 之前呼叫 (registry 於載入時決定武器槽)
export function __setDevWeaponsMode(mode: DevWeaponsMode) {
  devWeaponsMode = mode;
}
