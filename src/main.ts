import * as THREE from 'three';
import { Engine } from './core/Engine';
import { InputManager } from './core/InputManager';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { CampusWorld, ShootingHotspot } from './world/CampusWorld';
import { Player } from './entities/Player';
import { Bicycle } from './vehicles/Bicycle';
import { NPC, ShuttlecockProjectile } from './entities/NPC';
import { WantedSystem } from './systems/WantedSystem';
import { HUD, CommissaryItem } from './ui/HUD';
import { soundManager } from './audio/SoundEffects';
import { bgmManager } from './audio/BGMManager';
import { EcologicalGarden } from './world/EcologicalGarden';

class SchoolGTASandbox {
  private engine: Engine;
  private input: InputManager;
  private cameraCtrl: ThirdPersonCamera;
  private world: CampusWorld;
  private player: Player;
  private ecologicalGarden: EcologicalGarden;
  private bicycles: Bicycle[] = [];
  private npcs: NPC[] = [];
  private shuttlecocks: ShuttlecockProjectile[] = [];
  private wantedSystem: WantedSystem;
  private hud: HUD;

  // 經濟與武器解鎖計數系統
  private playerCash: number = 100;
  private studentDefeatedCount: number = 0;
  private teacherDefeatedCount: number = 0;
  private dogDefeatedCount: number = 0;
  private bikePatrolDefeatedCount: number = 0;

  private currentRidingBike: Bicycle | null = null;
  private isGameRunning: boolean = false;
  private wasDogChasing: boolean = false;

  // 方案 D：校園惡搞彩蛋與趣味小遊戲狀態
  private broadcastCooldown: number = 0;
  private readonly announcements: string[] = [
    '📢【全校緊急廣播】三年二班陳彥旭，你媽拿便當來校門口了，還帶了你忘記穿的衛生褲！',
    '📢【訓導處通告】報告主任教官！你的假髮被風吹掉在司令台單槓上了，請速去撿！',
    '📢【生教組廣播】請全體糾察隊立刻到福利社集合，今天大肉包買一送一，限時搶購！',
    '📢【校長室特別通知】各位同學請注意！全體立正站好發呆 4 秒鐘，不准亂動！',
    '📢【廣播台突發】恭喜三年甲班全體同學獲得「不用掃廁所一週」特權！'
  ];

  private basketballMesh!: THREE.Mesh;
  private isHoldingBasketball: boolean = false;
  private isBallInAir: boolean = false;
  private ballVelocity: THREE.Vector3 = new THREE.Vector3();
  private ballResetTimer: number = 0;
  private isChargingShot: boolean = false;
  private shotChargeRatio: number = 0;
  private currentActiveHotspot: ShootingHotspot | null = null;
  private dribbleSoundTimer: number = 0;
  private basketballScoreStreak: number = 0;
  private targetShotQuality: 'PERFECT' | 'GOOD' | 'BAD' = 'BAD';
  private isWaitingForShotResult: boolean = false;
  private hasHitRimThisShot: boolean = false;

  private isRacingTrack: boolean = false;
  private raceTimer: number = 0;
  private raceCheckpointIdx: number = 0;
  private checkpointMarker!: THREE.Mesh;
  private isHandlingDeath: boolean = false;

  // 游泳池與水上競速小遊戲狀態
  private isSwimmingRace: boolean = false;
  private swimRaceTimer: number = 0;
  private swimCheckpointIdx: number = 0;
  private swimCheckpointMarker!: THREE.Mesh;
  private swimSplashTimer: number = 0;

  constructor() {
    // 1. 初始化引擎核心
    this.engine = new Engine();
    this.input = new InputManager(this.engine.canvas);
    this.cameraCtrl = new ThirdPersonCamera(65, window.innerWidth / window.innerHeight, 0.1, 350);

    // 2. 建置 3D 校園世界 (敬業樓、樂群樓、立體上下樓梯間、雙大樓空中走廊天橋、真實橢圓操場)
    this.world = new CampusWorld(this.engine.scene);

    // 2.5 建置西北自然生態探索園區 (含食人刺藤怪物與變異食人花王 Boss)
    this.ecologicalGarden = new EcologicalGarden(this.engine.scene);
    this.world.colliders.push(...this.ecologicalGarden.colliders);

    // 3. 玩家主角 (全校唯一的玩家實體)
    this.player = new Player(this.engine.scene);

    // 墜落傷害與死亡回呼
    this.player.onTakeDamageCallback = (amount: number, reason: string) => {
      if (reason === '墜落摔傷') {
        this.wantedSystem.showBanner(`高處墜落摔傷 -${amount} HP！`, 2500);
      }
    };
    this.player.onDeathCallback = () => {
      this.handlePlayerDeath('體力耗盡重傷！');
    };

    // 4. 載具系統：在校園多處配置火柴人造型腳踏車
    const bikeSpawns = [
      { pos: new THREE.Vector3(8, 0, 15), color: 0xf39c12 },  // 中庭黃色單車
      { pos: new THREE.Vector3(14, 0, -38), color: 0xe74c3c }, // 籃球場旁紅色單車
      { pos: new THREE.Vector3(-21, 0, 30), color: 0x3498db }, // 操場旁藍色單車 (移至開闊東直道外側，遠離石椅石桌與拱門立柱)
      { pos: new THREE.Vector3(-58, 0, -65), color: 0x2ecc71 },// 車棚綠色單車
      { pos: new THREE.Vector3(-50, 0, -65), color: 0x9b59b6 } // 車棚紫色單車
    ];

    for (const b of bikeSpawns) {
      this.bicycles.push(new Bicycle(this.engine.scene, b.pos, b.color));
    }

    // 5. 生成校園 NPC (生教組長、校犬柴柴、騎單車糾察隊、步巡糾察與普通學生)
    this.spawnCampusNPCs();

    // 6. 通緝系統與 HUD
    this.wantedSystem = new WantedSystem();
    this.wantedSystem.onWantedCleared = () => {
      for (const n of this.npcs) {
        n.resetAggro();
      }
    };
    this.hud = new HUD();

    // 7. 方案 D：校園彩蛋與小遊戲實體初始化 (經典籃球與操場檢查點光圈)
    const ballGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    this.basketballMesh = new THREE.Mesh(ballGeo, ballMat);
    this.basketballMesh.castShadow = true;
    this.basketballMesh.position.copy(this.world.basketballSpawnPos);

    const ringGeo = new THREE.TorusGeometry(0.241, 0.012, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    this.basketballMesh.add(ring1);
    const ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.x = Math.PI / 2;
    this.basketballMesh.add(ring2);
    this.engine.scene.add(this.basketballMesh);

    const cpGeo = new THREE.TorusGeometry(1.6, 0.12, 8, 24);
    const cpMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.85 });
    this.checkpointMarker = new THREE.Mesh(cpGeo, cpMat);
    this.checkpointMarker.visible = false;
    this.engine.scene.add(this.checkpointMarker);

    // 游泳池 50m 競速檢查點光圈 (青水色環形光標)
    const swimCpGeo = new THREE.TorusGeometry(1.5, 0.12, 8, 24);
    const swimCpMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.88 });
    this.swimCheckpointMarker = new THREE.Mesh(swimCpGeo, swimCpMat);
    this.swimCheckpointMarker.visible = false;
    this.engine.scene.add(this.swimCheckpointMarker);

    // 8. 綁定按鍵互動與攻擊
    this.setupInteractions();

    // 8.1 手機觸控操作系統 (虛擬搖桿、功能按鍵與自動偵測)
    this.setupMobileControls();

    // 8.2 綁定背景音樂 (BGM) 控制與狀態更新
    this.hud.setupBGMClick(() => this.toggleBGM());
    this.input.onToggleBGM(() => this.toggleBGM());
    bgmManager.onModeChange = (mode, isMuted) => {
      this.hud.updateBGMStatus(mode, isMuted);
    };

    // 9. 綁定開始遊戲按鈕
    this.setupStartScreen();

    // 10. 啟動遊戲主迴圈
    this.tick();
  }

  private setupStartScreen() {
    const startScreen = document.getElementById('start-screen');
    if (!startScreen) return;

    startScreen.addEventListener('click', () => {
      this.input.requestPointerLock();
      soundManager.playSchoolBell(); // 響起經典校園西敏寺鐘聲
      bgmManager.start();            // 啟動 Web Audio API 動態背景音樂
      startScreen.style.opacity = '0';
      setTimeout(() => {
        startScreen.style.display = 'none';
        this.isGameRunning = true;
      }, 500);
    });
  }

  private spawnCampusNPCs() {
    // 1. 生教組長：巡邏於中庭大走道 (行走 5.0、追捕跑步 10.0、攻擊力 36、擊飛拋物線)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(15, 0, 25),
      'TEACHER',
      [new THREE.Vector3(15, 0, 25), new THREE.Vector3(15, 0, 55), new THREE.Vector3(5, 0, 40)]
    ));

    // 2. 主任教官：巡邏於校門迎賓廣場 (行走 5.0、追捕跑步 10.0、攻擊力 36、卡其軍服大盤帽)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(0, 0, 75),
      'INSTRUCTOR',
      [new THREE.Vector3(-10, 0, 75), new THREE.Vector3(10, 0, 75), new THREE.Vector3(0, 0, 95)]
    ));

    // 3. 校犬柴柴（赤柴犬）：司令台與操場周邊巡視 (行走 5.0、追捕 13.5 比單車 15.0 慢一點點、攻擊力 30)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-50, 0, -10),
      'DOG',
      [
        new THREE.Vector3(-50, 0, -10), // 司令台前
        new THREE.Vector3(-25, 0, 15),  // 操場東側跑道邊
        new THREE.Vector3(-25, 0, 50),  // 操場東北側
        new THREE.Vector3(-75, 0, 45),  // 操場西北側
        new THREE.Vector3(-75, 0, 10)   // 操場西南側
      ]
    ));

    // 3. 騎著單車的糾察隊 (數量加倍為原本的 2 倍：共 4 名單車巡邏同學)
    // 單車糾察 1：操場跑道外環道與中庭巡弋
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-22, 0, 45),
      'BIKE_PATROL',
      [
        new THREE.Vector3(-22, 0, 45),
        new THREE.Vector3(-22, 0, -5),
        new THREE.Vector3(5, 0, -25),
        new THREE.Vector3(5, 0, 55)
      ]
    ));

    // 單車糾察 2：車棚、合作社前廣場巡邏
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-45, 0, -45),
      'BIKE_PATROL',
      [
        new THREE.Vector3(-45, 0, -45),
        new THREE.Vector3(-15, 0, -50),
        new THREE.Vector3(-5, 0, -25),
        new THREE.Vector3(-35, 0, -30)
      ]
    ));

    // 單車糾察 3 (加倍新增)：教學大樓前林蔭大道巡邏
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(12, 0, 40),
      'BIKE_PATROL',
      [
        new THREE.Vector3(12, 0, 10),
        new THREE.Vector3(12, 0, 75),
        new THREE.Vector3(2, 0, 60),
        new THREE.Vector3(2, 0, 20)
      ]
    ));

    // 單車糾察 4 (加倍新增)：操場西側與後直道外圍巡邏
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-75, 0, 30),
      'BIKE_PATROL',
      [
        new THREE.Vector3(-75, 0, 0),
        new THREE.Vector3(-75, 0, 60),
        new THREE.Vector3(-60, 0, 70),
        new THREE.Vector3(-60, 0, -10)
      ]
    ));

    // 5. 風紀糾察隊 (步巡)：籃球場與福利社前廣場
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(15, 0, -25),
      'INSPECTOR',
      [new THREE.Vector3(15, 0, -25), new THREE.Vector3(5, 0, -45), new THREE.Vector3(-5, 0, -30)]
    ));

    // 6. 風紀糾察隊 (步巡)：校門口與警衛室前
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(0, 0, 90),
      'INSPECTOR',
      [new THREE.Vector3(-12, 0, 90), new THREE.Vector3(12, 0, 90)]
    ));

    // 7. 普通學生：數量加倍為原本的 2 倍 (6 隻 -> 12 隻普通同學)
    const studentCoords = [
      new THREE.Vector3(-12, 0, -45), // 合作社前
      new THREE.Vector3(22, 0, -35),  // 籃球場邊
      new THREE.Vector3(18, 0, 8),    // 敬業樓大樓前廣場
      new THREE.Vector3(18, 0, 68),   // 樂群樓大樓前廣場
      new THREE.Vector3(0, 0, 25),    // 花圃旁散步
      new THREE.Vector3(-15, 0, 0),   // 操場東跑道外側
      new THREE.Vector3(8, 0, -50),   // 合作社露天座休息區
      new THREE.Vector3(24, 0, -55),  // 籃球場看台側
      new THREE.Vector3(20, 0, 25),   // 敬業樓前開闊廣場
      new THREE.Vector3(20, 0, 65),   // 樂群樓前開闊廣場
      new THREE.Vector3(-45, 0, 20),  // 操場足球草皮邊
      new THREE.Vector3(-55, 0, -68)  // 腳踏車棚旁聊天
    ];

    studentCoords.forEach((coord, i) => {
      // 確保巡邏路徑始終朝向寬闊中庭，避免往東側建築牆壁行走
      const offsetX = coord.x >= 18 ? -4 : (i % 2 === 0 ? 4 : -4);
      this.npcs.push(new NPC(
        this.engine.scene,
        coord,
        'STUDENT',
        [coord.clone(), coord.clone().add(new THREE.Vector3(offsetX, 0, 5))]
      ));
    });

    // 8. 教學大樓高樓層師生 (敬業樓 A 棟 & 樂群樓 B 棟 2F/3F 巡堂老師與學生)
    // 敬業樓 2F (Y = 6.0)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 6.0, 18),
      'TEACHER',
      [new THREE.Vector3(31, 6.0, 6), new THREE.Vector3(31, 6.0, 30)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 6.0, 10),
      'STUDENT',
      [new THREE.Vector3(38, 6.0, 10), new THREE.Vector3(34, 6.0, 10)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 6.0, 26),
      'STUDENT',
      [new THREE.Vector3(38, 6.0, 26), new THREE.Vector3(34, 6.0, 26)]
    ));

    // 敬業樓 3F (Y = 12.0)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 12.0, 18),
      'TEACHER',
      [new THREE.Vector3(31, 12.0, 6), new THREE.Vector3(31, 12.0, 30)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 12.0, 10),
      'STUDENT',
      [new THREE.Vector3(38, 12.0, 10), new THREE.Vector3(34, 12.0, 10)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 12.0, 26),
      'STUDENT',
      [new THREE.Vector3(38, 12.0, 26), new THREE.Vector3(34, 12.0, 26)]
    ));

    // 樂群樓 2F (Y = 6.0)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 6.0, 72),
      'TEACHER',
      [new THREE.Vector3(31, 6.0, 60), new THREE.Vector3(31, 6.0, 84)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 6.0, 64),
      'STUDENT',
      [new THREE.Vector3(38, 6.0, 64), new THREE.Vector3(34, 6.0, 64)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 6.0, 80),
      'STUDENT',
      [new THREE.Vector3(38, 6.0, 80), new THREE.Vector3(34, 6.0, 80)]
    ));

    // 樂群樓 3F (Y = 12.0)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 12.0, 72),
      'TEACHER',
      [new THREE.Vector3(31, 12.0, 60), new THREE.Vector3(31, 12.0, 84)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 12.0, 64),
      'STUDENT',
      [new THREE.Vector3(38, 12.0, 64), new THREE.Vector3(34, 12.0, 64)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(38, 12.0, 80),
      'STUDENT',
      [new THREE.Vector3(38, 12.0, 80), new THREE.Vector3(34, 12.0, 80)]
    ));

    // 9. 校園外圍警戒區：校外強盜 (Bandit) - 走路6.8、追捕11.5、攻擊0.55s、阻絕於校門外
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-15, 0, 118),
      'BANDIT',
      [new THREE.Vector3(-25, 0, 118), new THREE.Vector3(5, 0, 118)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(15, 0, 122),
      'BANDIT',
      [new THREE.Vector3(5, 0, 122), new THREE.Vector3(25, 0, 122)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(0, 0, 128),
      'BANDIT',
      [new THREE.Vector3(-18, 0, 128), new THREE.Vector3(18, 0, 128)]
    ));
    // 西側與東側外環道路巡邏強盜
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-118, 0, 10),
      'BANDIT',
      [new THREE.Vector3(-118, 0, -40), new THREE.Vector3(-118, 0, 60)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(118, 0, 10),
      'BANDIT',
      [new THREE.Vector3(118, 0, -40), new THREE.Vector3(118, 0, 60)]
    ));

    // 10. 至善樓 C 棟 (科技與藝術綜合館) 師生
    // 1F (Y = 0) 走廊巡堂老師
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-49, 0, 76),
      'TEACHER',
      [new THREE.Vector3(-49, 0, 65), new THREE.Vector3(-49, 0, 87)]
    ));
    // 2F (Y = 6.0) 走廊學生
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-49, 6.0, 76),
      'STUDENT',
      [new THREE.Vector3(-49, 6.0, 65), new THREE.Vector3(-49, 6.0, 87)]
    ));
    // 3F (Y = 12.0) 電腦教室課堂學生
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-38, 12.0, 70),
      'STUDENT',
      [new THREE.Vector3(-38, 12.0, 70), new THREE.Vector3(-44, 12.0, 70)]
    ));

    // 11. 演藝大樓 4F 羽球館 Boss：熱血體育組長 林教頭 (PE_TEACHER_BOSS)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(74, 12.0, 32),
      'PE_TEACHER_BOSS',
      [
        new THREE.Vector3(74, 12.0, 32),
        new THREE.Vector3(74, 12.0, 44),
        new THREE.Vector3(70, 12.0, 38),
        new THREE.Vector3(78, 12.0, 38)
      ]
    ));

    // 4F 羽球校隊訓練同學
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(74, 12.0, 44),
      'STUDENT',
      [new THREE.Vector3(70, 12.0, 44), new THREE.Vector3(78, 12.0, 44)]
    ));
  }

  private setupInteractions() {
    // E 鍵互動：合作社買熱食 / 惡搞廣播 / 拿放籃球 / 賽跑計時 / 單車上下車
    this.input.onInteract(() => {
      if (this.player.isDead || this.player.hp <= 0) return;

      // 0. 天天合作社 (熱食補血部)：按 E 開啟美食選單補血
      if (this.player.position.distanceTo(this.world.commissaryPos) < 3.8) {
        this.hud.openCommissary(this.playerCash, (item) => this.buyCommissaryItem(item));
        return;
      }

      // 0.5 自然生態探索園區野生香菇採摘 (效果完全隨機與外觀無關：補血、爆發體力、劇毒侵蝕、麻痺減速、幸運金幣、輕功高跳)
      const mushroomResult = this.ecologicalGarden.tryPickMushroom(this.player.position);
      if (mushroomResult.picked && mushroomResult.effect) {
        switch (mushroomResult.effect) {
          case 'HEAL':
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
            soundManager.playEatFood();
            break;
          case 'STAMINA':
            this.player.stamina = this.player.maxStamina;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
            soundManager.playEatFood();
            break;
          case 'POISON':
            this.player.takeDamage(12, '奇異毒菇');
            this.player.poisonTimer = 5.0;
            this.player.poisonTickTimer = 0.0;
            soundManager.playPoisonTick();
            break;
          case 'PARALYSIS':
            this.player.takeDamage(8, '麻痺孢子');
            this.player.walkSpeed = 2.5;
            this.player.sprintSpeed = 5.0;
            setTimeout(() => {
              this.player.walkSpeed = 5.0;
              this.player.sprintSpeed = 10.0;
            }, 5000);
            break;
          case 'LUCKY_GOLD':
            this.playerCash += 80;
            this.hud.setCash(this.playerCash);
            soundManager.playCoinToss();
            break;
          case 'SUPER_JUMP':
            this.player.jumpStrength = 14.5;
            setTimeout(() => {
              this.player.jumpStrength = 8.5;
            }, 8000);
            break;
        }
        this.wantedSystem.showBanner(`${mushroomResult.title} ${mushroomResult.desc}`, 3500);
        return;
      }

      // 0.8 自然生態池許願投幣 (湖中女神許願小遊戲：金幣贈予、清泉甘霖、極速微風、噴水淘氣)
      if (this.ecologicalGarden.isNearWishingPond(this.player.position)) {
        const pondResult = this.ecologicalGarden.tossCoinToPond(this.playerCash);
        if (pondResult.success) {
          this.playerCash = Math.max(0, this.playerCash - 30 + pondResult.rewardCash);
          this.hud.setCash(this.playerCash);
          if (pondResult.healHp > 0) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + pondResult.healHp);
            this.player.stamina = this.player.maxStamina;
          }
          if (pondResult.speedBoostDuration > 0) {
            this.player.walkSpeed = 8.5;
            this.player.sprintSpeed = 16.0;
            setTimeout(() => {
              this.player.walkSpeed = 5.0;
              this.player.sprintSpeed = 10.0;
            }, pondResult.speedBoostDuration * 1000);
          }
        }
        this.wantedSystem.showBanner(pondResult.message, 4500);
        return;
      }

      // 1. 若正拿著籃球：按 E 放下籃球
      if (this.isHoldingBasketball) {
        this.isHoldingBasketball = false;
        this.isChargingShot = false;
        this.player.isInvisible = false;
        this.hud.setBasketballAiming(false);
        this.hud.hideShotMeter();
        this.basketballMesh.position.y = 0.24;
        this.wantedSystem.showBanner('放下籃球 (恢復第三人稱角色顯示)', 1500);
        return;
      }

      // 2. 佔領學務處全校廣播台惡搞
      if (this.player.position.distanceTo(this.world.broadcastStationPos) < 2.5) {
        if (this.broadcastCooldown <= 0) {
          this.broadcastCooldown = 20.0;
          soundManager.playBroadcastChime();
          const announcement = this.announcements[Math.floor(Math.random() * this.announcements.length)];
          this.wantedSystem.showBanner(announcement, 5500);
          // 全校所有 NPC 定格立正發呆 4 秒鐘！
          for (const npc of this.npcs) {
            npc.freeze(4.0);
          }
        } else {
          this.wantedSystem.showBanner(`學務處廣播系統冷卻中，請等待 ${Math.ceil(this.broadcastCooldown)} 秒`, 2000);
        }
        return;
      }

      // 3. 操場籃球場：拿起籃球 (切換隱形瞄準模式，保留中央準心方便瞄準籃框)
      if (!this.currentRidingBike && this.basketballMesh.position.distanceTo(this.player.position) < 2.5 && !this.isBallInAir) {
        this.isHoldingBasketball = true;
        this.isChargingShot = false;
        this.shotChargeRatio = 0;
        this.player.isInvisible = true;
        this.hud.setBasketballAiming(true);
        this.wantedSystem.showBanner('🏀 拿起籃球！按住滑鼠左鍵蓄力，綠色時機放開出手！(站在標線上命中率大增)', 4000);
        return;
      }

      // 4. 操場 200m 賽跑計時挑戰 (起跑線位於東主直道北端 Z: 14)
      if (this.player.position.distanceTo(this.world.trackStartPos) < 4.5 && !this.currentRidingBike) {
        this.isRacingTrack = true;
        this.raceTimer = 0;
        this.raceCheckpointIdx = 0;
        soundManager.playWhistle();
        this.wantedSystem.showBanner('⏱️【200m 操場極速挑戰賽開始！】請沿著跑道「逆時針方向」全力衝刺！', 3500);
        return;
      }

      // 4.5 天天國中 25m 標準游泳館 50m 水上競速挑戰 (北端起跑線 X: 75, Z: -48.6)
      if (this.player.position.distanceTo(this.world.swimmingPoolPos) < 4.5 && !this.currentRidingBike && !this.isSwimmingRace) {
        this.isSwimmingRace = true;
        this.swimRaceTimer = 0;
        this.swimCheckpointIdx = 0;
        soundManager.playWhistle();
        this.wantedSystem.showBanner('🏊【50m 自由式水上競速賽開始！】跳入泳池游過青色檢查點！', 4000);
        return;
      }

      // 5. 單車上下車互動 (支援強行搶奪單車糾察隊同學的自行車)
      if (this.currentRidingBike) {
        this.currentRidingBike.dismount(this.player, this.engine.scene);
        this.player.isRidingVehicle = false;
        this.currentRidingBike = null;
        this.cameraCtrl.setMode(false);
      } else {
        // 先判定是否搶奪騎單車糾察隊同學的單車 (Requirement 3: 可以搶騎著單車的學生的自行車)
        let hijackedBike = false;
        for (const npc of this.npcs) {
          if (npc.role === 'BIKE_PATROL' && !npc.isKnockedDown && npc.position.distanceTo(this.player.position) < 3.2) {
            hijackedBike = true;
            soundManager.playBikeHijack();
            npc.loseBike();
            const stolenBike = new Bicycle(this.engine.scene, npc.position, 0x3498db);
            this.bicycles.push(stolenBike);
            stolenBike.mount(this.player);
            this.currentRidingBike = stolenBike;
            this.player.isRidingVehicle = true;
            this.cameraCtrl.setMode(true);
            this.wantedSystem.reportCrime(2, '強行搶奪同學自行車');
            this.wantedSystem.showBanner('🚲 成功搶奪同學的自行車！風馳電掣！按 [E] 可下車', 3000);
            break;
          }
        }

        if (!hijackedBike) {
          for (const bike of this.bicycles) {
            if (bike.position.distanceTo(this.player.position) < 3.0) {
              bike.mount(this.player);
              this.currentRidingBike = bike;
              this.player.isRidingVehicle = true;
              this.cameraCtrl.setMode(true);
              break;
            }
          }
        }
      }
    });

    // 滑鼠左鍵：投籃蓄力 / 單車鳴鈴 / 揮動武器攻擊 (拳頭 / 普通球棒 / 特殊球棒)
    this.input.onAttack(() => {
      if (this.player.isDead || this.player.hp <= 0) return;

      if (this.isHoldingBasketball) {
        // 開始蓄力投籃
        if (!this.isChargingShot) {
          this.isChargingShot = true;
          this.shotChargeRatio = 0;
          const sweetMin = this.currentActiveHotspot ? 0.62 : 0.68;
          const sweetMax = this.currentActiveHotspot ? 0.88 : 0.84;
          this.hud.showShotMeter(sweetMin, sweetMax);
        }
        return;
      }

      if (this.currentRidingBike) {
        this.currentRidingBike.ringBell();
      } else {
        this.player.attack();

        const reach = this.player.getWeaponReach();
        const damage = this.player.getWeaponDamage();
        const knockback = this.player.getWeaponKnockback();

        const playerForward = new THREE.Vector3(
          Math.sin(this.player.rotationY),
          0,
          Math.cos(this.player.rotationY)
        ).normalize();

        // 1. 優先檢測是否命中生態園植物生物 (食人藤蔓怪物或變異食人花王 Boss)
        const plantHit = this.ecologicalGarden.tryHitByPlayer(
          this.player.position,
          reach,
          damage,
          playerForward
        );

        if (plantHit.hit) {
          if (plantHit.isBoss) {
            if (plantHit.defeated) {
              this.playerCash += 500;
              this.wantedSystem.showBanner('👑 狂賀！斬殺秘境霸主【變異食人花王】！獲得通關巨額獎金 +$500！', 6000);
              this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
            } else {
              this.wantedSystem.showBanner(`💥 命中【變異食人花王】！造成 ${damage} 傷害！(Boss HP: ${Math.ceil(this.ecologicalGarden.boss.hp)})`, 1500);
            }
          } else {
            if (plantHit.defeated) {
              this.playerCash += 40;
              this.wantedSystem.showBanner(`🌿 斬除【${plantHit.name}】！獲得冒險獎勵 +$40！`, 2500);
            } else {
              this.wantedSystem.showBanner(`🌿 擊中【${plantHit.name}】！造成 ${damage} 傷害！`, 1500);
            }
          }
          return;
        }

        // 2. 檢測是否命中附近的 NPC (越強獎金越高)
        for (const npc of this.npcs) {
          if (npc.position.distanceTo(this.player.position) < reach + 0.3 && !npc.isKnockedDown) {
            const wasKnocked = npc.launchFlying(playerForward, knockback, damage);
            if (wasKnocked) {
              let reward = 20;
              if (npc.role === 'STUDENT') {
                this.studentDefeatedCount++;
                reward = 20;

                // 檢查是否解鎖普通棒球棍 (擊敗 20 隻普通同學)
                if (this.studentDefeatedCount >= 20 && !this.player.hasNormalBat) {
                  this.player.hasNormalBat = true;
                  this.player.setWeapon('NORMAL_BAT');
                  this.wantedSystem.showBanner('🎉 達成成就【制霸走廊】！擊敗20名普通同學，解鎖【普通木質棒球棍】！(按 2 裝備，ATK 55)', 6000);
                  soundManager.playBatHit();
                }
              } else if (npc.role === 'INSPECTOR') {
                reward = 40;
              } else if (npc.role === 'BIKE_PATROL') {
                this.bikePatrolDefeatedCount++;
                reward = 60;
              } else if (npc.role === 'TEACHER') {
                this.teacherDefeatedCount++;
                reward = 80;
              } else if (npc.role === 'BANDIT') {
                reward = 100;
              } else if (npc.role === 'DOG') {
                this.dogDefeatedCount++;
                reward = 120;
              } else if (npc.role === 'INSTRUCTOR') {
                this.teacherDefeatedCount++;
                reward = 150;
              } else if (npc.role === 'PE_TEACHER_BOSS') {
                reward = 180;
                this.wantedSystem.showBanner('🏸 震撼勝利！強勢擊敗【體育組長 林教頭】！獲得大額獎金 +$180！', 6000);
              }

              this.playerCash += reward;

              // 檢查是否解鎖特殊棒球棍 (擊敗身教孝全 x1, 校犬 x1, 單車糾察 x5)
              if (this.teacherDefeatedCount >= 1 && this.dogDefeatedCount >= 1 && this.bikePatrolDefeatedCount >= 5 && !this.player.hasSpecialBat) {
                this.player.hasSpecialBat = true;
                this.player.setWeapon('SPECIAL_BAT');
                this.wantedSystem.showBanner('⚡ 達成傳奇成就【校園霸王】！擊倒生教組長、校犬與5名單車糾察，解鎖神兵【黃金雷霆棒球棍】！(按 3 裝備，ATK 120)', 7000);
                soundManager.playSpecialBatHit();
              }

              this.wantedSystem.reportCrime(1, `擊倒${npc.getRoleTitle()}`);
              this.wantedSystem.showBanner(`${npc.getRoleTitle()} 倒地！獲得獎金 +$${reward}！(10秒後復活)`, 3500);
            } else {
              this.wantedSystem.reportCrime(1, '校園打架鬥毆');
              npc.isChasing = true; // 目標激怒追擊！
            }
            break;
          }
        }
      }
    });

    // 鍵盤按鍵監聽：數字鍵 1/2/3 武器切換、R 鍵發球、ESC 關閉合作社
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Digit1') {
        this.player.setWeapon('FIST');
        this.wantedSystem.showBanner('🥊 切換武器：徒手拳擊 (ATK 25)', 1500);
      } else if (e.code === 'Digit2') {
        if (this.player.hasNormalBat) {
          this.player.setWeapon('NORMAL_BAT');
          this.wantedSystem.showBanner('🏏 切換武器：普通木質棒球棍 (ATK 55)', 1500);
        } else {
          this.wantedSystem.showBanner(`🔒 普通棒球棍未解鎖！需擊敗 20 名普通同學 (目前進度: ${this.studentDefeatedCount}/20)`, 2500);
        }
      } else if (e.code === 'Digit3') {
        if (this.player.hasSpecialBat) {
          this.player.setWeapon('SPECIAL_BAT');
          this.wantedSystem.showBanner('⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)', 1500);
        } else {
          this.wantedSystem.showBanner(`🔒 特殊棒球棍未解鎖！需擊敗生教(1)、校犬(1)、單車糾察(5) (目前: 教${this.teacherDefeatedCount}/1 犬${this.dogDefeatedCount}/1 車${this.bikePatrolDefeatedCount}/5)`, 2500);
        }
      } else if (e.code === 'Escape') {
        if (this.hud.isCommissaryOpen) {
          this.hud.closeCommissary();
        }
      } else if (e.code === 'KeyR') {
        if (!this.isHoldingBasketball && !this.isBallInAir) {
          if (this.player.position.distanceTo(this.world.basketballSpawnPos) < 40) {
            this.basketballMesh.position.copy(this.world.basketballSpawnPos);
            this.ballVelocity.set(0, 0, 0);
            this.wantedSystem.showBanner('🏀 籃球已重新發球回西場頂弧三分點！', 2000);
          }
        }
      }
    });
  }

  // 合作社購買熱食補血回呼
  private buyCommissaryItem(item: CommissaryItem) {
    if (this.playerCash < item.price) {
      this.wantedSystem.showBanner('零用錢不足！快去探索校園賺錢吧！', 2000);
      return;
    }

    this.playerCash -= item.price;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.healHp);
    if (item.restoreStamina) {
      this.player.stamina = this.player.maxStamina;
    }

    soundManager.playCashRegister();
    soundManager.playEatFood();
    this.hud.setCash(this.playerCash);
    this.wantedSystem.showBanner(`😋 品嚐了【${item.name}】！體力 +${item.healHp} HP！剩餘零用錢 $${this.playerCash}`, 3000);
    this.hud.openCommissary(this.playerCash, (i) => this.buyCommissaryItem(i));
  }

  // 蓄力投籃出手物理與精準度計算
  private releaseBasketballShot() {
    if (!this.isHoldingBasketball || !this.isChargingShot) return;
    this.isChargingShot = false;

    const ratio = this.shotChargeRatio;
    const sweetMin = this.currentActiveHotspot ? 0.62 : 0.68;
    const sweetMax = this.currentActiveHotspot ? 0.88 : 0.84;

    let quality: 'PERFECT' | 'GOOD' | 'BAD' = 'BAD';
    let feedbackType: 'PERFECT' | 'GOOD' | 'LATE' | 'EARLY' = 'EARLY';

    if (ratio >= sweetMin && ratio <= sweetMax) {
      quality = 'PERFECT';
      feedbackType = 'PERFECT';
    } else if (ratio >= sweetMin - 0.14 && ratio <= sweetMax + 0.10) {
      quality = 'GOOD';
      feedbackType = 'GOOD';
    } else if (ratio > sweetMax + 0.10) {
      quality = 'BAD';
      feedbackType = 'LATE';
    } else {
      quality = 'BAD';
      feedbackType = 'EARLY';
    }

    this.hud.showShotFeedback(feedbackType);

    // 投出三分球！角色恢復顯示
    this.isHoldingBasketball = false;
    this.player.isInvisible = false;
    this.hud.setBasketballAiming(false);
    this.isBallInAir = true;
    this.ballResetTimer = 3.8;
    this.targetShotQuality = quality;

    // 尋找玩家鏡頭中央準心所對準的最佳目標籃框
    const camDir = new THREE.Vector3();
    this.cameraCtrl.camera.getWorldDirection(camDir);
    const camHoriz = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();

    let bestHoop = this.world.hoopTargets[0];
    let bestScore = -999;
    for (const hoop of this.world.hoopTargets) {
      const toH = new THREE.Vector3().subVectors(hoop, this.player.position);
      const toHHoriz = new THREE.Vector3(toH.x, 0, toH.z).normalize();
      const dot = camHoriz.dot(toHHoriz);
      const dist = toH.length();
      if (dot > 0.15 && dist < 36) {
        const score = dot * 10 - dist * 0.15;
        if (score > bestScore) {
          bestScore = score;
          bestHoop = hoop;
        }
      }
    }

    // 依據距離計算完美高拋物線彈道
    const toHoop = new THREE.Vector3().subVectors(bestHoop, this.player.position);
    const horizDist = Math.max(3.0, Math.sqrt(toHoop.x * toHoop.x + toHoop.z * toHoop.z));
    const heightDiff = (bestHoop.y - (this.player.position.y + 1.1));
    const g = 19.0;

    const flightTime = 0.82 + horizDist * 0.038;

    let targetOffset = new THREE.Vector3(0, 0, 0);
    if (quality === 'PERFECT') {
      targetOffset.set(0, 0, 0); // 100% 直奔籃心
    } else if (quality === 'GOOD') {
      const side = Math.random() > 0.5 ? 0.15 : -0.15;
      targetOffset.set(side, 0.05, (Math.random() - 0.5) * 0.15);
    } else {
      const sign = (feedbackType === 'LATE') ? 0.65 : -0.55;
      targetOffset.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.3, sign);
    }

    const aimPoint = bestHoop.clone().add(targetOffset);
    const aimVec = new THREE.Vector3().subVectors(aimPoint, this.player.position);

    const reqHorizSpeed = horizDist / flightTime;
    const reqUpwardSpeed = (heightDiff + 0.5 * g * flightTime * flightTime) / flightTime;

    const launchHorizDir = new THREE.Vector3(aimVec.x, 0, aimVec.z).normalize();
    this.ballVelocity.set(
      launchHorizDir.x * reqHorizSpeed,
      reqUpwardSpeed,
      launchHorizDir.z * reqHorizSpeed
    );

    soundManager.playPunch();
  }

  // 切換背景音樂 (BGM) 靜音/播放
  private toggleBGM() {
    const isMuted = bgmManager.toggleMute();
    if (isMuted) {
      this.wantedSystem.showBanner('🔇 背景音樂 (BGM) 已靜音', 2000);
    } else {
      const modeText = bgmManager.getMode() === 'PURSUIT' ? '通緝逃亡熱血節奏' : '校園漫步放鬆旋律';
      this.wantedSystem.showBanner(`🎵 背景音樂 (BGM) 已開啟【${modeText}】`, 2500);
    }
  }

  // 玩家死亡處理流程 (修復問題 1：角色死亡後敵人的仇恨值徹底歸零、通緝解除、3 秒後重生於保健室)
  private handlePlayerDeath(reason: string) {
    if (this.isHandlingDeath) return;
    this.isHandlingDeath = true;

    if (this.currentRidingBike) {
      this.currentRidingBike.dismount(this.player, this.engine.scene);
      this.currentRidingBike = null;
      this.player.isRidingVehicle = false;
      this.cameraCtrl.setMode(false);
    }

    if (this.isHoldingBasketball) {
      this.isHoldingBasketball = false;
      this.isChargingShot = false;
      this.player.isInvisible = false;
      this.hud.setBasketballAiming(false);
      this.hud.hideShotMeter();
    }

    this.hud.hidePrompt();
    this.wantedSystem.showBanner(`${reason} 已失去意識送往保健室 (3秒後重返校園)...`, 4000);
    bgmManager.duckVolume(3.2); // 昏厥失神時背景音樂壓抑衰減

    // 立即解除通緝並清除全場所有 NPC 仇恨追擊狀態
    this.wantedSystem.clearWanted();
    for (const n of this.npcs) {
      n.resetAggro();
    }

    // 延遲 3 秒後重生於校園保健室前廣場
    setTimeout(() => {
      this.player.respawn(new THREE.Vector3(0, 0, 15));
      this.wantedSystem.clearWanted();
      for (const n of this.npcs) {
        n.resetAggro();
      }
      this.isHandlingDeath = false;
      this.wantedSystem.showBanner('已在保健室休養恢復，全校警報全面解除', 3500);
    }, 3000);
  }

  // 手機觸控操作系統 (虛擬搖桿移動、視角轉動、攻擊、跳躍、衝刺、互動按鍵)
  private setupMobileControls() {
    const container = document.getElementById('mobile-controls-container');
    const toggleBtn = document.getElementById('toggle-mobile-mode-btn');
    const joystickZone = document.getElementById('touch-joystick-zone');
    const joystickThumb = document.getElementById('touch-joystick-thumb');

    const btnAttack = document.getElementById('m-btn-attack');
    const btnJump = document.getElementById('m-btn-jump');
    const btnSprint = document.getElementById('m-btn-sprint');
    const btnInteract = document.getElementById('m-btn-interact');

    // 自動偵測觸控裝置：若支援觸控則預設直接展開控制面板
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice && container) {
      container.style.display = 'block';
      if (toggleBtn) toggleBtn.textContent = '📱 隱藏手機鍵盤';
    }

    // 支援手動切換開關 (方便電腦除錯或自由切換)
    if (toggleBtn && container) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCurrentlyOpen = container.style.display === 'block';
        container.style.display = isCurrentlyOpen ? 'none' : 'block';
        toggleBtn.textContent = isCurrentlyOpen ? '📱 手機虛擬按鍵' : '📱 隱藏手機鍵盤';
      });
    }

    // 虛擬搖桿拖曳處理
    if (joystickZone && joystickThumb) {
      let activeTouchId: number | null = null;
      let zoneRect: DOMRect | null = null;
      const maxRadius = 45;

      const handleMove = (clientX: number, clientY: number) => {
        if (!zoneRect) return;
        const centerX = zoneRect.left + zoneRect.width / 2;
        const centerY = zoneRect.top + zoneRect.height / 2;

        let dx = clientX - centerX;
        let dy = clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxRadius) {
          dx = (dx / dist) * maxRadius;
          dy = (dy / dist) * maxRadius;
        }

        joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.input.setVirtualAxis(dx / maxRadius, dy / maxRadius);
      };

      const handleEnd = () => {
        activeTouchId = null;
        zoneRect = null;
        joystickThumb.style.transform = 'translate(-50%, -50%)';
        this.input.setVirtualAxis(0, 0);
      };

      joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        zoneRect = joystickZone.getBoundingClientRect();
        handleMove(touch.clientX, touch.clientY);
      }, { passive: false });

      joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
          }
        }
      }, { passive: false });

      joystickZone.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            handleEnd();
            break;
          }
        }
      }, { passive: false });

      joystickZone.addEventListener('touchcancel', handleEnd, { passive: false });

      // 滑鼠拖曳除錯支援
      let isMouseDown = false;
      joystickZone.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        zoneRect = joystickZone.getBoundingClientRect();
        handleMove(e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', (e) => {
        if (isMouseDown) handleMove(e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', () => {
        if (isMouseDown) {
          isMouseDown = false;
          handleEnd();
        }
      });
    }

    // 觸控按鍵輔助綁定
    const bindButton = (
      btn: HTMLElement | null,
      onPress: () => void,
      onRelease?: () => void
    ) => {
      if (!btn) return;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }, { passive: false });

      if (onRelease) {
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRelease();
        }, { passive: false });
        btn.addEventListener('touchcancel', (e) => {
          e.preventDefault();
          onRelease();
        }, { passive: false });
      }

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      });
      if (onRelease) {
        btn.addEventListener('mouseup', (e) => {
          e.preventDefault();
          onRelease();
        });
      }
    };

    bindButton(btnAttack, () => {
      this.input.triggerVirtualAttack();
    }, () => {
      if (this.isHoldingBasketball && this.isChargingShot) {
        this.releaseBasketballShot();
      }
    });

    bindButton(btnJump, () => {
      this.input.setVirtualJump(true);
    }, () => {
      this.input.setVirtualJump(false);
    });

    bindButton(btnSprint, () => {
      this.input.setVirtualSprint(true);
    }, () => {
      this.input.setVirtualSprint(false);
    });

    bindButton(btnInteract, () => {
      this.input.triggerVirtualInteract();
    });
  }

  // 角色群體推擠物理 (倒地昏迷時碰撞箱不生效)
  private resolveCharacterSeparation() {
    const minDistance = 0.85;
    const minDistanceSq = minDistance * minDistance;

    // 檢查玩家與所有活著的 NPC 之間的推擠
    if (!this.player.isRidingVehicle && !this.player.isDead) {
      for (const npc of this.npcs) {
        if (npc.isKnockedDown || npc.isKnockedFlying) continue; // 倒地或被擊飛時碰撞箱不生效

        const dx = npc.position.x - this.player.position.x;
        const dz = npc.position.z - this.player.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDistanceSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDistance - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;

          this.player.position.x -= nx * overlap;
          this.player.position.z -= nz * overlap;
          npc.position.x += nx * overlap;
          npc.position.z += nz * overlap;

          this.player.mesh.position.copy(this.player.position);
          npc.mesh.position.copy(npc.position);
        }
      }
    }

    // 檢查所有 NPC 彼此之間的推擠
    for (let i = 0; i < this.npcs.length; i++) {
      if (this.npcs[i].isKnockedDown || this.npcs[i].isKnockedFlying) continue;
      for (let j = i + 1; j < this.npcs.length; j++) {
        if (this.npcs[j].isKnockedDown || this.npcs[j].isKnockedFlying) continue;

        const a = this.npcs[i];
        const b = this.npcs[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDistanceSq && distSq > 0.0001) {
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

  private tick = () => {
    requestAnimationFrame(this.tick);

    const delta = this.engine.getDelta();

    // 1. 處理滑鼠視角旋轉
    const mouseDelta = this.input.consumeMouseDelta();
    this.cameraCtrl.updateRotation(mouseDelta.x, mouseDelta.y);

    const forwardVec = this.cameraCtrl.getForwardVector();
    const rightVec = this.cameraCtrl.getRightVector();

    let targetPosition: THREE.Vector3;
    let playerRotY: number;

    // 2. 玩家或載具狀態更新
    if (this.currentRidingBike) {
      this.currentRidingBike.update(delta, this.input, this.world.colliders);
      targetPosition = this.currentRidingBike.position;
      playerRotY = this.currentRidingBike.rotationY;

      this.player.position.copy(targetPosition);

      // 單車衝撞 NPC (擊飛機制：高拋物線彈飛 + 擊中冷卻保護，徹底解決車頭推土機持續扣血問題)
      if (Math.abs(this.currentRidingBike.speed) > 4.0) {
        for (const npc of this.npcs) {
          if (npc.position.distanceTo(targetPosition) < 2.5 && !npc.isKnockedDown && !npc.isKnockedFlying && npc.hitCooldown <= 0) {
            const speed = Math.abs(this.currentRidingBike.speed);
            const dmg = Math.round(speed * 4.5 + 20); // 單次強烈撞擊傷害
            this.wantedSystem.reportCrime(2, '單車高速衝撞師生');

            // 擊飛向量：前方 + 兩側彈飛，絕不卡在車頭前方
            const bikeForward = new THREE.Vector3(Math.sin(playerRotY), 0, Math.cos(playerRotY)).normalize();
            const relX = npc.position.x - targetPosition.x;
            const relZ = npc.position.z - targetPosition.z;
            const sideDot = -bikeForward.z * relX + bikeForward.x * relZ;
            const sideSign = sideDot >= 0 ? 1 : -1;
            const sideVec = new THREE.Vector3(-bikeForward.z, 0, bikeForward.x).multiplyScalar(sideSign * 0.45);
            const launchDir = bikeForward.clone().add(sideVec).normalize();

            const wasKnocked = npc.launchFlying(launchDir, speed, dmg);

            if (wasKnocked) {
              this.wantedSystem.showBanner(`${npc.getRoleTitle()} 被單車強力撞飛倒地！(10秒後復活)`, 3500);
            } else {
              this.wantedSystem.showBanner(`${npc.getRoleTitle()} 被單車撞飛！`, 2000);
            }
            break;
          }
        }
      }
    } else {
      this.player.update(delta, this.input, forwardVec, rightVec, this.world.colliders);
      targetPosition = this.player.position;
      playerRotY = this.player.rotationY;

      // 游泳池水體判定：水面漂浮高度與划水打水音效
      const inPool = this.world.isInsideSwimmingPool(targetPosition);
      this.player.isSwimming = inPool;
      if (inPool) {
        this.player.position.y = 0.15; // 水面自然浮力
        if (this.input.forward || this.input.backward || this.input.left || this.input.right) {
          this.swimSplashTimer -= delta;
          if (this.swimSplashTimer <= 0) {
            soundManager.playWaterSplash();
            this.swimSplashTimer = 0.48;
          }
        }
      }

      // 持球瞄準時：角色朝向即時貼齊中央準心視角
      if (this.isHoldingBasketball) {
        const camDir = new THREE.Vector3();
        this.cameraCtrl.camera.getWorldDirection(camDir);
        const camForward = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
        this.player.rotationY = Math.atan2(camForward.x, camForward.z);
        this.player.mesh.rotation.y = this.player.rotationY;
        playerRotY = this.player.rotationY;
      }
    }

    // 方案 D 小遊戲與互動提示判定
    if (this.isHoldingBasketball) {
      // 檢測當前是否站在地面專屬投籃熱區標線內
      this.currentActiveHotspot = null;
      for (const spot of this.world.shootingHotspots) {
        const dist = targetPosition.distanceTo(spot.position);
        if (dist < spot.radius) {
          this.currentActiveHotspot = spot;
          const mat = spot.ringMesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.95;
          spot.ringMesh.scale.set(1.15, 1.15, 1.15);
        } else {
          const mat = spot.ringMesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.55;
          spot.ringMesh.scale.set(1.0, 1.0, 1.0);
        }
      }

      if (this.currentActiveHotspot) {
        this.hud.showPrompt('長按左鍵', `🎯【${this.currentActiveHotspot.name}】蓄力出手 (獎勵 +${this.currentActiveHotspot.bonusPoints}分)`);
      } else {
        this.hud.showPrompt('長按左鍵', '🏀【自由投籃】蓄力出手 (按 E 放下 / R 鍵快速發球)');
      }

      // 持球運球腳步聲
      if (this.input.forward || this.input.backward || this.input.left || this.input.right) {
        this.dribbleSoundTimer -= delta;
        if (this.dribbleSoundTimer <= 0) {
          soundManager.playDribble();
          this.dribbleSoundTimer = 0.36;
        }
      }

      // 蓄力狀態推進與放開出手檢測
      if (this.isChargingShot) {
        if (this.input.mouseButtons.left) {
          this.shotChargeRatio += delta * 1.35;
          this.hud.updateShotMeter(this.shotChargeRatio);
          if (this.shotChargeRatio >= 1.08) {
            this.releaseBasketballShot();
          }
        } else {
          this.releaseBasketballShot();
        }
      }
    } else if (this.currentRidingBike) {
      this.hud.showPrompt('E', '下車 (離開載具)');
    } else if (targetPosition.distanceTo(this.world.commissaryPos) < 3.8) {
      this.hud.showPrompt('E', '天天合作社 (買熱食補血)');
    } else if (targetPosition.distanceTo(this.world.broadcastStationPos) < 2.5) {
      if (this.broadcastCooldown <= 0) {
        this.hud.showPrompt('E', '佔領全校廣播麥克風惡搞');
      } else {
        this.hud.showPrompt('📢', `廣播冷卻中 (${Math.ceil(this.broadcastCooldown)}s)`);
      }
    } else if (this.basketballMesh.position.distanceTo(targetPosition) < 2.5 && !this.isBallInAir && !this.isWaitingForShotResult) {
      this.hud.showPrompt('E', '拿起籃球 (三分球挑戰)');
    } else if (targetPosition.distanceTo(this.world.trackStartPos) < 4.5 && !this.isRacingTrack) {
      this.hud.showPrompt('E', '參加 200m 操場極速挑戰 (逆時針方向)');
    } else if (this.isRacingTrack) {
      this.hud.showPrompt('⏱️', `操場計時: ${this.raceTimer.toFixed(1)}s (檢查點 ${this.raceCheckpointIdx + 1}/${this.world.trackCheckpoints.length})`);
    } else if (targetPosition.distanceTo(this.world.swimmingPoolPos) < 4.5 && !this.isSwimmingRace) {
      this.hud.showPrompt('E', '參加 50m 自由式水上競速挑戰');
    } else if (this.isSwimmingRace) {
      this.hud.showPrompt('🏊', `泳池計時: ${this.swimRaceTimer.toFixed(1)}s (檢查點 ${this.swimCheckpointIdx + 1}/${this.world.swimCheckpoints.length})`);
    } else if (this.ecologicalGarden.isNearWishingPond(targetPosition)) {
      this.hud.showPrompt('E', '🪙 向生態池許願投幣 ($30)');
    } else {
      let nearBikePatrol = false;
      for (const npc of this.npcs) {
        if (npc.role === 'BIKE_PATROL' && !npc.isKnockedDown && targetPosition.distanceTo(npc.position) < 3.2) {
          nearBikePatrol = true;
          break;
        }
      }

      if (nearBikePatrol) {
        this.hud.showPrompt('E', '🚲 搶奪同學自行車！');
      } else {
        let nearMushroom = false;
        for (const m of this.ecologicalGarden.mushrooms) {
          if (!m.isPicked && targetPosition.distanceTo(m.position) < 2.4) {
            nearMushroom = true;
            break;
          }
        }
        if (nearMushroom) {
          this.hud.showPrompt('E', '🍄 採摘野生奇異菇 (效果隨機)');
        } else {
          let nearBike: Bicycle | null = null;
          if (!this.player.isDead) {
            for (const bike of this.bicycles) {
              if (bike.position.distanceTo(this.player.position) < 3.0) {
                nearBike = bike;
                break;
              }
            }
          }
          if (nearBike && !this.player.isDead) {
            this.hud.showPrompt('E', '騎乘腳踏車');
          } else {
            this.hud.hidePrompt();
          }
        }
      }
    }

    // 方案 D 小遊戲物理與邏輯循環更新
    if (this.broadcastCooldown > 0) {
      this.broadcastCooldown -= delta;
    }

    // 籃球運動物理
    if (this.isHoldingBasketball) {
      const forward = new THREE.Vector3(Math.sin(playerRotY), 0, Math.cos(playerRotY));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      // 籃球置於中央準心前下方微偏右 (第一人稱持球射籃視角)，保留中央準心 100% 視野無死角
      this.basketballMesh.position.set(
        targetPosition.x + forward.x * 0.55 + right.x * 0.28,
        targetPosition.y + 0.88,
        targetPosition.z + forward.z * 0.55 + right.z * 0.28
      );
      this.basketballMesh.rotation.y += delta * 3.0;
    } else if (this.isBallInAir) {
      this.ballVelocity.y -= 19.0 * delta; // 重力加速度
      this.basketballMesh.position.addScaledVector(this.ballVelocity, delta);
      this.basketballMesh.rotation.x += delta * 12.0;

      // 命中籃框檢測 (智能命中判定與手感時機回饋)
      for (const hoop of this.world.hoopTargets) {
        const distToHoop = this.basketballMesh.position.distanceTo(hoop);
        if (distToHoop < 0.85 && this.ballVelocity.y < 0) {
          this.isBallInAir = false;

          if (this.targetShotQuality === 'PERFECT') {
            soundManager.playSwish();
            this.basketballScoreStreak++;
            const basePts = this.currentActiveHotspot ? this.currentActiveHotspot.bonusPoints : 150;
            const streakBonus = (this.basketballScoreStreak > 1) ? ` (連進 ${this.basketballScoreStreak} 球🔥)` : '';
            this.wantedSystem.showBanner(`🏀【PERFECT! 完美空心入網！】得分 +${basePts}！精力回滿！${streakBonus}`, 4000);
            this.player.stamina = this.player.maxStamina;
            this.ballVelocity.set(0, -3.0, 0); // 垂直空心墜地
            this.ballResetTimer = 2.5;
          } else if (this.targetShotQuality === 'GOOD') {
            soundManager.playRimHit();
            setTimeout(() => soundManager.playSwish(), 180);
            this.basketballScoreStreak++;
            const basePts = 100;
            this.wantedSystem.showBanner(`🏀【擦板彈框入網！】得分 +${basePts}！`, 3500);
            this.ballVelocity.set(0, -2.5, 0);
            this.ballResetTimer = 2.5;
          } else {
            soundManager.playRimHit();
            this.basketballScoreStreak = 0;
            this.wantedSystem.showBanner('🏀【打鐵不進！】請抓準綠色完美出手時機！', 2500);
            this.ballVelocity.x *= -0.5;
            this.ballVelocity.y = 3.5;
            this.ballVelocity.z *= -0.5;
            this.ballResetTimer = 3.5;
          }
          break;
        }
      }

      // 地面彈跳檢測
      if (this.basketballMesh.position.y <= 0.24) {
        this.basketballMesh.position.y = 0.24;
        if (Math.abs(this.ballVelocity.y) > 1.2) {
          this.ballVelocity.y = -this.ballVelocity.y * 0.55;
          this.ballVelocity.x *= 0.70;
          this.ballVelocity.z *= 0.70;
          soundManager.playDribble();
        } else {
          this.isBallInAir = false;
          this.ballResetTimer = 3.5;
        }
      }
    } else if (this.ballResetTimer > 0) {
      this.ballResetTimer -= delta;
      if (this.ballResetTimer <= 0) {
        this.basketballMesh.position.copy(this.world.basketballSpawnPos);
        this.ballVelocity.set(0, 0, 0);
      }
    }

    // 操場 200m 賽跑計時器更新
    if (this.isRacingTrack) {
      this.raceTimer += delta;
      const targetCp = this.world.trackCheckpoints[this.raceCheckpointIdx];
      this.checkpointMarker.visible = true;
      this.checkpointMarker.position.copy(targetCp);
      this.checkpointMarker.rotation.y += delta * 2.5;

      // 檢查是否通過檢查點
      if (targetPosition.distanceTo(targetCp) < 4.8) {
        soundManager.playBicycleBell();
        this.raceCheckpointIdx++;
        if (this.raceCheckpointIdx >= this.world.trackCheckpoints.length) {
          // 完賽！
          this.isRacingTrack = false;
          this.checkpointMarker.visible = false;
          soundManager.playFanfare();
          this.wantedSystem.showBanner(
            `🏆【挑戰成功！】完賽成績: ${this.raceTimer.toFixed(1)} 秒！獲得「校園飛毛腿」稱號！耐力上限提升至 130！`,
            5000
          );
          this.player.maxStamina = 130;
          this.player.stamina = 130;
        }
      }
    } else {
      this.checkpointMarker.visible = false;
    }

    // 毒素持續扣血與消散計時 (5秒後中毒效果消失)
    if (this.player.poisonTimer > 0) {
      this.player.poisonTimer -= delta;
      this.hud.setPoisonActive(true);
      this.player.poisonTickTimer += delta;
      if (this.player.poisonTickTimer >= 1.0) {
        this.player.poisonTickTimer -= 1.0;
        const died = this.player.takeDamage(3, '劇毒侵蝕');
        soundManager.playPoisonTick();
        if (died) {
          this.handlePlayerDeath('體內毒素過深昏迷！');
        }
      }
      if (this.player.poisonTimer <= 0) {
        this.player.poisonTimer = 0;
        this.hud.setPoisonActive(false);
        this.wantedSystem.showBanner('✨ 體內毒素消散，中毒狀態解除！', 3000);
      }
    } else {
      this.hud.setPoisonActive(false);
    }

    // 游泳池 50m 水上競速挑戰計時器更新
    if (this.isSwimmingRace) {
      this.swimRaceTimer += delta;
      const targetSwimCp = this.world.swimCheckpoints[this.swimCheckpointIdx];
      this.swimCheckpointMarker.visible = true;
      this.swimCheckpointMarker.position.copy(targetSwimCp);
      this.swimCheckpointMarker.rotation.y += delta * 3.0;

      if (targetPosition.distanceTo(targetSwimCp) < 3.2) {
        soundManager.playWaterSplash();
        this.swimCheckpointIdx++;
        if (this.swimCheckpointIdx >= this.world.swimCheckpoints.length) {
          this.isSwimmingRace = false;
          this.swimCheckpointMarker.visible = false;
          soundManager.playFanfare();
          this.playerCash += 150;
          this.player.maxStamina = Math.max(this.player.maxStamina, 150);
          this.player.stamina = this.player.maxStamina;
          this.wantedSystem.showBanner(
            `🏊【水上飛魚！】50m 游泳完賽！成績: ${this.swimRaceTimer.toFixed(1)} 秒！獲得獎金 +$150，精力上限躍升至 150！`,
            5000
          );
        }
      }
    } else {
      this.swimCheckpointMarker.visible = false;
    }

    // 3. 更新 NPC AI (血量、倒地、仇恨、追擊扣血)
    let isAnyChasing = false;
    let isHighDanger = false;
    const isPlayerRidingBike = this.currentRidingBike !== null;
    for (const npc of this.npcs) {
      npc.update(
        delta,
        targetPosition,
        this.wantedSystem.stars,
        this.world.colliders,
        () => {
          this.wantedSystem.markSpotted();
        },
        isPlayerRidingBike,
        this.player.isDead
      );

      if (!npc.isKnockedDown && npc.isChasing) {
        isAnyChasing = true;
        const dist = npc.position.distanceTo(targetPosition);
        if (dist < 8.0 || npc.isBurstSprinting) {
          isHighDanger = true;
        }
      }
    }

    // 檢測校犬是否因玩家進入教學大樓避難而停止追捕
    const dog = this.npcs.find(n => n.role === 'DOG');
    if (dog) {
      if (dog.isChasing) {
        this.wasDogChasing = true;
      } else if (this.wasDogChasing && NPC.isInsideTeachingBuilding(targetPosition)) {
        this.wasDogChasing = false;
        this.wantedSystem.showBanner('進入教學大樓！校犬柴柴在門外止步，成功脫逃！', 3000);
      } else if (!dog.isChasing) {
        this.wasDogChasing = false;
      }
    }

    for (const npc of this.npcs) {

      // 追及攻擊判定：擊退、擊飛與傷害效果 (玩家被 NPC 攻擊時具備真實被擊飛與擊退拋物線)
      const inAttackRange = !npc.isKnockedDown && npc.isChasing && npc.position.distanceTo(targetPosition) < npc.attackRange;
      if (inAttackRange && !this.player.isDead && npc.attackCooldown <= 0) {
        npc.attackCooldown = 0.85; // 0.85 秒攻擊間隔
        npc.triggerAttackAnimation(delta);

        // 計算受擊方向：從 NPC 指向玩家
        const impactDir = targetPosition.clone().sub(npc.position);
        impactDir.y = 0;
        if (impactDir.lengthSq() < 0.001) {
          impactDir.set(0, 0, 1);
        } else {
          impactDir.normalize();
        }

        const specs = npc.getAttackSpecs();

        // 若玩家正騎乘單車且遭到攻擊，被擊飛摔下單車
        if (this.currentRidingBike) {
          this.currentRidingBike.dismount(this.player, this.engine.scene);
          this.currentRidingBike = null;
          this.player.isRidingVehicle = false;
          this.cameraCtrl.setMode(false);
          this.wantedSystem.showBanner(`遭到${npc.getRoleTitle()}猛烈衝擊，被擊飛摔下單車！`, 2500);
        } else {
          this.wantedSystem.showBanner(`遭到${npc.getRoleTitle()}重擊擊飛！`, 1500);
        }

        this.wantedSystem.notifyAttacked();
        const justDied = this.player.launchFlying(impactDir, specs.hForce, specs.vForce, specs.damage, npc.getRoleTitle());
        if (justDied) {
          this.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
        }
      }
    }

    // 4. 角色推擠碰撞排除 (保證絕不重疊)
    this.resolveCharacterSeparation();

    // 5. 更新通緝星級系統 (傳入是否仍有任何 NPC 處於追捕狀態)
    this.wantedSystem.update(delta, isAnyChasing);

    // 6. 更新第三人稱攝影機 (傳入世界碰撞實體，啟用射線遮擋與防穿牆檢測)
    this.cameraCtrl.update(targetPosition, delta, this.world.colliders);

    // 7. 自然生態探索園區 (植物生物動畫、敵意攻擊與變異食人花 Boss 戰)
    this.ecologicalGarden.update(
      delta,
      targetPosition,
      this.player,
      (amount, reason) => {
        const died = this.player.takeDamage(amount, reason);
        this.wantedSystem.showBanner(reason, 2500);
        if (died) {
          this.handlePlayerDeath('被生態園植物生物重創倒地！');
        }
      },
      () => {
        this.wantedSystem.showBanner('👑 秘境霸主【變異食人花王】已枯萎崩解！', 6000);
      }
    );

    // 體育老師 Boss 羽球遠程飛彈射擊與更新 (4F 羽球館)
    const peBoss = this.npcs.find(n => n.role === 'PE_TEACHER_BOSS');
    if (peBoss && !peBoss.isKnockedDown && peBoss.hp > 0 && !this.player.isDead) {
      const proj = peBoss.tryShootShuttlecock(targetPosition, this.engine.scene);
      if (proj) {
        this.shuttlecocks.push(proj);
      }
    }

    // 更新飛行中的高速羽球飛彈
    for (let i = this.shuttlecocks.length - 1; i >= 0; i--) {
      const sc = this.shuttlecocks[i];
      sc.position.addScaledVector(sc.velocity, delta);
      sc.mesh.position.copy(sc.position);
      sc.life -= delta;

      // 命中玩家判定
      if (sc.position.distanceTo(targetPosition) < 1.35 && !this.player.isDead) {
        soundManager.playBadmintonHit();
        const hitDir = targetPosition.clone().sub(sc.position).normalize();
        this.player.launchFlying(hitDir, 9.0, 4.5, 18, '遭到體育組長的高速羽球扣殺！');
        this.wantedSystem.showBanner('🏸 遭到體育組長 林教頭 高速羽球殺球重扣！', 2000);
        this.engine.scene.remove(sc.mesh);
        this.shuttlecocks.splice(i, 1);
        continue;
      }

      // 著地或壽命結束消散
      if (sc.life <= 0 || sc.position.y <= 0.15) {
        this.engine.scene.remove(sc.mesh);
        this.shuttlecocks.splice(i, 1);
      }
    }

    // Boss 血條動態顯示 (支援變異食人花王與熱血體育組長林教頭)
    const distToPlantBoss = targetPosition.distanceTo(this.ecologicalGarden.boss.position);
    const distToPeBoss = peBoss ? targetPosition.distanceTo(peBoss.position) : 999;

    if (distToPlantBoss < 35.0 && !this.ecologicalGarden.boss.isDead) {
      this.hud.setBossHealth(this.ecologicalGarden.boss.hp, this.ecologicalGarden.boss.maxHp, true, '秘境霸主：變異食人花王', '🌸');
    } else if (peBoss && distToPeBoss < 28.0 && !peBoss.isKnockedDown && peBoss.hp > 0) {
      this.hud.setBossHealth(peBoss.hp, peBoss.maxHp, true, '熱血體育組長 林教頭 (4F羽球館)', '🏸');
    } else {
      this.hud.setBossHealth(0, 1000, false);
    }

    // 8. 更新 HUD 介面、小地圖、外框被追捕紅色閃爍特效 (Pursuit Alert) 與武器欄
    const isBeingChased = !this.player.isDead && (isAnyChasing || this.wantedSystem.stars > 0);
    const dangerAlert = isHighDanger || this.wantedSystem.stars >= 4;

    // 動態調節背景音樂模式 (校園漫步 vs 警報追捕)
    bgmManager.setPursuitMode(isBeingChased, dangerAlert);

    this.hud.setCash(this.playerCash);
    this.hud.updateWeaponHUD(
      this.player.currentWeapon,
      this.player.hasNormalBat,
      this.player.hasSpecialBat,
      this.studentDefeatedCount,
      this.teacherDefeatedCount,
      this.dogDefeatedCount,
      this.bikePatrolDefeatedCount
    );

    this.hud.update(
      targetPosition,
      playerRotY,
      this.player.hp,
      this.player.stamina,
      this.npcs,
      this.bicycles,
      isBeingChased,
      dangerAlert
    );

    // 9. 渲染畫面
    this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
  };
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  new SchoolGTASandbox();
});
