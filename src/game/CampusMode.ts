import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import { Bicycle } from '../vehicles/Bicycle';
import { NPC } from '../entities/NPC';
import { AnnouncementPlaylist } from '../data/announcements';
import type { MissionTrackerData } from '../ui/HUD';
import type { GameContext } from './GameContext';

const _scratchCamDir = new THREE.Vector3();
const _scratchCamForward = new THREE.Vector3();

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
  }

  // ===== 電梯 =====

  // 搭乘演藝大樓直達電梯 (自動還原手持武器並中止羽球賽)
  public startElevator(toFourthFloor: boolean) {
    const { player, tennisGame, engine, wantedSystem } = this.ctx;
    soundManager.playElevatorDing();
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
