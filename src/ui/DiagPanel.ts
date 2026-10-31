import { qualityManager } from '../core/QualityManager';
import { readTouchSignals } from '../core/device';
import { getFxQuality } from '../effects/fxQuality';
import { getNpcLodDistanceScale } from '../entities/npc/lod';

// 網址帶 ?diag=1 時於畫面左下角顯示裝置與畫質診斷資訊 (供實機截圖回報；一般玩家不建立)
export function setupDiagPanel(): void {
  if (new URLSearchParams(window.location.search).get('diag') !== '1') return;
  const el = document.createElement('div');
  el.id = 'diag-panel';
  document.body.appendChild(el);

  const render = () => {
    const t = readTouchSignals();
    const r = qualityManager.rendererInfo();
    const fx = getFxQuality();
    const fps = qualityManager.measuredFps;
    const lines = [
      `UA: ${navigator.userAgent}`,
      `maxTouchPoints: ${t.maxTouchPoints}  ontouchstart: ${t.hasOnTouchStart}  pointer:coarse: ${t.coarsePointer}`,
      `inner: ${window.innerWidth}x${window.innerHeight}  screen: ${window.screen?.width}x${window.screen?.height}`,
      `devicePixelRatio: ${window.devicePixelRatio}  實際像素比: ${r.pixelRatio}`,
      `renderer 解析度: ${r.width}x${r.height}`,
      `畫質: ${qualityManager.tier}  來源: ${qualityManager.mode === 'auto' ? '自動' : '手動'} (mode=${qualityManager.mode})${qualityManager.isProbing ? '  偵測中' : ''}`,
      `量測 FPS: ${fps !== null ? fps.toFixed(1) : '-'}`,
      `陰影: ${r.shadow > 0 ? `${r.shadow}x${r.shadow}` : '關閉'}  NPC LOD 倍率: ${getNpcLodDistanceScale()}`,
      `特效: slash ${fx.slashPool} ring ${fx.ringPool} dust ${fx.dustPool} feather ${fx.featherPool} crack ${fx.crackPool}x${fx.crackLayers} bolt ${fx.lightningStrands} trailSub ${fx.trailSubdiv}`,
      `WebGL: ${qualityManager.gpuRenderer || '(無法讀取)'}`,
    ];
    const text = lines.join('\n');
    if (el.textContent !== text) el.textContent = text;
  };
  render();
  qualityManager.onChange(render);
  window.setInterval(render, 1000);
}
