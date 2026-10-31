import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import { queryColliders, isBlockedXZ } from '../physics/aabb';
import { requestCameraShake } from '../effects/cameraShake';
import { comboFinisherFX } from '../effects/ComboFinisherFX';
import { slashFX } from '../effects/SlashFX';
import { impactDust } from '../effects/ImpactDust';
import { getFxQuality } from '../effects/fxQuality';
import { WEAPON_FX_STYLES } from '../effects/weaponFxStyle';
import type { CollidableBox } from '../world/CampusWorld';
import type { NPC } from '../entities/NPC';
import { AOE_SECONDARY_DMG, PLAYER_TAKEDOWN, PLAYER_TAKEDOWN_WINDUP, NPC_GRAB_THROW, NPC_RULER_FLURRY, NPC_SPINKICK, probeFan, probeLine, probePath, strikeDmg, strikeHitMode, strikeRoute, wrapAngle, type KfMove, type PlayerHitMode } from '../entities/shared/kungfu';
import type { GameContext } from './GameContext';
import { PlantAoeShape, type PlantHitResult } from '../world/EcologicalGarden';
import { isAttackFromBehind, isBehindNpc, isBossStunOpening } from './DetentionMode';
import type { LaunchCap } from '../weapons/launch';
import { SerialSlot } from './serialSlot';

const _scratchPlayerForward = new THREE.Vector3();
const _scratchImpactDir = new THREE.Vector3();
const _scratchBikeForward = new THREE.Vector3();
const _scratchBikeSideVec = new THREE.Vector3();
const _scratchBikeLaunchDir = new THREE.Vector3();
const _separationNear: CollidableBox[] = [];
const _scratchExecLook = new THREE.Vector3();
const _scratchAoeCenter = new THREE.Vector3();
const _scratchFinisherPoint = new THREE.Vector3();
const _fxPoint = new THREE.Vector3();
const _fxNoDir = new THREE.Vector3();
const _fxFeatherPoint = new THREE.Vector3();
const FEATHER_HEIGHT = 1.1; // 羽毛噴發高度 (胸口)
const _fxGroundNear: CollidableBox[] = [];
// 旋身終結技腰高衝擊環高度與著地補環半徑改由武器定義 finisherFx 提供 (見 src/weapons/defs)
const FX_FIST_LAND_DELAY = 0.22; // 旋風腿落地補環延遲 (約招式進度 0.8)
// 雙燕羽刃斬痕：X 字離地高度、命中閃光胸口高度
const SLASH_X_HEIGHT = 1.15;
const HIT_FLASH_HEIGHT = 1.0;
const PATH_FORWARD_PUSH = 0.6; // 突進斬擊退方向：往兩側外推 + 沿突進方向的分量
const DASH_BAND_REMAIN = 1.0; // 突進光帶終點 = 目前位置 + 剩餘突進距離 × 此倍率
const ENEMY_CROSS_HALF_LEN = 0.75; // 突進斬命中者身上的 X 字斬痕單臂半長
const DASH_RING_RADIUS = 1.5; // 突進斬終點雙圈衝擊環半徑
const _pathProbe = new Float32Array(3);
const _plantShape = new PlantAoeShape();
// 顏色往白色混合 (t = 0 原色、1 純白)
function mixWhiteChannel(c: number, t: number): number {
  return Math.round(c + (255 - c) * t);
}
function mixWhiteHex(hex: number, t: number): number {
  return (mixWhiteChannel((hex >> 16) & 255, t) << 16) | (mixWhiteChannel((hex >> 8) & 255, t) << 8) | mixWhiteChannel(hex & 255, t);
}
const FX_GROUND_TOLERANCE = 0.8; // 衝擊點地面與玩家腳底落差超過此值視為不在地面 (高台邊緣)
// 終結技群攻候選 (依水平距離由近到遠排序，最多 AOE_CAP 人)
const AOE_CAP = 8;
const _aoeHits: (NPC | null)[] = new Array(AOE_CAP).fill(null);
const _aoeDist = new Float32Array(AOE_CAP);
const _aoePlantHits: PlantHitResult[] = Array.from({ length: AOE_CAP }, () => ({ name: '', defeated: false, isBoss: false, damage: 0 }));
// 群攻結算選項：mode = 命中模式 (LAUNCH 擊飛 / SHOVE 推擊 / LIGHT 只扣血)、dmgMul = 本擊傷害倍率 (取代招式 dmg)、
// fx = 觸發終結特效 / 群攻震動與橫幅、index = 命中序號
interface AoeStrikeOpts { mode: PlayerHitMode; dmgMul: number; fx: boolean; index: number }
const _aoeLightOpts: AoeStrikeOpts = { mode: 'LIGHT', dmgMul: 1, fx: false, index: 1 };

// 玩家命中單一 NPC 的結算參數 (預配置、可重用；近戰單體 / 群攻 / 投射物共用，見 CombatSystem.applyPlayerHitToNpc)
// feedback：命中時的近戰回饋 — SINGLE = 停格震動 + 命中閃光、AOE = 命中閃光、AOE_FX = 命中閃光 + 敵身 X 字斬痕、NONE = 不出 (投射物自理)
export type PlayerHitFeedback = 'NONE' | 'SINGLE' | 'AOE' | 'AOE_FX';
export interface PlayerHitSpec {
  readonly src: THREE.Vector3; // 攻擊來源位置 (背後判定來源、打鬥聲響位置)
  readonly dir: THREE.Vector3; // 擊退方向 (水平單位向量)
  useAttackDir: boolean; // true：背後判定改用 attackDirX / Z (來源 → NPC 的行進方向，如投射物速度)，不用 src
  attackDirX: number;
  attackDirZ: number;
  damage: number; // 基礎傷害 (未四捨五入、未套第二世界倍率)
  dmgMul: number; // 本擊額外傷害倍率 (群攻次目標 0.8)
  knockback: number; // 擊退力 (未套第二世界正面減半)
  mode: PlayerHitMode;
  shoveDist: number; // SHOVE 推開距離 (m)
  serial: number; // 出招序號：同一序號只通緝 / 提示正面防禦一次
  launchCap: LaunchCap | null; // 擊飛上限 (null = NPC 預設)
  ignoreCooldown: boolean; // 略過 0.65 秒受擊保護 (群攻)
  fightNoise: boolean; // 第二世界命中時於 src 發出打鬥聲響 (群攻由呼叫端合併一次)
  deferFrontal: boolean; // true：正面減傷提示與出招間隔由呼叫端合併 (群攻)，此處只寫入 frontalHit
  reportCrime: boolean; // true：依 serial 結算通緝 (擊倒併入擊倒結算)；false：擊倒不通緝，由呼叫端合併
  move: KfMove | null; // 近戰回饋所屬招式 (feedback 非 NONE 時必填)
  strikeIndex: number;
  feedback: PlayerHitFeedback;
  frontalHit: boolean; // 輸出：本次命中為第二世界正面攻擊
}
export function createPlayerHitSpec(): PlayerHitSpec {
  return {
    src: new THREE.Vector3(), dir: new THREE.Vector3(), useAttackDir: false, attackDirX: 0, attackDirZ: 0,
    damage: 0, dmgMul: 1, knockback: 0, mode: 'LIGHT', shoveDist: 0, serial: -1, launchCap: null,
    ignoreCooldown: false, fightNoise: false, deferFrontal: false, reportCrime: false,
    move: null, strikeIndex: 0, feedback: 'NONE', frontalHit: false
  };
}
const _meleeHitSpec = createPlayerHitSpec();

// 暗殺動作狀態機 (總教官為電影運鏡，特訓院守衛為跟隨鏡頭的快速版)：
// 成功：背刺 STAB → 倒地 FALL → (總教官) 後空翻 FLIP → 落地收尾 LAND
// 時機計量表失誤：格擋 PARRY → 滑退 SKID → (總教官) 鏡頭收尾 LAND
// 各階段以真實秒數計時並套用固定模擬倍率
type ExecPhase = 'NONE' | 'STAB' | 'FALL' | 'FLIP' | 'LAND' | 'PARRY' | 'SKID';
type ActiveExecPhase = Exclude<ExecPhase, 'NONE'>;
type ExecMode = 'BOSS' | 'MINION';
const EXEC_NEXT_BOSS: Record<ActiveExecPhase, ExecPhase> = { STAB: 'FALL', FALL: 'FLIP', FLIP: 'LAND', LAND: 'NONE', PARRY: 'SKID', SKID: 'LAND' };
const EXEC_NEXT_MINION: Record<ActiveExecPhase, ExecPhase> = { STAB: 'FALL', FALL: 'NONE', FLIP: 'NONE', LAND: 'NONE', PARRY: 'SKID', SKID: 'NONE' };
const EXEC_SCALE_BOSS: Record<ActiveExecPhase, number> = { STAB: 0.25, FALL: 0.35, FLIP: 0.6, LAND: 1.0, PARRY: 1.0, SKID: 1.0 };
const EXEC_SCALE_MINION: Record<ActiveExecPhase, number> = { STAB: 1.0, FALL: 1.0, FLIP: 1.0, LAND: 1.0, PARRY: 1.0, SKID: 1.0 };
const EXEC_SKID_TIME = 0.5; // 格擋震退滑行秒數
const EXEC_DURATION_NORMAL: Record<ActiveExecPhase, number> = { STAB: 0.8, FALL: 0.8, FLIP: 1.0, LAND: 0.5, PARRY: 0.34, SKID: EXEC_SKID_TIME };
const EXEC_DURATION_FINAL: Record<ActiveExecPhase, number> = { STAB: 1.0, FALL: 1.4, FLIP: 1.0, LAND: 0.5, PARRY: 0.34, SKID: EXEC_SKID_TIME };
const EXEC_DURATION_MINION: Record<ActiveExecPhase, number> = { STAB: 0.45, FALL: 0.8, FLIP: 0, LAND: 0, PARRY: 0.34, SKID: EXEC_SKID_TIME };
const EXEC_IMPACT_AT = 0.3; // 總教官背刺命中時間點 (真實秒，終結一擊 +0.1)
const EXEC_IMPACT_AT_MINION = 0.25; // 守衛暗殺命中時間點
// 時機計量表暫停點：出手招式到達蓄勢頂點 (背刺階段時間倍率固定，蓄勢時間 = 命中時間 × 蓄勢/命中 比例)
const EXEC_WINDUP_RATIO = PLAYER_TAKEDOWN_WINDUP / PLAYER_TAKEDOWN.strike;
const EXEC_HIT_STOP = 0.06; // 命中瞬間停格 (真實秒)
const EXEC_HIT_STOP_SCALE = 0.02;
const EXEC_SHOT_DISTANCE = 5.5; // 側面機位距離 (終結一擊 6.5)
const EXEC_SHOT_DOLLY = 0.5; // 倒地階段緩慢後拉
const EXEC_FINAL_ORBIT = THREE.MathUtils.degToRad(20); // 終結一擊整段緩慢環繞
const EXEC_FOCUS_TO_BOSS = 0.35; // 倒地階段視線往總教官偏移比例
const EXEC_STAGGER_DIST = 0.45; // 總教官向前踉蹌距離
const EXEC_STAGGER_DIST_MINION = 0.3;
const EXEC_LEAP_DIST = 4.0;
const EXEC_LEAP_SIM_TIME = 0.55; // 後空翻模擬秒數 (×0.6 ≈ 0.92 真實秒，於 1.0 秒階段內落地)
const EXEC_SKID_DIST = 4.0; // 格擋震退距離 (與後空翻相同約 4 個身位)
const BOSS_DOWN_TIME = 2.0;
// 第二世界一般攻擊傷害倍率：正面 ×0.6 (背後盲區全額)，總教官另 ×0.5；暗殺不受影響
const DETENTION_FRONTAL_DMG_MULT = 0.6;
const DETENTION_BOSS_DMG_MULT = 0.5;
const BOSS_CHARGE_DAMAGE = 34; // 總教官狂暴衝撞命中傷害
// NPC 攻擊間隔：一般 0.85 秒；第二世界守衛警戒 (ALERT) 時加快為 0.6 秒
const BIKE_RAM_DAMAGE = 50; // 騎車衝撞 NPC 固定傷害
const NPC_ATTACK_INTERVAL = 0.85;
const GRAB_THROW_DAMAGE = 10; // 主任教官擒拿摔
const GRAB_THROW_DOWN_TIME = 0.7; // 擒拿摔落地後倒地秒數
const RULER_STRIKE_DAMAGE = 4; // 生教組長戒尺連打 (每下)
const BIG_MOVE_INTERRUPT_CHANCE = 0.5; // 玩家出招中被大招 (擒拿摔、戒尺連打、總教官衝撞/迴旋踢) 打斷的機率
const NPC_ATTACK_INTERVAL_ALERT = 0.6;
const FRONTAL_LOCK = 0.34; // 正面攻擊守衛的出招間隔：命中點起算 0.34 秒 (加上預備動作約等於按鍵起 0.5 秒)
const FRONTAL_BANNER = '🛡️ 正面衝擊守備防禦！傷害 ×0.6、技能間隔 0.5s、擊退力減半！';
export const HIT_STOP = 0.04; // 一般命中停格 (真實秒)
const HIT_STOP_FINISHER = 0.08; // 連段終結技命中停格
export const HIT_STOP_EXTRA = HIT_STOP * 0.6; // 多段招式額外擊 (小擊) 命中停格；投射物命中預設
const HIT_STOP_SCALE = 0.05;
// 終結技群攻：次目標傷害倍率、判定距離寬容與高低差上限
const AOE_REACH_GRACE = 0.3;
const AOE_MAX_DY = 1.5;
const AOE_BACK_BLEND = 0.8; // 下劈衝擊點後方目標：擊退方向混入面向比例
const AOE_MIN_DIST = 0.3; // 距圓心過近時擊退改沿面向
const NPC_STRIKE_REACH_GRACE = 0.35; // NPC 出招命中時的距離寬容 (預備動作期間玩家退出此範圍即落空)
const NPC_STRIKE_ARC = 0.25; // NPC 出招命中方向門檻 (面向與玩家方向內積下限，約正面 ±75°) // 總教官倒地秒數 (自玩家恢復操控起算)
const EXEC_LEAP_PEAK = 1.1; // 後空翻頂點高度 (m)
const EXEC_RESULT_SHOW_MS = 1800; // 恢復操控後 QTE 打擊橫幅顯示毫秒 (之後才播出運鏡期間暫存的頂部橫幅)
const EXEC_FALL_GROUND_AT = 0.75; // 總教官於倒地階段 75% 處俯臥著地
const EXEC_REACT_HIT_STOP_RATE = 0.2; // 命中停格期間受擊動作推進倍率

// 暗殺時機計量表：暗殺動作進行到出手蓄勢頂點時暫停並顯示 (未出現則動作直接播完)；
// 游標在條上來回擺動，於綠區內再按攻擊鍵才繼續出手，失誤則目標格擋並把玩家震退約 4m
const TAKEDOWN_QTE_ZONE_MIN = 0.08; // 綠區起點隨機範圍 (避開兩端折返點)
const TAKEDOWN_QTE_ZONE_MAX = 0.92; // 綠區終點上限
const TAKEDOWN_QTE_TIMEOUT = 3.0; // 未按下自動判定失誤 (真實秒；最慢速度下仍可掃過 2 趟)
// 總教官：50% 出現、綠區 5%、游標單程秒數依目前血量線性變化，血量越低越快 (500 HP 1.4 秒 ~ 100 HP 0.8 秒)；失誤扣 15 HP
const BOSS_QTE_CHANCE = 0.5;
const BOSS_QTE_ZONE = 0.05;
const BOSS_QTE_SWEEP_SLOW = 1.4;
const BOSS_QTE_SWEEP_FAST = 0.8;
const BOSS_QTE_HP_SLOW = 500;
const BOSS_QTE_HP_FAST = 100;
const BOSS_PARRY_DAMAGE = 15;
// 特訓院守衛 (含警戒犬)：30% 出現、綠區 10%、游標單程 1.5 秒；失誤不扣血，守衛進入警戒追捕
const MINION_QTE_CHANCE = 0.3;
const MINION_QTE_ZONE = 0.1;
const MINION_QTE_SWEEP = 1.5;

// 依總教官血量取得游標單程掃過秒數
export function getTakedownQteSweep(hp: number): number {
  const k = THREE.MathUtils.clamp((hp - BOSS_QTE_HP_FAST) / (BOSS_QTE_HP_SLOW - BOSS_QTE_HP_FAST), 0, 1);
  return BOSS_QTE_SWEEP_FAST + (BOSS_QTE_SWEEP_SLOW - BOSS_QTE_SWEEP_FAST) * k;
}

/**
 * 戰鬥系統：玩家攻擊判定、背後暗殺與慢動作特寫、NPC 擊倒結算、單車衝撞、NPC 攻擊玩家與角色推擠
 */
export class CombatSystem {
  // 暗殺動作狀態機
  private execPhase: ExecPhase = 'NONE';
  private execMode: ExecMode = 'BOSS';
  private execPhaseTime: number = 0; // 本階段已經過真實秒數
  private execElapsed: number = 0; // 整段已經過真實秒數
  private readonly execDurations: Record<ActiveExecPhase, number> = { ...EXEC_DURATION_NORMAL };
  private execNext: Record<ActiveExecPhase, ExecPhase> = EXEC_NEXT_BOSS;
  private execScale: Record<ActiveExecPhase, number> = EXEC_SCALE_BOSS;
  private execImpactAt: number = EXEC_IMPACT_AT;
  private execTarget: NPC | null = null;
  private execIsFinal: boolean = false;
  private execFromHiding: boolean = false;
  private execImpactDone: boolean = false;
  private execFailed: boolean = false; // 時機計量表失誤 (改播格擋震退)
  private execHitStop: number = 0;
  private execStaggered: number = 0;
  private execBossLanded: boolean = false;
  private execFallRatio: number = 0; // 目標倒地程度 (0 站立 ~ 1 倒地)
  private execReactTime: number = 0; // 命中後受擊動作已推進真實秒數
  private readonly execPinPos = new THREE.Vector3(); // 守衛於出手前固定原地
  private execCoverName: string = '草堆';
  // 暗殺時機計量表
  private qtePending: boolean = false; // 本次暗殺將於蓄勢頂點出現計量表
  private qteRunning: boolean = false;
  private qteStartMs: number = 0;
  private qteSweep: number = BOSS_QTE_SWEEP_SLOW;
  private qteZone: number = 0;
  private qteZoneWidth: number = BOSS_QTE_ZONE;
  private qteArmed: boolean = false; // 發動暗殺的按鍵放開後才接受判定按鍵 (避免長按 F 自動連發)
  private readonly execStrikeDir = new THREE.Vector3();
  private damageText: THREE.Sprite | null = null;
  private wasBossWindingUp: boolean = false;
  private wasBossStunned: boolean = false;
  private hitStop: number = 0; // 一般攻擊命中停格剩餘真實秒數
  // 已通緝 / 已顯示正面防禦提示的出招序號 (同一招多段命中只結算一次)
  private readonly crimeSlot = new SerialSlot();
  private readonly frontalSlot = new SerialSlot();
  private slashFlashes: number = 0; // 本擊已出的命中閃光數
  private slashCrosses: number = 0; // 本擊已出的敵身 X 字斬痕數

  constructor(private readonly ctx: GameContext) {}

  // 切換世界時中止暗殺動作，避免在另一個世界延續
  public resetTransientState() {
    if (this.execPhase !== 'NONE') this.finishExecution(true);
    this.hitStop = 0;
    this.ctx.player.cancelAttack();
    this.ctx.projectiles.reset();
  }

  // 投射物命中停格 (真實秒)：與進行中的停格取較長者；暗殺動作期間不影響
  public requestHitStop(seconds: number) {
    if (seconds > this.hitStop) this.hitStop = seconds;
  }

  // 暗殺動作 (含時機計量表) 進行中：鎖定玩家操控，NPC 不攻擊玩家
  public get isExecutionActive(): boolean {
    return this.execPhase !== 'NONE';
  }

  // 推進暗殺動作階段 (真實時間) 並回傳套用時間倍率後的模擬時間步長
  public scaleDelta(rawDelta: number): number {
    if (this.execPhase === 'NONE') {
      if (this.hitStop > 0) {
        this.hitStop -= rawDelta;
        return rawDelta * HIT_STOP_SCALE;
      }
      return rawDelta;
    }
    // 時機計量表：動作與世界完全暫停 (運鏡機位維持)
    if (this.qteRunning) {
      this.updateTakedownQte();
      if (this.qteRunning) return 0;
    }
    const prevTime = this.execPhaseTime;
    this.execPhaseTime += rawDelta;
    this.execElapsed += rawDelta;

    // 出手蓄勢頂點：暫停並顯示時機計量表 (本幀只推進到暫停點)
    if (this.execPhase === 'STAB' && this.qtePending) {
      const windupAt = this.execImpactAt * EXEC_WINDUP_RATIO;
      if (this.execPhaseTime >= windupAt) {
        const over = this.execPhaseTime - windupAt;
        this.execPhaseTime = windupAt;
        this.execElapsed -= over;
        this.startTakedownQte();
        return Math.max(0, windupAt - prevTime) * this.execScale.STAB;
      }
    }

    let phase: ExecPhase = this.execPhase;
    while (phase !== 'NONE' && this.execPhaseTime >= this.execDurations[phase]) {
      this.execPhaseTime -= this.execDurations[phase];
      phase = this.execNext[phase];
      this.enterExecPhase(phase);
      phase = this.execPhase as ExecPhase; // 進入階段時可能中止 (例如玩家倒下)
    }
    if (phase === 'NONE') return rawDelta;

    if (phase === 'STAB' && !this.execImpactDone && !this.execFailed && this.execPhaseTime >= this.execImpactAt) {
      this.applyExecutionImpact();
    }
    if (this.execHitStop > 0) {
      this.execHitStop -= rawDelta;
      return rawDelta * EXEC_HIT_STOP_SCALE;
    }
    return rawDelta * this.execScale[phase];
  }

  // 每幀於 NPC 更新之後、鏡頭更新之前呼叫：覆寫目標受擊倒地動作、傷害數字與 (總教官) 運鏡機位
  public updateExecution(rawDelta: number) {
    const target = this.execTarget;
    if (this.execPhase === 'NONE' || !target) return;
    const { player, cameraCtrl } = this.ctx;
    const isBoss = this.execMode === 'BOSS';

    if (this.execImpactDone) {
      this.updateExecutionTargetPose(target, rawDelta);
      // 倒地倒數凍結至玩家恢復操控為止 (起身與 3 秒護盾皆自恢復操控後起算)
      if (isBoss && !target.isPermanentlyKnockedOut) target.reviveTimer = BOSS_DOWN_TIME;
    } else if (!isBoss && !this.execFailed) {
      // 守衛於出手前固定原地 (不再巡邏走開)
      target.position.x = this.execPinPos.x;
      target.position.z = this.execPinPos.z;
      target.mesh.position.x = this.execPinPos.x;
      target.mesh.position.z = this.execPinPos.z;
    }
    if (!isBoss) return;

    // 運鏡期間隱藏頭頂倒地告示牌，避免與 -100 傷害數字搶畫面 (恢復操控後重新顯示並開始倒數)
    if (!this.execFailed) target.setKOBadgeVisible(false);
    this.updateDamageText(target);

    if (this.execPhase === 'LAND') {
      const t = Math.min(1, this.execPhaseTime / this.execDurations.LAND);
      cameraCtrl.blendExecutionToBehind(player.position, player.rotationY + Math.PI, t, rawDelta);
      return;
    }

    // 視線：倒地階段逐漸偏向總教官，其餘階段看玩家與總教官目前位置的中點
    // (總教官倒下後以身體中心計算，俯臥身軀沿打擊方向延伸約 0.9m)
    const look = _scratchExecLook.copy(target.position).addScaledVector(this.execStrikeDir, 0.9 * this.execFallRatio);
    look.add(player.position).multiplyScalar(0.5);
    let dolly = 0;
    if (this.execPhase === 'FALL') {
      const u = this.execPhaseTime / this.execDurations.FALL;
      const k = u * u * (3 - 2 * u);
      dolly = EXEC_SHOT_DOLLY * k;
      look.lerp(target.position, EXEC_FOCUS_TO_BOSS * k);
      look.addScaledVector(this.execStrikeDir, 0.9 * this.execFallRatio * EXEC_FOCUS_TO_BOSS * k);
    } else if (this.execPhase === 'FLIP') {
      dolly = EXEC_SHOT_DOLLY;
    }
    let orbit = 0;
    if (this.execIsFinal) {
      const d = this.execDurations;
      const u = Math.min(1, this.execElapsed / (d.STAB + d.FALL + d.FLIP));
      orbit = EXEC_FINAL_ORBIT * u * u * (3 - 2 * u);
    }
    cameraCtrl.updateExecutionShot(dolly, orbit, look, rawDelta);
  }

  // 開始暗殺動作：玩家上步蓄勢出手 (總教官另有電影運鏡)；依機率於蓄勢頂點出現時機計量表
  private startExecution(target: NPC, mode: ExecMode, isFinal: boolean, isFromHiding: boolean) {
    const { player, cameraCtrl, hud, wantedSystem } = this.ctx;
    const isBoss = mode === 'BOSS';
    this.execMode = mode;
    this.execTarget = target;
    this.execIsFinal = isFinal;
    this.execFromHiding = isFromHiding;
    Object.assign(this.execDurations, isBoss ? (isFinal ? EXEC_DURATION_FINAL : EXEC_DURATION_NORMAL) : EXEC_DURATION_MINION);
    this.execNext = isBoss ? EXEC_NEXT_BOSS : EXEC_NEXT_MINION;
    this.execScale = isBoss ? EXEC_SCALE_BOSS : EXEC_SCALE_MINION;
    this.execImpactAt = isBoss ? EXEC_IMPACT_AT + (isFinal ? 0.1 : 0) : EXEC_IMPACT_AT_MINION;
    this.execImpactDone = false;
    this.execFailed = false;
    this.execHitStop = 0;
    this.execStaggered = 0;
    this.execBossLanded = false;
    this.execFallRatio = 0;
    this.execReactTime = 0;
    this.execElapsed = 0;
    this.execPinPos.copy(target.position);
    this.qtePending = Math.random() < (isBoss ? BOSS_QTE_CHANCE : MINION_QTE_CHANCE);
    this.qteRunning = false;

    this.execStrikeDir.subVectors(target.position, player.position).setY(0);
    if (this.execStrikeDir.lengthSq() < 0.01) this.execStrikeDir.set(0, 0, 1);
    else this.execStrikeDir.normalize();

    // 面向目標出手 (轉身由招式起手平滑帶過)，鎖定操控並免疫傷害
    const faceYaw = Math.atan2(this.execStrikeDir.x, this.execStrikeDir.z);
    const twistFrom = wrapAngle(player.mesh.rotation.y - faceYaw);
    player.rotationY = faceYaw;
    player.isCinematicLocked = true;
    player.performCinematicStrike(this.execImpactAt * this.execScale.STAB, twistFrom);

    this.execPhase = 'STAB';
    this.execPhaseTime = 0;
    if (!isBoss) return;

    const orbit = isFinal ? EXEC_FINAL_ORBIT : 0;
    cameraCtrl.beginExecutionShot(player.position, target.position, isFinal ? EXEC_SHOT_DISTANCE + 1.0 : EXEC_SHOT_DISTANCE, EXEC_SHOT_DOLLY, orbit, this.ctx.activeColliders);
    // 電影黑邊持續至落地收尾結束；運鏡期間頂部橫幅暫存，QTE 打擊橫幅於恢復操控後才顯示
    wantedSystem.holdBanners();
    const qteTitle = isFinal
      ? (isFromHiding ? '🗡️【刺客教條·草堆終結】' : '🗡️【刺客教條·終極處決】')
      : (isFromHiding ? '🗡️【刺客教條·掩體突襲】' : '⚡【硬直破綻暴擊】');
    const qteSub = isFinal
      ? '徹底擊潰特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！'
      : isFromHiding
        ? `掩體突襲重擊要害！造成 100 傷害！(剩餘 HP: ${Math.max(0, target.hp - 100)}/${target.maxHp}，總教官倒地 2 秒！)`
        : `趁撞柱硬直重擊要害！造成 100 傷害！(剩餘 HP: ${Math.max(0, target.hp - 100)}/${target.maxHp}，總教官倒地 2 秒！)`;
    hud.beginCinematicExecution(qteTitle, qteSub);
  }

  private enterExecPhase(next: ExecPhase) {
    const { player, cameraCtrl } = this.ctx;
    const target = this.execTarget;
    // 保險：成功路線任何情況下都確保命中結算已發生
    if (!this.execImpactDone && !this.execFailed) this.applyExecutionImpact();
    this.execPhase = next;
    if (!target) return;

    if (next === 'FALL') {
      if (this.execMode === 'BOSS') this.showDamageText(target);
    } else if (next === 'FLIP') {
      player.leapAwayFrom(target.position, EXEC_LEAP_DIST, EXEC_LEAP_SIM_TIME, EXEC_LEAP_PEAK);
    } else if (next === 'SKID') {
      this.applyParryHit(target);
    } else if (next === 'LAND') {
      // 落地面向總教官，鏡頭自運鏡機位平滑過渡至玩家正後方
      const dx = target.position.x - player.position.x;
      const dz = target.position.z - player.position.z;
      if (dx * dx + dz * dz > 0.0001) {
        player.rotationY = Math.atan2(dx, dz);
        player.mesh.rotation.y = player.rotationY;
      }
      if (this.damageText) this.damageText.visible = false;
      cameraCtrl.markExecutionBlendStart();
    } else if (next === 'NONE') {
      this.finishExecution();
    }
  }

  // 出手命中：停格、震動與音效；總教官結算 100 傷害並倒地，守衛一擊永久昏迷 (倒地動作由本系統覆寫)
  private applyExecutionImpact() {
    const target = this.execTarget;
    this.execImpactDone = true;
    if (!target) return;
    const { wantedSystem, detention } = this.ctx;
    const isFromHiding = this.execFromHiding;
    // 受擊倒地動作自目前畫面姿勢起算 (須在倒地結算歸零四肢之前記錄)
    target.captureTakedownStartPose();

    if (this.execMode === 'MINION') {
      this.execHitStop = EXEC_HIT_STOP * 0.7;
      requestCameraShake(0.2);
      target.isDownFaceDown = target.role !== 'DETENTION_WOLF';
      target.knockoutSilently();
      detention.takedownCount++;
      soundManager.playPunch(this.ctx.player.position);
      const reward = this.payTakedownBounty(target);
      if (isFromHiding) {
        wantedSystem.showBanner(`🗡️【刺客教條·掩體暗殺】將 ${target.getRoleTitle()} 拖入${this.execCoverName}無聲刺殺！全額賞金 +$${reward}！`, 2500);
      } else {
        wantedSystem.showBanner(`🥷 潛行擊昏！(無聲排除 ${target.getRoleTitle()}，永久昏迷) 全額賞金 +$${reward}！`, 2000);
      }
      return;
    }

    this.execHitStop = EXEC_HIT_STOP;
    soundManager.playCinematicExecutionHit(this.ctx.player.position);
    requestCameraShake(0.55);

    // 每次精確造成 100 傷害，500 HP 需暗殺 5 次才能擊破
    target.isBossStunned = false;
    target.bossStunTimer = 0;
    target.isDownFaceDown = true;
    target.applyAssassinationDamage(100);

    if (target.hp <= 0) {
      target.knockoutSilently();
      detention.onBossDefeated(target);
      detention.takedownCount++;
      const reward = this.payTakedownBounty(target);
      wantedSystem.showBanner(
        isFromHiding
          ? `🗡️【刺客教條·掩體致命突襲】一擊終結特訓總教官！全額賞金 +$${reward}！掉落【萬能逃脫鑰匙卡】！快前往南大門！`
          : `🏆 狂賀！終極暗殺擊破特訓總教官！全額賞金 +$${reward}！掉落【萬能逃脫鑰匙卡】！快前往南大門！`,
        5000
      );
      soundManager.playSchoolBell(this.ctx.player.position);
    } else {
      // 傷害與倒地資訊由恢復操控後的 QTE 打擊橫幅呈現，不另發頂部橫幅
      target.knockdownBoss(BOSS_DOWN_TIME);
    }
  }

  // 暗殺擊倒：發放全額特訓賞金 (提示併入暗殺橫幅)，回傳金額
  private payTakedownBounty(target: NPC): number {
    const { progression } = this.ctx;
    const { reward } = progression.recordDefeat(target.role, true);
    progression.addCash(reward);
    return reward;
  }

  // 目標受擊後動作 (以命中後真實秒數連續推進，跨越背刺/倒地階段不跳格)：
  // 頭部前甩、踉蹌向前 (遇牆停止)、膝軟下沉、伸手撐地後倒地，於倒地階段 75% 處著地
  private updateExecutionTargetPose(target: NPC, rawDelta: number) {
    this.execReactTime += rawDelta * (this.execHitStop > 0 ? EXEC_REACT_HIT_STOP_RATE : 1);
    const d = this.execDurations;
    const u = Math.min(1, this.execReactTime / (d.STAB - this.execImpactAt + d.FALL * EXEC_FALL_GROUND_AT));
    const st = THREE.MathUtils.clamp((u - 0.08) / 0.55, 0, 1);
    const isBoss = this.execMode === 'BOSS';
    this.staggerTarget(target, (isBoss ? EXEC_STAGGER_DIST : EXEC_STAGGER_DIST_MINION) * st * st * (3 - 2 * st));
    const pitch = target.applyTakedownFallPose(u);
    this.execFallRatio = THREE.MathUtils.clamp(pitch / (Math.PI / 2), 0, 1);
    if (u >= 1 && !this.execBossLanded) {
      this.execBossLanded = true;
      requestCameraShake(isBoss ? 0.35 : 0.15);
      soundManager.playPunch(this.ctx.player.position);
    }
  }

  // 沿打擊方向推移目標至指定累計距離 (遇牆即停)
  private staggerTarget(target: NPC, dist: number) {
    const step = dist - this.execStaggered;
    if (step <= 0) return;
    this.execStaggered = dist;
    const nx = target.position.x + this.execStrikeDir.x * step;
    const nz = target.position.z + this.execStrikeDir.z * step;
    if (!isBlockedXZ(this.ctx.activeColliders, nx, nz, 0.45, target.position.y, 0.3, 1.6)) {
      target.position.x = nx;
      target.position.z = nz;
    }
  }

  // 結束暗殺動作：恢復操控 (總教官倒地倒數自此起算；運鏡恢復一般鏡頭)；
  // 成功時短暫顯示 QTE 打擊橫幅後再播出暫存的頂部橫幅，中止 (切換世界) 或格擋失誤時直接恢復
  private finishExecution(aborted: boolean = false) {
    const { player, cameraCtrl, hud, wantedSystem } = this.ctx;
    const target = this.execTarget;
    const wasBoss = this.execMode === 'BOSS';
    const failed = this.execFailed;
    if (this.qteRunning) hud.hideTakedownMeter();
    this.qteRunning = false;
    this.qtePending = false;
    this.execPhase = 'NONE';
    this.execPhaseTime = 0;
    this.execHitStop = 0;
    this.execTarget = null;
    this.execFailed = false;
    player.isCinematicLocked = false;
    if (aborted) player.isParrySkidding = false;
    if (!wasBoss) return;
    if (this.damageText) this.damageText.visible = false;
    if (target && !aborted && !failed) target.setKOBadgeVisible(true);
    cameraCtrl.endExecutionShot(player.position, player.rotationY + Math.PI);
    hud.endCinematicExecution(aborted || failed ? 0 : EXEC_RESULT_SHOW_MS, () => wantedSystem.releaseBannerHold());
  }

  // 蓄勢頂點：暫停並顯示時機計量表，綠區隨機擺放
  private startTakedownQte() {
    const { hud, input } = this.ctx;
    const target = this.execTarget;
    const isBoss = this.execMode === 'BOSS';
    this.qtePending = false;
    this.qteRunning = true;
    this.qteStartMs = performance.now();
    this.qteSweep = isBoss && target ? getTakedownQteSweep(target.hp) : MINION_QTE_SWEEP;
    this.qteZoneWidth = isBoss ? BOSS_QTE_ZONE : MINION_QTE_ZONE;
    this.qteZone = TAKEDOWN_QTE_ZONE_MIN + Math.random() * (TAKEDOWN_QTE_ZONE_MAX - this.qteZoneWidth - TAKEDOWN_QTE_ZONE_MIN);
    this.qteArmed = false;
    hud.showTakedownMeter(this.qteZone, this.qteZoneWidth, input.isTouchDevice ? '綠區內再按 [打]' : '綠區內再按 F / 左鍵');
    soundManager.playDodge(false, this.ctx.player.position);
  }

  // 游標位置 (0~1)：自左端出發來回擺動
  private getQteCursor(nowMs: number): number {
    const p = ((nowMs - this.qteStartMs) / 1000 / this.qteSweep) % 2;
    return p <= 1 ? p : 2 - p;
  }

  private isQteCursorInZone(nowMs: number): boolean {
    const c = this.getQteCursor(nowMs);
    return c >= this.qteZone && c <= this.qteZone + this.qteZoneWidth;
  }

  // 每幀更新計量表 (真實時間)：發動按鍵放開後才接受判定，逾時判定失誤
  private updateTakedownQte() {
    const { input, hud } = this.ctx;
    const now = performance.now();
    if (!this.qteArmed && !input.keys['KeyF'] && !input.mouseButtons.left) this.qteArmed = true;
    hud.updateTakedownMeter(this.getQteCursor(now));
    if ((now - this.qteStartMs) / 1000 >= TAKEDOWN_QTE_TIMEOUT) this.resolveTakedownQte(false);
  }

  // 判定結果：成功則動作繼續出手；失誤則目標回身格擋，玩家架起十字手準備承受震擊
  private resolveTakedownQte(success: boolean) {
    const target = this.execTarget;
    const { hud, player, wantedSystem, detention } = this.ctx;
    this.qteRunning = false;
    // 判定後立即收起計量表 (成功直接出手、失誤由橫幅提示)，避免與失誤橫幅同時停留畫面
    hud.hideTakedownMeter();
    if (success || !target) return;

    this.execFailed = true;
    const move = target.performTakedownParry(player.position);
    const guardTime = move.dur * move.strike;
    this.execDurations.PARRY = guardTime;
    player.performTakedownBlocked(target.position, guardTime);
    if (this.execMode === 'BOSS') {
      // 失誤橫幅立即播出 (不等運鏡結束)
      wantedSystem.releaseBannerHold();
      wantedSystem.showBanner('⚠️ 時機失誤！總教官格擋反震！', 2200);
    } else {
      // 守衛察覺並進入警戒追捕 (等同被目擊)
      detention.onPlayerAttackedGuard(target);
      wantedSystem.showBanner(`⚠️ 時機失誤！${target.getRoleTitle()}察覺並反擊！`, 2000);
    }
    this.execPhase = 'PARRY';
    this.execPhaseTime = 0;
  }

  // 格擋擊中：玩家向後滑退約 4m (遇牆即停)；總教官震掌扣 15 HP，守衛不扣血
  private applyParryHit(target: NPC) {
    const { player } = this.ctx;
    player.performParrySkid(target.position, EXEC_SKID_DIST, this.execDurations.SKID);
    requestCameraShake(this.execMode === 'BOSS' ? 0.35 : 0.2);
    soundManager.playBatHit(this.ctx.player.position);
    this.ctx.wantedSystem.notifyAttacked();
    if (this.execMode !== 'BOSS') return;
    // 運鏡鎖定期間玩家免疫傷害，暫時解除以結算格擋反震
    player.isCinematicLocked = false;
    const died = player.takeDamage(BOSS_PARRY_DAMAGE, '鐵面總長格擋反震');
    player.isCinematicLocked = true;
    if (died) {
      this.finishExecution(true);
      this.ctx.handlePlayerDeath('被鐵面總長格擋反震擊倒！');
    }
  }

  // 總教官頭頂浮起的傷害數字 (首次使用時建立，之後重複使用)
  private showDamageText(target: NPC) {
    if (!this.damageText) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const g = canvas.getContext('2d')!;
      g.font = '900 96px "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = '#1f0a0a';
      g.strokeText('-100', 128, 64);
      g.fillStyle = '#ff3b30';
      g.fillText('-100', 128, 64);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      this.damageText = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      this.damageText.scale.set(1.6, 0.8, 1);
      this.damageText.renderOrder = 999;
    }
    if (this.damageText.parent !== this.ctx.engine.scene) this.ctx.engine.scene.add(this.damageText);
    this.damageText.visible = true;
    this.updateDamageText(target);
  }

  // 傷害數字於倒地與後空翻階段緩慢上浮，後段淡出
  private updateDamageText(target: NPC) {
    const sprite = this.damageText;
    if (!sprite || !sprite.visible) return;
    const d = this.execDurations;
    const shown = this.execPhase === 'FALL' ? this.execPhaseTime : d.FALL + this.execPhaseTime;
    const u = Math.min(1, shown / (d.FALL + d.FLIP));
    sprite.position.set(target.position.x, target.baseFloorY + 1.9 + u * 0.5, target.position.z);
    (sprite.material as THREE.SpriteMaterial).opacity = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
  }

  // 滑鼠左鍵 / 手機攻擊鍵：投籃蓄力 / 單車鳴鈴 / 背後暗殺 / 揮動武器攻擊
  public readonly onAttack = () => {
    const { player, basketballGame, hud } = this.ctx;
    if (player.isDead || player.hp <= 0) return;

    if (this.ctx.currentWorldType === 'CAMPUS' && basketballGame.isHolding) {
      basketballGame.startCharging(hud);
      return;
    }

    if (this.ctx.currentRidingBike) {
      this.ctx.currentRidingBike.ringBell();
      return;
    }
    // 時機計量表：再按攻擊鍵停住游標判定
    if (this.qteRunning) {
      if (this.qteArmed) this.resolveTakedownQte(this.isQteCursorInZone(performance.now()));
      return;
    }
    // 暗殺動作期間鎖定攻擊；出招中提早按下則預先輸入下一段連招
    if (this.execPhase !== 'NONE') return;
    if (!player.canAttack) {
      player.attack();
      return;
    }

    // 第二世界：若處於守衛身後觸發暗殺擊昏
    const cqcTarget = this.ctx.detention.nearbyCqcTarget;
    if (this.ctx.currentWorldType === 'DETENTION' && cqcTarget && !cqcTarget.isKnockedDown) {
      this.performCqcTakedown();
      return;
    }

    // 傷害於招式命中時間點 (預備動作之後) 才結算，見 updatePlayerStrike
    player.attack();
  };

  // 每幀於玩家更新後呼叫：招式到達命中時間點時結算傷害 (暗殺運鏡中的出刀僅為動作)
  public updatePlayerStrike() {
    const { player } = this.ctx;
    const move = player.strikeMove;
    if (!move || this.execPhase !== 'NONE' || player.isDead) return;
    this.resolvePlayerHit(move, player.strikeIndex);
  }

  // 命中回饋：短暫停格 (額外擊縮短)，終結技主擊加長並震動鏡頭、其餘依招式 hitShake 震動
  private onPlayerHitLanded(move: KfMove, strikeIndex: number) {
    this.hitStop = strikeIndex > 0 ? HIT_STOP_EXTRA : move.finisher ? HIT_STOP_FINISHER : HIT_STOP;
    if (move.finisher && strikeIndex === 0) requestCameraShake(0.3);
    else if (move.hitShake > 0) requestCameraShake(move.hitShake);
  }

  // 同一招 (出招序號) 只通緝 / 提示一次：回傳本次是否應結算 (近戰傳入目前 moveSerial，投射物傳入發射當下序號)
  private takeCrimeSlot(serial: number): boolean {
    return this.crimeSlot.take(serial);
  }

  private takeFrontalSlot(serial: number): boolean {
    return this.frontalSlot.take(serial);
  }

  // 依命中序號分流：主擊沿用招式本身；終結技額外擊只扣血 (不擊飛、不觸發終結特效)；其餘額外擊為單體判定
  private resolvePlayerHit(move: KfMove, strikeIndex: number) {
    this.spawnSlashFx(move, strikeIndex);
    const route = strikeRoute(move, strikeIndex);
    if (route === 'AOE') this.resolveFinisherAoe(move, move.aoe!);
    else if (route === 'AOE_LIGHT') {
      _aoeLightOpts.mode = strikeHitMode(move, strikeIndex, this.ctx.player.weaponDef.lightPush ?? 0);
      _aoeLightOpts.dmgMul = strikeDmg(move, strikeIndex);
      _aoeLightOpts.index = strikeIndex;
      this.resolveFinisherAoe(move, move.aoe!, _aoeLightOpts);
    } else this.resolveSingleHit(move, strikeIndex);
  }

  // 斬痕特效 (命中判定前、揮空亦觸發)：招式 slashFx 'X' 於追擊 (左拍) 在面前交成 X 字光痕；
  // 突進斬 (fx 'DASH')：衝刺末段留下雙色光帶與地面風痕、收刀主擊於路徑中央爆出大型 X 字斬痕
  private spawnSlashFx(move: KfMove, strikeIndex: number) {
    this.slashFlashes = 0;
    this.slashCrosses = 0;
    if (!move.slashFx) return;
    const { player } = this.ctx;
    const weapon = player.activeWeapon;
    const colorR = WEAPON_FX_STYLES[weapon.fx.R].color;
    const colorL = WEAPON_FX_STYLES[weapon.fx.L].color;
    const pos = player.position;
    if (move.slashFx === 'X' && strikeIndex === 1) {
      slashFX.crossSlash(pos.x, pos.y + SLASH_X_HEIGHT, pos.z, player.rotationY, colorR, colorL);
    }
    if (move.fx !== 'DASH' || !move.lunge) return;
    const o = player.dashSerial === player.moveSerial ? player.dashOrigin : pos;
    if (strikeIndex === move.extraStrikes.length) {
      // 衝刺末段 (最後一次小擊)：光帶自起點掃到預估終點 (目前位置 + 剩餘突進)，兩條拍色光帶 + 一條地面風痕
      const frac = Math.min(1, Math.max(0, (move.lunge.to - move.extraStrikes[strikeIndex - 1]) / (move.lunge.to - move.lunge.from)));
      const ex = pos.x + Math.sin(player.rotationY) * move.lunge.dist * frac * DASH_BAND_REMAIN;
      const ez = pos.z + Math.cos(player.rotationY) * move.lunge.dist * frac * DASH_BAND_REMAIN;
      slashFX.dashBand(o.x, o.z, ex, ez, pos.y + 1.05, 0.28, colorR);
      slashFX.dashBand(o.x, o.z, ex, ez, pos.y + 0.55, 0.28, colorL);
      slashFX.dashBand(o.x, o.z, ex, ez, pos.y + 0.05, 0.75, mixWhiteHex(colorR, 0.55));
    } else if (strikeIndex === 0) {
      // 收刀主擊：路徑中央的大型 X 字斬痕 (長度隨實際突進距離)
      const len = Math.hypot(pos.x - o.x, pos.z - o.z);
      slashFX.crossAt((pos.x + o.x) / 2, pos.y + 1.1, (pos.z + o.z) / 2, player.rotationY, Math.min(2.2, 0.9 + len * 0.3), colorR, colorL);
    }
  }

  // 命中閃光：招式有 slashFx 者於受擊目標胸口出星芒 (每擊數量依品質上限)，右拍青綠、左拍櫻粉
  private spawnHitFlash(move: KfMove, strikeIndex: number, npc: NPC) {
    if (!move.slashFx || this.slashFlashes >= getFxQuality().flashPerStrike) return;
    this.slashFlashes++;
    const weapon = this.ctx.player.activeWeapon;
    slashFX.hitFlash(npc.position.x, npc.position.y + HIT_FLASH_HEIGHT, npc.position.z,
      WEAPON_FX_STYLES[strikeIndex % 2 === 1 ? weapon.fx.L : weapon.fx.R].color);
  }

  // 突進斬收刀爆點：每個命中者身上爆出 X 字斬痕 (數量依品質上限，與命中閃光共用上限)
  private spawnEnemyCross(move: KfMove, npc: NPC) {
    if (move.fx !== 'DASH' || this.slashCrosses >= getFxQuality().flashPerStrike) return;
    this.slashCrosses++;
    const weapon = this.ctx.player.activeWeapon;
    slashFX.crossAt(npc.position.x, npc.position.y + HIT_FLASH_HEIGHT, npc.position.z, this.ctx.player.rotationY, ENEMY_CROSS_HALF_LEN,
      WEAPON_FX_STYLES[weapon.fx.R].color, WEAPON_FX_STYLES[weapon.fx.L].color);
  }

  // 一般招式：只結算第一個命中者
  private resolveSingleHit(move: KfMove, strikeIndex: number = 0) {
    const { player, ecologicalGarden } = this.ctx;
    const reach = player.getWeaponReach() * move.reach;
    const baseDamage = player.getWeaponDamage() * strikeDmg(move, strikeIndex);
    const damage = Math.round(baseDamage);
    const knockback = player.getWeaponKnockback() * move.knock;
    const cap = player.activeWeapon.launchCap; // 武器 (含世界變體) 的擊飛上限，null = NPC 預設
    const lightPush = player.weaponDef.lightPush ?? 0;

    _scratchPlayerForward.set(Math.sin(player.rotationY), 0, Math.cos(player.rotationY)).normalize();

    // 1. 檢測是否命中生態園植物生物
    const plantHit = ecologicalGarden.tryHitByPlayer(player.position, reach, damage, _scratchPlayerForward);
    if (plantHit.hit) {
      this.onPlayerHitLanded(move, strikeIndex);
      this.reportPlantHit(plantHit, damage);
      return;
    }

    // 2. 檢測是否命中附近的 NPC (只結算第一個命中者；依招式攻擊範圍判定方向，旋身招式為全方位)
    for (const npc of this.ctx.npcs) {
      if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;
      const dx = npc.position.x - player.position.x;
      const dz = npc.position.z - player.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (npc.position.distanceTo(player.position) >= reach + 0.3) continue;
      if (move.arc > -1 && dist > 0.6 && (dx * _scratchPlayerForward.x + dz * _scratchPlayerForward.z) / dist < move.arc) continue;

      const spec = _meleeHitSpec;
      spec.src.copy(player.position);
      // 擊退方向：玩家指向目標 (旋身招式可擊中側後方目標)
      if (dist > 0.3) spec.dir.set(dx / dist, 0, dz / dist);
      else spec.dir.copy(_scratchPlayerForward);
      spec.useAttackDir = false;
      spec.damage = baseDamage;
      spec.dmgMul = 1;
      spec.knockback = knockback;
      // 僅連招終結技主擊可擊飛；非終結技 (含多段招式各擊) 命中只扣血 (武器設 lightPush 時改為推擊)，見 NPC.launchFlying
      spec.mode = strikeHitMode(move, strikeIndex, lightPush);
      spec.shoveDist = lightPush;
      spec.serial = player.moveSerial;
      spec.launchCap = cap;
      spec.ignoreCooldown = false;
      spec.fightNoise = true;
      spec.deferFrontal = false;
      spec.reportCrime = true;
      spec.move = move;
      spec.strikeIndex = strikeIndex;
      spec.feedback = 'SINGLE';
      this.applyPlayerHitToNpc(npc, spec);
      return;
    }
  }

  // 生態園生物受擊結算 (獎金 / 回血 / 橫幅)：近戰單體與投射物共用
  public reportPlantHit(plantHit: { name: string; defeated: boolean; isBoss: boolean }, damage: number) {
    const { player, wantedSystem, ecologicalGarden } = this.ctx;
    if (plantHit.isBoss) {
      if (plantHit.defeated) {
        this.ctx.progression.cash += 500;
        wantedSystem.showBanner('👑 狂賀！斬殺秘境霸主【變異食人花王】！獲得通關巨額獎金 +$500！', 6000);
        player.hp = Math.min(player.maxHp, player.hp + 50);
      } else {
        wantedSystem.showBanner(`💥 命中【變異食人花王】！造成 ${damage} 傷害！(Boss HP: ${Math.ceil(ecologicalGarden.boss.hp)})`, 1500);
      }
    } else if (plantHit.defeated) {
      this.ctx.progression.cash += 40;
      wantedSystem.showBanner(`🌿 斬除【${plantHit.name}】！獲得冒險獎勵 +$40！`, 2500);
    } else {
      wantedSystem.showBanner(`🌿 擊中【${plantHit.name}】！造成 ${damage} 傷害！`, 1500);
    }
  }

  // 玩家攻擊命中單一 NPC 的共用結算 (近戰單體 / 群攻 / 投射物)：校園圍觀、第二世界警戒 / 打鬥聲響 / 總教官護盾 /
  // 正面減傷 (傷害 ×0.6、擊退減半、出招間隔) 與總教官減傷、命中回饋、NPC 受擊 (擊飛 / 推擊 / 只扣血；防禦結果見 npc.lastHitResult)、
  // 擊倒結算與通緝 (依 spec.serial 每招一次)。零配置：spec 由呼叫端預配置重用。
  // 回傳 false = 總教官金鐘護盾無敵 (未命中、不出回饋；npc.lastHitResult 設為 BLOCKED)
  public applyPlayerHitToNpc(npc: NPC, spec: PlayerHitSpec): boolean {
    const { player, wantedSystem } = this.ctx;
    spec.frontalHit = false;
    let knockback = spec.knockback;
    let mult = spec.dmgMul;

    // 校園打人：附近同學依個性圍觀 / 起鬨 / 逃跑 / 叫老師 (打強盜可解救被勒索的同學)
    if (this.ctx.currentWorldType === 'CAMPUS') this.ctx.campusLife.onFight(npc);

    if (this.ctx.currentWorldType === 'DETENTION') {
      // 須於觸發警戒 (目標轉身) 前判定是否位於背後盲區 (近戰以玩家位置為來源；投射物可改傳行進方向)
      const isBehind = spec.useAttackDir
        ? isAttackFromBehind(npc, spec.attackDirX, spec.attackDirZ)
        : isBehindNpc(npc, spec.src.x, spec.src.z);
      this.ctx.detention.onPlayerAttackedGuard(npc);
      // 打鬥聲響：附近守衛前往察看
      if (spec.fightNoise) this.ctx.detention.emitFightNoise(spec.src);

      if (npc.role === 'DETENTION_BOSS') {
        if (npc.isBossInvulnerable || npc.bossInvulnerableTimer > 0) {
          wantedSystem.showBanner(`🛡️ 總教官處於受創金鐘護盾無敵中 (${npc.bossInvulnerableTimer.toFixed(1)}s)！免疫傷害！`, 1500);
          soundManager.playPunch(this.ctx.player.position);
          player.setAttackCooldown(FRONTAL_LOCK);
          npc.lastHitResult = 'BLOCKED';
          return false;
        }
        mult *= DETENTION_BOSS_DMG_MULT;
      }

      // 正面攻擊 (非背後盲區)：傷害 ×0.6、技能間隔 0.5 秒且擊退效果減半；總教官另承受一般攻擊傷害 ×0.5
      if (!isBehind) {
        mult *= DETENTION_FRONTAL_DMG_MULT;
        knockback *= 0.5;
        spec.frontalHit = true;
        if (!spec.deferFrontal) {
          player.setAttackCooldown(FRONTAL_LOCK);
          if (this.takeFrontalSlot(spec.serial)) wantedSystem.showBanner(FRONTAL_BANNER, 1600);
        }
      }
    }
    const damage = Math.max(1, Math.round(spec.damage * mult));

    const move = spec.move;
    if (move && spec.feedback !== 'NONE') {
      if (spec.feedback === 'SINGLE') this.onPlayerHitLanded(move, spec.strikeIndex);
      this.spawnHitFlash(move, spec.strikeIndex, npc);
      if (spec.feedback === 'AOE_FX') this.spawnEnemyCross(move, npc);
    }

    const cap = spec.launchCap;
    const ko = npc.launchFlying(spec.dir, knockback, damage, spec.mode === 'LAUNCH', spec.ignoreCooldown, true, cap?.h, cap?.v,
      spec.mode === 'SHOVE' ? spec.shoveDist : 0);
    if (ko) {
      this.handleNpcDefeated(npc, 'ATTACK', spec.reportCrime && this.takeCrimeSlot(spec.serial));
    } else {
      if (spec.reportCrime && this.takeCrimeSlot(spec.serial)) {
        wantedSystem.reportCrime(1, this.ctx.currentWorldType === 'DETENTION' ? '院內襲擊守衛' : '校園打架鬥毆');
      }
      npc.isChasing = true;
    }
    return true;
  }


  // 終結技特效觸發點 (命中判定前、揮空亦觸發)：point 為衝擊點 (下劈為棒尖水平位置 + 玩家腳底高度，旋身招式為玩家位置)，
  // grounded 為玩家是否著地；point 為共用暫存向量，需立即取用
  private onFinisherImpact(move: KfMove, point: THREE.Vector3, grounded: boolean) {
    const { player, ecologicalGarden, world } = this.ctx;
    if (!move.fx || !move.aoe) return;
    const q = getFxQuality();
    const p = _fxPoint.copy(point);
    const radius = move.aoe.radius * player.getWeaponReach();
    // 本招生效的武器套組決定特效樣式 (球棒 / 黃金棒 / 拳 / 警棍)
    const weapon = player.activeWeapon;
    const style = WEAPON_FX_STYLES[weapon.fx.R];
    const isCampus = this.ctx.currentWorldType === 'CAMPUS';
    const inPond = isCampus && ecologicalGarden.isInsideWishingPond(p);
    const inPool = isCampus && world.isInsideSwimmingPool(p);

    if (move.fx === 'SLAM') {
      soundManager.playFallHit(this.ctx.player.position);
      // 水中改用既有水花特效，不放裂痕與環
      if (inPond || inPool) {
        this.ctx.waterSplashVFX.triggerSplashBurst(p, player.rotationY, true, inPond ? player.swimSurfaceY : 0.25);
        return;
      }
      // 取衝擊點腳下實際地面 (樓梯 / 高台)；落差過大視為不在地面，只放環
      const gy = this.sampleGroundY(p.x, p.z, p.y);
      const onGround = grounded && p.y - gy <= FX_GROUND_TOLERANCE;
      if (onGround) p.y = gy;
      comboFinisherFX.groundSlam(p, radius, style, weapon.finisherFx.slamBolt === true, onGround);
      if (onGround) impactDust.burst(this.ctx.engine.scene, p, _fxNoDir.set(0, 0, 0), { count: q.debrisCount, upward: 2.2, spreadY: 0.2, life: 0.7, size: 1.5 });
      return;
    }

    // SPIN：拳腳 (旋風腿) 與警棍 (旋身橫打) 的腰高衝擊環；拳腳著地時補一圈落地環
    const fx = weapon.finisherFx;
    if (fx.feathers) comboFinisherFX.featherBurst(_fxFeatherPoint.set(p.x, p.y + FEATHER_HEIGHT, p.z), fx.featherColors);
    if (inPond || inPool) return;
    comboFinisherFX.spinWave(p, move.fx === 'DASH' ? DASH_RING_RADIUS : radius, p.y + (fx.waistY ?? 0), style,
      grounded ? fx.landRadius ?? 0 : 0, p.y, FX_FIST_LAND_DELAY);
  }

  // 取 (x, z) 腳下地面高度：與玩家落腳邏輯一致 (不高於 refY + 容許高度的最高水平面 / 坡道，預設 0)
  private sampleGroundY(x: number, z: number, refY: number): number {
    const near = queryColliders(this.ctx.activeColliders, x - 0.05, x + 0.05, z - 0.05, z + 0.05, _fxGroundNear);
    let gy = 0;
    for (let i = 0; i < near.length; i++) {
      const box = near[i];
      if (x <= box.min.x || x >= box.max.x || z <= box.min.z || z >= box.max.z) continue;
      if (box.isRamp && box.rampMinZ !== undefined && box.rampMaxZ !== undefined && box.rampYAtMinZ !== undefined && box.rampYAtMaxZ !== undefined) {
        const t = THREE.MathUtils.clamp((z - box.rampMinZ) / (box.rampMaxZ - box.rampMinZ), 0, 1);
        const rampY = box.rampYAtMinZ + t * (box.rampYAtMaxZ - box.rampYAtMinZ);
        if (rampY <= refY + 0.85 && rampY > gy) gy = rampY;
      } else if (box.max.y <= refY + 0.65 && box.max.y > gy) {
        gy = box.max.y;
      }
    }
    return gy;
  }

  // 群攻 (連段終結技或帶 aoe 的非終結技)：範圍內最近的數名目標 (生態園生物優先) 同時受擊；擊退依距圓心遠近衰減、方向自圓心放射
  // (LINE 長條沿面向推出)；主擊只有終結技擊飛 (strikeHitMode)，非終結技只扣血 (武器設 lightPush 時推擊)
  // opts：額外擊改為不觸發終結特效與群攻震動 / 橫幅 (小擊停格)，模式由呼叫端決定；未傳為主擊
  private resolveFinisherAoe(move: KfMove, aoe: NonNullable<KfMove['aoe']>, opts?: AoeStrikeOpts) {
    const { player, wantedSystem, ecologicalGarden } = this.ctx;
    const lightPush = player.weaponDef.lightPush ?? 0;
    const mode = opts ? opts.mode : strikeHitMode(move, 0, lightPush);
    const fx = opts ? opts.fx : true;
    const isDetention = this.ctx.currentWorldType === 'DETENTION';
    // 黃金棒類武器改讀招式上的黃金群攻欄位 (目標上限 / 停格 / 震動)
    const gold = player.weaponDef.useGoldAoe === true;
    const weaponReach = player.getWeaponReach();
    const radius = aoe.radius * weaponReach;
    const max = Math.min(AOE_CAP, gold ? aoe.maxGold ?? aoe.max : aoe.max);
    const baseDamage = player.getWeaponDamage() * (opts ? opts.dmgMul : move.dmg);
    const damage = Math.round(baseDamage);
    const knockback = player.getWeaponKnockback() * move.knock;
    const cap = player.activeWeapon.launchCap; // 武器 (含世界變體) 的擊飛上限，null = NPC 預設

    const fwd = _scratchPlayerForward.set(Math.sin(player.rotationY), 0, Math.cos(player.rotationY));
    const center = _scratchAoeCenter.copy(player.position);
    if (aoe.center === 'FRONT') center.addScaledVector(fwd, aoe.offset * weaponReach);
    // PATH：命中範圍為突進起點 → 目前位置的矩形 (半寬 = radius)；圓心取路徑中點供生態園圓形判定覆蓋整段
    const isPath = aoe.shape === 'PATH';
    const pathO = player.dashSerial === player.moveSerial ? player.dashOrigin : player.position;
    const pathLen = isPath ? Math.hypot(player.position.x - pathO.x, player.position.z - pathO.z) : 0;
    if (isPath) center.set((player.position.x + pathO.x) / 2, player.position.y, (player.position.z + pathO.z) / 2);
    // LINE：自玩家位置沿面向的長條 (長 len、半寬 halfWidth)；圓心取長條中點供生態園圓形判定
    const isLine = aoe.shape === 'LINE';
    const lineLen = isLine ? (aoe.len ?? 0) * weaponReach : 0;
    const lineHalfW = isLine ? (aoe.halfWidth ?? 0) * weaponReach : 0;
    if (isLine) center.set(player.position.x + fwd.x * lineLen / 2, player.position.y, player.position.z + fwd.z * lineLen / 2);
    // FAN：以 center 為頂點沿面向的扇形 (半徑 radius、半角 halfAngle)
    const isFan = aoe.shape === 'FAN';
    const fanCos = isFan ? Math.cos(aoe.halfAngle ?? Math.PI) : -1;

    // 特效衝擊點：下劈取棒尖水平位置 (高度貼齊玩家腳底)，旋身招式取玩家位置
    if (fx) {
      const point = _scratchFinisherPoint;
      if (move.fx === 'SLAM') player.getBatTipWorld(point).setY(player.position.y);
      else point.copy(player.position);
      this.onFinisherImpact(move, point, player.isGrounded);
    }

    // 1. 生態園生物 (不中斷，續判 NPC)
    const plantRadius = isPath ? pathLen / 2 + radius : isLine ? lineLen / 2 + lineHalfW : radius;
    // FAN / LINE：生態園生物改用同形狀判定 (圓形粗篩 + 扇形 / 長條精篩)
    let plantShape: PlantAoeShape | null = null;
    if (isFan) plantShape = _plantShape.set(0, player.position.x, player.position.z, fwd.x, fwd.z, fanCos, 0, 0);
    else if (isLine) plantShape = _plantShape.set(1, player.position.x, player.position.z, fwd.x, fwd.z, 0, lineLen, lineHalfW);
    const plantCount = ecologicalGarden.tryHitAllByPlayer(center, plantRadius, damage, max, _aoePlantHits, AOE_SECONDARY_DMG, plantShape);
    let bossBanner = false;
    let plantBanner = '';
    let plantBannerMs = 1500;
    for (let i = 0; i < plantCount; i++) {
      const r = _aoePlantHits[i];
      if (r.isBoss) {
        bossBanner = true;
        if (r.defeated) {
          this.ctx.progression.cash += 500;
          wantedSystem.showBanner('👑 狂賀！斬殺秘境霸主【變異食人花王】！獲得通關巨額獎金 +$500！', 6000);
          player.hp = Math.min(player.maxHp, player.hp + 50);
        } else {
          wantedSystem.showBanner(`💥 命中【變異食人花王】！造成 ${r.damage} 傷害！(Boss HP: ${Math.ceil(ecologicalGarden.boss.hp)})`, 1500);
        }
      } else if (r.defeated) {
        this.ctx.progression.cash += 40;
        plantBanner = `🌿 斬除【${r.name}】！獲得冒險獎勵 +$40！`;
        plantBannerMs = 2500;
      } else if (!plantBanner) {
        plantBanner = `🌿 擊中【${r.name}】！造成 ${r.damage} 傷害！`;
      }
    }

    // 2. NPC：水平距離 ≤ 半徑 + 寬容、高低差 < 1.5m，依距離保留最近者 (LINE 依沿長條距離)
    const npcMax = max - plantCount;
    let n = 0;
    const reachSq = (radius + AOE_REACH_GRACE) * (radius + AOE_REACH_GRACE);
    if (npcMax > 0) {
      for (const npc of this.ctx.npcs) {
        if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;
        if (Math.abs(npc.position.y - player.position.y) >= AOE_MAX_DY) continue;
        let d: number;
        if (isPath) {
          d = probePath(pathO.x, pathO.z, player.position.x, player.position.z, npc.position.x, npc.position.z, _pathProbe);
          if (d > radius + AOE_REACH_GRACE) continue;
        } else if (isLine) {
          d = probeLine(player.position.x, player.position.z, fwd.x, fwd.z, lineLen, lineHalfW + AOE_REACH_GRACE, npc.position.x, npc.position.z, _pathProbe);
          if (d < 0) continue;
        } else if (isFan) {
          d = probeFan(center.x, center.z, fwd.x, fwd.z, radius + AOE_REACH_GRACE, fanCos, npc.position.x, npc.position.z);
          if (d < 0) continue;
        } else {
          const dx = npc.position.x - center.x;
          const dz = npc.position.z - center.z;
          const dSq = dx * dx + dz * dz;
          if (dSq > reachSq) continue;
          d = Math.sqrt(dSq);
        }
        if (n === npcMax && d >= _aoeDist[n - 1]) continue;
        let i = n < npcMax ? n++ : npcMax - 1;
        while (i > 0 && _aoeDist[i - 1] > d) {
          _aoeDist[i] = _aoeDist[i - 1];
          _aoeHits[i] = _aoeHits[i - 1];
          i--;
        }
        _aoeDist[i] = d;
        _aoeHits[i] = npc;
      }
    }

    let hits = plantCount;
    let frontal = false;
    let firstKo: NPC | null = null;
    const falloffRange = isLine ? Math.max(lineLen, 0.001) : radius;
    const spec = _meleeHitSpec;
    for (let i = 0; i < n; i++) {
      const npc = _aoeHits[i]!;
      _aoeHits[i] = null;
      const d = _aoeDist[i];

      // 擊退方向：自圓心放射；下劈衝擊點後方目標去除向後分量並混入面向 (避免往玩家身後倒飛)；過近沿面向
      const dx = npc.position.x - center.x;
      const dz = npc.position.z - center.z;
      if (isPath) {
        // 突進路徑：自中心線往兩側外推，再加上沿突進方向的分量；貼近中心線時依序輪流往左右
        probePath(pathO.x, pathO.z, player.position.x, player.position.z, npc.position.x, npc.position.z, _pathProbe);
        if (d < AOE_MIN_DIST) _scratchImpactDir.set(fwd.z * (i % 2 === 0 ? 1 : -1), 0, -fwd.x * (i % 2 === 0 ? 1 : -1));
        else _scratchImpactDir.set((npc.position.x - _pathProbe[0]) / d, 0, (npc.position.z - _pathProbe[1]) / d);
        _scratchImpactDir.addScaledVector(fwd, PATH_FORWARD_PUSH).normalize();
      } else if (isLine) {
        _scratchImpactDir.copy(fwd); // 長條：沿面向推出
      } else if (d < AOE_MIN_DIST) {
        _scratchImpactDir.copy(fwd);
      } else {
        _scratchImpactDir.set(dx / d, 0, dz / d);
        const along = _scratchImpactDir.dot(fwd);
        if (aoe.center === 'FRONT' && along < 0) _scratchImpactDir.addScaledVector(fwd, AOE_BACK_BLEND - along).normalize();
      }

      // 主目標 (本招第一個命中者) 全額，其餘 ×0.8；擊退依距圓心遠近衰減
      spec.src.copy(player.position);
      spec.dir.copy(_scratchImpactDir);
      spec.useAttackDir = false;
      spec.damage = baseDamage;
      spec.dmgMul = hits === 0 ? 1 : AOE_SECONDARY_DMG;
      spec.knockback = knockback * (1 - aoe.falloff * Math.min(1, d / falloffRange));
      spec.mode = mode;
      spec.shoveDist = lightPush;
      spec.serial = player.moveSerial;
      spec.launchCap = cap;
      // 終結技無視受擊保護時間 (緊接前一段命中)，第二世界特訓群可被擊飛；額外擊只扣血
      spec.ignoreCooldown = true;
      spec.fightNoise = false; // 打鬥聲響、正面防禦提示與通緝於本招結算一次
      spec.deferFrontal = true;
      spec.reportCrime = false;
      spec.move = move;
      spec.strikeIndex = opts ? opts.index : 0;
      spec.feedback = fx ? 'AOE_FX' : 'AOE';
      if (!this.applyPlayerHitToNpc(npc, spec)) continue;
      hits++;
      if (spec.frontalHit) frontal = true;
      if (npc.lastHitResult === 'KO' && !firstKo) firstKo = npc;
    }

    // 每招一次的結算：命中回饋、打鬥聲響、正面防禦提示、通緝
    const npcHits = hits - plantCount;
    if (!fx) {
      if (hits > 0) {
        this.hitStop = HIT_STOP_EXTRA;
        if (move.hitShake > 0) requestCameraShake(move.hitShake);
      }
    } else if (hits > 0) {
      this.hitStop = gold ? aoe.hitStopGold ?? aoe.hitStop : hits >= 2 ? aoe.hitStopMulti : aoe.hitStop;
      requestCameraShake(gold ? aoe.shakeGold ?? aoe.shake : aoe.shake);
    } else if (aoe.missShake > 0) {
      requestCameraShake(aoe.missShake); // 揮空：只震不停格
    }
    if (isDetention && n > 0) this.ctx.detention.emitFightNoise(player.position);
    if (frontal) {
      player.setAttackCooldown(FRONTAL_LOCK);
      if (this.takeFrontalSlot(player.moveSerial)) wantedSystem.showBanner(FRONTAL_BANNER, 1600);
    }
    if (npcHits > 0 && this.takeCrimeSlot(player.moveSerial)) {
      wantedSystem.reportCrime(1, firstKo ? `${firstKo.getRoleTitle()}倒地` : isDetention ? '院內襲擊守衛' : '校園打架鬥毆');
    }
    // 橫幅優先序：生態園 Boss > 多人命中 > 單一植物 (額外擊不顯示多人命中)
    if (bossBanner) return;
    if (hits >= 2 && fx && move.finisher) wantedSystem.showBanner(`💥 ${move.name}！震倒 ${hits} 名目標`, 1200);
    else if (plantBanner) wantedSystem.showBanner(plantBanner, plantBannerMs);
  }

  // 潛行背後暗殺擊昏 / 刺客教條草堆伏擊
  private performCqcTakedown() {
    const { player, wantedSystem, hud, detention } = this.ctx;
    const target = detention.nearbyCqcTarget;
    if (!target || target.isKnockedDown || player.isDead) return;
    const isFromHiding = player.isHidingInCover;
    const coverName = player.currentHidingSpotName || '草堆';

    // 嚴格暗殺判定：若已被敵人發現 (! 警戒狀態)，完全無法發動暗殺！
    if (target.alertState === 'ALERT') {
      if (!isBossStunOpening(target)) {
        wantedSystem.showBanner('⚠️ 敵人已發現你 (! 狀態)！無法發動暗殺！需脫離視線或誘敵硬直！', 2000);
        return;
      }
    }

    if (target.role === 'DETENTION_BOSS') {
      if (target.isBossInvulnerable || target.bossInvulnerableTimer > 0) {
        wantedSystem.showBanner(`🛡️ 總教官處於金鐘護盾無敵中 (${target.bossInvulnerableTimer.toFixed(1)}s)！免疫暗殺與傷害！`, 1800);
        return;
      }

      // 命中前維持硬直，避免慢動作期間總教官恢復行動
      target.bossStunTimer = Math.max(target.bossStunTimer, 1.0);
      this.startExecution(target, 'BOSS', target.hp - 100 <= 0, isFromHiding);
    } else {
      // 守衛：快速暗殺動作，命中即永久昏迷 (擊昏數與提示於命中時結算)
      this.execCoverName = coverName;
      this.startExecution(target, 'MINION', false, isFromHiding);
    }

    detention.nearbyCqcTarget = null;
    hud.updateCqcPrompt(false);
  }

  // 統一 NPC 擊倒/擊敗結算 (獎金、成就解鎖、通緝與提示)
  // reportCrime：群攻一招擊倒多人時由呼叫端合併為一次通緝
  public handleNpcDefeated(npc: NPC, source: 'ATTACK' | 'BIKE' | 'FALL' = 'ATTACK', reportCrime: boolean = true) {
    const { progression, wantedSystem, tennisGame } = this.ctx;
    const isDetention = this.ctx.currentWorldType === 'DETENTION';
    // 第二世界：一般攻擊 (非暗殺) 擊倒計入正面擊倒數，賞金減半
    if (isDetention) this.ctx.detention.frontalKoCount++;
    const { reward, banner } = progression.recordDefeat(npc.role, false);
    if (banner) {
      wantedSystem.showBanner(banner.text, banner.duration);
    }
    if (npc.role === 'PE_TEACHER_BOSS' && tennisGame.tennisState !== 'IDLE') {
      tennisGame.endMatch(true, wantedSystem, this.ctx.hud, this.ctx.engine.scene, progression.addCash);
    }

    progression.addCash(reward);
    progression.checkSpecialBatUnlock();

    const sourceDesc = source === 'BIKE' ? '遭火柴人自行車強力撞飛' : source === 'FALL' ? '高處摔落' : '倒地';
    if (reportCrime) wantedSystem.reportCrime(1, `${npc.getRoleTitle()}${sourceDesc}`);
    // 連殺計數 (校園：達門檻後擲骰觸發主任教官傳送追捕)
    this.ctx.campus.onNpcDefeated();
    // 第二世界 NPC 倒地即永久昏迷，不會復活 (賞金已由專屬橫幅提示)
    if (isDetention) return;
    wantedSystem.showBanner(`${npc.getRoleTitle()} ${sourceDesc}！獲得獎金 +$${reward}！(10秒後復活)`, 3500);
  }

  // 火柴人自行車高速衝撞 NPC (每幀最多撞飛一人)
  public updateBikeRam(targetPosition: THREE.Vector3, bikeRotY: number) {
    const bike = this.ctx.currentRidingBike;
    if (!bike || Math.abs(bike.speed) <= 4.0) return;
    for (const npc of this.ctx.npcs) {
      if (npc.position.distanceTo(targetPosition) < 2.5 && !npc.isKnockedDown && !npc.isKnockedFlying && npc.hitCooldown <= 0) {
        const speed = Math.abs(bike.speed);
        const dmg = BIKE_RAM_DAMAGE;
        this.ctx.wantedSystem.reportCrime(2, '火柴人自行車高速衝撞師生');

        _scratchBikeForward.set(Math.sin(bikeRotY), 0, Math.cos(bikeRotY)).normalize();
        const relX = npc.position.x - targetPosition.x;
        const relZ = npc.position.z - targetPosition.z;
        const sideDot = -_scratchBikeForward.z * relX + _scratchBikeForward.x * relZ;
        const sideSign = sideDot >= 0 ? 1 : -1;
        _scratchBikeSideVec.set(-_scratchBikeForward.z, 0, _scratchBikeForward.x).multiplyScalar(sideSign * 0.45);
        _scratchBikeLaunchDir.copy(_scratchBikeForward).add(_scratchBikeSideVec).normalize();

        if (npc.launchFlying(_scratchBikeLaunchDir, speed, dmg)) {
          this.handleNpcDefeated(npc, 'BIKE');
        } else {
          this.ctx.wantedSystem.showBanner(`${npc.getRoleTitle()} 被火柴人自行車撞飛！`, 2000);
        }
        break;
      }
    }
  }

  private showDodgeBanner(text: string, advancedText: string, duration: number) {
    const isAdvanced = this.ctx.progression.isAdvancedDodge;
    this.ctx.wantedSystem.showBanner(isAdvanced ? advancedText : text, duration);
    soundManager.playDodge(isAdvanced, this.ctx.player.position);
  }

  // NPC 攻擊玩家判定 (含總教官衝撞命中、預警/眩暈提示)
  public updateNpcAttacks(targetPosition: THREE.Vector3, isSpawnGraceActive: boolean) {
    // 暗殺運鏡與時機計量表期間其他守衛暫停對玩家出手
    if (this.execPhase !== 'NONE') return;
    const { player, wantedSystem } = this.ctx;
    for (const npc of this.ctx.npcs) {
      if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;

      if (npc.role === 'DETENTION_BOSS') {
        // 總教官狂暴衝撞命中玩家判定
        if (npc.bossIsCharging && !player.isDead && npc.position.distanceTo(targetPosition) <= 2.2) {
          if (player.isDodging) {
            this.showDodgeBanner('💨 閃身步！極限側閃避開總教官衝撞！', '🐻 狗熊哆嗦毛！極限閃避總教官狂暴衝撞！', 1800);
          } else if (!player.tryAutoDodge()) {
            npc.bossIsCharging = false;
            npc.pauseTimer = 1.0;
            npc.isPaused = true;
            if (npc.bossTelegraphGroup) npc.bossTelegraphGroup.visible = false;
            this.ctx.detention.emitFightNoise(targetPosition);
            if (this.resistsHitWhileAttacking(true)) {
              if (this.applyDamageOnlyHit(BOSS_CHARGE_DAMAGE, '鐵面總長', `💥 硬吃總教官狂暴衝撞！出招不中斷！(-${BOSS_CHARGE_DAMAGE} HP)`)) {
                this.ctx.handlePlayerDeath('被鐵面總長狂暴衝撞擊潰！');
              }
            } else {
              soundManager.playPunch(this.ctx.player.position);
              soundManager.playBatHit(this.ctx.player.position);
              wantedSystem.showBanner(`💥 遭到總教官狂暴衝撞重創！擊飛！(-${BOSS_CHARGE_DAMAGE} HP)`, 2500);
              wantedSystem.notifyAttacked();
              if (player.launchFlying(npc.bossChargeDir, 16.0, 7.0, BOSS_CHARGE_DAMAGE, '鐵面總長')) {
                this.ctx.handlePlayerDeath('被鐵面總長狂暴衝撞擊潰！');
              }
            }
          }
        }

        // 總教官危險預警與眩暈狀態提示
        if (npc.isBossWindingUp && !this.wasBossWindingUp) {
          this.wasBossWindingUp = true;
          wantedSystem.showBanner('⚠️【危險警報】鐵面總長鎖定衝撞軌跡！立即側向閃避或引導撞柱！', 2200);
        } else if (!npc.isBossWindingUp) {
          this.wasBossWindingUp = false;
        }

        if (npc.isBossStunned && !this.wasBossStunned) {
          this.wasBossStunned = true;
          wantedSystem.showBanner('⚡ 總教官猛烈撞擊加固水泥柱！陷入 5 秒重度眩暈！快繞後刺殺！', 2500);
        } else if (!npc.isBossStunned) {
          this.wasBossStunned = false;
        }
      }

      // 人型 NPC 出招到達命中時間點：預備動作期間玩家已退出範圍或繞到側後方即落空
      const strike = npc.kfStrike;
      if (strike) {
        npc.kfStrike = null;
        if (!isSpawnGraceActive && !player.isDead && this.isNpcStrikeInRange(npc, targetPosition, strike)) {
          if (strike === NPC_GRAB_THROW || strike === NPC_RULER_FLURRY) this.applySignatureHit(npc, targetPosition, strike === NPC_GRAB_THROW);
          else this.applyNpcHit(npc, targetPosition, strike === NPC_SPINKICK);
        }
      }

      if (npc.isBossWindingUp || npc.bossIsCharging || npc.isBossStunned) continue;

      const distToPlayer = npc.position.distanceTo(targetPosition);
      const attackDist = this.getNpcAttackDist(npc);

      // 兩個世界皆僅在追捕狀態 (通緝或被激怒) 且進入攻擊距離時發動攻擊，第一世界 NPC 不會無故主動攻擊
      // 循聲察看中的守衛尚未確認敵蹤，不出手
      const shouldAttack = !isSpawnGraceActive && npc.isChasing && !npc.isInvestigatingNoise && distToPlayer <= attackDist;
      // 玩家被摔倒地期間不追打 (起身後再出手)
      if (player.knockdownTimer > 0) continue;
      // 校園執法者招牌技 (擒拿摔 3m 內撲抓、戒尺連打貼身)：追捕中冷卻完畢且未在出招時發動
      if (
        npc.isEnforcer && !isSpawnGraceActive && npc.isChasing && !player.isDead && npc.attackCooldown <= 0 &&
        !npc.isSurroundRepositioning && npc.lostSightTimer <= 0 && !npc.attackHold
      ) {
        const sig = npc.canStartSignature(distToPlayer, targetPosition.y - npc.position.y);
        if (sig) {
          npc.startSignature(sig, targetPosition);
          continue;
        }
      }
      // 多人包夾：繞行前往站位途中先不出手 (見 NPC.isSurroundRepositioning)；第一世界圍攻未持出手權杖者不出手 (見 AttackTokenCoordinator)
      if (!shouldAttack || player.isDead || npc.attackCooldown > 0 || npc.isSurroundRepositioning || npc.attackHold) continue;

      npc.attackCooldown = this.getNpcAttackInterval(npc);
      // 人型角色先播預備動作，傷害延後至命中時間點；犬類與單車糾察立即結算
      if (npc.triggerAttackAnimation()) continue;
      this.applyNpcHit(npc, targetPosition);
    }
  }

  // 第一世界依角色出手間隔 (執法者較快)；第二世界守衛處於警戒 (個體 ALERT 或全域 ALERT 階段) 時出手加快
  private getNpcAttackInterval(npc: NPC): number {
    if (this.ctx.currentWorldType !== 'DETENTION') return npc.attackInterval;
    return npc.alertState === 'ALERT' || this.ctx.detention.alertPhase === 'ALERT' ? NPC_ATTACK_INTERVAL_ALERT : NPC_ATTACK_INTERVAL;
  }

  private getNpcAttackDist(npc: NPC): number {
    return (this.ctx.currentWorldType === 'DETENTION') ? 2.0 : Math.max(1.8, npc.attackRange);
  }

  private isNpcStrikeInRange(npc: NPC, targetPosition: THREE.Vector3, move: KfMove): boolean {
    const reach = this.getNpcAttackDist(npc) * move.reach + NPC_STRIKE_REACH_GRACE;
    if (npc.position.distanceToSquared(targetPosition) > reach * reach) return false;
    if (move.arc <= -1) return true;
    const dx = targetPosition.x - npc.position.x;
    const dz = targetPosition.z - npc.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.6) return true;
    return (dx * Math.sin(npc.rotationY) + dz * Math.cos(npc.rotationY)) / dist >= NPC_STRIKE_ARC;
  }

  // 校園執法者招牌技命中結算：擒拿摔 20 傷害並摔倒 0.7 秒、戒尺連打每下 8 傷害 (各段分別判定)；
  // 閃身中落空；騎車中只扣血不摔車
  private applySignatureHit(npc: NPC, targetPosition: THREE.Vector3, isGrab: boolean) {
    const { player, wantedSystem } = this.ctx;
    if (player.tryAutoDodge()) return;
    if (player.isDodging) {
      this.showDodgeBanner(
        isGrab ? '💨 閃身步！掙脫主任教官擒拿摔！' : '💨 閃身步！避開生教組長戒尺！',
        isGrab ? '🐻 狗熊哆嗦毛！掙脫主任教官擒拿摔！' : '🐻 狗熊哆嗦毛！避開生教組長戒尺！',
        1500
      );
      return;
    }
    const title = npc.getRoleTitle();
    const damage = isGrab ? GRAB_THROW_DAMAGE : RULER_STRIKE_DAMAGE;
    wantedSystem.notifyAttacked();
    let died: boolean;
    if (!this.ctx.currentRidingBike && this.resistsHitWhileAttacking(true)) {
      soundManager.playPunch(this.ctx.player.position);
      died = player.takeDamage(damage, title);
      wantedSystem.showBanner(isGrab
        ? `🥋 硬吃主任教官擒拿！出招不中斷！(-${damage} HP)`
        : `📏 戒尺連打命中！出招不中斷！(-${damage} HP)`, 1500);
    } else if (this.ctx.currentRidingBike || !isGrab) {
      // 戒尺連打打斷玩家出招 (未出招時本就不影響)
      if (!isGrab && player.isAttacking) player.cancelAttack();
      soundManager.playPunch(this.ctx.player.position);
      died = player.takeDamage(damage, title);
      wantedSystem.showBanner(isGrab
        ? `🥋 遭到主任教官擒拿！穩住車身繼續騎行！(-${damage} HP)`
        : `📏 戒尺連打命中！(-${damage} HP)`, 1500);
    } else {
      _scratchImpactDir.subVectors(targetPosition, npc.position);
      _scratchImpactDir.y = 0;
      if (_scratchImpactDir.lengthSq() < 0.001) _scratchImpactDir.set(Math.sin(npc.rotationY), 0, Math.cos(npc.rotationY));
      else _scratchImpactDir.normalize();
      requestCameraShake(0.35);
      died = player.knockDown(_scratchImpactDir, damage, title, GRAB_THROW_DOWN_TIME);
      wantedSystem.showBanner(`🥋 被主任教官擒拿摔倒地！(-${damage} HP)`, 1800);
    }
    if (died) this.ctx.handlePlayerDeath(`被${title}逮捕擊倒！`);
  }

  // 玩家出招中 (霸體)：一般攻擊只扣血不打斷；大招有 BIG_MOVE_INTERRUPT_CHANCE 機率打斷 (照原效果結算)
  private resistsHitWhileAttacking(isBigMove: boolean): boolean {
    if (!this.ctx.player.isAttacking) return false;
    return !isBigMove || Math.random() >= BIG_MOVE_INTERRUPT_CHANCE;
  }

  // 只扣血不擊飛的命中結算 (沿用 0.55 秒受擊保護時間避免連續秒殺)，回傳是否死亡
  private applyDamageOnlyHit(damage: number, title: string, banner: string): boolean {
    const { player, wantedSystem } = this.ctx;
    if (player.hitCooldown > 0) return false;
    player.hitCooldown = 0.55;
    soundManager.playPunch(this.ctx.player.position);
    wantedSystem.showBanner(banner, 1500);
    wantedSystem.notifyAttacked();
    return player.takeDamage(damage, title);
  }

  // NPC 攻擊命中玩家結算 (閃避、騎車或出招中只扣血、擊飛)；isBigMove 為總教官迴旋踢
  private applyNpcHit(npc: NPC, targetPosition: THREE.Vector3, isBigMove: boolean = false) {
    const { player, wantedSystem } = this.ctx;
    if (player.tryAutoDodge()) return;
    if (player.isDodging) {
      this.showDodgeBanner('💨 閃身步！成功規避攻擊！', '🐻 狗熊哆嗦毛！神速規避攻擊！', 1500);
      return;
    }

    _scratchImpactDir.subVectors(targetPosition, npc.position);
    _scratchImpactDir.y = 0;
    if (_scratchImpactDir.lengthSq() < 0.001) {
      _scratchImpactDir.set(0, 0, 1);
    } else {
      _scratchImpactDir.normalize();
    }

    const specs = npc.getAttackSpecs();
    // 第二世界打鬥聲響：附近守衛前往察看
    if (this.ctx.currentWorldType === 'DETENTION') this.ctx.detention.emitFightNoise(targetPosition);
    // 騎車中被攻擊：只扣血不擊飛、不摔車 (沿用受擊保護時間避免連續秒殺)
    // 出招中被一般攻擊命中：只扣血，出招繼續
    const riding = !!this.ctx.currentRidingBike;
    if (riding || this.resistsHitWhileAttacking(isBigMove)) {
      const banner = riding
        ? `遭到${npc.getRoleTitle()}攻擊！穩住車身繼續騎行！`
        : `遭到${npc.getRoleTitle()}攻擊！出招不中斷！`;
      if (this.applyDamageOnlyHit(npc.attackPower, npc.getRoleTitle(), banner)) {
        this.ctx.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
      }
      return;
    }
    wantedSystem.showBanner(`遭到${npc.getRoleTitle()}重擊擊飛！`, 1500);

    wantedSystem.notifyAttacked();
    if (player.launchFlying(_scratchImpactDir, specs.hForce, specs.vForce, npc.attackPower, npc.getRoleTitle())) {
      this.ctx.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
    }
  }

  // 角色推擠排除：玩家與 NPC、NPC 與 NPC 互相推開 (玩家背後靠牆時由 NPC 全額退讓)
  public resolveCharacterSeparation() {
    const { player } = this.ctx;
    const npcs = this.ctx.npcs;
    const minDistance = 0.85;
    const minDistanceSq = minDistance * minDistance;
    const colliders = this.ctx.activeColliders;

    // 突進斬衝刺期間不推擠玩家 (穿過敵群)，落地後才恢復推擠
    if (!player.isRidingVehicle && !player.isDead && !player.isLunging) {
      const playerRadius = 0.35;
      const playerHeight = 1.8;
      const stepHeight = 0.65;

      for (const npc of npcs) {
        if (npc.isKnockedDown || npc.isKnockedFlying) continue;

        const dx = npc.position.x - player.position.x;
        const dz = npc.position.z - player.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minDistanceSq || distSq <= 0.0001) continue;

        const dist = Math.sqrt(distSq);
        const totalOverlap = minDistance - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // 檢測將玩家推向 (-nx, -nz) 是否會撞牆或嵌進建築/牆角
        const testPlayerX = player.position.x - nx * totalOverlap * 0.5;
        const testPlayerZ = player.position.z - nz * totalOverlap * 0.5;

        let playerBlockedX = false;
        let playerBlockedZ = false;

        const minX = Math.min(testPlayerX, player.position.x) - playerRadius;
        const maxX = Math.max(testPlayerX, player.position.x) + playerRadius;
        const minZ = Math.min(testPlayerZ, player.position.z) - playerRadius;
        const maxZ = Math.max(testPlayerZ, player.position.z) + playerRadius;

        const near = queryColliders(colliders, minX, maxX, minZ, maxZ, _separationNear);
        for (let i = 0; i < near.length; i++) {
          const box = near[i];
          if (box.isFloorOnly) continue;
          if (box.max.x < minX || box.min.x > maxX || box.max.z < minZ || box.min.z > maxZ) continue;
          if (player.position.y + playerHeight > box.min.y && player.position.y + stepHeight < box.max.y) {
            if (
              testPlayerX + playerRadius > box.min.x &&
              testPlayerX - playerRadius < box.max.x &&
              player.position.z + playerRadius > box.min.z &&
              player.position.z - playerRadius < box.max.z
            ) {
              playerBlockedX = true;
            }
            if (
              player.position.x + playerRadius > box.min.x &&
              player.position.x - playerRadius < box.max.x &&
              testPlayerZ + playerRadius > box.min.z &&
              testPlayerZ - playerRadius < box.max.z
            ) {
              playerBlockedZ = true;
            }
          }
        }

        // 若玩家身後靠牆或身處死角，玩家堅定不移，由 NPC 全額退讓，徹底杜絕被推擠卡進牆體
        player.position.x += playerBlockedX ? 0 : -nx * totalOverlap * 0.5;
        player.position.z += playerBlockedZ ? 0 : -nz * totalOverlap * 0.5;
        npc.position.x += playerBlockedX ? nx * totalOverlap : nx * totalOverlap * 0.5;
        npc.position.z += playerBlockedZ ? nz * totalOverlap : nz * totalOverlap * 0.5;

        player.mesh.position.copy(player.position);
        npc.mesh.position.copy(npc.position);
      }
    }

    for (let i = 0; i < npcs.length; i++) {
      const a = npcs[i];
      if (a.isKnockedDown || a.isKnockedFlying) continue;
      for (let j = i + 1; j < npcs.length; j++) {
        const b = npcs[j];
        if (b.isKnockedDown || b.isKnockedFlying) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minDistanceSq || distSq <= 0.0001) continue;

        const dist = Math.sqrt(distSq);
        const overlap = (minDistance - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;

        a.position.x -= nx * overlap;
        a.position.z -= nz * overlap;
        b.position.x += nx * overlap;
        b.position.z += nz * overlap;

        a.mesh.position.copy(a.position);
        b.mesh.position.copy(b.position);
      }
    }
  }
}
