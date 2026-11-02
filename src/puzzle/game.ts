import * as THREE from 'three';
import './ui/puzzle.css';
import { foyer } from './content/levels/ch1/1-2-foyer';
import { createWorld, hasItem } from './core/world';
import { step } from './core/step';
import { findTarget } from './core/interact';
import type { WorldAction } from './core/actions';
import type { Mode, ObjState, World } from './core/types';
import { DEFAULT_MECHANICS } from './mechanics';
import { PuzzleInput } from './input/keyboard';
import { PuzzleHud } from './ui/hud';
import { PuzzleScene } from './render/scene';
import { PuzzleCameras } from './render/cameras';
import type { Text } from './text/text';

const TRANSITION = 0.3;
const NARRATION_MS = 4000;
/** 切換過場：往圖紙是墨水暈開，回現實是紙色暈開 */
const FADE_TO_2D = 'radial-gradient(circle at 50% 55%, rgba(61,99,255,.96) 0%, rgba(154,77,255,.92) 38%, rgba(253,244,225,.95) 62%, rgba(253,244,225,0) 72%)';
const FADE_TO_3D = 'radial-gradient(circle at 50% 55%, rgba(253,244,225,.98) 0%, rgba(243,217,182,.95) 45%, rgba(231,168,61,.6) 62%, rgba(231,168,61,0) 72%)';

export class PuzzleGame {
  world: World;
  private input = new PuzzleInput();
  private hud: PuzzleHud;
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private view!: PuzzleScene;
  private cams!: PuzzleCameras;
  private renderMode: Mode = '3d';
  private lock = 0;
  private lastMsgSeq = 0;
  private narrationUntil = 0;
  private last = performance.now();
  private fade = document.getElementById('pz-fade') as HTMLElement;

  constructor(private text: Text) {
    this.world = this.newWorld();
    this.hud = new PuzzleHud(text);
    document.title = text('ui.docTitle', { level: text(foyer.titleKey) });
    document.getElementById('pz-canvas')!.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.hud.onReplay(() => this.restart());
    this.input.onAnyKey = () => this.skipNarration();
    window.addEventListener('resize', () => this.resize());
    this.build();
    this.narrationUntil = performance.now() + NARRATION_MS;
    this.hud.showNarration(this.text(foyer.narrationKey));
    requestAnimationFrame(t => this.frame(t));
  }

  private build(): void {
    this.view = new PuzzleScene(this.world);
    this.cams = new PuzzleCameras(this.world);
    this.renderMode = '3d';
    this.lastMsgSeq = this.world.msgSeq;
    this.lock = 0;
    this.fade.style.opacity = '0';
    this.hud.setMode('3d');
    this.hud.setInventory(false);
    this.hud.hideClear();
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cams.resize(w / h);
  }

  private skipNarration(): void {
    if (this.narrationUntil) { this.narrationUntil = 0; this.hud.hideNarration(); }
  }

  private newWorld(): World {
    return createWorld(foyer, { mechanics: DEFAULT_MECHANICS, text: this.text });
  }

  restart(): void {
    this.view.dispose();
    this.world = this.newWorld();
    this.build();
    this.input.clearPressed();
  }

  private beginSwitch(): void {
    this.lock = TRANSITION;
    this.fade.style.background = this.world.player.mode === '2d' ? FADE_TO_2D : FADE_TO_3D;
  }

  private update(dt: number): void {
    const w = this.world;
    if (this.input.take('KeyR')) { this.restart(); return; }
    if (w.cleared) return;
    if (this.lock > 0) {
      this.lock -= dt;
      const t = 1 - Math.max(this.lock, 0) / TRANSITION;
      this.fade.style.opacity = String(1 - Math.abs(2 * t - 1));
      this.fade.style.transform = `scale(${0.35 + t * 1.6})`;
      if (t >= 0.5 && this.renderMode !== w.player.mode) {
        this.renderMode = w.player.mode;
        this.cams.follow(1, this.renderMode);
      }
      this.input.clearPressed();
      if (this.lock <= 0) this.fade.style.opacity = '0';
      return;
    }
    const pressed: WorldAction[] = [];
    if (this.input.take('KeyF', 'KeyQ')) pressed.push('flip');
    if (this.input.take('KeyT')) pressed.push('reset');
    if (this.input.take('KeyE')) pressed.push('interact');
    step(w, { moveX: this.input.moveX, moveZ: this.input.moveZ, jump: this.input.jump, pressed }, dt);
    for (const e of w.events.splice(0)) if (e.t === 'switch') this.beginSwitch();
    if (w.cleared) { this.hud.showClear(this.text('ui.clear.title', { level: this.text(w.level.titleKey) }), this.text(w.level.nextKey)); localStorage.setItem('puzzle:foyer:cleared', '1'); }
  }

  /** [E] 動詞＋名稱；動詞來自物件類型的 verbKey */
  private promptFor(o: ObjState): string {
    const verb = this.text(this.world.rt.mechanics.types.get(o.def.type)?.spec.verbKey ?? 'obj.default.verb');
    const label = o.def.labelKey ? this.text(o.def.labelKey) : '';
    return label ? this.text('ui.prompt.withLabel', { key: 'E', verb, label }) : this.text('ui.prompt', { key: 'E', verb });
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (this.narrationUntil && now > this.narrationUntil) this.skipNarration();
    this.update(dt);
    const w = this.world;
    if (w.msgSeq !== this.lastMsgSeq) { this.lastMsgSeq = w.msgSeq; this.hud.toast(w.msg, now); }
    this.hud.tick(now);
    this.hud.setMode(this.renderMode);
    this.hud.setInventory(hasItem(w, 'nib'));
    const t = this.lock > 0 || w.cleared ? null : findTarget(w);
    this.hud.setPrompt(t ? this.promptFor(t) : null);
    this.cams.follow(0.12, this.renderMode);
    const cam = this.cams.active(this.renderMode);
    this.view.update(this.renderMode, dt, now / 1000, cam);
    this.renderer.render(this.view.scene, cam);
    requestAnimationFrame(t2 => this.frame(t2));
  }
}
