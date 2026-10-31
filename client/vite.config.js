import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { env } from "../server/config/env.js";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${env.PORT}` },
  },
  build: { sourcemap: false },
});
