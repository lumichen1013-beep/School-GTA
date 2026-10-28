import * as THREE from 'three';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { soundManager } from '../audio/SoundEffects';
import { INITIAL_SPAWN } from './DetentionWorld';

// ==========================================================
// 開場場景佈局：A 區牢房大樓 (Z: -75 ~ -45) 北側入監空地，玩家開局點 (-55, -84) 即在此處
// 專車沿北側高牆 (Z: -94.6) 內緣車道 (Z: -94 ~ -90 全區無障礙) 由東向西駛入，
// 左側滑門朝南面向牢房大樓；總長與教官由西側走來迎接，最後押送主角至開局點，無縫銜接遊戲
// ==========================================================
const VAN_Z = -92.3;              // 車道中線 (車身 Z: -93.7 ~ -90.9，與北牆、Z=-90 隔牆端點皆保有間距)
const VAN_START_X = 8;            // 分鏡 1 起點 (東側車道)
const VAN_CRUISE_END_X = -38;     // 分鏡 1 終點 (等速約 11.5 m/s)
const VAN_STOP_X = -55.8;         // 停車點：滑門門洞中心 (車身本地 lz = 0.8) 正對開局點 X = -55
const VAN_HEADING = Math.PI / 2;  // 車頭朝 -X；左側 (本地 -X) 滑門朝南 (+Z)
const DOOR_LZ = 0.8;              // 滑門門洞中心 (車身本地 Z)
const DOOR_CLOSED_X = -1.45;
const DOOR_OPEN_X = -1.62;        // 滑門外推量
const DOOR_OPEN_Z = -0.75;        // 滑門向車頭方向滑開後位置
const PLAYER_EXIT_START_LX = -1.15; // 主角於門洞內車廂起步 (車身本地 X)
const PLAYER_EXIT_END_LX = -3.7;    // 踏出車門後站定 (世界 Z ≈ -88.6，與車身側緣保持 ≥2m)

const SPAWN_X = INITIAL_SPAWN.x;  // 開局點 (-55, -84)
const SPAWN_Z = INITIAL_SPAWN.z;
const SPAWN_ROT = Math.PI / 2;    // 開局面向東方 (+X)：沿收容車道前往中央警衛室取門禁卡

const WARDEN_START_X = -68;       // 迎接隊伍由西側瞭望塔方向走來 (避開塔柱 X: -80.9 ~ -75.1)
const WARDEN_END_X = -55;
const WARDEN_Z = -85.4;           // 總長站定於主角南方約 3.2m
const GUARD_BACK = 1.4;           // 教官隨行於總長後方 (西側) 兩翼
const GUARD_SIDE = 0.9;
const WARDEN_EXIT_X = -51;        // 押送分鏡：總長轉身領路往東南 (避開 X: -46 隔牆與 Z: -79 矮櫃)
const WARDEN_EXIT_Z = -80.6;
const ESCORT_SIDE = 1.5;          // 押送時教官於主角左右兩側

// 分鏡時間軸 (秒)
const T_SHOT2 = 4.0;   // 專車減速停車
const T_SHOT3 = 7.0;   // 開門下車
const T_SHOT4 = 10.5;  // 總長率教官前來
const T_SHOT5 = 15.0;  // 押送至牢房區開局點
const T_END = 18.0;

// 過場期間隱藏遊戲 HUD (雷達、任務、快捷鍵指南、手機操控)，結束時還原
const CUTSCENE_HIDDEN_UI = ['hud-overlay', 'mobile-controls-container'];
const setGameUiHidden = (hidden: boolean) => {
  if (typeof document === 'undefined') return;
  for (const id of CUTSCENE_HIDDEN_UI) {
    const el = document.getElementById(id);
    if (el) el.style.visibility = hidden ? 'hidden' : '';
  }
};

const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

export class DetentionCutscene {
  public scene: THREE.Scene;
  public isActive: boolean = false;
  public timer: number = 0;
  public readonly totalDuration: number = T_END;

  private playerRef?: Player;
  private cameraCtrlRef?: ThirdPersonCamera;
  private cutsceneGroup: THREE.Group = new THREE.Group();

  // 特訓押送專車
  private vanGroup: THREE.Group = new THREE.Group();
  private vanWheels: THREE.Mesh[] = [];
  private vanDoor?: THREE.Group; // 左側滑門 (先外推再向車頭方向滑開，露出車廂門洞)
  private lastVanX: number = 0;
  private vanStrobeLight?: THREE.PointLight;

  // 過場演員：沿用遊戲內特訓院 NPC 外觀 (完整四肢與走路動作)，不加入 NPC 清單、不跑 AI
  private warden!: NPC;
  private guards: NPC[] = [];
  private whistlePlayed = false;
  private brakePlayed = false;

  // 暫存向量 (0-GC)
  private _camPos = new THREE.Vector3();
  private _camTarget = new THREE.Vector3();
  private _tmp = new THREE.Vector3();
  private _shot4Cam = new THREE.Vector3();
  private _shot4Target = new THREE.Vector3();
  private _finalCam = new THREE.Vector3();
  private _finalTarget = new THREE.Vector3();

  // 回呼函式
  public onComplete?: () => void;
  public onSubtitleChange?: (text: string) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.cutsceneGroup);
    this.buildVanModel();
    this.buildActors();
    this.cutsceneGroup.visible = false;
  }

  // 構建特訓押送專車 3D 模型 (左側滑門版本：門洞朝車身本地 -X)
  private buildVanModel() {
    this.vanGroup = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3d4e61 });
    const addBodyPart = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = bodyMat) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      part.position.set(x, y, z);
      this.vanGroup.add(part);
    };
    // 1. 車身主體 (長 7.2m、寬 2.8m)；左側車身挖出滑門門洞 (Z: 0.1 ~ 1.5, Y: 0.5 ~ 2.35)
    addBodyPart(2.3, 2.2, 7.2, 0.25, 1.6, 0);        // 車廂主體 (X: -0.9 ~ 1.4)
    addBodyPart(0.5, 2.2, 3.7, -1.15, 1.6, -1.75);   // 左側車壁 (門洞前段)
    addBodyPart(0.5, 2.2, 2.1, -1.15, 1.6, 2.55);    // 左側車壁 (門洞後段)
    addBodyPart(0.5, 0.35, 1.4, -1.15, 2.525, DOOR_LZ); // 門洞上方門楣

    // 門洞內側昏暗車廂 (避免開門後看見中空車殼)
    const interiorMat = new THREE.MeshLambertMaterial({ color: 0x0d1117 });
    addBodyPart(0.02, 1.85, 1.4, -0.91, 1.425, DOOR_LZ, interiorMat);
    addBodyPart(0.5, 0.04, 1.4, -1.15, 0.52, DOOR_LZ, interiorMat);
    addBodyPart(0.5, 0.04, 1.4, -1.15, 2.33, DOOR_LZ, interiorMat);

    // 門框深色飾條與防滑踏板
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1f2a36 });
    addBodyPart(0.04, 1.9, 0.08, -1.41, 1.425, 0.06, frameMat);
    addBodyPart(0.04, 1.9, 0.08, -1.41, 1.425, 1.54, frameMat);
    addBodyPart(0.04, 0.08, 1.56, -1.41, 2.39, DOOR_LZ, frameMat);
    addBodyPart(0.35, 0.08, 1.6, -1.55, 0.35, DOOR_LZ, new THREE.MeshLambertMaterial({ color: 0x222222 }));

    // 2. 駕駛艙車頭
    const vanNose = new THREE.Mesh(new THREE.BoxGeometry(2.78, 1.4, 1.8), new THREE.MeshLambertMaterial({ color: 0x2e3d4f }));
    vanNose.position.set(0, 1.1, -4.0);
    this.vanGroup.add(vanNose);

    // 3. 前擋風玻璃
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x81ecec, transparent: true, opacity: 0.75 });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 0.1), glassMat);
    windshield.rotation.x = 0.35;
    windshield.position.set(0, 1.95, -3.2);
    this.vanGroup.add(windshield);

    // 4. 車側防暴窗 (左側中段為滑門門洞，不設窗)
    for (let z = -1.5; z <= 2.5; z += 1.8) {
      const winR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 1.2), glassMat);
      winR.position.set(1.41, 1.85, z);
      this.vanGroup.add(winR);
      if (Math.abs(z - 0.3) > 0.01) {
        const winL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 1.2), glassMat);
        winL.position.set(-1.41, 1.85, z);
        this.vanGroup.add(winL);
      }
    }

    // 5. 黃黑警示保險桿
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.6, 0.3), new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
    bumper.position.set(0, 0.7, -4.9);
    this.vanGroup.add(bumper);

    // 6. 左側滑動車門 (分鏡 3 先外推再向車頭方向滑開；車頭方向無車輪，不會穿模)
    this.vanDoor = new THREE.Group();
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.85, 1.42), new THREE.MeshLambertMaterial({ color: 0x4a607a }));
    const doorWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.9), glassMat);
    doorWin.position.set(0, 0.45, 0);
    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.25), frameMat);
    doorHandle.position.set(-0.06, 0.0, -0.45);
    this.vanDoor.add(doorPanel, doorWin, doorHandle);
    this.vanDoor.position.set(DOOR_CLOSED_X, 1.425, DOOR_LZ);
    this.vanGroup.add(this.vanDoor);

    // 7. 四只重型輪胎 (半徑 0.6m)
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
    for (const wp of [{ x: -1.45, z: -2.6 }, { x: 1.45, z: -2.6 }, { x: -1.45, z: 2.4 }, { x: 1.45, z: 2.4 }]) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, 0.6, wp.z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.46, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(tire, rim);
      this.vanWheels.push(tire);
      this.vanGroup.add(wheelGroup);
    }

    // 8. 車頭大燈與聚光燈
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
    for (const x of [-1.0, 1.0]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), headlightMat);
      lamp.position.set(x, 1.05, -4.92);
      lamp.rotation.y = Math.PI;
      this.vanGroup.add(lamp);
      const light = new THREE.SpotLight(0xfff3cc, 8.0, 45, Math.PI / 5, 0.45, 1.2);
      light.position.set(x, 1.1, -4.9);
      light.target.position.set(x, 0, -25);
      this.vanGroup.add(light, light.target);
    }

    // 9. 車頂紅藍警燈
    const sirenBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.45), new THREE.MeshBasicMaterial({ color: 0x333333 }));
    sirenBar.position.set(0, 2.85, -2.5);
    this.vanGroup.add(sirenBar);
    this.vanStrobeLight = new THREE.PointLight(0xff0000, 3.0, 15);
    this.vanStrobeLight.position.set(0, 3.1, -2.5);
    this.vanGroup.add(this.vanStrobeLight);

    this.cutsceneGroup.add(this.vanGroup);
  }

  // 過場演員：鐵面總長 (與 C 區 Boss 同外觀) 與兩名特訓教官 (與巡邏守衛同外觀)
  private buildActors() {
    this.warden = new NPC(this.scene, new THREE.Vector3(WARDEN_START_X, 0, WARDEN_Z), 'DETENTION_BOSS');
    this.guards = [
      new NPC(this.scene, new THREE.Vector3(WARDEN_START_X - GUARD_BACK, 0, WARDEN_Z - GUARD_SIDE), 'DETENTION_GUARD'),
      new NPC(this.scene, new THREE.Vector3(WARDEN_START_X - GUARD_BACK, 0, WARDEN_Z + GUARD_SIDE), 'DETENTION_GUARD')
    ];
    for (const actor of [this.warden, ...this.guards]) {
      actor.setCutsceneActor();
      this.cutsceneGroup.add(actor.mesh); // 改掛過場群組，隨過場一併顯示/隱藏
    }
  }

  // 開始播放開場劇情動畫
  public start(cameraCtrl: ThirdPersonCamera, player: Player) {
    this.cameraCtrlRef = cameraCtrl;
    this.playerRef = player;
    this.isActive = true;
    this.timer = 0;
    this.whistlePlayed = false;
    this.brakePlayed = false;
    this.cutsceneGroup.visible = true;
    setGameUiHidden(true);

    this.vanGroup.rotation.y = VAN_HEADING;
    this.lastVanX = VAN_START_X;
    this.setVanX(VAN_START_X);
    if (this.vanDoor) this.vanDoor.position.set(DOOR_CLOSED_X, 1.425, DOOR_LZ);

    // 玩家待第 3 幕才由車門踏出
    player.mesh.visible = false;
    this.placePlayerAtVanLocal(PLAYER_EXIT_START_LX, 0.5, 0);

    for (const actor of [this.warden, ...this.guards]) {
      actor.mesh.visible = false;
      actor.resetPose();
      actor.setCutsceneActor();
    }
    this.placeWardenParty(WARDEN_START_X);

    // 最終第三人稱鏡頭 (與 resetBehind 相同公式，結束時無跳切)
    const yaw = SPAWN_ROT + Math.PI;
    const pitch = 0.25;
    const dist = cameraCtrl.targetDistance;
    this._finalTarget.set(SPAWN_X, 1.35, SPAWN_Z);
    this._finalCam.set(
      SPAWN_X + Math.sin(yaw) * Math.cos(pitch) * dist,
      1.35 + Math.sin(pitch) * dist,
      SPAWN_Z + Math.cos(yaw) * Math.cos(pitch) * dist
    );

    soundManager.playThunder();
    this.evaluate(0, 0);
  }

  // 每一幀推進劇情動畫 (回傳 true 表示動畫進行中，false 表示已結束)
  public update(delta: number): boolean {
    if (!this.isActive) return false;
    this.timer += delta;

    if (this.vanStrobeLight) {
      this.vanStrobeLight.color.setHex(Math.floor(this.timer * 10) % 2 === 0 ? 0xff0022 : 0x0044ff);
    }

    this.evaluate(this.timer, delta);

    if (this.timer >= this.totalDuration) {
      this.complete();
      return false;
    }
    return true;
  }

  // 車身本地座標 (lx 朝右、lz 朝車尾) 換算世界座標；車頭固定朝 -X (VAN_HEADING)
  private vanLocalToWorld(lx: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.vanGroup.position.x + lz, 0, this.vanGroup.position.z - lx);
  }

  // 過場期間玩家不執行 update，需同時同步邏輯位置與模型
  private placePlayer(x: number, y: number, z: number, rotationY: number) {
    const p = this.playerRef;
    if (!p) return;
    p.position.set(x, y, z);
    p.rotationY = rotationY;
    p.mesh.position.copy(p.position);
    p.mesh.rotation.set(0, rotationY, 0);
  }

  private placePlayerAtVanLocal(lx: number, y: number, rotationY: number) {
    this.vanLocalToWorld(lx, DOOR_LZ, this._tmp);
    this.placePlayer(this._tmp.x, y, this._tmp.z, rotationY);
  }

  private placeActor(actor: NPC, x: number, z: number, rotationY: number) {
    actor.position.set(x, 0, z);
    actor.rotationY = rotationY;
    actor.mesh.position.set(x, 0, z);
    actor.mesh.rotation.set(0, rotationY, 0);
  }

  // 總長居中、兩名教官隨行於後方兩翼 (面向東方)
  private placeWardenParty(wardenX: number) {
    this.placeActor(this.warden, wardenX, WARDEN_Z, Math.PI / 2);
    this.placeActor(this.guards[0], wardenX - GUARD_BACK, WARDEN_Z - GUARD_SIDE, Math.PI / 2);
    this.placeActor(this.guards[1], wardenX - GUARD_BACK, WARDEN_Z + GUARD_SIDE, Math.PI / 2);
  }

  // 專車沿 X 軸移動並依實際位移滾動車輪
  private setVanX(x: number) {
    this.vanGroup.position.set(x, 0, VAN_Z);
    const dx = this.lastVanX - x;
    this.lastVanX = x;
    for (const w of this.vanWheels) w.rotation.x -= dx / 0.6;
  }

  private setCamera(pos: THREE.Vector3, target: THREE.Vector3) {
    if (!this.cameraCtrlRef) return;
    const cam = this.cameraCtrlRef.camera;
    cam.position.copy(pos);
    cam.lookAt(target);
  }

  private subtitle(text: string) {
    if (this.onSubtitleChange) this.onSubtitleChange(text);
  }

  // 分鏡導演邏輯 (5 段分鏡，依時間計算所有物件狀態)
  private evaluate(time: number, delta: number) {
    const player = this.playerRef;

    // ========================================================
    // 分鏡 1 (0 ~ 4s)：夜雨雷鳴，押送專車沿北牆車道駛入 A 區 (瞭望塔方向的高角度全景)
    // ========================================================
    if (time < T_SHOT2) {
      const t = time / T_SHOT2;
      const vanX = THREE.MathUtils.lerp(VAN_START_X, VAN_CRUISE_END_X, t);
      this.setVanX(vanX);
      this._camPos.set(-62, 6.5, -80.5);
      this._camTarget.set(THREE.MathUtils.lerp(vanX, -55, 0.25), 1.2, VAN_Z);
      this.setCamera(this._camPos, this._camTarget);
      this.subtitle('【深夜 23:45 · 夜雨雷鳴 · 第七少年特訓院 A 區】');
      return;
    }

    // ========================================================
    // 分鏡 2 (4 ~ 7s)：專車線性減速停於牢房大樓北側入監空地 (低角度迎面鏡頭)
    // ========================================================
    if (time < T_SHOT3) {
      const t = (time - T_SHOT2) / (T_SHOT3 - T_SHOT2);
      const eased = 1 - (1 - t) * (1 - t); // 等減速，末速為 0，不超衝
      const vanX = THREE.MathUtils.lerp(VAN_CRUISE_END_X, VAN_STOP_X, eased);
      this.setVanX(vanX);
      if (!this.brakePlayed && t > 0.75) {
        this.brakePlayed = true;
        soundManager.playBanditSlash();
      }
      this._camPos.set(-63, 1.5, -86.5);
      this._camTarget.set(vanX, 1.3, VAN_Z);
      this.setCamera(this._camPos, this._camTarget);
      this.subtitle('「押送專車進場！A 區全員就位！」');
      return;
    }

    this.setVanX(VAN_STOP_X);

    // ========================================================
    // 分鏡 3 (7 ~ 10.5s)：左側滑門外推滑開，主角由門洞踏下踏板，站定面向牢房大樓
    // ========================================================
    if (time < T_SHOT4) {
      const t = (time - T_SHOT3) / (T_SHOT4 - T_SHOT3);
      if (this.vanDoor) {
        const pop = THREE.MathUtils.clamp(t / 0.12, 0, 1);
        const slide = THREE.MathUtils.clamp((t - 0.12) / 0.28, 0, 1);
        this.vanDoor.position.x = THREE.MathUtils.lerp(DOOR_CLOSED_X, DOOR_OPEN_X, pop);
        this.vanDoor.position.z = THREE.MathUtils.lerp(DOOR_LZ, DOOR_OPEN_Z, slide);
      }
      if (player) {
        player.mesh.visible = t >= 0.35;
        const walk = THREE.MathUtils.clamp((t - 0.4) / 0.45, 0, 1);
        const lx = THREE.MathUtils.lerp(PLAYER_EXIT_START_LX, PLAYER_EXIT_END_LX, walk);
        const y = THREE.MathUtils.lerp(0.5, 0, THREE.MathUtils.clamp((-lx - 1.5) / 0.6, 0, 1));
        this.placePlayerAtVanLocal(lx, y, 0);
        player.animateCutscene(delta, walk > 0 && walk < 1);
      }
      this._camPos.set(-51.6, 1.5, -85.6);
      this.vanLocalToWorld(-1.6, DOOR_LZ, this._camTarget);
      this._camTarget.y = THREE.MathUtils.lerp(1.0, 1.4, t);
      this.setCamera(this._camPos, this._camTarget);
      this.subtitle('特訓學員押送抵達 A 區牢房大樓，第一天特訓即將開始...');
      return;
    }

    const playerStandX = VAN_STOP_X + DOOR_LZ;      // 主角下車站定位置 (= -55)
    const playerStandZ = VAN_Z - PLAYER_EXIT_END_LX; // (= -88.6)
    if (this.vanDoor) this.vanDoor.position.set(DOOR_OPEN_X, 1.425, DOOR_OPEN_Z);

    // ========================================================
    // 分鏡 4 (10.5 ~ 15s)：鐵面總長率兩名教官由西側走來，站定吹哨訓話 (過肩鏡頭)
    // ========================================================
    if (time < T_SHOT5) {
      const t = (time - T_SHOT4) / (T_SHOT5 - T_SHOT4);
      const walk = THREE.MathUtils.clamp(t / 0.75, 0, 1);
      const wardenX = THREE.MathUtils.lerp(WARDEN_START_X, WARDEN_END_X, walk);
      const walking = walk < 1;
      const speed = walking ? (WARDEN_END_X - WARDEN_START_X) / ((T_SHOT5 - T_SHOT4) * 0.75) : 0;

      this.warden.mesh.visible = true;
      for (const g of this.guards) g.mesh.visible = true;
      this.placeWardenParty(wardenX);
      if (!walking) {
        // 站定後總長轉身面向主角 (北方)，教官維持兩翼警戒
        this.placeActor(this.warden, wardenX, WARDEN_Z, Math.PI);
      }
      this.warden.animateCutsceneWalk(delta, speed);
      for (const g of this.guards) g.animateCutsceneWalk(delta, speed);

      // 總長舉手吹哨
      if (t > 0.82) {
        this.warden.setCutsceneRightArm(-1.25);
        if (!this.whistlePlayed) {
          this.whistlePlayed = true;
          soundManager.playWhistle();
        }
      }

      // 主角轉頭盯著走來的總長
      if (player) {
        player.mesh.visible = true;
        const face = Math.atan2(wardenX - playerStandX, WARDEN_Z - playerStandZ);
        this.placePlayer(playerStandX, 0, playerStandZ, face);
        player.animateCutscene(delta, false);
      }

      // 過肩鏡頭：主角右後方 (車尾東側，避開車身)，望向南方的總長
      this._shot4Cam.set(playerStandX + 3.4, 2.4, playerStandZ - 1.2);
      this._shot4Target.set(THREE.MathUtils.lerp(wardenX, WARDEN_END_X, 0.5), 1.4, WARDEN_Z);
      this.setCamera(this._shot4Cam, this._shot4Target);
      this.subtitle(t < 0.6
        ? '總教官 鐵面總長 率特訓教官前來接收學員...'
        : '鐵面總長：「歡迎來到第七少年特訓院！在這裡，只有規矩與汗水！」');
      return;
    }

    // ========================================================
    // 分鏡 5 (15 ~ 18s)：總長轉身領路，教官左右押送主角走到牢房區開局點，鏡頭拉回第三人稱
    // ========================================================
    const t = (time - T_SHOT5) / (T_END - T_SHOT5);

    // 總長往東南領路離開
    const lead = smooth(t / 0.7);
    const wx = THREE.MathUtils.lerp(WARDEN_END_X, WARDEN_EXIT_X, lead);
    const wz = THREE.MathUtils.lerp(WARDEN_Z, WARDEN_EXIT_Z, lead);
    this.warden.setCutsceneRightArm(0);
    this.placeActor(this.warden, wx, wz, Math.atan2(WARDEN_EXIT_X - WARDEN_END_X, WARDEN_EXIT_Z - WARDEN_Z));
    this.warden.animateCutsceneWalk(delta, lead < 1 ? 2.5 : 0);

    // 主角由下車點往南走到開局點，最後轉向東方
    const step = smooth((t - 0.12) / 0.6);
    const px = playerStandX;
    const pz = THREE.MathUtils.lerp(playerStandZ, SPAWN_Z, step);
    const turn = smooth((t - 0.72) / 0.25);
    const rot = THREE.MathUtils.lerp(0, SPAWN_ROT, turn);
    if (player) {
      this.placePlayer(px, 0, pz, rot);
      player.animateCutscene(delta, step > 0 && step < 1);
    }

    // 教官由兩翼位置收攏至主角左右兩側隨行押送
    const join = smooth(t / 0.25);
    const guardSpeed = step > 0 && step < 1 ? 2.0 : (join < 1 ? 1.5 : 0);
    for (let i = 0; i < 2; i++) {
      const g = this.guards[i];
      const side = i === 0 ? -1 : 1;
      const fromX = WARDEN_END_X - GUARD_BACK;
      const fromZ = WARDEN_Z + side * GUARD_SIDE;
      const gx = THREE.MathUtils.lerp(fromX, px + side * ESCORT_SIDE, join);
      const gz = THREE.MathUtils.lerp(fromZ, pz + 0.3, join);
      this.placeActor(g, gx, gz, THREE.MathUtils.lerp(Math.PI / 2, 0, join));
      g.animateCutsceneWalk(delta, guardSpeed);
    }

    // 鏡頭由過肩位置平滑拉回開局點的第三人稱跟隨視角
    const camBlend = smooth(t / 0.95);
    this._camPos.lerpVectors(this._shot4Cam, this._finalCam, camBlend);
    this._camPos.y += Math.sin(camBlend * Math.PI) * 2.2; // 弧形升高越過押送隊伍頭頂，避免鏡頭穿過角色
    this._tmp.set(px, 1.35, pz);
    this._camTarget.lerpVectors(this._shot4Target, this._tmp, smooth(t / 0.4));
    this.setCamera(this._camPos, this._camTarget);
    this.subtitle('「帶他進牢房區！」—— 【第一天特訓開始！】');
  }

  // 跳過劇情動畫 (按下 Space 鍵或點擊隨時一鍵跳過)
  public skip() {
    if (!this.isActive) return;
    this.complete();
  }

  // 完成並結束過場動畫：主角落在 A 區開局點，鏡頭置於身後，平穩交還玩家操作
  private complete() {
    this.isActive = false;
    this.cutsceneGroup.visible = false;
    setGameUiHidden(false);
    this.warden.resetPose();
    for (const g of this.guards) g.resetPose();

    const p = this.playerRef;
    if (p) {
      p.mesh.visible = true;
      this.placePlayer(SPAWN_X, 0, SPAWN_Z, SPAWN_ROT);
      p.velocity.set(0, 0, 0);
    }
    if (this.cameraCtrlRef && p) {
      this.cameraCtrlRef.resetBehind(p.position, SPAWN_ROT + Math.PI);
    }

    if (this.onComplete) this.onComplete();
  }

  // 清理資源
  public dispose() {
    this.warden.dispose(this.scene);
    for (const g of this.guards) g.dispose(this.scene);
    this.scene.remove(this.cutsceneGroup);
  }
}
