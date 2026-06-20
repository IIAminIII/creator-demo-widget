import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
  preview: {
    allowedHosts: [".trycloudflare.com"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: "index.html",
        widget: "widget.html",
      },
    },
  },
});
