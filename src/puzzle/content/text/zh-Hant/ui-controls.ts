// 操作設定頁、直接轉 (settings.turnMode)、上方工具列 (重置 / 魔方 / 2D / 3D / 道具)
export const uiControls = {
  // 選單「操作」→ 操作設定頁
  'ui.menu.controls': '操作',
  'ui.controls.title': '操作',
  'ui.controls.turnMode': '轉動方式',
  'ui.controls.turnMode.instant': '直接轉',
  'ui.controls.turnMode.confirm': '先預覽再確認',
  'ui.controls.turnModeHint': '直接轉：點箭頭或按方向鍵就轉，滑鼠停在箭頭上可以先看轉後的樣子；轉錯了按「回退」，墨會回來。',
  'ui.controls.back': '回到選單',
  // 直接轉的轉動模式 (deriveTurnMode style 'instant')
  'ui.turn.hintInstant': '點箭頭就會轉；滑鼠停在箭頭上，可以先看轉後的樣子。',
  'ui.turn.hintRingInstant': '點星環盤上的箭頭就會轉；滑鼠停在箭頭上，可以先看轉後的樣子。',
  'ui.turn.hintSlideInstant': '點房間邊上的箭頭就會滑；滑鼠停在箭頭上，可以先看滑後的樣子。',
  'ui.turn.keysInstant': 'W S 換一排　方向鍵 直接轉　Z 回退　Esc 離開',
  'ui.turn.keysRingInstant': 'W S / ↑↓ 換一片　←→ 直接轉　Z 回退　Esc 離開',
  'ui.turn.keysSlideInstant': '方向鍵 往那邊滑　WASD 只選不滑　Z 回退　Esc 離開',
  'ui.help.turnInstant': '轉動模式：方向鍵直接轉（W S 換一排）',
  'ui.help.turnConfirm': '轉動模式：方向鍵選一排、Enter 確認才轉',
  'ui.tip.turnInstant': '{w}{s} 換一排　方向鍵直接轉　{undo} 回退　{exit} 離開',
  'msg.dial.slidePick': '有兩間房能往那邊滑。再按一次，滑選中的那一間。',
  // 上方工具列 (app/toolbarModel)
  'ui.bar.reset': '重置',
  'ui.bar.reset.aria': '重新進房（需確認）',
  'ui.bar.cube': '魔方',
  'ui.bar.cube.aria': '展開圖與轉動模式',
  'ui.bar.mode2d': '2D',
  'ui.bar.mode2d.aria': '切到[[term.mode2d]]（2D）',
  'ui.bar.mode3d': '3D',
  'ui.bar.mode3d.aria': '切到[[term.mode3d]]（3D）',
  'ui.bar.items': '道具',
  'ui.bar.items.aria': '道具欄（{n} 件）',
  'msg.bar.leverCube': '這裡的魔方靠房間裡的拉桿轉。展開圖可以點「圖」打開。',
  'msg.bar.mode2d': '已經在[[term.mode2d]]上了。',
  'msg.bar.mode3d': '已經在[[term.mode3d]]裡了。',
  // 操作說明 (H 面板)：取代 R 的「重新進房」
  'ui.help.bar': '上方按鈕：重置／魔方／2D／3D／道具',
  'ui.help.items': '道具欄',
  // 道具欄 popup (app/inventoryModel)
  'ui.items.title': '道具欄',
  'ui.items.close': '關閉',
  'ui.items.empty': '還沒有拿到任何東西。',
  'ui.items.pick': '點一格看看是什麼。',
  'ui.items.count': '× {n}',
  'ui.items.cardNote': '可在字卡匣使用（藏寶圖裡對標籤按 E）。',
  'ui.items.slot': '空格'
};
