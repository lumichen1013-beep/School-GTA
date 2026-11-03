import type { CutsceneDef } from '../cutsceneTypes';

/**
 * cs:prologue 序章「遺囑只寫了你的名字」(cutscenes-v0.1 4，11 鏡)。
 * 第一版全部用剪紙繪製；第 7、9、10 鏡在分鏡中是 1-1 門廊的場景，engineCandidate 標示日後可換成引擎鏡頭。
 */
export const prologue: CutsceneDef = {
  id: 'cs:prologue',
  titleKey: 'cs.prologue.title',
  trigger: { beforeFirst: '1-1' },
  replayable: true,
  shots: [
    { // 1 書桌上的信封 (火漆「許」)
      art: { kind: 'paper', sceneId: 'prologue.desk', labels: { seal: 'cs.prologue.art.seal' } },
      motion: { push: 0.05, parallax: 1, durSec: 8 },
      transitionIn: 'fade',
      lines: ['cs.prologue.1.1'],
      audio: [{ at: 'start', cue: 'pad.in' }, { at: 'start', cue: 'paper.rub' }]
    },
    { // 2 信紙特寫
      art: { kind: 'paper', sceneId: 'prologue.letter', labels: { firm: 'cs.prologue.art.firm', will: 'cs.prologue.art.will' } },
      motion: { parallax: 0.02, durSec: 9 },
      transitionIn: 'crossfade',
      lines: ['cs.prologue.2.1', 'cs.prologue.2.2'],
      audio: [{ at: 'start', cue: 'paper.flip' }]
    },
    { // 3 律師的手：鑰匙、鋼筆、五個信封
      art: { kind: 'paper', sceneId: 'prologue.lawyer' },
      transitionIn: 'crossfade',
      lines: ['cs.prologue.3.1', 'cs.prologue.3.2'],
      audio: [{ at: 'start', cue: 'keys.jingle' }]
    },
    { // 4 回憶：倒著看地圖
      art: { kind: 'paper', sceneId: 'prologue.memory' },
      motion: { push: 0.03, durSec: 10 },
      transitionIn: 'inkBleed',
      lines: ['cs.prologue.4.1', 'cs.prologue.4.2'],
      audio: [{ at: 'start', cue: 'pad.warm' }, { at: 'line', line: 2, cue: 'laugh.far' }]
    },
    { // 5 山路三層
      art: { kind: 'paper', sceneId: 'prologue.mountain' },
      motion: { panX: 0.08, parallax: 1, durSec: 8 },
      transitionIn: 'crossfade',
      lines: ['cs.prologue.5.1', 'cs.prologue.5.2'],
      audio: [{ at: 'start', cue: 'car.away' }, { at: 'start', cue: 'wind' }]
    },
    { // 6 老宅正面、傍晚
      art: { kind: 'paper', sceneId: 'prologue.mansion' },
      motion: { push: 0.08, durSec: 10 },
      transitionIn: 'crossfade',
      lines: ['cs.prologue.6.1', 'cs.prologue.6.2'],
      audio: [{ at: 'line', line: 2, cue: 'engine.fade' }]
    },
    { // 7 走進門廊 (分鏡：引擎鏡頭 1-1 門廊)
      art: { kind: 'paper', sceneId: 'prologue.porch', engineCandidate: { levelId: '1-1' } },
      motion: { push: 0.06, durSec: 8 },
      transitionIn: 'fade',
      lines: ['cs.prologue.7.1', 'cs.prologue.7.2'],
      audio: [{ at: 'start', cue: 'door.hinge' }, { at: 'line', line: 2, cue: 'lock.click' }]
    },
    { // 8 鋼筆特寫
      art: { kind: 'paper', sceneId: 'prologue.pen', labels: { engrave: 'cs.prologue.art.engrave' } },
      transitionIn: 'cut',
      lines: ['cs.prologue.8.1', 'cs.prologue.8.2'],
      audio: [{ at: 'start', cue: 'pen.cap' }]
    },
    { // 9 門廊被壓平成藏寶圖；角落兩道輪廓 (分鏡：遊戲內切換)
      art: { kind: 'paper', sceneId: 'prologue.flatten', engineCandidate: { levelId: '1-1' } },
      transitionIn: 'inkBleed',
      lines: ['cs.prologue.9.1', 'cs.prologue.9.2'],
      // 輪廓淡入 1.5 秒、停 1 秒、淡出 1.5 秒 (從鏡頭開始約 1.5 秒起)
      minVisualSec: 5.5,
      audio: [{ at: 'start', cue: 'switch.lowpass' }, { at: 'start', cue: 'pad.semitoneDown' }]
    },
    { // 10 回到實景：牆上叔公的字條 (分鏡：1-1 門廊)
      art: { kind: 'paper', sceneId: 'prologue.note', engineCandidate: { levelId: '1-1' } },
      motion: { push: 0.07, durSec: 9 },
      transitionIn: 'inkBleed',
      lines: ['cs.prologue.10.1', 'cs.prologue.10.2'],
      audio: [{ at: 'line', line: 2, cue: 'paper.flutter' }]
    },
    { // 11 標題卡
      art: { kind: 'paper', sceneId: 'prologue.title', labels: { title: 'cs.prologue.art.title' } },
      transitionIn: 'fade',
      lines: ['cs.prologue.11.1'],
      minVisualSec: 4,
      audio: [{ at: 'end', cue: 'pad.out' }]
    }
  ]
};
