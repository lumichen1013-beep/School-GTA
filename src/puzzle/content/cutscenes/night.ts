import type { CutsceneDef } from '../cutsceneTypes';

/**
 * cs:night 撕圖那晚 (回憶；6 鏡；cutscenes-v0.1 4，逐字稿不改字)：揭露爸爸最後一次嘗試與撕圖 (老宅圖殘片的由來)；第四次章間轉動 (往上翻)。
 * 觸發 = 4-4 通關後第一次「前往第五章　閣樓」(或第一次從選單進 5-1)；全部用剪紙繪製。
 * 光敏：鏡 3 的天色 4 秒緩變 (不閃爍)、鏡 4 的紙裂 1.2 秒 (無閃光、無巨響)；秒數一律由公式算出 (資料不寫秒數)；章末過場總長 20～45 秒
 */
export const night: CutsceneDef = {
  id: 'cs:night',
  titleKey: 'cs.night.title',
  trigger: { afterClear: '4-4' },
  replayable: true,
  shots: [
    { // 1 4-4 抽屜裡的筆記，字寫到一半就斷了 (翻頁、緩推到斷掉的那一行；翻頁後靜默)
      art: { kind: 'paper', sceneId: 'night.notes', labels: { line: 'cs.night.art.line' } },
      motion: { push: 0.05, durSec: 7 },
      transitionIn: 'pageTurn',
      lines: ['cs.night.1.1', 'cs.night.1.2'],
      audio: [{ at: 'start', cue: 'pages.turn' }]
    },
    { // 2 回憶 (低飽和、泛黃剪紙)：深夜的書房，年輕一點的爸爸站在魔法陣中央，桌上攤著他手繪的老宅圖 (墨水暈開進入、極慢緩推；低頻長音)
      art: { kind: 'paper', sceneId: 'night.study' },
      motion: { push: 0.03, durSec: 6 },
      transitionIn: 'inkBleed',
      lines: ['cs.night.2.1'],
      audio: [{ at: 'start', cue: 'pad.low' }]
    },
    { // 3 魔法陣的刻紋始終是暗的；窗外由深藍慢慢變成灰白 (天色 4 秒緩變，非閃爍；遠處第一聲鳥叫)
      art: { kind: 'paper', sceneId: 'night.dawn' },
      transitionIn: 'cut',
      lines: ['cs.night.3.1', 'cs.night.3.2'],
      minVisualSec: 4,
      audio: [{ at: 'end', cue: 'birds' }]
    },
    { // 4 爸爸拿起畫了多年的老宅圖；紙沿著摺痕慢慢裂成六塊 (紙裂 1.2 秒；撕紙聲 ≤ -18 dBFS、起音 ≥ 150 ms)
      art: { kind: 'paper', sceneId: 'night.tear' },
      transitionIn: 'paperTear',
      lines: ['cs.night.4.1'],
      audio: [{ at: 'start', cue: 'paper.tear' }]
    },
    { // 5 早晨的廚房剪紙：爸爸站在門口向房間裡喊；你的小剪影從被窩坐起 (靜止、晨光由左緩亮；長音墊轉暖、水壺很輕)
      art: { kind: 'paper', sceneId: 'night.morning' },
      transitionIn: 'cut',
      lines: ['cs.night.5.1', 'cs.night.5.2'],
      audio: [{ at: 'start', cue: 'pad.warm' }, { at: 'start', cue: 'kettle' }]
    },
    { // 6 回到現在：筆記邊緣的撕痕特寫 → 拉遠成剖面魔方，根窖那一層往上翻、接上觀星閣樓 (層轉 3 秒；木頭摩擦、輕「喀」)
      art: { kind: 'paper', sceneId: 'night.flip' },
      transitionIn: 'inkBleed',
      lines: ['cs.night.6.1', 'cs.night.6.2'],
      minVisualSec: 5,
      audio: [{ at: 'start', cue: 'house.rumble' }, { at: 'end', cue: 'stairs.flip' }, { at: 'end', cue: 'pad.out' }]
    }
  ]
};
