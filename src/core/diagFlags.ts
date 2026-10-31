// URL 診斷開關 (只在網址帶 ?diag= 時生效，不存檔；與 DiagPanel 同一道閘門)。
// 例：?diag=1&rs=0.5&blur=0&hud=0&render=0&npc=0&map=0&far=60&fog=0&aa=0&fps=30
// 純函式，無 DOM 依賴，可單元測試。

export interface DiagFlags {
  enabled: boolean;
  rs: number | null;      // 強制像素比 (0.3~2)
  aa: boolean | null;     // 強制抗鋸齒
  blur: boolean | null;   // false = 關閉所有 backdrop-filter
  hud: boolean | null;    // false = 隱藏整個 HUD
  render: boolean | null; // false = 跳過 renderer.render
  npc: boolean | null;    // false = 跳過 NPC 更新 (照常繪製)
  map: boolean | null;    // false = 停止小地圖重繪
  far: number | null;     // 相機 far 覆蓋值
  fog: boolean | null;    // false = 移除霧
  fps: number | null;     // 0 = 解除幀率上限；30 = 強制 30
}

const NONE: DiagFlags = { enabled: false, rs: null, aa: null, blur: null, hud: null, render: null, npc: null, map: null, far: null, fog: null, fps: null };

function num(v: string | null, min: number, max: number): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function bool01(v: string | null): boolean | null {
  return v === '1' ? true : v === '0' ? false : null;
}

export function parseDiagFlags(search: string): DiagFlags {
  const q = new URLSearchParams(search);
  if (!q.has('diag')) return NONE;
  const fps = num(q.get('fps'), 0, 240);
  return {
    enabled: true,
    rs: num(q.get('rs'), 0.3, 2),
    aa: bool01(q.get('aa')),
    blur: bool01(q.get('blur')),
    hud: bool01(q.get('hud')),
    render: bool01(q.get('render')),
    npc: bool01(q.get('npc')),
    map: bool01(q.get('map')),
    far: num(q.get('far'), 1, 5000),
    fog: bool01(q.get('fog')),
    fps: fps === 0 || fps === 30 ? fps : null,
  };
}

// 目前啟用的開關描述 (供 DiagPanel 顯示)
export function describeDiagFlags(f: DiagFlags): string[] {
  const out: string[] = [];
  if (f.rs !== null) out.push(`rs=${f.rs}`);
  if (f.aa !== null) out.push(`aa=${f.aa ? 1 : 0}`);
  if (f.blur !== null) out.push(`blur=${f.blur ? 1 : 0}`);
  if (f.hud !== null) out.push(`hud=${f.hud ? 1 : 0}`);
  if (f.render !== null) out.push(`render=${f.render ? 1 : 0}`);
  if (f.npc !== null) out.push(`npc=${f.npc ? 1 : 0}`);
  if (f.map !== null) out.push(`map=${f.map ? 1 : 0}`);
  if (f.far !== null) out.push(`far=${f.far}`);
  if (f.fog !== null) out.push(`fog=${f.fog ? 1 : 0}`);
  if (f.fps !== null) out.push(`fps=${f.fps}`);
  return out;
}

let cached: DiagFlags | null = null;
export function getDiagFlags(): DiagFlags {
  if (!cached) cached = parseDiagFlags(typeof window !== 'undefined' ? window.location.search : '');
  return cached;
}
