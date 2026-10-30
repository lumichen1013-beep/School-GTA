import * as THREE from 'three';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';

// 撞擊碎石煙塵爆散特效 (固定物件池以單一 InstancedMesh 繪製、共用幾何與材質，執行期零配置)
const POOL_SIZE = 24;
const LIFE = 0.6;
const GRAVITY = -9.0;

interface DustParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  life: number;
}

const _geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const _mat = new THREE.MeshBasicMaterial({ color: 0x6f665c, transparent: true, opacity: 0.95, depthWrite: false });
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export interface ImpactDustOptions {
  count?: number;
  upward?: number;
  spreadY?: number;
  life?: number;
  size?: number;
}

class ImpactDustSystem {
  private particles: DustParticle[] = [];
  private mesh: THREE.InstancedMesh | null = null;
  private activeCount = 0;

  private ensure(scene: THREE.Object3D): THREE.InstancedMesh {
    if (!this.mesh) {
      this.mesh = new THREE.InstancedMesh(_geo, _mat, POOL_SIZE);
      this.mesh.frustumCulled = false; // 粒子每幀移動，略過整體包圍球剔除
      updateVisibleMatricesOnly(this.mesh); // 閒置隱藏時略過矩陣更新
      for (let i = 0; i < POOL_SIZE; i++) {
        this.mesh.setMatrixAt(i, _zeroMatrix);
        this.particles.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), rotation: new THREE.Euler(), scale: 1, life: 0 });
      }
    }
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    return this.mesh;
  }

  // 預建 mesh 並暫時顯示以便 renderer.compile 預熱 shader (粒子全為歸零矩陣，下次 burst 前不顯示)
  public prewarm(scene: THREE.Object3D, compile: () => void) {
    const mesh = this.ensure(scene);
    mesh.visible = true;
    compile();
    mesh.visible = this.activeCount > 0;
  }

  // 於 point 爆散碎石，沿 normal (撞擊反彈方向) 噴出
  // opts：count 碎石數 (預設全部)、upward 上拋速度倍率 (預設 1)、spreadY 起點垂直散布範圍 (預設 1.2)、life 壽命秒數 (預設 LIFE)、size 碎石尺寸倍率 (預設 1)
  public burst(scene: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3, opts?: ImpactDustOptions) {
    const mesh = this.ensure(scene);
    const count = Math.min(this.particles.length, opts?.count ?? this.particles.length);
    const upward = opts?.upward ?? 1;
    const spreadY = opts?.spreadY ?? 1.2;
    const life = opts?.life ?? LIFE;
    const size = opts?.size ?? 1;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (i >= count) {
        p.life = 0;
        mesh.setMatrixAt(i, _zeroMatrix);
        continue;
      }
      p.life = life * (0.7 + Math.random() * 0.3);
      p.position.set(
        point.x + (Math.random() - 0.5) * 0.6,
        point.y + (Math.random() - 0.5) * spreadY,
        point.z + (Math.random() - 0.5) * 0.6
      );
      p.scale = (0.6 + Math.random() * 0.9) * size;
      p.rotation.set(0, 0, 0);
      p.velocity.set(
        normal.x * (2.0 + Math.random() * 3.0) + (Math.random() - 0.5) * 3.0,
        (1.5 + Math.random() * 3.5) * upward,
        normal.z * (2.0 + Math.random() * 3.0) + (Math.random() - 0.5) * 3.0
      );
    }
    this.activeCount = count;
    mesh.visible = true;
  }

  // 由主迴圈每幀呼叫 (與總教官是否仍在場景無關，粒子必定播完消散)
  public update(delta: number) {
    if (this.activeCount <= 0 || !this.mesh) return;
    let alive = 0;
    let maxLife = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= delta;
      if (p.life <= 0) {
        this.mesh.setMatrixAt(i, _zeroMatrix);
        continue;
      }
      alive++;
      if (p.life > maxLife) maxLife = p.life;
      p.velocity.y += GRAVITY * delta;
      p.position.addScaledVector(p.velocity, delta);
      p.rotation.x += delta * 8.0;
      p.rotation.y += delta * 6.0;
      _matrix.compose(p.position, _quat.setFromEuler(p.rotation), _scale.setScalar(p.scale));
      this.mesh.setMatrixAt(i, _matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // 共用材質整體淡出 (以最長剩餘壽命決定透明度)
    _mat.opacity = 0.95 * Math.min(1, maxLife / (LIFE * 0.5));
    this.activeCount = alive;
    if (alive === 0) this.mesh.visible = false;
  }
}

export const impactDust = new ImpactDustSystem();
