import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import { Bicycle } from '../vehicles/Bicycle';
import { NPC } from '../entities/NPC';
import { AnnouncementPlaylist } from '../data/announcements';
import type { MissionTrackerData } from '../ui/HUD';
import type { GameContext } from './GameContext';
import { SurroundCoordinator } from './SurroundCoordinator';
import { AttackTokenCoordinator } from './AttackTokenCoordinator';
import { findSafeTeleportPos } from '../entities/shared/teleport';
import type { CollidableBox } from '../world/CampusWorld';

const _scratchCamDir = new THREE.Vector3();
const _scratchCamForward = new THREE.Vector3();
const _scratchEnforcerSpot = new THREE.Vector3();
const _placedEnforcerSpots: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];

// 連殺觸發執法者傳送追捕
const ENFORCER_TELEPORT_MIN = 5.0; // 落點與玩家距離 (m)
const ENFORCER_TELEPORT_MAX = 9.0;
const ENFORCER_TELEPORT_ATTEMPTS = 40;
// 通緝期間累計擊倒數達門檻後，每次擊倒擲骰 (通緝清除時歸零)
export const KILL_STREAK_THRESHOLD = 2;
export const ENFORCER_TRIGGER_CHANCE = 0.8;
const ENFORCER_ENGAGE_RANGE_SQ = 625.0; // 25m 內有執法者追捕中即視為仍在纏鬥
const ENFORCER_FLOOR_HEIGHT = 6.0; // 樓層高度 (1F 0 / 2F 6 / 3F 12)
const CAMPUS_TELEPORT_BOUND = 104.0;

// 連殺擲骰判定 (roll 預設 Math.random，便於驗證)
export function rollEnforcerTrigger(killStreak: number, roll: number = Math.random()): boolean {
  return killStreak >= KILL_STREAK_THRESHOLD && roll < ENFORCER_TRIGGER_CHANCE;
}

// 路邊閒置的被搶單車上限 (超過時回收最舊者，防止單車無限堆積)
const MAX_LOOSE_STOLEN_BIKES = 3;

interface ElevatorTransition {
  phase: 'CLOSING' | 'TRAVELING' | 'OPENING' | 'WALKING_OUT';
  timer: number;
  targetY: number;
  banner: string;
}

/**
 * 第一世界【天天國中】玩法：電梯過場、小遊戲調度、廣播台、單車 (搶車/車主牽回)、
 * 游泳水花、校犬脫逃、生態園與任務看板
 */
export class CampusMode {
  public elevatorTransition: ElevatorTransition | null = null;
  public broadcastCooldown: number = 0;
  private readonly announcements = new AnnouncementPlaylist();
  // 被搶奪的車主綁定單車 (依搶奪先後排序)
  private readonly stolenBikes: Bicycle[] = [];
  private swimSplashTimer: number = 0;
  private wasDogChasing: boolean = false;
  private lastTrackRecord: number | null | undefined = undefined;
  private lastSwimRecord: number | null | undefined = undefined;
  // 校園執法者 (主任教官 / 生教組長)：多人包夾、連殺觸發傳送追捕與處分解除後返回崗位
  private enforcerList: NPC[] | null = null;
  private readonly teleportedEnforcers = new Set<NPC>();
  private killStreak: number = 0; // 本次通緝期間擊倒 NPC 數
  private enforcerTeleportPending: boolean = false;
  private readonly enforcerSurround = new SurroundCoordinator();
  // 圍攻出手權杖：同時最多 2 人出招、執法者輪流出手 (見 AttackTokenCoordinator)
  private readonly attackTokens = new AttackTokenCoordinator();

  private readonly missionTracker: MissionTrackerData = {
    studentDefeated: 0,
    hasNormalBat: false,
    teacherDefeated: 0,
    dogDefeated: 0,
    bikeDefeated: 0,
    inspectorDefeated: 0,
    hasSpecialBat: false,
    plantBossDefeated: false,
    peBossDefeated: false,
    trackRecordText: '未完成',
    swimRecordText: '未完成',
    basketballStreak: 0,
    basketballRecord: 0,
    hasRiddenBike: false,
    hasEscapedDog: false,
    hasWishedPond: false,
    hasTastedHotFood: false,
    dodgeSkillLevel: 0
  };

  // 生態園回呼 (建構一次，避免每幀配置新閉包)
  private readonly onGardenDamage = (amount: number, reason: string) => {
    if (this.ctx.player.tryAutoDodge()) return;
    const died = this.ctx.player.takeDamage(amount, reason);
    this.ctx.wantedSystem.showBanner(reason, 2500);
    if (died) {
      this.ctx.handlePlayerDeath('被生態園植物生物重創倒地！');
    }
  };
  private readonly onPlantBossDeath = () => {
    this.ctx.wantedSystem.showBanner('👑 秘境霸主【變異食人花王】已枯萎崩解！', 6000);
  };

  constructor(private readonly ctx: GameContext) {}

  // 切換世界時中止電梯過場並復位電梯門，清除校犬追捕旗標 (避免回到校園時過場續跑或誤判脫逃)
  public resetTransientState() {
    if (this.elevatorTransition) {
      this.elevatorTransition = null;
      this.ctx.world.setElevatorDoorsOpen(1.0);
    }
    this.wasDogChasing = false;
    this.attackTokens.reset(this.ctx.campusNPCs);
  }

  // ===== 校園執法者：連殺觸發傳送追捕 =====

  private get enforcers(): NPC[] {
    if (!this.enforcerList) this.enforcerList = this.ctx.campusNPCs.filter(n => n.isEnforcer);
    return this.enforcerList;
  }

  // 擊倒 NPC (每擊倒一人呼叫一次)：計入連殺，達門檻且附近無執法者追捕、未在等待傳送時擲骰，
  // 成功則執法者暴怒並傳送至玩家附近追捕 (持續到處分解除)
  public onNpcDefeated() {
    if (this.ctx.currentWorldType !== 'CAMPUS') return;
    this.killStreak++;
    if (this.killStreak < KILL_STREAK_THRESHOLD || this.enforcerTeleportPending) return;
    if (this.isEnforcerEngaged(this.ctx.player.position)) return;
    if (!rollEnforcerTrigger(this.killStreak)) return;
    for (const e of this.enforcers) e.setEnraged(true);
    this.enforcerTeleportPending = true;
  }

  // 處分解除：連殺歸零，被傳送離開崗位的執法者 (未倒地者) 返回原本崗位並解除暴怒
  public onWantedCleared() {
    for (const e of this.enforcers) e.setEnraged(false);
    this.killStreak = 0;
    this.enforcerTeleportPending = false;
    this.returnTeleportedEnforcers();
  }

  private returnTeleportedEnforcers() {
    for (const e of this.teleportedEnforcers) {
      if (e.isKnockedDown || e.isPermanentlyKnockedOut || e.isKnockedFlying) continue; // 倒地者起身後再返回
      e.returnHome();
      this.teleportedEnforcers.delete(e);
    }
  }

  // 每幀 (NPC AI 更新之後)：圍攻出手權杖、執法者包夾、連殺觸發的傳送追捕
  public updateEnforcers(delta: number, playerPos: THREE.Vector3) {
    const enforcers = this.enforcers;
    this.enforcerSurround.update(delta, enforcers, playerPos);
    // 玩家騎車時暫停圍攻權杖，沿用原本追車節奏
    if (this.ctx.currentRidingBike) this.attackTokens.reset(this.ctx.campusNPCs);
    else this.attackTokens.update(delta, this.ctx.campusNPCs, playerPos);
    // 處分解除時倒地未返回的執法者：起身後再返回崗位
    if (this.ctx.wantedSystem.stars === 0 && this.teleportedEnforcers.size > 0) this.returnTeleportedEnforcers();
    // 連殺觸發的傳送：玩家處於不適合傳送的狀態 (游泳、電梯、羽球賽、過場、死亡) 時下一幀再試
    if (!this.enforcerTeleportPending || !this.canTeleportEnforcers()) return;
    this.enforcerTeleportPending = false;
    this.teleportEnforcers(playerPos);
  }

  private isEnforcerEngaged(playerPos: THREE.Vector3): boolean {
    for (const e of this.enforcers) {
      if (e.role !== 'INSTRUCTOR') continue;
      if (e.isKnockedDown || e.isPermanentlyKnockedOut || !e.isChasing) continue;
      if (Math.abs(e.position.y - playerPos.y) > 2.0) continue;
      if (e.position.distanceToSquared(playerPos) < ENFORCER_ENGAGE_RANGE_SQ) return true;
    }
    return false;
  }

  private canTeleportEnforcers(): boolean {
    const { player, tennisGame } = this.ctx;
    if (this.ctx.currentWorldType !== 'CAMPUS') return false;
    if (player.isDead || player.isCinematicLocked || player.isSwimming) return false;
    if (this.elevatorTransition) return false;
    return tennisGame.tennisState === 'IDLE';
  }

  // 將存活的主任教官傳送至玩家所在樓層 5~9m 內、與玩家之間無牆阻隔的安全落點，並吹哨追捕 (生教組長不傳送)
  private teleportEnforcers(playerPos: THREE.Vector3) {
    const floorY = Math.max(0, Math.round(playerPos.y / ENFORCER_FLOOR_HEIGHT) * ENFORCER_FLOOR_HEIGHT);
    let placed = 0;
    for (const e of this.enforcers) {
      if (e.role !== 'INSTRUCTOR') continue;
      if (e.isKnockedDown || e.isPermanentlyKnockedOut || e.isKnockedFlying) continue;
      if (!this.findEnforcerSpot(playerPos, floorY, placed, _scratchEnforcerSpot)) continue;
      _placedEnforcerSpots[Math.min(placed, _placedEnforcerSpots.length - 1)].copy(_scratchEnforcerSpot);
      placed++;
      e.teleportTo(_scratchEnforcerSpot, floorY, playerPos);
      this.teleportedEnforcers.add(e);
    }
    if (placed > 0) {
      this.ctx.wantedSystem.showBanner('🚨 連續擊倒多人！主任教官火速趕到現場追捕！', 3000);
    }
  }

  private findEnforcerSpot(playerPos: THREE.Vector3, floorY: number, placed: number, out: THREE.Vector3): boolean {
    const colliders = this.ctx.activeColliders;
    const opts = { minRadius: ENFORCER_TELEPORT_MIN, maxRadius: ENFORCER_TELEPORT_MAX, attempts: 1, baseGroundY: 0 };
    for (let i = 0; i < ENFORCER_TELEPORT_ATTEMPTS; i++) {
      findSafeTeleportPos(out, playerPos.x, playerPos.z, floorY, colliders, opts);
      const dx = out.x - playerPos.x;
      const dz = out.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      // 取樣失敗會退回中心點；落點須在同一樓層 (排除樓外懸空落回地面)、校園範圍內且不在水中
      if (d2 < ENFORCER_TELEPORT_MIN * ENFORCER_TELEPORT_MIN - 0.01) continue;
      if (Math.abs(out.y - floorY) > 0.5) continue;
      if (Math.abs(out.x) > CAMPUS_TELEPORT_BOUND || Math.abs(out.z) > CAMPUS_TELEPORT_BOUND) continue;
      if (this.ctx.world.isInsideSwimmingPool(out) || this.ctx.ecologicalGarden.isInsideWishingPond(out)) continue;
      let crowded = false;
      for (let k = 0; k < Math.min(placed, _placedEnforcerSpots.length); k++) {
        if (_placedEnforcerSpots[k].distanceToSquared(out) < 2.25) crowded = true;
      }
      if (crowded) continue;
      if (this.isWallBetween(out, playerPos, floorY, colliders)) continue;
      out.y = floorY;
      return true;
    }
    return false;
  }

  // 落點與玩家之間 (胸口高度) 是否有牆體阻隔
  private isWallBetween(from: THREE.Vector3, playerPos: THREE.Vector3, floorY: number, colliders: readonly CollidableBox[]): boolean {
    const y1 = floorY + 1.2;
    const y2 = playerPos.y + 1.2;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (box.isFloorOnly || box.isRamp) continue;
      if (NPC.segmentIntersectsAABBCoords(from.x, y1, from.z, playerPos.x, y2, playerPos.z, box.min, box.max)) return true;
    }
    return false;
  }

  // ===== 電梯 =====

  // 搭乘演藝大樓直達電梯 (自動還原手持武器並中止羽球賽)
  public startElevator(toFourthFloor: boolean) {
    const { player, tennisGame, engine, wantedSystem } = this.ctx;
    soundManager.playElevatorDing();
    // 突進斬中搭電梯：過場期間不更新玩家，出招會凍結於突進中 (持續略過推擠、鏡頭拉遠，並以傳送前的突進起點結算)，先中止
    if (player.isDashMove) player.cancelAttack();
    player.equipBadmintonRacket(false);
    if (tennisGame.tennisState !== 'IDLE') {
      tennisGame.resetMatch(engine.scene, player);
    }
    const fromY = toFourthFloor ? 0.0 : 12.0;
    this.elevatorTransition = {
      phase: 'CLOSING',
      timer: 0.5,
      targetY: toFourthFloor ? 12.0 : 0.0,
      banner: toFourthFloor ? '🛗 電梯抵達【4F 演藝廳羽球場】，電梯門開啟！' : '🛗 電梯抵達【1F 演藝廳門廳】，電梯門開啟！'
    };
    player.position.set(65.5, fromY, 43.5);
    player.mesh.position.set(65.5, fromY, 43.5);
    wantedSystem.showBanner(toFourthFloor ? '🛗 電梯門關閉中，直達 4F...' : '🛗 電梯門關閉中，直達 1F...', 1500);
  }

  // 電梯過場：關門 → 移動 → 開門 → 自動走出
  public updateElevator(delta: number) {
    const et = this.elevatorTransition;
    if (!et) return;
    const { world, player } = this.ctx;
    et.timer -= delta;

    if (et.phase === 'CLOSING') {
      world.setElevatorDoorsOpen(Math.max(0, et.timer / 0.5));
      if (et.timer <= 0) {
        et.phase = 'TRAVELING';
        et.timer = 0.4;
      }
    } else if (et.phase === 'TRAVELING') {
      if (et.timer <= 0) {
        player.position.set(65.5, et.targetY, 43.5);
        player.mesh.position.set(65.5, et.targetY, 43.5);
        soundManager.playElevatorDing();
        et.phase = 'OPENING';
        et.timer = 0.5;
      }
    } else if (et.phase === 'OPENING') {
      world.setElevatorDoorsOpen(Math.min(1.0, 1.0 - et.timer / 0.5));
      if (et.timer <= 0) {
        world.setElevatorDoorsOpen(1.0);
        et.phase = 'WALKING_OUT';
        et.timer = 0.8;
        this.ctx.wantedSystem.showBanner(et.banner, 3000);
      }
    } else if (et.phase === 'WALKING_OUT') {
      const progress = Math.min(1.0, 1.0 - (et.timer / 0.8));
      const curZ = THREE.MathUtils.lerp(43.5, 40.5, progress);
      player.position.set(65.5, et.targetY, curZ);
      player.mesh.position.copy(player.position);
      player.rotationY = Math.PI;
      player.mesh.rotation.y = Math.PI;
      if (et.timer <= 0) {
        this.elevatorTransition = null;
        player.equipBadmintonRacket(false);
      }
    }
  }

  // ===== 廣播台 =====

  // 佔領廣播麥克風：洗牌輪播惡搞廣播，全體 NPC 定格 4 秒
  public useBroadcastStation() {
    const { wantedSystem } = this.ctx;
    if (this.broadcastCooldown <= 0) {
      this.broadcastCooldown = 15.0;
      soundManager.playBroadcastChime();
      wantedSystem.showBanner(this.announcements.next(), 6000);
      for (const npc of this.ctx.npcs) {
        npc.freeze(4.0);
      }
    } else {
      wantedSystem.showBanner(`學務處廣播系統冷卻中，請等待 ${Math.ceil(this.broadcastCooldown)} 秒`, 2000);
    }
  }

  public updateBroadcastCooldown(delta: number) {
    if (this.broadcastCooldown > 0) {
      this.broadcastCooldown -= delta;
    }
  }

  // ===== 單車 =====

  public findNearbyBikePatrol(pos: THREE.Vector3): NPC | null {
    for (const npc of this.ctx.npcs) {
      if (npc.role === 'BIKE_PATROL' && npc.position.distanceTo(pos) < 3.5) return npc;
    }
    return null;
  }

  public findNearbyBike(pos: THREE.Vector3): Bicycle | null {
    for (const bike of this.ctx.bicycles) {
      if (bike.position.distanceTo(pos) < 3.0) return bike;
    }
    return null;
  }

  private mountBike(bike: Bicycle, groundY: number) {
    this.ctx.player.cancelAttack();
    bike.mount(this.ctx.player, groundY);
    this.ctx.currentRidingBike = bike;
    this.ctx.player.isRidingVehicle = true;
    this.ctx.cameraCtrl.setMode(true);
  }

  // 強行搶奪火柴人自行車騎士的單車 (常態騎乘、擊飛中或倒地時皆可)
  public hijackBike(npc: NPC) {
    soundManager.playBikeHijack();
    npc.loseBike();

    // 獲取地面真實支撐高度，杜絕浮空
    const groundY = Bicycle.getFloorHeightAt(npc.position.x, npc.position.y, npc.position.z, this.ctx.activeColliders);
    const spawnPos = new THREE.Vector3(npc.position.x, groundY, npc.position.z);

    const stolenBike = new Bicycle(this.ctx.engine.scene, spawnPos, 0x3498db);
    this.ctx.bicycles.push(stolenBike);
    // 車主綁定：騎士復活後會走回車旁牽回，而非憑空再生一台新車
    npc.ownedBike = stolenBike;
    this.stolenBikes.push(stolenBike);
    this.mountBike(stolenBike, groundY);
    this.ctx.wantedSystem.reportCrime(2, '強行搶奪火柴人自行車');
    this.ctx.wantedSystem.showBanner('🚲 成功搶奪火柴人自行車！風馳電掣！按 [E] 可下車', 3000);
  }

  public rideBike(bike: Bicycle) {
    this.mountBike(bike, Bicycle.getFloorHeightAt(bike.position.x, bike.position.y, bike.position.z, this.ctx.activeColliders));
  }

  // 自世界移除單車 (釋放資源並清除所有引用)；騎乘中的單車不可移除
  private removeBicycle(bike: Bicycle) {
    if (bike.isMounted || bike === this.ctx.currentRidingBike) return;
    bike.dispose(this.ctx.engine.scene);
    const idx = this.ctx.bicycles.indexOf(bike);
    if (idx >= 0) this.ctx.bicycles.splice(idx, 1);
    const sIdx = this.stolenBikes.indexOf(bike);
    if (sIdx >= 0) this.stolenBikes.splice(sIdx, 1);
  }

  // 路邊閒置的被搶單車超過上限時，回收最早被搶的那台並解除車主綁定 (車主之後於視野外自行恢復騎乘)
  public enforceStolenBikeCap() {
    if (this.stolenBikes.length <= MAX_LOOSE_STOLEN_BIKES) return;
    let looseCount = 0;
    for (const bike of this.stolenBikes) {
      if (!bike.isMounted) looseCount++;
    }
    while (looseCount > MAX_LOOSE_STOLEN_BIKES) {
      const oldest = this.stolenBikes.find(b => !b.isMounted);
      if (!oldest) break;
      for (const npc of this.ctx.campusNPCs) {
        if (npc.ownedBike === oldest) npc.clearOwnedBike();
      }
      this.removeBicycle(oldest);
      looseCount--;
    }
  }

  // 車主走回愛車旁 (或逾時)：移除路邊單車並恢復騎乘巡邏；愛車已被回收者於玩家 35m 外再恢復騎乘
  public updateBikeOwner(npc: NPC, targetPosition: THREE.Vector3) {
    if (npc.wantsBikeReclaim) {
      const ownedBike = npc.ownedBike;
      if (ownedBike && !ownedBike.isMounted) {
        npc.completeBikeReclaim();
        this.removeBicycle(ownedBike);
      } else {
        npc.wantsBikeReclaim = false;
      }
    } else if (
      npc.isOriginalBikePatrol &&
      npc.role !== 'BIKE_PATROL' &&
      !npc.ownedBike &&
      !npc.isKnockedDown &&
      !npc.isPermanentlyKnockedOut &&
      npc.position.distanceToSquared(targetPosition) > 1225.0
    ) {
      npc.restoreBikePatrol();
    }
  }

  // ===== 小遊戲與游泳 =====

  // 依所在水體設定游泳狀態 (泳池水面 0.25 / 許願池 0.32)
  public updateSwimState() {
    const { player, ecologicalGarden, world } = this.ctx;
    const inPond = ecologicalGarden.isInsideWishingPond(player.position);
    const inPool = inPond || world.isInsideSwimmingPool(player.position);
    player.isSwimming = inPool;
    if (inPool) {
      player.swimSurfaceY = inPond ? 0.32 : 0.25;
      player.swimBottomY = -1.1; // 許願池與泳池皆為深水 (池底以下被地坪遮蔽，呈現身體沒入水中)
    }
  }

  // 游泳水花音效，回傳持球瞄準時的新朝向 (未持球回傳 null)
  public updateSwimSplashAndAim(delta: number): number | null {
    const { player, waterSplashVFX, basketballGame, cameraCtrl } = this.ctx;
    if (player.isSwimming) {
      if (player.isMoving) {
        this.swimSplashTimer -= delta;
        if (this.swimSplashTimer <= 0) {
          soundManager.playWaterSplash();
          this.swimSplashTimer = player.isSprinting ? 0.35 : 0.38;
          // 水面高度沿用本幀游泳判定時已決定的水體
          waterSplashVFX.triggerSplashBurst(player.position, player.rotationY, player.isSprinting, player.swimSurfaceY);
        }
      } else {
        this.swimSplashTimer = 0;
      }
    }

    // 持球瞄準時朝向對齊視角
    if (!basketballGame.isHolding) return null;
    cameraCtrl.camera.getWorldDirection(_scratchCamDir);
    _scratchCamForward.set(_scratchCamDir.x, 0, _scratchCamDir.z).normalize();
    player.rotationY = Math.atan2(_scratchCamForward.x, _scratchCamForward.z);
    player.mesh.rotation.y = player.rotationY;
    return player.rotationY;
  }

  // 三分球、羽球、田徑與游泳競速更新 (含對話距離自動關閉)
  public updateMinigames(delta: number, targetPosition: THREE.Vector3) {
    const { player, input, hud, wantedSystem, world, engine, basketballGame, tennisGame, racingGame, waterSplashVFX } = this.ctx;
    const addCash = this.ctx.progression.addCash;

    basketballGame.update(delta, player, input, hud, wantedSystem, world.hoopTargets, world.shootingHotspots, this.ctx.cameraCtrl.camera);

    const peCoach = this.ctx.peCoachNpc;
    if (hud.isTennisDialogOpen && peCoach) {
      if (targetPosition.distanceTo(peCoach.position) > 4.5) {
        hud.closeTennisDialog();
      }
    }

    // 閃身步老師對話距離檢測與對話狀態
    const dodgeTeacher = this.ctx.dodgeTeacherNpc;
    if (dodgeTeacher) {
      if (hud.isDodgeDialogOpen) {
        dodgeTeacher.isConversing = true;
        if (targetPosition.distanceTo(dodgeTeacher.position) > 4.5) {
          hud.closeDodgeDialog();
          dodgeTeacher.isConversing = false;
        }
      } else {
        dodgeTeacher.isConversing = false;
      }
    }
    tennisGame.update(delta, targetPosition, peCoach, player, input, engine.scene, wantedSystem, hud, addCash);

    racingGame.updateTrack(delta, targetPosition, world.trackCheckpoints, wantedSystem, player);
    racingGame.updateSwim(delta, targetPosition, world.swimCheckpoints, wantedSystem, player, waterSplashVFX, addCash);
  }

  // ===== 校犬、生態園與任務看板 =====

  // 校犬脫逃判定 (逃進教學大樓或甩開追捕)
  public updateDogEscape(dog: NPC | undefined, targetPosition: THREE.Vector3) {
    if (!dog) return;
    // 死亡時 NPC 仇恨被重置，不可誤判為成功甩開校犬
    if (this.ctx.player.isDead) {
      this.wasDogChasing = false;
      return;
    }
    if (dog.isChasing) {
      this.wasDogChasing = true;
    } else if (this.wasDogChasing) {
      this.wasDogChasing = false;
      this.ctx.progression.hasEscapedDog = true;
      if (NPC.isInsideTeachingBuilding(targetPosition)) {
        this.ctx.wantedSystem.showBanner('進入教學大樓！校犬柴柴在門外止步，成功脫逃！', 3000);
      }
    }
  }

  // 生態探索園區、游泳水花微粒與食人花王血條
  public updateGardenAndEffects(delta: number, targetPosition: THREE.Vector3) {
    const { ecologicalGarden, player, waterSplashVFX, hud } = this.ctx;
    ecologicalGarden.update(delta, targetPosition, player, this.onGardenDamage, this.onPlantBossDeath);
    waterSplashVFX.update(delta, player.position, player.rotationY, player.isSwimming, player.isMoving, player.isSprinting, player.swimSurfaceY);

    const boss = ecologicalGarden.boss;
    if (targetPosition.distanceTo(boss.position) < 35.0 && !boss.isDead) {
      hud.setBossHealth(boss.hp, boss.maxHp, true, '秘境霸主：變異食人花王', '🌸');
    } else {
      hud.setBossHealth(0, 1000, false);
    }
  }

  public updateMissionTracker() {
    const { player, ecologicalGarden, tennisGame, racingGame, basketballGame, progression } = this.ctx;
    const peCoach = this.ctx.peCoachNpc;
    const tracker = this.missionTracker;
    tracker.studentDefeated = progression.studentDefeatedCount;
    tracker.hasNormalBat = player.hasNormalBat;
    tracker.teacherDefeated = progression.teacherDefeatedCount;
    tracker.dogDefeated = progression.dogDefeatedCount;
    tracker.bikeDefeated = progression.bikePatrolDefeatedCount;
    tracker.inspectorDefeated = progression.inspectorDefeatedCount;
    tracker.hasSpecialBat = player.hasSpecialBat;
    tracker.plantBossDefeated = ecologicalGarden.boss.isDead;
    tracker.peBossDefeated = tennisGame.coachDefeated || (peCoach ? peCoach.hp <= 0 : false);
    if (tracker.peBossDefeated) progression.checkDualRacketUnlock();
    // 紀錄文字僅在最佳成績變動時重新格式化
    if (racingGame.bestTrackTime !== this.lastTrackRecord) {
      this.lastTrackRecord = racingGame.bestTrackTime;
      tracker.trackRecordText = racingGame.bestTrackTime ? `${racingGame.bestTrackTime.toFixed(1)}s` : '未完成';
    }
    if (racingGame.bestSwimTime !== this.lastSwimRecord) {
      this.lastSwimRecord = racingGame.bestSwimTime;
      tracker.swimRecordText = racingGame.bestSwimTime ? `${racingGame.bestSwimTime.toFixed(1)}s` : '未完成';
    }
    tracker.basketballStreak = basketballGame.scoreStreak;
    tracker.basketballRecord = basketballGame.bestStreak;
    tracker.hasRiddenBike = progression.hasRiddenBike;
    tracker.hasEscapedDog = progression.hasEscapedDog;
    tracker.hasWishedPond = progression.hasWishedPond;
    tracker.hasTastedHotFood = progression.hasTastedHotFood;
    tracker.dodgeSkillLevel = progression.dodgeSkillLevel;
    this.ctx.hud.updateMissionTracker(tracker);
  }
}
