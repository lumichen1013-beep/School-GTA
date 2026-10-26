import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollidableBox } from './CampusWorld';

export interface SearchlightItem {
  id: number;
  towerPos: THREE.Vector3;
  housing: THREE.Group;
  coneMesh: THREE.Mesh;
  groundSpot: THREE.Mesh;
  currentGroundPos: THREE.Vector3;
  angle: number;
  speed: number;
  radiusX: number;
  radiusZ: number;
  centerX: number;
  centerZ: number;
  isDetecting: boolean;
}

export class DetentionWorld {
  public scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();
  public colliders: CollidableBox[] = [];

  // 少年院關鍵點位
  public spawnPos: THREE.Vector3 = new THREE.Vector3(0, 0, 10);
  public commissaryPos: THREE.Vector3 = new THREE.Vector3(38, 0, -46); // 食堂福利社取餐/補給窗口
  public pullupStationPos: THREE.Vector3 = new THREE.Vector3(-12, 0, 10); // 單槓訓練區
  public benchpressStationPos: THREE.Vector3 = new THREE.Vector3(12, 0, 10); // 臥推訓練區
  public tireStationPos: THREE.Vector3 = new THREE.Vector3(0, 0, -8); // 巨型輪胎翻滾區
  public barracksPos: THREE.Vector3 = new THREE.Vector3(-45, 0, -50); // 集訓營舍
  public hqPos: THREE.Vector3 = new THREE.Vector3(45, 0, 45); // 教官總部
  public workshopPos: THREE.Vector3 = new THREE.Vector3(-45, 0, 45); // 實習工廠
  public gatePos: THREE.Vector3 = new THREE.Vector3(0, 0, 88); // 少年院正門

  // 4 具動態高空探照燈
  public searchlights: SearchlightItem[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);

    // 第二世界專屬環境補光 (附加於 this.group，隨世界切換自動隱藏/顯示，完全不影響第一世界)
    const detentionAmbientFill = new THREE.HemisphereLight(0xffffff, 0x99aebb, 0.40);
    detentionAmbientFill.position.set(0, 50, 0);
    this.group.add(detentionAmbientFill);

    this.buildDetentionFacility();
  }

  // 註冊垂直阻擋物體 (牆面、立柱、鐵欄杆、設施等)
  public addCollider(minX: number, maxX: number, minZ: number, maxZ: number, minY: number = 0, maxY: number = 5) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), minY, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), maxY, Math.max(minZ, maxZ))
    });
  }

  // 註冊可站立行走的地板層板 (Floor Slabs) - isFloorOnly 不阻礙水平位移
  public addFloorSlab(minX: number, maxX: number, minZ: number, maxZ: number, floorY: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), floorY - 0.25, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), floorY + 0.25, Math.max(minZ, maxZ)),
      isFloorOnly: true
    });
  }

  // 註冊可平滑行走的斜坡 (Ramps)
  public addRamp(minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), minY, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), maxY, Math.max(minZ, maxZ)),
      isFloorOnly: true,
      isRamp: true,
      rampMinZ: Math.min(minZ, maxZ),
      rampMaxZ: Math.max(minZ, maxZ),
      rampYAtMinZ: minY,
      rampYAtMaxZ: maxY
    });
  }

  private buildDetentionFacility() {
    // 依材質分類集中幾何體，利用 mergeGeometries 大幅減少 Draw Calls
    const groundMudGeos: THREE.BufferGeometry[] = [];
    const groundTrackGeos: THREE.BufferGeometry[] = [];
    const concreteGeos: THREE.BufferGeometry[] = [];
    const darkSteelGeos: THREE.BufferGeometry[] = [];
    const rustedMetalGeos: THREE.BufferGeometry[] = [];
    const fenceWireGeos: THREE.BufferGeometry[] = [];
    const corrugatedIronGeos: THREE.BufferGeometry[] = [];
    const yellowHazardGeos: THREE.BufferGeometry[] = [];
    const woodPlankGeos: THREE.BufferGeometry[] = [];
    const glassGeos: THREE.BufferGeometry[] = [];
    const tireRubberGeos: THREE.BufferGeometry[] = [];

    // ==========================================
    // 1. 地面與泥濘大操場 (200m × 200m)
    // ==========================================
    // 泥濘基底
    const baseGroundGeo = new THREE.PlaneGeometry(210, 210, 16, 16);
    baseGroundGeo.rotateX(-Math.PI / 2);
    groundMudGeos.push(baseGroundGeo);

    // 操場外環紅泥粗砂跑道 (寬 6m，140m × 140m 圓角矩形/環狀)
    const trackStraight1 = new THREE.BoxGeometry(6, 0.03, 110);
    trackStraight1.translate(-60, 0.015, 0);
    const trackStraight2 = new THREE.BoxGeometry(6, 0.03, 110);
    trackStraight2.translate(60, 0.015, 0);
    const trackStraight3 = new THREE.BoxGeometry(110, 0.03, 6);
    trackStraight3.translate(0, 0.015, -55);
    const trackStraight4 = new THREE.BoxGeometry(110, 0.03, 6);
    trackStraight4.translate(0, 0.015, 55);
    groundTrackGeos.push(trackStraight1, trackStraight2, trackStraight3, trackStraight4);

    // 南大門主幹道泥石路 (寬 10m，長 70m，Z: 30 ~ 95)
    const roadGeo = new THREE.BoxGeometry(10, 0.04, 65);
    roadGeo.translate(0, 0.02, 62.5);
    groundTrackGeos.push(roadGeo);

    // 泥水積水坑窪 (凹凸泥潭質感，平貼地表帶有微光)
    const puddlePositions = [
      { x: -5, z: 2, w: 12, h: 8 },
      { x: 8, z: -18, w: 14, h: 10 },
      { x: -22, z: -8, w: 10, h: 7 },
      { x: 18, z: 12, w: 9, h: 9 }
    ];
    for (const p of puddlePositions) {
      const puddle = new THREE.BoxGeometry(p.w, 0.02, p.h);
      puddle.translate(p.x, 0.03, p.z);
      rustedMetalGeos.push(puddle);
    }

    // ==========================================
    // 2. 外圍高大鐵絲網鋼網與大鐵門 (高 7.5m)
    // ==========================================
    const fenceBounds = [
      { startX: -95, endX: 95, z: -95, isZ: false }, // 北牆
      { startX: -95, endX: -10, z: 95, isZ: false }, // 南牆西側
      { startX: 10, endX: 95, z: 95, isZ: false },  // 南牆東側
      { startZ: -95, endZ: 95, x: -95, isZ: true },  // 西牆
      { startZ: -95, endZ: 95, x: 95, isZ: true }   // 東牆
    ];

    // 圍牆混凝土矮基座 (厚 0.6m, 高 0.9m)
    for (const f of fenceBounds) {
      if (!f.isZ) {
        const len = f.endX! - f.startX!;
        const cx = (f.startX! + f.endX!) / 2;
        const curb = new THREE.BoxGeometry(len, 0.9, 0.6);
        curb.translate(cx, 0.45, f.z!);
        concreteGeos.push(curb);
        this.addCollider(f.startX!, f.endX!, f.z! - 0.3, f.z! + 0.3, 0, 8.0);

        // 鐵絲網面 (高 6.6m)
        const mesh = new THREE.BoxGeometry(len, 6.6, 0.08);
        mesh.translate(cx, 4.2, f.z!);
        fenceWireGeos.push(mesh);

        // 鋼管立柱 (每 6m 一根)
        for (let x = f.startX!; x <= f.endX!; x += 6) {
          const post = new THREE.CylinderGeometry(0.12, 0.12, 7.5, 8);
          post.translate(x, 3.75, f.z!);
          darkSteelGeos.push(post);
          // 頂端 45 度外傾刺絲懸臂
          const arm = new THREE.BoxGeometry(0.08, 0.8, 0.08);
          arm.rotateX(Math.PI / 4);
          arm.translate(x, 7.6, f.z! + 0.25);
          darkSteelGeos.push(arm);
        }
      } else {
        const len = f.endZ! - f.startZ!;
        const cz = (f.startZ! + f.endZ!) / 2;
        const curb = new THREE.BoxGeometry(0.6, 0.9, len);
        curb.translate(f.x!, 0.45, cz);
        concreteGeos.push(curb);
        this.addCollider(f.x! - 0.3, f.x! + 0.3, f.startZ!, f.endZ!, 0, 8.0);

        const mesh = new THREE.BoxGeometry(0.08, 6.6, len);
        mesh.translate(f.x!, 4.2, cz);
        fenceWireGeos.push(mesh);

        for (let z = f.startZ!; z <= f.endZ!; z += 6) {
          const post = new THREE.CylinderGeometry(0.12, 0.12, 7.5, 8);
          post.translate(f.x!, 3.75, z);
          darkSteelGeos.push(post);
          const arm = new THREE.BoxGeometry(0.08, 0.8, 0.08);
          arm.rotateZ(Math.PI / 4);
          arm.translate(f.x! + 0.25, 7.6, z);
          darkSteelGeos.push(arm);
        }
      }
    }

    // 南大門入口 (Z = 95, X: -10 ~ 10)：警衛哨所與重型鋼門柱
    const gatePostL = new THREE.BoxGeometry(1.4, 7.5, 1.4);
    gatePostL.translate(-10, 3.75, 95);
    const gatePostR = new THREE.BoxGeometry(1.4, 7.5, 1.4);
    gatePostR.translate(10, 3.75, 95);
    concreteGeos.push(gatePostL, gatePostR);
    this.addCollider(-10.8, -9.2, 94.2, 95.8, 0, 8.0);
    this.addCollider(9.2, 10.8, 94.2, 95.8, 0, 8.0);

    // 門楣鋼樑與特訓院標誌牌
    const archBeam = new THREE.BoxGeometry(22, 1.4, 1.0);
    archBeam.translate(0, 7.0, 95);
    darkSteelGeos.push(archBeam);

    const signBoard = new THREE.BoxGeometry(16, 1.0, 0.3);
    signBoard.translate(0, 7.0, 95.5);
    rustedMetalGeos.push(signBoard);

    // 大門警衛哨所 (X: -13, Z: 91, 4m × 4m × 3.6m)
    const sentryHouse = new THREE.BoxGeometry(4.2, 3.6, 4.2);
    sentryHouse.translate(-13, 1.8, 91);
    concreteGeos.push(sentryHouse);
    this.addCollider(-15.2, -10.8, 88.8, 93.2, 0, 4.0);

    // 哨所窗戶玻璃
    const sentryWin = new THREE.BoxGeometry(2.4, 1.2, 0.2);
    sentryWin.translate(-13, 2.0, 93.15);
    glassGeos.push(sentryWin);

    // 雙扇重型鋼柵防暴大門 (永遠關閉封鎖狀態，加裝粗壯橫跨鎖樑與重型鎖鍊警示板)
    const leftDoor = new THREE.BoxGeometry(10.2, 6.6, 0.25);
    leftDoor.translate(-5.0, 3.3, 95.0);
    const rightDoor = new THREE.BoxGeometry(10.2, 6.6, 0.25);
    rightDoor.translate(5.0, 3.3, 95.0);
    darkSteelGeos.push(leftDoor, rightDoor);

    // 重型橫跨鎖樑 (長 20.4m, 貫穿鎖死大門)
    const lockBeam = new THREE.BoxGeometry(20.4, 0.45, 0.45);
    lockBeam.translate(0, 3.3, 95.25);
    darkSteelGeos.push(lockBeam);

    // 鎖死門牌警示告示板「第七特訓院 · 嚴禁出入 · 鐵門常閉」
    const gateLockedSign = new THREE.BoxGeometry(10.0, 1.1, 0.3);
    gateLockedSign.translate(0, 4.8, 95.25);
    yellowHazardGeos.push(gateLockedSign);

    // 中央巨型鎖具固定鋼箱
    const gateLockBox = new THREE.BoxGeometry(1.6, 1.8, 0.5);
    gateLockBox.translate(0, 3.3, 95.3);
    rustedMetalGeos.push(gateLockBox);

    // 大門永久實體阻擋碰撞體 (X: -10.5 ~ 10.5, Z: 94.2 ~ 95.8, 高度 8.0m 全面封閉)
    this.addCollider(-10.5, 10.5, 94.2, 95.8, 0, 8.0);

    // ==========================================
    // 3. 四座高聳瞭望塔 (四角 Watchtowers)
    // ==========================================
    const towerCoords = [
      { x: -78, z: -78 },
      { x: 78, z: -78 },
      { x: -78, z: 78 },
      { x: 78, z: 78 }
    ];

    for (let i = 0; i < towerCoords.length; i++) {
      const tc = towerCoords[i];
      // 4 根傾斜鋼管支柱 (高 13.5m)
      const legDist = 2.6;
      const legPositions = [
        { x: tc.x - legDist, z: tc.z - legDist },
        { x: tc.x + legDist, z: tc.z - legDist },
        { x: tc.x - legDist, z: tc.z + legDist },
        { x: tc.x + legDist, z: tc.z + legDist }
      ];

      for (const lp of legPositions) {
        const leg = new THREE.CylinderGeometry(0.18, 0.24, 13.5, 8);
        leg.translate(lp.x, 6.75, lp.z);
        darkSteelGeos.push(leg);
        this.addCollider(lp.x - 0.35, lp.x + 0.35, lp.z - 0.35, lp.z + 0.35, 0, 13.5);
      }

      // 橫向與斜向加強鋼桁架
      for (let y = 3.5; y <= 11; y += 3.5) {
        const frameX1 = new THREE.BoxGeometry(legDist * 2, 0.15, 0.15);
        frameX1.translate(tc.x, y, tc.z - legDist);
        const frameX2 = new THREE.BoxGeometry(legDist * 2, 0.15, 0.15);
        frameX2.translate(tc.x, y, tc.z + legDist);
        const frameZ1 = new THREE.BoxGeometry(0.15, 0.15, legDist * 2);
        frameZ1.translate(tc.x - legDist, y, tc.z);
        const frameZ2 = new THREE.BoxGeometry(0.15, 0.15, legDist * 2);
        frameZ2.translate(tc.x + legDist, y, tc.z);
        darkSteelGeos.push(frameX1, frameX2, frameZ1, frameZ2);
      }

      // 頂部觀測平台 (Y = 13.0m, 6.5m × 6.5m × 0.35m)
      const platform = new THREE.BoxGeometry(6.5, 0.35, 6.5);
      platform.translate(tc.x, 13.0, tc.z);
      concreteGeos.push(platform);
      this.addFloorSlab(tc.x - 3.2, tc.x + 3.2, tc.z - 3.2, tc.z + 3.2, 13.0);

      // 平台護欄 (高 1.2m)
      const railN = new THREE.BoxGeometry(6.5, 1.2, 0.08);
      railN.translate(tc.x, 13.7, tc.z - 3.2);
      const railS = new THREE.BoxGeometry(6.5, 1.2, 0.08);
      railS.translate(tc.x, 13.7, tc.z + 3.2);
      const railW = new THREE.BoxGeometry(0.08, 1.2, 6.5);
      railW.translate(tc.x - 3.2, 13.7, tc.z);
      const railE = new THREE.BoxGeometry(0.08, 1.2, 6.5);
      railE.translate(tc.x + 3.2, 13.7, tc.z);
      fenceWireGeos.push(railN, railS, railW, railE);
      this.addCollider(tc.x - 3.3, tc.x + 3.3, tc.z - 3.3, tc.z + 3.3, 13.0, 15.0);

      // 塔頂哨兵觀察亭 (3.6m × 3.6m × 2.6m)
      const cabin = new THREE.BoxGeometry(3.6, 2.6, 3.6);
      cabin.translate(tc.x, 14.5, tc.z);
      corrugatedIronGeos.push(cabin);

      // 塔頂波浪鐵皮頂棚
      const roof = new THREE.BoxGeometry(7.0, 0.25, 7.0);
      roof.translate(tc.x, 16.0, tc.z);
      corrugatedIronGeos.push(roof);

      // 建立動態探照燈 (置於瞭望塔前沿 Y = 13.5m)
      this.createSearchlight(i, new THREE.Vector3(tc.x, 13.6, tc.z));
    }

    // ==========================================
    // 4. 集訓營舍大樓 (2層鋼構大樓，X: -65 ~ -15, Z: -75 ~ -45)
    // ==========================================
    const bW = 50, bH = 8.5, bD = 30;
    const bCx = -40, bCz = -60;

    // 1F 地面混凝土基台
    const bBase = new THREE.BoxGeometry(bW + 2, 0.5, bD + 2);
    bBase.translate(bCx, 0.25, bCz);
    concreteGeos.push(bBase);

    // 主建築主體牆面
    const bMain = new THREE.BoxGeometry(bW, bH, bD);
    bMain.translate(bCx, bH / 2 + 0.5, bCz);
    concreteGeos.push(bMain);
    this.addCollider(bCx - bW / 2, bCx + bW / 2, bCz - bD / 2, bCz + bD / 2, 0, bH + 0.5);

    // 2F 外掛鋼架走廊平台 (Floor Y = 4.5m，延伸到南側面向操場 Z: -45)
    const walkwayW = bW - 4;
    const walkwayD = 4.2;
    const walkwayY = 4.5;
    const walkwayZ = bCz + bD / 2 + walkwayD / 2;
    const walkwayFloor = new THREE.BoxGeometry(walkwayW, 0.35, walkwayD);
    walkwayFloor.translate(bCx, walkwayY, walkwayZ);
    darkSteelGeos.push(walkwayFloor);
    this.addFloorSlab(bCx - walkwayW / 2, bCx + walkwayW / 2, walkwayZ - walkwayD / 2, walkwayZ + walkwayD / 2, walkwayY);

    // 2F 走廊外圍安全鐵欄杆
    const wRail = new THREE.BoxGeometry(walkwayW, 1.2, 0.08);
    wRail.translate(bCx, walkwayY + 0.7, walkwayZ + walkwayD / 2);
    fenceWireGeos.push(wRail);
    this.addCollider(bCx - walkwayW / 2, bCx + walkwayW / 2, walkwayZ + walkwayD / 2 - 0.15, walkwayZ + walkwayD / 2 + 0.15, walkwayY, walkwayY + 1.4);

    // 2F 支撐鋼立柱 (從地面延伸支撐 2F 走廊)
    for (let x = bCx - walkwayW / 2 + 3; x <= bCx + walkwayW / 2 - 3; x += 7) {
      const pCol = new THREE.CylinderGeometry(0.16, 0.16, walkwayY, 8);
      pCol.translate(x, walkwayY / 2, walkwayZ + walkwayD / 2);
      darkSteelGeos.push(pCol);
      this.addCollider(x - 0.25, x + 0.25, walkwayZ + walkwayD / 2 - 0.25, walkwayZ + walkwayD / 2 + 0.25, 0, walkwayY);
    }

    // 通往 2F 的重型工業鋼架樓梯 (從地面 Y: 0 爬升至 Y: 4.5, 寬 3.0m, 長 8.5m)
    const stairX = bCx + walkwayW / 2 - 1.5;
    const stairStartZ = walkwayZ + walkwayD / 2 + 8.5;
    const stairEndZ = walkwayZ + walkwayD / 2;
    const numSteps = 18;
    for (let s = 0; s < numSteps; s++) {
      const t = s / numSteps;
      const stepY = t * walkwayY;
      const stepZ = THREE.MathUtils.lerp(stairStartZ, stairEndZ, t);
      const stepMesh = new THREE.BoxGeometry(3.0, 0.25, 8.5 / numSteps + 0.05);
      stepMesh.translate(stairX, stepY + 0.12, stepZ);
      darkSteelGeos.push(stepMesh);
    }
    // 樓梯斜坡碰撞體，保證玩家如履平地流暢走上 2F！
    this.addRamp(stairX - 1.6, stairX + 1.6, stairEndZ, stairStartZ, 0, walkwayY);

    // 宿舍窗戶安全鐵護欄 (每間宿舍窗口有粗鐵欄杆)
    for (let x = bCx - bW / 2 + 4; x <= bCx + bW / 2 - 4; x += 5.5) {
      const bars1F = new THREE.BoxGeometry(2.2, 1.8, 0.12);
      bars1F.translate(x, 2.5, bCz + bD / 2 + 0.08);
      const bars2F = new THREE.BoxGeometry(2.2, 1.8, 0.12);
      bars2F.translate(x, walkwayY + 2.2, bCz + bD / 2 + 0.08);
      darkSteelGeos.push(bars1F, bars2F);
    }

    // 營舍大樓金屬門楣看板「特訓第一營舍」
    const bSign = new THREE.BoxGeometry(10, 1.2, 0.3);
    bSign.translate(bCx, bH + 0.2, bCz + bD / 2 + 0.2);
    rustedMetalGeos.push(bSign);

    // ==========================================
    // 5. 特訓食堂與福利社 (X: 25 ~ 75, Z: -75 ~ -45)
    // ==========================================
    const cW = 50, cH = 6.2, cD = 30;
    const cCx = 50, cCz = -60;

    const cBase = new THREE.BoxGeometry(cW + 1, 0.4, cD + 1);
    cBase.translate(cCx, 0.2, cCz);
    concreteGeos.push(cBase);

    const cMain = new THREE.BoxGeometry(cW, cH, cD);
    cMain.translate(cCx, cH / 2 + 0.4, cCz);
    concreteGeos.push(cMain);
    this.addCollider(cCx - cW / 2, cCx + cW / 2, cCz - cD / 2, cCz + cD / 2, 0, cH + 0.4);

    // 戶外取餐大門與前廊 (前廊雨棚)
    const cCanopy = new THREE.BoxGeometry(16, 0.3, 5);
    cCanopy.translate(38, 3.8, -42.5);
    corrugatedIronGeos.push(cCanopy);

    // 福利社窗口吧台 (互動點所在)
    const counter = new THREE.BoxGeometry(5.5, 1.1, 1.2);
    counter.translate(38, 0.55, -45.6);
    concreteGeos.push(counter);
    this.addCollider(35.0, 41.0, -46.5, -44.5, 0, 1.5);

    // 食堂招牌「特訓營養食堂 · 補給福利站」
    const cSign = new THREE.BoxGeometry(14, 1.2, 0.2);
    cSign.translate(38, 4.4, -42.5);
    yellowHazardGeos.push(cSign);

    // 長條鋼製餐桌與金屬圓凳組 (8 組)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const tx = 28 + col * 5.5;
        const tz = -38 + row * 4.5;
        const table = new THREE.BoxGeometry(3.6, 0.85, 1.2);
        table.translate(tx, 0.42, tz);
        darkSteelGeos.push(table);
        this.addCollider(tx - 1.9, tx + 1.9, tz - 0.7, tz + 0.7, 0, 1.0);

        // 圓凳
        const stool1 = new THREE.CylinderGeometry(0.24, 0.24, 0.5, 8);
        stool1.translate(tx, 0.25, tz - 0.9);
        const stool2 = new THREE.CylinderGeometry(0.24, 0.24, 0.5, 8);
        stool2.translate(tx, 0.25, tz + 0.9);
        darkSteelGeos.push(stool1, stool2);
      }
    }

    // ==========================================
    // 6. 實習工廠 (Workshop, X: -75 ~ -30, Z: 30 ~ 70)
    // ==========================================
    const wkW = 45, wkH = 7.5, wkD = 40;
    const wkCx = -52.5, wkCz = 50;

    const wkBase = new THREE.BoxGeometry(wkW + 1, 0.4, wkD + 1);
    wkBase.translate(wkCx, 0.2, wkCz);
    concreteGeos.push(wkBase);

    // 鐵皮外牆
    const wkMain = new THREE.BoxGeometry(wkW, wkH, wkD);
    wkMain.translate(wkCx, wkH / 2 + 0.4, wkCz);
    corrugatedIronGeos.push(wkMain);
    this.addCollider(wkCx - wkW / 2, wkCx + wkW / 2, wkCz - wkD / 2, wkCz + wkD / 2, 0, wkH + 0.4);

    // 工廠大捲門 (寬 8m, 高 4.5m)
    const rollDoor = new THREE.BoxGeometry(8.2, 4.5, 0.3);
    rollDoor.translate(-40, 2.25, 29.8);
    rustedMetalGeos.push(rollDoor);

    // 堆疊木質貨物棧板與金屬工件箱
    const palletPositions = [
      { x: -35, z: 25, h: 1.5 },
      { x: -32, z: 24, h: 2.2 },
      { x: -28, z: 32, h: 1.8 }
    ];
    for (const p of palletPositions) {
      const pallet = new THREE.BoxGeometry(2.4, p.h, 2.4);
      pallet.translate(p.x, p.h / 2, p.z);
      woodPlankGeos.push(pallet);
      this.addCollider(p.x - 1.3, p.x + 1.3, p.z - 1.3, p.z + 1.3, 0, p.h);
    }

    // 招牌「第一機械實習工廠」
    const wkSign = new THREE.BoxGeometry(10, 1.2, 0.2);
    wkSign.translate(-40, 5.2, 29.8);
    yellowHazardGeos.push(wkSign);

    // ==========================================
    // 7. 教官總部大樓 (Command HQ, X: 30 ~ 75, Z: 30 ~ 70)
    // ==========================================
    const hqW = 45, hqH = 9.0, hqD = 40;
    const hqCx = 52.5, hqCz = 50;

    const hqBase = new THREE.BoxGeometry(hqW + 2, 0.6, hqD + 2);
    hqBase.translate(hqCx, 0.3, hqCz);
    concreteGeos.push(hqBase);

    const hqMain = new THREE.BoxGeometry(hqW, hqH, hqD);
    hqMain.translate(hqCx, hqH / 2 + 0.6, hqCz);
    concreteGeos.push(hqMain);
    this.addCollider(hqCx - hqW / 2, hqCx + hqW / 2, hqCz - hqD / 2, hqCz + hqD / 2, 0, hqH + 0.6);

    // 莊嚴門廊立柱與雙層雨棚
    const portico = new THREE.BoxGeometry(14, 0.5, 6);
    portico.translate(45, 5.5, 27);
    concreteGeos.push(portico);

    const hqPillar1 = new THREE.CylinderGeometry(0.35, 0.35, 5.5, 12);
    hqPillar1.translate(40, 2.75, 25);
    const hqPillar2 = new THREE.CylinderGeometry(0.35, 0.35, 5.5, 12);
    hqPillar2.translate(50, 2.75, 25);
    concreteGeos.push(hqPillar1, hqPillar2);
    this.addCollider(39.5, 40.5, 24.5, 25.5, 0, 5.5);
    this.addCollider(49.5, 50.5, 24.5, 25.5, 0, 5.5);

    // 總部銘牌「第七少年特訓院 · 嚴格訓育指揮總部」
    const hqSign = new THREE.BoxGeometry(12, 1.2, 0.2);
    hqSign.translate(45, 6.4, 27);
    rustedMetalGeos.push(hqSign);

    // 樓頂警戒通訊雷達與旗桿
    const radarPole = new THREE.CylinderGeometry(0.08, 0.12, 6.0, 8);
    radarPole.translate(hqCx, hqH + 3.6, hqCz);
    darkSteelGeos.push(radarPole);

    const radarDish = new THREE.CylinderGeometry(1.6, 0.4, 0.3, 16);
    radarDish.rotateX(Math.PI / 4);
    radarDish.translate(hqCx, hqH + 6.0, hqCz);
    darkSteelGeos.push(radarDish);

    // ==========================================
    // 8. 中央泥濘體能大操場設施 (單槓、臥推、巨型輪胎組)
    // ==========================================
    // 8.1 多聯排單槓組 (Pull-Up Bar Rig, X: -16 ~ -8, Z: 6 ~ 14)
    const barStartX = -16;
    for (let b = 0; b < 3; b++) {
      const bx = barStartX + b * 4.0;
      const barH = 2.4 + b * 0.3; // 2.4m, 2.7m, 3.0m

      // 左立柱與右立柱
      const post1 = new THREE.CylinderGeometry(0.06, 0.06, barH, 8);
      post1.translate(bx, barH / 2, 8);
      const post2 = new THREE.CylinderGeometry(0.06, 0.06, barH, 8);
      post2.translate(bx + 3.5, barH / 2, 8);

      // 橫槓
      const horizBar = new THREE.CylinderGeometry(0.035, 0.035, 3.5, 8);
      horizBar.rotateZ(Math.PI / 2);
      horizBar.translate(bx + 1.75, barH - 0.05, 8);

      darkSteelGeos.push(post1, post2, horizBar);
      this.addCollider(bx - 0.2, bx + 0.2, 7.8, 8.2, 0, barH);
      this.addCollider(bx + 3.3, bx + 3.7, 7.8, 8.2, 0, barH);
    }

    // 8.2 臥推架設施 (Bench Press Racks, X: 8 ~ 16, Z: 6 ~ 14)
    const benchPositions = [
      { x: 10, z: 8 },
      { x: 14, z: 8 },
      { x: 12, z: 12 }
    ];
    for (const bp of benchPositions) {
      // 臥推平椅
      const benchPad = new THREE.BoxGeometry(1.8, 0.12, 0.45);
      benchPad.translate(bp.x, 0.45, bp.z);
      concreteGeos.push(benchPad);
      this.addCollider(bp.x - 1.0, bp.x + 1.0, bp.z - 0.3, bp.z + 0.3, 0, 0.7);

      // 槓鈴立架
      const standL = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8);
      standL.translate(bp.x - 0.7, 0.55, bp.z - 0.3);
      const standR = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8);
      standR.translate(bp.x + 0.7, 0.55, bp.z - 0.3);
      darkSteelGeos.push(standL, standR);

      // 奧林匹克黑鐵槓鈴桿與重槓鈴片
      const barbellBar = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8);
      barbellBar.rotateZ(Math.PI / 2);
      barbellBar.translate(bp.x, 1.05, bp.z - 0.3);

      const plateL1 = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12);
      plateL1.rotateZ(Math.PI / 2);
      plateL1.translate(bp.x - 0.9, 1.05, bp.z - 0.3);

      const plateR1 = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12);
      plateR1.rotateZ(Math.PI / 2);
      plateR1.translate(bp.x + 0.9, 1.05, bp.z - 0.3);

      darkSteelGeos.push(barbellBar, plateL1, plateR1);
    }

    // 8.3 巨型拖拉機重訓輪胎組 (Giant Tractor Tires, X: -6 ~ 6, Z: -15 ~ -4)
    // 躺平放置輪胎 (可供踩跳翻滾)
    const flatTirePositions = [
      { x: -3.5, z: -8, r: 1.4, h: 0.7 },
      { x: 3.5, z: -8, r: 1.4, h: 0.7 },
      { x: -1.0, z: -13, r: 1.5, h: 0.8 },
      { x: 4.0, z: -13, r: 1.3, h: 0.65 }
    ];
    for (const tp of flatTirePositions) {
      const tire = new THREE.CylinderGeometry(tp.r, tp.r, tp.h, 16);
      tire.translate(tp.x, tp.h / 2, tp.z);
      tireRubberGeos.push(tire);
      this.addFloorSlab(tp.x - tp.r, tp.x + tp.r, tp.z - tp.r, tp.z + tp.r, tp.h);
      this.addCollider(tp.x - tp.r * 0.9, tp.x + tp.r * 0.9, tp.z - tp.r * 0.9, tp.z + tp.r * 0.9, 0, tp.h);
    }

    // 半埋入泥土中成排直立輪胎 (障礙跨欄)
    for (let i = 0; i < 5; i++) {
      const x = -8 + i * 1.5;
      const buriedTire = new THREE.TorusGeometry(1.1, 0.35, 8, 16);
      buriedTire.rotateY(Math.PI / 2);
      buriedTire.translate(x, 0.6, -4);
      tireRubberGeos.push(buriedTire);
      this.addCollider(x - 0.3, x + 0.3, -5.2, -2.8, 0, 1.6);
    }

    // 8.4 雙槓訓練架 (Parallel Dip Bars, X: -10 ~ -6, Z: 0)
    for (let i = 0; i < 2; i++) {
      const dx = -9 + i * 2.5;
      const dipBar1 = new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8);
      dipBar1.rotateX(Math.PI / 2);
      dipBar1.translate(dx - 0.4, 1.2, 0);

      const dipBar2 = new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8);
      dipBar2.rotateX(Math.PI / 2);
      dipBar2.translate(dx + 0.4, 1.2, 0);

      darkSteelGeos.push(dipBar1, dipBar2);
      this.addCollider(dx - 0.55, dx + 0.55, -1.3, 1.3, 0, 1.3);
    }

    // ==========================================
    // 9. 幾何體合併 (mergeGeometries) 產出低 Draw Call Mesh
    // 配色全面升級：明亮清爽的軍規特訓學院風貌，告別幽暗污濁，確保全景視野清晰通透
    // ==========================================
    const mudMat = new THREE.MeshLambertMaterial({
      color: 0xc2b5a3 // 明亮溫潤的特訓校場沙洲礫石地表 (反射率高、寬闊明朗)
    });
    const trackMat = new THREE.MeshLambertMaterial({
      color: 0xc05d43 // 鮮明亮麗的紅土/磚紅專業體能環形跑道
    });
    const concreteMat = new THREE.MeshLambertMaterial({
      color: 0xdfe6ec // 現代工業建築淺灰白色石灰石混泥土 (營舍、總部、工廠大樓全面明亮化)
    });
    const darkSteelMat = new THREE.MeshLambertMaterial({
      color: 0x5c728a // 清晰鍍鋅金屬藍灰鋼架 (瞭望塔柱、樓梯、單槓立柱，具備金屬高光)
    });
    const rustedMetalMat = new THREE.MeshLambertMaterial({
      color: 0x5dade2 // 清澈天藍反射水窪積水鏡面與鍍鋅鋼板
    });
    const fenceWireMat = new THREE.MeshLambertMaterial({
      color: 0xa4b0be, // 明亮鍍鋅防攀刺鐵絲網
      transparent: true,
      opacity: 0.60,
      side: THREE.DoubleSide
    });
    const corrugatedMat = new THREE.MeshLambertMaterial({
      color: 0x4a779d // 醒目鮮明的地中海海軍鋼藍波浪鐵皮頂棚
    });
    const yellowHazardMat = new THREE.MeshLambertMaterial({
      color: 0xf1c40f // 亮麗警示高光金黃色 (招牌、防撞邊緣)
    });
    const woodPlankMat = new THREE.MeshLambertMaterial({
      color: 0xd7ccc8 // 明亮淺色松木/白樺木質棧板與長椅
    });
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0xa0e7e5, // 通透亮麗的淺青藍採光建築玻璃
      transparent: true,
      opacity: 0.60
    });
    const tireRubberMat = new THREE.MeshLambertMaterial({
      color: 0x4b5563 // 質感板岩灰啞光重訓輪胎，立體結構清晰分明
    });

    const createMergedMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (geos.length === 0) return;
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    };

    createMergedMesh(groundMudGeos, mudMat);
    createMergedMesh(groundTrackGeos, trackMat);
    createMergedMesh(concreteGeos, concreteMat);
    createMergedMesh(darkSteelGeos, darkSteelMat);
    createMergedMesh(rustedMetalGeos, rustedMetalMat);
    createMergedMesh(fenceWireGeos, fenceWireMat);
    createMergedMesh(corrugatedIronGeos, corrugatedMat);
    createMergedMesh(yellowHazardGeos, yellowHazardMat);
    createMergedMesh(woodPlankGeos, woodPlankMat);
    createMergedMesh(glassGeos, glassMat);
    createMergedMesh(tireRubberGeos, tireRubberMat);
  }

  // 建立動態旋轉高空探照燈 (安裝在瞭望塔 Y = 13.6m)
  private createSearchlight(index: number, towerPos: THREE.Vector3) {
    const housing = new THREE.Group();
    housing.position.copy(towerPos);

    // 探照燈金屬外殼與聚光透鏡
    const casing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 0.9, 12),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    casing.rotation.x = Math.PI / 2;
    housing.add(casing);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4aa })
    );
    lens.position.z = 0.46;
    housing.add(lens);

    this.group.add(housing);

    // 3D 半透明光錐 (ConeGeometry, 頂部在塔頂，底部位於地面)
    const coneHeight = 15.0;
    const coneRadius = 3.6;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 16, 1, true);
    coneGeo.translate(0, -coneHeight / 2, 0); // 頂點錨點置於 (0, 0, 0)
    coneGeo.rotateX(-Math.PI / 2); // 朝向前方

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    housing.add(coneMesh);

    // 地面投射光斑 (圓盤光圈，貼地 Y = 0.06)
    const spotGeo = new THREE.RingGeometry(0.1, 3.6, 24);
    spotGeo.rotateX(-Math.PI / 2);
    const spotMat = new THREE.MeshBasicMaterial({
      color: 0xfff5cc,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const groundSpot = new THREE.Mesh(spotGeo, spotMat);
    groundSpot.position.set(towerPos.x * 0.45, 0.06, towerPos.z * 0.45);
    this.group.add(groundSpot);

    // 探照燈巡邏運動參數 (不同相位與旋轉頻率，使光錐覆蓋整個操場與建築周邊)
    const phases = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    const speeds = [0.45, 0.38, 0.52, 0.42];
    const radiusesX = [26, 32, 28, 30];
    const radiusesZ = [24, 28, 32, 26];
    const centerXs = [-20, 20, -25, 25];
    const centerZs = [-15, -15, 15, 15];

    this.searchlights.push({
      id: index,
      towerPos: towerPos.clone(),
      housing,
      coneMesh,
      groundSpot,
      currentGroundPos: groundSpot.position.clone(),
      angle: phases[index % 4],
      speed: speeds[index % 4],
      radiusX: radiusesX[index % 4],
      radiusZ: radiusesZ[index % 4],
      centerX: centerXs[index % 4],
      centerZ: centerZs[index % 4],
      isDetecting: false
    });
  }

  // 幀迴圈更新探照燈掃視與警戒檢測 (動態追蹤玩家 + 移動速度合理平滑化，告別瞬間爆衝)
  public update(delta: number, playerPos: THREE.Vector3): { isDetectedBySearchlight: boolean; nearestDist: number } {
    let anyDetected = false;
    let minDistance = 999;

    const _scratchLook = new THREE.Vector3();
    const isPlayerOutdoors = playerPos.y < 3.0;

    // 合理平滑速度：
    // 玩家正常步行 5.0 m/s，疾跑 10.0 m/s
    // 探照燈平時追蹤速度設為 4.8 m/s：給予緊湊的追逐壓迫感，且玩家疾跑或滑步/閃身步能及時擺脫甩開
    const trackingSpeed = 4.8;
    const sweepSpeed = 2.8;

    for (const sl of this.searchlights) {
      sl.angle += delta * 0.75; // 穩定平順的探查掃描週期

      let targetX = 0;
      let targetZ = 0;
      let moveSpeed = trackingSpeed;

      if (isPlayerOutdoors) {
        // 儘量追蹤玩家：四角哨塔探照燈動態轉向並追蹤玩家所在方位
        // 附加 ±3.6m 模擬哨兵微幅晃動巡查扇面，四座塔各有不同相位，不會疊成單一點
        const phaseOffset = sl.id * 1.5708; // 每座塔相差 90 度
        const sweepOffsetX = Math.cos(sl.angle + phaseOffset) * 3.6;
        const sweepOffsetZ = Math.sin(sl.angle * 1.25 + phaseOffset) * 3.6;

        targetX = playerPos.x + sweepOffsetX;
        targetZ = playerPos.z + sweepOffsetZ;
        moveSpeed = trackingSpeed;
      } else {
        // 進入建築掩體時失去追蹤目標，回到各區域外圍穩定巡邏
        targetX = sl.centerX + Math.cos(sl.angle * 0.4) * (sl.radiusX * 0.6);
        targetZ = sl.centerZ + Math.sin(sl.angle * 0.5) * (sl.radiusZ * 0.6);
        moveSpeed = sweepSpeed;
      }

      // 限制光斑在特訓校場圍牆範圍內
      targetX = THREE.MathUtils.clamp(targetX, -82, 82);
      targetZ = THREE.MathUtils.clamp(targetZ, -82, 82);

      // 以合理物理角動量與平滑線速度步進，消除過快爆衝問題
      const dx = targetX - sl.currentGroundPos.x;
      const dz = targetZ - sl.currentGroundPos.z;
      const distToTarget = Math.hypot(dx, dz);

      if (distToTarget > 0.05) {
        const step = Math.min(distToTarget, moveSpeed * delta);
        sl.currentGroundPos.x += (dx / distToTarget) * step;
        sl.currentGroundPos.z += (dz / distToTarget) * step;
      }

      sl.groundSpot.position.set(sl.currentGroundPos.x, 0.06, sl.currentGroundPos.z);

      // 燈頭與光錐精準朝向地面光斑
      _scratchLook.set(sl.currentGroundPos.x, 0.06, sl.currentGroundPos.z);
      sl.housing.lookAt(_scratchLook);

      // 計算與玩家平面距離
      const pDx = playerPos.x - sl.currentGroundPos.x;
      const pDz = playerPos.z - sl.currentGroundPos.z;
      const dist = Math.hypot(pDx, pDz);

      if (dist < minDistance) {
        minDistance = dist;
      }

      // 當玩家在光圈半徑 3.6m 內，且身處室外操場 (Y < 3.0)
      if (dist < 3.6 && isPlayerOutdoors) {
        sl.isDetecting = true;
        anyDetected = true;

        // 探照燈光圈與光錐切換為高警戒亮紅色！
        (sl.groundSpot.material as THREE.MeshBasicMaterial).color.setHex(0xff2222);
        (sl.groundSpot.material as THREE.MeshBasicMaterial).opacity = 0.75;
        (sl.coneMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff3333);
        (sl.coneMesh.material as THREE.MeshBasicMaterial).opacity = 0.35;
      } else {
        sl.isDetecting = false;
        // 恢復平時亮白/淡黃巡視光束
        (sl.groundSpot.material as THREE.MeshBasicMaterial).color.setHex(0xfff5cc);
        (sl.groundSpot.material as THREE.MeshBasicMaterial).opacity = 0.45;
        (sl.coneMesh.material as THREE.MeshBasicMaterial).color.setHex(0xfffae0);
        (sl.coneMesh.material as THREE.MeshBasicMaterial).opacity = 0.16;
      }
    }

    return {
      isDetectedBySearchlight: anyDetected,
      nearestDist: minDistance
    };
  }

  // 銷毀與清理資源
  public dispose() {
    this.scene.remove(this.group);
  }
}
