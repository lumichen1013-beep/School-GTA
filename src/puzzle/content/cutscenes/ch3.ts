import type { CutsceneDef } from '../cutsceneTypes';

/**
 * cs:ch3 溫室之後「只攔，不傷」(3 鏡；cutscenes-v0.1 4，逐字稿不改字)：追逐後的安撫——殘影是守衛，只攔不傷；第三次章間轉動 (往下沉)。
 * 觸發 = 3-4 通關後第一次「前往第四章　地下室」(或第一次從選單進 4-1)；全部用剪紙繪製 (鏡 1 原為引擎鏡頭，本版同 cs:ch2 剪紙)。
 * 秒數一律由公式算出 (資料不寫秒數)；章末過場總長 20～45 秒
 */
export const ch3: CutsceneDef = {
  id: 'cs:ch3',
  titleKey: 'cs.ch3.title',
  trigger: { afterClear: '3-4' },
  replayable: true,
  shots: [
    { // 1 溫室深處：燈架停下，螢光植物由冷轉暖；人影沒有再追來
      art: { kind: 'paper', sceneId: 'ch3.depths', labels: { xu: 'cs.ch3.art.xu' } },
      motion: { push: 0.04, durSec: 6 },
      transitionIn: 'fade',
      lines: ['cs.ch3.1.1'],
      audio: [{ at: 'start', cue: 'pad.low' }]
    },
    { // 2 手記第三頁：守門人影的速寫，旁邊一行字
      art: { kind: 'paper', sceneId: 'ch3.diary', labels: { page: 'cs.ch3.art.page', xu: 'cs.ch3.art.xu' } },
      transitionIn: 'pageTurn',
      lines: ['cs.ch3.2.1', 'cs.ch3.2.2'],
      audio: [{ at: 'start', cue: 'pages.turn' }]
    },
    { // 3 剖面魔方：溫室那一層往下轉、沉到大樹的根系底下；根從天花板垂下
      art: { kind: 'paper', sceneId: 'ch3.sink' },
      transitionIn: 'crossfade',
      lines: ['cs.ch3.3.1', 'cs.ch3.3.2'],
      minVisualSec: 5,
      audio: [{ at: 'start', cue: 'wall.slide' }, { at: 'end', cue: 'pad.out' }]
    }
  ]
};
