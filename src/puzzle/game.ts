import * as THREE from 'three';
import './puzzle.css';
import { foyer } from './levels/foyer';
import { createWorld } from './logic/world';
import { stepWorld } from './logic/step';
import { trySwitchMode } from './logic/switchMode';
import { findTarget, interact } from './logic/interact';
import type { Mode, World } from './logic/types';
import { PuzzleInput } from './input';
import { PuzzleHud } from './hud';
import { PuzzleScene } from './render/scene';
import { PuzzleCameras } from './render/cameras';

const TRANSITION = 0.3;
const NARRATION_MS = 4000;
const VERBS: Record<string, string> = { note: '閱讀', key: '拾取', valve: '轉動', door: '開門' };

export class PuzzleGame {
  world: World = createWorld(foyer);
  private input = new PuzzleInput();
  private hud = new PuzzleHud();
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private view!: PuzzleScene;
  private cams!: PuzzleCameras;
  private renderMode: Mode = '3d';
  private lock = 0;
  private lastMsgSeq = 0;
  private narrationUntil = 0;
  private last = performance.now();
  private fade = document.getElementById('pz-fade') as HTMLElement;

  constructor() {
    document.getElementById('pz-canvas')!.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.hud.onReplay(() => this.restart());
    this.input.onAnyKey = () => this.skipNarration();
    window.addEventListener('resize', () => this.resize());
    this.build();
    this.narrationUntil = performance.now() + NARRATION_MS;
    this.hud.showNarration(foyer.narration);
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

  restart(): void {
    this.world = createWorld(foyer);
    this.build();
    this.input.clearPressed();
  }

  private beginSwitch(): void {
    if (!trySwitchMode(this.world).ok) return;
    this.lock = TRANSITION;
    this.fade.style.background = this.world.player.mode === '2d' ? '#0d1b3a' : '#f1e6cc';
  }

  private update(dt: number, now: number): void {
    const w = this.world;
    if (this.input.take('KeyR')) { this.restart(); return; }
    if (w.cleared) return;
    if (this.lock > 0) {
      this.lock -= dt;
      const t = 1 - Math.max(this.lock, 0) / TRANSITION;
      this.fade.style.opacity = String(1 - Math.abs(2 * t - 1));
      if (t >= 0.5 && this.renderMode !== w.player.mode) this.renderMode = w.player.mode;
      this.input.clearPressed();
      if (this.lock <= 0) this.fade.style.opacity = '0';
      return;
    }
    if (this.input.take('KeyF', 'KeyQ')) { this.beginSwitch(); }
    if (this.input.take('KeyE')) interact(w);
    stepWorld(w, { moveX: this.input.moveX, moveZ: this.input.moveZ, jump: this.input.jump }, dt);
    if (w.cleared) { this.hud.showClear(w.level.nextRoom); localStorage.setItem('puzzle:foyer:cleared', '1'); }
    void now;
  }

  private frame(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (this.narrationUntil && now > this.narrationUntil) this.skipNarration();
    this.update(dt, now);
    const w = this.world;
    if (w.msgSeq !== this.lastMsgSeq) { this.lastMsgSeq = w.msgSeq; this.hud.toast(w.msg, now); }
    this.hud.tick(now);
    this.hud.setMode(this.renderMode);
    this.hud.setInventory(w.hasKey);
    const t = this.lock > 0 ? null : findTarget(w);
    this.hud.setPrompt(t ? `[E] ${VERBS[t.def.type] ?? '互動'}${t.def.label ? '　' + t.def.label : ''}` : null);
    this.cams.follow(0.12, this.renderMode);
    this.view.update(this.renderMode);
    this.renderer.render(this.view.scene, this.cams.active(this.renderMode));
    requestAnimationFrame(t2 => this.frame(t2));
  }
}
