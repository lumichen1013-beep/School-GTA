// D3：mechanics/dial.ts (魔方儀、鎖扣開關、轉動模式的進入條件) + 原型占位的 2×3 測試魔方 (content/cubes/test-dial、levels/proto/dial)
import { describe, it, expect } from 'vitest';
import { dialTurn, newChapterState, openChapter, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { interact } from '../../../src/puzzle/core/interact';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { canEnterTurnMode, DIAL_BLOCK_MSG, turnModeDenied } from '../../../src/puzzle/mechanics/dial';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from '../../../src/puzzle/content/cubes/test-dial';
import { cubeChapterOf, CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { LEVELS, PROTO_LEVELS, levelById, protoLevelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { missingLevelKeys, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import type { World } from '../../../src/puzzle/core/types';
import { place, run } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const SPEC: ChapterSpec = { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, doors: chapterDoors(PROTO_DIAL_ROOMS) };
const open = (room = 'protoA'): ChapterSession => openChapter(SPEC, newChapterState(SPEC, room, null), OPTS);
/** 處理世界本幀的事件 (同 LevelSession：交給章節層) */
const drain = (cs: ChapterSession): ChapterSession => {
  for (const e of cs.world.events.splice(0)) {
    const r = applyChapterEvent(cs, e, OPTS);
    if (r.kind === 'state' || r.kind === 'dial') cs = r.cs;
  }
  return cs;
};
const atDial = (w: World, mode: '3d' | '2d') => { const d = w.byId.get('dial')!; place(w, d.x - 1.1, 0, d.z + 0.2, mode); };

describe('魔方儀 (dial)', () => {
  it('3D 站穩按 E → dialActivate → activateDial (state 與 entry 都記下)、說明一句；已啟動再按 → msg.dial.ready', () => {
    let cs = open();
    atDial(cs.world, '3d');
    interact(cs.world);
    expect(cs.world.events).toEqual([{ t: 'dialActivate', chapter: 90 }]);
    cs = drain(cs);
    expect([cs.state.dial, cs.entry.dial, cs.world.ext.dial, cs.world.msgKey]).toEqual([true, true, { active: true }, 'msg.dial.activated']);
    interact(cs.world);
    expect([cs.world.events, cs.world.msgKey]).toEqual([[], 'msg.dial.ready']);
  });

  it('2D 互動不啟動 (只在 3D；看得見、碰不到)；空中不能啟動', () => {
    const cs = open();
    atDial(cs.world, '2d');
    interact(cs.world);
    expect([cs.world.events, cs.world.msgKey]).toEqual([[], 'msg.unreachable']);
    atDial(cs.world, '3d');
    cs.world.player.onGround = false;
    interact(cs.world);
    expect(cs.world.events).toEqual([]);
  });

  it('不是這一章的魔方儀 / 不是控制盤章：事件被忽略', () => {
    const cs = open();
    expect(applyChapterEvent(cs, { t: 'dialActivate', chapter: 2 }, OPTS)).toEqual({ kind: 'none' });
  });
});

describe('鎖扣開關 (latch)', () => {
  it('3D 拉下 → used、說 useText、done 事件 → 下列的鎖扣解開 (寫回 unlocked)；拉過不能再拉', () => {
    let cs = open('protoC');
    const l = cs.world.byId.get('latch')!;
    place(cs.world, l.x, 0, l.z + 1, '3d');
    interact(cs.world);
    expect([l.used, cs.world.msgKey, cs.world.events]).toEqual([true, 'lvl.proto.latch.a', [{ t: 'done', flag: 'test.a' }]]);
    cs = drain(cs);
    expect(cs.state.unlocked).toEqual(['row1']);
    interact(cs.world);
    expect(cs.world.events).toEqual([]);
  });
});

describe('轉動模式的進入條件 (canEnterTurnMode)', () => {
  it('2D、站穩、已啟動、沒有疊層：四個條件各缺一個都不行', () => {
    let cs = open();
    atDial(cs.world, '3d');
    interact(cs.world);
    cs = drain(cs);
    const w = cs.world;
    place(w, -2, 0, 1, '2d');
    run(w, {}, 0.1);
    expect([turnModeDenied(w), canEnterTurnMode(w)]).toEqual([null, true]);
    expect(turnModeDenied(w, true)).toBe('overlay');
    w.player.onGround = false;
    expect(turnModeDenied(w)).toBe('air');
    place(w, -2, 0, 1, '3d');
    expect(turnModeDenied(w)).toBe('not2d');
    const off = open();
    place(off.world, -2, 0, 1, '2d');
    expect([turnModeDenied(off.world), canEnterTurnMode(off.world)]).toEqual(['noDial', false]);
  });

  it('每個轉不動的原因都有訊息 (文字表裡有)', () => {
    for (const k of Object.values(DIAL_BLOCK_MSG)) expect(k in zhHant).toBe(true);
    const cs = open();
    expect(dialTurn(cs, { group: 'row0', dir: 1 })).toEqual({ blocked: 'noDial' });
  });
});

describe('原型占位的 2×3 測試魔方 (不計入正式關卡)', () => {
  it('六間占位房：validateLevel 0 issue、文字 key 齊全；甲室有魔方儀，丙 / 己 / 戊各一個鎖扣開關；每房預算 6', () => {
    for (const lv of Object.values(PROTO_DIAL_ROOMS)) {
      expect([lv.id, validateLevel(lv, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })]).toEqual([lv.id, []]);
      expect(missingLevelKeys(lv, zhHant)).toEqual([]);
      expect(lv.turnBudget).toEqual({ base: 6 });
    }
    expect(PROTO_DIAL_ROOMS.protoA.objects.filter(o => o.type === 'dial').length).toBe(1);
    expect(['protoC', 'protoF', 'protoE'].map(r => PROTO_DIAL_ROOMS[r].objects.find(o => o.type === 'latch')!.doneFlag)).toEqual(['test.a', 'test.b', 'test.goal']);
    expect(TEST_DIAL_CUBE.dial!.entry).toEqual({ room: 'protoA', obj: 'dial' });
  });

  it('不在正式登錄表 / 章節選單：LEVELS、CHAPTERS、CUBE_CHAPTERS 都沒有；只從開發入口 dev-dial 進 (甲室)', () => {
    expect(LEVELS.some(e => e.id === 'dev-dial' || e.chapter === 90)).toBe(false);
    expect(CHAPTERS.some(c => c.levels.includes('dev-dial'))).toBe(false);
    expect(CUBE_CHAPTERS.some(c => c.chapter === 90)).toBe(false);
    expect(levelById('dev-dial')).toBeUndefined();
    expect(protoLevelById('dev-dial')?.load().id).toBe('protoA');
    expect(PROTO_LEVELS.length).toBe(1);
    expect(cubeChapterOf('dev-dial')?.chapter).toBe(90);
    expect(cubeChapterOf('1-2')?.chapter).toBe(1);
  });

  it('開章：甲室 東門接乙室、其餘門後是牆；丙室要上列轉一次才接得上 (往左或往右都行)', () => {
    const cs = open();
    expect(cs.world.ext.cube!.links).toEqual({ doorE: { to: 'room', room: 'protoB', door: 'doorW', kind: 'door' }, doorW: { to: 'wall' }, doorS: { to: 'room', room: 'protoD', door: 'doorN', kind: 'door' } });
  });
});
