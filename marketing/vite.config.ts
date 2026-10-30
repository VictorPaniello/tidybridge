/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 5173 is the app (frontend/); the API allows this origin as LANDING_URL
  server: { port: 5174 },
  plugins: [react()],
  build: {
    // Vite's multi-page mode: each HTML file is its own page. Vercel's
    // cleanUrls (vercel.json) serves privacy.html at /privacy.
    rollupOptions: {
      input: [
        "index.html",
        "privacy.html",
        "terms.html",
        "dpa.html",
        "en/index.html",
        "en/privacy.html",
        "en/terms.html",
        "en/dpa.html",
      ],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
