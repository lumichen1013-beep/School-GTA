// Procedural Web Audio API sound generator - no external asset dependencies!
export class SoundEffects {
  private ctx: AudioContext | null = null;
  // 共用白噪音緩衝區 (3 秒)：各噪音音效從中擷取隨機片段播放，避免每次觸發重新產生數萬個樣本
  private noiseBuffer: AudioBuffer | null = null;
  private static readonly NOISE_SECONDS = 3.0;

  constructor() {
    this.setupAutoResume();
  }

  // 鎖屏或切換分頁切回時自動喚醒 Web Audio
  private setupAutoResume() {
    const resumeAudio = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resumeAudio();
      }
    });

    window.addEventListener('click', resumeAudio, { passive: true });
    window.addEventListener('touchstart', resumeAudio, { passive: true });
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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

  // 由共用白噪音擷取指定長度片段 (隨機起點，聽感不重複)；回傳節點後由呼叫端連接濾波與音量包絡
  private playNoiseSlice(ctx: AudioContext, at: number, duration: number): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    const maxOffset = Math.max(0, SoundEffects.NOISE_SECONDS - duration);
    source.start(at, Math.random() * maxOffset, duration);
    return source;
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // 經典台灣校園上下課西敏寺鐘聲 (4 聲鐘響)
  public playSchoolBell() {
    this.initCtx();
    if (!this.ctx) return;

    // F#4, D4, E4, A3 經典旋律
    const notes = [370.0, 293.7, 329.6, 220.0];
    const duration = 0.8;
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * duration);

      // Bell chime harmonic
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2.05, now + idx * duration);

      const gain2 = this.ctx.createGain();

      gain.gain.setValueAtTime(0, now + idx * duration);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * duration + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * duration + 0.5);

      gain2.gain.setValueAtTime(0, now + idx * duration);
      gain2.gain.linearRampToValueAtTime(0.08, now + idx * duration + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + (idx + 1) * duration + 0.3);

      osc.connect(gain);
      osc2.connect(gain2);
      gain.connect(this.ctx.destination);
      gain2.connect(this.ctx.destination);

      osc.start(now + idx * duration);
      osc.stop(now + (idx + 1) * duration + 0.6);
      osc2.start(now + idx * duration);
      osc2.stop(now + (idx + 1) * duration + 0.6);
    });
  }

  // 風紀糾察／教官刺耳哨音 (逼逼逼！)
  public playWhistle() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      // 顫音頻率
      osc.frequency.setValueAtTime(2400, now + i * 0.12);
      osc.frequency.exponentialRampToValueAtTime(2600, now + i * 0.12 + 0.08);

      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.02);
      gain.gain.linearRampToValueAtTime(0.01, now + i * 0.12 + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.1);
    }
  }

  // 腳踏車鈴聲 (叮叮！)
  public playBicycleBell() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.1].forEach((delay) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, now + delay);

      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.26);
    });
  }

  // 揮拳 / 擊打聲
  public playPunch() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // 跳躍落地鈍音
  public playJump() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // 通緝警戒升級警笛
  public playAlert() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.25);
    osc.frequency.linearRampToValueAtTime(600, now + 0.5);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.55);
  }

  // 狗吠叫聲 (汪汪！)
  public playDogBark() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [0, 0.16].forEach((delay) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, now + delay);
      osc.frequency.exponentialRampToValueAtTime(180, now + delay + 0.12);

      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    });
  }

  // 重墜高處著地撞擊聲
  public playFallHit() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.28);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // 經典台灣校園學務處全校廣播前奏鐘聲 (叮咚檔鐺！)
  public playBroadcastChime() {
    this.initCtx();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const step = 0.16;
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * step);

      gain.gain.setValueAtTime(0, now + idx * step);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * step + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * step + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * step);
      osc.stop(now + idx * step + 0.6);
    });
  }

  // 籃球空心刷網進球聲 (Swish!)
  public playSwish() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 白色噪音 + 帶通濾波模擬刷網聲
    const noise = this.playNoiseSlice(this.ctx, now, 0.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.22);
    filter.Q.setValueAtTime(3.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
  }

  // 籃球打鐵砸框金屬撞擊聲 (Rim Hit / Clang)
  public playRimHit() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1420, now);
    osc2.frequency.exponentialRampToValueAtTime(710, now + 0.12);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
    osc2.start(now);
    osc2.stop(now + 0.2);
  }

  // 籃球運球落地拍球聲 (Dribble Bounce)
  public playDribble() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.08);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // 挑戰成功小勝利號角 (Victory Fanfare)
  public playFanfare() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const melody = [
      { f: 523.25, d: 0.12 }, // C5
      { f: 659.25, d: 0.12 }, // E5
      { f: 783.99, d: 0.12 }, // G5
      { f: 1046.5, d: 0.35 }  // C6
    ];

    let t = now;
    melody.forEach((note) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.d + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + note.d + 0.18);
      t += note.d;
    });
  }

  // 收銀機開箱金幣聲 (Ka-ching!)
  public playCashRegister() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    [1567.98, 2093.00].forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.36);
    });
  }

  // 吃食物補血咀嚼吞嚥聲 (Munch & Gulp)
  public playEatFood() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260 + i * 40, now + i * 0.09);
      osc.frequency.exponentialRampToValueAtTime(120, now + i * 0.09 + 0.06);

      gain.gain.setValueAtTime(0.18, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.08);
    }
  }

  // 普通棒球棍重擊木擊聲 (Wooden Bat Crack)
  public playBatHit() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.17);
  }

  // 特殊黃金神級棒球棍雷霆轟擊聲 (Golden Bat Thunder Whoosh)
  public playSpecialBatHit() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(180, now);
    osc1.frequency.exponentialRampToValueAtTime(45, now + 0.28);
    gain1.gain.setValueAtTime(0.45, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.33);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now);
    osc2.frequency.exponentialRampToValueAtTime(880, now + 0.25);
    gain2.gain.setValueAtTime(0.25, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.31);
  }

  // 刺客處決/慢動作暴擊重音 (Cinematic Bullet Time Impact Boom & Armor Crunch)
  public playCinematicExecutionHit() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 1. 低頻震顫震撼低音 (Sub-bass boom)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 0.65);
    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.72);

    // 2. 金屬破甲撕裂聲 (Armor break metallic crunch)
    const crunchOsc = this.ctx.createOscillator();
    const crunchGain = this.ctx.createGain();
    crunchOsc.type = 'triangle';
    crunchOsc.frequency.setValueAtTime(540, now);
    crunchOsc.frequency.exponentialRampToValueAtTime(75, now + 0.35);
    crunchGain.gain.setValueAtTime(0.42, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    crunchOsc.connect(crunchGain);
    crunchGain.connect(this.ctx.destination);
    crunchOsc.start(now);
    crunchOsc.stop(now + 0.40);
  }

  // 食人花 Boss 巨顎咬噬聲 (Monster Chomp)
  public playBossBite() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  // 水花拍擊聲 (Water Splash / Swimming)
  public playWaterSplash() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 白色噪波水花衝擊 (原樣本內建的指數衰減併入音量包絡：較快衰減至 0.14 秒)
    const noise = this.playNoiseSlice(this.ctx, now, 0.22);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
  }

  // 中毒咳嗽流血心跳 (Poison Tick / Cough)
  public playPoisonTick() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.16);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  // 強盜劈砍揮刀聲 (Bandit Weapon Slash)
  public playBanditSlash() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.21);
  }

  // 羽球殺球清脆爆裂擊球聲 (Badminton Smash Hit)
  public playBadmintonHit() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  // 羽球拍破空橫掃呼嘯聲 (Badminton Racket Swing)
  public playBadmintonWhoosh() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  // 閃身步 / 狗熊哆嗦毛身法疾風破空聲 (Martial Dodge Wind Whoosh)
  public playDodge(isAdvanced: boolean = false) {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isAdvanced ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isAdvanced ? 950 : 720, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);

    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  // 許願池投幣清脆金幣落水聲 (Coin Toss Into Pond)
  public playCoinToss() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // 1. 金幣叮噹聲
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1980, now);
    osc.frequency.setValueAtTime(2450, now + 0.06);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);

    // 2. 隨後的水花咚聲
    setTimeout(() => {
      this.playWaterSplash();
    }, 120);
  }

  // 生態園昆蟲窸窣嘶鳴聲 (Garden Bug Scurry & Click)
  public playBugChirp() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(3200 + i * 400, now + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(1100, now + i * 0.05 + 0.04);

      gain.gain.setValueAtTime(0.22, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.06);
    }
  }

  // 搶奪腳踏車踹人驚叫與倒地碰撞 (Bike Hijack Shove & Impact)
  public playBikeHijack() {
    this.initCtx();
    if (!this.ctx) return;

    this.playPunch();
    setTimeout(() => {
      this.playBicycleBell();
    }, 150);
  }

  // 演藝大樓直達電梯升降與抵達鐘聲 (Elevator Ding)
  public playElevatorDing() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.12); // D6

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.9);
  }

  // 天氣系統：程序化自然雨聲循環與水氣動態濾波 (White Noise Loop + Biquad Filter)
  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;

  public setRainIntensity(intensity: number, rampTime: number = 2.0, isIndoors: boolean = false) {
    this.initCtx();
    if (!this.ctx) return;

    if (!this.rainSource && this.ctx) {
      // 共用白噪音緩衝區循環播放
      this.rainSource = this.ctx.createBufferSource();
      this.rainSource.buffer = this.getNoiseBuffer(this.ctx);
      this.rainSource.loop = true;

      this.rainFilter = this.ctx.createBiquadFilter();
      this.rainFilter.type = 'lowpass';
      this.rainFilter.frequency.setValueAtTime(isIndoors ? 360 : 900, this.ctx.currentTime);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.rainSource.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.ctx.destination);
      this.rainSource.start(0);
    }

    if (this.rainGain && this.rainFilter) {
      const now = this.ctx.currentTime;
      // 若在室內：雨聲音量衰減至 22%，呈現隔著實體屋頂與牆壁聽雨的沉悶真實音效
      const volMultiplier = isIndoors ? 0.22 : 1.0;
      const targetVol = Math.max(0, Math.min(0.42, intensity * 0.42 * volMultiplier));
      this.rainGain.gain.cancelScheduledValues(now);
      this.rainGain.gain.linearRampToValueAtTime(targetVol, now + rampTime);

      // 雨勢越強，濾波器截止頻率越高；室內則大幅降至 360Hz（低通沉悶聽雨）
      const targetFreq = isIndoors ? 360 : (700 + intensity * 1100);
      this.rainFilter.frequency.cancelScheduledValues(now);
      this.rainFilter.frequency.linearRampToValueAtTime(targetFreq, now + rampTime);
    }
  }

  // 天氣系統：程序化低沉震撼雷鳴滾滾 (Rolling Thunder Synthesis)
  public playThunder() {
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. 低頻超低音轟鳴震盪 (Sub-bass rumble 75Hz -> 28Hz)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 3.2);

    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.55, now + 0.08);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 3.4);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 3.5);

    // 2. 帶通濾波衝擊裂帛雜音 (Crackle & rolling rumble)
    const noiseDuration = 2.8;
    const noiseSource = this.playNoiseSlice(this.ctx, now, noiseDuration);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(280, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(80, now + noiseDuration);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.48, now + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDuration);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
  }
}

export const soundManager = new SoundEffects();
