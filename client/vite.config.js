import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode }) => {
  const config = {
    plugins: [react(), tailwindcss()],
    build: { sourcemap: false },
  };

  if (command === "serve") {
    // Only the local API proxy needs the server port. Production frontend
    // builds must work without server code, server dependencies or API keys.
    const envRoot = fileURLToPath(new URL("../", import.meta.url));
    const port = Number(loadEnv(mode, envRoot, ["PORT"]).PORT || 4000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("PORT must be an integer between 1 and 65535.");
    }
    config.server = {
      port: 5173,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${port}` },
    };
  }

  return config;
});
