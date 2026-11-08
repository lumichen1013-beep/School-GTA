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
  'term.scrap.1': '老宅圖殘片',
  // 2-2 閱覽室：字謎的詞卡 (物品 id card.<字>；卡面的字 = term.glyph.<字>)、合成的道具 (空鏡框 + 鏡片 = 放大鏡)、銅鑰匙的齒・二
  'term.card.wai': '詞卡「外」',
  'term.card.nei': '詞卡「內」',
  'term.card.qian': '詞卡「前」',
  'term.card.li': '詞卡「裡」',
  'term.card.bian': '詞卡「邊」',
  'term.glyph.wai': '外',
  'term.glyph.nei': '內',
  // 第五章 5-2 東窗的詩：星表匣的詞卡 (抬 / 低 / 垂；俯 = 詞典先列)
  'term.card.tai': '詞卡「抬」',
  'term.card.di': '詞卡「低」',
  'term.card.chui': '詞卡「垂」',
  'term.card.fu': '詞卡「俯」',
  'term.glyph.tai': '抬',
  'term.glyph.di': '低',
  'term.glyph.chui': '垂',
  'term.glyph.fu': '俯',
  'term.glyph.qian': '前',
  'term.glyph.li': '裡',
  'term.glyph.bian': '邊',
  'term.frame': '空鏡框',
  'term.lens': '鏡片',
  'term.magnifier': '放大鏡',
  'term.tooth.reading': '銅鑰匙的齒・二',
  // 2-3 印房：部件卡 (物品 id card.<部件>)、門牌的字、門旁的活字 (2-3c)、校樣、銅鑰匙的柄
  'term.card.ri': '部件卡「日」',
  'term.card.cai': '部件卡「才」',
  'term.glyph.ri': '日',
  'term.glyph.cai': '才',
  'term.glyph.men': '門',
  'term.glyph.jian': '間',
  'term.glyph.shan': '山',
  'term.glyph.shui': '水',
  'term.glyph.mu': '木',
  'term.glyph.huo': '火',
  'term.proof': '校樣',
  'term.key.bow': '銅鑰匙的柄',
  // 2-4 手稿庫：門牌「閉」、銅鑰匙的齒・三、爸爸的手稿
  'term.glyph.bi': '閉',
  'term.tooth.manuscripts': '銅鑰匙的齒・三',
  'term.ms.father': '爸爸的手稿',
  // 2-5 書房深處：房間的銅鑰匙 (第二章章鑰匙)、許問津的手記第二頁
  'term.key.study': '房間的銅鑰匙',
  'term.diary.2': '手記第二頁',
  // 第三章 溫室：建築比例尺 (道具 / 能力 scale)、尺度卡 (物品 id card.da / card.xiao；卡面的字)、花窗玻璃片 (章節道具；3-4a 的花窗)
  'term.scale': '建築比例尺',
  'term.card.da': '尺度卡「大」',
  'term.card.xiao': '尺度卡「小」',
  'term.glyph.da': '大',
  'term.glyph.xiao': '小',
  'term.pane.1': '花窗玻璃片・一',
  // 3-2 玻璃長廊：花窗玻璃片二 (3-2a)、老宅圖殘片 2 (3-2b 隱藏點)
  'term.pane.2': '花窗玻璃片・二',
  'term.scrap.2': '老宅圖殘片',
  // 3-3 夜溫室：花窗玻璃片三 (3-3a)、爸爸的園藝筆記一頁 (3-3c，劇情擴充物)
  'term.pane.3': '花窗玻璃片・三',
  'term.page.garden': '爸爸的園藝筆記一頁',
  // 3-4 溫室深處：房間的銅鑰匙 (3-4a 的抽屜；開第三章章門)、許問津的手記第三頁；花窗架缺幾片玻璃的數字
  'term.key.greenhouse': '房間的銅鑰匙',
  'term.diary.3': '手記第三頁',
  // H1 夾層 (第二章隱藏房)：老宅圖殘片 4 (爸爸小時候的小書桌)
  'term.scrap.4': '老宅圖殘片',
  'term.scrap.3': '老宅圖殘片',
  'term.chart': '爸爸的展開圖',
  'term.notes.father': '爸爸的筆記',
  'term.ink.father': '爸爸的墨水瓶',
  'term.parchment': '空白的羊皮紙',
  'term.page.blank': '可寫的手記頁',
  'term.key.cellar': '房間的銅鑰匙',
  'term.diary.4': '手記第四頁',
  'term.num.1': '一',
  'term.num.2': '兩',
  'term.num.3': '三'
} as const;
