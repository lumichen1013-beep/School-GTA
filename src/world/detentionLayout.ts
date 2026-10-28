// ==========================================================
// 第二世界【特訓少年院】場景配置資料 (DetentionWorld 建模、雷達小地圖、全螢幕大地圖共用，避免多處座標不同步)
// 座標單位：公尺；世界原點位於院區中央，北方為 -Z；院區範圍 X: ±95、Z: ±95
// 三區配置：A 區監區 (Z < -28)、B 區訓練場 (-28 ~ 35)、C 區決戰區 (Z > 35)
// 道路骨架：北側收容車道、外圍巡邏路、中軸路、各區橫向廣場路、A 區東西服務巷
// ==========================================================

// 雷達/大地圖繪製分類：建築 (大型樓房)、結構 (崗哨/庫房等小型建物)、圍籬 (內部安全網)、掩體 (低矮路障)、貨櫃、發電機柱
export type DetentionMapKind = 'building' | 'structure' | 'fence' | 'barrier' | 'container' | 'pillar';

export interface DetentionMapFeature {
  minX: number; maxX: number; minZ: number; maxZ: number;
  kind: DetentionMapKind;
  label?: string; // 僅大地圖顯示的建物名稱
}

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

// 實心建築 (外觀含窗戶列、門、屋頂女兒牆；玩家不可進入)
export type DoorSide = 'N' | 'S' | 'E' | 'W';
export interface DetentionBuilding extends Rect {
  name: string;
  h: number;
  mat: 'concrete' | 'metal'; // 外牆材質 (混凝土樓房 / 鐵皮廠房)
  door: DoorSide;       // 主入口朝向 (面向道路)
  floors: number;       // 窗戶列數
}

// 可進入的空心建物 (四面牆 + 門洞，內部可行走與藏匿)
export interface DetentionHall extends Rect {
  name: string;
  h: number;
  doorSide: DoorSide;
  doorFrom: number;     // 門洞沿牆面座標範圍 (N/S 牆為 X，E/W 牆為 Z)
  doorTo: number;
}

// ---------- 道路 (地面貼圖，不阻擋移動) ----------
export const DETENTION_ROADS: Rect[] = [
  { minX: -92, maxX: 92, minZ: -93.5, maxZ: -86 },  // 北側收容車道
  { minX: -93, maxX: -87, minZ: -86, maxZ: 92 },    // 西外圍巡邏路
  { minX: 87, maxX: 93, minZ: -86, maxZ: 92 },      // 東外圍巡邏路
  { minX: -4, maxX: 4, minZ: -86, maxZ: 93 },       // 中軸路
  { minX: -87, maxX: 87, minZ: -37, maxZ: -31 },    // A 區閘前廣場路
  { minX: -87, maxX: 87, minZ: 27, maxZ: 33 },      // B 區閘前廣場路
  { minX: -87, maxX: 87, minZ: 82, maxZ: 88 },      // C 區南側道路
  { minX: -50, maxX: -45, minZ: -78, maxZ: -37 },   // A 區西服務巷
  { minX: 45, maxX: 50, minZ: -78, maxZ: -37 }      // A 區東服務巷
];

// ---------- A 區：監區 (Z: -95 ~ -28) ----------
// 收容圍籬 (Z ≈ -78.5) 將北側收容車道與監區庭院隔開，三個出入口：
// 西側剪破的圍籬 (潛行)、中央檢查哨 (主線)、東側服務門 (潛行)
export const INTAKE_FENCE_Z0 = -78.9;
export const INTAKE_FENCE_Z1 = -78.1;
export const INTAKE_FENCE_SEGMENTS: [number, number][] = [[-87, -42], [-37, -4], [4, 41], [45, 87]];
export const FENCE_BREACH = { x0: -42, x1: -37 };       // 西側剪破的圍籬
export const INTAKE_CHECKPOINT = { x0: -4, x1: 4 };     // 中央檢查哨口
export const SERVICE_GATE = { x0: 41, x1: 45 };         // 東側服務門

// 中央警衛室 (門禁卡 A 存放於室內辦公桌)：可進入，南面門洞
export const GUARD_HOUSE: DetentionHall = { name: '中央警衛室', minX: -6, maxX: 6, minZ: -66, maxZ: -56, h: 3.6, doorSide: 'S', doorFrom: -1.4, doorTo: 1.4 };
// 收容檢查哨亭 (中央檢查哨口東側)
export const INTAKE_BOOTH: Rect & { h: number } = { minX: 5.5, maxX: 9, minZ: -84, maxZ: -80.5, h: 3.0 };
// 庭院瞭望哨 (監看西半庭院)
export const YARD_WATCHPOST: Rect & { h: number } = { minX: -32, maxX: -28, minZ: -50, maxZ: -46, h: 6.5 };

// ---------- B 區：訓練場 (Z: -28 ~ 35) ----------
// 器材庫 (門禁卡 B 存放於庫內)：可進入，西側大型捲門敞開
export const EQUIPMENT_STORE: DetentionHall = { name: '器材庫', minX: 58, maxX: 86, minZ: -8, maxZ: 18, h: 5.2, doorSide: 'W', doorFrom: 1, doorTo: 11 };

// 實心建築 (A/B/C 區主要樓房)
export const DETENTION_BUILDINGS: DetentionBuilding[] = [
  // A 區
  { name: '西牢房舍', minX: -86, maxX: -54, minZ: -74, maxZ: -54, h: 8.0, mat: 'concrete', door: 'E', floors: 2 },
  { name: '東牢房舍', minX: 54, maxX: 86, minZ: -74, maxZ: -54, h: 8.0, mat: 'concrete', door: 'W', floors: 2 },
  { name: '醫務室', minX: -86, maxX: -60, minZ: -48, maxZ: -38, h: 5.0, mat: 'concrete', door: 'S', floors: 1 },
  { name: '食堂', minX: 60, maxX: 86, minZ: -48, maxZ: -38, h: 5.5, mat: 'concrete', door: 'S', floors: 1 },
  { name: '洗衣房', minX: 22, maxX: 38, minZ: -74, maxZ: -62, h: 4.5, mat: 'concrete', door: 'S', floors: 1 },
  // B 區
  { name: '職訓工坊', minX: -86, maxX: -58, minZ: -22, maxZ: 2, h: 6.0, mat: 'metal', door: 'E', floors: 1 },
  // C 區
  { name: '行政大樓', minX: -86, maxX: -46, minZ: 46, maxZ: 78, h: 9.0, mat: 'concrete', door: 'E', floors: 2 },
  { name: '軍械庫', minX: 46, maxX: 86, minZ: 46, maxZ: 78, h: 6.0, mat: 'metal', door: 'W', floors: 1 }
];

// 瞭望塔 (四座：北側收容車道兩端、南側道路兩端)
export const DETENTION_TOWERS: { x: number; z: number }[] = [
  { x: -80, z: -83 }, { x: 80, z: -83 },
  { x: -80, z: 91.5 }, { x: 80, z: 91.5 }
];
// B 區角樓 (矮型哨塔)
export const DETENTION_CORNER_POSTS: (Rect & { h: number })[] = [
  { minX: -85.5, maxX: -82.5, minZ: -26.5, maxZ: -23.5, h: 5.5 },
  { minX: 82.5, maxX: 85.5, minZ: 22.5, maxZ: 25.5, h: 5.5 }
];
// 中央探照燈塔 (B 區中央，塔頂 Y = 18m)
export const SEARCHLIGHT_TOWER = { x: 0, z: 4 };

// B 區軍規貨櫃堆置場 (isZ = 長軸沿 Z (2.8 × 10m)，否則沿 X (10 × 2.8m))
export interface DetentionContainer { x: number; z: number; isZ: boolean; color: number }
export const DETENTION_CONTAINERS: DetentionContainer[] = [
  { x: -26, z: -20, isZ: false, color: 0x2b4c7e },
  { x: -8, z: -20, isZ: false, color: 0x8b3a3a },
  { x: 10, z: -20, isZ: false, color: 0x3d405b },
  { x: 26, z: -20, isZ: false, color: 0x2d6a4f },
  { x: -32, z: -6, isZ: true, color: 0x5c677d },
  { x: -16, z: -4, isZ: true, color: 0x2b4c7e },
  { x: 16, z: -4, isZ: true, color: 0x8b3a3a },
  { x: 32, z: -6, isZ: true, color: 0x3d405b },
  { x: -22, z: 10, isZ: false, color: 0x2d6a4f },
  { x: 0, z: 12, isZ: false, color: 0x5c677d },
  { x: 22, z: 10, isZ: false, color: 0x8b3a3a },
  { x: -10, z: 22, isZ: false, color: 0x3d405b },
  { x: 12, z: 22, isZ: false, color: 0x2b4c7e },
  { x: 32, z: 20, isZ: true, color: 0x2d6a4f }
];
export const CONTAINER_LONG = 10.0;
export const CONTAINER_SHORT = 2.8;

// B 區障礙訓練場矮牆 (翻越與蹲伏掩護)
export const OBSTACLE_WALLS: Rect[] = [
  { minX: -40, maxX: -32, minZ: 13.6, maxZ: 14.4 },
  { minX: -30, maxX: -22, minZ: 17.6, maxZ: 18.4 },
  { minX: -40, maxX: -32, minZ: 21.6, maxZ: 22.4 },
  { minX: -30, maxX: -22, minZ: 25.6, maxZ: 26.4 }
];

// ---------- C 區：決戰區 (Z: 35 ~ 95) ----------
export const BOSS_ARENA: Rect = { minX: -30, maxX: 30, minZ: 44, maxZ: 80 };
export const GATE_KIOSK: Rect & { h: number } = { minX: -2, maxX: 2, minZ: 86.3, maxZ: 88.3, h: 3.0 };

// 閘前與南側低矮護欄 (半高掩護)
export const DETENTION_BARRIERS: (Rect & { h: number })[] = [
  { minX: -14, maxX: -6, minZ: -36.3, maxZ: -35.7, h: 1.2 },
  { minX: 6, maxX: 14, minZ: -36.3, maxZ: -35.7, h: 1.2 },
  { minX: -16, maxX: -4, minZ: 81.6, maxZ: 82.4, h: 1.3 },
  { minX: 4, maxX: 16, minZ: 81.6, maxZ: 82.4, h: 1.3 }
];

const box = (b: Rect, kind: DetentionMapKind, label?: string): DetentionMapFeature =>
  ({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, kind, label });
const rect = (cx: number, cz: number, w: number, d: number, kind: DetentionMapKind, label?: string): DetentionMapFeature =>
  ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, kind, label });

// 雷達與大地圖靜態圖層 (閘門與南大門另依開啟狀態動態著色，不列於此)
export const DETENTION_MAP_FEATURES: DetentionMapFeature[] = [
  ...DETENTION_BUILDINGS.map((b) => box(b, 'building', b.name)),
  box(GUARD_HOUSE, 'structure', GUARD_HOUSE.name),
  box(EQUIPMENT_STORE, 'structure', EQUIPMENT_STORE.name),
  box(INTAKE_BOOTH, 'structure', '收容檢查哨'),
  box(YARD_WATCHPOST, 'structure', '瞭望哨'),
  ...INTAKE_FENCE_SEGMENTS.map(([x0, x1]) => ({ minX: x0, maxX: x1, minZ: INTAKE_FENCE_Z0, maxZ: INTAKE_FENCE_Z1, kind: 'fence' as const })),
  ...DETENTION_CORNER_POSTS.map((p) => box(p, 'structure')),
  ...DETENTION_CONTAINERS.map((c) => rect(c.x, c.z, c.isZ ? CONTAINER_SHORT : CONTAINER_LONG, c.isZ ? CONTAINER_LONG : CONTAINER_SHORT, 'container')),
  ...OBSTACLE_WALLS.map((w) => box(w, 'barrier')),
  ...DETENTION_BARRIERS.map((b) => box(b, 'barrier')),
  rect(-16, 52, 3.4, 3.4, 'pillar'),
  rect(16, 52, 3.4, 3.4, 'pillar'),
  rect(-16, 74, 3.4, 3.4, 'pillar'),
  rect(16, 74, 3.4, 3.4, 'pillar'),
  box(GATE_KIOSK, 'structure')
];

// 大地圖區域標籤 (道路與開放空間名稱)
export const DETENTION_MAP_AREA_LABELS: { x: number; z: number; text: string }[] = [
  { x: -20, z: -90, text: '收容車道' },
  { x: 18, z: -56, text: '放風庭院' },
  { x: 0, z: -15, text: '貨櫃堆置場' },
  { x: -31, z: 20, text: '障礙訓練場' },
  { x: 0, z: 63, text: '決戰庭院' }
];
