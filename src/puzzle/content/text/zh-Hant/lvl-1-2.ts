// 1-2 玄關 (內部 id 'foyer')：標題、旁白、謎題名、物件名稱、字條 (爸爸的筆記：觀察與猜測)、三代畫像的年份
// 開場 / 通關 / 字條見 story-bible 7.3 (1-2 玄關，題號依規格 v0.3)；筆尖取得文字見 7.4
// 字條 a / b / c / d = 1-2a / 1-2b / 1-2c / 1-2d 的 L1；`~~ ~~` = 爸爸劃掉的字 (不計 H1 字數，顯示為刪除線)
// v0.2 的墨水閥 / 出口門 / 書架字條 / 舊題名已移除 (只剩測試的凍結場景在用，文字放在 tests/puzzle/fixtures/foyerV02.ts)
export const lvl12 = {
  'lvl.1-2.title': '玄關',
  'lvl.1-2.narration': '鋼筆少了筆尖。門後，是一面牆。',
  'lvl.1-2.next': '牆不見了。門的另一邊，換了一間房。',
  'lvl.1-2.puzzle.a': '1-2a 推箱取筆尖',
  'lvl.1-2.puzzle.b': '1-2b 長桌下的踏板',
  'lvl.1-2.puzzle.c': '1-2c 門後是牆',
  'lvl.1-2.puzzle.d': '1-2d 三代的年份',
  'lvl.1-2.rail': '木欄',
  'lvl.1-2.wall': '隔牆',
  'lvl.1-2.note': '爸爸的筆記',
  'lvl.1-2.shelf': '書架',
  'lvl.1-2.table': '長桌',
  'lvl.1-2.plate': '機關踏板',
  'lvl.1-2.crate': '木箱',
  'lvl.1-2.plinth': '高台',
  'lvl.1-2.key': '[[term.nib]]',
  'lvl.1-2.gate': '鐵柵門',
  'lvl.1-2.note.a': '太高了。你小時候，都踩著我的肩膀。',
  'lvl.1-2.note.b': '桌子底下。~~什麼都沒有~~ 我好像漏看了什麼？',
  'lvl.1-2.note.c': '這扇門後面，以前不是牆。',
  'lvl.1-2.note.d': '爺爺總說，家裡的事要從頭講起。',
  'lvl.1-2.key.use': '拿到了「[[term.nib]]」，筆桿上多了一個空的字卡匣。筆尖還是濕的。圖上的字，好像改得動。',
  // 魔方 (M-Cube)：拉桿、東門、南拱門
  'lvl.1-2.lever': '拉桿「[[term.word.up]]」',
  'lvl.1-2.doorE': '東門',
  'lvl.1-2.archS': '南拱門',
  // 1-2d 三代的年份 (N27)：畫像由左到右 = 祖父、爸爸小時候、曾祖；年份是畫成的那一年
  // 左：實景刻 1958、藏寶圖寫著被劃掉的 1926 (爸爸猜錯) 改成 1958；中：只有藏寶圖寫著 1979；右：只有實景刻著 1931
  'lvl.1-2.portrait': '畫像',
  'lvl.1-2.cord': '拉繩',
  'lvl.1-2.drawer': '小抽屜',
  'lvl.1-2.portrait.L.carved': '1958',
  'lvl.1-2.portrait.L.ink': '~~1926~~ 1958',
  'lvl.1-2.portrait.M.ink': '1979',
  'lvl.1-2.portrait.R.carved': '1931',
  'lvl.1-2.drawer.open': '喀。畫像下的小抽屜彈開了，裡面是一張[[term.card.right]]。'
} as const;
