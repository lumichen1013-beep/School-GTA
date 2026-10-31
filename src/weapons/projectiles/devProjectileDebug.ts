import * as THREE from 'three';
import type { GameContext } from '../../game/GameContext';
import { devWeaponsMode } from '../featureFlags';
import { createProjectileSpawnOpts, PROJ_BALL, PROJ_STONE, PFLAG_BOUNCE_FLOOR, PFLAG_BOUNCE_WALL, PFLAG_RETURN, PFLAG_TRACER } from './ProjectileSystem';

// 開發驗證用測試彈：僅 DEV_WEAPONS_BUILD 建置會由 main.ts 呼叫 (正式版整段 tree-shake)，且需 dev 武器模式未關閉 (?devweapons=1 / locked)。
// 按鍵 (遊戲中，未騎車)：T = 石子 (70 m/s 直射)、Y = 球 (24 m/s 輕拋，推擊 1.2m，落空彈地 / 撞牆反彈後回收)、
// U = 球 (斜向地面的反彈傳球，終結擊飛)。彈道沿鏡頭水平前方，自玩家胸口前方發射。
const DEV_LAUNCH_CAP = { h: 9, v: 5 };

export function installProjectileDebug(ctx: GameContext, isRunning: () => boolean) {
  if (devWeaponsMode === 'off') return;
  const origin = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let serial = -2; // 負序號：不與近戰 moveSerial 相撞，每發一個

  const returnTarget = (out: THREE.Vector3) => {
    out.copy(ctx.player.position);
    out.y += 1.2;
  };
  const stone = createProjectileSpawnOpts(PROJ_STONE);
  stone.damage = 60;
  stone.mode = 'LIGHT';
  stone.knockback = 0;

  const ball = createProjectileSpawnOpts(PROJ_BALL);
  ball.damage = 45;
  ball.knockback = 9;
  ball.mode = 'SHOVE';
  ball.shoveDist = 1.2;
  ball.flags = PFLAG_TRACER | PFLAG_BOUNCE_FLOOR | PFLAG_BOUNCE_WALL | PFLAG_RETURN;
  ball.returnTarget = returnTarget;

  const lob = createProjectileSpawnOpts(PROJ_BALL);
  lob.damage = 45;
  lob.knockback = 9;
  lob.mode = 'LAUNCH';
  lob.launchCap = DEV_LAUNCH_CAP;
  lob.returnTarget = returnTarget;

  const fire = (code: string) => {
    const { player, cameraCtrl, projectiles } = ctx;
    fwd.copy(cameraCtrl.getForwardVector());
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    origin.copy(player.position).addScaledVector(fwd, 0.6);
    origin.y += 1.3;
    if (code === 'KeyT') {
      vel.copy(fwd).multiplyScalar(70);
      stone.serial = serial--;
      projectiles.spawn(PROJ_STONE, origin, vel, stone);
    } else if (code === 'KeyY') {
      vel.copy(fwd).multiplyScalar(24 * Math.cos(0.1));
      vel.y = 24 * Math.sin(0.1);
      ball.serial = serial--;
      projectiles.spawn(PROJ_BALL, origin, vel, ball);
    } else {
      vel.copy(fwd).multiplyScalar(18);
      vel.y = -4;
      lob.serial = serial--;
      projectiles.spawn(PROJ_BALL, origin, vel, lob);
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || !isRunning() || ctx.player.isDead || ctx.currentRidingBike) return;
    if (e.code === 'KeyT' || e.code === 'KeyY' || e.code === 'KeyU') fire(e.code);
  });
}
