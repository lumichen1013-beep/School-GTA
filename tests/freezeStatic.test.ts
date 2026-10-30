import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { freezeStatic } from '../src/world/sceneUtils';

// 場景：scene(凍結) > root > [staticA > staticA1, mixed > [staticB, door]]
function build() {
  const scene = new THREE.Scene();
  scene.matrixAutoUpdate = false;
  const root = new THREE.Group();
  const staticA = new THREE.Group();
  staticA.position.set(10, 0, 0);
  const staticA1 = new THREE.Mesh();
  staticA1.position.set(0, 2, 0);
  const mixed = new THREE.Group();
  mixed.position.set(0, 0, 5);
  const staticB = new THREE.Mesh();
  const door = new THREE.Mesh();
  staticA.add(staticA1);
  mixed.add(staticB, door);
  root.add(staticA, mixed);
  scene.add(root);
  freezeStatic(root, new Set([door]));
  return { scene, root, staticA, staticA1, mixed, staticB, door };
}

describe('freezeStatic 靜態矩陣凍結', () => {
  it('凍結時一次算好世界矩陣', () => {
    const { staticA1 } = build();
    expect(new THREE.Vector3().setFromMatrixPosition(staticA1.matrixWorld).toArray()).toEqual([10, 2, 0]);
  });

  it('靜態物件關閉 matrixAutoUpdate，排除物件維持自動更新', () => {
    const { root, staticA, staticA1, mixed, staticB, door } = build();
    for (const o of [root, staticA, staticA1, mixed, staticB]) expect(o.matrixAutoUpdate).toBe(false);
    expect(door.matrixAutoUpdate).toBe(true);
  });

  it('只有完全靜態子樹的最上層節點略過世界矩陣走訪；root 與含排除物件的節點維持走訪', () => {
    const { root, staticA, staticA1, mixed, staticB, door } = build();
    expect(root.matrixWorldAutoUpdate).toBe(true);
    expect(mixed.matrixWorldAutoUpdate).toBe(true);
    expect(door.matrixWorldAutoUpdate).toBe(true);
    expect(staticA.matrixWorldAutoUpdate).toBe(false);
    expect(staticB.matrixWorldAutoUpdate).toBe(false);
    expect(staticA1.matrixWorldAutoUpdate).toBe(true); // 父節點已略過，不需重複設定
  });

  it('排除物件移動後世界矩陣正確跟隨；root 下新增的動態子物件亦會更新', () => {
    const { scene, root, door } = build();
    door.position.set(3, 0, 0);
    const ball = new THREE.Mesh();
    root.add(ball);
    ball.position.set(0, 7, 0);
    scene.updateMatrixWorld();
    expect(new THREE.Vector3().setFromMatrixPosition(door.matrixWorld).toArray()).toEqual([3, 0, 5]);
    expect(new THREE.Vector3().setFromMatrixPosition(ball.matrixWorld).toArray()).toEqual([0, 7, 0]);
  });
});
