import { defineConfig, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths"
import { htmlInjectionPlugin } from "vite-plugin-html-injection";
// import wasm from "vite-plugin-wasm";

// import { visualizer } from 'rollup-plugin-visualizer'

const host = process.env.TAURI_DEV_HOST;
const isMock = process.env.MOCK_TAURI === "true";
const reactDevtools = process.env.REACT_DEVTOOLS === "true";

const hmr = true

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: "./",
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks() {
          return 'app'
        }
      }
    }
  },
  plugins: [
    reactDevtools ? htmlInjectionPlugin({
      order: "pre",
      injections: [
        {
          name: "React Devtools",
          path: "./src/utils/reactDevtools.js",
          type: "js",
          injectTo: "head",
          buildModes: "dev",
        },
      ],
    }) : null,
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler',
          ["@babel/plugin-proposal-decorators", { "version": "2023-11" }]
        ],
      }
    }),
    tsconfigPaths(),
    // wasm(),
    // visualizer({ open: true }),
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      ...(isMock ? {
        "@tauri-apps/api/core": new URL("./src/mocks/tauri-core.ts", import.meta.url).pathname,
        "@tauri-apps/api/path": new URL("./src/mocks/tauri-path.ts", import.meta.url).pathname,
        "@tauri-apps/plugin-fs": new URL("./src/mocks/tauri-fs.ts", import.meta.url).pathname,
        "@tauri-store/valtio": new URL("./src/mocks/tauri-store.ts", import.meta.url).pathname,
        "@tauri-apps/plugin-dialog": new URL("./src/mocks/tauri-dialog.ts", import.meta.url).pathname,
        "@tauri-apps/plugin-shell": new URL("./src/mocks/tauri-shell.ts", import.meta.url).pathname,
        "@tauri-apps/plugin-opener": new URL("./src/mocks/tauri-opener.ts", import.meta.url).pathname,
        "@tauri-apps/plugin-process": new URL("./src/mocks/tauri-process.ts", import.meta.url).pathname,
        "@tauri-apps/plugin-updater": new URL("./src/mocks/tauri-updater.ts", import.meta.url).pathname,
        "@tauri-apps/api/window": new URL("./src/mocks/tauri-window.ts", import.meta.url).pathname,
        "@tauri-apps/api/app": new URL("./src/mocks/tauri-app.ts", import.meta.url).pathname,
        "@tauri-apps/api/menu": new URL("./src/mocks/tauri-menu.ts", import.meta.url).pathname,
        "@tauri-apps/api/event": new URL("./src/mocks/tauri-event.ts", import.meta.url).pathname,
        "@tauri-apps/api": new URL("./src/mocks/tauri-api.ts", import.meta.url).pathname,
      } : {})
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
