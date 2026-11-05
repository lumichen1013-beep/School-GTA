// cs:ch2 爸爸的書房「第四十一次」(cutscenes-v0.1 4；規格 6「第三章骨架與銜接」)：資料 (逐字稿、三鏡、秒數)、驗證器、剪紙畫面、音訊對映、
// 回憶頁與紀錄、觸發 (cutsceneBeforeLevel)；外殼流程 2-5 通關 →「前往第三章　溫室」→ 第一次播 cs:ch2 → 進 3-1 苗圃 (已看過 → 直接進)
import { describe, it, expect } from 'vitest';
import { CutscenePlayer, planCutscene } from '../../../src/puzzle/app/cutscene';
import { cutsceneById, TRANSITION_SEC } from '../../../src/puzzle/content/cutscenes';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { LEVELS, levelById } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { deep } from '../../../src/puzzle/content/levels/ch2/2-5-deep';
import { durationRange, validateCutscene } from '../../../src/puzzle/devtools/validateCutscene';
import { PAPER_SCENES } from '../../../src/puzzle/render/cutscene/scenes';
import { CUE_MAP, CUTSCENE_SCORE, SHOT_MUSIC } from '../../../src/puzzle/audio/events';
import { cutsceneBeforeLevel, memoryEntries, recordCutscene } from '../../../src/puzzle/meta/cutscenes';
import { chapterClearAlso, levelState, nextAfterClear, recordClear } from '../../../src/puzzle/meta/progress';
import { chapterStart, entryNarrationKey } from '../../../src/puzzle/meta/chapters';
import { defaultSave, seenCutscenes, skippedCutscenes } from '../../../src/puzzle/meta/save';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { createWorld } from '../../../src/puzzle/core/world';
import { openChapter, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { TEXT } from '../msgs';

const ch2 = cutsceneById('cs:ch2')!;
const DT = 1 / 60;
const run = (p: CutscenePlayer, sec: number) => { for (let t = 0; t < sec - 1e-9; t += DT) p.tick(Math.min(DT, sec - t)); };
const plan = (name = '阿青') => planCutscene(ch2, TEXT, { speed: 'normal', reduceMotion: false, name });
const CH2_DONE = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4'];

describe('cs:ch2 資料', () => {
  it('三鏡逐字稿 (cutscenes-v0.1 4，不改字)；剪紙畫面 ch2.notebook / ch2.shadows / ch2.swap；轉場 翻頁 / 墨水暈開 / 交叉淡化；觸發 = 2-5 通關後', () => {
    expect([ch2.trigger, ch2.replayable, TEXT(ch2.titleKey)]).toEqual([{ afterClear: '2-5' }, true, '第二章　第四十一次']);
    expect(ch2.shots.map(s => [s.art.sceneId, s.transitionIn, s.lines.map(k => TEXT(k))])).toEqual([
      ['ch2.notebook', 'pageTurn', ['爸爸的筆記裡，畫滿了那個圖案。', '旁邊寫著：「第四十一次。還是不亮？」']],
      ['ch2.shadows', 'inkBleed', ['圖裡的兩個人影，在書架之間來回翻書。', '翻一頁，搖一次頭。像當年的爸爸。']],
      ['ch2.swap', 'crossfade', ['書庫和溫室，對調了位置。', '綠光從彩繪玻璃後面透了進來。']]
    ]);
    for (const s of ch2.shots) expect(s.art.sceneId in PAPER_SCENES).toBe(true);
    expect(TEXT(ch2.shots[0].art.labels!.note)).toBe('第四十一次。還是不亮？');
    expect(ch2.shots[2].minVisualSec).toBe(5);
  });

  it('秒數由公式算出：總長約 28.8 秒 (章末區間 20～45)；每鏡與分鏡表 9.7 / 10.4 / 8.6 相差 < 0.15；驗證器零問題', () => {
    const p = plan('一二三四五六七八九十一二');
    expect(Math.abs(p.totalSec - 28.8)).toBeLessThan(0.3);
    [9.7, 10.4, 8.6].forEach((doc, i) => expect(Math.abs(p.shots[i].sec - doc)).toBeLessThan(0.15));
    expect(p.shots.map(s => s.def.transitionIn).map(t => TRANSITION_SEC[t])).toEqual([0.8, 1.0, 0.8]);
    expect(durationRange(ch2)).toEqual([20, 45]);
    expect(validateCutscene(ch2, { bundle: zhHant, levelIds: LEVELS.map(e => e.id) })).toEqual([]);
  });

  it('音訊：提示 pages.turn / pad.low / wall.slide / leaves / pad.out 都有對映；配樂 = 書房 (ch2)、鏡 3 轉暖；沒有驚嚇音', () => {
    const cues = ch2.shots.flatMap(s => (s.audio ?? []).map(a => a.cue));
    expect(cues).toEqual(['pages.turn', 'pad.low', 'pages.turn', 'wall.slide', 'leaves', 'pad.out']);
    expect(cues.filter(c => !(c in CUE_MAP))).toEqual([]);
    expect([CUTSCENE_SCORE['cs:ch2'], SHOT_MUSIC['cs:ch2']]).toEqual(['ch2', { 3: ['padWarm'] }]);
    expect(cues.some(c => /scare|jump|shriek|scream/i.test(c))).toBe(false);
  });

  it('自動播放：依序三鏡 → 結束 (沒跳過)；音訊掛點依序', () => {
    const pl = plan();
    const p = new CutscenePlayer(pl, { autoAdvance: true, skipConfirm: true, replay: false, seen: false });
    run(p, pl.totalSec + 0.1);
    const evs = p.drain();
    expect(evs.filter(e => e.type === 'shot').map(e => e.type === 'shot' && e.index)).toEqual([0, 1, 2]);
    expect(evs.filter(e => e.type === 'audio').map(e => e.type === 'audio' && e.cue)).toEqual(['pages.turn', 'pad.low', 'pages.turn', 'wall.slide', 'leaves', 'pad.out']);
    expect(evs.filter(e => e.type === 'end')).toEqual([{ type: 'end', skipped: false }]);
  });
});

describe('cs:ch2 觸發與紀錄 (meta/cutscenes)', () => {
  const named = { ...defaultSave(), name: '阿青' };

  it('回憶頁：2-5 通關後才列出 (未看過)；看完 = 看過、跳過 = 未看完', () => {
    expect(memoryEntries({ ...named, cleared: CH2_DONE }).map(e => e.id)).toEqual(['cs:prologue']);
    const after = { ...named, cleared: [...CH2_DONE, '2-5'] };
    expect(memoryEntries(after).find(e => e.id === 'cs:ch2')).toEqual({ id: 'cs:ch2', titleKey: 'cs.ch2.title', status: 'unseen' });
    expect(memoryEntries(recordCutscene(after, 'cs:ch2', false)).find(e => e.id === 'cs:ch2')!.status).toBe('seen');
    expect(memoryEntries(recordCutscene(after, 'cs:ch2', true)).find(e => e.id === 'cs:ch2')!.status).toBe('unfinished');
  });

  it('cutsceneBeforeLevel：2-5 已通關、還沒看過、要進的是 3-1 → cs:ch2；看過 (含跳過) / 2-5 沒通關 / 進別的關 → 沒有', () => {
    const after = { ...named, cleared: [...CH2_DONE, '2-5'] };
    expect(cutsceneBeforeLevel(after, '3-1')?.id).toBe('cs:ch2');
    expect(cutsceneBeforeLevel(after, '2-5')).toBeUndefined();
    expect(cutsceneBeforeLevel(after, '2-1')).toBeUndefined();
    expect(cutsceneBeforeLevel(recordCutscene(after, 'cs:ch2', false), '3-1')).toBeUndefined();
    expect(cutsceneBeforeLevel(recordCutscene(after, 'cs:ch2', true), '3-1')).toBeUndefined();
    expect(cutsceneBeforeLevel({ ...named, cleared: CH2_DONE }, '3-1')).toBeUndefined();
    // 序章不在這條規則裡 (序章另由 shouldAutoPlayPrologue 決定)
    expect(cutsceneBeforeLevel(defaultSave(), '1-1')).toBeUndefined();
  });
});

describe('外殼流程：2-5 通關 → 前往第三章　溫室 → cs:ch2 → 苗圃', () => {
  it('章門打開 = 第二章通關 (記入五關) → 通關文字 / 「前往第三章　溫室」→ 第一次播 cs:ch2 → 播完記入 seenCutscenes → 3-1 苗圃西門 (旁白 = 苗圃)；第二次直接進', () => {
    const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
    const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
    // 1. 2-5 章門打開 (章門的通關畫面：kind chapter，本章所有關卡記為通關)
    const w = createWorld(deep, { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib'] });
    // 章門通關的 also = app 的 chapterClearAlso (本章關卡去掉隱藏房 H1)
    let save = recordClear({ ...defaultSave(), name: '阿青', cleared: CH2_DONE, abilities: ['nib'] }, '2-5', w, chapterClearAlso(CH2.levels));
    expect(save.cleared).toEqual([...CH2_DONE, '2-5']);
    expect(TEXT(deep.nextKey)).toBe('書房和溫室，在牆後換了位置。');
    // 2. 通關畫面的「繼續」= 下一章第一關 (按鈕文字同 1-3 章門的格式)
    const next = nextAfterClear('2-5', 'chapter', CHAPTERS)!;
    const nextCh = CHAPTERS.find(c => c.levels.includes(next))!;
    expect([next, TEXT('ui.clear.next', { level: TEXT(nextCh.titleKey) }), levelState(levelById(next)!, save)]).toEqual(['3-1', '前往第三章　溫室', 'open']);
    // 3. 第一次按下 → 先播 cs:ch2 (app.levelWithCutscene)
    const cut = cutsceneBeforeLevel(save, next)!;
    expect(cut.id).toBe('cs:ch2');
    const pl = planCutscene(cut, TEXT, { speed: 'normal', reduceMotion: false, name: save.name });
    const p = new CutscenePlayer(pl, { autoAdvance: true, skipConfirm: true, replay: false, seen: seenCutscenes(save).includes(cut.id) });
    run(p, pl.totalSec + 0.1);
    const end = p.drain().find(e => e.type === 'end');
    expect(end).toEqual({ type: 'end', skipped: false });
    save = recordCutscene(save, cut.id, false);
    expect([seenCutscenes(save), skippedCutscenes(save)]).toEqual([['cs:ch2'], []]);
    // 4. 播完進 3-1：第三章沒有存檔 → 新章 (魔方 S0、苗圃西門內側)；旁白 = 苗圃
    const spec: ChapterSpec = { chapter: 3, cube: CH3.cube, rooms: CH3.rooms, doors: chapterDoors(CH3.rooms) };
    const st = chapterStart(save, spec, CH3.start);
    const cs = openChapter(spec, st, { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib'] });
    expect([cs.state.room, cs.state.door, TEXT(entryNarrationKey(spec, cs.state)), cs.world.ext.cube!.links.doorW]).toEqual(['nursery', 'doorW', '比例尺掛在門邊。爸爸在旁邊畫了個問號。', { to: 'frame', frame: 'study' }]);
    // 5. 已看過 → 下次 (通關畫面 / 選單) 直接進
    expect(cutsceneBeforeLevel(save, '3-1')).toBeUndefined();
  });
});
