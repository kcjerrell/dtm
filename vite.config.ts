import { defineConfig, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths"
import { htmlInjectionPlugin } from "vite-plugin-html-injection";
import wasm from "vite-plugin-wasm";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    htmlInjectionPlugin({
      order: "pre",
      injections: [
        {
          name: "React Devtools",
          path: "./src/utils/reactDevtools.html",
          type: "raw",
          injectTo: "head",
          buildModes: "dev",
        },
      ],
    }),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler',
          ["@babel/plugin-proposal-decorators", { "version": "2023-11" }]
        ],
      }
    }),
    tsconfigPaths(),
    wasm(),
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
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
