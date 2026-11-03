// 章節層級狀態 (v0.3；規格 5.4、architecture 4.16)：ChapterSession = 魔方狀態 + 各房快照 + 當前房間的 World。
// 純資料 + 純函式 (World 本身照舊就地修改)；不 import mechanics (建 World 時由呼叫方傳入機制表，比照 createWorld)
import type { DoorLinkState, LevelDef, ObjId, World } from './types';
import { createWorld, type WorldOptions } from './world';
import { applyOp, initialCube, isBlocked, links, type CubeBlock, type CubeDef, type CubeOp, type CubeState, type DoorInfo, type Side } from './cube';
import { clamp, objBox, overlaps } from './geometry';
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
  flags: string[];
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

/** 進門後站的位置：門內側 0.9 (依門位往房內退) */
const SPAWN_IN = 0.9;

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
  return { chapter: spec.chapter, cube: spec.cube ? initialCube(spec.cube) : null, room, door, rooms: {}, items: {}, flags: [] };
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

function writeExt(spec: ChapterSpec, state: ChapterState, w: World): void {
  w.ext = spec.cube && state.cube ? { ...w.ext, cube: { links: roomLinks(spec, state) } } : w.ext;
}

/** 依狀態建出當前房間：關卡初值 → 房間快照 → 章節道具 → 門的接法；從門進來時重生點 = 門內側 */
function loadRoom(spec: ChapterSpec, state: ChapterState, opts: WorldOptions): World {
  const level = spec.rooms[state.room];
  if (!level) throw new Error(`chapter ${spec.chapter} has no room "${state.room}"`);
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
  writeExt(spec, next, world);
  return { ...cs, state: next };
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
