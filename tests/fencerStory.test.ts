import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy({}, { get: () => () => undefined })
}));
vi.mock('../src/effects/SlashFX', () => ({ slashFX: { hitFlash: vi.fn(), dashBand: vi.fn(), chargeRing: vi.fn() } }));
vi.mock('../src/effects/ComboFinisherFX', () => ({ comboFinisherFX: { groundSlam: vi.fn(), spinWave: vi.fn(), featherBurst: vi.fn() } }));

import * as STORY from '../src/game/fencer/fencerStory';
import {
  FENCER, SunflowerTaunt, BossLineGate, HeartVoice, VICTORY_FIRST, VICTORY_REPEAT, TRANSITION_LEAD_SEC, TRANSITION_TAIL_SEC, TRANSITION_BLINK_AT,
  fencerQuestStage, victoryIsLong, REMATCH_ARM_SEC, type BossCue
} from '../src/game/fencer/fencerRules';
import { parseFencerSave, serializeFencerSave, defaultFencerSave, questStageOf } from '../src/game/fencer/fencerSave';
import { FencerBoss, type FencerBossHost } from '../src/entities/FencerBoss';
import { BossFX } from '../src/effects/BossFX';
import { StoryPlayer, CutsceneInput, lineDuration, readingLength, storyTotal, ADVANCE_MIN_SEC, HOLD_SKIP_SEC, type StoryLine } from '../src/game/fencer/storyPlayer';

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
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'who' && k !== 'face' && k !== 'reaction' && k !== 'events') collect(x, `${path}.${k}`, out);
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

describe('劇情過場：依字數計時、事件掛在句子上', () => {
  const ids = (lines: readonly StoryLine[]) => lines.flatMap((l) => (l.events ?? []).map((e) => e.id));

  it('每句時長 = max(2, 字數 × 0.14 + 0.5)；emoji / 引號括號不計字', () => {
    expect(readingLength('🎩「午茶時間到了。」')).toBe(7);
    expect(readingLength('☀️「別怕！」')).toBe(3);
    expect(lineDuration({ text: '短' })).toBe(2);
    expect(lineDuration({ text: '🎩「在下向日爵士，來教你什麼叫禮貌。」' })).toBeCloseTo(16 * 0.14 + 0.5, 5);
    expect(lineDuration({ text: '短', hold: 0.5 })).toBe(2.5);
    for (const lines of [STORY.INTRO_FIRST_BEATS, STORY.VICTORY_FIRST_BEATS, ...STORY.TRANSITION_BEATS]) {
      for (const l of lines) expect(lineDuration(l)).toBeGreaterThanOrEqual(2);
    }
  });

  it('首戰開場約 15s、首勝約 13s、換樂章約 11~13s (前導 1.8s + 台詞 + 收尾 0.6s)', () => {
    expect(storyTotal(STORY.INTRO_FIRST_BEATS)).toBeGreaterThan(14);
    expect(storyTotal(STORY.INTRO_FIRST_BEATS)).toBeLessThan(16.5);
    expect(storyTotal(STORY.VICTORY_FIRST_BEATS)).toBeGreaterThan(12);
    for (const lines of STORY.TRANSITION_BEATS) {
      const t = storyTotal(lines, TRANSITION_LEAD_SEC, TRANSITION_TAIL_SEC);
      expect(t).toBeGreaterThan(10.5);
      expect(t).toBeLessThan(14.5);
    }
    // 台詞在 Boss 回到中央之後才開始
    expect(TRANSITION_LEAD_SEC).toBeGreaterThan(TRANSITION_BLINK_AT);
    expect(TRANSITION_BLINK_AT).toBeGreaterThanOrEqual(FENCER.BAR_BREAK_POSE_SEC);
  });

  it('開場 / 首勝事件齊全且順序正確 (白閃 → 結界升滿 → Boss → 覺醒 → 鏡頭混回)', () => {
    expect(ids(STORY.INTRO_FIRST_BEATS)).toEqual(['PETALS', 'FLASH', 'WALL_UP', 'BOSS', 'AWAKEN', 'BLEND']);
    for (const r of [STORY.INTRO_REMATCH_BEATS.afterWin, STORY.INTRO_REMATCH_BEATS.afterLoss]) {
      expect(ids(r)).toEqual(['PETALS', 'FLASH', 'WALL_UP', 'BOSS', 'AWAKEN', 'BLEND']);
    }
    expect(ids(STORY.VICTORY_FIRST_BEATS)).toEqual(['FACE', 'DISSOLVE', 'OUTRO', 'RESTORE', 'RAPIER', 'BLEND']);
    // 向陽之心第一句 = 覺醒
    expect(STORY.INTRO_FIRST_BEATS.find((b) => b.events?.some((e) => e.id === 'AWAKEN'))?.text).toContain('向陽之心');
    // 結界升起 1.5s 動畫：首戰 WALL_UP 在 FLASH 後 ≥ 1.5s
    const l1 = STORY.INTRO_FIRST_BEATS[1].events!;
    expect((l1.find((e) => e.id === 'WALL_UP')!.at ?? 0) - (l1.find((e) => e.id === 'FLASH')!.at ?? 0)).toBeGreaterThanOrEqual(1.5);
    expect(VICTORY_FIRST.freeze).toBe(0.25);
    expect(VICTORY_REPEAT.end).toBe(3.6);
  });
});

describe('StoryPlayer：自動前進 / 點擊前進 / 跳過補發事件', () => {
  const lines: StoryLine[] = [
    { text: '第一句', events: [{ id: 'A', at: 0.5 }, { id: 'B', at: -0.2 }] },
    { text: '第二句', events: [{ id: 'C' }] },
    { text: '第三句很長很長很長很長很長很長很長很長', events: [{ id: 'D', at: 99 }] }
  ];
  const make = (lead = 0, tail = 0) => {
    const log: string[] = [];
    const sp = new StoryPlayer(lines, { onLine: (i) => log.push(`L${i}`), onEvent: (id) => log.push(id) }, lead, tail);
    return { sp, log };
  };

  it('依時長自動前進；事件在所屬句子時間內觸發 (負 at = 句尾前、超出 = 句尾)', () => {
    const { sp, log } = make();
    expect(log).toEqual(['L0']);
    sp.update(0.6);
    expect(log).toEqual(['L0', 'A']);
    sp.update(1.25);
    expect(log).toEqual(['L0', 'A', 'B']);
    sp.update(0.2);
    expect(log).toEqual(['L0', 'A', 'B', 'L1', 'C']);
    for (let i = 0; i < 100 && !sp.done; i++) sp.update(0.1);
    expect(log).toEqual(['L0', 'A', 'B', 'L1', 'C', 'L2', 'D']);
    expect(sp.done).toBe(true);
    expect(sp.elapsed).toBeGreaterThanOrEqual(sp.total - 1e-6);
    expect(sp.elapsed).toBeLessThan(sp.total + 0.1);
  });

  it('點擊前進：本句顯示 < 0.6s 不接受；之後跳下一句並補發本句未觸發事件', () => {
    const { sp, log } = make();
    sp.update(ADVANCE_MIN_SEC - 0.1);
    expect(sp.advance()).toBe(false);
    sp.update(0.2);
    expect(sp.advance()).toBe(true);
    expect(log).toEqual(['L0', 'A', 'B', 'L1', 'C']);
    expect(sp.index).toBe(1);
  });

  it('跳過：依序補發剩下事件後結束；lead / tail 計入總長', () => {
    const { sp, log } = make(1.8, 0.6);
    expect(log).toEqual([]);
    sp.update(1.0);
    sp.finish();
    expect(log).toEqual(['A', 'B', 'C', 'D']);
    expect(sp.done).toBe(true);
    const { sp: sp2 } = make(1.8, 0.6);
    expect(sp2.total).toBeCloseTo(1.8 + 0.6 + storyTotal(lines), 5);
  });

  it('CutsceneInput：短按 = 前進、按住 1s = 跳過 (一次)、放開後不再前進', () => {
    const inp = new CutsceneInput();
    inp.press(10);
    expect(inp.update(10.5)).toBeNull();
    expect(inp.release(10.5)).toBe('ADVANCE');
    inp.press(20);
    expect(inp.progress(20.5)).toBeCloseTo(0.5, 5);
    expect(inp.update(20 + HOLD_SKIP_SEC)).toBe('SKIP');
    expect(inp.update(21.5)).toBeNull();
    expect(inp.release(21.6)).toBeNull();
    // 沒按就放開 (過場開始前按下的鍵) 不算
    expect(inp.release(30)).toBeNull();
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
    // 長過場：由台詞事件 DISSOLVE (dissolveNow) 才化花瓣
    const b2 = new FencerBoss({ ...host, onCue: undefined }, new BossFX());
    b2.resetForFight(FENCER.CENTER_X, FENCER.CENTER_Z);
    b2.startFight(0);
    b2.defeatDissolveAt = 999;
    const p = new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 1);
    for (let bar = 0; bar < 3; bar++) {
      b2.tryHitMelee(p, 1.2, 99999);
      if (bar < 2) for (let i = 0; i < 100; i++) b2.update(0.1);
      b2.position.set(FENCER.CENTER_X, 0, FENCER.CENTER_Z);
    }
    expect(b2.isDefeated).toBe(true);
    for (let i = 0; i < 50; i++) b2.update(0.1); // 5s：未觸發事件前不化
    expect(b2.root.visible).toBe(true);
    b2.dissolveNow();
    b2.update(0.05);
    expect(b2.root.visible).toBe(false);
  });

  it('換樂章：擊破後花瓣傳送回結界中央、面向玩家；過場長度由宿主設定，可提前結束', () => {
    const host: FencerBossHost = {
      playerPos: new THREE.Vector3(FENCER.ARENA_X + 12, 0, FENCER.ARENA_Z), playerVel: new THREE.Vector3(), playerDead: false, isTouch: false,
      playerOutOfCombat: false, damagePlayer: () => undefined, onBossDamaged: () => undefined, shake: () => undefined, hitStop: () => undefined
    };
    const boss = new FencerBoss(host, new BossFX());
    boss.resetForFight(FENCER.ARENA_X + 18, FENCER.ARENA_Z);
    boss.startFight(0);
    boss.tryHitMelee(new THREE.Vector3(FENCER.ARENA_X + 17, 0, FENCER.ARENA_Z), 1.2, 99999);
    expect(boss.isInTransition).toBe(true);
    boss.setTransitionDuration(12);
    expect(boss.transitionTotal).toBe(12);
    boss.update(TRANSITION_BLINK_AT - 0.1);
    expect(boss.transitionCentered).toBe(false);
    boss.update(0.2);
    expect(boss.transitionCentered).toBe(true);
    expect(boss.position.x).toBeCloseTo(FENCER.ARENA_X, 5);
    expect(boss.position.z).toBeCloseTo(FENCER.ARENA_Z, 5);
    expect(boss.rotY).toBeCloseTo(Math.PI / 2, 5); // 面向 +X 的玩家
    for (let i = 0; i < 50; i++) boss.update(0.1); // 6.5s：仍在過場 (宿主設 12s)
    expect(boss.isInTransition).toBe(true);
    boss.endTransitionNow();
    expect(boss.isInTransition).toBe(false);
    expect(boss.currentBar).toBe(1);
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
    const s = { fightsStarted: 3, defeated: true, wins: 2, lastResult: 'WIN' as const, pokes: 10, warmLineShown: true, dodgeEggShown: true, discovered: true };
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
