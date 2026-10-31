import * as THREE from 'three';
import { soundManager } from '../audio/SoundEffects';
import type { NPC, NPCLifeTask } from '../entities/NPC';
import { assignTask, createTask, isBusy } from './campusLifeTasks';
import type { GameContext } from './GameContext';

/**
 * 第一世界操場北端球門前的踢足球雙人組 (npc.campusAnchor === 'PITCH')，共用一顆自己的足球：
 * 來回地滾傳球 3~5 次後由持球者射門 (約 75% 破網、其餘偏出門柱)，另一人在球門側邊等待，
 * 射完由較近者追球撿起，再繼續傳球。球全程解析軌跡 (線性 + 拋物線高度)，不用物理引擎。
 * 任一人被打/追捕/倒地/對玩家反應中或下雨、離開球場時暫停 (球停在原地)，恢復後由較近者去撿球繼續。
 * 球距玩家超過 58m 時隱藏並停止更新；踢球聲為空間音效，僅附近聽得到。
 */

const BALL_R = 0.22;
const BALL_FLOOR_Y = 0.03 + BALL_R; // 草皮頂面 0.03
// 球門 (對齊 CampusWorld.buildRunningTrack：中心 -55，北端球門 z = 30 - (16 + 18 * 0.45)，球門面朝 +Z)
const GOAL_X = -55;
const GOAL_Z = 5.9;
const PITCH_CX = -55;
const PITCH_CZ = 16;
const PITCH_MIN_X = -72;
const PITCH_MAX_X = -38;
const PITCH_MIN_Z = 3;
const PITCH_MAX_Z = 52;
const LEASH_RADIUS = 22;
const LEASH_PLAYER_DIST2 = 30 * 30;
const FAR_HIDE_DIST2 = 58 * 58;
const FAR_SHOW_DIST2 = 54 * 54;
const SOUND_DIST2 = 14 * 14;
const PICKUP_DIST = 0.9;
const RETRIEVE_TIMEOUT = 12;
const RESUME_DELAY = 3;
const KICK_RELEASE = 0.5; // KICK 動作 0.9 秒一循環：0.5 秒時腳面觸球
const PASS_SPEED = 9;
const SHOT_SPEED = 14;

// 傳球接應點 (球門前方的操場草皮，離球門 6~16m)
const RECEIVE_SPOTS: [number, number][] = [
  [-62, 14], [-48, 14], [-60, 20], [-50, 20], [-55, 24], [-64, 18], [-46, 18], [-55, 12]
];

type Phase = 'PAUSED' | 'CONTROL' | 'APPROACH' | 'WINDUP' | 'FLIGHT' | 'FETCH';

const _v = new THREE.Vector3();

export class CampusSoccerPair {
  private initialized = false;
  private players: NPC[] = [];
  private tasks: NPCLifeTask[] = [createTask(), createTask()];
  private ball: THREE.Mesh | null = null;
  private readonly ballPos = new THREE.Vector3();
  private readonly ballVel = new THREE.Vector3();
  private readonly flightStart = new THREE.Vector3();
  private readonly flightTarget = new THREE.Vector3();
  private flightT = 0;
  private flightDur = 1;
  private flightArc = 0.15;
  private flightIsShot = false;
  private ballHeld = false;
  private holder = 0;
  private receiver = 1;
  private phase: Phase = 'PAUSED';
  private phaseTimer = 0;
  private resumeTimer = 1.5;
  private passesLeft = 3;
  private spotIdx = 0;
  private shotIsGoal = true;
  private lineCooldown = 0;
  private hidden = false;
  private playerNear = false;
  private playerLineNear = false;

  constructor(private readonly ctx: GameContext) {}

  private init() {
    this.initialized = true;
    for (const npc of this.ctx.campusNPCs) {
      if (npc.campusAnchor === 'PITCH' && this.players.length < 2) this.players.push(npc);
    }
    if (this.players.length !== 2) return;
    this.ball = CampusSoccerPair.buildBall();
    this.ctx.world.group.add(this.ball);
    this.placeBallAtRest();
  }

  // 低多邊形足球：二十面體 (80 面) 以頂點色烘焙黑白塊，單一網格 1 Draw Call、不投射陰影
  private static buildBall(): THREE.Mesh {
    const geo = new THREE.IcosahedronGeometry(BALL_R, 1);
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let f = 0; f < n / 3; f++) {
      const dark = f % 4 === 0 || f % 11 === 3;
      for (let k = 0; k < 3; k++) {
        const o = (f * 3 + k) * 3;
        colors[o] = colors[o + 1] = colors[o + 2] = dark ? 0.1 : 0.96;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.castShadow = false;
    mesh.name = 'pitch_pair_ball';
    return mesh;
  }

  private placeBallAtRest() {
    this.ballPos.set(PITCH_CX, BALL_FLOOR_Y, PITCH_CZ);
    this.ballVel.set(0, 0, 0);
    this.ballHeld = false;
    if (this.ball) this.ball.position.copy(this.ballPos);
  }

  private owns(i: number): boolean {
    return this.players[i].lifeTask === this.tasks[i];
  }

  // 切換世界：收回活動
  public reset() {
    if (!this.initialized) return;
    for (let i = 0; i < this.players.length; i++) {
      if (this.owns(i)) this.players[i].clearLifeTask();
    }
    this.phase = 'PAUSED';
    this.resumeTimer = RESUME_DELAY;
    if (this.ball) this.placeBallAtRest();
  }

  public update(delta: number, playerPos: THREE.Vector3) {
    if (!this.initialized) this.init();
    const ball = this.ball;
    if (!ball) return;
    // 遠距：隱藏並停止更新 (遲滯避免邊界閃爍)
    const d2 = this.ballPos.distanceToSquared(playerPos);
    if (this.hidden ? d2 > FAR_SHOW_DIST2 : d2 > FAR_HIDE_DIST2) {
      if (!this.hidden) {
        this.hidden = true;
        ball.visible = false;
      }
      return;
    }
    if (this.hidden) {
      this.hidden = false;
      ball.visible = true;
    }
    if (this.lineCooldown > 0) this.lineCooldown -= delta;
    this.playerNear = d2 < SOUND_DIST2;
    this.playerLineNear = d2 < 18 * 18;
    const weather = this.ctx.weatherSystem.currentWeather;
    let blocked = weather === 'RAIN' || weather === 'THUNDERSTORM';
    for (let i = 0; i < 2; i++) {
      const n = this.players[i];
      if (isBusy(n) || (n.lifeTask && !this.owns(i))) {
        blocked = true;
        continue;
      }
      if (!this.onPitch(n)) {
        blocked = true;
        this.leash(n, playerPos);
      }
    }

    if (blocked) {
      if (this.phase !== 'PAUSED') this.pause();
    } else if (this.phase === 'PAUSED') {
      this.resumeTimer -= delta;
      if (this.resumeTimer <= 0) this.startFetch(this.closerToBall());
    } else {
      this.updatePhase(delta);
    }
    this.updateBall(delta);
    ball.position.copy(this.ballPos);
  }

  private onPitch(npc: NPC): boolean {
    const p = npc.position;
    return (p.x - PITCH_CX) ** 2 + (p.z - PITCH_CZ) ** 2 < LEASH_RADIUS * LEASH_RADIUS && Math.abs(p.y) < 0.5;
  }

  // 逃太遠且玩家不在附近：直接回到駐點
  private leash(npc: NPC, playerPos: THREE.Vector3) {
    if (npc.position.distanceToSquared(playerPos) < LEASH_PLAYER_DIST2) return;
    npc.clearLifeTask();
    npc.resetToInitialState();
  }

  // 暫停：球停在原地 (飛行中的球落地滾停)，兩人恢復一般行為
  private pause() {
    if (this.ballHeld || this.phase === 'FLIGHT') {
      this.ballHeld = false;
      this.ballVel.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
      this.ballPos.y = BALL_FLOOR_Y;
    }
    for (let i = 0; i < 2; i++) {
      if (this.owns(i)) this.players[i].clearLifeTask();
    }
    this.phase = 'PAUSED';
    this.resumeTimer = RESUME_DELAY;
  }

  private closerToBall(): number {
    const d0 = this.players[0].position.distanceToSquared(this.ballPos);
    const d1 = this.players[1].position.distanceToSquared(this.ballPos);
    return d0 <= d1 ? 0 : 1;
  }

  private watch(i: number, fx: number, fz: number, holdTime = 60) {
    const n = this.players[i];
    assignTask(n, this.tasks[i], n.position.x, n.position.z, 'LOOK_AROUND', holdTime, fx, fz, 1, false, 5);
  }

  // 觀看任務結束時改為原地面向球
  private keepWatching(i: number) {
    if (this.owns(i) && this.tasks[i].phase !== 'DONE') return;
    this.watch(i, this.ballPos.x, this.ballPos.z);
  }

  private startFetch(i: number) {
    this.holder = i;
    this.phase = 'FETCH';
    this.phaseTimer = 0;
    this.chaseBall(i);
    this.keepWatching(1 - i);
  }

  private chaseBall(i: number) {
    const n = this.players[i];
    const far = n.position.distanceToSquared(this.ballPos) > 9;
    assignTask(n, this.tasks[i], this.ballPos.x, this.ballPos.z, 'LOOK_AROUND', 0.6, this.ballPos.x, this.ballPos.z, far ? 1.45 : 1.1, far, 0.45);
  }

  private onPickup(i: number) {
    this.holder = i;
    this.ballHeld = true;
    this.ballVel.set(0, 0, 0);
    this.phase = 'CONTROL';
    this.phaseTimer = 0;
    this.passesLeft = 3 + Math.floor(Math.random() * 3);
    this.watch(i, this.players[1 - i].position.x, this.players[1 - i].position.z);
    this.keepWatching(1 - i);
  }

  // 規劃下一個動作：傳球 (receiver 跑到接應點) 或射門 (receiver 站到球門側邊)
  private plan() {
    const h = this.holder;
    const r = 1 - h;
    this.receiver = r;
    const hp = this.players[h].position;
    this.phase = 'APPROACH';
    this.phaseTimer = 0;
    if (this.passesLeft <= 0) {
      // 射門：另一人站到球門側邊等球
      const side = hp.x < GOAL_X ? 1 : -1;
      assignTask(this.players[r], this.tasks[r], GOAL_X + side * 5, GOAL_Z + 5, 'LOOK_AROUND', 60, GOAL_X, GOAL_Z, 1.2, false, 0.5);
      this.shotIsGoal = Math.random() < 0.75;
    } else {
      let idx = Math.floor(Math.random() * RECEIVE_SPOTS.length);
      for (let k = 0; k < RECEIVE_SPOTS.length; k++) {
        const s = RECEIVE_SPOTS[idx];
        const d = Math.hypot(s[0] - hp.x, s[1] - hp.z);
        if (idx !== this.spotIdx && d > 5 && d < 13) break;
        idx = (idx + 1) % RECEIVE_SPOTS.length;
      }
      this.spotIdx = idx;
      assignTask(this.players[r], this.tasks[r], RECEIVE_SPOTS[idx][0], RECEIVE_SPOTS[idx][1], 'LOOK_AROUND', 60, hp.x, hp.z, 1.2, false, 0.5);
    }
    this.watch(h, this.players[r].position.x, this.players[r].position.z);
  }

  private updatePhase(delta: number) {
    this.phaseTimer += delta;
    switch (this.phase) {
      case 'CONTROL':
        this.keepWatching(this.holder);
        this.keepWatching(1 - this.holder);
        if (this.phaseTimer > 0.8) this.plan();
        break;
      case 'APPROACH': {
        const r = this.receiver;
        const arrived = this.owns(r) && this.tasks[r].phase === 'HOLD';
        this.keepWatching(this.holder);
        if (arrived || this.phaseTimer > 8) {
          // 持球者轉向目標，踢球動作
          const shot = this.passesLeft <= 0;
          const fx = shot ? GOAL_X : this.players[r].position.x;
          const fz = shot ? GOAL_Z : this.players[r].position.z;
          const h = this.players[this.holder];
          assignTask(h, this.tasks[this.holder], h.position.x, h.position.z, 'KICK', 1.2, fx, fz, 1, false, 5);
          this.phase = 'WINDUP';
          this.phaseTimer = 0;
        }
        break;
      }
      case 'WINDUP': {
        const h = this.players[this.holder];
        const t = this.tasks[this.holder];
        this.keepWatching(this.receiver);
        if ((t.phase === 'HOLD' && h.pauseAnimTimer >= KICK_RELEASE) || t.phase === 'DONE' || this.phaseTimer > 3) this.kick();
        break;
      }
      case 'FETCH': {
        const i = this.holder;
        const n = this.players[i];
        const dx = this.ballPos.x - n.position.x;
        const dz = this.ballPos.z - n.position.z;
        // 逾時保險：撿不到 (卡在角落) 時直接撿起
        if (dx * dx + dz * dz < PICKUP_DIST * PICKUP_DIST || this.phaseTimer > RETRIEVE_TIMEOUT) {
          this.onPickup(i);
          break;
        }
        const t = this.tasks[i];
        if (this.owns(i) && t.phase === 'GO') {
          t.target.set(this.ballPos.x, n.baseFloorY, this.ballPos.z);
          t.faceX = this.ballPos.x;
          t.faceZ = this.ballPos.z;
        } else {
          this.chaseBall(i);
        }
        this.keepWatching(1 - i);
        break;
      }
      case 'FLIGHT':
        this.keepWatching(0);
        this.keepWatching(1);
        break;
    }
  }

  private kick() {
    const h = this.players[this.holder];
    const shot = this.passesLeft <= 0;
    this.passesLeft--;
    // 起腳點：持球者腳前
    this.setFootPos(this.holder);
    if (shot) {
      const dx = this.shotIsGoal ? (Math.random() - 0.5) * 3.6 : (Math.random() < 0.5 ? -1 : 1) * (3.3 + Math.random() * 1.2);
      _v.set(GOAL_X + dx, 0.35 + Math.random() * 1.3, this.shotIsGoal ? GOAL_Z + 0.2 : GOAL_Z - 1.2);
      this.startFlight(_v, true);
    } else {
      const r = this.players[this.receiver];
      _v.set(r.position.x + Math.sin(r.rotationY) * 0.55, BALL_FLOOR_Y, r.position.z + Math.cos(r.rotationY) * 0.55);
      this.startFlight(_v, false);
    }
    if (this.playerNear) soundManager.playSoccerKick(this.ballPos);
    if (shot && this.lineCooldown <= 0 && this.playerLineNear) {
      this.lineCooldown = 6;
      h.showSpeechBubble(this.shotIsGoal ? '看我射門！' : '射門～', false, 1.6);
    }
    this.phase = 'FLIGHT';
    this.phaseTimer = 0;
  }

  private setFootPos(i: number) {
    const n = this.players[i];
    this.ballPos.set(n.position.x + Math.sin(n.rotationY) * 0.55, BALL_FLOOR_Y, n.position.z + Math.cos(n.rotationY) * 0.55);
  }

  // 解析軌跡：起點 → 目標線性插值 + 拋物線高度
  private startFlight(target: THREE.Vector3, isShot: boolean) {
    this.flightStart.copy(this.ballPos);
    this.flightTarget.copy(target);
    this.flightIsShot = isShot;
    this.flightArc = isShot ? 0.35 : 0.12;
    const d = Math.hypot(target.x - this.ballPos.x, target.z - this.ballPos.z);
    this.flightDur = Math.max(0.3, d / (isShot ? SHOT_SPEED : PASS_SPEED));
    this.flightT = 0;
    this.ballHeld = false;
  }

  private endFlight() {
    this.ballPos.copy(this.flightTarget);
    if (!this.flightIsShot) {
      // 傳球抵達：接球者停球
      this.holder = this.receiver;
      this.ballHeld = true;
      this.setFootPos(this.holder);
      this.phase = 'CONTROL';
      this.phaseTimer = 0;
      this.watch(this.holder, this.players[1 - this.holder].position.x, this.players[1 - this.holder].position.z);
      return;
    }
    // 射門：破網的球網彈回、滾出門線；偏出的球滾向場外後停下
    this.ballPos.y = BALL_FLOOR_Y;
    if (this.shotIsGoal) this.ballVel.set((Math.random() - 0.5) * 1.2, 0, 2.2);
    else this.ballVel.set((Math.random() - 0.5) * 1.5, 0, -1.8);
    this.startFetch(this.closerToBall());
  }

  private updateBall(delta: number) {
    const ball = this.ball!;
    const p = this.ballPos;
    if (this.ballHeld) {
      this.setFootPos(this.holder);
      return;
    }
    if (this.phase === 'FLIGHT') {
      this.flightT += delta;
      if (this.flightT >= this.flightDur) {
        this.endFlight();
        return;
      }
      const u = this.flightT / this.flightDur;
      p.lerpVectors(this.flightStart, this.flightTarget, u);
      p.y += 4 * this.flightArc * u * (1 - u);
      ball.rotation.x -= delta * 10;
      return;
    }
    // 滾動：摩擦減速、場地邊界
    const v = this.ballVel;
    p.addScaledVector(v, delta);
    const damp = Math.max(0, 1 - delta * 1.2);
    v.x *= damp;
    v.z *= damp;
    if (v.x * v.x + v.z * v.z < 0.01) {
      v.x = 0;
      v.z = 0;
    }
    if (p.x < PITCH_MIN_X) { p.x = PITCH_MIN_X; v.x = Math.abs(v.x) * 0.5; }
    if (p.x > PITCH_MAX_X) { p.x = PITCH_MAX_X; v.x = -Math.abs(v.x) * 0.5; }
    if (p.z < PITCH_MIN_Z) { p.z = PITCH_MIN_Z; v.z = Math.abs(v.z) * 0.5; }
    if (p.z > PITCH_MAX_Z) { p.z = PITCH_MAX_Z; v.z = -Math.abs(v.z) * 0.5; }
    ball.rotation.x += v.z * delta / BALL_R;
    ball.rotation.z -= v.x * delta / BALL_R;
  }
}
