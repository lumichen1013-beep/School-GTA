import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy({}, { get: () => () => undefined })
}));
vi.mock('../src/effects/SlashFX', () => ({ slashFX: { hitFlash: vi.fn(), dashBand: vi.fn(), chargeRing: vi.fn() } }));
vi.mock('../src/effects/ComboFinisherFX', () => ({ comboFinisherFX: { groundSlam: vi.fn(), spinWave: vi.fn(), featherBurst: vi.fn() } }));

import * as STORY from '../src/game/fencer/fencerStory';
import {
  FENCER, SunflowerTaunt, BossLineGate, HeartVoice, INTRO_FIRST, INTRO_REMATCH, introTimeline, VICTORY_FIRST, VICTORY_REPEAT,
  fencerQuestStage, victoryIsLong, REMATCH_ARM_SEC, type BossCue
} from '../src/game/fencer/fencerRules';
import { parseFencerSave, serializeFencerSave, defaultFencerSave, questStageOf } from '../src/game/fencer/fencerSave';
import { FencerBoss, type FencerBossHost } from '../src/entities/FencerBoss';
import { BossFX } from '../src/effects/BossFX';

const MAX = 22;
const PLAYER_MAX = 8;

// 收集 fencerStory 所有字串 (函式以代表性參數展開)；全校廣播 (跑馬燈) 例外
function collect(v: unknown, path: string, out: Array<{ path: string; text: string }>) {
  if (typeof v === 'string') { if (v) out.push({ path, text: v }); return; }
  if (typeof v === 'function') {
    collect((v as (a: number, b: number) => unknown)(FENCER.FIRST_WIN_CASH, FENCER.TAUNT_COUNT), `${path}()`, out);
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => collect(x, `${path}[${i}]`, out)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'who' && k !== 'face' && k !== 'reaction') collect(x, `${path}.${k}`, out);
}

describe('劇情文字長度 (手機直屏)', () => {
  const all: Array<{ path: string; text: string }> = [];
  for (const [k, v] of Object.entries(STORY)) if (k !== 'BROADCAST' && k !== 'storyLen') collect(v, k, all);

  it('所有劇情字串 ≤ 22 字 (全校廣播例外；對話視窗以句為單位)', () => {
    expect(all.length).toBeGreaterThan(80);
    const over = all
      .flatMap(({ path, text }) => (path.startsWith('DODGE_TEACHER_EGG') ? text.split(/(?<=[。！？])/).map((t) => ({ path, text: t })) : [{ path, text }]))
      .filter(({ text }) => STORY.storyLen(text) > MAX);
    expect(over).toEqual([]);
  });

  it('玩家頭頂框 ≤ 8 字', () => {
    const player = [
      STORY.PLAYER_AWAKEN_BUBBLE, STORY.PLAYER_WIN_BUBBLE,
      ...[...STORY.INTRO_FIRST_BEATS, ...STORY.VICTORY_FIRST_BEATS, ...STORY.TRANSITION_BEATS.flat()].filter((b) => b.who === 'PLAYER').map((b) => b.text)
    ];
    expect(player.length).toBe(4);
    for (const t of player) expect(STORY.storyLen(t)).toBeLessThanOrEqual(PLAYER_MAX);
  });

  it('全校廣播維持既有慣例 (加入輪播)', () => {
    expect(STORY.BROADCAST.lines.length).toBe(2);
    expect(STORY.storyLen(STORY.BROADCAST.afterWin)).toBeGreaterThan(MAX); // 跑馬燈
  });

  it('storyLen：emoji (含變體選擇符) 算 1 字', () => {
    expect(STORY.storyLen('☀️ 向陽')).toBe(4);
    expect(STORY.storyLen('🎩')).toBe(1);
  });
});

describe('劇情拍點時間軸', () => {
  const increasing = (beats: readonly STORY.StoryBeat[], end: number) => {
    for (let i = 0; i < beats.length; i++) {
      expect(beats[i].t).toBeLessThan(end);
      if (i > 0) expect(beats[i].t).toBeGreaterThan(beats[i - 1].t);
    }
  };
  it('首戰 8.2s、再戰 6.8s；拍點遞增且在過場內', () => {
    expect(INTRO_FIRST.end).toBe(8.2);
    expect(INTRO_REMATCH.end).toBe(6.8);
    expect(introTimeline(1)).toBe(INTRO_FIRST);
    expect(introTimeline(2)).toBe(INTRO_REMATCH);
    increasing(STORY.INTRO_FIRST_BEATS, INTRO_FIRST.end);
    increasing(STORY.INTRO_REMATCH_BEATS.afterWin, INTRO_REMATCH.end);
    increasing(STORY.INTRO_REMATCH_BEATS.afterLoss, INTRO_REMATCH.end);
    // 向陽之心第一句在覺醒時
    expect(STORY.INTRO_FIRST_BEATS.find((b) => b.t === INTRO_FIRST.awaken)?.text).toContain('向陽之心');
  });
  it('換樂章對白在 9.2s 換樂章過場內；首勝過場 7s', () => {
    for (const beats of STORY.TRANSITION_BEATS) increasing(beats, FENCER.BAR_BREAK_POSE_SEC + FENCER.BAR_TRANSITION_SEC);
    increasing(STORY.VICTORY_FIRST_BEATS, VICTORY_FIRST.end);
    expect(VICTORY_FIRST.end).toBe(7);
    expect(VICTORY_FIRST.restoreAt).toBeGreaterThan(VICTORY_FIRST.outroAt);
    expect(VICTORY_FIRST.rapierAt).toBeLessThan(VICTORY_FIRST.end);
    expect(VICTORY_REPEAT.end).toBe(3.6);
  });
});

describe('太陽花：原 10 句與首勝後兩段式再戰', () => {
  it('原 10 句一字不改', () => {
    expect(STORY.SUNFLOWER_LINES.map((l) => l.text)).toEqual([
      '.', '..', '...', '嘖。', '滾', '哎呀別踩我', '不要逼我', '我只是一朵花啊……', '大哥我錯了', '看來不好好教訓你不行了'
    ]);
  });

  it('首勝後：第 1 下溫情句 (只一次，附接話)，4 秒內再戳才開戰；超過 4 秒重算', () => {
    const t = new SunflowerTaunt();
    t.recordResult('WIN');
    const a = t.poke(100);
    expect(a.startFight).toBe(false);
    expect(a.daily).toBe(true);
    expect(a.line!.text).toBe(STORY.SUNFLOWER_WARM_LINES[0].text);
    expect(a.followUp?.text).toBe(STORY.SUNFLOWER_WARM_LINES[1].text);
    expect(t.warmLineShown).toBe(true);
    expect(t.isArmed(103)).toBe(true);
    // 冷卻內不算
    expect(t.poke(100.5).accepted).toBe(false);
    // 超過 4 秒：重新算，說日常台詞 (不再是溫情句)
    const b = t.poke(100 + REMATCH_ARM_SEC + 0.5);
    expect(b.startFight).toBe(false);
    expect(b.followUp).toBeNull();
    expect(STORY.SUNFLOWER_DAILY_LINES.map((d) => d.text)).toContain(b.line!.text);
    // 4 秒內第 2 下開戰
    const c = t.poke(100 + REMATCH_ARM_SEC + 2);
    expect(c.startFight).toBe(true);
    expect(c.line!.text).toBe(STORY.REMATCH_LINE_AFTER_WIN);
    expect(t.isArmed(200)).toBe(false);
  });

  it('溫情句已播 (讀檔) 時不再出現；日常台詞不連續重複', () => {
    const t = new SunflowerTaunt();
    t.recordResult('WIN');
    t.warmLineShown = true;
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) seen.push(t.poke(i * 10, () => 0.1).line!.text);
    expect(seen).not.toContain(STORY.SUNFLOWER_WARM_LINES[0].text);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('戰敗後仍戳 1 下即再戰', () => {
    const t = new SunflowerTaunt();
    t.recordResult('LOSS');
    const r = t.poke(5);
    expect(r.startFight).toBe(true);
    expect(r.line!.text).toBe(STORY.REMATCH_LINE_AFTER_LOSS);
  });

  it('首勝長過場只播一次', () => {
    expect(victoryIsLong(false)).toBe(true);
    expect(victoryIsLong(true)).toBe(false);
  });
});

describe('戰中台詞頻率', () => {
  it('小招每樂章第一次、大招 / 致意每次、追擊每場一次', () => {
    const g = new BossLineGate();
    const say = (cue: BossCue, bar: number) => g.allow(cue, bar);
    expect(say('S1', 0)).toBe(true);
    expect(say('S1', 0)).toBe(false);
    expect(say('S2', 0)).toBe(true);
    expect(say('S2', 0)).toBe(false);
    expect(say('S1', 1)).toBe(true);
    expect(say('S1', 2)).toBe(true);
    expect(say('S1', 2)).toBe(false);
    for (let i = 0; i < 3; i++) {
      expect(say('S3_JUMP', 0)).toBe(true);
      expect(say('BOW', 1)).toBe(true);
      expect(say('S4', 1)).toBe(true);
      expect(say('S5', 2)).toBe(true);
    }
    expect(say('CHASE', 0)).toBe(true);
    expect(say('CHASE', 2)).toBe(false);
    g.resetFight();
    expect(say('S1', 0)).toBe(true);
    expect(say('CHASE', 0)).toBe(true);
  });

  it('向陽之心每句每場一次、合計 ≤ 4 句', () => {
    const h = new HeartVoice();
    expect(h.tryFire('H1')).toBe(true);
    expect(h.tryFire('H1')).toBe(false);
    expect(h.tryFire('H2')).toBe(true);
    expect(h.tryFire('H3')).toBe(true);
    expect(h.tryFire('H4')).toBe(true);
    expect(h.spoken).toBe(4);
    expect(Object.keys(STORY.HEART_LINES).length).toBeLessThanOrEqual(STORY.HEART_MAX_PER_FIGHT);
    h.resetFight();
    expect(h.tryFire('H3')).toBe(true);
  });

  it('Boss 發出招式提示點 (S1 / BOW 等)；擊敗化花瓣時間可調', () => {
    const cues: BossCue[] = [];
    const host: FencerBossHost = {
      playerPos: new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 5),
      playerVel: new THREE.Vector3(),
      playerDead: false,
      isTouch: false,
      playerOutOfCombat: false,
      damagePlayer: () => undefined,
      onBossDamaged: () => undefined,
      shake: () => undefined,
      hitStop: () => undefined,
      onCue: (c) => cues.push(c)
    };
    const boss = new FencerBoss(host, new BossFX());
    boss.resetForFight(FENCER.CENTER_X, FENCER.CENTER_Z);
    boss.startFight(0);
    for (let i = 0; i < 900; i++) boss.update(1 / 30);
    expect(cues).toContain('S1');
    expect(cues).toContain('S3_JUMP');
    expect(cues).toContain('S3_FINALE');
    expect(cues).toContain('BOW');
    // 換樂章過場時間
    expect(boss.transitionTime).toBe(-1);
    const near = new THREE.Vector3(boss.position.x, 0, boss.position.z + 1);
    boss.tryHitMelee(near, 1.2, 99999);
    if (boss.isInTransition) {
      boss.update(0.5);
      expect(boss.transitionTime).toBeCloseTo(0.5, 5);
    }
    // 長過場：3.4s 才化花瓣
    const b2 = new FencerBoss({ ...host, onCue: undefined }, new BossFX());
    b2.resetForFight(FENCER.CENTER_X, FENCER.CENTER_Z);
    b2.startFight(0);
    b2.defeatDissolveAt = VICTORY_FIRST.dissolveAt;
    const p = new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 1);
    for (let bar = 0; bar < 3; bar++) {
      b2.tryHitMelee(p, 1.2, 99999);
      if (bar < 2) for (let i = 0; i < 100; i++) b2.update(0.1);
      b2.position.set(FENCER.CENTER_X, 0, FENCER.CENTER_Z);
    }
    expect(b2.isDefeated).toBe(true);
    for (let i = 0; i < 20; i++) b2.update(0.1); // 2.0s
    expect(b2.root.visible).toBe(true);
    for (let i = 0; i < 15; i++) b2.update(0.1); // 3.5s
    expect(b2.root.visible).toBe(false);
  });
});

describe('劇情進度存檔 (相容舊存檔)', () => {
  it('無存檔 / 空物件 / 壞 JSON / 型別錯 → 全新進度', () => {
    const d = defaultFencerSave();
    expect(parseFencerSave(null)).toEqual(d);
    expect(parseFencerSave('')).toEqual(d);
    expect(parseFencerSave('{}')).toEqual(d);
    expect(parseFencerSave('not json')).toEqual(d);
    expect(parseFencerSave('[1,2]')).toEqual({ ...d });
    expect(parseFencerSave('{"fightsStarted":"3","defeated":"yes","pokes":-4}')).toEqual(d);
    expect(questStageOf(d)).toBe(0);
  });

  it('舊格式只有部分欄位：缺的欄位取合理預設', () => {
    // 只記首勝 (沒有開戰次數 / 結果 / 溫情句欄位)
    const a = parseFencerSave('{"defeated":true}');
    expect(a.defeated).toBe(true);
    expect(a.wins).toBe(1);
    expect(a.fightsStarted).toBe(1);
    expect(a.lastResult).toBe('WIN');
    expect(a.warmLineShown).toBe(false);
    expect(a.dodgeEggShown).toBe(false);
    expect(questStageOf(a)).toBe(2);
    // 開戰過但中途關掉 (無結果) → 視為敗，任務揭露到第 1 段
    const b = parseFencerSave('{"fightsStarted":2}');
    expect(b.lastResult).toBe('LOSS');
    expect(questStageOf(b)).toBe(1);
    // 戳到一半 (pokes 夾在 0~10)
    expect(parseFencerSave('{"pokes":99}').pokes).toBe(FENCER.TAUNT_COUNT);
    expect(parseFencerSave('{"pokes":4}').lastResult).toBe('NONE');
  });

  it('序列化往返一致；揭露段與首勝 / 溫情句 / 彩蛋旗標保存', () => {
    const s = { fightsStarted: 3, defeated: true, wins: 2, lastResult: 'WIN' as const, pokes: 10, warmLineShown: true, dodgeEggShown: true };
    expect(parseFencerSave(serializeFencerSave(s))).toEqual(s);
    expect(fencerQuestStage(0, false)).toBe(0);
    expect(fencerQuestStage(1, false)).toBe(1);
    expect(fencerQuestStage(1, true)).toBe(2);
    // 讀檔後太陽花規則延續：首勝 + 溫情句已播 → 戳第 1 下為日常台詞
    const loaded = parseFencerSave(serializeFencerSave(s));
    const t = new SunflowerTaunt();
    t.lastResult = loaded.lastResult;
    t.warmLineShown = loaded.warmLineShown;
    const r = t.poke(0);
    expect(r.daily).toBe(true);
    expect(r.followUp).toBeNull();
  });
});
