import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// build 完成後將 dist/sw.js 的快取版本佔位符替換為本次建置時間戳，確保每次部署清除舊快取
function injectServiceWorkerVersion(): Plugin {
  let outDir = 'dist';
  return {
    name: 'inject-sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = resolve(outDir, 'sw.js');
      if (!existsSync(swPath)) return;
      const source = readFileSync(swPath, 'utf-8');
      writeFileSync(swPath, source.replace('__SW_VERSION__', Date.now().toString(36)));
    }
  };
}

export default defineConfig({
  plugins: [injectServiceWorkerVersion()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false,
    allowedHosts: true
  },
  build: {
    rollupOptions: {
      output: {
        // three.js 獨立成 vendor chunk，遊戲程式更新時玩家不必重新下載引擎
        manualChunks: { three: ['three'] }
      }
    }
  }
});
