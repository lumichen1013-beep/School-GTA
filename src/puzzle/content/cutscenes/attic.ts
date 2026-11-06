import type { CutsceneDef } from '../cutsceneTypes';

/**
 * cs:attic 閣樓前「三扇天窗」(4 鏡；cutscenes-v0.1 4，逐字稿不改字)：三扇天窗 = 三種看法 (許問津、爸爸、你)；三窗在閣樓魔方的三個面、門還沒轉到對的位置。
 * 觸發 = 5-1 房間通關畫面第一次按「繼續探索」時 (onRoom；規格 6「5-1 天窗間（細化）」)；全部用剪紙繪製 (鏡 1 原為引擎鏡頭)。
 * 秒數一律由公式算出 (資料不寫秒數)；章末過場總長 20～45 秒
 */
export const attic: CutsceneDef = {
  id: 'cs:attic',
  titleKey: 'cs.attic.title',
  trigger: { afterClear: '5-1', onRoom: true },
  replayable: true,
  shots: [
    { // 1 天窗間：三道星光從三扇天窗斜落；天花板畫著星圖 (由下往上緩慢搖鏡 6 秒；分層音軌第一層)
      art: { kind: 'paper', sceneId: 'attic.beams' },
      motion: { push: 0.04, durSec: 6 },
      transitionIn: 'fade',
      lines: ['cs.attic.1.1', 'cs.attic.1.2'],
      audio: [{ at: 'start', cue: 'pad.in' }]
    },
    { // 2 梁上一張爸爸的字條 (正常字跡，「北邊」後面的問號是後來補上的；緩推到字條；木梁輕響)
      art: { kind: 'paper', sceneId: 'attic.note', labels: { line1: 'cs.attic.art.note1', line2: 'cs.attic.art.note2', mark: 'cs.attic.art.mark' } },
      motion: { push: 0.06, durSec: 7 },
      transitionIn: 'crossfade',
      lines: ['cs.attic.2.1', 'cs.attic.2.2'],
      audio: [{ at: 'start', cue: 'door.creak' }]
    },
    { // 3 藏寶圖：三扇天窗外是星圖；閣樓的 3×3×3 展開圖上，三窗的門各自錯開一格 (斷線 + ×；鏡頭沿三扇門依序平移；切換音色、細碎星光音)
      art: { kind: 'paper', sceneId: 'attic.map', labels: { top: 'ui.map.layer.top', mid: 'ui.map.layer.mid', bottom: 'ui.map.layer.bottom' } },
      motion: { panX: 0.06, durSec: 7 },
      transitionIn: 'crossfade',
      lines: ['cs.attic.3.1', 'cs.attic.3.2'],
      audio: [{ at: 'start', cue: 'switch.view' }, { at: 'line', line: 1, cue: 'chord' }]
    },
    { // 4 時間戳卡 (淡入淡出；長音墊)
      art: { kind: 'paper', sceneId: 'attic.stamp' },
      transitionIn: 'fade',
      lines: ['cs.attic.4.1'],
      minVisualSec: 3,
      audio: [{ at: 'start', cue: 'pad.low' }, { at: 'end', cue: 'pad.out' }]
    }
  ]
};
