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
  'msg.cube.notEmpty': '拉桿拉不動。那一邊有房間擋著。',
  'msg.cube.outOfCube': '拉桿拉不動。再過去就是屋外了。',
  'msg.cube.doorway': '門口有東西卡著。',
  'msg.cube.stuck': '機關一動也不動。',
  'msg.cube.turned': '整個房間滑了過去。',
  'msg.cube.porch': '大門外是來時的門廊。這一趟只能往屋裡走。',
  'msg.cube.chapterLocked': '門鎖著。鑰匙孔是銅的。'
} as const;
