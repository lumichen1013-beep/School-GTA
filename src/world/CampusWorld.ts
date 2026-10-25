import * as THREE from 'three';

export interface CollidableBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  isFloorOnly?: boolean; // Walkable slabs/ramps: provides groundY support, never blocks horizontal movement!
  isRamp?: boolean;
  rampMinZ?: number;
  rampMaxZ?: number;
  rampYAtMinZ?: number;
  rampYAtMaxZ?: number;
}

export interface ShootingHotspot {
  id: string;
  name: string;
  type: '3PT' | 'FT' | 'LOGO';
  position: THREE.Vector3;
  targetHoop: THREE.Vector3;
  radius: number;
  bonusPoints: number;
  ringMesh: THREE.Mesh;
}

export class CampusWorld {
  public scene: THREE.Scene;
  public colliders: CollidableBox[] = [];
  public collisionMeshes: THREE.Object3D[] = [];
  public bicycleSpawnPoints: THREE.Vector3[] = [];

  // 方案 D：校園惡搞彩蛋與小遊戲互動點
  public broadcastStationPos: THREE.Vector3 = new THREE.Vector3(30, 0, 18);
  public basketballSpawnPos: THREE.Vector3 = new THREE.Vector3(22, 0.22, -59.5); // 置於西側頂弧三分球起點
  public commissaryPos: THREE.Vector3 = new THREE.Vector3(-17, 0, -50.0); // 天天合作社熱食補血櫃台
  public ecologicalGardenPos: THREE.Vector3 = new THREE.Vector3(-70, 0, -85.0); // 生態探索園區入口
  public swimmingPoolPos: THREE.Vector3 = new THREE.Vector3(75, 0, -48.6); // 25m 標準游泳池出發台
  public swimCheckpoints: THREE.Vector3[] = [
    new THREE.Vector3(73.25, 0.25, -42.0), // 1. 出發入水加速點 (第2泳道)
    new THREE.Vector3(73.25, 0.25, -34.0), // 2. 前半程破浪前進
    new THREE.Vector3(73.25, 0.25, -23.5), // 3. 南端觸壁折返點！(完成25m)
    new THREE.Vector3(73.25, 0.25, -32.0), // 4. 折返發力加速
    new THREE.Vector3(73.25, 0.25, -40.0), // 5. 最後直線極速衝刺！
    new THREE.Vector3(73.25, 0.25, -47.8)  // 6. 北端終點觸壁完賽！(完成50m)
  ];
  public hoopTargets: THREE.Vector3[] = [];
  public shootingHotspots: ShootingHotspot[] = [];

  // 演藝大樓電梯滑動門物件引用
  public lift1FDoors: { left: THREE.Mesh; right: THREE.Mesh } | null = null;
  public lift4FDoors: { left: THREE.Mesh; right: THREE.Mesh } | null = null;
  public liftDoorOpenRatio: number = 1.0; // 預設敞開狀態

  public setElevatorDoorsOpen(ratio: number) {
    this.liftDoorOpenRatio = THREE.MathUtils.clamp(ratio, 0, 1);
    if (this.lift1FDoors) {
      this.lift1FDoors.left.position.x = -0.55 - this.liftDoorOpenRatio * 0.75;
      this.lift1FDoors.right.position.x = 0.55 + this.liftDoorOpenRatio * 0.75;
    }
    if (this.lift4FDoors) {
      this.lift4FDoors.left.position.x = -0.55 - this.liftDoorOpenRatio * 0.75;
      this.lift4FDoors.right.position.x = 0.55 + this.liftDoorOpenRatio * 0.75;
    }
  }

  // 判斷玩家是否身處游泳池水體範圍之內
  public isInsideSwimmingPool(pos: THREE.Vector3): boolean {
    return pos.x >= 67.5 && pos.x <= 82.5 && pos.z >= -48.5 && pos.z <= -21.5 && pos.y <= 1.0 && pos.y >= -1.5;
  }
  public trackStartPos: THREE.Vector3 = new THREE.Vector3(-30, 0, 14); // 位於東主直道北端終點線 (進第一彎道前，標準田徑終點與200m起點)
  public trackCheckpoints: THREE.Vector3[] = [
    new THREE.Vector3(-37.3, 0.6, -3.7), // 1. 北第一彎道前段 (315度入彎，標準逆時針左轉)
    new THREE.Vector3(-55.0, 0.6, -11.0),// 2. 北第一彎道正頂點 (北端半圓弧頂，半徑 25m)
    new THREE.Vector3(-72.7, 0.6, -3.7), // 3. 北第一彎道出彎點 (225度出彎，準備進入後直道)
    new THREE.Vector3(-80.0, 0.6, 14.0), // 4. 西側後直道北端 (直線全速奔馳)
    new THREE.Vector3(-80.0, 0.6, 30.0), // 5. 西側後直道正中央 (後直道全力衝刺)
    new THREE.Vector3(-80.0, 0.6, 46.0), // 6. 西側後直道南端 (準備進入第二彎道)
    new THREE.Vector3(-72.7, 0.6, 63.7), // 7. 南第二彎道前段 (135度入彎，標準逆時針左轉)
    new THREE.Vector3(-55.0, 0.6, 71.0), // 8. 南第二彎道正頂點 (南端半圓弧頂，半徑 25m)
    new THREE.Vector3(-37.3, 0.6, 63.7), // 9. 南第二彎道出彎點 (45度出彎，準備進入終點主直道)
    new THREE.Vector3(-30.0, 0.6, 46.0), // 10. 東側終點主直道南端 (出彎進入最後直線衝刺！)
    new THREE.Vector3(-30.0, 0.6, 30.0), // 11. 東側終點主直道中段 (全場歡呼極速衝刺！)
    new THREE.Vector3(-30.0, 0.6, 14.0)  // 12. 衝破終點線拱門完賽！
  ];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildRichCampus();
  }

  // 註冊垂直阻擋物體 (牆面、立柱、鐵欄杆、球架等)
  public addCollider(minX: number, maxX: number, minZ: number, maxZ: number, minY: number = 0, maxY: number = 4) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), minY, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), maxY, Math.max(minZ, maxZ))
    });
  }

  // 註冊可站立行走的地板層板 (Floor Slabs) - isFloorOnly 不阻礙水平位移
  public addFloorSlab(minX: number, maxX: number, minZ: number, maxZ: number, floorY: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), floorY - 0.4, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), floorY, Math.max(minZ, maxZ)),
      isFloorOnly: true
    });
  }

  // 註冊平滑上下樓階梯坡道 (Ramps) - 支援任意角度上下樓梯，不卡腳、不擋頭
  public addRamp(minX: number, maxX: number, minZ: number, maxZ: number, yAtMinZ: number, yAtMaxZ: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), Math.min(yAtMinZ, yAtMaxZ) - 0.4, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), Math.max(yAtMinZ, yAtMaxZ), Math.max(minZ, maxZ)),
      isFloorOnly: true,
      isRamp: true,
      rampMinZ: Math.min(minZ, maxZ),
      rampMaxZ: Math.max(minZ, maxZ),
      rampYAtMinZ: yAtMinZ,
      rampYAtMaxZ: yAtMaxZ
    });
  }

  // 建立地磚/鋪路石紋理 (Procedural Tile Texture)
  public static createTileTexture(baseColor: string = '#cfd8dc', groutColor: string = '#90a4ae', repX: number = 24, repY: number = 24): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 128);
    // 細緻磨石子雜斑
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 50; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    // 磁磚溝縫與倒角立體感
    ctx.strokeStyle = groutColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, 126, 126);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, 122, 122);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    return tex;
  }

  // 建立外牆二丁掛瓷磚紋理 (Procedural Wall Brick Texture)
  public static createWallBrickTexture(baseColor: string = '#faebd7', groutColor: string = '#d7ccc8', repX: number = 10, repY: number = 4): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = groutColor;
    ctx.lineWidth = 2;
    for (let y = 0; y <= 128; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();
      const row = Math.floor(y / 16);
      const offset = (row % 2) * 16;
      for (let x = offset; x <= 128; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    return tex;
  }

  // 建立柏油瀝青路面紋理 (Procedural Asphalt Texture)
  public static createAsphaltTexture(repX: number = 16, repY: number = 4): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 90; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    return tex;
  }

  private buildRichCampus() {
    // 1. 全校主地坪 (Ground Base) - 鋪路磨石子地磚紋理
    const groundTex = CampusWorld.createTileTexture('#cfd8dc', '#90a4ae', 32, 32);
    const groundGeo = new THREE.PlaneGeometry(260, 260);
    const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. 操場與運動區 (Sports Zone)
    this.buildRunningTrack(-55, 0, 30);
    this.buildBasketballCourts(30, 0, -45);

    // 3. 升旗司令台 (Flag-raising Stage) - 移至北側廣場外圍 (Z: -34)，確保旗桿與台階徹底遠離跑道
    this.buildRostrum(-55, 0, -34);

    // 4. 實作可上下樓、有走廊、有內部教室的大樓
    // 敬業樓 A 棟：Z 從 1 到 35
    this.buildWalkableSchoolBuilding(38, 0, 18, '敬業樓 (三年級部)', true);
    // 樂群樓 B 棟：Z 從 55 到 89
    this.buildWalkableSchoolBuilding(38, 0, 72, '樂群樓 (一二年級部)', false);

    // 5. 兩棟大樓之間的空中走廊天橋連結 (連接敬業樓與樂群樓 2F & 3F)
    this.buildConnectingSkybridge(38, 0, 45);

    // 6. 天天福利社與熱食休息區
    this.buildCafeteria(-15, 0, -60);

    // 7. 腳踏車專用車棚
    this.buildBicycleShed(-55, 0, -65);

    // 8. 學校大門與警衛室 (Z = 105)
    this.buildSchoolMainGate(0, 0, 105);

    // 9. 校園生活細節 (洗手台、垃圾站、花圃、大榕樹)
    this.buildCampusDetails();

    // 10. 校園外圍圍牆與四面環繞環校馬路
    this.buildBoundaryWalls();

    // 11. 方案 D 趣味設施：學務處廣播台、操場 200m 起跑/終點拱門 (東主直道北端 Z: 14)
    this.buildBroadcastStation(30, 0, 18);
    this.buildTrackStartBanner(-30, 0, 14);

    // 12. 天天國中 25m 標準游泳館與水上競速起跑線
    this.buildSwimmingPool(75, 0, -35);

    // 13. 演藝大樓 (1~3F 挑高國際演藝廳，4F 室內羽球館與體育老師 Boss 林教頭)
    this.buildPerformingArtsBuilding(74, 0, 38);
  }

  // 建造可上下樓、有真實雙跑折返樓梯間、通暢走廊與教室內部、空中天橋貫通的立體校舍
  private buildWalkableSchoolBuilding(baseX: number, baseY: number, baseZ: number, buildingName: string, isBuildingA: boolean) {
    const wallColor = 0xfaebd7; // 米黃瓷磚外牆
    const floorColor = 0xb0bec5; // 磨石子走廊地板
    const railColor = 0x27ae60; // 經典綠色防護欄杆
    const innerWallColor = 0xf5f6fa; // 教室白灰內牆
    const woodColor = 0x8d6e63; // 課桌木色
    const blackboardColor = 0x1b4332; // 深綠粉筆黑板

    const wallTex = CampusWorld.createWallBrickTexture('#faebd7', '#d7ccc8', 10, 4);
    const floorTex = CampusWorld.createTileTexture('#b0bec5', '#78909c', 10, 16);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const railMat = new THREE.MeshLambertMaterial({ color: railColor });
    const innerWallMat = new THREE.MeshLambertMaterial({ color: innerWallColor });
    const woodMat = new THREE.MeshLambertMaterial({ color: woodColor });
    const blackboardMat = new THREE.MeshLambertMaterial({ color: blackboardColor });

    const bW = 20; // X 向寬度 (走廊 6.0m + 教室 14.0m)
    const bL = 34; // Z 向長度
    const floorH = 6.0; // 樓高加高至 6.0m（挑高立體校舍，起跳垂直淨空充足）
    const numFloors = 3;

    // 走廊位於 X 西側 (X: 28.0 ~ 34.0)，教室位於 X 東側 (X: 34.0 ~ 48.0)
    // 走廊寬度與樓梯間 6.0m 完全一致，兩側外牆與內隔牆毫無錯位！
    const corridorMinX = baseX - bW / 2; // 28.0
    const corridorMaxX = corridorMinX + 6.0; // 34.0
    const classMinX = corridorMaxX; // 34.0
    const classMaxX = baseX + bW / 2; // 48.0

    const zStart = baseZ - bL / 2; // e.g. 1.0 或 55.0
    const zEnd = baseZ + bL / 2;   // e.g. 35.0 或 89.0

    // 1. 各樓層樓地板與走廊護欄 (1F, 2F: Y = 6.0m, 3F: Y = 12.0m, 以及 頂樓天台 Y = 18.0m)
    for (let f = 1; f <= numFloors; f++) {
      const fY = baseY + f * floorH;

      // 樓層樓板 (涵蓋走廊與教室)
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.35, bL), floorMat);
      floorMesh.position.set(baseX, fY - 0.175, baseZ);
      floorMesh.receiveShadow = true;
      this.scene.add(floorMesh);

      // 註冊為可站立的地板層
      this.addFloorSlab(corridorMinX, classMaxX, zStart, zEnd, fY);

      // 走廊西側防護鐵欄杆 (防止摔落操場，各樓層均有，兩端樓梯與天橋出入口留出 2.0m 通暢通道)
      const railZStart = isBuildingA ? zStart + 2.0 : zStart;
      const railZEnd = isBuildingA ? zEnd : zEnd - 2.0;
      const railL = railZEnd - railZStart;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, railL), railMat);
      rail.position.set(corridorMinX + 0.1, fY + 0.6, (railZStart + railZEnd) / 2);
      rail.castShadow = true;
      this.scene.add(rail);
      this.addCollider(corridorMinX - 0.1, corridorMinX + 0.25, railZStart, railZEnd, fY, fY + 1.3);
    }

    // 1F 地面樓板註冊
    this.addFloorSlab(corridorMinX, classMaxX, zStart, zEnd, 0);

    // 2. 頂樓天台 (Rooftop Terrace at Y = 18.0m) 防護女兒牆與校園設施
    const roofY = baseY + numFloors * floorH; // 18.0m
    // 東側女兒牆 (教室外側)
    const eastParapet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, bL), wallMat);
    eastParapet.position.set(classMaxX, roofY + 0.65, baseZ);
    this.scene.add(eastParapet);
    this.addCollider(classMaxX - 0.25, classMaxX + 0.25, zStart, zEnd, roofY, roofY + 1.4);

    // 天台端點女兒牆
    if (isBuildingA) {
      // 敬業樓天台南側女兒牆 (對向天橋方向)
      const southParapet = new THREE.Mesh(new THREE.BoxGeometry(bW, 1.3, 0.3), wallMat);
      southParapet.position.set(baseX, roofY + 0.65, zEnd);
      this.scene.add(southParapet);
      this.addCollider(corridorMinX, classMaxX, zEnd - 0.25, zEnd + 0.25, roofY, roofY + 1.4);
    } else {
      // 樂群樓天台北側女兒牆 (對向天橋方向)
      const northParapet = new THREE.Mesh(new THREE.BoxGeometry(bW, 1.3, 0.3), wallMat);
      northParapet.position.set(baseX, roofY + 0.65, zStart);
      this.scene.add(northParapet);
      this.addCollider(corridorMinX, classMaxX, zStart - 0.25, zStart + 0.25, roofY, roofY + 1.4);
    }

    // 頂樓白鐵不鏽鋼大水塔 (經典校園頂樓設施)
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.85, roughness: 0.25 });
    const waterTank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 16), tankMat);
    waterTank.position.set(classMinX + 5, roofY + 1.6, baseZ - 4);
    waterTank.castShadow = true;
    this.scene.add(waterTank);
    this.addCollider(classMinX + 3.4, classMinX + 6.6, baseZ - 5.6, baseZ - 2.4, roofY, roofY + 3.0);

    // 3. 教室內部隔間、端點牆與出入門口動線
    for (let f = 0; f < numFloors; f++) {
      const curFloorY = baseY + f * floorH;

      // 教室東側後外牆 (Outer Back Wall at classMaxX)
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, bL), wallMat);
      backWall.position.set(classMaxX, curFloorY + floorH / 2, baseZ);
      backWall.castShadow = true;
      this.scene.add(backWall);
      this.addCollider(classMaxX - 0.25, classMaxX + 0.25, zStart, zEnd, curFloorY, curFloorY + floorH);

      // 教室北側端點外牆 (North End Classroom Wall at zStart)
      // 若為敬業樓，樓梯間入口在北側，教室外牆碰撞體向東退讓 0.8m，杜絕入口卡角
      const northClassWallMinX = isBuildingA ? classMinX + 0.8 : classMinX;
      const classW = bW - 4.5;
      const northClassWall = new THREE.Mesh(new THREE.BoxGeometry(classW, floorH, 0.3), wallMat);
      northClassWall.position.set(classMinX + classW / 2, curFloorY + floorH / 2, zStart);
      northClassWall.castShadow = true;
      this.scene.add(northClassWall);
      this.addCollider(northClassWallMinX, classMaxX, zStart - 0.25, zStart + 0.25, curFloorY, curFloorY + floorH);

      // 教室南側端點外牆 (South End Classroom Wall at zEnd)
      // 若為樂群樓，樓梯間入口在南側，教室外牆碰撞體向東退讓 0.8m，杜絕入口卡角
      const southClassWallMinX = !isBuildingA ? classMinX + 0.8 : classMinX;
      const southClassWall = new THREE.Mesh(new THREE.BoxGeometry(classW, floorH, 0.3), wallMat);
      southClassWall.position.set(classMinX + classW / 2, curFloorY + floorH / 2, zEnd);
      southClassWall.castShadow = true;
      this.scene.add(southClassWall);
      this.addCollider(southClassWallMinX, classMaxX, zEnd - 0.25, zEnd + 0.25, curFloorY, curFloorY + floorH);

      // 走廊端點門戶動線處理：
      if (isBuildingA) {
        // 敬業樓：
        // 北側 (zStart = 1.0) 連接北側折返樓梯間：全開放式通道，絕不設阻擋牆！
        // 南側 (zEnd = 35.0) 連接天橋 (2F & 3F) 與中庭地面 (1F)：
        if (f === 0) {
          // 1F 南端：設門框牆，中央留 2.2m 寬門口通往中庭綠地
          const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(1.15, floorH, 0.3), wallMat);
          leftPillar.position.set(corridorMinX + 0.575, curFloorY + floorH / 2, zEnd);
          this.scene.add(leftPillar);
          this.addCollider(corridorMinX, corridorMinX + 1.15, zEnd - 0.2, zEnd + 0.2, curFloorY, curFloorY + floorH);

          const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(1.15, floorH, 0.3), wallMat);
          rightPillar.position.set(corridorMaxX - 0.575, curFloorY + floorH / 2, zEnd);
          this.scene.add(rightPillar);
          this.addCollider(corridorMaxX - 1.15, corridorMaxX, zEnd - 0.2, zEnd + 0.2, curFloorY, curFloorY + floorH);
        } else {
          // 2F & 3F 南端：直通空中走廊天橋！兩側設精美門柱，中央暢通無阻！
          const pillarMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
          const pL = new THREE.Mesh(new THREE.BoxGeometry(0.35, floorH, 0.35), pillarMat);
          pL.position.set(corridorMinX + 0.2, curFloorY + floorH / 2, zEnd);
          this.scene.add(pL);

          const pR = new THREE.Mesh(new THREE.BoxGeometry(0.35, floorH, 0.35), pillarMat);
          pR.position.set(corridorMaxX - 0.2, curFloorY + floorH / 2, zEnd);
          this.scene.add(pR);

          const arch = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.4, 0.35), pillarMat);
          arch.position.set(corridorMinX + 3.0, curFloorY + floorH - 0.2, zEnd);
          this.scene.add(arch);
        }
      } else {
        // 樂群樓：
        // 南側 (zEnd = 89.0) 連接南側折返樓梯間：全開放式通道，絕不設阻擋牆！
        // 北側 (zStart = 55.0) 連接天橋 (2F & 3F) 與中庭 (1F)：
        if (f === 0) {
          // 1F 北端：設門框牆，中央留 2.2m 寬門口通往福利社方向
          const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(1.9, floorH, 0.3), wallMat);
          leftPillar.position.set(corridorMinX + 0.95, curFloorY + floorH / 2, zStart);
          this.scene.add(leftPillar);
          this.addCollider(corridorMinX, corridorMinX + 1.9, zStart - 0.2, zStart + 0.2, curFloorY, curFloorY + floorH);

          const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(1.9, floorH, 0.3), wallMat);
          rightPillar.position.set(corridorMaxX - 0.95, curFloorY + floorH / 2, zStart);
          this.scene.add(rightPillar);
          this.addCollider(corridorMaxX - 1.9, corridorMaxX, zStart - 0.2, zStart + 0.2, curFloorY, curFloorY + floorH);
        } else {
          // 2F & 3F 北端：直通空中走廊天橋！兩側設門柱，中央暢通無阻！
          const pillarMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
          const pL = new THREE.Mesh(new THREE.BoxGeometry(0.35, floorH, 0.35), pillarMat);
          pL.position.set(corridorMinX + 0.2, curFloorY + floorH / 2, zStart);
          this.scene.add(pL);

          const pR = new THREE.Mesh(new THREE.BoxGeometry(0.35, floorH, 0.35), pillarMat);
          pR.position.set(corridorMaxX - 0.2, curFloorY + floorH / 2, zStart);
          this.scene.add(pR);

          const arch = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.4, 0.35), pillarMat);
          arch.position.set(corridorMinX + 3.0, curFloorY + floorH - 0.2, zStart);
          this.scene.add(arch);
        }
      }

      // 走廊與教室隔牆：嚴格限制只能從【前門】與【後門】進出，其餘所有地方全實體碰撞封閉！
      // 北教室 (Z: baseZ - 17.0 ~ baseZ)：
      // 前門：[baseZ - 14.6, baseZ - 13.4] (寬 1.2m, 高 2.4m)
      // 後門：[baseZ - 4.1, baseZ - 2.9] (寬 1.2m, 高 2.4m)
      const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, 2.4), innerWallMat);
      w1.position.set(classMinX, curFloorY + floorH / 2, baseZ - 15.8);
      this.scene.add(w1);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ - 17.0, baseZ - 14.6, curFloorY, curFloorY + floorH);

      // 北教室前門門眉上樑
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH - 2.4, 1.2), innerWallMat);
      h1.position.set(classMinX, curFloorY + 2.4 + (floorH - 2.4) / 2, baseZ - 14.0);
      this.scene.add(h1);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ - 14.6, baseZ - 13.4, curFloorY + 2.4, curFloorY + floorH);

      // 北教室中段隔牆 (前門至後門之間，長 9.3m)
      const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, 9.3), innerWallMat);
      w2.position.set(classMinX, curFloorY + floorH / 2, baseZ - 8.75);
      this.scene.add(w2);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ - 13.4, baseZ - 4.1, curFloorY, curFloorY + floorH);

      // 走廊玻璃窗
      const winNorth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.6, 5.0), new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.6 }));
      winNorth.position.set(classMinX, curFloorY + 2.2, baseZ - 8.75);
      this.scene.add(winNorth);

      // 北教室後門門眉上樑
      const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH - 2.4, 1.2), innerWallMat);
      h2.position.set(classMinX, curFloorY + 2.4 + (floorH - 2.4) / 2, baseZ - 3.5);
      this.scene.add(h2);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ - 4.1, baseZ - 2.9, curFloorY + 2.4, curFloorY + floorH);

      // 北教室南端牆角
      const w3 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, 2.9), innerWallMat);
      w3.position.set(classMinX, curFloorY + floorH / 2, baseZ - 1.45);
      this.scene.add(w3);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ - 2.9, baseZ, curFloorY, curFloorY + floorH);

      // 南教室 (Z: baseZ ~ baseZ + 17.0)：
      // 前門：[baseZ + 2.9, baseZ + 4.1] (寬 1.2m, 高 2.4m)
      // 後門：[baseZ + 13.4, baseZ + 14.6] (寬 1.2m, 高 2.4m)
      const w4 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, 2.9), innerWallMat);
      w4.position.set(classMinX, curFloorY + floorH / 2, baseZ + 1.45);
      this.scene.add(w4);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ, baseZ + 2.9, curFloorY, curFloorY + floorH);

      // 南教室前門門眉上樑
      const h3 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH - 2.4, 1.2), innerWallMat);
      h3.position.set(classMinX, curFloorY + 2.4 + (floorH - 2.4) / 2, baseZ + 3.5);
      this.scene.add(h3);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ + 2.9, baseZ + 4.1, curFloorY + 2.4, curFloorY + floorH);

      // 南教室中段隔牆 (前門至後門之間，長 9.3m)
      const w5 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, 9.3), innerWallMat);
      w5.position.set(classMinX, curFloorY + floorH / 2, baseZ + 8.75);
      this.scene.add(w5);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ + 4.1, baseZ + 13.4, curFloorY, curFloorY + floorH);

      // 走廊玻璃窗
      const winSouth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.6, 5.0), new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.6 }));
      winSouth.position.set(classMinX, curFloorY + 2.2, baseZ + 8.75);
      this.scene.add(winSouth);

      // 南教室後門門眉上樑
      const h4 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH - 2.4, 1.2), innerWallMat);
      h4.position.set(classMinX, curFloorY + 2.4 + (floorH - 2.4) / 2, baseZ + 14.0);
      this.scene.add(h4);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ + 13.4, baseZ + 14.6, curFloorY + 2.4, curFloorY + floorH);

      // 南教室南端牆角
      const w6 = new THREE.Mesh(new THREE.BoxGeometry(0.3, floorH, 2.4), innerWallMat);
      w6.position.set(classMinX, curFloorY + floorH / 2, baseZ + 15.8);
      this.scene.add(w6);
      this.addCollider(classMinX - 0.2, classMinX + 0.2, baseZ + 14.6, baseZ + 17.0, curFloorY, curFloorY + floorH);

      // 教室中間分隔牆
      const midWall = new THREE.Mesh(new THREE.BoxGeometry(classW, floorH, 0.3), innerWallMat);
      midWall.position.set(classMinX + classW / 2, curFloorY + floorH / 2, baseZ);
      midWall.castShadow = true;
      this.scene.add(midWall);
      this.addCollider(classMinX, classMaxX, baseZ - 0.2, baseZ + 0.2, curFloorY, curFloorY + floorH);

      // 教室內佈置
      this.decorateClassroom(classMinX + 2, curFloorY, baseZ - 8, woodMat, blackboardMat);
      this.decorateClassroom(classMinX + 2, curFloorY, baseZ + 7, woodMat, blackboardMat);
    }

    // 4. 建造真實校園雙跑折返樓梯間 (1F -> 2F -> 3F -> 頂樓天台，上下暢通、永不擋頭卡腳)
    if (isBuildingA) {
      // 敬業樓：樓梯間配置在大樓北端 (Z: -8.5 ~ 1.0)，連接 1F~3F 走廊與頂樓天台
      this.buildSwitchbackStaircase(corridorMinX, corridorMaxX, zStart, true, numFloors, floorH, buildingName);
    } else {
      // 樂群樓：樓梯間配置在大樓南端 (Z: 89.0 ~ 98.5)，連接 1F~3F 走廊與頂樓天台
      this.buildSwitchbackStaircase(corridorMinX, corridorMaxX, zEnd, false, numFloors, floorH, buildingName);
    }
  }

  // 教室內部佈置：黑板、木製講台、課桌椅
  private decorateClassroom(rx: number, ry: number, rz: number, woodMat: THREE.Material, blackboardMat: THREE.Material) {
    // 黑板
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 5.0), blackboardMat);
    board.position.set(rx + 11.5, ry + 2.0, rz);
    this.scene.add(board);

    // 講台 (Podium)
    const podium = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.8), woodMat);
    podium.position.set(rx + 9.5, ry + 0.55, rz);
    podium.castShadow = true;
    this.scene.add(podium);
    this.addCollider(rx + 8.8, rx + 10.2, rz - 0.5, rz + 0.5, ry, ry + 1.2);

    // 課桌椅：擴增為 4 排 x 3 行 = 12 組完整課桌椅 (配備木質靠背與桌面教材書本)
    const bookColors = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6];
    const cols = [rx + 3.0, rx + 5.5, rx + 8.0];
    const rows = [-4.0, -1.3, 1.4, 4.1];

    let bIdx = 0;
    for (const rOffset of rows) {
      const deskZ = rz + rOffset;
      for (const deskX of cols) {
        // 課桌
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.6), woodMat);
        desk.position.set(deskX, ry + 0.38, deskZ);
        desk.castShadow = true;
        this.scene.add(desk);
        this.addCollider(deskX - 0.6, deskX + 0.6, deskZ - 0.3, deskZ + 0.3, ry, ry + 0.8);

        // 學生椅座面
        const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.45, 0.48), woodMat);
        chairSeat.position.set(deskX - 0.75, ry + 0.23, deskZ);
        chairSeat.castShadow = true;
        this.scene.add(chairSeat);

        // 學生椅靠背
        const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.48), woodMat);
        chairBack.position.set(deskX - 0.95, ry + 0.65, deskZ);
        chairBack.castShadow = true;
        this.scene.add(chairBack);

        // 桌面上的國英數教科書
        const bookMat = new THREE.MeshLambertMaterial({ color: bookColors[bIdx % bookColors.length] });
        bIdx++;
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.26), bookMat);
        book.position.set(deskX + 0.1, ry + 0.77, deskZ + 0.05);
        this.scene.add(book);
      }
    }
  }

  // 建造標準真實雙跑折返樓梯間 (Switchback Staircase)
  // 動線結構：
  // 建造標準真實雙跑折返樓梯間 (Switchback Staircase)
  // 動線結構：
  // 1. 每層樓分為東跑道與西跑道，中間有防護隔牆與扶手
  // 2. 跑道一爬升半層 (+3.0m) 抵達外側中繼平台 (Mid-Landing)，中繼平台設有大採光窗
  // 3. 轉折 180 度走跑道二爬升後半層 (+3.0m) 抵達上一層樓走廊平台！
  // 4. 東西跑道並排，上下層完全錯開，頭頂垂直淨空高達 5.5m 以上，絕對永不擋頭！
  // 5. 兩側外牆與內隔牆向外擴寬至 3.2m 寬闊跑道，碰撞箱徹底消除卡角與夾擠！
  // 6. 各樓層設有亮眼發光方向告示牌，上樓下樓導引一目了然！
  private buildSwitchbackStaircase(
    corridorMinX: number,
    corridorMaxX: number,
    zAttach: number,
    isNorthFacing: boolean,
    numFloors: number,
    floorH: number,
    buildingName: string
  ) {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xfaebd7, side: THREE.DoubleSide });
    const stepMat = new THREE.MeshLambertMaterial({ color: 0xbdc3c7 });
    const nosingMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // 樓梯止滑踏條
    const landingMat = new THREE.MeshLambertMaterial({ color: 0x95a5a6 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x27ae60 }); // 經典學校綠欄杆
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.65 });

    // 樓梯間 X 向寬度：外擴至 7.4m，提供 3.2m 寬闊跑道與 0.3m 碰撞隔離緩衝，杜絕擠角卡腳
    const stairMinX = corridorMinX - 0.7; // 27.3
    const stairMaxX = corridorMaxX + 0.7; // 34.7
    const dividerX = (stairMinX + stairMaxX) / 2; // 31.0 中央分隔線
    const stairW = stairMaxX - stairMinX; // 7.4m

    // 雙跑道寬度 (東跑 3.2m，西跑 3.2m，中央隔牆 0.25m)
    const flightW = 3.2;
    const flight1MinX = dividerX + 0.25; // 31.25 ~ 34.45 (東側跑道)
    const flight1MaxX = flight1MinX + flightW; // 34.45
    const flight2MaxX = dividerX - 0.25; // 30.75
    const flight2MinX = flight2MaxX - flightW; // 27.55 (西側跑道)

    const stairDepth = 9.8; // 樓梯間總進深 9.8m
    const landingDepth = 2.8; // 中繼休息平台深度
    const flightLen = 6.2; // 階梯坡段長度
    const numSteps = 12; // 12 階寬步階梯
    const halfFloorH = floorH / 2; // 3.0m
    const stepH = halfFloorH / numSteps; // 0.25m 舒適梯高
    const stepD = flightLen / numSteps; // 0.516m 寬闊踏面

    const totalHeight = (numFloors + 1) * floorH; // 樓梯間總高 (24.0m)

    if (isNorthFacing) {
      // 敬業樓 (向北延伸)：zAttach = 1.0，樓梯間從 1.0 往 -Z 延伸至 -8.8
      const zFar = zAttach - stairDepth; // -8.8 (北側外牆)
      const zMidLandingMin = zFar; // -8.8
      const zMidLandingMax = zFar + landingDepth; // -6.0
      const zFlightNorth = zMidLandingMax; // -6.0
      const zFlightSouth = zAttach - 0.6; // 0.4

      // 外圍實體外牆：
      // 北側外牆 (Z = -8.8)
      const northWall = new THREE.Mesh(new THREE.BoxGeometry(stairW + 0.6, totalHeight, 0.3), wallMat);
      northWall.position.set(dividerX, totalHeight / 2, zFar);
      northWall.castShadow = true;
      this.scene.add(northWall);
      this.addCollider(stairMinX - 0.4, stairMaxX + 0.4, zFar - 0.25, zFar + 0.25, 0, totalHeight);

      // 西側外牆 (X = 27.05，碰撞體退讓至 26.8 ~ 27.2，止於 zAttach - 0.6，入口完全通暢)
      const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, totalHeight, stairDepth), wallMat);
      westWall.position.set(stairMinX - 0.2, totalHeight / 2, (zFar + zAttach) / 2);
      westWall.castShadow = true;
      this.scene.add(westWall);
      this.addCollider(stairMinX - 0.45, stairMinX, zFar, zAttach - 0.6, 0, totalHeight);

      // 東側外牆 (X = 34.95，碰撞體退讓至 34.8 ~ 35.2，止於 zAttach - 0.6)
      const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, totalHeight, stairDepth), wallMat);
      eastWall.position.set(stairMaxX + 0.2, totalHeight / 2, (zFar + zAttach) / 2);
      eastWall.castShadow = true;
      this.scene.add(eastWall);
      this.addCollider(stairMaxX, stairMaxX + 0.45, zFar, zAttach - 0.6, 0, totalHeight);

      // 屋頂頂蓋
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(stairW + 1.0, 0.4, stairDepth + 0.8), wallMat);
      roofMesh.position.set(dividerX, totalHeight + 0.2, (zFar + zAttach) / 2);
      this.scene.add(roofMesh);

      // 逐層建造雙跑折返樓梯 (f = 0: 1F->2F, f = 1: 2F->3F, f = 2: 3F->頂樓天台)
      for (let f = 0; f < numFloors; f++) {
        const floorBaseY = f * floorH;

        // 1. 樓層出發/抵達平整地板 (Floor Landing at Z: 0.2 ~ 2.0，寬闊跨越走廊接縫)
        const fLanding = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.35, 1.8), landingMat);
        fLanding.position.set(dividerX, floorBaseY + (f === 0 ? 0.05 : -0.175), (zFlightSouth + zAttach + 0.8) / 2);
        fLanding.receiveShadow = true;
        this.scene.add(fLanding);
        this.addFloorSlab(stairMinX - 0.2, stairMaxX + 0.2, zFlightSouth - 0.2, zAttach + 1.2, floorBaseY);

        // 2. 中央防護隔牆 / 扶手 (分隔東跑與西跑，長 6.4m，止於 0.4m，前方留 1.6m 開闊轉折通道)
        const dividerWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, floorH + 0.6, flightLen), wallMat);
        dividerWall.position.set(dividerX, floorBaseY + (floorH + 0.6) / 2, (zFlightNorth + zFlightSouth) / 2);
        dividerWall.castShadow = true;
        this.scene.add(dividerWall);
        this.addCollider(dividerX - 0.12, dividerX + 0.12, zFlightNorth, zFlightSouth, floorBaseY, floorBaseY + floorH + 0.6);

        // 3. 第一跑 (東側跑道 Flight 1)：從南端 (Z = zFlightSouth) 往北爬升至北端中繼平台 (Z = zFlightNorth)
        for (let s = 0; s < numSteps; s++) {
          const curY = floorBaseY + (s + 0.5) * stepH;
          const curZ = zFlightSouth - (s + 0.5) * stepD;

          const step = new THREE.Mesh(new THREE.BoxGeometry(flightW, stepH, stepD + 0.06), stepMat);
          step.position.set((flight1MinX + flight1MaxX) / 2, curY, curZ);
          step.receiveShadow = true;
          this.scene.add(step);

          const nosing = new THREE.Mesh(new THREE.BoxGeometry(flightW, 0.02, 0.08), nosingMat);
          nosing.position.set((flight1MinX + flight1MaxX) / 2, curY + stepH / 2 + 0.01, curZ - stepD / 2 + 0.04);
          this.scene.add(nosing);
        }

        // 東跑道平滑爬升坡道 Collider (At minZ = zFlightNorth, Y = floorBaseY + 3.0; at maxZ = zFlightSouth, Y = floorBaseY)
        this.addRamp(flight1MinX, flight1MaxX, zFlightNorth, zFlightSouth, floorBaseY + halfFloorH, floorBaseY);

        // 東跑道外側防護欄杆
        const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, flightLen), railMat);
        rail1.position.set(flight1MaxX - 0.08, floorBaseY + halfFloorH / 2 + 0.55, (zFlightNorth + zFlightSouth) / 2);
        this.scene.add(rail1);

        // 4. 中繼轉折休息平台 (Mid-Landing Platform at Z: -8.8 ~ -6.0)
        const midY = floorBaseY + halfFloorH; // 3.0m, 9.0m, 15.0m
        const midLanding = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.35, landingDepth), landingMat);
        midLanding.position.set(dividerX, midY - 0.175, (zMidLandingMin + zMidLandingMax) / 2);
        midLanding.receiveShadow = true;
        this.scene.add(midLanding);
        this.addFloorSlab(stairMinX - 0.2, stairMaxX + 0.2, zMidLandingMin, zMidLandingMax, midY);

        // 中繼平台大採光玻璃窗
        const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(stairW - 1.0, 1.8, 0.1), glassMat);
        windowMesh.position.set(dividerX, midY + 1.2, zFar + 0.18);
        this.scene.add(windowMesh);

        // 5. 第二跑 (西側跑道 Flight 2)：從北端中繼平台 (Z = zFlightNorth) 往南爬升抵達上一層樓走廊 (Z = zFlightSouth)
        for (let s = 0; s < numSteps; s++) {
          const curY = midY + (s + 0.5) * stepH;
          const curZ = zFlightNorth + (s + 0.5) * stepD;

          const step = new THREE.Mesh(new THREE.BoxGeometry(flightW, stepH, stepD + 0.06), stepMat);
          step.position.set((flight2MinX + flight2MaxX) / 2, curY, curZ);
          step.receiveShadow = true;
          this.scene.add(step);

          const nosing = new THREE.Mesh(new THREE.BoxGeometry(flightW, 0.02, 0.08), nosingMat);
          nosing.position.set((flight2MinX + flight2MaxX) / 2, curY + stepH / 2 + 0.01, curZ + stepD / 2 - 0.04);
          this.scene.add(nosing);
        }

        // 西跑道平滑爬升坡道 Collider (At minZ = zFlightNorth, Y = floorBaseY + 3.0; at maxZ = zFlightSouth, Y = floorBaseY + 6.0)
        this.addRamp(flight2MinX, flight2MaxX, zFlightNorth, zFlightSouth, midY, floorBaseY + floorH);

        // 西跑道外側防護欄杆
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, flightLen), railMat);
        rail2.position.set(flight2MinX + 0.08, midY + halfFloorH / 2 + 0.55, (zFlightNorth + zFlightSouth) / 2);
        this.scene.add(rail2);

        // 各樓層入口發光導引看板
        const signText = f === 0
          ? '🟢 樓梯間 ➔ 2F ➔ 3F ➔ 天台 (靠右側東坡道上樓 ➔)'
          : `🟢 ${f + 1}F 走廊 ➔ ${f === 1 ? '3F ➔ 天台' : '頂樓露天平台'}`;
        this.addStairSignboard(dividerX, floorBaseY + 3.1, zAttach + 0.2, signText);
      }

      // 6. 頂樓天台出入口梯屋 (Rooftop Penthouse at Y = 18.0m)
      const topFloorY = numFloors * floorH; // 18.0m
      const topLanding = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.35, 1.8), landingMat);
      topLanding.position.set(dividerX, topFloorY - 0.175, (zFlightSouth + zAttach + 0.8) / 2);
      this.scene.add(topLanding);
      this.addFloorSlab(stairMinX - 0.2, stairMaxX + 0.2, zFlightSouth - 0.2, zAttach + 1.2, topFloorY);

      // 梯屋天台門柱與頂樑
      const doorPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5, 0.4), wallMat);
      doorPillarL.position.set(stairMinX + 0.2, topFloorY + 1.75, zAttach);
      this.scene.add(doorPillarL);

      const doorPillarR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5, 0.4), wallMat);
      doorPillarR.position.set(stairMaxX - 0.2, topFloorY + 1.75, zAttach);
      this.scene.add(doorPillarR);

      const doorArch = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.5, 0.4), wallMat);
      doorArch.position.set(dividerX, topFloorY + 3.25, zAttach);
      this.scene.add(doorArch);

      this.addStairSignboard(dividerX, topFloorY + 3.1, zAttach + 0.2, '⛅ 頂樓觀景露天平台 (俯瞰天天國中校園)');

    } else {
      // 樂群樓 (向南延伸)：zAttach = 89.0，樓梯間從 89.0 往 +Z 延伸至 98.8
      const zFar = zAttach + stairDepth; // 98.8 (南側外牆)
      const zMidLandingMin = zFar - landingDepth; // 96.0
      const zMidLandingMax = zFar; // 98.8
      const zFlightNorth = zAttach + 0.6; // 89.6
      const zFlightSouth = zMidLandingMin; // 96.0

      // 外圍實體外牆：
      // 南側外牆 (Z = 98.8)
      const southWall = new THREE.Mesh(new THREE.BoxGeometry(stairW + 0.6, totalHeight, 0.3), wallMat);
      southWall.position.set(dividerX, totalHeight / 2, zFar);
      southWall.castShadow = true;
      this.scene.add(southWall);
      this.addCollider(stairMinX - 0.4, stairMaxX + 0.4, zFar - 0.25, zFar + 0.25, 0, totalHeight);

      // 西側外牆
      const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, totalHeight, stairDepth), wallMat);
      westWall.position.set(stairMinX - 0.2, totalHeight / 2, (zAttach + zFar) / 2);
      westWall.castShadow = true;
      this.scene.add(westWall);
      this.addCollider(stairMinX - 0.45, stairMinX, zAttach + 0.6, zFar, 0, totalHeight);

      // 東側外牆
      const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, totalHeight, stairDepth), wallMat);
      eastWall.position.set(stairMaxX + 0.2, totalHeight / 2, (zAttach + zFar) / 2);
      eastWall.castShadow = true;
      this.scene.add(eastWall);
      this.addCollider(stairMaxX, stairMaxX + 0.45, zAttach + 0.6, zFar, 0, totalHeight);

      // 屋頂頂蓋
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(stairW + 1.0, 0.4, stairDepth + 0.8), wallMat);
      roofMesh.position.set(dividerX, totalHeight + 0.2, (zAttach + zFar) / 2);
      this.scene.add(roofMesh);

      // 逐層建造雙跑折返樓梯
      for (let f = 0; f < numFloors; f++) {
        const floorBaseY = f * floorH;

        // 1. 樓層出發/抵達平整地板 (Floor Landing at Z: 87.8 ~ 89.6)
        const fLanding = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.35, 1.8), landingMat);
        fLanding.position.set(dividerX, floorBaseY + (f === 0 ? 0.05 : -0.175), (zFlightNorth + zAttach - 0.8) / 2);
        fLanding.receiveShadow = true;
        this.scene.add(fLanding);
        this.addFloorSlab(stairMinX - 0.2, stairMaxX + 0.2, zAttach - 1.2, zFlightNorth + 0.2, floorBaseY);

        // 2. 中央防護隔牆
        const dividerWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, floorH + 0.6, flightLen), wallMat);
        dividerWall.position.set(dividerX, floorBaseY + (floorH + 0.6) / 2, (zFlightNorth + zFlightSouth) / 2);
        dividerWall.castShadow = true;
        this.scene.add(dividerWall);
        this.addCollider(dividerX - 0.12, dividerX + 0.12, zFlightNorth, zFlightSouth, floorBaseY, floorBaseY + floorH + 0.6);

        // 3. 第一跑 (東側跑道 Flight 1)：從北端 (Z = zFlightNorth) 往南爬升至南端中繼平台 (Z = zFlightSouth)
        for (let s = 0; s < numSteps; s++) {
          const curY = floorBaseY + (s + 0.5) * stepH;
          const curZ = zFlightNorth + (s + 0.5) * stepD;

          const step = new THREE.Mesh(new THREE.BoxGeometry(flightW, stepH, stepD + 0.06), stepMat);
          step.position.set((flight1MinX + flight1MaxX) / 2, curY, curZ);
          step.receiveShadow = true;
          this.scene.add(step);

          const nosing = new THREE.Mesh(new THREE.BoxGeometry(flightW, 0.02, 0.08), nosingMat);
          nosing.position.set((flight1MinX + flight1MaxX) / 2, curY + stepH / 2 + 0.01, curZ + stepD / 2 - 0.04);
          this.scene.add(nosing);
        }

        // 東跑道平滑爬升坡道 Collider (At minZ = zFlightNorth, Y = floorBaseY; at maxZ = zFlightSouth, Y = floorBaseY + 3.0)
        this.addRamp(flight1MinX, flight1MaxX, zFlightNorth, zFlightSouth, floorBaseY, floorBaseY + halfFloorH);

        // 東跑道外側欄杆
        const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, flightLen), railMat);
        rail1.position.set(flight1MaxX - 0.08, floorBaseY + halfFloorH / 2 + 0.55, (zFlightNorth + zFlightSouth) / 2);
        this.scene.add(rail1);

        // 4. 中繼轉折平台 (Mid-Landing at Z: 96.0 ~ 98.8)
        const midY = floorBaseY + halfFloorH;
        const midLanding = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.35, landingDepth), landingMat);
        midLanding.position.set(dividerX, midY - 0.175, (zMidLandingMin + zMidLandingMax) / 2);
        midLanding.receiveShadow = true;
        this.scene.add(midLanding);
        this.addFloorSlab(stairMinX - 0.2, stairMaxX + 0.2, zMidLandingMin, zMidLandingMax, midY);

        // 中繼平台大採光玻璃窗
        const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(stairW - 1.0, 1.8, 0.1), glassMat);
        windowMesh.position.set(dividerX, midY + 1.2, zFar - 0.18);
        this.scene.add(windowMesh);

        // 5. 第二跑 (西側跑道 Flight 2)：從南端中繼平台 (Z = zFlightSouth) 往北爬升抵達上一層樓走廊 (Z = zFlightNorth)
        for (let s = 0; s < numSteps; s++) {
          const curY = midY + (s + 0.5) * stepH;
          const curZ = zFlightSouth - (s + 0.5) * stepD;

          const step = new THREE.Mesh(new THREE.BoxGeometry(flightW, stepH, stepD + 0.06), stepMat);
          step.position.set((flight2MinX + flight2MaxX) / 2, curY, curZ);
          step.receiveShadow = true;
          this.scene.add(step);

          const nosing = new THREE.Mesh(new THREE.BoxGeometry(flightW, 0.02, 0.08), nosingMat);
          nosing.position.set((flight2MinX + flight2MaxX) / 2, curY + stepH / 2 + 0.01, curZ - stepD / 2 + 0.04);
          this.scene.add(nosing);
        }

        // 西跑道平滑爬升坡道 Collider (At minZ = zFlightNorth, Y = floorBaseY + 6.0; at maxZ = zFlightSouth, Y = floorBaseY + 3.0)
        this.addRamp(flight2MinX, flight2MaxX, zFlightNorth, zFlightSouth, floorBaseY + floorH, midY);

        // 西跑道外側欄杆
        const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, flightLen), railMat);
        rail2.position.set(flight2MinX + 0.08, midY + halfFloorH / 2 + 0.55, (zFlightNorth + zFlightSouth) / 2);
        this.scene.add(rail2);

        // 各樓層入口發光導引看板
        const signText = f === 0
          ? '🟢 樓梯間 ➔ 2F ➔ 3F ➔ 天台 (靠右側東坡道上樓 ➔)'
          : `🟢 ${f + 1}F 走廊 ➔ ${f === 1 ? '3F ➔ 天台' : '頂樓露天平台'}`;
        this.addStairSignboard(dividerX, floorBaseY + 3.1, zAttach - 0.2, signText);
      }

      // 6. 頂樓天台出入口梯屋 (Rooftop Penthouse at Y = 18.0m)
      const topFloorY = numFloors * floorH; // 18.0m
      const topLanding = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.35, 1.8), landingMat);
      topLanding.position.set(dividerX, topFloorY - 0.175, (zFlightNorth + zAttach - 0.8) / 2);
      this.scene.add(topLanding);
      this.addFloorSlab(stairMinX - 0.2, stairMaxX + 0.2, zAttach - 1.2, zFlightNorth + 0.2, topFloorY);

      // 梯屋天台門柱與頂樑
      const doorPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5, 0.4), wallMat);
      doorPillarL.position.set(stairMinX + 0.2, topFloorY + 1.75, zAttach);
      this.scene.add(doorPillarL);

      const doorPillarR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5, 0.4), wallMat);
      doorPillarR.position.set(stairMaxX - 0.2, topFloorY + 1.75, zAttach);
      this.scene.add(doorPillarR);

      const doorArch = new THREE.Mesh(new THREE.BoxGeometry(stairW, 0.5, 0.4), wallMat);
      doorArch.position.set(dividerX, topFloorY + 3.25, zAttach);
      this.scene.add(doorArch);

      this.addStairSignboard(dividerX, topFloorY + 3.1, zAttach - 0.2, '⛅ 頂樓觀景露天平台 (俯瞰天天國中校園)');
    }
  }

  // 樓梯間入口立體發光導引看板
  private addStairSignboard(x: number, y: number, z: number, text: string) {
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const ctx = signCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e272e';
      ctx.beginPath();
      ctx.roundRect(8, 8, 496, 112, 18);
      ctx.fill();

      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 64);
    }
    const texture = new THREE.CanvasTexture(signCanvas);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 1.05),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
    );
    signMesh.position.set(x, y, z);
    this.scene.add(signMesh);
  }

  // 雙校舍空中聯絡走廊 (Connecting Skybridge at 2F and 3F)
  // 連接敬業樓南端 (Z = 35.0) 與樂群樓北端 (Z = 55.0)，中間跨越 20 米校園花園
  private buildConnectingSkybridge(baseX: number, baseY: number, centerZ: number) {
    const bridgeW = 6.0;
    const bridgeL = 20.0; // 跨越 20 米空中長度連接兩棟大樓
    const fH = 6.0;

    const floorMat = new THREE.MeshLambertMaterial({ color: 0x78909c });
    const railMat = new THREE.MeshLambertMaterial({ color: 0x27ae60 });
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0xdfe6e9 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    const bridgeX = 31.0; // 嚴密對齊兩側走廊中心線 (28.0 ~ 34.0)

    // 2 樓與 3 樓空中走廊天橋 (2F: Y = 6.0m, 3F: Y = 12.0m)
    [1, 2].forEach((floorIdx) => {
      const bY = baseY + floorIdx * fH;

      // 天橋地板
      const floor = new THREE.Mesh(new THREE.BoxGeometry(bridgeW, 0.35, bridgeL), floorMat);
      floor.position.set(bridgeX, bY - 0.175, centerZ);
      floor.receiveShadow = true;
      this.scene.add(floor);
      // 註冊為平滑行走地板
      this.addFloorSlab(bridgeX - bridgeW / 2, bridgeX + bridgeW / 2, centerZ - bridgeL / 2, centerZ + bridgeL / 2, bY);

      // 左右兩側防護鐵欄杆 (可遠眺操場與中庭)
      const railL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, bridgeL), railMat);
      railL.position.set(bridgeX - bridgeW / 2 + 0.1, bY + 0.6, centerZ);
      railL.castShadow = true;
      this.scene.add(railL);
      this.addCollider(bridgeX - bridgeW / 2 - 0.1, bridgeX - bridgeW / 2 + 0.25, centerZ - bridgeL / 2, centerZ + bridgeL / 2, bY, bY + 1.3);

      const railR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, bridgeL), railMat);
      railR.position.set(bridgeX + bridgeW / 2 - 0.1, bY + 0.6, centerZ);
      railR.castShadow = true;
      this.scene.add(railR);
      this.addCollider(bridgeX + bridgeW / 2 - 0.25, bridgeX + bridgeW / 2 + 0.1, centerZ - bridgeL / 2, centerZ + bridgeL / 2, bY, bY + 1.3);
    });

    // 天橋頂棚
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bridgeW + 0.8, 0.4, bridgeL), roofMat);
    roof.position.set(bridgeX, baseY + 3 * fH + 0.2, centerZ);
    roof.castShadow = true;
    this.scene.add(roof);

    // 地面支撐立柱 4 根
    const pillarGeo = new THREE.BoxGeometry(0.8, baseY + 2 * fH, 0.8);
    [[-1.8, -6], [1.8, -6], [-1.8, 6], [1.8, 6]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(bridgeX + px, (baseY + 2 * fH) / 2, centerZ + pz);
      p.castShadow = true;
      this.scene.add(p);
      this.addCollider(bridgeX + px - 0.45, bridgeX + px + 0.45, centerZ + pz - 0.45, centerZ + pz + 0.45, 0, fH * 2);
    });
  }

  // 建立標準橢圓/體育場形狀 (Stadium Shape: 兩條平行直線 + 兩端半圓)
  private createStadiumShape(straightHalfLen: number, radius: number): THREE.Shape {
    const shape = new THREE.Shape();
    shape.moveTo(radius, -straightHalfLen);
    shape.lineTo(radius, straightHalfLen);
    shape.absarc(0, straightHalfLen, radius, 0, Math.PI, false);
    shape.lineTo(-radius, -straightHalfLen);
    shape.absarc(0, -straightHalfLen, radius, Math.PI, Math.PI * 2, false);
    return shape;
  }

  private createStadiumPath(straightHalfLen: number, radius: number): THREE.Path {
    const path = new THREE.Path();
    path.moveTo(radius, -straightHalfLen);
    path.lineTo(radius, straightHalfLen);
    path.absarc(0, straightHalfLen, radius, 0, Math.PI, false);
    path.lineTo(-radius, -straightHalfLen);
    path.absarc(0, -straightHalfLen, radius, Math.PI, Math.PI * 2, false);
    return path;
  }

  // 操場跑道 (真實橢圓體育場跑道：外環紅色 PU 跑道、內圈天然草皮與多道白色跑道分道線)
  private buildRunningTrack(cx: number, cy: number, cz: number) {
    const straightHalf = 16;
    const innerR = 18;
    const outerR = 32;

    // 1. 外圈紅色 PU 跑道 (中間挖空留給草皮)
    const trackShape = this.createStadiumShape(straightHalf, outerR);
    const innerHole = this.createStadiumPath(straightHalf, innerR);
    trackShape.holes.push(innerHole);

    const trackGeo = new THREE.ShapeGeometry(trackShape, 48);
    const trackMat = new THREE.MeshLambertMaterial({ color: 0xa93226 });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.set(cx, cy + 0.02, cz);
    track.receiveShadow = true;
    this.scene.add(track);

    // 2. 跑道白色分道線
    const laneRadii = [21.5, 25.0, 28.5];
    laneRadii.forEach((r) => {
      const lineShape = this.createStadiumShape(straightHalf, r);
      const points = lineShape.getPoints(64);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
      const line = new THREE.LineLoop(lineGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(cx, cy + 0.025, cz);
      this.scene.add(line);
    });

    // 3. 內圈橢圓形草皮足球場
    const fieldShape = this.createStadiumShape(straightHalf, innerR);
    const fieldGeo = new THREE.ShapeGeometry(fieldShape, 48);
    const fieldMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
    const field = new THREE.Mesh(fieldGeo, fieldMat);
    field.rotation.x = -Math.PI / 2;
    field.position.set(cx, cy + 0.03, cz);
    field.receiveShadow = true;
    this.scene.add(field);

    // 4. 兩端足球球門
    this.buildSoccerGoal(cx, cy, cz - (straightHalf + innerR * 0.45), 0);
    this.buildSoccerGoal(cx, cy, cz + (straightHalf + innerR * 0.45), Math.PI);
  }

  private buildSoccerGoal(x: number, y: number, z: number, rotY: number) {
    const goal = new THREE.Group();
    goal.position.set(x, y, z);
    goal.rotation.y = rotY;

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8);

    const postL = new THREE.Mesh(postGeo, metalMat);
    postL.position.set(-2.5, 1.2, 0);
    postL.castShadow = true;
    goal.add(postL);

    const postR = new THREE.Mesh(postGeo, metalMat);
    postR.position.set(2.5, 1.2, 0);
    postR.castShadow = true;
    goal.add(postR);

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.0, 8), metalMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.4, 0);
    bar.castShadow = true;
    goal.add(bar);

    this.scene.add(goal);
    this.addCollider(x - 2.6, x + 2.6, z - 0.4, z + 0.4, y, y + 2.5);
  }

  // 籃球場 (實作完整 FIBA/NBA 標準規格球場標線與 3D 專屬投籃熱區標記)
  private buildBasketballCourts(x: number, y: number, z: number) {
    const courtWidth = 32;
    const courtDepth = 48;

    // 1. 標準籃球場地面 (帶有三分線、禁區、罰球線、中圈與標記)
    const courtFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(courtWidth, courtDepth),
      new THREE.MeshLambertMaterial({ map: this.createBasketballCourtTexture() })
    );
    courtFloor.rotation.x = -Math.PI / 2;
    courtFloor.position.set(x, y + 0.02, z);
    courtFloor.receiveShadow = true;
    this.scene.add(courtFloor);

    // 2. 四座籃球架 (西側兩座 X=22、東側兩座 X=38)
    this.buildBasketballHoop(x - 8, y, z - 22, 0);
    this.buildBasketballHoop(x + 8, y, z - 22, 0);
    this.buildBasketballHoop(x - 8, y, z + 22, Math.PI);
    this.buildBasketballHoop(x + 8, y, z + 22, Math.PI);

    this.hoopTargets = [
      new THREE.Vector3(x - 8, 3.4, z - 21.05), // 西側北籃框
      new THREE.Vector3(x + 8, 3.4, z - 21.05), // 東側北籃框
      new THREE.Vector3(x - 8, 3.4, z + 21.05), // 西側南籃框
      new THREE.Vector3(x + 8, 3.4, z + 21.05)  // 東側南籃框
    ];

    // 3. 地面專屬投籃熱區 (Shooting Hotspots) 發光光圈
    const targetHoopNorthWest = this.hoopTargets[0];
    const targetHoopNorthEast = this.hoopTargets[1];

    const hotspotDefs = [
      { id: 'west-3pt-top', name: '頂弧三分線 (6.75m)', type: '3PT' as const, pos: new THREE.Vector3(22, 0, -59.5), hoop: targetHoopNorthWest, radius: 1.8, bonus: 200, color: 0xf1c40f },
      { id: 'west-ft', name: '罰球線 (5.80m)', type: 'FT' as const, pos: new THREE.Vector3(22, 0, -61.6), hoop: targetHoopNorthWest, radius: 1.6, bonus: 100, color: 0x3498db },
      { id: 'west-3pt-left', name: '左翼 45° 三分線', type: '3PT' as const, pos: new THREE.Vector3(17.2, 0, -62.2), hoop: targetHoopNorthWest, radius: 1.8, bonus: 200, color: 0xf1c40f },
      { id: 'west-3pt-right', name: '右翼 45° 三分線', type: '3PT' as const, pos: new THREE.Vector3(26.8, 0, -62.2), hoop: targetHoopNorthWest, radius: 1.8, bonus: 200, color: 0xf1c40f },
      { id: 'east-3pt-top', name: '東場頂弧三分線', type: '3PT' as const, pos: new THREE.Vector3(38, 0, -59.5), hoop: targetHoopNorthEast, radius: 1.8, bonus: 200, color: 0xf1c40f },
      { id: 'center-logo', name: '中場超大號 LOGO 三分', type: 'LOGO' as const, pos: new THREE.Vector3(30, 0, -45.0), hoop: targetHoopNorthWest, radius: 2.2, bonus: 350, color: 0xe74c3c }
    ];

    this.shootingHotspots = [];
    hotspotDefs.forEach((spot) => {
      // 3D 地面發光光環
      const ringGeo = new THREE.TorusGeometry(spot.radius * 0.75, 0.07, 6, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: spot.color, transparent: true, opacity: 0.65 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(spot.pos.x, y + 0.035, spot.pos.z);
      this.scene.add(ringMesh);

      this.shootingHotspots.push({
        id: spot.id,
        name: spot.name,
        type: spot.type,
        position: spot.pos,
        targetHoop: spot.hoop,
        radius: spot.radius,
        bonusPoints: spot.bonus,
        ringMesh
      });
    });

    this.buildBench(x - 18, y, z - 10);
    this.buildBench(x - 18, y, z + 10);
    this.buildBench(x + 18, y, z);
  }

  // 繪製高解析度標準籃球場標線材質 (1024x1536)
  private createBasketballCourtTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1536;
    const ctx = canvas.getContext('2d')!;

    // 1. 底色：經典校園壓克力深綠球場 + 外圍安全界外區
    ctx.fillStyle = '#145a32';
    ctx.fillRect(0, 0, 1024, 1536);

    ctx.fillStyle = '#1e824c';
    ctx.fillRect(24, 24, 976, 1488);

    // 2. 白色主邊界線
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(32, 32, 960, 1472);

    // 中場半場分割線
    ctx.beginPath();
    ctx.moveTo(32, 768);
    ctx.lineTo(992, 768);
    ctx.stroke();

    // 兩座球場中央分隔虛線
    ctx.setLineDash([16, 16]);
    ctx.beginPath();
    ctx.moveTo(512, 32);
    ctx.lineTo(512, 1504);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. 繪製兩座球場標線 (西場 courtX = 256, 東場 courtX = 768)
    const courtXs = [256, 768];

    courtXs.forEach((cX) => {
      // 中圈跳球區 (半徑 58px)
      ctx.beginPath();
      ctx.arc(cX, 768, 58, 0, Math.PI * 2);
      ctx.stroke();

      // --- 北半場 (North Hoop at y = 82) ---
      // 禁區油漆區 (Terracotta Red)
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cX - 78, 32, 156, 186);
      ctx.strokeRect(cX - 78, 32, 156, 186);

      // 罰球線 (y = 218) 與罰球半圓
      ctx.beginPath();
      ctx.arc(cX, 218, 58, 0, Math.PI); // 外側實線半圓
      ctx.stroke();
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.arc(cX, 218, 58, Math.PI, Math.PI * 2); // 禁區內虛線
      ctx.stroke();
      ctx.setLineDash([]);

      // 三分線 (Three-Point Arc，半徑 216px，對齊標準 6.75m)
      ctx.beginPath();
      ctx.moveTo(cX - 212, 32);
      ctx.lineTo(cX - 212, 110);
      ctx.arc(cX, 82, 216, Math.PI * 0.95, Math.PI * 2.05, true);
      ctx.lineTo(cX + 212, 32);
      ctx.stroke();

      // --- 南半場 (South Hoop at y = 1454) ---
      // 禁區油漆區
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(cX - 78, 1504 - 186, 156, 186);
      ctx.strokeRect(cX - 78, 1504 - 186, 156, 186);

      // 罰球線與半圓
      ctx.beginPath();
      ctx.arc(cX, 1504 - 218, 58, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.arc(cX, 1504 - 218, 58, 0, Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      // 三分線
      ctx.beginPath();
      ctx.moveTo(cX - 212, 1504);
      ctx.lineTo(cX - 212, 1504 - 78);
      ctx.arc(cX, 1454, 216, Math.PI * 1.05, -Math.PI * 0.05, false);
      ctx.lineTo(cX + 212, 1504);
      ctx.stroke();

      // 地面醒目標記字樣
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 20px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3PT 三分球', cX, 305);
      ctx.fillText('罰球線 FT', cX, 210);
      ctx.fillText('3PT 三分球', cX, 1504 - 305);
      ctx.fillText('罰球線 FT', cX, 1504 - 210);
    });

    // 4. 中場醒目金字校園球場 Logo
    ctx.save();
    ctx.translate(512, 768);
    ctx.fillStyle = 'rgba(241, 196, 15, 0.9)';
    ctx.font = '900 34px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ 天天國中 BASKETBALL ARENA ★', 0, 0);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private buildBasketballHoop(x: number, y: number, z: number, rotY: number) {
    const hoop = new THREE.Group();
    hoop.position.set(x, y, z);
    hoop.rotation.y = rotY;

    const steelMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.85 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.0, 8), steelMat);
    pole.position.set(0, 2.0, -0.6);
    pole.castShadow = true;
    hoop.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), steelMat);
    arm.position.set(0, 3.8, 0);
    hoop.add(arm);

    const backboard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.08), boardMat);
    backboard.position.set(0, 3.8, 0.6);
    backboard.castShadow = true;
    hoop.add(backboard);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 16), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 3.4, 0.95);
    hoop.add(rim);

    this.scene.add(hoop);
    this.addCollider(x - 0.4, x + 0.4, z - 1.0, z + 0.2, y, y + 4.5);
  }

  private buildBench(x: number, y: number, z: number) {
    const bench = new THREE.Group();
    bench.position.set(x, y, z);

    const woodMat = new THREE.MeshLambertMaterial({ color: 0x27ae60 });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), woodMat);
    seat.position.y = 0.5;
    seat.castShadow = true;
    bench.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.1), woodMat);
    back.position.set(0, 0.85, -0.25);
    back.castShadow = true;
    bench.add(back);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6);
    [[-1.0, -0.2], [1.0, -0.2], [-1.0, 0.2], [1.0, 0.2]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.25, lz);
      bench.add(leg);
    });

    this.scene.add(bench);
    this.addCollider(x - 1.3, x + 1.3, z - 0.4, z + 0.4, y, y + 1.2);
  }

  // 升旗司令台
  private buildRostrum(x: number, y: number, z: number) {
    const stageWidth = 18;
    const stageDepth = 12;
    const stageHeight = 1.4;

    const baseMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });

    const base = new THREE.Mesh(new THREE.BoxGeometry(stageWidth, stageHeight, stageDepth), baseMat);
    base.position.set(x, y + stageHeight / 2, z);
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);
    this.addFloorSlab(x - stageWidth / 2, x + stageWidth / 2, z - stageDepth / 2, z + stageDepth / 2, stageHeight);

    // 台階
    const stepMat = new THREE.MeshLambertMaterial({ color: 0xbdc3c7 });
    for (let i = 0; i < 3; i++) {
      const sH = 0.35;
      const sD = 0.8;
      const sW = 8.0;
      const step = new THREE.Mesh(new THREE.BoxGeometry(sW, sH, sD), stepMat);
      step.position.set(x, y + (i + 0.5) * sH, z + stageDepth / 2 + (2.5 - i) * sD);
      step.receiveShadow = true;
      this.scene.add(step);
      this.addFloorSlab(x - sW / 2, x + sW / 2, z + stageDepth / 2 + (2 - i) * sD, z + stageDepth / 2 + (3 - i) * sD, (i + 1) * sH);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(stageWidth + 2, 0.6, stageDepth + 2), roofMat);
    roof.position.set(x, y + 5.5, z);
    roof.castShadow = true;
    this.scene.add(roof);

    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 4.5, 12);
    [
      [-stageWidth / 2 + 1, -stageDepth / 2 + 1],
      [stageWidth / 2 - 1, -stageDepth / 2 + 1],
      [-stageWidth / 2 + 1, stageDepth / 2 - 1],
      [stageWidth / 2 - 1, stageDepth / 2 - 1]
    ].forEach(([px, pz]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x + px, y + stageHeight + 2.25, z + pz);
      p.castShadow = true;
      this.scene.add(p);
      this.addCollider(x + px - 0.4, x + px + 0.4, z + pz - 0.4, z + pz + 0.4, y, y + 5.5);
    });

    const podium = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x8b4513 }));
    podium.position.set(x, y + stageHeight + 0.6, z + 3);
    podium.castShadow = true;
    this.scene.add(podium);
    this.addCollider(x - 0.7, x + 0.7, z + 2.5, z + 3.5, y + stageHeight, y + stageHeight + 1.4);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 8), new THREE.MeshStandardMaterial({ color: 0xdcdde1 }));
    pole.position.set(x, y + 4.5, z + stageDepth / 2 + 2.8);
    pole.castShadow = true;
    this.scene.add(pole);

    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshLambertMaterial({ color: 0xd63031, side: THREE.DoubleSide }));
    flag.position.set(x + 0.9, y + 8.2, z + stageDepth / 2 + 2.8);
    this.scene.add(flag);
    this.addCollider(x - 0.3, x + 0.3, z + stageDepth / 2 + 2.5, z + stageDepth / 2 + 3.1, y, y + 9);
  }

  // 天天福利社
  private buildCafeteria(x: number, y: number, z: number) {
    const shopMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const awningMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.7 });

    const shop = new THREE.Mesh(new THREE.BoxGeometry(18, 5.0, 14), shopMat);
    shop.position.set(x, y + 2.5, z);
    shop.castShadow = true;
    shop.receiveShadow = true;
    this.scene.add(shop);
    this.addCollider(x - 9, x + 9, z - 7, z + 7, y, y + 5.0);

    const awning = new THREE.Mesh(new THREE.BoxGeometry(19, 0.4, 5.0), awningMat);
    awning.position.set(x, y + 4.0, z + 8.5);
    awning.rotation.x = 0.2;
    awning.castShadow = true;
    this.scene.add(awning);

    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 0.2), glassMat);
    windowMesh.position.set(x - 2, y + 2.2, z + 7.1);
    this.scene.add(windowMesh);

    // 天天福利社招牌 (換為經典藍色底色)
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d')!;
    sCtx.fillStyle = '#1e3799'; // 經典校園合作社深藍底色
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.strokeStyle = '#48dbfb'; // 亮天藍質感包邊
    sCtx.lineWidth = 6;
    sCtx.strokeRect(4, 4, 504, 120);
    sCtx.fillStyle = '#ffffff';
    sCtx.font = 'bold 50px "Noto Sans TC", sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('天天福利社 🏪', 256, 64);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 0.3), signMat);
    sign.position.set(x, y + 4.8, z + 7.2);
    this.scene.add(sign);

    const vendGeo = new THREE.BoxGeometry(1.4, 2.6, 1.2);
    const vends = [
      { color: 0xe74c3c, offX: 5.5 },
      { color: 0x3498db, offX: 7.2 },
      { color: 0x27ae60, offX: -5.5 },
      { color: 0xf39c12, offX: -7.2 }
    ];

    vends.forEach((v) => {
      const vend = new THREE.Mesh(vendGeo, new THREE.MeshLambertMaterial({ color: v.color }));
      vend.position.set(x + v.offX, y + 1.3, z + 7.6);
      vend.castShadow = true;
      this.scene.add(vend);
      this.addCollider(x + v.offX - 0.75, x + v.offX + 0.75, z + 7.0, z + 8.3, y, y + 2.7);
    });

    // 合作社熱食部服務櫃台 (Service Counter & Auntie)
    const counterMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const topMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const counterBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 1.4), counterMat);
    counterBase.position.set(x - 2, y + 0.5, z + 7.8);
    counterBase.castShadow = true;
    this.scene.add(counterBase);
    this.addCollider(x - 4.2, x + 0.2, z + 7.0, z + 8.6, y, y + 1.2);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 1.6), topMat);
    counterTop.position.set(x - 2, y + 1.06, z + 7.8);
    this.scene.add(counterTop);

    // 收銀機與排骨便當熱食保溫箱模型
    const posMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const register = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.45), posMat);
    register.position.set(x - 3.2, y + 1.3, z + 7.8);
    this.scene.add(register);

    const foodWarmerMat = new THREE.MeshLambertMaterial({ color: 0xf39c12, transparent: true, opacity: 0.85 });
    const warmer = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.8), foodWarmerMat);
    warmer.position.set(x - 1.2, y + 1.42, z + 7.8);
    this.scene.add(warmer);

    // 合作社阿姨 3D 模型 (粉紅圍裙、親切笑容)
    const auntieGroup = new THREE.Group();
    auntieGroup.position.set(x - 2, y, z + 6.8);
    const auntieBody = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshLambertMaterial({ color: 0xff7675 }));
    auntieBody.position.y = 1.0;
    auntieGroup.add(auntieBody);
    const auntieHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), new THREE.MeshLambertMaterial({ color: 0xfad390 }));
    auntieHead.position.y = 1.6;
    auntieGroup.add(auntieHead);
    const auntieHair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.52), new THREE.MeshLambertMaterial({ color: 0x2d3436 }));
    auntieHair.position.y = 1.75;
    auntieGroup.add(auntieHair);
    this.scene.add(auntieGroup);

    // 合作社招牌小燈箱
    const hotFoodSignCanvas = document.createElement('canvas');
    hotFoodSignCanvas.width = 256;
    hotFoodSignCanvas.height = 64;
    const hfCtx = hotFoodSignCanvas.getContext('2d')!;
    hfCtx.fillStyle = '#d63031';
    hfCtx.fillRect(0, 0, 256, 64);
    hfCtx.strokeStyle = '#ffeaa7';
    hfCtx.lineWidth = 4;
    hfCtx.strokeRect(2, 2, 252, 60);
    hfCtx.fillStyle = '#ffffff';
    hfCtx.font = 'bold 24px "Noto Sans TC", sans-serif';
    hfCtx.textAlign = 'center';
    hfCtx.textBaseline = 'middle';
    hfCtx.fillText('🍱 熱食補血專區', 128, 32);

    const hfTex = new THREE.CanvasTexture(hotFoodSignCanvas);
    const hfSign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.15), new THREE.MeshBasicMaterial({ map: hfTex }));
    hfSign.position.set(x - 2, y + 2.4, z + 7.8);
    this.scene.add(hfSign);

    // 地面互動發光圈 (金色)
    const ringGeo = new THREE.TorusGeometry(1.6, 0.08, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.75 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x - 2, y + 0.03, z + 10.0);
    this.scene.add(ring);

    this.buildPicnicTable(x - 5, y, z + 16);
    this.buildPicnicTable(x + 5, y, z + 16);
  }

  private buildPicnicTable(x: number, y: number, z: number) {
    const tableMat = new THREE.MeshLambertMaterial({ color: 0xd35400 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
    const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });

    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16), tableMat);
    table.position.set(x, y + 0.9, z);
    table.castShadow = true;
    this.scene.add(table);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8), metalMat);
    leg.position.set(x, y + 0.45, z);
    this.scene.add(leg);

    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.8, 12), umbrellaMat);
    umbrella.position.set(x, y + 2.6, z);
    umbrella.castShadow = true;
    this.scene.add(umbrella);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), metalMat);
    pole.position.set(x, y + 1.3, z);
    this.scene.add(pole);

    this.addCollider(x - 1.2, x + 1.2, z - 1.2, z + 1.2, y, y + 2.8);
  }

  // 腳踏車棚
  private buildBicycleShed(x: number, y: number, z: number) {
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x95a5a6 });

    const shedW = 32;
    const shedD = 10;

    const roof = new THREE.Mesh(new THREE.BoxGeometry(shedW, 0.3, shedD), roofMat);
    roof.position.set(x, y + 3.4, z);
    roof.rotation.x = 0.08;
    roof.castShadow = true;
    this.scene.add(roof);

    const poleGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.4, 8);
    [[-14, -4], [14, -4], [-14, 4], [14, 4], [0, -4], [0, 4]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(poleGeo, poleMat);
      p.position.set(x + px, y + 1.7, z + pz);
      p.castShadow = true;
      this.scene.add(p);
      this.addCollider(x + px - 0.3, x + px + 0.3, z + pz - 0.3, z + pz + 0.3, y, y + 3.4);
    });

    this.bicycleSpawnPoints = [
      new THREE.Vector3(x - 8, 0, z),
      new THREE.Vector3(x - 2, 0, z),
      new THREE.Vector3(x + 4, 0, z),
      new THREE.Vector3(x + 10, 0, z)
    ];
  }

  // 校門與警衛室
  private buildSchoolMainGate(x: number, y: number, z: number) {
    const marbleMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
    const guardMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const gateMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    const pillar1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.0, 2.8), marbleMat);
    pillar1.position.set(x - 9, y + 2.5, z);
    pillar1.castShadow = true;
    this.scene.add(pillar1);
    this.addCollider(x - 10.5, x - 7.5, z - 1.5, z + 1.5, y, y + 5.0);

    const pillar2 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.0, 2.8), marbleMat);
    pillar2.position.set(x + 9, y + 2.5, z);
    pillar2.castShadow = true;
    this.scene.add(pillar2);
    this.addCollider(x + 7.5, x + 10.5, z - 1.5, z + 1.5, y, y + 5.0);

    // 天天國中校門金字校銘牌
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 128;
    plaqueCanvas.height = 512;
    const pCtx = plaqueCanvas.getContext('2d')!;
    pCtx.fillStyle = '#0f172a';
    pCtx.fillRect(0, 0, 128, 512);
    pCtx.strokeStyle = '#f1c40f';
    pCtx.lineWidth = 8;
    pCtx.strokeRect(6, 6, 116, 500);

    pCtx.fillStyle = '#f1c40f';
    pCtx.font = 'bold 34px "Noto Sans TC", sans-serif';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';

    const plaqueChars = ['天', '天', '國', '中'];
    plaqueChars.forEach((char, idx) => {
      pCtx.fillText(char, 64, 80 + idx * 110);
    });

    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 1.2), plaqueMat);
    sign.position.set(x - 7.5, y + 2.6, z);
    this.scene.add(sign);

    const frontSign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 0.1), plaqueMat);
    frontSign.position.set(x - 9, y + 2.6, z + 1.45);
    this.scene.add(frontSign);

    const gate = new THREE.Mesh(new THREE.BoxGeometry(8, 2.0, 0.4), gateMat);
    gate.position.set(x - 4, y + 1.0, z);
    gate.castShadow = true;
    this.scene.add(gate);
    this.addCollider(x - 8.0, x, z - 0.3, z + 0.3, y, y + 2.0);

    const guardHouse = new THREE.Mesh(new THREE.BoxGeometry(7, 3.8, 7), guardMat);
    guardHouse.position.set(x + 15, y + 1.9, z);
    guardHouse.castShadow = true;
    this.scene.add(guardHouse);
    this.addCollider(x + 11.5, x + 18.5, z - 3.5, z + 3.5, y, y + 3.8);

    const bump = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 1.2), new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
    bump.position.set(x, y + 0.08, z - 5);
    this.scene.add(bump);
  }

  // 校園生活細節
  private buildCampusDetails() {
    this.buildWashBasin(20, 0, -5);
    this.buildWashBasin(20, 0, 95);

    this.buildRecyclingStation(-28, 0, -55);
    this.buildCentralPlanter(0, 0, 15);

    // 操場與跑道範圍內絕對不可有樹木，樹木配置於校園外圍圍牆邊與綠化帶（[75, 20] 位於演藝廳北牆與舞台範圍內已移除）
    const treeCoords = [
      [-105, 30], [-105, 65], [-105, -5],
      [10, -25], [-15, 85], [75, 70],
      [-85, -45], [-10, 35]
    ];

    treeCoords.forEach(([tx, tz]) => {
      this.buildCampusTree(tx, 0, tz);
    });

    this.buildStoneChessTable(-20, 0, 0);
  }

  private buildWashBasin(x: number, y: number, z: number) {
    const basinMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.9, roughness: 0.2 });

    const basin = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.9, 1.2), basinMat);
    basin.position.set(x, y + 0.45, z);
    basin.castShadow = true;
    this.scene.add(basin);
    this.addCollider(x - 3.1, x + 3.1, z - 0.7, z + 0.7, y, y + 1.2);

    for (let i = -2; i <= 2; i += 1.3) {
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), chromeMat);
      tap.position.set(x + i, y + 1.05, z);
      this.scene.add(tap);
    }
  }

  private buildRecyclingStation(x: number, y: number, z: number) {
    const binMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
    const trash = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.6, 2.0), binMat);
    trash.position.set(x, y + 0.8, z);
    trash.castShadow = true;
    this.scene.add(trash);
    this.addCollider(x - 1.6, x + 1.6, z - 1.1, z + 1.1, y, y + 1.8);

    const colors = [0xf1c40f, 0x3498db, 0xe74c3c];
    colors.forEach((c, idx) => {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 1.1, 12), new THREE.MeshLambertMaterial({ color: c }));
      can.position.set(x + 2.5 + idx * 1.0, y + 0.55, z);
      can.castShadow = true;
      this.scene.add(can);
      this.addCollider(x + 2.1 + idx * 1.0, x + 2.9 + idx * 1.0, z - 0.5, z + 0.5, y, y + 1.2);
    });
  }

  private buildCentralPlanter(x: number, y: number, z: number) {
    const brickMat = new THREE.MeshLambertMaterial({ color: 0xd35400 });
    const soilMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const flowerMat = new THREE.MeshLambertMaterial({ color: 0xe91e63 });

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 0.6, 24), brickMat);
    ring.position.set(x, y + 0.3, z);
    ring.castShadow = true;
    this.scene.add(ring);
    this.addCollider(x - 3.8, x + 3.8, z - 3.8, z + 3.8, y, y + 0.7);

    const soil = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.2, 24), soilMat);
    soil.position.set(x, y + 0.6, z);
    this.scene.add(soil);

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const fx = x + Math.cos(a) * 2.2;
      const fz = z + Math.sin(a) * 2.2;
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 1), flowerMat);
      bush.position.set(fx, y + 1.2, fz);
      bush.castShadow = true;
      this.scene.add(bush);
    }
  }

  private buildCampusTree(x: number, y: number, z: number) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x1b5e20 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 4.0, 8), trunkMat);
    trunk.position.set(x, y + 2.0, z);
    trunk.castShadow = true;
    this.scene.add(trunk);
    this.addCollider(x - 0.7, x + 0.7, z - 0.7, z + 0.7, y, y + 4.0);

    const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 1), foliageMat);
    foliage.position.set(x, y + 5.2, z);
    foliage.castShadow = true;
    this.scene.add(foliage);
  }

  private buildStoneChessTable(x: number, y: number, z: number) {
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xbdc3c7 });

    const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 1.6), stoneMat);
    table.position.set(x, y + 0.8, z);
    table.castShadow = true;
    this.scene.add(table);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8), stoneMat);
    base.position.set(x, y + 0.4, z);
    this.scene.add(base);
    this.addCollider(x - 0.9, x + 0.9, z - 0.9, z + 0.9, y, y + 1.0);

    [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]].forEach(([sx, sz]) => {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.45, 12), stoneMat);
      stool.position.set(x + sx, y + 0.225, z + sz);
      stool.castShadow = true;
      this.scene.add(stool);
      this.addCollider(x + sx - 0.4, x + sx + 0.4, z + sz - 0.4, z + sz + 0.4, y, y + 0.6);
    });
  }

  // 校園外圍圍牆與四面環繞環校馬路 (圍牆在校內邊界 Z: ±105, X: ±105，外側四面皆由環校馬路包圍)
  private buildBoundaryWalls() {
    const wallTex = CampusWorld.createWallBrickTexture('#bdc3c7', '#7f8c8d', 16, 2);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const wH = 3.2;
    const wT = 0.8;
    const campusSize = 105; // 學校圍牆邊界嚴格位於 ±105

    // A. 北側圍牆 (Z = -105)
    this.buildWall(0, wH / 2, -campusSize, campusSize * 2, wH, wT, wallMat);
    // B. 西側圍牆 (X = -105)
    this.buildWall(-campusSize, wH / 2, 0, wT, wH, campusSize * 2, wallMat);
    // C. 東側圍牆 (X = 105)
    this.buildWall(campusSize, wH / 2, 0, wT, wH, campusSize * 2, wallMat);

    // D. 南側圍牆 (Z = 105，中央留出 X: -9 ~ 9 供校門進出，嚴格對齊校門兩側石柱)
    const southWallLen = campusSize - 9; // 96m
    this.buildWall(-(campusSize + 9) / 2, wH / 2, campusSize, southWallLen, wH, wT, wallMat); // 左段 (X: -105 ~ -9)
    this.buildWall((campusSize + 9) / 2, wH / 2, campusSize, southWallLen, wH, wT, wallMat);  // 右段 (X: 9 ~ 105)

    // E. 圍牆外圍四面環校道路 (Ring Roads completely surrounding campus outside walls)
    const roadTex = CampusWorld.createAsphaltTexture(20, 2);
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x95a5a6 });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });
    const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 1. 南側外環大道 (校門外大街，強盜主要巡邏熱點)
    // 道路寬度 20m (Z: 108 ~ 128)，中心 Z = 118
    const southRoad = new THREE.Mesh(new THREE.PlaneGeometry(260, 20), roadMat);
    southRoad.rotation.x = -Math.PI / 2;
    southRoad.position.set(0, 0.02, 118);
    southRoad.receiveShadow = true;
    this.scene.add(southRoad);

    // 南側人行道 (圍牆 Z: 105 與馬路 Z: 108 之間 3m 人行道)
    const southWalk = new THREE.Mesh(new THREE.PlaneGeometry(260, 3), curbMat);
    southWalk.rotation.x = -Math.PI / 2;
    southWalk.position.set(0, 0.04, 106.5);
    southWalk.receiveShadow = true;
    this.scene.add(southWalk);

    // 南側雙黃線
    const sy1 = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.2), yellowLineMat);
    sy1.rotation.x = -Math.PI / 2;
    sy1.position.set(0, 0.03, 117.85);
    this.scene.add(sy1);
    const sy2 = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.2), yellowLineMat);
    sy2.rotation.x = -Math.PI / 2;
    sy2.position.set(0, 0.03, 118.15);
    this.scene.add(sy2);

    // 校門口正前方斑馬線 (Crosswalk outside school gate: Z 108 ~ 128, X: -4 ~ 4)
    for (let zi = 109; zi <= 127; zi += 1.4) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.65), whiteLineMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.035, zi);
      this.scene.add(stripe);
    }

    // 2. 北側外環道路 (北圍牆 Z: -105 之外，Z: -128 ~ -108，中心 Z = -118)
    const northRoad = new THREE.Mesh(new THREE.PlaneGeometry(260, 20), roadMat);
    northRoad.rotation.x = -Math.PI / 2;
    northRoad.position.set(0, 0.02, -118);
    northRoad.receiveShadow = true;
    this.scene.add(northRoad);

    const northWalk = new THREE.Mesh(new THREE.PlaneGeometry(260, 3), curbMat);
    northWalk.rotation.x = -Math.PI / 2;
    northWalk.position.set(0, 0.04, -106.5);
    northWalk.receiveShadow = true;
    this.scene.add(northWalk);

    const ny1 = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.2), yellowLineMat);
    ny1.rotation.x = -Math.PI / 2;
    ny1.position.set(0, 0.03, -117.85);
    this.scene.add(ny1);
    const ny2 = new THREE.Mesh(new THREE.PlaneGeometry(260, 0.2), yellowLineMat);
    ny2.rotation.x = -Math.PI / 2;
    ny2.position.set(0, 0.03, -118.15);
    this.scene.add(ny2);

    // 3. 西側外環道路 (西圍牆 X: -105 之外，X: -128 ~ -108，中心 X = -118)
    const westRoad = new THREE.Mesh(new THREE.PlaneGeometry(20, 260), roadMat);
    westRoad.rotation.x = -Math.PI / 2;
    westRoad.position.set(-118, 0.02, 0);
    westRoad.receiveShadow = true;
    this.scene.add(westRoad);

    const westWalk = new THREE.Mesh(new THREE.PlaneGeometry(3, 260), curbMat);
    westWalk.rotation.x = -Math.PI / 2;
    westWalk.position.set(-106.5, 0.04, 0);
    westWalk.receiveShadow = true;
    this.scene.add(westWalk);

    const wy1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 260), yellowLineMat);
    wy1.rotation.x = -Math.PI / 2;
    wy1.position.set(-117.85, 0.03, 0);
    this.scene.add(wy1);
    const wy2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 260), yellowLineMat);
    wy2.rotation.x = -Math.PI / 2;
    wy2.position.set(-118.15, 0.03, 0);
    this.scene.add(wy2);

    // 4. 東側外環道路 (東圍牆 X: 105 之外，X: 108 ~ 128，中心 X = 118)
    const eastRoad = new THREE.Mesh(new THREE.PlaneGeometry(20, 260), roadMat);
    eastRoad.rotation.x = -Math.PI / 2;
    eastRoad.position.set(118, 0.02, 0);
    eastRoad.receiveShadow = true;
    this.scene.add(eastRoad);

    const eastWalk = new THREE.Mesh(new THREE.PlaneGeometry(3, 260), curbMat);
    eastWalk.rotation.x = -Math.PI / 2;
    eastWalk.position.set(106.5, 0.04, 0);
    eastWalk.receiveShadow = true;
    this.scene.add(eastWalk);

    const ey1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 260), yellowLineMat);
    ey1.rotation.x = -Math.PI / 2;
    ey1.position.set(117.85, 0.03, 0);
    this.scene.add(ey1);
    const ey2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 260), yellowLineMat);
    ey2.rotation.x = -Math.PI / 2;
    ey2.position.set(118.15, 0.03, 0);
    this.scene.add(ey2);
  }

  // 13. 演藝大樓 (1~3F 打通挑高國際演藝大禮堂，4F 為專業室內羽球館)
  public buildPerformingArtsBuilding(baseX: number, baseY: number, baseZ: number) {
    const wallTex = CampusWorld.createWallBrickTexture('#f5f6fa', '#bdc3c7', 8, 4);
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const woodFloorTex = CampusWorld.createTileTexture('#d35400', '#ba4a00', 8, 8);
    const stageFloorMat = new THREE.MeshLambertMaterial({ map: woodFloorTex });
    const redVelvetMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.7, roughness: 0.3 });

    const bW = 24; // X: 62 ~ 86
    const bL = 32; // Z: 22 ~ 54

    const minX = baseX - bW / 2; // 62
    const maxX = baseX + bW / 2; // 86
    const minZ = baseZ - bL / 2; // 22
    const maxZ = baseZ + bL / 2; // 54

    // 1. 一樓演藝廳地坪
    const gFloor = new THREE.Mesh(new THREE.PlaneGeometry(bW, bL), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    gFloor.rotation.x = -Math.PI / 2;
    gFloor.position.set(baseX, 0.02, baseZ);
    gFloor.receiveShadow = true;
    this.scene.add(gFloor);

    // 2. 1~3F 挑高外牆 (Y: 0 ~ 12.0)
    const wH = 12.0;
    // 北牆 (Stage 背後全封閉)
    this.buildWall(baseX, wH / 2, minZ, bW, wH, 0.6, wallMat);
    // 東牆 (外側全封閉)
    this.buildWall(maxX, wH / 2, baseZ, 0.6, wH, bL, wallMat);

    // 西牆：留出西側宏偉迎賓大正門開口 (X: 62, Z: 34 ~ 42，寬度 8.0m)
    const westL1 = (34 - minZ); // 12m
    this.buildWall(minX, wH / 2, minZ + westL1 / 2, 0.6, wH, westL1, wallMat);
    const westL2 = (maxZ - 42); // 12m
    this.buildWall(minX, wH / 2, 42 + westL2 / 2, 0.6, wH, westL2, wallMat);

    // 南牆 (Solid South Wall：單一連續封閉實體隔音大牆，徹底封閉南側，營造電影院專屬暗房沉浸感)
    this.buildWall(baseX, wH / 2, maxZ, bW, wH, 0.6, wallMat);

    // =========================================================================
    // 西側正門宏偉門面系統 (Grand West Entrance: Door 3.2m < Canopy 3.4m < Sign 5.6m)
    // =========================================================================
    // A. 門楣上方實體外牆與碰撞體 (Y: 3.2m ~ 12.0m，高 8.8m，杜絕門口上方穿牆)
    this.buildWall(minX, 7.6, 38, 0.6, 8.8, 8.0, wallMat);

    // B. 大門開口規範高度為 doorHeight = 3.2m (開口 Y: 0 ~ 3.2m，遠低於招牌 Y: 5.6m)
    const doorHeight = 3.2;
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.8, roughness: 0.25 });
    const doorGlassMat = new THREE.MeshLambertMaterial({ color: 0x81ecec, transparent: true, opacity: 0.45 });
    const doorGoldMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.9, roughness: 0.2 });

    // 1. 西側宏偉金屬門框 (頂部金屬橫樑 + 兩側門框柱 + 落地窗立挺)
    const westTransomBeam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 8.0), doorFrameMat);
    westTransomBeam.position.set(minX, 3.12, 38);
    westTransomBeam.castShadow = true;
    this.scene.add(westTransomBeam);

    const westJambL = new THREE.Mesh(new THREE.BoxGeometry(0.3, doorHeight, 0.2), doorFrameMat);
    westJambL.position.set(minX, doorHeight / 2, 34.1);
    this.scene.add(westJambL);

    const westJambR = new THREE.Mesh(new THREE.BoxGeometry(0.3, doorHeight, 0.2), doorFrameMat);
    westJambR.position.set(minX, doorHeight / 2, 41.9);
    this.scene.add(westJambR);

    // 中間金屬立挺 (劃分中央 3.8m 雙開通道與兩側 2.1m 固定落地採光窗)
    const westMullionL = new THREE.Mesh(new THREE.BoxGeometry(0.24, doorHeight, 0.16), doorFrameMat);
    westMullionL.position.set(minX, doorHeight / 2, 36.1);
    this.scene.add(westMullionL);

    const westMullionR = new THREE.Mesh(new THREE.BoxGeometry(0.24, doorHeight, 0.16), doorFrameMat);
    westMullionR.position.set(minX, doorHeight / 2, 39.9);
    this.scene.add(westMullionR);

    // 2. 兩側固定採光玻璃側窗 (Fixed Sidelights & Colliders)
    const westSideGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.9, 1.8), doorGlassMat);
    westSideGlassL.position.set(minX, 1.55, 35.1);
    this.scene.add(westSideGlassL);
    const westSideSillL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 1.8), doorFrameMat);
    westSideSillL.position.set(minX, 0.06, 35.1);
    this.scene.add(westSideSillL);
    this.addCollider(minX - 0.2, minX + 0.2, 34.0, 36.1, 0, doorHeight);

    const westSideGlassR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.9, 1.8), doorGlassMat);
    westSideGlassR.position.set(minX, 1.55, 40.9);
    this.scene.add(westSideGlassR);
    const westSideSillR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 1.8), doorFrameMat);
    westSideSillR.position.set(minX, 0.06, 40.9);
    this.scene.add(westSideSillR);
    this.addCollider(minX - 0.2, minX + 0.2, 39.9, 42.0, 0, doorHeight);

    // 3. 中央雙開透明玻璃大門 (附帶精緻金屬框與金色拉手，向室內大開迎賓，暢通無阻)
    const doorLeafW = 1.75;
    const doorLeafH = 3.0;

    // 左扇玻璃大門 (鉸鏈 Z: 36.2，向室內 +X 敞開 ~66度)
    const westDoorLGroup = new THREE.Group();
    westDoorLGroup.position.set(minX, 0, 36.2);
    westDoorLGroup.rotation.y = 1.15;

    const dFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorLeafH, 0.12), doorFrameMat);
    dFrameL.position.set(0, doorLeafH / 2, doorLeafW - 0.06);
    westDoorLGroup.add(dFrameL);
    const dFrameLHinge = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorLeafH, 0.12), doorFrameMat);
    dFrameLHinge.position.set(0, doorLeafH / 2, 0.06);
    westDoorLGroup.add(dFrameLHinge);
    const dTopL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, doorLeafW), doorFrameMat);
    dTopL.position.set(0, doorLeafH - 0.06, doorLeafW / 2);
    westDoorLGroup.add(dTopL);
    const dBottomL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, doorLeafW), doorFrameMat);
    dBottomL.position.set(0, 0.09, doorLeafW / 2);
    westDoorLGroup.add(dBottomL);

    const dGlassL = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorLeafH - 0.3, doorLeafW - 0.24), doorGlassMat);
    dGlassL.position.set(0, (doorLeafH + 0.06) / 2, doorLeafW / 2);
    westDoorLGroup.add(dGlassL);

    const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 16);
    const handleLOut = new THREE.Mesh(handleGeo, doorGoldMat);
    handleLOut.position.set(-0.06, 1.35, doorLeafW - 0.2);
    westDoorLGroup.add(handleLOut);
    const handleLIn = new THREE.Mesh(handleGeo, doorGoldMat);
    handleLIn.position.set(0.06, 1.35, doorLeafW - 0.2);
    westDoorLGroup.add(handleLIn);
    this.scene.add(westDoorLGroup);

    // 右扇玻璃大門 (鉸鏈 Z: 39.8，向室內 +X 敞開 ~66度)
    const westDoorRGroup = new THREE.Group();
    westDoorRGroup.position.set(minX, 0, 39.8);
    westDoorRGroup.rotation.y = -1.15;

    const dFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorLeafH, 0.12), doorFrameMat);
    dFrameR.position.set(0, doorLeafH / 2, -doorLeafW + 0.06);
    westDoorRGroup.add(dFrameR);
    const dFrameRHinge = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorLeafH, 0.12), doorFrameMat);
    dFrameRHinge.position.set(0, doorLeafH / 2, -0.06);
    westDoorRGroup.add(dFrameRHinge);
    const dTopR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, doorLeafW), doorFrameMat);
    dTopR.position.set(0, doorLeafH - 0.06, -doorLeafW / 2);
    westDoorRGroup.add(dTopR);
    const dBottomR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, doorLeafW), doorFrameMat);
    dBottomR.position.set(0, 0.09, -doorLeafW / 2);
    westDoorRGroup.add(dBottomR);

    const dGlassR = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorLeafH - 0.3, doorLeafW - 0.24), doorGlassMat);
    dGlassR.position.set(0, (doorLeafH + 0.06) / 2, -doorLeafW / 2);
    westDoorRGroup.add(dGlassR);

    const handleROut = new THREE.Mesh(handleGeo, doorGoldMat);
    handleROut.position.set(-0.06, 1.35, -doorLeafW + 0.2);
    westDoorRGroup.add(handleROut);
    const handleRIn = new THREE.Mesh(handleGeo, doorGoldMat);
    handleRIn.position.set(0.06, 1.35, -doorLeafW + 0.2);
    westDoorRGroup.add(handleRIn);
    this.scene.add(westDoorRGroup);

    // 4. 西側正門迎賓雨遮 (Canopy: 精確調整高度至 Y = 3.4m，剛好位於大門 3.2m 上方、招牌 5.6m 下方)
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 9.0), canopyMat);
    canopy.position.set(minX - 1.2, 3.4, 38);
    canopy.castShadow = true;
    this.scene.add(canopy);

    const rodMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, metalness: 0.8, roughness: 0.2 });
    [-3.8, 3.8].forEach(oz => {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), rodMat);
      bracket.position.set(minX - 0.8, 3.24, 38 + oz);
      bracket.rotation.z = -0.3;
      this.scene.add(bracket);
    });

    const redCarpet = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 7.6), new THREE.MeshLambertMaterial({ color: 0x9b59b6 }));
    redCarpet.rotation.x = -Math.PI / 2;
    redCarpet.position.set(minX - 0.5, 0.03, 38);
    this.scene.add(redCarpet);

    // =========================================================================
    // 3. 專屬頂級電影劇院 (1~3F Exclusive Cinema Theater)
    // =========================================================================
    // A. 舞台大平台 (位於東北側 X: 70 ~ 85, Z: 23 ~ 29, 高度 Y = 1.0)
    const stageW = 15;
    const stageL = 6;
    const stageH = 1.0;
    const stage = new THREE.Mesh(new THREE.BoxGeometry(stageW, stageH, stageL), stageFloorMat);
    stage.position.set(baseX + 3.5, stageH / 2, minZ + stageL / 2 + 1.2);
    stage.receiveShadow = true;
    stage.castShadow = true;
    this.scene.add(stage);
    this.addFloorSlab(baseX + 3.5 - stageW / 2, baseX + 3.5 + stageW / 2, minZ + 1.2, minZ + stageL + 1.2, stageH);

    // 舞台台階 (Stage front stairs: Z: 29.2 ~ 30.0)
    const step = new THREE.Mesh(new THREE.BoxGeometry(stageW, 0.5, 0.8), stageFloorMat);
    step.position.set(baseX + 3.5, 0.25, minZ + stageL + 1.6);
    this.scene.add(step);
    this.addFloorSlab(baseX + 3.5 - stageW / 2, baseX + 3.5 + stageW / 2, minZ + stageL + 1.2, minZ + stageL + 2.0, 0.5);

    // B. 電影巨幕 (Cinema Giant Projection Screen: 16:9 豪華 IMAX 規格大銀幕)
    const screenCenter = new THREE.Vector3(baseX + 3.5, 5.2, minZ + 1.8);
    const screenFrameMat = new THREE.MeshStandardMaterial({ color: 0x0f141c, roughness: 0.9 });
    const screenWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf8f9fa });

    // 1. 深黑金屬吸光巨幕外框 (寬 11.5m, 高 6.5m, 厚 0.18m)
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(11.5, 6.5, 0.18), screenFrameMat);
    screenFrame.position.copy(screenCenter);
    screenFrame.castShadow = true;
    this.scene.add(screenFrame);

    // 2. 純白微珠光漫反射銀幕面 (寬 10.9m, 高 6.13m, 貼合於外框前表面)
    const screenFace = new THREE.Mesh(new THREE.PlaneGeometry(10.9, 6.13), screenWhiteMat);
    screenFace.position.set(screenCenter.x, screenCenter.y, screenCenter.z + 0.092);
    this.scene.add(screenFace);

    // 3. 劇院紅絲絨垂簾系統 (側簾、橫楣簾與下簾環繞銀幕)
    const curtainGeo = new THREE.BoxGeometry(2.2, 8.5, 0.35);
    const curtainL = new THREE.Mesh(curtainGeo, redVelvetMat);
    curtainL.position.set(baseX + 3.5 - 5.75 - 0.7, stageH + 4.25, minZ + 1.85);
    this.scene.add(curtainL);
    const curtainR = new THREE.Mesh(curtainGeo, redVelvetMat);
    curtainR.position.set(baseX + 3.5 + 5.75 + 0.7, stageH + 4.25, minZ + 1.85);
    this.scene.add(curtainR);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(stageW, 1.4, 0.4), redVelvetMat);
    valance.position.set(baseX + 3.5, stageH + 8.2, minZ + 1.85);
    this.scene.add(valance);
    const valanceBottom = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.8, 0.25), redVelvetMat);
    valanceBottom.position.set(baseX + 3.5, stageH + 0.4, minZ + 1.85);
    this.scene.add(valanceBottom);

    // 4. 舞台銀幕排燈系統 (頂部下照式筒燈與底部微型腳燈)
    const lightFixtureMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff275 });
    for (let lx = -4.8; lx <= 4.8; lx += 1.6) {
      // 頂部吸光排燈燈筒與柔光球
      const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 12), lightFixtureMat);
      lampHousing.position.set(screenCenter.x + lx, screenCenter.y + 3.25, screenCenter.z + 0.15);
      this.scene.add(lampHousing);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), bulbMat);
      bulb.position.set(screenCenter.x + lx, screenCenter.y + 3.17, screenCenter.z + 0.15);
      this.scene.add(bulb);

      // 舞台前方微型條燈
      const footFixture = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), lightFixtureMat);
      footFixture.position.set(screenCenter.x + lx, stageH + 0.04, minZ + 2.0);
      this.scene.add(footFixture);

      const footBulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), bulbMat);
      footBulb.position.set(screenCenter.x + lx, stageH + 0.08, minZ + 2.0);
      this.scene.add(footBulb);
    }

    // C. 舞台三腳大鋼琴 (移至左側翼側，不遮擋中央 16:9 電影巨幕)
    const pianoGroup = new THREE.Group();
    pianoGroup.position.set(baseX - 2.2, stageH, minZ + 3.8);
    const pianoMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.8 });
    const pianoBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 2.2), pianoMat);
    pianoBody.position.y = 0.8;
    pianoGroup.add(pianoBody);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    keys.position.set(0, 0.85, 1.15);
    pianoGroup.add(keys);
    [[-0.8, -0.8], [0.8, -0.8], [0, 0.8]].forEach(([px, pz]) => {
      const pLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.8, 8), pianoMat);
      pLeg.position.set(px, 0.4, pz);
      pianoGroup.add(pLeg);
    });
    this.scene.add(pianoGroup);

    // D. 演講司儀講台 (移至右側翼側，維持舞台功能與視野開闊)
    const podium = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.8), new THREE.MeshLambertMaterial({ color: 0x5d4037 }));
    podium.position.set(baseX + 9.5, stageH + 0.55, minZ + 3.8);
    this.scene.add(podium);

    // E. 高級電影院看台座椅 (Luxury Cinema Seats with Armrests, Cup Holders, Headrests & Aisle Guide Lights)
    const cinemaVelvetMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 }); // 酒紅色絲絨厚沙發
    const cinemaArmMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.5, metalness: 0.6 }); // 深灰金屬/黑塑料扶手
    const cupHolderMat = new THREE.MeshStandardMaterial({ color: 0x0f141c, roughness: 0.8, metalness: 0.3 }); // 杯架
    const cupDrinkMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c }); // 電影院飲料紙杯
    const stepLightMat = new THREE.MeshBasicMaterial({ color: 0x00cec9, transparent: true, opacity: 0.9 }); // 階梯冰藍導引燈

    const seatW = 0.58;
    const seatD = 0.50;

    for (let row = 0; row < 4; row++) {
      const rowZ = 34 + row * 4.2;
      const rowY = row * 0.35;
      const floorY = rowY + 0.35;
      const riserW = 12.0;

      // 階梯地坪 (東側半區)
      const riser = new THREE.Mesh(new THREE.BoxGeometry(riserW, 0.35, 3.8), new THREE.MeshLambertMaterial({ color: 0x34495e }));
      riser.position.set(baseX + 4.5, rowY + 0.175, rowZ);
      this.scene.add(riser);
      this.addFloorSlab(baseX + 4.5 - riserW / 2, baseX + 4.5 + riserW / 2, rowZ - 1.9, rowZ + 1.9, floorY);

      // 階梯看台邊緣微型柔和地腳導引地燈 (Aisle Guide Lights)
      // 中央走道踏階導引燈條
      const aisleStepLight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.025, 0.05), stepLightMat);
      aisleStepLight.position.set(baseX + 4.7, floorY + 0.01, rowZ - 1.88);
      this.scene.add(aisleStepLight);
      // 西側走道踏階導引燈條
      const westAisleLight = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.05), stepLightMat);
      westAisleLight.position.set(baseX - 1.05, floorY + 0.01, rowZ - 1.88);
      this.scene.add(westAisleLight);

      // 階梯立面圓形導引地燈
      [baseX - 1.4, baseX + 3.7, baseX + 5.7].forEach(px => {
        const puckHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), cinemaArmMat);
        puckHousing.rotation.x = Math.PI / 2;
        puckHousing.position.set(px, rowY + 0.175, rowZ - 1.91);
        this.scene.add(puckHousing);

        const puckLens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.035, 16), stepLightMat);
        puckLens.rotation.x = Math.PI / 2;
        puckLens.position.set(px, rowY + 0.175, rowZ - 1.915);
        this.scene.add(puckLens);
      });

      // 建立高級電影院座椅構造函數
      const buildCinemaSeat = (chairX: number, seatIndex: number) => {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(chairX, floorY, rowZ);

        // 1. 金屬支撐基座與腳座
        const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), cinemaArmMat);
        pedestal.position.set(0, 0.11, 0);
        chairGroup.add(pedestal);
        const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.24), cinemaArmMat);
        basePlate.position.set(0, 0.015, 0);
        chairGroup.add(basePlate);

        // 2. 影院厚沙發坐墊 (紅絲絨軟墊，厚度 0.16m，寬度 seatW)
        const cushion = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.16, seatD), cinemaVelvetMat);
        cushion.position.set(0, 0.30, -0.02);
        cushion.castShadow = true;
        cushion.receiveShadow = true;
        chairGroup.add(cushion);

        // 3. 人體工學高椅背與頭枕 (高約 0.72m，頂部微突出頭枕，微幅後傾 0.1 rad)
        const backrestGroup = new THREE.Group();
        backrestGroup.position.set(0, 0.32, 0.16);
        backrestGroup.rotation.x = 0.1; // 微幅後傾 0.1 rad

        // 主椅背 (高 0.54m, 厚 0.14m)
        const backMesh = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.54, 0.14), cinemaVelvetMat);
        backMesh.position.set(0, 0.27, 0);
        backMesh.castShadow = true;
        backrestGroup.add(backMesh);
        // 後背防踢外殼
        const backShell = new THREE.Mesh(new THREE.BoxGeometry(seatW + 0.01, 0.55, 0.03), cinemaArmMat);
        backShell.position.set(0, 0.27, 0.07);
        backrestGroup.add(backShell);

        // 頂部突出頭枕 (高 0.18m, 厚 0.18m，總高約 0.72m)
        const headrest = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.04, 0.18, 0.18), cinemaVelvetMat);
        headrest.position.set(0, 0.63, -0.02);
        headrest.castShadow = true;
        backrestGroup.add(headrest);
        const headrestBack = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.02, 0.18, 0.03), cinemaArmMat);
        headrestBack.position.set(0, 0.63, 0.07);
        backrestGroup.add(headrestBack);

        chairGroup.add(backrestGroup);

        // 4. 兩側杯架扶手 (Armrests with Cup Holders)
        [-seatW / 2 - 0.035, seatW / 2 + 0.035].forEach((ax, armIdx) => {
          // 扶手立柱
          const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.08), cinemaArmMat);
          armPost.position.set(ax, 0.33, 0);
          chairGroup.add(armPost);
          // 扶手軟面
          const armPad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.36), cinemaArmMat);
          armPad.position.set(ax, 0.46, 0.02);
          chairGroup.add(armPad);
          // 扶手前端小圓杯架
          const cupHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.06, 16), cupHolderMat);
          cupHolder.position.set(ax, 0.46, -0.19);
          chairGroup.add(cupHolder);

          // 部分扶手放有電影院紙杯與吸管
          if ((seatIndex + armIdx + row) % 3 === 0) {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.10, 12), cupDrinkMat);
            cup.position.set(ax, 0.52, -0.19);
            chairGroup.add(cup);
            const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 8), bulbMat);
            straw.position.set(ax + 0.01, 0.58, -0.19);
            straw.rotation.z = 0.2;
            chairGroup.add(straw);
          }
        });

        this.scene.add(chairGroup);
      };

      // 看台座椅 (留出中間走道，每排兩側各有 4 張高級電影院沙發座椅)
      for (let s = 0; s < 4; s++) {
        buildCinemaSeat(baseX + 0.2 + s * 1.0, s);
      }
      for (let s = 0; s < 4; s++) {
        buildCinemaSeat(baseX + 6.2 + s * 1.0, s + 4);
      }
    }

    // F. 大禮堂挑高橫樑與舞台探照燈 (Truss & Stage Lights at Y = 11.2)
    const truss = new THREE.Mesh(new THREE.BoxGeometry(stageW, 0.4, 0.4), metalMat);
    truss.position.set(baseX + 3.5, 11.2, minZ + 4.5);
    this.scene.add(truss);

    // 4. ⚡ 演藝大樓直達景觀電梯塔 (1F ~ 4F 現代化外牆鋼構井道、精緻門廳與電動滑動門)
    // ----------------------------------------------------------------------------------
    // 原西北側舊多段樓梯已全數拆除，西側視野通透敞亮，由現代感高科技景觀直達電梯貫穿 1F~4F
    const shaftFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.85, roughness: 0.25 });
    const shaftPanelMat = new THREE.MeshStandardMaterial({ color: 0x2f3640, metalness: 0.75, roughness: 0.35 });
    const shaftSteelMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.9, roughness: 0.15 });
    const shaftGlassMat = new THREE.MeshLambertMaterial({ color: 0x00cec9, transparent: true, opacity: 0.38 });
    const liftDoorMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.9, roughness: 0.18 });
    const liftRingMat = new THREE.MeshBasicMaterial({ color: 0x00cec9, transparent: true, opacity: 0.85 });
    const buttonPlateMat = new THREE.MeshStandardMaterial({ color: 0x718093, metalness: 0.85, roughness: 0.2 });
    const btnActiveMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3 });
    const btnDownMat = new THREE.MeshBasicMaterial({ color: 0xff7675 });
    const handrailMat = new THREE.MeshStandardMaterial({ color: 0xf5f6fa, metalness: 0.95, roughness: 0.1 });

    // A. 井道主結構鋼柱 (貫穿 1F 地面 Y: 0.0 至 4F 屋頂 Y: 16.5，四角立體鋼骨框架)
    const shaftH = 16.5;
    const shaftMidY = shaftH / 2; // 8.25
    const columnGeo = new THREE.BoxGeometry(0.24, shaftH, 0.24);
    // 四根立體鋼骨角柱 (NW, NE, SW, SE)
    [
      [63.7, 42.1],
      [67.3, 42.1],
      [63.7, 45.1],
      [67.3, 45.1]
    ].forEach(([cx, cz]) => {
      const col = new THREE.Mesh(columnGeo, shaftSteelMat);
      col.position.set(cx, shaftMidY, cz);
      col.castShadow = true;
      this.scene.add(col);
    });

    // B. 西側外牆 (X: 63.7，從 1F Y: 0 至 4F Y: 16.5m，採光觀景透視幕牆)
    // 觀光玻璃大面帷幕窗
    const westGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, shaftH - 0.5, 2.76), shaftGlassMat);
    westGlass.position.set(63.7, shaftMidY, 43.6);
    this.scene.add(westGlass);
    // 西側中間結構立挺
    const westMullion = new THREE.Mesh(new THREE.BoxGeometry(0.14, shaftH, 0.1), shaftFrameMat);
    westMullion.position.set(63.7, shaftMidY, 43.6);
    this.scene.add(westMullion);
    // 西側橫向結構分層飾條 (在 1F頂 3.2m、中段 6.0m/9.0m、4F底 12.0m、4F頂 15.0m)
    [3.2, 6.0, 9.0, 12.0, 15.0].forEach(yPos => {
      const transom = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 2.9), shaftSteelMat);
      transom.position.set(63.7, yPos, 43.6);
      this.scene.add(transom);
    });
    // 西外牆完整碰撞體 (防穿牆進入井道)
    this.addCollider(63.55, 63.85, 42.0, 45.2, 0, 16.5);

    // C. 東側外牆 (X: 67.3，面向挑高演藝大禮堂與觀眾席，全透視景觀幕牆)
    const eastGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, shaftH - 0.5, 2.76), shaftGlassMat);
    eastGlass.position.set(67.3, shaftMidY, 43.6);
    this.scene.add(eastGlass);
    const eastMullion = new THREE.Mesh(new THREE.BoxGeometry(0.14, shaftH, 0.1), shaftFrameMat);
    eastMullion.position.set(67.3, shaftMidY, 43.6);
    this.scene.add(eastMullion);
    [3.2, 6.0, 9.0, 12.0, 15.0].forEach(yPos => {
      const transom = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 2.9), shaftSteelMat);
      transom.position.set(67.3, yPos, 43.6);
      this.scene.add(transom);
    });
    // 東外牆完整碰撞體
    this.addCollider(67.15, 67.45, 42.0, 45.2, 0, 16.5);

    // D. 南側後外牆 (Z: 45.1，全金屬封閉壁板與配重滑軌通道，Y: 0 ~ 16.5m)
    const southWallMesh = new THREE.Mesh(new THREE.BoxGeometry(3.36, shaftH, 0.2), shaftPanelMat);
    southWallMesh.position.set(65.5, shaftMidY, 45.05);
    southWallMesh.castShadow = true;
    this.scene.add(southWallMesh);
    // 南後牆垂直金屬導軌飾條
    [-0.9, 0, 0.9].forEach(ox => {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, shaftH, 0.06), shaftSteelMat);
      rib.position.set(65.5 + ox, shaftMidY, 44.92);
      this.scene.add(rib);
    });
    // 南外牆完整碰撞體
    this.addCollider(63.6, 67.4, 44.95, 45.25, 0, 16.5);

    // E. 井道內部工程細節 (鋼導軌、牽引鋼纜、配重架，從玻璃外可見逼真內部細節)
    // 兩側主垂直鋼導軌 (Y: 0 ~ 16.5m)
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.08, shaftH, 0.08), shaftSteelMat);
    railL.position.set(63.95, shaftMidY, 43.5);
    this.scene.add(railL);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.08, shaftH, 0.08), shaftSteelMat);
    railR.position.set(67.05, shaftMidY, 43.5);
    this.scene.add(railR);
    // 牽引鋼纜
    [-0.2, 0.2].forEach(ox => {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, shaftH, 8), shaftSteelMat);
      cable.position.set(65.5 + ox, shaftMidY, 43.5);
      this.scene.add(cable);
    });
    // 配重架 (懸掛在後側滑軌)
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), shaftFrameMat);
    counterweight.position.set(65.5, 7.5, 44.75);
    this.scene.add(counterweight);

    // 頂部機房蓋板 (Y = 16.5)
    const shaftTopCap = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.3, 3.2), shaftFrameMat);
    shaftTopCap.position.set(65.5, 16.55, 43.6);
    this.scene.add(shaftTopCap);

    // F. 北側正面牆、挑高幕牆與 1F/4F 門廳開口 (Z: 42.1)
    // 1. 中間 2F~3F 挑高景觀帷幕牆 (Y: 3.2 ~ 12.0，面向演藝廳西門廳，透視整座升降井道)
    const midGlass = new THREE.Mesh(new THREE.BoxGeometry(3.36, 8.8, 0.06), shaftGlassMat);
    midGlass.position.set(65.5, 7.6, 42.1);
    this.scene.add(midGlass);
    [6.0, 9.0].forEach(yPos => {
      const midTransom = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.16, 0.14), shaftSteelMat);
      midTransom.position.set(65.5, yPos, 42.1);
      this.scene.add(midTransom);
    });
    this.addCollider(63.6, 67.4, 42.0, 42.3, 3.2, 12.0);

    // 2. 4F 頂部封閉牆 (Y: 15.2 ~ 16.5)
    const topWallMesh = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.3, 0.2), shaftPanelMat);
    topWallMesh.position.set(65.5, 15.85, 42.1);
    this.scene.add(topWallMesh);
    this.addCollider(63.6, 67.4, 42.0, 42.3, 15.2, 16.5);

    // 3. 1F 門廳結構 (Y: 0.0 ~ 3.2，留出門口 X: 64.75 ~ 66.25, 寬 1.5m, 高 2.65m)
    // 左側立柱外牆 (X: 63.7 ~ 64.75)
    const wall1FL = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.2, 0.2), shaftPanelMat);
    wall1FL.position.set(64.22, 1.6, 42.1);
    this.scene.add(wall1FL);
    this.addCollider(63.6, 64.75, 42.0, 42.3, 0.0, 3.2);
    // 右側立柱外牆 (X: 66.25 ~ 67.3)
    const wall1FR = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.2, 0.2), shaftPanelMat);
    wall1FR.position.set(66.78, 1.6, 42.1);
    this.scene.add(wall1FR);
    this.addCollider(66.25, 67.4, 42.0, 42.3, 0.0, 3.2);
    // 門楣上方樑 (Y: 2.65 ~ 3.2)
    const beam1F = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.2), shaftPanelMat);
    beam1F.position.set(65.5, 2.925, 42.1);
    this.scene.add(beam1F);
    this.addCollider(64.75, 66.25, 42.0, 42.3, 2.65, 3.2);

    // 1F 不鏽鋼門框 (Architrave Portal Frame)
    const frameJambGeo = new THREE.BoxGeometry(0.1, 2.7, 0.12);
    const jamb1FL = new THREE.Mesh(frameJambGeo, shaftSteelMat);
    jamb1FL.position.set(64.72, 1.35, 42.06);
    this.scene.add(jamb1FL);
    const jamb1FR = new THREE.Mesh(frameJambGeo, shaftSteelMat);
    jamb1FR.position.set(66.28, 1.35, 42.06);
    this.scene.add(jamb1FR);
    const frameHead1F = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.1, 0.12), shaftSteelMat);
    frameHead1F.position.set(65.5, 2.7, 42.06);
    this.scene.add(frameHead1F);
    // 1F 不鏽鋼門檻踏板
    const thresh1F = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.22), shaftSteelMat);
    thresh1F.position.set(65.5, 0.01, 42.2);
    this.scene.add(thresh1F);

    // 4. 4F 門廳結構 (Y: 12.0 ~ 15.2，留出門口 X: 64.75 ~ 66.25, 寬 1.5m, 高 2.65m)
    // 左側立柱外牆
    const wall4FL = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.2, 0.2), shaftPanelMat);
    wall4FL.position.set(64.22, 13.6, 42.1);
    this.scene.add(wall4FL);
    this.addCollider(63.6, 64.75, 42.0, 42.3, 12.0, 15.2);
    // 右側立柱外牆
    const wall4FR = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.2, 0.2), shaftPanelMat);
    wall4FR.position.set(66.78, 13.6, 42.1);
    this.scene.add(wall4FR);
    this.addCollider(66.25, 67.4, 42.0, 42.3, 12.0, 15.2);
    // 門楣上方樑 (Y: 14.65 ~ 15.2)
    const beam4F = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.2), shaftPanelMat);
    beam4F.position.set(65.5, 14.925, 42.1);
    this.scene.add(beam4F);
    this.addCollider(64.75, 66.25, 42.0, 42.3, 14.65, 15.2);

    // 4F 不鏽鋼門框
    const jamb4FL = new THREE.Mesh(frameJambGeo, shaftSteelMat);
    jamb4FL.position.set(64.72, 13.35, 42.06);
    this.scene.add(jamb4FL);
    const jamb4FR = new THREE.Mesh(frameJambGeo, shaftSteelMat);
    jamb4FR.position.set(66.28, 13.35, 42.06);
    this.scene.add(jamb4FR);
    const frameHead4F = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.1, 0.12), shaftSteelMat);
    frameHead4F.position.set(65.5, 14.7, 42.06);
    this.scene.add(frameHead4F);
    // 4F 不鏽鋼門檻踏板
    const thresh4F = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.22), shaftSteelMat);
    thresh4F.position.set(65.5, 12.01, 42.2);
    this.scene.add(thresh4F);

    // G. 呼叫按鈕面板 (Call Buttons Panel: 1F 與 4F 右側立柱)
    // 1F 按鈕面板 (上樓按鈕發亮)
    const btnBox1F = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.03), buttonPlateMat);
    btnBox1F.position.set(66.52, 1.35, 41.98);
    this.scene.add(btnBox1F);
    const btnUp1F = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 16), btnActiveMat);
    btnUp1F.rotation.x = Math.PI / 2;
    btnUp1F.position.set(66.52, 1.43, 41.96);
    this.scene.add(btnUp1F);
    const btnDown1F = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 16), shaftPanelMat);
    btnDown1F.rotation.x = Math.PI / 2;
    btnDown1F.position.set(66.52, 1.27, 41.96);
    this.scene.add(btnDown1F);

    // 4F 按鈕面板 (下樓按鈕發亮)
    const btnBox4F = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.03), buttonPlateMat);
    btnBox4F.position.set(66.52, 13.35, 41.98);
    this.scene.add(btnBox4F);
    const btnUp4F = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 16), shaftPanelMat);
    btnUp4F.rotation.x = Math.PI / 2;
    btnUp4F.position.set(66.52, 13.43, 41.96);
    this.scene.add(btnUp4F);
    const btnDown4F = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 16), btnDownMat);
    btnDown4F.rotation.x = Math.PI / 2;
    btnDown4F.position.set(66.52, 13.27, 41.96);
    this.scene.add(btnDown4F);

    // H. 樓層指示燈液晶螢幕 (Floor Indicators: 1F 顯示「1F ▲」/ 4F 顯示「4F ▼」)
    // 1F 指示螢幕 Canvas (512 x 160)
    const ind1FCanvas = document.createElement('canvas');
    ind1FCanvas.width = 512;
    ind1FCanvas.height = 160;
    const ictx1 = ind1FCanvas.getContext('2d')!;
    ictx1.fillStyle = '#0a0e17';
    ictx1.fillRect(0, 0, 512, 160);
    ictx1.strokeStyle = '#00cec9';
    ictx1.lineWidth = 6;
    ictx1.strokeRect(4, 4, 504, 152);
    ictx1.fillStyle = '#00cec9';
    ictx1.font = 'bold 64px "Segoe UI", Arial, sans-serif';
    ictx1.textAlign = 'center';
    ictx1.textBaseline = 'middle';
    ictx1.fillText('1F ▲', 256, 56);
    ictx1.fillStyle = '#dfe6e9';
    ictx1.font = 'bold 26px "Noto Sans TC", sans-serif';
    ictx1.fillText('直達 4F 室內羽球館', 256, 116);
    const ind1FTex = new THREE.CanvasTexture(ind1FCanvas);

    // 1F 指示燈螢幕外框與面板
    const indFrame1F = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.44, 0.06), shaftFrameMat);
    indFrame1F.position.set(65.5, 2.95, 42.02);
    this.scene.add(indFrame1F);
    const indScreen1F = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.38),
      new THREE.MeshBasicMaterial({ map: ind1FTex, side: THREE.DoubleSide })
    );
    indScreen1F.rotation.y = Math.PI; // 正向面向北側門廳
    indScreen1F.position.set(65.5, 2.95, 41.98);
    this.scene.add(indScreen1F);

    // 4F 指示螢幕 Canvas (512 x 160)
    const ind4FCanvas = document.createElement('canvas');
    ind4FCanvas.width = 512;
    ind4FCanvas.height = 160;
    const ictx4 = ind4FCanvas.getContext('2d')!;
    ictx4.fillStyle = '#0a0e17';
    ictx4.fillRect(0, 0, 512, 160);
    ictx4.strokeStyle = '#ff7675';
    ictx4.lineWidth = 6;
    ictx4.strokeRect(4, 4, 504, 152);
    ictx4.fillStyle = '#ff7675';
    ictx4.font = 'bold 64px "Segoe UI", Arial, sans-serif';
    ictx4.textAlign = 'center';
    ictx4.textBaseline = 'middle';
    ictx4.fillText('4F ▼', 256, 56);
    ictx4.fillStyle = '#dfe6e9';
    ictx4.font = 'bold 26px "Noto Sans TC", sans-serif';
    ictx4.fillText('直達 1F 演藝廳門廳', 256, 116);
    const ind4FTex = new THREE.CanvasTexture(ind4FCanvas);

    // 4F 指示燈螢幕外框與面板
    const indFrame4F = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.44, 0.06), shaftFrameMat);
    indFrame4F.position.set(65.5, 14.95, 42.02);
    this.scene.add(indFrame4F);
    const indScreen4F = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.38),
      new THREE.MeshBasicMaterial({ map: ind4FTex, side: THREE.DoubleSide })
    );
    indScreen4F.rotation.y = Math.PI;
    indScreen4F.position.set(65.5, 14.95, 41.98);
    this.scene.add(indScreen4F);

    // I. 1F 電梯車廂與左右滑動電梯門 (無縫接軌 setElevatorDoorsOpen)
    const lift1FGroup = new THREE.Group();
    lift1FGroup.position.set(65.5, 0, 43.5);

    // 車廂地坪與天井燈飾
    const carFloor1F = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 2.4), shaftPanelMat);
    carFloor1F.position.set(0, 0.03, 0.1);
    lift1FGroup.add(carFloor1F);
    const ring1F = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.25, 24), liftRingMat);
    ring1F.rotation.x = -Math.PI / 2;
    ring1F.position.set(0, 0.065, 0.1);
    lift1FGroup.add(ring1F);

    const carCeil1F = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 2.4), shaftPanelMat);
    carCeil1F.position.set(0, 2.7, 0.1);
    lift1FGroup.add(carCeil1F);
    const light1F = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    light1F.position.set(0, 2.66, 0.1);
    lift1FGroup.add(light1F);

    // 車廂後側鏡面不鏽鋼壁板與安全扶手
    const mirror1F = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.6, 0.04), shaftSteelMat);
    mirror1F.position.set(0, 1.35, 1.24);
    lift1FGroup.add(mirror1F);
    const railBack1F = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.04), handrailMat);
    railBack1F.position.set(0, 0.95, 1.18);
    lift1FGroup.add(railBack1F);

    // 車廂兩側透明觀景窗
    const carGlassGeo = new THREE.BoxGeometry(0.04, 2.6, 2.2);
    const carGlass1FL = new THREE.Mesh(carGlassGeo, shaftGlassMat);
    carGlass1FL.position.set(-1.35, 1.35, 0.1);
    lift1FGroup.add(carGlass1FL);
    const carGlass1FR = new THREE.Mesh(carGlassGeo, shaftGlassMat);
    carGlass1FR.position.set(1.35, 1.35, 0.1);
    lift1FGroup.add(carGlass1FR);

    // 1F 雙扇電動滑動門 (Left & Right Sliding Doors)
    const doorGeo = new THREE.BoxGeometry(1.14, 2.65, 0.06);
    const door1FL = new THREE.Mesh(doorGeo, liftDoorMat);
    door1FL.position.set(-0.55 - 0.75, 1.325, -1.28);
    lift1FGroup.add(door1FL);
    const door1FR = new THREE.Mesh(doorGeo, liftDoorMat);
    door1FR.position.set(0.55 + 0.75, 1.325, -1.28);
    lift1FGroup.add(door1FR);
    // 門扇垂直觀景細縫窗
    const slitGeo = new THREE.BoxGeometry(0.12, 1.6, 0.07);
    const slit1FL = new THREE.Mesh(slitGeo, shaftGlassMat);
    slit1FL.position.set(0.2, 0.1, 0);
    door1FL.add(slit1FL);
    const slit1FR = new THREE.Mesh(slitGeo, shaftGlassMat);
    slit1FR.position.set(-0.2, 0.1, 0);
    door1FR.add(slit1FR);

    this.lift1FDoors = { left: door1FL, right: door1FR };
    this.scene.add(lift1FGroup);

    // J. 4F 電梯車廂與左右滑動電梯門
    const lift4FGroup = new THREE.Group();
    lift4FGroup.position.set(65.5, 12.0, 43.5);

    const carFloor4F = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 2.4), shaftPanelMat);
    carFloor4F.position.set(0, 0.03, 0.1);
    lift4FGroup.add(carFloor4F);
    const ring4F = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.25, 24), liftRingMat);
    ring4F.rotation.x = -Math.PI / 2;
    ring4F.position.set(0, 0.065, 0.1);
    lift4FGroup.add(ring4F);

    const carCeil4F = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 2.4), shaftPanelMat);
    carCeil4F.position.set(0, 2.7, 0.1);
    lift4FGroup.add(carCeil4F);
    const light4F = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    light4F.position.set(0, 2.66, 0.1);
    lift4FGroup.add(light4F);

    const mirror4F = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.6, 0.04), shaftSteelMat);
    mirror4F.position.set(0, 1.35, 1.24);
    lift4FGroup.add(mirror4F);
    const railBack4F = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.04), handrailMat);
    railBack4F.position.set(0, 0.95, 1.18);
    lift4FGroup.add(railBack4F);

    const carGlass4FL = new THREE.Mesh(carGlassGeo, shaftGlassMat);
    carGlass4FL.position.set(-1.35, 1.35, 0.1);
    lift4FGroup.add(carGlass4FL);
    const carGlass4FR = new THREE.Mesh(carGlassGeo, shaftGlassMat);
    carGlass4FR.position.set(1.35, 1.35, 0.1);
    lift4FGroup.add(carGlass4FR);

    // 4F 雙扇電動滑動門
    const door4FL = new THREE.Mesh(doorGeo, liftDoorMat);
    door4FL.position.set(-0.55 - 0.75, 1.325, -1.28);
    lift4FGroup.add(door4FL);
    const door4FR = new THREE.Mesh(doorGeo, liftDoorMat);
    door4FR.position.set(0.55 + 0.75, 1.325, -1.28);
    lift4FGroup.add(door4FR);
    const slit4FL = new THREE.Mesh(slitGeo, shaftGlassMat);
    slit4FL.position.set(0.2, 0.1, 0);
    door4FL.add(slit4FL);
    const slit4FR = new THREE.Mesh(slitGeo, shaftGlassMat);
    slit4FR.position.set(-0.2, 0.1, 0);
    door4FR.add(slit4FR);

    this.lift4FDoors = { left: door4FL, right: door4FR };
    this.scene.add(lift4FGroup);

    // 5. 四樓室內羽球館 (4F Badminton Court: Y = 12.0 ~ 16.5)
    // A. 4F 完整樓地板 (移除舊安全梯天井後，西側與全場地板完整平鋪密封，杜絕墜落)
    const f4Floor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.45, bL), stageFloorMat);
    f4Floor.position.set(baseX, 11.78, baseZ);
    f4Floor.receiveShadow = true;
    this.scene.add(f4Floor);
    this.addFloorSlab(minX, maxX, minZ, maxZ, 12.0);

    // B. 4F 四周外牆與大採光窗 (Y: 12.0 ~ 16.5)
    const h4 = 4.5;
    const midY4 = 12.0 + h4 / 2;
    this.buildWall(baseX, midY4, minZ, bW, h4, 0.6, wallMat);
    this.buildWall(baseX, midY4, maxZ, bW, h4, 0.6, wallMat);
    this.buildWall(maxX, midY4, baseZ, 0.6, h4, bL, wallMat);
    this.buildWall(minX, midY4, baseZ, 0.6, h4, bL, wallMat);

    // C. 4F 標準室內羽球場 PVC 地墊 (綠色地墊 + 白線)
    const matW = 13;
    const matL = 22;
    const courtMat = new THREE.MeshLambertMaterial({ color: 0x16a085 }); // 專業羽球綠地墊
    const court = new THREE.Mesh(new THREE.PlaneGeometry(matW, matL), courtMat);
    court.rotation.x = -Math.PI / 2;
    court.position.set(baseX + 3.0, 12.02, baseZ);
    court.receiveShadow = true;
    this.scene.add(court);

    // 羽球場白線 (單打/雙打邊線、發球線、中線)
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lineEdges = [
      { x: baseX + 3.0, z: baseZ - matL / 2 + 0.1, w: matW, d: 0.1 },
      { x: baseX + 3.0, z: baseZ + matL / 2 - 0.1, w: matW, d: 0.1 },
      { x: baseX + 3.0 - matW / 2 + 0.1, z: baseZ, w: 0.1, d: matL },
      { x: baseX + 3.0 + matW / 2 - 0.1, z: baseZ, w: 0.1, d: matL },
      { x: baseX + 3.0, z: baseZ, w: 0.08, d: matL - 4 },
      { x: baseX + 3.0, z: baseZ - 2.0, w: matW, d: 0.08 },
      { x: baseX + 3.0, z: baseZ + 2.0, w: matW, d: 0.08 }
    ];
    lineEdges.forEach(l => {
      const lm = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d), whiteMat);
      lm.rotation.x = -Math.PI / 2;
      lm.position.set(l.x, 12.03, l.z);
      this.scene.add(lm);
    });

    // D. 中央羽球網 (Badminton Net at Z = baseZ = 38, Y: 12.0 ~ 13.55)
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(baseX + 3.0 - matW / 2 - 0.2, 12.8, baseZ);
    this.scene.add(postL);
    this.addCollider(baseX + 3.0 - matW / 2 - 0.4, baseX + 3.0 - matW / 2, baseZ - 0.2, baseZ + 0.2, 12.0, 13.6);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(baseX + 3.0 + matW / 2 + 0.2, 12.8, baseZ);
    this.scene.add(postR);
    this.addCollider(baseX + 3.0 + matW / 2, baseX + 3.0 + matW / 2 + 0.4, baseZ - 0.2, baseZ + 0.2, 12.0, 13.6);

    const netMesh = new THREE.Mesh(
      new THREE.BoxGeometry(matW + 0.4, 0.76, 0.04),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    netMesh.position.set(baseX + 3.0, 13.15, baseZ);
    this.scene.add(netMesh);
    this.addCollider(baseX + 3.0 - matW / 2, baseX + 3.0 + matW / 2, baseZ - 0.1, baseZ + 0.1, 12.0, 13.55);

    // E. 裁判高腳椅 (Referee Tower)
    const refGroup = new THREE.Group();
    refGroup.position.set(baseX + 3.0 - matW / 2 - 1.2, 12.0, baseZ);
    const refChairMat = new THREE.MeshLambertMaterial({ color: 0x2980b9 });
    const refLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 2.0, 8), refChairMat);
    refLegs.position.y = 1.0;
    refGroup.add(refLegs);
    const refSeat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), refChairMat);
    refSeat.position.y = 2.05;
    refGroup.add(refSeat);
    this.scene.add(refGroup);

    // F. 屋頂與高空採光天窗 (Y = 16.5)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bW + 1.0, 0.5, bL + 1.0), wallMat);
    roof.position.set(baseX, 16.5, baseZ);
    this.scene.add(roof);

    // G. 招牌橫匾 (正面西門上方與南外牆上方)
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d')!;
    sctx.fillStyle = '#2c3e50';
    sctx.fillRect(0, 0, 512, 128);
    sctx.strokeStyle = '#f1c40f';
    sctx.lineWidth = 6;
    sctx.strokeRect(4, 4, 504, 120);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 34px "Noto Sans TC", sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('🎬 演藝大樓 (1-3F電影劇院 / 4F羽球館) 🎬', 256, 64);
    const signTex = new THREE.CanvasTexture(signCanvas);

    // 西側正門招牌 (中心 Y = 5.6m, 高度 2.0m，其底部 4.6m > 雨遮 3.4m > 大門 3.2m，層次分明)
    const signBackMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, metalness: 0.7, roughness: 0.3 });
    const signWestBack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 9.2), signBackMat);
    signWestBack.position.set(minX - 0.33, 5.6, 38);
    this.scene.add(signWestBack);

    const signWest = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 2.0), new THREE.MeshBasicMaterial({ map: signTex }));
    signWest.rotation.y = -Math.PI / 2;
    signWest.position.set(minX - 0.38, 5.6, 38);
    this.scene.add(signWest);

    // 南側實外牆招牌 (中心 Y = 5.6m, 高度 2.0m，端正固定於南向封閉實牆外側)
    const signSouthBack = new THREE.Mesh(new THREE.BoxGeometry(9.2, 2.1, 0.08), signBackMat);
    signSouthBack.position.set(baseX, 5.6, maxZ + 0.33);
    this.scene.add(signSouthBack);

    const signSouth = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 2.0), new THREE.MeshBasicMaterial({ map: signTex }));
    signSouth.position.set(baseX, 5.6, maxZ + 0.38);
    this.scene.add(signSouth);
  }

  // 電梯位置判定方法 (供 main.ts 呼叫，0-GC 純量運算)
  public isNear1FElevator(pos: THREE.Vector3): boolean {
    if (pos.y >= 3.5) return false;
    const dx = pos.x - 65.5;
    const dz = pos.z - 43.5;
    return (dx * dx + dz * dz) < 7.84; // 2.8 * 2.8 = 7.84
  }

  public isNear4FElevator(pos: THREE.Vector3): boolean {
    if (pos.y < 10.0) return false;
    const dx = pos.x - 65.5;
    const dz = pos.z - 43.5;
    return (dx * dx + dz * dz) < 7.84;
  }

  private buildWall(x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y - h / 2, y + h / 2);
  }

  // 學務處全校廣播控制台 (Broadcast Station Desk)
  public buildBroadcastStation(x: number, y: number, z: number) {
    const stationGroup = new THREE.Group();
    stationGroup.position.set(x, y, z);

    // 辦公廣播桌 (金屬鐵灰鋼桌)
    const deskMat = new THREE.MeshLambertMaterial({ color: 0x4a69bd });
    const deskTopMat = new THREE.MeshLambertMaterial({ color: 0xecf0f1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.8, roughness: 0.2 });
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c });

    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.2), deskMat);
    desk.position.y = 0.45;
    desk.castShadow = true;
    stationGroup.add(desk);

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 1.3), deskTopMat);
    deskTop.position.y = 0.94;
    stationGroup.add(deskTop);

    // 混音與廣播控制機箱
    const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.6), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
    consoleBox.position.set(0, 1.08, 0);
    stationGroup.add(consoleBox);

    // 廣播指示燈 (紅綠燈)
    const redLed = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), ledMat);
    redLed.position.set(-0.35, 1.22, 0.15);
    stationGroup.add(redLed);

    const greenLed = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
    greenLed.position.set(-0.22, 1.22, 0.15);
    stationGroup.add(greenLed);

    // 經典鵝頸彎曲麥克風 (Gooseneck Microphone)
    const micBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.06, 12), metalMat);
    micBase.position.set(0.2, 1.22, 0.1);
    stationGroup.add(micBase);

    const micStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), metalMat);
    micStem.position.set(0.2, 1.45, 0.05);
    micStem.rotation.x = -0.3;
    stationGroup.add(micStem);

    const micHead = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    micHead.position.set(0.2, 1.65, -0.05);
    stationGroup.add(micHead);

    // 頂部大聲公廣播喇叭 (Horn Speaker)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 12), new THREE.MeshLambertMaterial({ color: 0x7f8c8d }));
    horn.rotation.x = -Math.PI / 2;
    horn.position.set(0, 3.2, 0);
    stationGroup.add(horn);

    const hornPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), metalMat);
    hornPole.position.set(0, 2.05, 0);
    stationGroup.add(hornPole);

    this.scene.add(stationGroup);
    this.addCollider(x - 1.2, x + 1.2, z - 0.7, z + 0.7, y, y + 3.5);
  }

  // 操場跑道 200m 極速挑戰起跑線標誌 (橫跨整條 14 米直線跑道)
  public buildTrackStartBanner(x: number, y: number, z: number) {
    const bannerGroup = new THREE.Group();
    bannerGroup.position.set(x, y, z);

    // 1. 地面白色起跑線 / 終點線標線 (橫跨 14 米紅色跑道寬度)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14.0, 1.2), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.035, 0);
    bannerGroup.add(line);

    // 2. 起跑拱門鋼柱 (左側立於草皮內緣，右側立於外側道旁，絕不擋道)
    const postMat = new THREE.MeshLambertMaterial({ color: 0xf39c12 });
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.8, 12);

    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-7.2, 1.9, 0);
    postL.castShadow = true;
    bannerGroup.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(7.2, 1.9, 0);
    postR.castShadow = true;
    bannerGroup.add(postR);

    // 3. 橫跨跑道上空的起跑橫樑
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(14.6, 0.75, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xc0392b })
    );
    bar.position.set(0, 3.7, 0);
    bar.castShadow = true;
    bannerGroup.add(bar);

    // 4. 起跑橫樑文字看板 (雙向顯示：面向衝線跑者顯示終點，背面指示起跑與逆時針箭頭)
    const bannerCanvasSouth = document.createElement('canvas');
    bannerCanvasSouth.width = 1024;
    bannerCanvasSouth.height = 128;
    const ctxS = bannerCanvasSouth.getContext('2d')!;
    ctxS.fillStyle = '#c0392b';
    ctxS.fillRect(0, 0, 1024, 128);
    ctxS.strokeStyle = '#f1c40f';
    ctxS.lineWidth = 6;
    ctxS.strokeRect(8, 8, 1008, 112);
    ctxS.fillStyle = '#ffffff';
    ctxS.font = '900 42px "Noto Sans TC", sans-serif';
    ctxS.textAlign = 'center';
    ctxS.textBaseline = 'middle';
    ctxS.fillText('🏁 天天國中 200m 終點衝線 FINISH LINE 🏁', 512, 64);

    const bannerCanvasNorth = document.createElement('canvas');
    bannerCanvasNorth.width = 1024;
    bannerCanvasNorth.height = 128;
    const ctxN = bannerCanvasNorth.getContext('2d')!;
    ctxN.fillStyle = '#27ae60';
    ctxN.fillRect(0, 0, 1024, 128);
    ctxN.strokeStyle = '#f1c40f';
    ctxN.lineWidth = 6;
    ctxN.strokeRect(8, 8, 1008, 112);
    ctxN.fillStyle = '#ffffff';
    ctxN.font = '900 38px "Noto Sans TC", sans-serif';
    ctxN.textAlign = 'center';
    ctxN.textBaseline = 'middle';
    ctxN.fillText('🚩 200m 起跑線 START (逆時針方向 ➜ 進入第一彎道) 🚩', 512, 64);

    const signMatSouth = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bannerCanvasSouth) });
    const signMatNorth = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bannerCanvasNorth) });

    const signF = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 0.7), signMatSouth);
    signF.position.set(0, 3.7, 0.16);
    bannerGroup.add(signF);

    const signB = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 0.7), signMatNorth);
    signB.rotation.y = Math.PI;
    signB.position.set(0, 3.7, -0.16);
    bannerGroup.add(signB);

    this.scene.add(bannerGroup);
  }

  // 建造天天國中 25m 標準游泳館與水上賽道設施
  public buildSwimmingPool(x: number, y: number, z: number) {
    const poolGroup = new THREE.Group();
    poolGroup.position.set(x, y, z);

    // 1. 池畔防滑磁磚甲板 (Pool Deck: 20m 寬 x 32m 長)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0xdff9fb });
    // 甲板分四塊環繞泳池，中間挖空以露出藍色池底 (避免整塊甲板蓋住池底與水面)
    [[20, 3, 0, -14.5], [20, 3, 0, 14.5], [3, 26, -8.5, 0], [3, 26, 8.5, 0]].forEach(([dw, dl, dx, dz]) => {
      const deckPart = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.3, dl), deckMat);
      deckPart.position.set(dx, 0.15, dz);
      deckPart.receiveShadow = true;
      poolGroup.add(deckPart);
    });

    // 2. 陽光下清澈透亮的水藍色泳池水面 (Crystal Sunlit Blue Pool Water: 14m x 26m)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0097e6, // 陽光下清澈透亮的水藍色 (蔚藍水色 0x0097e6 / 0x00a8ff)
      transparent: true,
      opacity: 0.65, // 微透光質感
      roughness: 0.04, // 晶瑩水面光澤反光
      metalness: 0.22
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 26), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.25, 0);
    poolGroup.add(water);

    // 3. 水下池底深槽 (Sunken Pool Basin with Blue & White Mosaic Tile Texture)
    const basinTileTex = CampusWorld.createTileTexture('#0984e3', '#0652dd', 14, 26);
    const basinBottomMat = new THREE.MeshLambertMaterial({ map: basinTileTex, color: 0x74b9ff });
    // 池壁 (藍色磁磚)
    const basinWallMat = new THREE.MeshLambertMaterial({ map: CampusWorld.createTileTexture('#0984e3', '#0652dd', 14, 2), color: 0x74b9ff });
    [[14, 0.2, 0, -13], [14, 0.2, 0, 13], [0.2, 26, -7, 0], [0.2, 26, 7, 0]].forEach(([ww, wl, wx, wz]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, 1.5, wl), basinWallMat);
      wall.position.set(wx, -0.45, wz);
      poolGroup.add(wall);
    });
    const basinBottom = new THREE.Mesh(new THREE.PlaneGeometry(14, 26), basinBottomMat);
    basinBottom.rotation.x = -Math.PI / 2;
    basinBottom.position.set(0, -1.2, 0);
    poolGroup.add(basinBottom);

    // 泳池四周防滑圍邊 (Curb Border)
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x74b9ff });
    const borderN = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.35, 0.6), borderMat);
    borderN.position.set(0, 0.35, -13.3);
    poolGroup.add(borderN);
    const borderS = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.35, 0.6), borderMat);
    borderS.position.set(0, 0.35, 13.3);
    poolGroup.add(borderS);
    const borderW = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 27.2), borderMat);
    borderW.position.set(-7.3, 0.35, 0);
    poolGroup.add(borderW);
    const borderE = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 27.2), borderMat);
    borderE.position.set(7.3, 0.35, 0);
    poolGroup.add(borderE);

    // 4. 四條標準泳道分道線 (4 Lanes with 3 Lane Dividers with floating buoys)
    const floatWhiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const floatRedMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
    const floatBlueMat = new THREE.MeshLambertMaterial({ color: 0x0984e3 });

    const dividerXOffsets = [-3.5, 0, 3.5];
    dividerXOffsets.forEach(dx => {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 26, 6), new THREE.MeshBasicMaterial({ color: 0x2d3436 }));
      wire.rotation.x = Math.PI / 2;
      wire.position.set(dx, 0.28, 0);
      poolGroup.add(wire);

      for (let fz = -12.5; fz <= 12.5; fz += 0.8) {
        const mat = Math.abs(fz) > 8 ? floatRedMat : (Math.floor(fz) % 2 === 0 ? floatWhiteMat : floatBlueMat);
        const floatSphere = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), mat);
        floatSphere.position.set(dx, 0.28, fz);
        poolGroup.add(floatSphere);
      }
    });

    // 5. 北端出發跳水台 (4 Starting Blocks at Z: -13.6)
    const blockMat = new THREE.MeshLambertMaterial({ color: 0x0984e3 });
    const blockTopMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    const lanePositions = [-5.25, -1.75, 1.75, 5.25];

    lanePositions.forEach((bx) => {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), blockMat);
      block.position.set(bx, 0.45, -13.6);
      block.castShadow = true;
      poolGroup.add(block);

      const blockTop = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 0.74), blockTopMat);
      blockTop.position.set(bx, 0.75, -13.6);
      blockTop.rotation.x = -0.15;
      poolGroup.add(blockTop);
    });

    // 6. 救生員高腳椅 (Lifeguard Tower Chair at X: 8.5, Z: 0)
    const guardChairGroup = new THREE.Group();
    guardChairGroup.position.set(8.5, 0, 0);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xdfe6e9, metalness: 0.8 });
    const chairMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });

    [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].forEach(([cx, cz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), metalMat);
      leg.position.set(cx, 1.1, cz);
      guardChairGroup.add(leg);
    });

    const footStep = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), metalMat);
    footStep.position.y = 1.0;
    guardChairGroup.add(footStep);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.6), chairMat);
    seat.position.set(0, 2.1, 0);
    guardChairGroup.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.1), chairMat);
    back.position.set(0, 2.45, 0.25);
    guardChairGroup.add(back);

    poolGroup.add(guardChairGroup);
    this.addCollider(x + 7.5, x + 9.5, z - 1.0, z + 1.0, y, y + 2.8);

    // 7. 紅白救生圈裝飾
    const buoyGeo = new THREE.TorusGeometry(0.4, 0.12, 8, 16);
    const buoyMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
    const buoy1 = new THREE.Mesh(buoyGeo, buoyMat);
    buoy1.rotation.y = Math.PI / 2;
    buoy1.position.set(-8.8, 0.8, -5);
    poolGroup.add(buoy1);

    const buoy2 = new THREE.Mesh(buoyGeo, buoyMat);
    buoy2.rotation.y = Math.PI / 2;
    buoy2.position.set(-8.8, 0.8, 5);
    poolGroup.add(buoy2);

    // 8. 游泳池大看板招牌
    const poolSignCanvas = document.createElement('canvas');
    poolSignCanvas.width = 512;
    poolSignCanvas.height = 128;
    const psCtx = poolSignCanvas.getContext('2d')!;
    psCtx.fillStyle = '#0984e3';
    psCtx.fillRect(0, 0, 512, 128);
    psCtx.strokeStyle = '#74b9ff';
    psCtx.lineWidth = 6;
    psCtx.strokeRect(4, 4, 504, 120);

    psCtx.fillStyle = '#ffffff';
    psCtx.font = 'bold 38px "Noto Sans TC", sans-serif';
    psCtx.textAlign = 'center';
    psCtx.textBaseline = 'middle';
    psCtx.fillText('🏊 天天國中 25m 標準游泳館', 256, 48);

    psCtx.font = 'bold 22px "Noto Sans TC", sans-serif';
    psCtx.fillStyle = '#ffeaa7';
    psCtx.fillText('天天盃 50m 自由式水上競速極速挑戰賽', 256, 92);

    const poolSignTex = new THREE.CanvasTexture(poolSignCanvas);
    const poolSign = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.5, 0.2), new THREE.MeshBasicMaterial({ map: poolSignTex }));
    poolSign.position.set(0, 2.6, -15.5);
    poolGroup.add(poolSign);

    const signPoleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8);
    const signPoleL = new THREE.Mesh(signPoleGeo, metalMat);
    signPoleL.position.set(-2.5, 1.3, -15.5);
    poolGroup.add(signPoleL);
    const signPoleR = new THREE.Mesh(signPoleGeo, metalMat);
    signPoleR.position.set(2.5, 1.3, -15.5);
    poolGroup.add(signPoleR);

    // 地面互動發光圈 (青藍色出發台挑戰標記)
    const ringGeo = new THREE.TorusGeometry(1.5, 0.08, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00cec9, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.32, -13.6);
    poolGroup.add(ring);

    this.scene.add(poolGroup);

    // 外圍防護欄杆與碰撞箱 (防止掉出校園，北端留出通道)
    this.addCollider(x - 9.8, x + 9.8, z - 16.0, z - 15.6, y, y + 1.2);
    this.addCollider(x - 9.8, x + 9.8, z + 15.6, z + 16.0, y, y + 1.2);
    this.addCollider(x - 9.8, x - 9.4, z - 16.0, z + 16.0, y, y + 1.2);
    this.addCollider(x + 9.4, x + 9.8, z - 16.0, z + 16.0, y, y + 1.2);
  }
}
