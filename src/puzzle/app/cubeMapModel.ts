// 展開圖的資料推導 (純函式，Node 可測；ui/cubeMap.ts 只負責畫)：規格 5.4.1「展開圖」、mobile-controls 2.5
import type { ObjState, World } from '../core/types';
import type { Text } from '../text/text';
import { INTERACT_RANGE, PLAYER_H } from '../core/constants';
import { isActiveIn } from '../core/presence';
import { addSide, applyOp, applyTurn, cellContent, cellsOf, inCube, isBlocked, rotateSide, SIDES, turnDirs, type Cell, type CubeDef, type CubeOp, type CubeState, type FrameKind, type Side, type Turn, type TurnGroup } from '../core/cube';
import { activeInk, chapterLinks, dialBlocked, groupHidden, groupInReach, groupJam, inMini, inkPaths, isDialChapter, isLocked, lightPaths, sessionUncovered, turnBudgetFor, type ChapterCommand, type ChapterSession } from '../core/chapter';
import type { Mode } from '../core/types';
import type { LoopInput } from './loop';
import { leverOp, TURN_BLOCK_MSG, WORD_KEYS, type LeverWord } from '../mechanics/cube';
import { leverWord } from '../mechanics/labels';
import { DIAL_BLOCK_MSG, TURN_MODE_DENY_MSG, turnModeDenied } from '../mechanics/dial';
import type { InputFrame } from '../input/types';
import type { CubeMapModel, MapCell, MapDoor, MapInk, MapLight, MapPreview, TurnDir, TurnHeader, TurnModeModel } from '../ui/cubeMap';

export type { CubeMapModel, MapCell, MapDoor, MapFrame, MapLight, MapLink, MapPreview, TurnHeader, TurnModeModel, TurnPreview } from '../ui/cubeMap';

/** 2D 時玩家附近 (互動範圍內，不必站穩) 的拉桿：展開圖顯示它的轉動預覽；3D 不預覽 (規劃在 2D、行動在 3D) */
export function previewLever(w: World): ObjState | null {
  const p = w.player;
  if (p.mode !== '2d') return null;
  const cy = p.y + PLAYER_H / 2;
  let best: ObjState | null = null;
  let bd = INTERACT_RANGE;
  for (const o of w.objs) {
    if (o.def.type !== 'lever' || !isActiveIn(w, o, '2d')) continue;
    const dx = Math.max(0, Math.abs(p.x - o.x) - o.def.w / 2);
    const dy = Math.max(o.y - cy, 0, cy - (o.y + o.def.h));
    const d = Math.hypot(dx, dy);
    if (d <= bd) { bd = d; best = o; }
  }
  return best;
}

/** 屋框名稱 (frame.to 優先，例：書房走廊；否則依種類) */
const FRAME_KEYS: Readonly<Record<string, string>> = {
  porch: 'ui.map.frame.porch', chapterExit: 'ui.map.frame.chapterExit', skylight: 'ui.map.frame.skylight', study: 'ui.map.frame.study',
  hall: 'ui.map.frame.hall', greenhouse: 'ui.map.frame.greenhouse', cellar: 'ui.map.frame.cellar',
  greenhouseStair: 'ui.map.frame.greenhouseStair', attic: 'ui.map.frame.attic',
  cellarLadder: 'ui.map.frame.cellarLadder', starE: 'ui.map.frame.starE', starW: 'ui.map.frame.starW', starN: 'ui.map.frame.starN'
};
const frameName = (text: Text, kind: FrameKind, to: string | undefined): string => text(FRAME_KEYS[to ?? kind] ?? FRAME_KEYS[kind]);

/**
 * 展開圖 (目前所在層)：格 (房名 / 空格 / 實心)、門位與接通狀態、屋框；preview 給定 → 只算不寫 (不改 session) 的轉後結果。
 * 沒有魔方的關卡回傳 null
 */
export function deriveCubeMap(cs: ChapterSession, text: Text, preview?: { op: CubeOp; word: string } | null): CubeMapModel | null {
  const { spec, state } = cs;
  if (!spec.cube || !state.cube) return null;
  const def = spec.cube;
  const cube = state.cube;
  const layer = cube.pos[state.room]?.[2] ?? 0;
  const { cells, doors } = layoutAll(cs, text, cube, layer);
  const name = (room: string): string => text(spec.rooms[room]?.titleKey ?? room);
  let pv: MapPreview | null = null;
  if (preview) {
    const word = text(WORD_KEYS[preview.word as LeverWord] ?? preview.word);
    const r = applyOp(def, cube, preview.op);
    if (isBlocked(r)) {
      pv = { caption: text('ui.map.previewBlocked', { word }), blocked: text(TURN_BLOCK_MSG[r.blocked]), moved: null, doors: [] };
    } else {
      const from = cube.pos[preview.op.room];
      const to = r.pos[preview.op.room];
      const after = layoutAll(cs, text, r, layer).doors;
      const changed = after.filter(a => { const b = doors.find(d => d.door === a.door && d.room === a.room); return !b || b.link !== a.link || b.via !== a.via || b.x !== a.x || b.y !== a.y; });
      pv = { caption: text('ui.map.preview', { word }), blocked: null, moved: { room: preview.op.room, name: name(preview.op.room), from: [from[0], from[1]], to: [to[0], to[1]] }, doors: changed };
    }
  }
  const light = mapLight(def, cube, layer, sessionUncovered(cs));
  const ink = mapInk(def, cube, activeInk(cs.spec, cs.state, cs.world));
  const multi = def.dims[2] > 1;
  return {
    title: text('ui.map.title'),
    cols: mapCols(def), rows: def.dims[1], cells, doors,
    // v0.4 第五章 三層並排：東 / 西兩側的屋框落在層與層之間的空欄 → 寫在格內 (inCell)，不壓到隔壁層
    frames: def.frame.filter(f => multi || f.at[2] === layer).map(f => ({
      x: f.at[0] + panelX(def, f.at[2]), y: f.at[1], side: f.side, kind: f.kind, name: frameName(text, f.kind, f.to),
      ...(def.dims[2] > 2 && (f.side === 'E' || f.side === 'W') ? { inCell: true } : {})
    })),
    ...(multi ? { layers: layerPanels(def, text) } : {}),
    preview: pv,
    hint: text('ui.map.hint'),
    legend: {
      open: text('ui.map.legend.open'), wall: text('ui.map.legend.wall'), arch: text('ui.map.legend.arch'), you: text('ui.map.you'),
      ...(light ? { stained: text('ui.map.legend.stained'), white: text('ui.map.legend.white') } : {})
    },
    ...(light ? { light } : {}),
    ...(ink ? { ink } : {})
  };
}

/**
 * v0.4 第四章 墨流圖層 (core/chapter inkPaths)：每間有管線的房一筆一筆列出 (多層並排的位移已套上)；有墨流過的管線、收到墨的匯點、墨停住的地方
 */
export function mapInk(def: CubeDef, cube: CubeState, active: ReadonlySet<string>): MapInk | undefined {
  if (!def.ink) return undefined;
  const p = inkPaths(def, cube, active);
  const out: MapInk = { pipes: [], stops: [], sinks: [] };
  const lit = new Set(p.flows.flatMap(f => f.steps.map(s => s.room)));
  for (const [room, rp] of Object.entries(def.ink)) {
    const c = cube.pos[room];
    if (!c) continue;
    const rot = cube.rot[room] ?? 0;
    const x = c[0] + panelX(def, c[2]), y = c[1];
    for (const [a, b] of rp.pipes ?? []) out.pipes.push({ x, y, a: rotateSide(a, rot), b: rotateSide(b, rot), lit: lit.has(room) });
    if (rp.source) out.pipes.push({ x, y, a: rotateSide(rp.source, rot), b: rotateSide(rp.source, rot), lit: active.has(room) });
    for (const sd of rp.sinks ?? []) out.sinks.push({ x, y, side: rotateSide(sd, rot), lit: (p.sinks[room] ?? []).includes(sd) });
  }
  for (const f of p.flows) if (f.stop) {
    const st = f.stop;
    // 停在牆外：畫在停下前那一格的出口 (= stop.at 的反向鄰格)
    const prev = f.steps[f.steps.length - 1];
    if (prev?.out) out.stops.push({ x: prev.cell[0] + panelX(def, prev.cell[2]), y: prev.cell[1], side: prev.out });
    else out.stops.push({ x: st.at[0] + panelX(def, st.at[2]), y: st.at[1], side: st.side });
  }
  return out;
}

/** 光路走的「車道」(格內偏右下；同 ui/cubeMap LANE)：格 (x, y) 裡的轉折點 */
const LANE = 0.72;
const SIDE_VEC: Readonly<Record<Side, readonly [number, number]>> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], U: [0, 0], D: [0, 0] };

/**
 * 展開圖的光路圖層 (第三章；魔方沒有彩繪玻璃 = undefined)：core/chapter lightPaths 的結果換成格座標的折線——
 * 每扇天窗：屋框外 → 第一格的邊 (白光) → 格內車道點 (白光：還沒穿過任何房) → 出去的那一側的邊 (穿過玻璃的光) → 下一格…；
 * 停在牆外 = 撞上的那一格那一側的邊 (短橫槓)，停在房內 = 最後那格的車道點 (圓點)。窗記號 = 每間房有玻璃 (沒被蓋住) 的那幾側，稜鏡 = 兩側；
 * uncovered = 此刻露出來的被蓋住的玻璃 (`room.side`；3-4b 巨根縮小後的苔窗；core/chapter sessionUncovered)
 */
export function mapLight(def: CubeDef, cube: CubeState, layer: number, uncovered: ReadonlySet<string> = new Set()): MapLight | undefined {
  if (!def.glass) return undefined;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  // v0.4 第四章 多層魔方：所有層的光都畫 (各層並排的位移)
  const multi = def.dims[2] > 1;
  const px = (c: Cell) => panelX(def, c[2]);
  const lane = (c: Cell) => ({ x: r3(c[0] + px(c) + LANE), y: r3(c[1] + LANE) });
  // 邊上的點：沿著光前進的方向在車道上 (N / S 邊取車道的 x、E / W 邊取車道的 y)
  const edge = (c: Cell, side: Side) => {
    const [dx, dy] = SIDE_VEC[side];
    return { x: r3(px(c) + (dx ? c[0] + 0.5 + dx * 0.5 : c[0] + LANE)), y: r3(dy ? c[1] + 0.5 + dy * 0.5 : c[1] + LANE) };
  };
  const out: MapLight = { segs: [], stops: [], glass: [], prisms: [] };
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }, white: boolean) => out.segs.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, white });
  for (const beam of lightPaths(def, cube, uncovered).beams) {
    if (!multi && beam.source[2] !== layer) continue;
    const e0 = edge(beam.source, beam.side);
    const [dx, dy] = SIDE_VEC[beam.side];
    seg({ x: r3(e0.x + dx * 0.32), y: r3(e0.y + dy * 0.32) }, e0, true);
    beam.steps.forEach((st, i) => {
      const mid = lane(st.cell);
      seg(edge(st.cell, st.from), mid, i === 0);
      if (st.out) seg(mid, edge(st.cell, st.out), false);
    });
    const last = beam.steps[beam.steps.length - 1];
    if (beam.stop) { const p = edge(beam.stop.at, beam.stop.side); out.stops.push({ ...p, kind: 'wall', side: beam.stop.side }); }
    else if (last) out.stops.push({ ...lane(last.cell), kind: 'room', side: last.from });
  }
  for (const [room, c] of Object.entries(cube.pos)) {
    const g = def.glass[room];
    if (!g || (!multi && c[2] !== layer)) continue;
    const rot = cube.rot[room] ?? 0;
    for (const side of g.glass) if (!g.covered?.includes(side) || uncovered.has(`${room}.${side}`)) out.glass.push({ x: c[0] + px(c), y: c[1], side: rotateSide(side, rot) });
    for (const [a, b] of g.prism ?? []) out.prisms.push({ x: c[0] + px(c), y: c[1], a: rotateSide(a, rot), b: rotateSide(b, rot) });
  }
  return out;
}

/**
 * v0.4 第四章 多層魔方 (規格 6「第四章共用規則」層轉的轉動模式)：各層並排畫在同一張格上——上層在左、往右依序往下；
 * 層 z 的 x 位移 = (寬 + 1) × (層數 − 1 − z)，中間空一欄。單層魔方 = 0
 */
export const panelX = (def: CubeDef, z: number): number => (def.dims[2] > 1 ? (def.dims[2] - 1 - z) * (def.dims[0] + 1) : 0);
/** 展開圖的欄數 (多層 = 各層並排 + 層間的空欄) */
const mapCols = (def: CubeDef): number => def.dims[0] * def.dims[2] + Math.max(0, def.dims[2] - 1);
/** 各層的名稱與起始欄 (兩層：上層 / 下層 (第四章)；v0.4 第五章 三層：頂層 / 中層 / 底層) */
function layerPanels(def: CubeDef, text: Text): Array<{ x: number; w: number; name: string }> {
  const L = def.dims[2];
  const key = (z: number) => (L === 3 ? ['ui.map.layer.bottom', 'ui.map.layer.mid', 'ui.map.layer.top'][z] : z === L - 1 ? 'ui.map.layer.upper' : 'ui.map.layer.lower');
  return Array.from({ length: L }, (_, k) => L - 1 - k).map(z => ({ x: panelX(def, z), w: def.dims[0], name: text(key(z)) }));
}
/** 多層魔方：所有層的格與門 (依位移並排)；單層：只畫 layer 那一層 (原樣) */
function layoutAll(cs: ChapterSession, text: Text, cube: CubeState, layer: number): { cells: MapCell[]; doors: MapDoor[] } {
  const def = cs.spec.cube!;
  if (def.dims[2] <= 1) return layout(cs, text, cube, layer);
  const cells: MapCell[] = [];
  const doors: MapDoor[] = [];
  for (let z = def.dims[2] - 1; z >= 0; z--) {
    const dx = panelX(def, z);
    const l = layout(cs, text, cube, z);
    cells.push(...l.cells.map(c => ({ ...c, x: c.x + dx })));
    doors.push(...l.doors.map(d => ({ ...d, x: d.x + dx })));
  }
  return { cells, doors };
}

/** 某個魔方狀態在 layer 層的格 (房名 / 空格 / 實心) 與門位接通狀態 (現況與預覽共用) */
function layout(cs: ChapterSession, text: Text, cube: CubeState, layer: number): { cells: MapCell[]; doors: MapDoor[] } {
  const { spec, state } = cs;
  const def = spec.cube!;
  const name = (room: string): string => text(spec.rooms[room]?.titleKey ?? room);
  const cells: MapCell[] = [];
  for (let y = 0; y < def.dims[1]; y++) {
    for (let x = 0; x < def.dims[0]; x++) {
      const c = cellContent(def, cube, [x, y, layer]);
      // v0.4 第五章 走廊格 (梁上走道)：畫成一段木梁 (beam = 連到哪幾個鄰格：此刻的面心鄰格)
      const corridor = !!def.corridors?.includes(c);
      const kind = c === 'empty' || c === 'solid' ? c : corridor ? 'corridor' : 'room';
      if (kind === 'corridor') {
        const shortKey = spec.rooms[c]?.shortKey;
        cells.push({ x, y, kind, room: c, name: name(c), ...(shortKey ? { short: text(shortKey) } : {}), current: false, beam: beamSides(def, [x, y, layer]) });
        continue;
      }
      const fp = kind === 'room' ? spec.rooms[c]?.decor?.find(d => d.kind === 'floorPiece') : undefined;
      const piece = fp && typeof fp.px === 'number' && typeof fp.py === 'number' && typeof fp.drawing === 'string' ? { px: fp.px, py: fp.py, drawing: fp.drawing } : undefined;
      // 實心格的名稱：魔方資料的 label (第三章：工具間 / 水塔)；沒有 = 「實心」
      const solidKey = kind === 'solid' ? def.cells.find(k => k.room === 'solid' && k.at[0] === x && k.at[1] === y && k.at[2] === layer)?.label ?? 'ui.map.solid' : '';
      const shortKey = kind === 'room' ? spec.rooms[c]?.shortKey : undefined;
      cells.push({ x, y, kind, room: kind === 'room' ? c : null, name: kind === 'room' ? name(c) : text(kind === 'empty' ? 'ui.map.empty' : solidKey), ...(shortKey ? { short: text(shortKey) } : {}), current: c === state.room, ...(piece ? { piece } : {}) });
    }
  }
  const ls = chapterLinks(spec, cube, cs.world.ext.labels ?? state.labels);
  const doors: MapDoor[] = spec.doors
    .filter(d => cube.pos[d.room]?.[2] === layer && (!d.hole || ls.some(k => k.from.room === d.room && k.from.door === d.door)))
    .map(d => {
      const l = ls.find(k => k.from.door === d.door && k.from.room === d.room);
      // 門的方向 = 此刻的世界方位 (房間轉過 / 傾倒也對；core/cube rotateSide)
      const base = { room: d.room, door: d.door, x: cube.pos[d.room][0], y: cube.pos[d.room][1], side: rotateSide(d.side, cube.rot[d.room] ?? 0), kind: d.kind };
      if (!l) return { ...base, link: 'wall' as const };
      return 'frame' in l.to ? { ...base, link: 'frame' as const } : { ...base, link: 'room' as const, via: l.kind };
    });
  return { cells, doors };
}

/** 走廊格連到的鄰格 (世界方位)：在魔方內、是面心格 (三個座標恰有兩個在中間) 的那幾側 */
function beamSides(def: CubeDef, at: Cell): Side[] {
  const mid = (c: Cell) => c.filter((v, i) => v === (def.dims[i] - 1) / 2).length === 2;
  return SIDES.filter(s => { const c = addSide(at, s); return inCube(def, c) && mid(c); });
}

/** 目前該顯示哪個拉桿的預覽 (2D、附近有拉桿) */
export function previewFor(cs: ChapterSession): { op: CubeOp; word: string } | null {
  const lv = previewLever(cs.world);
  if (!lv || lv.def.type !== 'lever') return null;
  const word = leverWord(cs.world, lv);
  return { op: leverOp(cs.state.room, word), word };
}

// ── v0.4 轉動模式 (控制盤；architecture 4.16.1) ──

/** 「轉」頁籤 (控制盤章節才有；不能進轉動模式時反灰並說明原因) */
export function turnTab(cs: ChapterSession, text: Text, active: boolean, overlay = false): CubeMapModel['tab'] {
  if (!isDialChapter(cs.spec)) return null;
  const why = turnModeDenied(cs.world, overlay);
  return { label: text('ui.turn.tab'), enabled: why === null, reason: why === null ? null : text(TURN_MODE_DENY_MSG[why]), active };
}

const sameTurn = (a: { group: string; dir: TurnDir } | null, b: { group: string; dir: TurnDir }): boolean => !!a && a.group === b.group && a.dir === b.dir;

const GROUP_KEYS: Readonly<Record<TurnHeader['kind'], string>> = {
  row: 'ui.turn.group.row', col: 'ui.turn.group.col', slideCell: 'ui.turn.group.cell', layer: 'ui.turn.group.layer', slice: 'ui.turn.group.slice', spin: 'ui.turn.group.spin'
};
/** v0.4 第五章 星環盤：軸的名稱 (東西軸 / 南北軸 / 上下軸) 與片的名稱 (index 0 / 1 / 2) */
const AXIS_KEYS: Readonly<Record<'x' | 'y' | 'z', string>> = { x: 'ui.turn.ring.x', y: 'ui.turn.ring.y', z: 'ui.turn.ring.z' };
const PART_KEYS: Readonly<Record<'x' | 'y' | 'z', readonly string[]>> = {
  x: ['ui.turn.part.west', 'ui.turn.part.mid', 'ui.turn.part.east'],
  y: ['ui.turn.part.north', 'ui.turn.part.mid', 'ui.turn.part.south'],
  z: ['ui.turn.part.bottom', 'ui.turn.part.mid', 'ui.turn.part.top']
};
/** 星環盤的鎖：星釘 (形狀與卡住的楔形不同) */
const STAR_GLYPH = '\u2726';
/** 一組的顯示名稱 (第 1 列 / 第 2 行 / 第 1 層…) */
const groupName = (text: Text, kind: TurnHeader['kind'], index: number, layers = 1): string =>
  kind === 'layer' && layers === 2 ? text(index === 1 ? 'ui.turn.layer.upper' : 'ui.turn.layer.lower') : text(GROUP_KEYS[kind], { n: index + 1 });

/**
 * 轉動模式的資料 (純函式，只算不寫：不改 session 也不改 World)：標頭箭頭 (每組 × 方向一顆；鎖住 / 卡住另標)、選取的預覽 (轉後的格與門、移動的房間)、
 * 墨量、能否回退、選到的轉動會不會被擋 (預覽時就顯示原因)
 */
export function deriveTurnMode(cs: ChapterSession, text: Text, sel: TurnModeModel['selected']): TurnModeModel {
  const { spec, state } = cs;
  const def = spec.cube!;
  const cube = state.cube!;
  // v0.4 第五章：鎖扣限定房間、人不在那幾間房的組不列 (例：不在東窗沒有「東窗的窗框」)
  // v0.4 第五章 縮影 (5-1a)：人在縮影裡只列縮影的頂 / 底 (miniOnly)；縮影外不列它們
  const all = (def.dial?.groups ?? []).filter(g => groupInReach(spec, g.id, cs.world) && !groupHidden(spec, state, g.id));
  const groups = all.filter(g => g.kind !== 'slideCell');
  const headers: TurnHeader[] = [];
  /** 標頭的名稱 (不含「鎖著」)：說明列用 */
  const names = new Map<string, string>();
  // v0.4 第五章 星環盤 (切片 / 原地轉)：標頭不畫在格子旁，改列在轉動卡片上的星環盤 (每軸一列、每個原地轉一列)
  const ring = groups.some(g => g.kind === 'slice' || g.kind === 'spin');
  if (ring) {
    const { rings, heads } = ringHeaders(cs, text, groups, sel, names);
    headers.push(...heads);
    return finishTurnMode(cs, text, sel, all, headers, names, rings);
  }
  for (const g of groups) {
    const locked = isLocked(spec, state, g.id, cs.world);
    for (const dir of turnDirs(def, g.id)) {
      const jam = !locked && dialBlocked(cs, { group: g.id, dir }) === 'jammed';
      // v0.4 第四章 多層魔方的層轉：畫在那一層的下方 (↺ 偏左、↻ 偏右；i = 欄位，可為小數)
      const panel = g.kind === 'layer' && def.dims[2] > 1;
      const side: TurnHeader['at']['side'] = g.kind === 'row' ? (dir === -1 ? 'left' : 'right')
        : g.kind === 'col' ? (dir === -1 ? 'top' : 'bottom') : panel ? 'bottom' : 'ring';
      const at = panel ? panelX(def, g.index) + (dir === -1 ? 0.4 : def.dims[0] - 1.4) : g.index;
      const glyph = g.kind === 'row' ? (dir === -1 ? '\u25C0' : '\u25B6')
        : g.kind === 'col' ? (turnDirs(def, g.id).length === 1 ? '\u21C5' : dir === -1 ? '\u25B2' : '\u25BC')
          : dir === 1 ? '\u21BB' : '\u21BA';
      const dirKey = g.kind === 'row' ? (dir === -1 ? 'ui.turn.dir.left' : 'ui.turn.dir.right')
        : g.kind === 'col' ? (turnDirs(def, g.id).length === 1 ? 'ui.turn.dir.swap' : dir === -1 ? 'ui.turn.dir.up' : 'ui.turn.dir.down')
          : dir === 1 ? 'ui.turn.dir.cw' : 'ui.turn.dir.ccw';
      const plain = text('ui.turn.header', { group: groupName(text, g.kind, g.index, def.dims[2]), dir: text(dirKey) });
      names.set(`${g.id}|${dir}`, plain);
      headers.push({
        group: g.id, kind: g.kind, dir, state: locked ? 'locked' : jam ? 'jammed' : 'ok', at: { side, i: at }, glyph,
        label: locked ? text('ui.turn.headerLocked', { name: plain }) : plain,
        selected: sameTurn(sel, { group: g.id, dir })
      });
    }
  }
  const layer = cube.pos[state.room]?.[2] ?? 0;
  const slide = all.some(g => g.kind === 'slideCell');
  if (slide) headers.push(...slideHeaders(cs, text, sel, layer, names));
  return finishTurnMode(cs, text, sel, all, headers, names);
}

/**
 * v0.4 第五章 星環盤的列與鈕 (純函式)：三軸 (東西 / 南北 / 上下) 依序一列、列內依片序 × ↺ ↻；每個原地轉 (spin：窗框…) 各一列。
 * 鎖住 = 星釘、卡住 = 楔形 (形狀區分)；at.side = 'ring'、ring = 第幾列第幾顆
 */
function ringHeaders(cs: ChapterSession, text: Text, groups: readonly TurnGroup[], sel: TurnModeModel['selected'], names: Map<string, string>): { rings: NonNullable<TurnModeModel['rings']>; heads: TurnHeader[] } {
  const { spec, state } = cs;
  const def = spec.cube!;
  const rings: NonNullable<TurnModeModel['rings']> = [];
  const heads: TurnHeader[] = [];
  const add = (row: number, list: readonly TurnGroup[]) => {
    let col = 0;
    for (const g of list) {
      const locked = isLocked(spec, state, g.id, cs.world);
      const axis = g.axis ?? 'z';
      const part = g.kind === 'slice' ? text(PART_KEYS[axis][Math.min(2, g.index)] ?? 'ui.turn.part.mid') : '';
      const groupLabel = g.kind === 'slice' ? text('ui.turn.slice', { axis: text(AXIS_KEYS[axis]), part }) : rings[row].name;
      for (const dir of turnDirs(def, g.id)) {
        const jam = !locked && dialBlocked(cs, { group: g.id, dir }) === 'jammed';
        const plain = text('ui.turn.header', { group: groupLabel, dir: text(dir === 1 ? 'ui.turn.dir.cw' : 'ui.turn.dir.ccw') });
        names.set(`${g.id}|${dir}`, plain);
        heads.push({
          group: g.id, kind: g.kind, dir, state: locked ? 'locked' : jam ? 'jammed' : 'ok', at: { side: 'ring', i: row }, ring: { row, col: col++ },
          glyph: dir === 1 ? '\u21BB' : '\u21BA', ...(part ? { sub: part } : {}), ...(locked ? { mark: STAR_GLYPH } : {}),
          label: locked ? text('ui.turn.headerLocked', { name: plain }) : jam ? text('ui.turn.headerJammed', { name: plain }) : plain,
          selected: sameTurn(sel, { group: g.id, dir })
        });
      }
    }
  };
  for (const axis of ['x', 'y', 'z'] as const) {
    const list = groups.filter(g => g.kind === 'slice' && (g.axis ?? 'z') === axis).sort((a, b) => a.index - b.index);
    if (!list.length) continue;
    rings.push({ name: text(AXIS_KEYS[axis]), kind: 'axis' });
    add(rings.length - 1, list);
  }
  for (const g of groups.filter(x => x.kind === 'spin')) {
    const room = g.room ? text(spec.rooms[g.room]?.shortKey ?? spec.rooms[g.room]?.titleKey ?? g.room) : '';
    const mini = def.dial?.miniOnly?.includes(g.id);
    rings.push({
      name: g.room ? text('ui.turn.ring.frame', { room })
        : mini ? text('ui.turn.ring.mini', { part: text(g.index === 0 ? 'ui.turn.mini.bottom' : 'ui.turn.mini.top') })
          : text('ui.turn.ring.face', { part: text(PART_KEYS[g.axis ?? 'z'][Math.min(2, g.index)]) }),
      kind: 'spin'
    });
    add(rings.length - 1, [g]);
  }
  return { rings, heads };
}

/** 轉動模式的共同收尾：墨量、選取的預覽 (轉後的格與門、移動的房間；星環盤另框出那一片的格子)、說明列 */
function finishTurnMode(cs: ChapterSession, text: Text, sel: TurnModeModel['selected'], all: readonly TurnGroup[], headers: TurnHeader[], names: Map<string, string>, rings?: TurnModeModel['rings']): TurnModeModel {
  const { spec, state } = cs;
  const def = spec.cube!;
  const cube = state.cube!;
  const layer = cube.pos[state.room]?.[2] ?? 0;
  const slide = all.some(g => g.kind === 'slideCell');
  const max = turnBudgetFor(spec, state, cs.world);
  const left = state.turns?.left ?? max;
  const g = sel ? all.find(x => x.id === sel.group) : undefined;
  const blocked = sel && g ? dialBlocked(cs, sel as Turn) : null;
  let preview: TurnModeModel['preview'] = null;
  let caption = text(slide ? 'ui.turn.hintSlide' : inMini(cs.world) ? 'ui.turn.hintMini' : rings ? 'ui.turn.hintRing' : 'ui.turn.hint');
  if (sel && g) {
    const label = names.get(`${sel.group}|${sel.dir}`) ?? groupName(text, g.kind, g.index, def.dims[2]);
    if (blocked) caption = text('ui.turn.previewBlocked', { what: label, why: blockText(cs, text, sel.group, blocked) });
    else {
      const r = applyTurn(def, cube, sel as Turn);
      if (!isBlocked(r)) {
        const after = layoutAll(cs, text, r, layer);
        const multi = def.dims[2] > 1;
        // 多層：被轉的那一層的房 (含原地只換朝向的中心格) 都框起來；單層：換了格的房
        const moves = Object.keys(cube.pos).filter(room => (multi || cube.pos[room][2] === layer) && (cube.pos[room][0] !== r.pos[room][0] || cube.pos[room][1] !== r.pos[room][1] || (multi && (cube.rot[room] ?? 0) !== (r.rot[room] ?? 0))))
          .map(room => { const dx = panelX(def, cube.pos[room][2]); return { room, name: text(spec.rooms[room]?.titleKey ?? room), from: [cube.pos[room][0] + dx, cube.pos[room][1]] as [number, number], to: [r.pos[room][0] + dx, r.pos[room][1]] as [number, number] }; });
        const light = mapLight(def, r, layer, sessionUncovered(cs));
        // 星環盤：被轉的那一片 (三層裡的格子；含空格) 描框
        const slab = rings ? cellsOf(def, cube, sel.group).map(c => [c[0] + panelX(def, c[2]), c[1]] as [number, number]) : null;
        preview = { cells: after.cells, doors: after.doors, moves, ...(light ? { light } : {}), ...(slab ? { slab } : {}) };
      }
      caption = text('ui.turn.preview', { what: label });
    }
  }
  return {
    headers, selected: sel && g ? sel : null, preview, ink: { left, max }, canUndo: (state.turns?.undo.length ?? 0) > 0,
    blocked: blocked ?? null, blockedText: blocked && sel ? blockText(cs, text, sel.group, blocked) : null,
    caption,
    text: { confirm: text('ui.turn.confirm'), undo: text('ui.turn.undo'), exit: text('ui.turn.exit'), ink: text('ui.turn.ink', { n: left, max }), keys: text(slide ? 'ui.turn.keysSlide' : rings ? 'ui.turn.keysRing' : 'ui.turn.keys') },
    ...(slide ? { cells: layout(cs, text, cube, layer).cells } : {}),
    ...(rings ? { rings } : {})
  };
}

/** 轉不動的說明：鎖住的組若有自己的說明 (DialLock.text；第四章「下圈年輪被樹根結住了。」) 用它，否則照 DIAL_BLOCK_MSG */
export function dialBlockKey(cs: ChapterSession, group: string | undefined, blocked: string): string {
  const lock = blocked === 'locked' && group !== undefined ? cs.spec.cube?.dial?.locks.find(l => l.group === group && l.text) : undefined;
  // v0.4 第五章 5-1b 卡住的組 (DialDef.jams) 的專屬說明
  const jam = blocked === 'jammed' && group !== undefined ? groupJam(cs.spec, cs.state, group, cs.world) : undefined;
  return lock?.text ?? jam?.text ?? DIAL_BLOCK_MSG[blocked as keyof typeof DIAL_BLOCK_MSG];
}
const blockText = (cs: ChapterSession, text: Text, group: string, blocked: string): string => text(dialBlockKey(cs, group, blocked));

/** 滑動的方向 → 箭頭符號 (上 = 北) 與方向的文字 */
const SLIDE_GLYPH: Readonly<Record<'N' | 'E' | 'S' | 'W', string>> = { N: '\u25B2', E: '\u25B6', S: '\u25BC', W: '\u25C0' };
const SLIDE_DIR_KEY: Readonly<Record<'N' | 'E' | 'S' | 'W', string>> = { N: 'ui.turn.dir.up', E: 'ui.turn.dir.right', S: 'ui.turn.dir.down', W: 'ui.turn.dir.left' };
/** 卡住的房：箭頭換成楔形 (形狀區分，不只靠顏色) */
const WEDGE_GLYPH = '\u25E2';
const RING: readonly ('N' | 'E' | 'S' | 'W')[] = ['N', 'E', 'S', 'W'];

/**
 * 滑動 (第三章 slideCell) 的標頭：每一間與空格相鄰的房 × 指向空格的方向一顆 (依格號、N E S W)；卡住 (卡榫) 的畫楔形 (state jammed)。
 * 實心格、空格、不鄰接空格的房不給標頭
 */
function slideHeaders(cs: ChapterSession, text: Text, sel: TurnModeModel['selected'], layer: number, names: Map<string, string>): TurnHeader[] {
  const def = cs.spec.cube!;
  const cube = cs.state.cube!;
  const out: TurnHeader[] = [];
  const [W, H] = def.dims;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const at: Cell = [x, y, layer];
    const room = cellContent(def, cube, at);
    if (room === 'empty' || room === 'solid') continue;
    const index = x + y * W + layer * W * H;
    const g = def.dial?.groups.find(k => k.kind === 'slideCell' && k.index === index);
    if (!g) continue;
    for (const dir of RING) {
      const to = addSide(at, dir);
      if (!inCube(def, to) || cellContent(def, cube, to) !== 'empty') continue;
      const jam = dialBlocked(cs, { group: g.id, dir }) === 'jammed';
      const plain = text('ui.turn.headerSlide', { room: text(cs.spec.rooms[room]?.titleKey ?? room), dir: text(SLIDE_DIR_KEY[dir]) });
      names.set(`${g.id}|${dir}`, plain);
      out.push({
        group: g.id, kind: 'slideCell', dir, state: jam ? 'jammed' : 'ok', at: { side: 'cell', i: index }, cell: { x, y },
        glyph: jam ? WEDGE_GLYPH : SLIDE_GLYPH[dir], label: jam ? text('ui.turn.headerJammed', { name: plain }) : plain, selected: sameTurn(sel, { group: g.id, dir })
      });
    }
  }
  return out;
}

/** 轉動模式的輸入：點標頭 (pick)、方向鍵 (step：h = ←→、v = ↑↓)、確認、回退、離開 */
export type TurnModeInput =
  | { t: 'pick'; group: string; dir: TurnDir } | { t: 'step'; axis: 'h' | 'v'; d: 1 | -1 }
  | { t: 'cell'; x: number; y: number }
  | { t: 'confirm' } | { t: 'undo' } | { t: 'exit' };

/** 轉動模式的說明 (只說明、不轉；外殼以 say 顯示)：key = 文字 key */
export interface TurnNote { key: string; params?: Readonly<Record<string, string>> }
type Sel = TurnModeModel['selected'];
type Reduced = { sel: Sel; command: ChapterCommand | null; exit: boolean; note?: TurnNote };

/** 在 list 裡選下一個 (現在選的不在 list → 第一個；wrap = 到尾端時回到第一個，否則 null = 取消選取) */
function cycle(sel: Sel, list: readonly TurnHeader[], wrap: boolean): Sel {
  if (!list.length) return sel;
  const i = list.findIndex(h => sameTurn(sel, h));
  if (i < 0) return { group: list[0].group, dir: list[0].dir };
  if (i + 1 < list.length) return { group: list[i + 1].group, dir: list[i + 1].dir };
  return wrap ? { group: list[0].group, dir: list[0].dir } : null;
}
const STEP_SIDE = (axis: 'h' | 'v', d: 1 | -1): Side => (axis === 'h' ? (d < 0 ? 'W' : 'E') : d < 0 ? 'N' : 'S');

/**
 * 滑動章節 (第三章) 的選取：方向鍵 = 選「往那個方向滑」的房 (同方向有兩間 → 再按換另一間；沒有 → 說明、選取不變)；
 * 點房間 = 選這間房的第一個滑動 (再點 → 下一個方向；最後一個再點 = 取消)；點空格 = 選滑進這個空格的房 (有兩間時再點換另一間)；
 * 點實心格 / 不鄰接空格的房 → 說明
 */
function reduceSlide(sel: Sel, input: Extract<TurnModeInput, { t: 'step' } | { t: 'cell' }>, m: TurnModeModel): Reduced {
  const none = { command: null, exit: false };
  const slides = m.headers.filter(h => h.kind === 'slideCell' && h.cell);
  if (input.t === 'step') {
    const side = STEP_SIDE(input.axis, input.d);
    const list = slides.filter(h => h.dir === side);
    if (!list.length) return { sel, ...none, note: { key: 'msg.dial.noDir' } };
    return { sel: cycle(sel, list, true), ...none };
  }
  const c = m.cells?.find(k => k.x === input.x && k.y === input.y);
  if (!c) return { sel, ...none };
  if (c.kind === 'solid') return { sel, ...none, note: { key: 'msg.dial.solid', params: { name: c.name } } };
  if (c.kind === 'room') {
    const own = slides.filter(h => h.cell!.x === c.x && h.cell!.y === c.y);
    if (!own.length) return { sel, ...none, note: { key: 'msg.dial.noEmpty' } };
    return { sel: cycle(sel, own, false), ...none };
  }
  const into = slides.filter(h => { const [dx, dy] = SIDE_STEP[h.dir as 'N' | 'E' | 'S' | 'W']; return h.cell!.x + dx === c.x && h.cell!.y + dy === c.y; });
  return { sel: cycle(sel, into, true), ...none };
}
const SIDE_STEP: Readonly<Record<'N' | 'E' | 'S' | 'W', readonly [number, number]>> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/**
 * 轉動模式的狀態轉移 (純函式)：pick = 選取 (再點同一顆 = 取消)；↑↓ = 換一組 (依控制盤順序循環)；
 * ←→ = 列選方向 (← 往左、→ 往右)，只有一個方向的組 (兩列的行) 改成換到左右相鄰的同類組；
 * confirm = 選了可轉的組 → 恰好一個 turn 指令 (並取消選取，圖回到轉後的現況)；被擋 → 不轉、選取保留；undo = 有可退的一步 → undo 指令；exit = 離開
 */
export function reduceTurnMode(sel: TurnModeModel['selected'], input: TurnModeInput, m: TurnModeModel): Reduced {
  const none = { command: null, exit: false };
  if (input.t === 'exit') return { sel: null, command: null, exit: true };
  if (input.t === 'undo') return { sel, command: m.canUndo ? { t: 'undo' } : null, exit: false };
  if (input.t === 'confirm') {
    const ok = !!sel && m.blocked === null && !!m.selected;
    // 轉了之後取消選取：展開圖回到「現在」的樣子 (轉後的結果看得到；要再轉一次就再選)
    return ok ? { sel: null, command: { t: 'turn', turn: { group: sel!.group, dir: sel!.dir } }, exit: false } : { sel, command: null, exit: false };
  }
  if (input.t === 'pick') {
    if (!m.headers.some(h => sameTurn({ group: input.group, dir: input.dir }, h))) return { sel, ...none };
    return { sel: sameTurn(sel, input) ? null : { group: input.group, dir: input.dir }, ...none };
  }
  // 滑動章節 (第三章)：方向鍵與點格子另有規則；列 / 行章節點格子不做事
  if (m.cells) return reduceSlide(sel, input, m);
  if (input.t === 'cell') return { sel, ...none };
  if (m.rings) return { sel: ringStep(sel, input, m), ...none };
  const groups = [...new Set(m.headers.map(h => h.group))];
  if (!groups.length) return { sel, ...none };
  const dirsOf = (g: string) => m.headers.filter(h => h.group === g).map(h => h.dir);
  const pick = (g: string, prefer?: TurnDir) => ({ group: g, dir: prefer !== undefined && dirsOf(g).includes(prefer) ? prefer : dirsOf(g)[dirsOf(g).length - 1] });
  if (!sel) return { sel: pick(groups[0], input.axis === 'h' ? input.d : undefined), ...none };
  const i = groups.indexOf(sel.group);
  if (input.axis === 'v') return { sel: pick(groups[(i + input.d + groups.length) % groups.length], sel.dir), ...none };
  const dirs = dirsOf(sel.group);
  if (dirs.length > 1) return { sel: { group: sel.group, dir: dirs.includes(input.d) ? input.d : sel.dir }, ...none };
  const kind = m.headers.find(h => h.group === sel.group)!.kind;
  const same = groups.filter(g => m.headers.find(h => h.group === g)!.kind === kind);
  const j = same.indexOf(sel.group);
  return { sel: pick(same[(j + input.d + same.length) % same.length]), ...none };
}

/**
 * v0.4 第五章 星環盤的方向鍵：↑↓ = 換一列 (循環；停在同一個位置，不夠就最後一顆)、←→ = 列內換一顆 (循環)；
 * 還沒選：↓ / ← / → = 第一列 (→ 第一顆、← 最後一顆)、↑ = 最後一列
 */
function ringStep(sel: Sel, input: Extract<TurnModeInput, { t: 'step' }>, m: TurnModeModel): Sel {
  const rows = (m.rings ?? []).map((_, r) => m.headers.filter(h => h.ring?.row === r).sort((a, b) => a.ring!.col - b.ring!.col)).filter(r => r.length);
  if (!rows.length) return sel;
  const pick = (h: TurnHeader): Sel => ({ group: h.group, dir: h.dir });
  const cur = sel ? m.headers.find(h => sameTurn(sel, h)) : undefined;
  const ri = cur ? rows.findIndex(r => r.includes(cur)) : -1;
  if (ri < 0) {
    if (input.axis === 'v') return pick((input.d > 0 ? rows[0] : rows[rows.length - 1])[0]);
    return pick(input.d > 0 ? rows[0][0] : rows[0][rows[0].length - 1]);
  }
  const ci = rows[ri].indexOf(cur!);
  if (input.axis === 'v') { const r = rows[(ri + input.d + rows.length) % rows.length]; return pick(r[Math.min(ci, r.length - 1)]); }
  return pick(rows[ri][(ci + input.d + rows[ri].length) % rows[ri].length]);
}

/** 方向軸的上一幀值 (轉動模式把「剛按下的方向」當成一步選取) */
export interface AxisMemo { x: number; z: number }

/**
 * 轉動模式中的一幀輸入 (純函式)：移動軸、跳躍與世界動作一律不送進世界 (世界照常推進，規格 Q-AF)；
 * 剛按下的方向 → step、Enter → confirm、undo 鍵 → undo、Esc / 轉動模式鍵 → exit
 */
export function turnModeFrame(input: InputFrame, prev: AxisMemo): { loop: LoopInput; inputs: TurnModeInput[]; axes: AxisMemo } {
  const inputs: TurnModeInput[] = [];
  const x = Math.sign(input.moveX);
  const z = Math.sign(input.moveZ);
  const has = (a: InputFrame['pressed'][number]) => input.pressed.includes(a);
  // 方向鍵 = 新按下的動作 (快速點按也抓得到)；WASD 只有移動軸 → 看軸「剛按下」(同一軸本幀有方向鍵就不重複算)
  const nh = has('navLeft') ? -1 : has('navRight') ? 1 : 0;
  const nv = has('navUp') ? -1 : has('navDown') ? 1 : 0;
  if (nh) inputs.push({ t: 'step', axis: 'h', d: nh });
  else if (x !== 0 && x !== prev.x) inputs.push({ t: 'step', axis: 'h', d: x as 1 | -1 });
  if (nv) inputs.push({ t: 'step', axis: 'v', d: nv });
  else if (z !== 0 && z !== prev.z) inputs.push({ t: 'step', axis: 'v', d: z as 1 | -1 });
  if (input.pressed.includes('confirm')) inputs.push({ t: 'confirm' });
  if (input.pressed.includes('undo')) inputs.push({ t: 'undo' });
  if (input.pressed.includes('cancel') || input.pressed.includes('turnMode')) inputs.push({ t: 'exit' });
  return { loop: { moveX: 0, moveZ: 0, jump: false, pressed: [] }, inputs, axes: { x, z } };
}

/** 2D HUD 的墨量小計 (控制盤章節、魔方儀已啟動、藏寶圖裡才顯示；形狀區分 ●○，不只靠顏色) */
export function inkHud(cs: ChapterSession, text: Text, renderMode: Mode): string | null {
  if (!isDialChapter(cs.spec) || !cs.state.dial || renderMode !== '2d') return null;
  const max = turnBudgetFor(cs.spec, cs.state, cs.world);
  const left = cs.state.turns?.left ?? max;
  return text('ui.turn.inkHud', { dots: inkDots(left, max), n: left, max });
}

/** 墨點：剩下的 = ●、用掉的 = ○ */
export const inkDots = (left: number, max: number): string => '\u25CF'.repeat(Math.max(0, left)) + '\u25CB'.repeat(Math.max(0, max - left));
