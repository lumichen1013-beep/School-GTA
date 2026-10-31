import { SUNFLOWER_LINES, REMATCH_LINE_AFTER_WIN, REMATCH_LINE_AFTER_LOSS, SUNFLOWER_DAILY_LINES, SUNFLOWER_WARM_LINES, HEART_MAX_PER_FIGHT, type DailyLine, type HeartLineId } from './fencerStory';

// 世界 Boss【花劍客】的純規則 (無 three.js / DOM 依賴，可單元測試)：
// 數值常數、太陽花台詞計數與再戰規則、劇情台詞頻率規則 (文字本身在 fencerStory.ts)、三管血與換樂章、戰鬥中回血 (基礎 + 脫離戰鬥快速回氣)、獎勵。

export const FENCER = {
  /** 操場草皮中央：結界中心 (= 太陽花 / Boss 現身點) */
  CENTER_X: -55,
  CENTER_Z: 34,
  ARENA_R: 16,
  PLAYER_CLAMP_PAD: 0.6,
  BOSS_CLAMP_PAD: 0.8,
  /** 三管血 × 2100 (三個樂章) */
  BAR_HP: 2100,
  BARS: 3,
  /** 戰鬥期間玩家體力上限 (覺醒)；戰後還原為 NORMAL_MAX_HP */
  BATTLE_MAX_HP: 200,
  NORMAL_MAX_HP: 100,
  /** 基礎回血 (任何狀態都在回，受擊也不暫停) */
  BASE_REGEN: 0.8,
  /** 脫離戰鬥快速回血 (僅於上限 80% 以下) */
  OOC_REGEN: 12,
  OOC_CAP_RATIO: 0.8,
  /** 脫戰條件：N 秒內沒被 Boss 打中、N 秒內沒攻擊 Boss (遠程也算)、與 Boss 距離大於 M 公尺 */
  OOC_NO_HIT_SEC: 2,
  OOC_NO_ATTACK_SEC: 2,
  OOC_MIN_DIST: 8,
  /** 太陽花：戳 10 次開戰；每次間隔冷卻防連點 */
  TAUNT_COUNT: 10,
  POKE_COOLDOWN: 1.0,
  /** 獎勵 */
  FIRST_WIN_CASH: 1500,
  REPEAT_WIN_CASH: 200,
  /** 每管打空：無敵亮相 + 換樂章過場 (期間不出手、玩家算脫戰) */
  BAR_BREAK_POSE_SEC: 1.2,
  BAR_TRANSITION_SEC: 8.0
} as const;

// ===== 太陽花台詞 (每戳一次一句；第 10 句後開戰) =====

export type SunflowerFace = 'BLANK' | 'SIDE' | 'SWEAT' | 'ANNOYED' | 'ANGRY' | 'SHOCK' | 'CRY' | 'EVIL' | 'SMUG' | 'SLEEPY';
export type SunflowerReaction =
  | 'TWITCH' | 'TURN_TO' | 'DROOP_SWEAT' | 'TURN_AWAY' | 'BURST_RED' | 'SHRINK'
  | 'STIFFEN_HUM' | 'TREMBLE' | 'BOW' | 'AWAKEN';

export interface SunflowerLine {
  text: string;
  reaction: SunflowerReaction;
  face: SunflowerFace;
}

export { SUNFLOWER_LINES, REMATCH_LINE_AFTER_WIN, REMATCH_LINE_AFTER_LOSS } from './fencerStory';

export type FightResult = 'NONE' | 'WIN' | 'LOSS';

export interface PokeResult {
  accepted: boolean;  // false = 冷卻中 (略過本次)
  line: SunflowerLine | null;
  index: number;      // 第幾句 (1 起算；再戰 / 日常為 0)
  startFight: boolean;
  /** 首勝後第一下的日常台詞 (含一次性溫情句)；followUp = 溫情句 2.6s 後的接話 */
  daily: boolean;
  followUp: DailyLine | null;
}

/** 首勝後：第 1 下說日常台詞，REMATCH_ARM_SEC 秒內再戳才開戰 (戰敗後仍戳 1 下即開戰) */
export const REMATCH_ARM_SEC = 4;

/**
 * 太陽花戳戳計數：首戰前需戳滿 10 次 (離開不歸零)；戰敗後戳 1 次即可再戰；
 * 首勝後先說日常台詞 (首次為一次性溫情句)，4 秒內再戳一下才開戰。每次間隔 POKE_COOLDOWN 秒防連點。now 為秒。
 */
export class SunflowerTaunt {
  public pokes = 0;
  public lastResult: FightResult = 'NONE';
  /** 一次性溫情句已播 (存檔) */
  public warmLineShown = false;
  private lastPokeAt = -Infinity;
  private armedUntil = -Infinity;
  private lastDaily = -1;

  public get needsFullTaunt(): boolean {
    return this.lastResult === 'NONE';
  }

  public get remaining(): number {
    return this.needsFullTaunt ? Math.max(0, FENCER.TAUNT_COUNT - this.pokes) : 1;
  }

  /** 首勝後：已說過日常台詞、在 4 秒內 (再戳即開戰) */
  public isArmed(now: number): boolean {
    return this.lastResult === 'WIN' && now <= this.armedUntil;
  }

  public poke(now: number, rng: () => number = Math.random): PokeResult {
    if (now - this.lastPokeAt < FENCER.POKE_COOLDOWN) return { accepted: false, line: null, index: 0, startFight: false, daily: false, followUp: null };
    this.lastPokeAt = now;
    if (this.lastResult === 'LOSS') {
      return { accepted: true, line: { text: REMATCH_LINE_AFTER_LOSS, reaction: 'AWAKEN', face: 'EVIL' }, index: 0, startFight: true, daily: false, followUp: null };
    }
    if (this.lastResult === 'WIN') {
      if (now <= this.armedUntil) {
        this.armedUntil = -Infinity;
        return { accepted: true, line: { text: REMATCH_LINE_AFTER_WIN, reaction: 'AWAKEN', face: 'EVIL' }, index: 0, startFight: true, daily: false, followUp: null };
      }
      this.armedUntil = now + REMATCH_ARM_SEC;
      if (!this.warmLineShown) {
        this.warmLineShown = true;
        const w = SUNFLOWER_WARM_LINES[0];
        return { accepted: true, line: { text: w.text, reaction: 'TURN_TO', face: w.face }, index: 0, startFight: false, daily: true, followUp: SUNFLOWER_WARM_LINES[1] };
      }
      // 日常 5 句隨機 (不連續重複)
      const n = SUNFLOWER_DAILY_LINES.length;
      let i = Math.min(n - 1, Math.floor(rng() * n));
      if (i === this.lastDaily) i = (i + 1) % n;
      this.lastDaily = i;
      const d = SUNFLOWER_DAILY_LINES[i];
      return { accepted: true, line: { text: d.text, reaction: 'TURN_TO', face: d.face }, index: 0, startFight: false, daily: true, followUp: null };
    }
    this.pokes = Math.min(FENCER.TAUNT_COUNT, this.pokes + 1);
    const line = SUNFLOWER_LINES[this.pokes - 1];
    return { accepted: true, line, index: this.pokes, startFight: this.pokes >= FENCER.TAUNT_COUNT, daily: false, followUp: null };
  }

  /** 戰鬥結束 (勝 / 敗 / 中途離開) 後記錄結果：離開視為敗 */
  public recordResult(result: 'WIN' | 'LOSS') {
    this.lastResult = result;
    this.armedUntil = -Infinity;
  }
}

// ===== 太陽花成長 (小綠苗 → 完整太陽花) =====

/** 成長階段 0~10：首戰前 = 已戳次數；任何一場戰鬥後一律完整 (戰敗 / 首勝後都不回到綠苗) */
export function sunflowerStage(pokes: number, lastResult: FightResult): number {
  if (lastResult !== 'NONE') return FENCER.TAUNT_COUNT;
  return Math.max(0, Math.min(FENCER.TAUNT_COUNT, Math.floor(pokes)));
}

/** 互動範圍：小苗 2.0m，隨成長擴大到完整太陽花 3.2m */
export function sunflowerPokeRange(stage: number): number {
  return 2 + 0.12 * Math.max(0, Math.min(FENCER.TAUNT_COUNT, stage));
}

/** 小苗的細微反應距離 (葉子輕抖 / 轉向 / 偶爾閃光) */
export const SPROUT_AWARE_RANGE = 5;

/** 任務看板 / 大地圖揭露階段：0 未知 (還沒開過戰)、1 已遭遇、2 已首勝 */
export function fencerQuestStage(fightsStarted: number, defeated: boolean): 0 | 1 | 2 {
  if (defeated) return 2;
  return fightsStarted > 0 ? 1 : 0;
}

// ===== 開場過場時間軸 (秒)：首戰 8.2s (向陽之心多 1.4s 台詞)、再戰 6.8s =====

export interface IntroTimeline {
  awaken: number;
  blend: number;
  end: number;
}
export const INTRO_FIRST: IntroTimeline = { awaken: 5.3, blend: 7.4, end: 8.2 };
export const INTRO_REMATCH: IntroTimeline = { awaken: 4.5, blend: 6.0, end: 6.8 };
export function introTimeline(fightsStarted: number): IntroTimeline {
  return fightsStarted <= 1 ? INTRO_FIRST : INTRO_REMATCH;
}

/** 首勝才播 7s 長過場 (鎖操作)；之後的勝利一律短收尾 */
export function victoryIsLong(alreadyDefeated: boolean): boolean {
  return !alreadyDefeated;
}

/** 首勝過場 (鎖操作)：總長、恢復校園時間點、Boss 化花瓣時間點 */
export const VICTORY_FIRST = { end: 7.0, restoreAt: 4.6, outroAt: 4.4, rapierAt: 5.8, faceAt: 2.8, dissolveAt: 3.4, freeze: 0.25 } as const;
/** 再戰勝利 (短收尾，不鎖操作) */
export const VICTORY_REPEAT = { end: 3.6, restoreAt: 2.2, dissolveAt: 1.4 } as const;

// ===== Boss 台詞頻率 =====

/** 開戰後這段時間內不喊「追擊」台詞 (開場玩家本來就站在 11m 外) */
export const CHASE_LINE_MIN_FIGHT_SEC = 6;

export type BossCue = 'S1' | 'S2' | 'S3_JUMP' | 'S3_FINALE' | 'BOW' | 'S4' | 'S5' | 'CHASE';

/**
 * 招式宣言頻率：大招 (S3 / S4 / S5) 與收招致意每次都喊；小招 (S1 / S2) 每個樂章只喊第一次；追擊每場一次。
 */
export class BossLineGate {
  private perBar = 0;   // 位元：bar * 2 + (S1 0 / S2 1)
  private once = 0;

  public resetFight() {
    this.perBar = 0;
    this.once = 0;
  }

  public allow(cue: BossCue, bar: number): boolean {
    if (cue === 'S1' || cue === 'S2') {
      const bit = 1 << (Math.max(0, Math.min(7, bar)) * 2 + (cue === 'S1' ? 0 : 1));
      if (this.perBar & bit) return false;
      this.perBar |= bit;
      return true;
    }
    if (cue === 'CHASE') {
      if (this.once & 1) return false;
      this.once |= 1;
      return true;
    }
    return true;
  }
}

/** 向陽之心：每場每句最多一次，合計最多 HEART_MAX_PER_FIGHT 句 */
export class HeartVoice {
  private fired = 0;
  private count = 0;

  public resetFight() {
    this.fired = 0;
    this.count = 0;
  }

  public get spoken(): number {
    return this.count;
  }

  public tryFire(id: HeartLineId): boolean {
    const bit = 1 << (id.charCodeAt(1) - 49);
    if ((this.fired & bit) || this.count >= HEART_MAX_PER_FIGHT) return false;
    this.fired |= bit;
    this.count++;
    return true;
  }
}

/** 開場過場是否可跳過：第二次起 (曾經開戰過) */
export function canSkipIntro(fightsStarted: number): boolean {
  return fightsStarted >= 2;
}

/** 勝利獎金：首勝 1500，再戰勝利 200 */
export function victoryReward(alreadyDefeated: boolean): number {
  return alreadyDefeated ? FENCER.REPEAT_WIN_CASH : FENCER.FIRST_WIN_CASH;
}

// ===== 三管血 (三樂章) =====

export interface BossDamageResult {
  applied: number;     // 實際扣除量 (無敵或已倒時 0)
  barBroken: boolean;  // 本擊打空一管 (進入換樂章)
  defeated: boolean;   // 本擊打空最後一管
}

/**
 * 三管血：每管 BAR_HP，打空一管 → 換樂章 (由呼叫端播放無敵亮相 + 過場，期間設 invulnerable)；
 * 溢出傷害不跨管 (下一管從滿血開始)。bar 為 0 起算的目前樂章。
 */
export class BossHealthBars {
  public bar = 0;
  public hp: number = FENCER.BAR_HP;
  public invulnerable = false;

  public reset() {
    this.bar = 0;
    this.hp = FENCER.BAR_HP;
    this.invulnerable = false;
  }

  public get isDefeated(): boolean {
    return this.bar >= FENCER.BARS - 1 && this.hp <= 0;
  }

  public damage(amount: number): BossDamageResult {
    if (this.invulnerable || this.isDefeated || amount <= 0) return { applied: 0, barBroken: false, defeated: false };
    const applied = Math.min(this.hp, amount);
    this.hp -= applied;
    if (this.hp > 0) return { applied, barBroken: false, defeated: false };
    if (this.bar >= FENCER.BARS - 1) return { applied, barBroken: true, defeated: true };
    return { applied, barBroken: true, defeated: false };
  }

  /** 換樂章過場結束：進入下一管 (滿血) */
  public advanceBar() {
    if (this.bar < FENCER.BARS - 1) {
      this.bar++;
      this.hp = FENCER.BAR_HP;
    }
  }

  /** 整場總剩餘血量 (0 ~ BARS × BAR_HP) */
  public get totalRemaining(): number {
    return Math.max(0, this.hp) + (FENCER.BARS - 1 - this.bar) * FENCER.BAR_HP;
  }
}

export const MOVEMENT_NAMES = ['第一樂章', '第二樂章', '終樂章'] as const;

/** HUD 血條名稱：🎩 花劍客・第二樂章 (2/3) */
export function bossBarLabel(bar: number): string {
  const i = Math.max(0, Math.min(FENCER.BARS - 1, bar));
  return `花劍客・${MOVEMENT_NAMES[i]} (${i + 1}/${FENCER.BARS})`;
}

// ===== 戰鬥中回血：基礎 0.8/s + 脫離戰鬥 12/s (僅 80% 以下) =====

export interface RegenInput {
  hp: number;
  maxHp: number;
  distToBoss: number;
  /** 強制視為脫戰 (換樂章過場) */
  forceOutOfCombat: boolean;
}

/**
 * 脫離戰鬥追蹤：記錄距上次被 Boss 打中 / 距上次攻擊 Boss 的秒數，判定脫戰並回傳本幀回血量。
 * 脫戰 = 2 秒內沒被打、2 秒內沒出手 (含遠程)、且距 Boss > 8m；換樂章過場一律算脫戰。
 */
export class CombatRegen {
  public sinceHit = Infinity;
  public sinceAttack = Infinity;
  public outOfCombat = false;
  /** 本次撤退是否已跳過「脫離戰鬥」橫幅 (重新進入戰鬥時重置) */
  public bannerShown = false;

  public reset() {
    this.sinceHit = Infinity;
    this.sinceAttack = Infinity;
    this.outOfCombat = false;
    this.bannerShown = false;
  }

  /** 被 Boss 打中 (實際扣血)：回傳是否打斷了脫戰狀態 */
  public onPlayerHit(): boolean {
    this.sinceHit = 0;
    const interrupted = this.outOfCombat;
    this.outOfCombat = false;
    return interrupted;
  }

  /** 玩家出手 (近戰揮擊 / 遠程發射 / 命中 Boss) */
  public onPlayerAttack() {
    this.sinceAttack = 0;
  }

  public static isOutOfCombat(sinceHit: number, sinceAttack: number, distToBoss: number, force: boolean): boolean {
    if (force) return true;
    return sinceHit >= FENCER.OOC_NO_HIT_SEC && sinceAttack >= FENCER.OOC_NO_ATTACK_SEC && distToBoss > FENCER.OOC_MIN_DIST;
  }

  /** 本幀回血速率 (HP/s)：80% 以上只剩基礎回血 */
  public static regenRate(outOfCombat: boolean, hp: number, maxHp: number): number {
    if (outOfCombat && hp < maxHp * FENCER.OOC_CAP_RATIO) return FENCER.OOC_REGEN;
    return FENCER.BASE_REGEN;
  }

  /** 推進計時並回傳本幀回血量 (不超過上限；快速回血不超過 80% 線) */
  public update(dt: number, inp: RegenInput): number {
    this.sinceHit += dt;
    this.sinceAttack += dt;
    const ooc = CombatRegen.isOutOfCombat(this.sinceHit, this.sinceAttack, inp.distToBoss, inp.forceOutOfCombat);
    if (!ooc) this.bannerShown = false;
    this.outOfCombat = ooc;
    if (inp.hp <= 0 || inp.hp >= inp.maxHp) return 0;
    const rate = CombatRegen.regenRate(ooc, inp.hp, inp.maxHp);
    let heal = rate * dt;
    if (rate > FENCER.BASE_REGEN) {
      // 快速回血到 80% 線為止，超出部分改以基礎速率計
      const capLine = inp.maxHp * FENCER.OOC_CAP_RATIO;
      if (inp.hp + heal > capLine) heal = Math.max(capLine - inp.hp, 0) + FENCER.BASE_REGEN * dt;
    }
    return Math.min(heal, inp.maxHp - inp.hp);
  }

  /** 是否正在快速回血 (HUD 綠環 / 腳下光圈) */
  public isFastRegen(hp: number, maxHp: number): boolean {
    return this.outOfCombat && hp > 0 && hp < maxHp * FENCER.OOC_CAP_RATIO;
  }
}

// ===== 圓形結界夾回 (解析式) =====

/** 將 (x, z) 夾回圓心 (cx, cz) 半徑 r 內；回傳是否有夾 (out 寫入結果與徑向單位向量) */
export function clampToCircle(x: number, z: number, cx: number, cz: number, r: number, out: { x: number; z: number; nx: number; nz: number }): boolean {
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  out.x = x; out.z = z; out.nx = 0; out.nz = 0;
  if (d2 <= r * r) return false;
  const d = Math.sqrt(d2);
  out.nx = dx / d;
  out.nz = dz / d;
  out.x = cx + out.nx * r;
  out.z = cz + out.nz * r;
  return true;
}

/** 線段 (ax, az) → (bx, bz) 到點 (px, pz) 的最短距離 (S1 突刺膠囊判定) */
export function segmentPointDistance(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 1e-8 ? ((px - ax) * vx + (pz - az) * vz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + vx * t - px;
  const dz = az + vz * t - pz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** 自圓內一點 (ax, az) 沿單位方向 (dx, dz) 到圓周 (cx, cz, r) 的距離 (S4 荊棘臂長)；起點在圓外回傳 0 */
export function rayCircleDistance(ax: number, az: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const ox = ax - cx;
  const oz = az - cz;
  const b = ox * dx + oz * dz;
  const c = ox * ox + oz * oz - r * r;
  if (c > 0) return 0;
  return -b + Math.sqrt(Math.max(0, b * b - c));
}

/** S4 十字第 k 臂的朝向 (yaw：方向 = (sin, cos))；四臂間隔 90° */
export function thornArmYaw(baseYaw: number, k: number): number {
  return baseYaw + k * Math.PI * 0.5;
}

/** S4 十字旋轉角：t 秒內由 baseYaw 線性轉 90° (dirSign = ±1)，t 超出範圍則夾住 */
export function thornCrossYaw(baseYaw: number, dirSign: number, t: number, dur: number): number {
  const k = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 1;
  return baseYaw + dirSign * k * Math.PI * 0.5;
}

/**
 * S4 玫瑰荊棘十字判定 (解析式)：以 (ax, az) 為中心、四臂各朝 yaw + k·90° 延伸到結界牆 (圓 cx, cz, r)，
 * reach (0~1) 為荊棘生長比例；玩家 (px, pz) 到任一臂線段距離 ≤ halfW 時回傳臂索引 (0~3)，否則 -1。
 */
export function thornCrossHit(
  ax: number, az: number, yaw: number, reach: number,
  cx: number, cz: number, r: number,
  px: number, pz: number, halfW: number
): number {
  for (let k = 0; k < 4; k++) {
    const a = thornArmYaw(yaw, k);
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const len = rayCircleDistance(ax, az, dx, dz, cx, cz, r) * reach;
    if (len <= 0) continue;
    if (segmentPointDistance(ax, az, ax + dx * len, az + dz * len, px, pz) <= halfW) return k;
  }
  return -1;
}

/**
 * S5 花影雙人舞：分身站位 = 玩家位置 + (玩家→Boss 方向旋轉 ±angle) × dist，夾回圓內 (半徑 clampR)。
 * angle 約 100°：兩條突刺線在玩家處交叉 (非共線)，玩家須沿夾角平分線外側閃出。
 */
export function pinchClonePos(
  px: number, pz: number, bx: number, bz: number, sideSign: number, angle: number, dist: number,
  cx: number, cz: number, clampR: number, out: { x: number; z: number }
): { x: number; z: number } {
  let dx = bx - px;
  let dz = bz - pz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
  const a = angle * sideSign;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  out.x = px + (dx * ca - dz * sa) * dist;
  out.z = pz + (dx * sa + dz * ca) * dist;
  const ox = out.x - cx;
  const oz = out.z - cz;
  const od = Math.hypot(ox, oz);
  if (od > clampR) { out.x = cx + (ox / od) * clampR; out.z = cz + (oz / od) * clampR; }
  return out;
}

/**
 * S5 夾擊判定：本體突刺 (a→b) 與分身突刺 (c→e) 兩條膠囊 (半徑 r)，回傳位元 1 = 本體命中、2 = 分身命中 (0 = 閃過)。
 * 呼叫端以「同一回合共用一次命中」處理：被夾住也只吃一次傷害。
 */
export function pinchHitMask(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, ex: number, ez: number,
  px: number, pz: number, r: number
): number {
  let m = 0;
  if (segmentPointDistance(ax, az, bx, bz, px, pz) <= r) m |= 1;
  if (segmentPointDistance(cx, cz, ex, ez, px, pz) <= r) m |= 2;
  return m;
}

/** 自圓內一點出發的線段首次穿出圓 (半徑 r) 的參數 t (0~1)；未穿出回傳 -1 (投射物撞結界牆) */
export function segmentExitCircleT(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): number {
  const bdx = bx - cx;
  const bdz = bz - cz;
  if (bdx * bdx + bdz * bdz <= r * r) return -1;
  const adx = ax - cx;
  const adz = az - cz;
  const vx = bx - ax;
  const vz = bz - az;
  const a = vx * vx + vz * vz;
  if (a < 1e-10) return -1;
  const b = 2 * (adx * vx + adz * vz);
  const c = adx * adx + adz * adz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
