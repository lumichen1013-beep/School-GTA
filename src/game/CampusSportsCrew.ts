import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { soundManager } from '../audio/SoundEffects';
import type { NPC, NPCIdleBehavior, NPCLifeTask } from '../entities/NPC';
import { createNameTagSprite } from '../entities/RaceRival';
import { getAthleteLook } from '../entities/npc/models';
import type { GameContext } from './GameContext';

/**
 * 第一世界【天天國中】固定駐點同學 (npc.campusAnchor)：
 * - 操場：田徑隊阿凱沿跑道外側分道逆時針慢跑繞圈；200m 對決期間同樣暫離名單，由同外觀的陪跑模型 (RacingGame.trackRival)
 *   從起跑線上場，賽後回到起跑線繼續繞圈慢跑。
 * - 泳池：游泳隊小魚在北側甲板出發台旁熱身、短距離來回；50m 自由式對決期間暫離 NPC 名單並隱藏，
 *   由同比例同配色的陪泳模型 (RacingGame.swimRival) 在出發台代演，賽後 (勝/負/中止/切換世界/玩家倒下) 回到甲板並恢復滿血。
 *   比賽開始時不論小魚是否被打倒或正在追人，一律由陪泳模型上場 (比賽不受影響)。
 * - 籃球場：東南籃框半場的鬥牛雙人組，共用一顆自己的球 (與玩家的籃球各自獨立)，
 *   輪流運球走位 → 投籃 (拋物線、進/不進) → 落地彈跳 → 搶籃板 → 傳球或換手出手。
 *   任一人被打/追捕/倒地/對玩家反應中或下雨時暫停 (持球者把球掉在地上)，恢復後由較近者去撿球繼續。
 * 兩者都不參與 CampusLife 的地點活動與小團體，離開駐點太遠且玩家不在附近時直接回到駐點。
 */

const BALL_R = 0.24;
const BALL_FLOOR_Y = 0.02 + BALL_R; // 球場地板 0.02
const GRAVITY = 9.8;
const COURT_MIN_X = 14.6;
const COURT_MAX_X = 45.4;
const COURT_MIN_Z = -68.6;
const COURT_MAX_Z = -21.4;
const COURT_CENTER_X = 30;
const COURT_CENTER_Z = -45;
const COURT_HOOP_IDX = 3; // 東南籃框 (遠離玩家常用的西北籃框與「練投」地點)
// 出手點 (相對籃框，朝球場內側)
const SHOT_SPOTS: [number, number][] = [
  [0, -5.8], [-3.6, -4.6], [3.6, -4.6], [-5.0, -2.4], [5.0, -2.4], [0, -7.2], [-1.8, -3.4], [1.8, -3.4]
];
const REBOUND_SPOTS: [number, number][] = [[-1.3, -2.4], [1.3, -2.4]];
const MAKE_CHANCE = 0.5;
const PICKUP_DIST = 0.9;
const RETRIEVE_TIMEOUT = 12;
const RESUME_DELAY = 3;
const SOUND_DIST2 = 16 * 16;
const LINE_DIST2 = 25 * 25;

// 泳池北側甲板 (甲板頂面 0.3m)
const POOL_DECK_Y = 0.3;
const POOL_CENTER_X = 75;
const POOL_CENTER_Z = -40;
interface DeckSpot { x: number; z: number; fx: number; fz: number; hold: NPCIdleBehavior; time: number }
const DECK_SPOTS: DeckSpot[] = [
  { x: 77.5, z: -49.6, fx: 77.5, fz: -40, hold: 'STRETCH', time: 5 },
  { x: 80.8, z: -49.6, fx: 80.8, fz: -40, hold: 'LOOK_AROUND', time: 4 },
  { x: 83.5, z: -49.5, fx: 83.5, fz: -40, hold: 'LOOK_AROUND', time: 0.3 },
  { x: 83.5, z: -42.0, fx: 75, fz: -42, hold: 'LOOK_AROUND', time: 5 },
  { x: 83.5, z: -49.5, fx: 83.5, fz: -40, hold: 'LOOK_AROUND', time: 0.3 },
  { x: 80.8, z: -49.6, fx: 80.8, fz: -40, hold: 'STRETCH', time: 3 }
];
const DECK_LINES = ['今天目標 50m 破 20 秒！', '水溫剛剛好～', '暖身完畢，隨時可以比！'];

const LEASH_PLAYER_DIST2 = 30 * 30;
// 操場跑道中心 (對齊 CampusWorld.buildRunningTrack)
const TRACK_CENTER_X = -55;
const TRACK_CENTER_Z = 30;
const TRACK_START_X = -28; // 陪跑模型起跑點 (RacingGame 外側分道北端)
const TRACK_START_Z = 14;

type CourtPhase = 'PAUSED' | 'SETUP' | 'SHOOT' | 'WATCH_SHOT' | 'REBOUND' | 'PREP_PASS' | 'PASS';
type FlightKind = 'MAKE' | 'MISS' | 'PASS';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const createTask = (): NPCLifeTask => ({
  target: new THREE.Vector3(),
  speedMul: 1, run: false, arriveDist: 0.5, hold: 'LOOK_AROUND', holdTime: 1,
  hasFace: false, faceX: 0, faceZ: 0, sitBack: 0, bubble: '', phase: 'DONE'
});

// 改寫並指派重複使用的活動物件 (不配置新物件)
function assignTask(
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

function isBusy(npc: NPC): boolean {
  return npc.isChasing || npc.isKnockedDown || npc.isKnockedFlying || npc.isPermanentlyKnockedOut || npc.freezeTimer > 0 || npc.isOffstage;
}

export class CampusSportsCrew {
  private initialized = false;

  // ---------- 校隊選手 (泳池小魚、操場阿凱)：比賽時由陪賽模型代演 ----------
  private athletes: { npc: NPC; tag: THREE.Sprite; slot: number; isRivalOnStage: () => boolean }[] = [];
  private swimmer: NPC | null = null;
  private swimTask = createTask();
  private trackTask = createTask();
  private deckIdx = 0;
  private deckLineIdx = 0;
  private inviteCooldown = 0;

  // ---------- 籃球場鬥牛 ----------
  private ballers: NPC[] = [];
  private ballerTasks: NPCLifeTask[] = [createTask(), createTask()];
  private ball: THREE.Mesh | null = null;
  private hoop = new THREE.Vector3();
  private courtDirX = 0; // 籃框 → 球場內側方向
  private courtDirZ = -1;
  private ballPos = new THREE.Vector3();
  private ballVel = new THREE.Vector3();
  private ballMode: 'HELD' | 'FLIGHT' | 'LOOSE' = 'LOOSE';
  private holder = -1;
  private shooter = 0;
  private retriever = 0;
  private phase: CourtPhase = 'PAUSED';
  private phaseTimer = 0;
  private resumeTimer = 1.5;
  private released = false;
  private spotIdx = 0;
  private flightKind: FlightKind = 'MAKE';
  private flightStart = new THREE.Vector3();
  private flightVel = new THREE.Vector3();
  private flightTarget = new THREE.Vector3();
  private flightT = 0;
  private flightDur = 1;
  private passReceiver = 0;
  private dribbleT = 0;
  private lastDribbleBeat = 0;
  private lineCooldown = 0;
  private playerNear = false;
  private playerLineNear = false;

  constructor(private readonly ctx: GameContext) {}

  private init() {
    this.initialized = true;
    const racing = this.ctx.racingGame;
    for (const npc of this.ctx.campusNPCs) {
      if (npc.campusAnchor === 'COURT') {
        if (this.ballers.length < 2) this.ballers.push(npc);
        continue;
      }
      const look = getAthleteLook(npc.look);
      if (!look || (npc.campusAnchor !== 'POOL' && npc.campusAnchor !== 'TRACK')) continue;
      if (npc.campusAnchor === 'POOL' && this.swimmer) continue;
      if (npc.campusAnchor === 'POOL') this.swimmer = npc;
      // 與陪賽對手相同的頭頂名牌 (共用貼圖與材質)
      const tag = createNameTagSprite(look.label);
      tag.position.y = 2.4;
      npc.mesh.add(tag);
      const isRivalOnStage = npc.campusAnchor === 'POOL' ? () => racing.isSwimRivalOnStage : () => racing.isTrackRivalOnStage;
      this.athletes.push({ npc, tag, slot: 0, isRivalOnStage });
    }
    const hoop = this.ctx.world.hoopTargets[COURT_HOOP_IDX];
    if (this.ballers.length === 2 && hoop) {
      this.hoop.copy(hoop);
      const dx = COURT_CENTER_X - hoop.x;
      const dz = COURT_CENTER_Z - hoop.z;
      const len = Math.hypot(dx, dz) || 1;
      this.courtDirX = dx / len;
      this.courtDirZ = dz / len;
      this.ball = CampusSportsCrew.buildBall();
      this.ctx.world.group.add(this.ball);
      this.placeBallAtRest();
    }
  }

  // 自備籃球：球體 + 兩道黑色球紋烘焙為頂點色單一網格 (1 Draw Call、不投射陰影)
  private static buildBall(): THREE.Mesh {
    const paint = (geo: THREE.BufferGeometry, hex: number) => {
      geo.deleteAttribute('uv');
      const c = new THREE.Color(hex);
      const n = geo.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    };
    const sphere = paint(new THREE.SphereGeometry(BALL_R, 14, 10), 0xd35400);
    const seamA = paint(new THREE.TorusGeometry(BALL_R + 0.002, 0.012, 4, 20), 0x111111);
    const seamB = paint(new THREE.TorusGeometry(BALL_R + 0.002, 0.012, 4, 20).rotateX(Math.PI / 2), 0x111111);
    const geo = mergeGeometries([sphere, seamA, seamB]);
    sphere.dispose();
    seamA.dispose();
    seamB.dispose();
    const mesh = new THREE.Mesh(geo ?? new THREE.SphereGeometry(BALL_R, 14, 10), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = false;
    mesh.name = 'court_pair_ball';
    return mesh;
  }

  private placeBallAtRest() {
    this.ballPos.set(this.hoop.x + this.courtDirX * 4.5, BALL_FLOOR_Y, this.hoop.z + this.courtDirZ * 4.5);
    this.ballVel.set(0, 0, 0);
    this.ballMode = 'LOOSE';
    this.holder = -1;
    if (this.ball) this.ball.position.copy(this.ballPos);
  }

  // 切換世界：收回球場活動 (泳池小魚由每幀更新依陪泳對手是否在場自動復位)
  public reset() {
    if (!this.initialized) return;
    for (let i = 0; i < this.ballers.length; i++) {
      if (this.ballers[i].lifeTask === this.ballerTasks[i]) this.ballers[i].clearLifeTask();
    }
    if (this.swimmer && !this.swimmer.isOffstage && this.swimmer.lifeTask === this.swimTask) this.swimmer.clearLifeTask();
    for (const at of this.athletes) {
      if (at.npc.lifeTask === this.trackTask) at.npc.clearLifeTask();
    }
    this.phase = 'PAUSED';
    this.resumeTimer = RESUME_DELAY;
    if (this.ball) this.placeBallAtRest();
  }

  // ===== 每幀 (僅天天國中) =====
  public update(delta: number, playerPos: THREE.Vector3) {
    if (!this.initialized) this.init();
    const weather = this.ctx.weatherSystem.currentWeather;
    const raining = weather === 'RAIN' || weather === 'THUNDERSTORM';
    if (this.inviteCooldown > 0) this.inviteCooldown -= delta;
    if (this.lineCooldown > 0) this.lineCooldown -= delta;
    this.updateAthletes(playerPos);
    this.updatePool(playerPos, raining);
    if (this.ball) this.updateCourt(delta, playerPos, raining);
  }

  // 遠離駐點且玩家不在附近：直接回到駐點 (直線移動無尋路，避免卡在圍欄外)
  private leash(npc: NPC, playerPos: THREE.Vector3, cx: number, cz: number, radius: number): boolean {
    const d2 = (npc.position.x - cx) ** 2 + (npc.position.z - cz) ** 2;
    if (d2 < radius * radius || npc.position.distanceToSquared(playerPos) < LEASH_PLAYER_DIST2) return false;
    npc.clearLifeTask();
    npc.resetToInitialState();
    return true;
  }

  // ===== 校隊選手：陪賽對手上場期間暫離名單，下場後回到駐點 =====
  private updateAthletes(playerPos: THREE.Vector3) {
    for (const a of this.athletes) {
      const npc = a.npc;
      const onStage = a.isRivalOnStage();
      if (onStage && !npc.isOffstage) this.sendOffstage(a);
      else if (!onStage && npc.isOffstage) this.bringBack(a);
      if (npc.isOffstage) continue;
      a.tag.visible = !npc.isKnockedDown;
      if (npc.campusAnchor === 'TRACK') this.updateTrackRunner(npc, playerPos);
    }
  }

  // 操場阿凱：平時沿自身巡邏點繞圈慢跑；玩家走到起跑線附近時跑回起跑線旁熱身等待挑戰 (開賽時陪跑模型即在原地接手)
  private updateTrackRunner(npc: NPC, playerPos: THREE.Vector3) {
    if (isBusy(npc)) return;
    const task = this.trackTask;
    if (npc.lifeTask && npc.lifeTask !== task) return; // CampusLife 對玩家的反應進行中
    const start = this.ctx.world.trackStartPos;
    const nearStart = playerPos.distanceToSquared(start) < 12 * 12 && !this.ctx.racingGame.isRacingTrack;
    if (!nearStart) {
      if (npc.lifeTask === task) npc.clearLifeTask();
      else if (!npc.lifeTask) this.leash(npc, playerPos, TRACK_CENTER_X, TRACK_CENTER_Z, 45);
      return;
    }
    if (!npc.lifeTask || task.phase === 'DONE') {
      const first = npc.lifeTask !== task;
      // 起跑線外側分道 (陪跑模型起跑位置)，面向逆時針前進方向
      assignTask(npc, task, TRACK_START_X, TRACK_START_Z, 'STRETCH', 4, TRACK_START_X, TRACK_START_Z - 5, 1, true, 0.6,
        first ? '要跟我比 200m 嗎？' : '');
    }
  }

  // 比賽開始：暫離 NPC 名單 (不受攻擊、不出現在雷達、不跑 AI)，由陪賽模型代演；不論是否被打倒或正在追人一律上場
  private sendOffstage(a: { npc: NPC; slot: number }) {
    const npc = a.npc;
    const list = this.ctx.campusNPCs;
    const idx = list.indexOf(npc);
    if (idx >= 0) {
      a.slot = idx;
      list.splice(idx, 1);
    }
    npc.clearLifeTask();
    npc.resetAggro();
    npc.isOffstage = true;
    npc.mesh.visible = false;
  }

  // 比賽結束：回到駐點 (起跑線 / 出發台旁甲板)，滿血、清除仇恨，放回原名單位置
  private bringBack(a: { npc: NPC; slot: number }) {
    const npc = a.npc;
    npc.clearLifeTask();
    npc.resetToInitialState();
    npc.isOffstage = false;
    const list = this.ctx.campusNPCs;
    if (list.indexOf(npc) < 0) list.splice(Math.min(a.slot, list.length), 0, npc);
    if (npc === this.swimmer) {
      this.deckIdx = 0;
      this.inviteCooldown = 8;
      npc.showSpeechBubble('呼～游得真過癮！', false, 2.2);
    } else {
      npc.showSpeechBubble('呼～再跑一圈收操！', false, 2.2);
    }
  }

  // ===== 泳池小魚：甲板熱身短巡 =====
  private updatePool(playerPos: THREE.Vector3, raining: boolean) {
    const npc = this.swimmer;
    if (!npc || npc.isOffstage || isBusy(npc)) return;
    const task = this.swimTask;
    if (npc.lifeTask && npc.lifeTask !== task) return; // CampusLife 對玩家的反應進行中
    if (this.leash(npc, playerPos, POOL_CENTER_X, POOL_CENTER_Z, 16)) return;
    if (raining) {
      if (npc.lifeTask) npc.clearLifeTask(); // 下雨：沿甲板短巡邏
      return;
    }

    if (!npc.lifeTask || task.phase === 'DONE') {
      if (npc.lifeTask === task) this.deckIdx = (this.deckIdx + 1) % DECK_SPOTS.length;
      const s = DECK_SPOTS[this.deckIdx];
      let bubble = '';
      if (this.deckIdx === 0) {
        bubble = DECK_LINES[this.deckLineIdx % DECK_LINES.length];
        this.deckLineIdx++;
      }
      npc.baseFloorY = POOL_DECK_Y;
      assignTask(npc, task, s.x, s.z, s.hold, s.time, s.fx, s.fz, 1, false, 0.45, bubble);
    }

    // 玩家走近：邀請比賽
    if (this.inviteCooldown <= 0 && !this.ctx.racingGame.isSwimmingRace && npc.position.distanceToSquared(playerPos) < 49) {
      this.inviteCooldown = 25;
      npc.showSpeechBubble('要跟我比 50m 自由式嗎？到出發台挑戰我吧！', false, 2.6);
    }
  }

  // ===== 籃球場鬥牛 =====
  private ownsTask(i: number): boolean {
    return this.ballers[i].lifeTask === this.ballerTasks[i];
  }

  private onCourt(npc: NPC): boolean {
    const p = npc.position;
    return p.x > COURT_MIN_X - 1 && p.x < COURT_MAX_X + 1 && p.z > COURT_MIN_Z - 1 && p.z < COURT_MAX_Z + 1 && Math.abs(p.y) < 0.5;
  }

  private say(i: number, text: string) {
    if (this.lineCooldown > 0 || !this.playerLineNear) return;
    this.lineCooldown = 5;
    this.ballers[i].showSpeechBubble(text, false, 1.8);
  }

  private updateCourt(delta: number, playerPos: THREE.Vector3, raining: boolean) {
    const ball = this.ball!;
    const ballD2 = this.ballPos.distanceToSquared(playerPos);
    this.playerNear = ballD2 < SOUND_DIST2;
    this.playerLineNear = ballD2 < LINE_DIST2;

    let blocked = raining;
    for (let i = 0; i < 2; i++) {
      const n = this.ballers[i];
      if (isBusy(n) || (n.lifeTask && !this.ownsTask(i))) {
        blocked = true;
        continue;
      }
      if (!this.onCourt(n)) {
        blocked = true;
        this.leash(n, playerPos, COURT_CENTER_X, COURT_CENTER_Z, 28);
      }
    }

    if (blocked) {
      if (this.phase !== 'PAUSED') this.pauseCourt();
    } else if (this.phase === 'PAUSED') {
      this.resumeTimer -= delta;
      if (this.resumeTimer <= 0) this.startRetrieve(this.closerToBall());
    } else {
      this.updateCourtPhase(delta);
    }

    this.updateBall(delta);
    ball.position.copy(this.ballPos);
  }

  // 暫停：持球者把球掉在地上，兩人恢復原本的球場巡邏 (交由 CampusLife 反應或 NPC 自身行為)
  private pauseCourt() {
    if (this.ballMode === 'HELD') {
      this.ballMode = 'LOOSE';
      this.ballVel.set((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5);
    }
    this.holder = -1;
    for (let i = 0; i < 2; i++) {
      if (this.ownsTask(i)) this.ballers[i].clearLifeTask();
    }
    this.phase = 'PAUSED';
    this.resumeTimer = RESUME_DELAY;
  }

  private closerToBall(): number {
    const d0 = this.ballers[0].position.distanceToSquared(this.ballPos);
    const d1 = this.ballers[1].position.distanceToSquared(this.ballPos);
    return d0 <= d1 ? 0 : 1;
  }

  // 原地觀看 (抵達半徑大於 0：立即進入待機並轉向)
  private watch(i: number, faceX: number, faceZ: number, holdTime = 60) {
    const n = this.ballers[i];
    assignTask(n, this.ballerTasks[i], n.position.x, n.position.z, 'LOOK_AROUND', holdTime, faceX, faceZ, 1, false, 5);
  }

  private chaseBall(i: number) {
    const n = this.ballers[i];
    const far = n.position.distanceToSquared(this.ballPos) > 9;
    assignTask(n, this.ballerTasks[i], this.ballPos.x, this.ballPos.z, 'LOOK_AROUND', 0.6, this.ballPos.x, this.ballPos.z, far ? 1.45 : 1.1, far, 0.45);
  }

  private startRetrieve(i: number) {
    this.retriever = i;
    this.phase = 'REBOUND';
    this.phaseTimer = 0;
    this.chaseBall(i);
    const o = 1 - i;
    if (!this.ownsTask(o) || this.ballerTasks[o].phase === 'DONE') this.watch(o, this.ballPos.x, this.ballPos.z);
  }

  private beginSetup(shooter: number) {
    this.shooter = shooter;
    this.holder = shooter;
    this.ballMode = 'HELD';
    let next = Math.floor(Math.random() * SHOT_SPOTS.length);
    if (next === this.spotIdx) next = (next + 1) % SHOT_SPOTS.length;
    this.spotIdx = next;
    const [ox, oz] = SHOT_SPOTS[next];
    // 出手點以球場內側方向 (courtDir) 為前方展開
    const sx = this.hoop.x + ox * -this.courtDirZ + oz * -this.courtDirX;
    const sz = this.hoop.z + ox * this.courtDirX + oz * -this.courtDirZ;
    const s = this.ballers[shooter];
    assignTask(s, this.ballerTasks[shooter], sx, sz, 'SHOOT_HOOP', 1.45, this.hoop.x, this.hoop.z, 1.2, true, 0.4);
    // 搶籃板者站到出手者另一側的籃下
    const r = 1 - shooter;
    const [rx, rz] = REBOUND_SPOTS[ox >= 0 ? 0 : 1];
    const bx = this.hoop.x + rx * -this.courtDirZ + rz * -this.courtDirX;
    const bz = this.hoop.z + rx * this.courtDirX + rz * -this.courtDirZ;
    assignTask(this.ballers[r], this.ballerTasks[r], bx, bz, 'LOOK_AROUND', 60, sx, sz, 1.2, true, 0.5);
    this.phase = 'SETUP';
    this.phaseTimer = 0;
  }

  private updateCourtPhase(delta: number) {
    this.phaseTimer += delta;
    const tasks = this.ballerTasks;
    switch (this.phase) {
      case 'SETUP': {
        const t = tasks[this.shooter];
        if (t.phase === 'HOLD') {
          this.phase = 'SHOOT';
          this.released = false;
        } else if (t.phase === 'DONE' || this.phaseTimer > 15) {
          this.beginSetup(this.shooter); // 受阻：改換出手點
        }
        this.keepWatching(1 - this.shooter);
        break;
      }
      case 'SHOOT': {
        const s = this.ballers[this.shooter];
        // SHOOT_HOOP 動作 1.4 秒一循環：0.6 秒時雙手舉到最高點出手
        if (!this.released && (s.pauseAnimTimer >= 0.6 || tasks[this.shooter].phase !== 'HOLD')) {
          this.released = true;
          this.releaseShot();
          this.phase = 'WATCH_SHOT';
        }
        break;
      }
      case 'WATCH_SHOT':
      case 'PASS':
        this.keepWatching(0);
        this.keepWatching(1);
        break;
      case 'REBOUND': {
        const i = this.retriever;
        const t = tasks[i];
        const n = this.ballers[i];
        const dx = this.ballPos.x - n.position.x;
        const dz = this.ballPos.z - n.position.z;
        if (this.ballMode === 'LOOSE' && dx * dx + dz * dz < PICKUP_DIST * PICKUP_DIST && this.ballPos.y < 1.8) {
          this.onPickup(i);
          break;
        }
        if (this.phaseTimer > RETRIEVE_TIMEOUT && this.ballMode === 'LOOSE') {
          // 保險：撿不到 (卡在角落) 時直接撿起，避免球卡死
          this.onPickup(i);
          break;
        }
        if (t.phase === 'GO') {
          t.target.set(this.ballPos.x, n.baseFloorY, this.ballPos.z);
          t.faceX = this.ballPos.x;
          t.faceZ = this.ballPos.z;
        } else {
          this.chaseBall(i);
        }
        this.keepWatching(1 - i);
        break;
      }
      case 'PREP_PASS': {
        this.keepWatching(0);
        this.keepWatching(1);
        if (this.phaseTimer > 0.8) this.launchPass();
        break;
      }
    }
  }

  // 觀看任務結束 (出手完成或長時間待機逾時) 時改為原地面向球
  private keepWatching(i: number) {
    const t = this.ballerTasks[i];
    if (this.ownsTask(i) && t.phase !== 'DONE') return;
    if (this.phase === 'SETUP' && i === this.shooter) return;
    this.watch(i, this.ballPos.x, this.ballPos.z);
  }

  private onPickup(i: number) {
    this.holder = i;
    this.ballMode = 'HELD';
    this.ballVel.set(0, 0, 0);
    const o = 1 - i;
    const n = this.ballers[i];
    const other = this.ballers[o];
    const dist2 = n.position.distanceToSquared(other.position);
    if (Math.random() < 0.45 && dist2 > 9) {
      // 傳球給隊友，由隊友出手
      this.passReceiver = o;
      this.phase = 'PREP_PASS';
      this.phaseTimer = 0;
      this.watch(i, other.position.x, other.position.z, 3);
      this.watch(o, n.position.x, n.position.z, 6);
      this.say(i, '傳給你！');
    } else {
      // 自己運球出去換手出手
      if (this.phase === 'REBOUND') this.say(i, Math.random() < 0.5 ? '籃板我的！' : '換我投！');
      this.beginSetup(i);
    }
  }

  private launchPass() {
    const from = this.holder;
    const to = this.passReceiver;
    if (from < 0) {
      this.startRetrieve(this.closerToBall());
      return;
    }
    const r = this.ballers[to];
    _v1.set(r.position.x + Math.sin(r.rotationY) * 0.35, r.position.y + 1.15, r.position.z + Math.cos(r.rotationY) * 0.35);
    const d = Math.hypot(_v1.x - this.ballPos.x, _v1.z - this.ballPos.z);
    this.startFlight('PASS', _v1, 0.3 + d / 11);
    this.holder = -1;
    this.phase = 'PASS';
    this.phaseTimer = 0;
  }

  private releaseShot() {
    const make = Math.random() < MAKE_CHANCE;
    const s = this.ballers[this.shooter];
    if (make) {
      _v1.set(this.hoop.x, this.hoop.y + 0.08, this.hoop.z);
    } else {
      // 打在籃框前緣 / 側緣 (朝出手者方向 ±60°)
      const a = Math.atan2(s.position.x - this.hoop.x, s.position.z - this.hoop.z) + (Math.random() - 0.5) * 2.1;
      _v1.set(this.hoop.x + Math.sin(a) * 0.33, this.hoop.y + 0.05, this.hoop.z + Math.cos(a) * 0.33);
    }
    const d = Math.hypot(_v1.x - this.ballPos.x, _v1.z - this.ballPos.z);
    this.startFlight(make ? 'MAKE' : 'MISS', _v1, 0.85 + d * 0.07);
    this.holder = -1;
  }

  // 解析式拋物線：t 秒後恰好抵達 target
  private startFlight(kind: FlightKind, target: THREE.Vector3, dur: number) {
    this.flightKind = kind;
    this.flightStart.copy(this.ballPos);
    this.flightTarget.copy(target);
    this.flightDur = dur;
    this.flightT = 0;
    this.flightVel.subVectors(target, this.ballPos).multiplyScalar(1 / dur);
    this.flightVel.y += 0.5 * GRAVITY * dur;
    this.ballMode = 'FLIGHT';
  }

  private endFlight() {
    this.ballPos.copy(this.flightTarget);
    this.ballMode = 'LOOSE';
    const kind = this.flightKind;
    if (kind === 'PASS') {
      if (this.phase === 'PASS') {
        this.ballVel.set(0, 0, 0);
        this.say(this.passReceiver, '好球！');
        this.beginSetup(this.passReceiver);
      } else {
        this.ballVel.set(0, -1, 0); // 暫停中沒人接：落地
      }
      return;
    }
    if (kind === 'MAKE') {
      // 刷網落下，朝球場內側滾出
      this.ballVel.set(this.courtDirX * (0.5 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.6, -1.2,
        this.courtDirZ * (0.5 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.6);
      if (this.playerNear) soundManager.playSwish(this.hoop);
      if (this.phase === 'WATCH_SHOT') this.say(this.shooter, Math.random() < 0.5 ? '唰！空心！' : '進了！手感發燙！');
    } else {
      // 打框彈出
      const ox = this.ballPos.x - this.hoop.x;
      const oz = this.ballPos.z - this.hoop.z;
      const ol = Math.hypot(ox, oz) || 1;
      const sp = 1.8 + Math.random() * 1.6;
      this.ballVel.set((ox / ol) * sp + (Math.random() - 0.5), 2.0 + Math.random() * 1.2, (oz / ol) * sp + (Math.random() - 0.5));
      if (this.playerNear) soundManager.playRimHit(this.hoop);
      if (this.phase === 'WATCH_SHOT') this.say(this.shooter, Math.random() < 0.5 ? '又打鐵了啦…' : '可惡，差一點！');
    }
    if (this.phase === 'WATCH_SHOT') {
      // 較接近落點者去搶籃板，另一人原地看
      _v2.copy(this.ballPos).addScaledVector(this.ballVel, 0.6);
      const d0 = this.ballers[0].position.distanceToSquared(_v2);
      const d1 = this.ballers[1].position.distanceToSquared(_v2);
      this.startRetrieve(d0 <= d1 ? 0 : 1);
    }
  }

  private updateBall(delta: number) {
    const ball = this.ball!;
    if (this.ballMode === 'HELD' && this.holder >= 0) {
      const n = this.ballers[this.holder];
      const fx = Math.sin(n.rotationY);
      const fz = Math.cos(n.rotationY);
      const t = this.ballerTasks[this.holder];
      if (this.phase === 'SHOOT' && this.holder === this.shooter && t.phase === 'HOLD') {
        // 屈膝蓄力 → 雙手上舉 (同步 SHOOT_HOOP 動作)
        const ct = (n.pauseAnimTimer % 1.4) / 1.4;
        const lift = ct < 0.45 ? ct / 0.45 : 1;
        this.ballPos.set(n.position.x + fx * 0.32, n.mesh.position.y + 1.15 + 0.95 * lift, n.position.z + fz * 0.32);
      } else {
        // 右手側運球 (移動中拍得較快)
        const moving = t.phase === 'GO';
        this.dribbleT += delta * (moving ? 2.6 : 1.8);
        const beat = Math.floor(this.dribbleT);
        if (beat !== this.lastDribbleBeat) {
          this.lastDribbleBeat = beat;
          if (this.playerNear) soundManager.playDribble(this.ballPos);
        }
        const h = Math.abs(Math.sin(this.dribbleT * Math.PI));
        // NPC 本地 +X (右手) = (cos, -sin)
        this.ballPos.set(
          n.position.x + Math.cos(n.rotationY) * 0.42 + fx * 0.28,
          n.position.y + BALL_FLOOR_Y + h * 0.66,
          n.position.z - Math.sin(n.rotationY) * 0.42 + fz * 0.28
        );
        ball.rotation.x += delta * 6;
      }
      return;
    }

    if (this.ballMode === 'FLIGHT') {
      this.flightT += delta;
      if (this.flightT >= this.flightDur) {
        this.endFlight();
      } else {
        const t = this.flightT;
        this.ballPos.copy(this.flightStart).addScaledVector(this.flightVel, t);
        this.ballPos.y -= 0.5 * GRAVITY * t * t;
        ball.rotation.x -= delta * 8; // 出手後旋
      }
      return;
    }

    // LOOSE：重力、落地彈跳、滾動摩擦、球場邊界與籃架下方回推
    const v = this.ballVel;
    const p = this.ballPos;
    if (v.y !== 0 || p.y > BALL_FLOOR_Y + 1e-3) v.y -= GRAVITY * delta;
    p.addScaledVector(v, delta);
    if (p.y <= BALL_FLOOR_Y) {
      p.y = BALL_FLOOR_Y;
      if (v.y < 0) {
        const vy = -v.y * 0.62;
        if (vy < 0.8) {
          v.y = 0;
        } else {
          v.y = vy;
          if (this.playerNear) soundManager.playDribble(this.ballPos);
        }
      }
    }
    if (v.y === 0 && p.y <= BALL_FLOOR_Y + 1e-3) {
      const damp = Math.max(0, 1 - delta * 1.2);
      v.x *= damp;
      v.z *= damp;
      if (v.x * v.x + v.z * v.z < 0.01) {
        v.x = 0;
        v.z = 0;
      }
    }
    if (p.x < COURT_MIN_X) { p.x = COURT_MIN_X; v.x = Math.abs(v.x) * 0.5; }
    if (p.x > COURT_MAX_X) { p.x = COURT_MAX_X; v.x = -Math.abs(v.x) * 0.5; }
    if (p.z < COURT_MIN_Z) { p.z = COURT_MIN_Z; v.z = Math.abs(v.z) * 0.5; }
    if (p.z > COURT_MAX_Z) { p.z = COURT_MAX_Z; v.z = -Math.abs(v.z) * 0.5; }
    // 籃架正下方 (NPC 碰撞盒擋住、撿不到)：低於 1m 時推回球場內側
    if (p.y < 1.0 && Math.abs(p.x - this.hoop.x) < 0.7 && (p.z - this.hoop.z) * this.courtDirZ < 0.55) {
      p.z = this.hoop.z + this.courtDirZ * 0.55;
      v.z = this.courtDirZ * Math.max(0.6, Math.abs(v.z) * 0.5);
    }
    ball.rotation.x += v.z * delta / BALL_R;
    ball.rotation.z -= v.x * delta / BALL_R;
  }
}
