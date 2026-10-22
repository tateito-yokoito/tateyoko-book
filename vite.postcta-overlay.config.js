import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  css: { postcss: { plugins: [] } },
  build: {
    outDir: "postcta-overlay-dist",
    emptyOutDir: true,
    lib: {
      entry: "./postcta-overlay-main.jsx",
      formats: ["es"],
      fileName: "postcta-overlay",
      cssFileName: "postcta-overlay",
    },
  },
});
