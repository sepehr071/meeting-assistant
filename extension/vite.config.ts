import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        offscreen: "src/offscreen.html",
      },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
