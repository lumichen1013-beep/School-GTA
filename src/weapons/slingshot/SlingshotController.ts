import * as THREE from 'three';
import type { GameContext } from '../../game/GameContext';
import type { KfMove } from '../../entities/shared/kungfu';
import type { NPC } from '../../entities/NPC';
import { soundManager } from '../../audio/SoundEffects';
import { slashFX } from '../../effects/SlashFX';
import { WEAPON_FX_STYLES } from '../../effects/weaponFxStyle';
import { getWeapon } from '../registry';
import { createProjectileSpawnOpts, PFLAG_TRACER, PROJ_STONE, type ProjectileEvent, type ProjectileSpawnOpts } from '../projectiles/ProjectileSystem';
import { PRE_INPUT_WINDOW, ScreenReticle } from '../rangedCommon';
import {
  SLING_AIM_RANGE, SLING_BODY_HEIGHT, SLING_HEAD_HEIGHT, SLING_LOCK_INTERVAL, SLING_SCOPE_HALF_ANGLE, SLING_TOUCH_HALF_ANGLE, pickSlingTarget, rayConvergeDistance
} from './aim';
import { SLING, canRelease, chargeDamageFrac, chargeRatio, chargeSpeed, solvePitch } from './ballistics';

// 彈弓武器狀態機 (僅 DEV_WEAPONS_BUILD 的建置由 main.ts 建立；正式版整檔 tree-shake，頂層無副作用)。
// 與籃球共用：預輸入緩衝 (rangedCommon.PRE_INPUT_WINDOW)、DOM 準星 (ScreenReticle)、投射物池 / 命中結算 (ProjectileSystem)、
// Player.attackLock、目標選擇與瞄準模組 (basketball/aim 的 AimCandidate 與 slingshot/aim)。
//   IDLE     持弓待命：按住攻擊鍵 (左鍵 / F / 手機攻擊鍵) → CHARGING
//   CHARGING 蓄力並開鏡 (放開前不鎖攻擊，但不出招)：< 0.25 秒放開 = 取消不射；≥ 0.25 秒放開 → 播「放弦」招式 → WINDUP
//   WINDUP   放弦預備 (已鎖攻擊)，到命中時間點 (離弦) 由 CombatSystem 呼叫 launch() 發射石子 → RELOAD
//   RELOAD   上彈 0.35 秒 (攻擊鎖定；此期間按攻擊進 0.25 秒預輸入，上彈完成且仍按住時自動開始下一發的蓄力)
// 取消 (換武器 / 上車 / 換世界 / 死亡 / 受擊倒地 / 手持小遊戲籃球)：cancel() 收回開鏡、準星與 LOD 提升；飛行中的石子保持原軌跡。
const HOLD_FAILSAFE = 30;            // 蓄力最長持續秒數 (異常保險：輸入狀態遺失時強制取消)
const ORIGIN_HEIGHT = 1.4;           // 出手高度 (高於腳底)
const ORIGIN_FORWARD = 0.45;         // 出手點前移距離
const DESKTOP_CONVERGE = 50;         // 桌機：鏡頭中心射線上無任何目標 / 牆時，彈道朝此距離的點收斂 (m)；否則朝準星所指之處收斂
const STEADY_ANGULAR_SPEED = 0.35;   // 手機穩住判定：鏡頭角速度低於此值 (rad/s)
const STONE_LIFE = 2.0;              // 石子保險壽命 (秒)；40 m/s 飛 50m 需 1.25 秒
const HEAD_X_HALF_LEN = 0.55;        // 爆頭 X 字單臂半長 (m)
const MAX_PITCH_DELTA = 1.2;         // 手機補償仰角上限 (rad)

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _p = new THREE.Vector3();
const _look = new THREE.Vector3();

export type SlingState = 'IDLE' | 'CHARGING' | 'WINDUP' | 'RELOAD';

export class SlingshotController {
  public state: SlingState = 'IDLE';
  public charge = 0;               // 蓄力秒數
  public buffer = 0;               // 預輸入剩餘秒數
  public lockTarget: NPC | null = null;
  public headLocked = false;       // 手機：滿蓄力穩住後準星縮小並移到頭部
  public steady = 0;               // 手機：滿蓄力後穩住累計秒數

  private readonly combo = getWeapon('SLINGSHOT').combo;
  private readonly opts: ProjectileSpawnOpts = createProjectileSpawnOpts(PROJ_STONE);
  private readonly vel = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly reticle = new ScreenReticle('slingReticle', 'sling-reticle');
  private reloadTimer = 0;
  private lockTimer = 0;
  private holdTime = 0;
  private ringFull = false;
  private shotCharge = 0;          // 放手當下鎖定的蓄力秒數 (WINDUP / launch 使用)
  private shotHead = false;        // 本發是否可享爆頭倍率 (手機需穩住)
  private lastYaw = 0;
  private lastPitch = 0;
  private hasLastAngle = false;
  private zoomBoosted: NPC | null = null;
  private readonly onEvent = (ev: ProjectileEvent) => this.handleEvent(ev);

  constructor(private readonly ctx: GameContext) {
    const o = this.opts;
    o.radius = SLING.projectileRadius;
    o.gravity = SLING.gravity;
    o.maxRange = SLING.range;
    o.maxLife = STONE_LIFE;
    o.knockback = 0;
    o.mode = 'LIGHT'; // 不擊退 (NPC 被打照常轉為追擊)
    o.falloffNear = SLING.falloffNear;
    o.falloffFar = SLING.range;
    o.falloffMin = SLING.falloffMin;
    o.headHitStop = SLING.headHitStop;
    o.flags = PFLAG_TRACER; // 不穿透、不彈跳、不回收：命中 / 撞牆 / 落地即結束
    o.launchSound = 'slingTwang';
    o.hitSound = 'stoneHit';
    o.wallSound = 'stoneHit';
    o.floorSound = 'stoneHit';
    o.hitFlashColor = 0xfff2cc;
    o.tracerColor = 0xfff2cc;
    o.tracerHalfWidth = 0.04;
    o.onEvent = this.onEvent;
  }

  // 目前是否為「彈弓可用」狀態 (小遊戲持球、騎車、羽球拍、非校園、死亡、暗殺動作中皆不可)
  public get enabled(): boolean {
    const c = this.ctx;
    const p = c.player;
    return c.currentWorldType === 'CAMPUS' && p.currentWeapon === 'SLINGSHOT' && !p.isHoldingRacket && !p.isDead &&
      !c.basketballGame.isHolding && !c.currentRidingBike && !p.isRidingVehicle && !c.combat.isExecutionActive;
  }

  private get holding(): boolean {
    const i = this.ctx.input;
    return !!(i.mouseButtons.left || i.keys['KeyF']);
  }

  private get zoomFactor(): number {
    return this.ctx.input.isTouchDevice ? SLING.zoomTouch : SLING.zoomDesktop;
  }

  // 玩家狀態不允許繼續蓄力 (受擊倒地 / 擊飛 / 閃身 / 後空翻 / 游泳)
  private get playerDisrupted(): boolean {
    const p = this.ctx.player;
    return p.isKnockedFlying || p.knockdownTimer > 0 || p.isDodging || p.isBackflipping || p.isSwimming;
  }

  // 攻擊鍵按下：回傳 true = 由彈弓接管 (CombatSystem 不再處理)
  public handleAttack(): boolean {
    if (!this.enabled) return false;
    if (this.state === 'IDLE' && this.ctx.player.canAttack) this.beginCharge();
    else if (this.state !== 'CHARGING') this.buffer = PRE_INPUT_WINDOW;
    return true;
  }

  private beginCharge() {
    const { player } = this.ctx;
    this.state = 'CHARGING';
    this.charge = 0;
    this.holdTime = 0;
    this.buffer = 0;
    this.steady = 0;
    this.headLocked = false;
    this.ringFull = false;
    this.lockTimer = 0;
    this.hasLastAngle = false;
    soundManager.playSlingDraw(player.position);
    this.chargeRing();
  }

  // 蓄力光環 (slashFX.chargeRing；低檔為單圈，見 fxQuality.chargeRingDouble)
  private chargeRing() {
    const { player } = this.ctx;
    const c = WEAPON_FX_STYLES.STONE.color;
    slashFX.chargeRing(player.position.x, player.position.y + 0.9, player.position.z, c, WEAPON_FX_STYLES.STONE.tipColor);
  }

  // 每幀 (投射物更新之前)：蓄力 / 開鏡 / 鎖定 / 上彈 / 預輸入 / 準星
  public update(delta: number) {
    const { player, cameraCtrl } = this.ctx;
    this.ctx.combat.updateHitText(delta);
    if (!this.enabled) {
      if (this.state !== 'IDLE' || this.zoomBoosted || this.reticleOn) this.cancel();
      this.buffer = 0;
      return;
    }
    if (this.buffer > 0) this.buffer -= delta;
    switch (this.state) {
      case 'CHARGING':
        if (this.playerDisrupted) { this.cancel(); break; }
        this.holdTime += delta;
        if (!this.holding || this.holdTime > HOLD_FAILSAFE) { this.release(); break; }
        this.charge = Math.min(this.charge + delta, SLING.chargeFull);
        if (!this.ringFull && this.charge >= SLING.chargeFull) { this.ringFull = true; this.chargeRing(); }
        this.updateLock(delta);
        break;
      case 'WINDUP':
        // 放弦被中斷 (閃身 / 受擊使出招取消) 而尚未離弦：回到待命
        if (!player.isAttacking) this.finishShot();
        break;
      case 'RELOAD':
        this.reloadTimer -= delta;
        if (this.reloadTimer <= 0) this.finishShot();
        break;
      default:
        break;
    }
    if (this.state === 'IDLE' && this.buffer > 0 && this.holding && player.canAttack) this.beginCharge(); // 上彈完成瞬間自動蓄力下一發
    const charging = this.state === 'CHARGING';
    const ratio = charging ? chargeRatio(this.charge) : 0;
    cameraCtrl.aimZoom = ratio;
    cameraCtrl.aimZoomFactor = this.zoomFactor;
    player.aimCharge = ratio;
    if (charging) {
      const f = cameraCtrl.getForwardVector();
      player.aimYaw = Math.atan2(f.x, f.z);
      this.updateReticle();
    } else {
      player.aimYaw = null;
      this.reticle.show(false);
    }
  }

  private reticleOn = false;

  // 目標鎖定 (每 0.1 秒一次，含視線檢查)：手機 ±25° 自動鎖定最接近畫面中心者；桌機只用小錐 (±8°) 決定開鏡 LOD 提升對象，不輔助瞄準
  private updateLock(delta: number) {
    const { player, cameraCtrl, npcs, input, activeColliders } = this.ctx;
    // 穩住判定 (手機)：滿蓄力後鏡頭角速度低於門檻且鎖定未換，累計 0.25 秒 → 頭部瞄準
    const yaw = cameraCtrl.yaw, pitch = cameraCtrl.pitch;
    let moved = false;
    if (this.hasLastAngle && delta > 0) {
      const w = (Math.abs(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw))) + Math.abs(pitch - this.lastPitch)) / delta;
      if (w > STEADY_ANGULAR_SPEED) { moved = true; this.steady = 0; this.headLocked = false; }
    }
    this.lastYaw = yaw; this.lastPitch = pitch; this.hasLastAngle = true;
    if (!moved && input.isTouchDevice && this.charge >= SLING.chargeFull && this.lockTarget && !this.lockTarget.isKnockedDown) {
      this.steady += delta;
      if (this.steady >= SLING.steadyTime) this.headLocked = true;
    }
    if (this.lockTarget && (this.lockTarget.isKnockedDown || this.lockTarget.isPermanentlyKnockedOut)) this.setLock(null);

    this.lockTimer -= delta;
    if (this.lockTimer > 0) return;
    this.lockTimer = SLING_LOCK_INTERVAL;
    const f = cameraCtrl.getForwardVector();
    const t = pickSlingTarget(npcs, activeColliders, player.position.x, player.position.y, player.position.z, f.x, f.z,
      input.isTouchDevice ? SLING_TOUCH_HALF_ANGLE : SLING_SCOPE_HALF_ANGLE, SLING_AIM_RANGE);
    if (t !== this.lockTarget) this.setLock(t);
  }

  // 換鎖定目標：還原舊目標 LOD、提升新目標 LOD (只提升被鎖定者：距離 ÷ 開鏡倍率)，重置穩住計時
  private setLock(t: NPC | null) {
    if (this.zoomBoosted) { this.zoomBoosted.lodBoost = 1; this.zoomBoosted = null; }
    this.lockTarget = t;
    this.steady = 0;
    this.headLocked = false;
    if (t) { t.lodBoost = this.zoomFactor; this.zoomBoosted = t; }
  }

  // 準星 (DOM)：桌機 = 螢幕中心十字；手機 = 鎖定目標的胸口圈，穩住後縮小移到頭部；手機無鎖定時為中心十字
  private updateReticle() {
    const { input, cameraCtrl } = this.ctx;
    const r = this.reticle;
    this.reticleOn = true;
    const t = this.lockTarget;
    if (input.isTouchDevice && t) {
      _p.set(t.position.x, t.position.y + (this.headLocked ? SLING_HEAD_HEIGHT : SLING_BODY_HEIGHT), t.position.z);
      if (r.placeAt(_p, cameraCtrl.camera)) {
        r.setModifier(this.headLocked ? 'sling-reticle--head' : 'sling-reticle--lock');
        r.show(true);
        return;
      }
    }
    r.setModifier(this.charge >= SLING.chargeFull ? 'sling-reticle--full' : '');
    r.placeCenter();
    r.show(true);
  }

  // 放手：蓄力不足 → 取消；否則鎖定瞄準方向並播「放弦」，離弦時間點由 launch() 發射
  private release() {
    const { player } = this.ctx;
    if (!canRelease(this.charge) || !player.canAttack) { this.cancel(); return; }
    this.shotCharge = this.charge;
    this.computeShot();
    player.faceDirection(_dir.x, _dir.z);
    this.endAim();
    if (!player.attack()) { this.cancel(); return; }
    player.attackLock = true;
    this.state = 'WINDUP';
  }

  // 計算出手向量 (this.vel)：桌機朝鏡頭中心射線上 DESKTOP_CONVERGE 處的點，不補償下墜；
  // 手機有鎖定目標時直瞄胸口 / 頭部 (穩住後)，依距離自動補償下墜 (低弧解)
  private computeShot() {
    const { player, cameraCtrl, input } = this.ctx;
    const speed = chargeSpeed(this.shotCharge);
    const cam = cameraCtrl.camera;
    cam.getWorldDirection(_look);
    const t = this.lockTarget;
    let aimed = false;
    this.shotHead = !input.isTouchDevice;
    if (input.isTouchDevice && t && !t.isKnockedDown && !t.isPermanentlyKnockedOut) {
      this.shotHead = this.headLocked;
      const ay = t.position.y + (this.headLocked ? SLING_HEAD_HEIGHT : SLING_BODY_HEIGHT);
      const hx = t.position.x - player.position.x, hz = t.position.z - player.position.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 0.5) {
        _origin.set(player.position.x + (hx / hd) * ORIGIN_FORWARD, player.position.y + ORIGIN_HEIGHT, player.position.z + (hz / hd) * ORIGIN_FORWARD);
        const dist = hd - ORIGIN_FORWARD;
        let pitch = solvePitch(speed, dist, ay - _origin.y);
        const direct = Math.atan2(ay - _origin.y, dist);
        pitch = Math.max(direct - 0.05, Math.min(direct + MAX_PITCH_DELTA, pitch));
        _dir.set((hx / hd) * Math.cos(pitch), Math.sin(pitch), (hz / hd) * Math.cos(pitch));
        aimed = true;
      }
    }
    if (!aimed) {
      const conv = rayConvergeDistance(this.ctx.npcs, this.ctx.activeColliders, cam.position.x, cam.position.y, cam.position.z, _look.x, _look.y, _look.z, SLING_AIM_RANGE + 10, DESKTOP_CONVERGE);
      _aim.copy(cam.position).addScaledVector(_look, conv);
      const hl = Math.hypot(_look.x, _look.z) || 1;
      _origin.set(player.position.x + (_look.x / hl) * ORIGIN_FORWARD, player.position.y + ORIGIN_HEIGHT, player.position.z + (_look.z / hl) * ORIGIN_FORWARD);
      _dir.subVectors(_aim, _origin).normalize();
    }
    this.vel.copy(_dir).multiplyScalar(speed);
    this.origin.copy(_origin);
    // 面向 (水平單位向量) 供 faceDirection 使用
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(_look.x, 0, _look.z);
    _dir.normalize();
  }

  // 招式離弦時間點：由 CombatSystem.resolvePlayerHit 在 move.projectile 時呼叫；回傳 true = 此招式屬於彈弓 (已處理)
  public launch(move: KfMove): boolean {
    if (this.combo.indexOf(move) < 0) return false;
    if (this.state !== 'WINDUP') return true;
    const { player, projectiles } = this.ctx;
    const o = this.opts;
    o.damage = SLING.damage * chargeDamageFrac(this.shotCharge);
    o.headshotMul = this.shotHead ? SLING.headshotMul : 1;
    o.serial = player.moveSerial; // 一發只報一次通緝
    const slot = projectiles.spawn(PROJ_STONE, this.origin, this.vel, o);
    if (slot < 0) { this.finishShot(); return true; } // 池滿：放棄本發
    this.state = 'RELOAD';
    this.reloadTimer = SLING.reload;
    return true;
  }

  private finishShot() {
    this.state = 'IDLE';
    this.ctx.player.attackLock = false;
  }

  private handleEvent(ev: ProjectileEvent) {
    if (ev.type !== 'NPC' || !ev.applied || ev.result === 'BLOCKED' || !ev.headshot) return;
    // 爆頭：X 字斬痕 (正對鏡頭) + 傷害數字 + 叮聲
    const cam = this.ctx.cameraCtrl.camera.position;
    const yaw = Math.atan2(cam.x - ev.point.x, cam.z - ev.point.z);
    const c = WEAPON_FX_STYLES.STONE;
    slashFX.crossAt(ev.point.x, ev.point.y, ev.point.z, yaw, HEAD_X_HALF_LEN, 0xffd23f, c.tipColor);
    this.ctx.combat.showHitDamage(ev.point, Math.round(ev.damage));
    soundManager.playHeadshotDing(ev.point);
  }

  // 結束瞄準狀態 (放手 / 取消共用)：收開鏡、姿勢、準星、LOD 提升
  private endAim() {
    const { player, cameraCtrl } = this.ctx;
    cameraCtrl.aimZoom = 0;
    player.aimCharge = 0;
    player.aimYaw = null;
    this.reticle.show(false);
    this.reticleOn = false;
    this.setLock(null);
    this.steady = 0;
    this.headLocked = false;
    this.charge = 0;
  }

  // 立即取消 (換武器 / 上車 / 換世界 / 死亡 / 受擊倒地 / 手持小遊戲籃球)：收回開鏡與準星，不發射
  public cancel() {
    const { player } = this.ctx;
    const wasBusy = this.state !== 'IDLE';
    this.endAim();
    this.state = 'IDLE';
    this.buffer = 0;
    this.reloadTimer = 0;
    if (wasBusy) player.attackLock = false;
  }

  // 預熱傷害數字精靈 (其餘彈弓特效共用 slashFX / TracerFX / 石子 InstancedMesh，已在各自 prewarm 內)
  public prewarm(compile: () => void) {
    this.ctx.combat.prewarmHitText(compile);
  }
}

