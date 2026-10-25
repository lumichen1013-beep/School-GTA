// Procedural Dynamic Web Audio BGM Engine for School GTA 3D
// Generates real-time dynamic soundtrack without requiring any external audio files.
// Features seamless transition between "Campus Exploration Groove" and "High-Adrenaline Pursuit Chase".

export type BGMMode = 'EXPLORE' | 'PURSUIT';

export class BGMManager {
  private ctx: AudioContext | null = null;
  private isStarted: boolean = false;
  private isMuted: boolean = false;
  private currentMode: BGMMode = 'EXPLORE';
  private isHighDanger: boolean = false;

  // Master Audio Nodes
  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // Noise Buffer for Drum synthesis (snare & hi-hats)
  private noiseBuffer: AudioBuffer | null = null;

  // Sequencer Timing
  private tempo: number = 108; // BPM
  private timerId: number | null = null;
  private nextStepTime: number = 0;
  private currentStep: number = 0; // 0 to 63 (4 bars of 16 sixteenth-notes)
  private readonly lookaheadMs: number = 25; // How frequently to call scheduler (ms)
  private readonly scheduleAheadSec: number = 0.12; // How far ahead to schedule audio (sec)

  // Status callback for UI updates
  public onModeChange?: (mode: BGMMode, isMuted: boolean) => void;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  // Initialize Web Audio Context & Nodes
  private initContext() {
    if (this.ctx) return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    // 1. Dynamics Compressor for punchy, balanced mix
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    // 2. Master Lowpass Filter for dynamic explore/pursuit sweeps
    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(1600, this.ctx.currentTime); // Relaxed warm tone for explore
    this.masterFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    // 3. Master Gain Node
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.42, this.ctx.currentTime);

    // Node routing: Instruments -> MasterFilter -> Compressor -> MasterGain -> Destination
    this.masterFilter.connect(this.compressor);
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // 4. Generate 2 seconds of pink/white noise buffer for percussion
    this.generateNoiseBuffer();
  }

  private generateNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-ish noise filter for warmer drum sound
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5 + white * 0.1;
    }
    this.noiseBuffer = buffer;
  }

  // Start BGM playback
  public start() {
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.isStarted) return;
    this.isStarted = true;

    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.timerId = window.setInterval(() => this.scheduler(), this.lookaheadMs);

    if (this.onModeChange) {
      this.onModeChange(this.currentMode, this.isMuted);
    }
  }

  // Stop BGM playback
  public stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isStarted = false;
  }

  // Toggle Mute
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const targetGain = this.isMuted ? 0 : 0.42;
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 0.15);
    }
    if (this.onModeChange) {
      this.onModeChange(this.currentMode, this.isMuted);
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getMode(): BGMMode {
    return this.currentMode;
  }

  // Update dynamic mode based on player chase state
  public setPursuitMode(isPursuit: boolean, isHighDanger: boolean = false) {
    const newMode: BGMMode = isPursuit ? 'PURSUIT' : 'EXPLORE';
    this.isHighDanger = isHighDanger;

    if (newMode !== this.currentMode) {
      this.currentMode = newMode;
      if (this.ctx && this.masterFilter) {
        const now = this.ctx.currentTime;
        this.masterFilter.frequency.cancelScheduledValues(now);
        if (newMode === 'PURSUIT') {
          // Open up filter for high-octane energy and brightness
          this.masterFilter.frequency.linearRampToValueAtTime(6500, now + 0.35);
          this.masterFilter.Q.linearRampToValueAtTime(2.2, now + 0.35);
        } else {
          // Lowpass warmth for laid-back campus vibe
          this.masterFilter.frequency.linearRampToValueAtTime(1600, now + 0.6);
          this.masterFilter.Q.linearRampToValueAtTime(1.2, now + 0.6);
        }
      }
      if (this.onModeChange) {
        this.onModeChange(this.currentMode, this.isMuted);
      }
    }
  }

  // Temporary ducking for fainting / blackout in clinic
  public duckVolume(durationSec: number = 3.0) {
    if (!this.masterGain || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.linearRampToValueAtTime(0.08, now + 0.2);
    this.masterGain.gain.setValueAtTime(0.08, now + durationSec - 0.5);
    this.masterGain.gain.linearRampToValueAtTime(0.42, now + durationSec);
  }

  // Precise Web Audio lookahead scheduler
  private scheduler() {
    if (!this.ctx) return;
    const secondsPerBeat = 60.0 / this.tempo;
    const secondsPer16th = secondsPerBeat / 4.0;

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += secondsPer16th;
      this.currentStep = (this.currentStep + 1) % 64; // 4-bar loop (16 * 4 = 64 steps)
    }
  }

  // Schedule musical notes & percussion at a specific 16th-note step
  private scheduleStep(step: number, time: number) {
    if (!this.ctx || !this.masterFilter) return;

    const barStep = step % 16;
    const isPursuit = this.currentMode === 'PURSUIT';

    // ==========================================
    // 1. DRUMS / PERCUSSION SECTION
    // ==========================================
    if (!isPursuit) {
      // --- EXPLORE MODE: Chill Boom-Bap / Lo-Fi Campus Beat ---
      // Kick: steps 0, 6, 8, 10
      if (barStep === 0 || barStep === 6 || barStep === 8 || barStep === 10) {
        const vel = barStep === 0 ? 0.9 : 0.65;
        this.playKick(time, vel);
      }

      // Snare: backbeats 4 and 12
      if (barStep === 4 || barStep === 12) {
        this.playSnare(time, 0.6);
      }

      // Hi-hat: Laid-back 8th notes (0, 2, 4, 6, 8, 10, 12, 14)
      if (barStep % 2 === 0) {
        const vel = barStep % 4 === 0 ? 0.35 : 0.22;
        this.playHiHat(time, false, vel);
      }
    } else {
      // --- PURSUIT MODE: High-Octane 16th-Note Driving Beat ---
      // Kick: Four-on-the-floor (0, 4, 8, 12) + syncopated doubles (10, 14)
      if (barStep === 0 || barStep === 4 || barStep === 8 || barStep === 12 || barStep === 10 || barStep === 14) {
        const vel = (barStep % 4 === 0) ? 1.0 : 0.75;
        this.playKick(time, vel, true);
      }

      // Snare: Crisp punch on 4, 12, plus ghost roll on 15
      if (barStep === 4 || barStep === 12) {
        this.playSnare(time, 0.85);
      } else if (barStep === 15) {
        this.playSnare(time, 0.38);
      }

      // Hi-Hat: Driving 16th notes on EVERY step + open sizzle on offbeats 2, 6, 10, 14
      if (barStep === 2 || barStep === 6 || barStep === 10 || barStep === 14) {
        this.playHiHat(time, true, 0.45); // Open hi-hat
      } else {
        const vel = (barStep % 2 === 0) ? 0.4 : 0.28;
        this.playHiHat(time, false, vel);
      }

      // High danger extra 32nd roll feel on step 14
      if (this.isHighDanger && (barStep === 14)) {
        this.playHiHat(time + (60.0 / this.tempo / 8), false, 0.3);
      }
    }

    // ==========================================
    // 2. BASSLINE SECTION
    // ==========================================
    if (!isPursuit) {
      // --- EXPLORE MODE: Funky Walking Syncopated Bass ---
      // Chord progression: Dm9 (bar 0) -> Bbmaj7 (bar 1) -> C9 (bar 2) -> A7alt (bar 3)
      const barIdx = Math.floor(step / 16);
      let bassFreq: number | null = null;
      let duration = 0.22;

      if (barIdx === 0) { // D minor
        if (barStep === 0) bassFreq = 73.42;       // D2
        else if (barStep === 3) bassFreq = 73.42;  // D2
        else if (barStep === 6) bassFreq = 87.31;  // F2
        else if (barStep === 8) bassFreq = 98.00;  // G2
        else if (barStep === 10) bassFreq = 110.0; // A2
        else if (barStep === 14) bassFreq = 130.81;// C3
      } else if (barIdx === 1) { // Bb major
        if (barStep === 0) bassFreq = 58.27;       // Bb1
        else if (barStep === 3) bassFreq = 58.27;  // Bb1
        else if (barStep === 6) bassFreq = 73.42;  // D2
        else if (barStep === 8) bassFreq = 87.31;  // F2
        else if (barStep === 10) bassFreq = 98.00; // G2
        else if (barStep === 14) bassFreq = 110.0; // A2
      } else if (barIdx === 2) { // C major
        if (barStep === 0) bassFreq = 65.41;       // C2
        else if (barStep === 3) bassFreq = 65.41;  // C2
        else if (barStep === 6) bassFreq = 82.41;  // E2
        else if (barStep === 8) bassFreq = 98.00;  // G2
        else if (barStep === 10) bassFreq = 110.0; // A2
        else if (barStep === 14) bassFreq = 116.54;// Bb2
      } else { // A7
        if (barStep === 0) bassFreq = 55.00;       // A1
        else if (barStep === 3) bassFreq = 69.30;  // C#2
        else if (barStep === 6) bassFreq = 82.41;  // E2
        else if (barStep === 8) bassFreq = 98.00;  // G2
        else if (barStep === 10) bassFreq = 110.0; // A2
        else if (barStep === 14) bassFreq = 65.41; // C2 (passing)
      }

      if (bassFreq !== null) {
        this.playExploreBass(time, bassFreq, duration);
      }
    } else {
      // --- PURSUIT MODE: Pumping 16th-Note Synthwave Bass ---
      const barIdx = Math.floor(step / 16);
      const rootD = 73.42;   // D2
      const rootBb = 58.27;  // Bb1
      const rootC = 65.41;   // C2
      const rootA = 55.00;   // A1

      let root = rootD;
      if (barIdx === 1) root = rootBb;
      else if (barIdx === 2) root = rootC;
      else if (barIdx === 3) root = rootA;

      // Octave bounce between root and root*2
      const isOctaveUp = (barStep % 2 === 1);
      const freq = isOctaveUp ? root * 2 : root;
      const duration = 0.11;
      this.playPursuitBass(time, freq, duration, isOctaveUp);
    }

    // ==========================================
    // 3. CHORDS & MELODIC SYNTH SECTION
    // ==========================================
    if (!isPursuit) {
      // --- EXPLORE MODE: Warm Rhodes-Style Comping Chords ---
      // Play lush chords on offbeats 4 and 10
      if (barStep === 4 || barStep === 10) {
        const barIdx = Math.floor(step / 16);
        let chordNotes: number[] = [];
        if (barIdx === 0) {
          // Dm9: F4(349.23), A4(440.0), C5(523.25), E5(659.25)
          chordNotes = [349.23, 440.00, 523.25, 659.25];
        } else if (barIdx === 1) {
          // Bbmaj7: F4(349.23), A4(440.0), Bb4(466.16), D5(587.33)
          chordNotes = [349.23, 440.00, 466.16, 587.33];
        } else if (barIdx === 2) {
          // C9: E4(329.63), G4(392.0), Bb4(466.16), D5(587.33)
          chordNotes = [329.63, 392.00, 466.16, 587.33];
        } else {
          // A7b9: E4(329.63), G4(392.0), Bb4(466.16), C#5(554.37)
          chordNotes = [329.63, 392.00, 466.16, 554.37];
        }
        this.playRhodesChord(time, chordNotes, 0.45);
      }

      // Occasional gentle campus bell lead arpeggio
      if (barStep === 8 || barStep === 12 || barStep === 14) {
        const barIdx = Math.floor(step / 16);
        let leadNote: number | null = null;
        if (barIdx === 0 && barStep === 8) leadNote = 659.25; // E5
        if (barIdx === 0 && barStep === 12) leadNote = 587.33; // D5
        if (barIdx === 1 && barStep === 8) leadNote = 880.00; // A5
        if (barIdx === 2 && barStep === 8) leadNote = 783.99; // G5
        if (barIdx === 3 && barStep === 8) leadNote = 659.25; // E5
        if (barIdx === 3 && barStep === 12) leadNote = 554.37; // C#5
        if (leadNote) {
          this.playMelodicLead(time, leadNote, 0.35);
        }
      }
    } else {
      // --- PURSUIT MODE: Cinematic Siren & Urgency Stabs ---
      // Urgent tension motif on beats 0, 4, 8, 12
      const barIdx = Math.floor(step / 16);
      if (barStep === 0 || barStep === 6 || barStep === 8 || barStep === 12) {
        let stabFreq = 587.33; // D5
        if (barIdx === 0) {
          stabFreq = (barStep === 0 || barStep === 6) ? 698.46 : 659.25; // F5 -> E5 tension
        } else if (barIdx === 1) {
          stabFreq = (barStep === 0 || barStep === 6) ? 587.33 : 622.25; // D5 -> Eb5
        } else if (barIdx === 2) {
          stabFreq = (barStep === 0 || barStep === 6) ? 698.46 : 659.25; // F5 -> E5
        } else {
          stabFreq = (barStep === 0 || barStep === 6) ? 880.00 : 830.61; // A5 -> Ab5 alarm
        }
        this.playTensionStab(time, stabFreq, 0.22);
      }
    }
  }

  // ====================================================================
  // PROCEDURAL INSTRUMENT SYNTHESIZERS
  // ====================================================================

  // 1. Synth Kick Drum (Punchy sine pitch sweep)
  private playKick(time: number, velocity: number = 1.0, isAggressive: boolean = false) {
    if (!this.ctx || !this.masterFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const startFreq = isAggressive ? 165 : 135;
    const endFreq = 38;
    const duration = isAggressive ? 0.16 : 0.12;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

    gain.gain.setValueAtTime(0.75 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.masterFilter);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // 2. Snare Drum (Bandpass filtered noise burst + body resonance)
  private playSnare(time: number, velocity: number = 0.7) {
    if (!this.ctx || !this.masterFilter || !this.noiseBuffer) return;

    // Noise component
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(2200, time);
    noiseFilter.Q.setValueAtTime(1.8, time);

    const noiseGain = this.ctx.createGain();
    const duration = 0.13;
    noiseGain.gain.setValueAtTime(0.6 * velocity, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterFilter);

    noiseSource.start(time);
    noiseSource.stop(time + duration);

    // Tonal body tone (180 Hz triangle)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(185, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(75, time + 0.08);

    bodyGain.gain.setValueAtTime(0.45 * velocity, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.masterFilter);

    bodyOsc.start(time);
    bodyOsc.stop(time + 0.085);
  }

  // 3. Hi-Hat (High-pass filtered noise)
  private playHiHat(time: number, isOpen: boolean = false, velocity: number = 0.3) {
    if (!this.ctx || !this.masterFilter || !this.noiseBuffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    const duration = isOpen ? 0.15 : 0.04;

    gain.gain.setValueAtTime(0.5 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterFilter);

    source.start(time);
    source.stop(time + duration);
  }

  // 4. Explore Bass (Warm, funky, lowpassed triangle + sine)
  private playExploreBass(time: number, freq: number, duration: number = 0.2) {
    if (!this.ctx || !this.masterFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, time);
    filter.frequency.exponentialRampToValueAtTime(120, time + duration);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.48, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterFilter);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // 5. Pursuit Bass (Punchy saw/pulse bass with resonance sweep)
  private playPursuitBass(time: number, freq: number, duration: number = 0.1, isOctaveUp: boolean = false) {
    if (!this.ctx || !this.masterFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    const cutoff = isOctaveUp ? 1800 : 900;
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + duration);
    filter.Q.setValueAtTime(3.5, time);

    const amp = isOctaveUp ? 0.38 : 0.52;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterFilter);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // 6. Rhodes Comping Chords (Lush polyphonic EP chords)
  private playRhodesChord(time: number, notes: number[], duration: number = 0.45) {
    if (!this.ctx || !this.masterFilter) return;

    notes.forEach((freq) => {
      if (!this.ctx || !this.masterFilter) return;
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      // Gentle bell harmonic
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2.005, time);

      const chordGain = 0.16 / notes.length;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(chordGain, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterFilter);

      osc.start(time);
      osc2.start(time);
      osc.stop(time + duration + 0.02);
      osc2.stop(time + duration + 0.02);
    });
  }

  // 7. Campus Bell Lead (High melodic bell pluck)
  private playMelodicLead(time: number, freq: number, duration: number = 0.3) {
    if (!this.ctx || !this.masterFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.12, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.masterFilter);

    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  // 8. Pursuit Tension Siren / Alert Stab
  private playTensionStab(time: number, freq: number, duration: number = 0.22) {
    if (!this.ctx || !this.masterFilter) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    // Subtle downward pitch dive for aggressive punch
    osc.frequency.exponentialRampToValueAtTime(freq * 0.92, time + duration);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, time);
    filter.Q.setValueAtTime(2.0, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterFilter);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }
}

// Singleton Export
export const bgmManager = new BGMManager();
