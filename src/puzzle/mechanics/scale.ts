// N23 尺度三檔 (量；規格 6「第三章共用規則」量、「3-1 苗圃（細化）」；architecture 4.18、7.4.7)
// - 尺度卡「大」card.da / 「小」card.xiao 貼在名詞標籤的方槽 (label.scale)；貼卡的流程在 mechanics/labels (先問 canResize，成功後 applyScale)
// - 縮放 = 標籤的函式：以底部中心改寫 ObjState.def 的 w / h / d (原值 = World.level.objects 的同 id 定義)；每步 beforePhysics 依標籤重算，
//   所以讀檔 / 換房 / R 都不必另存縮放狀態 (核心的 objBox 不必改)
// - 重量：大 3 / 原 2 / 小 1 (沒有標籤 = 物件資料的 weight 或 2)；天平 (mechanics/balance) 讀它
// - 卡榫 (P3)：jam 物件此刻的有效盒伸出房間範圍 → blocksTrack；roomJammed = 同一判定的純資料版 (不在場的房，ChapterSpec.jammed)
import type { Mechanic } from '../core/registry';
import type { Box, ItemId, LevelDef, ObjDef, ObjState, World } from '../core/types';
import type { ChapterState } from '../core/chapter';
import { objBox, overlaps } from '../core/geometry';
import { solidsFor } from '../core/presence';
import { resolvePlayerOverlap } from '../core/place';

declare module '../core/types' {
  interface ObjBase {
    /** 卡榫物件 (P3；樹根、巨盆)：此刻的有效盒伸出房間範圍 = 這間房卡住 (放大前的卡牆檢查不查出界) */
    jam?: boolean;
    /** 沒有尺度卡時的重量 (天平；預設 2 = 原尺寸) */
    weight?: number;
  }
}

/** 尺度卡 → 縮放倍率 (規格 N23：×1.5 / ×0.5；以底部中心) */
export const SCALE_CARDS: Readonly<Record<ItemId, number>> = { 'card.da': 1.5, 'card.xiao': 0.5 };
/** 尺度卡的卡面字 (文字 key) */
export const SCALE_GLYPHS: Readonly<Record<ItemId, string>> = { 'card.da': 'term.glyph.da', 'card.xiao': 'term.glyph.xiao' };
/** 原尺寸的重量 (一個原尺寸木箱 = 2，同 mechanics/plates CRATE_WEIGHT) */
export const BASE_WEIGHT = 2;
/** 倍率 → 重量 */
const WEIGHT_OF: ReadonlyArray<[number, number]> = [[1.5, 3], [1, 2], [0.5, 1]];

/** 標籤上貼著的尺度卡 (沒有 = null)；labels = 標籤 id → 卡 (World.ext.labels 或 ChapterState.labels) */
export function scaleCardOn(def: ObjDef, labels: Readonly<Record<string, readonly string[]>> | undefined): ItemId | null {
  const l = def.label;
  if (!l?.scale) return null;
  return (labels?.[l.id] ?? []).find(c => c in SCALE_CARDS) ?? null;
}

/** 物件此刻的縮放倍率 (沒有方槽 / 沒貼尺度卡 = 1) */
export const scaleFactor = (def: ObjDef, labels: Readonly<Record<string, readonly string[]>> | undefined): number => {
  const c = scaleCardOn(def, labels);
  return c ? SCALE_CARDS[c] : 1;
};

/** 物件在關卡資料裡的原尺寸 (縮放前；跨房來的物件也在 level.objects 裡) */
export const baseDef = (w: World, o: ObjState): ObjDef => w.level.objects.find(d => d.id === o.def.id) ?? o.def;

/** 以底部中心縮放後的盒 (x、z = 中心，y = 底) */
function scaledBox(x: number, y: number, z: number, base: ObjDef, f: number): Box {
  const hw = (base.w * f) / 2, hd = (base.d * f) / 2;
  return { min: [x - hw, y, z - hd], max: [x + hw, y + base.h * f, z + hd] };
}

const EPS = 1e-6;
/** 盒子伸出房間範圍 (x、z) */
export const outOfBounds = (b: Box, bounds: LevelDef['bounds']): boolean =>
  b.min[0] < bounds.minX - EPS || b.max[0] > bounds.maxX + EPS || b.min[2] < bounds.minZ - EPS || b.max[2] > bounds.maxZ + EPS;

/** 物件此刻的重量 (天平；規格 N23：大 3 / 原 2 / 小 1) */
export function weightOf(w: World, o: ObjState): number {
  const f = scaleFactor(o.def, w.ext.labels);
  if (f === 1) return o.def.weight ?? BASE_WEIGHT;
  return WEIGHT_OF.find(([k]) => Math.abs(k - f) < 1e-6)?.[1] ?? BASE_WEIGHT;
}

/**
 * 把這個物件改成倍率 f 放不放得下 (只查「變大」：縮小一律允許)：新盒與兩模式的任一實體 (自己以外) 重疊、或伸出房間範圍 → 放不下。
 * 卡榫物件不查出界 (它本來就伸出房間，規格「第三章共用規則」量)
 */
export function canResize(w: World, o: ObjState, f: number): boolean {
  const base = baseDef(w, o);
  const cur = o.def.w / base.w;
  if (f <= cur + 1e-6) return true;
  const box = scaledBox(o.x, o.y, o.z, base, f);
  if (!o.def.jam && outOfBounds(box, w.level.bounds)) return false;
  for (const mode of ['3d', '2d'] as const) {
    if (solidsFor(w, mode).some(s => s !== o && overlaps(box, objBox(s), mode))) return false;
  }
  return true;
}

/** 依此刻的標籤重算每個可量物件的尺寸 (改寫 ObjState.def；沒變的不動)；回傳是否有物件變了 */
export function applyScale(w: World): boolean {
  let changed = false;
  for (const o of w.objs) {
    if (!o.def.label?.scale) continue;
    const base = baseDef(w, o);
    const f = scaleFactor(o.def, w.ext.labels);
    const size = { w: base.w * f, h: base.h * f, d: base.d * f };
    if (Math.abs(o.def.w - size.w) < 1e-9 && Math.abs(o.def.h - size.h) < 1e-9 && Math.abs(o.def.d - size.d) < 1e-9) continue;
    o.def = { ...o.def, ...size };
    changed = true;
  }
  return changed;
}

/** 尺寸改了之後：重算 + 玩家若被壓到 (例：取下「小」、物件長回原尺寸) 挪到最近空位 */
export function rescale(w: World): void {
  if (applyScale(w)) resolvePlayerOverlap(w);
}

/** 卡榫物件此刻的有效盒伸出房間 (以標籤算，不依賴 def 是否已重算) */
function jamOut(level: LevelDef, def: ObjDef, x: number, y: number, z: number, labels: Readonly<Record<string, readonly string[]>> | undefined): boolean {
  if (!def.jam) return false;
  const base = level.objects.find(d => d.id === def.id) ?? def;
  return outOfBounds(scaledBox(x, y, z, base, scaleFactor(def, labels)), level.bounds);
}

/** 這間房 (即時 World) 此刻有沒有卡榫物件伸進軌道 */
export const worldJammed = (w: World): boolean =>
  w.objs.some(o => !o.gone && jamOut(w.level, o.def, o.x, o.y, o.z, w.ext.labels));

/** 不在場的房：依關卡資料 + 章節標籤判定 (卡榫物件不會被推動，位置取關卡資料) */
export const roomJammed = (level: LevelDef, labels: Readonly<Record<string, readonly string[]>>): boolean =>
  level.objects.some(d => jamOut(level, d, d.x, d.y, d.z, labels));

/** ChapterSpec.jammed 的實作 (app 注入；rooms = 本章房間 id → 關卡) */
export const jamQuery = (rooms: Readonly<Record<string, LevelDef>>) => (room: string, state: ChapterState): boolean => {
  const level = rooms[room];
  return !!level && roomJammed(level, state.labels);
};

export const scale: Mechanic = {
  id: 'scale',
  // 每步依標籤重算尺寸 (進房、讀檔、R 之後的第一步就對了；標籤只能在這間房改，改的那一刻 labels 另外立即重算)
  beforePhysics: w => { rescale(w); },
  blocksTrack: worldJammed
};
