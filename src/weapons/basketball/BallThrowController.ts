import * as THREE from 'three';
import type { GameContext } from '../../game/GameContext';
import type { KfMove } from '../../entities/shared/kungfu';
import type { NPC } from '../../entities/NPC';
import { comboFinisherFX } from '../../effects/ComboFinisherFX';
import { impactDust } from '../../effects/ImpactDust';
import { getFxQuality } from '../../effects/fxQuality';
import { WEAPON_FX_STYLES } from '../../effects/weaponFxStyle';
import { getWeapon } from '../registry';
import {
  createProjectileSpawnOpts, PFLAG_BOUNCE_FLOOR, PFLAG_BOUNCE_WALL, PFLAG_RETURN, PFLAG_TRACER, PROJ_BALL,
  type ProjectileEvent, type ProjectileSpawnOpts
} from '../projectiles/ProjectileSystem';
import { BASKETBALL_SHOVE_DIST } from '../defs/basketball';
import { PRE_INPUT_WINDOW, ScreenReticle } from '../rangedCommon';
import {
  AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, AIM_TOUCH_HALF_ANGLE, aimHeight, defaultAimDistance, pickAimTarget, solveLaunch,
  type BallMoveKind, type LaunchVelocity
} from './aim';

// 籃球武器狀態機 (僅 devWeaponsMode 非 off 時由 main.ts 建立)。
//   READY  球在手上 (顯示)：按攻擊 → 起手；起手條件不足 (如收招中) → 進 0.25 秒預輸入緩衝
//   WINDUP 投球動作的預備段 (已鎖攻擊)，到命中時間點 (球離手) 由 CombatSystem 呼叫 launch() 發射
//   FLIGHT 球在外 (投射物池的球飛行 / 彈跳 / 回收；手上的球隱藏、攻擊鎖定)，被接住 (CATCH) 回到 READY
// 換武器 / 上車 / 換世界 / 死亡 / 手持小遊戲籃球：cancel()，球立即消失並噴煙塵。
export { PRE_INPUT_WINDOW };            // 預輸入緩衝 (秒)：接球前這段時間內按攻擊，接球後自動投出下一球 (共用常數見 rangedCommon)
const FLIGHT_FAILSAFE = 5;             // 飛行 / 回收總秒數上限 (正常 2 秒保險 + 回收 <= 0.9，超過視為異常強制收回)
const ORIGIN_CHEST = 1.25;             // 胸前 / 地板傳球出手高度 (高於腳底)
const ORIGIN_LOB = 1.9;                // 高拋出手高度 (過頂)
const ORIGIN_FORWARD = 0.5;            // 出手點前移距離
const LOCK_WORLD_Y_MAX = 2.2;          // 準星高度偏移 (目標腳底上方)
const SPIN_WAVE_RADIUS = 1.6;          // 第 3 投命中衝擊環半徑 (再乘 ringReach)

const _dustNormal = new THREE.Vector3(0, 1, 0);

export class BallThrowController {
  public state: 'READY' | 'WINDUP' | 'FLIGHT' = 'READY';
  public slot = -1;
  public buffer = 0; // 預輸入剩餘秒數
  public kind = 0;   // 本次出手的連段段數 (0..2)，供事件回呼判斷終結技

  private readonly combo = getWeapon('BASKETBALL').combo;
  private readonly stats = getWeapon('BASKETBALL').stats;
  private readonly opts: ProjectileSpawnOpts[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly launchV: LaunchVelocity = { h: 0, vy: 0 };
  private flightTime = 0;
  private aimTarget: NPC | null = null;
  private heldHidden = false; // 手上武器球目前是否已隱藏 (見 syncHeldBall)
  private readonly reticle = new ScreenReticle('ballLockReticle', 'ball-lock-reticle');
  private readonly returnTarget = (out: THREE.Vector3) => { this.ctx.player.getHandPoint(out); };
  private readonly onEvent = (ev: ProjectileEvent) => this.handleEvent(ev);

  constructor(private readonly ctx: GameContext) {
    const cap = getWeapon('BASKETBALL').launchCap ?? null;
    for (let i = 0; i < this.combo.length; i++) {
      const m = this.combo[i];
      const o = createProjectileSpawnOpts(PROJ_BALL);
      o.damage = this.stats.damage * m.dmg;
      o.knockback = this.stats.knockback * m.knock;
      o.maxRange = this.stats.reach;
      o.maxLife = 2; // 保險：2 秒內未結束一律強制收回
      o.mode = m.finisher ? 'LAUNCH' : 'SHOVE';
      o.shoveDist = m.finisher ? 0 : BASKETBALL_SHOVE_DIST;
      o.launchCap = m.finisher ? cap : null;
      o.flags = PFLAG_TRACER | PFLAG_BOUNCE_FLOOR | PFLAG_BOUNCE_WALL | PFLAG_RETURN;
      o.returnTarget = this.returnTarget;
      o.onEvent = this.onEvent;
      this.opts.push(o);
    }
  }

  // 目前是否為「籃球武器可投球」狀態 (小遊戲持球、騎車、羽球拍、非校園、死亡皆不可)
  public get enabled(): boolean {
    const c = this.ctx;
    const p = c.player;
    return c.currentWorldType === 'CAMPUS' && p.currentWeapon === 'BASKETBALL' && !p.isHoldingRacket && !p.isDead &&
      !c.basketballGame.isHolding && !c.currentRidingBike && !p.isRidingVehicle;
  }

  // 攻擊鍵 / 手機攻擊鈕：回傳 true = 由籃球武器接管 (CombatSystem 不再處理)
  public handleAttack(): boolean {
    if (!this.enabled) return false;
    if (this.state === 'READY' && this.ctx.player.canAttack) this.startThrow();
    else this.buffer = PRE_INPUT_WINDOW;
    return true;
  }

  private startThrow() {
    this.buffer = 0;
    this.aim();
    // 先起手 (canAttack 檢查鎖定前)，成功後鎖攻擊直到接回
    if (!this.ctx.player.attack()) return;
    this.ctx.player.attackLock = true;
    this.state = 'WINDUP';
  }

  // 計算出手方向 (this.dir，水平單位向量) 與鎖定目標 (this.aimTarget)；起手與發射時各呼叫一次，並讓玩家面向出手方向
  private aim() {
    const { player, cameraCtrl, npcs, input } = this.ctx;
    const fwd = cameraCtrl.getForwardVector();
    const touch = input.isTouchDevice;
    this.aimTarget = pickAimTarget(npcs, player.position.x, player.position.y, player.position.z, fwd.x, fwd.z,
      touch ? AIM_TOUCH_HALF_ANGLE : AIM_DESKTOP_HALF_ANGLE, AIM_MAX_RANGE, touch ? 'NEAREST' : 'ANGLE');
    const t = this.aimTarget;
    if (t) {
      this.dir.set(t.position.x - player.position.x, 0, t.position.z - player.position.z);
      if (this.dir.lengthSq() < 1e-4) this.dir.copy(fwd);
    } else this.dir.copy(fwd);
    this.dir.y = 0;
    this.dir.normalize();
    player.faceDirection(this.dir.x, this.dir.z);
  }

  // 招式命中時間點 (球離手)：由 CombatSystem.resolvePlayerHit 在 move.projectile 時呼叫
  public launch(move: KfMove) {
    if (this.state !== 'WINDUP') return;
    const { player, projectiles } = this.ctx;
    const idx = this.combo.indexOf(move);
    if (idx < 0) { this.finishWindup(); return; }
    this.aim();
    const kindName = move.projectile as BallMoveKind;
    const originH = kindName === 'BALL_LOB' ? ORIGIN_LOB : ORIGIN_CHEST;
    const t = this.aimTarget;
    let dist = t ? Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z) - ORIGIN_FORWARD : defaultAimDistance(kindName);
    dist = Math.min(AIM_MAX_RANGE, Math.max(1.2, dist));
    const aimH = t ? t.position.y - player.position.y + aimHeight(t.role) : originH - 0.1;
    solveLaunch(kindName, dist, originH, aimH, this.launchV);
    this.origin.set(player.position.x + this.dir.x * ORIGIN_FORWARD, player.position.y + originH, player.position.z + this.dir.z * ORIGIN_FORWARD);
    this.vel.set(this.dir.x * this.launchV.h, this.launchV.vy, this.dir.z * this.launchV.h);
    const opts = this.opts[idx];
    opts.serial = player.moveSerial; // 一發只報一次通緝
    const slot = projectiles.spawn(PROJ_BALL, this.origin, this.vel, opts);
    if (slot < 0) { this.finishWindup(); return; }
    this.slot = slot;
    this.kind = idx;
    this.flightTime = 0;
    this.state = 'FLIGHT';
    this.lastPos.copy(this.origin);
    this.setHeld(true);
  }

  private finishWindup() {
    this.state = 'READY';
    this.ctx.player.attackLock = false;
  }

  private handleEvent(ev: ProjectileEvent) {
    if (ev.slot !== this.slot) return;
    switch (ev.type) {
      case 'NPC':
        if (ev.result === 'BLOCKED' || !ev.applied) {
          this.ctx.projectiles.recall(ev.slot); // 被擋 (閃身 / 格擋 / 護盾)：直接回彈
        } else if (this.combo[this.kind].finisher) {
          const q = getFxQuality();
          comboFinisherFX.spinWave(ev.point, SPIN_WAVE_RADIUS * q.ringReach, ev.point.y, WEAPON_FX_STYLES.BALL, 0, 0, 0);
        }
        break;
      case 'CATCH':
        this.onCatch();
        break;
      default:
        break;
    }
  }

  private onCatch() {
    const { player } = this.ctx;
    this.slot = -1;
    this.state = 'READY';
    player.attackLock = false;
    this.setHeld(false);
    player.refreshChainWindow(); // 連段接續窗自接到球起算
  }

  // 每幀 (投射物更新之前)：預輸入緩衝、自動接投、異常復原、手機準星
  public update(delta: number) {
    const { player, projectiles } = this.ctx;
    if (!this.enabled) {
      if (this.state !== 'READY') this.cancel(); // 只處理自己的狀態 (attackLock 可能是其他遠程武器設定)
      this.buffer = 0;
      this.showReticle(false);
      this.syncHeldBall();
      return;
    }
    if (this.buffer > 0) this.buffer -= delta;
    switch (this.state) {
      case 'WINDUP':
        // 起手被中斷 (閃身 / 受擊 / 換招) 而尚未離手：回到持球
        if (!player.isAttacking) this.finishWindup();
        break;
      case 'FLIGHT':
        this.flightTime += delta;
        if (!projectiles.isAlive(this.slot)) {
          this.lost();
        } else if (this.flightTime > FLIGHT_FAILSAFE) {
          this.cancel();
        } else projectiles.getPosition(this.slot, this.lastPos);
        break;
      default:
        break;
    }
    if (this.state === 'READY') {
      if (this.buffer > 0 && player.canAttack) this.startThrow(); // 接球瞬間自動投出下一球
      this.updateReticle();
    } else this.showReticle(false);
    this.syncHeldBall();
  }

  // 手上武器球顯示：球在外或手持小遊戲籃球時隱藏 (避免手上同時出現兩顆球)；只在持籃球武器且未持羽球拍時處理
  // (換武器 / 持拍時 WeaponRig.show 會重設顯示，快取隨之歸零)
  private syncHeldBall() {
    const { player, basketballGame } = this.ctx;
    if (player.currentWeapon !== 'BASKETBALL' || player.isHoldingRacket) { this.heldHidden = false; return; }
    this.setHeld(this.state === 'FLIGHT' || basketballGame.isHolding);
  }

  // 只在狀態改變時寫入 (Player.setHeldWeaponHidden 作用於目前顯示中的武器)
  private setHeld(hidden: boolean) {
    if (hidden === this.heldHidden) return;
    this.heldHidden = hidden;
    this.ctx.player.setHeldWeaponHidden(hidden);
  }

  // 球在池中已消失但未收到接住事件 (被外部 reset 清掉)：視為遺失，煙塵後回到持球
  private lost() {
    this.puff(this.lastPos);
    this.slot = -1;
    this.state = 'READY';
    this.ctx.player.attackLock = false;
    this.setHeld(false);
  }

  // 立即取消 (換武器 / 上車 / 換世界 / 死亡 / 手持小遊戲籃球)：球消失並噴煙塵，回到持球狀態
  public cancel() {
    const { player, projectiles } = this.ctx;
    if (this.slot >= 0 && projectiles.isAlive(this.slot)) {
      projectiles.getPosition(this.slot, this.lastPos);
      projectiles.kill(this.slot);
      this.puff(this.lastPos);
    }
    this.slot = -1;
    this.state = 'READY';
    this.buffer = 0;
    player.attackLock = false;
    this.setHeld(false);
    this.showReticle(false);
  }

  private puff(pos: THREE.Vector3) {
    if (getFxQuality().dustPool <= 0) return;
    impactDust.burst(this.ctx.engine.scene, pos, _dustNormal, { count: 6, upward: 0.8, spreadY: 0.2, life: 0.45, size: 0.6 });
  }

  // 手機：持球待命時顯示鎖定準星 (DOM，不佔 GPU)；桌機不顯示
  private updateReticle() {
    const { input, player, cameraCtrl, npcs } = this.ctx;
    if (!input.isTouchDevice) return;
    const fwd = cameraCtrl.getForwardVector();
    const t = pickAimTarget(npcs, player.position.x, player.position.y, player.position.z, fwd.x, fwd.z, AIM_TOUCH_HALF_ANGLE, AIM_MAX_RANGE, 'NEAREST');
    if (!t) { this.showReticle(false); return; }
    this.tmp.set(t.position.x, t.position.y + Math.min(LOCK_WORLD_Y_MAX, aimHeight(t.role) + 0.2), t.position.z);
    this.showReticle(this.reticle.placeAt(this.tmp, cameraCtrl.camera));
  }

  private showReticle(show: boolean) {
    this.reticle.show(show);
  }
}
