// ── 道具欄的格子圖示 (2026-11-08)：40×40 的 SVG，同一套繪本色 (深棕墨線 + 奶油紙 + 金 / 墨藍 / 琥珀 / 青綠點綴) ──

const INK = '#3a2618';
const PAPER = '#fdf4e1';
const PAPER2 = '#f6e2c0';
const GOLD = '#f5c242';
const BLUE = '#3d63ff';
const AMBER = '#a8640f';
const GREEN = '#3e8a7a';

const svg = (body: string): string => `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><g stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
/** 卡面的字 (SVG 文字；只放一個字，不解析 HTML) */
const glyph = (ch: string, color: string): string => ch ? `<text x="20" y="25" text-anchor="middle" font-size="14" font-weight="700" fill="${color}" stroke="none" font-family="PingFang TC, Noto Sans TC, sans-serif">${ch.replace(/[<>&"]/g, '')}</text>` : '';

const KEY = (mark = ''): string => svg(`<circle cx="11" cy="20" r="7" fill="${GOLD}"/><circle cx="11" cy="20" r="2.6" fill="${PAPER}"/><rect x="17" y="17.5" width="18" height="5" rx="1.5" fill="${GOLD}"/><path d="M27 22.5 v5 M32 22.5 v4" />${mark}`);
const ICONS: Readonly<Record<string, (ch: string) => string>> = {
  nib: () => svg(`<circle cx="11" cy="20" r="6.5" fill="${GOLD}"/><circle cx="11" cy="20" r="2.6" fill="${BLUE}"/><rect x="17" y="17.5" width="11" height="5" rx="1.5" fill="${GOLD}"/><path d="M28 14 L37 20 L28 26 Z" fill="${GOLD}"/>`),
  key: () => KEY(),
  keyStudy: () => KEY(`<rect x="8" y="5" width="7" height="6" fill="${PAPER2}" stroke-width="1.5"/>`),
  keyGreen: () => KEY(`<path d="M9 11 q2 -7 7 -6 q-1 6 -7 6 Z" fill="${GREEN}" stroke-width="1.5"/>`),
  keyCellar: () => KEY(`<path d="M6 10 h3 v-3 h3 v-3 h3" fill="none" stroke-width="1.6"/>`),
  bow: () => svg(`<circle cx="15" cy="20" r="9" fill="${GOLD}"/><circle cx="15" cy="20" r="3.4" fill="${PAPER}"/><rect x="24" y="17.5" width="8" height="5" rx="1.5" fill="${GOLD}"/><path d="M33 16 l3 8" stroke-dasharray="2 2"/>`),
  tooth: () => svg(`<rect x="8" y="16" width="24" height="7" rx="1.5" fill="${GOLD}"/><path d="M14 23 v6 h4 v-6 M24 23 v9 h4 v-9" fill="${GOLD}"/>`),
  diary: () => svg(`<rect x="9" y="6" width="22" height="28" rx="2" fill="${AMBER}"/><path d="M13 6 v28" /><rect x="15" y="11" width="12" height="6" fill="${PAPER}" stroke-width="1.5"/><path d="M26 34 v4 l2 -2 l2 2 v-4" fill="${BLUE}" stroke-width="1.5"/>`),
  notes: () => svg(`<rect x="9" y="6" width="22" height="28" rx="2" fill="${PAPER2}"/><path d="M9 11 h-3 M9 17 h-3 M9 23 h-3 M9 29 h-3" /><path d="M14 13 h12 M14 18 h12 M14 23 h8" stroke-width="1.5"/>`),
  page: () => svg(`<path d="M9 5 h16 l6 6 v24 h-22 Z" fill="${PAPER}"/><path d="M25 5 v6 h6" fill="none"/><path d="M20 30 v-10 M20 24 q-6 -1 -6 -7 q6 0 6 7 M20 21 q5 -1 5 -6 q-5 0 -5 6" fill="${GREEN}" stroke-width="1.5"/>`),
  manuscript: () => svg(`<rect x="7" y="11" width="24" height="20" fill="${PAPER2}"/><rect x="10" y="8" width="24" height="20" fill="${PAPER}"/><path d="M14 14 h16 M14 18 h16 M14 22 h10" stroke-width="1.5"/><path d="M7 21 h27" stroke="${AMBER}" stroke-width="2.5"/>`),
  proof: () => svg(`<rect x="8" y="6" width="24" height="28" fill="${PAPER}"/><path d="M12 12 h16 M12 17 h16 M12 22 h16 M12 27 h9" stroke-width="2.4"/><circle cx="27" cy="27" r="3" fill="${INK}" stroke="none" opacity=".55"/>`),
  chart: () => svg(`<path d="M6 9 l9 -3 l10 3 l9 -3 v25 l-9 3 l-10 -3 l-9 3 Z" fill="${PAPER}"/><path d="M15 6 v25 M25 9 v25" stroke-width="1.5"/><rect x="18" y="15" width="4" height="4" fill="${BLUE}" stroke-width="1.2"/>`),
  scrap: () => svg(`<path d="M8 8 h18 l-2 4 l5 3 l-3 4 l4 4 l-2 5 l3 4 h-23 Z" fill="${PAPER2}"/><path d="M12 14 h8 v8 h-8 Z M20 18 h5" fill="none" stroke-width="1.4"/>`),
  wordCard: ch => svg(`<rect x="8" y="5" width="24" height="30" rx="3" fill="${PAPER}"/><rect x="11" y="8" width="18" height="24" rx="2" fill="none" stroke-width="1.2"/>${glyph(ch, INK)}`),
  partCard: ch => svg(`<rect x="8" y="5" width="24" height="30" rx="3" fill="#eef1ff" stroke="${BLUE}"/><path d="M11 9 h4 M25 9 h4 M11 31 h4 M25 31 h4" stroke="${BLUE}" stroke-width="1.5"/>${glyph(ch, BLUE)}`),
  scaleCard: ch => svg(`<rect x="8" y="5" width="24" height="30" rx="3" fill="${PAPER}"/><path d="M11 30 h18 M13 30 v-3 M17 30 v-2 M21 30 v-3 M25 30 v-2" stroke="${AMBER}" stroke-width="1.5"/>${glyph(ch, AMBER)}`),
  pane: () => svg(`<path d="M20 4 L34 20 L20 36 L6 20 Z" fill="#c98a1a" opacity=".85"/><path d="M20 4 L20 36 M6 20 L34 20" stroke-width="1.5"/><path d="M13 12 L20 20 L13 28" fill="${GREEN}" opacity=".6" stroke-width="1.2"/>`),
  frame: () => svg(`<circle cx="16" cy="16" r="10" fill="none" stroke-width="3"/><path d="M23 23 L34 34" stroke-width="4"/>`),
  lens: () => svg(`<circle cx="20" cy="20" r="11" fill="#dfeefa"/><path d="M14 16 q3 -4 8 -4" stroke="${PAPER}" stroke-width="2.5"/><path d="M29 13 l3 -2" stroke-width="1.5"/>`),
  magnifier: () => svg(`<circle cx="16" cy="16" r="10" fill="#dfeefa" stroke-width="3"/><path d="M11 13 q2 -4 7 -4" stroke="${PAPER}" stroke-width="2.5"/><path d="M23 23 L34 34" stroke-width="4"/>`),
  ruler: () => svg(`<rect x="4" y="14" width="32" height="12" rx="1.5" fill="${GOLD}"/><path d="M9 14 v5 M14 14 v3 M19 14 v5 M24 14 v3 M29 14 v5" stroke-width="1.5"/>`),
  generic: () => svg(`<path d="M8 14 l12 -6 l12 6 v14 l-12 6 l-12 -6 Z" fill="${PAPER2}"/><path d="M8 14 l12 6 l12 -6 M20 20 v14" fill="none"/>${glyph('?', INK).replace('y="25"', 'y="19"').replace('font-size="14"', 'font-size="9"')}`)
};

/** 物品 id → 圖示種類 (依 id 前綴；沒有對應 = generic 後備) */
function iconKind(id: string): string {
  const exact: Readonly<Record<string, string>> = {
    nib: 'nib', 'key.brass': 'key', 'key.study': 'keyStudy', 'key.greenhouse': 'keyGreen', 'key.cellar': 'keyCellar', 'key.bow': 'bow',
    'notes.father': 'notes', 'page.garden': 'page', 'ms.father': 'manuscript', proof: 'proof', chart: 'chart',
    frame: 'frame', lens: 'lens', magnifier: 'magnifier', scale: 'ruler', 'card.da': 'scaleCard', 'card.xiao': 'scaleCard', 'card.ri': 'partCard', 'card.cai': 'partCard'
  };
  if (exact[id]) return exact[id];
  const prefix: ReadonlyArray<[string, string]> = [['tooth.', 'tooth'], ['diary.', 'diary'], ['scrap.', 'scrap'], ['pane.', 'pane'], ['card.', 'wordCard'], ['key.', 'key']];
  return prefix.find(([p]) => id.startsWith(p))?.[1] ?? 'generic';
}

/**
 * 道具欄的格子圖示：ch = 卡面的字 (字卡；名稱「詞卡「外」」的「外」)；generic = 沒有專屬圖示、用了後備 (之後新增的道具；測試保證現有道具都不是後備)
 */
export function itemIcon(id: string, ch = ''): { svg: string; generic: boolean } {
  const kind = iconKind(id);
  return { svg: ICONS[kind](ch), generic: kind === 'generic' };
}
