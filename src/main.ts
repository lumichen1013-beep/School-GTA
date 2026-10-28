import * as THREE from 'three';
import { Engine } from './core/Engine';
import { InputManager } from './core/InputManager';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { CampusWorld, CollidableBox } from './world/CampusWorld';
import { DetentionWorld } from './world/DetentionWorld';
import { DetentionCutscene } from './world/DetentionCutscene';
import { Player } from './entities/Player';
import { Bicycle } from './vehicles/Bicycle';
import { NPC } from './entities/NPC';
import { createCampusNPCs, createDetentionNPCs } from './world/NPCSpawner';
import { WantedSystem } from './systems/WantedSystem';
import { HUD, CommissaryItem, DetentionRadarData, MissionTrackerData } from './ui/HUD';
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
const _scratchCqcScreenPos = new THREE.Vector3();

class SchoolGTASandbox {
  private engine!: Engine;
  private input!: InputManager;
  private cameraCtrl!: ThirdPersonCamera;
  private world!: CampusWorld;
  private detentionWorld!: DetentionWorld;
  private detentionCutscene!: DetentionCutscene;
  private currentWorldType: 'CAMPUS' | 'DETENTION' = 'CAMPUS';
  private player!: Player;
  private ecologicalGarden!: EcologicalGarden;
  private waterSplashVFX!: WaterSplashVFX;
  private bicycles: Bicycle[] = [];
  private npcs: NPC[] = [];
  private campusNPCs: NPC[] = [];
  private detentionNPCs: NPC[] = [];
  private searchlightAlertTimer: number = 0;
  private detentionSpawnGraceTimer: number = 0;

  // 潛龍諜影特訓院越獄專屬狀態 (Detention Stealth Escape State)
  private detentionEscapeStartTime: number = 0;
  private detentionTakedownCount: number = 0;
  private detentionAlertCount: number = 0;
  private detentionAlertTimer: number = 0;
  private hasKeycardA: boolean = false;
  private hasKeycardB: boolean = false;
  private hasMasterKeycard: boolean = false;
  private isDetentionBossDefeated: boolean = false;
  private isDetentionEscapeComplete: boolean = false;
  private nearbyCqcTarget: NPC | null = null;

  // 慢動作特寫與時間膨脹系統 (Bullet Time & Boss Cinematic Execution)
  private bulletTimeTimer: number = 0;
  private bulletTimeDuration: number = 0;
  private bulletTimeScale: number = 0.15;
  private wasBossWindingUp: boolean = false;
  private wasBossStunned: boolean = false;
  private bossJumpDelayTimer: number = 0;
  private bossJumpTargetPos: THREE.Vector3 = new THREE.Vector3();

  public get activeColliders(): CollidableBox[] {
    return this.currentWorldType === 'CAMPUS' ? this.world.colliders : this.detentionWorld.colliders;
  }
  private wantedSystem!: WantedSystem;
  private hud!: HUD;
  private weatherSystem!: WeatherSystem;

  // 模組化小遊戲系統
  private basketballGame!: BasketballGame;
  private racingGame!: RacingGame;
  private tennisGame!: TennisGame;

  // 經濟與任務解鎖統計系統 (初始改為 100 元)
  private playerCash: number = 100;
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

  // 校園惡搞廣播彩蛋狀態 (洗牌循環輪播，避免連續重複)
  private broadcastCooldown: number = 0;
  private broadcastPlaylist: number[] = [];
  private lastAnnouncementIndex: number = -1;
  private readonly announcements: string[] = [
    // 經典校園惡搞廣播
    '📢【全校緊急廣播】三年二班葉大雄，你媽拿便當來校門口了，還帶了你忘記穿的衛生褲！',
    '📢【訓導處通告】報告主任教官！你的假髮被風吹掉在司令台單槓上了，請速去撿！',
    '📢【生教組廣播】請全體糾察隊立刻到福利社集合，今天大肉包買一送一，限時搶購！',
    '📢【校長室特別通知】各位同學請注意！全體立正站好發呆 4 秒鐘，不准亂動！',
    '📢【廣播台突發】恭喜三年甲班全體同學獲得「不用掃廁所一週」特權！',
    '📢【教官室廣播】操場上那個翻牆出去買手搖杯的同學，記得幫教官也買一杯半糖微冰珍珠奶茶，不然記大過！',
    '📢【合作社特急廣播】福利社大阿姨宣布：只要大喊三聲「校長最帥」，肉包豆漿一律免費招待！',

    // 【大如老師】專屬惡搞廣播
    '📢【4F羽球館緊急廣播】大如老師暴扣殺球把體育館天花板打穿了！請工友速帶梯子與水泥前往救援！',
    '📢【體育組尋物廣播】大如老師正在全校尋找他的純金羽球拍，撿到者可免測 1600 公尺並獲贈簽名羽球一顆！',
    '📢【學務處防空廣播】請全校師生注意防空警報！那不是空襲，那是大如老師在 4F 連續殺球破音障的音爆巨響！',
    '📢【教務處公告】大如老師宣佈：今天只要羽球回擊能接到他三記反手暴扣，本學期體育成績直接給 100 分！',
    '📢【保健室特急通報】請大如老師暫停指導「凌空三百六十度迴旋殺球」，已有三位體育股長扭到腰在冰敷！',

    // 【小太陽】專屬惡搞廣播
    '📢【健康中心廣播】小太陽同學請克制你的笑容！你的笑容太過耀眼，已經導致整排三年級同學集體雪盲送醫！',
    '📢【總務處節能公告】因校園電費超標，即日起全校停用日光燈，晚自習全面由「小太陽」同學到各班輪流發光照明！',
    '📢【熱血廣播站】呼叫小太陽！外面下大暴雨操場積水了，請你立刻到司令台散發熱情把整個操場曬乾！',
    '📢【生教組急尋】尋找小太陽同學！走廊監視器回報你走路自帶聖光，糾察隊以為有外星幽浮入侵全體拔腿狂奔！',
    '📢【全校氣象廣播】今日校園紫外線指數嚴重超標！經查原因並非太陽，而是「小太陽」同學今天心情太好在走廊燦笑！',

    // 【丫翔】專屬惡搞廣播
    '📢【生教組嚴正通告】三年七班丫翔同學！請不要再騎著你的 Ubike 在演藝大樓走廊嘗試「水溝蓋甩尾過彎」！',
    '📢【訓導處廣播】丫翔！你的外送珍奶和超大雞排已經送到校門口了，再不來拿就要被教官當場沒收吃掉了！',
    '📢【福利社廣播尋人】丫翔同學！你剛才拿五塊錢硬要買兩包科學麵，阿姨說少一塊請你速來補齊，不然沒收悠遊卡！',
    '📢【全校通緝廣播】糾察隊全體注意！丫翔又把司令台的麥克風偷拔下來當手電筒了，看到請立刻展開校園圍捕！',
    '📢【圖書館特急通告】丫翔同學！請不要在自習室用下巴頂著課本假裝在用功，你口水已經把整本國文課本浸濕了！',

    // 【高級機器】專屬惡搞廣播
    '📢【校園資安快報】警報！實驗室「高級機器」發生邏輯錯誤，目前正失控在福利社瘋狂搶購所有茶葉蛋！',
    '📢【生化科技室公告】高級機器已成功黑進全校鐘聲系統，下課鐘聲將全面改為動感電音重低音，全體搖起來！',
    '📢【教務處廣播】報告校長！高級機器在幫全校算成績時當機，導致全校同學微積分與操行成績全部自動登錄為 999 分！',
    '📢【總務處廣播】誰把「高級機器」的充電插頭拔掉拿去充手機了？它現在電量剩 2%，正用哭腔在操場狂奔找插座！',
    '📢【實驗室通報】高級機器正在走廊自主升級 AI 核心，路過同學請勿向它投餵營養午餐的青豆與苦瓜！',

    // 【跨界夢幻聯動】角色大亂鬥廣播
    '📢【操場重磅決鬥廣播】今晚放學後：大如老師將與「高級機器」進行羽球世紀大對決！由小太陽現場打光、丫翔負責賣爆米花！',
    '📢【學務處突發廣播】丫翔把小太陽借來當閃光彈，結果被大如老師一拍子打飛進了高級機器的散熱孔裡！',
    '📢【全校狂歡廣播】小太陽發光充電、高級機器高速運算、大如老師揮拍加持、丫翔帶頭起鬨——全校今天提早三小時放學！',
    '📢【福利社爭霸廣播】丫翔騎車載著小太陽衝進合作社，跟高級機器搶最後一顆包子，最後被大如老師用羽球拍雙殺！'
  ];

  /**
   * 取得下一則校園惡搞廣播台詞（採用洗牌循環佇列演算法，保證每次輪播不重複，完整體驗所有搞笑句子）
   */
  private getNextAnnouncement(): string {
    if (this.broadcastPlaylist.length === 0) {
      const indices = Array.from({ length: this.announcements.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      // 避免跨循環時最後一句與新循環第一句重複
      if (indices.length > 1 && indices[indices.length - 1] === this.lastAnnouncementIndex) {
        const swapIdx = Math.floor(Math.random() * (indices.length - 1));
        [indices[indices.length - 1], indices[swapIdx]] = [indices[swapIdx], indices[indices.length - 1]];
      }
      this.broadcastPlaylist = indices;
    }
    const nextIdx = this.broadcastPlaylist.pop()!;
    this.lastAnnouncementIndex = nextIdx;
    return this.announcements[nextIdx];
  }

  // 演藝大樓電梯平滑過場與自動走出狀態
  private elevatorTransition: {
    phase: 'CLOSING' | 'TRAVELING' | 'OPENING' | 'WALKING_OUT';
    timer: number;
    targetY: number;
    banner: string;
  } | null = null;

  // 0-GC 介面更新常態快取物件 (避免 60fps 幀迴圈每幀重複配置堆疊記憶體)
  private cachedMissionTrackerData: MissionTrackerData = {
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

  private cachedDetentionRadarData: DetentionRadarData = {
    isGateAOpen: false,
    isGateBOpen: false,
    isSouthGateOpen: false,
    hasKeycardA: false,
    hasKeycardB: false,
    hasMasterKeycard: false,
    keycardAPos: new THREE.Vector3(),
    keycardBPos: new THREE.Vector3(),
    masterKeycardPos: null,
    alertLevel: 'NORMAL',
    alertTimer: 0,
    checkpointPos: new THREE.Vector3(),
    checkpointName: 'A區安全崗亭'
  };

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

    // 階段 2.5 (55%)：建置第二世界【少年院】與開場劇情動畫系統
    this.updateProgress(55, '正在建置第二世界【少年院】與開場劇情動畫系統...');
    this.detentionWorld = new DetentionWorld(this.engine.scene);
    this.detentionWorld.group.visible = false; // 預設處於天天國中，隱藏少年院
    this.detentionCutscene = new DetentionCutscene(this.engine.scene);
    this.detentionCutscene.onSubtitleChange = (sub) => {
      const subEl = document.getElementById('cutscene-subtitle-text');
      if (subEl) subEl.textContent = sub;
    };
    this.detentionCutscene.onComplete = () => {
      const cutsceneOverlay = document.getElementById('cutscene-overlay');
      if (cutsceneOverlay) cutsceneOverlay.style.display = 'none';
      this.weatherSystem.setWeather('SUNNY', true, false);
      if (this.player) {
        this.player.hasNormalBat = true;
        this.player.setWeapon('NORMAL_BAT');
        this.player.maxHp = 150;
        this.player.hp = 150;
      }
      this.detentionSpawnGraceTimer = 5.0;
      this.wantedSystem.showBanner('🛡️【特訓院潛入開始】5 秒內守衛暫不發動攻擊！配備特訓防暴棒，體能提升至 150 HP！', 4500);
      this.hud.showCenterPrompt('尋找門禁卡進入下一個區域吧');
    };
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

    // 階段 4 (80%)：生成校園師生、主任教官、校犬柴柴、少年院教官與鐵面總長
    this.updateProgress(80, '正在生成校園師生、主任教官、校犬柴柴、少年院教官與鐵面總長...');
    this.campusNPCs = createCampusNPCs(this.engine.scene);
    this.detentionNPCs = createDetentionNPCs(this.engine.scene);
    this.npcs = this.campusNPCs;
    this.wantedSystem = new WantedSystem();
    this.wantedSystem.onWantedCleared = () => {
      for (const n of this.npcs) {
        n.resetAggro();
      }
    };
    this.hud = new HUD();
    this.hud.onWorldToggle = () => {
      this.hud.openWorldModal(this.currentWorldType, (tw) => this.switchWorld(tw));
    };
    this.input.onToggleWorld(() => {
      this.hud.openWorldModal(this.currentWorldType, (tw) => this.switchWorld(tw));
    });
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
    const loadingContainer = document.getElementById('loading-container');
    const worldSelectContainer = document.getElementById('world-select-container');
    const btnStart = document.getElementById('btn-start') as HTMLButtonElement | null;

    if (startScreen) {
      startScreen.classList.add('loaded');
    }

    if (loadingContainer) {
      loadingContainer.style.display = 'none';
    }
    if (worldSelectContainer) {
      worldSelectContainer.style.display = 'flex';
    }

    if (btnStart) {
      btnStart.removeAttribute('disabled');
      btnStart.disabled = false;
      btnStart.classList.add('is-ready');
    }

    // 啟動遊戲主迴圈
    this.tick();
  }

  private setupStartScreen() {
    const startScreen = document.getElementById('start-screen');
    const btnStart = document.getElementById('btn-start');
    const btnStartCampus = document.getElementById('btn-start-campus');
    const btnStartDetention = document.getElementById('btn-start-detention');
    const cardCampus = document.getElementById('card-world-campus');
    const cardDetention = document.getElementById('card-world-detention');
    const cutsceneSkipBtn = document.getElementById('cutscene-skip-btn');

    if (cutsceneSkipBtn) {
      const handleSkip = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.detentionCutscene.isActive) {
          this.detentionCutscene.skip();
        }
      };
      cutsceneSkipBtn.addEventListener('click', handleSkip);
      cutsceneSkipBtn.addEventListener('touchend', handleSkip, { passive: false });
    }

    if (!startScreen) return;

    let hasStarted = false;
    const handleStartWithWorld = (targetWorld: 'CAMPUS' | 'DETENTION', e?: Event) => {
      if (!this.isGameLoaded) return;
      if (hasStarted) return;
      hasStarted = true;

      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      this.input.requestPointerLock();
      bgmManager.start();
      startScreen.style.opacity = '0';
      startScreen.style.pointerEvents = 'none';
      setTimeout(() => {
        startScreen.style.display = 'none';
        this.isGameRunning = true;
        this.switchWorld(targetWorld, targetWorld === 'CAMPUS');
      }, 400);
    };

    if (btnStartCampus) {
      btnStartCampus.addEventListener('click', (e) => handleStartWithWorld('CAMPUS', e));
      btnStartCampus.addEventListener('touchend', (e) => handleStartWithWorld('CAMPUS', e), { passive: false });
    }
    if (cardCampus) {
      cardCampus.addEventListener('click', (e) => handleStartWithWorld('CAMPUS', e));
    }

    if (btnStartDetention) {
      btnStartDetention.addEventListener('click', (e) => handleStartWithWorld('DETENTION', e));
      btnStartDetention.addEventListener('touchend', (e) => handleStartWithWorld('DETENTION', e), { passive: false });
    }
    if (cardDetention) {
      cardDetention.addEventListener('click', (e) => handleStartWithWorld('DETENTION', e));
    }

    if (btnStart) {
      btnStart.addEventListener('click', (e) => handleStartWithWorld('CAMPUS', e));
      btnStart.addEventListener('touchend', (e) => handleStartWithWorld('CAMPUS', e), { passive: false });
    }
  }

  public switchWorld(targetWorld: 'CAMPUS' | 'DETENTION', skipCutscene: boolean = false) {
    if (this.currentRidingBike) {
      this.currentRidingBike.dismount(this.player, this.engine.scene);
      this.currentRidingBike = null;
      this.player.isRidingVehicle = false;
      this.cameraCtrl.setMode(false);
    }

    this.wantedSystem.clearWanted();
    for (const n of this.npcs) {
      n.resetAggro();
    }

    this.currentWorldType = targetWorld;
    if (this.wantedSystem) {
      this.wantedSystem.currentWorld = targetWorld;
    }
    if (this.weatherSystem) {
      this.weatherSystem.currentWorld = targetWorld;
    }
    if (this.player) {
      this.player.equipBadmintonRacket(false);
    }
    if (this.tennisGame && this.tennisGame.tennisState !== 'IDLE') {
      this.tennisGame.resetMatch(this.engine.scene, this.player);
    }
    const cutsceneOverlay = document.getElementById('cutscene-overlay');

    if (targetWorld === 'CAMPUS') {
      if (this.detentionCutscene.isActive) {
        this.detentionCutscene.skip();
      }
      if (cutsceneOverlay) cutsceneOverlay.style.display = 'none';

      // 回歸天天國中：重設生命值上限為 100
      this.player.maxHp = 100;
      this.player.hp = Math.min(this.player.hp, 100);

      this.world.group.visible = true;
      this.ecologicalGarden.group.visible = true;
      this.detentionWorld.group.visible = false;

      // 恢復天天國中專屬三分球籃球實體
      if (this.basketballGame) {
        this.basketballGame.basketballMesh.visible = true;
      }

      for (const b of this.bicycles) {
        b.mesh.visible = true;
      }
      for (const npc of this.campusNPCs) {
        npc.mesh.visible = true;
      }
      for (const npc of this.detentionNPCs) {
        npc.mesh.visible = false;
      }
      this.npcs = this.campusNPCs;

      this.player.position.set(0, 0, 0);
      this.player.velocity.set(0, 0, 0);
      this.player.rotationY = 0;
      this.cameraCtrl.resetBehind(this.player.position, 0);

      this.weatherSystem.setWeather('SUNNY', false, false);
      soundManager.playSchoolBell();
      this.hud.updateWorldHUD('🏫 天天國中');
      this.wantedSystem.showBanner('🏫 已傳送至【天天國中】！自由探索校園！', 3000);
    } else {
      // 少年院
      this.world.group.visible = false;
      this.ecologicalGarden.group.visible = false;
      this.detentionWorld.group.visible = true;

      // 徹底隱藏天天國中特有小遊戲實體 (杜絕籃球、競速光圈、羽球殘留於第二世界)
      if (this.basketballGame) {
        if (this.basketballGame.isHolding) {
          this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
        }
        this.basketballGame.basketballMesh.visible = false;
      }
      if (this.racingGame) {
        this.racingGame.checkpointMarker.visible = false;
        this.racingGame.swimCheckpointMarker.visible = false;
        this.racingGame.isRacingTrack = false;
        this.racingGame.isSwimmingRace = false;
      }
      if (this.tennisGame) {
        this.tennisGame.endMatch(false, this.wantedSystem, this.hud, this.engine.scene, () => {});
      }

      for (const b of this.bicycles) {
        b.mesh.visible = false;
      }
      for (const npc of this.campusNPCs) {
        npc.mesh.visible = false;
      }
      for (const npc of this.detentionNPCs) {
        npc.mesh.visible = true;
      }
      this.npcs = this.detentionNPCs;

      // 潛龍諜影特訓院越獄模式：赤手空拳潛入
      this.player.maxHp = 100;
      this.player.hp = 100;
      this.player.setWeapon('FIST');

      this.hud.updateWorldHUD('⛓️ 特訓院 (潛入越獄)');

      // 重置特訓院越獄狀態
      this.detentionEscapeStartTime = performance.now();
      this.detentionTakedownCount = 0;
      this.detentionAlertCount = 0;
      this.detentionAlertTimer = 0;
      this.hasKeycardA = false;
      this.hasKeycardB = false;
      this.hasMasterKeycard = false;
      this.isDetentionBossDefeated = false;
      this.isDetentionEscapeComplete = false;
      this.detentionSpawnGraceTimer = 5.0;

      // 重設門禁與鑰匙卡
      this.detentionWorld.hasPickedKeycardA = false;
      this.detentionWorld.hasPickedKeycardB = false;
      this.detentionWorld.hasPickedMasterKeycard = false;
      this.detentionWorld.keycardAMeshGroup.visible = true;
      this.detentionWorld.keycardBMeshGroup.visible = true;
      this.detentionWorld.masterKeycardMeshGroup.visible = false;
      this.detentionWorld.isGateAOpen = false;
      this.detentionWorld.isGateBOpen = false;
      this.detentionWorld.isSouthGateOpen = false;
      this.detentionWorld.gateAMeshGroup.position.set(0, 0, 0);
      this.detentionWorld.gateBMeshGroup.position.set(0, 0, 0);
      this.detentionWorld.southGateMeshGroup.position.set(0, 0, 0);
      if (this.detentionWorld.gateACollider) {
        this.detentionWorld.gateACollider.min.y = 0;
        this.detentionWorld.gateACollider.max.y = 4.5;
      }
      if (this.detentionWorld.gateBCollider) {
        this.detentionWorld.gateBCollider.min.y = 0;
        this.detentionWorld.gateBCollider.max.y = 4.5;
      }
      if (this.detentionWorld.southGateCollider) {
        this.detentionWorld.southGateCollider.min.y = 0;
        this.detentionWorld.southGateCollider.max.y = 8.0;
      }

      if (!skipCutscene) {
        if (cutsceneOverlay) cutsceneOverlay.style.display = 'flex';
        this.weatherSystem.setWeather('THUNDERSTORM', false, false);
        this.detentionCutscene.start(this.cameraCtrl, this.player);
      } else {
        if (cutsceneOverlay) cutsceneOverlay.style.display = 'none';
        this.weatherSystem.setWeather('SUNNY', false, false);
        this.player.position.copy(this.detentionWorld.spawnPos);
        this.player.velocity.set(0, 0, 0);
        this.player.rotationY = 0;
        this.cameraCtrl.resetBehind(this.player.position, 0);
        this.wantedSystem.showBanner('🥷 已潛入【第七特訓院】！按住滑鼠右鍵（手機搖桿推半程）靜音慢步，從背後靠近守衛進行【暗殺擊昏】！', 5000);
        this.hud.showCenterPrompt('尋找門禁卡進入下一個區域吧');
      }
    }
  }

  private setDetentionCheckpoint(pos: THREE.Vector3, name: string) {
    this.detentionWorld.setCheckpoint(pos, name);
    this.wantedSystem.showBanner(`🚩 存檔點已更新：【${name}】！死亡後將在此處重生。`, 3500);
    soundManager.playBroadcastChime();
  }

  private setupInteractions() {
    // E 鍵互動：少年院門禁與鑰匙卡 / 合作社 / 採菇 / 許願 / 電梯 / 羽球對話 / 放籃球 / 賽跑 / 拿籃球 / 上下單車
    this.input.onInteract(() => {
      if (!this.isGameRunning) return;
      if (this.player.isDead || this.player.hp <= 0) return;

      // 潛龍諜影特訓院越獄專屬互動點 (撿門禁卡、解鎖管制門、解鎖南大門、小賣部)
      if (this.currentWorldType === 'DETENTION') {
        // 1. 拾取門禁卡 A
        if (this.player.position.distanceTo(this.detentionWorld.keycardAPos) < 2.5 && !this.hasKeycardA) {
          this.hasKeycardA = true;
          this.detentionWorld.hasPickedKeycardA = true;
          this.detentionWorld.keycardAMeshGroup.visible = false;
          this.wantedSystem.showBanner('💳 獲得【藍色門禁卡 A】！可用於開啟管制閘門 1！', 4000);
          this.setDetentionCheckpoint(new THREE.Vector3(5, 0, -60), 'A區安全崗亭');
          soundManager.playPunch();
          return;
        }
        // 2. 拾取門禁卡 B
        if (this.player.position.distanceTo(this.detentionWorld.keycardBPos) < 2.5 && !this.hasKeycardB) {
          this.hasKeycardB = true;
          this.detentionWorld.hasPickedKeycardB = true;
          this.detentionWorld.keycardBMeshGroup.visible = false;
          this.wantedSystem.showBanner('💳 獲得【黃色門禁卡 B】！可用於開啟管制閘門 2！', 4000);
          this.setDetentionCheckpoint(new THREE.Vector3(24, 0, 14), 'B區貨櫃掩體');
          soundManager.playPunch();
          return;
        }
        // 3. 拾取萬能鑰匙卡
        if (
          this.detentionWorld.masterKeycardPos &&
          this.player.position.distanceTo(this.detentionWorld.masterKeycardPos) < 2.5 &&
          !this.hasMasterKeycard
        ) {
          this.hasMasterKeycard = true;
          this.detentionWorld.hasPickedMasterKeycard = true;
          this.detentionWorld.masterKeycardMeshGroup.visible = false;
          this.wantedSystem.showBanner('🔑 獲得【萬能逃脫鑰匙卡】！快前往南大門開啟大門撤離！', 5000);
          this.setDetentionCheckpoint(new THREE.Vector3(0, 0, 68), 'C區決戰勝利點');
          soundManager.playSchoolBell();
          return;
        }
        // 4. 開啟管制閘門 1
        if (this.player.position.distanceTo(this.detentionWorld.gateAPos) < 3.8 && !this.detentionWorld.isGateAOpen) {
          if (this.hasKeycardA) {
            this.detentionWorld.openGateA();
            this.wantedSystem.showBanner('🔓 管制閘門 1 已開啟！進入 B 區貨櫃掩體迷宮！', 3500);
            this.setDetentionCheckpoint(new THREE.Vector3(0, 0, -22), 'B區門前安全區');
            soundManager.playSchoolBell();
          } else {
            this.wantedSystem.showBanner('🔒 門禁鎖死！需要【藍色門禁卡 A】才能開啟閘門 1！', 3000);
          }
          return;
        }
        // 5. 開啟管制閘門 2
        if (this.player.position.distanceTo(this.detentionWorld.gateBPos) < 3.8 && !this.detentionWorld.isGateBOpen) {
          if (this.hasKeycardB) {
            this.detentionWorld.openGateB();
            this.wantedSystem.showBanner('🔓 管制閘門 2 已開啟！進入 C 區終極哨戒門庭！', 3500);
            this.setDetentionCheckpoint(new THREE.Vector3(0, 0, 42), 'C區決戰前哨');
            soundManager.playSchoolBell();
          } else {
            this.wantedSystem.showBanner('🔒 門禁鎖死！需要【黃色門禁卡 B】才能開啟閘門 2！', 3000);
          }
          return;
        }
        // 6. 開啟南側終極絕境逃脫大門
        if (this.player.position.distanceTo(this.detentionWorld.southGateConsolePos) < 4.5 && !this.detentionWorld.isSouthGateOpen) {
          if (this.hasMasterKeycard) {
            this.detentionWorld.openSouthGate();
            this.wantedSystem.showBanner('🚪 南側絕境大門全面解鎖升起！快衝出大門逃出生天！', 5000);
            this.setDetentionCheckpoint(new THREE.Vector3(-7.5, 0, 91), '南大門逃脫點');
            soundManager.playSchoolBell();
          } else {
            this.wantedSystem.showBanner('🔒 終極防暴大門鎖死！需要擊破特訓總教官取得【萬能逃脫鑰匙卡】！', 3500);
          }
          return;
        }

        if (this.player.position.distanceTo(this.detentionWorld.commissaryPos) < 4.2) {
          this.hud.openCommissary(this.playerCash, (item) => this.buyCommissaryItem(item));
          return;
        }
        if (this.player.position.distanceTo(this.detentionWorld.pullupStationPos) < 3.0) {
          this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 60);
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
          this.wantedSystem.showBanner('💪【特訓單槓】引體向上特訓！體力 +25 HP，精力大幅恢復 +60！', 2500);
          soundManager.playPunch();
          return;
        }
        if (this.player.position.distanceTo(this.detentionWorld.benchpressStationPos) < 3.0) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
          this.wantedSystem.showBanner('🏋️【特訓大重量臥推】極限力量爆發！體力強效恢復 +50 HP！', 2500);
          soundManager.playBanditSlash();
          return;
        }
        if (this.player.position.distanceTo(this.detentionWorld.tireStationPos) < 3.5) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
          this.wantedSystem.showBanner('🛞【巨型輪胎翻滾特訓】重裝肌耐力翻滾！體力 +15 HP，解鎖 8 秒狂暴極速衝刺！', 3000);
          this.player.sprintSpeed = 14.0;
          setTimeout(() => { this.player.sprintSpeed = 10.0; }, 8000);
          soundManager.playBanditSlash();
          return;
        }
      }

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

      // 4. 演藝大樓 1F/4F 直達光能電梯搭乘 (搭乘電梯時自動還原手持武器)
      if (this.world.isNear1FElevator(this.player.position) && !this.elevatorTransition) {
        soundManager.playElevatorDing();
        this.player.equipBadmintonRacket(false);
        if (this.tennisGame.tennisState !== 'IDLE') {
          this.tennisGame.resetMatch(this.engine.scene, this.player);
        }
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
        this.player.equipBadmintonRacket(false);
        if (this.tennisGame.tennisState !== 'IDLE') {
          this.tennisGame.resetMatch(this.engine.scene, this.player);
        }
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

      // 6. 放下籃球 (僅限天天國中)
      if (this.currentWorldType === 'CAMPUS' && this.basketballGame.isHolding) {
        this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
        return;
      }

      // 7. 廣播台惡搞 (洗牌循環輪播，每句都充滿驚喜與校園彩蛋)
      if (this.player.position.distanceTo(this.world.broadcastStationPos) < 2.5) {
        if (this.broadcastCooldown <= 0) {
          this.broadcastCooldown = 15.0;
          soundManager.playBroadcastChime();
          const announcement = this.getNextAnnouncement();
          this.wantedSystem.showBanner(announcement, 6000);
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

      // 10. 拿起籃球 (僅限天天國中)
      if (this.currentWorldType === 'CAMPUS' && !this.currentRidingBike && this.basketballGame.basketballMesh.position.distanceTo(this.player.position) < 2.5 && !this.basketballGame.isBallInAir) {
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
            const groundY = Bicycle.getFloorHeightAt(npc.position.x, npc.position.y, npc.position.z, this.activeColliders);
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
              const groundY = Bicycle.getFloorHeightAt(bike.position.x, bike.position.y, bike.position.z, this.activeColliders);
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
      if (!this.isGameRunning) return;
      if (this.player.isDead || this.player.hp <= 0) return;

      if (this.currentWorldType === 'CAMPUS' && this.basketballGame.isHolding) {
        this.basketballGame.startCharging(this.hud);
        return;
      }

      if (this.currentRidingBike) {
        this.currentRidingBike.ringBell();
      } else {
        // 若玩家處於攻擊間隔冷卻中，不執行攻擊
        if (!this.player.canAttack) return;

        // 第二世界：若處於守衛身後觸發暗殺擊昏
        if (this.currentWorldType === 'DETENTION' && this.nearbyCqcTarget && !this.nearbyCqcTarget.isKnockedDown) {
          this.performCqcTakedown();
          return;
        }

        const attacked = this.player.attack();
        if (!attacked) return;

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
          if (npc.position.distanceTo(this.player.position) < reach + 0.3 && !npc.isKnockedDown && !npc.isPermanentlyKnockedOut) {
            let actualKnockback = knockback;

            if (this.currentWorldType === 'DETENTION') {
              this.detentionSpawnGraceTimer = 0;
              npc.setAlertState('ALERT');
              npc.isChasing = true;
              this.detentionAlertTimer = 15.0;
              this.detentionAlertCount++;

              if (npc.role === 'DETENTION_BOSS') {
                if (npc.isBossInvulnerable || npc.bossInvulnerableTimer > 0) {
                  this.wantedSystem.showBanner(`🛡️ 總教官處於受創金鐘護盾無敵中 (${npc.bossInvulnerableTimer.toFixed(1)}s)！免疫傷害！`, 1500);
                  soundManager.playPunch();
                  this.player.setAttackCooldown(0.5);
                  break;
                }
                if (!npc.isBossStunned) {
                  this.wantedSystem.showBanner('🛡️ 總教官正面持盾防禦！正面攻擊無效！需誘使撞柱硬直破盾！', 2500);
                  soundManager.playPunch();
                  this.player.setAttackCooldown(0.5);
                  break;
                }
              }

              // 判定是否為正面攻擊 (玩家處於守衛前方 240 度視角內)
              const guardFwdX = Math.sin(npc.rotationY);
              const guardFwdZ = Math.cos(npc.rotationY);
              const toPlayerX = this.player.position.x - npc.position.x;
              const toPlayerZ = this.player.position.z - npc.position.z;
              const dist = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);
              const dot = dist > 0.001 ? guardFwdX * (toPlayerX / dist) + guardFwdZ * (toPlayerZ / dist) : 1;

              // 當正面攻擊巡邏守衛時 (dot >= -0.15，非背後盲區)：技能間隔 0.5 秒且擊退效果減半
              if (dot >= -0.15) {
                actualKnockback = knockback * 0.5;
                this.player.setAttackCooldown(0.5);
                this.wantedSystem.showBanner('🛡️ 正面衝擊守備防禦！技能間隔 0.5s，擊退力減半！', 1600);
              }
            }

            const wasKnocked = npc.launchFlying(_scratchPlayerForward, actualKnockback, damage);
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

    // 滑鼠左鍵鬆開：投籃出手 (電腦版，僅天天國中)
    this.input.onAttackRelease(() => {
      if (!this.isGameRunning) return;
      if (this.currentWorldType === 'CAMPUS' && this.basketballGame.isHolding && this.basketballGame.isChargingShot) {
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
      if (!this.isGameRunning) return;
      if (e.code === 'Digit1') {
        this.player.setWeapon('FIST');
        this.wantedSystem.showBanner(
          this.currentWorldType === 'DETENTION'
            ? '🥊 切換模式：徒手潛入 (支援背後暗殺)'
            : '🥊 切換武器：徒手拳擊 (ATK 25)',
          1500
        );
      } else if (e.code === 'Digit2') {
        if (this.player.hasNormalBat) {
          this.player.setWeapon('NORMAL_BAT');
          this.wantedSystem.showBanner(
            this.currentWorldType === 'DETENTION'
              ? '🏏 切換裝備：特訓防暴警棍 (ATK 55)'
              : '🏏 切換武器：普通木質棒球棍 (ATK 55)',
            1500
          );
        } else {
          this.wantedSystem.showBanner(
            this.currentWorldType === 'DETENTION'
              ? '🔒 防暴警棍未配發！完成特訓即可獲取裝備！'
              : `🔒 普通球棒未解鎖！需擊敗 5 位普通同學 (目前進度: ${this.studentDefeatedCount}/5)`,
            2500
          );
        }
      } else if (e.code === 'Digit3') {
        if (this.player.hasSpecialBat) {
          this.player.setWeapon('SPECIAL_BAT');
          this.wantedSystem.showBanner(
            this.currentWorldType === 'DETENTION'
              ? '⚡ 切換神兵：黃金雷霆防暴棍 (ATK 120)'
              : '⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)',
            1500
          );
        } else {
          this.wantedSystem.showBanner(
            this.currentWorldType === 'DETENTION'
              ? '⚠️ 特訓院管制區：重型管制武器已遭沒收封存！'
              : `🔒 特殊棒球棍未解鎖！需擊敗生教(1)、校犬(1)、火柴人自行車騎士(5) (目前: 教${this.teacherDefeatedCount}/1 犬${this.dogDefeatedCount}/1 車${this.bikePatrolDefeatedCount}/5)`,
            2500
          );
        }
      } else if (e.code === 'KeyJ') {
        this.hud.toggleQuestTracker();
      } else if (e.code === 'KeyP') {
        this.weatherSystem.cycleWeather(true);
      } else if (e.code === 'Escape') {
        if (this.hud.isFullMapOpen) {
          this.hud.closeFullMap();
        }
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
      this.player.performBearShake(this.activeColliders);
    } else {
      this.player.performFlashStep(this.activeColliders);
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
    this.tennisGame.startMatch(this.hud, peCoach, this.engine.scene, this.player, this.cameraCtrl);
  }

  // 潛行背後暗殺擊昏 / 刺客教條草堆伏擊
  private performCqcTakedown() {
    if (!this.nearbyCqcTarget || this.nearbyCqcTarget.isKnockedDown || this.player.isDead) return;
    const target = this.nearbyCqcTarget;
    const isFromHiding = this.player.isHidingInCover;
    const coverName = this.player.currentHidingSpotName || '草堆';

    // 嚴格暗殺判定：若已被敵人發現 (! 警戒狀態)，完全無法發動暗殺！
    if (target.alertState === 'ALERT') {
      const isStunnedBoss = (target.role === 'DETENTION_BOSS' && target.isBossStunned && !target.isBossInvulnerable && target.bossInvulnerableTimer <= 0);
      if (!isStunnedBoss) {
        this.wantedSystem.showBanner('⚠️ 敵人已發現你 (! 狀態)！無法發動暗殺！需脫離視線或誘敵硬直！', 2000);
        return;
      }
    }

    if (target.role === 'DETENTION_BOSS') {
      if (target.isBossInvulnerable || target.bossInvulnerableTimer > 0) {
        this.wantedSystem.showBanner(`🛡️ 總教官處於金鐘護盾無敵中 (${target.bossInvulnerableTimer.toFixed(1)}s)！免疫暗殺與傷害！`, 1800);
        return;
      }

      this.player.attack();

      const isFinalBlow = (target.hp - 100) <= 0;
      const bulletDuration = isFinalBlow ? 1.5 : 0.95;
      const bulletScale = isFinalBlow ? 0.08 : 0.16;

      this.bulletTimeTimer = bulletDuration;
      this.bulletTimeDuration = bulletDuration;
      this.bulletTimeScale = bulletScale;

      soundManager.playCinematicExecutionHit();
      this.cameraCtrl.triggerCinematicExecution(target.position, this.player.position, bulletDuration, isFinalBlow, this.activeColliders);

      // 受創向外踉蹌微推
      _scratchImpactDir.subVectors(target.position, this.player.position).setY(0);
      if (_scratchImpactDir.lengthSq() < 0.01) _scratchImpactDir.set(0, 0, 1);
      else _scratchImpactDir.normalize();
      target.position.addScaledVector(_scratchImpactDir, 0.45);
      target.mesh.position.copy(target.position);

      // 總教官背後暗殺 / 刺客草堆伏擊破盾 (每次精確造成 100 傷害，300 HP 需暗殺 3 次才能擊破)：
      target.isBossStunned = false;
      target.bossStunTimer = 0;
      target.applyAssassinationDamage(100);

      const qteTitle = isFinalBlow
        ? (isFromHiding ? '🗡️【刺客教條·草堆終結】' : '🗡️【刺客教條·終極處決】')
        : (isFromHiding ? '🗡️【刺客教條·掩體突襲】' : '⚡【弱點破甲暴擊】');

      const qteSub = isFinalBlow
        ? '徹底擊潰特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！'
        : `破除防暴護甲！造成 100 重傷！(剩餘 HP: ${target.hp}/300，總教官倒地癱瘓 2 秒！)`;

      this.hud.triggerCinematicExecution(qteTitle, qteSub, bulletDuration);

      if (target.hp <= 0) {
        target.knockoutSilently();
        this.isDetentionBossDefeated = true;
        this.detentionTakedownCount++;
        this.detentionWorld.spawnMasterKeycard(target.position);
        this.wantedSystem.showBanner(
          isFromHiding
            ? `🗡️【刺客教條·掩體致命突襲】一擊終結特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！`
            : '🏆 狂賀！第三次終極暗殺擊破特訓總教官！掉落【萬能逃脫鑰匙卡】！快前往南大門！',
          5000
        );
        soundManager.playSchoolBell();
      } else {
        // 暗殺 BOSS 後，BOSS 倒地癱瘓 2 秒不能動
        target.knockdownBoss(2.0);

        this.wantedSystem.showBanner(
          isFromHiding
            ? `🗡️【掩體突襲重創】造成 100 傷害！(剩餘 HP: ${target.hp}/300) 總教官倒地癱瘓 2 秒！`
            : `⚡【破甲重創】造成 100 傷害！(剩餘 HP: ${target.hp}/300) 總教官倒地癱瘓 2 秒！`,
          3000
        );
      }

      // 暗殺動畫播畢後玩家朝遠離 BOSS 方向後跳/跳離 4 個身位（約 4.8~5.2m），落地時面向 BOSS
      this.bossJumpDelayTimer = bulletDuration;
      this.bossJumpTargetPos.copy(target.position);

      this.nearbyCqcTarget = null;
      this.hud.updateCqcPrompt(false);
      return;
    }

    target.knockoutSilently();
    this.detentionTakedownCount++;
    soundManager.playPunch();
    if (isFromHiding) {
      this.wantedSystem.showBanner(`🗡️【刺客教條·掩體暗殺】將 ${target.getRoleTitle()} 拖入${coverName}無聲刺殺！無人察覺！`, 2500);
    } else {
      this.wantedSystem.showBanner(`🥷 潛行擊昏！(無聲排除 ${target.getRoleTitle()}，永久昏迷)`, 2000);
    }
    this.nearbyCqcTarget = null;
    this.hud.updateCqcPrompt(false);
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
    } else if (npc.role === 'DETENTION_SENIOR') {
      reward = 100;
      this.wantedSystem.showBanner('💪 擊敗【特訓資深學長】！獲得切磋犒賞 +$100！', 3000);
    } else if (npc.role === 'DETENTION_WOLF') {
      reward = 120;
      this.wantedSystem.showBanner('🐺 擊退【特訓狼犬】！獲得特訓賞金 +$120！', 3000);
    } else if (npc.role === 'DETENTION_GUARD') {
      reward = 150;
      this.wantedSystem.showBanner('🛡️ 突破【防暴特訓教官】防線！獲得高額賞金 +$150！', 3500);
    } else if (npc.role === 'DETENTION_HEAVY') {
      reward = 200;
      this.wantedSystem.showBanner('🏋️ 破除【重訓霸榜生】霸體！獲得重裝巨額犒賞 +$200！', 4000);
    } else if (npc.role === 'DETENTION_BOSS') {
      reward = 500;
      this.wantedSystem.showBanner('🎖️ 震撼全院！擊倒特訓總長【鐵面總長】！獲得傳奇特訓賞金 +$500！', 6000);
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
    const deathDest = this.currentWorldType === 'CAMPUS' ? '保健室' : `【${this.detentionWorld.currentCheckpointName}】`;
    this.wantedSystem.showBanner(`${reason} 已失去意識送往${deathDest} (3秒後滿血復甦)...`, 4000);
    bgmManager.duckVolume(3.2);

    this.wantedSystem.clearWanted();
    for (const n of this.npcs) {
      n.resetAggro();
    }
    if (this.currentWorldType === 'DETENTION') {
      for (const n of this.detentionNPCs) {
        n.resetToInitialState();
      }
      this.detentionAlertTimer = 0;
      this.detentionAlertCount = 0;
      this.hud.updateMgsAlert(0);
    }

    const respawnPos = this.currentWorldType === 'CAMPUS' ? new THREE.Vector3(0, 0, 15) : this.detentionWorld.spawnPos.clone();

    setTimeout(() => {
      this.player.respawn(respawnPos);
      if (this.currentWorldType === 'DETENTION') {
        this.player.maxHp = 150;
        this.player.hp = 150;
        this.player.hasNormalBat = true;
        this.player.setWeapon('NORMAL_BAT');
        this.detentionSpawnGraceTimer = 5.0;
        for (const n of this.detentionNPCs) {
          n.resetToInitialState();
        }
        this.detentionAlertTimer = 0;
        this.detentionAlertCount = 0;
        this.hud.updateMgsAlert(0);
      }
      this.wantedSystem.clearWanted();
      for (const n of this.npcs) {
        n.resetAggro();
      }
      this.isHandlingDeath = false;
      const recoverMsg = this.currentWorldType === 'CAMPUS'
        ? '已在保健室休養恢復，全校警報全面解除'
        : `🛡️ 已在【${this.detentionWorld.currentCheckpointName}】復甦！獲得 5 秒隱蔽保護，守衛警戒已重置！`;
      this.wantedSystem.showBanner(recoverMsg, 4000);
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
    const skillHudCard = document.getElementById('skill-hud-card');

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
      if (this.currentWorldType === 'CAMPUS' && this.basketballGame.isHolding && this.basketballGame.isChargingShot) {
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

    bindButton(skillHudCard, () => {
      this.triggerDodgeSkill();
    });

    const btnCqc = document.getElementById('btn-cqc-action');
    if (btnCqc) {
      btnCqc.addEventListener('click', (e) => {
        e.stopPropagation();
        this.performCqcTakedown();
      });
      btnCqc.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        this.performCqcTakedown();
      }, { passive: false });
    }
  }

  public cycleWeapon() {
    const isDetention = this.currentWorldType === 'DETENTION';
    const current = this.player.currentWeapon;
    if (current === 'FIST') {
      if (this.player.hasNormalBat) {
        this.player.setWeapon('NORMAL_BAT');
        this.wantedSystem.showBanner(
          isDetention ? '🏏 切換裝備：特訓防暴警棍 (ATK 55)' : '🏏 切換武器：普通木質棒球棍 (ATK 55)',
          1500
        );
      } else if (this.player.hasSpecialBat) {
        this.player.setWeapon('SPECIAL_BAT');
        this.wantedSystem.showBanner(
          isDetention ? '⚡ 切換神兵：黃金雷霆防暴棍 (ATK 120)' : '⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)',
          1500
        );
      } else {
        this.wantedSystem.showBanner(
          isDetention ? '🔒 防暴警棍未配發！完成特訓即可獲取裝備！' : `🥊 目前僅有徒手！擊敗同學解鎖球棒 (${this.studentDefeatedCount}/5)`,
          1500
        );
      }
    } else if (current === 'NORMAL_BAT') {
      if (this.player.hasSpecialBat) {
        this.player.setWeapon('SPECIAL_BAT');
        this.wantedSystem.showBanner(
          isDetention ? '⚡ 切換神兵：黃金雷霆防暴棍 (ATK 120)' : '⚡ 切換神兵：黃金雷霆棒球棍 (ATK 120)',
          1500
        );
      } else {
        this.player.setWeapon('FIST');
        this.wantedSystem.showBanner(
          isDetention ? '🥊 切換模式：徒手潛入 (支援背後暗殺)' : '🥊 切換武器：徒手拳擊 (ATK 25)',
          1500
        );
      }
    } else {
      this.player.setWeapon('FIST');
      this.wantedSystem.showBanner(
        isDetention ? '🥊 切換模式：徒手潛入 (支援背後暗殺)' : '🥊 切換武器：徒手拳擊 (ATK 25)',
        1500
      );
    }
  }

  private resolveCharacterSeparation() {
    const minDistance = 0.85;
    const minDistanceSq = minDistance * minDistance;
    const colliders = this.activeColliders;

    if (!this.player.isRidingVehicle && !this.player.isDead) {
      const playerRadius = 0.35;
      const playerHeight = 1.8;
      const stepHeight = 0.65;

      for (const npc of this.npcs) {
        if (npc.isKnockedDown || npc.isKnockedFlying) continue;

        const dx = npc.position.x - this.player.position.x;
        const dz = npc.position.z - this.player.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDistanceSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const totalOverlap = minDistance - dist;
          const nx = dx / dist;
          const nz = dz / dist;

          // 檢測將玩家推向 (-nx, -nz) 是否會撞牆或嵌進建築/牆角
          const testPlayerX = this.player.position.x - nx * totalOverlap * 0.5;
          const testPlayerZ = this.player.position.z - nz * totalOverlap * 0.5;

          let playerBlockedX = false;
          let playerBlockedZ = false;

          const minX = Math.min(testPlayerX, this.player.position.x) - playerRadius;
          const maxX = Math.max(testPlayerX, this.player.position.x) + playerRadius;
          const minZ = Math.min(testPlayerZ, this.player.position.z) - playerRadius;
          const maxZ = Math.max(testPlayerZ, this.player.position.z) + playerRadius;

          for (let i = 0; i < colliders.length; i++) {
            const box = colliders[i];
            if (box.isFloorOnly) continue;
            // 2D 寬泛包圍盒快速淘汰：跳過 95%+ 遠距離障礙物，大幅節省頂點碰撞計算
            if (box.max.x < minX || box.min.x > maxX || box.max.z < minZ || box.min.z > maxZ) {
              continue;
            }
            if (this.player.position.y + playerHeight > box.min.y && this.player.position.y + stepHeight < box.max.y) {
              if (
                testPlayerX + playerRadius > box.min.x &&
                testPlayerX - playerRadius < box.max.x &&
                this.player.position.z + playerRadius > box.min.z &&
                this.player.position.z - playerRadius < box.max.z
              ) {
                playerBlockedX = true;
              }
              if (
                this.player.position.x + playerRadius > box.min.x &&
                this.player.position.x - playerRadius < box.max.x &&
                testPlayerZ + playerRadius > box.min.z &&
                testPlayerZ - playerRadius < box.max.z
              ) {
                playerBlockedZ = true;
              }
            }
          }

          // 若玩家身後靠牆或身處死角，玩家堅定不移，由 NPC 全額退讓，徹底杜絕被推擠卡進牆體
          const movePlayerX = playerBlockedX ? 0 : -nx * totalOverlap * 0.5;
          const movePlayerZ = playerBlockedZ ? 0 : -nz * totalOverlap * 0.5;

          const moveNpcX = playerBlockedX ? nx * totalOverlap : nx * totalOverlap * 0.5;
          const moveNpcZ = playerBlockedZ ? nz * totalOverlap : nz * totalOverlap * 0.5;

          this.player.position.x += movePlayerX;
          this.player.position.z += movePlayerZ;
          npc.position.x += moveNpcX;
          npc.position.z += moveNpcZ;

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

    const rawDelta = this.engine.getDelta();
    let simDelta = rawDelta;
    if (this.bulletTimeTimer > 0) {
      this.bulletTimeTimer -= rawDelta;
      const progress = Math.max(0, this.bulletTimeTimer / this.bulletTimeDuration);
      // 特寫打擊慢動作平滑曲線：前期強烈時間膨脹，末期順滑恢復標準時間
      const currentScale = THREE.MathUtils.lerp(1.0, this.bulletTimeScale, Math.pow(progress, 0.7));
      simDelta = rawDelta * currentScale;
    }
    const delta = simDelta;

    // 暗殺動畫播畢後玩家朝遠離 BOSS 方向後跳/跳離 4 個身位（約 4.8~5.2m），落地時面向 BOSS
    if (this.bossJumpDelayTimer > 0) {
      this.bossJumpDelayTimer -= rawDelta;
      if (this.bossJumpDelayTimer <= 0) {
        this.bossJumpDelayTimer = 0;
        this.player.leapAwayFrom(this.bossJumpTargetPos, this.activeColliders, 5.0);
        this.cameraCtrl.resetBehind(this.player.position, this.player.rotationY);
      }
    }

    // -1. 少年院開場電影級劇情動畫更新與 Space 跳過
    if (this.detentionCutscene && this.detentionCutscene.isActive) {
      if (this.input.jump) {
        this.detentionCutscene.skip();
      } else {
        this.detentionCutscene.update(delta);
        this.weatherSystem.update(delta, this.cameraCtrl.camera.position);
        this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
        return;
      }
    }

    // -0.5 主畫面/世界選單狀態：尚未進入遊戲時僅渲染背景天氣，嚴禁背景運算與操控天天國中
    if (!this.isGameRunning) {
      this.weatherSystem.update(delta, this.cameraCtrl.camera.position);
      this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
      return;
    }

    // 0. 電梯過場動畫與自動走出 (僅限天天國中)
    if (this.currentWorldType === 'CAMPUS' && this.elevatorTransition) {
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
          this.player.equipBadmintonRacket(false);
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
      this.currentRidingBike.update(delta, this.input, this.activeColliders);
      targetPosition = this.currentRidingBike.position;
      playerRotY = this.currentRidingBike.rotationY;
      this.player.position.copy(targetPosition);
      this.player.updateSkillBubble(delta);
      this.player.updateUmbrella(isRaining, true, this.currentWorldType);

      // 更新非騎乘中之所有單車 (套用重力與貼地，防止懸空)
      if (this.currentWorldType === 'CAMPUS') {
        for (let i = 0; i < this.bicycles.length; i++) {
          const bike = this.bicycles[i];
          if (bike !== this.currentRidingBike) {
            bike.update(delta, this.input, this.activeColliders);
          }
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
      if (this.currentWorldType === 'CAMPUS') {
        for (let i = 0; i < this.bicycles.length; i++) {
          this.bicycles[i].update(delta, this.input, this.activeColliders);
        }
      }

      if (this.elevatorTransition) {
        targetPosition = this.player.position;
        playerRotY = this.player.rotationY;
      } else {
        const inPool = this.currentWorldType === 'CAMPUS' && (this.world.isInsideSwimmingPool(this.player.position) || this.ecologicalGarden.isInsideWishingPond(this.player.position));
        this.player.isSwimming = inPool;
        if (inPool) {
          const inPond = this.ecologicalGarden.isInsideWishingPond(this.player.position);
          this.player.swimSurfaceY = inPond ? 0.32 : 0.25;
          this.player.swimBottomY = -1.1; // 許願池與泳池皆為深水 (池底以下被地坪遮蔽，呈現身體沒入水中)
        }

        this.player.update(delta, this.input, forwardVec, rightVec, this.activeColliders, isRaining, false, this.currentWorldType);
        targetPosition = this.player.position;
        playerRotY = this.player.rotationY;
      }

      // 游泳水花特效與持球瞄準 (僅天天國中)
      if (this.currentWorldType === 'CAMPUS') {
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
    }

    // 3. 模組小遊戲更新 (僅天天國中)
    if (this.currentWorldType === 'CAMPUS') {
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
    }

    // 6. 更新互動提示
    if (this.currentWorldType === 'DETENTION') {
      if (!this.hasKeycardA && targetPosition.distanceTo(this.detentionWorld.keycardAPos) < 3.0) {
        this.hud.showPrompt('E', '💳 拾取【藍色門禁卡 A】(開啟管制閘門 1)');
      } else if (!this.hasKeycardB && targetPosition.distanceTo(this.detentionWorld.keycardBPos) < 3.0) {
        this.hud.showPrompt('E', '💳 拾取【黃色門禁卡 B】(開啟管制閘門 2)');
      } else if (this.detentionWorld.masterKeycardPos && !this.hasMasterKeycard && targetPosition.distanceTo(this.detentionWorld.masterKeycardPos) < 3.0) {
        this.hud.showPrompt('E', '🔑 拾取【萬能逃脫鑰匙卡】(開啟南側大門)');
      } else if (!this.detentionWorld.isGateAOpen && targetPosition.distanceTo(this.detentionWorld.gateAPos) < 4.0) {
        this.hud.showPrompt('E', this.hasKeycardA ? '🔓 刷卡開啟【管制閘門 1】' : '🔒 管制閘門 1 (需要藍色門禁卡 A)');
      } else if (!this.detentionWorld.isGateBOpen && targetPosition.distanceTo(this.detentionWorld.gateBPos) < 4.0) {
        this.hud.showPrompt('E', this.hasKeycardB ? '🔓 刷卡開啟【管制閘門 2】' : '🔒 管制閘門 2 (需要黃色門禁卡 B)');
      } else if (!this.detentionWorld.isSouthGateOpen && targetPosition.distanceTo(this.detentionWorld.southGateConsolePos) < 4.5) {
        this.hud.showPrompt('E', this.hasMasterKeycard ? '🚪 刷卡解鎖【南側絕境逃脫大門】！' : '🔒 終極防暴大門 (需要萬能逃脫鑰匙卡)');
      } else if (targetPosition.distanceTo(this.detentionWorld.commissaryPos) < 4.2) {
        this.hud.showPrompt('E', '🏪 特訓小賣部 (購買體能與急救補給品)');
      } else if (targetPosition.distanceTo(this.detentionWorld.pullupStationPos) < 3.0) {
        this.hud.showPrompt('E', '💪 引體向上特訓 (恢復精力)');
      } else if (targetPosition.distanceTo(this.detentionWorld.benchpressStationPos) < 3.0) {
        this.hud.showPrompt('E', '🏋️ 鐵血大重量臥推 (恢復體力)');
      } else if (targetPosition.distanceTo(this.detentionWorld.tireStationPos) < 3.5) {
        this.hud.showPrompt('E', '🛞 翻滾巨型重裝輪胎 (解鎖狂暴極速衝刺)');
      } else {
        this.hud.hidePrompt();
      }
    } else {
      const peCoach = this.npcs.find(n => n.role === 'PE_TEACHER_BOSS');
      const dodgeTeacher = this.npcs.find(n => n.role === 'DODGE_TEACHER');
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
    }

    // 6.5 刺客教條草堆匿蹤檢測 與 少年院動態探照燈掃視警戒
    if (this.currentWorldType === 'DETENTION') {
      let inHidingSpot = false;
      let hidingSpotName = '';
      for (let i = 0; i < this.detentionWorld.hidingSpots.length; i++) {
        const spot = this.detentionWorld.hidingSpots[i];
        if (targetPosition.distanceTo(spot.position) < spot.radius) {
          inHidingSpot = true;
          hidingSpotName = spot.name;
          break;
        }
      }
      this.player.isHidingInCover = inHidingSpot;
      this.player.currentHidingSpotName = hidingSpotName;
      this.hud.updateStealthHiding(inHidingSpot, hidingSpotName);

      this.detentionWorld.updateKeycards(delta);
      const slState = this.detentionWorld.update(delta, targetPosition, inHidingSpot);
      if (slState.isDetectedBySearchlight) {
        this.searchlightAlertTimer += delta;
        if (this.searchlightAlertTimer >= 0.25) {
          if (this.detentionAlertTimer <= 0) {
            this.detentionAlertCount++;
            soundManager.playAlert();
            soundManager.playWhistle();
          }
          this.detentionAlertTimer = 18.0; // 觸發 18 秒 MGS 警戒倒數
          if (this.wantedSystem.stars < 2) {
            this.wantedSystem.reportCrime(2, '探照燈高空鎖定！發布緊急圍剿警報！');
          }
          this.wantedSystem.showBanner('🚨 探照燈高空鎖定！已發布全場警報，守衛部隊全面包夾追捕！', 1000);

          // 核心機制：被探照燈照到時，吸引附近 NPC 聚集並主動攻擊！
          // 半徑 65m 內所有少年院 NPC（教官、狼犬、學長、霸榜生、總長）全力往玩家位置衝刺聚集追捕
          for (const n of this.detentionNPCs) {
            if (!n.isKnockedDown && !n.isPermanentlyKnockedOut) {
              const d = n.position.distanceTo(targetPosition);
              if (d < 65.0) {
                if (n.isPaused) n.cancelPause();
                n.setAlertState('ALERT');
                n.isChasing = true;
                n.isBurstSprinting = true;
                n.lostSightTimer = 0;
                n.lastKnownPos.copy(targetPosition);
              }
            }
          }
        }
      } else {
        this.searchlightAlertTimer = Math.max(0, this.searchlightAlertTimer - delta * 2.0);
      }

      // MGS 警戒倒數計時器
      if (this.detentionAlertTimer > 0) {
        this.detentionAlertTimer -= delta;
        if (this.detentionAlertTimer <= 0) {
          this.detentionAlertTimer = 0;
          this.wantedSystem.showBanner('🌿 警戒解除，守衛恢復常態巡邏。', 2500);
          for (const n of this.detentionNPCs) {
            if (!n.isKnockedDown && !n.isPermanentlyKnockedOut) {
              n.setAlertState('NORMAL');
              n.isChasing = false;
            }
          }
        }
      }
      this.hud.updateMgsAlert(this.detentionAlertTimer);

      // 背後暗殺擊昏判定 與 刺客教條草堆暗殺判定
      this.nearbyCqcTarget = null;
      if (!this.player.isDead) {
        for (const npc of this.detentionNPCs) {
          if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;

          // 1. 若被 NPC 發現 (! 警戒狀態)，完全無法發動暗殺！
          if (npc.alertState === 'ALERT') {
            // 特殊破綻特例：總教官撞柱陷入重度眩暈硬直中 (isBossStunned) 且非無敵狀態除外
            const isStunnedBoss = (npc.role === 'DETENTION_BOSS' && npc.isBossStunned && !npc.isBossInvulnerable && npc.bossInvulnerableTimer <= 0);
            if (!isStunnedBoss) {
              continue;
            }
          }

          // 2. 總教官被暗殺後 3 秒金鐘護盾無敵期：無法被鎖定或暗殺 (防止連點擊殺)
          if (npc.role === 'DETENTION_BOSS' && (npc.isBossInvulnerable || npc.bossInvulnerableTimer > 0)) {
            continue;
          }

          const dist = npc.position.distanceTo(targetPosition);

          if (this.player.isHidingInCover) {
            // 刺客教條草堆暗殺：未發現玩家時，只要守衛經過草堆 3.0m 內，任意角度均可直接伏擊拖入刺殺！
            if (dist <= 3.0) {
              this.nearbyCqcTarget = npc;
              break;
            }
          } else {
            // 正常潛行背刺：判定是否在身後盲區 (背後約 162 度視錐)
            if (dist <= 2.3) {
              const guardFwdX = Math.sin(npc.rotationY);
              const guardFwdZ = Math.cos(npc.rotationY);
              const toPlayerX = (targetPosition.x - npc.position.x) / dist;
              const toPlayerZ = (targetPosition.z - npc.position.z) / dist;
              const dot = guardFwdX * toPlayerX + guardFwdZ * toPlayerZ;

              // 每個未發現玩家的 NPC (或總教官撞柱眩暈時) 均可在背後空檔觸發暗殺擊昏
              if (dot < -0.15 || (npc.role === 'DETENTION_BOSS' && npc.isBossStunned)) {
                this.nearbyCqcTarget = npc;
                break;
              }
            }
          }
        }
      }
      if (this.nearbyCqcTarget && !this.nearbyCqcTarget.isKnockedDown && !this.nearbyCqcTarget.isPermanentlyKnockedOut) {
        // 暗殺/擊昏提示：出現在 NPC 頭頂上方 (只需顯示「擊暈」)
        const overheadOffset = (this.nearbyCqcTarget.role === 'DOG' || this.nearbyCqcTarget.role === 'DETENTION_WOLF') ? 1.30 : 2.45;
        _scratchCqcScreenPos.copy(this.nearbyCqcTarget.position);
        _scratchCqcScreenPos.y += overheadOffset;
        _scratchCqcScreenPos.project(this.cameraCtrl.camera);

        if (_scratchCqcScreenPos.z < 1.0) {
          const screenX = (_scratchCqcScreenPos.x * 0.5 + 0.5) * window.innerWidth;
          const screenY = (-_scratchCqcScreenPos.y * 0.5 + 0.5) * window.innerHeight;
          this.hud.updateCqcPrompt(true, screenX, screenY);
        } else {
          this.hud.updateCqcPrompt(false);
        }
      } else {
        this.hud.updateCqcPrompt(false);
      }
    } else {
      this.player.isHidingInCover = false;
      this.hud.updateStealthHiding(false);
      this.hud.updateCqcPrompt(false);
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

    // 7.8 少年院出生 5 秒保護計時
    let isSpawnGraceActive = false;
    if (this.currentWorldType === 'DETENTION' && this.detentionSpawnGraceTimer > 0) {
      this.detentionSpawnGraceTimer -= delta;
      isSpawnGraceActive = true;
      if (this.detentionSpawnGraceTimer <= 0) {
        this.detentionSpawnGraceTimer = 0;
        this.wantedSystem.showBanner('⚡ 5 秒隱蔽保護結束！特訓院守衛已恢復正常巡邏警戒！', 3000);
      }
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
        this.activeColliders,
        () => {
          this.wantedSystem.markSpotted();
        },
        isPlayerRidingBike,
        this.player.isDead,
        isRaining,
        isThunderstorm,
        isSpawnGraceActive,
        this.player.isSneaking,
        this.player.isSprinting,
        this.player.isHidingInCover
      );

      if (!npc.isKnockedDown && !npc.isPermanentlyKnockedOut && npc.isChasing) {
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
      if (npc.isKnockedDown || npc.isPermanentlyKnockedOut) continue;

      // 總教官狂暴衝撞命中玩家判定
      if (npc.role === 'DETENTION_BOSS' && npc.bossIsCharging && !this.player.isDead) {
        const distToPlayer = npc.position.distanceTo(targetPosition);
        if (distToPlayer <= 2.2) {
          if (this.player.isDodging) {
            this.wantedSystem.showBanner(this.dodgeSkillLevel === 2 ? '🐻 狗熊哆嗦毛！極限閃避總教官狂暴衝撞！' : '💨 閃身步！極限側閃避開總教官衝撞！', 1800);
            soundManager.playDodge(this.dodgeSkillLevel === 2);
          } else {
            npc.bossIsCharging = false;
            npc.pauseTimer = 1.0;
            npc.isPaused = true;
            if (npc.bossTelegraphGroup) npc.bossTelegraphGroup.visible = false;
            soundManager.playPunch();
            soundManager.playBatHit();
            this.wantedSystem.showBanner('💥 遭到總教官狂暴衝撞重創！擊飛！(-30 HP)', 2500);
            this.wantedSystem.notifyAttacked();
            const justDied = this.player.launchFlying(npc.bossChargeDir, 16.0, 7.0, 30, '鐵面總教官');
            if (justDied) {
              this.handlePlayerDeath('被鐵面總教官狂暴衝撞擊潰！');
            }
          }
        }
      }

      // 總教官危險預警與眩暈狀態提示
      if (npc.role === 'DETENTION_BOSS') {
        if (npc.isBossWindingUp && !this.wasBossWindingUp) {
          this.wasBossWindingUp = true;
          this.wantedSystem.showBanner('⚠️【危險警報】鐵面總教官鎖定衝撞軌跡！立即側向閃避或引導撞柱！', 2200);
        } else if (!npc.isBossWindingUp) {
          this.wasBossWindingUp = false;
        }

        if (npc.isBossStunned && !this.wasBossStunned) {
          this.wasBossStunned = true;
          this.wantedSystem.showBanner('⚡ 總教官猛烈撞擊加固水泥柱！陷入 3.5 秒重度眩暈！快繞後刺殺！', 2500);
        } else if (!npc.isBossStunned) {
          this.wasBossStunned = false;
        }
      }

      if (npc.isBossWindingUp || npc.bossIsCharging || npc.isBossStunned) continue;

      const distToPlayer = npc.position.distanceTo(targetPosition);
      const attackDist = (this.currentWorldType === 'DETENTION') ? 2.0 : Math.max(1.8, npc.attackRange);

      // 兩個世界皆僅在追捕狀態 (通緝或被激怒) 且進入攻擊距離時發動攻擊，第一世界 NPC 不會無故主動攻擊
      const shouldAttack = !isSpawnGraceActive && npc.isChasing && distToPlayer <= attackDist;

      if (shouldAttack && !this.player.isDead && npc.attackCooldown <= 0) {
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

    // 11. 更新攝影機 (使用 rawDelta 維持 60fps 絲滑運鏡與慢動作特寫)
    // 羽球比賽倒數與進行中切換轉播視角，結束/中止後自動回復一般跟隨
    this.cameraCtrl.isMatchView = this.tennisGame.tennisState === 'STARTING' || this.tennisGame.tennisState === 'PLAYING';
    this.cameraCtrl.update(targetPosition, rawDelta, this.activeColliders);

    // 12. 更新生態探索園區 (僅限天天國中)
    if (this.currentWorldType === 'CAMPUS') {
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
    }

    // 14. Boss 血條動態顯示
    if (this.currentWorldType === 'CAMPUS') {
      const distToPlantBoss = targetPosition.distanceTo(this.ecologicalGarden.boss.position);
      if (distToPlantBoss < 35.0 && !this.ecologicalGarden.boss.isDead) {
        this.hud.setBossHealth(this.ecologicalGarden.boss.hp, this.ecologicalGarden.boss.maxHp, true, '秘境霸主：變異食人花王', '🌸');
      } else {
        this.hud.setBossHealth(0, 1000, false);
      }
    } else {
      const wardenBoss = this.detentionNPCs.find(n => n.role === 'DETENTION_BOSS');
      if (wardenBoss && targetPosition.distanceTo(wardenBoss.position) < 38.0 && !wardenBoss.isKnockedDown) {
        this.hud.setBossHealth(wardenBoss.hp, wardenBoss.maxHp, true, '總教官 Boss：鐵面總長', '🎖️');
      } else {
        this.hud.setBossHealth(0, 1000, false);
      }
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

    if (this.currentWorldType === 'DETENTION') {
      if (
        this.detentionWorld.isSouthGateOpen &&
        targetPosition.z >= 95.0 &&
        !this.isDetentionEscapeComplete
      ) {
        this.isDetentionEscapeComplete = true;
        const totalTime = (performance.now() - this.detentionEscapeStartTime) / 1000;
        this.hud.showDetentionVictory(
          totalTime,
          this.detentionTakedownCount,
          this.detentionAlertCount,
          () => {
            this.switchWorld('DETENTION', true);
          },
          () => {
            // 通關後回主畫面：重新載入頁面完整重置所有世界狀態，避免第二世界進度混入天天國中
            window.location.reload();
          }
        );
      }
    }

    if (this.currentWorldType === 'CAMPUS') {
      const peCoach = this.campusNPCs.find(n => n.role === 'PE_TEACHER_BOSS');
      const tracker = this.cachedMissionTrackerData;
      tracker.studentDefeated = this.studentDefeatedCount;
      tracker.hasNormalBat = this.player.hasNormalBat;
      tracker.teacherDefeated = this.teacherDefeatedCount;
      tracker.dogDefeated = this.dogDefeatedCount;
      tracker.bikeDefeated = this.bikePatrolDefeatedCount;
      tracker.inspectorDefeated = this.inspectorDefeatedCount;
      tracker.hasSpecialBat = this.player.hasSpecialBat;
      tracker.plantBossDefeated = this.ecologicalGarden.boss.isDead;
      tracker.peBossDefeated = this.tennisGame.coachDefeated || (peCoach ? peCoach.hp <= 0 : false);
      tracker.trackRecordText = this.racingGame.bestTrackTime ? `${this.racingGame.bestTrackTime.toFixed(1)}s` : '未完成';
      tracker.swimRecordText = this.racingGame.bestSwimTime ? `${this.racingGame.bestSwimTime.toFixed(1)}s` : '未完成';
      tracker.basketballStreak = this.basketballGame.scoreStreak;
      tracker.basketballRecord = this.basketballGame.bestStreak;
      tracker.hasRiddenBike = this.hasRiddenBike;
      tracker.hasEscapedDog = this.hasEscapedDog;
      tracker.hasWishedPond = this.hasWishedPond;
      tracker.hasTastedHotFood = this.hasTastedHotFood;
      tracker.dodgeSkillLevel = this.dodgeSkillLevel;
      this.hud.updateMissionTracker(tracker);
    } else {
      const wardenBoss = this.detentionNPCs.find(n => n.role === 'DETENTION_BOSS');
      this.hud.updateWorld2EscapeTracker(
        this.detentionTakedownCount,
        this.detentionWorld.isGateAOpen,
        this.detentionWorld.isGateBOpen,
        wardenBoss ? wardenBoss.hp : 0,
        wardenBoss ? wardenBoss.maxHp : 300,
        this.isDetentionBossDefeated,
        this.isDetentionEscapeComplete
      );
    }

    let detentionRadarData: DetentionRadarData | undefined;
    if (this.currentWorldType === 'DETENTION') {
      let radarAlert: 'NORMAL' | 'CAUTION' | 'ALERT' = 'NORMAL';
      if (this.detentionAlertTimer > 0 || isAnyChasing) {
        radarAlert = 'ALERT';
      } else {
        const hasCaution = this.detentionNPCs.some(n => n.alertState === 'CAUTION');
        if (hasCaution) radarAlert = 'CAUTION';
      }

      const radar = this.cachedDetentionRadarData;
      radar.isGateAOpen = this.detentionWorld.isGateAOpen;
      radar.isGateBOpen = this.detentionWorld.isGateBOpen;
      radar.isSouthGateOpen = this.detentionWorld.isSouthGateOpen;
      radar.hasKeycardA = this.hasKeycardA;
      radar.hasKeycardB = this.hasKeycardB;
      radar.hasMasterKeycard = this.hasMasterKeycard;
      radar.keycardAPos = this.detentionWorld.keycardAPos;
      radar.keycardBPos = this.detentionWorld.keycardBPos;
      radar.masterKeycardPos = this.detentionWorld.masterKeycardPos;
      radar.alertLevel = radarAlert;
      radar.alertTimer = this.detentionAlertTimer;
      radar.checkpointPos = this.detentionWorld.currentCheckpointPos;
      radar.checkpointName = this.detentionWorld.currentCheckpointName;
      detentionRadarData = radar;
    }

    this.hud.update(
      targetPosition,
      playerRotY,
      this.player.hp,
      this.player.stamina,
      this.npcs,
      this.bicycles,
      isBeingChased,
      dangerAlert,
      delta,
      this.currentWorldType,
      detentionRadarData
    );

    // 15.5 更新校園動態天氣系統 (雨滴粒子、雷鳴閃電與光照平滑漸變)
    this.weatherSystem.update(rawDelta, targetPosition);

    // 16. 渲染畫面
    this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
  };
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  new SchoolGTASandbox();
});
