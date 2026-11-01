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
  fencerQuestStage, victoryIsLong, REMATCH_ARM_SEC, LINE_RULES, HEART_AFTER_BOSS_SEC, HEART_DEFER_MAX, rematchIntroKey, rematchWinKey, transitionIsFull,
  dawnProgress, duskTargetLevel, duskColorAt, DUSK_LEVELS, type BossCue
} from '../src/game/fencer/fencerRules';
import { parseFencerSave, serializeFencerSave, defaultFencerSave, questStageOf, STORY_SEEN } from '../src/game/fencer/fencerSave';
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
    expect(player.length).toBe(5);
    for (const t of player) expect(STORY.storyLen(t)).toBeLessThanOrEqual(PLAYER_MAX);
  });

  it('全校廣播維持既有慣例 (加入輪播)', () => {
    expect(STORY.BROADCAST.lines.length).toBe(3);
    expect(STORY.storyLen(STORY.BROADCAST.afterWin)).toBeGreaterThan(MAX); // 跑馬燈
    expect(STORY.BROADCAST.afterWinOnce).toContain('花，長得很好');
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

  it('首戰開場約 17s、首勝約 24s；換樂章完整版 ≤ 26s、短版約 7s (前導 1.8s + 台詞 + 收尾 0.6s)', () => {
    expect(storyTotal(STORY.INTRO_FIRST_BEATS)).toBeGreaterThan(16);
    expect(storyTotal(STORY.INTRO_FIRST_BEATS)).toBeLessThan(18.5);
    expect(storyTotal(STORY.VICTORY_FIRST_BEATS)).toBeGreaterThan(18);
    expect(storyTotal(STORY.VICTORY_FIRST_BEATS)).toBeLessThan(26);
    for (const lines of STORY.TRANSITION_BEATS) {
      const t = storyTotal(lines, TRANSITION_LEAD_SEC, TRANSITION_TAIL_SEC);
      expect(t).toBeGreaterThan(18);
      expect(t).toBeLessThan(26);
    }
    for (const lines of STORY.TRANSITION_BEATS_SHORT) {
      expect(lines.length).toBe(2);
      const t = storyTotal(lines, TRANSITION_LEAD_SEC, TRANSITION_TAIL_SEC);
      expect(t).toBeGreaterThan(6);
      expect(t).toBeLessThan(8);
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
    expect(ids(STORY.VICTORY_FIRST_BEATS)).toEqual(['FACE', 'DISSOLVE', 'OUTRO', 'RESTORE', 'RAPIER', 'FLOWER', 'BLEND']);
    // 向陽之心第一句 = 覺醒 (自我介紹)
    expect(STORY.INTRO_FIRST_BEATS.find((b) => b.events?.some((e) => e.id === 'AWAKEN'))?.text).toContain('向陽之心');
    // 結界升起 1.5s 動畫：首戰 WALL_UP 在 FLASH 後 ≥ 1.5s；Boss 在結界升滿之後現身
    const at = (lines: readonly StoryLine[], id: string) => {
      let t0 = 0;
      for (const l of lines) {
        const d = lineDuration(l);
        const e = l.events?.find((x) => x.id === id);
        if (e) { const a = e.at ?? 0; return t0 + Math.min(d, Math.max(0, a < 0 ? d + a : a)); }
        t0 += d;
      }
      return NaN;
    };
    expect(at(STORY.INTRO_FIRST_BEATS, 'WALL_UP') - at(STORY.INTRO_FIRST_BEATS, 'FLASH')).toBeGreaterThanOrEqual(1.5);
    expect(at(STORY.INTRO_FIRST_BEATS, 'BOSS')).toBeGreaterThan(at(STORY.INTRO_FIRST_BEATS, 'WALL_UP'));
    // 開場不再用旁白描述暮色 (改畫面演出)
    expect(STORY.INTRO_FIRST_BEATS.some((b) => b.text.startsWith('（'))).toBe(false);
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
  it('招式名每樂章第一次必喊、之後機率 + 間隔；終幕預警每次；追擊每場一次', () => {
    const g = new BossLineGate();
    const never = () => 0.99;
    const always = () => 0;
    expect(g.allow('S1', 0, 0, never)).toBe(true);
    expect(g.allow('S1', 0, 10, never)).toBe(false);       // 第二次：機率沒中
    expect(g.allow('S1', 0, 10, always)).toBe(true);       // 機率中、距上一句夠久
    g.noteSay(20);
    expect(g.allow('S1', 0, 21, always)).toBe(false);      // 距上一句 < SAY_GAP
    expect(g.allow('S1', 1, 21, never)).toBe(true);        // 新樂章第一次必喊
    for (let i = 0; i < 3; i++) expect(g.allow('S3_FINALE', 2, 0, never)).toBe(true);
    expect(g.allow('BOW', 1, 0, never)).toBe(true);
    expect(g.allow('BOW', 1, 50, never)).toBe(false);
    expect(g.allow('BOW', 1, 50, () => LINE_RULES.BOW_REPEAT_CHANCE - 0.01)).toBe(true);
    expect(g.allow('CHASE', 0)).toBe(true);
    expect(g.allow('CHASE', 2)).toBe(false);
    expect(g.allow('BACKFLIP', 0)).toBe(false); // 由反應台詞處理
    g.resetFight();
    expect(g.allow('S1', 0, 0, never)).toBe(true);
    expect(g.allow('CHASE', 0)).toBe(true);
  });

  it('反應台詞：間隔 ≥ 8s、離上一句 ≥ 2.5s、每樂章各一次且 ≤ 3 句、每場一次句；不允許時不消耗', () => {
    const g = new BossLineGate();
    expect(g.allowBark('HALF', 0, 10)).toBe(true);
    expect(g.allowBark('HALF', 0, 30)).toBe(false);        // 本樂章已說過
    expect(g.allowBark('BIG_HIT', 0, 12)).toBe(false);     // 間隔不足 (未消耗)
    expect(g.allowBark('BIG_HIT', 0, 18)).toBe(true);
    g.noteSay(27);
    expect(g.allowBark('BACKFLIP', 0, 28)).toBe(false);    // 剛說完招式名
    expect(g.allowBark('BACKFLIP', 0, 30)).toBe(true);
    expect(g.allowBark('CLEAN_DODGE', 0, 60)).toBe(false); // 本樂章已 3 句
    expect(g.allowBark('CLEAN_DODGE', 1, 60)).toBe(true);  // 新樂章重新計
    expect(g.allowBark('RANGED', 1, 70)).toBe(true);
    expect(g.allowBark('RANGED', 2, 100)).toBe(false);     // 每場一次
    // 連續一分鐘每秒嘗試：反應台詞最多每 8 秒一句
    const g2 = new BossLineGate();
    const kinds = ['HALF', 'CLEAN_DODGE', 'BIG_HIT', 'BACKFLIP', 'PLAYER_LOW', 'RANGED', 'RAPIER', 'IDLE', 'COMEBACK'] as const;
    let n = 0;
    for (let t = 0; t < 60; t++) for (const k of kinds) if (g2.allowBark(k, Math.floor(t / 20), t)) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(60 / LINE_RULES.BARK_GAP));
    expect(n).toBeGreaterThanOrEqual(6);
  });

  it('向陽之心：每句每場一次、教學句 ≤ 上限、間隔 10s、Boss 剛說完先等 (逾時丟棄)、H1 立即、H3 不等間隔', () => {
    const h = new HeartVoice();
    expect(h.request('TEACH', 0)).toBe(true);
    expect(h.poll(0, -99)).toBe('TEACH');
    expect(h.request('TEACH', 1)).toBe(false);
    // H3 回血確認：不等 10s 間隔，但等 Boss 說完
    expect(h.request('H3', 2)).toBe(true);
    expect(h.poll(2, 1.5)).toBeNull();
    expect(h.poll(2 + HEART_AFTER_BOSS_SEC, 1.5)).toBe('H3');
    // 一般句要等 10s 間隔；超過延後上限就丟棄
    expect(h.request('H2', 5)).toBe(true);
    expect(h.poll(6, -99)).toBeNull();
    expect(h.poll(5 + HEART_DEFER_MAX + 0.1, -99)).toBeNull();
    expect(h.hasFired('H2')).toBe(false);
    expect(h.request('H2', 20)).toBe(true);
    expect(h.poll(20, -99)).toBe('H2');
    // H1 (致意破綻) 立即
    expect(h.request('H1', 21)).toBe(true);
    expect(h.poll(21, 21)).toBe('H1');
    expect(h.spoken).toBe(4);
    // 劇情句不計入教學上限
    expect(h.request('S2', 40)).toBe(true);
    expect(h.poll(40, -99)).toBe('S2');
    expect(h.spoken).toBe(4);
    h.resetFight();
    expect(h.request('TEACH', 0)).toBe(true);
    expect(Object.keys(STORY.HEART_LINES).filter((k) => !['S2', 'S3', 'DAWN'].includes(k)).length).toBeLessThanOrEqual(STORY.HEART_MAX_PER_FIGHT);
  });

  it('回血教學：說明功用 (距離 / 別出手 / 八成) 與來源 (向陽之心)；HUD 標籤帶小花', () => {
    const teach = STORY.HEART_LINES.TEACH.text + STORY.HEART_TEACH_2.text;
    expect(teach).toContain('向陽之心');
    expect(teach).toContain('回血');
    expect(teach).toContain(`${FENCER.OOC_MIN_DIST} 公尺`);
    expect(teach).toContain('別出手');
    expect(teach).toContain('八成');
    expect(FENCER.OOC_CAP_RATIO).toBe(0.8);
    expect(STORY.HEART_LINES.H3.text).toContain('八成');
    expect(STORY.HEART_LINES.H2.text).toContain(`${FENCER.OOC_MIN_DIST} 公尺`);
    expect(STORY.REGEN_TAG(FENCER.OOC_REGEN)).toBe(`🌻+${FENCER.OOC_REGEN}/s`);
  });

  it('台詞依樂章分組：招式名 / 反應台詞三樂章齊全 (終樂章過半由黎明轉折取代)', () => {
    for (const spec of Object.values(STORY.BOSS_CUE_LINES)) {
      expect(spec.byBar.length).toBe(3);
      for (const pool of spec.byBar) expect(pool.length).toBeGreaterThan(0);
    }
    for (const [k, lines] of Object.entries(STORY.BOSS_BARK_LINES)) {
      expect(lines.length).toBe(3);
      lines.forEach((l, i) => expect(l.length > 0).toBe(!(k === 'HALF' && i === 2)));
    }
    expect(STORY.DEFEAT_BOSS_LINES_BY_BAR.length).toBe(3);
    expect(STORY.RESPAWN_HEART_LINES_BY_BAR.length).toBe(3);
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

  it('貼身過久 → Boss 後空翻並發出 BACKFLIP 提示點', () => {
    const cues: BossCue[] = [];
    const pp = new THREE.Vector3(FENCER.ARENA_X + 0.6, 0, FENCER.ARENA_Z);
    const host: FencerBossHost = {
      playerPos: pp, playerVel: new THREE.Vector3(), playerDead: false, isTouch: false, playerOutOfCombat: false,
      damagePlayer: () => undefined, onBossDamaged: () => undefined, shake: () => undefined, hitStop: () => undefined, onCue: (c) => cues.push(c)
    };
    const boss = new FencerBoss(host, new BossFX());
    boss.resetForFight(FENCER.ARENA_X, FENCER.ARENA_Z);
    boss.startFight(5);
    for (let i = 0; i < 120 && !cues.includes('BACKFLIP'); i++) {
      pp.set(boss.position.x + 0.6, 0, boss.position.z);
      boss.update(1 / 30);
    }
    expect(cues).toContain('BACKFLIP');
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
    const s = {
      fightsStarted: 3, defeated: true, wins: 2, lastResult: 'WIN' as const, pokes: 10, warmLineShown: true, dodgeEggShown: true, discovered: true,
      lastBar: 2, storySeen: STORY_SEEN.TRANSITION_1 | STORY_SEEN.REGEN_TAUGHT, flagNews: true
    };
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

describe('劇情 v2：分支挑選 / 天色 / 存檔', () => {
  it('再戰開場：帶細劍 > 上次輸在終樂章 > 上次輸 > 上次贏 (依勝場)', () => {
    expect(rematchIntroKey({ lastResult: 'WIN', wins: 9, lastBar: 2, hasRapier: true })).toBe('rapier');
    expect(rematchIntroKey({ lastResult: 'LOSS', wins: 0, lastBar: 2, hasRapier: false })).toBe('lossFinal');
    expect(rematchIntroKey({ lastResult: 'LOSS', wins: 3, lastBar: 1, hasRapier: false })).toBe('afterLoss');
    expect(rematchIntroKey({ lastResult: 'WIN', wins: 1, lastBar: 2, hasRapier: false })).toBe('afterWin');
    expect(rematchIntroKey({ lastResult: 'WIN', wins: 3, lastBar: 2, hasRapier: false })).toBe('regular');
    expect(rematchIntroKey({ lastResult: 'WIN', wins: 5, lastBar: 2, hasRapier: false })).toBe('veteran');
    for (const k of Object.keys(STORY.REMATCH_BOSS_LINE)) expect(STORY.REMATCH_BOSS_LINE[k as keyof typeof STORY.REMATCH_BOSS_LINE]).toBeTruthy();
  });

  it('再戰勝利：用細劍 > 勝場分級', () => {
    expect(rematchWinKey(2, true)).toBe('rapier');
    expect(rematchWinKey(2, false)).toBe('early');
    expect(rematchWinKey(4, false)).toBe('regular');
    expect(rematchWinKey(7, false)).toBe('veteran');
  });

  it('換樂章：第一次完整版、看過改短版 (各樂章分開記)', () => {
    expect(transitionIsFull(1, 0)).toBe(true);
    expect(transitionIsFull(1, STORY_SEEN.TRANSITION_1)).toBe(false);
    expect(transitionIsFull(2, STORY_SEEN.TRANSITION_1)).toBe(true);
    expect(transitionIsFull(2, STORY_SEEN.TRANSITION_2)).toBe(false);
    // 完整版揭露老師 / 種子 / 割草機
    const t1 = STORY.TRANSITION_BEATS[0].map((b) => b.text).join('');
    const t2 = STORY.TRANSITION_BEATS[1].map((b) => b.text).join('');
    expect(t1).toContain('種子');
    expect(t1).toContain('支架');
    expect(t2).toContain('割草機');
    expect(STORY.TRANSITION_BEATS_SHORT[1][1].text).toContain('〈落日〉');
  });

  it('天色：三樂章各一段，終樂章過半起依血量轉晨金', () => {
    expect(dawnProgress(0, 0.1, 0.5)).toBe(0);
    expect(dawnProgress(2, 0.8, 0.5)).toBe(0);
    expect(dawnProgress(2, 0.25, 0.5)).toBeCloseTo(0.5, 5);
    expect(dawnProgress(2, 0, 0.5)).toBe(1);
    expect(duskTargetLevel(0, 1)).toBe(0);
    expect(duskTargetLevel(1, 1)).toBe(1);
    expect(duskTargetLevel(2, 0.5)).toBe(2.5);
    expect(duskColorAt(0, 'sky')).toBe(DUSK_LEVELS[0].sky);
    expect(duskColorAt(3, 'sky')).toBe(DUSK_LEVELS[3].sky);
    expect(duskColorAt(9, 'fog')).toBe(DUSK_LEVELS[3].fog);
    const mid = duskColorAt(2.5, 'sky');
    expect((mid >> 16) & 0xff).toBeGreaterThan((DUSK_LEVELS[2].sky >> 16) & 0xff);
    expect((mid >> 16) & 0xff).toBeLessThan((DUSK_LEVELS[3].sky >> 16) & 0xff);
  });

  it('存檔：新欄位缺漏取預設、範圍夾住；未首勝不保留社旗旗標', () => {
    const a = parseFencerSave('{"fightsStarted":2,"lastBar":9,"storySeen":99}');
    expect(a.lastBar).toBe(2);
    expect(a.storySeen).toBe(7);
    expect(a.flagNews).toBe(false);
    expect(parseFencerSave('{"flagNews":true}').flagNews).toBe(false);
    expect(parseFencerSave('{"defeated":true,"flagNews":true}').flagNews).toBe(true);
    const old = parseFencerSave('{"defeated":true,"wins":3}');
    expect(old.lastBar).toBe(0);
    expect(old.storySeen).toBe(0);
  });

  it('社旗廣播播過後，日常台詞多一句老師的接話', () => {
    const t = new SunflowerTaunt();
    t.recordResult('WIN');
    t.warmLineShown = true;
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(t.poke(i * 10, () => (i % 7) / 7).line!.text);
    expect(seen.has(STORY.SUNFLOWER_DAILY_AFTER_FLAG.text)).toBe(false);
    t.flagNewsHeard = true;
    for (let i = 40; i < 80; i++) seen.add(t.poke(i * 10, () => 0.999).line!.text);
    expect(seen.has(STORY.SUNFLOWER_DAILY_AFTER_FLAG.text)).toBe(true);
  });
});
