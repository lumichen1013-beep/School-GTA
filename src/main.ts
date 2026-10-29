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
import { HUD, DetentionRadarData } from './ui/HUD';
import { soundManager } from './audio/SoundEffects';
import { bgmManager } from './audio/BGMManager';
import { EcologicalGarden } from './world/EcologicalGarden';
import { WaterSplashVFX } from './effects/WaterSplashVFX';
import { BasketballGame } from './systems/BasketballGame';
import { RacingGame } from './systems/RacingGame';
import { TennisGame } from './systems/TennisGame';
import { WeatherSystem } from './systems/WeatherSystem';
import { ColliderGrid } from './physics/ColliderGrid';
import { StartScreen } from './ui/StartScreen';
import { setupFullscreenButton } from './input/Fullscreen';
import { setupMobileControls } from './input/MobileControls';
import type { GameContext, WorldType } from './game/GameContext';
import { Progression } from './game/Progression';
import { DetentionMode } from './game/DetentionMode';
import { CampusMode } from './game/CampusMode';
import { CombatSystem } from './game/CombatSystem';
import { InteractionSystem } from './game/InteractionSystem';

const nextFrame = () => new Promise(r => requestAnimationFrame(r));

// 精力環投影用暫存向量 (避免每幀配置)
const _scratchStaminaAnchor = new THREE.Vector3();
const _campusRespawnPos = new THREE.Vector3(0, 0, 15); // 天天國中保健室復活點

/**
 * 主程式：建置引擎與兩個世界、組裝各子系統，並調度每幀更新順序。
 * 各玩法細節分別位於 game/ (成長、戰鬥、互動、校園玩法、特訓院玩法)。
 */
class SchoolGTASandbox implements GameContext {
  public engine!: Engine;
  public input!: InputManager;
  public cameraCtrl!: ThirdPersonCamera;
  public world!: CampusWorld;
  public detentionWorld!: DetentionWorld;
  private detentionCutscene!: DetentionCutscene;
  public ecologicalGarden!: EcologicalGarden;
  public player!: Player;
  public waterSplashVFX!: WaterSplashVFX;
  public wantedSystem!: WantedSystem;
  public hud!: HUD;
  public weatherSystem!: WeatherSystem;
  public basketballGame!: BasketballGame;
  public racingGame!: RacingGame;
  public tennisGame!: TennisGame;

  public currentWorldType: WorldType = 'CAMPUS';
  // 特訓院配發的防暴棒沿用普通球棒槽位：進入特訓院前記下校園的球棒解鎖狀態，返回校園時還原
  private campusHasNormalBat: boolean = false;
  public bicycles: Bicycle[] = [];
  public currentRidingBike: Bicycle | null = null;
  public npcs: NPC[] = [];
  public campusNPCs: NPC[] = [];
  public detentionNPCs: NPC[] = [];
  // 固定角色 NPC 快取 (NPC 名單於載入後不再增減，免去每幀 find 線性搜尋)
  public peCoachNpc?: NPC;
  public dodgeTeacherNpc?: NPC;
  private campusDogNpc?: NPC;
  private wardenBossNpc?: NPC;

  // 玩法子系統 (只於呼叫時透過 GameContext 取用共用物件，故可於欄位初始化時建立)
  public readonly progression: Progression = new Progression(this);
  public readonly detention: DetentionMode = new DetentionMode(this);
  public readonly campus: CampusMode = new CampusMode(this);
  public readonly combat: CombatSystem = new CombatSystem(this);
  private readonly interaction = new InteractionSystem(this);

  private isGameRunning: boolean = false;
  private isHandlingDeath: boolean = false;
  // NPC 追捕狀態 (每幀於 NPC 更新時寫入)
  private isAnyChasing: boolean = false;
  private isHighDanger: boolean = false;

  private readonly onNpcSpottedPlayer = () => {
    this.wantedSystem.markSpotted();
  };

  private readonly startScreen = new StartScreen({
    onStartGesture: () => {
      this.input.requestPointerLock();
      bgmManager.start();
    },
    onStart: (targetWorld) => {
      this.isGameRunning = true;
      this.switchWorld(targetWorld, targetWorld === 'CAMPUS');
    },
    onSkipCutscene: () => {
      if (this.detentionCutscene.isActive) {
        this.detentionCutscene.skip();
      }
    }
  });

  public get activeColliders(): CollidableBox[] {
    return this.currentWorldType === 'CAMPUS' ? this.world.colliders : this.detentionWorld.colliders;
  }

  constructor() {
    void this.init();
  }

  private async init() {
    const progress = (percent: number, text: string) => this.startScreen.updateProgress(percent, text);
    progress(0, '正在初始化遊戲核心資源...');
    await nextFrame();

    // 階段 0 (5%)：初始化 3D 圖形與音訊引擎核心
    progress(5, '正在啟動 3D 圖形與音訊引擎核心...');
    this.engine = new Engine();
    this.input = new InputManager(this.engine.canvas);
    this.cameraCtrl = new ThirdPersonCamera(65, window.innerWidth / window.innerHeight, 0.1, 350);
    await nextFrame();

    // 階段 1 (25%)：建置 3D 校園地圖、教學大樓、泳池與跑道
    progress(25, '正在建置 3D 校園地圖、教學大樓、泳池與跑道...');
    this.world = new CampusWorld(this.engine.scene);
    await nextFrame();

    // 階段 2 (45%)：建置自然生態探索區與變異食人花 Boss
    progress(45, '正在建置自然生態探索區與變異食人花 Boss...');
    this.ecologicalGarden = new EcologicalGarden(this.engine.scene);
    this.world.colliders.push(...this.ecologicalGarden.colliders);
    await nextFrame();

    // 階段 2.5 (55%)：建置第二世界【少年院】與開場劇情動畫系統
    progress(55, '正在建置第二世界【少年院】與開場劇情動畫系統...');
    this.detentionWorld = new DetentionWorld(this.engine.scene);
    this.detentionCutscene = new DetentionCutscene(this.engine.scene);
    this.detentionCutscene.onSubtitleChange = (sub) => {
      const subEl = document.getElementById('cutscene-subtitle-text');
      if (subEl) subEl.textContent = sub;
    };
    this.detentionCutscene.onComplete = () => {
      const cutsceneOverlay = document.getElementById('cutscene-overlay');
      if (cutsceneOverlay) cutsceneOverlay.style.display = 'none';
      this.weatherSystem.setWeather('SUNNY', true, false);
      this.detention.startEscape();
      this.wantedSystem.showBanner('🛡️【特訓院潛入開始】5 秒內守衛暫不發動攻擊！配備特訓防暴棒，體能提升至 150 HP！', 4500);
      this.hud.showCenterPrompt('前往中央警衛室取得門禁卡 A');
    };
    await nextFrame();

    // 階段 3 (65%)：生成主角模型、火柴人自行車與水花特效系統
    progress(65, '正在生成主角模型、火柴人自行車與水花特效系統...');
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
    await nextFrame();

    // 階段 4 (80%)：生成校園師生、主任教官、校犬柴柴、少年院教官與鐵面總長
    progress(80, '正在生成校園師生、主任教官、校犬柴柴、少年院教官與鐵面總長...');
    this.campusNPCs = createCampusNPCs(this.engine.scene);
    this.detentionNPCs = createDetentionNPCs(this.engine.scene);
    this.npcs = this.campusNPCs;
    this.setActiveWorldScene('CAMPUS');
    this.peCoachNpc = this.campusNPCs.find(n => n.role === 'PE_TEACHER_BOSS');
    this.dodgeTeacherNpc = this.campusNPCs.find(n => n.role === 'DODGE_TEACHER');
    this.campusDogNpc = this.campusNPCs.find(n => n.role === 'DOG');
    this.wardenBossNpc = this.detentionNPCs.find(n => n.role === 'DETENTION_BOSS');
    this.wantedSystem = new WantedSystem();
    this.wantedSystem.onWantedCleared = () => {
      for (const n of this.npcs) {
        n.resetAggro();
      }
    };
    this.hud = new HUD();
    this.hud.onRequestPointerLock = () => this.input.requestPointerLock();
    this.hud.onWorldToggle = () => {
      this.hud.openWorldModal(this.currentWorldType, (tw) => this.switchWorld(tw));
    };
    this.input.onToggleWorld(() => {
      this.hud.openWorldModal(this.currentWorldType, (tw) => this.switchWorld(tw));
    });
    await nextFrame();

    // 階段 5 (92%)：初始化三分球、競速賽道、4F羽球館與電影劇院
    progress(92, '正在初始化三分球、競速賽道、4F羽球館與電影劇院...');
    this.basketballGame = new BasketballGame(this.engine.scene, this.world.basketballSpawnPos);
    this.racingGame = new RacingGame(this.engine.scene);
    this.tennisGame = new TennisGame();

    // 初始化校園動態天氣系統 (五大天氣、平滑過渡、雨滴粒子與程序化聲光)
    this.weatherSystem = new WeatherSystem(this.engine);
    this.weatherSystem.onWeatherChange = (preset, isManual) => {
      this.hud.updateWeatherHUD(preset.badgeText);
      if (isManual) {
        const text = this.currentWorldType === 'DETENTION' ? preset.detentionBannerText : preset.bannerText;
        this.wantedSystem.showBanner(`${text} (按 [P] 鍵切換)`, 2500);
      }
    };
    this.hud.onWeatherToggle = () => {
      this.weatherSystem.cycleWeather(true);
    };
    this.hud.updateWeatherHUD(this.weatherSystem.getCurrentPreset().badgeText);

    // 綁定按鍵互動與操作
    this.setupInputBindings();
    setupMobileControls(this.input, {
      onAttackRelease: this.releaseBasketballShot,
      onCycleWeapon: this.progression.cycleWeapon,
      onDodge: this.progression.triggerDodgeSkill
    });
    // 視窗縮放/翻轉事件統一由 Engine 監聽，這裡只負責同步鏡頭比例 (updateAspect 內含投影矩陣更新)
    this.engine.onResizeCallback = (_w, _h, aspect) => {
      this.cameraCtrl.updateAspect(aspect);
    };
    this.engine.handleResize();
    setupFullscreenButton();

    // 綁定背景音樂 (BGM)
    this.hud.setupBGMClick(() => this.toggleBGM());
    this.input.onToggleBGM(() => this.toggleBGM());
    bgmManager.onModeChange = (mode, isMuted) => {
      this.hud.updateBGMStatus(mode, isMuted);
    };
    await nextFrame();

    // 階段 6 (100%)：著色器預熱與首幀渲染準備就緒
    progress(98, '正在預熱著色器與首幀圖形編譯...');
    this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
    await nextFrame();

    this.startScreen.markLoaded();
    // 啟動遊戲主迴圈
    this.tick();
  }

  // 只將當前世界的場景群組與 NPC 掛在 scene 上：另一世界整個移出場景圖，
  // 避免 three.js 每幀仍走訪並更新隱藏世界數千個節點的矩陣 (visible=false 不會略過矩陣更新)
  private setActiveWorldScene(world: WorldType) {
    const scene = this.engine.scene;
    const isCampus = world === 'CAMPUS';
    // 預先建置該世界碰撞盒的空間網格，避免首次查詢時於遊戲幀內建置
    ColliderGrid.of(isCampus ? this.world.colliders : this.detentionWorld.colliders);
    const attach = (obj: THREE.Object3D, active: boolean) => {
      if (active) {
        obj.visible = true;
        if (obj.parent !== scene) scene.add(obj);
      } else if (obj.parent === scene) {
        scene.remove(obj);
      }
    };
    attach(this.world.group, isCampus);
    attach(this.ecologicalGarden.group, isCampus);
    attach(this.detentionWorld.group, !isCampus);
    for (const npc of this.campusNPCs) attach(npc.mesh, isCampus);
    for (const npc of this.detentionNPCs) attach(npc.mesh, !isCampus);
  }

  public switchWorld(targetWorld: WorldType, skipCutscene: boolean = false) {
    this.forceDismount();

    this.wantedSystem.clearWanted(); // onWantedCleared 會一併重置所有 NPC 仇恨
    this.campus.resetTransientState();
    this.combat.resetTransientState();
    // 進入世界時展開快捷鍵指南，30 秒後自動收合
    this.hud.showControlsGuide();

    const previousWorld = this.currentWorldType;
    this.currentWorldType = targetWorld;
    this.input.joystickSneakEnabled = targetWorld === 'DETENTION';
    this.cameraCtrl.currentWorld = targetWorld;
    this.wantedSystem.currentWorld = targetWorld;
    this.weatherSystem.currentWorld = targetWorld;
    this.hud.setBGMWorld(targetWorld);
    if (targetWorld === 'DETENTION' && previousWorld === 'CAMPUS') {
      this.campusHasNormalBat = this.player.hasNormalBat;
    }
    this.player.equipBadmintonRacket(false);
    if (this.tennisGame.tennisState !== 'IDLE') {
      this.tennisGame.resetMatch(this.engine.scene, this.player);
    }
    const cutsceneOverlay = document.getElementById('cutscene-overlay');

    if (targetWorld === 'CAMPUS') {
      if (this.detentionCutscene.isActive) {
        this.detentionCutscene.skip();
      }
      if (cutsceneOverlay) cutsceneOverlay.style.display = 'none';

      // 離開特訓院時收起 MGS 警戒列 (避免警戒中切換世界殘留於校園畫面)
      this.hud.updateMgsAlert('NORMAL', 0);

      // 回歸天天國中：重設生命值上限為 100
      this.player.maxHp = 100;
      this.player.hp = Math.min(this.player.hp, 100);
      // 交回特訓院防暴棒：還原校園的球棒解鎖狀態，避免跳過【名揚校園】任務
      if (previousWorld === 'DETENTION') {
        this.player.hasNormalBat = this.campusHasNormalBat;
        if (this.player.currentWeapon === 'NORMAL_BAT' && !this.player.hasNormalBat) {
          this.player.setWeapon('FIST');
        }
      }

      this.setActiveWorldScene('CAMPUS');

      // 恢復天天國中專屬三分球籃球實體與單車
      this.basketballGame.basketballMesh.visible = true;
      for (const b of this.bicycles) {
        b.mesh.visible = true;
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
      return;
    }

    // 少年院
    this.setActiveWorldScene('DETENTION');

    // 徹底隱藏天天國中特有小遊戲實體 (杜絕籃球、競速光圈、羽球殘留於第二世界)
    if (this.basketballGame.isHolding) {
      this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
    }
    this.basketballGame.basketballMesh.visible = false;
    this.racingGame.abortAll();

    for (const b of this.bicycles) {
      b.mesh.visible = false;
    }
    this.npcs = this.detentionNPCs;

    // 潛龍諜影特訓院越獄模式：赤手空拳潛入
    this.player.maxHp = 100;
    this.player.hp = 100;
    this.player.setWeapon('FIST');

    this.hud.updateWorldHUD('⛓️ 特訓院 (潛入越獄)');
    this.detention.reset();

    if (!skipCutscene) {
      if (cutsceneOverlay) cutsceneOverlay.style.display = 'flex';
      this.weatherSystem.setWeather('THUNDERSTORM', false, false);
      this.detentionCutscene.start(this.cameraCtrl, this.player);
    } else {
      if (cutsceneOverlay) cutsceneOverlay.style.display = 'none';
      this.weatherSystem.setWeather('SUNNY', false, false);
      // 與開場結束相同：開局面向東方 (A 區長廊)，鏡頭置於身後
      this.player.position.copy(this.detentionWorld.spawnPos);
      this.player.velocity.set(0, 0, 0);
      this.player.rotationY = Math.PI / 2;
      this.player.mesh.rotation.set(0, Math.PI / 2, 0);
      this.cameraCtrl.resetBehind(this.player.position, Math.PI / 2 + Math.PI);
      // 略過開場 (重新挑戰)：與開場結束相同，配發 150 HP 與防暴棒並從此刻開始計時
      this.detention.startEscape();
      this.wantedSystem.showBanner('🥷 已潛入【第七特訓院】！按住滑鼠右鍵（手機搖桿推桿 90% 內）靜音慢步，從背後靠近守衛進行【暗殺擊昏】！', 5000);
      this.hud.showCenterPrompt('前往中央警衛室取得門禁卡 A');
    }
  }

  // 下車並恢復步行鏡頭
  public forceDismount() {
    if (!this.currentRidingBike) return;
    this.currentRidingBike.dismount(this.player, this.engine.scene);
    this.currentRidingBike = null;
    this.player.isRidingVehicle = false;
    this.cameraCtrl.setMode(false);
  }

  public startTennisMatch() {
    if (this.basketballGame.isHolding) {
      this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
    }
    this.tennisGame.startMatch(this.hud, this.peCoachNpc, this.engine.scene, this.player, this.cameraCtrl);
    // 對話時已釋放滑鼠鎖定：開賽 (點擊開始或按 E) 時重新鎖定，賽後不需再點一次畫面才能轉動視角
    this.input.requestPointerLock();
  }

  // 投籃出手 (滑鼠左鍵鬆開 / 手機攻擊鍵放開，僅天天國中)
  private readonly releaseBasketballShot = () => {
    if (!this.isGameRunning) return;
    if (this.currentWorldType === 'CAMPUS' && this.basketballGame.isHolding && this.basketballGame.isChargingShot) {
      this.basketballGame.releaseShot(this.player, this.cameraCtrl.camera, this.hud, this.world.hoopTargets);
    }
  };

  private setupInputBindings() {
    // E 鍵互動：依互動表優先順序執行 (與每幀互動提示共用同一張表)
    this.input.onInteract(() => {
      if (!this.isGameRunning) return;
      this.interaction.interact();
    });

    // 滑鼠左鍵：投籃蓄力 / 單車鳴鈴 / 背後暗殺 / 揮動武器攻擊
    this.input.onAttack(() => {
      if (!this.isGameRunning) return;
      this.combat.onAttack();
    });
    this.input.onAttackRelease(this.releaseBasketballShot);

    // 鍵盤按鍵監聽：數字鍵 1/2/3 武器切換、J 大地圖任務、K 快捷鍵指南、P 天氣、ESC/Enter 對話框、R 重置籃球
    window.addEventListener('keydown', (e) => {
      if (!this.isGameRunning || e.repeat) return;
      const hud = this.hud;
      if (e.code === 'Digit1') {
        this.progression.selectWeaponSlot(1);
      } else if (e.code === 'Digit2') {
        this.progression.selectWeaponSlot(2);
      } else if (e.code === 'Digit3') {
        this.progression.selectWeaponSlot(3);
      } else if (e.code === 'KeyJ') {
        hud.toggleQuestTracker();
      } else if (e.code === 'KeyK') {
        hud.toggleControlsGuide();
      } else if (e.code === 'KeyP') {
        this.weatherSystem.cycleWeather(true);
      } else if (e.code === 'Escape') {
        if (hud.isFullMapOpen) hud.closeFullMap();
        if (hud.isCommissaryOpen) hud.closeCommissary();
        if (hud.isTennisDialogOpen) hud.closeTennisDialog();
        if (hud.isDodgeDialogOpen) hud.closeDodgeDialog();
      } else if (e.code === 'Enter') {
        if (hud.isTennisDialogOpen) this.startTennisMatch();
        if (hud.isDodgeDialogOpen) hud.confirmDodgeLearn();
      } else if (e.code === 'KeyR') {
        if (!this.basketballGame.isHolding && !this.basketballGame.isBallInAir &&
          this.player.position.distanceTo(this.world.basketballSpawnPos) < 40) {
          this.basketballGame.resetBall(this.wantedSystem);
        }
      }
    });

    // Q 鍵身法技能
    this.input.onSkill(this.progression.triggerDodgeSkill);
  }

  private toggleBGM() {
    const isMuted = bgmManager.toggleMute();
    if (isMuted) {
      this.wantedSystem.showBanner('🔇 背景音樂 (BGM) 已靜音', 2000);
    } else {
      const isDetention = this.currentWorldType === 'DETENTION';
      const modeText = bgmManager.getMode() === 'PURSUIT'
        ? (isDetention ? '警戒追捕熱血節奏' : '通緝逃亡熱血節奏')
        : (isDetention ? '暗夜潛入緊張旋律' : '校園漫步放鬆旋律');
      this.wantedSystem.showBanner(`🎵 背景音樂 (BGM) 已開啟【${modeText}】`, 2500);
    }
  }

  public handlePlayerDeath(reason: string) {
    if (this.isHandlingDeath) return;
    this.isHandlingDeath = true;

    this.forceDismount();
    if (this.basketballGame.isHolding) {
      this.basketballGame.drop(this.player, this.hud, this.wantedSystem);
    }

    this.hud.hidePrompt();
    this.waterSplashVFX.reset();
    const isCampus = this.currentWorldType === 'CAMPUS';
    const deathDest = isCampus ? '保健室' : `【${this.detentionWorld.currentCheckpointName}】`;
    this.wantedSystem.showBanner(`${reason} 已失去意識送往${deathDest} (3秒後滿血復甦)...`, 4000);
    bgmManager.duckVolume(3.2);

    this.wantedSystem.clearWanted();
    if (!isCampus) {
      this.detention.resetGuards();
    }

    setTimeout(() => {
      // 復活點於復活當下依所在世界計算 (死亡 3 秒內切換世界時避免在另一世界的座標重生)
      const respawnPos = this.currentWorldType === 'CAMPUS' ? _campusRespawnPos : this.detentionWorld.spawnPos;
      this.player.respawn(respawnPos);
      if (this.currentWorldType === 'DETENTION') {
        this.detention.applyLoadout();
        this.detention.spawnGraceTimer = 5.0;
        this.detention.resetGuards();
      }
      this.wantedSystem.clearWanted();
      this.isHandlingDeath = false;
      const recoverMsg = this.currentWorldType === 'CAMPUS'
        ? '已在保健室休養恢復，全校警報全面解除'
        : `🛡️ 已在【${this.detentionWorld.currentCheckpointName}】復甦！獲得 5 秒隱蔽保護，守衛警戒已重置！`;
      this.wantedSystem.showBanner(recoverMsg, 4000);
    }, 3000);
  }

  // 中毒狀態計時與持續扣血
  private updatePoison(delta: number) {
    const player = this.player;
    if (player.poisonTimer <= 0) {
      this.hud.setPoisonActive(false);
      return;
    }
    player.poisonTimer -= delta;
    this.hud.setPoisonActive(true);
    player.poisonTickTimer += delta;
    if (player.poisonTickTimer >= 1.0) {
      player.poisonTickTimer -= 1.0;
      const died = player.takeDamage(3, '劇毒侵蝕');
      soundManager.playPoisonTick();
      if (died) {
        this.handlePlayerDeath('體內毒素過深昏迷！');
      }
    }
    if (player.poisonTimer <= 0) {
      player.poisonTimer = 0;
      this.hud.setPoisonActive(false);
      this.wantedSystem.showBanner('✨ 體內毒素消散，中毒狀態解除！', 3000);
    }
  }

  // NPC AI 更新並統計追捕狀態 (寫入 isAnyChasing / isHighDanger)
  private updateNpcs(delta: number, targetPosition: THREE.Vector3, isRaining: boolean, isThunderstorm: boolean, isSpawnGraceActive: boolean) {
    const isCampus = this.currentWorldType === 'CAMPUS';
    const isPlayerRidingBike = this.currentRidingBike !== null;
    const colliders = this.activeColliders;
    this.isAnyChasing = false;
    this.isHighDanger = false;
    // 被搶單車數量超過上限 (含玩家下車後閒置者) 時回收最舊的路邊單車
    if (isCampus) this.campus.enforceStolenBikeCap();
    NPC.updateSharedEffects(delta);

    for (const npc of this.npcs) {
      if (isCampus) this.campus.updateBikeOwner(npc, targetPosition);

      npc.update(
        delta,
        targetPosition,
        this.wantedSystem.stars,
        colliders,
        this.onNpcSpottedPlayer,
        isPlayerRidingBike,
        this.player.isDead,
        isRaining,
        isThunderstorm,
        isSpawnGraceActive,
        this.player.isSneaking,
        this.player.isSprinting,
        this.player.isHidingInCover,
        this.player.isMoving
      );

      if (!npc.isKnockedDown && !npc.isPermanentlyKnockedOut && npc.isChasing) {
        this.isAnyChasing = true;
        if (npc.isBurstSprinting || npc.position.distanceTo(targetPosition) < 8.0) {
          this.isHighDanger = true;
        }
      }
    }
  }

  private tick = () => {
    requestAnimationFrame(this.tick);

    const rawDelta = this.engine.getDelta();
    const delta = this.combat.scaleDelta(rawDelta);
    this.combat.updateBossLeap(rawDelta);

    // -1. 少年院開場電影級劇情動畫更新與 Space 跳過
    if (this.detentionCutscene.isActive) {
      if (this.input.jump) {
        this.detentionCutscene.skip();
        this.input.consumeJump();
      } else {
        this.detentionCutscene.update(delta);
        this.weatherSystem.update(delta, this.cameraCtrl.camera.position);
        this.engine.updateShadowFocus(this.player.position);
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

    const isCampus = this.currentWorldType === 'CAMPUS';
    const colliders = this.activeColliders;

    // 0. 電梯過場動畫與自動走出 (僅限天天國中)
    if (isCampus) this.campus.updateElevator(delta);

    // 1. 滑鼠視角旋轉 (手機騎車時鏡頭自動跟隨車頭，忽略觸控滑動視角，僅需搖桿即可騎乘)
    const mouseDelta = this.input.consumeMouseDelta();
    this.cameraCtrl.isVehicleFollow = !!this.currentRidingBike && this.input.isTouchDevice;
    this.cameraCtrl.updateRotation(mouseDelta.x, mouseDelta.y);

    const forwardVec = this.cameraCtrl.getForwardVector();
    const rightVec = this.cameraCtrl.getRightVector();

    let targetPosition: THREE.Vector3;
    let playerRotY: number;

    const isRaining = this.weatherSystem.currentWeather === 'RAIN' || this.weatherSystem.currentWeather === 'THUNDERSTORM';
    const isThunderstorm = this.weatherSystem.currentWeather === 'THUNDERSTORM';

    // 2. 玩家或載具狀態更新
    const ridingBike = this.currentRidingBike;
    if (ridingBike) {
      this.progression.hasRiddenBike = true;
      ridingBike.update(delta, this.input, colliders);
      targetPosition = ridingBike.position;
      playerRotY = ridingBike.rotationY;
      if (this.cameraCtrl.isVehicleFollow) {
        this.cameraCtrl.followHeading(playerRotY, delta);
      }
      this.player.position.copy(targetPosition);
      this.player.updateSkillBubble(delta);
      this.player.updateUmbrella(isRaining, true, this.currentWorldType);

      // 更新非騎乘中之所有單車 (套用重力與貼地，防止懸空)
      if (isCampus) {
        for (let i = 0; i < this.bicycles.length; i++) {
          const bike = this.bicycles[i];
          if (bike !== ridingBike) bike.update(delta, this.input, colliders);
        }
      }

      // 火柴人自行車衝撞 NPC
      this.combat.updateBikeRam(targetPosition, playerRotY);
    } else {
      // 玩家步行時，更新場景中所有閒置單車 (套用重力與貼地，防止懸空)
      if (isCampus) {
        for (let i = 0; i < this.bicycles.length; i++) {
          this.bicycles[i].update(delta, this.input, colliders);
        }
      }

      if (isCampus && this.campus.elevatorTransition) {
        targetPosition = this.player.position;
        playerRotY = this.player.rotationY;
      } else {
        if (isCampus) {
          this.campus.updateSwimState();
        } else {
          this.player.isSwimming = false;
        }
        this.player.update(delta, this.input, forwardVec, rightVec, colliders, isRaining, false, this.currentWorldType);
        targetPosition = this.player.position;
        playerRotY = this.player.rotationY;
      }

      // 游泳水花特效與持球瞄準 (僅天天國中)
      if (isCampus) {
        const aimRotY = this.campus.updateSwimSplashAndAim(delta);
        if (aimRotY !== null) playerRotY = aimRotY;
      }
    }

    // 3. 模組小遊戲更新 (僅天天國中)
    if (isCampus) this.campus.updateMinigames(delta, targetPosition);

    // 6. 更新互動提示
    this.interaction.updatePrompt(targetPosition);

    // 6.5 刺客教條草堆匿蹤檢測 與 少年院動態探照燈掃視警戒
    if (isCampus) {
      this.player.isHidingInCover = false;
      this.hud.updateStealthHiding(false);
      this.hud.updateCqcPrompt(false);
    } else {
      this.detention.update(delta, targetPosition, this.wardenBossNpc);
    }

    this.campus.updateBroadcastCooldown(delta);

    // 7. 中毒狀態計時
    this.updatePoison(delta);

    // 7.8 少年院出生 5 秒保護計時
    const isSpawnGraceActive = !isCampus && this.detention.updateSpawnGrace(delta);

    // 8. NPC AI 更新
    this.updateNpcs(delta, targetPosition, isRaining, isThunderstorm, isSpawnGraceActive);
    // 8.1 少年院全域警戒階段：依本幀守衛實際目擊結果推進 (須在 NPC AI 更新之後)
    if (!isCampus) this.detention.updateAlertPhase(delta, targetPosition);

    // 校犬脫逃判定
    if (isCampus) this.campus.updateDogEscape(this.campusDogNpc, targetPosition);

    // NPC 攻擊玩家判定
    this.combat.updateNpcAttacks(targetPosition, isSpawnGraceActive);

    // 9. 角色推擠排除
    this.combat.resolveCharacterSeparation();

    // 10. 更新通緝星級系統
    this.wantedSystem.update(delta, this.isAnyChasing);

    // 11. 更新攝影機 (使用 rawDelta 維持 60fps 絲滑運鏡與慢動作特寫)
    // 羽球比賽倒數與進行中切換轉播視角，結束/中止後自動回復一般跟隨
    this.cameraCtrl.isMatchView = this.tennisGame.tennisState === 'STARTING' || this.tennisGame.tennisState === 'PLAYING';
    this.cameraCtrl.update(targetPosition, rawDelta, colliders);

    // 12~14. 生態探索園區、游泳水花微粒與 Boss 血條
    if (isCampus) {
      this.campus.updateGardenAndEffects(delta, targetPosition);
    } else {
      const wardenBoss = this.wardenBossNpc;
      if (wardenBoss && targetPosition.distanceTo(wardenBoss.position) < 38.0 && !wardenBoss.isKnockedDown) {
        this.hud.setBossHealth(wardenBoss.hp, wardenBoss.maxHp, true, '總教官 Boss：鐵面總長', '🎖️');
      } else {
        this.hud.setBossHealth(0, 1000, false);
      }
    }

    // 15. 更新 HUD 介面與任務看板
    const isBeingChased = !this.player.isDead && (this.isAnyChasing || this.wantedSystem.stars > 0);
    const dangerAlert = this.isHighDanger || this.wantedSystem.stars >= 4;
    bgmManager.setPursuitMode(isBeingChased, dangerAlert);

    this.hud.setCash(this.progression.cash);
    this.progression.updateSkillCooldown(delta);

    let detentionRadarData: DetentionRadarData | undefined;
    if (isCampus) {
      this.campus.updateMissionTracker();
    } else {
      this.detention.checkEscapeVictory(targetPosition);
      this.detention.updateEscapeTracker(this.wardenBossNpc);
      detentionRadarData = this.detention.getRadarData();
    }

    this.hud.update(
      targetPosition,
      playerRotY,
      (this.player.hp / this.player.maxHp) * 100, // 雷達外圈 HP 弧以上限百分比顯示 (第二世界上限 150)
      (this.player.stamina / this.player.maxStamina) * 100, // 精力環以上限百分比顯示
      this.npcs,
      this.bicycles,
      isBeingChased,
      dangerAlert,
      delta,
      this.currentWorldType,
      detentionRadarData
    );

    // 15.1 精力環：投影角色肩部至螢幕，過場/大地圖/騎車/死亡/隱形時隱藏
    const p = this.player;
    let staminaAllowed = !p.isDead && !p.isRidingVehicle && !p.isInvisible && !this.hud.isFullMapOpen && !this.detentionCutscene.isActive;
    let staminaX = 0;
    let staminaY = 0;
    if (staminaAllowed) {
      // 錨點取角色右側 0.75m、肩部高度 (世界座標)，遠近皆保持在身體旁而不壓到肩膀
      _scratchStaminaAnchor.copy(targetPosition).addScaledVector(this.cameraCtrl.getRightVector(), 0.75);
      _scratchStaminaAnchor.y += 1.3;
      _scratchStaminaAnchor.project(this.cameraCtrl.camera);
      if (_scratchStaminaAnchor.z > 1) {
        staminaAllowed = false; // 角色位於鏡頭後方
      } else {
        staminaX = (_scratchStaminaAnchor.x * 0.5 + 0.5) * window.innerWidth;
        staminaY = (-_scratchStaminaAnchor.y * 0.5 + 0.5) * window.innerHeight;
      }
    }
    this.hud.updateStaminaRing(staminaX, staminaY, staminaAllowed, rawDelta);

    // 15.5 更新校園動態天氣系統 (雨滴粒子、雷鳴閃電與光照平滑漸變)
    this.weatherSystem.update(rawDelta, targetPosition);

    // 16. 渲染畫面 (陽光陰影跟隨玩家)
    this.engine.updateShadowFocus(targetPosition);
    this.engine.renderer.render(this.engine.scene, this.cameraCtrl.camera);
  };
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  new SchoolGTASandbox();
});
