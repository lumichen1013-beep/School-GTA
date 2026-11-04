// N23 尺度三檔 (量；規格 6「第三章共用規則」量、「3-1 苗圃（細化）」；architecture 4.18、7.4.7)
// - 尺度卡「大」card.da / 「小」card.xiao 貼在名詞標籤的方槽 (label.scale)；貼卡的流程在 mechanics/labels (先問 canResize，成功後 applyScale)
// - 縮放 = 標籤的函式：以底部中心改寫 ObjState.def 的 w / h / d (原值 = World.level.objects 的同 id 定義)；每步 beforePhysics 依標籤重算，
//   所以讀檔 / 換房 / R 都不必另存縮放狀態 (核心的 objBox 不必改)
// - 重量：大 3 / 原 2 / 小 1 (沒有標籤 = 物件資料的 weight 或 2)；天平 (mechanics/balance) 讀它
// - 卡榫 (P3)：jam 物件此刻的有效盒伸出房間範圍 → blocksTrack；roomJammed = 同一判定的純資料版 (不在場的房，ChapterSpec.jammed)
// - v0.4 3-3：stayShrunk (used 之後以「小」計：3-1b 之後的樹根縮回土裡)、pushTo (used = 被推過：位置與卡榫照推過的位置；巨盆)、
//   protrude (只從那扇門越界：放大時那扇門要拱門對拱門接著別的房；越界的那一截由章節層寫入隔壁房的 ext.protrude，
//   這裡每步生成 / 移除推導實體 protrudeStep；ext.protrude 非空 = 這一房也卡住)
import type { Mechanic } from '../core/registry';
import type { Box, ItemId, LevelDef, ObjDef, ObjId, ObjState, World } from '../core/types';
import type { ChapterState } from '../core/chapter';
import { links, type CubeDef, type CubeState, type DoorInfo, type Side } from '../core/cube';
import { objBox, overlaps } from '../core/geometry';
import { solidsFor } from '../core/presence';
import { resolvePlayerOverlap } from '../core/place';

declare module '../core/types' {
  interface ObjBase {
    /** 卡榫物件 (P3；樹根、巨盆)：此刻的有效盒伸出房間範圍 = 這間房卡住 (放大前的卡牆檢查不查出界) */
    jam?: boolean;
    /** 沒有尺度卡時的重量 (天平；預設 2 = 原尺寸) */
    weight?: number;
    /** v0.4 used 之後一直以「小」計 (不論標籤上有沒有卡；3-1b 之後的樹根「縮回土裡」) */
    stayShrunk?: boolean;
    /** v0.4 used = 被推過：位置改為 [x, z] (巨盆；不在場的房讀快照的 used) */
    pushTo?: readonly [number, number];
    /** v0.4 跨房伸出 (3-3c)：這個卡榫物件放大時只能從這扇門 (cubeDoor id) 越界，而且那扇門此刻要拱門對拱門接著別的房 */
    protrude?: ObjId;
  }
  interface ObjKinds {
    /** 推導實體：隔壁房伸過來的那一截 (source = 原物件 id、from = 原房；ext.protrude 生成，不在關卡資料) */
    protrudeStep: { source: ObjId; from: string };
  }
  interface WorldExt {
    /** v0.4 3-3c 伸進這一房的東西 (章節層寫入；box = 這一房的本地座標) */
    protrude?: ReadonlyArray<{ id: ObjId; from: string; box: Box }>;
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

/** 此刻的有效倍率 (stayShrunk 的物件 used 之後最多「小」) */
export const effectiveFactor = (def: ObjDef, labels: Readonly<Record<string, readonly string[]>> | undefined, used: boolean): number => {
  const f = scaleFactor(def, labels);
  return def.stayShrunk && used ? Math.min(f, SCALE_CARDS['card.xiao']) : f;
};

/** 物件此刻的位置 (pushTo：used = 被推過) */
export const placeOf = (def: ObjDef, x: number, y: number, z: number, used: boolean): { x: number; y: number; z: number } =>
  def.pushTo && used ? { x: def.pushTo[0], y, z: def.pushTo[1] } : { x, y, z };

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

/** 一個物件定義在這組標籤下的重量 (天平；規格 N23：大 3 / 原 2 / 小 1；沒有標籤 = weight 或 2)；跨房天平也用它 */
export function defWeight(def: ObjDef, labels: Readonly<Record<string, readonly string[]>> | undefined): number {
  const f = scaleFactor(def, labels);
  if (f === 1) return def.weight ?? BASE_WEIGHT;
  return WEIGHT_OF.find(([k]) => Math.abs(k - f) < 1e-6)?.[1] ?? BASE_WEIGHT;
}

/** 物件此刻的重量 */
export const weightOf = (w: World, o: ObjState): number => defWeight(o.def, w.ext.labels);

/**
 * 把這個物件改成倍率 f 放不放得下 (只查「變大」：縮小一律允許)：新盒與兩模式的任一實體 (自己以外) 重疊、或伸出房間範圍 → 放不下。
 * 卡榫物件不查出界 (它本來就伸出房間，規格「第三章共用規則」量)
 */
export function canResize(w: World, o: ObjState, f: number): boolean {
  const base = baseDef(w, o);
  const cur = o.def.w / base.w;
  if (f <= cur + 1e-6) return true;
  const box = scaledBox(o.x, o.y, o.z, base, f);
  if (o.def.protrude) { if (outOfBounds(box, w.level.bounds) && !protrudeOk(w, o.def.protrude, box)) return false; }
  else if (!o.def.jam && outOfBounds(box, w.level.bounds)) return false;
  for (const mode of ['3d', '2d'] as const) {
    if (solidsFor(w, mode).some(s => s !== o && overlaps(box, objBox(s), mode))) return false;
  }
  return true;
}

/** 越界的那一側 (只越過一側；沒越界 / 越過多側 = null) */
function outSide(b: Box, bounds: LevelDef['bounds']): Side | null {
  const sides: Side[] = [];
  if (b.min[2] < bounds.minZ - EPS) sides.push('N');
  if (b.max[2] > bounds.maxZ + EPS) sides.push('S');
  if (b.max[0] > bounds.maxX + EPS) sides.push('E');
  if (b.min[0] < bounds.minX - EPS) sides.push('W');
  return sides.length === 1 ? sides[0] : null;
}

/** 放大的盒子只從 door 那一側越界、而且那扇門此刻拱門對拱門接著別的房 (ext.cube.links) */
function protrudeOk(w: World, door: ObjId, box: Box): boolean {
  const d = w.byId.get(door);
  const link = w.ext.cube?.links[door];
  return !!d && d.def.type === 'cubeDoor' && outSide(box, w.level.bounds) === d.def.side && link?.to === 'room' && link.kind === 'arch';
}

/** 依此刻的標籤重算每個可量物件的尺寸 (改寫 ObjState.def；沒變的不動)；回傳是否有物件變了 */
export function applyScale(w: World): boolean {
  let changed = false;
  for (const o of w.objs) {
    if (o.def.pushTo) { const p = placeOf(baseDef(w, o), o.x, o.y, o.z, o.used); o.x = p.x; o.z = p.z; }
    if (!o.def.label?.scale) continue;
    const base = baseDef(w, o);
    const f = effectiveFactor(o.def, w.ext.labels, o.used);
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

type Labels = Readonly<Record<string, readonly string[]>>;

/** 卡榫物件此刻的有效盒 (以標籤 / used 算，不依賴 def 是否已重算；不是卡榫物件 = null) */
function jamBox(level: LevelDef, def: ObjDef, x: number, y: number, z: number, labels: Labels | undefined, used: boolean): Box | null {
  if (!def.jam) return null;
  const base = level.objects.find(d => d.id === def.id) ?? def;
  const p = placeOf(base, x, y, z, used);
  return scaledBox(p.x, p.y, p.z, base, effectiveFactor(def, labels, used));
}
const jamOut = (level: LevelDef, def: ObjDef, x: number, y: number, z: number, labels: Labels | undefined, used: boolean): boolean => {
  const b = jamBox(level, def, x, y, z, labels, used);
  return !!b && outOfBounds(b, level.bounds);
};

/** 這間房 (即時 World) 此刻有沒有卡榫物件伸進軌道 (含隔壁房伸過來的：ext.protrude) */
export const worldJammed = (w: World): boolean =>
  (w.ext.protrude?.length ?? 0) > 0 || w.objs.some(o => !o.gone && jamOut(w.level, o.def, o.x, o.y, o.z, w.ext.labels, o.used));

/** 快照裡 used 的物件 (不在場的房；沒有快照 = 全部關卡初值) */
const usedIn = (state: ChapterState, room: string): ReadonlySet<ObjId> => new Set((state.rooms[room]?.objs ?? []).filter(o => o.used).map(o => o.id));

/** 不在場的房：依關卡資料 + 章節標籤 + 快照的 used 判定 (卡榫物件不會被推動，位置取關卡資料 / pushTo) */
export const roomJammed = (level: LevelDef, labels: Labels, used: ReadonlySet<ObjId> = new Set()): boolean =>
  level.objects.some(d => jamOut(level, d, d.x, d.y, d.z, labels, used.has(d.id)));

/** 本章的靜態資料 (跨房查詢用：房間、魔方、門位) */
export interface CrossRooms { rooms: Readonly<Record<string, LevelDef>>; cube: CubeDef | null; doors: readonly DoorInfo[] }

/** 一扇門的位置與門位 (關卡資料) */
const doorOf = (c: CrossRooms, room: string, door: ObjId): { o: ObjDef; side: Side } | null => {
  const o = c.rooms[room]?.objects.find(d => d.id === door);
  const di = c.doors.find(d => d.room === room && d.door === door);
  return o && di ? { o, side: di.side } : null;
};

/**
 * 伸進 room 的東西 (3-3c)：此刻以拱門對拱門接到 room 的每一扇門，對面房那扇門的 protrude 物件此刻越過那一側的那一截，
 * 換成 room 的本地座標 (沿門的橫向偏移不變、深度從 room 那扇門的牆面往內量；第三章沒有朝向)
 */
export function protrusionsInto(c: CrossRooms, room: string, cube: CubeState, labels: Labels, used: (room: string) => ReadonlySet<ObjId>): Array<{ id: ObjId; from: string; box: Box }> {
  if (!c.cube) return [];
  const out: Array<{ id: ObjId; from: string; box: Box }> = [];
  for (const l of links(c.cube, cube, c.doors)) {
    if (!('room' in l.to) || l.to.room !== room || l.kind !== 'arch') continue;
    const from = l.from.room, src = doorOf(c, from, l.from.door), dst = doorOf(c, room, l.to.door);
    const level = c.rooms[from], target = c.rooms[room];
    if (!src || !dst || !level || !target) continue;
    for (const d of level.objects) {
      if (d.protrude !== l.from.door) continue;
      const b = jamBox(level, d, d.x, d.y, d.z, labels, used(from).has(d.id));
      if (!b || outSide(b, level.bounds) !== src.side) continue;
      const lb = level.bounds, tb = target.bounds;
      const depth = src.side === 'N' ? lb.minZ - b.min[2] : src.side === 'S' ? b.max[2] - lb.maxZ : src.side === 'E' ? b.max[0] - lb.maxX : lb.minX - b.min[0];
      const along = src.side === 'N' || src.side === 'S';
      const lo = along ? b.min[0] - src.o.x + dst.o.x : b.min[2] - src.o.z + dst.o.z;
      const hi = along ? b.max[0] - src.o.x + dst.o.x : b.max[2] - src.o.z + dst.o.z;
      const [n0, n1] = dst.side === 'N' ? [tb.minZ, tb.minZ + depth] : dst.side === 'S' ? [tb.maxZ - depth, tb.maxZ] : dst.side === 'E' ? [tb.maxX - depth, tb.maxX] : [tb.minX, tb.minX + depth];
      const box: Box = along ? { min: [lo, b.min[1], n0], max: [hi, b.max[1], n1] } : { min: [n0, b.min[1], lo], max: [n1, b.max[1], hi] };
      out.push({ id: `protrude:${d.id}`, from, box });
    }
  }
  return out;
}

/** ChapterSpec.jammed 的實作 (app 注入)：這一房自己的卡榫物件，或隔壁房此刻伸進來的東西 */
export const jamQuery = (c: CrossRooms | Readonly<Record<string, LevelDef>>) => (room: string, state: ChapterState): boolean => {
  const cr: CrossRooms = 'rooms' in c && 'doors' in c ? c as CrossRooms : { rooms: c as Readonly<Record<string, LevelDef>>, cube: null, doors: [] };
  const level = cr.rooms[room];
  if (!level) return false;
  if (roomJammed(level, state.labels, usedIn(state, room))) return true;
  return !!state.cube && protrusionsInto(cr, room, state.cube, state.labels, r => usedIn(state, r)).length > 0;
};

/** 依 ext.protrude 生成 / 移除推導實體 (伸過來的那一截：實體、兩個視角、可踩) */
function syncProtrude(w: World): void {
  const want = w.ext.protrude ?? [];
  const ids = new Set(want.map(p => p.id));
  const stale = w.objs.filter(o => o.def.type === 'protrudeStep' && !ids.has(o.def.id));
  for (const o of stale) { w.objs.splice(w.objs.indexOf(o), 1); w.byId.delete(o.def.id); }
  let added = false;
  for (const p of want) {
    const [x0, y0, z0] = p.box.min, [x1, y1, z1] = p.box.max;
    const geo = { x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, d: z1 - z0 };
    const cur = w.byId.get(p.id);
    if (cur) { if (cur.def.w !== geo.w || cur.def.d !== geo.d || cur.def.h !== geo.h) { cur.def = { ...cur.def, ...geo }; cur.x = geo.x; cur.y = geo.y; cur.z = geo.z; } continue; }
    const def: ObjDef = { id: p.id, type: 'protrudeStep', source: p.id.slice('protrude:'.length), from: p.from, ...geo, visible: 'both', solid: true, derived: true };
    const o: ObjState = { def, x: geo.x, y: geo.y, z: geo.z, gone: false, used: false, touched: false };
    w.objs.push(o); w.byId.set(def.id, o); added = true;
  }
  if (added) resolvePlayerOverlap(w);
}

export const scale: Mechanic = {
  id: 'scale',
  types: { protrudeStep: {} },
  // 每步依標籤重算尺寸 (進房、讀檔、R 之後的第一步就對了；標籤只能在這間房改，改的那一刻 labels 另外立即重算)；伸過來的那一截
  beforePhysics: w => { rescale(w); syncProtrude(w); },
  blocksTrack: worldJammed
};
