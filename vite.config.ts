import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  plugins: [react()],
  publicDir: false,
  base: "/",
  build: {
    outDir: "../dist/app",
    emptyOutDir: true
  },
  server: { host: "127.0.0.1" }
});
