import * as THREE from 'three';
import '../ui/puzzle.css';
import { foyer } from '../content/levels/ch1/1-2-foyer';
import { zhHant } from '../content/text/zh-Hant';
import type { LevelDef, World } from '../core/types';
import { createText, type Text } from '../text/text';
import { DEFAULT_BINDINGS } from '../input/bindings';
import { KeyboardSource } from '../input/keyboard';
import type { Bindings, InputSource } from '../input/types';
import { cssFade, TRANSITIONS } from '../render/transitions';
import { buildPuzzleDom } from '../ui/dom';
import { PuzzleHud } from '../ui/hud';
import { deriveHelp } from './hudModel';
import { LevelSession } from './levelSession';

/** 畫面狀態機：boot →(無暱稱) nickname → menu → level → clear → (level | menu) */
export type Screen =
  | { id: 'boot' } | { id: 'nickname' } | { id: 'menu' }
  | { id: 'level'; levelId: string } | { id: 'clear'; levelId: string };

const NARRATION_MS = 4000;
/** 關卡 id → 資料 (S8 改為 content/levels 登錄表) */
const LEVEL_DEFS: Readonly<Record<string, LevelDef>> = { '1-2': foyer };

/** 應用外殼：組裝文字 / 輸入 / 渲染器 / HUD，切換畫面，跑 rAF 主迴圈 */
export class PuzzleApp {
  readonly text: Text = createText(zhHant);
  private bindings: Bindings = DEFAULT_BINDINGS;
  private renderer: THREE.WebGLRenderer;
  private hud: PuzzleHud;
  private input: InputSource;
  private session: LevelSession | null = null;
  private screen: Screen = { id: 'boot' };
  private narrationUntil = 0;
  private last = performance.now();

  constructor(private root: HTMLElement) {
    buildPuzzleDom(root, this.text, deriveHelp(this.bindings));
    this.hud = new PuzzleHud(this.text);
    this.input = new KeyboardSource(this.bindings);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    document.getElementById('pz-canvas')!.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.hud.onReplay(() => this.restart());
    window.addEventListener('resize', () => this.resize());
    this.go({ id: 'level', levelId: '1-2' });
    requestAnimationFrame(t => this.frame(t));
  }

  /** 目前關卡的世界 (開發期自動化驗證用) */
  get world(): World | null { return this.session?.world ?? null; }

  go(next: Screen): void {
    const prev = this.screen;
    this.exit(prev, next);
    this.screen = next;
    this.enter(next, prev);
  }

  private exit(s: Screen, next: Screen): void {
    switch (s.id) {
      case 'clear': this.hud.hideClear(); break;
      case 'level': if (next.id !== 'clear') this.endSession(); break;
      default: break;
    }
  }

  private enter(s: Screen, prev: Screen): void {
    switch (s.id) {
      case 'level': {
        const def = LEVEL_DEFS[s.levelId];
        document.title = this.text('ui.docTitle', { level: this.text(def.titleKey) });
        this.startSession(def);
        if (prev.id !== 'clear') this.showNarration(def);
        break;
      }
      case 'clear': {
        const def = LEVEL_DEFS[s.levelId];
        this.hud.showClear(this.text('ui.clear.title', { level: this.text(def.titleKey) }), this.text(def.nextKey));
        localStorage.setItem('puzzle:foyer:cleared', '1');
        break;
      }
      default: break;
    }
  }

  private startSession(def: LevelDef): void {
    this.endSession();
    const levelId = this.levelId();
    this.session = new LevelSession(
      { renderer: this.renderer, text: this.text, hud: this.hud, bindings: this.bindings, transition: cssFade(document.getElementById('pz-fade')!, TRANSITIONS.ink) },
      def,
      { onCleared: () => this.go({ id: 'clear', levelId }) }
    );
    this.resize();
    this.input.clear();
  }

  private endSession(): void {
    this.session?.dispose();
    this.session = null;
  }

  private levelId(): string {
    const s = this.screen;
    return s.id === 'level' || s.id === 'clear' ? s.levelId : '';
  }

  /** R / 重玩：同一關重新開始 (不重播旁白) */
  private restart(): void {
    const id = this.levelId();
    if (!id) return;
    if (this.screen.id === 'clear') this.go({ id: 'level', levelId: id });
    else this.startSession(LEVEL_DEFS[id]);
  }

  private showNarration(def: LevelDef): void {
    this.narrationUntil = performance.now() + NARRATION_MS;
    this.hud.showNarration(this.text(def.narrationKey));
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
    if (input.pressed.includes('restart')) this.restart();
    else this.session?.update(elapsed, input);
    this.session?.render(now, Math.min(elapsed, 1 / 20));
    requestAnimationFrame(t => this.frame(t));
  }
}
