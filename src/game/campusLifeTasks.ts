import * as THREE from 'three';
import type { NPC, NPCIdleBehavior, NPCLifeTask } from '../entities/NPC';

// 固定駐點同學 (CampusSportsCrew / CampusSoccerPair) 共用的活動指派輔助

export const createTask = (): NPCLifeTask => ({
  target: new THREE.Vector3(),
  speedMul: 1, run: false, arriveDist: 0.5, hold: 'LOOK_AROUND', holdTime: 1,
  hasFace: false, faceX: 0, faceZ: 0, sitBack: 0, bubble: '', phase: 'DONE'
});

// 改寫並指派重複使用的活動物件 (不配置新物件)
export function assignTask(
  npc: NPC, task: NPCLifeTask, x: number, z: number, hold: NPCIdleBehavior, holdTime: number,
  faceX: number, faceZ: number, speedMul = 1, run = false, arriveDist = 0.5, bubble = ''
) {
  task.target.set(x, npc.baseFloorY, z);
  task.speedMul = speedMul;
  task.run = run;
  task.arriveDist = arriveDist;
  task.hold = hold;
  task.holdTime = holdTime;
  task.hasFace = true;
  task.faceX = faceX;
  task.faceZ = faceZ;
  task.sitBack = 0;
  task.bubble = bubble;
  npc.assignLifeTask(task);
}

export function isBusy(npc: NPC): boolean {
  return npc.isChasing || npc.isKnockedDown || npc.isKnockedFlying || npc.isPermanentlyKnockedOut || npc.freezeTimer > 0 || npc.isOffstage;
}
