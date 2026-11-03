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
  /** 初始排列：room = 房間 id，或 'solid' (實心格，不能進入、不會動)；沒列出的格 = 空格。label = 實心格在展開圖上的名稱 (文字 key；v0.4 第三章：工具間 / 水塔) */
  cells: ReadonlyArray<{ at: Cell; room: string; label?: string }>;
  /** 屋框：接在固定格邊上的開口 (大門、章門走廊、天窗)；不隨轉動移動 */
  frame: ReadonlyArray<{ at: Cell; side: Side; kind: FrameKind; to?: string }>;
  /** v0.4 轉動手段：lever = 房間裡的拉桿 (第一章；未給 = lever)、dial = 展開圖的控制盤 (第二章起，N32) */
  control?: 'lever' | 'dial';
  /** v0.4 控制盤 (control = 'dial')：魔方儀在哪、列出的組 (未列出 = 轉不到)、鎖扣 */
  dial?: DialDef;
}

/**
 * 轉動組的種類 (v0.4；規格 5.4.4)：row = 一列循環平移、col = 一行循環平移 (兩列時 = 對調)、
 * slideCell = 某格的房間滑進相鄰空格、layer = 一層繞垂直軸轉 90°、slice = 三軸切片轉 90°
 */
export type TurnKind = 'row' | 'col' | 'slideCell' | 'layer' | 'slice';
/** 控制盤上的一組：row index = 列 (y)、col index = 行 (x)、slideCell index = 格號 (x + y·寬 + 層·寬·高)、layer index = 層、slice = axis 上的第 index 片 */
export interface TurnGroup { id: string; kind: TurnKind; index: number; axis?: 'x' | 'y' | 'z' }
/** 一次轉動：row / col / layer / slice 的 dir = ±1 (列 +1 = 往東、行 +1 = 往南、層 / 切片 +1 = 順時針)；slideCell 的 dir = 滑向的邊 */
export interface Turn { group: string; dir: 1 | -1 | Side }
/** 鎖扣：until = 解開條件 (謎題的 doneFlag；'item:<id>' = 持有道具；'ability:<id>' = 能力) */
export interface DialLock { group: string; until: string }
export interface DialDef {
  /** 魔方儀所在房與物件 id (3D 啟動) */
  entry: { room: string; obj: string };
  groups: readonly TurnGroup[];
  locks: readonly DialLock[];
  /** 只有縮影裡轉得到的組 (第五章；控制盤不列出) */
  miniOnly?: readonly string[];
}

/** 魔方狀態：房間 → 格位、朝向 (第一章朝向恆 0) */
export interface CubeState { pos: Record<string, Cell>; rot: Record<string, 0 | 1 | 2 | 3> }

/** 轉動 (先只有滑動；列 / 行 / 層 / 切片於第二章起加入) */
export type CubeOp = { t: 'slide'; room: string; dir: Side };
export type CubeBlock = 'notEmpty' | 'outOfCube' | 'noRoom';

/** 門的型別：門 (人)、拱門 (人 + 可推物)、章門 (只通屋框的走廊) */
export type DoorKind = 'door' | 'arch' | 'chapter';
/** 房間的一個門位 (由房間 LevelDef 的 cubeDoor 物件整理而來，見 mechanics/cube chapterDoors) */
export interface DoorInfo {
  room: string; door: ObjId; side: Side; kind: DoorKind;
  /** v0.4 門牌 (規格「門牌「間」」)：label = 門牌標籤 id；那個標籤上貼著 card (部件卡「日」) 時，這扇門讀作「間」 */
  plate?: { label: string; card: string };
  /** v0.4 洞位 (一般不在場)：只有對面的門讀作「間」、這一面又沒有門時才接上 (同一面已有門的不算) */
  hole?: boolean;
  /** 門旁 (房內側) 的活字 (2-3c 路線密碼；文字 key) */
  glyph?: string;
}
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

export const isBlocked = <B extends string>(r: CubeState | { blocked: B }): r is { blocked: B } => 'blocked' in r;

/**
 * 連接表 (規格 5.4.1 接通規則)：依格位與朝向算出每扇門此刻接到哪 (依 doors 順序；接不通的門不列出 = 門後是牆)。
 * 門 ↔ 鄰房相反門位的門 (章門不接房間)；門 ↔ 屋框 (章門只接 chapterExit)；兩側型別取較窄者 (都是拱門才是 arch)。
 * v0.4 門牌「間」：plates = 此刻讀作「間」的門 (`room.door`)；鄰房那一面沒有任何門、但有洞位 → 接到洞位 (洞位也回接這扇門，列在最後)
 */
export function links(def: CubeDef, s: CubeState, doors: readonly DoorInfo[], plates?: ReadonlySet<string>): Link[] {
  const out: Link[] = [];
  const back: Link[] = [];
  for (const d of doors) {
    if (d.hole) continue;
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
    const facing = (x: DoorInfo): boolean => x.room === other && rotateSide(x.side, s.rot[other] ?? 0) === OPPOSITE[side];
    const e = doors.find(x => facing(x) && !x.hole && x.kind !== 'chapter');
    if (e) {
      out.push({ from: { room: d.room, door: d.door }, to: { room: other, door: e.door }, kind: d.kind === 'arch' && e.kind === 'arch' ? 'arch' : 'door' });
      continue;
    }
    if (!plates?.has(`${d.room}.${d.door}`) || doors.some(x => facing(x) && !x.hole)) continue;
    const h = doors.find(x => facing(x) && x.hole);
    if (!h) continue;
    const kind = d.kind === 'arch' && h.kind === 'arch' ? 'arch' : 'door';
    out.push({ from: { room: d.room, door: d.door }, to: { room: other, door: h.door }, kind });
    back.push({ from: { room: other, door: h.door }, to: { room: d.room, door: d.door }, kind });
  }
  return [...out, ...back];
}

// ── v0.4 控制盤的轉動 (architecture 4.16.1；第一章拉桿的 applyOp 不經過這裡) ──

/** 轉不動 (魔方本身)：CubeBlock，或控制盤上沒有這一組 / 方向不合這一組 */
export type TurnBlockCube = CubeBlock | 'noGroup';

const isSide = (d: Turn['dir']): d is Side => typeof d === 'string';
const cellIndex = (def: CubeDef, c: Cell): number => c[0] + c[1] * def.dims[0] + c[2] * def.dims[0] * def.dims[1];
const cellAt = (def: CubeDef, i: number): Cell => {
  const [w, h] = def.dims;
  return [i % w, Math.floor(i / w) % h, Math.floor(i / (w * h))];
};
const groupOf = (def: CubeDef, id: string): TurnGroup | undefined => def.dial?.groups.find(g => g.id === id);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** 這一組此刻包含的格 (依座標順序；卡榫、預覽、玩家是否隨轉用)。slideCell = 那一格本身 */
export function cellsOf(def: CubeDef, _s: CubeState, group: string): Cell[] {
  const g = groupOf(def, group);
  if (!g) return [];
  const [W, H, L] = def.dims;
  const out: Cell[] = [];
  for (let z = 0; z < L; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hit = g.kind === 'row' ? y === g.index && z === 0
      : g.kind === 'col' ? x === g.index && z === 0
        : g.kind === 'slideCell' ? cellIndex(def, [x, y, z]) === g.index
          : g.kind === 'layer' ? z === g.index
            : (g.axis === 'x' ? x : g.axis === 'y' ? y : z) === g.index;
    if (hit) out.push([x, y, z]);
  }
  return out;
}

/** 一組轉動對單一格位的映射 (row / col / layer / slice；dir ±1)；格不在組內 → 原樣 */
function mapCell(def: CubeDef, g: TurnGroup, c: Cell, dir: 1 | -1): Cell {
  const [W, H] = def.dims;
  if (g.kind === 'row') return [mod(c[0] + dir, W), c[1], c[2]];
  if (g.kind === 'col') return [c[0], mod(c[1] + dir, H), c[2]];
  // 層 / 切片：在該平面上繞中心轉 90° (dir +1 = 順時針，從軸的正向看；平面為正方形)
  const axis = g.kind === 'layer' ? 'z' : g.axis ?? 'z';
  const [a, b] = axis === 'z' ? [0, 1] : axis === 'x' ? [1, 2] : [0, 2];
  const n = def.dims[a];
  const out: [number, number, number] = [c[0], c[1], c[2]];
  if (dir === 1) { out[a] = n - 1 - c[b]; out[b] = c[a]; } else { out[a] = c[b]; out[b] = n - 1 - c[a]; }
  return out;
}

/**
 * 控制盤的一次轉動 (純函式，不改輸入；規格 5.4.4)：列 = 一列循環平移 (dir +1 往東)；行 = 一行循環平移 (兩列時 = 上下對調，dir 無意義)；
 * slideCell = 那一格的房間往 dir 滑進相鄰空格 (拉桿的 slide 同規則)；layer = 一層繞垂直軸轉 90° (位置與朝向一起轉)；
 * slice = 三軸切片轉 90° (中心格只在原地轉；z 軸切片同層轉，x / y 軸切片只追蹤位置，俯仰朝向留到第五章)。
 * 組內有實心格 → notEmpty (實心格固定不動，屋框承重)；層 / 切片的平面不是正方形 → outOfCube
 */
export function applyTurn(def: CubeDef, s: CubeState, t: Turn): CubeState | { blocked: TurnBlockCube } {
  const g = groupOf(def, t.group);
  if (!g) return { blocked: 'noGroup' };
  if (g.kind === 'slideCell') {
    if (!isSide(t.dir)) return { blocked: 'noGroup' };
    const room = cellContent(def, s, cellAt(def, g.index));
    if (room === 'empty' || room === 'solid') return { blocked: 'noRoom' };
    return applyOp(def, s, { t: 'slide', room, dir: t.dir });
  }
  if (isSide(t.dir)) return { blocked: 'noGroup' };
  const dir = t.dir;
  const cells = cellsOf(def, s, g.id);
  if (g.kind === 'layer' || g.kind === 'slice') {
    const axis = g.kind === 'layer' ? 'z' : g.axis ?? 'z';
    const [a, b] = axis === 'z' ? [0, 1] : axis === 'x' ? [1, 2] : [0, 2];
    if (def.dims[a] !== def.dims[b]) return { blocked: 'outOfCube' };
  }
  if (cells.some(c => def.cells.some(d => d.room === 'solid' && sameCell(d.at, c)))) return { blocked: 'notEmpty' };
  const pos = { ...s.pos };
  const rot = { ...s.rot };
  const yaw = g.kind === 'layer' || (g.kind === 'slice' && (g.axis ?? 'z') === 'z');
  for (const [room, c] of Object.entries(s.pos)) {
    if (!cells.some(k => sameCell(k, c))) continue;
    pos[room] = mapCell(def, g, c, dir);
    if (yaw) rot[room] = mod((s.rot[room] ?? 0) + dir, 4) as 0 | 1 | 2 | 3;
  }
  return { pos, rot };
}

/**
 * 反向轉動 (回退用)：列 / 層 / 切片 ±1 互反；行在兩列的魔方是對調 (自反，dir 固定 1)，多列時 ±1 互反；
 * slideCell = 從滑到的那一格往反方向滑回 (只看轉動本身，before 留給需要狀態的轉法)
 */
export function inverseTurn(def: CubeDef, _before: CubeState, t: Turn): Turn {
  const g = groupOf(def, t.group);
  if (!g) return t;
  if (g.kind === 'slideCell' && isSide(t.dir)) {
    const to = cellIndex(def, addSide(cellAt(def, g.index), t.dir));
    const back = def.dial?.groups.find(x => x.kind === 'slideCell' && x.index === to);
    return { group: back?.id ?? t.group, dir: OPPOSITE[t.dir] };
  }
  if (g.kind === 'col' && def.dims[1] === 2) return { group: t.group, dir: 1 };
  return { group: t.group, dir: t.dir === 1 ? -1 : 1 };
}

/** 這一組在控制盤上可選的方向 (row / layer / slice：-1、+1；兩列的 col：對調 1；多列 col：-1、+1；slideCell：相鄰的四邊) */
export function turnDirs(def: CubeDef, group: string): Turn['dir'][] {
  const g = groupOf(def, group);
  if (!g) return [];
  if (g.kind === 'slideCell') return ['N', 'E', 'S', 'W'];
  if (g.kind === 'col' && def.dims[1] === 2) return [1];
  return [-1, 1];
}

/** 魔方狀態的穩定字串 (BFS / 測試比對用；房間依 id 排序) */
export function cubeKey(s: CubeState): string {
  return Object.keys(s.pos).sort().map(r => `${r}@${s.pos[r].join(',')}r${s.rot[r] ?? 0}`).join(';');
}
