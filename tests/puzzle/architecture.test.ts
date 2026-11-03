// 架構測試 (architecture-v0.2 2.2 依賴矩陣、2.3 可自動檢查的依賴規則)
// 以 TypeScript 編譯器 API 擷取 import / export from / import() / declare module，依路徑第一段判層後對照矩陣
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import ts from 'typescript';
import { PUZZLE_SRC, listTs } from './sourceScan';

const SRC = join(__dirname, '../../src');

// ── 擷取 ──

interface Dep {
  file: string;            // 匯入方 (相對 src/)
  spec: string;            // 原始字串
  target: string | null;   // 解析後檔案 (相對 src/)；裸模組 = null
  typeOnly: boolean;
  dynamic: boolean;
  names: string[];         // 值匯入的名稱 (named import / re-export)
  line: number;
}

function resolveSpec(fromAbs: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromAbs), spec);
  for (const cand of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return `${base}.ts`; // 不存在的路徑仍判層 (tsc 會另外報錯)
}

/** 解析一份原始碼的依賴 (absFile 用來解析相對路徑) */
export function parseDeps(absFile: string, source: string): Dep[] {
  const sf = ts.createSourceFile(absFile, source, ts.ScriptTarget.Latest, true);
  const out: Dep[] = [];
  const rel = (p: string | null) => (p === null ? null : relative(SRC, p).split(sep).join('/'));
  const push = (spec: string, n: ts.Node, typeOnly: boolean, dynamic: boolean, names: string[]): void => {
    out.push({ file: rel(absFile)!, spec, target: rel(resolveSpec(absFile, spec)), typeOnly, dynamic, names, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      const named = c?.namedBindings && ts.isNamedImports(c.namedBindings) ? c.namedBindings.elements : undefined;
      const valueNames = c && !c.isTypeOnly ? (named ?? []).filter(e => !e.isTypeOnly).map(e => (e.propertyName ?? e.name).text) : [];
      const hasValue = !c || (!c.isTypeOnly && (!!c.name || (c.namedBindings !== undefined && ts.isNamespaceImport(c.namedBindings)) || valueNames.length > 0
        || (named !== undefined && named.length === 0)));
      if (c?.name && !c.isTypeOnly) valueNames.push('default');
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings) && !c.isTypeOnly) valueNames.push('*');
      push(n.moduleSpecifier.text, n, !hasValue, false, valueNames);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const els = n.exportClause && ts.isNamedExports(n.exportClause) ? n.exportClause.elements : undefined;
      const valueNames = n.isTypeOnly ? [] : els ? els.filter(e => !e.isTypeOnly).map(e => (e.propertyName ?? e.name).text) : ['*'];
      push(n.moduleSpecifier.text, n, valueNames.length === 0, false, valueNames);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      push(n.arguments[0].text, n, false, true, ['*']);
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      push(n.argument.literal.text, n, true, false, []);
    } else if (ts.isModuleDeclaration(n) && ts.isStringLiteral(n.name)) {
      push(n.name.text, n, true, false, []); // declare module (declaration merging) = 型別層依賴
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** 檔案 (相對 src/) → 層；src/puzzle 根目錄的檔案 (main.ts) 視為 app；puzzle 以外 = 'outside' */
export function layerOf(srcRel: string): string {
  if (!srcRel.startsWith('puzzle/')) return 'outside';
  const parts = srcRel.slice('puzzle/'.length).split('/');
  return parts.length === 1 ? 'app' : parts[0];
}

// ── 規則資料 (2.2 依賴矩陣：Y 可、T 僅 import type、N 禁止) ──

const LAYERS = ['core', 'mechanics', 'content', 'text', 'meta', 'render', 'ui', 'input', 'app', 'devtools', 'audio'] as const;
type Layer = (typeof LAYERS)[number];
type Cell = 'Y' | 'T' | 'N';
const row = (s: string): Record<Layer | 'three' | 'dom', Cell> => {
  const cols = [...LAYERS.slice(0, 10), 'three', 'dom'] as const;
  const cells = s.split(' ') as Cell[];
  const r = Object.fromEntries(cols.map((c, i) => [c, cells[i]])) as Record<Layer | 'three' | 'dom', Cell>;
  r.audio = r.render; // audio 權限同 render (2.2 註)；被匯入時：core/mechanics/meta/text/devtools 不得 import audio
  return r;
};
//                    core mech cont text meta rend ui   inpt app  devt three dom
const MATRIX: Record<Layer, Record<Layer | 'three' | 'dom', Cell>> = {
  core:      row('Y N N N N N N N N N N N'),
  mechanics: row('Y Y N N N N N N N N N N'),
  content:   row('T T Y N N N N N N N N N'),
  text:      row('N N N Y N N N N N N N N'),
  meta:      row('Y T Y Y Y N N N N N N N'),
  devtools:  row('Y Y Y Y Y N N N N Y N N'),
  render:    row('Y T N N N Y N N N N Y Y'),
  ui:        row('T N N Y N N Y N N N N Y'),
  input:     row('T N N N N N N Y N N N Y'),
  app:       row('Y Y Y Y Y Y Y Y Y Y Y Y'),
  audio:     row('Y T N N N Y N N N N N Y')
};
for (const l of ['core', 'mechanics', 'content', 'text', 'meta', 'devtools', 'ui', 'input'] as const) MATRIX[l].audio = 'N';
MATRIX.audio.audio = 'Y';
MATRIX.app.audio = 'Y';

/** 不得出現 DOM / 非確定性全域的層 (2.3 第 4 點；Node 可跑、確定性) */
const PURE_LAYERS: readonly string[] = ['core', 'mechanics', 'content', 'meta', 'text', 'devtools'];
const DOM_GLOBALS = new Set(['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement']);
const NONDET_MEMBERS = new Set(['performance.now', 'Date.now', 'Math.random']);
/** render 對 core 的值匯入白名單 (2.3 第 7 點；只用查詢函式) */
const RENDER_CORE_VALUES = new Set(['isActiveIn', 'allObjs', 'objBox']);

// ── 已知例外 (顯式資料；新增違規不在此清單 → 失敗；清單項不再發生 → 也失敗，必須刪除) ──

interface KnownException { rule: string; key: string; reason: string; plan: string }
const KNOWN_EXCEPTIONS: readonly KnownException[] = [
  {
    rule: 'cycle',
    key: 'puzzle/core/registry.ts -> puzzle/core/types.ts -> puzzle/core/registry.ts',
    reason: '純型別循環 (types.ts 的 Runtime 引用 CompiledMechanics；registry.ts 引用 World / ObjState)，編譯後消失、無執行期影響；值匯入圖無環',
    plan: '核心 API 定型前不動；若 core 型別再拆檔，把 Runtime 移到 registry.ts 或新檔 core/runtime.ts 即可消除 (core 擁有者，非 S7/S9)'
  }
];

// ── 掃描 ──

const allSrc = listTs(SRC);
const puzzleFiles = listTs(PUZZLE_SRC);
const deps = puzzleFiles.flatMap(f => parseDeps(f, readFileSync(f, 'utf8')));
const fmt = (d: Dep) => `${d.file}:${d.line} → ${d.target ?? d.spec}`;

function matrixViolations(ds: readonly Dep[]): string[] {
  const out: string[] = [];
  for (const d of ds) {
    const from = layerOf(d.file) as Layer;
    if (!MATRIX[from]) { out.push(`${fmt(d)} (unknown layer ${from})`); continue; }
    if (d.target === null) {
      if (d.spec === 'three' && MATRIX[from].three === 'Y') continue;
      if (d.spec === 'three' && MATRIX[from].three === 'T' && d.typeOnly) continue;
      out.push(`${fmt(d)} (bare module not allowed in ${from})`);
      continue;
    }
    const to = layerOf(d.target);
    if (to === 'outside') continue; // 由隔離規則處理
    const cell = MATRIX[from][to as Layer];
    if (cell === undefined) { out.push(`${fmt(d)} (unknown layer ${to})`); continue; }
    if (from === 'app' && to === 'devtools' && !d.dynamic) { out.push(`${fmt(d)} (app may only load devtools via DEV dynamic import)`); continue; }
    if (cell === 'Y' || (cell === 'T' && d.typeOnly)) continue;
    out.push(`${fmt(d)} (${from} → ${to}${cell === 'T' ? ' must be import type' : ' forbidden'})`);
  }
  return out;
}

function globalViolations(files: readonly string[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const rel = relative(SRC, f).split(sep).join('/');
    if (!PURE_LAYERS.includes(layerOf(rel))) continue;
    out.push(...forbiddenGlobals(rel, readFileSync(f, 'utf8')));
  }
  return out;
}

/** 程式碼 (不含註解與字串) 中的 DOM 全域與非確定性呼叫 */
export function forbiddenGlobals(rel: string, source: string): string[] {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const at = (n: ts.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && NONDET_MEMBERS.has(`${n.expression.text}.${n.name.text}`)) {
      out.push(`${at(n)} ${n.expression.text}.${n.name.text}`);
    } else if (ts.isIdentifier(n) && DOM_GLOBALS.has(n.text)) {
      const p = n.parent;
      const isMemberName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n)
        || (ts.isPropertySignature(p) && p.name === n) || (ts.isPropertyDeclaration(p) && p.name === n);
      if (!isMemberName) out.push(`${at(n)} ${n.text}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** 有向圖的所有基本環 (以最小節點為起點正規化，去重) */
function cycles(edges: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const found = new Set<string>();
  const nodes = [...edges.keys()].sort();
  for (const start of nodes) {
    const stack: string[] = [start];
    const onPath = new Set([start]);
    const dfs = (u: string): void => {
      for (const v of edges.get(u) ?? []) {
        if (v === start) {
          const cyc = [...stack];
          const minI = cyc.indexOf([...cyc].sort()[0]);
          const norm = [...cyc.slice(minI), ...cyc.slice(0, minI)];
          found.add([...norm, norm[0]].join(' -> '));
        } else if (!onPath.has(v) && v > start) {
          onPath.add(v); stack.push(v); dfs(v); stack.pop(); onPath.delete(v);
        }
      }
    };
    dfs(start);
  }
  return [...found].sort();
}

function graph(ds: readonly Dep[], pick: (d: Dep) => boolean): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const d of ds) {
    if (d.target === null || !pick(d)) continue;
    if (!g.has(d.file)) g.set(d.file, new Set());
    g.get(d.file)!.add(d.target);
  }
  return g;
}

function isolationViolations(): string[] {
  const out: string[] = [];
  for (const f of allSrc) {
    const rel = relative(SRC, f).split(sep).join('/');
    const inside = rel.startsWith('puzzle/');
    for (const d of parseDeps(f, readFileSync(f, 'utf8'))) {
      if (d.target === null) continue;
      if (inside && !d.target.startsWith('puzzle/')) out.push(`${fmt(d)} (puzzle must not import outside src/puzzle)`);
      if (!inside && d.target.startsWith('puzzle/')) out.push(`${fmt(d)} (GTA code must not import src/puzzle)`);
    }
  }
  return out;
}

function renderCoreViolations(ds: readonly Dep[]): string[] {
  return ds.filter(d => layerOf(d.file) === 'render' && d.target !== null && layerOf(d.target) === 'core' && !d.typeOnly)
    .flatMap(d => d.names.filter(n => !RENDER_CORE_VALUES.has(n)).map(n => `${fmt(d)} imports ${n}`));
}

/** 全部違規 (rule, key)；key 用於比對例外清單 */
function allViolations(): Array<{ rule: string; key: string }> {
  const fullCycles = cycles(graph(deps, () => true));
  return [
    ...matrixViolations(deps).map(key => ({ rule: 'matrix', key })),
    ...globalViolations(puzzleFiles).map(key => ({ rule: 'globals', key })),
    ...fullCycles.map(key => ({ rule: 'cycle', key })),
    ...isolationViolations().map(key => ({ rule: 'isolation', key })),
    ...renderCoreViolations(deps).map(key => ({ rule: 'renderCore', key }))
  ];
}

const isKnown = (v: { rule: string; key: string }) => KNOWN_EXCEPTIONS.some(e => e.rule === v.rule && e.key === v.key);

describe('架構：依賴規則 (2.2 / 2.3)', () => {
  it('掃描器本身有效：import type / export from / import() / declare module / 值名稱都抓得到', () => {
    const fake = join(PUZZLE_SRC, 'core/fake.ts');
    const ds = parseDeps(fake, [
      "import type { A } from './types';",
      "import { type B, step } from './step';",
      "import { type C } from './world';",
      "export { pushCrate } from './push';",
      "export type { Box } from './geometry';",
      "import * as THREE from 'three';",
      "const m = import('../mechanics');",
      "declare module './types' { interface ObjKinds { x: {} } }",
      "type R = import('../render/scene').PuzzleScene;"
    ].join('\n'));
    expect(ds.map(d => [d.target ?? d.spec, d.typeOnly, d.dynamic, d.names.join(',')])).toEqual([
      ['puzzle/core/types.ts', true, false, ''],
      ['puzzle/core/step.ts', false, false, 'step'],
      ['puzzle/core/world.ts', true, false, ''],
      ['puzzle/core/push.ts', false, false, 'pushCrate'],
      ['puzzle/core/geometry.ts', true, false, ''],
      ['three', false, false, '*'],
      ['puzzle/mechanics/index.ts', false, true, '*'],
      ['puzzle/core/types.ts', true, false, ''],
      ['puzzle/render/scene.ts', true, false, '']
    ]);
    // 同一批依賴放進矩陣：core 不得 import three / mechanics / render (即使只是型別)
    expect(matrixViolations(ds)).toEqual([
      'puzzle/core/fake.ts:6 → three (bare module not allowed in core)',
      'puzzle/core/fake.ts:7 → puzzle/mechanics/index.ts (core → mechanics forbidden)',
      'puzzle/core/fake.ts:9 → puzzle/render/scene.ts (core → render forbidden)'
    ]);
    expect(forbiddenGlobals('core/x.ts', '// document.title, Date.now()\nconst s = "window";\nconst o = { document: 1 };\nconst t = Date.now() + Math.random();\nwindow.x = 1;'))
      .toEqual(['core/x.ts:4 Date.now', 'core/x.ts:4 Math.random', 'core/x.ts:5 window']);
    expect(layerOf('puzzle/main.ts')).toBe('app');
    expect(cycles(new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set(['a'])], ['d', new Set(['a'])]]))).toEqual(['a -> b -> c -> a']);
  });

  it('實際掃到的檔案與依賴數量合理 (防止掃描器空轉)', () => {
    expect(puzzleFiles.length).toBeGreaterThan(50);
    expect(deps.length).toBeGreaterThan(150);
    expect(new Set(puzzleFiles.map(f => layerOf(relative(SRC, f).split(sep).join('/'))))).toEqual(
      new Set(['app', 'audio', 'content', 'core', 'devtools', 'input', 'mechanics', 'meta', 'render', 'text', 'ui']));
  });

  it('依賴矩陣：無違規 (除已知例外)', () => {
    expect(matrixViolations(deps).filter(key => !isKnown({ rule: 'matrix', key }))).toEqual([]);
  });

  it('core / mechanics / content / meta / text / devtools 無 DOM 全域、無 Date.now / performance.now / Math.random', () => {
    expect(globalViolations(puzzleFiles).filter(key => !isKnown({ rule: 'globals', key }))).toEqual([]);
  });

  it('值匯入圖無環；mechanics 內部 (含型別) 無環；全圖 (含型別) 的環只有已知例外', () => {
    expect(cycles(graph(deps, d => !d.typeOnly))).toEqual([]);
    expect(cycles(graph(deps.filter(d => layerOf(d.file) === 'mechanics' && d.target !== null && layerOf(d.target) === 'mechanics'), () => true))).toEqual([]);
    expect(cycles(graph(deps, () => true)).filter(key => !isKnown({ rule: 'cycle', key }))).toEqual([]);
  });

  it('GTA 隔離：src/puzzle 不 import 外部專案檔；其餘 src 不 import src/puzzle', () => {
    expect(isolationViolations().filter(key => !isKnown({ rule: 'isolation', key }))).toEqual([]);
  });

  it('render 對 core 的值匯入只限查詢函式白名單', () => {
    expect(renderCoreViolations(deps).filter(key => !isKnown({ rule: 'renderCore', key }))).toEqual([]);
  });

  it('已知例外清單不擴大、不殘留：每筆都對應目前真的存在的違規，且筆數固定', () => {
    const now = allViolations();
    expect(KNOWN_EXCEPTIONS.filter(e => !now.some(v => v.rule === e.rule && v.key === e.key)).map(e => e.key)).toEqual([]);
    expect(KNOWN_EXCEPTIONS.every(e => e.reason.length > 0 && e.plan.length > 0)).toBe(true);
    expect(KNOWN_EXCEPTIONS.length).toBe(1); // 新增例外必須同時改這裡 (審查時一眼可見)
  });
});
