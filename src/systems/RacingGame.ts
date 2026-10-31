import * as THREE from 'three';
import { Player } from '../entities/Player';
import { RaceRival } from '../entities/RaceRival';
import { WantedSystem } from './WantedSystem';
import { soundManager } from '../audio/SoundEffects';
import { WaterSplashVFX } from '../effects/WaterSplashVFX';
import { SWIM_TEAM_LOOK, TRACK_TEAM_LOOK } from '../entities/npc/models';

// 陪賽對手自適應配速 (速度皆以「玩家路徑等效 m/s」表示)：
// 中段緊咬玩家 (落後 1~4m、偶爾短暫超前製造壓力)；最後 25% 依玩家努力程度擲骰決定劇本 (玩家險勝 / 對手險勝)，
// 對手速度上下限確保：表現出色者仍能逆轉，走走停停者必輸
interface RivalTuning {
  minSpeed: number; // 配速下限：慢於此速者必輸
  maxSpeed: number; // 配速上限：表現出色者可擺脫
  refPace: number; // 全力衝刺玩家的平均配速，作為努力程度基準
  name: string;
}
const TRACK_TUNING: RivalTuning = { minSpeed: 4.3, maxSpeed: 8.6, refPace: 7.9, name: '阿凱' };
const SWIM_TUNING: RivalTuning = { minSpeed: 1.7, maxSpeed: 3.1, refPace: 2.75, name: '小魚' };
const FINAL_PHASE_START = 0.75;
const TRACK_CP_RADIUS = 4.8; // 玩家觸發檢查點半徑
const SWIM_CP_RADIUS = 3.2;
const RIVAL_ACCEL = 4.0; // 對手加減速上限 (m/s²)，避免瞬移或抖動
const OVERTAKE_BANNER_COOLDOWN = 8.0;
const COUNTDOWN_DURATION = 3.0;
const FALSE_START_DIST = 3.0;
const RIVAL_POST_RACE_TIME = 4.0;

// 操場跑道幾何 (對齊 CampusWorld.buildRunningTrack：中心 (-55, 30)、直道半長 16)
const TRACK_CENTER_X = -55;
const TRACK_CENTER_Z = 30;
const TRACK_STRAIGHT_HALF = 16;
const TRACK_RIVAL_RADIUS = 27.0; // 玩家沿 25m 分道線跑，對手位於外側相鄰跑道
// 泳池對手泳道 (玩家沿 x=73.25 第 2 泳道，對手位於東側相鄰泳道)
const SWIM_RIVAL_LANE_X = 77.5;
const POOL_WATER_MIN_Z = -48.0;

interface RaceState {
  countdown: number;
  lastCountdownSec: number;
  startPos: THREE.Vector3;
  playerPath: THREE.Vector3[];
  playerCum: number[];
  cpRadius: number;
  tuning: RivalTuning;
  elapsed: number;
  rivalSpeed: number; // 對手目前速度 (對手路徑 m/s)
  playerSpeedEma: number; // 玩家平滑速度 (玩家路徑 m/s)
  lastPlayerMeters: number;
  pacePhase: number; // 中段拉鋸節奏相位 (每場隨機)
  script: 'NONE' | 'PLAYER' | 'RIVAL'; // 終盤劇本
  rivalLeading: boolean;
  bannerCooldown: number;
  gapMeters: number; // 正值：玩家領先
  postRaceTimer: number;
  rivalWon: boolean;
}

const _scratchTriggerA = new THREE.Vector3();
const _scratchTriggerB = new THREE.Vector3();

const createRaceState = (): RaceState => ({
  countdown: 0,
  lastCountdownSec: -1,
  startPos: new THREE.Vector3(),
  playerPath: [],
  playerCum: [],
  cpRadius: 0,
  tuning: TRACK_TUNING,
  elapsed: 0,
  rivalSpeed: 0,
  playerSpeedEma: 0,
  lastPlayerMeters: 0,
  pacePhase: 0,
  script: 'NONE',
  rivalLeading: false,
  bannerCooldown: 0,
  gapMeters: 0,
  postRaceTimer: 0,
  rivalWon: false
});

export class RacingGame {
  // 操場 200m 賽跑計時挑戰
  public isRacingTrack: boolean = false;
  public raceTimer: number = 0;
  public raceCheckpointIdx: number = 0;
  public checkpointMarker: THREE.Mesh;
  public bestTrackTime: number | null = null;

  // 游泳池 50m 水上競速挑戰
  public isSwimmingRace: boolean = false;
  public swimRaceTimer: number = 0;
  public swimCheckpointIdx: number = 0;
  public swimCheckpointMarker: THREE.Mesh;
  public bestSwimTime: number | null = null;

  // 陪跑 / 陪泳對手
  public trackRival: RaceRival;
  public swimRival: RaceRival;
  private trackState: RaceState = createRaceState();
  private swimState: RaceState = createRaceState();

  constructor(scene: THREE.Scene) {
    // 操場檢查點綠色光圈
    const cpGeo = new THREE.TorusGeometry(1.6, 0.12, 8, 24);
    const cpMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.85 });
    this.checkpointMarker = new THREE.Mesh(cpGeo, cpMat);
    this.checkpointMarker.visible = false;
    scene.add(this.checkpointMarker);

    // 泳池檢查點青水色光圈
    const swimCpGeo = new THREE.TorusGeometry(1.5, 0.12, 8, 24);
    const swimCpMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.88 });
    this.swimCheckpointMarker = new THREE.Mesh(swimCpGeo, swimCpMat);
    this.swimCheckpointMarker.visible = false;
    scene.add(this.swimCheckpointMarker);

    // 與操場慢跑的阿凱 NPC 同比例、同配色：比賽期間由此模型代演 (CampusSportsCrew 於上場期間隱藏 NPC)
    this.trackRival = new RaceRival(scene, TRACK_TEAM_LOOK.label, TRACK_TEAM_LOOK.jersey, TRACK_TEAM_LOOK.cap, 'NPC');
    this.trackRival.setPath(this.buildTrackRivalPath());
    this.trackRival.hide();

    // 與池畔小魚 NPC 同比例、同配色：比賽期間由此模型代演池畔的小魚 (CampusSportsCrew 於上場期間隱藏 NPC)
    this.swimRival = new RaceRival(scene, SWIM_TEAM_LOOK.label, SWIM_TEAM_LOOK.jersey, SWIM_TEAM_LOOK.cap, 'NPC');
    this.swimRival.setPath([
      new THREE.Vector3(SWIM_RIVAL_LANE_X, 0.3, -48.6), // 出發台
      new THREE.Vector3(SWIM_RIVAL_LANE_X, 0.25, -47.0), // 躍入水中
      new THREE.Vector3(SWIM_RIVAL_LANE_X, 0.25, -22.8), // 南端觸壁折返
      new THREE.Vector3(SWIM_RIVAL_LANE_X, 0.25, -47.8) // 北端終點觸壁
    ]);
    this.swimRival.hide();
  }

  // 外側相鄰跑道：自東直道北端起跑，逆時針繞場一圈回到終點線
  private buildTrackRivalPath(): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const r = TRACK_RIVAL_RADIUS;
    const northZ = TRACK_CENTER_Z - TRACK_STRAIGHT_HALF;
    const southZ = TRACK_CENTER_Z + TRACK_STRAIGHT_HALF;
    const segs = 24;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI;
      pts.push(new THREE.Vector3(TRACK_CENTER_X + r * Math.cos(a), 0, northZ - r * Math.sin(a)));
    }
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI;
      pts.push(new THREE.Vector3(TRACK_CENTER_X - r * Math.cos(a), 0, southZ + r * Math.sin(a)));
    }
    pts.push(new THREE.Vector3(TRACK_CENTER_X + r, 0, northZ));
    return pts;
  }

  private prepareRace(
    state: RaceState,
    rival: RaceRival,
    playerPos: THREE.Vector3,
    checkpoints: THREE.Vector3[],
    tuning: RivalTuning,
    cpRadius: number
  ) {
    state.countdown = COUNTDOWN_DURATION;
    state.lastCountdownSec = -1;
    state.startPos.copy(playerPos);
    state.playerPath = [state.startPos, ...checkpoints];
    state.cpRadius = cpRadius;
    // 有效路徑：玩家進入檢查點半徑即算通過 (折返點可少游一段)，以觸發點間距累計，確保進度連續且與實際所需路程一致
    state.playerCum = [0];
    const prevTrigger = _scratchTriggerA.copy(state.startPos);
    for (let i = 1; i < state.playerPath.length; i++) {
      const cp = state.playerPath[i];
      const trigger = _scratchTriggerB.subVectors(prevTrigger, cp);
      const len = trigger.length();
      if (len > cpRadius) trigger.multiplyScalar(cpRadius / len);
      trigger.add(cp);
      state.playerCum.push(state.playerCum[i - 1] + trigger.distanceTo(prevTrigger));
      prevTrigger.copy(trigger);
    }
    state.tuning = tuning;
    state.elapsed = 0;
    state.rivalSpeed = 0;
    state.playerSpeedEma = 0;
    state.lastPlayerMeters = 0;
    state.pacePhase = Math.random() * Math.PI * 2;
    state.script = 'NONE';
    state.rivalLeading = false;
    state.bannerCooldown = 0;
    state.gapMeters = 0;
    state.postRaceTimer = 0;
    state.rivalWon = false;
    rival.reset();
  }

  public startTrackRace(wantedSystem: WantedSystem, playerPos: THREE.Vector3, checkpoints: THREE.Vector3[]) {
    this.isRacingTrack = true;
    this.raceTimer = 0;
    this.raceCheckpointIdx = 0;
    this.prepareRace(this.trackState, this.trackRival, playerPos, checkpoints, TRACK_TUNING, TRACK_CP_RADIUS);
    wantedSystem.showBanner('⏱️【200m 操場對決】田徑隊阿凱已就位！倒數後沿跑道「逆時針方向」全力衝刺！', 2500);
  }

  public startSwimRace(wantedSystem: WantedSystem, playerPos: THREE.Vector3, checkpoints: THREE.Vector3[]) {
    this.isSwimmingRace = true;
    this.swimRaceTimer = 0;
    this.swimCheckpointIdx = 0;
    this.prepareRace(this.swimState, this.swimRival, playerPos, checkpoints, SWIM_TUNING, SWIM_CP_RADIUS);
    wantedSystem.showBanner('🏊【50m 自由式對決】游泳隊小魚已站上出發台！倒數後跳入泳池游過青色檢查點！', 2500);
  }

  // 陪賽對手是否在場上 (倒數、比賽中、賽後停留期間)
  public get isSwimRivalOnStage(): boolean {
    return this.swimRival.mesh.visible;
  }

  public get isTrackRivalOnStage(): boolean {
    return this.trackRival.mesh.visible;
  }

  // 世界切換等情況：立即中止所有比賽並收起對手
  public abortAll() {
    this.isRacingTrack = false;
    this.isSwimmingRace = false;
    this.trackState.countdown = 0;
    this.swimState.countdown = 0;
    this.trackState.postRaceTimer = 0;
    this.swimState.postRaceTimer = 0;
    this.checkpointMarker.visible = false;
    this.swimCheckpointMarker.visible = false;
    this.trackRival.hide();
    this.swimRival.hide();
  }

  // 即時名次提示 (供 HUD 提示列顯示，避免橫幅洗版)
  public get trackStandingText(): string {
    return RacingGame.formatStanding(this.trackState);
  }

  public get swimStandingText(): string {
    return RacingGame.formatStanding(this.swimState);
  }

  private static formatStanding(state: RaceState): string {
    if (state.countdown > 0) return `🚦 預備 ${Math.ceil(state.countdown)}`;
    const gap = Math.abs(state.gapMeters).toFixed(1);
    return state.gapMeters >= 0 ? `🥇 領先 ${gap}m` : `🥈 落後 ${gap}m`;
  }

  // 倒數 3-2-1-GO；倒數期間離開起點視為搶跑並重新倒數。回傳 true 表示仍在倒數中
  private updateCountdown(delta: number, state: RaceState, playerPos: THREE.Vector3, wantedSystem: WantedSystem): boolean {
    if (state.countdown <= 0) return false;
    const dx = playerPos.x - state.startPos.x;
    const dz = playerPos.z - state.startPos.z;
    if (dx * dx + dz * dz > FALSE_START_DIST * FALSE_START_DIST) {
      state.countdown = COUNTDOWN_DURATION;
      state.lastCountdownSec = -1;
      wantedSystem.showBanner('⚠️ 搶跑！請回到起點，重新倒數！', 1500);
      return true;
    }
    state.countdown -= delta;
    if (state.countdown <= 0) {
      soundManager.playWhistle(state.startPos);
      wantedSystem.showBanner('🏁 GO！', 900);
      return false;
    }
    const sec = Math.ceil(state.countdown);
    if (sec !== state.lastCountdownSec) {
      state.lastCountdownSec = sec;
      soundManager.playBroadcastChime(state.startPos);
      wantedSystem.showBanner(`🚦 ${sec}`, 800);
    }
    return true;
  }

  // 玩家沿檢查點路徑的前進距離
  private static playerProgressMeters(state: RaceState, cpIdx: number, playerPos: THREE.Vector3): number {
    const n = state.playerPath.length - 1;
    if (cpIdx >= n) return state.playerCum[n];
    const segLen = state.playerCum[cpIdx + 1] - state.playerCum[cpIdx];
    const remaining = Math.max(0, playerPos.distanceTo(state.playerPath[cpIdx + 1]) - state.cpRadius);
    const along = THREE.MathUtils.clamp(segLen - remaining, 0, segLen);
    return state.playerCum[cpIdx] + along;
  }

  // 對手自適應推進：追蹤玩家進度 + 目標間距，速度受上下限與加速度限制
  private static advanceRival(
    delta: number,
    state: RaceState,
    rival: RaceRival,
    cpIdx: number,
    playerPos: THREE.Vector3,
    wantedSystem: WantedSystem
  ) {
    const tuning = state.tuning;
    const playerTotal = state.playerCum[state.playerCum.length - 1];
    if (playerTotal <= 0 || delta <= 0) return;
    const lenRatio = rival.totalLength / playerTotal; // 玩家路徑 → 對手路徑換算 (對手跑外道較長)
    const playerMeters = RacingGame.playerProgressMeters(state, cpIdx, playerPos);
    const playerFrac = playerMeters / playerTotal;

    // 玩家速度平滑 (檢查點判定半徑會造成進度跳動，故限制瞬時值並以 EMA 平滑)
    const instSpeed = THREE.MathUtils.clamp((playerMeters - state.lastPlayerMeters) / delta, 0, tuning.maxSpeed * 1.6);
    state.lastPlayerMeters = playerMeters;
    state.playerSpeedEma += (instSpeed - state.playerSpeedEma) * Math.min(delta * 1.5, 1.0);
    state.elapsed += delta;
    state.bannerCooldown -= delta;

    // 終盤劇本：依玩家至今平均配速 (努力程度) 擲骰，越努力越容易險勝
    const raceFrac = Math.max(playerFrac, rival.progress);
    if (state.script === 'NONE' && raceFrac >= FINAL_PHASE_START) {
      const effort = (playerMeters / Math.max(state.elapsed, 0.1)) / tuning.refPace;
      const playerWinChance = THREE.MathUtils.clamp((effort - 0.42) / 0.72, 0, 0.9);
      state.script = Math.random() < playerWinChance ? 'PLAYER' : 'RIVAL';
      if (state.bannerCooldown <= 0) {
        state.bannerCooldown = OVERTAKE_BANNER_COOLDOWN;
        wantedSystem.showBanner(`🔥 最後衝刺！${tuning.name}開始加速了！`, 1500);
      }
    }

    // 目標間距 (正值：對手領先，單位 m)
    let targetOffset: number;
    if (state.script === 'NONE') {
      // 中段：依賽程進度拉鋸 (約 1.5 個循環)，多數時間落後 1~3m，期間會短暫超前製造壓力
      targetOffset = -0.4 + 2.8 * Math.sin(raceFrac * Math.PI * 4.0 + state.pacePhase);
    } else {
      const u = THREE.MathUtils.clamp((raceFrac - FINAL_PHASE_START) / (1 - FINAL_PHASE_START), 0, 1);
      targetOffset = state.script === 'PLAYER'
        ? THREE.MathUtils.lerp(0.8, -2.2, THREE.MathUtils.smoothstep(u, 0.35, 1.0)) // 並肩施壓後體力不支，玩家險勝
        : THREE.MathUtils.lerp(0.5, 3.0, u); // 終盤爆發，對手險勝
    }

    const targetRivalMeters = playerFrac * rival.totalLength + targetOffset;
    let desiredSpeed = state.playerSpeedEma * lenRatio + (targetRivalMeters - rival.distance) * 0.8;
    // 中段允許短暫爆發 (+15%) 以便超前施壓；終盤嚴守上限，出色玩家仍可擺脫
    const speedCap = tuning.maxSpeed * (state.script === 'NONE' ? 1.15 : 1.0);
    desiredSpeed = THREE.MathUtils.clamp(desiredSpeed, tuning.minSpeed * lenRatio, speedCap * lenRatio);
    const maxDv = RIVAL_ACCEL * delta;
    state.rivalSpeed += THREE.MathUtils.clamp(desiredSpeed - state.rivalSpeed, -maxDv, maxDv);
    rival.advance(state.rivalSpeed * delta);

    state.gapMeters = (playerFrac - rival.progress) * rival.totalLength;

    // 對手反超時的戲劇性提示 (節流)
    const leadingNow = state.gapMeters < -0.8;
    if (leadingNow && !state.rivalLeading && state.bannerCooldown <= 0) {
      state.bannerCooldown = OVERTAKE_BANNER_COOLDOWN;
      wantedSystem.showBanner(`⚡ ${tuning.name}超前了！加把勁追回來！`, 1400);
    }
    state.rivalLeading = leadingNow;
  }

  // 賽後：對手衝線後歡呼 (獲勝) 或停步，數秒後離場
  private static updatePostRace(delta: number, state: RaceState, rival: RaceRival, isSwim: boolean) {
    if (state.postRaceTimer <= 0) return;
    state.postRaceTimer -= delta;
    if (!rival.isFinished) {
      rival.advance(Math.max(state.rivalSpeed, state.tuning.minSpeed) * delta);
      rival.setPose(isSwim && rival.mesh.position.z > POOL_WATER_MIN_Z ? 'SWIM' : 'RUN', delta);
    } else {
      // 泳池內維持踩水划水姿態，跑道上獲勝振臂歡呼
      rival.setPose(isSwim ? 'SWIM' : (state.rivalWon ? 'CHEER' : 'STAND'), delta);
    }
    if (state.postRaceTimer <= 0) rival.hide();
  }

  // 中止條件：倒地、騎車、遠離賽場
  private abortRace(isSwim: boolean, wantedSystem: WantedSystem) {
    if (isSwim) {
      this.isSwimmingRace = false;
      this.swimState.countdown = 0;
      this.swimState.postRaceTimer = 0;
      this.swimCheckpointMarker.visible = false;
      this.swimRival.hide();
      wantedSystem.showBanner('🏊 已離開泳池，50m 對決中止。', 2000);
    } else {
      this.isRacingTrack = false;
      this.trackState.countdown = 0;
      this.trackState.postRaceTimer = 0;
      this.checkpointMarker.visible = false;
      this.trackRival.hide();
      wantedSystem.showBanner('⏱️ 已離開跑道，200m 對決中止。', 2000);
    }
  }

  public updateTrack(
    delta: number,
    playerPos: THREE.Vector3,
    checkpoints: THREE.Vector3[],
    wantedSystem: WantedSystem,
    player: Player
  ) {
    const state = this.trackState;
    if (!this.isRacingTrack) {
      this.checkpointMarker.visible = false;
      RacingGame.updatePostRace(delta, state, this.trackRival, false);
      return;
    }

    const dxC = playerPos.x - TRACK_CENTER_X;
    const dzC = playerPos.z - TRACK_CENTER_Z;
    if (player.isDead || player.isRidingVehicle || dxC * dxC + dzC * dzC > 50 * 50) {
      this.abortRace(false, wantedSystem);
      return;
    }

    if (this.updateCountdown(delta, state, playerPos, wantedSystem)) {
      this.checkpointMarker.visible = false;
      this.trackRival.setPose('STAND', delta);
      return;
    }

    this.raceTimer += delta;
    const targetCp = checkpoints[this.raceCheckpointIdx];
    this.checkpointMarker.visible = true;
    this.checkpointMarker.position.copy(targetCp);
    this.checkpointMarker.rotation.y += delta * 2.5;

    RacingGame.advanceRival(delta, state, this.trackRival, this.raceCheckpointIdx, playerPos, wantedSystem);
    this.trackRival.setPose('RUN', delta);

    if (this.trackRival.isFinished) {
      // 對手搶先衝線：比賽落敗，不發放獎勵
      this.isRacingTrack = false;
      this.checkpointMarker.visible = false;
      state.rivalWon = true;
      state.postRaceTimer = RIVAL_POST_RACE_TIME;
      soundManager.playWhistle(state.startPos);
      wantedSystem.showBanner(`😤【對手搶先抵達！】田徑隊阿凱以 ${this.raceTimer.toFixed(1)} 秒率先衝線，再挑戰一次吧！`, 4000);
      return;
    }

    if (playerPos.distanceTo(targetCp) < TRACK_CP_RADIUS) {
      soundManager.playBicycleBell(playerPos);
      this.raceCheckpointIdx++;
      if (this.raceCheckpointIdx >= checkpoints.length) {
        this.isRacingTrack = false;
        this.checkpointMarker.visible = false;
        state.postRaceTimer = RIVAL_POST_RACE_TIME;
        soundManager.playFanfare();
        if (!this.bestTrackTime || this.raceTimer < this.bestTrackTime) {
          this.bestTrackTime = this.raceTimer;
        }
        wantedSystem.showBanner(
          `🏆【擊敗田徑隊阿凱！】完賽成績: ${this.raceTimer.toFixed(1)} 秒！獲得「校園飛毛腿」稱號！耐力上限提升至 195！`,
          5000
        );
        player.maxStamina = Math.max(player.maxStamina, 195);
        player.stamina = player.maxStamina;
      }
    }
  }

  public updateSwim(
    delta: number,
    playerPos: THREE.Vector3,
    checkpoints: THREE.Vector3[],
    wantedSystem: WantedSystem,
    player: Player,
    waterSplashVFX: WaterSplashVFX,
    onRewardCash: (amount: number) => void
  ) {
    const state = this.swimState;
    if (!this.isSwimmingRace) {
      this.swimCheckpointMarker.visible = false;
      RacingGame.updatePostRace(delta, state, this.swimRival, true);
      return;
    }

    if (
      player.isDead || player.isRidingVehicle ||
      playerPos.x < 62.0 || playerPos.x > 88.0 || playerPos.z < -56.0 || playerPos.z > -16.0
    ) {
      this.abortRace(true, wantedSystem);
      return;
    }

    if (this.updateCountdown(delta, state, playerPos, wantedSystem)) {
      this.swimCheckpointMarker.visible = false;
      this.swimRival.setPose('STAND', delta);
      return;
    }

    this.swimRaceTimer += delta;
    const targetSwimCp = checkpoints[this.swimCheckpointIdx];
    this.swimCheckpointMarker.visible = true;
    this.swimCheckpointMarker.position.copy(targetSwimCp);
    this.swimCheckpointMarker.rotation.y += delta * 3.0;

    const wasOnDeck = this.swimRival.mesh.position.z <= POOL_WATER_MIN_Z && this.swimRival.distance < 1.0;
    RacingGame.advanceRival(delta, state, this.swimRival, this.swimCheckpointIdx, playerPos, wantedSystem);
    const inWater = this.swimRival.mesh.position.z > POOL_WATER_MIN_Z || this.swimRival.distance >= 1.0;
    this.swimRival.setPose(inWater ? 'SWIM' : 'RUN', delta);
    if (wasOnDeck && inWater) {
      // 對手躍入水中水花
      soundManager.playWaterSplash(state.startPos);
      waterSplashVFX.triggerSplashBurst(this.swimRival.mesh.position, this.swimRival.mesh.rotation.y, true, 0.25);
    }

    if (this.swimRival.isFinished) {
      this.isSwimmingRace = false;
      this.swimCheckpointMarker.visible = false;
      state.rivalWon = true;
      state.postRaceTimer = RIVAL_POST_RACE_TIME;
      soundManager.playWhistle(state.startPos);
      wantedSystem.showBanner(`😤【對手搶先觸壁！】游泳隊小魚以 ${this.swimRaceTimer.toFixed(1)} 秒率先完賽，再挑戰一次吧！`, 4000);
      return;
    }

    if (playerPos.distanceTo(targetSwimCp) < SWIM_CP_RADIUS) {
      soundManager.playWaterSplash(playerPos);
      waterSplashVFX.triggerSplashBurst(player.position, player.rotationY, true, 0.25);
      this.swimCheckpointIdx++;
      if (this.swimCheckpointIdx >= checkpoints.length) {
        this.isSwimmingRace = false;
        this.swimCheckpointMarker.visible = false;
        state.postRaceTimer = RIVAL_POST_RACE_TIME;
        soundManager.playFanfare();
        if (!this.bestSwimTime || this.swimRaceTimer < this.bestSwimTime) {
          this.bestSwimTime = this.swimRaceTimer;
        }
        onRewardCash(150);
        player.maxStamina = Math.max(player.maxStamina, 225);
        player.stamina = player.maxStamina;
        wantedSystem.showBanner(
          `🏊【擊敗游泳隊小魚！】50m 游泳完賽！成績: ${this.swimRaceTimer.toFixed(1)} 秒！獲得獎金 +$150，精力上限躍升至 225！`,
          5000
        );
      }
    }
  }
}
