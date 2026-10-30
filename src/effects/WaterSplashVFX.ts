import * as THREE from 'three';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';

interface SplashDroplet {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
  active: boolean;
}

interface WaterRipple {
  position: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
  targetScale: number;
  active: boolean;
}

// 水珠交替使用晶瑩純白 (泡沫) 與冰川淡天藍色 (水光)
const DROPLET_COLORS = [new THREE.Color(0xffffff), new THREE.Color(0xb3e5fc)];
// 漣漪由清澈湛藍淡出至泳池水色 (共用材質無法逐一調整透明度，改以顏色融入水面呈現淡出)
const RIPPLE_COLOR = new THREE.Color(0x81d4fa);
const RIPPLE_FADE_COLOR = new THREE.Color(0x0097e6);
const RIPPLE_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _scratchMatrix = new THREE.Matrix4();
const _scratchScale = new THREE.Vector3();
const _scratchColor = new THREE.Color();
const _identityQuat = new THREE.Quaternion();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * 高性能游泳水花與漣漪特效系統 (Water Splash & Ripples VFX)
 * - 雙重物件池：飛濺水珠微粒 (100) + 水面擴散漣漪 (30)，各以單一 InstancedMesh 繪製 (2 次 Draw Call)
 * - 0 GC 記憶體垃圾回收負擔，行動端與低端設備流暢維持 60 FPS
 * - 支援身後踢水噴濺、兩側大風車划水擴散、與划水音效節奏對齊爆發
 */
export class WaterSplashVFX {
  public group: THREE.Group;

  // 1. 水花飛濺微粒物件池 (Splash Spray Droplets Pool)
  private readonly MAX_DROPLETS = 100;
  private droplets: SplashDroplet[] = [];
  private nextDropletIdx: number = 0;
  private dropletMesh: THREE.InstancedMesh;

  // 2. 水面擴散漣漪物件池 (Expanding Ripples Pool)
  private readonly MAX_RIPPLES = 30;
  private ripples: WaterRipple[] = [];
  private nextRippleIdx: number = 0;
  private rippleMesh: THREE.InstancedMesh;

  // 發射計時器 (Emission Timers)
  private kickSprayTimer: number = 0;
  private rippleTimer: number = 0;
  private armStrokeTimer: number = 0;
  private armSide: 'left' | 'right' = 'left';

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    updateVisibleMatricesOnly(this.group); // 水珠/漣漪閒置隱藏時略過矩陣更新
    scene.add(this.group);

    this.dropletMesh = this.initDropletsPool();
    this.rippleMesh = this.initRipplesPool();
  }

  // 初始化打水飛濺水珠物件池 (未使用的實例以零縮放矩陣隱藏)
  private initDropletsPool(): THREE.InstancedMesh {
    const geo = new THREE.DodecahedronGeometry(0.048, 0); // 低多邊形晶瑩水珠幾何體
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, this.MAX_DROPLETS);
    mesh.frustumCulled = false; // 實例位置每幀變動，略過整體包圍球剔除
    mesh.visible = false;
    for (let i = 0; i < this.MAX_DROPLETS; i++) {
      mesh.setMatrixAt(i, _zeroMatrix);
      mesh.setColorAt(i, DROPLET_COLORS[i % 2]);
      this.droplets.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        baseScale: 1.0,
        active: false
      });
    }
    this.group.add(mesh);
    return mesh;
  }

  // 初始化水面擴散漣漪物件池
  private initRipplesPool(): THREE.InstancedMesh {
    const ringGeo = new THREE.RingGeometry(0.16, 0.36, 24);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(ringGeo, mat, this.MAX_RIPPLES);
    mesh.frustumCulled = false;
    mesh.visible = false;
    for (let i = 0; i < this.MAX_RIPPLES; i++) {
      mesh.setMatrixAt(i, _zeroMatrix);
      mesh.setColorAt(i, RIPPLE_COLOR);
      this.ripples.push({
        position: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        initialScale: 0.4,
        targetScale: 2.0,
        active: false
      });
    }
    this.group.add(mesh);
    return mesh;
  }

  // 暫時顯示以便 renderer.compile 預熱 shader
  public prewarm(compile: () => void) {
    this.dropletMesh.visible = true;
    this.rippleMesh.visible = true;
    compile();
    this.dropletMesh.visible = false;
    this.rippleMesh.visible = false;
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

    droplet.position.set(x, y, z);
    droplet.velocity.set(vx, vy, vz);
    droplet.life = maxLife;
    droplet.maxLife = maxLife;
    droplet.baseScale = baseScale;
    droplet.active = true;
    this.dropletMesh.visible = true;
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

    // 稍微抬高 0.006m，緊密貼齊水面並杜絕 Z-fighting 閃爍
    ripple.position.set(x, y + 0.006, z);
    ripple.life = maxLife;
    ripple.maxLife = maxLife;
    ripple.initialScale = initialScale;
    ripple.targetScale = targetScale;
    ripple.active = true;
    this.rippleMesh.visible = true;
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

    // 1. 更新所有使用中的水珠微粒 (淡出改以縮小呈現，共用材質不逐一調整透明度)
    const gravity = 13.5;
    let dropletsAlive = 0;
    if (this.dropletMesh.visible) {
      for (let i = 0; i < this.MAX_DROPLETS; i++) {
        const droplet = this.droplets[i];
        if (!droplet.active) continue;

        droplet.life -= clampedDelta;
        if (droplet.life <= 0) {
          droplet.active = false;
          this.dropletMesh.setMatrixAt(i, _zeroMatrix);
          continue;
        }

        // 重力與位移物理更新
        droplet.velocity.y -= gravity * clampedDelta;
        droplet.position.addScaledVector(droplet.velocity, clampedDelta);

        // 當水珠回落跌入水面下方時，迅速消散
        if (droplet.position.y <= waterY) {
          droplet.position.y = waterY;
          droplet.life -= clampedDelta * 2.5; // 加速沉沒消失
        }

        // 線性平滑縮小淡出
        const lifeRatio = Math.max(0, droplet.life / droplet.maxLife);
        _scratchScale.setScalar(droplet.baseScale * lifeRatio);
        _scratchMatrix.compose(droplet.position, _identityQuat, _scratchScale);
        this.dropletMesh.setMatrixAt(i, _scratchMatrix);
        dropletsAlive++;
      }
      this.dropletMesh.instanceMatrix.needsUpdate = true;
      if (dropletsAlive === 0) this.dropletMesh.visible = false;
    }

    // 2. 更新所有使用中的水面擴散漣漪
    let ripplesAlive = 0;
    if (this.rippleMesh.visible) {
      for (let i = 0; i < this.MAX_RIPPLES; i++) {
        const ripple = this.ripples[i];
        if (!ripple.active) continue;

        ripple.life -= clampedDelta;
        if (ripple.life <= 0) {
          ripple.active = false;
          this.rippleMesh.setMatrixAt(i, _zeroMatrix);
          continue;
        }

        const progress = 1 - Math.max(0, ripple.life / ripple.maxLife); // 0 -> 1
        // 緩動向外擴散
        const curScale = THREE.MathUtils.lerp(ripple.initialScale, ripple.targetScale, Math.pow(progress, 0.65));
        _scratchScale.setScalar(curScale);
        _scratchMatrix.compose(ripple.position, RIPPLE_QUAT, _scratchScale);
        this.rippleMesh.setMatrixAt(i, _scratchMatrix);
        // 正弦平滑淡出：顏色逐漸融入泳池水色
        _scratchColor.copy(RIPPLE_COLOR).lerp(RIPPLE_FADE_COLOR, 1 - Math.sin((1 - progress) * Math.PI * 0.5));
        this.rippleMesh.setColorAt(i, _scratchColor);
        ripplesAlive++;
      }
      this.rippleMesh.instanceMatrix.needsUpdate = true;
      if (this.rippleMesh.instanceColor) this.rippleMesh.instanceColor.needsUpdate = true;
      if (ripplesAlive === 0) this.rippleMesh.visible = false;
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
    for (let i = 0; i < this.MAX_DROPLETS; i++) {
      this.droplets[i].active = false;
      this.dropletMesh.setMatrixAt(i, _zeroMatrix);
    }
    for (let i = 0; i < this.MAX_RIPPLES; i++) {
      this.ripples[i].active = false;
      this.rippleMesh.setMatrixAt(i, _zeroMatrix);
    }
    this.dropletMesh.instanceMatrix.needsUpdate = true;
    this.rippleMesh.instanceMatrix.needsUpdate = true;
    this.dropletMesh.visible = false;
    this.rippleMesh.visible = false;
  }
}
