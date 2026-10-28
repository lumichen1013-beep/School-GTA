// 天天國中校園平面配置 (小地圖、大地圖、所在區域判定共用)
// 數值對齊 CampusWorld.buildRichCampus() 各設施建造呼叫的中心點與尺寸

export interface CampusMapRect {
  x: number; // 中心 X
  z: number; // 中心 Z
  w: number; // X 向寬度
  d: number; // Z 向深度
  color: string;
  label: string;
}

// 地圖上繪製的建築與設施色塊
export const CAMPUS_MAP_RECTS: CampusMapRect[] = [
  { x: -70, z: -90.5, w: 50, d: 27, color: '#14532d', label: '自然生態探索園區' },
  { x: 75, z: -35, w: 20, d: 32, color: '#0284c7', label: '標準游泳館' },
  { x: 30, z: -45, w: 32, d: 48, color: '#166534', label: '籃球場' },
  { x: 38, z: 18, w: 20, d: 34, color: '#334155', label: '敬業樓 A 棟' },
  { x: 38, z: 72, w: 20, d: 34, color: '#334155', label: '樂群樓 B 棟' },
  { x: 31, z: 45, w: 6, d: 20, color: '#475569', label: '' }, // 2F/3F 空中天橋
  { x: 74, z: 38, w: 22, d: 30, color: '#6d28d9', label: '演藝大樓' },
  { x: -15, z: -60, w: 18, d: 14, color: '#b45309', label: '天天合作社' },
  { x: -55, z: -65, w: 32, d: 10, color: '#0369a1', label: '自行車棚' },
  { x: -55, z: -34, w: 18, d: 12, color: '#475569', label: '司令台' }
];

// 操場跑道 (南北向直道 + 兩端半圓彎道)
export const CAMPUS_TRACK = { x: -55, z: 30, straightHalf: 16, innerR: 18, outerR: 32 };

interface CampusZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number; // 高於此高度才符合 (樓頂、天橋)
  name: string;
}

// 所在區域判定 (依序比對，先符合者優先；皆不符合時為教學中庭廣場)
const CAMPUS_ZONES: CampusZone[] = [
  { minX: 63, maxX: 87, minZ: -55, maxZ: -15, name: '🏊 天天國中 25m 標準游泳館' },
  { minX: -95, maxX: -45, minZ: -104, maxZ: -77, name: '🌿 自然生態探索園區 (秘境霸主)' },
  { minX: 63, maxX: 85, minZ: 23, maxZ: 53, minY: 11.5, name: '🏸 演藝大樓 4F 羽球館' },
  { minX: 63, maxX: 85, minZ: 23, maxZ: 53, name: '🎭 演藝大樓 (國際演藝廳)' },
  { minX: 26, maxX: 50, minZ: -10, maxZ: 35, minY: 17.5, name: '敬業樓 A 棟 · 天台高空' },
  { minX: 26, maxX: 50, minZ: -10, maxZ: 35, name: '敬業樓 A 棟 (三年級部)' },
  { minX: 28, maxX: 34, minZ: 35, maxZ: 55, minY: 5, name: '空中走廊天橋' },
  { minX: 26, maxX: 50, minZ: 55, maxZ: 100, minY: 17.5, name: '樂群樓 B 棟 · 天台高空' },
  { minX: 26, maxX: 50, minZ: 55, maxZ: 100, name: '樂群樓 B 棟 (一二年級部)' },
  { minX: -87, maxX: -23, minZ: -18, maxZ: 78, name: '操場 PU 跑道 & 足球場' },
  { minX: -64, maxX: -46, minZ: -40, maxZ: -26, name: '全校升旗司令台' },
  { minX: 14, maxX: 46, minZ: -69, maxZ: -21, name: '🏀 籃球場' },
  { minX: -24, maxX: -6, minZ: -70, maxZ: -50, name: '🏪 天天合作社 (熱食補血部)' },
  { minX: -71, maxX: -39, minZ: -71, maxZ: -59, name: '火柴人自行車棚' },
  { minX: -20, maxX: 20, minZ: 95, maxZ: 110, name: '校門口 & 警衛守衛室' }
];

export function getCampusZoneName(x: number, y: number, z: number): string {
  if (z > 105.0 || z < -105.0 || Math.abs(x) > 105.0) return '🏙️ 校外大街 (強盜出沒警戒區)';
  for (const zone of CAMPUS_ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ && (zone.minY === undefined || y >= zone.minY)) {
      return zone.name;
    }
  }
  return '教學中庭廣場';
}
