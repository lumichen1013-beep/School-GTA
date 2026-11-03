// 魔方運算 (v0.3；規格 5.4、architecture 4.16)：純函式、可 JSON 序列化、不讀時鐘 / 亂數；同一序列永遠同一結果
import type { ObjId } from './types';

/** 門位：N 後牆、S 前緣、E 右端、W 左端、U 天花板、D 地板 (規格 5.4.1) */
export type Side = 'N' | 'S' | 'E' | 'W' | 'U' | 'D';
/** 格位 [x 行 (向東 +1), y 列 (向南 +1；上 = 北), layer (向上 +1)] */
export type Cell = readonly [number, number, number];
export type CubeOps = 'slide' | 'rowcol' | 'layer' | 'slice';
export type FrameKind = 'porch' | 'chapterExit' | 'skylight';

/** 一章的魔方 (content/cubes/ch<N>.ts)：大小、轉動方式、初始排列 S0、屋框 (固定開口) */
export interface CubeDef {
  id: string;
  dims: Cell;
  ops: CubeOps;
  /** 初始排列：room = 房間 id，或 'solid' (實心格，不能進入、不會動)；沒列出的格 = 空格 */
  cells: ReadonlyArray<{ at: Cell; room: string }>;
  /** 屋框：接在固定格邊上的開口 (大門、章門走廊、天窗)；不隨轉動移動 */
  frame: ReadonlyArray<{ at: Cell; side: Side; kind: FrameKind; to?: string }>;
}

/** 魔方狀態：房間 → 格位、朝向 (第一章朝向恆 0) */
export interface CubeState { pos: Record<string, Cell>; rot: Record<string, 0 | 1 | 2 | 3> }

/** 轉動 (先只有滑動；列 / 行 / 層 / 切片於第二章起加入) */
export type CubeOp = { t: 'slide'; room: string; dir: Side };
export type CubeBlock = 'notEmpty' | 'outOfCube' | 'noRoom';

/** 門的型別：門 (人)、拱門 (人 + 可推物)、章門 (只通屋框的走廊) */
export type DoorKind = 'door' | 'arch' | 'chapter';
/** 房間的一個門位 (由房間 LevelDef 的 cubeDoor 物件整理而來，見 mechanics/cube chapterDoors) */
export interface DoorInfo { room: string; door: ObjId; side: Side; kind: DoorKind }
/** 一條接通：門 ↔ 鄰房的門 (kind = 兩側較窄者)，或門 ↔ 屋框 (frame = 屋框的 to ?? kind) */
export interface Link {
  from: { room: string; door: ObjId };
  to: { room: string; door: ObjId } | { frame: string };
  kind: 'door' | 'arch';
}

export const SIDES: readonly Side[] = ['N', 'E', 'S', 'W', 'U', 'D'];
const VEC: Readonly<Record<Side, Cell>> = { N: [0, -1, 0], S: [0, 1, 0], E: [1, 0, 0], W: [-1, 0, 0], U: [0, 0, 1], D: [0, 0, -1] };
export const OPPOSITE: Readonly<Record<Side, Side>> = { N: 'S', S: 'N', E: 'W', W: 'E', U: 'D', D: 'U' };
const RING: readonly Side[] = ['N', 'E', 'S', 'W'];

export const sameCell = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const addSide = (c: Cell, s: Side): Cell => [c[0] + VEC[s][0], c[1] + VEC[s][1], c[2] + VEC[s][2]];
export const inCube = (def: CubeDef, c: Cell): boolean => c.every((v, i) => v >= 0 && v < def.dims[i]);

/** 房間本地門位 → 魔方上的實際朝向 (順時針 rot 次；U / D 不受影響) */
export function rotateSide(s: Side, rot: number): Side {
  const i = RING.indexOf(s);
  return i < 0 ? s : RING[(i + rot) % 4];
}

/** 初始狀態 S0 (房間依 cells 擺放、朝向 0；實心格不在狀態裡) */
export function initialCube(def: CubeDef): CubeState {
  const pos: Record<string, Cell> = {};
  const rot: Record<string, 0 | 1 | 2 | 3> = {};
  for (const c of def.cells) {
    if (c.room === 'solid') continue;
    pos[c.room] = [c.at[0], c.at[1], c.at[2]];
    rot[c.room] = 0;
  }
  return { pos, rot };
}

/** 格內是什麼：房間 id、'solid' 或 'empty' */
export function cellContent(def: CubeDef, s: CubeState, at: Cell): string {
  for (const [room, c] of Object.entries(s.pos)) if (sameCell(c, at)) return room;
  return def.cells.some(c => c.room === 'solid' && sameCell(c.at, at)) ? 'solid' : 'empty';
}

/** 執行一次轉動；回傳新狀態 (不改輸入) 或轉不動的原因 */
export function applyOp(def: CubeDef, s: CubeState, op: CubeOp): CubeState | { blocked: CubeBlock } {
  const from = s.pos[op.room];
  if (!from) return { blocked: 'noRoom' };
  const to = addSide(from, op.dir);
  if (!inCube(def, to)) return { blocked: 'outOfCube' };
  if (cellContent(def, s, to) !== 'empty') return { blocked: 'notEmpty' };
  return { pos: { ...s.pos, [op.room]: to }, rot: { ...s.rot } };
}

export const isBlocked = (r: CubeState | { blocked: CubeBlock }): r is { blocked: CubeBlock } => 'blocked' in r;

/**
 * 連接表 (規格 5.4.1 接通規則)：依格位與朝向算出每扇門此刻接到哪 (依 doors 順序；接不通的門不列出 = 門後是牆)。
 * 門 ↔ 鄰房相反門位的門 (章門不接房間)；門 ↔ 屋框 (章門只接 chapterExit)；兩側型別取較窄者 (都是拱門才是 arch)。
 */
export function links(def: CubeDef, s: CubeState, doors: readonly DoorInfo[]): Link[] {
  const out: Link[] = [];
  for (const d of doors) {
    const at = s.pos[d.room];
    if (!at) continue;
    const side = rotateSide(d.side, s.rot[d.room] ?? 0);
    const frame = def.frame.find(f => f.side === side && sameCell(f.at, at));
    if (frame) {
      if (d.kind === 'chapter' && frame.kind !== 'chapterExit') continue;
      out.push({ from: { room: d.room, door: d.door }, to: { frame: frame.to ?? frame.kind }, kind: d.kind === 'arch' ? 'arch' : 'door' });
      continue;
    }
    if (d.kind === 'chapter') continue;
    const other = cellContent(def, s, addSide(at, side));
    if (other === 'empty' || other === 'solid') continue;
    const e = doors.find(x => x.room === other && x.kind !== 'chapter' && rotateSide(x.side, s.rot[other] ?? 0) === OPPOSITE[side]);
    if (!e) continue;
    out.push({ from: { room: d.room, door: d.door }, to: { room: other, door: e.door }, kind: d.kind === 'arch' && e.kind === 'arch' ? 'arch' : 'door' });
  }
  return out;
}

/** 魔方狀態的穩定字串 (BFS / 測試比對用；房間依 id 排序) */
export function cubeKey(s: CubeState): string {
  return Object.keys(s.pos).sort().map(r => `${r}@${s.pos[r].join(',')}r${s.rot[r] ?? 0}`).join(';');
}
