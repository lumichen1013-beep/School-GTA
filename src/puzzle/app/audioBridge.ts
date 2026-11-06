// 外殼 ↔ 音訊 (audio-design 7)：畫面 → 配樂 / 情境；每幀把關卡狀態交給 LevelObserver；世界事件、過場事件、按鈕點擊 → 音效；聲音設定頁
import type { GameEvent } from '../core/types';
import { doneFlags, isDialChapter } from '../core/chapter';
import { TURN_BLOCK_MSG, TRANSFER_BLOCK_MSG } from '../mechanics/cube';
import { DIAL_BLOCK_MSG, TURN_MODE_DENY_MSG } from '../mechanics/dial';
import { levelById, protoLevelById } from '../content/levels';
import { cubeChapterOf } from '../content/cubes';
import type { Settings } from '../meta/settings';
import type { Text } from '../text/text';
import { showSoundSettings, type SoundSettingsModel } from '../ui/screens/sound';
import { LevelObserver, WebAudioManager, ch5Stage, levelIntensity, worldEventActions, type LevelSnap } from '../audio';
import type { CutsceneEvent } from './cutscene';
import type { LevelSession } from './levelSession';

/** 「轉不動 / 不能進轉動模式 / 推不過去」的訊息 key → 低沉的「咚」 */
// v0.4 第四章：鎖扣的專屬說明 (下圈年輪被樹根結住了。) 同「這一排鎖著。」的拒絕音
const DENY_KEYS: ReadonlySet<string> = new Set([...Object.values(TURN_BLOCK_MSG), ...Object.values(DIAL_BLOCK_MSG), ...Object.values(TURN_MODE_DENY_MSG), ...Object.values(TRANSFER_BLOCK_MSG), 'lvl.ch4.locked', 'lvl.ch5.locked']);

export type AudioScreen = 'menu' | 'level' | 'clear' | 'cutscene' | 'other';

const volumesOf = (s: Settings) => ({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, mute: s.mute });

export class AudioBridge {
  readonly manager: WebAudioManager;
  private observer = new LevelObserver(DENY_KEYS);
  private session: LevelSession | null = null;
  private room: string | null = null;
  /** 目前的 World (R / 換房 = 新的 World：追逐情境收掉，同 mechanics/chase 的重置) */
  private world: object | null = null;
  private levelId: string | null = null;
  private cutsceneId: string | null = null;
  private closeSettings: (() => void) | null = null;

  constructor(private text: Text, private settings: () => Settings, private change: (patch: Partial<Settings>) => void) {
    const s = settings();
    this.manager = new WebAudioManager({ volumes: volumesOf(s), calm: s.calmTension });
    this.manager.attach(document, window);
    // 任何按鈕的點擊：木頭輕敲 (UI 聲；第一次點擊同時解鎖 AudioContext)
    document.addEventListener('click', e => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b && !(b as HTMLButtonElement).disabled) this.manager.play('sfx.ui.click');
    }, { capture: true });
  }

  /** 進入畫面：levelId = 關卡畫面 / 通關畫面的關卡；cutsceneId = 過場 */
  enter(screen: AudioScreen, id?: string): void {
    const m = this.manager;
    this.closeSettingsUi();
    if (screen !== 'cutscene' && this.cutsceneId) { m.cutsceneEnd(); this.cutsceneId = null; }
    if (screen !== 'level') { m.levelEnd(); this.session = null; this.observer.reset(); }
    switch (screen) {
      case 'menu': case 'other':
        this.levelId = null;
        m.setChapter('prologue');
        m.setIntensity(0);
        m.setContext('explore');
        break;
      case 'level': {
        const e = id ? levelById(id) ?? protoLevelById(id) : undefined;
        this.levelId = id ?? null;
        this.room = null;
        m.setChapter(e?.chapter ?? 1);
        m.setIntensity(levelIntensity(id ?? ''));
        m.setContext('explore');
        break;
      }
      case 'clear':
        m.play('sfx.level.clear');
        m.setContext('quiet');
        break;
      case 'cutscene':
        if (id) { this.cutsceneId = id; m.cutsceneStart(id); }
        break;
      default: break;
    }
  }

  /** 過場事件 (鏡頭開始 / 音訊提示) */
  cutsceneEvent(id: string, e: CutsceneEvent): void {
    if (e.type === 'shot') this.manager.cutsceneShot(id, e.index + 1);
    else if (e.type === 'audio') this.manager.cue(e.cue);
  }

  /** 世界事件 (LevelSession 轉發；switch 不經過這裡，由狀態差判斷) */
  worldEvent(e: GameEvent): void { this.manager.apply(worldEventActions(e)); }

  /** 每幀：關卡狀態差 → 音效；換房 → 環境音種子與強度；展開圖 / 轉動模式 → 轉動情境 */
  frame(session: LevelSession | null): void {
    if (!session) { this.session = null; return; }
    if (session !== this.session) { this.session = session; this.observer.reset(); }
    const cs = session.chapter;
    if (session.world !== this.world) { this.world = session.world; this.manager.chase('off'); }
    const room = cs.state.room;
    if (room !== this.room) {
      this.room = room;
      this.manager.levelStart(room);
      const cc = this.levelId ? cubeChapterOf(this.levelId) : undefined;
      const lid = cc ? Object.entries(cc.levels).find(([, r]) => r === room)?.[0] : undefined;
      this.manager.setIntensity(levelIntensity(lid ?? this.levelId ?? ''));
    }
    // v0.4 第五章 E♭ 分層：三扇窗的完成數 (章節狀態的旗標；不在第五章 = 不分層)
    this.manager.setStage(cs.spec.chapter === 5 ? ch5Stage(doneFlags(cs.spec, cs.state, session.world)) : null);
    this.manager.setContext(session.isTurnMode || session.isMapOpen ? 'turn' : 'explore');
    this.manager.apply(this.observer.update(snapshot(session)));
  }

  /** 設定改變 (音量 / 靜音 / 減弱緊張效果) */
  applySettings(s: Settings): void {
    this.manager.setVolumes(volumesOf(s));
    this.manager.setCalm(s.calmTension);
  }

  /** 聲音設定頁 (疊在選單上方) */
  openSettings(): void {
    this.closeSettings?.();
    const s = this.settings();
    const model: SoundSettingsModel = { masterVolume: s.masterVolume, musicVolume: s.musicVolume, sfxVolume: s.sfxVolume, mute: s.mute, calmTension: s.calmTension };
    this.closeSettings = showSoundSettings(this.text, model, {
      change: v => { this.change(v); this.applySettings(this.settings()); },
      preview: kind => this.manager.play(kind === 'music' ? 'sfx.puzzle.solved' : 'sfx.pickup'),
      back: () => this.closeSettingsUi()
    });
  }

  closeSettingsUi(): void {
    this.closeSettings?.();
    this.closeSettings = null;
  }
}

/** LevelSession → 純資料快照 (audio/events.LevelSnap) */
function snapshot(s: LevelSession): LevelSnap {
  const w = s.world;
  const cs = s.chapter;
  const p = w.player;
  const dial = isDialChapter(cs.spec) && !!cs.state.dial;
  return {
    world: w,
    room: cs.state.room,
    mode: p.mode,
    player: { x: p.x, y: p.y, z: p.z, vy: p.vy, onGround: p.onGround },
    inv: { ...w.inv },
    objs: w.objs.map(o => ({ id: o.def.id, type: o.def.type, used: o.used, gone: o.gone, x: o.x, z: o.z })),
    cube: cs.state.cube ? JSON.stringify(cs.state.cube) : '',
    ink: dial ? cs.state.turns?.left ?? null : null,
    mapOpen: s.isMapOpen,
    turnMode: s.isTurnMode,
    trayOpen: s.trayOpen !== null,
    busy: s.busy,
    msgSeq: w.msgSeq,
    msgKey: w.msgKey
  };
}
