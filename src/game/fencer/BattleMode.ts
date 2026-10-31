import type * as THREE from 'three';

// 花劍客戰鬥模式的場景卸載 / 恢復 (與卸載完全對稱，不重建任何物件)：
// - detach：整群自場景圖移除 (校園靜態場景、生態園、NPC 根節點)，戰後掛回原父節點
// - hide：只切 visible (腳踏車、籃球、競速陪跑模型等掛在場景根的動態物件)，戰後還原原本的 visible
// 靜態群組的 matrixWorld 已於 freezeStatic 算好，卸下期間無人改動 → 掛回後不需重算。

export interface BattleModeTargets {
  /** 分兩批卸載：第一批 (白閃那一幀) NPC / 腳踏車 / 生態園；第二批 (結界升滿) 校園靜態場景 */
  actorsDetach: () => readonly THREE.Object3D[];
  actorsHide: () => readonly THREE.Object3D[];
  worldDetach: () => readonly THREE.Object3D[];
}

interface DetachRecord { obj: THREE.Object3D; parent: THREE.Object3D }
interface HideRecord { obj: THREE.Object3D; visible: boolean }

export class BattleModeSwitch {
  private readonly detached: DetachRecord[] = [];
  private readonly hidden: HideRecord[] = [];
  public actorsUnloaded = false;
  public worldUnloaded = false;

  constructor(private readonly targets: BattleModeTargets) {}

  public get active(): boolean {
    return this.actorsUnloaded || this.worldUnloaded;
  }

  private detach(list: readonly THREE.Object3D[]) {
    for (const obj of list) {
      const parent = obj.parent;
      if (!parent) continue;
      this.detached.push({ obj, parent });
      parent.remove(obj);
    }
  }

  /** 第一批：NPC、腳踏車、生態園 (重複呼叫無作用) */
  public unloadActors() {
    if (this.actorsUnloaded) return;
    this.actorsUnloaded = true;
    this.detach(this.targets.actorsDetach());
    for (const obj of this.targets.actorsHide()) {
      this.hidden.push({ obj, visible: obj.visible });
      obj.visible = false;
    }
  }

  /** 第二批：校園靜態場景 (重複呼叫無作用) */
  public unloadWorld() {
    if (this.worldUnloaded) return;
    this.worldUnloaded = true;
    this.detach(this.targets.worldDetach());
  }

  /** 恢復：依卸載的相反順序掛回原父節點、還原 visible (重複呼叫無作用) */
  public restore() {
    for (let i = this.detached.length - 1; i >= 0; i--) {
      const { obj, parent } = this.detached[i];
      if (obj.parent !== parent) parent.add(obj);
    }
    for (let i = this.hidden.length - 1; i >= 0; i--) this.hidden[i].obj.visible = this.hidden[i].visible;
    this.detached.length = 0;
    this.hidden.length = 0;
    this.actorsUnloaded = false;
    this.worldUnloaded = false;
  }
}
