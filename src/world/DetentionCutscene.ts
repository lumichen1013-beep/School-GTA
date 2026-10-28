import * as THREE from 'three';
import { Player } from '../entities/Player';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { soundManager } from '../audio/SoundEffects';

// 開場場景佈局：南大門 (Z: 94.2 ~ 95.8) 外側的開闊地帶 (Z: 95.8 ~ 105)，
// 院內 NPC 皆在高牆內，專車沿圍牆由東向西 (-X) 駛入並停靠於大門外，車身與牆面、人物皆保持安全距離
const VAN_Z = 101.5;            // 專車行駛與停靠中線 (車身佔 Z: 99.82 ~ 103.18)
const VAN_START_X = 70;         // 分鏡 1 起點
const VAN_SHOT1_END_X = 26.6;   // 分鏡 1 終點 (等速 ≈10.3 m/s，與分鏡 2 減速初速銜接)
const VAN_STOP_X = 6;           // 分鏡 2 線性減速停車點 (無煞車超衝)
const VAN_HEADING = Math.PI / 2; // 車頭朝 -X，右側滑門朝北 (-Z) 面向大門
const DOOR_CLOSED_X = 1.45;
const DOOR_CLOSED_Z = 0.8;
const DOOR_OPEN_X = 1.62;       // 滑門外推量
const DOOR_OPEN_Z = -0.75;      // 滑門向車頭方向滑開後位置
const PLAYER_EXIT_START_LX = 1.15; // 主角於門洞內車廂起步 (車身本地 X)
const PLAYER_EXIT_END_LX = 3.6;    // 踏出車門後站定位置 (與車身保持 ≥1.5m)
const WARDEN_START_X = -14;     // 總長沿圍牆由西側走來
const WARDEN_END_X = 1.6;
const WARDEN_Z = 97.3;

export class DetentionCutscene {
  public scene: THREE.Scene;
  public isActive: boolean = false;
  public timer: number = 0;
  public readonly totalDuration: number = 18.5; // 總時長約 18.5 秒

  private playerRef?: Player;
  private cameraCtrlRef?: ThirdPersonCamera;
  private cutsceneGroup: THREE.Group = new THREE.Group();

  // 特訓專車 (3D Tactical Van / Bus)
  private vanGroup: THREE.Group = new THREE.Group();
  private vanWheels: THREE.Mesh[] = [];
  private vanDoor?: THREE.Group; // 右側滑門 (先外推再向車頭方向滑開，露出車廂門洞)
  private lastVanX: number = 0;
  private vanHeadlights: THREE.SpotLight[] = [];
  private vanStrobeLight?: THREE.PointLight;

  // 動畫過場中的總教官
  private wardenMesh?: THREE.Group;
  private wardenArm?: THREE.Mesh;
  private guardMeshes: THREE.Group[] = [];

  // 暫存相機平滑過渡向量
  private _camPos = new THREE.Vector3();
  private _camTarget = new THREE.Vector3();

  // 回呼函式
  public onComplete?: () => void;
  public onSubtitleChange?: (text: string) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.cutsceneGroup);
    this.buildVanModel();
    this.buildWardenModel();
    this.cutsceneGroup.visible = false;
  }

  // 構建特訓專車 3D 模型 (黑色裝甲押運車)
  private buildVanModel() {
    this.vanGroup = new THREE.Group();

    // 1. 車身主體 (長 7.2m, 寬 2.8m, 車廂 Y: 0.5 ~ 2.7)
    // 右側車身挖出滑門門洞 (Z: 0.1 ~ 1.5, Y: 0.5 ~ 2.35)，主角由門洞踏出而非穿過車殼
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3d4e61 }); // 現代特訓戰術亮藍灰
    const addBodyPart = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = bodyMat) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      part.position.set(x, y, z);
      this.vanGroup.add(part);
    };
    addBodyPart(2.3, 2.2, 7.2, -0.25, 1.6, 0);      // 車廂主體 (X: -1.4 ~ 0.9)
    addBodyPart(0.5, 2.2, 3.7, 1.15, 1.6, -1.75);   // 右側車壁 (門洞前段)
    addBodyPart(0.5, 2.2, 2.1, 1.15, 1.6, 2.55);    // 右側車壁 (門洞後段)
    addBodyPart(0.5, 0.35, 1.4, 1.15, 2.525, 0.8);  // 門洞上方門楣

    // 門洞內側昏暗車廂 (避免開門後看見中空車殼)
    const interiorMat = new THREE.MeshLambertMaterial({ color: 0x0d1117 });
    addBodyPart(0.02, 1.85, 1.4, 0.91, 1.425, 0.8, interiorMat); // 車廂內壁
    addBodyPart(0.5, 0.04, 1.4, 1.15, 0.52, 0.8, interiorMat);   // 車廂地板
    addBodyPart(0.5, 0.04, 1.4, 1.15, 2.33, 0.8, interiorMat);   // 車廂頂板

    // 門框深色飾條
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1f2a36 });
    addBodyPart(0.04, 1.9, 0.08, 1.41, 1.425, 0.06, frameMat);
    addBodyPart(0.04, 1.9, 0.08, 1.41, 1.425, 1.54, frameMat);
    addBodyPart(0.04, 0.08, 1.56, 1.41, 2.39, 0.8, frameMat);

    // 門下防滑踏板
    addBodyPart(0.35, 0.08, 1.6, 1.55, 0.35, 0.8, new THREE.MeshLambertMaterial({ color: 0x222222 }));

    // 2. 駕駛艙車頭前斜切
    const noseMat = new THREE.MeshLambertMaterial({ color: 0x2e3d4f });
    const vanNose = new THREE.Mesh(new THREE.BoxGeometry(2.78, 1.4, 1.8), noseMat);
    vanNose.position.set(0, 1.1, -4.0);
    this.vanGroup.add(vanNose);

    // 3. 前擋風玻璃與金屬防暴鐵網
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0x81ecec,
      transparent: true,
      opacity: 0.75
    });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 0.1), glassMat);
    windshield.rotation.x = 0.35;
    windshield.position.set(0, 1.95, -3.2);
    this.vanGroup.add(windshield);

    // 4. 車側雙開防暴條紋窗 (右側中段為滑門門洞，不設窗)
    for (let z = -1.5; z <= 2.5; z += 1.8) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 1.2), glassMat);
      winL.position.set(-1.41, 1.85, z);
      this.vanGroup.add(winL);
      if (Math.abs(z - 0.3) > 0.01) {
        const winR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 1.2), glassMat);
        winR.position.set(1.41, 1.85, z);
        this.vanGroup.add(winR);
      }
    }

    // 5. 車身黃黑警示防撞條紋
    const hazardMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f }); // 鮮豔高可視度金黃
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.6, 0.3), hazardMat);
    bumper.position.set(0, 0.7, -4.9);
    this.vanGroup.add(bumper);

    // 6. 右側滑動車門 (分鏡 3 先外推再向車頭方向滑開；車頭方向無車輪，不會穿模)
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a607a });
    this.vanDoor = new THREE.Group();
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.85, 1.42), doorMat);
    const doorWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.9), glassMat);
    doorWin.position.set(0, 0.45, 0);
    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.25), frameMat);
    doorHandle.position.set(0.06, 0.0, -0.45);
    this.vanDoor.add(doorPanel, doorWin, doorHandle);
    this.vanDoor.position.set(DOOR_CLOSED_X, 1.425, DOOR_CLOSED_Z);
    this.vanGroup.add(this.vanDoor);

    // 7. 四只重型防爆泥地大輪胎 (半徑 0.6m)
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
    const wheelPositions = [
      { x: -1.45, z: -2.6 },
      { x: 1.45, z: -2.6 },
      { x: -1.45, z: 2.4 },
      { x: 1.45, z: 2.4 }
    ];

    for (const wp of wheelPositions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, 0.6, wp.z);

      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.45, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.46, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      this.vanWheels.push(tire);
      this.vanGroup.add(wheelGroup);
    }

    // 8. 雙前車頭大燈 (強光照亮前方泥濘)
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
    const lampL = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), headlightMat);
    lampL.position.set(-1.0, 1.05, -4.92);
    const lampR = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), headlightMat);
    lampR.position.set(1.0, 1.05, -4.92);
    this.vanGroup.add(lampL, lampR);

    // 聚光燈光源
    const lightL = new THREE.SpotLight(0xfff3cc, 8.0, 45, Math.PI / 5, 0.45, 1.2);
    lightL.position.set(-1.0, 1.1, -4.9);
    lightL.target.position.set(-1.0, 0, -25);
    this.vanGroup.add(lightL);
    this.vanGroup.add(lightL.target);
    this.vanHeadlights.push(lightL);

    const lightR = new THREE.SpotLight(0xfff3cc, 8.0, 45, Math.PI / 5, 0.45, 1.2);
    lightR.position.set(1.0, 1.1, -4.9);
    lightR.target.position.set(1.0, 0, -25);
    this.vanGroup.add(lightR);
    this.vanGroup.add(lightR.target);
    this.vanHeadlights.push(lightR);

    // 9. 車頂紅藍交替警燈
    const barGeo = new THREE.BoxGeometry(1.6, 0.25, 0.45);
    const sirenBar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x333333 }));
    sirenBar.position.set(0, 2.85, -2.5);
    this.vanGroup.add(sirenBar);

    this.vanStrobeLight = new THREE.PointLight(0xff0000, 3.0, 15);
    this.vanStrobeLight.position.set(0, 3.1, -2.5);
    this.vanGroup.add(this.vanStrobeLight);

    this.cutsceneGroup.add(this.vanGroup);
  }

  // 構建分鏡 4 專用鐵面總長與隨行教官模型
  private buildWardenModel() {
    this.wardenMesh = new THREE.Group();

    // 軀幹 (深鐵灰軍裝大衣)
    const coatMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.8, 0.4), coatMat);
    torso.position.y = 1.1;
    this.wardenMesh.add(torso);

    // 總長金色肩章與綬帶
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    const epauletL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.42), goldMat);
    epauletL.position.set(-0.38, 1.52, 0);
    const epauletR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.42), goldMat);
    epauletR.position.set(0.38, 1.52, 0);
    this.wardenMesh.add(epauletL, epauletR);

    // 頭部與鐵面半遮面具
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd4a373 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), skinMat);
    head.position.y = 1.72;
    this.wardenMesh.add(head);

    // 鐵面金屬遮面/墨鏡
    const ironMask = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.2), new THREE.MeshLambertMaterial({ color: 0x7f8c8d }));
    ironMask.position.set(0, 1.74, 0.18);
    this.wardenMesh.add(ironMask);

    // 教官大盤帽 (軍警大盤軍帽)
    const capMat = new THREE.MeshLambertMaterial({ color: 0x11161d });
    const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.18, 12), capMat);
    capBase.position.y = 1.95;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.22), new THREE.MeshLambertMaterial({ color: 0x050505 }));
    visor.position.set(0, 1.88, 0.22);
    visor.rotation.x = 0.2;
    this.wardenMesh.add(capBase, visor);

    // 右手臂 (手持警哨)
    this.wardenArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), coatMat);
    this.wardenArm.position.set(0.42, 1.1, 0);
    this.wardenMesh.add(this.wardenArm);

    // 哨子 (嘴前金屬銀光)
    const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.15), goldMat);
    whistle.position.set(0, 1.66, 0.25);
    this.wardenMesh.add(whistle);

    // 雙腿
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x11161d });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pantsMat);
    legL.position.set(-0.16, 0.38, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pantsMat);
    legR.position.set(0.16, 0.38, 0);
    this.wardenMesh.add(legL, legR);

    this.cutsceneGroup.add(this.wardenMesh);

    // 兩名隨行特訓教官 (分立左右)
    for (let i = 0; i < 2; i++) {
      const gMesh = new THREE.Group();
      const gTorso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.38), new THREE.MeshLambertMaterial({ color: 0x243342 }));
      gTorso.position.y = 1.05;
      const gHead = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.38, 0.35), skinMat);
      gHead.position.y = 1.65;
      const gCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.16, 12), capMat);
      gCap.position.y = 1.85;

      // 防暴海綿盾牌 (左手)
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
      shield.position.set(-0.45, 1.05, 0.15);

      gMesh.add(gTorso, gHead, gCap, shield);
      this.guardMeshes.push(gMesh);
      this.cutsceneGroup.add(gMesh);
    }
  }

  // 開始播放開場劇情動畫
  public start(cameraCtrl: ThirdPersonCamera, player: Player) {
    this.cameraCtrlRef = cameraCtrl;
    this.playerRef = player;
    this.isActive = true;
    this.timer = 0;
    this.cutsceneGroup.visible = true;

    // 專車起始點：南大門外東側圍牆邊，車頭朝 -X 沿牆駛向大門
    this.vanGroup.position.set(VAN_START_X, 0, VAN_Z);
    this.vanGroup.rotation.y = VAN_HEADING;
    this.lastVanX = VAN_START_X;

    if (this.vanDoor) {
      this.vanDoor.position.set(DOOR_CLOSED_X, 1.425, DOOR_CLOSED_Z); // 關閉狀態
    }

    // 隱藏玩家本體 (待第 3 幕由車門踏出)；過場期間玩家不跑 update，需同步 mesh
    if (this.playerRef) {
      this.playerRef.mesh.visible = false;
      this.placePlayerAtVanLocal(PLAYER_EXIT_START_LX, 0.5, Math.PI);
    }

    // 鐵面總長與隨行教官：分鏡 4 才沿圍牆由西側走來 (面向東方的專車與主角)
    this.placeWardenGroup(WARDEN_START_X);
    if (this.wardenMesh) this.wardenMesh.visible = false;
    for (const g of this.guardMeshes) g.visible = false;

    // 播放夜雨背景雷鳴聲效
    soundManager.playThunder();

    this.updateShot(0);
  }

  // 每一幀推進劇情動畫 (回傳 true 表示動畫進行中，false 表示已結束)
  public update(delta: number): boolean {
    if (!this.isActive) return false;

    this.timer += delta;

    // 警燈紅藍急促閃爍 (10Hz)
    if (this.vanStrobeLight) {
      const isRed = Math.floor(this.timer * 10) % 2 === 0;
      this.vanStrobeLight.color.setHex(isRed ? 0xff0022 : 0x0044ff);
    }

    // 依時間更新分鏡
    this.updateShot(this.timer);

    if (this.timer >= this.totalDuration) {
      this.complete();
      return false;
    }

    return true;
  }

  // 車身本地座標 (lx 朝右側車門、lz 朝車尾) 換算世界座標；車頭固定朝 -X (VAN_HEADING)
  private vanLocalToWorld(lx: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.vanGroup.position.x + lz, 0, this.vanGroup.position.z - lx);
  }

  // 過場期間玩家不執行 update，需同時同步邏輯位置與模型
  private placePlayerAtVanLocal(lx: number, y: number, rotationY: number) {
    if (!this.playerRef) return;
    this.vanLocalToWorld(lx, DOOR_CLOSED_Z, this.playerRef.position);
    this.playerRef.position.y = y;
    this.playerRef.rotationY = rotationY;
    this.playerRef.mesh.position.copy(this.playerRef.position);
    this.playerRef.mesh.rotation.set(0, rotationY, 0);
  }

  // 總長居中、兩名教官隨行於後方兩側 (全程位於圍牆與專車之間的空地)
  private placeWardenGroup(wardenX: number) {
    if (this.wardenMesh) {
      this.wardenMesh.position.set(wardenX, 0, WARDEN_Z);
      this.wardenMesh.rotation.y = Math.PI / 2; // 面向東方 (+X)
    }
    if (this.guardMeshes[0]) {
      this.guardMeshes[0].position.set(wardenX - 1.3, 0, WARDEN_Z - 0.7);
      this.guardMeshes[0].rotation.y = Math.PI / 2;
    }
    if (this.guardMeshes[1]) {
      this.guardMeshes[1].position.set(wardenX - 1.3, 0, WARDEN_Z + 0.6);
      this.guardMeshes[1].rotation.y = Math.PI / 2;
    }
  }

  // 專車沿 X 軸移動並依實際位移滾動車輪
  private setVanX(x: number) {
    this.vanGroup.position.set(x, 0, VAN_Z);
    const dx = this.lastVanX - x;
    this.lastVanX = x;
    for (const w of this.vanWheels) {
      w.rotation.x -= dx / 0.6;
    }
  }

  // 分鏡導演邏輯 (5 大電影級分鏡)
  private updateShot(time: number) {
    if (!this.cameraCtrlRef) return;
    const cam = this.cameraCtrlRef.camera;

    // ========================================================
    // 分鏡 1 (0.0s ~ 4.2s)：夜雨雷鳴，特訓專車大燈照地沿高牆駛向南大門
    // ========================================================
    if (time < 4.2) {
      const t = time / 4.2;
      const currentX = THREE.MathUtils.lerp(VAN_START_X, VAN_SHOT1_END_X, t);
      this.setVanX(currentX);

      // 鏡頭：大門旁牆腳低角度固定鏡頭，仰望專車沿牆駛來
      this._camPos.set(14, 1.2, 97.2);
      this._camTarget.set(currentX - 5, 1.8, VAN_Z);
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('【深夜 23:45 · 夜雨雷鳴 · 第七少年特訓院】');
      }
    }
    // ========================================================
    // 分鏡 2 (4.2s ~ 8.2s)：專車於南大門外等減速煞停，車身與高牆保持 4m 間距
    // ========================================================
    else if (time < 8.2) {
      const t = (time - 4.2) / 4.0;
      // 等減速 (初速銜接分鏡 1，末速為 0，單調不超衝)
      const eased = 1 - (1 - t) * (1 - t);
      const currentX = THREE.MathUtils.lerp(VAN_SHOT1_END_X, VAN_STOP_X, eased);
      this.setVanX(currentX);

      // 急煞音效 (在剛煞停時觸發一次)
      if (t > 0.4 && t < 0.45) {
        soundManager.playBanditSlash();
      }

      // 相機沿牆前空地橫移跟拍
      this._camPos.set(THREE.MathUtils.lerp(18, -3, t), 3.0 - t * 0.6, 97.0);
      this._camTarget.set(currentX, 1.6, VAN_Z);
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('「警戒提高！全員就位！」—— 特訓專車急煞於南大門前');
      }
    }
    // ========================================================
    // 分鏡 3 (8.2s ~ 12.0s)：滑門外推滑開，主角由門洞踏下踏板站定
    // ========================================================
    else if (time < 12.0) {
      const t = (time - 8.2) / 3.8;
      this.setVanX(VAN_STOP_X);

      // 滑門：先外推 (t 0 ~ 0.12) 再向車頭方向滑開 (t 0.12 ~ 0.42)
      if (this.vanDoor) {
        const pop = THREE.MathUtils.clamp(t / 0.12, 0, 1);
        const slide = THREE.MathUtils.clamp((t - 0.12) / 0.3, 0, 1);
        this.vanDoor.position.x = THREE.MathUtils.lerp(DOOR_CLOSED_X, DOOR_OPEN_X, pop);
        this.vanDoor.position.z = THREE.MathUtils.lerp(DOOR_CLOSED_Z, DOOR_OPEN_Z, slide);
      }

      // 主角於門洞內現身並踏出 (t 0.4 ~ 0.8)，經踏板落地後站定面向大門
      if (this.playerRef) {
        this.playerRef.mesh.visible = t >= 0.4;
        const walk = THREE.MathUtils.clamp((t - 0.4) / 0.4, 0, 1);
        const lx = THREE.MathUtils.lerp(PLAYER_EXIT_START_LX, PLAYER_EXIT_END_LX, walk);
        const y = THREE.MathUtils.lerp(0.5, 0, THREE.MathUtils.clamp((lx - 1.5) / 0.6, 0, 1));
        this.placePlayerAtVanLocal(lx, y, Math.PI);
      }

      // 鏡頭：大門前低角度特寫車門，由腳步緩緩上推
      const camY = THREE.MathUtils.lerp(0.6, 1.8, t);
      this._camPos.set(3.8 - t * 0.4, camY, 96.9);
      this.vanLocalToWorld(1.6, DOOR_CLOSED_Z, this._camTarget);
      this._camTarget.y = 1.3;
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('特訓學員已押送至特訓院南大門，第一天特訓即將開始...');
      }
    }
    // ========================================================
    // 分鏡 4 (12.0s ~ 15.8s)：鐵面總長率教官沿圍牆走來，吹響刺耳警哨
    // ========================================================
    else if (time < 15.8) {
      const t = (time - 12.0) / 3.8;
      this.setVanX(VAN_STOP_X);

      // 主角轉身面向西側走來的總長
      if (this.playerRef) {
        this.playerRef.mesh.visible = true;
        const turn = THREE.MathUtils.clamp(t / 0.3, 0, 1);
        this.placePlayerAtVanLocal(PLAYER_EXIT_END_LX, 0, THREE.MathUtils.lerp(Math.PI, Math.PI * 1.5, turn));
      }

      if (this.wardenMesh && this.guardMeshes[0] && this.guardMeshes[1]) {
        this.wardenMesh.visible = true;
        this.guardMeshes[0].visible = true;
        this.guardMeshes[1].visible = true;

        // 停於主角前方約 5m 處
        this.placeWardenGroup(THREE.MathUtils.lerp(WARDEN_START_X, WARDEN_END_X, Math.min(1.0, t * 1.4)));

        // 總長舉手吹哨動作
        if (t > 0.45 && this.wardenArm) {
          this.wardenArm.rotation.x = -1.2;
        }

        // 鳴響清脆長哨
        if (t > 0.5 && t < 0.55) {
          soundManager.playWhistle();
        }
      }

      // 鏡頭過肩視角：由主角背後 (東側) 望向氣勢威嚴的鐵面總長
      this.vanLocalToWorld(PLAYER_EXIT_END_LX, DOOR_CLOSED_Z, this._camPos);
      this._camPos.x += 1.9;
      this._camPos.y = 1.95;
      this._camPos.z -= 0.9; // 偏向主角左肩 (大門側)，避免頭部擋住總長
      this._camTarget.set(WARDEN_END_X, 1.5, WARDEN_Z);
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('總教官 鐵面總長：「歡迎來到第七少年特訓院！在這裡，只有規矩與汗水！」');
      }
    }
    // ========================================================
    // 分鏡 5 (15.8s ~ 18.5s)：相機平滑由特寫拉回第三人稱視角，無縫銜接開局
    // ========================================================
    else {
      const t = (time - 15.8) / 2.7;
      this.setVanX(VAN_STOP_X);

      // 相機由過肩位置平滑拉回主角身後 4.4m、Y: 2.4m 的標準第三人稱跟隨視角
      const playerPos = this.vanLocalToWorld(PLAYER_EXIT_END_LX, DOOR_CLOSED_Z, this._camTarget);
      const fromX = playerPos.x + 1.9;
      const fromZ = playerPos.z - 0.9;
      this._camPos.set(
        THREE.MathUtils.lerp(fromX, playerPos.x + 4.4, t),
        THREE.MathUtils.lerp(1.95, 2.4, t),
        THREE.MathUtils.lerp(fromZ, playerPos.z, t)
      );
      this._camTarget.y = 1.2;
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('【第一天特訓開始！】');
      }
    }
  }

  // 跳過劇情動畫 (按下 Space 鍵或點擊隨時一鍵跳過)
  public skip() {
    if (!this.isActive) return;
    this.complete();
  }

  // 完成並結束過場動畫，平穩交還玩家操作
  private complete() {
    this.isActive = false;
    this.cutsceneGroup.visible = false;

    // 過場群組直接掛在場景根節點、不隨世界切換移除，結束後整組隱藏，
    // 避免專車殘留於院內 NPC 巡邏路線 (原停放點 18,50 與教官巡邏重疊) 或切回校園時出現

    // 移除過場專用總長與教官模型 (因為世界中會生成實體 AI NPC)
    if (this.wardenMesh) this.wardenMesh.visible = false;
    for (const g of this.guardMeshes) g.visible = false;

    // 將主角放置於禁閉牢房起點 (-55, 0, -84)
    if (this.playerRef) {
      this.playerRef.mesh.visible = true;
      this.playerRef.position.set(-55, 0, -84);
      this.playerRef.velocity.set(0, 0, 0);
      this.playerRef.rotationY = 0;
    }

    // 重設第三人稱追蹤相機
    if (this.cameraCtrlRef && this.playerRef) {
      this.cameraCtrlRef.resetBehind(this.playerRef.position, this.playerRef.rotationY);
    }

    if (this.onComplete) {
      this.onComplete();
    }
  }

  // 清理資源
  public dispose() {
    this.scene.remove(this.cutsceneGroup);
  }
}
