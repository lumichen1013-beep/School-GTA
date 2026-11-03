import type { CutsceneDef } from '../cutsceneTypes';

/**
 * cs:ch2 爸爸的書房「第四十一次」(3 鏡；cutscenes-v0.1 4，逐字稿不改字)：爸爸試了一輩子、圖案從沒亮過；殘影重複爸爸的動作；
 * 第二次章間轉動 (書庫和溫室對調)。觸發 = 2-5 通關後第一次「前往第三章　溫室」(或第一次從選單進 3-1)；全部用剪紙繪製。
 * 秒數一律由公式算出 (資料不寫秒數)；章末過場總長 20～45 秒
 */
export const ch2: CutsceneDef = {
  id: 'cs:ch2',
  titleKey: 'cs.ch2.title',
  trigger: { afterClear: '2-5' },
  replayable: true,
  shots: [
    { // 1 爸爸的筆記本特寫：魔法陣草圖、問號、日期、劃掉的字；最後一行
      art: { kind: 'paper', sceneId: 'ch2.notebook', labels: { note: 'cs.ch2.art.note' } },
      motion: { push: 0.04, durSec: 10 },
      transitionIn: 'pageTurn',
      lines: ['cs.ch2.1.1', 'cs.ch2.1.2'],
      audio: [{ at: 'start', cue: 'pages.turn' }]
    },
    { // 2 藏寶圖裡的書庫：兩道殘影在書架之間來回翻書、搖頭 (靜止長鏡頭)
      art: { kind: 'paper', sceneId: 'ch2.shadows' },
      transitionIn: 'inkBleed',
      lines: ['cs.ch2.2.1', 'cs.ch2.2.2'],
      audio: [{ at: 'start', cue: 'pad.low' }, { at: 'line', line: 2, cue: 'pages.turn' }]
    },
    { // 3 剖面魔方：書庫方塊與溫室方塊對調；綠光照進書庫的門
      art: { kind: 'paper', sceneId: 'ch2.swap' },
      transitionIn: 'crossfade',
      lines: ['cs.ch2.3.1', 'cs.ch2.3.2'],
      minVisualSec: 5,
      audio: [{ at: 'start', cue: 'wall.slide' }, { at: 'line', line: 2, cue: 'leaves' }, { at: 'end', cue: 'pad.out' }]
    }
  ]
};
