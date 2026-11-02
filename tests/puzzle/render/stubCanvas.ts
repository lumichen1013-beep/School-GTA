/** node 沒有 canvas：程序化紋理畫在吞掉所有呼叫的假 2D context 上 (同 coplanar.test.ts) */
export function stubCanvas(): void {
  const sink: unknown = new Proxy(function () { /* noop */ }, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink),
    apply: () => sink,
    set: () => true
  });
  (globalThis as { document?: unknown }).document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => sink })
  };
}
