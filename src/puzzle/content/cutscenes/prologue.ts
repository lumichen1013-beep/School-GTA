import type { CutsceneDef } from '../cutsceneTypes';

/**
 * cs:prologue 序章「地毯底下的圖案」(12 鏡)：爸爸過世三年後回到老宅，捲起書房地毯踩到圖案，鋼筆升起，試煉開始。
 * 第一版全部用剪紙繪製；第 9、10、11 鏡是老宅重組後的 1-1 門廊，engineCandidate 標示日後可換成引擎鏡頭。
 * 秒數一律由公式算出 (資料不寫秒數)；轉場預算讓總長落在 60～110 秒。
 */
export const prologue: CutsceneDef = {
  id: 'cs:prologue',
  titleKey: 'cs.prologue.title',
  trigger: { beforeFirst: '1-1' },
  replayable: true,
  shots: [
    { // 1 空了三年的老宅 (窗全暗、雜草、落葉)
      art: { kind: 'paper', sceneId: 'prologue.emptyHouse' },
      motion: { push: 0.05, parallax: 0.02, durSec: 9 },
      transitionIn: 'fade',
      lines: ['cs.prologue.1.1', 'cs.prologue.1.2'],
      audio: [{ at: 'start', cue: 'pad.in' }, { at: 'start', cue: 'wind' }]
    },
    { // 2 山路三層、訊號消失
      art: { kind: 'paper', sceneId: 'prologue.mountain' },
      motion: { panX: 0.06, parallax: 0.03, durSec: 8 },
      transitionIn: 'crossfade',
      lines: ['cs.prologue.2.1', 'cs.prologue.2.2'],
      audio: [{ at: 'start', cue: 'car.climb' }, { at: 'line', line: 2, cue: 'signal.drop' }]
    },
    { // 3 書房：地毯、書桌、爸爸的筆記，灰塵在光裡飄
      art: { kind: 'paper', sceneId: 'prologue.study' },
      motion: { push: 0.05, parallax: 0.02, durSec: 10 },
      transitionIn: 'crossfade',
      lines: ['cs.prologue.3.1', 'cs.prologue.3.2'],
      audio: [{ at: 'start', cue: 'door.creak' }, { at: 'line', line: 2, cue: 'paper.rub' }]
    },
    { // 4 回憶 (泛黃剪紙)：爸爸說祖先是魔法師，默默收起筆記
      art: { kind: 'paper', sceneId: 'prologue.memory' },
      motion: { push: 0.03, durSec: 10 },
      transitionIn: 'pageTurn',
      lines: ['cs.prologue.4.1', 'cs.prologue.4.2'],
      audio: [{ at: 'start', cue: 'pad.warm' }, { at: 'line', line: 2, cue: 'notebook.close' }]
    },
    { // 5 捲起地毯：地板上刻著圖案
      art: { kind: 'paper', sceneId: 'prologue.rug' },
      motion: { push: 0.04, durSec: 8 },
      transitionIn: 'cut',
      lines: ['cs.prologue.5.1', 'cs.prologue.5.2'],
      audio: [{ at: 'start', cue: 'rug.roll' }, { at: 'line', line: 2, cue: 'pad.low' }]
    },
    { // 6 踩上去：圖案亮起，鋼筆從中央升起
      art: { kind: 'paper', sceneId: 'prologue.circle' },
      motion: { push: 0.06, durSec: 9 },
      transitionIn: 'cut',
      lines: ['cs.prologue.6.1', 'cs.prologue.6.2'],
      audio: [{ at: 'start', cue: 'circle.hum' }, { at: 'line', line: 2, cue: 'pen.rise' }]
    },
    { // 7 握住鋼筆：書房開始轉動
      art: { kind: 'paper', sceneId: 'prologue.grasp' },
      motion: { push: 0.04, durSec: 7 },
      transitionIn: 'cut',
      lines: ['cs.prologue.7.1', 'cs.prologue.7.2'],
      audio: [{ at: 'start', cue: 'pen.grip' }, { at: 'line', line: 2, cue: 'house.rumble' }]
    },
    { // 8 老宅剖面像魔方重組：牆滑動、樓梯翻轉
      art: { kind: 'paper', sceneId: 'prologue.rearrange' },
      motion: { parallax: 0.02, durSec: 8 },
      transitionIn: 'cut',
      lines: ['cs.prologue.8.1', 'cs.prologue.8.2'],
      audio: [{ at: 'start', cue: 'wall.slide' }, { at: 'line', line: 2, cue: 'stairs.flip' }]
    },
    { // 9 門窗鎖死；筆身浮現刻字 (分鏡：1-1 門廊)
      art: { kind: 'paper', sceneId: 'prologue.locked', labels: { engrave: 'cs.prologue.art.engrave' }, engineCandidate: { levelId: '1-1' } },
      motion: { push: 0.03, durSec: 10 },
      transitionIn: 'cut',
      lines: ['cs.prologue.9.1', 'cs.prologue.9.2', 'cs.prologue.9.3'],
      audio: [{ at: 'start', cue: 'door.rattle' }, { at: 'line', line: 2, cue: 'pen.engrave' }]
    },
    { // 10 按下鋼筆：老宅被壓平成圖；角落站著一個人影 (分鏡：遊戲內切換)
      art: { kind: 'paper', sceneId: 'prologue.flatten', engineCandidate: { levelId: '1-1' } },
      transitionIn: 'inkBleed',
      lines: ['cs.prologue.10.1', 'cs.prologue.10.2', 'cs.prologue.10.3'],
      audio: [{ at: 'start', cue: 'pen.click' }, { at: 'line', line: 2, cue: 'switch.lowpass' }, { at: 'line', line: 3, cue: 'pad.semitoneDown' }]
    },
    { // 11 回到實景：牆上爸爸的字條 (分鏡：1-1 門廊)
      art: { kind: 'paper', sceneId: 'prologue.note', engineCandidate: { levelId: '1-1' } },
      motion: { push: 0.06, durSec: 10 },
      transitionIn: 'cut',
      lines: ['cs.prologue.11.1', 'cs.prologue.11.2', 'cs.prologue.11.3'],
      audio: [{ at: 'line', line: 2, cue: 'paper.flutter' }]
    },
    { // 12 標題卡
      art: { kind: 'paper', sceneId: 'prologue.title', labels: { title: 'cs.prologue.art.title' } },
      transitionIn: 'fade',
      lines: ['cs.prologue.12.1'],
      minVisualSec: 4,
      audio: [{ at: 'end', cue: 'pad.out' }]
    }
  ]
};
