import type * as THREE from 'three';
import { getHitFlashMaterial } from '../entities/npc/modelCache';

// NPC 受擊閃白 (全武器共通)：命中瞬間把該 NPC 的烘焙部位 (共用 lambert 材質) 換成共用的發光版本 FLASH_TIME 秒後換回。
// 不改共用材質本身 (其他 NPC 不受影響)、不新增 draw call (部位本來就是各自的 Mesh)、不新增 shader program (同類型同 defines)。
// 同時閃白上限 MAX_FLASH 人 (群攻)，超出者略過；陣列預建、執行期零配置。
export const FLASH_TIME = 0.09;
const MAX_FLASH = 8;

interface Entry { root: THREE.Object3D | null; timer: number; meshes: THREE.Mesh[]; orig: THREE.Material[] }
const entries: Entry[] = Array.from({ length: MAX_FLASH }, () => ({ root: null, timer: 0, meshes: [], orig: [] }));
let active = 0;
let collecting: Entry | null = null;

function collect(obj: THREE.Object3D) {
  const mesh = obj as THREE.Mesh;
  if (!mesh.isMesh || !collecting || Array.isArray(mesh.material)) return;
  const flash = getHitFlashMaterial(mesh.material);
  if (!flash) return;
  collecting.meshes.push(mesh);
  collecting.orig.push(mesh.material);
  mesh.material = flash;
}

function restore(e: Entry) {
  for (let i = 0; i < e.meshes.length; i++) e.meshes[i].material = e.orig[i];
  e.meshes.length = 0;
  e.orig.length = 0;
  e.root = null;
  e.timer = 0;
}

export const npcHitFlash = {
  // 對 root (NPC 模型根節點) 閃白；已在閃白中則重設計時
  flash(root: THREE.Object3D, time: number = FLASH_TIME) {
    let free: Entry | null = null;
    for (const e of entries) {
      if (e.root === root) { e.timer = time; return; }
      if (!e.root && !free) free = e;
    }
    if (!free) return;
    free.root = root;
    free.timer = time;
    collecting = free;
    root.traverse(collect);
    collecting = null;
    if (free.meshes.length === 0) { free.root = null; return; }
    active++;
  },

  update(delta: number) {
    if (active === 0) return;
    for (const e of entries) {
      if (!e.root) continue;
      e.timer -= delta;
      if (e.timer <= 0) { restore(e); active--; }
    }
  },

  // 全部還原 (切換世界 / 重生)
  reset() {
    for (const e of entries) if (e.root) restore(e);
    active = 0;
  },

  isFlashing(root: THREE.Object3D): boolean {
    for (const e of entries) if (e.root === root) return true;
    return false;
  }
};
