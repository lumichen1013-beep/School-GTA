import * as THREE from 'three';
import { updateVisibleMatricesOnly } from '../../core/matrixUpdate';

interface AfterimageItem {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

// 0-GC 人形殘影物件池 (常駐場景循環使用，避免技能施放時頻繁建立物件)
export class AfterimagePool {
  private items: AfterimageItem[] = [];
  private index: number = 0;
  private anyActive = false; // 有殘影存活中 (閒置時 update 直接略過)

  constructor(scene: THREE.Scene, count: number = 8) {
    const torsoGeo = new THREE.BoxGeometry(0.65, 0.75, 0.35);
    const headGeo = new THREE.BoxGeometry(0.38, 0.4, 0.38);
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);

    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      g.rotation.order = 'YXZ';
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });

      // 子物件順序固定：0 軀幹、1 頭、2 左臂、3 右臂、4 左腿、5 右腿
      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.y = 1.05;
      g.add(torso);

      const head = new THREE.Mesh(headGeo, mat);
      head.position.y = 1.62;
      g.add(head);

      const lArm = new THREE.Mesh(armGeo, mat);
      lArm.position.set(-0.45, 1.05, 0);
      g.add(lArm);

      const rArm = new THREE.Mesh(armGeo, mat);
      rArm.position.set(0.45, 1.05, 0);
      g.add(rArm);

      const lLeg = new THREE.Mesh(legGeo, mat);
      lLeg.position.set(-0.18, 0.35, 0);
      g.add(lLeg);

      const rLeg = new THREE.Mesh(legGeo, mat);
      rLeg.position.set(0.18, 0.35, 0);
      g.add(rLeg);

      g.visible = false;
      updateVisibleMatricesOnly(g); // 閒置隱藏時略過整組矩陣更新
      scene.add(g);

      this.items.push({ group: g, material: mat, life: 0, maxLife: 0.3 });
    }
  }

  // 於指定位置複製當下姿勢產生一個殘影 (肢體可為 undefined，如非人形角色)
  public spawn(
    colorHex: number,
    duration: number,
    position: THREE.Vector3,
    rootRotation: THREE.Euler,
    head?: THREE.Object3D,
    leftArm?: THREE.Object3D,
    rightArm?: THREE.Object3D,
    leftLeg?: THREE.Object3D,
    rightLeg?: THREE.Object3D
  ) {
    if (this.items.length === 0) return;
    const item = this.items[this.index];
    this.index = (this.index + 1) % this.items.length;

    item.material.color.setHex(colorHex);
    item.material.opacity = 0.75;
    item.life = duration;
    item.maxLife = duration;

    item.group.position.copy(position);
    item.group.rotation.copy(rootRotation);

    const children = item.group.children;
    if (head && children[1]) children[1].rotation.copy(head.rotation);
    if (leftArm && children[2]) children[2].rotation.copy(leftArm.rotation);
    if (rightArm && children[3]) children[3].rotation.copy(rightArm.rotation);
    if (leftLeg && children[4]) children[4].rotation.copy(leftLeg.rotation);
    if (rightLeg && children[5]) children[5].rotation.copy(rightLeg.rotation);

    item.group.visible = true;
    this.anyActive = true;
  }

  // 每幀更新殘影透明度與生命週期
  public update(delta: number) {
    if (!this.anyActive) return;
    let alive = false;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.life > 0) {
        item.life -= delta;
        if (item.life <= 0) {
          item.life = 0;
          item.group.visible = false;
        } else {
          const ratio = item.life / item.maxLife;
          item.material.opacity = 0.75 * Math.sin(ratio * Math.PI * 0.5);
          alive = true;
        }
      }
    }
    this.anyActive = alive;
  }

  public hideAll() {
    for (const item of this.items) {
      item.life = 0;
      item.group.visible = false;
    }
    this.anyActive = false;
  }

  public dispose(scene?: THREE.Scene) {
    for (const item of this.items) {
      if (scene) scene.remove(item.group);
      else if (item.group.parent) item.group.parent.remove(item.group);
      item.material.dispose();
    }
  }
}
