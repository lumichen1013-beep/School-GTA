import * as THREE from 'three';
import '../ui/puzzle.css';
import { zhHant } from '../content/text/zh-Hant';
import { LEVELS, levelById, type LevelEntry } from '../content/levels';
import { CHAPTERS } from '../content/chapters';
import type { World } from '../core/types';
import { createText, type Text } from '../text/text';
import { DEFAULT_BINDINGS, mergeBindings } from '../input/bindings';
import { KeyboardSource } from '../input/keyboard';
import type { Bindings, InputSource } from '../input/types';
import type { KeyValueStorage } from '../meta/storage';
import { cleanName, loadSave, NAME_MAX, writeSave, type SaveV2 } from '../meta/save';
import { loadSettings } from '../meta/settings';
import { isUnlocked, levelState, recordClear, startAbilities } from '../meta/progress';
import { cssFade, TRANSITIONS } from '../render/transitions';
import { buildPuzzleDom } from '../ui/dom';
import { PuzzleHud } from '../ui/hud';
import { showMenu } from '../ui/screens/menu';
import { showNickname } from '../ui/screens/nickname';
import { showRestartConfirm } from '../ui/confirm';
import { deriveHelp } from './hudModel';
import { RestartConfirm, routeFrame } from './restartConfirm';
import { LevelSession } from './levelSession';
import { browserStorage } from './services';

/** 畫面狀態機：boot →(無暱稱) nickname → menu → level → clear → (level | menu) */
export type Screen =
  | { id: 'boot' } | { id: 'nickname' } | { id: 'menu' }
  | { id: 'level'; levelId: string } | { id: 'clear'; levelId: string };

const NARRATION_MS = 4000;

/** 應用外殼：組裝文字 / 存檔 / 設定 / 輸入 / 渲染器 / HUD，切換畫面，跑 rAF 主迴圈 */
export class PuzzleApp {
  readonly text: Text = createText(zhHant);
  private storage: KeyValueStorage = browserStorage();
  private save: SaveV2 = loadSave(this.storage);
  private bindings: Bindings = mergeBindings(DEFAULT_BINDINGS, loadSettings(this.storage).keys);
  private renderer: THREE.WebGLRenderer;
  private hud: PuzzleHud;
  private input: InputSource;
  private session: LevelSession | null = null;
  private screen: Screen = { id: 'boot' };
  private closeScreen: (() => void) | null = null;
  private confirm = new RestartConfirm();
  private closeConfirmUi: (() => void) | null = null;
  private narrationUntil = 0;
  private last = performance.now();

  constructor(root: HTMLElement) {
    buildPuzzleDom(root, this.text, deriveHelp(this.bindings));
    this.hud = new PuzzleHud(this.text);
    this.input = new KeyboardSource(this.bindings);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    document.getElementById('pz-canvas')!.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.hud.onReplay(() => this.restart());
    this.hud.onMenu(() => this.go({ id: 'menu' }));
    window.addEventListener('resize', () => this.resize());
    this.go(this.save.name ? { id: 'menu' } : { id: 'nickname' });
    requestAnimationFrame(t => this.frame(t));
  }

  /** 目前關卡的世界 (開發期自動化驗證用) */
  get world(): World | null { return this.session?.world ?? null; }
  get current(): Screen { return this.screen; }

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
      default: break;
    }
  }

  private enter(s: Screen, prev: Screen): void {
    switch (s.id) {
      case 'nickname':
        document.title = this.text('ui.docTitle.menu');
        this.closeScreen = showNickname(this.text, {
          initial: this.save.name, maxLength: NAME_MAX,
          onDone: name => { this.commit({ ...this.save, name: cleanName(name) }); this.go({ id: 'menu' }); }
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
          }))
        }, {
          play: id => this.go({ id: 'level', levelId: id }),
          rename: () => this.go({ id: 'nickname' })
        });
        break;
      case 'level': {
        const e = this.entry(s.levelId);
        document.title = this.text('ui.docTitle', { level: this.text(e.titleKey) });
        this.startSession(e);
        if (prev.id !== 'clear') this.showNarration(e);
        break;
      }
      case 'clear': {
        const e = this.entry(s.levelId);
        const def = e.load();
        this.hud.showClear(this.text('ui.clear.title', { level: this.text(e.titleKey) }), this.text(def.nextKey));
        if (this.session) this.commit(recordClear(this.save, e.id, this.session.world));
        break;
      }
      default: break;
    }
  }

  private entry(id: string): LevelEntry {
    const e = levelById(id);
    if (!e || !isUnlocked(e, this.save)) return LEVELS[0];
    return e;
  }

  private commit(save: SaveV2): void {
    this.save = save;
    writeSave(this.storage, save);
  }

  private startSession(e: LevelEntry): void {
    this.endSession();
    const levelId = e.id;
    this.session = new LevelSession(
      { renderer: this.renderer, text: this.text, hud: this.hud, bindings: this.bindings, transition: cssFade(document.getElementById('pz-fade')!, TRANSITIONS.ink) },
      e.load(),
      { abilities: startAbilities(e, this.save), onCleared: () => this.go({ id: 'clear', levelId }) }
    );
    this.resize();
    this.input.clear();
  }

  private endSession(): void {
    this.session?.dispose();
    this.session = null;
  }

  /** R / 重玩：同一關重新開始 (不重播旁白)；選單 / 暱稱畫面中無效 */
  private restart(): void {
    const s = this.screen;
    if (s.id === 'clear') this.go({ id: 'level', levelId: s.levelId });
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

  private showNarration(e: LevelEntry): void {
    this.narrationUntil = performance.now() + NARRATION_MS;
    this.hud.showNarration(this.text(e.load().narrationKey));
  }

  private skipNarration(): void {
    if (this.narrationUntil) { this.narrationUntil = 0; this.hud.hideNarration(); }
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
    if (input.anyKey) this.skipNarration();
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
    requestAnimationFrame(t => this.frame(t));
  }
}
