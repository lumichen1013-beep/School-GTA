// Procedural Web Audio API sound generator - no external asset dependencies!
import { getAudioContext, resumeAudioContext } from './audioContext';
import {
  SOUND_COOLDOWN, SOUND_VOLUME, cooldownReady, distanceBetween, soundGain,
  type SpatialSoundId, type Vec3Like
} from './spatialAudio';

// 參數包絡排程點：[排程方式, 目標值, 絕對時間]
type EnvPoint = ['set' | 'lin' | 'exp', number, number];

interface NoiseFilterSpec {
  type: BiquadFilterType;
  freq: EnvPoint[];
  q?: number;
}

export class SoundEffects {
  // 共用白噪音緩衝區 (3 秒)：各噪音音效從中擷取隨機片段播放，避免每次觸發重新產生數萬個樣本
  private noiseBuffer: AudioBuffer | null = null;
  private static readonly NOISE_SECONDS = 3.0;

  // 聆聽者 (玩家) 位置參考：持續讀取最新座標；未設定時不衰減 (僅套用固定音量倍率)
  private listener: Vec3Like | null = null;
  // 本次播放的距離音量倍率 (gate 設定，同步播放結束後於 microtask 還原)
  private volScale = 1;
  private lastPlayed: Partial<Record<SpatialSoundId, number>> = {};

  public resume() {
    resumeAudioContext();
  }

  public setListener(pos: Vec3Like) {
    this.listener = pos;
  }

  // 空間音效閘門：超出可聞距離或冷卻中回傳 false (不建立任何 audio node)；
  // 通過時依距離設定音量倍率。距離超出者不消耗冷卻，避免遠處 NPC 壓掉近處音效。
  private gate(id: SpatialSoundId, pos: Vec3Like): boolean {
    let scale = SOUND_VOLUME[id] ?? 1;
    if (this.listener) {
      scale = soundGain(id, distanceBetween(pos, this.listener));
      if (scale <= 0) return false;
    }
    const cooldown = SOUND_COOLDOWN[id];
    if (cooldown) {
      const now = performance.now() / 1000;
      if (!cooldownReady(this.lastPlayed[id] ?? -Infinity, now, cooldown)) return false;
      this.lastPlayed[id] = now;
    }
    this.volScale = scale;
    if (scale !== 1) queueMicrotask(() => { this.volScale = 1; });
    return true;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      const size = Math.floor(ctx.sampleRate * SoundEffects.NOISE_SECONDS);
      this.noiseBuffer = ctx.createBuffer(1, size, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < size; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.noiseBuffer;
  }

  // 取得共用 AudioContext (首次觸發時建立，暫停中則喚醒)
  private audio(): AudioContext {
    return getAudioContext();
  }

  // 依排程點設定 AudioParam 包絡
  private applyEnv(param: AudioParam, points: EnvPoint[]) {
    for (const [kind, value, time] of points) {
      if (kind === 'set') param.setValueAtTime(value, time);
      else if (kind === 'lin') param.linearRampToValueAtTime(value, time);
      else param.exponentialRampToValueAtTime(value, time);
    }
  }

  // 建立帶音量包絡的增益節點並接至輸出
  private envGain(points: EnvPoint[]): GainNode {
    const ctx = this.audio();
    const gain = ctx.createGain();
    const scale = this.volScale;
    this.applyEnv(gain.gain, scale === 1 ? points : points.map(([k, v, t]): EnvPoint => [k, v * scale, t]));
    gain.connect(ctx.destination);
    return gain;
  }

  // 振盪器：指定波形與頻率包絡，於 start ~ stop 間發聲並接至目標節點
  private osc(type: OscillatorType, freq: EnvPoint[], start: number, stop: number, target: AudioNode) {
    const osc = this.audio().createOscillator();
    osc.type = type;
    this.applyEnv(osc.frequency, freq);
    osc.connect(target);
    osc.start(start);
    osc.stop(stop);
  }

  // 單音：振盪器 → 音量包絡 → 輸出
  private tone(type: OscillatorType, freq: EnvPoint[], gain: EnvPoint[], start: number, stop: number) {
    this.osc(type, freq, start, stop, this.envGain(gain));
  }

  // 噪音：共用白噪音隨機片段 → 濾波 → 音量包絡 → 輸出
  private noise(at: number, duration: number, filter: NoiseFilterSpec, gain: EnvPoint[]) {
    const ctx = this.audio();
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    const maxOffset = Math.max(0, SoundEffects.NOISE_SECONDS - duration);
    source.start(at, Math.random() * maxOffset, duration);

    const biquad = ctx.createBiquadFilter();
    biquad.type = filter.type;
    this.applyEnv(biquad.frequency, filter.freq);
    if (filter.q !== undefined) biquad.Q.setValueAtTime(filter.q, at);

    source.connect(biquad);
    biquad.connect(this.envGain(gain));
  }

  // 經典台灣校園上下課西敏寺鐘聲 (4 聲鐘響)
  public playSchoolBell(pos: Vec3Like) {
    if (!this.gate('schoolBell', pos)) return;
    const now = this.audio().currentTime;
    // F#4, D4, E4, A3 經典旋律
    const notes = [370.0, 293.7, 329.6, 220.0];
    const duration = 0.8;

    notes.forEach((freq, idx) => {
      const t0 = now + idx * duration;
      const end = now + (idx + 1) * duration;
      this.tone('sine', [['set', freq, t0]],
        [['set', 0, t0], ['lin', 0.25, now + idx * duration + 0.04], ['exp', 0.001, end + 0.5]], t0, end + 0.6);
      // Bell chime harmonic
      this.tone('triangle', [['set', freq * 2.05, t0]],
        [['set', 0, t0], ['lin', 0.08, now + idx * duration + 0.03], ['exp', 0.001, end + 0.3]], t0, end + 0.6);
    });
  }

  // 低通濾波音：振盪器 → 低通 → 音量包絡 → 輸出 (削掉刺耳高頻)
  private softTone(type: OscillatorType, freq: EnvPoint[], gain: EnvPoint[], start: number, stop: number, cutoff: number) {
    const lp = this.audio().createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.connect(this.envGain(gain));
    this.osc(type, freq, start, stop, lp);
  }

  // 風紀糾察／教官哨音 (嗶嗶)：兩短聲，三角波 1.35k→1.45k + 低通 2.6k，淡入淡出避免喀聲
  public playWhistle(pos: Vec3Like) {
    if (!this.gate('whistle', pos)) return;
    const now = this.audio().currentTime;
    for (let i = 0; i < 2; i++) {
      const t0 = now + i * 0.18;
      this.softTone('triangle', [['set', 1350, t0], ['lin', 1450, t0 + 0.14]],
        [['set', 0.0001, t0], ['lin', 0.09, t0 + 0.025], ['lin', 0.0001, t0 + 0.14]], t0, t0 + 0.15, 2600);
    }
  }

  // 腳踏車鈴聲 (叮叮)：1.05k 基音 + 非整數倍泛音 (x2.76) 金屬感，低通 3.2k，衰減 0.35 秒
  public playBicycleBell(pos: Vec3Like) {
    if (!this.gate('bell', pos)) return;
    const now = this.audio().currentTime;
    for (const delay of [0, 0.14]) {
      const t0 = now + delay;
      this.softTone('sine', [['set', 1050, t0]],
        [['set', 0.0001, t0], ['lin', 0.11, t0 + 0.012], ['exp', 0.0001, t0 + 0.35]], t0, t0 + 0.36, 3200);
      this.softTone('sine', [['set', 2900, t0]],
        [['set', 0.0001, t0], ['lin', 0.03, t0 + 0.01], ['exp', 0.0001, t0 + 0.2]], t0, t0 + 0.21, 3200);
    }
  }

  // 揮拳 / 擊打聲
  public playPunch(pos: Vec3Like) {
    if (!this.gate('punch', pos)) return;
    const now = this.audio().currentTime;
    this.tone('square', [['set', 160, now], ['exp', 40, now + 0.12]], [['set', 0.25, now], ['exp', 0.001, now + 0.15]], now, now + 0.15);
  }

  // 跳躍落地鈍音
  public playJump(pos: Vec3Like) {
    if (!this.gate('jump', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sine', [['set', 200, now], ['exp', 80, now + 0.08]], [['set', 0.15, now], ['exp', 0.001, now + 0.1]], now, now + 0.1);
  }

  // 通緝警戒升級警笛 [純 HUD 回饋，不套用距離]
  public playAlert() {
    const now = this.audio().currentTime;
    this.softTone('sawtooth', [['set', 600, now], ['lin', 900, now + 0.25], ['lin', 600, now + 0.5]],
      [['set', 0.0001, now], ['lin', 0.11, now + 0.03], ['lin', 0.01, now + 0.5], ['lin', 0.0001, now + 0.55]], now, now + 0.56, 2800);
  }

  // 狗吠叫聲 (汪汪！)
  public playDogBark(pos: Vec3Like) {
    if (!this.gate('dogBark', pos)) return;
    const now = this.audio().currentTime;
    for (const delay of [0, 0.16]) {
      this.tone('sawtooth', [['set', 450, now + delay], ['exp', 180, now + delay + 0.12]],
        [['set', 0, now + delay], ['lin', 0.3, now + delay + 0.02], ['exp', 0.001, now + delay + 0.14]], now + delay, now + delay + 0.15);
    }
  }

  // 重墜高處著地撞擊聲
  public playFallHit(pos: Vec3Like) {
    if (!this.gate('fallHit', pos)) return;
    const now = this.audio().currentTime;
    this.tone('triangle', [['set', 120, now], ['exp', 25, now + 0.28]], [['set', 0.4, now], ['exp', 0.001, now + 0.3]], now, now + 0.3);
  }

  // 經典台灣校園學務處全校廣播前奏鐘聲 (叮咚檔鐺！)
  public playBroadcastChime(pos: Vec3Like) {
    if (!this.gate('broadcast', pos)) return;
    this.chimeNotes();
  }

  // 通緝解除提示音 [純 HUD 回饋，不套用距離]
  public playWantedClearChime() {
    this.chimeNotes();
  }

  private chimeNotes() {
    const now = this.audio().currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const step = 0.16;
    notes.forEach((freq, idx) => {
      const t0 = now + idx * step;
      this.tone('sine', [['set', freq, t0]],
        [['set', 0, t0], ['lin', 0.25, now + idx * step + 0.02], ['exp', 0.001, now + idx * step + 0.55]], t0, now + idx * step + 0.6);
    });
  }

  // 籃球空心刷網進球聲 (Swish!)：白色噪音 + 帶通濾波模擬刷網聲
  public playSwish(pos: Vec3Like) {
    if (!this.gate('swish', pos)) return;
    const now = this.audio().currentTime;
    this.noise(now, 0.25,
      { type: 'bandpass', freq: [['set', 1800, now], ['exp', 900, now + 0.22]], q: 3.0 },
      [['set', 0.35, now], ['exp', 0.001, now + 0.24]]);
  }

  // 籃球打鐵砸框金屬撞擊聲 (Rim Hit / Clang)：兩個振盪器共用同一音量包絡
  public playRimHit(pos: Vec3Like) {
    if (!this.gate('rimHit', pos)) return;
    const now = this.audio().currentTime;
    const gain = this.envGain([['set', 0.26, now], ['exp', 0.001, now + 0.18]]);
    this.osc('sine', [['set', 880, now], ['exp', 440, now + 0.15]], now, now + 0.2, gain);
    this.osc('triangle', [['set', 1420, now], ['exp', 710, now + 0.12]], now, now + 0.2, gain);
  }

  // 籃球運球落地拍球聲 (Dribble Bounce)
  public playDribble(pos: Vec3Like) {
    if (!this.gate('dribble', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sine', [['set', 125, now], ['exp', 42, now + 0.08]], [['set', 0.28, now], ['exp', 0.001, now + 0.09]], now, now + 0.1);
  }

  // 挑戰成功小勝利號角 (Victory Fanfare) [純 HUD 回饋，不套用距離]
  public playFanfare() {
    const now = this.audio().currentTime;
    const melody = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.5, d: 0.35 }  // C6
    ];

    let t = now;
    for (const note of melody) {
      this.tone('triangle', [['set', note.f, t]], [['set', 0.25, t], ['exp', 0.001, t + note.d + 0.15]], t, t + note.d + 0.18);
      t += note.d;
    }
  }

  // 收銀機開箱金幣聲 (Ka-ching!) [購買／獎勵 HUD 回饋，不套用距離]
  public playCashRegister() {
    const now = this.audio().currentTime;
    [1567.98, 2093.00].forEach((freq, idx) => {
      const t0 = now + idx * 0.08;
      this.tone('sine', [['set', freq, t0]],
        [['set', 0, t0], ['lin', 0.22, now + idx * 0.08 + 0.02], ['exp', 0.001, now + idx * 0.08 + 0.35]], t0, now + idx * 0.08 + 0.36);
    });
  }

  // 吃食物補血咀嚼吞嚥聲 (Munch & Gulp)
  public playEatFood(pos: Vec3Like) {
    if (!this.gate('eatFood', pos)) return;
    const now = this.audio().currentTime;
    for (let i = 0; i < 3; i++) {
      const t0 = now + i * 0.09;
      this.tone('triangle', [['set', 260 + i * 40, t0], ['exp', 120, now + i * 0.09 + 0.06]],
        [['set', 0.18, t0], ['exp', 0.001, now + i * 0.09 + 0.07]], t0, now + i * 0.09 + 0.08);
    }
  }

  // 普通棒球棍重擊木擊聲 (Wooden Bat Crack)
  public playBatHit(pos: Vec3Like) {
    if (!this.gate('batHit', pos)) return;
    const now = this.audio().currentTime;
    this.tone('triangle', [['set', 520, now], ['exp', 140, now + 0.12]], [['set', 0.42, now], ['exp', 0.001, now + 0.16]], now, now + 0.17);
  }

  // 特殊黃金神級棒球棍雷霆轟擊聲 (Golden Bat Thunder Whoosh)
  public playSpecialBatHit(pos: Vec3Like) {
    if (!this.gate('batHit', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sawtooth', [['set', 180, now], ['exp', 45, now + 0.28]], [['set', 0.34, now], ['exp', 0.001, now + 0.32]], now, now + 0.33);
    this.tone('sine', [['set', 1318.5, now], ['exp', 880, now + 0.25]], [['set', 0.18, now], ['exp', 0.001, now + 0.30]], now, now + 0.31);
  }

  // 刺客處決/慢動作暴擊重音 (Cinematic Bullet Time Impact Boom & Metallic Crunch)
  public playCinematicExecutionHit(pos: Vec3Like) {
    if (!this.gate('execution', pos)) return;
    const now = this.audio().currentTime;
    // 1. 低頻震顫震撼低音 (Sub-bass boom)
    this.tone('sine', [['set', 130, now], ['exp', 28, now + 0.65]], [['set', 0.42, now], ['exp', 0.001, now + 0.70]], now, now + 0.72);
    // 2. 金屬撞擊撕裂聲 (Metallic impact crunch)
    this.tone('triangle', [['set', 540, now], ['exp', 75, now + 0.35]], [['set', 0.28, now], ['exp', 0.001, now + 0.38]], now, now + 0.40);
  }

  // 食人花 Boss 巨顎咬噬聲 (Monster Chomp)
  public playBossBite(pos: Vec3Like) {
    if (!this.gate('bossBite', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sawtooth', [['set', 110, now], ['exp', 35, now + 0.22]], [['set', 0.38, now], ['exp', 0.001, now + 0.25]], now, now + 0.26);
  }

  // 水花拍擊聲 (Water Splash / Swimming)：白色噪波水花衝擊，較快衰減至 0.14 秒
  public playWaterSplash(pos: Vec3Like) {
    if (!this.gate('splash', pos)) return;
    const now = this.audio().currentTime;
    this.noise(now, 0.22,
      { type: 'lowpass', freq: [['set', 800, now], ['exp', 180, now + 0.2]] },
      [['set', 0.35, now], ['exp', 0.001, now + 0.14]]);
  }

  // 中毒咳嗽流血心跳 (Poison Tick / Cough)
  public playPoisonTick(pos: Vec3Like) {
    if (!this.gate('poisonTick', pos)) return;
    const now = this.audio().currentTime;
    this.tone('triangle', [['set', 95, now], ['exp', 40, now + 0.16]], [['set', 0.3, now], ['exp', 0.001, now + 0.18]], now, now + 0.19);
  }

  // 強盜劈砍揮刀聲 (Bandit Weapon Slash)
  public playBanditSlash(pos: Vec3Like) {
    if (!this.gate('slash', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sawtooth', [['set', 480, now], ['exp', 120, now + 0.18]], [['set', 0.32, now], ['exp', 0.001, now + 0.2]], now, now + 0.21);
  }

  // 羽球殺球清脆爆裂擊球聲 (Badminton Smash Hit)
  public playBadmintonHit(pos: Vec3Like) {
    if (!this.gate('badminton', pos)) return;
    const now = this.audio().currentTime;
    this.tone('triangle', [['set', 1400, now], ['exp', 320, now + 0.08]], [['set', 0.45, now], ['exp', 0.001, now + 0.1]], now, now + 0.11);
  }

  // 羽球拍破空橫掃呼嘯聲 (Badminton Racket Swing)
  public playBadmintonWhoosh(pos: Vec3Like) {
    if (!this.gate('badminton', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sine', [['set', 650, now], ['exp', 160, now + 0.16]], [['set', 0.35, now], ['exp', 0.001, now + 0.18]], now, now + 0.19);
  }

  // 閃身步 / 狗熊哆嗦毛身法疾風破空聲 (Martial Dodge Wind Whoosh)；isPractice：閃身步老師演武，音量與可聞距離較小
  public playDodge(isAdvanced: boolean, pos: Vec3Like, isPractice: boolean = false) {
    if (!this.gate(isPractice ? 'dodgePractice' : 'dodge', pos)) return;
    const now = this.audio().currentTime;
    this.tone(isAdvanced ? 'triangle' : 'sine', [['set', isAdvanced ? 950 : 720, now], ['exp', 140, now + 0.22]],
      [['set', 0.42, now], ['exp', 0.001, now + 0.25]], now, now + 0.26);
  }

  // 許願池投幣清脆金幣落水聲 (Coin Toss Into Pond)
  public playCoinToss(pos: Vec3Like) {
    if (!this.gate('coinToss', pos)) return;
    const now = this.audio().currentTime;
    // 1. 金幣叮噹聲
    this.tone('sine', [['set', 1980, now], ['set', 2450, now + 0.06]],
      [['set', 0, now], ['lin', 0.3, now + 0.02], ['exp', 0.001, now + 0.28]], now, now + 0.3);
    // 2. 隨後的水花咚聲
    setTimeout(() => {
      this.playWaterSplash(pos);
    }, 120);
  }

  // 生態園昆蟲窸窣嘶鳴聲 (Garden Bug Scurry & Click)
  public playBugChirp(pos: Vec3Like) {
    if (!this.gate('bugChirp', pos)) return;
    const now = this.audio().currentTime;
    for (let i = 0; i < 2; i++) {
      const t0 = now + i * 0.05;
      this.softTone('sawtooth', [['set', 2200 + i * 300, t0], ['exp', 900, t0 + 0.04]],
        [['set', 0.0001, t0], ['lin', 0.15, t0 + 0.004], ['exp', 0.0001, t0 + 0.05]], t0, t0 + 0.06, 2800);
    }
  }

  // 搶奪腳踏車踹人驚叫與倒地碰撞 (Bike Hijack Shove & Impact)
  public playBikeHijack(pos: Vec3Like) {
    this.playPunch(pos);
    setTimeout(() => {
      this.playBicycleBell(pos);
    }, 150);
  }

  // 演藝大樓直達電梯升降與抵達鐘聲 (Elevator Ding)
  public playElevatorDing(pos: Vec3Like) {
    if (!this.gate('elevator', pos)) return;
    const now = this.audio().currentTime;
    this.tone('sine', [['set', 880, now], ['set', 1174.66, now + 0.12]], // A5 → D6
      [['set', 0, now], ['lin', 0.28, now + 0.02], ['exp', 0.001, now + 0.85]], now, now + 0.9);
  }

  // 天氣系統：程序化自然雨聲循環與水氣動態濾波 (White Noise Loop + Biquad Filter)
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  // 上次排程的雨聲目標值：目標未變 (每幀呼叫) 時不重排 AudioParam
  private rainTargetVol = -1;
  private rainTargetFreq = -1;

  public setRainIntensity(intensity: number, rampTime: number = 2.0, isIndoors: boolean = false) {
    const ctx = this.audio();

    if (!this.rainSource) {
      // 共用白噪音緩衝區循環播放
      this.rainSource = ctx.createBufferSource();
      this.rainSource.buffer = this.getNoiseBuffer(ctx);
      this.rainSource.loop = true;

      this.rainFilter = ctx.createBiquadFilter();
      this.rainFilter.type = 'lowpass';
      this.rainFilter.frequency.setValueAtTime(isIndoors ? 360 : 900, ctx.currentTime);

      this.rainGain = ctx.createGain();
      this.rainGain.gain.setValueAtTime(0, ctx.currentTime);

      this.rainSource.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(ctx.destination);
      this.rainSource.start(0);
    }

    if (this.rainGain && this.rainFilter) {
      const now = ctx.currentTime;
      // 若在室內：雨聲音量衰減至 22%，呈現隔著實體屋頂與牆壁聽雨的沉悶真實音效
      const volMultiplier = isIndoors ? 0.22 : 1.0;
      const targetVol = Math.max(0, Math.min(0.42, intensity * 0.42 * volMultiplier));
      // 雨勢越強，濾波器截止頻率越高；室內則大幅降至 360Hz（低通沉悶聽雨）
      const targetFreq = isIndoors ? 360 : (700 + intensity * 1100);
      if (Math.abs(targetVol - this.rainTargetVol) < 0.003 && Math.abs(targetFreq - this.rainTargetFreq) < 8) return;
      this.rainTargetVol = targetVol;
      this.rainTargetFreq = targetFreq;

      // 先以目前值錨定起點再漸變，避免漸變起點落在過去的事件導致音量瞬間跳變
      const gain = this.rainGain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(targetVol, now + rampTime);
      const freq = this.rainFilter.frequency;
      freq.cancelScheduledValues(now);
      freq.setValueAtTime(freq.value, now);
      freq.linearRampToValueAtTime(targetFreq, now + rampTime);
    }
  }

  // 天氣系統：程序化低沉震撼雷鳴滾滾 (Rolling Thunder Synthesis)
  public playThunder(pos: Vec3Like) {
    if (!this.gate('thunder', pos)) return;
    const now = this.audio().currentTime;
    // 1. 低頻超低音轟鳴震盪 (Sub-bass rumble 75Hz -> 28Hz)
    this.tone('sine', [['set', 75, now], ['exp', 28, now + 3.2]],
      [['set', 0, now], ['lin', 0.55, now + 0.08], ['exp', 0.001, now + 3.4]], now, now + 3.5);
    // 2. 帶通濾波衝擊裂帛雜音 (Crackle & rolling rumble)
    const noiseDuration = 2.8;
    this.noise(now, noiseDuration,
      { type: 'lowpass', freq: [['set', 280, now], ['exp', 80, now + noiseDuration]] },
      [['set', 0, now], ['lin', 0.48, now + 0.05], ['exp', 0.001, now + noiseDuration]]);
  }
}

export const soundManager = new SoundEffects();
