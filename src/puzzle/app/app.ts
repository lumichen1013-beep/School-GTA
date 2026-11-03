import * as THREE from 'three';
import '../ui/puzzle.css';
import { zhHant } from '../content/text/zh-Hant';
import { LEVELS, levelById, PROTO_LEVELS, protoLevelById, type LevelEntry } from '../content/levels';
import { CHAPTERS } from '../content/chapters';
import type { World } from '../core/types';
import { createText, type Text } from '../text/text';
import { DEFAULT_BINDINGS, mergeBindings } from '../input/bindings';
import { KeyboardSource } from '../input/keyboard';
import type { Bindings, InputFrame, InputSource } from '../input/types';
import type { KeyValueStorage } from '../meta/storage';
import { cleanName, loadSave, NAME_MAX, writeSave, type Save } from '../meta/save';
import { loadSettings, writeSettings, type Settings } from '../meta/settings';
import { memoryEntries, recordCutscene, shouldAutoPlayPrologue } from '../meta/cutscenes';
import { seenCutscenes } from '../meta/save';
import { cutsceneById, PROLOGUE_ID, type CutsceneId } from '../content/cutscenes';
import { isUnlocked, levelState, nextAfterClear, recordClear, startAbilities, type ClearKind } from '../meta/progress';
import { cssCubeFx, cssFade, TRANSITIONS } from '../render/transitions';
import { resolveTheme } from '../render/themes';
import { buildPuzzleDom } from '../ui/dom';
import { PuzzleHud } from '../ui/hud';
import { CubeMapOverlay } from '../ui/cubeMap';
import { CardTray } from '../ui/cardTray';
import { keyLabel } from '../input/bindings';
import { showMenu } from '../ui/screens/menu';
import { showNickname } from '../ui/screens/nickname';
import { showRestartConfirm, showSkipConfirm } from '../ui/confirm';
import { showMemories, type CutsceneSettingsModel } from '../ui/screens/memories';
import { showCutsceneUi, type CutsceneUi } from '../ui/cutscene';
import { CutsceneCanvas } from '../render/cutscene/canvas';
import type { ShotFrame } from '../render/cutscene/types';
import { CutscenePlayer, planCutscene, type CutsceneEvent, type CutsceneView } from './cutscene';
import { deriveHelp } from './hudModel';
import { deriveHelpView, pendingTip, tipText, TIP_MS, type HelpContext } from './helpModel';
import { RestartConfirm, routeFrame } from './restartConfirm';
import { LevelSession } from './levelSession';
import { newChapterState, singleRoomSpec, type ChapterSpec, type ChapterState } from '../core/chapter';
import { cubeChapterOf } from '../content/cubes';
import { chapterDoors } from '../mechanics/cube';
import { chapterStart, entryNarrationKey, withChapter } from '../meta/chapters';
import { browserStorage } from './services';

/**
 * 畫面狀態機：boot →(無暱稱) nickname →(未看序章且無進度) cutscene(prologue) → menu → level → clear → (level | menu)；
 * 選單「回憶」→ memories → cutscene(重看) → memories
 */
export type Screen =
  | { id: 'boot' } | { id: 'nickname' } | { id: 'menu' }
  | { id: 'level'; levelId: string } | { id: 'clear'; levelId: string; kind?: ClearKind }
  | { id: 'memories' }
  | { id: 'cutscene'; cutsceneId: CutsceneId; next: Screen; replay: boolean };

/** 進行中的過場：播放器 (純邏輯) + 畫布 (render) + 字幕帶 (ui) */
interface ActiveCutscene { id: CutsceneId; player: CutscenePlayer; canvas: CutsceneCanvas; ui: CutsceneUi; reduce: boolean }

const NARRATION_MS = 4000;

/** 應用外殼：組裝文字 / 存檔 / 設定 / 輸入 / 渲染器 / HUD，切換畫面，跑 rAF 主迴圈 */
export class PuzzleApp {
  readonly text: Text = createText(zhHant);
  private storage: KeyValueStorage = browserStorage();
  private save: Save = loadSave(this.storage);
  private settings: Settings = loadSettings(this.storage);
  private bindings: Bindings = mergeBindings(DEFAULT_BINDINGS, this.settings.keys);
  private renderer: THREE.WebGLRenderer;
  private hud: PuzzleHud;
  private cubeMap: CubeMapOverlay;
  private tray: CardTray;
  private input: InputSource;
  private session: LevelSession | null = null;
  private screen: Screen = { id: 'boot' };
  private closeScreen: (() => void) | null = null;
  private confirm = new RestartConfirm();
  private closeConfirmUi: (() => void) | null = null;
  private narrationUntil = 0;
  private last = performance.now();
  private cs: ActiveCutscene | null = null;
  private closeSkipUi: (() => void) | null = null;
  /** 開發入口 (網址帶 ?dev=1)：選單多一區「開發：控制盤原型」(原型占位，不計入正式關卡) */
  private readonly dev = new URLSearchParams(window.location.search).get('dev') === '1';
  /** 音訊掛點：音訊模組 (規格 9.1) 實作前不做事 */
  private onAudioCue: (e: Extract<CutsceneEvent, { type: 'audio' }>) => void = () => { /* 音訊模組尚未實作 */ };

  constructor(root: HTMLElement) {
    buildPuzzleDom(root, this.text, [
      ...deriveHelp(this.bindings), { keys: this.bindings.map.map(keyLabel), labelKey: 'ui.help.map' },
      { keys: [this.text('ui.help.cards.keys', { a: keyLabel(this.bindings.slot1[0] ?? ''), b: keyLabel(this.bindings.slot3[0] ?? '') }), keyLabel(this.bindings.uncard[0] ?? '')], labelKey: 'ui.help.cards' },
      { keys: [keyLabel(this.bindings.turnMode[0] ?? ''), keyLabel(this.bindings.undo[0] ?? '')], labelKey: 'ui.help.turn' },
      { keys: this.bindings.help.map(keyLabel), labelKey: 'ui.help.toggle' }
    ]);
    this.hud = new PuzzleHud(this.text);
    this.cubeMap = new CubeMapOverlay(root, this.text, () => this.session?.toggleMap(), {
      tab: () => this.session?.toggleTurnMode(),
      input: i => this.session?.turnInput(i)
    });
    this.tray = new CardTray(root, this.text, {
      slot: n => this.session?.trayPick(n),
      remove: () => this.session?.trayRemove(),
      close: () => this.session?.closeTray()
    });
    this.input = new KeyboardSource(this.bindings);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    document.getElementById('pz-canvas')!.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.hud.onPrompt(() => this.session?.tap());
    this.hud.onReplay(() => this.restart());
    this.hud.onMenu(() => this.go({ id: 'menu' }));
    this.hud.onContinue(() => this.continueAfterClear());
    this.hud.onHelp(() => this.toggleHelp());
    window.addEventListener('resize', () => this.resize());
    // 失焦 / 切到背景：暫停過場時間軸
    const pause = (): void => { this.cs?.player.pause(); this.input.releaseAll(); };
    const resume = (): void => { if (!document.hidden) this.cs?.player.resume(); };
    window.addEventListener('blur', pause);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
    this.go(this.save.name ? { id: 'menu' } : { id: 'nickname' });
    requestAnimationFrame(t => this.frame(t));
  }

  /** 目前關卡的世界 (開發期自動化驗證用) */
  get world(): World | null { return this.session?.world ?? null; }
  get current(): Screen { return this.screen; }
  /** 目前的關卡遊玩 (章節 session、展開圖、過場狀態；開發期自動化驗證用) */
  get level(): LevelSession | null { return this.session; }
  /** 目前過場的播放器 (開發期自動化驗證用) */
  get cutscene(): CutscenePlayer | null { return this.cs?.player ?? null; }

  go(next: Screen): void {
    const prev = this.screen;
    this.closeConfirm();
    this.exit(prev, next);
    this.screen = next;
    this.enter(next, prev);
  }

  private exit(s: Screen, next: Screen): void {
    this.closeScreen?.();
    this.closeScreen = null;
    switch (s.id) {
      case 'clear': this.hud.hideClear(); if (next.id !== 'level') this.endSession(); break;
      case 'level': if (next.id !== 'clear') this.endSession(); break;
      case 'cutscene': this.endCutscene(); break;
      default: break;
    }
  }

  private enter(s: Screen, prev: Screen): void {
    switch (s.id) {
      case 'nickname':
        document.title = this.text('ui.docTitle.menu');
        this.closeScreen = showNickname(this.text, {
          initial: this.save.name, maxLength: NAME_MAX,
          onDone: name => {
            this.commit({ ...this.save, name: cleanName(name) });
            this.go(shouldAutoPlayPrologue(this.save) ? { id: 'cutscene', cutsceneId: PROLOGUE_ID, next: { id: 'menu' }, replay: false } : { id: 'menu' });
          }
        });
        break;
      case 'menu':
        document.title = this.text('ui.docTitle.menu');
        this.skipNarration();
        this.closeScreen = showMenu(this.text, {
          name: this.save.name,
          chapters: CHAPTERS.map(ch => ({
            titleKey: ch.titleKey,
            levels: ch.levels.map(levelById).filter((e): e is LevelEntry => !!e).map(e => ({ id: e.id, titleKey: e.titleKey, state: levelState(e, this.save) }))
          })),
          ...(this.dev ? { dev: { titleKey: 'lvl.proto.menu', levels: PROTO_LEVELS.map(e => ({ id: e.id, titleKey: e.titleKey, state: 'open' as const })) } } : {})
        }, {
          // M1C 前就有暱稱但沒有任何進度的存檔：第一次進 1-1 前播序章
          play: id => this.go(id === '1-1' && shouldAutoPlayPrologue(this.save)
            ? { id: 'cutscene', cutsceneId: PROLOGUE_ID, next: { id: 'level', levelId: id }, replay: false }
            : { id: 'level', levelId: id }),
          rename: () => this.go({ id: 'nickname' }),
          memories: () => this.go({ id: 'memories' })
        });
        break;
      case 'memories':
        document.title = this.text('ui.docTitle.menu');
        this.closeScreen = showMemories(this.text, { items: memoryEntries(this.save), settings: this.cutsceneSettings() }, {
          replay: id => { const def = cutsceneById(id); if (def) this.go({ id: 'cutscene', cutsceneId: def.id, next: { id: 'memories' }, replay: true }); },
          back: () => this.go({ id: 'menu' }),
          change: v => {
            this.settings = { ...this.settings, ...v };
            writeSettings(this.storage, this.settings);
          }
        });
        break;
      case 'cutscene':
        this.startCutscene(s.cutsceneId, s.replay);
        break;
      case 'level': {
        const e = this.entry(s.levelId);
        document.title = this.text('ui.docTitle', { level: this.text(e.titleKey) });
        this.startSession(e);
        // 從通關畫面重玩 / 回到本章：不重播旁白；前往下一章 (換了關卡)：播新房間的旁白
        if (prev.id !== 'clear' || prev.levelId !== s.levelId) this.showNarration(e);
        break;
      }
      case 'clear': {
        // 魔方章：章門打開 = 本章每個房間 (關卡) 都記為通關 (例：1-3 的章門 → 1-2、1-3)
        const e = levelById(s.levelId) ?? this.entry(s.levelId);
        const def = e.load();
        const cc = cubeChapterOf(e.id);
        const room = s.kind === 'room';
        if (this.session) this.commit(recordClear(this.save, e.id, this.session.world, cc && !room ? Object.keys(cc.levels) : []));
        // 繼續：章門打開 → 下一章的第一關 (「前往第二章　書房」)；章內的房間通關 → 回到本章 (「繼續探索」)
        const kind = s.kind ?? 'level';
        const next = nextAfterClear(e.id, kind, CHAPTERS);
        const nextCh = next && kind === 'chapter' ? CHAPTERS.find(ch => ch.levels.includes(next)) : undefined;
        const cont = next === null ? null : room ? this.text('ui.clear.continue') : this.text('ui.clear.next', { level: this.text(nextCh?.titleKey ?? levelById(next)!.titleKey) });
        this.hud.showClear(this.text('ui.clear.title', { level: this.text(e.titleKey) }), this.text(def.nextKey), cont);
        break;
      }
      default: break;
    }
  }

  private entry(id: string): LevelEntry {
    const e = levelById(id) ?? (this.dev ? protoLevelById(id) : undefined);
    if (!e || !isUnlocked(e, this.save)) return LEVELS[0];
    return e;
  }

  private commit(save: Save): void {
    this.save = save;
    writeSave(this.storage, save);
  }

  /** 關卡 → 章節 spec 與起始狀態：在魔方上 → 整章 (接著存檔玩)；否則單房 */
  private chapterFor(e: LevelEntry): { spec: ChapterSpec; state: ChapterState } {
    const cc = cubeChapterOf(e.id);
    if (!cc) {
      const spec = singleRoomSpec(e.load());
      return { spec, state: newChapterState(spec, e.id, null) };
    }
    const spec: ChapterSpec = { chapter: cc.chapter, cube: cc.cube, rooms: cc.rooms, doors: chapterDoors(cc.rooms) };
    return { spec, state: chapterStart(this.save, spec, cc.start, cc.legacy) };
  }

  private startSession(e: LevelEntry): void {
    this.endSession();
    const levelId = e.id;
    const { spec, state } = this.chapterFor(e);
    const level = spec.rooms[state.room];
    const theme = resolveTheme(level.theme ?? CHAPTERS.find(ch => ch.id === e.chapter)?.theme);
    this.session = new LevelSession(
      {
        renderer: this.renderer, text: this.text, hud: this.hud, bindings: this.bindings, transition: cssFade(document.getElementById('pz-fade')!, TRANSITIONS[theme.transition]), theme,
        fx: dir => cssCubeFx(document.getElementById('pz-canvas')!, document.getElementById('pz-veil')!, dir, this.reduceMotion()),
        map: this.cubeMap,
        tray: this.tray,
        calm: this.settings.calmTension,
        onTrayOpen: () => this.input.releaseAll(),
        releaseInput: () => this.input.releaseAll()
      },
      spec, state,
      {
        abilities: startAbilities(e, this.save),
        onCleared: () => this.go({ id: 'clear', levelId: this.clearedLevel(levelId), kind: cubeChapterOf(levelId) ? 'chapter' : 'level' }),
        onChapterSave: st => this.commit(withChapter(this.save, st)),
        onRoomCleared: room => this.roomCleared(levelId, room)
      }
    );
    this.resize();
    this.input.clear();
  }

  /** 房間通關 (v0.4 控制盤章節，例：2-1 三題都完成)：這間房是登錄表的關卡、且還沒記為通關 → 通關畫面 (只記這一關) */
  private roomCleared(fallback: string, room: string): void {
    const cc = cubeChapterOf(fallback);
    const id = cc && Object.entries(cc.levels).find(([, r]) => r === room)?.[0];
    if (id && !this.save.cleared.includes(id)) this.go({ id: 'clear', levelId: id, kind: 'room' });
  }

  /** 通關畫面的「繼續」 */
  private continueAfterClear(): void {
    const s = this.screen;
    if (s.id !== 'clear') return;
    const next = nextAfterClear(s.levelId, s.kind ?? 'level', CHAPTERS);
    if (next) this.go({ id: 'level', levelId: next });
  }

  /** 通關的關卡：魔方章 = 玩家此刻所在房間對應的關卡 (章門在 1-3 衣帽間)；單房 = 進場的關卡 */
  private clearedLevel(fallback: string): string {
    const cc = cubeChapterOf(fallback);
    const room = this.session?.chapter.state.room;
    return (cc && Object.entries(cc.levels).find(([, r]) => r === room)?.[0]) || fallback;
  }

  private endSession(): void {
    this.session?.dispose();
    this.session = null;
  }

  /** R / 重玩：同一關重新開始 (不重播旁白)；選單 / 暱稱畫面中無效 */
  private restart(): void {
    const s = this.screen;
    if (s.id === 'clear') this.go({ id: 'level', levelId: s.levelId });
    else if (s.id === 'level' && this.session) { this.session.restartRoom(); this.input.clear(); }
    else if (s.id === 'level') this.startSession(this.entry(s.levelId));
  }

  /** 開啟「重新開始本關」確認窗：遊戲暫停，按著的鍵一律視為放開 */
  private openConfirm(nowMs: number): void {
    this.input.releaseAll();
    this.closeConfirmUi = showRestartConfirm(this.text, {
      onConfirm: () => { this.closeConfirm(); this.restart(); },
      onCancel: () => this.closeConfirm()
    });
  }

  private closeConfirm(): void {
    if (!this.confirm.isOpen && !this.closeConfirmUi) return;
    this.confirm.close();
    this.closeConfirmUi?.();
    this.closeConfirmUi = null;
    this.input.releaseAll();
  }

  /** 進關旁白：開章後實際所在房間的旁白 (章節從別的房開始時不顯示選單那一關的旁白) */
  private showNarration(e: LevelEntry): void {
    this.narrationUntil = performance.now() + NARRATION_MS;
    const cs = this.session?.chapter;
    this.hud.showNarration(this.text(cs ? entryNarrationKey(cs.spec, cs.state) : e.load().narrationKey));
  }

  private skipNarration(): void {
    if (this.narrationUntil) { this.narrationUntil = 0; this.hud.hideNarration(); }
  }

  private cutsceneSettings(): CutsceneSettingsModel {
    const { autoAdvance, textSpeed, skipConfirm, reduceMotion } = this.settings;
    return { autoAdvance, textSpeed, skipConfirm, reduceMotion };
  }

  /** 減弱動態：設定開啟，或系統偏好 prefers-reduced-motion */
  private reduceMotion(): boolean {
    return this.settings.reduceMotion || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  private startCutscene(id: CutsceneId, replay: boolean): void {
    const def = cutsceneById(id)!;
    const reduce = this.reduceMotion();
    const plan = planCutscene(def, this.text, { speed: this.settings.textSpeed, reduceMotion: reduce, name: this.save.name });
    const player = new CutscenePlayer(plan, {
      autoAdvance: this.settings.autoAdvance, skipConfirm: this.settings.skipConfirm, replay, seen: seenCutscenes(this.save).includes(id)
    });
    const title = this.text(def.titleKey);
    document.title = this.text('ui.docTitle', { level: title });
    const ui = showCutsceneUi(this.text, { title, noteScale: this.settings.noteScale, reduceMotion: reduce }, {
      pointerDown: () => player.pointerDown(),
      pointerUp: () => player.pointerUp(),
      pointerCancel: () => player.pointerCancel(),
      skip: () => player.requestSkip()
    });
    const canvas = new CutsceneCanvas(ui.stage, resolveTheme(undefined));
    this.cs = { id, player, canvas, ui, reduce };
    this.skipNarration();
    this.input.clear();
  }

  private endCutscene(): void {
    this.closeSkipUi?.();
    this.closeSkipUi = null;
    if (!this.cs) return;
    this.cs.ui.close();
    const canvas = this.cs.canvas;
    window.setTimeout(() => canvas.dispose(), 650);
    this.cs = null;
    this.input.releaseAll();
  }

  /** 過場的一幀：輸入 → 時間軸 → 事件 (確認窗 / 音訊 / 結束) → 畫面 */
  private cutsceneFrame(elapsed: number, input: InputFrame): void {
    const cs = this.cs!;
    const p = cs.player;
    p.press(input.pressed, input.jumpPressed === true);
    p.tick(Math.min(elapsed, 0.1));
    for (const e of p.drain()) {
      if (e.type === 'confirmOpen') {
        this.input.releaseAll();
        this.closeSkipUi = showSkipConfirm(this.text, { onConfirm: () => p.confirmSkip(), onCancel: () => p.cancelSkip() });
      } else if (e.type === 'confirmClose') {
        this.closeSkipUi?.();
        this.closeSkipUi = null;
      } else if (e.type === 'audio') this.onAudioCue(e);
      else if (e.type === 'end') {
        const s = this.screen;
        this.commit(recordCutscene(this.save, cs.id, e.skipped));
        this.go(s.id === 'cutscene' ? s.next : { id: 'menu' });
        return;
      }
    }
    const v = p.view();
    cs.canvas.draw({ cur: shotFrame(v.shot, v.shotSec, v.motionSec), prev: v.prev && shotFrame(v.prev.shot, v.prev.shotSec, v.prev.motionSec), transition: v.transition, reduceMotion: cs.reduce });
    cs.ui.update({ lines: v.segment?.lines ?? null, alpha: v.segment?.alpha ?? 0, canAdvance: v.segment?.canAdvance ?? false, holdProgress: v.holdProgress, paused: v.confirmOpen || v.paused });
  }

  /** H / 點小鈕：開合操作說明面板 (偏好存進設定) */
  private toggleHelp(): void {
    if (this.screen.id !== 'level') return;
    this.settings = { ...this.settings, helpOpen: !this.settings.helpOpen };
    writeSettings(this.storage, this.settings);
  }

  /** 操作說明面板與一次性小提示 (每幀；app/helpModel) */
  private renderHelp(now: number): void {
    const s = this.session;
    const ctx: HelpContext = {
      inLevel: this.screen.id === 'level' && !!s,
      mapOpen: !!s?.isMapOpen, trayOpen: s?.trayOpen != null, turnMode: !!s?.isTurnMode,
      busy: !s || s.busy || this.narrationUntil > 0 || this.confirm.isOpen
    };
    this.hud.renderHelp(deriveHelpView(this.settings.helpOpen, ctx, this.text, this.bindings));
    if (!ctx.inLevel && this.hud.tipShowing) this.hud.showTip(null, now, 0);
    this.hud.tickTip(now);
    if (this.hud.tipShowing) return;
    // 已經打開過面板的玩家不需要「怎麼打開操作說明」
    const tip = pendingTip(this.settings.helpOpen ? [...this.settings.tipsSeen, 'help'] : this.settings.tipsSeen, ctx);
    if (!tip) return;
    this.hud.showTip(tipText(tip, this.text, this.bindings), now, TIP_MS);
    this.settings = { ...this.settings, tipsSeen: [...this.settings.tipsSeen, tip] };
    writeSettings(this.storage, this.settings);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.session?.resize(w / h);
  }

  private frame(now: number): void {
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    const input = this.input.poll();
    if (this.cs) {
      this.cutsceneFrame(elapsed, input);
      this.renderHelp(now);
      requestAnimationFrame(t => this.frame(t));
      return;
    }
    if (input.anyKey) this.skipNarration();
    if (input.pressed.includes('help')) this.toggleHelp();
    if (this.narrationUntil && now > this.narrationUntil) this.skipNarration();
    switch (routeFrame(this.confirm, this.screen.id, input.pressed, now)) {
      case 'update': this.session?.update(elapsed, input); break;
      case 'open': this.openConfirm(now); break;
      case 'confirm': this.closeConfirm(); this.restart(); break;
      case 'cancel': this.closeConfirm(); break;
      case 'restart': this.restart(); break;
      default: break;
    }
    this.session?.render(now, Math.min(elapsed, 1 / 20));
    this.renderHelp(now);
    requestAnimationFrame(t => this.frame(t));
  }
}

/** 播放器的鏡頭狀態 → render 的 ShotFrame */
function shotFrame(shot: CutsceneView['shot'], shotSec: number, motionSec: number): ShotFrame {
  return { sceneId: shot.def.art.sceneId, labels: shot.labels, shotSec, motionSec, motion: shot.def.motion };
}
