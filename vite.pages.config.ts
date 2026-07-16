import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromProjectRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromProjectRoot("./github-pages"),
  base: "/note-reading-trainer/",
  publicDir: fromProjectRoot("./public"),
  plugins: [react()],
  css: {
    postcss: fromProjectRoot("./postcss.config.mjs"),
  },
  build: {
    outDir: fromProjectRoot("./out-pages"),
    emptyOutDir: true,
  },
});
