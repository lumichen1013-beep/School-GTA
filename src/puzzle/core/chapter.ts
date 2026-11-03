// 章節層級狀態 (v0.3；規格 5.4、architecture 4.16)：ChapterSession = 魔方狀態 + 各房快照 + 當前房間的 World。
// 純資料 + 純函式 (World 本身照舊就地修改)；不 import mechanics (建 World 時由呼叫方傳入機制表，比照 createWorld)
import type { Box, DoorLinkState, LevelDef, ObjDef, ObjId, World } from './types';
import { createWorld, type WorldOptions } from './world';
import { applyOp, initialCube, isBlocked, links, type CubeBlock, type CubeDef, type CubeOp, type CubeState, type DoorInfo, type Side } from './cube';
import { clamp, objBox, overlaps } from './geometry';
import { solidsFor } from './presence';
import { PLAYER_HW } from './constants';
import { resolvePlayerOverlap } from './place';

/** 一件物件的可變狀態 (定義不存；以 id 對回 LevelDef) */
export interface ObjSnapshot { id: ObjId; x: number; y: number; z: number; gone: boolean; used: boolean; touched: boolean }
/** 房間快照：離開房間時保存、回來時復原 (只列出的物件被覆寫，其餘維持關卡初值) */
export interface RoomSnapshot { objs: ObjSnapshot[]; flags: string[] }

/** 一章的靜態資料：魔方 (單房關卡 = null)、房間 id → 關卡、所有房間的門位 */
export interface ChapterSpec {
  chapter: number;
  cube: CubeDef | null;
  rooms: Readonly<Record<string, LevelDef>>;
  doors: readonly DoorInfo[];
}

/** 章節狀態 (可 JSON 序列化；SaveV3 的 chapters[n] 由此而來) */
export interface ChapterState {
  chapter: number;
  cube: CubeState | null;
  /** 玩家所在房、從哪扇門進來 (null = 關卡起點) */
  room: string;
  door: ObjId | null;
  /** 房間快照 (離開時寫入；當前房間的是進房時的樣子) */
  rooms: Record<string, RoomSnapshot>;
  /** 章節道具 (跟著玩家跨房；進房時寫入 World.inv) */
  items: Record<string, number>;
  /**
   * 章節旗標：目前只有演出過的驚嚇 (scare:*；規格 9.1 每章 ≤ 1 次)。由 noteFlag 寫入時同時寫進 entry，
   * 所以 R 不會讓驚嚇重演 (旗標不影響任何謎題邏輯)
   */
  flags: string[];
  /** 標籤 id → 貼著的字卡 (v0.3 N22；進房時寫入 World.ext.labels，離房 / 存檔時收回) */
  labels: Record<string, string[]>;
  /**
   * 跨房物件 (拱門，規格 5.4.6)：不在原房間的物件 → 目前所在房與進該房時的位置 (= 該房 T 物歸原處的位置)；
   * 回到原房間時移除 (位置由該房快照決定)
   */
  moved: Record<ObjId, { room: string; x: number; y: number; z: number }>;
}

export interface ChapterSession {
  readonly spec: ChapterSpec;
  readonly state: ChapterState;
  /** R 用的「本次進房時」快照 (含當前房間的進房快照與當時的魔方排列) */
  readonly entry: ChapterState;
  /** 當前房間 */
  readonly world: World;
}

/** 轉不動的原因：魔方本身 (notEmpty / outOfCube / noRoom)、本章沒有魔方、不是轉自己所在的房、門口有東西卡著 */
export type TurnBlock = CubeBlock | 'noCube' | 'notHere' | 'doorway';
/** 推不過拱門的原因：這扇門此刻不是拱門對拱門 (門 / 牆 / 屋框)、對面拱門內側被占住 (或沒有地板) */
export type TransferBlock = 'notArch' | 'occupied';

/** 進門後站的位置：門內側 0.9 (依門位往房內退) */
const SPAWN_IN = 0.9;
/** 推過拱門的物件出現在對面拱門內側：門內緣到物件近緣 1.3 (讓出進門的站位：0.9 + 玩家半寬 0.3 + 0.1) */
const ARRIVE_GAP = 1.3;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function snapshotRoom(w: World): RoomSnapshot {
  return { objs: w.objs.map(o => ({ id: o.def.id, x: o.x, y: o.y, z: o.z, gone: o.gone, used: o.used, touched: o.touched })), flags: [] };
}

/** 把快照寫回世界 (快照裡不存在於關卡的 id 忽略) */
export function restoreRoom(w: World, snap: RoomSnapshot): void {
  for (const s of snap.objs) {
    const o = w.byId.get(s.id);
    if (!o) continue;
    o.x = s.x; o.y = s.y; o.z = s.z; o.gone = s.gone; o.used = s.used; o.touched = s.touched;
  }
}

/** 本章開始時的狀態 (魔方 S0、沒有快照與道具) */
export function newChapterState(spec: ChapterSpec, room: string, door: ObjId | null): ChapterState {
  return { chapter: spec.chapter, cube: spec.cube ? initialCube(spec.cube) : null, room, door, rooms: {}, items: {}, flags: [], labels: {}, moved: {} };
}

/** 門內側的進房位置 (門位決定往哪邊退；夾在房間範圍內) */
export function doorSpawn(level: LevelDef, door: ObjId, side: Side): { x: number; y: number; z: number } {
  const o = level.objects.find(d => d.id === door);
  if (!o) return level.start;
  const b = level.bounds;
  let { x, z } = o;
  if (side === 'N') z = o.z + o.d / 2 + SPAWN_IN;
  else if (side === 'S') z = o.z - o.d / 2 - SPAWN_IN;
  else if (side === 'E') x = o.x - o.w / 2 - SPAWN_IN;
  else if (side === 'W') x = o.x + o.w / 2 + SPAWN_IN;
  return { x: clamp(x, b.minX + PLAYER_HW, b.maxX - PLAYER_HW), y: o.y, z: clamp(z, b.minZ + PLAYER_HW, b.maxZ - PLAYER_HW) };
}

/** 當前房間每扇門此刻的接法 (寫入 World.ext.cube；沒接通 = wall) */
export function roomLinks(spec: ChapterSpec, state: ChapterState): Record<ObjId, DoorLinkState> {
  const out: Record<ObjId, DoorLinkState> = {};
  const mine = spec.doors.filter(d => d.room === state.room);
  for (const d of mine) out[d.door] = { to: 'wall' };
  if (!spec.cube || !state.cube) return out;
  for (const l of links(spec.cube, state.cube, spec.doors)) {
    if (l.from.room !== state.room) continue;
    out[l.from.door] = 'frame' in l.to ? { to: 'frame', frame: l.to.frame } : { to: 'room', room: l.to.room, door: l.to.door, kind: l.kind };
  }
  return out;
}

/** 轉動後只更新門的接法 (標籤 / 旗標是 World 的即時狀態，不覆寫) */
function writeLinks(spec: ChapterSpec, state: ChapterState, w: World): void {
  if (spec.cube && state.cube) w.ext = { ...w.ext, cube: { links: roomLinks(spec, state) } };
}

/** 進房時寫入 World.ext：門的接法、標籤、旗標 (單房關卡不寫，ext 維持空物件) */
function writeExt(spec: ChapterSpec, state: ChapterState, w: World): void {
  if (!spec.cube || !state.cube) return;
  w.ext = { ...w.ext, cube: { links: roomLinks(spec, state) }, labels: clone(state.labels), flags: [...state.flags] };
}

/** 物件原本屬於哪間房 (第一個在關卡資料裡列出它的房間) */
export function originRoom(spec: ChapterSpec, obj: ObjId): string | undefined {
  return Object.keys(spec.rooms).find(r => spec.rooms[r].objects.some(o => o.id === obj));
}

/** 房間此刻的物件定義：關卡物件扣掉跨房離開的，加上跨房來的 (定義取自原房間，初值 = 進該房時的位置) */
export function roomObjects(spec: ChapterSpec, state: ChapterState, room: string): ObjDef[] {
  const moved = state.moved;
  const own = spec.rooms[room].objects.filter(o => !(o.id in moved));
  const visitors: ObjDef[] = [];
  for (const [id, m] of Object.entries(moved)) {
    if (m.room !== room) continue;
    const from = originRoom(spec, id);
    const def = from === undefined ? undefined : spec.rooms[from].objects.find(o => o.id === id);
    if (def) visitors.push({ ...def, x: m.x, y: m.y, z: m.z });
  }
  return visitors.length || own.length !== spec.rooms[room].objects.length ? [...own, ...visitors] : spec.rooms[room].objects;
}

/** 依狀態建出當前房間：關卡初值 (含跨房物件) → 房間快照 → 章節道具 → 門的接法 / 標籤 / 旗標；從門進來時重生點 = 門內側 */
function loadRoom(spec: ChapterSpec, state: ChapterState, opts: WorldOptions): World {
  const base = spec.rooms[state.room];
  if (!base) throw new Error(`chapter ${spec.chapter} has no room "${state.room}"`);
  const objects = roomObjects(spec, state, state.room);
  const level = objects === base.objects ? base : { ...base, objects };
  const di = state.door === null ? undefined : spec.doors.find(d => d.room === state.room && d.door === state.door);
  const w = createWorld(di ? { ...level, start: doorSpawn(level, di.door, di.side) } : level, opts);
  const snap = state.rooms[state.room];
  if (snap) restoreRoom(w, snap);
  w.inv = { ...state.items };
  writeExt(spec, state, w);
  if (snap || di) resolvePlayerOverlap(w);
  return w;
}

/** 目前完整的章節狀態 (當前房間取即時快照、道具取 World.inv；深拷貝) */
export function captureState(cs: ChapterSession): ChapterState {
  const s = clone(cs.state);
  s.rooms[s.room] = snapshotRoom(cs.world);
  s.items = { ...cs.world.inv };
  if (cs.spec.cube) s.labels = clone(cs.world.ext.labels ?? {});
  return s;
}

/** 依狀態開一章 (新章或讀檔)：建出所在房間，記下進房快照 */
export function openChapter(spec: ChapterSpec, state: ChapterState, opts: WorldOptions): ChapterSession {
  const st = clone(state);
  const world = loadRoom(spec, st, opts);
  const cs: ChapterSession = { spec, state: st, entry: st, world };
  return { ...cs, entry: captureState(cs) };
}

/** 換房：存當前房快照 → 載入 / 復原目標房 (玩家站在 door 內側) → 記進房快照 */
export function enterRoom(cs: ChapterSession, room: string, door: ObjId | null, opts: WorldOptions): ChapterSession {
  return openChapter(cs.spec, { ...captureState(cs), room, door }, opts);
}

/**
 * 轉動 (「轉自己」原則：只能轉玩家所在的房間)：先查門口有沒有可推物卡著 → applyOp → 重算當前房間的連接表。
 * 玩家與房內物件跟著房間走，本地座標不變，所以 World 只更新 ext；回傳新 session 或轉不動的原因
 */
export function turn(cs: ChapterSession, op: CubeOp): ChapterSession | { blocked: TurnBlock } {
  const { spec, state, world } = cs;
  if (!spec.cube || !state.cube) return { blocked: 'noCube' };
  if (op.room !== state.room) return { blocked: 'notHere' };
  const doorObjs = spec.doors.filter(d => d.room === state.room).map(d => world.byId.get(d.door)).filter((o): o is NonNullable<typeof o> => o !== undefined);
  const stuck = world.objs.some(o => o.def.pushable && !o.gone && doorObjs.some(d => overlaps(objBox(o), objBox(d), '3d')));
  if (stuck) return { blocked: 'doorway' };
  const r = applyOp(spec.cube, state.cube, op);
  if (isBlocked(r)) return r;
  const next = { ...state, cube: r };
  writeLinks(spec, next, world);
  return { ...cs, state: next };
}

/**
 * 拱門跨房 (規格 5.4.6)：可推物被推進「拱門對拱門」接通的拱門 → 移到鄰房，出現在對面拱門內側
 * (沿門的橫向保持偏移，夾在門寬內)；那裡被占住或沒有地板 → 推不過去。
 * 當前 World 就地移除該物件 (玩家留在原房，跟著走才換房)；目標房的快照寫入物件位置。R 仍回到本次進房時 (entry 不變)
 */
export function transferObject(cs: ChapterSession, obj: ObjId, door: ObjId, opts: WorldOptions): ChapterSession | { blocked: TransferBlock } {
  const { spec, state, world } = cs;
  const o = world.byId.get(obj);
  const src = world.byId.get(door);
  const link = roomLinks(spec, state)[door];
  if (!o || !src || !link || link.to !== 'room' || link.kind !== 'arch') return { blocked: 'notArch' };
  const target = spec.rooms[link.room];
  const dst = target?.objects.find(d => d.id === link.door);
  const di = spec.doors.find(d => d.room === link.room && d.door === link.door);
  if (!dst || !di) return { blocked: 'notArch' };
  const along = di.side === 'N' || di.side === 'S';
  const half = (along ? dst.w : dst.d) / 2;
  const lateral = clamp(along ? o.x - src.x : o.z - src.z, -half, half);
  const reach = ARRIVE_GAP + (along ? o.def.d : o.def.w) / 2;
  const b = target.bounds;
  const pos = { x: dst.x, y: o.y, z: dst.z };
  if (along) { pos.x = clamp(dst.x + lateral, b.minX + o.def.w / 2, b.maxX - o.def.w / 2); pos.z = di.side === 'S' ? dst.z - dst.d / 2 - reach : dst.z + dst.d / 2 + reach; }
  else { pos.z = clamp(dst.z + lateral, b.minZ + o.def.d / 2, b.maxZ - o.def.d / 2); pos.x = di.side === 'E' ? dst.x - dst.w / 2 - reach : dst.x + dst.w / 2 + reach; }
  // 目標房此刻的樣子 (快照 + 跨房物件) 裡，到達處要空著、底下要有地板
  const next = clone(state);
  next.room = link.room;
  next.door = null;
  const probe = loadRoom(spec, next, opts);
  const box: Box = { min: [pos.x - o.def.w / 2, pos.y, pos.z - o.def.d / 2], max: [pos.x + o.def.w / 2, pos.y + o.def.h, pos.z + o.def.d / 2] };
  const solids = solidsFor(probe, '3d').filter(s => s.def.id !== obj);
  const blocked = solids.some(s => overlaps(objBox(s), box, '3d'));
  const floor = solids.some(s => { const sb = objBox(s); return Math.abs(sb.max[1] - pos.y) < 0.02 && pos.x >= sb.min[0] && pos.x <= sb.max[0] && pos.z >= sb.min[2] && pos.z <= sb.max[2]; });
  if (blocked || !floor) return { blocked: 'occupied' };
  const out = clone(state);
  if (originRoom(spec, obj) === link.room) delete out.moved[obj];
  else out.moved[obj] = { room: link.room, ...pos };
  const snap = out.rooms[link.room] ?? { objs: [], flags: [] };
  snap.objs = [...snap.objs.filter(s => s.id !== obj), { id: obj, ...pos, gone: false, used: false, touched: false }];
  out.rooms[link.room] = snap;
  const cur = out.rooms[state.room];
  if (cur) cur.objs = cur.objs.filter(s => s.id !== obj);
  world.objs.splice(world.objs.indexOf(o), 1);
  world.byId.delete(obj);
  return { ...cs, state: out };
}

/** 記下章節旗標 (目前 = 演出過的驚嚇)：同時寫進 entry，R 不還原 (見 ChapterState.flags) */
export function noteFlag(cs: ChapterSession, flag: string): ChapterSession {
  if (cs.state.flags.includes(flag)) return cs;
  const add = (s: ChapterState): ChapterState => ({ ...s, flags: [...s.flags, flag] });
  cs.world.ext = { ...cs.world.ext, flags: [...(cs.world.ext.flags ?? []), flag] };
  return { ...cs, state: add(cs.state), entry: add(cs.entry) };
}

/** R 重進房間：整個章節狀態 (含魔方排列) 回到本次進房時 (規格 5.4.8 退路語意) */
export function restartRoom(cs: ChapterSession, opts: WorldOptions): ChapterSession {
  const state = clone(cs.entry);
  return { spec: cs.spec, state, entry: cs.entry, world: loadRoom(cs.spec, state, opts) };
}

/** 單房關卡 (不在魔方上)：一間房、沒有門位；行為同 createWorld */
export function singleRoomSpec(level: LevelDef): ChapterSpec {
  return { chapter: 0, cube: null, rooms: { [level.id]: level }, doors: [] };
}
