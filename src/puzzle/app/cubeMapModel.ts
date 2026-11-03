// 展開圖的資料推導 (純函式，Node 可測；ui/cubeMap.ts 只負責畫)：規格 5.4.1「展開圖」、mobile-controls 2.5
import type { ObjState, World } from '../core/types';
import type { Text } from '../text/text';
import { INTERACT_RANGE, PLAYER_H } from '../core/constants';
import { isActiveIn } from '../core/presence';
import { applyOp, applyTurn, cellContent, isBlocked, turnDirs, type Cell, type CubeOp, type CubeState, type FrameKind, type Turn } from '../core/cube';
import { chapterLinks, dialBlocked, isDialChapter, isLocked, turnBudgetFor, type ChapterCommand, type ChapterSession } from '../core/chapter';
import type { Mode } from '../core/types';
import type { LoopInput } from './loop';
import { leverOp, TURN_BLOCK_MSG, WORD_KEYS, type LeverWord } from '../mechanics/cube';
import { leverWord } from '../mechanics/labels';
import { DIAL_BLOCK_MSG, TURN_MODE_DENY_MSG, turnModeDenied } from '../mechanics/dial';
import type { InputFrame } from '../input/types';
import type { CubeMapModel, MapCell, MapDoor, MapPreview, TurnDir, TurnHeader, TurnModeModel } from '../ui/cubeMap';

export type { CubeMapModel, MapCell, MapDoor, MapFrame, MapLink, MapPreview, TurnHeader, TurnModeModel, TurnPreview } from '../ui/cubeMap';

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
  hall: 'ui.map.frame.hall', greenhouse: 'ui.map.frame.greenhouse'
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
  const { cells, doors } = layout(cs, text, cube, layer);
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
      const after = layout(cs, text, r, layer).doors;
      const changed = after.filter(a => { const b = doors.find(d => d.door === a.door && d.room === a.room); return !b || b.link !== a.link || b.via !== a.via || b.x !== a.x || b.y !== a.y; });
      pv = { caption: text('ui.map.preview', { word }), blocked: null, moved: { room: preview.op.room, name: name(preview.op.room), from: [from[0], from[1]], to: [to[0], to[1]] }, doors: changed };
    }
  }
  return {
    title: text('ui.map.title'),
    cols: def.dims[0], rows: def.dims[1], cells, doors,
    frames: def.frame.filter(f => f.at[2] === layer).map(f => ({ x: f.at[0], y: f.at[1], side: f.side, kind: f.kind, name: frameName(text, f.kind, f.to) })),
    preview: pv,
    hint: text('ui.map.hint'),
    legend: { open: text('ui.map.legend.open'), wall: text('ui.map.legend.wall'), arch: text('ui.map.legend.arch'), you: text('ui.map.you') }
  };
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
      const kind = c === 'empty' || c === 'solid' ? c : 'room';
      cells.push({ x, y, kind, room: kind === 'room' ? c : null, name: kind === 'room' ? name(c) : text(kind === 'empty' ? 'ui.map.empty' : 'ui.map.solid'), current: c === state.room });
    }
  }
  const ls = chapterLinks(spec, cube, cs.world.ext.labels ?? state.labels);
  const doors: MapDoor[] = spec.doors
    .filter(d => cube.pos[d.room]?.[2] === layer && (!d.hole || ls.some(k => k.from.room === d.room && k.from.door === d.door)))
    .map(d => {
      const l = ls.find(k => k.from.door === d.door && k.from.room === d.room);
      const base = { room: d.room, door: d.door, x: cube.pos[d.room][0], y: cube.pos[d.room][1], side: d.side, kind: d.kind };
      if (!l) return { ...base, link: 'wall' as const };
      return 'frame' in l.to ? { ...base, link: 'frame' as const } : { ...base, link: 'room' as const, via: l.kind };
    });
  return { cells, doors };
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
  row: 'ui.turn.group.row', col: 'ui.turn.group.col', slideCell: 'ui.turn.group.cell', layer: 'ui.turn.group.layer', slice: 'ui.turn.group.slice'
};
/** 一組的顯示名稱 (第 1 列 / 第 2 行 / 第 1 層…) */
const groupName = (text: Text, kind: TurnHeader['kind'], index: number): string => text(GROUP_KEYS[kind], { n: index + 1 });

/**
 * 轉動模式的資料 (純函式，只算不寫：不改 session 也不改 World)：標頭箭頭 (每組 × 方向一顆；鎖住 / 卡住另標)、選取的預覽 (轉後的格與門、移動的房間)、
 * 墨量、能否回退、選到的轉動會不會被擋 (預覽時就顯示原因)
 */
export function deriveTurnMode(cs: ChapterSession, text: Text, sel: TurnModeModel['selected']): TurnModeModel {
  const { spec, state } = cs;
  const def = spec.cube!;
  const cube = state.cube!;
  const groups = (def.dial?.groups ?? []).filter(g => !def.dial?.miniOnly?.includes(g.id) && g.kind !== 'slideCell');
  const headers: TurnHeader[] = [];
  /** 標頭的名稱 (不含「鎖著」)：說明列用 */
  const names = new Map<string, string>();
  for (const g of groups) {
    const locked = isLocked(spec, state, g.id, cs.world);
    for (const dir of turnDirs(def, g.id)) {
      const jam = !locked && dialBlocked(cs, { group: g.id, dir }) === 'jammed';
      const side: TurnHeader['at']['side'] = g.kind === 'row' ? (dir === -1 ? 'left' : 'right')
        : g.kind === 'col' ? (dir === -1 ? 'top' : 'bottom') : 'ring';
      const glyph = g.kind === 'row' ? (dir === -1 ? '\u25C0' : '\u25B6')
        : g.kind === 'col' ? (turnDirs(def, g.id).length === 1 ? '\u21C5' : dir === -1 ? '\u25B2' : '\u25BC')
          : dir === 1 ? '\u21BB' : '\u21BA';
      const dirKey = g.kind === 'row' ? (dir === -1 ? 'ui.turn.dir.left' : 'ui.turn.dir.right')
        : g.kind === 'col' ? (turnDirs(def, g.id).length === 1 ? 'ui.turn.dir.swap' : dir === -1 ? 'ui.turn.dir.up' : 'ui.turn.dir.down')
          : dir === 1 ? 'ui.turn.dir.cw' : 'ui.turn.dir.ccw';
      const plain = text('ui.turn.header', { group: groupName(text, g.kind, g.index), dir: text(dirKey) });
      names.set(`${g.id}|${dir}`, plain);
      headers.push({
        group: g.id, kind: g.kind, dir, state: locked ? 'locked' : jam ? 'jammed' : 'ok', at: { side, i: g.index }, glyph,
        label: locked ? text('ui.turn.headerLocked', { name: plain }) : plain,
        selected: sameTurn(sel, { group: g.id, dir })
      });
    }
  }
  const max = turnBudgetFor(spec, state, cs.world);
  const left = state.turns?.left ?? max;
  const g = sel ? groups.find(x => x.id === sel.group) : undefined;
  const blocked = sel && g ? dialBlocked(cs, sel as Turn) : null;
  let preview: TurnModeModel['preview'] = null;
  let caption = text('ui.turn.hint');
  if (sel && g) {
    const label = names.get(`${sel.group}|${sel.dir}`) ?? groupName(text, g.kind, g.index);
    if (blocked) caption = text('ui.turn.previewBlocked', { what: label, why: text(DIAL_BLOCK_MSG[blocked as keyof typeof DIAL_BLOCK_MSG]) });
    else {
      const r = applyTurn(def, cube, sel as Turn);
      if (!isBlocked(r)) {
        const layer = cube.pos[state.room]?.[2] ?? 0;
        const after = layout(cs, text, r, layer);
        const moves = Object.keys(cube.pos).filter(room => cube.pos[room][2] === layer && (cube.pos[room][0] !== r.pos[room][0] || cube.pos[room][1] !== r.pos[room][1]))
          .map(room => ({ room, name: text(spec.rooms[room]?.titleKey ?? room), from: [cube.pos[room][0], cube.pos[room][1]] as [number, number], to: [r.pos[room][0], r.pos[room][1]] as [number, number] }));
        preview = { cells: after.cells, doors: after.doors, moves };
      }
      caption = text('ui.turn.preview', { what: label });
    }
  }
  return {
    headers, selected: sel && g ? sel : null, preview, ink: { left, max }, canUndo: (state.turns?.undo.length ?? 0) > 0,
    blocked: blocked ?? null, blockedText: blocked ? text(DIAL_BLOCK_MSG[blocked as keyof typeof DIAL_BLOCK_MSG]) : null,
    caption,
    text: { confirm: text('ui.turn.confirm'), undo: text('ui.turn.undo'), exit: text('ui.turn.exit'), ink: text('ui.turn.ink', { n: left, max }), keys: text('ui.turn.keys') }
  };
}

/** 轉動模式的輸入：點標頭 (pick)、方向鍵 (step：h = ←→、v = ↑↓)、確認、回退、離開 */
export type TurnModeInput =
  | { t: 'pick'; group: string; dir: TurnDir } | { t: 'step'; axis: 'h' | 'v'; d: 1 | -1 }
  | { t: 'confirm' } | { t: 'undo' } | { t: 'exit' };

/**
 * 轉動模式的狀態轉移 (純函式)：pick = 選取 (再點同一顆 = 取消)；↑↓ = 換一組 (依控制盤順序循環)；
 * ←→ = 列選方向 (← 往左、→ 往右)，只有一個方向的組 (兩列的行) 改成換到左右相鄰的同類組；
 * confirm = 選了可轉的組 → 恰好一個 turn 指令 (並取消選取，圖回到轉後的現況)；被擋 → 不轉、選取保留；undo = 有可退的一步 → undo 指令；exit = 離開
 */
export function reduceTurnMode(sel: TurnModeModel['selected'], input: TurnModeInput, m: TurnModeModel): { sel: TurnModeModel['selected']; command: ChapterCommand | null; exit: boolean } {
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
