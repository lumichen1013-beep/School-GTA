import * as THREE from 'three';

interface SplashDroplet {
  mesh: THREE.Mesh<THREE.DodecahedronGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
  active: boolean;
}

interface WaterRipple {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  initialScale: number;
  targetScale: number;
  active: boolean;
}

/**
 * 高性能游泳水花與漣漪特效系統 (Water Splash & Ripples VFX)
 * - 具備雙重輕量物件池 (Object Pool)：飛濺水珠微粒池 (100) + 水面擴散漣漪池 (30)
 * - 0 GC 記憶體垃圾回收負擔，行動端與低端設備流暢維持 60 FPS
 * - 支援身後踢水噴濺、兩側大風車划水擴散、與划水音效節奏對齊爆發
 */
export class WaterSplashVFX {
  public group: THREE.Group;

  // 1. 水花飛濺微粒物件池 (Splash Spray Droplets Pool)
  private readonly MAX_DROPLETS = 100;
  private droplets: SplashDroplet[] = [];
  private nextDropletIdx: number = 0;

  // 2. 水面擴散漣漪物件池 (Expanding Ripples Pool)
  private readonly MAX_RIPPLES = 30;
  private ripples: WaterRipple[] = [];
  private nextRippleIdx: number = 0;

  // 發射計時器 (Emission Timers)
  private kickSprayTimer: number = 0;
  private rippleTimer: number = 0;
  private armStrokeTimer: number = 0;
  private armSide: 'left' | 'right' = 'left';

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.initDropletsPool();
    this.initRipplesPool();
  }

  // 初始化打水飛濺水珠物件池
  private initDropletsPool() {
    const geo = new THREE.DodecahedronGeometry(0.048, 0); // 低多邊形晶瑩水珠幾何體

    for (let i = 0; i < this.MAX_DROPLETS; i++) {
      // 交替使用晶瑩純白 (泡沬) 與冰川淡天藍色 (水光)
      const color = i % 2 === 0 ? 0xffffff : 0xb3e5fc;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.droplets.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        baseScale: 1.0,
        active: false
      });
    }
  }

  // 初始化水面擴散漣漪物件池
  private initRipplesPool() {
    const ringGeo = new THREE.RingGeometry(0.16, 0.36, 24);

    for (let i = 0; i < this.MAX_RIPPLES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x81d4fa, // 清澈湛藍水波光環
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2; // 水平貼齊水面
      mesh.visible = false;
      this.group.add(mesh);

      this.ripples.push({
        mesh,
        life: 0,
        maxLife: 1,
        initialScale: 0.4,
        targetScale: 2.0,
        active: false
      });
    }
  }

  /**
   * 生成單個水珠微粒 (從物件池取出)
   */
  public spawnDroplet(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number = 0.45,
    baseScale: number = 1.0
  ) {
    const droplet = this.droplets[this.nextDropletIdx];
    this.nextDropletIdx = (this.nextDropletIdx + 1) % this.MAX_DROPLETS;

    droplet.mesh.position.set(x, y, z);
    droplet.velocity.set(vx, vy, vz);
    droplet.life = maxLife;
    droplet.maxLife = maxLife;
    droplet.baseScale = baseScale;
    droplet.mesh.scale.setScalar(baseScale);
    droplet.mesh.material.opacity = 0.85;
    droplet.mesh.visible = true;
    droplet.active = true;
  }

  /**
   * 生成水面擴散漣漪光環 (從物件池取出)
   */
  public spawnRipple(
    x: number,
    y: number,
    z: number,
    initialScale: number = 0.35,
    targetScale: number = 1.9,
    maxLife: number = 0.65
  ) {
    const ripple = this.ripples[this.nextRippleIdx];
    this.nextRippleIdx = (this.nextRippleIdx + 1) % this.MAX_RIPPLES;

    // 稍微抬高 0.005m，緊密貼齊水面並杜絕 Z-fighting 閃爍
    ripple.mesh.position.set(x, y + 0.006, z);
    ripple.life = maxLife;
    ripple.maxLife = maxLife;
    ripple.initialScale = initialScale;
    ripple.targetScale = targetScale;
    ripple.mesh.scale.set(initialScale, initialScale, initialScale);
    ripple.mesh.material.opacity = 0.75;
    ripple.mesh.visible = true;
    ripple.active = true;
  }

  /**
   * 身後腳部拍水飛濺 (Flutter Kick Splash behind character)
   */
  public emitKickSplash(pos: THREE.Vector3, rotY: number, isSprinting: boolean, waterY: number) {
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);

    // 身後腳踢位置（約身後 0.75~0.85m）
    const feetX = pos.x - sinY * 0.78 + (Math.random() - 0.5) * 0.22;
    const feetZ = pos.z - cosY * 0.78 + (Math.random() - 0.5) * 0.22;
    const feetY = waterY + 0.02;

    const count = isSprinting ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const spd = (1.5 + Math.random() * 1.8) * (isSprinting ? 1.35 : 1.0);
      const vx = -sinY * spd + (Math.random() - 0.5) * 0.9;
      const vz = -cosY * spd + (Math.random() - 0.5) * 0.9;
      const vy = (1.8 + Math.random() * 2.2) * (isSprinting ? 1.25 : 1.0);
      const life = 0.35 + Math.random() * 0.25;
      const scale = 0.8 + Math.random() * 0.5;
      this.spawnDroplet(feetX, feetY, feetZ, vx, vy, vz, life, scale);
    }
  }

  /**
   * 身體兩側風車划水噴濺 (Windmill Arm Stroke Splash on sides)
   */
  public emitArmSplash(
    pos: THREE.Vector3,
    rotY: number,
    side: 'left' | 'right',
    isSprinting: boolean,
    waterY: number
  ) {
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const sign = side === 'right' ? 1 : -1;

    // 划水切入點：身體側邊 0.42m，稍微往前 0.15m
    const handX = pos.x + cosY * (sign * 0.42) + sinY * 0.15;
    const handZ = pos.z - sinY * (sign * 0.42) + cosY * 0.15;
    const handY = waterY + 0.02;

    const count = isSprinting ? 4 : 3;
    for (let i = 0; i < count; i++) {
      // 划水力量向側後方推出
      const outX = cosY * sign * 0.75 - sinY * 0.65;
      const outZ = -sinY * sign * 0.75 - cosY * 0.65;
      const spd = (1.3 + Math.random() * 1.7) * (isSprinting ? 1.3 : 1.0);
      const vx = outX * spd + (Math.random() - 0.5) * 0.7;
      const vz = outZ * spd + (Math.random() - 0.5) * 0.7;
      const vy = (1.6 + Math.random() * 1.9) * (isSprinting ? 1.2 : 1.0);
      const life = 0.32 + Math.random() * 0.22;
      const scale = 0.85 + Math.random() * 0.45;
      this.spawnDroplet(handX, handY, handZ, vx, vy, vz, life, scale);
    }

    // 划水處產生水紋漣漪
    this.spawnRipple(handX, waterY, handZ, 0.28, isSprinting ? 2.1 : 1.6, 0.55);
  }

  /**
   * 音效對齊時瞬間強烈爆發水花 (Burst splash on splash sound beat)
   */
  public triggerSplashBurst(
    pos: THREE.Vector3,
    rotY: number,
    isSprinting: boolean,
    waterY: number = 0.25
  ) {
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);

    // 身後腳踢處爆發
    const feetX = pos.x - sinY * 0.8;
    const feetZ = pos.z - cosY * 0.8;
    const burstCount = isSprinting ? 7 : 5;
    for (let i = 0; i < burstCount; i++) {
      const spd = (isSprinting ? 2.6 : 2.0) + Math.random() * 2.2;
      const vx = -sinY * spd + (Math.random() - 0.5) * 1.4;
      const vz = -cosY * spd + (Math.random() - 0.5) * 1.4;
      const vy = 2.2 + Math.random() * 2.4;
      this.spawnDroplet(feetX, waterY + 0.02, feetZ, vx, vy, vz, 0.45 + Math.random() * 0.2, 1.2);
    }
    this.spawnRipple(feetX, waterY, feetZ, 0.4, 2.3, 0.75);

    // 划水兩側連鎖激盪漣漪
    const leftX = pos.x - cosY * 0.45 + sinY * 0.1;
    const leftZ = pos.z + sinY * 0.45 + cosY * 0.1;
    const rightX = pos.x + cosY * 0.45 + sinY * 0.1;
    const rightZ = pos.z - sinY * 0.45 + cosY * 0.1;
    this.spawnRipple(leftX, waterY, leftZ, 0.3, 1.8, 0.6);
    this.spawnRipple(rightX, waterY, rightZ, 0.3, 1.8, 0.6);
  }

  /**
   * 每幀更新：管理物件池、物理位移重力回落、半透明淡出與發射時序
   */
  public update(
    delta: number,
    playerPos: THREE.Vector3,
    playerRotY: number,
    isSwimming: boolean,
    isMoving: boolean,
    isSprinting: boolean,
    waterY: number = 0.25
  ) {
    const clampedDelta = Math.min(delta, 0.1); // 防止切換分頁時的大跳幀

    // 1. 更新所有使用中的水珠微粒
    const gravity = 13.5;
    for (let i = 0; i < this.MAX_DROPLETS; i++) {
      const droplet = this.droplets[i];
      if (!droplet.active) continue;

      droplet.life -= clampedDelta;
      if (droplet.life <= 0) {
        droplet.active = false;
        droplet.mesh.visible = false;
        continue;
      }

      // 重力與位移物理更新
      droplet.velocity.y -= gravity * clampedDelta;
      droplet.mesh.position.addScaledVector(droplet.velocity, clampedDelta);

      // 當水珠回落跌入水面下方時，迅速消散
      if (droplet.mesh.position.y <= waterY) {
        droplet.mesh.position.y = waterY;
        droplet.life -= clampedDelta * 2.5; // 加速沉沒消失
      }

      // 線性平滑淡出與縮放
      const lifeRatio = Math.max(0, droplet.life / droplet.maxLife);
      droplet.mesh.material.opacity = lifeRatio * 0.85;
      droplet.mesh.scale.setScalar(droplet.baseScale * (0.5 + 0.5 * lifeRatio));
    }

    // 2. 更新所有使用中的水面擴散漣漪
    for (let i = 0; i < this.MAX_RIPPLES; i++) {
      const ripple = this.ripples[i];
      if (!ripple.active) continue;

      ripple.life -= clampedDelta;
      if (ripple.life <= 0) {
        ripple.active = false;
        ripple.mesh.visible = false;
        continue;
      }

      const progress = 1 - Math.max(0, ripple.life / ripple.maxLife); // 0 -> 1
      // 緩動向外擴散
      const curScale = THREE.MathUtils.lerp(
        ripple.initialScale,
        ripple.targetScale,
        Math.pow(progress, 0.65)
      );
      ripple.mesh.scale.set(curScale, curScale, curScale);

      // 正弦平滑淡出
      ripple.mesh.material.opacity = Math.sin((1 - progress) * Math.PI * 0.5) * 0.72;
    }

    // 3. 游泳動態發射判定
    // 若玩家停止游泳、停止移動或已上岸，不產生新粒子，讓既有水花與漣漪自然消散停止
    if (!isSwimming || !isMoving) {
      this.kickSprayTimer = 0;
      this.rippleTimer = 0;
      this.armStrokeTimer = 0;
      return;
    }

    // A. 腳踢打水高頻噴濺 (Kick Spray)
    const kickInterval = isSprinting ? 0.045 : 0.068;
    this.kickSprayTimer -= clampedDelta;
    if (this.kickSprayTimer <= 0) {
      this.emitKickSplash(playerPos, playerRotY, isSprinting, waterY);
      this.kickSprayTimer = kickInterval;
    }

    // B. 水面擴散漣漪 (Expanding Water Ripples at feet)
    const rippleInterval = isSprinting ? 0.12 : 0.18;
    this.rippleTimer -= clampedDelta;
    if (this.rippleTimer <= 0) {
      const sinY = Math.sin(playerRotY);
      const cosY = Math.cos(playerRotY);
      const feetX = playerPos.x - sinY * 0.78;
      const feetZ = playerPos.z - cosY * 0.78;
      this.spawnRipple(
        feetX,
        waterY,
        feetZ,
        0.35,
        (isSprinting ? 2.2 : 1.7) + Math.random() * 0.4,
        0.65
      );
      this.rippleTimer = rippleInterval;
    }

    // C. 身體兩側交替划水噴濺 (Alternating Windmill Arm Strokes)
    const strokeInterval = isSprinting ? 0.16 : 0.22;
    this.armStrokeTimer -= clampedDelta;
    if (this.armStrokeTimer <= 0) {
      this.emitArmSplash(playerPos, playerRotY, this.armSide, isSprinting, waterY);
      this.armSide = this.armSide === 'left' ? 'right' : 'left';
      this.armStrokeTimer = strokeInterval;
    }
  }

  /**
   * 重置並立即隱藏所有特效物件 (如換場景或角色死亡重生)
   */
  public reset() {
    for (const droplet of this.droplets) {
      droplet.active = false;
      droplet.mesh.visible = false;
    }
    for (const ripple of this.ripples) {
      ripple.active = false;
      ripple.mesh.visible = false;
    }
  }
}
