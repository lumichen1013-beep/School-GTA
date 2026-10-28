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
  waypointIndex?: number;
  dwellTimer?: number;
  alertLostTimer?: number;
}

// 探照燈慢速廣域巡查路徑點 (全面均勻涵蓋 A區牢房、B區貨櫃迷宮、C區競技場與南大門，絕不作弊黏著玩家)
const SEARCHLIGHT_SWEEP_WAYPOINTS: { x: number; z: number }[] = [
  // A 區 (牢房生活長廊區)
  { x: -28, z: -76 },
  { x: 0,   z: -72 },
  { x: 28,  z: -68 },
  { x: -4,  z: -56 },
  { x: -28, z: -44 },
  { x: 26,  z: -44 },
  { x: 0,   z: -32 }, // 管制閘門 1 哨戒口

  // B 區 (操場重裝貨櫃迷宮區)
  { x: -22, z: -10 },
  { x: 0,   z: -8 },
  { x: 24,  z: -4 },
  { x: 24,  z: 6 },   // 門禁卡 B 藏寶走廊
  { x: 0,   z: 2 },   // 貨櫃中央十字路口
  { x: -26, z: 12 },
  { x: 0,   z: 16 },
  { x: 24,  z: 18 },
  { x: 0,   z: 30 },  // 管制閘門 2 哨戒口

  // C 區 (終極決鬥競技場與南大門)
  { x: -16, z: 48 },
  { x: 0,   z: 62 },  // 總教官中央決鬥競技場
  { x: 16,  z: 48 },
  { x: -12, z: 75 },
  { x: 12,  z: 75 },
  { x: 0,   z: 88 },  // 逃脫南大門
  { x: 0,   z: 10 },  // 中央瞭望塔前庭
];

export interface ACHidingSpot {
  id: string;
  name: string;
  position: THREE.Vector3;
  radius: number;
  type: 'HAY_CART' | 'HAY_BALE';
}

// 探照燈燈頭朝向用暫存向量 (重複使用，避免每幀配置)
const _scratchLook = new THREE.Vector3();

export class DetentionWorld {
  public scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();
  public colliders: CollidableBox[] = [];

  // 刺客教條草堆與掩體藏匿點矩陣 (AC Interactive Hiding Spots)
  public hidingSpots: ACHidingSpot[] = [];

  // 少年院關鍵點位 (改為潛龍諜影潛行迷宮配置)
  public spawnPos: THREE.Vector3 = new THREE.Vector3(-55, 0, -84); // 起點：北側牢房後方通風口 (空曠安全區)
  public currentCheckpointPos: THREE.Vector3 = new THREE.Vector3(-55, 0, -84); // 當前重生/存檔點
  public currentCheckpointName: string = 'A 區 牢房起點'; // 存檔點名稱

  // 更新檢查點 / 存檔點
  public setCheckpoint(pos: THREE.Vector3, name: string) {
    this.currentCheckpointPos.copy(pos);
    this.spawnPos.copy(pos);
    this.currentCheckpointName = name;
  }
  public commissaryPos: THREE.Vector3 = new THREE.Vector3(38, 0, -42.0); // 特訓小賣部取餐/補給窗口
  public pullupStationPos: THREE.Vector3 = new THREE.Vector3(-52, 0, 0); // 西側體能區：單槓訓練
  public benchpressStationPos: THREE.Vector3 = new THREE.Vector3(-48, 0, -8); // 西側體能區：臥推訓練
  public tireStationPos: THREE.Vector3 = new THREE.Vector3(-49, 0, 8); // 西側體能區：巨型輪胎翻滾

  // 門禁與機關點位
  public gateAPos: THREE.Vector3 = new THREE.Vector3(0, 0, -28); // 管制閘門 1 (連通 A 區與 B 區)
  public gateBPos: THREE.Vector3 = new THREE.Vector3(0, 0, 35);  // 管制閘門 2 (連通 B 區與 C 區)
  public southGateConsolePos: THREE.Vector3 = new THREE.Vector3(-7.5, 0, 93); // 南大門終端控制台

  // 鑰匙卡點位
  public keycardAPos: THREE.Vector3 = new THREE.Vector3(5, 0.8, -60);  // 藍色門禁卡 A (中央空地安全崗亭)
  public keycardBPos: THREE.Vector3 = new THREE.Vector3(24, 0.8, 14);  // 黃色門禁卡 B (B 區貨櫃迷宮東側掩體)
  public masterKeycardPos: THREE.Vector3 | null = null;                // 萬能逃脫鑰匙卡 (Boss 擊敗後掉落)

  // C 區發電機混凝土防護柱 (供玩家誘使 Boss 衝撞硬直破盾)
  public generatorPillars: THREE.Vector3[] = [
    new THREE.Vector3(-16, 0, 52),
    new THREE.Vector3(16, 0, 52),
    new THREE.Vector3(-16, 0, 74),
    new THREE.Vector3(16, 0, 74)
  ];

  // 門禁動態模型與碰撞體
  public isGateAOpen: boolean = false;
  public isGateBOpen: boolean = false;
  public isSouthGateOpen: boolean = false;

  public gateAMeshGroup: THREE.Group = new THREE.Group();
  public gateBMeshGroup: THREE.Group = new THREE.Group();
  public southGateMeshGroup: THREE.Group = new THREE.Group();

  public gateACollider!: CollidableBox;
  public gateBCollider!: CollidableBox;
  public southGateCollider!: CollidableBox;

  // 鑰匙卡 3D 模型
  public keycardAMeshGroup: THREE.Group = new THREE.Group();
  public keycardBMeshGroup: THREE.Group = new THREE.Group();
  public masterKeycardMeshGroup: THREE.Group = new THREE.Group();

  public hasPickedKeycardA: boolean = false;
  public hasPickedKeycardB: boolean = false;
  public hasPickedMasterKeycard: boolean = false;

  // 4 具動態高空探照燈
  public searchlights: SearchlightItem[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);

    // 第二世界專屬環境補光
    const detentionAmbientFill = new THREE.HemisphereLight(0xffffff, 0x99aebb, 0.40);
    detentionAmbientFill.position.set(0, 50, 0);
    this.group.add(detentionAmbientFill);

    this.buildDetentionFacility();
  }

  // 註冊垂直阻擋物體 (牆面、立柱、鐵欄杆、設施等)
  public addCollider(minX: number, maxX: number, minZ: number, maxZ: number, minY: number = 0, maxY: number = 5): CollidableBox {
    const box: CollidableBox = {
      min: new THREE.Vector3(Math.min(minX, maxX), minY, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), maxY, Math.max(minZ, maxZ))
    };
    this.colliders.push(box);
    return box;
  }

  // 註冊可站立行走的地板層板 (Floor Slabs) - isFloorOnly 不阻礙水平位移
  public addFloorSlab(minX: number, maxX: number, minZ: number, maxZ: number, floorY: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), floorY - 0.25, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), floorY + 0.25, Math.max(minZ, maxZ)),
      isFloorOnly: true
    });
  }

  // 註冊可平滑行走的斜坡 (Ramps) - 支援上下樓梯坡道物理檢測
  public addRamp(minX: number, maxX: number, minZ: number, maxZ: number, yAtMinZ: number, yAtMaxZ: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), Math.min(yAtMinZ, yAtMaxZ) - 0.4, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), Math.max(yAtMinZ, yAtMaxZ) + 0.4, Math.min(minZ, maxZ)),
      isFloorOnly: true,
      isRamp: true,
      rampMinZ: Math.min(minZ, maxZ),
      rampMaxZ: Math.max(minZ, maxZ),
      rampYAtMinZ: yAtMinZ,
      rampYAtMaxZ: yAtMaxZ
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
    const hayStrawGeos: THREE.BufferGeometry[] = [];
    const sandbagGeos: THREE.BufferGeometry[] = [];

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
      { startX: -96.5, endX: 96.5, z: -95, isZ: false }, // 北牆
      { startX: -96.5, endX: -10, z: 95, isZ: false }, // 南牆西側
      { startX: 10, endX: 96.5, z: 95, isZ: false },  // 南牆東側
      { startZ: -96.5, endZ: 96.5, x: -95, isZ: true },  // 西牆
      { startZ: -96.5, endZ: 96.5, x: 95, isZ: true }   // 東牆
    ];

    // 圍牆混凝土矮基座 (厚 0.6m, 高 0.9m) 與高規格 10m 防暴碰撞體
    for (const f of fenceBounds) {
      if (!f.isZ) {
        const len = f.endX! - f.startX!;
        const cx = (f.startX! + f.endX!) / 2;
        const curb = new THREE.BoxGeometry(len, 0.9, 0.6);
        curb.translate(cx, 0.45, f.z!);
        concreteGeos.push(curb);
        this.addCollider(f.startX!, f.endX!, f.z! - 0.4, f.z! + 0.4, 0, 10.0);

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
        this.addCollider(f.x! - 0.4, f.x! + 0.4, f.startZ!, f.endZ!, 0, 10.0);

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

    // 四角嚴密封閉加固碰撞體 (徹底杜絕斜角穿透漏洞)
    this.addCollider(-96.5, -93.5, -96.5, -93.5, 0, 10.0);
    this.addCollider(93.5, 96.5, -96.5, -93.5, 0, 10.0);
    this.addCollider(-96.5, -93.5, 93.5, 96.5, 0, 10.0);
    this.addCollider(93.5, 96.5, 93.5, 96.5, 0, 10.0);

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

    // 雙扇重型鋼柵防暴南大門 (動態解鎖升起大門，擊敗小Boss取得萬能鑰匙卡後開門逃脫)
    this.southGateMeshGroup = new THREE.Group();
    const darkSteelMatSingle = new THREE.MeshLambertMaterial({ color: 0x5c728a });
    const yellowMatSingle = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    const rustMatSingle = new THREE.MeshLambertMaterial({ color: 0x8b0000 });

    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(10.2, 6.6, 0.25), darkSteelMatSingle);
    leftDoor.position.set(-5.0, 3.3, 95.0);
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(10.2, 6.6, 0.25), darkSteelMatSingle);
    rightDoor.position.set(5.0, 3.3, 95.0);
    this.southGateMeshGroup.add(leftDoor, rightDoor);

    const lockBeam = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.45, 0.45), darkSteelMatSingle);
    lockBeam.position.set(0, 3.3, 95.25);
    this.southGateMeshGroup.add(lockBeam);

    const gateLockedSign = new THREE.Mesh(new THREE.BoxGeometry(10.0, 1.1, 0.3), yellowMatSingle);
    gateLockedSign.position.set(0, 4.8, 95.25);
    this.southGateMeshGroup.add(gateLockedSign);

    const gateLockBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.5), rustMatSingle);
    gateLockBox.position.set(0, 3.3, 95.3);
    this.southGateMeshGroup.add(gateLockBox);

    this.group.add(this.southGateMeshGroup);

    // 大門實體阻擋碰撞體 (X: -10.5 ~ 10.5, Z: 94.2 ~ 95.8, 高度 8.0m)
    this.southGateCollider = this.addCollider(-10.5, 10.5, 94.2, 95.8, 0, 8.0);

    // 南大門終端控制台 (X: -7.5, Z: 93)
    const southTerminal = this.createTerminalMesh(0xef4444);
    southTerminal.position.set(-7.5, 0, 93);
    this.group.add(southTerminal);

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
    }

    // 建立全場唯一動態探照燈：中央高空立體監視燈塔 (Y = 18.0m，俯視掃描整個特訓院大操場)
    const slMast = new THREE.CylinderGeometry(0.35, 0.5, 18.0, 8);
    slMast.translate(0, 9.0, 10.0);
    darkSteelGeos.push(slMast);
    const slPlatform = new THREE.BoxGeometry(3.2, 0.35, 3.2);
    slPlatform.translate(0, 17.8, 10.0);
    darkSteelGeos.push(slPlatform);
    this.addCollider(-0.6, 0.6, 9.4, 10.6, 0, 18.0);
    this.createSearchlight(0, new THREE.Vector3(0, 18.0, 10.0));

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

    // 2F 走廊外圍安全鐵欄杆 (在樓梯口留出順暢通行開口，絕不擋住玩家上樓)
    const stairX = bCx + walkwayW / 2 - 1.5;
    const stairW = 3.2;
    const railW = (stairX - stairW / 2) - (bCx - walkwayW / 2);
    const railCx = (bCx - walkwayW / 2) + railW / 2;
    const wRail = new THREE.BoxGeometry(railW, 1.2, 0.08);
    wRail.translate(railCx, walkwayY + 0.7, walkwayZ + walkwayD / 2);
    fenceWireGeos.push(wRail);
    this.addCollider(bCx - walkwayW / 2, stairX - stairW / 2, walkwayZ + walkwayD / 2 - 0.15, walkwayZ + walkwayD / 2 + 0.15, walkwayY, walkwayY + 1.4);

    // 2F 支撐鋼立柱 (從地面延伸支撐 2F 走廊)
    for (let x = bCx - walkwayW / 2 + 3; x <= bCx + walkwayW / 2 - 3; x += 7) {
      const pCol = new THREE.CylinderGeometry(0.16, 0.16, walkwayY, 8);
      pCol.translate(x, walkwayY / 2, walkwayZ + walkwayD / 2);
      darkSteelGeos.push(pCol);
      this.addCollider(x - 0.25, x + 0.25, walkwayZ + walkwayD / 2 - 0.25, walkwayZ + walkwayD / 2 + 0.25, 0, walkwayY);
    }

    // 通往 2F 的重型工業鋼架樓梯 (從地面 Y: 0 爬升至 Y: 4.5, 寬 3.0m, 長 8.5m)
    const stairStartZ = walkwayZ + walkwayD / 2 + 8.5; // Z = -32.3 (地面起點)
    const stairEndZ = walkwayZ + walkwayD / 2;         // Z = -40.8 (2F 頂端)
    const numSteps = 18;
    for (let s = 0; s < numSteps; s++) {
      const t = s / numSteps;
      const stepY = t * walkwayY;
      const stepZ = THREE.MathUtils.lerp(stairStartZ, stairEndZ, t);
      const stepMesh = new THREE.BoxGeometry(3.0, 0.25, 8.5 / numSteps + 0.05);
      stepMesh.translate(stairX, stepY + 0.12, stepZ);
      darkSteelGeos.push(stepMesh);
    }
    // 樓梯斜坡碰撞體 (Z: -40.8 ~ -32.3，MinZ 處高度為 4.5m，MaxZ 處高度為 0m，平滑上下樓如履平地)
    this.addRamp(stairX - 1.6, stairX + 1.6, stairEndZ, stairStartZ, walkwayY, 0);

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

    // 戶外特訓小賣部與補給窗口 (提供止血繃帶、高能葡萄糖液、壓縮乾糧等物資)
    const counter = new THREE.BoxGeometry(5.5, 1.1, 1.2);
    counter.translate(38, 0.55, -44.5);
    concreteGeos.push(counter);
    this.addCollider(35.0, 41.0, -45.2, -43.8, 0, 1.5);

    // 小賣部展示架與醫療補給箱
    const supplyShelf = new THREE.BoxGeometry(4.8, 0.9, 0.5);
    supplyShelf.translate(38, 1.45, -44.8);
    darkSteelGeos.push(supplyShelf);

    const medBox = new THREE.BoxGeometry(0.8, 0.5, 0.5);
    medBox.translate(36.8, 1.35, -44.3);
    yellowHazardGeos.push(medBox);

    // 小賣部遮雨棚架
    const cCanopy = new THREE.BoxGeometry(8.5, 0.25, 3.8);
    cCanopy.translate(38, 3.2, -43.0);
    corrugatedIronGeos.push(cCanopy);

    // 小賣部招牌「🏪 特訓小賣部 · 戰術物資補給站」
    const cSign = new THREE.BoxGeometry(8.5, 1.0, 0.2);
    cSign.translate(38, 3.8, -42.8);
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
    // 8. 西側重訓體能專區 (單槓、臥推、巨型輪胎組，集中於 X: -56 ~ -44，絕不干擾中央操場與巡邏動線)
    // ==========================================
    // 8.1 多聯排單槓組 (Pull-Up Bar Rig, X: -54 ~ -44, Z: 0)
    const barStartX = -54;
    for (let b = 0; b < 3; b++) {
      const bx = barStartX + b * 4.0;
      const barH = 2.4 + b * 0.3; // 2.4m, 2.7m, 3.0m

      // 左立柱與右立柱
      const post1 = new THREE.CylinderGeometry(0.06, 0.06, barH, 8);
      post1.translate(bx, barH / 2, 0);
      const post2 = new THREE.CylinderGeometry(0.06, 0.06, barH, 8);
      post2.translate(bx + 3.5, barH / 2, 0);

      // 橫槓
      const horizBar = new THREE.CylinderGeometry(0.035, 0.035, 3.5, 8);
      horizBar.rotateZ(Math.PI / 2);
      horizBar.translate(bx + 1.75, barH - 0.05, 0);

      darkSteelGeos.push(post1, post2, horizBar);
      this.addCollider(bx - 0.2, bx + 0.2, -0.2, 0.2, 0, barH);
      this.addCollider(bx + 3.3, bx + 3.7, -0.2, 0.2, 0, barH);
    }

    // 8.2 臥推架設施 (Bench Press Racks, X: -52 ~ -46, Z: -8)
    const benchPositions = [
      { x: -50, z: -8 },
      { x: -46, z: -8 },
      { x: -48, z: -4 }
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

    // 8.3 巨型拖拉機重訓輪胎組 (Giant Tractor Tires, X: -52 ~ -46, Z: 8 ~ 14)
    const flatTirePositions = [
      { x: -50, z: 8, r: 1.4, h: 0.7 },
      { x: -46, z: 8, r: 1.4, h: 0.7 }
    ];
    for (const tp of flatTirePositions) {
      const tire = new THREE.CylinderGeometry(tp.r, tp.r, tp.h, 16);
      tire.translate(tp.x, tp.h / 2, tp.z);
      tireRubberGeos.push(tire);
      this.addFloorSlab(tp.x - tp.r, tp.x + tp.r, tp.z - tp.r, tp.z + tp.r, tp.h);
      this.addCollider(tp.x - tp.r * 0.9, tp.x + tp.r * 0.9, tp.z - tp.r * 0.9, tp.z + tp.r * 0.9, 0, tp.h);
    }

    // 半埋入泥土中成排直立輪胎 (障礙跨欄)
    for (let i = 0; i < 4; i++) {
      const x = -52 + i * 1.8;
      const buriedTire = new THREE.TorusGeometry(1.1, 0.35, 8, 16);
      buriedTire.rotateY(Math.PI / 2);
      buriedTire.translate(x, 0.6, 14);
      tireRubberGeos.push(buriedTire);
      this.addCollider(x - 0.3, x + 0.3, 12.8, 15.2, 0, 1.6);
    }

    // 8.4 雙槓訓練架 (Parallel Dip Bars, X: -50 ~ -46, Z: 4)
    for (let i = 0; i < 2; i++) {
      const dx = -50 + i * 3.5;
      const dipBar1 = new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8);
      dipBar1.rotateX(Math.PI / 2);
      dipBar1.translate(dx - 0.4, 1.2, 4);

      const dipBar2 = new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8);
      dipBar2.rotateX(Math.PI / 2);
      dipBar2.translate(dx + 0.4, 1.2, 4);

      darkSteelGeos.push(dipBar1, dipBar2);
      this.addCollider(dx - 0.55, dx + 0.55, 2.7, 5.3, 0, 1.3);
    }

    // ==========================================
    // 8.5 潛龍諜影三段式戰術立體迷宮體系 (Tactical Stealth Labyrinth)
    // ==========================================
    // --- 【A 區：牢房生活長廊迷宮 (Z: -85 ~ -28)】---
    // 北走廊檢查哨屏障 (X = -10, Z: -90 ~ -78, 迫使從北側繞道中央庭院)
    const northCheckWall = new THREE.BoxGeometry(0.6, 3.8, 12);
    northCheckWall.translate(-10, 1.9, -84);
    concreteGeos.push(northCheckWall);
    this.addCollider(-10.4, -9.6, -90, -78, 0, 3.8);

    // 新增：北走廊暗殺拐角 L 型隔牆 (形成隱密通風暗道與雙轉角，避開巡邏視線)
    const alleyWall1 = new THREE.BoxGeometry(0.6, 3.8, 12);
    alleyWall1.translate(-34, 1.9, -82);
    const alleyWall2 = new THREE.BoxGeometry(10, 3.8, 0.6);
    alleyWall2.translate(-29, 1.9, -76);
    concreteGeos.push(alleyWall1, alleyWall2);
    this.addCollider(-34.4, -33.6, -88, -76, 0, 3.8);
    this.addCollider(-34, -24, -76.4, -75.6, 0, 3.8);

    // 中央安全崗亭 (存放藍色門禁卡 A，X = 5, Z = -60)
    const boothWallW = new THREE.BoxGeometry(0.5, 3.2, 4);
    boothWallW.translate(2, 1.6, -60);
    const boothWallE = new THREE.BoxGeometry(0.5, 3.2, 4);
    boothWallE.translate(8, 1.6, -60);
    const boothWallN = new THREE.BoxGeometry(6.5, 3.2, 0.5);
    boothWallN.translate(5, 1.6, -62);
    concreteGeos.push(boothWallW, boothWallE, boothWallN);
    this.addCollider(1.7, 2.3, -62, -58, 0, 3.2);
    this.addCollider(7.7, 8.3, -62, -58, 0, 3.2);
    this.addCollider(1.7, 8.3, -62.3, -61.7, 0, 3.2);

    // 新增：中央庭院 S 彎戰術隔牆 (掩護崗亭側面，形成多重暗角掩護)
    const courtL1 = new THREE.BoxGeometry(0.6, 3.8, 14);
    courtL1.translate(-10, 1.9, -63);
    const courtL2 = new THREE.BoxGeometry(7, 3.8, 0.6);
    courtL2.translate(-6.5, 1.9, -70);
    concreteGeos.push(courtL1, courtL2);
    this.addCollider(-10.4, -9.6, -70, -56, 0, 3.8);
    this.addCollider(-10, -3, -70.4, -69.6, 0, 3.8);

    // 東側巡邏盲區阻隔壁 (X = 14, Z: -55 ~ -45)
    const eastCourtyardWall = new THREE.BoxGeometry(0.6, 3.8, 10);
    eastCourtyardWall.translate(14, 1.9, -50);
    concreteGeos.push(eastCourtyardWall);
    this.addCollider(13.6, 14.4, -55, -45, 0, 3.8);

    // 南前庭防暴折返隔板 (Z = -38, X: -25 ~ -6 與 X: 6 ~ 25，留出中央寬闊通路 X: -6 ~ 6)
    const southChicaneW = new THREE.BoxGeometry(19, 3.8, 0.6);
    southChicaneW.translate(-15.5, 1.9, -38);
    const southChicaneE = new THREE.BoxGeometry(19, 3.8, 0.6);
    southChicaneE.translate(15.5, 1.9, -38);
    concreteGeos.push(southChicaneW, southChicaneE);
    this.addCollider(-25, -6, -38.4, -37.6, 0, 3.8);
    this.addCollider(6, 25, -38.4, -37.6, 0, 3.8);

    // 新增：南前庭閘門前防暴 S 型交錯隔板 (Z = -33.5，強制雙 90° 迂迴轉角抵達閘門 1)
    const chicaneZ33 = new THREE.BoxGeometry(10, 3.8, 0.6);
    chicaneZ33.translate(0, 1.9, -33.5);
    concreteGeos.push(chicaneZ33);
    this.addCollider(-5, 5, -33.9, -33.1, 0, 3.8);

    // 管制閘門 1 隔斷牆 (Z = -28, 橫跨全院嚴密封鎖至東西圍牆 X: ±96.5，杜絕任何側翼偷渡通道，僅在中央留出閘口)
    const gateA_WallW = new THREE.BoxGeometry(93.0, 5.5, 1.0);
    gateA_WallW.translate(-50.0, 2.75, -28);
    const gateA_WallE = new THREE.BoxGeometry(93.0, 5.5, 1.0);
    gateA_WallE.translate(50.0, 2.75, -28);
    concreteGeos.push(gateA_WallW, gateA_WallE);
    this.addCollider(-96.5, -3.5, -28.6, -27.4, 0, 8.0);
    this.addCollider(3.5, 96.5, -28.6, -27.4, 0, 8.0);

    // 動態管制閘門 1 (需藍色門禁卡 A 開啟)
    this.gateAMeshGroup = new THREE.Group();
    const gateADoor = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 4.5, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.3 })
    );
    gateADoor.position.set(0, 2.25, -28);
    const gateAStripe = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.6, 0.45),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    gateAStripe.position.set(0, 2.25, -28);
    this.gateAMeshGroup.add(gateADoor, gateAStripe);
    this.group.add(this.gateAMeshGroup);
    this.gateACollider = this.addCollider(-3.6, 3.6, -28.4, -27.6, 0, 4.5);

    // 閘門 1 終端機 (X = 4.2, Z = -27.2)
    const terminalA = this.createTerminalMesh(0x38bdf8);
    terminalA.position.set(4.2, 0, -27.2);
    this.group.add(terminalA);

    // --- 【B 區：操場重裝軍規貨櫃與掩體迷宮 (Z: -28 ~ 35)】---
    // 豐富化海運集裝箱貨櫃矩陣 (18 座軍規貨櫃 + 轉角暗道，營造多重盲角與潛行挑戰)
    const containers = [
      // 第一排 (Z = -18)
      { x: -22, z: -18, isZ: false, color: 0x2b4c7e },
      { x: 22, z: -18, isZ: false, color: 0x8b3a3a },
      // Gate 1 正前方中央遮擋貨櫃 (強迫分流至東西通道)
      { x: 0, z: -21, isZ: false, color: 0x3d405b },

      // 第二排 (Z = -6)
      { x: -12, z: -6, isZ: true, color: 0x5c677d },
      { x: 12, z: -6, isZ: true, color: 0x2d6a4f },
      // 西側外廊平行貨櫃 (形成長達 18m 狹長潛行暗道)
      { x: -28, z: -6, isZ: true, color: 0x2b4c7e },
      // 東側外廊平行貨櫃
      { x: 28, z: -6, isZ: true, color: 0x8b3a3a },

      // 中央轉角連通掩體 (Z = 1)
      { x: -6, z: 1, isZ: false, color: 0x5c677d },
      { x: 6, z: 1, isZ: false, color: 0x2d6a4f },

      // 第三排 (Z = 8)
      { x: -22, z: 8, isZ: false, color: 0x3d405b },
      { x: 0, z: 8, isZ: false, color: 0x2b4c7e },
      { x: 22, z: 8, isZ: false, color: 0x8b3a3a },

      // 第四排 (Z = 20)
      { x: -12, z: 20, isZ: true, color: 0x2d6a4f },
      { x: 12, z: 20, isZ: true, color: 0x5c677d },
      // 西南潛行貨櫃
      { x: -26, z: 20, isZ: true, color: 0x3d405b },
      // Keycard B 側翼包圍貨櫃 (形成死角藏匿口袋)
      { x: 24, z: 20, isZ: false, color: 0x2b4c7e },

      // 東側藏寶盲區 (Z = 14, 掩護 Keycard B)
      { x: 30, z: 14, isZ: true, color: 0x3d405b },

      // Gate 2 正前方中央 S 型屏障貨櫃 (Z = 27)
      { x: 0, z: 27, isZ: false, color: 0x8b3a3a }
    ];

    for (const c of containers) {
      const w = c.isZ ? 2.8 : 10.0;
      const d = c.isZ ? 10.0 : 2.8;
      const h = 3.2;
      const cGeo = new THREE.BoxGeometry(w, h, d);
      cGeo.translate(c.x, h / 2, c.z);
      corrugatedIronGeos.push(cGeo);
      this.addCollider(c.x - w / 2, c.x + w / 2, c.z - d / 2, c.z + d / 2, 0, h);
    }

    // 混凝土防暴澤西護欄掩體 (提供戰術半高掩護，絕不擋死過道)
    const jerseyBarriers = [
      { x: -22, z: -2, isZ: false },
      { x: 22, z: -2, isZ: false },
      { x: -6, z: 14, isZ: true },
      { x: 6, z: 14, isZ: true },
      { x: -16, z: -14, isZ: true },
      { x: 16, z: -14, isZ: true },
      { x: -18, z: 26, isZ: false },
      { x: 18, z: 26, isZ: false }
    ];
    for (const jb of jerseyBarriers) {
      const jbW = jb.isZ ? 0.6 : 3.6;
      const jbD = jb.isZ ? 3.6 : 0.6;
      const jbGeo = new THREE.BoxGeometry(jbW, 1.4, jbD);
      jbGeo.translate(jb.x, 0.7, jb.z);
      concreteGeos.push(jbGeo);
      this.addCollider(jb.x - jbW / 2, jb.x + jbW / 2, jb.z - jbD / 2, jb.z + jbD / 2, 0, 1.5);
    }

    // 管制閘門 2 隔斷牆 (Z = 35, 橫跨全院嚴密封鎖至東西圍牆 X: ±96.5，杜絕任何側翼偷渡通道，僅在中央留出閘口)
    const gateB_WallW = new THREE.BoxGeometry(93.0, 5.5, 1.0);
    gateB_WallW.translate(-50.0, 2.75, 35);
    const gateB_WallE = new THREE.BoxGeometry(93.0, 5.5, 1.0);
    gateB_WallE.translate(50.0, 2.75, 35);
    concreteGeos.push(gateB_WallW, gateB_WallE);
    this.addCollider(-96.5, -3.5, 34.4, 35.6, 0, 8.0);
    this.addCollider(3.5, 96.5, 34.4, 35.6, 0, 8.0);

    // 動態管制閘門 2 (需黃色門禁卡 B 開啟)
    this.gateBMeshGroup = new THREE.Group();
    const gateBDoor = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 4.5, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.3 })
    );
    gateBDoor.position.set(0, 2.25, 35);
    const gateBStripe = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.6, 0.45),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    gateBStripe.position.set(0, 2.25, 35);
    this.gateBMeshGroup.add(gateBDoor, gateBStripe);
    this.group.add(this.gateBMeshGroup);
    this.gateBCollider = this.addCollider(-3.6, 3.6, 34.6, 35.4, 0, 4.5);

    // 閘門 2 終端機 (X = 4.2, Z = 34.2)
    const terminalB = this.createTerminalMesh(0xfacc15);
    terminalB.position.set(4.2, 0, 34.2);
    this.group.add(terminalB);

    // --- 【C 區：終極哨戒門庭與 Boss 決戰競技場 (Z: 35 ~ 95)】---
    // 4 座巨型發電機混凝土加固防護柱 (供誘使 Boss 衝撞陷入硬直破盾)
    for (const gp of this.generatorPillars) {
      // 柱身
      const pilGeo = new THREE.BoxGeometry(3.4, 5.5, 3.4);
      pilGeo.translate(gp.x, 2.75, gp.z);
      concreteGeos.push(pilGeo);
      this.addCollider(gp.x - 1.8, gp.x + 1.8, gp.z - 1.8, gp.z + 1.8, 0, 5.5);

      // 黃黑警戒飾條
      const trimGeo = new THREE.BoxGeometry(3.6, 0.7, 3.6);
      trimGeo.translate(gp.x, 2.8, gp.z);
      yellowHazardGeos.push(trimGeo);

      // 高壓電路管道
      const conduitGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.5, 8);
      conduitGeo.translate(gp.x + 1.8, 2.75, gp.z);
      darkSteelGeos.push(conduitGeo);
    }

    // 新增：C 區兩側戰術防爆側翼壁與 90° 轉角拐角掩體 (便於躲避 Boss 橫向衝撞)
    const arenaWallW = new THREE.BoxGeometry(0.8, 3.2, 20);
    arenaWallW.translate(-22, 1.6, 56);
    const arenaWingW = new THREE.BoxGeometry(6, 3.2, 0.8);
    arenaWingW.translate(-19, 1.6, 46);
    const arenaWallE = new THREE.BoxGeometry(0.8, 3.2, 20);
    arenaWallE.translate(22, 1.6, 56);
    const arenaWingE = new THREE.BoxGeometry(6, 3.2, 0.8);
    arenaWingE.translate(19, 1.6, 46);
    concreteGeos.push(arenaWallW, arenaWingW, arenaWallE, arenaWingE);
    this.addCollider(-22.4, -21.6, 46, 66, 0, 3.2);
    this.addCollider(-22, -16, 45.6, 46.4, 0, 3.2);
    this.addCollider(21.6, 22.4, 46, 66, 0, 3.2);
    this.addCollider(16, 22, 45.6, 46.4, 0, 3.2);

    // 新增：南大門前哨戰術防爆 S 彎工事 (Z = 82 與 Z = 87)
    const southChicaneL = new THREE.BoxGeometry(12, 3.2, 0.8);
    southChicaneL.translate(-10, 1.6, 82);
    const southChicaneR = new THREE.BoxGeometry(12, 3.2, 0.8);
    southChicaneR.translate(10, 1.6, 82);
    const southCenterBaffle = new THREE.BoxGeometry(10, 3.2, 0.8);
    southCenterBaffle.translate(0, 1.6, 87);
    concreteGeos.push(southChicaneL, southChicaneR, southCenterBaffle);
    this.addCollider(-16, -4, 81.6, 82.4, 0, 3.2);
    this.addCollider(4, 16, 81.6, 82.4, 0, 3.2);
    this.addCollider(-5, 5, 86.6, 87.4, 0, 3.2);

    // ==========================================
    // 8.6 刺客教條經典藏匿點矩陣 (Assassin's Creed Interactive Hiding Spots - 18 處)
    // 包含經典雙輪乾草手推車 (HAY_CART) 與壓實草捆堆垛 (HAY_BALE)
    // 玩家進入半徑內即自動匿蹤隱形，警衛視線與探照燈完全無法發現，並可發動刺客草堆暗殺
    // ==========================================
    this.hidingSpots = [
      // A 區 (Zone A: 牢房生活長廊迷宮 Z: -90 ~ -28)
      { id: 'spot-1', name: '開局逃生乾草車', position: new THREE.Vector3(-52, 0, -84), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-2', name: '西側監舍後巷草堆', position: new THREE.Vector3(-68, 0, -55), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-3', name: '中央崗亭西側草堆', position: new THREE.Vector3(-10, 0, -60), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-4', name: '東側庭院維修草車', position: new THREE.Vector3(14, 0, -65), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-5', name: '東食堂外廊草堆', position: new THREE.Vector3(78, 0, -60), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-6', name: '管制閘門 1 側翼草車', position: new THREE.Vector3(-8, 0, -32), radius: 1.8, type: 'HAY_CART' },

      // B 區 (Zone B: 操場重裝軍規貨櫃迷宮 Z: -28 ~ 35)
      { id: 'spot-7', name: 'B 區北貨櫃夾角草堆', position: new THREE.Vector3(-10, 0, -12), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-8', name: '貨櫃西側通廊草車', position: new THREE.Vector3(-18, 0, -6), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-9', name: '貨櫃東側通廊草車', position: new THREE.Vector3(18, 0, -6), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-10', name: '黃色門禁卡 B 藏匿草堆', position: new THREE.Vector3(21, 0, 4), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-11', name: '西側操場訓練架草堆', position: new THREE.Vector3(-25, 0, 10), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-12', name: '東側看台外緣草堆', position: new THREE.Vector3(28, 0, 10), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-13', name: '貨櫃南通道草車', position: new THREE.Vector3(11, 0, 14), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-14', name: '管制閘門 2 側翼草車', position: new THREE.Vector3(-8, 0, 30), radius: 1.8, type: 'HAY_CART' },

      // C 區 (Zone C: 終極哨戒門庭與決戰競技場 Z: 35 ~ 95)
      { id: 'spot-15', name: '競技場西配電房草堆', position: new THREE.Vector3(-18, 0, 50), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-16', name: '競技場東庫房草堆', position: new THREE.Vector3(18, 0, 50), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-17', name: '決戰競技場中央刺客突襲草車', position: new THREE.Vector3(0, 0, 56), radius: 2.0, type: 'HAY_CART' },
      { id: 'spot-18', name: '逃脫南大門終端草車', position: new THREE.Vector3(-11, 0, 88), radius: 1.8, type: 'HAY_CART' },
    ];

    for (let i = 0; i < this.hidingSpots.length; i++) {
      const spot = this.hidingSpots[i];
      const sp = spot.position;
      if (spot.type === 'HAY_CART') {
        // 車輪 (左右木質車輪 + 黑色鋼圈)
        const wheelL = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);
        wheelL.rotateZ(Math.PI / 2);
        wheelL.translate(sp.x - 1.15, 0.55, sp.z);
        const wheelR = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);
        wheelR.rotateZ(Math.PI / 2);
        wheelR.translate(sp.x + 1.15, 0.55, sp.z);
        darkSteelGeos.push(wheelL, wheelR);

        // 車軸
        const axle = new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8);
        axle.rotateZ(Math.PI / 2);
        axle.translate(sp.x, 0.55, sp.z);
        darkSteelGeos.push(axle);

        // 車底板與護欄木板
        const bed = new THREE.BoxGeometry(2.0, 0.10, 2.8);
        bed.translate(sp.x, 0.65, sp.z);
        const railL = new THREE.BoxGeometry(0.08, 0.55, 2.8);
        railL.translate(sp.x - 0.96, 0.95, sp.z);
        const railR = new THREE.BoxGeometry(0.08, 0.55, 2.8);
        railR.translate(sp.x + 0.96, 0.95, sp.z);
        const railBack = new THREE.BoxGeometry(2.0, 0.55, 0.08);
        railBack.translate(sp.x, 0.95, sp.z - 1.36);
        woodPlankGeos.push(bed, railL, railR, railBack);

        // 蓬鬆金黃乾草堆 (刺客教條經典草堆，多層次體積)
        const hayMain = new THREE.BoxGeometry(1.85, 1.15, 2.65);
        hayMain.translate(sp.x, 1.25, sp.z);
        const hayDome = new THREE.BoxGeometry(1.5, 0.55, 2.2);
        hayDome.translate(sp.x, 1.85, sp.z);
        const hayTuft1 = new THREE.BoxGeometry(0.65, 0.35, 0.75);
        hayTuft1.rotateY(0.4);
        hayTuft1.translate(sp.x + 0.3, 2.15, sp.z - 0.2);
        const hayTuft2 = new THREE.BoxGeometry(0.55, 0.3, 0.65);
        hayTuft2.rotateY(-0.35);
        hayTuft2.translate(sp.x - 0.35, 2.12, sp.z + 0.3);
        hayStrawGeos.push(hayMain, hayDome, hayTuft1, hayTuft2);

        // 地面零散草屑
        for (let j = 0; j < 3; j++) {
          const ang = j * 2.1;
          const scX = sp.x + Math.sin(ang) * 1.5;
          const scZ = sp.z + Math.cos(ang) * 1.5;
          const scatter = new THREE.BoxGeometry(0.45, 0.03, 0.45);
          scatter.rotateY(ang);
          scatter.translate(scX, 0.02, scZ);
          hayStrawGeos.push(scatter);
        }
      } else {
        // HAY_BALE: 經典方形壓實草捆堆疊成的刺客掩體垛
        const b1 = new THREE.BoxGeometry(1.4, 0.65, 0.9);
        b1.translate(sp.x - 0.6, 0.33, sp.z - 0.4);
        const b2 = new THREE.BoxGeometry(1.4, 0.65, 0.9);
        b2.translate(sp.x + 0.6, 0.33, sp.z - 0.4);
        const b3 = new THREE.BoxGeometry(1.4, 0.65, 0.9);
        b3.translate(sp.x - 0.6, 0.33, sp.z + 0.4);
        const b4 = new THREE.BoxGeometry(1.4, 0.65, 0.9);
        b4.translate(sp.x + 0.6, 0.33, sp.z + 0.4);

        const b5 = new THREE.BoxGeometry(1.3, 0.6, 1.5);
        b5.translate(sp.x - 0.35, 0.95, sp.z);
        const b6 = new THREE.BoxGeometry(1.3, 0.6, 1.5);
        b6.translate(sp.x + 0.35, 0.95, sp.z);

        const bTop = new THREE.BoxGeometry(1.6, 0.5, 1.4);
        bTop.translate(sp.x, 1.45, sp.z);

        hayStrawGeos.push(b1, b2, b3, b4, b5, b6, bTop);

        // 綁繩
        for (const y of [0.33, 0.95]) {
          const strap = new THREE.BoxGeometry(2.3, 0.05, 0.05);
          strap.translate(sp.x, y, sp.z);
          darkSteelGeos.push(strap);
        }

        const s1 = new THREE.BoxGeometry(0.5, 0.02, 0.5);
        s1.translate(sp.x + 1.2, 0.01, sp.z);
        const s2 = new THREE.BoxGeometry(0.5, 0.02, 0.5);
        s2.translate(sp.x - 1.2, 0.01, sp.z - 0.3);
        hayStrawGeos.push(s1, s2);
      }
    }

    // ==========================================
    // 8.7 全區戰術實體掩體矩陣 (Tactical Physical Cover Matrix - 22 處)
    // 徹底阻斷開局出生點東/西雙向視線，並為每名 NPC 巡邏動線設置半高/高聳戰術掩體
    // 射線穿透檢測將完全受阻，提供玩家絕佳暗殺伏擊走位
    // ==========================================
    const tacticalCovers = [
      // 1. 開局出生點東向混泥土防爆隔音牆 + 補給木箱 (完全遮斷 G1 視線)
      { minX: -46.6, maxX: -45.4, minZ: -86.8, maxZ: -81.2, h: 2.8, type: 'CONCRETE_CRATE' },
      // 2. 開局出生點西向高壓變電箱 + 雙層沙包掩體 (完全遮斷 G12 視線)
      { minX: -64.4, maxX: -59.6, minZ: -82.6, maxZ: -81.4, h: 2.6, type: 'TRANSFORMER_SANDBAG' },
      // 3. 開局出生點南向轉角托盤障礙物
      { minX: -56.8, maxX: -53.2, minZ: -79.8, maxZ: -78.2, h: 1.6, type: 'PALLETS' },
      // 4. G1 巡邏北走廊軍規彈藥箱堆 (X = -20, Z = -81.5)
      { minX: -21.5, maxX: -18.5, minZ: -82.1, maxZ: -80.9, h: 1.4, type: 'WOOD_CRATES' },
      // 5. G12 監舍西外牆水泥支撐柱 (X = -66, Z = -55)
      { minX: -66.8, maxX: -65.2, minZ: -56.0, maxZ: -54.0, h: 3.5, type: 'CONCRETE_WALL' },
      // 6. G3 崗亭沙包工事 (X = -1, Z = -60)
      { minX: -1.6, maxX: -0.4, minZ: -61.8, maxZ: -58.2, h: 1.3, type: 'SANDBAG' },
      // 7. G2 東庭院托盤木箱堆 (X = 22, Z = -60)
      { minX: 20.8, maxX: 23.2, minZ: -61.2, maxZ: -58.8, h: 1.5, type: 'PALLETS' },
      // 8. G13 東食堂金屬垃圾子車 (X = 82, Z = -62)
      { minX: 80.9, maxX: 83.1, minZ: -63.6, maxZ: -60.4, h: 1.8, type: 'STEEL_DUMPSTER' },
      // 9. G14 南前庭防暴折角路障 (X = -16, Z = -35)
      { minX: -17.6, maxX: -14.4, minZ: -35.5, maxZ: -34.5, h: 1.5, type: 'JERSEY_BARRIER' },
      // 10. G4 閘門 1 側翼沙包掩體 (X = -2, Z = -35)
      { minX: -3.8, maxX: -0.2, minZ: -35.5, maxZ: -34.5, h: 1.4, type: 'SANDBAG' },
      // 11. G15 B 區北走道鐵製工具箱 (X = 0, Z = -15)
      { minX: -1.2, maxX: 1.2, minZ: -15.8, maxZ: -14.2, h: 1.4, type: 'STEEL_DUMPSTER' },
      // 12. G5 貨櫃西直道軍規貨箱 (X = -25, Z = -6)
      { minX: -25.8, maxX: -24.2, minZ: -7.8, maxZ: -4.2, h: 2.2, type: 'WOOD_CRATES' },
      // 13. G6 貨櫃東直道軍規貨箱 (X = 25, Z = -6)
      { minX: 24.2, maxX: 25.8, minZ: -7.8, maxZ: -4.2, h: 2.2, type: 'WOOD_CRATES' },
      // 14. G7 中央十字路口沙包掩體 (X = 0, Z = -3.5)
      { minX: -1.8, maxX: 1.8, minZ: -4.0, maxZ: -3.0, h: 1.4, type: 'SANDBAG' },
      // 15. G8 盲區高層鐵架 (X = 25, Z = -2)
      { minX: 24.4, maxX: 25.6, minZ: -3.5, maxZ: -0.5, h: 3.0, type: 'STEEL_DUMPSTER' },
      // 16. G16 貨櫃南走廊木箱金字塔 (X = -10, Z = 14)
      { minX: -11.0, maxX: -9.0, minZ: 13.0, maxZ: 15.0, h: 2.0, type: 'WOOD_CRATES' },
      // 17. G9 閘門 2 澤西防暴水泥墩 (X = -2, Z = 27)
      { minX: -3.8, maxX: -0.2, minZ: 26.5, maxZ: 27.5, h: 1.5, type: 'JERSEY_BARRIER' },
      // 18. 狼犬 1 西側訓練重訓輪胎金字塔 (X = -22, Z = 16)
      { minX: -23.1, maxX: -20.9, minZ: 14.9, maxZ: 17.1, h: 2.2, type: 'TIRE_STACK' },
      // 19. 狼犬 2 東側看台設備櫃 (X = 22, Z = 16)
      { minX: 21.0, maxX: 23.0, minZ: 15.0, maxZ: 17.0, h: 2.2, type: 'CONCRETE_WALL' },
      // 20. G18 競技場西翼防爆牆 (X = -16, Z = 42)
      { minX: -16.5, maxX: -15.5, minZ: 40.0, maxZ: 44.0, h: 2.8, type: 'CONCRETE_WALL' },
      // 21. G19 競技場東翼防爆牆 (X = 16, Z = 42)
      { minX: 15.5, maxX: 16.5, minZ: 40.0, maxZ: 44.0, h: 2.8, type: 'CONCRETE_WALL' },
      // 22. G20 南大門終端沙包工事 (X = 10, Z = 88)
      { minX: 9.4, maxX: 10.6, minZ: 86.2, maxZ: 89.8, h: 1.4, type: 'SANDBAG' },
    ];

    for (let i = 0; i < tacticalCovers.length; i++) {
      const tc = tacticalCovers[i];
      const cx = (tc.minX + tc.maxX) / 2;
      const cz = (tc.minZ + tc.maxZ) / 2;
      const w = tc.maxX - tc.minX;
      const d = tc.maxZ - tc.minZ;
      this.addCollider(tc.minX, tc.maxX, tc.minZ, tc.maxZ, 0, tc.h);

      if (tc.type === 'CONCRETE_CRATE') {
        const wallG = new THREE.BoxGeometry(w, tc.h, d);
        wallG.translate(cx, tc.h / 2, cz);
        concreteGeos.push(wallG);
        const cr1 = new THREE.BoxGeometry(w * 0.9, 0.8, 1.2);
        cr1.translate(cx, tc.h + 0.4, cz - 0.5);
        const cr2 = new THREE.BoxGeometry(w * 0.9, 0.8, 1.2);
        cr2.translate(cx, tc.h + 0.4, cz + 0.5);
        woodPlankGeos.push(cr1, cr2);
      } else if (tc.type === 'TRANSFORMER_SANDBAG') {
        const tfG = new THREE.BoxGeometry(w, tc.h, d * 0.6);
        tfG.translate(cx, tc.h / 2, cz - d * 0.2);
        darkSteelGeos.push(tfG);
        const sbG = new THREE.BoxGeometry(w, 1.2, d * 0.4);
        sbG.translate(cx, 0.6, cz + d * 0.3);
        sandbagGeos.push(sbG);
      } else if (tc.type === 'WOOD_CRATES') {
        const box1 = new THREE.BoxGeometry(w, tc.h * 0.55, d);
        box1.translate(cx, tc.h * 0.275, cz);
        const box2 = new THREE.BoxGeometry(w * 0.8, tc.h * 0.45, d * 0.8);
        box2.translate(cx, tc.h * 0.775, cz);
        woodPlankGeos.push(box1, box2);
      } else if (tc.type === 'SANDBAG') {
        const sb1 = new THREE.BoxGeometry(w, tc.h * 0.55, d);
        sb1.translate(cx, tc.h * 0.275, cz);
        const sb2 = new THREE.BoxGeometry(w * 0.85, tc.h * 0.45, d * 0.85);
        sb2.translate(cx, tc.h * 0.775, cz);
        sandbagGeos.push(sb1, sb2);
      } else if (tc.type === 'PALLETS') {
        for (let l = 0; l < 3; l++) {
          const pg = new THREE.BoxGeometry(w, 0.14, d);
          pg.translate(cx, 0.07 + l * 0.45, cz);
          woodPlankGeos.push(pg);
        }
      } else if (tc.type === 'STEEL_DUMPSTER') {
        const dmp = new THREE.BoxGeometry(w, tc.h, d);
        dmp.translate(cx, tc.h / 2, cz);
        corrugatedIronGeos.push(dmp);
      } else if (tc.type === 'JERSEY_BARRIER') {
        const jb = new THREE.BoxGeometry(w, tc.h, d);
        jb.translate(cx, tc.h / 2, cz);
        concreteGeos.push(jb);
      } else if (tc.type === 'TIRE_STACK') {
        for (let ty = 0; ty < 3; ty++) {
          const tr = new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, 0.65, 12);
          tr.translate(cx, 0.35 + ty * 0.7, cz);
          tireRubberGeos.push(tr);
        }
      } else {
        const cg = new THREE.BoxGeometry(w, tc.h, d);
        cg.translate(cx, tc.h / 2, cz);
        concreteGeos.push(cg);
      }
    }

    // 建立 3D 鑰匙卡模型並加入場景
    // 1. 藍色門禁卡 A (放置於 A 區營舍長桌 X = -45, Z = -50)
    this.keycardAMeshGroup = this.createKeycardMesh(0x38bdf8);
    this.keycardAMeshGroup.position.copy(this.keycardAPos);
    this.group.add(this.keycardAMeshGroup);

    // 2. 黃色門禁卡 B (放置於 B 區貨櫃死角 X = 30, Z = 5)
    this.keycardBMeshGroup = this.createKeycardMesh(0xfacc15);
    this.keycardBMeshGroup.position.copy(this.keycardBPos);
    this.group.add(this.keycardBMeshGroup);

    // 3. 萬能逃脫鑰匙卡 (預設隱藏，Boss 倒地時動態生成)
    this.masterKeycardMeshGroup = this.createKeycardMesh(0xffd700);
    this.masterKeycardMeshGroup.visible = false;
    this.group.add(this.masterKeycardMeshGroup);

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
    const hayStrawMat = new THREE.MeshLambertMaterial({
      color: 0xd4a017 // 經典刺客教條乾草金黃色 (溫潤金黃草垛，辨識度極高)
    });
    const sandbagMat = new THREE.MeshLambertMaterial({
      color: 0xbaa478 // 軍規帆布沙包土黃色
    });

    // 地面類合併網格 (泥地/跑道) 平貼地表，僅接收陰影不投射，省去整片地面的陰影 pass 繪製
    const createMergedMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, castShadow: boolean = true) => {
      if (geos.length === 0) return;
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    };

    createMergedMesh(groundMudGeos, mudMat, false);
    createMergedMesh(groundTrackGeos, trackMat, false);
    createMergedMesh(concreteGeos, concreteMat);
    createMergedMesh(darkSteelGeos, darkSteelMat);
    createMergedMesh(rustedMetalGeos, rustedMetalMat);
    createMergedMesh(fenceWireGeos, fenceWireMat);
    createMergedMesh(corrugatedIronGeos, corrugatedMat);
    createMergedMesh(yellowHazardGeos, yellowHazardMat);
    createMergedMesh(woodPlankGeos, woodPlankMat);
    createMergedMesh(glassGeos, glassMat);
    createMergedMesh(tireRubberGeos, tireRubberMat);
    createMergedMesh(hayStrawGeos, hayStrawMat);
    createMergedMesh(sandbagGeos, sandbagMat);
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

    // 3D 半透明光錐 (ConeGeometry, 頂部在塔頂 Y = 18m，底部位於地面)
    const coneHeight = 28.0;
    const coneRadius = 4.2;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 20, 1, true);
    coneGeo.translate(0, -coneHeight / 2, 0); // 頂點錨點置於 (0, 0, 0)
    coneGeo.rotateX(-Math.PI / 2); // 朝向前方

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    housing.add(coneMesh);

    // 地面投射光斑 (圓盤光圈，貼地 Y = 0.06，半徑 4.2m)
    const spotGeo = new THREE.RingGeometry(0.1, 4.2, 28);
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
    groundSpot.position.set(0, 0.06, 0);
    this.group.add(groundSpot);

    // 單座中央高空探照燈巡視參數 (初始照射 A 區生活廣場)
    this.searchlights.push({
      id: index,
      towerPos: towerPos.clone(),
      housing,
      coneMesh,
      groundSpot,
      currentGroundPos: new THREE.Vector3(0, 0.06, -72),
      angle: 0,
      speed: 0.45,
      radiusX: 36,
      radiusZ: 32,
      centerX: 0,
      centerZ: 0,
      isDetecting: false,
      waypointIndex: 0,
      dwellTimer: 0,
      alertLostTimer: 0
    });
  }

  // 幀迴圈更新探照燈掃視與警戒檢測 (慢速廣域掃描整個區域，絕不作弊黏著玩家身旁；刺客草堆掩體中無法被發現)
  public update(delta: number, playerPos: THREE.Vector3, isPlayerHiding: boolean = false): { isDetectedBySearchlight: boolean; nearestDist: number } {
    this.updateKeycards(delta);
    let anyDetected = false;
    let minDistance = 999;

    const isPlayerOutdoors = playerPos.y < 3.0;

    // 沉穩緩慢速度設計：
    // 平時廣域巡邏速度設為 1.8 m/s (慢速大氣感巡視，玩家可觀察光斑軌跡預判躲避)
    // 警報追蹤速度設為 3.6 m/s (逃跑有壓迫感，但玩家正常跑步 5.0m/s 或疾跑 10.0m/s 可及時逃入掩體)
    const sweepSpeed = 1.8;
    const alertTrackingSpeed = 3.6;

    for (const sl of this.searchlights) {
      sl.angle += delta * 0.65;
      if (sl.waypointIndex === undefined) sl.waypointIndex = 0;
      if (sl.dwellTimer === undefined) sl.dwellTimer = 0;
      if (sl.alertLostTimer === undefined) sl.alertLostTimer = 0;

      // 檢查光線路徑是否遭到任何掩體或建築實體碰撞箱遮擋
      const isOccludedByCover = this.isRayBlockedByColliders(sl.towerPos, playerPos);

      // 計算與玩家平面距離
      const pDx = playerPos.x - sl.currentGroundPos.x;
      const pDz = playerPos.z - sl.currentGroundPos.z;
      const distToPlayer = Math.hypot(pDx, pDz);

      if (distToPlayer < minDistance) {
        minDistance = distToPlayer;
      }

      // 判定是否真正被光束捕捉：在光圈半徑 4.2m 內、身處室外地面 (Y < 3.0)、且無掩體遮擋、且未身處刺客草堆掩體中
      const isPlayerCaught = distToPlayer < 4.2 && isPlayerOutdoors && !isOccludedByCover && !isPlayerHiding;

      if (isPlayerCaught) {
        sl.isDetecting = true;
        sl.alertLostTimer = 0;
        anyDetected = true;
      } else if (sl.isDetecting) {
        // 逃入掩體後，探照燈在最後失蹤位置搜索 2.0 秒，隨後解除鎖定恢復全區巡視
        sl.alertLostTimer += delta;
        if (sl.alertLostTimer >= 2.0) {
          sl.isDetecting = false;
          sl.alertLostTimer = 0;
        } else {
          anyDetected = true; // 警戒倒數持續中
        }
      }

      let targetX = 0;
      let targetZ = 0;
      let moveSpeed = sweepSpeed;

      if (sl.isDetecting) {
        // 警報狀態：哨塔守衛將光斑鎖定玩家方位追蹤
        targetX = playerPos.x;
        targetZ = playerPos.z;
        moveSpeed = alertTrackingSpeed;

        // 探照燈光圈與光錐切換為高警戒亮紅色！
        (sl.groundSpot.material as THREE.MeshBasicMaterial).color.setHex(0xff2222);
        (sl.groundSpot.material as THREE.MeshBasicMaterial).opacity = 0.75;
        (sl.coneMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff3333);
        (sl.coneMesh.material as THREE.MeshBasicMaterial).opacity = 0.35;
      } else {
        // 平時正常狀態：依照廣域巡邏點慢速掃描整個特訓院，完全不跟隨玩家！
        const currentWp = SEARCHLIGHT_SWEEP_WAYPOINTS[sl.waypointIndex];
        const distToWp = Math.hypot(currentWp.x - sl.currentGroundPos.x, currentWp.z - sl.currentGroundPos.z);

        if (distToWp < 2.5) {
          // 到達指定巡查區，在周邊慢速微幅扇形掃描 (dwellTimer 3.5s)
          sl.dwellTimer += delta;
          targetX = currentWp.x + Math.sin(sl.angle * 1.3) * 3.8;
          targetZ = currentWp.z + Math.cos(sl.angle * 0.9) * 2.8;
          moveSpeed = 1.2; // 慢速扇形擺動

          if (sl.dwellTimer >= 3.5) {
            sl.dwellTimer = 0;
            // 隨機跳轉或依序推進至下一個巡檢點 (營造自然警戒氛圍)
            let nextIdx = (sl.waypointIndex + 1) % SEARCHLIGHT_SWEEP_WAYPOINTS.length;
            if (Math.random() < 0.35) {
              nextIdx = Math.floor(Math.random() * SEARCHLIGHT_SWEEP_WAYPOINTS.length);
            }
            sl.waypointIndex = nextIdx;
          }
        } else {
          targetX = currentWp.x;
          targetZ = currentWp.z;
          moveSpeed = sweepSpeed; // 1.8 m/s 慢速滑行
        }

        // 恢復平時柔和亮白/淡黃巡視光束
        (sl.groundSpot.material as THREE.MeshBasicMaterial).color.setHex(0xfff5cc);
        (sl.groundSpot.material as THREE.MeshBasicMaterial).opacity = 0.45;
        (sl.coneMesh.material as THREE.MeshBasicMaterial).color.setHex(0xfffae0);
        (sl.coneMesh.material as THREE.MeshBasicMaterial).opacity = 0.16;
      }

      // 限制光斑在特訓校場圍牆範圍內
      targetX = THREE.MathUtils.clamp(targetX, -82, 82);
      targetZ = THREE.MathUtils.clamp(targetZ, -82, 82);

      // 平滑線速度位移
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
    }

    return {
      isDetectedBySearchlight: anyDetected,
      nearestDist: minDistance
    };
  }

  // 檢測從起點 (瞭望塔) 到終點 (玩家) 的視線射線是否被實體掩體/建築碰撞箱阻擋
  public isRayBlockedByColliders(start: THREE.Vector3, targetPos: THREE.Vector3): boolean {
    const endX = targetPos.x;
    const endY = targetPos.y + 1.2; // 玩家身形有效中線高度
    const endZ = targetPos.z;

    const dirX = endX - start.x;
    const dirY = endY - start.y;
    const dirZ = endZ - start.z;
    const len = Math.hypot(dirX, dirY, dirZ);
    if (len < 0.001) return false;

    const invDirX = 1.0 / (Math.abs(dirX) > 0.0001 ? dirX : 0.0001);
    const invDirY = 1.0 / (Math.abs(dirY) > 0.0001 ? dirY : 0.0001);
    const invDirZ = 1.0 / (Math.abs(dirZ) > 0.0001 ? dirZ : 0.0001);

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      if (box.isFloorOnly) continue; // 地板/層板不阻礙高空俯視

      // AABB Slab Test
      const t1x = (box.min.x - start.x) * invDirX;
      const t2x = (box.max.x - start.x) * invDirX;
      const tMinX = Math.min(t1x, t2x);
      const tMaxX = Math.max(t1x, t2x);

      const t1y = (box.min.y - start.y) * invDirY;
      const t2y = (box.max.y - start.y) * invDirY;
      const tMinY = Math.min(t1y, t2y);
      const tMaxY = Math.max(t1y, t2y);

      const t1z = (box.min.z - start.z) * invDirZ;
      const t2z = (box.max.z - start.z) * invDirZ;
      const tMinZ = Math.min(t1z, t2z);
      const tMaxZ = Math.max(t1z, t2z);

      const tEnter = Math.max(tMinX, tMinY, tMinZ);
      const tExit = Math.min(tMaxX, tMaxY, tMaxZ);

      // 當光線穿透實體盒 (t 位於 0.02 到 0.98 之間) 即判定被遮蔽
      if (tEnter <= tExit && tExit > 0.02 && tEnter < 0.98) {
        return true;
      }
    }
    return false;
  }

  // 建立 3D 浮動鑰匙卡模型
  public createKeycardMesh(colorHex: number): THREE.Group {
    const grp = new THREE.Group();
    const cardGeo = new THREE.BoxGeometry(0.5, 0.06, 0.8);
    const cardMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.85,
      roughness: 0.2,
      emissive: colorHex,
      emissiveIntensity: 0.5
    });
    const card = new THREE.Mesh(cardGeo, cardMat);
    grp.add(card);

    const chipGeo = new THREE.BoxGeometry(0.22, 0.08, 0.22);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.y = 0.01;
    grp.add(chip);

    const pLight = new THREE.PointLight(colorHex, 1.4, 4.5);
    pLight.position.y = 0.35;
    grp.add(pLight);

    return grp;
  }

  // 建立門禁終端控制台模型
  public createTerminalMesh(ledColorHex: number): THREE.Group {
    const grp = new THREE.Group();
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.2, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x334155 })
    );
    stand.position.y = 0.6;
    grp.add(stand);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x1e293b })
    );
    head.position.set(0, 1.2, 0);
    head.rotation.x = -0.3;
    grp.add(head);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.2),
      new THREE.MeshBasicMaterial({ color: ledColorHex })
    );
    screen.position.set(0, 1.25, 0.18);
    screen.rotation.x = -0.3;
    grp.add(screen);

    return grp;
  }

  // 開啟管制閘門 1 (解除 A 區到 B 區的實體阻隔)
  public openGateA() {
    if (this.isGateAOpen) return;
    this.isGateAOpen = true;
    this.gateAMeshGroup.position.y += 5.5;
    if (this.gateACollider) {
      this.gateACollider.min.y = -100;
      this.gateACollider.max.y = -100;
    }
  }

  // 開啟管制閘門 2 (解除 B 區到 C 區的實體阻隔)
  public openGateB() {
    if (this.isGateBOpen) return;
    this.isGateBOpen = true;
    this.gateBMeshGroup.position.y += 5.5;
    if (this.gateBCollider) {
      this.gateBCollider.min.y = -100;
      this.gateBCollider.max.y = -100;
    }
  }

  // 開啟南側終極絕境逃脫大門 (解除特訓院出口大門阻隔)
  public openSouthGate() {
    if (this.isSouthGateOpen) return;
    this.isSouthGateOpen = true;
    this.southGateMeshGroup.position.y += 9.0;
    if (this.southGateCollider) {
      this.southGateCollider.min.y = -100;
      this.southGateCollider.max.y = -100;
    }
  }

  // Boss 擊敗後於地面生成【萬能逃脫鑰匙卡】
  public spawnMasterKeycard(pos: THREE.Vector3) {
    this.masterKeycardPos = pos.clone();
    this.masterKeycardPos.y = 0.8;
    this.masterKeycardMeshGroup.position.copy(this.masterKeycardPos);
    this.masterKeycardMeshGroup.visible = true;
  }

  // 鑰匙卡自轉與上下懸浮動畫
  public updateKeycards(delta: number) {
    const time = performance.now() * 0.003;
    const hoverY = Math.sin(time) * 0.15;

    if (!this.hasPickedKeycardA && this.keycardAMeshGroup) {
      this.keycardAMeshGroup.rotation.y += delta * 2.5;
      this.keycardAMeshGroup.position.y = this.keycardAPos.y + hoverY;
    }
    if (!this.hasPickedKeycardB && this.keycardBMeshGroup) {
      this.keycardBMeshGroup.rotation.y += delta * 2.5;
      this.keycardBMeshGroup.position.y = this.keycardBPos.y + hoverY;
    }
    if (this.masterKeycardPos && !this.hasPickedMasterKeycard && this.masterKeycardMeshGroup.visible) {
      this.masterKeycardMeshGroup.rotation.y += delta * 3.0;
      this.masterKeycardMeshGroup.position.y = this.masterKeycardPos.y + hoverY;
    }
  }

  // 銷毀與清理資源
  public dispose() {
    this.scene.remove(this.group);
  }
}
