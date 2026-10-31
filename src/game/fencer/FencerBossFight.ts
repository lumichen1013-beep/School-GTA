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
  FENCER, SunflowerTaunt, CombatRegen, canSkipIntro, victoryReward, bossBarLabel, MOVEMENT_NAMES,
  type BossDamageResult
} from './fencerRules';

// 世界 Boss【花劍客】總控：太陽花戳戳 → 開戰過場 (清場 / 結界 / 暮紅異空間 / Boss 亮相 / 玩家向陽覺醒)
// → 三樂章戰鬥 (回血 / 脫戰快速回氣 / HUD) → 勝利 (獎勵、恢復) / 戰敗 (死亡前還原上限、恢復) / 中止 (切換世界)。
// 校園卸載 / 恢復集中在 BattleModeSwitch；玩家數值集中在 restorePlayerHp() (覺醒還原 + 上限還原同一函式)。

export type FencerPhase = 'IDLE' | 'INTRO' | 'FIGHT' | 'VICTORY' | 'DEFEAT';

/** main 提供的戰鬥模式接點 (NPC 名單切換) */
export interface FencerMainHooks {
  setNpcsSuspended(suspended: boolean): void;
}

// 開戰過場時間軸 (秒)：變身與 Boss 劍禮台詞重疊，總長 6.8s
const T_PETALS = 0.6;
const T_FLASH = 1.0;
const T_WALL_UP = 2.5;
const T_BOSS = 2.6;
const T_AWAKEN = 4.5;
const T_BLEND = 6.0;
const T_END = 6.8;
const FIGHT_GRACE = 1.0;      // 開戰前 Boss 不出手秒數
const VICTORY_RESTORE_AT = 2.2;
const VICTORY_END_AT = 3.6;
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
  private battle!: BattleModeSwitch;
  private hooks: FencerMainHooks | null = null;
  private timer = 0;
  private introSteps = 0;   // 已執行的過場步驟位元
  private savedWeather: Parameters<GameContext['weatherSystem']['setWeather']>[0] = 'SUNNY';
  private flashEl: HTMLDivElement | null = null;
  private wasFastRegen = false;
  private readonly bossHost: FencerBossHost;
  private initialized = false;

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
      hitStop: (s) => this.ctx.combat.requestHitStop(s)
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
    engine.scene.add(this.arena.group, this.boss.container, this.fx.group);
    this.battle = new BattleModeSwitch({
      actorsDetach: () => [ecologicalGarden.group, ...this.ctx.campusNPCs.map((n) => n.mesh)],
      actorsHide: () => [...this.ctx.bicycles.map((b) => b.mesh), this.ctx.basketballGame.basketballMesh],
      worldDetach: () => [world.group]
    });
    void player;
  }

  // ===== 狀態 =====

  public get isActive(): boolean {
    return this.phase !== 'IDLE';
  }

  /** 校園已卸載 (戰鬥模式)：main 依此略過校園系統更新 */
  public get isBattleMode(): boolean {
    return this.initialized && this.battle.active;
  }

  public get isCutscene(): boolean {
    return this.phase === 'INTRO';
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
    if (!this.taunt.needsFullTaunt) return '🌻 戳一下太陽花 (再戰花劍客)';
    return `🌻 戳一下太陽花 (${this.taunt.pokes}/${FENCER.TAUNT_COUNT})`;
  }

  public poke(): boolean {
    const res = this.taunt.poke(performance.now() / 1000);
    if (!res.accepted || !res.line) return true;
    this.sunflower.react(res.line.reaction, res.line.face, this.ctx.player.position);
    this.sunflower.say(res.line.text, res.startFight ? 2.2 : 3.0);
    if (res.line.reaction === 'STIFFEN_HUM') soundManager.playBarrierHum(this.sunflower.position);
    else soundManager.playPetalBloom(this.sunflower.position);
    if (res.startFight) {
      this.ctx.wantedSystem.showBanner(`🌻「${res.line.text}」`, 2500);
      this.startIntro();
    }
    return true;
  }

  // ===== 開戰過場 =====

  private startIntro() {
    const { player, basketballGame, hud, wantedSystem } = this.ctx;
    this.fightsStarted++;
    this.phase = 'INTRO';
    this.timer = 0;
    this.introSteps = 0;
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
    this.setCutsceneUi(true);
    this.subtitle('🌻 太陽花：「看來不好好教訓你不行了……」');
  }

  /** 過場每幀 (main 於過場期間只跑這裡 + render) */
  public updateCutscene(dt: number) {
    if (this.phase !== 'INTRO') return;
    this.timer += dt;
    const t = this.timer;
    if (t >= T_PETALS && this.step(1)) {
      this.sunflower.setSpin(18);
      this.fx.petalBurst(FENCER.CENTER_X, 1.8, FENCER.CENTER_Z, 120, 7, PETAL_PALETTE_SUN, 3);
    }
    if (t >= T_FLASH && this.step(2)) this.stepUnloadActors();
    if (t >= T_WALL_UP && this.step(4)) this.stepUnloadWorld();
    if (t >= T_BOSS && this.step(8)) this.stepBossAppear();
    if (t >= T_AWAKEN && this.step(16)) this.stepAwaken(false);
    this.sunflower.update(dt);
    this.arena.update(dt);
    this.boss.update(dt);
    this.fx.update(dt);
    comboFinisherFX.update(dt, this.ctx.cameraCtrl.camera);
    slashFX.update(dt, this.ctx.cameraCtrl.camera);
    this.awakening.update(dt, this.ctx.player.position, false);
    this.ctx.player.updateSkillBubble(dt);
    this.updateCutsceneCamera(t);
    if (t >= T_END) this.finishIntro();
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
    this.subtitle('🎩 花劍客・向日爵士：「午茶時間到了，就讓我來教教你什麼叫禮貌。」');
  }

  // 4.5s 玩家向陽覺醒 (數值立即套用；跳過時直接套用常駐視覺)
  private stepAwaken(instant: boolean) {
    const { player } = this.ctx;
    this.stats.apply(player);
    this.regen.reset();
    if (instant) this.awakening.applyInstant();
    else this.awakening.playIntro();
    player.showSkillBubble('☀️ 向陽覺醒', true);
    if (!instant) this.subtitle('☀️ 太陽花最後一道朝陽選擇了你——向陽覺醒！');
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
    } else if (t < T_AWAKEN) {
      // 玩家肩後看向結界中心 (花劍客亮相)
      const k = smooth((t - T_WALL_UP) / 0.8);
      _cam.set(p.x + 2.2, 2.2 + 0.6 * (1 - k), p.z + 3.6 - k * 7.5);
      _look.set(cx, 1.5 + (1 - k) * 0.6, cz);
    } else if (t < T_BLEND) {
      // 玩家正面中景 (變身)
      const k = smooth((t - T_AWAKEN) / 1.5);
      _cam.set(p.x + 1.6, 1.5 + k * 0.4, p.z - 4.6 + k * 0.5);
      _look.set(p.x, 0.9 + k * 0.2, p.z);
    } else {
      // 混回玩家身後 (與 resetBehind 相同公式，結束時無跳切)
      this.behindCamPos(_final);
      const k = smooth((t - T_BLEND) / (T_END - T_BLEND));
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
    wantedSystem.showBanner('☀️ 向陽覺醒！體力上限 200・戰鬥中持續回氣，拉開距離可快速回氣！', 3500);
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
      if (this.ctx.currentWorldType === 'CAMPUS') this.sunflower.update(delta);
      if (this.arena.anim !== 'DOWN') this.arena.update(delta);
      if (this.fx.group.visible) this.fx.update(delta);
      if (this.awakening.isOn) this.awakening.update(delta, this.ctx.player.position, this.ctx.player.isDead); // 勝利還原收尾
      return;
    }
    if (this.phase === 'INTRO') return;
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
      this.updateRegen(delta);
      const bars = this.boss.bars;
      hud.setBossHealth(Math.max(0, bars.hp), FENCER.BAR_HP, !this.boss.isDefeated, `${bossBarLabel(bars.bar)}`, '🎩');
    } else if (this.phase === 'VICTORY') {
      hud.setBossHealth(0, FENCER.BAR_HP, false);
      if (this.timer >= VICTORY_RESTORE_AT && this.step(32)) this.restoreAfterVictory();
      if (this.timer >= VICTORY_END_AT) this.endToIdle();
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
      wantedSystem.showBanner('🍃 脫離戰鬥・快速回氣', 1200);
    }
    this.wasFastRegen = fast;
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
      this.ctx.wantedSystem.showBanner(`🎩 花劍客脫帽致意……「${MOVEMENT_NAMES[next]}，開始。」(換樂章：喘口氣快速回氣)`, 4000);
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
    this.introSteps &= ~32;
    this.ctx.combat.requestHitStop(0.25);
    this.fx.setRegenRing(false);
    this.ctx.hud.setHpRegen(false);
    const first = !progression.fencerDefeated;
    const reward = victoryReward(!first);
    progression.addCash(reward);
    progression.fencerWins++;
    if (first) {
      progression.fencerDefeated = true;
      // TODO(細劍)：首勝解鎖新武器「細劍」——由細劍實作接手，例如
      // progression.unlockWeapon('RAPIER', { text: '🗡️ 獲得花劍客的【細劍】！', duration: 7000, sfx: () => soundManager.playFanfare() });
      wantedSystem.showBanner(`🎩 擊敗世界 Boss【花劍客・向日爵士】！獲得零用錢 +$${reward}！`, 6000);
    } else {
      wantedSystem.showBanner(`🎩 再次擊敗花劍客！獲得零用錢 +$${reward}！`, 4500);
    }
    soundManager.playFanfare();
    this.taunt.recordResult('WIN');
    player.showSkillBubble('🏆 勝利！', true);
  }

  // 勝利：降下前一幀先掛回校園、還原背景 / 霧 / 天氣，再降結界；覺醒播放還原、體力上限還原並補滿
  private restoreAfterVictory() {
    this.exitBattleMode();
    this.arena.lower();
    this.stats.remove(this.ctx.player, true);
    this.awakening.playOutro();
    this.sunflower.resetPose('SLEEPY');
    this.sunflower.say('呼……呼……(太陽花打起了瞌睡)', 3);
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
    this.fx.setRegenRing(false);
    this.ctx.hud.setHpRegen(false);
    this.taunt.recordResult('LOSS');
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
    if (this.phase === 'INTRO') {
      this.ctx.player.isCinematicLocked = false;
      this.setCutsceneUi(false);
    }
    if (wasFighting && this.taunt.lastResult === 'NONE') this.taunt.recordResult('LOSS');
    this.exitBattleMode();
    this.sunflower.resetPose(this.taunt.lastResult === 'WIN' ? 'SLEEPY' : 'SMUG');
    this.endToIdle();
    this.arena.hideNow();
  }

  private endToIdle() {
    this.phase = 'IDLE';
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

  private setCutsceneUi(on: boolean) {
    if (typeof document === 'undefined') return;
    for (const id of ['hud-overlay', 'mobile-controls-container']) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = on ? 'hidden' : '';
    }
    const overlay = document.getElementById('cutscene-overlay');
    if (overlay) overlay.style.display = on ? 'flex' : 'none';
    const skip = document.getElementById('cutscene-skip-btn');
    if (skip) skip.style.display = on && canSkipIntro(this.fightsStarted) ? '' : 'none';
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
    this.arena.prewarm(compile);
    this.boss.prewarm(compile);
    this.fx.prewarm(compile);
    this.awakening.prewarm(compile);
  }
}

const ARENA_BOUND = { x: FENCER.CENTER_X, z: FENCER.CENTER_Z, r: FENCER.ARENA_R - 0.15 };
const ARENA_CAMERA_BOUND = { x: FENCER.CENTER_X, z: FENCER.CENTER_Z, r: FENCER.ARENA_R - 0.4 };
