/// <reference types="vite/client" />

// 開發中武器開關。
// DEV_WEAPONS_BUILD 為編譯期常數：非 production mode (dev server / vitest) 或 VITE_DEV_WEAPONS=1 的建置才為 true，正式版為 false，
// 讓 `DEV_WEAPONS_BUILD ? [...] : []` 的 dev 武器定義與模型被 tree-shake (不打包)。
// devWeaponsMode：off = 完全隱藏；unlocked = 可直接裝備 (標「開發中」)；locked = 需達成解鎖條件。
// 模型於 WeaponRig 建構時預建 → 切換模式需重整頁面，不做熱切換。
export type DevWeaponsMode = 'off' | 'unlocked' | 'locked';

// 以 MODE 判斷 dev：import.meta.env.DEV 取決於 NODE_ENV，環境變數被設成非 production 值時正式建置也會誤判為 true
export const DEV_WEAPONS_BUILD: boolean = import.meta.env.MODE !== 'production' || import.meta.env.VITE_DEV_WEAPONS === '1';

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
  if (!DEV_WEAPONS_BUILD) return 'off';
  let mode: DevWeaponsMode | null = null;
  try {
    mode = parseMode(new URLSearchParams(window.location.search).get('devweapons'));
    if (mode) window.localStorage.setItem(DEV_WEAPONS_STORAGE_KEY, mode);
    else mode = parseMode(window.localStorage.getItem(DEV_WEAPONS_STORAGE_KEY));
  } catch { /* 無 window / 無痕模式等無法存取時採預設 */ }
  return mode ?? 'unlocked';
}

export let devWeaponsMode: DevWeaponsMode = resolveInitialMode();

// 測試專用：正式版 (非 DEV_WEAPONS_BUILD) 一律維持 off。須在載入 registry 之前呼叫 (registry 於載入時決定武器槽)
export function __setDevWeaponsMode(mode: DevWeaponsMode) {
  devWeaponsMode = DEV_WEAPONS_BUILD ? mode : 'off';
}
