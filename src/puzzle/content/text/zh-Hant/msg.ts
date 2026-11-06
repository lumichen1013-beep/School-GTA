// 系統訊息 (核心 / 機制 say 的 key)
export const msg = {
  'msg.squeeze': '這裡塞不下',
  'msg.fell': '圖面一皺，你回到了熟悉的地方。',
  'msg.crateReset': '物歸原處：木箱回到了原來的地方。',
  'msg.unreachable': '看得見，卻碰不到。換個角度試試。',
  'msg.gate': '鐵柵門紋絲不動。門軸上沾著墨，像在等[[term.mode2d]]上的什麼。',
  'msg.plate.on': '[[term.mode2d]]上的機關踏板沉了下去。牆的另一頭，有什麼被拉起來了。',
  'msg.plate.light': '[[term.mode2d]]上的機關踏板一動也不動。你太輕了。',
  // 魔方 (N21；規格 5.4.1)：門後是牆、轉不動的原因、轉動完成、屋框
  'msg.cube.wall': '門後是牆。',
  'msg.cube.hatchDown': '梯口下面是土。',
  'msg.cube.hatchUp': '梯口上面是土。',
  'msg.cube.notEmpty': '拉桿拉不動。那一邊有房間擋著。',
  'msg.cube.outOfCube': '拉桿拉不動。再過去就是屋外了。',
  'msg.cube.doorway': '門口有東西卡著。',
  'msg.cube.stuck': '機關一動也不動。',
  'msg.cube.turned': '整個房間滑了過去。',
  'msg.cube.porch': '大門外是來時的門廊。這一趟只能往屋裡走。',
  'msg.cube.chapterLocked': '門鎖著。鑰匙孔是銅的。',
  'msg.cube.chapterOpen': '門開了。',
  // 拱門跨房 (規格 5.4.6)：拱門對拱門 → 箱子推得過去；對面是門 / 牆 / 被占住 → 推不過去
  'msg.cube.crossed': '木箱滑過拱門，到了另一邊。',
  'msg.cube.doorOnly': '對面是一扇門，只容得下人。箱子過不去。',
  'msg.cube.archWall': '拱門後面是牆。',
  'msg.cube.archBlocked': '拱門那一頭被擋住了。',
  // v0.4 H1：人穿門 / 洞前查到達處 (被實體占住、那個實體沒有 blockText 時)
  'msg.cube.doorBlocked': '門的另一邊被堵住了。',
  'msg.cube.mapOnly2d': '展開圖只畫在[[term.mode2d]]上。',
  // 控制盤 (v0.4 N32；規格 5.4.1)：魔方儀、轉動模式、轉不動的原因
  'msg.dial.activated': '魔方儀轉了起來。切到[[term.mode2d]]打開展開圖，就能自己選一排轉。',
  'msg.dial.ready': '魔方儀已經在轉了。',
  'msg.dial.noDial': '控制盤還沒啟動。',
  'msg.dial.only2d': '控制盤畫在[[term.mode2d]]上。',
  'msg.dial.notNow': '先站穩，再轉。',
  'msg.dial.locked': '這一排鎖著。',
  'msg.dial.jammed': '軌道卡住了。',
  'msg.dial.doorway': '門口有東西卡著。',
  'msg.dial.noInk': '墨乾了。',
  'msg.dial.notEmpty': '那一排有實心的牆，轉不動。',
  'msg.dial.outOfCube': '這一排轉不動。',
  'msg.dial.nothingToUndo': '沒有可以退回的一步。',
  'msg.dial.turned': '那一排房間滑了過去。',
  'msg.dial.turnedHere': '整排房間連你一起滑了過去。',
  'msg.dial.undone': '退回上一步。墨回來了一滴。',
  'msg.dial.unlocked': '喀。有鎖扣彈開了。',
  'msg.dial.latch': '喀。',
  // 第三章 (滑動)：點格子 / 方向鍵的說明、滑完的訊息
  'msg.dial.solid': '{name}是實心的，不會動。',
  'msg.dial.noEmpty': '旁邊沒有空格。',
  'msg.dial.noDir': '沒有房間能往那邊滑。',
  'msg.dial.slid': '那間房滑進了空格。',
  'msg.dial.layer': '那一層轉了過去。',
  'msg.dial.layerHere': '整層樓連你一起轉了過去。',
  'msg.dial.slidHere': '房間連你一起滑進了空格。',
  // 順序鎖 (N27)：拉對一條停住、拉錯全部彈回 (無懲罰)
  'msg.cord.pulled': '繩子拉下去，停住了。',
  'msg.cord.reset': '喀一聲，繩子全部彈了回去。',
  // 提示字條 (L2 / L3)：時間到之前是空白的
  'msg.note.blank': '紙上還是空白的。',
  // 標籤與字卡 (N22；規格 5.4.5、D15：無效字 → 字顫動、墨色變淡、卡片退回)
  'msg.label.written': '字蓋上去了，墨還沒乾。',
  'msg.label.removed': '字卡取了下來，原來的字還在。',
  'msg.label.invalid': '字抖了一下，墨色淡了。卡片退了回來。',
  'msg.label.noNib': '少了筆尖，寫不上去。',
  // N24 顯影 / N28 合成 (2-2)
  'msg.reveal.noNib': '少了筆尖，塗不開。',
  'msg.combine.magnifier': '你把鏡片嵌進空鏡框，喀的一聲。成了一支放大鏡。',
  'msg.combine.half': '手上只有一樣，湊不起來。',
  'msg.combine.none': '手上沒有能湊在一起的東西。',
  'msg.print.wheel': '字輪轉到「{glyph}」。',
  'msg.list.sep': '、',
  // 量 (N23；規格「第三章共用規則」量)：尺度卡貼上 / 取下、放大前卡牆
  'msg.scale.da': '量過了。它照著刻度，長大了。',
  'msg.scale.xiao': '量過了。它照著刻度，縮小了。',
  'msg.scale.removed': '尺度卡取了下來。它回到原來的大小。',
  'msg.scale.noRoom': '這裡放不下。',
  // 謎題標籤前按 E、匣裡沒有卡：卡貼在別的標籤上 (關卡自己的缺卡指路見 label.noCardText)
  'msg.label.cardElsewhere': '{card}還貼在別的標籤上。先去把它取下來。',
  // 字卡匣關著時按 1～3 / X：說明怎麼打開
  'msg.cards.howto': '字卡匣要在[[term.mode2d]]裡、站在標籤前按 E 打開。',
  // v0.4 H1：帶著比例尺回到第二章 (開章時補發尺度卡的那一次)
  'msg.cards.scaleBack': '建築比例尺也跟來了。字卡匣裡多了「大」「小」。'
} as const;
