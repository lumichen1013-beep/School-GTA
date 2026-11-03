import * as THREE from 'three';
import type { AbilityId, Mode, World } from '../core/types';
import type { WorldOptions } from '../core/world';
import { openChapter, restartRoom, type ChapterSession, type ChapterSpec, type ChapterState } from '../core/chapter';
import { DEFAULT_MECHANICS } from '../mechanics';
import type { Text } from '../text/text';
import type { Bindings, InputFrame } from '../input/types';
import type { WorldAction } from '../core/actions';
import { PuzzleScene } from '../render/scene';
import { PuzzleCameras } from '../render/cameras';
import type { Transition } from '../render/transitions';
import type { Theme } from '../render/themes';
import type { PuzzleHud } from '../ui/hud';
import { LevelLoop } from './loop';
import { deriveHud } from './hudModel';

export interface SessionContext {
  renderer: THREE.WebGLRenderer;
  text: Text;
  hud: PuzzleHud;
  bindings: Bindings;
  transition: Transition;
  /** 本關呈現主題 (關卡 theme ?? 章節 theme) */
  theme: Theme;
}

export interface SessionHooks {
  abilities: readonly AbilityId[];
  onCleared(): void;
}

const isWorldAction = (a: string): a is WorldAction => a === 'flip' || a === 'reset' || a === 'interact';

/**
 * 一次關卡遊玩：章節 session (core/chapter；單房關卡 = 只有一間房、沒有魔方) + 固定步長迴圈 + 場景 / 鏡頭。
 * 換房 / 重進房間 = 換一個 World，迴圈、場景、鏡頭跟著重建
 */
export class LevelSession {
  private cs: ChapterSession;
  private loop!: LevelLoop;
  private view: PuzzleScene | null = null;
  private cams!: PuzzleCameras;
  private renderMode: Mode = '3d';
  private aspect = 1;
  private readonly opts: WorldOptions;

  constructor(private ctx: SessionContext, spec: ChapterSpec, state: ChapterState, private hooks: SessionHooks) {
    this.opts = { mechanics: DEFAULT_MECHANICS, text: ctx.text, abilities: hooks.abilities };
    this.cs = openChapter(spec, state, this.opts);
    this.mount();
  }

  get world(): World { return this.cs.world; }
  get chapter(): ChapterSession { return this.cs; }

  /** 為目前的 World 建迴圈 / 場景 / 鏡頭 (舊場景釋放)；過場與 HUD 訊息重置 */
  private mount(): void {
    const w = this.cs.world;
    this.view?.dispose();
    this.renderMode = w.player.mode;
    this.loop = new LevelLoop(w, this.ctx.transition, {
      onSwap: () => {
        this.renderMode = this.world.player.mode;
        this.cams.follow(1, this.renderMode);
      },
      onCleared: this.hooks.onCleared
    });
    this.view = new PuzzleScene(w, this.ctx.theme);
    this.cams = new PuzzleCameras(w);
    this.cams.resize(this.aspect);
    this.ctx.transition.cancel();
    this.ctx.hud.reset(w.msgSeq);
  }

  /** R 重進房間：整章狀態 (含魔方排列) 回到本次進房時；單房關卡 = 重新開始本關 */
  restartRoom(): void {
    this.cs = restartRoom(this.cs, this.opts);
    this.mount();
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.cams.resize(aspect);
  }

  /** 推進世界 (固定步長)；input.pressed 中的外殼動作由 app 處理 */
  update(elapsedSec: number, input: InputFrame): void {
    this.loop.frame(elapsedSec, { moveX: input.moveX, moveZ: input.moveZ, jump: input.jump, pressed: input.pressed.filter(isWorldAction) });
  }

  /** 畫一幀：HUD 依目前狀態；玩家位置在上一步與目前之間內插 (高更新率螢幕不頓) */
  render(nowMs: number, dt: number): void {
    const w = this.world;
    const { ctx } = this;
    ctx.hud.render(deriveHud(w, ctx.text, { renderMode: this.renderMode, locked: this.loop.isLocked, bindings: ctx.bindings }), nowMs);
    const p = w.player;
    const prev = this.loop.prev;
    const saved = { x: p.x, y: p.y, z: p.z };
    const a = this.loop.alpha;
    if (prev.mode === p.mode && Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 1) {
      p.x = prev.x + (p.x - prev.x) * a;
      p.y = prev.y + (p.y - prev.y) * a;
      p.z = prev.z + (p.z - prev.z) * a;
    }
    try {
      this.cams.follow(0.12, this.renderMode);
      const cam = this.cams.active(this.renderMode);
      this.view!.update(this.renderMode, dt, nowMs / 1000, cam);
      ctx.renderer.render(this.view!.scene, cam);
    } finally {
      Object.assign(p, saved);
    }
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
  }
}
