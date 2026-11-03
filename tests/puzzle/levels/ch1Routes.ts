// 第一章的共用路線 (runScript 指令) 與章節工具：1-3.test 用來從 1-2 開頭一路打到章末
// (1-2 的路線同 levels/1-2.test 的 SOLVE_D / ROUTE_GAP / SOLVE_A / SOLVE_B 與 ch1Cube.test 的 TO_EXIT_AREA；此處只走路線、不在題間斷言)
import { expect } from 'vitest';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { openChapter, type ChapterSession, type ChapterSpec, type ChapterState } from '../../../src/puzzle/core/chapter';
import { findTarget } from '../../../src/puzzle/core/interact';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import type { Cmd } from '../../../src/puzzle/devtools/runScript';
import type { GameEvent } from '../../../src/puzzle/core/types';
import { TEXT } from '../msgs';

export const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
export const CH1 = CUBE_CHAPTERS[0];
export const SPEC: ChapterSpec = { chapter: CH1.chapter, cube: CH1.cube, rooms: CH1.rooms, doors: chapterDoors(CH1.rooms) };
/** 新玩家開章 (從大門 → 玄關南拱門) */
export const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH1.start, CH1.legacy), OPTS);
export const open = (st: ChapterState): ChapterSession => openChapter(SPEC, st, OPTS);

/** 魔方排列：S0 / S1 (1-2c 後) / S2 (1-3a 拉「左」後) */
export const S0 = { pos: { stair: [1, 0, 0], closet: [1, 1, 0], foyer: [0, 1, 0] }, rot: { stair: 0, closet: 0, foyer: 0 } } as const;
export const S1 = { pos: { stair: [1, 0, 0], closet: [1, 1, 0], foyer: [0, 0, 0] }, rot: { stair: 0, closet: 0, foyer: 0 } } as const;
export const S2 = { pos: { stair: [1, 0, 0], closet: [0, 1, 0], foyer: [0, 0, 0] }, rot: { stair: 0, closet: 0, foyer: 0 } } as const;

export interface Pumped { cs: ChapterSession; kinds: string[]; events: GameEvent[] }
/**
 * 取走世界送出的事件並交給章節層 (同 LevelSession：door / turnRequest / objCross / flag；labelOpen / card 只回報)；
 * 換房後同一批剩下的事件丟棄 (LevelSession 換房即重建世界)
 */
export function pump(cs: ChapterSession): Pumped {
  const kinds: string[] = [];
  const events = cs.world.events.splice(0).filter(e => e.t !== 'switch' && e.t !== 'switchDenied');
  for (const e of events) {
    if (e.t === 'labelOpen' || e.t === 'card') { kinds.push(e.t); continue; }
    const r = applyChapterEvent(cs, e, OPTS);
    kinds.push(r.kind);
    if (r.kind === 'enter') return { cs: r.next, kinds, events };
    if (r.kind === 'turn' || r.kind === 'state') cs = r.cs;
  }
  return { cs, kinds, events };
}

// ── 1-2 (同 1-2.test；字條與題間斷言省略) ──
const pullAt = (x: number): Cmd[] => [{ walkTo: [x, -5.3] }, { act: 'interact' }];
/** 1-2d：右 → 左 → 中 (取得詞卡「右」) */
export const R12_D: Cmd[] = [{ wait: 0.2 }, ...pullAt(-16), ...pullAt(-19), ...pullAt(-17.5)];
/** 路段 → 1-2a (筆尖) → 1-2b (踏板) → 出口區 */
export const R12_ABC: Cmd[] = [
  { walkTo: [-10.3, 2], zFirst: true }, { act: 'flip' }, { walkTo: [-4.5, null] }, { act: 'flip' }, { wait: 0.2 },
  { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 2] }, { walkTo: [6.1, null] },
  { act: 'flip' }, { hop: 1, until: w => w.player.onGround && w.player.y > 2.4 && w.player.x > 8.1 }, { walkTo: [8.5, null] }, { act: 'interact' },
  { act: 'flip' }, { walkTo: [null, 2] }, { walkTo: [5.4, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] },
  { walkTo: [null, -4.5] }, { hold: { moveZ: -1 }, seconds: 0.3 }, { walkTo: [5.6, null] }, { walkTo: [null, -5.4] }, { walkTo: [-0.1, null] },
  { act: 'flip' }, { wait: 0.1 }, { act: 'flip' },
  { walkTo: [1.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] }
];
export const FOYER_LEVER: Cmd[] = [{ walkTo: [15, -5.1] }, { expect: w => expect(findTarget(w)?.def.id).toBe('lever'), label: '玄關拉桿' }, { act: 'interact' }];
export const FOYER_DOOR_E: Cmd[] = [{ walkTo: [19.3, 0] }, { act: 'interact' }];
/** 樓梯間 (從西門進來) → 南門 */
export const STAIR_DOOR_S: Cmd[] = [{ wait: 0.1 }, { walkTo: [1.5, 4.3] }, { expect: w => expect(findTarget(w)?.def.id).toBe('doorS'), label: '樓梯間南門' }, { act: 'interact' }];

// ── 1-3 衣帽間 ──
/** 衣帽間：走到拉桿前 (3D) */
export const AT_CLOSET_LEVER: Cmd[] = [{ wait: 0.1 }, { walkTo: [2.5, -4.1] }, { expect: w => expect(findTarget(w)?.def.id).toBe('lever'), label: '衣帽間拉桿' }];
/** 衣帽間：先到木箱東側 (x=0.5)、從前方 (z=2.6) 繞到木箱正後方，往北推 (箱子半個身子壓進北拱門) */
export const PUSH_CRATE_NORTH: Cmd[] = [{ walkTo: [0.5, null] }, { walkTo: [null, 2.6] }, { walkTo: [-1.6, null] }, { walkTo: [null, -4.0] }];
/** 衣帽間 → 北拱門 */
export const CLOSET_ARCH: Cmd[] = [{ walkTo: [-1.2, -4.0] }, { expect: w => expect(findTarget(w)?.def.id).toBe('archN'), label: '北拱門' }, { act: 'interact' }];
/** 玄關 (從南拱門進來)：繞到木箱西側，往東推到掛鉤下 (箱心 x≈-14.8) */
export const PUSH_CRATE_TO_HOOK: Cmd[] = [{ wait: 0.1 }, { walkTo: [-18.6, null] }, { walkTo: [null, 3.7] }, { walkTo: [-15.7, null] }];
/** 2D 跳上箱頂、站到掛鉤正下方、E 取下 */
export const TAKE_KEY: Cmd[] = [
  { act: 'flip' }, { wait: 0.1 },
  { hop: 1, until: w => w.player.onGround && w.player.y > 1.05, label: '藏寶圖跳上箱頂' },
  { walkTo: [-14.8, null] },
  { expect: w => expect(findTarget(w)?.def.id).toBe('hook'), label: '站在箱頂對到掛鉤' },
  { act: 'interact' }
];
/** 玄關 → 南拱門 (回衣帽間) */
export const FOYER_ARCH: Cmd[] = [{ act: 'flip' }, { wait: 0.2 }, { walkTo: [-17, 5.2] }, { expect: w => expect(findTarget(w)?.def.id).toBe('archS'), label: '南拱門' }, { act: 'interact' }];
/** 衣帽間章門 */
export const CHAPTER_DOOR: Cmd[] = [{ walkTo: [6.3, 0] }, { expect: w => expect(findTarget(w)?.def.id).toBe('chapterE'), label: '章門' }, { act: 'interact' }];
