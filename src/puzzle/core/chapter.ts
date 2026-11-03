// 章節層級狀態 (v0.3；規格 5.4、architecture 4.16)：ChapterSession = 魔方狀態 + 各房快照 + 當前房間的 World。
// 純資料 + 純函式 (World 本身照舊就地修改)；不 import mechanics (建 World 時由呼叫方傳入機制表，比照 createWorld)
import type { Box, DoorLinkState, GameEvent, LevelDef, ObjDef, ObjId, World } from './types';
import { createWorld, type WorldOptions } from './world';
import {
  applyOp, applyTurn, cellsOf, initialCube, inverseTurn, isBlocked, links, sameCell,
  type CubeBlock, type CubeDef, type CubeOp, type CubeState, type DoorInfo, type Side, type Turn, type TurnBlockCube
} from './cube';
import { boxAt, clamp, objBox, overlaps } from './geometry';
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
  /** v0.4 控制盤章節 (選填，缺欄 = 預設；第一章不寫)：本章魔方儀已啟動 (R 不還原：同 noteFlag，寫進 state 與 entry) */
  dial?: boolean;
  /** 已解開的鎖扣 (組 id)；R 會還原 (解開條件若是本次進房才成立，一併退回) */
  unlocked?: string[];
  /** 剩餘墨量與本段回退堆疊 (穿門進房補滿到該房預算、堆疊清空；長度 ≤ 預算) */
  turns?: { left: number; undo: TurnRec[] };
}

/** 回退堆疊的一筆 = 當時的轉動 */
export interface TurnRec { group: string; dir: Turn['dir'] }

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

/**
 * 把快照寫回世界 (快照裡不存在於關卡的 id 忽略)。位置只覆寫可推物 (只有它們會在遊戲中移動)；
 * 其餘物件的位置一律以關卡資料為準——舊存檔的快照 (例：閱覽室還是占位房時的地板 x=0) 不能把改版後的地形搬走
 */
export function restoreRoom(w: World, snap: RoomSnapshot): void {
  for (const s of snap.objs) {
    const o = w.byId.get(s.id);
    if (!o) continue;
    if (o.def.pushable) { o.x = s.x; o.y = s.y; o.z = s.z; }
    o.gone = s.gone; o.used = s.used; o.touched = s.touched;
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

/** World.ext.cube：門的接法 + 這間房此刻的格位 */
function cubeExt(spec: ChapterSpec, state: ChapterState): NonNullable<World['ext']['cube']> {
  const at = state.cube?.pos[state.room];
  return { links: roomLinks(spec, state), ...(at ? { at: [at[0], at[1], at[2]] as const } : {}) };
}

/** 轉動後只更新門的接法 (標籤 / 旗標是 World 的即時狀態，不覆寫) */
function writeLinks(spec: ChapterSpec, state: ChapterState, w: World): void {
  if (spec.cube && state.cube) w.ext = { ...w.ext, cube: cubeExt(spec, state) };
}

/** 進房時寫入 World.ext：門的接法、標籤、旗標；控制盤章節另寫魔方儀是否已啟動 (單房關卡不寫，ext 維持空物件) */
function writeExt(spec: ChapterSpec, state: ChapterState, w: World): void {
  if (!spec.cube || !state.cube) return;
  w.ext = { ...w.ext, cube: cubeExt(spec, state), labels: clone(state.labels), flags: [...state.flags] };
  if (isDialChapter(spec)) w.ext = { ...w.ext, dial: { active: !!state.dial } };
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
  // 控制盤章節：沒有墨量紀錄 (新進房 / 讀到缺欄的存檔) → 補滿到這間房的預算；有 (房內讀檔) → 照存檔，不補墨 (規格 8)
  if (isDialChapter(spec) && !st.turns) st.turns = { left: turnBudgetFor(spec, st, world), undo: [] };
  const cs: ChapterSession = { spec, state: st, entry: st, world };
  return { ...cs, entry: captureState(cs) };
}

/** 換房：存當前房快照 → 載入 / 復原目標房 (玩家站在 door 內側) → 記進房快照 */
export function enterRoom(cs: ChapterSession, room: string, door: ObjId | null, opts: WorldOptions): ChapterSession {
  const next: ChapterState = { ...captureState(cs), room, door };
  delete next.turns; // 控制盤章節：穿門 = 墨補滿到新房的預算、回退堆疊清空 (openChapter 補上)
  return openChapter(cs.spec, next, opts);
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
  if (out.turns) out.turns.undo = []; // 拱門跨房 = 本段結束 (規格 5.4.1 回退)
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

// ── v0.4 控制盤 (N32；architecture 4.16.1)：與第一章的拉桿路徑 (turn / applyOp) 平行，只在 CubeDef.control = 'dial' 的章節用 ──

/** 控制盤轉不動 / 退不回的原因 (dialTurn 的檢查順序：noDial → noGroup / locked → jammed → doorway → noInk → 魔方本身) */
export type DialBlock = TurnBlockCube | 'noCube' | 'noDial' | 'locked' | 'jammed' | 'doorway' | 'noInk' | 'nothingToUndo';
/** 章節層指令 (不進 World.step；外殼在固定步之間套用，只送進下一個固定步，可錄製回放；決策 Q10) */
export type ChapterCommand = { t: 'turn'; turn: Turn } | { t: 'undo' };

export const isDialChapter = (spec: ChapterSpec): boolean => spec.cube?.control === 'dial';

/**
 * 此刻成立的謎題旗標 (doneFlag)：當前房間 (world 給定時取即時狀態) 與其他房快照中 used 的物件，加上章節旗標。
 * 沒有 world → 當前房間也取快照 (讀檔校正用)
 */
export function doneFlags(spec: ChapterSpec, state: ChapterState, world?: World): Set<string> {
  const out = new Set(state.flags);
  for (const room of Object.keys(spec.rooms)) {
    if (world && room === state.room) {
      for (const o of world.objs) if (o.def.doneFlag && o.used) out.add(o.def.doneFlag);
      continue;
    }
    const snap = state.rooms[room];
    if (!snap) continue;
    const defs = roomObjects(spec, state, room);
    for (const s of snap.objs) { const d = defs.find(o => o.id === s.id); if (d?.doneFlag && s.used) out.add(d.doneFlag); }
  }
  return out;
}

/**
 * 房間通關 (v0.4 控制盤章節，例：2-1 三題都完成)：本房 puzzles 的每一題都有成立的 doneFlag。
 * 沒有列謎題、或不是控制盤章節 (第一章：章門打開才通關) → false
 */
export function roomCleared(spec: ChapterSpec, state: ChapterState, world?: World): boolean {
  const puzzles = spec.rooms[state.room]?.puzzles ?? [];
  if (!isDialChapter(spec) || !puzzles.length) return false;
  const done = doneFlags(spec, state, world);
  return puzzles.every(p => done.has(p.id));
}

/** 這間房此刻的墨量上限 (LevelDef.turnBudget；目前謎題是有 P4 預算、尚未完成的題 → 用 P4 預算；沒有設定 = 0) */
export function turnBudgetFor(spec: ChapterSpec, state: ChapterState, world?: World): number {
  const level = spec.rooms[state.room];
  const tb = level?.turnBudget;
  if (!tb) return 0;
  const p4 = tb.puzzles ?? {};
  const done = doneFlags(spec, state, world);
  const cur = (level.puzzles ?? []).find(p => p.id in p4 && !done.has(p.id));
  return cur ? p4[cur.id] : tb.base;
}

/** 鎖扣的解開條件是否成立 ('item:<id>' 持有道具、'ability:<id>' 能力、其餘 = 謎題旗標) */
function lockOpen(until: string, spec: ChapterSpec, state: ChapterState, world?: World): boolean {
  if (until.startsWith('item:')) { const id = until.slice(5); return ((world?.inv ?? state.items)[id] ?? 0) > 0; }
  if (until.startsWith('ability:')) return !!world?.abilities.includes(until.slice(8) as World['abilities'][number]);
  return doneFlags(spec, state, world).has(until);
}

/** 此刻已解開的鎖扣 (組 id，依 CubeDef.dial.locks 順序)：已記在 state.unlocked 的，加上條件此刻成立的 */
export function unlockedGroups(spec: ChapterSpec, state: ChapterState, world?: World): string[] {
  const locks = spec.cube?.dial?.locks ?? [];
  const known = new Set(state.unlocked ?? []);
  return locks.filter(l => known.has(l.group) || lockOpen(l.until, spec, state, world)).map(l => l.group);
}

/** 這一組此刻是否鎖著 (有鎖扣且還沒解開) */
export function isLocked(spec: ChapterSpec, state: ChapterState, group: string, world?: World): boolean {
  const locks = spec.cube?.dial?.locks ?? [];
  return locks.some(l => l.group === group) && !unlockedGroups(spec, state, world).includes(group);
}

/** 新解開的鎖扣寫回 state.unlocked (R 會還原)，並清空回退堆疊 (拿到旗標 = 本段結束)；added = 這次新解開的組 */
export function refreshUnlocks(cs: ChapterSession): { cs: ChapterSession; added: string[] } {
  if (!isDialChapter(cs.spec)) return { cs, added: [] };
  const known = cs.state.unlocked ?? [];
  const added = unlockedGroups(cs.spec, cs.state, cs.world).filter(g => !known.includes(g));
  if (!added.length) return { cs, added };
  const state: ChapterState = { ...cs.state, unlocked: [...known, ...added] };
  if (state.turns) state.turns = { ...state.turns, undo: [] };
  return { cs: { ...cs, state }, added };
}

/** 啟動魔方儀：dial = true (state 與 entry 都寫，R 不還原)、墨補滿；ext.dial 跟著更新 */
export function activateDial(cs: ChapterSession): ChapterSession {
  const turns = { left: turnBudgetFor(cs.spec, cs.state, cs.world), undo: [] as TurnRec[] };
  cs.world.ext = { ...cs.world.ext, dial: { active: true } };
  return { ...cs, state: { ...cs.state, dial: true, turns }, entry: { ...cs.entry, dial: true } };
}

/** 一間房此刻的可推物 / 門的盒子 (當前房 = 即時 World；其他房 = 關卡初值 + 跨房物件 + 快照) */
function roomBoxes(spec: ChapterSpec, state: ChapterState, world: World, room: string): { pushables: Box[]; doors: Box[] } {
  const doorIds = new Set(spec.doors.filter(d => d.room === room).map(d => d.door));
  if (room === state.room) {
    return {
      pushables: world.objs.filter(o => o.def.pushable && !o.gone).map(objBox),
      doors: world.objs.filter(o => doorIds.has(o.def.id)).map(objBox)
    };
  }
  const snap = state.rooms[room];
  const boxes = roomObjects(spec, state, room).map(d => {
    const s = snap?.objs.find(o => o.id === d.id);
    return { d, gone: s?.gone ?? false, box: { min: [(s?.x ?? d.x) - d.w / 2, s?.y ?? d.y, (s?.z ?? d.z) - d.d / 2], max: [(s?.x ?? d.x) + d.w / 2, (s?.y ?? d.y) + d.h, (s?.z ?? d.z) + d.d / 2] } as Box };
  });
  return { pushables: boxes.filter(b => b.d.pushable && !b.gone).map(b => b.box), doors: boxes.filter(b => doorIds.has(b.d.id)).map(b => b.box) };
}

/** 轉動 / 反向轉動的共同檢查 (不含墨量)：卡榫 (當前房在組內且有機制回報伸進軌道)、門口卡著 (組內各房：可推物或玩家壓在門位上) */
function dialCheck(cs: ChapterSession, t: Turn): DialBlock | null {
  const { spec, state, world } = cs;
  const def = spec.cube!;
  const cube = state.cube!;
  const cells = cellsOf(def, cube, t.group);
  const rooms = Object.keys(cube.pos).filter(r => cells.some(c => sameCell(c, cube.pos[r])));
  const mine = rooms.includes(state.room);
  if (mine && world.rt.mechanics.blocksTrack.some(m => m.blocksTrack!(world))) return 'jammed';
  for (const room of rooms) {
    if (!spec.rooms[room]) continue;
    const { pushables, doors } = roomBoxes(spec, state, world, room);
    if (pushables.some(p => doors.some(d => overlaps(p, d, '3d')))) return 'doorway';
  }
  if (mine) {
    const p = world.player;
    const pb = boxAt(p.x, p.y, p.mode === '2d' ? p.z3d : p.z);
    if (roomBoxes(spec, state, world, state.room).doors.some(d => overlaps(pb, d, '3d'))) return 'doorway';
  }
  return null;
}

/** 轉成功後寫回：新魔方排列、墨量與堆疊、當前房的門接法 */
function afterTurn(cs: ChapterSession, cube: CubeState, turns: { left: number; undo: TurnRec[] }): ChapterSession {
  const state: ChapterState = { ...cs.state, cube, turns };
  writeLinks(cs.spec, state, cs.world);
  return { ...cs, state };
}

/**
 * 這一次轉動此刻會不會被擋 (只算不寫；預覽用)：檢查順序 noDial → noGroup / locked → jammed → doorway → noInk → 魔方本身 (applyTurn)
 */
export function dialBlocked(cs: ChapterSession, t: Turn): DialBlock | null {
  const r = tryTurn(cs, t);
  return 'blocked' in r ? r.blocked : null;
}

function tryTurn(cs: ChapterSession, t: Turn): { cube: CubeState; turns: { left: number; undo: TurnRec[] } } | { blocked: DialBlock } {
  const { spec, state, world } = cs;
  const def = spec.cube;
  if (!def || !state.cube || !isDialChapter(spec)) return { blocked: 'noCube' };
  if (!state.dial) return { blocked: 'noDial' };
  if (!def.dial?.groups.some(g => g.id === t.group) || def.dial.miniOnly?.includes(t.group)) return { blocked: 'noGroup' };
  if (isLocked(spec, state, t.group, world)) return { blocked: 'locked' };
  const why = dialCheck(cs, t);
  if (why) return { blocked: why };
  const turns = state.turns ?? { left: turnBudgetFor(spec, state, world), undo: [] };
  if (turns.left <= 0) return { blocked: 'noInk' };
  const r = applyTurn(def, state.cube, t);
  if (isBlocked(r)) return r;
  return { cube: r, turns };
}

/**
 * 控制盤轉一次 (純函式，只回傳新 session；World 只更新 ext 的門接法)：阻擋檢查同 dialBlocked；
 * 成功：墨 −1、這一步推進回退堆疊。玩家所在房在組內就跟著移動 (房間本地座標不變)
 */
export function dialTurn(cs: ChapterSession, t: Turn): ChapterSession | { blocked: DialBlock } {
  const r = tryTurn(cs, t);
  if ('blocked' in r) return r;
  return afterTurn(cs, r.cube, { left: r.turns.left - 1, undo: [...r.turns.undo, { group: t.group, dir: t.dir }] });
}

/** 回退一步 (不耗墨，退回 1 滴)：堆疊空 → nothingToUndo；反向轉動照樣檢查卡榫 / 門口 / 魔方本身 (不查墨量) */
export function undoTurn(cs: ChapterSession): ChapterSession | { blocked: DialBlock } {
  const { spec, state } = cs;
  const def = spec.cube;
  if (!def || !state.cube || !isDialChapter(spec)) return { blocked: 'noCube' };
  const turns = state.turns;
  const last = turns?.undo[turns.undo.length - 1];
  if (!turns || !last) return { blocked: 'nothingToUndo' };
  const inv = inverseTurn(def, state.cube, last);
  const why = dialCheck(cs, inv);
  if (why) return { blocked: why };
  const r = applyTurn(def, state.cube, inv);
  if (isBlocked(r)) return r;
  return afterTurn(cs, r, { left: turns.left + 1, undo: turns.undo.slice(0, -1) });
}

/** 套用一個章節指令 */
export const applyChapterCommand = (cs: ChapterSession, c: ChapterCommand): ChapterSession | { blocked: DialBlock } =>
  c.t === 'turn' ? dialTurn(cs, c.turn) : undoTurn(cs);

/** 本幀發生了「本段結束」的事 (取得旗標 / 道具 / 字卡、拱門跨房；gotItem = 外殼比對 World.inv 得知) → 回退堆疊清空 (規格 5.4.1) */
export function clearUndo(cs: ChapterSession, events: readonly GameEvent[], gotItem = false): ChapterSession {
  const turns = cs.state.turns;
  if (!turns || !turns.undo.length) return cs;
  const end = gotItem || events.some(e => e.t === 'done' || e.t === 'flag' || e.t === 'objCross' || (e.t === 'card' && e.ok));
  return end ? { ...cs, state: { ...cs.state, turns: { ...turns, undo: [] } } } : cs;
}

/** 單房關卡 (不在魔方上)：一間房、沒有門位；行為同 createWorld */
export function singleRoomSpec(level: LevelDef): ChapterSpec {
  return { chapter: 0, cube: null, rooms: { [level.id]: level }, doors: [] };
}
