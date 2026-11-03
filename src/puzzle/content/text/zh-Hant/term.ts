// 詞彙表：玩家看到的名稱集中於此 (內部 id 不變；劇情改名只改這裡)
export const term = {
  'term.mode3d': '實景',
  'term.mode2d': '藏寶圖',
  'term.nib': '鋼筆筆尖',
  'term.lever': '拉桿',
  // 拉桿的方向字 (mechanics/cube LeverWord)
  'term.word.up': '上',
  'term.word.down': '下',
  'term.word.left': '左',
  'term.word.right': '右',
  // 字卡匣裡的詞卡 (物品 id card.<方向字>；HUD 物品欄以 term.<物品 id> 顯示；文字引用只展開一層，所以直接寫字)
  'term.card.right': '詞卡「右」',
  // 房間的銅鑰匙 (章門；章節道具) 與許問津的手記 (收集物，章末寫進 save.diary)
  'term.key.brass': '銅鑰匙',
  'term.diary.1': '手記第一頁',
  // 第二章：銅鑰匙的齒 (三條鏈各一枚，2-5 組裝)、老宅圖殘片 (收集物，通關時寫進 save.scraps)
  'term.tooth.shelf': '銅鑰匙的齒・一',
  'term.scrap.1': '老宅圖殘片'
} as const;
