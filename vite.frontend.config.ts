import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  root: "frontend",
  plugins: [svelte()],
  publicDir: false,
  base: "./",
  build: {
    outDir: "../dist/svelte-pilot",
    emptyOutDir: true
  },
  server: { host: "127.0.0.1" }
});
