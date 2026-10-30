import type * as THREE from 'three';
import type { NPC } from '../entities/NPC';

const SURROUND_INTERVAL = 0.3; // 包夾站位重新指派間隔 (s)
const SURROUND_RANGE_SQ = 36.0; // 6m 內追捕中的戰鬥積極角色參與包夾
const TWO_PI = Math.PI * 2;
const bySurroundBearing = (a: NPC, b: NPC) => a.surroundBearing - b.surroundBearing;

/**
 * 等角環繞站位：依各自方位角 (surroundBearing) 排序 group (就地)，回傳整體旋轉偏移，
 * 第 i 人站位 = 偏移 + i * (360/n 度)，使各站位貼近各自目前方位以減少交錯
 */
export function fitEvenRing(group: NPC[]): number {
  const count = group.length;
  group.sort(bySurroundBearing);
  const step = TWO_PI / count;
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < count; i++) {
    const a = group[i].surroundBearing - i * step;
    sx += Math.sin(a);
    sz += Math.cos(a);
  }
  return Math.atan2(sx, sz);
}

/**
 * 多人包夾 (低頻)：玩家 6m 內 2 名以上追捕中的戰鬥積極角色 (第二世界特訓群 / 校園執法者)，
 * 依目前方位角排序後分配等角環繞站位 (360/n 度)，以整體旋轉偏移貼近各自方位以減少交錯；
 * 站位被障礙物佔據者改為直接逼近
 */
export class SurroundCoordinator {
  private timer: number = 0;
  private readonly group: NPC[] = [];

  public update(delta: number, npcs: readonly NPC[], playerPos: THREE.Vector3) {
    this.timer -= delta;
    if (this.timer > 0) return;
    this.timer = SURROUND_INTERVAL;
    const group = this.group;
    group.length = 0;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      n.hasSurroundSlot = false;
      if (!n.hasAggressiveCombat || !n.isChasing || n.isInvestigatingNoise || n.lostSightTimer > 0) continue;
      if (n.isKnockedDown || n.isPermanentlyKnockedOut || n.isKnockedFlying) continue;
      const dx = n.position.x - playerPos.x;
      const dz = n.position.z - playerPos.z;
      if (dx * dx + dz * dz > SURROUND_RANGE_SQ || Math.abs(n.position.y - playerPos.y) > 2.0) continue;
      n.surroundBearing = Math.atan2(dx, dz);
      group.push(n);
    }
    if (group.length < 2) return;
    const base = fitEvenRing(group);
    const step = TWO_PI / group.length;
    for (let i = 0; i < group.length; i++) group[i].assignSurroundSlot(base + i * step, playerPos.x, playerPos.z);
  }
}
