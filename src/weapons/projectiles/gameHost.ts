import * as THREE from 'three';
import { soundManager } from '../../audio/SoundEffects';
import { slashFX } from '../../effects/SlashFX';
import { impactDust, type ImpactDustOptions } from '../../effects/ImpactDust';
import { getFxQuality } from '../../effects/fxQuality';
import type { GameContext } from '../../game/GameContext';
import type { NPC } from '../../entities/NPC';
import type { ProjectileHost, ProjectileSoundId } from './ProjectileSystem';

// 投射物系統與遊戲的接點：目標名單 / 碰撞盒取當前世界，命中走 CombatSystem.applyPlayerHitToNpc，
// 停格、閃光、煙塵、音效 (一律帶位置) 走既有系統。於初始化時建立一次，執行期零配置。
const _bossHit = { hit: false, name: '花劍客', defeated: false, isBoss: true, damage: 0 };
const _dustOpts: ImpactDustOptions = { count: 6, upward: 0.8, spreadY: 0.2, life: 0.45, size: 0.6 };

export function createProjectileHost(ctx: GameContext): ProjectileHost {
  return {
    get targets() { return ctx.npcs; },
    get colliders() { return ctx.activeColliders; },
    get cameraPosition() { return ctx.cameraCtrl.camera.position; },
    hitTarget: (target, spec) => ctx.combat.applyPlayerHitToNpc(target as NPC, spec),
    hitGardenAt: (point, r, damage) => {
      if (ctx.currentWorldType !== 'CAMPUS') return null;
      // 投射物傷害未取整 (彈弓蓄力比例)：比照近戰取整後再扣血與顯示橫幅
      const hit = ctx.ecologicalGarden.tryHitAtPoint(point, r, Math.round(damage));
      if (hit.hit) ctx.combat.reportPlantHit(hit, hit.damage);
      return hit;
    },
    // 世界 Boss 花劍客 (結界戰中)：傷害取整後扣血；結果沿用生態園命中格式 (isBoss)
    hitBossAt: (point, r, damage) => {
      const res = ctx.fencerBossFight.hitBossAt(point, r, Math.round(damage));
      if (!res) return null;
      _bossHit.hit = true; _bossHit.damage = res.applied; _bossHit.defeated = res.defeated;
      return _bossHit;
    },
    get arena() { return ctx.fencerBossFight.arenaBound; },
    requestHitStop: (seconds) => ctx.combat.requestHitStop(seconds),
    playSound: (id: ProjectileSoundId, pos: THREE.Vector3) => {
      switch (id) {
        case 'throwWhoosh': soundManager.playThrowWhoosh(pos); break;
        case 'ballHit': soundManager.playBallHit(pos); break;
        case 'stoneHit': soundManager.playStoneHit(pos); break;
        case 'ballCatch': soundManager.playBallCatch(pos); break;
        case 'dribble': soundManager.playDribble(pos); break;
        case 'slingTwang': soundManager.playSlingTwang(pos); break;
        case 'kiShot': soundManager.playKiShot(pos); break;
        case 'kiImpact': soundManager.playKiImpact(pos); break;
      }
    },
    hitFlash: (pos, color) => slashFX.hitFlash(pos.x, pos.y, pos.z, color),
    dust: (pos, normal) => {
      // 低檔 dustPool 0 自動關閉
      const q = getFxQuality();
      if (q.dustPool <= 0) return;
      impactDust.burst(ctx.engine.scene, pos, normal, _dustOpts);
    }
  };
}
