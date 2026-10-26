import * as THREE from 'three';
import { Player } from '../entities/Player';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { soundManager } from '../audio/SoundEffects';
import { NPC } from '../entities/NPC';

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
  private vanDoor?: THREE.Mesh;
  private vanHeadlights: THREE.SpotLight[] = [];
  private vanStrobeLight?: THREE.PointLight;
  private vanSmokeParticles: THREE.Points | null = null;

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

    // 1. 車身主體 (長 7.6m, 寬 2.8m, 高 2.6m)
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3d4e61 }); // 現代特訓戰術亮藍灰
    const vanBody = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 7.2), bodyMat);
    vanBody.position.y = 1.6;
    this.vanGroup.add(vanBody);

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

    // 4. 車側雙開防暴條紋窗
    for (let z = -1.5; z <= 2.5; z += 1.8) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 1.2), glassMat);
      winL.position.set(-1.41, 1.85, z);
      const winR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 1.2), glassMat);
      winR.position.set(1.41, 1.85, z);
      this.vanGroup.add(winL, winR);
    }

    // 5. 車身黃黑警示防撞條紋
    const hazardMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f }); // 鮮豔高可視度金黃
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.6, 0.3), hazardMat);
    bumper.position.set(0, 0.7, -4.9);
    this.vanGroup.add(bumper);

    // 6. 右側滑動車門 (分鏡 3 開啟)
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x4a607a });
    this.vanDoor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.9, 1.4), doorMat);
    this.vanDoor.position.set(1.42, 1.4, 0.8);
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
      const sign = i === 0 ? -1 : 1;
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

    // 專車起始點：位於南大門外 (0, 0, 95)，車頭朝向操場北邊
    this.vanGroup.position.set(0, 0, 95);
    this.vanGroup.rotation.y = Math.PI; // 朝向 -Z

    if (this.vanDoor) {
      this.vanDoor.position.set(1.42, 1.4, 0.8); // 關閉狀態
    }

    // 隱藏玩家本體 (待第 3 幕踏出車廂)
    if (this.playerRef) {
      this.playerRef.mesh.visible = false;
      this.playerRef.position.set(2.4, 0, 10);
      this.playerRef.rotationY = 0;
    }

    // 鐵面總長與隨行教官位置初始化在操場北側暗處 (Z: 2)
    if (this.wardenMesh) {
      this.wardenMesh.position.set(2.4, 0, -2);
      this.wardenMesh.rotation.y = Math.PI; // 面向南方主角
      this.wardenMesh.visible = false;
    }
    if (this.guardMeshes[0]) {
      this.guardMeshes[0].position.set(0.6, 0, -3);
      this.guardMeshes[0].rotation.y = Math.PI;
      this.guardMeshes[0].visible = false;
    }
    if (this.guardMeshes[1]) {
      this.guardMeshes[1].position.set(4.2, 0, -3);
      this.guardMeshes[1].rotation.y = Math.PI;
      this.guardMeshes[1].visible = false;
    }

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

  // 分鏡導演邏輯 (5 大電影級分鏡)
  private updateShot(time: number) {
    if (!this.cameraCtrlRef) return;
    const cam = this.cameraCtrlRef.camera;

    // ========================================================
    // 分鏡 1 (0.0s ~ 4.2s)：夜雨雷鳴，特訓專車大燈照地駛入鋼鐵大門
    // ========================================================
    if (time < 4.2) {
      const t = time / 4.2;
      // 專車由 Z: 95 行駛至 Z: 50
      const currentZ = THREE.MathUtils.lerp(95, 48, t);
      this.vanGroup.position.set(0, 0, currentZ);

      // 車輪隨前進旋轉
      for (const w of this.vanWheels) {
        w.rotation.x += 14.0 * (1.0 - t * 0.3) * 0.016;
      }

      // 鏡頭：門外低角度仰角固定監視鏡頭，仰望專車霸氣駛入
      this._camPos.set(6.5, 1.2, 60);
      this._camTarget.set(0, 1.8, currentZ - 5);
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('【深夜 23:45 · 夜雨雷鳴 · 第七少年特訓院】');
      }
    }
    // ========================================================
    // 分鏡 2 (4.2s ~ 8.2s)：專車在操場中央急煞停下，四座瞭望塔探照燈掃向車身
    // ========================================================
    else if (time < 8.2) {
      const t = (time - 4.2) / 4.0;
      // 專車從 Z: 48 減速急煞停至 Z: 10
      const currentZ = THREE.MathUtils.lerp(48, 10, Math.sin(t * Math.PI / 2));
      this.vanGroup.position.set(0, 0, currentZ);

      // 車輪緩慢停轉
      for (const w of this.vanWheels) {
        w.rotation.x += 10.0 * (1.0 - t) * 0.016;
      }

      // 急煞音效 (在剛煞停時觸發一次)
      if (t > 0.4 && t < 0.45) {
        soundManager.playBanditSlash();
      }

      // 相機環繞跟隨專車弧線平滑拍攝
      const angle = 0.5 + t * 1.5;
      const radius = 11.0;
      this._camPos.set(Math.cos(angle) * radius, 3.2 - t * 0.8, 10 + Math.sin(angle) * radius);
      this._camTarget.set(0, 1.6, 10);
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('「警戒提高！全員就位！」—— 特訓專車急煞入操場');
      }
    }
    // ========================================================
    // 分鏡 3 (8.2s ~ 12.0s)：車門滑動開啟，主角挺立走下車階
    // ========================================================
    else if (time < 12.0) {
      const t = (time - 8.2) / 3.8;
      this.vanGroup.position.set(0, 0, 10);

      // 車側門平滑向後滑開
      if (this.vanDoor) {
        const doorZ = THREE.MathUtils.lerp(0.8, 2.3, Math.min(1.0, t * 1.8));
        this.vanDoor.position.z = doorZ;
      }

      // 主角現身並走下車階
      if (this.playerRef) {
        this.playerRef.mesh.visible = true;
        const playerX = THREE.MathUtils.lerp(1.4, 2.6, Math.min(1.0, t * 1.5));
        this.playerRef.position.set(playerX, 0, 10);
        this.playerRef.rotationY = Math.PI; // 堅毅挺立面對前方
      }

      // 鏡頭近身特寫：由地面主角腳步緩緩上推至面部與挺拔身影
      const camY = THREE.MathUtils.lerp(0.6, 1.8, t);
      this._camPos.set(4.8 - t * 0.5, camY, 10 - t * 1.2);
      this._camTarget.set(2.4, 1.4, 10);
      cam.position.copy(this._camPos);
      cam.lookAt(this._camTarget);

      if (this.onSubtitleChange) {
        this.onSubtitleChange('特訓學員已押送至特訓操場，第一天特訓即將開始...');
      }
    }
    // ========================================================
    // 分鏡 4 (12.0s ~ 15.8s)：鐵面總長率教官踏步上前，吹響刺耳警哨
    // ========================================================
    else if (time < 15.8) {
      const t = (time - 12.0) / 3.8;
      this.vanGroup.position.set(0, 0, 10);

      // 總長與教官大步走上前
      if (this.wardenMesh && this.guardMeshes[0] && this.guardMeshes[1]) {
        this.wardenMesh.visible = true;
        this.guardMeshes[0].visible = true;
        this.guardMeshes[1].visible = true;

        const wardenZ = THREE.MathUtils.lerp(-1.0, 5.8, Math.min(1.0, t * 1.4));
        this.wardenMesh.position.set(2.4, 0, wardenZ);
        this.guardMeshes[0].position.set(0.6, 0, wardenZ - 1.2);
        this.guardMeshes[1].position.set(4.2, 0, wardenZ - 1.2);

        // 總長舉手吹哨動作
        if (t > 0.45 && this.wardenArm) {
          this.wardenArm.rotation.x = -1.2;
        }

        // 鳴響清脆長哨
        if (t > 0.5 && t < 0.55) {
          soundManager.playWhistle();
        }
      }

      // 鏡頭過肩視角：由主角背後望向氣勢威嚴的鐵面總長
      this._camPos.set(2.6, 1.85, 11.8);
      this._camTarget.set(2.4, 1.5, 6.0);
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
      this.vanGroup.position.set(0, 0, 10);

      // 相機由特寫位置平滑拉回玩家身後 5.5m，Y: 2.5m 的標準第三人稱跟隨視角
      const targetCamX = 2.4;
      const targetCamY = 2.4;
      const targetCamZ = 15.5;

      this._camPos.set(
        THREE.MathUtils.lerp(2.6, targetCamX, t),
        THREE.MathUtils.lerp(1.85, targetCamY, t),
        THREE.MathUtils.lerp(11.8, targetCamZ, t)
      );
      this._camTarget.set(2.4, 1.2, 10);
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

    // 將專車停放至操場邊緣 (X: 18, Z: 50)，不阻礙操場中央戰鬥
    this.vanGroup.position.set(18, 0, 50);
    this.vanGroup.rotation.y = Math.PI * 0.85;
    this.cutsceneGroup.visible = true; // 保留邊緣專車作為靜態場景裝飾

    // 移除過場專用總長與教官模型 (因為世界中會生成實體 AI NPC)
    if (this.wardenMesh) this.wardenMesh.visible = false;
    for (const g of this.guardMeshes) g.visible = false;

    // 將主角放置於操場中心 (0, 0, 10)
    if (this.playerRef) {
      this.playerRef.mesh.visible = true;
      this.playerRef.position.set(0, 0, 10);
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
