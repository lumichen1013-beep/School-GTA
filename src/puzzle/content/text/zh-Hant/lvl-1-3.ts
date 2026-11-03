// 1-3 衣帽間 (內部房間 id 'closet')：標題、旁白、謎題名、物件名稱、字條 (爸爸的筆記)、驚嚇與章門的訊息
// 開場 / 通關 / 字條見 story-bible 7.3 (1-3 衣帽間，題號依規格 v0.3)
// 字條 a / a2 / b = 1-3a 的 L1 / L2 (空白，時間到浮現)、1-3b 的 L1
export const lvl13 = {
  'lvl.1-3.title': '衣帽間',
  'lvl.1-3.narration': '掛著三件大衣，只有一件是爸爸的。',
  'lvl.1-3.next': '一本舊手記：「此宅會轉五次。」',
  'lvl.1-3.puzzle.a': '1-3a 連箱帶人',
  'lvl.1-3.puzzle.b': '1-3b 回來的路',
  'lvl.1-3.archN': '北拱門',
  'lvl.1-3.chapterE': '章門',
  'lvl.1-3.chapterE.open': '銅鑰匙轉了半圈。門外是一條走廊，通往書房。',
  'lvl.1-3.lever': '拉桿',
  'lvl.1-3.crate': '木箱',
  'lvl.1-3.coats': '衣架',
  'lvl.1-3.coats.word': '大衣',
  'lvl.1-3.coats.fall': '身後一沉。三件大衣，同時從衣架上滑了下來。',
  'lvl.1-3.note': '爸爸的筆記',
  'lvl.1-3.note.a': '小時候搬家，你坐在紙箱裡。',
  'lvl.1-3.note.a2': '拱門那一邊，缺了什麼？',
  'lvl.1-3.note.b': '回來的路，和去的路不一樣？'
} as const;
