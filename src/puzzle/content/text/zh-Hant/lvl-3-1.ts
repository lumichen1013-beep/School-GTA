// 3-1 苗圃 (內部房間 id 'nursery'；第三章第一關；規格 6「3-1 苗圃（細化）」、story-bible 7.3 / 7.4)：標題、旁白、通關、謎題名稱、
// 園丁羅盤、建築比例尺、花秤與陶盆、花架門、樹根、花窗玻璃片、字條
export const lvl31 = {
  'lvl.3-1.title': '苗圃',
  'lvl.3-1.narration': '比例尺掛在門邊。爸爸在旁邊畫了個問號。',
  'lvl.3-1.next': '根縮回土裡。苗圃第一次，自己挪了位置。',
  'lvl.3-1.puzzle.a': '3-1a 一大一小',
  'lvl.3-1.puzzle.b': '3-1b 卡住的軌道',
  'lvl.3-1.dial': '園丁羅盤',
  'lvl.3-1.dial.activated': '九個花盆格，空了兩格。切到[[term.mode2d]]，就能把房間滑進空格。',
  'lvl.3-1.dial.ready': '園丁羅盤已經啟動了。',
  // 建築比例尺 (路段；story-bible 7.4)
  'lvl.3-1.ruler': '建築比例尺',
  'lvl.3-1.ruler.take': '刻度只有大和小。量過的東西，就照它長。字卡匣裡多了「大」「小」兩張尺度卡。',
  // 3-1a 花秤
  'lvl.3-1.balance': '花秤',
  'lvl.3-1.balance.solved': '秤往西倒了下去。繩子一緊，花架門被拉了起來。',
  'lvl.3-1.balance.wrong': '秤往東倒了。花架門被壓得更緊。',
  'lvl.3-1.pot': '陶盆',
  'lvl.3-1.pot.fixed': '陶盆釘在秤盤上，搬不動。',
  'lvl.3-1.slot.empty': '標籤旁有一格空的方槽。門邊好像掛著一把能量東西的尺。',
  'lvl.3-1.trellis': '花架門',
  'lvl.3-1.trellis.closed': '花架門被藤纏著，壓得死緊。門頂的繩子，連著花秤。',
  'lvl.3-1.shelf': '高育苗架',
  // 3-1b 樹根
  'lvl.3-1.root': '樹根',
  'lvl.3-1.root.jam': '樹根從北牆鑽了出去，長進牆外的軌道。',
  'lvl.3-1.root.free': '樹根縮在牆裡這一側。',
  'lvl.3-1.root.done': '根縮回土裡了。',
  'lvl.3-1.root.freed': '苗圃滑了出去。縮小的樹根從土裡鬆開，底下壓著一片花窗玻璃。',
  'lvl.3-1.pane': '花窗玻璃片',
  'lvl.3-1.pane.take': '一片彩繪玻璃，邊緣有一筆墨線。',
  // 字條 (父親的筆記；story-bible 7.3)
  'lvl.3-1.note': '字條',
  'lvl.3-1.note.story': '這把尺，我量了很久。量出來的只有問號。',
  'lvl.3-1.note.a': '坐蹺蹺板時，總是我那頭先落地。',
  'lvl.3-1.note.b': '樹根不知道牆在哪裡。'
} as const;
