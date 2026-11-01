// 世界 Boss【花劍客】劇情文字表 (純資料，無 three.js / DOM 依賴)：程式只引用這裡的常數，改稿只動本檔。
// 長度規則 (tests/fencerStory.test.ts 自動檢查)：手機直屏每句 ≤ 22 字 (全校廣播跑馬燈例外)、玩家頭頂框 ≤ 8 字。
// 劇情稿：fencer-story.md (太陽花 10 句原句一字不改)。

import type { SunflowerFace, SunflowerLine } from './fencerRules';
import type { StoryLine } from './storyPlayer';

// 過場 = 台詞陣列 (資料驅動)：每句顯示秒數依字數自動計算 (storyPlayer.lineDuration：max(2, 字數 × 0.14 + 0.5))，
// 改稿只動文字與順序，不必改計時；演出事件掛在句子上 (events: [{ id, at }]，at = 該句開始後秒數、負值 = 句尾前)。
// 事件 id (FencerBossFight 依 id 執行)：
//   開場：PETALS 花心爆花瓣、FLASH 白閃 + 清場 + 結界升起、WALL_UP 結界升滿卸載校園、BOSS 花劍客現身、AWAKEN 向陽覺醒、BLEND 鏡頭混回玩家身後
//   首勝：FACE 玩家轉向回禮、DISSOLVE Boss 化花瓣、OUTRO 光飛回太陽花、RESTORE 恢復校園、RAPIER 細劍插地、BLEND 鏡頭混回
//   換樂章：無 (Boss 回中央由固定前導 TRANSITION_LEAD_SEC 處理)
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
  /** 中央花台長椅 */
  bench: '半夜聽到草裡有人在嘆氣。',
  /** 路人聊天群組 (顯示時前綴 💬) */
  chatBefore: '聽說放學後草地會碎碎念',
  chatAfter: ['聽說有人跟花決鬥還贏了', '操場的花現在超有禮貌']
} as const;

// ===== 前導：全校廣播 (跑馬燈，不受 22 字限制) =====

export const BROADCAST = {
  lines: [
    '📢【總務處公告】校園草皮上的不明小東西請勿踩踏、請勿戳弄，它最近脾氣不太好，已經會翻白眼了。',
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

/** 首戰開場 (約 15s，點擊前進 / 長按跳過) */
export const INTRO_FIRST_BEATS: readonly StoryBeat[] = [
  { text: '🌻「看來不好好教訓你不行了……」', events: [{ id: 'PETALS', at: 0.6 }] },
  { text: '（花心湧出暮色，把操場的光吞了——）', events: [{ id: 'FLASH' }, { id: 'WALL_UP', at: 1.5 }] },
  { text: '🎩「午茶時間到了。」', events: [{ id: 'BOSS' }] },
  { text: '🎩「在下向日爵士，來教你什麼叫禮貌。」' },
  { text: '☀️「別怕！我是它最後的向陽之心！」', events: [{ id: 'AWAKEN' }] },
  { text: '☀️「你惹的禍——幫我打醒那個暴躁的我！」', events: [{ id: 'BLEND', at: -0.8 }] }
];

/** 再戰開場 (約 7s)；Boss 那句跳過時改由 Boss框 在開戰後補講 */
export const REMATCH_BOSS_LINE = {
  afterLoss: '歡迎回來。禮貌課，補考開始。',
  afterWin: '又見面了。這次換我討回禮數。'
} as const;
const rematchBeats = (flower: string, boss: string): readonly StoryBeat[] => [
  { text: `🌻「${flower}」`, events: [{ id: 'PETALS', at: 0.2 }, { id: 'FLASH', at: 0.4 }, { id: 'WALL_UP', at: -0.05 }] },
  { text: `🎩「${boss}」`, events: [{ id: 'BOSS' }] },
  { text: '☀️「又要麻煩你了！」', events: [{ id: 'AWAKEN' }, { id: 'BLEND', at: -0.8 }] }
];
export const INTRO_REMATCH_BEATS = {
  afterLoss: rematchBeats(REMATCH_LINE_AFTER_LOSS, REMATCH_BOSS_LINE.afterLoss),
  afterWin: rematchBeats(REMATCH_LINE_AFTER_WIN, REMATCH_BOSS_LINE.afterWin)
} as const;

/** 覺醒時玩家頭頂框 (≤ 8 字) */
export const PLAYER_AWAKEN_BUBBLE = '☀️ 向陽覺醒';

/** 開戰後系統橫幅 (拆兩則，手機不捲動) */
export const AWAKEN_BANNERS = ['☀️ 向陽覺醒！體力上限 200', '🍃 離他 10 公尺以上可快速回氣'] as const;
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
  CHASE: { first: ['背對對手，可不是紳士所為。'], later: ['背對對手，可不是紳士所為。'], dur: 2.3 }
} as const;

/** 換樂章對白 (鎖操作小過場；Boss 回中央後開始)；[0] = 進入第二樂章、[1] = 進入終樂章 */
export const TRANSITION_BEATS: readonly [readonly StoryBeat[], readonly StoryBeat[]] = [
  [
    { who: 'BOSS', text: '……好劍。有點意思。' },
    { who: 'BOSS', text: '三十年前，有位紳士在這裡教劍。' },
    { who: 'BOSS', text: '他說：劍，始於禮，終於禮。' },
    { who: 'BOSS', text: '第二樂章——請。' }
  ],
  [
    { who: 'BOSS', text: '……你一直看著我呢。' },
    { who: 'BOSS', text: '放學後，大家都背對我離開。' },
    { who: 'BOSS', text: '被踩、被踢，暮色越積越厚。' },
    { who: 'PLAYER', text: '我會看到最後' },
    { who: 'BOSS', text: '終樂章。請——看到最後。' }
  ]
];

/** 換樂章系統橫幅 (index = 進入的樂章) */
export const MOVEMENT_BANNERS = ['', '🎵 第二樂章（2/3）・喘口氣回血', '🎵 終樂章（3/3）・喘口氣回血'] as const;

// ===== 戰中：向陽之心 (橫幅；每場每句最多一次、合計 ≤ 4 句) =====

export type HeartLineId = 'H1' | 'H2' | 'H3' | 'H4';
export const HEART_LINES: Readonly<Record<HeartLineId, { text: string; ms: number }>> = {
  H1: { text: '☀️ 向陽之心：他在致意！現在打！', ms: 2000 },
  H2: { text: '☀️ 向陽之心：退到 10 公尺外回氣！', ms: 2500 },
  H3: { text: '🍃 向陽之心：深呼吸——光回來了。', ms: 1600 },
  H4: { text: '☀️ 向陽之心：我的光還在，別放棄！', ms: 2200 }
};
export const HEART_MAX_PER_FIGHT = 4;
/** H2 / H4 血量門檻 (比例) */
export const HEART_LOW_HP = 0.35;
export const HEART_CRITICAL_HP = 0.2;
/** 每場第二次起的快速回氣改顯示系統版 */
export const REGEN_BANNER = '🍃 脫離戰鬥・快速回氣';

// ===== 結局：首勝過場 (約 13s，點擊前進 / 長按跳過) =====

export const VICTORY_FIRST_BEATS: readonly StoryBeat[] = [
  { text: '🎩「……好劍。好一場決鬥。」' },
  { text: '🎩「最後——回個禮吧？」' },
  { who: 'PLAYER', text: '（抱拳回禮）', events: [{ id: 'FACE' }] },
  { text: '（暮色化成花瓣，飄上天空——）', events: [{ id: 'DISSOLVE' }] },
  { text: '☀️「謝謝你。光，我拿回去囉。」', events: [{ id: 'OUTRO' }, { id: 'RESTORE', at: 0.2 }] },
  { text: '🎩「劍借你。下次來，記得先行禮。」', events: [{ id: 'RAPIER' }, { id: 'BLEND', at: -0.8 }] }
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
