import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { freezeLocalMatrix, updateVisibleMatricesOnly } from '../src/core/matrixUpdate';

const posOf = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).toArray();

// 檢查子樹內每個可見物件 matrixWorld = parent.matrixWorld × matrix
function inconsistentVisible(root: THREE.Object3D): number {
  let bad = 0;
  const m = new THREE.Matrix4();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if (o.parent) {
      m.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      if (!m.equals(o.matrixWorld)) bad++;
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return bad;
}

// 場景 (凍結根矩陣，同 Engine) > npc(會移動) > [body(靜態), arm(動畫) > hand, hidden > deep]
function build() {
  const scene = new THREE.Scene();
  scene.matrixAutoUpdate = false;
  const npc = new THREE.Group();
  const body = new THREE.Mesh();
  body.position.set(0, 1, 0);
  const arm = new THREE.Mesh();
  arm.position.set(0.5, 1, 0);
  const hand = new THREE.Mesh();
  hand.position.set(0, -0.5, 0);
  const hidden = new THREE.Group();
  hidden.position.set(0, 2, 0);
  hidden.visible = false;
  const deep = new THREE.Mesh();
  deep.position.set(0, 0, 1);
  arm.add(hand);
  hidden.add(deep);
  npc.add(body, arm, hidden);
  scene.add(npc);
  freezeLocalMatrix(body);
  updateVisibleMatricesOnly(npc);
  return { scene, npc, body, arm, hand, hidden, deep };
}

describe('freezeLocalMatrix 靜止零件凍結本地矩陣', () => {
  it('凍結時算好本地矩陣並關閉自動重組；父節點移動時世界矩陣仍跟隨', () => {
    const { scene, npc, body } = build();
    expect(body.matrixAutoUpdate).toBe(false);
    npc.position.set(10, 0, 0);
    scene.updateMatrixWorld();
    expect(posOf(body)).toEqual([10, 1, 0]);
  });
});

describe('updateVisibleMatricesOnly 只更新可見子樹', () => {
  it('可見零件每幀隨父節點與自身動畫更新', () => {
    const { scene, npc, arm, hand } = build();
    npc.position.set(3, 0, 0);
    arm.rotation.z = Math.PI;
    scene.updateMatrixWorld();
    expect(posOf(arm)).toEqual([3.5, 1, 0]);
    const [x, y] = posOf(hand);
    expect(x).toBeCloseTo(3.5);
    expect(y).toBeCloseTo(1.5);
    expect(inconsistentVisible(scene)).toBe(0);
  });

  it('隱藏子樹不更新；重新顯示後同一次更新即補算 (不錯位一幀)', () => {
    const { scene, npc, hidden, deep } = build();
    scene.updateMatrixWorld();
    const before = deep.matrixWorld.clone();
    npc.position.set(5, 0, 0);
    scene.updateMatrixWorld();
    expect(deep.matrixWorld.equals(before)).toBe(true); // 隱藏中：停在原值
    hidden.visible = true;
    scene.updateMatrixWorld();
    expect(posOf(deep)).toEqual([5, 2, 1]);
    expect(inconsistentVisible(scene)).toBe(0);
  });

  it('根節點隱藏時整棵略過 (父節點強制更新亦同)，顯示後正確', () => {
    const { scene, npc, arm } = build();
    const parentGroup = new THREE.Group(); // 本地矩陣自動更新 → 每幀對子節點 force
    scene.add(parentGroup);
    parentGroup.add(npc);
    scene.updateMatrixWorld();
    const before = arm.matrixWorld.clone();
    npc.visible = false;
    npc.position.set(-4, 0, 0);
    scene.updateMatrixWorld();
    expect(arm.matrixWorld.equals(before)).toBe(true);
    npc.visible = true;
    scene.updateMatrixWorld();
    expect(posOf(arm)).toEqual([-3.5, 1, 0]);
    expect(inconsistentVisible(scene)).toBe(0);
  });

  it('子樹內自訂世界矩陣更新的物件 (攝影機) 交回其實作', () => {
    const { scene, npc } = build();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 0, 5);
    npc.add(cam);
    npc.position.set(1, 0, 0);
    scene.updateMatrixWorld();
    expect(posOf(cam)).toEqual([1, 0, 5]);
    expect(cam.matrixWorldInverse.clone().invert().equals(cam.matrixWorld)).toBe(true);
  });

  it('updateWorldMatrix(true, false) 仍可在隱藏中自行取得最新世界座標', () => {
    const { scene, npc, deep } = build();
    scene.updateMatrixWorld();
    npc.position.set(7, 0, 0);
    deep.updateWorldMatrix(true, false);
    expect(posOf(deep)).toEqual([7, 2, 1]);
  });
});

describe('特效閒置時 update 提早結束', () => {
  it('殘影池：全部淡出後不再逐一更新，hideAll 後亦同', async () => {
    const { AfterimagePool } = await import('../src/entities/shared/AfterimagePool');
    const scene = new THREE.Scene();
    const pool = new AfterimagePool(scene, 2);
    const groups = scene.children as THREE.Group[];
    expect(groups.every(g => g.updateMatrixWorld !== THREE.Object3D.prototype.updateMatrixWorld)).toBe(true);
    pool.spawn(0xffffff, 0.2, new THREE.Vector3(1, 0, 0), new THREE.Euler());
    expect(groups[0].visible).toBe(true);
    pool.update(0.1);
    expect(groups[0].visible).toBe(true);
    pool.update(0.2);
    expect(groups[0].visible).toBe(false);
    const mat = (groups[0].children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const opacity = mat.opacity;
    pool.update(0.1);
    expect(mat.opacity).toBe(opacity);
    pool.spawn(0xffffff, 0.2, new THREE.Vector3(), new THREE.Euler());
    pool.hideAll();
    expect(groups.every(g => !g.visible)).toBe(true);
  });

  it('揮擊拖尾：閒置不上傳頂點，有點時照常更新並於淡出後回到閒置', async () => {
    // 最小 DOM：柔邊貼圖畫布與裝置判定
    const ctx = { createLinearGradient: () => ({ addColorStop() {} }), clearRect() {}, fillRect() {}, fillStyle: '' };
    const g = globalThis as Record<string, unknown>;
    g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    g.window = { innerWidth: 1920 };
    const { swingTrail } = await import('../src/effects/SwingTrail');
    const scene = new THREE.Scene();
    swingTrail.init(scene);
    const mesh = scene.children[0] as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v0 = pos.version;
    const fill = vi.spyOn(pos.array as Float32Array, 'fill');
    swingTrail.update(0.016);
    expect(pos.version).toBe(v0);
    expect(fill).not.toHaveBeenCalled(); // 閒置不逐槽清除緩衝
    swingTrail.begin(0, { color: 0xff0000, tipColor: 0xffffff, intensity: 1, life: 0.1 } as never, false);
    swingTrail.push(0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    swingTrail.push(0, new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0));
    swingTrail.update(0.016);
    expect(mesh.visible).toBe(true);
    expect(pos.version).toBeGreaterThan(v0);
    swingTrail.end(0);
    swingTrail.update(0.2); // 超過壽命：清空並隱藏 (最後一次上傳歸零緩衝)
    expect(mesh.visible).toBe(false);
    expect((pos.array as Float32Array).every(v => v === 0)).toBe(true);
    const v1 = pos.version;
    fill.mockClear();
    swingTrail.update(0.016);
    expect(pos.version).toBe(v1);
    expect(fill).not.toHaveBeenCalled();
    fill.mockRestore();
    delete g.document;
    delete g.window;
  });
});
