import * as THREE from 'three';

// 撞擊碎石煙塵爆散特效 (固定物件池、共用幾何與材質，執行期零配置)
const POOL_SIZE = 24;
const LIFE = 0.6;
const GRAVITY = -9.0;

interface DustParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

const _geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const _mat = new THREE.MeshBasicMaterial({ color: 0x6f665c, transparent: true, opacity: 0.95, depthWrite: false });

class ImpactDustSystem {
  private particles: DustParticle[] = [];
  private group: THREE.Group | null = null;
  private activeCount = 0;

  private ensure(scene: THREE.Object3D) {
    if (!this.group) {
      this.group = new THREE.Group();
      for (let i = 0; i < POOL_SIZE; i++) {
        const mesh = new THREE.Mesh(_geo, _mat);
        mesh.visible = false;
        this.group.add(mesh);
        this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
      }
    }
    if (this.group.parent !== scene) scene.add(this.group);
  }

  // 於 point 爆散碎石，沿 normal (撞擊反彈方向) 噴出
  public burst(scene: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3) {
    this.ensure(scene);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life = LIFE * (0.7 + Math.random() * 0.3);
      p.mesh.visible = true;
      p.mesh.position.set(
        point.x + (Math.random() - 0.5) * 0.6,
        point.y + (Math.random() - 0.5) * 1.2,
        point.z + (Math.random() - 0.5) * 0.6
      );
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
      p.velocity.set(
        normal.x * (2.0 + Math.random() * 3.0) + (Math.random() - 0.5) * 3.0,
        1.5 + Math.random() * 3.5,
        normal.z * (2.0 + Math.random() * 3.0) + (Math.random() - 0.5) * 3.0
      );
    }
    this.activeCount = this.particles.length;
  }

  public update(delta: number) {
    if (this.activeCount <= 0) return;
    let alive = 0;
    let maxLife = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= delta;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      alive++;
      if (p.life > maxLife) maxLife = p.life;
      p.velocity.y += GRAVITY * delta;
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.mesh.rotation.x += delta * 8.0;
      p.mesh.rotation.y += delta * 6.0;
    }
    // 共用材質整體淡出 (以最長剩餘壽命決定透明度)
    _mat.opacity = 0.95 * Math.min(1, maxLife / (LIFE * 0.5));
    this.activeCount = alive;
  }
}

export const impactDust = new ImpactDustSystem();
