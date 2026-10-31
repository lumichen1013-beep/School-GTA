// 世界 Boss【花劍客】劇情文字表 (純資料，無 three.js / DOM 依賴)：程式只引用這裡的常數，改稿只動本檔。
// 長度規則 (tests/fencerStory.test.ts 自動檢查)：手機直屏每句 ≤ 22 字 (全校廣播跑馬燈例外)、玩家頭頂框 ≤ 8 字。
// 劇情稿：fencer-story.md (太陽花 10 句原句一字不改)。

import type { SunflowerFace, SunflowerLine } from './fencerRules';

/** 時間軸上的一拍：t 秒觸發；who 決定顯示方式 (字幕 / Boss框 / 玩家框)；dur 為頭頂框秒數 */
export interface StoryBeat {
  t: number;
  text: string;
  who?: 'SUB' | 'BOSS' | 'PLAYER';
  dur?: number;
}

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
  /** 1~4 句 */
  calm: (n: number, total: number) => `🌻 戳一下太陽花 (${n}/${total})`,
  /** 5~8 句 */
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
  trackBefore: ['操場中間那朵花，會轉頭看人。', '我跑第十圈時，它對我『嘖』了一聲。'],
  trackAfter: ['欸，昨天操場是不是有人在擊劍？', '那朵花剛剛跟我說早安……'],
  trackChallenge: '要跟我比 200m 嗎？',
  /** 足球雙人組：射門沒進 → 射門者 + 隊友接話 */
  soccerShooterBefore: '球又滾去太陽花那了……你去撿！',
  soccerReplyBefore: '別去！上次有人戳它，就沒回來上課。',
  soccerShooterAfter: '球滾去太陽花那，它踢回來了！',
  /** 中央花台長椅 */
  bench: '操場那朵太陽花，比這些大十倍耶。',
  /** 路人聊天群組 (顯示時前綴 💬) */
  chatBefore: '聽說操場的太陽花會罵人',
  chatAfter: ['聽說有人跟花決鬥還贏了', '操場的花現在超有禮貌']
} as const;

// ===== 前導：全校廣播 (跑馬燈，不受 22 字限制) =====

export const BROADCAST = {
  lines: [
    '📢【總務處公告】操場中央的太陽花請勿踩踏、請勿戳弄，它最近脾氣不太好，已經會翻白眼了。',
    '📢【體育組尋物】器材室找到三十年前西洋劍社的社旗，上面繡著一朵太陽花與一頂高帽，請知情者洽體育組！'
  ],
  /** 首勝後才會出現 */
  afterWin: '📢【總務處公告】操場太陽花今早主動向升旗隊鞠躬，請各位同學記得回禮！',
  afterWinChance: 0.3
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
  { name: '操場中央的怪花', desc: '放學後它好像會轉頭……戳戳看？', goalIcon: '❓', goalTitle: '操場中央的怪花', goalDesc: '放學後它好像會轉頭看人' },
  { name: '擊敗操場花劍客', desc: '向日爵士在結界裡等你回禮', goalIcon: '🎩', goalTitle: '擊敗花劍客・向日爵士', goalDesc: '戳太陽花一下即可再戰' },
  { name: '花劍客・禮成', desc: '太陽花重新向陽 · 再戰勝利 +$200', goalIcon: '🎩', goalTitle: '花劍客・禮成', goalDesc: '太陽花重新向陽' }
];

// ===== 戰中：開場過場 =====

/** 首戰 8.2s (不可跳過)：時間點對應 FencerBossFight 的 INTRO_FIRST 時間軸 */
export const INTRO_FIRST_BEATS: readonly StoryBeat[] = [
  { t: 0.0, text: '🌻「看來不好好教訓你不行了……」' },
  { t: 1.0, text: '（花心湧出暮色，把操場的光吞了——）' },
  { t: 2.6, text: '🎩「午茶時間到了。」' },
  { t: 4.0, text: '🎩「在下向日爵士，來教你什麼叫禮貌。」' },
  { t: 5.3, text: '☀️「別怕！我是它最後的向陽之心！」' },
  { t: 6.8, text: '☀️「你惹的禍——幫我打醒那個暴躁的我！」' }
];

/** 再戰 6.8s (可跳過)；Boss 那句跳過時改由 Boss框 在開戰後補講 */
export const REMATCH_BOSS_LINE = {
  afterLoss: '歡迎回來。禮貌課，補考開始。',
  afterWin: '又見面了。這次換我討回禮數。'
} as const;
const rematchBeats = (flower: string, boss: string): readonly StoryBeat[] => [
  { t: 0.0, text: `🌻「${flower}」` },
  { t: 2.6, text: `🎩「${boss}」` },
  { t: 4.5, text: '☀️「又要麻煩你了！」' }
];
export const INTRO_REMATCH_BEATS = {
  afterLoss: rematchBeats(REMATCH_LINE_AFTER_LOSS, REMATCH_BOSS_LINE.afterLoss),
  afterWin: rematchBeats(REMATCH_LINE_AFTER_WIN, REMATCH_BOSS_LINE.afterWin)
} as const;

/** 覺醒時玩家頭頂框 (≤ 8 字) */
export const PLAYER_AWAKEN_BUBBLE = '☀️ 向陽覺醒';

/** 開戰後系統橫幅 (拆兩則，手機不捲動) */
export const AWAKEN_BANNERS = ['☀️ 向陽覺醒！體力上限 200', '🍃 離他 8 公尺以上可快速回氣'] as const;
/** 第二則距第一則秒數 */
export const AWAKEN_BANNER_GAP = 2.5;

// ===== 戰中：Boss 頭頂框 =====

/** 開戰第一秒 (首戰才說) */
export const BOSS_OPEN_LINE = '準備好了嗎？——請。';
export const BOSS_OPEN_DELAY = 0.3;

/** 招式宣言 (頻率規則見 fencerRules.BossLineGate) */
export const BOSS_CUE_LINES = {
  S1: { first: ['玫瑰三連刺！'], later: ['玫瑰連刺・殘香！'], dur: 1.2 },
  S2: { first: ['帽子，也是紳士的劍。'], later: ['帽子戲法，成雙！'], dur: 1.6 },
  S3_JUMP: { first: ['萬花華爾滋——'], later: ['萬花華爾滋——'], dur: 1.2 },
  S3_FINALE: { first: ['終幕！'], later: ['終幕！'], dur: 1.0 },
  BOW: { first: ['承讓。', '失禮了。', '請。'], later: ['承讓。', '失禮了。', '請。'], dur: 1.3 },
  S4: { first: ['荊棘十字——旋！', '跟上我的舞步。'], later: ['荊棘十字——旋！', '跟上我的舞步。'], dur: 1.4 },
  S5: { first: ['花影雙人舞，請入場。', '兩個我，你看哪個？'], later: ['花影雙人舞，請入場。', '兩個我，你看哪個？'], dur: 1.6 },
  CHASE: { first: ['背對對手，可不是紳士所為。'], later: ['背對對手，可不是紳士所為。'], dur: 2.0 }
} as const;

/** 換樂章對白 (以 Boss 換樂章過場內時間為準)；[0] = 進入第二樂章、[1] = 進入終樂章 */
export const TRANSITION_BEATS: readonly [readonly StoryBeat[], readonly StoryBeat[]] = [
  [
    { t: 0.0, who: 'BOSS', text: '……好劍。有點意思。', dur: 2.2 },
    { t: 2.4, who: 'BOSS', text: '三十年前，有位紳士在這裡教劍。', dur: 2.8 },
    { t: 5.4, who: 'BOSS', text: '他說：劍，始於禮，終於禮。', dur: 2.6 },
    { t: 8.2, who: 'BOSS', text: '第二樂章——請。', dur: 1.6 }
  ],
  [
    { t: 0.0, who: 'BOSS', text: '……你一直看著我呢。', dur: 2.2 },
    { t: 2.4, who: 'BOSS', text: '放學後，大家都背對我離開。', dur: 2.6 },
    { t: 5.2, who: 'BOSS', text: '被踩、被踢，暮色越積越厚。', dur: 2.6 },
    { t: 7.0, who: 'PLAYER', text: '我會看到最後' },
    { t: 8.2, who: 'BOSS', text: '終樂章。請——看到最後。', dur: 1.6 }
  ]
];

/** 換樂章系統橫幅 (index = 進入的樂章) */
export const MOVEMENT_BANNERS = ['', '🎵 第二樂章（2/3）・喘口氣回血', '🎵 終樂章（3/3）・喘口氣回血'] as const;

// ===== 戰中：向陽之心 (橫幅；每場每句最多一次、合計 ≤ 4 句) =====

export type HeartLineId = 'H1' | 'H2' | 'H3' | 'H4';
export const HEART_LINES: Readonly<Record<HeartLineId, { text: string; ms: number }>> = {
  H1: { text: '☀️ 向陽之心：他在致意！現在打！', ms: 2000 },
  H2: { text: '☀️ 向陽之心：退到 8 公尺外回氣！', ms: 2500 },
  H3: { text: '🍃 向陽之心：深呼吸——光回來了。', ms: 1600 },
  H4: { text: '☀️ 向陽之心：我的光還在，別放棄！', ms: 2200 }
};
export const HEART_MAX_PER_FIGHT = 4;
/** H2 / H4 血量門檻 (比例) */
export const HEART_LOW_HP = 0.35;
export const HEART_CRITICAL_HP = 0.2;
/** 每場第二次起的快速回氣改顯示系統版 */
export const REGEN_BANNER = '🍃 脫離戰鬥・快速回氣';

// ===== 結局：首勝 7 秒過場 =====

export const VICTORY_FIRST_BEATS: readonly StoryBeat[] = [
  { t: 0.0, text: '🎩「……好劍。好一場決鬥。」' },
  { t: 1.6, text: '🎩「最後——回個禮吧？」' },
  { t: 2.8, who: 'PLAYER', text: '（抱拳回禮）' },
  { t: 3.4, text: '（暮色化成花瓣，飄上天空——）' },
  { t: 4.4, text: '☀️「謝謝你。光，我拿回去囉。」' },
  { t: 5.8, text: '🎩「劍借你。下次來，記得先行禮。」' }
];
export const VICTORY_SLEEPY_LINE = '呼……呼……(太陽花打起了瞌睡)';
export const VICTORY_BANNER = {
  first: (cash: number) => `🎩 禮成！擊敗花劍客，零用錢 +$${cash}！`,
  repeat: (cash: number) => `🎩 再次擊敗花劍客！零用錢 +$${cash}！`
} as const;
export const PLAYER_WIN_BUBBLE = '🏆 勝利！';
/** 玫瑰細劍解鎖橫幅開頭 (weapons/defs/rapier.ts 接上操作說明；解鎖由 Progression.checkRapierUnlock 於過場後處理) */
export const RAPIER_UNLOCK_BANNER = '🌹 獲得花劍客託付的【玫瑰細劍】！';
/** 再戰勝利：Boss 跪地時 Boss框 */
export const REMATCH_WIN_BOSS_LINE = '……承讓。下次見。';

// ===== 結局：戰敗 =====

export const DEFEAT_BOSS_LINES = ['勝負已分。下次，先行禮。', '禮貌課，改天補考。'] as const;
/** 保健室復活 1 秒後 (只在剛輸給花劍客時) */
export const RESPAWN_HEART_LINE = '☀️ 向陽之心：下次一定贏！我在操場等你。';
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
  { text: '放學時，記得回頭看我一眼喔。', face: 'BLANK' }
];
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
