// 展開圖的資料推導 (純函式，Node 可測；ui/cubeMap.ts 只負責畫)：規格 5.4.1「展開圖」、mobile-controls 2.5
import type { ObjState, World } from '../core/types';
import type { Text } from '../text/text';
import { INTERACT_RANGE, PLAYER_H } from '../core/constants';
import { isActiveIn } from '../core/presence';
import { applyOp, cellContent, isBlocked, links, type Cell, type CubeOp, type FrameKind } from '../core/cube';
import type { ChapterSession } from '../core/chapter';
import { leverOp, TURN_BLOCK_MSG, WORD_KEYS, type LeverWord } from '../mechanics/cube';
import type { CubeMapModel, MapCell, MapDoor, MapPreview } from '../ui/cubeMap';

export type { CubeMapModel, MapCell, MapDoor, MapFrame, MapLink, MapPreview } from '../ui/cubeMap';

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
  porch: 'ui.map.frame.porch', chapterExit: 'ui.map.frame.chapterExit', skylight: 'ui.map.frame.skylight', study: 'ui.map.frame.study'
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
  const name = (room: string): string => text(spec.rooms[room]?.titleKey ?? room);
  const cells: MapCell[] = [];
  for (let y = 0; y < def.dims[1]; y++) {
    for (let x = 0; x < def.dims[0]; x++) {
      const c = cellContent(def, cube, [x, y, layer]);
      const kind = c === 'empty' || c === 'solid' ? c : 'room';
      cells.push({ x, y, kind, room: kind === 'room' ? c : null, name: kind === 'room' ? name(c) : text(kind === 'empty' ? 'ui.map.empty' : 'ui.map.solid'), current: c === state.room });
    }
  }
  const doorsAt = (pos: Readonly<Record<string, Cell>>, ls: ReturnType<typeof links>): MapDoor[] => spec.doors
    .filter(d => pos[d.room]?.[2] === layer)
    .map(d => {
      const l = ls.find(k => k.from.door === d.door && k.from.room === d.room);
      const base = { room: d.room, door: d.door, x: pos[d.room][0], y: pos[d.room][1], side: d.side, kind: d.kind };
      if (!l) return { ...base, link: 'wall' as const };
      return 'frame' in l.to ? { ...base, link: 'frame' as const } : { ...base, link: 'room' as const, via: l.kind };
    });
  const doors = doorsAt(cube.pos, links(def, cube, spec.doors));
  let pv: MapPreview | null = null;
  if (preview) {
    const word = text(WORD_KEYS[preview.word as LeverWord] ?? preview.word);
    const r = applyOp(def, cube, preview.op);
    if (isBlocked(r)) {
      pv = { caption: text('ui.map.previewBlocked', { word }), blocked: text(TURN_BLOCK_MSG[r.blocked]), moved: null, doors: [] };
    } else {
      const from = cube.pos[preview.op.room];
      const to = r.pos[preview.op.room];
      const after = doorsAt(r.pos, links(def, r, spec.doors));
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

/** 目前該顯示哪個拉桿的預覽 (2D、附近有拉桿) */
export function previewFor(cs: ChapterSession): { op: CubeOp; word: string } | null {
  const lv = previewLever(cs.world);
  if (!lv || lv.def.type !== 'lever') return null;
  return { op: leverOp(cs.state.room, lv.def.word), word: lv.def.word };
}
