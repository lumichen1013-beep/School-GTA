import { qualityManager } from '../core/QualityManager';
import { readTouchSignals } from '../core/device';
import { getFxQuality } from '../effects/fxQuality';
import { getNpcLodDistanceScale } from '../entities/npc/lod';
import { describeDiagFlags, getDiagFlags } from '../core/diagFlags';
import { perfProbe } from '../core/perfProbe';
import { QUALITY_PRESETS } from '../core/quality';

// 網址帶 ?diag= 時於畫面左下角顯示裝置、畫質與效能診斷資訊 (供實機截圖回報；一般玩家不建立)。
// 同時套用 URL 診斷開關 (見 core/diagFlags)，並啟用 main 的逐幀計時；未帶 diag 時完全不計時。
export function setupDiagPanel(): void {
  const flags = getDiagFlags();
  if (!flags.enabled) return;
  perfProbe.enabled = true;
  document.body.classList.toggle('diag-noblur', flags.blur === false);
  document.body.classList.toggle('diag-nohud', flags.hud === false);
  const el = document.createElement('div');
  el.id = 'diag-panel';
  document.body.appendChild(el);

  const render = () => {
    const t = readTouchSignals();
    const r = qualityManager.rendererInfo();
    const dyn = qualityManager.dynResInfo();
    const sh = qualityManager.shadowInfo();
    const fx = getFxQuality();
    const fps = qualityManager.measuredFps;
    const now = performance.now();
    const logic = perfProbe.logic.stats(now);
    const rend = perfProbe.render.stats(now);
    const raf = perfProbe.raf.stats(now);
    const rawRaf = perfProbe.rawRaf.stats(now);
    const f1 = (v: number) => v.toFixed(1);
    const cap = qualityManager.fpsCap;
    const enabledFlags = describeDiagFlags(flags);
    const lines = [
      `診斷開關: ${enabledFlags.length ? enabledFlags.join(' ') : '(無)'}`,
      `邏輯 ms (2s): 平均 ${f1(logic.avg)}  p95 ${f1(logic.p95)}    render 呼叫 ms: 平均 ${f1(rend.avg)}  p95 ${f1(rend.p95)}`,
      `rAF 間隔 ms (2s): 平均 ${f1(raf.avg)}  p95 ${f1(raf.p95)}    實際 FPS: ${raf.avg > 0 ? f1(1000 / raf.avg) : '-'}    估計螢幕更新率: ${rawRaf.p50 > 0 ? Math.round(1000 / rawRaf.p50) : '-'} Hz`,
      `draw calls: ${r.calls}  triangles: ${r.triangles}  programs: ${r.programs}`,
      `檔位: ${qualityManager.tier}  鎖 30: ${cap > 0 ? `是 (上限 ${cap})` : '否'}${qualityManager.isProbing ? ' (偵測中暫解)' : ''}  預設上限: ${QUALITY_PRESETS[qualityManager.tier].fpsCap || '不限'}  AA: ${qualityManager.antialias ? '開' : '關'}${qualityManager.aaRestartNeeded ? ' (重新整理後變更)' : ''}`,
      `UA: ${navigator.userAgent}`,
      `maxTouchPoints: ${t.maxTouchPoints}  ontouchstart: ${t.hasOnTouchStart}  pointer:coarse: ${t.coarsePointer}`,
      `inner: ${window.innerWidth}x${window.innerHeight}  screen: ${window.screen?.width}x${window.screen?.height}`,
      `devicePixelRatio: ${window.devicePixelRatio}  實際像素比: ${r.pixelRatio}  動態解析度: ${dyn.active ? `啟用 ${dyn.ratio} / 上限 ${dyn.max}` : '停用'}`,
      `renderer 解析度: ${r.width}x${r.height}`,
      `畫質: ${qualityManager.tier}  來源: ${qualityManager.mode === 'auto' ? '自動' : '手動'} (mode=${qualityManager.mode})${qualityManager.isProbing ? '  偵測中' : ''}`,
      `量測 FPS: ${fps !== null ? fps.toFixed(1) : '-'}`,
      `陰影: ${r.shadow > 0 ? `${r.shadow}x${r.shadow}` : '關閉'}  更新: ${sh.isThrottled ? `降頻 (近 ${sh.recentFrames} 幀重繪 ${sh.recentUpdates} 次，監看 ${sh.watchedCount})` : '每幀'}  NPC LOD 倍率: ${getNpcLodDistanceScale()}`,
      `特效: slash ${fx.slashPool} ring ${fx.ringPool} dust ${fx.dustPool} feather ${fx.featherPool} crack ${fx.crackPool}x${fx.crackLayers} bolt ${fx.lightningStrands} trailSub ${fx.trailSubdiv}`,
      `WebGL: ${qualityManager.gpuRenderer || '(無法讀取)'}`,
    ];
    const text = lines.join('\n');
    if (el.textContent !== text) el.textContent = text;
  };
  render();
  qualityManager.onChange(render);
  window.setInterval(render, 500); // 每 0.5 秒更新文字，不逐幀寫 DOM
}
