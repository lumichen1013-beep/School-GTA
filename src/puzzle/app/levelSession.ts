import * as THREE from 'three';
import type { AbilityId, GameEvent, Mode, World } from '../core/types';
import { say } from '../core/world';
import type { WorldOptions } from '../core/world';
import type { Side } from '../core/cube';
import { captureState, openChapter, restartRoom, type ChapterSession, type ChapterSpec, type ChapterState } from '../core/chapter';
import { DEFAULT_MECHANICS } from '../mechanics';
import type { Text } from '../text/text';
import type { Bindings, InputFrame } from '../input/types';
import { keyLabel } from '../input/bindings';
import type { WorldAction, WorldCommand } from '../core/actions';
import { PuzzleScene } from '../render/scene';
import { PuzzleCameras } from '../render/cameras';
import type { Fx, Transition } from '../render/transitions';
import type { Theme } from '../render/themes';
import type { PuzzleHud } from '../ui/hud';
import type { CubeMapOverlay } from '../ui/cubeMap';
import type { CardTray } from '../ui/cardTray';
import { LevelLoop } from './loop';
import { deriveHud } from './hudModel';
import { applyChapterEvent } from './chapterEvents';
import { deriveCubeMap, previewFor } from './cubeMapModel';
import { closedTrayKey, deriveCardTray, slotCommand, uncardCommand } from './cardTrayModel';

export interface SessionContext {
  renderer: THREE.WebGLRenderer;
  text: Text;
  hud: PuzzleHud;
  bindings: Bindings;
  transition: Transition;
  /** 本關呈現主題 (關卡 theme ?? 章節 theme) */
  theme: Theme;
  /** 章節過場 (轉動 dir / 換房 null)；外殼決定減弱動態 */
  fx?(dir: Side | null): Fx;
  /** 展開圖疊層 (在魔方上的關卡才用) */
  map?: CubeMapOverlay;
  /** 字卡匣 (N22) */
  tray?: CardTray;
  /** 減弱緊張效果 (驚嚇改平靜版；規格 9.1) */
  calm?: boolean;
  /** 字卡匣打開時：按著的鍵一律視為放開 (mobile-controls 2.5 releaseAll) */
  onTrayOpen?(): void;
}

export interface SessionHooks {
  abilities: readonly AbilityId[];
  onCleared(): void;
  /** 章節狀態寫入時機 (規格 8：換房、轉動完成、重進房間)；單房關卡不呼叫 */
  onChapterSave?(state: ChapterState): void;
}

const isWorldAction = (a: string): a is WorldAction => a === 'flip' || a === 'reset' || a === 'interact';

/**
 * 一次關卡遊玩：章節 session (core/chapter；單房關卡 = 只有一間房、沒有魔方) + 固定步長迴圈 + 場景 / 鏡頭。
 * 換房 / 重進房間 = 換一個 World，迴圈、場景、鏡頭跟著重建；轉動 / 換房播章節過場 (期間不推進世界、丟棄輸入)
 */
export class LevelSession {
  private cs: ChapterSession;
  private loop!: LevelLoop;
  private view: PuzzleScene | null = null;
  private cams!: PuzzleCameras;
  private renderMode: Mode = '3d';
  private aspect = 1;
  private readonly opts: WorldOptions;
  /** 本幀世界送出的章節事件 (迴圈步進完才處理：換房會換掉 World) */
  private events: GameEvent[] = [];
  /** 進行中的章節過場與其換畫面點要做的事 */
  private fx: { fx: Fx; onSwap(): void } | null = null;
  private mapOpen = false;
  /** 字卡匣開著的標籤 (null = 關著)；無效字回饋序號；字卡匣送出、下一幀進世界的指令；點互動提示 = 下一幀按 E */
  private trayLabel: string | null = null;
  private traySeq = 0;
  private commands: WorldCommand[] = [];
  private tapInteract = false;
  /** 字卡匣關著時按了 1～3 / X (站在標籤前)：等匣打開後補做這一下 (n = 第幾格；0 = 取下)；E 沒打開匣 (缺卡 / 缺筆尖) → 0.25 秒後作廢 */
  private pendingTray: number | null = null;
  private pendingAge = 0;

  constructor(private ctx: SessionContext, spec: ChapterSpec, state: ChapterState, private hooks: SessionHooks) {
    this.opts = { mechanics: DEFAULT_MECHANICS, text: ctx.text, abilities: hooks.abilities };
    this.cs = openChapter(spec, state, this.opts);
    this.mount();
  }

  get world(): World { return this.cs.world; }
  get chapter(): ChapterSession { return this.cs; }
  /** 是否在魔方上 (展開圖、章節存檔) */
  get onCube(): boolean { return this.cs.spec.cube !== null; }
  /** 章節過場進行中 (開發期自動化驗證用) */
  get busy(): boolean { return this.fx !== null || this.loop.isLocked; }
  get isMapOpen(): boolean { return this.mapOpen && this.renderMode === '2d'; }
  /** 字卡匣開著的標籤 id (開發期自動化驗證用) */
  get trayOpen(): string | null { return this.trayLabel; }

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
      onCleared: this.hooks.onCleared,
      onEvent: e => { this.events.push(e); this.loop.halt(); }
    });
    this.trayLabel = null;
    this.pendingTray = null;
    this.commands = [];
    this.view = new PuzzleScene(w, this.ctx.theme, { calm: this.ctx.calm });
    this.cams = new PuzzleCameras(w);
    this.cams.resize(this.aspect);
    this.ctx.transition.cancel();
    this.ctx.hud.reset(w.msgSeq);
  }

  /** R 重進房間：整章狀態 (含魔方排列) 回到本次進房時；單房關卡 = 重新開始本關 */
  restartRoom(): void {
    this.cancelFx();
    this.events = [];
    this.cs = restartRoom(this.cs, this.opts);
    this.mount();
    this.saveChapter();
  }

  private saveChapter(): void {
    if (this.onCube) this.hooks.onChapterSave?.(captureState(this.cs));
  }

  private startFx(dir: Side | null, onSwap: () => void): void {
    const fx = this.ctx.fx?.(dir);
    if (!fx) { onSwap(); return; }
    this.fx = { fx, onSwap };
  }

  private cancelFx(): void {
    this.fx?.fx.cancel();
    this.fx = null;
  }

  /** 換房 / 轉動 / 跨房 / 旗標：交給章節層；轉動 = 連接表立即更新、過場中段說明；換房 = 過場中段換場景。字卡匣事件：開匣 / 無效字回饋 */
  private handleEvents(): void {
    for (const e of this.events.splice(0)) {
      if (e.t === 'labelOpen') { this.openTray(e.label); continue; }
      if (e.t === 'card') { if (!e.ok) this.traySeq++; continue; }
      const r = applyChapterEvent(this.cs, e, this.opts);
      if (r.kind === 'state') { this.cs = r.cs; this.saveChapter(); continue; }
      if (r.kind === 'enter') {
        const next = r.next;
        this.mapOpen = false;
        this.startFx(null, () => {
          this.cs = next;
          this.mount();
          this.saveChapter();
        });
        return;
      }
      if (r.kind === 'turn') {
        this.cs = r.cs;
        this.saveChapter();
        this.startFx(r.dir, () => say(this.world, 'msg.cube.turned'));
        return;
      }
    }
  }

  private openTray(label: string): void {
    this.trayLabel = label;
    this.mapOpen = false;
    this.ctx.onTrayOpen?.();
    const n = this.pendingTray;
    this.pendingTray = null;
    if (n === 0) this.trayRemove(); else if (n !== null) this.trayPick(n);
  }


  closeTray(): void { this.trayLabel = null; }
  /** 字卡匣：貼第 n 格的卡 (1 起算) / 取下標籤上的卡 (指令下一幀進世界) */
  trayPick(n: number): void { const m = this.trayModel(); const c = m && slotCommand(m, n); if (c) this.commands.push(c); }
  trayRemove(): void { const m = this.trayModel(); const c = m && uncardCommand(m); if (c) this.commands.push(c); }
  /** 點互動提示 (觸控)：等同下一幀按 E */
  tap(): void { this.tapInteract = true; }

  private trayModel() {
    if (this.trayLabel === null) return null;
    const m = deriveCardTray(this.world, this.ctx.text, this.traySeq);
    return m && m.label === this.trayLabel ? m : null;
  }

  /** M / 「圖」鍵：展開圖只在藏寶圖 (2D) 看得到；實景按下只提示 */
  toggleMap(): void {
    if (!this.onCube || this.fx) return;
    if (this.world.player.mode !== '2d') { say(this.world, 'msg.cube.mapOnly2d'); this.mapOpen = false; return; }
    this.mapOpen = !this.mapOpen;
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.cams.resize(aspect);
  }

  /** 推進世界 (固定步長)；input.pressed 中的外殼動作由 app 處理 (map 由這裡處理) */
  update(elapsedSec: number, input: InputFrame): void {
    if (this.fx) {
      const r = this.fx.fx.tick(Math.min(Math.max(elapsedSec, 0), 1 / 20));
      if (r.swapNow) this.fx.onSwap();
      if (r.done) this.fx = null;
      return;
    }
    let pressed = input.pressed.filter(isWorldAction);
    if (this.tapInteract) { this.tapInteract = false; if (!pressed.includes('interact')) pressed = [...pressed, 'interact']; }
    let move = { moveX: input.moveX, moveZ: input.moveZ, jump: input.jump };
    if (this.trayLabel !== null) {
      // 字卡匣開著：1～3 貼卡、X 取下、Esc / E 關閉；不移動、不切換 (離開範圍 / 回實景 → 自動關閉)
      if (!this.trayModel()) this.trayLabel = null;
      else {
        const slot = (['slot1', 'slot2', 'slot3'] as const).findIndex(a => input.pressed.includes(a));
        if (slot >= 0) this.trayPick(slot + 1);
        if (input.pressed.includes('uncard')) this.trayRemove();
        if (input.pressed.includes('cancel') || pressed.includes('interact')) this.trayLabel = null;
        pressed = [];
        move = { moveX: 0, moveZ: 0, jump: false };
      }
    } else {
      if (input.pressed.includes('map')) this.toggleMap();
      // 字卡匣關著時按 1～3 / X：站在標籤前 = 按 E 打開並補做這一下；否則說明怎麼打開 (cardTrayModel.closedTrayKey)
      const k = pressed.includes('interact') ? null : closedTrayKey(this.world, input.pressed);
      if (k?.open) { this.pendingTray = k.n; this.pendingAge = 0; pressed = [...pressed, 'interact']; }
      else if (k?.howto) say(this.world, 'msg.cards.howto');
    }
    const commands = this.commands.splice(0);
    this.loop.frame(elapsedSec, { ...move, pressed, ...(commands.length ? { commands } : {}) });
    this.handleEvents();
    if (this.pendingTray !== null && (this.pendingAge += elapsedSec) > 0.25) this.pendingTray = null;
  }

  /** 畫一幀：HUD 依目前狀態；玩家位置在上一步與目前之間內插 (高更新率螢幕不頓) */
  render(nowMs: number, dt: number): void {
    const w = this.world;
    const { ctx } = this;
    const locked = this.loop.isLocked || this.fx !== null;
    const hud = deriveHud(w, ctx.text, { renderMode: this.renderMode, locked, bindings: ctx.bindings });
    if (this.renderMode === '3d') this.mapOpen = false;
    const tray = locked ? null : this.trayModel();
    if (tray) hud.prompt = null;
    // 互動提示可點 (觸控 = 按 E；mobile-controls 2.1)；展開圖的提示不可點 (另有「圖」鍵)
    ctx.hud.setPromptTap(!!hud.prompt);
    // 2D、在魔方上、沒有其他提示：提示可以看展開圖
    if (this.onCube && !hud.prompt && !tray && !locked && this.renderMode === '2d' && !this.mapOpen) {
      hud.prompt = ctx.text('ui.prompt', { key: keyLabel(ctx.bindings.map[0] ?? ''), verb: ctx.text('ui.map.open') });
    }
    ctx.hud.render(hud, nowMs);
    ctx.map?.setButton(this.onCube && this.renderMode === '2d' && !locked && !tray);
    ctx.map?.render(this.isMapOpen && !locked && !tray ? deriveCubeMap(this.cs, ctx.text, previewFor(this.cs)) : null);
    ctx.tray?.render(tray);
    const p = w.player;
    const prev = this.loop.prev;
    const saved = { x: p.x, y: p.y, z: p.z };
    const a = this.fx ? 0 : this.loop.alpha;
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
    this.cancelFx();
    this.ctx.tray?.render(null);
    this.ctx.map?.render(null);
    this.ctx.map?.setButton(false);
    this.view?.dispose();
    this.view = null;
  }
}
