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
  FENCER, SunflowerTaunt, CombatRegen, canSkipIntro, victoryReward, bossBarLabel, BossLineGate, HeartVoice,
  introTimeline, fencerQuestStage, victoryIsLong, INTRO_FIRST, VICTORY_FIRST, VICTORY_REPEAT, CHASE_LINE_MIN_FIGHT_SEC,
  type BossDamageResult, type BossCue, type IntroTimeline
} from './fencerRules';
import {
  INTRO_FIRST_BEATS, INTRO_REMATCH_BEATS, REMATCH_BOSS_LINE, PLAYER_AWAKEN_BUBBLE, AWAKEN_BANNERS, AWAKEN_BANNER_GAP,
  BOSS_OPEN_LINE, BOSS_OPEN_DELAY, BOSS_CUE_LINES, TRANSITION_BEATS, MOVEMENT_BANNERS, HEART_LINES, HEART_LOW_HP,
  HEART_CRITICAL_HP, REGEN_BANNER, VICTORY_FIRST_BEATS, VICTORY_SLEEPY_LINE, VICTORY_BANNER, PLAYER_WIN_BUBBLE,
  REMATCH_WIN_BOSS_LINE, DEFEAT_BOSS_LINES, RESPAWN_HEART_LINE, SUNFLOWER_DAILY_SEC, POKE_PROMPT, DODGE_TEACHER_EGG,
  type StoryBeat, type DailyLine, type HeartLineId
} from './fencerStory';
import { loadFencerSave, storeFencerSave } from './fencerSave';
import { buildRapier } from '../../weapons/models/rapierModel';

// 世界 Boss【花劍客】總控：太陽花戳戳 → 開戰過場 (清場 / 結界 / 暮紅異空間 / Boss 亮相 / 玩家向陽覺醒)
// → 三樂章戰鬥 (回血 / 脫戰快速回氣 / HUD) → 勝利 (獎勵、恢復) / 戰敗 (死亡前還原上限、恢復) / 中止 (切換世界)。
// 校園卸載 / 恢復集中在 BattleModeSwitch；玩家數值集中在 restorePlayerHp() (覺醒還原 + 上限還原同一函式)。

export type FencerPhase = 'IDLE' | 'INTRO' | 'FIGHT' | 'VICTORY' | 'DEFEAT';

/** main 提供的戰鬥模式接點 (NPC 名單切換) */
export interface FencerMainHooks {
  setNpcsSuspended(suspended: boolean): void;
}

// 開戰過場時間軸 (秒)：前段固定；覺醒 / 鏡頭混回 / 結束依首戰 (8.2s) 或再戰 (6.8s) 取 introTimeline()
const T_PETALS = 0.6;
const T_FLASH = 1.0;
const T_WALL_UP = 2.5;
const T_BOSS = 2.6;
const FIGHT_GRACE = 1.0;      // 開戰前 Boss 不出手秒數
const DEFEAT_RESTORE_AT = 1.2;
const DEFEAT_END_AT = 2.6;
const DUSK_SKY = 0x3a1222;
const DUSK_FOG = 0x4a1830;
const DUSK_FOG_DENSITY = 0.018;
const BATTLE_SHADOW_EXTENT = 20;
const POKE_RANGE = 3.2;
const SEPARATION = 0.95;
const EMPTY_COLLIDERS: CollidableBox[] = [];

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();
const _final = new THREE.Vector3();
const _camObstacle = { x: 0, z: 0, r: 0.75, top: 2.5 };
const _vicMid = new THREE.Vector3();
const _vicSide = new THREE.Vector3();
const VICTORY_CAM_BLEND = 0.8;
const RAPIER_DROP_FROM = 7;
const RAPIER_DROP_SEC = 0.28;
const RAPIER_PROP_SCALE = 1.4; // 過場道具放大 (遠鏡頭看得清楚)
const RAPIER_STUCK_Y = 1.16 * RAPIER_PROP_SCALE - 0.25; // 劍尖 (本地 +1.16) 朝下插入草地約 0.25m

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
  // ----- 劇情 (文字見 fencerStory.ts) -----
  private tl: IntroTimeline = INTRO_FIRST;
  private beats: readonly StoryBeat[] = INTRO_FIRST_BEATS;
  private beatIdx = 0;
  private readonly lineGate = new BossLineGate();
  private readonly heart = new HeartVoice();
  private transBar = 1;
  private transBeatIdx = 0;
  private fightFlags = 0;          // 1 = 開戰第一句已處理、2 = 第二則覺醒橫幅已出
  private skippedIntro = false;
  private longVictory = false;     // 首勝 7s 過場 (鎖操作)
  private bannersHeld = false;
  private defeatNotice = false;
  private followUp: DailyLine | null = null;
  private followUpTimer = 0;
  private dodgeEggShown = false;
  private promptN = -1;
  private promptText = '';

  constructor(private readonly ctx: GameContext) {
    const self = this;
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
    world.colliders.push({
      min: new THREE.Vector3(FENCER.CENTER_X - 0.25, 0, FENCER.CENTER_Z - 0.25),
      max: new THREE.Vector3(FENCER.CENTER_X + 0.25, 2.2, FENCER.CENTER_Z + 0.25)
    });
    this.arena = new BossArena(FENCER.CENTER_X, FENCER.CENTER_Z, FENCER.ARENA_R);
    this.fx = new BossFX();
    this.boss = new FencerBoss(this.bossHost, this.fx);
    this.awakening = new PlayerAwakening(engine.scene, player);
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
    if (s.lastResult === 'WIN') this.sunflower.resetPose('SLEEPY');
  }

  private persist() {
    const { progression } = this.ctx;
    storeFencerSave({
      fightsStarted: this.fightsStarted, defeated: progression.fencerDefeated, wins: progression.fencerWins,
      lastResult: this.taunt.lastResult, pokes: this.taunt.pokes, warmLineShown: this.taunt.warmLineShown,
      dodgeEggShown: this.dodgeEggShown
    });
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
    return RESPAWN_HEART_LINE;
  }

  // ===== 狀態 =====

  public get isActive(): boolean {
    return this.phase !== 'IDLE';
  }

  /** 校園已卸載 (戰鬥模式)：main 依此略過校園系統更新 */
  public get isBattleMode(): boolean {
    return this.initialized && this.battle.active;
  }

  /** 鎖操作的過場 (開戰過場 / 首勝 7s 過場)：main 期間只跑 updateCutscene + render */
  public get isCutscene(): boolean {
    return this.phase === 'INTRO' || (this.phase === 'VICTORY' && this.longVictory);
  }

  public get canSkip(): boolean {
    return this.phase === 'INTRO' && canSkipIntro(this.fightsStarted);
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
    return dx * dx + dz * dz < POKE_RANGE * POKE_RANGE && Math.abs(pos.y) < 1.5;
  }

  public pokePromptText(): string {
    const t = this.taunt;
    if (t.lastResult === 'LOSS') return POKE_PROMPT.afterLoss;
    if (t.lastResult === 'WIN') return t.isArmed(performance.now() / 1000) ? POKE_PROMPT.afterWinArmed : POKE_PROMPT.afterWinIdle;
    if (t.pokes !== this.promptN) {
      // 依進度烘托氣氛 (第 5 句後追問、第 9 句後警告)；只在計數變動時組字串
      this.promptN = t.pokes;
      const fmt = t.pokes >= 9 ? POKE_PROMPT.warn : t.pokes >= 5 ? POKE_PROMPT.tense : POKE_PROMPT.calm;
      this.promptText = fmt(t.pokes, FENCER.TAUNT_COUNT);
    }
    return this.promptText;
  }

  public poke(): boolean {
    const res = this.taunt.poke(performance.now() / 1000);
    if (!res.accepted || !res.line) return true;
    this.sunflower.react(res.line.reaction, res.line.face, this.ctx.player.position);
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
    this.tl = introTimeline(this.fightsStarted);
    this.beats = this.fightsStarted <= 1 ? INTRO_FIRST_BEATS
      : this.taunt.lastResult === 'WIN' ? INTRO_REMATCH_BEATS.afterWin : INTRO_REMATCH_BEATS.afterLoss;
    this.beatIdx = 0;
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
    // 玩家站到太陽花南側 11m 面向花
    player.position.set(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 11);
    player.velocity.set(0, 0, 0);
    player.knockVelocity.set(0, 0, 0);
    player.isKnockedFlying = false;
    player.rotationY = Math.PI;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, Math.PI, 0);
    this.setCutsceneUi(true, canSkipIntro(this.fightsStarted));
    this.playBeats(0);
  }

  /** 過場每幀 (main 於過場期間只跑這裡 + render) */
  public updateCutscene(dt: number) {
    if (this.phase === 'VICTORY' && this.longVictory) { this.updateVictoryCutscene(dt); return; }
    if (this.phase !== 'INTRO') return;
    this.timer += dt;
    const t = this.timer;
    this.playBeats(t);
    if (t >= T_PETALS && this.step(1)) {
      this.sunflower.setSpin(18);
      this.fx.petalBurst(FENCER.CENTER_X, 1.8, FENCER.CENTER_Z, 120, 7, PETAL_PALETTE_SUN, 3);
    }
    if (t >= T_FLASH && this.step(2)) this.stepUnloadActors();
    if (t >= T_WALL_UP && this.step(4)) this.stepUnloadWorld();
    if (t >= T_BOSS && this.step(8)) this.stepBossAppear();
    if (t >= this.tl.awaken && this.step(16)) this.stepAwaken(false);
    this.sunflower.update(dt);
    this.arena.update(dt);
    this.boss.update(dt);
    this.fx.update(dt);
    comboFinisherFX.update(dt, this.ctx.cameraCtrl.camera);
    slashFX.update(dt, this.ctx.cameraCtrl.camera);
    this.awakening.update(dt, this.ctx.player.position, false);
    this.ctx.player.updateSkillBubble(dt);
    this.updateCutsceneCamera(t);
    if (t >= this.tl.end) this.finishIntro();
  }

  /** 依時間播放劇情拍點 (字幕 / Boss框 / 玩家框) */
  private playBeats(t: number) {
    const beats = this.beats;
    while (this.beatIdx < beats.length && t >= beats[this.beatIdx].t) this.showBeat(beats[this.beatIdx++]);
  }

  private showBeat(b: StoryBeat) {
    if (b.who === 'PLAYER') this.ctx.player.showSkillBubble(b.text, false);
    else if (b.who === 'BOSS') this.boss.say(b.text, b.dur ?? 2);
    else this.subtitle(b.text);
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
    (engine.scene.background as THREE.Color).setHex(DUSK_SKY);
    const fog = engine.scene.fog as THREE.FogExp2 | null;
    if (fog) { fog.color.setHex(DUSK_FOG); fog.density = DUSK_FOG_DENSITY; }
    engine.hemiLight.color.setHex(0xffc4b0);
    engine.hemiLight.groundColor.setHex(0x3a1020);
    engine.dirLight.color.setHex(0xffb38a);
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
    if (instant) this.awakening.applyInstant();
    else this.awakening.playIntro();
    player.showSkillBubble(PLAYER_AWAKEN_BUBBLE, true);
  }

  private updateCutsceneCamera(t: number) {
    const cam = this.ctx.cameraCtrl.camera;
    const p = this.ctx.player.position;
    const cx = FENCER.CENTER_X;
    const cz = FENCER.CENTER_Z;
    if (t < T_WALL_UP) {
      // 環繞特寫太陽花
      const a = 0.35 + t * 0.35;
      _cam.set(cx + Math.sin(a) * 6.5, 2.6 + t * 0.4, cz + Math.cos(a) * 6.5);
      _look.set(cx, 1.6, cz);
    } else if (t < this.tl.awaken) {
      // 玩家肩後看向結界中心 (花劍客亮相)
      const k = smooth((t - T_WALL_UP) / 0.8);
      _cam.set(p.x + 2.2, 2.2 + 0.6 * (1 - k), p.z + 3.6 - k * 7.5);
      _look.set(cx, 1.5 + (1 - k) * 0.6, cz);
    } else if (t < this.tl.blend) {
      // 玩家正面中景 (變身)
      const k = smooth((t - this.tl.awaken) / 1.5);
      _cam.set(p.x + 1.6, 1.5 + k * 0.4, p.z - 4.6 + k * 0.5);
      _look.set(p.x, 0.9 + k * 0.2, p.z);
    } else {
      // 混回玩家身後 (與 resetBehind 相同公式，結束時無跳切)
      this.behindCamPos(_final);
      const k = smooth((t - this.tl.blend) / (this.tl.end - this.tl.blend));
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

  /** 跳過過場：補做尚未執行的步驟，覺醒直接套用 */
  public skipIntro() {
    if (!this.canSkip) return;
    this.skippedIntro = true;
    if (this.step(1)) { /* 花瓣爆散略過 */ }
    if (this.step(2)) this.stepUnloadActors();
    if (this.step(4)) this.stepUnloadWorld();
    if (this.step(8)) this.stepBossAppear();
    if (this.step(16)) this.stepAwaken(true);
    else this.awakening.applyInstant();
    this.arena.update(10); // 結界直接升滿
    this.boss.update(2);
    this.finishIntro();
  }

  private finishIntro() {
    const { player, cameraCtrl, wantedSystem } = this.ctx;
    this.phase = 'FIGHT';
    this.timer = 0;
    player.isCinematicLocked = false;
    this.sunflower.setVisible(false);
    this.setCutsceneUi(false);
    cameraCtrl.resetBehind(player.position, player.rotationY + Math.PI);
    this.boss.startFight(FIGHT_GRACE);
    this.ctx.input.requestPointerLock();
    this.fightFlags = 0;
    this.releaseBanners();
    wantedSystem.showBanner(AWAKEN_BANNERS[0], AWAKEN_BANNER_GAP * 1000);
  }

  // ===== 戰鬥每幀 (main 一般流程；玩家更新之後) =====

  /** 結界內玩家夾回 + 與 Boss 推擠 (玩家更新之後、戰鬥結算之前) */
  public constrainPlayer() {
    if (this.phase !== 'FIGHT' && this.phase !== 'VICTORY') return;
    if (this.arena.anim === 'DOWN') return;
    const player = this.ctx.player;
    const r = FENCER.ARENA_R - FENCER.PLAYER_CLAMP_PAD;
    const dx = player.position.x - FENCER.CENTER_X;
    const dz = player.position.z - FENCER.CENTER_Z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > r) {
      const nx = dx / d;
      const nz = dz / d;
      player.position.x = FENCER.CENTER_X + nx * r;
      player.position.z = FENCER.CENTER_Z + nz * r;
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
      if (this.ctx.currentWorldType === 'CAMPUS') this.sunflower.update(delta);
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
      const bars = this.boss.bars;
      hud.setBossHealth(Math.max(0, bars.hp), FENCER.BAR_HP, !this.boss.isDefeated, `${bossBarLabel(bars.bar)}`, '🎩');
    } else if (this.phase === 'VICTORY') {
      hud.setBossHealth(0, FENCER.BAR_HP, false);
      if (this.timer >= VICTORY_REPEAT.restoreAt && this.step(32)) this.restoreAfterVictory(true);
      if (this.timer >= VICTORY_REPEAT.end) this.endToIdle();
    } else if (this.phase === 'DEFEAT') {
      hud.setBossHealth(0, FENCER.BAR_HP, false);
      if (this.timer >= DEFEAT_RESTORE_AT && this.step(32)) this.restoreAfterDefeat();
      if (this.timer >= DEFEAT_END_AT) this.endToIdle();
    }
  }

  // 回血：基礎 0.8/s + 脫戰 12/s (80% 以下)；HUD 綠環 / 腳下光圈 / 首次橫幅
  private updateRegen(delta: number) {
    const { player, hud, wantedSystem } = this.ctx;
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
    if (fast && !this.wasFastRegen && !this.regen.bannerShown) {
      this.regen.bannerShown = true;
      if (!this.heartSay('H3')) wantedSystem.showBanner(REGEN_BANNER, 1200); // 每場第一次由向陽之心說
    }
    this.wasFastRegen = fast;
    // 向陽之心：危機打氣 (<20%) / 教脫戰 (<35% 且還在纏鬥)；換樂章過場中不說
    if (!this.boss.isInTransition) {
      const r = player.hp / player.maxHp;
      if (r < HEART_CRITICAL_HP) this.heartSay('H4');
      else if (r < HEART_LOW_HP && !this.regen.outOfCombat) this.heartSay('H2');
    }
  }

  /** 向陽之心橫幅 (每場每句一次、合計 ≤ 4 句)；回傳是否有說 */
  private heartSay(id: HeartLineId): boolean {
    if (!this.heart.tryFire(id)) return false;
    this.ctx.wantedSystem.showBanner(HEART_LINES[id].text, HEART_LINES[id].ms);
    return true;
  }

  // 戰中劇情：開戰第一句 / 第二則覺醒橫幅 / 換樂章對白 (依 Boss 換樂章過場內時間)
  private updateFightStory() {
    const t = this.timer;
    if (!(this.fightFlags & 1) && t >= BOSS_OPEN_DELAY) {
      this.fightFlags |= 1;
      if (this.fightsStarted <= 1) this.boss.say(BOSS_OPEN_LINE, 1.6);
      else if (this.skippedIntro) this.boss.say(this.taunt.lastResult === 'WIN' ? REMATCH_BOSS_LINE.afterWin : REMATCH_BOSS_LINE.afterLoss, 2.4);
    }
    if (!(this.fightFlags & 2) && t >= AWAKEN_BANNER_GAP) {
      this.fightFlags |= 2;
      this.ctx.wantedSystem.showBanner(AWAKEN_BANNERS[1], AWAKEN_BANNER_GAP * 1000);
    }
    const tt = this.boss.transitionTime;
    if (tt >= 0) {
      const beats = TRANSITION_BEATS[this.transBar - 1];
      while (this.transBeatIdx < beats.length && tt >= beats[this.transBeatIdx].t) this.showBeat(beats[this.transBeatIdx++]);
    }
  }

  // Boss 招式宣言 / 收招致意 / 追擊 (頻率規則 BossLineGate)
  private onBossCue(cue: BossCue) {
    if (this.phase !== 'FIGHT') return;
    if (cue === 'CHASE' && this.timer < CHASE_LINE_MIN_FIGHT_SEC) return;
    const bar = this.boss.currentBar;
    if (!this.lineGate.allow(cue, bar)) return;
    const spec = BOSS_CUE_LINES[cue];
    const pool = bar === 0 ? spec.first : spec.later;
    this.boss.say(pool[Math.floor(Math.random() * pool.length)], spec.dur);
    if (cue === 'BOW') this.heartSay('H1');
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
  }

  // ===== 玩家命中 Boss (CombatSystem / 投射物入口；非戰鬥中回傳 null) =====

  public tryHitMelee(origin: THREE.Vector3, reach: number, damage: number): BossDamageResult | null {
    if (this.phase !== 'FIGHT') return null;
    return this.boss.tryHitMelee(origin, reach, damage);
  }

  public tryHitAoe(center: THREE.Vector3, radius: number, damage: number, shape: PlantAoeShape | null): BossDamageResult | null {
    if (this.phase !== 'FIGHT') return null;
    return this.boss.tryHitAoe(center, radius, damage, shape);
  }

  /** 投射物點判定 (gameHost.hitBossAt) */
  public hitBossAt(point: THREE.Vector3, r: number, damage: number): BossDamageResult | null {
    if (this.phase !== 'FIGHT') return null;
    return this.boss.tryHitAtPoint(point, r, damage);
  }

  private onBossDamaged(res: BossDamageResult, _point: THREE.Vector3) {
    this.regen.onPlayerAttack(); // 命中 Boss (含遠程) 視為出手
    if (res.applied <= 0) return;
    if (res.defeated) {
      this.startVictory();
    } else if (res.barBroken) {
      const next = Math.min(FENCER.BARS - 1, this.boss.bars.bar + 1);
      this.transBar = Math.max(1, next);
      this.transBeatIdx = 0;
      this.ctx.wantedSystem.showBanner(MOVEMENT_BANNERS[next], 3000); // 對白交給 Boss框
    }
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
    this.timer = 0;
    this.introSteps = 0;
    this.ctx.combat.requestHitStop(0.25);
    this.fx.setRegenRing(false);
    this.ctx.hud.setHpRegen(false);
    const first = !progression.fencerDefeated;
    const reward = victoryReward(!first);
    this.longVictory = victoryIsLong(!first);
    this.boss.defeatDissolveAt = first ? VICTORY_FIRST.dissolveAt : VICTORY_REPEAT.dissolveAt;
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
      this.boss.say(REMATCH_WIN_BOSS_LINE, 1.6);
      player.showSkillBubble(PLAYER_WIN_BUBBLE, true);
    }
    soundManager.playFanfare();
    this.taunt.recordResult('WIN');
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
    this.beats = VICTORY_FIRST_BEATS;
    this.beatIdx = 0;
    this.setCutsceneUi(true, false);
    this.playBeats(0);
  }

  // 首勝 7s 過場每幀：0.25 停格 → 跪地 / 回禮 / 化花瓣 / 光還太陽花 / 恢復校園 / 細劍插地 (替身) → 解鎖
  private updateVictoryCutscene(dt: number) {
    const { player, combat, hud } = this.ctx;
    this.timer += dt;
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
    this.playBeats(t);
    if (t >= VICTORY_FIRST.faceAt && this.step(128)) {
      // 玩家轉向 Boss 回禮
      player.rotationY = Math.atan2(this.boss.position.x - player.position.x, this.boss.position.z - player.position.z);
      player.mesh.rotation.set(0, player.rotationY, 0);
    }
    if (t >= VICTORY_FIRST.outroAt && this.step(256)) this.awakening.playOutro(); // 胸口的光 (日輪花瓣) 飛回太陽花
    if (t >= VICTORY_FIRST.restoreAt && this.step(32)) this.restoreAfterVictory(false);
    if (t >= VICTORY_FIRST.rapierAt && this.step(512)) this.dropRapier();
    this.updateRapierDrop(t);
    this.updateVictoryCamera(t);
    if (t >= VICTORY_FIRST.end) this.finishVictoryCutscene();
  }

  // 細劍自天而降、插進玩家面前的草地 (玫瑰細劍武器模型，預建隱藏；劍尖朝下)
  private dropRapier() {
    const p = this.ctx.player.position;
    const yaw = this.ctx.player.rotationY;
    const sword = this.rapierProp;
    // 前方 1.6m、偏一側 0.8m (不被玩家身體擋住)
    sword.position.set(p.x + Math.sin(yaw) * 1.6 - Math.cos(yaw) * 0.8, RAPIER_DROP_FROM, p.z + Math.cos(yaw) * 1.6 + Math.sin(yaw) * 0.8);
    sword.rotation.set(Math.PI, yaw, 0.12);
    sword.visible = true;
  }

  private updateRapierDrop(t: number) {
    const sword = this.rapierProp;
    if (!sword.visible) return;
    const k = Math.min(1, (t - VICTORY_FIRST.rapierAt) / RAPIER_DROP_SEC);
    sword.position.y = RAPIER_DROP_FROM + (RAPIER_STUCK_Y - RAPIER_DROP_FROM) * k * k;
    if (k >= 1 && this.step(2048)) {
      const { x, z } = sword.position;
      this.fx.petalBurst(x, 0.4, z, 50, 3.5, PETAL_PALETTE_ROSE, 2.5);
      this.fx.petalBurst(x, 1.2, z, 30, 2, PETAL_PALETTE_SUN, 2);
      slashFX.hitFlash(x, 0.3, z, 0xffe0ea);
      soundManager.playRapierThrust(_v.set(x, 0.3, z));
      requestCameraShake(0.15);
    }
  }

  // 首勝過場鏡頭：玩家斜後方望向跪地的 Boss (兩人前後排開，手機直屏窄視角也同框)，緩慢推近；最後 0.8s 混回玩家身後
  private updateVictoryCamera(t: number) {
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
      if ((p.x + nx - FENCER.CENTER_X) ** 2 + (p.z + nz - FENCER.CENTER_Z) ** 2 > (p.x - nx - FENCER.CENTER_X) ** 2 + (p.z - nz - FENCER.CENTER_Z) ** 2) { nx = -nx; nz = -nz; }
      _vicSide.set(nx, 0, nz);
    }
    const ux = _vicMid.x;
    const uz = _vicMid.z;
    const back = 3.8 - Math.min(1, t / VICTORY_FIRST.end) * 0.8; // 緩慢推近
    _cam.set(p.x - ux * back + _vicSide.x * 1.7, 2.1, p.z - uz * back + _vicSide.z * 1.7);
    // 留在結界內 (看不到牆外)
    const ox = _cam.x - FENCER.CENTER_X;
    const oz = _cam.z - FENCER.CENTER_Z;
    const od = Math.hypot(ox, oz);
    const maxR = FENCER.ARENA_R - 1.2;
    if (od > maxR) { _cam.x = FENCER.CENTER_X + (ox / od) * maxR; _cam.z = FENCER.CENTER_Z + (oz / od) * maxR; }
    const ahead = Math.min(_vicMid.y * 0.6, 4);
    _look.set(p.x + ux * ahead, 1.0, p.z + uz * ahead);
    const blendFrom = VICTORY_FIRST.end - VICTORY_CAM_BLEND;
    if (t > blendFrom) {
      const k = smooth((t - blendFrom) / VICTORY_CAM_BLEND);
      _cam.lerp(this.behindCamPos(_final), k);
      _look.lerp(_v.set(p.x, 1.35, p.z), k);
    }
    cam.position.copy(_cam);
    cam.lookAt(_look);
  }

  private finishVictoryCutscene() {
    const { player, cameraCtrl } = this.ctx;
    if (this.step(32)) this.restoreAfterVictory(false);
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
    this.timer = 0;
    this.introSteps &= ~32;
    this.boss.triumph();
    this.boss.say(DEFEAT_BOSS_LINES[Math.floor(Math.random() * DEFEAT_BOSS_LINES.length)], 2.0);
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
    this.releaseBanners();
    if (wasFighting && this.taunt.lastResult === 'NONE') this.taunt.recordResult('LOSS');
    this.persist();
    this.exitBattleMode();
    this.sunflower.resetPose(this.taunt.lastResult === 'WIN' ? 'SLEEPY' : 'SMUG');
    this.endToIdle();
    this.arena.hideNow();
  }

  private endToIdle() {
    this.phase = 'IDLE';
    if (this.rapierProp) this.rapierProp.visible = false;
    this.ctx.cameraCtrl.obstacle = null;
    this.timer = 0;
    this.boss.hide();
    this.fx.reset();
    this.ctx.hud.setBossHealth(0, FENCER.BAR_HP, false);
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
    for (const id of ['hud-overlay', 'mobile-controls-container']) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = on ? 'hidden' : '';
    }
    const overlay = document.getElementById('cutscene-overlay');
    if (overlay) overlay.style.display = on ? 'flex' : 'none';
    const skip = document.getElementById('cutscene-skip-btn');
    if (skip) skip.style.display = on && skippable ? '' : 'none';
    if (!on) {
      const sub = document.getElementById('cutscene-subtitle-text');
      if (sub) sub.textContent = '';
      if (skip) skip.style.display = '';
    }
  }

  private subtitle(text: string) {
    if (typeof document === 'undefined') return;
    const sub = document.getElementById('cutscene-subtitle-text');
    if (sub) sub.textContent = text;
  }

  private whiteFlash() {
    if (typeof document === 'undefined') return;
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9000;transition:opacity 0.15s ease-out;';
      document.body.appendChild(this.flashEl);
    }
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.35s ease-out';
    el.style.opacity = '0';
  }

  // ===== 預熱 =====

  public prewarm(compile: () => void) {
    if (!this.initialized) return;
    this.rapierProp.visible = true; // 細劍材質隨下列任一次編譯預熱
    this.arena.prewarm(compile);
    this.boss.prewarm(compile);
    this.fx.prewarm(compile);
    this.awakening.prewarm(compile);
    this.rapierProp.visible = false;
  }
}

const ARENA_BOUND = { x: FENCER.CENTER_X, z: FENCER.CENTER_Z, r: FENCER.ARENA_R - 0.15 };
const ARENA_CAMERA_BOUND = { x: FENCER.CENTER_X, z: FENCER.CENTER_Z, r: FENCER.ARENA_R - 0.4 };
