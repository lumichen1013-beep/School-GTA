import * as THREE from 'three';
import type { ThirdPersonCamera } from '../../camera/ThirdPersonCamera';
import { MANUAL_ZOOM_LEVELS, offscreenArrow, type OffscreenArrow } from '../../camera/bossCamera';
import type { FencerBossFight } from './FencerBossFight';

// 花劍客 Boss 戰鏡頭接點 (main 每幀於鏡頭更新前呼叫一次)：
// - 只在 FIGHT 階段 (非過場) 開啟 ThirdPersonCamera.bossMode，餵 Boss 位置與目前招式
// - 畫外方向箭頭 (DOM，變化時才寫 style)；Boss 大招 (S3/S4/S5) 進行中且在畫外時閃爍
// - 手機縮放鈕 (近 / 標準 / 遠，手動優先) 與設定「Boss 戰鏡頭：動態 / 固定」(localStorage)

const STORE_KEY = 'schoolgta.bossCam';
const ARROW_MARGIN = 0.12; // NDC 內縮
const ZOOM_LABELS = ['近', '中', '遠'];

const _v = new THREE.Vector3();
const _bossTarget = { x: 0, z: 0 };

export function loadBossCamDynamic(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== 'fixed';
  } catch {
    return true;
  }
}

function storeBossCamDynamic(dynamic: boolean) {
  try {
    localStorage.setItem(STORE_KEY, dynamic ? 'dynamic' : 'fixed');
  } catch { /* 無痕模式等 */ }
}

export class BossCameraLink {
  private readonly arrowState: OffscreenArrow = { visible: false, x: 0, y: 0, angle: 0 };
  private arrowEl: HTMLDivElement | null = null;
  private zoomBtn: HTMLButtonElement | null = null;
  private settingBtn: HTMLButtonElement | null = null;
  private arrowShown = false;
  private arrowFlash = false;
  private zoomShown = false;
  private lastTransform = '';

  constructor(
    private readonly cam: ThirdPersonCamera,
    private readonly fight: FencerBossFight,
    private readonly isTouch: () => boolean
  ) {
    cam.bossCamDynamic = loadBossCamDynamic();
    if (typeof document === 'undefined') return;
    const arrow = document.createElement('div');
    arrow.id = 'boss-offscreen-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(arrow);
    this.arrowEl = arrow;

    const zoom = document.createElement('button');
    zoom.type = 'button';
    zoom.id = 'boss-cam-zoom-btn';
    zoom.className = 'mobile-btn';
    zoom.title = 'Boss 戰鏡頭距離 (近 / 中 / 遠)';
    zoom.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onZoom();
    }, { passive: false });
    zoom.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onZoom();
    });
    (document.getElementById('mobile-controls-container') ?? document.body).appendChild(zoom);
    this.zoomBtn = zoom;
    this.renderZoom();

    this.settingBtn = document.getElementById('fm-bosscam') as HTMLButtonElement | null;
    this.settingBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      cam.bossCamDynamic = !cam.bossCamDynamic;
      storeBossCamDynamic(cam.bossCamDynamic);
      this.renderSetting();
    });
    this.renderSetting();
  }

  private onZoom() {
    this.cam.cycleBossZoom();
    this.renderZoom();
  }

  private renderZoom() {
    if (!this.zoomBtn) return;
    const i = Math.max(0, Math.min(MANUAL_ZOOM_LEVELS.length - 1, this.cam.bossZoomIndex));
    this.zoomBtn.textContent = `🔍${ZOOM_LABELS[i]}`;
  }

  private renderSetting() {
    const b = this.settingBtn;
    if (!b) return;
    const on = this.cam.bossCamDynamic;
    b.textContent = `🎥 Boss 戰鏡頭：${on ? '動態' : '固定'}`;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  /** 每幀 (鏡頭更新之前)：設定鏡頭 Boss 戰輸入、更新畫外箭頭與縮放鈕 */
  public update() {
    const { cam, fight } = this;
    const boss = fight.boss;
    const on = fight.phase === 'FIGHT' && !fight.isCutscene && !!boss && boss.root.visible;
    if (fight.isCutscene) cam.cancelBossMode();
    else cam.bossMode = on;
    cam.isTouch = this.isTouch();
    if (on) {
      _bossTarget.x = boss.position.x;
      _bossTarget.z = boss.position.z;
      cam.bossTarget = _bossTarget;
      cam.bossAttack = boss.currentAttack;
    } else {
      cam.bossTarget = null;
      cam.bossAttack = null;
    }
    this.updateArrow(on);
    const zoomOn = on && cam.isTouch;
    if (zoomOn !== this.zoomShown && this.zoomBtn) {
      this.zoomShown = zoomOn;
      this.zoomBtn.style.display = zoomOn ? 'flex' : 'none';
    }
  }

  private updateArrow(on: boolean) {
    let show = false;
    if (on) {
      const camera = this.cam.camera;
      const p = this.fight.boss.position;
      _v.set(p.x, p.y + 1.8, p.z).applyMatrix4(camera.matrixWorldInverse);
      const behind = _v.z > 0;
      _v.applyMatrix4(camera.projectionMatrix);
      show = offscreenArrow(_v.x, _v.y, behind, ARROW_MARGIN, this.arrowState).visible;
    }
    const el = this.arrowEl;
    if (!el) return;
    if (show !== this.arrowShown) {
      this.arrowShown = show;
      el.style.display = show ? 'block' : 'none';
    }
    if (!show) return;
    const a = this.arrowState;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = Math.round(((a.x + 1) / 2) * w);
    const y = Math.round(((1 - a.y) / 2) * h);
    const deg = Math.round((-a.angle * 180) / Math.PI);
    const t = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${deg}deg)`;
    if (t !== this.lastTransform) {
      this.lastTransform = t;
      el.style.transform = t;
    }
    const atk = this.fight.boss.currentAttack;
    const flash = atk === 'S3' || atk === 'S4' || atk === 'S5';
    if (flash !== this.arrowFlash) {
      this.arrowFlash = flash;
      el.classList.toggle('flash', flash);
    }
  }
}
