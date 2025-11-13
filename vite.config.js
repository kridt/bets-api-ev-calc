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
});
