import * as THREE from 'three';
import { soundManager } from '../../audio/SoundEffects';
import { slashFX } from '../../effects/SlashFX';
import { comboFinisherFX } from '../../effects/ComboFinisherFX';
import { swingTrail } from '../../effects/SwingTrail';
import { requestCameraShake } from '../../effects/cameraShake';
import { BossFX, PETAL_PALETTE_SUN, PETAL_PALETTE_ROSE } from '../../effects/BossFX';
import { SHADOW_DISTANCE } from '../../core/Engine';
import { FencerBoss, type FencerBossHost } from '../../entities/FencerBoss';
import { Sunflower } from '../../world/Sunflower';
import { BossArena } from '../../world/BossArena';
import type { PlantAoeShape } from '../../world/EcologicalGarden';
import type { CollidableBox } from '../../world/CampusWorld';
import type { GameContext } from '../GameContext';
import { BattleModeSwitch } from './BattleMode';
import { AwakeningStats, PlayerAwakening } from './PlayerAwakening';
import {
  FENCER, SunflowerTaunt, CombatRegen, victoryReward, BossLineGate, HeartVoice,
  fencerQuestStage, sunflowerStage, sunflowerPokeRange, SPROUT_AWARE_RANGE, victoryIsLong, VICTORY_FIRST, VICTORY_REPEAT, CHASE_LINE_MIN_FIGHT_SEC,
  DEFEAT_RESTORE_AT, DEFEAT_END_MIN, TRANSITION_LEAD_SEC, TRANSITION_TAIL_SEC, TRANSITION_PUSH_IN, TRANSITION_PUSH_TO,
  LINE_RULES, rematchIntroKey, rematchWinKey, transitionIsFull, dawnProgress, duskTargetLevel, duskColorAt,
  type BossDamageResult, type BossCue, type BarkKind
} from './fencerRules';
import { StoryPlayer, CutsceneInput, lineDuration, type StoryHandler, type StoryLine } from './storyPlayer';
import {
  INTRO_FIRST_BEATS, rematchIntroBeats, REMATCH_BOSS_LINE, REMATCH_HEART_LINE, REMATCH_LINE_AFTER_WIN, REMATCH_LINE_AFTER_LOSS,
  PLAYER_AWAKEN_BUBBLE, AWAKEN_BANNER,
  BOSS_OPEN_LINE, BOSS_OPEN_DELAY, BOSS_CUE_LINES, BOSS_BARK_LINES, BOSS_ONCE_LINES, BOSS_BARK_SEC, TRANSITION_BEATS, TRANSITION_BEATS_SHORT,
  MOVEMENT_BANNERS, DAWN_BOSS_LINE, FINAL_LOW_BOSS_LINE, DAWN_AT, FINAL_LOW_AT, HEART_LINES, HEART_TEACH_2, HEART_LOW_HP,
  HEART_CRITICAL_HP, VICTORY_FIRST_BEATS, VICTORY_SLEEPY_LINE, VICTORY_BANNER, PLAYER_WIN_BUBBLE,
  REMATCH_WIN_BOSS_LINE, DISCOVER_BANNER, DEFEAT_BOSS_LINES_BY_BAR, RESPAWN_HEART_LINES_BY_BAR, SUNFLOWER_AFTER_LOSS_LINE, SUNFLOWER_AFTER_LOSS_RANGE,
  SUNFLOWER_WATCH_RANGE, SUNFLOWER_DAILY_SEC, POKE_PROMPT, DODGE_TEACHER_EGG, BROADCAST,
  type DailyLine, type HeartLineId
} from './fencerStory';
import { loadFencerSave, storeFencerSave, STORY_SEEN } from './fencerSave';
import { safeTopNdc, shouldFitBubble } from './bubbleSafeArea';
import { buildRapier } from '../../weapons/models/rapierModel';
import { setConcealedById, showCutsceneOverlay } from '../../ui/uiConceal';

// 世界 Boss【花劍客】總控：太陽花戳戳 → 開戰過場 (清場 / 結界 / 暮紅異空間 / Boss 亮相 / 玩家向陽覺醒)
// → 三樂章戰鬥 (回血 / 脫戰快速回氣 / HUD) → 勝利 (獎勵、恢復) / 戰敗 (死亡前還原上限、恢復) / 中止 (切換世界)。
// 校園卸載 / 恢復集中在 BattleModeSwitch；玩家數值集中在 restorePlayerHp() (覺醒還原 + 上限還原同一函式)。

export type FencerPhase = 'IDLE' | 'INTRO' | 'FIGHT' | 'VICTORY' | 'DEFEAT';

/** main 提供的戰鬥模式接點 (NPC 名單切換) */
export interface FencerMainHooks {
  setNpcsSuspended(suspended: boolean): void;
}

// 過場 (開場 / 換樂章 / 首勝) 由 StoryPlayer 依台詞驅動：時長依字數、演出事件掛在 fencerStory 的句子上；
// 點擊 / 空白鍵 / Enter / E 前進下一句 (每句至少 0.6s)，長按 1s 跳過整段 (首戰開場也可)
type CutKind = 'INTRO' | 'VICTORY' | 'TRANSITION';
type CamStage = 'ORBIT' | 'SHOULDER' | 'FRONT' | 'BLEND';
const FIGHT_GRACE = 1.0;      // 開戰前 Boss 不出手秒數
const PUSH_SEC = 0.35;        // 換樂章玩家推離動畫秒數
const CUT_HINT_HTML = '<span class="cutscene-skip-key">點擊</span> 下一句・長按 1 秒跳過';
const DUSK_FOG_DENSITY = 0.014; // R23：對面牆約 40m 外，霧太濃會吃掉遠端預警
const BATTLE_SHADOW_EXTENT = 20;
const SPROUT_PETALS_GREEN = [0x6ccf5a, 0x8fd66b, 0x4fa642] as const;
const SEPARATION = 0.95;
const EMPTY_COLLIDERS: CollidableBox[] = [];

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();
const _final = new THREE.Vector3();
const _camObstacle = { x: 0, z: 0, r: 0.75, top: 2.5 };
const _vicMid = new THREE.Vector3();
const _vicSide = new THREE.Vector3();
const _tcCam = new THREE.Vector3();
const _tcLook = new THREE.Vector3();
const _pushFrom = new THREE.Vector3();
const _pushTo = new THREE.Vector3();
const cutNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const RAPIER_PROP_SCALE = 1.4; // 過場道具放大 (遠鏡頭看得清楚)
const RAPIER_STUCK_Y = 1.16 * RAPIER_PROP_SCALE - 0.25; // 劍尖 (本地 +1.16) 朝下插入草地約 0.25m
const RAPIER_BURIED_Y = RAPIER_STUCK_Y - 2.6;           // 整把埋在土裡 (校園草地遮住)
const RAPIER_RISE_SEC = 1.4;                            // 細劍自土裡升起秒數
const SOIL_PETALS = [0x7a5a3a, 0x5e8f3a, 0x8fd66b] as const;
// 異空間天色漸變速度 (等級 / 秒)：換樂章約 3s 轉完一段；首勝黎明較快
const DUSK_RATE = 0.35;
const DUSK_RATE_VICTORY = 0.9;
const BIG_HIT_REASONS = ['萬花華爾滋・終幕', '玫瑰荊棘十字'];

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export class FencerBossFight {
  public phase: FencerPhase = 'IDLE';
  public readonly taunt = new SunflowerTaunt();
  public readonly regen = new CombatRegen();
  public readonly stats = new AwakeningStats();
  public fightsStarted = 0;
  public sunflower!: Sunflower;
  private _discovered = false;
  private bubbleSafeTop: number | null = null;
  private bubbleSafeTimer = 0;
  public arena!: BossArena;
  public boss!: FencerBoss;
  public fx!: BossFX;
  public awakening!: PlayerAwakening;
  private rapierProp!: THREE.Object3D; // 首勝過場插地的玫瑰細劍
  private battle!: BattleModeSwitch;
  private hooks: FencerMainHooks | null = null;
  private timer = 0;
  private introSteps = 0;   // 已執行的過場步驟位元
  private savedWeather: Parameters<GameContext['weatherSystem']['setWeather']>[0] = 'SUNNY';
  private flashEl: HTMLDivElement | null = null;
  private wasFastRegen = false;
  private readonly bossHost: FencerBossHost;
  private initialized = false;
  // ----- 劇情 (文字見 fencerStory.ts；播放 / 計時見 storyPlayer.ts) -----
  private story: StoryPlayer | null = null;
  private cutKind: CutKind | null = null;
  private readonly cutInput = new CutsceneInput();
  private readonly storyHandler: StoryHandler;
  private camStage: CamStage = 'ORBIT';
  private camStageAt = 0;      // 進入此鏡頭段的過場時間
  private blendDur = 0.8;
  private cutT = 0;            // 過場內時間 (秒)
  private cutFirstFrame = false;
  private skipping = false;
  private rapierAt = 0;
  private pushPending = false;
  private pushT = 1;
  private defeatEnd = DEFEAT_END_MIN;
  private skipBadgeHtml: string | null = null;
  private readonly lineGate = new BossLineGate();
  private readonly heart = new HeartVoice();
  private transBar = 1;
  private fightFlags = 0;          // 1 = 開戰第一句已處理、2 = 第二則覺醒橫幅已出
  private skippedIntro = false;
  private longVictory = false;     // 首勝 7s 過場 (鎖操作)
  private bannersHeld = false;
  private defeatNotice = false;
  private followUp: DailyLine | null = null;
  private followUpTimer = 0;
  private dodgeEggShown = false;
  // ----- 劇情 v2 -----
  private lastBar = 0;              // 上一場結束時的樂章 (存檔)
  private storySeen = 0;            // STORY_SEEN 位元 (存檔)
  private flagNews = false;         // 社旗收線廣播已播 (存檔)
  private rematchBossLine = '';     // 本場再戰開場 Boss 那句 (跳過時補講)
  private teachFight = false;       // 本場要做回血教學 (第一次學)
  private usedRapier = false;
  private halfDone = 0;             // 位元：各樂章「過半」台詞已說
  private dawnDone = false;
  private finalLowDone = false;
  private s3At = -1;                // S3 起跳時間 (-1 = 不在 S3)
  private s3Hit = false;
  private lastBossHitAt = 0;
  private wasCritical = false;
  private pendingLossTaunt = false;
  private duskLevel = 0;
  private duskApplied = -1;
  private victoryDawn = false;
  private promptN = -1;
  private promptText = '';

  constructor(private readonly ctx: GameContext) {
    const self = this;
    this.storyHandler = {
      onLine: (_i, line, dur) => this.showBeat(line, dur),
      onEvent: (id) => this.onStoryEvent(id)
    };
    this.bossHost = {
      get playerPos() { return self.ctx.player.position; },
      get playerVel() { return self.ctx.player.velocity; },
      get playerDead() { return self.ctx.player.isDead; },
      get isTouch() { return self.ctx.input.isTouchDevice; },
      get playerOutOfCombat() { return self.regen.outOfCombat; },
      damagePlayer: (amount, dir, h, v, reason) => this.damagePlayer(amount, dir, h, v, reason),
      onBossDamaged: (res, point) => this.onBossDamaged(res, point),
      shake: (a) => requestCameraShake(a),
      hitStop: (s) => this.ctx.combat.requestHitStop(s),
      onCue: (cue) => this.onBossCue(cue)
    };
  }

  /** 世界與玩家建立後呼叫一次 (太陽花加入校園場景群組並登記碰撞盒；結界 / Boss / 特效掛在場景根) */
  public init(hooks: FencerMainHooks) {
    if (this.initialized) return;
    this.initialized = true;
    this.hooks = hooks;
    const { engine, world, ecologicalGarden, player } = this.ctx;
    this.sunflower = new Sunflower(world.group, FENCER.CENTER_X, FENCER.CENTER_Z);
    const sunflowerBox = {
      min: new THREE.Vector3(FENCER.CENTER_X - 0.25, 0, FENCER.CENTER_Z - 0.25),
      max: new THREE.Vector3(FENCER.CENTER_X + 0.25, 2.2, FENCER.CENTER_Z + 0.25)
    };
    world.colliders.push(sunflowerBox);
    this.sunflower.bindCollider(sunflowerBox); // 碰撞盒隨成長調整 (小苗幾乎不擋路)
    this.arena = new BossArena(FENCER.ARENA_X, FENCER.ARENA_Z, FENCER.ARENA_R);
    this.fx = new BossFX();
    this.boss = new FencerBoss(this.bossHost, this.fx);
    this.awakening = new PlayerAwakening(engine.scene, player);
    this.bindCutsceneInput();
    this.rapierProp = buildRapier().parts.R!;
    this.rapierProp.visible = false;
    this.rapierProp.scale.setScalar(RAPIER_PROP_SCALE);
    engine.scene.add(this.arena.group, this.boss.container, this.fx.group, this.rapierProp);
    this.battle = new BattleModeSwitch({
      actorsDetach: () => [ecologicalGarden.group, ...this.ctx.campusNPCs.map((n) => n.mesh)],
      actorsHide: () => [...this.ctx.bicycles.map((b) => b.mesh), this.ctx.basketballGame.basketballMesh],
      worldDetach: () => [world.group]
    });
    void player;
    this.loadSave();
  }

  // ===== 存檔 (劇情進度旗標) =====

  private loadSave() {
    const s = loadFencerSave();
    const { progression } = this.ctx;
    this.fightsStarted = s.fightsStarted;
    progression.fencerDefeated = s.defeated;
    progression.fencerWins = s.wins;
    this.taunt.lastResult = s.lastResult;
    this.taunt.pokes = s.pokes;
    this.taunt.warmLineShown = s.warmLineShown;
    this.dodgeEggShown = s.dodgeEggShown;
    this._discovered = s.discovered;
    this.lastBar = s.lastBar;
    this.storySeen = s.storySeen;
    this.flagNews = s.flagNews;
    this.taunt.flagNewsHeard = s.flagNews;
    this.sunflower.setGrowth(sunflowerStage(s.pokes, s.lastResult), true);
    if (s.lastResult === 'WIN') this.sunflower.resetPose('SLEEPY');
  }

  private persist() {
    const { progression } = this.ctx;
    storeFencerSave({
      fightsStarted: this.fightsStarted, defeated: progression.fencerDefeated, wins: progression.fencerWins,
      lastResult: this.taunt.lastResult, pokes: this.taunt.pokes, warmLineShown: this.taunt.warmLineShown,
      dodgeEggShown: this.dodgeEggShown, discovered: this._discovered,
      lastBar: this.lastBar, storySeen: this.storySeen, flagNews: this.flagNews
    });
  }

  /** 已發現怪苗 (第一次戳到才為 true；發現前大地圖 / 任務看板 / 小地圖都不顯示) */
  public get discovered(): boolean {
    return this._discovered;
  }

  /** 太陽花目前成長階段 0~10 */
  public get growthStage(): number {
    return this.initialized ? this.sunflower.growthStage : 0;
  }

  /** 任務看板 / 大地圖揭露段：0 未知、1 已遭遇、2 已首勝 */
  public get questStage(): 0 | 1 | 2 {
    return fencerQuestStage(this.fightsStarted, this.ctx.progression.fencerDefeated);
  }

  /** 閃身步老師彩蛋 (首勝後對話視窗句末接一句)；第一次看到時記錄存檔 */
  public dodgeEggLine(): string | undefined {
    if (!this.initialized || !this.ctx.progression.fencerDefeated) return undefined;
    if (!this.dodgeEggShown) {
      this.dodgeEggShown = true;
      this.persist();
    }
    return DODGE_TEACHER_EGG;
  }

  /** 保健室復活後：剛輸給花劍客才回傳向陽之心的鼓勵 (取一次即清除) */
  public consumeDefeatNotice(): string | null {
    if (!this.defeatNotice) return null;
    this.defeatNotice = false;
    return RESPAWN_HEART_LINES_BY_BAR[Math.max(0, Math.min(2, this.lastBar))];
  }

  /** 全校廣播插播 (CampusMode 廣播台呼叫)：首勝後第一次必播社旗收線 (存檔)，之後偶爾插播後日談；null = 照一般輪播 */
  public nextBroadcast(rng: () => number = Math.random): string | null {
    if (!this.initialized || !this.ctx.progression.fencerDefeated) return null;
    if (!this.flagNews) {
      this.flagNews = true;
      this.taunt.flagNewsHeard = true;
      this.persist();
      return BROADCAST.afterWinOnce;
    }
    if (rng() >= BROADCAST.afterWinChance) return null;
    return rng() < 0.5 ? BROADCAST.afterWin : BROADCAST.afterWinMower;
  }

  // ===== 狀態 =====

  public get isActive(): boolean {
    return this.phase !== 'IDLE';
  }

  /** 校園已卸載 (戰鬥模式)：main 依此略過校園系統更新 */
  public get isBattleMode(): boolean {
    return this.initialized && this.battle.active;
  }

  /** 鎖操作的過場 (開戰 / 換樂章 / 首勝)：main 期間只跑 updateCutscene + render */
  public get isCutscene(): boolean {
    return this.phase === 'INTRO' || (this.phase === 'VICTORY' && this.longVictory) || this.cutKind === 'TRANSITION';
  }

  /** 目前過場是否可跳過 (所有花劍客過場都可長按跳過) */
  public get canSkip(): boolean {
    return this.isCutscene && this.story !== null;
  }

  /** 戰鬥模式中玩家 / 投射物使用的碰撞盒 (結界內無障礙物，邊界由圓形夾回處理) */
  public get battleColliders(): CollidableBox[] {
    return EMPTY_COLLIDERS;
  }

  /** 投射物 / 鏡頭的圓形邊界 (結界升起期間) */
  public get arenaBound(): { x: number; z: number; r: number } | null {
    if (!this.isActive || this.phase === 'INTRO' || this.arena.anim === 'DOWN') return null;
    return ARENA_BOUND;
  }

  // ===== 太陽花互動 =====

  public canPoke(pos: THREE.Vector3): boolean {
    if (!this.initialized || this.phase !== 'IDLE' || !this.sunflower.root.visible) return false;
    const { player, racingGame, tennisGame, campus } = this.ctx;
    if (player.isDead || player.isSwimming || this.ctx.currentRidingBike) return false;
    if (racingGame.isRacingTrack || racingGame.isSwimmingRace || tennisGame.tennisState !== 'IDLE' || campus.elevatorTransition) return false;
    const dx = pos.x - FENCER.CENTER_X;
    const dz = pos.z - FENCER.CENTER_Z;
    const range = sunflowerPokeRange(this.sunflower.growthStage);
    return dx * dx + dz * dz < range * range && Math.abs(pos.y) < 1.5;
  }

  public pokePromptText(): string {
    const t = this.taunt;
    if (t.lastResult === 'LOSS') return POKE_PROMPT.afterLoss;
    if (t.lastResult === 'WIN') return t.isArmed(performance.now() / 1000) ? POKE_PROMPT.afterWinArmed : POKE_PROMPT.afterWinIdle;
    if (t.pokes === 0) return POKE_PROMPT.undiscovered;
    if (t.pokes !== this.promptN) {
      // 依進度烘托氣氛 (小苗 → 花苞 → 追問 → 警告)；只在計數變動時組字串
      this.promptN = t.pokes;
      const fmt = t.pokes >= 9 ? POKE_PROMPT.warn : t.pokes >= 7 ? POKE_PROMPT.tense : t.pokes >= 4 ? POKE_PROMPT.bud : POKE_PROMPT.calm;
      this.promptText = fmt(t.pokes, FENCER.TAUNT_COUNT);
    }
    return this.promptText;
  }

  public poke(): boolean {
    const res = this.taunt.poke(performance.now() / 1000);
    if (!res.accepted || !res.line) return true;
    this.sunflower.react(res.line.reaction, res.line.face, this.ctx.player.position);
    // 首次戳到 = 發現：短音效 + 橫幅；之後任務看板 / 大地圖才出現
    if (!this._discovered) {
      this._discovered = true;
      soundManager.playWantedClearChime();
      this.ctx.wantedSystem.showBanner(DISCOVER_BANNER.text, DISCOVER_BANNER.ms);
      this.persist();
    }
    // 成長：戳一下長大一階 (彈簧動畫) + 幾片葉子 / 草屑；第 10 下綻放由開戰過場的花瓣爆發接續
    if (res.index > 0) {
      this.sunflower.setGrowth(sunflowerStage(this.taunt.pokes, this.taunt.lastResult));
      if (res.index < FENCER.TAUNT_COUNT) {
        this.fx.petalBurst(FENCER.CENTER_X, 0.1 + res.index * 0.12, FENCER.CENTER_Z, 4 + res.index, 1.4, SPROUT_PETALS_GREEN, 1.2, 0.5);
      } else {
        this.fx.petalBurst(FENCER.CENTER_X, 1.8, FENCER.CENTER_Z, 60, 5, PETAL_PALETTE_SUN, 2.5);
      }
    }
    this.sunflower.say(res.line.text, res.startFight ? 2.2 : res.daily ? SUNFLOWER_DAILY_SEC : 3.0);
    if (res.line.reaction === 'STIFFEN_HUM') soundManager.playBarrierHum(this.sunflower.position);
    else soundManager.playPetalBloom(this.sunflower.position);
    // 首勝後日常台詞：溫情句 2.6s 後接話；溫情句只出現一次 (存檔)
    this.followUp = res.followUp;
    this.followUpTimer = SUNFLOWER_DAILY_SEC;
    if (res.followUp || res.index > 0) this.persist();
    // 第 10 句不另出橫幅 (開場字幕第一拍即同一句；過場期間橫幅一律暫存)
    if (res.startFight) this.startIntro();
    return true;
  }

  // ===== 開戰過場 =====

  private startIntro() {
    const { player, basketballGame, hud, wantedSystem } = this.ctx;
    this.fightsStarted++;
    this.phase = 'INTRO';
    this.timer = 0;
    this.introSteps = 0;
    this.followUp = null;
    this.skippedIntro = false;
    const key = rematchIntroKey({
      lastResult: this.taunt.lastResult, wins: this.ctx.progression.fencerWins, lastBar: this.lastBar, hasRapier: player.currentWeapon === 'RAPIER'
    });
    this.rematchBossLine = REMATCH_BOSS_LINE[key];
    const lines = this.fightsStarted <= 1 ? INTRO_FIRST_BEATS : rematchIntroBeats(
      this.taunt.lastResult === 'WIN' ? REMATCH_LINE_AFTER_WIN : REMATCH_LINE_AFTER_LOSS,
      this.rematchBossLine,
      key === 'lossFinal' ? REMATCH_HEART_LINE.lossFinal : REMATCH_HEART_LINE.normal
    );
    this.cutKind = 'INTRO';
    this.cutT = 0;
    this.skipping = false;
    this.setCamStage('ORBIT');
    this.holdBanners();
    this.persist();
    this.ctx.forceDismount();
    if (basketballGame.isHolding) basketballGame.drop(player, hud, wantedSystem);
    this.ctx.combat.resetTransientState(); // 中止出招、投射物、彈弓 / 籃球
    swingTrail.reset();
    wantedSystem.clearWanted();
    if (hud.isTennisDialogOpen) hud.closeTennisDialog();
    if (hud.isDodgeDialogOpen) hud.closeDodgeDialog();
    if (hud.isCommissaryOpen) hud.closeCommissary();
    hud.hidePrompt();
    player.isCinematicLocked = true;
    player.poisonTimer = 0;
    // 玩家站到太陽花南側 14m 面向花 (結界內)
    player.position.set(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 14);
    player.velocity.set(0, 0, 0);
    player.knockVelocity.set(0, 0, 0);
    player.isKnockedFlying = false;
    player.rotationY = Math.PI;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, Math.PI, 0);
    this.setCutsceneUi(true, true);
    this.story = new StoryPlayer(lines, this.storyHandler);
  }

  /** 過場每幀 (main 於過場期間只跑這裡 + render)：先處理點擊前進 / 長按跳過 */
  public updateCutscene(dt: number) {
    if (this.cutInput.update(cutNow()) === 'SKIP') { this.skipCutscene(); return; }
    this.updateSkipBadge();
    if (this.cutKind === 'TRANSITION') { this.updateTransitionCut(dt); return; }
    if (this.phase === 'VICTORY' && this.longVictory) { this.updateVictoryCutscene(dt); return; }
    if (this.phase !== 'INTRO') return;
    this.timer += dt;
    this.cutT += dt;
    this.story?.update(dt);
    this.sunflower.update(dt);
    this.arena.update(dt);
    this.boss.update(dt);
    this.fitBossBubble(dt);
    this.fx.update(dt);
    comboFinisherFX.update(dt, this.ctx.cameraCtrl.camera);
    slashFX.update(dt, this.ctx.cameraCtrl.camera);
    this.awakening.update(dt, this.ctx.player.position, false);
    this.ctx.player.updateSkillBubble(dt);
    this.updateCutsceneCamera();
    if (this.story?.done) this.finishIntro();
  }

  /** 顯示一句：字幕列一律顯示 (螢幕座標，保證在畫面內)；BOSS 另出 Boss框、PLAYER 另出玩家頭頂框 */
  private showBeat(b: StoryLine, dur: number) {
    if (b.who === 'PLAYER') {
      this.ctx.player.showSkillBubble(b.text, false);
      this.subtitle(b.text.startsWith('（') ? b.text : `（${b.text}）`);
    } else if (b.who === 'BOSS') {
      this.boss.say(b.text, dur);
      this.subtitle(`🎩「${b.text}」`);
    } else this.subtitle(b.text);
  }

  /** 台詞事件 (id 見 fencerStory 檔頭)：依目前過場分派 */
  private onStoryEvent(id: string) {
    if (this.cutKind === 'INTRO') {
      if (id === 'PETALS' && this.step(1)) {
        this.sunflower.setSpin(18);
        this.fx.petalBurst(FENCER.CENTER_X, 1.8, FENCER.CENTER_Z, 120, 7, PETAL_PALETTE_SUN, 3);
      } else if (id === 'FLASH') {
        if (this.step(2)) this.stepUnloadActors();
      } else if (id === 'WALL_UP') {
        if (this.step(2)) this.stepUnloadActors();
        if (this.arena.anim === 'RISING') this.arena.update(10); // 前進 / 跳過時結界直接升滿再卸載校園
        if (this.step(4)) this.stepUnloadWorld();
        this.setCamStage('SHOULDER');
      } else if (id === 'BOSS') {
        if (this.step(8)) this.stepBossAppear();
      } else if (id === 'AWAKEN') {
        if (this.step(16)) this.stepAwaken(this.skipping);
        this.setCamStage('FRONT');
      } else if (id === 'BLEND') {
        this.setCamStage('BLEND');
      }
    } else if (this.cutKind === 'VICTORY') {
      if (id === 'FACE' && this.step(128)) {
        // 玩家轉向 Boss 回禮
        const player = this.ctx.player;
        player.rotationY = Math.atan2(this.boss.position.x - player.position.x, this.boss.position.z - player.position.z);
        player.mesh.rotation.set(0, player.rotationY, 0);
      } else if (id === 'DISSOLVE') {
        this.boss.dissolveNow();
        this.victoryDawn = true; // 暮色散去：天色轉晨金
      } else if (id === 'OUTRO' && this.step(256)) {
        this.awakening.playOutro(); // 胸口的光 (日輪花瓣) 飛回太陽花
      } else if (id === 'RESTORE' && this.step(32)) {
        this.restoreAfterVictory(false);
      } else if (id === 'RAPIER' && this.step(512)) {
        this.rapierAt = this.cutT;
        this.riseRapier();
      } else if (id === 'FLOWER') {
        // 太陽花轉頭看玩家
        this.sunflower.react('TURN_TO', 'BLANK', this.ctx.player.position);
      } else if (id === 'BLEND') {
        this.setCamStage('BLEND');
      }
    }
  }

  private setCamStage(stage: CamStage) {
    if (this.camStage === stage && stage !== 'ORBIT') return;
    this.camStage = stage;
    this.camStageAt = this.cutT;
    if (stage === 'BLEND' && this.story) this.blendDur = Math.max(0.3, this.story.total - this.story.elapsed);
  }

  private step(bit: number): boolean {
    if (this.introSteps & bit) return false;
    this.introSteps |= bit;
    return true;
  }

  // 1.0s 白閃：同一幀卸載 NPC / 腳踏車 / 生態園；結界開始升起
  private stepUnloadActors() {
    this.whiteFlash();
    this.hooks?.setNpcsSuspended(true);
    this.battle.unloadActors();
    this.ctx.weatherSystem.hideParticles();
    this.ctx.hud.setRadarSuspended(true);
    this.arena.rise();
    this.arena.setFloorVisible(true);
    soundManager.playBarrierHum(_v.set(FENCER.CENTER_X, 0, FENCER.CENTER_Z));
    requestCameraShake(0.25);
  }

  // 2.5s 結界升滿：卸載校園靜態場景、背景與霧切暮紅、陰影範圍縮小
  private stepUnloadWorld() {
    const { engine, weatherSystem } = this.ctx;
    this.battle.unloadWorld();
    this.savedWeather = weatherSystem.targetWeather;
    weatherSystem.setWeather('SUNNY', false, false);
    weatherSystem.hideParticles();
    const fog = engine.scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = DUSK_FOG_DENSITY;
    this.duskLevel = 0;
    this.duskApplied = -1;
    this.victoryDawn = false;
    this.applyDusk(); // 暮紅 (DUSK_LEVELS[0])
    engine.setShadowExtent(BATTLE_SHADOW_EXTENT);
    this.ctx.cameraCtrl.arenaBound = ARENA_CAMERA_BOUND;
    this.sunflower.setSpin(0);
    this.fx.petalTornado(FENCER.CENTER_X, FENCER.CENTER_Z, 2.0, 120, PETAL_PALETTE_ROSE, 2.0);
  }

  private stepBossAppear() {
    const p = this.ctx.player.position;
    this.boss.resetForFight(FENCER.CENTER_X, FENCER.CENTER_Z);
    this.boss.beginIntro(Math.atan2(p.x - FENCER.CENTER_X, p.z - FENCER.CENTER_Z));
    this.ctx.hud.setBossHealth(FENCER.BAR_HP, FENCER.BAR_HP, false);
  }

  // 4.5s 玩家向陽覺醒 (數值立即套用；跳過時直接套用常駐視覺)
  private stepAwaken(instant: boolean) {
    const { player } = this.ctx;
    this.stats.apply(player);
    this.regen.reset();
    this.heart.resetFight();
    this.lineGate.resetFight();
    this.resetFightStory();
    if (instant) this.awakening.applyInstant();
    else this.awakening.playIntro();
    player.showSkillBubble(PLAYER_AWAKEN_BUBBLE, true);
  }

  // 開場鏡頭 (依台詞事件分段)：環繞太陽花 → (WALL_UP) 玩家肩後看 Boss 亮相 → (AWAKEN) 玩家正面中景 → (BLEND) 混回玩家身後
  private updateCutsceneCamera() {
    const cam = this.ctx.cameraCtrl.camera;
    const p = this.ctx.player.position;
    const cx = FENCER.CENTER_X;
    const cz = FENCER.CENTER_Z;
    const st = this.cutT - this.camStageAt;
    if (this.camStage === 'ORBIT') {
      // 環繞特寫太陽花 (慢速；拉長的台詞不會繞太多圈)
      const t = Math.min(this.cutT, 4);
      const a = 0.35 + t * 0.3;
      _cam.set(cx + Math.sin(a) * 6.5, 2.6 + t * 0.3, cz + Math.cos(a) * 6.5);
      _look.set(cx, 1.6, cz);
    } else if (this.camStage === 'SHOULDER') {
      // 玩家肩後看向 Boss 現身處 (太陽花位置)
      const k = smooth(st / 0.8);
      _cam.set(p.x + 2.2, 2.2 + 0.6 * (1 - k), p.z + 3.6 - k * 7.5);
      _look.set(cx, 1.5 + (1 - k) * 0.6, cz);
    } else if (this.camStage === 'FRONT') {
      // 玩家正面中景 (變身)
      const k = smooth(st / 1.5);
      _cam.set(p.x + 1.6, 1.5 + k * 0.4, p.z - 4.6 + k * 0.5);
      _look.set(p.x, 0.9 + k * 0.2, p.z);
    } else {
      // 混回玩家身後 (與 resetBehind 相同公式，結束時無跳切)
      this.behindCamPos(_final);
      const k = smooth(st / this.blendDur);
      _cam.set(p.x + 1.6, 1.9, p.z - 4.1).lerp(_final, k);
      _cam.y += Math.sin(k * Math.PI) * 1.5; // 弧形升高繞過角色頭頂
      _look.set(p.x, 1.1 + 0.25 * k, p.z);
    }
    cam.position.copy(_cam);
    cam.lookAt(_look);
  }

  private behindCamPos(out: THREE.Vector3): THREE.Vector3 {
    const p = this.ctx.player.position;
    const yaw = this.ctx.player.rotationY + Math.PI;
    const pitch = 0.25;
    const dist = this.ctx.cameraCtrl.targetDistance;
    return out.set(p.x + Math.sin(yaw) * Math.cos(pitch) * dist, p.y + 1.35 + Math.sin(pitch) * dist, p.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  }

  /** 跳過目前過場 (長按 / 點右上角)：補發剩下的台詞事件，直接進入結果 */
  public skipCutscene() {
    if (!this.canSkip) return;
    this.cutInput.reset();
    if (this.cutKind === 'TRANSITION') {
      this.story?.finish();
      this.endTransitionCut();
    } else if (this.phase === 'INTRO') {
      this.skippedIntro = true;
      this.skipping = true;
      const awakened = (this.introSteps & 16) !== 0;
      this.story?.finish();
      if (awakened) this.awakening.applyInstant();
      this.finishIntro();
    } else if (this.phase === 'VICTORY' && this.longVictory) {
      this.story?.finish();
      this.finishVictoryCutscene();
    }
  }

  /** 開場結束保險：台詞事件若被改稿移除，仍補做所有步驟 (清場 / 結界 / 校園卸載 / Boss / 覺醒) */
  private ensureIntroSteps() {
    if (this.step(1)) { /* 花瓣爆散略過 */ }
    if (this.step(2)) this.stepUnloadActors();
    if (this.step(4)) this.stepUnloadWorld();
    if (this.step(8)) this.stepBossAppear();
    if (this.step(16)) this.stepAwaken(true);
    if (this.arena.anim === 'RISING') this.arena.update(10); // 結界直接升滿
    if (this.skipping) this.boss.update(2);
  }

  private finishIntro() {
    const { player, cameraCtrl, wantedSystem } = this.ctx;
    this.ensureIntroSteps();
    this.story = null;
    this.cutKind = null;
    this.skipping = false;
    this.phase = 'FIGHT';
    this.timer = 0;
    player.isCinematicLocked = false;
    this.sunflower.setVisible(false);
    this.setCutsceneUi(false);
    this.ctx.hud.setBossFightHud(true);
    cameraCtrl.resetBehind(player.position, player.rotationY + Math.PI);
    this.boss.startFight(FIGHT_GRACE);
    this.ctx.input.requestPointerLock();
    this.fightFlags = 0;
    this.releaseBanners();
    wantedSystem.showBanner(AWAKEN_BANNER, 2500);
  }

  /** 每場劇情狀態重置 (覺醒時) */
  private resetFightStory() {
    this.teachFight = (this.storySeen & STORY_SEEN.REGEN_TAUGHT) === 0;
    this.usedRapier = false;
    this.halfDone = 0;
    this.dawnDone = false;
    this.finalLowDone = false;
    this.s3At = -1;
    this.s3Hit = false;
    this.lastBossHitAt = 0;
    this.wasCritical = false;
  }

  // ===== 戰鬥每幀 (main 一般流程；玩家更新之後) =====

  /** 結界內玩家夾回 + 與 Boss 推擠 (玩家更新之後、戰鬥結算之前) */
  public constrainPlayer() {
    if (this.phase !== 'FIGHT' && this.phase !== 'VICTORY') return;
    if (this.arena.anim === 'DOWN') return;
    const player = this.ctx.player;
    const r = FENCER.ARENA_R - FENCER.PLAYER_CLAMP_PAD;
    const dx = player.position.x - FENCER.ARENA_X;
    const dz = player.position.z - FENCER.ARENA_Z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > r) {
      const nx = dx / d;
      const nz = dz / d;
      player.position.x = FENCER.ARENA_X + nx * r;
      player.position.z = FENCER.ARENA_Z + nz * r;
      // 歸零徑向速度 (擊飛中也夾)
      const vr = player.velocity.x * nx + player.velocity.z * nz;
      if (vr > 0) { player.velocity.x -= nx * vr; player.velocity.z -= nz * vr; }
      const kr = player.knockVelocity.x * nx + player.knockVelocity.z * nz;
      if (kr > 0) { player.knockVelocity.x -= nx * kr; player.knockVelocity.z -= nz * kr; }
      player.mesh.position.x = player.position.x;
      player.mesh.position.z = player.position.z;
    }
    // 與 Boss 推擠
    if (this.phase === 'FIGHT' && this.boss.root.visible && !this.boss.isAirborne) {
      const bx = player.position.x - this.boss.position.x;
      const bz = player.position.z - this.boss.position.z;
      const bd = Math.sqrt(bx * bx + bz * bz);
      if (bd < SEPARATION && bd > 1e-4) {
        player.position.x = this.boss.position.x + (bx / bd) * SEPARATION;
        player.position.z = this.boss.position.z + (bz / bd) * SEPARATION;
        player.mesh.position.x = player.position.x;
        player.mesh.position.z = player.position.z;
      }
    }
  }

  /** 手機直屏：Boss 頭頂框夾在頂部資訊條 / Boss 血條下方 (量測每 0.5s 更新；桌機 / 橫屏不啟用) */
  private fitBossBubble(dt: number) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!shouldFitBubble(window.innerWidth, window.innerHeight)) {
      if (this.bubbleSafeTop !== null) { this.bubbleSafeTop = null; this.boss.fitBubble(this.ctx.cameraCtrl.camera, null); }
      return;
    }
    this.bubbleSafeTimer -= dt;
    if (this.bubbleSafeTop === null || this.bubbleSafeTimer <= 0) {
      this.bubbleSafeTimer = 0.5;
      let bottom = 0;
      document.querySelectorAll('.hud-info-group, #boss-hud').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0) bottom = Math.max(bottom, r.bottom); // display:none 的高度為 0
      });
      this.bubbleSafeTop = safeTopNdc(Math.max(bottom, 36), window.innerHeight);
    }
    this.boss.fitBubble(this.ctx.cameraCtrl.camera, this.bubbleSafeTop);
  }

  /** 每幀 (delta = 停格縮放後)：IDLE 時只更新太陽花 */
  public update(delta: number) {
    if (!this.initialized) return;
    if (this.phase === 'IDLE') {
      if (this.followUp) {
        this.followUpTimer -= delta;
        if (this.followUpTimer <= 0) {
          this.sunflower.setFace(this.followUp.face);
          this.sunflower.say(this.followUp.text, SUNFLOWER_DAILY_SEC);
          this.followUp = null;
        }
      }
      if (this.ctx.currentWorldType === 'CAMPUS') {
        const pp = this.ctx.player.position;
        const dx = pp.x - FENCER.CENTER_X;
        const dz = pp.z - FENCER.CENTER_Z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        this.sunflower.setPlayerNear(dist, pp, SPROUT_AWARE_RANGE, this.taunt.lastResult === 'WIN' ? SUNFLOWER_WATCH_RANGE : 0);
        if (this.pendingLossTaunt && this.taunt.lastResult === 'LOSS' && dist < SUNFLOWER_AFTER_LOSS_RANGE && !this.ctx.player.isDead) {
          this.pendingLossTaunt = false;
          this.sunflower.setFace('SMUG');
          this.sunflower.say(SUNFLOWER_AFTER_LOSS_LINE, SUNFLOWER_DAILY_SEC);
        }
        this.sunflower.update(delta);
      }
      if (this.arena.anim !== 'DOWN') this.arena.update(delta);
      if (this.fx.group.visible) this.fx.update(delta);
      if (this.awakening.isOn) this.awakening.update(delta, this.ctx.player.position, this.ctx.player.isDead); // 勝利還原收尾
      return;
    }
    if (this.isCutscene) return;
    const { player, hud } = this.ctx;
    this.timer += delta;
    this.boss.update(delta);
    this.arena.update(delta);
    this.fx.update(delta);
    this.sunflower.update(delta);
    this.fitBossBubble(delta);
    this.awakening.update(delta, player.position, player.isDead || player.isRidingVehicle, player.hp / player.maxHp, this.regen.isFastRegen(player.hp, player.maxHp));

    // 鏡頭不穿進 Boss 身體
    const cam = this.ctx.cameraCtrl;
    if (this.boss.root.visible && (this.phase === 'FIGHT' || this.phase === 'VICTORY')) {
      _camObstacle.x = this.boss.position.x;
      _camObstacle.z = this.boss.position.z;
      _camObstacle.top = this.boss.position.y + 2.5;
      cam.obstacle = _camObstacle;
    } else cam.obstacle = null;

    if (this.phase === 'FIGHT') {
      this.updateFightStory();
      this.updateRegen(delta);
      this.updateDusk(delta);
      const bars = this.boss.bars;
      hud.setFencerBossHealth(bars.totalRemaining, FENCER.BAR_HP * FENCER.BARS, bars.bar, !this.boss.isDefeated);
    } else if (this.phase === 'VICTORY') {
      hud.setBossHealth(0, FENCER.BAR_HP, false);
      if (this.timer >= VICTORY_REPEAT.restoreAt && this.step(32)) this.restoreAfterVictory(true);
      if (this.timer >= VICTORY_REPEAT.end) this.endToIdle();
    } else if (this.phase === 'DEFEAT') {
      hud.setBossHealth(0, FENCER.BAR_HP, false);
      if (this.timer >= DEFEAT_RESTORE_AT && this.step(32)) this.restoreAfterDefeat();
      if (this.timer >= this.defeatEnd) this.endToIdle();
    }
  }

  // 回血：基礎 0.8/s + 脫戰 8/s (80% 以下)；HUD 綠環 / 腳下光圈 / 首次橫幅
  private updateRegen(delta: number) {
    const { player, hud } = this.ctx;
    if (player.isDead) {
      this.fx.setRegenRing(false);
      hud.setHpRegen(false);
      return;
    }
    if (player.isAttacking || player.strikeMove || player.aimCharge > 0) this.regen.onPlayerAttack();
    const dist = Math.hypot(player.position.x - this.boss.position.x, player.position.z - this.boss.position.z);
    const heal = this.regen.update(delta, { hp: player.hp, maxHp: player.maxHp, distToBoss: dist, forceOutOfCombat: this.boss.isInTransition });
    if (heal > 0) player.hp = Math.min(player.maxHp, player.hp + heal);
    const fast = this.regen.isFastRegen(player.hp, player.maxHp);
    hud.setHpRegen(fast);
    this.fx.setRegenRing(fast, player.position);
    // 快速回血 = 向陽之心的光：學回血的那一場第一次進入時確認一次 (之後只有 HUD 🌻 標籤 + 腳下光圈，不再出橫幅)
    if (fast && !this.wasFastRegen && !this.regen.bannerShown) {
      this.regen.bannerShown = true;
      if (this.teachFight) this.heartRequest('H3');
    }
    this.wasFastRegen = fast;
    // 換樂章過場中不說
    if (!this.boss.isInTransition) {
      const r = player.hp / player.maxHp;
      if (r < HEART_CRITICAL_HP) {
        this.wasCritical = true;
        this.heartRequest('H4');
      } else if (r < HEART_LOW_HP && !this.regen.outOfCombat) {
        // 血低還在纏鬥：Boss 先調侃一句 (每場一次)，向陽之心 1.5s 後簡短提醒退開回血
        this.bark('PLAYER_LOW');
        this.heartRequest('H2');
      } else if (this.wasCritical && r > LINE_RULES.COMEBACK_HIGH) {
        if (this.bark('COMEBACK')) this.wasCritical = false;
      }
    }
  }

  /** 向陽之心排入一句 (頻率見 HeartVoice；實際顯示在 pollHeart) */
  private heartRequest(id: HeartLineId) {
    this.heart.request(id, this.timer);
  }

  /** 每幀：向陽之心到時說話 (橫幅；回血教學接第二則；說完教學句即存檔「已學會回血」) */
  private pollHeart() {
    const id = this.heart.poll(this.timer, this.lineGate.lastSayAt);
    if (!id) return;
    const { wantedSystem } = this.ctx;
    wantedSystem.showBanner(HEART_LINES[id].text, HEART_LINES[id].ms);
    if (id === 'TEACH') {
      wantedSystem.showBanner(HEART_TEACH_2.text, HEART_TEACH_2.ms);
      this.storySeen |= STORY_SEEN.REGEN_TAUGHT;
      this.persist();
    }
  }

  /** Boss 頭頂框 (記錄說話時間供頻率規則) */
  private bossSay(text: string, dur: number) {
    if (!text) return;
    this.boss.say(text, dur);
    this.lineGate.noteSay(this.timer);
  }

  /** 反應台詞 (依樂章 / 每場一次；頻率見 BossLineGate.allowBark)；回傳是否有說 */
  private bark(kind: BarkKind): boolean {
    if (this.phase !== 'FIGHT' || this.boss.isInTransition || this.boss.isDefeated || this.ctx.player.isDead) return false;
    const bar = this.boss.currentBar;
    const text = kind in BOSS_BARK_LINES ? BOSS_BARK_LINES[kind as keyof typeof BOSS_BARK_LINES][bar] : BOSS_ONCE_LINES[kind as keyof typeof BOSS_ONCE_LINES];
    if (!text || !this.lineGate.allowBark(kind, bar, this.timer)) return false;
    this.boss.say(text, BOSS_BARK_SEC);
    return true;
  }

  // 異空間天色：樂章 0 暮紅 / 1 紫暮 / 2 近夜，終樂章血量過半起依剩餘血量轉晨金；首勝化花瓣後轉滿 (只改顏色 / uniform，0 draw call)
  private updateDusk(dt: number) {
    if (!this.battle.worldUnloaded) return;
    let goal: number;
    if (this.phase === 'VICTORY') goal = this.victoryDawn ? 3 : this.duskLevel;
    else if (this.cutKind === 'TRANSITION') goal = this.transBar;
    else {
      const bar = this.boss.currentBar;
      goal = duskTargetLevel(bar, dawnProgress(bar, this.boss.bars.hp / FENCER.BAR_HP, DAWN_AT));
    }
    const rate = this.phase === 'VICTORY' ? DUSK_RATE_VICTORY : DUSK_RATE;
    const d = goal - this.duskLevel;
    this.duskLevel += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this.applyDusk();
  }

  private applyDusk() {
    const l = this.duskLevel;
    if (Math.abs(l - this.duskApplied) < 1e-4) return;
    this.duskApplied = l;
    const { engine } = this.ctx;
    (engine.scene.background as THREE.Color).setHex(duskColorAt(l, 'sky'));
    const fog = engine.scene.fog as THREE.FogExp2 | null;
    if (fog) fog.color.setHex(duskColorAt(l, 'fog'));
    engine.hemiLight.color.setHex(duskColorAt(l, 'hemi'));
    engine.hemiLight.groundColor.setHex(duskColorAt(l, 'ground'));
    engine.dirLight.color.setHex(duskColorAt(l, 'dir'));
    this.arena.setDawn(l - 2);
  }

  // 戰中劇情：開戰第一句 / 第二則覺醒橫幅 (換樂章對白改由鎖操作小過場播放)
  private updateFightStory() {
    const t = this.timer;
    if (!(this.fightFlags & 1) && t >= BOSS_OPEN_DELAY) {
      this.fightFlags |= 1;
      if (this.fightsStarted <= 1) this.bossSay(BOSS_OPEN_LINE, 1.6);
      else if (this.skippedIntro) this.bossSay(this.rematchBossLine, 2.4);
    }
    // 開戰 IDLE_SEC 秒內都沒打中 Boss 且不在撤退：調侃一次
    if (t >= LINE_RULES.IDLE_SEC && t - this.lastBossHitAt >= LINE_RULES.IDLE_SEC && !this.regen.outOfCombat) this.bark('IDLE');
    this.pollHeart();
  }

  // Boss 招式宣言 / 收招致意 / 追擊 (頻率規則 BossLineGate)
  private onBossCue(cue: BossCue) {
    if (this.phase !== 'FIGHT') return;
    if (cue === 'BACKFLIP') { this.bark('BACKFLIP'); return; }
    if (cue === 'CHASE' && this.timer < CHASE_LINE_MIN_FIGHT_SEC) return;
    if (cue === 'S3_JUMP') { this.s3At = this.timer; this.s3Hit = false; }
    if (cue === 'BOW') {
      this.heartRequest('H1');
      // S3 全程沒被打中：以讚美取代致意台詞
      const clean = this.s3At >= 0 && !this.s3Hit;
      this.s3At = -1;
      if (clean && this.bark('CLEAN_DODGE')) return;
    }
    const bar = this.boss.currentBar;
    if (!this.lineGate.allow(cue, bar, this.timer)) return;
    const pool = BOSS_CUE_LINES[cue].byBar[Math.max(0, Math.min(2, bar))];
    this.bossSay(pool[Math.floor(Math.random() * pool.length)], BOSS_CUE_LINES[cue].dur);
  }

  // ===== Boss 命中玩家 =====

  private damagePlayer(amount: number, dir: THREE.Vector3 | null, h: number, v: number, reason: string) {
    const { player, hud } = this.ctx;
    if (player.isDead || this.phase !== 'FIGHT') return;
    if (player.tryAutoDodge()) return;
    const before = player.hp;
    if (dir) player.launchFlying(dir, h, v, amount, reason);
    else player.takeDamage(amount, reason);
    if (player.hp < before && this.regen.onPlayerHit()) hud.flashHpRingInterrupt();
    if (player.hp < before) {
      if (this.s3At >= 0) this.s3Hit = true;
      if (this.teachFight) this.heartRequest('TEACH'); // 第一次學：第一次掉血就說明回血
      if (BIG_HIT_REASONS.includes(reason)) this.bark('BIG_HIT');
    }
  }

  // ===== 玩家命中 Boss (CombatSystem / 投射物入口；非戰鬥中回傳 null) =====

  public tryHitMelee(origin: THREE.Vector3, reach: number, damage: number): BossDamageResult | null {
    if (this.phase !== 'FIGHT') return null;
    return this.afterPlayerHit(this.boss.tryHitMelee(origin, reach, damage), false);
  }

  public tryHitAoe(center: THREE.Vector3, radius: number, damage: number, shape: PlantAoeShape | null): BossDamageResult | null {
    if (this.phase !== 'FIGHT') return null;
    return this.afterPlayerHit(this.boss.tryHitAoe(center, radius, damage, shape), false);
  }

  /** 投射物點判定 (gameHost.hitBossAt) */
  public hitBossAt(point: THREE.Vector3, r: number, damage: number): BossDamageResult | null {
    if (this.phase !== 'FIGHT') return null;
    return this.afterPlayerHit(this.boss.tryHitAtPoint(point, r, damage), true);
  }

  /** 玩家命中後的反應台詞：遠程 (每場一次) / 玫瑰細劍 (每場一次，並記錄本場用過細劍) */
  private afterPlayerHit(res: BossDamageResult | null, ranged: boolean): BossDamageResult | null {
    if (!res || res.applied <= 0 || this.phase !== 'FIGHT') return res;
    if (ranged) this.bark('RANGED');
    else if (this.ctx.player.currentWeapon === 'RAPIER') {
      this.usedRapier = true;
      this.bark('RAPIER');
    }
    return res;
  }

  private onBossDamaged(res: BossDamageResult, _point: THREE.Vector3) {
    this.regen.onPlayerAttack(); // 命中 Boss (含遠程) 視為出手
    if (res.applied <= 0) return;
    this.lastBossHitAt = this.timer;
    if (!res.barBroken) this.onBossHpStory();
    if (res.defeated) {
      this.startVictory();
    } else if (res.barBroken) {
      const next = Math.min(FENCER.BARS - 1, this.boss.bars.bar + 1);
      this.transBar = Math.max(1, next);
      this.startTransitionCut();
      this.ctx.wantedSystem.showBanner(MOVEMENT_BANNERS[next], 3000); // 過場結束後播出
    }
  }

  /** 血量門檻劇情：第一 / 二樂章過半 (反應台詞)；終樂章過半 = 黎明轉折、剩 15% = 最後一擊前 */
  private onBossHpStory() {
    const bar = this.boss.currentBar;
    const r = this.boss.bars.hp / FENCER.BAR_HP;
    if (bar < FENCER.BARS - 1) {
      if (r <= 0.5 && !(this.halfDone & (1 << bar)) && this.bark('HALF')) this.halfDone |= 1 << bar;
      return;
    }
    if (r <= DAWN_AT && !this.dawnDone) {
      this.dawnDone = true;
      this.bossSay(DAWN_BOSS_LINE, BOSS_BARK_SEC);
      this.heartRequest('DAWN');
    } else if (r <= FINAL_LOW_AT && !this.finalLowDone) {
      this.finalLowDone = true;
      this.bossSay(FINAL_LOW_BOSS_LINE, BOSS_BARK_SEC);
    }
  }

  // ===== 換樂章小過場 (鎖操作)：擊破亮相 → Boss 花瓣傳送回中央 (玩家太近則推開) → 雙人同框 + 字幕列台詞 → 混回戰鬥鏡頭 =====

  /** 擊破瞬間呼叫 (在玩家命中 Boss 的結算途中)：中止出招等重置延到過場第一幀 */
  private startTransitionCut() {
    // 第一次看完整版 (身世揭露)，看過後改短版 (存檔)
    const i = this.transBar - 1;
    const full = transitionIsFull(this.transBar, this.storySeen);
    if (full) {
      this.storySeen |= i === 0 ? STORY_SEEN.TRANSITION_1 : STORY_SEEN.TRANSITION_2;
      this.persist();
    }
    const lines = full ? TRANSITION_BEATS[i] : TRANSITION_BEATS_SHORT[i];
    this.story = new StoryPlayer(lines, this.storyHandler, TRANSITION_LEAD_SEC, TRANSITION_TAIL_SEC);
    this.boss.setTransitionDuration(this.story.total);
    this.cutKind = 'TRANSITION';
    this.cutT = 0;
    this.cutFirstFrame = true;
    this.pushPending = true;
    this.pushT = 1;
    this.cutInput.reset();
    this.holdBanners();
    const { player } = this.ctx;
    player.isCinematicLocked = true;
    this.setCutsceneUi(true, true);
    this.subtitle('');
    _tcCam.copy(this.ctx.cameraCtrl.camera.position);
    _tcLook.set(player.position.x, 1.3, player.position.z);
  }

  private updateTransitionCut(dt: number) {
    const { player, combat } = this.ctx;
    if (this.cutFirstFrame) {
      this.cutFirstFrame = false;
      combat.resetTransientState();
      swingTrail.reset();
      player.velocity.set(0, 0, 0);
      player.knockVelocity.set(0, 0, 0);
      player.isKnockedFlying = false;
      if (player.position.y > 0) player.position.y = 0;
      player.mesh.position.copy(player.position);
    }
    this.cutT += dt;
    this.timer += dt;
    this.story?.update(dt);
    this.boss.update(dt);
    this.arena.update(dt);
    this.fx.update(dt);
    this.fitBossBubble(dt);
    comboFinisherFX.update(dt, this.ctx.cameraCtrl.camera);
    slashFX.update(dt, this.ctx.cameraCtrl.camera);
    this.updateRegen(dt); // 換樂章一律算脫戰 (快速回氣照算)
    this.updateDusk(dt);  // 天色轉往下一樂章
    this.awakening.update(dt, player.position, false, player.hp / player.maxHp, this.regen.isFastRegen(player.hp, player.maxHp));
    player.updateSkillBubble(dt);
    this.updateTransitionPush(dt);
    // 玩家面向 Boss
    const b = this.boss.position;
    player.rotationY = Math.atan2(b.x - player.position.x, b.z - player.position.z);
    player.mesh.rotation.set(0, player.rotationY, 0);
    this.updateTransitionCamera(dt);
    if (!this.story || this.story.done || !this.boss.isInTransition) this.endTransitionCut();
  }

  /** Boss 回到中央時玩家若距中心 < PUSH_IN，花瓣風把玩家推到 PUSH_TO (無傷) */
  private updateTransitionPush(dt: number) {
    const player = this.ctx.player;
    if (this.pushPending && this.boss.transitionCentered) {
      this.pushPending = false;
      const dx = player.position.x - FENCER.ARENA_X;
      const dz = player.position.z - FENCER.ARENA_Z;
      const d = Math.hypot(dx, dz);
      if (d < TRANSITION_PUSH_IN) {
        const nx = d > 0.05 ? dx / d : 0;
        const nz = d > 0.05 ? dz / d : 1;
        _pushFrom.copy(player.position);
        _pushTo.set(FENCER.ARENA_X + nx * TRANSITION_PUSH_TO, player.position.y, FENCER.ARENA_Z + nz * TRANSITION_PUSH_TO);
        this.pushT = 0;
        this.fx.petalBurst(player.position.x, 0.8, player.position.z, 24, 4, PETAL_PALETTE_ROSE, 2);
      }
    }
    if (this.pushT < 1) {
      this.pushT = Math.min(1, this.pushT + dt / PUSH_SEC);
      player.position.lerpVectors(_pushFrom, _pushTo, smooth(this.pushT));
      player.mesh.position.copy(player.position);
    }
  }

  /** 換樂章鏡頭：玩家斜後方 (取靠結界中心的一側) 與 Boss 雙人同框，平滑跟隨；最後一句後混回玩家身後 */
  private updateTransitionCamera(dt: number) {
    const cam = this.ctx.cameraCtrl.camera;
    const p = this.ctx.player.position;
    const b = this.boss.position;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    let nx = -uz;
    let nz = ux;
    if ((p.x + nx - FENCER.ARENA_X) ** 2 + (p.z + nz - FENCER.ARENA_Z) ** 2 > (p.x - nx - FENCER.ARENA_X) ** 2 + (p.z - nz - FENCER.ARENA_Z) ** 2) { nx = -nx; nz = -nz; }
    const back = Math.min(7, 4.2 + d * 0.15);
    _cam.set(p.x - ux * back + nx * 1.8, 2.4 + Math.min(1.6, d * 0.06), p.z - uz * back + nz * 1.8);
    const ox = _cam.x - FENCER.ARENA_X;
    const oz = _cam.z - FENCER.ARENA_Z;
    const od = Math.hypot(ox, oz);
    const maxR = FENCER.ARENA_R - 1.2;
    if (od > maxR) { _cam.x = FENCER.ARENA_X + (ox / od) * maxR; _cam.z = FENCER.ARENA_Z + (oz / od) * maxR; }
    const ahead = Math.min(d * 0.55, 6);
    _look.set(p.x + ux * ahead, 1.4, p.z + uz * ahead);
    const k = 1 - Math.exp(-4 * dt);
    _tcCam.lerp(_cam, k);
    _tcLook.lerp(_look, k);
    _cam.copy(_tcCam);
    _look.copy(_tcLook);
    const s = this.story;
    if (s && s.index >= s.lines.length && s.tail > 0) {
      const kb = smooth(s.lineTime / s.tail);
      _cam.lerp(this.behindCamPos(_final), kb);
      _look.lerp(_v.set(p.x, 1.35, p.z), kb);
    }
    cam.position.copy(_cam);
    cam.lookAt(_look);
  }

  private endTransitionCut() {
    const { player, cameraCtrl } = this.ctx;
    this.story = null;
    this.cutKind = null;
    this.cutInput.reset();
    if (this.pushT < 1) { player.position.copy(_pushTo); player.mesh.position.copy(player.position); this.pushT = 1; }
    this.boss.endTransitionNow();
    player.isCinematicLocked = false;
    this.setCutsceneUi(false);
    cameraCtrl.resetBehind(player.position, player.rotationY + Math.PI);
    this.releaseBanners();
    this.ctx.input.requestPointerLock();
    this.heartRequest(this.transBar >= 2 ? 'S3' : 'S2'); // 向陽之心接新樂章
  }

  // ===== 結束路徑 =====

  /** 玩家數值統一還原 (覺醒立即還原 + 體力上限還原；refill = 勝利補滿)。重複呼叫安全，死亡時須在 respawn 之前 */
  public restorePlayerHp(refill: boolean = false) {
    if (this.stats.applied) this.stats.remove(this.ctx.player, refill);
    this.awakening.revertInstant();
  }

  private startVictory() {
    const { progression, wantedSystem, player } = this.ctx;
    this.phase = 'VICTORY';
    this.ctx.hud.setBossFightHud(false);
    this.timer = 0;
    this.introSteps = 0;
    this.ctx.combat.requestHitStop(0.25);
    this.fx.setRegenRing(false);
    this.ctx.hud.setHpRegen(false);
    const first = !progression.fencerDefeated;
    const reward = victoryReward(!first);
    this.longVictory = victoryIsLong(!first);
    this.boss.defeatDissolveAt = first ? 999 : VICTORY_REPEAT.dissolveAt; // 首勝：台詞事件 DISSOLVE 才化花瓣
    progression.addCash(reward);
    progression.fencerWins++;
    if (this.longVictory) {
      // 首勝：7s 過場 (鎖操作、字幕遮罩)，期間橫幅暫存、結束後依序播出
      progression.fencerDefeated = true;
      this.holdBanners();
      this.enterVictoryCutscene();
      // 玫瑰細劍解鎖：Progression.checkRapierUnlock 輪詢 (戰鬥 / 本過場期間延後，回校園才跳橫幅並自動換上)
      wantedSystem.showBanner(VICTORY_BANNER.first(reward), 6000);
    } else {
      wantedSystem.showBanner(VICTORY_BANNER.repeat(reward), 4500);
      const line = REMATCH_WIN_BOSS_LINE[rematchWinKey(progression.fencerWins, this.usedRapier)];
      this.boss.say(line, lineDuration({ text: line }));
      player.showSkillBubble(PLAYER_WIN_BUBBLE, true);
    }
    soundManager.playFanfare();
    this.taunt.recordResult('WIN');
    this.lastBar = FENCER.BARS - 1;
    this.persist();
  }

  // 首勝過場開始 (在玩家命中 Boss 的結算途中呼叫：中止出招等重置延到過場第一幀)
  private enterVictoryCutscene() {
    const { player, hud } = this.ctx;
    player.isCinematicLocked = true;
    player.velocity.set(0, 0, 0);
    player.knockVelocity.set(0, 0, 0);
    player.isKnockedFlying = false;
    if (player.position.y > 0) player.position.y = 0;
    player.mesh.position.copy(player.position);
    hud.hidePrompt();
    this.cutKind = 'VICTORY';
    this.cutT = 0;
    this.camStage = 'ORBIT'; // 首勝鏡頭只用 BLEND 段
    this.camStageAt = 0;
    this.cutInput.reset();
    this.setCutsceneUi(true, true);
    this.story = new StoryPlayer(VICTORY_FIRST_BEATS, this.storyHandler);
  }

  // 首勝過場每幀：0.25 停格 → 跪地 / 回禮 / 化花瓣 / 光還太陽花 / 恢復校園 / 細劍插地 (替身) → 解鎖；時間點跟著台詞事件
  private updateVictoryCutscene(dt: number) {
    const { player, combat, hud } = this.ctx;
    this.timer += dt;
    this.cutT += dt;
    const t = this.timer;
    if (this.step(64)) {
      combat.resetTransientState();
      swingTrail.reset();
      hud.setBossHealth(0, FENCER.BAR_HP, false);
    }
    const bdt = t < VICTORY_FIRST.freeze ? 0 : dt;
    this.boss.update(bdt);
    this.arena.update(dt);
    this.fx.update(bdt);
    this.sunflower.update(dt);
    comboFinisherFX.update(dt, this.ctx.cameraCtrl.camera);
    slashFX.update(dt, this.ctx.cameraCtrl.camera);
    this.awakening.update(dt, player.position, false);
    player.updateSkillBubble(dt);
    if (t >= VICTORY_FIRST.freeze) this.story?.update(dt);
    this.updateRapierRise(this.cutT);
    this.updateDusk(dt);
    this.updateVictoryCamera();
    if (this.story?.done) this.finishVictoryCutscene();
  }

  // 細劍自土裡升起 (陪了種子三十年、當支架的老師佩劍)：玩家面前的草地，劍尖朝下、整把由地底升到半插的位置
  private riseRapier() {
    const p = this.ctx.player.position;
    const yaw = this.ctx.player.rotationY;
    const sword = this.rapierProp;
    // 前方 1.6m、偏一側 0.8m (不被玩家身體擋住)
    sword.position.set(p.x + Math.sin(yaw) * 1.6 - Math.cos(yaw) * 0.8, RAPIER_BURIED_Y, p.z + Math.cos(yaw) * 1.6 + Math.sin(yaw) * 0.8);
    sword.rotation.set(Math.PI, yaw, 0.12);
    sword.visible = true;
    const { x, z } = sword.position;
    this.fx.petalBurst(x, 0.1, z, 26, 2.2, SOIL_PETALS, 1.6, 0.6); // 土屑 + 草葉
    soundManager.playBarrierHum(_v.set(x, 0, z));
    requestCameraShake(0.12);
  }

  private updateRapierRise(t: number) {
    const sword = this.rapierProp;
    if (!sword.visible) return;
    const k = Math.min(1, (t - this.rapierAt) / RAPIER_RISE_SEC);
    const e = 1 - Math.pow(1 - k, 3);
    sword.position.y = RAPIER_BURIED_Y + (RAPIER_STUCK_Y - RAPIER_BURIED_Y) * e;
    if (k >= 1 && this.step(2048)) {
      const { x, z } = sword.position;
      this.fx.petalBurst(x, 1.2, z, 40, 2.5, PETAL_PALETTE_SUN, 2);
      this.fx.petalBurst(x, 0.6, z, 30, 3, PETAL_PALETTE_ROSE, 2.5);
      slashFX.hitFlash(x, 1.4, z, 0xfff0c8);
      soundManager.playFinaleChime(_v.set(x, 0.8, z));
    }
  }

  // 首勝過場鏡頭：玩家斜後方望向跪地的 Boss (兩人前後排開，手機直屏窄視角也同框)，緩慢推近；最後 0.8s 混回玩家身後
  private updateVictoryCamera() {
    const cam = this.ctx.cameraCtrl.camera;
    const p = this.ctx.player.position;
    const b = this.boss.position;
    if (this.step(1024)) {
      // _vicMid = 玩家→Boss 單位向量 (y = 兩人距離)、_vicSide = 側向 (取靠結界中心的一側，不貼牆)
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      _vicMid.set(dx / d, d, dz / d);
      let nx = -dz / d;
      let nz = dx / d;
      if ((p.x + nx - FENCER.ARENA_X) ** 2 + (p.z + nz - FENCER.ARENA_Z) ** 2 > (p.x - nx - FENCER.ARENA_X) ** 2 + (p.z - nz - FENCER.ARENA_Z) ** 2) { nx = -nx; nz = -nz; }
      _vicSide.set(nx, 0, nz);
    }
    const ux = _vicMid.x;
    const uz = _vicMid.z;
    const total = this.story ? this.story.total : 1;
    const back = 3.8 - Math.min(1, this.cutT / total) * 0.8; // 緩慢推近
    _cam.set(p.x - ux * back + _vicSide.x * 1.7, 2.1, p.z - uz * back + _vicSide.z * 1.7);
    // 留在結界內 (看不到牆外)
    const ox = _cam.x - FENCER.ARENA_X;
    const oz = _cam.z - FENCER.ARENA_Z;
    const od = Math.hypot(ox, oz);
    const maxR = FENCER.ARENA_R - 1.2;
    if (od > maxR) { _cam.x = FENCER.ARENA_X + (ox / od) * maxR; _cam.z = FENCER.ARENA_Z + (oz / od) * maxR; }
    const ahead = Math.min(_vicMid.y * 0.6, 4);
    _look.set(p.x + ux * ahead, 1.0, p.z + uz * ahead);
    if (this.camStage === 'BLEND') {
      const k = smooth((this.cutT - this.camStageAt) / this.blendDur);
      _cam.lerp(this.behindCamPos(_final), k);
      _look.lerp(_v.set(p.x, 1.35, p.z), k);
    }
    cam.position.copy(_cam);
    cam.lookAt(_look);
  }

  private finishVictoryCutscene() {
    const { player, cameraCtrl } = this.ctx;
    if (this.step(32)) this.restoreAfterVictory(false);
    this.story = null;
    this.cutKind = null;
    this.longVictory = false;
    player.isCinematicLocked = false;
    this.setCutsceneUi(false);
    cameraCtrl.resetBehind(player.position, player.rotationY + Math.PI);
    this.releaseBanners();
    this.sunflower.say(VICTORY_SLEEPY_LINE, 3);
    this.endToIdle();
    this.ctx.input.requestPointerLock();
  }

  // 勝利：降下前一幀先掛回校園、還原背景 / 霧 / 天氣，再降結界；體力上限還原並補滿；
  // outro = 覺醒還原 (再戰勝利在此播放；首勝過場已提前於 4.4s 播放)
  private restoreAfterVictory(outro: boolean) {
    this.exitBattleMode();
    this.arena.lower();
    this.stats.remove(this.ctx.player, true);
    if (outro) this.awakening.playOutro();
    this.sunflower.resetPose('SLEEPY');
    if (!this.longVictory) this.sunflower.say(VICTORY_SLEEPY_LINE, 3);
    this.fx.petalBurst(FENCER.CENTER_X, 1.6, FENCER.CENTER_Z, 60, 4, PETAL_PALETTE_SUN, 3);
  }

  /** 玩家死亡 (main.handlePlayerDeath 開頭呼叫)：立即還原覺醒與上限，Boss 收劍鞠躬，稍後恢復世界 */
  public onPlayerDeath() {
    if (this.phase === 'IDLE') return;
    this.restorePlayerHp(false);
    if (this.phase === 'INTRO') { this.abort(); return; }
    if (this.phase === 'VICTORY' || this.phase === 'DEFEAT') return;
    this.phase = 'DEFEAT';
    this.ctx.hud.setBossFightHud(false);
    this.timer = 0;
    this.introSteps &= ~32;
    this.boss.triumph();
    this.lastBar = Math.max(0, Math.min(2, this.boss.currentBar));
    this.pendingLossTaunt = true;
    const pool = DEFEAT_BOSS_LINES_BY_BAR[this.lastBar];
    const line = pool[Math.floor(Math.random() * pool.length)];
    const dur = lineDuration({ text: line });
    this.boss.say(line, dur);
    this.defeatEnd = Math.max(DEFEAT_END_MIN, dur + 0.6);
    this.defeatNotice = true;
    this.fx.setRegenRing(false);
    this.ctx.hud.setHpRegen(false);
    this.taunt.recordResult('LOSS');
    this.persist();
  }

  private restoreAfterDefeat() {
    this.exitBattleMode();
    this.arena.lower();
    this.sunflower.resetPose('SMUG');
  }

  /** 復活前保險 (main 的復活計時器呼叫)：若世界尚未恢復則立即完成 */
  public beforeRespawn() {
    this.restorePlayerHp(false);
    if (this.phase === 'DEFEAT') this.abort();
  }

  /** 立即中止 (切換世界 / 復活保險)：同一幀全部還原，不播降下動畫 */
  public abort() {
    if (!this.initialized || this.phase === 'IDLE') return;
    const wasFighting = this.phase !== 'VICTORY';
    this.restorePlayerHp(this.phase === 'VICTORY');
    if (this.isCutscene) {
      this.ctx.player.isCinematicLocked = false;
      this.setCutsceneUi(false);
    }
    this.longVictory = false;
    this.story = null;
    this.cutKind = null;
    this.releaseBanners();
    if (wasFighting && this.taunt.lastResult === 'NONE') this.taunt.recordResult('LOSS');
    if (this.phase === 'FIGHT') this.lastBar = Math.max(0, Math.min(2, this.boss.currentBar));
    this.persist();
    this.exitBattleMode();
    this.sunflower.resetPose(this.taunt.lastResult === 'WIN' ? 'SLEEPY' : 'SMUG');
    this.endToIdle();
    this.arena.hideNow();
  }

  private endToIdle() {
    this.phase = 'IDLE';
    this.story = null;
    this.cutKind = null;
    this.cutInput.reset();
    if (this.rapierProp) this.rapierProp.visible = false;
    this.ctx.cameraCtrl.obstacle = null;
    this.timer = 0;
    this.boss.hide();
    this.fx.reset();
    this.arena.setDawn(0);
    this.victoryDawn = false;
    this.ctx.hud.setBossHealth(0, FENCER.BAR_HP, false);
    this.ctx.hud.setBossFightHud(false);
    this.ctx.hud.setHpRegen(false);
    this.wasFastRegen = false;
  }

  // 恢復校園 (與卸載對稱)：場景群組 / NPC / 腳踏車 / 籃球 / 天氣 / 背景 / 霧 / 陰影範圍 / 小地圖 / 鏡頭邊界
  private exitBattleMode() {
    if (!this.battle.active) {
      this.ctx.cameraCtrl.arenaBound = null;
      return;
    }
    const worldWasUnloaded = this.battle.worldUnloaded;
    this.battle.restore();
    this.hooks?.setNpcsSuspended(false);
    const { engine, weatherSystem, hud, cameraCtrl } = this.ctx;
    if (worldWasUnloaded) weatherSystem.setWeather(this.savedWeather, false, false); // 背景 / 霧 / 光照 / 雨聲一併還原
    engine.setShadowExtent(SHADOW_DISTANCE);
    hud.setRadarSuspended(false);
    cameraCtrl.arenaBound = null;
    this.sunflower.setVisible(true);
  }

  // ===== UI =====

  // 過場期間橫幅暫存 (HUD 隱藏時看不到)，結束後依序播出
  private holdBanners() {
    if (this.bannersHeld) return;
    this.bannersHeld = true;
    this.ctx.wantedSystem.holdBanners();
  }

  private releaseBanners() {
    if (!this.bannersHeld) return;
    this.bannersHeld = false;
    this.ctx.wantedSystem.releaseBannerHold();
  }

  private setCutsceneUi(on: boolean, skippable: boolean = false) {
    if (typeof document === 'undefined') return;
    // 大型容器只切 opacity (常駐合成層)，不切 visibility / display，避免 GPU 執行緒重新配置圖層貼圖造成卡頓
    setConcealedById('hud-overlay', on);
    setConcealedById('mobile-controls-container', on);
    showCutsceneOverlay(on);
    const skip = document.getElementById('cutscene-skip-btn');
    if (skip) {
      skip.style.display = on && skippable ? '' : 'none';
      // 花劍客過場：提示改為「點擊下一句・長按跳過」(少年院開場共用此按鈕，結束後還原)
      if (on && this.skipBadgeHtml === null) { this.skipBadgeHtml = skip.innerHTML; skip.innerHTML = CUT_HINT_HTML; }
      if (!on && this.skipBadgeHtml !== null) { skip.innerHTML = this.skipBadgeHtml; this.skipBadgeHtml = null; }
      skip.style.backgroundImage = '';
    }
    if (!on) {
      const sub = document.getElementById('cutscene-subtitle-text');
      if (sub) { sub.textContent = ''; sub.style.opacity = ''; }
      if (skip) skip.style.display = '';
    }
  }

  /** 長按跳過進度 (右上角提示底色由左往右填滿) */
  private updateSkipBadge() {
    if (typeof document === 'undefined') return;
    const skip = document.getElementById('cutscene-skip-btn');
    if (!skip) return;
    const k = this.cutInput.progress(cutNow());
    const pct = Math.round(k * 100);
    skip.style.backgroundImage = k > 0 ? `linear-gradient(90deg, rgba(255, 211, 42, 0.55) ${pct}%, transparent ${pct}%)` : '';
  }

  /** 點擊 / 按鍵輸入 (只在花劍客過場中生效)：放開 = 下一句、按住 1s = 跳過 */
  private bindCutsceneInput() {
    if (typeof window === 'undefined') return;
    const isKey = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE';
    const release = () => {
      if (this.cutInput.release(cutNow()) === 'ADVANCE') this.story?.advance();
    };
    window.addEventListener('keydown', (e) => {
      if (!this.isCutscene || e.repeat || !isKey(e)) return;
      this.cutInput.press(cutNow());
    });
    window.addEventListener('keyup', (e) => {
      if (!this.isCutscene || !isKey(e)) return;
      release();
    });
    window.addEventListener('pointerdown', (e) => {
      if (!this.isCutscene) return;
      const target = e.target as Element | null;
      if (target && typeof target.closest === 'function' && target.closest('#cutscene-skip-btn')) return; // 右上角按鈕 = 直接跳過
      this.cutInput.press(cutNow());
    });
    window.addEventListener('pointerup', () => { if (this.isCutscene) release(); });
    window.addEventListener('pointercancel', () => this.cutInput.reset());
  }

  private subtitle(text: string) {
    if (typeof document === 'undefined') return;
    const sub = document.getElementById('cutscene-subtitle-text');
    if (sub) {
      sub.textContent = text;
      sub.style.opacity = text ? '' : '0'; // 前導 (Boss 回中央) 期間不留空字幕框
    }
  }

  // 全螢幕閃白層：預熱時預先建立 (opacity 0 + will-change 常駐合成層)，閃白時只動 opacity
  private ensureFlashEl(): HTMLDivElement | null {
    if (typeof document === 'undefined' || !document.body) return null;
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.flashEl.setAttribute('aria-hidden', 'true');
      this.flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9000;will-change:opacity;transition:opacity 0.15s ease-out;';
      document.body.appendChild(this.flashEl);
    }
    return this.flashEl;
  }

  private whiteFlash() {
    const el = this.ensureFlashEl();
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.35s ease-out';
    el.style.opacity = '0';
  }

  // ===== 預熱 =====

  public prewarm(compile: () => void) {
    if (!this.initialized) return;
    this.ensureFlashEl();
    this.rapierProp.visible = true; // 細劍材質隨下列任一次編譯預熱
    this.arena.prewarm(compile);
    this.boss.prewarm(compile);
    this.fx.prewarm(compile);
    this.awakening.prewarm(compile);
    this.rapierProp.visible = false;
  }
}

const ARENA_BOUND = { x: FENCER.ARENA_X, z: FENCER.ARENA_Z, r: FENCER.ARENA_R - 0.15 };
const ARENA_CAMERA_BOUND = { x: FENCER.ARENA_X, z: FENCER.ARENA_Z, r: FENCER.ARENA_R - 0.4 };
