import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { staticPages } from './scripts/static-pages.mjs';

const fromProjectRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromProjectRoot("./github-pages"),
  // Relative assets keep both the repository URL and the custom apex domain
  // working during DNS propagation and after GitHub enables the redirect.
  base: "./",
  publicDir: fromProjectRoot("./public"),
  plugins: [react(), staticPages()],
  css: {
    postcss: fromProjectRoot("./postcss.config.mjs"),
  },
  build: {
    outDir: fromProjectRoot("./out-pages"),
    emptyOutDir: true,
  },
});
