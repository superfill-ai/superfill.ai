import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": resolve("src"),
        "@superfill/shared": resolve("../../packages/shared/src"),
        "@superfill/storage": resolve("../../packages/storage/src"),
      },
    },
    build: {
      outDir: "dist-electron/main",
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist-electron/preload",
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "dist-electron/renderer",
    },
    resolve: {
      alias: {
        "@": resolve("src/renderer"),
        "@superfill/ui": resolve("../../packages/ui/src"),
        "@superfill/shared": resolve("../../packages/shared/src"),
        "@superfill/storage": resolve("../../packages/storage/src"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
