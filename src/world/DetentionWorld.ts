import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DETENTION_ROADS, DETENTION_BUILDINGS, DETENTION_TOWERS, DETENTION_CORNER_POSTS, SEARCHLIGHT_TOWER, DETENTION_CONTAINERS,
  CONTAINER_LONG, CONTAINER_SHORT, OBSTACLE_WALLS, DETENTION_BARRIERS, BOSS_ARENA, GATE_KIOSK, GUARD_HOUSE, EQUIPMENT_STORE,
  INTAKE_BOOTH, YARD_WATCHPOST, INTAKE_FENCE_Z0, INTAKE_FENCE_Z1, INTAKE_FENCE_SEGMENTS, FENCE_BREACH, INTAKE_CHECKPOINT, SERVICE_GATE,
  GATE_WALLS, GATE_WALL_H, GENERATOR_PILLARS, GENERATOR_PILLAR_SIZE,
  DetentionHall, DoorSide, Rect
} from './detentionLayout';
import { ColliderRegistry, CollidableBox } from './ColliderRegistry';
import { isBlockedXZ } from '../physics/aabb';
import { sharedLambert } from './sceneUtils';

// 管制閘門 1、2 門板共用材質 (外觀相同，閘門開啟只移動群組不改材質)
const GATE_PANEL_MAT = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.3 });

// 越獄起點 (北側牢房後方通風口)：首次進入與「重新挑戰」皆由此出發
export const INITIAL_SPAWN = new THREE.Vector3(-55, 0, -84);
const INITIAL_CHECKPOINT_NAME = 'A區收容車道起點';

export interface SearchlightItem {
  id: number;
  towerPos: THREE.Vector3;
  housing: THREE.Group;
  coneMesh: THREE.Mesh;
  groundSpot: THREE.Mesh;
  currentGroundPos: THREE.Vector3;
  angle: number;
  isDetecting: boolean;
  waypointIndex?: number;
  dwellTimer?: number;
  alertLostTimer?: number;
}

// 探照燈慢速廣域巡查路徑點 (全面均勻涵蓋 A區牢房、B區貨櫃迷宮、C區競技場與南大門，絕不作弊黏著玩家)
const SEARCHLIGHT_SWEEP_WAYPOINTS: { x: number; z: number }[] = [
  // A 區 (收容車道、庭院、服務巷、閘前廣場)
  { x: -30, z: -84 },
  { x: 24, z: -84 },
  { x: 0, z: -70 },
  { x: -24, z: -56 },
  { x: 24, z: -52 },
  { x: -47, z: -60 },
  { x: 47, z: -50 },
  { x: -40, z: -34 },
  { x: 40, z: -34 },

  // B 區 (貨櫃堆置場、障礙訓練場、器材庫前、閘前廣場)
  { x: -20, z: -14 },
  { x: 20, z: -14 },
  { x: 0, z: 0 },
  { x: -40, z: 6 },
  { x: -34, z: 20 },
  { x: 46, z: 6 },
  { x: 30, z: 26 },
  { x: -24, z: 30 },

  // C 區 (決戰庭院、建物側翼、南側道路)
  { x: -20, z: 48 },
  { x: 0, z: 62 },
  { x: 20, z: 48 },
  { x: -38, z: 66 },
  { x: 38, z: 66 },
  { x: 0, z: 84 }
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
  public spawnPos: THREE.Vector3 = INITIAL_SPAWN.clone(); // 起點：北側牢房後方通風口 (空曠安全區)
  public currentCheckpointPos: THREE.Vector3 = INITIAL_SPAWN.clone(); // 當前重生/存檔點
  public currentCheckpointName: string = INITIAL_CHECKPOINT_NAME; // 存檔點名稱

  // 更新檢查點 / 存檔點
  public setCheckpoint(pos: THREE.Vector3, name: string) {
    this.currentCheckpointPos.copy(pos);
    this.spawnPos.copy(pos);
    this.currentCheckpointName = name;
  }

  // 存檔點還原為越獄起點 (重新挑戰時使用)
  public resetCheckpoint() {
    this.setCheckpoint(INITIAL_SPAWN, INITIAL_CHECKPOINT_NAME);
  }
  public commissaryPos: THREE.Vector3 = new THREE.Vector3(66, 0, -35.0); // 特訓小賣部取餐/補給窗口
  public pullupStationPos: THREE.Vector3 = new THREE.Vector3(-52, 0, 0); // 西側體能區：單槓訓練
  public benchpressStationPos: THREE.Vector3 = new THREE.Vector3(-48, 0, -8); // 西側體能區：臥推訓練
  public tireStationPos: THREE.Vector3 = new THREE.Vector3(-49, 0, 8); // 西側體能區：巨型輪胎翻滾

  // 門禁與機關點位
  public gateAPos: THREE.Vector3 = new THREE.Vector3(0, 0, -28); // 管制閘門 1 (連通 A 區與 B 區)
  public gateBPos: THREE.Vector3 = new THREE.Vector3(0, 0, 35);  // 管制閘門 2 (連通 B 區與 C 區)
  public southGateConsolePos: THREE.Vector3 = new THREE.Vector3(-7.5, 0, 93); // 南大門終端控制台

  // 鑰匙卡點位
  public keycardAPos: THREE.Vector3 = new THREE.Vector3(0, 0.95, -61);  // 藍色門禁卡 A (中央警衛室辦公桌)
  public keycardBPos: THREE.Vector3 = new THREE.Vector3(66, 0.95, 7.2);  // 黃色門禁卡 B (B 區器材庫工作檯)
  public masterKeycardPos: THREE.Vector3 | null = null;                // 萬能逃脫鑰匙卡 (Boss 擊敗後掉落)

  // C 區發電機混凝土防護柱 (供玩家誘使 Boss 衝撞硬直破盾)
  public generatorPillars: THREE.Vector3[] = GENERATOR_PILLARS.map((gp) => new THREE.Vector3(gp.x, 0, gp.z));

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

  // 碰撞體登記 (牆面預設高 5m；地板層板上下各 0.25m；坡道頂部延伸 0.4m)
  private readonly colliderRegistry = new ColliderRegistry(this.colliders, { defaultWallHeight: 5, slabBelow: 0.25, slabAbove: 0.25, rampTopPad: 0.4 });
  public addCollider(minX: number, maxX: number, minZ: number, maxZ: number, minY?: number, maxY?: number): CollidableBox {
    return this.colliderRegistry.addCollider(minX, maxX, minZ, maxZ, minY, maxY);
  }
  public addFloorSlab(minX: number, maxX: number, minZ: number, maxZ: number, floorY: number) {
    this.colliderRegistry.addFloorSlab(minX, maxX, minZ, maxZ, floorY);
  }
  public addRamp(minX: number, maxX: number, minZ: number, maxZ: number, yAtMinZ: number, yAtMaxZ: number) {
    this.colliderRegistry.addRamp(minX, maxX, minZ, maxZ, yAtMinZ, yAtMaxZ);
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

    // 道路骨架 (北側收容車道、外圍巡邏路、中軸路、橫向廣場路與 A 區服務巷；配置資料與雷達/大地圖共用)
    for (const r of DETENTION_ROADS) {
      const roadGeo = new THREE.BoxGeometry(r.maxX - r.minX, 0.03, r.maxZ - r.minZ);
      roadGeo.translate((r.minX + r.maxX) / 2, 0.015, (r.minZ + r.maxZ) / 2);
      groundTrackGeos.push(roadGeo);
    }

    // 泥水積水坑窪 (訓練場與庭院零星積水，平貼地表帶有微光)
    const puddlePositions = [
      { x: -12, z: 4, w: 10, h: 7 },
      { x: 38, z: -12, w: 12, h: 8 },
      { x: -18, z: -52, w: 9, h: 6 },
      { x: 24, z: 60, w: 10, h: 7 }
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
    // 與合併網格的鍍鋅鋼架/警示黃同色：共用材質實例
    const darkSteelMatSingle = sharedLambert(0x5c728a);
    const yellowMatSingle = sharedLambert(0xf1c40f);
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
    // 3. 四座高聳瞭望塔 (北側收容車道兩端、南側道路兩端)
    // ==========================================
    const towerCoords = DETENTION_TOWERS;

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
    const slX = SEARCHLIGHT_TOWER.x, slZ = SEARCHLIGHT_TOWER.z;
    const slMast = new THREE.CylinderGeometry(0.35, 0.5, 18.0, 8);
    slMast.translate(slX, 9.0, slZ);
    darkSteelGeos.push(slMast);
    const slPlatform = new THREE.BoxGeometry(3.2, 0.35, 3.2);
    slPlatform.translate(slX, 17.8, slZ);
    darkSteelGeos.push(slPlatform);
    const slBase = new THREE.BoxGeometry(2.2, 0.8, 2.2);
    slBase.translate(slX, 0.4, slZ);
    concreteGeos.push(slBase);
    this.addCollider(slX - 1.1, slX + 1.1, slZ - 1.1, slZ + 1.1, 0, 18.0);
    this.createSearchlight(0, new THREE.Vector3(slX, 18.0, slZ));

    // ==========================================
    // 4. 院區建築 (配置資料與雷達/大地圖共用)
    //    實心樓房：外牆 + 窗戶列 (牢房含鐵窗欄) + 主入口鋼門與雨遮 + 屋頂女兒牆
    //    空心建物 (中央警衛室、器材庫)：四面牆含門洞，內部可行走、取卡與藏匿
    // ==========================================
    const pushBox = (bucket: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      bucket.push(g);
    };

    // 沿牆面排列窗戶 (side 為牆面朝向；from/to 為沿牆座標範圍)
    const addWindowRow = (side: DoorSide, b: Rect, y: number, skipFrom: number, skipTo: number, barred: boolean) => {
      const alongX = side === 'N' || side === 'S';
      const from = alongX ? b.minX : b.minZ;
      const to = alongX ? b.maxX : b.maxZ;
      const facePos = side === 'N' ? b.minZ - 0.05 : side === 'S' ? b.maxZ + 0.05 : side === 'W' ? b.minX - 0.05 : b.maxX + 0.05;
      for (let t = from + 2.5; t <= to - 2.5; t += 4) {
        if (t > skipFrom - 1.6 && t < skipTo + 1.6) continue;
        if (alongX) pushBox(glassGeos, 1.5, 1.0, 0.08, t, y, facePos);
        else pushBox(glassGeos, 0.08, 1.0, 1.5, facePos, y, t);
        if (barred) {
          for (const k of [-0.45, 0, 0.45]) {
            if (alongX) pushBox(darkSteelGeos, 0.06, 1.0, 0.1, t + k, y, facePos);
            else pushBox(darkSteelGeos, 0.1, 1.0, 0.06, facePos, y, t + k);
          }
        }
      }
    };

    for (const b of DETENTION_BUILDINGS) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const wallBucket = b.mat === 'metal' ? corrugatedIronGeos : concreteGeos;
      // 主體與勒腳
      pushBox(wallBucket, w, b.h, d, cx, b.h / 2, cz);
      pushBox(concreteGeos, w + 0.3, 0.5, d + 0.3, cx, 0.25, cz);
      // 屋頂板與女兒牆
      pushBox(rustedMetalGeos, w + 0.4, 0.25, d + 0.4, cx, b.h + 0.12, cz);
      pushBox(concreteGeos, w + 0.4, 0.6, 0.3, cx, b.h + 0.55, b.minZ - 0.05);
      pushBox(concreteGeos, w + 0.4, 0.6, 0.3, cx, b.h + 0.55, b.maxZ + 0.05);
      pushBox(concreteGeos, 0.3, 0.6, d + 0.4, b.minX - 0.05, b.h + 0.55, cz);
      pushBox(concreteGeos, 0.3, 0.6, d + 0.4, b.maxX + 0.05, b.h + 0.55, cz);
      // 屋頂通風設備
      pushBox(darkSteelGeos, 2.2, 1.0, 1.6, cx - w * 0.25, b.h + 0.75, cz);
      pushBox(darkSteelGeos, 1.6, 0.8, 1.6, cx + w * 0.22, b.h + 0.65, cz - d * 0.2);

      // 主入口：鋼門 + 黃色雨遮 (位於門面中央)
      const doorAlongX = b.door === 'N' || b.door === 'S';
      const doorCenter = doorAlongX ? cx : cz;
      const doorFace = b.door === 'N' ? b.minZ - 0.08 : b.door === 'S' ? b.maxZ + 0.08 : b.door === 'W' ? b.minX - 0.08 : b.maxX + 0.08;
      const awningOut = b.door === 'N' || b.door === 'W' ? -0.8 : 0.8;
      if (doorAlongX) {
        pushBox(darkSteelGeos, 3.0, 2.9, 0.12, doorCenter, 1.45, doorFace);
        pushBox(yellowHazardGeos, 4.2, 0.18, 1.6, doorCenter, 3.25, doorFace + awningOut);
      } else {
        pushBox(darkSteelGeos, 0.12, 2.9, 3.0, doorFace, 1.45, doorCenter);
        pushBox(yellowHazardGeos, 1.6, 0.18, 4.2, doorFace + awningOut, 3.25, doorCenter);
      }

      // 各樓層窗戶列 (四面；主入口兩側留空)
      const barred = b.name.includes('牢房');
      for (let f = 0; f < b.floors; f++) {
        const wy = 1.9 + f * 3.4;
        for (const side of ['N', 'S', 'E', 'W'] as DoorSide[]) {
          const skip = side === b.door && f === 0;
          addWindowRow(side, b, wy, skip ? doorCenter : 1e9, skip ? doorCenter : 1e9, barred);
        }
      }

      // 牢房舍外牆黃色樓層警示帶
      if (b.floors > 1) {
        pushBox(yellowHazardGeos, w + 0.12, 0.25, d + 0.12, cx, 3.6, cz);
      }
      this.addCollider(b.minX, b.maxX, b.minZ, b.maxZ, 0, b.h + 0.9);
    }

    // 空心建物：四面牆 (厚 0.4m) + 門洞 + 屋頂；牆面各自為碰撞體，內部可行走
    const buildHall = (hb: DetentionHall) => {
      const t = 0.4;
      const cx = (hb.minX + hb.maxX) / 2, cz = (hb.minZ + hb.maxZ) / 2;
      const w = hb.maxX - hb.minX, d = hb.maxZ - hb.minZ;
      const wall = (x0: number, x1: number, z0: number, z1: number) => {
        pushBox(concreteGeos, x1 - x0, hb.h, z1 - z0, (x0 + x1) / 2, hb.h / 2, (z0 + z1) / 2);
        this.addCollider(x0, x1, z0, z1, 0, hb.h);
      };
      // N/S 牆沿 X，E/W 牆沿 Z；門洞所在牆分兩段
      const sides: { side: DoorSide; along: [number, number]; at: [number, number] }[] = [
        { side: 'N', along: [hb.minX, hb.maxX], at: [hb.minZ, hb.minZ + t] },
        { side: 'S', along: [hb.minX, hb.maxX], at: [hb.maxZ - t, hb.maxZ] },
        { side: 'W', along: [hb.minZ + t, hb.maxZ - t], at: [hb.minX, hb.minX + t] },
        { side: 'E', along: [hb.minZ + t, hb.maxZ - t], at: [hb.maxX - t, hb.maxX] }
      ];
      for (const sd of sides) {
        const segs: [number, number][] = sd.side === hb.doorSide
          ? [[sd.along[0], hb.doorFrom], [hb.doorTo, sd.along[1]]]
          : [sd.along];
        for (const [a0, a1] of segs) {
          if (a1 - a0 < 0.05) continue;
          if (sd.side === 'N' || sd.side === 'S') wall(a0, a1, sd.at[0], sd.at[1]);
          else wall(sd.at[0], sd.at[1], a0, a1);
        }
        // 門楣
        if (sd.side === hb.doorSide) {
          const lintelH = 0.8;
          const span = hb.doorTo - hb.doorFrom;
          const mid = (hb.doorFrom + hb.doorTo) / 2;
          if (sd.side === 'N' || sd.side === 'S') pushBox(concreteGeos, span, lintelH, t, mid, hb.h - lintelH / 2, (sd.at[0] + sd.at[1]) / 2);
          else pushBox(concreteGeos, t, lintelH, span, (sd.at[0] + sd.at[1]) / 2, hb.h - lintelH / 2, mid);
          if (sd.side === 'N' || sd.side === 'S') pushBox(yellowHazardGeos, span + 0.4, 0.25, t + 0.1, mid, hb.h - lintelH - 0.12, (sd.at[0] + sd.at[1]) / 2);
          else pushBox(yellowHazardGeos, t + 0.1, 0.25, span + 0.4, (sd.at[0] + sd.at[1]) / 2, hb.h - lintelH - 0.12, mid);
        }
      }
      // 屋頂 (不設碰撞體：鏡頭與玩家皆在屋頂下方活動)
      pushBox(rustedMetalGeos, w + 0.6, 0.25, d + 0.6, cx, hb.h + 0.12, cz);
      pushBox(yellowHazardGeos, w + 0.62, 0.3, 0.12, cx, hb.h - 0.2, hb.minZ - 0.3);
      pushBox(yellowHazardGeos, w + 0.62, 0.3, 0.12, cx, hb.h - 0.2, hb.maxZ + 0.3);
      // 室內地坪
      pushBox(concreteGeos, w - 2 * t, 0.06, d - 2 * t, cx, 0.03, cz);
    };

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
    // 8.5 三區戰術動線 (A 區監區 / B 區訓練場 / C 區決戰區)
    // ==========================================
    // --- 【A 區：監區 (Z: -95 ~ -28)】---
    // 動線：主線 = 收容車道 → 中央檢查哨 → 中央警衛室取卡 → 閘前廣場 → 閘門 1
    //       西潛行 = 收容車道西段 → 剪破圍籬 → 瞭望哨陰影 → 警衛室西側 → 醫務室後方 → 廣場
    //       東潛行 = 收容車道東段 → 服務門 → 東服務巷 → 洗衣房旁 → 警衛室東側 → 廣場
    // 收容圍籬 (三個出入口：西側破洞、中央檢查哨、東側服務門)
    const fenceZ = (INTAKE_FENCE_Z0 + INTAKE_FENCE_Z1) / 2;
    for (const [x0, x1] of INTAKE_FENCE_SEGMENTS) {
      const len = x1 - x0;
      pushBox(fenceWireGeos, len, 3.0, 0.08, (x0 + x1) / 2, 1.6, fenceZ);
      pushBox(concreteGeos, len, 0.3, 0.5, (x0 + x1) / 2, 0.15, fenceZ);
      for (let x = x0; x <= x1 + 0.01; x += 5) {
        const post = new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6);
        post.translate(Math.min(x, x1), 1.7, fenceZ);
        darkSteelGeos.push(post);
      }
      this.addCollider(x0, x1, INTAKE_FENCE_Z0, INTAKE_FENCE_Z1, 0, 3.4);
    }
    // 西側剪破的圍籬：兩側捲曲外翻的斷網
    for (const [x, rot] of [[FENCE_BREACH.x0 + 0.5, 0.6], [FENCE_BREACH.x1 - 0.5, -0.6]] as [number, number][]) {
      const curl = new THREE.BoxGeometry(1.2, 1.6, 0.06);
      curl.rotateY(rot);
      curl.translate(x, 0.9, fenceZ + 0.4);
      fenceWireGeos.push(curl);
    }
    // 中央檢查哨：門柱、升起的黃黑柵欄桿與上方警示橫樑
    for (const x of [INTAKE_CHECKPOINT.x0 - 0.3, INTAKE_CHECKPOINT.x1 + 0.3]) {
      pushBox(concreteGeos, 0.6, 4.0, 0.6, x, 2.0, fenceZ);
      this.addCollider(x - 0.3, x + 0.3, fenceZ - 0.3, fenceZ + 0.3, 0, 4.0);
    }
    pushBox(yellowHazardGeos, INTAKE_CHECKPOINT.x1 - INTAKE_CHECKPOINT.x0 + 1.2, 0.5, 0.3, 0, 4.25, fenceZ);
    const boom = new THREE.BoxGeometry(0.18, 4.0, 0.18);
    boom.translate(INTAKE_CHECKPOINT.x1 - 0.2, 2.6, fenceZ - 0.6);
    yellowHazardGeos.push(boom);
    // 東側服務門：向內敞開的鐵網門扇
    {
      const leaf = new THREE.BoxGeometry(SERVICE_GATE.x1 - SERVICE_GATE.x0, 2.8, 0.08);
      leaf.translate(-(SERVICE_GATE.x1 - SERVICE_GATE.x0) / 2, 0, 0);
      leaf.rotateY(-1.2);
      leaf.translate(SERVICE_GATE.x1, 1.5, fenceZ);
      fenceWireGeos.push(leaf);
    }
    // 收容檢查哨亭 (監看收容車道與檢查哨口)
    {
      const k = INTAKE_BOOTH;
      const kx = (k.minX + k.maxX) / 2, kz = (k.minZ + k.maxZ) / 2;
      pushBox(concreteGeos, k.maxX - k.minX, k.h, k.maxZ - k.minZ, kx, k.h / 2, kz);
      pushBox(glassGeos, k.maxX - k.minX - 0.6, 1.0, 0.08, kx, 1.9, k.minZ - 0.04);
      pushBox(glassGeos, 0.08, 1.0, k.maxZ - k.minZ - 0.6, k.minX - 0.04, 1.9, kz);
      pushBox(yellowHazardGeos, k.maxX - k.minX + 0.8, 0.2, k.maxZ - k.minZ + 0.8, kx, k.h + 0.1, kz);
      this.addCollider(k.minX, k.maxX, k.minZ, k.maxZ, 0, k.h + 0.2);
    }
    // 中央警衛室 (門禁卡 A 存放於室內辦公桌)：辦公桌、監視器櫃、檔案櫃
    buildHall(GUARD_HOUSE);
    {
      const g = GUARD_HOUSE;
      const gx = (g.minX + g.maxX) / 2;
      pushBox(woodPlankGeos, 3.0, 0.8, 1.2, gx, 0.4, -61);
      this.addCollider(gx - 1.5, gx + 1.5, -61.6, -60.4, 0, 0.85);
      pushBox(darkSteelGeos, 4.0, 2.2, 0.6, gx, 1.1, g.minZ + 0.75);
      pushBox(glassGeos, 3.6, 1.0, 0.06, gx, 1.5, g.minZ + 1.08);
      this.addCollider(gx - 2.0, gx + 2.0, g.minZ + 0.4, g.minZ + 1.05, 0, 2.2);
      pushBox(darkSteelGeos, 0.6, 1.8, 2.4, g.maxX - 0.75, 0.9, -61);
      this.addCollider(g.maxX - 1.05, g.maxX - 0.4, -62.2, -59.8, 0, 1.8);
      // 南面門洞兩側窗戶
      pushBox(glassGeos, 2.0, 1.0, 0.08, g.minX + 2.0, 1.9, g.maxZ + 0.02);
      pushBox(glassGeos, 2.0, 1.0, 0.08, g.maxX - 2.0, 1.9, g.maxZ + 0.02);
    }
    // 庭院瞭望哨 (矮型哨塔：混凝土塔身 + 頂部哨亭)
    {
      const p = YARD_WATCHPOST;
      const px = (p.minX + p.maxX) / 2, pz = (p.minZ + p.maxZ) / 2;
      pushBox(concreteGeos, p.maxX - p.minX, p.h - 2.2, p.maxZ - p.minZ, px, (p.h - 2.2) / 2, pz);
      pushBox(corrugatedIronGeos, p.maxX - p.minX + 0.6, 2.0, p.maxZ - p.minZ + 0.6, px, p.h - 1.2, pz);
      pushBox(glassGeos, p.maxX - p.minX + 0.62, 0.8, p.maxZ - p.minZ + 0.62, px, p.h - 1.0, pz);
      pushBox(rustedMetalGeos, p.maxX - p.minX + 1.2, 0.2, p.maxZ - p.minZ + 1.2, px, p.h + 0.1, pz);
      this.addCollider(p.minX, p.maxX, p.minZ, p.maxZ, 0, p.h + 0.2);
    }
    // 食堂前戶外補給窗口 (特訓小賣部)
    {
      const sx = this.commissaryPos.x, sz = this.commissaryPos.z;
      pushBox(woodPlankGeos, 3.6, 1.1, 0.8, sx, 0.55, sz - 1.4);
      this.addCollider(sx - 1.8, sx + 1.8, sz - 1.8, sz - 1.0, 0, 1.1);
      pushBox(yellowHazardGeos, 4.4, 0.15, 2.2, sx, 2.9, sz - 1.6);
      for (const ox of [-2.0, 2.0]) pushBox(darkSteelGeos, 0.1, 2.9, 0.1, sx + ox, 1.45, sz - 0.6);
    }
    // 閘前廣場與南側道路低矮護欄
    for (const bx of DETENTION_BARRIERS) {
      pushBox(concreteGeos, bx.maxX - bx.minX, bx.h, bx.maxZ - bx.minZ, (bx.minX + bx.maxX) / 2, bx.h / 2, (bx.minZ + bx.maxZ) / 2);
      this.addCollider(bx.minX, bx.maxX, bx.minZ, bx.maxZ, 0, bx.h);
    }

    // 管制閘門 1、2 隔斷牆 (Z = -28 / 35，橫跨全院嚴密封鎖至東西圍牆 X: ±96.5，杜絕任何側翼偷渡通道，僅在中央留出閘口)
    for (const w of GATE_WALLS) {
      const cz = (w.minZ + w.maxZ) / 2;
      pushBox(concreteGeos, w.maxX - w.minX, GATE_WALL_H, w.maxZ - w.minZ, (w.minX + w.maxX) / 2, GATE_WALL_H / 2, cz);
      this.addCollider(w.minX, w.maxX, cz - 0.6, cz + 0.6, 0, 8.0);
    }

    // 動態管制閘門 1 (需藍色門禁卡 A 開啟)
    this.gateAMeshGroup = new THREE.Group();
    const gateADoor = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 4.5, 0.4),
      GATE_PANEL_MAT
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

    // --- 【B 區：訓練場 (Z: -28 ~ 35)】---
    // 動線：主線 = 閘門 1 → 貨櫃堆置場 (探照燈下) → 器材庫取卡 B → 閘前廣場 → 閘門 2
    //       西潛行 = 西外圍巡邏路 → 職訓工坊後方 → 閘門 2；東潛行 = 東外圍巡邏路 → 器材庫後側 → 閘門 2
    // 軍規海運貨櫃堆置場 (配置資料與雷達/大地圖共用)
    for (const c of DETENTION_CONTAINERS) {
      const w = c.isZ ? CONTAINER_SHORT : CONTAINER_LONG;
      const d = c.isZ ? CONTAINER_LONG : CONTAINER_SHORT;
      const h = 3.2;
      pushBox(corrugatedIronGeos, w, h, d, c.x, h / 2, c.z);
      this.addCollider(c.x - w / 2, c.x + w / 2, c.z - d / 2, c.z + d / 2, 0, h);
    }
    // 障礙訓練場矮牆 (可蹲伏掩護)
    for (const ow of OBSTACLE_WALLS) {
      pushBox(woodPlankGeos, ow.maxX - ow.minX, 1.1, ow.maxZ - ow.minZ, (ow.minX + ow.maxX) / 2, 0.55, (ow.minZ + ow.maxZ) / 2);
      this.addCollider(ow.minX, ow.maxX, ow.minZ, ow.maxZ, 0, 1.1);
    }
    // 器材庫 (門禁卡 B 存放於庫內；西側捲門敞開)：沿東牆貨架與器材木箱
    buildHall(EQUIPMENT_STORE);
    {
      const e = EQUIPMENT_STORE;
      for (const sz of [-4, 2, 8, 14]) {
        pushBox(darkSteelGeos, 1.2, 2.6, 4.0, e.maxX - 1.2, 1.3, sz);
        this.addCollider(e.maxX - 1.8, e.maxX - 0.6, sz - 2.0, sz + 2.0, 0, 2.6);
      }
      for (const [bx, bz] of [[72, -4], [74, 14], [66, 14]] as [number, number][]) {
        pushBox(woodPlankGeos, 2.0, 1.4, 2.0, bx, 0.7, bz);
        this.addCollider(bx - 1.0, bx + 1.0, bz - 1.0, bz + 1.0, 0, 1.4);
      }
      // 門禁卡 B 所在工作檯
      pushBox(woodPlankGeos, 2.4, 0.8, 1.0, 66, 0.4, 7.2);
      this.addCollider(64.8, 67.2, 6.7, 7.7, 0, 0.85);
      // 捲門 (捲起於門洞上方)
      pushBox(rustedMetalGeos, 0.3, 0.9, e.doorTo - e.doorFrom, e.minX + 0.2, e.h - 1.3, (e.doorFrom + e.doorTo) / 2);
    }
    // B 區角樓 (矮型哨塔)
    for (const cp of DETENTION_CORNER_POSTS) {
      const px = (cp.minX + cp.maxX) / 2, pz = (cp.minZ + cp.maxZ) / 2;
      pushBox(concreteGeos, cp.maxX - cp.minX, cp.h, cp.maxZ - cp.minZ, px, cp.h / 2, pz);
      pushBox(corrugatedIronGeos, cp.maxX - cp.minX + 0.8, 0.25, cp.maxZ - cp.minZ + 0.8, px, cp.h + 0.12, pz);
      this.addCollider(cp.minX, cp.maxX, cp.minZ, cp.maxZ, 0, cp.h + 0.3);
    }

    // 動態管制閘門 2 (需黃色門禁卡 B 開啟)
    this.gateBMeshGroup = new THREE.Group();
    const gateBDoor = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 4.5, 0.4),
      GATE_PANEL_MAT
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
      const pilGeo = new THREE.BoxGeometry(GENERATOR_PILLAR_SIZE, 5.5, GENERATOR_PILLAR_SIZE);
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

    // 決戰庭院混凝土地坪與黃色邊線 (行政大樓與軍械庫由院區建築統一建模)
    {
      const a = BOSS_ARENA;
      const ax = (a.minX + a.maxX) / 2, az = (a.minZ + a.maxZ) / 2;
      pushBox(concreteGeos, a.maxX - a.minX, 0.04, a.maxZ - a.minZ, ax, 0.035, az);
      pushBox(yellowHazardGeos, a.maxX - a.minX, 0.05, 0.4, ax, 0.06, a.minZ);
      pushBox(yellowHazardGeos, a.maxX - a.minX, 0.05, 0.4, ax, 0.06, a.maxZ);
      pushBox(yellowHazardGeos, 0.4, 0.05, a.maxZ - a.minZ, a.minX, 0.06, az);
      pushBox(yellowHazardGeos, 0.4, 0.05, a.maxZ - a.minZ, a.maxX, 0.06, az);
    }
    // 南大門檢查亭
    {
      const k = GATE_KIOSK;
      const cx = (k.minX + k.maxX) / 2, cz = (k.minZ + k.maxZ) / 2;
      pushBox(concreteGeos, k.maxX - k.minX, k.h, k.maxZ - k.minZ, cx, k.h / 2, cz);
      pushBox(glassGeos, k.maxX - k.minX - 0.6, 1.0, 0.08, cx, 1.9, k.minZ - 0.04);
      pushBox(yellowHazardGeos, k.maxX - k.minX + 0.8, 0.2, k.maxZ - k.minZ + 0.8, cx, k.h + 0.1, cz);
      this.addCollider(k.minX, k.maxX, k.minZ, k.maxZ, 0, k.h + 0.2);
    }

    // ==========================================
    // 8.6 刺客教條經典藏匿點矩陣 (Assassin's Creed Interactive Hiding Spots - 18 處)
    // 包含經典雙輪乾草手推車 (HAY_CART) 與壓實草捆堆垛 (HAY_BALE)
    // 玩家進入半徑內即自動匿蹤隱形，警衛視線與探照燈完全無法發現，並可發動刺客草堆暗殺
    // ==========================================
    this.hidingSpots = [
      // A 區 (監區：收容車道、庭院、東西服務巷與閘前廣場)
      { id: 'spot-1', name: '開局逃生乾草車', position: new THREE.Vector3(-52, 0, -84), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-2', name: '西外圍巡邏路草堆', position: new THREE.Vector3(-88.5, 0, -60), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-3', name: '警衛室西側草堆', position: new THREE.Vector3(-14, 0, -58), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-4', name: '洗衣房外草車', position: new THREE.Vector3(16, 0, -58), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-5', name: '東服務巷草堆', position: new THREE.Vector3(51.5, 0, -64), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-6', name: '食堂前廣場草車', position: new THREE.Vector3(55, 0, -34), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-7', name: '閘門 1 側翼草車', position: new THREE.Vector3(-12, 0, -33), radius: 1.8, type: 'HAY_CART' },

      // B 區 (訓練場：工坊、障礙場、貨櫃堆置場、器材庫)
      { id: 'spot-8', name: '職訓工坊南側草堆', position: new THREE.Vector3(-64, 0, 5), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-9', name: '障礙訓練場草堆', position: new THREE.Vector3(-36, 0, 18), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-10', name: '貨櫃北巷草車', position: new THREE.Vector3(-10, 0, -9), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-11', name: '貨櫃東巷草堆', position: new THREE.Vector3(10, 0, 6), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-12', name: '器材庫外草車', position: new THREE.Vector3(53, 0, -10), radius: 1.8, type: 'HAY_CART' },
      { id: 'spot-13', name: '東外圍巡邏路草堆', position: new THREE.Vector3(88.5, 0, 10), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-14', name: '閘門 2 側翼草車', position: new THREE.Vector3(-12, 0, 30), radius: 1.8, type: 'HAY_CART' },

      // C 區 (決戰區：行政大樓、軍械庫、決戰庭院、南大門)
      { id: 'spot-15', name: '行政大樓前草堆', position: new THREE.Vector3(-40, 0, 50), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-16', name: '軍械庫前草堆', position: new THREE.Vector3(40, 0, 50), radius: 1.6, type: 'HAY_BALE' },
      { id: 'spot-17', name: '決戰庭院刺客突襲草車', position: new THREE.Vector3(0, 0, 56), radius: 2.0, type: 'HAY_CART' },
      { id: 'spot-18', name: '南側道路草車', position: new THREE.Vector3(-22, 0, 89.5), radius: 1.8, type: 'HAY_CART' },
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
      // A 區
      // 1. 收容車道卸貨區堆疊補給木箱 (遮斷開局點東向視線；押送過場動線依此避讓)
      { minX: -46.6, maxX: -45.4, minZ: -86.8, maxZ: -81.2, h: 2.4, type: 'WOOD_CRATES' },
      // 2. 開局點西側高壓變電箱 + 雙層沙包
      { minX: -64.4, maxX: -59.6, minZ: -82.6, maxZ: -81.4, h: 2.6, type: 'TRANSFORMER_SANDBAG' },
      // 3. 收容車道中段彈藥箱堆
      { minX: -21.5, maxX: -18.5, minZ: -82.1, maxZ: -80.9, h: 1.4, type: 'WOOD_CRATES' },
      // 4. 庭院西側防暴矮牆 (西潛行掩護)
      { minX: -28, maxX: -22, minZ: -62.5, maxZ: -61.5, h: 1.3, type: 'JERSEY_BARRIER' },
      // 5. 警衛室西側沙包工事
      { minX: -9.2, maxX: -8.2, minZ: -63, maxZ: -59, h: 1.3, type: 'SANDBAG' },
      // 6. 洗衣房南側待洗托盤堆 (東潛行掩護)
      { minX: 10, maxX: 17, minZ: -51.5, maxZ: -50.5, h: 1.5, type: 'PALLETS' },
      // 7. 庭院南側防暴矮牆
      { minX: -20, maxX: -12, minZ: -41.5, maxZ: -40.5, h: 1.3, type: 'JERSEY_BARRIER' },
      // 8. 西服務巷洗衣推車木箱
      { minX: -50, maxX: -48, minZ: -70, maxZ: -66, h: 1.4, type: 'WOOD_CRATES' },
      // 9. 東服務巷金屬垃圾子車
      { minX: 43.6, maxX: 45.6, minZ: -62, maxZ: -58, h: 1.8, type: 'STEEL_DUMPSTER' },
      // 10. 西外圍巡邏路垃圾子車
      { minX: -94, maxX: -92, minZ: -70, maxZ: -66, h: 1.8, type: 'STEEL_DUMPSTER' },
      // B 區
      // 11. 器材庫前防暴矮牆 (東路線掩護)
      { minX: 44, maxX: 50, minZ: -2.5, maxZ: -1.5, h: 1.3, type: 'JERSEY_BARRIER' },
      { minX: 44, maxX: 50, minZ: 13.5, maxZ: 14.5, h: 1.3, type: 'JERSEY_BARRIER' },
      // 12. 職訓工坊東側器材木箱
      { minX: -57.8, maxX: -56.2, minZ: 2.5, maxZ: 5.5, h: 1.8, type: 'WOOD_CRATES' },
      // 13. 貨櫃區中央沙包工事
      { minX: -1.8, maxX: 1.8, minZ: -9, maxZ: -8, h: 1.4, type: 'SANDBAG' },
      // 14. 西側輪胎堆 (障礙場入口)
      { minX: -45.1, maxX: -42.9, minZ: 21.9, maxZ: 24.1, h: 2.0, type: 'TIRE_STACK' },
      // 15. 閘門 2 澤西防暴水泥墩
      { minX: -3.8, maxX: -0.2, minZ: 26.5, maxZ: 27.5, h: 1.5, type: 'JERSEY_BARRIER' },
      // C 區
      // 16. 決戰庭院西/東入口沙包工事
      { minX: -16.5, maxX: -15.5, minZ: 40.0, maxZ: 44.0, h: 1.3, type: 'SANDBAG' },
      { minX: 15.5, maxX: 16.5, minZ: 40.0, maxZ: 44.0, h: 1.3, type: 'SANDBAG' },
      // 17. 行政大樓/軍械庫側翼沙包 (側翼潛行掩護)
      { minX: -36, maxX: -34, minZ: 56, maxZ: 60, h: 1.3, type: 'SANDBAG' },
      { minX: 34, maxX: 36, minZ: 56, maxZ: 60, h: 1.3, type: 'SANDBAG' },
      // 18. 南大門終端沙包工事
      { minX: 9.4, maxX: 10.6, minZ: 86.2, maxZ: 89.8, h: 1.4, type: 'SANDBAG' },
    ];

    for (let i = 0; i < tacticalCovers.length; i++) {
      const tc = tacticalCovers[i];
      const cx = (tc.minX + tc.maxX) / 2;
      const cz = (tc.minZ + tc.maxZ) / 2;
      const w = tc.maxX - tc.minX;
      const d = tc.maxZ - tc.minZ;
      this.addCollider(tc.minX, tc.maxX, tc.minZ, tc.maxZ, 0, tc.h);

      if (tc.type === 'TRANSFORMER_SANDBAG') {
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
    // 1. 藍色門禁卡 A (A 區中央警衛室辦公桌)
    this.keycardAMeshGroup = this.createKeycardMesh(0x38bdf8);
    this.keycardAMeshGroup.position.copy(this.keycardAPos);
    this.group.add(this.keycardAMeshGroup);

    // 2. 黃色門禁卡 B (B 區器材庫工作檯)
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
      color: 0x6b6b66 // 院區道路骨架：深灰柏油路面 (與泥地操場明顯區隔，動線一目了然)
    });
    const concreteMat = new THREE.MeshLambertMaterial({
      color: 0xdfe6ec // 現代工業建築淺灰白色石灰石混泥土 (營舍、總部、工廠大樓全面明亮化)
    });
    const darkSteelMat = sharedLambert(0x5c728a); // 清晰鍍鋅金屬藍灰鋼架 (瞭望塔柱、樓梯、單槓立柱，具備金屬高光)
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
    const yellowHazardMat = sharedLambert(0xf1c40f); // 亮麗警示高光金黃色 (招牌、防撞邊緣)
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
    createMergedMesh(fenceWireGeos, fenceWireMat, false); // 半透明鐵網：陰影 pass 會當成不透明而投出實心牆影
    createMergedMesh(corrugatedIronGeos, corrugatedMat);
    createMergedMesh(yellowHazardGeos, yellowHazardMat);
    createMergedMesh(woodPlankGeos, woodPlankMat);
    createMergedMesh(glassGeos, glassMat, false); // 半透明玻璃同上，不投射陰影
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

      // 計算與玩家平面距離
      const pDx = playerPos.x - sl.currentGroundPos.x;
      const pDz = playerPos.z - sl.currentGroundPos.z;
      const distToPlayer = Math.hypot(pDx, pDz);

      if (distToPlayer < minDistance) {
        minDistance = distToPlayer;
      }

      // 判定是否真正被光束捕捉：在光圈半徑 4.2m 內、身處室外地面 (Y < 3.0)、且無掩體遮擋、且未身處刺客草堆掩體中
      // 光線遮蔽射線測試成本高 (掃描全部碰撞箱)：僅在玩家已進入光圈範圍時才檢查 (短路求值)
      const isPlayerCaught = distToPlayer < 4.2 && isPlayerOutdoors && !isPlayerHiding && !this.isRayBlockedByColliders(sl.towerPos, playerPos);

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
      // 略過包住光源起點的碰撞盒 (燈塔本體)：起點在盒內時 tEnter≈0，會把整片燈塔周圍誤判為被遮蔽
      if (
        start.x >= box.min.x - 0.01 && start.x <= box.max.x + 0.01 &&
        start.y >= box.min.y - 0.01 && start.y <= box.max.y + 0.01 &&
        start.z >= box.min.z - 0.01 && start.z <= box.max.z + 0.01
      ) continue;

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
      emissiveIntensity: 0.9 // 不再附掛點光源 (撿卡/掉卡時切換光源數量會觸發全場材質 shader 重編譯卡頓)，改以較強自發光呈現
    });
    const card = new THREE.Mesh(cardGeo, cardMat);
    grp.add(card);

    const chipGeo = new THREE.BoxGeometry(0.22, 0.08, 0.22);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.y = 0.01;
    grp.add(chip);

    return grp;
  }

  // 建立門禁終端控制台模型
  public createTerminalMesh(ledColorHex: number): THREE.Group {
    const grp = new THREE.Group();
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.2, 0.3),
      sharedLambert(0x334155)
    );
    stand.position.y = 0.6;
    grp.add(stand);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.35, 0.35),
      sharedLambert(0x1e293b)
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
  // 落點若位於柱子、牆壁等阻擋物內，就近環狀搜尋可站立的空地，確保玩家必定拿得到
  public spawnMasterKeycard(pos: THREE.Vector3) {
    this.masterKeycardPos = this.findReachableGroundPos(pos.x, pos.z);
    this.masterKeycardPos.y = 0.8;
    this.masterKeycardMeshGroup.position.copy(this.masterKeycardPos);
    this.masterKeycardMeshGroup.visible = true;
  }

  // 清除萬能鑰匙卡 (重新挑戰時使用)
  public clearMasterKeycard() {
    this.masterKeycardPos = null;
    this.hasPickedMasterKeycard = false;
    this.masterKeycardMeshGroup.visible = false;
  }

  private findReachableGroundPos(x: number, z: number): THREE.Vector3 {
    const r = 0.5;
    if (!isBlockedXZ(this.colliders, x, z, r, 0, 0.3, 1.8)) return new THREE.Vector3(x, 0, z);
    for (let ring = 0.5; ring <= 8; ring += 0.5) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const cx = x + Math.cos(a) * ring;
        const cz = z + Math.sin(a) * ring;
        if (!isBlockedXZ(this.colliders, cx, cz, r, 0, 0.3, 1.8)) return new THREE.Vector3(cx, 0, cz);
      }
    }
    return new THREE.Vector3(x, 0, z);
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
