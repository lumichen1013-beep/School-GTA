import * as THREE from 'three';
import { FX_POOL_MAX, getFxQuality } from './fxQuality';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';

// 命中塊狀碎片 (低多邊形菱形 / 方塊火花)：全部共用 1 個 InstancedMesh (1 draw call)、per-instance 顏色。
// 不透明材質 (寫深度、不混色)：淡出改以縮小到 0 表現，平板 Mali 上沒有透明 overdraw 成本。
// 依目前檔位 sparkPool 輪替可用槽 (降檔後超出者自然播完)；物件池依 FX_POOL_MAX 預建，執行期零配置。

export interface SparkBurstOpts {
  count: number;
  colors: readonly number[];  // 依序輪流上色
  speed: number;              // 初速 (m/s)
  up: number;                 // 上拋速度
  size: number;               // 碎片邊長 (m)
  gravity: number;            // 重力加速度 (m/s²，木屑重、電火花輕)
  life: number;               // 壽命 (秒)
  spread: number;             // 0 = 沿 dir 集中噴出、1 = 全方位
}

interface Spark { life: number; max: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; sx: number; sy: number; size: number; g: number }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

class HitSparkSystem {
  private mesh: THREE.InstancedMesh | null = null;
  private sparks: Spark[] = [];
  private next = 0;
  private active = 0;

  public init(scene: THREE.Object3D) {
    if (this.mesh) return;
    const n = FX_POOL_MAX.sparkPool;
    // 細長菱形 (八面體沿 Y 拉長)：方塊風的「星形火花 / 碎片」
    const geo = new THREE.OctahedronGeometry(0.5, 0).scale(0.75, 1.25, 0.75);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, _zero);
      this.mesh.setColorAt(i, _c.setHex(0xffffff));
      this.sparks.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, sx: 0, sy: 0, size: 0, g: 0 });
    }
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    updateVisibleMatricesOnly(this.mesh);
    scene.add(this.mesh);
  }

  public prewarm(compile: () => void) {
    if (!this.mesh) return;
    this.mesh.visible = true;
    compile();
    this.mesh.visible = false;
  }

  public reset() {
    if (!this.mesh) return;
    for (let i = 0; i < this.sparks.length; i++) { this.sparks[i].life = 0; this.mesh.setMatrixAt(i, _zero); }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.active = 0;
    this.mesh.visible = false;
  }

  // 自 (x, y, z) 噴出碎片：dir (水平單位向量，可為 0) 為主要噴出方向
  public burst(x: number, y: number, z: number, dirX: number, dirZ: number, o: SparkBurstOpts) {
    const mesh = this.mesh;
    if (!mesh) return;
    const pool = Math.max(1, Math.min(this.sparks.length, getFxQuality().sparkPool));
    const n = Math.min(pool, Math.max(0, Math.round(o.count)));
    for (let k = 0; k < n; k++) {
      if (this.next >= pool) this.next = 0;
      const i = this.next++;
      const s = this.sparks[i];
      if (s.life <= 0) this.active++;
      const a = Math.random() * Math.PI * 2;
      const r = o.spread;
      const sp = o.speed * (0.55 + Math.random() * 0.7);
      const hx = dirX * (1 - r) + Math.cos(a) * (r + (1 - r) * 0.45);
      const hz = dirZ * (1 - r) + Math.sin(a) * (r + (1 - r) * 0.45);
      s.life = s.max = o.life * (0.7 + Math.random() * 0.3);
      s.x = x + (Math.random() - 0.5) * 0.25; s.y = y + (Math.random() - 0.5) * 0.3; s.z = z + (Math.random() - 0.5) * 0.25;
      s.vx = hx * sp; s.vz = hz * sp; s.vy = o.up * (0.5 + Math.random() * 0.8);
      s.rx = Math.random() * 6.28; s.ry = Math.random() * 6.28;
      s.sx = (Math.random() - 0.5) * 22; s.sy = (Math.random() - 0.5) * 22;
      s.size = o.size * (0.65 + Math.random() * 0.7);
      s.g = o.gravity;
      mesh.setColorAt(i, _c.setHex(o.colors[k % o.colors.length]));
    }
    if (n > 0) {
      mesh.instanceColor!.needsUpdate = true;
      mesh.visible = true;
    }
  }

  public update(delta: number) {
    const mesh = this.mesh;
    if (!mesh || this.active <= 0) return;
    let alive = 0;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) continue;
      s.life -= delta;
      if (s.life <= 0) { mesh.setMatrixAt(i, _zero); continue; }
      alive++;
      const damp = Math.max(0, 1 - 2.2 * delta);
      s.vx *= damp; s.vz *= damp;
      s.vy -= s.g * delta;
      s.x += s.vx * delta; s.y += s.vy * delta; s.z += s.vz * delta;
      s.rx += s.sx * delta; s.ry += s.sy * delta;
      const t = s.life / s.max;
      // 先撐滿 (彈出) 再縮小消失：不透明材質以尺寸淡出
      const k = t > 0.8 ? 1 : t / 0.8;
      _q.setFromEuler(_e.set(s.rx, s.ry, 0));
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s.setScalar(s.size * k));
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.active = alive;
    if (alive === 0) mesh.visible = false;
  }
}

export const hitSparkFX = new HitSparkSystem();
