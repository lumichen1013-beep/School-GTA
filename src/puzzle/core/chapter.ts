// 章節層級狀態 (v0.3；規格 5.4、architecture 4.16)：ChapterSession = 魔方狀態 + 各房快照 + 當前房間的 World。
// 純資料 + 純函式 (World 本身照舊就地修改)；不 import mechanics (建 World 時由呼叫方傳入機制表，比照 createWorld)
import type { Box, DoorLinkState, GameEvent, LevelDef, ObjDef, ObjId, World, WorldExt } from './types';
import { createWorld, type WorldOptions } from './world';
import {
  addSide, applyOp, applyTurn, cellContent, cellsOf, inCube, initialCube, inverseTurn, isBlocked, links, localSide, OPPOSITE, rotateSide, sameCell,
  type Cell, type CubeBlock, type CubeDef, type CubeOp, type CubeState, type DoorInfo, type Side, type Turn, type TurnBlockCube
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
  /**
   * v0.4 第三章 卡榫 (P3)：玩家**不在**的這間房此刻是否有巨物伸進軌道 (依該房關卡資料 + state.labels；玩家所在房改問機制掛點 blocksTrack)。
   * 由 app 以機制表的純函式注入 (mechanics/index chapterSpecOf)；核心不 import mechanics。沒給 = 不在場的房一律不卡
   */
  jammed?(room: string, state: ChapterState): boolean;
  /**
   * v0.4 第三章 跨房的推導結果 (3-3：半座天平的對面重量 / 已閂住 = ext.balance、伸進這一房的那一截 = ext.protrude)：
   * 由 app 以機制表的純函式注入 (mechanics/index chapterSpecOf)；writeExt / writeLinks 寫入當前房。labels = 即時標籤
   */
  derive?(room: string, state: ChapterState, labels: Readonly<Record<string, readonly string[]>>): Partial<WorldExt>;
  /**
   * v0.4 第三章 此刻露出來的被蓋住的玻璃 (`room.side`，本地門位；3-4b：巨根是「小」→ 'depths.W')：由 app 以機制表的純函式注入
   * (mechanics/index chapterSpecOf)；lightExt、展開圖 mapLight、validateDial 都以同一個結果呼叫 lightPaths。沒給 = 一律蓋著
   */
  uncovered?(state: ChapterState, labels: Readonly<Record<string, readonly string[]>>): readonly string[];
  /**
   * v0.4 H1 讀檔位置校正：人站在 state.room 的 state.door 到達處時，此刻被哪個實體占住 (null = 空著)。由 app 以機制表注入
   * (mechanics/index chapterSpecOf → arrivalBlocker；核心不 import mechanics)；meta/chapters chapterStart 用 (被占 → 從開章入口進)。沒給 = 不校正
   */
  arrival?(state: ChapterState): ObjId | null;
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
/** 推不過拱門的原因：這扇門此刻不是拱門對拱門 (門 / 牆 / 屋框)、對面拱門內側被占住 (或沒有地板)；v0.4 第四章 up = 想把可推物從天花板梯口推上去 */
export type TransferBlock = 'notArch' | 'occupied' | 'up';

/** 進門後站的位置：門內側 0.9 (依門位往房內退) */
const SPAWN_IN = 0.9;
/** 推過拱門的物件出現在對面拱門內側：門內緣到物件近緣 1.3 (讓出進門的站位：0.9 + 玩家半寬 0.3 + 0.1) */
const ARRIVE_GAP = 1.3;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function snapshotRoom(w: World): RoomSnapshot {
  // 推導物件 (def.derived：例 3-3c 伸進隔壁的那一截) 由章節層每次重算，不進快照
  return { objs: w.objs.filter(o => !o.def.derived).map(o => ({ id: o.def.id, x: o.x, y: o.y, z: o.z, gone: o.gone, used: o.used, touched: o.touched })), flags: [] };
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
  // v0.4 第四章 梯口 (U 靠後牆的梯子 / D 地上的活板門)：站在梯口前方 (往觀眾) 0.9
  else z = o.z + o.d / 2 + SPAWN_IN;
  return { x: clamp(x, b.minX + PLAYER_HW, b.maxX - PLAYER_HW), y: o.y, z: clamp(z, b.minZ + PLAYER_HW, b.maxZ - PLAYER_HW) };
}

/** 此刻讀作「間」的門 (`room.door`；門牌標籤上貼著指定的部件卡)；labels 未給 = 章節狀態的標籤 */
export function activePlates(spec: ChapterSpec, labels: Readonly<Record<string, readonly string[]>>): Set<string> {
  const out = new Set<string>();
  for (const d of spec.doors) if (d.plate && (labels[d.plate.label] ?? []).includes(d.plate.card)) out.add(`${d.room}.${d.door}`);
  return out;
}

/** 此刻的連接表 (含門牌「間」)：labels = 即時標籤 (當前房間的 World.ext.labels；未給 = 章節狀態) */
export function chapterLinks(spec: ChapterSpec, cube: CubeState, labels: Readonly<Record<string, readonly string[]>>) {
  return spec.cube ? links(spec.cube, cube, spec.doors, activePlates(spec, labels)) : [];
}

/** 當前房間每扇門此刻的接法 (寫入 World.ext.cube；沒接通 = wall；洞位沒接通 = 不列出) */
export function roomLinks(spec: ChapterSpec, state: ChapterState, labels: Readonly<Record<string, readonly string[]>> = state.labels): Record<ObjId, DoorLinkState> {
  const out: Record<ObjId, DoorLinkState> = {};
  const mine = spec.doors.filter(d => d.room === state.room && !d.hole);
  for (const d of mine) out[d.door] = { to: 'wall' };
  if (!spec.cube || !state.cube) return out;
  for (const l of chapterLinks(spec, state.cube, labels)) {
    if (l.from.room !== state.room) continue;
    out[l.from.door] = 'frame' in l.to ? { to: 'frame', frame: l.to.frame } : { to: 'room', room: l.to.room, door: l.to.door, kind: l.kind };
  }
  return out;
}

/**
 * World.ext.cube：門的接法 + 這間房此刻的格位；控制盤章節另寫全章的房 ↔ 房接通 (graph，含門旁的活字) 與各房格位 (layout)
 * (跨房的計算結果，機制只讀：2-3c 字輪、2-4a 拼圖)
 */
function cubeExt(spec: ChapterSpec, state: ChapterState, labels: Readonly<Record<string, readonly string[]>> = state.labels): NonNullable<World['ext']['cube']> {
  const at = state.cube?.pos[state.room];
  const base = { links: roomLinks(spec, state, labels), ...(at ? { at: [at[0], at[1], at[2]] as const } : {}) };
  if (!isDialChapter(spec) || !state.cube) return base;
  const graph = chapterLinks(spec, state.cube, labels).flatMap(l => {
    if (!('room' in l.to)) return [];
    const d = spec.doors.find(x => x.room === l.from.room && x.door === l.from.door);
    return [{ room: l.from.room, door: l.from.door, to: l.to.room, ...(d?.glyph ? { glyph: d.glyph } : {}) }];
  });
  const layout = Object.fromEntries(Object.entries(state.cube.pos).map(([r, c]) => [r, [c[0], c[1], c[2]] as const]));
  return { ...base, graph, layout };
}

/** 轉動後只更新門的接法 (標籤 / 旗標是 World 的即時狀態，不覆寫；門牌以即時標籤算) */
function writeLinks(spec: ChapterSpec, state: ChapterState, w: World): void {
  if (spec.cube && state.cube) w.ext = { ...w.ext, cube: cubeExt(spec, state, w.ext.labels ?? state.labels) };
  const light = lightExt(spec, state, w.ext.labels ?? state.labels, w);
  if (light) w.ext = { ...w.ext, light };
  const ink = inkExt(spec, state, w);
  if (ink) w.ext = { ...w.ext, ink, done: [...doneFlags(spec, state, w)] };
  writeDerived(spec, state, w, w.ext.labels ?? state.labels);
}

/** 跨房推導 (ChapterSpec.derive；第三章 3-3)：結果的每個欄位覆寫 ext (沒給的欄位維持) */
function writeDerived(spec: ChapterSpec, state: ChapterState, w: World, labels: Readonly<Record<string, readonly string[]>>): void {
  if (!spec.derive || !state.cube) return;
  w.ext = { ...w.ext, ...spec.derive(state.room, state, labels) };
}

/** 標籤改了 (門牌貼上 / 取下「日」) → 重算當前房間的門接法 (World 只更新 ext) */
export function syncLinks(cs: ChapterSession): ChapterSession {
  writeLinks(cs.spec, cs.state, cs.world);
  return cs;
}

/** 進房時寫入 World.ext：門的接法、標籤、旗標；控制盤章節另寫魔方儀是否已啟動 (單房關卡不寫，ext 維持空物件) */
function writeExt(spec: ChapterSpec, state: ChapterState, w: World): void {
  if (!spec.cube || !state.cube) return;
  w.ext = { ...w.ext, cube: cubeExt(spec, state), labels: clone(state.labels), flags: [...state.flags] };
  if (isDialChapter(spec)) w.ext = { ...w.ext, dial: { active: !!state.dial }, unlocked: unlockedGroups(spec, state) };
  const light = lightExt(spec, state, state.labels, w);
  if (light) w.ext = { ...w.ext, light };
  const ink = inkExt(spec, state, w);
  if (ink) w.ext = { ...w.ext, ink, done: [...doneFlags(spec, state, w)] };
  writeDerived(spec, state, w, state.labels);
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
  const link = roomLinks(spec, state, world.ext.labels ?? state.labels)[door];
  if (!o || !src || !link || link.to !== 'room' || link.kind !== 'arch') return { blocked: 'notArch' };
  const target = spec.rooms[link.room];
  const dst = target?.objects.find(d => d.id === link.door);
  const di = spec.doors.find(d => d.room === link.room && d.door === link.door);
  if (!dst || !di) return { blocked: 'notArch' };
  // v0.4 第四章 梯口 (U / D)：只能往下落 (從地板梯口 D 進、到對面的天花板梯口 U)；落點 = 對面梯口前方 (往觀眾) ARRIVE_GAP + 半深，x 沿梯口寬保持偏移
  const vertical = di.side === 'U' || di.side === 'D';
  if (vertical && di.side !== 'U') return { blocked: 'up' };
  const along = di.side === 'N' || di.side === 'S';
  const half = (along || vertical ? dst.w : dst.d) / 2;
  const lateral = clamp(along || vertical ? o.x - src.x : o.z - src.z, -half, half);
  const reach = ARRIVE_GAP + (along || vertical ? o.def.d : o.def.w) / 2;
  const b = target.bounds;
  const pos = { x: dst.x, y: o.y, z: dst.z };
  if (vertical) { pos.x = clamp(dst.x + lateral, b.minX + o.def.w / 2, b.maxX - o.def.w / 2); pos.z = dst.z + dst.d / 2 + reach; }
  else if (along) { pos.x = clamp(dst.x + lateral, b.minX + o.def.w / 2, b.maxX - o.def.w / 2); pos.z = di.side === 'S' ? dst.z - dst.d / 2 - reach : dst.z + dst.d / 2 + reach; }
  else { pos.z = clamp(dst.z + lateral, b.minZ + o.def.d / 2, b.maxZ - o.def.d / 2); pos.x = di.side === 'E' ? dst.x - dst.w / 2 - reach : dst.x + dst.w / 2 + reach; }
  // 目標房此刻的樣子 (快照 + 跨房物件 + 即時標籤；尺寸先依標籤重算) 裡，到達處要空著、底下要有地板
  const next = clone(state);
  next.room = link.room;
  next.door = null;
  if (world.ext.labels) next.labels = clone(world.ext.labels);
  const probe = probeRoom(spec, next, opts);
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

/**
 * 目標房此刻的樣子 (到達處檢查用；不改 state)：loadRoom 之後先跑一次機制的 beforePhysics——mechanics/scale 依標籤重算尺寸
 * (建 World 時 def 是關卡資料的原尺寸)
 */
function probeRoom(spec: ChapterSpec, state: ChapterState, opts: WorldOptions): World {
  const probe = loadRoom(spec, state, opts);
  for (const m of probe.rt.mechanics.beforePhysics) m.beforePhysics!(probe, 0);
  return probe;
}

/**
 * v0.4 H1 到達處 (規格「H1 夾層（細化）」洞的到達處)：人從 state.door 進 state.room 時站的位置 (doorSpawn) 此刻被哪個實景實體占住；
 * 空著 / 不是從門進 = null。目標房 = 快照 + 跨房物件 + 標籤 (尺寸先依標籤重算)
 */
export function arrivalBlocker(spec: ChapterSpec, state: ChapterState, opts: WorldOptions): ObjId | null {
  const level = spec.rooms[state.room];
  const di = state.door === null ? undefined : spec.doors.find(d => d.room === state.room && d.door === state.door);
  if (!level || !di) return null;
  const probe = probeRoom(spec, { ...clone(state), door: null }, opts);
  const at = doorSpawn({ ...level, objects: roomObjects(spec, state, state.room) }, di.door, di.side);
  const box = boxAt(at.x, at.y, at.z);
  return solidsFor(probe, '3d').find(s => overlaps(objBox(s), box, '3d'))?.def.id ?? null;
}

/**
 * v0.4 H1：穿過這扇門 (此刻接到別的房) 之前查到達處——目標房的 doorSpawn 被實體占住 → { by } (外殼說 by 的 blockText ?? msg.cube.doorBlocked、
 * 不換房)；空著 / 這扇門沒接到房 = null。當前房以即時快照與標籤計 (例：剛在前廳貼上「小」)
 */
export function doorArrival(cs: ChapterSession, door: ObjId): { by: ObjId; blockText?: string } | null {
  const link = roomLinks(cs.spec, cs.state, cs.world.ext.labels ?? cs.state.labels)[door];
  if (!link || link.to !== 'room') return null;
  const next: ChapterState = { ...captureState(cs), room: link.room, door: link.door };
  const by = arrivalBlocker(cs.spec, next, { mechanics: cs.world.rt.mechanics.list, text: cs.world.rt.text });
  if (by === null) return null;
  const def = roomObjects(cs.spec, next, link.room).find(o => o.id === by);
  return def?.blockText ? { by, blockText: def.blockText } : { by };
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

/**
 * 此刻通關的房間 (本章每間有列謎題的房；謎題可以在別的房完成，例：2-3c 的排字架在手稿庫)：當前房間優先、其餘依 spec.rooms 順序
 */
export function clearedRooms(spec: ChapterSpec, state: ChapterState, world?: World): string[] {
  if (!isDialChapter(spec)) return [];
  const done = doneFlags(spec, state, world);
  const rooms = [state.room, ...Object.keys(spec.rooms).filter(r => r !== state.room)];
  return rooms.filter(r => { const ps = spec.rooms[r]?.puzzles ?? []; return ps.length > 0 && ps.every(p => done.has(p.id)); });
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

/** 這一組此刻是否鎖著 (有鎖扣且還沒解開；v0.4 第五章 DialLock.rooms：解開了也只在人在那幾間房時轉得動) */
export function isLocked(spec: ChapterSpec, state: ChapterState, group: string, world?: World): boolean {
  const locks = (spec.cube?.dial?.locks ?? []).filter(l => l.group === group);
  if (!locks.length) return false;
  if (locks.some(l => l.rooms && !l.rooms.includes(state.room))) return true;
  return !unlockedGroups(spec, state, world).includes(group);
}

/** v0.4 第五章 這一組此刻不在轉動模式裡列出 (鎖扣限定了房間、人不在那幾間房；例：不在東窗時沒有「東窗的窗框」) */
export function groupHidden(spec: ChapterSpec, state: ChapterState, group: string): boolean {
  return (spec.cube?.dial?.locks ?? []).some(l => l.group === group && !!l.rooms && !l.rooms.includes(state.room));
}

/** 新解開的鎖扣寫回 state.unlocked (R 會還原)，並清空回退堆疊 (拿到旗標 = 本段結束)；added = 這次新解開的組 */
export function refreshUnlocks(cs: ChapterSession): { cs: ChapterSession; added: string[] } {
  if (!isDialChapter(cs.spec)) return { cs, added: [] };
  const known = cs.state.unlocked ?? [];
  const added = unlockedGroups(cs.spec, cs.state, cs.world).filter(g => !known.includes(g));
  if (!added.length) return { cs, added };
  const state: ChapterState = { ...cs.state, unlocked: [...known, ...added] };
  if (state.turns) state.turns = { ...state.turns, undo: [] };
  cs.world.ext = { ...cs.world.ext, unlocked: state.unlocked };
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
  // 洞位不算門口 (洞不是實體；規格「門牌「間」」)
  const doorIds = new Set(spec.doors.filter(d => d.room === room && !d.hole).map(d => d.door));
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

/** 轉動 / 反向轉動的共同檢查 (不含墨量)：卡榫 (組內的房：當前房問機制掛點、其他房問 spec.jammed)、門口卡著 (組內各房：可推物或玩家壓在門位上) */
function dialCheck(cs: ChapterSession, t: Turn): DialBlock | null {
  const { spec, state, world } = cs;
  const def = spec.cube!;
  const cube = state.cube!;
  const cells = cellsOf(def, cube, t.group);
  const rooms = Object.keys(cube.pos).filter(r => cells.some(c => sameCell(c, cube.pos[r])));
  const mine = rooms.includes(state.room);
  // 卡榫：組內每一間房 (玩家所在房 = 即時 World 的機制掛點；其他房 = ChapterSpec.jammed，規格「第三章共用規則」卡榫)
  if (mine && world.rt.mechanics.blocksTrack.some(m => m.blocksTrack!(world))) return 'jammed';
  // 其他房用即時標籤 (3-3c：玩家剛在本房放大、伸進隔壁的陶槽，隔壁房立刻卡住)
  const live = world.ext.labels ? { ...state, labels: world.ext.labels } : state;
  if (spec.jammed && rooms.some(r => r !== state.room && spec.rooms[r] && spec.jammed!(r, live))) return 'jammed';
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

// ── v0.4 第三章 光路 (N26；規格 6「第三章共用規則」光路、「3-2 玻璃長廊（細化）」；architecture 4.19) ──

/** 光照進一間房的一次：from = 從哪一側 (魔方上的實際方位) 進來、via = 之前穿過幾間房、out = 從哪一側出去 (null = 停在房內)、rooms = 之前穿過的房 */
export interface LightHit { from: Side; via: number; out: Side | null; rooms: readonly string[] }
/** 一條光路的一格 (照進的那間房) */
export interface LightStep { room: string; cell: Cell; from: Side; via: number; out: Side | null }
/**
 * 一扇天窗的光路：source = 天窗所在的格 (光從 side 那一側照進來)；steps = 依序照進的房；
 * stop = 光撞上的那一格與那一側 (空格 / 實心格 / 沒有玻璃 / 魔方外 / 已照過的房；null = 停在最後那間房裡)
 */
export interface LightBeam { source: Cell; side: Side; steps: LightStep[]; stop: { at: Cell; side: Side } | null }
export interface LightPaths { beams: LightBeam[]; hits: Record<string, LightHit[]> }

declare module './types' {
  interface WorldExt {
    /** v0.4 第三章 光路：這間房此刻照進來的光 (章節層在進房 / 轉動 / 改標籤後寫入；mechanics/light 的感光物只讀) */
    light?: { hits: ReadonlyArray<LightHit> };
  }
}

/**
 * 天窗的光路 (純函式、確定性)：每扇天窗 (屋框 skylight，依 def.frame 順序) 從那一側照進那一格，逐格傳播——
 * 光從 s 側進格內的房 → 該房 s 側 (本地) 要有玻璃且沒被蓋住才進得去 (空格、實心格、沒有玻璃 = 停在牆外)；
 * 進得去 = 照到 (記下 from / via / rooms)；出去的那一側 = 稜鏡的另一側 (從稜鏡的一側進來) 或對側，那一側也要有玻璃，否則停在房內；
 * 同一條光不會兩次進同一間房。uncovered = 此刻露出來的被蓋住的玻璃 (`room.side`，本地門位)
 */
export function lightPaths(def: CubeDef, cube: CubeState, uncovered: ReadonlySet<string> = new Set()): LightPaths {
  const beams: LightBeam[] = [];
  const hits: Record<string, LightHit[]> = {};
  const table = def.glass ?? {};
  const has = (room: string, local: Side): boolean => {
    const g = table[room];
    return !!g && g.glass.includes(local) && (!g.covered?.includes(local) || uncovered.has(`${room}.${local}`));
  };
  for (const f of def.frame) {
    if (f.kind !== 'skylight') continue;
    const beam: LightBeam = { source: [f.at[0], f.at[1], f.at[2]], side: f.side, steps: [], stop: null };
    beams.push(beam);
    let at: Cell = beam.source;
    let side: Side = f.side;
    const passed: string[] = [];
    for (;;) {
      const room = inCube(def, at) ? cellContent(def, cube, at) : 'empty';
      const rot = cube.rot[room] ?? 0;
      if (!inCube(def, at) || room === 'empty' || room === 'solid' || passed.includes(room) || !has(room, localSide(side, rot))) {
        beam.stop = { at, side };
        break;
      }
      const inLocal = localSide(side, rot);
      const prism = table[room].prism?.find(p => p[0] === inLocal || p[1] === inLocal);
      const outLocal = prism ? (prism[0] === inLocal ? prism[1] : prism[0]) : OPPOSITE[inLocal];
      const out = has(room, outLocal) ? rotateSide(outLocal, rot) : null;
      beam.steps.push({ room, cell: at, from: side, via: passed.length, out });
      (hits[room] ??= []).push({ from: side, via: passed.length, out, rooms: [...passed] });
      passed.push(room);
      if (!out) break;
      at = addSide(at, out);
      side = OPPOSITE[out];
    }
  }
  return { beams, hits };
}

/** 感光物此刻的光 (機制、驗證器、展開圖共用)：沒有從 from 進來的光 = dark；via 夠 = lit；只有天窗直射 (via 0) = white；0 < via < 要求 = weak */
export type LightState = 'dark' | 'white' | 'weak' | 'lit';
export function lightState(hits: ReadonlyArray<Pick<LightHit, 'from' | 'via'>>, from: Side, via: number): LightState {
  const mine = hits.filter(h => h.from === from);
  if (!mine.length) return 'dark';
  if (mine.some(h => h.via >= via)) return 'lit';
  return mine.some(h => h.via > 0) ? 'weak' : 'white';
}

/**
 * 此刻露出來的被蓋住的玻璃 (ChapterSpec.uncovered；沒給 = 空)：world 給定時當前房取即時快照 (房內剛閂住的物件 used)、labels 取即時標籤
 */
export function uncoveredGlass(spec: ChapterSpec, state: ChapterState, labels: Readonly<Record<string, readonly string[]>> = state.labels, world?: World): Set<string> {
  if (!spec.uncovered) return new Set();
  const live = world ? { ...state, rooms: { ...state.rooms, [state.room]: snapshotRoom(world) } } : state;
  return new Set(spec.uncovered(live, labels));
}

/** 展開圖 / 機制用：這個 session 此刻露出來的玻璃 (當前房的即時狀態與標籤) */
export const sessionUncovered = (cs: ChapterSession): Set<string> => uncoveredGlass(cs.spec, cs.state, cs.world.ext.labels ?? cs.state.labels, cs.world);

/** 當前房間此刻的光 (章節沒有光路 = undefined；寫入 World.ext.light)；被蓋住的玻璃以 uncoveredGlass 計 */
function lightExt(spec: ChapterSpec, state: ChapterState, labels: Readonly<Record<string, readonly string[]>>, w?: World): WorldExtLight | undefined {
  if (!spec.cube?.glass || !state.cube) return undefined;
  // v0.4 第四章：房間會轉 → 照進來的方位換成房間本地 (感光物的 from 是本地門位；第三章朝向恆 0，不變)
  const rot = state.cube.rot[state.room] ?? 0;
  const hits = lightPaths(spec.cube, state.cube, uncoveredGlass(spec, state, labels, w)).hits[state.room] ?? [];
  return { hits: rot ? hits.map(h => ({ ...h, from: localSide(h.from, rot), out: h.out && localSide(h.out, rot) })) : hits };
}
type WorldExtLight = NonNullable<World['ext']['light']>;

// ── v0.4 第四章 墨流 (P15；規格 6「第四章共用規則」墨流、「4-2 墨爐間（細化）」) ──

/** 一間房的墨此刻：從哪一側進來 (魔方方位) 與本地門位；sink = 這一側是匯點 (墨停在這裡) */
export interface InkStep { room: string; cell: Cell; from: Side | null; local: Side | null; out: Side | null; sink: boolean }
/** 一股墨：source = 源頭房；steps = 依序流過的房 (第一格 = 源頭房)；stop = 墨停在牆外的那一格與那一側 (null = 流進匯點或停在房內) */
export interface InkFlow { source: string; steps: InkStep[]; stop: { at: Cell; side: Side } | null }
/** 墨流：flows = 每個打開的源頭一股；sinks = 每間房此刻收到墨的匯點 (本地門位)；through = 墨流過的房 */
export interface InkPaths { flows: InkFlow[]; sinks: Record<string, Side[]>; through: string[] }

declare module './types' {
  interface WorldExt {
    /** v0.4 第四章 墨流：這間房此刻有沒有墨流過、收到墨的匯點 (本地門位)；章節層寫入，mechanics/ink 只讀 */
    ink?: { through: boolean; sinks: readonly Side[] };
    /** v0.4 第四章 此刻成立的謎題旗標 (doneFlags；有墨流的章節才寫：進房 / 轉動 / done 之後)；4-3b 封存櫃只讀 */
    done?: readonly string[];
  }
}

/**
 * 墨流 (純函式、確定性；同光路的逐格傳播)：每個 active 的源頭房從 source 那一側 (本地) 流出 → 鄰格 (U / D 也算) 的房在對面那一側 (本地) 要有管線口：
 * 是匯點 → 收到墨、這股停止；是一對管線的一端 → 從另一端流出、繼續；沒有 / 空格 / 魔方外 → 墨停在牆外。同一股墨不會兩次流進同一間房 (源頭房除外：只收匯點)
 */
export function inkPaths(def: CubeDef, cube: CubeState, active: ReadonlySet<string>): InkPaths {
  const table = def.ink ?? {};
  const flows: InkFlow[] = [];
  const sinks: Record<string, Side[]> = {};
  const through = new Set<string>();
  for (const [src, rp] of Object.entries(table)) {
    if (!rp.source || !active.has(src) || !cube.pos[src]) continue;
    const at0 = cube.pos[src];
    const rot0 = cube.rot[src] ?? 0;
    const flow: InkFlow = { source: src, steps: [{ room: src, cell: at0, from: null, local: null, out: rotateSide(rp.source, rot0), sink: false }], stop: null };
    flows.push(flow);
    through.add(src);
    const passed = new Set<string>([src]);
    let side: Side = rotateSide(rp.source, rot0);
    let at: Cell = addSide(at0, side);
    for (;;) {
      const room = inCube(def, at) ? cellContent(def, cube, at) : 'empty';
      const from = OPPOSITE[side];
      const rot = cube.rot[room] ?? 0;
      const local = localSide(from, rot);
      const t = table[room];
      if (!inCube(def, at) || room === 'empty' || room === 'solid' || !t) { flow.stop = { at, side: from }; break; }
      if (t.sinks?.includes(local)) {
        flow.steps.push({ room, cell: at, from, local, out: null, sink: true });
        (sinks[room] ??= []).push(local);
        through.add(room);
        break;
      }
      const pipe = t.pipes?.find(p => p[0] === local || p[1] === local);
      if (!pipe || (passed.has(room) && room !== src)) { flow.stop = { at, side: from }; break; }
      const outLocal = pipe[0] === local ? pipe[1] : pipe[0];
      const out = rotateSide(outLocal, rot);
      flow.steps.push({ room, cell: at, from, local, out, sink: false });
      through.add(room);
      passed.add(room);
      side = out;
      at = addSide(at, out);
    }
  }
  return { flows, sinks, through: [...through] };
}

/** 此刻打開的源頭房 (CubeDef.ink 的 valve 旗標成立；沒有 valve = 一直開著)；world 給定時當前房取即時狀態 */
export function activeInk(spec: ChapterSpec, state: ChapterState, world?: World): Set<string> {
  const table = spec.cube?.ink ?? {};
  const done = doneFlags(spec, state, world);
  return new Set(Object.entries(table).filter(([, rp]) => rp.source && (!rp.valve || done.has(rp.valve))).map(([r]) => r));
}

/** 當前房間此刻的墨 (章節沒有管線 = undefined；寫入 World.ext.ink) */
function inkExt(spec: ChapterSpec, state: ChapterState, w?: World): NonNullable<World['ext']['ink']> | undefined {
  if (!spec.cube?.ink || !state.cube) return undefined;
  const p = inkPaths(spec.cube, state.cube, activeInk(spec, state, w));
  return { through: p.through.includes(state.room), sinks: p.sinks[state.room] ?? [] };
}

/** 墨流可能改變的事之後 (閥打開、轉動、換房) 重算當前房的 ext.ink (光路 / 門接法照舊) */
export function syncInk(cs: ChapterSession): ChapterSession {
  const ink = inkExt(cs.spec, cs.state, cs.world);
  if (ink) cs.world.ext = { ...cs.world.ext, ink, done: [...doneFlags(cs.spec, cs.state, cs.world)] };
  return cs;
}

/** 單房關卡 (不在魔方上)：一間房、沒有門位；行為同 createWorld */
export function singleRoomSpec(level: LevelDef): ChapterSpec {
  return { chapter: 0, cube: null, rooms: { [level.id]: level }, doors: [] };
}
