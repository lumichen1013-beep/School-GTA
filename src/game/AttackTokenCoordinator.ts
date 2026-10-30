import type * as THREE from 'three';
import type { NPC } from '../entities/NPC';
import { fitEvenRing } from './SurroundCoordinator';

const TOKEN_COUNT = 2; // 同時最多實際出招人數
const TICK = 0.1; // 低頻指派間隔 (s)
const ENGAGE_RANGE_SQ = 25.0; // 玩家 5m 內 (同樓層) 追捕中的角色參與圍攻
const ENGAGE_MAX_DY = 2.0;
const RELEASE_GAP = 0.3; // 出手方招式結束後的換手間隔 (s)
const MAX_IDLE = 1.5; // 持有權杖遲遲未出招即換手 (s)
const WAIT_TIE = 0.05; // 等待時間相差在此內視為同等，改取較近者
const RING_LEAD = 0.3; // 外圈站位領先目前方位的角度 (rad)：整圈持續緩慢側移
const TWO_PI = Math.PI * 2;
// 做樣子揮空 (不造成傷害、不佔權杖)：圍攻 3 人以上時，全場同時最多 1 人
const WHIFF_MIN_ENGAGED = 3;
const WHIFF_GAP_MIN = 0.9; // 一次揮空結束後至下一次的全域間隔 (s)
const WHIFF_GAP_RAND = 1.2;
const WHIFF_CD_MIN = 3.0; // 單人揮空間隔 (s)
const WHIFF_CD_RAND = 3.0;
const WHIFF_LANE_LEN = 2.2; // 揮空方向前方需淨空的長度 (m)
const WHIFF_LANE_HALF_WIDTH_SQ = 0.36; // 揮空方向兩側 0.6m 內有其他角色即放棄

interface TokenSlot {
  holder: NPC | null;
  gap: number;
  holdTime: number;
  attacked: boolean;
}

/**
 * 第一世界圍攻出手權杖 (低頻)：玩家 5m 內可有任意人數圍攻，但同時最多 2 人實際出招
 * (功夫招式、執法者招牌技、犬類/即時攻擊)，且執法者 (主任教官 / 生教組長) 同時最多 1 人持有權杖 (輪流出手)。
 * 未持權杖者 attackHold 不出招，於約 2.75m 外圈等角站位 (fitEvenRing) 面向玩家緩慢側移；
 * 持有者招式結束 (含被打斷)、倒地/擊飛、離開範圍或 1.5 秒未出招即釋放，間隔 0.3 秒後交給等最久者 (同等取較近)。
 * 無人競爭 (人數不超過權杖數且未有兩名執法者) 時全員照常出手。
 * 單車糾察 (騎車中) 不參與；玩家騎車時整套暫停，沿用原本追車節奏。
 */
export class AttackTokenCoordinator {
  private timer: number = TICK; // 首幀即指派
  private active: boolean = false;
  private readonly slots: TokenSlot[] = [];
  private readonly candidates: NPC[] = [];
  private readonly waiters: NPC[] = [];
  private ringDir: number = 1;
  private ringFlipTimer: number = 5.0;
  private whiffNpc: NPC | null = null;
  private whiffGap: number = 0;

  constructor() {
    for (let i = 0; i < TOKEN_COUNT; i++) this.slots.push({ holder: null, gap: 0, holdTime: 0, attacked: false });
  }

  // 清除所有圍攻旗標 (切換世界、玩家騎車時)
  public reset(npcs: readonly NPC[]) {
    this.timer = TICK;
    if (!this.active) return;
    this.active = false;
    for (let i = 0; i < npcs.length; i++) this.clearNpc(npcs[i]);
    for (const s of this.slots) {
      s.holder = null;
      s.gap = 0;
    }
    this.whiffNpc = null;
  }

  public update(delta: number, npcs: readonly NPC[], playerPos: THREE.Vector3) {
    this.timer += delta;
    if (this.timer < TICK) return;
    const dt = this.timer;
    this.timer = 0;
    this.active = true;

    // 1. 參與圍攻名單
    const candidates = this.candidates;
    candidates.length = 0;
    let enforcerCount = 0;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      if (this.isCandidate(n, playerPos)) {
        candidates.push(n);
        if (n.isEnforcer) enforcerCount++;
      } else {
        this.clearNpc(n);
      }
    }
    const contention = candidates.length > TOKEN_COUNT || enforcerCount >= 2;

    // 2. 權杖持有者狀態：招式結束或閒置過久即釋放 (無人競爭時僅重新計時)
    const slots = this.slots;
    for (const s of slots) {
      if (s.gap > 0) s.gap -= dt;
      const h = s.holder;
      if (!h) continue;
      if (candidates.indexOf(h) < 0) {
        this.release(s);
        continue;
      }
      s.holdTime += dt;
      if (h.isMeleeAttacking) {
        s.attacked = true;
      } else if (s.attacked || s.holdTime > MAX_IDLE) {
        if (contention) this.release(s);
        else {
          s.holdTime = 0;
          s.attacked = false;
        }
      }
    }

    // 3. 空出的權杖交給等最久者 (同等取較近；正在出招者優先；執法者同時最多一人)
    for (const s of slots) {
      if (s.holder || (contention && s.gap > 0)) continue;
      const next = this.pickNext(playerPos);
      if (!next) break;
      s.holder = next;
      s.gap = 0;
      s.holdTime = 0;
      s.attacked = false;
    }

    // 4. 套用旗標：持有者照常追擊出手，其餘於外圈等待
    const waiters = this.waiters;
    waiters.length = 0;
    for (let i = 0; i < candidates.length; i++) {
      const n = candidates[i];
      if (this.isHolder(n)) {
        n.attackHold = false;
        n.tokenWaitTime = 0;
        n.setRingWait(false);
      } else {
        n.attackHold = true;
        n.tokenWaitTime += dt;
        n.surroundBearing = Math.atan2(n.position.x - playerPos.x, n.position.z - playerPos.z);
        waiters.push(n);
      }
    }
    if (waiters.length === 0) {
      this.whiffNpc = null;
      return;
    }

    // 5. 外圈等角站位 (整圈朝同一方向緩慢側移，每 4~7 秒換向)
    this.ringFlipTimer -= dt;
    if (this.ringFlipTimer <= 0) {
      this.ringFlipTimer = 4.0 + Math.random() * 3.0;
      this.ringDir = -this.ringDir;
    }
    const base = fitEvenRing(waiters) + this.ringDir * RING_LEAD;
    const step = TWO_PI / waiters.length;
    for (let i = 0; i < waiters.length; i++) waiters[i].setRingWait(true, base + i * step);

    this.updateWhiff(dt, candidates.length, npcs, playerPos);
  }

  private isCandidate(n: NPC, playerPos: THREE.Vector3): boolean {
    if (!n.isChasing || n.role === 'BIKE_PATROL' || n.attackPower <= 0 || n.isInBadmintonMatch || n.isOffstage) return false;
    if (n.isKnockedDown || n.isPermanentlyKnockedOut || n.isKnockedFlying) return false;
    const dx = n.position.x - playerPos.x;
    const dz = n.position.z - playerPos.z;
    return dx * dx + dz * dz <= ENGAGE_RANGE_SQ && Math.abs(n.position.y - playerPos.y) <= ENGAGE_MAX_DY;
  }

  private clearNpc(n: NPC) {
    n.attackHold = false;
    n.tokenWaitTime = 0;
    if (n.ringWait) n.setRingWait(false);
  }

  private release(s: TokenSlot) {
    s.holder = null;
    s.gap = RELEASE_GAP;
  }

  private isHolder(n: NPC): boolean {
    for (const s of this.slots) if (s.holder === n) return true;
    return false;
  }

  private pickNext(playerPos: THREE.Vector3): NPC | null {
    let enforcerHolding = false;
    for (const s of this.slots) if (s.holder?.isEnforcer) enforcerHolding = true;
    let best: NPC | null = null;
    let bestDist = 0;
    for (const n of this.candidates) {
      if (this.isHolder(n) || (enforcerHolding && n.isEnforcer)) continue;
      const d2 = n.position.distanceToSquared(playerPos);
      if (!best || this.isBetter(n, d2, best, bestDist)) {
        best = n;
        bestDist = d2;
      }
    }
    return best;
  }

  private isBetter(n: NPC, d2: number, best: NPC, bestD2: number): boolean {
    const a = n.isMeleeAttacking;
    const b = best.isMeleeAttacking;
    if (a !== b) return a;
    const dw = n.tokenWaitTime - best.tokenWaitTime;
    if (Math.abs(dw) > WAIT_TIE) return dw > 0;
    return d2 < bestD2;
  }

  // 做樣子揮空：圍攻 3 人以上時，挑一名已在外圈站穩、前方無人阻擋的等待者原地出招打空氣 (全場同時最多一人)
  private updateWhiff(dt: number, engaged: number, npcs: readonly NPC[], playerPos: THREE.Vector3) {
    const waiters = this.waiters;
    for (let i = 0; i < waiters.length; i++) if (waiters[i].whiffCooldown > 0) waiters[i].whiffCooldown -= dt;
    if (this.whiffNpc) {
      if (this.whiffNpc.isWhiffing) return;
      this.whiffNpc = null;
      this.whiffGap = WHIFF_GAP_MIN + Math.random() * WHIFF_GAP_RAND;
    }
    if (this.whiffGap > 0) {
      this.whiffGap -= dt;
      return;
    }
    if (engaged < WHIFF_MIN_ENGAGED) return;
    // 從隨機起點輪詢，避免總是同一人
    const start = Math.floor(Math.random() * waiters.length);
    for (let k = 0; k < waiters.length; k++) {
      const n = waiters[(start + k) % waiters.length];
      if (n.whiffCooldown > 0 || !n.isSettledOnRing(playerPos) || !this.isWhiffLaneClear(n, npcs, playerPos)) continue;
      n.startWhiff(playerPos);
      n.whiffCooldown = WHIFF_CD_MIN + Math.random() * WHIFF_CD_RAND;
      this.whiffNpc = n;
      return;
    }
  }

  // 由等待者朝玩家方向 2.2m 的出招路徑兩側 0.6m 內無其他角色 (避免看似打到旁人)
  private isWhiffLaneClear(n: NPC, npcs: readonly NPC[], playerPos: THREE.Vector3): boolean {
    let fx = playerPos.x - n.position.x;
    let fz = playerPos.z - n.position.z;
    const len = Math.sqrt(fx * fx + fz * fz);
    if (len < 0.01) return false;
    fx /= len;
    fz /= len;
    for (let i = 0; i < npcs.length; i++) {
      const o = npcs[i];
      if (o === n || o.isPermanentlyKnockedOut || Math.abs(o.position.y - n.position.y) > ENGAGE_MAX_DY) continue;
      const rx = o.position.x - n.position.x;
      const rz = o.position.z - n.position.z;
      const along = rx * fx + rz * fz;
      if (along < -0.3 || along > WHIFF_LANE_LEN) continue;
      const side = rx * fz - rz * fx;
      if (side * side < WHIFF_LANE_HALF_WIDTH_SQ) return false;
    }
    return true;
  }
}
