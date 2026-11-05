import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const { PORT = "3000" } = loadEnv(mode, projectRoot, "PORT");

  return {
    plugins: [react()],
    server: { proxy: { "/api": `http://127.0.0.1:${PORT}` } },
  };
});
