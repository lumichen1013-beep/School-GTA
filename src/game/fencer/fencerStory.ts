// 世界 Boss【花劍客】劇情文字表 (純資料，無 three.js / DOM 依賴)：程式只引用這裡的常數，改稿只動本檔。
// 長度規則 (tests/fencerStory.test.ts 自動檢查)：手機直屏每句 ≤ 22 字 (全校廣播跑馬燈例外)、玩家頭頂框 ≤ 8 字。
// 劇情稿：fencer-story.md (太陽花 10 句原句一字不改)。

import type { SunflowerFace, SunflowerLine } from './fencerRules';
import type { StoryLine } from './storyPlayer';

// 過場 = 台詞陣列 (資料驅動)：每句顯示秒數依字數自動計算 (storyPlayer.lineDuration：max(2, 字數 × 0.14 + 0.5))，
// 改稿只動文字與順序，不必改計時；演出事件掛在句子上 (events: [{ id, at }]，at = 該句開始後秒數、負值 = 句尾前)。
// 事件 id (FencerBossFight 依 id 執行)：
//   開場：PETALS 花心爆花瓣、FLASH 白閃 + 清場 + 結界升起、WALL_UP 結界升滿卸載校園、BOSS 花劍客現身、AWAKEN 向陽覺醒、BLEND 鏡頭混回玩家身後
//   首勝：FACE 玩家轉向回禮、DISSOLVE Boss 化花瓣 (天色轉晨金)、OUTRO 光飛回太陽花、RESTORE 恢復校園、RAPIER 細劍自土裡升起、
//         FLOWER 太陽花轉頭看玩家、BLEND 鏡頭混回
//   換樂章：MEMORY 老師的金色記憶剪影浮現、SEED 埋下種子 (金光點)、SWORD 佩劍插地 (光影)、MEMORY_OFF 剪影散成花瓣、
//           SPROUT 一圈嫩芽冒出又被壓平 (Boss 回中央由固定前導 TRANSITION_LEAD_SEC 處理；天色在過場開始時轉往下一段；短版無事件)
// 世界觀 (劇情 v2，fencer-story-v2-proposal.md)：爵士老師退休時在操場埋下種子、把佩劍插在一旁當支架；
//   種子三十年來每年冒芽就被踩扁 / 割掉，靠「被注視」才會長大 → 玩家戳十下 = 十次注視；三十年的暮色借老師的模樣成形 = 向日爵士；
//   向陽之心 = 那朵花最後的好脾氣 (它的光 = 戰鬥中幫玩家回血)；首勝時細劍從土裡升起。
/** 一句台詞 (who：SUB 字幕 (預設) / BOSS Boss框 + 字幕 / PLAYER 玩家頭頂框 + 字幕) */
export type StoryBeat = StoryLine;

export interface DailyLine {
  text: string;
  face: SunflowerFace;
}

// ===== 前導：太陽花 10 句 (原句一字不改) =====

export const SUNFLOWER_LINES: readonly SunflowerLine[] = [
  { text: '.', reaction: 'TWITCH', face: 'BLANK' },
  { text: '..', reaction: 'TURN_TO', face: 'SIDE' },
  { text: '...', reaction: 'DROOP_SWEAT', face: 'SWEAT' },
  { text: '嘖。', reaction: 'TURN_AWAY', face: 'ANNOYED' },
  { text: '滾', reaction: 'BURST_RED', face: 'ANGRY' },
  { text: '哎呀別踩我', reaction: 'SHRINK', face: 'SHOCK' },
  { text: '不要逼我', reaction: 'STIFFEN_HUM', face: 'ANGRY' },
  { text: '我只是一朵花啊……', reaction: 'TREMBLE', face: 'CRY' },
  { text: '大哥我錯了', reaction: 'BOW', face: 'CRY' },
  { text: '看來不好好教訓你不行了', reaction: 'AWAKEN', face: 'EVIL' }
];

export const REMATCH_LINE_AFTER_WIN = '別、別再來了……好啦再一場';
export const REMATCH_LINE_AFTER_LOSS = '又是你？還沒學乖？';

/** 互動提示 (依戳的進度烘托氣氛) */
export const POKE_PROMPT = {
  /** 尚未發現 (第 0 下，只在約 2m 內出現) */
  undiscovered: '🌱 草裡好像有什麼……戳戳看？',
  /** 1~3 下：小苗 */
  calm: (n: number, total: number) => `🌱 再戳一下小苗 (${n}/${total})`,
  /** 4~6 下：花苞 */
  bud: (n: number, total: number) => `🌷 再戳一下花苞？(${n}/${total})`,
  /** 7~8 句 */
  tense: (n: number, total: number) => `🌻 再戳一下太陽花？(${n}/${total})`,
  /** 9 句以後 */
  warn: (n: number, total: number) => `⚠️ 真的還要戳嗎？(${n}/${total})`,
  afterLoss: '🌻 戳一下太陽花 (再戰花劍客)',
  afterWinIdle: '🌻 戳一下太陽花',
  afterWinArmed: '🌻 再戳一下：再戰花劍客'
} as const;

// ===== 前導：校園傳聞 (NPC 頭頂框) =====

export const RUMOR = {
  /** 田徑阿凱 (起跑線拉筋時輪播) */
  trackBefore: ['操場草皮好像有東西在動。', '我跑第十圈時，草裡有人『嘖』了一聲。'],
  trackAfter: ['欸，昨天操場是不是有人在擊劍？', '那朵花剛剛跟我說早安……'],
  trackChallenge: '要跟我比 200m 嗎？',
  /** 足球雙人組：射門沒進 → 射門者 + 隊友接話 */
  soccerShooterBefore: '球又滾進那片草裡了……你去撿！',
  soccerReplyBefore: '別去！上次有人戳它，就沒回來上課。',
  soccerShooterAfter: '球滾去太陽花那，它踢回來了！',
  /** 中央花台長椅 (輪播兩句) */
  bench: '半夜聽到草裡有人在嘆氣。',
  benchLore: '聽說以前有老師戴高帽上體育課。',
  /** 路人聊天群組 (顯示時前綴 💬) */
  chatBefore: '聽說放學後草地會碎碎念',
  chatAfter: ['聽說有人跟花決鬥還贏了', '操場的花現在超有禮貌']
} as const;

// ===== 前導：全校廣播 (跑馬燈，不受 22 字限制) =====

export const BROADCAST = {
  lines: [
    '📢【總務處公告】校園草皮上的不明小東西請勿踩踏、請勿戳弄，它最近脾氣不太好，已經會翻白眼了。',
    '📢【體育組尋物】器材室找到三十年前西洋劍社的社旗，上面繡著一朵太陽花與一頂高帽，請知情者洽體育組！',
    '📢【總務處公告】本週操場割草。附註：中央那塊草每年都割不乾淨，割草機說它會躲。'
  ],
  /** 首勝後才會出現 (隨機插播其一) */
  afterWin: '📢【總務處公告】操場太陽花今早主動向升旗隊鞠躬，請各位同學記得回禮！',
  afterWinMower: '📢【總務處公告】操場中央太陽花列為保育植物，割草機請繞道。',
  afterWinChance: 0.3,
  /** 首勝後下一次廣播必播一次 (爵士老師收線；播過後存檔) */
  afterWinOnce: '📢【體育組】西洋劍社社旗已由一位戴高帽的退休老師領回。他說：『花，長得很好。』'
} as const;

// ===== 前導：任務看板 / 大地圖三段揭露 (0 未知 / 1 已遭遇 / 2 完成) =====

export interface QuestStageText {
  name: string;
  desc: string;
  goalIcon: string;
  goalTitle: string;
  goalDesc: string;
}

export const QUEST_STAGES: readonly [QuestStageText, QuestStageText, QuestStageText] = [
  { name: '草地上的怪苗', desc: '它好像會回應你……再戳戳看？', goalIcon: '❓', goalTitle: '草地上的怪苗', goalDesc: '它好像會回應你' },
  { name: '擊敗操場花劍客', desc: '向日爵士在結界裡等你回禮', goalIcon: '🎩', goalTitle: '擊敗花劍客・向日爵士', goalDesc: '戳太陽花一下即可再戰' },
  { name: '花劍客・禮成', desc: '太陽花重新向陽 · 再戰勝利 +$200', goalIcon: '🎩', goalTitle: '花劍客・禮成', goalDesc: '太陽花重新向陽' }
];

/** 發現怪苗 (首次戳到)：任務看板 / 大地圖在此之前完全不顯示 */
export const DISCOVER_BANNER = { text: '🌱 你發現了奇怪的小苗……', ms: 2800 } as const;

/** 階段 0 (怪苗) 的任務文字隨成長更新 (growth 0~10)；遭遇 / 完成後沿用 QUEST_STAGES */
export function fencerQuestText(stage: number, growth: number): QuestStageText {
  const s = QUEST_STAGES[Math.max(0, Math.min(2, stage))];
  if (stage > 0) return s;
  if (growth >= 10) return { ...s, name: '操場中央的怪花', desc: '它好像會轉頭看人……戳戳看？', goalTitle: '操場中央的怪花', goalDesc: '它好像會轉頭看人' };
  if (growth >= 7) return { ...s, name: '快開花的怪苗', desc: '花苞越來越大……它在生氣嗎？', goalTitle: '快開花的怪苗', goalDesc: '花苞越來越大了' };
  if (growth >= 4) return { ...s, name: '長出花苞的怪苗', desc: '它又長高了一截……再戳戳看？', goalTitle: '長出花苞的怪苗', goalDesc: '它又長高了一截' };
  return s;
}

// ===== 戰中：開場過場 =====

/** 首戰開場 (約 17s，點擊前進 / 長按跳過)：暮色湧出改由畫面演出 (不再用旁白) */
export const INTRO_FIRST_BEATS: readonly StoryBeat[] = [
  { text: '🌻「看來不好好教訓你不行了……」', events: [{ id: 'PETALS', at: 0.6 }, { id: 'FLASH', at: -0.6 }] },
  { text: '🎩「午茶時間到了。」', events: [{ id: 'WALL_UP', at: 1.0 }, { id: 'BOSS', at: -0.4 }] },
  { text: '🎩「容我自我介紹——向日爵士。」' },
  { who: 'PLAYER', text: '蛤？花變人？' },
  { text: '🎩「閣下戳了我十下，該學點禮貌了。」' },
  { text: '☀️「別怕！我是向陽之心，那朵花的好脾氣！」', events: [{ id: 'AWAKEN' }] },
  { text: '☀️「你惹的禍——幫我打醒那個暴躁的我！」', events: [{ id: 'BLEND', at: -0.8 }] }
];

/** 再戰開場：Boss 那句依條件挑選 (fencerRules.rematchIntroKey)；跳過時改由 Boss框 在開戰後補講 */
export const REMATCH_BOSS_LINE = {
  rapier: '喔？帶著老師的劍來了。',
  lossFinal: '上次閣下差一點就看到日出了。',
  afterLoss: '歡迎回來。禮貌課，補考開始。',
  afterWin: '又見面了。這次換我討回禮數。',
  regular: '閣下又來了？茶我都泡好了。',
  veteran: '常客啊。要不要辦張會員卡？'
} as const;
export type RematchIntroKey = keyof typeof REMATCH_BOSS_LINE;
export const REMATCH_HEART_LINE = {
  normal: '☀️「又要麻煩你了！」',
  lossFinal: '☀️「這次，一起看到天亮！」'
} as const;
/** 再戰開場三句 (太陽花 / 花劍客 / 向陽之心)；事件固定 */
export function rematchIntroBeats(flower: string, boss: string, heart: string): readonly StoryBeat[] {
  return [
    { text: `🌻「${flower}」`, events: [{ id: 'PETALS', at: 0.2 }, { id: 'FLASH', at: 0.4 }, { id: 'WALL_UP', at: -0.05 }] },
    { text: `🎩「${boss}」`, events: [{ id: 'BOSS' }] },
    { text: heart, events: [{ id: 'AWAKEN' }, { id: 'BLEND', at: -0.8 }] }
  ];
}
export const INTRO_REMATCH_BEATS = {
  afterLoss: rematchIntroBeats(REMATCH_LINE_AFTER_LOSS, REMATCH_BOSS_LINE.afterLoss, REMATCH_HEART_LINE.normal),
  afterWin: rematchIntroBeats(REMATCH_LINE_AFTER_WIN, REMATCH_BOSS_LINE.afterWin, REMATCH_HEART_LINE.normal)
} as const;

/** 覺醒時玩家頭頂框 (≤ 8 字) */
export const PLAYER_AWAKEN_BUBBLE = '☀️ 向陽覺醒';

/** 開戰後系統橫幅 (回血教學改由向陽之心親口說，見 HEART_LINES.TEACH) */
export const AWAKEN_BANNER = '☀️ 向陽覺醒！體力上限 200';

// ===== 戰中：Boss 頭頂框 =====

/** 開戰第一秒 (首戰才說) */
export const BOSS_OPEN_LINE = '準備好了嗎？——請。';
export const BOSS_OPEN_DELAY = 0.3;

/** 招式宣言：byBar[樂章] 隨機一句 (頻率規則見 fencerRules.BossLineGate)；樂章 0 行禮 / 1 舊夢 / 2 落日 */
type ByBar = readonly [readonly string[], readonly string[], readonly string[]];
export const BOSS_CUE_LINES: Readonly<Record<'S1' | 'S2' | 'S3_JUMP' | 'S3_FINALE' | 'BOW' | 'S4' | 'S5' | 'CHASE', { byBar: ByBar; dur: number }>> = {
  S1: { byBar: [['玫瑰三連刺！'], ['玫瑰連刺・殘香！'], ['最後的玫瑰——連刺！']], dur: 1.4 },
  S2: { byBar: [['帽子，也是紳士的劍。'], ['帽子戲法，成雙！'], ['帽子們，謝幕了！']], dur: 1.6 },
  S3_JUMP: { byBar: [['萬花華爾滋——'], ['一、二、三，華爾滋——'], ['最後一支舞——']], dur: 1.4 },
  S3_FINALE: { byBar: [['終幕！'], ['終幕！'], ['終幕！']], dur: 1.0 },
  BOW: { byBar: [['承讓。', '失禮了。', '請。'], ['承讓。', '……老師，您看到了嗎。'], ['請。', '還沒完呢。']], dur: 1.4 },
  S4: { byBar: [['荊棘十字——旋！'], ['荊棘十字——旋！'], ['跟上我的舞步。']], dur: 1.4 },
  S5: { byBar: [['花影雙人舞，請入場。'], ['花影雙人舞，請入場。'], ['花影雙人舞，請入場。', '兩個我，閣下看哪個？']], dur: 1.6 },
  CHASE: { byBar: [['背對對手，可不是紳士所為。'], ['背對對手，可不是紳士所為。'], ['背對對手，可不是紳士所為。']], dur: 2.3 }
};

/** 反應台詞 (依樂章；頻率見 fencerRules.BossLineGate.allowBark)：終樂章的 HALF 由黎明轉折取代 */
export const BOSS_BARK_LINES = {
  /** 本管血量跨過一半 */
  HALF: ['嗯哼，看來閣下不只會戳花。', '當年的社員，也像你這樣不服輸。', ''],
  /** S3 從起跳到致意玩家都沒受傷 */
  CLEAN_DODGE: ['喔？閣下學過跳舞？', '這步法……老師也這樣閃過。', '漂亮。再讓我多看一下。'],
  /** 玩家被終幕 / 荊棘十字打中 */
  BIG_HIT: ['華爾滋，要踩在拍子上。', '腳步亂了。老師會罰你跑操場。', '別倒下，閣下還沒看到最後！'],
  /** 被連打 / 貼身後空翻脫身 */
  BACKFLIP: ['失禮——我的領結歪了。', '連打可不優雅，閣下！', '呼……老骨頭，經不起連打。']
} as const;
/** 每場一次的反應台詞 */
export const BOSS_ONCE_LINES = {
  PLAYER_LOW: '需要中場休息嗎？茶還熱著。',
  RANGED: '遠處放冷箭？可不太紳士。',
  RAPIER: '這一劍……是老師的劍路。',
  IDLE: '閣下是來賞花的嗎？',
  COMEBACK: '閣下的光，比我想的頑固。'
} as const;
export const BOSS_BARK_SEC = 2.4;

/** 換樂章對白 (鎖操作小過場；Boss 回中央後開始)；[0] = 進入第二樂章〈舊夢〉、[1] = 進入終樂章〈落日〉。首次看完整版，之後短版 */
export const TRANSITION_BEATS: readonly [readonly StoryBeat[], readonly StoryBeat[]] = [
  [
    { who: 'BOSS', text: '……好劍。有點意思。' },
    { who: 'BOSS', text: '三十年前，這裡有個西洋劍社。', events: [{ id: 'MEMORY', at: 0.3 }] },
    { who: 'BOSS', text: '指導老師總戴高帽，人稱『爵士』。' },
    { who: 'BOSS', text: '他退休那天，在這裡埋了一顆種子。', events: [{ id: 'SEED', at: 0.9 }] },
    { who: 'BOSS', text: '還把佩劍插在一旁，替它當支架。', events: [{ id: 'SWORD', at: 0.7 }] },
    { who: 'BOSS', text: '他說：『替我看著操場。』', events: [{ id: 'MEMORY_OFF', at: -0.3 }] },
    { text: '☀️「……那顆種子，就是我們。」' },
    { who: 'BOSS', text: '第二樂章〈舊夢〉——請。' }
  ],
  [
    { who: 'BOSS', text: '……閣下一直看著我呢。' },
    { who: 'BOSS', text: '每年春天，我都想長大給他看。', events: [{ id: 'SPROUT', at: 0.5 }] },
    { who: 'BOSS', text: '然後割草機來了。一年，又一年。' },
    { who: 'BOSS', text: '放學後，大家都背對我離開。' },
    { text: '☀️「所以你戳我第一下的時候……」' },
    { text: '☀️「其實，我有一點開心。」' },
    { who: 'BOSS', text: '……只是閣下戳了十下。' },
    { who: 'PLAYER', text: '抱歉啦' },
    { who: 'BOSS', text: '終樂章〈落日〉。請——看到最後。' }
  ]
];
/** 換樂章短版 (已看過完整版)：第一句 + 最後一句 */
export const TRANSITION_BEATS_SHORT: readonly [readonly StoryBeat[], readonly StoryBeat[]] = [
  [TRANSITION_BEATS[0][0], TRANSITION_BEATS[0][TRANSITION_BEATS[0].length - 1]],
  [TRANSITION_BEATS[1][0], TRANSITION_BEATS[1][TRANSITION_BEATS[1].length - 1]]
];

/** 戳第 7 / 8 / 9 下：畫面四周泛起暮紅 (不透明度)；第 10 下：BGM 靜音秒數、開場延遲秒數 (靜一拍再爆開) */
export const POKE_DUSK_TINT: Readonly<Record<number, number>> = { 7: 0.3, 8: 0.45, 9: 0.6 };
export const POKE10_SILENCE_SEC = 1.9;
export const POKE10_INTRO_DELAY = 0.4;

/** 換樂章系統橫幅 (index = 進入的樂章) */
export const MOVEMENT_BANNERS = ['', '🎵 第二樂章〈舊夢〉・喘口氣回血', '🎵 終樂章〈落日〉・喘口氣回血'] as const;

/** 終樂章黎明轉折 (本管血量 ≤ 一半)、最後一擊前 (≤ 15%) */
export const DAWN_BOSS_LINE = '……奇怪，天邊怎麼亮了？';
export const FINAL_LOW_BOSS_LINE = '再一劍……天就亮了吧。';
export const DAWN_AT = 0.5;
export const FINAL_LOW_AT = 0.15;

// ===== 戰中：向陽之心 (橫幅；它的光 = 戰鬥中幫玩家回血) =====
// 教學句 (TEACH / H1~H4) 每場合計 ≤ HEART_MAX_PER_FIGHT；劇情句 (S2 / S3 / DAWN) 另計、各一次；兩句間隔 ≥ HEART_GAP_SEC

export type HeartLineId = 'TEACH' | 'H1' | 'H2' | 'H3' | 'H4' | 'S2' | 'S3' | 'DAWN';
export const HEART_LINES: Readonly<Record<HeartLineId, { text: string; ms: number }>> = {
  /** 首次 (存檔) 第一次掉血：說明回血功用 (接 HEART_TEACH_2) */
  TEACH: { text: '☀️ 向陽之心：我的光能幫你回血！', ms: 2400 },
  H1: { text: '☀️ 向陽之心：他在致意！現在打！', ms: 2000 },
  /** 血低 (<35%) 且還在纏鬥：簡短提醒 */
  H2: { text: '☀️ 向陽之心：退開 10 公尺，我幫你回血！', ms: 2800 },
  /** 第一次進入快速回血 (首次 = 確認句；之後的場次改短句) */
  H3: { text: '🌻 向陽之心：在幫你回血！最多到八成喔', ms: 3000 },
  H4: { text: '☀️ 向陽之心：我的光還在，別放棄！', ms: 2200 },
  S2: { text: '☀️ 向陽之心：他的劍路……和老師一模一樣。', ms: 2800 },
  S3: { text: '☀️ 向陽之心：這次，我們一起看到最後！', ms: 2600 },
  DAWN: { text: '☀️ 向陽之心：天亮了——是你的光！', ms: 2600 }
};
/** 回血教學第二則 (緊接 TEACH 排入橫幅佇列) */
export const HEART_TEACH_2 = { text: '☀️ 離他 10 公尺、別出手，最多補八成', ms: 3200 } as const;
export const HEART_MAX_PER_FIGHT = 5;
export const HEART_GAP_SEC = 10;
/** H2 / H4 血量門檻 (比例) */
export const HEART_LOW_HP = 0.35;
export const HEART_CRITICAL_HP = 0.2;
/** HUD 血量環快速回血標籤 (標示來源 = 小花) */
export const REGEN_TAG = (perSec: number) => `🌻+${perSec}/s`;

// ===== 結局：首勝過場 (約 13s，點擊前進 / 長按跳過) =====

export const VICTORY_FIRST_BEATS: readonly StoryBeat[] = [
  { text: '🎩「……好劍。好一場決鬥。」' },
  { text: '🎩「劍，始於禮，終於禮。」' },
  { text: '🎩「最後——回個禮吧？」' },
  { who: 'PLAYER', text: '（回禮）', events: [{ id: 'FACE' }] },
  { text: '🎩「……三十年了，終於有人回禮。」', events: [{ id: 'DISSOLVE', at: -1.0 }] },
  { text: '☀️「謝謝你。光，我拿回去囉。」', events: [{ id: 'OUTRO' }, { id: 'RESTORE', at: 0.2 }] },
  { text: '🎩（花瓣裡）「這把劍，替我撐了三十年。」', events: [{ id: 'RAPIER' }] },
  { text: '🎩（花瓣裡）「借你。下次來，記得先行禮。」' },
  { text: '🌻「……謝謝你，看到最後。」', events: [{ id: 'FLOWER' }, { id: 'BLEND', at: -0.8 }] }
];
export const VICTORY_SLEEPY_LINE = '呼……呼……(太陽花打起了瞌睡)';
export const VICTORY_BANNER = {
  first: (cash: number) => `🎩 禮成！擊敗花劍客，零用錢 +$${cash}！`,
  repeat: (cash: number) => `🎩 再次擊敗花劍客！零用錢 +$${cash}！`
} as const;
export const PLAYER_WIN_BUBBLE = '🏆 勝利！';
/** 玫瑰細劍解鎖橫幅開頭 (weapons/defs/rapier.ts 接上操作說明；解鎖由 Progression.checkRapierUnlock 於過場後處理) */
export const RAPIER_UNLOCK_BANNER = '🌹 獲得花劍客託付的【玫瑰細劍】！';
/** 再戰勝利：Boss 跪地時 Boss框 (依勝場 / 是否用細劍，fencerRules.rematchWinKey) */
export const REMATCH_WIN_BOSS_LINE = {
  early: '……承讓。下次見。',
  regular: '閣下越來越有禮貌了。',
  veteran: '看來要補考的，是我。',
  rapier: '老師的劍，在閣下手上很好。'
} as const;
export type RematchWinKey = keyof typeof REMATCH_WIN_BOSS_LINE;

// ===== 結局：戰敗 =====

/** 依倒下時的樂章 (0 行禮 / 1 舊夢 / 2 落日)：專屬句 + 通用句隨機 */
export const DEFEAT_BOSS_LINES_BY_BAR = [
  ['第一樂章就退場？禮貌課重修。', '勝負已分。下次，先行禮。'],
  ['故事聽一半就睡著，可不禮貌。', '禮貌課，改天補考。'],
  ['……閣下差一點，就看到日出了。']
] as const;
/** 保健室復活 1 秒後 (只在剛輸給花劍客時；依倒下時的樂章) */
export const RESPAWN_HEART_LINES_BY_BAR = [
  '☀️ 向陽之心：先看清他的舞步再來！',
  '☀️ 向陽之心：他的故事還沒說完！',
  '☀️ 向陽之心：差一點就天亮了！'
] as const;
/** 戰敗後玩家第一次回到太陽花 8m 內 (得意臉) */
export const SUNFLOWER_AFTER_LOSS_LINE = '哼哼，補考報名處在這。';
export const SUNFLOWER_AFTER_LOSS_RANGE = 8;
export const RESPAWN_HEART_DELAY_MS = 1000;

// ===== 首勝後：太陽花日常 (戳第 1 下) =====

/** 首勝後第一次戳 (只出現一次) + 2.6s 後接話 */
export const SUNFLOWER_WARM_LINES: readonly [DailyLine, DailyLine] = [
  { text: '你是三十年來，第一個跟我說十句話的人。', face: 'BLANK' },
  { text: '雖然十句都是被你戳的。', face: 'SMUG' }
];
export const SUNFLOWER_DAILY_LINES: readonly DailyLine[] = [
  { text: '早安～今天的光，謝謝你還給我。', face: 'BLANK' },
  { text: '那傢伙？在我花盤裡睡午覺。', face: 'SIDE' },
  { text: '輕一點，我現在是有禮貌的花。', face: 'SMUG' },
  { text: '細劍要記得擦，那傢伙很龜毛。', face: 'SWEAT' },
  { text: '放學時，記得回頭看我一眼喔。', face: 'BLANK' },
  { text: '割草機今天繞過我了，嘿嘿。', face: 'SMUG' }
];
/** 社旗收線廣播播過之後才加入日常台詞 */
export const SUNFLOWER_DAILY_AFTER_FLAG: DailyLine = { text: '聽說老師來過？……我剛好在睡。', face: 'SWEAT' };
/** 首勝後：完整太陽花在這個距離內會轉頭看玩家 */
export const SUNFLOWER_WATCH_RANGE = 8;
export const SUNFLOWER_DAILY_SEC = 2.6;

// ===== 後日談：閃身步老師彩蛋 (對話視窗，句末接上) =====

export const DODGE_TEACHER_EGG = '「……你見到向日爵士了？老夫的閃身步，當年就是跟他學的西洋劍步法。」';

// ===== 長度檢查 =====

/** 顯示字數：以 code point 計，忽略變體選擇符 / ZWJ (emoji 算 1 字) */
export function storyLen(s: string): number {
  let n = 0;
  for (const ch of s) if (ch !== '️' && ch !== '‍') n++;
  return n;
}
