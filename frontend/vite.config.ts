import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendPort = process.env.BACKEND_PORT || "8001";
const backendTarget = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/static": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@radix-ui")) {
            return "radix-vendor";
          }
          if (
            id.includes("node_modules/react-markdown") ||
            id.includes("node_modules/remark-gfm") ||
            id.includes("node_modules/micromark") ||
            id.includes("node_modules/mdast")
          ) {
            return "markdown-vendor";
          }
          if (
            id.includes("node_modules/motion") ||
            id.includes("node_modules/@tanstack/react-virtual")
          ) {
            return "motion-virtual";
          }
        },
      },
    },
  },
});
