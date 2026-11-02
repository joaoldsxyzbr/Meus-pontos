import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend",
  // JSX transformado pelo esbuild embutido no Vite (runtime automático do React 19).
  esbuild: { jsx: "automatic" },
  publicDir: false,
  base: "./",
  build: {
    outDir: "../dist/frontend",
    emptyOutDir: true
  },
  server: { host: "127.0.0.1" }
});
