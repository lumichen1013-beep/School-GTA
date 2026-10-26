import * as THREE from 'three';
import { Engine } from './core/Engine';
import { InputManager } from './core/InputManager';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { CampusWorld } from './world/CampusWorld';
import { Player } from './entities/Player';
import { Bicycle } from './vehicles/Bicycle';
import { NPC } from './entities/NPC';
import { WantedSystem } from './systems/WantedSystem';
import { HUD, CommissaryItem } from './ui/HUD';
import { soundManager } from './audio/SoundEffects';
import { bgmManager } from './audio/BGMManager';
import { EcologicalGarden } from './world/EcologicalGarden';
import { WaterSplashVFX } from './effects/WaterSplashVFX';
import { BasketballGame } from './systems/BasketballGame';
import { RacingGame } from './systems/RacingGame';
import { TennisGame } from './systems/TennisGame';
import { WeatherSystem } from './systems/WeatherSystem';

// 模組頂層共用 Scratch Vectors (0-GC 避免幀迴圈記憶體堆積觸發微卡頓)
const _scratchBikeForward = new THREE.Vector3();
const _scratchBikeSideVec = new THREE.Vector3();
const _scratchBikeLaunchDir = new THREE.Vector3();
const _scratchPlayerForward = new THREE.Vector3();
const _scratchImpactDir = new THREE.Vector3();
const _scratchCamDir = new THREE.Vector3();
const _scratchCamForward = new THREE.Vector3();

class SchoolGTASandbox {
  private engine!: Engine;
  private input!: InputManager;
  private cameraCtrl!: ThirdPersonCamera;
  private world!: CampusWorld;
  private player!: Player;
  private ecologicalGarden!: EcologicalGarden;
  private waterSplashVFX!: WaterSplashVFX;
  private bicycles: Bicycle[] = [];
  private npcs: NPC[] = [];
  private wantedSystem!: WantedSystem;
  private hud!: HUD;
  private weatherSystem!: WeatherSystem;

  // 模組化小遊戲系統
  private basketballGame!: BasketballGame;
  private racingGame!: RacingGame;
  private tennisGame!: TennisGame;

  // 經濟與任務解鎖統計系統 (初始 3000 元，足以學滿「閃身步」與「狗熊哆嗦毛」)
  private playerCash: number = 3000;
  private studentDefeatedCount: number = 0;
  private teacherDefeatedCount: number = 0;
  private dogDefeatedCount: number = 0;
  private bikePatrolDefeatedCount: number = 0;
  private inspectorDefeatedCount: number = 0;
  private hasRiddenBike: boolean = false;
  private hasEscapedDog: boolean = false;
  private hasWishedPond: boolean = false;
  private hasTastedHotFood: boolean = false;
  // 身法技能系統 (閃身步 5s CD / 狗熊哆嗦毛 2s CD)
  private dodgeSkillLevel: number = 0; // 0: 未習得, 1: 閃身步, 2: 狗熊哆嗦毛
  private dodgeCooldownTimer: number = 0;

  private currentRidingBike: Bicycle | null = null;
  private isGameLoaded: boolean = false;
  private isGameRunning: boolean = false;
  private wasDogChasing: boolean = false;
  private isHandlingDeath: boolean = false;
  private swimSplashTimer: number = 0;

  // 校園惡搞廣播彩蛋狀態
  private broadcastCooldown: number = 0;
  private readonly announcements: string[] = [
    '📢【全校緊急廣播】三年二班葉大雄，你媽拿便當來校門口了，還帶了你忘記穿的衛生褲！',
    '📢【訓導處通告】報告主任教官！你的假髮被風吹掉在司令台單槓上了，請速去撿！',
    '📢【生教組廣播】請全體糾察隊立刻到福利社集合，今天大肉包買一送一，限時搶購！',
    '📢【校長室特別通知】各位同學請注意！全體立正站好發呆 4 秒鐘，不准亂動！',
    '📢【廣播台突發】恭喜三年甲班全體同學獲得「不用掃廁所一週」特權！'
  ];

  // 演藝大樓電梯平滑過場與自動走出狀態
  private elevatorTransition: {
    phase: 'CLOSING' | 'TRAVELING' | 'OPENING' | 'WALKING_OUT';
    timer: number;
    targetY: number;
    banner: string;
  } | null = null;

  constructor() {
    // 綁定開始畫面監聽
    this.setupStartScreen();
    // 異步管線初始化資源
    void this.init();
  }

  private async init() {
    this.updateProgress(0, '正在初始化遊戲核心資源...');
    await new Promise(r => requestAnimationFrame(r));

    // 階段 0 (5%)：初始化 3D 圖形與音訊引擎核心
    this.updateProgress(5, '正在啟動 3D 圖形與音訊引擎核心...');
    this.engine = new Engine();
    this.input = new InputManager(this.engine.canvas);
    this.cameraCtrl = new ThirdPersonCamera(65, window.innerWidth / window.innerHeight, 0.1, 350);
    await new Promise(r => requestAnimationFrame(r));

    // 階段 1 (25%)：建置 3D 校園地圖、教學大樓、泳池與跑道
    this.updateProgress(25, '正在建置 3D 校園地圖、教學大樓、泳池與跑道...');
    this.world = new CampusWorld(this.engine.scene);
    await new Promise(r => requestAnimationFrame(r));

    // 階段 2 (45%)：建置自然生態探索區與變異食人花 Boss
    this.updateProgress(45, '正在建置自然生態探索區與變異食人花 Boss...');
    this.ecologicalGarden = new EcologicalGarden(this.engine.scene);
    this.world.colliders.push(...this.ecologicalGarden.colliders);
    await new Promise(r => requestAnimationFrame(r));

    // 階段 3 (65%)：生成主角模型、火柴人自行車與水花特效系統
    this.updateProgress(65, '正在生成主角模型、火柴人自行車與水花特效系統...');
    this.player = new Player(this.engine.scene);
    this.waterSplashVFX = new WaterSplashVFX(this.engine.scene);

    // 墜落傷害與死亡回呼
    this.player.onTakeDamageCallback = (amount: number, reason: string) => {
      if (reason === '墜落摔傷') {
        this.wantedSystem.showBanner(`高處墜落摔傷 -${amount} HP！`, 2500);
      }
    };
    this.player.onDeathCallback = () => {
      this.handlePlayerDeath('體力耗盡重傷！');
    };

    // 載具系統：在校園多處配置單車
    const bikeSpawns = [
      { pos: new THREE.Vector3(8, 0, 15), color: 0xf39c12 },   // 中庭黃色單車
      { pos: new THREE.Vector3(14, 0, -38), color: 0xe74c3c },  // 籃球場旁紅色單車
      { pos: new THREE.Vector3(-21, 0, 30), color: 0x3498db },  // 操場旁藍色單車
      { pos: new THREE.Vector3(-58, 0, -65), color: 0x2ecc71 }, // 車棚綠色單車
      { pos: new THREE.Vector3(-50, 0, -65), color: 0x9b59b6 }  // 車棚紫色單車
    ];

    for (const b of bikeSpawns) {
      this.bicycles.push(new Bicycle(this.engine.scene, b.pos, b.color));
    }
    await new Promise(r => requestAnimationFrame(r));

    // 階段 4 (80%)：生成校園師生、主任教官、校犬柴柴與大如老師
    this.updateProgress(80, '正在生成校園師生、主任教官、校犬柴柴與大如老師...');
    this.spawnCampusNPCs();
    this.wantedSystem = new WantedSystem();
    this.wantedSystem.onWantedCleared = () => {
      for (const n of this.npcs) {
        n.resetAggro();
      }
    };
    this.hud = new HUD();
    await new Promise(r => requestAnimationFrame(r));

    // 階段 5 (92%)：初始化三分球、競速賽道、4F羽球館與電影劇院
    this.updateProgress(92, '正在初始化三分球、競速賽道、4F羽球館與電影劇院...');
    this.basketballGame = new BasketballGame(this.engine.scene, this.world.basketballSpawnPos);
    this.racingGame = new RacingGame(this.engine.scene);
    this.tennisGame = new TennisGame();

    // 初始化校園動態天氣系統 (五大天氣、平滑過渡、雨滴粒子與程序化聲光)
    this.weatherSystem = new WeatherSystem(this.engine);
    this.weatherSystem.onWeatherChange = (preset, isManual) => {
      this.hud.updateWeatherHUD(preset.badgeText);
      if (isManual) {
        this.wantedSystem.showBanner(`${preset.bannerText} (按 [P] 鍵切換)`, 2500);
      }
    };
    this.hud.onWeatherToggle = () => {
      this.weatherSystem.cycleWeather(true);
    };
    this.hud.updateWeatherHUD(this.weatherSystem.getCurrentPreset().badgeText);

    // 綁定按鍵互動與操作
    this.setupInteractions();
    this.setupMobileControls();
    this.setupScreenResize();
    this.setupFullscreen();

    // 綁定背景音樂 (BGM)
    this.hud.setupBGMClick(() => this.toggleBGM());
    this.input.onToggleBGM(() => this.toggleBGM());
    bgmManager.onModeChange = (mode, isMuted) => {
      this.hud.updateBGMStatus(mode, isMuted);
    };
    await new Promise(r => requestAnimationFrame(r));

    // 階段 6 (100%)：著色器預熱與首幀渲染準備就緒
    this.updateProgress(98, '正在預熱著色器與首幀圖形編譯...');
    this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
    await new Promise(r => requestAnimationFrame(r));

    this.onLoadingComplete();
  }

  private updateProgress(percent: number, statusText: string) {
    const barFill = document.getElementById('loading-bar-fill');
    const percentText = document.getElementById('loading-percent-text');
    const statusEl = document.getElementById('loading-status-text');
    const btnStart = document.getElementById('btn-start');

    if (barFill) barFill.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (statusEl) statusEl.textContent = statusText;
    if (btnStart && !this.isGameLoaded) {
      btnStart.textContent = `載入資源中 (${percent}%)...`;
    }
  }

  private onLoadingComplete() {
    this.isGameLoaded = true;
    this.updateProgress(100, '✅ 遊戲資源載入完成！');

    const startScreen = document.getElementById('start-screen');
    const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;
    const loadingHint = document.querySelector('.loading-hint');

    if (startScreen) {
      startScreen.classList.add('loaded');
    }

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (btnStart) {
      btnStart.removeAttribute('disabled');
      btnStart.disabled = false;
      btnStart.classList.add('is-ready');

      if (isTouch) {
        btnStart.textContent = '🎮 點擊螢幕開始遊玩';
      } else {
        btnStart.textContent = '🎮 點擊進入學校GTA (開始遊戲)';
      }
    }

    if (loadingHint) {
      loadingHint.textContent = isTouch ? '⚡ 載入完成！輕觸螢幕任何地方即可暢玩' : '⚡ 載入完成！點擊螢幕或按鈕即可進入遊戲';
    }

    // 啟動遊戲主迴圈
    this.tick();
  }

  private setupStartScreen() {
    const startScreen = document.getElementById('start-screen');
    const btnStart = document.getElementById('btn-start');
    if (!startScreen) return;

    let hasStarted = false;
    const handleStartGame = (e: Event) => {
      // 未載入完成前不可提前誤觸進入
      if (!this.isGameLoaded) return;
      if (hasStarted) return;
      hasStarted = true;

      e.preventDefault();
      e.stopPropagation();

      this.input.requestPointerLock();
      soundManager.playSchoolBell();
      bgmManager.start();
      startScreen.style.opacity = '0';
      startScreen.style.pointerEvents = 'none';
      setTimeout(() => {
        startScreen.style.display = 'none';
        this.isGameRunning = true;
      }, 500);
    };

    startScreen.addEventListener('click', handleStartGame);
    startScreen.addEventListener('touchend', handleStartGame, { passive: false });
    if (btnStart) {
      btnStart.addEventListener('click', handleStartGame);
      btnStart.addEventListener('touchend', handleStartGame, { passive: false });
    }
  }

  private spawnCampusNPCs() {
    // 1. 生教組長 (中庭綠帶與走廊威嚴步巡，巡邏路徑延伸至 95m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(15, 0, 15),
      'TEACHER',
      [
        new THREE.Vector3(15, 0, 15),
        new THREE.Vector3(15, 0, 50),
        new THREE.Vector3(2, 0, 58),
        new THREE.Vector3(-5, 0, 30),
        new THREE.Vector3(5, 0, 12)
      ],
      'OFFICER_PATROL'
    ));

    // 2. 主任教官 (校門口廣場與中央大道大型巡邏圈，巡邏路徑延伸至 85m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(0, 0, 92),
      'INSTRUCTOR',
      [
        new THREE.Vector3(0, 0, 92),
        new THREE.Vector3(-18, 0, 85),
        new THREE.Vector3(-12, 0, 58),
        new THREE.Vector3(12, 0, 58),
        new THREE.Vector3(18, 0, 85)
      ],
      'OFFICER_PATROL'
    ));

    // 3. 校犬柴柴 (遼闊草皮大範圍自由巡遊，嗅聞青草與原地端坐休養，巡查範圍 150m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-45, 0, -15),
      'DOG',
      [
        new THREE.Vector3(-45, 0, -15),
        new THREE.Vector3(-25, 0, 5),
        new THREE.Vector3(-22, 0, 42),
        new THREE.Vector3(-48, 0, 58),
        new THREE.Vector3(-72, 0, 32),
        new THREE.Vector3(-65, 0, -8)
      ]
    ));

    // 4. 單車巡邏糾察隊 (共 4 名，覆蓋全校各大主幹道與運動場外環，每圈 130m~175m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-22, 0, 55),
      'BIKE_PATROL',
      [new THREE.Vector3(-22, 0, 55), new THREE.Vector3(-22, 0, -15), new THREE.Vector3(8, 0, -35), new THREE.Vector3(8, 0, 65)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-45, 0, -55),
      'BIKE_PATROL',
      [new THREE.Vector3(-45, 0, -55), new THREE.Vector3(-12, 0, -50), new THREE.Vector3(-5, 0, -18), new THREE.Vector3(-38, 0, -22)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(12, 0, 8),
      'BIKE_PATROL',
      [new THREE.Vector3(12, 0, 8), new THREE.Vector3(12, 0, 82), new THREE.Vector3(-6, 0, 78), new THREE.Vector3(-6, 0, 12)]
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-82, 0, -6),
      'BIKE_PATROL',
      [new THREE.Vector3(-82, 0, -6), new THREE.Vector3(-82, 0, 64), new THREE.Vector3(-48, 0, 70), new THREE.Vector3(-48, 0, -12)]
    ));

    // 5. 風紀糾察隊 (步巡 2 名，雙手負後巡查，路線 80m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(15, 0, -18),
      'INSPECTOR',
      [new THREE.Vector3(15, 0, -18), new THREE.Vector3(5, 0, -42), new THREE.Vector3(-14, 0, -40), new THREE.Vector3(-8, 0, -15)],
      'OFFICER_PATROL'
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(0, 0, 92),
      'INSPECTOR',
      [new THREE.Vector3(0, 0, 92), new THREE.Vector3(-16, 0, 82), new THREE.Vector3(-10, 0, 65), new THREE.Vector3(12, 0, 65), new THREE.Vector3(16, 0, 82)],
      'OFFICER_PATROL'
    ));

    // 6. 普通學生 (12 名，各具獨特行為風格、慢跑/疾走/散步與長距離移動路線)
    // 6.1 田徑跑者 1 號 (PU 跑道標準逆時針慢跑 200m 全圈，雙臂屈肘泵動，中途拉筋伸展)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-30, 0, 14),
      'STUDENT',
      [
        new THREE.Vector3(-30, 0, 14),
        new THREE.Vector3(-55, 0, -10),
        new THREE.Vector3(-80, 0, 20),
        new THREE.Vector3(-80, 0, 45),
        new THREE.Vector3(-55, 0, 70),
        new THREE.Vector3(-30, 0, 45)
      ],
      'JOGGING'
    ));

    // 6.2 田徑跑者 2 號 (錯開半圈起跑的慢跑同學)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-80, 0, 30),
      'STUDENT',
      [
        new THREE.Vector3(-80, 0, 30),
        new THREE.Vector3(-80, 0, 50),
        new THREE.Vector3(-55, 0, 70),
        new THREE.Vector3(-30, 0, 40),
        new THREE.Vector3(-30, 0, 14),
        new THREE.Vector3(-55, 0, -10)
      ],
      'JOGGING'
    ));

    // 6.3 趕課疾走同學 (從林蔭大道大步快走奔向教學樓 A 棟，75m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(0, 0, 72),
      'STUDENT',
      [
        new THREE.Vector3(0, 0, 72),
        new THREE.Vector3(12, 0, 52),
        new THREE.Vector3(18, 0, 22),
        new THREE.Vector3(22, 0, 8),
        new THREE.Vector3(16, 0, 32)
      ],
      'HURRIED_WALK'
    ));

    // 6.4 趕買早餐同學 (大步快走前往合作社，70m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(12, 0, 12),
      'STUDENT',
      [
        new THREE.Vector3(12, 0, 12),
        new THREE.Vector3(2, 0, -12),
        new THREE.Vector3(-10, 0, -32),
        new THREE.Vector3(-15, 0, -46),
        new THREE.Vector3(-4, 0, -28)
      ],
      'HURRIED_WALK'
    ));

    // 6.5 & 6.6 合作社戶外桌交談結伴同學 (CASUAL_WALK 結伴散步與原地熱烈手勢交談)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-14, 0, -42),
      'STUDENT',
      [new THREE.Vector3(-14, 0, -42), new THREE.Vector3(-24, 0, -46), new THREE.Vector3(-32, 0, -52), new THREE.Vector3(-22, 0, -38)],
      'CASUAL_WALK'
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-12, 0, -40),
      'STUDENT',
      [new THREE.Vector3(-12, 0, -40), new THREE.Vector3(-22, 0, -44), new THREE.Vector3(-30, 0, -50), new THREE.Vector3(-20, 0, -36)],
      'CASUAL_WALK'
    ));

    // 6.7 低頭滑手機同學 (沿中央林蔭大道散步，高頻率停步低頭看手機 55m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(2, 0, 18),
      'STUDENT',
      [new THREE.Vector3(2, 0, 18), new THREE.Vector3(2, 0, 42), new THREE.Vector3(2, 0, 70), new THREE.Vector3(2, 0, 36)],
      'CASUAL_WALK'
    ));

    // 6.8 中庭花園漫步同學 (環形巡遊噴泉綠樹廣場 55m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(8, 0, 22),
      'STUDENT',
      [new THREE.Vector3(8, 0, 22), new THREE.Vector3(14, 0, 42), new THREE.Vector3(6, 0, 56), new THREE.Vector3(-2, 0, 38)],
      'CASUAL_WALK'
    ));

    // 6.9 & 6.10 樹下聊天雙人組 (結伴在中庭林蔭大道旁談笑 50m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-8, 0, 16),
      'STUDENT',
      [new THREE.Vector3(-8, 0, 16), new THREE.Vector3(-14, 0, 32), new THREE.Vector3(-8, 0, 44), new THREE.Vector3(-2, 0, 28)],
      'CASUAL_WALK'
    ));
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-6, 0, 18),
      'STUDENT',
      [new THREE.Vector3(-6, 0, 18), new THREE.Vector3(-12, 0, 34), new THREE.Vector3(-6, 0, 46), new THREE.Vector3(0, 0, 30)],
      'CASUAL_WALK'
    ));

    // 6.11 生態池許願小憩同學 (漫步生態園水池與石橋 40m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-46, 0, -74),
      'STUDENT',
      [new THREE.Vector3(-46, 0, -74), new THREE.Vector3(-55, 0, -80), new THREE.Vector3(-64, 0, -78), new THREE.Vector3(-52, 0, -70)],
      'CASUAL_WALK'
    ));

    // 6.12 校門口迎賓大道散步同學 (45m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(-16, 0, 84),
      'STUDENT',
      [new THREE.Vector3(-16, 0, 84), new THREE.Vector3(0, 0, 88), new THREE.Vector3(16, 0, 84), new THREE.Vector3(0, 0, 80)],
      'CASUAL_WALK'
    ));

    // 7. 高樓層師生 (敬業樓 A 棟 & 樂群樓 B 棟 2F/3F，含貫穿兩棟建築物 70m+ 的空中走廊天橋長程巡邏路線)
    // 2F 巡堂老師：橫跨 A 棟走廊、空中走廊天橋至 B 棟走廊 (全長 70m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 6.0, 10),
      'TEACHER',
      [new THREE.Vector3(31, 6.0, 10), new THREE.Vector3(31, 6.0, 32), new THREE.Vector3(31, 6.0, 52), new THREE.Vector3(31, 6.0, 78)],
      'OFFICER_PATROL'
    ));
    // 2F 跨棟散步學生：從 B 棟經天橋走往 A 棟 (全長 65m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 6.0, 76),
      'STUDENT',
      [new THREE.Vector3(31, 6.0, 76), new THREE.Vector3(31, 6.0, 50), new THREE.Vector3(31, 6.0, 30), new THREE.Vector3(31, 6.0, 14)],
      'CASUAL_WALK'
    ));
    // 2F 教室內學生 (完整巡遊教室空間，24m~26m)
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 6.0, 8), 'STUDENT', [new THREE.Vector3(36, 6.0, 8), new THREE.Vector3(44, 6.0, 8), new THREE.Vector3(44, 6.0, 16), new THREE.Vector3(36, 6.0, 16)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 6.0, 22), 'STUDENT', [new THREE.Vector3(36, 6.0, 22), new THREE.Vector3(44, 6.0, 22), new THREE.Vector3(44, 6.0, 30), new THREE.Vector3(36, 6.0, 30)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 6.0, 60), 'STUDENT', [new THREE.Vector3(36, 6.0, 60), new THREE.Vector3(44, 6.0, 60), new THREE.Vector3(44, 6.0, 68), new THREE.Vector3(36, 6.0, 68)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 6.0, 74), 'STUDENT', [new THREE.Vector3(36, 6.0, 74), new THREE.Vector3(44, 6.0, 74), new THREE.Vector3(44, 6.0, 84), new THREE.Vector3(36, 6.0, 84)]));

    // 3F 巡堂老師：橫跨 A 棟走廊、空中走廊天橋至 B 棟走廊 (全長 70m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 12.0, 12),
      'TEACHER',
      [new THREE.Vector3(31, 12.0, 12), new THREE.Vector3(31, 12.0, 32), new THREE.Vector3(31, 12.0, 52), new THREE.Vector3(31, 12.0, 78)],
      'OFFICER_PATROL'
    ));
    // 3F 跨棟散步學生：從 B 棟經天橋走往 A 棟 (全長 65m+)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(31, 12.0, 76),
      'STUDENT',
      [new THREE.Vector3(31, 12.0, 76), new THREE.Vector3(31, 12.0, 50), new THREE.Vector3(31, 12.0, 30), new THREE.Vector3(31, 12.0, 14)],
      'CASUAL_WALK'
    ));
    // 3F 教室內學生 (完整巡遊教室空間，24m~26m)
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 12.0, 8), 'STUDENT', [new THREE.Vector3(36, 12.0, 8), new THREE.Vector3(44, 12.0, 8), new THREE.Vector3(44, 12.0, 16), new THREE.Vector3(36, 12.0, 16)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 12.0, 22), 'STUDENT', [new THREE.Vector3(36, 12.0, 22), new THREE.Vector3(44, 12.0, 22), new THREE.Vector3(44, 12.0, 30), new THREE.Vector3(36, 12.0, 30)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 12.0, 60), 'STUDENT', [new THREE.Vector3(36, 12.0, 60), new THREE.Vector3(44, 12.0, 60), new THREE.Vector3(44, 12.0, 68), new THREE.Vector3(36, 12.0, 68)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(36, 12.0, 74), 'STUDENT', [new THREE.Vector3(36, 12.0, 74), new THREE.Vector3(44, 12.0, 74), new THREE.Vector3(44, 12.0, 84), new THREE.Vector3(36, 12.0, 84)]));

    // 8. 校外強盜 (圍牆外長程巡邏，65m~110m)
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(-35, 0, 118), 'BANDIT', [new THREE.Vector3(-35, 0, 118), new THREE.Vector3(0, 0, 118), new THREE.Vector3(35, 0, 118), new THREE.Vector3(0, 0, 122)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(15, 0, 124), 'BANDIT', [new THREE.Vector3(15, 0, 124), new THREE.Vector3(48, 0, 124), new THREE.Vector3(32, 0, 128), new THREE.Vector3(15, 0, 128)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(-15, 0, 126), 'BANDIT', [new THREE.Vector3(-15, 0, 126), new THREE.Vector3(-48, 0, 126), new THREE.Vector3(-32, 0, 130), new THREE.Vector3(-15, 0, 130)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(-118, 0, -45), 'BANDIT', [new THREE.Vector3(-118, 0, -45), new THREE.Vector3(-118, 0, 10), new THREE.Vector3(-118, 0, 65), new THREE.Vector3(-118, 0, 15)]));
    this.npcs.push(new NPC(this.engine.scene, new THREE.Vector3(118, 0, -45), 'BANDIT', [new THREE.Vector3(118, 0, -45), new THREE.Vector3(118, 0, 10), new THREE.Vector3(118, 0, 65), new THREE.Vector3(118, 0, 15)]));

    // 9. 演藝大樓 4F 羽球場：大如老師 (北半場步法跑動 drill)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(76, 12.0, 31),
      'PE_TEACHER_BOSS',
      [new THREE.Vector3(72, 12.0, 31), new THREE.Vector3(80, 12.0, 31), new THREE.Vector3(76, 12.0, 27), new THREE.Vector3(76, 12.0, 34)],
      'OFFICER_PATROL'
    ));

    // 10. 教學大樓 1F 走廊：閃身步老師 (身法宗師，傳授閃身步與狗熊哆嗦毛，長廊身法巡走 20m)
    this.npcs.push(new NPC(
      this.engine.scene,
      new THREE.Vector3(32, 0.0, 18),
      'DODGE_TEACHER',
      [new THREE.Vector3(32, 0.0, 8), new THREE.Vector3(32, 0.0, 18), new THREE.Vector3(32, 0.0, 28), new THREE.Vector3(32, 0.0, 18)],
      'OFFICER_PATROL'
    ));
  }

  private setupInteractions() {
    // E 鍵互動：合作社 / 採菇 / 許願 / 電梯 / 羽球對話 / 放籃球 / 賽跑 / 拿籃球 / 上下單車
    this.input.onInteract(() => {
      if (this.player.isDead || this.player.hp <= 0) return;

      // 1. 天天合作社
      if (this.player.position.distanceTo(this.world.commissaryPos) < 3.8) {
        this.hud.openCommissary(this.playerCash, (item) => this.buyCommissaryItem(item));
        return;
      }

      // 2. 野生奇異菇採摘
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

      // 3. 自然生態池許願投幣
      if (this.ecologicalGarden.isNearWishingPond(this.player.position)) {
        const pondResult = this.ecologicalGarden.tossCoinToPond(this.playerCash);
        if (pondResult.success) {
          this.hasWishedPond = true;
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

      // 4. 演藝大樓 1F/4F 直達光能電梯搭乘
      if (this.world.isNear1FElevator(this.player.position) && !this.elevatorTransition) {
        soundManager.playElevatorDing();
        this.elevatorTransition = {
          phase: 'CLOSING',
          timer: 0.5,
          targetY: 12.0,
          banner: '🛗 電梯抵達【4F 演藝廳羽球場】，電梯門開啟！'
        };
        this.player.position.set(65.5, 0.0, 43.5);
        this.player.mesh.position.set(65.5, 0.0, 43.5);
        this.wantedSystem.showBanner('🛗 電梯門關閉中，直達 4F...', 1500);
        return;
      }
      if (this.world.isNear4FElevator(this.player.position) && !this.elevatorTransition) {
        soundManager.playElevatorDing();
        this.elevatorTransition = {
          phase: 'CLOSING',
          timer: 0.5,
          targetY: 0.0,
          banner: '🛗 電梯抵達【1F 演藝廳門廳】，電梯門開啟！'
        };
        this.player.position.set(65.5, 12.0, 43.5);
        this.player.mesh.position.set(65.5, 12.0, 43.5);
        this.wantedSystem.showBanner('🛗 電梯門關閉中，直達 1F...', 1500);
        return;
      }

      // 5. 羽球對話 / 挑戰比賽
      if (this.hud.isTennisDialogOpen) {
        this.startTennisMatch();
        return;
      }
      if (this.hud.isDodgeDialogOpen) {
        this.hud.confirmDodgeLearn();
        return;
      }
      const peCoach = this.npcs.find(n => n.role === 'PE_TEACHER_BOSS');
      if (peCoach && this.player.position.distanceTo(peCoach.position) < 3.2 && !peCoach.isKnockedDown && this.tennisGame.tennisState === 'IDLE') {
        this.tennisGame.openDialog(this.hud, () => this.startTennisMatch());
        return;
      }

      // 5.5 教學大樓 閃身步老師對話 / 身法傳授
      const dodgeTeacher = this.npcs.find(n => n.role === 'DODGE_TEACHER');
      if (dodgeTeacher && this.player.position.distanceTo(dodgeTeacher.position) < 3.2) {
        this.hud.openDodgeDialog(this.playerCash, this.dodgeSkillLevel, (targetLvl) => {
          this.learnDodgeSkill(targetLvl);
        });
        return;
      }

      // 6. 放下籃球
      if (this.basketballGame.isHolding) {
        this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
        return;
      }

      // 7. 廣播台惡搞
      if (this.player.position.distanceTo(this.world.broadcastStationPos) < 2.5) {
        if (this.broadcastCooldown <= 0) {
          this.broadcastCooldown = 20.0;
          soundManager.playBroadcastChime();
          const announcement = this.announcements[Math.floor(Math.random() * this.announcements.length)];
          this.wantedSystem.showBanner(announcement, 5500);
          for (const npc of this.npcs) {
            npc.freeze(4.0);
          }
        } else {
          this.wantedSystem.showBanner(`學務處廣播系統冷卻中，請等待 ${Math.ceil(this.broadcastCooldown)} 秒`, 2000);
        }
        return;
      }

      // 8. 操場 200m 賽跑計時挑戰
      if (this.player.position.distanceTo(this.world.trackStartPos) < 4.5 && !this.currentRidingBike) {
        this.racingGame.startTrackRace(this.wantedSystem);
        return;
      }

      // 9. 泳池 50m 水上競速挑戰
      if (this.player.position.distanceTo(this.world.swimmingPoolPos) < 4.5 && !this.currentRidingBike && !this.racingGame.isSwimmingRace) {
        this.racingGame.startSwimRace(this.wantedSystem);
        return;
      }

      // 10. 拿起籃球
      if (!this.currentRidingBike && this.basketballGame.basketballMesh.position.distanceTo(this.player.position) < 2.5 && !this.basketballGame.isBallInAir) {
        this.basketballGame.pickup(this.player, this.hud, this.wantedSystem);
        return;
      }

      // 11. 火柴人自行車上下車互動 (支援強行搶奪火柴人自行車騎士之自行車)
      if (this.currentRidingBike) {
        this.currentRidingBike.dismount(this.player, this.engine.scene);
        this.player.isRidingVehicle = false;
        this.currentRidingBike = null;
        this.cameraCtrl.setMode(false);
      } else {
        let hijackedBike = false;
        for (const npc of this.npcs) {
          // 支援常態騎乘中、被擊飛中 (isKnockedFlying)、或被擊倒在地 (isKnockedDown) 時搶奪其自行車
          if (npc.role === 'BIKE_PATROL' && npc.position.distanceTo(this.player.position) < 3.5) {
            hijackedBike = true;
            soundManager.playBikeHijack();
            npc.loseBike();

            // 獲取地面真實支撐高度，杜絕浮空
            const groundY = Bicycle.getFloorHeightAt(npc.position.x, npc.position.y, npc.position.z, this.world.colliders);
            const spawnPos = new THREE.Vector3(npc.position.x, groundY, npc.position.z);

            const stolenBike = new Bicycle(this.engine.scene, spawnPos, 0x3498db);
            this.bicycles.push(stolenBike);
            stolenBike.mount(this.player, groundY);
            this.currentRidingBike = stolenBike;
            this.player.isRidingVehicle = true;
            this.cameraCtrl.setMode(true);
            this.wantedSystem.reportCrime(2, '強行搶奪火柴人自行車');
            this.wantedSystem.showBanner('🚲 成功搶奪火柴人自行車！風馳電掣！按 [E] 可下車', 3000);
            break;
          }
        }

        if (!hijackedBike) {
          for (const bike of this.bicycles) {
            if (bike.position.distanceTo(this.player.position) < 3.0) {
              const groundY = Bicycle.getFloorHeightAt(bike.position.x, bike.position.y, bike.position.z, this.world.colliders);
              bike.mount(this.player, groundY);
              this.currentRidingBike = bike;
              this.player.isRidingVehicle = true;
              this.cameraCtrl.setMode(true);
              break;
            }
          }
        }
      }
    });

    // 滑鼠左鍵：投籃蓄力 / 單車鳴鈴 / 揮動武器攻擊
    this.input.onAttack(() => {
      if (this.player.isDead || this.player.hp <= 0) return;

      if (this.basketballGame.isHolding) {
        this.basketballGame.startCharging(this.hud);
        return;
      }

      if (this.currentRidingBike) {
        this.currentRidingBike.ringBell();
      } else {
        this.player.attack();

        const reach = this.player.getWeaponReach();
        const damage = this.player.getWeaponDamage();
        const knockback = this.player.getWeaponKnockback();

        _scratchPlayerForward.set(
          Math.sin(this.player.rotationY),
          0,
          Math.cos(this.player.rotationY)
        ).normalize();

        // 1. 檢測是否命中生態園植物生物
        const plantHit = this.ecologicalGarden.tryHitByPlayer(
          this.player.position,
          reach,
          damage,
          _scratchPlayerForward
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

        // 2. 檢測是否命中附近的 NPC
        for (const npc of this.npcs) {
          if (npc.position.distanceTo(this.player.position) < reach + 0.3 && !npc.isKnockedDown) {
            const wasKnocked = npc.launchFlying(_scratchPlayerForward, knockback, damage);
            if (wasKnocked) {
              this.handleNpcDefeated(npc, 'ATTACK');
            } else {
              this.wantedSystem.reportCrime(1, '校園打架鬥毆');
              npc.isChasing = true;
            }
            break;
          }
        }
      }
    });

    // 滑鼠左鍵鬆開：投籃出手 (電腦版)
    this.input.onAttackRelease(() => {
      if (this.basketballGame.isHolding && this.basketballGame.isChargingShot) {
        this.basketballGame.releaseShot(
          this.player,
          this.cameraCtrl.camera,
          this.hud,
          this.world.hoopTargets
        );
      }
    });

    // 鍵盤按鍵監聽：數字鍵 1/2/3 武器切換、R 鍵重置發球、J 鍵任務、ESC 關閉彈窗
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Digit1') {
        this.player.setWeapon('FIST');
        this.wantedSystem.showBanner('🥊 切換武器：徒手拳擊 (ATK 25)', 1500);
      } else if (e.code === 'Digit2') {
        if (this.player.hasNormalBat) {
          this.player.setWeapon('NORMAL_BAT');
          this.wantedSystem.showBanner('🏏 切換武器：普通木質棒球棍 (ATK 55)', 1500);
        } else {
          this.wantedSystem.showBanner(`🔒 普通球棒未解鎖！需擊敗 5 位普通同學 (目前進度: ${this.studentDefeatedCount}/5)`, 2500);
        }
      } else if (e.code === 'Digit3') {
        if (this.player.hasSpecialBat) {
          this.player.setWeapon('SPECIAL_BAT');
          this.wantedSystem.showBanner('⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)', 1500);
        } else {
          this.wantedSystem.showBanner(`🔒 特殊棒球棍未解鎖！需擊敗生教(1)、校犬(1)、火柴人自行車騎士(5) (目前: 教${this.teacherDefeatedCount}/1 犬${this.dogDefeatedCount}/1 車${this.bikePatrolDefeatedCount}/5)`, 2500);
        }
      } else if (e.code === 'KeyJ') {
        this.hud.toggleQuestTracker();
      } else if (e.code === 'KeyP') {
        this.weatherSystem.cycleWeather(true);
      } else if (e.code === 'Escape') {
        if (this.hud.isCommissaryOpen) {
          this.hud.closeCommissary();
        }
        if (this.hud.isTennisDialogOpen) {
          this.hud.closeTennisDialog();
        }
        if (this.hud.isDodgeDialogOpen) {
          this.hud.closeDodgeDialog();
        }
      } else if (e.code === 'Enter') {
        if (this.hud.isTennisDialogOpen) {
          this.startTennisMatch();
        }
        if (this.hud.isDodgeDialogOpen) {
          this.hud.confirmDodgeLearn();
        }
      } else if (e.code === 'KeyR') {
        if (!this.basketballGame.isHolding && !this.basketballGame.isBallInAir) {
          if (this.player.position.distanceTo(this.world.basketballSpawnPos) < 40) {
            this.basketballGame.resetBall(this.wantedSystem);
          }
        }
      }
    });

    // Q 鍵身法技能監聽
    this.input.onSkill(() => {
      this.triggerDodgeSkill();
    });
  }

  // 學習身法絕學 (閃身步 / 狗熊哆嗦毛)
  private learnDodgeSkill(targetLevel: number) {
    if (targetLevel === 1) {
      if (this.playerCash < 1000) {
        this.wantedSystem.showBanner('❌ 錢包餘額不足！學習【閃身步】需要 NT$ 1000！', 2500);
        return;
      }
      this.playerCash -= 1000;
      this.dodgeSkillLevel = 1;
      this.hud.setCash(this.playerCash);
      soundManager.playCashRegister();
      this.wantedSystem.showBanner('🥋 成功習得技能【閃身步】！冷卻時間 5 秒，按 [Q] 鍵或點擊 [閃] 按鈕即可規避敵人攻擊！', 5000);
    } else if (targetLevel === 2) {
      if (this.dodgeSkillLevel < 1) {
        this.wantedSystem.showBanner('❌ 前置條件未達成！必須先學會基礎【閃身步】！', 2500);
        return;
      }
      if (this.playerCash < 2000) {
        this.wantedSystem.showBanner('❌ 錢包餘額不足！領悟【狗熊哆嗦毛】需要 NT$ 2000！', 2500);
        return;
      }
      this.playerCash -= 2000;
      this.dodgeSkillLevel = 2;
      this.hud.setCash(this.playerCash);
      soundManager.playCashRegister();
      this.wantedSystem.showBanner('🐻 恭喜融會貫通進階【狗熊哆嗦毛】！技能如神，冷卻縮短至 2 秒！按 [Q] 鍵神速規避！', 5000);
    }
  }

  // 施展技能 (閃身步 / 狗熊哆嗦毛)
  private triggerDodgeSkill() {
    if (this.player.isDead || this.player.hp <= 0) return;
    if (this.currentRidingBike) {
      this.wantedSystem.showBanner('🚲 騎乘自行車時無法施展技能！請先按 [E] 下車', 2000);
      return;
    }
    if (this.dodgeSkillLevel === 0) {
      this.wantedSystem.showBanner('🥋 尚未習得技能！請至教學大樓尋訪「閃身步老師」學習【閃身步】！', 2500);
      return;
    }
    if (this.dodgeCooldownTimer > 0) {
      this.wantedSystem.showBanner(`⌛ 技能冷卻中 (${this.dodgeCooldownTimer.toFixed(1)}s)`, 1000);
      return;
    }

    const isAdvanced = this.dodgeSkillLevel === 2;
    const maxCd = isAdvanced ? 2.0 : 5.0;
    this.dodgeCooldownTimer = maxCd;

    if (isAdvanced) {
      this.player.performBearShake(this.world.colliders);
    } else {
      this.player.performFlashStep(this.world.colliders);
    }

    this.wantedSystem.showBanner(
      isAdvanced ? '🐻 施展【狗熊哆嗦毛】！連續瞬移神速規避攻擊！(CD 2s)' : '💨 施展【閃身步】！左右破空閃身規避！(CD 5s)',
      1600
    );
  }

  private startTennisMatch() {
    const peCoach = this.npcs.find(n => n.role === 'PE_TEACHER_BOSS');
    if (this.basketballGame.isHolding) {
      this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
    }
    this.tennisGame.startMatch(this.hud, peCoach, this.engine.scene);
  }

  // 統一 NPC 擊倒/擊敗結算
  private handleNpcDefeated(npc: NPC, source: 'ATTACK' | 'BIKE' | 'FALL' = 'ATTACK') {
    let reward = 20;
    if (npc.role === 'STUDENT') {
      this.studentDefeatedCount++;
      reward = 20;
      if (this.studentDefeatedCount >= 5 && !this.player.hasNormalBat) {
        this.player.hasNormalBat = true;
        this.player.setWeapon('NORMAL_BAT');
        this.wantedSystem.showBanner('🎉 達成【名揚校園】！擊敗5位普通同學，解鎖【普通球棒】！(按 2 裝備，ATK 55)', 6000);
        soundManager.playBatHit();
      }
    } else if (npc.role === 'INSPECTOR') {
      this.inspectorDefeatedCount++;
      reward = 40;
    } else if (npc.role === 'BIKE_PATROL') {
      this.bikePatrolDefeatedCount++;
      this.inspectorDefeatedCount++;
      reward = 60;
    } else if (npc.role === 'TEACHER') {
      this.teacherDefeatedCount++;
      reward = 80;
    } else if (npc.role === 'BANDIT') {
      reward = 100;
    } else if (npc.role === 'DOG') {
      this.dogDefeatedCount++;
      this.hasEscapedDog = true;
      reward = 120;
    } else if (npc.role === 'INSTRUCTOR') {
      this.inspectorDefeatedCount++;
      this.teacherDefeatedCount++;
      reward = 150;
    } else if (npc.role === 'PE_TEACHER_BOSS') {
      reward = 180;
      this.wantedSystem.showBanner('🏸 震撼勝利！擊倒【大如老師】！獲得獎金 +$180！', 5000);
      if (this.tennisGame.tennisState !== 'IDLE') {
        this.tennisGame.endMatch(true, this.wantedSystem, this.hud, this.engine.scene, (amt) => {
          this.playerCash += amt;
          this.hud.setCash(this.playerCash);
        });
      }
    }

    this.playerCash += reward;
    this.hud.setCash(this.playerCash);

    if (this.teacherDefeatedCount >= 1 && this.dogDefeatedCount >= 1 && this.bikePatrolDefeatedCount >= 5 && !this.player.hasSpecialBat) {
      this.player.hasSpecialBat = true;
      this.player.setWeapon('SPECIAL_BAT');
      this.wantedSystem.showBanner('⚡ 達成傳奇成就【校園霸王】！擊倒生教組長、校犬與5名火柴人自行車騎士，解鎖神兵【黃金雷霆棒球棍】！(按 3 裝備，ATK 120)', 7000);
      soundManager.playSpecialBatHit();
    }

    const sourceDesc = source === 'BIKE' ? '遭火柴人自行車強力撞飛' : source === 'FALL' ? '高處摔落' : '倒地';
    this.wantedSystem.reportCrime(1, `${npc.getRoleTitle()}${sourceDesc}`);
    this.wantedSystem.showBanner(`${npc.getRoleTitle()} ${sourceDesc}！獲得獎金 +$${reward}！(10秒後復活)`, 3500);
  }

  private buyCommissaryItem(item: CommissaryItem) {
    if (this.playerCash < item.price) {
      this.wantedSystem.showBanner('零用錢不足！快去探索校園賺錢吧！', 2000);
      return;
    }

    this.hasTastedHotFood = true;
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

  private toggleBGM() {
    const isMuted = bgmManager.toggleMute();
    if (isMuted) {
      this.wantedSystem.showBanner('🔇 背景音樂 (BGM) 已靜音', 2000);
    } else {
      const modeText = bgmManager.getMode() === 'PURSUIT' ? '通緝逃亡熱血節奏' : '校園漫步放鬆旋律';
      this.wantedSystem.showBanner(`🎵 背景音樂 (BGM) 已開啟【${modeText}】`, 2500);
    }
  }

  private handlePlayerDeath(reason: string) {
    if (this.isHandlingDeath) return;
    this.isHandlingDeath = true;

    if (this.currentRidingBike) {
      this.currentRidingBike.dismount(this.player, this.engine.scene);
      this.currentRidingBike = null;
      this.player.isRidingVehicle = false;
      this.cameraCtrl.setMode(false);
    }

    if (this.basketballGame.isHolding) {
      this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
    }

    this.hud.hidePrompt();
    this.waterSplashVFX.reset();
    this.wantedSystem.showBanner(`${reason} 已失去意識送往保健室 (3秒後重返校園)...`, 4000);
    bgmManager.duckVolume(3.2);

    this.wantedSystem.clearWanted();
    for (const n of this.npcs) {
      n.resetAggro();
    }

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

  private setupScreenResize() {
    const applyResize = () => {
      const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const aspect = width / height;

      this.engine.resize(width, height);
      this.cameraCtrl.camera.aspect = aspect;
      this.cameraCtrl.camera.updateProjectionMatrix();
      this.cameraCtrl.updateAspect(aspect);
    };

    this.engine.onResizeCallback = (_w, _h, aspect) => {
      this.cameraCtrl.camera.aspect = aspect;
      this.cameraCtrl.camera.updateProjectionMatrix();
      this.cameraCtrl.updateAspect(aspect);
    };

    window.addEventListener('resize', applyResize);
    window.addEventListener('orientationchange', () => {
      applyResize();
      setTimeout(applyResize, 80);
      setTimeout(applyResize, 200);
      setTimeout(applyResize, 500);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', applyResize);
    }

    if (window.innerWidth <= 900 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
      this.hud.toggleQuestTracker(false);
    }

    applyResize();
  }

  private setupFullscreen() {
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (!btnFullscreen) return;

    const updateFullscreenState = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      btnFullscreen.innerHTML = isFs ? '🗗 視窗' : '⛶ 全螢幕';
      btnFullscreen.setAttribute('title', isFs ? '切換視窗模式' : '切換全螢幕');
    };

    btnFullscreen.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const isFs = !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );

        if (!isFs) {
          const docEl = document.documentElement as any;
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen();
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen();
          } else if (docEl.mozRequestFullScreen) {
            await docEl.mozRequestFullScreen();
          } else if (docEl.msRequestFullscreen) {
            await docEl.msRequestFullscreen();
          }

          try {
            const orientation = screen.orientation as any;
            if (orientation && orientation.lock) {
              await orientation.lock('landscape').catch(() => { });
            }
          } catch (_) { }
        } else {
          const doc = document as any;
          if (doc.exitFullscreen) {
            await doc.exitFullscreen();
          } else if (doc.webkitExitFullscreen) {
            await doc.webkitExitFullscreen();
          } else if (doc.mozCancelFullScreen) {
            await doc.mozCancelFullScreen();
          } else if (doc.msExitFullscreen) {
            await doc.msExitFullscreen();
          }
        }
      } catch (err) {
        console.warn('全螢幕切換被拒絕或發生錯誤:', err);
      }
      updateFullscreenState();
    });

    document.addEventListener('fullscreenchange', updateFullscreenState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenState);
    document.addEventListener('mozfullscreenchange', updateFullscreenState);
    document.addEventListener('MSFullscreenChange', updateFullscreenState);
  }

  private setupMobileControls() {
    const container = document.getElementById('mobile-controls-container');
    const toggleBtn = document.getElementById('toggle-mobile-mode-btn');
    const joystickZone = document.getElementById('touch-joystick-zone');
    const joystickThumb = document.getElementById('touch-joystick-thumb');

    const btnAttack = document.getElementById('m-btn-attack');
    const btnJump = document.getElementById('m-btn-jump');
    const btnSprint = document.getElementById('m-btn-sprint');
    const btnInteract = document.getElementById('m-btn-interact');
    const btnWeapon = document.getElementById('m-btn-weapon');
    const btnDodge = document.getElementById('m-btn-dodge');

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice && container) {
      container.style.display = 'block';
      document.body.classList.add('touch-mode-active');
      if (toggleBtn) toggleBtn.textContent = '📱 隱藏手機鍵盤';
    }

    if (toggleBtn && container) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCurrentlyOpen = container.style.display === 'block';
        container.style.display = isCurrentlyOpen ? 'none' : 'block';
        document.body.classList.toggle('touch-mode-active', !isCurrentlyOpen);
        toggleBtn.textContent = isCurrentlyOpen ? '📱 手機虛擬按鍵' : '📱 隱藏手機鍵盤';
      });
    }

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

      window.addEventListener('touchmove', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            e.preventDefault();
            handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
          }
        }
      }, { passive: false });

      const handleTouchEnd = (e: TouchEvent) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            handleEnd();
            break;
          }
        }
      };

      window.addEventListener('touchend', handleTouchEnd, { passive: false });
      window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

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

        if (onRelease) {
          const handleMouseUp = () => {
            window.removeEventListener('mouseup', handleMouseUp);
            onRelease();
          };
          window.addEventListener('mouseup', handleMouseUp);
        }
      });
    };

    bindButton(btnAttack, () => {
      this.input.setVirtualAttack(true);
    }, () => {
      this.input.setVirtualAttack(false);
      if (this.basketballGame.isHolding && this.basketballGame.isChargingShot) {
        this.basketballGame.releaseShot(
          this.player,
          this.cameraCtrl.camera,
          this.hud,
          this.world.hoopTargets
        );
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

    bindButton(btnWeapon, () => {
      this.cycleWeapon();
    });

    bindButton(btnDodge, () => {
      this.triggerDodgeSkill();
    });
  }

  public cycleWeapon() {
    const current = this.player.currentWeapon;
    if (current === 'FIST') {
      if (this.player.hasNormalBat) {
        this.player.setWeapon('NORMAL_BAT');
        this.wantedSystem.showBanner('🏏 切換武器：普通木質棒球棍 (ATK 55)', 1500);
      } else if (this.player.hasSpecialBat) {
        this.player.setWeapon('SPECIAL_BAT');
        this.wantedSystem.showBanner('⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)', 1500);
      } else {
        this.wantedSystem.showBanner(`🥊 目前僅有徒手！擊敗同學解鎖球棒 (${this.studentDefeatedCount}/5)`, 1500);
      }
    } else if (current === 'NORMAL_BAT') {
      if (this.player.hasSpecialBat) {
        this.player.setWeapon('SPECIAL_BAT');
        this.wantedSystem.showBanner('⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)', 1500);
      } else {
        this.player.setWeapon('FIST');
        this.wantedSystem.showBanner('🥊 切換武器：徒手拳擊 (ATK 25)', 1500);
      }
    } else {
      this.player.setWeapon('FIST');
      this.wantedSystem.showBanner('🥊 切換武器：徒手拳擊 (ATK 25)', 1500);
    }
  }

  private resolveCharacterSeparation() {
    const minDistance = 0.85;
    const minDistanceSq = minDistance * minDistance;

    if (!this.player.isRidingVehicle && !this.player.isDead) {
      for (const npc of this.npcs) {
        if (npc.isKnockedDown || npc.isKnockedFlying) continue;

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

    // 0. 電梯過場動畫與自動走出
    if (this.elevatorTransition) {
      const et = this.elevatorTransition;
      et.timer -= delta;

      if (et.phase === 'CLOSING') {
        const ratio = Math.max(0, et.timer / 0.5);
        this.world.setElevatorDoorsOpen(ratio);
        if (et.timer <= 0) {
          et.phase = 'TRAVELING';
          et.timer = 0.4;
        }
      } else if (et.phase === 'TRAVELING') {
        if (et.timer <= 0) {
          this.player.position.set(65.5, et.targetY, 43.5);
          this.player.mesh.position.set(65.5, et.targetY, 43.5);
          soundManager.playElevatorDing();
          et.phase = 'OPENING';
          et.timer = 0.5;
        }
      } else if (et.phase === 'OPENING') {
        const ratio = Math.min(1.0, 1.0 - et.timer / 0.5);
        this.world.setElevatorDoorsOpen(ratio);
        if (et.timer <= 0) {
          this.world.setElevatorDoorsOpen(1.0);
          et.phase = 'WALKING_OUT';
          et.timer = 0.8;
          this.wantedSystem.showBanner(et.banner, 3000);
        }
      } else if (et.phase === 'WALKING_OUT') {
        const progress = Math.min(1.0, 1.0 - (et.timer / 0.8));
        const curZ = THREE.MathUtils.lerp(43.5, 40.5, progress);
        this.player.position.set(65.5, et.targetY, curZ);
        this.player.mesh.position.copy(this.player.position);
        this.player.rotationY = Math.PI;
        this.player.mesh.rotation.y = Math.PI;
        if (et.timer <= 0) {
          this.elevatorTransition = null;
        }
      }
    }

    // 1. 滑鼠視角旋轉
    const mouseDelta = this.input.consumeMouseDelta();
    this.cameraCtrl.updateRotation(mouseDelta.x, mouseDelta.y);

    const forwardVec = this.cameraCtrl.getForwardVector();
    const rightVec = this.cameraCtrl.getRightVector();

    let targetPosition: THREE.Vector3;
    let playerRotY: number;

    const isRaining = this.weatherSystem.currentWeather === 'RAIN' || this.weatherSystem.currentWeather === 'THUNDERSTORM';
    const isThunderstorm = this.weatherSystem.currentWeather === 'THUNDERSTORM';

    // 2. 玩家或載具狀態更新
    if (this.currentRidingBike) {
      this.hasRiddenBike = true;
      this.currentRidingBike.update(delta, this.input, this.world.colliders);
      targetPosition = this.currentRidingBike.position;
      playerRotY = this.currentRidingBike.rotationY;
      this.player.position.copy(targetPosition);
      this.player.updateSkillBubble(delta);
      this.player.updateUmbrella(isRaining, true);

      // 更新非騎乘中之所有單車 (套用重力與貼地，防止懸空)
      for (let i = 0; i < this.bicycles.length; i++) {
        const bike = this.bicycles[i];
        if (bike !== this.currentRidingBike) {
          bike.update(delta, this.input, this.world.colliders);
        }
      }

      // 火柴人自行車衝撞 NPC
      if (Math.abs(this.currentRidingBike.speed) > 4.0) {
        for (const npc of this.npcs) {
          if (npc.position.distanceTo(targetPosition) < 2.5 && !npc.isKnockedDown && !npc.isKnockedFlying && npc.hitCooldown <= 0) {
            const speed = Math.abs(this.currentRidingBike.speed);
            const dmg = Math.round(speed * 4.5 + 20);
            this.wantedSystem.reportCrime(2, '火柴人自行車高速衝撞師生');

            _scratchBikeForward.set(Math.sin(playerRotY), 0, Math.cos(playerRotY)).normalize();
            const relX = npc.position.x - targetPosition.x;
            const relZ = npc.position.z - targetPosition.z;
            const sideDot = -_scratchBikeForward.z * relX + _scratchBikeForward.x * relZ;
            const sideSign = sideDot >= 0 ? 1 : -1;
            _scratchBikeSideVec.set(-_scratchBikeForward.z, 0, _scratchBikeForward.x).multiplyScalar(sideSign * 0.45);
            _scratchBikeLaunchDir.copy(_scratchBikeForward).add(_scratchBikeSideVec).normalize();

            const wasKnocked = npc.launchFlying(_scratchBikeLaunchDir, speed, dmg);
            if (wasKnocked) {
              this.handleNpcDefeated(npc, 'BIKE');
            } else {
              this.wantedSystem.showBanner(`${npc.getRoleTitle()} 被火柴人自行車撞飛！`, 2000);
            }
            break;
          }
        }
      }
    } else {
      // 玩家步行時，更新場景中所有閒置單車 (套用重力與貼地，防止懸空)
      for (let i = 0; i < this.bicycles.length; i++) {
        this.bicycles[i].update(delta, this.input, this.world.colliders);
      }

      if (this.elevatorTransition) {
        targetPosition = this.player.position;
        playerRotY = this.player.rotationY;
      } else {
        const inPool = this.world.isInsideSwimmingPool(this.player.position) || this.ecologicalGarden.isInsideWishingPond(this.player.position);
        this.player.isSwimming = inPool;

        this.player.update(delta, this.input, forwardVec, rightVec, this.world.colliders, isRaining, false);
        targetPosition = this.player.position;
        playerRotY = this.player.rotationY;
      }

      // 游泳水花特效
      const inWishingPond = this.ecologicalGarden.isInsideWishingPond(this.player.position);
      const waterSurfaceY = inWishingPond ? 0.32 : 0.25;

      if (this.player.isSwimming) {
        if (this.player.isMoving) {
          this.swimSplashTimer -= delta;
          if (this.swimSplashTimer <= 0) {
            soundManager.playWaterSplash();
            this.swimSplashTimer = this.player.isSprinting ? 0.35 : 0.38;
            this.waterSplashVFX.triggerSplashBurst(
              this.player.position,
              this.player.rotationY,
              this.player.isSprinting,
              waterSurfaceY
            );
          }
        } else {
          this.swimSplashTimer = 0;
        }
      }

      // 持球瞄準時朝向對齊視角
      if (this.basketballGame.isHolding) {
        this.cameraCtrl.camera.getWorldDirection(_scratchCamDir);
        _scratchCamForward.set(_scratchCamDir.x, 0, _scratchCamDir.z).normalize();
        this.player.rotationY = Math.atan2(_scratchCamForward.x, _scratchCamForward.z);
        this.player.mesh.rotation.y = this.player.rotationY;
        playerRotY = this.player.rotationY;
      }
    }

    // 3. 更新三分球小遊戲
    this.basketballGame.update(
      delta,
      this.player,
      this.input,
      this.hud,
      this.wantedSystem,
      this.world.hoopTargets,
      this.world.shootingHotspots,
      this.cameraCtrl.camera
    );

    // 4. 更新 4F 羽球比賽
    const peCoach = this.npcs.find(n => n.role === 'PE_TEACHER_BOSS');
    if (this.hud.isTennisDialogOpen && peCoach) {
      if (targetPosition.distanceTo(peCoach.position) > 4.5) {
        this.hud.closeTennisDialog();
      }
    }

    // 4.5 更新閃身步老師對話距離檢測與對話狀態
    const dodgeTeacher = this.npcs.find(n => n.role === 'DODGE_TEACHER');
    if (dodgeTeacher) {
      if (this.hud.isDodgeDialogOpen) {
        dodgeTeacher.isConversing = true;
        if (targetPosition.distanceTo(dodgeTeacher.position) > 4.5) {
          this.hud.closeDodgeDialog();
          dodgeTeacher.isConversing = false;
        }
      } else {
        dodgeTeacher.isConversing = false;
      }
    }
    this.tennisGame.update(
      delta,
      targetPosition,
      peCoach,
      this.player,
      this.input,
      this.engine.scene,
      this.wantedSystem,
      this.hud,
      (amt) => {
        this.playerCash += amt;
        this.hud.setCash(this.playerCash);
      }
    );

    // 5. 更新田徑賽跑與水上競速
    this.racingGame.updateTrack(
      delta,
      targetPosition,
      this.world.trackCheckpoints,
      this.wantedSystem,
      this.player
    );
    this.racingGame.updateSwim(
      delta,
      targetPosition,
      this.world.swimCheckpoints,
      this.wantedSystem,
      this.player,
      this.waterSplashVFX,
      (amt) => {
        this.playerCash += amt;
        this.hud.setCash(this.playerCash);
      }
    );

    // 6. 更新互動提示
    if (this.tennisGame.tennisState === 'STARTING' || this.tennisGame.tennisState === 'PLAYING' || this.tennisGame.tennisState === 'FINISHED') {
      this.hud.hidePrompt();
    } else if (this.basketballGame.isHolding) {
      // 籃球內部已處理 showPrompt
    } else if (this.currentRidingBike) {
      this.hud.showPrompt('E', '下車 (停放火柴人自行車)');
    } else if (targetPosition.distanceTo(this.world.commissaryPos) < 3.8) {
      this.hud.showPrompt('E', '天天合作社 (買熱食補血)');
    } else if (targetPosition.distanceTo(this.world.broadcastStationPos) < 2.5) {
      if (this.broadcastCooldown <= 0) {
        this.hud.showPrompt('E', '佔領全校廣播麥克風惡搞');
      } else {
        this.hud.showPrompt('📢', `廣播冷卻中 (${Math.ceil(this.broadcastCooldown)}s)`);
      }
    } else if (this.basketballGame.basketballMesh.position.distanceTo(targetPosition) < 2.5 && !this.basketballGame.isBallInAir) {
      this.hud.showPrompt('E', '拿起籃球 (三分球挑戰)');
    } else if (targetPosition.distanceTo(this.world.trackStartPos) < 4.5 && !this.racingGame.isRacingTrack) {
      this.hud.showPrompt('E', '參加 200m 操場極速挑戰 (逆時針方向)');
    } else if (this.racingGame.isRacingTrack) {
      this.hud.showPrompt('⏱️', `操場計時: ${this.racingGame.raceTimer.toFixed(1)}s (檢查點 ${this.racingGame.raceCheckpointIdx + 1}/${this.world.trackCheckpoints.length})`);
    } else if (targetPosition.distanceTo(this.world.swimmingPoolPos) < 4.5 && !this.racingGame.isSwimmingRace) {
      this.hud.showPrompt('E', '參加 50m 自由式水上競速挑戰');
    } else if (this.racingGame.isSwimmingRace) {
      this.hud.showPrompt('🏊', `泳池計時: ${this.racingGame.swimRaceTimer.toFixed(1)}s (檢查點 ${this.racingGame.swimCheckpointIdx + 1}/${this.world.swimCheckpoints.length})`);
    } else if (this.ecologicalGarden.isNearWishingPond(targetPosition)) {
      this.hud.showPrompt('E', '🪙 向生態池許願投幣 ($30)');
    } else if (this.world.isNear1FElevator(targetPosition)) {
      this.hud.showPrompt('E', '🛗 搭乘直達電梯 ➜ 4F 羽球場 (大如老師)');
    } else if (this.world.isNear4FElevator(targetPosition)) {
      this.hud.showPrompt('E', '🛗 搭乘直達電梯 ➜ 1F 演藝廳門廳');
    } else if (peCoach && targetPosition.distanceTo(peCoach.position) < 3.2 && !peCoach.isKnockedDown && this.tennisGame.tennisState === 'IDLE') {
      this.hud.showPrompt('E', '🏸 與大如老師對話 / 挑戰羽球賽');
    } else if (dodgeTeacher && targetPosition.distanceTo(dodgeTeacher.position) < 3.2) {
      if (this.dodgeSkillLevel === 0) {
        this.hud.showPrompt('E', '🥋 與閃身步老師對話 / 學習【閃身步】($1000)');
      } else if (this.dodgeSkillLevel === 1) {
        this.hud.showPrompt('E', '🐻 與閃身步老師對話 / 領悟【狗熊哆嗦毛】($2000)');
      } else {
        this.hud.showPrompt('E', '🥋 與閃身步老師對話 (技能已大成)');
      }
    } else {
      let nearBikePatrol = false;
      for (const npc of this.npcs) {
        if (npc.role === 'BIKE_PATROL' && targetPosition.distanceTo(npc.position) < 3.5) {
          nearBikePatrol = true;
          break;
        }
      }

      if (nearBikePatrol) {
        this.hud.showPrompt('E', '🚲 搶奪火柴人自行車！');
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
            this.hud.showPrompt('E', '騎乘火柴人自行車');
          } else {
            this.hud.hidePrompt();
          }
        }
      }
    }

    if (this.broadcastCooldown > 0) {
      this.broadcastCooldown -= delta;
    }

    // 7. 中毒狀態計時
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

    // 8. NPC AI 更新
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
        this.player.isDead,
        isRaining,
        isThunderstorm
      );

      if (!npc.isKnockedDown && npc.isChasing) {
        isAnyChasing = true;
        const dist = npc.position.distanceTo(targetPosition);
        if (dist < 8.0 || npc.isBurstSprinting) {
          isHighDanger = true;
        }
      }
    }

    // 校犬脫逃判定
    const dog = this.npcs.find(n => n.role === 'DOG');
    if (dog) {
      if (dog.isChasing) {
        this.wasDogChasing = true;
      } else if (this.wasDogChasing && NPC.isInsideTeachingBuilding(targetPosition)) {
        this.wasDogChasing = false;
        this.hasEscapedDog = true;
        this.wantedSystem.showBanner('進入教學大樓！校犬柴柴在門外止步，成功脫逃！', 3000);
      } else if (!dog.isChasing && this.wasDogChasing) {
        this.wasDogChasing = false;
        this.hasEscapedDog = true;
      } else if (!dog.isChasing) {
        this.wasDogChasing = false;
      }
    }

    // NPC 攻擊玩家判定
    for (const npc of this.npcs) {
      const inAttackRange = !npc.isKnockedDown && npc.isChasing && npc.position.distanceTo(targetPosition) < npc.attackRange;
      if (inAttackRange && !this.player.isDead && npc.attackCooldown <= 0) {
        if (this.player.isDodging) {
          npc.attackCooldown = 0.85;
          npc.triggerAttackAnimation(delta);
          this.wantedSystem.showBanner(this.dodgeSkillLevel === 2 ? '🐻 狗熊哆嗦毛！神速規避攻擊！' : '💨 閃身步！成功規避攻擊！', 1500);
          soundManager.playDodge(this.dodgeSkillLevel === 2);
          continue;
        }
        npc.attackCooldown = 0.85;
        npc.triggerAttackAnimation(delta);

        _scratchImpactDir.subVectors(targetPosition, npc.position);
        _scratchImpactDir.y = 0;
        if (_scratchImpactDir.lengthSq() < 0.001) {
          _scratchImpactDir.set(0, 0, 1);
        } else {
          _scratchImpactDir.normalize();
        }

        const specs = npc.getAttackSpecs();

        if (this.currentRidingBike) {
          this.currentRidingBike.dismount(this.player, this.engine.scene);
          this.currentRidingBike = null;
          this.player.isRidingVehicle = false;
          this.cameraCtrl.setMode(false);
          this.wantedSystem.showBanner(`遭到${npc.getRoleTitle()}猛烈衝擊，被擊飛摔下火柴人自行車！`, 2500);
        } else {
          this.wantedSystem.showBanner(`遭到${npc.getRoleTitle()}重擊擊飛！`, 1500);
        }

        this.wantedSystem.notifyAttacked();
        const justDied = this.player.launchFlying(_scratchImpactDir, specs.hForce, specs.vForce, specs.damage, npc.getRoleTitle());
        if (justDied) {
          this.handlePlayerDeath(`被${npc.getRoleTitle()}逮捕擊倒！`);
        }
      }
    }

    // 9. 角色推擠排除
    this.resolveCharacterSeparation();

    // 10. 更新通緝星級系統
    this.wantedSystem.update(delta, isAnyChasing);

    // 11. 更新攝影機
    this.cameraCtrl.update(targetPosition, delta, this.world.colliders);

    // 12. 更新生態探索園區
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

    // 13. 更新游泳水花微粒
    const inWishingPondForVFX = this.ecologicalGarden.isInsideWishingPond(this.player.position);
    const waterSurfaceYForVFX = inWishingPondForVFX ? 0.32 : 0.25;
    this.waterSplashVFX.update(
      delta,
      this.player.position,
      this.player.rotationY,
      this.player.isSwimming,
      this.player.isMoving,
      this.player.isSprinting,
      waterSurfaceYForVFX
    );

    // 14. Boss 血條動態顯示
    const distToPlantBoss = targetPosition.distanceTo(this.ecologicalGarden.boss.position);
    if (distToPlantBoss < 35.0 && !this.ecologicalGarden.boss.isDead) {
      this.hud.setBossHealth(this.ecologicalGarden.boss.hp, this.ecologicalGarden.boss.maxHp, true, '秘境霸主：變異食人花王', '🌸');
    } else {
      this.hud.setBossHealth(0, 1000, false);
    }

    // 15. 更新 HUD 介面與任務看板
    const isBeingChased = !this.player.isDead && (isAnyChasing || this.wantedSystem.stars > 0);
    const dangerAlert = isHighDanger || this.wantedSystem.stars >= 4;
    bgmManager.setPursuitMode(isBeingChased, dangerAlert);

    this.hud.setCash(this.playerCash);

    // 身法技能冷卻計時與 HUD 更新
    if (this.dodgeCooldownTimer > 0) {
      this.dodgeCooldownTimer = Math.max(0, this.dodgeCooldownTimer - delta);
    }
    const maxSkillCd = this.dodgeSkillLevel === 2 ? 2.0 : 5.0;
    this.hud.updateSkillHUD(this.dodgeSkillLevel, this.dodgeCooldownTimer, maxSkillCd);

    this.hud.updateWeaponHUD(
      this.player.currentWeapon,
      this.player.hasNormalBat,
      this.player.hasSpecialBat,
      this.studentDefeatedCount,
      this.teacherDefeatedCount,
      this.dogDefeatedCount,
      this.bikePatrolDefeatedCount
    );

    this.hud.updateMissionTracker({
      studentDefeated: this.studentDefeatedCount,
      hasNormalBat: this.player.hasNormalBat,
      teacherDefeated: this.teacherDefeatedCount,
      dogDefeated: this.dogDefeatedCount,
      bikeDefeated: this.bikePatrolDefeatedCount,
      inspectorDefeated: this.inspectorDefeatedCount,
      hasSpecialBat: this.player.hasSpecialBat,
      plantBossDefeated: this.ecologicalGarden.boss.isDead,
      peBossDefeated: this.tennisGame.coachDefeated || (peCoach ? peCoach.hp <= 0 : false),
      trackRecordText: this.racingGame.bestTrackTime ? `${this.racingGame.bestTrackTime.toFixed(1)}s` : '未完成',
      swimRecordText: this.racingGame.bestSwimTime ? `${this.racingGame.bestSwimTime.toFixed(1)}s` : '未完成',
      basketballStreak: this.basketballGame.scoreStreak,
      basketballRecord: this.basketballGame.bestStreak,
      hasRiddenBike: this.hasRiddenBike,
      hasEscapedDog: this.hasEscapedDog,
      hasWishedPond: this.hasWishedPond,
      hasTastedHotFood: this.hasTastedHotFood,
      dodgeSkillLevel: this.dodgeSkillLevel
    });

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

    // 15.5 更新校園動態天氣系統 (雨滴粒子、雷鳴閃電與光照平滑漸變)
    this.weatherSystem.update(delta, targetPosition);

    // 16. 渲染畫面
    this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
  };
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  new SchoolGTASandbox();
});
