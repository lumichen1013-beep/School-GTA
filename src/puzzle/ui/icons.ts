/** 筆尖鑰匙的 HUD 圖示 (與 3D 模型同配色：金色環、柄、齒、筆尖、墨藍寶石) */
const NIB_ICON = `<svg viewBox="0 0 64 28" width="46" height="20" aria-hidden="true">
  <g stroke="#3a2618" stroke-width="2.2" stroke-linejoin="round">
    <circle cx="12" cy="14" r="8.5" fill="#f5c242"/><circle cx="12" cy="14" r="3.4" fill="#3d63ff"/>
    <rect x="20" y="11" width="24" height="6" rx="2" fill="#f5c242"/>
    <rect x="30" y="17" width="4.5" height="5" fill="#f5c242"/><rect x="37" y="17" width="4.5" height="7" fill="#f5c242"/>
    <path d="M44 9 L60 14 L44 19 Z" fill="#f5c242"/>
  </g>
  <path d="M47 14 L58 14" stroke="#3a2618" stroke-width="1.4"/>
</svg>`;

/** 物品 id → HUD SVG 圖示 (沒有圖示的物品只顯示名稱) */
export const ITEM_ICONS: Readonly<Record<string, string>> = { nib: NIB_ICON };
