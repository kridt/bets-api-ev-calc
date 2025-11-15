// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import apiPlugin from "./vite-plugin-api.js";

export default defineConfig({
  plugins: [apiPlugin(), react()],
  publicDir: 'public',
  server: {
    port: 5173,
  },
  // Explicitly define environment variable prefix (default is VITE_)
  envPrefix: 'VITE_',
  // Log loaded env vars during build for debugging
  build: {
    // Ensure environment variables are available at build time
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});
