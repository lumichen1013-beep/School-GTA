import type * as THREE from 'three';
import { WEAPONS, WEAPON_OVERRIDES } from './registry';
import type { WeaponDisplayId, WeaponHand, WeaponModelHandle } from './types';

interface RigEntry { readonly id: WeaponDisplayId; readonly handle: WeaponModelHandle }

/**
 * 玩家手持武器掛載：建構時依武器槽順序 + 場景覆寫預建所有模型並掛上手臂 (執行期不 new)，
 * 之後只切換顯示、蹲姿反縮放與材質發光。
 */
export class WeaponRig {
  private readonly entries: RigEntry[] = [];
  private readonly byId: Partial<Record<WeaponDisplayId, WeaponModelHandle>> = {};

  constructor(rightArm: THREE.Object3D, leftArm: THREE.Object3D) {
    const add = (id: WeaponDisplayId, spec: { build(): WeaponModelHandle } | undefined) => {
      if (!spec) return;
      const handle = spec.build();
      if (handle.parts.R) rightArm.add(handle.parts.R);
      if (handle.parts.L) leftArm.add(handle.parts.L);
      this.entries.push({ id, handle });
      this.byId[id] = handle;
    };
    for (const def of WEAPONS) add(def.id, def.model);
    for (const def of Object.values(WEAPON_OVERRIDES)) add(def.id, def.model);
  }

  // 只顯示指定武器的模型 (無模型者如徒手 → 全部隱藏)
  public show(id: WeaponDisplayId) {
    for (let i = 0; i < this.entries.length; i++) {
      const { id: eid, handle } = this.entries[i];
      const on = eid === id;
      if (handle.parts.R) handle.parts.R.visible = on;
      if (handle.parts.L) handle.parts.L.visible = on;
    }
  }

  // 指定武器的持握手模型節點 (錨點取樣 / 棒尖座標用)；無模型時回傳 null
  public part(id: WeaponDisplayId, hand: WeaponHand): THREE.Object3D | null {
    return this.byId[id]?.parts[hand] ?? null;
  }

  public canGlow(id: WeaponDisplayId): boolean {
    return !!this.byId[id]?.glow;
  }

  public glow(id: WeaponDisplayId, k: number, peak: number, color: number) {
    this.byId[id]?.glow?.(k, peak, color);
  }

  // 瞄準姿勢模型變化 (彈弓橡皮筋拉伸等)；該武器無 aim 時不處理
  public setAim(id: WeaponDisplayId, ratio: number) {
    this.byId[id]?.aim?.(ratio);
  }

  // 還原所有武器材質原值
  public resetGlow() {
    for (let i = 0; i < this.entries.length; i++) this.entries[i].handle.resetGlow();
  }

  // 蹲姿手臂縮短時，手上武器維持原尺寸
  public setInvScale(s: number) {
    for (let i = 0; i < this.entries.length; i++) {
      const { parts } = this.entries[i].handle;
      if (parts.R) parts.R.scale.setScalar(s);
      if (parts.L) parts.L.scale.setScalar(s);
    }
  }
}
