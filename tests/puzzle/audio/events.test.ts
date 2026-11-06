// 事件 → 聲音 (audio-design 3、4、8)：映射完整性、限流、驚嚇閘門、環境音時鐘、關卡狀態差
import { describe, it, expect } from 'vitest';
import type { GameEvent } from '../../../src/puzzle/core/types';
import {
  AMBIENCE, AmbientClock, CALM_HALF, CUE_MAP, CUTSCENE_SCORE, GAME_EVENT_TYPES, LevelObserver, SCARE_DEFAULT, SCARE_GENTLE, SCARE_SFX, SHOT_MUSIC, STEP_LEN, ScareGate, Throttle,
  worldEventActions, type AudioAction, type LevelSnap, type ObjSnap
} from '../../../src/puzzle/audio/events';
import { SFX } from '../../../src/puzzle/audio/sfx';
import { SCORES } from '../../../src/puzzle/audio/score';
import { LIMITS } from '../../../src/puzzle/audio/mix';
import { CUTSCENES } from '../../../src/puzzle/content/cutscenes';
import { CHASE_ACTIONS, CHASE_QUIET_SEC } from '../../../src/puzzle/audio/events';
import { WebAudioManager } from '../../../src/puzzle/audio/manager';

const sfxIds = (as: readonly AudioAction[]) => as.flatMap(a => (a.kind === 'sfx' ? [a.id] : []));
const sample: Record<GameEvent['t'], GameEvent> = {
  switch: { t: 'switch', to: '2d' }, switchDenied: { t: 'switchDenied' }, door: { t: 'door', door: 'd' }, turnRequest: { t: 'turnRequest', lever: 'l' },
  objCross: { t: 'objCross', obj: 'o', door: 'd' }, labelOpen: { t: 'labelOpen', label: 'x', obj: 'o' }, card: { t: 'card', label: 'x', ok: true },
  flag: { t: 'flag', flag: 'scare:coats' }, dialActivate: { t: 'dialActivate', chapter: 2 }, done: { t: 'done', flag: '2-1a' },
  chase: { t: 'chase', id: 'chase:3-4', s: 'omen' }
};

describe('映射完整性', () => {
  it('每種 GameEvent 都有處理 (switch / labelOpen 由狀態差負責)；對到的音效都存在', () => {
    expect(new Set(GAME_EVENT_TYPES)).toEqual(new Set(Object.keys(sample)));
    for (const t of GAME_EVENT_TYPES) {
      const as = worldEventActions(sample[t]);
      if (t === 'switch' || t === 'labelOpen') expect(as).toEqual([]);
      else expect(as.length, t).toBeGreaterThan(0);
      for (const id of sfxIds(as)) expect(SFX[id], id).toBeDefined();
    }
    expect(sfxIds(worldEventActions({ t: 'card', label: 'x', ok: false }))).toEqual(['sfx.card.wrong']);
    expect(worldEventActions({ t: 'flag', flag: 'cube:turned' })).toEqual([]);
    expect(worldEventActions(sample.flag)).toEqual([{ kind: 'scare', flag: 'scare:coats' }]);
    expect(worldEventActions(sample.done)).toEqual([{ kind: 'sfx', id: 'sfx.puzzle.solved' }, { kind: 'music', op: 'solved' }]);
  });
  it('追逐 (N19；3-4 追逐 1)：omen = tension + 遠處腳步、start 無、caught = 紙張一皺 (≤ −18 dBFS、短)、end = 安靜 20 秒、autoPass 無、reset = 回原情境', () => {
    const chase = (s: keyof typeof CHASE_ACTIONS) => worldEventActions({ t: 'chase', id: 'chase:3-4', s });
    expect(Object.fromEntries((['omen', 'start', 'caught', 'end', 'autoPass', 'reset'] as const).map(s => [s, chase(s)]))).toEqual({
      omen: [{ kind: 'chase', op: 'on' }, { kind: 'sfx', id: 'sfx.amb.footstep' }], start: [], caught: [{ kind: 'sfx', id: 'sfx.chase.caught' }],
      end: [{ kind: 'chase', op: 'quiet' }], autoPass: [], reset: [{ kind: 'chase', op: 'off' }]
    });
    const caught = SFX['sfx.chase.caught'];
    expect([caught.db <= -18, Math.max(...caught.parts.map(p => (p.at ?? 0) + p.env.a + (p.env.h ?? 0) + p.env.d)) <= 0.5, CHASE_QUIET_SEC]).toEqual([true, true, 20]);
    // 情境：追逐中外殼每幀的 explore / turn 先記下 (維持 tension)；抵達終點 → quiet，期滿回記下的情境；走回主室 → 直接回去；換房 / R (off) 收掉
    const m = new WebAudioManager({ realtime: false });
    m.chase('on');
    m.setContext('turn');
    expect([m.stats().context, m.chasing]).toEqual(['tension', true]);
    m.chase('quiet');
    expect([m.stats().context, m.chasing]).toEqual(['quiet', false]);
    const n = new WebAudioManager({ realtime: false });
    n.setContext('turn');
    n.chase('on');
    n.chase('off');
    expect([n.stats().context, n.chasing]).toEqual(['turn', false]);
    n.chase('quiet'); // 沒在追 → 不動
    expect(n.stats().context).toBe('turn');
  });
  it('過場：CUTSCENES 裡每個音訊提示都有對映 (序章 23 個 + cs:ch2 新增 pages.turn / leaves = 25；cs:night 新增 paper.tear / birds / kettle = 28；cs:attic 新增 switch.view / chord = 30)；對到的音效都存在；鏡頭音樂只指向存在的鏡頭', () => {
    const cues = CUTSCENES.flatMap(c => c.shots.flatMap(s => (s.audio ?? []).map(a => a.cue)));
    expect(new Set(cues).size).toBe(30);
    expect(cues.filter(c => !(c in CUE_MAP))).toEqual([]);
    for (const [cue, as] of Object.entries(CUE_MAP)) {
      expect(as.length, cue).toBeGreaterThan(0);
      for (const id of sfxIds(as)) expect(SFX[id], `${cue} → ${id}`).toBeDefined();
    }
    for (const [id, shots] of Object.entries(SHOT_MUSIC)) {
      const def = CUTSCENES.find(c => c.id === id)!;
      for (const n of Object.keys(shots)) expect(Number(n)).toBeLessThanOrEqual(def.shots.length);
    }
    expect(SHOT_MUSIC['cs:prologue'][12]).toContain('title'); // 標題卡主旋律
    for (const sc of Object.values(CUTSCENE_SCORE)) expect(SCORES[sc]).toBeDefined();
    for (const id of CALM_HALF) expect(SFX[id]).toBeDefined();
  });
  it('序章的分鏡掛點對到規格要求的聲音：魔法陣亮起、鋼筆升起、木頭低鳴、門窗鎖死、壓平成圖、字條、收尾', () => {
    expect(sfxIds(CUE_MAP['circle.hum'])).toEqual(['sfx.cs.circle.hum']);
    expect(sfxIds(CUE_MAP['pen.rise'])).toEqual(['sfx.cs.pen.rise']);
    expect(sfxIds(CUE_MAP['house.rumble'])).toEqual(['sfx.cs.wood.groan']);
    expect(sfxIds(CUE_MAP['door.rattle'])).toEqual(['sfx.cs.door.rattle']);
    expect(sfxIds(CUE_MAP['pen.click'])).toContain('sfx.cs.flatten');
    expect(sfxIds(CUE_MAP['paper.flutter'])).toEqual(['sfx.cs.paper.flutter']);
    expect(CUE_MAP['pad.out']).toEqual([{ kind: 'music', op: 'padOut' }]);
    expect(CUE_MAP['pad.semitoneDown']).toEqual([{ kind: 'music', op: 'semitoneDown' }]);
    // 起音 ≥ 300 ms 的低沉和聲 (分鏡鏡 6)；木頭摩擦 ≤ −24 dBFS、起音 ≥ 150 ms (鏡 7)
    expect(Math.min(...SFX['sfx.cs.circle.hum'].parts.map(p => p.env.a))).toBeGreaterThanOrEqual(0.3);
    expect(SFX['sfx.cs.wood.groan'].db).toBeLessThanOrEqual(-24);
  });
  it('環境音清單的音效都存在、都是 ambient 類', () => {
    for (const list of Object.values(AMBIENCE)) for (const id of list!) expect(SFX[id].cat).toBe('ambient');
  });
});

describe('限流 / 驚嚇閘門 / 環境音時鐘', () => {
  it('Throttle：間隔內擋下、過了放行、不同 id 互不影響', () => {
    const t = new Throttle();
    expect(t.allow('a', 0, 0.5)).toBe(true);
    expect(t.allow('a', 0.4, 0.5)).toBe(false);
    expect(t.allow('b', 0.4, 0.5)).toBe(true);
    expect(t.allow('a', 0.5, 0.5)).toBe(true);
  });
  it('ScareGate：calmTension → 平靜版；之後 15 秒安靜、期滿解除', () => {
    const g = new ScareGate();
    expect(g.quiet(0)).toBe(false);
    expect(g.scare('scare:coats', 10, false)).toBe(SCARE_SFX['scare:coats']);
    expect(g.quiet(10 + LIMITS.scareQuietAfterSec - 0.01)).toBe(true);
    expect(g.quiet(10 + LIMITS.scareQuietAfterSec)).toBe(false);
    expect(g.scare('scare:coats', 40, true)).toBe(SCARE_GENTLE);
    expect(g.scare('scare:other', 80, false)).toBe(SCARE_DEFAULT);
    expect(SFX[SCARE_GENTLE].db).toBeLessThanOrEqual(LIMITS.scareCalmDb);
  });
  it('AmbientClock：確定性；同類間隔 ≥ 20 秒；安靜期內不播 (順延)', () => {
    const run = (quietUntil = -1) => {
      const c = new AmbientClock(['x', 'y'], 7, 0);
      const out: Array<[number, string]> = [];
      for (let t = 0; t < 600; t += 0.05) { const id = c.tick(t, t < quietUntil); if (id) out.push([t, id]); }
      return out;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.length).toBeGreaterThan(10);
    for (const id of ['x', 'y']) {
      const ts = a.filter(([, i]) => i === id).map(([t]) => t);
      expect(ts.every((t, i) => i === 0 || t - ts[i - 1] >= LIMITS.ambientGapSec)).toBe(true);
    }
    expect(run(100).every(([t]) => t >= 100)).toBe(true);
  });
});

// ── 狀態差 ──

const W1 = {}, W2 = {};
const obj = (id: string, type: string, used = false, extra: Partial<ObjSnap> = {}): ObjSnap => ({ id, type, used, gone: false, x: 0, z: 0, ...extra });
const snap = (o: Partial<LevelSnap> = {}): LevelSnap => ({
  world: W1, room: 'r', mode: '3d', player: { x: 0, y: 0, z: 0, vy: 0, onGround: true }, inv: {}, objs: [], cube: '', ink: null,
  mapOpen: false, turnMode: false, trayOpen: false, busy: false, msgSeq: 0, msgKey: '', ...o
});

describe('LevelObserver (狀態差 → 聲音)', () => {
  it('第一幀只設定切換音色、不發聲', () => {
    expect(new LevelObserver().update(snap())).toEqual([{ kind: 'view', mode: '3d' }]);
  });
  it('切換 2D / 3D：紙聲 + 切換音色', () => {
    const o = new LevelObserver();
    o.update(snap());
    expect(o.update(snap({ mode: '2d' }))).toEqual([{ kind: 'sfx', id: 'sfx.switch.to2d' }, { kind: 'view', mode: '2d' }]);
    expect(sfxIds(o.update(snap({ mode: '3d' })))).toEqual(['sfx.switch.to3d']);
  });
  it('跳 / 落地 (下落夠快才有落地聲)', () => {
    const o = new LevelObserver();
    o.update(snap());
    expect(sfxIds(o.update(snap({ player: { x: 0, y: 0.1, z: 0, vy: 6, onGround: false } })))).toEqual(['sfx.jump']);
    o.update(snap({ player: { x: 0, y: 1, z: 0, vy: -6, onGround: false } }));
    expect(sfxIds(o.update(snap({ player: { x: 0, y: 0, z: 0, vy: 0, onGround: true } })))).toEqual(['sfx.land']);
    // 小跳 (落地前 vy 不夠快)：沒有落地聲
    o.update(snap({ player: { x: 0, y: 0.1, z: 0, vy: 2, onGround: false } }));
    expect(sfxIds(o.update(snap({ player: { x: 0, y: 0, z: 0, vy: 0, onGround: true } })))).toEqual([]);
  });
  it('腳步：地面上每走 STEP_LEN 一步；2D 用紙聲；過場中 / 瞬移不算', () => {
    const o = new LevelObserver();
    o.update(snap());
    const steps: string[] = [];
    for (let i = 1; i <= 40; i++) steps.push(...sfxIds(o.update(snap({ player: { x: i * 0.1, y: 0, z: 0, vy: 0, onGround: true } }))));
    expect(steps.length).toBe(Math.floor(4 / STEP_LEN));
    expect(new Set(steps)).toEqual(new Set(['sfx.step.wood']));
    const p = new LevelObserver();
    p.update(snap({ mode: '2d' }));
    const s2: string[] = [];
    for (let i = 1; i <= 40; i++) s2.push(...sfxIds(p.update(snap({ mode: '2d', player: { x: i * 0.1, y: 0, z: 0, vy: 0, onGround: true } }))));
    expect(new Set(s2)).toEqual(new Set(['sfx.step.paper']));
    const q = new LevelObserver();
    q.update(snap());
    const s3: string[] = [];
    for (let i = 1; i <= 40; i++) s3.push(...sfxIds(q.update(snap({ busy: true, player: { x: i * 0.1, y: 0, z: 0, vy: 0, onGround: true } }))));
    s3.push(...sfxIds(q.update(snap({ player: { x: 50, y: 0, z: 0, vy: 0, onGround: true } }))));
    expect(s3).toEqual([]);
  });
  it('撿到：依物品分 (鑰匙 = 金屬、殘片 / 手記 = 紙、其他 = 鐘音)', () => {
    const o = new LevelObserver();
    o.update(snap());
    expect(sfxIds(o.update(snap({ inv: { 'key.brass': 1 } })))).toEqual(['sfx.pickup.key']);
    expect(sfxIds(o.update(snap({ inv: { 'key.brass': 1, 'scrap.1': 1 } })))).toEqual(['sfx.pickup.paper']);
    expect(sfxIds(o.update(snap({ inv: { 'key.brass': 1, 'scrap.1': 1, nib: 1 } })))).toEqual(['sfx.pickup']);
    expect(sfxIds(o.update(snap({ inv: { 'scrap.1': 1, nib: 1 } })))).toEqual([]); // 用掉不出聲
  });
  it('第二章 2-1：書擋倒下、燈書依序點亮 (音高往上) / 點錯全部熄滅、抽書、暗格', () => {
    const o = new LevelObserver();
    const lamps = (a: boolean, b: boolean, c: boolean) => [obj('l1', 'lampBook', a), obj('l2', 'lampBook', b), obj('l3', 'lampBook', c)];
    o.update(snap({ objs: [obj('be', 'bookend'), ...lamps(false, false, false)] }));
    expect(sfxIds(o.update(snap({ objs: [obj('be', 'bookend', true), ...lamps(false, false, false)] })))).toEqual(['sfx.bookend.fall']);
    expect(o.update(snap({ objs: [obj('be', 'bookend', true), ...lamps(true, false, false)] }))).toEqual([{ kind: 'sfx', id: 'sfx.lamp.on', pitch: 0 }]);
    expect(o.update(snap({ objs: [obj('be', 'bookend', true), ...lamps(true, true, false)] }))).toEqual([{ kind: 'sfx', id: 'sfx.lamp.on', pitch: 4 }]);
    expect(sfxIds(o.update(snap({ objs: [obj('be', 'bookend', true), ...lamps(false, false, false)] })))).toEqual(['sfx.lamp.off', 'sfx.lamp.off']);
    const p = new LevelObserver();
    p.update(snap({ objs: [obj('b', 'spine'), obj('k', 'bookLock')] }));
    expect(sfxIds(p.update(snap({ objs: [obj('b', 'spine', true), obj('k', 'bookLock', true)] })))).toEqual(['sfx.book.pull', 'sfx.drawer.open']);
  });
  it('第一章：壓板、拉繩、閘門；衣架滑落不在這裡出聲 (驚嚇由 flag 事件 + 閘門決定)', () => {
    const o = new LevelObserver();
    o.update(snap({ objs: [obj('p', 'plate'), obj('c', 'cord'), obj('g', 'gate'), obj('coat', 'coatRack')] }));
    expect(sfxIds(o.update(snap({ objs: [obj('p', 'plate', true), obj('c', 'cord', true), obj('g', 'gate', false, { gone: true }), obj('coat', 'coatRack', true)] }))))
      .toEqual(['sfx.plate.press', 'sfx.cord.pull', 'sfx.gate.open']);
  });
  it('魔方轉動：拉桿章 = cube.turn、控制盤章 = dial.turn + 墨水滴；墨補滿不出聲', () => {
    const o = new LevelObserver();
    o.update(snap({ cube: 'a' }));
    expect(sfxIds(o.update(snap({ cube: 'b' })))).toEqual(['sfx.cube.turn']);
    const p = new LevelObserver();
    p.update(snap({ cube: 'a', ink: 3 }));
    expect(sfxIds(p.update(snap({ cube: 'b', ink: 2 })))).toEqual(['sfx.dial.turn', 'sfx.ink.drop']);
    expect(sfxIds(p.update(snap({ cube: 'b', ink: 3 })))).toEqual([]);
  });
  it('展開圖 / 轉動模式 / 字卡匣開關；轉不動的訊息 → 咚；字條 → 紙聲', () => {
    const o = new LevelObserver(new Set(['msg.dial.locked']));
    o.update(snap());
    expect(sfxIds(o.update(snap({ mapOpen: true })))).toEqual(['sfx.map.open']);
    expect(sfxIds(o.update(snap({ mapOpen: true, turnMode: true })))).toEqual(['sfx.dial.mode']);
    expect(sfxIds(o.update(snap({ mapOpen: false })))).toEqual(['sfx.map.close']);
    expect(sfxIds(o.update(snap({ trayOpen: true })))).toEqual(['sfx.tray.open']);
    expect(sfxIds(o.update(snap({ trayOpen: true, msgSeq: 1, msgKey: 'msg.dial.locked' })))).toEqual(['sfx.dial.deny']);
    expect(sfxIds(o.update(snap({ trayOpen: true, msgSeq: 2, msgKey: 'lvl.1-1.note.1' })))).toEqual(['sfx.note.read']);
    expect(sfxIds(o.update(snap({ trayOpen: true, msgSeq: 2, msgKey: 'lvl.1-1.note.1' })))).toEqual([]);
  });
  it('換 World：換房不重複出聲 (門的聲音來自 door 事件)、同房 = R 重來；物件狀態不跨 World 比較', () => {
    const o = new LevelObserver();
    o.update(snap({ objs: [obj('be', 'bookend', false)] }));
    expect(o.update(snap({ world: W2, room: 'other', objs: [obj('be', 'bookend', true)] }))).toEqual([]);
    expect(sfxIds(o.update(snap({ world: W1, room: 'other', objs: [obj('be', 'bookend', false)] })))).toEqual(['sfx.reset.room']);
  });
});
