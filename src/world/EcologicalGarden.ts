import * as THREE from 'three';
import { CollidableBox } from './CampusWorld';
import { Player } from '../entities/Player';
import { soundManager } from '../audio/SoundEffects';

const _ecoScratchDir = new THREE.Vector3();
const _ecoScratchWDir = new THREE.Vector3();
const _ecoPushDir = new THREE.Vector3();

export interface HostileVine {
  id: number;
  position: THREE.Vector3;
  mesh: THREE.Group;
  stemMesh: THREE.Mesh;
  flowerHead: THREE.Mesh;
  hp: number;
  maxHp: number;
  isDead: boolean;
  attackCooldown: number;
  animTimer: number;
}

export interface PoisonSpore {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

export type MushroomEffectType =
  | 'HEAL'         // 治癒體力 (+45 HP)
  | 'STAMINA'      // 精力爆發 (體力+20, Stamina全滿)
  | 'POISON'       // 劇毒侵蝕 (-12 HP, 5秒持續毒)
  | 'PARALYSIS'    // 麻痺孢子 (-8 HP, 短暫減速3秒)
  | 'LUCKY_GOLD'   // 幸運金幣 (+80 零用錢)
  | 'SUPER_JUMP';  // 輕功彩虹菇 (跳躍力暫時倍增10秒)

export interface MushroomPickResult {
  picked: boolean;
  effect?: MushroomEffectType;
  title?: string;
  desc?: string;
  mushroom?: InteractiveMushroom;
}

export interface InteractiveMushroom {
  id: number;
  position: THREE.Vector3;
  visualColor: number;
  name: string;
  mesh: THREE.Group;
  light: THREE.PointLight;
  isPicked: boolean;
  respawnTimer: number;
}

export interface GardenBug {
  id: number;
  position: THREE.Vector3;
  mesh: THREE.Group;
  legs: THREE.Mesh[];
  velocity: THREE.Vector3;
  wanderTarget: THREE.Vector3;
  wanderTimer: number;
  speed: number;           // 4.8 m/s (比玩家 5.0 快！)
  attackDamage: number;    // 1 HP (攻擊力低)
  attackCooldown: number;  // 1.0s (攻擊速度快！)
  hp: number;
  maxHp: number;
  isDead: boolean;
  animTimer: number;
  respawnTimer: number;
}

export interface GoddessTossResult {
  success: boolean;
  message: string;
  blessingType: 'GOLD' | 'FULL_HEAL' | 'SPEED_BOOST' | 'PRANK';
  rewardCash: number;
  healHp: number;
  speedBoostDuration: number;
}

export class EcologicalGarden {
  public scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();
  public colliders: CollidableBox[] = [];

  // 敵意生物：食人刺藤
  public hostileVines: HostileVine[] = [];

  // 可摘採野菇 (外觀隨機豐富、效果吃下時隨機決定)
  public mushrooms: InteractiveMushroom[] = [];

  // 生態園快速移動毒甲蟲 (跑得比玩家快、攻速快、攻擊力低、永不出園)
  public bugs: GardenBug[] = [];

  // 生態蓮花許願池與湖中女神
  public pondPos: THREE.Vector3 = new THREE.Vector3(-55, 0, -86);
  public lakeGoddessMesh!: THREE.Group;
  public isGoddessActive: boolean = false;
  public goddessTimer: number = 0;
  public tossCount: number = 0;

  // 秘境霸主：變異食人花王 (Mutant Piranha Boss)
  public boss = {
    // 校園北牆位於 Z=-105 (厚 0.8)，Boss 必須在牆內側 (Z > -104.6) 的開闊空地
    position: new THREE.Vector3(-70, 0, -95),
    mesh: new THREE.Group(),
    headGroup: new THREE.Group(),
    upperJaw: new THREE.Mesh(),
    lowerJaw: new THREE.Mesh(),
    tendrilLeft: new THREE.Group(),
    tendrilRight: new THREE.Group(),
    stemMesh: new THREE.Mesh(),
    hp: 1200,
    maxHp: 1200,
    isDead: false,
    attackCooldown: 1.0,
    spitCooldown: 3.0,
    animTimer: 0,
    hitFlashTimer: 0
  };

  // 毒液孢子飛行物
  public spores: PoisonSpore[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildGardenTerrain();
    this.buildEcologicalPond();
    this.spawnInteractiveMushrooms();
    this.spawnGardenBugs();
    this.spawnHostilePlants();
    this.buildBossModel();
    this.scene.add(this.group);
  }

  // 1. 建造生態園地形、圍欄、拱門與發光奇花異草
  private buildGardenTerrain() {
    const cx = -70;
    const cz = -90.5;
    const sizeX = 50;
    const sizeZ = 27;

    // A. 專屬深色森林泥土與青苔地表 (嚴格限定在校園北圍牆 Z = -104.0 ~ -77.0 範圍內，絕不超出圍牆)
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x223127 });
    const soilGeo = new THREE.PlaneGeometry(sizeX, sizeZ);
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(cx, 0.03, cz);
    soil.receiveShadow = true;
    this.group.add(soil);

    // B. 入口大拱門 (X: -70, Z: -77)
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const postGeo = new THREE.CylinderGeometry(0.2, 0.25, 4.2, 8);
    const postL = new THREE.Mesh(postGeo, woodMat);
    postL.position.set(cx - 3.5, 2.1, -77);
    postL.castShadow = true;
    this.group.add(postL);
    this.colliders.push({
      min: new THREE.Vector3(cx - 3.8, 0, -77.3),
      max: new THREE.Vector3(cx - 3.2, 4.2, -76.7)
    });

    const postR = new THREE.Mesh(postGeo, woodMat);
    postR.position.set(cx + 3.5, 2.1, -77);
    postR.castShadow = true;
    this.group.add(postR);
    this.colliders.push({
      min: new THREE.Vector3(cx + 3.2, 0, -77.3),
      max: new THREE.Vector3(cx + 3.8, 4.2, -76.7)
    });

    // 橫樑與招牌
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.45, 0.4), woodMat);
    beam.position.set(cx, 4.2, -77);
    this.group.add(beam);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d')!;
    ctx.fillStyle = '#1b4332';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌿 自然生態探索園區 🌿', 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.2), signMat);
    signMesh.position.set(cx, 4.2, -76.75);
    this.group.add(signMesh);

    // C. 圓木生態園圍欄 (四周圍起，留出入口)
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x795548 });
    const addFenceSegment = (minX: number, maxX: number, z: number) => {
      const w = maxX - minX;
      const fMesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, 0.25), fenceMat);
      fMesh.position.set((minX + maxX) / 2, 0.65, z);
      fMesh.castShadow = true;
      this.group.add(fMesh);
      this.colliders.push({
        min: new THREE.Vector3(minX, 0, z - 0.2),
        max: new THREE.Vector3(maxX, 1.5, z + 0.2)
      });
    };

    // 南圍欄 (留出中間 7 米通道)
    addFenceSegment(cx - sizeX / 2, cx - 3.5, -77);
    addFenceSegment(cx + 3.5, cx + sizeX / 2, -77);
    // 北圍欄 (緊鄰學校北側圍牆 Z = -105 內側，位於 Z = -104.0，絕不超出圍牆)
    addFenceSegment(cx - sizeX / 2, cx + sizeX / 2, -104.0);

    // 西側與東側圍欄
    const addSideFence = (x: number, minZ: number, maxZ: number) => {
      const l = maxZ - minZ;
      const sMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.3, l), fenceMat);
      sMesh.position.set(x, 0.65, (minZ + maxZ) / 2);
      sMesh.castShadow = true;
      this.group.add(sMesh);
      this.colliders.push({
        min: new THREE.Vector3(x - 0.2, 0, minZ),
        max: new THREE.Vector3(x + 0.2, 1.5, maxZ)
      });
    };
    addSideFence(cx - sizeX / 2, -104.0, -77);
    addSideFence(cx + sizeX / 2, -104.0, -77);

    // D. 園區內部蜿蜒石板小徑 (全數分佈在圍牆內側)
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x95a5a6 });
    const pathPoints = [
      [-70, -82], [-70, -87], [-68, -92], [-70, -97], [-70, -101]
    ];
    pathPoints.forEach(([px, pz]) => {
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.08, 12), stoneMat);
      slab.position.set(px, 0.04, pz);
      slab.receiveShadow = true;
      this.group.add(slab);
    });

    // E. 奇異巨型發光神秘野菇 (Interactive Mushrooms)
    // 移至 spawnInteractiveMushrooms() 統一生成與管理

    // F. 茂密巨木 (全數位於圍牆內側，樹冠完全不越界)
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x2e4053 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x196f3d });
    [[-88, -80], [-52, -80], [-88, -98], [-52, -98], [-70, -100]].forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 5.0, 8), treeMat);
      trunk.position.set(tx, 2.5, tz);
      trunk.castShadow = true;
      this.group.add(trunk);
      this.colliders.push({
        min: new THREE.Vector3(tx - 0.7, 0, tz - 0.7),
        max: new THREE.Vector3(tx + 0.7, 5.0, tz + 0.7)
      });

      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 1), leafMat);
      canopy.position.set(tx, 5.8, tz);
      canopy.castShadow = true;
      this.group.add(canopy);
    });
  }

  // 1.5 建造生態蓮花許願池 (Ecological Pond & Goddess Wishing Well)
  private buildEcologicalPond() {
    const px = this.pondPos.x;
    const pz = this.pondPos.z;

    // A. 池塘外圍沉入地面的土石基座 (高程 Y = 0.08，頂部 Y = 0.16，深入泥土)
    const foundationMat = new THREE.MeshLambertMaterial({ color: 0x576574 });
    const foundation = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.4, 0.16, 28), foundationMat);
    foundation.position.set(px, 0.08, pz);
    foundation.receiveShadow = true;
    this.group.add(foundation);

    // B. 環繞池畔的自然造景石圈 (Natural Cobblestone Embankment: 28 顆高低錯落的天然岩石，頂部達 Y = 0.45~0.58m，明顯高於水面)
    const stoneRockMat = new THREE.MeshStandardMaterial({ color: 0x8395a7, roughness: 0.8, metalness: 0.1 });
    const stoneCount = 28;
    for (let i = 0; i < stoneCount; i++) {
      const angle = (i / stoneCount) * Math.PI * 2;
      const r = 4.55 + Math.sin(i * 3.7) * 0.18; // 自然凹凸曲折
      const sx = px + Math.cos(angle) * r;
      const sz = pz + Math.sin(angle) * r;
      const rockScale = 0.35 + Math.abs(Math.sin(i * 5.3)) * 0.22;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rockScale, 1),
        stoneRockMat
      );
      rock.position.set(sx, 0.22 + rockScale * 0.45, sz);
      rock.rotation.set(angle * 1.2, i * 0.7, angle * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
    }

    // C. 許願池深藍澄澈池底 (高程 Y = 0.14，頂部 Y = 0.16，與水面高程明確錯開)
    const pondBottomMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // 澄澈純藍池底色
      roughness: 0.35,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    });
    const pondBottom = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.35, 0.04, 28), pondBottomMat);
    pondBottom.position.set(px, 0.14, pz);
    pondBottom.receiveShadow = true;
    this.group.add(pondBottom);

    // D. 清澈湛藍寶石湖水面 (頂部高程精確對齊 Y = 0.32，高於池底、低於岸石，徹底解決 Z-fighting)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00a8ff, // 清澈湛藍的湖水藍色 (純藍水體)
      transparent: true,
      opacity: 0.75, // 清透透光
      roughness: 0.12, // 具備清透高光反光
      metalness: 0.18,
      depthWrite: false, // 透明材質不覆寫深度緩衝，徹底根除與池底及岸石閃爍爭搶
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2
    });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.34, 4.34, 0.10, 28), waterMat);
    water.position.set(px, 0.27, pz); // 頂表面 Y = 0.27 + 0.05 = 0.32
    water.renderOrder = 2; // 後繪製透明水體
    this.group.add(water);

    // E. 水面漂浮蓮葉 (荷葉浮於水面 Y = 0.33)
    const lilyMat = new THREE.MeshLambertMaterial({ color: 0x27ae60 });
    const flowerMat = new THREE.MeshLambertMaterial({ color: 0xf472b6 });
    const lilyCoords = [
      [-1.8, -1.2], [1.5, 1.4], [-1.2, 2.0], [2.1, -1.5], [-0.5, -2.4]
    ];
    lilyCoords.forEach(([lx, lz], i) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 12), lilyMat);
      pad.position.set(px + lx, 0.33, pz + lz);
      this.group.add(pad);

      if (i % 2 === 0) {
        // 粉紅睡蓮花朵
        const flower = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), flowerMat);
        flower.position.set(px + lx, 0.42, pz + lz);
        this.group.add(flower);
      }
    });

    // F. 木質觀景小橋棧道
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 4.5), woodMat);
    bridge.position.set(px + 4.2, 0.42, pz);
    bridge.castShadow = true;
    this.group.add(bridge);

    // 許願古樸石碑 (Wishing Stone Tablet)
    const tabletMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.3), tabletMat);
    tablet.position.set(px + 3.8, 0.9, pz - 2.5);
    tablet.castShadow = true;
    this.group.add(tablet);

    const runeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), runeMat);
    rune.position.set(px + 3.8, 1.0, pz - 2.34);
    this.group.add(rune);

    // 建造湖中女神 3D 模型 (平時潛藏於水底 Y = -3.5，投幣時昇起顯現)
    this.lakeGoddessMesh = new THREE.Group();
    this.lakeGoddessMesh.position.set(px, -3.5, pz);

    // 女神白色仙氣長裙
    const dressMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.92 });
    const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.9, 1.8, 16), dressMat);
    dress.position.y = 0.9;
    this.lakeGoddessMesh.add(dress);

    // 女神身軀
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.75, 12), bodyMat);
    body.position.y = 1.95;
    this.lakeGoddessMesh.add(body);

    // 女神面容
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), bodyMat);
    head.position.y = 2.55;
    this.lakeGoddessMesh.add(head);

    // 金色長髮
    const hairMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), hairMat);
    hair.position.set(0, 2.62, -0.06);
    this.lakeGoddessMesh.add(hair);

    // 神聖水靈神環 (Golden Halo)
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 24), haloMat);
    halo.position.set(0, 2.95, 0);
    halo.rotation.x = Math.PI / 2;
    this.lakeGoddessMesh.add(halo);

    // 湖水靈光
    const goddessGlow = new THREE.PointLight(0x38bdf8, 1.5, 8.0);
    goddessGlow.position.y = 2.0;
    this.lakeGoddessMesh.add(goddessGlow);

    this.group.add(this.lakeGoddessMesh);
  }

  // 向生態池投幣許願 (小遊戲)
  public tossCoinToPond(playerCash: number): GoddessTossResult {
    if (playerCash < 30) {
      return {
        success: false,
        message: '🪙 你的零用錢不足 $30，無法向湖中女神許願！',
        blessingType: 'PRANK',
        rewardCash: 0,
        healHp: 0,
        speedBoostDuration: 0
      };
    }

    this.tossCount++;
    this.isGoddessActive = true;
    this.goddessTimer = 7.0; // 女神顯現 7 秒鐘

    // 連續投幣超過 3 次触發淘氣水花彩蛋
    if (this.tossCount >= 4) {
      this.tossCount = 0;
      return {
        success: true,
        message: '🌊 湖中女神淘氣笑噴水花：「別太貪心喔～心誠則靈！」全身濕透減速 3 秒！',
        blessingType: 'PRANK',
        rewardCash: 0,
        healHp: 0,
        speedBoostDuration: -3
      };
    }

    // 隨機抽選 3 種神奇祝福
    const rolls: Array<'GOLD' | 'FULL_HEAL' | 'SPEED_BOOST'> = ['GOLD', 'FULL_HEAL', 'SPEED_BOOST'];
    const blessing = rolls[Math.floor(Math.random() * rolls.length)];

    if (blessing === 'GOLD') {
      return {
        success: true,
        message: '👑 湖中女神顯靈微笑：「誠實的同學啊！你掉的是這枚金幣嗎？」退還金幣並加贈 $80 獎金！',
        blessingType: 'GOLD',
        rewardCash: 110, // 30 本金 + 80 獎勵
        healHp: 20,
        speedBoostDuration: 0
      };
    } else if (blessing === 'FULL_HEAL') {
      return {
        success: true,
        message: '✨ 湖中女神降下清泉甘霖：「願純潔之水治癒你的身心！」生命值與體力全滿回復！',
        blessingType: 'FULL_HEAL',
        rewardCash: 0,
        healHp: 100,
        speedBoostDuration: 0
      };
    } else {
      return {
        success: true,
        message: '⚡ 湖中女神賜予靈水微風：「走吧！感受如風般疾馳的自由！」獲得 20 秒極速加護！',
        blessingType: 'SPEED_BOOST',
        rewardCash: 0,
        healHp: 30,
        speedBoostDuration: 20
      };
    }
  }

  // 1.8 生成生態園快速移動毒甲蟲 (跑得比玩家快、攻速快、攻擊力低、永不出園且絕不超出圍牆)
  private spawnGardenBugs() {
    const bugSpawns = [
      new THREE.Vector3(-80, 0, -82),
      new THREE.Vector3(-62, 0, -80),
      new THREE.Vector3(-84, 0, -95),
      new THREE.Vector3(-56, 0, -98),
      new THREE.Vector3(-74, 0, -101)
    ];

    const shellMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 }); // 暗赤色毒甲
    const legMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 }); // 發光綠眼

    bugSpawns.forEach((pos, idx) => {
      const bugGroup = new THREE.Group();
      bugGroup.position.copy(pos);

      // 橢圓甲蟲身軀
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), shellMat);
      body.position.y = 0.28;
      body.scale.set(1.0, 0.65, 1.4);
      body.castShadow = true;
      bugGroup.add(body);

      // 發光綠眼
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
      eyeL.position.set(0.14, 0.32, 0.42);
      bugGroup.add(eyeL);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
      eyeR.position.set(-0.14, 0.32, 0.42);
      bugGroup.add(eyeR);

      // 6 條爬行節肢
      const legs: THREE.Mesh[] = [];
      for (let s = -1; s <= 1; s += 2) {
        for (let l = -0.18; l <= 0.18; l += 0.18) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), legMat);
          leg.position.set(s * 0.34, 0.14, l);
          leg.rotation.z = s * (Math.PI / 3);
          bugGroup.add(leg);
          legs.push(leg);
        }
      }

      this.group.add(bugGroup);

      this.bugs.push({
        id: idx,
        position: pos.clone(),
        mesh: bugGroup,
        legs,
        velocity: new THREE.Vector3(),
        wanderTarget: pos.clone(),
        wanderTimer: Math.random() * 3.0,
        speed: 4.8,          // 4.8 m/s (比玩家 5.0 快！)
        attackDamage: 1,     // 1 HP (攻擊力低)
        attackCooldown: 1.0,// 1.0s (攻擊速度快！)
        hp: 25,
        maxHp: 25,
        isDead: false,
        animTimer: idx * 2.0,
        respawnTimer: 0
      });
    });
  }

  // 建造園區內神秘野菇 (外觀隨機豐富絢爛、吃下效果完全隨機決定，全數分佈在圍牆內側)
  private spawnInteractiveMushrooms() {
    const mushConfigs = [
      { pos: new THREE.Vector3(-82, 0, -85), color: 0xe74c3c, glow: 0xff7675, name: '赤紅斑點菇' },
      { pos: new THREE.Vector3(-60, 0, -84), color: 0x8e44ad, glow: 0xa29bfe, name: '幽冥紫晶蕈' },
      { pos: new THREE.Vector3(-84, 0, -98), color: 0xf1c40f, glow: 0xffeaa7, name: '璀璨黃金菇' },
      { pos: new THREE.Vector3(-58, 0, -101), color: 0x00cec9, glow: 0x81ecec, name: '冰晶蔚藍蕈' },
      { pos: new THREE.Vector3(-80, 0, -92), color: 0x2ecc71, glow: 0x55efc4, name: '碧玉青露菇' },
      { pos: new THREE.Vector3(-62, 0, -99), color: 0xffffff, glow: 0xdfe6e9, name: '純白幻影蕈' },
      { pos: new THREE.Vector3(-75, 0, -93), color: 0xff7675, glow: 0xd63031, name: '烈焰朱砂菇' },
      { pos: new THREE.Vector3(-65, 0, -95), color: 0x6c5ce7, glow: 0xa29bfe, name: '雷霆電紋蕈' }
    ];

    mushConfigs.forEach((cfg, idx) => {
      const group = new THREE.Group();
      group.position.copy(cfg.pos);

      // 菇柄
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.22, 0.75, 8),
        new THREE.MeshLambertMaterial({ color: 0xf5f6fa })
      );
      stem.position.y = 0.38;
      group.add(stem);

      // 菇傘
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 0.55, 10),
        new THREE.MeshLambertMaterial({ color: cfg.color })
      );
      cap.position.y = 0.9;
      group.add(cap);

      // 菇斑圓點
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = 0; i < 5; i++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), dotMat);
        const ang = (i / 5) * Math.PI * 2;
        dot.position.set(Math.cos(ang) * 0.32, 0.8, Math.sin(ang) * 0.32);
        group.add(dot);
      }

      // 地面光暈
      const glow = new THREE.PointLight(cfg.glow, 0.75, 4.2);
      glow.position.y = 0.95;
      group.add(glow);

      this.group.add(group);

      this.mushrooms.push({
        id: idx,
        position: cfg.pos.clone(),
        visualColor: cfg.color,
        name: cfg.name,
        mesh: group,
        light: glow,
        isPicked: false,
        respawnTimer: 0
      });
    });
  }

  // 嘗試採集野菇 (效果完全隨機決定，與外觀無關！)
  public tryPickMushroom(playerPos: THREE.Vector3): MushroomPickResult {
    for (const m of this.mushrooms) {
      if (m.isPicked) continue;
      const dist = playerPos.distanceTo(m.position);
      if (dist < 2.2) {
        m.isPicked = true;
        m.respawnTimer = 15.0; // 15秒後重新長出
        m.mesh.visible = false;
        m.light.intensity = 0;

        // 隨機決定 6 種不同效果之一 (效果完全隨機，與外觀顏色無關)
        const roll = Math.random();
        let effect: MushroomEffectType = 'HEAL';
        let title = '💚【生命甘霖】';
        let desc = '大補血！體力恢復 +45 HP！';

        if (roll < 0.35) {
          effect = 'HEAL';
          title = '💚【生命甘霖】';
          desc = '大補血！體力恢復 +45 HP！';
        } else if (roll < 0.52) {
          effect = 'STAMINA';
          title = '⚡【精力爆發】';
          desc = '體力 +20，精力充沛完全回滿！';
        } else if (roll < 0.74) {
          effect = 'POISON';
          title = '☠️【劇毒侵蝕】';
          desc = '誤食毒菇！受到 12 傷害並中毒持續扣血 5 秒！';
        } else if (roll < 0.86) {
          effect = 'PARALYSIS';
          title = '🌀【麻痺孢子】';
          desc = '四肢發麻！受到 8 傷害且短暫減速 3 秒！';
        } else if (roll < 0.94) {
          effect = 'LUCKY_GOLD';
          title = '💰【意外之財】';
          desc = '蘑菇根部藏有私房錢！獲得獎金 +$80！';
        } else {
          effect = 'SUPER_JUMP';
          title = '🌈【輕功彩虹菇】';
          desc = '飄飄欲仙！10 秒內跳躍力倍增！';
        }

        return {
          picked: true,
          effect,
          title,
          desc,
          mushroom: m
        };
      }
    }
    return { picked: false };
  }

  // 2. 生成具有攻擊性的食人藤蔓怪物 (Hostile Thorny Plants)
  private spawnHostilePlants() {
    const vinePositions = [
      new THREE.Vector3(-78, 0, -88),
      new THREE.Vector3(-62, 0, -89),
      new THREE.Vector3(-76, 0, -98),
      new THREE.Vector3(-64, 0, -100)
    ];

    const vineMat = new THREE.MeshLambertMaterial({ color: 0x27ae60 });
    const flowerMat = new THREE.MeshLambertMaterial({ color: 0x8e44ad });
    const thornMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });

    vinePositions.forEach((pos, idx) => {
      const vineGroup = new THREE.Group();
      vineGroup.position.copy(pos);

      // 根基底盤
      const rootBase = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 0.25, 8), vineMat);
      rootBase.position.y = 0.125;
      vineGroup.add(rootBase);

      // 扭曲藤蔓主幹
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 8), vineMat);
      stem.position.y = 0.9;
      stem.castShadow = true;
      vineGroup.add(stem);

      // 倒刺
      for (let i = 0; i < 4; i++) {
        const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), thornMat);
        thorn.position.set(Math.sin(i * 1.5) * 0.18, 0.5 + i * 0.3, Math.cos(i * 1.5) * 0.18);
        thorn.rotation.z = Math.PI / 3 * (i % 2 === 0 ? 1 : -1);
        vineGroup.add(thorn);
      }

      // 花苞口吻
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), flowerMat);
      head.position.set(0, 1.85, 0.15);
      head.scale.set(1.1, 0.9, 1.3);
      head.castShadow = true;
      vineGroup.add(head);

      this.group.add(vineGroup);

      this.hostileVines.push({
        id: idx,
        position: pos.clone(),
        mesh: vineGroup,
        stemMesh: stem,
        flowerHead: head,
        hp: 80,
        maxHp: 80,
        isDead: false,
        attackCooldown: 1.0,
        animTimer: idx * 1.5
      });
    });
  }

  // 3. 建造秘境霸主：變異食人花王 (Piranha Queen Boss)
  private buildBossModel() {
    this.boss.mesh.position.copy(this.boss.position);

    // 巨大的生機植物材質
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x6c5ce7 }); // 神秘紫色大花冠
    const greenMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 }); // 粗壯主莖
    const toothMat = new THREE.MeshLambertMaterial({ color: 0xf1f2f6 }); // 銳利白色尖牙
    const lipsMat = new THREE.MeshLambertMaterial({ color: 0xd63031 }); // 猩紅嘴唇
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });   // 斑點

    // A. 盤踞地底的粗大根部 (Root Base)
    const rootBase = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 0.6, 12), greenMat);
    rootBase.position.y = 0.3;
    rootBase.receiveShadow = true;
    this.boss.mesh.add(rootBase);
    this.colliders.push({
      min: new THREE.Vector3(this.boss.position.x - 1.6, 0, this.boss.position.z - 1.6),
      max: new THREE.Vector3(this.boss.position.x + 1.6, 1.5, this.boss.position.z + 1.6)
    });

    // B. S型蜿蜒粗壯主幹 (Thick Vine Stalk)
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 3.2, 10), greenMat);
    stalk.position.set(0, 1.8, -0.2);
    stalk.rotation.x = 0.15;
    stalk.castShadow = true;
    this.boss.mesh.add(stalk);
    this.boss.stemMesh = stalk;

    // C. 巨型頭部與嘴部樞紐 (Boss Head Group)
    this.boss.headGroup.position.set(0, 3.4, 0.3);
    this.boss.mesh.add(this.boss.headGroup);

    // 上顎 (Upper Jaw)
    const upperGeo = new THREE.SphereGeometry(1.2, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const upper = new THREE.Mesh(upperGeo, skinMat);
    upper.position.set(0, 0.1, 0);
    upper.rotation.x = -Math.PI / 2;
    upper.castShadow = true;
    this.boss.headGroup.add(upper);
    this.boss.upperJaw = upper;

    // 上顎猩紅嘴唇
    const upperLips = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 8, 20, Math.PI), lipsMat);
    upperLips.rotation.x = Math.PI / 2;
    upperLips.position.set(0, 0.08, 0.4);
    upper.add(upperLips);

    // 下顎 (Lower Jaw)
    const lowerGeo = new THREE.SphereGeometry(1.1, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const lower = new THREE.Mesh(lowerGeo, skinMat);
    lower.position.set(0, -0.2, 0);
    lower.rotation.x = Math.PI / 2;
    lower.castShadow = true;
    this.boss.headGroup.add(lower);
    this.boss.lowerJaw = lower;

    // 銳利鋸齒尖牙 (Sharp Triangular Teeth)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 7) * Math.PI - Math.PI / 2;
      const toothU = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), toothMat);
      toothU.position.set(Math.sin(angle) * 1.05, 0.05, Math.cos(angle) * 0.95);
      toothU.rotation.x = -Math.PI / 2;
      upper.add(toothU);

      const toothL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), toothMat);
      toothL.position.set(Math.sin(angle) * 0.98, -0.05, Math.cos(angle) * 0.88);
      toothL.rotation.x = Math.PI / 2;
      lower.add(toothL);
    }

    // 經典白斑點裝飾 (Polka Dots)
    for (let j = 0; j < 6; j++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), spotMat);
      const theta = j * 1.0;
      dot.position.set(Math.sin(theta) * 0.9, 0.6, Math.cos(theta) * 0.9);
      upper.add(dot);
    }

    // D. 兩側抽動的大葉手 (Left and Right Lashing Tendrils)
    const tendrilGeo = new THREE.BoxGeometry(0.25, 0.8, 1.8);
    const tL = new THREE.Group();
    tL.position.set(-1.2, 2.2, 0);
    const tLMesh = new THREE.Mesh(tendrilGeo, greenMat);
    tLMesh.position.set(0, 0, 0.9);
    tL.add(tLMesh);
    this.boss.mesh.add(tL);
    this.boss.tendrilLeft = tL;

    const tR = new THREE.Group();
    tR.position.set(1.2, 2.2, 0);
    const tRMesh = new THREE.Mesh(tendrilGeo, greenMat);
    tRMesh.position.set(0, 0, 0.9);
    tR.add(tRMesh);
    this.boss.mesh.add(tR);
    this.boss.tendrilRight = tR;

    this.group.add(this.boss.mesh);
  }

  // 4. 動態更新循環 (植物動畫、攻擊玩家、毒液彈發射)
  public update(
    delta: number,
    playerPos: THREE.Vector3,
    player: Player,
    onPlayerHit: (amount: number, reason: string) => void,
    _onBossDefeated?: () => void
  ) {
    // A. 食人藤蔓怪物邏輯
    for (const vine of this.hostileVines) {
      if (vine.isDead) continue;
      vine.animTimer += delta * 4.0;
      vine.stemMesh.rotation.z = Math.sin(vine.animTimer) * 0.18;
      vine.flowerHead.rotation.x = Math.cos(vine.animTimer) * 0.22;

      const dist = vine.position.distanceTo(playerPos);
      if (dist < 4.0 && !player.isDead) {
        // 朝玩家方向猛烈鞭打！
        vine.mesh.lookAt(playerPos.x, 0, playerPos.z);
        if (vine.attackCooldown <= 0) {
          vine.attackCooldown = 1.4;
          soundManager.playBatHit();
          onPlayerHit(10, '被食人藤蔓猛烈抽打！');
        }
      }
      if (vine.attackCooldown > 0) {
        vine.attackCooldown -= delta;
      }
    }

    // B. 變異食人花 Boss 邏輯
    if (!this.boss.isDead) {
      this.boss.animTimer += delta * 3.5;
      const bDist = this.boss.position.distanceTo(playerPos);

      // 主幹與巨顎呼吸律動
      this.boss.stemMesh.rotation.z = Math.sin(this.boss.animTimer * 0.8) * 0.12;
      this.boss.stemMesh.rotation.x = 0.15 + Math.cos(this.boss.animTimer * 0.8) * 0.08;
      this.boss.upperJaw.rotation.x = -Math.PI / 2 - Math.abs(Math.sin(this.boss.animTimer)) * 0.45;
      this.boss.lowerJaw.rotation.x = Math.PI / 2 + Math.abs(Math.sin(this.boss.animTimer)) * 0.45;

      // 雙側觸手狂亂揮舞
      this.boss.tendrilLeft.rotation.z = Math.sin(this.boss.animTimer * 1.5) * 0.45;
      this.boss.tendrilRight.rotation.z = -Math.sin(this.boss.animTimer * 1.5) * 0.45;

      // 玩家進入警戒範圍 (24 米內)：面向玩家
      if (bDist < 24.0 && !player.isDead) {
        const targetAngle = Math.atan2(playerPos.x - this.boss.position.x, playerPos.z - this.boss.position.z);
        this.boss.mesh.rotation.y = THREE.MathUtils.lerp(this.boss.mesh.rotation.y, targetAngle, delta * 3.0);

        // 1. 近距離巨口狂咬 (Melee Chomp)
        if (bDist < 4.5) {
          if (this.boss.attackCooldown <= 0) {
            this.boss.attackCooldown = 1.6;
            soundManager.playBossBite();
            // 猛烈咬噬：28 點高額傷害 + 強烈擊退 (0-GC Scratch Vector)
            _ecoPushDir.subVectors(playerPos, this.boss.position).normalize();
            player.launchFlying(_ecoPushDir, 12.0, 4.0, 28, '被食人花王巨口猛烈撕咬！');
          }
        }

        // 2. 遠距離毒液種子彈噴射 (Poison Spore Spit)
        if (bDist >= 4.5 && bDist <= 20.0) {
          if (this.boss.spitCooldown <= 0) {
            this.boss.spitCooldown = 2.6;
            this.spitPoisonSpore(playerPos);
          }
        }
      }

      if (this.boss.attackCooldown > 0) this.boss.attackCooldown -= delta;
      if (this.boss.spitCooldown > 0) this.boss.spitCooldown -= delta;

      // 受擊紅光閃爍回饋
      if (this.boss.hitFlashTimer > 0) {
        this.boss.hitFlashTimer -= delta;
        if (this.boss.hitFlashTimer <= 0) {
          (this.boss.upperJaw.material as THREE.MeshLambertMaterial).color.setHex(0x6c5ce7);
          (this.boss.lowerJaw.material as THREE.MeshLambertMaterial).color.setHex(0x6c5ce7);
        }
      }
    }

    // C. 更新飛行毒液孢子 (資源釋放保護)
    for (let i = this.spores.length - 1; i >= 0; i--) {
      const sp = this.spores[i];
      sp.position.addScaledVector(sp.velocity, delta);
      sp.mesh.position.copy(sp.position);
      sp.life -= delta;

      // 檢查命中玩家
      if (sp.position.distanceTo(playerPos) < 1.3 && !player.isDead) {
        onPlayerHit(14, '被變異食人花的劇毒孢子命中！');
        soundManager.playPunch();
        this.scene.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        (sp.mesh.material as THREE.Material).dispose();
        this.spores.splice(i, 1);
        continue;
      }

      // 壽命耗盡或著地消散
      if (sp.life <= 0 || sp.position.y <= 0.1) {
        this.scene.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        (sp.mesh.material as THREE.Material).dispose();
        this.spores.splice(i, 1);
      }
    }

    // D. 神秘野菇再生計時
    for (const m of this.mushrooms) {
      if (m.isPicked) {
        m.respawnTimer -= delta;
        if (m.respawnTimer <= 0) {
          m.isPicked = false;
          m.mesh.visible = true;
          m.light.intensity = 0.7;
        }
      }
    }

    // E. 湖中女神顯靈浮動動畫
    if (this.lakeGoddessMesh) {
      if (this.isGoddessActive) {
        this.goddessTimer -= delta;
        // 女神緩緩自水面升起並神聖浮動
        const targetY = 1.0 + Math.sin(Date.now() * 0.0035) * 0.18;
        this.lakeGoddessMesh.position.y = THREE.MathUtils.lerp(this.lakeGoddessMesh.position.y, targetY, delta * 2.5);
        this.lakeGoddessMesh.rotation.y += delta * 0.8;
        if (this.goddessTimer <= 0) {
          this.isGoddessActive = false;
        }
      } else {
        // 女神退隱沉入湖底
        if (this.lakeGoddessMesh.position.y > -1.2) {
          this.lakeGoddessMesh.position.y = THREE.MathUtils.lerp(this.lakeGoddessMesh.position.y, -1.3, delta * 3.0);
        }
      }
    }

    // F. 生態園快速移動毒甲蟲 AI (速度 4.8 m/s, 攻擊力 1, 攻速 1.0s, 嚴格限制在園內且絕不超出學校圍牆)
    const gardenMinX = -92;
    const gardenMaxX = -48;
    const gardenMinZ = -102.5;
    const gardenMaxZ = -78.5;
    const isPlayerInGarden = (
      playerPos.x >= gardenMinX - 1.0 && playerPos.x <= gardenMaxX + 1.0 &&
      playerPos.z >= gardenMinZ - 1.0 && playerPos.z <= gardenMaxZ + 1.0
    );

    for (const bug of this.bugs) {
      if (bug.isDead) {
        bug.respawnTimer -= delta;
        if (bug.respawnTimer <= 0) {
          bug.isDead = false;
          bug.hp = bug.maxHp;
          bug.mesh.visible = true;
          bug.position.set(
            gardenMinX + 3 + Math.random() * (gardenMaxX - gardenMinX - 6),
            0,
            gardenMinZ + 3 + Math.random() * (gardenMaxZ - gardenMinZ - 6)
          );
        }
        continue;
      }

      // 腿部高速爬行律動
      bug.animTimer += delta * 18.0;
      bug.legs.forEach((leg, li) => {
        leg.rotation.x = Math.sin(bug.animTimer + li * 1.2) * 0.45;
      });

      if (bug.attackCooldown > 0) bug.attackCooldown -= delta;

      if (isPlayerInGarden && !player.isDead) {
        // 追擊玩家 (速度 4.8 比玩家 5.0 稍慢，0-GC Scratch Vector)
        _ecoScratchDir.subVectors(playerPos, bug.position);
        _ecoScratchDir.y = 0;
        const dist = _ecoScratchDir.length();
        if (dist > 0.05) {
          _ecoScratchDir.normalize();
          bug.position.addScaledVector(_ecoScratchDir, bug.speed * delta);
          bug.mesh.rotation.y = Math.atan2(_ecoScratchDir.x, _ecoScratchDir.z);
        }

        // 貼身快速啃咬攻擊
        if (dist < 0.75 && bug.attackCooldown <= 0) {
          bug.attackCooldown = 1.0; // 極快攻速
          soundManager.playBugChirp();
          onPlayerHit(bug.attackDamage, '遭生態園毒甲蟲刺螯快速咬傷！');
        }
      } else {
        // 玩家不在園區內：在園內巡邏漫遊
        bug.wanderTimer -= delta;
        if (bug.wanderTimer <= 0) {
          bug.wanderTimer = 2.0 + Math.random() * 3.0;
          bug.wanderTarget.set(
            gardenMinX + 3 + Math.random() * (gardenMaxX - gardenMinX - 6),
            0,
            gardenMinZ + 3 + Math.random() * (gardenMaxZ - gardenMinZ - 6)
          );
        }
        _ecoScratchWDir.subVectors(bug.wanderTarget, bug.position);
        _ecoScratchWDir.y = 0;
        const wDist = _ecoScratchWDir.length();
        if (wDist > 0.4) {
          _ecoScratchWDir.normalize();
          bug.position.addScaledVector(_ecoScratchWDir, bug.speed * 0.45 * delta);
          bug.mesh.rotation.y = Math.atan2(_ecoScratchWDir.x, _ecoScratchWDir.z);
        }
      }

      // 嚴格座標鉗制：絕對不會跑出生態園區與學校圍牆
      bug.position.x = THREE.MathUtils.clamp(bug.position.x, gardenMinX, gardenMaxX);
      bug.position.z = THREE.MathUtils.clamp(bug.position.z, gardenMinZ, gardenMaxZ);
      bug.position.y = 0;
      bug.mesh.position.copy(bug.position);
    }
  }

  // 發射劇毒孢子
  private spitPoisonSpore(targetPos: THREE.Vector3) {
    const sporeMat = new THREE.MeshLambertMaterial({ color: 0x9b59b6 });
    const spore = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), sporeMat);
    const startPos = this.boss.position.clone().add(new THREE.Vector3(0, 3.5, 0));
    spore.position.copy(startPos);
    this.scene.add(spore);

    const dir = targetPos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(startPos).normalize();
    const vel = dir.multiplyScalar(13.5);

    this.spores.push({
      mesh: spore,
      position: startPos,
      velocity: vel,
      life: 2.5
    });

    soundManager.playBatHit();
  }

  // 5. 玩家打擊判定 (攻擊食人花 Boss 或藤蔓)
  public tryHitByPlayer(
    hitOrigin: THREE.Vector3,
    hitRadius: number,
    damage: number,
    _playerForward?: THREE.Vector3
  ): { hit: boolean; name: string; defeated: boolean; isBoss: boolean } {
    // 優先判定 Boss
    if (!this.boss.isDead) {
      const dist = hitOrigin.distanceTo(this.boss.position);
      if (dist < hitRadius + 2.4) {
        this.boss.hp = Math.max(0, this.boss.hp - damage);
        this.boss.hitFlashTimer = 0.22;
        (this.boss.upperJaw.material as THREE.MeshLambertMaterial).color.setHex(0xff3838);
        (this.boss.lowerJaw.material as THREE.MeshLambertMaterial).color.setHex(0xff3838);

        if (this.boss.hp <= 0) {
          this.boss.isDead = true;
          this.playBossDeathAnimation();
          return { hit: true, name: '變異食人花王', defeated: true, isBoss: true };
        }
        return { hit: true, name: '變異食人花王', defeated: false, isBoss: true };
      }
    }

    // 判定食人藤蔓怪物
    for (const vine of this.hostileVines) {
      if (vine.isDead) continue;
      const vDist = hitOrigin.distanceTo(vine.position);
      if (vDist < hitRadius + 0.8) {
        vine.hp -= damage;
        (vine.flowerHead.material as THREE.MeshLambertMaterial).color.setHex(0xe74c3c);
        setTimeout(() => {
          if (!vine.isDead) {
            (vine.flowerHead.material as THREE.MeshLambertMaterial).color.setHex(0x8e44ad);
          }
        }, 180);

        if (vine.hp <= 0) {
          vine.isDead = true;
          this.group.remove(vine.mesh);
          return { hit: true, name: '食人藤蔓', defeated: true, isBoss: false };
        }
        return { hit: true, name: '食人藤蔓', defeated: false, isBoss: false };
      }
    }

    // 判定生態園毒甲蟲
    for (const bug of this.bugs) {
      if (bug.isDead) continue;
      const bDist = hitOrigin.distanceTo(bug.position);
      if (bDist < hitRadius + 0.6) {
        bug.hp -= damage;
        soundManager.playPunch();
        if (bug.hp <= 0) {
          bug.isDead = true;
          bug.mesh.visible = false;
          bug.respawnTimer = 22.0;
          return { hit: true, name: '生態園毒甲蟲', defeated: true, isBoss: false };
        }
        return { hit: true, name: '生態園毒甲蟲', defeated: false, isBoss: false };
      }
    }

    return { hit: false, name: '', defeated: false, isBoss: false };
  }

  // 檢查玩家是否在生態池許願石碑附近
  public isNearWishingPond(playerPos: THREE.Vector3): boolean {
    return playerPos.distanceTo(this.pondPos) < 4.2;
  }

  // 判斷玩家是否身處生態池湖水範圍之內 (半徑 4.4m 水體)
  public isInsideWishingPond(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.pondPos.x;
    const dz = pos.z - this.pondPos.z;
    return (dx * dx + dz * dz) < 19.36 && pos.y <= 1.2 && pos.y >= -1.0;
  }

  // Boss 死亡傾倒枯萎動畫
  private playBossDeathAnimation() {
    let timer = 0;
    const interval = setInterval(() => {
      timer += 0.05;
      this.boss.mesh.rotation.z += 0.08;
      this.boss.mesh.position.y -= 0.08;
      if (timer > 1.2) {
        clearInterval(interval);
        this.group.remove(this.boss.mesh);
      }
    }, 50);
  }
}
