// C1：core/cube.ts 魔方運算 (規格 5.4.1 接通規則、5.4.4 轉動運算；architecture 4.16)
import { describe, it, expect } from 'vitest';
import { applyOp, cellContent, cubeKey, initialCube, isBlocked, links, rotateSide, type CubeDef, type CubeState, type DoorInfo } from '../../../src/puzzle/core/cube';

// 第一章 2×2 (規格 6 第一章)：A 左上 [0,0]、B 右上 [1,0]、C 右下 [1,1]、D 左下 [0,1]
const CH1: CubeDef = {
  id: 'ch1', dims: [2, 2, 1], ops: 'slide',
  cells: [{ at: [1, 0, 0], room: 'stair' }, { at: [1, 1, 0], room: 'closet' }, { at: [0, 1, 0], room: 'foyer' }],
  frame: [{ at: [0, 1, 0], side: 'S', kind: 'porch' }, { at: [1, 1, 0], side: 'E', kind: 'chapterExit', to: 'study' }]
};
const DOORS: DoorInfo[] = [
  { room: 'foyer', door: 'archS', side: 'S', kind: 'arch' },
  { room: 'foyer', door: 'doorE', side: 'E', kind: 'door' },
  { room: 'stair', door: 'doorW', side: 'W', kind: 'door' },
  { room: 'stair', door: 'doorS', side: 'S', kind: 'door' },
  { room: 'closet', door: 'archN', side: 'N', kind: 'arch' },
  { room: 'closet', door: 'chapterE', side: 'E', kind: 'chapter' }
];
const S0 = initialCube(CH1);
const ok = (s: CubeState | { blocked: string }): CubeState => { if (isBlocked(s as never)) throw new Error(JSON.stringify(s)); return s as CubeState; };
const linkOf = (s: CubeState, door: string) => links(CH1, s, DOORS).find(l => l.from.door === door)?.to ?? null;

describe('魔方：初始排列與格內容', () => {
  it('S0：A 空、B 樓梯間、C 衣帽間、D 玄關；朝向 0', () => {
    expect(S0).toEqual({ pos: { stair: [1, 0, 0], closet: [1, 1, 0], foyer: [0, 1, 0] }, rot: { stair: 0, closet: 0, foyer: 0 } });
    expect([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]].map(c => cellContent(CH1, S0, c as [number, number, number]))).toEqual(['empty', 'stair', 'closet', 'foyer']);
  });

  it('實心格不在狀態裡，但佔格', () => {
    const def: CubeDef = { ...CH1, cells: [...CH1.cells, { at: [0, 0, 0], room: 'solid' }] };
    const s = initialCube(def);
    expect(Object.keys(s.pos)).not.toContain('solid');
    expect(cellContent(def, s, [0, 0, 0])).toBe('solid');
    expect(applyOp(def, s, { t: 'slide', room: 'foyer', dir: 'N' })).toEqual({ blocked: 'notEmpty' });
  });
});

describe('魔方：滑動', () => {
  it('滑進相鄰空格 (1-2c：玄關往上 → A)；不改輸入狀態', () => {
    const before = JSON.stringify(S0);
    const s1 = ok(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'N' }));
    expect(s1.pos.foyer).toEqual([0, 0, 0]);
    expect(cellContent(CH1, s1, [0, 1, 0])).toBe('empty');
    expect(JSON.stringify(S0)).toBe(before);
  });

  it('目標不是空格 → notEmpty；出界 → outOfCube；沒有這間房 → noRoom', () => {
    expect(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'E' })).toEqual({ blocked: 'notEmpty' });
    expect(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'W' })).toEqual({ blocked: 'outOfCube' });
    expect(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'S' })).toEqual({ blocked: 'outOfCube' });
    expect(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'U' })).toEqual({ blocked: 'outOfCube' });
    expect(applyOp(CH1, S0, { t: 'slide', room: 'nope', dir: 'N' })).toEqual({ blocked: 'noRoom' });
  });

  it('S1 → 衣帽間往左 → S2；S2 再往左出界；S2 衣帽間往右回 C (= S1)', () => {
    const s1 = ok(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'N' }));
    const s2 = ok(applyOp(CH1, s1, { t: 'slide', room: 'closet', dir: 'W' }));
    expect(s2.pos).toEqual({ stair: [1, 0, 0], closet: [0, 1, 0], foyer: [0, 0, 0] });
    expect(applyOp(CH1, s2, { t: 'slide', room: 'closet', dir: 'W' })).toEqual({ blocked: 'outOfCube' });
    expect(cubeKey(ok(applyOp(CH1, s2, { t: 'slide', room: 'closet', dir: 'E' })))).toBe(cubeKey(s1));
  });

  it('確定性：同一動作序列兩次執行，每一步的狀態都相同', () => {
    const seq = [{ room: 'foyer', dir: 'N' }, { room: 'closet', dir: 'W' }, { room: 'closet', dir: 'W' }, { room: 'closet', dir: 'E' }, { room: 'stair', dir: 'S' }] as const;
    const run = () => {
      const out: string[] = [];
      let s = S0;
      for (const o of seq) {
        const r = applyOp(CH1, s, { t: 'slide', ...o });
        if (!isBlocked(r)) s = r;
        out.push(isBlocked(r) ? r.blocked : cubeKey(s));
      }
      return out;
    };
    expect(run()).toEqual(run());
    expect(run()).toEqual(['closet@1,1,0r0;foyer@0,0,0r0;stair@1,0,0r0', 'closet@0,1,0r0;foyer@0,0,0r0;stair@1,0,0r0', 'outOfCube', 'closet@1,1,0r0;foyer@0,0,0r0;stair@1,0,0r0', 'notEmpty']);
  });
});

describe('魔方：連接表 (規格 6 第一章「接法」)', () => {
  it('S0：大門 → 玄關 S 拱門；玄關 E 門後是牆 (衣帽間那面沒有門)；衣帽間章門對著書房走廊；樓梯間兩門都接不到', () => {
    expect(linkOf(S0, 'archS')).toEqual({ frame: 'porch' });
    expect(linkOf(S0, 'doorE')).toBeNull();
    expect(linkOf(S0, 'chapterE')).toEqual({ frame: 'study' });
    expect(linkOf(S0, 'doorW')).toBeNull();
    expect(linkOf(S0, 'doorS')).toEqual({ room: 'closet', door: 'archN' });
  });

  it('S1：玄關 E ↔ 樓梯間 W；樓梯間 S ↔ 衣帽間 N (門對拱門 = 門，只有人能過)；玄關南拱門面對空格', () => {
    const s1 = ok(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'N' }));
    const all = links(CH1, s1, DOORS);
    expect(all.find(l => l.from.door === 'doorE')).toEqual({ from: { room: 'foyer', door: 'doorE' }, to: { room: 'stair', door: 'doorW' }, kind: 'door' });
    expect(all.find(l => l.from.door === 'doorW')?.to).toEqual({ room: 'foyer', door: 'doorE' });
    expect(all.find(l => l.from.door === 'doorS')).toEqual({ from: { room: 'stair', door: 'doorS' }, to: { room: 'closet', door: 'archN' }, kind: 'door' });
    expect(linkOf(s1, 'archS')).toBeNull();
    expect(linkOf(s1, 'chapterE')).toEqual({ frame: 'study' });
  });

  it('S2：衣帽間 N 拱門 ↔ 玄關 S 拱門 (拱門對拱門 = arch)；衣帽間章門面對空格', () => {
    const s2 = ok(applyOp(CH1, ok(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'N' })), { t: 'slide', room: 'closet', dir: 'W' }));
    const all = links(CH1, s2, DOORS);
    expect(all.find(l => l.from.door === 'archN')).toEqual({ from: { room: 'closet', door: 'archN' }, to: { room: 'foyer', door: 'archS' }, kind: 'arch' });
    expect(all.find(l => l.from.door === 'archS')?.kind).toBe('arch');
    expect(linkOf(s2, 'chapterE')).toBeNull();
    expect(linkOf(s2, 'doorE')).toEqual({ room: 'stair', door: 'doorW' });
  });

  it('章門只接 chapterExit 屋框；一般門可接其他屋框；連接表兩向對稱', () => {
    const def: CubeDef = { ...CH1, frame: [{ at: [0, 1, 0], side: 'S', kind: 'porch' }, { at: [1, 1, 0], side: 'E', kind: 'porch' }] };
    expect(links(def, S0, DOORS).some(l => l.from.door === 'chapterE')).toBe(false);
    const s1 = ok(applyOp(CH1, S0, { t: 'slide', room: 'foyer', dir: 'N' }));
    for (const l of links(CH1, s1, DOORS)) {
      if (!('room' in l.to)) continue;
      const back = links(CH1, s1, DOORS).find(x => x.from.door === (l.to as { door: string }).door);
      expect(back?.to).toEqual(l.from);
    }
  });

  it('朝向：rotateSide 順時針 (N→E→S→W)，U / D 不變', () => {
    expect(['N', 'E', 'S', 'W', 'U', 'D'].map(s => rotateSide(s as never, 1))).toEqual(['E', 'S', 'W', 'N', 'U', 'D']);
    expect(rotateSide('W', 3)).toBe('S');
    const rotated: CubeState = { ...S0, rot: { ...S0.rot, closet: 1 } }; // 衣帽間轉 90°：N 拱門朝 E (書房走廊)，不再接樓梯間
    expect(linkOf(rotated, 'doorS')).toBeNull();
    expect(linkOf(rotated, 'archN')).toEqual({ frame: 'study' });
  });
});
